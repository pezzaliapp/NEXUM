"""Physical acceptance (2026-10-06): the published tables behind the news card and the sea routes.
GDELT: actor NAMES never kept (codes only), the mentions export adds the other articles of the same event, older stores
(exports only) still read. MARNET: sections read from a GeoPackage, joined only where the network does not branch."""

import io
import sqlite3
import struct
import tempfile
import zipfile

from connectors import gdelt_events as g
from connectors import searoute_marnet as m


def _zip(rows):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("x.CSV", "\n".join("\t".join(r) for r in rows))
    return b.getvalue()


def _event(eid, url, actor1_name="JOHN DOE", root="14", code="141"):
    r = [""] * 61
    r[0], r[5], r[6], r[7], r[12] = eid, "CVL", actor1_name, "ITA", "CVL"
    r[15], r[16], r[17], r[22] = "GOV", "GOVERNMENT", "ITA", "GOV"
    r[25], r[26], r[28], r[29] = "1", code, root, "3"
    r[30], r[31], r[32], r[33], r[34] = "-6.5", "5", "2", "4", "-3.2"
    r[52], r[56], r[57], r[58], r[59], r[60] = "Rome, Lazio, Italy", "41.9", "12.5", "-126693", "20261006151500", url
    return r


def test_gdelt_codes_not_names_and_mentions():
    ex = _zip([_event("1", "https://a.example/2026/10/06/protest-in-rome-over-budget/")])
    me = _zip([["1", "", "20261006151500", "1", "b.example", "https://b.example/rome-protest-budget-cuts"],
               ["1", "", "20261006151500", "2", "tv", "tv-broadcast-id"],                 # not web: left out
               ["2", "", "20261006151500", "1", "c.example", "https://c.example/other"]])   # another event
    t = g.table([("gdelt_export_20261006151500", ex, 1, ""), ("gdelt_mentions_20261006151500", me, 1, "")])
    assert t["notes"]["mentions"] is True
    row = dict(zip(t["fields"], t["rows"][0]))
    assert "JOHN DOE" not in repr(t)                                    # a name never leaves the connector
    assert (row["actor1_country"], row["actor1_role"], row["actor2_role"]) == ("ITA", "CVL", "GOV")
    assert (row["sources"], row["articles"], row["mentions"]) == (2, 4, 5)
    assert row["links"] == ["https://a.example/2026/10/06/protest-in-rome-over-budget/", "https://b.example/rome-protest-budget-cuts"]


def test_gdelt_old_store_without_kinds_still_reads():
    ex = _zip([_event("1", "https://a.example/x")])
    t = g.table([("gdelt_export_20261004180000", ex, 1, "")])
    assert len(t["rows"]) == 1 and t["notes"]["mentions"] is False


def _gpkg(lines):
    """A minimal GeoPackage: one feature table of LineStrings (WKB, little endian) with a 'pass' column."""
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE gpkg_contents (table_name TEXT, data_type TEXT)")
    con.execute("CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT)")
    con.execute("INSERT INTO gpkg_contents VALUES ('type', 'features')")
    con.execute("INSERT INTO gpkg_geometry_columns VALUES ('type', 'geometry')")
    con.execute('CREATE TABLE "type" (fid INTEGER PRIMARY KEY, geometry BLOB, pass TEXT)')
    for pts, ps in lines:
        wkb = struct.pack("<BII", 1, 2, len(pts)) + b"".join(struct.pack("<dd", *p) for p in pts)
        con.execute('INSERT INTO "type" (geometry, pass) VALUES (?, ?)', (b"GP\x00\x01" + struct.pack("<i", 4326) + wkb, ps))
    con.commit()
    with tempfile.NamedTemporaryFile(suffix=".gpkg") as f:
        disk = sqlite3.connect(f.name)
        con.backup(disk)
        disk.close()
        return open(f.name, "rb").read()


def test_marnet_sections_joined_only_where_the_network_does_not_branch():
    data = _gpkg([([(0, 0), (1, 0)], None), ([(1, 0), (2, 0)], None),            # a chain: one line
                  ([(2, 0), (3, 1)], None), ([(2, 0), (3, -1)], None),            # a branch at (2, 0): kept apart
                  ([(32, 30), (32.5, 30.5)], "suez")])
    t = m.table([("marnet_50km", data, 1, "")])
    rows = t["rows"]
    assert t["fields"] == ["pass", "course"]
    assert ["suez", [[32.0, 30.0], [32.5, 30.5]]] in rows
    courses = sorted(r[1] for r in rows if r[0] == "")
    assert [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]] in courses and len(courses) == 3
    assert t["notes"]["represents"].startswith("theoretical navigable network")
    assert t["notes"]["licence"]["id"] == "EUPL-1.2"


def test_marnet_a_canal_meeting_the_sea_stays_connected():
    # two open-sea sections meet a canal at (1, 0): three sections at that point — none joined across it
    data = _gpkg([([(0, 0), (1, 0)], None), ([(1, 0), (2, 0)], None), ([(1, 0), (1, 1)], "suez")])
    t = m.table([("marnet_50km", data, 1, "")])
    ends = {tuple(p) for r in t["rows"] for p in (r[1][0], r[1][-1])}
    assert (1.0, 0.0) in ends and len(t["rows"]) == 3
