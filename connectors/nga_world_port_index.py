"""NGA World Port Index (Pub. 150). Licence: US Government work, public domain ("Approved for Public Release").

Ports of the world with their size, type and depths: transport and infrastructure exposed to events.
"""

import json

from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://msi.nga.mil/api/publications/world-port-index?output=json"
SIZE = {"V": "molto piccolo", "S": "piccolo", "M": "medio", "L": "grande"}


def describe():
    return {"connector_version": VERSION, "produces": ["transport.port"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "world-port-index.json")]


def next_state(state, request, result, today=None):
    return state


def _f(v):
    try:
        return float(v) if v not in (None, "", " ") else None
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    for i, p in enumerate(json.loads(data.decode("utf-8")).get("ports", [])):
        lat, lon = _f(p.get("ycoord")), _f(p.get("xcoord"))
        if lat is None or lon is None:
            continue
        idents = [("wpi", str(p["portNumber"]))] + ([("unlocode", p["unloCode"].replace(" ", ""))] if p.get("unloCode") else [])
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=str(p["portNumber"]), native_version=content_version(p),
            kind="object", type="transport.port", label=(p.get("portName") or str(p["portNumber"])).strip(),
            identifiers=idents,
            properties={"harbor_size": SIZE.get(p.get("harborSize")), "harbor_type": p.get("harborType"),
                        "channel_depth_m": _f(p.get("chDepth")), "max_vessel_length_m": _f(p.get("maxVesselLength")),
                        "country_code": p.get("countryCode"), "country_name": p.get("countryName"),
                        "water_body": p.get("dodWaterBody")},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=2000.0, status="reviewed",
            method="asserted", raw_locator=f"$.ports[{i}]",
            text=" ".join(x for x in (p.get("countryName"), p.get("dodWaterBody")) if x))
