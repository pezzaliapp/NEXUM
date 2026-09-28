"""Pipeline: SOURCE → RAW → NORMALIZATION → WORLD → ENRICHMENT → CORRELATION.

A `Nexum` instance is one local world (one SQLite file + one Raw Store),
configured by directories of sources, vocabularies and rules.
"""

import dataclasses
import importlib
import json
import pathlib
import time

from . import CORE_VERSION
from . import db as dbm
from .correlate import Engine, load_rules, register_rules
from .ids import ulid
from .raw import RawStore
from .registry import admissible, load_registry
from .scheduler import Deferred, Scheduler
from .types import load_types, type_rows
from .world import World, rebuild_indexes


@dataclasses.dataclass
class Config:
    root: str
    db_path: str
    raw_dir: str
    source_dirs: list
    vocab_dirs: list
    rule_dirs: list
    allow_fixture: bool = False


class Nexum:
    def __init__(self, cfg: Config, defer_indexes: bool = False, clock=time.time, sleep=time.sleep, opener=None):
        self.cfg = cfg
        self.root = pathlib.Path(cfg.root).resolve()
        pathlib.Path(cfg.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = dbm.connect(cfg.db_path, bulk=defer_indexes)
        dbm.create_schema(self.conn)
        self.types = load_types([self.root / d for d in cfg.vocab_dirs])
        self.sources = load_registry([self.root / d for d in cfg.source_dirs])
        self.rules = load_rules([self.root / d for d in cfg.rule_dirs])
        self.raw = RawStore(cfg.raw_dir)
        self.run_id = ulid()
        self.world = World(self.conn, self.types, self.sources, self.run_id, defer_indexes=defer_indexes)
        self.engine = Engine(self.conn, self.world, self.rules, self.sources)
        self.clock, self.sleep, self.opener = clock, sleep, opener
        self._register()

    # ── configuration into the database ──────────────────────────────────────
    def _register(self):
        c = self.conn
        c.execute("BEGIN")
        objs, evts, rels, props = type_rows(self.types)
        for table, rows in (("object_type", objs), ("event_type", evts), ("relation_type", rels),
                            ("property_def", props)):
            c.execute(f"DELETE FROM {table}")
            if rows:
                c.executemany(f"INSERT INTO {table} VALUES({','.join('?' * len(rows[0]))})", rows)
        for s in self.sources.values():
            c.execute("INSERT INTO source VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET "
                      "name=excluded.name, owner=excluded.owner, verdict=excluded.verdict, tier=excluded.tier, "
                      "license_id=excluded.license_id, license_url=excluded.license_url, "
                      "attribution=excluded.attribution, redistribution=excluded.redistribution, "
                      "commercial_use=excluded.commercial_use, independence_group=excluded.independence_group, "
                      "verified_at=excluded.verified_at, updates_mode=excluded.updates_mode, "
                      "registry_hash=excluded.registry_hash",
                      (s.id, s.name, s.owner, s.verdict, s.tier, s.license_id, s.license_url, s.attribution,
                       s.redistribution, s.commercial_use, s.independence_group, s.verified_at, s.updates_mode,
                       s.registry_hash))
        register_rules(c, self.rules)
        c.execute("INSERT INTO run VALUES(?,?,?,?,?,?,?)",
                  (self.run_id, "session", int(time.time() * 1000), None, CORE_VERSION,
                   json.dumps({"vocab": self.types.hash, "rules": {r.id: r.version for r in self.rules},
                               "sources": {s.id: s.registry_hash[:12] for s in self.sources.values()}},
                              sort_keys=True), None))
        c.execute("COMMIT")

    def connector(self, source):
        return importlib.import_module(source.connector)

    def _state(self, sid):
        r = self.conn.execute("SELECT state_json FROM connector_state WHERE source_id=?", (sid,)).fetchone()
        return json.loads(r[0]) if r else {}

    def _save_state(self, sid, st):
        self.conn.execute("INSERT INTO connector_state VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET "
                          "state_json=excluded.state_json, updated_ms=excluded.updated_ms",
                          (sid, json.dumps(st, sort_keys=True), int(time.time() * 1000)))

    # ── acquisition ──────────────────────────────────────────────────────────
    def fetch(self, source_ids=None, mode="incremental", max_rounds=50):
        """Plan and fetch through the Polite Scheduler. Returns a summary per source."""
        sched = Scheduler(self.conn, self.raw, self.sources, self.root, clock=self.clock, sleep=self.sleep,
                          opener=self.opener, run_id=self.run_id)
        out = {}
        for sid in source_ids or sorted(self.sources):
            s = self.sources[sid]
            ok, why = admissible(s, allow_fixture=self.cfg.allow_fixture)
            if not ok:
                out[sid] = {"skipped": why}
                continue
            mod = self.connector(s)
            summary = {"requests": 0, "new_raw": 0, "not_modified": 0, "deferred": 0}
            seen = set()
            for _ in range(max_rounds):
                state = self._state(sid)
                reqs = [r for r in mod.plan(mode, state, s) if r.resource_key not in seen]
                if not reqs:
                    break
                for req in reqs:
                    seen.add(req.resource_key)
                    try:
                        res = sched.fetch(s, req)
                    except Deferred as e:
                        summary["deferred"] += 1
                        summary.setdefault("notes", []).append(str(e))
                        continue
                    summary["requests"] += 1
                    summary["new_raw"] += int(res.new_raw)
                    summary["not_modified"] += int(res.not_modified)
                    info = None
                    if hasattr(mod, "page_info") and res.sha256:
                        info = mod.page_info(self.raw.get(res.sha256))
                    self._save_state(sid, mod.next_state(self._state(sid), req, info))
                if mode == "incremental":
                    break
            out[sid] = summary
        return out

    # ── processing ───────────────────────────────────────────────────────────
    def unprocessed_raws(self):
        return self.conn.execute(
            "SELECT r.* FROM raw_record r LEFT JOIN raw_processed p ON p.raw_id=r.raw_id WHERE p.raw_id IS NULL "
            "ORDER BY r.source_id, r.fetched_ms, r.sha256").fetchall()

    def process(self, correlate=True):
        """Materialize every unprocessed raw payload, then resolve, enrich and correlate incrementally."""
        stats = {"raws": 0, "records": 0, "by_source_s": {}}
        changed = {"object": set(), "event": set(), "relation": set(), "insight": set()}
        container_types = {e.container_type for e in self.types.enrichments}
        container_changed = False
        for raw_row in self.unprocessed_raws():
            s = self.sources.get(raw_row["source_id"])
            if s is None or not admissible(s, allow_fixture=self.cfg.allow_fixture)[0]:
                continue
            mod = self.connector(s)
            t_raw = time.perf_counter()
            data = self.raw.get(raw_row["sha256"])
            meta = {"source_id": s.id, "raw_id": raw_row["raw_id"], "url": raw_row["url"]}
            self.conn.execute("BEGIN")
            self.world.begin()
            n = self.world.materialize(mod.parse(data, meta), raw_row, f"{s.connector.rsplit('.', 1)[-1]}@{mod.VERSION}")
            self.conn.execute("INSERT INTO raw_processed VALUES(?,?,?,?)",
                              (raw_row["raw_id"], mod.VERSION, n, int(time.time() * 1000)))
            self.conn.execute("COMMIT")
            for k, v in self.world.changed.items():
                changed.setdefault(k, set()).update(v)
            stats["raws"] += 1
            stats["records"] += n
            stats["by_source_s"][s.id] = stats["by_source_s"].get(s.id, 0.0) + (time.perf_counter() - t_raw)
        for t in container_types:
            ph_ids = changed["object"]
            if ph_ids and self.conn.execute(
                    f"SELECT 1 FROM object WHERE type=? AND object_id IN ({','.join('?' * min(len(ph_ids), 900))}) "
                    "LIMIT 1", (t, *sorted(ph_ids)[:900])).fetchone():
                container_changed = True
        self.conn.execute("BEGIN")
        self.world.begin()
        t_res = time.perf_counter()
        stats["resolved"] = self.world.resolve_pending()
        stats["resolve_s"] = time.perf_counter() - t_res
        self.world._area_cache.clear()
        t_enr = time.perf_counter()
        if container_changed:
            stats["enriched"] = self.world.enrich(None)
        else:
            pairs = [("object", i) for i in changed["object"]] + [("event", i) for i in changed["event"]]
            stats["enriched"] = self.world.enrich(pairs)
        stats["enrich_s"] = time.perf_counter() - t_enr
        self.conn.execute("COMMIT")
        for k, v in self.world.changed.items():
            changed.setdefault(k, set()).update(v)
        if self.world.defer_indexes:
            self.conn.execute("BEGIN")
            rebuild_indexes(self.conn)
            dbm.set_meta(self.conn, "changelog_floor", self.world.version)
            self.conn.execute("COMMIT")
        if correlate:
            t_cor = time.perf_counter()
            stats["correlation"] = self.correlate(changed)
            stats["correlate_s"] = time.perf_counter() - t_cor
        return stats

    BATCH_FRACTION = 0.2  # above this share of changed elements, a batch pass is cheaper and gives identical results

    def correlate(self, changed=None):
        if changed is not None:
            n_changed = sum(len(v) for v in changed.values())
            n_world = sum(self.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                          for t in ("object", "event", "relation"))
            if n_world and n_changed > self.BATCH_FRACTION * n_world:
                changed = None
        self.conn.execute("BEGIN")
        self.world.begin()
        st = self.engine.run(changed)
        self.conn.execute("COMMIT")
        if self.world.defer_indexes:
            self.conn.execute("BEGIN")
            rebuild_indexes(self.conn)
            dbm.set_meta(self.conn, "changelog_floor", self.world.version)
            self.conn.execute("COMMIT")
        return st

    def compact(self) -> dict:
        """Standard SQLite maintenance after a build: checkpoint and VACUUM. Returns sizes in bytes."""
        import os
        path = self.cfg.db_path
        self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        before = os.path.getsize(path)
        self.conn.execute("VACUUM")
        self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        return {"before_bytes": before, "after_bytes": os.path.getsize(path)}

    def close(self):
        self.conn.execute("UPDATE run SET ended_ms=?, outcome='closed' WHERE run_id=?",
                          (int(time.time() * 1000), self.run_id))
        self.conn.close()


def rebuild(cfg_old: Config, new_db_path: str, defer_indexes=False) -> "Nexum":
    """Recreate the world in a fresh database from the Raw Store manifest and the configuration."""
    cfg = dataclasses.replace(cfg_old, db_path=new_db_path)
    p = pathlib.Path(new_db_path)
    for suffix in ("", "-wal", "-shm"):
        q = pathlib.Path(str(p) + suffix)
        if q.exists():
            q.unlink()
    nx = Nexum(cfg, defer_indexes=defer_indexes)
    nx.conn.execute("BEGIN")
    for e in nx.raw.read_manifest():
        if e["source_id"] in nx.sources:
            nx.conn.execute("INSERT OR IGNORE INTO raw_record VALUES(:raw_id,:source_id,:sha256,:codec,:size,:url,"
                            ":resource_key,:fetched_ms,:http_status,:etag,:last_modified,:content_type,:path)", e)
    nx.conn.execute("COMMIT")
    nx.process(correlate=False)
    nx.correlate(None)
    return nx
