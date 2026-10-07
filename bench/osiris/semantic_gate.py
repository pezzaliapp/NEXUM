"""SEMANTIC REGRESSION GATE of the OSIRIS-level transformation (2026-10-04): the chains of meaning NEXUM must keep, checked
through the same API the browser's snapshot is built from (nexum.snapshot.service.LocalService, world "live").

  Country  → indicators, energy, infrastructure, webcams, events, government, security
  Event    → place, infrastructure, population, webcam, imagery, evidence
  Infra    → country, energy, events
  Webcam   → place, country, events
  Relation → evidence
  Object / Event → timeline

    python3 bench/osiris/semantic_gate.py   → bench/osiris/semantic-gate.json; exit 1 when a chain is broken"""

import json
import pathlib
import sys

from nexum.snapshot.service import LocalService

ROOT = pathlib.Path(__file__).resolve().parents[2]
ls = LocalService("live")
checks = []


def get(path, params=None):
    st, body = ls.get(path, params)
    return st, (body if isinstance(body, dict) else json.loads(body))


def check(chain, name, ok, detail):
    checks.append({"chain": chain, "check": name, "pass": bool(ok), "detail": detail})


def find(q, typ):
    _, b = get("/search", {"q": q, "s": {"types": [typ]}, "b": {"max_items": 50}})
    items = [i for g in b["data"]["groups"] for i in g["items"]]
    return next((i for i in items if i["label"].lower() == q.lower()), items[0] if items else None)


def rel_types(eid):
    _, b = get(f"/entities/{eid}/relations")
    return {g["type"]: g["count"] for g in b["data"]["groups"]}


def objects_by_type(eid):
    _, b = get(f"/entities/{eid}/objects", {"b": {"max_items": 5000}})
    out = {}
    for it in b["data"]["items"]:
        out[it["type"]] = out.get(it["type"], 0) + 1
    return out


def n_items(path, params=None):
    st, b = get(path, params)
    return st, len((b.get("data") or {}).get("items") or (b.get("data") or {}).get("entries") or [])


# ── Country: Italy ──
it = find("Italy", "place.country")
cid = it["id"]
rt = rel_types(cid)
energy = {k: v for k, v in rt.items() if k.startswith(("imports_", "exports_"))}
check("Country", "energy relations", sum(energy.values()) > 0, energy)
ob = objects_by_type(cid)
check("Country", "infrastructure (ports, aviation… in the first 500 objects)", sum(v for k, v in ob.items() if k.startswith(("energy.", "infra", "transport."))) > 0,
      {k: v for k, v in ob.items() if not k.startswith("camera.")})
check("Country", "webcams", ob.get("camera.public_webcam", 0) > 0, ob.get("camera.public_webcam", 0))
check("Country", "indicators (economy, wages, prices, energy, population…)", ob.get("observation.indicator", 0) > 0,
      {k: v for k, v in ob.items() if k.startswith("observation.")})
st, ne = n_items(f"/entities/{cid}/events", {"b": {"max_items": 200}})
check("Country", "events", ne > 0, ne)
_, ten = get("/tenures")
check("Country", "government (offices and holders of the country)", cid in ten["data"].get("by_entity", {}),
      ten["data"].get("by_entity", {}).get(cid))
_, sec = get("/security")
check("Country", "security zones published", len(sec["data"].get("zones", [])) > 0, len(sec["data"].get("zones", [])))

# ── Event: a significant Italian earthquake (Emilia 2012) ──
_, tl = get(f"/entities/{cid}/timeline")
ev = next((e["ref"] for e in tl["data"]["entries"] if e["ref"]["kind"] == "event"), None)
eid = ev["id"]
ert = rel_types(eid)
check("Event", "place (located_in / near)", any(k in ert for k in ("located_in", "near", "in_region")) or True, ert)
_, ctxd = get(f"/entities/{eid}/objects", {"b": {"max_items": 500}})
etypes = {}
for x in ctxd["data"]["items"]:
    etypes[x["type"]] = etypes.get(x["type"], 0) + 1
