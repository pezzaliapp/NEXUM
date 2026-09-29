"""TRAIL DB (decision D5): the user's investigative path, separate from the WORLD DB.

WORLD DB = what NEXUM knows. TRAIL DB = the user's path through it.
Trails hold stable references (IDs) and scopes, never copies of world
elements, and never modify Objects, Events, Relations, Evidence or Insights.
"""

import json
import re
import sqlite3
import threading
import time

FORMAT = "nexum-trail"
FORMAT_VERSION = 1
MAX_STEPS = 500
TRAIL_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
REF_ID = re.compile(r"^(obj|evt|rel|ins)_[a-z0-9]{1,40}$")


class TrailError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def _now():
    return int(time.time() * 1000)


class TrailStore:
    def __init__(self, path, world_id):
        self.path, self.world_id = str(path), world_id
        self._lock = threading.Lock()
        self._conn = None

    def _db(self):
        if self._conn is None:
            c = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("CREATE TABLE IF NOT EXISTS trail(trail_id TEXT PRIMARY KEY, name TEXT NOT NULL, "
                      "world_id TEXT NOT NULL, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL, "
                      "steps_json TEXT NOT NULL) STRICT")
            self._conn = c
        return self._conn

    @staticmethod
    def _validate(body):
        if not isinstance(body, dict):
            raise TrailError(400, "invalid_body", "trail must be a JSON object")
        name = body.get("name") or "Indagine"
        if not isinstance(name, str) or len(name) > 200:
            raise TrailError(400, "invalid_body", "name must be a string of at most 200 characters")
        steps = body.get("steps")
        if not isinstance(steps, list) or len(steps) > MAX_STEPS:
            raise TrailError(400, "invalid_body", f"steps must be a list of at most {MAX_STEPS} items")
        clean = []
        for s in steps:
            if not isinstance(s, dict) or not isinstance(s.get("ref"), str) or not REF_ID.match(s["ref"]):
                raise TrailError(400, "invalid_body", "each step needs a stable ref id")
            scope = s.get("scope")
            if scope is not None and not isinstance(scope, dict):
                raise TrailError(400, "invalid_body", "step scope must be an object")
            note = s.get("note")
            if note is not None and (not isinstance(note, str) or len(note) > 2000):
                raise TrailError(400, "invalid_body", "note must be a string of at most 2000 characters")
            clean.append({"ref": s["ref"], "scope": scope, "added_ms": int(s.get("added_ms") or _now()),
                          "label": str(s.get("label") or "")[:300], "kind": str(s.get("kind") or "")[:20],
                          **({"note": note} if note else {})})
        return name, clean

    def _get(self, tid):
        r = self._db().execute("SELECT trail_id, name, world_id, created_ms, updated_ms, steps_json FROM trail "
                               "WHERE trail_id=?", (tid,)).fetchone()
        if r is None:
            raise TrailError(404, "not_found", f"trail {tid} not found")
        return {"trail_id": r[0], "name": r[1], "world_id": r[2], "created_ms": r[3], "updated_ms": r[4],
                "steps": json.loads(r[5])}

    def handle(self, method, sub, body):
        with self._lock:
            db = self._db()
            if sub in ("", "/") and method == "GET":
                rows = db.execute("SELECT trail_id, name, updated_ms, json_array_length(steps_json) FROM trail "
                                  "WHERE world_id=? ORDER BY updated_ms DESC LIMIT 200", (self.world_id,)).fetchall()
                return 200, {"data": {"items": [{"trail_id": a, "name": b, "updated_ms": c, "steps": d}
                                                for a, b, c, d in rows]}}
            if sub == "/import" and method == "POST":
                if not isinstance(body, dict) or body.get("format") != FORMAT:
                    raise TrailError(400, "invalid_body", "not a NEXUM trail export")
                if body.get("version") != FORMAT_VERSION:
                    raise TrailError(400, "invalid_body", f"unsupported trail format version {body.get('version')}")
                t = body.get("trail") or {}
                name, steps = self._validate(t)
                tid = t.get("trail_id") if isinstance(t.get("trail_id"), str) and TRAIL_ID.match(t["trail_id"]) else None
                if tid is None or db.execute("SELECT 1 FROM trail WHERE trail_id=?", (tid,)).fetchone():
                    tid = f"imp-{_now():x}"
                now = _now()
                db.execute("INSERT INTO trail VALUES(?,?,?,?,?,?)", (tid, name, self.world_id,
                                                                     int(t.get("created_ms") or now), now,
                                                                     json.dumps(steps, ensure_ascii=False)))
                return 201, {"data": self._get(tid)}
            m = re.fullmatch(r"/([a-z0-9][a-z0-9-]{0,39})(/export)?", sub)
            if not m:
                raise TrailError(404, "not_found", "no such trail endpoint")
            tid, export = m.group(1), bool(m.group(2))
            if export and method == "GET":
                return 200, {"format": FORMAT, "version": FORMAT_VERSION, "exported_ms": _now(),
                             "trail": self._get(tid)}
            if export:
                raise TrailError(405, "method_not_allowed", "export is read-only")
            if method == "GET":
                return 200, {"data": self._get(tid)}
            if method == "PUT":
                name, steps = self._validate(body)
                now = _now()
                db.execute("INSERT INTO trail VALUES(?,?,?,?,?,?) ON CONFLICT(trail_id) DO UPDATE SET "
                           "name=excluded.name, updated_ms=excluded.updated_ms, steps_json=excluded.steps_json",
                           (tid, name, self.world_id, now, now, json.dumps(steps, ensure_ascii=False)))
                return 200, {"data": self._get(tid)}
            if method == "DELETE":
                self._get(tid)
                db.execute("DELETE FROM trail WHERE trail_id=?", (tid,))
                return 200, {"data": {"deleted": tid}}
            raise TrailError(405, "method_not_allowed", "method not allowed")
