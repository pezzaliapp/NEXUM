"""D1 — real-world validation (USGS + OurAirports + Natural Earth + Copernicus EMS). Real data only."""

import datetime as dt
import json
import urllib.parse

import pytest

from bench.eval_r2 import evaluate
from nexum.core import confidence as cf
from nexum.core.correlate import FORBIDDEN_WORDS
from nexum.core.geo import haversine_km
from nexum.core.registry import admissible, verification_age_days
from tests.conftest import D1_DB, eid

REAL = ("usgs.earthquakes", "ourairports.airports", "naturalearth.admin0", "cems.rapid_mapping")


# ── P1, P2: cost and registry ────────────────────────────────────────────────
def test_p1_no_keys_accounts_or_cards(d1_sources):
    for sid in REAL:
        s = d1_sources[sid]
        assert s.auth == "none" and s.verdict == "adopt"


def test_p2_registry_valid_and_recently_verified(d1_sources):
    for sid in REAL:
        ok, why = admissible(d1_sources[sid])
        assert ok, why
        assert verification_age_days(d1_sources[sid], dt.date(2026, 9, 28)) <= 30


# ── P3, P4: network politeness, from the real fetch log ──────────────────────
def test_p3_allowlist_user_agent_and_rate(d1_conn, d1_sources):
    rows = d1_conn.execute("SELECT * FROM fetch_log ORDER BY requested_ms").fetchall()
    assert rows
    last_by_host = {}
    for r in rows:
        s = d1_sources[r["source_id"]]
        host = urllib.parse.urlsplit(r["url"]).netloc
        assert host in s.allowed_hosts, r["url"]
        assert r["user_agent"].startswith("NEXUM/")
        if host in last_by_host:
            gap = (r["requested_ms"] - last_by_host[host]) / 1000.0
            assert gap >= 1.0 / s.max_rps - 0.05, (host, gap)
        last_by_host[host] = r["requested_ms"]


def test_p4_conditional_requests_when_supported(d1_conn):
    rows = d1_conn.execute("SELECT * FROM fetch_log ORDER BY requested_ms").fetchall()
    seen_etag = set()
    violations = 0
    conditional = 0
    for r in rows:
        key = (r["source_id"], r["resource_key"])
        if key in seen_etag and not r["conditional"]:
            violations += 1
        conditional += r["conditional"]
        raw = d1_conn.execute("SELECT etag, last_modified FROM raw_record WHERE raw_id=?", (r["raw_id"],)).fetchone() \
            if r["raw_id"] else None
        if raw and (raw["etag"] or raw["last_modified"]):
            seen_etag.add(key)
    assert violations == 0
    assert conditional >= 1  # the incremental round really used conditional requests


# ── P9, P10, P22: provenance, insight fields, licences ───────────────────────
def test_p9_every_statement_reaches_raw_and_licence(d1_conn):
    c = d1_conn
    for kind, table, key in (("object", "object", "object_id"), ("event", "event", "event_id"),
                             ("relation", "relation", "relation_id")):
        missing = c.execute(f"SELECT COUNT(*) FROM {table} t WHERE NOT EXISTS (SELECT 1 FROM evidence e "
                            f"WHERE e.supports_id=t.{key})").fetchone()[0]
        assert missing == 0, kind
    assert c.execute("SELECT COUNT(*) FROM evidence e WHERE e.support_kind='record' AND NOT EXISTS "
                     "(SELECT 1 FROM record r JOIN raw_record w ON w.raw_id=r.raw_id JOIN source s ON "
                     "s.source_id=w.source_id WHERE r.record_id=e.support_id AND s.license_id IS NOT NULL)").fetchone()[0] == 0
    assert c.execute("SELECT COUNT(*) FROM claim c WHERE NOT EXISTS (SELECT 1 FROM record r JOIN raw_record w "
                     "ON w.raw_id=r.raw_id WHERE r.record_id=c.record_id)").fetchone()[0] == 0
    parts = c.execute("SELECT COUNT(*) FROM event_participant").fetchone()[0]
    assert c.execute("SELECT COUNT(DISTINCT supports_id) FROM evidence WHERE supports_kind='participation'"
                     ).fetchone()[0] == parts


def test_p9_every_insight_chain_is_complete(d1_query, d1_conn):
    for (iid,) in d1_conn.execute("SELECT insight_id FROM insight WHERE status='active'"):
        assert d1_query.provenance_chain(iid)["data"]["complete"], iid


def test_p10_insight_required_fields(d1_conn):
    for i in d1_conn.execute("SELECT * FROM insight WHERE status='active'"):
        assert i["rule_id"] and i["rule_version"] and i["explanation"] and i["confidence"] is not None
        assert i["factors_json"] and i["t_start_ms"] is not None
        members = d1_conn.execute("SELECT * FROM evidence WHERE supports_id=?", (i["insight_id"],)).fetchall()
        assert len(members) >= 2
        if i["rule_id"] in ("event_event_association", "exposure_context"):
            assert any(m["distance_m"] is not None for m in members)


