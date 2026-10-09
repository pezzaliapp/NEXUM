"""ARGO — the profiling floats of the international Argo programme that reported a profile in the last days, with the
near-surface values of their latest profile (oceanographic network, Phase 1, 2026-10-09).

Licence: Argo data are "freely available without restriction"; acknowledgement required: "These data were collected
and made freely available by the International Argo Program and the national programs that contribute to it
(https://argo.ucsd.edu, https://www.ocean-ops.org). The Argo Program is part of the Global Ocean Observing System." —
Argo GDAC, DOI 10.17882/42182. Read through the Ifremer ERDDAP (dataset ArgoFloats, CSV, keyless), one request per UTC
day: 15 days on the first run, then today and yesterday (each day is its own resource, read at most once a day).

What is read: platform number (the float's WMO number), time, position and its quality flag, and — among the levels of
the profile within 10 dbar of the surface — the values of the most recent one: pressure, temperature, salinity, their
quality flags and the data mode (R real time, A real time adjusted, D delayed mode). No name of a person (the principal
investigator of a float) is ever asked for. A float whose position flag is bad (3, 4) is not drawn.
"""

import csv
import datetime as dt
import io

from connectors.ocean_common import fields, network, num, params_note, part_of
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
ERDDAP = ("https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv?"
          "platform_number,time,latitude,longitude,pres,temp,psal,data_mode,temp_qc,psal_qc,position_qc"
          "&time%3E={d0}T00:00:00Z&time%3C{d1}T00:00:00Z&pres%3C=10&orderByMax(%22platform_number,time%22)")
BACKFILL_DAYS = 15
INCREMENTAL_DAYS = 2
ACK = ("Dati raccolti e resi liberamente disponibili dal Programma internazionale Argo e dai programmi nazionali che vi "
       "contribuiscono (argo.ucsd.edu, ocean-ops.org); parte del Global Ocean Observing System. DOI 10.17882/42182")
PARAMS = ["water_temp_c", "salinity_psu", "sample_pressure_dbar"]
QC = {"0": "non controllata", "1": "buona", "2": "probabilmente buona", "3": "probabilmente cattiva", "4": "cattiva",
      "5": "valore modificato", "8": "valore stimato", "9": "valore mancante"}
MODE = {"R": "dati in tempo reale", "A": "dati in tempo reale corretti", "D": "dati differiti, verificati da esperti"}
BAD_POSITION = {"3", "4"}
BAD_VALUE = {"3", "4"}          # probably bad, bad: the value is not shown (its flag is)


def describe():
    return {"connector_version": VERSION, "produces": ["ocean.platform", "ocean.network"]}


def plan(mode, state, source, today=None):
    today = today or dt.datetime.now(dt.timezone.utc).date()
    n = BACKFILL_DAYS if mode == "backfill" else INCREMENTAL_DAYS
    days = [today - dt.timedelta(days=k) for k in range(n - 1, -1, -1)]          # oldest first: the newest is read last
    return [FetchRequest(ERDDAP.format(d0=d.isoformat(), d1=(d + dt.timedelta(days=1)).isoformat()), f"argo_{d.isoformat()}.csv")
            for d in days]


def next_state(state, request, result, today=None):
    return state


def rows(data):
    """The CSV's data rows (ERDDAP writes a units row under the header)."""
    text = data.decode("utf-8", errors="replace")
    if not text.startswith("platform_number,"):
        return []
    return [r for r in csv.DictReader(io.StringIO(text)) if r.get("platform_number") and r.get("time") not in (None, "", "UTC")]


def parse(data: bytes, meta: dict):
    sid = meta["source_id"]
    rs = rows(data)
    if not rs:
        return
    yield network(sid, "argo", "Argo — galleggianti profilatori", "Programma internazionale Argo (GOOS)", ACK, "https://argo.ucsd.edu/")
    for i, r in enumerate(rs):
        lat, lon = num(r.get("latitude")), num(r.get("longitude"))
        if lat is None or lon is None or (r.get("position_qc") or "").strip() in BAD_POSITION:
            continue
        wmo = r["platform_number"].strip()
        yield NormalizedRecord(
            source_id=sid, native_id=wmo, native_version=r["time"], kind="object", type="ocean.platform",
            label=f"Argo {wmo}", identifiers=[("wmo", wmo)],
            properties={"platform_kind": "profiling_float", "operator": "Programma internazionale Argo"},
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0, status="reviewed",
            method="asserted", assertions=[part_of("argo")], raw_locator=f"row:{i}")


def quality(r):
    q = lambda k: (r.get(k) or "").strip()
    parts = [f"{name}: qualità {QC.get(q(k), 'non indicata')}" + (f" ({q(k)})" if q(k) else "")
             + (", valore non mostrato" if q(k) in BAD_VALUE else "")
             for name, k in (("temperatura", "temp_qc"), ("salinità", "psal_qc"))]
    m = q("data_mode")
    if m:
        parts.append(f"{MODE.get(m, m)} ({m})")
    return " · ".join(parts)


def table(payloads):
    """The published table "ocean_argo": the latest near-surface sample of each float, over the days read."""
    best = {}
    for _k, data, _f, _u in sorted(payloads):
        for r in rows(data):
            wmo = r["platform_number"].strip()
            if (r.get("position_qc") or "").strip() in BAD_POSITION or num(r.get("latitude")) is None or num(r.get("longitude")) is None:
                continue
            if wmo not in best or r["time"] > best[wmo]["time"]:
                best[wmo] = r
    out = []
    for wmo, r in sorted(best.items()):
        t = r["time"].strip()                                   # "2026-10-08T17:07:53Z" → "2026-10-08T17:07Z"
        ok = lambda flag: (r.get(flag) or "").strip() not in BAD_VALUE        # a value the source flags as bad: not shown
        out.append(["wmo", wmo, t[:16] + "Z", num(r.get("longitude"), digits=4), num(r.get("latitude"), digits=4),
                    num(r.get("temp"), digits=3) if ok("temp_qc") else None, num(r.get("psal"), digits=3) if ok("psal_qc") else None,
                    num(r.get("pres"), digits=1), quality(r)])
    return {"fields": fields(PARAMS), "rows": out,
            "notes": {"params": params_note(PARAMS), "source": "Argo GDAC tramite Ifremer ERDDAP (ArgoFloats), DOI 10.17882/42182",
                      "quality": "Indicatori di qualità Argo per temperatura e salinità (0–9) e tipo di dato: R tempo reale, A tempo reale corretto, D differito; i valori che la fonte indica come cattivi (3, 4) non sono mostrati",
                      "sample": "il campione più vicino alla superficie entro 10 dbar dell'ultimo profilo; un profilo ogni 10 giorni circa, non continuo",
                      "acknowledgement": ACK}}
