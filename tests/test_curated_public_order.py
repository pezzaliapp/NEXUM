"""Documented public-order episodes (2026-10-19, author's authorisation, local example: Milan, 17–18 October 2026).
Every fact, figure and statement cites sources that exist in the file; URLs are the publishers' own, clean; figures are
attributed; statements and accusations are not facts; an organiser is linked only to the event it called, never to the
violence; no person is an element; the verification status counts outlets and never claims an independent or official
check; figures and statements say when they were given; the source is not fetched by the automation; the events land
in Milan."""
import json
import pathlib
import re
import urllib.parse

from connectors import curated_public_order as cpo
from nexum.core.types import load_types

ROOT = pathlib.Path(__file__).resolve().parents[1]
TS = load_types([str(ROOT / "vocab_live")])
D = cpo.DATA


def _entity(qid, lat=45.46, lon=9.19):
    return json.dumps({"entities": {qid: {"claims": {"P625": [{"mainsnak": {"datavalue": {"value": {"latitude": lat, "longitude": lon}}}}]}}}}).encode()


def _all():
    out = []
    for q in sorted(set(D["places"]) | {D["city"]["wikidata"]}):
        out += list(cpo.parse(_entity(q), {"source_id": "curated.public_order"}))
    return out


def test_every_citation_exists_and_every_url_is_clean():
    for k, s in D["sources"].items():
        u = urllib.parse.urlsplit(s["url"])
        assert u.scheme == "https" and u.netloc and not u.query and not u.fragment, (k, s["url"])
        assert not re.search(r"utm_|chatgpt|openai|fbclid|gclid", s["url"], re.I), s["url"]
        assert s["outlet"] and s["title"] and re.match(r"2026-10-1[78]", s["published"])
    for ep in D["episodes"]:
        assert cpo.cited(ep), ep["id"]
        for k in cpo.cited(ep):
            assert k in D["sources"], (ep["id"], k)
    for a in D["actors"].values():
        assert a["sources"] and all(k in D["sources"] for k in a["sources"])


def test_figures_are_attributed_and_statements_are_not_facts():
    for ep in D["episodes"]:
        for f in ep.get("figures") or []:
            assert f["by"] and f["reported_by"], (ep["id"], f)
        for s in ep.get("statements") or []:
            assert s["nature"] in ("dichiarazione", "accusa", "testimonianza") and s["reported_by"]
        # accusations only inside a statements episode or as a statement, never among the facts
        assert not any("accus" in f["text"].lower() for f in ep.get("facts") or [])
        assert ep["category"] in cpo.CATEGORY and ep["verification"] in cpo.VERIFICATION
    # figures that differ between sources are kept apart, never merged
    fig17 = next(e for e in D["episodes"] if e["id"] == "mi-20261017-cifre")
    assert len(fig17["figures"]) >= 4 and fig17["verification"] == "attributed"


def test_verification_counts_outlets_never_an_independent_or_official_check():
    for name in list(cpo.VERIFICATION.values()):
        assert not re.search(r"indipendent|ufficial|certific|verificato", name, re.I), name
    for ep in D["episodes"]:
        # figures and statements: when they were given, never a time of the violence
        if ep["category"] in ("figures", "statements"):
            assert ep.get("when_note"), ep["id"]
        # an accusation is one claim: a proposal or an announcement is a statement of its own
        for s in ep.get("statements") or []:
            if s["nature"] == "accusa":
                assert not re.search(r"annunciat|propost", s["text"], re.I), s["text"]


def test_organiser_only_of_the_march_and_no_attribution_of_responsibility():
    for ep in D["episodes"]:
        org = [r for r in ep.get("roles") or [] if r["role"] == "organizer_reported"]
        assert not org or ep["category"] == "march", ep["id"]
        assert cpo.episode_props(ep)["attributions"] == []
    for a in D["actors"].values():
        assert a["type"] in ("civil.movement", "gov.public_safety")      # organisations and authorities, no person


def test_records_validate_and_land_in_milan():
    recs = _all()
    evs = [r for r in recs if r.kind == "event"]
    assert len(evs) == len(D["episodes"]) and len({r.native_id for r in evs}) == len(evs)
    for r in recs:
        TS.validate_props(r.type, r.properties)
        assert r.status == "preliminary" and r.properties["review"] == "author"
    for r in evs:
        loc = [a for a in r.assertions if a.type == "location"]
        assert len(loc) == 1 and loc[0].target.scheme == "ne_place" and loc[0].target.value == D["city"]["ne_place"]
        for a in r.assertions:
            assert a.type in TS.entity(cpo.EVENT).roles
        assert "Milano" in r.label and "Milano" in r.text
    # local time (CEST) → UTC: the Carrefour at 15:05 is 13:05 UTC
    car = next(r for r in evs if r.native_id == "mi-20261018-carrefour")
    assert car.t_start_ms == 1792328700000 and car.t_precision == "minute"


def test_not_fetched_by_the_automation():
    pipe = (ROOT / ".github" / "nexum-events" / "pipeline.py").read_text(encoding="utf-8")
    assert "curated.public_order" not in pipe
