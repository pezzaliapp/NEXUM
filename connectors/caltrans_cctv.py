"""Caltrans CWWP2 CCTV (California DOT, 12 districts). Public domain ("information presented on this website, unless
otherwise indicated, is considered in the public domain", dot.ca.gov/conditions-of-use). Only the CURRENT still image
URL is kept; the "reference/previous image" URLs of the source are never used (no archive)."""

import json

from connectors.webcam_common import camera, f
from nexum.core.scheduler import FetchRequest

VERSION = "1.2.0"   # 1.2.0 (2026-10-04): the live HLS video URL · 1.1.0 (2026-10-03): recordTimestamp is the time of the camera's RECORD, never the image's time
DISTRICTS = range(1, 13)


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(f"https://cwwp2.dot.ca.gov/data/d{d}/cctv/cctvStatusD{d:02d}.json", f"cctv_d{d:02d}.json") for d in DISTRICTS]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, row in enumerate(doc.get("data", [])):
        c = row.get("cctv") or {}
        loc, img = c.get("location") or {}, (c.get("imageData") or {}).get("static") or {}
        rid = f"d{loc.get('district')}-{c.get('index')}"
        ts = c.get("recordTimestamp") or {}
        rec = camera(meta, rid, "caltrans_cctv", loc.get("locationName"), f(loc.get("longitude")), f(loc.get("latitude")),
                     img.get("currentImageURL"), operator="Caltrans (California DOT)", subject="traffico stradale",
                     refresh_min=f(img.get("currentImageUpdateFrequency")),
                     # recordTimestamp dates the camera's metadata record (2016–2026 in the feed), not the picture:
                     # the image's own time is not declared by this source, so none is shown (audit §25, 2026-10-03)
                     record_updated_at=f"{ts.get('recordDate')}T{ts.get('recordTime')}" if ts.get("recordDate") else None,
                     in_service=c.get("inService") == "true", route=loc.get("route"),
                     place_note=", ".join(x for x in (loc.get("nearbyPlace"), loc.get("county")) if x and x != "Not Reported"),
                     locator=f"data[{i}]", text=" ".join(x for x in (loc.get("route"), loc.get("nearbyPlace"), "California") if x),
                     # the live video Caltrans publishes for the camera (HLS, played by its own "Live Traffic Cameras" pages)
                     stream_url=((c.get("imageData") or {}).get("streamingVideoURL") or None), stream_type="hls",
                     stream_note="video continuo HLS di Caltrans; ritardo tipico di alcuni secondi")
        if rec:
            yield rec
