"""Exposure policy of published raw records (2026-10-11): a connector that declares RAW_FIELDS publishes only those
fields of a raw record (the provenance view and the snapshot's raw extractions); the Raw Store is never changed."""

import sqlite3

import pytest

from connectors import ucdp_candidate
from nexum import worlds
from nexum.api.rawx import RawExtractor
from nexum.api.server import raw_fields
from nexum.core.raw import RawStore
from nexum.core.registry import load_registry

SOURCE_COLUMNS = ("source_article", "source_office", "source_date", "source_headline", "source_original")


def test_ucdp_declares_only_the_imported_fields():
    assert ucdp_candidate.RAW_FIELDS == ucdp_candidate.KEEP
    assert not any(c.startswith("source_") for c in ucdp_candidate.RAW_FIELDS)


def test_registry_policy_reaches_the_extractor():
    cfg = worlds.live()
    sources = load_registry([f"{cfg.root}/{d}" for d in cfg.source_dirs])
    pol = raw_fields(sources)
    assert pol["ucdp.candidate"] == frozenset(ucdp_candidate.KEEP)
    assert "usgs.earthquakes" not in pol            # sources without a declaration publish their record unchanged


def test_extraction_keeps_only_the_declared_fields(tmp_path):
    header = ["id", "country", "best"] + list(SOURCE_COLUMNS)
    row = ["7", "Colombia", "8", "Diario,2026-04-20,Titolo", "Diario", "2026-04-20", "Titolo con un nome", "Diario"]
    data = (",".join(header) + "\n" + ",".join(f'"{v}"' for v in row) + "\n").encode()
    store = RawStore(tmp_path)
    sha, path = store.put(data)
    store.append_manifest({"raw_id": "r1", "source_id": "ucdp.candidate", "sha256": sha, "url": "https://example.org",
                           "fetched_ms": 0, "path": path})
    store.append_manifest({"raw_id": "r2", "source_id": "other.source", "sha256": sha, "url": "https://example.org",
                           "fetched_ms": 0, "path": path})
    x = RawExtractor(tmp_path, {"ucdp.candidate": frozenset(ucdp_candidate.KEEP)})
    rec = x.extract("r1", "row:2")
    assert set(rec["record"]) == {"id", "country", "best"}
    assert rec["omitted_fields"] == sorted(SOURCE_COLUMNS)
    other = x.extract("r2", "row:2")                # no declaration: the record as the source gave it
    assert set(other["record"]) == set(header) and other["omitted_fields"] is None
    assert store.get(sha) == data                   # the Raw Store is untouched


def test_published_world_ucdp_extractions_have_no_source_columns():
    cfg = worlds.live()
    try:
        c = sqlite3.connect(f"file:{cfg.db_path}?mode=ro", uri=True)
        rows = c.execute("SELECT raw_id, raw_locator FROM record WHERE source_id='ucdp.candidate' LIMIT 50").fetchall()
    except sqlite3.Error:
        pytest.skip("no live world on this machine")
    if not rows:
        pytest.skip("no UCDP records in the live world")
    sources = load_registry([f"{cfg.root}/{d}" for d in cfg.source_dirs])
    x = RawExtractor(cfg.raw_dir, raw_fields(sources))
    for raw_id, loc in rows:
        rec = x.extract(raw_id, loc)["record"]
        assert not any(k.startswith("source_") for k in rec), (raw_id, loc)
