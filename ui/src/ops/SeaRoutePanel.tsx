// ROTTA MARITTIMA TRA DUE PORTI (2026-10-07, stabilization): SeaRoute is an ENGINE, not a layer. The person chooses a
// departure and an arrival port (NEXUM's ports: NGA World Port Index); NEXUM computes, in this page, the shortest route
// of the model (Eurostat SeaRoute's network) and draws ONLY that route — one line (searouteLayer.ts). Said as what it
// is: a computed path, nothing observed at sea, not AIS traffic, no frequency. Then what NEXUM knows along it, with its sources:
// the two ports (their own NEXUM cards), the canals and straits the model marks, the events NEXUM documents within 50 km
// (nearness only — never a risk or a cause). Closed: the line, its handlers and the model's graph are released.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Map as MLMap } from "maplibre-gl";
import OPS from "../config/ops.json";
import { call } from "../lib/api";
import { store } from "../store";
import { ops } from "./state";
import { graph, km, route, type SeaGraph, type SeaRoute } from "./searoute";
import { clearRoute, showRoute } from "./searouteLayer";

type Port = { id: string; label: string; c: [number, number] };
type Near = { id: string; label: string; type: string; t: number | null; km: number };
type Avoid = { suez: boolean; panama: boolean; arctic: boolean };
interface SeaState { open: boolean; a: Port | null; b: Port | null; avoid: Avoid; res: SeaRoute | null | "none" | "busy"; near: Near[] | null }
const R = OPS.routes as any;
const NEAR_KM = 50, NEAR_SHOW = 8;
const INIT: SeaState = { open: false, a: null, b: null, avoid: { suez: false, panama: false, arctic: false }, res: null, near: null };

// the route's state outlives the panel (Livelli closed, the route stays on the map until it is closed)
let st: SeaState = INIT;
const subs = new Set<() => void>();
const set = (p: Partial<SeaState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
const useSea = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st);

// the model's network: built only to compute, released when the route is closed
let net: Promise<SeaGraph> | null = null;
const loadNet = () => (net ??= call<any>("/tables/searoutes", undefined, { channel: "searoutes" }).then((r) => {
  const F = r.data.fields as string[], P = F.indexOf("pass"), C = F.indexOf("course");
  return graph((r.data.rows as any[]).map((x) => [x[P] ?? "", 0, x[C]]));
}).catch((e) => { net = null; throw e; }));

/** Closes the route: nothing of it is left (line, handlers, graph, results). */
export function closeSeaRoute() { clearRoute(); net = null; set({ ...INIT }); }

/** The events NEXUM documents near the route (in the period being observed): its own records, by distance. */
async function eventsNear(line: number[][]): Promise<Near[]> {
  // points every ~25 km along the route; the route cut into a few boxes for the map projection
  const pts: number[][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const d = km(line[i - 1], line[i]), n = Math.max(1, Math.ceil(d / 25));
    for (let k = 1; k <= n; k++) pts.push([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * k / n, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * k / n]);
  }
  const chunks = Math.min(10, Math.max(1, Math.ceil(pts.length / 60)));
  const per = Math.ceil(pts.length / chunks), found = new Map<string, Near>();
  for (let c = 0; c < chunks; c++) {
    const part = pts.slice(c * per, (c + 1) * per + 1);
    if (!part.length) continue;
    const xs = part.map((p) => p[0]), ys = part.map((p) => p[1]), pad = 0.5;
    const r = await call<any>("/projections/map", { s: { ...store.get().scope, viewport: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad], z: 8 },
      b: { max_items: 400, lod: "refs" } }, { channel: `sea-near-${c}` }).catch(() => null);
    if (!r) continue;
    const d = store.normalize(r.data);
    for (const x of (d.items ?? []) as any[]) {
      const e = store.entity(x.$ref);
      if (!e?.point || e.kind !== "event" || found.has(e.id)) continue;
      let best = Infinity;
      for (const p of part) { const k = km(p, e.point); if (k < best) best = k; }
      if (best <= NEAR_KM) found.set(e.id, { id: e.id, label: e.label ?? e.id, type: e.type ?? "", t: e.t ?? null, km: best });
    }
  }
  return [...found.values()].sort((a, b) => a.km - b.km);
}

