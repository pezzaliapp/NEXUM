"""Phase 2 local query service: contract, budgets, cancellation, network surface, trails, governance.
W1, W2, W4, W5, W6, W7, W9, W10, W22, W31 (and the API side of W18–W20). Real D1, synthetic D2 and D3."""

import ast
import concurrent.futures as cf_
import http.client
import json
import pathlib
import random
import re
import subprocess
import sys
import threading
import time
import urllib.parse

import pytest

from nexum import worlds
from nexum.api.server import Service, serve
from nexum.core.correlate import FORBIDDEN_WORDS
from nexum.core.db import connect, logical_hash
from tests.conftest import D1_DB, ROOT, eid
from tests.test_domain_agnostic import FORBIDDEN
from tests.test_governance import OSIRIS

ENVELOPE = {"data", "lod", "total", "returned", "truncated", "cursor_next", "excluded", "facets", "highlight",
            "sources", "world_version", "as_of", "timing_ms", "bytes", "api"}
D2_DB = ROOT / "data" / "d2" / "nexum.db"
D3_DB = ROOT / "data" / "d3" / "nexum.db"


class Client:
    def __init__(self, port):
        self.port = port

    def req(self, method, path, params=None, body=None, headers=None, raw=False):
        q = ""
        if params:
            q = "?" + urllib.parse.urlencode({k: json.dumps(v) if isinstance(v, (dict, list)) else v
                                              for k, v in params.items() if v is not None})
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        h = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        c.request(method, path + q, body=data, headers=h)
        r = c.getresponse()
        payload = r.read()
        hdrs = dict(r.getheaders())
        c.close()
        if raw:
            return r.status, hdrs, payload
        return r.status, hdrs, (json.loads(payload) if payload else None)

    def get(self, _path, **params):
        return self.req("GET", "/api/v1" + _path, params)


def ro(svc):
    import sqlite3
    c = sqlite3.connect(pathlib.Path(svc.cfg.db_path).resolve().as_uri() + "?mode=ro", uri=True)
    return c


def start(cfg, world, tmp=None, **kw):
    trails = kw.pop("trails_path", None) or ((tmp / f"trails-{world}.sqlite") if tmp else None)
    svc = Service(cfg, world, ui_dir=str(ROOT / "ui" / "dist"), trails_path=trails, **kw)
    httpd = serve(svc, "127.0.0.1", 0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return svc, httpd, Client(httpd.server_address[1])


@pytest.fixture(scope="module")
def d1_api(tmp_path_factory):
    if not D1_DB.exists():
        pytest.fail("D1 world missing: build it first")
    svc, httpd, c = start(worlds.d1(), "d1", tmp_path_factory.mktemp("trails"))
    yield svc, c
    httpd.shutdown()
    svc.close()


@pytest.fixture(scope="module")
def d3_api(tmp_path_factory):
    if not D3_DB.exists():
        pytest.fail("D3 world missing: build it first")
    svc, httpd, c = start(worlds.d3(), "d3", tmp_path_factory.mktemp("trails3"))
    yield svc, c
    httpd.shutdown()
    svc.close()


@pytest.fixture(scope="module")
def d2_api(tmp_path_factory):
    if not D2_DB.exists():
        pytest.fail("D2 world missing: generate and load it first (bench/load_d2.py)")
    svc, httpd, c = start(worlds.d2(), "d2", tmp_path_factory.mktemp("trails2"), response_cache=False)
    yield svc, c
    httpd.shutdown()
    svc.close()


def ids(conn):
    return {"quake": eid(conn, "usgs", "us7000pn9s"), "mm": eid(conn, "iso3166a3", "MMR"),
            "act": eid(conn, "cems", "EMSR798"), "vymd": eid(conn, "icao", "VYMD"),
            "rel": conn.execute("SELECT relation_id FROM relation ORDER BY relation_id LIMIT 1").fetchone()[0],
            "ins": conn.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND "
                                "status='active' ORDER BY insight_id LIMIT 1").fetchone()[0]}


