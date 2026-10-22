"""NASA FIRMS hotspots (2026-10-21), on a loopback server — never FIRMS itself. The open 24-hour VIIRS files, no key,
through the Core's own fetch (Nexum.fetch, the Polite Scheduler) with the project's User-Agent; at most once every 3
hours; a day a source fails (HTTP error, unreachable, a 200 that is not the CSV) keeps its last good file in the
published table, so the table is never emptied and never filled with an error page (the browser draws only the last 24
hours as active); FIRMS in the daily publish only.
2026-10-22: NOAA-20 replaces Suomi NPP (NASA ends its delivery on 2 November 2026); ONE SOURCE PER SATELLITE
(nasa.firms = NOAA-21, nasa.firms.noaa20 = NOAA-20), both publishing the table "hotspots" (aggregated by the API): each
is fetched, judged, signalled and suspended on its own, so one satellite failing never stops the other. The Core is
not changed (W1)."""

import dataclasses
import http.server
import importlib.util
import json
import threading
import types

import pytest

from connectors import firms_hotspots as fh
from nexum.api.server import ApiError, Service
from nexum.core import db as dbm
from nexum.core.pipeline import Nexum
from nexum.core.raw import RawStore
from nexum.core.registry import load_source
from nexum.core.scheduler import USER_AGENT, SchedulerError
from tests.conftest import ROOT

spec = importlib.util.spec_from_file_location("nexum_events_pipeline", ROOT / ".github" / "nexum-events" / "pipeline.py")
pipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipe)

HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight"
PATHS = {"noaa20": "/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv",
         "noaa21": "/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv"}
K20, K21 = "firms_noaa20_24h.csv", "firms_noaa21_24h.csv"
SID = {"noaa20": "nasa.firms.noaa20", "noaa21": "nasa.firms"}
LETTER = {"noaa20": "J", "noaa21": "N"}
FIRST = {"noaa20": "2026-10-21T01:30", "noaa21": "2026-10-21T02:42"}       # the first day's detection of each satellite


def csv(*rows):
    """rows: (lat, lon, date, hhmm, confidence, frp)"""
    return ("\n".join([HEADER] + [f"{la},{lo},330.1,0.4,0.4,{d},{t},N,{c},2.0NRT,290.2,{f},D" for la, lo, d, t, c, f in rows])
            + "\n").encode()


def manifest(sat):
    return load_source(ROOT / "sources_live" / f"{SID[sat]}.toml")


