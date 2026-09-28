"""P28 / P29 — the Core contains no domain concept; adding a domain touches no Core file."""

import pathlib
import re
import subprocess
import tomllib

from tests.conftest import ROOT

FORBIDDEN = ["earthquake", "seismic", "quake", "magnitude", "airport", "aviation", "aircraft", "ship", "vessel",
             "copernicus", "cems", "usgs", "ourairports", "natural earth", "naturalearth", "weather", "volcano",
             "wildfire", "flood", "satellite", "cve", "vulnerability", "malware", "exploit", "company", "country",
             "emergency", "mainshock", "aftershock", "replica", "repliche", "sciame"]
CORE = ROOT / "nexum" / "core"


def core_files():
    return sorted(p for p in CORE.rglob("*.py"))


def test_p28_no_domain_terms_in_core():
    hits = []
    for p in core_files():
        text = p.read_text(encoding="utf-8").lower()
        for term in FORBIDDEN:
            if re.search(r"\b" + re.escape(term) + r"\b", text):
                hits.append((p.name, term))
    assert hits == [], hits


def vocab_type_ids():
    ids = set()
    for d in ("vocab", "fixtures/d3/vocab", "fixtures/d2/vocab", "fixtures/r2_grouping/vocab"):
        for p in (ROOT / d).glob("*.toml"):
            doc = tomllib.loads(p.read_text(encoding="utf-8"))
            for table in ("object_type", "event_type", "relation_type"):
                ids |= set(doc.get(table, {}))
    return ids


def test_p29_core_does_not_reference_any_domain_type_or_source():
    ids = vocab_type_ids() | {"usgs.earthquakes", "ourairports.airports", "naturalearth.admin0", "cems.rapid_mapping",
                              "fixture.", "iso3166", "icao", "vulnid", "swid"}
    for p in core_files():
        text = p.read_text(encoding="utf-8")
        for t in ids:
            assert t not in text, (p.name, t)


def test_p29_domains_live_outside_core_in_git():
    """Every file of the D3 domain (and of every other domain) is outside nexum/core."""
    out = subprocess.run(["git", "ls-files", "--others", "--cached", "--exclude-standard"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout.split()
    domain = [f for f in out if f.startswith(("fixtures/d3/", "vocab/", "rules/", "connectors/", "sources/"))]
    assert domain and not any(f.startswith("nexum/core/") for f in domain)
