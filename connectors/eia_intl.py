"""U.S. EIA — International Energy Statistics (bulk file INTL.zip, public domain: "U.S. government publications are in
the public domain"). Per country and year: electricity imports, exports and net consumption, geothermal generation
and capacity, pumped-storage capacity, total energy production and consumption, natural gas production, consumption,
imports and exports, crude oil production, petroleum consumption. Series the EIA no longer updates (crude oil
imports/exports, refined products production) are kept as HISTORICAL: their last year is shown as it is, never as a
current value. Only the 193 UN member states; EIA regional aggregates are skipped."""

import io
import json
import zipfile

from connectors.indicator_common import ISO3_TO_2, indicator
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://www.eia.gov/opendata/bulk/INTL.zip"
SINCE = 2010
# (EIA series name, EIA unit) → (code, section, topic, label, unit, statistic, keywords, definition, order)
SERIES = {
    ("Electricity imports", "billion kilowatthours"): (
        "eia.elec.imports", "energia", "scambi con l'estero", "Import di elettricità", "TWh", "level", "electricity imports import elettricità",
        "Elettricità importata in un anno (miliardi di kWh = TWh), senza i Paesi di provenienza", 4),
    ("Electricity exports", "billion kilowatthours"): (
        "eia.elec.exports", "energia", "scambi con l'estero", "Export di elettricità", "TWh", "level", "electricity exports export elettricità",
        "Elettricità esportata in un anno (TWh), senza i Paesi di destinazione", 5),
    ("Electricity net consumption", "billion kilowatthours"): (
        "eia.elec.consumption", "energia", "consumo", "Consumo netto di elettricità", "TWh", "level", "electricity consumption consumo elettrico",
        "Generazione netta più import meno export e perdite di distribuzione (TWh)", 6),
    ("Geothermal electricity net generation", "billion kilowatthours"): (
        "eia.elec.gen.geothermal", "energia", "mix di generazione", "Produzione elettrica da geotermico", "TWh", "level", "geothermal geotermico",
        "Elettricità generata da fonte geotermica (TWh)", 19),
    ("Geothermal electricity installed capacity", "million kilowatts"): (
        "eia.elec.cap.geothermal", "energia", "capacità installata", "Capacità installata: geotermico", "GW", "level", "geothermal geotermico",
        "Potenza installata geotermica (milioni di kW = GW); è capacità, non produzione", 59),
    ("Hydroelectric pumped storage electricity installed capacity", "million kilowatts"): (
        "eia.elec.cap.pumped_storage", "energia", "capacità installata", "Capacità di accumulo idroelettrico (pompaggio)", "GW", "level",
        "storage accumulo pumped storage pompaggio", "Potenza degli impianti idroelettrici a pompaggio (GW), il principale accumulo di elettricità", 60),
    ("Total energy production", "million metric tons of oil equivalent"): (
        "eia.energy.production", "energia", "energia totale", "Produzione totale di energia primaria", "Mtep", "level",
        "energy production produzione energia", "Energia primaria prodotta da tutte le fonti (milioni di tonnellate equivalenti di petrolio)", 70),
    ("Total energy consumption", "million metric tons of oil equivalent"): (
        "eia.energy.consumption", "energia", "energia totale", "Consumo totale di energia primaria", "Mtep", "level",
        "energy consumption consumo energia", "Energia primaria consumata da tutte le fonti (milioni di tonnellate equivalenti di petrolio)", 71),
    ("Dry natural gas production", "billion cubic meters"): (
        "eia.gas.production", "energia", "gas", "Produzione di gas naturale", "miliardi di m³", "level", "gas production produzione gas metano",
        "Gas naturale secco prodotto (miliardi di m³)", 80),
    ("Dry natural gas consumption", "billion cubic meters"): (
        "eia.gas.consumption", "energia", "gas", "Consumo di gas naturale", "miliardi di m³", "level", "gas consumption consumo gas metano",
        "Gas naturale secco consumato (miliardi di m³)", 81),
    ("Dry natural gas imports", "billion cubic meters"): (
        "eia.gas.imports", "energia", "gas", "Import di gas naturale", "miliardi di m³", "level", "gas imports import gas lng gnl gasdotto pipeline",
        "Gas naturale importato, via gasdotto e GNL insieme (miliardi di m³), senza i Paesi di provenienza", 82),
    ("Dry natural gas exports", "billion cubic meters"): (
        "eia.gas.exports", "energia", "gas", "Export di gas naturale", "miliardi di m³", "level", "gas exports export gas lng gnl",
        "Gas naturale esportato (miliardi di m³), senza i Paesi di destinazione", 83),
    ("Crude oil including lease condensate production", "thousand barrels per day"): (
        "eia.oil.crude_production", "energia", "petrolio", "Produzione di petrolio greggio", "migliaia di barili al giorno", "level",
        "oil crude production petrolio greggio produzione", "Greggio e condensati prodotti (media giornaliera dell'anno)", 90),
    ("Petroleum and other liquids consumption", "thousand barrels per day"): (
        "eia.oil.consumption", "energia", "petrolio", "Consumo di petrolio e liquidi", "migliaia di barili al giorno", "level",
        "oil consumption consumo petrolio", "Prodotti petroliferi e altri liquidi consumati (media giornaliera dell'anno)", 91),
    ("Crude oil including lease condensate imports", "thousand barrels per day"): (
        "eia.oil.crude_imports", "energia", "petrolio", "Import di petrolio greggio (serie storica)", "migliaia di barili al giorno", "level",
        "oil crude imports import petrolio", "Greggio importato (media giornaliera). Serie non più aggiornata dall'EIA: dato storico", 92),
    ("Crude oil including lease condensate exports", "thousand barrels per day"): (
        "eia.oil.crude_exports", "energia", "petrolio", "Export di petrolio greggio (serie storica)", "migliaia di barili al giorno", "level",
        "oil crude exports export petrolio", "Greggio esportato (media giornaliera). Serie non più aggiornata dall'EIA: dato storico", 93),
    ("Refined petroleum products production", "thousand barrels per day"): (
        "eia.oil.refined_production", "energia", "petrolio", "Produzione di prodotti raffinati (serie storica)", "migliaia di barili al giorno", "level",
        "refining raffinazione raffinerie refinery", "Prodotti petroliferi raffinati prodotti (media giornaliera). Serie non più aggiornata dall'EIA: dato storico", 94),
}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "eia_INTL.zip")]


