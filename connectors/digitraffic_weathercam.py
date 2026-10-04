"""Fintraffic Digitraffic weather cameras (Finland). CC BY 4.0 ("Source: Fintraffic / digitraffic.fi, license CC 4.0
BY"). One camera per station; its image is the station's first preset in collection (current image, refreshed by the
source). The image itself is loaded by the browser only on request."""

import json

from connectors.webcam_common import camera, finalize
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
URL = "https://tie.digitraffic.fi/api/weathercam/v1/stations"


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "weathercam_stations.json")]


def next_state(state, request, result, today=None):
    return state


def _parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, ft in enumerate(doc.get("features", [])):
        p, g = ft.get("properties") or {}, (ft.get("geometry") or {}).get("coordinates") or [None, None]
        presets = [x["id"] for x in p.get("presets") or [] if x.get("inCollection")]
        if not presets or p.get("collectionStatus") not in ("GATHERING", None):
            continue
        name = (p.get("name") or p.get("id") or "").split("_", 1)[-1].replace("_", " ")
        rec = camera(meta, p.get("id") or ft.get("id"), "fintraffic_weathercam", f"Kelikamera {name}", g[0], g[1],
                     f"https://weathercam.digitraffic.fi/{presets[0]}.jpg", operator="Fintraffic",
                     subject="strada e condizioni meteo", refresh_min=10.0, observed_at=p.get("dataUpdatedTime"),
                     credit="Source: Fintraffic / digitraffic.fi, license CC 4.0 BY", in_service=True, place_note=name,
                     locator=f"features[{i}]", text=f"{name} Finland")
        if rec:
            yield rec


def parse(data: bytes, meta: dict):
    yield from finalize(_parse(data, meta))     # CURRENT / STALE judged against the freshest image of the same list
