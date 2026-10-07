// POINT LAYERS OF THEIR OWN (2026-10-05, physical acceptance): a type with many points (the public webcams: 21,172) is
// drawn whole, at every scale, by the map itself — never as the anonymous density of the other elements, never as
// tiny marks. One compact list of every point (GET /types/<type>/points: position, status, source), clustered by
// MapLibre in its worker (level of detail):
//   world · continent  clusters marked as the type's own (camera + count), with a LIVE dot when they hold live video;
//   region · city      smaller clusters, then single marks — a shape per status (LIVE, image, link only, off), a word
//                      under the live ones, so the status never depends on colour alone;
//   pointing / tapping the name and status of the point (asked to the Core for that tiny box: the list stays small);
//                      cameras at the same place open as a list.
// The status is the source's own (availability): a still image is never called LIVE; "IN ONDA" is said by the card
// only when frames arrive. Domain words and marks: src/config/points.json.

import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import CFG from "../config/points.json";
import { call } from "../lib/api";
import { store } from "../store";

type State = { mark: string; label: string; short: string; legend?: string };
type Cfg = { status: string; name: string; names: string; color: string; states: Record<string, State>; withChannels?: boolean };
const CONF = CFG as unknown as Record<string, Cfg>;
export const POINT_TYPES = Object.keys(CONF).filter((k) => !k.startsWith("_"));
const LIVE = new Set(["live", "external"]);
const PR = 2;                                   // images drawn at twice their size (sharp on every screen)
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
// horizontal offsets (px) of up to 9 marks at the same place; more stay grouped (the list opens on click)
const OFFSETS = [-128, -112, -96, -80, -64, -48, -32, -16, 0, 16, 32, 48, 64, 80, 96, 112, 128].filter((d) => Math.abs(d) <= 128);

// ── marks (canvas, no font server: the words are drawn into the images) ──
function camera(g: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, hollow = false) {
  const h = w * 0.62;
  g.lineWidth = 1.6; g.strokeStyle = color; g.fillStyle = color;
  g.beginPath(); g.roundRect(x, y + h * 0.18, w, h * 0.82, 2); hollow ? g.stroke() : g.fill();
  g.beginPath(); g.roundRect(x + w * 0.18, y, w * 0.34, h * 0.24, 1); hollow ? g.stroke() : g.fill();
  g.beginPath(); g.arc(x + w / 2, y + h * 0.58, h * 0.24, 0, Math.PI * 2);
  if (hollow) g.stroke(); else { g.fillStyle = "#0D1012"; g.fill(); }
}
function pill(g: CanvasRenderingContext2D, cx: number, y: number, text: string, bg: string) {
  g.font = "700 8px ui-sans-serif, system-ui, sans-serif";
  const w = g.measureText(text).width + 7;
  g.fillStyle = bg; g.beginPath(); g.roundRect(cx - w / 2, y, w, 11, 3); g.fill();
  g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, cx, y + 5.8);
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w * PR; c.height = h * PR;
  const g = c.getContext("2d")!;
  g.scale(PR, PR);
  return { c, g };
}
const RED = "#FF4D4D", PINK = "#E0567A", GREY = "#8A949A";

