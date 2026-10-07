// SKY (2026-10-04): the sky seen from one point — a point of the map, a place, an element, or (only if the person asks,
// and never stored or sent) the device's own position. The published orbital catalogue propagated in the browser:
// azimuth, elevation and range of what is above the horizon, the next passes of the chosen object, a time scrub.
// Every position is CALCULATED from elements of a stated epoch — never observed, never "live". The Sun from NEXUM's
// own astronomy (the same as the map's illumination). Air traffic: BLOCKED (no lawful, free, static-site ADS-B source).

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import OPS from "../config/ops.json";
import { subsolar, solarAltitude } from "../lib/sun";
import { ops, useOps } from "./state";
import { bearing, fmtLatLng } from "./geo";
import { familyColor, familyLabel, loadOrbits, passesOf, skyAt, type OrbitTable } from "./orbits";

const NOTABLE = new Set(OPS.orbits.notable);
const fmtT = (t: number) => new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const fmtD = (t: number) => new Date(t).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const COMPASS8 = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const dir = (az: number) => COMPASS8[Math.round(az / 45) % 8];

export default function Sky({ map }: { map: MLMap }) {
  const point = useOps((s) => s.point);
  const [obs, setObs] = useState<{ lat: number; lng: number; label: string; device?: boolean } | null>(
    point ? { lat: point.lat, lng: point.lng, label: point.label || fmtLatLng(point.lat, point.lng, 3) } : null);
  useEffect(() => { if (point) setObs({ lat: point.lat, lng: point.lng, label: point.label || fmtLatLng(point.lat, point.lng, 3) }); }, [point?.lat, point?.lng]);
  const [offsetMin, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [all, setAll] = useState(false);
  const [tab, setTab] = useState<OrbitTable | null>(null);
  const [above, setAbove] = useState<[number, number, number, number][]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [base, setBase] = useState(() => Date.now());
  const t = base + offsetMin * 60_000;
  useEffect(() => { loadOrbits().then(setTab, () => setTab(null)); }, []);
  // the clock: real time (every 5 s) or a scrub; play advances one minute per tick
  useEffect(() => { const i = setInterval(() => setBase(Date.now()), 5000); return () => clearInterval(i); }, []);
  useEffect(() => { if (!playing) return; const i = setInterval(() => setOffset((m) => (m >= 720 ? -720 : m + 2)), 200); return () => clearInterval(i); }, [playing]);
  useEffect(() => {
    if (!obs || !tab) return;
    let live = true;
    skyAt(obs, t, 0).then((r) => live && setAbove(r));
    return () => { live = false; };
  }, [obs?.lat, obs?.lng, tab, Math.floor(t / 2000)]);
  const shown = useMemo(() => (tab ? above.filter(([id]) => all || NOTABLE.has(tab.byId.get(id)?.family ?? "")) : []), [above, all, tab]);
  const sun = useMemo(() => {
    if (!obs) return null;
    const s = subsolar(t);
    return { el: solarAltitude(obs.lat, obs.lng, s), az: bearing([obs.lng, obs.lat], [s.lon, s.lat]) };
  }, [obs?.lat, obs?.lng, Math.floor(t / 60000)]);
  const device = () => {
    setGeoErr(null);
    if (!navigator.geolocation) { setGeoErr("posizione del dispositivo non disponibile in questo browser"); return; }
    const geo = navigator.geolocation;
    geo.getCurrentPosition(
      (p) => setObs({ lat: p.coords.latitude, lng: p.coords.longitude, label: "la tua posizione (solo in questo browser, non salvata)", device: true }),
      (e) => setGeoErr(e.code === 1 ? "permesso negato" : "posizione non disponibile"), { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 });
  };
  const fromView = () => { const c = map.getCenter(); setObs({ lat: c.lat, lng: c.lng, label: `centro della mappa · ${fmtLatLng(c.lat, c.lng, 3)}` }); };
  return (
    <div data-testid="ops-sky">
      <p className="xs">Osservatore: <b data-testid="ops-sky-observer">{obs ? obs.label : "nessuno"}</b></p>
      <div className="row xs">
        <button type="button" className="xs" onClick={fromView} data-testid="ops-sky-center">Centro della mappa</button>
        <button type="button" className="xs" data-testid="ops-sky-pick" onClick={() => ops.set({ pick: "point", sheet: innerWidth < 1120 ? "peek" : ops.get().sheet })} title="Tocca un punto sulla mappa (o clic destro)">⌖ Tocca la mappa</button>
        <button type="button" className="xs" onClick={device} data-testid="ops-sky-device">La mia posizione…</button>
      </div>
      {geoErr && <p className="xs warn">{geoErr}</p>}
      {!tab && <p className="xs dim">Carico il catalogo orbitale…</p>}
      {obs && tab && <>
        <SkyPlot items={shown} tab={tab} sun={sun} sel={sel} onPick={setSel} />
        <div className="row xs ops-scrub">
          <button type="button" className="xs" onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? "❚❚" : "▶"}</button>
          <input type="range" min={-720} max={720} step={1} value={offsetMin} onChange={(e) => { setPlaying(false); setOffset(+e.target.value); }} className="grow" data-testid="ops-sky-scrub" aria-label="ora" />
          <span className="mono">{fmtD(t)}</span>
          {offsetMin !== 0 && <button type="button" className="xs" onClick={() => { setOffset(0); setPlaying(false); }}>adesso</button>}
        </div>
        <p className="xs" data-testid="ops-sky-count"><b>{shown.length}</b> oggetti sopra l'orizzonte{all ? "" : " (principali)"} · {above.length} in tutto ·
          {sun ? ` Sole ${sun.el >= 0 ? `alto ${sun.el.toFixed(0)}°` : `sotto l'orizzonte (${sun.el.toFixed(0)}°)`} a ${dir(sun.az)}` : ""}</p>
        <label className="row xs"><input type="checkbox" checked={all} onChange={() => setAll(!all)} /> Tutti (anche costellazioni commerciali e detriti)</label>
        <p className="xs warn">POSIZIONI CALCOLATE (propagate con SGP4 dagli elementi CelesTrak dell'epoca {String(tab.epochMax ?? "").slice(0, 16).replace("T", " ")} UTC), non osservate in diretta.</p>
        <table className="ops-table xs" data-testid="ops-sky-list"><thead><tr><th>Oggetto</th><th>Az</th><th>El</th><th>Distanza</th></tr></thead><tbody>
          {[...shown].sort((a, b) => b[2] - a[2]).slice(0, 40).map(([id, az, el, r]) => {
            const row = tab.byId.get(id)!;
            return (<tr key={id} className={sel === id ? "sel" : ""} onClick={() => setSel(id)}>
              <td><span className="ops-swatch" style={{ background: familyColor(row.family) }} />{row.name}</td>
              <td className="mono num">{az.toFixed(0)}° {dir(az)}</td><td className="mono num">{el.toFixed(0)}°</td><td className="mono num">{Math.round(r).toLocaleString("it-IT")} km</td></tr>);
          })}</tbody></table>
        {sel != null && <Passes id={sel} tab={tab} obs={obs} t0={t} />}
      </>}
      <p className="xs warn" data-testid="ops-sky-airtraffic">{OPS.orbits.airTraffic}</p>
      <p className="xs faint">{OPS.orbits.credit}. La posizione del dispositivo, se la chiedi, resta in questa pagina: non è salvata né inviata.</p>
    </div>);
}

function Passes({ id, tab, obs, t0 }: { id: number; tab: OrbitTable; obs: { lat: number; lng: number }; t0: number }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof passesOf>> | null>(null);
  const hour = Math.floor(t0 / 3600_000);
  useEffect(() => { let live = true; setList(null); passesOf(id, obs, t0, 24, 10).then((r) => live && setList(r)); return () => { live = false; }; }, [id, obs.lat, obs.lng, hour]);
  const row = tab.byId.get(id)!;
  return (
    <div data-testid="ops-sky-passes">
      <div className="hl-h">{row.name} · {familyLabel(row.family)} · prossimi passaggi (24 h, elevazione massima ≥ 10°)</div>
      <button type="button" className="xs" onClick={() => ops.set({ orbit: id, layers: { ...ops.get().layers, orbits: true } })}>Mostra l'orbita sulla mappa</button>
      {!list ? <p className="xs dim">Calcolo…</p> : !list.length ? <p className="xs dim">Nessun passaggio utile nelle prossime 24 ore.</p> :
        <table className="ops-table xs"><thead><tr><th>Sorge</th><th>Culmina</th><th>Tramonta</th></tr></thead><tbody>
          {list.map((p) => <tr key={p.rise}><td className="mono">{fmtT(p.rise)} {dir(p.azRise)}</td><td className="mono">{fmtT(p.max)} · {p.maxEl.toFixed(0)}°</td><td className="mono">{fmtT(p.set)} {dir(p.azSet)}</td></tr>)}
        </tbody></table>}
    </div>);
}

/** The sky as a polar plot: zenith at the centre, the horizon on the rim, north up, east to the left (as seen
 *  looking up). Canvas 2D: thousands of points without a 3D engine. */
function SkyPlot({ items, tab, sun, sel, onPick }: { items: [number, number, number, number][]; tab: OrbitTable; sun: { el: number; az: number } | null;
  sel: number | null; onPick: (id: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const S = 300;
  const xy = (az: number, el: number) => {
    const r = ((90 - el) / 90) * (S / 2 - 16);
    const a = (az * Math.PI) / 180;
    return [S / 2 - r * Math.sin(a), S / 2 - r * Math.cos(a)] as const;   // east on the left, looking up
  };
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = devicePixelRatio || 1;
    c.width = S * dpr; c.height = S * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const day = sun && sun.el > -6;
    g.fillStyle = day ? "#16222C" : "#05080B";
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2B343A"; g.lineWidth = 1;
    for (const el of [0, 30, 60]) { g.beginPath(); g.arc(S / 2, S / 2, ((90 - el) / 90) * (S / 2 - 16), 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#8A949A"; g.font = "11px ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [az, l] of [[0, "N"], [90, "E"], [180, "S"], [270, "O"]] as const) { const [x, y] = xy(az, -9); g.fillText(l, x, y); }
    if (sun && sun.el > -2) { const [x, y] = xy(sun.az, Math.max(0, sun.el)); g.fillStyle = "#F2C14E"; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
    for (const [id, az, el] of items) {
      const row = tab.byId.get(id);
      if (!row) continue;
      const [x, y] = xy(az, el);
      const big = NOTABLE.has(row.family);
      g.fillStyle = familyColor(row.family);
      g.beginPath(); g.arc(x, y, id === sel ? 5 : big ? 2.6 : 1.4, 0, Math.PI * 2); g.fill();
      if (id === sel || row.family === "station") {
        g.fillStyle = "#D6DBDE"; g.textAlign = "left"; g.fillText(row.name.slice(0, 18), x + 6, y - 6);
        if (id === sel) { g.strokeStyle = "#E0A640"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke(); }
      }
    }
  }, [items, sun, sel, tab]);
  const click = (e: { clientX: number; clientY: number; target: EventTarget }) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * S, py = ((e.clientY - r.top) / r.height) * S;
    let best: [number, number] | null = null;
    for (const [id, az, el] of items) { const [x, y] = xy(az, el); const d = Math.hypot(x - px, y - py); if (d < 12 && (!best || d < best[1])) best = [id, d]; }
    if (best) onPick(best[0]);
  };
  return <canvas ref={cv} className="ops-skyplot" style={{ width: S, height: S }} onClick={click} data-testid="ops-sky-plot" aria-label="cielo" />;
}
