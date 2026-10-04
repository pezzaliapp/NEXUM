"""Malaysia — weekly retail fuel prices (data.gov.my "fuelprice", Ministry of Finance): RON95, RON97 and diesel
(Peninsular Malaysia), ringgit per litre. Licence: CC BY 4.0; "Source: data.gov.my". Only the "level" rows (the
price), never the published week-on-week change rows; the targeted/subsidised RON95 variants are not mixed in."""

import csv
import io

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://storage.data.gov.my/commodities/fuelprice.csv"
FUELS = {"ron95": "ron95", "ron97": "ron97", "diesel": "diesel"}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "mygov_fuelprice.csv")]


def next_state(state, request, result, today=None):
    return dict(state or {})


def parse(data: bytes, meta: dict):
    pts = {f: [] for f in FUELS.values()}
    for r in csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))):
        if r.get("series_type") != "level" or not r.get("date"):
            continue
        for col, f in FUELS.items():
            try:
                v = float(r.get(col) or "")
            except ValueError:
                continue
            pts[f].append([r["date"], r["date"], v])
    for f, p in pts.items():
        rec = fuel(meta, "MY", f, p, unit="MYR/l", currency="MYR", frequency="settimanale",
                   definition="Prezzo al dettaglio settimanale pubblicato dal Ministero delle Finanze (Malesia peninsulare), ringgit per litro",
                   dataset="data.gov.my — fuelprice (Ministero delle Finanze)")
        if rec:
            yield rec
