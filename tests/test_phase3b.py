"""Phase 3B · blocks 1–5 on the live world (data/live/nexum.db, built by `python3 -m nexum.cli live …`): webcams
(https images only from the declared allowlist), observations (value, dates, source; reality and perception never
merged), governments (humans, temporal validity, conflicts, future dates, provenance), fuel (unit, currency, date,
31-state coverage), tolls (the law's rates, every section kept), and the neutral User-Agent."""

import datetime
import json
import pathlib
import sqlite3
import urllib.parse

import pytest

from connectors import wikidata_heads
from connectors.bfstrmg_tariff import tariff_from_xml
from connectors.obs_common import UN193
from nexum.api import server
from nexum.core.registry import load_registry
from nexum.core.scheduler import USER_AGENT
from tests.conftest import ROOT

DB = ROOT / "data" / "live" / "nexum.db"
pytestmark = pytest.mark.skipif(not DB.exists(), reason="live world not built")


@pytest.fixture(scope="module")
def live():
    w = server.Worker(DB, load_registry([ROOT / "sources", ROOT / "sources_live"]), server.CancelRegistry(), 65536)
    yield w
    w.conn.close()


def props(conn, typ):
    return [json.loads(p) for (p,) in conn.execute("SELECT props_json FROM object WHERE type=? AND status!='retracted'", (typ,))]


# ── block 1: webcams ──────────────────────────────────────────────────────────────────────────────────────────────
def test_every_webcam_image_is_https_on_the_declared_allowlist(live):
    hosts = json.loads((ROOT / "ui" / "media-hosts.json").read_text())["img"]
    seen = set()
    for p in props(live.conn, "camera.public_webcam"):
        if p.get("availability") == "link_only":   # declared change (2026-10-03): link only (Parma), never an image
            # declared change (2026-10-04): the publisher's page may be http (a link opened in a new tab, never an image
            # loaded into NEXUM); the images NEXUM shows stay https and on the allowlist
            assert p.get("image_url") is None and urllib.parse.urlparse(p["page_url"]).scheme in ("https", "http")
            continue
        u = urllib.parse.urlparse(p["image_url"])
        assert u.scheme == "https", p["image_url"]
        seen.add(f"https://{u.netloc}")
    assert seen and seen <= set(hosts), seen - set(hosts)


# ── block 2: observations ─────────────────────────────────────────────────────────────────────────────────────────
def test_observations_have_value_dates_and_source_and_never_an_index(live):
    d = server.observations_of(live.q)["data"]
    assert not server.observations_of(live.q)["truncated"]
    for e, series in d["by_entity"].items():
        for s in series:
            df = d["defs"][s["def"]]
            assert df["source_id"] and df["kind"] in ("survey", "official", "price")
            assert s["points"] and all(p[1] and isinstance(p[2], (int, float)) for p in s["points"])
            assert [p[1] for p in s["points"]] == sorted(p[1] for p in s["points"])
            if df["kind"] == "survey" and df["props"].get("statistic") == "share":
                assert all(p[3] for p in s["points"]), "a survey share without its sample size"
            assert not {"index", "score", "truth", "gap"} & set(df["props"]), df["props"]


def test_a_reworded_question_never_joins_a_series():
    assert server._wording("QA2.3. What are your expectations : x", "Better") == server._wording("QA2.1 What are your expectations: x", "Better")
    assert server._wording("What are your expectations? x", "Better") != server._wording("What do you expect? x", "Better")


# ── block 3: governments ──────────────────────────────────────────────────────────────────────────────────────────
def test_wikidata_query_reads_humans_only_and_neutral_user_agent():
    assert "wdt:P31 wd:Q5" in wikidata_heads.HOLDERS_Q
    assert "FILTER(?rank != wikibase:DeprecatedRank)" in wikidata_heads.HOLDERS_Q
    for banned in ("P18", "P569", "P570", "P102", "P140", "P26", "P40"):          # photo, birth, death, party, religion, family
        assert banned not in wikidata_heads.HOLDERS_Q + wikidata_heads.OFFICES_Q
    assert "@" not in USER_AGENT and "/Users/" not in USER_AGENT and "NEXUM" in USER_AGENT


