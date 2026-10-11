#!/usr/bin/env python3
"""NEXUM — automatic natural events (decision D7 as extended by the author on 2026-10-11).

Two modes, both starting from the REFERENCE WORLD (a verified xz archive in a private repository, never a cache):

  update   (every 6 hours)  A acquisition → B processing → C checks → the next reference world
  publish  (once a day)     the same, then D snapshot, parity, assembly, exposure and production checks: the
                            assembled site in data/deploy/web is ready to deploy only when every check passes

  A. acquisition   one source per process (a broken connector never blocks the others), polite (the registry's
                   intervals, enforced by the Polite Scheduler), only the sources of the allowlist
  B. processing    the Core's own `process`, unchanged
  C. checks        the world may only GROW: every source outside the allowlist byte-identical, nothing lost,
                   no duplicate identifier, no event in the future, provenance on every new or changed event
  D. snapshot      build, parity (Python, bundles, browser), assembly within the Cloudflare Free limits; no raw record
                   beyond its source's exposure policy; no type with fewer elements than the site in production

Without a reference world the run stops: NEXUM never rebuilds the world from scratch on its own. A run that fails
writes nothing but its report; the next run starts again from the last good reference world.

    python3 .github/nexum-events/pipeline.py pack    --world data/live --out <dir> [--label L]
    python3 .github/nexum-events/pipeline.py restore --seed <dir>
    python3 .github/nexum-events/pipeline.py run     --seed <dir> --out <dir> [--publish] [--production-url URL]

Exit codes: 0 done (or nothing new, said in the report) · 2 usage · 3 no reference world · 4 reference world corrupt ·
5 a world is already present (never overwritten) · 6 processing failed · 7 checks failed · 8 snapshot, assembly or
publication checks failed · 9 every source failed.
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
LIVE = ROOT / "data" / "live"
SNAP = ROOT / "data" / "snapshot"
WEB = ROOT / "data" / "deploy" / "web"
# phase 1 (2026-10-11): the natural events that move fastest; other sources are added one by one, by decision
PHASE1 = ("usgs.earthquakes", "nasa.eonet", "cems.rapid_mapping")
# USGS: the current year's FDSN window (M ≥ 5.5, one request) closes any gap the 7-day feed cannot reach, then the feed
MODES = {"usgs.earthquakes": ("backfill", "incremental")}
FETCH_TIMEOUT_S = 1200
# O9 (first search ≤ 6,000 ms at ~1,012,500 B/s, measured 5,866.7 ms on live-716): the search index may grow by
# ~100 KB at most before the threshold is at risk; a candidate above this size needs the author's benchmark
SEARCH_INDEX_MAX_BYTES = 4_600_000
CF_MAX_FILES, CF_MAX_FILE_BYTES = 20_000, 25 * 1024 * 1024
MANIFEST, ARCHIVE = "manifest.json", "world.tar.xz"
# raw-record columns that must never reach a published file, whatever the policy of their source says
NEVER_PUBLISHED = ("source_article", "source_headline", "source_office", "source_original")
USER_AGENT = "NEXUM-pipeline (+https://github.com/pezzaliapp/NEXUM)"


class Stop(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ro(db):
    return sqlite3.connect(f"file:{db}?mode=ro", uri=True)


def world_version(db) -> int:
    with ro(db) as c:
        return int(c.execute("SELECT value FROM meta WHERE key='world_version'").fetchone()[0])


def source_days(db) -> dict:
    with ro(db) as c:
        return {s: ms for s, ms in c.execute("SELECT source_id, last_success_ms FROM source_health ORDER BY 1")}


# ── reference world ──────────────────────────────────────────────────────────
def pack(world: pathlib.Path, out: pathlib.Path, label: str) -> dict:
    """Write <out>/world.tar.gz (a consistent copy of the database + the Raw Store) and <out>/manifest.json."""
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out) as tmp:
        db = pathlib.Path(tmp) / "nexum.db"
        src = sqlite3.connect(f"file:{world / 'nexum.db'}?mode=ro", uri=True)
        dst = sqlite3.connect(db)
        src.backup(dst)                     # a consistent copy, whatever the WAL holds; the source is only read
        dst.execute("PRAGMA journal_mode=DELETE")
        dst.close()
        src.close()
        wv, db_sha, db_bytes, days = world_version(db), sha256(db), db.stat().st_size, source_days(db)
        raw_files = sum(1 for p in (world / "raw").rglob("*") if p.is_file())
        tar = pathlib.Path(tmp) / "world.tar"
        with tarfile.open(tar, "w") as t:
            t.add(db, arcname="nexum.db")
            t.add(world / "raw", arcname="raw")
            if (world / "basemap").is_dir():
                t.add(world / "basemap", arcname="basemap")   # derived from the raw boundaries; kept for identity
        db.unlink()
        _xz(tar, out / ARCHIVE)
        m = {"format": 2, "label": label, "created_utc": now_utc(), "world_version": wv,
             "db_sha256": db_sha, "db_bytes": db_bytes, "raw_files": raw_files,
             "archive": ARCHIVE, "archive_sha256": sha256(out / ARCHIVE), "archive_bytes": (out / ARCHIVE).stat().st_size,
             "sources_last_success_ms": days}
    (out / MANIFEST).write_text(json.dumps(m, indent=1, sort_keys=True))
    return m


def _xz(src: pathlib.Path, dst: pathlib.Path):
    """xz, multithreaded with the system's xz when present (same format), the standard library otherwise."""
    if shutil.which("xz"):
        with open(dst, "wb") as fh:
            subprocess.run(["xz", "-T0", "-6", "-c", str(src)], stdout=fh, check=True)
    else:
        import lzma
        with open(src, "rb") as fi, lzma.open(dst, "wb", preset=6) as fo:
            shutil.copyfileobj(fi, fo, 1 << 22)


