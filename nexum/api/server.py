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
from nexum.core import geo
from nexum.core.query import LIMITS, Budget, Query, QueryError
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

def _watch_parent(parent, every_s=0.5):
    """A worker lives only as long as the service that started it. Its pipe tells it so only between requests: during
    a request in pure Python (which the SQLite progress handler cannot interrupt) a service ended by a signal would
    leave it running, adopted by launchd/init, until that request finished. Exit as soon as the parent is gone."""
    def watch():
        while os.getppid() == parent:
            time.sleep(every_s)
        os._exit(0)
    threading.Thread(target=watch, name="parent-watch", daemon=True).start()


def _worker_main(pipe, db_path, source_dirs, shared, cache_kib, mmap_bytes=0, parent=None):
    if parent is not None:
        _watch_parent(parent)
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
            fn = API_OPS.get(name)          # read-only operations of the API layer (not of the Core), on this connection
            pipe.send(("ok", fn(q, *args, **kwargs) if fn else getattr(q, name)(*args, **kwargs)))
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

    OVERRUN_S = 5.0   # beyond its deadline, a request still running is work no one will read: its process is replaced

    def __init__(self, ctx, db_path, source_dirs, registry: CancelRegistry, cache_kib, mmap_bytes=0):
        self._ctx, self._args = ctx, (db_path, source_dirs, registry.shared, cache_kib, mmap_bytes, os.getpid())
        self.registry = registry
        self.token = None
        self.q = _RemoteQuery(self)
        self._start()

    def _start(self):
        self.pipe, child = self._ctx.Pipe()
        self.proc = self._ctx.Process(target=_worker_main, args=(child, *self._args), daemon=True)
        self.proc.start()
        child.close()   # the parent keeps only its own end: the worker's pipe reports EOF when the parent goes

    def _replace(self):
        """The deadline is enforced inside SQLite statements only; pure-Python work past it (serialization, loops)
        is stopped here by ending the process and starting a fresh one, so no CPU is spent on an abandoned request."""
        self.pipe.close()
        self.proc.terminate()
        self.proc.join(timeout=5)
        if self.proc.is_alive():
            self.proc.kill()
            self.proc.join(timeout=5)
        self._start()

    def call(self, name, args, kwargs):
        t = self.token
        self.pipe.send((name, args, kwargs, t.slot if t else -1, t.seq if t else None, t.deadline if t else None))
        if t is not None and t.deadline is not None:
            if not self.pipe.poll(max(0.0, t.deadline - time.monotonic()) + self.OVERRUN_S):
                self._replace()
                t.reason, t.interrupted_at = "deadline", time.monotonic()
                raise sqlite3.OperationalError("interrupted")
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

    def type_points(self, type_id, status=None):
        """Every element of a point type in one compact list — [lon, lat, status value index, source index] — so the map can
        cluster all of them at every scale (level of detail in the browser) instead of seeing them only as anonymous
        density. Identity and name are asked when the person points at one (the ordinary map projection of a tiny box):
        the list stays small. `status`: the name of one property whose value the map distinguishes (optional)."""
        if status is not None and not re.fullmatch(r"[a-z][a-z0-9_]{0,40}", str(status)):
            raise ApiError(400, "bad_request", "status: a property name")
        conn = sqlite3.connect(pathlib.Path(self.cfg.db_path).resolve().as_uri() + "?mode=ro", uri=True)
        try:
            return self._type_points(conn, type_id, status)
        finally:
            conn.close()

    def _type_points(self, conn, type_id, status):
        hints = _hints(conn).get(type_id)
        if hints is None:
            raise ApiError(404, "not_found", f"no type {type_id!r}")
        srcs, values, rows = [], [], []
        cur = conn.execute("SELECT object_id, lon, lat, label, source_id, "
                           + ("json_extract(props_json, '$.' || ?)" if status else "NULL")
                           + " FROM object WHERE type = ? AND status != 'retracted' AND merged_into IS NULL AND lon IS NOT NULL "
                           "AND lat IS NOT NULL ORDER BY object_id", ((status, type_id) if status else (type_id,)))
        index, vindex = {}, {}
        for _oid, lon, lat, _label, sid, st in cur:
            if sid not in index:
                index[sid] = len(srcs)
                srcs.append(sid)
            if st not in vindex:
                vindex[st] = len(values)
                values.append(st)
            rows.append([round(lon, 5), round(lat, 5), vindex[st], index[sid]])
        data = {"type": type_id, "label": hints[0], "status_property": status, "status_values": values, "sources": srcs,
                "fields": ["lon", "lat", "status", "source"], "rows": rows}
        return {"data": data, "lod": "refs", "total": len(rows), "returned": len(rows), "truncated": False, "cursor_next": None,
                "excluded": {}, "facets": None, "highlight": None, "sources": [], "world_version": None, "as_of": {}, "timing_ms": 0}

    def published_table(self, name):
        """A TABLE a source publishes as is (its registry option "published_table"): the rows its connector reads
        from the source's latest payload of every resource (connector function table(payloads) → fields, rows,
        notes). Generic: what the table holds is the connector's and the vocabulary's business, never this layer's."""
        import importlib
        src = next((s for s in self.sources.values() if (s.options or {}).get("published_table") == name), None)
        if src is None:
            raise ApiError(404, "not_found", f"no published table {name!r}")
        conn = sqlite3.connect(pathlib.Path(self.cfg.db_path).resolve().as_uri() + "?mode=ro", uri=True)
        try:
            latest = conn.execute(
                "SELECT r.resource_key, r.sha256, r.fetched_ms, r.url FROM raw_record r JOIN (SELECT resource_key, MAX(fetched_ms) AS f "
                "FROM raw_record WHERE source_id=? GROUP BY resource_key) l ON l.resource_key=r.resource_key AND l.f=r.fetched_ms "
                "WHERE r.source_id=? ORDER BY r.resource_key", (src.id, src.id)).fetchall()
        finally:
            conn.close()
        mod = importlib.import_module(src.connector)
        payloads = [(k, self.raw.store.get(sha), fetched, url) for k, sha, fetched, url in latest]
        t = mod.table(payloads)
        data = {"table": name, "source_id": src.id, "fields": t["fields"], "rows": t["rows"], "notes": t.get("notes"),
                "fetched_ms": max((f for _k, _s, f, _u in latest), default=None),
                "attribution": src.attribution, "license_id": src.license_id}
        return {"data": data, "lod": "refs", "total": len(t["rows"]), "returned": len(t["rows"]), "truncated": False,
                "cursor_next": None, "excluded": {}, "facets": None, "highlight": None,
                "sources": [{"source_id": src.id, "attribution": src.attribution, "license_id": src.license_id}],
                "world_version": None, "as_of": {}, "timing_ms": 0}

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
                    # when the world last received data from its sources (the newest raw payload): "Dati aggiornati al"
                    "data_received_ms": api_op(w, "data_received"),
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
            r = w.q.list_types()
            r["data"]["insight_types"] = api_op(w, "insight_types")   # API layer: the rules' own names (additive)
            return r, {}

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

        @route("GET", "/highlights", 8000)   # computed once per world version (offices, observations): cached after
        def highlights(w, m, p, body):
            return api_op(w, "highlights"), {}

        @route("GET", "/observations", 8000)
        def observations(w, m, p, body):
            return api_op(w, "observations"), {}

        @route("GET", "/tables/(?P<table>[a-z][a-z0-9_]{0,40})", 8000)
        def table(w, m, p, body):
            return self.published_table(m["table"]), {}

        @route("GET", "/types/(?P<type>[a-z][a-z0-9_]{0,40}\\.[a-z0-9_.]{1,60})/points", 8000)
        def type_points(w, m, p, body):
            return self.type_points(m["type"], p.get("status")), {}

        @route("GET", "/places-index", 8000)
        def places_index(w, m, p, body):
            return api_op(w, "places_index"), {}

        @route("GET", "/event-webcams", 8000)
        def event_webcams(w, m, p, body):
            return api_op(w, "event_media"), {}

        @route("GET", "/security", 8000)
        def security(w, m, p, body):
            return api_op(w, "security"), {}

        @route("GET", "/indicators-catalog", 8000)
        def indicators_catalog(w, m, p, body):
            return api_op(w, "indicators_catalog"), {}

        @route("GET", "/indicators/" + ID_RE, 8000)
        def indicators(w, m, p, body):
            return api_op(w, "indicators", m["id"]), {}

        @route("GET", "/tenures", 8000)
        def tenures(w, m, p, body):
            return api_op(w, "tenures"), {}

        @route("GET", "/insight-summaries", 3000)
        def insight_summaries(w, m, p, body):
            return api_op(w, "insight_summaries"), {}

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
            if name == "labels.json":
                body = svc.basemap.labels()
                if body is None:
                    raise ApiError(404, "not_found", "basemap labels not available")
                return self._send(200, body, headers={"Cache-Control": "max-age=86400"})
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
                "Content-Security-Policy": f"default-src 'self'; img-src 'self' data: blob: {_media_hosts()} {_media_hosts('tiles')}; style-src 'self' "
                                           f"'unsafe-inline'; worker-src 'self' blob:; media-src 'self' blob: {_media_hosts('video')}; "
                                           f"connect-src 'self' {_media_hosts('connect')} {_media_hosts('video')} {_media_hosts('tiles')}; frame-src {_media_hosts('frame') or _NONE}"})

    return Handler


