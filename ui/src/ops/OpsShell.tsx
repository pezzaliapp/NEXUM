// THE OPERATIONAL SHELL of the map (2026-10-04, OSIRIS-level transformation): a header of readings (UTC "Zulu" time,
// the sources' state, the layers and elements drawn, the planetary Kp index), the basemap and projection switch, the
// tool rail and its panels, the cursor's coordinates with the place under it (computed offline from NEXUM's own
// cartography), the zoom and a scale bar, the keyboard shortcuts. The tools' panels are a separate download, fetched
// the first time one is opened. NEXUM's own information (the rail, the element's card, the timeline) is unchanged.

import { lazyStale } from "../lib/stale";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { useStore, store } from "../store";
import { DESK_W, registerLayer } from "../lib/layers";
import { spaceWeather } from "../config/ops-space.json";
import { call } from "../lib/api";
import { ops, PERMALINK, useOps, type BaseMode, type OpsState, type Tool } from "./state";
import { fmtLatLng, scaleFor } from "./geo";
import { applyTheme } from "./theme";
import { useHighlights, typeLabelOf } from "../components/Highlights";
import { head } from "../lib/summary";

const Panels = lazyStale(() => import("./Panels"));
const SeaRoutePanel = lazyStale(() => import("./SeaRoutePanel"));

export const TOOLS: { id: Tool; short: string; group: string; icon: string; label: string; key?: string }[] = [
  { id: "layers", short: "Livelli", group: "map", icon: "≡", label: "Livelli", key: "L" },
  { id: "draw", short: "Disegno e misure", group: "map", icon: "✎", label: "Disegno e misure", key: "D" },
  { id: "alerts", short: "Allerte", group: "world", icon: "⚠", label: "Allerte dal vivo", key: "A" },
  { id: "cams", short: "Telecamere", group: "see", icon: "◉", label: "Telecamere", key: "C" },
  { id: "live", short: "Dirette", group: "see", icon: "▶", label: "Dirette (canali ufficiali, spazio, notizie)", key: "V" },
  { id: "sky", short: "Cielo", group: "see", icon: "✦", label: "Cielo da un punto", key: "Y" },
  { id: "space", short: "Meteo spaziale", group: "see", icon: "☀", label: "Meteo spaziale", key: "K" },
  { id: "markets", short: "Mercati", group: "world", icon: "€", label: "Mercati e cambi", key: "E" },
  { id: "route", short: "Strada", group: "map", icon: "⇢", label: "Percorso stradale e navigazione", key: "N" },
  { id: "point", short: "Punto", group: "map", icon: "⌖", label: "Punto: luogo, aria, meteo, vicini", key: "I" },
  { id: "scenes", short: "Sentinel-2", group: "see", icon: "▦", label: "Scene Sentinel-2", key: "J" },
  { id: "import", short: "Importa", group: "world", icon: "⇪", label: "Importa (GeoJSON, CSV, ArcGIS)", key: "U" },
  { id: "registers", short: "Registri", group: "world", icon: "⚖", label: "Registri pubblici (sanzioni, falle sfruttate)", key: "S" },
  { id: "net", short: "Rete (passivi)", group: "tools", icon: "⌁", label: "Strumenti di rete (passivi)", key: "X" },
  { id: "ai", short: "Sintesi", group: "tools", icon: "✧", label: "Sintesi dei fatti (NEXUM)", key: "Q" },
  { id: "style", short: "Stile", group: "tools", icon: "◐", label: "Stile", key: "Z" },
  { id: "share", short: "Condividi", group: "tools", icon: "⤴", label: "Condividi questa vista", key: "H" },
  { id: "help", short: "Aiuto", group: "tools", icon: "?", label: "Scorciatoie da tastiera", key: "?" },
];
const BASES: { id: BaseMode; label: string; title: string }[] = [
  { id: "map", label: "MAPPA", title: "Cartografia NEXUM con il dettaglio OpenFreeMap" },
  { id: "sat", label: "SAT", title: "Immagini: Blue Marble (NASA) e Sentinel-2 cloudless 2016 (EOX)" },
  { id: "today", label: "OGGI", title: "La Terra di ieri vista da VIIRS (NASA GIBS): un'immagine di una data, non in diretta" },
];