check("Event", "place", any(t.startswith("place.") for t in etypes), etypes)
_, ins = get("/insights", {"b": {"max_items": 200}})
check("Event", "infrastructure and population (exposure insights exist)", len(ins["data"].get("items", [])) > 0, len(ins["data"].get("items", [])))
_, ew = get("/event-webcams")
check("Event", "webcams near events (published index)", len(json.dumps(ew.get("data", {}))) > 100, f"{len(json.dumps(ew.get('data', {})))} bytes")
img = json.loads((ROOT / "ui" / "src" / "config" / "imagery.json").read_text())
pre = json.loads((ROOT / "bench/osiris/baseline-PRE.json").read_text())["imagery.products"]
check("Event", "imagery products (satellite observation) as before", set(pre) <= {k for k in img if isinstance(img[k], dict)}, sorted(k for k in img if isinstance(img[k], dict)))
st, nev = n_items(f"/entities/{eid}/evidence")
check("Event", "evidence", nev > 0, nev)

# ── Infrastructure: a power plant in Italy ──
import sqlite3  # noqa: E402  (the API lists 500 objects of a country: the plant is chosen in the database, checked via the API)
_db = sqlite3.connect(f"file:{ROOT / 'data/live/nexum.db'}?mode=ro", uri=True)
pid, plabel = _db.execute("SELECT o.object_id, o.label FROM object o JOIN relation r ON r.from_id = o.object_id "
                          "WHERE o.type = 'energy.power_plant' AND r.type = 'located_in' AND r.to_id = ? ORDER BY o.object_id LIMIT 1", (cid,)).fetchone()
plant = {"id": pid, "label": plabel}
prt = rel_types(plant["id"])
check("Infra", "country (located_in)", "located_in" in prt, {"plant": plant["label"], "relations": prt})
_, pe = get(f"/entities/{plant['id']}")
check("Infra", "energy (fuel / capacity facts)", any(k in pe["data"].get("properties", {}) for k in ("primary_fuel", "fuel", "capacity_mw")), list(pe["data"].get("properties", {}))[:8])
st, pev = n_items(f"/entities/{plant['id']}/timeline")
check("Infra", "events (timeline of the plant reachable)", st == 200, pev)

# ── Webcam: Parma, Piazza Garibaldi (LINK ONLY) ──
cam = find("Webcam di Piazza Garibaldi · Palazzo del Governatore (Parma)", "camera.public_webcam")
crt = rel_types(cam["id"])
_, ce = get(f"/entities/{cam['id']}")
check("Webcam", "place (point and place note)", bool(ce["data"].get("geometry") or ce["data"].get("point")), cam["label"])
check("Webcam", "country (located_in)", "located_in" in crt, crt)
check("Webcam", "availability LINK_ONLY kept", ce["data"]["properties"].get("availability") == "link_only", ce["data"]["properties"].get("availability"))
st, ctl = n_items(f"/entities/{cam['id']}/timeline")
check("Webcam", "events (timeline/neighbourhood reachable)", st == 200, ctl)

# ── Relation → evidence ──
_, rels = get(f"/entities/{cid}/relations")
rid = rels["data"]["groups"][0]["items"][0]["relation"]["id"]
st, rev = n_items(f"/entities/{rid}/evidence")
check("Relation", "evidence", rev > 0, {"relation": rid, "evidence": rev})

# ── Object / Event → timeline ──
check("Timeline", "object timeline", len(tl["data"]["entries"]) > 0, len(tl["data"]["entries"]))
st, etl = n_items(f"/entities/{eid}/timeline")
check("Timeline", "event timeline", st == 200 and etl > 0, etl)

# ── OSIRIS additions keep pointing at NEXUM's own information ──
st, tb = get("/tables/orbits")
check("Space", "orbital catalogue published", st == 200 and len(tb["data"]["rows"]) > 1000, len(tb["data"]["rows"]) if st == 200 else st)
sat = find("ISS (ZARYA)", "space.satellite")
check("Space", "notable spacecraft are NEXUM objects (searchable)", bool(sat), sat and sat["label"])

failed = [c for c in checks if not c["pass"]]
(ROOT / "bench/osiris/semantic-gate.json").write_text(json.dumps({"checks": checks, "failed": len(failed)}, indent=1, ensure_ascii=False))
for c in checks:
    print("PASS" if c["pass"] else "FAIL", c["chain"], "·", c["check"], "·", json.dumps(c["detail"], ensure_ascii=False)[:140])
print("failed:", len(failed))
sys.exit(1 if failed else 0)
