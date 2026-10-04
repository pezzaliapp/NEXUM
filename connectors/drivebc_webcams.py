"""DriveBC webcams (British Columbia Ministry of Transportation). Open Government Licence – British Columbia; the
per-camera credit given by the source (e.g. City of Vancouver) is kept and shown with the image."""

import html
import json
import re

from connectors.webcam_common import camera, finalize
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
URL = "https://www.drivebc.ca/api/webcams/"


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "drivebc_webcams.json")]


def next_state(state, request, result, today=None):
    return state


def _plain(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip() if s else None


def _parse(data: bytes, meta: dict):
    for i, w in enumerate(json.loads(data.decode("utf-8"))):
        if not w.get("is_on", True):
            continue
        coords = (w.get("location") or {}).get("coordinates") or [None, None]
        period = w.get("update_period_mean")
        rec = camera(meta, w.get("id"), "drivebc_webcam", w.get("name"), coords[0], coords[1],
                     f"https://www.drivebc.ca/images/{w.get('id')}.jpg", operator="DriveBC (BC Ministry of Transportation)",
                     subject="traffico stradale", refresh_min=round(period / 60, 1) if isinstance(period, (int, float)) else None,
                     observed_at=w.get("last_update_modified"), credit=_plain(w.get("credit")) or "DriveBC, Open Government Licence – British Columbia",
                     in_service=not w.get("marked_stale", False), route=w.get("highway_display") and f"Highway {w['highway_display']}",
                     place_note=w.get("region_name"), locator=f"[{i}]",
                     text=" ".join(x for x in (w.get("highway_description"), w.get("region_name"), "British Columbia") if x))
        if rec:
            yield rec


def parse(data: bytes, meta: dict):
    yield from finalize(_parse(data, meta))     # CURRENT / STALE judged against the freshest image of the same list