def next_state(state, request, result, today=None):
    return state


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None                     # "--", "NA", "(s)", "W": not a value (never read as zero)


def parse(data: bytes, meta: dict):
    z = zipfile.ZipFile(io.BytesIO(data))
    name = z.namelist()[0]
    by = {k: {} for k in SERIES}
    first, updated = {}, {}
    for n, line in enumerate(io.TextIOWrapper(z.open(name), encoding="utf-8")):
        if '"series_id"' not in line or "Annual" not in line:
            continue
        d = json.loads(line)
        parts = (d.get("name") or "").rsplit(", ", 2)
        if len(parts) != 3 or parts[2] != "Annual":
            continue
        key = (parts[0], d.get("units"))
        c = ISO3_TO_2.get(d.get("geography") or "")
        if key not in SERIES or not c:
            continue
        pts = [(y, _num(v), None) for y, v in d.get("data") or [] if y.isdigit() and int(y) >= SINCE]
        pts = [p for p in pts if p[1] is not None]
        if pts:
            by[key][c] = pts
            first.setdefault(key, n)
            updated[key] = max(updated.get(key, ""), (d.get("last_updated") or "")[:10])
    for key, (code, section, topic, label, unit, stat, kw, definition, order) in SERIES.items():
        rec = indicator(meta, code, label, unit, by[key], section=section, topic=topic, definition=definition, statistic=stat,
                        nature="reported", frequency="annuale", dataset=f"EIA International Energy Statistics — {key[0]} ({key[1]}; aggiornato {updated.get(key, '')})",
                        keywords=kw, digits=2 if unit in ("TWh", "GW", "Mtep", "miliardi di m³") else 0, order=order,
                        locator=f"zline:{first.get(key, 0)}", text="EIA energy energia")
        if rec:
            yield rec
