"""PRODUCTION FRESHNESS (2026-10-30): after 48 hours without a publication reaching production, the author is told.

Reads the built_utc of the site in production (its current.json) and says what the workflow does with its single issue
"nexum-events: production not updated for 48 h": open it, comment it (once a day, from the publish run), close it when
production is fresh again, or nothing. Prints one JSON line; never fails the run (an unreadable site is a warning).
"""

import argparse
import datetime as dt
import json
import sys
import urllib.request

STALE_H = 48
USER_AGENT = "NEXUM-pipeline (+https://github.com/pezzaliapp/NEXUM)"


def decide(built_utc: str | None, now: dt.datetime, issue_open: bool, mode: str) -> dict:
    if not built_utc:
        return {"action": "warn", "age_h": None, "why": "production not readable"}
    built = dt.datetime.fromisoformat(built_utc.replace("Z", "+00:00"))
    age_h = int((now - built).total_seconds() // 3600)
    if age_h >= STALE_H:
        action = "comment" if issue_open and mode == "publish" else "open" if not issue_open else "none"
        return {"action": action, "age_h": age_h, "built_utc": built_utc}
    return {"action": "close" if issue_open else "none", "age_h": age_h, "built_utc": built_utc}


def built_of(site: str) -> str | None:
    try:
        req = urllib.request.Request(site.rstrip("/") + "/current.json", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8")).get("built_utc")
    except Exception:
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="freshness")
    ap.add_argument("--site", required=True)
    ap.add_argument("--issue-open", default="")
    ap.add_argument("--mode", default="update")
    a = ap.parse_args(argv)
    print(json.dumps(decide(built_of(a.site), dt.datetime.now(dt.timezone.utc), bool(a.issue_open), a.mode)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
