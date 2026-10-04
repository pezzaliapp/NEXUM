"""National fuel prices from official open-data publishers (World Intelligence, 2026-10-03; fuel gate of the discovery
report). One registry source per publisher, each with its own licence; the module serves them by source id. Values in
the publisher's unit and currency, never converted; what each value IS (observed average · regulated maximum) is
said in its definition.

  no.ssb_fuel     Statistics Norway, table 09654 — CC BY 4.0. Monthly OBSERVED national averages, NOK/l (95, diesel).
  ch.bfs_fuel     Swiss FSO, CPI average prices — "Open use, must provide the source". Monthly OBSERVED averages, CHF/l.
  uy.ancap_fuel   Uruguay, Poder Ejecutivo / ANCAP (Catálogo Nacional de Datos Abiertos) — Licencia de Datos Abiertos
                  Uruguay. Monthly MAXIMUM prices set by decree (VAT included), UYU/l; "S/C" (sin cambios) carries the
                  previous month's price forward, as the publisher's metadata defines it."""

import csv
import datetime as dt
import io
import json

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
SSB = ("https://data.ssb.no/api/pxwebapi/v2/tables/09654/data?lang=en&outputFormat=csv"
       "&valueCodes%5BTid%5D=top(160)&valueCodes%5BPetroleumProd%5D=*&valueCodes%5BContentsCode%5D=*")
BFS_SEARCH = "https://dam-api.bfs.admin.ch/hub/api/dam/assets?language=de&title=Treibstoff"
BFS_TITLE = "LIK, Durchschnittspreise für Energie und Treibstoffe, Monatswerte"
URY = ("https://catalogodatos.gub.uy/dataset/556beb30-02fc-4d06-909a-f42083c89ef7/resource/"
       "1a37fc4a-44fd-4842-bcb4-b5845dc8eced/download/datos-de-precios-de-combustibles.csv")


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    if source.id == "no.ssb_fuel":
        return [FetchRequest(SSB, "ssb_09654.csv")]
    if source.id == "uy.ancap_fuel":
        return [FetchRequest(URY, "ancap_precios_combustibles.csv")]
    reqs = [FetchRequest(BFS_SEARCH, "bfs_assets_treibstoff.json")]
    if (state or {}).get("asset"):
        reqs.append(FetchRequest(f"https://dam-api.bfs.admin.ch/hub/api/dam/assets/{state['asset']}/master",
                                 f"bfs_lik_energie_{state['asset']}.xlsx"))
    return reqs


def page_info(data):
    """Swiss FSO: the CURRENT asset of the monthly energy and fuel average prices (its id changes every month)."""
    try:
        doc = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        return None
    for a in (doc.get("data") or []) if isinstance(doc, dict) else []:
        title = ((a.get("description") or {}).get("titles") or {}).get("main") or ""
        if title.startswith(BFS_TITLE) and ((a.get("bfs") or {}).get("lifecycle") or {}).get("code") == "CURRENT":
            return {"asset": (a.get("ids") or {}).get("damId")}
    return None


def next_state(state, request, result, today=None):
    st = dict(state or {})
    if result and result.get("asset"):
        st["asset"] = result["asset"]
    return st


def _month(y, m):
    last = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
    return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last:02d}"


def parse(data: bytes, meta: dict):
    sid = meta["source_id"]
    if sid == "no.ssb_fuel":
        rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig"))))
        head = rows[0]
        names = {"031": ("petrol", "Benzina senza piombo 95 ottani"), "035": ("diesel", "Gasolio per autotrazione (tassato)")}
        for r in rows[1:]:
            if r[0] not in names:
                continue
            pts = []
            for h, v in zip(head[1:], r[1:]):
                y, m = int(h[-7:-3]), int(h[-2:])
                if v not in ("", ".", ".."):
                    pts.append([*_month(y, m), float(v)])
            ft, what = names[r[0]]
            rec = fuel(meta, "NO", ft, pts, unit="NOK/l", currency="NOK", frequency="mensile",
                       definition=f"{what}: prezzo medio nazionale osservato nel mese, imposte incluse (Statistics Norway, tabella 09654)",
                       dataset="Statistics Norway (SSB), tabella 09654", text="Norway Norvegia fuel carburanti bensin diesel")
            if rec:
                yield rec
    elif sid == "uy.ancap_fuel":
        text = data.decode("utf-8").lstrip("﻿")
        rows = list(csv.reader(io.StringIO(text), delimiter=";"))
        prods = {"SUPER 95 30-S": ("petrol", "Benzina Super 95"), "GASOIL 10-S *": ("diesel", "Gasolio 10-S")}
        series = {p: {} for p in prods}
        for r in rows[1:]:
            if len(r) < 5 or r[2] not in prods:
                continue
            # the header says Unidad;Valor but the data carry the value first, then the unit (checked 2026-10-03)
            val, unit = r[3], r[4]
            series[r[2]][(int(r[0]), int(r[1]))] = None if val == "S/C" else (float(val.replace(",", ".")), unit)
        for p, (ft, what) in prods.items():
            pts, last = [], None
            for (y, m) in sorted(series[p]):
                v = series[p][(y, m)]
                last = v if v is not None else last          # "S/C" = unchanged since the previous month
                if last is not None and last[1] == "$/lt":
                    pts.append([*_month(y, m), last[0]])
            rec = fuel(meta, "UY", ft, pts, unit="UYU/l", currency="UYU", frequency="mensile",
                       definition=f"{what}: PREZZO MASSIMO di vendita al pubblico fissato per decreto dal Poder Ejecutivo (IVA inclusa); non è una media osservata",
                       dataset="Catálogo Nacional de Datos Abiertos — Precios de Combustibles (Poder Ejecutivo / ANCAP)",
                       area="prezzo massimo nazionale", text="Uruguay combustibles fuel nafta gasoil")
            if rec:
                yield rec
    elif sid == "ch.bfs_fuel" and data[:2] == b"PK":
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = list(wb["Monat - Mois"].iter_rows(values_only=True))
        head = next(r for r in rows if r and r[0] and str(r[0]).startswith("Monat"))
        cols = {}
        for i, h in enumerate(head):
            h = str(h or "")
            if h.startswith("Bleifrei 95"):
                cols["petrol"] = (i, "Benzina senza piombo 95")
            elif h.startswith("Diesel"):
                cols["diesel"] = (i, "Gasolio")
        for ft, (i, what) in cols.items():
            pts = [[*_month(r[0].year, r[0].month), float(r[i])] for r in rows
                   if r and isinstance(r[0], dt.datetime) and i < len(r) and isinstance(r[i], (int, float))]
            rec = fuel(meta, "CH", ft, pts, unit="CHF/l", currency="CHF", frequency="mensile",
                       definition=f"{what}: prezzo medio osservato nel mese per l'indice dei prezzi al consumo (prezzi medi non appaiati, Ufficio federale di statistica)",
                       dataset="UST/BFS — LIK, Durchschnittspreise für Energie und Treibstoffe, Monatswerte", text="Schweiz Suisse Svizzera Switzerland Benzin Diesel")
            if rec:
                yield rec
