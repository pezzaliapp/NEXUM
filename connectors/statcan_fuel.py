"""Statistics Canada — table 18-10-0001-01, monthly average retail prices for gasoline and fuel oil: the "Canada"
aggregate of regular unleaded gasoline and diesel at self-service stations, cents per litre, taxes included.
Licence: Statistics Canada Open Licence; "Source: Statistics Canada, Table 18-10-0001-01". Values as published."""

import calendar
import csv
import io
import zipfile

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://www150.statcan.gc.ca/n1/tbl/csv/18100001-eng.zip"
FUELS = {"Regular unleaded gasoline at self service filling stations": "petrol",
         "Diesel fuel at self service filling stations": "diesel"}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "statcan_18100001.zip")]


def next_state(state, request, result, today=None):
    return dict(state or {})


def parse(data: bytes, meta: dict):
    if data[:2] != b"PK":
        return
    z = zipfile.ZipFile(io.BytesIO(data))
    pts = {"petrol": [], "diesel": []}
    for r in csv.DictReader(io.StringIO(z.read("18100001.csv").decode("utf-8-sig"))):
        f = FUELS.get(r["Type of fuel"])
        if r["GEO"] != "Canada" or not f or not r["VALUE"] or r.get("STATUS") in ("x", "F", ".."):
            continue
        y, m = map(int, r["REF_DATE"].split("-"))
        pts[f].append([f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}", float(r["VALUE"])])
    for f, p in pts.items():
        rec = fuel(meta, "CA", f, p, unit="centesimi CAD/l", currency="CAD", frequency="mensile",
                   definition="Prezzo medio mensile al dettaglio (self-service), aggregato Canada, centesimi per litro, tasse incluse",
                   dataset="Statistics Canada, tabella 18-10-0001-01")
        if rec:
            yield rec
