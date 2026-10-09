"""NOAA CO-OPS — the water-level stations of NOAA's National Ocean Service (Center for Operational Oceanographic
Products and Services) with the country their catalogue declares, and the latest sea level each measured
(oceanographic network, Phase 1, 2026-10-09).

Licence: "The information on government servers are in the public domain, unless specifically annotated otherwise, and
may be used freely by the public"; "NOS requests that attribution be given whenever NOS material is reproduced and
re-disseminated" (https://tidesandcurrents.noaa.gov/disclaimers.html). Access, keyless: the station catalogue of the
metadata API (stations.json?type=waterlevels) and, for every station, its water level of the last hour from the data API
(range=1, metric, datum MLLW, application=NEXUM as the API asks), one request at a time with a pause between them (the
API's own advice: CO-OPS throttles heavy load), at most once an hour per station.

No duplicate: a station NDBC also lists is the same NEXUM object — NDBC's catalogue names its NOS stations with their
CO-OPS number, read there as the identifier "coops" (connectors/ndbc.py). The country is the one the catalogue declares
for the station ("state": a US state or DC → the United States; a US territory or another country by its own code),
never the outline. The latest values are the published table "ocean_coops"."""

import datetime as dt
import json
import re

from connectors.base import content_version
from connectors.ocean_common import fields, num, params_note, part_of
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
STATIONS = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels"
LEVEL = ("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?range=1&station={}&product=water_level&datum={}"
         "&units=metric&time_zone=gmt&format=json&application=NEXUM")
# the reference of the level, from the catalogue: a tidal station → MLLW; a Great Lakes station → IGLD; any other station
# (non-tidal, outside the Great Lakes: the API offers no common reference, some no data at all) → not requested
DATUM_NAME = {"MLLW": "rispetto alla media delle basse maree inferiori (MLLW) della stazione", "IGLD": "rispetto al riferimento dei Grandi Laghi (IGLD 1985)"}
PARAMS = ["sea_level_m"]
US_STATES = {"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
             "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
             "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"}
# the catalogue's "state" when it is not a US state: a territory or another country, by its own ISO 3166 code
OTHER = {"PR": "PR", "VI": "VI", "GU": "GU", "AS": "AS", "MP": "MP", "United States of America": "US",
         "American Samoa": "AS", "Puerto Rico": "PR", "Guam": "GU", "Bermuda": "BM"}
QUALITY = {"p": "dato preliminare (non ancora verificato dalla fonte)", "v": "dato verificato dalla fonte"}
FLAGS = ["valore stimato", "valore piatto oltre la tolleranza", "variazione oltre la soglia", "oltre il massimo o il minimo atteso"]


def describe():
    return {"connector_version": VERSION, "produces": ["ocean.tide_gauge"]}


def plan(mode, state, source, today=None):
    """The catalogue, then each station's last hour (the stations of the catalogue read last, kept in the state)."""
    return [FetchRequest(STATIONS, "coops_stations.json")] + [
        FetchRequest(LEVEL.format(x[0], x[1]), f"coops_wl_{x[0]}_{x[1]}.json") for x in (state or {}).get("stations", [])
        if isinstance(x, list) and len(x) == 2]


def datum_of(s):
    return "MLLW" if s.get("tidal") else "IGLD" if s.get("greatlakes") else None


def page_info(data):
    """The catalogue → [[station, reference of its level]] for the stations whose level is read."""
    try:
        sts = json.loads(data).get("stations", [])
        return {"stations": sorted([str(s["id"]), datum_of(s)] for s in sts if s.get("id") and datum_of(s))}
    except (ValueError, AttributeError, TypeError):
        return None


def next_state(state, request, result, today=None):
    if result and result.get("stations"):
        return {**(state or {}), "stations": result["stations"]}
    return state


def country(state_field):
    s = (state_field or "").strip()
    return "US" if s in US_STATES else OTHER.get(s)


def parse(data: bytes, meta: dict):
    try:
        d = json.loads(data)
    except ValueError:
        return
    if "stations" not in d:
        return                                   # a station's water level: published as a table only (see table())
    sid = meta["source_id"]
    for i, s in enumerate(d["stations"]):
        lat, lon = num(s.get("lat")), num(s.get("lng"))
        code = str(s.get("id") or "").strip()
        if lat is None or lon is None or not code:
            continue
        st = (s.get("state") or "").strip()
        name = (s.get("name") or code).strip()
        assertions = [part_of("nos")]
        iso = country(st)
        if iso:
            assertions.append(Assertion("relation", "located_in", Target("place.country", scheme="iso3166a2", value=iso)))
        yield NormalizedRecord(
            source_id=sid, native_id=code, native_version=content_version({k: s.get(k) for k in ("id", "name", "lat", "lng", "state")}),
            kind="object", type="ocean.tide_gauge", label=f"{code} - {name}, {st}" if len(st) == 2 else f"{code} - {name}",
            identifiers=[("coops", code)], properties={"platform_kind": "tide_gauge", "operator": "NOAA National Ocean Service (CO-OPS)"},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=100.0, status="reviewed",
            method="asserted", assertions=assertions, raw_locator=f"$.stations[{i}]")


def quality(p):
    q = QUALITY.get((p.get("q") or "").strip(), "")
    flags = [FLAGS[k] for k, f in enumerate((p.get("f") or "").split(",")[:4]) if f.strip() == "1"]
    return " · ".join([x for x in [q] if x] + ([f"indicatori della fonte: {', '.join(flags)}"] if flags else []))


def table(payloads):
    """The published table "ocean_coops": the latest water level of each station (metres above MLLW)."""
    out = []
    for key, data, _f, _u in sorted(payloads):
        if not re.fullmatch(r"coops_wl_\d+_(MLLW|IGLD)\.json", key):
            continue
        try:
            d = json.loads(data)
        except ValueError:
            continue
        pts = [p for p in d.get("data") or [] if num(p.get("v")) is not None and p.get("t")]
        md = d.get("metadata") or {}
        if not pts or not md.get("id"):
            continue
        p = pts[-1]
        when = dt.datetime.strptime(p["t"], "%Y-%m-%d %H:%M").strftime("%Y-%m-%dT%H:%MZ")
        datum = key.rsplit("_", 1)[-1].split(".")[0]
        ref = f"livello in metri {DATUM_NAME[datum]}" if datum in DATUM_NAME else ""
        out.append(["coops", str(md["id"]), when, num(md.get("lon"), digits=4), num(md.get("lat"), digits=4), num(p["v"], digits=3),
                    " · ".join(x for x in (ref, quality(p)) if x)])
    return {"fields": fields(PARAMS), "rows": out,
            "notes": {"params": params_note(PARAMS), "source": "NOAA CO-OPS Tides & Currents — livello dell'acqua, ultima ora (dati ogni 6 minuti)",
                      "quality": "q: p preliminare, v verificato; indicatori: stimato, piatto, variazione, massimo/minimo",
                      "not_read": "stazioni né di marea né dei Grandi Laghi: livello non richiesto (nessun riferimento comune offerto dalla fonte)"}}
