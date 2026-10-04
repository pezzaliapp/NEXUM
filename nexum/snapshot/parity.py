"""Parity suite, Core side: `python3 -m nexum.snapshot parity d1 [--out data/snapshot] [--bundles]`.

1. cases — a deterministic, stratified sample of workspace requests for every operation the browser read model
   recomputes (map, timeline, facets, insights, search, neighbourhood, expand, path, related elements, entities)
   plus routing, errors and precomputed responses. Each case is answered by the local service's own handlers
   (LocalService) and written with its expected status and body. The browser side (ui/tests/parity) answers the
   same requests from the snapshot and must return identical data (criterion O4).
2. --bundles — recomputes every element's precomputed responses with the Core and compares them with the snapshot
   byte for byte (criterion O5).
"""

import argparse
import gzip
import hashlib
import json
import multiprocessing as mp
import pathlib
import random
import time

from nexum.core import geo

from .build import N_ENT, _bundle, _init_worker, dumps, shard_of
from .service import LocalService

SEED = 20260929
DAY = 86400 * 1000


class Cases:
    def __init__(self, ls: LocalService):
        self.ls = ls
        self.out = []
        self.rnd = random.Random(SEED)

    def add(self, group, path, params=None):
        st, body = self.ls.get(path, params) if not path.startswith(("/raw/", "/rules/")) else self._plain(path, params)
        self.out.append({"group": group, "path": path, "params": params or {}, "status": st, "body": body})
        return st, body

    def _plain(self, path, params):
        if path.startswith("/raw/"):
            return self.ls.raw(path[5:], (params or {}).get("path"))
        return self.ls.rule(path[7:], (params or {}).get("version"))


def _ids(c, sql, n, rnd):
    ids = [r[0] for r in c.execute(sql)]
    return rnd.sample(ids, min(n, len(ids)))


