"""Type system as data: object, event and relation types declared in vocabularies.

The Core never hard-codes a type. Vocabulary files (TOML) declare identity,
admissible geometry, properties, roles, severity, relation natures and
declarative enrichments.
"""

import hashlib
import json
import pathlib
import tomllib
from dataclasses import dataclass, field

GEOMETRY_KINDS = ("point", "area", "any", "none")
NATURES = ("spatial", "logical", "temporal", "infrastructural",
           "organizational", "technological", "informational")
VALUE_KINDS = ("text", "float", "int", "bool", "list")


class VocabError(ValueError):
    pass


@dataclass
class PropertyDef:
    name: str
    kind: str
    unit: str | None = None
    required: bool = False


@dataclass
class EntityType:
    id: str
    kind: str  # "object" | "event"
    label: str
    geometry: str
    identity_schemes: list
    properties: dict
    roles: list = field(default_factory=list)
    severity: dict | None = None
    name_match: bool = False
    display: dict = field(default_factory=dict)
    vocab_hash: str = ""


@dataclass
class RelationType:
    id: str
    label: str
    nature: str
    symmetric: bool
    from_types: list
    to_types: list
    display: dict = field(default_factory=dict)
    vocab_hash: str = ""


@dataclass
class Enrichment:
    id: str
    when_kind: str
    when_types: list
    container_type: str
    produce: str               # "relation" | "participation"
    relation_type: str | None
    role: str | None
    fallback_nearest_km: float
    fallback_role: str | None
    fallback_relation_type: str | None


class TypeSystem:
    def __init__(self):
        self.objects: dict[str, EntityType] = {}
        self.events: dict[str, EntityType] = {}
        self.relations: dict[str, RelationType] = {}
        self.enrichments: list[Enrichment] = []
        self.aliases: dict[str, dict[str, list[str]]] = {}
        self.hash = ""

    def entity(self, type_id: str) -> EntityType:
        t = self.objects.get(type_id) or self.events.get(type_id)
        if t is None:
            raise VocabError(f"unknown entity type {type_id!r}")
        return t

    def kind_of(self, type_id: str) -> str:
        if type_id in self.objects:
            return "object"
        if type_id in self.events:
            return "event"
        if type_id in self.relations:
            return "relation"
        raise VocabError(f"unknown type {type_id!r}")

    def relation(self, type_id: str) -> RelationType:
        if type_id not in self.relations:
            raise VocabError(f"unknown relation type {type_id!r}")
        return self.relations[type_id]

    def check_relation(self, rtype: str, from_type: str, to_type: str) -> None:
        r = self.relation(rtype)
        if r.from_types != ["any"] and from_type not in r.from_types:
            raise VocabError(f"relation {rtype}: source type {from_type} not admitted")
        if r.to_types != ["any"] and to_type not in r.to_types:
            raise VocabError(f"relation {rtype}: target type {to_type} not admitted")

    def severity(self, type_id: str, props: dict) -> float | None:
        """Generic linear severity declared by the type: clamp((v-min)/(max-min))."""
        t = self.entity(type_id)
        spec = t.severity
        if not spec:
            return None
        v = props.get(spec["property"])
        if v is None:
            return None
        lo, hi = float(spec["min"]), float(spec["max"])
        s = (float(v) - lo) / (hi - lo)
        return max(0.0, min(1.0, s)) if spec.get("clamp", True) else s

    def completeness(self, type_id: str, props: dict) -> float:
        req = [p for p in self.entity(type_id).properties.values() if p.required]
        if not req:
            return 1.0
        present = sum(1 for p in req if props.get(p.name) not in (None, ""))
        return present / len(req)

    def validate_props(self, type_id: str, props: dict) -> dict:
        t = self.entity(type_id)
        out = {}
        for k, v in props.items():
            pd = t.properties.get(k)
            if pd is None:
                raise VocabError(f"{type_id}: undeclared property {k!r}")
            if v is None:
                out[k] = None
                continue
            if pd.kind == "float":
                v = float(v)
            elif pd.kind == "int":
                v = int(v)
            elif pd.kind == "bool":
                v = bool(v)
            elif pd.kind == "text":
                v = str(v)
            elif pd.kind == "list":
                v = list(v)
            out[k] = v
        return out


def _props(d, where):
    out = {}
    for name, spec in (d or {}).items():
        kind = spec.get("kind", "text")
        if kind not in VALUE_KINDS:
            raise VocabError(f"{where}.{name}: invalid kind {kind!r}")
        out[name] = PropertyDef(name, kind, spec.get("unit"), bool(spec.get("required", False)))
    return out


