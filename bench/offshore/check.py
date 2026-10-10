"""NEXUM OFFSHORE, Phase 1 Adriatic — mandatory checks 1 and 2 on the LIVE world (2026-10-10):

  1. what the world holds equals the official lists (the CSV the same UNMIG pages publish: an independent file);
  2. zero invented relations: every relation touching an offshore element is one of the five declared types, asserted by a
     UNMIG record, with the endpoints a column of the source names; no other relation, enrichment or rule output.

    python3 bench/offshore/check.py [CSV directory, default fixtures/offshore]  → data/reports/offshore/check.json; exit 1
    when a check fails. The CSV must be of the same edition as the world's files (the check says which it read)."""

import csv
import io
import json
import pathlib
import re
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from connectors.unmig import FLAGS, name_key, link_names   # noqa: E402

CSV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "fixtures" / "offshore"
DB = ROOT / "data" / "live" / "nexum.db"
TYPES = ("energy.offshore_platform", "energy.hc_well", "energy.hc_centrale", "energy.hc_concession", "org.company")
RELS = {"on_platform", "delivers_to", "in_concession", "operated_by", "scheme_link"}
checks = []


def check(name, ok, detail):
    checks.append({"check": name, "pass": bool(ok), "detail": detail})


def rows(name, enc):
    return list(csv.DictReader(io.StringIO((CSV / name).read_text(encoding=enc)), delimiter=";"))


def col(row, name):
    return next(v for k, v in row.items() if k and k.replace("\xa0", " ").strip() == name)


def f6(s):
    return round(float(s.replace(",", ".")), 6)


c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
c.row_factory = sqlite3.Row
obj = {}
for t in TYPES:
    obj[t] = {r["object_id"]: r for r in c.execute("SELECT * FROM object WHERE type=? AND merged_into IS NULL", (t,))}
ident = {}
for r in c.execute("SELECT scheme, value, entity_id FROM identifier WHERE scheme LIKE 'unmig_%'"):
    ident[(r["scheme"], r["value"])] = r["entity_id"]
by_scheme = lambda s: {v: e for (sc, v), e in ident.items() if sc == s}   # noqa: E731

# ── 1. parity with the official CSV ──
P = [r for r in rows("piattaforme.csv", "latin-1") if r["Zona"] in ("ZA", "ZB")]
pid = by_scheme("unmig_platform")
bad = []
for r in P:
    e = pid.get(r["Id"])
    o = obj["energy.offshore_platform"].get(e)
    if o is None:
        bad.append(f"{r['Id']} missing")
        continue
    p = json.loads(o["props_json"])
    flags = [f for f in FLAGS if r[f].strip() == "Sì"]
    exp = [o["label"] == r["Nome struttura"].strip(), (round(o["lon"], 6), round(o["lat"], 6)) == (f6(r["Longitudine"]), f6(r["Latitudine"])),
           p.get("operator") == r["Operatore"].strip(), (p.get("concession") or "") == r["Concessione di coltivazione"].strip(),
           (p.get("centrale") or "-") == (r["Centrale"].strip() or "-"), p.get("year_installed") == int(r["Anno di installazione"]),
           p.get("unmig_flags") == (" · ".join(flags) if flags else "nessuna"), p.get("structure") == r["Tipo struttura"].strip(),
           bool(p.get("data_ref")) and "Dati rielaborati da NEXUM – elaborazione non ufficiale" in p.get("source_line", "")]
    if not all(exp):
        bad.append(f"{r['Id']} {r['Nome struttura']}: {exp}")
check("platforms = official CSV (zones ZA, ZB)", not bad and len(obj["energy.offshore_platform"]) == len(P),
      {"csv": len(P), "world": len(obj["energy.offshore_platform"]), "differences": bad[:20]})

W = [r for r in rows("pozzi-idrocarburi.csv", "latin-1") if r["Ub"].strip() == "M" and r["Pr"].strip() in ("ZA", "ZB")]
wid = by_scheme("unmig_well")
bad = []
for r in W:
    o = obj["energy.hc_well"].get(wid.get(r["Id"].strip()))
    if o is None:
        bad.append(f"{r['Id']} missing")
        continue
    p = json.loads(o["props_json"])
    if not (o["label"] == r["Nome pozzo"].strip() and p.get("status_code") == r["Stato"].strip() and p.get("platform") == r["Piattaforma"].strip()
            and o["lon"] is None and p.get("data_ref")):
        bad.append(r["Id"])
check("offshore wells = official CSV (Ub M, Pr ZA/ZB)", not bad and len(obj["energy.hc_well"]) == len(W),
      {"csv": len(W), "world": len(obj["energy.hc_well"]), "differences": bad[:20]})

C = rows("centrali-idrocarburi.csv", "latin-1")
cid = by_scheme("unmig_centrale")
bad = [r["Id"] for r in C if (o := obj["energy.hc_centrale"].get(cid.get(r["Id"]))) is None or o["label"] != r["Nome centrale"].strip()
       or (round(o["lon"], 6), round(o["lat"], 6)) != (f6(r["Longitudine"]), f6(col(r, "Latitudine")))]
check("plants = official CSV (national list)", not bad and len(obj["energy.hc_centrale"]) == len(C),
      {"csv": len(C), "world": len(obj["energy.hc_centrale"]), "differences": bad[:20]})

