"""Query contract: one world, many views.

Every operation receives the same Scope, honours a Budget, returns stable
EntityRefs and never returns the whole world. MAP, GRAPH, TIMELINE, SEARCH and
the detail views are projections of the same NEXUM WORLD.
"""

import heapq
import json
import re
import time
from dataclasses import dataclass, field

from . import confidence as cf
from . import geo
from .ids import det_id
from .timeutil import DAY, HOUR, month_index, month_start_ms, to_iso

KIND_BY_PREFIX = {"obj": "object", "evt": "event", "rel": "relation", "ins": "insight"}
TABLE = {"object": ("object", "object_id"), "event": ("event", "event_id"),
         "relation": ("relation", "relation_id"), "insight": ("insight", "insight_id")}
LIMITS = {"max_items": (500, 5000), "max_nodes": (200, 2000), "max_edges": (400, 4000),
          "max_bytes": (2_000_000, 10_000_000)}
LODS = ("auto", "counts", "aggregates", "refs", "details")
BAND_FLOOR = {0: 0.0, 1: 0.5, 2: 0.8}
LOCAL_Z = 10            # from this zoom the map uses the exact viewport (no aggregation grid snapping)
RANK_LIMIT = 20_000     # above this number of matching documents, search results are returned unranked


class QueryError(ValueError):
    pass


def kind_of(eid: str) -> str:
    k = KIND_BY_PREFIX.get(eid.split("_", 1)[0])
    if k is None:
        raise QueryError(f"unknown entity id {eid!r}")
    return k


@dataclass
class Scope:
    mode: str = "world"
    focus: str | None = None
    types: list | None = None
    natures: list | None = None
    time_window: list | None = None      # [from_ms, to_ms]
    as_of_recorded: int | None = None
    viewport: list | None = None         # [min_lon, min_lat, max_lon, max_lat]
    z: int | None = None
    min_confidence: float = 0.0
    sources: list | None = None
    status: list | None = None
    text: str | None = None

    @staticmethod
    def of(d) -> "Scope":
        if d is None:
            return Scope()
        if isinstance(d, Scope):
            return d
        s = Scope(**{k: v for k, v in d.items() if k in Scope.__dataclass_fields__})
        if s.mode not in ("world", "focus"):
            raise QueryError("scope.mode must be 'world' or 'focus'")
        if s.mode == "focus" and not s.focus:
            raise QueryError("scope.focus is required in focus mode")
        return s


@dataclass
class Budget:
    max_items: int = LIMITS["max_items"][0]
    max_nodes: int = LIMITS["max_nodes"][0]
    max_edges: int = LIMITS["max_edges"][0]
    max_bytes: int = LIMITS["max_bytes"][0]
    lod: str = "auto"

    @staticmethod
    def of(d) -> "Budget":
        if d is None:
            return Budget()
        if isinstance(d, Budget):
            b = d
        else:
            b = Budget(**{k: v for k, v in d.items() if k in Budget.__dataclass_fields__})
        for k, (_, hi) in LIMITS.items():
            v = getattr(b, k)
            if not isinstance(v, int) or v <= 0:
                raise QueryError(f"budget.{k} must be a positive integer")
            setattr(b, k, min(v, hi))
        if b.lod not in LODS:
            raise QueryError(f"invalid lod {b.lod!r}")
        return b


def _largest_list(x):
    """(container, key, length) of the largest list inside a JSON-like tree, measured in serialized bytes."""
    best = (None, None, 0, -1)

    def walk(node):
        nonlocal best
        items = node.items() if isinstance(node, dict) else enumerate(node) if isinstance(node, list) else ()
        for k, v in items:
            if isinstance(v, list) and v:
                sz = len(json.dumps(v, default=str))
                if sz > best[3]:
                    best = (node, k, len(v), sz)
            if isinstance(v, (dict, list)):
                walk(v)
    walk(x)
    return best[0], best[1], best[2]


def attributions(conn, sources) -> list[dict]:
    """Attribution file for every source that supports at least one element of the world."""
    used = [r[0] for r in conn.execute("SELECT DISTINCT source_id FROM evidence WHERE source_id IS NOT NULL "
                                       "ORDER BY source_id")]
    return [{"source_id": s, "name": sources[s].name, "attribution": sources[s].attribution,
             "license_id": sources[s].license_id, "license_url": sources[s].license_url} for s in used if s in sources]