def restore(seed: pathlib.Path, target: pathlib.Path = LIVE) -> dict:
    """Unpack a verified reference world into data/live. Never overwrites a world, never starts from nothing."""
    if not (seed / MANIFEST).is_file() or not (seed / ARCHIVE).is_file():
        raise Stop(3, f"no reference world in {seed}: stop (the world is never rebuilt from scratch)")
    m = json.loads((seed / MANIFEST).read_text())
    if sha256(seed / ARCHIVE) != m["archive_sha256"]:
        raise Stop(4, "reference world archive: checksum mismatch")
    if target.exists():
        raise Stop(5, f"{target} already exists: a world is never overwritten")
    part = target.with_name(target.name + ".partial")
    shutil.rmtree(part, ignore_errors=True)
    part.mkdir(parents=True)
    with tarfile.open(seed / ARCHIVE, "r:xz") as t:
        t.extractall(part, filter="data")   # no absolute paths, links or devices
    db = part / "nexum.db"
    if not db.is_file() or sha256(db) != m["db_sha256"]:
        shutil.rmtree(part)
        raise Stop(4, "reference world database: checksum mismatch")
    with ro(db) as c:
        qc = c.execute("PRAGMA quick_check").fetchone()[0]
    if qc != "ok" or world_version(db) != m["world_version"]:
        shutil.rmtree(part)
        raise Stop(4, f"reference world database: integrity {qc}, version {world_version(db)} ≠ {m['world_version']}")
    part.rename(target)
    return m


# ── fingerprints and checks ──────────────────────────────────────────────────
def fingerprint(db) -> dict:
    c = ro(db)

    def fp(sql, args=()):
        h, n = hashlib.sha256(), 0
        for row in c.execute(sql, args):
            h.update(repr(row).encode())
            n += 1
        return [n, h.hexdigest()]

    out = {"world_version": world_version(db), "objects": {}, "events": {}, "relations": {}}
    for (s,) in c.execute("SELECT DISTINCT source_id FROM object ORDER BY 1").fetchall():
        out["objects"][s] = fp("SELECT * FROM object WHERE source_id IS ? ORDER BY object_id", (s,))
    for (s,) in c.execute("SELECT DISTINCT source_id FROM event ORDER BY 1").fetchall():
        out["events"][s] = fp("SELECT * FROM event WHERE source_id IS ? ORDER BY event_id", (s,))
    for (t,) in c.execute("SELECT DISTINCT type FROM relation ORDER BY 1").fetchall():
        out["relations"][t] = fp("SELECT * FROM relation WHERE type=? ORDER BY relation_id", (t,))
    out["counts"] = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                     for t in ("object", "event", "relation", "claim", "evidence", "identifier", "record", "raw_record")}
    c.close()
    return out


