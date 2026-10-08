// MAP — one view of the NEXUM WORLD. MapLibre draws the basemap supplied by the service's provider (D4) and
// NEXUM's own layers on top (ids `nexum-*`). Below z 10 the Core returns aggregate cells when the scope exceeds
// the budget; from z 10 individual elements. The browser never holds more than 5,000 map features.

import { Boundary } from "../components/Boundary";
import { lazyStale } from "../lib/stale";
import { DESK_W } from "../lib/layers";
import { LngLat, Map as MLMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { Suspense, useEffect, useRef, useState } from "react";
import { call, isSuperseded, plain, SNAPSHOT } from "../lib/api";
import { band } from "../lib/confidence";
import { bandOpacity, colorOf, SHAPE, TOKENS } from "../lib/palette";
import { S } from "../lib/strings";
import { SnapshotAge } from "../components/WebNotes";
import { FiltersChip, Freshness, PeriodChip, ResetChip, usePeriodName } from "../components/Period";
import { typeLabelOf } from "../components/Highlights";
import { head, register, shortLabel, summaryOf } from "../lib/summary";
import type { Scope } from "../lib/types";
import { useEntity, store, useStore } from "../store";
import { mapScope } from "../store/store";
import { installIllumination } from "../map/illumination";
import { insightKind } from "../lib/connections";
import POINTS_CFG from "../config/points.json";
import type { PointLayer } from "../map/points";

// POINT LAYERS OF THEIR OWN (2026-10-05): types drawn whole and clustered by their own layer (src/map/points.ts, loaded
// when one is shown) instead of as the anonymous density and small marks of the other elements
const OWN_POINT_TYPES = Object.keys(POINTS_CFG).filter((k) => !k.startsWith("_"));
/** The own-layer types the map draws now (the person's categories and type filter). */
function ownDrawn(st: ReturnType<typeof store.get>): string[] {
  const ms = mapScope(st);
  return OWN_POINT_TYPES.filter((t) => st.types.has(t) && (!Array.isArray(ms.types) || ms.types.includes(t)));
}

setWorkerUrl(`${__MAP_VENDOR__}/maplibre-gl-worker.js`);   // MapLibre's own worker, served by NEXUM (no CDN), sharing the main thread's engine file
// THE OPERATIONAL SURFACE (2026-10-04): header, tools, basemap modes, globe, orbits… — its own download, fetched once
// the world is on screen (the first view never waits for it)
const OpsShell = lazyStale(() => import("../ops/OpsShell").then((m) => ({ default: m.OpsShell })));
/** The map's own answers to a tap (an element, a line, a zone, an operational feature): the groups and the land yield. */
const TAKEN = /^(nexum-(items|hl|pts|links|zones)|ops-(orbits|channels|news|ais|hotspots$|cables|searoute|imported|quakes|gdacs|nws|naval|choke|ports))/;
const drawing = () => !!((window as any).__nexumDrawing || (window as any).__nexumPicking);   // a tool owns the map's taps
// the address as the page opened (the workspace rewrites it with the focus right after): a permalink's projection
const START_HASH = location.hash;
// the opening view: Europe–Africa (where the world's data are densest), unless the device's time zone is on another
// side of the Earth — then the globe faces it (the time zone only: no address, no IP lookup)
const TZ_LNG = Math.max(-150, Math.min(150, Math.round(-new Date().getTimezoneOffset() / 4)));
const START_CENTER: [number, number] = [Math.abs(TZ_LNG - 20) > 45 ? TZ_LNG : 20, 22];
(window as any).__nexumStartHash = START_HASH;
/** A point hidden behind the globe is not labelled (the flat map hides nothing). */
const occluded = (m: MLMap, p: [number, number]) => {
  if (m.getProjection()?.type !== "globe") return false;
  // the far hemisphere: more than 90° of arc from the centre of the view (also while the globe turns into the flat
  // map at high zoom, when the renderer's own test may not apply)
  const c = m.getCenter(), r = Math.PI / 180;
  const cos = Math.sin(c.lat * r) * Math.sin(p[1] * r) + Math.cos(c.lat * r) * Math.cos(p[1] * r) * Math.cos((p[0] - c.lng) * r);
  if (cos < 0.05) return true;
  const t: any = (m as any).transform;
  return !!t?.isLocationOccluded?.(new LngLat(p[0], p[1]));
};

const MAX_FEATURES = 5000;
// aggregates and unrelated elements recede; with a focus they recede further (hierarchy of the addendum 2026-09-30)
// ONE OPERATIONAL MAP (Phase 3B · block 0): aggregates are a soft density (heatmap) — never a grid of squares — and
// only where they are needed: world scale; at continent scale when the Core answers with aggregates, fading with the
// zoom; from LOCAL_Z the elements themselves (no aggregate layer at all). Presentation only: the Core is unchanged.
const WORLD_Z = 3;          // MapLibre zoom below which the Core's aggregates are asked directly (world scale)
const LOCAL_Z = 5.5;        // MapLibre zoom from which the elements themselves are shown (lod "refs", screen budget)
const DENSITY_OPACITY = { idle: 1, focus: 0.55 };
export const DENSITY_INTENSITY = { flat: 0.42, globe: 0.3 };
const DENSITY_SPREAD = 1.45;   // heatmap radius in cell spacings (cells are regular in longitude, wider apart in Mercator rows near the poles)   // multiplies the zoom fade of the density layer
// elements without a date (places, infrastructure: always visible, already named by the backdrop) recede; the
// period's events and insights stand out
const ITEM_OPACITY_IDLE: any = ["*", ["get", "o"], ["case", ["==", ["get", "k"], "object"], 0.4, 1]];
const ITEM_OPACITY_FOCUS: any = ["*", ["get", "o"], ["case", ["boolean", ["feature-state", "lk"], false], 1, 0.35]];
const CONTEXT_FIRST_MS = 1500;
const SNAP_Z = 10;          // Core zoom from which the viewport is snapped to 0.01° instead of to aggregate cells
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Signed-distance icons (circle, square, diamond, rings) so that one icon is tinted per feature. */
function sdfIcon(shape: "circle" | "square" | "diamond" | "camera", ring = false, size = 48) {
  const data = new Uint8Array(size * size * 4);
  const r = size * 0.34, c = (size - 1) / 2, buffer = size * 0.12;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c;
    // camera (a public webcam, recognisable on the map): a body with a lens cut out and a small viewfinder on top
    const body = Math.max(Math.abs(dx) - r * 1.05, Math.abs(dy - r * 0.15) - r * 0.7);
    const top = Math.max(Math.abs(dx + r * 0.35) - r * 0.32, Math.abs(dy + r * 0.72) - r * 0.2);
    const lens = r * 0.38 - Math.hypot(dx, dy - r * 0.15);
    let d = shape === "circle" ? Math.hypot(dx, dy) - r
      : shape === "square" ? Math.max(Math.abs(dx), Math.abs(dy)) - r * 0.9
        : shape === "camera" ? Math.max(Math.min(body, top), lens)
          : (Math.abs(dx) + Math.abs(dy)) / Math.SQRT2 - r * 0.85;
    if (ring) d = Math.abs(d) - 1.6;
    const a = Math.max(0, Math.min(255, 191 - (d / buffer) * 64));
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = a;
  }
  return { width: size, height: size, data };
}

const aggLevel = (z: number) => Math.min(8, Math.max(2, 2 * Math.floor((z + 2) / 2)));

