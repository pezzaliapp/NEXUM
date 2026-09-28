"""Evaluate rule R2 on the frozen golden set (tests/golden/r2_golden_set.json)."""

import json
import sqlite3
import sys

GOLDEN = "tests/golden/r2_golden_set.json"


def evaluate(db_path, rule_id="event_event_association"):
    g = json.load(open(GOLDEN, encoding="utf-8"))
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row

    def ev_by_ident(scheme, value):
        r = c.execute("SELECT entity_id FROM identifier WHERE scheme=? AND value=?", (scheme, value)).fetchone()
        return r[0] if r else None

    def match(code):
        act = ev_by_ident("cems", code)
        r = c.execute("SELECT insight_id, rule_version FROM insight WHERE rule_id=? AND status='active' AND anchor_id=?",
                      (rule_id, act)).fetchone()
        if not r:
            return None, None
        a = c.execute("SELECT support_id FROM evidence WHERE supports_id=? AND role='A'", (r[0],)).fetchone()[0]
        usgs = c.execute("SELECT value FROM identifier WHERE entity_id=? AND scheme='usgs'", (a,)).fetchone()[0]
        return usgs, r[1]
    tp = fp = fn = 0
    errors, versions = [], set()
    for p in g["positives"]:
        got, v = match(p["activation"])
        versions.add(v)
        if got == p["expected_event"]["usgs_id"]:
            tp += 1
        elif got:
            fp += 1
            fn += 1
            errors.append(f"{p['activation']}: abbinato {got}, atteso {p['expected_event']['usgs_id']} "
                          f"(M{p['expected_event']['magnitude']})")
        else:
            fn += 1
            errors.append(f"{p['activation']}: nessun abbinamento, atteso {p['expected_event']['usgs_id']} "
                          f"(M{p['expected_event']['magnitude']})")
    for n in g["must_not_match_activations"]:
        got, _ = match(n["activation"])
        if got:
            fp += 1
            errors.append(f"{n['activation']}: falso positivo ({got})")
    neg_hits = 0
    for n in g["negative_events"]:
        e = ev_by_ident("usgs", n["usgs_id"])
        if c.execute("SELECT 1 FROM evidence v JOIN insight i ON i.insight_id=v.supports_id WHERE i.rule_id=? AND "
                     "i.status='active' AND v.support_id=? AND v.role='A'", (rule_id, e)).fetchone():
            neg_hits += 1
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / len(g["positives"])
    return {"TP": tp, "FP": fp, "FN": fn, "precision": prec, "recall": rec, "negatives_with_insight": neg_hits,
            "errors": errors, "rule_versions": sorted(x for x in versions if x)}


if __name__ == "__main__":
    print(json.dumps(evaluate(sys.argv[1] if len(sys.argv) > 1 else "data/d1/nexum.db"), indent=1, ensure_ascii=False))
