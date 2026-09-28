"""Confidence: a deterministic, explainable degree of support in [0, 1].

It is NOT a probability. Every value is stored with its factor decomposition
and can be recomputed exactly from it.
"""

import json

METHOD = {"measured": 1.0, "asserted": 0.95, "computed": 0.95, "resolved_by_name": 0.85, "proposed": 0.5}
STATUS = {"reviewed": 1.0, "updated": 1.0, "preliminary": 0.9, "retracted": 0.0}


def band(c: float | None) -> int:
    if c is None:
        return 0
    return 2 if c >= 0.8 else (1 if c >= 0.5 else 0)


BAND_LABEL = {2: "supporto forte", 1: "supporto medio", 0: "supporto debole"}


def evidence_factors(reliability: float, method: str, status: str, completeness: float) -> dict:
    return {"source_quality": round(reliability, 6), "method": METHOD[method],
            "status": STATUS[status], "data_completeness": round(completeness, 6)}


def product(factors: dict) -> float:
    v = 1.0
    for k in sorted(factors):
        v *= float(factors[k])
    return v


def combine_groups(items) -> tuple[float, dict]:
    """items: iterable of (independence_group, value). Best value per group,
    then support combination across independent groups: 1 − Π(1 − cᵍ)."""
    best: dict[str, float] = {}
    for g, v in items:
        best[g] = max(best.get(g, 0.0), v)
    rest = 1.0
    for g in sorted(best):
        rest *= (1.0 - best[g])
    return 1.0 - rest, {g: round(best[g], 9) for g in sorted(best)}


PRODUCT_ORDER = ("source_quality", "method", "status", "data_completeness")


def pack_product(f: dict) -> dict:
    """Compact, lossless encoding of an evidence decomposition."""
    return {"p": [f[k] for k in PRODUCT_ORDER]}


def pack_support(groups: dict, evidence_count: int) -> dict:
    """Compact, lossless encoding of a support combination across independence groups."""
    return {"g": groups, "n": evidence_count}


def expand(f: dict | None) -> dict | None:
    """Readable decomposition for DTOs (the stored form is compact)."""
    if not f:
        return f
    if "p" in f:
        return {"method": "product", "factors": dict(zip(PRODUCT_ORDER, f["p"]))}
    if "g" in f:
        return {"method": "independent_groups", "groups": f["g"], "evidence_count": f["n"],
                "independent_sources": len(f["g"])}
    return f


def recompute(factors: dict) -> float:
    """Recompute a stored confidence from its decomposition (P35)."""
    if "p" in factors:
        v = 1.0
        for x in factors["p"]:
            v *= float(x)
        return v
    if "g" in factors:
        factors = expand(factors)
    m = factors.get("method")
    if m == "independent_groups":
        rest = 1.0
        for g in sorted(factors["groups"]):
            rest *= (1.0 - float(factors["groups"][g]))
        return 1.0 - rest
    if m == "product":
        return product(factors["factors"])
    if m == "insight":
        v = float(factors["relation_strength"]) * float(factors["members_min"])
        for k in sorted(factors.get("scored", {})):
            v *= float(factors["scored"][k])
        return v
    raise ValueError(f"unknown factor method {m!r}")


def dumps(factors: dict) -> str:
    return json.dumps(factors, sort_keys=True, separators=(",", ":"))


def text(value: float, parts: list[str]) -> str:
    """Human sentence; never uses probabilistic wording."""
    head = BAND_LABEL[band(value)]
    return f"{head} ({value:.2f}): " + "; ".join(parts) if parts else f"{head} ({value:.2f})"
