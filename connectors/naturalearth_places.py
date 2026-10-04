"""Natural Earth — populated places 1:10m (full table since 2026-10-04: the same places, with their IANA time zone and
the national-capital flag, so a city's view says its local date and time). Licence: public domain ("Made with Natural Earth").

Cities and towns with their population estimate (POP_MAX): the "people in the area" of the world. The coordinates
come from the attribute table (LATITUDE/LONGITUDE), so no geometry decoding is needed.
"""

import io
import json
import pathlib
import zipfile

from connectors import shapefile
from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.1"
# IANA zone.tab (connectors/timezones_iana.json): the zones of each country, to check and complete Natural Earth's
TZ = json.loads((pathlib.Path(__file__).with_name("timezones_iana.json")).read_text(encoding="utf-8"))


def timezone_of(ne_tz, iso2, lon, lat):
    """The IANA zone of a place: Natural Earth's when it is one of its country's zones (old names made current); the
    country's only zone; otherwise the country's zone whose principal city is nearest (never another country's zone)."""
    tz = TZ["links"].get(ne_tz, ne_tz) if ne_tz else None
    zones = TZ["zones"].get(iso2 or "", [])
    if not zones:
        return tz
    names = [z[0] for z in zones]
    if len(names) == 1:
        return names[0]
    if tz in names:
        return tz
    import math
    return min(zones, key=lambda z: (z[1] - lat) ** 2 + ((z[2] - lon) * math.cos(math.radians(lat))) ** 2)[0]
URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip"


def describe():
    return {"connector_version": VERSION, "produces": ["place.settlement"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "ne_10m_populated_places.zip")]


def next_state(state, request, result, today=None):
    return state


def _g(r, k):
    v = r.get(k)
    if v is None:
        v = r.get(k.upper())
    return v


def _iso2(r):
    """The place's country code (ISO 3166-1 alpha-2, Natural Earth's; its alpha-3 when the alpha-2 is not set)."""
    a2 = str(_g(r, "iso_a2") or "")
    if len(a2) == 2 and a2.isalpha():
        return a2
    from connectors.indicator_common import ISO3_TO_2
    return ISO3_TO_2.get(str(_g(r, "adm0_a3") or ""))


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = {n.rsplit(".", 1)[-1].lower(): n for n in z.namelist() if n.lower().startswith(("ne_10m_populated_places.", "ne_10m_populated_places_simple."))}
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
                        "country_name": _g(r, "adm0name") or None,
                        # the IANA time zone Natural Earth gives the place (local date and time are computed by the
                        # browser from it, with daylight saving time) and whether it is its state's capital
                        "timezone": timezone_of(_g(r, "timezone"), _iso2(r), lon, lat), "capital": bool(_f(_g(r, "adm0cap"))),
                        "country_iso2": _iso2(r)},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0, status="reviewed",
            method="asserted", assertions=assertions, raw_locator=f"shape:{i}",
            text=" ".join(x for x in (_g(r, "adm0name"), _g(r, "adm1name")) if x))