/** One mark per status: a dark badge with a camera; the shape and the word say the status. */
export function markCanvas(mark: string, color: string): HTMLCanvasElement {
  const live = LIVE.has(mark);
  const W = 30, H = live ? 37 : 26;
  const { c, g } = canvas(W, H);
  const border = mark === "live" ? RED : mark === "external" ? PINK : mark === "off" || mark === "stale" ? GREY : color;
  g.fillStyle = "#0D1012E6"; g.strokeStyle = border; g.lineWidth = mark === "live" || mark === "external" ? 2 : 1.4;
  if (mark === "link" || mark === "stale") g.setLineDash([3, 2]);
  g.beginPath(); g.roundRect(1.5, 1.5, W - 3, 23, 5); g.fill(); g.stroke(); g.setLineDash([]);
  const camColor = mark === "off" || mark === "stale" ? GREY : mark === "link" ? color : "#FFFFFF";
  camera(g, 7.5, 6, 15, camColor, mark === "link");
  if (mark === "link") { g.strokeStyle = color; g.lineWidth = 1.4; g.beginPath(); g.moveTo(20, 9); g.lineTo(25, 4); g.moveTo(21.5, 4); g.lineTo(25, 4); g.lineTo(25, 7.5); g.stroke(); }
  if (mark === "off") { g.strokeStyle = RED; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 21); g.lineTo(24, 5); g.stroke(); }
  if (mark === "live") pill(g, W / 2, 25.5, "LIVE", RED);
  if (mark === "external") pill(g, W / 2, 25.5, "▶ LIVE", PINK);
  return c;
}
function clusterCanvas(count: string, live: boolean, color: string): HTMLCanvasElement {
  const probe = canvas(1, 1).g;
  probe.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  const tw = probe.measureText(count).width;
  const W = Math.ceil(30 + tw + (live ? 10 : 0)), H = 24;
  const { c, g } = canvas(W + 14, H + 6);
  g.fillStyle = "#0D1012F0"; g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath(); g.roundRect(1.5, 4.5, W, H, 12); g.fill(); g.stroke();
  camera(g, 8, 10, 13, color);
  g.font = "700 11px ui-sans-serif, system-ui, sans-serif"; g.fillStyle = "#FFFFFF"; g.textAlign = "left"; g.textBaseline = "middle";
  g.fillText(count, 25, 4.5 + H / 2 + 0.5);
  if (live) pill(g, W - 8, 0, "LIVE", RED);   // the group holds live video: said in words, not only by a dot
  return c;
}
const imageOf = (c: HTMLCanvasElement) => { const g = c.getContext("2d")!; return g.getImageData(0, 0, c.width, c.height); };

/** The name of a status (config), "other" when the source says something not listed. */
const stateOf = (cfg: Cfg, v: string) => cfg.states[v] ?? { mark: "still", label: v, short: "" };

export interface PointLayer { setActive(on: boolean): void; destroy(): void }