def endpoints(i):
    vp = {"viewport": [90, 10, 101, 28], "z": 6}
    return [
        ("/status", {}), ("/types", {}), ("/sources", {}), ("/facets", {"s": {}}),
        ("/projections/map", {"s": vp}), ("/projections/map", {"s": {"viewport": [95, 21, 97, 23], "z": 12}}),
        ("/projections/timeline", {"s": {}}), ("/search", {"q": "Mandalay"}), ("/insights", {}),
        (f"/entities/{i['quake']}", {}), (f"/context/{i['quake']}", {}), (f"/context/{i['mm']}", {}),
        (f"/entities/{i['mm']}/relations", {}), (f"/entities/{i['mm']}/events", {}),
        (f"/entities/{i['quake']}/objects", {}), (f"/entities/{i['rel']}/evidence", {}),
        (f"/entities/{i['quake']}/supports", {}), (f"/entities/{i['ins']}/sources", {}),
        (f"/provenance/{i['ins']}", {}), (f"/entities/{i['mm']}/timeline", {}),
        (f"/entities/{i['quake']}/timeline/neighbors", {}), (f"/entities/{i['quake']}/timeline/step", {"dir": "next"}),
        (f"/entities/{i['quake']}/spatial/nearby", {"km": 100}), (f"/entities/{i['quake']}/spatial/containing", {}),
        (f"/entities/{i['mm']}/spatial/contained", {}), (f"/entities/{i['quake']}/locate", {}),
        ("/graph/neighborhood", {"focus": i["mm"], "depth": 1}),
        ("/graph/expand", {"node": i["mm"], "edge_kind": "relation", "type": "located_in", "dir": "in"}),
        ("/graph/path", {"a": i["vymd"], "b": i["quake"]}), ("/changes", {"since": 0}),
        (f"/explain/{i['ins']}", {}), (f"/explain/{i['rel']}", {}),
    ]


# ── contract ────────────────────────────────────────────────────────────────
def test_every_endpoint_returns_the_core_envelope(d1_api, d1_conn):
    _, c = d1_api
    for path, params in endpoints(ids(d1_conn)):
        st, h, body = c.get(path, **params)
        assert st == 200, (path, body)
        assert ENVELOPE <= set(body), (path, ENVELOPE - set(body))
        assert body["bytes"] <= 2_000_000 and isinstance(body["world_version"], int)
        assert "Access-Control-Allow-Origin" not in h


def test_d3_endpoints_without_geography(d3_api, d3_world):
    _, c = d3_api
    st, _, s = c.get("/status")
    assert st == 200 and s["data"]["has_geometry"] is False and s["data"]["geometry"]["with_geometry"] == 0
    st, _, m = c.get("/projections/map", s={"viewport": [-180, -85, 180, 85], "z": 2})
    assert st == 200 and m["total"] == 0 and m["excluded"]["no_geometry"] > 0
    vuln = eid(d3_world.conn, "vulnid", "VULN-TEST-0001")
    st, _, ctx = c.get(f"/context/{vuln}")
    assert st == 200 and ctx["data"]["geography"] == {"not_applicable": "this element has no geometry"}


def test_raw_record_and_rule_endpoints(d1_api, d1_query, d1_conn):
    _, c = d1_api
    ev = d1_query.evidence_of(eid(d1_conn, "usgs", "us7000pn9s"))["data"]["items"][0]["support"]
    st, _, r = c.get(f"/raw/{ev['raw_id']}", path=ev["locator"])
    assert st == 200 and r["data"]["record"]["id"] == "us7000pn9s" and r["data"]["licence"]["license_id"]
    assert r["data"]["sha256"] == ev["raw_sha256"]
    st, _, _ = c.get(f"/raw/{ev['raw_id']}", path="$.nothing[3]")
    assert st == 404
    st, _, rule = c.get("/rules/event_event_association", version="2")
    assert st == 200 and "72h" in rule["data"]["definition_toml"] and rule["data"]["archived"] is False
    st, _, rule = c.get("/rules/event_event_association", version="1")
    assert st == 200 and rule["data"]["archived"] is True


