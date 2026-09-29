"""Phase 2 orchestrator (clean environment). Every step writes its evidence under data/reports/phase2/.

    python3 bench/phase2/run_phase2.py --phase1      # W12: Phase 1 clean rebuild + 66 tests + benchmarks
    python3 bench/phase2/run_phase2.py --ui-clean    # rm node_modules/dist, npm ci, licences (W2), build, bundle (U8)
    python3 bench/phase2/run_phase2.py --tests       # pytest (all), UI unit tests, E2E on local services
    python3 bench/phase2/run_phase2.py --bench       # API A1–A10 (A6: 30 min), UI U1–U9, U10
    python3 bench/phase2/run_phase2.py --report      # W1–W32 → data/reports/phase2/report.json
"""

import argparse
import http.client
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
UI = ROOT / "ui"
REP = ROOT / "data" / "reports" / "phase2"
SERVICES = {"d1": 8765, "d3": 8766, "d2": 8767, "mixed": 8768, "ubench": 8770}


def sh(cmd, cwd=ROOT, env=None, check=True, log=None):
    print("$", " ".join(map(str, cmd)), flush=True)
    t = time.time()
    with open(log, "w") if log else open(os.devnull, "w") as fh:
        r = subprocess.run(list(map(str, cmd)), cwd=cwd, env={**os.environ, **(env or {})},
                           stdout=fh if log else None, stderr=subprocess.STDOUT if log else None)
    print(f"  → exit {r.returncode} in {time.time() - t:.0f}s", flush=True)
    if check and r.returncode:
        raise SystemExit(f"step failed: {cmd}")
    return r.returncode


def wait_port(port, timeout=60):
    t = time.time()
    while time.time() - t < timeout:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            c.request("GET", "/api/v1/status", headers={"Host": f"127.0.0.1:{port}"})
            if c.getresponse().status == 200:
                return
        except OSError:
            time.sleep(0.3)
    raise SystemExit(f"service on {port} did not start")