def test_future_start_dropped_future_end_ignored_statement_kept():
    tomorrow = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
    row = lambda st, s, e: {"office": {"value": "http://www.wikidata.org/entity/Q1"}, "person": {"value": f"http://www.wikidata.org/entity/{st}"},
                            "personLabel": {"value": st}, "st": {"value": f"http://www.wikidata.org/entity/statement/{st}"},
                            "rank": {"value": "http://wikiba.se/ontology#NormalRank"}, "refs": {"value": "2"},
                            **({"start": {"value": s + "T00:00:00Z"}, "sp": {"value": "11"}} if s else {}),
                            **({"end": {"value": e + "T00:00:00Z"}, "ep": {"value": "11"}} if e else {})}
    recs = list(wikidata_heads._holders([row("A", "2020-01-01", tomorrow), row("B", tomorrow, None)], {"source_id": "wikidata.heads"}))
    rels = [r for r in recs if r.kind == "relation"]
    assert [r.native_id for r in rels] == ["A"]                                   # B has not started: not a fact yet
    a = rels[0].properties
    assert "end" not in a and a["status"] == "open" and a["flags"] == ["data di fine futura ignorata"]
    assert a["statement"] == "A" and a["references"] == 2
    assert all(set(r.properties) <= {"wikidata"} for r in recs if r.kind == "object")   # a person: name and identifier only


def test_tenures_never_current_when_superseded_or_undated_and_conflicts_shown(live):
    d = server.tenures_of(live.q)["data"]
    for oid, o in d["offices"].items():
        cur = [t for t in o["terms"] if t[4] in ("current", "conflict")]
        assert all(t[2] for t in cur), "an undated term shown as current"
        assert all(t[4] not in ("current", "conflict") for t in o["terms"] if t[4] in ("superseded", "undated", "ended"))
        if o["outcome"] == "unique":
            assert len({t[0] for t in cur}) == 1
        if o["outcome"] == "ambiguous":
            assert all(t[4] == "conflict" for t in cur)
        if len({t[0] for t in cur}) > 1:
            assert o["collegial"] or o["outcome"] == "ambiguous"
        assert all(t[5] for t in o["terms"]), "a term without its statement (provenance)"


def test_heads_coverage_is_not_below_the_audited_baseline(live):
    """The audit's reliable baseline (heads of state 179, heads of government 160 of 193) is a floor, never raised
    nor lowered to pass; raw 192/187 counts are never used."""
    d = server.tenures_of(live.q)["data"]
    iso = dict(live.conn.execute("SELECT o.object_id, i.value FROM object o JOIN identifier i ON i.entity_id=o.object_id "
                                 "WHERE o.type='place.country' AND i.scheme='iso3166a2'").fetchall())
    ok = {"capo di Stato": set(), "capo di governo": set()}
    for e, offs in d["by_entity"].items():
        if iso.get(e) not in UN193:
            continue
        for o in offs:
            of = d["offices"][o]
            for role in ok:
                if role in (of["role"] or "") and of["outcome"] in ("unique", "collegial"):
                    ok[role].add(iso[e])
    assert len(ok["capo di Stato"]) >= 179 and len(ok["capo di governo"]) >= 160, {k: len(v) for k, v in ok.items()}


# ── block 4: fuel ─────────────────────────────────────────────────────────────────────────────────────────────────
def test_fuel_prices_have_unit_currency_dates_and_declared_coverage(live):
    ps = props(live.conn, "observation.fuel_price")
    assert {p["country_iso2"] for p in ps} == set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK GB US CA MY NO CH UY NZ AU UA".split())
    for p in ps:
        assert p["unit"] and p["currency"] in ("EUR", "GBP", "USD", "CAD", "MYR", "NOK", "CHF", "UYU", "NZD", "AUD", "UAH") and p["frequency"]
        for a, b, v, *_ in p["series"]:
            datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
            assert v > 0
        for t in p.get("taxes") or []:
            assert t[0] and t[2] and datetime.date.fromisoformat(t[3])
    hint = json.loads(live.conn.execute("SELECT display_hints FROM object_type WHERE type_id='observation.fuel_price'").fetchone()[0])
    # declared changes: 2026-10-03 + Norway, Switzerland, Uruguay (maximum prices by decree); 2026-10-04 + New Zealand,
    # Australia, Ukraine (completion of the fuel coverage)
    assert "37 Stati su 193" in hint["series"]["coverage"] and "world" not in json.dumps(hint).lower()


# ── block 5: tolls ────────────────────────────────────────────────────────────────────────────────────────────────
def test_toll_rates_from_the_law_and_every_section_kept(live):
    t = props(live.conn, "toll.tariff")[0]
    assert len(t["rates"]) == 204 and t["unit"] == "EUR/km" and t["validity"]
    row = next(r for r in t["rates"] if r[:3] == [5, "A", 1])
    assert row[3] == 0.348 and round(sum(row[4:]), 3) == 0.348                    # the audit's checked example
    secs = props(live.conn, "toll.road_section")
    assert sum(p["segment_count"] for p in secs) == sum(len(p["segments"]) for p in secs) > 130_000
    assert all(p["valid_from"] and p["table_version"] for p in secs)
    assert len(secs) < 2000, "sections are packaged per road and state, never one object per section (O7)"


def test_tariff_parser_refuses_a_changed_shape():
    with pytest.raises(Exception):
        tariff_from_xml("<enbez>Anlage 1</enbez><P>nothing</P><enbez>Anlage 2</enbez>")