# ── W18–W20: WHY through the API ─────────────────────────────────────────────
def test_w18_why_myanmar_through_the_api(d1_api, d1_conn):
    _, c = d1_api
    act = eid(d1_conn, "cems", "EMSR798")
    iid = d1_conn.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND anchor_id=? "
                          "AND status='active'", (act,)).fetchone()[0]
    st, _, r = c.get(f"/explain/{iid}")
    d = r["data"]
    assert st == 200 and d["rule_version"] == "2" and len(d["candidates"]["items"]) == 2
    assert abs(d["group_support"]["value"] - 0.682) < 5e-4
    assert d["representative"]["id"] == eid(d1_conn, "usgs", "us7000pn9s")
    assert d["rejected_candidates"]["items"][0]["reason"] == "membro del gruppo scelto, non rappresentante"


# ── W4: network surface ──────────────────────────────────────────────────────
def test_w4_network_surface(d1_api):
    svc, c = d1_api
    with pytest.raises(SystemExit):
        serve(svc, "0.0.0.0", 0)
    st, _, body = c.req("GET", "/api/v1/status", headers={"Host": "attacker.example:80"})
    assert st == 421
    st, h, _ = c.req("GET", "/api/v1/status", headers={"Origin": "http://attacker.example"})
    assert st == 200 and not any(k.lower().startswith("access-control-") for k in h)
    st, h, _ = c.req("GET", "/", raw=True)
    assert "default-src 'self'" in h.get("Content-Security-Policy", "")


# ── W6: unbounded requests are impossible ────────────────────────────────────
def test_w6_unbounded_requests_are_refused_or_reduced(d1_api, d1_conn):
    _, c = d1_api
    i = ids(d1_conn)
    assert c.get("/projections/map", s={})[0] == 400
    assert c.get("/projections/map", s={"viewport": [0, 0, 10, 10]})[0] == 400
    assert c.get(f"/entities/{i['mm']}/timeline", window=[0, 11 * 365 * 86400 * 1000])[0] == 400
    assert c.get("/graph/path", a=i["mm"], b=i["quake"], max_hops=5)[0] == 400
    assert c.get("/graph/neighborhood", focus=i["mm"], depth=4)[0] == 400
    assert c.get("/search", q="a")[0] == 400
    assert c.get(f"/entities/{i['quake']}/spatial/nearby", km=5000)[0] == 400
    st, _, r = c.get("/projections/map", s={"viewport": [-180, -85, 180, 85], "z": 12}, b={"max_items": 10 ** 9})
    assert st == 200 and r["api"]["budget_applied"]["max_items"] == {"requested": 10 ** 9, "applied": 5000}
    assert r["returned"] <= 5000
    st, _, r = c.get("/insights", b={"max_items": 99999, "max_bytes": 10 ** 9})
    assert st == 200 and r["returned"] <= 500 and r["bytes"] <= 10_000_000
    st, _, r = c.get("/projections/timeline", s={"time_window": [0, 1790000000000]}, bucket="hour")
    assert st == 200 and r["api"]["budget_applied"]["bucket"]["applied"] in ("month", "year")


