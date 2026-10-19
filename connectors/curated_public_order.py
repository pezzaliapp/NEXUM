"""Documented public-order episodes, curated by hand (2026-10-19, author's authorisation for a LOCAL example: Milan,
17–18 October 2026; model in NEXUM-NEWS-ACTORS-GRAPH-PROPOSAL.md). One NEXUM event per episode, written by the
operator from public sources that were opened and read: date, place, category, verification status, the facts with
their sources, the figures as claims (who gave them, who reported them, when), statements and accusations said as
such. Never GDELT's automatic coding, never mixed with it.

The episodes live in curated_public_order.json (data, not code); the connector fetches only the Wikidata entity of
each episode's place (CC0) for its coordinates, as curated.webcam_links does. Links to movements, organisations and
authorities are participation roles taken only from the episode's own documented roles (an organiser only of the
event it called, never of the violence); no person is an element. Not part of any scheduled run: the sources the
automation fetches are listed in .github/nexum-events/pipeline.py, and this one is not among them."""

import datetime as dt
import json
import pathlib

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"
DATA = json.loads(pathlib.Path(__file__).with_name("curated_public_order.json").read_text(encoding="utf-8"))
EVENT = "civil.public_order_event"
ROME = dt.timezone(dt.timedelta(hours=2))          # CEST: every episode of this file is before 25 October 2026
CATEGORY = {"march": "Corteo o manifestazione", "clashes": "Scontri", "looting": "Saccheggi", "fire": "Incendi",
            "damage": "Danneggiamenti", "figures": "Cifre attribuite", "statements": "Dichiarazioni pubbliche"}
# how many outlets report each fact: never a verification of NEXUM's own, never an official certification
VERIFICATION = {"concordant": "concorde tra più testate", "two_sources": "riportato da due testate",
                "single_source": "riportato da una sola testata", "reported": "riportato (ogni fatto da due testate)",
                "attributed": "cifre attribuite, discordanti", "statement": "dichiarazioni, non fatti accertati"}


def describe():
    return {"connector_version": VERSION, "produces": [EVENT, "civil.movement", "gov.public_safety"]}


def plan(mode, state, source, today=None):
    qids = sorted(set(DATA["places"]) | {DATA["city"]["wikidata"]})
    return [FetchRequest(f"https://www.wikidata.org/wiki/Special:EntityData/{q}.json", f"wikidata_{q}.json") for q in qids]


def next_state(state, request, result, today=None):
    return state


def _src(keys):
    return [{"ref": k, **DATA["sources"][k]} for k in keys]


def when(ep):
    """UTC milliseconds and precision of an episode's local date (and time, when the sources give it)."""
    d = dt.date.fromisoformat(ep["date"])
    if ep.get("time"):
        h, m = map(int, ep["time"].split(":"))
        t = dt.datetime(d.year, d.month, d.day, h, m, tzinfo=ROME)
        return int(t.timestamp() * 1000), "minute"
    return int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000), "day"


def cited(ep) -> list[str]:
    keys = []
    for part in ("facts", "roles"):
        for x in ep.get(part) or []:
            keys += x["sources"]
    for part in ("figures", "statements"):
        for x in ep.get(part) or []:
            keys += x["reported_by"]
    return list(dict.fromkeys(keys))


def episode_props(ep):
    keys = cited(ep)
    return {
        "category": ep["category"], "category_name": CATEGORY[ep["category"]],
        "verification": ep["verification"], "verification_name": VERIFICATION[ep["verification"]],
        "summary": ep["summary"], "place_detail": ep["place_detail"], "place_wikidata": ep["place"],
        "when_note": ep.get("when_note"),
        "facts": [{"text": f["text"], "sources": f["sources"]} for f in ep.get("facts") or []],
        "figures": [{"text": f["text"], "by": f["by"], "reported_by": f["reported_by"], "as_of": f.get("as_of")} for f in ep.get("figures") or []],
        "statements": [{"nature": s["nature"], "by": s.get("by"), "text": s["text"], "reported_by": s["reported_by"]} for s in ep.get("statements") or []],
        "roles": [{"role": r["role"], "actor": DATA["actors"][r["actor"]]["label"], "sources": r["sources"]} for r in ep.get("roles") or []],
        "attributions": [],                    # no responsibility for the violence is documented by an authority or a court
        "notes": list(ep.get("notes") or []),
        "sources": _src(keys), "n_sources": len({DATA["sources"][k]["outlet"] for k in keys}),
        "review": DATA["review"], "curated_at": DATA["curated_at"],
    }


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for qid, ent in (doc.get("entities") or {}).items():
        claims = (ent.get("claims") or {}).get("P625") or []
        if not claims:
            continue
        v = claims[0]["mainsnak"]["datavalue"]["value"]
        lon, lat = round(v["longitude"], 6), round(v["latitude"], 6)
        city = DATA["city"]
        if qid == city["wikidata"]:
            for aid, a in DATA["actors"].items():
                props = {"note": a["note"], "sources": _src(a["sources"]), "review": DATA["review"]}
                yield NormalizedRecord(
                    source_id=meta["source_id"], native_id=aid, native_version=content_version(props | {"label": a["label"]}),
                    kind="object", type=a["type"], label=a["label"], identifiers=[("nexum_actor", aid)], properties=props,
                    status="preliminary", method="asserted", raw_locator=f"$.entities.{qid}", text=f"{a['label']} {city['label']}")
        for i, ep in enumerate(DATA["episodes"]):
            if ep["place"] != qid:
                continue
            props = episode_props(ep)
            t, prec = when(ep)
            roles = [Assertion("participation", "location", Target("place.settlement", "ne_place", city["ne_place"]))]
            for r in ep.get("roles") or []:
                a = DATA["actors"][r["actor"]]
                roles.append(Assertion("participation", r["role"], Target(a["type"], "nexum_actor", r["actor"])))
            yield NormalizedRecord(
                source_id=meta["source_id"], native_id=ep["id"],
                native_version=content_version(props | {"label": ep["label"], "t": t, "lon": lon, "lat": lat}),
                kind="event", type=EVENT, label=ep["label"], identifiers=[("nexum_episode", ep["id"])], properties=props,
                geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=5000.0 if qid == city["wikidata"] else 250.0,
                t_start_ms=t, t_precision=prec, status="preliminary", method="asserted", assertions=roles,
                raw_locator=f"$.entities.{qid}",
                text=f"{city['label']} Milan {ep['place_detail']} {props['category_name']} ordine pubblico episodio documentato")
