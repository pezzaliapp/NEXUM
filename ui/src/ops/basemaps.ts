// THE OPERATIONAL BASEMAP (2026-10-04): what lies under NEXUM's information, chosen by the person —
//   MAP    NEXUM's own cartography, with the street-level detail of OpenFreeMap (OpenMapTiles vector tiles) from the
//          regional scale: water, land use, roads, buildings, street and place names;
//   SAT    true-colour imagery: NASA Blue Marble at world scale, Sentinel-2 cloudless (EOX, 2016 mosaic, CC BY 4.0)
//          from the continental scale, with the roads and names of the map on top (hybrid);
//   OGGI   the Earth of yesterday/today seen by VIIRS (NASA GIBS daily true colour, ≤ 375 m) — an image of a date, said so.
// Optional layers: terrain (AWS Terrain Tiles, 3D relief and hillshade), 3D buildings (OpenMapTiles), clouds (NOAA
// GMGSI infrared, hourly) and precipitation (NASA IMERG, daily). The projection: globe or flat (Web Mercator).
// The Earth's illumination (night and reference lights) stays where it is: over the land, under every NEXUM layer.
// Every provider is keyless, €0, CORS-open; nothing is proxied, copied or cached outside the browser's own cache.

import type { LayerSpecification, Map as MLMap, StyleSpecification } from "maplibre-gl";
import OPS from "../config/ops.json";
import { store } from "../store";
import { ops, type OpsState } from "./state";

const B = OPS.basemap;
/** The day whose daily imagery is complete everywhere (yesterday, UTC). */
export const dailyDate = (now = Date.now()) => new Date(now - 86400_000).toISOString().slice(0, 10);

let vectorStyle: Promise<StyleSpecification | null> | null = null;
const loadVector = () => (vectorStyle ??= fetch(B.vector.style).then((r) => (r.ok ? r.json() : null)).catch(() => null));

const SAT_HIDE = /^(ofm-)(water$|landcover|landuse|building$|aeroway-area|road_area)/;
// the hybrid palette over imagery: roads as light lines (major ones brighter), names white on a dark halo
const major = (id: string) => /motorway|major|trunk|primary/.test(id);
const LINE_ON_IMAGE: [string, any][] = [["line-color", (id: string) => (major(id) ? "#FFE9A8" : "#FFFFFF")],
  ["line-opacity", (id: string) => (major(id) ? 0.85 : 0.6)]];
const TEXT_ON_IMAGE: [string, any][] = [["text-color", "#FFFFFF"], ["text-halo-color", "rgba(0,0,0,0.85)"], ["text-halo-width", 1.6]];

/** The credits of the third-party tiles drawn now: every visible layer on a basemap source (SAT, OGGI, relief, clouds,
 *  precipitation, OpenFreeMap) and the 3D terrain — each provider's own attribution, as its terms ask (S33). */
export function visibleCredits(map: MLMap): string[] {
  const st = map.getStyle();
  if (!st) return [];
  const out = new Set<string>();
  const add = (id?: string | null) => { const a = id ? (st.sources[id] as any)?.attribution : null; if (a) out.add(a); };
  for (const l of st.layers) {
    const src = (l as any).source;
    if (typeof src !== "string" || !(src.startsWith("ops-") || src === "openmaptiles")) continue;
    if ((l.layout as any)?.visibility === "none") continue;
    add(src);
  }
  add(map.getTerrain()?.source);
  return [...out];
}

