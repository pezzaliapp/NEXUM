"""NASA FIRMS — ACTIVE FIRE HOTSPOTS of the last 24 hours (VIIRS 375 m, Suomi NPP and NOAA-21), OSIRIS baseline
(2026-10-04). A hotspot is a thermal anomaly a sensor detected in one pixel at one pass: not a confirmed fire, not an
event of the world on its own (NEXUM's fire events come from curated sources). They are published as one compact table
(GET /tables/hotspots), drawn only when the person turns the layer on; nothing is stored per hotspot.

Source: the open "active fire data" files of FIRMS (no key: the global 24-hour CSVs listed on the FIRMS site), updated
several times a day; minimum interval 3 hours. Licence: NASA data, no restriction on reuse; attribution "NASA FIRMS
(LANCE)". Declared filter: low-confidence detections are left out (the sensor's own flag)."""

import csv
import io

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
FILES = {"snpp": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv",
         "noaa21": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv"}
CONF = {"n": "n", "nominal": "n", "h": "h", "high": "h"}


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    return [FetchRequest(u, f"firms_{k}_24h.csv") for k, u in FILES.items()]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    """No records: hotspots are published as a table only (see table())."""
    return iter(())


def rows(data):
    text = data.decode("utf-8", errors="replace")
    if not text.startswith("latitude,"):
        return []
    return list(csv.DictReader(io.StringIO(text)))


def table(payloads):
    """The published table "hotspots": [lon, lat, frp_MW, confidence (n|h), acquired UTC "YYYY-MM-DDTHH:MM", sensor (S = Suomi
    NPP, N = NOAA-21)]. Detections of both sensors in the same 0.01° cell (about 1 km) are one row: the strongest."""
    best, times = {}, []
    for key, data, _fetched, _url in sorted(payloads):
        sensor = "N" if "noaa21" in key else "S"
        for r in rows(data):
            conf = CONF.get((r.get("confidence") or "").strip().lower())
            if not conf:
                continue
            try:
                lat, lon, frp = float(r["latitude"]), float(r["longitude"]), float(r.get("frp") or 0)
            except (KeyError, ValueError):
                continue
            t = r.get("acq_time", "").zfill(4)
            when = f"{r.get('acq_date')}T{t[:2]}:{t[2:]}"
            times.append(when)
            cell = (round(lon, 2), round(lat, 2))
            if cell not in best or frp > best[cell][2]:
                best[cell] = [cell[0], cell[1], round(frp, 1), conf, when, sensor]
    return {"fields": ["lon", "lat", "frp_mw", "confidence", "acquired_utc", "sensor"], "rows": list(best.values()),
            "notes": {"from": min(times, default=None), "to": max(times, default=None), "sensors": {"S": "Suomi NPP", "N": "NOAA-21"},
                      "filter": "rilevamenti a bassa confidenza esclusi (indicatore del sensore); una riga per cella di 0,01° (la più intensa)"}}