def build_cases(ls: LocalService, scale: int = 1):
    C = Cases(ls)
    rnd = C.rnd
    c = ls.conn
    lo, hi = c.execute("SELECT MIN(t_start_ms), MAX(t_start_ms) FROM event").fetchone()
    types = [r[0] for r in c.execute("SELECT DISTINCT type FROM object UNION SELECT DISTINCT type FROM event "
                                     "UNION SELECT DISTINCT type FROM insight ORDER BY 1")]
    sources = [r[0] for r in c.execute("SELECT DISTINCT source_id FROM event UNION SELECT DISTINCT source_id FROM object "
                                       "ORDER BY 1")] + ["nexum.correlation"]
    ev_ids = _ids(c, "SELECT event_id FROM event ORDER BY event_id", 40 * scale, rnd)
    ap_ids = _ids(c, "SELECT object_id FROM object WHERE type='transport.airport' ORDER BY object_id", 40 * scale, rnd)
    co_ids = _ids(c, "SELECT object_id FROM object WHERE type='place.country' ORDER BY object_id", 15 * scale, rnd)
    in_ids = _ids(c, "SELECT insight_id FROM insight ORDER BY insight_id", 20 * scale, rnd)
    re_ids = _ids(c, "SELECT relation_id FROM relation ORDER BY relation_id", 20 * scale, rnd)
    hubs = [r[0] for r in c.execute("SELECT dst_id FROM edge GROUP BY dst_id ORDER BY COUNT(*) DESC, dst_id LIMIT 5")]
    pts = [tuple(r) for r in c.execute("SELECT lon, lat FROM event WHERE lon IS NOT NULL ORDER BY event_id")]
    pts += [tuple(r) for r in c.execute("SELECT lon, lat FROM object WHERE lon IS NOT NULL AND type='transport.airport' "
                                        "ORDER BY object_id")]

    def scopes():
        out = [{}, {"types": ["seismic.earthquake"]}, {"types": ["transport.airport", "place.country"]},
               {"types": [t for t in types if t.startswith(("seismic", "emergency"))]}, {"types": []},
               {"sources": ["usgs.earthquakes"]}, {"sources": ["ourairports.airports", "nexum.correlation"]},
               {"min_confidence": 0.5}, {"min_confidence": 0.8}, {"min_confidence": 0.3},
               {"time_window": [hi - 365 * DAY, hi]}, {"time_window": [lo, lo + 400 * DAY]},
               {"time_window": [hi - 20 * DAY, hi]},
               {"types": ["seismic.earthquake", "exposure_context"], "min_confidence": 0.5, "time_window": [hi - 800 * DAY, hi]}]
        return out

    # ── map ──────────────────────────────────────────────────────────────────
    views = [([-180, -85, 180, 85], z) for z in (0, 1, 2, 3)]
    views += [([-30, 30, 45, 72], 4), ([-10, 35, 30, 60], 5), ([90, 10, 105, 25], 6), ([-125, 25, -65, 50], 4),
              ([139, 35, 140.5, 36.2], 8), ([95, 20, 97, 23], 9), ([150, -50, -150, 10], 3), ([170, -45, -170, -10], 5),
              ([-180, -90, 180, 90], 2.7), ([-20.5, 60, -12, 67], 7.4), ([2.2, 48.7, 2.6, 49.0], 9.9)]
    for lon, lat in rnd.sample(pts, 25 * scale):
        z = rnd.choice([10, 11, 12, 13, 14.5])
        d = 360 / 2 ** z * 3
        views.append(([lon - d, lat - d / 2, lon + d, lat + d / 2], z))
    for lon, lat in rnd.sample(pts, 25 * scale):
        z = rnd.choice([3, 4, 5, 6, 7, 8, 9])
        d = 360 / 2 ** z * 2
        views.append(([max(-180, lon - d), max(-90, lat - d / 2), min(180, lon + d), min(90, lat + d / 2)], z))
    hls = [None, ev_ids[0], ap_ids[0], in_ids[0], co_ids[0]]
    for i, (vp, z) in enumerate(views):
        for sc in rnd.sample(scopes(), 3):
            for budget in rnd.sample([None, {"max_items": 5000}, {"max_items": 2500}, {"max_items": 300},
                                      {"max_items": 50}, {"max_items": 9000}, {"lod": "counts"}, {"lod": "aggregates"},
                                      {"lod": "refs", "max_items": 400}], 2):
                p = {"s": dict(sc, viewport=vp, z=z)}
                if budget:
                    p["b"] = budget
                h = hls[i % len(hls)]
                if h:
                    p["hl"] = h
                C.add("map", "/projections/map", p)
    C.add("map", "/projections/map", {"s": {"z": 3}})
    C.add("map", "/projections/map", {"s": {"viewport": [10, 10, 0, 20], "z": 3}})
    C.add("map", "/projections/map", {"s": {"viewport": [0, 0, 10, 10], "z": 3}, "b": {"max_items": 0}})
    C.add("map", "/projections/map", {"s": {"viewport": [0, 0, 10, 10], "z": 3}, "hl": "xyz"})

    # ── timeline ─────────────────────────────────────────────────────────────
    windows = [None, [lo, hi], [hi - 30 * DAY, hi], [hi - 2 * DAY, hi], [hi - 12 * 3600 * 1000, hi],
               [hi - 200 * DAY, hi - 100 * DAY], [lo - 10 * DAY, lo + 50 * DAY]]
    for _ in range(25 * scale):
        a = rnd.randint(lo, hi)
        span = rnd.choice([3600e3, 20 * 3600e3, 2.5 * DAY, 10 * DAY, 60 * DAY, 200 * DAY, 800 * DAY, 3000 * DAY])
        windows.append([a, int(a + span)])
    for tw in windows:
        for sc in rnd.sample(scopes(), 3):
            s = {k: v for k, v in sc.items() if k != "time_window"}
            if tw:
                s["time_window"] = tw
            for b, bucket in rnd.sample([({"max_items": 1, "lod": "aggregates"}, "auto"), (None, "auto"),
                                         ({"max_items": 2000}, "auto"), (None, "month"), (None, "day"), (None, "hour"),
                                         ({"lod": "refs", "max_items": 800}, "year")], 2):
                p = {"s": s, "bucket": bucket}
                if b:
                    p["b"] = b
                if rnd.random() < 0.4:
                    p["hl"] = rnd.choice([ev_ids[1], in_ids[1], ap_ids[1], re_ids[0]])
                C.add("timeline", "/projections/timeline", p)
        vp, z = rnd.choice(views)
        C.add("timeline", "/projections/timeline", {"s": {"time_window": tw, "viewport": vp, "z": z} if tw else
                                                     {"viewport": vp, "z": z}, "b": {"max_items": 1, "lod": "aggregates"}})
    C.add("timeline", "/projections/timeline", {"bucket": "week"})

    # ── facets ───────────────────────────────────────────────────────────────
    for sc in scopes():
        C.add("facets", "/facets", {"s": sc})
        vp, z = rnd.choice(views)
        C.add("facets", "/facets", {"s": dict(sc, viewport=vp, z=z)})

    # ── insights ─────────────────────────────────────────────────────────────
    for sc in scopes():
        for b in ({"max_items": 50}, {"max_items": 1}, None):
            p = {"s": sc}
            if b:
                p["b"] = b
            C.add("insights", "/insights", p)
        vp, z = rnd.choice(views)
        C.add("insights", "/insights", {"s": dict(sc, viewport=vp), "b": {"max_items": 50}})
    cur = None
    for _ in range(6):
        p = {"b": {"max_items": 40}}
        if cur:
            p["cursor"] = cur
        st, body = C.add("insights", "/insights", p)
        cur = body.get("cursor_next") if st == 200 else None
        if not cur:
            break
    for rule in ("exposure_context", "event_event_association", "composite_context", "nope"):
        C.add("insights", "/insights", {"rule_id": rule, "b": {"max_items": 20}})
    for m in ev_ids[:6] + ap_ids[:4] + in_ids[:4]:
        C.add("insights", "/insights", {"member": m})
    C.add("insights", "/insights", {"s": {"status": ["active", "superseded"]}})

    # ── search ───────────────────────────────────────────────────────────────
    labels = [r[0] for r in c.execute("SELECT label FROM object WHERE label IS NOT NULL ORDER BY object_id")]
    labels += [r[0] for r in c.execute("SELECT label FROM event WHERE label IS NOT NULL ORDER BY event_id")]
    idents = [r[0] for r in c.execute("SELECT value FROM identifier ORDER BY scheme, value")]
    qs = ["Mandalay", "mandalay earthquake", "Myanmar", "airport", "international airport", "heathrow airport",
          "São Paulo", "Zürich", "Köln", "M 6", "KBOS", "LIRF", "us7000", "zzzzqqq", "a", "  ", "an", "Italy",
          "flood", "earthquake Japan", "ÀÉ", "123", "de", "air port", "EMSR", "x" * 250,
          # frequent tokens: unranked results, and rare tokens filtered by frequent ones
          "airport", "Airport airport", "international airport", "airport int", "airport heliport", "Airfield airport",
          "London airport", "airport Roma", "airport 1", "airport kb", "airport e", "Aeroporto airport"]
    for lab in rnd.sample(labels, 30 * scale):
        w = lab.split()
        qs.append(lab)
        if w:
            qs.append(w[0][:rnd.randint(2, max(2, len(w[0])))])
    qs += rnd.sample(idents, 15 * scale)
    for q in qs:
        C.add("search", "/search", {"q": q, "b": {"max_items": 50}})
    for q in qs[:20]:
        C.add("search", "/search", {"q": q, "s": {"types": ["transport.airport"]}, "b": {"max_items": 200}})
        C.add("search", "/search", {"q": q, "s": {"types": ["exposure_context", "seismic.earthquake"]}})
    C.add("search", "/search", {})

    # ── graph ────────────────────────────────────────────────────────────────
    focuses = ev_ids[:12] + ap_ids[:12] + co_ids[:6] + in_ids[:8] + re_ids[:4] + hubs
    for f in focuses:
        for depth, b, sc in rnd.sample([(1, None, {}), (2, None, {}), (1, {"max_nodes": 100}, {}),
                                        (2, {"max_nodes": 2000, "max_edges": 4000}, {}), (3, {"max_nodes": 300}, {}),
                                        (1, None, {"types": ["transport.airport"]}), (2, None, {"natures": ["spatial"]}),
                                        (1, None, {"natures": ["temporal"]}), (2, {"max_nodes": 50, "max_edges": 60}, {})], 3):
            p = {"focus": f, "depth": depth}
            if b:
                p["b"] = b
            if sc:
                p["s"] = sc
            st, body = C.add("graph", "/graph/neighborhood", p)
            if st == 200:
                for a in body["data"]["aggregates"][:3]:
                    ep = {"node": a["anchor"], "edge_kind": a["edge_kind"], "type": a["type"], "dir": a["direction"],
                          "b": {"max_nodes": rnd.choice([50, 200, 1000])}}
                    cur = None
                    for _ in range(3):
                        q = dict(ep, cursor=cur) if cur else ep
                        st2, b2 = C.add("expand", "/graph/expand", q)
                        cur = b2.get("cursor_next") if st2 == 200 else None
                        if not cur:
                            break
    for f in focuses[:20]:
        for g in ls.q._groups(f)[:3]:
            C.add("expand", "/graph/expand", {"node": f, "edge_kind": g[0], "type": g[1], "dir": g[2]})
    C.add("expand", "/graph/expand", {"node": ev_ids[0], "edge_kind": "relation", "type": "nope"})
    C.add("graph", "/graph/neighborhood", {"focus": "obj_doesnotexist"})
    C.add("graph", "/graph/neighborhood", {"focus": ev_ids[0], "depth": 9})
    pairs = [(ap_ids[i], ap_ids[i + 1]) for i in range(0, 16, 2)] + [(ev_ids[i], ap_ids[i]) for i in range(6)]
    pairs += [(ev_ids[i], ev_ids[i + 1]) for i in range(0, 12, 2)] + [(in_ids[0], ap_ids[3]), (co_ids[0], co_ids[1]),
                                                                        (ap_ids[5], ap_ids[5]), (re_ids[0], ap_ids[0])]
    # connected pairs: airports of one country (2 hops), an event and a participant's neighbours (1–3 hops),
    # an insight and the neighbours of its members (2–4 hops)
    for hub in co_ids[:6] + hubs[:2]:
        near = [r[0] for r in c.execute("SELECT src_id FROM edge WHERE dst_id=? AND edge_kind='relation' ORDER BY src_id "
                                        "LIMIT 40", (hub,))]
        if len(near) >= 2:
            pairs.append(tuple(rnd.sample(near, 2)))
    for e in ev_ids[:10] + in_ids[:6]:
        n1 = ls.q._neighbors(e)[:20]
        if n1:
            m = rnd.choice(n1)
            n2 = [x for x in ls.q._neighbors(m)[:50] if x != e]
            pairs.append((e, rnd.choice(n2) if n2 else m))
            if n2:
                n3 = [x for x in ls.q._neighbors(rnd.choice(n2))[:50] if x != e]
                if n3:
                    pairs.append((e, rnd.choice(n3)))
    for a, b in pairs:
        for hops in rnd.sample([1, 2, 3, 4], 2):
            C.add("path", "/graph/path", {"a": a, "b": b, "max_hops": hops})
    C.add("path", "/graph/path", {"a": ap_ids[0], "b": "obj_doesnotexist"})

    # ── related elements, entities ───────────────────────────────────────────
    for e in ev_ids[:15] + ap_ids[:10] + co_ids[:6] + in_ids[:6] + re_ids[:3] + hubs[:3]:
        for kind in ("events", "objects"):
            cur = None
            for _ in range(3):
                p = {"b": {"max_items": 50}}
                if cur:
                    p["cursor"] = cur
                st, body = C.add("related", f"/entities/{e}/{kind}", p)
                cur = body.get("cursor_next") if st == 200 else None
                if not cur:
                    break
            C.add("related", f"/entities/{e}/{kind}", {"s": rnd.choice(scopes()), "b": {"max_items": 500}})
        C.add("entity", f"/entities/{e}", {"lod": "refs"})
        C.add("entity", f"/entities/{e}")
    C.add("entity", "/entities/obj_doesnotexist", {"lod": "refs"})

    # ── precomputed responses, routing, errors ───────────────────────────────
    for e in ev_ids[:5] + ap_ids[:5] + co_ids[:3] + in_ids[:5] + re_ids[:5]:
        C.add("bundle", f"/context/{e}")
        C.add("bundle", f"/entities/{e}/locate")
        C.add("bundle", f"/entities/{e}/timeline", {"b": {"max_items": 400}})
        C.add("bundle", f"/provenance/{e}")
        C.add("bundle", f"/entities/{e}/evidence", {"b": {"max_items": 10}})
        C.add("bundle", f"/explain/{e}")
        C.add("bundle", f"/entities/{e}/timeline/step", {"dir": "next"})
        if e.startswith(("evt_", "ins_")):
            C.add("bundle", f"/entities/{e}/timeline/neighbors", {"b": {"max_items": 300}})
            C.add("bundle", f"/entities/{e}/timeline/step", {"dir": "prev"})
    C.add("bundle", "/entities/" + ev_ids[0] + "/timeline/step", {"dir": "sideways"})
    C.add("bundle", "/context/evt_doesnotexist")
    for name in ("status", "types", "sources", "highlights", "insight-summaries", "observations", "tenures"):
        C.add("global", f"/{name}")
    C.add("global", "/nothing/here")
    for raw_id, loc in rnd.sample([tuple(r) for r in c.execute("SELECT raw_id, raw_locator FROM record ORDER BY record_id")],
                                  20 * scale):
        C.add("raw", f"/raw/{raw_id}", {"path": loc})
    root = pathlib.Path(ls.cfg.root)
    for p in sorted((root / "rules").glob("*.toml")) + sorted((root / "rules" / "archive").glob("*.toml")):
        import tomllib
        r = tomllib.loads(p.read_text(encoding="utf-8"))["rule"]
        C.add("rules", f"/rules/{r['id']}", {"version": str(r["version"])})
        C.add("rules", f"/rules/{r['id']}")
    C.add("rules", "/rules/nope", {"version": "9"})
    # basemap: the web workspace decodes the compact layer; it must equal the provider's GeoJSON
    style = ls.svc.basemap.style()
    for src in style["sources"].values():
        name = src["data"].rsplit("/", 1)[1].split(".")[0]
        C.out.append({"group": "basemap", "path": f"basemap/{name}.bmz", "params": {}, "status": 200,
                      "body": json.loads(ls.svc.basemap.layer(name))})
    labels = ls.svc.basemap.labels()
    if labels is not None:
        C.out.append({"group": "basemap", "path": "/basemap/labels.json", "params": {}, "status": 200, "body": json.loads(labels)})
    return C.out


