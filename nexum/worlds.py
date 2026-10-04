"""Standard world configurations (paths relative to the project root)."""

import pathlib

from nexum.core.pipeline import Config

ROOT = pathlib.Path(__file__).resolve().parents[1]


def d1(db="data/d1/nexum.db", raw="data/d1/raw") -> Config:
    """D1 — real-world validation: approved ADOPT sources only."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["sources"], ["vocab"], ["rules"], allow_fixture=False)


def d3(db="data/d3/nexum.db", raw="data/d3/raw") -> Config:
    """D3 — domain-independence validation: synthetic non-geographic fixture world."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["fixtures/d3/sources"], ["fixtures/d3/vocab"],
                  ["fixtures/d3/rules"], allow_fixture=True)


def mixed(db="data/mixed/nexum.db", raw="data/mixed/raw") -> Config:
    """D1 + D3 in the same world (mixed-world test)."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["sources", "fixtures/d3/sources"],
                  ["vocab", "fixtures/d3/vocab"], ["rules", "fixtures/d3/rules"], allow_fixture=True)


def d2(db="data/d2/nexum.db", raw="data/d2/raw") -> Config:
    """D2 — scale validation: synthetic high-density world (generated, never committed)."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["fixtures/d2/sources"], ["fixtures/d2/vocab"],
                  ["fixtures/d2/rules"], allow_fixture=True)


def grouping(rules_dir="fixtures/r2_grouping/rules", db="data/grouping/nexum.db", raw="data/grouping/raw") -> Config:
    """Anti-overfitting fixture for candidate grouping (synthetic)."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["fixtures/r2_grouping/sources"],
                  ["fixtures/r2_grouping/vocab"], [rules_dir], allow_fixture=True)


def d3s(db="data/d3s/nexum.db", raw="data/d3s/raw") -> Config:
    """D3 scaled for benchmarks (synthetic, non-geographic, generated, never committed)."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["fixtures/d3s/sources"], ["fixtures/d3/vocab"],
                  ["fixtures/d3/rules"], allow_fixture=True)


def ubench(db="data/ubench/nexum.db", raw="data/ubench/raw") -> Config:
    """UI-benchmark world (U4, U5, U6): deterministic synthetic fixture, separate from D1/D2/D3."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["fixtures/ubench/sources"], ["fixtures/ubench/vocab"],
                  ["fixtures/ubench/rules"], allow_fixture=True)


def live(db="data/live/nexum.db", raw="data/live/raw") -> Config:
    """LIVE — the published operational world: the D1 sources plus further approved, free, open sources
    (sources_live). D1 stays frozen as the validation world of Phases 1–2. Vocabulary: vocab_live is the complete
    vocabulary of this world (D1's types, extended to the new domains); rules: D1's plus rules_live."""
    return Config(str(ROOT), str(ROOT / db), str(ROOT / raw), ["sources", "sources_live"], ["vocab_live"],
                  ["rules", "rules_live"], allow_fixture=False)
