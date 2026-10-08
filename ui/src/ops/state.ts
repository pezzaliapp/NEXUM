// THE OPERATIONAL SURFACE (2026-10-04, OSIRIS-level transformation): what the map shows on top of NEXUM's own
// layers (basemap mode, projection, extra layers) and which tool is open. Display state only — never the scope of a
// query, never sent anywhere. A small store of its own (the workspace store keeps the world's information).

import { useSyncExternalStore } from "react";

export type BaseMode = "map" | "sat" | "today";
export type Projection = "globe" | "flat";
export type Tool = "layers" | "draw" | "alerts" | "markets" | "route" | "cams" | "live" | "sky" | "space" | "import"
  | "scenes" | "net" | "dossier" | "style" | "share" | "help" | "point" | "ai" | "registers";

export interface OpsLayers {
  orbits: boolean; terrain: boolean; hillshade: boolean; buildings: boolean; clouds: boolean; precip: boolean;
  ais: boolean; channels: boolean; aoi: boolean; imported: boolean; aurora: boolean; hotspots: boolean; cables: boolean; news: boolean;
  quakes: boolean; gdacs: boolean; nws: boolean; naval: boolean; choke: boolean; ports: boolean; camPreviews: boolean;
  /** Street-level detail of the map (OpenFreeMap): a third-party basemap, so an explicit, remembered choice (O2). */
  streets: boolean;
  /** The globe turns slowly while nobody touches the map (world scale only). */
  spin: boolean;
}
export interface OpsState {
  base: BaseMode;
  projection: Projection;
  layers: OpsLayers;
  tool: Tool | null;
  /** Touch layouts: the tools palette is open. It and a tool's panel share one sheet: never both at once. */
  palette: boolean;
  /** Touch layouts: the tool's bottom sheet — peek (a strip: the map almost whole, for taps on it), half (the map above
   *  it visible and usable) or full; dragged by its handle. */
  sheet: "peek" | "half" | "full";
  /** The next tap on the map chooses a point (touch screens have no right-click): for the point panel and the sky
   *  ("point"), or the start / end of a route ("from" / "to"). */
  pick: "point" | "from" | "to" | null;
  /** A point the person chose (right-click / long press, a search result, a place): the observer of SKY, the place
   *  of the point panel. Never the person's own position unless they explicitly asked for it (and it is not stored). */
  point: { lng: number; lat: number; label: string } | null;
  /** The orbital object chosen on the map (catalogue number). */
  orbit: number | null;
  /** Orbital categories turned off (CelesTrak groups, config orbits.groups); empty = all shown. */
  satOff: string[];
  /** The operational features under a tap (news, AIS, hotspot, cable, imported): the card says what they are. */
  feat: { c: [number, number]; fs: { l: string; p: Record<string, any> }[] } | null;
  /** UI accent preset (style studio). */
  theme: string;
  /** Header readings (the geomagnetic Kp index; null until known). */
  kp: number | null;
  kpTime: string | null;
  /** The street detail's provider: idle (never asked) · loading · ready · error (said, and STRADE turned off). */
  streetsStatus: "idle" | "loading" | "ready" | "error";
  /** Counts of the operational layers drawn now (header). */
  counts: Record<string, number>;
  splash: boolean;
  /** Turn-by-turn navigation is running (device position read, instructions spoken): said on screen wherever the person
   *  is, with its stop; set by the route panel's navigation, ended by either. Never saved. */
  navigating: boolean;
}

const LS = "nexum.ops.v1";
const DEFAULT_LAYERS: OpsLayers = { orbits: false, terrain: false, hillshade: false, buildings: true, clouds: false, precip: false,
  ais: false, channels: false, aoi: true, imported: true, aurora: false, hotspots: false, cables: false, news: false, quakes: false, gdacs: false, nws: false, naval: false, choke: false, ports: false, camPreviews: false, streets: false, spin: false };