# ── O5: every precomputed response against a fresh Core computation ──────────

def _check_shard(args):
    snap_dir, n, ids = args
    stored = json.loads(gzip.decompress((pathlib.Path(snap_dir) / "ent" / f"{n}.jgz").read_bytes()))
    bad = []
    for eid in ids:
        fresh = json.loads(dumps(_bundle(eid)))
        if hashlib.sha256(dumps(fresh)).digest() != hashlib.sha256(dumps(stored.get(eid))).digest():
            bad.append(eid)
    return n, len(ids), bad


def check_bundles(world, snap_dir, procs):
    ls = LocalService(world)
    from nexum.core.query import TABLE
    ids = []
    for _kind, (table, key) in TABLE.items():
        ids += [r[0] for r in ls.conn.execute(f"SELECT {key} FROM {table} ORDER BY {key}")]
    shards = [[] for _ in range(N_ENT)]
    for i in ids:
        shards[shard_of(i, N_ENT)].append(i)
    tasks = [(str(snap_dir), n, sh) for n, sh in enumerate(shards) if sh]
    total, bad = 0, []
    with mp.get_context("spawn").Pool(procs, initializer=_init_worker, initargs=(world,)) as pool:
        for _n, cnt, b in pool.imap_unordered(_check_shard, tasks, chunksize=4):
            total += cnt
            bad += b
    return {"elements": total, "identical": total - len(bad), "different": bad[:50], "n_different": len(bad)}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexum.snapshot parity")
    ap.add_argument("world")
    ap.add_argument("--out", default="data/snapshot")
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--bundles", action="store_true", help="verify every precomputed response (O5)")
    ap.add_argument("--procs", type=int, default=9)
    a = ap.parse_args(argv)
    root = pathlib.Path(a.out) / a.world
    cur = json.loads((root / "current.json").read_text())
    snap = root / "s" / cur["version"]
    pdir = root / "parity" / cur["version"]
    pdir.mkdir(parents=True, exist_ok=True)
    if a.bundles:
        t0 = time.time()
        r = check_bundles(a.world, snap, a.procs)
        r["seconds"] = round(time.time() - t0)
        (pdir / "bundles.json").write_text(json.dumps(r, indent=1))
        print(json.dumps(r))
        return 0 if r["n_different"] == 0 else 1
    t0 = time.time()
    cases = build_cases(LocalService(a.world), a.scale)
    with gzip.open(pdir / "cases.jsonl.gz", "wt", encoding="utf-8") as f:
        for c in cases:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    groups = {}
    for c in cases:
        groups[c["group"]] = groups.get(c["group"], 0) + 1
    print(json.dumps({"cases": len(cases), "groups": groups, "seconds": round(time.time() - t0), "file": str(pdir)}))
    return 0
