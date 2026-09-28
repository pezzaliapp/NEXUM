"""USGS Earthquake Hazards Program — GeoJSON summary feeds and FDSN event service.

Licence: U.S. public domain (credit: U.S. Geological Survey).
"""

import datetime as dt
import json

from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
FDSN = "https://earthquake.usgs.gov/fdsnws/event/1/query"
STATUS = {"reviewed": "reviewed", "automatic": "preliminary", "deleted": "retracted"}


def describe():
    return {"connector_version": VERSION, "produces": ["seismic.earthquake"]}


def plan(mode, state, source, today=None):
    today = today or dt.date.today()
    if mode == "incremental":
        return [FetchRequest(FEED, "feed:4.5_week")]
    opts = source.options
    start_year = int(opts.get("backfill_start_year", 2015))
    minmag = float(opts.get("backfill_min_magnitude", 5.5))
    done = set(state.get("windows_done", []))
    reqs = []
    for year in range(start_year, today.year + 1):
        start = dt.date(year, 1, 1)
        end = min(dt.date(year + 1, 1, 1), today + dt.timedelta(days=1))
        key = f"fdsn:{start.isoformat()}:{end.isoformat()}:m{minmag}"
        if key in done:
            continue
        url = (f"{FDSN}?format=geojson&eventtype=earthquake&orderby=time-asc&minmagnitude={minmag}"
               f"&starttime={start.isoformat()}&endtime={end.isoformat()}")
        reqs.append(FetchRequest(url, key, force=True))
    return reqs


def next_state(state, request, result, today=None):
    today = today or dt.date.today()
    st = dict(state)
    if request.resource_key.startswith("fdsn:"):
        end = dt.date.fromisoformat(request.resource_key.split(":")[2])
        if end <= today - dt.timedelta(days=30):  # closed window: never re-fetched
            st["windows_done"] = sorted(set(st.get("windows_done", [])) | {request.resource_key})
    return st


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, f in enumerate(doc.get("features", [])):
        p = f.get("properties") or {}
        if (p.get("type") or "earthquake") != "earthquake":
            continue
        coords = (f.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2 or p.get("time") is None:
            continue
        lon, lat = float(coords[0]), float(coords[1])
        depth_km = float(coords[2]) if len(coords) > 2 and coords[2] is not None else None
        mag = p.get("mag")
        flags = []
        if mag is None:
            flags.append("missing_magnitude")
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=f["id"], native_version=str(p.get("updated") or p["time"]),
            kind="event", type="seismic.earthquake",
            label=p.get("title") or f"M {mag} - {p.get('place') or ''}".strip(),
            identifiers=[("usgs", f["id"])],
            properties={"magnitude": mag, "magnitude_type": p.get("magType"),
                        "depth": depth_km * 1000.0 if depth_km is not None else None,
                        "place": p.get("place"), "significance": p.get("sig"),
                        "tsunami_flag": bool(p.get("tsunami")) if p.get("tsunami") is not None else None,
                        "network": p.get("net"), "url": p.get("url")},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0,
            t_start_ms=int(p["time"]), t_precision="second", t_uncertainty_s=2,
            status=STATUS.get(p.get("status") or "", "preliminary"), method="measured",
            raw_locator=f"$.features[{i}]", quality_flags=flags, text=p.get("place") or "")