def checks(db, before: dict, after: dict, allow: tuple) -> list:
    """Every failure as a sentence; an empty list is a pass."""
    bad = []
    if after["world_version"] < before["world_version"]:
        bad.append(f"world version went back: {before['world_version']} → {after['world_version']}")
    for part in ("objects", "events"):
        for s in sorted(set(before[part]) | set(after[part])):
            b, a = before[part].get(s, [0, None]), after[part].get(s, [0, None])
            if s in allow:
                if a[0] < b[0]:
                    bad.append(f"{part} of {s}: {b[0]} → {a[0]} (a loss)")
            elif a != b:
                bad.append(f"{part} of {s} changed ({b[0]} → {a[0]}): only {', '.join(allow)} may change")
    for t in sorted(set(before["relations"]) | set(after["relations"])):
        b, a = before["relations"].get(t, [0, None]), after["relations"].get(t, [0, None])
        if a[0] < b[0]:
            bad.append(f"relations {t}: {b[0]} → {a[0]} (a loss)")
    for t, n in before["counts"].items():
        if after["counts"][t] < n:
            bad.append(f"table {t}: {n} → {after['counts'][t]} (a loss)")
    c = ro(db)
    dup = c.execute("SELECT scheme, value, COUNT(DISTINCT entity_id) n FROM identifier GROUP BY 1, 2 HAVING n > 1 "
                    "LIMIT 5").fetchall()
    if dup:
        bad.append(f"identifiers on more than one element: {dup}")
    v0 = before["world_version"]
    tomorrow = int((time.time() + 86400) * 1000)
    fut = c.execute("SELECT COUNT(*) FROM event WHERE world_version > ? AND t_start_ms > ?", (v0, tomorrow)).fetchone()[0]
    if fut:
        bad.append(f"{fut} new or changed events dated in the future")
    q = f"SELECT COUNT(*) FROM event WHERE world_version > ? AND (prov_id IS NULL OR source_id NOT IN ({','.join('?' * len(allow))}))"
    orphan = c.execute(q, (v0, *allow)).fetchone()[0]
    if orphan:
        bad.append(f"{orphan} new or changed events without provenance or from a source outside the allowlist")
    q = f"SELECT COUNT(*) FROM object WHERE world_version > ? AND source_id NOT IN ({','.join('?' * len(allow))})"
    moved = c.execute(q, (v0, *allow)).fetchone()[0]
    if moved:
        bad.append(f"{moved} objects of other sources written in this run")
    c.close()
    return bad


# ── phases ───────────────────────────────────────────────────────────────────
def sh(cmd, cwd=ROOT, timeout=None, env=None):
    t0 = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    return p.returncode, p.stdout, p.stderr, round(time.time() - t0, 1)


def acquire(sources, break_sources=()) -> dict:
    out = {}
    for s in sources:
        steps = []
        for mode in MODES.get(s, ("incremental",)):
            env = dict(os.environ)
            if s in break_sources:          # recovery test only: this source cannot reach the network
                env.update(HTTPS_PROXY="http://127.0.0.1:9", HTTP_PROXY="http://127.0.0.1:9")
            try:
                rc, so, se, secs = sh([sys.executable, "-m", "nexum.cli", "live", "fetch", "--source", s, "--mode", mode],
                                      timeout=FETCH_TIMEOUT_S, env=env)
            except subprocess.TimeoutExpired:
                steps.append({"mode": mode, "status": "failed", "error": f"timeout after {FETCH_TIMEOUT_S} s"})
                continue
            summary = None
            try:
                summary = json.loads(so).get(s)
            except (ValueError, AttributeError):
                pass
            if rc != 0 or summary is None or "skipped" in summary:
                steps.append({"mode": mode, "status": "failed", "seconds": secs,
                              "error": (se.strip().splitlines() or [str(summary)])[-1][:300]})
                continue
            errs = _fetch_errors(s, summary)
            status = ("failed" if errs and not summary.get("requests") else
                      "deferred" if summary.get("deferred") and not summary.get("requests") else "ok")
            steps.append({"mode": mode, "status": status, "seconds": secs, **summary, **({"errors": errs} if errs else {})})
        st = [x["status"] for x in steps]
        out[s] = {"status": "ok" if "ok" in st else "deferred" if "deferred" in st else "failed", "steps": steps}
    return out