class Handler(http.server.BaseHTTPRequestHandler):
    log, mode, body = [], {}, {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        key = next((k for k, p in PATHS.items() if self.path == p), None)
        Handler.log.append({"path": self.path, "key": key, "ua": self.headers.get("User-Agent")})
        m = Handler.mode.get(key, "ok")
        if key is None or m in ("404", "500"):
            self.send_response(404 if key is None else int(m))
            self.end_headers()
            return
        body = b"<html><body>Service temporarily unavailable</body></html>" if m == "error_page" else Handler.body[key]
        self.send_response(200)
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    Handler.log, Handler.mode = [], {}
    Handler.body = {"noaa20": csv((40.1, 15.2, "2026-10-21", "0130", "n", 3.5)),
                    "noaa21": csv((-10.5, 25.25, "2026-10-21", "0242", "h", 12.0))}
    yield srv
    srv.shutdown()


class Clock:
    def __init__(self):
        self.t = 1_792_540_800.0      # 2026-10-21T00:00Z

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += max(0.0, s)


@pytest.fixture
def world(tmp_path, server, monkeypatch):
    host = f"127.0.0.1:{server.server_port}"
    monkeypatch.setattr(fh, "FILES", {k: f"http://{host}{p}" for k, p in PATHS.items()})
    srcs = {m.id: dataclasses.replace(m, allowed_hosts=[host]) for m in (manifest("noaa20"), manifest("noaa21"))}
    conn = dbm.connect(str(tmp_path / "t.db"))
    dbm.create_schema(conn)
    for sid in srcs:
        conn.execute("INSERT INTO source(source_id) VALUES(?)", (sid,))
    raw = RawStore(tmp_path / "raw")
    clock = Clock()
    nx = Nexum.__new__(Nexum)           # the Core's own fetch, on this database, raw store and clock
    nx.cfg, nx.conn, nx.raw, nx.sources, nx.root = types.SimpleNamespace(allow_fixture=False), conn, raw, srcs, ROOT
    nx.clock, nx.sleep, nx.opener, nx.run_id = clock, clock.sleep, None, "r"

    def run(sat):
        """One source, as the pipeline runs it (its own CLI call): Nexum.fetch's summary, or the error it raises."""
        try:
            return nx.fetch([SID[sat]])[SID[sat]]
        except SchedulerError as e:
            return {"raised": str(e)}

    def day():
        """The publish of a day: each satellite's source in turn, whatever the other one did."""
        return {sat: run(sat) for sat in ("noaa21", "noaa20")}

    def health(sat):
        return conn.execute("SELECT state, consecutive_errors FROM source_health WHERE source_id=?", (SID[sat],)).fetchone()

    def table(sources=None):
        svc = types.SimpleNamespace(sources=sources or srcs, cfg=types.SimpleNamespace(db_path=str(tmp_path / "t.db")),
                                    raw=types.SimpleNamespace(store=raw))
        return Service.published_table(svc, "hotspots")

    def later(hours):
        clock.t += hours * 3600

    def times(sat):
        return [r[4] for r in table()["data"]["rows"] if r[5] == LETTER[sat]]
    return types.SimpleNamespace(run=run, day=day, table=table, later=later, conn=conn, sources=srcs, health=health,
                                 raw=raw, times=times)


def asked(since=0):
    return [h["key"] for h in Handler.log[since:]]


# ── the manifests and the connector ──────────────────────────────────────────
@pytest.mark.parametrize("sat", ["noaa20", "noaa21"])
def test_one_manifest_per_satellite_no_key_the_licence_named(sat):
    s = manifest(sat)
    assert s.auth == "none" and s.allowed_hosts == ["firms.modaps.eosdis.nasa.gov"]
    assert s.license_id == "nasa-open-data" and s.attribution == f"Hotspots: NASA FIRMS (LANCE), VIIRS 375 m ({sat.upper().replace('NOAA', 'NOAA-')})"
    assert s.options == {"published_table": "hotspots", "satellite": sat} and s.connector == "connectors.firms_hotspots"
    assert s.min_interval_s >= 10800 and s.conditional_get
    assert set(fh.FILES) == {"noaa20", "noaa21"}                                     # no Suomi NPP: delivery ends 2 Nov 2026
    for u in fh.FILES.values():
        assert u.startswith("https://firms.modaps.eosdis.nasa.gov/data/active_fire/") and "?" not in u   # no key, no query


def test_each_source_plans_only_its_satellite_file():
    assert [r.resource_key for r in fh.plan("incremental", {}, manifest("noaa20"))] == [K20]
    assert [r.resource_key for r in fh.plan("incremental", {}, manifest("noaa21"))] == [K21]
    with pytest.raises(ValueError):
        fh.plan("incremental", {}, dataclasses.replace(manifest("noaa20"), options={"published_table": "hotspots"}))


# ── availability of the two satellites ──────────────────────────────────────
def test_both_satellites_available(world):
    out = world.day()
    assert out == {sat: {"requests": 1, "new_raw": 1, "not_modified": 0, "deferred": 0} for sat in ("noaa21", "noaa20")}
    assert sorted(asked()) == ["noaa20", "noaa21"]
    assert {h["ua"] for h in Handler.log} == {USER_AGENT} and "@" not in USER_AGENT
    t = world.table()
    d = t["data"]
    assert d["fields"] == ["lon", "lat", "frp_mw", "confidence", "acquired_utc", "sensor"]
    assert sorted(r[5] for r in d["rows"]) == ["J", "N"]                             # each row says its satellite
    assert d["notes"]["sensors"] == {"J": "NOAA-20", "N": "NOAA-21"}
    assert d["source_id"] == "nasa.firms" and d["source_ids"] == ["nasa.firms", "nasa.firms.noaa20"]
    assert d["attribution"] == "Hotspots: NASA FIRMS (LANCE), VIIRS 375 m (NOAA-21) · Hotspots: NASA FIRMS (LANCE), VIIRS 375 m (NOAA-20)"
    assert [s["source_id"] for s in t["sources"]] == ["nasa.firms", "nasa.firms.noaa20"]
    assert world.health("noaa20")["state"] == world.health("noaa21")["state"] == "ok"


@pytest.mark.parametrize("down", ["noaa20", "noaa21"])
@pytest.mark.parametrize("mode", ["404", "500"])
def test_only_one_satellite_available_the_other_still_updates_and_the_failure_is_its_own(world, down, mode):
    """Only NOAA-20 or only NOAA-21 answers: the other's source fetches and publishes as on any day; the failing one
    raises (its CLI fails: the pipeline marks it failed and signals it), keeps its last good file (old times, not drawn
    as active) and its own health says the failure."""
    world.day()
    world.later(24)
    up = "noaa21" if down == "noaa20" else "noaa20"
    Handler.mode[down] = mode
    Handler.body[up] = csv((-12.0, 27.0, "2026-10-22", "0400", "h", 6.0))
    n = len(Handler.log)
    out = world.day()
    assert out[up] == {"requests": 1, "new_raw": 1, "not_modified": 0, "deferred": 0}
    assert PATHS[down] in out[down]["raised"]
    assert asked(n).count(down) == (3 if mode == "500" else 1) and asked(n).count(up) == 1   # 5xx retried twice, 4xx not
    assert world.times(up) == ["2026-10-22T04:00"] and world.times(down) == [FIRST[down]]
    assert world.health(up)["state"] == "ok" and world.health(down)["state"] == "degraded"


@pytest.mark.parametrize("down", ["noaa20", "noaa21"])
def test_one_satellite_withdrawn_for_days_is_suspended_alone_the_other_updates_every_day(world, down):
    """A file withdrawn for good (a 404, as Suomi NPP's will be): its source fails every day, then is suspended after
    5 errors (said as suspended by the pipeline, resumed only by the author); the other satellite arrives every day."""
    world.day()
    up = "noaa21" if down == "noaa20" else "noaa20"
    Handler.mode[down] = "404"
    for i in range(6):
        world.later(24)
        Handler.body[up] = csv((-12.0, 27.0, f"2026-10-{22 + i}", "0400", "h", 6.0))
        out = world.day()
        assert out[up]["requests"] == 1
        assert "raised" in out[down] if i < 5 else out[down]["deferred"] == 1          # suspended: not asked any more
    assert world.times(up) == ["2026-10-27T04:00"]
    assert world.health(down)["state"] == "suspended" and world.health(up)["state"] == "ok"
    assert world.times(down) == [FIRST[down]]                                           # its last good file, kept


def test_both_satellites_unavailable_both_fail_and_the_table_stays(world):
    world.day()
    before = world.table()["data"]["rows"]
    world.later(24)
    Handler.mode.update(noaa20="404", noaa21="500")
    out = world.day()
    assert "raised" in out["noaa20"] and "raised" in out["noaa21"]
    assert world.table()["data"]["rows"] == before
    assert world.health("noaa20")["state"] == world.health("noaa21")["state"] == "degraded"


def test_both_unreachable_the_table_stays(world, server):
    world.day()
    before = world.table()["data"]["rows"]
    server.shutdown()
    server.server_close()
    world.later(24)
    assert all("raised" in v for v in world.day().values())
    assert world.table()["data"]["rows"] == before


def test_not_asked_again_within_three_hours(world):
    world.day()
    world.later(2)
    assert all(v["deferred"] == 1 for v in world.day().values())
    assert len(Handler.log) == 2


def test_a_200_that_is_not_the_csv_keeps_the_last_good_file_of_that_satellite(world):
    world.day()
    world.later(24)
    Handler.mode["noaa20"] = "error_page"
    Handler.body["noaa21"] = csv((-11.0, 26.0, "2026-10-22", "0300", "n", 4.0))
    assert all(v["requests"] == 1 for v in world.day().values())
    assert world.times("noaa20") == [FIRST["noaa20"]]                                 # kept, with its own (old) time
    assert world.times("noaa21") == ["2026-10-22T03:00"]
    assert not any("html" in str(r).lower() for r in world.table()["data"]["rows"])


# ── the table: provenance, cells, archive ────────────────────────────────────
def test_usable_and_table_keep_the_archive_and_drop_low_confidence():
    assert fh.usable(csv()) and fh.usable(b"\xef\xbb\xbf" + csv())
    assert not fh.usable(b"<html>error</html>") and not fh.usable(b"") and not fh.usable(None)
    t = fh.table([(K20, csv((1.0, 2.0, "2026-10-03", "0002", "n", 1.0), (1.0, 2.001, "2026-10-03", "0002", "h", 9.0),
                            (5.0, 6.0, "2026-10-04", "1620", "l", 50.0)), 1, "u")])
    assert t["rows"] == [[2.0, 1.0, 9.0, "h", "2026-10-03T00:02", "J"]]               # one per 0.01° cell, low left out
    assert t["notes"]["from"] == "2026-10-03T00:02" and t["notes"]["to"] == "2026-10-03T00:02"


def test_the_two_satellites_in_one_cell_one_row_the_most_recent_with_its_own_satellite():
    """No duplicate per cell, whichever order the payloads come in; the row is one detection (time, power, confidence
    and satellite of the same detection), never a mix; an old file (a satellite that failed for days) never hides a
    recent detection."""
    a = (K20, csv((1.0, 2.0, "2026-10-22", "0300", "n", 1.5), (8.0, 9.0, "2026-10-22", "0100", "n", 2.0)), 2, "u")
    b = (K21, csv((1.0, 2.001, "2026-10-18", "0100", "h", 80.0), (8.004, 9.0, "2026-10-22", "0100", "h", 7.0)), 1, "u")
    one, two = fh.table([a, b]), fh.table([b, a])
    assert one == two
    assert sorted(one["rows"]) == [[2.0, 1.0, 1.5, "n", "2026-10-22T03:00", "J"], [9.0, 8.0, 7.0, "h", "2026-10-22T01:00", "N"]]
    assert len({(r[0], r[1]) for r in one["rows"]}) == len(one["rows"])


def test_the_suomi_npp_files_already_fetched_stay_in_the_raw_store_but_not_in_the_table(world):
    sha, _ = world.raw.put(csv((40.1, 15.2, "2026-10-04", "1620", "h", 99.0)))
    world.conn.execute("INSERT INTO raw_record(raw_id, source_id, sha256, codec, size, url, resource_key, fetched_ms, http_status, path) "
                       "VALUES('old', 'nasa.firms', ?, 'gzip', 1, 'u', 'firms_snpp_24h.csv', 1, 200, 'p')", (sha,))
    world.day()
    assert world.raw.get(sha) is not None
    assert {r[5] for r in world.table()["data"]["rows"]} == {"J", "N"}


def test_a_world_of_before_the_split_still_gives_its_table(world):
    """A reference world of before (nasa.firms only, with its Suomi NPP and NOAA-21 files; nothing yet from NOAA-20):
    the table holds its NOAA-21 detections; Suomi NPP's file stays in the Raw Store."""
    for key, body in (("firms_snpp_24h.csv", csv((40.1, 15.2, "2026-10-04", "1620", "h", 9.0))),
                      (K21, csv((-10.5, 25.25, "2026-10-04", "0242", "h", 12.0)))):
        sha, _ = world.raw.put(body)
        world.conn.execute("INSERT INTO raw_record(raw_id, source_id, sha256, codec, size, url, resource_key, fetched_ms, http_status, path) "
                           "VALUES(?, 'nasa.firms', ?, 'gzip', 1, 'u', ?, 1, 200, 'p')", (key, sha, key))
    d = world.table()["data"]
    assert [r[4:] for r in d["rows"]] == [["2026-10-04T02:42", "N"]]
    assert d["source_id"] == "nasa.firms"


def test_the_api_refuses_two_sources_of_one_table_with_the_same_resource_or_connector_mismatch(world):
    world.day()
    s20, s21 = world.sources["nasa.firms.noaa20"], world.sources["nasa.firms"]
    sha = world.conn.execute("SELECT sha256 FROM raw_record WHERE source_id='nasa.firms'").fetchone()[0]
    world.conn.execute("INSERT INTO raw_record(raw_id, source_id, sha256, codec, size, url, resource_key, fetched_ms, http_status, path) "
                       "VALUES('dup', 'nasa.firms.noaa20', ?, 'gzip', 1, 'u', ?, 9, 200, 'p')", (sha, K21))
    with pytest.raises(ApiError):
        world.table()
    with pytest.raises(ApiError):
        world.table({s21.id: s21, s20.id: dataclasses.replace(s20, connector="connectors.osm_overpass")})


def test_a_table_of_one_source_answers_as_before(world):
    world.day()
    s21 = world.sources["nasa.firms"]
    t = world.table({s21.id: s21})
    assert "source_ids" not in t["data"] and t["data"]["attribution"] == s21.attribution
    assert t["sources"] == [{"source_id": s21.id, "attribution": s21.attribution, "license_id": s21.license_id}]


# ── the pipeline ─────────────────────────────────────────────────────────────
def test_firms_in_the_daily_publish_only_one_source_per_satellite():
    assert "nasa.firms" not in pipe.PHASE1 and "nasa.firms.noaa20" not in pipe.PHASE1
    assert pipe.PUBLISH_ONLY == ("celestrak.gp", "nasa.firms", "nasa.firms.noaa20")
    for s in ("nasa.firms", "nasa.firms.noaa20"):
        assert s not in pipe.RUNNERS and s not in pipe.MODES                       # the Core's own fetch, incremental


def test_the_pipeline_runs_each_satellite_on_its_own_and_says_the_one_that_failed(monkeypatch):
    cmds = []

    def sh(cmd, cwd=None, timeout=None, env=None):
        cmds.append(cmd)
        s = cmd[cmd.index("--source") + 1]
        if s == "nasa.firms":           # NOAA-21's file failing: its CLI exits non-zero
            return 1, "", "nexum.core.scheduler.SchedulerError: nasa.firms: HTTP 404 for https://…/J2_VIIRS_C2_Global_24h.csv", 0.1
        return 0, json.dumps({s: {"requests": 1, "new_raw": 1, "not_modified": 0, "deferred": 0}}), "", 0.1
    monkeypatch.setattr(pipe, "sh", sh)
    monkeypatch.setattr(pipe, "_fetch_errors", lambda s, summary: [])
    out = pipe.acquire(("nasa.firms", "nasa.firms.noaa20"))
    assert [c[1:] for c in cmds] == [["-m", "nexum.cli", "live", "fetch", "--source", s, "--mode", "incremental"]
                                     for s in ("nasa.firms", "nasa.firms.noaa20")]
    assert out["nasa.firms"]["status"] == "failed" and "HTTP 404" in out["nasa.firms"]["steps"][0]["error"]
    assert out["nasa.firms.noaa20"]["status"] == "ok"


def test_the_archive_above_one_and_a_half_gib_is_signalled_and_nothing_else():
    att = {"nasa.firms": "failed"}
    assert not pipe.archive_too_big({"archive_bytes": 291_000_000}, att) and att == {"nasa.firms": "failed"}
    assert not pipe.archive_too_big({"archive_bytes": 1536 * 2**20}, att)
    assert pipe.archive_too_big({"archive_bytes": 1700 * 2**20}, att)
    assert att["reference world archive"].startswith("world.tar.xz 1.66 GiB > 1.5 GiB") and att["nasa.firms"] == "failed"
    src = (ROOT / ".github" / "nexum-events" / "pipeline.py").read_text()
    body = src[src.index("def archive_too_big"):src.index("def _xz")]
    assert not any(w in body for w in ("unlink(", "rmtree(", "remove(", "delete", "write_text(", "open("))   # no file is touched
