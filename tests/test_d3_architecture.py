"""Test 2 — non-geographic world (P27, P36, P37, P38, P40, P31/P32 for D3). Synthetic data only."""

import json

from tests.conftest import eid

EXPECTED = {
    "independently_supported_temporal_association": {"VULN-TEST-0001"},
    "shared_neighbor_exposure": {"SW-TEST-lib"},
    "organization_context": {"ORG-ALPHA", "ORG-BETA", "ORG-GAMMA"},
}


def labels(conn, ids):
    return {conn.execute("SELECT label FROM object WHERE object_id=? UNION SELECT label FROM event WHERE event_id=?",
                         (i, i)).fetchone()[0] for i in ids}


def active(conn, rule):
    return conn.execute("SELECT * FROM insight WHERE rule_id=? AND status='active'", (rule,)).fetchall()


def test_p27_expected_insights_and_negatives(d3_world):
    c = d3_world.conn
    n1 = active(c, "independently_supported_temporal_association")
    assert len(n1) == 1
    subjects = {r[0] for r in c.execute("SELECT support_id FROM evidence WHERE supports_id=? AND role='V'", (n1[0]["insight_id"],))}
    assert labels(c, subjects) == EXPECTED["independently_supported_temporal_association"]
    n2 = active(c, "shared_neighbor_exposure")
    assert len(n2) == 1
    s = {r[0] for r in c.execute("SELECT support_id FROM evidence WHERE supports_id=? AND role='S'", (n2[0]["insight_id"],))}
    assert labels(c, s) == EXPECTED["shared_neighbor_exposure"]
    n3 = active(c, "organization_context")
    assert labels(c, [r["anchor_id"] for r in n3]) == EXPECTED["organization_context"]
    # negatives: V2 (45 days), V3 (single independent group), V4 (no exploitation) never produce N1
    for v in ("VULN-TEST-0002", "VULN-TEST-0003", "VULN-TEST-0004"):
        vid = eid(c, "vulnid", v)
        assert not c.execute("SELECT 1 FROM evidence e JOIN insight i ON i.insight_id=e.supports_id WHERE "
                             "i.rule_id='independently_supported_temporal_association' AND e.support_id=?", (vid,)).fetchone()


def test_p27_world_has_no_geometry(d3_world):
    c = d3_world.conn
    assert c.execute("SELECT COUNT(*) FROM object WHERE geometry IS NOT NULL").fetchone()[0] == 0
    assert c.execute("SELECT COUNT(*) FROM event WHERE geometry IS NOT NULL").fetchone()[0] == 0
    assert c.execute("SELECT COUNT(*) FROM object_rtree").fetchone()[0] == 0
    assert c.execute("SELECT COUNT(*) FROM insight WHERE lon IS NOT NULL").fetchone()[0] == 0


def test_p36_mirror_is_not_an_independent_source(d3_world):
    c = d3_world.conn
    v3, core = eid(c, "vulnid", "VULN-TEST-0003"), eid(c, "swid", "SW-TEST-core")
    r = c.execute("SELECT evidence_count, independent_groups FROM relation WHERE from_id=? AND to_id=?", (v3, core)).fetchone()
    assert r[0] == 2 and r[1] == 1
    v1, lib = eid(c, "vulnid", "VULN-TEST-0001"), eid(c, "swid", "SW-TEST-lib")
    r = c.execute("SELECT evidence_count, independent_groups FROM relation WHERE from_id=? AND to_id=?", (v1, lib)).fetchone()
    assert r[1] == 3  # catalog A, catalog B, advisory (event evidence)


def test_merge_is_proposed_not_applied(d3_world):
    c = d3_world.conn
    assert c.execute("SELECT COUNT(*) FROM merge_candidate WHERE status='proposed'").fetchone()[0] == 1
    assert c.execute("SELECT COUNT(*) FROM object WHERE type='software.package'").fetchone()[0] == 4


def test_p37_object_mode_without_geography(d3_query, d3_world):
    v1 = eid(d3_world.conn, "vulnid", "VULN-TEST-0001")
    ctx = d3_query.context(v1)["data"]
    assert ctx["geography"] == {"not_applicable": "this element has no geometry"}
    for sec in ("sources", "relations", "related_objects", "related_events", "timeline", "insights"):
        body = ctx[sec]
        assert (body if isinstance(body, list) else (body.get("items") or body.get("groups") or body.get("entries"))), sec
    assert ctx["evidence"]["total"] >= 1


def test_p38_spatial_operations_are_not_applicable_not_errors(d3_query, d3_world):
    v1 = eid(d3_world.conn, "vulnid", "VULN-TEST-0001")
    assert d3_query.nearby(v1, 100)["data"]["not_applicable"]
    assert d3_query.containing(v1)["data"]["not_applicable"]
    m = d3_query.project_map({"viewport": [-180, -90, 180, 90], "z": 2})
    total = d3_world.conn.execute("SELECT (SELECT COUNT(*) FROM object)+(SELECT COUNT(*) FROM event)+"
                                  "(SELECT COUNT(*) FROM insight WHERE status='active')").fetchone()[0]
    assert m["total"] == 0 and m["excluded"]["no_geometry"] == total
    assert d3_query.locate(v1)["data"]["map"] == "not_applicable"


def test_p31_p32_d3_pivot_chain_and_evidence(d3_query, d3_world):
    c = d3_world.conn
    v1, lib = eid(c, "vulnid", "VULN-TEST-0001"), eid(c, "swid", "SW-TEST-lib")
    px, alpha = eid(c, "prodid", "PRODUCT-X"), eid(c, "orgid", "ORG-ALPHA")
    rel = c.execute("SELECT relation_id FROM relation WHERE from_id=? AND to_id=? AND type='affects'", (v1, lib)).fetchone()[0]
    steps = [v1, rel, lib, px, alpha]
    for s in steps:
        ctx = d3_query.context(s)["data"]
        assert ctx["focus"]["id"] == s
    ev = d3_query.evidence_of(rel)["data"]
    assert ev["independent_sources"] == 3
    assert any(e["label"] == "ADV-0001" for e in ev["supporting_events"])
    assert all(i["support"].get("raw_sha256") for i in ev["items"] if i["support"]["kind"] == "record")
    ctx_alpha = d3_query.context(alpha)["data"]
    assert any("ORG-ALPHA" in i["explanation"] for i in ctx_alpha["insights"]["items"])


def test_p40_connection_adds_information(d3_world):
    """At least one insight combines facts that no single fixture source contains."""
    c = d3_world.conn
    found = False
    for i in c.execute("SELECT insight_id FROM insight WHERE status='active'"):
        srcs = set()
        for sk, sid in c.execute("SELECT support_kind, support_id FROM evidence WHERE supports_id=?", (i[0],)):
            srcs |= {r[0] for r in c.execute("SELECT DISTINCT source_id FROM evidence WHERE supports_id=? AND "
                                             "source_id IS NOT NULL", (sid,))}
        if len(srcs) >= 2:
            found = True
    assert found


def test_d3_explanations_are_non_causal(d3_world):
    from nexum.core.correlate import explanation_is_clean
    for (e,) in d3_world.conn.execute("SELECT explanation FROM insight"):
        assert explanation_is_clean(e), e
