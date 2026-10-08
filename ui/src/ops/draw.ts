// DRAWING, MEASUREMENT AND AREAS OF INTEREST (2026-10-04): area (polygon), box, radius (circle) and path, with live
// measurements on the sphere; the shapes the person keeps are areas of interest — NEXUM counts and lists the elements
// of the world inside each one, and exports them (GeoJSON, CSV). Everything stays in this browser (localStorage).

import type { GeoJSONSource, Map as MLMap, MapMouseEvent } from "maplibre-gl";
import { boxRing, circleRing, closeRing, haversine, pathLength, ringArea, type LngLat } from "./geo.ts";

export type DrawMode = "area" | "box" | "radius" | "path";
export interface Shape { id: string; mode: DrawMode; name: string; pts: LngLat[]; ring: LngLat[] | null; km: number; km2: number; created: number }

const KEY = "nexum.aoi.shapes.v1";
let shapes: Shape[] = load();
let mode: DrawMode | null = null;
let pts: LngLat[] = [];
let hover: LngLat | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load(): Shape[] {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(s) ? s : []; } catch { return []; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(shapes)); } catch { /* ignore */ } }

export const draw = {
  shapes: () => shapes,
  mode: () => mode,
  pending: () => pts,
  hover: () => hover,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  start(m: DrawMode | null) { mode = m; pts = []; hover = null; flag(); emit(); },
  undo() { pts = pts.slice(0, -1); emit(); },
  remove(id: string) { shapes = shapes.filter((s) => s.id !== id); save(); emit(); },
  rename(id: string, name: string) { shapes = shapes.map((s) => (s.id === id ? { ...s, name } : s)); save(); emit(); },
  clear() { shapes = []; save(); emit(); },
  add(s: Shape) { shapes = [...shapes, s]; save(); emit(); },
  finish() {
    if (!mode) return;
    const s = shapeOf(mode, pts, null);
    if (s) { shapes = [...shapes, { ...s, name: `${NAMES[mode]} ${shapes.length + 1}` }]; save(); }
    mode = null; pts = []; hover = null; flag(); emit();
  },
};
// the map's own clicks (select an element, open a place) step aside while a shape is being drawn
// (the names drawn over the map too: a tap on a name reaches the map — physical test #4)
const flag = () => { (window as any).__nexumDrawing = mode !== null; document.documentElement.classList.toggle("map-taps", mode !== null || !!(window as any).__nexumPicking); };
export const isDrawing = () => mode !== null;
export const NAMES: Record<DrawMode, string> = { area: "Area", box: "Riquadro", radius: "Raggio", path: "Linea" };

/** The shape the points describe (with the cursor as the provisional last point while drawing). */
export function shapeOf(m: DrawMode, p: LngLat[], cursor: LngLat | null): Shape | null {
  const all = cursor ? [...p, cursor] : p;
  const base = { id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, mode: m, name: "", pts: p, created: Date.now() };
  if (m === "path") {
    if (all.length < 2) return null;
    return { ...base, pts: all, ring: null, km: pathLength(all), km2: 0 };
  }
  if (m === "radius" || m === "box") {
    if (all.length < 2) return null;
    const [a, b] = all;
    const ring = m === "radius" ? circleRing(a, haversine(a, b)) : boxRing(a, b);
    return { ...base, pts: [a, b], ring, km: m === "radius" ? haversine(a, b) : pathLength(ring), km2: ringArea(ring.slice(0, -1)) };
  }
  if (all.length < 3) return all.length === 2 ? { ...base, pts: all, ring: null, km: pathLength(all), km2: 0 } : null;
  const ring = closeRing(all);
  return { ...base, pts: all, ring, km: pathLength(ring), km2: ringArea(all) };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
export function shapesGeoJSON(list: Shape[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: list.map((s) => ({ type: "Feature" as const, id: s.id,
    properties: { id: s.id, name: s.name, mode: s.mode, length_km: +s.km.toFixed(3), area_km2: +s.km2.toFixed(3), created: new Date(s.created).toISOString() },
    geometry: s.ring ? { type: "Polygon" as const, coordinates: [s.ring] } : { type: "LineString" as const, coordinates: s.pts } })) };
}

/** Map layers of the drawing (kept shapes + the one being drawn) and the clicks that draw. Returns a stop function. */
export function installDraw(map: MLMap): () => void {
  map.addSource("ops-shapes", { type: "geojson", data: EMPTY });
  map.addSource("ops-draft", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-shapes-fill", type: "fill", source: "ops-shapes", filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#79A7C9", "fill-opacity": 0.1 } });
  map.addLayer({ id: "ops-shapes-line", type: "line", source: "ops-shapes", paint: { "line-color": "#79A7C9", "line-width": 1.6 } });
  map.addLayer({ id: "ops-draft-fill", type: "fill", source: "ops-draft", filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#E0A640", "fill-opacity": 0.12 } });
  map.addLayer({ id: "ops-draft-line", type: "line", source: "ops-draft", filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": "#E0A640", "line-width": 1.8, "line-dasharray": [2, 1] } });
  map.addLayer({ id: "ops-draft-pts", type: "circle", source: "ops-draft", filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 3.5, "circle-color": "#E0A640", "circle-stroke-color": "#0D1012", "circle-stroke-width": 1 } });
  const render = () => {
    (map.getSource("ops-shapes") as GeoJSONSource | undefined)?.setData(shapesGeoJSON(shapes));
    const d = mode ? shapeOf(mode, pts, hover) : null;
    const feats: GeoJSON.Feature[] = pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
    if (d) feats.push(...shapesGeoJSON([d]).features);
    (map.getSource("ops-draft") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    map.getCanvas().style.cursor = mode ? "crosshair" : "";
    if (mode) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  };
  const ll = (e: MapMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];
  const onClick = (e: MapMouseEvent) => {
    if (!mode) return;
    pts = [...pts, ll(e)];
    // box and radius are two clicks: centre/corner and the second point
    if ((mode === "box" || mode === "radius") && pts.length === 2) { draw.finish(); return; }
    emit();
  };
  const onDbl = (e: MapMouseEvent) => { if (!mode) return; e.preventDefault(); draw.finish(); };
  let raf = 0;
  const onMove = (e: MapMouseEvent) => {
    if (!mode) return;
    hover = ll(e);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => emit());
  };
  map.on("click", onClick);
  map.on("dblclick", onDbl);
  map.on("mousemove", onMove);
  const unsub = draw.subscribe(render);
  render();
  return () => { unsub(); map.off("click", onClick); map.off("dblclick", onDbl); map.off("mousemove", onMove); };
}

/** CSV of rows (RFC 4180 quoting). */
export function toCSV(head: string[], rows: (string | number | null | undefined)[][]): string {
  const q = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n");
}

/** Save a text as a file (a Blob link; nothing leaves the browser). */
export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);   // after the browser has taken the file
}