/** Install the operational layers on the map, each one when it is first needed (level of detail: the opening world view
 *  never downloads what it does not show) — the street-level basemap detail from the regional zoom or a mode change,
 *  the orbits when turned on, the overlays and the drawing when used. */
export function installOps(map: MLMap): () => void {
  const stops: (() => void)[] = [];
  const once = new Map<string, Promise<void>>();
  const load = (key: string, imp: () => Promise<(m: MLMap) => () => void>) => {
    if (!once.has(key)) once.set(key, imp().then((install) => { if (install && map.getStyle()) stops.push(install(map)); }).catch(() => { once.delete(key); }));   // stale: retried after the update
    return once.get(key)!;
  };
  const start = ops.get();
  const need = (s: OpsState) => {
    if (s.base !== "map" || s.projection !== start.projection || s.layers.streets || map.getZoom() >= 4 || s.layers.terrain || s.layers.hillshade || s.layers.clouds || s.layers.precip)
      load("basemaps", () => import("./basemaps").then((m) => m.installBasemaps));
    if (s.layers.channels || s.layers.ais || s.layers.aurora || s.layers.hotspots || s.layers.cables || s.layers.news || s.layers.quakes || s.layers.gdacs || s.layers.nws || s.layers.naval || s.layers.choke || s.layers.ports || s.layers.imported && s.counts.imported || s.tool === "live" || s.tool === "import" || s.tool === "space")
      load("overlays", () => import("./overlays").then((m) => (mm: MLMap) => m.installOverlays(mm, "nexum-focus-fill")));
    if (s.layers.orbits || s.orbit != null || s.tool === "sky")
      load("orbits", () => import("./orbits").then((m) => (mm: MLMap) => m.installOrbits(mm, "nexum-sel")));
    if (s.layers.camPreviews)
      load("previews", () => import("./previews").then((m) => m.installPreviews));
    if (s.tool === "draw" || hasShapes())
      load("draw", () => import("./draw").then((m) => m.installDraw));
  };
  const check = () => need(ops.get());
  const unsub = ops.subscribe(check);
  map.on("zoomend", check);
  check();
  // a right-click (or a long press) chooses a point: the observer of the sky, the place of the point panel
  const ctx = (e: any) => {
    e.preventDefault?.();
    ops.set({ point: { lng: e.lngLat.lng, lat: e.lngLat.lat, label: "" }, tool: ops.get().tool === "sky" ? "sky" : "point" });
  };
  map.on("contextmenu", ctx);
  // touch screens have no right-click: a tool arms "pick" and the next tap on the map chooses the point
  const pick = (e: any) => {
    const target = ops.get().pick;
    if (!target) return;
    const p = { lng: e.lngLat.lng, lat: e.lngLat.lat, label: "" };
    // the point chosen: the sheet comes back to half, where its result is read
    ops.set({ pick: null, ...(target === "point" ? { point: p } : {}), ...(ops.get().sheet === "peek" ? { sheet: "half" as const } : {}) });
    window.dispatchEvent(new CustomEvent("nexum:picked", { detail: { target, ...p } }));
  };
  map.on("click", pick);
  // while a pick is armed the map's own taps (choose an element, open a place) step aside, as while drawing
  let lastPick: string | null = null;
  const unsubPick = ops.subscribe(() => {
    const now = ops.get().pick;
    if (now === lastPick) return;
    lastPick = now;
    (window as any).__nexumPicking = !!now;
    document.documentElement.classList.toggle("map-taps", !!now || !!(window as any).__nexumDrawing);
    map.getCanvas().style.cursor = now ? "crosshair" : "";
  });
  // idle rotation (on request): a slow turn of the globe at world scale while nobody touches the map
  let spinRaf = 0, last = 0, touched = 0;
  const hold = () => { touched = performance.now(); };
  for (const ev of ["mousedown", "touchstart", "wheel", "dragstart"] as const) map.on(ev, hold);
  const spin = (t: number) => {
    const s = ops.get();
    if (!s.layers.spin) { spinRaf = 0; return; }   // the loop runs only while the rotation is on
    spinRaf = requestAnimationFrame(spin);
    if (s.projection !== "globe" || map.getZoom() > 3 || map.isMoving() || t - touched < 4000) { last = t; return; }
    const dt = Math.min(100, t - last); last = t;
    const c = map.getCenter();
    map.jumpTo({ center: [((c.lng + 0.004 * dt + 540) % 360) - 180, c.lat] });
  };
  const spinCheck = () => { if (ops.get().layers.spin && !spinRaf) spinRaf = requestAnimationFrame(spin); };
  const unsubSpin = ops.subscribe(spinCheck);
  spinCheck();
  ((window as any).__nexum ??= {}).ops = ops;   // test hook (as the workspace store)
  // a permalink's camera, once
  const cam = PERMALINK.camera;
  if (cam) map.jumpTo({ center: cam.c, zoom: cam.z });
  return () => { unsub(); map.off("zoomend", check); stops.forEach((s) => s()); map.off("contextmenu", ctx); cancelAnimationFrame(spinRaf); unsubSpin(); unsubPick(); map.off("click", pick); };
}
const hasShapes = () => { try { return (localStorage.getItem("nexum.aoi.shapes.v1") ?? "[]").length > 2; } catch { return false; } };

