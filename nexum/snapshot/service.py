"""In-process access to the local service's route handlers (no HTTP, no worker processes).

`LocalService.get(path, params)` returns exactly what `GET /api/v1<path>?<params>` answers in Phase 2:
the same parameter validation, budgets and Core calls. Only transport details differ: `timing_ms` is
set to 0 (so that artifacts are deterministic) and the `api` block keeps op, deadline and applied budget.
"""

import json
import pathlib
import sqlite3
import tempfile

from nexum import worlds
from nexum.api.server import ApiError, Service
from nexum.core.query import QueryError


def _param(v):
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)


class LocalService:
    def __init__(self, world: str):
        self.world = world
        self.cfg = getattr(worlds, world)()
        self._tmp = tempfile.TemporaryDirectory(prefix="nexum-snapshot-")
        self.svc = Service(self.cfg, world, workers=1, processes=False, response_cache=False,
                           trails_path=pathlib.Path(self._tmp.name) / "trails.sqlite")
        self.w = self.svc.pool.get()
        self.q = self.w.q
        self.conn = self.w.conn

    def world_version(self) -> int:
        return self.q._world_version()

    def get(self, path: str, params: dict | None = None):
        """(status, body) of GET /api/v1<path> with already-decoded parameters."""
        p = {k: _param(v) for k, v in (params or {}).items() if v is not None}
        full = "/api/v1" + path
        for method, rx, fn, deadline, _cacheable in self.svc.routes:
            m = rx.match(full)
            if not (m and method == "GET"):
                continue
            wv = self.world_version()
            try:
                try:
                    env, reduced = fn(self.w, m, p, None)
                except sqlite3.OperationalError:
                    raise
                except QueryError as e:
                    status, code = (404, "not_found") if "not found" in str(e) else (400, "invalid_request")
                    raise ApiError(status, code, str(e)) from None
            except ApiError as e:
                return e.status, {"error": {"code": e.code, "message": e.message, "hint": e.hint}, "world_version": wv}
            env["timing_ms"] = 0
            env["api"] = {"op": fn.__name__, "deadline_ms": int(deadline * 1000), "budget_applied": reduced}
            return 200, json.loads(json.dumps(env, ensure_ascii=False, default=str))
        return 404, {"error": {"code": "not_found", "message": f"no endpoint GET {full}", "hint": None},
                     "world_version": None}

    def raw(self, raw_id: str, locator: str):
        """Body of GET /api/v1/raw/<raw_id>?path=<locator> (Phase 2 handler, same licence block)."""
        from nexum.api.rawx import RawError
        try:
            rec = self.svc.raw.extract(raw_id, locator)
        except RawError as e:
            return 404, {"error": {"code": "not_found", "message": str(e), "hint": None}, "world_version": None}
        src = self.svc.sources.get(rec["source_id"])
        rec["licence"] = {"license_id": src.license_id, "license_url": src.license_url,
                          "attribution": src.attribution} if src else None
        return 200, json.loads(json.dumps({"data": rec}, ensure_ascii=False, default=str))

    def rule(self, rule_id: str, version: str | None):
        try:
            return 200, {"data": self.svc.rule_definition(rule_id, version)}
        except ApiError as e:
            return e.status, {"error": {"code": e.code, "message": e.message, "hint": e.hint}, "world_version": None}

    def close(self):
        self._tmp.cleanup()
