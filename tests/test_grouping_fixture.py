"""Anti-overfitting fixture for candidate grouping (frozen before implementation, commit 1d52690)."""

import hashlib
import json

import pytest

from tests.conftest import ROOT, build, grouping

EXPECTED = json.loads((ROOT / "fixtures/r2_grouping/expected.json").read_text())
FROZEN = {"fixtures/r2_grouping/expected.json": "a73bf0c892dd2b887979154cdb7dc8b4fe45a9b7dac68a46e48cfbae153914f8",
          "fixtures/r2_grouping/data/grouping.json": "0ca69d7f1152798de321ae1d9222f5a69dc66e7bc915d035a13386fdbbe06303"}


def test_fixture_is_unchanged_since_freeze():
    for path, sha in FROZEN.items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == sha, path


def results(tmp_path, variant):
    nx = build(grouping, tmp_path, rules_dir=f"fixtures/r2_grouping/{variant}")
    c = nx.conn
    out = {}
    for i in c.execute("SELECT * FROM insight WHERE status='active'"):
        trig = c.execute("SELECT label FROM event WHERE event_id=?", (i["anchor_id"],)).fetchone()[0]
        rep = c.execute("SELECT e.label FROM evidence v JOIN event e ON e.event_id=v.support_id WHERE v.supports_id=? "
                        "AND v.role='A'", (i["insight_id"],)).fetchone()[0]
        g = json.loads(i["grouping_json"]) if i["grouping_json"] else None
        lab = lambda x: c.execute("SELECT label FROM event WHERE event_id=?", (x,)).fetchone()[0]  # noqa: E731
        out[trig] = {"rep": rep, "g": g, "group": sorted(lab(m) for m in g["groups"][g["chosen_group"]]["members"]) if g else None,
                     "support_member": lab(g["support_member"]) if g else None, "geo_used": i["lon"] is not None}
    nx.close()
    return out


def test_variant_d_matches_frozen_expectations(tmp_path):
    got = results(tmp_path, "rules")
    for trig, e in EXPECTED["expected_D_grouping"].items():
        g = got[trig]
        assert g["rep"] == e["representative"], trig
        assert g["group"] == e["group"], trig
        assert g["support_member"] == e["support_member"], trig
        assert len(g["g"]["groups"]) - 1 == e["discarded_groups"], trig
        # grouping provenance is complete
        for key in ("candidates", "groups", "criteria", "support_method", "representative_order", "discarded",
                    "rule_id", "rule_version", "support", "representative"):
            assert key in g["g"], key
    assert got["ALERT-D"]["geo_used"] is False


@pytest.mark.parametrize("variant,key", [("rules_b_max_severity", "expected_B_max_severity"),
                                         ("rules_v1_score_only", "expected_v1_score_only")])
def test_comparators_fail_as_predicted(tmp_path, variant, key):
    got = results(tmp_path, variant)
    wrong = 0
    for trig, e in EXPECTED[key].items():
        if e.get("insight", True):
            assert got[trig]["rep"] == e["representative"], trig
        else:
            assert trig not in got, trig
        wrong += 0 if e["correct"] else 1
    assert wrong >= 3  # D is strictly better on the frozen scenarios
