"""UCDP Candidate Events Dataset (monthly releases of the Georeferenced Event Dataset). Licence: CC BY 4.0
("free of charge … you are free to use and redistribute them provided you cite": Sundberg & Melander 2013;
Davies et al. 2025). No key (bulk files).

Privacy: only coordinates, dates, deaths, the conflict/dyad/actor names (states and organised groups) and the place
are imported; every source_* column (article lists, headlines, offices) is dropped, as it can name individuals.
Declared filter: events with a best estimate of at least MIN_DEATHS deaths (organised violence of consequence).

Security zones (World Intelligence, 2026-10-03): every LETHAL event of a file (best ≥ 1) is also kept, compactly, in one
DIGEST per country and file ("conflict.event_digest", not a map element): id, dates and their precision, first-level
administrative unit, point and its precision, deaths (best/low/high), UCDP type, the Gleditsch–Ward codes of the
country and of the state actors (a foreign state actor is documented only by them), clarity and coding status.
The zones are computed from the digests by the API layer with declared rules — never a forecast."""

import csv
import io
import re

from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest
from nexum.core.timeutil import parse_iso

VERSION = "1.3.0"   # 1.3.0 (2026-10-04, integrity gate): readable label; the provisional code stays in the facts   # 1.1.0: provisional codes said as such; UCDP types as UCDP defines them · 1.2.0: per-country event digests (security zones)
BASE = "https://ucdp.uu.se/downloads/candidateged/"
MIN_DEATHS = 5
# UCDP's three categories, as UCDP defines them: 1 state-based (at least one party is the government of a state),
# 2 non-state (between organised groups, no government), 3 one-sided (an organised actor against civilians)
VIOLENCE = {"1": "conflitto armato statale (almeno un governo è parte)", "2": "conflitto tra gruppi non statali",
            "3": "violenza unilaterale contro civili"}
# The Candidate dataset names conflicts, dyads and actors not yet coded by UCDP with a provisional code "XXX<n>":
# a code, never a name — said as such, the code kept (never replaced by a guessed actor)
_PROVISIONAL = re.compile(r"^XXX\d+$")


def _actor(name):
    n = (name or "").strip()
    return f"attore non ancora identificato dalla fonte (codice provvisorio {n})" if _PROVISIONAL.match(n) else n


def _is_provisional(name):
    return bool(name) and any(_PROVISIONAL.match(x.strip()) for x in name.split(" - "))


def _conflict(name):
    parts = [x.strip() for x in (name or "").split(" - ")]
    if parts and all(_PROVISIONAL.match(x) for x in parts):
        return f"conflitto non ancora classificato dalla fonte (codice provvisorio {' - '.join(parts)})"
    return " - ".join(_actor(x) if _PROVISIONAL.match(x) else x for x in parts)
DIGEST = ("id", "date_start", "date_prec", "adm_1", "latitude", "longitude", "best", "low", "high", "type_of_violence",
          "gwnoa", "gwnob", "country_id", "where_prec", "event_clarity", "side_a", "side_b", "code_status")
KEEP = ("id", "type_of_violence", "conflict_name", "dyad_name", "side_a", "side_b", "where_prec", "adm_1", "adm_2",
        "latitude", "longitude", "country", "region", "date_prec", "date_start", "date_end", "deaths_a", "deaths_b",
        "deaths_civilians", "deaths_unknown", "best", "high", "low", "event_clarity", "code_status")


def describe():
    return {"connector_version": VERSION, "produces": ["conflict.violence_event"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(BASE + f, f) for f in source.options.get("files", [])]


def next_state(state, request, result, today=None):
    return state


def _i(v):
    try:
        return int(float(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse(data: bytes, meta: dict):
    digests = {}
    for n, row in enumerate(csv.DictReader(io.StringIO(data.decode("utf-8"))), start=2):
        r = {k: row.get(k) for k in KEEP}           # never the source_* columns
        best = _i(r["best"])
        if best is not None and best >= 1 and row.get("country_id"):
            d = [row.get(k) or None for k in DIGEST]
            d[1] = (d[1] or "")[:10]
            for k in (4, 5):
                try:
                    d[k] = round(float(d[k]), 4)
                except (TypeError, ValueError):
                    d[k] = None
            for k in (2, 6, 7, 8, 9, 10, 11, 12, 13, 14):
                d[k] = _i(d[k])
            d[15], d[16] = _actor(d[15]), _actor(d[16])
            digests.setdefault((row["country_id"], row.get("country") or ""), []).append(d)
        if best is None or best < MIN_DEATHS:
            continue
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (TypeError, ValueError):
            continue
        t0, _ = parse_iso((r["date_start"] or "")[:10] + "T00:00:00Z")
        t1, _ = parse_iso((r["date_end"] or "")[:10] + "T00:00:00Z")
        if t0 is None:
            continue
        kind = VIOLENCE.get(r["type_of_violence"] or "", "violenza organizzata")
        place = ", ".join(x for x in (r["adm_2"], r["adm_1"], r["country"]) if x)
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["id"], native_version=f"{r['code_status']}|{best}|{r['date_end']}",
            kind="event", type="conflict.violence_event",
            # the label a person reads; the source's provisional code stays in the event's facts (conflict, conflict_code)
            label=(f"Violenza organizzata (attori non identificati dalla fonte) · {place}" if _is_provisional(r["conflict_name"])
                   else f"{r['conflict_name']} · {place}")[:160],
            identifiers=[("ucdp_ged", r["id"])],
            properties={"violence_type": kind, "conflict": _conflict(r["conflict_name"]), "dyad": _conflict(r["dyad_name"]),
                        "side_a": _actor(r["side_a"]), "side_b": _actor(r["side_b"]), "conflict_code": r["conflict_name"], "deaths_best": best, "deaths_high": _i(r["high"]), "deaths_low": _i(r["low"]),
                        "deaths_civilians": _i(r["deaths_civilians"]), "country_name": r["country"],
                        "where_precision": _i(r["where_prec"]), "status": r["code_status"]},
            geometry={"type": "Point", "coordinates": [lon, lat]},
            geo_uncertainty_m={1: 1000.0, 2: 25000.0, 3: 50000.0}.get(_i(r["where_prec"]), 100000.0),
            t_start_ms=t0, t_end_ms=t1 if t1 and t1 > t0 else None, t_precision="day", t_uncertainty_s=86400,
            status="preliminary", method="asserted", raw_locator=f"row:{n}", text=place)

    fname = (meta.get("url") or "").rsplit("/", 1)[-1]
    for (gw, name), evs in sorted(digests.items()):
        evs.sort(key=lambda d: (d[1] or "", str(d[0])))
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=f"digest:{fname}:{gw}", native_version=f"{len(evs)}|{evs[-1][1]}",
            kind="object", type="conflict.event_digest", label=f"UCDP · {name} · eventi letali del file {fname}",
            identifiers=[("ucdp_digest", f"{fname}:{gw}")],
            properties={"country_name": name, "gw": _i(gw), "file": fname, "fields": list(DIGEST), "events": evs,
                        "events_n": len(evs), "first": evs[0][1], "last": evs[-1][1]},
            status="preliminary", method="asserted", raw_locator="row:2", text=f"{name} UCDP")