export function OpsShell({ map }: { map: MLMap }) {
  const tool = useOps((s) => s.tool), card = useOps((s) => s.orbit != null || !!s.feat);
  const touch = innerWidth < DESK_W;
  useEffect(() => { if (ops.get().theme !== "nexum") applyTheme(ops.get().theme); }, []);
  useShortcuts(map);
  useKp();
  return (
    <>
      <Hud map={map} touch={touch} />
      <ToolRail touch={touch} map={map} />
      {(tool || card) && (
        <Suspense fallback={tool && <div className="ops-panel" data-testid="ops-panel-loading"><p className="xs dim">…</p></div>}>
          <Panels map={map} tool={tool} />
        </Suspense>)}
      {!touch && <Footer map={map} />}
      <NavActive />
    </>);
}

/** Navigation running: always on screen, above any card or sheet, with its stop — the position and the voice never run
 *  unseen (2026-10-07, physical test). The route stays; only the navigation ends. */
function NavActive() {
  const on = useOps((s) => s.navigating);
  if (!on) return null;
  return (
    <div className="ops-nav-pill" role="status" data-testid="ops-nav-active">
      <span>◉ Navigazione attiva · posizione del dispositivo e voce</span>
      <button type="button" className="xs primary" data-testid="ops-nav-stop" onClick={() => ops.set({ navigating: false })}>Ferma</button>
    </div>);
}

