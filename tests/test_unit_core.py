"""Unit tests: identifiers, time, geometry (P16), confidence, registry, types."""

import datetime as dt
import math
import pathlib
import random

import pytest

from nexum.core import confidence as cf
from nexum.core import geo
from nexum.core.ids import det_id, ulid
from nexum.core.registry import RegistryError, admissible, load_source
from nexum.core.timeutil import human_delta, month_index, month_start_ms, parse_duration, parse_iso
from nexum.core.types import VocabError, load_types


def vincenty_km(lon1, lat1, lon2, lat2):
    """Reference: geodesic distance on the WGS84 ellipsoid (Vincenty inverse)."""
    a, f = 6378137.0, 1 / 298.257223563
    b = (1 - f) * a
    L = math.radians(lon2 - lon1)
    U1, U2 = math.atan((1 - f) * math.tan(math.radians(lat1))), math.atan((1 - f) * math.tan(math.radians(lat2)))
    sU1, cU1, sU2, cU2 = math.sin(U1), math.cos(U1), math.sin(U2), math.cos(U2)
    lam = L
    for _ in range(200):
        sl, cl = math.sin(lam), math.cos(lam)
        ss = math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2)
        if ss == 0:
            return 0.0
        cs = sU1 * sU2 + cU1 * cU2 * cl
        sig = math.atan2(ss, cs)
        sa = cU1 * cU2 * sl / ss
        c2a = 1 - sa * sa
        c2sm = cs - 2 * sU1 * sU2 / c2a if c2a else 0.0
        C = f / 16 * c2a * (4 + f * (4 - 3 * c2a))
        lp = lam
        lam = L + (1 - C) * f * sa * (sig + C * ss * (c2sm + C * cs * (-1 + 2 * c2sm * c2sm)))
        if abs(lam - lp) < 1e-12:
            break
    u2 = c2a * (a * a - b * b) / (b * b)
    A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
    B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
    ds = B * ss * (c2sm + B / 4 * (cs * (-1 + 2 * c2sm ** 2) - B / 6 * c2sm * (-3 + 4 * ss ** 2) * (-3 + 4 * c2sm ** 2)))
    return b * A * (sig - ds) / 1000.0


def test_p16_haversine_error_below_half_percent():
    rnd = random.Random(16)
    pairs = [(12.49, 41.90, 9.19, 45.46), (95.936, 22.011, 95.978, 21.702), (-0.1, 51.5, 2.35, 48.86),
             (139.69, 35.69, 151.21, -33.87), (-74.0, 40.7, -118.2, 34.05)]
    while len(pairs) < 40:
        lon1, lat1 = rnd.uniform(-180, 180), rnd.uniform(-80, 80)
        lon2, lat2 = lon1 + rnd.uniform(-5, 5), max(-85, min(85, lat1 + rnd.uniform(-5, 5)))
        pairs.append((lon1, lat1, lon2, lat2))
    worst = 0.0
    for p in pairs:
        ref = vincenty_km(*p)
        if ref > 1:
            worst = max(worst, abs(geo.haversine_km(*p) - ref) / ref)
    assert len(pairs) >= 30
    assert worst < 0.005, worst


def test_expand_point_antimeridian_and_pole():
    boxes = geo.expand_point_km(179.9, 0.0, 100)
    assert len(boxes) == 2 and boxes[0][1] == 180.0 and boxes[1][0] == -180.0
    assert geo.expand_point_km(0.0, 89.5, 200) == [(-180.0, 180.0, 87.70, 90.0)] or \
        geo.expand_point_km(0.0, 89.5, 200)[0][:2] == (-180.0, 180.0)
    # every point of the circle is inside the boxes
    for lon0, lat0 in ((179.9, 10.0), (-179.95, -30.0), (10.0, 60.0)):
        for ang in range(0, 360, 15):
            d = 99.0 / geo.KM_PER_DEG_LAT
            lat = lat0 + d * math.cos(math.radians(ang))
            lon = lon0 + d * math.sin(math.radians(ang)) / math.cos(math.radians(lat))
            lon = (lon + 180) % 360 - 180
            assert any(x0 <= lon <= x1 and y0 <= lat <= y1 for x0, x1, y0, y1 in geo.expand_point_km(lon0, lat0, 100))


def test_point_in_polygon_with_hole_and_distance():
    sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
    a = geo.PreparedArea({"type": "Polygon", "coordinates": [sq, hole]})
    assert a.contains(1, 1) and not a.contains(5, 5) and not a.contains(11, 5)
    assert a.distance_km(5, 5) > 0 and a.distance_km(1, 1) == 0.0
    assert abs(a.distance_km(11, 5) - geo.haversine_km(11, 5, 10, 5)) < 0.5


def test_cells_and_viewport():
    assert geo.cell(-180, -90, 2) == (0, 0) and geo.cell(179.99, 89.99, 2) == (3, 3)
    assert len(geo.viewport_cells((170, -10, -170, 10), 4)) == 2


def test_ids_time():
    assert det_id("obj", "a", 1) == det_id("obj", "a", 1) != det_id("obj", "a", 2)
    assert len(ulid()) == 26
    assert parse_duration("7d") == 7 * 86_400_000 and parse_duration("-1h") == -3_600_000
    ms, assumed = parse_iso("2025-03-28T09:42:00")
    assert assumed and ms == 1743154920000
    assert month_start_ms(month_index(ms)) <= ms
    assert human_delta(3 * 3_600_000 + 21 * 60_000) == "3 h 21 min"


def test_confidence_is_deterministic_and_recomputable():
    val, groups = cf.combine_groups([("a", 0.9), ("a", 0.5), ("b", 0.6)])
    assert abs(val - (1 - (1 - 0.9) * (1 - 0.6))) < 1e-12
    f = cf.pack_support(groups, 3)
    assert abs(cf.recompute(f) - val) < 1e-12
    assert "probab" not in cf.text(val, ["x"]).lower()


def test_registry_rules(tmp_path):
    base = (pathlib.Path(__file__).parents[1] / "sources" / "usgs.earthquakes.toml").read_text()
    p = tmp_path / "s.toml"
    p.write_text(base.replace('verdict = "adopt"', 'verdict = "reject"'))
    s = load_source(p)
    assert admissible(s) == (False, "verdict reject")
    p.write_text(base.replace('verified_at = "2026-09-28"', 'verified_at = "2024-01-01"'))
    assert admissible(load_source(p), today=dt.date(2026, 9, 28))[0] is False
    p.write_text(base.replace('allowed_hosts = ["earthquake.usgs.gov"]', "allowed_hosts = []"))
    with pytest.raises(RegistryError):
        load_source(p)


def test_types_reject_unknown_endpoint(tmp_path):
    (tmp_path / "v.toml").write_text('[relation_type."x"]\nnature = "logical"\nfrom = ["nope"]\nto = ["any"]\n')
    with pytest.raises(VocabError):
        load_types([tmp_path])
