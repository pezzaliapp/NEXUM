// THE OPERATIONAL TOOLS' PANELS (downloaded the first time a tool is opened). Each panel says where its information
// comes from, asks the provider only when the person opens it or acts, and keeps nothing outside this browser.

import { lazyStale } from "../lib/stale";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import NEWS from "../config/news.json";
import OPS from "../config/ops.json";
import { spaceWeather as SW } from "../config/ops-space.json";
import { call } from "../lib/api";
import { store, useStore } from "../store";
import { useHighlights } from "../components/Highlights";
import { localTime } from "../lib/localtime";
import { ops, TOOL_CLASS, useOps, type OpsLayers, type OpsState, type Tool } from "./state";
import { MaritimeGroup, TOOLS } from "./OpsShell";
import { DESK_W, registerLayer } from "../lib/layers";
import { sheetDrag, sheetRoom } from "../lib/sheetdrag";
import { bboxOf, compass, bearing, fmtKm, fmtKm2, fmtLatLng, haversine, inRing, type LngLat } from "./geo";
import { draw, download, NAMES, shapesGeoJSON, toCSV, type DrawMode, type Shape } from "./draw";
import { CHANNELS, highlight, IMPORT_COLORS, importedData, tableMeta } from "./overlays";
import { feed, KINDS, SOURCE_NAME, type AlertKind, type Feed } from "./alerts";
import { familyColor, familyLabel, groupOf, GROUPS, loadOrbits, orbitDetail } from "./orbits";
import { applyTheme, THEMES } from "./theme";

const Sky = lazyStale(() => import("./Sky"));
const Ai = lazyStale(() => import("./Ai"));
const TITLES = Object.fromEntries(TOOLS.map((t) => [t.id, t.label])) as Record<Tool, string>;
const SHORT = Object.fromEntries(TOOLS.map((t) => [t.id, t.short])) as Partial<Record<Tool, string>>;

/** The tools' panel (when one is chosen) and the cards of what was tapped on the map (with or without a panel). */
export default function Panels({ map, tool }: { map: MLMap; tool: Tool | null }) {
  const orbit = useOps((s) => s.orbit), feat = useOps((s) => s.feat);
  return (
    <>
      {tool && <ToolSheet map={map} tool={tool} />}
      {orbit != null && <OrbitCard id={orbit} />}
      {feat && <FeatCard map={map} feat={feat} />}
    </>);
}

