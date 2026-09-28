"""D3 generator — synthetic, non-geographic, deterministic (fictitious identifiers only).

scale=0 writes the hand-designed base world used by the architectural tests.
scale>0 appends a deterministic large world for benchmarks (never committed).
"""

import json
import pathlib
import random
import sys

DAY = 86_400_000
T0 = 1_768_003_200_000  # 2026-01-10T00:00:00Z


def tgt(t, scheme, value):
    return {"type": t, "scheme": scheme, "value": value}


def V(i): return tgt("security.vulnerability", "vulnid", i)
def S(i): return tgt("software.package", "swid", i)
def P(i): return tgt("software.product", "prodid", i)
def O(i): return tgt("org.organization", "orgid", i)
def T(i): return tgt("security.technique", "techid", i)


def obj(t, scheme, i, label=None, props=None):
    return {"kind": "object", "type": t, "id": i, "label": label or i, "identifiers": [[scheme, i]],
            "properties": props or {}}


def rel(rid, rtype, a, b):
    return {"kind": "relation", "type": rtype, "id": rid, "subject": a, "object": b}


def ev(t, scheme, i, t_ms, assertions, props=None):
    return {"kind": "event", "type": t, "id": i, "label": i, "identifiers": [[scheme, i]], "t_ms": t_ms,
            "properties": props or {}, "assertions": assertions}


def part(role, target):
    return {"kind": "participation", "type": role, "target": target}


def base():
    src = {k: [] for k in ("vuln_catalog_a", "vuln_catalog_b", "vuln_catalog_a_mirror", "advisories", "exploitation_list")}
    adv = src["advisories"]
    for o, sector in (("ORG-ALPHA", "manufacturing"), ("ORG-BETA", "finance"), ("ORG-GAMMA", "energy")):
        adv.append(obj("org.organization", "orgid", o, props={"sector": sector}))
    for p in ("PRODUCT-X", "PRODUCT-Y", "PRODUCT-Z", "PRODUCT-W"):
        adv.append(obj("software.product", "prodid", p, props={"line": "test"}))
    for s in ("SW-TEST-lib", "SW-TEST-util", "SW-TEST-core"):
        adv.append(obj("software.package", "swid", s, props={"ecosystem": "test"}))
    adv.append(obj("security.technique", "techid", "TECH-TEST-01", props={"family": "test"}))
    for a, b in (("SW-TEST-lib", "PRODUCT-X"), ("SW-TEST-lib", "PRODUCT-Y"), ("SW-TEST-util", "PRODUCT-Z"),
                 ("SW-TEST-core", "PRODUCT-W")):
        adv.append(rel(f"CMP:{a}:{b}", "component_of", S(a), P(b)))
    for p, o in (("PRODUCT-X", "ORG-ALPHA"), ("PRODUCT-Y", "ORG-BETA"), ("PRODUCT-Z", "ORG-GAMMA"), ("PRODUCT-W", "ORG-GAMMA")):
        adv.append(rel(f"PRD:{p}:{o}", "produced_by", P(p), O(o)))
    adv.append(ev("security.advisory_issued", "advid", "ADV-0001", T0 + 6 * DAY,
                  [part("concerns", P("PRODUCT-X")), part("publisher", O("ORG-ALPHA")), part("subject", V("VULN-TEST-0001")),
                   {"kind": "relation_evidence", "type": "affects", "target": V("VULN-TEST-0001"), "to": S("SW-TEST-lib")}],
                  {"advisory_level": "high"}))
    a = src["vuln_catalog_a"]
    for i, sc in (("VULN-TEST-0001", 9.1), ("VULN-TEST-0002", 7.5), ("VULN-TEST-0003", 8.0), ("VULN-TEST-0004", 5.0)):
        a.append(obj("security.vulnerability", "vulnid", i, props={"severity_score": sc}))
        a.append(ev("security.vulnerability_published", "pubid", "PUB-" + i[-4:], T0, [part("subject", V(i))],
                    {"channel": "catalog_a"}))
    for v, s in (("VULN-TEST-0001", "SW-TEST-lib"), ("VULN-TEST-0002", "SW-TEST-util"), ("VULN-TEST-0003", "SW-TEST-core"),
                 ("VULN-TEST-0004", "SW-TEST-util")):
        a.append(rel(f"A:AFF:{v}:{s}", "affects", V(v), S(s)))
    a.append(rel("A:ASSOC:VULN-TEST-0001:TECH-TEST-01", "associated_with", V("VULN-TEST-0001"), T("TECH-TEST-01")))
    b = src["vuln_catalog_b"]
    for v, s in (("VULN-TEST-0001", "SW-TEST-lib"), ("VULN-TEST-0002", "SW-TEST-util")):
        b.append(rel(f"B:AFF:{v}:{s}", "affects", V(v), S(s)))
    b.append({"kind": "object", "type": "software.package", "id": "B-NAME-ONLY-lib", "label": "SW-TEST-lib",
              "identifiers": [], "properties": {"ecosystem": "test"}})
    src["vuln_catalog_a_mirror"].append(rel("M:AFF:VULN-TEST-0003:SW-TEST-core", "affects", V("VULN-TEST-0003"),
                                            S("SW-TEST-core")))
    x = src["exploitation_list"]
    for e, v, d in (("EX-0001", "VULN-TEST-0001", 4), ("EX-0002", "VULN-TEST-0002", 45), ("EX-0003", "VULN-TEST-0003", 3)):
        x.append(ev("security.exploitation_listed", "exid", e, T0 + d * DAY, [part("subject", V(v))], {"list_name": "test"}))
    return src


