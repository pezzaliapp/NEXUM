// ORBITS on the map (on request): the published catalogue (GET /tables/orbits) propagated in a worker; the sub-points
// drawn on the globe, refreshed every few seconds, with the ground track of the chosen object. Positions are said
// CALCULATED (from elements of a stated epoch), never live.

import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { call } from "../lib/api";
import OPS from "../config/ops.json";
import { ops } from "./state";

export interface OrbitRow { norad: number; name: string; family: string; cospar: string; epoch: string; mm: number; ecc: number; inc: number }
export interface OrbitTable { rows: OrbitRow[]; byId: Map<number, OrbitRow>; epochMin: string | null; epochMax: string | null; fetchedMs: number | null; raw: any[] }

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: any) => void>();
let table: Promise<OrbitTable> | null = null;

function ask<T>(op: string, q: any): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./orbits.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev) => { const f = waiting.get(ev.data.q); waiting.delete(ev.data.q); f?.(ev.data.res); };
  }
  const n = ++seq;
  return new Promise<T>((res) => { waiting.set(n, res); worker!.postMessage({ op, q, n }); });
}

/** The catalogue, once per page (one compact file of the snapshot, downloaded only when orbits are first asked). */
export function loadOrbits(): Promise<OrbitTable> {
  table ??= call<any>("/tables/orbits", undefined, { channel: "orbits" }).then(async (r) => {
    const d = r.data;
    const rows: OrbitRow[] = d.rows.map((x: any[]) => ({ norad: x[0], name: x[1], family: x[2], cospar: x[3], epoch: x[4], mm: x[5], ecc: x[6], inc: x[7] }));
    await ask<number>("init", { rows: d.rows });
    return { rows, byId: new Map(rows.map((x) => [x.norad, x])), epochMin: d.notes?.epoch_min ?? null, epochMax: d.notes?.epoch_max ?? null,
      fetchedMs: d.fetched_ms ?? null, raw: d.rows };
  });
  table.catch(() => { table = null; });
  return table;
}

export const orbitPositions = (t: number, only?: number[]) => ask<Float64Array>("positions", { t, only });
export const orbitTrack = (id: number, t0: number, minutes: number, step = 60) => ask<[number, number, number][]>("track", { id, t0, minutes, step });
export const orbitDetail = (id: number, t: number) => ask<{ lng: number; lat: number; alt: number; v: number } | null>("detail", { id, t });
export const skyAt = (obs: { lat: number; lng: number }, t: number, minEl = 0) => ask<[number, number, number, number][]>("sky", { obs, t, minEl });
export const passesOf = (id: number, obs: { lat: number; lng: number }, t0: number, hours = 24, minEl = 10) =>
  ask<{ rise: number; set: number; max: number; maxEl: number; azRise: number; azSet: number }[]>("passes", { id, obs, t0, hours, minEl });

const NOTABLE = new Set(OPS.orbits.notable);
export const FAMILIES = OPS.orbits.families as unknown as Record<string, [string, string]>;
/** family → category (config orbits.groups: CelesTrak's own groups, never a guess from the name). */
export const GROUPS = OPS.orbits.groups as unknown as [string, string, string[]][];
const GROUP_OF = new Map(GROUPS.flatMap(([g, , fams]) => fams.map((f) => [f, g] as const)));
export const groupOf = (family: string) => GROUP_OF.get(family) ?? "other";
export const familyColor = (f: string) => (FAMILIES[f] ?? FAMILIES.other)[1];
export const familyLabel = (f: string) => (FAMILIES[f] ?? FAMILIES.other)[0];

