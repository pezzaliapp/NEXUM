"""HTTP service: routes Core operations, enforces budgets/deadlines/cancellation, serves the UI.

Bound to a configurable address (Phase 2 allows only 127.0.0.1, decision D10).
The world database is opened read-only; the only writes go to the separate TRAIL DB.
"""

import gzip
import hashlib
import json
import math
import mimetypes
import multiprocessing
import os
import pathlib
import queue
import re
import sqlite3
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import tomllib
from nexum.core.query import LIMITS, Query, QueryError
from nexum.core.registry import load_registry

from . import API_VERSION
from .basemap import RawPolygonProvider
from .cache import ResponseCache
from .cancel import CancelRegistry
from .rawx import RawError, RawExtractor
from .trails import TrailError, TrailStore

ALLOWED_BINDS = ("127.0.0.1",)
CORE_MAX = {k: hi for k, (_, hi) in LIMITS.items()}
API_BYTES_MARGIN = 4096          # room for the `api` block so the whole body respects max_bytes
YEAR_MS = 365 * 86400 * 1000
MAX_BUCKETS = 400
BUCKET_MS = {"hour": 3600e3, "day": 86400e3, "month": 30.44 * 86400e3, "year": 365.25 * 86400e3}   # Core buckets
BUCKET_ORDER = ("hour", "day", "month", "year")
ID_RE = r"(?P<id>(?:obj|evt|rel|ins)_[a-z0-9]{1,40})"


class ApiError(Exception):
    def __init__(self, status, code, message, hint=None):
        super().__init__(message)
        self.status, self.code, self.message, self.hint = status, code, message, hint


# ── parameter helpers ────────────────────────────────────────────────────────

def _json_param(p, name, default=None):
    if name not in p:
        return default
    try:
        return json.loads(p[name])
    except ValueError:
        raise ApiError(400, f"invalid_{'scope' if name == 's' else 'budget' if name == 'b' else 'parameter'}",
                       f"parameter {name!r} is not valid JSON") from None


def _int(p, name, default=None, lo=None, hi=None, reject_above=False):
    if name not in p:
        if default is None:
            raise ApiError(400, "missing_parameter", f"parameter {name!r} is required")
        return default, None
    try:
        v = int(p[name])
    except ValueError:
        raise ApiError(400, "invalid_parameter", f"parameter {name!r} must be an integer") from None
    if lo is not None and v < lo:
        raise ApiError(400, "invalid_parameter", f"parameter {name!r} must be ≥ {lo}")
    if hi is not None and v > hi:
        if reject_above:
            raise ApiError(400, "invalid_parameter", f"parameter {name!r} must be ≤ {hi}",
                           "riduci il valore: il limite protegge dalle richieste illimitate")
        return hi, {name: {"requested": v, "applied": hi}}
    return v, None


def _required(p, name):
    v = p.get(name)
    if not v:
        raise ApiError(400, "missing_parameter", f"parameter {name!r} is required")
    return v


def _scope(p, need_viewport=False):
    s = _json_param(p, "s", {}) or {}
    if not isinstance(s, dict):
        raise ApiError(400, "invalid_scope", "scope must be a JSON object")
    if need_viewport:
        vp = s.get("viewport")
        if not (isinstance(vp, list) and len(vp) == 4 and all(isinstance(x, (int, float)) and math.isfinite(x)
                                                               for x in vp)):
            raise ApiError(400, "missing_parameter", "map projections require scope.viewport [w, s, e, n]",
                           "la mappa chiede sempre solo l'area visibile")
        if not (vp[0] < vp[2] and vp[1] < vp[3]):
            raise ApiError(400, "invalid_scope", "viewport must satisfy w < e and s < n")
        if not isinstance(s.get("z"), (int, float)):
            raise ApiError(400, "missing_parameter", "map projections require scope.z")
    tw = s.get("time_window")
    if tw is not None and not (isinstance(tw, list) and len(tw) == 2 and all(isinstance(x, (int, float)) for x in tw)
                               and tw[0] <= tw[1]):
        raise ApiError(400, "invalid_scope", "time_window must be [from_ms, to_ms] with from ≤ to")
    return s


