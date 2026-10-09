"""OCEANOGRAPHIC NETWORK, Phase 1 (2026-10-09): the connectors read only what their sources' terms allow and state what
they read. Fixed inputs (fixtures/ocean: samples of the real files read on 2026-10-09), no network.

- NDBC: only the stations NOAA owns (NDBC, NOS, NOS PORTS) — partners left out of objects AND table; kinds from the
  catalogue's own type/programme; a WMO identifier only for a 5-digit WMO number; "MM" is missing, never a value; feet
  of sea level converted to metres with the exact factor.
- Argo: never asks for a person's name; a float with a bad position flag is not drawn; the latest sample of a float
  over the days read; requests one per UTC day, oldest first (15 on the first run, then 2).
- Marine Institute: knots converted to m/s (exact factor); the source's QC flag said with its documented meaning.
- ISPRA RMN: stations, sensors and the month of the latest open series; no measurement presented as current.
- Vocabulary: the stations on land get their country by containment only (no "near" fallback); buoys never."""

import datetime as dt
import json
import pathlib
import xml.etree.ElementTree as ET

from connectors import argo, ispra_rmn, marine_ie, ndbc
from connectors.ocean_common import FOOT_M, KNOT_MS, PARAMS
from nexum.core.types import load_types

FIX = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "ocean"
ROOT = pathlib.Path(__file__).resolve().parents[1]
TS = load_types([str(ROOT / "vocab_live")])


def _ndbc():
    cat = (FIX / "ndbc_activestations.xml").read_bytes()
    obs = (FIX / "ndbc_latest_obs.txt").read_bytes()
    return cat, obs


def test_ndbc_only_noaa_owned_stations_in_objects_and_table():
    cat, obs = _ndbc()
    owners = {s.get("id").upper(): s.get("owner") for s in ET.fromstring(cat).iter("station")}
    assert any(o not in ndbc.OWNERS for o in owners.values())          # the sample holds partners too
    recs = [r for r in ndbc.parse(cat, {"source_id": "noaa.ndbc"}) if r.type != "ocean.network"]
    assert recs and all(owners[r.native_id] in ndbc.OWNERS for r in recs)
    for r in recs:
        TS.validate_props(r.type, r.properties)
        assert r.assertions and r.assertions[0].type == "part_of_network"
        wmo = [v for s, v in r.identifiers if s == "wmo"]
        assert not wmo or (len(wmo[0]) == 5 and wmo[0].isdigit())
    t = ndbc.table([("ndbc_activestations.xml", cat, 0, ""), ("ndbc_latest_obs.txt", obs, 0, "")])
    assert t["rows"] and all(owners[row[1]] in ndbc.OWNERS for row in t["rows"])
    assert "BDVF1" not in {row[1] for row in t["rows"]}                 # a partner station with data: left out
    assert "MM" not in json.dumps(t["rows"])
    assert set(t["notes"]["params"]) <= set(PARAMS)


def test_ndbc_kinds_follow_the_catalogue():
    assert ndbc.kind_of({"type": "fixed", "pgm": "NOS/CO-OPS"}) == ("ocean.tide_gauge", "tide_gauge")
    assert ndbc.kind_of({"type": "fixed", "pgm": "NDBC Meteorological/Ocean"}) == ("ocean.coastal_station", "coastal_station")
    assert ndbc.kind_of({"type": "buoy", "pgm": "x"}) == ("ocean.platform", "moored_buoy")
    assert ndbc.kind_of({"type": "dart", "pgm": "Tsunami"}) == ("ocean.platform", "tsunami_buoy")
    assert ndbc.kind_of({"type": "whatever", "pgm": ""}) == ("ocean.platform", "other")   # never a guessed kind


def test_ndbc_sea_level_feet_to_metres_and_missing_markers():
    head = ("#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE\n"
            "#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft\n")
    obs = (head + "TEST1    10.000  -20.000 2026 10 09 10 00  MM    MM    MM   MM   MM  MM  MM     MM    MM    MM  20.0    MM   MM   2.00\n").encode()
    cat = b'<stations><station id="TEST1" lat="10" lon="-20" name="T" owner="NOS" pgm="NOS/CO-OPS" type="fixed"/></stations>'
    t = ndbc.table([("ndbc_activestations.xml", cat, 0, ""), ("ndbc_latest_obs.txt", obs, 0, "")])
    row = dict(zip(t["fields"], t["rows"][0]))
    assert row["sea_level_m"] == round(2.0 * FOOT_M, 3) and row["water_temp_c"] == 20.0 and row["wind_speed_ms"] is None
    assert row["observed_utc"] == "2026-10-09T10:00Z"


