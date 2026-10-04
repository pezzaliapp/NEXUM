"""NASA EONET v3 — Earth Observatory Natural Event Tracker (curated natural events). Licence: NASA open data
(public domain, US Government work); attribution "NASA EONET". No key.

Categories used (each one a domain of the world; others are not imported because they add numbers, not connections):
volcanoes, wildfires, severeStorms, floods, landslides. Geometry: a storm is a track of points with the wind in knots
(the event is placed at its strongest point AT THE TIME OF THAT POINT — place and time always describe the same
position; the track and its first and last times are kept as properties); a wildfire a point with its area; a
flood a polygon (GDACS); a volcanic activity a point with the Smithsonian volcano number of its source page, which
links it to the volcano itself (an identifier given by the source, not a proximity).
"""

import json
import math
import re

from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest
from nexum.core.timeutil import parse_iso

VERSION = "1.3.0"   # 1.1.0 (2026-10-03): a storm's time is the time of the position shown · 1.2.0: "open" (no closing date)
BASE = "https://eonet.gsfc.nasa.gov/api/v3/events"
CATEGORIES = {"volcanoes": "volcanic.activity", "wildfires": "fire.wildfire", "severeStorms": "weather.severe_storm",
              "floods": "hydro.flood", "landslides": "geo.landslide"}
# Upstream sources whose terms give no permission to reuse (verified 2026-10-01: gdacs.org/About/termofuse.aspx has
# disclaimers only). An item reported by them alone is not imported; one also reported by another source is.
EXCLUDED_UPSTREAM = {"GDACS"}
MIN_FIRE_ACRES = 1000.0   # wildfires with a reported area below ~4 km² are not imported (declared filter)
_VN = re.compile(r"volcano\.si\.edu/volcano\.cfm\?vn=(\d{6})")


def describe():
    return {"connector_version": VERSION, "produces": sorted(CATEGORIES.values())}


def plan(mode, state, source, today=None):
    start = int(source.options.get("backfill_start_year", 2015))
    year = (today.year if today else 2026)
    if mode == "incremental" and state.get("years_done"):
        return [FetchRequest(f"{BASE}?status=all&days=45&category={c}", f"recent:{c}") for c in CATEGORIES]
    done = set(state.get("years_done", []))
    reqs = []
    for c in CATEGORIES:
        for y in range(start, year + 1):
            key = f"{c}:{y}"
            if key in done and y < year:
                continue
            reqs.append(FetchRequest(f"{BASE}?status=all&category={c}&start={y}-01-01&end={y}-12-31", key, force=True))
    return reqs