class Query:
    def __init__(self, conn, sources=None, world_version_fn=None):
        self.conn = conn
        self.sources = sources or {}

    # ── envelope ─────────────────────────────────────────────────────────────
    def _world_version(self):
        return int(self.conn.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0])

    def _envelope(self, data, t0, budget, lod="details", total=None, returned=None, truncated=False,
                  cursor_next=None, excluded=None, facets=None, highlight=None, sources=None, list_key=None,
                  as_of=None, extra=None):
        env = {"data": data, "lod": lod, "total": total, "returned": returned, "truncated": bool(truncated),
               "cursor_next": cursor_next, "excluded": excluded or {}, "facets": facets, "highlight": highlight,
               "sources": sources if sources is not None else self._sources_summary(data),
               "world_version": self._world_version(), "as_of": as_of or {}, "timing_ms": 0}
        if extra:
            env.update(extra)
        # byte budget: halve the largest list anywhere in the response until it fits
        size = len(json.dumps(env, default=str))
        while size > budget.max_bytes:
            holder, key, n = _largest_list(env["data"])
            if holder is None or n == 0:
                break
            holder[key] = holder[key][: n // 2]
            env["truncated"] = True
            if list_key and isinstance(data, dict) and isinstance(data.get(list_key), list):
                env["returned"] = len(data[list_key])
            size = len(json.dumps(env, default=str))
        env["bytes"] = size
        env["timing_ms"] = int((time.perf_counter() - t0) * 1000)
        return env

    def _sources_summary(self, data):
        ids = set()

        def walk(x):
            if isinstance(x, dict):
                sid = x.get("source_id")
                if isinstance(sid, str) and sid in self.sources:
                    ids.add(sid)
                for v in x.values():
                    walk(v)
            elif isinstance(x, list):
                for v in x:
                    walk(v)
        walk(data)
        return [{"source_id": s, "attribution": self.sources[s].attribution, "license_id": self.sources[s].license_id}
                for s in sorted(ids)]

    # ── entity helpers ───────────────────────────────────────────────────────
    def _row(self, kind, eid):
        table, key = TABLE[kind]
        return self.conn.execute(f"SELECT * FROM {table} WHERE {key}=?", (eid,)).fetchone()

    def ref(self, kind, eid, row=None):
        row = row or self._row(kind, eid)
        if row is None:
            return None
        if kind == "relation":
            return {"kind": kind, "id": eid, "type": row["type"], "label": row["type"]}
        return {"kind": kind, "id": eid, "type": row["type"], "label": row["label"]}

    def _ref_min(self, kind, row):
        """Ref + minimal geometry + time + confidence (LOD 'refs')."""
        key = TABLE[kind][1]
        r = {"kind": kind, "id": row[key], "type": row["type"], "label": row["label"],
             "confidence": row["confidence"], "source_id": row["source_id"] if kind != "insight" else None}
        if row["lon"] is not None:
            r["point"] = [row["lon"], row["lat"]]
        if kind in ("event", "insight"):
            r["t"] = row["t_start_ms"]
        return r

    def _props(self, row):
        p = json.loads(row["props_json"]) if row["props_json"] else {}
        p.pop("__version__", None)
        return p

    def _require(self, eid):
        kind = kind_of(eid)
        row = self._row(kind, eid)
        if row is None:
            raise QueryError(f"entity {eid} not found")
        return kind, row

    # ── get_entity ───────────────────────────────────────────────────────────
    def get_entity(self, eid, lod="details"):
        t0 = time.perf_counter()
        kind, row = self._require(eid)
        return self._envelope(self._details(kind, row, lod), t0, Budget.of(None), lod=lod, total=1, returned=1)

    def _details(self, kind, row, lod="details"):
        eid = row[TABLE[kind][1]]
        base = self.ref(kind, eid, row)
        if lod == "refs":
            return base
        d = dict(base)
        d["confidence"] = row["confidence"]
        d["confidence_factors"] = cf.expand(json.loads(row["factors_json"])) if row["factors_json"] else None
        if kind in ("object", "event"):
            d["status"] = row["status"]
            d["properties"] = self._props(row)
            d["source_id"] = row["source_id"]
            d["geometry"] = json.loads(row["geometry"]) if row["geometry"] else None
            d["geo_uncertainty_m"] = row["geo_uncertainty_m"]
            d["identifiers"] = [{"scheme": s, "value": v, "strong": bool(st)} for s, v, st in self.conn.execute(
                "SELECT scheme, value, strong FROM identifier WHERE entity_id=? ORDER BY scheme, value", (eid,))]
            d["aliases"] = [a for (a,) in self.conn.execute("SELECT alias FROM alias WHERE entity_id=? ORDER BY alias_norm",
                                                            (eid,))][:50]
            d["degree"] = [{"edge_kind": k, "type": t, "direction": dr, "count": n} for k, t, dr, n in self._groups(eid)]
            d["conflicts"] = [{"property": p, "values": n} for p, n in self.conn.execute(
                "SELECT property, COUNT(DISTINCT value_json) FROM claim WHERE subject_id=? AND superseded_by IS NULL "
                "GROUP BY property HAVING COUNT(DISTINCT value_json) > 1", (eid,))]
            d["recorded_at_ms"] = row["recorded_at_ms"]
        if kind == "event":
            d.update({"t_start_ms": row["t_start_ms"], "t_end_ms": row["t_end_ms"], "t_precision": row["t_precision"],
                      "t_uncertainty_s": row["t_uncertainty_s"], "time": to_iso(row["t_start_ms"]),
                      "severity": row["severity"]})
            d["participants"] = [
                {"object": self.ref("object", o), "role": r, "derivation": dv, "distance_m": dm, "confidence": c}
                for o, r, dv, dm, c in self.conn.execute(
                    "SELECT object_id, role, derivation, distance_m, confidence FROM event_participant WHERE event_id=? "
                    "ORDER BY role, object_id", (eid,))]
        if kind == "relation":
            d.update({"nature": row["nature"], "from": self.ref(row["from_kind"], row["from_id"]),
                      "to": self.ref(row["to_kind"], row["to_id"]), "derivation": row["derivation"],
                      "evidence_count": row["evidence_count"], "independent_sources": row["independent_groups"],
                      "attributes": json.loads(row["attributes_json"] or "{}")})
        if kind == "insight":
            d.update({"insight_kind": row["kind"], "rule_id": row["rule_id"], "rule_version": row["rule_version"],
                      "explanation": row["explanation"], "confidence_text": row["confidence_text"],
                      "status": row["status"], "superseded_by": row["superseded_by"],
                      "t_start_ms": row["t_start_ms"], "t_end_ms": row["t_end_ms"],
                      "bbox": [row["min_lon"], row["min_lat"], row["max_lon"], row["max_lat"]]
                      if row["min_lon"] is not None else None})
            d["members"] = self._insight_members(eid)
        return d

    def _insight_members(self, iid):
        out = []
        for sk, sid, role, dm, dt, w, src in self.conn.execute(
                "SELECT support_kind, support_id, role, distance_m, delta_t_ms, weight, source_id FROM evidence "
                "WHERE supports_kind='insight' AND supports_id=? ORDER BY role, support_id", (iid,)):
            out.append({"role": role, "ref": self.ref(sk, sid), "distance_km": None if dm is None else dm / 1000.0,
                        "delta_t_ms": dt, "member_confidence": w, "source_id": src})
        return out

    # ── relations & related ──────────────────────────────────────────────────
    def relations(self, eid, scope=None, budget=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        self._require(eid)
        groups = {}
        q = ("SELECT r.*, 'out' AS dir FROM edge e JOIN relation r ON r.relation_id=e.ref_id WHERE e.src_id=? AND "
             "e.edge_kind='relation' UNION ALL SELECT r.*, 'in' AS dir FROM edge e JOIN relation r ON "
             "r.relation_id=e.ref_id WHERE e.dst_id=? AND e.edge_kind='relation' ORDER BY type, dir, relation_id")
        total = 0
        for r in self.conn.execute(q, (eid, eid)):
            if sc.natures and r["nature"] not in sc.natures:
                continue
            if sc.min_confidence and (r["confidence"] or 0) < sc.min_confidence:
                continue
            total += 1
            g = groups.setdefault((r["type"], r["nature"], r["dir"]), {"type": r["type"], "nature": r["nature"],
                                                                         "direction": r["dir"], "count": 0, "items": []})
            g["count"] += 1
            if len(g["items"]) < min(bu.max_items, 50):
                other = (r["to_kind"], r["to_id"]) if r["dir"] == "out" else (r["from_kind"], r["from_id"])
                g["items"].append({"relation": {"kind": "relation", "id": r["relation_id"], "type": r["type"],
                                                "label": r["type"]},
                                   "other": self.ref(*other), "confidence": r["confidence"],
                                   "evidence_count": r["evidence_count"], "independent_sources": r["independent_groups"],
                                   "derivation": r["derivation"]})
        data = {"groups": list(groups.values())}
        returned = sum(len(g["items"]) for g in data["groups"])
        return self._envelope(data, t0, bu, lod="refs", total=total, returned=returned, truncated=returned < total)

    def _related_event_ids(self, kind, eid):
        """Events related to an element, with the reason of the link (deterministic order)."""
        out = {}
        if kind == "object":
            for ev, role in self.conn.execute("SELECT src_id, type FROM edge WHERE dst_id=? AND edge_kind='participation'",
                                              (eid,)):
                out.setdefault(ev, f"participation:{role}")
        elif kind == "event":
            for (o,) in self.conn.execute("SELECT object_id FROM event_participant WHERE event_id=?", (eid,)):
                for ev, role in self.conn.execute(
                        "SELECT src_id, type FROM edge WHERE dst_id=? AND edge_kind='participation' AND src_id<>? "
                        "LIMIT 5000", (o, eid)):
                    out.setdefault(ev, f"shares_participant:{o}")
        for (iid,) in self.conn.execute("SELECT e.supports_id FROM evidence e JOIN insight i ON i.insight_id=e.supports_id "
                                        "WHERE e.supports_kind='insight' AND e.support_id=? AND i.status='active'", (eid,)):
            for sk, sid in self.conn.execute("SELECT support_kind, support_id FROM evidence WHERE supports_kind='insight' "
                                             "AND supports_id=?", (iid,)):
                if sk == "event" and sid != eid:
                    out.setdefault(sid, f"insight:{iid}")
        return out

    # columns needed to filter, sort and reference related events (bulk fetch, see _event_rows)
    _EVENT_REF_COLS = ("event_id", "type", "label", "t_start_ms", "confidence", "source_id", "lon", "lat",
                       "recorded_at_ms", "status")

    def _event_rows(self, ids):
        """Rows of many events in one statement per 20,000 ids (instead of one statement per event)."""
        ids = list(ids)
        cols = ", ".join(self._EVENT_REF_COLS)
        out = {}
        for i in range(0, len(ids), 20000):
            for r in self.conn.execute(f"SELECT {cols} FROM event WHERE event_id IN (SELECT value FROM json_each(?))",
                                       (json.dumps(ids[i:i + 20000]),)):
                out[r["event_id"]] = r
        return out

    def _related_with_rows(self, kind, eid):
        """(related event ids with reasons, their rows): derived data, cached for the last element and world version
        (context() asks for it twice: related events and timeline)."""
        key = (kind, eid, self._world_version())
        cached = getattr(self, "_related_cache", None)
        if cached is not None and cached[0] == key:
            return cached[1], cached[2]
        rel = self._related_event_ids(kind, eid)
        fetched = self._event_rows(rel)
        self._related_cache = (key, rel, fetched)
        return rel, fetched

    def related_events(self, eid, scope=None, budget=None, cursor=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        kind, _ = self._require(eid)
        rel, fetched = self._related_with_rows(kind, eid)
        rows = []
        for ev in rel:
            r = fetched.get(ev)
            if r is None or not self._scope_ok("event", r, sc):
                continue
            rows.append(r)
        by_type = {}
        for r in rows:
            by_type[r["type"]] = by_type.get(r["type"], 0) + 1
        start = 0 if cursor is None else int(cursor)
        # partial sort: identical to sorted(rows)[start:start + n] (event ids are unique, so keys never tie)
        page = heapq.nsmallest(start + bu.max_items, rows, key=lambda r: (-(r["t_start_ms"] or 0), r["event_id"]))[start:]
        items = [dict(self._ref_min("event", r), reason=rel[r["event_id"]]) for r in page]
        nxt = str(start + len(page)) if start + len(page) < len(rows) else None
        return self._envelope({"items": items, "counts_by_type": by_type}, t0, bu, lod="refs", total=len(rows),
                              returned=len(items), truncated=nxt is not None, cursor_next=nxt, list_key="items")

    def related_objects(self, eid, scope=None, budget=None, cursor=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        kind, _ = self._require(eid)
        rel = {}
        if kind == "event":
            for o, role in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?", (eid,)):
                rel.setdefault(o, f"participation:{role}")
        for q in ("SELECT dst_id, type FROM edge WHERE src_id=? AND edge_kind='relation' AND dst_id LIKE 'obj\\_%' ESCAPE '\\'",
                  "SELECT src_id, type FROM edge WHERE dst_id=? AND edge_kind='relation' AND src_id LIKE 'obj\\_%' ESCAPE '\\'"):
            for o, t in self.conn.execute(q, (eid,)):
                rel.setdefault(o, f"relation:{t}")
        for (iid,) in self.conn.execute("SELECT e.supports_id FROM evidence e JOIN insight i ON i.insight_id=e.supports_id "
                                        "WHERE e.supports_kind='insight' AND e.support_id=? AND i.status='active'", (eid,)):
            for sk, sid in self.conn.execute("SELECT support_kind, support_id FROM evidence WHERE supports_kind='insight' "
                                             "AND supports_id=?", (iid,)):
                if sk == "object" and sid != eid:
                    rel.setdefault(sid, f"insight:{iid}")
        rows = [r for r in (self._row("object", o) for o in sorted(rel)) if r is not None and self._scope_ok("object", r, sc)]
        rows.sort(key=lambda r: (-(r["confidence"] or 0), r["object_id"]))
        by_type = {}
        for r in rows:
            by_type[r["type"]] = by_type.get(r["type"], 0) + 1
        start = 0 if cursor is None else int(cursor)
        page = rows[start:start + bu.max_items]
        items = [dict(self._ref_min("object", r), reason=rel[r["object_id"]]) for r in page]
        nxt = str(start + len(page)) if start + len(page) < len(rows) else None
        return self._envelope({"items": items, "counts_by_type": by_type}, t0, bu, lod="refs", total=len(rows),
                              returned=len(items), truncated=nxt is not None, cursor_next=nxt, list_key="items")

    def _scope_ok(self, kind, row, sc: Scope) -> bool:
        if sc.types and row["type"] not in sc.types:
            return False
        if sc.min_confidence and (row["confidence"] or 0) < sc.min_confidence:
            return False
        if sc.sources and kind != "insight" and row["source_id"] not in sc.sources:
            return False
        if sc.time_window and kind in ("event", "insight"):
            t = row["t_start_ms"]
            if t is None or not (sc.time_window[0] <= t <= sc.time_window[1]):
                return False
        if sc.as_of_recorded is not None and kind != "insight" and (row["recorded_at_ms"] or 0) > sc.as_of_recorded:
            return False
        if sc.status and row["status"] not in sc.status:
            return False
        return True

    # ── evidence traversal ───────────────────────────────────────────────────
    def _support_ref(self, sk, sid):
        if sk == "record":
            r = self.conn.execute("SELECT r.*, w.url, w.fetched_ms, w.sha256 FROM record r JOIN raw_record w "
                                  "ON w.raw_id=r.raw_id WHERE r.record_id=?", (sid,)).fetchone()
            return {"kind": "record", "id": sid, "source_id": r["source_id"], "native_id": r["native_id"],
                    "native_version": r["native_version"], "locator": r["raw_locator"], "raw_id": r["raw_id"],
                    "raw_sha256": r["sha256"], "raw_url": r["url"], "fetched_ms": r["fetched_ms"],
                    "quality_flags": json.loads(r["quality_flags"] or "[]")}
        if sk in TABLE:
            return self.ref(sk, sid)
        return {"kind": sk, "id": sid}

    def evidence_of(self, eid, budget=None):
        t0 = time.perf_counter()
        bu = Budget.of(budget)
        kind = KIND_BY_PREFIX.get(eid.split("_", 1)[0], "participation")
        rows = self.conn.execute("SELECT * FROM evidence WHERE supports_id=? ORDER BY support_id, role", (eid,)).fetchall()
        items = []
        for e in rows[: bu.max_items]:
            items.append({"evidence_id": det_id("evd", e["supports_id"], e["support_id"], e["role"]),
                          "role": e["role"], "method": e["method"],
                          "support": self._support_ref(e["support_kind"], e["support_id"]),
                          "source_id": e["source_id"], "independence_group": e["independence_group"],
                          "weight": e["weight"], "distance_km": None if e["distance_m"] is None else e["distance_m"] / 1000,
                          "delta_t_ms": e["delta_t_ms"],
                          "factors": cf.expand(json.loads(e["factors_json"])) if e["factors_json"] else None})
        groups = sorted({e["independence_group"] for e in rows if e["independence_group"]})
        supporting_events = [i["support"] for i in items if i["support"].get("kind") == "event"]
        data = {"supports": {"kind": kind, "id": eid}, "items": items, "independent_groups": groups,
                "independent_sources": len(groups), "supporting_events": supporting_events}
        return self._envelope(data, t0, bu, lod="refs", total=len(rows), returned=len(items),
                              truncated=len(items) < len(rows), list_key="items")

    def supported(self, eid, budget=None):
        """What this element (or source, or record) supports."""
        t0 = time.perf_counter()
        bu = Budget.of(budget)
        if eid in self.sources:
            q = self.conn.execute("SELECT supports_kind, supports_id, role FROM evidence WHERE source_id=? "
                                  "ORDER BY supports_id LIMIT ?", (eid, bu.max_items + 1)).fetchall()
            total = self.conn.execute("SELECT COUNT(*) FROM evidence WHERE source_id=?", (eid,)).fetchone()[0]
        else:
            q = self.conn.execute("SELECT supports_kind, supports_id, role FROM evidence WHERE support_id=? "
                                  "ORDER BY supports_id LIMIT ?", (eid, bu.max_items + 1)).fetchall()
            total = self.conn.execute("SELECT COUNT(*) FROM evidence WHERE support_id=?", (eid,)).fetchone()[0]
        items = []
        for k, i, role in q[: bu.max_items]:
            ref = self.ref(k, i) if k in TABLE else {"kind": k, "id": i}
            items.append({"ref": ref, "role": role})
        return self._envelope({"items": items}, t0, bu, lod="refs", total=total, returned=len(items),
                              truncated=len(items) < total, list_key="items")

    def sources_of(self, eid):
        t0 = time.perf_counter()
        chain = self._chain(eid, depth=0, max_depth=6, seen=set(), collect_only=True)
        ids = sorted(chain)
        data = {"items": [{"source_id": s, "name": self.sources[s].name, "owner": self.sources[s].owner,
                           "attribution": self.sources[s].attribution, "license_id": self.sources[s].license_id,
                           "license_url": self.sources[s].license_url, "tier": self.sources[s].tier,
                           "independence_group": self.sources[s].independence_group} for s in ids if s in self.sources]}
        return self._envelope(data, t0, Budget.of(None), lod="refs", total=len(ids), returned=len(ids))

    def _chain(self, eid, depth, max_depth, seen, collect_only=False):
        """Provenance tree of an element, down to raw payloads and licences."""
        if eid in seen or depth > max_depth:
            return set() if collect_only else {"ref": {"id": eid}, "cycle_or_depth_limit": True}
        seen.add(eid)
        srcs = set()
        node = {"ref": self.ref(kind_of(eid), eid) if eid.split("_", 1)[0] in KIND_BY_PREFIX else {"id": eid, "kind": "participation"},
                "evidence": []}
        for e in self.conn.execute("SELECT * FROM evidence WHERE supports_id=? ORDER BY support_id, role", (eid,)):
            item = {"role": e["role"], "method": e["method"], "source_id": e["source_id"]}
            if e["source_id"]:
                srcs.add(e["source_id"])
            if e["support_kind"] == "record":
                rec = self._support_ref("record", e["support_id"])
                s = self.sources.get(rec["source_id"])
                item["record"] = rec
                item["licence"] = {"source_id": rec["source_id"], "license_id": s.license_id if s else None,
                                   "license_url": s.license_url if s else None,
                                   "attribution": s.attribution if s else None,
                                   "verified_at": s.verified_at if s else None}
                srcs.add(rec["source_id"])
            elif e["support_kind"] in TABLE:
                sub = self._chain(e["support_id"], depth + 1, max_depth, seen, collect_only)
                if collect_only:
                    srcs |= sub
                else:
                    item["chain"] = sub
            node["evidence"].append(item)
        return srcs if collect_only else node

    def provenance_chain(self, eid):
        t0 = time.perf_counter()
        kind_of(eid)
        tree = self._chain(eid, 0, 6, set())
        complete = self._chain_complete(tree)
        return self._envelope({"chain": tree, "complete": complete}, t0, Budget.of(None), lod="details",
                              sources=None)

    def _chain_complete(self, node) -> bool:
        """True if every leaf reaches a raw payload with a licence."""
        if node.get("cycle_or_depth_limit"):
            return True
        ev = node.get("evidence", [])
        if not ev:
            return False
        for item in ev:
            if "record" in item:
                if not (item["record"].get("raw_sha256") and item["licence"].get("license_id")):
                    return False
            elif "chain" in item:
                if not self._chain_complete(item["chain"]):
                    return False
            elif item.get("method") == "computed" and item.get("source_id") is None:
                return False
        return True

    # ── insights ─────────────────────────────────────────────────────────────
    def get_insight(self, iid):
        t0 = time.perf_counter()
        row = self._row("insight", iid)
        if row is None:
            raise QueryError(f"insight {iid} not found")
        d = self._details("insight", row)
        d["components"] = []
        for m in d["members"]:
            if m["ref"] and m["ref"]["kind"] == "insight":
                sub = self._row("insight", m["ref"]["id"])
                d["components"].append({"ref": m["ref"], "explanation": sub["explanation"],
                                        "members": self._insight_members(m["ref"]["id"])})
        d["sources"] = self.sources_of(iid)["data"]["items"]
        return self._envelope(d, t0, Budget.of(None), lod="details", total=1, returned=1)

    def insights(self, scope=None, budget=None, cursor=None, rule_id=None, member=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        where, args = ["status='active'"], []
        if sc.status:
            where = [f"status IN ({','.join('?' * len(sc.status))})"]
            args += sc.status
        if rule_id:
            where.append("rule_id=?")
            args.append(rule_id)
        if sc.types:
            where.append(f"type IN ({','.join('?' * len(sc.types))})")
            args += sc.types
        if sc.min_confidence:
            where.append("confidence>=?")
            args.append(sc.min_confidence)
        if sc.time_window:
            where.append("t_start_ms BETWEEN ? AND ?")
            args += list(sc.time_window)
        if member:
            # direct membership, plus insights built on top of those (e.g. composites): one level of transitivity
            where.append("(insight_id IN (SELECT supports_id FROM evidence WHERE supports_kind='insight' AND support_id=?) "
                         "OR insight_id IN (SELECT e2.supports_id FROM evidence e2 WHERE e2.supports_kind='insight' AND "
                         "e2.support_id IN (SELECT supports_id FROM evidence WHERE supports_kind='insight' AND "
                         "support_id=?)))")
            args += [member, member]
        if sc.viewport:
            x0, y0, x1, y1 = sc.viewport
            where.append("min_lon<=? AND max_lon>=? AND min_lat<=? AND max_lat>=?")
            args += [x1, x0, y1, y0]
        total = self.conn.execute(f"SELECT COUNT(*) FROM insight WHERE {' AND '.join(where)}", args).fetchone()[0]
        if cursor:
            c, i = cursor.split("|")
            where.append("(confidence < ? OR (confidence = ? AND insight_id > ?))")
            args += [float(c), float(c), i]
        rows = self.conn.execute(f"SELECT * FROM insight WHERE {' AND '.join(where)} ORDER BY confidence DESC, insight_id "
                                 f"LIMIT ?", (*args, bu.max_items + 1)).fetchall()
        page = rows[: bu.max_items]
        items = [{"ref": self.ref("insight", r["insight_id"], r), "insight_kind": r["kind"], "rule_id": r["rule_id"],
                  "confidence": r["confidence"], "confidence_text": r["confidence_text"],
                  "explanation": r["explanation"], "t_start_ms": r["t_start_ms"]} for r in page]
        nxt = f"{page[-1]['confidence']}|{page[-1]['insight_id']}" if len(rows) > bu.max_items else None
        return self._envelope({"items": items}, t0, bu, lod="refs", total=total, returned=len(items),
                              truncated=nxt is not None, cursor_next=nxt, list_key="items")

    # ── graph traversal ──────────────────────────────────────────────────────
    def _edge_confidence(self, r):
        """Edges do not copy confidences: read them from the canonical row."""
        if r["confidence"] is not None:
            return r["confidence"]
        if r["edge_kind"] == "relation":
            x = self.conn.execute("SELECT confidence FROM relation WHERE relation_id=?", (r["ref_id"],)).fetchone()
        elif r["edge_kind"] == "participation":
            x = self.conn.execute("SELECT confidence FROM event_participant WHERE event_id=? AND object_id=? AND role=?",
                                  (r["src_id"], r["dst_id"], r["type"])).fetchone()
        else:
            x = None
        return x[0] if x else None

    def _groups(self, eid):
        """(edge_kind, type, direction, count) groups of a node. Distinct groups are found by index seeks
        (skip-scan); counts come from the hub cache when present, otherwise they are counted."""
        cache = {(k, t, d): n for k, t, d, n in self.conn.execute(
            "SELECT edge_kind, type, direction, count FROM degree WHERE entity_id=?", (eid,))}
        out = []
        for direction, col in (("out", "src_id"), ("in", "dst_id")):
            last = ("", "")
            while True:
                r = self.conn.execute(f"SELECT edge_kind, type FROM edge WHERE {col}=? AND (edge_kind, type) > (?, ?) "
                                      f"ORDER BY edge_kind, type LIMIT 1", (eid, *last)).fetchone()
                if r is None:
                    break
                last = (r[0], r[1])
                n = cache.get((r[0], r[1], direction))
                if n is None:
                    n = self.conn.execute(f"SELECT COUNT(*) FROM edge WHERE {col}=? AND edge_kind=? AND type=?",
                                          (eid, r[0], r[1])).fetchone()[0]
                out.append((r[0], r[1], direction, n))
        return sorted(out)

    def _edges_of(self, eid, limit_per_group, sc: Scope):
        """Edges of a node, both directions, at most `limit_per_group` per (edge_kind, type, direction)
        group; the remainder is reported as aggregated counts."""
        edges, aggregates = [], []
        for ek, et, dr, n in self._groups(eid):
            if sc.natures and ek == "relation":
                nat = self.conn.execute("SELECT nature FROM relation_type WHERE type_id=?", (et,)).fetchone()
                if nat and nat[0] not in sc.natures:
                    continue
            if dr == "out":
                rows = self.conn.execute("SELECT * FROM edge WHERE src_id=? AND edge_kind=? AND type=? ORDER BY dst_id "
                                         "LIMIT ?", (eid, ek, et, limit_per_group)).fetchall()
            else:
                rows = self.conn.execute("SELECT * FROM edge WHERE dst_id=? AND edge_kind=? AND type=? ORDER BY src_id "
                                         "LIMIT ?", (eid, ek, et, limit_per_group)).fetchall()
            for r in rows:
                edges.append((dr, r))
            if n > len(rows):
                aggregates.append({"edge_kind": ek, "type": et, "direction": dr, "count": n,
                                   "shown": len(rows), "remaining": n - len(rows)})
        return edges, aggregates

    def neighborhood(self, focus, depth=1, scope=None, budget=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        depth = max(1, min(int(depth), 3))
        kind, _ = self._require(focus)
        nodes = {focus: dict(self.ref(kind, focus), depth=0)}
        edges, agg_nodes, seen_edges = [], [], set()
        frontier = [focus]
        truncated = False
        per_group = max(3, bu.max_nodes // 20)
        for d in range(1, depth + 1):
            nxt = []
            for nid in frontier:
                es, aggs = self._edges_of(nid, per_group, sc)
                for a in aggs:
                    agg_id = f"agg:{nid}:{a['edge_kind']}:{a['type']}:{a['direction']}"
                    agg_nodes.append(dict(a, id=agg_id, anchor=nid, kind="aggregate"))
                    truncated = True
                for dr, r in es:
                    other = r["dst_id"] if dr == "out" else r["src_id"]
                    other_kind = kind_of(other)
                    ek = (r["src_id"], r["dst_id"], r["edge_kind"], r["type"], r["ref_id"])
                    if other not in nodes:
                        if len(nodes) >= bu.max_nodes:
                            truncated = True
                            continue
                        ref = self.ref(other_kind, other)
                        if ref is None:
                            continue
                        if sc.types and ref["type"] not in sc.types and other != focus:
                            continue
                        nodes[other] = dict(ref, depth=d)
                        nxt.append(other)
                    if ek not in seen_edges and len(edges) < bu.max_edges:
                        seen_edges.add(ek)
                        edges.append({"src": r["src_id"], "dst": r["dst_id"], "edge_kind": r["edge_kind"],
                                      "type": r["type"], "nature": r["nature"], "ref_id": r["ref_id"],
                                      "confidence": self._edge_confidence(r)})
                    elif ek not in seen_edges:
                        truncated = True
            frontier = nxt
        data = {"focus": focus, "nodes": list(nodes.values()), "edges": edges, "aggregates": agg_nodes}
        return self._envelope(data, t0, bu, lod="refs", total=None, returned=len(nodes), truncated=truncated,
                              list_key="edges")

    def expand(self, node, edge_kind, etype, direction="out", budget=None, cursor=None):
        t0 = time.perf_counter()
        bu = Budget.of(budget)
        col, other = ("src_id", "dst") if direction == "out" else ("dst_id", "src")
        args = [node, edge_kind, etype]
        cond = ""
        if cursor:
            cond = f" AND {other}_id > ?"
            args.append(cursor)
        rows = self.conn.execute(f"SELECT * FROM edge WHERE {col}=? AND edge_kind=? AND type=?{cond} "
                                 f"ORDER BY {other}_id LIMIT ?", (*args, bu.max_nodes + 1)).fetchall()
        page = rows[: bu.max_nodes]
        total = next((n for k, t, d, n in self._groups(node) if (k, t, d) == (edge_kind, etype, direction)), 0)
        items = [{"node": self.ref(kind_of(r[f"{other}_id"]), r[f"{other}_id"]),
                  "edge": {"src": r["src_id"], "dst": r["dst_id"], "edge_kind": r["edge_kind"], "type": r["type"],
                           "ref_id": r["ref_id"], "confidence": self._edge_confidence(r)}} for r in page]
        nxt = page[-1][f"{other}_id"] if len(rows) > bu.max_nodes else None
        return self._envelope({"items": items}, t0, bu, lod="refs", total=total, returned=len(items),
                              truncated=nxt is not None, cursor_next=nxt, list_key="items")

    def _neighbors(self, eid, cap=5000):
        out = []
        for (d,) in self.conn.execute("SELECT dst_id FROM edge WHERE src_id=? LIMIT ?", (eid, cap)):
            out.append(d)
        for (s,) in self.conn.execute("SELECT src_id FROM edge WHERE dst_id=? LIMIT ?", (eid, cap)):
            out.append(s)
        return out

    def path(self, a, b, max_hops=4, visit_cap=200000):
        """Shortest path (bidirectional BFS) with a bounded exploration."""
        t0 = time.perf_counter()
        max_hops = max(1, min(int(max_hops), 4))
        self._require(a)
        self._require(b)
        if a == b:
            return self._envelope({"path": [self.ref(kind_of(a), a)], "hops": 0}, t0, Budget.of(None), lod="refs")
        pa, pb = {a: None}, {b: None}
        fa, fb = [a], [b]
        meet = None
        hops = 0
        while fa and fb and hops < max_hops and meet is None:
            if len(fa) <= len(fb):
                nxt = []
                for n in fa:
                    for m in self._neighbors(n):
                        if m not in pa:
                            pa[m] = n
                            nxt.append(m)
                            if m in pb:
                                meet = m
                                break
                    if meet:
                        break
                fa = nxt
            else:
                nxt = []
                for n in fb:
                    for m in self._neighbors(n):
                        if m not in pb:
                            pb[m] = n
                            nxt.append(m)
                            if m in pa:
                                meet = m
                                break
                    if meet:
                        break
                fb = nxt
            hops += 1
            if len(pa) + len(pb) > visit_cap:
                break
        if meet is None:
            return self._envelope({"path": None, "hops": None, "explored": len(pa) + len(pb)}, t0, Budget.of(None),
                                  lod="refs")
        left, n = [], meet
        while n is not None:
            left.append(n)
            n = pa[n]
        right, n = [], pb[meet]
        while n is not None:
            right.append(n)
            n = pb[n]
        ids = list(reversed(left)) + right
        return self._envelope({"path": [self.ref(kind_of(i), i) for i in ids], "hops": len(ids) - 1}, t0,
                              Budget.of(None), lod="refs")

    # ── spatial ──────────────────────────────────────────────────────────────
    def nearby(self, eid, km, scope=None, budget=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        kind, row = self._require(eid)
        if kind == "relation" or row["lon"] is None:
            return self._envelope({"not_applicable": "no geometry", "items": []}, t0, bu, lod="refs", total=0, returned=0)
        res = []
        for k in ("object", "event"):
            table, key = TABLE[k]
            rt = f"{k}_rtree"
            for x0, x1, y0, y1 in geo.expand_point_km(row["lon"], row["lat"], km):
                for r in self.conn.execute(f"SELECT t.* FROM {rt} q JOIN rid_map m ON m.rid=q.rid CROSS JOIN {table} t "
                                           f"ON t.{key}=m.entity_id WHERE q.min_lon<=? AND q.max_lon>=? AND q.min_lat<=? "
                                           f"AND q.max_lat>=?", (x1, x0, y1, y0)):
                    if r[key] == eid or not self._scope_ok(k, r, sc):
                        continue
                    d = geo.haversine_km(row["lon"], row["lat"], r["lon"], r["lat"])
                    if d <= km:
                        res.append((d, r[key], k, r))
        res = sorted({(d, i, k): r for d, i, k, r in res}.items())
        items = [dict(self._ref_min(k, r), distance_km=d) for (d, i, k), r in res[: bu.max_items]]
        return self._envelope({"items": items}, t0, bu, lod="refs", total=len(res), returned=len(items),
                              truncated=len(items) < len(res), list_key="items")

    def containing(self, eid):
        t0 = time.perf_counter()
        kind, row = self._require(eid)
        if kind == "relation" or row["lon"] is None:
            return self._envelope({"not_applicable": "no geometry", "items": []}, t0, Budget.of(None), lod="refs")
        items = []
        for r in self.conn.execute("SELECT o.* FROM object_rtree q CROSS JOIN rid_map m ON m.rid=q.rid CROSS JOIN object o "
                                   "ON o.object_id=m.entity_id WHERE q.min_lon<=? AND q.max_lon>=? AND q.min_lat<=? "
                                   "AND q.max_lat>=? ORDER BY o.object_id", (row["lon"], row["lon"], row["lat"], row["lat"])):
            if r["object_id"] == eid or r["geometry"] is None:
                continue
            g = json.loads(r["geometry"])
            if geo.is_areal(g) and geo.PreparedArea(g).contains(row["lon"], row["lat"]):
                items.append(self._ref_min("object", r))
        return self._envelope({"items": items}, t0, Budget.of(None), lod="refs", total=len(items), returned=len(items))

    def contained(self, eid, scope=None, budget=None, cursor=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        kind, row = self._require(eid)
        g = json.loads(row["geometry"]) if kind != "relation" and row["geometry"] else None
        if g is None or not geo.is_areal(g):
            return self._envelope({"not_applicable": "not an area", "items": []}, t0, bu, lod="refs")
        area = geo.PreparedArea(g)
        hits = []
        for k in ("object", "event"):
            table, key = TABLE[k]
            for r in self.conn.execute(f"SELECT t.* FROM {k}_rtree q CROSS JOIN rid_map m ON m.rid=q.rid CROSS JOIN {table} t "
                                       f"ON t.{key}=m.entity_id WHERE q.min_lon>=? AND q.max_lon<=? AND q.min_lat>=? "
                                       f"AND q.max_lat<=?", (row["min_lon"], row["max_lon"], row["min_lat"], row["max_lat"])):
                if r[key] != eid and self._scope_ok(k, r, sc) and area.contains(r["lon"], r["lat"]):
                    hits.append((k, r[key], r))
        hits.sort(key=lambda x: (x[0], x[1]))
        start = int(cursor) if cursor else 0
        page = hits[start:start + bu.max_items]
        by_type = {}
        for k, _, r in hits:
            by_type[r["type"]] = by_type.get(r["type"], 0) + 1
        nxt = str(start + len(page)) if start + len(page) < len(hits) else None
        return self._envelope({"items": [self._ref_min(k, r) for k, _, r in page], "counts_by_type": by_type}, t0, bu,
                              lod="refs", total=len(hits), returned=len(page), truncated=nxt is not None,
                              cursor_next=nxt, list_key="items")

    # ── projections (MAP, TIMELINE) and facets ───────────────────────────────
    def _agg_level(self, z):
        z = 2 if z is None else int(z)
        lvl = min(geo.MAX_LEVEL, max(2, 2 * ((z + 2) // 2)))
        return lvl

    def _periods(self, sc: Scope):
        """Snap the time window to months; return (periods for timed kinds, effective window)."""
        if not sc.time_window:
            return [0], None
        m0, m1 = month_index(int(sc.time_window[0])), month_index(int(sc.time_window[1]))
        periods = []
        m = m0
        while m <= m1:
            y, mm = divmod(m, 12)
            if mm == 0 and m + 11 <= m1:
                periods.append(y * 100)
                m += 12
            else:
                periods.append(y * 100 + mm + 1)
                m += 1
        return periods, [month_start_ms(m0), month_start_ms(m1 + 1) - 1]

    def _band_floor(self, sc: Scope):
        b = 2 if sc.min_confidence >= 0.8 else (1 if sc.min_confidence >= 0.5 else 0)
        return b, BAND_FLOOR[b]

    def _agg_where(self, sc: Scope, level, cells, kinds=None):
        """SQL conditions over the agg table for a scope (timeless objects ignore the time window)."""
        periods, eff = self._periods(sc)
        band, bfloor = self._band_floor(sc)
        cond, args = ["level=?"], [level]
        pc = f"period IN ({','.join('?' * len(periods))})"
        cond.append(f"((kind='object' AND period=0) OR (kind<>'object' AND {pc}))")
        args += periods
        if sc.types:
            cond.append(f"type IN ({','.join('?' * len(sc.types))})")
            args += sc.types
        if kinds:
            cond.append(f"kind IN ({','.join('?' * len(kinds))})")
            args += kinds
        if sc.sources:
            cond.append(f"source IN ({','.join('?' * len(sc.sources))})")
            args += sc.sources
        if band:
            cond.append("band>=?")
            args.append(band)
        if cells is not None:
            cc = []
            for x0, x1, y0, y1 in cells:
                cc.append("(cx BETWEEN ? AND ? AND cy BETWEEN ? AND ?)")
                args += [x0, x1, y0, y1]
            cond.append("(" + " OR ".join(cc) + ")")
        return " AND ".join(cond), args, eff, bfloor

    def _effective_viewport(self, sc: Scope, level):
        cells = geo.viewport_cells(sc.viewport, level)
        bbs = []
        for x0, x1, y0, y1 in cells:
            a = geo.cell_bbox(level, x0, y0)
            b = geo.cell_bbox(level, x1, y1)
            bbs.append([a[0], a[2], b[1], b[3]])
        return cells, bbs

    def project_map(self, scope=None, budget=None, highlight=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        if not sc.viewport:
            raise QueryError("project_map requires scope.viewport")
        if sc.z is not None and int(sc.z) >= LOCAL_Z:
            return self._project_local(sc, bu, highlight, t0)
        level = self._agg_level(sc.z)
        kinds = ["object", "event", "insight"]
        while True:
            cells, eff_bbs = self._effective_viewport(sc, level)
            cond, args, eff_window, bfloor = self._agg_where(sc, level, cells, kinds)
            rows = self.conn.execute(f"SELECT cx, cy, kind, type, SUM(n) AS n, MAX(maxconf) AS mc FROM agg WHERE {cond} "
                                     f"GROUP BY cx, cy, kind, type ORDER BY cx, cy, kind, type", args).fetchall()
            total = sum(r["n"] for r in rows)
            n_cells = len({(r["cx"], r["cy"]) for r in rows})
            want_aggregates = bu.lod == "aggregates" or (bu.lod == "auto" and total > bu.max_items)
            if not want_aggregates or n_cells <= bu.max_items or level <= min(geo.AGG_LEVELS):
                break
            level -= 2  # density without chaos: coarser cells until the budget is respected
        c2, a2, _, _ = self._agg_where(sc, -1, None, kinds)
        no_geo = self.conn.execute(f"SELECT COALESCE(SUM(n),0) FROM agg WHERE {c2} AND geo=0", a2).fetchone()[0]
        lod = bu.lod
        if lod == "auto":
            lod = "aggregates" if total > bu.max_items else "refs"
        effective = {"viewport": eff_bbs, "level": level, "time_window": eff_window, "min_confidence": bfloor}
        excluded = {"no_geometry": no_geo}
        hl = None
        if lod == "counts":
            by_type = {}
            for r in rows:
                by_type[r["type"]] = by_type.get(r["type"], 0) + r["n"]
            return self._envelope({"counts_by_type": by_type, "effective_scope": effective}, t0, bu, lod=lod,
                                  total=total, returned=0, excluded=excluded)
        if lod == "aggregates":
            cellmap = {}
            for r in rows:
                c = cellmap.setdefault((r["cx"], r["cy"]), {"z": level, "x": r["cx"], "y": r["cy"], "n": 0,
                                                            "by_type": {}, "maxconf": 0.0})
                c["n"] += r["n"]
                c["by_type"][r["type"]] = c["by_type"].get(r["type"], 0) + r["n"]
                c["maxconf"] = max(c["maxconf"], r["mc"] or 0.0)
            out = []
            for (x, y), c in sorted(cellmap.items()):
                c["bbox"] = list(geo.cell_bbox(level, x, y))
                c["dominant_type"] = max(sorted(c["by_type"]), key=lambda t: c["by_type"][t])
                out.append(c)
            cut = len(out) > bu.max_items
            if cut:  # still too many cells at the coarsest level: keep the densest, report the truncation
                out = sorted(out, key=lambda c: (-c["n"], c["x"], c["y"]))[: bu.max_items]
            if highlight:
                hl = [self._appears_map(h, level, cellmap) for h in highlight]
            return self._envelope({"cells": out, "effective_scope": effective}, t0, bu, lod=lod, total=total,
                                  returned=len(out), truncated=cut, excluded=excluded, highlight=hl, list_key="cells",
                                  sources=[])
        items = self._map_refs(sc, level, cells, eff_bbs, bu.max_items)
        if highlight:
            ids = {i["id"] for i in items}
            hl = [{"ref": h, "appears_as": "single" if h in ids else "outside_scope"} for h in highlight]
        return self._envelope({"items": items, "effective_scope": effective}, t0, bu, lod=lod, total=total,
                              returned=len(items), truncated=len(items) < total, excluded=excluded, highlight=hl,
                              list_key="items")

    def _local_rows(self, sc):
        """Elements whose representative point is inside the exact viewport (local zoom)."""
        x0, y0, x1, y1 = sc.viewport
        spans = [(x0, x1)] if x0 <= x1 else [(x0, 180.0), (-180.0, x1)]
        _, window = self._periods(sc) if sc.time_window else (None, None)
        window = sc.time_window
        band, _ = self._band_floor(sc)
        out = {}
        for kind in ("object", "event", "insight"):
            table, key = TABLE[kind]
            for a, b in spans:
                for r in self.conn.execute(
                        f"SELECT t.* FROM {kind}_rtree q CROSS JOIN rid_map m ON m.rid=q.rid CROSS JOIN {table} t "
                        f"ON t.{key}=m.entity_id WHERE q.min_lon<=? AND q.max_lon>=? AND q.min_lat<=? AND q.max_lat>=?",
                        (b, a, y1, y0)):
                    if r["lon"] is None or not (a <= r["lon"] <= b and y0 <= r["lat"] <= y1):
                        continue
                    if sc.types and r["type"] not in sc.types:
                        continue
                    if kind == "insight" and r["status"] != "active":
                        continue
                    if sc.sources and (r["source_id"] if kind != "insight" else "nexum.correlation") not in sc.sources:
                        continue
                    if (r["band"] or 0) < band:
                        continue
                    if window and kind != "object" and (r["t_start_ms"] is None or
                                                        not window[0] <= r["t_start_ms"] <= window[1]):
                        continue
                    out[r[key]] = (kind, r)
        return out

    def _project_local(self, sc, bu, highlight, t0):
        rows = self._local_rows(sc)
        total = len(rows)
        c2, a2, _, _ = self._agg_where(Scope.of({**sc.__dict__, "viewport": None}), -1, None,
                                       ["object", "event", "insight"])
        no_geo = self.conn.execute(f"SELECT COALESCE(SUM(n),0) FROM agg WHERE {c2} AND geo=0", a2).fetchone()[0]
        effective = {"viewport": [sc.viewport], "level": None, "time_window": sc.time_window,
                     "min_confidence": self._band_floor(sc)[1], "exact": True}
        lod = bu.lod
        if lod == "auto":
            lod = "aggregates" if total > bu.max_items else "refs"
        if lod == "counts":
            by_type = {}
            for kind, r in rows.values():
                by_type[r["type"]] = by_type.get(r["type"], 0) + 1
            return self._envelope({"counts_by_type": by_type, "effective_scope": effective}, t0, bu, lod=lod,
                                  total=total, returned=0, excluded={"no_geometry": no_geo})
        if lod == "aggregates":
            level = min(20, int(sc.z) + 2)
            while True:
                cellmap = {}
                for kind, r in rows.values():
                    x, y = geo.cell(r["lon"], r["lat"], level)
                    c = cellmap.setdefault((x, y), {"z": level, "x": x, "y": y, "n": 0, "by_type": {}, "maxconf": 0.0})
                    c["n"] += 1
                    c["by_type"][r["type"]] = c["by_type"].get(r["type"], 0) + 1
                    c["maxconf"] = max(c["maxconf"], r["confidence"] or 0.0)
                if len(cellmap) <= bu.max_items or level <= 2:
                    break
                level -= 2
            out = []
            for (x, y), c in sorted(cellmap.items()):
                c["bbox"] = list(geo.cell_bbox(level, x, y))
                c["dominant_type"] = max(sorted(c["by_type"]), key=lambda t: c["by_type"][t])
                out.append(c)
            cut = len(out) > bu.max_items
            if cut:
                out = sorted(out, key=lambda c: (-c["n"], c["x"], c["y"]))[: bu.max_items]
            return self._envelope({"cells": out, "effective_scope": effective}, t0, bu, lod=lod, total=total,
                                  returned=len(out), truncated=cut, excluded={"no_geometry": no_geo},
                                  list_key="cells", sources=[])
        items = sorted((self._ref_min(k, r) for k, r in rows.values()), key=lambda o: (-(o["confidence"] or 0), o["id"]))
        hl = None
        if highlight:
            ids = {i["id"] for i in items}
            hl = [{"ref": h, "appears_as": "single" if h in ids else "outside_scope"} for h in highlight]
        page = items[: bu.max_items]
        return self._envelope({"items": page, "effective_scope": effective}, t0, bu, lod=lod, total=total,
                              returned=len(page), truncated=len(page) < total, excluded={"no_geometry": no_geo},
                              highlight=hl, list_key="items")

    def _appears_map(self, eid, level, cellmap):
        kind = kind_of(eid)
        row = self._row(kind, eid)
        if row is None or row["cx"] is None:
            return {"ref": eid, "appears_as": "not_applicable"}
        s = geo.MAX_LEVEL - level
        key = (row["cx"] >> s, row["cy"] >> s)
        if key in cellmap:
            return {"ref": eid, "appears_as": "in_cell", "cell": {"z": level, "x": key[0], "y": key[1]}}
        return {"ref": eid, "appears_as": "outside_scope"}

    def _map_refs(self, sc, level, cells, eff_bbs, limit):
        s = geo.MAX_LEVEL - level
        periods_window = self._periods(sc)[1]
        band, _ = self._band_floor(sc)
        out = []
        for kind in ("object", "event", "insight"):
            table, key = TABLE[kind]
            for bb in eff_bbs:
                q = (f"SELECT t.* FROM {kind}_rtree q CROSS JOIN rid_map m ON m.rid=q.rid CROSS JOIN {table} t ON t.{key}=m.entity_id "
                     f"WHERE q.min_lon<=? AND q.max_lon>=? AND q.min_lat<=? AND q.max_lat>=?")
                for r in self.conn.execute(q, (bb[2], bb[0], bb[3], bb[1])):
                    if r["cx"] is None:
                        continue
                    if not any(x0 <= (r["cx"] >> s) <= x1 and y0 <= (r["cy"] >> s) <= y1 for x0, x1, y0, y1 in cells):
                        continue
                    if sc.types and r["type"] not in sc.types:
                        continue
                    if kind == "insight" and r["status"] != "active":
                        continue
                    if sc.sources and (r["source_id"] if kind != "insight" else "nexum.correlation") not in sc.sources:
                        continue
                    if (r["band"] or 0) < band:
                        continue
                    if periods_window and kind != "object":
                        if r["t_start_ms"] is None or not (periods_window[0] <= r["t_start_ms"] <= periods_window[1]):
                            continue
                    out.append(self._ref_min(kind, r))
        out = sorted({o["id"]: o for o in out}.values(), key=lambda o: (-(o["confidence"] or 0), o["id"]))
        return out[:limit]

    def project_timeline(self, scope=None, bucket="auto", budget=None, highlight=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        if not sc.time_window:
            lo = self.conn.execute("SELECT MIN(t_start_ms), MAX(t_start_ms) FROM event").fetchone()
            if lo[0] is None:
                return self._envelope({"buckets": [], "items": []}, t0, bu, lod="aggregates", total=0, returned=0)
            sc = Scope.of({**sc.__dict__, "time_window": [lo[0], lo[1]]})
        span = sc.time_window[1] - sc.time_window[0]
        if bucket == "auto":
            bucket = "year" if span > 3 * 365 * DAY else ("month" if span > 90 * DAY else ("day" if span > 3 * DAY else "hour"))
        kinds = ["event", "insight"]
        if bucket in ("year", "month"):
            level = -1
            cells = None
            if sc.viewport:
                level = self._agg_level(sc.z)
                cells, _ = self._effective_viewport(sc, level)
            periods, eff = self._periods(sc)
            if bucket == "month":
                m0, m1 = month_index(sc.time_window[0]), month_index(sc.time_window[1])
                periods = [(m // 12) * 100 + m % 12 + 1 for m in range(m0, m1 + 1)]
            else:
                y0, y1 = month_index(sc.time_window[0]) // 12, month_index(sc.time_window[1]) // 12
                periods = []
                m0, m1 = month_index(sc.time_window[0]), month_index(sc.time_window[1])
                for y in range(y0, y1 + 1):
                    if y * 12 >= m0 and y * 12 + 11 <= m1:
                        periods.append(y * 100)
                    else:
                        periods += [y * 100 + mm + 1 for mm in range(12) if m0 <= y * 12 + mm <= m1]
            band, bfloor = self._band_floor(sc)
            cond, args = ["level=?", f"period IN ({','.join('?' * len(periods))})", "kind IN ('event','insight')"], \
                [level, *periods]
            if sc.types:
                cond.append(f"type IN ({','.join('?' * len(sc.types))})")
                args += sc.types
            if sc.sources:
                cond.append(f"source IN ({','.join('?' * len(sc.sources))})")
                args += sc.sources
            if band:
                cond.append("band>=?")
                args.append(band)
            if cells is not None:
                cc = []
                for x0, x1, yy0, yy1 in cells:
                    cc.append("(cx BETWEEN ? AND ? AND cy BETWEEN ? AND ?)")
                    args += [x0, x1, yy0, yy1]
                cond.append("(" + " OR ".join(cc) + ")")
            rows = self.conn.execute(f"SELECT period, kind, type, SUM(n) AS n FROM agg WHERE {' AND '.join(cond)} "
                                     f"GROUP BY period, kind, type ORDER BY period, kind, type", args).fetchall()
            buckets = {}
            for r in rows:
                p = r["period"]
                key = (p // 100) if bucket == "year" else p
                b = buckets.setdefault(key, {"bucket": key, "n": 0, "by_type": {}})
                b["n"] += r["n"]
                b["by_type"][r["type"]] = b["by_type"].get(r["type"], 0) + r["n"]
            out = [dict(b, start_ms=self._bucket_start(bucket, b["bucket"])) for _, b in sorted(buckets.items())]
            effective = {"time_window": eff, "bucket": bucket, "min_confidence": bfloor}
        else:
            step = DAY if bucket == "day" else HOUR
            out_map = {}
            where, args = ["t_start_ms BETWEEN ? AND ?"], list(sc.time_window)
            for kind in kinds:
                table, key = TABLE[kind]
                extra = " AND status='active'" if kind == "insight" else ""
                for r in self.conn.execute(f"SELECT t_start_ms, type, confidence, source_id AS src, band, cx, cy "
                                           f"FROM {table} WHERE {' AND '.join(where)}{extra}"
                                           if kind == "event" else
                                           f"SELECT t_start_ms, type, confidence, 'nexum.correlation' AS src, band, cx, cy "
                                           f"FROM {table} WHERE {' AND '.join(where)}{extra}", args):
                    if sc.types and r["type"] not in sc.types:
                        continue
                    if sc.sources and r["src"] not in sc.sources:
                        continue
                    if (r["band"] or 0) < self._band_floor(sc)[0]:
                        continue
                    k = (r["t_start_ms"] // step) * step
                    b = out_map.setdefault(k, {"bucket": k, "n": 0, "by_type": {}, "start_ms": k})
                    b["n"] += 1
                    b["by_type"][r["type"]] = b["by_type"].get(r["type"], 0) + 1
            out = [out_map[k] for k in sorted(out_map)]
            effective = {"time_window": sc.time_window, "bucket": bucket, "min_confidence": self._band_floor(sc)[1]}
        total = sum(b["n"] for b in out)
        items = []
        if total <= bu.max_items and bu.lod in ("auto", "refs", "details"):
            items = self._timeline_items(sc, effective["time_window"], bu.max_items)
        hl = None
        if highlight:
            hl = []
            for h in highlight:
                r = self._row(kind_of(h), h)
                t = r["t_start_ms"] if r is not None and kind_of(h) in ("event", "insight") else None
                if t is None:
                    hl.append({"ref": h, "appears_as": "not_applicable"})
                else:
                    hl.append({"ref": h, "appears_as": "in_bucket", "t_ms": t})
        return self._envelope({"buckets": out, "items": items, "effective_scope": effective}, t0, bu,
                              lod="aggregates" if not items else "refs", total=total, returned=len(items),
                              truncated=len(items) < total, highlight=hl, list_key="items")

    def _bucket_start(self, bucket, key):
        if bucket == "year":
            return month_start_ms(key * 12)
        y, m = divmod(key, 100)
        return month_start_ms(y * 12 + m - 1)

    def _timeline_items(self, sc, window, limit):
        out = []
        for kind in ("event", "insight"):
            table, key = TABLE[kind]
            extra = " AND status='active'" if kind == "insight" else ""
            for r in self.conn.execute(f"SELECT * FROM {table} WHERE t_start_ms BETWEEN ? AND ?{extra} "
                                       f"ORDER BY t_start_ms, {key} LIMIT ?", (window[0], window[1], limit * 4)):
                if sc.types and r["type"] not in sc.types:
                    continue
                if sc.sources and (r["source_id"] if kind == "event" else "nexum.correlation") not in sc.sources:
                    continue
                if (r["band"] or 0) < self._band_floor(sc)[0]:
                    continue
                out.append(self._ref_min(kind, r))
        out.sort(key=lambda o: (o.get("t") or 0, o["id"]))
        return out[:limit]

    def facets(self, scope=None):
        t0 = time.perf_counter()
        sc = Scope.of(scope)
        if sc.viewport and sc.z is not None and int(sc.z) >= LOCAL_Z:
            f = {"kind": {}, "type": {}, "source": {}, "band": {}, "geometry": {}}
            rows = self._local_rows(sc)
            for kind, r in rows.values():
                src = r["source_id"] if kind != "insight" else "nexum.correlation"
                lab = {2: "forte", 1: "medio", 0: "debole"}[r["band"] or 0]
                for dim, val in (("kind", kind), ("type", r["type"]), ("source", src), ("band", lab),
                                 ("geometry", "with_geometry")):
                    f[dim][val] = f[dim].get(val, 0) + 1
            rel = {f"{t} ({nat})": n for t, nat, n in self.conn.execute("SELECT type, nature, n FROM agg_rel ORDER BY type")}
            data = {"facets": f, "relations_by_type": rel,
                    "effective_scope": {"viewport": [sc.viewport], "exact": True, "time_window": sc.time_window,
                                        "min_confidence": self._band_floor(sc)[1]}}
            return self._envelope(data, t0, Budget.of(None), lod="counts", total=len(rows), returned=0, facets=f,
                                  sources=[])
        level, cells = -1, None
        if sc.viewport:
            level = self._agg_level(sc.z)
            cells, _ = self._effective_viewport(sc, level)
        cond, args, eff, bfloor = self._agg_where(sc, level, cells)
        f = {"kind": {}, "type": {}, "source": {}, "band": {}, "geometry": {}}
        total = 0
        for k, t, s, b, g, n in self.conn.execute(
                f"SELECT kind, type, source, band, geo, SUM(n) FROM agg WHERE {cond} GROUP BY kind, type, source, band, geo",
                args):
            total += n
            f["kind"][k] = f["kind"].get(k, 0) + n
            f["type"][t] = f["type"].get(t, 0) + n
            f["source"][s] = f["source"].get(s, 0) + n
            lab = {2: "forte", 1: "medio", 0: "debole"}[b]
            f["band"][lab] = f["band"].get(lab, 0) + n
            gl = "with_geometry" if g else "without_geometry"
            f["geometry"][gl] = f["geometry"].get(gl, 0) + n
        rel = {f"{t} ({nat})": n for t, nat, n in self.conn.execute("SELECT type, nature, n FROM agg_rel ORDER BY type")}
        data = {"facets": f, "relations_by_type": rel,
                "effective_scope": {"level": level, "time_window": eff, "min_confidence": bfloor}}
        return self._envelope(data, t0, Budget.of(None), lod="counts", total=total, returned=0, facets=f, sources=[])

    def count_live(self, scope=None, kinds=("object", "event", "insight")):
        """Independent live count of the entities in a (snapped) scope — used to verify aggregates (P34)."""
        sc = Scope.of(scope)
        if sc.viewport and sc.z is not None and int(sc.z) >= LOCAL_Z:
            return sum(1 for k, _ in self._local_rows(sc).values() if k in kinds)
        level = self._agg_level(sc.z) if sc.viewport else None
        cells = self._effective_viewport(sc, level)[0] if sc.viewport else None
        _, window = self._periods(sc)
        band, _ = self._band_floor(sc)
        s = geo.MAX_LEVEL - level if level else 0
        n = 0
        for kind in kinds:
            table, key = TABLE[kind]
            cond, args = [], []
            if kind == "insight":
                cond.append("status='active'")
            if sc.types:
                cond.append(f"type IN ({','.join('?' * len(sc.types))})")
                args += sc.types
            if sc.sources:
                src = "source_id" if kind != "insight" else "'nexum.correlation'"
                cond.append(f"{src} IN ({','.join('?' * len(sc.sources))})")
                args += sc.sources
            if band:
                cond.append("COALESCE(band,0)>=?")
                args.append(band)
            if window and kind != "object":
                cond.append("t_start_ms BETWEEN ? AND ?")
                args += window
            if cells is not None:
                cc = []
                for x0, x1, y0, y1 in cells:
                    cc.append(f"((cx >> {s}) BETWEEN ? AND ? AND (cy >> {s}) BETWEEN ? AND ?)")
                    args += [x0, x1, y0, y1]
                cond.append("cx IS NOT NULL AND (" + " OR ".join(cc) + ")")
            w = f"WHERE {' AND '.join(cond)}" if cond else ""
            n += self.conn.execute(f"SELECT COUNT(*) FROM {table} {w}", args).fetchone()[0]
        return n

    # ── search ───────────────────────────────────────────────────────────────
    def search(self, q, scope=None, budget=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        toks = [t for t in re.findall(r"[0-9A-Za-zÀ-ÿ]+", q or "")][:8]
        if not toks:
            return self._envelope({"groups": []}, t0, bu, lod="refs", total=0, returned=0)
        docs = {t: self._term_docs(t.lower()) for t in toks}
        estimate = min(docs.values())
        # query planning: very frequent tokens are not used to drive the full-text search (their posting lists
        # dominate the cost); they are applied afterwards as a filter on label, aliases and identifiers
        common = [t for t in toks if docs[t] > RANK_LIMIT]
        rare = [t for t in toks if docs[t] <= RANK_LIMIT]
        ranked = bool(rare)
        if ranked:
            match = " ".join(f'"{t}"*' for t in rare)
            hits = self.conn.execute("SELECT m.entity_kind, m.entity_id, bm25(search_fts, 10, 4, 6, 1) AS score, "
                                     "f.rowid FROM search_fts f JOIN rid_map m ON m.rid=f.rowid WHERE search_fts MATCH ? "
                                     "ORDER BY score, m.entity_id LIMIT ?", (match, bu.max_items * 4)).fetchall()
        else:  # only very common terms: ranking hundreds of thousands of documents is neither fast nor useful
            match = " ".join(f'"{t}"*' for t in toks)
            hits = self.conn.execute("SELECT m.entity_kind, m.entity_id, 0.0, f.rowid FROM search_fts f JOIN rid_map m "
                                     "ON m.rid=f.rowid WHERE search_fts MATCH ? LIMIT ?",
                                     (match, bu.max_items)).fetchall()
            common = []
        if common and hits:
            # frequent tokens filter the candidates on label, aliases and identifiers (batched reads)
            words = re.compile(r"[0-9a-zà-ÿ]+")
            text = {h[1]: [] for h in hits}
            ids = list(text)
            for i in range(0, len(ids), 500):
                part = ids[i:i + 500]
                ph = ",".join("?" * len(part))
                for table, key in (("object", "object_id"), ("event", "event_id"), ("insight", "insight_id")):
                    for eid_, label in self.conn.execute(f"SELECT {key}, label FROM {table} WHERE {key} IN ({ph})", part):
                        text[eid_].append(label or "")
                for eid_, alias in self.conn.execute(f"SELECT entity_id, alias FROM alias WHERE entity_id IN ({ph})", part):
                    text[eid_].append(alias)
                for sch, v, eid_ in self.conn.execute(f"SELECT scheme, value, entity_id FROM identifier WHERE "
                                                      f"entity_id IN ({ph})", part):
                    text[eid_].append(f"{sch} {v}")
            low = [c.lower() for c in common]
            hits = [h for h in hits
                    if all(any(w.startswith(c) for w in words.findall(" ".join(text[h[1]]).lower())) for c in low)]
        hits = [h[:3] for h in hits]
        rows = []
        for k, i, score in hits:
            r = self._row(k, i)
            if r is not None:
                rows.append((k, i, r["type"], r["label"], score))
        groups, n = {}, 0
        for k, i, t, label, score in rows:
            if sc.types and t not in sc.types:
                continue
            if k == "insight":
                st = self.conn.execute("SELECT status FROM insight WHERE insight_id=?", (i,)).fetchone()
                if not st or st[0] != "active":
                    continue
            if n >= bu.max_items:
                break
            g = groups.setdefault(t, {"type": t, "items": []})
            g["items"].append({"kind": k, "id": i, "type": t, "label": label, "score": round(-score, 4)})
            n += 1
        return self._envelope({"groups": [groups[t] for t in sorted(groups)], "ranked": ranked,
                               "estimated_matches": estimate}, t0, bu, lod="refs", total=n, returned=n,
                              truncated=not ranked and estimate > n)

    def _term_docs(self, prefix: str, cap: int = RANK_LIMIT + 1) -> int:
        """Documents containing terms that start with `prefix` (bounded count from the FTS vocabulary).
        Cached per world version: term statistics change only when the world changes."""
        wv = self._world_version()
        cache = self.__dict__.setdefault("_docs_cache", {})
        if cache.get("__version__") != wv:
            cache.clear()
            cache["__version__"] = wv
        if prefix in cache:
            return cache[prefix]
        cache[prefix] = self._term_docs_uncached(prefix, cap)
        return cache[prefix]

    def _term_docs_uncached(self, prefix: str, cap: int) -> int:
        n = terms = 0
        for (d,) in self.conn.execute("SELECT doc FROM search_vocab WHERE term >= ? AND term < ? LIMIT 5000",
                                      (prefix, prefix + "\U0010ffff")):
            n += d
            terms += 1
            if n >= cap:
                break
        return cap if terms >= 5000 else n  # a prefix expanding to thousands of terms is itself frequent

    # ── timeline traversal ───────────────────────────────────────────────────
    def entity_timeline(self, eid, window=None, budget=None):
        t0 = time.perf_counter()
        bu = Budget.of(budget)
        kind, row = self._require(eid)
        entries = []
        if kind == "event":
            entries.append({"t_ms": row["t_start_ms"], "entry": "event", "ref": self.ref("event", eid), "reason": "self"})
        related, fetched = self._related_with_rows(kind, eid)
        for ev, reason in related.items():
            r = fetched.get(ev)
            entries.append((r["t_start_ms"], ev, reason, r))   # related events stay light until they are returned
        for c in self.conn.execute("SELECT claim_id, property, value_json, recorded_at_ms, valid_from_ms FROM claim "
                                   "WHERE subject_id=? ORDER BY recorded_at_ms, claim_id", (eid,)):
            entries.append({"t_ms": c["valid_from_ms"] or c["recorded_at_ms"], "entry": "claim", "property": c["property"],
                            "value": json.loads(c["value_json"]), "time_basis": "valid" if c["valid_from_ms"] else "recorded"})
        for r in self.conn.execute("SELECT r.relation_id, r.type, r.valid_from_ms FROM edge e JOIN relation r ON "
                                   "r.relation_id=e.ref_id WHERE (e.src_id=? OR e.dst_id=?) AND e.edge_kind='relation' "
                                   "AND r.valid_from_ms IS NOT NULL", (eid, eid)):
            entries.append({"t_ms": r["valid_from_ms"], "entry": "relation_start",
                            "ref": {"kind": "relation", "id": r["relation_id"], "type": r["type"], "label": r["type"]}})
        for (iid,) in self.conn.execute("SELECT DISTINCT e.supports_id FROM evidence e JOIN insight i ON "
                                        "i.insight_id=e.supports_id WHERE e.supports_kind='insight' AND e.support_id=? "
                                        "AND i.status='active'", (eid,)):
            r = self._row("insight", iid)
            entries.append({"t_ms": r["t_start_ms"], "entry": "insight", "ref": self.ref("insight", iid, r)})
        def t_of(e):
            return e[0] if isinstance(e, tuple) else e["t_ms"]

        if window:
            entries = [e for e in entries if t_of(e) is not None and window[0] <= t_of(e) <= window[1]]
        total = len(entries)
        # partial, stable sort on precomputed keys (t, id, insertion index): identical to list.sort() then [:n]
        keys = [((e[0] if e[0] is not None else -1), e[1], i) if isinstance(e, tuple) else
                ((e["t_ms"] if e["t_ms"] is not None else -1), e.get("ref", {}).get("id", ""), i)
                for i, e in enumerate(entries)]
        top = heapq.nsmallest(bu.max_items, keys)
        entries = [entries[k[2]] for k in top]
        entries = [e if not isinstance(e, tuple) else
                   {"t_ms": e[0], "entry": "event", "ref": self.ref("event", e[1], e[3]), "reason": e[2]}
                   for e in entries]
        return self._envelope({"focus": eid, "entries": entries}, t0, bu, lod="refs", total=total,
                              returned=len(entries), truncated=len(entries) < total, list_key="entries")

    def timeline_neighbors(self, eid, window_ms=30 * DAY, hops=2, budget=None):
        t0 = time.perf_counter()
        bu = Budget.of(budget)
        kind, row = self._require(eid)
        center = row["t_start_ms"] if kind in ("event", "insight") else None
        seen, frontier, found = {eid}, [eid], {}
        for h in range(1, max(1, min(int(hops), 3)) + 1):
            nxt = []
            for n in frontier:
                for m in self._neighbors(n, cap=2000):
                    if m in seen:
                        continue
                    seen.add(m)
                    nxt.append(m)
                    if m.startswith("evt_"):
                        found.setdefault(m, h)
            frontier = nxt[:20000]
        items = []
        for ev, h in found.items():
            r = self._row("event", ev)
            if center is not None and abs(r["t_start_ms"] - center) > window_ms:
                continue
            items.append(dict(self._ref_min("event", r), hops=h,
                              delta_t_ms=None if center is None else r["t_start_ms"] - center))
        items.sort(key=lambda i: (i["t"], i["id"]))
        total = len(items)
        return self._envelope({"focus": eid, "center_ms": center, "items": items[: bu.max_items]}, t0, bu, lod="refs",
                              total=total, returned=min(total, bu.max_items), truncated=total > bu.max_items,
                              list_key="items")

    def timeline_step(self, eid, direction="next"):
        t0 = time.perf_counter()
        kind, row = self._require(eid)
        if kind != "event":
            raise QueryError("timeline_step requires an event")
        t = row["t_start_ms"]
        best = None
        for ev in self._related_event_ids(kind, eid):
            r = self._row("event", ev)
            dt = r["t_start_ms"] - t
            if (direction == "next" and dt > 0) or (direction == "prev" and dt < 0):
                key = (abs(dt), ev)
                if best is None or key < best[0]:
                    best = (key, r)
        data = {"from": eid, "direction": direction, "step": self._ref_min("event", best[1]) if best else None}
        return self._envelope(data, t0, Budget.of(None), lod="refs")

    # ── OBJECT MODE ──────────────────────────────────────────────────────────
    def context(self, focus, scope=None, budget=None):
        """One call, eight sections: the context around any element."""
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        kind, row = self._require(focus)
        n = min(bu.max_items, 25)
        small = Budget(max_items=n, max_nodes=bu.max_nodes, max_edges=bu.max_edges, max_bytes=bu.max_bytes)
        sources = self.sources_of(focus)["data"]["items"]
        ev = self.evidence_of(focus, small)
        sections = {
            "focus": self._details(kind, row),
            "sources": sources,
            "evidence": {"items": ev["data"]["items"], "total": ev["total"],
                         "independent_sources": ev["data"]["independent_sources"]},
        }
        if kind == "relation":
            sections["relations"] = {"groups": [], "total": 0}
        else:
            rel = self.relations(focus, sc, small)
            sections["relations"] = {"groups": rel["data"]["groups"], "total": rel["total"]}
        ro = self.related_objects(focus, sc, small) if kind != "relation" else None
        re_ = self.related_events(focus, sc, small) if kind != "relation" else None
        if kind == "relation":
            sections["related_objects"] = {"items": [sections["focus"]["from"], sections["focus"]["to"]], "total": 2}
            sections["related_events"] = {"items": ev["data"]["supporting_events"],
                                          "total": len(ev["data"]["supporting_events"])}
        else:
            sections["related_objects"] = {"items": ro["data"]["items"], "counts_by_type": ro["data"]["counts_by_type"],
                                           "total": ro["total"]}
            sections["related_events"] = {"items": re_["data"]["items"], "counts_by_type": re_["data"]["counts_by_type"],
                                          "total": re_["total"]}
        tl = self.entity_timeline(focus, None, small) if kind != "relation" else None
        sections["timeline"] = {"entries": tl["data"]["entries"] if tl else [], "total": tl["total"] if tl else 0}
        has_geo = kind in ("object", "event", "insight") and row["lon"] is not None
        if has_geo:
            cont = self.containing(focus)["data"]["items"] if kind != "insight" else []
            geom = json.loads(row["geometry"]) if kind != "insight" and row["geometry"] else None
            near = self.nearby(focus, 100, sc, Budget(max_items=10)) if kind != "insight" else None
            sections["geography"] = {"point": [row["lon"], row["lat"]], "geometry_type": geom["type"] if geom else "bbox",
                                     "containing": cont,
                                     "nearby_100km": {"total": near["total"], "items": near["data"]["items"]} if near else None}
        else:
            sections["geography"] = {"not_applicable": "this element has no geometry"}
        ins = self.insights(Scope(), small, member=focus)
        sections["insights"] = {"items": ins["data"]["items"], "total": ins["total"]}
        order = ["focus", "sources", "evidence", "relations", "related_objects", "related_events", "timeline",
                 "geography", "insights"]
        data = {k: sections[k] for k in order}
        return self._envelope(data, t0, bu, lod="details", total=1, returned=1)

    def trail_context(self, trail, budget=None):
        """Rebuild the context of every step of an investigation trail (format only; persistence is Phase 2)."""
        t0 = time.perf_counter()
        steps = []
        for i, step in enumerate(trail):
            ref = step["ref"] if isinstance(step, dict) else step
            sc = step.get("scope") if isinstance(step, dict) else None
            ctx = self.context(ref, sc, budget)
            steps.append({"step": i, "ref": ctx["data"]["focus"]["id"], "context": ctx["data"]})
        return self._envelope({"steps": steps}, t0, Budget.of(budget), lod="details", total=len(steps),
                              returned=len(steps))

    def locate(self, eid, focus=None):
        """Where this element appears in each view."""
        t0 = time.perf_counter()
        kind, row = self._require(eid)
        out = {"ref": self.ref(kind, eid, row)}
        if kind != "relation" and row["lon"] is not None:
            out["map"] = {"point": [row["lon"], row["lat"]], "bbox": [row["min_lon"], row["min_lat"], row["max_lon"],
                                                                      row["max_lat"]],
                          "cell_z8": [row["cx"], row["cy"]]}
        else:
            out["map"] = "not_applicable"
        if kind in ("event", "insight") and row["t_start_ms"] is not None:
            out["timeline"] = {"t_ms": row["t_start_ms"], "month_bucket": month_index(row["t_start_ms"])}
        else:
            out["timeline"] = {"entries": self.entity_timeline(eid, None, Budget(max_items=1))["total"]} \
                if kind != "relation" else "not_applicable"
        if focus:
            p = self.path(focus, eid, 4)["data"]
            out["graph"] = {"from_focus": p["path"], "hops": p["hops"]}
        else:
            out["graph"] = {"degree": sum(g[3] for g in self._groups(eid))}
        out["search"] = {"label": row["label"] if kind != "relation" else row["type"]}
        return self._envelope(out, t0, Budget.of(None), lod="refs")

    # ── sources, types, changes ──────────────────────────────────────────────
    def list_sources(self):
        t0 = time.perf_counter()
        counts = {s: n for s, n in self.conn.execute("SELECT source, SUM(n) FROM agg WHERE level=-1 AND period=0 "
                                                     "GROUP BY source")}
        items = []
        for s in self.conn.execute("SELECT s.*, h.state, h.last_success_ms, h.consecutive_errors FROM source s "
                                   "LEFT JOIN source_health h ON h.source_id=s.source_id ORDER BY s.source_id"):
            items.append({"source_id": s["source_id"], "name": s["name"], "owner": s["owner"], "verdict": s["verdict"],
                          "tier": s["tier"], "license_id": s["license_id"], "license_url": s["license_url"],
                          "attribution": s["attribution"], "redistribution": s["redistribution"],
                          "commercial_use": s["commercial_use"], "verified_at": s["verified_at"],
                          "health": s["state"] or "never_fetched", "last_success_ms": s["last_success_ms"],
                          "entities": counts.get(s["source_id"], 0)})
        return self._envelope({"items": items}, t0, Budget.of(None), lod="refs", total=len(items), returned=len(items))

    def list_types(self):
        t0 = time.perf_counter()
        counts = {t: n for t, n in self.conn.execute("SELECT type, SUM(n) FROM agg WHERE level=-1 AND period=0 GROUP BY type")}
        rel = {t: n for t, _, n in self.conn.execute("SELECT type, nature, n FROM agg_rel")}
        data = {"object_types": [], "event_types": [], "relation_types": []}
        for r in self.conn.execute("SELECT * FROM object_type ORDER BY type_id"):
            data["object_types"].append({"id": r["type_id"], "label": r["label"], "geometry": r["geometry"],
                                         "display_hints": json.loads(r["display_hints"]), "count": counts.get(r["type_id"], 0)})
        for r in self.conn.execute("SELECT * FROM event_type ORDER BY type_id"):
            data["event_types"].append({"id": r["type_id"], "label": r["label"], "roles": json.loads(r["roles"]),
                                        "display_hints": json.loads(r["display_hints"]), "count": counts.get(r["type_id"], 0)})
        for r in self.conn.execute("SELECT * FROM relation_type ORDER BY type_id"):
            data["relation_types"].append({"id": r["type_id"], "label": r["label"], "nature": r["nature"],
                                           "from": json.loads(r["from_types"]), "to": json.loads(r["to_types"]),
                                           "display_hints": json.loads(r["display_hints"]), "count": rel.get(r["type_id"], 0)})
        return self._envelope(data, t0, Budget.of(None), lod="refs", sources=[])

    def changes_since(self, version, scope=None, budget=None):
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        floor = int(self.conn.execute("SELECT COALESCE((SELECT value FROM meta WHERE key='changelog_floor'), 0)"
                                      ).fetchone()[0])
        if int(version) < floor:
            return self._envelope({"since": int(version), "reset_required": True, "floor": floor, "items": []}, t0, bu,
                                  lod="refs", total=None, returned=0)
        rows = self.conn.execute("SELECT entity_kind, entity_id, MAX(world_version) AS v, "
                                 "GROUP_CONCAT(DISTINCT op) AS ops FROM change_log WHERE world_version>? "
                                 "GROUP BY entity_kind, entity_id ORDER BY v, entity_id LIMIT ?",
                                 (int(version), bu.max_items + 1)).fetchall()
        items = []
        for r in rows[: bu.max_items]:
            if r["entity_kind"] in TABLE:
                ref = self.ref(r["entity_kind"], r["entity_id"])
                if ref is None or (sc.types and ref["type"] not in sc.types):
                    continue
            else:
                ref = {"kind": r["entity_kind"], "id": r["entity_id"]}
            items.append({"ref": ref, "ops": sorted(set(r["ops"].split(","))), "world_version": r["v"]})
        total = self.conn.execute("SELECT COUNT(DISTINCT entity_id) FROM change_log WHERE world_version>?",
                                  (int(version),)).fetchone()[0]
        return self._envelope({"since": int(version), "items": items}, t0, bu, lod="refs", total=total,
                              returned=len(items), truncated=len(rows) > bu.max_items, list_key="items")

    def list_entities(self, scope=None, kind="event", budget=None, cursor=None):
        """Plain filtered list (FILTERS) — keyset paginated."""
        t0 = time.perf_counter()
        sc, bu = Scope.of(scope), Budget.of(budget)
        table, key = TABLE[kind]
        cond, args = [], []
        if kind == "insight":
            cond.append("status='active'")
        if sc.types:
            cond.append(f"type IN ({','.join('?' * len(sc.types))})")
            args += sc.types
        if sc.time_window and kind in ("event", "insight"):
            cond.append("t_start_ms BETWEEN ? AND ?")
            args += list(sc.time_window)
        if sc.min_confidence:
            cond.append("confidence>=?")
            args.append(sc.min_confidence)
        w = ("WHERE " + " AND ".join(cond)) if cond else ""
        total = self.conn.execute(f"SELECT COUNT(*) FROM {table} {w}", args).fetchone()[0]
        if cursor:
            cond.append(f"{key}>?")
            args.append(cursor)
        w = ("WHERE " + " AND ".join(cond)) if cond else ""
        rows = self.conn.execute(f"SELECT * FROM {table} {w} ORDER BY {key} LIMIT ?", (*args, bu.max_items + 1)).fetchall()
        page = rows[: bu.max_items]
        nxt = page[-1][key] if len(rows) > bu.max_items else None
        return self._envelope({"items": [self._ref_min(kind, r) for r in page]}, t0, bu, lod="refs", total=total,
                              returned=len(page), truncated=nxt is not None, cursor_next=nxt, list_key="items")

    # ── WHY THIS RELATION? (Phase 2, decision D1: read-only, additive) ───────
    @staticmethod
    def _na(status, reason):
        return {"status": status, "reason": reason}

    def _rule_definition(self, rule_id, version):
        import tomllib
        row = self.conn.execute("SELECT definition_toml, definition_hash FROM rule WHERE rule_id=? AND version=?",
                                (rule_id, version)).fetchone()
        if row is None:
            return self._na("not_recorded", "definizione della regola non registrata in questo mondo")
        r = tomllib.loads(row["definition_toml"]).get("rule", {})
        newer = [v for (v,) in self.conn.execute("SELECT version FROM rule WHERE rule_id=?", (rule_id,))
                 if v != version and v.isdigit() and version.isdigit() and int(v) > int(version)]
        return {"id": rule_id, "version": version, "definition_hash": row["definition_hash"],
                "label": r.get("label", rule_id), "output": r.get("output"), "strength": r.get("strength"),
                "emit_threshold": r.get("emit_threshold"), "anchor": r.get("anchor"),
                "variables": [{"name": v.get("name"), "kind": v.get("kind"),
                               "types": v.get("types", v.get("type", v.get("rule")))}
                              for v in r.get("var", [])],
                "constraints": r.get("constraint", []), "group": r.get("group"),
                "newer_versions": sorted(newer, key=int)}

    def _independence(self, evidence_rows):
        """Independence groups behind a set of evidence rows, plus registry sources that share a group."""
        groups = {}
        for e in evidence_rows:
            g = e["independence_group"]
            if not g:
                continue
            d = groups.setdefault(g, {"independence_group": g, "sources": set(), "best": 0.0, "evidence": 0})
            if e["source_id"]:
                d["sources"].add(e["source_id"])
            d["best"] = max(d["best"], e["weight"] or 0.0)
            d["evidence"] += 1
        out = []
        for g in sorted(groups):
            d = groups[g]
            same = sorted(s.id for s in self.sources.values() if s.independence_group == g and s.id not in d["sources"])
            out.append({"independence_group": g, "sources": sorted(d["sources"]), "best_value": round(d["best"], 9),
                        "evidence_count": d["evidence"],
                        "not_independent": [{"source_id": s, "reason": f"stesso gruppo di indipendenza ({g}): "
                                             "non conta come fonte indipendente"} for s in same]})
        return {"count": len(out), "groups": out}

    def _recomputed(self, factors_json, stored):
        if not factors_json:
            return self._na("not_recorded", "fattori della confidenza non registrati")
        v = cf.recompute(json.loads(factors_json))
        return {"value": v, "stored": stored, "matches": stored is not None and abs(v - stored) <= 1e-9}

    def explain(self, eid):
        """Why an insight or a relation exists: only what the Core recorded, never reconstructed.
        Missing parts are reported as not_recorded / not_applicable."""
        t0 = time.perf_counter()
        kind, row = self._require(eid)
        if kind not in ("insight", "relation"):
            raise QueryError("explain accepts an insight or a relation")
        causal = "Associazione: non indica un rapporto di causa."
        limitations = [causal]
        focus = self._details(kind, row)
        conf = {"value": row["confidence"], "band": cf.BAND_LABEL[cf.band(row["confidence"])]}
        if kind == "relation":
            ev_rows = self.conn.execute("SELECT * FROM evidence WHERE supports_id=? ORDER BY independence_group, "
                                        "support_id, role", (eid,)).fetchall()
            ev = self.evidence_of(eid, Budget(max_items=1000))["data"]["items"]
            na = self._na("not_applicable", "relazione canonica: non prodotta da una regola di correlazione")
            used_by = self.supported(eid, Budget(max_items=100))
            data = {"focus": focus, "kind": "relation", "derivation": row["derivation"],
                    "rule": na, "rule_version": na, "candidates": na, "candidate_groups": na, "group_support": na,
                    "representative": na, "representative_reason": na, "rejected_candidates": na,
                    "rejection_reasons": na, "evidence": ev, "independent_sources": self._independence(ev_rows),
                    "confidence": dict(conf, text=None), "confidence_factors": focus["confidence_factors"],
                    "recomputed": self._recomputed(row["factors_json"], row["confidence"]),
                    "components": na,
                    "explanation": {"text": f"{focus['from']['label']} — {row['type']} → {focus['to']['label']}",
                                    "origin": "generated_from_refs"},
                    "used_by": {"items": used_by["data"]["items"], "total": used_by["total"]},
                    "provenance_complete": self.provenance_chain(eid)["data"]["complete"]}
            data["limitations"] = limitations
            return self._envelope(data, t0, Budget.of(None), lod="details", total=1, returned=1)
        rule = self._rule_definition(row["rule_id"], row["rule_version"])
        grouping = json.loads(row["grouping_json"]) if row["grouping_json"] else None
        has_group = isinstance(rule, dict) and bool(rule.get("group"))
        members = focus["members"]
        mem_ids = [m["ref"]["id"] for m in members if m["ref"]]
        ev_rows = list(self.conn.execute("SELECT * FROM evidence WHERE supports_id=?", (eid,)))
        relation_evidence = []
        for m in members:
            if m["ref"] and m["ref"]["kind"] == "relation":
                rid = m["ref"]["id"]
                ev_rows += list(self.conn.execute("SELECT * FROM evidence WHERE supports_id=?", (rid,)))
                relation_evidence.append({"relation": m["ref"],
                                          "items": self.evidence_of(rid, Budget(max_items=1000))["data"]["items"]})
        if grouping is None:
            reason = ("la regola non raggruppa i candidati: è registrato solo il binding emesso" if not has_group
                      else "raggruppamento non registrato per questo insight")
            na = self._na("not_recorded", reason)
            g = {"candidates": na, "candidate_groups": na, "group_support": na, "representative": na,
                 "representative_reason": na, "rejected_candidates": na, "rejection_reasons": na}
            limitations.append(reason)
        else:
            total_c = sum(len(x["members"]) for x in grouping["groups"])
            cands = [dict(c, ref=self.ref(kind_of(c["id"]), c["id"])) for c in grouping["candidates"]]
            chosen = next((x for x in grouping["groups"] if x["index"] == grouping.get("chosen_group")), None)
            rejected = [dict(d, ref=self.ref(kind_of(d["id"]), d["id"])) for d in grouping.get("discarded", [])]
            reasons = {}
            for d in rejected:
                reasons[d["reason"]] = reasons.get(d["reason"], 0) + 1
            g = {"candidates": {"var": grouping["var"], "items": cands, "total": total_c,
                                "truncated": len(cands) < total_c},
                 "candidate_groups": {"criteria": grouping["criteria"], "items": grouping["groups"],
                                      "chosen_group": grouping.get("chosen_group")},
                 "group_support": {"value": grouping.get("support"), "method": grouping["support_method"],
                                   "support_member": self.ref(kind_of(grouping["support_member"]),
                                                              grouping["support_member"])
                                   if grouping.get("support_member") else None},
                 "representative": self.ref(kind_of(grouping["representative"]), grouping["representative"])
                 if grouping.get("representative") else None,
                 "representative_reason": {"order": grouping["representative_order"],
                                           "text": chosen["representative_reason"] if chosen else None},
                 "rejected_candidates": {"items": rejected, "total": len(rejected)},
                 "rejection_reasons": [{"reason": k, "count": v} for k, v in sorted(reasons.items())]}
            if len(cands) < total_c:
                limitations.append(f"candidati registrati: {len(cands)} su {total_c}")
        if isinstance(rule, dict) and rule["newer_versions"]:
            limitations.append("esiste una versione più recente della regola: " + ", ".join(rule["newer_versions"]))
        if row["status"] != "active":
            limitations.append(f"insight in stato {row['status']}")
        comps = [{"ref": m["ref"], "explanation": self._row("insight", m["ref"]["id"])["explanation"],
                  "confidence": self._row("insight", m["ref"]["id"])["confidence"]}
                 for m in members if m["ref"] and m["ref"]["kind"] == "insight"]
        data = {"focus": focus, "kind": "insight",
                "rule": rule, "rule_version": row["rule_version"], **g,
                "evidence": {"members": members, "relation_evidence": relation_evidence},
                "independent_sources": self._independence(ev_rows),
                "confidence": dict(conf, text=row["confidence_text"]),
                "confidence_factors": focus["confidence_factors"],
                "recomputed": self._recomputed(row["factors_json"], row["confidence"]),
                "components": comps, "explanation": {"text": row["explanation"], "origin": "rule_template"},
                "member_ids": mem_ids,
                "provenance_complete": self.provenance_chain(eid)["data"]["complete"],
                "limitations": limitations}
        return self._envelope(data, t0, Budget.of(None), lod="details", total=1, returned=1)
