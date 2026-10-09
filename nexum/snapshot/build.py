"""Build the static snapshot of a world: `python3 -m nexum.snapshot build d1 --out data/snapshot`.

Layout (every data file is gzip-compressed JSON with the `.jgz` extension, decompressed by the browser):

  current.json                      pointer to the active snapshot (the only mutable file)
  s/<version>/manifest.json         version, world, sources, shard counts, tile index, file hashes
  s/<version>/api/{status,types,sources}.json    exact service responses (global documents)
  s/<version>/basemap/style.json    basemap style; layers as <name>.bmz (lossless compact polygons, nexum-basemap://)
  s/<version>/world.jgz             relation natures, agg_rel, time extent
  s/<version>/insights.jgz          insight rows (without texts)
  s/<version>/insight_texts.jgz     explanations and confidence texts of the insights, insight members
  s/<version>/agg/<level>-{0,t}.jgz aggregation rows per level (-1, 2, 4, 6, 8): period 0 / dated periods
  s/<version>/events.jgz            event rows with their R*Tree boxes
  s/<version>/otiles/<t>/<x>_<y>.jgz  object rows by type and grid cell (level TILE_LEVEL)
  s/<version>/refs/<n>.jgz          references, labels, aliases, identifiers by id (FNV-1a shard)
  s/<version>/edges/<n>.jgz         graph groups and ordered edge rows by node (FNV-1a shard)
  s/<version>/adj.jgz               ordered neighbour lists (shortest path)
  s/<version>/ent/<n>.jgz           exact service responses per element + related rows (FNV-1a shard)
  s/<version>/raw/<n>.jgz           exact raw-record extractions by (raw_id, locator)
  s/<version>/rules.jgz             rule definitions (WHY)
  s/<version>/search.sqlite.jgz     the Core's full-text index (FTS5 shadow tables, vocabulary) + rid_rank_bits (join, order)
  s/<version>/sdoc/<n>.jgz          rid_map by rid range (SDOC rids per file) with type, label and insight status
  s/<version>/ind/<n>.jgz           country indicators and energy flows: exact /indicators/<id> responses by place (FNV-1a shard)
"""

import argparse
import datetime
import gzip
import hashlib
import json
import multiprocessing as mp
import os
import pathlib
import shutil
import sqlite3
import sys
import time
import tomllib

from nexum.core import geo
from nexum.core.query import TABLE, kind_of

from . import FORMAT
from .service import LocalService

N_ENT, N_REFS, N_EDGE, N_RAW = 4096, 512, 1024, 512   # refs 2048 → 512 (2026-10-04, O7: 7 KB files merged, ~28 KB)
N_IND = 32                           # country indicators: one file per FNV-1a shard of the place id (read on opening a place)
TILE_LEVEL = 5
SPARSE_TILE_LEVEL = 2      # types with at most DENSE_TYPE located objects: 4×4 tiles (O7: file count)
DENSE_TYPE = 20000
SDOC = 256                           # rids per search-document shard (small files: a search reads many of them; 1024 tried on 2026-10-04 slowed O9)
AGG_LEVELS = (-1, 2, 4, 6, 8)
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_FILES = 9000                     # O7: two snapshots fit Cloudflare Pages' 20,000 files per deployment
EVENT_COLS = ("event_id", "type", "label", "t_start_ms", "lon", "lat", "cx", "cy", "status", "source_id", "band",
              "confidence", "recorded_at_ms")
OBJECT_COLS = ("object_id", "type", "label", "lon", "lat", "cx", "cy", "status", "source_id", "band", "confidence",
               "recorded_at_ms")
INSIGHT_COLS = ("insight_id", "kind", "type", "rule_id", "label", "confidence", "confidence_text", "explanation",
                "t_start_ms", "lon", "lat", "min_lon", "max_lon", "min_lat", "max_lat", "cx", "cy", "band", "status")


