"""USGS National Imagery Management System (HIVIS) river cameras. US federal public domain; credit "USGS". Hidden
cameras (hideCam) are skipped; only the newest image URL is kept (never the timelapse or archive folders)."""

import json

from connectors.webcam_common import camera, finalize, f
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
URL = "https://api.waterdata.usgs.gov/nims/cameras"


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "nims_cameras.json")]


def next_state(state, request, result, today=None):
    return state


def _parse(data: bytes, meta: dict):
    for i, c in enumerate(json.loads(data.decode("utf-8"))):
        if c.get("hideCam") or not c.get("camId"):
            continue
        cid = c["camId"]
        rec = camera(meta, cid, "usgs_nims", c.get("camName"), f(c.get("lng")), f(c.get("lat")),
                     f"https://usgs-nims-images.s3.amazonaws.com/720/{cid}/{cid}_newest.jpg", operator="USGS",
                     subject="fiume (stazione idrometrica)", refresh_min=f((c.get("ingest") or {}).get("intr")),
                     observed_at=c.get("newestImageDT"), credit="USGS", in_service=True,
                     place_note=c.get("stateAbrv"), locator=f"[{i}]", text=" ".join(x for x in (c.get("camDesc"), c.get("nwisId")) if x))
        if rec:
            yield rec


def parse(data: bytes, meta: dict):
    yield from finalize(_parse(data, meta))     # CURRENT / STALE judged against the freshest image of the same list