function ToolSheet({ map, tool }: { map: MLMap; tool: Tool }) {
  const body: Record<Tool, () => ReactNode> = {
    layers: () => <LayersPanel map={map} />, draw: () => <DrawPanel map={map} />, alerts: () => <AlertsPanel map={map} />,
    markets: () => <MarketsPanel />, route: () => <RoutePanel map={map} />, cams: () => <CamsPanel map={map} />,
    live: () => <LivePanel map={map} />, sky: () => <Suspense fallback={<p className="xs dim">…</p>}><Sky map={map} /></Suspense>,
    space: () => <SpacePanel />, import: () => <ImportPanel map={map} />, scenes: () => <ScenesPanel map={map} />,
    net: () => <NetPanel />, point: () => <PointPanel map={map} />, style: () => <StylePanel />, share: () => <SharePanel map={map} />,
    help: () => <HelpPanel />, dossier: () => <PointPanel map={map} />,
    registers: () => <RegistersPanel />,
    ai: () => <Suspense fallback={<p className="xs dim">…</p>}><Ai /></Suspense>,
  };
  const touch = innerWidth < DESK_W;
  const sheet = useOps((s) => s.sheet);
  const pickOn = useOps((s) => s.pick);
  // touch: the compact sheet covers the bottom of the map — the map's padding makes "centre", fly-to and fit-to mean
  // the part still visible above it; removed when the sheet closes
  const ref = useRef<HTMLElement | null>(null);
  // the handle: drag between strip · half · whole height; a tap steps up (and from the top back to half)
  const grip = sheetDrag(() => ref.current, () => {
    const room = sheetRoom(), side = !!ref.current && ref.current.getBoundingClientRect().width < innerWidth * 0.8;
    return side ? [{ name: "peek", px: 96 }, { name: "half", px: room }, { name: "full", px: room + 1 }]
      : [{ name: "peek", px: Math.min(200, room * 0.42) }, { name: "half", px: Math.min(room * 0.55, 460) }, { name: "full", px: room - 6 }];
  }, () => ops.get().sheet, (n) => ops.set({ sheet: n as "peek" | "half" | "full" }),
    () => ops.set({ sheet: ops.get().sheet === "peek" ? "half" : ops.get().sheet === "half" ? "full" : "half" }));
  useLayoutEffect(() => {
    if (!touch || !ref.current) return;
    const el = ref.current;
    const put = () => {
      if (ops.get().sheet === "full") return;
      const r = el.getBoundingClientRect();
      const side = r.width < innerWidth * 0.8;              // the side sheet of short, wide screens
      map.setPadding({ top: 0, left: 0, right: side ? r.width : 0, bottom: side ? 0 : r.height });
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => { ro.disconnect(); map.setPadding({ top: 0, left: 0, right: 0, bottom: 0 }); };
  }, [touch, map, sheet]);
  // touch: while a tool is open it is the surface in use — the home strip steps aside (back when the tool closes)
  useEffect(() => {
    if (!touch) return;
    const app = document.querySelector(".app");
    app?.classList.add("ops-tool-open");
    return () => app?.classList.remove("ops-tool-open");
  }, [touch]);
  return (
    <>
      <section ref={ref} className={`ops-panel${touch ? " ov ops-sheet" : ""}`} data-testid={`ops-panel-${tool}`} aria-label={TITLES[tool]}
        data-sheet={touch ? sheet : undefined} data-class={TOOL_CLASS[tool]}>
        {touch && <div className="sheet-handle ops-grip" data-testid="ops-sheet-handle" role="button" tabIndex={0} aria-label="Trascina per ridimensionare il pannello" {...grip}>
          <span className="grip" aria-hidden /></div>}
        <header className="ops-ph">
          {/* touch layouts: back to the palette (it replaces this panel: one surface at a time) */}
          {touch && <button type="button" className="ops-back" data-testid="ops-panel-tools" aria-label="Strumenti" onClick={() => ops.palette(true)}>⌖ Strumenti</button>}
          <b className="ops-ptitle">{touch ? SHORT[tool] ?? TITLES[tool] : TITLES[tool]}</b><span className="grow" />
          {touch && <button type="button" className="ops-ic ops-sheet-toggle" data-testid="ops-sheet-toggle" aria-label={sheet === "full" ? "Riduci il pannello: mostra la mappa" : "Espandi il pannello"}
            title={sheet === "full" ? "Mostra la mappa" : "Espandi"} onClick={() => ops.set({ sheet: sheet === "full" ? "half" : "full" })}>{sheet === "full" ? "▾" : "▴"}</button>}
          <button type="button" className="ops-close" aria-label="Chiudi" data-testid="ops-panel-close" onClick={() => ops.set({ tool: null })}>×</button></header>
        {pickOn && <p className="ops-pick xs" data-testid="ops-pick-hint">Tocca un punto sulla mappa{pickOn === "from" ? " (partenza)" : pickOn === "to" ? " (arrivo)" : ""}…
          {" "}<button type="button" className="xs" onClick={() => ops.set({ pick: null })}>Annulla</button></p>}
        <div className="ops-pb">{body[tool]()}</div>
      </section>
    </>);
}

// ── helpers ───────────────────────────────────────────────────────────────
async function getJSON(url: string, init?: RequestInit, ms = 20000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  // FOSSGIS's community servers (routing, Overpass) ask to know the site using them: its origin only (never a page path,
  // never anything about the person); every other provider gets no referrer at all
  const fossgis = /^https:\/\/(valhalla1|routing)\.openstreetmap\.de\//.test(url);
  try {
    const r = await fetch(url, { ...init, signal: c.signal, referrerPolicy: fossgis ? "origin" : "no-referrer" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
/** One request a second at most per provider (OSM community services' rule). */
const gates = new Map<string, number>();
async function polite(host: string) {
  const wait = (gates.get(host) ?? 0) + 1100 - Date.now();
  gates.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
function useRemote<T>(key: string | null, fn: () => Promise<T>) {
  const [st, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!key });
  useEffect(() => {
    if (!key) return;
    let live = true;
    set((s) => ({ data: s.data, loading: true }));
    fn().then((data) => live && set({ data, loading: false }), (e) => live && set({ error: String(e?.message ?? e), loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return st;
}
const Credit = ({ children }: { children: ReactNode }) => <p className="xs faint ops-credit">{children}</p>;
const Err = ({ e }: { e?: string }) => (e ? <p className="xs warn">Il servizio non risponde ora ({e}).</p> : null);
/** Touch: what a panel shows on the map is seen — the sheet becomes compact (its content and state are kept). */
const showMap = () => { if (innerWidth < DESK_W && ops.get().tool && ops.get().sheet === "full") ops.set({ sheet: "half" }); };
/** Touch: an action that needs taps on the map brings the sheet down to its strip. */
const forMap = () => { if (innerWidth < DESK_W && ops.get().tool) ops.set({ sheet: "peek" }); };
const fly = (map: MLMap, c: [number, number], z = 7) => { showMap(); map.flyTo({ center: c, zoom: Math.max(map.getZoom(), z), duration: 900, essential: true }); };
const fit = (map: MLMap, b: [number, number, number, number], opts: Record<string, any> = {}) => {
  showMap(); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, duration: 700, ...opts });
};
const viewBox = (map: MLMap): [number, number, number, number] => {
  const b = map.getBounds();
  return [Math.max(-180, b.getWest()), Math.max(-85, b.getSouth()), Math.min(180, b.getEast()), Math.min(85, b.getNorth())];
};
const fmtTime = (t: number | string) => new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function ensureLine(map: MLMap, id: string, color: string) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: `${id}-fill`, type: "fill", source: id, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.12 } }, "nexum-focus-fill");
    map.addLayer({ id, type: "line", source: id, paint: { "line-color": color, "line-width": 3, "line-opacity": 0.9 } }, "nexum-focus-fill");
  }
  return map.getSource(id) as GeoJSONSource;
}

/** NEXUM's own elements in a box (the Core's map projection, individual elements). */
async function nexumIn(box: [number, number, number, number], types?: string[], max = 2000) {
  const st = store.get();
  const s: any = { ...st.scope, viewport: box.map((x) => Math.round(x * 1e4) / 1e4), z: 14 };
  if (types) s.types = types;
  const r = await call<any>("/projections/map", { s, b: { max_items: max, lod: "refs" } }, { channel: `ops-${types?.join() ?? "all"}` });
  const d = store.normalize(r.data);
  return { items: (d.items ?? []).map((x: any) => store.entity(x.$ref)!).filter((e: any) => e?.point), total: r.total ?? d.items?.length ?? 0, truncated: !!r.truncated };
}

// ── LAYERS ────────────────────────────────────────────────────────────────
const LAYER_LIST: { k: keyof OpsLayers; label: string; note?: string }[] = [
  { k: "orbits", label: OPS.orbits.label, note: "posizioni calcolate (SGP4), non osservate" },
  { k: "quakes", label: OPS.alerts.layerLabel, note: "verificati da un'istituzione, M 2,5+" },
  { k: "gdacs", label: "Allerte GDACS (arancioni e rosse)", note: "Commissione europea e Nazioni Unite, automatiche" },
  { k: "nws", label: "Avvisi meteo gravi NWS (USA)", note: "solo Stati Uniti" },
  { k: "news", label: OPS.news.label, note: "riportato dai media, codifica automatica" },
  { k: "hotspots", label: "Punti caldi (incendi attivi, 24 h)", note: "rilevamenti VIIRS, non incendi confermati" },
  { k: "clouds", label: "Nubi (infrarosso, orario)" },
  { k: "precip", label: "Precipitazioni (giornaliere)" },
  { k: "aurora", label: "Ovale dell'aurora (previsione 30 min)" },
  { k: "channels", label: "Canali live ufficiali", note: `${CHANNELS.length} enti pubblici` },
  { k: "camPreviews", label: "Anteprime telecamere sulla mappa", note: "da zoom 13, le 6 più vicine al centro; immagini caricate dai gestori solo ora" },
  { k: "streets", label: "Strade, edifici, nomi delle vie (OpenFreeMap)", note: "mappa di terzi, solo se la scegli" },
  { k: "terrain", label: "Rilievo 3D" },
  { k: "hillshade", label: "Ombreggiatura del rilievo" },
  { k: "buildings", label: "Edifici 3D (inclina la mappa)" },
  { k: "spin", label: "Rotazione lenta del globo (scala mondiale)" },
  { k: "imported", label: "File importati" },
];
/** Livelli by group (physical test: what exists must be found where one looks for it). */
const LAYER_GROUPS: [string, (keyof OpsLayers)[] | "maritime"][] = [
  ["Spazio", ["orbits"]], ["Marittimo", "maritime"], ["Avvisi in diretta", ["quakes", "gdacs", "nws", "news"]],
  ["Terra e clima", ["hotspots", "clouds", "precip", "aurora"]], ["Telecamere e dirette", ["channels", "camPreviews"]],
  ["Mappa", ["streets", "terrain", "hillshade", "buildings", "spin", "imported"]],
];
function LayersPanel({ map }: { map: MLMap }) {
  const layers = useOps((s) => s.layers);
  const counts = useOps((s) => s.counts);
  return (
    <>
      <p className="xs dim">I livelli di NEXUM (luoghi, eventi, infrastrutture, telecamere…) si scelgono nel pannello a sinistra; qui i livelli operativi.</p>
      {LAYER_GROUPS.map(([g, ks]) => ks === "maritime" ? <MaritimeGroup key={g} map={map} prefix="ops-layer" /> : (
        <div key={g} className="ops-group"><div className="ops-group-h">{g}</div>
          <ul className="ops-list">
            {ks.map((k) => LAYER_LIST.find((x) => x.k === k)!).map((l) => (
          <li key={l.k}><label className="row">
            <input type="checkbox" className="ops-switch" checked={layers[l.k]} data-testid={`ops-layer-${l.k}`} onChange={() => ops.layer(l.k)} />
            <span className="grow">{l.label}{l.note && <span className="xs faint"> · {l.note}</span>}</span>
            {counts[l.k] ? <span className="mono xs dim">{counts[l.k].toLocaleString("it-IT")}</span> : null}
          </label>{l.k === "orbits" && layers.orbits && <SatGroups />}</li>))}
          </ul></div>))}
      <p className="xs warn" data-testid="ops-airtraffic-blocked">{OPS.orbits.airTraffic}</p>
      <div className="hl-h">Viste</div>
      <div className="ops-chips">
        {OPS.presets.map((p) => <button key={p.id} type="button" className="chip" onClick={() => { showMap(); map.flyTo({ center: p.c as [number, number], zoom: p.z, duration: 900 }); }}>{p.label}</button>)}
      </div>
    </>);
}

/** Orbital categories (CelesTrak's groups): a switch and the count of each, all on by default. */
function SatGroups() {
  const off = useOps((s) => s.satOff);
  const [n, setN] = useState<Record<string, number>>({});
  useEffect(() => { loadOrbits().then((t) => { const c: Record<string, number> = {}; for (const r of t.rows) { const g = groupOf(r.family); c[g] = (c[g] ?? 0) + 1; } setN(c); }); }, []);
  return (
    <ul className="ops-sub" data-testid="ops-sat-groups">{GROUPS.map(([g, label]) => (
      <li key={g}><label className="row xs"><input type="checkbox" className="ops-switch" checked={!off.includes(g)} data-testid={`ops-sat-${g}`}
        onChange={() => ops.set({ satOff: off.includes(g) ? off.filter((x) => x !== g) : [...off, g] })} />
        <span className="grow">{label}</span><span className="mono dim">{n[g] != null ? n[g].toLocaleString("it-IT") : ""}</span></label></li>))}</ul>);
}

// ── DRAW / AOI ────────────────────────────────────────────────────────────
function useDraw() {
  const [, tick] = useState(0);
  useEffect(() => draw.subscribe(() => tick((n) => n + 1)), []);
  return draw;
}
function DrawPanel({ map }: { map: MLMap }) {
  const d = useDraw();
  const mode = d.mode();
  // a shape finished: the sheet comes back to half, where its measures and contents are read
  const n = d.shapes().length, seen = useRef(n);
  useEffect(() => { if (n > seen.current && ops.get().sheet === "peek") ops.set({ sheet: "half" }); seen.current = n; }, [n]);
  const live = mode ? draftMeasure(mode) : null;
  return (
    <>
      {mode && <p className="xs" data-testid="ops-draw-hint">{innerWidth < DESK_W ? (mode === "box" || mode === "radius" ? "Tocca sulla mappa il primo punto, poi il secondo." : "Tocca la mappa per aggiungere punti; Fine per chiudere.")
        : mode === "box" || mode === "radius" ? "Clic sul primo punto, poi sul secondo." : "Clic per aggiungere punti; doppio clic (o Fine) per chiudere."}
        {live && <b className="mono"> {live}</b>}
        {" "}<button type="button" className="xs" onClick={() => d.finish()}>Fine</button><button type="button" className="xs" onClick={() => d.undo()}>Annulla punto</button>
        <button type="button" className="xs" onClick={() => d.start(null)}>Esci</button></p>}
      <div className="ops-chips">
        {(Object.keys(NAMES) as DrawMode[]).map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={mode === m} data-testid={`ops-draw-${m}`} onClick={() => { d.start(mode === m ? null : m); if (mode !== m) forMap(); }}>{NAMES[m]}</button>))}
      </div>

      <div className="hl-h">Aree di interesse ({d.shapes().length})</div>
      {!d.shapes().length && <p className="xs dim">Nessuna forma. Disegna un'area: NEXUM conta e elenca gli elementi del mondo al suo interno.</p>}
      <ul className="ops-list">{d.shapes().map((s) => <ShapeRow key={s.id} s={s} map={map} />)}</ul>
      {d.shapes().length > 0 && <div className="row">
        <button type="button" className="xs primary" data-testid="ops-export-geojson" onClick={() => download("nexum-aree.geojson", JSON.stringify(shapesGeoJSON(d.shapes()), null, 1), "application/geo+json")}>Esporta GeoJSON</button>
        <button type="button" className="xs" onClick={() => { if (confirm("Eliminare tutte le forme?")) d.clear(); }}>Elimina tutte</button></div>}
      <Credit>Misure sulla sfera (raggio medio 6.371 km): ±0,5 % rispetto all'ellissoide. Le forme restano solo in questo browser.</Credit>
    </>);
}
function draftMeasure(mode: DrawMode): string | null {
  const p = draw.pending(), h = draw.hover();
  const all = h ? [...p, h] : p;
  if (all.length < 2) return null;
  if (mode === "radius") return `r ${fmtKm(haversine(all[0], all[1]))}`;
  if (mode === "path" || all.length === 2) {
    const last = all.slice(-2);
    return `${fmtKm(all.slice(1).reduce((s, q, i) => s + haversine(all[i], q), 0))} · ${Math.round(bearing(last[0], last[1]))}° ${compass(bearing(last[0], last[1]))}`;
  }
  return null;
}
function ShapeRow({ s, map }: { s: Shape; map: MLMap }) {
  const [inside, setInside] = useState<{ n: number; truncated: boolean; byType: [string, number][]; items: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const count = async () => {
    if (!s.ring) return;
    setBusy(true);
    try {
      const r = await nexumIn(bboxOf(s.ring), undefined, 5000);
      const items = r.items.filter((e: any) => inRing(e.point, s.ring!));
      const by = new Map<string, number>();
      for (const e of items) by.set(e.type, (by.get(e.type) ?? 0) + 1);
      setInside({ n: items.length, truncated: r.truncated, byType: [...by].sort((a, b) => b[1] - a[1]), items });
    } finally { setBusy(false); }
  };
  const types = store.get().types;
  // WATCH (OSIRIS's area tripwire, for events only — never vehicles or people): while this page is open, the live alerts
  // (geological survey, GDACS, NWS, grouped news) that appear inside the shape after the watch starts are logged here
  const [watch, setWatch] = useState(false);
  const [log, setLog] = useState<{ base: number; fresh: { id: string; title: string; kind: string; t: number }[] } | null>(null);
  useEffect(() => {
    if (!watch || !s.ring) { setLog(null); return; }
    let live = true, seen: Set<string> | null = null;
    const look = async () => {
      const fs = await Promise.all(KINDS.map((k) => feed(k)));
      const inside = fs.flatMap((f) => f.items).filter((a) => a.c && inRing(a.c, s.ring!));
      if (!live) return;
      if (!seen) { seen = new Set(inside.map((a) => a.id)); setLog({ base: seen.size, fresh: [] }); return; }
      const added = inside.filter((a) => !seen!.has(a.id));
      added.forEach((a) => seen!.add(a.id));
      if (added.length) setLog((l) => ({ base: l?.base ?? 0, fresh: [...added.map((a) => ({ id: a.id, title: `${a.title}${a.place ? ` · ${a.place}` : ""}`, kind: a.verified ? "verificato" : "riportato", t: Date.now() })), ...(l?.fresh ?? [])].slice(0, 50) }));
    };
    look();
    const t = setInterval(look, 120_000);
    return () => { live = false; clearInterval(t); };
  }, [watch, s.ring]);
  return (
    <li className="ops-shape" data-testid="ops-shape">
      <div className="row"><b className="grow ellipsis">{s.name}</b>
        <span className="mono xs">{s.km2 ? fmtKm2(s.km2) : ""}{s.km2 ? " · " : ""}{fmtKm(s.km)}</span></div>
      <div className="row xs">
        <button type="button" className="xs" onClick={() => fit(map, bboxOf(s.ring ?? s.pts), { padding: 60, duration: 600 })}>Mostra</button>
        {s.ring && <button type="button" className="xs" data-testid="ops-aoi-count" disabled={busy} onClick={count}>{busy ? "Conto…" : "Cosa c'è dentro"}</button>}
        <button type="button" className="xs" onClick={() => { const n = prompt("Nome", s.name); if (n) draw.rename(s.id, n); }}>Rinomina</button>
        <button type="button" className="xs" onClick={() => draw.remove(s.id)}>Elimina</button>
      </div>
      {s.ring && <label className="ops-qrow xs"><input type="checkbox" checked={watch} onChange={() => setWatch(!watch)} data-testid="ops-aoi-watch" /> sorveglia gli avvisi in quest'area</label>}
      {log && <div className="xs" data-testid="ops-aoi-watch-log">Sorveglianza attiva (solo mentre la pagina è aperta): {log.base} avvisi già dentro all'avvio; nuovi: {log.fresh.length}
        <ul className="ops-mini">{log.fresh.map((x) => <li key={x.id}>{new Date(x.t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {x.title} <span className="dim">({x.kind})</span></li>)}</ul></div>}
      {inside && <div className="xs" data-testid="ops-aoi-result">
        <b>{inside.n.toLocaleString("it-IT")}</b> elementi NEXUM nel periodo osservato{inside.truncated ? " (almeno: la richiesta è stata limitata)" : ""}:
        {" "}{inside.byType.slice(0, 8).map(([t, n]) => `${types.get(t)?.label ?? t} ${n}`).join(" · ")}
        <ul className="ops-mini">{inside.items.slice(0, 12).map((e: any) => <li key={e.id}><button type="button" className="linklike xs" onClick={() => store.select(e.id, "ops-aoi")}>{e.label}</button></li>)}</ul>
        <button type="button" className="xs" data-testid="ops-aoi-csv" onClick={() => download(`${s.name}.csv`, toCSV(["id", "nome", "tipo", "lon", "lat", "data"],
          inside.items.map((e: any) => [e.id, e.label, types.get(e.type)?.label ?? e.type, e.point[0], e.point[1], e.t ? new Date(e.t).toISOString() : ""])), "text/csv")}>Esporta CSV</button>
        <button type="button" className="xs" onClick={() => download(`${s.name}-contenuto.geojson`, JSON.stringify({ type: "FeatureCollection", features: inside.items.map((e: any) => ({
          type: "Feature", geometry: { type: "Point", coordinates: e.point }, properties: { id: e.id, nome: e.label, tipo: types.get(e.type)?.label ?? e.type } })) }), "application/geo+json")}>Esporta GeoJSON</button>
      </div>}
    </li>);
}

// ── ALERTS ────────────────────────────────────────────────────────────────
// ── LIVE ALERTS (master pass): one list from every source, each item saying whether it is REPORTED by the media or
// VERIFIED by an institution; tabs, search, "only in view", groups by age; a card locates and marks its place and opens
// its information; a point on the map opens the same information ──
const LAYER_OF: Record<AlertKind, string> = { news: "ops-news", geo: "ops-quakes", gdacs: "ops-gdacs", nws: "ops-nws" };
const LAYER_KEY: Record<AlertKind, keyof OpsLayers> = { news: "news", geo: "quakes", gdacs: "gdacs", nws: "nws" };
type Row = { id: string; kind: AlertKind | "nexum"; verified: boolean; title: string; place: string; t: number | null; c: [number, number] | null; src: string; url: string | null; n?: number; level?: string; props?: any; ref?: string };
const TABS = [["all", "Tutti"], ["verified", "Verificati"], ["reported", "Riportati dai media"], ["geo", "Terremoti"], ["nexum", "NEXUM"]] as const;
const ageOf = (t: number | null) => t == null ? 3 : (Date.now() - t) / 3.6e6 < 1 ? 0 : (Date.now() - t) / 3.6e6 < 6 ? 1 : (Date.now() - t) / 3.6e6 < 24 ? 2 : 3;
const AGE = ["Ultima ora", "1–6 ore", "6–24 ore", "Più vecchi"];
function AlertsPanel({ map }: { map: MLMap }) {
  const h = useHighlights();
  const hl: any = h.data?.data;
  const [feeds, setFeeds] = useState<Partial<Record<AlertKind, Feed>>>({});
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [inView, setInView] = useState(false);
  const [, tick] = useState(0);
  const load = (fresh = false) => { for (const k of KINDS) feed(k, fresh).then((f) => setFeeds((o) => ({ ...o, [k]: f }))); };
  useEffect(() => { load(); const a = setInterval(() => load(), 5 * 60_000), b = setInterval(() => tick((x) => x + 1), 30_000); return () => { clearInterval(a); clearInterval(b); }; }, []);
  const nexum: Row[] = useMemo(() => {
    const seen = new Set<string>();
    return [...(hl?.recent ?? []), ...(hl?.strongest ?? [])].filter((r: any) => !seen.has(r.$ref) && !!seen.add(r.$ref)).map((r: any) => {
      const e = store.entity(r.$ref);
      return { id: `nexum:${r.$ref}`, ref: r.$ref, kind: "nexum" as const, verified: true, title: e?.label ?? r.head ?? r.$ref, place: "", t: e?.t ?? null,
        c: (e?.point as [number, number] | undefined) ?? null, src: "NEXUM", url: null };
    });
  }, [hl]);
  const all: Row[] = [...KINDS.flatMap((k) => (feeds[k]?.items ?? []) as Row[]), ...nexum];
  const b = inView ? map.getBounds() : null, low = q.trim().toLowerCase();
  const keep = (r: Row) => (tab === "all" || (tab === "verified" && r.verified) || (tab === "reported" && !r.verified) || r.kind === tab)
    && (!low || `${r.title} ${r.place} ${r.src}`.toLowerCase().includes(low)) && (!b || (!!r.c && b.contains(r.c)));
  const rows = all.filter(keep).sort((x, y) => (y.t ?? 0) - (x.t ?? 0));
  const count = (k: string) => all.filter((r) => k === "all" || (k === "verified" && r.verified) || (k === "reported" && !r.verified) || r.kind === k).length;
  const choose = (r: Row) => {
    if (r.ref) { store.select(r.ref, "ops-alerts"); if (r.c) fly(map, r.c, 6); return; }
    if (!r.c || r.kind === "nexum") return;
    const k = r.kind;
    if (!ops.get().layers[LAYER_KEY[k]]) ops.layer(LAYER_KEY[k], true);      // its marker on the map
    fly(map, r.c, k === "news" ? 6 : 7);
    setTimeout(() => highlight(r.c!), 700);
    ops.set({ feat: { c: r.c, fs: [{ l: LAYER_OF[k], p: { ...r.props, aid: r.id } }] } });
  };
  const groups = [0, 1, 2, 3].map((g) => rows.filter((r) => ageOf(r.t) === g)).map((xs, g) => [g, xs.slice(0, 120)] as const).filter(([, xs]) => xs.length);
  return (
    <>
      <div className="ops-srcs xs" data-testid="ops-alerts-sources">{KINDS.map((k) => { const f = feeds[k];
        return <span key={k} className={f?.error ? "warn" : ""} title={f?.error ?? ""}>{SOURCE_NAME[k]} {f ? (f.error ? "non raggiungibile" : `${f.items.length} · ${ago(f.fetched)}`) : "…"}</span>; })}
        <button type="button" className="xs" data-testid="ops-alerts-refresh" onClick={() => load(true)}>Aggiorna</button></div>
      <div className="seg" role="tablist">{TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-pressed={tab === k} data-testid={`ops-alerts-tab-${k}`} onClick={() => setTab(k)}>{label} {count(k)}</button>)}</div>
      <div className="row xs"><input type="search" className="grow" value={q} placeholder="Cerca: luogo, tipo, fonte…" onChange={(e) => setQ(e.target.value)} data-testid="ops-alerts-q" />
        <label className="ops-qrow"><input type="checkbox" checked={inView} onChange={() => setInView(!inView)} data-testid="ops-alerts-inview" /> solo nella vista</label></div>
      <p className="xs" data-testid="ops-alerts-summary">{(() => {
        const day = all.filter((r) => r.t != null && Date.now() - r.t < 864e5);
        const q5 = day.filter((r) => r.kind === "geo" && Number(r.props?.mag) >= 5).length, red = all.filter((r) => r.kind === "gdacs" && r.level === "Red").length;
        const ext = all.filter((r) => r.kind === "nws" && r.level === "Extreme").length, rep = all.filter((r) => !r.verified).length;
        return `Ultime 24 ore: ${day.length} elementi · terremoti M 5+: ${q5} · allerte GDACS rosse in corso: ${red} · avvisi NWS estremi: ${ext} · notizie raggruppate: ${rep}.`;
      })()}</p>
      <p className="xs dim">{CARD.alertsNote}</p>
      <div data-testid="ops-alerts-list">{groups.map(([g, xs]) => (
        <section key={g}><div className="hl-h">{AGE[g]} · {xs.length}</div>
          <ul className="ops-list">{xs.map((r) => (
            <li key={r.id} data-testid="ops-alert" data-kind={r.kind} data-verified={String(r.verified)}>
              <button type="button" className="ops-alert" onClick={() => choose(r)}>
                <span className={`ops-badge ${r.verified ? "ver" : "rep"}`}>{r.verified ? "VERIFICATO" : "RIPORTATO"}</span>
                <span className="grow"><b>{r.title}</b>{r.place ? ` · ${r.place}` : ""}
                  <span className="xs dim"> · {r.t ? ago(r.t) : "senza ora"} · {r.src}{r.n ? ` · ${r.n} articoli` : ""}{r.level ? ` · ${r.level}` : ""}</span></span>
              </button>{r.url && <a className="xs" href={r.url} target="_blank" rel="noopener noreferrer">fonte ↗</a>}</li>))}</ul></section>))}
        {!rows.length && <p className="xs dim" data-testid="ops-alerts-empty">Nessun elemento con questi filtri.</p>}</div>
      <Credit>{[OPS.alerts.geoCredit, OPS.alerts.gdacsCredit, OPS.alerts.nwsCredit, OPS.news.credit].join(" · ")}</Credit>
    </>);
}

// ── PUBLIC REGISTERS (sanctions, exploited flaws) ─────────────────────────
function RegistersPanel() {
  const [tab, setTab] = useState<"sanctions" | "kev" | "inform" | "hacks">("sanctions");
  const [q, setQ] = useState("");
  const t = useRemote<any>(`reg-${tab}`, () => tab === "inform"
    ? getJSON(OPS.registers.inform).then((rows: any[]) => ({ data: { rows: rows.map((r) => [r.Iso3, r.IndicatorScore]).sort((a, b) => b[1] - a[1]) } }))
    : tab === "hacks" ? getJSON(OPS.registers.hacks).then((rows: any[]) => ({ data: { rows: rows.sort((a, b) => b.date - a.date)
      .map((h) => [h.name, new Date(h.date * 1000).toISOString().slice(0, 10), h.amount, h.classification, h.technique, h.chain?.join?.(", ") ?? ""]) } }))
    : call<any>(`/tables/${tab}`, undefined, { channel: `reg-${tab}` }));
  const d: any = (t.data as any)?.data;
  const low = q.trim().toLowerCase();
  const rows = ((d?.rows ?? []) as any[]).filter((r) => !low || r.some((v: any) => typeof v === "string" && v.toLowerCase().includes(low))).slice(0, 80);
  return (
    <>
      <div className="seg">{(["sanctions", "kev", "inform", "hacks"] as const).map((k) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
        {k === "sanctions" ? OPS.registers.sanctionsTitle : k === "kev" ? OPS.registers.kevTitle : k === "inform" ? OPS.registers.informTitle : OPS.registers.hacksTitle}</button>)}</div>
      <input type="search" value={q} placeholder="Cerca nome, programma, prodotto…" onChange={(e) => setQ(e.target.value)} data-testid="ops-reg-q" />
      <Err e={t.error} />
      {d && <p className="xs dim">{(d.rows?.length ?? 0).toLocaleString("it-IT")} voci{d.fetched_ms ? ` · aggiornato ${fmtTime(d.fetched_ms)}` : ""}{d.notes?.catalog_version ? ` · catalogo ${d.notes.catalog_version}` : ""}</p>}
      <ul className="ops-list" data-testid="ops-reg-list">{rows.map((r, i) => tab === "hacks"
        ? <li key={i} className="xs"><b>{r[0]}</b><span className="dim"> · {r[1]} · {r[2] ? `${Math.round(r[2] / 1e6).toLocaleString("it-IT")} M$` : "importo n.d."} · {r[3]}{r[5] ? ` · ${r[5]}` : ""}</span></li>
        : tab === "inform"
        ? <li key={i} className="xs"><span className="mono">{r[0]}</span> <b className="mono">{Number(r[1]).toFixed(1)}</b><span className="ops-bar" style={{ width: `${r[1] * 10}%` }} /></li>
        : tab === "sanctions"
        ? <li key={i} className="xs"><b>{r[1]}</b><span className="dim"> · {r[2]} · {r[3]}{r[5] ? ` · bandiera ${r[5]}` : ""}</span></li>
        : <li key={i} className="xs"><b className="mono">{r[0]}</b> · {r[1]} {r[2]}<span className="dim"> · aggiunta {r[4]} · {r[3]}</span></li>)}</ul>
      <Credit>{tab === "sanctions" ? OPS.registers.sanctionsCredit : tab === "kev" ? OPS.registers.kevCredit : tab === "inform" ? OPS.registers.informCredit : OPS.registers.hacksCredit}</Credit>
    </>);
}

// ── MARKETS ───────────────────────────────────────────────────────────────
function Spark({ xs }: { xs: number[] }) {
  if (xs.length < 2) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs), w = 120, h = 28;
  const pts = xs.map((v, i) => `${((i / (xs.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo || 1)) * h).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} className="ops-spark" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;
}
function Yields() {
  const ym = new Date().toISOString().slice(0, 7).replace("-", "");
  const y = useRemote(`yields-${ym}`, async () => {
    const get = async (m: string) => new DOMParser().parseFromString(await fetch(OPS.markets.yields.replace("{ym}", m)).then((r) => r.text()), "application/xml");
    let doc = await get(ym);
    if (!doc.getElementsByTagName("m:properties").length) { const p = new Date(); p.setUTCDate(0); doc = await get(p.toISOString().slice(0, 7).replace("-", "")); }
    const props = [...doc.getElementsByTagName("m:properties")].pop();
    if (!props) throw new Error("nessun dato");
    const val = (k: string) => props.getElementsByTagName(`d:${k}`)[0]?.textContent ?? "";
    return { date: val("NEW_DATE").slice(0, 10), v: (OPS.markets.yieldTenors as [string, string][]).map(([k, l]) => [l, val(k)] as const) };
  });
  const d = y.data as any;
  return (
    <>
      <div className="hl-h">Rendimenti Treasury USA {d?.date ? <span className="dim">({d.date})</span> : null}</div>
      <Err e={y.error} />
      {d && <table className="ops-table" data-testid="ops-yields"><tbody>{d.v.map(([l, v]: [string, string]) => <tr key={l}><td>{l}</td><td className="mono num">{v} %</td></tr>)}</tbody></table>}
      <Credit>{OPS.markets.yieldsCredit}</Credit>
    </>);
}
function Commodities() {
  const t = useRemote("commodities", () => call<any>("/tables/commodities", undefined, { channel: "commodities" }));
  const d: any = (t.data as any)?.data;
  const labels = OPS.markets.commodityLabels as Record<string, string>;
  const series = new Map<string, any[]>();
  for (const r of (d?.rows ?? []) as any[]) {
    const k = `${r[0]}|${r[2]}`;
    if (!series.has(k)) series.set(k, []);
    series.get(k)!.push(r);
  }
  const daily = [...series.entries()].filter(([k]) => k.endsWith("|daily"));
  const monthly = [...series.entries()].filter(([k]) => k.endsWith("|monthly"));
  const row = (k: string, rs: any[]) => {
    const last = rs[rs.length - 1], prev = rs[rs.length - 2];
    const ch = prev ? ((last[4] / prev[4]) - 1) * 100 : null;
    return (<tr key={k}><td>{labels[last[0]] ?? last[0]}</td><td className="mono num">{Number(last[4]).toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>
      <td className="xs dim">{last[1]} · {last[3]}</td><td className="mono num xs" style={{ color: ch == null ? undefined : ch >= 0 ? "#86A07A" : "#D7836F" }}>{ch == null ? "" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)} %`}</td>
      <td><Spark xs={rs.map((x) => x[4])} /></td></tr>);
  };
  return (
    <>
      <div className="hl-h">Materie prime</div>
      <Err e={t.error} />
      {d && <table className="ops-table" data-testid="ops-commodities"><tbody>
        {daily.map(([k, rs]) => row(k, rs))}
        {monthly.map(([k, rs]) => row(k, rs))}</tbody></table>}
      {d?.notes?.pink_sheet && <p className="xs dim">Pink Sheet: {d.notes.pink_sheet}</p>}
      <Credit>{OPS.markets.commodityCredit}</Credit>
    </>);
}
function MarketsPanel() {
  const fx = useRemote("fx", () => getJSON(OPS.markets.fx));
  const [sel, setSel] = useState("USD");
  const [range, setRange] = useState(92);
  const from = useMemo(() => new Date(Date.now() - range * 86400_000).toISOString().slice(0, 10), [range]);
  const series = useRemote(`fx-${sel}-${range}`, () => getJSON(OPS.markets.fxSeries.replace("{from}", from).replace("{sym}", sel)));
  const crypto = useRemote("crypto", () => Promise.all(OPS.markets.cryptos.map((c) => getJSON(OPS.markets.crypto.replace("{c}", c)).then((r) => [c, r.data.rates] as const))));
  const rates = (fx.data as any)?.rates ?? {};
  const xs = Object.values(((series.data as any)?.rates ?? {}) as Record<string, Record<string, number>>).map((r) => r[sel]).filter(Number.isFinite);
  return (
    <>
      <div className="hl-h">Cambi di riferimento BCE · 1 EUR = {(fx.data as any)?.date ? <span className="dim">({(fx.data as any).date})</span> : null}</div>
      <Err e={fx.error} />
      <table className="ops-table" data-testid="ops-fx"><tbody>
        {OPS.markets.fxShown.filter((c) => rates[c]).map((c) => (
          <tr key={c} className={c === sel ? "sel" : ""} onClick={() => setSel(c)}><td className="mono">{c}</td>
            <td className="mono num">{Number(rates[c]).toLocaleString("it-IT", { maximumFractionDigits: 4 })}</td></tr>))}
      </tbody></table>
      <div className="seg" data-testid="ops-fx-range">{([[31, "1M"], [92, "3M"], [183, "6M"], [366, "1A"], [1827, "5A"]] as const).map(([d, l]) => (
        <button key={l} type="button" aria-pressed={range === d} onClick={() => setRange(d)}>{l}</button>))}</div>
      {xs.length > 1 && <p className="xs" data-testid="ops-fx-series">EUR/{sel}, dal {from} <Spark xs={xs} /> <span className="mono">{xs[0].toFixed(4)} → {xs[xs.length - 1].toFixed(4)} ({(((xs[xs.length - 1] / xs[0]) - 1) * 100).toFixed(1)} %)</span></p>}
      <Credit>{OPS.markets.fxCredit}</Credit>
      <Yields />
      <Commodities />
      <div className="hl-h">Cripto (indicativo)</div>
      <Err e={crypto.error} />
      <table className="ops-table" data-testid="ops-crypto"><tbody>
        {((crypto.data ?? []) as (readonly [string, any])[]).map(([c, r]) => (
          <tr key={c}><td className="mono">{c}</td><td className="mono num">{Number(r.EUR).toLocaleString("it-IT", { maximumFractionDigits: 0 })} €</td>
            <td className="mono num dim">{Number(r.USD).toLocaleString("it-IT", { maximumFractionDigits: 0 })} $</td></tr>))}
      </tbody></table>
      <Credit>{OPS.markets.cryptoCredit}</Credit>
      <p className="xs dim">Economia, salari, prezzi ed energia di ogni paese: nella scheda del paese (pannello a sinistra o clic sulla mappa).</p>
      <p className="xs warn" data-testid="ops-markets-impossible">{OPS.markets.impossible}</p>
    </>);
}

// ── ROUTE ─────────────────────────────────────────────────────────────────
type Place = { label: string; c: LngLat };
function PlaceInput({ label, value, onChange, testid, pick }: { label: string; value: Place | null; onChange: (p: Place | null) => void; testid: string; pick?: "from" | "to" }) {
  const [q, setQ] = useState(value?.label ?? "");
  const [res, setRes] = useState<Place[]>([]);
  const point = useOps((s) => s.point);
  useEffect(() => { setQ(value?.label ?? ""); }, [value?.label]);
  useEffect(() => {
    if (q.length < 3 || q === value?.label) { setRes([]); return; }
    const t = setTimeout(async () => {
      await polite("photon");
      const r = await getJSON(OPS.geocode.photon.replace("{q}", encodeURIComponent(q))).catch(() => null);
      setRes(((r?.features ?? []) as any[]).map((f) => ({ c: f.geometry.coordinates, label: OPS.geocode.labelFields.map((k) => f.properties[k]).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ") })));
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="ops-place">
      <label className="xs dim">{label}</label>
      <div className="row"><input type="search" value={q} placeholder="Cerca un luogo…" data-testid={testid} onChange={(e) => setQ(e.target.value)} className="grow" />
        {pick && <button type="button" className="xs" data-testid={`${testid}-pick`} title="Tocca la mappa per scegliere il punto" aria-label="Tocca la mappa"
          onClick={() => { ops.set({ pick }); forMap(); }}>⌖ mappa</button>}
        {!pick && point && <button type="button" className="xs" title="Il punto scelto sulla mappa" onClick={() => onChange({ label: point.label || fmtLatLng(point.lat, point.lng, 3), c: [point.lng, point.lat] })}>⌖</button>}</div>
      {res.length > 0 && <ul className="ops-sugg">{res.map((p, i) => <li key={i}><button type="button" className="linklike xs" onClick={() => { onChange(p); setRes([]); }}>{p.label}</button></li>)}</ul>}
    </div>);
}
const MANEUVER: Record<string, string> = { depart: "Partenza", arrive: "Arrivo", turn: "Svolta", "new name": "Prosegui", continue: "Prosegui", merge: "Immettiti",
  "on ramp": "Rampa", "off ramp": "Uscita", fork: "Bivio", "end of road": "Fine strada", roundabout: "Rotatoria", rotary: "Rotatoria", "exit roundabout": "Esci dalla rotatoria" };
const MOD: Record<string, string> = { left: "a sinistra", right: "a destra", "slight left": "leggermente a sinistra", "slight right": "leggermente a destra",
  "sharp left": "tutto a sinistra", "sharp right": "tutto a destra", straight: "dritto", uturn: "inversione" };
/** Valhalla's polyline (precision 6) → [lng, lat] pairs. */
function decode6(str: string): LngLat[] {
  const out: LngLat[] = []; let i = 0, lat = 0, lng = 0;
  const next = () => { let r = 0, sh = 0, b: number; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < str.length) { lat += next(); lng += next(); out.push([lng / 1e6, lat / 1e6]); }
  return out;
}
type Route = { km: number; s: number; toll: boolean; motorway: boolean; ferry: boolean; line: LngLat[]; steps: any[]; provider: string };
const fmtDur = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ""}${Math.round((s % 3600) / 60)} min`;
function fromValhalla(trip: any): Route {
  const line: LngLat[] = [], steps: any[] = [];
  for (const leg of trip.legs) {
    const sh = decode6(leg.shape), off = line.length;
    line.push(...sh);
    for (const m of leg.maneuvers) steps.push({ instruction: m.instruction, distance: m.length * 1000, time: m.time, name: (m.street_names ?? []).join(", "),
      a: off + m.begin_shape_index, b: off + m.end_shape_index, maneuver: { location: sh[m.begin_shape_index], type: String(m.type), modifier: undefined } });
  }
  return { km: trip.summary.length, s: trip.summary.time, toll: !!trip.summary.has_toll, motorway: !!trip.summary.has_highway, ferry: !!trip.summary.has_ferry, line, steps, provider: "Valhalla" };
}
function Elevation({ line }: { line: LngLat[] }) {
  const [h, setH] = useState<{ up: number; down: number; pts: number[] } | null>(null);
  useEffect(() => {
    let live = true;
    const step = Math.max(1, Math.ceil(line.length / 180)), shape = line.filter((_, i) => i % step === 0).map(([lon, lat]) => ({ lat, lon }));
    polite("valhalla").then(() => getJSON(`${OPS.route.valhalla}/height?json=${encodeURIComponent(JSON.stringify({ range: false, shape }))}`)).then((d) => {
      const pts = (d.height as (number | null)[]).filter((x): x is number => x != null);
      let up = 0, down = 0; for (let i = 1; i < pts.length; i++) { const dd = pts[i] - pts[i - 1]; if (dd > 0) up += dd; else down -= dd; }
      if (live && pts.length > 1) setH({ up, down, pts });
    }).catch(() => {});
    return () => { live = false; };
  }, [line]);
  if (!h) return null;
  const lo = Math.min(...h.pts), hi = Math.max(...h.pts), W = 280, H = 48;
  const d = h.pts.map((y, i) => `${(i / (h.pts.length - 1)) * W},${H - ((y - lo) / Math.max(1, hi - lo)) * (H - 4) - 2}`).join(" ");
  return (<div className="xs" data-testid="ops-route-elev"><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="profilo altimetrico"><polyline points={d} fill="none" stroke="#86C5A0" strokeWidth="1.5" /></svg>
    <span className="mono">↑ {Math.round(h.up)} m · ↓ {Math.round(h.down)} m · {Math.round(lo)}–{Math.round(hi)} m</span> <span className="dim">(modello del terreno del servizio)</span></div>);
}
function RoutePanel({ map }: { map: MLMap }) {
  const [a, setA] = useState<Place | null>(null);
  const [b, setB] = useState<Place | null>(null);
  const [via, setVia] = useState<(Place | null)[]>([]);
  const [prof, setProf] = useState<keyof typeof OPS.route.modes>("car");
  const [avoid, setAvoid] = useState<Record<"tolls" | "highways" | "ferries", boolean>>(() => ({ tolls: false, highways: false, ferries: false }));
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (start?: Place) => {
    const a0 = start ?? a;
    if (!a0 || !b) return;
    setBusy(true); setErr(null);
    const pts = [a0, ...via.filter((v): v is Place => !!v), b];
    try {
      await polite("valhalla");
      const costing = OPS.route.modes[prof][0];
      const req: any = { locations: pts.map((p) => ({ lon: p.c[0], lat: p.c[1] })), costing, alternates: pts.length === 2 ? 2 : 0, language: "it-IT", units: "kilometers" };
      // avoid = the person's choice, as a hard exclusion (the service's preference alone may still use them)
      if (costing === "auto") req.costing_options = { auto: { ...(avoid.tolls ? { use_tolls: 0, exclude_tolls: true } : {}),
        ...(avoid.highways ? { use_highways: 0, exclude_highways: true } : {}), ...(avoid.ferries ? { use_ferry: 0, exclude_ferries: true } : {}) } };
      const d = await getJSON(`${OPS.route.valhalla}/route?json=${encodeURIComponent(JSON.stringify(req))}`);
      if (!d.trip) throw new Error(d.error ?? "nessun percorso");
      setRoutes([fromValhalla(d.trip), ...((d.alternates ?? []) as any[]).map((x) => fromValhalla(x.trip))]); setSel(0);
    } catch (e: any) {
      // the other FOSSGIS service (OSRM): one route, same rules
      try {
        await polite("osrm");
        const url = OPS.route.osrm.replace("{profile}", OPS.route.profiles[prof][0]).replace("{coords}", pts.map((p) => `${p.c[0]},${p.c[1]}`).join(";"));
        const d = await getJSON(url);
        const r = d.routes?.[0];
        if (!r) throw new Error(d.message ?? "nessun percorso");
        const steps = (r.legs as any[]).flatMap((l) => l.steps).map((x: any) => ({ ...x, instruction: `${MANEUVER[x.maneuver.type] ?? x.maneuver.type}${x.maneuver.modifier ? ` ${MOD[x.maneuver.modifier] ?? x.maneuver.modifier}` : ""}${x.name ? ` · ${x.name}` : ""}` }));
        setRoutes([{ km: r.distance / 1000, s: r.duration, toll: false, motorway: false, ferry: false, line: r.geometry.coordinates, steps, provider: "OSRM" }]); setSel(0);
      } catch { setErr(String(e?.message ?? e)); setRoutes([]); }
    } finally { setBusy(false); }
  };
  // the routes on the map: the chosen one bright, the alternatives dim; framed once
  const r = routes[sel];
  useEffect(() => {
    ensureLine(map, "ops-route-alt", "#7C6A44").setData({ type: "FeatureCollection", features: routes.filter((_, i) => i !== sel).map((x) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: x.line } })) });
    ensureLine(map, "ops-route", "#E0A640").setData(r ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.line } } : { type: "FeatureCollection", features: [] });
    ensureLine(map, "ops-route-step", "#FFFFFF").setData({ type: "FeatureCollection", features: [] });
    if (r) fit(map, bboxOf(r.line), { padding: 60, duration: 700 });
  }, [routes, sel]);
  useEffect(() => () => { for (const id of ["ops-route", "ops-route-alt", "ops-route-step"]) (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] }); }, [map]);
  const showStep = (st: any) => {
    if (!r) return;
    const seg = st.a != null ? r.line.slice(st.a, Math.max(st.a + 2, st.b + 1)) : [st.maneuver.location, st.maneuver.location];
    ensureLine(map, "ops-route-step", "#FFFFFF").setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: seg } });
    fly(map, st.maneuver.location, 16);
  };
  // a point tapped on the map for the start or the end
  useEffect(() => {
    const f = (e: Event) => { const d = (e as CustomEvent).detail; const p = { label: fmtLatLng(d.lat, d.lng, 4), c: [d.lng, d.lat] as LngLat };
      if (d.target === "from") setA(p); else if (d.target === "to") setB(p); };
    addEventListener("nexum:picked", f);
    return () => removeEventListener("nexum:picked", f);
  }, []);
  const arrive = r ? new Date(Date.now() + r.s * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <>
      <PlaceInput label="Da" value={a} onChange={setA} testid="ops-route-from" pick="from" />
      {via.map((v, i) => (
        <div key={i} className="row"><div className="grow"><PlaceInput label={`Tappa ${i + 1}`} value={v} onChange={(p) => setVia(via.map((x, j) => (j === i ? p : x)))} testid={`ops-route-via-${i}`} /></div>
          <button type="button" className="xs" aria-label="Togli la tappa" onClick={() => setVia(via.filter((_, j) => j !== i))}>×</button></div>))}
      <PlaceInput label="A" value={b} onChange={setB} testid="ops-route-to" pick="to" />
      <div className="row xs">
        {via.length < 3 && <button type="button" className="xs" data-testid="ops-route-add-via" onClick={() => setVia([...via, null])}>+ tappa</button>}
        <button type="button" className="xs" data-testid="ops-route-swap" onClick={() => { setA(b); setB(a); setVia([...via].reverse()); }}>⇅ inverti</button>
      </div>
      <div className="row">
        <div className="seg">{(Object.keys(OPS.route.modes) as (keyof typeof OPS.route.modes)[]).map((k) => (
          <button key={k} type="button" aria-pressed={prof === k} data-testid={`ops-route-mode-${k}`} onClick={() => setProf(k)}>{OPS.route.modes[k][1]}</button>))}</div>
        <button type="button" className="primary" disabled={!a || !b || busy} data-testid="ops-route-go" onClick={() => go()}>{busy ? "Calcolo…" : "Calcola"}</button>
      </div>
      {prof === "car" && <div className="row xs" data-testid="ops-route-avoid">Evita: {(["tolls", "highways", "ferries"] as const).map((k) => (
        <label key={k} className="ops-qrow"><input type="checkbox" checked={avoid[k]} onChange={() => setAvoid({ ...avoid, [k]: !avoid[k] })} data-testid={`ops-route-avoid-${k}`} /> {{ tolls: "pedaggi", highways: "autostrade", ferries: "traghetti" }[k]}</label>))}</div>}
      {err && <p className="xs warn">Percorso non disponibile ora ({err}).</p>}
      {routes.length > 1 && <div className="seg" data-testid="ops-route-alts">{routes.map((x, i) => (
        <button key={i} type="button" aria-pressed={sel === i} onClick={() => setSel(i)}>{i === 0 ? "Più rapido" : `Alternativa ${i}${x.s > routes[0].s ? ` · +${Math.round((x.s - routes[0].s) / 60)} min` : ""}`}</button>))}</div>}
      {r && <p data-testid="ops-route-result"><b className="mono">{fmtKm(r.km)}</b> · <b className="mono">{fmtDur(r.s)}</b> · arrivo ≈ {arrive}
        <span className="xs dim"> (stima del servizio {r.provider}, senza traffico)</span>
        {(r.toll || r.motorway || r.ferry) && <span className="xs" data-testid="ops-route-flags"> {r.toll ? "· pedaggio " : ""}{r.motorway ? "· autostrada " : ""}{r.ferry ? "· traghetto" : ""}</span>}</p>}
      {r && prof !== "car" && <Elevation line={r.line} />}
      {r && r.steps.length > 0 && <Navigate steps={r.steps} line={r.line} onReroute={(here) => { const p = { label: "La tua posizione", c: here }; setA(p); go(p); }} />}
      {r && r.steps.length > 0 && <ol className="ops-steps xs" data-testid="ops-route-steps">{r.steps.slice(0, 80).map((st, i) => (
        <li key={i}><button type="button" className="linklike xs" onClick={() => showStep(st)}>{st.instruction}</button><span className="dim"> · {fmtKm(st.distance / 1000)}</span></li>))}</ol>}
      <Credit>{OPS.route.credit} <a href={OPS.route.fixthemap} target="_blank" rel="noopener noreferrer">segnala un errore della mappa</a> · {OPS.geocode.credit}</Credit>
    </>);
}

/** TURN-BY-TURN (on request): the device's own position (watchPosition) against the route's manoeuvres; the next
 *  instruction is shown and spoken (speechSynthesis). The position never leaves this page and is not stored. */
function Navigate({ steps, line, onReroute }: { steps: any[]; line?: LngLat[]; onReroute?: (here: LngLat) => void }) {
  const [on, setOn] = useState(false);
  const [st, setSt] = useState<{ i: number; d: number; acc: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const spoken = useRef(-1), offSince = useRef(0), lastReroute = useRef(0);
  const [offRoute, setOffRoute] = useState<boolean>(false);   // a new route from here is being computed
  // the screen stays on while navigating (where the browser allows it)
  useEffect(() => {
    if (!on) return;
    let lock: any = null;
    (navigator as any).wakeLock?.request("screen").then((l: any) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch?.(() => {}); };
  }, [on]);
  useEffect(() => {
    if (!on) return;
    if (!navigator.geolocation) { setErr("posizione del dispositivo non disponibile"); setOn(false); return; }
    const say = (t: string) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = "it-IT"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no voice */ } };
    const text = (s: any) => s.instruction ?? `${MANEUVER[s.maneuver.type] ?? s.maneuver.type}${s.maneuver.modifier ? ` ${MOD[s.maneuver.modifier] ?? s.maneuver.modifier}` : ""}${s.name ? `, ${s.name}` : ""}`;
    const geo = navigator.geolocation;
    const id = geo.watchPosition((p) => {
      const here: LngLat = [p.coords.longitude, p.coords.latitude];
      // the next manoeuvre: the first one after the nearest, from where the person is
      let best = 0, bd = Infinity;
      steps.forEach((s, i) => { const d = haversine(here, s.maneuver.location); if (d < bd) { bd = d; best = i; } });
      const i = bd < 0.03 && best < steps.length - 1 ? best + 1 : best;
      const d = haversine(here, steps[i].maneuver.location);
      setSt({ i, d, acc: p.coords.accuracy }); setErr(null);
      // off the route for more than 6 s (beyond 60 m and the fix's own accuracy): a new route from here, at most every 20 s
      if (line?.length && onReroute) {
        const off = Math.min(...line.filter((_, k) => k % 2 === 0).map((q) => haversine(here, q))) > Math.max(0.06, p.coords.accuracy / 1000);
        if (!off) { offSince.current = 0; setOffRoute(false); }
        else if (!offSince.current) offSince.current = Date.now();
        else if (Date.now() - offSince.current > 6000 && Date.now() - lastReroute.current > 20000) {
          lastReroute.current = Date.now(); offSince.current = 0; setOffRoute(true); say("Ricalcolo del percorso"); onReroute(here);
        }
      }
      if (spoken.current !== i && d < 0.25) { spoken.current = i; say(`Tra ${Math.round(d * 1000)} metri, ${text(steps[i])}`); }
    }, (e) => {
      // only a refused permission ends the navigation; a weak or missing signal (tunnel, indoors) is said and waited out
      if (e.code === 1) { setErr("permesso negato"); setOn(false); } else setErr("segnale di posizione debole: attendo il prossimo rilevamento…");
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    return () => { geo.clearWatch(id); try { speechSynthesis.cancel(); } catch { /* none */ } };
  }, [on, steps]);
  const cur = st ? steps[st.i] : null;
  return (
    <div className="ops-nav" data-testid="ops-nav">
      <button type="button" className={on ? "" : "primary"} onClick={() => { setErr(null); spoken.current = -1; setOn(!on); }} data-testid="ops-nav-toggle">
        {on ? "Ferma la navigazione" : "▶ Naviga con la posizione del dispositivo"}</button>
      {on && cur && <p><b>{cur.instruction ?? `${MANEUVER[cur.maneuver.type] ?? cur.maneuver.type}${cur.maneuver.modifier ? ` ${MOD[cur.maneuver.modifier] ?? cur.maneuver.modifier}` : ""}`}</b>
        {!cur.instruction && cur.name ? ` · ${cur.name}` : ""} <span className="mono">tra {fmtKm(st!.d)}</span><span className="xs dim"> (precisione ±{Math.round(st!.acc)} m)</span></p>}
      {on && offRoute && <p className="xs" data-testid="ops-nav-reroute">Fuori percorso: nuovo percorso dalla tua posizione…</p>}
      {err && <p className="xs warn">{err}</p>}
      <p className="xs faint">La posizione resta in questa pagina: non è salvata né inviata. Le istruzioni sono anche lette ad alta voce.</p>
    </div>);
}

// ── CAMERAS ───────────────────────────────────────────────────────────────
// (2026-10-06, physical acceptance) the CATALOGUE is not what NEXUM can show: the panel says both (live video, current
// image, link only, off/old — the sources' own states); the camera in focus comes first; every other camera is listed
// and previewed with its distance from the centre of the map, so no image is ever taken for the selected camera's.
const kmTxt = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("it-IT", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`);
let camPoints: Promise<any> | null = null;
/** The cameras' marks on or off the map: the Webcam category, the same switch as in Filtri — the only thing that shows or
 *  hides them (no tool or other layer ever does it on its own; 2026-10-07, stabilization). */
function camsOnMap(t: string, on: boolean) {
  const cur = store.get().mapTypes;
  if (!Array.isArray(cur)) { if (!on) store.setMapTypes([...store.get().types.keys()].filter((x) => x !== t)); return; }
  store.setMapTypes(on ? [...new Set([...cur, t])] : cur.filter((x) => x !== t));
}
function CamsPanel({ map }: { map: MLMap }) {
  const types = useStore((s) => s.types);
  const focus = useStore((s) => s.focus);
  const camType = [...types.values()].find((t) => t.family === "camera" && t.kind === "object")?.id ?? null;
  // the cameras' own marks on the map (a display choice, like Filtri): shown when the tool is opened, a switch to hide them
  const mapTypes = useStore((s) => s.mapTypes);
  const onMap = !!camType && (!Array.isArray(mapTypes) || mapTypes.includes(camType));
  const [tick, setTick] = useState(0);
  useEffect(() => { const on = () => setTick((n) => n + 1); map.on("moveend", on); return () => { map.off("moveend", on); }; }, [map]);
  const box = viewBox(map);
  const cams = useRemote(camType ? `cams-${box.map((x) => x.toFixed(2)).join()}-${tick}` : null, () => nexumIn(box, [camType!], 300));
  // the sources' own states of every camera (the same list the map draws; read once)
  const [by, setBy] = useState<{ all: Record<string, number>; view: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!camType) return;
    let live = true;
    camPoints ??= call<any>(`/types/${camType}/points`, { status: "availability" }, { channel: `pts-${camType}` }).then((r) => r.data);
    camPoints.then((d) => {
      if (!live) return;
      const all: Record<string, number> = {}, view: Record<string, number> = {};
      for (const [lon, lat, st] of d.rows as number[][]) {
        const k = d.status_values[st] ?? "unknown";
        all[k] = (all[k] ?? 0) + 1;
        if (lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3]) view[k] = (view[k] ?? 0) + 1;
      }
      setBy({ all, view });
    }, () => { camPoints = null; });
    return () => { live = false; };
  }, [camType, tick]);
  const [previews, setPreviews] = useState(false);
  const total = camType ? types.get(camType)?.count ?? 0 : 0;
  const c = map.getCenter();
  const items = (((cams.data as any)?.items ?? []) as any[]).filter((e) => e.id !== focus && e.point)
    .map((e) => ({ e, km: haversine([c.lng, c.lat], e.point) })).sort((a, z) => a.km - z.km);
  const fe = focus ? store.entity(focus) : null;
  const sel = fe && fe.type === camType ? fe : null;
  const split = (x: Record<string, number>) => ({ live: x.live_stream ?? 0, cur: x.current_snapshot ?? 0, link: x.link_only ?? 0, off: (x.offline ?? 0) + (x.stale ?? 0) });
  const A = by ? split(by.all) : null, V = by ? split(by.view) : null;
  return (
    <>
      <label className="row xs"><input type="checkbox" checked={onMap} disabled={!camType} onChange={() => camType && camsOnMap(camType, !onMap)} data-testid="ops-cams-onmap" />
        Telecamere sulla mappa (simbolo per stato: LIVE, immagine, solo collegamento, fuori servizio)</label>
      {!onMap && <p className="xs dim" data-testid="ops-cams-offmap">Non sono sulla mappa ora: attivale qui sopra (è la stessa scelta di «Webcam» in Filtri).</p>}
      <p className="xs" data-testid="ops-cams-catalogue"><b>{total.toLocaleString("it-IT")}</b> telecamere nel catalogo mondiale NEXUM (posizione, gestore, fonte).</p>
      {A && <p className="xs" data-testid="ops-cams-viewable">Visualizzabili in NEXUM: <b>{(A.live + A.cur).toLocaleString("it-IT")}</b> ({A.live.toLocaleString("it-IT")} video LIVE · {A.cur.toLocaleString("it-IT")} immagini attuali) ·
        solo collegamento al gestore {A.link.toLocaleString("it-IT")} · fuori servizio o vecchie {A.off.toLocaleString("it-IT")}.</p>}
      {V && <p className="xs dim" data-testid="ops-cams-inview">Nella vista: {(V.live + V.cur + V.link + V.off).toLocaleString("it-IT")} — LIVE {V.live} · immagini {V.cur} · collegamento {V.link} · fuori servizio {V.off}.</p>}
      {sel && <div className="ops-cam-sel" data-testid="ops-cams-selected">Selezionata: <button type="button" className="linklike" onClick={() => store.select(sel.id, "ops-cams")}><b>{sel.label}</b></button>
        <span className="xs dim"> · la sua immagine è nella sua scheda</span></div>}
      {map.getZoom() < 4 && <p className="xs dim">Avvicinati a una regione per elencarne le telecamere.</p>}
      <label className="row xs"><input type="checkbox" checked={previews} onChange={() => setPreviews(!previews)} data-testid="ops-cam-previews" /> Anteprime delle 6 più vicine al centro della mappa{sel ? " (altre camere, non quella selezionata)" : ""}</label>
      {previews && <div className="ops-thumbs">{items.slice(0, 6).map(({ e, km }) => <CamThumb key={e.id} id={e.id} km={km} />)}</div>}
      <div className="hl-h">{sel ? "Altre telecamere nella vista" : "Telecamere nella vista"} · dalla più vicina al centro</div>
      <ul className="ops-list" data-testid="ops-cams-list">{items.slice(0, 80).map(({ e, km }) => (
        <li key={e.id}><button type="button" className="linklike" onClick={() => store.select(e.id, "ops-cams")}>{e.label}</button><span className="xs dim"> · {kmTxt(km)} dal centro</span></li>))}</ul>
      <div className="hl-h">Canali live ufficiali di enti pubblici ({CHANNELS.length})</div>
      <ul className="ops-list">{CHANNELS.map((c) => (
        <li key={c.id}><button type="button" className="linklike" onClick={() => { fly(map, c.c, 8); ops.set({ tool: "live" }); setTimeout(() => window.dispatchEvent(new CustomEvent("nexum:channel", { detail: c.id })), 50); }}>{c.name}</button>
          <span className="xs dim"> · {c.place}</span></li>))}</ul>
      <Credit>Ogni telecamera apre la sua scheda NEXUM: prima la sua immagine o diretta (dal gestore), il suo stato, gestore e luogo; le altre camere vicine dopo, separate. «IN ONDA» solo quando arrivano davvero i fotogrammi.</Credit>
    </>);
}
function CamThumb({ id, km }: { id: string; km: number }) {
  const d = useRemote(`cam-${id}`, () => call<any>(`/entities/${id}`, undefined, { channel: `cam-${id}` }));
  const p = (d.data as any)?.data?.properties ?? {};
  const [t] = useState(() => Date.now());
  const e = store.entity(id);
  const src = p.stream_type === "mjpeg" || p.availability === "link_only" ? null : p.image_url;
  return (
    <figure className="ops-thumb" data-testid="ops-cam-thumb" data-ref={id} onClick={() => store.select(id, "ops-cams")}>
      {src ? <img src={`${src}${src.includes("?") ? "&" : "?"}nexum_t=${t}`} alt={e?.label ?? ""} referrerPolicy="no-referrer" loading="lazy" />
        : <div className="xs dim ops-thumb-na">{p.availability === "live_stream" ? "diretta: apri la scheda" : "solo collegamento"}</div>}
      <figcaption className="xs ellipsis"><b>{e?.label}</b><span className="dim"> · {kmTxt(km)} · {new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span></figcaption>
    </figure>);
}

// ── LIVE (official channels, space, news) ────────────────────────────────
export function YouTubeLive({ channel, title, video }: { channel: string; title: string; video?: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [st, setSt] = useState<"loading" | "playing" | "off">("loading");
  useEffect(() => {
    setSt("loading");
    const on = (ev: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(ev.origin) || ev.source !== frame.current?.contentWindow) return;
      let d: any;
      try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch { return; }
      if (d?.event === "onError") setSt("off");
      if (d?.info?.playerState === 1 || (d?.event === "onStateChange" && d?.info === 1)) setSt("playing");
    };
    addEventListener("message", on);
    const hello = window.setInterval(() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: channel, channel: "widget" }), "*"), 1000);
    const t = window.setTimeout(() => setSt((s) => (s === "loading" ? "off" : s)), 25_000);
    return () => { removeEventListener("message", on); window.clearInterval(hello); window.clearTimeout(t); };
  }, [channel]);
  const q = `autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  const src = video ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}?${q}`
    : `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(channel)}&${q}`;
  return (
    <figure className="media-fig live ops-yt" data-testid="ops-yt" data-state={st}>
      <iframe ref={frame} src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      <figcaption className="xs" data-testid="ops-yt-state">{st === "playing" ? <b className="live-on">● IN ONDA</b> : st === "off" ? <span className="warn">Fuori onda ora (nessuna diretta del canale in corso)</span> : <span className="dim">collegamento al canale…</span>}</figcaption>
    </figure>);
}
function LivePanel({ map }: { map: MLMap }) {
  const [on, setOn] = useState<{ id: string; name: string; video?: string } | null>(() => {
    const w = window as any, c = CHANNELS.find((x) => x.id === w.__nexumCh);
    w.__nexumCh = null;
    return c ? { id: c.id, name: c.name } : null;
  });
  useEffect(() => {
    const f = (e: Event) => { const id = (e as CustomEvent).detail; const c = CHANNELS.find((x) => x.id === id); if (c) setOn({ id, name: c.name }); };
    addEventListener("nexum:channel", f);
    return () => removeEventListener("nexum:channel", f);
  }, []);
  const L = OPS.live;
  const row = (id: string, name: string, extra: ReactNode, c?: [number, number]) => (
    <li key={id}><button type="button" className="linklike" aria-pressed={on?.id === id} onClick={() => { setOn({ id, name }); if (c) fly(map, c, 8); }}>{name}</button>{extra}</li>);
  return (
    <>
      {on ? <><div className="row"><b className="grow">{on.name}</b><button type="button" className="xs" data-testid="ops-yt-stop" onClick={() => setOn(null)}>Ferma</button></div>
        <YouTubeLive channel={on.id} title={on.name} video={on.video} /></> : <p className="xs dim">{L.note}</p>}
      <p className="xs faint">{L.consent}</p>
      <div className="hl-h">Enti pubblici · luoghi</div>
      <ul className="ops-list" data-testid="ops-live-channels">{(L.channels as any[]).map((c) => row(c.id, c.name, <span className="xs dim"> · {c.publisher}</span>, c.c))}</ul>
      <div className="hl-h">Dallo spazio</div>
      <ul className="ops-list">{(L.space as any[]).map((c) => c.video
        ? <li key={c.video}><button type="button" className="linklike" aria-pressed={on?.id === c.video} onClick={() => setOn({ id: c.video, name: c.name, video: c.video })}>{c.name}</button><span className="xs dim"> · {c.note}</span></li>
        : row(c.id, c.name, <span className="xs dim"> · {c.note}</span>))}</ul>
      <div className="hl-h">Notizie (emittenti ufficiali)</div>
      <ul className="ops-list">{L.news.map((c) => row(c.id, c.name, <span className="xs dim"> · {c.place}</span>))}</ul>
      <Credit>{L.newsNote}</Credit>
    </>);
}

// ── SPACE ENVIRONMENT (Kp, NOAA scales, aurora) ─────────────────────────────────────────────────────────
function SpacePanel() {
  const kp = useOps((s) => s.kp);
  const aur = useOps((s) => s.layers.aurora);
  const fc = useRemote("kp3", () => getJSON(SW.kp3day));
  const sc = useRemote("scales", () => getJSON(SW.scales));
  const rows = ((fc.data ?? []) as any[]).map((r) => (Array.isArray(r) ? { t: r[0], kp: Number(r[1]), obs: r[2] } : { t: r.time_tag, kp: Number(r.kp), obs: r.observed }))
    .filter((r) => r.obs === "predicted" && Number.isFinite(r.kp)).slice(0, 24);
  const now = (sc.data as any)?.["0"];
  return (
    <>
      <p>Kp attuale: <b className="mono" data-testid="ops-space-kp">{kp == null ? "—" : kp.toFixed(1)}</b>
        <span className="xs dim"> (0–9; ≥ 5 tempesta geomagnetica, aurore a latitudini medie)</span></p>
      {now && <p className="xs">Scale NOAA ora: radio R{now.R?.Scale ?? 0} · radiazione S{now.S?.Scale ?? 0} · geomagnetica G{now.G?.Scale ?? 0}</p>}
      <Err e={fc.error} />
      {rows.length > 0 && <div className="ops-kpbars" data-testid="ops-kp-forecast">{rows.map((r, i) => (
        <span key={i} title={`${fmtTime(r.t + "Z")} · Kp ${r.kp}`} style={{ height: `${(r.kp / 9) * 48 + 2}px`, background: r.kp >= 5 ? "#E8913A" : r.kp >= 4 ? "#E0C040" : "#86A07A" }} />))}</div>}
      {rows.length > 0 && <p className="xs dim">Previsione Kp a 3 ore per i prossimi 3 giorni.</p>}
      <Flares />
      <label className="row"><input type="checkbox" checked={aur} onChange={() => ops.layer("aurora")} data-testid="ops-aurora" /> Ovale dell'aurora sulla mappa (previsione OVATION a 30 minuti)</label>
      <Credit>{SW.credit}</Credit>
    </>);
}

function Flares() {
  const f = useRemote("flares", () => getJSON(SW.flares));
  const a = useRemote("swalerts", () => getJSON(SW.alerts));
  const fl = ((f.data ?? []) as any[])[0];
  const al = ((a.data ?? []) as any[]).slice(0, 5);
  return (
    <>
      {fl && <p className="xs" data-testid="ops-flare">Raggi X solari (GOES): classe attuale <b className="mono">{fl.current_class}</b>
        {fl.max_class ? <> · ultimo brillamento <b className="mono">{fl.max_class}</b> alle {fmtTime(fl.max_time)}</> : null}</p>}
      {al.length > 0 && <><div className="hl-h">Ultimi avvisi SWPC</div>
        <ul className="ops-list">{al.map((x, i) => <li key={i} className="xs"><span className="dim">{fmtTime(x.issue_datetime.replace(" ", "T") + "Z")}</span> · {(String(x.message).match(/(ALERT|WARNING|WATCH|SUMMARY)[^\r\n]*/) ?? [x.product_id])[0]}</li>)}</ul></>}
    </>);
}

// ── POINT (place dossier) ─────────────────────────────────────────────────
function PointPanel({ map }: { map: MLMap }) {
  const pt = useOps((s) => s.point);
  const search = <PlaceInput label="Vai a un luogo (indirizzo, via, località)" value={null} testid="ops-point-search"
    onChange={(p) => { if (!p) return; ops.set({ point: { lng: p.c[0], lat: p.c[1], label: p.label } }); fly(map, p.c, 12); }} />;
  const pickBtn = <button type="button" className="primary" data-testid="ops-pick-point" onClick={() => { ops.set({ pick: "point" }); forMap(); }}>⌖ Tocca la mappa per scegliere un punto</button>;
  if (pt) return <>{search}{pickBtn}<PointBody key={`${pt.lng},${pt.lat}`} map={map} lng={pt.lng} lat={pt.lat} /></>;
  return <>{search}{pickBtn}<p className="xs dim">Scegli un punto toccando la mappa (o con il clic destro sul computer): coordinate, ora locale, meteo e aria del momento, elementi NEXUM vicini, voci di Wikipedia, il cielo da lì.</p></>;
}
function PointBody({ map, lng, lat }: { map: MLMap; lng: number; lat: number }) {
  const wx = useRemote("wx", () => getJSON(OPS.air.wx.replace("{lat}", lat.toFixed(3)).replace("{lon}", lng.toFixed(3))));
  const air = useRemote("air", () => getJSON(OPS.air.url.replace("{lat}", lat.toFixed(3)).replace("{lon}", lng.toFixed(3))));
  const near = useRemote("near", () => nexumIn([lng - 0.35, lat - 0.25, lng + 0.35, lat + 0.25], undefined, 400));
  const wiki = useRemote("wiki", () => getJSON(OPS.dossier.geosearch.replace("{lang}", "it").replace("{lat}", lat.toFixed(4)).replace("{lon}", lng.toFixed(4))));
  const w: any = (wx.data as any)?.current, a: any = (air.data as any)?.current;
  const tz = (wx.data as any)?.timezone;
  const lt = tz ? localTime(tz) : null;
  const items = (((near.data as any)?.items ?? []) as any[]).map((e) => ({ e, km: haversine([lng, lat], e.point) })).sort((x, y) => x.km - y.km).slice(0, 15);
  const types = store.get().types;
  useEffect(() => {
    ensureLine(map, "ops-point", "#E0A640").setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } } as any);
    if (!map.getLayer("ops-point-dot")) map.addLayer({ id: "ops-point-dot", type: "circle", source: "ops-point", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 6, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#E0A640", "circle-stroke-width": 2 } });
  }, [map, lng, lat]);
  return (
    <>
      <p className="mono" data-testid="ops-point-coords">{fmtLatLng(lat, lng)}</p>
      {lt && <p className="xs">Ora locale <b className="mono">{lt.time}</b> · {lt.date} · {lt.abbr ? `${lt.abbr} · ` : ""}{lt.utc} <span className="dim">({tz})</span></p>}
      <div className="row xs">
        <button type="button" className="xs primary" data-testid="ops-point-sky" onClick={() => ops.set({ tool: "sky" })}>✦ Cielo da qui</button>
        <button type="button" className="xs" onClick={() => ops.set({ tool: "route" })}>⇢ Percorso</button>
        <button type="button" className="xs" onClick={() => navigator.clipboard?.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)}>Copia coordinate</button>
      </div>
      <div className="hl-h">Adesso</div>
      {w ? <p className="xs">{w.temperature_2m} °C · umidità {w.relative_humidity_2m} % · vento {w.wind_speed_10m} km/h · nuvolosità {w.cloud_cover} % · precipitazione {w.precipitation} mm</p> : <Err e={wx.error} />}
      {a ? <p className="xs">Qualità dell'aria: indice europeo <b>{a.european_aqi}</b> · PM2,5 {a.pm2_5} µg/m³ · PM10 {a.pm10} · NO₂ {a.nitrogen_dioxide} · O₃ {a.ozone}</p> : <Err e={air.error} />}
      <Credit>{OPS.air.credit} — modelli, non misure di una stazione.</Credit>
      <div className="hl-h">Elementi NEXUM vicini</div>
      <ul className="ops-list" data-testid="ops-point-near">{items.map(({ e, km }) => (
        <li key={e.id}><button type="button" className="linklike" onClick={() => store.select(e.id, "ops-point")}>{e.label}</button>
          <span className="xs dim"> · {types.get(e.type)?.label ?? e.type} · {fmtKm(km)}</span></li>))}
        {near.data && !items.length && <li className="xs dim">Nessun elemento entro circa 25 km nel periodo osservato.</li>}</ul>
      <div className="hl-h">Wikipedia nei dintorni</div>
      <ul className="ops-list">{((((wiki.data as any)?.query?.geosearch ?? []) as any[])).map((g) => (
        <li key={g.pageid}><a href={`https://it.wikipedia.org/?curid=${g.pageid}`} target="_blank" rel="noopener noreferrer">{g.title}</a><span className="xs dim"> · {fmtKm(g.dist / 1000)}</span></li>))}</ul>
      <Credit>{OPS.dossier.credit}</Credit>
    </>);
}

// ── SENTINEL-2 SCENES (STAC) ──────────────────────────────────────────────
function ScenesPanel({ map }: { map: MLMap }) {
  const [res, setRes] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true); setErr(null);
    try {
      const c = map.getCenter();
      const d = await getJSON(OPS.stac.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        collections: OPS.stac.collections, intersects: { type: "Point", coordinates: [c.lng, c.lat] }, limit: 12,
        datetime: `${new Date(Date.now() - 45 * 86400_000).toISOString()}/${new Date().toISOString()}`,
        query: { "eo:cloud_cover": { lt: 60 } }, sortby: [{ field: "properties.datetime", direction: "desc" }] }) });
      setRes(d.features ?? []);
    } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  const show = (f: any) => {
    ensureLine(map, "ops-scene", "#9FD07A").setData(f);
    const bb = bboxOf(f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]);
    fit(map, bb, { padding: 40, duration: 700 });
  };
  return (
    <>
      <p className="xs dim">Le scene Sentinel-2 (10 m) acquisite negli ultimi 45 giorni sul centro della mappa, dalla più recente: data, nuvolosità, impronta e anteprima.</p>
      <button type="button" className="primary" disabled={busy} onClick={search} data-testid="ops-scenes-search">{busy ? "Cerco…" : "Cerca sul centro della mappa"}</button>
      {err && <p className="xs warn">Catalogo non disponibile ora ({err}).</p>}
      {res && !res.length && <p className="xs dim">Nessuna scena con nuvolosità sotto il 60 %.</p>}
      <ul className="ops-list" data-testid="ops-scenes">{(res ?? []).map((f) => (
        <li key={f.id} className="ops-scene"><button type="button" className="linklike" onClick={() => show(f)}>{fmtTime(f.properties.datetime)}</button>
          <span className="xs dim"> · nubi {Math.round(f.properties["eo:cloud_cover"])} % · {f.properties["s2:mgrs_tile"] ?? f.properties["grid:code"] ?? ""}</span>
          {f.assets?.thumbnail?.href && <img src={f.assets.thumbnail.href} alt="" loading="lazy" referrerPolicy="no-referrer" />}</li>))}</ul>
      <Credit>{OPS.stac.credit}</Credit>
    </>);
}