# ── compact basemap (lossless): coordinates are the provider's 0.01° values, stored as zig-zag varint deltas ──
def _varint(n, out):
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def encode_polygons(fc) -> bytes:
    head = {k: v for k, v in fc.items() if k != "features"}
    props = [f.get("properties", {}) for f in fc["features"]]
    meta = json.dumps({"head": head, "props": props}, separators=(",", ":"), ensure_ascii=False).encode()
    out = bytearray()
    _varint(len(meta), out)
    out += meta
    _varint(len(fc["features"]), out)
    for f in fc["features"]:
        g = f["geometry"]
        multi = g["type"] == "MultiPolygon"
        polys = g["coordinates"] if multi else [g["coordinates"]]
        _varint(1 if multi else 0, out)
        _varint(len(polys), out)
        for poly in polys:
            _varint(len(poly), out)
            for ring in poly:
                _varint(len(ring), out)
                px = py = 0
                for x, y in ring:
                    ix, iy = round(x * 100), round(y * 100)
                    if ix / 100 != x or iy / 100 != y:
                        raise ValueError(f"coordinate {x}, {y} is not on the 0.01° grid")
                    for d in (ix - px, iy - py):
                        _varint((d << 1) ^ (d >> 63), out)
                    px, py = ix, iy
    return bytes(out)


def decode_polygons(b: bytes):
    pos = 0

    def rd():
        nonlocal pos
        n = shift = 0
        while True:
            c = b[pos]
            pos += 1
            n |= (c & 0x7F) << shift
            shift += 7
            if not c & 0x80:
                return n

    def zz(n):
        return (n >> 1) ^ -(n & 1)

    ml = rd()
    meta = json.loads(b[pos:pos + ml])
    pos += ml
    feats = []
    for i in range(rd()):
        multi = rd()
        polys = []
        for _ in range(rd()):
            poly = []
            for _ in range(rd()):
                ring, px, py = [], 0, 0
                for _ in range(rd()):
                    px += zz(rd())
                    py += zz(rd())
                    ring.append([px / 100, py / 100])
                poly.append(ring)
            polys.append(poly)
        geom = {"type": "MultiPolygon", "coordinates": polys} if multi else {"type": "Polygon", "coordinates": polys[0]}
        feats.append({"type": "Feature", "properties": meta["props"][i], "geometry": geom})
    return {**{k: v for k, v in meta["head"].items() if k == "type"}, "features": feats,
            **{k: v for k, v in meta["head"].items() if k != "type"}}


def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(eid: str, n: int) -> int:
    return fnv1a(eid) % n


