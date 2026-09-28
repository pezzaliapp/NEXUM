"""Natural Earth — Admin 0 countries 1:50m. Licence: public domain."""

import io
import zipfile

from connectors import shapefile
from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip"
NAME_FIELDS = ("NAME", "NAME_LONG", "ADMIN", "FORMAL_EN", "NAME_EN", "NAME_SORT", "BRK_NAME", "GEOUNIT",
               "SUBUNIT", "NAME_CIAWF", "NAME_IT")


def describe():
    return {"connector_version": VERSION, "produces": ["place.country"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "ne_50m_admin_0_countries.zip")]


def next_state(state, request, result, today=None):
    return state


def _code(v):
    return v if v and v not in ("-99", "-1") else None


def parse(data: bytes, meta: dict):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = {n.rsplit(".", 1)[-1].lower(): n for n in z.namelist() if n.lower().startswith("ne_50m_admin_0_countries.")}
    enc = z.read(names["cpg"]).decode("ascii").strip().lower() if "cpg" in names else "utf-8"
    enc = "utf-8" if "utf" in enc else enc
    rows = shapefile.read_dbf(z.read(names["dbf"]), enc)
    geoms = list(shapefile.read_polygons(z.read(names["shp"])))
    if len(rows) != len(geoms):
        raise ValueError("dbf/shp record count mismatch")
    official3 = {_code(r.get("ISO_A3")) for r in rows if r and _code(r.get("ISO_A3"))}
    official2 = {_code(r.get("ISO_A2")) for r in rows if r and _code(r.get("ISO_A2"))}
    for i, (r, g) in enumerate(zip(rows, geoms)):
        if r is None:
            continue
        # ISO codes: the official column first; the "EH" (enhanced) column only when it is not already the
        # official code of another unit (for dependencies it carries the parent's code, e.g. AU).
        a3 = _code(r.get("ISO_A3")) or (_code(r.get("ISO_A3_EH")) if _code(r.get("ISO_A3_EH")) not in official3 else None)
        a2 = _code(r.get("ISO_A2")) or (_code(r.get("ISO_A2_EH")) if _code(r.get("ISO_A2_EH")) not in official2 else None)
        ne = r.get("ADM0_A3")
        idents = [(s, v) for s, v in (("iso3166a3", a3), ("iso3166a2", a2), ("ne", ne)) if v]
        aliases = sorted({r[f] for f in NAME_FIELDS if r.get(f)})
        pop = r.get("POP_EST")
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=ne, native_version=content_version([r, g]),
            kind="object", type="place.country", label=r.get("NAME") or ne, identifiers=idents,
            aliases=aliases,
            properties={"formal_name": r.get("FORMAL_EN") or None, "continent": r.get("CONTINENT") or None,
                        "region_un": r.get("REGION_UN") or None, "subregion": r.get("SUBREGION") or None,
                        "sovereignty": r.get("SOVEREIGNT") or None, "ne_type": r.get("TYPE") or None,
                        "population_estimate": float(pop) if isinstance(pop, (int, float)) and pop > 0 else None},
            geometry=g, geo_uncertainty_m=5000.0, status="reviewed", method="asserted",
            raw_locator=f"shape:{i}", text=r.get("NAME_LONG") or "")
