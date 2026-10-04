"""Alaska Volcano Observatory (USGS / UAF / ADGGS) volcano webcams. Only cameras not operated by the FAA (the FAA
images re-hosted by AVO are excluded); credit "AVO/USGS". Current image only."""

import datetime as dt
import json

from connectors.webcam_common import camera, finalize
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
URL = "https://avo.alaska.edu/ashcam-api/webcamApi/webcams"


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "avo_webcams.json")]


def next_state(state, request, result, today=None):
    return state


def _parse(data: bytes, meta: dict):
    for i, w in enumerate(json.loads(data.decode("utf-8")).get("webcams", [])):
        if w.get("faaInd") == "Y" or (w.get("organization") or "").upper() == "FAA" or w.get("hasImages") != "Y":
            continue
        ts = w.get("lastImageTimestamp")
        rec = camera(meta, w.get("webcamCode"), "avo_webcam", w.get("webcamName"), w.get("longitude"), w.get("latitude"),
                     w.get("currentMediumImageUrl") or w.get("currentImageUrl"), operator="Alaska Volcano Observatory (USGS/UAF/ADGGS)",
                     subject=f"vulcano {w['vName']}" if w.get("vName") else "vulcano",
                     observed_at=dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat() if isinstance(ts, (int, float)) else None,
                     credit="AVO/USGS", in_service=True, place_note=w.get("vName"), locator=f"webcams[{i}]",
                     text=" ".join(x for x in (w.get("vName"), "Alaska volcano") if x))
        if rec:
            yield rec


def parse(data: bytes, meta: dict):
    yield from finalize(_parse(data, meta))     # CURRENT / STALE judged against the freshest image of the same list