// ── IMPORT (files, ArcGIS public catalogue) ───────────────────────────────
function csvToGeo(text: string): GeoJSON.FeatureCollection {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sep = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const la = head.findIndex((h) => /^(lat|latitude|latitudine|y)$/.test(h)), lo = head.findIndex((h) => /^(lon|lng|long|longitude|longitudine|x)$/.test(h));
  if (la < 0 || lo < 0) throw new Error("servono le colonne lat e lon");
  return { type: "FeatureCollection", features: lines.slice(1).map((l) => l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ""))).filter((v) => Number.isFinite(+v[la]) && Number.isFinite(+v[lo]))
    .map((v) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [+v[lo], +v[la]] }, properties: Object.fromEntries(head.map((h, i) => [h, v[i]])) })) };
}
function fitFC(map: MLMap, fc: GeoJSON.FeatureCollection) {
  const pts: LngLat[] = [];
  const walk = (c: any) => { if (typeof c?.[0] === "number") pts.push(c as LngLat); else c?.forEach?.(walk); };
  fc.features.forEach((f: any) => walk(f.geometry?.coordinates));
  if (pts.length) fit(map, bboxOf(pts), { maxZoom: 12 });
}
function ImportPanel({ map }: { map: MLMap }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [inView, setInView] = useState(true);
  const [res, setRes] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, rerender] = useState(0);
  useEffect(() => importedData.subscribe(() => rerender((x) => x + 1)), []);
  const bbox = () => { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(4)).join(","); };
  const add = (fc: GeoJSON.FeatureCollection, l: { name: string; origin: string; licence?: string; url?: string; owner?: string }) => {
    importedData.add({ ...l, fc }); ops.layer("imported", true); fitFC(map, fc);
    setMsg(`${fc.features.length.toLocaleString("it-IT")} elementi da ${l.name}, solo in questo browser.`);
  };
  const onFile = async (f: File) => {
    try {
      const text = await f.text();
      if (/\.csv$/i.test(f.name)) add(csvToGeo(text), { name: f.name, origin: "file" });
      else { const j = JSON.parse(text); add(j.type === "FeatureCollection" ? j : j.type === "Feature" ? { type: "FeatureCollection", features: [j] } : (() => { throw new Error("non è GeoJSON"); })(), { name: f.name, origin: "file" }); }
    } catch (e: any) { setMsg(`File non letto: ${e?.message ?? e}`); }
  };
  const search = async (text = q) => {
    if (!text.trim()) return;
    setQ(text); setBusy("search");
    const d = await getJSON(OPS.arcgis.search.replace("{q}", encodeURIComponent(text)).replace("{bbox}", inView ? `&bbox=${bbox()}` : "")).catch((e) => ({ error: String(e) }));
    setRes(d.results ?? []); setBusy(null);
    if (d.error) setMsg(`Catalogo non raggiungibile ora (${d.error}).`);
  };
  const importService = async (it: any) => {
    setBusy(it.id);
    try {
      const base = String(it.url).replace(/\/$/, "");
      if (!/^https:\/\/services\d?\.arcgis\.com\//.test(base)) throw new Error("solo i servizi ospitati su ArcGIS Online (services*.arcgis.com) sono importabili da qui");
      let layer = base;
      if (!/\/\d+$/.test(base)) { const info = await getJSON(`${base}?f=json`).catch(() => null); layer = `${base}/${info?.layers?.[0]?.id ?? 0}`; }
      const geo = inView ? `&geometry=${bbox()}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` : "";
      const fc = await getJSON(`${layer}/query?where=1%3D1&outFields=*&f=geojson&outSR=4326&resultRecordCount=2000${geo}`);
      if (!fc?.features) throw new Error(fc?.error?.message ?? "risposta non GeoJSON");
      add(fc, { name: it.title, origin: "arcgis", licence: strip(it.licenseInfo), url: OPS.arcgis.item.replace("{id}", it.id), owner: it.owner });
    } catch (e: any) { setMsg(`Importazione non riuscita: ${e?.message ?? e}`); } finally { setBusy(null); }
  };
  const strip = (h: string) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const layers = importedData.layers();
  return (
    <>
      <label className="xs">File GeoJSON o CSV (colonne lat, lon): <input type="file" accept=".geojson,.json,.csv" data-testid="ops-import-file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      {msg && <p className="xs" data-testid="ops-import-msg">{msg}</p>}
      {layers.length > 0 && <><div className="hl-h">Livelli importati · {layers.length}</div>
        <ul className="ops-list" data-testid="ops-import-layers">{layers.map((l) => (
          <li key={l.id} className="row xs" data-testid="ops-import-layer">
            <button type="button" className="ops-swatch-btn" style={{ background: l.color }} aria-label="Cambia colore" title="Cambia colore"
              onClick={() => importedData.update(l.id, { color: IMPORT_COLORS[(IMPORT_COLORS.indexOf(l.color) + 1) % IMPORT_COLORS.length] })} />
            <label className="ops-qrow grow"><input type="checkbox" checked={l.visible} onChange={() => importedData.update(l.id, { visible: !l.visible })} data-testid="ops-import-visible" />
              <span className="ellipsis">{l.name}</span></label>
            <span className="dim mono">{l.fc.features.length.toLocaleString("it-IT")}</span>
            <button type="button" className="xs" aria-label="Inquadra" onClick={() => fitFC(map, l.fc)}>⌖</button>
            <button type="button" className="xs" aria-label="Togli il livello" data-testid="ops-import-remove" onClick={() => importedData.remove(l.id)}>×</button></li>))}</ul></>}
      <div className="hl-h">Catalogo pubblico ArcGIS Online</div>
      <div className="row"><input type="search" className="grow" value={q} placeholder="es. alluvioni, piste ciclabili…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} data-testid="ops-arcgis-q" />
        <button type="button" className="xs primary" disabled={busy === "search"} onClick={() => search()} data-testid="ops-arcgis-go">{busy === "search" ? "…" : "Cerca"}</button></div>
      <div className="row xs" data-testid="ops-arcgis-cats">{(OPS.arcgis.categories as string[][]).map(([label, query]) => (
        <button key={label} type="button" className="chip" aria-pressed={q === query} onClick={() => search(query)}>{label}</button>))}</div>
      <label className="ops-qrow xs"><input type="checkbox" checked={inView} onChange={() => setInView(!inView)} data-testid="ops-arcgis-inview" /> solo nell'area della mappa ({bbox().split(",").map((x) => Number(x).toFixed(1)).join(", ")})</label>
      {res && <p className="xs dim" data-testid="ops-arcgis-count">{res.length} livelli per «{q}»{inView ? " nell'area" : ""}</p>}
      <ul className="ops-list" data-testid="ops-arcgis-results">{(res ?? []).map((it) => (
        <li key={it.id} data-testid="ops-arcgis-item"><b>{it.title}</b><span className="xs dim"> · {it.owner}{it.numViews ? ` · ${Number(it.numViews).toLocaleString("it-IT")} visite` : ""}</span>
          {it.snippet && <p className="xs">{strip(it.snippet).slice(0, 220)}</p>}
          {it.tags?.length > 0 && <p className="xs dim">{(it.tags as string[]).slice(0, 6).join(" · ")}</p>}
          <p className="xs faint">Licenza: {strip(it.licenseInfo).slice(0, 240) || "non dichiarata dal proprietario (uso non consentito senza permesso)"} · <a href={OPS.arcgis.item.replace("{id}", it.id)} target="_blank" rel="noopener noreferrer">scheda ↗</a></p>
          {strip(it.licenseInfo) && <button type="button" className="xs" disabled={busy === it.id} data-testid="ops-arcgis-import" onClick={() => importService(it)}>{busy === it.id ? "Importo…" : `Importa${inView ? " nell'area" : ""} (max 2.000)`}</button>}</li>))}
        {res && !res.length && <li className="xs dim">Nessun servizio pubblico trovato.</li>}</ul>
      <p className="xs faint">{OPS.arcgis.gate}</p>
      <Credit>{OPS.arcgis.credit}</Credit>
    </>);
}

