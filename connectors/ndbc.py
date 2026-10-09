"""NOAA NDBC — the ACTIVE STATIONS of the National Data Buoy Center owned by NOAA itself (NDBC, NOS, NOS PORTS) and
their latest observations (oceanographic network, Phase 1, 2026-10-09).

Licence: NOAA / National Weather Service data, "public domain, unless specifically noted otherwise"; no endorsement
implied, no NOAA/NWS logo; NDBC asks to keep retrievals minimal (at most once an hour). About 60% of the stations NDBC
distributes belong to partners (universities, regional systems, other countries) whose terms are NOT verified: they are
left out — only the owners named below, as the catalogue itself names them, are read.

Files (both plain, keyless): activestations.xml (the catalogue of active stations: id, name, position, owner, programme,
type) → the platform objects; latest_obs/latest_obs.txt (whitespace-delimited columns, units in the second header line,
"MM" = missing) → the published table of the latest observations, joined with the catalogue so that only the stations of
the owners below appear.
"""

import datetime as dt
import re
import xml.etree.ElementTree as ET

from connectors.base import content_version
from connectors.ocean_common import FOOT_M, fields, network, num, params_note, part_of
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.2.0"   # 1.1: the CO-OPS number of a NOS station as its identifier "coops"; 1.2: tide gauges are ocean.tide_gauge
CATALOGUE = "https://www.ndbc.noaa.gov/activestations.xml"
LATEST = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
# owner (as the catalogue names it) → network key, label, operator — the only owners whose terms are verified
OWNERS = {
    "NDBC": ("ndbc", "NDBC — National Data Buoy Center", "NOAA National Weather Service"),
    "NOS": ("nos", "NOS — National Ocean Service (CO-OPS)", "NOAA National Ocean Service"),
    "NOAA NOS PORTS": ("nos_ports", "NOS PORTS — Physical Oceanographic Real-Time System", "NOAA National Ocean Service"),
}
LICENCE = "Dati NOAA, pubblico dominio salvo diversa indicazione (nessuna approvazione implicita)"
PARAMS = ["water_temp_c", "sea_level_m", "wave_height_m", "wave_period_dominant_s", "wave_period_avg_s", "wave_dir_deg",
          "wind_speed_ms", "wind_gust_ms", "wind_dir_deg", "pressure_hpa", "air_temp_c"]
# NDBC column → parameter, scale to the parameter's unit
COLUMNS = {"WTMP": ("water_temp_c", 1.0), "TIDE": ("sea_level_m", FOOT_M), "WVHT": ("wave_height_m", 1.0),
           "DPD": ("wave_period_dominant_s", 1.0), "APD": ("wave_period_avg_s", 1.0), "MWD": ("wave_dir_deg", 1.0),
           "WSPD": ("wind_speed_ms", 1.0), "GST": ("wind_gust_ms", 1.0), "WDIR": ("wind_dir_deg", 1.0),
           "PRES": ("pressure_hpa", 1.0), "ATMP": ("air_temp_c", 1.0)}


