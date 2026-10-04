"""WRI Global Power Plant Database v1.3. Licence: CC BY 4.0 (attribution in the source registry). Last updated by
its publisher in 2021: the world says so (property "data_year" and the source's name), it is never presented as live.
"""

import csv
import io

from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv"
MIN_MW = 20.0   # plants of at least 20 MW: infrastructure that matters at the scale of the world (declared filter)


def describe():
    return {"connector_version": VERSION, "produces": ["energy.power_plant"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "global_power_plant_database.csv")]


def next_state(state, request, result, today=None):
    return state


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    if data[:2] == b"PK":
        return                                  # an earlier zipped copy of the same database: superseded by the CSV
    min_mw = MIN_MW
    for i, r in enumerate(csv.DictReader(io.StringIO(data.decode("utf-8"))), start=2):
        lat, lon, mw = _f(r.get("latitude")), _f(r.get("longitude")), _f(r.get("capacity_mw"))
        if lat is None or lon is None or (mw or 0) < min_mw:
            continue
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["gppd_idnr"], native_version=content_version(r),
            kind="object", type="energy.power_plant", label=r.get("name") or r["gppd_idnr"],
            identifiers=[("gppd", r["gppd_idnr"])],
            properties={"capacity_mw": mw, "primary_fuel": r.get("primary_fuel") or None,
                        "commissioning_year": _f(r.get("commissioning_year")), "country_code3": r.get("country") or None,
                        "data_year": 2021},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=1000.0, status="reviewed",
            method="asserted", raw_locator=f"row:{i}", text=" ".join(x for x in (r.get("primary_fuel"), r.get("country_long")) if x))
