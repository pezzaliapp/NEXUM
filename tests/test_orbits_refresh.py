"""Option C (2026-10-16): CelesTrak's orbital elements once a day, on a loopback server — never CelesTrak itself.
One request per set (no retry, no redirect), ≥ 10 s apart, a stop at the first anomaly (HTTP error, redirect, timeout,
truncated body, a 200 with an error text), the last usable payload of every set kept in the published table (same
format), and CelesTrak in the daily publish only."""

import argparse
import dataclasses
import http.server
import importlib.util
import json
import threading
import time
import types

import pytest

from connectors import celestrak_gp as cg
from nexum.api.server import Service
from nexum.core import db as dbm
from nexum.core.raw import RawStore
from nexum.core.registry import load_source
from nexum.core.scheduler import USER_AGENT, Scheduler
from tests.conftest import ROOT


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


orb = _load("nexum_events_orbits", ROOT / ".github" / "nexum-events" / "orbits.py")
pipe = _load("nexum_events_pipeline", ROOT / ".github" / "nexum-events" / "pipeline.py")

SETS = {"stations": "station", "glo-ops": "navigation", "starlink": "starlink"}
PUBLISHED_FIELDS = ["norad", "name", "family", "cospar", "epoch", "mean_motion", "eccentricity", "inclination", "raan",
                    "arg_pericenter", "mean_anomaly", "bstar", "mean_motion_dot", "mean_motion_ddot"]
ERROR_TEXT = b'Invalid query: "GROUP=glonass-operational&FORMAT=csv" (GROUP=glonass-operational not found)'


def omm(*objects, epoch="2026-10-16T01:00:00.000000"):
    lines = [",".join(cg.FIELDS)]
    for nid, name in objects:
        lines.append(f"{name},2026-001A,{epoch},15.5,.0005,51.6,10.0,20.0,30.0,0,U,{nid},999,100,.0001,.00001,0")
    return ("\r\n".join(lines) + "\r\n").encode()


