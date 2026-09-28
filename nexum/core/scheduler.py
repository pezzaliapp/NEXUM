"""Polite Scheduler: the only component allowed to perform network I/O.

Rules enforced here (not left to connectors): host allowlist, honest
User-Agent, per-host rate limit, per-resource minimum interval, conditional
requests, Retry-After, exponential backoff, automatic suspension.
"""

import email.utils
import gzip
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from dataclasses import dataclass

from .ids import ulid

USER_AGENT = "NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)"
SUSPEND_AFTER = 5
BACKOFF_BASE_S = 2.0
BACKOFF_MAX_S = 120.0


class SchedulerError(RuntimeError):
    pass


class NotAllowed(SchedulerError):
    pass


class Deferred(SchedulerError):
    """The request must wait (Retry-After or resource interval not yet elapsed)."""


@dataclass
class FetchRequest:
    url: str
    resource_key: str
    force: bool = False  # ignore the per-resource minimum interval (backfill windows are distinct resources)


@dataclass
class FetchResult:
    status: int
    raw_id: str | None
    sha256: str | None
    not_modified: bool
    bytes: int
    new_raw: bool


class Scheduler:
    def __init__(self, conn, raw_store, sources, project_root, clock=time.time, sleep=time.sleep,
                 opener=None, run_id=None):
        self.conn = conn
        self.raw = raw_store
        self.sources = sources
        self.root = pathlib.Path(project_root).resolve()
        self.clock = clock
        self.sleep = sleep
        self.opener = opener or urllib.request.build_opener()
        self.run_id = run_id
        self._host_next: dict[str, float] = {}

    # ── helpers ──────────────────────────────────────────────────────────────
    def _now_ms(self) -> int:
        return int(self.clock() * 1000)

    def _health(self, sid):
        row = self.conn.execute("SELECT * FROM source_health WHERE source_id=?", (sid,)).fetchone()
        if row is None:
            self.conn.execute("INSERT INTO source_health VALUES(?,?,?,?,?,?)", (sid, None, None, 0, None, "ok"))
            row = self.conn.execute("SELECT * FROM source_health WHERE source_id=?", (sid,)).fetchone()
        return row

    def _set_health(self, sid, **kw):
        cols = ", ".join(f"{k}=?" for k in kw)
        self.conn.execute(f"UPDATE source_health SET {cols} WHERE source_id=?", (*kw.values(), sid))

    def check_allowed(self, source, url: str) -> None:
        u = urllib.parse.urlsplit(url)
        if source.access_type == "local":
            if u.scheme != "file":
                raise NotAllowed(f"{source.id}: local sources may only read files")
            p = (self.root / u.path.lstrip("/")).resolve()
            if self.root not in p.parents:
                raise NotAllowed(f"{source.id}: path outside project root")
            return
        if u.scheme not in ("https", "http"):
            raise NotAllowed(f"{source.id}: scheme {u.scheme!r} not allowed")
        host = u.netloc.lower()
        if host not in [h.lower() for h in source.allowed_hosts]:
            raise NotAllowed(f"{source.id}: host {host!r} not in allowlist")

    def _last_raw(self, sid, resource_key):
        return self.conn.execute(
            "SELECT raw_id, sha256, etag, last_modified, fetched_ms FROM raw_record "
            "WHERE source_id=? AND resource_key=? ORDER BY fetched_ms DESC LIMIT 1",
            (sid, resource_key)).fetchone()

    def _last_fetch_ms(self, sid, resource_key):
        return self.conn.execute(
            "SELECT MAX(requested_ms) FROM fetch_log WHERE source_id=? AND resource_key=? AND error IS NULL",
            (sid, resource_key)).fetchone()[0]

    def _log(self, source, req, requested_ms, status, not_modified, raw_id, nbytes, dur_ms, conditional, error):
        self.conn.execute(
            "INSERT INTO fetch_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (ulid(requested_ms), self.run_id, source.id, req.url, req.resource_key, requested_ms, status,
             int(not_modified), raw_id, nbytes, dur_ms, USER_AGENT, int(conditional), error))

    def _store(self, source, req, data, status, headers, now_ms) -> FetchResult:
        sha, rel = self.raw.put(data)
        existing = self.conn.execute("SELECT raw_id FROM raw_record WHERE source_id=? AND sha256=?",
                                     (source.id, sha)).fetchone()
        if existing:
            return FetchResult(status, existing[0], sha, False, len(data), False)
        raw_id = ulid(now_ms)
        entry = dict(raw_id=raw_id, source_id=source.id, sha256=sha, codec="gzip", size=len(data),
                     url=req.url, resource_key=req.resource_key, fetched_ms=now_ms, http_status=status,
                     etag=headers.get("ETag"), last_modified=headers.get("Last-Modified"),
                     content_type=headers.get("Content-Type"), path=rel)
        self.conn.execute("INSERT INTO raw_record VALUES(:raw_id,:source_id,:sha256,:codec,:size,:url,"
                          ":resource_key,:fetched_ms,:http_status,:etag,:last_modified,:content_type,:path)", entry)
        self.raw.append_manifest(entry)
        return FetchResult(status, raw_id, sha, False, len(data), True)

    # ── main entry ───────────────────────────────────────────────────────────
    def fetch(self, source, req: FetchRequest, max_retries: int = 2) -> FetchResult:
        self.check_allowed(source, req.url)
        health = self._health(source.id)
        now_ms = self._now_ms()
        if health["state"] == "suspended":
            raise Deferred(f"{source.id}: source suspended after repeated errors")
        if source.respect_retry_after and health["retry_after_ms"] and now_ms < health["retry_after_ms"]:
            raise Deferred(f"{source.id}: Retry-After until {health['retry_after_ms']}")
        if not req.force:
            last = self._last_fetch_ms(source.id, req.resource_key)
            if last is not None and now_ms - last < source.min_interval_s * 1000:
                raise Deferred(f"{source.id}: resource fetched {now_ms - last} ms ago (< min_interval)")

        if source.access_type == "local":
            path = self.root / urllib.parse.urlsplit(req.url).path.lstrip("/")
            data = path.read_bytes()
            res = self._store(source, req, data, 200, {}, now_ms)
            self._log(source, req, now_ms, 200, False, res.raw_id, len(data), 0, False, None)
            self._set_health(source.id, last_attempt_ms=now_ms, last_success_ms=now_ms, consecutive_errors=0)
            return res

        attempt = 0
        while True:
            host = urllib.parse.urlsplit(req.url).netloc.lower()
            if host not in self._host_next:
                # the per-host rate survives across sessions: start from the last logged request to this host
                last = self.conn.execute("SELECT MAX(requested_ms) FROM fetch_log WHERE url LIKE ? OR url LIKE ?",
                                         (f"https://{host}/%", f"http://{host}/%")).fetchone()[0]
                if last is not None:
                    self._host_next[host] = last / 1000.0 + 1.0 / source.max_rps
            wait = self._host_next.get(host, 0.0) - self.clock()
            if wait > 0:
                self.sleep(wait)
            self._host_next[host] = self.clock() + 1.0 / source.max_rps
            headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}
            last = self._last_raw(source.id, req.resource_key)
            conditional = False
            if source.conditional_get and last is not None:
                if last["etag"]:
                    headers["If-None-Match"] = last["etag"]
                    conditional = True
                if last["last_modified"]:
                    headers["If-Modified-Since"] = last["last_modified"]
                    conditional = True
            started = self.clock()
            requested_ms = int(started * 1000)
            try:
                resp = self.opener.open(urllib.request.Request(req.url, headers=headers), timeout=90)
                body = resp.read()
                enc = (resp.headers.get("Content-Encoding") or "").lower()
                if enc == "gzip":
                    body = gzip.decompress(body)
                elif enc == "deflate":
                    body = zlib.decompress(body)
                res = self._store(source, req, body, resp.status, dict(resp.headers), requested_ms)
                self._log(source, req, requested_ms, resp.status, False, res.raw_id, len(body),
                          int((self.clock() - started) * 1000), conditional, None)
                self._set_health(source.id, last_attempt_ms=requested_ms, last_success_ms=requested_ms,
                                 consecutive_errors=0, retry_after_ms=None, state="ok")
                return res
            except urllib.error.HTTPError as e:
                if e.code == 304:
                    self._log(source, req, requested_ms, 304, True, last["raw_id"] if last else None, 0,
                              int((self.clock() - started) * 1000), conditional, None)
                    self._set_health(source.id, last_attempt_ms=requested_ms, last_success_ms=requested_ms,
                                     consecutive_errors=0, state="ok")
                    return FetchResult(304, last["raw_id"] if last else None, last["sha256"] if last else None,
                                       True, 0, False)
                err = f"HTTP {e.code}"
                retry_after = e.headers.get("Retry-After") if e.headers else None
                self._fail(source, req, requested_ms, e.code, err, conditional, started)
                if e.code in (429, 503) and retry_after:
                    until = self._parse_retry_after(retry_after, requested_ms)
                    self._set_health(source.id, retry_after_ms=until, state="degraded")
                    raise Deferred(f"{source.id}: {err}, Retry-After until {until}") from e
                if e.code < 500 and e.code != 429:
                    raise SchedulerError(f"{source.id}: {err} for {req.url}") from e
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                self._fail(source, req, requested_ms, None, f"{type(e).__name__}: {e}", conditional, started)
            attempt += 1
            if attempt > max_retries:
                raise SchedulerError(f"{source.id}: giving up on {req.url} after {attempt} attempts")
            self.sleep(min(BACKOFF_MAX_S, BACKOFF_BASE_S * (2 ** (attempt - 1))))

    def _fail(self, source, req, requested_ms, status, err, conditional, started):
        self._log(source, req, requested_ms, status, False, None, 0, int((self.clock() - started) * 1000),
                  conditional, err)
        h = self._health(source.id)
        n = (h["consecutive_errors"] or 0) + 1
        self._set_health(source.id, last_attempt_ms=requested_ms, consecutive_errors=n,
                         state="suspended" if n >= SUSPEND_AFTER else "degraded")

    @staticmethod
    def _parse_retry_after(value: str, now_ms: int) -> int:
        v = value.strip()
        if v.isdigit():
            return now_ms + int(v) * 1000
        dt = email.utils.parsedate_to_datetime(v)
        return int(dt.timestamp() * 1000)
