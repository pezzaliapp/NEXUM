"""ONE WORLD — MULTIPLE VIEWS: contract (P21), cross-view references (P30), pivots (P31), evidence (P32),
budgets (P33), aggregates (P34), OBJECT MODE (P37), optional geography (P38). Real D1 + synthetic D3."""

import json
import random

import pytest

from nexum.core.query import Budget, QueryError
from tests.conftest import eid

ENVELOPE = {"data", "lod", "total", "returned", "truncated", "cursor_next", "excluded", "facets", "highlight",
            "sources", "world_version", "as_of", "timing_ms", "bytes"}
REF_KEYS = {"kind", "id", "type", "label"}


def check_envelope(r):
    assert set(r) >= ENVELOPE, set(r) ^ ENVELOPE
    assert r["lod"] in ("counts", "aggregates", "refs", "details")
    assert isinstance(r["truncated"], bool) and isinstance(r["world_version"], int)
    assert isinstance(r["sources"], list)
    json.dumps(r, default=str)
    return r


def walk_refs(x, out):
    if isinstance(x, dict):
        if REF_KEYS <= set(x) and x.get("kind") in ("object", "event", "relation", "insight"):
            out.append(x)
        for v in x.values():
            walk_refs(v, out)
    elif isinstance(x, list):
        for v in x:
            walk_refs(v, out)
    return out


def all_operations(q, conn, focus, rel, ins, obj_area):
    small = {"max_items": 20}
    return {
        "get_entity": q.get_entity(focus), "context": q.context(focus), "relations": q.relations(obj_area),
        "related_events": q.related_events(obj_area, budget=small), "related_objects": q.related_objects(focus),
        "neighborhood": q.neighborhood(obj_area, 2), "expand": q.expand(obj_area, "relation", "located_in", "in", small)
        if conn.execute("SELECT 1 FROM degree WHERE entity_id=? AND type='located_in'", (obj_area,)).fetchone()
        else q.expand(obj_area, "relation", "produced_by", "in", small),
        "path": q.path(focus, obj_area), "project_map": q.project_map({"viewport": [-180, -90, 180, 90], "z": 2}),
        "project_timeline": q.project_timeline({}), "entity_timeline": q.entity_timeline(obj_area),
        "timeline_neighbors": q.timeline_neighbors(focus), "nearby": q.nearby(focus, 100),
        "containing": q.containing(focus), "contained": q.contained(obj_area, budget=small),
        "search": q.search("test Mandalay Myanmar"), "facets": q.facets({}), "insights": q.insights(),
        "get_insight": q.get_insight(ins), "evidence_of": q.evidence_of(rel), "supported": q.supported(focus),
        "sources_of": q.sources_of(ins), "provenance_chain": q.provenance_chain(ins), "sources": q.list_sources(),
        "types": q.list_types(), "locate": q.locate(focus, focus=obj_area), "changes_since": q.changes_since(0, budget=small),
        "trail_context": q.trail_context([focus, obj_area], budget=small),
        "list_entities": q.list_entities({}, "event", small),
    }


def d1_ids(conn):
    return (eid(conn, "usgs", "us7000pn9s"), conn.execute("SELECT relation_id FROM relation LIMIT 1").fetchone()[0],
            conn.execute("SELECT insight_id FROM insight WHERE status='active' AND rule_id='composite_context'"
                         ).fetchone()[0], eid(conn, "iso3166a3", "MMR"))


def d3_ids(conn):
    return (eid(conn, "vulnid", "VULN-TEST-0001"), conn.execute("SELECT relation_id FROM relation WHERE type='affects' "
                                                                "LIMIT 1").fetchone()[0],
            conn.execute("SELECT insight_id FROM insight WHERE status='active' LIMIT 1").fetchone()[0],
            eid(conn, "orgid", "ORG-ALPHA"))


def test_p21_every_operation_returns_a_valid_envelope(d1_query, d1_conn, d3_query, d3_world):
    for q, conn, ids in ((d1_query, d1_conn, d1_ids(d1_conn)), (d3_query, d3_world.conn, d3_ids(d3_world.conn))):
        ops = all_operations(q, conn, *ids)
        assert len(ops) >= 29
        for name, r in ops.items():
            check_envelope(r)
            for ref in walk_refs(r["data"], []):
                assert set(ref) >= REF_KEYS, name


