"""A3 + A6 memory evidence (author's request, 2026-09-29). For one service configuration (mmap size), on the same
service instance: A3 as frozen (10 hubs × 50 context requests), then the A6 scenario as frozen in §P.1 (cyclic mix of
A2, A3, A4, A9, explain and timeline requests) for N minutes. Every 5 s, for EVERY service process (HTTP process,
Core workers, multiprocessing helper), it records:
  rss            — ps -o rss (resident set, counts shared pages in every process that maps them)
  footprint      — macOS phys_footprint (`footprint -j`): dirty + compressed memory attributed to the process
  mapped_clean   — resident clean pages of mapped files (`footprint` category "mapped file")
  mapped_dirty   — resident dirty pages of mapped files
PSS does not exist on macOS; the page cache pages of the SQLite file are clean and shared by every process that
maps them. Output: data/reports/phase2/memory_probe_<mmap>.json

    python3 bench/phase2/memory_probe.py --mmap-mb 1024 --minutes 30
"""

import argparse
import json
import pathlib
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bench" / "phase2"))
import api_bench as ab  # noqa: E402

PORT = 8779


def procs_of(pid):
    kids = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True).stdout.split()
    return [int(pid)] + [int(k) for k in kids]


def sample(pids, tmp):
    rows = []
    for p in pids:
        rss = subprocess.run(["ps", "-o", "rss=", "-p", str(p)], capture_output=True, text=True).stdout.strip()
        out = tmp / f"fp-{p}.json"
        subprocess.run(["footprint", "-p", str(p), "-j", str(out)], capture_output=True)
        fp = mc = md = None
        try:
            d = json.loads(out.read_text())
            proc = d["processes"][0]
            fp = d.get("total footprint")
            mf = d["summary"].get("mapped file", {})
            mc, md = mf.get("clean", 0), mf.get("dirty", 0)
            name = proc.get("name")
        except (OSError, ValueError, KeyError, IndexError):
            name = None
        rows.append({"pid": p, "name": name, "rss_mb": int(rss) / 1024 if rss else None,
                     "footprint_mb": fp / 1048576 if fp is not None else None,
                     "mapped_clean_mb": mc / 1048576 if mc is not None else None,
                     "mapped_dirty_mb": md / 1048576 if md is not None else None})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mmap-mb", type=int, required=True)
    ap.add_argument("--minutes", type=float, default=30)
    a = ap.parse_args()
    tmp = ROOT / "data" / "reports" / "phase2" / "fp_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    svc = subprocess.Popen([sys.executable, "-m", "nexum.api", "serve", "d2", "--port", str(PORT), "--no-cache",
                            "--mmap-mb", str(a.mmap_mb)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ab.PORTS["d2"] = PORT
    try:
        time.sleep(1)
        for _ in range(100):
            try:
                ab.Http(PORT).get("/status")
                break
            except OSError:
                time.sleep(0.3)
        c = ab.Http(PORT)
        FX = ab.FX
        # ── A3 as frozen ────────────────────────────────────────────────────
        reqs = [(f"/context/{h}", {}) for h in FX["d2_hubs"] for _ in range(50)]
        t, codes = ab.measure(c, reqs, warm=2)
        a3 = {"target": "p95 ≤ 200 ms", **ab.stats(t), "codes": codes, "pass": ab.p95(t) <= 200 and set(codes) == {200}}
        print("A3", a3, flush=True)
        # ── A6 scenario as frozen: A2, A3, A4, A9, explain, timeline ───────
        _, _, body = c.get("/insights", {"b": {"max_items": 50}})
        explain_ids = [it["ref"]["id"] for it in json.loads(body)["data"]["items"]]
        mix = []
        for i, cen in enumerate(FX["d2_centers"]):
            for z in (2, 5, 8, 11, 14):
                mix.append(("A2", "/projections/map", {"s": {"viewport": ab.viewport(cen, z), "z": z}, "b": {"max_items": 2000}}))
            mix.append(("A3", f"/context/{FX['d2_hubs'][i]}", {}))
            node, ek, et, d = FX["d2_hub_groups"][i]
            mix.append(("A4", "/graph/expand", {"node": node, "edge_kind": ek, "type": et, "dir": d, "b": {"max_nodes": 200}}))
            term = FX["d2_terms"][i]
            mix += [("A9", "/search", {"q": term[:k]}) for k in range(2, len(term) + 1)]
            if explain_ids:
                mix.append(("explain", f"/explain/{explain_ids[i % len(explain_ids)]}", {}))
            a0 = 1_480_000_000_000 + i * 30_000_000_000
            mix.append(("timeline", "/projections/timeline", {"s": {"time_window": [a0, a0 + 400 * 86400000]}}))
        samples, stop, lat = [], threading.Event(), {}
        t0 = time.time()

        def sampler():
            while not stop.is_set():
                samples.append({"t_s": round(time.time() - t0, 1), "procs": sample(procs_of(svc.pid), tmp)})
                stop.wait(5)

        th = threading.Thread(target=sampler, daemon=True)
        th.start()
        end = time.time() + a.minutes * 60
        n = 0
        while time.time() < end:
            kind, path, params = mix[n % len(mix)]
            ms, st, _ = c.get(path, params)
            lat.setdefault(kind, []).append(ms)
            n += 1
        stop.set()
        th.join()

        def series(key):
            return [sum((p[key] or 0) for p in s["procs"]) for s in samples]

        def per_process_max(key):
            out = {}
            for s in samples:
                for p in s["procs"]:
                    out[p["pid"]] = max(out.get(p["pid"], 0), p[key] or 0)
            return out

        rss, fp, mclean = series("rss_mb"), series("footprint_mb"), series("mapped_clean_mb")
        mmax = [max((p["mapped_clean_mb"] or 0) for p in s["procs"]) for s in samples]
        res = {"mmap_mb": a.mmap_mb, "minutes": a.minutes, "requests": n, "processes": len(samples[-1]["procs"]),
               "A3": a3, "A3_in_scenario": ab.stats(lat.get("A3", [])),
               "latency_in_scenario": {k: ab.stats(v) for k, v in lat.items()},
               "max_sum_rss_mb": round(max(rss), 1),
               "max_sum_footprint_mb": round(max(fp), 1),
               "max_sum_mapped_clean_mb": round(max(mclean), 1),
               "max_single_process_mapped_clean_mb": round(max(mmax), 1),
               "mapped_clean_counted_more_than_once_mb": round(max(m - x for m, x in zip(mclean, mmax)), 1),
               "per_process_max": {"rss_mb": per_process_max("rss_mb"), "footprint_mb": per_process_max("footprint_mb"),
                                   "mapped_clean_mb": per_process_max("mapped_clean_mb")},
               "samples": samples}
        out = ROOT / "data" / "reports" / "phase2" / f"memory_probe_{a.mmap_mb}.json"
        out.write_text(json.dumps(res, indent=1))
        print(json.dumps({k: v for k, v in res.items() if k not in ("samples", "per_process_max")}, indent=1))
    finally:
        svc.terminate()
        svc.wait(10)


if __name__ == "__main__":
    main()