/** Split a track where it crosses the antimeridian (a line never wraps across the whole map). */
export function splitAntimeridian(pts: [number, number, number][]): [number, number][][] {
  const out: [number, number][][] = [[]];
  for (let i = 0; i < pts.length; i++) {
    if (i && Math.abs(pts[i][0] - pts[i - 1][0]) > 180) out.push([]);
    out[out.length - 1].push([pts[i][0], pts[i][1]]);
  }
  return out.filter((l) => l.length > 1);
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const REFRESH_MS = 3000;

/** Install the orbit layers (empty until turned on); returns a stop function. */
export function installOrbits(map: MLMap, before?: string): () => void {
  map.addSource("ops-orbit-track", { type: "geojson", data: EMPTY });
  map.addSource("ops-orbits", { type: "geojson", data: EMPTY, promoteId: "id" });
  map.addLayer({ id: "ops-orbit-track", type: "line", source: "ops-orbit-track",
    paint: { "line-color": ["coalesce", ["get", "c"], "#E0A640"], "line-width": 1.4, "line-opacity": 0.8, "line-dasharray": [2, 2] } }, before);
  map.addLayer({ id: "ops-orbits", type: "circle", source: "ops-orbits", paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, ["case", ["get", "big"], 3.2, 1.3], 4, ["case", ["get", "big"], 4.5, 2], 8, ["case", ["get", "big"], 6, 3]],
    "circle-color": ["get", "c"], "circle-opacity": ["case", ["get", "big"], 1, 0.75],
    "circle-stroke-width": ["case", ["boolean", ["feature-state", "sel"], false], 2, 0], "circle-stroke-color": "#E0A640" } }, before);
  let timer = 0, on = false, gen = 0, sel: number | null = null;
  const tick = async () => {
    const g = ++gen;
    const tab = await loadOrbits();
    const a = await orbitPositions(Date.now());
    if (!on || g !== gen) return;
    const feats: GeoJSON.Feature[] = [], off = new Set(ops.get().satOff);
    for (let i = 0; i < a.length; i += 4) {
      const row = tab.byId.get(a[i]);
      if (!row || (off.size && off.has(groupOf(row.family)))) continue;
      const big = NOTABLE.has(row.family) && row.family !== "geostationary" && row.family !== "amateur";
      feats.push({ type: "Feature", id: a[i], geometry: { type: "Point", coordinates: [a[i + 1], a[i + 2]] },
        properties: { id: a[i], c: familyColor(row.family), big, alt: Math.round(a[i + 3]) } });
    }
    (map.getSource("ops-orbits") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    ops.count("orbits", feats.length);
    if (sel != null) map.setFeatureState({ source: "ops-orbits", id: sel }, { sel: true });
  };
  const drawTrack = async (id: number | null) => {
    const src = map.getSource("ops-orbit-track") as GeoJSONSource | undefined;
    if (sel != null && map.getSource("ops-orbits")) map.removeFeatureState({ source: "ops-orbits", id: sel });
    sel = id;
    if (!src) return;
    if (id == null) { src.setData(EMPTY); return; }
    map.setFeatureState({ source: "ops-orbits", id }, { sel: true });
    const tab = await loadOrbits();
    const row = tab.byId.get(id);
    const period = row ? 1440 / row.mm : 95;
    const pts = await orbitTrack(id, Date.now() - (period / 2) * 60_000, Math.min(1440, period * 1.5), period > 600 ? 300 : 30);
    src.setData({ type: "FeatureCollection", features: splitAntimeridian(pts).map((l) => ({ type: "Feature", properties: { c: familyColor(row?.family ?? "other") },
      geometry: { type: "LineString", coordinates: l } })) });
  };
  const apply = () => {
    const want = ops.get().layers.orbits;
    if (want === on) return;
    on = want;
    for (const id of ["ops-orbits", "ops-orbit-track"]) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    window.clearInterval(timer);
    if (on) { tick(); timer = window.setInterval(tick, REFRESH_MS); }
    else { (map.getSource("ops-orbits") as GeoJSONSource).setData(EMPTY); ops.count("orbits", 0); }
  };
  for (const id of ["ops-orbits", "ops-orbit-track"]) map.setLayoutProperty(id, "visibility", "none");
  map.on("click", "ops-orbits", (e) => {
    const id = Number(e.features?.[0]?.properties?.id);
    if (Number.isFinite(id)) ops.set({ orbit: id });
  });
  map.on("mouseenter", "ops-orbits", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "ops-orbits", () => { map.getCanvas().style.cursor = ""; });
  let lastOrbit: number | null = null, lastOff = ops.get().satOff;
  const unsub = ops.subscribe(() => {
    apply();
    const o = ops.get().orbit;
    if (o !== lastOrbit) { lastOrbit = o; drawTrack(o); }
    if (ops.get().satOff !== lastOff) { lastOff = ops.get().satOff; if (on) tick(); }
  });
  apply();
  return () => { unsub(); window.clearInterval(timer); };
}
