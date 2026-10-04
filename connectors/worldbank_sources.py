"""World Bank DataBank sources beyond WDI (2026-10-04, completion): the COST OF LIVING for every country.

  worldbank.fpn   Food Prices for Nutrition (World Bank / FAO; source 88): the daily cost per person of the least-cost
                  HEALTHY DIET, in the country's currency and in 2021 PPP dollars, and the share of the population who
                  CANNOT AFFORD it (computed by the source from income distributions). An affordability measure the
                  source itself computes: NEXUM computes nothing here.
  worldbank.icp   International Comparison Program 2021 (source 90): PRICE LEVEL INDICES (world = 100) of household
                  consumption by category — food, housing/water/energy, transport, restaurants… — for the benchmark years
                  2017 and 2021: how expensive a country is, category by category, compared with the world.

Licence CC BY 4.0 (World Bank datasets). API without key; one request per series."""

import json

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
API = "https://api.worldbank.org/v2/sources/{src}/country/all/series/{series}{cls}/time/all?format=json&per_page=5000"
DIET = ("Costo minimo, ai prezzi locali, di una dieta sana per una persona al giorno (alimenti dei gruppi raccomandati dalle "
        "linee guida nutrizionali). Stima World Bank/FAO da prezzi al dettaglio rilevati per l'ICP")
# source id → {series: (code, label, unit, unit_local, section, topic, statistic, nature, digits, order, definition, keywords)}
SERIES = {
    "worldbank.fpn": ("88", "", {
        "CoHD_headcount": ("fpn.healthy_diet.unaffordable", "Persone che non possono permettersi una dieta sana", "% della popolazione",
                           None, "vivere", "costo della vita", "share", "estimated", 1, -15,
                           "Quota della popolazione il cui reddito, dopo le spese non alimentari, non basta a comprare la dieta sana "
                           "meno cara (World Bank/FAO, stima da distribuzioni del reddito)",
                           "costo della vita cibo dieta povertà affordability food"),
        "CoHD_LCU": ("fpn.healthy_diet.cost_lcu", "Costo di una dieta sana · per persona al giorno", "valuta nazionale al giorno",
                     "{cur} al giorno per persona", "prezzi", "cibo", "price", "estimated", 2, 0, DIET,
                     "costo cibo spesa alimentare food cost dieta"),
        "CoHD_PPP": ("fpn.healthy_diet.cost_ppp", "Costo di una dieta sana in dollari PPA (per confronti)", "$ PPA 2021 al giorno per persona",
                     None, "prezzi", "cibo", "price", "estimated", 2, 1,
                     DIET + ". In dollari a parità di potere d'acquisto 2021: serve a confrontare Paesi",
                     "costo cibo food cost ppp"),
    }),
    "worldbank.icp": ("90", "/classification/PX.WL", {
        "9020000": ("icp.pli.consumption", "Livello dei prezzi · consumi delle famiglie", "mondo = 100", None),
        "1101000": ("icp.pli.food", "Livello dei prezzi · cibo e bevande analcoliche", "mondo = 100", None),
        "9060000": ("icp.pli.housing", "Livello dei prezzi · casa, acqua, elettricità, gas", "mondo = 100", None),
        "1107000": ("icp.pli.transport", "Livello dei prezzi · trasporti", "mondo = 100", None),
        "1111000": ("icp.pli.restaurants", "Livello dei prezzi · ristoranti e alberghi", "mondo = 100", None),
        "1103000": ("icp.pli.clothing", "Livello dei prezzi · abbigliamento e calzature", "mondo = 100", None),
        "1108000": ("icp.pli.communication", "Livello dei prezzi · comunicazioni", "mondo = 100", None),
        "9080000": ("icp.pli.health", "Livello dei prezzi · salute", "mondo = 100", None),
    }),
}
ICP_DEF = ("Indice del livello dei prezzi dell'International Comparison Program (ICP 2021, World Bank): quanto costa la stessa "
           "quantità di beni e servizi della categoria rispetto alla media mondiale (= 100). 150 = il 50 % più caro della media "
           "mondiale ai cambi di mercato. Anni di riferimento dell'ICP: 2017 e 2021")


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    src, cls, series = SERIES[source.id]
    return [FetchRequest(API.format(src=src, series=s, cls=cls), f"wb_{src}_{s}.json") for s in series]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    src, _cls, series = SERIES[meta["source_id"]]
    doc = json.loads(data.decode("utf-8"))
    rows = (doc.get("source") or {}).get("data") or []
    by, code = {}, None
    for r in rows:
        v = {x["concept"]: x["id"] for x in r.get("variable", [])}
        code = v.get("Series")
        c = ISO3_TO_2.get(v.get("Country") or "")
        if not c or r.get("value") is None or code not in series:
            continue
        by.setdefault(c, []).append((v["Time"].replace("YR", ""), r["value"], None))
    if code not in series or not by:
        return
    spec = series[code]
    dataset = f"World Bank {doc.get('source', {}).get('name', '')} (aggiornato {doc.get('lastupdated', '')})"
    if meta["source_id"] == "worldbank.icp":
        cid, label, unit, _u = spec
        rec = indicator(meta, cid, label, unit, by, section="prezzi", topic="livello dei prezzi", definition=ICP_DEF,
                        statistic="index", nature="reported", frequency="anni di riferimento ICP", dataset=dataset,
                        keywords="costo della vita prezzi caro cost of living price level", digits=0,
                        order=20 + list(series).index(code), locator="source.data", text="World Bank ICP")
    else:
        cid, label, unit, unit_local, section, topic, stat, nature, digits, order, definition, kw = spec
        rec = indicator(meta, cid, label, unit, by, section=section, topic=topic, definition=definition, statistic=stat,
                        nature=nature, frequency="annuale", dataset=dataset, keywords=kw, digits=digits, order=order,
                        locator="source.data", text="World Bank FAO", unit_local=unit_local)
    if rec:
        yield rec
