"""Minimal ESRI Shapefile (polygon) + dBase reader, standard library only."""

import struct


def read_dbf(data: bytes, encoding: str = "utf-8"):
    n_records = struct.unpack("<I", data[4:8])[0]
    header_len, record_len = struct.unpack("<HH", data[8:12])
    fields, pos = [], 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\x00")[0].decode("ascii")
        ftype = chr(data[pos + 11])
        flen = data[pos + 16]
        fields.append((name, ftype, flen))
        pos += 32
    out = []
    off = header_len
    for _ in range(n_records):
        rec = data[off:off + record_len]
        off += record_len
        if rec[:1] == b"*":
            out.append(None)
            continue
        p, row = 1, {}
        for name, ftype, flen in fields:
            raw = rec[p:p + flen]
            p += flen
            txt = raw.decode(encoding, errors="replace").replace("\x00", "").strip()
            if ftype in ("N", "F"):
                try:
                    row[name] = (float(txt) if ("." in txt or "e" in txt.lower()) else int(txt)) if txt else None
                except ValueError:
                    row[name] = None
            else:
                row[name] = txt
        out.append(row)
    return out


def _signed_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2.0


def _inside(pt, ring):
    x, y = pt
    inside = False
    for i in range(len(ring) - 1):
        (ax, ay), (bx, by) = ring[i], ring[i + 1]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def read_polygons(data: bytes):
    """Yield one GeoJSON geometry (Polygon/MultiPolygon, RFC 7946 orientation) per record."""
    pos = 100
    while pos < len(data):
        _num, clen = struct.unpack(">ii", data[pos:pos + 8])
        content = data[pos + 8:pos + 8 + clen * 2]
        pos += 8 + clen * 2
        stype = struct.unpack("<i", content[:4])[0]
        if stype == 0:
            yield None
            continue
        if stype not in (5, 15, 25):
            raise ValueError(f"unsupported shape type {stype}")
        n_parts, n_points = struct.unpack("<ii", content[36:44])
        parts = list(struct.unpack(f"<{n_parts}i", content[44:44 + 4 * n_parts]))
        pts_off = 44 + 4 * n_parts
        coords = struct.unpack(f"<{2 * n_points}d", content[pts_off:pts_off + 16 * n_points])
        pts = [(round(coords[2 * i], 7), round(coords[2 * i + 1], 7)) for i in range(n_points)]
        rings = [pts[a:b] for a, b in zip(parts, parts[1:] + [n_points])]
        polys = []  # [outer, holes...] ; shapefile outer rings are clockwise (negative area)
        holes = []
        for r in rings:
            if len(r) < 4:
                continue
            (polys if _signed_area(r) < 0 else holes).append([r] if _signed_area(r) < 0 else r)
        for h in holes:
            for poly in polys:
                if _inside(h[0], poly[0]):
                    poly.append(h)
                    break
            else:
                polys.append([h[::-1]])  # orphan counter-clockwise ring: treat as an outer ring
        out = []
        for poly in polys:
            outer = [list(p) for p in poly[0][::-1]]          # exterior counter-clockwise
            inner = [[list(p) for p in h[::-1]] for h in poly[1:]]  # holes clockwise
            out.append([outer] + inner)
        if len(out) == 1:
            yield {"type": "Polygon", "coordinates": out[0]}
        else:
            yield {"type": "MultiPolygon", "coordinates": out}