# ── W5: fuzzing — budgets always hold, envelope always complete ──────────────
def random_request(rnd, i, world):
    kind = rnd.choice(["map", "timeline", "search", "insights", "context", "relations", "events", "objects", "evidence",
                       "neighborhood", "expand", "path", "facets", "nearby", "explain", "changes", "entity"])
    b = {"max_items": rnd.choice([1, 5, 50, 500, 5000, 100000])}
    if rnd.random() < 0.3:
        b["max_bytes"] = rnd.choice([8192, 50_000, 2_000_000, 50_000_000])
    focus = rnd.choice(i["focus"])
    w = rnd.uniform(-180, 170)
    s = rnd.uniform(-85, 75)
    vp = [round(w, 3), round(s, 3), round(min(180, w + rnd.choice([0.1, 2, 20, 360])), 3),
          round(min(85, s + rnd.choice([0.1, 2, 20, 170])), 3)]
    if kind == "map":
        return "/projections/map", {"s": {"viewport": vp, "z": rnd.randint(0, 16)}, "b": b}, b
    if kind == "timeline":
        t0 = rnd.randint(1_300_000_000_000, 1_790_000_000_000)
        return "/projections/timeline", {"s": {"time_window": [t0, t0 + rnd.choice([3600e3, 86400e3 * 30, 86400e3 * 3650])]},
                                         "bucket": rnd.choice(["auto", "day", "hour", "month", "year"]), "b": b}, b
    if kind == "search":
        return "/search", {"q": rnd.choice(i["words"]), "b": b}, b
    if kind == "neighborhood":
        nb = {"max_nodes": rnd.choice([5, 200, 2000, 99999]), "max_edges": rnd.choice([10, 400, 4000, 99999])}
        return "/graph/neighborhood", {"focus": focus, "depth": rnd.randint(1, 3), "b": nb}, nb
    if kind == "expand":
        return "/graph/expand", {"node": focus, "edge_kind": rnd.choice(["relation", "participation"]),
                                 "type": rnd.choice(i["etypes"]), "dir": rnd.choice(["in", "out"]),
                                 "b": {"max_nodes": b["max_items"]}}, {"max_items": min(b["max_items"], 1000)}
    if kind == "path":
        return "/graph/path", {"a": focus, "b": rnd.choice(i["focus"]), "max_hops": rnd.randint(1, 4)}, {}
    if kind == "nearby":
        return f"/entities/{focus}/spatial/nearby", {"km": rnd.randint(1, 500), "b": b}, b
    if kind == "explain":
        return f"/explain/{rnd.choice(i['explainable'])}", {}, {}
    if kind == "changes":
        return "/changes", {"since": rnd.randint(0, 50), "b": b}, b
    if kind == "facets":
        return "/facets", {"s": {"min_confidence": rnd.choice([0, 0.5, 0.8])}}, {}
    if kind == "insights":
        return "/insights", {"b": b}, b
    if kind == "entity":
        return f"/entities/{focus}", {"lod": rnd.choice(["refs", "details"])}, {}
    path = {"context": f"/context/{focus}", "relations": f"/entities/{focus}/relations",
            "events": f"/entities/{focus}/events", "objects": f"/entities/{focus}/objects",
            "evidence": f"/entities/{focus}/evidence"}[kind]
    return path, {"b": b}, b


def fuzz_ids(conn):
    focus = [r[0] for r in conn.execute("SELECT object_id FROM object ORDER BY object_id LIMIT 30")]
    focus += [r[0] for r in conn.execute("SELECT event_id FROM event ORDER BY event_id LIMIT 30")]
    focus += [r[0] for r in conn.execute("SELECT insight_id FROM insight ORDER BY insight_id LIMIT 10")]
    explainable = [r[0] for r in conn.execute("SELECT insight_id FROM insight ORDER BY insight_id LIMIT 20")]
    explainable += [r[0] for r in conn.execute("SELECT relation_id FROM relation ORDER BY relation_id LIMIT 20")]
    words = [w for (l,) in conn.execute("SELECT label FROM object ORDER BY object_id LIMIT 60") for w in l.split()
             if len(w) >= 2][:80] or ["test"]
    etypes = [r[0] for r in conn.execute("SELECT DISTINCT type FROM edge LIMIT 20")] if conn.execute(
        "SELECT 1 FROM edge LIMIT 1").fetchone() else ["x"]
    return {"focus": focus, "explainable": explainable, "words": words, "etypes": etypes}


def list_lengths(x, out=None):
    """(key, length) of every result list in a response (items, cells, entries, nodes, edges), at any depth."""
    out = [] if out is None else out
    if isinstance(x, dict):
        for k, v in x.items():
            if isinstance(v, list) and k in ("items", "cells", "entries", "nodes", "edges"):
                out.append((k, len(v)))
            list_lengths(v, out)
    elif isinstance(x, list):
        for v in x:
            list_lengths(v, out)
    return out