def start_services(extra=None):
    procs = []
    for world, port in {**SERVICES, **(extra or {})}.items():
        args = [sys.executable, "-m", "nexum.api", "serve", world if world in SERVICES else "d2", "--port", str(port)]
        procs.append(subprocess.Popen(args, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    for port in {**SERVICES, **(extra or {})}.values():
        wait_port(port)
    return procs


def stop(procs):
    for p in procs:
        p.terminate()
    for p in procs:
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()


def build_ubench():
    """UI-benchmark world (U4, U5, U6), built with the normal pipeline from its deterministic generator."""
    sh([sys.executable, "bench/phase2/generate_ubench.py"])
    sh([sys.executable, "-c", "from nexum import worlds; from nexum.core.pipeline import Nexum; "
        "nx = Nexum(worlds.ubench()); nx.fetch(mode='backfill'); print(nx.process()); nx.close()"],
       log=REP / "ubench_build.log")


def phase1():
    sh([sys.executable, "bench/run_phase1.py", "--clean", "--build"], log=ROOT / "data_build.log")
    REP.mkdir(parents=True, exist_ok=True)
    build_ubench()
    REP.mkdir(parents=True, exist_ok=True)
    rc_t = sh([sys.executable, "bench/run_phase1.py", "--tests"], check=False, log=REP / "phase1_tests.log")
    rc_b = sh([sys.executable, "bench/run_phase1.py", "--bench"], check=False, log=REP / "phase1_bench.log")
    (REP / "phase1.json").write_text(json.dumps({"tests_exit": rc_t, "bench_exit": rc_b}))


def ui_clean():
    for d in ("node_modules", "dist"):
        shutil.rmtree(UI / d, ignore_errors=True)
    REP.mkdir(parents=True, exist_ok=True)
    sh(["npm", "ci", "--no-audit", "--no-fund"], cwd=UI, log=REP / "npm_ci.log")
    sh(["node", "scripts/check-licenses.mjs"], cwd=UI, check=False, log=REP / "licenses.log")
    sh(["npx", "tsc", "--noEmit"], cwd=UI, log=REP / "tsc.log")
    sh(["npx", "vite", "build"], cwd=UI, log=REP / "vite_build.log")
    sh(["node", "scripts/bundle-size.mjs"], cwd=UI, log=REP / "bundle.log")


def tests():
    REP.mkdir(parents=True, exist_ok=True)
    sh([sys.executable, "bench/phase2/sample_factors.py"])
    sh([sys.executable, "-m", "pytest", "-q", "tests", f"--junitxml={REP / 'pytest.xml'}"], check=False,
       log=REP / "pytest.log")
    sh(["node", "--test", "--test-reporter=junit", f"--test-reporter-destination={REP / 'unit.xml'}",
        *sorted(str(p.relative_to(UI)) for p in (UI / "tests" / "unit").glob("*.test.ts"))], cwd=UI, check=False)
    procs = start_services()
    try:
        sh(["npx", "playwright", "test", "tests/e2e"], cwd=UI, check=False, log=REP / "e2e.log",
           env={"PLAYWRIGHT_JSON_OUTPUT_NAME": str(REP / "e2e.json")})
        if (REP / "playwright.json").exists():
            (REP / "playwright.json").replace(REP / "e2e.json")
    finally:
        stop(procs)


def bench(a6_minutes):
    REP.mkdir(parents=True, exist_ok=True)
    sh([sys.executable, "bench/phase2/api_bench.py", "--a6-minutes", str(a6_minutes)], check=False,
       log=REP / "api_bench.log")
    (REP / "ui_bench.json").unlink(missing_ok=True)
    procs = start_services()
    try:
        sh(["npx", "playwright", "test", "tests/bench/ui.spec.ts"], cwd=UI, check=False, log=REP / "ui_bench.log")
    finally:
        stop(procs)
    # U10: a D2 clone (APFS copy-on-write), a service on it, 1,000 modifications
    clone = ROOT / "data" / "u10"
    shutil.rmtree(clone, ignore_errors=True)
    sh([sys.executable, "bench/phase2/u10_modify.py", "clone", clone])
    p = subprocess.Popen([sys.executable, "-c", (
        "import dataclasses,sys; sys.argv=['x']; from nexum import worlds; from nexum.api.server import Service, serve;"
        f"cfg=dataclasses.replace(worlds.d2(), db_path='{clone}/nexum.db', raw_dir='{clone}/raw');"
        f"svc=Service(cfg,'d2-clone',ui_dir='{UI / 'dist'}', response_cache=False); h=serve(svc,'127.0.0.1',8769); h.serve_forever()")],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_port(8769, 120)
        sh(["npx", "playwright", "test", "tests/bench/u10.spec.ts"], cwd=UI, check=False, log=REP / "u10.log",
           env={"NEXUM_U10_DIR": str(clone), "NEXUM_U10_URL": "http://127.0.0.1:8769/"})
    finally:
        stop([p])
        shutil.rmtree(clone, ignore_errors=True)


# ── report ──────────────────────────────────────────────────────────────────

def junit(path):
    out = {}
    if not path.exists():
        return out
    for tc in ET.parse(path).getroot().iter("testcase"):
        failed = any(ch.tag in ("failure", "error") for ch in tc)
        skipped = any(ch.tag == "skipped" for ch in tc)
        out[f"{tc.get('classname')}::{tc.get('name')}"] = "skip" if skipped else ("fail" if failed else "pass")
    return out


def playwright(path):
    out = {}
    if not path.exists():
        return out

    def walk(suite, prefix=""):
        for s in suite.get("suites", []):
            walk(s, prefix + s.get("title", "") + " › ")
        for spec in suite.get("specs", []):
            ok = spec.get("ok") and all(r.get("status") in ("passed",) for t in spec.get("tests", []) for r in t.get("results", []))
            out[prefix + spec["title"]] = "pass" if ok else "fail"
    for s in json.loads(path.read_text()).get("suites", []):
        walk(s, s.get("title", "") + " › ")
    return out


def report():
    py, unit, e2e = junit(REP / "pytest.xml"), junit(REP / "unit.xml"), playwright(REP / "e2e.json")
    lic = json.loads((REP / "licenses.json").read_text()) if (REP / "licenses.json").exists() else {}
    api = json.loads((REP / "api_bench.json").read_text()) if (REP / "api_bench.json").exists() else {}
    ui = json.loads((REP / "ui_bench.json").read_text()) if (REP / "ui_bench.json").exists() else {}
    bundle = json.loads((REP / "bundle.json").read_text()) if (REP / "bundle.json").exists() else {}
    p1 = json.loads((REP / "phase1.json").read_text()) if (REP / "phase1.json").exists() else {}
    bench1 = json.loads((ROOT / "data" / "reports" / "benchmarks.json").read_text()) \
        if (ROOT / "data" / "reports" / "benchmarks.json").exists() else {}

    def t_py(*names):
        hits = {k: v for k, v in py.items() if any(k.endswith("::" + n) or ("::" + n) in k for n in names)}
        return hits

    def t_e2e(*frags):
        return {k: v for k, v in e2e.items() if any(f in k for f in frags)}

    def t_unit(*frags):
        return {k: v for k, v in unit.items() if any(f in k for f in frags)}

    def ok(d):
        return bool(d) and all(v == "pass" for v in d.values())

    phase1_tests = {k: v for k, v in py.items() if "test_api" not in k and "test_explain" not in k}
    p1_rows = [r for rows in bench1.get("results", {}).values() for r in rows]
    p1_bench_ok = bool(p1_rows) and all(r.get("pass") for r in p1_rows)
    W = {}
    W["W1"] = {**t_py("test_w1_core_changed_only_by_the_additive_explain"), **t_py("test_explain_is_read_only")}
    W["W2"] = {**t_py("test_w2_python_side_uses_only_the_standard_library"),
               **t_py("test_w2_licence_policy_runtime_vs_build_only"),
               "licences": "pass" if lic and not lic.get("problems") else "fail"}
    W["W3"] = t_e2e("W16 + W3 + W8")
    W["W4"] = t_py("test_w4_network_surface")
    W["W5"] = t_py("test_w5_fuzz_budgets_hold")
    W["W6"] = t_py("test_w6_unbounded_requests_are_refused_or_reduced")
    W["W7"] = t_py("test_w7_superseded_requests_are_interrupted")
    W["W8"] = t_e2e("W16 + W3 + W8")
    W["W9"] = t_py("test_w9_no_domain_terms_in_api_and_ui")
    W["W10"] = t_py("test_w10_no_osiris_material_in_phase2_files")
    W["W11"] = t_py("test_p24_single_author_no_coauthors")
    W["W12"] = {"phase1_tests": "pass" if phase1_tests and all(v == "pass" for v in phase1_tests.values()) else "fail",
                "phase1_bench": "pass" if p1_bench_ok else "fail"}
    W["W13"] = t_e2e("W13 linked selection")
    W["W14"] = {**t_unit("one copy", "click = select"), **t_e2e("W14:")}
    W["W15"] = t_e2e("W15 OBJECT MODE")
    W["W16"] = t_e2e("W16 + W3", "chain on ")
    W["W17"] = t_e2e("W13 + W17", "W17 mixed")
    W["W18"] = {**t_e2e("W16 + W3", "W18 W19 W20"), **t_py("test_explain_myanmar_r2_grouping", "test_w18_why_myanmar_through_the_api")}
    W["W19"] = {**t_e2e("W18 W19 W20", "W19 W20 WHY in D3"), **t_py("test_explain_rules_without_grouping_report_not_recorded")}
    W["W20"] = {**t_e2e("W18 W19 W20", "W19 W20 WHY in D3"), **t_py("test_explain_canonical_relation")}
    W["W21"] = t_unit("W21")
    W["W22"] = t_py("test_w22_ui_strings_are_non_causal_and_non_probabilistic")
    W["W23"] = t_e2e("W23")
    W["W24"] = t_e2e("W16 + W3")
    W["W25"] = t_e2e("W25")
    W["W26"] = t_e2e("W26")
    W["W27"] = t_e2e("W27")
    W["W28"] = t_e2e("W28")
    W["W29"] = {**t_e2e("W29 ", "fix "), "visual_review": "see NEXUM-PHASE2 report (screenshots in data/reports/phase2/screens)"}
    W["W30"] = {**t_unit("W30"), **t_e2e("W30 keyboard")}
    W["W31"] = t_py("test_w31_trails_persist_export_import_and_never_touch_the_world")
    blocking_api = {k: api.get(k, {}).get("pass") for k in ("A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9")}
    blocking_ui = {k: ui.get(k, {}).get("pass") for k in ("U1", "U2", "U3", "U4", "U5", "U6", "U7", "U9")}
    blocking_ui["U8"] = bundle.get("pass")
    W["W32"] = {**{k: "pass" if v else "fail" for k, v in blocking_api.items()},
                **{k: "pass" if v else "fail" for k, v in blocking_ui.items()}}
    verdict = {}
    for k, v in W.items():
        vals = [x for x in v.values() if x in ("pass", "fail", "skip")]
        verdict[k] = "PASS" if vals and all(x == "pass" for x in vals) else "FAIL"
    out = {"verdict": verdict, "evidence": W, "counts": {"pytest": len(py), "unit": len(unit), "e2e": len(e2e)},
           "pytest_failed": [k for k, v in py.items() if v != "pass"], "e2e_failed": [k for k, v in e2e.items() if v != "pass"],
           "unit_failed": [k for k, v in unit.items() if v != "pass"], "phase1": p1}
    (REP / "report.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(json.dumps(verdict, indent=0))
    print("pytest failed:", out["pytest_failed"])
    print("e2e failed:", out["e2e_failed"])
    print("unit failed:", out["unit_failed"])


def main():
    ap = argparse.ArgumentParser()
    for f in ("phase1", "ui-clean", "tests", "bench", "report"):
        ap.add_argument(f"--{f}", action="store_true")
    ap.add_argument("--a6-minutes", type=float, default=30.0)
    a = ap.parse_args()
    if a.phase1:
        phase1()
    if a.ui_clean:
        ui_clean()
    if a.tests:
        tests()
    if a.bench:
        bench(a.a6_minutes)
    if a.report:
        report()


if __name__ == "__main__":
    main()
