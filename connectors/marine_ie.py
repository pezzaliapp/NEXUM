"""MARINE INSTITUTE (Ireland) — the moored buoys of the Irish Weather Buoy Network and their latest hourly observations
(oceanographic network, Phase 1, 2026-10-09).

Licence: Creative Commons Attribution 4.0 (the dataset's own licence attribute); credit "Marine Institute — Irish Weather
Buoy Network". Read through the Marine Institute ERDDAP (dataset IWBNetwork, CSV, keyless): the latest row of every buoy
in the last 48 hours, at most once an hour. The buoys that reported in that window are the platform objects; their rows
are the published table. Units: wind speed and gust are given in knots by the source and converted to m/s (exact factor
1852/3600); pressure in millibar = hPa. Quality: the source's QC_Flag (SeaDataNet: 0 unknown, 1 good, 9 missing).
"""

import csv
import io

from connectors.ocean_common import KNOT_MS, fields, network, num, params_note, part_of
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = ("https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv?station_id,longitude,latitude,time,AtmosphericPressure,"
       "WindDirection,WindSpeed,Gust,WaveHeight,WavePeriod,MeanWaveDirection,Hmax,AirTemperature,SeaTemperature,salinity,"
       "QC_Flag&time%3E=now-48hours&orderByMax(%22station_id,time%22)")
PAGE = "https://erddap.marine.ie/erddap/tabledap/IWBNetwork.html"   # the dataset page (verified 2026-10-09)
LICENCE = "CC BY 4.0 — Marine Institute, Irish Weather Buoy Network"
PARAMS = ["water_temp_c", "salinity_psu", "wave_height_m", "wave_max_m", "wave_period_avg_s", "wave_dir_deg",
          "wind_speed_ms", "wind_gust_ms", "wind_dir_deg", "pressure_hpa", "air_temp_c"]
QC = {"0": "qualità non valutata dalla fonte (0)", "1": "qualità buona (1)", "9": "valore mancante (9)"}


def describe():
    return {"connector_version": VERSION, "produces": ["ocean.platform", "ocean.network"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "marine_ie_iwbn_latest.csv")]


def next_state(state, request, result, today=None):
    return state


def rows(data):
    text = data.decode("utf-8", errors="replace")
    if not text.startswith("station_id,"):
        return []
    return [r for r in csv.DictReader(io.StringIO(text)) if r.get("station_id") and r.get("time") not in (None, "", "UTC")]


def parse(data: bytes, meta: dict):
    sid = meta["source_id"]
    rs = rows(data)
    if not rs:
        return
    yield network(sid, "irish_weather_buoys", "Irish Weather Buoy Network", "Marine Institute (Irlanda)", LICENCE, PAGE)
    for i, r in enumerate(rs):
        lat, lon = num(r.get("latitude")), num(r.get("longitude"))
        if lat is None or lon is None:
            continue
        code = r["station_id"].strip()
        yield NormalizedRecord(
            source_id=sid, native_id=code, native_version=f"{code}:{lat:.3f}:{lon:.3f}", kind="object", type="ocean.platform",
            label=f"Boa {code} — Irish Weather Buoy Network", identifiers=[("marine_ie", code)],
            properties={"platform_kind": "moored_buoy", "operator": "Marine Institute (Irlanda)"},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=1000.0, status="reviewed",
            method="asserted", assertions=[part_of("irish_weather_buoys")], raw_locator=f"row:{i}")


def table(payloads):
    """The published table "ocean_marine_ie": the latest hourly row of each buoy (wind converted from knots to m/s)."""
    data = next((d for _k, d, _f, _u in payloads), b"")
    out = []
    for r in sorted(rows(data), key=lambda r: r["station_id"]):
        v = {"water_temp_c": num(r.get("SeaTemperature"), digits=3), "salinity_psu": num(r.get("salinity"), digits=3),
             "wave_height_m": num(r.get("WaveHeight"), digits=3), "wave_max_m": num(r.get("Hmax"), digits=3),
             "wave_period_avg_s": num(r.get("WavePeriod"), digits=3), "wave_dir_deg": num(r.get("MeanWaveDirection"), digits=1),
             "wind_speed_ms": num(r.get("WindSpeed"), KNOT_MS, 2), "wind_gust_ms": num(r.get("Gust"), KNOT_MS, 2),
             "wind_dir_deg": num(r.get("WindDirection"), digits=1), "pressure_hpa": num(r.get("AtmosphericPressure"), digits=2),
             "air_temp_c": num(r.get("AirTemperature"), digits=3)}
        t = r["time"].strip()
        out.append(["marine_ie", r["station_id"].strip(), t[:16] + "Z", num(r.get("longitude"), digits=4), num(r.get("latitude"), digits=4),
                    *[v[p] for p in PARAMS], QC.get((r.get("QC_Flag") or "").strip(), f"indicatore della fonte: {r.get('QC_Flag')}")])
    return {"fields": fields(PARAMS), "rows": out,
            "notes": {"params": params_note(PARAMS), "source": "Marine Institute ERDDAP — IWBNetwork (ultima riga oraria di ogni boa nelle ultime 48 ore)",
                      "quality": "QC_Flag della fonte (SeaDataNet): 0 non valutata, 1 buona, 9 mancante",
                      "conversions": {"wind_speed_ms": "vento e raffica da nodi a m/s (× 1852/3600)", "wind_gust_ms": "vento e raffica da nodi a m/s (× 1852/3600)",
                                      "pressure_hpa": "pressione: millibar = hPa"}}}
