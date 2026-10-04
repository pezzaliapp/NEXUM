"""Pick the real cases of the published world for the case test (FASE 8): per event type the element with the most
rule outputs (insights it anchors or belongs to) and one with none; per object type one with outputs (if any) and one
without. Deterministic (ties by id). Writes bench/phase3/cases_live.json."""

import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[2]
c = sqlite3.connect(ROOT / "data/live/nexum.db")
n_ins = """(SELECT COUNT(DISTINCT ev.supports_id) FROM evidence ev JOIN insight i ON i.insight_id=ev.supports_id
             AND i.status='active' WHERE ev.supports_kind='insight' AND ev.support_id={col})"""
cases = []
for kind, table, key in (("event", "event", "event_id"), ("object", "object", "object_id")):
    for (t,) in c.execute(f"SELECT DISTINCT type FROM {table} ORDER BY type"):
        rows = c.execute(f"SELECT {key}, label, {n_ins.format(col=key)} AS n FROM {table} WHERE type=? AND geometry IS NOT NULL "
                         f"ORDER BY n DESC, {key} LIMIT 1", (t,)).fetchall()
        if rows and rows[0][2] > 0:
            cases.append({"id": rows[0][0], "label": rows[0][1], "type": t, "kind": kind, "insights": rows[0][2]})
        z = c.execute(f"SELECT {key}, label FROM {table} WHERE type=? AND geometry IS NOT NULL AND {n_ins.format(col=key)}=0 "
                      f"ORDER BY {key} LIMIT 1", (t,)).fetchone()
        if z:
            cases.append({"id": z[0], "label": z[1], "type": t, "kind": kind, "insights": 0})
for (rid,) in c.execute("SELECT DISTINCT rule_id FROM insight WHERE status='active' AND rule_id IN "
                        "('quake_impact_association','tsunami_quake_association','activation_flood_association') ORDER BY 1"):
    i = c.execute("SELECT insight_id, label FROM insight WHERE rule_id=? AND status='active' ORDER BY confidence DESC, insight_id LIMIT 1",
                  (rid,)).fetchone()
    cases.append({"id": i[0], "label": i[1], "type": rid, "kind": "insight", "insights": 0})
out = ROOT / "bench/phase3/cases_live.json"
out.write_text(json.dumps(cases, indent=1, ensure_ascii=False))
print(len(cases), "cases")
