// OPERATIONAL OVERLAYS (on request): the official live channels of public bodies, the ships of the Baltic AIS
// (Digitraffic, CC BY 4.0: commercial and passenger traffic only — pleasure craft are never drawn), the aurora oval
// (NOAA SWPC OVATION, a 30-minute forecast) and the files the person imports (only in this browser).

import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import OPS from "../config/ops.json";
import { spaceWeather as SW } from "../config/ops-space.json";
import { call } from "../lib/api";
import { ops } from "./state";
import { feed, type AlertKind } from "./alerts";

const busy = () => !!((window as any).__nexumDrawing || (window as any).__nexumPicking);   // a tool owns the taps
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
export type Channel = { id: string; name: string; publisher: string; place: string; c: [number, number] };
export const CHANNELS = OPS.live.channels as Channel[];
/** Open an official channel in the live panel (the panel reads it when it mounts, or hears it when already open). */
export function openChannel(id: string) {
  (window as any).__nexumCh = id;
  ops.set({ tool: "live" });
  window.dispatchEvent(new CustomEvent("nexum:channel", { detail: id }));
}
/** What the published tables said about themselves when last loaded (time fetched, source, licence, notes). */
export const tableMeta: Record<string, any> = {};
/** The operational layers whose features say what they are on a tap (the card); the rest are drawn context only:
 *  the aurora oval (a forecast field) and the hotspots' heat at small scales (an aggregate). */
export const INFO_LAYERS = ["ops-choke", "ops-ports", "ops-naval", "ops-quakes", "ops-gdacs", "ops-nws", "ops-news", "ops-ais", "ops-hotspots", "ops-cables", "ops-imported-pt", "ops-imported-line", "ops-imported-fill"];
let hlMap: MLMap | null = null, hlTimer = 0;
/** A card of the live list was chosen: the place is marked on the map for a few seconds (and the map flies there). */
export function highlight(c: [number, number]) {
  const src = hlMap?.getSource("ops-hl") as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }] });
  window.clearTimeout(hlTimer);
  hlTimer = window.setTimeout(() => src.setData(EMPTY), 8000);
}

/** AIS craft types kept (ITU-R M.1371): passenger 60–69, cargo 70–79, tanker 80–89, plus tugs/pilots/SAR 50–59. */
export const commercialShip = (t: number | undefined) => t != null && t >= 50 && t <= 89;
let shipMeta: Promise<Map<number, { name: string; type: number; dest: string }>> | null = null;
const AIS_HEADERS = { "Digitraffic-User": "NEXUM/0.1.0" };
function loadShipMeta() {
  shipMeta ??= fetch(OPS.ais.meta, { headers: AIS_HEADERS }).then((r) => r.json()).then((list: any[]) =>
    new Map(list.map((v) => [v.mmsi, { name: String(v.name ?? "").trim(), type: v.shipType, dest: String(v.destination ?? "").trim() }])));
  shipMeta.catch(() => { shipMeta = null; });
  return shipMeta;
}

/** Imported layers (GeoJSON / CSV files, ArcGIS Online services), kept in memory for this page only: each with its
 *  name, origin, licence, colour and visibility; the map draws the visible ones, every feature tagged with its layer. */
export interface ImportedLayer { id: string; name: string; origin: string; licence?: string; url?: string; owner?: string; color: string; visible: boolean; fc: GeoJSON.FeatureCollection }
export const IMPORT_COLORS = ["#C9A0E0", "#5FB7E5", "#86C5A0", "#E8B04A", "#E07A7A", "#9AA6F0", "#E59AD2", "#B5C96A", "#6FD0C4", "#F2F2F2"];
let layers: ImportedLayer[] = [];
let merged: GeoJSON.FeatureCollection = EMPTY;
const importedSubs = new Set<() => void>();
const remerge = () => {
  merged = { type: "FeatureCollection", features: layers.filter((l) => l.visible).flatMap((l) => l.fc.features.map((f) => ({ ...f,
    properties: { ...(f.properties ?? {}), __lid: l.id, __color: l.color } }))) };
  ops.count("imported", merged.features.length);
  importedSubs.forEach((f) => f());
};
export const importedData = {
  get: () => merged,
  layers: () => layers,
  layer: (id: string) => layers.find((l) => l.id === id),
  add(l: Omit<ImportedLayer, "id" | "color" | "visible">) {
    const id = `imp${Date.now().toString(36)}${layers.length}`;
    layers = [...layers, { ...l, id, color: IMPORT_COLORS[layers.length % IMPORT_COLORS.length], visible: true }];
    remerge(); return id;
  },
  update(id: string, patch: Partial<ImportedLayer>) { layers = layers.map((l) => (l.id === id ? { ...l, ...patch } : l)); remerge(); },
  remove(id: string) { layers = layers.filter((l) => l.id !== id); remerge(); },
  subscribe(f: () => void) { importedSubs.add(f); return () => { importedSubs.delete(f); }; },
};