def dumps(o) -> bytes:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def pack_ranks(ids):
    """[(entity_id, rid)] sorted by entity_id → the rid_rank_bits blob: byte 0 = width w, then rid 0..max → idrank + 1
    (0 = no element) in w bits each, big-endian."""
    n = max((rid for _e, rid in ids), default=0) + 1
    vals = [0] * n
    for k, (_eid, rid) in enumerate(ids):
        vals[rid] = k + 1
    w = max(1, max(vals).bit_length())
    acc = int("".join(format(v, f"0{w}b") for v in vals) or "0", 2)
    nbits = w * n
    pad = (-nbits) % 8
    return bytes([w]) + (acc << pad).to_bytes((nbits + pad) // 8, "big")


def write_jgz(path: pathlib.Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = gzip.compress(dumps(obj), 9, mtime=0)
    if len(data) > MAX_FILE_BYTES:
        raise SystemExit(f"{path}: {len(data)} bytes exceeds the 25 MiB file limit")
    path.write_bytes(data)
    return len(data)


def write_json(path: pathlib.Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = dumps(obj)
    path.write_bytes(data)
    return len(data)


def _rows(conn, sql, args=()):
    return [list(r) for r in conn.execute(sql, args)]


# ── element bundles (run in worker processes) ────────────────────────────────

_LS: LocalService | None = None


def _init_worker(world):
    global _LS
    _LS = LocalService(world)


def _related_objects_rows(q, kind, eid):
    """Related objects of an element, unfiltered, in the Core's order (confidence desc, id) with their reason.
    Mirrors Query.related_objects before scope filtering; verified by the parity suite."""
    conn = q.conn
    rel = {}
    if kind == "event":
        for o, role in conn.execute("SELECT object_id, role FROM event_participant WHERE event_id=?", (eid,)):
            rel.setdefault(o, f"participation:{role}")
    for sql in ("SELECT dst_id, type FROM edge WHERE src_id=? AND edge_kind='relation' AND dst_id LIKE 'obj\\_%' ESCAPE '\\'",
                "SELECT src_id, type FROM edge WHERE dst_id=? AND edge_kind='relation' AND src_id LIKE 'obj\\_%' ESCAPE '\\'"):
        for o, t in conn.execute(sql, (eid,)):
            rel.setdefault(o, f"relation:{t}")
    for (iid,) in conn.execute("SELECT e.supports_id FROM evidence e JOIN insight i ON i.insight_id=e.supports_id "
                               "WHERE e.supports_kind='insight' AND e.support_id=? AND i.status='active'", (eid,)):
        for sk, sid in conn.execute("SELECT support_kind, support_id FROM evidence WHERE supports_kind='insight' "
                                    "AND supports_id=?", (iid,)):
            if sk == "object" and sid != eid:
                rel.setdefault(sid, f"insight:{iid}")
    cols = ", ".join(OBJECT_COLS)
    rows = [r for r in (conn.execute(f"SELECT {cols} FROM object WHERE object_id=?", (o,)).fetchone() for o in sorted(rel))
            if r is not None]
    rows.sort(key=lambda r: (-(r[10] or 0), r[0]))
    return [list(r) + [rel[r[0]]] for r in rows]


def _bundle(eid):
    ls = _LS
    q = ls.q
    kind = kind_of(eid)
    b = {}

    def put(key, path, params=None):
        st, body = ls.get(path, params)
        b[key] = [st, body]

    put("context", f"/context/{eid}")
    put("locate", f"/entities/{eid}/locate")
    put("tl400", f"/entities/{eid}/timeline", {"b": {"max_items": 400}})
    if kind in ("event", "insight"):
        put("nb300", f"/entities/{eid}/timeline/neighbors", {"b": {"max_items": 300}})
    if kind == "event":
        put("step:next", f"/entities/{eid}/timeline/step", {"dir": "next"})
        put("step:prev", f"/entities/{eid}/timeline/step", {"dir": "prev"})
    put("prov", f"/provenance/{eid}")
    if kind in ("insight", "relation"):
        put("explain", f"/explain/{eid}")
    put("ev10", f"/entities/{eid}/evidence", {"b": {"max_items": 10}})
    rel, fetched = q._related_with_rows(kind, eid)
    # related events in the Core's insertion order; their rows come from events.jgz (None: no row, skipped by the Core)
    b["rel_ev"] = [[ev, reason] if ev in fetched else [ev, reason, None] for ev, reason in rel.items()]
    b["rel_obj"] = _related_objects_rows(q, kind, eid)
    return b


def _build_ent_shard(args):
    out_dir, n, ids = args
    shard = {eid: _bundle(eid) for eid in ids}
    size = write_jgz(pathlib.Path(out_dir) / "ent" / f"{n}.jgz", shard)
    return n, len(ids), size


def _build_raw_shard(args):
    out_dir, n, pairs = args
    shard = {}
    for raw_id, loc in pairs:
        st, body = _LS.raw(raw_id, loc)
        shard[f"{raw_id}|{loc}"] = [st, body]
    return n, len(pairs), write_jgz(pathlib.Path(out_dir) / "raw" / f"{n}.jgz", shard)


# ── builder ──────────────────────────────────────────────────────────────────

# point layers published whole for the map's own clustering (2026-10-05, physical acceptance: the webcams were only an
# anonymous density at world scale): type → the property whose value the map distinguishes
POINT_LAYERS = {"camera.public_webcam": "availability"}


class Builder:
    def __init__(self, world, out_root, procs):
        self.world = world
        self.out_root = pathlib.Path(out_root)
        self.procs = procs
        self.ls = LocalService(world)
        self.conn = self.ls.conn
        self.q = self.ls.q
        self.stage = self.out_root / "s" / "_build"
        self.stats = {}

    def log(self, msg):
        print(f"[snapshot {time.strftime('%H:%M:%S')}] {msg}", flush=True)

    def run(self):
        t0 = time.time()
        if self.stage.exists():
            shutil.rmtree(self.stage)
        self.stage.mkdir(parents=True)
        wv = self.ls.world_version()
        self.log(f"world {self.world} version {wv} → {self.stage}")
        self.globals()
        self.world_file()
        self.aggregates()
        self.events()
        tiles = self.object_tiles()
        self.refs()
        self.edges()
        self.adjacency()
        self.search()
        self.rules()
        self.raw()
        self.bundles()
        manifest = self.manifest(wv, tiles, time.time() - t0)
        version = manifest["version"]
        final = self.out_root / "s" / version
        if final.exists():
            shutil.rmtree(final)
        # URLs inside the snapshot (basemap style) are rewritten to the final version path
        style_p = self.stage / "basemap" / "style.json"
        style_p.write_bytes(style_p.read_bytes().replace(b"/s/_build/", f"/s/{version}/".encode()))
        manifest["files"]["basemap/style.json"] = hashlib.sha256(style_p.read_bytes()).hexdigest()
        write_json(self.stage / "files.json", {"version": version, "files": manifest.pop("files")})
        write_json(self.stage / "manifest.json", manifest)
        self.stage.rename(final)
        write_json(self.out_root / "current.json", {"format": FORMAT, "version": version, "base": f"/s/{version}/",
                                                    "world": self.world, "world_version": wv,
                                                    "built_utc": manifest["built_utc"]})
        self.log(f"done: {version} — {manifest['file_count']} files, {manifest['bytes'] / 1048576:.1f} MB, "
                 f"{time.time() - t0:.0f} s")
        return final

    # global documents (exact service responses)
    def globals(self):
        for name in ("status", "types", "sources", "highlights", "insight-summaries", "observations", "tenures",
                     "indicators-catalog", "security", "event-webcams", "places-index"):
            st, body = self.ls.get(f"/{name}")
            assert st == 200, (name, body)
            write_json(self.stage / "api" / f"{name}.json", body)
        # the tables sources publish as is (registry option "published_table"), read on demand by the browser
        for src in self.ls.svc.sources.values():
            t = (src.options or {}).get("published_table")
            if t:
                st, body = self.ls.get(f"/tables/{t}")
                assert st == 200, (t, body)
                write_json(self.stage / "api" / "tables" / f"{t}.json", body)
        # the point layers the map clusters on its own (every element, at every scale): type → the property it tells apart
        for t, prop in POINT_LAYERS.items():
            st, body = self.ls.get(f"/types/{t}/points", {"status": prop})
            assert st == 200, (t, body)
            write_json(self.stage / "api" / "types" / t / f"points-{prop}.json", body)
        # the indicators of each place: exact service responses, in N_IND shards by place id (packaging per domain)
        st, cat = self.ls.get("/indicators-catalog")
        from nexum.api.server import _indicators_pkg
        pkg = _indicators_pkg(self.q)
        # every explorable place (vocabulary hint "explore") gets its exact answer, empty ones included (a data gap)
        from nexum.api.server import _hints
        explore = [t for t, (_l, h) in _hints(self.conn).items() if h.get("explore")]
        every = {r[0] for t in explore for r in self.conn.execute("SELECT object_id FROM object WHERE type=?", (t,))}
        places = sorted(set(pkg["by_entity"]) | set(pkg["flows"]) | set(pkg["subtypes"]) | every)
        shards = [dict() for _ in range(N_IND)]
        for eid in places:
            st, body = self.ls.get(f"/indicators/{eid}")
            assert st == 200, (eid, body)
            shards[shard_of(eid, N_IND)][eid] = body
        size = 0
        for n, sh in enumerate(shards):
            size += write_jgz(self.stage / "ind" / f"{n}.jgz", sh)
        self.stats["ind"] = size
        self.stats["ind_places"] = len(places)
        style = self.ls.svc.basemap.style()
        for sid, src in style["sources"].items():
            name = src["data"].rsplit("/", 1)[1].split(".")[0]
            fc = json.loads(self.ls.svc.basemap.layer(name))
            data = encode_polygons(fc)
            assert decode_polygons(data) == fc, "basemap encoding is not lossless"
            (self.stage / "basemap").mkdir(parents=True, exist_ok=True)
            (self.stage / "basemap" / f"{name}.bmz").write_bytes(gzip.compress(data, 9, mtime=0))
            # the web workspace decodes it (nexum-basemap:// protocol) back to the provider's identical GeoJSON
            src["data"] = f"nexum-basemap:///s/_build/basemap/{name}.bmz"
        write_json(self.stage / "basemap" / "style.json", style)
        labels = self.ls.svc.basemap.labels()
        if labels is not None:
            (self.stage / "basemap" / "labels.json").write_bytes(labels)

    def world_file(self):
        c = self.conn
        ins = _rows(c, f"SELECT {', '.join('i.' + k for k in INSIGHT_COLS)}, m.rid, r.min_lon, r.max_lon, r.min_lat, "
                       f"r.max_lat FROM insight i LEFT JOIN rid_map m ON m.entity_id=i.insight_id LEFT JOIN insight_rtree r "
                       f"ON r.rid=m.rid ORDER BY i.insight_id")
        lo = c.execute("SELECT MIN(t_start_ms), MAX(t_start_ms) FROM event").fetchone()
        # the texts of the insights (explanation, confidence text) and their members are read only by the insights
        # listing: they live in their own file, so drawing the world never downloads them (same answers)
        cols = list(INSIGHT_COLS) + ["rid", "r_min_lon", "r_max_lon", "r_min_lat", "r_max_lat"]
        ix, it = cols.index("explanation"), cols.index("confidence_text")
        texts = {r[0]: [r[ix], r[it]] for r in ins}
        slim_cols = [k for k in cols if k not in ("explanation", "confidence_text")]
        slim = [[v for k, v in zip(cols, r) if k not in ("explanation", "confidence_text")] for r in ins]
        data = {"world_version": self.ls.world_version(), "event_t_extent": [lo[0], lo[1]],
                "relation_natures": {t: n for t, n in c.execute("SELECT type_id, nature FROM relation_type")},
                "agg_rel": _rows(c, "SELECT type, nature, n FROM agg_rel ORDER BY type")}
        self.stats["world"] = write_jgz(self.stage / "world.jgz", data)
        # the insights' rows: read by the views that draw or list insights, never by the filters' counts
        write_jgz(self.stage / "insights.jgz", {"insight_cols": slim_cols, "insights": slim})
        write_jgz(self.stage / "insight_texts.jgz", {
            "texts": texts,
            "insight_members": _rows(c, "SELECT supports_id, support_id FROM evidence WHERE supports_kind='insight' "
                                        "ORDER BY supports_id, support_id")})

    def aggregates(self):
        """Per level, two files: period 0 (objects and all-time totals: every view without a time window) and the
        dated periods (time windows, timeline)."""
        for lvl in AGG_LEVELS:
            for part, cond in (("0", "period=0"), ("t", "period<>0")):
                rows = _rows(self.conn, f"SELECT period, cx, cy, kind, type, source, band, geo, n, maxconf FROM agg "
                                        f"WHERE level=? AND {cond} ORDER BY period, cx, cy, kind, type, source, band, geo",
                             (lvl,))
                self.stats[f"agg{lvl}-{part}"] = write_jgz(self.stage / "agg" / f"{lvl}-{part}.jgz", rows)

    def events(self):
        cols = ", ".join("e." + k for k in EVENT_COLS)
        rows = _rows(self.conn, f"SELECT {cols}, m.rid, r.min_lon, r.max_lon, r.min_lat, r.max_lat FROM event e "
                                f"LEFT JOIN rid_map m ON m.entity_id=e.event_id LEFT JOIN event_rtree r ON r.rid=m.rid "
                                f"ORDER BY e.event_id")
        self.stats["events"] = write_jgz(self.stage / "events.jgz", {"cols": list(EVENT_COLS) + [
            "rid", "r_min_lon", "r_max_lon", "r_min_lat", "r_max_lat"], "rows": rows})

    def object_tiles(self):
        """Object rows by (type, cell at TILE_LEVEL of the representative point); objects without a point are
        never projected on the map and are not tiled."""
        # tile level per type: dense types keep TILE_LEVEL; sparse ones use coarser tiles (fewer files, same rows)
        counts = dict(self.conn.execute("SELECT type, COUNT(*) FROM object WHERE cx IS NOT NULL GROUP BY type").fetchall())
        level_of = {t: TILE_LEVEL if n > DENSE_TYPE else SPARSE_TILE_LEVEL for t, n in counts.items()}
        cols = ", ".join("o." + k for k in OBJECT_COLS)
        tiles, types = {}, {}
        for r in self.conn.execute(f"SELECT {cols}, m.rid, r.min_lon, r.max_lon, r.min_lat, r.max_lat FROM object o "
                                   f"LEFT JOIN rid_map m ON m.entity_id=o.object_id LEFT JOIN object_rtree r ON r.rid=m.rid "
                                   f"WHERE o.cx IS NOT NULL ORDER BY o.object_id"):
            t = r[1]
            ti = types.setdefault(t, len(types))
            s = geo.MAX_LEVEL - level_of[t]
            tiles.setdefault((ti, r[5] >> s, r[6] >> s), []).append(list(r))
        index = {}
        for (ti, x, y), rows in sorted(tiles.items()):
            write_jgz(self.stage / "otiles" / str(ti) / f"{x}_{y}.jgz", rows)
            index.setdefault(ti, []).append([x, y, len(rows)])
        self.stats["otiles"] = len(tiles)
        return {"level": TILE_LEVEL, "cols": list(OBJECT_COLS) + ["rid", "r_min_lon", "r_max_lon", "r_min_lat", "r_max_lat"],
                "types": {t: i for t, i in types.items()}, "cells": {str(i): v for i, v in index.items()},
                "levels": {str(i): level_of[t] for t, i in types.items()}}

    def refs(self):
        c, q = self.conn, self.q
        shards = [dict() for _ in range(N_REFS)]
        aliases, idents = {}, {}
        for eid, a in c.execute("SELECT entity_id, alias FROM alias ORDER BY entity_id, alias_norm"):
            aliases.setdefault(eid, []).append(a)
        for eid, sch, v in c.execute("SELECT entity_id, scheme, value FROM identifier ORDER BY entity_id, scheme, value"):
            idents.setdefault(eid, []).append([sch, v])
        for kind, (table, key) in TABLE.items():
            if kind == "relation":
                sql = "SELECT relation_id, type, NULL, NULL, NULL, NULL, NULL, NULL, confidence, NULL FROM relation"
            elif kind == "insight":
                sql = ("SELECT insight_id, type, label, t_start_ms, cx, cy, lon, lat, confidence, status FROM insight")
            elif kind == "event":
                sql = "SELECT event_id, type, label, t_start_ms, cx, cy, lon, lat, confidence, status FROM event"
            else:
                sql = "SELECT object_id, type, label, NULL, cx, cy, lon, lat, confidence, status FROM object"
            for eid, typ, label, t, cx, cy, lon, lat, conf, status in c.execute(sql):
                ref = {"kind": kind, "id": eid, "type": typ, "label": typ if kind == "relation" else label}
                e = {"ref": ref, "t": t, "cx": cx, "cy": cy, "status": status}
                if eid in aliases:
                    e["aliases"] = aliases[eid]
                if eid in idents:
                    e["ids"] = idents[eid]
                shards[shard_of(eid, N_REFS)][eid] = e
        total = 0
        for n, sh in enumerate(shards):
            total += write_jgz(self.stage / "refs" / f"{n}.jgz", sh)
        self.stats["refs"] = total

    def edges(self):
        """For every node: its (edge_kind, type, direction, count) groups as the Core computes them, and every
        group's rows in the Core's order (out: ORDER BY dst_id, in: ORDER BY src_id), with the edge confidence
        and the reference of the other end resolved as the Core resolves them."""
        c, q = self.conn, self.q
        nodes = sorted({r[0] for r in c.execute("SELECT src_id FROM edge UNION SELECT dst_id FROM edge")})
        shards = [dict() for _ in range(N_EDGE)]
        refcache = {}

        def ref(i):
            if i not in refcache:
                try:
                    refcache[i] = q.ref(kind_of(i), i)
                except Exception:   # noqa: BLE001 — an id the Core cannot type: no reference (the Core skips it)
                    refcache[i] = None
            return refcache[i]

        for eid in nodes:
            groups = q._groups(eid)
            rows = {}
            for ek, et, dr, _n in groups:
                if dr == "out":
                    rs = c.execute("SELECT * FROM edge WHERE src_id=? AND edge_kind=? AND type=? ORDER BY dst_id",
                                   (eid, ek, et)).fetchall()
                else:
                    rs = c.execute("SELECT * FROM edge WHERE dst_id=? AND edge_kind=? AND type=? ORDER BY src_id",
                                   (eid, ek, et)).fetchall()
                rows[f"{ek}|{et}|{dr}"] = [[r["src_id"], r["dst_id"], r["edge_kind"], r["type"], r["nature"], r["ref_id"],
                                            q._edge_confidence(r), ref(r["dst_id"] if dr == "out" else r["src_id"])]
                                           for r in rs]
            shards[shard_of(eid, N_EDGE)][eid] = {"ref": ref(eid), "groups": [list(g) for g in groups], "rows": rows}
        total = 0
        for n, sh in enumerate(shards):
            total += write_jgz(self.stage / "edges" / f"{n}.jgz", sh)
        self.stats["edges"] = total

    def adjacency(self):
        """Ordered neighbour lists exactly as Query._neighbors(eid, cap=5000) returns them (shortest path)."""
        c, q = self.conn, self.q
        nodes = sorted({r[0] for r in c.execute("SELECT src_id FROM edge UNION SELECT dst_id FROM edge")})
        idx = {n: i for i, n in enumerate(nodes)}
        nb = []
        for n in nodes:
            nb.append([idx[m] for m in q._neighbors(n)])
        self.stats["adj"] = write_jgz(self.stage / "adj.jgz", {"ids": nodes, "nb": nb})

    def search(self):
        p = self.stage / "search.sqlite"
        src = sqlite3.connect(pathlib.Path(self.ls.cfg.db_path).resolve().as_uri() + "?mode=ro", uri=True)
        fts_sql = src.execute("SELECT sql FROM sqlite_master WHERE name='search_fts'").fetchone()[0]
        vocab_sql = src.execute("SELECT sql FROM sqlite_master WHERE name='search_vocab'").fetchone()[0]
        d = sqlite3.connect(str(p))
        # physical layout only (2026-10-09, O9): 16 KiB pages and 16,000-byte FTS5 leaf pages (below) are the smallest
        # compressed file measured — the same documents, terms, statistics and scores (1,830 queries compared, 0 differences)
        d.execute("PRAGMA page_size=16384")
        d.execute(fts_sql)
        d.execute(vocab_sql)
        # rid_map's join and order, without its ids: idrank = position of entity_id in binary order, so that
        # "ORDER BY score, idrank" = the Core's "ORDER BY score, m.entity_id" (ids are resolved only for rows used).
        # Packed as one bit array: byte 0 = the width w in bits, then for every rid 0..max its value (idrank + 1, 0 = no
        # element) in w bits, big-endian (2026-10-09, O9: w = 18 today, about 11% fewer compressed bytes than 3 bytes per
        # rid; w grows by itself with the number of elements). The browser reads it once as the idrank() function.
        ids = sorted(src.execute("SELECT entity_id, rid FROM rid_map"))
        d.execute("CREATE TABLE rid_rank_bits(b BLOB NOT NULL) STRICT")
        d.execute("INSERT INTO rid_rank_bits VALUES(?)", (pack_ranks(ids),))
        for t in ("search_fts_data", "search_fts_idx", "search_fts_docsize", "search_fts_config"):
            cols = [r[1] for r in src.execute(f"PRAGMA table_info({t})")]
            d.execute(f"DELETE FROM {t}")
            d.executemany(f"INSERT INTO {t}({', '.join(cols)}) VALUES({', '.join('?' * len(cols))})",
                          src.execute(f"SELECT {', '.join(cols)} FROM {t}"))
        d.commit()
        # merge the index segments into 16,000-byte leaf pages (physical layout only: same documents, terms and
        # statistics — the averages record is copied as is, so every score is the Core's — parity-verified)
        d.execute("INSERT INTO search_fts(search_fts, rank) VALUES('pgsz', 16000)")
        d.commit()
        d.execute("INSERT INTO search_fts(search_fts) VALUES('optimize')")
        d.commit()
        d.execute("VACUUM")
        n_src = src.execute("SELECT COUNT(*) FROM search_fts_docsize").fetchone()[0]
        n_dst = d.execute("SELECT COUNT(*) FROM search_fts_docsize").fetchone()[0]
        d.close()
        src.close()
        assert n_src == n_dst, (n_src, n_dst)
        data = p.read_bytes()
        p.unlink()
        out = self.stage / "search.sqlite.jgz"
        out.write_bytes(gzip.compress(data, 9, mtime=0))
        self.stats["search"] = out.stat().st_size
        # rid_map, by rid range, with what a search result shows (kind, id, type, label, insight status): the browser
        # joins only the rows it uses (the ids are random and do not compress: shipping the whole map would double
        # the first search's download)
        c = self.conn
        rows = {}
        for rid, kind, eid in c.execute("SELECT rid, entity_kind, entity_id FROM rid_map"):
            rows[rid] = [kind, eid]
        info = {}
        for sql in ("SELECT object_id, type, label, NULL FROM object", "SELECT event_id, type, label, NULL FROM event",
                    "SELECT insight_id, type, label, status FROM insight"):
            for eid, typ, label, status in c.execute(sql):
                info[eid] = [typ, label, status]
        n_sh = (max(rows) // SDOC + 1) if rows else 0
        shards = [[None] * SDOC for _ in range(n_sh)]
        for rid, (kind, eid) in rows.items():
            shards[rid // SDOC][rid % SDOC] = [kind, eid] + info.get(eid, [None, None, None]) + [eid in info]
        total = 0
        for n, sh in enumerate(shards):
            total += write_jgz(self.stage / "sdoc" / f"{n}.jgz", sh)
        self.stats["sdoc"] = total
        self.stats["sdoc_shards"] = n_sh

    def rules(self):
        out = {}
        root = pathlib.Path(self.ls.cfg.root)
        dirs = [root / d for d in self.ls.cfg.rule_dirs]
        dirs += [d / "archive" for d in dirs]
        for d in dirs:
            for path in sorted(d.glob("*.toml")) if d.exists() else ():
                r = tomllib.loads(path.read_text(encoding="utf-8")).get("rule", {})
                if not r.get("id"):
                    continue
                for version in (str(r.get("version")), None):
                    key = f"{r['id']}|{version or ''}"
                    if key not in out:
                        out[key] = list(self.ls.rule(r["id"], version))
        self.stats["rules"] = write_jgz(self.stage / "rules.jgz", out)

    def raw(self):
        pairs = sorted({(r[0], r[1]) for r in self.conn.execute("SELECT raw_id, raw_locator FROM record")})
        shards = [[] for _ in range(N_RAW)]
        for raw_id, loc in pairs:
            shards[shard_of(f"{raw_id}|{loc}", N_RAW)].append((raw_id, loc))
        # one process: the extractor keeps the last parsed payloads; records are grouped by payload
        _init_worker(self.world)
        total = 0
        for n, ps in enumerate(shards):
            total += _build_raw_shard((str(self.stage), n, sorted(ps)))[2]
        self.stats["raw"] = total
        self.stats["raw_records"] = len(pairs)

    def bundles(self):
        ids = []
        for kind, (table, key) in TABLE.items():
            ids += [r[0] for r in self.conn.execute(f"SELECT {key} FROM {table} ORDER BY {key}")]
        shards = [[] for _ in range(N_ENT)]
        for i in ids:
            shards[shard_of(i, N_ENT)].append(i)
        # every shard is written, empty ones included: a missing file always means "this snapshot is gone"
        tasks = [(str(self.stage), n, sh) for n, sh in enumerate(shards)]
        self.log(f"bundles: {len(ids)} elements in {len(tasks)} shards, {self.procs} processes")
        t0, done, size = time.time(), 0, 0
        ctx = mp.get_context("spawn")
        with ctx.Pool(self.procs, initializer=_init_worker, initargs=(self.world,)) as pool:
            for n, cnt, sz in pool.imap_unordered(_build_ent_shard, tasks, chunksize=4):
                done += cnt
                size += sz
                if done % 20000 < cnt:
                    self.log(f"  {done}/{len(ids)} elements, {size / 1048576:.0f} MB, {time.time() - t0:.0f} s")
        self.stats["ent"] = size
        self.stats["elements"] = len(ids)

    def manifest(self, wv, tiles, seconds):
        files, total = {}, 0
        h = hashlib.sha256()
        for p in sorted(self.stage.rglob("*")):
            if p.is_file():
                rel = p.relative_to(self.stage).as_posix()
                if rel in ("manifest.json", "files.json"):
                    continue
                data = p.read_bytes()
                digest = hashlib.sha256(data).hexdigest()
                files[rel] = digest
                total += len(data)
                if rel != "basemap/style.json":
                    h.update(rel.encode() + b"\0" + digest.encode())
        n_files = len(files) + 2
        if n_files > MAX_FILES:
            raise SystemExit(f"snapshot has {n_files} files (> {MAX_FILES}, O7)")
        built = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        version = f"{self.world}-{wv}-{built.strftime('%Y%m%dT%H%M%SZ')}-{h.hexdigest()[:8]}"
        srcs = {sid: {"attribution": s.attribution, "license_id": s.license_id, "name": s.name}
                for sid, s in self.ls.svc.sources.items()}
        return {"format": FORMAT, "version": version, "world": self.world, "world_version": wv,
                "built_utc": built.isoformat().replace("+00:00", "Z"), "build_seconds": round(seconds),
                "sources": srcs, "shards": {"ent": N_ENT, "refs": N_REFS, "edges": N_EDGE, "raw": N_RAW, "sdoc": SDOC, "ind": N_IND,
                                           "sdoc_files": self.stats.get("sdoc_shards", 0)},
                "hash": "fnv1a32", "tiles": tiles, "agg_levels": list(AGG_LEVELS), "stats": self.stats,
                "file_count": n_files, "bytes": total, "files": files}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexum.snapshot")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("world")
    b.add_argument("--out", default="data/snapshot")
    b.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args(argv)
    if a.cmd == "build":
        Builder(a.world, pathlib.Path(a.out) / a.world, a.procs).run()


if __name__ == "__main__":
    sys.exit(main())
