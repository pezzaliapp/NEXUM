"""Public webcams whose publisher does NOT allow their images to be shown elsewhere (World Intelligence, 2026-10-03):
NEXUM records only that the camera exists, what it frames, where (the framed landmark's coordinates from Wikidata,
CC0) and the link to the publisher's own page — action "APRI WEBCAM", never a preview, never an embed, never a copy.

Curated list (each entry checked by hand against the publisher's page and terms, see the discovery report):
  · Parma, Piazza Garibaldi — Palazzo del Governatore: the Comune di Parma's camera (broadcast by SkylineWebcams);
    anti-hotlink by Referer, session-bound HLS, embedding reserved to authorised domains, terms forbidding
    reproduction → LINK ONLY (golden reference of the webcam audit). The camera's own position is not published:
    the point is the framed landmark (Wikidata Q21194420), said as such."""

import json

from connectors.base import content_version
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
CURATED = [
    {"id": "parma-piazza-garibaldi", "wikidata": "Q21194420",
     "label": "Webcam di Piazza Garibaldi · Palazzo del Governatore (Parma)",
     "page_url": "https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi",
     "operator": "Comune di Parma (trasmessa da SkylineWebcams)", "subject": "Piazza Garibaldi, Palazzo del Governatore",
     "place_note": "Parma, Emilia-Romagna, Italia",
     "terms_note": "Il gestore non consente di riprodurre o incorporare le immagini fuori dai propri siti: NEXUM mostra solo il collegamento alla pagina originale."},
]


def describe():
    return {"connector_version": VERSION, "produces": ["camera.public_webcam"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(f"https://www.wikidata.org/wiki/Special:EntityData/{c['wikidata']}.json", f"wikidata_{c['wikidata']}.json")
            for c in CURATED]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for qid, ent in (doc.get("entities") or {}).items():
        c = next((x for x in CURATED if x["wikidata"] == qid), None)
        claims = (ent.get("claims") or {}).get("P625") or []
        if not c or not claims:
            continue
        v = claims[0]["mainsnak"]["datavalue"]["value"]
        lon, lat = round(v["longitude"], 6), round(v["latitude"], 6)
        props = {"image_url": None, "page_url": c["page_url"], "operator": c["operator"], "subject": c["subject"],
                 "place_note": c["place_note"], "terms_note": c["terms_note"], "availability": "link_only",
                 "in_service": True, "credit": None, "image_refresh_min": None, "image_observed_at": None,
                 "route": None, "record_updated_at": None}
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=c["id"], native_version=content_version(props | {"lon": lon, "lat": lat}),
            kind="object", type="camera.public_webcam", label=c["label"], identifiers=[("webcam_link", c["id"])],
            properties=props, geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=150.0,
            status="reviewed", method="asserted", raw_locator=f"$.entities.{qid}",
            text=f"{c['subject']} {c['place_note']} webcam Parma Piazza Garibaldi")