def test_p22_licences_and_attributions(d1_conn, d1_sources):
    from nexum.core.query import attributions
    assert d1_conn.execute("SELECT COUNT(*) FROM evidence WHERE support_kind='record' AND source_id IS NULL"
                           ).fetchone()[0] == 0
    used = {r[0] for r in d1_conn.execute("SELECT DISTINCT source_id FROM evidence WHERE source_id IS NOT NULL")}
    att = attributions(d1_conn, d1_sources)
    assert {a["source_id"] for a in att} == used and all(a["attribution"] and a["license_id"] for a in att)


# ── P11, P35: language and confidence ────────────────────────────────────────
def test_p11_p35_language_is_non_causal_and_non_probabilistic(d1_conn):
    for (e, ct) in d1_conn.execute("SELECT explanation, confidence_text FROM insight"):
        low = (e + " " + ct).lower()
        assert not any(w in low for w in FORBIDDEN_WORDS), e


def test_p35_confidence_recomputable(d1_conn):
    for table, key in (("object", "object_id"), ("event", "event_id"), ("relation", "relation_id"),
                       ("insight", "insight_id")):
        n = 0
        for v, f in d1_conn.execute(f"SELECT confidence, factors_json FROM {table}"):
            assert f is not None
            assert abs(cf.recompute(json.loads(f)) - v) < 1e-9
            n += 1
        assert n > 0
    for v, f in d1_conn.execute("SELECT confidence, factors_json FROM event_participant"):
        assert abs(cf.recompute(json.loads(f)) - v) < 1e-9


# ── P12–P16: identity, resolution, geometry ──────────────────────────────────
def test_p12_no_duplicate_events(d1_conn):
    assert d1_conn.execute("SELECT COUNT(*) FROM (SELECT value FROM identifier WHERE scheme='usgs' AND strong=1 "
                           "GROUP BY value HAVING COUNT(DISTINCT entity_id) > 1)").fetchone()[0] == 0
    assert d1_conn.execute("SELECT COUNT(*) FROM event WHERE type='seismic.earthquake'").fetchone()[0] == \
        d1_conn.execute("SELECT COUNT(DISTINCT native_id) FROM record WHERE source_id='usgs.earthquakes'").fetchone()[0]


def test_p13_airport_country_resolution(d1_conn):
    with_code = d1_conn.execute("SELECT COUNT(*) FROM object WHERE type='transport.airport' AND "
                                "json_extract(props_json,'$.iso_country') IS NOT NULL").fetchone()[0]
    resolved = d1_conn.execute("SELECT COUNT(DISTINCT r.from_id) FROM relation r JOIN evidence e ON "
                               "e.supports_id=r.relation_id AND e.role='asserts' WHERE r.type='located_in'").fetchone()[0]
    assert resolved / with_code >= 0.995, resolved / with_code


def test_p14_containment_agrees_with_asserted_country(d1_conn):
    q = ("SELECT o.object_id, (SELECT group_concat(to_id) FROM relation r WHERE r.from_id=o.object_id AND "
         "r.derivation IN ('asserted','asserted+computed')) AS a, (SELECT group_concat(to_id) FROM relation r "
         "WHERE r.from_id=o.object_id AND r.derivation IN ('computed','asserted+computed')) AS c FROM object o "
         "WHERE o.type='transport.airport' AND json_extract(o.props_json,'$.airport_type') IN "
         "('large_airport','medium_airport')")
    both = agree = 0
    for _, a, c in d1_conn.execute(q):
        if a and c:
            both += 1
            agree += int(bool(set(a.split(",")) & set(c.split(","))))
    assert both > 3000 and agree / both >= 0.98, agree / both


def test_p15_country_names_resolved(d1_conn):
    names = sum(len(json.loads(r[0])["countries"]) for r in d1_conn.execute(
        "SELECT props_json FROM event WHERE type='emergency.mapping_activation'"))
    unresolved = d1_conn.execute("SELECT COUNT(*) FROM pending_assertion WHERE "
                                 "json_extract(assertion_json,'$.kind')='participation'").fetchone()[0]
    assert (names - unresolved) / names >= 0.98


def test_p15_resolution_sample_has_no_errors(d1_conn):
    """Every distinct (name → entity) pair is an exact normalized alias of the resolved entity (≥50 pairs)."""
    from nexum.core.world import norm_name
    pairs = set()
    for ev, props in d1_conn.execute("SELECT event_id, props_json FROM event WHERE type='emergency.mapping_activation'"):
        objs = [r[0] for r in d1_conn.execute("SELECT object_id FROM event_participant WHERE event_id=? AND "
                                              "role='affected_area'", (ev,))]
        for name in json.loads(props)["countries"]:
            for o in objs:
                labels = {norm_name(r[0]) for r in d1_conn.execute("SELECT alias FROM alias WHERE entity_id=?", (o,))}
                labels.add(norm_name(d1_conn.execute("SELECT label FROM object WHERE object_id=?", (o,)).fetchone()[0]))
                if norm_name(name) in labels:
                    pairs.add((name, o))
    assert len(pairs) >= 50
    names_with_pair = {n for n, _ in pairs}
    resolved_names = {n for ev_props in d1_conn.execute("SELECT props_json FROM event WHERE "
                                                        "type='emergency.mapping_activation'")
                      for n in json.loads(ev_props[0])["countries"]} - {"United States Minor Outlying Islands"}
    assert resolved_names <= names_with_pair


