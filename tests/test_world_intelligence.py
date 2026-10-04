"""World Intelligence (2026-10-03): regression tests of the integrity fixes and of the new connectors, on small
payloads shaped like the real ones (the real payloads were checked on the live world: see the report)."""

import json

from connectors import (caltrans_cctv, ember_yearly, eurostat_energy_flows, fao_fpma, ilostat_earnings, indicator_common,
                        nasa_eonet, national_fuel, open_webcams, ucdp_candidate, webcam_common, webcam_links,
                        worldbank_indicators)


# ── integrity fixes ──────────────────────────────────────────────────────────
def test_storm_time_is_the_time_of_the_position_shown():
    doc = {"events": [{"id": "EONET_1", "title": "Storm X", "closed": "2019-11-02", "categories": [{"id": "severeStorms"}], "sources": [],
                       "geometry": [{"date": "2019-10-20T00:00:00Z", "type": "Point", "coordinates": [-100.0, 10.0], "magnitudeValue": 30},
                                    {"date": "2019-10-23T12:00:00Z", "type": "Point", "coordinates": [-110.0, 18.0], "magnitudeValue": 120},
                                    {"date": "2019-10-26T00:00:00Z", "type": "Point", "coordinates": [-115.0, 25.0], "magnitudeValue": 40}]}]}
    (r,) = list(nasa_eonet.parse(json.dumps(doc).encode(), {"source_id": "nasa.eonet"}))
    assert r.geometry["coordinates"] == [-110.0, 18.0]                       # the strongest position…
    assert r.t_start_ms == 1571832000000                                      # …at ITS time (2019-10-23T12:00Z), never the first one
    assert r.properties["track_start"] == "2019-10-20T00:00:00Z" and r.properties["position_shown"] == "maximum_wind"


def test_ucdp_provisional_codes_are_said_as_codes():
    assert ucdp_candidate._conflict("XXX130 - XXX130").startswith("conflitto non ancora classificato dalla fonte")
    assert "codice provvisorio XXX482" in ucdp_candidate._actor("XXX482")
    assert ucdp_candidate._conflict("Government of Mali - JNIM") == "Government of Mali - JNIM"
    assert ucdp_candidate.VIOLENCE["1"].startswith("conflitto armato statale")


def test_ucdp_digest_keeps_every_lethal_event():
    head = ",".join(["id", "relid", "year", "active_year", "code_status", "type_of_violence", "conflict_name", "dyad_name", "side_a", "side_b",
                     "where_prec", "adm_1", "adm_2", "latitude", "longitude", "country", "country_id", "region", "event_clarity", "date_prec",
                     "date_start", "date_end", "deaths_a", "deaths_b", "deaths_civilians", "deaths_unknown", "best", "high", "low", "gwnoa", "gwnob"])
    rows = ["1,a,2026,true,Clear,1,Gov - X,Gov - X,Gov,X,1,Adm A,,10.0,20.0,Sudan,625,Africa,1,1,2026-08-01 00:00:00,2026-08-01 00:00:00,0,0,0,0,7,9,7,625,",
            "2,a,2026,true,Clear,3,Y - Civ,Y - Civ,Y,Civilians,2,Adm A,,10.1,20.1,Sudan,625,Africa,1,1,2026-08-02 00:00:00,2026-08-02 00:00:00,0,0,1,0,1,1,1,,"]
    recs = list(ucdp_candidate.parse(("\n".join([head] + rows)).encode(), {"source_id": "ucdp.candidate", "url": "x/GEDEvent_v26_0_8.csv"}))
    events = [r for r in recs if r.type == "conflict.violence_event"]
    (dg,) = [r for r in recs if r.type == "conflict.event_digest"]
    assert len(events) == 1                                                   # the map keeps the declared ≥ 5 deaths filter
    assert dg.properties["events_n"] == 2 and dg.properties["gw"] == 625      # the digest keeps every lethal event (≥ 1)