def _fetch_errors(source, summary):
    """Errors recorded by the scheduler for this source in this process (HTTP failures are logged, not raised)."""
    n = summary.get("requests", 0) + summary.get("deferred", 0)
    if not n:
        return []
    with ro(LIVE / "nexum.db") as c:
        rows = c.execute("SELECT http_status, error FROM fetch_log WHERE source_id=? ORDER BY requested_ms DESC LIMIT ?",
                         (source, summary.get("requests", 0))).fetchall()
    return [f"{st} {e}"[:200] for st, e in rows if e]


def snapshot_and_assemble(res: dict, npm_ci=True) -> dict:
    """Fills `res` step by step (the report keeps what ran, also when a step fails)."""
    for name, cmd, cwd in (
            ("snapshot", [sys.executable, "-m", "nexum.snapshot", "build", "live", "--out", str(SNAP)], ROOT),
            ("parity", [sys.executable, "-m", "nexum.snapshot", "parity", "live", "--out", str(SNAP)], ROOT),
            ("bundles", [sys.executable, "-m", "nexum.snapshot", "parity", "live", "--out", str(SNAP), "--bundles"], ROOT),
            *((("npm_ci", ["npm", "ci", "--no-audit", "--no-fund"], ROOT / "ui"),) if npm_ci else ()),
            ("licences", ["npm", "run", "-s", "licenses"], ROOT / "ui"),
            ("web_build", ["npm", "run", "-s", "build:web"], ROOT / "ui"),
            ("browser_parity", ["node", "tests/parity/run.ts", str(SNAP / "live")], ROOT / "ui"),
            ("assemble", ["node", "scripts/assemble-web.mjs", "--snapshot", str(SNAP / "live"), "--out", str(WEB)], ROOT / "ui")):
        rc, so, se, secs = sh(cmd, cwd=cwd)
        res[name] = {"rc": rc, "seconds": secs, "tail": (so.strip().splitlines() or [""])[-1][:400]}
        if rc != 0:
            res[name]["stderr"] = se.strip()[-1500:]
            raise Stop(8, f"{name} failed (exit {rc})")
        if name == "bundles" and json.loads(so.strip().splitlines()[-1]).get("n_different") != 0:
            raise Stop(8, "bundles differ from the service")
        if name == "browser_parity" and '"failures": []' not in so:
            raise Stop(8, "browser read model differs from the service")
        if name == "assemble":
            a = json.loads(so.strip().splitlines()[-1])
            res["assembled"] = a
    files = [p for p in WEB.rglob("*") if p.is_file()]
    biggest = max(p.stat().st_size for p in files)
    idx = next(WEB.glob("s/*/search.sqlite.jgz")).stat().st_size
    res["limits"] = {"files": len(files), "biggest_bytes": biggest, "search_index_bytes": idx}
    if len(files) > CF_MAX_FILES or biggest > CF_MAX_FILE_BYTES:
        raise Stop(8, f"Cloudflare Free limits: {len(files)} files, largest {biggest} bytes")
    if idx > SEARCH_INDEX_MAX_BYTES:
        raise Stop(8, f"search index {idx} bytes > {SEARCH_INDEX_MAX_BYTES}: the author's O9 benchmark is required")
    return res


def _policy():
    """The exposure policy of raw records, read exactly as the API reads it."""
    sys.path.insert(0, str(ROOT))
    from nexum import worlds
    from nexum.api.server import raw_fields
    from nexum.core.registry import load_registry
    cfg = worlds.live()
    return raw_fields(load_registry([pathlib.Path(cfg.root) / d for d in cfg.source_dirs]))