/** Viewport snapped to the aggregation grid (repeatable requests → cache hits), clamped to the world. */
function viewportOf(map: MLMap): { vp: [number, number, number, number]; z: number } {
  const b = map.getBounds();
  // Core zoom = MapLibre zoom + 3 (512 px tiles): aggregate cells stay ≈ 12–30 px on screen
  const z = Math.max(0, Math.floor(map.getZoom() + 3));
  let w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
  if (e - w >= 360) { w = -180; e = 180; }
  w = Math.max(-180, w); e = Math.min(180, e); s = Math.max(-85, s); n = Math.min(85, n);
  if (z < SNAP_Z) {
    const L = aggLevel(z), dx = 360 / 2 ** L, dy = 180 / 2 ** L;
    w = Math.max(-180, Math.floor((w + 180) / dx) * dx - 180); e = Math.min(180, Math.ceil((e + 180) / dx) * dx - 180);
    s = Math.max(-90, Math.floor((s + 90) / dy) * dy - 90); n = Math.min(90, Math.ceil((n + 90) / dy) * dy - 90);
  } else {
    const q = 0.01;
    w = Math.floor(w / q) * q; s = Math.floor(s / q) * q; e = Math.ceil(e / q) * q; n = Math.ceil(n / q) * q;
  }
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return { vp: [r(w), r(s), r(Math.max(e, w + 0.01)), r(Math.max(n, s + 0.01))], z };
}

// the place the Core's /locate gives a focus, kept even when the element's own record is not in the store yet
const located = new Map<string, [number, number]>();
// AN AREA'S MARK (2026-10-07, physical test): the Core gives an area one stable point for aggregation, the centre of its
// bounding box — for an area with distant territories that point lies outside it (France: in Mali, its box running
// from French Guiana to Réunion; the Netherlands and the United States: in the Atlantic). Where the map marks the
// element itself (its ring, its name, its relation lines, "show me"), an area is marked inside its largest polygon:
// the polygon's centroid, or — when that falls outside a concave shape — the middle of the widest crossing at its
// latitude. Points and lines keep their own point. The Core's point is unchanged (it places the aggregation cells).
const anchors = new Map<string, [number, number] | null>();
function ringArea(r: number[][]): number { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function inside(r: number[][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}
/** The bounding box [w, s, e, n] of an area's largest polygon (null for anything else). */
function largestPolygon(g: any): number[][] | null {
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let best: number[][] | null = null, bestA = 0;
  for (const poly of polys) {
    const r = poly[0], lat = r.reduce((s, p) => s + p[1], 0) / r.length;
    const a = Math.abs(ringArea(r)) * Math.cos((lat * Math.PI) / 180);
    if (a > bestA) { bestA = a; best = r; }
  }
  return best;
}
function largestBox(g: any): [number, number, number, number] | null {
  const r = largestPolygon(g);
  if (!r) return null;
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const areaAnchorOf = (id: string, g: any) => areaAnchor(id, g);
function areaAnchor(id: string, given?: any): [number, number] | undefined {
  if (anchors.has(id)) return anchors.get(id) ?? undefined;
  const g = given ?? store.entity(id)?.details?.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return undefined;      // not known yet, or not an area
  const best = largestPolygon(g);
  let out: [number, number] | null = null;
  if (best) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
      const f = best[j][0] * best[i][1] - best[i][0] * best[j][1];
      A += f; cx += (best[j][0] + best[i][0]) * f; cy += (best[j][1] + best[i][1]) * f;
    }
    out = A ? [cx / (3 * A), cy / (3 * A)] : [best[0][0], best[0][1]];
    if (!inside(best, out[0], out[1])) {
      const y = out[1], xs: number[] = [];
      for (let i = 0, j = best.length - 1; i < best.length; j = i++)
        if ((best[i][1] > y) !== (best[j][1] > y)) xs.push(((best[j][0] - best[i][0]) * (y - best[i][1])) / (best[j][1] - best[i][1]) + best[i][0]);
      xs.sort((p, q) => p - q);
      let w = -1;
      for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; out = [(xs[k] + xs[k + 1]) / 2, y]; }
    }
  }
  anchors.set(id, out);
  return out ?? undefined;
}
const pointOf = (id: string | null | undefined) => (id ? areaAnchor(id) ?? (store.entity(id)?.point as [number, number] | undefined) ?? located.get(id) : undefined);

