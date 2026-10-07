"""COMMODITY PRICES (OSIRIS baseline, 2026-10-04: the markets panel's oil, gas, metals and grains), published as one
table (GET /tables/commodities) read by the markets panel:

  EIA spot prices (U.S. Energy Information Administration, public domain): Brent and WTI crude, DAILY, the last 90
      trading days — the agency's own history pages (no key).
  World Bank Commodity Price Data ("Pink Sheet", CC BY 4.0): MONTHLY average prices of energy, metals and food
      commodities, the last 36 months. The monthly file's address changes every month: it is read from the World Bank
      commodity-markets page (the page first, then the file, in the same run).

Equity indices, single stocks and futures are not here: their data are licensed by the exchanges (no free public
licence) — said in the panel."""

import datetime as dt
import io
import re

import openpyxl

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
EIA = {"brent": "https://www.eia.gov/dnav/pet/hist/RBRTED.htm", "wti": "https://www.eia.gov/dnav/pet/hist/RWTCD.htm"}
WB_PAGE = "https://www.worldbank.org/en/research/commodity-markets"
WB_FILE = re.compile(r"https://thedocs\.worldbank\.org/[^\"'\s]*CMO-Historical-Data-Monthly\.xlsx")
MONTHLY = ["Crude oil, Brent", "Crude oil, WTI", "Natural gas, Europe", "Natural gas, US", "Liquefied natural gas, Japan",
           "Coal, Australian", "Gold", "Silver", "Copper", "Aluminum", "Iron ore, cfr spot", "Nickel", "Wheat, US HRW",
           "Maize", "Rice, Thai 5%", "Soybeans", "Coffee, Arabica", "Sugar, world", "Urea", "Palm oil"]
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    reqs = [FetchRequest(u, f"eia_{k}") for k, u in EIA.items()] + [FetchRequest(WB_PAGE, "wb_page")]
    if state.get("cmo_url"):
        reqs.append(FetchRequest(state["cmo_url"], "wb_cmo_monthly"))
    return reqs


def page_info(data: bytes):
    """The current monthly file's address, when the page is the World Bank commodity-markets page."""
    m = WB_FILE.search(data[:2_000_000].decode("utf-8", errors="replace")) if data[:1] == b"<" or b"<html" in data[:2000].lower() else None
    return {"cmo_url": m.group(0)} if m else None


def next_state(state, request, result, today=None):
    if request.resource_key == "wb_page" and result and result.get("cmo_url"):
        return {**(state or {}), "cmo_url": result["cmo_url"]}
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def eia_daily(html):
    """[(date ISO, value)] of an EIA daily history page: one row per week (Monday's date), five daily cells."""
    out = []
    for row in re.findall(r"<tr>\s*<td class='B6'>(.*?)</tr>", html, re.S):
        m = re.search(r"(\d{4})\s+([A-Z][a-z]{2})-\s?(\d{1,2})", row)
        if not m:
            continue
        monday = dt.date(int(m.group(1)), MONTHS[m.group(2)], int(m.group(3)))
        for i, v in enumerate(re.findall(r"<td class='B3'>([^<]*)</td>", row)[:5]):
            try:
                out.append(((monday + dt.timedelta(days=i)).isoformat(), float(v)))
            except ValueError:
                continue
    return out


def table(payloads):
    latest = {}
    for key, data, fetched, url in payloads:
        if key not in latest or fetched > latest[key][0]:
            latest[key] = (fetched, data)
    rows, notes = [], {}
    for k in EIA:
        if f"eia_{k}" in latest:
            series = eia_daily(latest[f"eia_{k}"][1].decode("utf-8", errors="replace"))[-90:]
            name = "Crude oil, Brent" if k == "brent" else "Crude oil, WTI"
            rows += [[name, "$/bbl", "daily", d, v, "EIA"] for d, v in series]
    if "wb_cmo_monthly" in latest:
        wb = openpyxl.load_workbook(io.BytesIO(latest["wb_cmo_monthly"][1]), read_only=True, data_only=True)
        ws = wb["Monthly Prices"]
        grid = list(ws.iter_rows(values_only=True))
        notes["pink_sheet"] = str(grid[3][0] or "")
        head = next(i for i, r in enumerate(grid) if r and r[1] and "Crude oil" in str(r[1]))
        names, units = grid[head], grid[head + 1]
        data_rows = [r for r in grid[head + 2:] if r and isinstance(r[0], str) and re.match(r"\d{4}M\d{2}", r[0])][-36:]
        for j, n in enumerate(names):
            label = str(n or "").replace(" **", "").replace(" *", "").strip()
            if label not in MONTHLY:
                continue
            for r in data_rows:
                v = r[j]
                if isinstance(v, (int, float)):
                    rows.append([label, str(units[j] or "").strip("()"), "monthly", f"{r[0][:4]}-{r[0][5:7]}", round(float(v), 4), "World Bank"])
    return {"fields": ["series", "unit", "frequency", "period", "value", "source"], "rows": rows, "notes": notes}
