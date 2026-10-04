"""Ember — Yearly Electricity Data (global generation release, CC BY 4.0: "Ember content is released under a Creative
Commons Attribution Licence"; the file moved in July 2026 to files.ember-energy.org — the former long-format file
stopped updating on 2026-06-23). Per country and year: electricity generation (total and by source, TWh and share of
the mix), installed capacity by source (GW), demand (TWh) and net imports (TWh, no partner). Capacity, generation and shares are three different measures and stay three different indicators.
Years from 2010. Only the 193 UN member states; Ember's regional aggregates are skipped. Ember compiles national
statistics, EIA and its own estimates for the latest year: values are "reported" as Ember publishes them."""

import csv
import io

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "2.0.0"   # 2.0.0 (2026-10-03): the global generation release (wide format)
URL = "https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_yearly_global.csv"
SINCE = 2010
FUELS = {"Nuclear": ("nucleare", "nuclear"), "Solar": ("solare", "solar fotovoltaico photovoltaic pv"),
         "Wind": ("eolico", "wind vento"), "Hydro": ("idroelettrico", "hydro hydropower idroelettrica"),
         "Gas": ("gas", "gas natural gas metano"), "Coal": ("carbone", "coal lignite"),
         "Other fossil": ("petrolio e altri fossili", "oil petrolio diesel fossil"),
         "Bioenergy": ("bioenergia", "bioenergy biomassa biomass"),
         "Other renewables": ("altre rinnovabili (soprattutto geotermico)", "geothermal geotermico other renewables")}
AGG = {"Renewables": ("rinnovabili", "renewables rinnovabili"), "Fossil": ("fossili", "fossil fossili"),
       "Clean": ("basse emissioni (rinnovabili + nucleare)", "clean low carbon")}
SRC = "Ember Yearly Electricity Data (global generation release)"


def _specs():
    """(Electricity source, column) → (code, label, unit, statistic, topic, keywords, definition, order)."""
    out = {("Total generation", "Generation (TWh)"): (
        "elec.generation.total", "Produzione di elettricità", "TWh", "level", "produzione", "electricity generation produzione elettrica",
        "Elettricità generata in un anno da tutte le fonti (TWh)", 0)}
    out[("Demand", "Generation (TWh)")] = (
        "elec.demand", "Domanda di elettricità", "TWh", "level", "consumo", "electricity demand consumption consumo elettrico",
        "Domanda di elettricità: generazione più import netti (TWh)", 1)
    out[("Net imports", "Generation (TWh)")] = (
        "elec.net_imports", "Import netti di elettricità", "TWh", "level", "scambi con l'estero",
        "electricity imports exports import export saldo",
        "Import meno export di elettricità (TWh); negativo = esportatore netto. Ember non indica i Paesi partner", 3)
    for k, (fuel, (it, kw)) in enumerate(FUELS.items()):
        slug = fuel.lower().replace(" ", "_")
        out[(fuel, "Generation (TWh)")] = (
            f"elec.gen.{slug}", f"Produzione elettrica da {it}", "TWh", "level", "mix di generazione", kw,
            f"Elettricità generata da {it} in un anno (TWh)", 10 + k)
        out[(fuel, "Share of generation (%)")] = (
            f"elec.share.{slug}", f"Quota del mix elettrico: {it}", "% della generazione", "share", "mix di generazione", kw,
            f"Quota della generazione elettrica prodotta da {it}", 30 + k)
        out[(fuel, "Capacity (GW)")] = (
            f"elec.cap.{slug}", f"Capacità installata: {it}", "GW", "level", "capacità installata", kw,
            f"Potenza elettrica installata da {it} (GW); è capacità, non produzione", 50 + k)
    for k, (agg, (it, kw)) in enumerate(AGG.items()):
        out[(agg, "Share of generation (%)")] = (
            f"elec.share.{agg.lower()}", f"Quota del mix elettrico: {it}", "% della generazione", "share", "mix di generazione", kw,
            f"Quota della generazione elettrica da {it}", 20 + k)
    return out


SPECS = _specs()


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "ember_release_generation_yearly_global.csv")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    by = {k: {} for k in SPECS}
    first_row = {}
    for n, r in enumerate(csv.DictReader(io.StringIO(data.decode("utf-8"))), start=2):
        if r.get("Area type") != "Country or economy":
            continue
        c = ISO3_TO_2.get(r.get("ISO 3 code") or "")
        if not c or int(r["Year"]) < SINCE:
            continue
        for col in ("Generation (TWh)", "Share of generation (%)", "Capacity (GW)"):
            key = (r.get("Electricity source"), col)
            if key in SPECS and r.get(col) not in (None, ""):
                by[key].setdefault(c, []).append((r["Year"], float(r[col]), None))
                first_row.setdefault(key, n)
    for key, (code, label, unit, stat, topic, kw, definition, order) in SPECS.items():
        rec = indicator(meta, code, label, unit, by[key], section="energia", topic=topic, definition=definition,
                        statistic=stat, nature="reported", frequency="annuale", dataset=f"{SRC} ({key[0]} · {key[1]})",
                        keywords=kw, digits=1, order=order, locator=f"row:{first_row.get(key, 2)}",
                        allow_negative=code == "elec.net_imports",
                        text="Ember electricity elettricità energia energy")
        if rec:
            yield rec