const emptyTypes = (s: Scope) => Array.isArray(s.types) && s.types.length === 0;

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const labelsEl = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const stopIllumination = useRef<(() => void) | null>(null);
  const stopOps = useRef<(() => void) | null>(null);
  const [opsReady, setOpsReady] = useState(false);
  const framed = useRef<string | null>(null);
  const idsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // how the focus appears, with the focus it describes (a new focus never shows the previous one's message)
  const [appearsOf, setAppearsOf] = useState<{ id: string | null; v: string | null }>({ id: null, v: null });
  const status = useStore((s) => s.status);
  const credits = useStore((s) => s.mapCredits);
  const scope = useStore((s) => s.scope);
  const focus = useStore((s) => s.focus);
  const secondary = useStore((s) => s.secondary);
  const wv = useStore((s) => s.worldVersion);
  const rev = useStore((s) => s.rev);
  const context = useStore((s) => s.context);
  const mapLinks = useStore((s) => s.mapLinks);
  const hasGeo = !!status?.has_geometry;
  const touch = innerWidth < DESK_W;
  const appears = appearsOf.id === focus ? appearsOf.v : null;

  // ── create the map once ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasGeo || !el.current) return;
    let map: MLMap | null = null;
    let cancelled = false;
    plain<any>("/basemap/style.json").then((style) => {
      if (cancelled || !el.current) return;
      // the projection the person last chose (globe by default, as the operational surface opens), from the first frame
      let flat = false;
      try { flat = (JSON.parse(localStorage.getItem("nexum.ops.v1") ?? "{}").projection === "flat") || /[#&]p=flat/.test(START_HASH); } catch { /* defaults */ }
      if (/[#&]p=globe/.test(START_HASH)) flat = false;
      if (!flat) style = { ...style, projection: { type: "globe" } };
      const created = new MLMap({
        container: el.current, style, center: START_CENTER, zoom: 1.2, minZoom: 0, maxZoom: 15,
        renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, attributionControl: false,
        fadeDuration: 0, maxPitch: 0,
      });
      map = created;
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      created.addControl(new NavigationControl({ showCompass: false }), "top-right");
      created.on("load", () => {
        const m = created;
        // borders: legible, never dominant (the backdrop answers "where am I?")
        if (m.getLayer("basemap-borders")) {
          m.setPaintProperty("basemap-borders", "line-color", "#46525B");
          m.setPaintProperty("basemap-borders", "line-width", ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.1, 8, 1.6]);
        }
        // the Earth's illumination: always on, under every NEXUM layer (one map, no mode)
        stopIllumination.current = installIllumination(m, "basemap-borders");
        m.addImage("ci", sdfIcon("circle"), { sdf: true });
        m.addImage("sq", sdfIcon("square"), { sdf: true });
        m.addImage("di", sdfIcon("diamond"), { sdf: true });
        m.addImage("ring", sdfIcon("circle", true), { sdf: true });
        m.addImage("ring-sq", sdfIcon("square", true), { sdf: true });
        m.addImage("cam", sdfIcon("camera"), { sdf: true });
        for (const id of ["nexum-focus-geom", "nexum-zones", "nexum-links", "nexum-cells", "nexum-items", "nexum-hl", "nexum-sel"])
          m.addSource(id, { type: "geojson", data: EMPTY, ...(id === "nexum-items" ? { promoteId: "id" } : {}) });
        m.addLayer({ id: "nexum-focus-fill", type: "fill", source: "nexum-focus-geom",
          paint: { "fill-color": TOKENS.accent, "fill-opacity": 0.07 } });
        m.addLayer({ id: "nexum-focus-line", type: "line", source: "nexum-focus-geom",
          paint: { "line-color": TOKENS.accent, "line-width": 1.4, "line-opacity": 0.9 } });
        // security zones (on request): the 0.5° cells holding documented lethal violence — red activity, orange exposure
        m.addLayer({ id: "nexum-zones", type: "fill", source: "nexum-zones",
          paint: { "fill-color": ["match", ["get", "color"], "red", "#d8443a", "#e8913a"], "fill-opacity": 0.38,
            "fill-outline-color": ["match", ["get", "color"], "red", "#ff6a5c", "#ffb05c"] } });
        // visual hierarchy: focus → its connections → geography → other data (aggregates stay underneath)
        // density of the aggregate cells (weight = share of the densest cell); fades out before the elements appear
        m.addLayer({ id: "nexum-density", type: "heatmap", source: "nexum-cells", maxzoom: LOCAL_Z + 0.5, paint: {
          "heatmap-weight": ["get", "w"],
          // overlapping blobs (radius ≈ 1.45 spacings, set per answer); on the globe the same cells cover a smaller disc
          // and add up brighter: a lower intensity keeps the density as quiet as on the flat map (the night stays night)
          "heatmap-intensity": style.projection?.type === "globe" ? DENSITY_INTENSITY.globe : DENSITY_INTENSITY.flat,
          "heatmap-radius": 24,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(159,179,191,0)", 0.2, "rgba(159,179,191,0.14)",
            0.5, "rgba(159,179,191,0.26)", 1, "rgba(196,210,218,0.42)"],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, DENSITY_OPACITY.idle, 3, 0.8 * DENSITY_OPACITY.idle, 4.8, 0.35 * DENSITY_OPACITY.idle, LOCAL_Z, 0] } });
        // invisible touch targets of the cells (a tap zooms to the cell); the cell holding the focus keeps a ring
        m.addLayer({ id: "nexum-cells", type: "circle", source: "nexum-cells", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 9, 6, 18], "circle-opacity": 0, "circle-stroke-width": 0 } });
        m.addLayer({ id: "nexum-cells-hl", type: "circle", source: "nexum-cells", filter: ["==", ["get", "hl"], 1], paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 9, 6, 18], "circle-opacity": 0,
          "circle-stroke-width": 1.6, "circle-stroke-color": TOKENS.accent } });
        m.addLayer({ id: "nexum-links", type: "line", source: "nexum-links",
          paint: { "line-color": TOKENS.link, "line-width": 1.3, "line-opacity": 0.85 } });
        m.addLayer({ id: "nexum-items", type: "symbol", source: "nexum-items", layout: {
          "icon-image": ["case", ["==", ["get", "f"], "camera"], "cam", ["match", ["get", "k"], "object", "sq", "insight", "di", "ci"]],
          // places and infrastructure are small marks at national scale and grow when they can be read one by one;
          // events and NEXUM's connections keep their size (one map: the data never turns into a carpet of squares)
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, ["match", ["get", "k"], "object", 0.16, 0.3],
            5, ["match", ["get", "k"], "object", 0.18, 0.4], 8, ["match", ["get", "k"], "object", 0.3, 0.45],
            12, ["match", ["get", "k"], "object", 0.5, 0.55]],
          "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "p"] },
          paint: { "icon-color": ["get", "c"], "icon-opacity": ITEM_OPACITY_IDLE } });
        // WORLD MODE: the notable events of "Cosa sta succedendo", named (they are elements of the world like any other)
        m.addLayer({ id: "nexum-hl-ring", type: "symbol", source: "nexum-hl", layout: { "icon-image": "ring", "icon-size": 0.62,
          "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-color": "#D6DBDE", "icon-opacity": 0.75 } });
        m.addLayer({ id: "nexum-hl", type: "symbol", source: "nexum-hl", layout: {
          "icon-image": ["match", ["get", "k"], "insight", "di", "ci"], "icon-size": ["match", ["get", "k"], "insight", 0.62, 0.5],
          "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-color": ["get", "c"] } });
        m.addLayer({ id: "nexum-sel", type: "symbol", source: "nexum-sel", layout: {
          "icon-image": "ring", "icon-size": ["match", ["get", "role"], "focus", 0.95, 0.8],
          "icon-allow-overlap": true, "icon-ignore-placement": true },
          paint: { "icon-color": ["match", ["get", "role"], "focus", TOKENS.accent, TOKENS.link] } });
        const pick = (e: MapLayerMouseEvent) => {
          if (drawing()) return;
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          if (e.originalEvent.shiftKey) store.setSecondary(id); else store.select(id, "map");
        };
        // the order of the surfaces (2026-10-03, after the illumination diagnosis): the density belongs to the geography
        // underneath, so the night darkens it too; the reference lights sit on the night; borders, connections,
        // elements, labels and the selection always on top —
        // land → density → night → lights → borders → focus area → links → elements → selection
        m.moveLayer("nexum-density", "nexum-illumination");
        if (m.getLayer("basemap-borders")) m.moveLayer("basemap-borders", "nexum-focus-fill");
        const near = (e: MapLayerMouseEvent | { point: { x: number; y: number } }) => {
          const r = innerWidth < DESK_W ? 12 : 5, { x, y } = e.point;
          return m.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]]);
        };
        // a connection line opens the element it leads to; a security zone, the place's security section
        m.on("click", (e) => {
          // (a thin line, near the finger; anything more specific there — an element, a news point — answers instead)
          const fs = near(e).filter((f) => TAKEN.test(f.layer.id)), p = fs.every((f) => /^nexum-(links|zones)$/.test(f.layer.id)) && fs[0]?.properties;
          if (drawing() || !p) return;
          if (p.r) store.select(p.r, "map"); else if (p.place) store.select(p.place, "map", "sicurezza");
        });
        for (const l of ["nexum-links", "nexum-zones"]) {
          m.on("mouseenter", l, () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", l, () => { m.getCanvas().style.cursor = ""; });
        }
        // (registered first: an element on a line or in a zone answers the tap last, so it wins)
        // THE SELECTION'S RING ANSWERS (2026-10-08, physical test: an orange circle that did nothing): a tap on it opens
        // the card of what it marks — also when the element's own mark is hidden by the filters, or the card is closed
        m.on("click", "nexum-sel", (e) => {
          if (drawing()) return;
          if (near(e).some((f) => TAKEN.test(f.layer.id))) return;   // an element or a feature there answers instead
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          if (id === store.get().focus) store.set({ inspectorOpen: true, panel: "object", overlay: null, sheet: "peek" }); else store.select(id, "map");
        });
        m.on("mouseenter", "nexum-sel", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "nexum-sel", () => { m.getCanvas().style.cursor = ""; if (tipEl.current) tipEl.current.style.display = "none"; });
        m.on("mousemove", "nexum-sel", (e) => {
          const f = e.features?.[0], t = tipEl.current;
          if (!f || !t || near(e).some((x) => TAKEN.test(x.layer.id))) return;
          const ent = store.entity((f.properties as any).id);
          t.textContent = `${(f.properties as any).role === "focus" ? S.sel.active : S.sel.second}: ${ent?.label ?? ""} — ${S.sel.tapCard}`;
          t.style.left = `${e.point.x + 12}px`; t.style.top = `${e.point.y + 12}px`; t.style.display = "block";
        });
        m.on("click", "nexum-items", pick);
        m.on("click", "nexum-hl", pick);
        for (const layer of ["nexum-cells"]) m.on("click", layer, (e) => {
          if (drawing()) return;
          if (near(e).some((f) => TAKEN.test(f.layer.id))) return;   // something else answers
          const bb = JSON.parse(e.features?.[0]?.properties?.bb ?? "null");
          if (bb) m.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { padding: 24, duration: 300, maxZoom: 11 });
        });
        for (const layer of ["nexum-items", "nexum-cells", "nexum-hl"]) {
          m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; if (tipEl.current) tipEl.current.style.display = "none"; });
          m.on("mousemove", layer, (e) => {
            const f = e.features?.[0];
            if (!f || !tipEl.current) return;
            const p = f.properties as any;
            const t = tipEl.current;
            if (p.id) {
              const ent = store.entity(p.id);
              const ty = store.get().types.get(ent?.type ?? "");
              // name · kind, in words: a rule output by its rule's name, never a raw identifier
              const kind = ty?.label ?? (ent?.kind === "insight" ? insightKind(ent.type) : null);
              if (!ent?.label) { t.style.display = "none"; return; }
              t.textContent = kind ? `${ent.label} · ${kind}` : ent.label;
            } else {
              // a group: how many elements and, when it has a readable name, the type most of them are (never a raw id)
              const dom = p.dom ? store.get().types.get(p.dom)?.label : undefined;
              t.textContent = `${Number(p.n).toLocaleString("it-IT")} elementi${dom ? ` · ${S.m.mostly(dom)}` : ""}`;
            }
            t.style.left = `${e.point.x + 12}px`;
            t.style.top = `${e.point.y + 12}px`;
            t.style.display = "block";
          });
        }
        m.on("click", (e) => {
          if (drawing()) return;
          // an element, a group or an operational feature under (or, with a finger, near) the tap answers it instead
          if (near(e).some((f) => TAKEN.test(f.layer.id) || f.layer.id === "nexum-cells")) return;
          const land = m.queryRenderedFeatures(e.point, { layers: ["basemap-land"] })[0];
          if (!land || !exploreTypes().length) return;
          const inside = (placeNames.current ?? []).filter((n) => inGeometry([n.x, n.y], land.geometry));
          const best = inside.sort((a, b) => a.rank - b.rank)[0];
          if (best) openNamed(best.name, "map-area");
        });
        m.on("moveend", () => schedule());
        m.on("render", () => drawLabels());
        mapRef.current = m;
        (window.__nexum ??= {}).map = m;
        setReady(true);
        // the operational layers, after the first frame of the world (their code is a separate download)
        m.once("idle", () => import("../ops/OpsShell").then((ops) => {
          if (mapRef.current !== m || !ops) return;   // (an old build's part gone from the host: the update notice says so)
          stopOps.current = ops.installOps(m);
          setOpsReady(true);
        }).catch(() => {}));
      });
    });
    return () => { cancelled = true; stopIllumination.current?.(); stopOps.current?.(); stopOps.current = null; map?.remove(); mapRef.current = null; setReady(false); setOpsReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGeo]);

  // ── projection requests (debounced; superseded requests are cancelled) ──
  const timer = useRef<number | undefined>(undefined);
  const pendingFocus = useRef<string | null>(null);
  const firstDone = useRef(false);
  // the selected element's own context first: on a slow network the surroundings' tiles wait for it (at most
  // CONTEXT_FIRST_MS), so the panel's information never queues behind the map's downloads
  const schedule = (waited = 0) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const st = store.get();
      const pending = st.focus && st.context?.id !== st.focus && waited < CONTEXT_FIRST_MS;
      if (pending) schedule(waited + 120); else load();
    }, 120);
  };
  const load = async () => {
    const map = mapRef.current;
    if (!map) return;
    const st = store.get();
    const { vp, z } = viewportOf(map);
    store.set({ viewport: vp });
    let ms = mapScope(st);   // the person's scope narrowed to the categories the map draws (display only)
    // the types drawn by their own clustered layer are not asked again here (never twice on the map)
    const own = ownDrawn(st);
    if (own.length) {
      const all = Array.isArray(ms.types) ? ms.types : [...[...st.types.values()].filter((t) => t.kind !== "relation").map((t) => t.id),
        ...Object.keys(st.status?.by_type ?? {}).filter((k) => !st.types.has(k))];
      ms = { ...ms, types: all.filter((t) => !own.includes(t)) };
    }
    if (emptyTypes(ms)) {
      (map.getSource("nexum-cells") as GeoJSONSource).setData(EMPTY);
      (map.getSource("nexum-items") as GeoJSONSource).setData(EMPTY);
      idsRef.current = [];
      store.set({ mapInfo: { lod: "refs", level: null, returned: 0, total: 0, truncated: false, noGeometry: 0, ms: 0 } });
      return;
    }
    const t0 = performance.now();
    try {
      // budget by screen class (§L): desktop 5,000 · tablet 2,500 · phone 300 (600 at local scale, elements only)
      const mz = map.getZoom();
      const local = mz >= LOCAL_Z;
      const budget = innerWidth >= DESK_W ? 5000 : innerWidth >= 768 ? 2500 : local ? 600 : 300;
      const hl = st.focus && !st.focus.startsWith("rel_") ? st.focus : undefined;
      // world scale (the opening view): the elements are asked as the Core's aggregates, so the first screen never
      // downloads every event row; individual points come with the first zoom in
      const worldTouch = mz < WORLD_Z;   // world scale on every layout: the Core's aggregates, drawn as a density
      const ask = (s: Scope, channel: string, agg = false, zz = z) => call<any>("/projections/map", { s: { ...s, viewport: vp, z: zz },
        b: { max_items: budget, ...(agg ? { lod: "aggregates" } : local ? { lod: "refs" } : {}) }, hl }, { channel });
      // Touch map default (decision of 2026-09-30, option A): elements and events at ≥ mapFloor; insights keep the
      // scope's own threshold (their confidence is the support of an association, on another scale). Two ordinary
      // requests of the Core's contract (types + min_confidence), never a change of the Core or of its semantics.
      const floor = st.mapFloor;
      const insTypes = Object.keys(st.status?.by_type ?? {}).filter((k) => !st.types.has(k));
      const sel = (ids: string[]) => (Array.isArray(ms.types) ? ids.filter((t) => ms.types!.includes(t)) : ids);
      let results: any[];
      if (floor > 0 && insTypes.length) {
        const elem = sel([...st.types.values()].filter((t) => t.kind !== "relation").map((t) => t.id));
        const ins = sel(insTypes);
        results = (await Promise.all([
          // phone budget at world scale: the grid the Core would reach anyway, asked directly (one set of files)
          elem.length ? ask({ ...ms, types: elem, min_confidence: Math.max(ms.min_confidence ?? 0, floor) }, "map", worldTouch,
            worldTouch && innerWidth < 768 ? Math.max(0, z - 2) : z) : null,
          // world scale: the insights at a coarser grid (the same aggregate files as the elements: one download)
          ins.length ? ask({ ...ms, types: ins }, "map-insights", worldTouch, worldTouch ? Math.max(0, z - 2) : z) : null,
        ])).filter(Boolean);
      } else results = [await ask(ms, "map", worldTouch)];
      const m = mapRef.current;
      if (!m) return;
      // how the focus appears: from the request that covers its kind (the insights request knows only insights)
      const split = results.length > 1;
      const fromRes = split ? (st.focus?.startsWith("ins_") ? results.slice(1) : results.slice(0, 1)) : results;
      const hls = fromRes.flatMap((r) => r.highlight ?? []);
      const hlCell = hls.find((h: any) => h.appears_as === "in_cell");
      const appearsAs = hls.find((h: any) => h.appears_as === "single")?.appears_as ?? hlCell?.appears_as ?? hls[0]?.appears_as;
      // while the map is still moving to a new focus, the answer describes the previous area: say nothing yet
      const settling = pendingFocus.current !== null && pendingFocus.current === st.focus;
      // a focus outside the observed period: said as such (the Core's "in a cell" describes the cell, not the focus)
      const fe = st.focus ? store.entity(st.focus) : undefined;
      const ft = fe?.t ?? fe?.details?.t_start_ms ?? null;
      const tw = st.scope.time_window;
      const outsidePeriod = ft != null && tw && !(tw[0] <= ft && ft <= tw[1]);
      setAppearsOf({ id: st.focus, v: st.focus && !settling ? (outsidePeriod ? "outside_period"
        : appearsAs ?? (st.focus.startsWith("rel_") ? "relation" : null)) : null });
      const aggs = results.filter((r) => r.lod === "aggregates"), refs = results.filter((r) => r.lod !== "aggregates");
      // aggregate cells: one weighted point per cell for the density layer (and an invisible touch target)
      const cellFeats: GeoJSON.Feature[] = [];
      let level: number | null = null;
      for (const r of aggs) {
        const cells = r.data.cells as any[];
        const maxN = Math.max(1, ...cells.map((c) => c.n));
        level = r.data.effective_scope.level as number;
        for (const c of cells.slice(0, MAX_FEATURES)) {
          const [w, e, s, n] = c.bbox;
          const isHl = hlCell && hlCell.cell && hlCell.cell.x === c.x && hlCell.cell.y === c.y ? 1 : 0;
          cellFeats.push({ type: "Feature", geometry: { type: "Point", coordinates: [(w + e) / 2, (s + n) / 2] },
            properties: { n: c.n, w: Math.sqrt(c.n / maxN), bb: JSON.stringify(c.bbox), hl: isHl, dom: c.dominant_type ?? "" } });
        }
      }
      // the density's radius follows the cells' spacing on screen (512·2^zoom / 2^level px): the blobs always merge
      // into one continuous field — never columns, rows or squares, whatever the zoom, the level or the screen
      if (level !== null) {
        const r0 = (DENSITY_SPREAD * 512) / 2 ** level;
        mapRef.current?.setPaintProperty("nexum-density", "heatmap-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, r0, 22, r0 * 2 ** 22]);
      }
      const ids: string[] = [];
      for (const r of refs) {
        const d = store.normalize(r.data);
        for (const x of d.items) if (ids.length < MAX_FEATURES) ids.push(x.$ref);
      }
      idsRef.current = ids;
      const types = store.get().types;
      const feats = ids.map((id) => {
        const e = store.entity(id)!;
        const t = types.get(e.type);
        return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: e.point! },
          properties: { id, k: e.kind, c: colorOf(t?.family, e.kind), o: bandOpacity[band(e.confidence)],
            p: t?.density_priority ?? 9, f: t?.family ?? "" } };
      }).filter((f) => f.geometry.coordinates);
      (m.getSource("nexum-items") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      (m.getSource("nexum-cells") as GeoJSONSource).setData({ type: "FeatureCollection", features: cellFeats });
      applyEmphasis();
      const main = results[0];
      const lod = aggs.length ? "aggregates" : main.lod;
      const sum = (k: string) => results.reduce((a, r) => a + (r[k] ?? 0), 0);
      store.set({ mapInfo: { lod, level: aggs.length ? level : main.data.effective_scope?.level ?? null,
        returned: cellFeats.length + ids.length, total: sum("total") || ids.length,
        truncated: results.some((r) => r.truncated), noGeometry: results.reduce((a, r) => a + (r.excluded?.no_geometry ?? 0), 0),
        ms: Math.round(performance.now() - t0) } });
      setNote(null);   // elements without a position are listed in the world summary, not over the map
      if (!firstDone.current) {
        firstDone.current = true;
        m.once("idle", () => performance.mark("nexum:ready"));
      }
      performance.mark("nexum:map:rendered");
    } catch (e) {
      if (!isSuperseded(e)) setNote(`${S.error}: ${(e as Error).message}`);
    }
  };

  const floor = useStore((s) => s.mapFloor);
  const mapTypes = useStore((s) => s.mapTypes);
  useEffect(() => { if (ready) schedule(); /* eslint-disable-next-line */ }, [ready, JSON.stringify(scope), wv, focus, floor, JSON.stringify(mapTypes)]);

  // the own point layers: installed the first time their type is shown, then simply turned on and off
  const ownLayers = useRef<Map<string, Promise<PointLayer>>>(new Map());
  const types = useStore((s) => s.types);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const drawn = ownDrawn(store.get());
    for (const t of OWN_POINT_TYPES) {
      const on = drawn.includes(t);
      let l = ownLayers.current.get(t);
      if (!l && !on) continue;
      if (!l) { l = import("../map/points").then((mod) => mod.installPoints(m, t, "nexum-sel")); l.catch(() => ownLayers.current.delete(t)); ownLayers.current.set(t, l); }
      l.then((x) => { if (mapRef.current === m) x.setActive(ownDrawn(store.get()).includes(t)); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(scope.types), JSON.stringify(mapTypes), types]);
  useEffect(() => () => { ownLayers.current.forEach((l) => l.then((x) => x.destroy())); ownLayers.current.clear(); }, [hasGeo]);

  const mapFit = useStore((s) => s.mapFit);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !mapFit) return;
    const [w, s_, e, n] = mapFit.bbox;
    m.fitBounds([[w, s_], [e, n]], { padding: 32, duration: 400, maxZoom: 8 });
  }, [ready, mapFit]);

  // ── selection: ring on focus/secondary; the view moves to the selection chosen elsewhere (D9) ──
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const feats: GeoJSON.Feature[] = [];
    for (const [id, role] of [[focus, "focus"], [secondary, "secondary"]] as const) {
      const p = pointOf(id);
      if (id && p) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { role, id } });
    }
    (m.getSource("nexum-sel") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    // ONE indicator per selection (2026-10-07, physical test): the ring of the aggregate cell holding the focus marks
    // where the focus is only when the focus has no ring of its own (its position not known); otherwise it was a second,
    // empty and offset circle for the same selection (at the cell's centre, until zooming in turned cells into elements)
    if (m.getLayer("nexum-cells-hl")) m.setFilter("nexum-cells-hl", feats.some((f) => f.properties?.role === "focus") ? ["==", ["get", "hl"], -1] : ["==", ["get", "hl"], 1]);
    const geom = store.entity(focus)?.details?.geometry;
    (m.getSource("nexum-focus-geom") as GeoJSONSource).setData(
      geom && /Polygon|LineString/.test(geom.type) ? { type: "Feature", geometry: geom, properties: {} } : EMPTY);   // areas and lines (e.g. a priced road)
    // a line (e.g. a priced road) is framed whole once, when chosen: its course is what the person came to see
    if (geom && /LineString/.test(geom.type) && framed.current !== focus) {
      framed.current = focus;
      const bb = lineBox(geom);
      if (bb) m.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 60, duration: 400, maxZoom: 11 });
    }
    // relation lines from the focus to related elements that have a place
    const fp = pointOf(focus);
    const lines: GeoJSON.Feature[] = [];
    // an explorable element (a large area) contains hundreds of elements: "located in" is not drawn as a web
    // of lines; its links appear on request ("Mostra i collegamenti sulla mappa") or when one element is chosen
    const quiet = !!store.get().types.get(store.entity(focus)?.type ?? "")?.explore && mapLinks !== focus;
    if (fp && context?.id === focus && !quiet) {
      for (const sec of ["related_objects", "related_events"]) {
        for (const it of context.data?.[sec]?.items ?? []) {
          if (String(it.reason ?? "").startsWith("shares_participant")) continue;   // context, not a connection
          const p = store.entity(it.$ref)?.point;
          if (p && it.$ref !== focus) lines.push({ type: "Feature", geometry: { type: "LineString", coordinates: [fp, p] }, properties: { r: it.$ref } });
        }
      }
    }
    (m.getSource("nexum-links") as GeoJSONSource).setData({ type: "FeatureCollection", features: lines.slice(0, 200) });
    applyEmphasis();
    drawLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus, secondary, rev, context, mapLinks]);

  const applyEmphasis = () => {
    const m = mapRef.current;
    if (!m) return;
    const st = store.get();
    const k = st.focus ? DENSITY_OPACITY.focus : DENSITY_OPACITY.idle;
    m.setPaintProperty("nexum-density", "heatmap-opacity", ["interpolate", ["linear"], ["zoom"], 0, k, 3, 0.8 * k, 4.8, 0.35 * k, LOCAL_Z, 0]);
    m.setPaintProperty("nexum-items", "icon-opacity", st.focus ? ITEM_OPACITY_FOCUS : ITEM_OPACITY_IDLE);
    m.removeFeatureState({ source: "nexum-items" });
    if (!st.focus) return;
    const ctx = st.context?.id === st.focus ? st.context.data : null;
    const linked = [st.focus, ...[...(ctx?.related_objects?.items ?? []), ...(ctx?.related_events?.items ?? [])]
      .filter((it: any) => !String(it.reason ?? "").startsWith("shares_participant")).map((it: any) => it.$ref)];
    for (const id of linked) m.setFeatureState({ source: "nexum-items", id }, { lk: true });
  };

  // SECURITY ZONES on request (display only): the cells of the zones computed from UCDP, red and orange
  const mapZones = useStore((s) => s.mapZones);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const src = m.getSource("nexum-zones") as GeoJSONSource | undefined;
    if (!src) return;
    if (!mapZones) { src.setData(EMPTY); return; }
    import("../components/Security").then((mod) => mod.loadSecurity(store.get().worldVersion)).then((d) => {
      src.setData({ type: "FeatureCollection", features: d.zones.flatMap((z) => z.cells.map(([x, y]) => ({ type: "Feature" as const,
        properties: { color: z.color, zone: z.id, place: z.place },
        geometry: { type: "Polygon" as const, coordinates: [[[x, y], [x + 0.5, y], [x + 0.5, y + 0.5], [x, y + 0.5], [x, y]]] } }))) });
    }).catch(() => {});
  }, [ready, mapZones, wv]);

  // WORLD MODE markers: the notable events (recent and strongest) while nothing is in focus and the period and filters
  // are the starting ones (never contradicting a choice of the person)
  const hlIds = useRef<string[]>([]);
  const hlLabels = useRef<Map<string, string>>(new Map());
  const period = useStore((s) => s.period);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const st = store.get();
    const plain0 = !focus && st.period.kind === "last12" && !Array.isArray(st.scope.types) && !st.scope.sources && !st.scope.min_confidence;
    const src = m.getSource("nexum-hl") as GeoJSONSource;
    if (!plain0) { hlIds.current = []; src.setData(EMPTY); drawLabels(); return; }
    call<any>("/highlights", undefined, { channel: "map-highlights" }).then((r) => {
      for (const c of r.data.connections ?? []) register(c.ref.id, c.summary);
      const d = store.normalize(r.data);
      // what NEXUM found first (named by its facts), then the strongest events (named by their fact)
      const labels = new Map<string, string>();
      for (const c of d.connections) { const t = shortLabel(summaryOf(c.ref.$ref), typeLabelOf); if (t) labels.set(c.ref.$ref, t); }
      for (const x of d.strongest.slice(0, 4)) {
        const e = store.entity(x.$ref);
        labels.set(x.$ref, [typeLabelOf(e?.type ?? ""), head(x.head)].filter(Boolean).join(" "));
      }
      const shownTypes = mapScope(store.get()).types;
      const drawn = (id: string) => { const e = store.entity(id);
        return !!e && (!Array.isArray(shownTypes) || shownTypes.includes(e.type) || (e.kind === "insight" && shownTypes.some((t) => !store.get().types.has(t)))); };
      const ids = [...labels.keys()].filter((id) => store.entity(id)?.point && drawn(id));
      hlIds.current = ids;
      hlLabels.current = labels;
      const types = store.get().types;
      src.setData({ type: "FeatureCollection", features: ids.map((id) => {
        const e = store.entity(id)!;
        return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: e.point! },
          properties: { id, k: e.kind, c: colorOf(types.get(e.type)?.family, e.kind) } };
      }) });
      drawLabels();
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus, wv, period, JSON.stringify(scope), JSON.stringify(mapTypes)]);

  // ESPLORA: back to the world as at the start
  const homeTick = useStore((s) => s.homeTick);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !homeTick) return;
    lastMoved.current = null;
    m.easeTo({ center: START_CENTER, zoom: 1.2, duration: 400 });
  }, [homeTick, ready]);
  const lastMoved = useRef<string | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !focus || lastMoved.current === focus) return;
    lastMoved.current = focus;
    if (store.get().origin === "map") {
      // touched on the map: if the focus card now covers it, the map moves it into the visible part
      const p = pointOf(focus);
      const card = document.querySelector(".touch.as-sheet .insp") as HTMLElement | null;
      if (p && card) {
        const h = m.getContainer().clientHeight, sheetH = Math.min(h * 0.6, card.offsetHeight);
        if (m.project(p).y > h - sheetH - 24) m.easeTo({ center: p, duration: 300, offset: [0, -sheetH / 2] });
      }
      return;
    }
    pendingFocus.current = focus;
    const settle = () => { if (pendingFocus.current === focus) { pendingFocus.current = null; schedule(); } };
    // an area is framed by its largest polygon (its mainland, not the box of all its territories); its geometry
    // comes with the element's own card (the same request, cached)
    Promise.all([call<any>(`/entities/${focus}/locate`, undefined, { channel: "map-locate" }),
      call<any>(`/entities/${focus}`, undefined, { channel: `map-geom-${focus}` }).catch(() => null)]).then(([r, ent0]) => {
      const loc = r.data.map;
      const main = ent0 ? largestBox(ent0.data?.geometry) : null;
      if (loc?.point && main && ent0) { loc.bbox = main; const a = areaAnchorOf(focus, ent0.data.geometry); if (a) loc.point = a; }
      if (!loc?.point || !mapRef.current) { settle(); return; }
      const ent = store.entity(focus);   // reached without its point (deep link, trail): ring and label need it
      located.set(focus, loc.point);
      if (ent && !ent.point) store.upsert({ kind: ent.kind, id: ent.id, type: ent.type, label: ent.label, point: loc.point });
      const [w, s, e, n] = loc.bbox ?? [loc.point[0], loc.point[1], loc.point[0], loc.point[1]];
      let moving = true;
      // the focus card covers the bottom of the map on phones: the focus is placed in the visible part (a one-off
      // offset of this move, never a persistent padding of the map)
      const H = m.getContainer().clientHeight;
      const sheetH = Math.min(H * 0.6, (document.querySelector(".touch.as-sheet .insp") as HTMLElement | null)?.offsetHeight ?? 0);
      const pad = { top: 30, left: 30, right: 30, bottom: Math.min(H - 110, 30 + sheetH) };
      if (e - w > 0.5 || n - s > 0.5) m.fitBounds([[w, s], [e, n]], { padding: pad, duration: 300, maxZoom: 6 });
      else if (!m.getBounds().contains(loc.point) || m.getZoom() < 3 || sheetH > 0)
        m.easeTo({ center: loc.point, zoom: Math.max(m.getZoom(), 4), duration: 300, offset: [0, -sheetH / 2] });
      else moving = false;
      if (moving) { m.once("moveend", settle); window.setTimeout(settle, 2000); } else settle();
    }).catch(settle);
  }, [ready, focus]);

  // ── HTML labels (D4: Phase 2 solution, isolated here) ────────────────────
  const raf = useRef(0);
  // Place names of the backdrop (same source as the borders): fetched once, drawn with the level of detail the
  // source recommends; the place names of the focus's connections are drawn first and highlighted.
  const placeNames = useRef<{ name: string; x: number; y: number; min_zoom: number; rank: number }[] | null>(null);
  useEffect(() => {
    if (!hasGeo) return;
    plain<any>("/basemap/labels.json").then((d) => { placeNames.current = d.labels ?? []; drawLabels(); }, () => { placeNames.current = []; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGeo]);

  const drawLabels = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const m = mapRef.current, host = labelsEl.current;
      if (!m || !host) return;
      const st = store.get();
      const w = host.clientWidth, h = host.clientHeight;
      // the map's own controls (chips, legend, zoom, the strip) are taken first: a label never slips under them
      const hb = host.getBoundingClientRect();
      const boxes: [number, number, number, number][] = [...document.querySelectorAll(".view-toolbar > *, .map-legend, .maplibregl-ctrl-group, .card-strip, .map-appears, .ops-hud, .ops-rail, .ops-rail-toggle, .ops-panel, .ops-card, .ops-foot, .pts-legend, .pts-pop")]
        .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
        .map((r) => [r.left - hb.left, r.top - hb.top, r.right - hb.left, r.bottom - hb.top] as [number, number, number, number]);
      const out: string[] = [];
      const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      // one label at a screen point; `center` for place names, to the right of the mark for elements
      const put = (x: number, y: number, text: string, cls: string, center: boolean, force = false) => {
        if (x < 0 || y < 0 || x > w || y > h) return false;
        const cw = cls.includes("place") ? 7.2 : cls ? 7.4 : 6.4;
        const lines = cls.includes("ins") ? Math.min(3, Math.ceil((text.length * cw) / 220)) : 1;   // what NEXUM found wraps, never cut
        const bw = Math.min(220, text.length * cw) + 10, bh = 16 * lines;
        const flip = !center && x + 6 + bw > w;                // too close to the right edge: the name goes to the left
        const bx = center ? x - bw / 2 : flip ? x - 6 - bw : x + 6, by = y - 8;
        if (!force && boxes.some(([x1, y1, x2, y2]) => bx < x2 && bx + bw > x1 && by < y2 && by + bh > y1)) return false;
        boxes.push([bx, by, bx + bw, by + bh]);
        const named = cls.includes("place") && exploreTypes().length > 0;
        out.push(`<div class="maplabel ${cls}${named ? " explorable" : ""}${flip ? " flip" : ""}"${named ? ` role="button" data-name="${esc(text)}"` : ""} style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;max-width:${Math.max(80, Math.min(220, flip ? x - 12 : w - x - 12))}px">${esc(text)}</div>`);
        return true;
      };
      const place = (id: string, cls: string, force = false) => {
        const e = store.entity(id), pt = pointOf(id);
        if (!e || !pt || occluded(m, pt)) return;
        const p = m.project(pt);
        put(p.x, p.y, e.label, cls, false, force);
      };
      const zWeb = m.getZoom() + 1;                          // the source's zoom scale (256 px tiles)
      const names = (placeNames.current ?? []).filter((n) => {
        if (occluded(m, [n.x, n.y])) return false;
        const p = m.project([n.x, n.y]);
        return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
      });
      const byName = new Map(names.map((n) => [n.name, n]));
      const used = new Set<string>();
      const putName = (n: { name: string; x: number; y: number }, cls: string) => {
        const p = m.project([n.x, n.y]);
        // a place name may move a little from its label point rather than disappear behind another label
        for (const dy of [0, 20, -20, 40, -40]) if (put(p.x, p.y + dy, n.name, cls, true)) { used.add(n.name); return; }
      };
      // 1. focus
      if (st.focus) place(st.focus, "focus", true);
      if (st.secondary) place(st.secondary, "focus", true);
      const max = w < 600 ? 14 : 34;
      if (st.focus) {
        // 2. the focus's connections (a connected place is named at its label point, once) — for an explorable element
        // only when its links are shown (its containment is not a list of names over the map)
        const quietNames = !!st.types.get(store.entity(st.focus)?.type ?? "")?.explore && st.mapLinks !== st.focus;
        const ctx = st.context?.id === st.focus && !quietNames ? st.context.data : null;
        const linked = [...(ctx?.related_objects?.items ?? []), ...(ctx?.related_events?.items ?? [])]
          .filter((it: any) => !String(it.reason ?? "").startsWith("shares_participant")).map((it: any) => it.$ref);
        for (const id of linked) {
          if (out.length >= max) break;
          if (id === st.focus) continue;
          const n = byName.get(store.entity(id)?.label ?? "");
          if (n) putName(n, "place linked"); else place(id, "linked");
        }
        // 3. geography: the place names the source recommends at this zoom
        for (const n of names) { if (out.length >= max) break; if (!used.has(n.name) && n.min_zoom <= zWeb) putName(n, "place"); }
        host.innerHTML = out.join("");
        return;
      }
      // WORLD MODE: the notable events first (named), then geography, then the most relevant elements
      for (const id of hlIds.current) {
        if (out.length >= max) break;
        const pt = pointOf(id), text = hlLabels.current.get(id);
        if (!pt || !text || occluded(m, pt)) continue;
        const p = m.project(pt);
        put(p.x, p.y, text, id.startsWith("ins_") ? "hl ins" : "hl", false);
      }
      for (const n of names) { if (out.length >= max) break; if (n.min_zoom <= zWeb) putName(n, "place"); }
      const ids = [...idsRef.current].sort((a, b) => {
        const ea = store.entity(a)!, eb = store.entity(b)!;
        const pa = st.types.get(ea.type)?.density_priority ?? 9, pb = st.types.get(eb.type)?.density_priority ?? 9;
        return pa - pb || (eb.confidence ?? 0) - (ea.confidence ?? 0);
      });
      for (const id of ids) { if (out.length >= max) break; if (id !== st.focus) place(id, ""); }
      host.innerHTML = out.join("");
    });
  };

  if (!hasGeo) {
    const total = Object.values(status?.counts ?? {}).reduce((a, b) => a + b, 0);
    return <div className="overlay-center" data-testid="map-na"><div>{S.mapNotApplicable(total)}</div></div>;
  }
  return (
    <>
      <div ref={el} style={{ position: "absolute", inset: 0 }} data-testid="map" data-selected={focus ?? ""}
        data-appears={focus ? (appears ?? "single") : ""} />
      {/* place names open the element they name (an explorable type: one click, no search, no hunting for a dot) */}
      <div ref={labelsEl} className="maplabels" data-testid="map-labels" onClick={(ev) => {
        const name = (ev.target as HTMLElement).closest<HTMLElement>(".maplabel.explorable")?.dataset.name;
        if (name) openNamed(name, "map-name");
      }} />
      <div ref={tipEl} className="tooltip" style={{ display: "none" }} />
      <div className="view-toolbar">
        {touch && <><PeriodChip /><FiltersChip /><ResetChip /></>}
        {!touch && focus && <SelectionChip id={focus} />}
        {focus && appears && appears !== "single" && <FocusNote appears={appears} focus={focus} map={mapRef.current} />}
        {touch && !focus && status && <Legend />}
      </div>
      {!touch && !focus && status && <Legend />}
      {note && <div className="overlay-note" data-testid="map-note">{note}</div>}
      {opsReady && mapRef.current && <Boundary name="ops"><Suspense fallback={null}><OpsShell map={mapRef.current} /></Suspense></Boundary>}
      <div className="phone-attr" data-testid="map-attr"><Freshness /> · <SnapshotAge compact />{SNAPSHOT ? " · " : ""}{S.status.data}: {[...new Set([...credits, ...(status?.sources ?? []).map((s) => s.attribution),
        status?.basemap?.["nexum:attribution"]].filter(Boolean))].join(" · ")}</div>
    </>
  );
}