function Hud({ map, touch }: { map: MLMap; touch: boolean }) {
  const base = useOps((s) => s.base);
  const proj = useOps((s) => s.projection);
  const kp = useOps((s) => s.kp);
  const kpTime = useOps((s) => s.kpTime);
  const counts = useOps((s) => s.counts);
  const layers = useOps((s) => s.layers);
  const status = useStore((s) => s.status);
  const info = useStore((s) => s.mapInfo);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const ok = status ? status.sources.filter((s) => s.health === "ok").length : 0;
  const nSources = status?.sources.length ?? 0;
  const nLayers = 1 + Object.values(layers).filter(Boolean).length;   // NEXUM's own layer + the operational ones on
  const entities = (info?.returned ?? 0) + Object.values(counts).reduce((a, b) => a + b, 0);
  if (touch) return null;   // touch layouts: the modes live in the tools sheet (never over the map's own controls)
  const kpColor = kp == null ? "var(--dim)" : kp >= 7 ? "#D7536F" : kp >= 5 ? "#E8913A" : kp >= 4 ? "#E0C040" : "#86A07A";
  return (
    <div className={`ops-hud${touch ? " touch" : ""}`} data-testid="ops-hud">
      {!touch && <>
        <span className="hud-k">ZULU</span><span className="mono hud-v" data-testid="ops-zulu">{now.toISOString().slice(11, 19)}Z</span>
        <span className="hud-k">STATO</span><span className="mono hud-v" title={`${ok}/${nSources} fonti in regola`}>
          <span style={{ color: ok === nSources ? "#86A07A" : "var(--accent)" }}>●</span> {ok}/{nSources}</span>
        <span className="hud-k">LIVELLI</span><span className="mono hud-v" data-testid="ops-layers">{nLayers}</span>
        <span className="hud-k">ENTITÀ</span><span className="mono hud-v" data-testid="ops-entities">{entities.toLocaleString("it-IT")}</span>
        <span className="hud-k" title={spaceWeather.credit}>Kp</span><span className="mono hud-v" style={{ color: kpColor }} data-testid="ops-kp"
          title={`Indice planetario Kp (NOAA SWPC), valore a 3 ore${kpTime ? ` delle ${kpTime.slice(11, 16)} UTC del ${kpTime.slice(0, 10)}` : ""}; i valori in diretta nel pannello Meteo spaziale`}>{kp == null ? "—" : kp.toFixed(1)}</span>
      </>}
      <span className="grow" />
      <div className="seg ops-seg" role="group" aria-label="proiezione">
        {(["globe", "flat"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={proj === p} data-testid={`ops-proj-${p}`}
            title={p === "globe" ? "Globo 3D (P)" : "Mappa piana 2D (P)"} onClick={() => ops.set({ projection: p })}>{p === "globe" ? "3D" : "2D"}</button>))}
      </div>
      <div className="seg ops-seg" role="group" aria-label="mappa di base">
        {BASES.map((b) => (
          <button key={b.id} type="button" aria-pressed={base === b.id} data-testid={`ops-base-${b.id}`} title={`${b.title} (B)`}
            onClick={() => ops.set({ base: b.id })}>{b.label}</button>))}
      </div>
      <StreetsButton />
      {!touch && <button type="button" className="ops-ic" title="Schermo intero (F)" data-testid="ops-fullscreen" onClick={fullscreen}>⛶</button>}
      {!touch && <button type="button" className="ops-ic" title="Torna al globo (R)" onClick={() => resetView(map)}>⌂</button>}
    </div>);
}

/** STRADE: the street detail's switch, with its state — loading, on (the layer is drawn), or failed (said, and off). */
function StreetsButton() {
  const on = useOps((s) => s.layers.streets);
  const st = useOps((s) => s.streetsStatus);
  const loading = on && st === "loading", err = !on && st === "error";
  return (
    <button type="button" className={`ops-ic ops-streets${loading ? " loading" : ""}${err ? " err" : ""}`} aria-pressed={on} data-testid="ops-streets"
      data-status={on ? (loading ? "loading" : st === "ready" ? "on" : st) : err ? "error" : "off"}
      title={err ? "Strade non disponibili ora: il fornitore (OpenFreeMap) non risponde. Riprova più tardi."
        : "Strade, edifici e nomi delle vie (OpenFreeMap © OpenMapTiles, dati © OpenStreetMap): una mappa di terzi, caricata solo se la scegli (T)"}
      onClick={() => ops.layer("streets")}>{loading ? "STRADE…" : err ? "STRADE ⚠" : "STRADE"}</button>);
}

/** The basemap and projection switches (the header on desktop, the tools sheet on touch layouts). */
function Modes() {
  const base = useOps((s) => s.base);
  const proj = useOps((s) => s.projection);
  return (
    <div className="ops-modes" data-testid="ops-modes">
      <div className="seg ops-seg" role="group" aria-label="proiezione">
        {(["globe", "flat"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={proj === p} data-testid={`ops-proj-${p}`} onClick={() => ops.set({ projection: p })}>{p === "globe" ? "3D" : "2D"}</button>))}
      </div>
      <div className="seg ops-seg" role="group" aria-label="mappa di base">
        {BASES.map((b) => <button key={b.id} type="button" aria-pressed={base === b.id} data-testid={`ops-base-${b.id}`} onClick={() => ops.set({ base: b.id })}>{b.label}</button>)}
      </div>
      <StreetsButton />
    </div>);
}