function initial(): OpsState {
  let saved: Partial<OpsState> = {};
  try { saved = JSON.parse(localStorage.getItem(LS) ?? "{}"); } catch { /* private window: defaults */ }
  const fromHash = readHash();
  return {
    base: fromHash.base ?? (saved.base as BaseMode) ?? "map",
    projection: fromHash.projection ?? (saved.projection as Projection) ?? "globe",
    layers: { ...DEFAULT_LAYERS, ...(saved.layers ?? {}), ...(fromHash.layers ?? {}) },
    tool: null, palette: false, sheet: "half", pick: null, point: null, orbit: null, feat: null, satOff: [], kpTime: null, streetsStatus: "idle", theme: (saved.theme as string) ?? "nexum", kp: null, counts: {}, splash: true, navigating: false,
  };
}

/** The permalink (#v=lng,lat,zoom&b=sat&p=flat&l=orbits,clouds): read once at start (camera, mode, layers). */
export function readHash(): { camera?: { c: [number, number]; z: number }; base?: BaseMode; projection?: Projection; layers?: Partial<OpsLayers> } {
  const raw: string = (window as any).__nexumStartHash ?? location.hash;   // the address as the page opened
  const h = new URLSearchParams(raw.replace(/^#\/?/, "").split("#").pop()!.replace(/^f\/[^&]*&?/, ""));
  const out: ReturnType<typeof readHash> = {};
  const v = h.get("v")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite) && Math.abs(v[1]) <= 85) out.camera = { c: [v[0], v[1]], z: Math.max(0, Math.min(15, v[2])) };
  const b = h.get("b");
  if (b === "map" || b === "sat" || b === "today") out.base = b;
  const p = h.get("p");
  if (p === "globe" || p === "flat") out.projection = p;
  const l = h.get("l");
  if (l) out.layers = Object.fromEntries(l.split(",").filter((k) => k in DEFAULT_LAYERS).map((k) => [k, true]));
  return out;
}

/** The permalink read when the page opened (the workspace rewrites the address as the focus changes). */
export const PERMALINK = readHash();
/** How a tool uses the map on a touch screen (2026-10-05, physical tests #3–#4): MAP-INTERACTIVE tools need taps on the
 *  map (an armed action brings the sheet down to its strip); HYBRID ones move or read the map (the sheet comes down to
 *  half when they show something); INFORMATIONAL ones read in the sheet (dragged up when needed). All open at half. */
export const TOOL_CLASS: Record<Tool, "map" | "hybrid" | "info"> = {
  draw: "map", point: "map", route: "map", sky: "map", dossier: "map",
  layers: "hybrid", cams: "hybrid", alerts: "hybrid", scenes: "hybrid", import: "hybrid",
  live: "info", space: "info", markets: "info", registers: "info", net: "info", ai: "info", style: "info", share: "info", help: "info",
};
let state: OpsState = initial();
const subs = new Set<() => void>();
export const ops = {
  get: () => state,
  set(patch: Partial<OpsState>) {
    state = { ...state, ...patch };
    try { localStorage.setItem(LS, JSON.stringify({ base: state.base, projection: state.projection, layers: state.layers, theme: state.theme })); } catch { /* ignore */ }
    subs.forEach((f) => f());
  },
  layer(k: keyof OpsLayers, on?: boolean) { ops.set({ layers: { ...state.layers, [k]: on ?? !state.layers[k] } }); },
  tool(t: Tool | null) {
    const next = state.tool === t ? null : t;
    ops.set({ tool: next, palette: false, pick: null, sheet: "half" });   // every tool opens at half: the map stays in view
  },
  /** Touch layouts: the palette replaces whatever panel is open (one surface at a time). */
  palette(open: boolean) { ops.set({ palette: open, tool: open ? null : state.tool }); },
  count(k: string, n: number) { if (state.counts[k] !== n) ops.set({ counts: { ...state.counts, [k]: n } }); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useOps<T>(sel: (s: OpsState) => T): T {
  return useSyncExternalStore(ops.subscribe, () => sel(state));
}
