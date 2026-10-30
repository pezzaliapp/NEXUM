"""CODE PIN (2026-10-30): data reach production by themselves, code only when the author moves NEXUM_CODE_PIN.

Checked on throw-away git repositories (codepin.py), on the workflow file itself, on the deploy step executed with stub
commands (wrangler, curl, sleep: no network, no Cloudflare) — a production deploy that does not serve exactly the
approved code and the new data is rolled back to the deployment production served before — and on the 48-hour
freshness signal (freshness.py, its workflow step with a stub gh against a loopback site)."""

import datetime as dt
import http.server
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import threading

import pytest
import yaml

from tests.conftest import ROOT

WF = ROOT / ".github" / "workflows" / "nexum-events.yml"
CODEPIN = ROOT / ".github" / "nexum-events" / "codepin.py"
FRESH = ROOT / ".github" / "nexum-events" / "freshness.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


cp = _load("codepin", CODEPIN)
fr = _load("freshness", FRESH)


def steps():
    return yaml.safe_load(WF.read_text())["jobs"]["run"]["steps"]


def step(prefix):
    return next(s for s in steps() if (s.get("name") or "").startswith(prefix))


# ── a repository like NEXUM's: main, an approved tag, later commits ──────────
def g(repo, *args):
    p = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True,
                       env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
                            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"})
    assert p.returncode == 0, p.stderr
    return p.stdout.strip()


def commit(repo, files, msg):
    for k, v in files.items():
        (repo / k).parent.mkdir(parents=True, exist_ok=True)
        (repo / k).write_text(v)
    g(repo, "add", "-A")
    g(repo, "commit", "-q", "-m", msg)
    return g(repo, "rev-parse", "HEAD")


def approve(repo, sha, day="20261030", annotated=True, name=None):
    tag = name or f"approved-{day}-{sha[:7]}"
    g(repo, *(["tag", "-a", tag, "-m", "approved by the author", sha] if annotated else ["tag", tag, sha]))
    return tag


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    g(r, "init", "-q", "-b", "main")
    a = commit(r, {".github/workflows/nexum-events.yml": WF.read_text(), ".github/nexum-events/codepin.py": CODEPIN.read_text(),
                   "ui/src/config/ops.json": '{"v": 1}', "connectors/x.py": "V = 1\n", ".gitignore": "out/\n"}, "approved code")
    return r, a


def run_check(r, pin, main, code="pin", deploy="production"):
    try:
        return cp.check(pin, main, code, deploy, cwd=r)
    except cp.Refused as e:
        return {"refused": str(e)}


def test_the_approved_code_runs_and_main_newer_code_does_not(repo):
    r, a = repo
    pin = approve(r, a)
    b = commit(r, {"connectors/x.py": "V = 2  # not approved\n", "ui/src/config/ops.json": '{"v": 2}'}, "newer code")
    g(r, "checkout", "-q", pin)                                       # what the workflow checks out: the pin
    out = run_check(r, pin, b)
    assert out == {"pinned": True, "code_sha": a, "pin": pin, "store_reference": True}
    assert (r / "connectors/x.py").read_text() == "V = 1\n"            # code and configuration of the pin, not main's
    assert (r / "ui/src/config/ops.json").read_text() == '{"v": 1}'


@pytest.mark.parametrize("change", ["workflow", "workflow_whitespace"])
def test_a_workflow_change_on_main_stops_everything_until_a_new_approval(repo, change):
    r, a = repo
    pin = approve(r, a)
    wf = WF.read_text().replace("cron: \"23 3 * * *\"", "cron: \"0 3 * * *\"") if change == "workflow" else WF.read_text() + "\n"
    b = commit(r, {".github/workflows/nexum-events.yml": wf}, "workflow edited")
    g(r, "checkout", "-q", pin)
    assert "differs from the approved one" in run_check(r, pin, b)["refused"]
    assert "differs from the approved one" in run_check(r, pin, b, deploy="none")["refused"]   # updates too
    pin2 = approve(r, b, day="20261031")                                # the author approves the new workflow
    g(r, "checkout", "-q", pin2)
    assert run_check(r, pin2, b)["pinned"] is True


@pytest.mark.parametrize("pin, why", [("", "not an approved-YYYYMMDD-<sha> tag"), ("main", "not an approved"),
                                      ("approved-2026-1030-abc", "not an approved"), ("v1.0", "not an approved")])