def exposure_check(snap_live: pathlib.Path) -> dict:
    """Every published raw record: within its source's policy, and never a column of NEVER_PUBLISHED."""
    import gzip
    pol = _policy()
    cur = json.loads((snap_live / "current.json").read_text())
    n, bad = 0, []
    for f in sorted((snap_live / "s" / cur["version"] / "raw").glob("*.jgz")):
        for key, (st, body) in json.loads(gzip.decompress(f.read_bytes())).items():
            if st != 200:
                continue
            d = body["data"]
            rec = d["record"]
            n += 1
            keys = set(rec) if isinstance(rec, dict) else set()
            extra = keys - pol[d["source_id"]] if d["source_id"] in pol else set()
            never = keys & set(NEVER_PUBLISHED) or {c for c in NEVER_PUBLISHED if isinstance(rec, str) and c in rec}
            if extra or never:
                bad.append(f"{d['source_id']} {key}: {sorted(extra | never)[:5]}")
    if bad:
        raise Stop(8, f"{len(bad)} published raw records beyond the exposure policy, e.g. {bad[0]}")
    return {"raw_records": n, "beyond_policy": 0}


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def production_check(url: str, snap_live: pathlib.Path) -> dict:
    """The site in production vs the candidate: same or newer world, and no type with fewer elements."""
    try:
        pc = _get_json(url.rstrip("/") + "/current.json")
        ps = _get_json(url.rstrip("/") + pc["base"] + "api/status.json")
    except Exception as e:                  # cannot be verified: never published blind
        raise Stop(8, f"production not readable ({e}): nothing is published without the comparison")
    cc = json.loads((snap_live / "current.json").read_text())
    cs = json.loads((snap_live / "s" / cc["version"] / "api" / "status.json").read_text())
    pt, ct = (ps.get("data", ps).get("by_type", {}), cs.get("data", cs).get("by_type", {}))
    fewer = {t: [n, ct.get(t, 0)] for t, n in pt.items() if ct.get(t, 0) < n}
    res = {"production": pc["version"], "candidate": cc["version"], "fewer": fewer,
           "world_version": [pc.get("world_version"), cc["world_version"]]}
    if fewer or cc["world_version"] < (pc.get("world_version") or 0):
        raise Stop(8, f"the candidate has less than production: {fewer or res['world_version']}")
    return res