_NONE = "'none'"


def _media_hosts(kind: str = "img") -> str:
    """Origins whose current images the browser may load (img) or ask for their time and availability (connect), on
    request only (ui/media-hosts.json: explicit, never a wildcard)."""
    try:
        hosts = json.loads((pathlib.Path(__file__).resolve().parents[2] / "ui" / "media-hosts.json").read_text()).get(kind, [])
    except (OSError, ValueError, KeyError):
        return ""
    return " ".join(h for h in hosts if re.fullmatch(r"https://[a-z0-9.-]+(:\d{2,5})?", h))


def serve(svc: Service, host="127.0.0.1", port=8765, verbose=False):
    if host not in ALLOWED_BINDS:
        raise SystemExit(f"Phase 2 allows binding only to {', '.join(ALLOWED_BINDS)} (decision D10)")
    httpd = ThreadingHTTPServer((host, port), BaseHTTPRequestHandler)
    httpd.RequestHandlerClass = make_handler(svc, httpd.server_address[1], verbose)   # port 0 → the real port
    httpd.daemon_threads = True
    return httpd


# ── WORLD MODE highlights (API layer, read-only, additive — not part of the Core) ──────────────────────────────
def _month_index(ms):
    import datetime as _dt
    d = _dt.datetime.fromtimestamp(ms / 1000, _dt.timezone.utc)
    return d.year * 12 + d.month - 1


