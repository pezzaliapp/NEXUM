"""Generic connector for synthetic fixture worlds (JSON). Used only by tests and benchmarks.

Format: {"records": [ {kind, type, id, version?, label, identifiers, properties, time?, geometry?,
                        status?, assertions?, subject?, object?} ]}
"""

import json

from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"


def describe():
    return {"connector_version": VERSION, "produces": ["*"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(f"file:///{source.local_path}", f"file:{source.local_path}", force=True)]


def next_state(state, request, result, today=None):
    return state


def _t(d):
    return Target(d["type"], d.get("scheme"), d.get("value"), d.get("name"))


def _assertions(items):
    out = []
    for a in items or []:
        attrs = dict(a.get("attributes") or {})
        if a["kind"] == "relation_evidence":
            attrs["to"] = a["to"]
        out.append(Assertion(a["kind"], a["type"], _t(a["target"]), a.get("direction", "out"), attrs))
    return out


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    for i, r in enumerate(doc["records"]):
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["id"], native_version=str(r.get("version", "1")),
            kind=r["kind"], type=r["type"], label=r.get("label", r["id"]),
            identifiers=[tuple(x) for x in r.get("identifiers", [])], aliases=r.get("aliases", []),
            properties=r.get("properties", {}), geometry=r.get("geometry"),
            geo_uncertainty_m=r.get("geo_uncertainty_m"), t_start_ms=r.get("t_ms"), t_end_ms=r.get("t_end_ms"),
            t_precision=r.get("t_precision", "day" if r.get("t_ms") is not None else None),
            valid_from_ms=r.get("valid_from_ms"), status=r.get("status", "reviewed"),
            method=r.get("method", "asserted"), assertions=_assertions(r.get("assertions")),
            subject=_t(r["subject"]) if r.get("subject") else None, obj=_t(r["object"]) if r.get("object") else None,
            raw_locator=f"$.records[{i}]", text=r.get("text", ""))
