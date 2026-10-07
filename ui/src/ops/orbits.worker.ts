// ORBITS — positions CALCULATED in the browser (SGP4, the MIT propagator aliased as @nexum/sgp4) from the published orbital elements
// (GET /tables/orbits, CelesTrak OMM). Never observed, never stored: computed for the instant asked and thrown away.
// A Web Worker: the map thread never pays for 15,000 propagations.

import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from "@nexum/sgp4";

type Row = [number, string, string, string, string, number, number, number, number, number, number, number, number, number];
let recs: { id: number; rec: SatRec }[] = [];

function init(rows: Row[]) {
  recs = [];
  for (const r of rows) {
    try {
      const rec = json2satrec({ OBJECT_NAME: r[1], OBJECT_ID: r[3], EPOCH: r[4], MEAN_MOTION: r[5], ECCENTRICITY: r[6], INCLINATION: r[7],
        RA_OF_ASC_NODE: r[8], ARG_OF_PERICENTER: r[9], MEAN_ANOMALY: r[10], BSTAR: r[11], MEAN_MOTION_DOT: r[12], MEAN_MOTION_DDOT: r[13],
        NORAD_CAT_ID: r[0], ELEMENT_SET_NO: 999 });
      if (!rec.error) recs.push({ id: r[0], rec });
    } catch { /* an element set SGP4 cannot use: skipped */ }
  }
  return recs.length;
}

function at(rec: SatRec, d: Date) {
  const pv = propagate(rec, d);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;
  const g = gstime(d);
  const geo = eciToGeodetic(pv.position, g);
  const v = pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : NaN;
  return { lng: degreesLong(geo.longitude), lat: degreesLat(geo.latitude), alt: geo.height, v, eci: pv.position, g };
}

/** Every object at one instant: [id, lng, lat, alt_km] × n (only the ones SGP4 can place). */
function positions(t: number, only?: number[]) {
  const d = new Date(t);
  const want = only ? new Set(only) : null;
  const out = new Float64Array(recs.length * 4);
  let n = 0;
  for (const { id, rec } of recs) {
    if (want && !want.has(id)) continue;
    const p = at(rec, d);
    if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat) || p.alt < 80) continue;   // decayed / invalid
    out[n * 4] = id; out[n * 4 + 1] = p.lng; out[n * 4 + 2] = p.lat; out[n * 4 + 3] = p.alt;
    n++;
  }
  return out.slice(0, n * 4);
}

/** The ground track of one object from t0 over `minutes` (one point a minute). */
function track(id: number, t0: number, minutes: number, step = 60) {
  const r = recs.find((x) => x.id === id);
  if (!r) return [];
  const pts: [number, number, number][] = [];
  for (let s = 0; s <= minutes * 60; s += step) {
    const p = at(r.rec, new Date(t0 + s * 1000));
    if (p) pts.push([p.lng, p.lat, p.alt]);
  }
  return pts;
}

/** One object's state at t: position, height, speed. */
function detail(id: number, t: number) {
  const r = recs.find((x) => x.id === id);
  const p = r && at(r.rec, new Date(t));
  return p ? { lng: p.lng, lat: p.lat, alt: p.alt, v: p.v } : null;
}

const RAD = Math.PI / 180;
/** SKY: every object above the observer's horizon at t — azimuth, elevation (degrees), range (km). */
function sky(obs: { lat: number; lng: number; h?: number }, t: number, minEl = 0) {
  const d = new Date(t), g = gstime(d);
  const o = { latitude: obs.lat * RAD, longitude: obs.lng * RAD, height: (obs.h ?? 0) / 1000 };
  const out: [number, number, number, number][] = [];
  for (const { id, rec } of recs) {
    const pv = propagate(rec, d);
    if (!pv || !pv.position || typeof pv.position === "boolean") continue;
    const la = ecfToLookAngles(o, eciToEcf(pv.position, g));
    const el = la.elevation / RAD;
    if (el >= minEl) out.push([id, (la.azimuth / RAD + 360) % 360, el, la.rangeSat]);
  }
  return out;
}

/** SKY: the next passes of one object over the observer (rise, culmination, set) within `hours`. */
function passes(id: number, obs: { lat: number; lng: number }, t0: number, hours: number, minEl = 10) {
  const r = recs.find((x) => x.id === id);
  if (!r) return [];
  const o = { latitude: obs.lat * RAD, longitude: obs.lng * RAD, height: 0 };
  const el = (t: number) => {
    const d = new Date(t);
    const pv = propagate(r.rec, d);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    const la = ecfToLookAngles(o, eciToEcf(pv.position, gstime(d)));
    return { el: la.elevation / RAD, az: (la.azimuth / RAD + 360) % 360 };
  };
  const out: { rise: number; set: number; max: number; maxEl: number; azRise: number; azSet: number }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (let t = t0; t < t0 + hours * 3600_000 && out.length < 12; t += 20_000) {
    const e = el(t);
    if (!e) break;
    if (e.el >= 0 && !cur) cur = { rise: t, set: t, max: t, maxEl: e.el, azRise: e.az, azSet: e.az };
    if (cur) {
      if (e.el >= 0) { cur.set = t; cur.azSet = e.az; if (e.el > cur.maxEl) { cur.maxEl = e.el; cur.max = t; } }
      else { if (cur.maxEl >= minEl) out.push(cur); cur = null; }
    }
  }
  return out;
}

self.onmessage = (ev: MessageEvent) => {
  const { op, q } = ev.data;
  let res: any;
  if (op === "init") res = init(q.rows);
  else if (op === "positions") { const a = positions(q.t, q.only); (self as any).postMessage({ q: ev.data.n, res: a }, [a.buffer]); return; }
  else if (op === "track") res = track(q.id, q.t0, q.minutes, q.step);
  else if (op === "detail") res = detail(q.id, q.t);
  else if (op === "sky") res = sky(q.obs, q.t, q.minEl);
  else if (op === "passes") res = passes(q.id, q.obs, q.t0, q.hours, q.minEl);
  (self as any).postMessage({ q: ev.data.n, res });
};