// ── NETWORK (passive) ─────────────────────────────────────────────────────
function NetPanel() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("dns");
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const N = OPS.net;
  const run = async () => {
    const v = q.trim().toLowerCase();
    if (!v) return;
    setBusy(true); setOut(null);
    const ip = /^[\d.]+$|:/.test(v);
    try {
      if (kind === "dns") setOut(Object.fromEntries(await Promise.all(["A", "AAAA", "MX", "NS", "TXT"].map(async (t) => [t, ((await getJSON(N.doh.replace("{q}", encodeURIComponent(v)).replace("{t}", t))).Answer ?? []).map((a: any) => a.data)]))));
      else if (kind === "rdap") { const d = await getJSON(N.rdap.replace("{kind}", ip ? "ip" : "domain").replace("{q}", encodeURIComponent(v)));
        setOut({ handle: d.handle, name: d.name ?? d.ldhName, status: d.status, events: (d.events ?? []).map((e: any) => `${e.eventAction}: ${String(e.eventDate).slice(0, 10)}`), nameservers: (d.nameservers ?? []).map((n: any) => n.ldhName), range: d.startAddress ? `${d.startAddress} – ${d.endAddress}` : undefined }); }
      else if (kind === "ct") { const d = await getJSON(N.ct.replace("{q}", encodeURIComponent(v)));
        setOut((d as any[]).slice(0, 40).map((c) => ({ dal: String(c.not_before).slice(0, 10), al: String(c.not_after).slice(0, 10), nomi: (c.dns_names ?? []).slice(0, 6).join(" ") }))); }
      else if (kind === "ripe") { const [w, p] = await Promise.all(["prefix-overview", "rir"].map((x) => getJSON(N.ripe.replace("{what}", x).replace("{q}", encodeURIComponent(v)))));
        setOut({ prefisso: w.data?.resource, annunciato: w.data?.announced, asn: (w.data?.asns ?? []).map((a: any) => `AS${a.asn} ${a.holder}`), registro: (p.data?.rirs ?? []).map((r: any) => r.rir) }); }
      else if (kind === "flaw") { const d = await getJSON(N.flaw.replace("{q}", encodeURIComponent(v.toUpperCase())));
        const c = d.containers?.cna ?? {};
        setOut({ id: d.cveMetadata?.cveId, stato: d.cveMetadata?.state, pubblicata: String(d.cveMetadata?.datePublished ?? "").slice(0, 10), titolo: c.title,
          descrizione: c.descriptions?.[0]?.value, prodotti: (c.affected ?? []).slice(0, 6).map((a: any) => `${a.vendor} ${a.product}`) }); }
      else if (kind === "mac") { const pre = v.replace(/[^0-9a-f]/g, "").slice(0, 6).toUpperCase();
        const t = await call<any>("/tables/oui", undefined, { channel: "oui" });
        const hit = (t.data.rows as [string, string][]).find((r) => r[0] === pre);
        setOut({ prefisso: pre, organizzazione: hit?.[1] ?? "non assegnato nel registro MA-L" }); }
      else if (kind === "tor") { const t = await call<any>("/tables/torexits", undefined, { channel: "tor" });
        setOut({ indirizzo: v, uscita_tor: (t.data.rows as [string][]).some((r) => r[0] === v), elenco: `${t.data.rows.length} uscite note` }); }
      else if (kind === "internetdb") setOut(await getJSON(N.internetdb.replace("{q}", encodeURIComponent(v))));
    } catch (e: any) { setOut({ errore: String(e?.message ?? e) }); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="row"><input type="search" className="grow" value={q} placeholder="dominio o indirizzo IP" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} data-testid="ops-net-q" />
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="dns">DNS</option><option value="rdap">RDAP</option><option value="ct">Certificati (CT)</option><option value="ripe">Instradamento (RIPE)</option><option value="flaw">{N.flawLabel}</option>
          <option value="mac">Produttore MAC (IEEE)</option><option value="tor">Uscita Tor?</option><option value="internetdb">Porte note (Shodan InternetDB, facoltativo)</option></select>
        <button type="button" className="xs primary" disabled={busy} onClick={run}>Vai</button></div>
      {kind === "internetdb" && <p className="xs faint">{N.internetdbNote}</p>}
      {out && <pre className="ops-pre xs" data-testid="ops-net-out">{JSON.stringify(out, null, 1)}</pre>}
      <Credit>{N.credit}</Credit>
      <p className="xs warn">{N.impossible}</p>
    </>);
}