def scaled(src, n_vuln=50_000, n_pkg=20_000, n_prod=5_000, n_org=2_000, n_events=100_000, seed=20260928):
    rnd = random.Random(seed)
    adv, a, b, x = src["advisories"], src["vuln_catalog_a"], src["vuln_catalog_b"], src["exploitation_list"]
    for i in range(n_org):
        adv.append(obj("org.organization", "orgid", f"ORG-S{i:05d}", props={"sector": "synthetic"}))
    for i in range(n_prod):
        adv.append(obj("software.product", "prodid", f"PRD-S{i:05d}", props={"line": "synthetic"}))
        adv.append(rel(f"PRD:S{i}", "produced_by", P(f"PRD-S{i:05d}"), O(f"ORG-S{rnd.randrange(n_org):05d}")))
    for i in range(n_pkg):
        adv.append(obj("software.package", "swid", f"PKG-S{i:05d}", props={"ecosystem": "synthetic"}))
        for k in range(1 + rnd.randrange(3)):
            adv.append(rel(f"CMP:S{i}:{k}", "component_of", S(f"PKG-S{i:05d}"), P(f"PRD-S{rnd.randrange(n_prod):05d}")))
    n_pub = n_vuln
    n_ex = (n_events - n_pub) // 3
    n_adv = n_events - n_pub - n_ex
    for i in range(n_vuln):
        vid = f"VULN-S{i:06d}"
        t = T0 - rnd.randrange(3650) * DAY
        a.append(obj("security.vulnerability", "vulnid", vid, props={"severity_score": round(rnd.uniform(1, 10), 1)}))
        a.append(ev("security.vulnerability_published", "pubid", f"PUB-S{i:06d}", t, [part("subject", V(vid))],
                    {"channel": "synthetic"}))
        pkg = f"PKG-S{rnd.randrange(n_pkg):05d}"
        a.append(rel(f"A:AFF:S{i}", "affects", V(vid), S(pkg)))
        if rnd.random() < 0.5:
            b.append(rel(f"B:AFF:S{i}", "affects", V(vid), S(pkg)))
        if i < n_ex:
            x.append(ev("security.exploitation_listed", "exid", f"EX-S{i:06d}", t + rnd.randrange(60) * DAY,
                        [part("subject", V(vid))], {"list_name": "synthetic"}))
    for i in range(n_adv):
        v = rnd.randrange(n_vuln)
        adv.append(ev("security.advisory_issued", "advid", f"ADV-S{i:06d}", T0 - rnd.randrange(3650) * DAY,
                      [part("concerns", P(f"PRD-S{rnd.randrange(n_prod):05d}")), part("subject", V(f"VULN-S{v:06d}"))],
                      {"advisory_level": "synthetic"}))
    return src


def write(src, out_dir):
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for k, recs in src.items():
        (out / f"{k}.json").write_text(json.dumps({"records": recs}, indent=1, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    scale = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "fixtures/d3/data"
    s = base()
    if scale:
        s = scaled(s)
    write(s, out_dir)
    print({k: len(v) for k, v in s.items()})
