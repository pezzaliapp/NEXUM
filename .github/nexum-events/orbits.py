#!/usr/bin/env python3
"""NEXUM — the orbital elements of CelesTrak, once a day (option C, approved by the author on 2026-10-16).

CelesTrak's usage policy (celestrak.org, in force for the GP data since 2026-03-26): download each set
ONCE per update, never in bursts, and STOP at any answer that is not a good one — repeated errors put the address in
CelesTrak's firewall. The Core's Polite Scheduler is used as it is, through its own parameters only:

  - Scheduler(opener=…)              an opener that follows no redirect (a 3xx is an error, never followed in silence)
  - Scheduler.fetch(max_retries=0)   one attempt per set: an HTTP error, a network error or a timeout is never retried
  - the registry's max_rps (0.1)     10 s between two requests to the host, also enforced here (MIN_GAP_S)
  - the registry's min_interval_s    a set fetched less than 2 hours ago is not asked again (Deferred)

One request per set, in the connector's order, and the first anomaly ends the run: an HTTP or network error, a timeout,
a request the Scheduler defers, or a 200 whose body is not the OMM CSV (CelesTrak answers an unknown or rate-limited
query with a 200 and a line of text). The sets already fetched stay; the published table keeps, for every set, its
newest USABLE payload (connector usable(), read by the API), so a failed update never empties a group.

    python3 .github/nexum-events/orbits.py          (the live world, run by pipeline.py in publish mode only)

Prints {"celestrak.gp": {requests, new_raw, not_modified, deferred, sets_ok, stopped?}} like `nexum.cli live fetch`.
Exit codes: 0 every set fetched (or nothing asked: deferred) · 3 stopped at an anomaly (said on the last stderr line).
"""

import json
import pathlib
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = "celestrak.gp"
MIN_GAP_S = 10.0


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect is not followed: urllib then raises it as an HTTPError (3xx), which the Scheduler logs and raises."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def opener():
    return urllib.request.build_opener(NoRedirect)


def refresh(sched, raw, conn, source, mod, run_id, clock=time.time, sleep=time.sleep):
    """Fetch every set of the connector once, stopping at the first anomaly. Returns (summary, reason or None)."""
    from nexum.core.scheduler import Deferred
    summary = {"requests": 0, "new_raw": 0, "not_modified": 0, "deferred": 0, "sets_ok": 0}
    last = None
    for req in mod.plan("incremental", {}, source):
        if last is not None and clock() - last < MIN_GAP_S:
            sleep(MIN_GAP_S - (clock() - last))
        before = _logged(conn, run_id, req.resource_key)
        error, deferred = None, False
        try:
            res = sched.fetch(source, req, max_retries=0)
        except Deferred as e:               # before any request (interval, Retry-After, suspended) or after a 429/503
            res, error, deferred = None, f"deferred: {e}", True
        except Exception as e:              # HTTP (3xx, 4xx, 5xx), network, timeout, truncated body: stop
            res, error = None, f"{type(e).__name__}: {e}"
        logged = _logged(conn, run_id, req.resource_key) - before
        # a body cut short raises past the Scheduler's log: the request was made all the same
        asked = logged if logged or deferred else 1
        if asked:
            last = clock()
        summary["requests"] += asked
        if asked > 1:                       # never expected: max_retries=0 means one attempt
            return summary, f"{req.resource_key}: {asked} requests for one set"
        if error:
            if not asked:
                summary["deferred"] += 1
            detail = _last_error(conn, run_id, req.resource_key) if logged else None
            return summary, f"{req.resource_key}: {error}" + (f" ({detail})" if detail else "")
        if res.status != 200 and not res.not_modified:
            return summary, f"{req.resource_key}: HTTP {res.status}"
        summary["new_raw"] += int(res.new_raw)
        summary["not_modified"] += int(res.not_modified)
        if res.sha256 and not mod.usable(raw.get(res.sha256)):
            text = raw.get(res.sha256)[:120].decode("utf-8", "replace").strip()
            return summary, f"{req.resource_key}: HTTP 200 but not the OMM CSV ({text!r}); its previous data stay published"
        summary["sets_ok"] += 1
    return summary, None


def _last_error(conn, run_id, key):
    """What the Scheduler logged for the failed request (HTTP 500, TimeoutError: timed out, …)."""
    r = conn.execute("SELECT error FROM fetch_log WHERE run_id=? AND source_id=? AND resource_key=? AND error IS NOT NULL "
                     "ORDER BY requested_ms DESC LIMIT 1", (run_id, SOURCE, key)).fetchone()
    return r[0] if r else None


def _logged(conn, run_id, key):
    return conn.execute("SELECT COUNT(*) FROM fetch_log WHERE run_id=? AND source_id=? AND resource_key=?",
                        (run_id, SOURCE, key)).fetchone()[0]


def main():
    sys.path.insert(0, str(ROOT))
    from nexum import worlds
    from nexum.core.pipeline import Nexum
    from nexum.core.scheduler import Scheduler
    nx = Nexum(worlds.live())
    try:
        source = nx.sources[SOURCE]
        sched = Scheduler(nx.conn, nx.raw, nx.sources, nx.root, opener=opener(), run_id=nx.run_id)
        summary, reason = refresh(sched, nx.raw, nx.conn, source, nx.connector(source), nx.run_id)
    finally:
        nx.close()
    if reason:
        summary["stopped"] = reason
    print(json.dumps({SOURCE: summary}, indent=1))
    if reason and not (summary["deferred"] and not summary["requests"]):
        print(f"{SOURCE}: stopped after {summary['sets_ok']} sets — {reason}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