export function installOverlays(map: MLMap, before?: string): () => void {
  // ── official live channels ──
  map.addSource("ops-channels", { type: "geojson", data: { type: "FeatureCollection", features: CHANNELS.map((c) => ({ type: "Feature" as const,
    properties: { id: c.id, name: c.name }, geometry: { type: "Point" as const, coordinates: c.c } })) } });
  map.addLayer({ id: "ops-channels", type: "circle", source: "ops-channels", paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 8, 6], "circle-color": "#D7536F", "circle-stroke-color": "#F2D7DC",
    "circle-stroke-width": 1.2, "circle-opacity": 0.9 } }, before);
  map.on("click", "ops-channels", (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id && !busy()) openChannel(id);
  });
  // ── ships (Baltic AIS) ──
  map.addSource("ops-ais", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-ais", type: "symbol", source: "ops-ais", layout: {
    "icon-image": "di", "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.18, 9, 0.32], "icon-rotate": ["get", "cog"],
    "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true },
    paint: { "icon-color": ["match", ["get", "k"], "tanker", "#D7836F", "passenger", "#79A7C9", "cargo", "#86C5A0", "#A3ADB3"] } }, before);
  // ── aurora oval ──
  map.addSource("ops-aurora", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-aurora", type: "heatmap", source: "ops-aurora", paint: {
    "heatmap-weight": ["/", ["get", "v"], 60], "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, 6, 6, 120],
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(60,220,120,0)", 0.3, "rgba(60,220,120,0.25)", 1, "rgba(150,255,170,0.55)"] } }, before);
  // ── imported ──
  map.addSource("ops-imported", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-imported-fill", type: "fill", source: "ops-imported", filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": ["coalesce", ["get", "__color"], "#C9A0E0"], "fill-opacity": 0.18 } }, before);
  map.addLayer({ id: "ops-imported-line", type: "line", source: "ops-imported", filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": ["coalesce", ["get", "__color"], "#C9A0E0"], "line-width": 1.6 } }, before);
  map.addLayer({ id: "ops-imported-pt", type: "circle", source: "ops-imported", filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 4.5, "circle-color": ["coalesce", ["get", "__color"], "#C9A0E0"], "circle-stroke-color": "#0D1012", "circle-stroke-width": 1 } }, before);
  // ── hotspots (NASA FIRMS, the published table) ──
  map.addSource("ops-hotspots", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-hotspots-heat", type: "heatmap", source: "ops-hotspots", maxzoom: 7, paint: {
    "heatmap-weight": ["min", 1, ["/", ["get", "frp"], 50]], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 3, 6, 14],
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,120,40,0)", 0.3, "rgba(255,120,40,0.45)", 1, "rgba(255,220,120,0.9)"],
    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 1, 7, 0] } }, before);
  map.addLayer({ id: "ops-hotspots", type: "circle", source: "ops-hotspots", minzoom: 5, paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 5], "circle-color": ["case", ["==", ["get", "c"], "h"], "#FF5A2A", "#FF9A3A"],
    "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 0.9] } }, before);
  // ── news events (GDELT, the last hour: what the news reported, automatic coding) ──
  map.addSource("ops-news", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-news", type: "circle", source: "ops-news", paint: {
    "circle-radius": ["interpolate", ["linear"], ["get", "n"], 1, 2.5, 20, 6, 200, 11],
    "circle-color": ["case", ["get", "hot"], "#D7536F", "#C9A0E0"], "circle-opacity": 0.7, "circle-stroke-width": 0.6, "circle-stroke-color": "#0D1012" } }, before);
  // ── live alerts verified by an institution (the geological survey, GDACS, NWS) ──
  for (const id of ["ops-quakes", "ops-gdacs", "ops-nws"]) map.addSource(id, { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-quakes", type: "circle", source: "ops-quakes", paint: {
    "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2.5, 3, 5, 7, 7, 14], "circle-color": ["case", [">=", ["get", "mag"], 5], "#E2574C", "#F0A35E"],
    "circle-opacity": 0.75, "circle-stroke-width": 1, "circle-stroke-color": "#0D1012" } }, before);
  map.addLayer({ id: "ops-gdacs", type: "circle", source: "ops-gdacs", paint: {
    "circle-radius": 7, "circle-color": ["match", ["get", "level"], "Red", "#D7372F", "Orange", "#E8913A", "#C8B040"], "circle-stroke-width": 2, "circle-stroke-color": "#F4E3C3" } }, before);
  map.addLayer({ id: "ops-nws", type: "circle", source: "ops-nws", paint: {
    "circle-radius": 5, "circle-color": ["match", ["get", "severity"], "Extreme", "#B33BD9", "#7E62D9"], "circle-stroke-width": 1, "circle-stroke-color": "#0D1012" } }, before);
  // the chosen card's place, marked for a few seconds
  map.addSource("ops-hl", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-hl", type: "circle", source: "ops-hl", paint: { "circle-radius": 18, "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-width": 3, "circle-stroke-color": "#F2C14E" } });
  hlMap = map;
  // ── naval bases (OSM) and maritime chokepoints (IMF PortWatch) ──
  map.addSource("ops-naval", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-naval", type: "circle", source: "ops-naval", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 8, 6],
    "circle-color": "#9FB3C8", "circle-stroke-width": 1.5, "circle-stroke-color": "#2A3A4A" } }, before);
  map.addSource("ops-ports", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-ports", type: "circle", source: "ops-ports", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "vessel_count_total"], 0, 2.5, 2000, 4, 20000, 9],
    "circle-color": "#4FA3D9", "circle-opacity": 0.8, "circle-stroke-width": 0.8, "circle-stroke-color": "#0D1012" } }, before);
  map.addSource("ops-choke", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-choke", type: "circle", source: "ops-choke", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "vessel_count_total"], 500, 6, 20000, 13, 80000, 18],
    "circle-color": "rgba(79,195,217,0.25)", "circle-stroke-width": 2, "circle-stroke-color": "#4FC3D9" } }, before);
  // ── submarine cables (OpenStreetMap, global extract) ──
  map.addSource("ops-cables", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "ops-cables", type: "line", source: "ops-cables", paint: { "line-color": ["match", ["get", "k"], "power", "#E0C040", "#4FC3D9"],
    "line-width": 1.4, "line-opacity": 0.85 } }, before);
  const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };

  let navalOn = false, chokeOn = false, portsOn = false;
  let quakesOn = false, gdacsOn = false, nwsOn = false, liveTimer = 0;
  const loadLive = () => {
    if (quakesOn) loadFeed("geo", "ops-quakes", () => quakesOn, "quakes");
    if (gdacsOn) loadFeed("gdacs", "ops-gdacs", () => gdacsOn, "gdacs");
    if (nwsOn) loadFeed("nws", "ops-nws", () => nwsOn, "nws");
    if (newsOn) loadNews();
  };
  liveTimer = window.setInterval(loadLive, 5 * 60_000);
  let aisTimer = 0, aisOn = false, auroraOn = false, auroraTimer = 0, hotOn = false, cablesOn = false, newsOn = false;
  // the live alerts drawn from the shared feeds (GDELT news grouped: one point per action and place, all its articles)
  const loadFeed = async (k: AlertKind, layer: string, on: () => boolean, count: string) => {
    const f = await feed(k);
    if (!on()) return;
    tableMeta[count] = { ...(f.meta ?? {}), fetched_ms: f.fetched, error: f.error };
    const feats = f.items.filter((a) => a.c).map((a) => ({ type: "Feature" as const, properties: { ...a.props, aid: a.id }, geometry: { type: "Point" as const, coordinates: a.c! } }));
    (map.getSource(layer) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    ops.count(count, feats.length);
  };
  const loadNews = () => loadFeed("news", "ops-news", () => newsOn, "news");
  const loadHot = async () => {
    try {
      const r = await call<any>("/tables/hotspots", undefined, { channel: "hotspots" });
      if (!hotOn) return;
      tableMeta.hotspots = r.data;
      const feats = (r.data.rows as any[]).map((x) => ({ type: "Feature" as const, properties: { frp: x[2], c: x[3], t: x[4], s: x[5] },
        geometry: { type: "Point" as const, coordinates: [x[0], x[1]] } }));
      (map.getSource("ops-hotspots") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      ops.count("hotspots", feats.length);
    } catch { ops.count("hotspots", 0); }
  };
  // cables: OpenStreetMap's global extract published by NEXUM (one download when turned on; every zoom)
  const loadCables = async () => {
    try {
      const r = await call<any>("/tables/cables", undefined, { channel: "cables" });
      if (!cablesOn) return;
      tableMeta.cables = r.data;
      const feats = (r.data.rows as any[]).map((x) => ({ type: "Feature" as const, properties: { id: x[0], name: x[1], k: x[2], op: x[3] },
        geometry: { type: "LineString" as const, coordinates: x[4] } }));
      (map.getSource("ops-cables") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      ops.count("cables", feats.length);
    } catch { ops.count("cables", 0); }
  };
  // naval bases (OSM: name and operator) and maritime chokepoints (IMF PortWatch, measured from AIS)
  const loadNaval = async () => {
    try {
      const r = await call<any>("/tables/navalbases", undefined, { channel: "navalbases" });
      if (!navalOn) return;
      tableMeta.naval = r.data;
      const feats = (r.data.rows as any[]).map((x) => ({ type: "Feature" as const, properties: { t: x[0], id: x[1], name: x[2], op: x[3] },
        geometry: { type: "Point" as const, coordinates: [x[4], x[5]] } }));
      (map.getSource("ops-naval") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      ops.count("naval", feats.length);
    } catch { ops.count("naval", 0); }
  };
  const loadPorts = async () => {
    try {
      const pages = await Promise.all([0, 1000, 2000].map((o) => fetch(OPS.portwatch.ports.replace("{offset}", String(o)), { referrerPolicy: "no-referrer" }).then((r) => r.json())));
      if (!portsOn) return;
      tableMeta.ports = { attribution: OPS.portwatch.credit, fetched_ms: Date.now() };
      const fc = { type: "FeatureCollection" as const, features: pages.flatMap((p) => p.features ?? []) };
      (map.getSource("ops-ports") as GeoJSONSource).setData(fc);
      ops.count("ports", fc.features.length);
    } catch { ops.count("ports", 0); }
  };
  const loadChoke = async () => {
    try {
      const d = await fetch(OPS.portwatch.points, { referrerPolicy: "no-referrer" }).then((r) => r.json());
      if (!chokeOn) return;
      tableMeta.choke = { attribution: OPS.portwatch.credit, fetched_ms: Date.now() };
      (map.getSource("ops-choke") as GeoJSONSource).setData(d);
      ops.count("choke", d.features?.length ?? 0);
    } catch { ops.count("choke", 0); }
  };
  const loadAis = async () => {
    try {
      const [loc, meta] = await Promise.all([fetch(OPS.ais.url, { headers: AIS_HEADERS }).then((r) => r.json()), loadShipMeta()]);
      if (!aisOn) return;
      const feats = (loc.features ?? []).flatMap((f: any) => {
        const m = meta.get(f.mmsi);
        if (!m || !commercialShip(m.type)) return [];
        const k = m.type >= 80 ? "tanker" : m.type >= 70 ? "cargo" : m.type >= 60 ? "passenger" : "service";
        return [{ type: "Feature", geometry: f.geometry, properties: { name: m.name, k, cog: f.properties?.cog ?? 0, sog: f.properties?.sog ?? 0, dest: m.dest,
          mmsi: f.mmsi, t: f.properties?.timestampExternal ?? null } }];
      });
      (map.getSource("ops-ais") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      ops.count("ais", feats.length);
    } catch { ops.count("ais", 0); }
  };
  const loadAurora = async () => {
    try {
      const d = await fetch(SW.aurora).then((r) => r.json());
      if (!auroraOn) return;
      const feats = (d.coordinates as [number, number, number][]).filter((c) => c[2] >= 4).map(([lon, lat, v]) => ({ type: "Feature" as const,
        properties: { v }, geometry: { type: "Point" as const, coordinates: [lon > 180 ? lon - 360 : lon, lat] } }));
      (map.getSource("ops-aurora") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    } catch { /* the forecast is unavailable now */ }
  };
  const apply = () => {
    const l = ops.get().layers;
    vis("ops-channels", l.channels);
    for (const id of ["ops-imported-fill", "ops-imported-line", "ops-imported-pt"]) vis(id, l.imported);
    vis("ops-ais", l.ais);
    if (l.ais !== aisOn) {
      aisOn = l.ais;
      window.clearInterval(aisTimer);
      if (aisOn) { loadAis(); aisTimer = window.setInterval(loadAis, 60_000); }
      else { (map.getSource("ops-ais") as GeoJSONSource).setData(EMPTY); ops.count("ais", 0); }
    }
    for (const id of ["ops-hotspots", "ops-hotspots-heat"]) vis(id, l.hotspots);
    if (l.hotspots !== hotOn) {
      hotOn = l.hotspots;
      if (hotOn) loadHot(); else { (map.getSource("ops-hotspots") as GeoJSONSource).setData(EMPTY); ops.count("hotspots", 0); }
    }
    vis("ops-news", l.news);
    if (l.news !== newsOn) {
      newsOn = l.news;
      if (newsOn) loadNews(); else { (map.getSource("ops-news") as GeoJSONSource).setData(EMPTY); ops.count("news", 0); }
    }
    for (const [k, id] of [["quakes", "ops-quakes"], ["gdacs", "ops-gdacs"], ["nws", "ops-nws"]] as const) vis(id, l[k]);
    if (l.quakes !== quakesOn) { quakesOn = l.quakes; if (quakesOn) loadFeed("geo", "ops-quakes", () => quakesOn, "quakes"); else { (map.getSource("ops-quakes") as GeoJSONSource).setData(EMPTY); ops.count("quakes", 0); } }
    if (l.gdacs !== gdacsOn) { gdacsOn = l.gdacs; if (gdacsOn) loadFeed("gdacs", "ops-gdacs", () => gdacsOn, "gdacs"); else { (map.getSource("ops-gdacs") as GeoJSONSource).setData(EMPTY); ops.count("gdacs", 0); } }
    if (l.nws !== nwsOn) { nwsOn = l.nws; if (nwsOn) loadFeed("nws", "ops-nws", () => nwsOn, "nws"); else { (map.getSource("ops-nws") as GeoJSONSource).setData(EMPTY); ops.count("nws", 0); } }
    vis("ops-naval", l.naval); vis("ops-choke", l.choke); vis("ops-ports", l.ports);
    if (l.ports !== portsOn) { portsOn = l.ports; if (portsOn) loadPorts(); else { (map.getSource("ops-ports") as GeoJSONSource).setData(EMPTY); ops.count("ports", 0); } }
    if (l.naval !== navalOn) { navalOn = l.naval; if (navalOn) loadNaval(); else { (map.getSource("ops-naval") as GeoJSONSource).setData(EMPTY); ops.count("naval", 0); } }
    if (l.choke !== chokeOn) { chokeOn = l.choke; if (chokeOn) loadChoke(); else { (map.getSource("ops-choke") as GeoJSONSource).setData(EMPTY); ops.count("choke", 0); } }
    vis("ops-cables", l.cables);
    if (l.cables !== cablesOn) {
      cablesOn = l.cables;
      if (cablesOn) loadCables(); else { (map.getSource("ops-cables") as GeoJSONSource).setData(EMPTY); ops.count("cables", 0); }
    }
    vis("ops-aurora", l.aurora);
    if (l.aurora !== auroraOn) {
      auroraOn = l.aurora;
      window.clearInterval(auroraTimer);
      if (auroraOn) { loadAurora(); auroraTimer = window.setInterval(loadAurora, 10 * 60_000); }
      else (map.getSource("ops-aurora") as GeoJSONSource).setData(EMPTY);
    }
  };
  const putImported = () => (map.getSource("ops-imported") as GeoJSONSource | undefined)?.setData(merged);
  const u1 = ops.subscribe(apply), u2 = importedData.subscribe(putImported);
  apply(); putImported();
  // a tap on (or, with a finger, near) an operational feature opens its card; elsewhere it closes it
  const pick = (e: any) => {
    if (busy()) return;
    const r = innerWidth < 1120 ? 12 : 5, { x, y } = e.point;
    const layers = INFO_LAYERS.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
    const seen = new Set<string>();
    const fs = (layers.length ? map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers }) : [])
      .map((f) => ({ l: f.layer.id, p: f.properties as Record<string, any> }))
      .filter((f) => { const k = f.l + JSON.stringify(f.p); return !seen.has(k) && !!seen.add(k); }).slice(0, 20);
    if (fs.length) ops.set({ feat: { c: [e.lngLat.lng, e.lngLat.lat], fs } });
    else if (ops.get().feat) ops.set({ feat: null });
  };
  map.on("click", pick);
  for (const id of ["ops-channels", ...INFO_LAYERS]) {
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
  return () => { u1(); u2(); map.off("click", pick); window.clearInterval(liveTimer); hlMap = null; window.clearInterval(aisTimer); window.clearInterval(auroraTimer); };
}