async function compute(map: MLMap) {
  const { a, b, avoid } = st;
  if (!a || !b) return;
  set({ res: "busy", near: null });
  const g = await loadNet().catch(() => null);
  if (!g) { set({ res: "none" }); return; }
  const av = new Set<string>([...(avoid.suez ? ["suez"] : []), ...(avoid.panama ? ["panama"] : []), ...(avoid.arctic ? [] : ["northwest", "northeast"])]);
  const r = route(g, a.c, b.c, av);
  if (!r) { clearRoute(); set({ res: "none" }); return; }
  showRoute(map, r.line, () => { (window as any).__nexumSeaOpen = true; ops.tool("layers"); setTimeout(() => dispatchEvent(new CustomEvent("nexum:searoute")), 120); });
  const xs = r.line.map((p) => p[0]), ys = r.line.map((p) => p[1]);
  map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, duration: 800, maxZoom: 8 });
  set({ res: r });
  const near = await eventsNear(r.line).catch(() => []);
  if (st.res === r) set({ near });
}

function PortPick({ label, value, onPick, testid }: { label: string; value: Port | null; onPick: (p: Port | null) => void; testid: string }) {
  const [q, setQ] = useState(value?.label ?? "");
  const [hits, setHits] = useState<{ id: string; label: string }[]>([]);
  const seq = useRef(0);
  useEffect(() => { setQ(value?.label ?? ""); }, [value?.id]);
  useEffect(() => {
    if ((value && q === value.label) || q.trim().length < 2) { setHits([]); return; }
    const my = ++seq.current;
    const t = setTimeout(() => call<any>("/search", { q, s: { types: ["transport.port"] }, b: { max_items: 8 } }, { channel: `sea-${testid}` })
      .then((r) => { if (my === seq.current) setHits((r.data.groups ?? []).flatMap((g: any) => g.items).slice(0, 8)); }, () => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const pick = async (h: { id: string; label: string }) => {
    setHits([]); setQ(h.label);
    const r = await call<any>(`/entities/${h.id}`, undefined, { channel: `sea-ent-${h.id}` });
    const c = r.data?.geometry?.coordinates;
    if (Array.isArray(c)) onPick({ id: h.id, label: h.label, c: [c[0], c[1]] });
  };
  return (
    <div className="sea-pick">
      <label className="xs dim">{label}</label>
      <input type="search" value={q} placeholder="nome del porto" data-testid={testid} onChange={(e) => { setQ(e.target.value); if (value) onPick(null); }} />
      {hits.length > 0 && <ul className="ops-list sea-hits" data-testid={`${testid}-hits`}>{hits.map((h) => (
        <li key={h.id}><button type="button" className="linklike" onClick={() => pick(h)}>⚓ {h.label}</button></li>))}</ul>}
    </div>);
}

export default function SeaRoutePanel({ map }: { map: MLMap }) {
  const s = useSea();
  const panelEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // opened from the palette or from a tap on the route, even before this part had loaded
    const w = window as any;
    if (w.__nexumSeaOpen) { w.__nexumSeaOpen = false; set({ open: true }); }
    const f = () => { w.__nexumSeaOpen = false; set({ open: true }); };
    addEventListener("nexum:searoute", f);
    return () => removeEventListener("nexum:searoute", f);
  }, []);
  useEffect(() => { if (s.open) panelEl.current?.scrollIntoView({ block: "nearest" }); }, [s.open]);
  useEffect(() => { if (st.a && st.b) compute(map); else if (st.res) { clearRoute(); set({ res: null, near: null }); } /* eslint-disable-next-line */ }, [s.a?.id, s.b?.id, s.avoid.suez, s.avoid.panama, s.avoid.arctic]);
  if (!s.open) return (
    <button type="button" className="xs" data-testid="searoute-open" onClick={() => set({ open: true })}>⚓ Rotta marittima tra due porti
      <small className="dim"> · un percorso calcolato, non traffico osservato</small></button>);
  const r = typeof s.res === "object" ? s.res : null;
  const types = store.get().types;
  return (
    <div className="sea-panel" data-testid="searoute-panel" data-route={r ? "active" : "none"} ref={panelEl}>
      <div className="row"><b className="grow">Rotta marittima tra due porti</b>
        <button type="button" className="xs" aria-label="Chiudi la rotta" data-testid="searoute-close" onClick={closeSeaRoute}>×</button></div>
      <PortPick label="Porto di partenza" value={s.a} onPick={(a) => set({ a })} testid="searoute-from" />
      <PortPick label="Porto di arrivo" value={s.b} onPick={(b) => set({ b })} testid="searoute-to" />
      <div className="row xs" style={{ flexWrap: "wrap", gap: "2px 10px" }}>
        <label><input type="checkbox" checked={s.avoid.suez} onChange={() => set({ avoid: { ...s.avoid, suez: !s.avoid.suez } })} data-testid="searoute-avoid-suez" /> evita Suez</label>
        <label><input type="checkbox" checked={s.avoid.panama} onChange={() => set({ avoid: { ...s.avoid, panama: !s.avoid.panama } })} /> evita Panama</label>
        <label><input type="checkbox" checked={s.avoid.arctic} onChange={() => set({ avoid: { ...s.avoid, arctic: !s.avoid.arctic } })} /> consenti i passaggi artici</label>
      </div>
      {s.res === "busy" && <p className="xs dim">calcolo sul modello…</p>}
      {s.res === "none" && <p className="xs warn" data-testid="searoute-none">Nessuna rotta: uno dei due porti è lontano dalla rete del modello (oltre 150 km dal mare aperto) o le esclusioni scelte la impediscono.</p>}
      {r && <div data-testid="searoute-result">
        <p className="news-status"><b>ROTTA MODELLATA</b> · un percorso calcolato: non una nave osservata, non traffico AIS, nessuna frequenza</p>
        <p><b>{s.a?.label} → {s.b?.label}</b>: <span data-testid="searoute-km">{Math.round(r.km).toLocaleString("it-IT")} km</span> · {Math.round(r.km / 1.852).toLocaleString("it-IT")} miglia nautiche</p>
        <dl className="news-dl xs">
          <dt>Partenza</dt><dd><button type="button" className="linklike" data-testid="searoute-port-a" onClick={() => store.select(s.a!.id, "searoute")}>{s.a?.label}</button></dd>
          <dt>Arrivo</dt><dd><button type="button" className="linklike" data-testid="searoute-port-b" onClick={() => store.select(s.b!.id, "searoute")}>{s.b?.label}</button></dd>
          {r.passes.length > 0 && <><dt>Passaggi</dt><dd data-testid="searoute-passes">{r.passes.map((x) => R.passes[x] ?? x).join(" · ")}</dd></>}
        </dl>
        <div className="sea-near" data-testid="searoute-near">
          <div className="conn-h">Eventi documentati da NEXUM lungo la rotta</div>
          {s.near == null ? <p className="xs dim">cerco nel periodo osservato…</p>
            : !s.near.length ? <p className="xs dim" data-testid="searoute-near-none">Nessun evento documentato entro {NEAR_KM} km dalla rotta nel periodo osservato.</p>
            : <><p className="xs dim">{s.near.length} entro {NEAR_KM} km nel periodo osservato — vicinanza geografica, non un rischio né una causa. Ognuno apre la sua scheda (fonti, prove, Perché?).</p>
              <ul className="ov-some">{s.near.slice(0, NEAR_SHOW).map((x) => (
                <li key={x.id} data-testid="searoute-near-item"><button type="button" className="linklike" onClick={() => store.select(x.id, "searoute")}>{x.label}</button>
                  <span className="xs dim"> · {types.get(x.type)?.label ?? x.type}{x.t ? ` · ${new Date(x.t).toLocaleDateString("it-IT")}` : ""} · {Math.round(x.km)} km</span></li>))}</ul></>}
        </div>
        <details className="news-tech" data-testid="searoute-tech">
          <summary>Fonte, metodo e licenza</summary>
          <dl className="news-dl xs">
            <dt>Calcolo</dt><dd>Il percorso più breve sulla rete del modello (algoritmo di Dijkstra), calcolato in questa pagina: nulla viene inviato. Porti agganciati al punto di rete più vicino ({Math.round(r.snapA)} km e {Math.round(r.snapB)} km).</dd>
            <dt>Modello</dt><dd>{R.method}</dd>
            <dt>Periodo</dt><dd>{R.period}</dd>
            <dt>Licenza</dt><dd>{R.licence} <a href="/licenses/EUPL-1.2.txt" target="_blank" rel="noopener" data-testid="searoute-eupl">Testo EUPL-1.2</a></dd>
            <dt>Fonte</dt><dd><a href={R.repo} target="_blank" rel="noopener noreferrer">Eurostat SeaRoute ↗</a> · porti: NGA World Port Index</dd>
          </dl>
        </details>
      </div>}
    </div>);
}
