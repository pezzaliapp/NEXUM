"""Eurostat — COST OF LIVING AND RESOURCES (2026-10-04, completion): what a person earns and spends, as Eurostat
publishes it for the EU, EFTA and candidate countries, each series with its own explicit definition:

  earn_nt_net   annual NET and GROSS earnings of a single person without children earning the average wage (EUR):
                gross minus income tax and employee social contributions, plus family allowances (Eurostat tax-benefit
                calculation on the average wage) — an individual, not a household
  ilc_di03      MEDIAN EQUIVALISED NET INCOME (EUR, EU-SILC): household disposable income per equivalent adult; the
                survey of year Y measures the incomes of year Y-1 (said on every value)
  ilc_mded01    median share of housing costs in disposable household income (%)
  ilc_lvho07a   housing cost overburden rate: people living in households spending more than 40 % of their disposable
                income on housing (%)
  nrg_pc_204    household ELECTRICITY price, band DC (2,500–4,999 kWh a year), all taxes and levies (EUR/kWh, half-yearly)
  nrg_pc_202    household NATURAL GAS price, band D2 (20–199 GJ a year), all taxes and levies (EUR/kWh, half-yearly)

Licence: "Reuse of statistical data… for commercial or non-commercial purposes is authorised provided the source is
acknowledged" (Eurostat copyright notice). JSON-stat API, no key. Values as published; Eurostat flags kept."""

import json

from connectors.indicator_common import CURRENCY, indicator
from connectors.obs_common import iso
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"   # 1.1.0 (2026-10-04): national currency for states outside the euro
BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
FLAGS = {"e": "stima", "p": "provvisorio", "b": "interruzione di serie", "u": "affidabilità bassa", "d": "definizione diversa"}
SILC = "indagine EU-SILC: i redditi si riferiscono all'anno precedente l'anno dell'indagine"
# key: (dataset query, fixed dimensions, [(code, label, unit, section, topic, statistic, digits, order, definition, keywords, filter)])
SETS = {
    "earn_nt_net": (
        "earn_nt_net?format=JSON&lang=EN&ecase=P1_NCH_AW100&currency=EUR&currency=NAC&estruct=NET&estruct=GRS&sinceTimePeriod=2010",
        [("eurostat.earnings.net", "Retribuzione netta annua · persona sola con il salario medio", "EUR all'anno (netto)",
          "vivere", "stipendi", "level", 0, -18,
          "Retribuzione NETTA annua di una persona sola senza figli che guadagna il salario medio: lordo meno imposte sul reddito "
          "e contributi a carico del lavoratore, più eventuali assegni familiari (calcolo Eurostat sul salario medio nazionale). "
          "Riguarda una persona, non una famiglia",
          "salario netto stipendio netto net earnings take-home pay", {"estruct": "NET"}),
         ("eurostat.earnings.gross", "Retribuzione lorda annua · persona sola con il salario medio", "EUR all'anno (lordo)",
          "vivere", "stipendi", "level", 0, -17,
          "Retribuzione LORDA annua del salario medio usato da Eurostat per il calcolo del netto (stessa persona e stesso anno "
          "del valore netto)", "salario lordo gross earnings", {"estruct": "GRS"})]),
    "ilc_di03": (
        "ilc_di03?format=JSON&lang=EN&age=TOTAL&sex=T&statinfo=MED_EI&unit=EUR&unit=NAC&sinceTimePeriod=2010",
        [("eurostat.income.median_equivalised", "Reddito netto mediano equivalente (famiglie)", "EUR all'anno per adulto equivalente",
          "vivere", "redditi", "level", 0, -16,
          "Reddito disponibile NETTO della famiglia diviso per i suoi adulti equivalenti (scala OCSE modificata); metà della "
          "popolazione vive in famiglie con un reddito più basso. " + SILC,
          "reddito famiglie disposable income household median", {})]),
    "ilc_mded01": (
        "ilc_mded01?format=JSON&lang=EN&hhcomp=TOTAL&rskpovth=TOTAL&unit=PC&sinceTimePeriod=2010",
        [("eurostat.housing.cost_share", "Quota del reddito familiare spesa per l'abitazione (mediana)", "% del reddito disponibile",
          "abitazione", "costi dell'abitazione", "share", 1, 0,
          "Costi dell'abitazione (affitto o interessi del mutuo, condominio, acqua, energia, manutenzione) in percentuale del "
          "reddito disponibile della famiglia, valore mediano. " + SILC,
          "casa abitazione affitto rent housing cost mutuo", {})]),
    "ilc_lvho07a": (
        "ilc_lvho07a?format=JSON&lang=EN&age=TOTAL&sex=T&rskpovth=TOTAL&unit=PC&sinceTimePeriod=2010",
        [("eurostat.housing.overburden", "Persone con costi dell'abitazione oltre il 40 % del reddito", "% della popolazione",
          "abitazione", "costi dell'abitazione", "share", 1, 1,
          "Quota della popolazione che vive in famiglie i cui costi dell'abitazione superano il 40 % del reddito disponibile "
          "(definizione Eurostat di sovraccarico). " + SILC,
          "casa abitazione affitto housing overburden", {})]),
    "nrg_pc_204": (
        "nrg_pc_204?format=JSON&lang=EN&nrg_cons=KWH2500-4999&tax=I_TAX&currency=EUR&currency=NAC&unit=KWH&sinceTimePeriod=2015-S1",
        [("eurostat.price.electricity_household", "Elettricità per le famiglie · prezzo con tasse", "EUR/kWh",
          "prezzi", "energia per la casa", "price", 4, 10,
          "Prezzo medio dell'elettricità pagato dalle famiglie con consumo annuo tra 2.500 e 4.999 kWh (fascia DC), tutte le "
          "tasse e gli oneri inclusi, media del semestre (Eurostat)",
          "bolletta luce elettricità electricity price household energia casa", {})]),
    "nrg_pc_202": (
        "nrg_pc_202?format=JSON&lang=EN&nrg_cons=GJ20-199&tax=I_TAX&currency=EUR&currency=NAC&unit=KWH&sinceTimePeriod=2015-S1",
        [("eurostat.price.gas_household", "Gas naturale per le famiglie · prezzo con tasse", "EUR/kWh",
          "prezzi", "energia per la casa", "price", 4, 11,
          "Prezzo medio del gas naturale pagato dalle famiglie con consumo annuo tra 20 e 199 GJ (fascia D2), tutte le tasse e "
          "gli oneri inclusi, media del semestre (Eurostat)",
          "bolletta gas metano natural gas price household riscaldamento", {})]),
}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(BASE + q, f"eurostat_living_{k}.json") for k, (q, _s) in SETS.items()]


