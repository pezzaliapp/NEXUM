"""PUBLIC REGISTERS published as tables (OSIRIS baseline, 2026-10-04), read on demand by the browser:

  us.ofac_sdn   OFAC Specially Designated Nationals list (US Treasury, public domain): ENTITIES, VESSELS and AIRCRAFT
                only — never individuals (NEXUM does not list persons). GET /tables/sanctions
  us.cisa_kev   CISA Known Exploited Vulnerabilities catalogue (US Government work): the software flaws exploited in
                the wild, with vendor, product, date added and the remediation due date. GET /tables/kev
  ieee.oui      IEEE MA-L registry (public listing of the organisations assigned a MAC address block): prefix →
                organisation, for the vendor lookup of the network tools. GET /tables/oui
  tor.exits     The Tor Project's list of exit relays (public network metadata): is an address a Tor exit? GET /tables/torexits

No record is stored per row: the registers are shown as published, with their date."""

import csv
import io
import json

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URLS = {"us.ofac_sdn": "https://www.treasury.gov/ofac/downloads/sdn.csv",
        "us.cisa_kev": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
        "ieee.oui": "https://standards-oui.ieee.org/oui/oui.csv",
        "tor.exits": "https://check.torproject.org/torbulkexitlist"}
SDN_KIND = {"vessel": "nave", "aircraft": "aeromobile", "": "ente"}


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    return [FetchRequest(URLS[source.id], f"{source.id}.0")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def _v(x):
    x = (x or "").strip()
    return "" if x == "-0-" else x


def table(payloads):
    if not payloads:
        return {"fields": [], "rows": [], "notes": {}}
    key, data, fetched, url = max(payloads, key=lambda p: p[2])
    if "oui" in (url or key):
        rows = []
        for r in csv.reader(io.StringIO(data.decode("utf-8", errors="replace"))):
            if len(r) >= 3 and r[0] == "MA-L":
                rows.append([r[1].upper(), r[2].strip()])
        return {"fields": ["prefix", "organisation"], "rows": sorted(rows), "notes": {"registry": "IEEE MA-L"}}
    if "torbulkexitlist" in (url or key):
        ips = sorted({l.strip() for l in data.decode("ascii", errors="ignore").splitlines() if l.strip() and not l.startswith("#")})
        return {"fields": ["address"], "rows": [[i] for i in ips], "notes": {}}
    if "sdn" in (url or key):
        out = []
        for r in csv.reader(io.StringIO(data.decode("latin-1"))):
            if len(r) < 12:
                continue
            kind = _v(r[2]).lower()
            if kind == "individual":
                continue                                   # persons are never listed
            out.append([int(r[0]) if r[0].strip().isdigit() else r[0], _v(r[1]), SDN_KIND.get(kind, kind), _v(r[3]),
                        _v(r[7]) or None, _v(r[9]) or None, _v(r[11])[:120] or None])
        return {"fields": ["ent_num", "name", "kind", "programs", "vessel_type", "flag", "remarks"], "rows": out,
                "notes": {"filter": "solo enti, navi e aeromobili: le persone fisiche non sono elencate"}}
    d = json.loads(data.decode("utf-8"))
    rows = [[v.get("cveID"), v.get("vendorProject"), v.get("product"), v.get("vulnerabilityName"), v.get("dateAdded"),
             v.get("dueDate"), v.get("knownRansomwareCampaignUse"), (v.get("shortDescription") or "")[:400]]
            for v in d.get("vulnerabilities", [])]
    rows.sort(key=lambda r: r[4] or "", reverse=True)
    return {"fields": ["id", "vendor", "product", "name", "added", "due", "ransomware", "description"], "rows": rows,
            "notes": {"catalog_version": d.get("catalogVersion"), "released": d.get("dateReleased"), "count": d.get("count")}}