def load_types(dirs) -> TypeSystem:
    ts = TypeSystem()
    digest = hashlib.sha256()
    for d in dirs:
        for p in sorted(pathlib.Path(d).glob("*.toml")):
            raw = p.read_bytes()
            digest.update(raw)
            doc = tomllib.loads(raw.decode("utf-8"))
            vh = hashlib.sha256(raw).hexdigest()[:16]
            for kind, table in (("object", "object_type"), ("event", "event_type")):
                for tid, spec in doc.get(table, {}).items():
                    geom = spec.get("geometry", "any")
                    if geom not in GEOMETRY_KINDS:
                        raise VocabError(f"{p}:{tid}: invalid geometry {geom!r}")
                    if not spec.get("identity_schemes"):
                        raise VocabError(f"{p}:{tid}: identity_schemes required")
                    et = EntityType(
                        id=tid, kind=kind, label=spec.get("label", tid), geometry=geom,
                        identity_schemes=list(spec["identity_schemes"]),
                        properties=_props(spec.get("properties"), f"{p}:{tid}"),
                        roles=list(spec.get("roles", [])), severity=spec.get("severity"),
                        name_match=bool(spec.get("name_match", False)),
                        display=spec.get("display", {}), vocab_hash=vh)
                    target = ts.objects if kind == "object" else ts.events
                    if tid in ts.objects or tid in ts.events:
                        raise VocabError(f"duplicate type {tid}")
                    target[tid] = et
            for rid, spec in doc.get("relation_type", {}).items():
                nature = spec.get("nature")
                if nature not in NATURES:
                    raise VocabError(f"{p}:{rid}: invalid nature {nature!r}")
                if rid in ts.relations:
                    raise VocabError(f"duplicate relation type {rid}")
                ts.relations[rid] = RelationType(
                    id=rid, label=spec.get("label", rid), nature=nature,
                    symmetric=bool(spec.get("symmetric", False)),
                    from_types=list(spec.get("from", ["any"])), to_types=list(spec.get("to", ["any"])),
                    display=spec.get("display", {}), vocab_hash=vh)
            for e in doc.get("enrichment", []):
                ts.enrichments.append(Enrichment(
                    id=e["id"], when_kind=e["when_kind"], when_types=list(e["when_types"]),
                    container_type=e["container_type"], produce=e["produce"],
                    relation_type=e.get("relation_type"), role=e.get("role"),
                    fallback_nearest_km=float(e.get("fallback_nearest_km", 0.0)),
                    fallback_role=e.get("fallback_role"),
                    fallback_relation_type=e.get("fallback_relation_type")))
            for tid, mapping in doc.get("aliases", {}).items():
                ts.aliases.setdefault(tid, {})
                for key, names in mapping.items():
                    ts.aliases[tid].setdefault(key, []).extend(names)
    # cross-checks
    for r in ts.relations.values():
        for t in r.from_types + r.to_types:
            if t != "any" and t not in ts.objects:
                raise VocabError(f"relation {r.id}: unknown endpoint type {t}")
    for e in ts.enrichments:
        if e.container_type not in ts.objects:
            raise VocabError(f"enrichment {e.id}: unknown container type")
        for rt in (e.relation_type, e.fallback_relation_type):
            if rt and rt not in ts.relations:
                raise VocabError(f"enrichment {e.id}: unknown relation type {rt}")
    ts.hash = digest.hexdigest()[:16]
    return ts


def type_rows(ts: TypeSystem):
    """Rows for the object_type / event_type / relation_type / property_def tables."""
    objs, evts, rels, props = [], [], [], []
    for t in ts.objects.values():
        objs.append((t.id, t.label, t.geometry, json.dumps(t.identity_schemes), int(t.name_match),
                     json.dumps(t.display, sort_keys=True), t.vocab_hash))
    for t in ts.events.values():
        evts.append((t.id, t.label, json.dumps(t.roles), json.dumps(t.severity, sort_keys=True),
                     json.dumps(t.identity_schemes), json.dumps(t.display, sort_keys=True), t.vocab_hash))
    for r in ts.relations.values():
        rels.append((r.id, r.label, r.nature, int(r.symmetric), json.dumps(r.from_types),
                     json.dumps(r.to_types), json.dumps(r.display, sort_keys=True), r.vocab_hash))
    for t in list(ts.objects.values()) + list(ts.events.values()):
        for p in t.properties.values():
            props.append((t.id, p.name, p.kind, p.unit, int(p.required)))
    return objs, evts, rels, props
