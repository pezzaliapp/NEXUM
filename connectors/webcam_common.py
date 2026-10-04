"""Shared shape of a public webcam record (Phase 3B · block 1). A camera is an Object: where it is, who operates it, the
stable URL of its CURRENT image and the refresh period declared by the source. Image bytes are never fetched, copied
or archived here: the browser asks the original source for the image only when the person opens the camera. No
recognition, identification or tracking of people of any kind."""

import datetime as dt

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target

STALE_AFTER_H = 24
STREAM_TYPES = ("hls", "mjpeg")   # what the browser can play without a plug-in or a relay          # an image a day older than the freshest image of the same list: shown as such, never as current


def _ts(v):
    try:
        t = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return (t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)).timestamp()
    except (TypeError, ValueError):
        return None


def finalize(records):
    """CURRENT_SNAPSHOT · STALE · OFFLINE for the cameras of ONE list: a camera whose own image time is more than a day
    (or six refresh periods) older than the freshest image of the same list is STALE — the list itself is the clock,
    never the machine's (deterministic on rebuild)."""
    recs = [r for r in records if r]
    times = [t for t in (_ts(r.properties.get("image_observed_at")) for r in recs) if t]
    ref = max(times) if times else None
    for r in recs:
        p = r.properties
        if p.get("availability") != "current_snapshot" or ref is None:
            continue
        t = _ts(p.get("image_observed_at"))
        limit_h = max(STALE_AFTER_H, 6 * (p.get("image_refresh_min") or 0) / 60)
        if t is not None and ref - t > limit_h * 3600:
            p["availability"] = "stale"
            r.native_version = content_version({k: v for k, v in p.items() if k not in ("image_observed_at", "record_updated_at")}
                                               | {"lon": r.geometry["coordinates"][0], "lat": r.geometry["coordinates"][1]})
    return recs


def camera(meta, native_id, scheme, label, lon, lat, image_url, *, operator, subject=None, refresh_min=None,
           observed_at=None, credit=None, in_service=True, route=None, place_note=None, locator="", text="",
           record_updated_at=None, page_url=None, credit_url=None, stream_url=None, stream_type=None, stream_note=None, country=None):
    # https on its default port is the same origin: written without ":443" (one form for the allowlist and the CSP)
    stream_url = stream_url.replace(":443/", "/", 1) if stream_url else stream_url
    image_url = image_url.replace(":443/", "/", 1) if image_url else image_url
    stream = stream_url if stream_url and stream_url.startswith("https://") and stream_type in STREAM_TYPES else None
    if image_url and not image_url.startswith("https://"):
        image_url = None
    if lon is None or lat is None or not (image_url or stream):
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
        return None
    props = {"image_url": image_url, "image_refresh_min": refresh_min, "image_observed_at": observed_at,
             "operator": operator, "subject": subject, "credit": credit, "in_service": bool(in_service),
             "route": route or None, "place_note": place_note or None, "record_updated_at": record_updated_at,
             # the publisher's own page of the camera (a click on the image opens it) and the credit's link, when given
             "page_url": page_url if page_url and page_url.startswith("https://") else None,
             "credit_url": credit_url if credit_url and credit_url.startswith("https://") else None,
             # what NEXUM can show of it: a CURRENT still image (refreshed by the source), or nothing while the source
             # declares the camera out of service; STALE is set by finalize() (2026-10-03: CURRENT_SNAPSHOT · STALE · OFFLINE)
             "availability": ("live_stream" if stream else "current_snapshot") if in_service else "offline",
             # LIVE (2026-10-04): a continuous video the publisher serves (HLS playlist or MJPEG stream), played by the
             # browser only when the person starts it; a refreshed still is never live
             "stream_url": stream, "stream_type": stream_type if stream else None, "stream_note": stream_note if stream else None}
    # the version ignores the image timestamp: a new picture at the source is not a new version of the camera
    props = {k: v for k, v in props.items() if v is not None or k not in ("page_url", "credit_url", "stream_url", "stream_type", "stream_note")}
    version = content_version({k: v for k, v in props.items() if k not in ("image_observed_at", "record_updated_at")} | {"lon": lon, "lat": lat})
    return NormalizedRecord(
        source_id=meta["source_id"], native_id=str(native_id), native_version=version,
        kind="object", type="camera.public_webcam", label=label or str(native_id),
        identifiers=[(scheme, str(native_id))], properties=props,
        geometry={"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, geo_uncertainty_m=100.0,
        assertions=[Assertion("relation", "located_in", Target("place.country", scheme="iso3166a2", value=country))] if country else [],
        status="reviewed", method="asserted", raw_locator=locator, text=text)


def link_camera(meta, native_id, scheme, label, lon, lat, page_url, *, operator, subject=None, credit=None, place_note=None,
                reason=None, locator="", text="", uncertainty_m=100.0, country=None):
    """A camera whose image NEXUM may not show (the publisher's terms, an image that is not served over https, a list
    licensed without its images): its existence, place and the link to the publisher's own page — LINK ONLY, never a
    preview. `reason` says why, in words, on the card."""
    if lon is None or lat is None or not page_url or not str(page_url).startswith(("https://", "http://")):
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
        return None
    props = {"image_url": None, "page_url": page_url, "operator": operator, "subject": subject, "credit": credit,
             "place_note": place_note or None, "terms_note": reason, "availability": "link_only", "in_service": True,
             "image_refresh_min": None, "image_observed_at": None, "route": None, "record_updated_at": None}
    return NormalizedRecord(
        source_id=meta["source_id"], native_id=str(native_id), native_version=content_version(props | {"lon": lon, "lat": lat}),
        kind="object", type="camera.public_webcam", label=label or str(native_id), identifiers=[(scheme, str(native_id))],
        properties=props, geometry={"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, geo_uncertainty_m=uncertainty_m,
        # the state the publisher names (islands and lagoons the coarse outline misses): what the source states
        assertions=[Assertion("relation", "located_in", Target("place.country", scheme="iso3166a2", value=country))] if country else [],
        status="reviewed", method="asserted", raw_locator=locator, text=text)


def f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