def next_state(state, request, result, today=None):
    return state


def _cells(d):
    """{(dim values except geo/time…), geo, time: value, flag} of a JSON-stat answer."""
    dims, size = d["id"], d["size"]
    idx = {k: {pos: code for code, pos in d["dimension"][k]["category"]["index"].items()} for k in dims}
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * size[i + 1]
    for k, v in d["value"].items():
        n, coord = int(k), {}
        for i, dim in enumerate(dims):
            coord[dim] = idx[dim][(n // strides[i]) % size[i]]
        yield coord, v, (d.get("status") or {}).get(k)


def parse(data: bytes, meta: dict):
    url = meta.get("url") or ""
    key = next((k for k, (q, _s) in SETS.items() if f"/data/{q.split('?')[0]}?" in url), None)
    if not key:
        return
    d = json.loads(data.decode("utf-8"))
    cells = list(_cells(d))
    # THE COUNTRY'S OWN CURRENCY (2026-10-04): Eurostat publishes these amounts in EUR (converted by Eurostat for the
    # states outside the euro) and in national currency (NAC). A euro state: EUR. Another state: its national currency,
    # named when it had one legal tender for the whole series (CLDR); otherwise Eurostat's EUR values stay, said so.
    money = "currency" in d["id"] or ("unit" in d["id"] and "NAC" in d["dimension"]["unit"]["category"]["index"])
    mdim = "currency" if "currency" in d["id"] else "unit"
    for code, label, unit, section, topic, stat, digits, order, definition, kw, filt in SETS[key][1]:
        by, units = {}, {}
        series = {}
        for coord, v, flag in cells:
            if any(coord.get(k) != val for k, val in filt.items()) or v is None:
                continue
            c = iso(coord["geo"])
            if not c:
                continue
            series.setdefault((c, coord.get(mdim) if money else None), []).append((coord, v, flag))
        pick = {}
        for (c, cur), rows in series.items():
            if not money:
                pick[c] = rows
                continue
            legal = CURRENCY.get(c)
            first = min(int(str(r[0]["time"])[:4]) for r in rows)
            latest = lambda cc: max((str(r[0]["time"]) for r in series.get((c, cc), [])), default="")   # noqa: E731
            nac_ok = legal and legal[0] != "EUR" and (first > int(legal[1][:4]) or (first == int(legal[1][:4]) and legal[1][5:] == "01-01")) \
                and latest("NAC") >= latest("EUR")   # the national-currency series only when it is as recent as the EUR one
            if (cur == "EUR" and (not legal or legal[0] == "EUR" or not nac_ok)) or (cur == "NAC" and nac_ok):
                pick[c] = rows
                if cur == "NAC":
                    units[c] = unit.replace("EUR", legal[0], 1)
                elif legal and legal[0] != "EUR":
                    units[c] = unit.replace("EUR", "EUR (convertiti da Eurostat)", 1)
        for c, rows in pick.items():
            for coord, v, flag in rows:
                note = FLAGS.get(flag, flag) if flag else None
                if key.startswith("ilc_"):
                    note = f"{note} · {SILC}" if note else SILC
                by.setdefault(c, []).append((coord["time"], v, note))
        rec = indicator(meta, code, label, unit, by, section=section, topic=topic, definition=definition, statistic=stat,
                        nature="reported", frequency="semestrale" if key.startswith("nrg_") else "annuale",
                        dataset=f"Eurostat {key} (aggiornato {str(d.get('updated', ''))[:10]})", keywords=kw, digits=digits,
                        order=order, locator=key, text="Eurostat", unit_of=units or None)
        if rec:
            yield rec
