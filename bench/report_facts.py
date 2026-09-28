"""Collect the facts for the Phase 1 final report from the built worlds → data/reports/facts.json."""

import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from nexum.core.db import connect  # noqa: E402
from nexum.core.query import Query  # noqa: E402
from nexum.core.registry import load_registry  # noqa: E402


def counts(c):
    out = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
           for t in ("raw_record", "record", "object", "event", "relation", "event_participant", "evidence", "claim",
                     "identifier", "edge")}
    out["insight_active"] = c.execute("SELECT COUNT(*) FROM insight WHERE status='active'").fetchone()[0]
    out["insight_by_rule"] = {r[0]: r[1] for r in c.execute(
        "SELECT rule_id || ' v' || rule_version, COUNT(*) FROM insight WHERE status='active' GROUP BY 1")}
    out["objects_by_type"] = {r[0]: r[1] for r in c.execute("SELECT type, COUNT(*) FROM object GROUP BY 1")}
    out["events_by_type"] = {r[0]: r[1] for r in c.execute("SELECT type, COUNT(*) FROM event GROUP BY 1")}
    out["relations_by_type"] = {r[0]: r[1] for r in c.execute("SELECT type, COUNT(*) FROM relation GROUP BY 1")}
    out["pending_assertions"] = c.execute("SELECT COUNT(*) FROM pending_assertion").fetchone()[0]
    out["with_geometry"] = c.execute("SELECT (SELECT COUNT(*) FROM object WHERE geometry IS NOT NULL) + "
                                     "(SELECT COUNT(*) FROM event WHERE geometry IS NOT NULL)").fetchone()[0]
    return out


def eid(c, scheme, value):
    return c.execute("SELECT entity_id FROM identifier WHERE scheme=? AND value=? ORDER BY strong DESC",
                     (scheme, value)).fetchone()[0]


def main():
    facts = {}
    c1 = connect("data/d1/nexum.db")
    q1 = Query(c1, load_registry([ROOT / "sources"]))
    facts["d1"] = counts(c1)
    act, quake = eid(c1, "cems", "EMSR798"), eid(c1, "usgs", "us7000pn9s")
    r2 = c1.execute("SELECT insight_id FROM insight WHERE rule_id='event_event_association' AND status='active' AND "
                    "anchor_id=?", (act,)).fetchone()[0]
    comp = c1.execute("SELECT supports_id FROM evidence WHERE support_id=? AND supports_kind='insight'", (r2,)).fetchone()[0]
    my = {"r2": q1.get_insight(r2)["data"], "composite": q1.get_insight(comp)["data"],
          "provenance_r2": q1.provenance_chain(r2)["data"], "sources": q1.sources_of(comp)["data"]["items"],
          "quake": q1.get_entity(quake)["data"], "activation": q1.get_entity(act)["data"],
          "grouping": json.loads(c1.execute("SELECT grouping_json FROM insight WHERE insight_id=?", (r2,)).fetchone()[0])}
    r1 = [m for m in my["composite"]["members"] if m["role"] == "I1"][0]["ref"]["id"]
    my["r1"] = q1.get_insight(r1)["data"]
    raws = set()
    for ent in (quake, act):
        for e in q1.evidence_of(ent)["data"]["items"]:
            if e["support"]["kind"] == "record":
                raws.add((e["support"]["source_id"], e["support"]["raw_id"], e["support"]["locator"], e["support"]["raw_url"]))
    my["raw_records"] = sorted(raws)
    facts["myanmar"] = my
    c3 = connect("data/d3/nexum.db")
    q3 = Query(c3, load_registry([ROOT / "fixtures/d3/sources"]))
    facts["d3"] = counts(c3)
    n1 = c3.execute("SELECT insight_id FROM insight WHERE rule_id='independently_supported_temporal_association' "
                    "AND status='active'").fetchone()[0]
    n2 = c3.execute("SELECT insight_id FROM insight WHERE rule_id='shared_neighbor_exposure' AND status='active'").fetchone()[0]
    facts["d3_insights"] = {"n1": q3.get_insight(n1)["data"], "n1_provenance": q3.provenance_chain(n1)["data"],
                            "n2": q3.get_insight(n2)["data"]}
    v1 = eid(c3, "vulnid", "VULN-TEST-0001")
    lib = eid(c3, "swid", "SW-TEST-lib")
    rel = c3.execute("SELECT relation_id FROM relation WHERE from_id=? AND to_id=?", (v1, lib)).fetchone()[0]
    facts["d3_relation_evidence"] = q3.evidence_of(rel)["data"]
    c3s = connect("data/d3s/nexum.db")
    facts["d3s"] = counts(c3s)
    c2 = connect("data/d2/nexum.db")
    facts["d2"] = counts(c2)
    (ROOT / "data/reports/facts.json").write_text(json.dumps(facts, indent=1, ensure_ascii=False, default=str))
    print("ok")


if __name__ == "__main__":
    main()
