"""Basemap provider (decision D4).

The UI receives a MapLibre style from `/api/v1/basemap/style.json` and draws
its own layers on top. The provider is the only place that knows how the
basemap is made: today, polygons derived from a zipped shapefile payload of a
registered source already in a local Raw Store (configured in
config/basemap.toml). A future offline cartography replaces this provider and
the style, not WORLD MODE.
"""

import io
import json
import pathlib
import threading
import zipfile

from connectors import shapefile
from nexum.core.raw import RawStore

PRECISION = 2          # default: 0.01° ≈ 1 km, enough for a backdrop


def _simplify_ring(ring, precision=PRECISION):
    out = []
    for x, y in ring:
        p = [round(x, precision), round(y, precision)]
        if not out or out[-1] != p:
            out.append(p)
    if len(out) >= 4 and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def _simplify(geom, precision=PRECISION):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        rings = [r for r in (_simplify_ring(r, precision) for r in poly) if r]
        if rings and rings[0]:
            out.append(rings)
    if not out:
        return None
    return {"type": "MultiPolygon", "coordinates": out} if len(out) > 1 else {"type": "Polygon", "coordinates": out[0]}


class RawPolygonProvider:
    def __init__(self, raw_dirs, cache_dir, source_id, attribution, precision=PRECISION):
        self.source_id, self.attribution, self.precision = source_id, attribution, int(precision)
        self.raw_dirs = [pathlib.Path(d) for d in raw_dirs]
        self.cache_dir = pathlib.Path(cache_dir)
        self._lock = threading.Lock()
        self._payload = None

    def _find(self):
        for d in self.raw_dirs:
            store = RawStore.__new__(RawStore)
            store.root, store.manifest = d, d / "manifest.jsonl"
            if not store.manifest.exists():
                continue
            for e in reversed(store.read_manifest()):
                if e.get("source_id") == self.source_id and store.path_for(e["sha256"]).exists():
                    return store, e
        return None, None

    def available(self) -> bool:
        return self._find()[1] is not None

    def layer(self, name: str) -> bytes | None:
        if name != "admin0":
            return None
        with self._lock:
            if self._payload is not None:
                return self._payload
            store, entry = self._find()
            if entry is None:
                return None
            cached = self.cache_dir / f"admin0-{entry['sha256'][:16]}-p{self.precision}.geojson"
            if cached.exists():
                self._payload = cached.read_bytes()
                return self._payload
            z = zipfile.ZipFile(io.BytesIO(store.get(entry["sha256"])))
            shp = next(n for n in z.namelist() if n.lower().endswith(".shp"))
            feats = []
            for g in shapefile.read_polygons(z.read(shp)):
                if g is None:
                    continue
                s = _simplify(g, self.precision)
                if s:
                    feats.append({"type": "Feature", "properties": {}, "geometry": s})
            fc = {"type": "FeatureCollection", "features": feats,
                  "nexum_provenance": {"source_id": self.source_id, "raw_id": entry["raw_id"], "sha256": entry["sha256"],
                                       "attribution": self.attribution, "precision_deg": 10 ** -self.precision}}
            body = json.dumps(fc, separators=(",", ":")).encode()
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp = cached.with_suffix(".tmp")
            tmp.write_bytes(body)
            tmp.replace(cached)
            self._payload = body
            return body

    def labels(self) -> bytes | None:
        """Place names for the backdrop (the same payload's attribute table): name, label point and the smallest
        zoom at which the source recommends the label. Used to answer "where am I?" without any online service."""
        with self._lock:
            if getattr(self, "_labels", None) is not None:
                return self._labels
            store, entry = self._find()
            if entry is None:
                return None
            z = zipfile.ZipFile(io.BytesIO(store.get(entry["sha256"])))
            dbf = next(n for n in z.namelist() if n.lower().endswith(".dbf"))
            cpg = [n for n in z.namelist() if n.lower().endswith(".cpg")]
            enc = z.read(cpg[0]).decode("ascii").strip().lower() if cpg else "utf-8"
            items = []
            for r in shapefile.read_dbf(z.read(dbf), "utf-8" if "utf" in enc else enc):
                if not r or r.get("LABEL_X") is None or r.get("LABEL_Y") is None or not r.get("NAME"):
                    continue
                items.append({"name": r["NAME"], "x": round(float(r["LABEL_X"]), 4), "y": round(float(r["LABEL_Y"]), 4),
                              "min_zoom": float(r.get("MIN_LABEL") or 0), "rank": int(r.get("LABELRANK") or 9)})
            items.sort(key=lambda i: (i["rank"], i["name"]))
            body = json.dumps({"labels": items, "nexum_provenance": {"source_id": self.source_id, "raw_id": entry["raw_id"],
                                                                     "sha256": entry["sha256"], "attribution": self.attribution,
                                                                     "fields": ["NAME", "LABEL_X", "LABEL_Y", "MIN_LABEL",
                                                                                "LABELRANK"]}},
                              ensure_ascii=False, separators=(",", ":")).encode()
            self._labels = body
            return body

    def style(self) -> dict:
        layers = [{"id": "basemap-background", "type": "background", "paint": {"background-color": "#0B0E10"}}]
        sources = {}
        if self.available():
            sources["basemap-admin0"] = {"type": "geojson", "data": "/api/v1/basemap/admin0.geojson",
                                         "attribution": self.attribution, "tolerance": 0.6}
            layers += [
                {"id": "basemap-land", "type": "fill", "source": "basemap-admin0",
                 "paint": {"fill-color": "#161B1F", "fill-antialias": False}},
                {"id": "basemap-borders", "type": "line", "source": "basemap-admin0",
                 "paint": {"line-color": "#2B343A", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 8, 1.2]}},
            ]
        return {"version": 8, "name": "nexum-basemap", "sources": sources, "layers": layers,
                "metadata": {"nexum:provider": f"raw-polygons:{self.source_id}" if sources else "none",
                             "nexum:attribution": self.attribution if sources else None}}
