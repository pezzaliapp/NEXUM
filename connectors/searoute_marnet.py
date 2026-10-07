"""MARITIME ROUTES (2026-10-06, physical acceptance): Eurostat SeaRoute's maritime network "MARNET" — a NETWORK MODEL of
the sea lanes ships follow, made to compute shortest sea routes: lines "following some of the most frequent maritime
routes", based on the Oak Ridge National Laboratory "Global Shipping Lane Network, World, 2000" and enriched around the
European coasts from AIS data, then generalised (the 50 km version: edges shorter than ~50 km merged). It is NOT observed
traffic, carries no ship counts and no dates of passage: each line is a navigable corridor of the model, and the only
attribute is "pass" (the canal or strait a section goes through: Suez, Panama, Malacca, Gibraltar…).

Neither OSIRIS nor any other NEXUM source has sea routes (OSIRIS's "Maritime Lines" are submarine cables; ships, ports,
chokepoints and cables are other things). NEXUM publishes the network as one table (GET /tables/searoutes), read only
when a person computes a route: sections merged into continuous lines where the network does not branch, coordinates
rounded to 0.01° (~1 km).

ENGINE, NOT A LAYER (2026-10-07, stabilization after three physical tests): the network is the data a route between two
ports is computed on, in the browser (ui/src/ops/searoute.ts); NEXUM draws only the one computed route, never the graph.

Licence: the SeaRoute repository, data files included, is published by Eurostat under the European Union Public
Licence v1.2 (EUPL-1.2); redistribution allowed with the licence notice and the source. The file is fetched at a fixed
commit (reproducible), at most once a month (it changes rarely; last change 2021-09-08)."""

import collections
import sqlite3
import struct

from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
COMMIT = "0d777c05758503361d799dc0c0a23e09be1d82ae"
URL = f"https://raw.githubusercontent.com/eurostat/searoute/{COMMIT}/modules/core/src/main/resources/marnet/marnet_plus_50km.gpkg"
DIGITS = 2


def describe():
    return {"connector_version": VERSION, "produces": []}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "marnet_50km")]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    return iter(())


def _wkb_lines(b: bytes, o: int = 0):
    """The line strings of a WKB LineString / MultiLineString (2D, or with Z/M dropped) starting at offset o."""
    end = "<" if b[o] == 1 else ">"
    kind = struct.unpack_from(end + "I", b, o + 1)[0]
    base, dims = kind % 1000, 2 + (kind // 1000 in (1, 2)) + (kind // 1000 == 3) * 2
    o += 5
    if base == 2:
        n = struct.unpack_from(end + "I", b, o)[0]
        o += 4
        pts = [struct.unpack_from(end + "dd", b, o + i * 8 * dims) for i in range(n)]
        return [pts], o + n * 8 * dims
    if base == 5:
        n = struct.unpack_from(end + "I", b, o)[0]
        o += 4
        out = []
        for _ in range(n):
            ls, o = _wkb_lines(b, o)
            out += ls
        return out, o
    return [], o


def _gpkg_lines(blob: bytes):
    """A GeoPackage geometry: 'GP' header (with an optional envelope) then WKB."""
    if blob[:2] != b"GP":
        return []
    env = (blob[3] >> 1) & 7
    size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get(env, 0)
    return _wkb_lines(blob, 8 + size)[0]


def _merge(edges):
    """Join sections end to end where the network does not branch: exactly two sections meet there, with the same pass.
    Fewer, longer lines; every junction kept (a canal meeting the open sea stays connected); nothing added or removed."""
    key = lambda p: (round(p[0], DIGITS), round(p[1], DIGITS))
    ends = collections.defaultdict(list)
    for i, (_g, pts) in enumerate(edges):
        for k in (key(pts[0]), key(pts[-1])):
            ends[k].append(i)
    used, out = set(), []
    for i, (g, pts) in enumerate(edges):
        if i in used:
            continue
        used.add(i)
        line = list(pts)
        while True:                                   # forwards from the line's end
            k = key(line[-1])
            at = ends[k]
            nxt = [j for j in at if j not in used and edges[j][0] == g]
            if len(at) != 2 or not nxt:
                break
            used.add(nxt[0])
            seg = edges[nxt[0]][1]
            line += seg[1:] if key(seg[0]) == k else seg[::-1][1:]
        while True:                                   # backwards from the line's start
            k = key(line[0])
            at = ends[k]
            nxt = [j for j in at if j not in used and edges[j][0] == g]
            if len(at) != 2 or not nxt:
                break
            used.add(nxt[0])
            seg = edges[nxt[0]][1]
            line = (seg[:-1] if key(seg[-1]) == k else seg[::-1][:-1]) + line
        out.append((g, line))
    return out


def table(payloads):
    """[pass (canal/strait or ""), course [[lon, lat], …]] — one row per continuous line (sections joined where the
    network does not branch and the pass is the same)."""
    mine = sorted((p for p in payloads if p[0] == "marnet_50km"), key=lambda p: p[2])
    if not mine:
        return {"fields": ["pass", "course"], "rows": [], "notes": {}}
    con = sqlite3.connect(":memory:")
    con.deserialize(mine[-1][1])
    name = con.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'").fetchone()[0]
    cols = [r[1] for r in con.execute(f'PRAGMA table_info("{name}")')]
    gcol = con.execute("SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?", (name,)).fetchone()[0]
    pcol = "pass" if "pass" in cols else None
    edges = []
    for g, ps in con.execute(f'SELECT "{gcol}", {f"{pcol}" if pcol else "NULL"} FROM "{name}"'):
        for pts in _gpkg_lines(g):
            if len(pts) >= 2:
                edges.append((ps or "", [(x, y) for x, y in pts]))
    con.close()
    rows = []
    for ps, line in _merge(edges):
        course, last = [], None
        for x, y in line:
            p = [round(x, DIGITS), round(y, DIGITS)]
            if p != last:
                course.append(p)
                last = p
        if len(course) >= 2:
            rows.append([ps, course])
    return {"fields": ["pass", "course"], "rows": rows,
            "notes": {"network": "Eurostat SeaRoute MARNET, 50 km generalisation", "commit": COMMIT, "sections": len(edges),
                      "represents": "theoretical navigable network (model), not observed traffic; the engine of a route between two ports",
                      "basis": "ORNL Global Shipping Lane Network, World, 2000; enriched around Europe from AIS data",
                      "licence": {"id": "EUPL-1.2", "text": "/licenses/EUPL-1.2.txt", "modified": "NEXUM 2026-10-07: rounded to 0.01°, sections joined",
                                  "chain": "ORNL CTA global seaways (public domain) → GeoCommons dataset 25 → Eurostat SeaRoute (EUPL-1.2) → NEXUM (EUPL-1.2)"}}}