// ── STYLE ─────────────────────────────────────────────────────────────────
function StylePanel() {
  const theme = useOps((s) => s.theme);
  return (
    <>
      <ul className="ops-list">{Object.entries(THEMES).map(([id, t]) => (
        <li key={id}><label className="row"><input type="radio" name="ops-theme" checked={theme === id} onChange={() => { ops.set({ theme: id }); applyTheme(id); }} />
          <span className="ops-swatch" style={{ background: t.accent }} /><span className="ops-swatch" style={{ background: t.panel }} /> {t.label}</label></li>))}</ul>
      <p className="xs dim">Il tema cambia solo l'aspetto in questo browser; i colori dei dati restano quelli di NEXUM.</p>
    </>);
}

// ── SHARE ─────────────────────────────────────────────────────────────────
function SharePanel({ map }: { map: MLMap }) {
  const s = ops.get();
  const focus = useStore((x) => x.focus);
  const c = map.getCenter();
  const layers = (Object.keys(s.layers) as (keyof OpsLayers)[]).filter((k) => s.layers[k]).join(",");
  const url = `${location.origin}${location.pathname}#${focus ? `/f/${focus}&` : ""}v=${c.lng.toFixed(4)},${c.lat.toFixed(4)},${map.getZoom().toFixed(2)}&b=${s.base}&p=${s.projection}&l=${layers}`;
  const [done, setDone] = useState(false);
  return (
    <>
      <p className="xs dim">Il collegamento riapre questa vista: centro, zoom, mappa di base, proiezione, livelli operativi{focus ? " e l'elemento in primo piano" : ""}.</p>
      <input type="text" readOnly value={url} className="ops-url" data-testid="ops-share-url" onFocus={(e) => e.target.select()} />
      <button type="button" className="primary" onClick={() => navigator.clipboard?.writeText(url).then(() => setDone(true), () => setDone(false))}>{done ? "Copiato" : "Copia"}</button>
      <p className="xs" data-testid="ops-share-social">Condividi: {([["X", "https://x.com/intent/post?url="], ["LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url="], ["Reddit", "https://www.reddit.com/submit?url="]] as const).map(([n, u]) => (
        <a key={n} href={`${u}${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" style={{ marginRight: 10 }}>{n} ↗</a>))}
        <span className="faint"> — il sito scelto si apre solo se lo tocchi; NEXUM non gli invia nulla prima.</span></p>
    </>);
}

// ── HELP ──────────────────────────────────────────────────────────────────
function HelpPanel() {
  const rows: [string, string][] = [
    ["/", "Cerca nel mondo NEXUM"], ["M · G", "Mappa · grafo"], ["[ · ]", "Indietro · avanti nell'indagine"], ["W", "Perché (collegamento scelto)"],
    ["P", "Globo 3D ↔ mappa 2D"], ["B", "Mappa → SAT → OGGI"], ["T", "Strade (OpenFreeMap) sì/no"], ["O", "Satelliti sì/no"], ["R", "Torna al globo"], ["F", "Schermo intero"],
    ...TOOLS.filter((t) => t.key).map((t) => [t.key!, t.label] as [string, string]), ["Esc", "Chiude il pannello"],
    ["Clic destro · ⌖ Tocca la mappa", "Sceglie un punto (cielo, percorso, dintorni)"], ["Trascina col destro", "Ruota e inclina (globo, rilievo)"],
  ];
  return (
    <>
      <p className="xs" data-testid="help-build">Versione in uso: <b className="mono">build {__NEXUM_BUILD__}</b> · si aggiorna da sola; quando ne arriva una nuova compare «Nuova versione disponibile · AGGIORNA ORA».</p>
      <table className="ops-table" data-testid="ops-help"><tbody>{rows.map(([k, v]) => <tr key={k + v}><td className="mono">{k}</td><td>{v}</td></tr>)}</tbody></table>
      <div className="hl-h">Chi contatta il tuo browser, e quando</div>
      <table className="ops-table xs" data-testid="ops-privacy"><tbody>{(OPS.privacy as string[][]).map(([w, v]) => <tr key={w}><td><b>{w}</b></td><td>{v}</td></tr>)}</tbody></table>
      <p className="xs faint">Parte del disegno operativo si ispira a OSIRIS (MIT, © 2026 simplifaisoul): nessun codice copiato, nessun servizio a pagamento, nessuna chiave.</p>
    </>);
}

// ── ORBIT CARD ────────────────────────────────────────────────────────────
function OrbitCard({ id }: { id: number }) {
  const [row, setRow] = useState<any>(null);
  const [now, setNow] = useState<{ lng: number; lat: number; alt: number; v: number } | null>(null);
  useEffect(() => {
    let live = true;
    loadOrbits().then((t) => live && setRow(t.byId.get(id)));
    const get = () => orbitDetail(id, Date.now()).then((d) => live && setNow(d));
    get();
    const t = setInterval(get, 1000);
    return () => { live = false; clearInterval(t); };
  }, [id]);
  if (!row) return null;
  const period = 1440 / row.mm;
  return (
    <aside className="ops-card" data-testid="ops-orbit-card">
      <header className="ops-ph"><b className="grow ellipsis">{row.name}</b><button type="button" className="xs" aria-label="Chiudi" onClick={() => ops.set({ orbit: null })}>×</button></header>
      <p className="xs"><span className="ops-swatch" style={{ background: familyColor(row.family) }} /> {familyLabel(row.family)} · NORAD {row.norad} · COSPAR {row.cospar}</p>
      {now && <p className="mono xs" data-testid="ops-orbit-now">{fmtLatLng(now.lat, now.lng, 2)} · quota {Math.round(now.alt).toLocaleString("it-IT")} km · {now.v.toFixed(2)} km/s</p>}
      <p className="xs">Periodo {period >= 120 ? `${(period / 60).toFixed(1)} h` : `${period.toFixed(1)} min`} · inclinazione {row.inc.toFixed(1)}° · eccentricità {row.ecc.toFixed(4)}</p>
      <p className="xs dim">Elementi dell'epoca {String(row.epoch).replace("T", " ").slice(0, 16)} UTC. {OPS.orbits.note}</p>
      <div className="row xs"><button type="button" className="xs" onClick={() => ops.set({ tool: "sky" })}>✦ Passaggi sopra un punto</button>
        <button type="button" className="xs" onClick={() => store.get() && call<any>("/search", { q: String(row.norad), b: { max_items: 3 } }).then((r) => { const it = r.data.groups?.flatMap((g: any) => g.items)?.[0]; if (it) store.select(it.id, "ops-orbit"); })}>Scheda NEXUM</button></div>
      <p className="xs"><a href={OPS.orbits.n2yo.replace("{norad}", String(row.norad))} target="_blank" rel="noopener noreferrer" data-testid="ops-orbit-n2yo">Traccia su N2YO ↗</a>
        {" · "}<a href={`https://celestrak.org/satcat/table-satcat.php?CATNR=${row.norad}`} target="_blank" rel="noopener noreferrer">catalogo CelesTrak ↗</a></p>
      <p className="xs faint">{OPS.orbits.credit}</p>
    </aside>);
}

/** IMF PortWatch daily transits of one chokepoint: the latest day, the 7-day mean, the 30-day course. */
function ChokeDaily({ id }: { id: string }) {
  const [d, setD] = useState<{ date: string; n: number; t: number; mean7: number; pts: number[] } | null | "err">(null);
  useEffect(() => {
    let live = true;
    getJSON(OPS.portwatch.daily.replace("{id}", encodeURIComponent(id))).then((j) => {
      const a = ((j.features ?? []) as any[]).map((f) => f.attributes).filter((x) => x.date != null);
      if (!a.length) { if (live) setD("err"); return; }
      const last = a[0], seven = a.slice(0, 7);
      if (live) setD({ date: new Date(last.date).toISOString().slice(0, 10), n: last.n_total, t: last.capacity, mean7: seven.reduce((s, x) => s + x.n_total, 0) / seven.length, pts: a.map((x) => x.n_total).reverse() });
    }).catch(() => live && setD("err"));
    return () => { live = false; };
  }, [id]);
  if (d === "err") return <span className="dim">non disponibili ora</span>;
  if (!d) return <span className="dim">…</span>;
  return <span data-testid="ops-choke-daily">{d.date}: <b>{d.n}</b> transiti · {Math.round(d.t).toLocaleString("it-IT")} t stimate · media 7 giorni {d.mean7.toFixed(1)} <Spark xs={d.pts} /></span>;
}

/** IMF PortWatch daily port calls of one port: the latest day, the 7-day mean, the 30-day course, imports and exports. */
function PortDaily({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    let live = true;
    getJSON(OPS.portwatch.portDaily.replace("{id}", encodeURIComponent(id))).then((j) => {
      const a = ((j.features ?? []) as any[]).map((f) => f.attributes).filter((x) => x.date != null);
      if (live) setD(a.length ? { date: new Date(a[0].date).toISOString().slice(0, 10), n: a[0].portcalls, imp: a[0].import, exp: a[0].export,
        mean7: a.slice(0, 7).reduce((s, x) => s + x.portcalls, 0) / Math.min(7, a.length), pts: a.map((x) => x.portcalls).reverse() } : "err");
    }).catch(() => live && setD("err"));
    return () => { live = false; };
  }, [id]);
  if (d === "err") return <span className="dim">non disponibili ora</span>;
  if (!d) return <span className="dim">…</span>;
  return <span data-testid="ops-port-daily">{d.date}: <b>{d.n}</b> scali · import {Math.round(d.imp).toLocaleString("it-IT")} t · export {Math.round(d.exp).toLocaleString("it-IT")} t (stime) · media 7 giorni {d.mean7.toFixed(1)} <Spark xs={d.pts} /></span>;
}

// ── NEWS (2026-10-06, physical acceptance): a reported event a person can understand BEFORE leaving NEXUM — what was
// reported, where, when, by whom (roles and countries as GDELT coded them, never names), how many articles and outlets
// NEXUM actually has for it, that it is reported and not verified; the original article is for checking, and the codes
// (CAMEO, Goldstein, tone) are technical details. Every sentence comes from the row's own codes: nothing is inferred. ──
const N = NEWS as any;
const regionName = (() => { try { return new Intl.DisplayNames(["it"], { type: "region" }); } catch { return null; } })();
function countryOf(a3: string): string | null {
  if (!a3) return null;
  const a2 = N.a3a2[a3];
  return (a2 && regionName?.of(a2)) || N.regions[a3] || null;
}
function actorOf(c: string, t: string, g: string): string | null {
  const who = N.groups[g] ?? N.roles[t] ?? null, where = countryOf(c);
  return who && where ? `${who} (${where})` : who ?? where;
}
function actionOf(p: any): string {
  return N.base[String(p.code ?? "").slice(0, 3)] ?? (OPS.news.roots as Record<string, string>)[p.root] ?? "Evento riportato dai media";
}
/** The title an article's own address carries (e.g. …/2026-10-06-faculty-prepares-vote/ → "Faculty prepares vote"), or
 *  null when the address has none (numbers, ids). Said as such wherever it is shown. */
export function titleFromUrl(u: string): string | null {
  let best: string[] | null = null;
  try {
    for (const raw of new URL(u).pathname.split("/")) {
      let seg = raw; try { seg = decodeURIComponent(raw); } catch { /* as is */ }
      const words = seg.replace(/\.(s?html?|php|aspx?|cms)$/i, "").split(/[-_+]+/).filter((w) => /\p{L}/u.test(w) && !(/\d/.test(w) && w.length > 4));
      if (words.length >= 3 && (!best || words.length > best.length)) best = words;
    }
  } catch { return null; }
  if (!best) return null;
  const t = best.join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function NewsBody({ p, meta, where }: { p: any; meta: any; where: string | null }) {
  const links: string[] = (() => { try { return JSON.parse(p.links ?? "[]"); } catch { return []; } })();
  const first = links[0] ?? p.url ?? null;
  const headline = first ? titleFromUrl(first) : null;
  const t = Date.parse(`${p.added ?? p.t}:00Z`);
  const a1 = actorOf(p.a1c ?? "", p.a1t ?? "", p.a1g ?? ""), a2 = actorOf(p.a2c ?? "", p.a2t ?? "", p.a2g ?? "");
  const hosts = [...new Set(links.map(host))];
  const act = actionOf(p);
  const when = Number.isFinite(t) ? `${new Date(t).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC · ${ago(t)}` : null;
  return (
    <div className="news-body" data-testid="news-body">
      <p className="news-status" data-testid="news-status"><b>RIPORTATO DAI MEDIA</b> · non verificato · codifica automatica</p>
      <p className="news-sentence" data-testid="news-sentence">Evento riportato dai media{p.place ? ` a ${p.place}` : ""}: {act.charAt(0).toLowerCase() + act.slice(1)}.</p>
      {headline && <p className="news-head" data-testid="news-headline">«{headline}»<span className="xs dim"> — dal titolo nell'indirizzo dell'articolo ({host(first!)})</span></p>}
      <dl className="news-dl">
        <dt>Luogo</dt><dd data-testid="news-place">{p.place || "—"}</dd>
        <dt>Quando</dt><dd data-testid="news-when">{when ?? "—"}</dd>
        {(a1 || a2) && <><dt>Chi</dt><dd data-testid="news-actors">{[a1, a2].filter(Boolean).join(" → ")} <span className="xs dim">(ruoli e paesi come li codifica GDELT; nessun nome)</span></dd></>}
        <dt>Fonti</dt><dd data-testid="news-count"><b>1 evento</b> · {links.length} {links.length === 1 ? "articolo" : "articoli"} · {hosts.length} {hosts.length === 1 ? "testata" : "testate"}
          {p.rows > 1 ? <span className="xs dim"> (unisce {p.rows} righe GDELT: stessa azione, stesso luogo, stessi attori, stessa ora)</span> : null}</dd>
      </dl>
      {links.length > 0 && <details className="news-sources" data-testid="news-sources">
        <summary>Mostra le fonti ({links.length})</summary>
        <ul>{links.map((u) => { const tl = titleFromUrl(u); return (
          <li key={u}><a href={u} target="_blank" rel="noopener noreferrer"><b>{host(u)}</b>{tl ? ` — ${tl}` : ""} ↗</a></li>); })}</ul>
      </details>}
      {first && <a className="primary news-open" data-testid="news-open" href={first} target="_blank" rel="noopener noreferrer">APRI FONTE ORIGINALE ↗</a>}
      {first && <p className="xs faint">Si apre il sito di {host(first)}: pubblicità, cookie e abbonamenti sono del sito, non di NEXUM.</p>}
      <details className="news-tech" data-testid="news-tech">
        <summary>Dettagli tecnici</summary>
        <dl className="news-dl xs">
          <dt>Codice CAMEO</dt><dd>{p.code} · {(OPS.news.roots as Record<string, string>)[p.root] ?? p.root}</dd>
          {p.quad && <><dt>Classe</dt><dd>{N.quad[p.quad] ?? p.quad}</dd></>}
          <dt>Scala Goldstein</dt><dd>{p.gold}</dd>
          <dt>Tono medio</dt><dd>{p.tone}</dd>
          {p.sources ? <><dt>Conteggi GDELT</dt><dd>{p.sources} fonti · {p.n} articoli · {p.mentions} menzioni nei 15 minuti</dd></> : <><dt>Articoli (GDELT)</dt><dd>{p.n}</dd></>}
          <dt>Aggiunto a GDELT</dt><dd>{String(p.t).replace("T", " ")} UTC</dd>
          {where && <><dt>Coordinate</dt><dd>{where}</dd></>}
          {meta?.notes?.from && <><dt>Finestra</dt><dd>{String(meta.notes.from).replace("T", " ")}–{String(meta.notes.to ?? "").replace("T", " ")} UTC</dd></>}
          <dt>Dataset</dt><dd>GDELT 2.0 Events{meta?.notes?.mentions ? " + Mentions" : ""} · licenza {meta?.license_id ?? "gdelt-open"}</dd>
          {meta?.fetched_ms && <><dt>Dati scaricati</dt><dd>{fmtTime(meta.fetched_ms)} ({ago(meta.fetched_ms)})</dd></>}
          {p.eids && <><dt>ID eventi GDELT</dt><dd className="mono">{p.eids}</dd></>}
        </dl>
      </details>
    </div>);
}

// ── FEATURE CARD (pass #5): what an operational point, line or area on the map IS — its own fields only (none invented),
// where and when, the source and its licence, how old the data is, the link to the original, and whether it is a NEXUM
// object (it is not: these are published tables and live feeds, so there is no Evidence/WHY of their own) ──
const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "ora" : m < 90 ? `${m} min fa` : m < 2880 ? `${Math.round(m / 60)} h fa` : `${Math.round(m / 1440)} giorni fa`; };
const CARD = OPS.card as Record<string, any>;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
function FeatCard({ map, feat }: { map: MLMap; feat: NonNullable<OpsState["feat"]> }) {
  const [i, setI] = useState(0);
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => { setI(0); setFound(null); }, [feat]);
  useEffect(() => {
    if (innerWidth >= DESK_W) return;
    const l = registerLayer({ open: () => ops.get().feat != null, close: () => ops.set({ feat: null }) });
    l.changed();
    return () => { l.off(); l.changed(); };
  }, []);
  const f = feat.fs[Math.min(i, feat.fs.length - 1)], p = f.p;
  const meta = tableMeta[({ "ops-ports": "ports", "ops-choke": "choke", "ops-naval": "naval", "ops-news": "news", "ops-hotspots": "hotspots", "ops-cables": "cables", "ops-ais": "ais", "ops-quakes": "quakes", "ops-gdacs": "gdacs", "ops-nws": "nws" } as Record<string, string>)[f.l] ?? ""];
  const where = f.l.startsWith("ops-imported") && !f.l.endsWith("pt") ? null : fmtLatLng(feat.c[1], feat.c[0], 3);
  const placeInNexum = (q: string) => call<any>("/search", { q, b: { max_items: 3 } }).then((r) => {
    const it = r.data.groups?.flatMap((g: any) => g.items)?.[0];
    if (it) store.select(it.id, "ops-feature"); else setFound(`Nessun elemento NEXUM trovato per «${q}».`);
  }).catch(() => setFound("Ricerca non disponibile ora."));
  let title = "", kind = "", rows: [string, ReactNode][] = [], link: [string, string] | null = null, credit = "", nexum: ReactNode = null;
  let body: ReactNode = null;
  if (f.l === "ops-news") {
    title = actionOf(p); kind = CARD.news;
    body = <NewsBody p={p} meta={meta} where={where} />;
    credit = OPS.news.credit;
    const q = String(p.place ?? "").split(",").pop()?.trim();
    nexum = q ? <button type="button" className="xs" data-testid="ops-feat-place" onClick={() => placeInNexum(q)}>Il luogo in NEXUM: {q}</button> : null;
  } else if (f.l === "ops-choke") {
    title = p.portname ?? p.fullname; kind = CARD.choke;
    const n = (k: string) => (p[k] != null ? Number(p[k]).toLocaleString("it-IT") : null);
    rows = [["Navi in transito, media annua (AIS 2019–2024)", n("vessel_count_total")], ["di cui cisterne", n("vessel_count_tanker")], ["portacontainer", n("vessel_count_container")],
      ["rinfuse secche", n("vessel_count_dry_bulk")], ["carico generale", n("vessel_count_general_cargo")], ["ro-ro", n("vessel_count_RoRo")],
      ["Merci principali (stima)", [p.industry_top1, p.industry_top2, p.industry_top3].filter(Boolean).join(" · ") || null],
      ["Ultimi giorni", <ChokeDaily id={p.portid} />]];
    if (p.pageid) link = [OPS.portwatch.page.replace("{page}", p.pageid), "Pagina IMF PortWatch"];
    credit = OPS.portwatch.credit;
  } else if (f.l === "ops-ports") {
    title = `${p.portname}${p[OPS.portwatch.placeField] ? ` · ${p[OPS.portwatch.placeField]}` : ""}`; kind = CARD.port;
    const n = (k: string) => (p[k] != null ? Number(p[k]).toLocaleString("it-IT") : null);
    const pct = (k: string) => (p[k] != null ? `${(Number(p[k]) * 100).toFixed(1)} %` : null);
    rows = [["Navi agli scali, media annua (AIS 2019–2024)", n("vessel_count_total")], ["di cui cisterne", n("vessel_count_tanker")], ["portacontainer", n("vessel_count_container")],
      ["Quota delle importazioni marittime del paese", pct("share_country_maritime_import")], ["Quota delle esportazioni marittime del paese", pct("share_country_maritime_export")],
      ["Merci principali (stima)", [p.industry_top1, p.industry_top2, p.industry_top3].filter(Boolean).join(" · ") || null],
      ["Ultimi giorni", <PortDaily id={p.portid} />]];
    if (p.pageid) link = [OPS.portwatch.page.replace("{page}", p.pageid), "Pagina IMF PortWatch"];
    credit = OPS.portwatch.credit;
  } else if (f.l === "ops-naval") {
    title = p.name || "Base navale (senza nome in OpenStreetMap)"; kind = CARD.naval;
    rows = [["Gestore", p.op || null]];
    link = [`https://www.openstreetmap.org/${p.t}/${p.id}`, "Apri in OpenStreetMap"];
    credit = CARD.osmCredit;
  } else if (f.l === "ops-quakes") {
    title = `Terremoto M ${Number(p.mag).toFixed(1)}${p.magType ? ` (${p.magType})` : ""}`; kind = CARD.geo;
    rows = [["Luogo", p.place], ["Ora (UTC)", new Date(Number(p.time)).toISOString().replace("T", " ").slice(0, 19)], ["Età", ago(Number(p.time))],
      ["Profondità", `${Number(p.depth).toFixed(1)} km`], ["Stato", p.status === "reviewed" ? "rivisto da un sismologo" : "automatico"],
      ["Allerta PAGER", p.alert || null], ["Avvisato tsunami", Number(p.tsunami) ? "sì (vedi la fonte)" : null], ["Segnalazioni «l'hai sentito?»", p.felt || null]];
    if (p.url) link = [String(p.url), OPS.alerts.geoLink];
    credit = OPS.alerts.geoCredit;
  } else if (f.l === "ops-gdacs") {
    title = `${p.type} · ${p.name ?? ""}`; kind = CARD.gdacs;
    rows = [["Livello", p.level], ["Luogo", p.place || null], ["Dal", p.from ? fmtTime(p.from) : null], ["Al", p.to ? fmtTime(p.to) : null], ["Gravità", p.severity || null]];
    if (p.url) link = [String(p.url), "Rapporto GDACS"];
    credit = OPS.alerts.gdacsCredit;
  } else if (f.l === "ops-nws") {
    title = p.event; kind = CARD.nws;
    rows = [["Zona", p.area], ["Gravità", p.severity], ["Urgenza", p.urgency], ["Certezza", p.certainty], ["Emesso", p.sent ? fmtTime(p.sent) : null], ["Scade", p.expires ? fmtTime(p.expires) : null]];
    if (p.url) link = [String(p.url), "Avviso NWS"];
    credit = OPS.alerts.nwsCredit;
  } else if (f.l === "ops-hotspots") {
    title = CARD.hotspotTitle; kind = CARD.hotspot;
    rows = [["Acquisito", `${String(p.t).replace("T", " ")} UTC`], ["Sensore", meta?.notes?.sensors?.[p.s] ?? p.s], ["Potenza radiativa (FRP)", `${p.frp} MW`],
      ["Confidenza", p.c === "h" ? "alta" : p.c === "n" ? "nominale" : p.c]];
    link = [`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${feat.c[0].toFixed(3)},${feat.c[1].toFixed(3)},10z`, "Mappa NASA FIRMS"];
    credit = OPS.hotspots.credit;
  } else if (f.l === "ops-ais") {
    title = p.name || CARD.aisNoName; kind = CARD.ais.replace("{k}", CARD.aisKinds[p.k] ?? p.k);
    rows = [["MMSI", p.mmsi], ["Velocità", `${p.sog} nodi`], ["Rotta", `${p.cog}°`], ["Destinazione dichiarata", p.dest || null],
      ["Posizione ricevuta", p.t ? `${fmtTime(p.t)} (${ago(Number(p.t))})` : null]];
    credit = OPS.ais.credit;
  } else if (f.l === "ops-cables") {
    title = p.name || CARD.cableNoName; kind = p.k === "power" ? CARD.cablePower : CARD.cableTelecom;
    rows = [["Gestore", p.op || null], ["Tracciato", "semplificato (~1 km) dall'estratto globale"]];
    if (p.id) link = [`https://www.openstreetmap.org/way/${p.id}`, "Apri in OpenStreetMap"];
    credit = OPS.cables.credit;
  } else {
    const L = importedData.layer(p.__lid);
    title = String(p.name ?? p.title ?? p.NAME ?? p.Name ?? "Elemento importato");
    kind = L?.origin === "arcgis" ? CARD.importedArcgis.replace("{owner}", L.owner ?? "") : CARD.imported;
    rows = [["Livello", L?.name ?? null], ...Object.entries(p).filter(([k]) => !/^(name|title|__lid|__color)$/i.test(k)).slice(0, 14).map(([k, v]) => [k, String(v).slice(0, 160)] as [string, ReactNode])];
    if (L?.url) link = [L.url, "Scheda del dataset"];
    if (L?.licence) credit = `Licenza dichiarata: ${L.licence.slice(0, 200)}`;
  }
  // the source, its licence and age, what kind of record it is
  const footer = <>
      <p className="xs" data-testid="ops-feat-source"><b>Fonte</b> · {meta?.attribution ?? credit}{meta?.license_id ? ` · licenza ${meta.license_id}` : ""}
        {meta?.fetched_ms ? ` · dati aggiornati ${fmtTime(meta.fetched_ms)} (${ago(meta.fetched_ms)})` : ""}
        {meta?.notes?.from ? ` · finestra ${String(meta.notes.from).replace("T", " ")}–${String(meta.notes.to ?? "").replace("T", " ")} UTC` : ""}</p>
      <p className="xs faint" data-testid="ops-feat-nexum">Non è un oggetto NEXUM: {f.l.startsWith("ops-imported") ? "un livello importato da te (solo in questo browser)" : meta?.table ? `riga della tabella pubblicata «${meta.table}»` : "dato in diretta dalla fonte"}, senza prove né spiegazioni (WHY) proprie.</p>
      {nexum && <div className="row xs">{nexum}</div>}
      {found && <p className="xs dim">{found}</p>}
      <div className="row xs"><button type="button" className="xs" onClick={() => fly(map, feat.c, Math.max(map.getZoom(), 6))}>Centra</button></div></>;
  return (
    <aside className="ops-card ops-feat" data-testid="ops-feat-card" data-layer={f.l} aria-label={title}>
      <header className="ops-ph"><b className="grow ellipsis" data-testid="ops-feat-title" style={{ minWidth: 0 }}>{title}</b>
        {feat.fs.length > 1 && <span className="xs dim" data-testid="ops-feat-n" style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none", whiteSpace: "nowrap" }}>
          <button type="button" className="xs" aria-label="Precedente" onClick={() => setI((i + feat.fs.length - 1) % feat.fs.length)}>‹</button>
          {i + 1} di {feat.fs.length}
          <button type="button" className="xs" aria-label="Successivo" onClick={() => setI((i + 1) % feat.fs.length)}>›</button></span>}
        <button type="button" className="ops-close" aria-label="Chiudi" data-testid="ops-feat-close" onClick={() => ops.set({ feat: null })}>×</button></header>
      {body ?? <>
      <p className="xs dim">{kind}</p>
      <dl className="xs" data-testid="ops-feat-fields" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", padding: "0 10px", margin: "4px 0" }}>
        {[...rows, ["Coordinate", where] as [string, ReactNode]].filter(([, v]) => v != null && v !== "").map(([k, v]) =>
          [<dt key={`t${k}`} className="dim">{k}</dt>, <dd key={k} style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>])}</dl>
      {link && <p className="xs"><a href={link[0]} target="_blank" rel="noopener noreferrer" data-testid="ops-feat-link">{link[1]} ↗</a></p>}
      </>}
      {footer}
    </aside>);
}
