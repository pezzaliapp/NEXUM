"""NASA FIRMS — ACTIVE FIRE HOTSPOTS of the last 24 hours (VIIRS 375 m, NOAA-20 and NOAA-21), OSIRIS baseline
(2026-10-04). A hotspot is a thermal anomaly a sensor detected in one pixel at one pass: not a confirmed fire, not an
event of the world on its own (NEXUM's fire events come from curated sources). They are published as one compact table
(GET /tables/hotspots), drawn only when the person turns the layer on; nothing is stored per hotspot.

Source: the open "active fire data" files of FIRMS (no key: the global 24-hour CSVs listed on the FIRMS site), updated
several times a day; minimum interval 3 hours. Licence: NASA data, no restriction on reuse; attribution "NASA FIRMS
(LANCE)". Declared filter: low-confidence detections are left out (the sensor's own flag).

2026-10-22: NOAA-20 replaces Suomi NPP, whose data delivery NASA ends on 2 November 2026 (NASA's advice: move to NOAA-21
and NOAA-20, same VIIRS instrument; FIRMS product VJ114IMGTDL_NRT). The Suomi NPP files already fetched stay in the Raw
Store, untouched; the published table reads only the files of the current sensors. One SOURCE PER SATELLITE (option
"satellite" of the registry: nasa.firms = NOAA-21, nasa.firms.noaa20 = NOAA-20), both publishing the table "hotspots":
each one is fetched, judged, signalled and, after repeated errors, suspended on its own, so one satellite failing never
stops the other (the Core is not changed: it ends a source's fetch at its first failed file)."""

import csv
import io

from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
FILES = {"noaa20": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv",
         "noaa21": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv"}
SENSORS = {"noaa20": ("J", "NOAA-20"), "noaa21": ("N", "NOAA-21")}       # resource "firms_<key>_24h.csv" → table letter, name
CONF = {"n": "n", "nominal": "n", "h": "h", "high": "h"}


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    """The file of the source's satellite (its registry option "satellite"), nothing else."""
    k = (source.options or {}).get("satellite")
    if k not in FILES:
        raise ValueError(f"{source.id}: option satellite must be one of {sorted(FILES)}, not {k!r}")
    return [FetchRequest(FILES[k], f"firms_{k}_24h.csv")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    """No records: hotspots are published as a table only (see table())."""
    return iter(())


def usable(data) -> bool:
    """A payload that is the FIRMS CSV (its header first). Read by the API: the published table keeps, for each sensor,
    its newest USABLE file, so an answer that is not the data (a 200 with an error page) never replaces the last good
    one; how old the detections are is the browser's to say (only the last 24 hours are drawn as active)."""
    return isinstance(data, (bytes, bytearray)) and data.lstrip(b"\xef\xbb\xbf").startswith(b"latitude,")


def rows(data):
    text = data.decode("utf-8", errors="replace")
    if not text.startswith("latitude,"):
        return []
    return list(csv.DictReader(io.StringIO(text)))


def table(payloads):
    """The published table "hotspots": [lon, lat, frp_MW, confidence (n|h), acquired UTC "YYYY-MM-DDTHH:MM", sensor (J =
    NOAA-20, N = NOAA-21)]. Only the files of the current sensors (a Suomi NPP file kept in the Raw Store is not read).
    Detections in the same 0.01° cell (about 1 km) are one row: the most recent, the strongest of those at the same
    time; so an older file (a sensor that failed for days) never hides a recent detection."""
    best, times = {}, []
    current = {f"firms_{k}_24h.csv": v[0] for k, v in SENSORS.items()}
    for key, data, _fetched, _url in sorted(payloads):
        sensor = current.get(key)
        if sensor is None:
            continue
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
            if cell not in best or (when, frp) > (best[cell][4], best[cell][2]):
                best[cell] = [cell[0], cell[1], round(frp, 1), conf, when, sensor]
    return {"fields": ["lon", "lat", "frp_mw", "confidence", "acquired_utc", "sensor"], "rows": list(best.values()),
            "notes": {"from": min(times, default=None), "to": max(times, default=None), "sensors": dict(SENSORS.values()),
                      "filter": "rilevamenti a bassa confidenza esclusi (indicatore del sensore); una riga per cella di 0,01° (la più recente; a parità di ora, la più intensa)"}}
