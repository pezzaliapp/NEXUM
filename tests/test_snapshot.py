"""Phase 3 snapshot builder: lossless compact basemap, stable shard function (shared with the browser)."""

import json

from nexum.snapshot.build import decode_polygons, encode_polygons, fnv1a, shard_of


def test_compact_basemap_roundtrip_is_identical():
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [
            [[-180.0, -90.0], [180.0, -90.0], [180.0, 90.0], [-180.0, -90.0]]]}},
        {"type": "Feature", "properties": {"k": 1}, "geometry": {"type": "MultiPolygon", "coordinates": [
            [[[12.34, 41.9], [12.35, 41.91], [12.33, 41.92], [12.34, 41.9]]], [[[0.01, -0.01], [0.02, 0.0], [0.0, 0.0],
                                                                               [0.01, -0.01]]]]}}],
        "nexum_provenance": {"precision_deg": 0.01}}
    out = decode_polygons(encode_polygons(fc))
    assert out == fc and list(out) == list(fc)
    assert json.dumps(out) == json.dumps(fc)


def test_compact_basemap_rejects_off_grid_coordinates():
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {
        "type": "Polygon", "coordinates": [[[0.001, 0.0], [1.0, 0.0], [0.0, 1.0], [0.001, 0.0]]]}}]}
    try:
        encode_polygons(fc)
    except ValueError:
        return
    raise AssertionError("an off-grid coordinate must not be encoded (the encoding would not be lossless)")


def test_shard_function_is_fnv1a_32():
    assert fnv1a("") == 0x811C9DC5
    assert fnv1a("a") == 0xE40C292C
    assert shard_of("obj_r67mjum3oegfzbyykyabuoxj3y", 2048) == fnv1a("obj_r67mjum3oegfzbyykyabuoxj3y") % 2048
