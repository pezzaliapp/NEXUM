"""ISPRA RMN — the 36 tide gauges of Italy's national tide-gauge network (Rete Mareografica Nazionale) as ISPRA's linked
open data describe them (oceanographic network, Phase 1, 2026-10-09).

Licence: CC BY 4.0 ("Il sito ed i dati in esso pubblicati sono rilasciati con licenza Creative Commons Attribution 4.0";
ISPRA legal notes: free to access, distribute and reuse "a patto che sia sempre citata la fonte"). Read with one SPARQL
query (dati.isprambiente.it, JSON results, keyless), at most once a day.

What is read: each platform of the RMN network with its name, position, the operational status ISPRA declares, the
sensors it hosts, and the month of the most recent observation series published as open data. NO measurement is shown:
the open series end in 2023 (checked 2026-10-09: the latest monthly series is October 2023), so the card states the month
of the latest open data and links the platform's own record, instead of presenting values years old as current.
"""

import json
import urllib.parse

from connectors.base import content_version
from connectors.ocean_common import network, num, part_of
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"   # 1.1: the country the source declares (located_in Italy)
QUERY = """PREFIX ispra-top: <https://w3id.org/italia/env/onto/top/>
PREFIX ispra-emf: <https://w3id.org/italia/env/onto/inspire-mf/>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
SELECT ?stat (SAMPLE(?name) AS ?statname) (SAMPLE(?lat) AS ?la) (SAMPLE(?long) AS ?lo) (SAMPLE(?status) AS ?st)
       (GROUP_CONCAT(DISTINCT STR(?sensor); separator=" ") AS ?sensors)
       (MAX(REPLACE(STR(?series), "^.*_", "")) AS ?last)
WHERE {
  ?stat a ispra-emf:Platform ; ispra-top:name ?name ; geo:lat ?lat ; geo:long ?long ;
        ispra-emf:isPlatformOf <https://w3id.org/italia/env/ld/rmn/network> .
  OPTIONAL { ?stat ispra-emf:hasOperationalStatus ?status }
  OPTIONAL { ?sensor ispra-emf:isHostedBy ?stat . OPTIONAL { ?series ispra-emf:isObservationMadeBySensor ?sensor } }
}
GROUP BY ?stat
ORDER BY ?stat"""
URL = "https://dati.isprambiente.it/sparql?" + urllib.parse.urlencode({"query": QUERY, "format": "application/sparql-results+json"})
LICENCE = "CC BY 4.0 — ISPRA, Rete Mareografica Nazionale (citare la fonte)"
SENSORS = {"hydrometer": "livello del mare", "water_thermometer": "temperatura dell'acqua", "air_thermometer": "temperatura dell'aria",
           "anemometer": "vento", "barometer": "pressione atmosferica", "hygrometer": "umidità relativa"}
STATUS = {"operational": "operativa (dichiarato da ISPRA)", "nonoperational": "non operativa (dichiarato da ISPRA)"}
# the country the source declares: "La Rete Mareografica Nazionale (RMN) è composta di 36 stazioni di misura uniformemente
# distribuite sul territorio nazionale ed ubicate prevalentemente all'interno delle strutture portuali"
# (https://dati.isprambiente.it/dataset/rmn/, read 2026-10-09) — not the coarse outline, which leaves out the piers
IN_ITALY = Assertion("relation", "located_in", Target("place.country", scheme="iso3166a2", value="IT"))
MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]


def describe():
    return {"connector_version": VERSION, "produces": ["ocean.tide_gauge", "ocean.network"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "ispra_rmn_platforms.json")]


def next_state(state, request, result, today=None):
    return state


def month_name(yyyymm):
    if not (yyyymm and len(yyyymm) == 6 and yyyymm.isdigit() and 1 <= int(yyyymm[4:]) <= 12):
        return None
    return f"{MONTHS[int(yyyymm[4:]) - 1]} {yyyymm[:4]}"


def parse(data: bytes, meta: dict):
    sid = meta["source_id"]
    try:
        rows = json.loads(data)["results"]["bindings"]
    except (ValueError, KeyError):
        return
    yield network(sid, "ispra_rmn", "RMN — Rete Mareografica Nazionale", "ISPRA", LICENCE, "https://dati.isprambiente.it/dataset/rmn/")
    for i, b in enumerate(rows):
        v = {k: x.get("value") for k, x in b.items()}
        lat, lon = num(v.get("la")), num(v.get("lo"))
        uri = v.get("stat") or ""
        if lat is None or lon is None or not uri:
            continue
        code = uri.rsplit("/", 1)[-1]
        found = []
        for s in (v.get("sensors") or "").split():
            for k, label in SENSORS.items():
                if s.endswith("_" + k) and label not in found:
                    found.append(label)
        month = month_name(v.get("last"))
        note = (f"Ultimi dati aperti pubblicati da ISPRA: {month} (serie mensili). Le misure in tempo reale sono sul sito "
                f"mareografico.it, non distribuite come dati aperti: NEXUM non le mostra." if month else
                "Nessuna serie di dati aperti pubblicata per questa stazione.")
        props = {"platform_kind": "tide_gauge", "operator": "ISPRA",
                 "reporting": STATUS.get((v.get("st") or "").rsplit("/", 1)[-1], "stato non indicato dalla fonte"),
                 "sensors": ", ".join(found) or None, "data_note": note}
        yield NormalizedRecord(
            source_id=sid, native_id=code, native_version=content_version([v, VERSION]), kind="object", type="ocean.tide_gauge",
            label=f"{v.get('statname') or code} — mareografo RMN", identifiers=[("ispra_platform", code)], properties=props,
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=100.0, status="reviewed",
            method="asserted", assertions=[part_of("ispra_rmn"), IN_ITALY], raw_locator=f"$.results.bindings[{i}]")
