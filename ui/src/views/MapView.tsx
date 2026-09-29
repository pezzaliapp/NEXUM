// MAP — one view of the NEXUM WORLD. MapLibre draws the basemap supplied by the service's provider (D4) and
// NEXUM's own layers on top (ids `nexum-*`). Below z 10 the Core returns aggregate cells when the scope exceeds
// the budget; from z 10 individual elements. The browser never holds more than 5,000 map features.

import { Map as MLMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { call, isSuperseded, plain } from "../lib/api";
import { band } from "../lib/confidence";
import { bandOpacity, colorOf, TOKENS } from "../lib/palette";
import { S } from "../lib/strings";
import type { Scope } from "../lib/types";
import { store, useStore } from "../store";

setWorkerUrl(mapWorkerUrl);   // MapLibre's worker is bundled locally by Vite (no CDN)

const MAX_FEATURES = 5000;
const LOCAL_Z = 10;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Signed-distance icons (circle, square, diamond, rings) so that one icon is tinted per feature. */
function sdfIcon(shape: "circle" | "square" | "diamond", ring = false, size = 48) {
  const data = new Uint8Array(size * size * 4);
  const r = size * 0.34, c = (size - 1) / 2, buffer = size * 0.12;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c;
    let d = shape === "circle" ? Math.hypot(dx, dy) - r
      : shape === "square" ? Math.max(Math.abs(dx), Math.abs(dy)) - r * 0.9
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
  if (z < LOCAL_Z) {
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

const emptyTypes = (s: Scope) => Array.isArray(s.types) && s.types.length === 0;

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const labelsEl = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const idsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [appears, setAppears] = useState<string | null>(null);
  const status = useStore((s) => s.status);
  const scope = useStore((s) => s.scope);
  const focus = useStore((s) => s.focus);
  const secondary = useStore((s) => s.secondary);
  const wv = useStore((s) => s.worldVersion);
  const rev = useStore((s) => s.rev);
  const context = useStore((s) => s.context);
  const hasGeo = !!status?.has_geometry;

  // ── create the map once ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasGeo || !el.current) return;
    let map: MLMap | null = null;
    let cancelled = false;
    plain<any>("/basemap/style.json").then((style) => {
      if (cancelled || !el.current) return;
      const created = new MLMap({
        container: el.current, style, center: [20, 22], zoom: 1.2, minZoom: 0, maxZoom: 15,
        renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, attributionControl: false,
        fadeDuration: 0, maxPitch: 0,
      });
      map = created;
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      created.addControl(new NavigationControl({ showCompass: false }), "top-right");
      created.on("load", () => {
        const m = created;
        m.addImage("ci", sdfIcon("circle"), { sdf: true });
        m.addImage("sq", sdfIcon("square"), { sdf: true });
        m.addImage("di", sdfIcon("diamond"), { sdf: true });
        m.addImage("ring", sdfIcon("circle", true), { sdf: true });
        m.addImage("ring-sq", sdfIcon("square", true), { sdf: true });
        for (const id of ["nexum-focus-geom", "nexum-links", "nexum-cells", "nexum-items", "nexum-sel"])
          m.addSource(id, { type: "geojson", data: EMPTY, ...(id === "nexum-items" ? { promoteId: "id" } : {}) });
        m.addLayer({ id: "nexum-focus-fill", type: "fill", source: "nexum-focus-geom",
          paint: { "fill-color": TOKENS.accent, "fill-opacity": 0.07 } });
        m.addLayer({ id: "nexum-focus-line", type: "line", source: "nexum-focus-geom",
          paint: { "line-color": TOKENS.accent, "line-width": 1.4, "line-opacity": 0.9 } });
        m.addLayer({ id: "nexum-links", type: "line", source: "nexum-links",
          paint: { "line-color": TOKENS.link, "line-width": 1, "line-opacity": 0.55 } });
        m.addLayer({ id: "nexum-cells", type: "symbol", source: "nexum-cells", layout: {
          "icon-image": "sq", "icon-size": ["get", "s"], "icon-allow-overlap": true, "icon-ignore-placement": true },
          paint: { "icon-color": ["get", "c"], "icon-opacity": 0.78 } });
        m.addLayer({ id: "nexum-cells-hl", type: "symbol", source: "nexum-cells", filter: ["==", ["get", "hl"], 1],
          layout: { "icon-image": "ring-sq", "icon-size": ["*", ["get", "s"], 1.25], "icon-allow-overlap": true,
            "icon-ignore-placement": true }, paint: { "icon-color": TOKENS.accent } });
        m.addLayer({ id: "nexum-items", type: "symbol", source: "nexum-items", layout: {
          "icon-image": ["match", ["get", "k"], "object", "sq", "insight", "di", "ci"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 6, 0.42, 12, 0.55],
          "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "p"] },
          paint: { "icon-color": ["get", "c"], "icon-opacity": ["get", "o"] } });
        m.addLayer({ id: "nexum-sel", type: "symbol", source: "nexum-sel", layout: {
          "icon-image": "ring", "icon-size": ["match", ["get", "role"], "focus", 0.95, 0.8],
          "icon-allow-overlap": true, "icon-ignore-placement": true },
          paint: { "icon-color": ["match", ["get", "role"], "focus", TOKENS.accent, TOKENS.link] } });
        const pick = (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          if (e.originalEvent.shiftKey) store.setSecondary(id); else store.select(id, "map");
        };
        m.on("click", "nexum-items", pick);
        m.on("click", "nexum-cells", (e) => {
          const bb = JSON.parse(e.features?.[0]?.properties?.bb ?? "null");
          if (bb) m.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { padding: 24, duration: 300, maxZoom: 11 });
        });
        for (const layer of ["nexum-items", "nexum-cells"]) {
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
              t.textContent = `${ent?.label ?? p.id} · ${ty?.label ?? ent?.type ?? ""}`;
            } else t.textContent = `${Number(p.n).toLocaleString("it-IT")} elementi · ${store.get().types.get(p.dom)?.label ?? p.dom}`;
            t.style.left = `${e.point.x + 12}px`;
            t.style.top = `${e.point.y + 12}px`;
            t.style.display = "block";
          });
        }
        m.on("moveend", () => schedule());
        m.on("render", () => drawLabels());
        mapRef.current = m;
        (window.__nexum ??= {}).map = m;
        setReady(true);
      });
    });
    return () => { cancelled = true; map?.remove(); mapRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGeo]);

  // ── projection requests (debounced; superseded requests are cancelled) ──
  const timer = useRef<number | undefined>(undefined);
  const firstDone = useRef(false);
  const schedule = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 120); };
  const load = async () => {
    const map = mapRef.current;
    if (!map) return;
    const st = store.get();
    const { vp, z } = viewportOf(map);
    store.set({ viewport: vp });
    if (emptyTypes(st.scope)) {
      (map.getSource("nexum-cells") as GeoJSONSource).setData(EMPTY);
      (map.getSource("nexum-items") as GeoJSONSource).setData(EMPTY);
      idsRef.current = [];
      store.set({ mapInfo: { lod: "refs", level: null, returned: 0, total: 0, truncated: false, noGeometry: 0, ms: 0 } });
      return;
    }
    const t0 = performance.now();
    try {
      // budget by screen class (§L): desktop 5,000 · tablet 2,500 · phone 300
      const budget = innerWidth >= 1280 ? 5000 : innerWidth >= 768 ? 2500 : 300;
      const r = await call<any>("/projections/map", { s: { ...st.scope, viewport: vp, z }, b: { max_items: budget },
        hl: st.focus && !st.focus.startsWith("rel_") ? st.focus : undefined }, { channel: "map" });
      const m = mapRef.current;
      if (!m) return;
      const hlCell = r.highlight?.find((h: any) => h.appears_as === "in_cell");
      setAppears(st.focus ? (r.highlight?.[0]?.appears_as ?? (st.focus.startsWith("rel_") ? "relation" : null)) : null);
      if (r.lod === "aggregates") {
        const cells = r.data.cells as any[];
        const maxN = Math.max(1, ...cells.map((c) => c.n));
        const L = r.data.effective_scope.level as number;
        const cellPx = (512 * 2 ** m.getZoom()) / 2 ** L;            // on-screen width of one cell
        const unit = Math.min(1, Math.max(0.2, cellPx / 48));
        const feats = cells.slice(0, MAX_FEATURES).map((c) => {
          const [w, e, s, n] = c.bbox;
          const fam = store.get().types.get(c.dominant_type)?.family;
          return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [(w + e) / 2, (s + n) / 2] },
            properties: { n: c.n, dom: c.dominant_type, c: colorOf(fam, fam ? undefined : "insight"),
              s: unit * (0.3 + 0.7 * Math.sqrt(c.n / maxN)), bb: JSON.stringify(c.bbox),
              hl: hlCell && hlCell.cell && hlCell.cell.x === c.x && hlCell.cell.y === c.y ? 1 : 0 } };
        });
        (m.getSource("nexum-cells") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
        (m.getSource("nexum-items") as GeoJSONSource).setData(EMPTY);
        idsRef.current = [];
        store.set({ mapInfo: { lod: "aggregates", level: r.data.effective_scope.level, returned: feats.length,
          total: r.total ?? 0, truncated: r.truncated, noGeometry: r.excluded.no_geometry ?? 0, ms: Math.round(performance.now() - t0) } });
      } else {
        const d = store.normalize(r.data);
        const ids: string[] = d.items.slice(0, MAX_FEATURES).map((x: any) => x.$ref);
        idsRef.current = ids;
        const types = store.get().types;
        const feats = ids.map((id) => {
          const e = store.entity(id)!;
          const t = types.get(e.type);
          return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: e.point! },
            properties: { id, k: e.kind, c: colorOf(t?.family, e.kind), o: bandOpacity[band(e.confidence)],
              p: t?.density_priority ?? 9 } };
        }).filter((f) => f.geometry.coordinates);
        (m.getSource("nexum-items") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
        (m.getSource("nexum-cells") as GeoJSONSource).setData(EMPTY);
        store.set({ mapInfo: { lod: r.lod, level: r.data.effective_scope?.level ?? null, returned: ids.length,
          total: r.total ?? ids.length, truncated: r.truncated, noGeometry: r.excluded.no_geometry ?? 0,
          ms: Math.round(performance.now() - t0) } });
      }
      setNote(r.excluded?.no_geometry ? S.noGeometryNotice(r.excluded.no_geometry) : null);
      if (!firstDone.current) {
        firstDone.current = true;
        m.once("idle", () => performance.mark("nexum:ready"));
      }
      performance.mark("nexum:map:rendered");
    } catch (e) {
      if (!isSuperseded(e)) setNote(`${S.error}: ${(e as Error).message}`);
    }
  };

  useEffect(() => { if (ready) schedule(); /* eslint-disable-next-line */ }, [ready, JSON.stringify(scope), wv, focus]);

  // ── selection: ring on focus/secondary; the view moves to the selection chosen elsewhere (D9) ──
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const feats: GeoJSON.Feature[] = [];
    for (const [id, role] of [[focus, "focus"], [secondary, "secondary"]] as const) {
      const p = store.entity(id)?.point;
      if (id && p) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { role } });
    }
    (m.getSource("nexum-sel") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    const geom = store.entity(focus)?.details?.geometry;
    (m.getSource("nexum-focus-geom") as GeoJSONSource).setData(
      geom && /Polygon/.test(geom.type) ? { type: "Feature", geometry: geom, properties: {} } : EMPTY);
    // relation lines from the focus to related elements that have a place
    const fp = store.entity(focus)?.point;
    const lines: GeoJSON.Feature[] = [];
    if (fp && context?.id === focus) {
      for (const sec of ["related_objects", "related_events"]) {
        for (const it of context.data?.[sec]?.items ?? []) {
          const p = store.entity(it.$ref)?.point;
          if (p && it.$ref !== focus) lines.push({ type: "Feature", geometry: { type: "LineString", coordinates: [fp, p] }, properties: {} });
        }
      }
    }
    (m.getSource("nexum-links") as GeoJSONSource).setData({ type: "FeatureCollection", features: lines.slice(0, 200) });
    drawLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus, secondary, rev, context]);

  const lastMoved = useRef<string | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !focus || lastMoved.current === focus) return;
    lastMoved.current = focus;
    if (store.get().origin === "map") return;
    call<any>(`/entities/${focus}/locate`, undefined, { channel: "map-locate" }).then((r) => {
      const loc = r.data.map;
      if (!loc?.point || !mapRef.current) return;
      const [w, s, e, n] = loc.bbox ?? [loc.point[0], loc.point[1], loc.point[0], loc.point[1]];
      if (e - w > 0.5 || n - s > 0.5) m.fitBounds([[w, s], [e, n]], { padding: 40, duration: 300, maxZoom: 6 });
      else if (!m.getBounds().contains(loc.point) || m.getZoom() < 3)
        m.easeTo({ center: loc.point, zoom: Math.max(m.getZoom(), 4), duration: 300 });
    }).catch(() => {});
  }, [ready, focus]);

  // ── HTML labels (D4: Phase 2 solution, isolated here) ────────────────────
  const raf = useRef(0);
  const drawLabels = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const m = mapRef.current, host = labelsEl.current;
      if (!m || !host) return;
      const st = store.get();
      const w = host.clientWidth, h = host.clientHeight;
      const boxes: [number, number, number, number][] = [];
      const out: string[] = [];
      const place = (id: string, cls: string) => {
        const e = store.entity(id);
        if (!e?.point) return;
        const p = m.project(e.point as [number, number]);
        if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return;
        const bw = Math.min(220, e.label.length * (cls ? 7.4 : 6.4)) + 10, bx = p.x + 6, by = p.y - 8;
        if (!cls && boxes.some(([x, y, x2, y2]) => bx < x2 && bx + bw > x && by < y2 && by + 16 > y)) return;
        boxes.push([bx, by, bx + bw, by + 16]);
        const safe = e.label.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
        out.push(`<div class="maplabel ${cls}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">${safe}</div>`);
      };
      if (st.focus) place(st.focus, "focus");
      if (st.secondary) place(st.secondary, "focus");
      const ids = [...idsRef.current].sort((a, b) => {
        const ea = store.entity(a)!, eb = store.entity(b)!;
        const pa = st.types.get(ea.type)?.density_priority ?? 9, pb = st.types.get(eb.type)?.density_priority ?? 9;
        return pa - pb || (eb.confidence ?? 0) - (ea.confidence ?? 0);
      });
      const maxLabels = w < 600 ? 12 : 30;
      for (const id of ids) { if (out.length >= maxLabels) break; if (id !== st.focus) place(id, ""); }
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
      <div ref={labelsEl} className="maplabels" aria-hidden />
      <div ref={tipEl} className="tooltip" style={{ display: "none" }} />
      {focus && appears && appears !== "single" && (
        <div className="view-toolbar"><span className="chip acc" data-testid="map-appears" data-appears={appears}>
          {appears === "in_cell" ? S.inCell : appears === "not_applicable" ? S.notOnMap : appears === "relation"
            ? S.kinds.relation : S.outsideScope}</span></div>)}
      {note && <div className="overlay-note" data-testid="map-note">{note}</div>}
      <div className="phone-attr" data-testid="map-attr">{S.status.data}: {[...new Set([...(status?.sources ?? []).map((s) => s.attribution),
        status?.basemap?.["nexum:attribution"]].filter(Boolean))].join(" · ")}</div>
    </>
  );
}
