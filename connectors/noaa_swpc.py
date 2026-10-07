"""NOAA SWPC — the geomagnetic Kp index (OSIRIS baseline, 2026-10-04: the header's "SOLAR Kp"). The planetary Kp of the
last days and the 3-day forecast, published as one small table (GET /tables/spaceweather) so the header reads it from
NEXUM's own origin (O2): the value is said with its time; live data stay one click away in the space panel.
Public domain (US Government work, NOAA Space Weather Prediction Center); no key; minimum interval 1 hour."""

import json

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URLS = {"kp": "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
        "forecast": "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
        "scales": "https://services.swpc.noaa.gov/products/noaa-scales.json"}


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    return [FetchRequest(u, f"swpc_{k}") for k, u in URLS.items()]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def _rows(d):
    """The products are lists of rows (first row = header) or lists of objects, depending on their version."""
    if not isinstance(d, list) or not d:
        return []
    if isinstance(d[0], list):
        head = [str(h).lower() for h in d[0]]
        return [dict(zip(head, r)) for r in d[1:]]
    return [{str(k).lower(): v for k, v in r.items()} for r in d]


def table(payloads):
    latest = {}
    for key, data, fetched, _url in payloads:
        k = key.replace("swpc_", "")
        if k not in latest or fetched > latest[k][0]:
            latest[k] = (fetched, data)
    rows, notes = [], {}
    for r in _rows(json.loads(latest["kp"][1])) if "kp" in latest else []:
        try:
            rows.append([str(r.get("time_tag")), float(r.get("kp") or r.get("kp_index")), "observed"])
        except (TypeError, ValueError):
            continue
    for r in _rows(json.loads(latest["forecast"][1])) if "forecast" in latest else []:
        if r.get("observed") == "predicted":
            try:
                rows.append([str(r.get("time_tag")), float(r.get("kp")), "predicted"])
            except (TypeError, ValueError):
                continue
    if "scales" in latest:
        now = json.loads(latest["scales"][1]).get("0", {})
        notes["scales_now"] = {k: (now.get(k) or {}).get("Scale") for k in ("R", "S", "G")}
    obs = [r for r in rows if r[2] == "observed"]
    if obs:
        notes["kp_latest"], notes["kp_time_utc"] = obs[-1][1], obs[-1][0]
    return {"fields": ["time_utc", "kp", "kind"], "rows": rows, "notes": notes}
