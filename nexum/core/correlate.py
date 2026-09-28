"""Correlation engine: a generic pattern matcher over the NEXUM WORLD.

Rules are declarative files. A rule binds variables (events, objects,
insights) and constrains them with primitives of time, space (optional),
graph, participation, evidence and identity. Output: insights with
evidence, deterministic confidence and a non-causal explanation.

CORRELATION IS NOT CAUSATION: insights never modify the world.
"""

import hashlib
import json
import pathlib
import re
import tomllib

from . import confidence as cf
from . import geo
from .ids import det_id
from .timeutil import human_delta, month_index, parse_duration, to_iso

FORBIDDEN_WORDS = ("ha causato", "hanno causato", "causato da", "causata da", "provocato", "provocata",
                   "a causa di", "dovuto a", "dovuta a", "because", "caused", "probabilità", "probability",
                   "probabile")
OUTPUTS = ("association", "context", "composite", "relation_hypothesis")
LINK_OPS = ("within_time", "within_distance", "shares_participant", "related")
ORDER_KEYS = ("severity", "score", "time", "confidence")
OPS = {"==": lambda a, b: a == b, "!=": lambda a, b: a != b, ">=": lambda a, b: a is not None and a >= b,
       "<=": lambda a, b: a is not None and a <= b, ">": lambda a, b: a is not None and a > b,
       "<": lambda a, b: a is not None and a < b, "in": lambda a, b: a in b, "not_in": lambda a, b: a not in b}


class RuleError(ValueError):
    pass


def kind_of_id(eid: str) -> str:
    return {"obj": "object", "evt": "event", "ins": "insight"}[eid.split("_", 1)[0]]


# ── rule loading ─────────────────────────────────────────────────────────────

class Rule:
    def __init__(self, doc: dict, text: str, path: str):
        r = doc.get("rule") or {}
        self.id = r["id"]
        self.version = str(r["version"])
        self.label = r.get("label", self.id)
        self.output = r["output"]
        if self.output not in OUTPUTS:
            raise RuleError(f"{self.id}: invalid output {self.output}")
        self.strength = float(r["strength"])
        self.emit_threshold = float(r.get("emit_threshold", 0.3))
        self.anchor = r["anchor"]
        self.unique = bool(r.get("unique", False))
        self.max_candidates = int(r.get("max_candidates", 500))
        self.max_results = int(r.get("max_results_per_anchor", 50))
        self.explain = r["explain"]
        self.collect = r.get("collect")
        self.hypothesis = r.get("hypothesis")
        self.group = r.get("group")
        if self.group:
            if self.group.get("var") not in [v["name"] for v in r.get("var", [])]:
                raise RuleError(f"{r['id']}: group.var must be a rule variable")
            if self.group.get("support", "max_member") not in ("max_member", "representative"):
                raise RuleError(f"{r['id']}: group.support must be 'max_member' or 'representative'")
            for crit in self.group.get("link", []):
                if crit.get("op") not in LINK_OPS:
                    raise RuleError(f"{r['id']}: unknown group link primitive {crit.get('op')}")
        self.vars = r.get("var", [])
        self.constraints = r.get("constraint", [])
        self.text = text
        self.hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        self.path = path
        names = [v["name"] for v in self.vars]
        if self.anchor not in names:
            raise RuleError(f"{self.id}: anchor {self.anchor} is not a variable")
        for c in self.constraints:
            for k in ("a", "b"):
                if k in c and c[k] not in names:
                    raise RuleError(f"{self.id}: constraint refers to unknown variable {c[k]}")
        low = self.explain.lower()
        for w in FORBIDDEN_WORDS:
            if w in low:
                raise RuleError(f"{self.id}: explanation template uses forbidden wording {w!r}")
        self.var = {v["name"]: v for v in self.vars}

    def insight_rules(self) -> set:
        return {v["rule"] for v in self.vars if v["kind"] == "insight"}


def load_rules(dirs) -> list[Rule]:
    rules = []
    for d in dirs:
        for p in sorted(pathlib.Path(d).glob("*.toml")):
            text = p.read_text(encoding="utf-8")
            rules.append(Rule(tomllib.loads(text), text, str(p)))
    ids = [r.id for r in rules]
    if len(ids) != len(set(ids)):
        raise RuleError("duplicate rule ids")
    # dependency order: rules consuming insights run after their producers
    ordered, pending = [], list(rules)
    while pending:
        progressed = False
        for r in list(pending):
            deps = r.insight_rules()
            if deps <= {o.id for o in ordered}:
                ordered.append(r)
                pending.remove(r)
                progressed = True
        if not progressed:
            raise RuleError("cyclic rule dependencies")
    return ordered


# ── formatting ───────────────────────────────────────────────────────────────

def fmt_num(v, digits=1) -> str:
    if v is None:
        return "n.d."
    s = f"{float(v):.{digits}f}"
    return s.replace(".", ",")


_TOKEN = re.compile(r"\{([^{}]+)\}")


# ── engine ───────────────────────────────────────────────────────────────────