def describe():
    return {"connector_version": VERSION, "produces": ["ocean.platform", "ocean.coastal_station", "ocean.tide_gauge", "ocean.network"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(CATALOGUE, "ndbc_activestations.xml"), FetchRequest(LATEST, "ndbc_latest_obs.txt")]


def next_state(state, request, result, today=None):
    return state


def kind_of(st):
    """(NEXUM type, platform kind) of a catalogue station, from its declared type and programme."""
    t, pgm = (st.get("type") or "").lower(), st.get("pgm") or ""
    if t == "fixed":
        return ("ocean.tide_gauge", "tide_gauge") if "CO-OPS" in pgm else ("ocean.coastal_station", "coastal_station")
    return "ocean.platform", {"buoy": "moored_buoy", "dart": "tsunami_buoy", "tao": "moored_buoy", "oilrig": "offshore_platform",
                              "usv": "usv"}.get(t, "other")


def catalogue(data):
    """The catalogue's stations of the owners above: [{id, name, lat, lon, owner, pgm, type}]."""
    root = ET.fromstring(data)
    out = []
    for s in root.iter("station"):
        if s.get("owner") in OWNERS and s.get("id"):
            out.append(dict(s.attrib))
    return out


def parse(data: bytes, meta: dict):
    if not data.lstrip().startswith(b"<"):
        return iter(())                      # the observations file: published as a table only (see table())
    return _parse_catalogue(data, meta)


def _parse_catalogue(data, meta):
    sid = meta["source_id"]
    for key, label, operator in OWNERS.values():
        yield network(sid, key, label, operator, LICENCE, "https://www.ndbc.noaa.gov/")
    for i, s in enumerate(catalogue(data)):
        lat, lon = num(s.get("lat")), num(s.get("lon"))
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        typ, kind = kind_of(s)
        code = s["id"].strip()
        idents = [("ndbc", code.upper())] + ([("wmo", code)] if re.fullmatch(r"\d{5}", code) else [])
        # a NOS/CO-OPS station: the catalogue names it with its CO-OPS station number ("8410140 - Eastport, ME"): the
        # identifier the CO-OPS network uses for the same station (never matched by position)
        coops = re.search(r"(?<!\d)(\d{7})(?!\d)", s.get("name") or "") if "CO-OPS" in (s.get("pgm") or "") else None
        if coops:
            idents.append(("coops", coops.group(1)))
        net_key, _label, operator = OWNERS[s["owner"]]
        props = {"platform_kind": kind, "operator": f"{operator} ({s['owner']})"}
        yield NormalizedRecord(
            source_id=sid, native_id=code.upper(), native_version=content_version([s, VERSION]),
            kind="object", type=typ, label=(s.get("name") or code).strip(), identifiers=idents, properties=props,
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=1000.0, status="reviewed",
            method="asserted", assertions=[part_of(net_key)], raw_locator=f"station[{i}]")


def observations(data):
    """latest_obs.txt → {STATION: {column: cell}} with the observation time as an ISO UTC string."""
    lines = data.decode("utf-8", errors="replace").splitlines()
    head = next((l for l in lines if l.startswith("#STN")), None)
    if head is None:
        return {}
    cols = head.lstrip("#").split()
    out = {}
    for l in lines:
        if l.startswith("#") or not l.strip():
            continue
        cells = l.split()
        if len(cells) != len(cols):
            continue
        r = dict(zip(cols, cells))
        try:
            t = dt.datetime(int(r["YYYY"]), int(r["MM"]), int(r["DD"]), int(r["hh"]), int(r["mm"]), tzinfo=dt.timezone.utc)
        except (KeyError, ValueError):
            continue
        r["observed_utc"] = t.strftime("%Y-%m-%dT%H:%MZ")
        out[r["STN"].upper()] = r
    return out


def table(payloads):
    """The published table "ocean_ndbc": the latest observation of each catalogued station of the owners above."""
    cat = next((d for k, d, _f, _u in payloads if k.endswith("activestations.xml")), None)
    obs = next((d for k, d, _f, _u in payloads if k.endswith("latest_obs.txt")), None)
    allowed = {s["id"].upper() for s in catalogue(cat)} if cat else set()
    rows = []
    for code, r in sorted(observations(obs).items()) if obs else []:
        if code not in allowed:
            continue
        vals = {p: None for p in PARAMS}
        for col, (p, scale) in COLUMNS.items():
            vals[p] = num(r.get(col), scale, 3)
        if all(v is None for v in vals.values()):
            continue
        rows.append(["ndbc", code, r["observed_utc"], num(r.get("LON")), num(r.get("LAT")), *[vals[p] for p in PARAMS], ""])
    return {"fields": fields(PARAMS), "rows": rows,
            "notes": {"params": params_note(PARAMS), "source": "NOAA NDBC — latest_obs.txt (ultima osservazione di ogni stazione)",
                      "quality": "Controllo automatico della fonte (NDBC): nessun indicatore di qualità per singolo valore",
                      "conversions": {"sea_level_m": "livello del mare da piedi a metri (× 0,3048), rispetto al livello medio delle basse maree inferiori (MLLW) della stazione"},
                      "owners": sorted(OWNERS), "excluded": "stazioni di partner con condizioni d'uso non verificate"}}
