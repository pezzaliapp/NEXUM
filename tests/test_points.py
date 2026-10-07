"""Point layers (2026-10-05, physical acceptance #1): GET /types/<type>/points lists EVERY element of a point type —
position, the value of one property, source — so the map clusters all of them; nothing is dropped or invented."""

import sqlite3

from nexum.snapshot.service import LocalService


def test_type_points_lists_every_point_with_its_status():
    ls = LocalService("d1")
    conn = sqlite3.connect(f"file:{ls.cfg.db_path}?mode=ro", uri=True)
    t = conn.execute("SELECT type, COUNT(*) FROM object WHERE lon IS NOT NULL AND status != 'retracted' AND merged_into IS NULL "
                     "GROUP BY type ORDER BY 2 DESC LIMIT 1").fetchone()
    st, body = ls.get(f"/types/{t[0]}/points", {"status": "iata_code"})
    assert st == 200
    d = body["data"]
    assert len(d["rows"]) == t[1]                                         # every point, none dropped
    assert d["fields"] == ["lon", "lat", "status", "source"]
    vals = {r[0] for r in conn.execute("SELECT json_extract(props_json, '$.iata_code') FROM object WHERE type = ?", (t[0],))}
    assert set(d["status_values"]) <= vals                                # values as the data hold them
    assert all(-180 <= r[0] <= 180 and -90 <= r[1] <= 90 for r in d["rows"])
    st, _ = ls.get("/types/nope.none/points")
    assert st == 404
    st, _ = ls.get(f"/types/{t[0]}/points", {"status": "bad-name;"})
    assert st == 400