def test_no_pin_or_a_malformed_pin_runs_nothing(repo, pin, why):
    r, a = repo
    assert why in run_check(r, pin, a, deploy="none")["refused"]


def test_a_lightweight_tag_a_wrong_sha_in_the_name_or_a_missing_tag_is_refused(repo):
    r, a = repo
    light = approve(r, a, annotated=False)
    assert "not an annotated tag" in run_check(r, light, a)["refused"]
    wrong = approve(r, a, name="approved-20261030-deadbee")
    assert "points to" in run_check(r, wrong, a)["refused"]
    assert "refused" in run_check(r, "approved-20261030-0123456", a)


def test_a_pin_outside_main_is_refused(repo):
    r, a = repo
    g(r, "checkout", "-q", "-b", "side")
    s = commit(r, {"connectors/x.py": "V = 3\n"}, "side branch")
    pin = approve(r, s)
    g(r, "checkout", "-q", pin)
    assert "is not on main" in run_check(r, pin, a)["refused"]


def test_the_checkout_must_be_the_pin_and_clean(repo):
    r, a = repo
    pin = approve(r, a)
    b = commit(r, {"connectors/x.py": "V = 2\n"}, "newer")
    assert "not the approved" in run_check(r, pin, b)["refused"]       # main checked out, code=pin
    g(r, "checkout", "-q", pin)
    (r / "connectors/x.py").write_text("V = 9\n")                       # a tracked file changed
    assert "tracked files differ" in run_check(r, pin, b)["refused"]
    g(r, "checkout", "-q", "--", "connectors/x.py")
    (r / "out").mkdir()
    (r / "out/report.json").write_text("{}")                            # outputs of the run: fine
    (r / "untracked.txt").write_text("x")
    assert run_check(r, pin, b)["pinned"] is True


def test_code_main_is_for_a_preview_only_and_stores_no_reference(repo):
    r, a = repo
    approve(r, a)
    b = commit(r, {"connectors/x.py": "V = 2\n"}, "newer")
    assert "never deploys to production" in run_check(r, "", b, code="main", deploy="production")["refused"]
    assert run_check(r, "", b, code="main", deploy="preview") == {"pinned": False, "code_sha": b, "pin": None,
                                                                  "store_reference": False}
    assert "unknown code choice" in run_check(r, "", b, code="newest", deploy="preview")["refused"]


def test_the_command_line_writes_the_env_file_and_refuses_with_exit_4(repo, tmp_path):
    r, a = repo
    pin = approve(r, a)
    env = tmp_path / "env"
    p = subprocess.run(["python3", str(CODEPIN), "check", "--pin", pin, "--main", a, "--code", "pin", "--deploy", "preview",
                        "--github-env", str(env)], cwd=r, capture_output=True, text=True)
    assert p.returncode == 0 and json.loads(p.stdout)["pinned"] is True
    assert env.read_text() == f"PINNED=true\nCODE_SHA={a}\nCODE_PIN={pin}\n"
    p = subprocess.run(["python3", str(CODEPIN), "check", "--pin", "", "--main", a], cwd=r, capture_output=True, text=True)
    assert p.returncode == 4 and "refused" in json.loads(p.stdout)
    (r / "connectors/x.py").write_text("V = 9\n")
    p = subprocess.run(["python3", str(CODEPIN), "clean"], cwd=r, capture_output=True, text=True)
    assert p.returncode == 4 and "nothing is deployed" in p.stdout


# ── the workflow file ────────────────────────────────────────────────────────
def test_every_run_checks_out_the_pin_and_checks_it_before_anything_else():
    names = [s.get("name") or s.get("uses") for s in steps()]
    assert names[:3] == ["Mode", "actions/checkout@v4", "Code pin (approved code only; the workflow identical to the approved one)"]
    co = steps()[1]["with"]
    assert co["ref"] == "${{ inputs.code == 'main' && github.sha || vars.NEXUM_CODE_PIN }}" and co["fetch-depth"] == 0
    run = step("Code pin")["run"]
    assert step("Code pin")["env"] == {"PIN": "${{ vars.NEXUM_CODE_PIN }}"} and "${{" not in run
    assert 'codepin.py check --pin "$PIN" --main "$GITHUB_SHA"' in run and "--github-env" in run
    mode = step("Mode")["run"]
    assert "code=pin" in mode and 'vars.NEXUM_AUTO_PUBLISH }}" = "true" ]; then deploy=production; else deploy=preview' in mode
    on = yaml.safe_load(WF.read_text())[True]
    assert on["workflow_dispatch"]["inputs"]["code"] == {
        "description": on["workflow_dispatch"]["inputs"]["code"]["description"], "type": "choice", "options": ["pin", "main"],
        "default": "pin"}


