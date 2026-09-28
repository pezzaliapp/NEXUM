"""NEXUM WORLD writer: materializes normalized records into one shared world.

Objects, events and canonical relations; evidence for every statement;
provenance; claims; identifiers and aliases; navigation indexes (edges,
degrees, spatial R*Tree, full-text, aggregates, change log).

Nothing here depends on a domain: types, roles and enrichments come from the
vocabulary, sources from the registry.
"""

import json
import re
import unicodedata

from . import confidence as cf
from . import geo
from .ids import det_id
from .records import NormalizedRecord, Target
from .timeutil import month_index

AGG_KINDS = ("object", "event", "insight")
HUB_MIN = 100  # the degree table caches only large edge groups (hubs); smaller ones are counted on demand
TIMED_KINDS = ("event", "insight")


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[^0-9a-z]+", " ", s).strip()
    if s.startswith("the "):
        s = s[4:]
    return s


def _j(v) -> str:
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def version_key(v: str) -> str:
    """Sortable version: numbers are zero-padded so that '9' < '10'."""
    return v.zfill(20) if v.isdigit() else v


def periods_for(month: int | None) -> list[int]:
    if month is None:
        return [0]
    y, m = divmod(month, 12)
    return [0, y * 100, y * 100 + m + 1]


class World:
    def __init__(self, conn, types, sources, run_id=None, defer_indexes=False):
        self.conn = conn
        self.types = types
        self.sources = sources
        self.run_id = run_id
        self.defer_indexes = defer_indexes
        self.version = None
        self.changed: dict[str, set] = {"object": set(), "event": set(), "relation": set(), "insight": set()}
        self._area_cache: dict[str, object] = {}
        self._prov_seen: dict = {}

    # ── versions & change log ────────────────────────────────────────────────
    def begin(self):
        v = int(self.conn.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0]) + 1
        self.conn.execute("UPDATE meta SET value=? WHERE key='world_version'", (str(v),))
        self.version = v
        self.changed = {k: set() for k in self.changed}
        return v

    def log_change(self, kind, eid, op, at_ms):
        self.changed.setdefault(kind, set()).add(eid)
        if self.defer_indexes:
            return  # bulk load: changes_since() below the recorded floor requires a full reload
        self.conn.execute("INSERT INTO change_log(world_version, entity_kind, entity_id, op, at_ms) "
                          "VALUES(?,?,?,?,?)", (self.version, kind, eid, op, at_ms))

    # ── provenance ───────────────────────────────────────────────────────────
    def prov(self, activity, agent, inputs, at_ms) -> int:
        """Provenance handle: deterministic key (activity, agent, inputs) → compact integer."""
        key = det_id("prv", activity, agent, *[f"{k}:{i}:{loc or ''}" for k, i, loc in inputs])
        h = self._prov_seen.get(key)
        if h is not None:
            return h
        row = self.conn.execute("SELECT prov_id FROM provenance WHERE prov_key=?", (key,)).fetchone()
        if row:
            h = row[0]
        else:
            h = self.conn.execute("INSERT INTO provenance(prov_key, activity, agent, run_id, at_ms) VALUES(?,?,?,?,?)",
                                  (key, activity, agent, self.run_id, at_ms)).lastrowid
            self.conn.executemany("INSERT OR IGNORE INTO provenance_input VALUES(?,?,?,?)",
                                  [(h, k, i, loc) for k, i, loc in inputs])
        self._prov_seen[key] = h
        return h

    # ── records ──────────────────────────────────────────────────────────────
    def materialize(self, records, raw_row, connector_agent: str) -> int:
        """Materialize records parsed from one raw payload. Returns new record count."""
        fetched_ms = raw_row["fetched_ms"]
        prov_id = self.prov("ingest", connector_agent, [("raw", raw_row["raw_id"], None)], fetched_ms)
        n = 0
        for rec in records:
            if self._materialize_one(rec, raw_row, prov_id, connector_agent):
                n += 1
        return n

    def _materialize_one(self, rec: NormalizedRecord, raw_row, prov_id, agent) -> bool:
        src = self.sources[rec.source_id]
        record_id = det_id("rec", rec.source_id, rec.native_id, rec.native_version)
        at = raw_row["fetched_ms"]
        if rec.kind == "relation":
            if not self.conn.execute("INSERT OR IGNORE INTO record VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                     (record_id, rec.source_id, rec.native_id, rec.native_version, rec.kind,
                                      rec.type, raw_row["raw_id"], rec.raw_locator, None,
                                      _j(sorted(rec.quality_flags)) if rec.quality_flags else None, None)).rowcount:
                return False
            self._queue_assertion(record_id, None, None, None,
                                  {"kind": "relation_record", "type": rec.type, "subject": rec.subject.__dict__,
                                   "obj": rec.obj.__dict__, "attributes": rec.properties,
                                   "valid_from_ms": rec.valid_from_ms, "method": rec.method,
                                   "status": rec.status},
                                  src, rec.raw_locator, at, raw_row["raw_id"])
            return True

        et = self.types.entity(rec.type)
        if et.kind != rec.kind:
            raise ValueError(f"{rec.source_id}/{rec.native_id}: type {rec.type} is not a {rec.kind}")
        props = self.types.validate_props(rec.type, rec.properties)
        if et.geometry == "none" and rec.geometry is not None:
            raise ValueError(f"{rec.type} does not admit geometry")
        if self.conn.execute("SELECT 1 FROM record WHERE record_id=?", (record_id,)).fetchone():
            return False
        eid, how = self._resolve_entity(rec, et)
        self.conn.execute("INSERT INTO record VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                          (record_id, rec.source_id, rec.native_id, rec.native_version, rec.kind, rec.type,
                           raw_row["raw_id"], rec.raw_locator, None,
                           _j(sorted(rec.quality_flags)) if rec.quality_flags else None, eid))
        completeness = self.types.completeness(rec.type, props)
        ev_f = cf.evidence_factors(src.reliability, rec.method, rec.status, completeness)
        ev_c = cf.product(ev_f)
        # evidence: this record supports the entity
        self.conn.execute("INSERT OR IGNORE INTO evidence (supports_kind, supports_id, support_kind, support_id, role, method, source_id, independence_group, record_id, locator, distance_m, delta_t_ms, weight, factors_json, prov_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (rec.kind, eid, "record", record_id, "asserts", rec.method, rec.source_id,
                           src.independence_group, None, None, None, None, ev_c,
                           cf.dumps(cf.pack_product(ev_f)), prov_id))
        existing = self._entity_row(rec.kind, eid)
        newer = existing is None or (at, version_key(rec.native_version)) >= (
            existing["recorded_at_ms"] or 0, version_key(json.loads(existing["props_json"]).get("__version__", "")))
        self._write_claims(rec.kind, eid, et, props, record_id, at, prov_id, ev_c, fresh=existing is None)
        first_conf = None
        if existing is None:
            val, groups = cf.combine_groups([(src.independence_group, ev_c)])
            first_conf = (round(val, 12), cf.dumps(cf.pack_support(groups, 1)), cf.band(val))
        if newer:
            self._write_entity(rec, et, eid, props, existing, at, prov_id, first_conf)
        self._write_identifiers(rec, et, eid, prov_id)
        names = self._write_aliases(rec, et, eid)
        if existing is None:
            idents = " ".join(f"{s}:{v} {v}" for s, v in sorted((s, str(v)) for s, v in rec.identifiers
                                                                  if v not in (None, "")))
            self.index_text(rec.kind, eid, rec.type, rec.label, " ".join(sorted(n for n, _ in names)), idents,
                            rec.text or "")
        else:
            self._refresh_confidence(rec.kind, eid)
            self._index_search(rec.kind, eid, rec.text)
        if not self.defer_indexes:
            self._agg_delta(rec.kind, existing, -1)
            self._agg_delta(rec.kind, self._entity_row(rec.kind, eid), +1)
        self.log_change(rec.kind, eid, "insert" if existing is None else "update", at)
        for a in rec.assertions:
            self._queue_assertion(record_id, rec.kind, eid, rec.type,
                                  {"kind": a.kind, "type": a.type, "target": a.target.__dict__,
                                   "direction": a.direction, "attributes": a.attributes,
                                   "method": rec.method, "status": rec.status},
                                  src, rec.raw_locator, at, raw_row["raw_id"])
        return True

    # ── entity resolution ────────────────────────────────────────────────────
    def _resolve_entity(self, rec, et):
        strong = [(s, str(v)) for s, v in rec.identifiers if s in et.identity_schemes and v not in (None, "")]
        for scheme in et.identity_schemes:
            for s, v in strong:
                if s != scheme:
                    continue
                row = self.conn.execute(
                    "SELECT entity_id FROM identifier WHERE scheme=? AND value=? AND strong=1 AND entity_kind=? "
                    "ORDER BY entity_id LIMIT 1", (s, v, rec.kind)).fetchone()
                if row:
                    return row[0], "identifier"
        prefix = "obj" if rec.kind == "object" else "evt"
        for scheme in et.identity_schemes:
            for s, v in strong:
                if s == scheme:
                    eid = det_id(prefix, rec.type, s, v)
                    if et.name_match:
                        self._propose_by_name(rec, eid)
                    return eid, "new"
        eid = det_id(prefix, rec.type, "native", rec.source_id, rec.native_id)
        if et.name_match:
            self._propose_by_name(rec, eid)
        return eid, "new"

    def _propose_by_name(self, rec, eid):
        n = norm_name(rec.label)
        if not n:
            return
        for (other,) in self.conn.execute("SELECT DISTINCT entity_id FROM alias WHERE entity_type=? AND alias_norm=? "
                                          "AND entity_id<>? ORDER BY entity_id", (rec.type, n, eid)).fetchall():
            a, b = sorted((eid, other))
            cid = det_id("mrg", a, b)
            pid = self.prov("resolve_entity", "core:name_match", [("object", a, None), ("object", b, None)], None)
            self.conn.execute("INSERT OR IGNORE INTO merge_candidate VALUES(?,?,?,?,?,?,?,?)",
                              (cid, rec.kind, a, b, 0.9, _j({"reason": "same normalized name", "name": n}),
                               "proposed", pid))

    def _entity_row(self, kind, eid):
        if kind == "object":
            return self.conn.execute("SELECT * FROM object WHERE object_id=?", (eid,)).fetchone()
        return self.conn.execute("SELECT * FROM event WHERE event_id=?", (eid,)).fetchone()

    # ── entity rows ──────────────────────────────────────────────────────────
    def _write_entity(self, rec, et, eid, props, existing, at, prov_id, first_conf=None):
        g = rec.geometry
        lon = lat = x0 = x1 = y0 = y1 = cx = cy = None
        if g is not None:
            lon, lat = geo.representative_point(g)
            if not geo.valid_lonlat(lon, lat):
                raise ValueError(f"{rec.source_id}/{rec.native_id}: invalid coordinates")
            x0, x1, y0, y1 = geo.bbox(g)
            cx, cy = geo.cell(lon, lat, geo.MAX_LEVEL)
        pj = dict(props)
        pj["__version__"] = rec.native_version
        if rec.kind == "object":
            self.conn.execute(
                "INSERT INTO object VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(object_id) DO UPDATE SET type=excluded.type, label=excluded.label, "
                "geometry=excluded.geometry, lon=excluded.lon, lat=excluded.lat, min_lon=excluded.min_lon, "
                "max_lon=excluded.max_lon, min_lat=excluded.min_lat, max_lat=excluded.max_lat, "
                "geo_uncertainty_m=excluded.geo_uncertainty_m, cx=excluded.cx, cy=excluded.cy, "
                "valid_from_ms=excluded.valid_from_ms, valid_to_ms=excluded.valid_to_ms, status=excluded.status, "
                "props_json=excluded.props_json, source_id=excluded.source_id, prov_id=excluded.prov_id, "
                "recorded_at_ms=excluded.recorded_at_ms, world_version=excluded.world_version",
                (eid, rec.type, rec.label, _j(g) if g else None, lon, lat, x0, x1, y0, y1, rec.geo_uncertainty_m,
                 cx, cy, rec.valid_from_ms, rec.valid_to_ms, rec.status, None, _j(pj), rec.source_id,
                 first_conf[2] if first_conf else 0, first_conf[0] if first_conf else None,
                 first_conf[1] if first_conf else None, prov_id, at, self.version))
        else:
            sev = self.types.severity(rec.type, props)
            self.conn.execute(
                "INSERT INTO event VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(event_id) DO UPDATE SET type=excluded.type, label=excluded.label, "
                "t_start_ms=excluded.t_start_ms, t_end_ms=excluded.t_end_ms, t_precision=excluded.t_precision, "
                "t_uncertainty_s=excluded.t_uncertainty_s, month=excluded.month, geometry=excluded.geometry, "
                "lon=excluded.lon, lat=excluded.lat, min_lon=excluded.min_lon, max_lon=excluded.max_lon, "
                "min_lat=excluded.min_lat, max_lat=excluded.max_lat, geo_uncertainty_m=excluded.geo_uncertainty_m, "
                "cx=excluded.cx, cy=excluded.cy, severity=excluded.severity, status=excluded.status, "
                "props_json=excluded.props_json, source_id=excluded.source_id, prov_id=excluded.prov_id, "
                "recorded_at_ms=excluded.recorded_at_ms, world_version=excluded.world_version",
                (eid, rec.type, rec.label, rec.t_start_ms, rec.t_end_ms, rec.t_precision, rec.t_uncertainty_s,
                 month_index(rec.t_start_ms), _j(g) if g else None, lon, lat, x0, x1, y0, y1,
                 rec.geo_uncertainty_m, cx, cy, sev, rec.status, _j(pj), rec.source_id,
                 first_conf[2] if first_conf else 0, first_conf[0] if first_conf else None,
                 first_conf[1] if first_conf else None, prov_id, at, self.version))
        self._index_space(rec.kind, eid, g, x0, x1, y0, y1)

    def ensure_rid(self, kind, eid) -> int:
        """Stable integer handle of an entity (R*Tree and full-text rowid)."""
        row = self.conn.execute("SELECT rid FROM rid_map WHERE entity_id=?", (eid,)).fetchone()
        if row:
            return row[0]
        return self.conn.execute("INSERT INTO rid_map(entity_kind, entity_id) VALUES(?,?)", (kind, eid)).lastrowid

    def _index_space(self, kind, eid, g, x0, x1, y0, y1):
        table = {"object": "object_rtree", "event": "event_rtree", "insight": "insight_rtree"}[kind]
        rid = self.ensure_rid(kind, eid)
        if g is None:
            self.conn.execute(f"DELETE FROM {table} WHERE rid=?", (rid,))
            return
        self.conn.execute(f"INSERT OR REPLACE INTO {table} VALUES(?,?,?,?,?)", (rid, x0, x1, y0, y1))

    def index_text(self, kind, eid, etype, label, aliases, identifiers, text):
        rid = self.ensure_rid(kind, eid)
        self.conn.execute("DELETE FROM search_fts WHERE rowid=?", (rid,))
        self.conn.execute("INSERT INTO search_fts(rowid, label, aliases, identifiers, text) VALUES(?,?,?,?,?)",
                          (rid, label, aliases, identifiers, text))

    def _write_claims(self, kind, eid, et, props, record_id, at, prov_id, conf, fresh=False):
        for prop in sorted(props):
            v = props[prop]
            if v is None:
                continue  # a missing value is not a claim
            cur = [] if fresh else self.conn.execute(
                "SELECT claim_id, value_json FROM claim WHERE subject_id=? AND property=? AND superseded_by IS NULL",
                (eid, prop)).fetchall()
            vj = _j(v)
            if any(c["value_json"] == vj for c in cur):
                continue
            cid = det_id("clm", eid, prop, vj, record_id)
            unit = et.properties[prop].unit
            self.conn.execute("INSERT OR IGNORE INTO claim VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (cid, kind, eid, prop, vj, unit, None, None, at, record_id, conf, None,
                               prov_id, self.version))
            for c in cur:
                self.conn.execute("UPDATE claim SET superseded_by=? WHERE subject_id=? AND property=? AND claim_id=?",
                                  (cid, eid, prop, c["claim_id"]))

    def _write_identifiers(self, rec, et, eid, prov_id):
        for s, v in rec.identifiers:
            if v in (None, ""):
                continue
            v = str(v)
            strong = 1 if s in et.identity_schemes else 0
            if strong:
                other = self.conn.execute("SELECT entity_id FROM identifier WHERE scheme=? AND value=? AND strong=1 "
                                          "AND entity_kind=? AND entity_id<>?", (s, v, rec.kind, eid)).fetchone()
                if other:
                    strong = 0  # ambiguous: keep the first entity as the strong holder
            self.conn.execute("INSERT OR IGNORE INTO identifier VALUES(?,?,?,?,?,?,?)",
                              (s, v, rec.kind, eid, strong, rec.source_id, prov_id))

    def _write_aliases(self, rec, et, eid):
        names = ([(rec.label, "label")] if et.name_match else []) + [(a, "source") for a in rec.aliases if a]
        extra = self.types.aliases.get(rec.type, {})
        for s, v in rec.identifiers:
            for a in extra.get(f"{s}:{v}", []):
                names.append((a, "vocab"))
        for name, origin in names:
            n = norm_name(name)
            if n:
                self.conn.execute("INSERT OR IGNORE INTO alias VALUES(?,?,?,?,?)", (eid, n, name, rec.type, origin))
        return names

    def _refresh_confidence(self, kind, eid):
        rows = self.conn.execute("SELECT independence_group, weight FROM evidence WHERE supports_kind=? "
                                 "AND supports_id=?", (kind, eid)).fetchall()
        val, groups = cf.combine_groups((r[0], r[1]) for r in rows)
        f = cf.pack_support(groups, len(rows))
        table, key = ("object", "object_id") if kind == "object" else ("event", "event_id")
        self.conn.execute(f"UPDATE {table} SET confidence=?, factors_json=?, band=? WHERE {key}=?",
                          (round(val, 12), cf.dumps(f), cf.band(val), eid))

    def _index_search(self, kind, eid, text=""):
        row = self._entity_row(kind, eid)
        aliases = " ".join(r[0] for r in self.conn.execute("SELECT alias FROM alias WHERE entity_id=? "
                                                           "ORDER BY alias_norm", (eid,)))
        idents = " ".join(f"{s}:{v} {v}" for s, v in self.conn.execute(
            "SELECT scheme, value FROM identifier WHERE entity_id=? ORDER BY scheme, value", (eid,)))
        self.index_text(kind, eid, row["type"], row["label"], aliases, idents, text or "")

    # ── assertions (relations, participations) ───────────────────────────────
    def _queue_assertion(self, record_id, subj_kind, subj_id, subj_type, a, src, locator, at, raw_id):
        p = {"record_id": record_id, "subject_kind": subj_kind, "subject_id": subj_id, "source_id": src.id,
             "locator": locator, "recorded_at_ms": at, "raw_id": raw_id}
        if self._apply_assertion(p, a):
            return
        pa_id = det_id("pas", record_id, _j(a))
        self.conn.execute("INSERT OR IGNORE INTO pending_assertion VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                          (pa_id, record_id, subj_kind, subj_id, subj_type, _j(a), src.id,
                           src.independence_group, locator, at, "unresolved"))

    def resolve_target(self, t: dict):
        """Returns (entity_kind, entity_id, method) or None."""
        ttype = t["type"]
        tkind = self.types.kind_of(ttype)
        if t.get("scheme") and t.get("value") not in (None, ""):
            table, key = ("object", "object_id") if tkind == "object" else ("event", "event_id")
            rows = self.conn.execute(f"SELECT i.entity_id, i.strong FROM identifier i JOIN {table} t ON t.{key}=i.entity_id "
                                     f"WHERE i.scheme=? AND i.value=? AND i.entity_kind=? AND t.type=? "
                                     f"ORDER BY i.strong DESC, i.entity_id",
                                     (t["scheme"], str(t["value"]), tkind, ttype)).fetchall()
            strong = sorted({r[0] for r in rows if r[1]})
            ids = strong or sorted({r[0] for r in rows})
            if len(ids) == 1:
                return tkind, ids[0], "asserted"
            if len(ids) > 1:
                return None
        if t.get("name"):
            n = norm_name(t["name"])
            ids = {r[0] for r in self.conn.execute(
                "SELECT entity_id FROM alias WHERE entity_type=? AND alias_norm=?", (ttype, n))}
            if n:
                phrase = '"' + n.replace('"', "") + '"'
                for (eid,) in self.conn.execute(
                        "SELECT m.entity_id FROM search_fts f JOIN rid_map m ON m.rid=f.rowid "
                        "WHERE search_fts MATCH ? LIMIT 200", (f"label : {phrase}",)):
                    row = self._entity_row(tkind, eid)
                    if row is not None and row["type"] == ttype and norm_name(row["label"]) == n:
                        ids.add(eid)
            ids = sorted(ids)
            if len(ids) == 1:
                return tkind, ids[0], "resolved_by_name"
        return None

    def _type_matches(self, kind, eid, ttype):
        row = self._entity_row(kind, eid)
        return row is not None and row["type"] == ttype

    def _apply_assertion(self, p, a) -> bool:
        """Apply one assertion if its endpoints resolve. Returns False when still unresolved."""
        src = self.sources[p["source_id"]]
        raw_id = (p["raw_id"] if "raw_id" in p.keys() else None) or self.conn.execute("SELECT raw_id FROM record WHERE record_id=?",
                                                      (p["record_id"],)).fetchone()[0]
        self._assert_prov = self.prov("assert", f"source:{src.id}", [("raw", raw_id, None)], p["recorded_at_ms"])
        if a["kind"] == "relation_record":
            s = self.resolve_target(a["subject"])
            o = self.resolve_target(a["obj"])
            if not s or not o:
                return False
            method = "resolved_by_name" if "resolved_by_name" in (s[2], o[2]) else a.get("method", "asserted")
            self.add_relation(a["type"], s[0], s[1], o[0], o[1], "asserted", a.get("attributes") or {},
                              a.get("valid_from_ms"), "record", p["record_id"], src, method,
                              a.get("status", "reviewed"), p["locator"], p["recorded_at_ms"],
                              ftype=a["subject"]["type"], ttype=a["obj"]["type"])
            return True
        tgt = self.resolve_target(a["target"])
        if not tgt:
            return False
        method = "resolved_by_name" if tgt[2] == "resolved_by_name" else a.get("method", "asserted")
        if a["kind"] == "relation":
            if a.get("direction", "out") == "out":
                f, t = (p["subject_kind"], p["subject_id"]), (tgt[0], tgt[1])
            else:
                f, t = (tgt[0], tgt[1]), (p["subject_kind"], p["subject_id"])
            self.add_relation(a["type"], f[0], f[1], t[0], t[1], "asserted", a.get("attributes") or {},
                              None, "record", p["record_id"], src, method, a.get("status", "reviewed"),
                              p["locator"], p["recorded_at_ms"])
        elif a["kind"] == "participation":
            self.add_participation(p["subject_id"], tgt[1], a["type"], "asserted", None, "record",
                                   p["record_id"], src, method, a.get("status", "reviewed"),
                                   p["locator"], p["recorded_at_ms"])
        elif a["kind"] == "relation_evidence":
            # the record's entity (e.g. an event) is evidence for a relation between two other entities
            to = self.resolve_target(a["attributes"]["to"])
            if not to:
                return False
            self.add_relation(a["type"], tgt[0], tgt[1], to[0], to[1], "asserted", {}, None,
                              p["subject_kind"], p["subject_id"], src, method, a.get("status", "reviewed"),
                              p["locator"], p["recorded_at_ms"])
        else:
            raise ValueError(f"unknown assertion kind {a['kind']}")
        return True

    def resolve_pending(self) -> int:
        """Retry every pending assertion in deterministic order. Returns resolved count."""
        done, last = 0, ""
        while True:
            rows = self.conn.execute("SELECT * FROM pending_assertion WHERE pa_id>? ORDER BY pa_id LIMIT 2000",
                                     (last,)).fetchall()
            if not rows:
                return done
            for p in rows:
                last = p["pa_id"]
                if self._apply_assertion(p, json.loads(p["assertion_json"])):
                    self.conn.execute("DELETE FROM pending_assertion WHERE pa_id=?", (p["pa_id"],))
                    done += 1

    def _endpoint_type(self, kind, eid):
        return self._entity_row(kind, eid)["type"]

    def add_relation(self, rtype, fkind, fid, tkind, tid, derivation, attributes, valid_from_ms,
                     support_kind, support_id, src, method, status, locator, at, distance_m=None,
                     group=None, source_id=None, reliability=None, ftype=None, ttype=None):
        rt = self.types.relation(rtype)
        self.types.check_relation(rtype, ftype or self._endpoint_type(fkind, fid), ttype or self._endpoint_type(tkind, tid))
        rid = det_id("rel", rtype, fid, tid, valid_from_ms)
        new = self.conn.execute("SELECT 1 FROM relation WHERE relation_id=?", (rid,)).fetchone() is None
        agent = f"source:{src.id}" if src else "core:enrichment"
        if derivation == "asserted" and getattr(self, "_assert_prov", None):
            pid = self._assert_prov
        else:
            pid = self.prov("compute_relation", agent, [(support_kind, support_id, locator)], at)
        grp = group or (src.independence_group if src else "nexum.computed")
        rel = reliability if reliability is not None else (src.reliability if src else 1.0)
        f = cf.evidence_factors(rel, method, status, 1.0)
        w = cf.product(f)
        if new:
            val, groups = cf.combine_groups([(grp, w)])
            self.conn.execute("INSERT INTO relation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (rid, rtype, rt.nature, fkind, fid, tkind, tid, derivation,
                               _j(attributes) if attributes else None, valid_from_ms, None, 1, 1, round(val, 12),
                               cf.dumps(cf.pack_support(groups, 1)), pid, at, self.version))
            self._add_edge(fkind, fid, tkind, tid, "relation", rtype, rt.nature, rid, valid_from_ms, None)
            if not self.defer_indexes:
                self.conn.execute("INSERT INTO agg_rel VALUES(?,?,1) ON CONFLICT DO UPDATE SET n=n+1", (rtype, rt.nature))
        self.conn.execute("INSERT OR IGNORE INTO evidence (supports_kind, supports_id, support_kind, support_id, role, method, source_id, independence_group, record_id, locator, distance_m, delta_t_ms, weight, factors_json, prov_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          ("relation", rid, support_kind, support_id,
                           "asserts" if derivation == "asserted" else "computes", method,
                           source_id or (src.id if src else None), grp,
                           None, None if support_kind == "record" else locator, distance_m, None, w,
                           cf.dumps(cf.pack_product(f)), pid))
        if not new:
            rows = self.conn.execute("SELECT independence_group, weight, role FROM evidence WHERE supports_id=?",
                                     (rid,)).fetchall()
            val, groups = cf.combine_groups((r[0], r[1]) for r in rows)
            derivs = sorted({r[2] for r in rows})
            deriv = "asserted+computed" if len(derivs) > 1 else ("asserted" if derivs == ["asserts"] else "computed")
            self.conn.execute("UPDATE relation SET evidence_count=?, independent_groups=?, confidence=?, factors_json=?, "
                              "derivation=?, recorded_at_ms=MAX(recorded_at_ms, ?), world_version=? WHERE relation_id=?",
                              (len(rows), len(groups), round(val, 12), cf.dumps(cf.pack_support(groups, len(rows))),
                               deriv, at, self.version, rid))
        self.log_change("relation", rid, "insert" if new else "update", at)
        return rid

    def add_participation(self, event_id, object_id, role, derivation, distance_m, support_kind, support_id,
                          src, method, status, locator, at, group=None, source_id=None, reliability=None):
        et = self.types.entity(self._endpoint_type("event", event_id))
        if role not in et.roles:
            raise ValueError(f"role {role!r} not declared for {et.id}")
        key = det_id("par", event_id, object_id, role)
        agent = f"source:{src.id}" if src else "core:enrichment"
        if derivation == "asserted" and getattr(self, "_assert_prov", None):
            pid = self._assert_prov
        else:
            pid = self.prov("compute_relation", agent, [(support_kind, support_id, locator)], at)
        grp = group or (src.independence_group if src else "nexum.computed")
        rel = reliability if reliability is not None else (src.reliability if src else 1.0)
        f = cf.evidence_factors(rel, method, status, 1.0)
        w = cf.product(f)
        self.conn.execute("INSERT OR IGNORE INTO evidence (supports_kind, supports_id, support_kind, support_id, role, method, source_id, independence_group, record_id, locator, distance_m, delta_t_ms, weight, factors_json, prov_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          ("participation", key, support_kind, support_id,
                           "asserts" if derivation == "asserted" else "computes", method,
                           source_id or (src.id if src else None), grp,
                           None, None if support_kind == "record" else locator, distance_m, None, w,
                           cf.dumps(cf.pack_product(f)), pid))
        new = self.conn.execute("SELECT 1 FROM event_participant WHERE event_id=? AND object_id=? AND role=?",
                                (event_id, object_id, role)).fetchone() is None
        if new:
            val, groups = cf.combine_groups([(grp, w)])
            n_ev = 1
        else:
            rows = self.conn.execute("SELECT independence_group, weight FROM evidence WHERE supports_id=?",
                                     (key,)).fetchall()
            val, groups = cf.combine_groups((r[0], r[1]) for r in rows)
            n_ev = len(rows)
        self.conn.execute("INSERT INTO event_participant VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET "
                          "confidence=excluded.confidence, factors_json=excluded.factors_json",
                          (event_id, object_id, role, derivation, distance_m, round(val, 12),
                           cf.dumps(cf.pack_support(groups, n_ev)), pid, at))
        if new:
            t = self.conn.execute("SELECT t_start_ms FROM event WHERE event_id=?", (event_id,)).fetchone()[0]
            self._add_edge("event", event_id, "object", object_id, "participation", role, None, key, t, None)
            self.log_change("event", event_id, "update", at)

    def _add_edge(self, sk, sid, dk, did, ekind, etype, nature, ref, t_ms, conf):
        self.conn.execute("INSERT OR IGNORE INTO edge(src_id, edge_kind, type, dst_id, ref_id, nature, t_ms, confidence) "
                          "VALUES(?,?,?,?,?,?,?,?)", (sid, ekind, etype, did, ref, nature, t_ms, conf))
        if not self.defer_indexes:  # the degree table is a cache of hub counts: only existing rows are maintained
            self.conn.execute("UPDATE degree SET count=count+1 WHERE entity_id=? AND edge_kind=? AND type=? AND "
                              "direction='out'", (sid, ekind, etype))
            self.conn.execute("UPDATE degree SET count=count+1 WHERE entity_id=? AND edge_kind=? AND type=? AND "
                              "direction='in'", (did, ekind, etype))

    def remove_edges(self, ref_id, ekind):
        if ekind not in ("insight_member", "hypothesis"):
            raise ValueError("only insight edges are removable")
        for e in self.conn.execute(f"SELECT * FROM edge WHERE ref_id=? AND edge_kind='{ekind}'", (ref_id,)).fetchall():
            if not self.defer_indexes:
                self.conn.execute("UPDATE degree SET count=count-1 WHERE entity_id=? AND edge_kind=? AND type=? "
                                  "AND direction='out'", (e["src_id"], ekind, e["type"]))
                self.conn.execute("UPDATE degree SET count=count-1 WHERE entity_id=? AND edge_kind=? AND type=? "
                                  "AND direction='in'", (e["dst_id"], ekind, e["type"]))
        self.conn.execute(f"DELETE FROM edge WHERE ref_id=? AND edge_kind='{ekind}'", (ref_id,))
        if not self.defer_indexes:
            self.conn.execute("DELETE FROM degree WHERE count<=0 AND edge_kind=?", (ekind,))

    # ── declarative enrichments ──────────────────────────────────────────────
    def _areas(self, container_type):
        if container_type not in self._area_cache:
            areas = {}
            for r in self.conn.execute("SELECT object_id, geometry, source_id FROM object WHERE type=? AND "
                                       "geometry IS NOT NULL ORDER BY object_id", (container_type,)):
                g = json.loads(r["geometry"])
                if geo.is_areal(g):
                    areas[r["object_id"]] = (geo.PreparedArea(g), r["source_id"])
            self._area_cache[container_type] = areas
        return self._area_cache[container_type]

    def _candidate_containers(self, container_type, boxes):
        ids = set()
        for x0, x1, y0, y1 in boxes:
            for (eid,) in self.conn.execute(
                    "SELECT m.entity_id FROM object_rtree r CROSS JOIN rid_map m ON m.rid=r.rid CROSS JOIN object o "
                    "ON o.object_id=m.entity_id WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? "
                    "AND r.max_lat>=? AND o.type=?", (x1, x0, y1, y0, container_type)):
                ids.add(eid)
        return sorted(ids)

    def enrich(self, kinds_ids=None) -> int:
        """Apply vocabulary enrichments to the given (kind, id) pairs, or to all targets."""
        self._assert_prov = None
        n = 0
        for e in self.types.enrichments:
            areas = self._areas(e.container_type)
            if not areas:
                continue
            table, key = ("object", "object_id") if e.when_kind == "object" else ("event", "event_id")
            ph = ",".join("?" * len(e.when_types))
            if kinds_ids is None:
                rows = self.conn.execute(f"SELECT {key} AS id, lon, lat, geometry, recorded_at_ms FROM {table} "
                                         f"WHERE type IN ({ph}) AND geometry IS NOT NULL ORDER BY {key}",
                                         e.when_types).fetchall()
            else:
                ids = sorted(i for k, i in kinds_ids if k == e.when_kind)
                rows = []
                for chunk in range(0, len(ids), 500):
                    part = ids[chunk:chunk + 500]
                    rows += self.conn.execute(
                        f"SELECT {key} AS id, lon, lat, geometry, recorded_at_ms FROM {table} WHERE type IN ({ph}) "
                        f"AND geometry IS NOT NULL AND {key} IN ({','.join('?' * len(part))}) ORDER BY {key}",
                        [*e.when_types, *part]).fetchall()
            for r in rows:
                g = json.loads(r["geometry"])
                if g["type"] != "Point":
                    continue
                lon, lat = r["lon"], r["lat"]
                hits = [cid for cid in self._candidate_containers(e.container_type, [(lon, lon, lat, lat)])
                        if areas[cid][0].contains(lon, lat)]
                role, rtype, dist = e.role, e.relation_type, 0.0
                if not hits and e.fallback_nearest_km > 0:
                    best = None
                    for cid in self._candidate_containers(e.container_type,
                                                          geo.expand_point_km(lon, lat, e.fallback_nearest_km)):
                        d = areas[cid][0].distance_km(lon, lat)
                        if d <= e.fallback_nearest_km and (best is None or (d, cid) < best):
                            best = (d, cid)
                    if best:
                        hits, dist = [best[1]], best[0]
                        role, rtype = e.fallback_role, e.fallback_relation_type
                for cid in hits:
                    csrc = self.sources.get(areas[cid][1])
                    at = max(r["recorded_at_ms"] or 0, self.conn.execute(
                        "SELECT recorded_at_ms FROM object WHERE object_id=?", (cid,)).fetchone()[0] or 0)
                    if e.produce == "relation" and rtype:
                        self.add_relation(rtype, e.when_kind, r["id"], "object", cid, "computed", {}, None,
                                          "object", cid, None, "computed", "reviewed", f"enrichment:{e.id}", at,
                                          distance_m=dist * 1000.0,
                                          group=csrc.independence_group if csrc else "nexum.computed",
                                          source_id=csrc.id if csrc else None,
                                          reliability=csrc.reliability if csrc else None)
                        n += 1
                    elif e.produce == "participation" and role:
                        self.add_participation(r["id"], cid, role, "computed", dist * 1000.0, "object", cid,
                                               None, "computed", "reviewed", f"enrichment:{e.id}", at,
                                               group=csrc.independence_group if csrc else "nexum.computed",
                                               source_id=csrc.id if csrc else None,
                                               reliability=csrc.reliability if csrc else None)
                        n += 1
        return n

    # ── aggregates ───────────────────────────────────────────────────────────
    def _agg_delta(self, kind, row, sign):
        if self.defer_indexes or row is None:
            return
        if kind == "insight" and row["status"] != "active":
            return
        month = row["month"] if kind in TIMED_KINDS else None
        geo_flag = 1 if row["cx"] is not None else 0
        src = row["source_id"] if kind != "insight" else "nexum.correlation"
        b = row["band"] if row["band"] is not None else 0
        keys = []
        for period in periods_for(month):
            keys.append((-1, period, 0, 0))
            if geo_flag:
                for lvl in geo.AGG_LEVELS:
                    s = geo.MAX_LEVEL - lvl
                    keys.append((lvl, period, row["cx"] >> s, row["cy"] >> s))
        conf = row["confidence"] or 0.0
        for lvl, period, cx, cy in keys:
            self.conn.execute(
                "INSERT INTO agg VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET n=n+excluded.n, "
                "maxconf=MAX(maxconf, excluded.maxconf)",
                (lvl, period, cx, cy, kind, row["type"], src, b, geo_flag, sign, conf))
            if sign < 0:
                self.conn.execute("DELETE FROM agg WHERE level=? AND period=? AND cx=? AND cy=? AND kind=? AND type=? "
                                  "AND source=? AND band=? AND geo=? AND n<=0",
                                  (lvl, period, cx, cy, kind, row["type"], src, b, geo_flag))


