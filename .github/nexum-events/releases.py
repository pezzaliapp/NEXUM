#!/usr/bin/env python3
"""Reference-world releases: which one to restore, which ones may be deleted (2026-10-11).

Releases are ordered by `publishedAt`, never by `createdAt` (on GitHub that is the date of the tagged commit: the same
for every release of the reference repository). Reads `gh release list --json tagName,isDraft,publishedAt` on stdin.

    releases.py latest                                   → the newest world-*/prod-* release
    releases.py prune --prefix world- --keep 4 [--protect TAG ...]
                                                         → the tags that may be deleted, one per line

Whenever the dates are missing, equal or inconsistent — a date in the future, or a newer release holding an older
world than an earlier one — nothing is selected and nothing is deleted: exit 3 with the reason.
"""

import argparse
import datetime as dt
import json
import re
import sys

PREFIXES = ("world-", "prod-")
_VERSION = re.compile(r"^(?:world|prod)-(\d+)(?:-|$)")
FUTURE_TOLERANCE = dt.timedelta(minutes=10)


class Unsafe(Exception):
    pass


def references(rows, now=None):
    """The reference releases, oldest first, after every consistency check."""
    now = now or dt.datetime.now(dt.timezone.utc)
    refs = []
    for r in rows:
        tag = r.get("tagName") or ""
        if r.get("isDraft") or not tag.startswith(PREFIXES):
            continue
        m = _VERSION.match(tag)
        if not m:
            raise Unsafe(f"{tag}: no world version in the tag")
        try:
            at = dt.datetime.fromisoformat((r.get("publishedAt") or "").replace("Z", "+00:00"))
        except ValueError:
            raise Unsafe(f"{tag}: publishedAt missing or not a date ({r.get('publishedAt')!r})") from None
        if at.tzinfo is None:
            raise Unsafe(f"{tag}: publishedAt without a time zone")
        if at > now + FUTURE_TOLERANCE:
            raise Unsafe(f"{tag}: publishedAt in the future ({at.isoformat()})")
        refs.append((at, int(m.group(1)), tag))
    if not refs:
        raise Unsafe("no reference release")
    refs.sort()
    for (a0, v0, t0), (a1, v1, t1) in zip(refs, refs[1:]):
        if a0 == a1:
            raise Unsafe(f"{t0} and {t1}: the same publishedAt")
        if v1 < v0:
            raise Unsafe(f"{t1} (world {v1}) is newer than {t0} (world {v0}) but holds an older world")
    return refs


def latest(rows, now=None) -> str:
    return references(rows, now)[-1][2]


def prune(rows, prefix: str, keep: int, protect=(), now=None) -> list:
    if prefix not in PREFIXES or keep < 1:
        raise Unsafe(f"refused: prefix {prefix!r}, keep {keep}")
    refs = references(rows, now)
    newest = refs[-1][2]
    mine = [t for _, _, t in reversed(refs) if t.startswith(prefix)]
    return [t for t in mine[keep:] if t != newest and t not in set(protect)]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="releases")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("latest")
    p = sub.add_parser("prune")
    p.add_argument("--prefix", required=True)
    p.add_argument("--keep", type=int, required=True)
    p.add_argument("--protect", action="append", default=[])
    a = ap.parse_args(argv)
    try:
        rows = json.load(sys.stdin)
        if a.cmd == "latest":
            print(latest(rows))
        else:
            for t in prune(rows, a.prefix, a.keep, a.protect):
                print(t)
    except (Unsafe, ValueError) as e:
        print(f"unsafe, nothing selected or deleted: {e}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
