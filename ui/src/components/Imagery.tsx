// OSSERVA → IMMAGINI (World Intelligence, 2026-10-03): Earth-observation imagery of a place or an event, asked by the
// browser to the public services ONLY when the person asks (never preloaded, never stored, never proxied). Every image is
// said as what it is: product · platform/sensor · acquisition time (read from the service, never invented) · age ·
// nominal resolution · source — and its class: QUASI IN TEMPO REALE (geostationary, minutes old), ULTIMA DISPONIBILE
// (the latest daily or 30 m acquisition), STORICA (an acquisition of a past date). Never "live".
// The products (services, layers, platforms, attributions) are data: src/config/imagery.json — geostationary views by
// longitude (10 min), the daily true-colour view (with an overlay per element type where declared), the 30 m view.
// A service answers an empty image where it has no data: the "Data-Present" header (GIBS) or the size/type of the answer
// (EUMETView) is checked, and an empty frame is never shown as an observation.

import { useEffect, useMemo, useState } from "react";
import { S } from "../lib/strings";
import { solarAltitude, subsolar } from "../lib/sun";
import { call } from "../lib/api";
import { store } from "../store";
import CFG from "../config/imagery.json";

type Box = [number, number, number, number];   // west, south, east, north
type Cls = "nrt" | "latest" | "historical";
interface Product { key: string; label: string; sensor: string; res: string; source: string; attribution: string; cls: Cls;
  kind: "geo" | "daily" | "hls"; layer?: string; eumet?: string; overlay?: string }
interface Frame { url: string; at: string; product: Product; note?: string }

const C = CFG as any;
const WVS: string = C.wvs, EUMET: string = C.eumet, CMR: string = C.cmr, GIBS_ATTR: string = C.gibs_attr;

