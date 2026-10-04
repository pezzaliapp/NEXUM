"""Wikidata — heads of state and heads of government of the 193 UN member states, and who held those offices since 1990.
Licence: CC0 (Wikidata). Read with SPARQL GET requests to the public endpoint, with NEXUM's neutral User-Agent.

ROLE FACTS ONLY (privacy gate, NEXUM-PHASE3B-PRIVACY-GATE.md): of a person NEXUM keeps the public name and the
Wikidata identifier; never photos, birth dates, family, party, religion, health, contacts or assessments.

The audit's corrections (NEXUM-PHASE3B-POLITICAL-PUBLIC-OPINION-AUDIT.md §6.1), applied here:
  1. primary source = the office's position-held statements (P39); the state's P35/P6 are not used as truth;
  2. humans only (P31 = Q5: fictional characters never become office holders);
  3. jurisdiction: the office's P1001 is checked against the state and the outcome recorded (never silently fixed);
  4. non-deprecated statements, end exclusive; a START after the retrieval day drops the statement and an END after
     it is ignored (the term is still open as far as the source documents it);
  5–6. which open term is current, superseded (a later-starting open term on the same office) or in CONFLICT (several
     current holders, or a preferred rank on a superseded term) is decided per office where every term and the
     office's collegial mark are known (the API layer's tenure operation): never accepted silently;
  7. collegial offices only from an explicit list;
  8. every term carries its statement ID and the number of references (provenance), never a guess."""

import datetime
import json
import urllib.parse

from connectors.base import content_version
from connectors.obs_common import UN193
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
ENDPOINT = "https://query.wikidata.org/sparql?format=json&query="
SINCE = "1990-01-01"
CHUNK = 170
# explicit collegial HEADS OF STATE (audit §6.1 rule 7; never their heads of government): Bosnia and Herzegovina, San Marino, Andorra, Switzerland, Nicaragua
COLLEGIAL = {"BA", "SM", "AD", "CH", "NI"}
ROLE_IT = {"hos": "capo di Stato", "hog": "capo di governo"}

OFFICES_Q = """SELECT ?country ?iso ?hos ?hosLabel ?hog ?hogLabel ?gov ?govLabel ?j WHERE {
 ?country wdt:P463 wd:Q1065 ; wdt:P297 ?iso .
 { ?country wdt:P1906 ?hos . OPTIONAL { ?hos wdt:P1001 ?j } } UNION
 { ?country wdt:P1313 ?hog . OPTIONAL { ?hog wdt:P1001 ?j } } UNION
 { ?country wdt:P208 ?gov }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en,mul". }
}"""

HOLDERS_Q = """SELECT ?office ?person ?personLabel ?st ?rank ?start ?sp ?end ?ep (COUNT(DISTINCT ?ref) AS ?refs) WHERE {
 VALUES ?office { %s }
 ?person p:P39 ?st . ?st ps:P39 ?office ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
 ?person wdt:P31 wd:Q5 .
 OPTIONAL { ?st pqv:P580 ?sv . ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?sp }
 OPTIONAL { ?st pqv:P582 ?ev . ?ev wikibase:timeValue ?end ; wikibase:timePrecision ?ep }
 OPTIONAL { ?st prov:wasDerivedFrom ?ref }
 FILTER(!BOUND(?end) || ?end >= "%sT00:00:00Z"^^xsd:dateTime)
 SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en,mul". ?person rdfs:label ?personLabel }
} GROUP BY ?office ?person ?personLabel ?st ?rank ?start ?sp ?end ?ep"""


def describe():
    return {"connector_version": VERSION, "produces": ["gov.office", "gov.government", "person.public_official", "held_by"]}


def _url(q):
    return ENDPOINT + urllib.parse.quote(" ".join(q.split()))


def plan(mode, state, source, today=None):
    reqs = [FetchRequest(_url(OFFICES_Q), "wikidata_offices.json")]
    offices = sorted((state or {}).get("offices") or [])
    for i in range(0, len(offices), CHUNK):
        vals = " ".join(f"wd:{q}" for q in offices[i:i + CHUNK])
        reqs.append(FetchRequest(_url(HOLDERS_Q % (vals, SINCE)), f"wikidata_holders_{i // CHUNK:02d}.json"))
    return reqs


def _rows(data):
    try:
        return json.loads(data)["results"]["bindings"]
    except (ValueError, KeyError, TypeError):
        return []


def _q(b, k):
    v = b.get(k, {}).get("value")
    return v.rsplit("/", 1)[1] if v else None


def page_info(data):
    rows = _rows(data)
    if not any("iso" in r for r in rows):
        return None
    offices = sorted({_q(r, k) for r in rows if r.get("iso", {}).get("value") in UN193 for k in ("hos", "hog") if k in r})
    return {"offices": offices} if offices else None


def next_state(state, request, result, today=None):
    st = dict(state or {})
    if result and result.get("offices"):
        st["offices"] = result["offices"]
    return st


def _obj(meta, typ, qid, label, props, assertions=()):
    props = {**props, "wikidata": qid}
    return NormalizedRecord(source_id=meta["source_id"], native_id=f"{typ}:{qid}", native_version=content_version([label, props]),
                            kind="object", type=typ, label=label or qid, identifiers=[("wikidata", qid)], properties=props,
                            assertions=list(assertions), status="reviewed", method="asserted", raw_locator=qid)


