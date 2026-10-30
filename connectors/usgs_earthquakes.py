"""USGS Earthquake Hazards Program — GeoJSON summary feeds and FDSN event service.

Licence: U.S. public domain (credit: U.S. Geological Survey).

VERIFY (2026-10-30): the 7-day feed never says that an event was deleted, nor that a preliminary solution was merged
into another event (PTWC pt26297050/pt26298050, "M 7.0 Bonin", deleted; pt26293000 merged into us6000u3jl): such events
stayed preliminary forever. The ids in state["verify"] (written by the caller from the world: the events still
preliminary) are asked one by one to the FDSN service with includedeleted=true: a deleted event comes back with status
"deleted" (retracted); a merged one comes back as the event that absorbed it, so its own id is retracted, flagged with
the id that replaced it; an event that still exists comes back as itself (its revision, reviewed or not).
"""

import datetime as dt
import json
import urllib.parse

from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"   # 1.1.0 (2026-10-30): verify requests, deleted and merged events retracted
FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
FDSN = "https://earthquake.usgs.gov/fdsnws/event/1/query"
STATUS = {"reviewed": "reviewed", "automatic": "preliminary", "deleted": "retracted"}


def describe():
    return {"connector_version": VERSION, "produces": ["seismic.earthquake"]}


def plan(mode, state, source, today=None):
    today = today or dt.date.today()
    if mode == "incremental":
        return [FetchRequest(FEED, "feed:4.5_week")] + [
            FetchRequest(f"{FDSN}?{urllib.parse.urlencode({'eventid': i, 'format': 'geojson', 'includedeleted': 'true'})}",
                         f"verify:{i}", force=True) for i in verify_ids(state)]
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


VERIFY_MAX = 50          # ids asked in one run at most (0.2 requests a second: under 5 minutes)


def verify_ids(state) -> list:
    """The ids to verify, in order, without repetition; only plain USGS ids (letters and digits)."""
    out = []
    for i in state.get("verify", []):
        if isinstance(i, str) and i.isascii() and i.isalnum() and 0 < len(i) <= 32 and i not in out:
            out.append(i)
    return out[:VERIFY_MAX]


def next_state(state, request, result, today=None):
    today = today or dt.date.today()
    st = dict(state)
    if request.resource_key.startswith("verify:"):   # asked once: the caller writes the list again from the world
        st["verify"] = [i for i in st.get("verify", []) if i != request.resource_key[7:]]
        return st
    if request.resource_key.startswith("fdsn:"):
        end = dt.date.fromisoformat(request.resource_key.split(":")[2])
        if end <= today - dt.timedelta(days=30):  # closed window: never re-fetched
            st["windows_done"] = sorted(set(st.get("windows_done", [])) | {request.resource_key})
    return st


def _asked(url) -> str | None:
    """The id of a verify request (FDSN eventid), None for the feed and the backfill windows."""
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url or "").query)
    return (q.get("eventid") or [None])[0]


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    # one event (FDSN eventid answers a Feature) or a collection (feed, backfill windows)
    feats = [doc] if doc.get("type") == "Feature" else doc.get("features", [])
    asked = _asked(meta.get("url"))
    for i, f in enumerate(feats):
        loc = "$" if doc.get("type") == "Feature" else f"$.features[{i}]"
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
        label = p.get("title") or f"M {mag} - {p.get('place') or ''}".strip()
        if p.get("status") == "deleted":
            flags.append("deleted_by_source")
            if not p.get("place"):          # USGS strips the place of a deleted event ("M 7.0 - "): say what it is
                label = f"M {float(mag):.1f} · cancellato dalla fonte" if mag is not None else "Terremoto cancellato dalla fonte"
        ids = [x for x in (p.get("ids") or "").split(",") if x]
        merged = asked is not None and asked != f["id"] and asked in ids
        for nid in ([f["id"], asked] if merged else [f["id"]]):
            yield NormalizedRecord(
                source_id=meta["source_id"], native_id=nid, native_version=str(p.get("updated") or p["time"]),
                kind="event", type="seismic.earthquake",
                # the merged id keeps the event's description and says which event of the source holds it now
                label=label if nid == f["id"] else f"{label} · unito dalla fonte a {f['id']}", identifiers=[("usgs", nid)],
                properties=_props(p, depth_km),
                geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0,
                t_start_ms=int(p["time"]), t_precision="second", t_uncertainty_s=2,
                # the merged id is withdrawn by the source: the event that absorbed it is named in its flags
                status="retracted" if nid != f["id"] else STATUS.get(p.get("status") or "", "preliminary"),
                method="measured", raw_locator=loc,
                quality_flags=flags + ([f"merged_into:{f['id']}"] if nid != f["id"] else []), text=p.get("place") or "")


def _props(p, depth_km):
    return {"magnitude": p.get("mag"), "magnitude_type": p.get("magType"),
            "depth": depth_km * 1000.0 if depth_km is not None else None,
            "place": p.get("place"), "significance": p.get("sig"),
            "tsunami_flag": bool(p.get("tsunami")) if p.get("tsunami") is not None else None,
            "network": p.get("net"), "url": p.get("url")}
