"""Eurostat official statistics — REALITY side (Phase 3B · block 2): HICP annual rate of change (prc_hicp_minr, all
items, ECOICOP 2) and the monthly unemployment rate (une_rt_m, seasonally adjusted, total, % of active population).
Licence: "Reuse of statistical data… for commercial or non-commercial purposes is authorised provided the source is
acknowledged" (Eurostat). Flash/estimated values keep their flag ("e"). Never combined with survey perception."""

import json

from connectors.obs_common import NAMES_IT, iso, record
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
SINCE = "2021-01"
DATASETS = {
    "hicp": (f"{BASE}prc_hicp_minr?format=JSON&lang=EN&unit=RCH_A&coicop18=TOTAL&sinceTimePeriod={SINCE}", "eurostat_hicp_minr.json",
             "inflation.hicp", "Inflazione (indice armonizzato dei prezzi al consumo, variazione annua)", "%",
             "Variazione percentuale rispetto allo stesso mese dell'anno precedente dell'indice armonizzato dei prezzi al consumo (HICP), tutte le voci",
             "Eurostat prc_hicp_minr"),
    "une": (f"{BASE}une_rt_m?format=JSON&lang=EN&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&sinceTimePeriod={SINCE}", "eurostat_une_rt_m.json",
            "unemployment.rate", "Tasso di disoccupazione (destagionalizzato)", "% della forza lavoro",
            "Disoccupati in percentuale della popolazione attiva, dati mensili destagionalizzati (definizione ILO)",
            "Eurostat une_rt_m"),
}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.official_series"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(u, k) for u, k, *_ in DATASETS.values()]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    d = json.loads(data.decode("utf-8"))
    url = meta.get("url") or ""
    spec = next((v for v in DATASETS.values() if v[-1].split()[-1] in url), None)
    if not spec:
        return
    _, _, code, label, unit, definition, dataset = spec
    topic = "prezzi" if code.startswith("inflation") else "lavoro"
    dims, size = d["id"], d["size"]
    idx = {k: d["dimension"][k]["category"]["index"] for k in dims}
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * size[i + 1]
    gi, ti = dims.index("geo"), dims.index("time")
    times = sorted(idx["time"].items(), key=lambda kv: kv[1])
    for g, gpos in idx["geo"].items():
        c = iso(g)
        if not c or g in ("EU27_2020", "EA20", "EA21", "EU", "EA"):
            continue
        pts, flags = [], []
        for t, tpos in times:
            k = str(gpos * strides[gi] + tpos * strides[ti])
            v = d["value"].get(k)
            if v is None:
                continue
            y, mo = int(t[:4]), int(t[5:7])
            last = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
            pts.append([f"{t}-01", f"{t}-{last:02d}", v, None, None])
            if d.get("status", {}).get(k):
                flags.append([t, d["status"][k]])
        if len(pts) < 3:
            continue
        name = NAMES_IT.get(c, c)
        yield record(meta, f"eurostat:{code}:{c}", "observation.official_series", f"{label} · {name} (Eurostat)", c,
                     {"indicator": code, "indicator_label": label, "topic": topic, "definition": definition,
                      "statistic": "rate", "unit": unit, "frequency": "mensile", "dataset": f"{dataset} (aggiornato {d.get('updated', '')[:10]})",
                      "comparable_series_id": f"eurostat:{code}:{c}", "series": pts, "latest_value": pts[-1][2], "latest_end": pts[-1][1],
                      "estimate_flags": flags}, text=f"{label} {name} Eurostat")
