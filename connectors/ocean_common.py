"""Shared helpers of the OCEANOGRAPHIC NETWORK connectors (Phase 1, 2026-10-09): the networks as objects, the relation
"part of the network", exact unit conversions and the description of the latest-observations tables.

The latest observations of every network are a PUBLISHED TABLE (the connector's table(payloads), read by the card only
when it opens), never properties of the platform: a platform object holds what is stable (name, kind, network,
position), the table what the source measured last, with its UTC time, unit and quality. Every table has the same
shape, so the card reads any of them the same way:
  fields = ["scheme", "id", "observed_utc", "lon", "lat", <parameters…>, "quality"]
  notes  = {"params": {parameter: [label, unit, digits]}, "quality": text, "conversions": text, "source": text, …}
"""

from nexum.core.records import Assertion, NormalizedRecord, Target

KNOT_MS = 1852 / 3600          # 1 knot = 1852 m per hour (exact)
FOOT_M = 0.3048                # international foot (exact)

# parameters the tables may hold: label (Italian, shown as is), unit, digits
PARAMS = {
    "water_temp_c": ["Temperatura dell'acqua", "°C", 1],
    "salinity_psu": ["Salinità", "PSU", 2],
    "sample_pressure_dbar": ["Pressione (profondità) del campione", "dbar", 1],
    "sea_level_m": ["Livello del mare", "m", 2],
    "wave_height_m": ["Altezza significativa delle onde", "m", 1],
    "wave_max_m": ["Onda massima", "m", 1],
    "wave_period_dominant_s": ["Periodo dominante delle onde", "s", 0],
    "wave_period_avg_s": ["Periodo medio delle onde", "s", 1],
    "wave_dir_deg": ["Direzione delle onde (provenienza)", "°", 0],
    "wind_speed_ms": ["Vento", "m/s", 1],
    "wind_gust_ms": ["Raffica", "m/s", 1],
    "wind_dir_deg": ["Direzione del vento (provenienza)", "°", 0],
    "pressure_hpa": ["Pressione atmosferica", "hPa", 1],
    "air_temp_c": ["Temperatura dell'aria", "°C", 1],
}

FIELDS_HEAD = ["scheme", "id", "observed_utc", "lon", "lat"]


def fields(params):
    return FIELDS_HEAD + list(params) + ["quality"]


def params_note(params):
    return {p: PARAMS[p] for p in params}


def network(source_id, key, label, operator, licence_note, page_url):
    """The network a platform belongs to, as its source's catalogue names it (no position)."""
    return NormalizedRecord(
        source_id=source_id, native_id=f"network:{key}", native_version=f"{key}:{label}:{operator}:{licence_note}",
        kind="object", type="ocean.network", label=label, identifiers=[("ocean_network", key)],
        properties={"operator": operator, "licence_note": licence_note, "page_url": page_url},
        status="reviewed", method="asserted", raw_locator=f"network:{key}")


def part_of(key):
    return Assertion("relation", "part_of_network", Target("ocean.network", scheme="ocean_network", value=key))


def num(v, scale=1.0, digits=None):
    """A number from a source cell (None for missing markers), optionally scaled; never NaN."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "MM", "NaN", "nan", "null", "None"):     # NDBC writes "MM", ERDDAP "NaN" for a missing value
        return None
    try:
        x = float(s) * scale
    except ValueError:
        return None
    if x != x:
        return None
    return round(x, digits) if digits is not None else x