def test_w5_fuzz_budgets_hold(d1_api, d2_api, d3_api):
    rnd = random.Random(20260929)
    failures, n = [], 0
    for (svc, c), per in ((d1_api, 800), (d3_api, 400), (d2_api, 800)):
        conn = ro(svc)
        i = fuzz_ids(conn)
        for _ in range(per):
            path, params, b = random_request(rnd, i, svc.world_id)
            st, h, raw = c.req("GET", "/api/v1" + path, params, raw=True)
            n += 1
            if st >= 500 and st != 504:
                failures.append((svc.world_id, path, params, st, raw[:200]))
                continue
            if st != 200:
                continue
            body = json.loads(raw)
            if not ENVELOPE <= set(body):
                failures.append((path, "envelope", ENVELOPE - set(body)))
            max_bytes = min(10_000_000, (b.get("max_bytes") or 2_000_000))
            if len(raw) > max(max_bytes, 8192):
                failures.append((path, "bytes", len(raw), max_bytes))
            applied = (body.get("api", {}).get("budget_applied") or {}).get("max_items", {}).get("applied")
            if applied:
                b = dict(b, max_items=applied)
            limits = {"items": min(b.get("max_items", 10 ** 9), 5000), "cells": min(b.get("max_items", 10 ** 9), 5000),
                      "entries": min(b.get("max_items", 10 ** 9), 5000),
                      "nodes": min(b.get("max_nodes", 10 ** 9), 2000), "edges": min(b.get("max_edges", 10 ** 9), 4000)}
            for key, ln in list_lengths(body["data"]):
                if ln > limits[key]:
                    failures.append((path, key, ln, limits[key]))
    assert n == 2000
    assert failures == [], failures[:5]


# ── W7: cancellation ────────────────────────────────────────────────────────
def test_w7_superseded_requests_are_interrupted(d2_api):
    svc, c = d2_api
    before = svc.registry.snapshot()
    rnd = random.Random(7)
    chan = f"test-{rnd.random()}/map"

    def one(k):
        w = -170 + k * 3.1
        return c.req("GET", "/api/v1/projections/map",
                     {"s": {"viewport": [w, -60, w + 60, 60], "z": 9}, "b": {"max_items": 5000, "lod": "refs"}},
                     headers={"X-Nexum-Channel": chan, "X-Nexum-Seq": str(k)})[0]

    with cf_.ThreadPoolExecutor(max_workers=12) as ex:
        futs = []
        for k in range(1, 51):
            futs.append(ex.submit(one, k))
            time.sleep(0.03)
        codes = [f.result() for f in futs]
    after = svc.registry.snapshot()
    stopped = (after["superseded_interrupted"] - before["superseded_interrupted"]) + \
              (after["superseded_not_started"] - before["superseded_not_started"])
    completed = after["superseded_completed"] - before["superseded_completed"]
    assert codes[-1] == 200
    assert stopped + completed > 0
    assert stopped / (stopped + completed) >= 0.90, (stopped, completed, codes)


def test_deadline_interrupts_long_queries(d2_api):
    svc, c = d2_api
    hub = ro(svc).execute("SELECT entity_id FROM degree ORDER BY count DESC LIMIT 1").fetchone()[0]
    st, _, body = c.get("/graph/path", a=hub, b=ro(svc).execute(
        "SELECT object_id FROM object ORDER BY object_id DESC LIMIT 1").fetchone()[0], max_hops=4)
    assert st in (200, 504)
    if st == 504:
        assert body["error"]["code"] == "deadline_exceeded" and body["error"]["hint"]