def rebuild_indexes(conn):
    """Recompute degree and aggregate tables from scratch (bulk loads, rebuild)."""
    conn.execute("DELETE FROM degree")
    conn.execute(f"INSERT INTO degree SELECT src_id, edge_kind, type, 'out', COUNT(*) FROM edge "
                 f"GROUP BY src_id, edge_kind, type HAVING COUNT(*) >= {HUB_MIN}")
    conn.execute(f"INSERT INTO degree SELECT dst_id, edge_kind, type, 'in', COUNT(*) FROM edge "
                 f"GROUP BY dst_id, edge_kind, type HAVING COUNT(*) >= {HUB_MIN}")
    conn.execute("DELETE FROM agg_rel")
    conn.execute("INSERT INTO agg_rel SELECT type, nature, COUNT(*) FROM relation GROUP BY type, nature")
    conn.execute("DELETE FROM agg")
    sources = {
        "object": "SELECT 'object' AS kind, type, source_id AS src, COALESCE(band,0) AS band, cx, cy, NULL AS month, "
                  "confidence FROM object",
        "event": "SELECT 'event' AS kind, type, source_id AS src, COALESCE(band,0) AS band, cx, cy, month, "
                 "confidence FROM event",
        "insight": "SELECT 'insight' AS kind, type, 'nexum.correlation' AS src, COALESCE(band,0) AS band, cx, cy, "
                   "month, confidence FROM insight WHERE status='active'",
    }
    for kind, q in sources.items():
        periods = ["0"] if kind == "object" else ["0", "(month/12)*100", "(month/12)*100 + (month%12) + 1"]
        for pexpr in periods:
            cond = "" if pexpr == "0" else "WHERE month IS NOT NULL"
            conn.execute(f"INSERT INTO agg SELECT -1, {pexpr}, 0, 0, kind, type, src, band, "
                         f"CASE WHEN cx IS NULL THEN 0 ELSE 1 END, COUNT(*), MAX(COALESCE(confidence,0)) "
                         f"FROM ({q}) {cond} GROUP BY 2, 5, 6, 7, 8, 9")
            for lvl in geo.AGG_LEVELS:
                s = geo.MAX_LEVEL - lvl
                c2 = ("WHERE cx IS NOT NULL" if pexpr == "0" else "WHERE cx IS NOT NULL AND month IS NOT NULL")
                conn.execute(f"INSERT INTO agg SELECT {lvl}, {pexpr}, cx >> {s}, cy >> {s}, kind, type, src, band, 1, "
                             f"COUNT(*), MAX(COALESCE(confidence,0)) FROM ({q}) {c2} GROUP BY 2, 3, 4, 5, 6, 7, 8")