T = [r for r in rows("titoli-idrocarburi.csv", "utf-8-sig") if r["tipo"] == "Concessione di coltivazione" and r["ubic"] == "Mare"
     and re.search(r"\bZona [AB]\b", r["zona"])]
tid = by_scheme("unmig_title")
bad = [r["id"] for r in T if (o := obj["energy.hc_concession"].get(tid.get(r["id"]))) is None or o["label"] != r["titolo"].strip()
       or json.loads(o["props_json"]).get("holders") != r["titolari"]]
check("concessions = official CSV (production, at sea, zones A/B)", not bad and len(obj["energy.hc_concession"]) == len(T),
      {"csv": len(T), "world": len(obj["energy.hc_concession"]), "differences": bad[:20]})

ops = sorted({r["Operatore"].strip() for r in P})
check("operators = the platforms list's 'Operatore' values", sorted(o["label"] for o in obj["org.company"].values()) == ops,
      {"csv": ops, "world": sorted(o["label"] for o in obj["org.company"].values())})

# ── 2. zero invented relations ──
ours = set().union(*[set(v) for v in obj.values()])
rels = [r for r in c.execute("SELECT * FROM relation") if r["from_id"] in ours or r["to_id"] in ours]
other = [(r["type"], r["derivation"]) for r in rels if r["type"] not in RELS or r["derivation"] != "asserted"]
check("only the five declared relation types, all asserted", not other, {"relations": len(rels), "other": other[:20]})

ev_bad = []
for r in rels:
    ev = c.execute("SELECT e.source_id, e.method, e.distance_m, e.support_kind FROM evidence e WHERE e.supports_kind='relation' "
                   "AND e.supports_id=?", (r["relation_id"],)).fetchall()
    if not ev or any(e["source_id"] != "mase.unmig" or e["support_kind"] != "record" or e["distance_m"] is not None or e["method"] != "asserted" for e in ev):
        ev_bad.append(r["relation_id"])
check("every relation's evidence: a UNMIG record, method asserted, no distance", not ev_bad, {"bad": ev_bad[:20]})

label = {e: o["label"] for v in obj.values() for e, o in v.items()}
pairs = {}
for r in rels:
    pairs.setdefault(r["type"], set()).add((label.get(r["from_id"]), label.get(r["to_id"])))
pn = {name_key(r["Nome struttura"]): r["Nome struttura"].strip() for r in rows("piattaforme.csv", "latin-1")}
cn = {name_key(r["Nome centrale"]): r["Nome centrale"].strip() for r in C}
expect = {
    "on_platform": {(r["Nome pozzo"].strip(), r["Piattaforma"].strip()) for r in W if r["Piattaforma"].strip()},
    "delivers_to": {(r["Nome struttura"].strip(), (cn.get(name_key(r["Centrale"])) or pn.get(name_key(r["Centrale"]))))
                    for r in P if r["Centrale"].strip() not in ("", "-") and (name_key(r["Centrale"]) in cn or name_key(r["Centrale"]) in pn)},
    "in_concession": {(r["Nome struttura"].strip(), r["Concessione di coltivazione"].strip()) for r in P
                      if r["Concessione di coltivazione"].strip() in {t["titolo"].strip() for t in T}},
    "operated_by": {(r["Nome struttura"].strip(), r["Operatore"].strip()) for r in P},
}
kml = (CSV / "collegamenti.kml").read_text(encoding="utf-8")
adr = {name_key(r["Nome struttura"]) for r in P}
links = set()
for n in re.findall(r"<name>(Collegamento .*?)</name>", kml):
    pr = link_names(n)
    if pr and name_key(pr[0]) in adr and (name_key(pr[1]) in adr or name_key(pr[1]) in cn):
        links.add((pn[name_key(pr[0])], pn.get(name_key(pr[1])) or cn[name_key(pr[1])]))
expect["scheme_link"] = links
for t, exp in expect.items():
    got = pairs.get(t, set())
    check(f"{t}: exactly the pairs the source declares", got == exp,
          {"world": len(got), "declared_and_resolvable": len(exp), "extra": sorted(got - exp)[:10], "missing": sorted(exp - got)[:10]})

ins = c.execute(f"SELECT COUNT(*) FROM evidence WHERE support_id IN ({','.join('?' * len(ours))}) AND supports_kind='insight'",
                tuple(ours)).fetchone()[0]
check("no rule output (insight) uses an offshore element", ins == 0, {"insight_evidence": ins})
pend = c.execute("SELECT assertion_json FROM pending_assertion WHERE source_id='mase.unmig'").fetchall()
check("unresolved assertions are kept apart, never applied (declared, not an error)", True,
      {"unresolved": len(pend), "examples": sorted({json.dumps(json.loads(p[0]).get("target") or json.loads(p[0]).get("obj"), ensure_ascii=False)
                                                    for p in pend})[:8]})

out = ROOT / "data" / "reports" / "offshore" / "check.json"
out.parent.mkdir(parents=True, exist_ok=True)
report = {"csv_dir": str(CSV.relative_to(ROOT)) if CSV.is_relative_to(ROOT) else CSV.name, "pass": all(x["pass"] for x in checks), "checks": checks}
out.write_text(json.dumps(report, ensure_ascii=False, indent=1))
for x in checks:
    print(("PASS " if x["pass"] else "FAIL ") + x["check"], json.dumps(x["detail"], ensure_ascii=False)[:300])
sys.exit(0 if report["pass"] else 1)
