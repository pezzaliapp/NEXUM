"""OPENSTREETMAP EXTRACTS through Overpass (master pass, 2026-10-06): one global query per source, at most once a week,
published as a compact table drawn on request. Two uses, each its own registered source with its own query:
  osm.cables       submarine power and telecom cables (the legal equivalent of OSIRIS's "Maritime lines", which are
                   TeleGeography's cable map copied without a licence): name, kind, operator, simplified course
  osm.navalbases   naval bases as mapped in OSM: name and operator only (no other tag is kept)
Licence: OpenStreetMap data, ODbL 1.0 — attribution "© OpenStreetMap contributors"; the extract is a produced work
published with attribution. Service: the FOSSGIS Overpass server (fair use: one request, identifying User-Agent)."""

import json
import urllib.parse

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
ENDPOINT = "https://overpass-api.de/api/interpreter"


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    q = (source.options or {})["query"]
    return [FetchRequest(f"{ENDPOINT}?data={urllib.parse.quote(q)}", f"osm_{source.options['published_table']}")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def _simplify(pts, tol=0.01):
    """Douglas–Peucker in degrees (enough to draw a cable at world and regional scale)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5 or 1e-12
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            x0, y0 = pts[i]
            d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / n
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def table(payloads):
    elements = []
    for _key, data, _fetched, _url in payloads:
        try:
            elements += json.loads(data).get("elements", [])
        except (ValueError, TypeError):
            continue
    if any(e.get("geometry") for e in elements):        # cables: ways with their course
        rows = []
        for e in elements:
            g = [(round(p["lon"], 3), round(p["lat"], 3)) for p in e.get("geometry") or [] if "lon" in p]
            g = _simplify(g)
            if len(g) < 2:
                continue
            t = e.get("tags", {})
            rows.append([e["id"], t.get("name", ""), "power" if t.get("power") == "cable" else "telecom", t.get("operator", ""), [list(p) for p in g]])
        return {"fields": ["osm_way", "name", "kind", "operator", "course"], "rows": rows,
                "notes": {"extract": "global, simplified to ~0.01°", "attribution": "© OpenStreetMap contributors (ODbL)"}}
    rows = []
    for e in elements:
        c = e.get("center") or ({"lat": e["lat"], "lon": e["lon"]} if "lat" in e else None)
        if not c:
            continue
        t = e.get("tags", {})
        rows.append([e["type"], e["id"], t.get("name", t.get("name:en", "")), t.get("operator", ""), round(c["lon"], 4), round(c["lat"], 4)])
    return {"fields": ["osm_type", "osm_id", "name", "operator", "lon", "lat"], "rows": rows,
            "notes": {"kept_tags": "name, operator only", "attribution": "© OpenStreetMap contributors (ODbL)"}}
