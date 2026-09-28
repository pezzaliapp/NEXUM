"""OurAirports — airports.csv. Licence: public domain."""

import csv
import io

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"


def describe():
    return {"connector_version": VERSION, "produces": ["transport.airport"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "airports.csv")]


def next_state(state, request, result, today=None):
    return state


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def parse(data: bytes, meta: dict):
    reader = csv.DictReader(io.StringIO(data.decode("utf-8")))
    for i, r in enumerate(reader, start=2):
        lat, lon = _f(r.get("latitude_deg")), _f(r.get("longitude_deg"))
        geom = None
        flags = []
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            flags.append("invalid_coordinates")
        else:
            geom = {"type": "Point", "coordinates": [lon, lat]}
        elev_ft = _f(r.get("elevation_ft"))
        idents = [("ourairports", r["id"])]
        for scheme, col in (("icao", "icao_code"), ("iata", "iata_code"), ("gps", "gps_code"), ("ident", "ident")):
            if r.get(col):
                idents.append((scheme, r[col]))
        assertions = []
        if r.get("iso_country"):
            assertions.append(Assertion("relation", "located_in",
                                        Target("place.country", scheme="iso3166a2", value=r["iso_country"])))
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["id"], native_version=content_version(r),
            kind="object", type="transport.airport", label=r.get("name") or r["ident"],
            identifiers=idents,
            properties={"airport_type": r.get("type"), "scheduled_service": r.get("scheduled_service") == "yes",
                        "elevation": elev_ft * 0.3048 if elev_ft is not None else None,
                        "municipality": r.get("municipality") or None, "iso_country": r.get("iso_country") or None,
                        "iso_region": r.get("iso_region") or None},
            geometry=geom, geo_uncertainty_m=1000.0, status="reviewed", method="asserted",
            assertions=assertions, raw_locator=f"row:{i}", quality_flags=flags,
            text=" ".join(x for x in (r.get("municipality"), r.get("iso_region")) if x))