# ── W31: trails (TRAIL DB separate from the WORLD DB) ────────────────────────
def test_w31_trails_persist_export_import_and_never_touch_the_world(tmp_path, d1_conn):
    h0 = logical_hash(d1_conn)
    trails = tmp_path / "trails.sqlite"
    svc, httpd, c = start(worlds.d1(), "d1", None, trails_path=trails)
    i = ids(d1_conn)
    steps = [{"ref": r, "scope": {}, "label": r} for r in (i["mm"], i["vymd"], i["quake"], i["ins"], i["mm"])]
    steps.append({"ref": "evt_" + "z" * 26, "scope": {}, "label": "sparito"})   # a reference that no longer exists
    for k in range(100):
        st, _, _ = c.req("PUT", f"/api/v1/trails/t-{k % 5}", body={"name": f"Indagine {k}", "steps": steps})
        assert st == 200
    st, _, lst = c.req("GET", "/api/v1/trails")
    assert st == 200 and len(lst["data"]["items"]) == 5
    st, _, exp = c.req("GET", "/api/v1/trails/t-1/export")
    assert exp["format"] == "nexum-trail" and exp["version"] == 1 and len(exp["trail"]["steps"]) == 6
    httpd.shutdown()
    svc.close()
    # restart: the trail survives
    svc2, httpd2, c2 = start(worlds.d1(), "d1", None, trails_path=trails)
    st, _, t = c2.req("GET", "/api/v1/trails/t-1")
    assert st == 200 and [s["ref"] for s in t["data"]["steps"]] == [s["ref"] for s in steps]
    assert c2.req("GET", f"/api/v1/entities/{'evt_' + 'z' * 26}")[0] == 404   # shown as "non più presente" by the UI
    assert c2.req("DELETE", "/api/v1/trails/t-1")[0] == 200
    st, _, imp = c2.req("POST", "/api/v1/trails/import", body=exp)
    assert st == 201 and [s["ref"] for s in imp["data"]["steps"]] == [s["ref"] for s in exp["trail"]["steps"]]
    st, _, exp2 = c2.req("GET", f"/api/v1/trails/{imp['data']['trail_id']}/export")
    assert exp2["trail"]["steps"] == exp["trail"]["steps"] and exp2["trail"]["name"] == exp["trail"]["name"]
    assert c2.req("PUT", "/api/v1/trails/bad", body={"steps": [{"ref": "DROP TABLE"}]})[0] == 400
    httpd2.shutdown()
    svc2.close()
    assert logical_hash(d1_conn) == h0
    assert trails.exists() and trails.resolve() != D1_DB.resolve()


# ── W1, W2, W9, W10, W22: governance ─────────────────────────────────────────
def test_w1_core_changed_only_by_the_additive_explain():
    """W1 (as amended by the author on 2026-09-29): the Core may differ from Phase 1 only by the additive read-only
    Query.explain (D1) and by the authorized A3 optimization of related_events / entity_timeline (same output)."""
    import difflib
    changed_files = subprocess.run(["git", "diff", "--name-only", "7c62b6b", "--", "nexum/core"], cwd=ROOT,
                                   capture_output=True, text=True, check=True).stdout.split()
    assert changed_files in ([], ["nexum/core/query.py"])
    old = subprocess.run(["git", "show", "7c62b6b:nexum/core/query.py"], cwd=ROOT, capture_output=True, text=True,
                         check=True).stdout
    new = (ROOT / "nexum" / "core" / "query.py").read_text()

    def functions(src):
        tree = ast.parse(src)
        out = {}
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                for child in node.body if isinstance(node, ast.ClassDef) else []:
                    if isinstance(child, (ast.FunctionDef, ast.Assign)):
                        name = child.name if isinstance(child, ast.FunctionDef) else ast.unparse(child.targets[0])
                        out[f"{node.name}.{name}"] = ast.unparse(child)
            elif isinstance(node, ast.FunctionDef) and node.col_offset == 0:
                out[node.name] = ast.unparse(node)
        top = [ast.unparse(n) for n in tree.body if not isinstance(n, (ast.FunctionDef, ast.ClassDef))]
        return out, top

    (fo, top_o), (fn, top_n) = functions(old), functions(new)
    allowed_new = {"Query._na", "Query._rule_definition", "Query._independence", "Query._recomputed", "Query.explain",
                   "Query._EVENT_REF_COLS", "Query._event_rows", "Query._related_with_rows"}
    allowed_changed = {"Query.related_events", "Query.entity_timeline"}
    assert set(fo) - set(fn) == set(), "no Phase 1 function removed"
    assert set(fn) - set(fo) <= allowed_new, set(fn) - set(fo) - allowed_new
    changed = {k for k in fo if fo[k] != fn[k]}
    assert changed <= allowed_changed, changed - allowed_changed
    assert [t for t in top_n if t not in top_o] == ["import heapq"], [t for t in top_n if t not in top_o]
    assert list(difflib.unified_diff(old.splitlines(), new.splitlines()))


