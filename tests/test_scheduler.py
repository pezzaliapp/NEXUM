"""Polite Scheduler on a loopback server: allowlist, honest UA, rate limit, ETag/304, Retry-After, suspension."""

import dataclasses
import http.server
import threading

import pytest

from nexum.core import db as dbm
from nexum.core.raw import RawStore
from nexum.core.registry import load_source
from nexum.core.scheduler import USER_AGENT, Deferred, FetchRequest, NotAllowed, Scheduler, SchedulerError
from tests.conftest import ROOT


class Handler(http.server.BaseHTTPRequestHandler):
    log = []
    mode = {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        Handler.log.append({"path": self.path, "ua": self.headers.get("User-Agent"),
                            "inm": self.headers.get("If-None-Match")})
        m = Handler.mode.get(self.path, "ok")
        if m == "etag" and self.headers.get("If-None-Match") == '"v1"':
            self.send_response(304)
            self.end_headers()
            return
        if m == "429":
            self.send_response(429)
            self.send_header("Retry-After", "120")
            self.end_headers()
            return
        if m == "500":
            self.send_response(500)
            self.end_headers()
            return
        body = b'{"ok": true}'
        self.send_response(200)
        self.send_header("ETag", '"v1"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    Handler.log, Handler.mode = [], {}
    yield f"127.0.0.1:{srv.server_port}"
    srv.shutdown()


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0
        self.sleeps = []

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.sleeps.append(s)
        self.t += s


def make(tmp_path, host, **pol):
    s = load_source(ROOT / "sources" / "usgs.earthquakes.toml")
    s = dataclasses.replace(s, allowed_hosts=[host], **pol)
    conn = dbm.connect(str(tmp_path / "t.db"))
    dbm.create_schema(conn)
    conn.execute("INSERT INTO source(source_id) VALUES(?)", (s.id,))
    clock = Clock()
    sch = Scheduler(conn, RawStore(tmp_path / "raw"), {s.id: s}, ROOT, clock=clock, sleep=clock.sleep, run_id="r")
    return s, sch, clock, conn


def test_allowlist_and_honest_user_agent(tmp_path, server):
    s, sch, _, conn = make(tmp_path, server)
    with pytest.raises(NotAllowed):
        sch.fetch(s, FetchRequest("http://example.org/x", "x"))
    sch.fetch(s, FetchRequest(f"http://{server}/a", "a"))
    assert Handler.log[-1]["ua"] == USER_AGENT and "NEXUM" in USER_AGENT
    assert conn.execute("SELECT COUNT(*) FROM fetch_log WHERE user_agent=?", (USER_AGENT,)).fetchone()[0] == 1


def test_rate_limit_between_requests_to_same_host(tmp_path, server):
    s, sch, clock, _ = make(tmp_path, server, max_rps=0.5)
    sch.fetch(s, FetchRequest(f"http://{server}/a", "a", force=True))
    sch.fetch(s, FetchRequest(f"http://{server}/b", "b", force=True))
    assert clock.sleeps and abs(sum(clock.sleeps) - 2.0) < 1e-6


def test_conditional_get_and_304(tmp_path, server):
    s, sch, clock, conn = make(tmp_path, server, min_interval_s=0)
    Handler.mode["/e"] = "etag"
    r1 = sch.fetch(s, FetchRequest(f"http://{server}/e", "e"))
    clock.t += 10
    r2 = sch.fetch(s, FetchRequest(f"http://{server}/e", "e"))
    assert Handler.log[-1]["inm"] == '"v1"' and r2.not_modified and r2.raw_id == r1.raw_id
    assert conn.execute("SELECT COUNT(*) FROM raw_record").fetchone()[0] == 1


def test_min_interval_defers(tmp_path, server):
    s, sch, _, _ = make(tmp_path, server, min_interval_s=60)
    sch.fetch(s, FetchRequest(f"http://{server}/m", "m"))
    with pytest.raises(Deferred):
        sch.fetch(s, FetchRequest(f"http://{server}/m", "m"))


def test_retry_after_is_respected(tmp_path, server):
    s, sch, clock, _ = make(tmp_path, server)
    Handler.mode["/r"] = "429"
    with pytest.raises(Deferred):
        sch.fetch(s, FetchRequest(f"http://{server}/r", "r", force=True))
    n = len(Handler.log)
    with pytest.raises(Deferred):
        sch.fetch(s, FetchRequest(f"http://{server}/other", "o", force=True))
    assert len(Handler.log) == n  # no request sent before Retry-After expires


def test_backoff_and_suspension(tmp_path, server):
    s, sch, clock, conn = make(tmp_path, server)
    Handler.mode["/x"] = "500"
    for _ in range(2):
        with pytest.raises(SchedulerError):
            sch.fetch(s, FetchRequest(f"http://{server}/x", "x", force=True), max_retries=2)
    assert conn.execute("SELECT state FROM source_health").fetchone()[0] == "suspended"
    assert any(x >= 2.0 for x in clock.sleeps)  # exponential backoff happened
    with pytest.raises(Deferred):
        sch.fetch(s, FetchRequest(f"http://{server}/y", "y", force=True))


def test_rate_limit_persists_across_sessions(tmp_path, server):
    s, sch, clock, conn = make(tmp_path, server, max_rps=0.5)
    sch.fetch(s, FetchRequest(f"http://{server}/a", "a", force=True))
    sch2 = Scheduler(conn, sch.raw, sch.sources, ROOT, clock=clock, sleep=clock.sleep, run_id="r2")
    clock.sleeps.clear()
    sch2.fetch(s, FetchRequest(f"http://{server}/b", "b", force=True))
    assert clock.sleeps and abs(sum(clock.sleeps) - 2.0) < 1e-3
