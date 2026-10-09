"""PLACE MEMBERSHIP for 'the most populous member of a place' (2026-10-08, demographic audit): a member belongs to the
place its source declares (exact identifier) unless the geometric containment names another place; a dependency
declared with its sovereign's code keeps its containment when the source's own place name is the container's name;
disagreement → attributed to none; no usable declaration → containment. Synthetic database, fixed inputs."""

import json
import sqlite3

from nexum.api.server import _members_by_place, member_places

RULE = {"property": "code", "scheme": "a2", "name_property": "pname", "spatial": ["located_in"], "fallback": "located_in"}


def db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
    CREATE TABLE object (object_id TEXT, type TEXT, label TEXT, props_json TEXT, source_id TEXT, status TEXT);
    CREATE TABLE identifier (scheme TEXT, value TEXT, entity_kind TEXT, entity_id TEXT, strong INT, source_id TEXT, prov_id INT);
    CREATE TABLE relation (relation_id TEXT, type TEXT, from_id TEXT, to_id TEXT);""")
    for pid, label, code in (("pA", "Alpha", "AA"), ("pB", "Beta", "BB"), ("pN", "Nuova", "NN")):
        c.execute("INSERT INTO object VALUES (?,?,?,?,?,?)", (pid, "zone", label, "{}", "s", "reviewed"))
        c.execute("INSERT INTO identifier VALUES ('a2',?,'object',?,1,'s',0)", (code, pid))
    members = [  # id, declared code, declared name, population, located_in
        ("coast", "AA", "Alpha", 900, None),        # outside the outline (only near): declared → Alpha
        ("inland", "AA", "Alpha", 500, "pA"),       # declared and contained agree → Alpha
        ("disputed", "AA", "Alpha", 2000, "pB"),    # declared Alpha, contained in Beta → nobody
        ("dep", "AA", "Nuova", 50, "pN"),           # sovereign's code, own name = container's name → Nuova
        ("nocode", None, "Beta", 300, "pB"),        # no declaration → containment → Beta
        ("badcode", "ZZ", "Zeta", 400, None),       # code of no place, not contained → nobody
    ]
    for oid, code, name, pop, cont in members:
        c.execute("INSERT INTO object VALUES (?,?,?,?,?,?)",
                  (oid, "member", oid, json.dumps({"code": code, "pname": name, "pop": pop}), "s", "reviewed"))
        if cont:
            c.execute("INSERT INTO relation VALUES (?,?,?,?)", (f"r{oid}", "located_in", oid, cont))
    return c


def test_membership_cases():
    got = member_places(db(), "member", RULE)
    assert got == {"coast": ("pA", "declared"), "inland": ("pA", "declared"), "disputed": (None, "conflict"),
                   "dep": ("pN", "contained"), "nocode": ("pB", "contained"), "badcode": (None, "unresolved")}


def test_most_populous_member_never_a_disputed_one():
    best = _members_by_place(db(), "member", "pop", RULE)
    assert {p: v[0] for p, v in best.items()} == {"pA": "coast", "pB": "nocode", "pN": "dep"}
    assert best["pA"][4] == "declared"