def test_w2_python_side_uses_only_the_standard_library():
    std = set(sys.stdlib_module_names)
    for p in (ROOT / "nexum" / "api").glob("*.py"):
        for node in ast.walk(ast.parse(p.read_text())):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else \
                [node.module] if isinstance(node, ast.ImportFrom) and node.level == 0 else []
            for m in mods:
                top = m.split(".")[0]
                assert top in std or top in ("nexum", "connectors"), (p.name, m)


def ui_sources():
    return sorted(p for p in (ROOT / "ui" / "src").rglob("*") if p.suffix in (".ts", ".tsx", ".css"))


def test_w9_no_domain_terms_in_api_and_ui():
    hits = []
    for p in list((ROOT / "nexum" / "api").glob("*.py")) + ui_sources() + [ROOT / "ui" / "index.html"]:
        text = p.read_text(encoding="utf-8").lower()
        for term in FORBIDDEN:
            if re.search(r"\b" + re.escape(term) + r"\b", text):
                hits.append((p.name, term))
    assert hits == [], hits


def test_w22_ui_strings_are_non_causal_and_non_probabilistic():
    text = "\n".join(l for l in (ROOT / "ui" / "src" / "lib" / "strings.ts").read_text(encoding="utf-8").lower()
                     .splitlines() if not l.strip().startswith("//"))
    assert [w for w in FORBIDDEN_WORDS if w in text] == []
    assert "probab" not in text and "causato" not in text


def test_w10_no_osiris_material_in_phase2_files():
    """W10 uses the same content classification as P25 (code, assets, data, dependency metadata)."""
    from tests.test_governance import osiris_findings, osiris_index
    if not OSIRIS.exists():
        pytest.fail("OSIRIS-REFERENCE not found: cannot verify W10")
    files = list((ROOT / "nexum" / "api").glob("*.py")) + [p for p in (ROOT / "ui").rglob("*") if p.is_file() and
                                                            "node_modules" not in p.parts and "dist" not in p.parts
                                                            and "test-results" not in p.parts] + \
        list((ROOT / "bench" / "phase2").glob("*")) + [ROOT / "config" / "basemap.toml"]
    assert osiris_findings(files, osiris_index()) == []


def test_w2_licence_policy_runtime_vs_build_only(tmp_path):
    """W2: runtime/distributed and build-only packages are checked separately; MPL-2.0 is accepted only through the
    nominal, verified build-only exception approved on 2026-09-29 — never as a general rule."""
    ui = ROOT / "ui"
    run = lambda env=None: subprocess.run(["node", "scripts/check-licenses.mjs"], cwd=ui, capture_output=True,  # noqa: E731
                                          text=True, env={**__import__("os").environ, **(env or {})})
    ok = run()
    assert ok.returncode == 0, ok.stdout[-2000:]
    rep = json.loads((ROOT / "data" / "reports" / "phase2" / "licenses.json").read_text())
    assert {e["name"] for e in rep["exceptions_used"]} <= {"lightningcss", "lightningcss-darwin-arm64"}
    assert all(r["license"] != "MPL-2.0" for r in rep["list"] if r["class"] == "runtime_distributed")
    policy = json.loads((ui / "license-policy.json").read_text())
    # negative 1: without the exception the same tree fails
    no_ex = dict(policy, build_only=dict(policy["build_only"], exceptions=[]))
    (tmp_path / "p1.json").write_text(json.dumps(no_ex))
    assert run({"NEXUM_LICENSE_POLICY": str(tmp_path / "p1.json")}).returncode == 1
    # negative 2: an exception that names other packages does not cover lightningcss
    other = dict(policy, build_only=dict(policy["build_only"], exceptions=[dict(policy["build_only"]["exceptions"][0],
                                                                               packages=["some-other-tool"])]))
    (tmp_path / "p2.json").write_text(json.dumps(other))
    assert run({"NEXUM_LICENSE_POLICY": str(tmp_path / "p2.json")}).returncode == 1
    json.loads((ROOT / "data" / "reports" / "phase2" / "licenses.json").read_text())
    assert run().returncode == 0   # leave the real report in place
