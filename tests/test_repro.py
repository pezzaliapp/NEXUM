"""Reproducibility (P6), idempotence (P7), incremental = batch (P8), offline (P5), changes (P39), mixed world (P41)."""

import dataclasses
import json
import pathlib
import shutil

import pytest

from nexum.core import db as dbm
from nexum.worlds import d1, d3, mixed
from nexum.core.db import connect, logical_hash
from nexum.core.pipeline import Nexum, rebuild
from nexum.core.query import Query
from tests.conftest import ROOT, build, d1_copy, eid


def active_insights(conn):
    return sorted(r[0] for r in conn.execute("SELECT insight_id FROM insight WHERE status='active'"))


@pytest.fixture(scope="module")
def d1_rebuilds(tmp_path_factory):
    a = rebuild(d1(), str(tmp_path_factory.mktemp("r1") / "nexum.db"))
    b = rebuild(d1(), str(tmp_path_factory.mktemp("r2") / "nexum.db"))
    yield a, b
    a.close()
    b.close()


def test_p6_two_rebuilds_are_identical(d1_rebuilds):
    a, b = d1_rebuilds
    assert logical_hash(a.conn) == logical_hash(b.conn)
    assert active_insights(a.conn) == active_insights(b.conn)


def test_p7_second_ingestion_adds_nothing(d1_rebuilds):
    a, _ = d1_rebuilds
    before = {t: a.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("record", "object", "event", "relation", "evidence", "claim", "event_participant", "insight")}
    h = logical_hash(a.conn)
    a.conn.execute("DELETE FROM raw_processed")
    a.process()
    after = {t: a.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in before}
    assert after == before
    assert logical_hash(a.conn) == h


def test_p8_incremental_equals_batch(tmp_path, d1_rebuilds):
    batch, _ = d1_rebuilds
    cfg = dataclasses.replace(d1(), db_path=str(tmp_path / "inc.db"))
    nx = Nexum(cfg)
    manifest = sorted(nx.raw.read_manifest(), key=lambda e: (e["fetched_ms"], e["sha256"]))  # arrival order
    for e in manifest:
        nx.conn.execute("INSERT OR IGNORE INTO raw_record VALUES(:raw_id,:source_id,:sha256,:codec,:size,:url,"
                        ":resource_key,:fetched_ms,:http_status,:etag,:last_modified,:content_type,:path)", e)
        nx.process()  # materialize, resolve, enrich and correlate incrementally after each arrival
    assert active_insights(nx.conn) == active_insights(batch.conn)
    nx.close()


def test_p5_offline_queries_and_correlation(tmp_path, no_network):
    db = d1_copy(tmp_path)
    nx = Nexum(dataclasses.replace(d1(), db_path=str(db)))
    before = active_insights(nx.conn)
    nx.correlate(None)
    assert active_insights(nx.conn) == before
    q = Query(nx.conn, nx.sources)
    quake = eid(nx.conn, "usgs", "us7000pn9s")
    for r in (q.context(quake), q.project_map({"viewport": [90, 10, 110, 30], "z": 6}), q.project_timeline({}),
              q.search("Mandalay"), q.neighborhood(quake, 2), q.facets({}), q.provenance_chain(quake)):
        assert r["data"]
    with pytest.raises(Exception):
        nx.fetch(["usgs.earthquakes"], mode="incremental")
    nx.close()


def test_p39_changes_since_matches_real_changes(tmp_path):
    nx = build(d3, tmp_path)
    q = Query(nx.conn, nx.sources)
    v = int(nx.conn.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0])
    # new raw payload: one new exploitation event (arrives later in a real feed)
    data = json.loads((ROOT / "fixtures/d3/data/exploitation_list.json").read_text())
    data["records"].append({"kind": "event", "type": "security.exploitation_listed", "id": "EX-0009", "label": "EX-0009",
                            "identifiers": [["exid", "EX-0009"]], "t_ms": 1_768_003_200_000 + 2 * 86_400_000,
                            "properties": {"list_name": "test"},
                            "assertions": [{"kind": "participation", "type": "subject",
                                            "target": {"type": "security.vulnerability", "scheme": "vulnid",
                                                       "value": "VULN-TEST-0004"}}]})
    blob = json.dumps(data).encode()
    sha, rel = nx.raw.put(blob)
    entry = dict(raw_id="01ZZZZZZZZZZZZZZZZZZZZZZZZ", source_id="fixture.exploitation_list", sha256=sha, codec="gzip",
                 size=len(blob), url="file:///x", resource_key="file:x", fetched_ms=1_900_000_000_000, http_status=200,
                 etag=None, last_modified=None, content_type=None, path=rel)
    nx.conn.execute("INSERT INTO raw_record VALUES(:raw_id,:source_id,:sha256,:codec,:size,:url,:resource_key,"
                    ":fetched_ms,:http_status,:etag,:last_modified,:content_type,:path)", entry)
    nx.process()
    got = {i["ref"]["id"] for i in q.changes_since(v, budget={"max_items": 5000})["data"]["items"]}
    real = set()
    for table, key in (("object", "object_id"), ("event", "event_id"), ("relation", "relation_id"),
                       ("insight", "insight_id")):
        real |= {r[0] for r in nx.conn.execute(f"SELECT {key} FROM {table} WHERE world_version>?", (v,))}
    assert real and got == real
    assert eid(nx.conn, "exid", "EX-0009") in got
    nx.close()


def test_p41_mixed_world_equals_separate_worlds(d1_conn, d3_world):
    db = ROOT / "data" / "mixed" / "nexum.db"
    assert db.exists(), "mixed world missing: run `python3 bench/run_phase1.py --build`"
    m = connect(str(db))
    for sep in (d1_conn, d3_world.conn):
        rules = {r[0] for r in sep.execute("SELECT DISTINCT rule_id FROM insight")}
        for rule in rules:
            a = sorted((r[0], round(r[1], 9)) for r in sep.execute(
                "SELECT insight_id, confidence FROM insight WHERE status='active' AND rule_id=?", (rule,)))
            b = sorted((r[0], round(r[1], 9)) for r in m.execute(
                "SELECT insight_id, confidence FROM insight WHERE status='active' AND rule_id=?", (rule,)))
            assert a == b, rule
    q = Query(m)
    assert q.search("VULN-TEST-0001")["total"] >= 1 and q.search("Mandalay")["total"] >= 1
    m.close()
