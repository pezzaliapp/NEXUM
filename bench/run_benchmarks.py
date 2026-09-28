"""Benchmarks B1–B28 (NEXUM-PHASE1-SPEC.md §26). Results → data/reports/benchmarks.json.

Latency: median and p95 over ≥ 20 measured runs at warm cache (one warm-up run each).
Targets are taken verbatim from the specification and never changed here.
"""

import dataclasses
import json
import os
import pathlib
import platform
import random
import shutil
import statistics
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from nexum import worlds as configs  # noqa: E402
from nexum.core.db import connect  # noqa: E402
from nexum.core.pipeline import Nexum, rebuild  # noqa: E402
from nexum.core.query import Query  # noqa: E402

REPORTS = ROOT / "data" / "reports"
RES = {}


def p95(xs):
    xs = sorted(xs)
    return xs[max(0, int(round(0.95 * len(xs))) - 1)]


def lat(fn, inputs, runs=20):
    """Median/p95 in ms over `runs` measurements cycling through `inputs`, after one warm-up per input."""
    for x in inputs:
        fn(x)
    ts = []
    for i in range(max(runs, len(inputs))):
        x = inputs[i % len(inputs)]
        t = time.perf_counter()
        fn(x)
        ts.append((time.perf_counter() - t) * 1000)
    return {"median_ms": round(statistics.median(ts), 2), "p95_ms": round(p95(ts), 2), "runs": len(ts)}


def record(bid, what, dataset, value, target, ok):
    RES.setdefault(bid, []).append({"measure": what, "dataset": dataset, "value": value, "target": target,
                                    "pass": bool(ok)})
    print(f"{bid:4s} {dataset:4s} {what[:60]:60s} {json.dumps(value)[:70]:70s} target {target:>16s} "
          f"{'PASS' if ok else 'FAIL'}", flush=True)


