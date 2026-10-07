"""CelesTrak — General Perturbations orbital elements (OMM, CSV) for the satellites and the main debris fields (OSIRIS
baseline, 2026-10-04). The positions are NEVER stored: the browser computes them from these elements (SGP4,
satellite.js) and says they are calculated, not observed.

Usage policy (celestrak.org): GP data are updated about every 2 hours; download each set once per update — this
source's minimum interval is 2 hours and the build job fetches each set once. OMM, never TLE (catalogue numbers above
99999 since 2026-07). Data from US government sources (18th/19th Space Defense Squadron via space-track.org),
redistributed by CelesTrak (Dr T.S. Kelso); attribution "Orbital data: CelesTrak".

Objects: the NOTABLE satellites (space stations, the brightest objects, navigation, weather and Earth-observation
satellites, the space telescopes) become NEXUM objects (searchable, with their elements and derived orbit figures);
the whole catalogue is published as one compact file read only when the satellites layer is shown (GET /orbits)."""

import csv
import io
import math
import re

from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
GP = "https://celestrak.org/NORAD/elements/gp.php?GROUP={}&FORMAT=csv"
# the thematic sets (as many small downloads as CelesTrak recommends, each once per update; the large "active" set is
# rate-limited by CelesTrak) → the family each set stands for; debris: the four large debris fields
SETS = {"stations": "station", "visual": None, "gps-ops": "navigation", "glonass-operational": "navigation",
        "galileo": "navigation", "beidou": "navigation", "weather": "weather", "resource": "earth_observation",
        "science": "science", "geo": "geostationary", "oneweb": "oneweb",
        "iridium-NEXT": "iridium", "globalstar": "globalstar", "orbcomm": "orbcomm", "amateur": "amateur",
        "cubesat": "cubesat", "military": "military", "last-30-days": None,
        "fengyun-1c-debris": "debris", "cosmos-2251-debris": "debris", "iridium-33-debris": "debris",
        "cosmos-1408-debris": "debris", "starlink": "starlink"}   # starlink last (largest set)
