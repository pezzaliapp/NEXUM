"""USGS VERIFY (2026-10-30), on a loopback server — never USGS itself. A preliminary solution of another agency that
USGS later DELETED (PTWC pt26297050/pt26298050, "M 7.0 Bonin Islands" told twice) or MERGED into its own event
(pt26293000 → us6000u3jl, Vanuatu) left the 7-day feed and stayed preliminary in the world for ever: shown twice in
"Cosa sta succedendo". The pipeline now asks those ids again one by one (FDSN eventid, includedeleted=true) through the
Core's own fetch; the source's answer withdraws them (status retracted, a status: no row is deleted, so no count goes
down); "what is happening" never lists a withdrawn event; a withdrawn event never comes back unseen; two USGS events of
the same instant and place stop the publish. The Core is not changed (W1)."""

import dataclasses
import http.server
import json
import threading
import urllib.parse

import pytest

from connectors import usgs_earthquakes as ue
from nexum.api import server as api
from nexum.core.pipeline import Config, Nexum
from nexum.core.query import Query
from nexum.core.scheduler import SchedulerError
from tests.conftest import ROOT
from tests.test_firms import pipe

DAY, H = 86_400_000, 3_600_000
NOW = 1_793_340_000_000          # 2026-10-30T07:20Z


def feature(fid, t, mag, lon, lat, status="reviewed", net=None, ids=None, updated=None, place="Bonin Islands, Japan region"):
    return {"type": "Feature", "id": fid,
            "properties": {"mag": mag, "place": place, "time": t, "updated": updated or t + H, "status": status,
                           "tsunami": 0, "sig": 700, "net": net or fid[:2], "code": fid[2:], "type": "earthquake",
                           "ids": ids or f",{fid},", "magType": "Mi" if (net or fid[:2]) == "pt" else "mww",
                           "title": f"M {mag} - {place}", "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{fid}"},
            "geometry": {"type": "Point", "coordinates": [lon, lat, 470.0]}}


def coll(*fs):
    return {"type": "FeatureCollection", "features": list(fs)}


T_BONIN = NOW - 6 * DAY             # the PTWC solutions: a day too early, deleted by USGS
T_REAL = T_BONIN + DAY + 23_818     # us6000u4r9, M 6.5, the earthquake itself
T_VAN = NOW - 10 * DAY
PT1 = feature("pt26297050", T_BONIN, 7.0, 139.9, 28.0, status="automatic")
PT2 = feature("pt26298050", T_BONIN, 7.0, 139.9, 28.0, status="automatic")
REAL = feature("us6000u4r9", T_REAL, 6.5, 139.95, 27.9)
PTV = feature("pt26293000", T_VAN, 6.6, 166.6, -14.1, status="automatic", place="195 km NW of Port-Olry, Vanuatu")
USV = feature("us6000u3jl", T_VAN + 9_000, 6.3, 166.5, -14.0, place="197 km NW of Port-Olry, Vanuatu",
              ids=",attn6uqd,us6000u3jl,usauto6000u3jl,attn6uqj,pt26293000,", updated=T_VAN + 3 * DAY)


def deleted(f):
    """As USGS answers a deleted event: status deleted, no place, a title without it ("M 7.0 - ")."""
    g = json.loads(json.dumps(f))
    g["properties"].update(status="deleted", updated=f["properties"]["updated"] + 2 * DAY, place=None,
                           title=f"M {f['properties']['mag']:.1f} - ", sig=0)
    return g


class Handler(http.server.BaseHTTPRequestHandler):
    feed, events, log = {}, {}, []

    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        Handler.log.append({"path": u.path, "q": q, "ua": self.headers.get("User-Agent")})
        if u.path == "/feed":
            body = Handler.feed
        elif u.path == "/fdsn" and "eventid" in q and q["eventid"][0] in Handler.events:
            assert q.get("includedeleted") == ["true"]
            body = Handler.events[q["eventid"][0]]
        else:
            self.send_response(404 if u.path != "/fdsn" or "eventid" in q else 204)
            self.end_headers()
            return
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    Handler.feed, Handler.events, Handler.log = coll(), {}, []
    yield srv
    srv.shutdown()


class Clock:
    def __init__(self):
        self.t = NOW / 1000

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += max(0.0, s)