def test_p33_budgets_are_always_enforced(d1_query, d1_conn):
    focus, rel, ins, area = d1_ids(d1_conn)
    tiny = {"max_items": 3, "max_nodes": 5, "max_edges": 5, "max_bytes": 20_000}
    cases = [d1_query.context(area, budget=tiny), d1_query.related_events(area, budget=tiny),
             d1_query.neighborhood(area, 2, budget=tiny), d1_query.insights(budget=tiny),
             d1_query.contained(area, budget=tiny), d1_query.search("airport", budget=tiny),
             d1_query.project_map({"viewport": [90, 10, 110, 30], "z": 12}, budget=tiny),
             d1_query.list_entities({}, "object", tiny), d1_query.changes_since(0, budget=tiny),
             d1_query.entity_timeline(area, budget=tiny), d1_query.trail_context([focus, area], budget=tiny)]
    for r in cases:
        assert r["bytes"] <= tiny["max_bytes"], r["bytes"]
        for key in ("items", "cells", "edges", "entries", "groups"):
            if isinstance(r["data"], dict) and isinstance(r["data"].get(key), list):
                assert len(r["data"][key]) <= max(tiny["max_items"], tiny["max_edges"])
        if r["lod"] == "aggregates" and isinstance(r["data"].get("cells"), list):
            # aggregates represent every element: truncation only if cells were dropped
            assert r["truncated"] or sum(c["n"] for c in r["data"]["cells"]) == r["total"]
        elif r["total"] is not None and r["returned"] is not None and r["returned"] < r["total"]:
            assert r["truncated"]
    n = d1_query.neighborhood(area, 2, budget=tiny)["data"]
    assert len(n["nodes"]) <= 5 and len(n["edges"]) <= 5
    # budgets above the maximum are clamped, invalid ones rejected: no operation runs without a limit
    assert Budget.of({"max_items": 10**9}).max_items == 5000
    with pytest.raises(QueryError):
        Budget.of({"max_items": 0})