def parse(data: bytes, meta: dict):
    rows = _rows(data)
    if not rows:
        return
    if any("person" in r for r in rows):
        yield from _holders(rows, meta)
    else:
        yield from _offices(rows, meta)


def _offices(rows, meta):
    offices, govs, country_q = {}, {}, {}
    for r in rows:
        iso = r.get("iso", {}).get("value")
        if iso not in UN193:
            continue
        country_q[iso] = _q(r, "country")
        if "gov" in r:
            govs.setdefault(_q(r, "gov"), {"label": r.get("govLabel", {}).get("value"), "isos": set()})["isos"].add(iso)
        for k in ("hos", "hog"):
            if k not in r:
                continue
            o = offices.setdefault(_q(r, k), {"label": r.get(f"{k}Label", {}).get("value"), "roles": set(), "isos": set(), "j": {}})
            o["roles"].add(k)
            o["isos"].add(iso)
            o["j"].setdefault(iso, set())
            if "j" in r:
                o["j"][iso].add(_q(r, "j"))
    gov_of = {}
    for g, v in sorted(govs.items()):
        for iso in v["isos"]:
            gov_of.setdefault(iso, g)
        yield _obj(meta, "gov.government", g, v["label"], {"country_iso2": sorted(v["isos"])[0]},
                   [Assertion("relation", "governed_through", Target("place.country", scheme="iso3166a2", value=i), direction="in")
                    for i in sorted(v["isos"])])
    for q, o in sorted(offices.items()):
        roles = [ROLE_IT[k] for k in ("hos", "hog") if k in o["roles"]]
        checks = []
        for iso in sorted(o["isos"]):
            js = o["j"].get(iso) or set()
            checks.append("coerente" if country_q.get(iso) in js else "non indicata dalla fonte" if not js else "diversa dallo Stato: segnalata")
        asserts = [Assertion("relation", "office_in", Target("place.country", scheme="iso3166a2", value=i)) for i in sorted(o["isos"])]
        if "hog" in o["roles"]:
            asserts += [Assertion("relation", "office_in", Target("gov.government", scheme="wikidata", value=gov_of[i]))
                        for i in sorted(o["isos"]) if i in gov_of]
        yield _obj(meta, "gov.office", q, o["label"], {
            "role": " e ".join(roles), "collegial": "hos" in o["roles"] and any(i in COLLEGIAL for i in o["isos"]),
            "jurisdiction_check": sorted(set(checks))[0] if len(set(checks)) == 1 else "; ".join(sorted(set(checks))),
            "country_iso2": sorted(o["isos"])[0]}, asserts)


PRECISION = {9: 4, 10: 7, 11: 10}


def _date(v, p):
    if not v:
        return None
    d = v.lstrip("+")[:10]
    return d[:PRECISION.get(int(p or 11), 10)] if int(p or 11) >= 9 else d[:4]


def _ms(d):
    if not d:
        return None
    y, m, dd = (d.split("-") + ["01", "01"])[:3]
    return int(datetime.datetime(int(y), int(m), int(dd), tzinfo=datetime.timezone.utc).timestamp() * 1000)


def _holders(rows, meta, today=None):
    today = today or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    by_office, people = {}, {}
    for r in rows:
        start = _date(r.get("start", {}).get("value"), r.get("sp", {}).get("value"))
        end = _date(r.get("end", {}).get("value"), r.get("ep", {}).get("value"))
        flags = []
        if start and start > today:
            continue                                  # a term that has not started is not a fact yet (rule 4)
        if end and end > today:
            end, flags = None, flags + ["data di fine futura ignorata"]
        person = _q(r, "person")
        people[person] = r.get("personLabel", {}).get("value") or person
        by_office.setdefault(_q(r, "office"), []).append({
            "person": person, "statement": _q(r, "st"), "rank": (r.get("rank", {}).get("value") or "").rsplit("#", 1)[-1].replace("Rank", "").lower(),
            "start": start, "end": end, "start_precision": int(r.get("sp", {}).get("value") or 0) or None,
            "end_precision": int(r.get("ep", {}).get("value") or 0) or None, "references": int(r.get("refs", {}).get("value") or 0),
            "flags": flags})
    for p, label in sorted(people.items()):
        yield _obj(meta, "person.public_official", p, label, {})
    for office, terms in sorted(by_office.items()):
        for t in sorted(terms, key=lambda t: (t["start"] or "", t["statement"])):
            t["status"] = "ended" if t["end"] else "open"     # current / superseded / conflict: decided per office (API)
            props = {k: t[k] for k in ("start", "end", "start_precision", "end_precision", "status", "rank", "statement", "references") if t[k] is not None}
            if t["flags"]:
                props["flags"] = t["flags"]
            yield NormalizedRecord(source_id=meta["source_id"], native_id=t["statement"], native_version=content_version(props),
                                   kind="relation", type="held_by", label="held_by", properties=props,
                                   subject=Target("gov.office", scheme="wikidata", value=office),
                                   obj=Target("person.public_official", scheme="wikidata", value=t["person"]),
                                   valid_from_ms=_ms(t["start"]), status="reviewed", method="asserted", raw_locator=t["statement"])