def _month_start(m):
    import datetime as _dt
    return int(_dt.datetime(m // 12, m % 12 + 1, 1, tzinfo=_dt.timezone.utc).timestamp() * 1000)


def highlights_of(q, n=8):
    """What is happening in the world, from the Core's own tables: per event type the count in the last 12 months of
    the data (whole months, as the workspace's starting period), the most recent notable events, the strongest
    events of those 12 months, and the most recent outputs of the rules. Severity is the vocabulary's generic,
    per-type normalised value (the Core does not know its domain meaning)."""
    import time as _t
    t0 = _t.perf_counter()
    conn = q.conn
    last = conn.execute("SELECT MAX(t_start_ms) FROM event").fetchone()[0]
    if last is None:
        return q._envelope({"anchor_ms": None, "window": None, "domains": [], "recent": [], "strongest": [],
                            "connections": []}, t0, Budget.of(None), lod="refs")
    a = _month_index(last)
    win = [_month_start(a - 11), _month_start(a + 1) - 1]
    domains = [{"type": r[0], "n": r[1], "max_severity": r[2]} for r in conn.execute(
        "SELECT type, COUNT(*), MAX(severity) FROM event WHERE t_start_ms BETWEEN ? AND ? GROUP BY type ORDER BY 2 DESC, 1",
        win)]

    hints = _hints(conn)

    def refs(sql, args):   # each event with its headline facts (vocabulary display hints; raw values)
        return [{**q._ref_min("event", r), "head": _head(json.loads(r["props_json"] or "{}"), hints.get(r["type"], ("", {}))[1])}
                for r in conn.execute(sql, args)]
    recent = refs("SELECT * FROM event WHERE COALESCE(severity, 0) >= 0.5 ORDER BY t_start_ms DESC, event_id LIMIT ?", (n,))
    strongest = refs("SELECT * FROM event WHERE t_start_ms BETWEEN ? AND ? AND severity IS NOT NULL "
                     "ORDER BY severity DESC, t_start_ms DESC, event_id LIMIT ?", (*win, n))
    # the most recent rule outputs, at most two per rule (what NEXUM found, varied), each with its readable summary
    per_rule, picked = {}, []
    for r in conn.execute("SELECT * FROM insight WHERE status='active' AND t_start_ms IS NOT NULL "
                          "ORDER BY t_start_ms DESC, insight_id LIMIT 2000"):
        if per_rule.get(r["rule_id"], 0) >= 2:
            continue
        per_rule[r["rule_id"]] = per_rule.get(r["rule_id"], 0) + 1
        picked.append(r)
        if len(picked) >= 12:
            break
    # the summaries of the outputs shown only (not of every output of the world: 50,000 in D2)
    summ = insight_summaries_of(q, [r["insight_id"] for r in picked])["data"]["summaries"] if picked else {}
    connections = [{"ref": q._ref_min("insight", r), "explanation": r["explanation"], "summary": summ.get(r["insight_id"])}
                   for r in picked]
    changes, explore = _world_changes(q, last), _explore_suggestions(q)
    return q._envelope({"anchor_ms": last, "window": win, "domains": domains, "recent": recent, "strongest": strongest,
                        "connections": connections, "changes": changes, "explore": explore}, t0, Budget.of(None), lod="refs",
                       total=len(recent) + len(strongest), returned=len(recent) + len(strongest))


def _labels(conn, ids):
    marks = ",".join("?" * len(ids))
    return dict(conn.execute(f"SELECT object_id, label FROM object WHERE object_id IN ({marks})", tuple(ids)).fetchall()) if ids else {}


def _world_changes(q, anchor_ms, n=4):
    """DOCUMENTED CHANGES of the world, from the Core's own records and the vocabulary's hints (no news, no guess):
      · a new holder of an office (tenure hint) whose current term started within the 12 months before the data's
        anchor: who, which office, where, since when, the statement that says so;
      · the latest release of each measured source (series / wave hints): the newest period it covers and in how many
        elements it was measured. Nothing else is called a change."""
    conn = q.conn
    if anchor_ms is None:
        return {"tenures": [], "releases": []}
    since = time.strftime("%Y-%m-%d", time.gmtime(anchor_ms / 1000 - 365 * 86400))
    tenures, releases = [], []
    if any(h.get("tenure") for _l, h in _hints(conn).values()):
        t = tenures_of(q)["data"]
        where_of = {}
        for e, offs in t["by_entity"].items():
            for o in offs:
                where_of.setdefault(o, []).append(e)
        for oid, o in t["offices"].items():
            for x in o["terms"]:
                if x[4] == "current" and x[2] and len(x[2]) == 10 and x[2] >= since:
                    tenures.append({"start": x[2], "person": x[0], "person_label": x[1], "office": oid, "office_label": o["label"],
                                    "role": o["role"], "statement": x[5], "where": where_of.get(oid, [])})
        tenures.sort(key=lambda c: (c["start"], c["office"]), reverse=True)
        tenures = tenures[:n]
        names = _labels(conn, sorted({w for c in tenures for w in c["where"]}))
        for c in tenures:
            c["where"] = [[w, names.get(w)] for w in c["where"] if w in names][:1]
    if any(h.get("series") or h.get("wave") for _l, h in _hints(conn).values()):
        d = observations_of(q)["data"]
        latest = {}
        for e, series in d["by_entity"].items():
            for s_ in series:
                df = d["defs"][s_["def"]]
                p = s_["points"][-1]
                key = df["source_id"]
                cur = latest.get(key)
                end = p[1] or p[0] or ""
                if cur is None or end > cur["period"][1]:
                    latest[key] = {"source_id": key, "group": d["groups"].get(df["type"], df["type"]), "kind": df["kind"],
                                   "dataset": (p[6] if len(p) > 6 and p[6] else df["props"].get("dataset")),
                                   "period": [p[0], end], "where": {e}}
                elif end == cur["period"][1]:
                    cur["where"].add(e)
        releases = sorted(({**r, "n": len(r["where"]), "where": None} for r in latest.values()),
                          key=lambda r: (r["period"][1], r["n"], r["source_id"]), reverse=True)[:n + 1]
        for r in releases:
            r.pop("where")
    return {"tenures": tenures, "since": since, "releases": releases}


def _explore_suggestions(q, n=8):
    """Elements of an explorable type (vocabulary hint "explore") with the most information attached to them by
    elements that are not map layers (offices, observations…): starting points, ranked by data, never by opinion."""
    conn = q.conn
    hints = _hints(conn)
    explore = {t: h["explore"] for t, (_l, h) in hints.items() if h.get("explore")}
    info = [t for t, (_l, h) in hints.items() if h.get("map") is False]
    if not explore or not info:
        return []
    rows = conn.execute(
        f"SELECT r.to_id, o.label, o.type, o.props_json, COUNT(DISTINCT f.type) AS kinds FROM relation r "
        f"JOIN object o ON o.object_id=r.to_id JOIN object f ON f.object_id=r.from_id "
        f"WHERE o.type IN ({','.join('?' * len(explore))}) AND f.type IN ({','.join('?' * len(info))}) "
        f"GROUP BY r.to_id", (*explore, *info)).fetchall()
    def size(r):   # the vocabulary names the property that orders equally documented elements (none: by label)
        v = json.loads(r[3] or "{}").get((explore[r[2]] or {}).get("rank_property", ""), 0)
        return v if isinstance(v, (int, float)) else 0
    rows = sorted(rows, key=lambda r: (-r[4], -size(r), r[1]))[:n]
    return [[r[0], r[1]] for r in rows]


def insight_types_of(q):
    """The outputs of the world's rules, named by the rules themselves (their `label`, latest version): the UI
    never needs to know a rule's domain to name what it found."""
    import tomllib as _toml
    out, seen = [], set()
    for rid, ver, toml_text in q.conn.execute("SELECT rule_id, version, definition_toml FROM rule ORDER BY rule_id, version DESC"):
        if rid in seen:
            continue
        seen.add(rid)
        r = _toml.loads(toml_text).get("rule", {})
        out.append({"id": rid, "label": r.get("label", rid), "output": r.get("output"), "version": ver})
    return out


def _hints(conn):
    out = {}
    for table in ("object_type", "event_type"):
        for tid, label, dh in conn.execute(f"SELECT type_id, label, display_hints FROM {table}"):
            out[tid] = (label, json.loads(dh or "{}"))
    return out


def _head(props, hints):
    """The headline facts of an element, as the vocabulary's display hints name them (raw values; the UI formats)."""
    parts = []
    for h in hints.get("headline", []):
        v = props.get(h["property"])
        if v is None or v == "" or v == []:
            continue
        parts.append([h.get("prefix", ""), v, h.get("suffix", ""), h.get("digits")])
    return parts


def insight_summaries_of(q, ids=None):
    """A readable summary of every active rule output, from the Core's own records: its members (roles, distances,
    time gaps from the evidence), their labels and the facts the vocabulary's display hints mark as headline. Nothing
    is inferred: absent values stay absent. Keys: k output, r rule label, a/b the anchoring members, n the nearest
    collected member, c the number collected, km/dt the recorded distance and time gap."""
    conn = q.conn
    hints = _hints(conn)
    labels = {rid: lab for rid, lab in ((x["id"], x["label"]) for x in insight_types_of(q))}
    ent = {}

    def info(kind, eid):
        if eid not in ent:
            table, key = ("object", "object_id") if kind == "object" else ("event", "event_id")
            t_col = "t_start_ms" if kind != "object" else "NULL AS t_start_ms"
            r = conn.execute(f"SELECT type, label, props_json, {t_col} FROM {table} WHERE {key}=?", (eid,)).fetchone()
            if r is None:
                ent[eid] = None
            else:
                ent[eid] = [eid, r["type"], r["label"], _head(json.loads(r["props_json"] or "{}"), hints.get(r["type"], ("", {}))[1]),
                            r["t_start_ms"]]
        return ent[eid]

    out = {}
    only = "" if ids is None else f" AND insight_id IN ({','.join('?' * len(ids))})"
    for i in conn.execute(f"SELECT insight_id, rule_id, kind FROM insight WHERE status='active'{only} ORDER BY insight_id",
                          list(ids or ())):
        mem = conn.execute("SELECT role, support_kind, support_id, distance_m, delta_t_ms FROM evidence "
                           "WHERE supports_kind='insight' AND supports_id=? ORDER BY role, support_id", (i["insight_id"],)).fetchall()
        if any(m["support_kind"] == "insight" for m in mem):
            out[i["insight_id"]] = {"k": i["kind"], "r": labels.get(i["rule_id"], i["rule_id"])}
            continue
        anchors = [m for m in mem if "#" not in m["role"]]
        coll = sorted((m for m in mem if "#" in m["role"]), key=lambda m: (m["distance_m"] is None, m["distance_m"] or 0, m["support_id"]))
        d = {"k": i["kind"], "r": labels.get(i["rule_id"], i["rule_id"])}
        for slot, m in zip(("a", "b"), anchors):
            d[slot] = info(m["support_kind"], m["support_id"])
        dist = [m["distance_m"] for m in anchors if m["distance_m"] is not None]
        gap = [m["delta_t_ms"] for m in anchors if m["delta_t_ms"] is not None]
        if dist:
            d["km"] = round(dist[0] / 1000, 1)
        if gap:
            d["dt"] = gap[0]
        if coll:
            m = coll[0]
            d["n"] = info(m["support_kind"], m["support_id"]) + [round(m["distance_m"] / 1000, 1) if m["distance_m"] is not None else None]
            d["c"] = len(coll)
        out[i["insight_id"]] = d
    # A map of small summaries has no list worth halving: the Core's byte budget would cut the members inside the
    # summaries one by one, re-serializing everything at each cut (hours of pure Python for D2's 50,000 outputs, which
    # no deadline can interrupt). Whole summaries are kept in order until the budget is met, said as truncated.
    budget = Budget.of(None)
    room, size, kept = budget.max_bytes - 65536, 0, {}
    for k, d in out.items():
        size += len(json.dumps(d, default=str)) + len(k) + 6
        if size > room:
            break
        kept[k] = d
    return q._envelope({"summaries": kept}, 0, budget, lod="refs", total=len(out), returned=len(kept),
                       truncated=len(kept) < len(out))


OBS_PROPS = ("question", "answer", "statistic", "unit", "population", "method", "probability_sample", "seasonal",
             "compare", "dataset", "definition", "frequency", "estimate_flags", "topic", "indicator", "indicator_label",
             "currency", "area", "taxes", "price_without_taxes")


def _wording(question, answer):
    words = re.sub(r"[^0-9a-z]+", "", re.sub(r"^\s*[a-z]*\d+[a-z]?(\.\d+)*[a-z]?\.?\s*", "", f"{question or ''}".lower()))
    return hashlib.sha1(f"{words}|{re.sub(r'[^0-9a-z]+', '', (answer or '').lower())}".encode()).hexdigest()[:8]


def observations_of(q):
    """OBSERVATIONS by the entity they are measured in (Phase 3B · block 2), from the Core's own records: the objects
    whose type the vocabulary marks with a "series" hint (one series per object) or a "wave" hint (one survey wave per
    object, its items joined across waves only when they carry the same code). Generic: no domain term, no inference;
    values, dates, samples and instruments as recorded. One package for the whole world (packaging per domain)."""
    conn = q.conn
    hints = _hints(conn)
    kinds = {t: h for t, (_lab, h) in hints.items() if h.get("series") or h.get("wave")}
    if not kinds:
        return q._envelope({"by_entity": {}, "defs": {}, "groups": {}}, 0, Budget.of(None), lod="refs", total=0, returned=0)
    marks = ",".join("?" * len(kinds))
    out, groups, notes = {}, {}, {}
    rows = conn.execute(f"SELECT o.object_id, o.type, o.props_json, o.source_id, r.to_id FROM object o JOIN relation r "
                        f"ON r.from_id=o.object_id AND r.from_kind='object' WHERE o.type IN ({marks}) AND o.status!='retracted' "
                        f"ORDER BY r.to_id, o.object_id", tuple(kinds)).fetchall()
    for r in rows:
        h = kinds[r["type"]]
        groups[r["type"]] = h.get("group") or r["type"]
        if (h.get("series") or {}).get("coverage"):
            notes[r["type"]] = h["series"]["coverage"]
        props = json.loads(r["props_json"] or "{}")
        bag = out.setdefault(r["to_id"], {})
        if h.get("series"):
            key = props.get("comparable_series_id") or r["object_id"]
            pts = [list(p) + [r["object_id"]] for p in props.get(h["series"].get("property", "series")) or []]
            bag[key] = {"id": key, "type": r["type"], "kind": h["series"].get("kind"), "label": props.get("indicator_label"),
                        "source_id": r["source_id"], "props": {k: props[k] for k in OBS_PROPS if props.get(k) is not None},
                        "points": pts, "refs": [r["object_id"]]}
        else:
            for it in props.get(h["wave"].get("property", "items")) or []:
                code, label, question, answer, value, n = it[:6]
                # one series = one code asked with the same words (numbering, spacing, punctuation aside): a question
                # reworded between waves starts another series, so no change is ever read across two instruments
                key = f"{r['source_id']}:{code}:{_wording(question, answer)}"
                s = bag.setdefault(key, {"id": key, "type": r["type"], "kind": "survey", "label": label, "source_id": r["source_id"],
                                         "props": {"question": question, "answer": answer, "statistic": "share", "unit": "%",
                                                   "population": props.get("population"), "method": props.get("method"),
                                                   "probability_sample": props.get("probability_sample"), "compare": "previous_wave",
                                                   "topic": it[6] if len(it) > 6 else None, "indicator": code},
                                         "points": [], "refs": []})
                s["points"].append([props.get("fieldwork_start"), props.get("fieldwork_end"), value, n, None, r["object_id"],
                                    props.get("dataset")])
                s["refs"].append(r["object_id"])
    # one definition table: the series of different entities that share question, answer, population, method and
    # source share one definition (the package stays small without losing a single point)
    defs, def_ids, by_entity = {}, {}, {}
    for e, bag in sorted(out.items()):
        lst = []
        for s in sorted(bag.values(), key=lambda s: (s["kind"] or "", s["props"].get("topic") or "", s["label"] or "", s["id"])):
            d = {k: s[k] for k in ("type", "kind", "label", "source_id", "props")}
            sig = json.dumps(d, sort_keys=True, default=str)
            if sig not in def_ids:
                def_ids[sig] = f"d{len(def_ids)}"
                defs[def_ids[sig]] = d
            s["points"].sort(key=lambda p: (p[1] or "", p[0] or ""))
            lst.append({"id": s["id"], "def": def_ids[sig], "points": s["points"]})
        by_entity[e] = lst
    n = sum(len(v) for v in by_entity.values())
    names = {d["source_id"]: q.sources[d["source_id"]].name for d in defs.values() if d["source_id"] in q.sources}
    env = q._envelope({"by_entity": by_entity, "defs": defs, "groups": groups, "notes": notes, "source_names": names}, 0, Budget.of({"max_bytes": 10_000_000}),
                      lod="refs", total=n, returned=n)
    if env["truncated"]:   # never a silently partial picture of what was measured
        raise QueryError("observations package exceeds the byte limit")
    return env


def tenures_of(q):
    """TENURES by the entity an office has competence over (Phase 3B · block 3), from the Core's own records: objects
    whose type carries a "tenure" hint name (as vocabulary data) the relation saying who holds them and the one saying
    where. Per office, from its terms as recorded (start = the relation's valid_from, the rest in its attributes):
      · the open term with the latest start is CURRENT; earlier open terms are SUPERSEDED (end not recorded), never current;
      · an open term without a start date is UNDATED: it cannot be placed in time, so it is never current;
      · a collegial office (its collegial property) may have several current holders sharing that latest start; members
        who started earlier and are still "open" are not shown as current (an unrecorded end is never assumed away:
        the UI says that members may be missing rather than listing someone who may have left);
      · several current holders on a non-collegial office, or a preferred rank on a superseded term, is a CONFLICT:
        every candidate is shown, none is chosen. Outcome: unique · collegial · ambiguous · none.
    Nothing is inferred beyond this: missing dates stay missing. One package for the whole world (packaging per domain)."""
    conn = q.conn
    kinds = {t: h["tenure"] for t, (_lab, h) in _hints(conn).items() if h.get("tenure")}
    offices, by_entity = {}, {}
    for t, h in kinds.items():
        for o in conn.execute("SELECT object_id, label, props_json FROM object WHERE type=? AND status!='retracted' ORDER BY object_id", (t,)):
            props = json.loads(o["props_json"] or "{}")
            terms = []
            for r in conn.execute("SELECT r.to_id, r.attributes_json, r.recorded_at_ms, p.label FROM relation r JOIN object p ON p.object_id=r.to_id "
                                  "WHERE r.type=? AND r.from_id=? ORDER BY r.valid_from_ms, r.relation_id", (h.get("held_by"), o["object_id"])):
                a = json.loads(r["attributes_json"] or "{}")
                terms.append({"person": r["to_id"], "label": r["label"], "start": a.get("start"), "end": a.get("end"),
                              "status": a.get("status") or ("ended" if a.get("end") else "open"), "rank": a.get("rank"),
                              "statement": a.get("statement"), "references": a.get("references"), "flags": a.get("flags") or [],
                              "retrieved_ms": r["recorded_at_ms"]})
            collegial = bool(props.get(h.get("collegial_property", "collegial")))
            opens = [x for x in terms if x["status"] == "open"]
            latest = max((x["start"] for x in opens if x["start"]), default=None)
            for x in opens:
                x["status"] = "undated" if not x["start"] else "current" if x["start"] == latest else "superseded"
            opens = [x for x in opens if x["status"] != "undated"]
            cur = [x for x in opens if x["status"] == "current"]
            outcome = "none" if not cur else "collegial" if collegial else "unique"
            if not collegial and (len({x["person"] for x in cur}) > 1 or any(x["rank"] == "preferred" for x in opens if x["status"] == "superseded")):
                outcome = "ambiguous"
                for x in cur:
                    x["status"] = "conflict"
            offices[o["object_id"]] = {"label": o["label"], "role": props.get(h.get("role_property", "role")), "collegial": collegial,
                                       "check": props.get(h.get("check_property", "")), "outcome": outcome,
                                       "terms": [[x["person"], x["label"], x["start"], x["end"], x["status"], x["statement"],
                                                  x["references"], x["rank"], x["flags"], x["retrieved_ms"]] for x in terms]}
            for (e,) in conn.execute("SELECT to_id FROM relation WHERE type=? AND from_id=? ORDER BY to_id", (h.get("scope"), o["object_id"])):
                by_entity.setdefault(e, []).append(o["object_id"])
    n = sum(len(v["terms"]) for v in offices.values())
    env = q._envelope({"by_entity": by_entity, "offices": offices}, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=n, returned=n)
    if env["truncated"]:
        raise QueryError("tenures package exceeds the byte limit")
    return env


IND_PROPS = ("indicator", "indicator_label", "unit", "section", "topic", "definition", "statistic", "nature", "frequency",
             "dataset", "keywords", "group", "order", "digits", "note", "unit_note", "coverage_n", "latest_period")
_IND_CACHE: dict = {}


def _period(p):
    """A source period ("YYYY", "YYYY-Sn" half-year, "YYYY-MM", "YYYY-MM-DD") as the [start, end] dates of the
    observation points."""
    import calendar as _cal
    if len(p) == 4:
        return f"{p}-01-01", f"{p}-12-31"
    if len(p) == 7 and p[5] == "S":
        return (f"{p[:4]}-01-01", f"{p[:4]}-06-30") if p[6] == "1" else (f"{p[:4]}-07-01", f"{p[:4]}-12-31")
    if len(p) == 7:
        y, m = int(p[:4]), int(p[5:7])
        return f"{p}-01", f"{p}-{_cal.monthrange(y, m)[1]:02d}"
    return p[:10], p[:10]


def _indicators_pkg(q):
    """PLACE INDICATORS (World Intelligence, 2026-10-03), from the Core's own records: the objects whose type carries
    an "indicator" hint (one object per indicator, its values per place), read through their "measured in" relations,
    and the relations whose type carries a "flow" hint (yearly volumes between two places, as the reporting place
    declares them). Generic: no domain term, no inference, no fill — a place without a value has no point. Computed once
    per world version."""
    key = (id(q.conn), q._world_version())
    if key in _IND_CACHE:
        return _IND_CACHE[key]
    conn = q.conn
    hints = _hints(conn)
    kinds = {t: h["indicator"] for t, (_lab, h) in hints.items() if h.get("indicator")}
    by_entity, defs, catalog = {}, {}, []
    for t, h in kinds.items():
        for o in conn.execute("SELECT object_id, label, props_json, source_id FROM object WHERE type=? AND status!='retracted' "
                              "ORDER BY object_id", (t,)):
            props = json.loads(o["props_json"] or "{}")
            values = {c: pts for c, pts in props.get(h.get("property", "by_country")) or []}
            units = dict(props.get("unit_by_country") or [])   # the unit of one place's values, where the source's is generic
            d = {"type": t, "kind": "indicator", "label": props.get("indicator_label") or o["label"], "source_id": o["source_id"],
                 "props": {k: props[k] for k in IND_PROPS if props.get(k) is not None}}
            defs[o["object_id"]] = d
            catalog.append({"id": o["object_id"], **d})
            for r in conn.execute("SELECT to_id, attributes_json FROM relation WHERE from_id=? AND type='measured_in' ORDER BY to_id",
                                  (o["object_id"],)):
                k = json.loads(r["attributes_json"] or "{}").get("key")
                pts = values.get(k)
                if not pts:
                    continue
                by_entity.setdefault(r["to_id"], []).append(
                    {"id": f"{o['object_id']}:{k}", "def": o["object_id"], **({"unit": units[k]} if k in units else {}),
                     "points": [[*_period(x[0]), x[1], None, None, o["object_id"], x[2] if len(x) > 2 else None] for x in pts]})
    flows = {}
    ftypes = [t for t, (_lab, h) in ((r[0], (r[1], json.loads(r[2] or "{}"))) for r in
              conn.execute("SELECT type_id, label, display_hints FROM relation_type ORDER BY type_id")) if h.get("flow")]
    labels = {r[0]: r[1] for r in conn.execute("SELECT type_id, label FROM relation_type")}
    if ftypes:
        marks = ",".join("?" * len(ftypes))
        names = {}
        for r in conn.execute(f"SELECT relation_id, type, from_id, to_id, attributes_json FROM relation WHERE type IN ({marks}) "
                              f"ORDER BY type, from_id, to_id", tuple(ftypes)):
            a = json.loads(r["attributes_json"] or "{}")
            for e, other, direction in ((r["from_id"], r["to_id"], "out"), (r["to_id"], r["from_id"], "in")):
                if other not in names:
                    row = conn.execute("SELECT label FROM object WHERE object_id=?", (other,)).fetchone()
                    names[other] = row[0] if row else None
                flows.setdefault(e, []).append({"relation": r["relation_id"], "type": r["type"], "type_label": labels.get(r["type"]),
                                                "direction": direction, "other": other, "other_label": names[other],
                                                "series": a.get("series") or [], "unit": a.get("unit"), "reporter": a.get("reporter"),
                                                "dataset": a.get("dataset"), "note": a.get("note"), "label": a.get("label")})
    # the categories of the place's facilities as their sources name them (vocabulary hint "subtypes"): a count of
    # "facilities registered" is never shown as a count of one kind (e.g. 103 mixed facilities ≠ 103 of one kind)
    subtypes = {}
    for t, (_lab, h) in hints.items():
        st = h.get("subtypes")
        if not st or not st.get("property"):
            continue
        for place, val, n in conn.execute(
                "SELECT r.to_id, json_extract(o.props_json, '$.' || ?), COUNT(*) FROM relation r JOIN object o ON o.object_id=r.from_id "
                "WHERE r.type='located_in' AND o.type=? GROUP BY r.to_id, 2 ORDER BY r.to_id, 3 DESC", (st["property"], t)):
            subtypes.setdefault(place, {}).setdefault(t, []).append([val, n])
    # the place's most populous element of each ranked type (vocabulary hint "place_index.rank_property"), with its own
    # value and source: what NEXUM knows of the place's largest member — never the identity behind another source's
    # number (a statistic that names no element is said so by the UI)
    leaders = {}
    for t, (_lab, h) in hints.items():
        rp = (h.get("place_index") or {}).get("rank_property")
        if not rp:
            continue
        for place, oid, label, val, sid in conn.execute(
                "SELECT r.to_id, o.object_id, o.label, MAX(CAST(json_extract(o.props_json, '$.' || ?) AS REAL)), o.source_id "
                "FROM relation r JOIN object o ON o.object_id = r.from_id WHERE r.type = 'located_in' AND o.type = ? AND o.status != 'retracted' "
                "AND json_extract(o.props_json, '$.' || ?) IS NOT NULL GROUP BY r.to_id ORDER BY r.to_id", (rp, t, rp)):
            leaders.setdefault(place, {})[t] = {"id": oid, "label": label, "property": rp, "value": val, "source_id": sid,
                                                 "source": q.sources[sid].name if sid in q.sources else sid}
    srcs = {d["source_id"] for d in defs.values()}
    names = {sid: q.sources[sid].name for sid in srcs if sid in q.sources}
    catalog.sort(key=lambda c: (c["props"].get("section") or "", c["props"].get("order") or 0, c["id"]))
    pkg = {"by_entity": by_entity, "defs": defs, "flows": flows, "catalog": catalog, "source_names": names, "subtypes": subtypes,
           "leaders": leaders}
    if len(_IND_CACHE) > 4:
        _IND_CACHE.clear()
    _IND_CACHE[key] = pkg
    return pkg


def indicators_of(q, eid):
    """The indicators and energy flows of ONE place (World Intelligence): its series with their definitions, and the
    flows it declares or is declared in. An empty answer is a place without data (a data gap, never an error)."""
    pkg = _indicators_pkg(q)
    series = pkg["by_entity"].get(eid, [])
    used = sorted({s["def"] for s in series})
    data = {"entity": eid, "series": series, "defs": {d: pkg["defs"][d] for d in used}, "flows": pkg["flows"].get(eid, []),
            "subtypes": pkg["subtypes"].get(eid, {}), "leaders": pkg["leaders"].get(eid, {}),
            "source_names": {k: v for k, v in pkg["source_names"].items() if any(pkg["defs"][d]["source_id"] == k for d in used)}}
    n = len(series)
    return q._envelope(data, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=n, returned=n)


def indicators_catalog_of(q):
    """Every indicator of the world with its coverage (how many places have a value) and its latest period: what a
    place's view uses to say which data exist elsewhere and are missing there (a gap, said as such)."""
    pkg = _indicators_pkg(q)
    n = len(pkg["catalog"])
    return q._envelope({"catalog": pkg["catalog"], "source_names": pkg["source_names"],
                        "places": sorted(pkg["by_entity"])}, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=n, returned=n)


SECURITY_WINDOW_DAYS = 90
VIOLENCE_IT = {1: "conflitto armato statale", 2: "conflitto tra gruppi non statali", 3: "violenza unilaterale contro civili"}


def security_of(q):
    """SECURITY ZONES (World Intelligence, 2026-10-03), computed from the digests of lethal events (vocabulary hint
    "digest") with declared rules over the last SECURITY_WINDOW_DAYS days of the data (never a forecast, never real time):
      unit: first-level administrative unit as the source names it; events with a clear account (clarity 1), not coded
      "vague or biased", dated to the day/week (date precision ≤ 2) and placed at least to the province (where ≤ 4);
      RED    R1: ≥ 3 distinct lethal events · R2: ≥ 25 deaths (best estimate) in ≥ 2 events — documented violent activity;
      ORANGE O1: ≥ 1 state-based event with a FOREIGN state actor (Gleditsch–Ward code of a state party ≠ the state's own),
             when not red — documented exposure; proximity alone colours nothing (O2, next to a red zone of another state,
             is not computed: first-level unit adjacency is not in the published world).
    The area drawn is the set of 0.5° grid cells (the PRIO-GRID cells) holding the zone's events: never a whole nation,
    never a buffer suggesting a precision the source does not have."""
    conn = q.conn
    hints = _hints(conn)
    kinds = [t for t, (_l, h) in hints.items() if h.get("digest")]
    events, files = {}, set()
    for t in kinds:
        for o in conn.execute("SELECT props_json, recorded_at_ms, source_id FROM object WHERE type=? ORDER BY recorded_at_ms, object_id", (t,)):
            pr = json.loads(o["props_json"] or "{}")
            f = pr.get("fields") or []
            files.add(pr.get("file"))
            for e in pr.get("events") or []:
                events[str(e[0])] = dict(zip(f, e)) | {"_source": o["source_id"]}   # a later file revises an event
    if not events:
        return q._envelope({"zones": [], "by_place": {}, "anchor": None}, 0, Budget.of(None), lod="refs", total=0, returned=0)
    import datetime as _dt
    anchor = max(e["date_start"] for e in events.values() if e.get("date_start"))
    since = (_dt.date.fromisoformat(anchor) - _dt.timedelta(days=SECURITY_WINDOW_DAYS - 1)).isoformat()
    ok = [e for e in events.values() if e.get("date_start") and since <= e["date_start"] <= anchor and (e.get("best") or 0) >= 1
          and e.get("event_clarity") == 1 and "vague" not in (e.get("code_status") or "").lower()
          and (e.get("date_prec") or 9) <= 2 and (e.get("where_prec") or 9) <= 4 and e.get("adm_1")
          and e.get("latitude") is not None and e.get("longitude") is not None]
    groups = {}
    for e in ok:
        groups.setdefault((e["country_id"], e["adm_1"]), []).append(e)
    ucdp_ids = {}
    for eid, v in conn.execute("SELECT entity_id, value FROM identifier WHERE scheme='ucdp_ged'"):
        ucdp_ids[v] = eid
    # the place each zone is in: the explorable area holding most of its events (the published world's own borders)
    areas = {}
    explore = sorted(t for t, (_l, h) in hints.items() if h.get("explore"))
    marks_e = ",".join("?" * len(explore)) or "''"

    def area_of(lon, lat):
        for (cid,) in conn.execute("SELECT m.entity_id FROM object_rtree r JOIN rid_map m ON m.rid=r.rid JOIN object o ON o.object_id=m.entity_id "
                                   f"WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? AND o.type IN ({marks_e}) ORDER BY m.entity_id",
                                   (lon, lon, lat, lat, *explore)):
            if cid not in areas:
                g = conn.execute("SELECT geometry FROM object WHERE object_id=?", (cid,)).fetchone()[0]
                gg = json.loads(g) if g else None
                areas[cid] = geo.PreparedArea(gg) if gg and geo.is_areal(gg) else None
            if areas[cid] is not None and areas[cid].contains(lon, lat):
                return cid
        return None
    zones = []
    for (gw, adm1), evs in sorted(groups.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
        n, deaths = len(evs), sum(e.get("best") or 0 for e in evs)
        foreign = [e for e in evs if e.get("type_of_violence") == 1 and any(x not in (None, gw) for x in (e.get("gwnoa"), e.get("gwnob")))]
        rule = "R1" if n >= 3 else "R2" if deaths >= 25 and n >= 2 else "O1" if foreign else None
        if not rule:
            continue
        votes = {}
        for e in evs:
            c = area_of(e["longitude"], e["latitude"])
            if c:
                votes[c] = votes.get(c, 0) + 1
        place = max(sorted(votes), key=lambda c: votes[c]) if votes else None
        cells = sorted({(int((e["longitude"] + 180) // 0.5), int((e["latitude"] + 90) // 0.5)) for e in evs})
        zones.append({"id": f"z:{gw}:{adm1}", "place": place, "adm1": adm1, "gw": gw, "color": "red" if rule in ("R1", "R2") else "orange",
                      "rule": rule, "events_n": n, "deaths_best": deaths, "foreign_n": len(foreign),
                      "first": min(e["date_start"] for e in evs), "last": max(e["date_start"] for e in evs),
                      "cells": [[-180 + x * 0.5, -90 + y * 0.5] for x, y in cells],
                      "events": [[str(e["id"]), e["date_start"], e.get("best"), e.get("low"), e.get("high"), VIOLENCE_IT.get(e.get("type_of_violence"), ""),
                                  e.get("side_a"), e.get("side_b"), e.get("where_prec"), e.get("code_status"), ucdp_ids.get(str(e["id"])),
                                  e in foreign] for e in sorted(evs, key=lambda e: (e["date_start"], str(e["id"])), reverse=True)]})
    by_place = {}
    for i, z in enumerate(zones):
        if z["place"]:
            by_place.setdefault(z["place"], []).append(i)
    src = next(iter({e["_source"] for e in events.values()}), None)
    data = {"zones": zones, "by_place": by_place, "anchor": anchor, "since": since, "window_days": SECURITY_WINDOW_DAYS,
            "files": sorted(f for f in files if f), "source_id": src,
            "rules": {"R1": "≥ 3 eventi letali distinti nell'unità amministrativa", "R2": "≥ 25 morti (stima migliore) in almeno 2 eventi",
                      "O1": "≥ 1 evento di conflitto statale con un attore statale estero documentato"}}
    return q._envelope(data, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=len(zones), returned=len(zones))


EVENT_MEDIA_DAYS, EVENT_MEDIA_KM = 30, 25


def event_media_of(q):
    """CURRENT images near RECENT events (World Intelligence, 2026-10-03; replaces the retired rule
    event_webcams_nearby): for every event that starts or ends within EVENT_MEDIA_DAYS days of the data's most recent
    event, the elements of a type with a "media" hint (a current image) within EVENT_MEDIA_KM km. An image of today is
    never attached to an event that ended long ago; nearness is said as nearness (the camera may not show the event)."""
    import math as _m
    conn = q.conn
    hints = _hints(conn)
    media = sorted(t for t, (_l, h) in hints.items() if h.get("media"))
    last = conn.execute("SELECT MAX(t_start_ms) FROM event").fetchone()[0]
    out = {}
    if media and last:
        since = last - EVENT_MEDIA_DAYS * 86_400_000
        marks = ",".join("?" * len(media))
        for e in conn.execute("SELECT event_id, lon, lat FROM event WHERE lon IS NOT NULL AND MAX(t_start_ms, COALESCE(t_end_ms, t_start_ms)) >= ? "
                              "ORDER BY event_id", (since,)).fetchall():
            dlat = EVENT_MEDIA_KM / 111.0
            dlon = dlat / max(0.05, _m.cos(_m.radians(e["lat"])))
            near = []
            for o in conn.execute(f"SELECT o.object_id, o.label, o.lon, o.lat FROM object_rtree r JOIN rid_map m ON m.rid=r.rid "
                                  f"JOIN object o ON o.object_id=m.entity_id WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? "
                                  f"AND o.type IN ({marks})", (e["lon"] + dlon, e["lon"] - dlon, e["lat"] + dlat, e["lat"] - dlat, *media)):
                km = geo.haversine_km(e["lon"], e["lat"], o["lon"], o["lat"]) if hasattr(geo, "haversine_km") else None
                if km is None:
                    p1, p2 = _m.radians(e["lat"]), _m.radians(o["lat"])
                    a = _m.sin((p2 - p1) / 2) ** 2 + _m.cos(p1) * _m.cos(p2) * _m.sin(_m.radians(o["lon"] - e["lon"]) / 2) ** 2
                    km = 6371.0 * 2 * _m.asin(min(1.0, _m.sqrt(a)))
                if km <= EVENT_MEDIA_KM:
                    near.append([o["object_id"], o["label"], round(km, 1)])
            if near:
                out[e["event_id"]] = sorted(near, key=lambda x: (x[2], x[0]))[:12]
    # places with a "nearby_media_km" hint (e.g. a city): the cameras within that distance, with their state
    by_place, place_km, place_n = {}, {}, {}
    for t, (_l, h) in hints.items():
        km_lim = h.get("nearby_media_km")
        if not km_lim or not media:
            continue
        place_km[t] = km_lim
        marks = ",".join("?" * len(media))
        cams = conn.execute(f"SELECT object_id, label, lon, lat, json_extract(props_json, '$.availability') FROM object "
                            f"WHERE type IN ({marks}) AND lon IS NOT NULL", tuple(media)).fetchall()
        grid = {}
        for c in cams:
            grid.setdefault((int(c[2] // 0.5), int(c[3] // 0.5)), []).append(c)
        for o in conn.execute("SELECT object_id, lon, lat FROM object WHERE type=? AND lon IS NOT NULL ORDER BY object_id", (t,)):
            near = []
            gx, gy = int(o["lon"] // 0.5), int(o["lat"] // 0.5)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for c in grid.get((gx + dx, gy + dy), ()):
                        p1, p2 = _m.radians(o["lat"]), _m.radians(c[3])
                        a = _m.sin((p2 - p1) / 2) ** 2 + _m.cos(p1) * _m.cos(p2) * _m.sin(_m.radians(c[2] - o["lon"]) / 2) ** 2
                        km = 6371.0 * 2 * _m.asin(min(1.0, _m.sqrt(a)))
                        if km <= km_lim:
                            near.append([c[0], c[1], round(km, 1), c[4]])
            if near:
                by_place[o["object_id"]] = sorted(near, key=lambda x: (x[2], x[0]))[:20]
                place_n[o["object_id"]] = len(near)          # how many in all within the distance (the 20 nearest are listed)
    # what each explorable place's cameras can show, by the source's availability (e.g. live video, current image, link
    # only): the place's own view says these numbers apart, never one total that hides how many are live
    by_avail = {}
    explore = [t for t, (_l, h) in hints.items() if h.get("explore")]
    if media and explore:
        mm, em = ",".join("?" * len(media)), ",".join("?" * len(explore))
        for place, av, n in conn.execute(
                f"SELECT r.to_id, json_extract(o.props_json, '$.availability'), COUNT(DISTINCT o.object_id) FROM relation r "
                f"JOIN object o ON o.object_id=r.from_id JOIN object p ON p.object_id=r.to_id "
                f"WHERE o.type IN ({mm}) AND p.type IN ({em}) GROUP BY 1, 2 ORDER BY 1, 2", (*media, *explore)):
            by_avail.setdefault(place, {})[av or "unknown"] = n
    data = {"by_event": out, "days": EVENT_MEDIA_DAYS, "km": EVENT_MEDIA_KM, "anchor_ms": last, "by_place": by_place, "place_km": place_km,
            "place_n": place_n, "by_avail": by_avail}
    return q._envelope(data, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=len(out), returned=len(out))


def places_index_of(q):
    """Every explorable place (vocabulary hint "explore") with its label and its source names (aliases): a small index
    the search reads first, so a place named exactly or by prefix is never buried under thousands of events that share
    its name in their labels (integrity gate 2026-10-04: "suda", "Sudan", "Niger" did not reach the place)."""
    conn = q.conn
    hints = _hints(conn)
    explore = sorted(t for t, (_l, h) in hints.items() if h.get("explore"))
    out = []
    for t in explore:
        for o in conn.execute("SELECT object_id, label, props_json FROM object WHERE type=? ORDER BY object_id", (t,)):
            names = sorted({r[0] for r in conn.execute("SELECT alias FROM alias WHERE entity_id=?", (o[0],))} - {o[1]})
            # a clear name where the source's short label is abbreviated ("S. Sudan" → "South Sudan"): the source's own
            # sovereign-state name, only for a sovereign state and only when it is one of the place's names
            pr = json.loads(o[2] or "{}")
            sov = pr.get("sovereignty")
            clear = sov if "." in o[1] and sov in names and "sovereign" in str(pr.get("ne_type", "")).lower() else None
            out.append([o[0], t, o[1], names, clear])
    # other places a person names (vocabulary hint "place_index", completion 2026-10-04): their rank among namesakes
    # (e.g. inhabitants: London before London, Ontario) and a context word that tells them apart (e.g. their state)
    for t in sorted(t for t, (_l, h) in hints.items() if h.get("place_index") and not h.get("explore")):
        pi = hints[t][1]["place_index"]
        for o in conn.execute("SELECT object_id, label, props_json FROM object WHERE type=? ORDER BY object_id", (t,)):
            pr = json.loads(o[2] or "{}")
            rank = pr.get(pi.get("rank_property"))
            if pi.get("min_rank") is not None and (rank is None or rank < pi["min_rank"]):
                continue          # a small place: found by the full-text search (the index read on the first search stays light)
            names = sorted({r[0] for r in conn.execute("SELECT alias FROM alias WHERE entity_id=?", (o[0],))} - {o[1]})
            out.append([o[0], t, o[1], names, None, rank, pr.get(pi.get("context_property"))])
    return q._envelope({"places": out}, 0, Budget.of({"max_bytes": 10_000_000}), lod="refs", total=len(out), returned=len(out))


def data_received_of(q):
    """When the world last received data from its sources: the newest raw payload's fetch time (ms)."""
    return q.conn.execute("SELECT MAX(fetched_ms) FROM raw_record").fetchone()[0]


API_OPS = {"highlights": highlights_of, "insight_types": insight_types_of, "insight_summaries": insight_summaries_of,
           "observations": observations_of, "tenures": tenures_of, "indicators": indicators_of,
           "indicators_catalog": indicators_catalog_of, "security": security_of, "event_media": event_media_of,
           "data_received": data_received_of, "places_index": places_index_of}


def api_op(w, name, *args):
    """Run an API-layer read operation where the Core query lives (this thread, or the worker process)."""
    if isinstance(w, ProcWorker):
        return w.call(name, args, {})
    return API_OPS[name](w.q, *args)