def sample_ids(conn, n, seed=30):
    rnd = random.Random(seed)
    ids = [r[0] for r in conn.execute("SELECT object_id FROM object ORDER BY object_id")]
    ids = rnd.sample(ids, min(len(ids), n // 2))
    ev = [r[0] for r in conn.execute("SELECT event_id FROM event ORDER BY event_id")]
    ids += rnd.sample(ev, min(len(ev), n // 2 - 20))
    ids += [r[0] for r in conn.execute("SELECT insight_id FROM insight WHERE status='active' ORDER BY insight_id LIMIT 20")]
    return ids


def ref_in(r, eid_):
    return [x for x in walk_refs(r["data"], []) if x["id"] == eid_]


def test_p30_same_reference_in_every_view(d1_query, d1_conn, d3_query, d3_world):
    checked = 0
    for q, conn, n in ((d1_query, d1_conn, 200), (d3_query, d3_world.conn, 40)):
        for e in sample_ids(conn, n):
            base = q.get_entity(e)["data"]
            ref = {k: base[k] for k in REF_KEYS}
            views = [q.context(e)["data"]["focus"], q.neighborhood(e, 1)["data"]["nodes"][0],
                     q.locate(e)["data"]["ref"]]
            srch = q.search(ref["label"], budget={"max_items": 200})
            views += ref_in(srch, e)
            row = conn.execute("SELECT lon, lat FROM object WHERE object_id=? UNION ALL SELECT lon, lat FROM event WHERE "
                               "event_id=? UNION ALL SELECT lon, lat FROM insight WHERE insight_id=?", (e, e, e)).fetchone()
            if row and row[0] is not None:
                vp = [row[0] - 0.01, row[1] - 0.01, row[0] + 0.01, row[1] + 0.01]
                views += ref_in(q.project_map({"viewport": vp, "z": 12}, budget={"max_items": 5000}), e)
            t = conn.execute("SELECT t_start_ms FROM event WHERE event_id=? UNION ALL SELECT t_start_ms FROM insight "
                             "WHERE insight_id=?", (e, e)).fetchone()
            if t and t[0] is not None:
                views += ref_in(q.project_timeline({"time_window": [t[0] - 1000, t[0] + 1000]}), e)
            assert len(views) >= 4, e
            for v in views:
                assert {k: v[k] for k in REF_KEYS} == ref, (e, v)
            checked += 1
    assert checked >= 200


def test_p31_myanmar_pivot_chain(d1_query, d1_conn):
    quake, act = eid(d1_conn, "usgs", "us7000pn9s"), eid(d1_conn, "cems", "EMSR798")
    vymd, mm = eid(d1_conn, "icao", "VYMD"), eid(d1_conn, "iso3166a3", "MMR")
    comp = d1_conn.execute("SELECT i.insight_id FROM insight i JOIN evidence e ON e.supports_id=i.insight_id JOIN "
                           "insight j ON j.insight_id=e.support_id WHERE i.rule_id='composite_context' AND "
                           "i.status='active' AND j.anchor_id=?", (act,)).fetchone()[0]
    ctx = d1_query.context(quake)["data"]
    assert any(i["ref"]["id"] == comp for i in ctx["insights"]["items"])
    ctx = d1_query.context(comp)["data"]
    assert ctx["evidence"]["total"] == 2
    ctx = d1_query.context(vymd)["data"]
    assert any(it["other"]["id"] == mm for g in ctx["relations"]["groups"] for it in g["items"])
    ctx = d1_query.context(mm)["data"]
    assert ctx["related_events"]["total"] >= 10 and ctx["related_events"]["counts_by_type"]
    ctx = d1_query.context(act)["data"]
    assert any(p["object"]["id"] == mm for p in ctx["focus"]["participants"])


def test_p32_relation_evidence_traversal(d1_query, d1_conn):
    for (rid,) in d1_conn.execute("SELECT relation_id FROM relation ORDER BY relation_id LIMIT 300"):
        ev = d1_query.evidence_of(rid)["data"]
        assert ev["items"]
        for i in ev["items"]:
            s = i["support"]
            if s["kind"] == "record":
                assert s["raw_sha256"] and s["source_id"]
            else:
                assert s["kind"] in ("object", "event")


def test_p34_aggregates_are_exact(d1_query, d3_query):
    rnd = random.Random(34)
    types = [None, ["seismic.earthquake"], ["transport.airport", "place.country"], ["emergency.mapping_activation"]]
    n = 0
    for i in range(110):
        z = rnd.choice([2, 4, 6, 8, 10])
        x0, y0 = rnd.uniform(-180, 150), rnd.uniform(-80, 50)
        vp = [x0, y0, x0 + rnd.uniform(1, 60), y0 + rnd.uniform(1, 40)]
        if i % 10 == 0:
            vp = [170, -30, -170, 10]  # antimeridian
        t0 = rnd.randint(1_420_070_400_000, 1_780_000_000_000)
        scope = {"viewport": vp, "z": z, "types": rnd.choice(types),
                 "time_window": None if i % 3 else [t0, t0 + rnd.randint(1, 1500) * 86_400_000],
                 "min_confidence": rnd.choice([0, 0.5, 0.8])}
        live = d1_query.count_live(scope)
        m = d1_query.project_map(scope, budget={"lod": "aggregates"})
        assert m["total"] == live == sum(c["n"] for c in m["data"]["cells"])
        f = d1_query.facets(scope)
        for dim in ("kind", "type", "source", "band", "geometry"):
            assert sum(f["data"]["facets"][dim].values()) == live, dim
        if scope["time_window"]:
            tl = d1_query.project_timeline(dict(scope, viewport=None), budget={"lod": "aggregates"})
            live_t = d1_query.count_live(dict(scope, viewport=None, z=None), kinds=("event", "insight"))
            tl_m = d1_query.project_timeline(dict(scope, viewport=None), bucket="month", budget={"lod": "aggregates"})
            assert sum(b["n"] for b in tl_m["data"]["buckets"]) == live_t
        n += 1
    assert n >= 100


def test_p37_object_mode_myanmar(d1_query, d1_conn):
    ctx = d1_query.context(eid(d1_conn, "usgs", "us7000pn9s"))["data"]
    assert set(ctx) == {"focus", "sources", "evidence", "relations", "related_objects", "related_events", "timeline",
                        "geography", "insights"}
    assert ctx["sources"] and ctx["evidence"]["items"] and ctx["related_objects"]["items"]
    assert ctx["related_events"]["items"] and ctx["timeline"]["entries"] and ctx["insights"]["items"]
    assert ctx["geography"]["point"] and ctx["geography"]["containing"]
    assert ctx["focus"]["participants"]  # relations of an event are its participations


def test_p38_no_geometry_is_counted_not_an_error(d1_query, d1_conn):
    # airports without valid coordinates exist in the real data
    no_geo = d1_conn.execute("SELECT object_id FROM object WHERE geometry IS NULL LIMIT 1").fetchone()
    if no_geo:
        assert d1_query.nearby(no_geo[0], 50)["data"]["not_applicable"]
        assert d1_query.context(no_geo[0])["data"]["geography"]["not_applicable"]
    m = d1_query.project_map({"viewport": [-180, -90, 180, 90], "z": 2})
    live = d1_conn.execute("SELECT (SELECT COUNT(*) FROM object WHERE cx IS NULL)+(SELECT COUNT(*) FROM event WHERE "
                           "cx IS NULL)+(SELECT COUNT(*) FROM insight WHERE status='active' AND cx IS NULL)").fetchone()[0]
    assert m["excluded"]["no_geometry"] == live