def run(a) -> int:
    allow = tuple(x for x in (a.sources or ",".join(PHASE1)).split(",") if x)
    out = pathlib.Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    rep = {"started_utc": now_utc(), "mode": "publish" if a.publish else "update", "sources": list(allow), "phases": {}}

    def finish(code, message):
        rep.update(finished_utc=now_utc(), exit=code, outcome=message)
        (out / "report.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False, default=str))
        print(json.dumps({"exit": code, "outcome": message}))
        return code

    try:
        m = restore(pathlib.Path(a.seed).resolve())
        rep["reference"] = {k: m[k] for k in ("label", "created_utc", "world_version", "archive_sha256")}
        db = LIVE / "nexum.db"
        before = fingerprint(db)
        days_before = source_days(db)
        # A. acquisition
        acq = acquire(allow, tuple(x for x in (a.test_break or "").split(",") if x))
        # the Core suspends a source after 5 consecutive errors and never resumes it by itself (a protection of the
        # sources): a suspended source is said, never hidden as "deferred", and only the author resumes it
        with ro(db) as c:
            health = dict(c.execute("SELECT source_id, state FROM source_health").fetchall())
        for s in allow:
            if health.get(s) == "suspended":
                acq[s]["status"] = "suspended"
        rep["phases"]["acquisition"] = acq
        attention = {s: v["status"] for s, v in acq.items() if v["status"] in ("failed", "suspended")}
        if attention:                       # the run goes on with the other sources; the workflow signals this file
            (out / "attention.json").write_text(json.dumps(attention, indent=1))
        if all(v["status"] in ("failed", "suspended") for v in acq.values()):
            raise Stop(9, "every source failed: nothing to process")
        # B. processing (the Core's own command)
        rc, so, se, secs = sh([sys.executable, "-m", "nexum.cli", "live", "process"], timeout=3600)
        rep["phases"]["processing"] = {"rc": rc, "seconds": secs}
        if rc != 0:
            rep["phases"]["processing"]["stderr"] = se.strip()[-1500:]
            raise Stop(6, "processing failed")
        if a.test_inject_loss:              # recovery test only: a loss the checks must catch
            if os.environ.get("NEXUM_EVENTS_TEST") != "1":
                raise Stop(2, "--test-inject-loss needs NEXUM_EVENTS_TEST=1")
            with sqlite3.connect(db) as c:
                c.execute("DELETE FROM object WHERE object_id=(SELECT object_id FROM object WHERE source_id=? LIMIT 1)",
                          (a.test_inject_loss,))
        # C. checks
        after = fingerprint(db)
        bad = checks(db, before, after, allow)
        days_after = source_days(db)
        rep["phases"]["checks"] = {"failures": bad, "world_version": [before["world_version"], after["world_version"]],
                                   "events": {s: [before["events"].get(s, [0])[0], after["events"].get(s, [0])[0]] for s in allow},
                                   "sources_last_success_ms": {s: [days_before.get(s), days_after.get(s)] for s in allow}}
        if bad:
            raise Stop(7, f"{len(bad)} checks failed: nothing is written")
        if after["world_version"] > before["world_version"]:
            nm = pack(LIVE, out / "seed", label=f"world-{after['world_version']}")
            rep["reference_out"] = {k: nm[k] for k in ("label", "world_version", "archive_sha256", "archive_bytes")}
        if not a.publish:
            return finish(0, "reference world updated" if "reference_out" in rep else
                          "nothing new: the reference world stays as it is")
        # D. snapshot, parity, assembly, exposure, production
        snapshot_and_assemble(rep["phases"].setdefault("snapshot", {}), npm_ci=not a.no_npm_ci)
        rep["phases"]["exposure"] = exposure_check(SNAP / "live")
        if a.production_url:
            rep["phases"]["production"] = production_check(a.production_url, SNAP / "live")
        cur = json.loads((WEB / "current.json").read_text())
        build = json.loads((WEB / "version.json").read_text()).get("build")
        site = {"version": cur["version"], "world_version": cur["world_version"], "built_utc": cur["built_utc"],
                "build": build}
        (out / "site.json").write_text(json.dumps(site, indent=1))
        rep["site"] = site
        return finish(0, f"site {cur['version']} (build {build}) assembled and checked: ready to deploy")
    except Stop as e:
        return finish(e.code, str(e))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexum-events")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pack")
    p.add_argument("--world", default=str(LIVE))
    p.add_argument("--out", required=True)
    p.add_argument("--label", default="manual")
    r = sub.add_parser("restore")
    r.add_argument("--seed", required=True)
    x = sub.add_parser("run")
    x.add_argument("--seed", required=True)
    x.add_argument("--out", required=True)
    x.add_argument("--sources", default="")
    x.add_argument("--publish", action="store_true", help="also build, check and assemble the site (daily)")
    x.add_argument("--production-url", default="", help="the site in production: no type may have fewer elements")
    x.add_argument("--no-npm-ci", action="store_true", help="use the installed ui/node_modules (local tests)")
    x.add_argument("--test-break", default="", help="recovery test: sources whose network is cut")
    x.add_argument("--test-inject-loss", default="", help="recovery test: delete one object of this source")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "pack":
            print(json.dumps(pack(pathlib.Path(a.world).resolve(), pathlib.Path(a.out).resolve(), a.label), indent=1))
            return 0
        if a.cmd == "restore":
            print(json.dumps(restore(pathlib.Path(a.seed).resolve()), indent=1))
            return 0
        return run(a)
    except Stop as e:
        print(json.dumps({"exit": e.code, "outcome": str(e)}))
        return e.code


if __name__ == "__main__":
    sys.exit(main())
