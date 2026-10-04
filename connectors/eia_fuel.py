"""U.S. Energy Information Administration — weekly U.S. retail prices of regular gasoline (all formulations) and
on-highway diesel, national average, dollars per U.S. gallon, from EIA's public history tables (no API key).
"U.S. government publications are in the public domain"; "Source: U.S. Energy Information Administration".
Values as published (USD per U.S. gallon): no conversion to litres is shown as if it were the source's."""

import re

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&f=W&s="
SERIES = {"EMM_EPMR_PTE_NUS_DPG": ("petrol", "benzina regular (tutte le formulazioni)"),
          "EMD_EPD2D_PTE_NUS_DPG": ("diesel", "gasolio per autotrazione (on-highway)")}
MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(BASE + s, f"eia_{s}.html") for s in SERIES]


def next_state(state, request, result, today=None):
    return dict(state or {})


def parse(data: bytes, meta: dict):
    s = meta["url"].rsplit("s=", 1)[-1]
    if s not in SERIES:
        return
    html = data.decode("utf-8", "replace")
    pts = []
    for y, mon, body in re.findall(r"<td class='B6'>(?:&nbsp;)*(\d{4})-(\w{3})</td>(.*?)</tr>", html, re.S):
        for md, val in re.findall(r"<td class='B5'>(\d{2}/\d{2})&nbsp;</td>\s*<td class='B3'>([\d.]+)", body):
            m, d = md.split("/")
            day = f"{int(y):04d}-{m}-{d}"
            pts.append([day, day, float(val)])
    fuel_type, what = SERIES[s]
    rec = fuel(meta, "US", fuel_type, pts, unit="USD/gallone USA", currency="USD", frequency="settimanale",
               definition=f"Prezzo medio al dettaglio negli Stati Uniti, {what}, dollari per gallone USA (3,785 l), tasse incluse",
               dataset=f"U.S. EIA — serie {s}")
    if rec:
        yield rec
