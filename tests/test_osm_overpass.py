"""OSM extracts (master pass): the connector publishes compact tables — cables with a simplified course, naval bases
with name and operator only (no other tag ever kept)."""
import json

from connectors import osm_overpass as m


def test_cables_table_simplified_and_typed():
    line = [{"lon": 10 + i * 0.001, "lat": 40 + (i % 2) * 0.00001} for i in range(500)]   # nearly straight: few points kept
    els = [{"type": "way", "id": 7, "tags": {"name": "C1", "communication": "line", "location": "underwater", "operator": "Op"}, "geometry": line},
           {"type": "way", "id": 8, "tags": {"power": "cable", "location": "underwater"}, "geometry": line[:2]},
           {"type": "way", "id": 9, "tags": {}, "geometry": [{"lon": 1, "lat": 1}]}]                                  # one point: dropped
    t = m.table([("osm_cables", json.dumps({"elements": els}).encode(), 0, "")])
    assert t["fields"] == ["osm_way", "name", "kind", "operator", "course"]
    assert [r[0] for r in t["rows"]] == [7, 8]
    assert t["rows"][0][2] == "telecom" and t["rows"][1][2] == "power" and t["rows"][0][3] == "Op"
    assert 2 <= len(t["rows"][0][4]) < 20


def test_naval_table_keeps_only_name_and_operator():
    els = [{"type": "node", "id": 1, "lat": 36.95, "lon": -76.33, "tags": {"name": "Base", "operator": "Navy", "phone": "PHONE-SENTINEL", "website": "WEB-SENTINEL"}},
           {"type": "way", "id": 2, "center": {"lat": 1.0, "lon": 2.0}, "tags": {"name:en": "Other"}}]
    t = m.table([("osm_navalbases", json.dumps({"elements": els}).encode(), 0, "")])
    assert t["fields"] == ["osm_type", "osm_id", "name", "operator", "lon", "lat"]
    assert t["rows"] == [["node", 1, "Base", "Navy", -76.33, 36.95], ["way", 2, "Other", "", 2.0, 1.0]]
    assert "SENTINEL" not in json.dumps(t["rows"])
