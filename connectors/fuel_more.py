"""More national fuel prices from official open-data publishers (2026-10-04, completion; research of 2026-10-04).
Values in the publisher's currency; a price published in cents per litre is said in units per litre (÷ 100, said in
the definition) — never converted between currencies, never estimated.

  nz.mbie_fuel     New Zealand, MBIE weekly fuel price monitoring — CC BY 3.0 NZ. "Board price": the weekly average of
                   the advertised pump prices in Auckland, Hamilton, Wellington and Christchurch (main ports), taxes
                   included; the latest weeks can be provisional (MBIE). NZD/l.
  au.aps_fuel      Australia, Australian Petroleum Statistics (DCCEEW, data.gov.au) — CC BY 4.0 (stated in the file).
                   Quarterly national average retail prices, weighted by state and territory sales. AUD/l.
  ua.ukrstat_fuel  Ukraine, State Statistics Service (data.gov.ua) — CC BY. Monthly national average consumer prices
                   (compiled for the consumer price index; occupied territories excluded since 2022). UAH/l."""

import csv
import datetime as dt
import io
import json

from connectors.fuel_common import fuel
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
NZ = "https://www.mbie.govt.nz/assets/Data-Files/Energy/Weekly-fuel-price-monitoring/weekly-table.csv"
AU_PKG = "https://data.gov.au/data/api/3/action/package_show?id=australian-petroleum-statistics"
UA = ("https://data.gov.ua/dataset/12f4fe34-0759-4271-b1f6-780995f0ec4a/resource/9d4280b1-20ce-4aae-a005-24e4b9b7e32c/"
      "download/df_price_change_consumer_goods_service_latest.json")


def describe():
    return {"connector_version": VERSION, "produces": ["observation.fuel_price"]}


def plan(mode, state, source, today=None):
    if source.id == "nz.mbie_fuel":
        return [FetchRequest(NZ, "mbie_weekly_table.csv")]
    if source.id == "ua.ukrstat_fuel":
        return [FetchRequest(UA, "ukrstat_avg_consumer_prices.json")]
    reqs = [FetchRequest(AU_PKG, "aps_package.json")]
    if (state or {}).get("asset"):
        reqs.append(FetchRequest(state["asset"], "aps_" + state["asset"].rsplit("/", 1)[-1]))
    return reqs


def page_info(data):
    """Australia: the CURRENT extract of the Australian Petroleum Statistics (its file name changes every month)."""
    try:
        doc = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        return None
    for r in ((doc.get("result") or {}).get("resources") or []) if isinstance(doc, dict) else []:
        if str(r.get("url", "")).endswith(".xlsx") and r["url"].startswith("https://data.gov.au/"):
            return {"asset": r["url"]}
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
    if sid == "nz.mbie_fuel":
        names = {"Regular Petrol": ("petrol", "benzina normale (91 ottani)"), "Diesel": ("diesel", "gasolio")}
        pts = {k: [] for k in names}
        for r in csv.DictReader(io.StringIO(data.decode("utf-8-sig"))):
            if r.get("Variable") != "Board price" or r.get("Fuel") not in names or r.get("Unit") != "NZD c/L":
                continue
            end = dt.date.fromisoformat(r["Date"])
            pts[r["Fuel"]].append([(end - dt.timedelta(days=6)).isoformat(), end.isoformat(), float(r["Value"]) / 100])
        for k, (ft, what) in names.items():
            rec = fuel(meta, "NZ", ft, pts[k], unit="NZD/l", currency="NZD", frequency="settimanale", area="media dei 4 porti principali",
                       definition=f"Prezzo alla pompa pubblicizzato ({what}), media settimanale di Auckland, Hamilton, Wellington e "
                                  "Christchurch, tasse incluse (MBIE \"Board price\"); pubblicato in centesimi di NZD per litro, diviso per "
                                  "100. Le ultime settimane possono essere provvisorie e venire riviste da MBIE",
                       dataset="MBIE — Weekly fuel price monitoring (weekly-table.csv)", text="New Zealand Nuova Zelanda fuel petrol diesel")
            if rec:
                yield rec
    elif sid == "au.aps_fuel":
        if not data.startswith(b"PK"):            # the catalogue's answer (where the current extract is), not the extract
            return
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        if "Australian fuel prices" not in wb.sheetnames:
            return
        rows = list(wb["Australian fuel prices"].iter_rows(values_only=True))
        head = [str(h or "") for h in rows[0]]
        cols = {"petrol": next(i for i, h in enumerate(head) if h.startswith("Regular unleaded petrol")),
                "diesel": next(i for i, h in enumerate(head) if h.startswith("Automotive diesel"))}
        for ft, j in cols.items():
            pts = []
            for r in rows[1:]:
                if not r or r[0] is None or r[j] is None or not str(r[1] or "").startswith("Q"):
                    continue
                y, q = int(str(r[0])[:4]), int(str(r[1])[1])
                a, _ = _month(y, 3 * q - 2)
                _, b = _month(y, 3 * q)
                pts.append([a, b, float(r[j]) / 100])
            rec = fuel(meta, "AU", ft, pts, unit="AUD/l", currency="AUD", frequency="trimestrale",
                       definition=("Prezzo medio nazionale al consumo della benzina senza piombo normale (91 RON)" if ft == "petrol" else
                                   "Prezzo medio nazionale al consumo del gasolio per autotrazione") +
                                  ", media trimestrale ponderata con le vendite di Stati e territori (Australian Petroleum Statistics); "
                                  "pubblicato in centesimi di AUD per litro, diviso per 100",
                       dataset="Australian Petroleum Statistics, Commonwealth of Australia — foglio \"Australian fuel prices\"",
                       text="Australia fuel petrol diesel")
            if rec:
                yield rec
    elif sid == "ua.ukrstat_fuel":
        doc = json.loads(data.decode("utf-8"))
        d = doc.get("data", doc)
        st = d["structures"][0]
        sdims = st["dimensions"]["series"]
        ids = [[v["id"] for v in dim["values"]] for dim in sdims]
        names = [dim["id"] for dim in sdims]
        times = [v.get("id") or v.get("value") for v in st["dimensions"]["observation"][0]["values"]]
        want = {"07_2_2_269": ("petrol", "benzina A-95"), "07_2_2_270": ("diesel", "gasolio")}
        for key, s in (d["dataSets"][0].get("series") or {}).items():
            k = dict(zip(names, (ids[i][int(x)] for i, x in enumerate(key.split(":")))))
            g = k.get("GOODS_SERVICES_TYPE")
            if k.get("INDICATOR") != "AVG_CONS_PRCS" or g not in want or k.get("REGION") != "UA00000000000000000" or k.get("FREQ") != "M":
                continue
            pts = []
            for ti, v in (s.get("observations") or {}).items():
                t = times[int(ti)]
                if v and v[0] is not None and "-M" in t:
                    a, b = _month(int(t[:4]), int(t.split("-M")[1]))
                    pts.append([a, b, float(v[0])])
            ft, what = want[g]
            rec = fuel(meta, "UA", ft, pts, unit="UAH/l", currency="UAH", frequency="mensile",
                       definition=f"Prezzo medio nazionale al consumo ({what}), rilevato per l'indice dei prezzi al consumo dal Servizio "
                                  "statistico di Stato; dal 2022 esclusi i territori occupati",
                       dataset="Derzhstat — Середні споживчі ціни (data.gov.ua)", text="Ukraine Ucraina fuel petrol diesel")
            if rec:
                yield rec
