"""World Bank — World Development Indicators, REALITY side (Phase 3B · block 2): inflation (consumer prices, annual %,
FP.CPI.TOTL.ZG) and unemployment (% of labour force, ILO modelled estimate, SL.UEM.TOTL.ZS). Licence CC BY 4.0
("The World Bank: World Development Indicators"). Only the 193 UN member states (regional aggregates are skipped).
Annual values; the unemployment series is an ILO modelled estimate and says so."""

import json

from connectors.obs_common import UN193, iso, record
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
INDICATORS = {
    "FP.CPI.TOTL.ZG": ("inflation.cpi_annual", "Inflazione (prezzi al consumo, variazione annua)", "%",
                       "Variazione annua dell'indice dei prezzi al consumo (World Bank WDI FP.CPI.TOTL.ZG)"),
    "SL.UEM.TOTL.ZS": ("unemployment.rate_annual", "Tasso di disoccupazione (stima modellata ILO)", "% della forza lavoro",
                       "Disoccupati in percentuale della forza lavoro, stima modellata dall'ILO (World Bank WDI SL.UEM.TOTL.ZS)"),
}
URL = "https://api.worldbank.org/v2/country/all/indicator/{}?format=json&per_page=20000&date=2014:2026"


def describe():
    return {"connector_version": VERSION, "produces": ["observation.official_series"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL.format(i), f"wdi_{i}.json") for i in INDICATORS]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    if not isinstance(doc, list) or len(doc) < 2 or not doc[1]:
        return
    by = {}
    for r in doc[1]:
        ind = (r.get("indicator") or {}).get("id")
        c = iso((r.get("country") or {}).get("id"))
        if ind not in INDICATORS or c not in UN193 or r.get("value") is None:
            continue
        by.setdefault((ind, c), {"name": r["country"]["value"], "pts": []})["pts"].append([f"{r['date']}-01-01", f"{r['date']}-12-31", round(r["value"], 2), None, None])
    updated = doc[0].get("lastupdated", "")
    for (ind, c), v in sorted(by.items()):
        code, label, unit, definition = INDICATORS[ind]
        pts = sorted(v["pts"])
        yield record(meta, f"wdi:{code}:{c}", "observation.official_series", f"{label} · {v['name']} (Banca Mondiale)", c,
                     {"indicator": code, "indicator_label": label, "topic": "prezzi" if code.startswith("inflation") else "lavoro", "definition": definition,
                      "statistic": "rate", "unit": unit, "frequency": "annuale", "dataset": f"World Bank WDI {ind} (aggiornato {updated})",
                      "comparable_series_id": f"wdi:{code}:{c}", "series": pts, "latest_value": pts[-1][2], "latest_end": pts[-1][1]},
                     text=f"{label} {v['name']} World Bank")
