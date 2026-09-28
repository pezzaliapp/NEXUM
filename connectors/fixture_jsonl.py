"""Connector for large synthetic fixture worlds stored as JSON Lines chunks (benchmarks only)."""

import json

from connectors.fixture_json import _assertions, _t
from nexum.core.records import NormalizedRecord
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"


def describe():
    return {"connector_version": VERSION, "produces": ["*"]}


def plan(mode, state, source, today=None):
    n = int(source.options["chunks"])
    return [FetchRequest(f"file:///{source.local_path}/chunk_{i:03d}.jsonl", f"chunk:{i:03d}", force=True)
            for i in range(n)]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    for i, line in enumerate(data.decode("utf-8").splitlines()):
        if not line:
            continue
        r = json.loads(line)
        yield NormalizedRecord(
            source_id=meta["source_id"], native_id=r["id"], native_version=str(r.get("version", "1")), kind=r["kind"],
            type=r["type"],
            label=r.get("label", r["id"]), identifiers=[tuple(x) for x in r.get("identifiers", [])],
            properties=r.get("properties", {}), geometry=r.get("geometry"), geo_uncertainty_m=r.get("u"),
            t_start_ms=r.get("t_ms"), t_precision="minute" if r.get("t_ms") is not None else None,
            status="reviewed", method="measured" if r["kind"] == "event" else "asserted",
            assertions=_assertions(r.get("assertions")),
            subject=_t(r["subject"]) if r.get("subject") else None, obj=_t(r["object"]) if r.get("object") else None,
            raw_locator=f"line:{i}")
