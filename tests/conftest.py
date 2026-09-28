"""Shared fixtures. D1 (real data) must be built beforehand by `python3 bench/run_phase1.py --build`;
D1 tests fail (never skip) if it is missing, because D1 criteria require real data."""

import dataclasses
import pathlib
import shutil
import socket
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from nexum.worlds import d1, d3, grouping  # noqa: E402
from nexum.core.db import connect  # noqa: E402
from nexum.core.pipeline import Nexum  # noqa: E402
from nexum.core.query import Query  # noqa: E402
from nexum.core.registry import load_registry  # noqa: E402

D1_DB = ROOT / "data" / "d1" / "nexum.db"


def build(cfg_fn, tmp: pathlib.Path, **kw):
    cfg = cfg_fn(**kw) if kw else cfg_fn()
    cfg = dataclasses.replace(cfg, db_path=str(tmp / "nexum.db"), raw_dir=str(tmp / "raw"))
    nx = Nexum(cfg)
    nx.fetch(mode="backfill")
    nx.process()
    return nx


@pytest.fixture(scope="session")
def d1_conn():
    if not D1_DB.exists():
        pytest.fail("D1 world missing: run `python3 bench/run_phase1.py --build` (real data are required for D1 criteria)")
    conn = connect(str(D1_DB))
    yield conn
    conn.close()


@pytest.fixture(scope="session")
def d1_sources():
    return load_registry([ROOT / "sources"])


@pytest.fixture(scope="session")
def d1_query(d1_conn, d1_sources):
    return Query(d1_conn, d1_sources)


@pytest.fixture(scope="session")
def d3_world(tmp_path_factory):
    nx = build(d3, tmp_path_factory.mktemp("d3"))
    yield nx
    nx.close()


@pytest.fixture(scope="session")
def d3_query(d3_world):
    return Query(d3_world.conn, d3_world.sources)


@pytest.fixture
def no_network(monkeypatch):
    """Block every outbound socket connection (offline tests)."""
    def refuse(*a, **k):
        raise OSError("network disabled by test")
    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    yield


def d1_copy(tmp_path):
    """A private copy of the D1 database for tests that write."""
    for suffix in ("", "-wal", "-shm"):
        src = pathlib.Path(str(D1_DB) + suffix)
        if src.exists():
            shutil.copy(src, tmp_path / ("nexum.db" + suffix))
    return tmp_path / "nexum.db"


def eid(conn, scheme, value):
    r = conn.execute("SELECT entity_id FROM identifier WHERE scheme=? AND value=? ORDER BY strong DESC", (scheme, value)).fetchone()
    assert r, f"{scheme}:{value} not found"
    return r[0]


__all__ = ["build", "d1_copy", "eid", "ROOT", "d1", "d3", "grouping"]