/** Install the basemap modes and optional layers; follows the operational state. Returns a stop function. */
export function installBasemaps(map: MLMap): () => void {
  const under = map.getLayer("nexum-density") ? "nexum-density" : "nexum-illumination";
  const overNight = map.getLayer("basemap-borders") ? "basemap-borders" : undefined;
  const top = map.getLayer("nexum-focus-fill") ? "nexum-focus-fill" : undefined;
  const ofmIds: string[] = [];
  const original = new Map<string, any>();   // the style's own paint values, restored on the map

  // ── SAT and OGGI (rasters, hidden until chosen) ──
  for (const s of B.sat) {
    map.addSource(s.id, { type: "raster", tiles: s.tiles, tileSize: 256, maxzoom: s.maxzoom, ...(s.minzoom ? { minzoom: s.minzoom } : {}), attribution: s.attribution });
    map.addLayer({ id: s.id, type: "raster", source: s.id, layout: { visibility: "none" }, paint: { "raster-fade-duration": 150 } }, under);
  }
  const todaySrc = (d: string) => ({ type: "raster" as const, tiles: B.today.tiles.map((t) => t.replace("{date}", d)), tileSize: 256, maxzoom: B.today.maxzoom,
    attribution: B.today.attribution.replace("{date}", d) });
  let todayDate = dailyDate();
  map.addSource(B.today.id, todaySrc(todayDate));
  map.addLayer({ id: B.today.id, type: "raster", source: B.today.id, layout: { visibility: "none" } }, under);

  // ── terrain (DEM: 3D relief on request, hillshade) ──
  map.addSource("ops-dem", { type: "raster-dem", tiles: B.terrain.tiles, tileSize: 256, maxzoom: B.terrain.maxzoom, encoding: "terrarium", attribution: B.terrain.attribution });
  map.addLayer({ id: "ops-hillshade", type: "hillshade", source: "ops-dem", layout: { visibility: "none" },
    paint: { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#3A4650", "hillshade-accent-color": "#11161A", "hillshade-exaggeration": 0.45 } }, under);

  // ── clouds and precipitation (over the land and the night, under the borders and NEXUM's layers) ──
  map.addSource("ops-clouds", { type: "raster", tiles: B.clouds.tiles, tileSize: 256, maxzoom: B.clouds.maxzoom, attribution: B.clouds.attribution });
  map.addLayer({ id: "ops-clouds", type: "raster", source: "ops-clouds", layout: { visibility: "none" },
    paint: { "raster-opacity": 0.55, "raster-fade-duration": 0 } }, overNight);
  const precipSrc = (d: string) => ({ type: "raster" as const, tiles: B.precip.tiles.map((t) => t.replace("{date}", d)), tileSize: 256, maxzoom: B.precip.maxzoom,
    attribution: B.precip.attribution.replace("{date}", d) });
  map.addSource("ops-precip", precipSrc(todayDate));
  map.addLayer({ id: "ops-precip", type: "raster", source: "ops-precip", layout: { visibility: "none" }, paint: { "raster-opacity": 0.7 } }, overNight);

  // ── MAP detail: OpenFreeMap's layers, from the regional scale (NEXUM's own cartography rules the world scale) ──
  let ofmReady = false, ofmAsked = false;
  // the provider could not be reached: said, and STRADE turned off (never left "on" without its layer); asked again on
  // the next request
  const failed = () => { ofmAsked = false; vectorStyle = null; ops.set({ streetsStatus: "error", layers: { ...ops.get().layers, streets: false } }); };
  const startVector = () => { if (ofmAsked) return; ofmAsked = true; ops.set({ streetsStatus: "loading" }); loadVector().then((st) => {
    if (!map.getStyle()) return;
    if (!st) { failed(); return; }
    const src = (st.sources as any).openmaptiles;
    if (!src) { failed(); return; }
    map.addSource("openmaptiles", { ...src, attribution: B.vector.attribution });
    if (st.glyphs) map.setGlyphs(st.glyphs);
    if (st.sprite && typeof st.sprite === "string") map.setSprite(st.sprite);
    for (const l of st.layers as LayerSpecification[]) {
      if (l.type === "background" || !("source" in l) || l.source !== "openmaptiles") continue;
      // the national and regional outlines and names are NEXUM's own (borders and place labels): not duplicated
      if (/^boundary_country|^place_country|^place_state|^place_city_large/.test(l.id)) continue;
      const sym = l.type === "symbol";
      const minzoom = Math.max((l as any).minzoom ?? 0, sym ? B.vector.labelMinZoom : B.vector.fillMinZoom);
      const layer = { ...l, id: `ofm-${l.id}`, minzoom } as LayerSpecification;
      map.addLayer(layer, sym ? top : under);
      ofmIds.push(layer.id);
    }
    // 3D buildings: the same OpenMapTiles building heights, extruded when the map is tilted
    map.addLayer({ id: "ops-buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      layout: { visibility: "none" },
      paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0], 0, "#20272C", 40, "#2C363D", 120, "#3B4952"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, ["coalesce", ["get", "render_height"], 0]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.85 } }, top);
    ofmReady = true;
    ops.set({ streetsStatus: "ready" });
    apply(ops.get(), true);
  }); };
  // tiles of the provider refused (network, CSP, provider down) while the street detail is asked: said
  map.on("error", (e: any) => { if (e?.sourceId === "openmaptiles" && ops.get().layers.streets && ops.get().streetsStatus !== "error") ops.set({ streetsStatus: "error" }); });

  const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
  let last: OpsState | null = null;
  const apply = (s: OpsState, force = false) => {
    if (!force && last && last.base === s.base && last.projection === s.projection && last.layers === s.layers) return;
    const prev = last;
    last = s;
    const sat = s.base === "sat", today = s.base === "today";
    // STREETS (STRADE) is the only switch of the street detail, in every mode: off → the map or the picture alone; on →
    // roads, streets and names of OpenFreeMap. It is a third-party basemap: asked only when the person turns it on (O2)
    const streets = s.layers.streets;
    if (streets) startVector();
    for (const r of B.sat) vis(r.id, sat);
    vis(B.today.id, today);
    if (ofmReady) for (const id of ofmIds) {
      // over imagery the vector fills give way to the picture (hybrid); on the map the whole street detail
      vis(id, streets && (!(sat || today) || !SAT_HIDE.test(id)));
      const t = map.getLayer(id)?.type;
      // over imagery a legible palette (light roads, white names on a dark halo); on the map the style's own colours
      for (const [prop, onImage] of (t === "line" ? LINE_ON_IMAGE : t === "symbol" ? TEXT_ON_IMAGE : []) as [string, any][]) {
        const key = `${id}|${prop}`;
        if (!original.has(key)) original.set(key, map.getPaintProperty(id, prop as any));
        try { map.setPaintProperty(id, prop as any, sat || today ? (typeof onImage === "function" ? onImage(id) : onImage) : original.get(key)); } catch { /* property not used by this layer */ }
      }
    }
    vis("basemap-land", !(sat || today));
    // over imagery the night stays visible but lighter, so the picture of the night side can still be read (the
    // computed night and the reference lights themselves are unchanged; on the map the approved shading is kept)
    if (map.getLayer("nexum-illumination")) map.setPaintProperty("nexum-illumination", "raster-opacity", sat || today ? 0.55 : 1);
    vis("ops-hillshade", s.layers.hillshade || s.layers.terrain);
    vis("ops-clouds", s.layers.clouds);
    vis("ops-precip", s.layers.precip);
    vis("ops-buildings-3d", s.layers.buildings && s.layers.streets);
    // projection and the freedom to tilt: the globe (and terrain) can be tilted and rotated; flat stays north-up
    if (!prev || prev.projection !== s.projection || prev.layers.terrain !== s.layers.terrain) {
      map.setProjection({ type: s.projection === "globe" ? "globe" : "mercator" });
      if (map.getLayer("nexum-density")) map.setPaintProperty("nexum-density", "heatmap-intensity", s.projection === "globe" ? 0.3 : 0.42);   // as MapView's DENSITY_INTENSITY
      const tilt = s.projection === "globe" || s.layers.terrain;
      map.setMaxPitch(tilt ? 70 : 0);
      if (tilt) { map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.keyboard.enableRotation(); }
      else { map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation(); map.easeTo({ bearing: 0, pitch: 0, duration: 300 }); }
    }
    try { map.setTerrain(s.layers.terrain ? { source: "ops-dem", exaggeration: 1.3 } : null); } catch { /* terrain unsupported here */ }
    // the globe's atmosphere: a thin, dark limb (no decoration over the data)
    try {
      map.setSky({ "sky-color": "#0B0E10", "horizon-color": "#1B2A36", "fog-color": "#0D1012", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.9,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 5, 0.4, 7, 0] as any });
    } catch { /* older style spec */ }
    credits();
  };
  // the credits of what is drawn now, said on screen (status bar, phone strip, Info)
  const credits = () => { const c = visibleCredits(map); if (c.join("\n") !== store.get().mapCredits.join("\n")) store.set({ mapCredits: c }); };
  apply(ops.get(), true);
  const unsub = ops.subscribe(() => apply(ops.get()));
  // the daily imagery and precipitation follow the date (checked hourly)
  const t = window.setInterval(() => {
    const d = dailyDate();
    if (d === todayDate) return;
    todayDate = d;
    for (const [id, mk] of [[B.today.id, todaySrc], ["ops-precip", precipSrc]] as const) {
      const src: any = map.getSource(id);
      src?.setTiles?.(mk(d).tiles);
    }
  }, 3600_000);
  return () => { unsub(); window.clearInterval(t); store.set({ mapCredits: [] }); };
}