/** The active selection, named on the map (2026-10-08, physical test: an outline stayed and nothing said why). The orange
 *  outline and ring mark it; × ends it (the trail of the investigation keeps its steps). */
function SelectionChip({ id }: { id: string }) {
  const e = useEntity(id);
  if (!e) return null;
  return (
    <span className="chip sel-chip" data-testid="selection-chip" title={S.sel.explain}>
      <button type="button" className="linklike" onClick={() => store.set({ inspectorOpen: true, panel: "object" })}>{S.sel.active}: <b>{e.label}</b></button>
      <button type="button" className="sel-clear" aria-label={S.sel.clear} title={S.sel.clear} data-testid="selection-clear" onClick={() => store.select(null, "map")}>×</button></span>);
}

/** How the focus appears on the map, in words, with the action that shows it. */
function FocusNote({ appears, focus, map }: { appears: string; focus: string; map: MLMap | null }) {
  const p = pointOf(focus);
  const inView = !!(p && map && map.getBounds().contains(p));
  const go = (zoom: number) => p && map?.easeTo({ center: p, zoom, duration: 300 });
  let text: string, action: (() => void) | null = null, label = "";
  if (appears === "outside_period") {
    const ent = store.entity(focus);
    const year = new Date(ent?.t ?? ent?.details?.t_start_ms ?? 0).getUTCFullYear();
    text = S.focusOutsidePeriod; action = () => store.setPeriod({ kind: "year", year }); label = S.period.goYear(year);
  } else if (appears === "in_cell") { text = S.inCell; action = () => go(Math.max(map?.getZoom() ?? 0, 7)); label = S.zoomIn; }
  else if (appears === "not_applicable") text = S.notOnMap;
  else if (appears === "relation") text = S.kinds.relation;
  else if (inView) {
    const ent = store.entity(focus), w = store.get().scope.time_window;
    const t = ent?.t ?? ent?.details?.t_start_ms ?? null;
    if (t != null && w && !(w[0] <= t && t <= w[1])) {
      const year = new Date(t).getUTCFullYear();
      text = S.focusOutsidePeriod; action = () => store.setPeriod({ kind: "year", year }); label = S.period.goYear(year);
    } else text = store.get().mapFloor > 0 ? S.focusDespiteFilters : S.excludedByFilters;
  }
  else { text = S.outsideScope; action = () => go(Math.max(map?.getZoom() ?? 0, 4)); label = S.showOnMap; }
  return (
    <span className="chip acc focus-chip" data-testid="map-appears" data-appears={appears}>
      {text}{action && <button type="button" className="xs" data-testid="map-appears-action" onClick={action}>{label}</button>}</span>);
}