FIELDS = ["OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
          "ARG_OF_PERICENTER", "MEAN_ANOMALY", "EPHEMERIS_TYPE", "CLASSIFICATION_TYPE", "NORAD_CAT_ID", "ELEMENT_SET_NO",
          "REV_AT_EPOCH", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"]
MU, RE = 398600.4418, 6378.137                          # km³/s², Earth equatorial radius km

# what kind of satellite a name says (the source's own names; nothing inferred beyond them)
FAMILIES = [
    ("station", r"^(ISS|CSS|TIANHE|WENTIAN|MENGTIAN|TIANGONG)\b|\(ZARYA\)"),
    ("navigation", r"^(NAVSTAR|GPS|GLONASS|COSMOS 2\d{3}.*GLONASS|GSAT0|GALILEO|BEIDOU|QZS|IRNSS|NAVIC)"),
    ("weather", r"^(NOAA|GOES|METEOSAT|MTG|METOP|FENGYUN|FY-|HIMAWARI|DMSP|ELEKTRO|METEOR|GEO-KOMPSAT|INSAT-3D|JPSS|SUOMI)"),
    ("earth_observation", r"^(SENTINEL|LANDSAT|TERRA|AQUA|WORLDVIEW|PLEIADES|SPOT|RADARSAT|COSMO-SKYMED|ICEYE|CAPELLA|GAOFEN|KOMPSAT|ALOS|SMAP|ICESAT|GRACE|CRYOSAT|SWOT|PROBA)"),
    ("science", r"^(HST|TESS|FERMI|SWIFT|CHANDRA|XMM|NUSTAR|GAIA|JWST|NICER|IXPE|CHEOPS|EUCLID|INTEGRAL)"),
    ("starlink", r"^STARLINK"), ("oneweb", r"^ONEWEB"), ("iridium", r"^IRIDIUM"), ("globalstar", r"^GLOBALSTAR"),
    ("orbcomm", r"^ORBCOMM"), ("kuiper", r"^KUIPER"), ("qianfan", r"^(QIANFAN|G60)"),
]
NOTABLE = {"station", "navigation", "weather", "earth_observation", "science"}   # objects; every set is in GET /orbits


def describe():
    return {"connector_version": VERSION, "produces": ["space.satellite"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(GP.format(s), f"celestrak_gp_{s}.csv") for s in SETS]


def group_of(url):
    return (re.search(r"GROUP=([^&]+)", url or "") or [None, ""])[1]


def next_state(state, request, result, today=None):
    return state


def family(name, debris=False):
    if debris or re.search(r"\bDEB\b|\bR/B\b", name or ""):
        return "debris"
    for fam, rx in FAMILIES:
        if re.search(rx, name or ""):
            return fam
    return "other"


def orbit_figures(mm, ecc):
    """Semi-major axis, apogee and perigee altitudes (km) and period (min) from the mean motion (rev/day)."""
    n = mm * 2 * math.pi / 86400.0
    a = (MU / n ** 2) ** (1 / 3)
    return round(a, 1), round(a * (1 + ecc) - RE, 1), round(a * (1 - ecc) - RE, 1), round(1440.0 / mm, 2)


def rows(data):
    """The OMM rows of one CelesTrak CSV answer (an error text, when rate-limited, yields nothing)."""
    text = data.decode("utf-8-sig", errors="replace")
    if not text.startswith("OBJECT_NAME"):
        return []
    return [r for r in csv.DictReader(io.StringIO(text)) if r.get("NORAD_CAT_ID")]


def parse(data: bytes, meta: dict):
    group = group_of(meta.get("url"))
    for i, r in enumerate(rows(data)):
        name = r["OBJECT_NAME"].strip()
        fam = SETS.get(group) or family(name)
        if fam not in NOTABLE and group != "visual":
            continue                                     # catalogue only (GET /orbits)
        if group == "visual" and fam not in NOTABLE:
            fam = "other"
        try:
            mm, ecc = float(r["MEAN_MOTION"]), float(r["ECCENTRICITY"])
        except ValueError:
            continue
        a, apo, peri, period = orbit_figures(mm, ecc)
        regime = "LEO" if apo < 2000 else "GEO" if 35000 < peri and apo < 37000 else "MEO" if apo < 35000 else "HEO"
        # the orbit's shape (its figures, rounded): the current elements themselves are read from GET /orbits, never
        # stored per object (they change every few hours)
        props = {"norad_id": int(r["NORAD_CAT_ID"]), "intl_designator": r["OBJECT_ID"], "family": fam, "regime": regime,
                 "inclination_deg": round(float(r["INCLINATION"]), 1), "period_min": round(period, 1),
                 "apogee_km": round(apo), "perigee_km": round(peri)}
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["NORAD_CAT_ID"], native_version=content_version(props),
            kind="object", type="space.satellite", label=name, identifiers=[("norad", r["NORAD_CAT_ID"]), ("cospar", r["OBJECT_ID"])],
            properties=props, status="reviewed", method="asserted", raw_locator=f"row:{i + 2}",
            text=f"{name} {r['OBJECT_ID']} {fam.replace('_', ' ')} satellite satellite {regime}")


def table(payloads):
    """The published table "orbits" (GET /tables/orbits): every object of every set, once (the first set that names a
    specific family wins), with the OMM elements SGP4 needs, compact. payloads: [(resource_key, bytes, fetched_ms, url)]."""
    out, seen, epochs = [], {}, []
    for _key, data, _fetched, url in sorted(payloads, key=lambda x: list(SETS).index(group_of(x[3])) if group_of(x[3]) in SETS else 99):
        g = group_of(url)
        for r in rows(data):
            try:
                el = [float(r[k]) for k in ("MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER",
                                             "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT")]
            except ValueError:
                continue
            nid = int(r["NORAD_CAT_ID"])
            fam = SETS.get(g) or family(r["OBJECT_NAME"])
            if nid in seen:
                if out[seen[nid]][2] in ("other", "geostationary") and fam not in ("other", "geostationary"):
                    out[seen[nid]][2] = fam
                continue
            seen[nid] = len(out)
            epochs.append(r["EPOCH"])
            out.append([nid, r["OBJECT_NAME"].strip(), fam, r["OBJECT_ID"], r["EPOCH"], *el])
    return {"fields": ["norad", "name", "family", "cospar", "epoch", "mean_motion", "eccentricity", "inclination", "raan",
                       "arg_pericenter", "mean_anomaly", "bstar", "mean_motion_dot", "mean_motion_ddot"],
            "rows": out, "notes": {"epoch_min": min(epochs, default=None), "epoch_max": max(epochs, default=None)}}