class Handler(http.server.BaseHTTPRequestHandler):
    log, mode, body = [], {}, {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        group = self.path.split("GROUP=")[-1].split("&")[0]
        Handler.log.append({"path": self.path, "group": group, "ua": self.headers.get("User-Agent")})
        m = Handler.mode.get(group, "ok")
        if m in ("403", "500", "404"):
            self.send_response(int(m))
            self.end_headers()
            return
        if m == "301":
            self.send_response(301)
            self.send_header("Location", "/moved/gp.php?GROUP=" + group)
            self.end_headers()
            return
        if m == "slow":
            time.sleep(1.5)
        body = ERROR_TEXT if m == "error_text" else Handler.body.get(group, omm((100 + list(SETS).index(group), group.upper())))
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=UTF-8")
        if m == "truncated":
            self.send_header("Content-Length", str(len(body) + 5000))
            self.end_headers()
            self.wfile.write(body[: len(body) // 2])
            self.close_connection = True
            return
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    Handler.log, Handler.mode, Handler.body = [], {}, {}
    yield f"127.0.0.1:{srv.server_port}"
    srv.shutdown()


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += max(0.0, s)


class ShortTimeout:
    """The runner's own opener, with a 0.3 s timeout instead of the Scheduler's 90 s (a timeout test in a second)."""

    def __init__(self, inner):
        self.inner = inner

    def open(self, req, timeout=None):
        return self.inner.open(req, timeout=0.3)


@pytest.fixture
def world(tmp_path, server, monkeypatch):
    monkeypatch.setattr(cg, "GP", f"http://{server}/NORAD/elements/gp.php?GROUP={{}}&FORMAT=csv")
    monkeypatch.setattr(cg, "SETS", dict(SETS))
    s = load_source(ROOT / "sources_live" / "celestrak.gp.toml")
    s = dataclasses.replace(s, allowed_hosts=[server])
    db = tmp_path / "t.db"
    conn = dbm.connect(str(db))
    dbm.create_schema(conn)
    conn.execute("INSERT INTO source(source_id) VALUES(?)", (s.id,))
    raw = RawStore(tmp_path / "raw")
    clock = Clock()
    state = {"n": 0}

    def run(opener=None):
        state["n"] += 1
        rid = f"run{state['n']}"
        sched = Scheduler(conn, raw, {s.id: s}, ROOT, clock=clock, sleep=clock.sleep, opener=opener or orb.opener(), run_id=rid)
        return orb.refresh(sched, raw, conn, s, cg, rid, clock=clock, sleep=clock.sleep)

    def table():
        svc = types.SimpleNamespace(sources={s.id: s}, cfg=types.SimpleNamespace(db_path=str(db)),
                                    raw=types.SimpleNamespace(store=raw))
        return Service.published_table(svc, "orbits")["data"]

    def later(hours):
        clock.t += hours * 3600
    return types.SimpleNamespace(run=run, table=table, later=later, conn=conn, clock=clock)


def test_every_set_once_ten_seconds_apart_with_the_core_user_agent(world):
    summary, reason = world.run()
    assert reason is None and summary["sets_ok"] == 3 and summary["requests"] == 3
    assert [h["group"] for h in Handler.log] == list(SETS)                     # one request per set, in order
    assert {h["ua"] for h in Handler.log} == {USER_AGENT}
    t = [r[0] for r in world.conn.execute("SELECT requested_ms FROM fetch_log ORDER BY requested_ms")]
    assert all(b - a >= 10_000 for a, b in zip(t, t[1:])), t
    assert {r[1] for r in world.table()["rows"]} == {"STATIONS", "GLO-OPS", "STARLINK"}


@pytest.mark.parametrize("mode", ["403", "404", "500"])
def test_an_http_error_stops_at_once_without_retry(world, mode):
    Handler.mode["glo-ops"] = mode
    summary, reason = world.run()
    assert [h["group"] for h in Handler.log] == ["stations", "glo-ops"]          # one attempt, starlink never asked
    assert reason.startswith("celestrak_gp_glo-ops.csv") and mode in reason
    assert summary["sets_ok"] == 1 and summary["requests"] == 2


def test_a_redirect_is_not_followed(world):
    Handler.mode["stations"] = "301"
    _summary, reason = world.run()
    assert [h["path"] for h in Handler.log] == [f"/NORAD/elements/gp.php?GROUP=stations&FORMAT=csv"]
    assert "301" in reason and not any("/moved/" in h["path"] for h in Handler.log)
    assert world.conn.execute("SELECT COUNT(*) FROM raw_record").fetchone()[0] == 0


def test_a_timeout_stops_without_retry(world):
    Handler.mode["stations"] = "slow"
    summary, reason = world.run(ShortTimeout(orb.opener()))
    assert len(Handler.log) == 1 and summary["requests"] == 1
    assert "timed out" in reason.lower() or "timeout" in reason.lower()
    assert world.conn.execute("SELECT COUNT(*) FROM raw_record").fetchone()[0] == 0


def test_a_truncated_answer_stops_and_stores_nothing(world):
    Handler.mode["stations"] = "truncated"
    summary, reason = world.run()
    assert len(Handler.log) == 1 and summary["requests"] == 1 and reason
    assert world.conn.execute("SELECT COUNT(*) FROM raw_record").fetchone()[0] == 0


def test_a_200_with_an_error_text_stops_and_the_previous_data_stay(world):
    Handler.body["glo-ops"] = omm((11, "COSMOS 2500 (GLONASS-M)"), (12, "COSMOS 2501 (GLONASS-K)"))
    assert world.run()[1] is None
    before = world.table()
    world.later(24)
    Handler.mode["glo-ops"] = "error_text"
    Handler.body["stations"] = omm((1, "ISS (ZARYA)"), epoch="2026-10-17T01:00:00.000000")
    summary, reason = world.run()
    assert "not the OMM CSV" in reason and summary["sets_ok"] == 1
    assert [h["group"] for h in Handler.log[3:]] == ["stations", "glo-ops"]     # starlink not asked after the anomaly
    after = world.table()
    names = {r[1]: r for r in after["rows"]}
    assert "COSMOS 2500 (GLONASS-M)" in names and "COSMOS 2501 (GLONASS-K)" in names   # the group is never emptied
    assert names["ISS (ZARYA)"][4] == "2026-10-17T01:00:00.000000"                     # the good set is updated
    assert after["fields"] == before["fields"] == PUBLISHED_FIELDS


def test_an_empty_set_is_valid_and_does_not_stop(world):
    Handler.body["glo-ops"] = omm()
    summary, reason = world.run()
    assert reason is None and summary["sets_ok"] == 3


def test_a_set_fetched_less_than_two_hours_ago_is_not_asked_again(world):
    assert world.run()[1] is None
    world.later(1)
    summary, reason = world.run()
    assert len(Handler.log) == 3 and summary["requests"] == 0 and summary["deferred"] == 1 and "deferred" in reason


def test_usable_payloads():
    assert cg.usable(omm((1, "X"))) and cg.usable(omm())
    assert not cg.usable(ERROR_TEXT) and not cg.usable(b"") and not cg.usable(b"OBJECT_NAME,OBJECT_ID\r\nX,Y\r\n")
    assert not cg.usable(b"<html>rate limited</html>")


def test_published_format_unchanged_and_glonass_group_named_as_celestrak_does():
    t = cg.table([("celestrak_gp_stations.csv", omm((25544, "ISS (ZARYA)")), 1, cg.GP.format("stations"))])
    assert t["fields"] == PUBLISHED_FIELDS and set(t["notes"]) == {"epoch_min", "epoch_max"}
    assert "glo-ops" in cg.SETS and "glonass-operational" not in cg.SETS    # celestrak.org/NORAD/elements: "GLONASS Operational"
    assert list(cg.SETS)[-1] == "starlink" and len(cg.SETS) == 23            # no set removed


def _report(tmp_path, publish):
    a = argparse.Namespace(seed=str(tmp_path / "no-seed"), out=str(tmp_path / ("p" if publish else "u")), sources="",
                           publish=publish, production_url="", no_npm_ci=True, test_break="", test_inject_loss="")
    assert pipe.run(a) == 3                                                   # no reference world: stops before any fetch
    return json.loads((tmp_path / ("p" if publish else "u") / "report.json").read_text())


def test_celestrak_in_the_daily_publish_only(tmp_path):
    assert _report(tmp_path, publish=False)["sources"] == list(pipe.PHASE1)
    assert _report(tmp_path, publish=True)["sources"] == [*pipe.PHASE1, "celestrak.gp"]


def test_the_pipeline_runs_celestrak_through_the_runner_and_the_others_as_before(monkeypatch):
    cmds = []

    def sh(cmd, cwd=None, timeout=None, env=None):
        cmds.append(cmd)
        sid = "celestrak.gp" if str(cmd[1]).endswith("orbits.py") else cmd[cmd.index("--source") + 1]
        return 0, json.dumps({sid: {"requests": 0, "new_raw": 0, "not_modified": 0, "deferred": 0}}), "", 0.1
    monkeypatch.setattr(pipe, "sh", sh)
    pipe.acquire(("nasa.eonet", "celestrak.gp"))
    assert cmds[0][1:] == ["-m", "nexum.cli", "live", "fetch", "--source", "nasa.eonet", "--mode", "incremental"]
    assert cmds[1][1:] == [str(ROOT / ".github" / "nexum-events" / "orbits.py")]


def test_a_stopped_runner_is_signalled_as_failed(monkeypatch):
    def sh(cmd, cwd=None, timeout=None, env=None):
        return 3, json.dumps({"celestrak.gp": {"requests": 2, "sets_ok": 1}}), "celestrak.gp: stopped after 1 sets — HTTP 403", 0.1
    monkeypatch.setattr(pipe, "sh", sh)
    out = pipe.acquire(("celestrak.gp",))
    assert out["celestrak.gp"]["status"] == "failed" and "403" in out["celestrak.gp"]["steps"][0]["error"]