const GROUPS: [string, string][] = [["map", "Mappa"], ["see", "Osservare"], ["world", "Dati del mondo"], ["tools", "Strumenti"]];

function ToolRail({ touch, map }: { touch: boolean; map: MLMap }) {
  const tool = useOps((s) => s.tool);
  const palette = useOps((s) => s.palette);
  // touch layouts: the palette and the panels are layers of the workspace — Back and Esc close the open one
  useEffect(() => {
    if (!touch) return;
    const l = registerLayer({ open: () => ops.get().palette || ops.get().tool !== null,
      close: () => (ops.get().palette ? ops.palette(false) : ops.set({ tool: null })) });
    let was = false;
    const unsub = ops.subscribe(() => { const now = ops.get().palette || ops.get().tool !== null; if (now !== was) { was = now; l.changed(); } });
    return () => { unsub(); l.off(); };
  }, [touch]);
  if (!touch) return (
    <nav className="ops-rail" aria-label="strumenti" data-testid="ops-rail">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" className="ops-tool" aria-pressed={tool === t.id} data-testid={`ops-tool-${t.id}`}
          title={`${t.label}${t.key ? ` (${t.key})` : ""}`} onClick={() => ops.tool(t.id)}>
          <span aria-hidden="true">{t.icon}</span><span className="sr">{t.label}</span></button>))}
    </nav>);
  // touch: one button opens the palette; the palette is a sheet of its own, replaced by the tool chosen (never both)
  if (!palette) return tool ? null : (
    <button type="button" className="ops-rail-toggle" data-testid="ops-tools" aria-label="Strumenti" title="Strumenti" onClick={() => ops.palette(true)}>⌖</button>);
  return (
    <section className="ops-panel ops-palette ov ops-sheet" data-testid="ops-rail" aria-label="strumenti">
      <header className="ops-ph"><b>Strumenti</b><span className="grow" />
        <button type="button" className="ops-close" aria-label="Chiudi" data-testid="ops-palette-close" onClick={() => ops.palette(false)}>×</button></header>
      <div className="ops-pb">
        <Modes />
        <QuickLayers map={map} />
        {GROUPS.map(([g, name]) => (
          <div key={g} className="ops-pgroup">
            <div className="hl-h">{name}</div>
            <div className="ops-pgrid">
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <button key={t.id} type="button" className="ops-ptool" data-testid={`ops-tool-${t.id}`} title={t.label} onClick={() => ops.tool(t.id)}>
                  <span aria-hidden="true" className="ops-pico">{t.icon}</span><span>{t.short}</span></button>))}
            </div>
          </div>))}
      </div>
    </section>);
}

/** The moving layers, switched from the palette itself (they are easy to miss in the full layer list); each one says
 *  what it is: positions calculated, not observed; the ships of the AIS coverage really available (the Baltic). */
function QuickLayers({ map }: { map: MLMap }) {
  const layers = useOps((s) => s.layers);
  return (
    <div className="ops-quick" data-testid="ops-quick">
      <label className="ops-qrow"><input type="checkbox" className="ops-switch" checked={layers.orbits} onChange={() => ops.layer("orbits")} data-testid="ops-quick-orbits" />
        <span><b>Satelliti</b><small>posizioni calcolate (SGP4), non osservate</small></span></label>
      <MaritimeGroup map={map} prefix="ops-quick" />
    </div>);
}

/** MARITTIMO (physical test, 2026-10-06): ships, ports, chokepoints, cables and naval bases as separate switches, in the
 *  palette and in Livelli — each with its total, how many are in the current view, and a way to where they are. */