def _budget(p, default, maximum):
    """Budget = endpoint default, overridden by the client, reduced to the endpoint maximum (never above Core)."""
    b = dict(default)
    reduced = {}
    user = _json_param(p, "b", {}) or {}
    if not isinstance(user, dict):
        raise ApiError(400, "invalid_budget", "budget must be a JSON object")
    for k, v in user.items():
        if k == "lod":
            b["lod"] = v
            continue
        if k not in CORE_MAX:
            raise ApiError(400, "invalid_budget", f"unknown budget field {k!r}")
        if not isinstance(v, int) or isinstance(v, bool) or v <= 0:
            raise ApiError(400, "invalid_budget", f"budget.{k} must be a positive integer")
        cap = min(maximum.get(k, CORE_MAX[k]), CORE_MAX[k])
        if v > cap:
            reduced[k] = {"requested": v, "applied": cap}
            v = cap
        b[k] = v
    mb = min(b.get("max_bytes", 2_000_000), CORE_MAX["max_bytes"])
    b["max_bytes"] = max(8192, mb - API_BYTES_MARGIN)
    return b, reduced


def _hl(p):
    if "hl" not in p:
        return None
    ids = [x for x in p["hl"].split(",") if x][:20]
    for x in ids:
        if not re.fullmatch(ID_RE, x):
            raise ApiError(400, "invalid_parameter", f"invalid highlight id {x!r}")
    return ids


# ── service ──────────────────────────────────────────────────────────────────