def test_argo_reads_no_person_and_draws_no_bad_position():
    assert "pi_name" not in argo.ERDDAP.lower() and "principal" not in argo.ERDDAP.lower()
    data = (FIX / "argo_day.csv").read_bytes()
    recs = [r for r in argo.parse(data, {"source_id": "argo.ifremer"}) if r.type != "ocean.network"]
    assert recs and all(r.identifiers == [("wmo", r.native_id)] and r.label == f"Argo {r.native_id}" for r in recs)
    for r in recs:
        TS.validate_props(r.type, r.properties)
    bad = data.replace(b",1\n", b",4\n", 1)                              # the first row's position flag: bad
    first = argo.rows(data)[0]["platform_number"]
    assert first not in {r.native_id for r in argo.parse(bad, {"source_id": "argo.ifremer"})}
    assert first not in {row[1] for row in argo.table([("d", bad, 0, "")])["rows"]}


def test_argo_latest_sample_over_days_and_daily_requests():
    data = (FIX / "argo_day.csv").read_bytes()
    lines = data.decode().splitlines()
    wmo = lines[2].split(",")[0]
    later = "\n".join(lines[:2] + [lines[2].replace(lines[2].split(",")[1], "2099-01-01T00:00:00Z")]) + "\n"
    rows = {r[1]: r for r in argo.table([("a_day1", data, 0, ""), ("a_day2", later.encode(), 0, "")])["rows"]}
    assert rows[wmo][2] == "2099-01-01T00:00Z"
    p = argo.plan("backfill", {}, None, dt.date(2026, 10, 9))
    assert len(p) == 15 and p[0].resource_key == "argo_2026-09-25.csv" and p[-1].resource_key == "argo_2026-10-09.csv"
    assert [r.resource_key for r in argo.plan("incremental", {}, None, dt.date(2026, 10, 9))] == ["argo_2026-10-08.csv", "argo_2026-10-09.csv"]


def test_marine_institute_knots_to_ms_and_qc_meaning():
    data = (FIX / "marine_ie_latest.csv").read_bytes()
    src = {r["station_id"]: r for r in marine_ie.rows(data)}
    t = marine_ie.table([("k", data, 0, "")])
    for row in t["rows"]:
        r = dict(zip(t["fields"], row))
        assert r["wind_speed_ms"] == round(float(src[r["id"]]["WindSpeed"]) * KNOT_MS, 2)
        assert r["quality"].startswith("qualità") or r["quality"].startswith("valore")
    recs = list(marine_ie.parse(data, {"source_id": "marine_ie.iwbn"}))
    for r in recs:
        TS.validate_props(r.type, r.properties)


def test_ispra_stations_without_measurements_and_with_the_open_data_month():
    data = (FIX / "ispra_rmn.json").read_bytes()
    recs = [r for r in ispra_rmn.parse(data, {"source_id": "ispra.rmn"}) if r.type != "ocean.network"]
    assert recs
    for r in recs:
        TS.validate_props(r.type, r.properties)
        assert r.type == "ocean.tide_gauge" and r.properties["platform_kind"] == "tide_gauge"
        assert not set(r.properties) & set(PARAMS)                       # no value presented as current
        assert "ottobre 2023" in r.properties["data_note"] and r.properties["sensors"]
    assert ispra_rmn.month_name("202310") == "ottobre 2023" and ispra_rmn.month_name("202313") is None


def test_land_stations_by_containment_only_buoys_never():
    e = [x for x in TS.enrichments if x.id == "ocean_station_containment"]
    assert len(e) == 1 and e[0].when_types == ["ocean.coastal_station"] and e[0].fallback_nearest_km == 0.0
    assert not any(t in x.when_types for x in TS.enrichments for t in ("ocean.platform", "ocean.tide_gauge"))   # declared or none
    assert "ocean.coastal_station" in TS.relations["located_in"].from_types


