"""NOAA NCEI Natural Hazards (HazEL) — volcano locations, significant volcanic eruptions, tsunami events and
significant earthquakes. Licence: US Government work, public domain. No key.

Each dataset is paginated (200 records per page). Events are imported from `min_year` (the period of the world);
volcano locations entirely. Links given by the source itself are kept as assertions:
  • a volcano carries the Smithsonian volcano number ("gvp"), so NASA EONET volcanic activity resolves to it;
  • an eruption names its volcano location (volcanoLocationId).
Impact figures (deaths, injuries, damage, houses destroyed) are the source's own, with its "amount order" codes when
the exact number is unknown.
"""

import json

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1"
DATASETS = {"volcanolocs": "geo.volcano", "volcanoes": "volcanic.eruption", "tsunamis/events": "hydro.tsunami",
            "earthquakes": "seismic.significant_earthquake"}


def describe():
    return {"connector_version": VERSION, "produces": sorted(DATASETS.values())}


def _url(ds, page, min_year):
    q = f"page={page}" + (f"&minYear={min_year}" if ds != "volcanolocs" else "")
    return f"{BASE}/{ds}?{q}"


def plan(mode, state, source, today=None):
    min_year = int(source.options.get("min_year", 2012))
    reqs = []
    for ds in DATASETS:
        pages = state.get("pages", {}).get(ds)
        for p in range(1, (pages or 1) + 1):
            reqs.append(FetchRequest(_url(ds, p, min_year), f"{ds}:{p}", force=mode == "backfill"))
    return reqs


def page_info(data: bytes) -> dict:
    d = json.loads(data.decode("utf-8"))
    return {"pages": d.get("totalPages")}


def next_state(state, request, result, today=None):
    st = dict(state)
    ds = request.resource_key.rsplit(":", 1)[0]
    if result and result.get("pages"):
        st["pages"] = {**st.get("pages", {}), ds: int(result["pages"])}
    return st


def _ms(it):
    import datetime as dt
    y, mo, d = it.get("year"), it.get("month") or 1, it.get("day") or 1
    if y is None or y < 1:
        return None, None
    h, mi = it.get("hour") or 0, it.get("minute") or 0
    try:
        t = dt.datetime(int(y), int(mo), int(d), int(h), int(mi), tzinfo=dt.timezone.utc)
    except ValueError:
        return None, None
    prec = "minute" if it.get("hour") is not None else "day" if it.get("day") else "month" if it.get("month") else "year"
    return int(t.timestamp() * 1000), prec


IMPACT = ("deaths", "deathsTotal", "injuries", "injuriesTotal", "damageMillionsDollars", "damageMillionsDollarsTotal",
          "housesDestroyed", "housesDestroyedTotal", "missing", "missingTotal", "deathsAmountOrderTotal",
          "damageAmountOrderTotal")


def parse(data: bytes, meta: dict):
    url = meta.get("url") or ""
    ds = next((k for k in DATASETS if f"/{k}?" in url), None)
    if ds is None:
        return
    typ = DATASETS[ds]
    for i, it in enumerate(json.loads(data.decode("utf-8")).get("items", [])):
        lat, lon = it.get("latitude"), it.get("longitude")
        geom = {"type": "Point", "coordinates": [lon, lat]} if lat is not None and lon is not None else None
        nid = str(it["id"])
        impact = {k: it.get(k) for k in IMPACT if it.get(k) is not None}
        if ds == "volcanolocs":
            idents = [("ncei_volcano", nid)] + ([("gvp", str(it["newNum"]))] if it.get("newNum") else [])
            yield NormalizedRecord(
                source_id=meta["source_id"], native_id=f"vloc:{nid}", native_version=content_version(it),
                kind="object", type=typ, label=it.get("name") or nid, identifiers=idents,
                properties={"morphology": it.get("morphology"), "elevation": it.get("elevation"),
                            "status": it.get("status"), "country_name": it.get("country"), "last_eruption_code": it.get("timeErupt")},
                geometry=geom, geo_uncertainty_m=2000.0, status="reviewed", method="asserted",
                raw_locator=f"$.items[{i}]", text=" ".join(x for x in (it.get("location"), it.get("country")) if x))
            continue
        t, prec = _ms(it)
        if t is None or geom is None:
            continue
        assertions, props = [], dict(impact)
        if ds == "volcanoes":
            label = f"Eruzione · {it.get('name') or 'vulcano'} ({it.get('year')})"
            props.update({"volcano_name": it.get("name"), "vei": it.get("vei"), "agent": it.get("agent"),
                          "country_name": it.get("country")})
            if it.get("volcanoLocationId"):
                assertions.append(Assertion("participation", "at_volcano",
                                            Target("geo.volcano", scheme="ncei_volcano", value=str(it["volcanoLocationId"]))))
        elif ds == "tsunamis/events":
            label = f"Tsunami · {(it.get('locationName') or it.get('country') or '').title()} ({it.get('year')})"
            props.update({"ts_intensity": it.get("tsIntensity"), "max_water_height_m": it.get("maxWaterHeight"),
                          "cause_code": it.get("causeCode"), "runups": it.get("numRunups"), "eq_magnitude": it.get("eqMagnitude"),
                          "country_name": (it.get("country") or "").title() or None, "event_validity": it.get("eventValidity")})
        else:
            label = f"Terremoto significativo · {(it.get('locationName') or it.get('country') or '').title()} ({it.get('year')})"
            props.update({"magnitude": it.get("eqMagnitude"), "intensity": it.get("intensity"), "depth_km": it.get("eqDepth"),
                          "country_name": (it.get("country") or "").title() or None, "tsunami_event": it.get("tsunamiEventId")})
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=f"{ds}:{nid}", native_version=content_version(it),
            kind="event", type=typ, label=label, identifiers=[("ncei", f"{ds.split('/')[0]}:{nid}")],
            properties={k: v for k, v in props.items() if v is not None}, geometry=geom, geo_uncertainty_m=20000.0,
            t_start_ms=t, t_precision=prec, t_uncertainty_s=60 if prec == "minute" else 86400,
            status="reviewed", method="asserted", assertions=assertions, raw_locator=f"$.items[{i}]",
            text=" ".join(x for x in (it.get("locationName"), it.get("country")) if x))