class Worker:
    """One read-only connection + Query, with a progress handler bound to the current request token."""

    def __init__(self, db_path, sources, registry: CancelRegistry, cache_kib):
        uri = pathlib.Path(db_path).resolve().as_uri() + "?mode=ro"
        self.conn = sqlite3.connect(uri, uri=True, isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        for pragma in ("PRAGMA query_only=ON", "PRAGMA busy_timeout=5000", f"PRAGMA cache_size=-{cache_kib}",
                       "PRAGMA mmap_size=0", "PRAGMA temp_store=MEMORY"):
            self.conn.execute(pragma)
        self.q = Query(self.conn, sources)
        self.registry = registry
        self.token = None
        self.conn.set_progress_handler(self._progress, 100)   # small: the Core runs many short statements

    def _progress(self):
        t = self.token
        return 1 if t is not None and self.registry.check(t) else 0


# ── worker processes (true parallelism: the Core does much of its work in Python) ──

def _worker_main(pipe, db_path, source_dirs, shared, cache_kib, mmap_bytes=0):
    sources = load_registry([pathlib.Path(d) for d in source_dirs])
    uri = pathlib.Path(db_path).resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    for pragma in ("PRAGMA query_only=ON", "PRAGMA busy_timeout=5000", f"PRAGMA cache_size=-{cache_kib}",
                   f"PRAGMA mmap_size={int(mmap_bytes)}", "PRAGMA temp_store=MEMORY"):
        conn.execute(pragma)
    q = Query(conn, sources)
    cur = {"slot": -1, "seq": None, "deadline": None, "reason": None, "at": None}

    def progress():
        if cur["slot"] >= 0 and cur["seq"] is not None and shared[cur["slot"]] > cur["seq"]:
            cur["reason"], cur["at"] = "superseded", time.monotonic()
            return 1
        if cur["deadline"] is not None and time.monotonic() > cur["deadline"]:
            cur["reason"], cur["at"] = "deadline", time.monotonic()
            return 1
        return 0

    conn.set_progress_handler(progress, 100)
    while True:
        try:
            msg = pipe.recv()
        except (EOFError, OSError):
            return
        if msg is None:
            return
        name, args, kwargs, slot, seq, deadline = msg
        cur.update(slot=slot, seq=seq, deadline=deadline, reason=None, at=None)
        try:
            pipe.send(("ok", getattr(q, name)(*args, **kwargs)))
        except sqlite3.OperationalError as e:
            if "interrupt" in str(e):
                pipe.send(("interrupted", cur["reason"] or "deadline", cur["at"]))
            else:
                pipe.send(("error", "OperationalError", str(e)))
        except QueryError as e:
            pipe.send(("query_error", str(e)))
        except Exception as e:   # noqa: BLE001 — reported as a 500 with its type
            pipe.send(("error", type(e).__name__, str(e)))
        finally:
            cur.update(slot=-1, seq=None, deadline=None)


class _RemoteQuery:
    def __init__(self, worker):
        self._w = worker

    def __getattr__(self, name):
        def call(*args, **kwargs):
            return self._w.call(name, args, kwargs)
        return call


class ProcWorker:
    """A Core Query in a separate process, reached through a pipe; same interface as Worker (w.q.<op>(...))."""

    def __init__(self, ctx, db_path, source_dirs, registry: CancelRegistry, cache_kib, mmap_bytes=0):
        self.pipe, child = ctx.Pipe()
        self.proc = ctx.Process(target=_worker_main, args=(child, db_path, source_dirs, registry.shared, cache_kib,
                                                           mmap_bytes), daemon=True)
        self.proc.start()
        self.registry = registry
        self.token = None
        self.q = _RemoteQuery(self)

    def call(self, name, args, kwargs):
        t = self.token
        self.pipe.send((name, args, kwargs, t.slot if t else -1, t.seq if t else None, t.deadline if t else None))
        r = self.pipe.recv()
        if r[0] == "ok":
            return r[1]
        if r[0] == "interrupted":
            if t is not None:
                t.reason = r[1]
                t.interrupted_at = r[2]
            raise sqlite3.OperationalError("interrupted")
        if r[0] == "query_error":
            raise QueryError(r[1])
        raise RuntimeError(f"{r[1]}: {r[2]}")

    def close(self):
        try:
            self.pipe.send(None)
        except OSError:
            pass
        self.proc.join(timeout=2)
        if self.proc.is_alive():
            self.proc.terminate()


class Service:
    def __init__(self, cfg, world_id, ui_dir=None, workers=4, queue_max=24, cache_kib=65536, basemap_raw_dirs=None,
                 trails_path=None, response_cache=True, processes=True, mmap_bytes=1024 * 1024 * 1024):
        self.cfg, self.world_id = cfg, world_id
        root = pathlib.Path(cfg.root)
        self.root = root
        if not pathlib.Path(cfg.db_path).exists():
            raise SystemExit(f"world database not found: {cfg.db_path}")
        self.sources = load_registry([root / d for d in cfg.source_dirs])
        self.registry = CancelRegistry()
        self.cache = ResponseCache()
        self.pool: queue.Queue = queue.Queue()
        self._all = []
        ctx = multiprocessing.get_context("spawn")
        for _ in range(workers):
            w = ProcWorker(ctx, cfg.db_path, [str(root / d) for d in cfg.source_dirs], self.registry, cache_kib,
                           mmap_bytes) \
                if processes else Worker(cfg.db_path, self.sources, self.registry, cache_kib)
            self._all.append(w)
            self.pool.put(w)
        self.workers = workers
        self.queue_max = queue_max
        self._waiting = 0
        self._wlock = threading.Lock()
        world_dir = pathlib.Path(cfg.db_path).parent
        raw_dirs = [cfg.raw_dir] + list(basemap_raw_dirs or sorted(str(p) for p in (root / "data").glob("*/raw")))
        bm = tomllib.loads((root / "config" / "basemap.toml").read_text(encoding="utf-8"))
        bm_src = load_registry([root / "sources"]).get(bm["source_id"]) or self.sources.get(bm["source_id"])
        self.basemap = RawPolygonProvider(raw_dirs, world_dir / "basemap", bm["source_id"],
                                          bm_src.attribution if bm_src else bm["source_id"],
                                          bm.get("precision_decimals", 2))
        self.raw = RawExtractor(cfg.raw_dir)
        self.trails = TrailStore(trails_path or world_dir / "trails.sqlite", world_id)
        self.use_cache = response_cache
        self.ui_dir = pathlib.Path(ui_dir) if ui_dir else None
        self.routes = self._routes()

    # worker pool with a bounded queue (429 beyond it)
    def acquire(self, timeout=10.0):
        with self._wlock:
            if self._waiting >= self.queue_max + self.workers:
                raise ApiError(429, "busy", "too many concurrent requests", "riprova tra poco")
            self._waiting += 1
        try:
            return self.pool.get(timeout=timeout)
        except queue.Empty:
            raise ApiError(429, "busy", "no worker available", "riprova tra poco") from None
        finally:
            with self._wlock:
                self._waiting -= 1

    def release(self, w):
        w.token = None
        self.pool.put(w)

    def close(self):
        for w in self._all:
            if isinstance(w, ProcWorker):
                w.close()

    def pids(self):
        return [os.getpid()] + [w.proc.pid for w in self._all if isinstance(w, ProcWorker)]

    # ── routes ───────────────────────────────────────────────────────────────
    def _routes(self):
        R = []

        def route(method, pattern, deadline_ms, cacheable=True):
            def deco(fn):
                R.append((method, re.compile("^/api/v1" + pattern + "$"), fn, deadline_ms / 1000.0, cacheable))
                return fn
            return deco

        @route("GET", "/status", 300, cacheable=False)
        def status(w, m, p, body):
            q = w.q
            f = q.facets({})
            g = f["data"]["facets"].get("geometry", {})
            geo = {"with_geometry": g.get("with_geometry", 0), "without_geometry": g.get("without_geometry", 0)}
            tl = q.project_timeline({}, bucket="year")
            buckets = tl["data"]["buckets"]
            extent = tl["data"]["effective_scope"].get("time_window") if buckets else None
            srcs = q.list_sources()["data"]["items"]
            data = {"world_id": self.world_id, "api_version": API_VERSION,
                    "counts": f["data"]["facets"]["kind"], "by_type": f["data"]["facets"]["type"],
                    "geometry": geo, "has_geometry": geo.get("with_geometry", 0) > 0,
                    "time_extent": extent,
                    "sources": [{"source_id": s["source_id"], "name": s["name"], "attribution": s["attribution"],
                                 "license_id": s["license_id"], "health": s.get("health"),
                                 "last_success_ms": s.get("last_success_ms"), "entities": s.get("entities")}
                                for s in srcs],
                    "basemap": self.basemap.style()["metadata"],
                    "limits": {"map_features": 5000, "store_refs": 20000, "graph_nodes": CORE_MAX["max_nodes"],
                               "graph_edges": CORE_MAX["max_edges"], "max_bytes": CORE_MAX["max_bytes"]}}
            env = dict(f, data=data, lod="counts", total=None, returned=None, facets=None)
            return env, {}

        @route("GET", "/types", 300)
        def types(w, m, p, body):
            return w.q.list_types(), {}

        @route("GET", "/sources", 300, cacheable=False)
        def sources(w, m, p, body):
            return w.q.list_sources(), {}

        @route("GET", "/facets", 800)
        def facets(w, m, p, body):
            return w.q.facets(_scope(p)), {}

        @route("GET", "/projections/map", 1500)
        def pmap(w, m, p, body):
            s = _scope(p, need_viewport=True)
            b, red = _budget(p, {"max_items": 2000}, {"max_items": 5000})
            return w.q.project_map(s, b, highlight=_hl(p)), red

        @route("GET", "/projections/timeline", 1500)
        def ptimeline(w, m, p, body):
            s = _scope(p)
            b, red = _budget(p, {"max_items": 500}, {"max_items": 2000})
            bucket = p.get("bucket", "auto")
            if bucket not in ("auto",) + tuple(BUCKET_MS):
                raise ApiError(400, "invalid_parameter", "bucket must be auto, hour, day, month or year")
            tw = s.get("time_window")
            if bucket != "auto" and tw:
                n = (tw[1] - tw[0]) / BUCKET_MS[bucket]
                if n > MAX_BUCKETS:
                    wanted = bucket
                    for cand in BUCKET_ORDER:
                        if (tw[1] - tw[0]) / BUCKET_MS[cand] <= MAX_BUCKETS:
                            bucket = cand
                            break
                    else:
                        bucket = "year"
                    red["bucket"] = {"requested": wanted, "applied": bucket}
            return w.q.project_timeline(s, bucket, b, highlight=_hl(p)), red

        @route("GET", "/search", 800)
        def search(w, m, p, body):
            qtext = (p.get("q") or "").strip()
            if len(qtext) < 2:
                raise ApiError(400, "missing_parameter", "q must have at least 2 characters")
            b, red = _budget(p, {"max_items": 50}, {"max_items": 200})
            return w.q.search(qtext[:200], _scope(p), b), red

        @route("GET", "/insights", 1000)
        def insights(w, m, p, body):
            b, red = _budget(p, {"max_items": 50}, {"max_items": 500})
            return w.q.insights(_scope(p), b, cursor=p.get("cursor"), rule_id=p.get("rule_id"),
                                member=p.get("member")), red

        @route("GET", "/entities/" + ID_RE, 500)
        def entity(w, m, p, body):
            return w.q.get_entity(m["id"], lod=p.get("lod", "details")), {}

        @route("GET", "/context/" + ID_RE, 1500)
        def context(w, m, p, body):
            b, red = _budget(p, {"max_items": 25}, {"max_items": 100})
            if b["max_items"] < 10:   # the Core's context always returns up to 10 nearby elements: declared, not hidden
                red["max_items"] = {"requested": b["max_items"], "applied": 10, "reason": "sezione minima del contesto"}
                b["max_items"] = 10
            return w.q.context(m["id"], _scope(p), b), red

        @route("GET", "/entities/" + ID_RE + "/relations", 1000)
        def relations(w, m, p, body):
            b, red = _budget(p, {"max_items": 50}, {"max_items": 500})
            return w.q.relations(m["id"], _scope(p), b), red

        @route("GET", "/entities/" + ID_RE + "/events", 1000)
        def events(w, m, p, body):
            b, red = _budget(p, {"max_items": 50}, {"max_items": 500})
            return w.q.related_events(m["id"], _scope(p), b, cursor=p.get("cursor")), red

        @route("GET", "/entities/" + ID_RE + "/objects", 1000)
        def objects(w, m, p, body):
            b, red = _budget(p, {"max_items": 50}, {"max_items": 500})
            return w.q.related_objects(m["id"], _scope(p), b, cursor=p.get("cursor")), red

        @route("GET", "/entities/" + ID_RE + "/evidence", 1000)
        def evidence(w, m, p, body):
            b, red = _budget(p, {"max_items": 100}, {"max_items": 1000})
            return w.q.evidence_of(m["id"], b), red

        @route("GET", "/entities/" + ID_RE + "/supports", 1000)
        def supports(w, m, p, body):
            b, red = _budget(p, {"max_items": 100}, {"max_items": 1000})
            return w.q.supported(m["id"], b), red

        @route("GET", "/entities/" + ID_RE + "/sources", 1000)
        def esources(w, m, p, body):
            return w.q.sources_of(m["id"]), {}

        @route("GET", "/provenance/" + ID_RE, 1500)
        def provenance(w, m, p, body):
            return w.q.provenance_chain(m["id"]), {}

        @route("GET", "/entities/" + ID_RE + "/timeline", 1500)
        def etimeline(w, m, p, body):
            win = _json_param(p, "window")
            if win is not None:
                if not (isinstance(win, list) and len(win) == 2 and win[0] <= win[1]):
                    raise ApiError(400, "invalid_parameter", "window must be [from_ms, to_ms]")
                if win[1] - win[0] > 10 * YEAR_MS:
                    raise ApiError(400, "invalid_parameter", "window longer than 10 years",
                                   "restringi la finestra temporale")
            b, red = _budget(p, {"max_items": 200}, {"max_items": 1000})
            return w.q.entity_timeline(m["id"], win, b), red

        @route("GET", "/entities/" + ID_RE + "/timeline/neighbors", 1500)
        def tneighbors(w, m, p, body):
            win, r1 = _int(p, "window_ms", 30 * 86400 * 1000, lo=1, hi=10 * YEAR_MS, reject_above=True)
            hops, r2 = _int(p, "hops", 2, lo=1, hi=2, reject_above=True)
            b, red = _budget(p, {"max_items": 200}, {"max_items": 1000})
            return w.q.timeline_neighbors(m["id"], win, hops, b), red

        @route("GET", "/entities/" + ID_RE + "/timeline/step", 500)
        def tstep(w, m, p, body):
            d = p.get("dir", "next")
            if d not in ("next", "prev"):
                raise ApiError(400, "invalid_parameter", "dir must be next or prev")
            return w.q.timeline_step(m["id"], d), {}

        @route("GET", "/entities/" + ID_RE + "/spatial/nearby", 1500)
        def nearby(w, m, p, body):
            km, r1 = _int(p, "km", 100, lo=1, hi=500, reject_above=True)
            b, red = _budget(p, {"max_items": 100}, {"max_items": 1000})
            return w.q.nearby(m["id"], km, _scope(p), b), red

        @route("GET", "/entities/" + ID_RE + "/spatial/containing", 1500)
        def containing(w, m, p, body):
            return w.q.containing(m["id"]), {}

        @route("GET", "/entities/" + ID_RE + "/spatial/contained", 1500)
        def contained(w, m, p, body):
            b, red = _budget(p, {"max_items": 100}, {"max_items": 1000})
            return w.q.contained(m["id"], _scope(p), b, cursor=p.get("cursor")), red

        @route("GET", "/entities/" + ID_RE + "/locate", 500)
        def locate(w, m, p, body):
            f = p.get("focus")
            if f and not re.fullmatch(ID_RE, f):
                raise ApiError(400, "invalid_parameter", "invalid focus id")
            return w.q.locate(m["id"], focus=f), {}

        @route("GET", "/graph/neighborhood", 2000)
        def neighborhood(w, m, p, body):
            focus = _required(p, "focus")
            depth, _ = _int(p, "depth", 1, lo=1, hi=3, reject_above=True)
            b, red = _budget(p, {"max_nodes": 200, "max_edges": 400}, {"max_nodes": 2000, "max_edges": 4000})
            return w.q.neighborhood(focus, depth, _scope(p), b), red

        @route("GET", "/graph/expand", 1500)
        def expand(w, m, p, body):
            node, ek, et = _required(p, "node"), _required(p, "edge_kind"), _required(p, "type")
            d = p.get("dir", "out")
            if d not in ("out", "in"):
                raise ApiError(400, "invalid_parameter", "dir must be out or in")
            b, red = _budget(p, {"max_nodes": 200}, {"max_nodes": 1000})   # Core pages expand by max_nodes
            return w.q.expand(node, ek, et, d, b, cursor=p.get("cursor")), red

        @route("GET", "/graph/path", 3000)
        def path(w, m, p, body):
            a, b_ = _required(p, "a"), _required(p, "b")
            hops, _ = _int(p, "max_hops", 4, lo=1, hi=4, reject_above=True)
            return w.q.path(a, b_, hops), {}

        @route("GET", "/changes", 1500, cacheable=False)
        def changes(w, m, p, body):
            since, _ = _int(p, "since", None, lo=0)
            b, red = _budget(p, {"max_items": 500}, {"max_items": 5000})
            return w.q.changes_since(since, _scope(p), b), red

        @route("POST", "/trail/context", 5000, cacheable=False)
        def trail_context(w, m, p, body):
            steps = (body or {}).get("trail")
            if not isinstance(steps, list) or not 1 <= len(steps) <= 50:
                raise ApiError(400, "invalid_parameter", "trail must be a list of 1..50 steps")
            b, red = _budget(p, {"max_items": 25}, {"max_items": 100})
            return w.q.trail_context(steps, b), red

        @route("GET", "/explain/" + ID_RE, 2000)
        def explain(w, m, p, body):
            return w.q.explain(m["id"]), {}

        return R

    # non-Core endpoints (no worker needed)
    def rule_definition(self, rule_id, version):
        dirs = [self.root / d for d in self.cfg.rule_dirs]
        dirs += [d / "archive" for d in dirs]
        for d in dirs:
            for path in sorted(d.glob("*.toml")) if d.exists() else ():
                text = path.read_text(encoding="utf-8")
                r = tomllib.loads(text).get("rule", {})
                if r.get("id") == rule_id and (version is None or str(r.get("version")) == version):
                    return {"rule_id": rule_id, "version": str(r.get("version")), "file": str(path.relative_to(
                        self.root)), "archived": path.parent.name == "archive",
                            "definition_hash": hashlib.sha256(text.encode()).hexdigest()[:16], "definition_toml": text}
        raise ApiError(404, "not_found", f"rule {rule_id} v{version} not found in this world's rule files")


# ── HTTP handler ─────────────────────────────────────────────────────────────

def make_handler(svc: Service, port: int, verbose=False):
    local_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "NEXUM"
        sys_version = ""

        def log_message(self, fmt, *args):
            if verbose:
                super().log_message(fmt, *args)

        # common output
        def _send(self, status, body: bytes, ctype="application/json; charset=utf-8", headers=None):
            if "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 8192 and ctype.startswith(
                    ("application/json", "text/", "application/javascript", "application/geo+json")):
                body = gzip.compress(body, 5)
                headers = dict(headers or {}, **{"Content-Encoding": "gzip"})
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _error(self, e: ApiError, wv=None):
            body = json.dumps({"error": {"code": e.code, "message": e.message, "hint": e.hint}, "world_version": wv},
                              ensure_ascii=False).encode()
            self._send(e.status, body, headers={"Cache-Control": "no-store"})

        def _host_ok(self):
            return (self.headers.get("Host") or "") in local_hosts

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_PUT(self):
            self._dispatch("PUT")

        def do_DELETE(self):
            self._dispatch("DELETE")

        def _dispatch(self, method):
            if not self._host_ok():
                return self._error(ApiError(421, "misdirected_request", "host not allowed"))
            u = urllib.parse.urlsplit(self.path)
            path = u.path
            try:
                if path.startswith("/api/"):
                    return self._api(method if method != "HEAD" else "GET", path, u.query)
                if method not in ("GET", "HEAD"):
                    raise ApiError(405, "method_not_allowed", "method not allowed")
                return self._static(path)
            except ApiError as e:
                return self._error(e)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1_048_576:
                raise ApiError(413, "payload_too_large", "request body larger than 1 MB")
            if n == 0:
                return None
            if "application/json" not in (self.headers.get("Content-Type") or ""):
                raise ApiError(415, "unsupported_media_type", "body must be application/json")
            try:
                return json.loads(self.rfile.read(n))
            except ValueError:
                raise ApiError(400, "invalid_body", "body is not valid JSON") from None

        def _api(self, method, path, qs):
            p = {k: v[-1] for k, v in urllib.parse.parse_qs(qs, keep_blank_values=True).items()}
            body = self._body() if method in ("POST", "PUT") else None
            if path.startswith("/api/v1/basemap/"):
                return self._basemap(path[len("/api/v1/basemap/"):])
            if path.startswith("/api/v1/trails"):
                return self._trails(method, path, body)
            if path == "/api/v1/diagnostics":
                d = dict(svc.registry.snapshot(), cache_hits=svc.cache.hits, cache_misses=svc.cache.misses)
                return self._send(200, json.dumps(d).encode(), headers={"Cache-Control": "no-store"})
            m = re.fullmatch(r"/api/v1/raw/(?P<raw>[0-9a-z]{26})", path)
            if m and method == "GET":
                try:
                    rec = svc.raw.extract(m["raw"], _required(p, "path"))
                except RawError as e:
                    raise ApiError(404, "not_found", str(e)) from None
                src = svc.sources.get(rec["source_id"])
                rec["licence"] = {"license_id": src.license_id, "license_url": src.license_url,
                                  "attribution": src.attribution} if src else None
                return self._send(200, json.dumps({"data": rec}, ensure_ascii=False, default=str).encode(),
                                  headers={"Cache-Control": "max-age=3600"})
            m = re.fullmatch(r"/api/v1/rules/(?P<rule>[a-z0-9_]{1,80})", path)
            if m and method == "GET":
                d = svc.rule_definition(m["rule"], p.get("version"))
                return self._send(200, json.dumps({"data": d}, ensure_ascii=False).encode())
            for rmethod, rx, fn, deadline, cacheable in svc.routes:
                mm = rx.match(path)
                if mm and rmethod == method:
                    return self._run(fn, mm, p, body, deadline, cacheable, path, qs)
            raise ApiError(404, "not_found", f"no endpoint {method} {path}")

        def _run(self, fn, m, p, body, deadline, cacheable, path, qs):
            channel = (self.headers.get("X-Nexum-Channel") or "")[:64] or None
            try:
                seq = int(self.headers.get("X-Nexum-Seq")) if self.headers.get("X-Nexum-Seq") else None
            except ValueError:
                seq = None
            tok = svc.registry.register(channel, seq, deadline)
            w = svc.acquire()
            wv = None
            try:
                if svc.registry.superseded(tok):
                    svc.registry.count("superseded_not_started")
                    raise ApiError(409, "superseded", "a newer request on the same channel replaced this one")
                wv = w.q._world_version()
                key = hashlib.sha1(f"{path}?{qs}|{wv}".encode()).hexdigest() if cacheable and svc.use_cache else None
                etag = f'W/"{wv}-{key[:16]}"' if key else None
                if etag and self.headers.get("If-None-Match") == etag:
                    return self._send(304, b"", headers={"ETag": etag})
                cached = svc.cache.get(key) if key else None
                if cached is not None:
                    return self._send(200, cached, headers={"ETag": etag, "Cache-Control": "no-cache",
                                                            "X-Nexum-Cache": "hit"})
                w.token = tok
                t0 = time.perf_counter()
                try:
                    env, reduced = fn(w, m, p, body)
                except sqlite3.OperationalError as e:
                    if "interrupt" in str(e):
                        svc.registry.interrupted(tok, getattr(tok, "interrupted_at", None))
                        if tok.reason == "superseded":
                            raise ApiError(409, "superseded",
                                           "a newer request on the same channel replaced this one") from None
                        raise ApiError(504, "deadline_exceeded", f"query exceeded {int(deadline * 1000)} ms",
                                       "restringi l'area, la finestra temporale o i filtri") from None
                    raise
                except QueryError as e:
                    status, code = (404, "not_found") if "not found" in str(e) else (400, "invalid_request")
                    raise ApiError(status, code, str(e)) from None
                finally:
                    w.token = None
                if svc.registry.superseded(tok):
                    svc.registry.count("superseded_completed")
                env["api"] = {"op": fn.__name__, "channel": channel, "seq": seq, "deadline_ms": int(deadline * 1000),
                              "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2), "cache": "miss",
                              "budget_applied": reduced}
                out = json.dumps(env, ensure_ascii=False, separators=(",", ":"), default=str).encode()
                if key:
                    svc.cache.put(key, out)
                return self._send(200, out, headers={"ETag": etag, "Cache-Control": "no-cache"} if etag else
                                  {"Cache-Control": "no-store"})
            except ApiError as e:
                return self._error(e, wv)
            finally:
                svc.release(w)

        def _basemap(self, name):
            if name == "style.json":
                return self._send(200, json.dumps(svc.basemap.style()).encode(), headers={"Cache-Control": "no-cache"})
            m = re.fullmatch(r"([a-z0-9]+)\.geojson", name)
            body = svc.basemap.layer(m.group(1)) if m else None
            if body is None:
                raise ApiError(404, "not_found", "basemap layer not available")
            return self._send(200, body, "application/geo+json", headers={"Cache-Control": "max-age=86400"})

        def _trails(self, method, path, body):
            try:
                status, data = svc.trails.handle(method, path[len("/api/v1/trails"):], body)
            except TrailError as e:
                raise ApiError(e.status, e.code, str(e)) from None
            headers = {"Cache-Control": "no-store"}
            if path.endswith("/export"):
                headers["Content-Disposition"] = f'attachment; filename="nexum-trail-{data["trail"]["trail_id"]}.json"'
            return self._send(status, json.dumps(data, ensure_ascii=False).encode(), headers=headers)

        def _static(self, path):
            if svc.ui_dir is None or not (svc.ui_dir / "index.html").exists():
                return self._send(503, b"NEXUM UI not built: run `npm run build` in ui/", "text/plain; charset=utf-8")
            rel = urllib.parse.unquote(path).lstrip("/")
            f = (svc.ui_dir / rel).resolve() if rel else svc.ui_dir / "index.html"
            if not (f.is_file() and svc.ui_dir.resolve() in f.parents):
                f = svc.ui_dir / "index.html"   # client-side routing fallback
            ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype += "; charset=utf-8"
            immutable = "/assets/" in path
            return self._send(200, f.read_bytes(), ctype, headers={
                "Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-cache",
                "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' "
                                           "'unsafe-inline'; worker-src 'self' blob:; connect-src 'self'"})

    return Handler


def serve(svc: Service, host="127.0.0.1", port=8765, verbose=False):
    if host not in ALLOWED_BINDS:
        raise SystemExit(f"Phase 2 allows binding only to {', '.join(ALLOWED_BINDS)} (decision D10)")
    httpd = ThreadingHTTPServer((host, port), BaseHTTPRequestHandler)
    httpd.RequestHandlerClass = make_handler(svc, httpd.server_address[1], verbose)   # port 0 → the real port
    httpd.daemon_threads = True
    return httpd