export const MARITIME: { k: "ais" | "ports" | "choke" | "cables" | "naval"; layer: string; label: string; note: string; go: [number, number, number]; where: string }[] = [
  { k: "ais", layer: "ops-ais", label: "Navi", note: "solo Mar Baltico (AIS Digitraffic): non è una copertura mondiale", go: [20.5, 59.3, 5.2], where: "Mar Baltico" },
  { k: "ports", layer: "ops-ports", label: "Porti", note: "IMF PortWatch: 2.000+ porti, scali giornalieri misurati", go: [12.5, 40.5, 4.6], where: "Italia e Mediterraneo" },
  { k: "choke", layer: "ops-choke", label: "Stretti marittimi", note: "IMF PortWatch: 28 stretti, transiti giornalieri misurati", go: [33, 28, 3.2], where: "Suez, Bab el-Mandeb, Hormuz" },
  { k: "cables", layer: "ops-cables", label: "Cavi sottomarini", note: "OpenStreetMap: tutto il mondo, elettrici e telecomunicazioni", go: [15, 38, 4.2], where: "Mediterraneo" },
  { k: "naval", layer: "ops-naval", label: "Basi navali", note: "OpenStreetMap: solo nome e gestore", go: [14, 41, 4.4], where: "Mediterraneo" },
];
export function MaritimeGroup({ map, prefix }: { map: MLMap; prefix: string }) {
  const layers = useOps((s) => s.layers), counts = useOps((s) => s.counts);
  const [inView, setInView] = useState<Record<string, number>>({});
  useEffect(() => {
    const look = () => {
      const o: Record<string, number> = {};
      for (const m of MARITIME) if (layers[m.k] && map.getLayer(m.layer)) o[m.k] = map.queryRenderedFeatures({ layers: [m.layer] }).length;
      setInView(o);
    };
    look();
    map.on("idle", look);
    return () => { map.off("idle", look); };
  }, [map, layers, counts]);
  return (
    <div className="ops-group" data-testid={`${prefix}-maritime`}>
      <div className="ops-group-h">Marittimo</div>
      {MARITIME.map((m) => {
        const on = layers[m.k], n = counts[m.k], v = inView[m.k];
        return (
          <div key={m.k} className="ops-mrow" data-testid={`${prefix}-mrow-${m.k}`}>
            <label className="ops-qrow"><input type="checkbox" className="ops-switch" checked={on} data-testid={`${prefix}-${m.k}`} onChange={() => {
              ops.layer(m.k);
              // touch: from the palette (which covers the map) to Livelli at half — the map with the result above, the same group below
              if (!on && prefix === "ops-quick" && innerWidth < DESK_W) ops.tool("layers");
            }} />
              <span><b>{m.label}</b>{n ? <span className="mono dim"> · {n.toLocaleString("it-IT")}</span> : null}<small>{m.note}</small></span></label>
            {on && <p className="xs ops-mstat" data-testid={`${prefix}-mstat-${m.k}`}>
              {!n ? "caricamento… (se resta vuoto, la fonte non risponde ora)"
                : v ? `${v.toLocaleString("it-IT")} nella vista attuale — tocca un elemento per sapere cos'è`
                : <>nessuno nella vista attuale <button type="button" className="xs" data-testid={`${prefix}-go-${m.k}`}
                    onClick={() => map.flyTo({ center: [m.go[0], m.go[1]], zoom: m.go[2], duration: 900 })}>Vai a {m.where}</button></>}</p>}
          </div>);
      })}
      {/* sea route: an ENGINE, not a layer — one computed route between two ports (Livelli; the palette opens it there) */}
      <div className="ops-mrow" data-testid={`${prefix}-mrow-searoute`}>
        {prefix === "ops-layer" ? <Suspense fallback={null}><SeaRoutePanel map={map} /></Suspense>
          : <button type="button" className="xs" data-testid={`${prefix}-searoute`} onClick={() => { (window as any).__nexumSeaOpen = true; ops.tool("layers"); setTimeout(() => dispatchEvent(new CustomEvent("nexum:searoute")), 120); }}>
            ⚓ Rotta marittima tra due porti</button>}
      </div>
    </div>);
}