/** WORLD MODE: what the map shows (kinds, period), that lighter areas group several elements, what a touch does. */
/** The types the vocabulary marks as explorable (their names on the map open them). */
const exploreTypes = () => [...store.get().types.values()].filter((t) => t.explore).map((t) => t.id);
const named = new Map<string, string | null>();
/** Open the explorable element a place name names (its label, or failing that the first explorable match). */
async function openNamed(name: string, origin: string) {
  let id = named.get(name);
  if (id === undefined) {
    // the type filter applies to the best-scored rows (as in the Core): ask enough of them for the place to be among them
    const r = await call<any>("/search", { q: name, s: { types: exploreTypes() }, b: { max_items: 50 } }, { channel: "map-name" }).catch(() => null);
    const items = ((r?.data?.groups ?? []) as any[]).flatMap((g) => g.items);
    const low = name.toLowerCase();
    id = (items.find((it) => it.label?.toLowerCase() === low) ?? items[0])?.id ?? null;
    named.set(name, id ?? null);
  }
  if (id) store.select(id, origin);
}
/** [west, south, east, north] of a (Multi)LineString. */
function lineBox(g: any): [number, number, number, number] | null {
  const pts: number[][] = g.type === "LineString" ? g.coordinates : g.coordinates.flat();
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
/** Point in a (Multi)Polygon, lng/lat (ray casting). */
function inGeometry(pt: [number, number], g: any): boolean {
  const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  const ring = (r: number[][]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return polys.some((p: number[][][]) => ring(p[0]) && !p.slice(1).some(ring));
}

function Legend() {
  const status = useStore((s) => s.status);
  const types = useStore((s) => s.types);
  const info = useStore((s) => s.mapInfo);
  const pname = usePeriodName();
  if (!status) return null;
  // by nature, not by type: the colours of the domains are explained by the element itself when touched
  const kinds = new Set<string>();
  for (const [t, n] of Object.entries(status.by_type)) {
    if (!n) continue;
    const ty = types.get(t);
    kinds.add(ty ? ty.kind : "insight");
  }
  const items = (["event", "object", "insight"] as const).filter((k) => kinds.has(k))
    .map((k) => ({ key: k, shape: SHAPE[k], color: k === "insight" ? colorOf(undefined, "insight") : "#A3ADB3", label: S.legend.kinds[k] }));
  return (
    <div className="map-legend" data-testid="map-legend">
      {items.map((it) => <span key={it.key} className="lg-item"><span style={{ color: it.color }}>{it.shape}</span> {it.label}</span>)}
      {pname && <span className="lg-item" data-testid="legend-period">{S.period.legend(pname)} · {S.period.always}</span>}
      {innerWidth < DESK_W ? (info?.lod === "aggregates" && <span className="lg-hint">{S.m.density}</span>)
        : <span className="lg-hint">{S.legend.hint}{info?.lod === "aggregates" ? ` · ${S.legend.groups}` : ""}</span>}
      {/* the map's illumination says what is computed now and what is a reference image */}
      <span className="lg-hint lg-light" data-testid="legend-illumination" title={S.legend.lightsCredit}>{S.legend.daylight} · {S.legend.lights}</span>
    </div>);
}

