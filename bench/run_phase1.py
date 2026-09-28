"""Phase 1 orchestrator: builds every world from a clean state, then runs tests and benchmarks.

    python3 bench/run_phase1.py --clean --build   # remove data/, fetch real sources, build D1/D3/D3s/mixed/D2
    python3 bench/run_phase1.py --tests            # full pytest suite
    python3 bench/run_phase1.py --bench            # all benchmarks → data/reports/benchmarks.json
"""

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from nexum import worlds as configs  # noqa: E402
from nexum.core.pipeline import Nexum, rebuild  # noqa: E402

REPORTS = ROOT / "data" / "reports"


def build_d1():
    nx = Nexum(configs.d1())
    t0 = time.time()
    f1 = nx.fetch(mode="backfill")
    f2 = nx.fetch(mode="incremental")          # live feeds, first time (resources not yet fetched)
    time.sleep(65)                              # let the per-resource minimum interval of the live feeds elapse
    f3 = nx.fetch(mode="incremental")          # second round: conditional requests (ETag / Last-Modified)
    t1 = time.time()
    st = nx.process()
    t2 = time.time()
    rep = {"fetch_backfill": f1, "fetch_incremental": f2, "fetch_incremental_2": f3, "fetch_s": round(t1 - t0, 1),
           "process": st, "process_s": round(t2 - t1, 1), "compact": nx.compact()}
    nx.close()
    return rep


def build_simple(cfg, generator=None):
    if generator:
        subprocess.run([sys.executable, *generator], check=True)
    nx = Nexum(cfg)
    nx.fetch(mode="backfill")
    t = time.time()
    st = nx.process()
    st["process_s"] = round(time.time() - t, 1)
    nx.close()
    return st


def build_mixed():
    """D1 + D3 in the same world, rebuilt from the two raw stores (P41)."""
    raw = ROOT / "data" / "mixed" / "raw"
    shutil.rmtree(ROOT / "data" / "mixed", ignore_errors=True)
    raw.mkdir(parents=True)
    manifest = []
    for src in (ROOT / "data" / "d1" / "raw", ROOT / "data" / "d3" / "raw"):
        for p in src.rglob("*.gz"):
            q = raw / p.relative_to(src)
            q.parent.mkdir(parents=True, exist_ok=True)
            if not q.exists():
                os.link(p, q)
        manifest += (src / "manifest.jsonl").read_text().splitlines()
    (raw / "manifest.jsonl").write_text("\n".join(manifest) + "\n")
    t = time.time()
    nx = rebuild(configs.mixed(), str(ROOT / "data" / "mixed" / "nexum.db"))
    nx.close()
    return {"build_s": round(time.time() - t, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--tests", action="store_true")
    ap.add_argument("--bench", action="store_true")
    a = ap.parse_args()
    REPORTS.mkdir(parents=True, exist_ok=True)
    if a.clean:
        for d in ("d1", "d2", "d3", "d3s", "mixed", "grouping", "reports"):
            shutil.rmtree(ROOT / "data" / d, ignore_errors=True)
        REPORTS.mkdir(parents=True, exist_ok=True)
    if a.build:
        out = {"d1": build_d1()}
        out["d3"] = build_simple(configs.d3())
        out["d3s"] = build_simple(configs.d3s(), ["bench/generate_d3.py", "1", "data/d3s/inputs"])
        out["mixed"] = build_mixed()
        subprocess.run([sys.executable, "bench/generate_d2.py"], check=True)
        subprocess.run([sys.executable, "bench/load_d2.py"], check=True)
        out["d2"] = json.loads((ROOT / "data" / "d2" / "load_report.json").read_text())
        (REPORTS / "build.json").write_text(json.dumps(out, indent=1, default=str))
    if a.tests:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], cwd=ROOT)
        sys.exit(r.returncode)
    if a.bench:
        subprocess.run([sys.executable, "bench/run_benchmarks.py"], check=True)


if __name__ == "__main__":
    main()
