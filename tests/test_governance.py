"""Authorship (P24) and zero OSIRIS code (P25)."""

import pathlib
import subprocess

import pytest

from tests.conftest import ROOT

OSIRIS = pathlib.Path("/Users/alessandropezzali/Projects/OSIRIS-REFERENCE")


def test_p24_single_author_no_coauthors():
    log = subprocess.run(["git", "log", "--format=%an%x09%ae%x09%cn%n%B%x00"], cwd=ROOT, capture_output=True,
                         text=True, check=True).stdout
    for entry in filter(None, (e.strip() for e in log.split("\x00"))):
        head = entry.splitlines()[0].split("\t")
        assert head[0] == "Alessandro Pezzali" and head[2] == "Alessandro Pezzali", head
        assert "co-authored-by" not in entry.lower()


def significant_lines(path):
    out = set()
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            s = " ".join(line.split())
            if len(s) >= 40 and not s.startswith(("#", "//", "*", "import ", "from ")):
                out.add(s)
    except OSError:
        pass
    return out


def test_p25_no_osiris_code_assets_or_data():
    if not OSIRIS.exists():
        pytest.fail("OSIRIS-REFERENCE not found: cannot verify P25")
    files = subprocess.run(["git", "ls-files", "--others", "--cached", "--exclude-standard"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.split()
    code = [ROOT / f for f in files if f.endswith((".py", ".toml", ".json", ".js", ".ts", ".html", ".css"))]
    osiris_lines = set()
    for p in OSIRIS.rglob("*"):
        if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts and \
                p.suffix in (".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".py", ".css", ".html"):
            osiris_lines |= significant_lines(p)
    shared = {}
    for p in code:
        hits = significant_lines(p) & osiris_lines
        if hits:
            shared[str(p.relative_to(ROOT))] = sorted(hits)[:3]
    assert shared == {}, shared
    # no OSIRIS file (by content hash) and none of its asset/dataset names
    import hashlib
    osiris_hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in OSIRIS.rglob("*")
                     if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts}
    for f in files:
        p = ROOT / f
        if p.is_file():
            assert hashlib.sha256(p.read_bytes()).hexdigest() not in osiris_hashes, f