function bboxOfGeom(g: any): Box | null {
  let w = 180, s = 90, e = -180, n = -90, any = false;
  const walk = (c: any) => {
    if (typeof c?.[0] === "number") { any = true; w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g?.coordinates);
  return any ? [w, s, e, n] : null;
}

/** The box asked of a service: around a point (by product scale), or the area clamped to a readable size. */
function boxFor(b: Box, half: number): Box {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const hw = Math.max(half, Math.min((b[2] - b[0]) / 2 * 1.08, 30)), hh = Math.max(half * 0.75, Math.min((b[3] - b[1]) / 2 * 1.08, 22));
  const s = Math.max(-85, cy - hh), n = Math.min(85, cy + hh);
  return [Math.max(-180, cx - hw), s, Math.min(180, cx + hw), n];
}
const size = (b: Box) => {
  const ar = Math.max(0.4, Math.min(2.5, (b[2] - b[0]) / Math.max(0.01, b[3] - b[1])));
  return ar >= 1 ? [768, Math.round(768 / ar)] : [Math.round(768 * ar), 768];
};
const iso10 = (ms: number) => new Date(Math.floor(ms / 600_000) * 600_000).toISOString().slice(0, 16) + ":00Z";
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The geostationary product watching a longitude (and whether its visible view is lit there now). */
function geoProduct(lon: number, lat: number, at: number): Product | null {
  if (Math.abs(lat) > 72) return null;
  const lit = solarAltitude(lat, lon, subsolar(at)) > 5;
  const hit = Object.entries(C.geo as Record<string, any>).find(([, g]) => lon >= g.lon[0] && lon <= g.lon[1]);
  if (!hit) return null;
  const [key, g] = hit, v = lit ? g.day : g.night;
  return { key, label: v.label, sensor: g.sensor, res: v.res, source: g.source, attribution: g.attribution, cls: "nrt", kind: "geo",
    layer: v.layer, eumet: v.eumet };
}

async function gibs(layers: string, time: string, b: Box): Promise<{ url: string; at: string } | null> {
  const [w, h] = size(b);
  const u = `${WVS}?REQUEST=GetSnapshot&TIME=${encodeURIComponent(time)}&BBOX=${b[1].toFixed(3)},${b[0].toFixed(3)},${b[3].toFixed(3)},${b[2].toFixed(3)}` +
    `&CRS=EPSG:4326&LAYERS=${layers},${C.coastlines}&WRAP=day,x&FORMAT=image/jpeg&WIDTH=${w}&HEIGHT=${h}`;
  const r = await fetch(u, { referrerPolicy: "no-referrer", credentials: "omit" });
  if (!r.ok) return null;
  if ((r.headers.get("data-present") ?? "").toLowerCase() === "false") return null;    // no data for that time and place
  const blob = await r.blob();
  if (!blob.type.startsWith("image/") || blob.size < 3000) return null;
  return { url: URL.createObjectURL(blob), at: r.headers.get("acquisition-time") ?? time };
}

async function eumet(layer: string, time: string, b: Box): Promise<{ url: string; at: string } | null> {
  const [w, h] = size(b);
  const u = `${EUMET}?service=WMS&request=GetMap&version=1.3.0&crs=EPSG:4326&styles=&format=image/jpeg&layers=${layer}` +
    `&bbox=${b[1].toFixed(3)},${b[0].toFixed(3)},${b[3].toFixed(3)},${b[2].toFixed(3)}&width=${w}&height=${h}&time=${encodeURIComponent(time)}`;
  const r = await fetch(u, { referrerPolicy: "no-referrer", credentials: "omit" });
  if (!r.ok) return null;
  const blob = await r.blob();
  if (!blob.type.startsWith("image/") || blob.size < 3000) return null;               // an XML exception or an empty frame
  return { url: URL.createObjectURL(blob), at: time };
}

/** The most recent frame of a geostationary product at or before `from` (stepping back by its 10-minute cadence). */
async function geoFrame(p: Product, b: Box, from: number, tries = 4): Promise<Frame | null> {
  for (let k = 0; k < tries; k++) {
    const t = iso10(from - k * 600_000);
    const f = p.eumet ? await eumet(p.eumet, t, b) : await gibs(p.layer!, t, b);
    if (f) return { ...f, product: p };
  }
  return null;
}

async function dailyFrame(p: Product, b: Box, from: number, tries = 3): Promise<Frame | null> {
  for (let k = 0; k < tries; k++) {
    const t = day(from - k * 86_400_000);
    const f = await gibs(p.overlay ? `${p.layer},${p.overlay}` : p.layer!, t, b);
    if (f) return { ...f, at: f.at.length > 10 ? f.at : t, product: p };
  }
  return null;
}

/** HLS 30 m: the newest acquisitions over the point (NASA CMR), the least cloudy of the recent ones. */
async function hlsFrame(p: Product, lon: number, lat: number, b: Box, before: number): Promise<Frame | null> {
  const end = new Date(before).toISOString();
  const start = new Date(before - 40 * 86_400_000).toISOString();
  const cands: { t: string; cloud: number; layer: string }[] = [];
  for (const [sn, layer] of (C.fine.collections as string[][]).map((x) => [x[0], x[1]])) {
    const r = await fetch(`${CMR}?short_name=${sn}&point=${lon.toFixed(4)},${lat.toFixed(4)}&temporal=${start},${end}&sort_key=-start_date&page_size=12`,
      { referrerPolicy: "no-referrer", credentials: "omit" }).catch(() => null);
    if (!r?.ok) continue;
    const d = await r.json().catch(() => null);
    for (const g of d?.feed?.entry ?? []) cands.push({ t: g.time_start, cloud: Number(g.cloud_cover ?? 100), layer });
  }
  cands.sort((a, b2) => (a.cloud < 40 ? 0 : 1) - (b2.cloud < 40 ? 0 : 1) || b2.t.localeCompare(a.t));
  for (const c of cands.slice(0, 3)) {
    const f = await gibs(c.layer, c.t.slice(0, 10), b);
    const col = (C.fine.collections as string[][]).find((x) => x[1] === c.layer)!;
    if (f) return { ...f, at: c.t, product: { ...p, sensor: col[2], attribution: col[3] },
      note: S.sat.cloud(Math.round(c.cloud)) };
  }
  return null;
}

const ageText = (at: string) => {
  if (at.length === 10) {        // the service gives the day only: its age in days, never an invented hour
    const days = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(at)) / 86_400_000);
    return days <= 0 ? S.sat.today : days === 1 ? S.sat.yesterday : S.sat.ageD(days);
  }
  const ms = Date.now() - Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60_000);
  return min < 120 ? S.sat.ageMin(Math.max(0, min)) : min < 48 * 60 ? S.sat.ageH(Math.round(min / 60)) : S.sat.ageD(Math.round(min / 1440));
};