/** Install the clustered layer of one type (hidden until active). `before`: the layer it goes under (the selection). */
export function installPoints(map: MLMap, type: string, before?: string): PointLayer {
  const cfg = CONF[type];
  const src = `nexum-pts-${type.replace(/\W/g, "-")}`;
  const L = { cluster: `${src}-cluster`, point: `${src}-point` };
  let active = false, loaded: Promise<GeoJSON.FeatureCollection> | null = null, hoverId: number | null = null;
  const host = map.getContainer();
  const tip = document.createElement("div"); tip.className = "tooltip pts-tip"; tip.style.display = "none"; host.appendChild(tip);
  const pop = document.createElement("div"); pop.className = "pts-pop"; pop.style.display = "none"; pop.setAttribute("data-testid", "pts-list"); host.appendChild(pop);
  const legend = document.createElement("div"); legend.className = "pts-legend"; legend.setAttribute("data-testid", "pts-legend"); legend.style.display = "none";
  host.appendChild(legend);
  const marks = [...new Set(Object.values(cfg.states).map((s) => s.mark))];
  legend.innerHTML = `<b>${cfg.name}</b>` + Object.values(cfg.states).filter((s, i, a) => a.findIndex((x) => x.mark === s.mark) === i)
    .map((s) => `<span><img alt="" src="${markCanvas(s.mark, cfg.color).toDataURL()}" width="15"/> ${s.legend ?? s.label}</span>`).join("");

  for (const m of marks) map.addImage(`pt-${type}-${m}`, imageOf(markCanvas(m, cfg.color)), { pixelRatio: PR });
  { const { c, g } = canvas(40, 46); g.strokeStyle = "#E0A640"; g.lineWidth = 2.5; g.beginPath(); g.roundRect(2, 2, 36, 30, 8); g.stroke();
    map.addImage(`pt-${type}-ring`, imageOf(c), { pixelRatio: PR }); }
  // the cluster badges (one per count shown) are drawn when the map first needs them: MapLibre 6 asks a resolver and
  // waits for it (an event listener is too late for the current request); the map's other resolvers stay in the chain
  const pre = `pc-${type}-`;
  const prevResolver = (map as any)._missingStyleImageResolver as ((id: string) => void | Promise<void>) | null;
  const resolver = (id: string) => {
    if (!id.startsWith(pre)) return prevResolver?.(id);
    if (map.hasImage(id)) return;
    const [count, live] = id.slice(pre.length).split("|");
    map.addImage(id, imageOf(clusterCanvas(count, live === "1", cfg.color)), { pixelRatio: PR });
  };
  map.setMissingStyleImageResolver(resolver);

  const liveExpr: any = ["any", ...[...Object.entries(cfg.states)].filter(([, s]) => LIVE.has(s.mark)).map(([k]) => ["==", ["get", "s"], k])];
  map.addSource(src, { type: "geojson", data: EMPTY, cluster: true, clusterMaxZoom: 12, clusterRadius: 34,
    clusterProperties: { live: ["+", ["case", liveExpr, 1, 0]] } });
  map.addLayer({ id: L.cluster, type: "symbol", source: src, filter: ["has", "point_count"], layout: {
    "icon-image": ["concat", `pc-${type}-`, ["get", "point_count_abbreviated"], "|", ["case", [">", ["get", "live"], 0], "1", "0"]],
    "icon-allow-overlap": true, "icon-ignore-placement": true, visibility: "none",
    "icon-size": ["interpolate", ["linear"], ["get", "point_count"], 2, 0.9, 100, 1, 1000, 1.12] } }, before);
  const SIZE: any = ["interpolate", ["linear"], ["zoom"], 3, 0.85, 10, 1, 14, 1.2];
  const OFFSET: any = ["match", ["coalesce", ["get", "dx"], 0], ...OFFSETS.flatMap((d) => [d, ["literal", [d, 0]]]), ["literal", [0, 0]]];
  map.addLayer({ id: L.point, type: "symbol", source: src, filter: ["!", ["has", "point_count"]], layout: {
    "icon-size": SIZE,
    "icon-image": ["concat", `pt-${type}-`, ["match", ["get", "s"], ...Object.entries(cfg.states).flatMap(([k, s]) => [k, s.mark]), "still"]] as any,
    "icon-allow-overlap": true, "icon-ignore-placement": true, visibility: "none",
    "symbol-sort-key": ["case", liveExpr, 1, 0],   // drawn last: on top
    // cameras at the very same place side by side (a pixel offset of the mark; the position itself is unchanged)
    "icon-offset": OFFSET } as any,
    paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.95] } }, before);

  // the pointed mark: an amber ring around it (its own tiny source: a layout property cannot follow a feature state)
  map.addSource(`${src}-hover`, { type: "geojson", data: EMPTY });
  map.addLayer({ id: `${src}-hover`, type: "symbol", source: `${src}-hover`, layout: { "icon-image": `pt-${type}-ring`, "icon-size": SIZE,
    "icon-offset": OFFSET, "icon-allow-overlap": true, "icon-ignore-placement": true, visibility: "none" } as any }, L.point);
  const ring = (f: GeoJSON.Feature | null) => (map.getSource(`${src}-hover`) as GeoJSONSource | undefined)?.setData(f ? { type: "FeatureCollection", features: [f] } : EMPTY);
  const load = () => (loaded ??= (async () => {
    const r = await call<any>(`/types/${type}/points`, { status: cfg.status }, { channel: `pts-${type}` });
    const d = r.data;
    const feats: GeoJSON.Feature[] = (d.rows as [number, number, number, number][]).map(([lon, lat, s, si], i) => ({
      type: "Feature", id: i, geometry: { type: "Point", coordinates: [lon, lat] }, properties: { s: d.status_values[s], src: d.sources[si] } }));
    if (cfg.withChannels) {
      const ops = (await import("../config/ops.json")).default as any;
      for (const ch of ops.live?.channels ?? []) feats.push({ type: "Feature", id: feats.length, geometry: { type: "Point", coordinates: ch.c },
        properties: { s: "external_live", ch: ch.id, name: ch.name, pub: ch.publisher } });
    }
    // the same coordinates: a row of marks (offset in pixels), live first
    const at = new Map<string, GeoJSON.Feature[]>();
    for (const f of feats) { const k = (f.geometry as any).coordinates.join(","); if (!at.has(k)) at.set(k, []); at.get(k)!.push(f); }
    for (const g of at.values()) if (g.length > 1) {
      g.sort((a, b) => Number(LIVE.has(stateOf(cfg, b.properties!.s).mark)) - Number(LIVE.has(stateOf(cfg, a.properties!.s).mark)));
      g.slice(0, OFFSETS.length).forEach((f, k) => { f.properties!.dx = (k - (Math.min(g.length, OFFSETS.length) - 1) / 2) * 32; f.properties!.off = 1; });
    }
    return { type: "FeatureCollection", features: feats } as GeoJSON.FeatureCollection;
  })());
  // the person's source filter applies (the map's own filters, never a change of the data)
  const put = async () => {
    const fc = await load();
    const only = store.get().scope.sources;
    const data = Array.isArray(only) ? { ...fc, features: fc.features.filter((f) => f.properties!.src && only.includes(f.properties!.src)) } : fc;
    (map.getSource(src) as GeoJSONSource | undefined)?.setData(data);
    (window as any).__nexum && (((window as any).__nexum.points ??= {})[type] = { features: data.features.length });
  };

  // ── names on demand: the Core's map projection of a tiny box around the place ──
  const named = new Map<string, any[]>();
  const namesAt = async (pts: [number, number][]) => {
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]), e = 0.0006;
    const vp = [Math.min(...lons) - e, Math.min(...lats) - e, Math.max(...lons) + e, Math.max(...lats) + e].map((x) => Math.round(x * 1e5) / 1e5);
    const key = vp.join(",");
    if (named.has(key)) return named.get(key)!;
    const r = await call<any>("/projections/map", { s: { types: [type], viewport: vp, z: 16 }, b: { max_items: 60, lod: "refs" } }, { channel: "pts-names" });
    const d = store.normalize(r.data);
    const near = (p: [number, number]) => pts.some((q) => Math.abs(q[0] - p[0]) < e && Math.abs(q[1] - p[1]) < e);
    const items = (d.items ?? []).map((x: any) => store.entity(x.$ref)!).filter((x: any) => x?.point && near(x.point));
    named.set(key, items);
    return items;
  };
  const statusOf = async (id: string) => {
    const e = store.entity(id);
    if (e?.details?.properties) return e.details.properties[cfg.status];
    try { const r = await call<any>(`/entities/${id}`, undefined, { channel: `pts-st-${id}` }); return r.data?.properties?.[cfg.status]; } catch { return undefined; }
  };
  const openChannel = (id: string) => import("../ops/overlays").then((m) => m.openChannel(id)).catch(() => {});

  const hideTip = () => { tip.style.display = "none"; };
  const showTip = (x: number, y: number, html: string) => { tip.innerHTML = html; tip.style.left = `${x + 14}px`; tip.style.top = `${y + 12}px`; tip.style.display = "block"; };
  const esc = (t: string) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  let tipSeq = 0;
  const hover = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const p: any = f.properties;
    if (p.point_count) { showTip(e.point.x, e.point.y, `${Number(p.point_count).toLocaleString("it-IT")} ${cfg.names}${p.live ? ` · <b class="live-on">${p.live} LIVE</b>` : ""} · tocca per avvicinarti`); return; }
    if (hoverId !== null) map.setFeatureState({ source: src, id: hoverId }, { hover: false });
    hoverId = f.id as number;
    map.setFeatureState({ source: src, id: hoverId }, { hover: true });
    ring({ type: "Feature", geometry: f.geometry as any, properties: { dx: (f.properties as any).dx ?? 0 } });
    const st = stateOf(cfg, p.s);
    if (p.ch) { showTip(e.point.x, e.point.y, `<b>${esc(p.name)}</b> · ${st.label}`); return; }
    showTip(e.point.x, e.point.y, `${st.label}…`);
    const seq = ++tipSeq, at = e.point, pt = (f.geometry as any).coordinates as [number, number];
    namesAt([pt]).then(async (items) => {
      // a mark of a row at the same place: the camera of that status, named
      if (items.length > 1 && p.off) {
        const sts = await Promise.all(items.map((x: any) => statusOf(x.id)));
        if (sts.filter((v) => v === p.s).length === 1) items = [items[sts.indexOf(p.s)]];
      }
      if (seq === tipSeq && tip.style.display === "block") showTip(at.x, at.y, items.length > 1
        ? `<b>${items.length} ${cfg.names} in questo punto</b> · ${st.label}` : `<b>${esc(items[0]?.label ?? cfg.name)}</b> · ${st.label}`);
    }).catch(() => {});
  };
  const leave = () => {
    map.getCanvas().style.cursor = ""; hideTip(); tipSeq++; ring(null);
    if (hoverId !== null) { map.setFeatureState({ source: src, id: hoverId }, { hover: false }); hoverId = null; }
  };
  const list = async (pts: [number, number][], at: { x: number; y: number }, want?: string) => {
    let items = await namesAt(pts);
    if (items.length === 1) { pop.style.display = "none"; store.select(items[0].id, "map"); return; }
    if (!items.length) return;
    let states = await Promise.all(items.map((x: any) => statusOf(x.id)));
    // a mark of a row at the same place: the camera of that status, when it is the only one
    if (want && states.filter((v) => v === want).length === 1) { pop.style.display = "none"; store.select(items[states.indexOf(want)].id, "map"); return; }
    if (want && states.some((v) => v === want)) { items = items.filter((_x: any, i: number) => states[i] === want); states = states.filter((v) => v === want); }
    pop.innerHTML = `<div class="pts-pop-h">${items.length} ${cfg.names} qui</div>` + items.map((x: any, i: number) => {
      const st = stateOf(cfg, states[i]);
      return `<button type="button" data-id="${esc(x.id)}" data-status="${esc(states[i] ?? "")}"><img alt="" width="18" src="${markCanvas(st.mark, cfg.color).toDataURL()}"/>`
        + `<span>${esc(x.label)}<small>${esc(st.label)}</small></span></button>`;
    }).join("");
    const r = host.getBoundingClientRect();
    pop.style.left = `${Math.min(at.x + 10, r.width - 280)}px`; pop.style.top = `${Math.min(at.y + 10, r.height - 220)}px`;
    pop.style.display = "block";
  };
  pop.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("button[data-id]");
    if (b) { pop.style.display = "none"; store.select(b.dataset.id!, "map"); }
  });
  const clickCluster = async (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const id = (f.properties as any).cluster_id, s = map.getSource(src) as GeoJSONSource;
    const z = await s.getClusterExpansionZoom(id);
    if (z <= 12.5 && map.getZoom() < 13) { map.easeTo({ center: (f.geometry as any).coordinates, zoom: Math.max(z, map.getZoom() + 1), duration: 450 }); return; }
    // the same place (or nearly): the list of what is there
    const leaves = await s.getClusterLeaves(id, 60, 0);
    const chans = leaves.filter((l: any) => l.properties.ch);
    if (chans.length && chans.length === leaves.length) { openChannel((chans[0] as any).properties.ch); return; }
    list(leaves.map((l: any) => l.geometry.coordinates), e.point);
  };
  const clickPoint = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const p: any = f.properties;
    if (p.ch) { openChannel(p.ch); return; }
    list([(f.geometry as any).coordinates], e.point, p.off ? p.s : undefined);
  };
  map.on("click", L.cluster, clickCluster);
  map.on("click", L.point, clickPoint);
  for (const l of [L.cluster, L.point]) { map.on("mousemove", l, hover); map.on("mouseleave", l, leave); }
  const closePop = () => { pop.style.display = "none"; };
  map.on("movestart", closePop);
  // the person's source filter changed: the same list, filtered again (nothing else re-sends the data)
  let lastSources = JSON.stringify(store.get().scope.sources ?? null);
  const unsub = store.subscribe(() => {
    const now = JSON.stringify(store.get().scope.sources ?? null);
    if (now !== lastSources) { lastSources = now; if (active) put(); }
  });

  return {
    setActive(on: boolean) {
      if (on === active) return;
      active = on;
      for (const l of [L.cluster, L.point, `${src}-hover`]) map.setLayoutProperty(l, "visibility", on ? "visible" : "none");
      legend.style.display = on ? "flex" : "none";
      if (!on) { closePop(); leave(); return; }
      put().catch(() => { legend.innerHTML += `<span class="warn">elenco non disponibile ora</span>`; });
    },
    destroy() {
      unsub(); map.setMissingStyleImageResolver(prevResolver ?? null as any); map.off("movestart", closePop);
      tip.remove(); pop.remove(); legend.remove();
    },
  };
}

/** The layers of every installed point type (the map's own click handler skips them). */
export const pointLayerIds = (type: string) => { const s = `nexum-pts-${type.replace(/\W/g, "-")}`; return [`${s}-cluster`, `${s}-point`]; };
