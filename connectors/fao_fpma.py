"""FAO GIEWS FPMA — Food Price Monitoring and Analysis: NATIONAL AVERAGE RETAIL prices of staple foods (bread, rice,
wheat flour, milk, eggs, cooking oil) per country (World Intelligence, 2026-10-03). Licence: FAO Statistical Database
Terms of Use — FPMA is listed among the databases under CC BY 4.0 ("You may access, download, create copies, adapt and
re-disseminate datasets"); third-party series keep their original source, named on every value (dual attribution:
"FAO GIEWS FPMA; fonte originale: …"). No key (public API; its schema is pinned by the tests).

Only series FPMA marks as a NATIONAL AVERAGE of RETAIL prices are kept: a capital-city or single-market price is never
shown as the country's price. Units and currencies are the source's own (e.g. "1 kg", "750-800 gms", "1 dozen"):
nothing is converted. One series per country and staple: the one with the most recent data.
A price answer names its series only by id: the SELECTION of series (with their country, commodity, unit, currency and
original source) is a curated file of this repository, connectors/fpma_series.json, made from the FPMA catalogue by
select() and dated; the connector asks the prices of those series (one request per staple)."""

import json
import pathlib
import sys

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
API = "https://fpma.fao.org/giews/v4/global/price_module/api/v1/"
# staple → (code, label, keywords, order, matcher on the FPMA commodity name)
STAPLES = {
    "bread": ("food.bread", "Pane", "bread pane", 0, lambda n: n.startswith("bread")),
    "rice": ("food.rice", "Riso", "rice riso", 1, lambda n: n.startswith("rice")),
    "flour": ("food.wheat_flour", "Farina di frumento", "flour farina wheat", 2, lambda n: n.startswith("wheat (flour")),
    "milk": ("food.milk", "Latte", "milk latte", 3, lambda n: n.startswith("milk")),
    "eggs": ("food.eggs", "Uova", "eggs uova", 4, lambda n: n.startswith("eggs")),
    "oil": ("food.cooking_oil", "Olio alimentare", "oil olio cooking oil vegetable oil", 5,
            lambda n: n.startswith(("vegetable oil", "sunflower oil", "soybean oil", "palm oil", "cooking oil", "oil (vegetable"))),
}


def _national(s):
    mt, mn = (s.get("market_type") or "").lower(), (s.get("market_name") or "").lower()
    return s.get("price_type") == "RETAIL" and "capital" not in mt and ("national" in mt or mn == "national average")


def _staple(s):
    n = (s.get("commodity_name") or "").lower()
    return next((k for k, v in STAPLES.items() if v[4](n)), None)


def select(doc):
    """The series kept: per country and staple, the national-average retail series with the latest end date."""
    best = {}
    for s in doc.get("results") or []:
        c = ISO3_TO_2.get(s.get("iso3_country_code") or "")
        k = _staple(s)
        if not c or not k or not _national(s):
            continue
        end = max((p.get("end_date") or "" for p in s.get("periodicity") or []), default="")
        key = (c, k)
        if key not in best or end > best[key][0]:
            best[key] = (end, s)
    out = {}
    for (c, k), (end, s) in sorted(best.items()):
        out[s["uuid"]] = {"c": c, "k": k, "commodity": s.get("commodity_name"), "market": s.get("market_name"),
                          "unit": s.get("measure_unit_label"), "currency": s.get("currency"), "source": s.get("source_name"),
                          "end": end}
    return out


SELECTION = pathlib.Path(__file__).with_name("fpma_series.json")


def _selection():
    return json.loads(SELECTION.read_text(encoding="utf-8"))["series"]


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    series = _selection()
    reqs = []
    for k in STAPLES:                                     # one request per staple: one indicator per staple
        ids = sorted(u for u, x in series.items() if x["k"] == k)
        if ids:
            reqs.append(FetchRequest(API + "FpmaSeriePrice/?uuid__in=" + ",".join(ids), f"fpma_prices_{k}.json"))
    return reqs


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    if "uuid__in=" not in (meta.get("url") or ""):
        return
    series = _selection()
    by = {k: {} for k in STAPLES}
    notes = {k: {} for k in STAPLES}
    for r in doc.get("results") or []:
        s = series.get(r.get("uuid"))
        if not s:
            continue
        pts = [(p["date"][:7], p["price_value"], f"{s['source']} · {s['commodity']} · {s['unit']} · {s['currency']}")
               for p in r.get("datapoints") or [] if p.get("price_value") is not None and p.get("periodicity") == "monthly"]
        if pts:
            by[s["k"]][s["c"]] = pts
    for k, (code, label, kw, order, _m) in STAPLES.items():
        if not by[k]:
            continue
        rec = indicator(meta, code, f"{label} · prezzo al dettaglio (media nazionale)",
                        "valuta e unità della fonte (vedi pubblicazione)", by[k], section="prezzi", topic="beni essenziali",
                        definition=f"{label}: prezzo medio nazionale al dettaglio pubblicato in FAO GIEWS FPMA, nella valuta e nell'unità della fonte originale (indicate su ogni valore). Mai il prezzo di una sola città",
                        statistic="price", nature="reported", frequency="mensile", dataset="FAO GIEWS FPMA (Food Price Monitoring and Analysis)",
                        keywords=f"{kw} food cibo prezzi prices cost of living costo della vita", digits=2, order=order,
                        locator="$.results", text="FAO FPMA")
        if rec:
            yield rec


if __name__ == "__main__":      # regenerate the curated selection from a downloaded FPMA catalogue (FpmaSerieDomestic)
    doc = json.load(open(sys.argv[1], encoding="utf-8"))
    SELECTION.write_text(json.dumps({"_comment": json.loads(SELECTION.read_text())["_comment"], "selected_on": sys.argv[2] if len(sys.argv) > 2 else "",
                                     "series": select(doc)}, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