def test_only_approved_code_stores_a_reference_world_and_deploys_with_its_commit():
    assert step("Store the next reference world")["if"].startswith("always() && env.PINNED == 'true'")
    run = step("Deploy and verify")["run"]
    assert run.index("codepin.py clean") < run.index("wrangler")
    assert '--commit-hash "$CODE_SHA"' in run and "GITHUB_SHA" not in run
    assert "canonical_deployment" in run and "/rollback" in run
    assert "GITHUB_SHA" not in step("Pipeline")["run"]


# ── the deploy step, executed with stubs: verification and rollback ──────────
STUB = {
    "npx": 'echo "npx $*" >> "$STUBLOG"; echo "✨ Deployment complete! Take a peek over at https://abcdef12.nexum-45e.pages.dev"',
    "sleep": "exit 0",
    "curl": r'''echo "curl $*" >> "$STUBLOG"
url="${@: -1}"
case "$*" in *"-X POST"*) echo '{"success":true}'; exit 0;; esac
case "$url" in
  */projects/nexum) cat "$STUBDIR/project.json";;
  https://abcdef12.*/current.json|$SITE_URL/current.json) cat "$STUBDIR/current.json";;
  https://abcdef12.*/version.json) cat "$STUBDIR/version.json";;
  $SITE_URL/version.json) cat "$STUBDIR/site_version.json";;
  */api/status.json) echo 200;;
  *) exit 22;;
esac''',
}


@pytest.fixture
def deploy(repo, tmp_path):
    r, a = repo
    pin = approve(r, a)
    g(r, "checkout", "-q", pin)
    bins = tmp_path / "bin"
    bins.mkdir()
    for k, v in STUB.items():
        (bins / k).write_text("#!/bin/bash\n" + v + "\n")
        (bins / k).chmod((bins / k).stat().st_mode | stat.S_IEXEC)
    sd = tmp_path / "stub"
    sd.mkdir()
    (r / "out").mkdir()
    (r / "out/site.json").write_text(json.dumps({"version": "live-2000-x", "build": "202610301000-abcd"}))

    def go(deploy="production", served_build="202610301000-abcd", commit=a, canonical="abcdef12-0000"):
        (sd / "current.json").write_text(json.dumps({"version": "live-2000-x"}))
        (sd / "version.json").write_text(json.dumps({"build": "202610301000-abcd"}))
        (sd / "site_version.json").write_text(json.dumps({"build": served_build}))
        (sd / "project.json").write_text(json.dumps({"result": {"canonical_deployment": {
            "id": canonical, "environment": "production", "deployment_trigger": {"metadata": {"commit_hash": commit}}}}}))
        log = tmp_path / "stub.log"
        log.write_text("")
        # the step script is wrapped like GitHub runs it: bash -e {0}; the stub's `curl -w %{http_code}` prints 200
        script = step("Deploy and verify")["run"]
        env = {**os.environ, "PATH": f"{bins}:{os.environ['PATH']}", "STUBLOG": str(log), "STUBDIR": str(sd),
               "DEPLOY": deploy, "CODE_SHA": a, "CODE_PIN": pin, "SITE_URL": "https://nexum.example.invalid",
               "PAGES_PROJECT": "nexum", "PREVIEW_BRANCH": "live-review", "CLOUDFLARE_ACCOUNT_ID": "acc",
               "CLOUDFLARE_API_TOKEN": "tok", "GITHUB_STEP_SUMMARY": str(tmp_path / "summary"),
               "GITHUB_OUTPUT": str(tmp_path / "output")}
        p = subprocess.run(["bash", "-e", "-c", script], cwd=r, env=env, capture_output=True, text=True)
        return p, log.read_text()
    return types_ns(go=go, repo=r, sha=a)


def types_ns(**k):
    import types
    return types.SimpleNamespace(**k)


