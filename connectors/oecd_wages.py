"""OECD — AVERAGE ANNUAL WAGES (2026-10-04, completion): the average annual GROSS wage per full-time-equivalent
dependent employee, from national accounts (total wage bill ÷ full-time-equivalent employees), for the OECD members
and accession countries. Two series per country: in the country's own currency at current prices (the currency is the
one the OECD states, e.g. EUR, JPY, USD), and in US dollars at purchasing power parities, constant prices (the one the
OECD publishes to compare countries). Gross = before income tax and the employee's social contributions (OECD
definition); annual; per full-time-equivalent employee (not per person, not per household).

Licence: OECD Terms and Conditions §3 "Data": "you can extract from, download, copy, adapt, print, distribute, share and
embed Data for any purpose, even for commercial use" with attribution (verified 2026-10-04). SDMX REST, no key."""

import csv
import io

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = ("https://sdmx.oecd.org/public/rest/data/OECD.ELS.SAE,DSD_EARNINGS@AV_AN_WAGE,1.0/all"
       "?startPeriod=2010&format=csvfilewithlabels")
DEFINITION = ("Retribuzione LORDA (prima delle imposte sul reddito e dei contributi a carico del lavoratore) media ANNUA per "
              "dipendente equivalente a tempo pieno: monte salari dei conti nazionali diviso per i dipendenti equivalenti a "
              "tempo pieno (OECD). Non è il reddito di una famiglia né lo stipendio netto")


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "oecd_av_an_wage.csv")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    nat, ppp, units, base = {}, {}, {}, None
    for r in rows:
        c = ISO3_TO_2.get(r.get("REF_AREA") or "")
        if not c or r.get("OBS_VALUE") in (None, "") or r.get("MEASURE") != "WG" or r.get("AGGREGATION_OPERATION") != "MEAN":
            continue
        v, t, unit = float(r["OBS_VALUE"]), r["TIME_PERIOD"], r.get("UNIT_MEASURE")
        flag = "stima" if r.get("OBS_STATUS") == "E" else None
        if unit == "USD_PPP" and r.get("PRICE_BASE") == "Q":
            ppp.setdefault(c, []).append((t, v, flag))
            base = r.get("BASE_PER") or base
        elif unit and unit != "USD_PPP" and r.get("PRICE_BASE") == "V":
            # current prices in the country's own currency (as the OECD states it for this country)
            if units.setdefault(c, unit) != unit:
                continue
            nat.setdefault(c, []).append((t, v, flag))
    dataset = "OECD Average annual wages (DSD_EARNINGS@AV_AN_WAGE)"
    rec = indicator(meta, "oecd.wage.gross_annual", "Retribuzione lorda media annua per dipendente a tempo pieno",
                    "valuta nazionale all'anno, prezzi correnti", nat, section="vivere", topic="stipendi",
                    definition=DEFINITION, statistic="level", nature="reported", frequency="annuale", dataset=dataset,
                    keywords="salary salario stipendio stipendi wage wages lordo gross retribuzione media annua average",
                    digits=0, order=-20, locator="csv", text="OECD",
                    unit_of={c: f"{u} all'anno (lordo, prezzi correnti)" for c, u in units.items()})
    if rec:
        yield rec
    rec = indicator(meta, "oecd.wage.gross_annual_ppp", "Retribuzione lorda media annua in dollari PPA (per confronti)",
                    f"$ USA a parità di potere d'acquisto, prezzi costanti {base or ''}".strip(), ppp, section="vivere",
                    topic="stipendi", definition=DEFINITION + ". Convertita dall'OECD in dollari a parità di potere d'acquisto e a "
                    "prezzi costanti: serve a confrontare Paesi e anni, non è una somma pagata in dollari",
                    statistic="level", nature="reported", frequency="annuale", dataset=dataset,
                    keywords="salary wage ppp potere d'acquisto confronto", digits=0, order=-19, locator="csv", text="OECD")
    if rec:
        yield rec