def ids(conn, sql, n, seed=26):
    rows = [r[0] for r in conn.execute(sql)]
    rnd = random.Random(seed)
    return rnd.sample(rows, min(n, len(rows)))


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    build = json.loads((REPORTS / "build.json").read_text())
    d1b = build["d1"]["process"]
    # ── ingestion (D1) ───────────────────────────────────────────────────────
    bys = d1b["by_source_s"]
    record("B1", "ingest OurAirports", "D1", round(bys["ourairports.airports"], 1), "< 30 s", bys["ourairports.airports"] < 30)
    record("B2", "ingest Natural Earth", "D1", round(bys["naturalearth.admin0"], 1), "< 10 s", bys["naturalearth.admin0"] < 10)
    record("B3", "backfill USGS (network excluded)", "D1", round(bys["usgs.earthquakes"], 1), "< 20 s", bys["usgs.earthquakes"] < 20)
    record("B4", "ingest Copernicus EMS (network excluded)", "D1", round(bys["cems.rapid_mapping"], 1), "< 5 s",
           bys["cems.rapid_mapping"] < 5)
    record("B5", "containment of all airports (enrichment)", "D1", round(d1b["enrich_s"], 1), "< 60 s", d1b["enrich_s"] < 60)
    # rebuild + batch correlation (D1)
    tmp = ROOT / "data" / "bench_tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    t = time.time()
    nx = rebuild(configs.d1(), str(tmp / "rebuild.db"))
    rb = time.time() - t
    record("B13", "full rebuild from Raw Store", "D1", round(rb, 1), "< 300 s", rb < 300)
    t = time.perf_counter()
    nx.correlate(None)
    cb = time.perf_counter() - t
    record("B12", "batch correlation (all rules, existing world)", "D1", round(cb, 2), "< 60 s", cb < 60)
    nx.close()
    shutil.rmtree(tmp, ignore_errors=True)
    # sizes
    d1db = os.path.getsize("data/d1/nexum.db")
    record("B14", "DB size (after compaction)", "D1", round(d1db / 1e6, 1), "< 500 MB", d1db < 500e6)
    record("B14", "DB size before compaction", "D1", round(build["d1"]["compact"]["before_bytes"] / 1e6, 1),
           "(informativo)", True)
    d2 = build["d2"]
    record("B14", "DB size (after compaction)", "D2", d2["db_mb"], "< 4000 MB", d2["db_mb"] < 4000)
    record("B14", "DB size before compaction", "D2", d2["db_mb_before_compact"], "(informativo)", True)
    raw = sum(p.stat().st_size for p in (ROOT / "data/d1/raw").rglob("*.gz"))
    record("B15", "Raw Store size", "D1", round(raw / 1e6, 1), "< 200 MB", raw < 200e6)
    record("B28", "D2 load (generation excluded, incl. compaction)", "D2", d2["load_s_excluding_generation"] + d2["compact_s"],
           "< 900 s", d2["load_s_excluding_generation"] + d2["compact_s"] < 900)

    # ── latency on D1 ────────────────────────────────────────────────────────
    c1 = connect("data/d1/nexum.db")
    q1 = Query(c1)
    geo_ids = ids(c1, "SELECT object_id FROM object WHERE type='transport.airport' AND lon IS NOT NULL", 25)
    ev_ids = ids(c1, "SELECT event_id FROM event", 25)
    record("B6", "nearby(point, 200 km)", "D1", lat(lambda e: q1.nearby(e, 200), geo_ids), "p95 < 20 ms",
           lat(lambda e: q1.nearby(e, 200), geo_ids)["p95_ms"] < 20)
    r = lat(lambda e: q1.get_entity(e), geo_ids + ev_ids)
    record("B7", "get_entity (details)", "D1", r, "p95 < 30 ms", r["p95_ms"] < 30)
    r = lat(lambda _: q1.project_timeline({"time_window": [1_420_070_400_000, 1_735_689_600_000]}), [0])
    record("B8", "project_timeline 10 years, auto buckets", "D1", r, "p95 < 100 ms", r["p95_ms"] < 100)
    words = ["Mandalay", "Roma", "Tokyo", "airport", "Myanmar", "EMSR798", "earthquake", "Chile", "Nepal", "Italy"]
    r = lat(lambda w: q1.search(w), words)
    record("B10", "search FTS5", "D1", r, "p95 < 50 ms", r["p95_ms"] < 50)
    ctx_ids = ev_ids[:10] + geo_ids[:10] + [c1.execute("SELECT object_id FROM object WHERE type='place.country' "
                                                         "ORDER BY object_id LIMIT 1").fetchone()[0]]
    r = lat(lambda e: q1.context(e), ctx_ids)
    record("B19", "context(focus) OBJECT MODE", "D1", r, "p95 < 150 ms", r["p95_ms"] < 150)
    ins = ids(c1, "SELECT insight_id FROM insight WHERE status='active'", 25)
    r = lat(lambda e: q1.provenance_chain(e), ins)
    record("B23", "provenance_chain of an insight", "D1", r, "p95 < 50 ms", r["p95_ms"] < 50)
    quake = c1.execute("SELECT entity_id FROM identifier WHERE scheme='usgs' AND value='us7000pn9s'").fetchone()[0]
    act = c1.execute("SELECT entity_id FROM identifier WHERE scheme='cems' AND value='EMSR798'").fetchone()[0]
    vymd = c1.execute("SELECT entity_id FROM identifier WHERE scheme='icao' AND value='VYMD'").fetchone()[0]
    mm = c1.execute("SELECT entity_id FROM identifier WHERE scheme='iso3166a3' AND value='MMR'").fetchone()[0]
    r2 = c1.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND status='active' "
                    "AND anchor_id=?", (act,)).fetchone()[0]
    comp = c1.execute("SELECT supports_id FROM evidence WHERE support_id=? AND supports_kind='insight'", (r2,)).fetchone()[0]
    chain = [quake, comp, vymd, mm, act, r2]
    r = lat(lambda _: [q1.context(x) for x in chain], [0])
    record("B26", "6-step pivot chain (one context per step)", "D1", r, "total p95 < 1000 ms", r["p95_ms"] < 1000)
    # incremental correlation on a copy (writes a new world version)
    shutil.copy("data/d1/nexum.db", "data/d1/bench_copy.db")
    nxc = Nexum(dataclasses.replace(configs.d1(), db_path=str(ROOT / "data/d1/bench_copy.db")))
    new_ev = ids(nxc.conn, "SELECT event_id FROM event WHERE type='seismic.earthquake' AND "
                           "json_extract(props_json,'$.magnitude')>=6", 25)
    r = lat(lambda e: nxc.correlate({"event": {e}}), new_ev)
    record("B11", "incremental correlation for one new element", "D1", r, "p95 < 200 ms", r["p95_ms"] < 200)
    nxc.close()
    for s in ("", "-wal", "-shm"):
        if os.path.exists("data/d1/bench_copy.db" + s):
            os.remove("data/d1/bench_copy.db" + s)

    # ── D3 scaled (non-geographic) ───────────────────────────────────────────
    t = time.time()
    shutil.copy("data/d3s/nexum.db", "data/d3s/bench_copy.db")
    nx3 = Nexum(dataclasses.replace(configs.d3s(), db_path=str(ROOT / "data/d3s/bench_copy.db")))
    t = time.perf_counter()
    nx3.correlate(None)
    b27 = time.perf_counter() - t
    record("B27", "batch non-spatial correlation", "D3", round(b27, 1), "< 60 s", b27 < 60)
    q3 = Query(nx3.conn)
    e3 = ids(nx3.conn, "SELECT event_id FROM event WHERE type='security.exploitation_listed'", 25)
    r = lat(lambda e: nx3.correlate({"event": {e}}), e3)
    record("B11", "incremental correlation for one new element", "D3", r, "p95 < 200 ms", r["p95_ms"] < 200)
    o3 = ids(nx3.conn, "SELECT object_id FROM object", 25)
    r = lat(lambda e: q3.context(e), o3)
    record("B19", "context(focus) OBJECT MODE", "D3", r, "p95 < 150 ms", r["p95_ms"] < 150)
    pairs = list(zip(o3[:20], reversed(o3[:20])))
    r = lat(lambda p: q3.path(p[0], p[1], 4), pairs)
    record("B21", "path(a, b, max_hops 4)", "D3", r, "p95 < 200 ms", r["p95_ms"] < 200)
    i3 = ids(nx3.conn, "SELECT insight_id FROM insight WHERE status='active'", 25)
    r = lat(lambda e: q3.provenance_chain(e), i3)
    record("B23", "provenance_chain of an insight", "D3", r, "p95 < 50 ms", r["p95_ms"] < 50)
    v1 = nx3.conn.execute("SELECT entity_id FROM identifier WHERE scheme='vulnid' AND value='VULN-TEST-0001'").fetchone()[0]
    lib = nx3.conn.execute("SELECT entity_id FROM identifier WHERE scheme='swid' AND value='SW-TEST-lib'").fetchone()[0]
    px = nx3.conn.execute("SELECT entity_id FROM identifier WHERE scheme='prodid' AND value='PRODUCT-X'").fetchone()[0]
    al = nx3.conn.execute("SELECT entity_id FROM identifier WHERE scheme='orgid' AND value='ORG-ALPHA'").fetchone()[0]
    rel = nx3.conn.execute("SELECT relation_id FROM relation WHERE from_id=? AND to_id=?", (v1, lib)).fetchone()[0]
    chain3 = [v1, rel, lib, px, al, v1]
    r = lat(lambda _: [q3.context(x) for x in chain3], [0])
    record("B26", "6-step pivot chain (one context per step)", "D3", r, "total p95 < 1000 ms", r["p95_ms"] < 1000)
    nx3.close()
    for s in ("", "-wal", "-shm"):
        if os.path.exists("data/d3s/bench_copy.db" + s):
            os.remove("data/d3s/bench_copy.db" + s)

    # ── D2 (scale) ───────────────────────────────────────────────────────────
    c2 = connect("data/d2/nexum.db")
    q2 = Query(c2)
    r = lat(lambda _: q2.project_map({"viewport": [-180, -90, 180, 90], "z": 2}), [0])
    size = len(json.dumps(q2.project_map({"viewport": [-180, -90, 180, 90], "z": 2}), default=str))
    record("B16", "project_map world (z=2, lod auto)", "D2", dict(r, bytes=size), "p95 < 100 ms, ≤ 2 MB",
           r["p95_ms"] < 100 and size <= 2_000_000)
    centers = [(r_[0], r_[1]) for r_ in c2.execute("SELECT lon, lat FROM event WHERE lon IS NOT NULL LIMIT 20000")]
    rnd = random.Random(17)
    vps8 = [[x - 2.8, y - 1.5, x + 2.8, y + 1.5] for x, y in rnd.sample(centers, 25)]
    r = lat(lambda vp: q2.project_map({"viewport": vp, "z": 8}), vps8)
    record("B17", "project_map regional (z=8)", "D2", r, "p95 < 100 ms", r["p95_ms"] < 100)
    vps12 = [[x - 0.17, y - 0.1, x + 0.17, y + 0.1] for x, y in rnd.sample(centers, 25)]
    r = lat(lambda vp: q2.project_map({"viewport": vp, "z": 12}, budget={"lod": "refs"}), vps12)
    record("B18", "project_map local (z=12, refs)", "D2", r, "p95 < 50 ms", r["p95_ms"] < 50)
    e2 = ids(c2, "SELECT event_id FROM event", 25, seed=2)
    o2 = ids(c2, "SELECT object_id FROM object", 25, seed=3)
    r = lat(lambda e: q2.get_entity(e), e2 + o2)
    record("B7", "get_entity (details)", "D2", r, "p95 < 30 ms", r["p95_ms"] < 30)
    r = lat(lambda _: q2.project_timeline({"time_window": [1_483_228_800_000, 1_798_761_600_000]}), [0])
    record("B8", "project_timeline 10 years, auto buckets", "D2", r, "p95 < 100 ms", r["p95_ms"] < 100)
    hubs = [x[0] for x in c2.execute("SELECT entity_id FROM degree GROUP BY entity_id HAVING SUM(count) >= 50000 "
                                     "ORDER BY entity_id")]
    r = lat(lambda h: q2.neighborhood(h, 2, budget={"max_nodes": 200, "max_edges": 400}), hubs)
    record("B9", f"neighborhood(depth 2, budget 200) on hubs (n={len(hubs)}, ≥ 50k edges)", "D2", r, "p95 < 100 ms",
           r["p95_ms"] < 100 and len(hubs) >= 1)
    r = lat(lambda w: q2.search(w), ["Oggetto 000123", "Evento 0004567", "Oggetto", "Evento 01", "O000999", "E0100000",
                                     "Oggetto 19", "Evento 0999", "sid", "O00001"])
    record("B10", "search FTS5", "D2", r, "p95 < 50 ms", r["p95_ms"] < 50)
    r = lat(lambda e: q2.context(e), e2[:10] + o2[:10])
    record("B19", "context(focus) OBJECT MODE", "D2", r, "p95 < 150 ms", r["p95_ms"] < 150)
    cursors = {}

    def page(h):
        res = q2.expand(h, "participation", "at", "in", {"max_nodes": 200}, cursors.get(h))
        cursors[h] = res["cursor_next"]
    r = lat(page, hubs)
    record("B20", "expand(node) paginated on hub", "D2", r, "p95 < 50 ms per page", r["p95_ms"] < 50)
    pairs = list(zip(o2[:20], reversed(o2[:20])))
    r = lat(lambda p: q2.path(p[0], p[1], 4), pairs)
    record("B21", "path(a, b, max_hops 4)", "D2", r, "p95 < 200 ms", r["p95_ms"] < 200)
    r = lat(lambda e: (q2.entity_timeline(e), q2.timeline_neighbors(e, hops=2)), e2)
    record("B22", "entity_timeline + timeline_neighbors(hops 2)", "D2", r, "p95 < 80 ms", r["p95_ms"] < 80)
    r = lat(lambda _: q2.facets({}), [0])
    r2_ = lat(lambda _: q2.facets({"time_window": [1_577_836_800_000, 1_609_459_200_000], "types": ["syn.e03", "syn.e05"]}), [0])
    record("B24", "facets(scope) world and filtered", "D2", {"world": r, "filtered": r2_}, "p95 < 150 ms",
           max(r["p95_ms"], r2_["p95_ms"]) < 150)
    c2.close()
    # B25: 1,000 modifications ingested incrementally, then changes_since
    nx2 = Nexum(configs.d2())
    v = int(nx2.conn.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0])
    recs = []
    for i, eid in enumerate(ids(nx2.conn, "SELECT r.native_id FROM record r WHERE r.kind='event' AND r.type='syn.e05'",
                                1000, seed=25)):
        recs.append(json.dumps({"kind": "event", "type": "syn.e05", "id": eid, "label": f"Evento aggiornato {i}",
                                "identifiers": [["sid", eid]], "t_ms": 1_600_000_000_000 + i, "version": "2",
                                "properties": {"v": 0.99}}))
    blob = ("\n".join(recs) + "\n").encode()
    sha, rel = nx2.raw.put(blob)
    nx2.conn.execute("INSERT INTO raw_record VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     ("01BENCHB25ZZZZZZZZZZZZZZZZ", "fixture.scale", sha, "gzip", len(blob), "file:///b25",
                      "b25", 1_900_000_000_000, 200, None, None, None, rel))
    t = time.time()
    st = nx2.process(correlate=False)
    ingest_s = time.time() - t
    q2b = Query(nx2.conn)
    r = lat(lambda _: q2b.changes_since(v, budget={"max_items": 5000}), [0])
    n_changes = q2b.changes_since(v, budget={"max_items": 5000})["total"]
    record("B25", f"changes_since after 1,000 modifications (changes={n_changes}, ingest {ingest_s:.1f}s)", "D2", r,
           "p95 < 50 ms", r["p95_ms"] < 50)
    nx2.close()
    out = {"machine": {"platform": platform.platform(), "processor": platform.processor(), "python": platform.python_version()},
           "results": RES}
    (REPORTS / "benchmarks.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
