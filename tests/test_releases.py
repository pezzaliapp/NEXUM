"""Reference-world releases (2026-10-11): the newest is chosen by publishedAt, pruning never deletes the current
reference or a protected/prod-* release, and missing, equal or inconsistent dates stop everything."""

import datetime as dt
import importlib.util
import json
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".github" / "nexum-events" / "releases.py"
_spec = importlib.util.spec_from_file_location("releases", SCRIPT)
rel = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rel)

NOW = dt.datetime(2026, 10, 12, 12, 0, tzinfo=dt.timezone.utc)
COMMIT = "2026-10-11T17:09:20Z"     # createdAt on GitHub: the tagged commit, the same for every release


def r(tag, published, draft=False):
    return {"tagName": tag, "isDraft": draft, "publishedAt": published, "createdAt": COMMIT}


# 9 releases, as `gh release list` returns them (newest first is not guaranteed: shuffled on purpose)
ROWS = [
    r("world-723-20261011T1748Z", "2026-10-11T17:49:00Z"),
    r("world-716-seed", "2026-10-11T17:12:04Z"),
    r("world-731-20261012T0923Z", "2026-10-12T09:24:10Z"),
    r("prod-727-20261012T0323Z", "2026-10-12T03:24:30Z"),
    r("world-735-20261012T1123Z", "2026-10-12T11:24:00Z"),
    r("world-725-20261011T2123Z", "2026-10-11T21:24:00Z"),
    r("prod-720-20261011T0323Z", "2026-10-11T17:30:00Z"),
    r("world-729-20261012T0623Z", "2026-10-12T06:24:00Z"),
    r("world-999-draft", "2026-10-12T11:30:00Z", draft=True),     # drafts are never references
]


def test_latest_is_the_newest_published_not_the_first_created():
    assert rel.latest(ROWS, NOW) == "world-735-20261012T1123Z"
    # the real situation of 2026-10-11: two releases with the same createdAt
    real = [r("world-723-20261011T1748Z", "2026-10-11T17:49:00Z"), r("world-716-seed", "2026-10-11T17:12:04Z")]
    assert rel.latest(real, NOW) == "world-723-20261011T1748Z"


def test_prune_world_keeps_the_newest_and_never_touches_prod():
    gone = rel.prune(ROWS, "world-", 4, now=NOW)
    assert gone == ["world-723-20261011T1748Z", "world-716-seed"]
    assert not any(t.startswith("prod-") for t in gone)
    assert "world-735-20261012T1123Z" not in gone


def test_prune_never_deletes_the_current_or_a_protected_reference():
    assert "world-735-20261012T1123Z" not in rel.prune(ROWS, "world-", 1, now=NOW)
    gone = rel.prune(ROWS, "world-", 1, protect=["world-725-20261011T2123Z"], now=NOW)
    assert "world-725-20261011T2123Z" not in gone and "world-735-20261012T1123Z" not in gone
    assert set(gone) == {"world-731-20261012T0923Z", "world-729-20261012T0623Z", "world-723-20261011T1748Z",
                         "world-716-seed"}


def test_prune_prod_keeps_three():
    assert rel.prune(ROWS, "prod-", 3, now=NOW) == []
    assert rel.prune(ROWS, "prod-", 1, now=NOW) == ["prod-720-20261011T0323Z"]
    assert rel.prune(ROWS, "prod-", 1, protect=["prod-720-20261011T0323Z"], now=NOW) == []


@pytest.mark.parametrize("bad, why", [
    ({"tagName": "world-730-x", "publishedAt": None}, "missing"),
    ({"tagName": "world-730-x", "publishedAt": ""}, "missing"),
    ({"tagName": "world-730-x", "publishedAt": "yesterday"}, "not a date"),
    ({"tagName": "world-730-x", "publishedAt": "2026-10-12T09:24:10Z"}, "the same publishedAt"),
    ({"tagName": "world-730-x", "publishedAt": "2026-10-13T00:00:00Z"}, "in the future"),
    ({"tagName": "world-700-x", "publishedAt": "2026-10-12T11:50:00Z"}, "older world"),
    ({"tagName": "world-x", "publishedAt": "2026-10-12T11:50:00Z"}, "no world version"),
])
def test_unsafe_dates_stop_selection_and_pruning(bad, why):
    rows = ROWS + [{"isDraft": False, **bad}]
    with pytest.raises(rel.Unsafe, match=why):
        rel.latest(rows, NOW)
    with pytest.raises(rel.Unsafe, match=why):
        rel.prune(rows, "world-", 4, now=NOW)


def test_refuses_bad_arguments_and_empty_lists():
    with pytest.raises(rel.Unsafe):
        rel.prune(ROWS, "", 4, now=NOW)
    with pytest.raises(rel.Unsafe):
        rel.prune(ROWS, "world-", 0, now=NOW)
    with pytest.raises(rel.Unsafe, match="no reference"):
        rel.latest([], NOW)


def test_command_line_prints_nothing_and_exits_3_when_unsafe():
    rows = [r("world-723-20261011T1748Z", "2026-10-11T17:49:00Z"), r("world-716-seed", "2026-10-11T17:49:00Z")]
    p = subprocess.run([sys.executable, str(SCRIPT), "prune", "--prefix", "world-", "--keep", "1"],
                       input=json.dumps(rows), capture_output=True, text=True)
    assert p.returncode == 3 and p.stdout == "" and "nothing selected or deleted" in p.stderr
    ok = [r("world-723-20261011T1748Z", "2026-10-11T17:49:00Z"), r("world-716-seed", "2026-10-11T17:12:04Z")]
    p = subprocess.run([sys.executable, str(SCRIPT), "latest"], input=json.dumps(ok), capture_output=True, text=True)
    assert p.returncode == 0 and p.stdout.strip() == "world-723-20261011T1748Z"


def test_the_workflow_never_orders_by_created_at():
    wf = (ROOT / ".github" / "workflows" / "nexum-events.yml").read_text()
    assert "createdAt" not in wf
    assert wf.count("releases.py") >= 3
