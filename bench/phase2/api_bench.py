"""Phase 2 API benchmarks A1–A10 (frozen in NEXUM-PHASE2-SPEC.md §P.1).

Services are started as separate processes with the response cache DISABLED, so that every measure is the real
Core + API path, never a cache hit. Round-trip times are measured client-side with http.client; 5 warm-up requests
are excluded; p95 = nearest rank. Results → data/reports/phase2/api_bench.json.

    python3 bench/phase2/api_bench.py [--a6-minutes 30]
"""

import argparse
import os
import concurrent.futures as cf_
import http.client
import json
import math
import pathlib
import random
import subprocess
import sys
import threading
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "bench" / "phase2"))

from nexum import worlds  # noqa: E402
from nexum.api.cancel import CancelRegistry  # noqa: E402
from nexum.api.server import Worker  # noqa: E402
from nexum.core.registry import load_registry  # noqa: E402

FX = json.loads((ROOT / "bench" / "phase2" / "fixtures.json").read_text())
OUT = ROOT / "data" / "reports" / "phase2" / "api_bench.json"
PORTS = {"d1": 8775, "d2": 8777}


def p95(xs):
    s = sorted(xs)
    return s[max(0, math.ceil(0.95 * len(s)) - 1)] if s else None


def stats(xs):
    return {"n": len(xs), "p50_ms": round(sorted(xs)[len(xs) // 2], 2) if xs else None,
            "p95_ms": round(p95(xs), 2) if xs else None, "max_ms": round(max(xs), 2) if xs else None}


class Http:
    def __init__(self, port):
        self.port = port
        self.local = threading.local()

    def conn(self):
        c = getattr(self.local, "c", None)
        if c is None:
            c = self.local.c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        return c

    def get(self, path, params=None, headers=None):
        q = "?" + urllib.parse.urlencode({k: json.dumps(v) if isinstance(v, (dict, list)) else v
                                          for k, v in (params or {}).items()}) if params else ""
        h = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        t = time.perf_counter()
        for attempt in range(2):
            try:
                c = self.conn()
                c.request("GET", "/api/v1" + path + q, headers=h)
                r = c.getresponse()
                body = r.read()
                break
            except (ConnectionError, http.client.HTTPException, OSError):
                self.local.c = None
                if attempt:
                    raise
        return (time.perf_counter() - t) * 1000, r.status, body


def start(world):
    p = subprocess.Popen([sys.executable, "-m", "nexum.api", "serve", world, "--port", str(PORTS[world]), "--no-cache",
                          "--mmap-mb", os.environ.get("NEXUM_MMAP_MB", "1024")],
                         cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for _ in range(100):
        try:
            http.client.HTTPConnection("127.0.0.1", PORTS[world], timeout=1).request("GET", "/api/v1/status",
                                                                                  headers={"Host": f"127.0.0.1:{PORTS[world]}"})
            break
        except OSError:
            time.sleep(0.2)
    time.sleep(0.5)
    return p


def rss_mb(pid):
    """RSS of the service: the HTTP process plus its Core worker processes."""
    kids = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True).stdout.split()
    total = 0
    for x in [str(pid), *kids]:
        out = subprocess.run(["ps", "-o", "rss=", "-p", x], capture_output=True, text=True).stdout.strip()
        total += int(out) if out else 0
    return total / 1024 if total else None


def measure(client, reqs, warm=5):
    for path, params in reqs[:warm]:
        client.get(path, params)
    times, codes = [], {}
    for path, params in reqs:
        ms, st, _ = client.get(path, params)
        times.append(ms)
        codes[st] = codes.get(st, 0) + 1
    return times, codes


def viewport(center, z, w_px=1440, h_px=900):
    """Viewport for a Core zoom z as the UI computes it (MapLibre zoom = z − 3, 512-px tiles)."""
    deg_per_px = 360 / (512 * 2 ** (z - 3))
    hw, hh = w_px * deg_per_px / 2, h_px * deg_per_px / 2
    lon, lat = center
    return [round(max(-180, lon - hw), 4), round(max(-85, lat - hh), 4), round(min(180, lon + hw), 4),
            round(min(85, lat + hh), 4)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a6-minutes", type=float, default=30.0)
    ap.add_argument("--only", default="", help="comma-separated subset for development runs, e.g. A2,A7")
    a = ap.parse_args()
    res = {}
    only = set(filter(None, a.only.split(",")))
    run = lambda k: not only or k in only   # noqa: E731
    procs = {w: start(w) for w in PORTS}
    c1, c2 = Http(PORTS["d1"]), Http(PORTS["d2"])
    try:
        rnd = random.Random(7)
        objs = FX["pivots_d2"][25:]
        mixes = {
            "map": [("/projections/map", {"s": {"viewport": viewport(rnd.choice(FX["d2_centers"]), z), "z": z},
                                          "b": {"max_items": 2000}}) for z in [rnd.choice([3, 6, 9, 11]) for _ in range(200)]],
            "timeline": [("/projections/timeline", {"s": {"time_window": [a0, a0 + rnd.choice([90, 365, 2000]) * 86400000]}})
                         for a0 in [rnd.randint(1_480_000_000_000, 1_780_000_000_000) for _ in range(200)]],
            "search": [("/search", {"q": rnd.choice(FX["d2_terms"])[:rnd.randint(3, 8)]}) for _ in range(200)],
            "graph": [("/graph/neighborhood", {"focus": rnd.choice(objs), "depth": 1}) for _ in range(200)],
        }
        # ── A1 overhead API vs direct Query ─────────────────────────────────
        if run("A1"):
            a1 = {}
            for world, client in (("d1", c1), ("d2", c2)):
                cfg = getattr(worlds, world)()
                w = Worker(cfg.db_path, load_registry([ROOT / d for d in cfg.source_dirs]), CancelRegistry(), 65536)
                q = w.q
                pool = FX["pivots_d1"] if world == "d1" else FX["pivots_d2"]
                targets = pool[:10]
                centers = [[96.0, 21.9], [12.5, 41.9], [-74, 40.7], [139.7, 35.7], [28.9, 41.0], [-43.2, -22.9],
                           [77.2, 28.6], [151.2, -33.9], [2.35, 48.85], [-99.1, 19.4]] if world == "d1" else FX["d2_centers"]
                words = ["Mandalay", "Italy", "Airport", "Myanmar", "Tokyo", "Chile", "Nepal", "Japan", "Peru", "Turkey"] \
                    if world == "d1" else FX["d2_terms"]
                ops = {
                    "get_entity": [(f"/entities/{t}", {}, lambda t=t: q.get_entity(t)) for t in targets],
                    "context": [(f"/context/{t}", {}, lambda t=t: q.context(t, None, {"max_items": 25})) for t in targets],
                    "project_map": [("/projections/map", {"s": {"viewport": viewport(c, 4), "z": 4}},
                                     lambda c=c: q.project_map({"viewport": viewport(c, 4), "z": 4})) for c in centers],
                    "search": [("/search", {"q": wd}, lambda wd=wd: q.search(wd, None, {"max_items": 50})) for wd in words],
                    "neighborhood": [("/graph/neighborhood", {"focus": t, "depth": 1},
                                      lambda t=t: q.neighborhood(t, 1, None, {"max_nodes": 200, "max_edges": 400}))
                                     for t in targets],
                    "insights": [("/insights", {"b": {"max_items": 50}},
                                  lambda: q.insights(None, {"max_items": 50}))] * 10,
                }
                out = {}
                for name, items in ops.items():
                    http_t, direct_t = [], []
                    for path, params, fn in items[:2]:
                        client.get(path, params)
                        fn()
                    for _ in range(5):
                        for path, params, fn in items:
                            t = time.perf_counter()
                            fn()
                            direct_t.append((time.perf_counter() - t) * 1000)
                            ms, st, _ = client.get(path, params)
                            http_t.append(ms)
                    ov = p95(http_t) - p95(direct_t)
                    out[name] = {"http": stats(http_t), "direct": stats(direct_t), "overhead_p95_ms": round(ov, 2),
                                 "pass": ov <= 15}
                a1[world] = out
                w.conn.close()
            res["A1"] = {"target": "overhead ≤ 15 ms per operation and world", "results": a1,
                         "pass": all(v["pass"] for w in a1.values() for v in w.values())}
            print("A1", res["A1"]["pass"], flush=True)

        # ── A2 map sequence on D2 ───────────────────────────────────────────
        if run("A2"):
            reqs = []
            for _ in range(5):
                for c in FX["d2_centers"]:
                    for z in (2, 5, 8, 11, 14):
                        reqs.append(("/projections/map", {"s": {"viewport": viewport(c, z), "z": z}, "b": {"max_items": 2000}}))
            t, codes = measure(c2, reqs)
            res["A2"] = {"target": "p95 ≤ 150 ms", **stats(t), "codes": codes, "pass": p95(t) <= 150}
            print("A2", res["A2"], flush=True)

        # ── A3 context on the 10 D2 hubs ────────────────────────────────────
        if run("A3"):
            reqs = [(f"/context/{h}", {}) for h in FX["d2_hubs"] for _ in range(50)]
            t, codes = measure(c2, reqs, warm=2)
            res["A3"] = {"target": "p95 ≤ 200 ms", **stats(t), "codes": codes, "pass": p95(t) <= 200 and set(codes) == {200}}
            print("A3", res["A3"], flush=True)

        # ── A4 paginated expand on hub groups ───────────────────────────────
        if run("A4"):
            t = []
            for _ in range(10):
                for node, ek, et, d in FX["d2_hub_groups"]:
                    cur = None
                    for _p in range(5):
                        ms, st, body = c2.get("/graph/expand", {"node": node, "edge_kind": ek, "type": et, "dir": d,
                                                                "b": {"max_nodes": 200}, **({"cursor": cur} if cur else {})})
                        t.append(ms)
                        cur = json.loads(body)["cursor_next"]
                        if not cur:
                            break
            res["A4"] = {"target": "p95 ≤ 100 ms", **stats(t), "pass": p95(t) <= 100}
            print("A4", res["A4"], flush=True)

        # ── A5 cancellation latency (server timestamps) ─────────────────────
        if run("A5"):
            _, _, d0 = c2.get("/diagnostics")
            before = len(json.loads(d0)["cancel_latency_ms"])
            outcomes = []
            for k in range(50):
                chan = f"a5-{k}/ch"
                h = FX["d2_hubs"][k % 10]
                box = {}

                def slow():
                    box["r"] = Http(PORTS["d2"]).get(f"/context/{h}", headers={"X-Nexum-Channel": chan, "X-Nexum-Seq": "1"})

                th = threading.Thread(target=slow)
                th.start()
                time.sleep(0.02)
                Http(PORTS["d2"]).get("/status", headers={"X-Nexum-Channel": chan, "X-Nexum-Seq": "2"})
                th.join()
                outcomes.append(box["r"][1])
            _, _, d1_ = c2.get("/diagnostics")
            lat = json.loads(d1_)["cancel_latency_ms"][before:]
            res["A5"] = {"target": "p95 ≤ 50 ms (newer request arrival → interruption of the superseded one)",
                         "n_interrupted": len(lat), "p50_ms": round(sorted(lat)[len(lat) // 2], 2) if lat else None,
                         "p95_ms": round(p95(lat), 2) if lat else None, "slow_request_codes": {c: outcomes.count(c) for c in set(outcomes)},
                         "pass": bool(lat) and len(lat) >= 45 and p95(lat) <= 50}
            print("A5", res["A5"], flush=True)

        # ── A8 explain on the 35 R2 insights ────────────────────────────────
        if run("A8"):
            reqs = [(f"/explain/{i}", {}) for i in FX["r2_insights"] for _ in range(10)]
            t, codes = measure(c1, reqs)
            res["A8"] = {"target": "p95 ≤ 100 ms", **stats(t), "codes": codes, "pass": p95(t) <= 100}
            print("A8", res["A8"], flush=True)

        # ── A9 search at every keystroke ────────────────────────────────────
        if run("A9"):
            reqs = [("/search", {"q": term[:k]}) for term in FX["d2_terms"] for k in range(2, len(term) + 1)]
            t, codes = measure(c2, reqs, warm=0)
            res["A9"] = {"target": "p95 ≤ 150 ms", **stats(t), "codes": codes, "pass": p95(t) <= 150}
            print("A9", res["A9"], flush=True)

        # ── A10 raw record extraction (informative) ─────────────────────────
        if run("A10"):
            # raw ids are ULIDs assigned at acquisition time: resolve the records of fixed elements through the API
            # (evidence of the fixed D1 pivots + the Myanmar earthquake, which lives in the largest USGS payload)
            locs = []
            for eid in FX["pivots_d1"] + [FX["myanmar"]["quake"]]:
                _, _, body = c1.get(f"/entities/{eid}/evidence", {"b": {"max_items": 5}})
                for it in json.loads(body)["data"]["items"]:
                    sup = it["support"]
                    if sup.get("kind") == "record":
                        locs.append((sup["raw_id"], sup["locator"]))
            locs = sorted(set(locs))[:49] + [l for l in locs if l not in sorted(set(locs))[:49]][:1]
            reqs = [(f"/raw/{r}", {"path": loc}) for r, loc in locs]
            t, codes = measure(c1, reqs, warm=0)
            res["A10"] = {"target": "≤ 800 ms (informative)", **stats(t), "codes": codes, "blocking": False}
            print("A10", res["A10"], flush=True)

        # ── A7 four concurrent channels vs isolated ─────────────────────────
        if run("A7"):
            iso = {k: stats(measure(Http(PORTS["d2"]), v)[0]) for k, v in mixes.items()}
            with cf_.ThreadPoolExecutor(4) as ex:
                futs = {k: ex.submit(lambda v=v: measure(Http(PORTS["d2"]), v)[0]) for k, v in mixes.items()}
                conc = {k: stats(f.result()) for k, f in futs.items()}
            res["A7"] = {"target": "per channel p95 concurrent ≤ 2 × p95 isolated", "isolated": iso, "concurrent": conc,
                         "pass": all(conc[k]["p95_ms"] <= 2 * iso[k]["p95_ms"] for k in mixes)}
            print("A7", res["A7"], flush=True)

        # ── A6 RSS during an API scenario of N minutes ──────────────────────
        if run("A6"):
            pid = procs["d2"].pid
            end = time.time() + a.a6_minutes * 60
            samples = []
            stop = threading.Event()
            import memory_probe as mp   # noqa: E402 — per-process RSS, phys_footprint, mapped file pages
            import filecache as fc      # noqa: E402 — page cache of the database file, counted once (mincore)
            tmp = OUT.parent / "fp_tmp"
            tmp.mkdir(parents=True, exist_ok=True)

            def sampler():
                while not stop.is_set():
                    rows = mp.sample(mp.procs_of(pid), tmp)
                    samples.append({"t_s": round(time.time() - (end - a.a6_minutes * 60), 1), "procs": rows,
                                    "file_cache": fc.resident(str(ROOT / "data" / "d2" / "nexum.db"))})
                    stop.wait(5)

            th = threading.Thread(target=sampler, daemon=True)
            th.start()
            # frozen A6 mix (§P.1): A2, A3, A4, A9, explain and timeline requests, cyclically
            _, _, body = c2.get("/insights", {"b": {"max_items": 50}})
            explain_ids = [it["ref"]["id"] for it in json.loads(body)["data"]["items"]]
            mix = []
            for i, cen in enumerate(FX["d2_centers"]):
                mix += [("/projections/map", {"s": {"viewport": viewport(cen, z), "z": z}, "b": {"max_items": 2000}})
                        for z in (2, 5, 8, 11, 14)]
                mix.append((f"/context/{FX['d2_hubs'][i]}", {}))
                node, ek, et, d = FX["d2_hub_groups"][i]
                mix.append(("/graph/expand", {"node": node, "edge_kind": ek, "type": et, "dir": d, "b": {"max_nodes": 200}}))
                mix += [("/search", {"q": FX["d2_terms"][i][:k]}) for k in range(2, len(FX["d2_terms"][i]) + 1)]
                if explain_ids:
                    mix.append((f"/explain/{explain_ids[i % len(explain_ids)]}", {}))
                a0 = 1_480_000_000_000 + i * 30_000_000_000
                mix.append(("/projections/timeline", {"s": {"time_window": [a0, a0 + 400 * 86400000]}}))
            n = 0
            while time.time() < end:
                path, params = mix[n % len(mix)]
                c2.get(path, params)
                n += 1
            stop.set()
            th.join()
            tot = lambda key: [sum((p[key] or 0) for p in smp["procs"]) for smp in samples]  # noqa: E731
            fp, rss, mapped = tot("footprint_mb"), tot("rss_mb"), tot("mapped_clean_mb")
            mx = max(fp)
            res["A6"] = {"target": "max Σ phys_footprint of the service processes ≤ 1.5 GB (method approved 2026-09-29)",
                         "minutes": a.a6_minutes, "requests": n, "processes": len(samples[-1]["procs"]),
                         "max_sum_phys_footprint_mb": round(mx, 1),
                         "reported_not_thresholded": {
                             "max_sum_rss_mb": round(max(rss), 1),
                             "max_sum_mapped_clean_mb": round(max(mapped), 1),
                             "max_db_file_page_cache_mb_counted_once": max(x["file_cache"]["resident_mb"] for x in samples)},
                         "samples": len(samples), "mmap_mb": int(os.environ.get("NEXUM_MMAP_MB", "1024")),
                         "pass": mx <= 1536 and a.a6_minutes >= 30}
            print("A6", res["A6"], flush=True)
    finally:
        for p in procs.values():
            p.terminate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if only and OUT.exists():   # development runs update only the measured entries
        res = {**json.loads(OUT.read_text()), **res}
    blocking = [k for k in ("A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9")]
    res["summary"] = {k: res[k]["pass"] for k in blocking if k in res}
    OUT.write_text(json.dumps(res, indent=1))
    print(json.dumps(res["summary"]))


if __name__ == "__main__":
    main()