def test_argo_values_flagged_bad_are_not_shown_and_conversions_belong_to_their_value():
    head = "platform_number,time,latitude,longitude,pres,temp,psal,data_mode,temp_qc,psal_qc,position_qc\n,UTC,,,,,,,,,\n"
    row = "1234567,2026-10-04T07:23:00Z,10.0,20.0,4.5,33.0,0.01,A,4,1,1\n"
    t = argo.table([("d", (head + row).encode(), 0, "")])
    r = dict(zip(t["fields"], t["rows"][0]))
    assert r["water_temp_c"] is None and r["salinity_psu"] == 0.01 and "valore non mostrato" in r["quality"]
    ndbc_t = ndbc.table([("ndbc_activestations.xml", b"<stations/>", 0, ""), ("ndbc_latest_obs.txt", b"", 0, "")])
    assert set(ndbc_t["notes"]["conversions"]) == {"sea_level_m"}
    mi = marine_ie.table([("k", (FIX / "marine_ie_latest.csv").read_bytes(), 0, "")])
    assert set(mi["notes"]["conversions"]) <= set(mi["notes"]["params"])


def test_coops_country_from_the_declared_state_and_no_duplicate_with_ndbc():
    from connectors import coops
    data = (FIX / "coops_stations.json").read_bytes()
    recs = list(coops.parse(data, {"source_id": "noaa.coops"}))
    assert recs
    by = {r.native_id: r for r in recs}
    for r in recs:
        TS.validate_props(r.type, r.properties)
        assert r.identifiers == [("coops", r.native_id)] and r.type == "ocean.tide_gauge"
        st = next(s for s in json.loads(data)["stations"] if s["id"] == r.native_id)["state"]
        iso = [a.target.value for a in r.assertions if a.type == "located_in"]
        assert iso == ([coops.country(st)] if coops.country(st) else [])
    assert coops.country("TX") == "US" and coops.country("United States of America") == "US"
    assert coops.country("PR") == "PR" and coops.country("Bermuda") == "BM" and coops.country("") is None
    assert by["8410140"].label == "8410140 - Eastport, ME"
    # NDBC names its NOS station with the same CO-OPS number: the same object (identifier "coops"), never by position
    cat = b'<stations><station id="PSBM1" lat="44.9" lon="-66.98" name="8410140 - Eastport, ME" owner="NOS" pgm="NOS/CO-OPS" type="fixed"/></stations>'
    nd = [r for r in ndbc.parse(cat, {"source_id": "noaa.ndbc"}) if r.type != "ocean.network"][0]
    assert ("coops", "8410140") in nd.identifiers and nd.type == "ocean.tide_gauge" and "coops" in TS.objects["ocean.tide_gauge"].identity_schemes


def test_coops_latest_level_and_plan():
    from connectors import coops
    wl = (FIX / "coops_wl_8410140.json").read_bytes()
    t = coops.table([("coops_stations.json", (FIX / "coops_stations.json").read_bytes(), 0, ""), ("coops_wl_8410140_MLLW.json", wl, 0, "")])
    assert len(t["rows"]) == 1
    r = dict(zip(t["fields"], t["rows"][0]))
    last = [p for p in json.loads(wl)["data"] if p.get("v")][-1]
    assert r["id"] == "8410140" and r["sea_level_m"] == round(float(last["v"]), 3) and r["observed_utc"].endswith("Z")
    assert "MLLW" in r["quality"]
    assert coops.datum_of({"tidal": True}) == "MLLW" and coops.datum_of({"greatlakes": True}) == "IGLD"
    assert coops.datum_of({"tidal": False, "greatlakes": False}) is None          # no common reference: not requested
    assert "application=NEXUM" in coops.LEVEL and "range=1" in coops.LEVEL
    assert [x.resource_key for x in coops.plan("incremental", {}, None)] == ["coops_stations.json"]
    st = coops.next_state({}, None, coops.page_info((FIX / "coops_stations.json").read_bytes()))
    assert len(coops.plan("incremental", st, None)) == 1 + len(st["stations"])


def test_ispra_country_declared_by_the_source():
    recs = [r for r in ispra_rmn.parse((FIX / "ispra_rmn.json").read_bytes(), {"source_id": "ispra.rmn"}) if r.type != "ocean.network"]
    assert all([a.target.value for a in r.assertions if a.type == "located_in"] == ["IT"] for r in recs)