@pytest.fixture
def world(tmp_path, server, monkeypatch):
    host = f"127.0.0.1:{server.server_port}"
    monkeypatch.setattr(ue, "FEED", f"http://{host}/feed")
    monkeypatch.setattr(ue, "FDSN", f"http://{host}/fdsn")
    src = tmp_path / "sources"
    src.mkdir()
    (src / "usgs.earthquakes.toml").write_text((ROOT / "sources" / "usgs.earthquakes.toml").read_text())
    cfg = Config(str(ROOT), str(tmp_path / "w" / "nexum.db"), str(tmp_path / "w" / "raw"), [str(src)], ["vocab_live"], [])
    clock = Clock()
    nx = Nexum(cfg, clock=clock, sleep=clock.sleep)
    nx.sources[ue_id()] = dataclasses.replace(nx.sources[ue_id()], allowed_hosts=[host])

    def run():
        """One update: the ids to verify written from the world, the Core's fetch (incremental), processing."""
        asked = pipe.usgs_verify_seed(cfg.db_path, NOW)
        clock.t += 3600
        try:
            summary = nx.fetch([ue_id()], mode="incremental")[ue_id()]
        except SchedulerError as e:         # as the pipeline sees it: the CLI fails, the raws already stored stay
            summary = {"raised": str(e)}
        nx.process()
        return asked, summary

    def ev(fid):
        return nx.conn.execute("SELECT e.* FROM event e JOIN identifier i ON i.entity_id = e.event_id "
                               "WHERE i.scheme='usgs' AND i.value=? AND i.strong=1", (fid,)).fetchone()

    def highlights():
        return api.highlights_of(Query(nx.conn, nx.sources))["data"]

    yield dataclasses.make_dataclass("W", ["nx", "db", "run", "ev", "highlights"])(nx, cfg.db_path, run, ev, highlights)
    nx.close()


def ue_id():
    return "usgs.earthquakes"


def fp(w):
    return pipe.fingerprint(w.db)


# ── the connector alone ──────────────────────────────────────────────────────
def test_plan_asks_each_id_once_only_plain_ids_at_most_50():
    st = {"verify": ["pt26297050", "pt26297050", "x y", "../etc", 7, "pt26298050"] + [f"us{i:08d}" for i in range(60)]}
    reqs = ue.plan("incremental", st, None)
    assert reqs[0].resource_key == "feed:4.5_week"
    keys = [r.resource_key for r in reqs[1:]]
    assert keys[:2] == ["verify:pt26297050", "verify:pt26298050"] and len(keys) == ue.VERIFY_MAX
    assert all(r.force and "includedeleted=true" in r.url and "eventid=" in r.url for r in reqs[1:])
    assert ue.plan("incremental", {}, None) == reqs[:1]                     # nothing to verify: the feed alone


def test_next_state_drops_the_id_asked_and_keeps_the_rest():
    st = ue.next_state({"verify": ["a1", "b2"], "windows_done": ["x"]}, ue.FetchRequest("u", "verify:a1"), None)
    assert st == {"verify": ["b2"], "windows_done": ["x"]}


def test_parse_deleted_merged_and_existing():
    meta = lambda i: {"source_id": "usgs.earthquakes", "url": f"{ue.FDSN}?eventid={i}&format=geojson&includedeleted=true"}
    [d] = list(ue.parse(json.dumps(deleted(PT1)).encode(), meta("pt26297050")))
    assert (d.native_id, d.status, d.quality_flags) == ("pt26297050", "retracted", ["deleted_by_source"])
    assert d.label == "M 7.0 · cancellato dalla fonte"
    raw = deleted(PT1)
    raw["properties"]["mag"] = 7                             # as USGS writes it for a deleted event: an integer
    [d] = list(ue.parse(json.dumps(raw).encode(), meta("pt26297050")))
    assert d.label == "M 7.0 · cancellato dalla fonte"
    raw["properties"]["mag"] = None
    [d] = list(ue.parse(json.dumps(raw).encode(), meta("pt26297050")))
    assert d.label == "Terremoto cancellato dalla fonte"
    us, pt = list(ue.parse(json.dumps(USV).encode(), meta("pt26293000")))
    assert (us.native_id, us.status) == ("us6000u3jl", "reviewed")
    assert (pt.native_id, pt.status, pt.identifiers) == ("pt26293000", "retracted", [("usgs", "pt26293000")])
    assert pt.quality_flags == ["merged_into:us6000u3jl"] and pt.raw_locator == "$"
    assert us.label == "M 6.3 - 197 km NW of Port-Olry, Vanuatu"
    assert pt.label == "M 6.3 - 197 km NW of Port-Olry, Vanuatu · unito dalla fonte a us6000u3jl"
    [r] = list(ue.parse(json.dumps(REAL).encode(), meta("us6000u4r9")))   # still there: its own revision
    assert (r.native_id, r.status) == ("us6000u4r9", "reviewed")


def test_parse_of_a_collection_is_unchanged():
    recs = list(ue.parse(json.dumps(coll(PT1, USV)).encode(), {"source_id": "usgs.earthquakes", "url": ue.FEED}))
    assert [(r.native_id, r.status, r.raw_locator, r.quality_flags) for r in recs] == [
        ("pt26297050", "preliminary", "$.features[0]", []), ("us6000u3jl", "reviewed", "$.features[1]", [])]