def test_caltrans_record_time_is_never_the_image_time():
    doc = {"data": [{"cctv": {"index": "1", "inService": "true", "recordTimestamp": {"recordDate": "2016-05-01", "recordTime": "10:00:00"},
                              "location": {"district": 4, "locationName": "I-80 Bay Bridge", "latitude": "37.8", "longitude": "-122.3"},
                              "imageData": {"static": {"currentImageURL": "https://cwwp2.dot.ca.gov/data/d4/cctv/image/x.jpg"}}}}]}
    (r,) = list(caltrans_cctv.parse(json.dumps(doc).encode(), {"source_id": "caltrans.cctv"}))
    assert r.properties["image_observed_at"] is None and r.properties["record_updated_at"] == "2016-05-01T10:00:00"


def test_webcam_availability_current_stale_offline_against_the_list_itself():
    meta = {"source_id": "x"}
    mk = lambda i, t, ok=True: webcam_common.camera(meta, i, "s", i, 10.0, 45.0, "https://x.org/a.jpg", operator="o",   # noqa: E731
                                                     observed_at=t, refresh_min=10, in_service=ok)
    recs = webcam_common.finalize([mk("a", "2026-10-03T13:50:00Z"), mk("b", "2026-09-20T00:00:00Z"), mk("c", None, False)])
    assert [r.properties["availability"] for r in recs] == ["current_snapshot", "stale", "offline"]


# ── new sources ──────────────────────────────────────────────────────────────
def test_indicator_one_object_per_indicator_measured_in_each_country():
    rec = indicator_common.indicator({"source_id": "s"}, "c", "L", "u", {"IT": [("2024", 1.0, None)], "XK": [("2024", 2.0, None)]},
                                     section="energia", topic="t", definition="d", statistic="level", nature="reported",
                                     frequency="annuale", dataset="ds")
    assert rec.properties["coverage_n"] == 1                                  # only the 193 UN member states
    assert [a.target.value for a in rec.assertions] == ["IT"] and rec.assertions[0].attributes == {"key": "IT"}
    assert len(indicator_common.ISO3_TO_2) == 193


def test_worldbank_indicator_skips_aggregates_and_missing_values():
    doc = [{"lastupdated": "2026-07-13"}, [
        {"indicator": {"id": "SP.POP.TOTL"}, "country": {"id": "IT", "value": "Italy"}, "date": "2024", "value": 58990000},
        {"indicator": {"id": "SP.POP.TOTL"}, "country": {"id": "1W", "value": "World"}, "date": "2024", "value": 8e9},
        {"indicator": {"id": "SP.POP.TOTL"}, "country": {"id": "FR", "value": "France"}, "date": "2024", "value": None}]]
    (r,) = list(worldbank_indicators.parse(json.dumps(doc).encode(), {"source_id": "worldbank.indicators"}))
    assert r.properties["by_country"] == [["IT", [["2024", 58990000]]]]


def test_ember_wide_format_keeps_generation_share_and_capacity_apart():
    head = "Area,ISO 3 code,Year,Area type,Electricity source,Is aggregated source,Generation (TWh),Share of generation (%),Capacity (GW)"
    rows = ["France,FRA,2025,Country or economy,Nuclear,False,370.0,67.0,61.4", "Europe,,2025,Region,Nuclear,False,600,20,100"]
    recs = {r.properties["indicator"]: r for r in ember_yearly.parse("\n".join([head] + rows).encode(), {"source_id": "ember.yearly"})}
    assert recs["elec.gen.nuclear"].properties["by_country"] == [["FR", [["2025", 370.0]]]]
    assert recs["elec.share.nuclear"].properties["unit"].startswith("%")
    assert recs["elec.cap.nuclear"].properties["unit"] == "GW"


def test_eurostat_flows_are_declared_by_the_reporter_between_un_states():
    doc = {"id": ["freq", "siec", "partner", "unit", "geo", "time"], "size": [1, 1, 3, 1, 1, 2], "updated": "2026-06-24",
           "dimension": {k: {"category": {"index": v}} for k, v in {"freq": {"A": 0}, "siec": {"G3000": 0}, "unit": {"MIO_M3": 0},
                                                                    "partner": {"DZ": 0, "EU27_2020": 1, "NO": 2}, "geo": {"IT": 0},
                                                                    "time": {"2023": 0, "2024": 1}}.items()},
           "value": {"0": 20000.0, "1": 23267.3, "2": 1.0, "3": 1.0, "4": 0, "5": 0}}
    recs = list(eurostat_energy_flows.parse(json.dumps(doc).encode(), {"source_id": "e", "url": eurostat_energy_flows.BASE + "nrg_ti_gas?x"}))
    assert [(r.subject.value, r.obj.value) for r in recs] == [("IT", "DZ")]   # no aggregate, no zero-only arc
    assert recs[0].type == "imports_gas_from" and recs[0].properties["latest"] == ["2024", 23267.3]