class Engine:
    def __init__(self, conn, world, rules: list[Rule], sources):
        self.conn = conn
        self.world = world
        self.rules = rules
        self.sources = sources
        self._cache: dict[str, dict] = {}

    def reset_cache(self):
        self._cache.clear()

    # ── entity access ────────────────────────────────────────────────────────
    def entity(self, kind, eid):
        key = f"{kind}:{eid}"
        e = self._cache.get(key)
        if e is not None:
            return e
        if kind == "object":
            r = self.conn.execute("SELECT * FROM object WHERE object_id=?", (eid,)).fetchone()
        elif kind == "event":
            r = self.conn.execute("SELECT * FROM event WHERE event_id=?", (eid,)).fetchone()
        elif kind == "insight":
            r = self.conn.execute("SELECT * FROM insight WHERE insight_id=?", (eid,)).fetchone()
        else:
            raise ValueError(kind)
        if r is None:
            return None
        e = dict(r)
        e["kind"] = kind
        e["id"] = eid
        e["props"] = json.loads(r["props_json"]) if kind != "insight" and r["props_json"] else {}
        e["geom"] = json.loads(r["geometry"]) if kind != "insight" and r["geometry"] else None
        e["t"] = r["t_start_ms"] if kind in ("event", "insight") else None
        if len(self._cache) > 200000:
            self._cache.clear()
        self._cache[key] = e
        return e

    def ident(self, eid, scheme):
        r = self.conn.execute("SELECT value FROM identifier WHERE entity_id=? AND scheme=? ORDER BY strong DESC, value "
                              "LIMIT 1", (eid, scheme)).fetchone()
        return r[0] if r else None

    def _matches(self, v, e) -> bool:
        if e is None or e["kind"] != v["kind"]:
            return False
        if v["kind"] == "insight":
            return e["rule_id"] == v["rule"] and e["status"] == "active"
        if e["type"] not in v["types"]:
            return False
        if e["status"] in v.get("status_not", ["retracted"]):
            return False
        for prop, op, val in v.get("where", []):
            if not OPS[op](e["props"].get(prop), val):
                return False
        return True

    @staticmethod
    def where_sql(v, alias="t"):
        """Translate a variable's `where` clauses into SQL over props_json (generic, no domain knowledge)."""
        conds, args = [], []
        sqlop = {"==": "=", "!=": "<>", ">=": ">=", "<=": "<=", ">": ">", "<": "<"}
        for prop, op, val in v.get("where", []):
            col = f"json_extract({alias}.props_json, '$.{prop}')"
            if op in sqlop:
                conds.append(f"{col} {sqlop[op]} ?")
                args.append(int(val) if isinstance(val, bool) else val)
            elif op in ("in", "not_in"):
                ph = ",".join("?" * len(val))
                conds.append(f"{col} {'IN' if op == 'in' else 'NOT IN'} ({ph})")
                args += list(val)
        return ("".join(f" AND {c}" for c in conds)), args

    def scan(self, v):
        """All entities matching a variable (used when no generator applies)."""
        if v["kind"] == "insight":
            q = self.conn.execute("SELECT insight_id FROM insight WHERE rule_id=? AND status='active' "
                                  "ORDER BY insight_id", (v["rule"],))
        else:
            table, key = ("object", "object_id") if v["kind"] == "object" else ("event", "event_id")
            ph = ",".join("?" * len(v["types"]))
            ws, wa = self.where_sql(v, table)
            q = self.conn.execute(f"SELECT {key} FROM {table} WHERE type IN ({ph}){ws} ORDER BY {key}",
                                  (*v["types"], *wa))
        for (eid,) in q:
            e = self.entity(v["kind"], eid)
            if self._matches(v, e):
                yield e

    # ── primitives: candidate generation ─────────────────────────────────────
    def _km(self, c, binding):
        if "km" in c:
            return float(c["km"])
        spec = c["km_steps"]
        src = binding.get(spec["var"])
        if src is None:
            return max(k for _, k in spec["steps"])
        val = src["props"].get(spec["property"])
        km = None
        for thr, k in spec["steps"]:
            if val is not None and val >= thr:
                km = k
        return km

    def generate(self, c, binding, target_name, rule):
        """Candidates for `target_name` from constraint `c` and the current binding, or None."""
        op = c["op"]
        v = rule.var[target_name]
        other_name = c["b"] if c.get("a") == target_name else c.get("a")
        other = binding.get(other_name)
        if other is None:
            return None
        if op == "within_distance":
            if other["geom"] is None or v["kind"] == "insight":
                return []
            km = self._km(c, binding)
            if km is None:
                return []
            table = "object_rtree" if v["kind"] == "object" else "event_rtree"
            etable, key = ("object", "object_id") if v["kind"] == "object" else ("event", "event_id")
            ph = ",".join("?" * len(v["types"]))
            ws, wa = self.where_sql(v, "t")
            ids = set()
            for x0, x1, y0, y1 in geo.expand_point_km(other["lon"], other["lat"], km):
                for (eid,) in self.conn.execute(
                        f"SELECT m.entity_id FROM {table} r JOIN rid_map m ON m.rid=r.rid CROSS JOIN {etable} t "
                        f"ON t.{key}=m.entity_id WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? "
                        f"AND r.max_lat>=? AND t.type IN ({ph}){ws}", (x1, x0, y1, y0, *v["types"], *wa)):
                    ids.add(eid)
            return [self.entity(v["kind"], i) for i in sorted(ids)]
        if op == "within_time":
            if other["t"] is None or v["kind"] != "event":
                return []
            lo, hi = parse_duration(c["min"]), parse_duration(c["max"])
            if target_name == c["b"]:
                t0, t1 = other["t"] + lo, other["t"] + hi
            else:
                t0, t1 = other["t"] - hi, other["t"] - lo
            ph = ",".join("?" * len(v["types"]))
            ws, wa = self.where_sql(v, "event")
            rows = self.conn.execute(f"SELECT event_id FROM event WHERE type IN ({ph}) AND t_start_ms BETWEEN ? AND ?{ws} "
                                     f"ORDER BY event_id", (*v["types"], t0, t1, *wa)).fetchall()
            return [self.entity("event", r[0]) for r in rows]
        if op == "related":
            if target_name == c["b"]:
                rows = self.conn.execute("SELECT dst_id FROM edge WHERE src_id=? AND edge_kind='relation' "
                                         "AND type=? ORDER BY dst_id", (other["id"], c["type"])).fetchall()
            else:
                rows = self.conn.execute("SELECT src_id FROM edge WHERE dst_id=? AND edge_kind='relation' "
                                         "AND type=? ORDER BY src_id", (other["id"], c["type"])).fetchall()
            return [self.entity(kind_of_id(r[0]), r[0]) for r in rows]
        if op == "concerns":
            roles = c.get("roles")
            if target_name == c["b"]:  # objects of event a
                rows = self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=? "
                                         "ORDER BY object_id", (other["id"],)).fetchall()
                return [self.entity("object", r[0]) for r in rows if not roles or r[1] in roles]
            rows = self.conn.execute("SELECT src_id, type FROM edge WHERE dst_id=? AND edge_kind='participation' "
                                     "ORDER BY src_id", (other["id"],)).fetchall()
            return [self.entity("event", r[0]) for r in rows if not roles or r[1] in roles]
        if op == "shares_participant":
            ra, rb = c.get("roles_a"), c.get("roles_b")
            mine, theirs = (ra, rb) if other_name == c["a"] else (rb, ra)
            objs = [r[0] for r in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?",
                                                    (other["id"],)) if not mine or r[1] in mine]
            ids = set()
            for o in objs:
                for eid, role in self.conn.execute("SELECT src_id, type FROM edge WHERE dst_id=? AND "
                                                   "edge_kind='participation'", (o,)):
                    if not theirs or role in theirs:
                        ids.add(eid)
            return [self.entity("event", i) for i in sorted(ids)]
        if op == "same_member":
            mvar_other = c["var_a"] if other_name == c["a"] else c["var_b"]
            mvar_target = c["var_b"] if other_name == c["a"] else c["var_a"]
            mem = self.conn.execute("SELECT support_id FROM evidence WHERE supports_kind='insight' AND supports_id=? "
                                    "AND role=?", (other["id"], mvar_other)).fetchone()
            if not mem:
                return []
            rows = self.conn.execute(
                "SELECT e.supports_id FROM evidence e JOIN insight i ON i.insight_id=e.supports_id "
                "WHERE e.supports_kind='insight' AND e.support_id=? AND e.role=? AND i.rule_id=? AND i.status='active' "
                "ORDER BY e.supports_id", (mem[0], mvar_target, v["rule"])).fetchall()
            return [self.entity("insight", r[0]) for r in rows]
        return None

    # ── primitives: evaluation ───────────────────────────────────────────────
    def evaluate(self, c, b):
        """Returns (ok, factor, detail). factor multiplies the insight score."""
        op = c["op"]
        A, B = b.get(c.get("a")), b.get(c.get("b"))
        if op == "within_distance":
            if A is None or B is None or A["geom"] is None or B["geom"] is None:
                return False, 0.0, {}
            km = self._km(c, b)
            if km is None:
                return False, 0.0, {}
            d = geo.distance_km(A["geom"], B["geom"])
            if d > km:
                return False, 0.0, {}
            f = (1.0 - d / km) if c.get("score") else 1.0
            return True, f, {"distance_km": d, "radius_km": km}
        if op == "within_time":
            if A is None or B is None or A["t"] is None or B["t"] is None:
                return False, 0.0, {}
            lo, hi = parse_duration(c["min"]), parse_duration(c["max"])
            dt = B["t"] - A["t"]
            if not (lo <= dt <= hi):
                return False, 0.0, {}
            f = (1.0 - max(0, dt) / hi) if (c.get("score") and hi > 0) else 1.0
            return True, f, {"delta_t_ms": dt}
        if op == "related":
            row = self.conn.execute("SELECT r.relation_id, r.independent_groups, r.confidence FROM edge e JOIN relation r "
                                    "ON r.relation_id=e.ref_id WHERE e.src_id=? AND e.edge_kind='relation' AND e.type=? "
                                    "AND e.dst_id=?", (A["id"], c["type"], B["id"])).fetchone()
            if row is None:
                return False, 0.0, {}
            if row[1] < int(c.get("min_independent_groups", 1)):
                return False, 0.0, {}
            return True, 1.0, {"relation_id": row[0], "independent_groups": row[1], "relation_confidence": row[2]}
        if op == "concerns":
            roles = c.get("roles")
            rows = self.conn.execute("SELECT role FROM event_participant WHERE event_id=? AND object_id=?",
                                     (A["id"], B["id"])).fetchall()
            ok = any(not roles or r[0] in roles for r in rows)
            return ok, 1.0, {}
        if op == "shares_participant":
            ra, rb = c.get("roles_a"), c.get("roles_b")
            oa = {r[0] for r in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?",
                                                  (A["id"],)) if not ra or r[1] in ra}
            ob = {r[0] for r in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?",
                                                  (B["id"],)) if not rb or r[1] in rb}
            shared = sorted(oa & ob)
            return bool(shared), 1.0, {"shared": shared}
        if op == "same_member":
            ma = self.conn.execute("SELECT support_id FROM evidence WHERE supports_kind='insight' AND supports_id=? "
                                   "AND role=?", (A["id"], c["var_a"])).fetchone()
            mb = self.conn.execute("SELECT support_id FROM evidence WHERE supports_kind='insight' AND supports_id=? "
                                   "AND role=?", (B["id"], c["var_b"])).fetchone()
            return bool(ma and mb and ma[0] == mb[0]), 1.0, {}
        if op == "ordered":
            return A["id"] < B["id"], 1.0, {}
        if op == "different":
            return A["id"] != B["id"], 1.0, {}
        raise RuleError(f"unknown primitive {op}")

    # ── solver ───────────────────────────────────────────────────────────────
    GENERATING = ("within_distance", "within_time", "related", "concerns", "shares_participant", "same_member")

    def _next_var(self, rule, binding):
        """Join ordering: the first unbound variable (declaration order) linked by a generating constraint to a
        bound one; otherwise the first unbound variable."""
        remaining = [v["name"] for v in rule.vars if v["name"] not in binding]
        for name in remaining:
            for c in rule.constraints:
                if c["op"] in self.GENERATING and name in (c.get("a"), c.get("b")):
                    other = c["b"] if c.get("a") == name else c.get("a")
                    if binding.get(other) is not None:
                        return name
        return remaining[0] if remaining else None

    def solve(self, rule: Rule, seed: dict):
        """All complete bindings extending `seed` (dict var → entity). Results are order-independent."""
        results = []

        def check(binding):
            factors, details = {}, {}
            for c in rule.constraints:
                names = [c[k] for k in ("a", "b") if k in c]
                if not all(n in binding for n in names):
                    continue
                if any(binding[n] is None for n in names):
                    if c.get("optional"):
                        factors[f"{c['op']}:{'-'.join(names)}"] = float(c.get("penalty", 1.0))
                        continue
                    if any(rule.var[n].get("optional") for n in names):
                        continue
                    return None
                ok, f, d = self.evaluate(c, binding)
                key = f"{c['op']}:{'-'.join(names)}"
                if not ok:
                    if c.get("optional"):
                        factors[key] = float(c.get("penalty", 1.0))
                        continue
                    return None
                if c.get("score") or c.get("optional"):
                    factors[key] = f
                details[key] = d
            return factors, details

        def rec(binding):
            if len(results) >= rule.max_candidates * 10:
                return
            name = self._next_var(rule, binding)
            if name is None:
                res = check(binding)
                if res is not None:
                    results.append((dict(binding), res[0], res[1]))
                return
            v = rule.var[name]
            cands = None
            for c in rule.constraints:
                if name in (c.get("a"), c.get("b")):
                    other = c["b"] if c.get("a") == name else c.get("a")
                    if other in binding and binding[other] is not None:
                        g = self.generate(c, binding, name, rule)
                        if g is not None:
                            cands = g
                            break
            if cands is None:
                cands = list(self.scan(v))
            cands = [e for e in cands if self._matches(v, e)][: rule.max_candidates]
            seen = set()
            any_ok = False
            for e in cands:
                if e["id"] in seen:
                    continue
                seen.add(e["id"])
                binding[name] = e
                partial = check(binding)
                if partial is not None:
                    any_ok = True
                    rec(binding)
                del binding[name]
            if not any_ok and v.get("optional"):
                binding[name] = None
                rec(binding)
                del binding[name]

        rec(dict(seed))
        return results

    # ── insights ─────────────────────────────────────────────────────────────
    def _members(self, rule, binding, details):
        out = []
        for v in rule.vars:
            e = binding.get(v["name"])
            if e is not None:
                out.append((v["name"], e))
        for key, d in sorted(details.items()):
            if "relation_id" in d:
                r = self.conn.execute("SELECT * FROM relation WHERE relation_id=?", (d["relation_id"],)).fetchone()
                out.append((f"rel:{key}", {"kind": "relation", "id": r["relation_id"], "confidence": r["confidence"],
                                           "source_id": None, "type": r["type"], "t": None, "geom": None}))
        return out

    def _score(self, rule, members, factors):
        confs = [m["confidence"] for _, m in members if m.get("confidence") is not None]
        mmin = min(confs) if confs else 0.0
        fac = {"method": "insight", "relation_strength": rule.strength, "members_min": round(mmin, 12),
               "scored": {k: round(v, 12) for k, v in sorted(factors.items())}}
        return cf.recompute(fac), fac

    def _render(self, rule, binding, details, collected=None):
        def val(expr):
            parts = expr.split("|")
            path, filt = parts[0], parts[1:]
            x = self._resolve_token(path.strip(), binding, details, collected)
            for f in filt:
                f = f.strip()
                if f == "num1":
                    x = fmt_num(x, 1)
                elif f == "num0":
                    x = fmt_num(x, 0)
                elif f == "join":
                    x = ", ".join(str(i) for i in (x or []))
                elif f == "date":
                    x = (to_iso(x) or "")[:16].replace("T", " ") + " UTC" if x else "n.d."
                elif f == "delta":
                    x = human_delta(x) if x is not None else "n.d."
            return "n.d." if x is None else str(x)
        return _TOKEN.sub(lambda m: val(m.group(1)), rule.explain)

    def _resolve_token(self, path, binding, details, collected):
        seg = path.split(".")
        if seg[0] == "dist":  # dist.A.B
            for k, d in details.items():
                if k.endswith(f":{seg[1]}-{seg[2]}") and "distance_km" in d:
                    return d["distance_km"]
            return None
        if seg[0] == "radius":
            for k, d in details.items():
                if "radius_km" in d:
                    return d["radius_km"]
            if collected:
                return collected.get("radius_km")
            return None
        if seg[0] == "dt":  # dt.A.B
            for k, d in details.items():
                if k.endswith(f":{seg[1]}-{seg[2]}") and "delta_t_ms" in d:
                    return d["delta_t_ms"]
            return None
        if seg[0] == "groups":  # groups.A.B
            for k, d in details.items():
                if k.endswith(f":{seg[1]}-{seg[2]}") and "independent_groups" in d:
                    return d["independent_groups"]
            return None
        if seg[0] == "n":
            return len((collected or {}).get(seg[1], []))
        if seg[0] == "first":
            items = (collected or {}).get(seg[1], [])
            if not items:
                return None
            e, d = items[0]
            if seg[2] == "dist":
                return d
            return self._entity_attr(e, seg[2:])
        e = binding.get(seg[0])
        if e is None:
            return None
        return self._entity_attr(e, seg[1:])

    def _entity_attr(self, e, seg):
        if seg[0] == "label":
            return e["label"]
        if seg[0] == "time":
            return e["t"]
        if seg[0] == "prop":
            return e["props"].get(seg[1])
        if seg[0] == "ident":
            return self.ident(e["id"], seg[1])
        if seg[0] == "explanation":
            return e.get("explanation")
        if seg[0] == "attribution":
            s = self.sources.get(e.get("source_id"))
            return s.attribution if s else None
        raise RuleError(f"unknown template attribute {'.'.join(seg)}")

    def _write_insight(self, rule, anchor, members, factors_fac, value, explanation, extra_detail, grouping=None):
        member_ids = sorted(f"{name}={m['id']}" for name, m in members)
        iid = det_id("ins", rule.id, rule.version, *member_ids)
        times = [m["t"] for _, m in members if m.get("t") is not None]
        geos = [m for _, m in members if m.get("geom") is not None]
        rec_at = 0
        for _, m in members:
            rec_at = max(rec_at, m.get("recorded_at_ms") or m.get("created_at_ms") or 0)
        lon = lat = x0 = x1 = y0 = y1 = cx = cy = None
        if geos:
            boxes = [geo.bbox(m["geom"]) for m in geos]
            x0, x1 = min(b[0] for b in boxes), max(b[1] for b in boxes)
            y0, y1 = min(b[2] for b in boxes), max(b[3] for b in boxes)
            base = anchor if anchor.get("geom") is not None else geos[0]
            lon, lat = base["lon"], base["lat"]
            cx, cy = geo.cell(lon, lat, geo.MAX_LEVEL)
        t0 = min(times) if times else None
        t1 = max(times) if times else None
        parts = [f"forza della regola {fmt_num(rule.strength, 2)}",
                 f"membro meno sostenuto {fmt_num(factors_fac['members_min'], 2)}"]
        for k, v in factors_fac["scored"].items():
            parts.append(f"{k.split(':')[0]} {fmt_num(v, 2)}")
        ctext = cf.text(value, parts)
        label = f"{rule.label}: {anchor['label']}"
        existing = self.conn.execute("SELECT status FROM insight WHERE insight_id=?", (iid,)).fetchone()
        if existing and existing[0] == "active":
            return iid, False
        if existing:
            self.conn.execute("DELETE FROM insight WHERE insight_id=?", (iid,))
            self.conn.execute("DELETE FROM evidence WHERE supports_kind='insight' AND supports_id=?", (iid,))
            self.world.remove_edges(iid, "insight_member")
            self.world.remove_edges(iid, "hypothesis")
        prov_inputs = [(m["kind"], m["id"], name) for name, m in members]
        pid = self.world.prov("correlate", f"rule:{rule.id}@{rule.version}", prov_inputs, rec_at)
        self.conn.execute(
            "INSERT INTO insight VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (iid, rule.output, rule.id, rule.id, rule.version, anchor["id"], label, round(value, 12),
             cf.dumps(factors_fac), ctext, explanation, t0, t1, month_index(t0), lon, lat, x0, x1, y0, y1, cx, cy,
             cf.band(value), "active", None, rec_at, self.world.run_id, pid, self.world.version,
             json.dumps(grouping, sort_keys=True, ensure_ascii=False) if grouping else None))
        for name, m in members:
            d = extra_detail.get(name, {})
            src = self.sources.get(m.get("source_id")) if m.get("source_id") else None
            grp = src.independence_group if src else ("nexum.correlation" if m["kind"] == "insight" else "nexum.world")
            self.conn.execute("INSERT OR IGNORE INTO evidence (supports_kind, supports_id, support_kind, support_id, role, method, source_id, independence_group, record_id, locator, distance_m, delta_t_ms, weight, factors_json, prov_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              ("insight", iid, m["kind"], m["id"], name, "computed",
                               m.get("source_id"), grp, None, None,
                               d.get("distance_km") * 1000.0 if d.get("distance_km") is not None else None,
                               d.get("delta_t_ms"), m.get("confidence") or 0.0, cf.dumps(d), pid))
            if m["kind"] != "relation":
                self.world._add_edge("insight", iid, m["kind"], m["id"], "insight_member", name, None, iid, t0, value)
        if rule.hypothesis:
            f = dict(members)[rule.hypothesis["from"]]
            t = dict(members)[rule.hypothesis["to"]]
            self.world._add_edge(f["kind"], f["id"], t["kind"], t["id"], "hypothesis", rule.hypothesis["type"],
                                 "hypothesis", iid, t0, value)
        self.world._index_space("insight", iid, {"type": "Point", "coordinates": [lon, lat]} if geos else None,
                                x0, x1, y0, y1)
        self.world.index_text("insight", iid, rule.id, label, "", "", explanation)
        row = self.conn.execute("SELECT * FROM insight WHERE insight_id=?", (iid,)).fetchone()
        self.world._agg_delta("insight", row, +1)
        self.world.log_change("insight", iid, "insert", rec_at)
        self._cache.pop(f"insight:{iid}", None)
        return iid, True

    def _retire(self, iid, status, superseded_by, at):
        row = self.conn.execute("SELECT * FROM insight WHERE insight_id=?", (iid,)).fetchone()
        self.world._agg_delta("insight", row, -1)
        self.conn.execute("UPDATE insight SET status=?, superseded_by=?, world_version=? WHERE insight_id=?",
                          (status, superseded_by, self.world.version, iid))
        self.world.remove_edges(iid, "insight_member")
        self.world.remove_edges(iid, "hypothesis")
        self.world.log_change("insight", iid, status, at)
        self._cache.pop(f"insight:{iid}", None)

    # ── candidate grouping (generic, parametric) ─────────────────────────────
    def _linked(self, a, b, criteria) -> bool:
        """Do two candidates of the same variable belong together? All criteria must hold.
        The criteria are declared by the rule; the Core only evaluates generic primitives."""
        for crit in criteria:
            op = crit["op"]
            if op == "within_time":
                if a["t"] is None or b["t"] is None or abs(a["t"] - b["t"]) > parse_duration(crit["max"]):
                    return False
            elif op == "within_distance":
                if a["geom"] is None or b["geom"] is None or geo.distance_km(a["geom"], b["geom"]) > float(crit["km"]):
                    return False
            elif op == "shares_participant":
                roles = crit.get("roles")
                oa = {r[0] for r in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?",
                                                      (a["id"],)) if not roles or r[1] in roles}
                ob = {r[0] for r in self.conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?",
                                                      (b["id"],)) if not roles or r[1] in roles}
                if not oa & ob:
                    return False
            elif op == "related":
                if not self.conn.execute("SELECT 1 FROM edge WHERE edge_kind='relation' AND type=? AND "
                                         "((src_id=? AND dst_id=?) OR (src_id=? AND dst_id=?))",
                                         (crit["type"], a["id"], b["id"], b["id"], a["id"])).fetchone():
                    return False
        return True

    @staticmethod
    def _order_key(order, cand):
        key = []
        for attr, direction in order:
            if attr not in ORDER_KEYS:
                raise RuleError(f"unknown representative order key {attr}")
            v = cand["score"] if attr == "score" else (cand["entity"]["t"] if attr == "time" else cand["entity"].get(attr))
            v = float("-inf") if v is None else float(v)
            key.append(-v if direction == "desc" else v)
        key.append(cand["entity"]["id"])
        return tuple(key)

    def _group_candidates(self, rule, scored):
        """scored: list of (value, member_key, binding, members, fac, details).
        Returns grouping provenance and the list of selected (group support, representative item)."""
        g = rule.group
        var = g["var"]
        order = g.get("representative", [["severity", "desc"], ["score", "desc"]])
        best = {}
        for item in scored:
            e = item[2].get(var)
            if e is None:
                continue
            if e["id"] not in best or (item[0], item[1]) > (best[e["id"]]["score"], best[e["id"]]["item"][1]):
                best[e["id"]] = {"entity": e, "score": item[0], "item": item}
        cands = [best[k] for k in sorted(best)]
        parent = list(range(len(cands)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for i in range(len(cands)):
            for j in range(i + 1, len(cands)):
                if find(i) != find(j) and self._linked(cands[i]["entity"], cands[j]["entity"], g.get("link", [])):
                    parent[find(i)] = find(j)
        comps = {}
        for i, cnd in enumerate(cands):
            comps.setdefault(find(i), []).append(cnd)
        groups = []
        for members in comps.values():
            members.sort(key=lambda c: c["entity"]["id"])
            repr_ = min(members, key=lambda c: self._order_key(order, c))
            sup_m = max(members, key=lambda c: (c["score"], c["entity"]["id"]))
            support = sup_m["score"] if g.get("support", "max_member") == "max_member" else repr_["score"]
            groups.append({"members": members, "representative": repr_, "support_member": sup_m, "support": support})
        groups.sort(key=lambda gr: (-gr["support"], self._order_key(order, gr["representative"])))
        for i, gr in enumerate(groups):
            gr["index"] = i

        def cjson(c):
            d = {}
            for k, dd in c["item"][5].items():
                d.update({x: y for x, y in dd.items() if x in ("distance_km", "delta_t_ms")})
            return {"id": c["entity"]["id"], "label": c["entity"]["label"], "severity": c["entity"].get("severity"),
                    "score": round(c["score"], 12), **d}
        prov = {"var": var, "criteria": g.get("link", []), "support_method": g.get("support", "max_member"),
                "representative_order": order, "rule_id": rule.id, "rule_version": rule.version,
                "candidates": [], "groups": []}
        for gr in groups:
            for c in gr["members"]:
                prov["candidates"].append(dict(cjson(c), group=gr["index"]))
            prov["groups"].append({"index": gr["index"], "members": [c["entity"]["id"] for c in gr["members"]],
                                   "support": round(gr["support"], 12),
                                   "support_member": gr["support_member"]["entity"]["id"],
                                   "representative": gr["representative"]["entity"]["id"],
                                   "representative_reason": "primo per ordinamento " + ", ".join(
                                       f"{a} {d}" for a, d in order) + " tra i membri del gruppo"})
        prov["candidates"] = prov["candidates"][:200]
        return prov, groups

    def compute_anchor(self, rule: Rule, anchor):
        """Compute the insights of `rule` for one anchor entity. Returns list of (id, value) written."""
        bindings = self.solve(rule, {rule.anchor: anchor})
        out = []
        if rule.output == "context":
            cvar = rule.collect["var"]
            items = []
            best_f, best_d = None, None
            for b, factors, details in bindings:
                e = b.get(cvar)
                if e is None:
                    continue
                dist = None
                for k, d in details.items():
                    if cvar in k.split(":")[1].split("-") and "distance_km" in d:
                        dist = d["distance_km"]
                items.append((dist if dist is not None else 0.0, e["id"], e, factors, details))
            if not items:
                return out
            items.sort(key=lambda x: (x[0], x[1]))
            uniq, seen_ids = [], set()
            for it in items:
                if it[1] not in seen_ids:
                    seen_ids.add(it[1])
                    uniq.append(it)
            items = uniq
            items = items[: int(rule.collect.get("limit", 20))]
            radius = None
            for _, _, _, _, d in items:
                for dd in d.values():
                    if "radius_km" in dd:
                        radius = dd["radius_km"]
            collected = {cvar: [(e, dist) for dist, _, e, _, _ in items]}
            for extra in rule.collect.get("count", []):
                ids = {}
                for b, _, _ in bindings:
                    if b.get(extra) is not None:
                        ids[b[extra]["id"]] = b[extra]
                collected[extra] = [(ids[k], None) for k in sorted(ids)]
            collected["radius_km"] = radius
            first_dist, _, _, best_f, best_d = items[0]
            members = [(rule.anchor, anchor)] + [(f"{cvar}#{i:03d}", e) for i, (_, _, e, _, _) in enumerate(items)]
            for extra in rule.collect.get("count", []):
                members += [(f"{extra}#{i:03d}", e) for i, (e, _) in enumerate(collected[extra])]
            extra_detail = {f"{cvar}#{i:03d}": {"distance_km": dist} for i, (dist, _, _, _, _) in enumerate(items)}
            value, fac = self._score(rule, [(rule.anchor, anchor), (f"{cvar}#000", items[0][2])], best_f)
            if value < rule.emit_threshold:
                return out
            expl = self._render(rule, {rule.anchor: anchor}, best_d, collected)
            iid, _ = self._write_insight(rule, anchor, members, fac, value, expl, extra_detail)
            return [(iid, value)]
        scored = []
        for b, factors, details in bindings:
            members = self._members(rule, b, details)
            value, fac = self._score(rule, members, factors)
            scored.append((value, sorted(f"{n}={m['id']}" for n, m in members), b, members, fac, details))
        grouping = None
        if rule.group:
            prov, groups = self._group_candidates(rule, scored)
            selected = [gr for gr in groups if gr["support"] >= rule.emit_threshold]
            if rule.unique:
                selected = selected[:1]
            chosen = []
            for gr in selected:
                rep_item = gr["representative"]["item"]
                sup_item = gr["support_member"]["item"] if prov["support_method"] == "max_member" else rep_item
                chosen.append((gr["support"], rep_item, sup_item, gr))
            emitted = {gr["index"] for _, _, _, gr in chosen}
            discarded = []
            for gr in groups:
                for c in gr["members"]:
                    if gr["index"] not in emitted:
                        why = ("gruppo con supporto sotto soglia" if gr["support"] < rule.emit_threshold
                               else "gruppo con supporto inferiore al gruppo scelto")
                    elif c["entity"]["id"] == gr["representative"]["entity"]["id"]:
                        continue
                    else:
                        why = "membro del gruppo scelto, non rappresentante"
                    discarded.append({"id": c["entity"]["id"], "group": gr["index"], "reason": why})
            prov["discarded"] = discarded[:200]
            grouping = prov
            work = []
            for support, rep_item, sup_item, gr in chosen:
                fac = dict(sup_item[4])
                g2 = dict(prov, chosen_group=gr["index"], representative=gr["representative"]["entity"]["id"],
                          support=round(support, 12), support_member=gr["support_member"]["entity"]["id"])
                work.append((support, rep_item[1], rep_item[2], rep_item[3], fac, rep_item[5], gr, g2))
        else:
            scored = [x for x in scored if x[0] >= rule.emit_threshold]
            scored.sort(key=lambda x: (-x[0], x[1]))
            if rule.unique:
                scored = scored[:1]
            work = [(v, k, b, m, f, d, None, None) for v, k, b, m, f, d in scored]
        for value, _, b, members, fac, details, gr, gprov in work[: rule.max_results]:
            if gr is not None:
                gvar = rule.group["var"]
                rep_id = gr["representative"]["entity"]["id"]
                members = list(members) + [(f"{gvar}~group#{i:03d}", c["entity"]) for i, c in enumerate(
                    [c for c in gr["members"] if c["entity"]["id"] != rep_id])]
            detail_by_var = {}
            trig = b.get(rule.anchor)
            for name, m in members:
                d = {}
                for k, dd in details.items():
                    if name in k.split(":")[1].split("-"):
                        d.update({x: y for x, y in dd.items() if x in ("distance_km", "delta_t_ms")})
                detail_by_var[name] = d
            expl = self._render(rule, b, details)
            iid, _ = self._write_insight(rule, trig, members, fac, value, expl, detail_by_var, gprov)
            out.append((iid, value))
        return out

    def run_rule(self, rule: Rule, anchors=None) -> dict:
        """Recompute insights for the given anchors (None = every matching anchor)."""
        v = rule.var[rule.anchor]
        existing = {}
        for iid, aid in self.conn.execute("SELECT insight_id, anchor_id FROM insight WHERE rule_id=? AND status='active'",
                                          (rule.id,)):
            existing.setdefault(aid, set()).add(iid)
        if anchors is None:
            anchor_ents = list(self.scan(v))
            ids = {e["id"] for e in anchor_ents} | set(existing)
        else:
            ids = set(anchors)
        stats = {"anchors": 0, "written": 0, "retired": 0}
        for aid in sorted(ids):
            e = self.entity(v["kind"], aid)
            new = []
            if e is not None and self._matches(v, e):
                new = self.compute_anchor(rule, e)
                stats["anchors"] += 1
            new_ids = {i for i, _ in new}
            stats["written"] += len(new_ids - existing.get(aid, set()))
            replacement = max(new, key=lambda x: (x[1], x[0]))[0] if new else None
            for old in sorted(existing.get(aid, set()) - new_ids):
                self._retire(old, "superseded" if replacement else "stale", replacement,
                             self.conn.execute("SELECT created_at_ms FROM insight WHERE insight_id=?",
                                               (old,)).fetchone()[0])
                stats["retired"] += 1
        return stats

    def affected_anchors(self, rule: Rule, changed: dict) -> set:
        """Anchors whose insights may change after the given world changes."""
        anchors = set()
        # insights of this rule whose members changed
        all_changed = set().union(*changed.values()) if changed else set()
        for chunk in _chunks(sorted(all_changed), 500):
            ph = ",".join("?" * len(chunk))
            for (aid,) in self.conn.execute(
                    f"SELECT DISTINCT i.anchor_id FROM evidence e JOIN insight i ON i.insight_id=e.supports_id "
                    f"WHERE e.supports_kind='insight' AND i.rule_id=? AND i.status='active' AND e.support_id IN ({ph})",
                    (rule.id, *chunk)):
                anchors.add(aid)
        for v in rule.vars:
            kind = v["kind"]
            for eid in sorted(changed.get(kind, set())):
                e = self.entity(kind, eid)
                if e is None:
                    continue
                if v["name"] == rule.anchor:
                    anchors.add(eid)
                    continue
                if not self._matches(v, e):
                    continue
                for b, _, _ in self.solve(rule, {v["name"]: e}):
                    if b.get(rule.anchor) is not None:
                        anchors.add(b[rule.anchor]["id"])
        return anchors

    def run(self, changed: dict | None = None) -> dict:
        """Batch (changed=None) or incremental correlation over all rules, in dependency order."""
        self.reset_cache()
        stats = {}
        changed = {k: set(v) for k, v in (changed or {}).items()} if changed is not None else None
        for rule in self.rules:
            if changed is None:
                st = self.run_rule(rule, None)
            else:
                st = self.run_rule(rule, self.affected_anchors(rule, changed))
            stats[rule.id] = st
            if changed is not None:
                changed.setdefault("insight", set()).update(self.world.changed.get("insight", set()))
            self.reset_cache()
        return stats


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def register_rules(conn, rules):
    for r in rules:
        conn.execute("INSERT OR IGNORE INTO rule VALUES(?,?,?,?)", (r.id, r.version, r.text, r.hash))


def explanation_is_clean(text: str) -> bool:
    low = text.lower()
    return not any(w in low for w in FORBIDDEN_WORDS)