# ── P17–P20: golden set and the Myanmar example ──────────────────────────────
def test_p17_p18_p19_golden_set():
    r = evaluate(str(D1_DB))
    assert r["rule_versions"] == ["2"]
    assert r["recall"] >= 0.90 and r["precision"] >= 0.95 and r["negatives_with_insight"] <= 1, r


def test_p20_myanmar_composite_with_vymd(d1_conn, d1_query):
    act = eid(d1_conn, "cems", "EMSR798")
    quake = eid(d1_conn, "usgs", "us7000pn9s")
    vymd = eid(d1_conn, "icao", "VYMD")
    r2 = d1_conn.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND status='active' "
                         "AND anchor_id=?", (act,)).fetchone()[0]
    assert d1_conn.execute("SELECT support_id FROM evidence WHERE supports_id=? AND role='A'", (r2,)).fetchone()[0] == quake
    comp = d1_conn.execute("SELECT i.insight_id FROM insight i JOIN evidence e ON e.supports_id=i.insight_id WHERE "
                           "i.rule_id='composite_context' AND i.status='active' AND e.support_id=?", (r2,)).fetchone()
    assert comp
    r1 = d1_conn.execute("SELECT support_id FROM evidence WHERE supports_id=? AND role='I1'", (comp[0],)).fetchone()[0]
    first = d1_conn.execute("SELECT support_id, distance_m FROM evidence WHERE supports_id=? AND role='O#000'", (r1,)).fetchone()
    assert first[0] == vymd and abs(first[1] / 1000 - 34.6) < 1.0
    ins = d1_query.get_insight(r2)["data"]
    assert "44,8 km" in ins["explanation"] and "3 h 21 min" in ins["explanation"]
    n_airports = d1_conn.execute("SELECT COUNT(*) FROM evidence WHERE supports_id=? AND role LIKE 'O#%'", (r1,)).fetchone()[0]
    assert n_airports == 5


def test_r1_equals_independent_brute_force(d1_conn):
    air = [(r[0], r[1], r[2], r[3]) for r in d1_conn.execute(
        "SELECT object_id, lon, lat, confidence FROM object WHERE type='transport.airport' AND "
        "json_extract(props_json,'$.airport_type') IN ('large_airport','medium_airport') AND "
        "json_extract(props_json,'$.scheduled_service')=1")]
    exp = {}
    for eid_, lon, lat, props, qc in d1_conn.execute("SELECT event_id, lon, lat, props_json, confidence FROM event WHERE "
                                                     "type='seismic.earthquake' AND json_extract(props_json,'$.magnitude')>=5.5"):
        m = json.loads(props)["magnitude"]
        r = 300 if m >= 7.5 else (200 if m >= 6.5 else 100)
        best = None
        for aid, a, b, ac in air:
            if abs(lat - b) <= r / 111 + 0.1:
                d = haversine_km(lon, lat, a, b)
                if d <= r and (best is None or (d, aid) < best[:2]):
                    best = (d, aid, ac)
        if best:
            s = 0.6 * min(qc, best[2]) * (1 - best[0] / r)
            if s >= 0.3:
                exp[eid_] = s
    got = {r[0]: r[1] for r in d1_conn.execute("SELECT anchor_id, confidence FROM insight WHERE "
                                                "rule_id='exposure_context' AND status='active'")}
    assert set(exp) == set(got) and max(abs(exp[k] - got[k]) for k in exp) < 1e-9


# ── Italy validation area ────────────────────────────────────────────────────
def test_italy_validation(d1_conn):
    italy = eid(d1_conn, "iso3166a3", "ITA")
    airports = d1_conn.execute("SELECT COUNT(*) FROM object WHERE type='transport.airport' AND "
                               "json_extract(props_json,'$.iso_country')='IT'").fetchone()[0]
    inside = d1_conn.execute("SELECT COUNT(DISTINCT from_id) FROM relation WHERE type='located_in' AND to_id=? AND "
                             "derivation='asserted+computed'", (italy,)).fetchone()[0]
    assert inside / airports >= 0.95
    quakes_it = d1_conn.execute("SELECT COUNT(*) FROM event_participant WHERE object_id=? AND role='location'",
                                (italy,)).fetchone()[0]
    assert quakes_it >= 5
    acts_it = d1_conn.execute("SELECT COUNT(*) FROM event_participant WHERE object_id=? AND role='affected_area'",
                              (italy,)).fetchone()[0]
    assert acts_it >= 10
