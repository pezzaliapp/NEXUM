"""ILOSTAT (International Labour Organization) — EARNINGS and MINIMUM WAGES per country (World Intelligence,
2026-10-03): mean and median monthly earnings of employees (all sexes, all activities) and the statutory monthly
minimum wage, in national currency and in 2021 PPP international dollars. Licence CC BY 4.0 (ILO policy: "As of 3 May
2023, databases and datasets … are covered by the Creative Commons CC BY 4.0 licence"). Bulk CSV, no key.

Honesty rules: a country can have several survey/administrative sources whose series break (e.g. Italy: labour
force survey until 2020, EU-SILC from 2021): ONE source per country — the one with the most recent year (then the
longest) — is kept, never spliced with another; its readable name and notes are kept on every value. Earnings are not
GDP per capita and GDP per capita is never shown as a salary.

INTEGRITY GATE (2026-10-04, Italy golden test): the ILOSTAT earnings series ("Average/Median monthly earnings of
employees") mix source types per country — labour force surveys, household income surveys (EU-SILC, processed by the
ILO from microdata), establishment surveys, administrative records — and do not state per country whether the value is
gross or net, nor how a monthly value is derived from annual income. Example: Italy 3,534 EUR (EU-SILC 2025 wave,
whose incomes refer to the previous year) vs Eurostat nama_10_fte 2024 = 33,523 EUR/year (2,794 EUR/month): +26 %.
The values are therefore published as AMBIGUOUS (definition not verifiable, not comparable), never as "gross monthly
wage". The statutory minimum wage (administrative sources) keeps its plain definition."""

import csv
import io
import re

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "1.2.0"   # 1.2.0 (2026-10-04): the currency named where it can be (CLDR); 1.1.0 (2026-10-04, integrity gate): readable source per value; earnings marked AMBIGUOUS
BASE = "https://rplumber.ilo.org/data/indicator/?id={}&timefrom=2010&type=both&format=.csv"
# dataset → [(classif1, code, label, unit, digits, keywords, definition, order)]
SETS = {
    "EAR_EMTA_SEX_CUR_NB_A": [
        ("CUR_TYPE_LCU", "ilo.earnings.mean", "Retribuzione mensile media dei dipendenti (ILOSTAT)", "valuta nazionale al mese", 0,
         "salary salari stipendio stipendi wage wages earnings retribuzione reddito da lavoro",
         "Retribuzione mensile media dei lavoratori dipendenti, tutte le attività (ILO). Definizione e fonte nazionali (indagini, registri): confronti tra Paesi con cautela", 0),
        ("CUR_TYPE_PPP", "ilo.earnings.mean_ppp", "Retribuzione mensile media dei dipendenti in dollari PPA (ILOSTAT)", "$ internazionali PPA 2021 al mese", 0,
         "salary salari stipendio wage earnings ppp potere d'acquisto",
         "La stessa media convertita in dollari internazionali PPA 2021 dall'ILO; stessi limiti di definizione: dato AMBIGUO", 1)],
    "EAR_EMTM_SEX_CUR_NB_A": [
        ("CUR_TYPE_LCU", "ilo.earnings.median", "Retribuzione mensile mediana dei dipendenti (ILOSTAT)", "valuta nazionale al mese", 0,
         "median salary salario mediano stipendio wage",
         "Retribuzione mensile mediana dei lavoratori dipendenti: metà guadagna di meno, metà di più (ILO)", 2),
        ("CUR_TYPE_PPP", "ilo.earnings.median_ppp", "Retribuzione mensile mediana in dollari PPA (ILOSTAT)", "$ internazionali PPA 2021 al mese", 0,
         "median salary ppp", "La mediana convertita in dollari PPA 2021 dall'ILO; dato AMBIGUO", 3)],
    "EAR_INEE_CUR_NB_A": [
        ("CUR_TYPE_LCU", "ilo.minimum_wage", "Salario minimo legale mensile", "valuta nazionale al mese", 0,
         "minimum wage salario minimo", "Salario minimo mensile stabilito per legge o contratto nazionale (ILO). Dove non esiste un minimo legale il dato manca", 4),
        ("CUR_TYPE_PPP", "ilo.minimum_wage_ppp", "Salario minimo mensile in dollari PPA", "$ internazionali PPA 2021 al mese", 0,
         "minimum wage ppp", "Salario minimo mensile in dollari internazionali PPA 2021 (ILO)", 5)],
}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(BASE.format(ds) + ("&sex=SEX_T" if "_SEX_" in ds else ""), f"ilostat_v2_{ds}.csv") for ds in SETS]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    url = meta.get("url") or ""
    ds = next((k for k in SETS if f"id={k}&" in url), None)
    if not ds:
        return
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    # per country: its sources, each with its points per currency type
    by = {}
    first = {}
    for n, r in enumerate(rows, start=2):
        c = ISO3_TO_2.get(r.get("ref_area") or "")
        if not c or r.get("obs_value") in (None, "") or (r.get("sex") and r["sex"] != "SEX_T"):
            continue
        src = r.get("source.label") or r["source"]
        note = " · ".join(x for x in (src, r.get("note_indicator.label"), r.get("note_source.label")) if x)
        if "Income and Living Conditions" in src:
            note += " · anno dell'indagine EU-SILC: i redditi si riferiscono all'anno precedente"
        by.setdefault(c, {}).setdefault(r["source"], {}).setdefault(r.get("classif1"), []).append((r["time"], float(r["obs_value"]), note))
        first.setdefault(r.get("classif1"), n)
    for cur, code, label, unit, digits, kw, definition, order in SETS[ds]:
        values, units = {}, {}
        for c, sources in by.items():
            cands = [(max(y for y, _v, _n in pts), len(pts), s, pts) for s, d in sources.items() for k, pts in d.items() if k == cur and pts]
            if not cands:
                continue
            _y, _n, src, pts = max(cands)
            values[c] = [(y, v, f"ILOSTAT — {n}") for y, v, n in pts]
            # the currency the source states for this country's series ("Currency: ITA - Euro (EUR)"), when one for all
            stated = {m.group(1) if m else None for m in (re.search(r"Currency: [^·|]*\(([A-Z]{3})\)", n) for _y, _v, n in pts)}
            if cur == "CUR_TYPE_LCU" and len(stated) == 1 and None not in stated:
                units[c] = f"{stated.pop()} al mese"
        rec = indicator(meta, code, label, unit, values, section="vivere", topic="stipendi", definition=definition,
                        statistic="level", nature="reported" if ds.startswith("EAR_INEE") else "ambiguous",
                        frequency="annuale", dataset=f"ILOSTAT {ds}",
                        keywords=kw, digits=digits, order=order, locator=f"row:{first.get(cur, 2)}",
                        note="Una sola serie per Paese (quella più recente): serie di fonti diverse non vengono unite", text="ILO ILOSTAT",
                        unit_local="{cur} al mese" if cur == "CUR_TYPE_LCU" else None, unit_of=units or None)
        if rec:
            yield rec
