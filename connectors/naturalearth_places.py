"""Natural Earth — populated places 1:10m (simple). Licence: public domain ("Made with Natural Earth").

Cities and towns with their population estimate (POP_MAX): the "people in the area" of the world. The coordinates
come from the attribute table (LATITUDE/LONGITUDE), so no geometry decoding is needed.
"""

import io
import zipfile

from connectors import shapefile
from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places_simple.zip"


def describe():
    return {"connector_version": VERSION, "produces": ["place.settlement"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "ne_10m_populated_places_simple.zip")]


def next_state(state, request, result, today=None):
    return state


def _g(r, k):
    v = r.get(k)
    if v is None:
        v = r.get(k.upper())
    return v


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = {n.rsplit(".", 1)[-1].lower(): n for n in z.namelist() if "ne_10m_populated_places_simple." in n.lower()}
    enc = z.read(names["cpg"]).decode("ascii").strip().lower() if "cpg" in names else "utf-8"
    rows = shapefile.read_dbf(z.read(names["dbf"]), "utf-8" if "utf" in enc else enc)
    for i, r in enumerate(rows):
        if r is None:
            continue
        lat, lon = _f(_g(r, "latitude")), _f(_g(r, "longitude"))
        if lat is None or lon is None:
            continue
        ne_id = str(_g(r, "ne_id") or _g(r, "nameascii") or i)
        a3 = _g(r, "adm0_a3")
        pop = _f(_g(r, "pop_max"))
        assertions = []   # the containing country comes from the geometry (vocabulary enrichment), not from codes
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=ne_id, native_version=content_version(r),
            kind="object", type="place.settlement", label=_g(r, "name") or _g(r, "nameascii") or ne_id,
            identifiers=[("ne_place", ne_id)], aliases=sorted({x for x in (_g(r, "nameascii"),) if x and x != _g(r, "name")}),
            properties={"population": pop, "feature_class": _g(r, "featurecla") or None,
                        "world_city": bool(_f(_g(r, "worldcity"))), "megacity": bool(_f(_g(r, "megacity"))),
                        "country_name": _g(r, "adm0name") or None},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0, status="reviewed",
            method="asserted", assertions=assertions, raw_locator=f"shape:{i}",
            text=" ".join(x for x in (_g(r, "adm0name"), _g(r, "adm1name")) if x))
