"""UK Department for Energy Security and Net Zero — weekly road fuel prices (2018 onward): average pump prices of
ULSP (petrol) and ULSD (diesel) in pence per litre, with the duty rate and the VAT rate. Licence: Open Government
Licence v3.0; "Source: Department for Energy Security and Net Zero". Values as published (pence per litre). The CSV
link changes with each release: the statistics page is read first (backfill rounds)."""

import csv
import io
import re

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
PAGE = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices"


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    reqs = [FetchRequest(PAGE, "desnz_page.html")]
    if (state or {}).get("csv"):
        reqs.append(FetchRequest(state["csv"], "desnz_weekly_2018.csv"))
    return reqs


def page_info(data):
    m = re.search(rb'href="(https://assets\.publishing\.service\.gov\.uk/media/[0-9a-f]+/CSV__2018[^"]*\.csv)"', data or b"")
    return {"csv": m.group(1).decode()} if m else None


def next_state(state, request, result, today=None):
    st = dict(state or {})
    if result and result.get("csv"):
        st["csv"] = result["csv"]
    return st


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    if data[:1] == b"<" or b"<html" in data[:200].lower():
        return
    rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    if not rows or not rows[0] or not rows[0][0].startswith("Date"):
        return
    pts = {"petrol": [], "diesel": []}
    last = None
    for r in rows[1:]:
        if len(r) < 7 or not re.match(r"\d{2}/\d{2}/\d{4}", r[0]):
            continue
        d = f"{r[0][6:10]}-{r[0][3:5]}-{r[0][0:2]}"
        for f, j in (("petrol", 1), ("diesel", 2)):
            v = _num(r[j])
            if v:
                pts[f].append([d, d, v])
        last = (d, r)
    for f, k in (("petrol", 0), ("diesel", 1)):
        taxes = None
        if last:
            d, r = last
            taxes = [x for x in (["Accisa (duty)", _num(r[3 + k]), "pence/l", d], ["IVA", _num(r[5 + k]), "%", d]) if x[1] is not None]
        rec = fuel(meta, "GB", f, pts[f], unit="pence/l", currency="GBP", frequency="settimanale",
                   definition="Prezzo medio alla pompa (ULSP benzina / ULSD gasolio), pence per litro, tasse incluse",
                   dataset="DESNZ — Weekly road fuel prices (CSV 2018–)", taxes=taxes)
        if rec:
            yield rec