# ── the whole update, through the Core ───────────────────────────────────────
def test_deleted_and_merged_events_are_withdrawn_and_leave_what_is_happening(world):
    Handler.feed = coll(PT1, PT2, PTV, USV)
    asked, _ = world.run()
    assert asked == []                                      # first sight: nothing preliminary in the world yet
    with pytest.raises(pipe.Stop) as e:                     # the Bonin earthquake told twice: no publish
        pipe.duplicate_check(world.db, NOW)
    assert e.value.code == 10
    labels = [r["label"] for r in world.highlights()["recent"]]
    assert labels.count("M 7.0 - Bonin Islands, Japan region") == 2
    before = fp(world)

    # USGS deletes the two PTWC solutions, merges the third, publishes the real earthquake
    Handler.feed = coll(REAL, USV)
    Handler.events = {"pt26297050": deleted(PT1), "pt26298050": deleted(PT2), "pt26293000": USV}
    asked, summary = world.run()
    assert asked == ["pt26293000", "pt26297050", "pt26298050"]                  # oldest first
    assert summary["requests"] == 4 and summary["new_raw"] == 4
    assert all(x["ua"] and "NEXUM" in x["ua"] for x in Handler.log)
    for fid in ("pt26297050", "pt26298050", "pt26293000"):
        assert world.ev(fid)["status"] == "retracted"
    assert world.ev("us6000u3jl")["status"] == world.ev("us6000u4r9")["status"] == "reviewed"
    after = fp(world)
    assert pipe.checks(world.db, before, after, (ue_id(),)) == []              # withdrawn: no loss, no failure
    assert after["counts"]["event"] == before["counts"]["event"] + 1           # the real earthquake added, none deleted
    assert sorted(set(after["retracted"]) - set(before["retracted"])) == sorted(
        world.ev(i)["event_id"] for i in ("pt26297050", "pt26298050", "pt26293000"))
    assert pipe.duplicate_check(world.db, NOW) == {"groups": []}
    h = world.highlights()
    shown = [r["label"] for r in h["recent"] + h["strongest"]]
    assert "M 7.0 - Bonin Islands, Japan region" not in shown and "M 6.6 - 195 km NW of Port-Olry, Vanuatu" not in shown
    assert "M 6.5 - Bonin Islands, Japan region" in shown and "M 6.3 - 197 km NW of Port-Olry, Vanuatu" in shown
    assert {d["type"]: d["n"] for d in h["domains"]}["seismic.earthquake"] == 2
    why = {w["event"]: w["flags"] for w in pipe.withdrawn(world.db, sorted(set(after["retracted"]) - set(before["retracted"])))}
    assert why[world.ev("pt26293000")["event_id"]] == ["merged_into:us6000u3jl"]
    assert why[world.ev("pt26297050")["event_id"]] == ["deleted_by_source"]

    # next run: nothing preliminary left, nothing asked again
    asked, summary = world.run()
    assert asked == [] and summary["requests"] == 1


def test_a_withdrawn_event_that_comes_back_stops_the_run(world):
    Handler.feed = coll(PT1)
    world.run()
    Handler.feed, Handler.events = coll(), {"pt26297050": deleted(PT1)}
    world.run()
    before = fp(world)
    assert world.ev("pt26297050")["status"] == "retracted"
    back = json.loads(json.dumps(PT1))                       # a newer version of the deleted id, active again
    back["properties"]["updated"] = PT1["properties"]["updated"] + 5 * DAY
    Handler.feed = coll(back)
    world.run()
    bad = pipe.checks(world.db, before, fp(world), (ue_id(),))
    assert len(bad) == 1 and "withdrawn by their source are active again" in bad[0]


def test_a_real_loss_is_still_a_failure(world):
    Handler.feed = coll(REAL, USV)
    world.run()
    before = fp(world)
    world.nx.conn.execute("DELETE FROM event WHERE event_id=?", (world.ev("us6000u3jl")["event_id"],))
    bad = pipe.checks(world.db, before, fp(world), (ue_id(),))
    assert any("(a loss)" in b for b in bad)


def test_an_id_usgs_does_not_know_is_asked_twice_then_said_unverifiable_and_never_blocks_the_others(world):
    Handler.feed = coll(PT1, PT2)
    world.run()
    Handler.feed, Handler.events = coll(), {"pt26298050": deleted(PT2)}   # pt26297050 → 404, asked first
    for _ in range(2):
        asked, summary = world.run()
        assert asked == ["pt26297050", "pt26298050"] and "HTTP 404" in summary["raised"]
    assert world.ev("pt26297050")["status"] == world.ev("pt26298050")["status"] == "preliminary"
    with pipe.ro(world.db) as c:
        assert pipe.usgs_unverifiable(c) == ["pt26297050"]
    asked, summary = world.run()                          # the unknown id is no longer asked: the other one is
    assert asked == ["pt26298050"] and "raised" not in summary
    assert world.ev("pt26298050")["status"] == "retracted" and world.ev("pt26297050")["status"] == "preliminary"


def test_only_preliminary_events_older_than_6_hours_and_newer_than_90_days_are_asked(world):
    Handler.feed = coll(feature("pt1", NOW - 2 * H, 6.0, 1, 1, status="automatic"),
                        feature("pt2", NOW - 91 * DAY, 6.0, 2, 2, status="automatic"),
                        feature("pt3", NOW - 7 * H, 6.0, 3, 3, status="automatic"),
                        feature("us4", NOW - 3 * DAY, 6.0, 4, 4))
    world.run()
    assert pipe.usgs_verify_seed(world.db, NOW) == ["pt3"]
