"""Query.explain — WHY THIS RELATION? (Phase 2, decision D1). Read-only, additive, never invents data:
fields a rule or element does not own are reported as not_recorded / not_applicable."""

import json
import random

import pytest

from nexum.core import confidence as cf
from nexum.core.correlate import FORBIDDEN_WORDS
from nexum.core.db import logical_hash
from nexum.core.query import QueryError
from tests.conftest import eid

FIELDS = ("rule", "rule_version", "candidates", "candidate_groups", "group_support", "representative",
          "representative_reason", "rejected_candidates", "rejection_reasons", "evidence", "independent_sources",
          "confidence", "confidence_factors", "components", "explanation", "limitations")


def myanmar_r2(conn):
    act = eid(conn, "cems", "EMSR798")
    return conn.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND anchor_id=? "
                        "AND status='active'", (act,)).fetchone()[0]


def test_explain_myanmar_r2_grouping(d1_query, d1_conn):
    r = d1_query.explain(myanmar_r2(d1_conn))
    d = r["data"]
    assert all(k in d for k in FIELDS)
    m77, m67 = eid(d1_conn, "usgs", "us7000pn9s"), eid(d1_conn, "usgs", "us7000pn9z")
    assert d["rule"]["id"] == "event_event_association" and d["rule_version"] == "2"
    assert d["rule"]["group"]["link"] == [{"op": "within_time", "max": "72h"}, {"op": "within_distance", "km": 150}]
    assert {c["id"] for c in d["candidates"]["items"]} == {m77, m67} and d["candidates"]["total"] == 2
    assert len(d["candidate_groups"]["items"]) == 1
    assert d["group_support"]["value"] == pytest.approx(0.682, abs=5e-4)
    assert d["group_support"]["support_member"]["id"] == m67
    assert d["representative"]["id"] == m77
    assert "severity desc" in d["representative_reason"]["text"]
    rej = d["rejected_candidates"]["items"]
    assert [x["id"] for x in rej] == [m67]
    assert rej[0]["reason"] == "membro del gruppo scelto, non rappresentante"
    assert d["rejection_reasons"] == [{"reason": "membro del gruppo scelto, non rappresentante", "count": 1}]
    assert d["confidence"]["value"] == pytest.approx(0.682, abs=5e-4)
    assert d["recomputed"]["matches"] is True
    assert d["confidence_factors"]["relation_strength"] == 0.8
    assert "EMSR798" in d["explanation"]["text"] and "3 h 21 min" in d["explanation"]["text"]
    assert d["independent_sources"]["count"] == 3
    assert d["components"] == []
    assert d["provenance_complete"] is True
    assert "Associazione: non indica un rapporto di causa." in d["limitations"]


def test_explain_myanmar_matches_the_stored_grouping(d1_query, d1_conn):
    iid = myanmar_r2(d1_conn)
    stored = json.loads(d1_conn.execute("SELECT grouping_json FROM insight WHERE insight_id=?", (iid,)).fetchone()[0])
    d = d1_query.explain(iid)["data"]
    assert [c["id"] for c in d["candidates"]["items"]] == [c["id"] for c in stored["candidates"]]
    assert d["candidate_groups"]["items"] == stored["groups"]


def test_explain_rules_without_grouping_report_not_recorded(d1_query, d1_conn, d3_query, d3_world):
    r1 = d1_conn.execute("SELECT insight_id FROM insight WHERE rule_id='exposure_context' AND status='active' "
                         "ORDER BY insight_id LIMIT 1").fetchone()[0]
    n1 = d3_world.conn.execute("SELECT insight_id FROM insight WHERE rule_id='independently_supported_temporal_"
                               "association'").fetchone()[0]
    for q, iid in ((d1_query, r1), (d3_query, n1)):
        d = q.explain(iid)["data"]
        for k in ("candidates", "candidate_groups", "group_support", "representative", "representative_reason",
                  "rejected_candidates", "rejection_reasons"):
            assert d[k]["status"] == "not_recorded" and d[k]["reason"], k
        assert d["rule"]["id"] and d["rule"]["group"] is None
        assert d["recomputed"]["matches"] is True
        assert any("non raggruppa" in x for x in d["limitations"])
    d = d3_query.explain(n1)["data"]
    affects = [x for x in d["evidence"]["relation_evidence"] if x["relation"]["type"] == "affects"]
    assert affects and len({i["independence_group"] for i in affects[0]["items"]}) == 3
    grp_a = next(g for g in d["independent_sources"]["groups"] if g["independence_group"] == "grpA")
    assert [x["source_id"] for x in grp_a["not_independent"]] == ["fixture.vuln_catalog_a_mirror"]


def test_explain_canonical_relation(d1_query, d1_conn, d3_query, d3_world):
    for q, conn in ((d1_query, d1_conn), (d3_query, d3_world.conn)):
        for (rid,) in conn.execute("SELECT relation_id FROM relation ORDER BY relation_id LIMIT 10"):
            d = q.explain(rid)["data"]
            assert all(k in d for k in FIELDS)
            for k in ("rule", "rule_version", "candidates", "representative", "rejected_candidates", "components"):
                assert d[k]["status"] == "not_applicable"
            assert d["evidence"] and d["independent_sources"]["count"] >= 1
            assert d["recomputed"]["matches"] is True and d["provenance_complete"] is True
            assert d["explanation"]["origin"] == "generated_from_refs"


def test_explain_composite_lists_components(d1_query, d1_conn):
    iid = d1_conn.execute("SELECT insight_id FROM insight WHERE rule_id='composite_context' AND status='active' "
                          "ORDER BY insight_id LIMIT 1").fetchone()[0]
    d = d1_query.explain(iid)["data"]
    assert d["components"] and all(c["explanation"] for c in d["components"])


def test_explain_rejects_other_kinds(d1_query, d1_conn):
    with pytest.raises(QueryError):
        d1_query.explain(eid(d1_conn, "iso3166a3", "MMR"))
    with pytest.raises(QueryError):
        d1_query.explain("ins_doesnotexist")


def test_explain_text_is_non_causal_and_non_probabilistic(d1_query, d1_conn):
    for (iid,) in d1_conn.execute("SELECT insight_id FROM insight WHERE status='active' ORDER BY insight_id"):
        d = d1_query.explain(iid)["data"]
        low = json.dumps({k: d[k] for k in ("limitations", "rejection_reasons", "representative_reason")},
                         ensure_ascii=False).lower()
        assert not any(w in low for w in FORBIDDEN_WORDS)


def test_explain_is_read_only(d1_query, d1_conn):
    h, v = logical_hash(d1_conn), d1_query._world_version()
    ids = [i for (i,) in d1_conn.execute("SELECT insight_id FROM insight WHERE status='active' ORDER BY insight_id")]
    ids += [i for (i,) in d1_conn.execute("SELECT relation_id FROM relation ORDER BY relation_id LIMIT 800")]
    rnd = random.Random(7)
    for i in range(1000):
        d1_query.explain(rnd.choice(ids))
    assert logical_hash(d1_conn) == h and d1_query._world_version() == v


def test_explain_recompute_parity(d1_query, d1_conn):
    for (iid, fj, c) in d1_conn.execute("SELECT insight_id, factors_json, confidence FROM insight"):
        assert cf.recompute(json.loads(fj)) == pytest.approx(c, abs=1e-9)