/** Bottom bar: cursor coordinates and the place under it (offline: NEXUM's countries and place names), zoom, scale. */
function Footer({ map }: { map: MLMap }) {
  const coords = useRef<HTMLSpanElement>(null);
  const place = useRef<HTMLSpanElement>(null);
  const [view, setView] = useState({ z: map.getZoom(), lat: map.getCenter().lat });
  useEffect(() => {
    let raf = 0, last = 0;
    const move = (e: any) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (coords.current) coords.current.textContent = fmtLatLng(e.lngLat.lat, e.lngLat.lng);
        const t = performance.now();
        if (t - last < 250 || !place.current) return;
        last = t;
        const land = map.queryRenderedFeatures(e.point, { layers: ["basemap-land"] })[0];
        const p: any = land?.properties ?? {};
        const name = p.NAME_IT ?? p.name_it ?? p.NAME ?? p.name ?? p.ADMIN ?? "";
        place.current.textContent = name || (land ? "" : "mare aperto");
      });
    };
    const zoom = () => setView({ z: map.getZoom(), lat: map.getCenter().lat });
    map.on("mousemove", move);
    map.on("moveend", zoom);
    return () => { map.off("mousemove", move); map.off("moveend", zoom); };
  }, [map]);
  const sc = scaleFor(view.z, view.lat);
  return (
    <div className="ops-foot" data-testid="ops-foot">
      <span className="mono" ref={coords} data-testid="ops-cursor">—</span>
      <span className="dim" ref={place} data-testid="ops-place" />
      <Ticker />
      <span className="mono dim">Z {view.z.toFixed(1)}</span>
      <span className="ops-scale" data-testid="ops-scale"><span style={{ width: `${Math.round(sc.px)}px` }} />{sc.label}</span>
    </div>);
}

/** The ticker: the recent events that matter in NEXUM (the same as "Cosa sta succedendo"), each one opens its card. */
function Ticker() {
  const h = useHighlights();
  const d: any = h.data?.data;
  const items = d ? [...(d.recent ?? []), ...(d.strongest ?? [])].slice(0, 12) : [];
  if (!items.length) return <span className="grow" />;
  return (
    <span className="grow ops-ticker" data-testid="ops-ticker"><span className="ops-ticker-run">
      {[...items, ...items].map((r: any, i: number) => {
        const e = store.entity(r.$ref);
        return <button key={i} type="button" className="linklike xs" tabIndex={i < items.length ? 0 : -1} onClick={() => store.select(r.$ref, "ops-ticker")}>
          ▸ {typeLabelOf(e?.type ?? "")}{head(r.head) ? ` ${head(r.head)}` : ""} · {e?.label}</button>;
      })}</span></span>);
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function resetView(map: MLMap) {
  map.easeTo({ center: [12, 25], zoom: 1.4, pitch: 0, bearing: 0, duration: 600 });
}

/** The geomagnetic Kp of the header: from NEXUM's own published table (NOAA SWPC, fetched by the build; O2), with its
 *  time; the live values are in the space panel, on request. */
function useKp() {
  useEffect(() => {
    let dead = false;
    call<any>("/tables/spaceweather", undefined, { channel: "kp" }).then((r) => {
      const n = r.data?.notes ?? {};
      if (!dead && Number.isFinite(n.kp_latest)) ops.set({ kp: n.kp_latest, kpTime: n.kp_time_utc ?? null });
    }).catch(() => {});
    return () => { dead = true; };
  }, []);
}

/** Keyboard: the operational tools (the workspace keeps / [ ] W M G Esc). */
function useShortcuts(map: MLMap) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") { if (ops.get().tool) { ops.set({ tool: null }); e.stopPropagation(); } return; }
      if (k === "f" || k === "F") fullscreen();
      else if (k === "r" || k === "R") resetView(map);
      else if (k === "p" || k === "P") ops.set({ projection: ops.get().projection === "globe" ? "flat" : "globe" });
      else if (k === "b" || k === "B") { const order: BaseMode[] = ["map", "sat", "today"]; ops.set({ base: order[(order.indexOf(ops.get().base) + 1) % 3] }); }
      else if (k === "o" || k === "O") ops.layer("orbits");
      else if (k === "t" || k === "T") ops.layer("streets");
      else {
        const hit = TOOLS.find((x) => x.key && (x.key === k || x.key === k.toUpperCase()));
        if (hit) ops.tool(hit.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [map]);
}

export const opsSelect = (id: string) => store.select(id, "ops");