def test_ilostat_one_source_per_country_never_spliced():
    csv = ('"ref_area","source","indicator","sex","classif1","time","obs_value"\n'
           '"ITA","BA:325","X","SEX_T","CUR_TYPE_LCU","2020",1365.5\n"ITA","BB:3069","X","SEX_T","CUR_TYPE_LCU","2024",3329.9\n'
           '"ITA","BB:3069","X","SEX_T","CUR_TYPE_LCU","2025",3534.3\n')
    recs = list(ilostat_earnings.parse(csv.encode(), {"source_id": "i", "url": ilostat_earnings.BASE.format("EAR_EMTA_SEX_CUR_NB_A")}))
    mean = next(r for r in recs if r.properties["indicator"] == "ilo.earnings.mean")
    pts = dict(mean.properties["by_country"])["IT"]
    assert [p[0] for p in pts] == ["2024", "2025"] and all("BB:3069" in p[2] for p in pts)


def test_fpma_keeps_national_average_retail_only():
    doc = {"results": [
        {"uuid": "a", "iso3_country_code": "GBR", "commodity_name": "Bread", "market_name": "National Average", "market_type": "Retail",
         "price_type": "RETAIL", "periodicity": [{"end_date": "2026-08-01"}], "currency": "GBP", "measure_unit_label": "800 gms", "source_name": "ONS"},
        {"uuid": "b", "iso3_country_code": "GBR", "commodity_name": "Bread", "market_name": "London", "market_type": "National capital city",
         "price_type": "RETAIL", "periodicity": [{"end_date": "2026-09-01"}], "currency": "GBP", "measure_unit_label": "800 gms", "source_name": "ONS"}]}
    sel = fao_fpma.select(doc)
    assert list(sel) == ["a"] and sel["a"]["c"] == "GB" and sel["a"]["k"] == "bread"   # never the capital city's price


def test_uruguay_fuel_carries_unchanged_prices_and_says_regulated():
    text = "﻿﻿Año;Mes;Producto;Unidad;Valor\r\n2026;6;SUPER 95 30-S;88,1;$/lt\r\n2026;6;SUPER 95 30-S;88,1;$/lt\r\n2026;7;SUPER 95 30-S;S/C;S/C\r\n"
    recs = list(national_fuel.parse(text.encode(), {"source_id": "uy.ancap_fuel"}))
    (r,) = [x for x in recs if x.properties["fuel_type"] == "petrol"]
    assert [p[2] for p in r.properties["series"]] == [88.1, 88.1] and "MASSIMO" in r.properties["definition"]


def test_open_webcams_and_the_parma_link_only_camera():
    xml = b"""<image-list><image><key>H1</key><region>R</region><district>D</district><description>Road [H1]</description>
      <latitude>22.2</latitude><longitude>114.1</longitude><url>https://tdcctv.data.one.gov.hk/H1.JPG</url></image></image-list>"""
    (r,) = list(open_webcams.parse(xml, {"source_id": "hk.td_cctv"}))
    assert r.properties["image_url"].startswith("https://tdcctv.data.one.gov.hk/") and r.properties["availability"] == "current_snapshot"
    doc = {"entities": {"Q21194420": {"claims": {"P625": [{"mainsnak": {"datavalue": {"value": {"latitude": 44.801922, "longitude": 10.327664}}}}]}}}}
    (p,) = list(webcam_links.parse(json.dumps(doc).encode(), {"source_id": "curated.webcam_links"}))
    assert p.properties["availability"] == "link_only" and p.properties["image_url"] is None
    assert p.properties["page_url"] == "https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi"
    assert p.geometry["coordinates"] == [10.327664, 44.801922]


