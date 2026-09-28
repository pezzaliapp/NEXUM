"""Geometry primitives (WGS84, [lon, lat]).

Only elements that carry a location use this module. Everything else in the
Core works without it: geography is a property of the world, not the
architecture.
"""

import math

EARTH_RADIUS_KM = 6371.0088  # IUGG mean radius
KM_PER_DEG_LAT = 111.32
AGG_LEVELS = (2, 4, 6, 8)
MAX_LEVEL = 8


def haversine_km(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def valid_lonlat(lon, lat) -> bool:
    return lon is not None and lat is not None and -180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0


# ── Geometry helpers ─────────────────────────────────────────────────────────

def iter_rings(geom):
    """Yield every linear ring / line of a GeoJSON geometry as a list of [lon, lat]."""
    t = geom["type"]
    c = geom["coordinates"]
    if t == "Point":
        yield [c]
    elif t in ("MultiPoint", "LineString"):
        yield c
    elif t in ("Polygon", "MultiLineString"):
        yield from c
    elif t == "MultiPolygon":
        for poly in c:
            yield from poly
    else:
        raise ValueError(f"unsupported geometry type: {t}")


def bbox(geom) -> tuple[float, float, float, float]:
    """(min_lon, max_lon, min_lat, max_lat)."""
    xs, ys = [], []
    for ring in iter_rings(geom):
        for x, y, *_ in ring:
            xs.append(x)
            ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def representative_point(geom) -> tuple[float, float]:
    """A stable point for aggregation: the point itself or the bbox centre."""
    if geom["type"] == "Point":
        x, y, *_ = geom["coordinates"]
        return float(x), float(y)
    x0, x1, y0, y1 = bbox(geom)
    return (x0 + x1) / 2.0, (y0 + y1) / 2.0


def is_areal(geom) -> bool:
    return geom["type"] in ("Polygon", "MultiPolygon")


# ── Aggregation grid (projection-independent) ────────────────────────────────

def cell(lon: float, lat: float, level: int = MAX_LEVEL) -> tuple[int, int]:
    n = 1 << level
    x = int((lon + 180.0) / 360.0 * n)
    y = int((lat + 90.0) / 180.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def cell_bbox(level: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 1 << level
    return (x * 360.0 / n - 180.0, (x + 1) * 360.0 / n - 180.0,
            y * 180.0 / n - 90.0, (y + 1) * 180.0 / n - 90.0)


def viewport_cells(viewport, level: int) -> list[tuple[int, int, int, int]]:
    """Viewport (min_lon, min_lat, max_lon, max_lat) → cell ranges (x0, x1, y0, y1).

    A viewport crossing the antimeridian (min_lon > max_lon) yields two ranges.
    """
    min_lon, min_lat, max_lon, max_lat = viewport
    y0 = cell(0.0, max(-90.0, min_lat), level)[1]
    y1 = cell(0.0, min(90.0, max_lat), level)[1]
    if min_lon <= max_lon:
        spans = [(min_lon, max_lon)]
    else:
        spans = [(min_lon, 180.0), (-180.0, max_lon)]
    out = []
    for a, b in spans:
        out.append((cell(a, 0.0, level)[0], cell(b, 0.0, level)[0], y0, y1))
    return out


# ── Distance queries ─────────────────────────────────────────────────────────

def expand_point_km(lon: float, lat: float, km: float) -> list[tuple[float, float, float, float]]:
    """Bounding boxes (min_lon, max_lon, min_lat, max_lat) that contain the circle.

    Handles the poles (full longitude range) and the antimeridian (two boxes).
    """
    dlat = km / KM_PER_DEG_LAT
    lat0, lat1 = lat - dlat, lat + dlat
    if lat0 <= -90.0 or lat1 >= 90.0:
        return [(-180.0, 180.0, max(-90.0, lat0), min(90.0, lat1))]
    worst = max(abs(lat0), abs(lat1))
    coslat = math.cos(math.radians(worst))
    dlon = km / (KM_PER_DEG_LAT * max(coslat, 1e-9))
    if dlon >= 180.0:
        return [(-180.0, 180.0, lat0, lat1)]
    x0, x1 = lon - dlon, lon + dlon
    if x0 < -180.0:
        return [(x0 + 360.0, 180.0, lat0, lat1), (-180.0, x1, lat0, lat1)]
    if x1 > 180.0:
        return [(x0, 180.0, lat0, lat1), (-180.0, x1 - 360.0, lat0, lat1)]
    return [(x0, x1, lat0, lat1)]


def _norm_dlon(d: float) -> float:
    while d > 180.0:
        d -= 360.0
    while d < -180.0:
        d += 360.0
    return d


def point_segment_km(lon, lat, ax, ay, bx, by) -> float:
    """Distance from a point to a short segment (local equirectangular projection,
    then exact haversine to the closest point)."""
    k = math.cos(math.radians(lat))
    ux, uy = _norm_dlon(ax - lon) * k, ay - lat
    vx, vy = _norm_dlon(bx - lon) * k, by - lat
    dx, dy = vx - ux, vy - uy
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(ux * dx + uy * dy) / L2))
    px, py = ux + t * dx, uy + t * dy
    return haversine_km(lon, lat, lon + (px / k if k else 0.0), lat + py)


class PreparedArea:
    """A polygonal geometry prepared for fast point-in-polygon and distance tests.

    Edges are bucketed by latitude band so that a ray-casting test only visits
    edges that can cross the ray.
    """

    BAND_DEG = 0.25

    def __init__(self, geom):
        if not is_areal(geom):
            raise ValueError("PreparedArea requires a Polygon or MultiPolygon")
        self.edges = []
        for ring in iter_rings(geom):
            for i in range(len(ring) - 1):
                (x1, y1, *_), (x2, y2, *_) = ring[i], ring[i + 1]
                if (x1, y1) != (x2, y2):
                    self.edges.append((x1, y1, x2, y2))
        self.bbox = bbox(geom)
        self.bands: dict[int, list] = {}
        for e in self.edges:
            lo, hi = min(e[1], e[3]), max(e[1], e[3])
            for b in range(int(math.floor(lo / self.BAND_DEG)), int(math.floor(hi / self.BAND_DEG)) + 1):
                self.bands.setdefault(b, []).append(e)

    def contains(self, lon: float, lat: float) -> bool:
        x0, x1, y0, y1 = self.bbox
        if not (x0 <= lon <= x1 and y0 <= lat <= y1):
            return False
        inside = False
        for (ax, ay, bx, by) in self.bands.get(int(math.floor(lat / self.BAND_DEG)), ()):
            if (ay > lat) != (by > lat):
                xi = ax + (lat - ay) * (bx - ax) / (by - ay)
                if xi > lon:
                    inside = not inside
        return inside

    def distance_km(self, lon: float, lat: float) -> float:
        if self.contains(lon, lat):
            return 0.0
        return min(point_segment_km(lon, lat, *e) for e in self.edges)


def distance_km(a_geom, b_geom, prepared_b: "PreparedArea | None" = None) -> float:
    """Distance between two geometries. Point–point: haversine. Point–area:
    distance to the border (0 inside). Other combinations: between
    representative points (documented approximation)."""
    if a_geom["type"] == "Point" and b_geom["type"] == "Point":
        ax, ay, *_ = a_geom["coordinates"]
        bx, by, *_ = b_geom["coordinates"]
        return haversine_km(ax, ay, bx, by)
    if a_geom["type"] == "Point" and is_areal(b_geom):
        ax, ay, *_ = a_geom["coordinates"]
        return (prepared_b or PreparedArea(b_geom)).distance_km(ax, ay)
    if b_geom["type"] == "Point" and is_areal(a_geom):
        return distance_km(b_geom, a_geom)
    (ax, ay), (bx, by) = representative_point(a_geom), representative_point(b_geom)
    return haversine_km(ax, ay, bx, by)