def next_state(state, request, result, today=None):
    st = dict(state)
    if ":" in request.resource_key and not request.resource_key.startswith("recent:"):
        st["years_done"] = sorted(set(st.get("years_done", [])) | {request.resource_key})
    return st


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _valid(g) -> bool:
    def pts(c):
        if c and isinstance(c[0], (int, float)):
            yield c
        else:
            for x in c or []:
                yield from pts(x)
    ok = [(-180 <= p[0] <= 180 and -90 <= p[1] <= 90) for p in pts(g.get("coordinates"))]
    return bool(ok) and all(ok)


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, e in enumerate(doc.get("events", [])):
        cats = [c.get("id") for c in e.get("categories") or []]
        cat = next((c for c in cats if c in CATEGORIES), None)
        geoms = [g for g in e.get("geometry") or [] if g.get("coordinates") is not None]
        if not cat or not geoms:
            continue
        typ = CATEGORIES[cat]
        flags = []
        box_unc = None
        t0, a0 = parse_iso(geoms[0]["date"])
        t1, _ = parse_iso(geoms[-1]["date"])
        if a0:
            flags.append("timezone_assumed_utc")
        srcs = [s.get("id") for s in e.get("sources") or [] if s.get("id")]
        if srcs and set(srcs) <= EXCLUDED_UPSTREAM:
            continue                            # declared: items whose only upstream is GDACS (no reuse permission)
        # "open": the event is still open at the source (EONET: no closing date) — what a CURRENT image may relate to
        props = {"category": cat, "eonet_sources": srcs, "closed": e.get("closed"), "positions": len(geoms),
                 "open": e.get("closed") is None}
        idents = [("eonet", e["id"])]
        assertions = []
        points = [g for g in geoms if g.get("type") == "Point"]
        if typ == "weather.severe_storm" and points:
            # only positions with valid coordinates can be the position shown (a source point with latitude and
            # longitude swapped is never chosen; integrity gate 2026-10-04: Super Typhoon Maria 2018)
            points = [g for g in points if _valid({"coordinates": g["coordinates"][:2]})] or points
            winds = [(_num(g.get("magnitudeValue")) or 0.0, -k) for k, g in enumerate(points)]
            best = -max(winds)[1]                   # the strongest position (the earliest one when the wind ties)
            geom = {"type": "Point", "coordinates": points[best]["coordinates"][:2]}
            # place and time of the SAME position (2026-10-03): the event starts when the storm is where it is shown;
            # the track's own first and last times stay as properties (never a time paired with another place)
            tb, _ = parse_iso(points[best]["date"])
            props["track_start"] = points[0]["date"]
            props["track_end"] = points[-1]["date"]
            props["position_shown"] = "maximum_wind"
            t0 = tb
            props["max_wind_kts"] = max(w for w, _ in winds) or None
            props["track"] = [[round(g["coordinates"][0], 2), round(g["coordinates"][1], 2)] for g in points][:200]
        elif points:
            g = points[-1]
            geom = {"type": "Point", "coordinates": g["coordinates"][:2]}
            if typ == "fire.wildfire" and g.get("magnitudeUnit") == "acres" and _num(g.get("magnitudeValue")):
                acres = _num(g.get("magnitudeValue"))
                if acres < MIN_FIRE_ACRES:
                    continue                    # declared filter: small fires (mostly US incident reports)
                props["area_km2"] = round(acres * 0.00404686, 3)
                props["size_class"] = round(math.log10(max(1.0, acres)), 2)   # derived: log10(acres), documented
        elif typ == "hydro.flood":
            g = geoms[-1]
            geom = {"type": g["type"], "coordinates": g["coordinates"]}
        else:
            # older records give a bounding polygon only: its centre, with the uncertainty of the box (declared)
            ring = geoms[-1]["coordinates"][0] if geoms[-1]["type"] == "Polygon" else None
            if not ring:
                continue
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            geom = {"type": "Point", "coordinates": [round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4)]}
            flags.append("centroid_of_bounding_box")
            box_unc = max(10000.0, 111000.0 * max(max(xs) - min(xs), max(ys) - min(ys)) / 2)
        for s in e.get("sources") or []:
            m = _VN.search(s.get("url") or "")
            if m:
                props["volcano_number"] = m.group(1)
                assertions.append(Assertion("participation", "at_volcano", Target("geo.volcano", scheme="gvp", value=m.group(1))))
        if geom is not None and not _valid(geom):
            geom = None                         # e.g. latitude and longitude swapped at the source: never guessed
            flags.append("invalid_coordinates")
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=e["id"], native_version=f"{e.get('closed')}|{len(geoms)}|{geoms[-1]['date']}",
            kind="event", type=typ, label=e.get("title") or e["id"], identifiers=idents, properties=props,
            geometry=geom, geo_uncertainty_m=box_unc or (10000.0 if typ != "hydro.flood" else 50000.0),
            t_start_ms=t0, t_end_ms=t1 if t1 and t1 > t0 else None, t_precision="day", t_uncertainty_s=86400,
            status="reviewed", method="asserted", assertions=assertions, raw_locator=f"$.events[{i}]",
            quality_flags=flags, text=" ".join(srcs))