# ── final data integrity gate (2026-10-04) ───────────────────────────────────
def test_ilostat_earnings_are_ambiguous_with_a_readable_source_and_no_gross_claim():
    csv = ('"ref_area","ref_area.label","source","source.label","indicator","indicator.label","sex","sex.label","classif1","classif1.label",'
           '"time","obs_value","obs_status","obs_status.label","note_classif","note_classif.label","note_indicator","note_indicator.label","note_source","note_source.label"\n'
           '"ITA","Italy","BB:3069","HIES - EU Statistics on Income and Living Conditions","X","Average monthly earnings of employees by sex and currency",'
           '"SEX_T","Total","CUR_TYPE_LCU","Currency: Local currency","2025",3534.346,,,,,"T30:184","Currency: ITA - Euro (EUR)","R1","Repository: ILO-STATISTICS - Micro data processing"\n')
    recs = {r.properties["indicator"]: r for r in ilostat_earnings.parse(csv.encode(), {"source_id": "i", "url": ilostat_earnings.BASE.format("EAR_EMTA_SEX_CUR_NB_A")})}
    m = recs["ilo.earnings.mean"].properties
    assert m["nature"] == "ambiguous" and "lorda" not in m["indicator_label"]
    (pt,) = dict(m["by_country"])["IT"]
    assert pt[1] == 3534.35 and "EU Statistics on Income and Living Conditions" in pt[2] and "anno precedente" in pt[2]


def test_values_outside_their_definition_are_flagged_never_changed():
    rec = indicator_common.indicator({"source_id": "s"}, "c", "L", "%", {"IT": [("2025", -0.3, None)], "FR": [("2025", 101.0, None)]},
                                     section="energia", topic="t", definition="d", statistic="share", nature="reported",
                                     frequency="annuale", dataset="ds")
    pts = dict(rec.properties["by_country"])
    assert pts["IT"][0][1] == -0.3 and pts["IT"][0][2].startswith("ANOMALIA")
    assert pts["FR"][0][1] == 101.0 and pts["FR"][0][2].startswith("ANOMALIA") and rec.properties["anomalies_n"] == 2


def test_storm_with_an_invalid_source_point_keeps_a_valid_position():
    doc = {"events": [{"id": "X", "title": "Super Typhoon Maria", "closed": "2018-07-16", "categories": [{"id": "severeStorms"}], "sources": [],
                       "geometry": [{"date": "2018-07-02T06:00:00Z", "type": "Point", "coordinates": [151.1, 93.0]},
                                    {"date": "2018-07-03T00:00:00Z", "type": "Point", "coordinates": [150.4, 9.6]}]}]}
    (r,) = list(nasa_eonet.parse(json.dumps(doc).encode(), {"source_id": "nasa.eonet"}))
    assert r.geometry == {"type": "Point", "coordinates": [150.4, 9.6]} and r.t_start_ms == 1530576000000


def test_ucdp_provisional_conflicts_have_a_readable_label_and_keep_the_code_in_the_facts():
    head = ",".join(["id", "type_of_violence", "conflict_name", "dyad_name", "side_a", "side_b", "where_prec", "adm_1", "adm_2", "latitude",
                     "longitude", "country", "country_id", "event_clarity", "date_prec", "date_start", "date_end", "best", "high", "low",
                     "gwnoa", "gwnob", "code_status", "region", "deaths_a", "deaths_b", "deaths_civilians", "deaths_unknown"])
    row = "9,1,XXX475 - XXX475,XXX475 - XXX475,XXX475,XXX475,2,Zamfara,Maradun,12.5,6.3,Nigeria,475,1,1,2026-08-01,2026-08-01,6,6,6,,,Check dyad,Africa,0,0,6,0"
    (ev,) = [r for r in ucdp_candidate.parse((head + "\n" + row).encode(), {"source_id": "u", "url": "x/f.csv"}) if r.type == "conflict.violence_event"]
    assert ev.label.startswith("Violenza organizzata (attori non identificati dalla fonte)") and "XXX" not in ev.label
    assert ev.properties["conflict_code"] == "XXX475 - XXX475"
