"""Copernicus Emergency Management Service — Rapid Mapping activations.

Licence: free, full and open access (Regulation (EU) 2021/696); citation required.
"""

import json
import re

from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest
from nexum.core.timeutil import parse_iso

VERSION = "1.0.0"
BASE = "https://mapping.emergency.copernicus.eu/activations/api/activations/"
PAGE = 200
_POINT = re.compile(r"POINT\s*\(\s*(-?[0-9.]+)\s+(-?[0-9.]+)\s*\)")
_TEXT_YEAR = re.compile(r"\b(?:on|On)\s+(?:the\s+)?\d{1,2}\s+[A-Z][a-z]+\s+(\d{4})")


def describe():
    return {"connector_version": VERSION, "produces": ["emergency.mapping_activation"]}


def plan(mode, state, source, today=None):
    if mode == "incremental":
        return [FetchRequest(f"{BASE}?limit={PAGE}&offset=0", "page:0")]
    count = state.get("count")
    done = set(state.get("pages_done", []))
    offsets = [0] if count is None else list(range(0, count, PAGE))
    return [FetchRequest(f"{BASE}?limit={PAGE}&offset={o}", f"page:{o}", force=True)
            for o in offsets if f"page:{o}" not in done]


def next_state(state, request, result, today=None):
    st = dict(state)
    if result is not None and result.get("count") is not None:
        st["count"] = result["count"]
    st["pages_done"] = sorted(set(st.get("pages_done", [])) | {request.resource_key})
    return st


def page_info(data: bytes) -> dict:
    return {"count": json.loads(data.decode("utf-8")).get("count")}


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, a in enumerate(doc.get("results", [])):
        flags = []
        geom = None
        m = _POINT.search(a.get("centroid") or "")
        if m:
            geom = {"type": "Point", "coordinates": [float(m.group(1)), float(m.group(2))]}
        t_ms, assumed = parse_iso(a["activationTime"])
        if assumed:
            flags.append("timezone_assumed_utc")
        snippet = (a.get("search_snippet") or "").strip()
        ty = _TEXT_YEAR.search(snippet)
        if ty and a["activationTime"][:4] not in (ty.group(1), str(int(ty.group(1)) + 1)):
            flags.append("text_date_mismatch")
        countries = [c.get("short_name") for c in a.get("countries") or [] if c.get("short_name")]
        cat = a.get("category") or {}
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=a["code"], native_version=a.get("lastUpdate") or a["activationTime"],
            kind="event", type="emergency.mapping_activation", label=f"{a['code']} — {a.get('name') or ''}".strip(),
            identifiers=[("cems", a["code"])],
            properties={"category": cat.get("slug"), "category_name": cat.get("name"), "drm_phase": a.get("drmPhase"),
                        "closed": a.get("closed"), "n_aois": a.get("n_aois"), "n_products": a.get("n_products"),
                        "countries": countries},
            geometry=geom, geo_uncertainty_m=50000.0, t_start_ms=t_ms, t_precision="minute",
            t_uncertainty_s=3600 if assumed else 60, status="reviewed", method="asserted",
            assertions=[Assertion("participation", "affected_area", Target("place.country", name=c)) for c in countries],
            raw_locator=f"$.results[{i}]", quality_flags=flags, text=(a.get("name") or ""))