def test_a_verified_production_deploy_keeps_production_and_records_the_approved_commit(deploy):
    p, log = deploy.go()
    assert p.returncode == 0, p.stdout + p.stderr
    assert f'--commit-hash {deploy.sha}' in log and "--branch main" in log and "/rollback" not in log


def test_production_not_serving_the_new_build_is_rolled_back_to_the_previous_production(deploy):
    p, log = deploy.go(served_build="202610222102-tduc")
    assert p.returncode == 1 and "production rolled back to abcdef12-0000" in p.stdout
    assert "-X POST" in log and "/deployments/abcdef12-0000/rollback" in log


def test_production_of_another_commit_is_rolled_back(deploy):
    p, log = deploy.go(commit="0" * 40, canonical="abcdef12-0000")
    assert p.returncode == 1 and "not this deployment of" in p.stdout and "/rollback" in log


def test_a_failed_preview_never_touches_production(deploy):
    p, log = deploy.go(deploy="preview", served_build="x")
    (deploy.repo / "x").write_text("")
    p2, log2 = deploy.go(deploy="preview")
    assert p2.returncode == 0 and "--branch live-review" in log2 and "/rollback" not in log2 and "projects/nexum " not in log2


def test_a_tracked_file_changed_during_the_run_deploys_nothing(deploy):
    (deploy.repo / "connectors/x.py").write_text("V = 9\n")
    p, log = deploy.go()
    assert p.returncode != 0 and "npx" not in log


# ── 48 hours without a publication ───────────────────────────────────────────
NOW = dt.datetime(2026, 10, 30, 8, 0, tzinfo=dt.timezone.utc)


@pytest.mark.parametrize("built, issue, mode, action", [
    ("2026-10-28T09:00:00Z", False, "publish", "none"),        # 47 h
    ("2026-10-28T08:00:00Z", False, "update", "open"),         # 48 h
    ("2026-10-22T20:11:00Z", True, "publish", "comment"),      # the 8 days of October 2026: once a day
    ("2026-10-22T20:11:00Z", True, "update", "none"),
    ("2026-10-30T07:00:00Z", True, "update", "close"),         # fresh again
    (None, False, "publish", "warn"),
])
def test_freshness_decision(built, issue, mode, action):
    assert fr.decide(built, NOW, issue, mode)["action"] == action


@pytest.fixture
def site():
    class H(http.server.BaseHTTPRequestHandler):
        body = b"{}"

        def log_message(self, *a):
            pass

        def do_GET(self):
            self.send_response(200 if self.path == "/current.json" else 404)
            self.end_headers()
            if self.path == "/current.json":
                self.wfile.write(H.body)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield H, f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


@pytest.mark.parametrize("hours, issue, expect", [(60, "", "gh issue create"), (60, "7", "gh issue comment 7"),
                                                  (2, "7", "gh issue close 7"), (2, "", None)])
def test_the_freshness_step_with_a_stub_gh(site, tmp_path, hours, issue, expect):
    H, url = site
    built = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    H.body = json.dumps({"built_utc": built}).encode()
    bins = tmp_path / "bin"
    bins.mkdir()
    (bins / "gh").write_text('#!/bin/bash\necho "gh $*" >> "$STUBLOG"\n'
                             'case "$1 $2" in "issue list") echo "$OPEN";; esac\n')
    (bins / "gh").chmod(0o755)
    log = tmp_path / "gh.log"
    log.write_text("")
    work = tmp_path / "w"
    shutil.copytree(ROOT / ".github" / "nexum-events", work / ".github" / "nexum-events",
                    ignore=shutil.ignore_patterns("__pycache__"))
    script = step("Production freshness")["run"].replace("${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}", "RUN")
    env = {**os.environ, "PATH": f"{bins}:{os.environ['PATH']}", "STUBLOG": str(log), "OPEN": issue, "SITE_URL": url,
           "MODE": "publish", "GITHUB_STEP_SUMMARY": str(tmp_path / "summary")}
    p = subprocess.run(["bash", "-e", "-c", script], cwd=work, env=env, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    calls = [x for x in log.read_text().splitlines() if not x.startswith("gh issue list")]
    if expect is None:
        assert calls == []
    else:
        assert len(calls) == 1 and calls[0].startswith(expect) and "RUN" in calls[0]