export function ImageryBlock({ id, geometry, label, when }: { id: string; geometry: any; label: string; when?: number | null }) {
  const e = store.entity(id);
  const b0 = useMemo(() => bboxOfGeom(geometry) ?? (e?.point ? [e.point[0], e.point[1], e.point[0], e.point[1]] as Box : null), [geometry, e?.point]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [none, setNone] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  useEffect(() => { setFrame(null); setNone(null); setBusy(null); setOffset(0); }, [id]);
  if (!b0) return null;
  const cx = (b0[0] + b0[2]) / 2, cy = (b0[1] + b0[3]) / 2;
  const small = b0[2] - b0[0] < 0.5 && b0[3] - b0[1] < 0.5;
  const past = when != null && Date.now() - when > 3 * 86_400_000;      // an event of a past date: its day, said as historical
  const ref = past ? when! : Date.now();
  const geoP = past ? null : geoProduct(cx, cy, ref);
  const D = C.daily, F = C.fine;
  const daily: Product = { key: "viirs", label: D.label, sensor: D.sensor, res: D.res, source: D.source, attribution: GIBS_ATTR,
    cls: past ? "historical" : "latest", kind: "daily", layer: D.layer, overlay: (D.overlays as Record<string, string>)[e?.type ?? ""] };
  const hls: Product = { key: "hls", label: F.label, sensor: "", res: F.res, source: F.source, attribution: GIBS_ATTR,
    cls: past ? "historical" : "latest", kind: "hls" };
  const products = [geoP, daily, small ? hls : null].filter(Boolean) as Product[];
  const run = async (p: Product, off = 0) => {
    setBusy(p.key); setNone(null); setOffset(off);
    try {
      let f: Frame | null = null;
      if (p.kind === "geo") f = await geoFrame(p, boxFor(b0, 4), Date.now() - 25 * 60_000 - off * 3_600_000, off ? 3 : 4);
      else if (p.kind === "daily") f = await dailyFrame(p, boxFor(b0, small ? 1.2 : 2), ref - off * 86_400_000, off ? 1 : 3);
      else f = await hlsFrame(p, cx, cy, boxFor(b0, 0.07), ref);
      if (frame) URL.revokeObjectURL(frame.url);
      setFrame(f);
      if (!f) setNone(p.key);
    } catch { setFrame(null); setNone(p.key); }
    setBusy(null);
  };
  const p = frame?.product;
  const cls: Cls | null = p ? (p.kind === "geo" ? (offset ? "historical" : "nrt") : p.cls) : null;
  return (
    <section className="sat ov-block" data-testid="imagery" data-place={id}>
      <div className="ov-h"><span className="ov-title">{S.sat.title}</span></div>
      <p className="xs dim">{S.sat.what(label)}</p>
      <div className="sat-products" role="group" aria-label={S.sat.title}>
        {products.map((x) => (
          <button key={x.key} type="button" className={`chip${p?.key === x.key ? " on" : ""}`} data-testid={`sat-${x.key}`} aria-busy={busy === x.key}
            disabled={!!busy} onClick={() => run(x)}>{busy === x.key ? S.sat.loading : x.label}</button>))}
      </div>
      {none && <p className="xs warn" data-testid="sat-none">{S.sat.none}</p>}
      {frame && p && (
        <figure className="sat-fig" data-testid="sat-frame" data-class={cls} data-product={p.key}>
          <img src={frame.url} alt={`${p.label} · ${label}`} data-testid="sat-img" />
          <figcaption className="xs">
            <b className={`sat-class ${cls}`} data-testid="sat-class">{S.sat.cls[cls!]}</b>{" "}
            <span data-testid="sat-time">{S.sat.acquired(frame.at.replace("T", " ").replace(/:00(\.000)?Z$/, " UTC").replace(/Z$/, " UTC"))}</span>
            <span className="dim"> · {ageText(frame.at)}</span><br />
            <span className="dim">{p.label} · {p.sensor} · {S.sat.res(p.res)}{frame.note ? ` · ${frame.note}` : ""}</span><br />
            <span className="faint" data-testid="sat-source">{p.attribution}</span>
          </figcaption>
          {p.kind !== "hls" && <div className="sat-timeline" role="group" aria-label={S.sat.timeline} data-testid="sat-timeline">
            {(p.kind === "geo" ? [0, 1, 3, 6, 12, 24] : [0, 1, 2, 3]).map((h) => (
              <button key={h} type="button" className={`chip${offset === h ? " on" : ""}`} disabled={!!busy} data-testid={`sat-t-${h}`}
                onClick={() => run(p, h)}>{h === 0 ? S.sat.latest : p.kind === "geo" ? `−${h} h` : `−${h} g`}</button>))}
          </div>}
        </figure>)}
      <p className="xs faint">{S.sat.note}</p>
    </section>);
}

let evMedia: Promise<any> | null = null;
/** Public webcams near a RECENT event (the API layer's package: events of the last 30 days of the data, ≤ 25 km). */
export function EventWebcams({ id }: { id: string }) {
  const [d, setD] = useState<any | null>(null);
  useEffect(() => {
    let live = true;
    evMedia ??= call<any>("/event-webcams", undefined, { channel: "event-webcams" }).then((r) => r.data);
    evMedia.then((x) => { if (live) setD(x); }, () => { evMedia = null; });
    return () => { live = false; };
  }, [id]);
  const near = d?.by_event?.[id] as [string, string, number][] | undefined;
  if (!near?.length) return null;
  return (
    <section className="ov-block" data-testid="event-webcams">
      <div className="ov-h"><span className="ov-title">{S.media.nearTitle}</span></div>
      <p className="xs dim">{S.media.nearNote(d.km, d.days)}</p>
      <ul className="ov-some">{near.map(([cid, label, km]) => (
        <li key={cid}><button type="button" className="linklike" data-ref={cid} onClick={() => store.select(cid, "place")}>{label}</button>
          <span className="xs dim"> · {km.toLocaleString("it-IT")} km</span></li>))}</ul>
    </section>);
}

/** Public webcams near a PLACE (e.g. a city; the API layer's package): name, distance and what can be seen — a current
 *  image, a link to the publisher's page only, or nothing available — each opened like any element (on request). */
export function PlaceWebcams({ id }: { id: string }) {
  const [d, setD] = useState<any | null>(null);
  useEffect(() => {
    let live = true;
    evMedia ??= call<any>("/event-webcams", undefined, { channel: "event-webcams" }).then((r) => r.data);
    evMedia.then((x) => { if (live) setD(x); }, () => { evMedia = null; });
    return () => { live = false; };
  }, [id]);
  const near = d?.by_place?.[id] as [string, string, number, string | null][] | undefined;
  const km = d ? Object.values(d.place_km ?? {})[0] : null;
  if (!d) return null;
  return (
    <section className="ov-block" data-testid="place-webcams">
      <div className="ov-h"><span className="ov-title">{S.media.placeTitle}</span></div>
      {!near?.length ? <p className="xs dim" data-testid="place-webcams-none">{S.media.placeNone(Number(km ?? 10))}</p> : <>
        <p className="xs dim" data-testid="place-webcams-n" data-n={d.place_n?.[id] ?? near.length}>{S.media.placeNote(Number(km ?? 10))}
          {(d.place_n?.[id] ?? 0) > near.length ? ` ${S.media.placeMore(d.place_n[id], near.length)}` : ""}</p>
        <ul className="ov-some">{near.map(([cid, label, dist, av]) => (
          <li key={cid} data-testid="place-webcam" data-availability={av ?? ""}>
            <button type="button" className="linklike" data-ref={cid} onClick={() => store.select(cid, "place")}>{label}</button>
            <span className="xs dim"> · {dist.toLocaleString("it-IT")} km · {S.media.status[av ?? ""] ?? S.media.status.unknown}</span></li>))}</ul></>}
    </section>);
}
