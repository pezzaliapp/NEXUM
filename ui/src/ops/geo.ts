// Spherical geometry for the operational tools (measurement, areas, circles, inside-a-shape). Pure functions,
// unit-tested. The Earth as a sphere of mean radius 6,371.0088 km (IUGG): distances within ±0.5 % of the ellipsoid.

export type LngLat = [number, number];
export const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance, km. */
export function haversine(p: LngLat, q: LngLat): number {
  const dLat = rad(q[1] - p[1]), dLon = rad(q[0] - p[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[1])) * Math.cos(rad(q[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north [0, 360). */
export function bearing(p: LngLat, q: LngLat): number {
  const y = Math.sin(rad(q[0] - p[0])) * Math.cos(rad(q[1]));
  const x = Math.cos(rad(p[1])) * Math.sin(rad(q[1])) - Math.sin(rad(p[1])) * Math.cos(rad(q[1])) * Math.cos(rad(q[0] - p[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point at a distance (km) and bearing (degrees) from a start. */
export function destination(a: LngLat, km: number, brg: number): LngLat {
  const d = km / R_KM, t = rad(brg), p1 = rad(a[1]), l1 = rad(a[0]);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((deg(l2) + 540) % 360) - 180, deg(p2)];
}

/** Length of a path, km. */
export const pathLength = (pts: LngLat[]) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);

/** Area of a ring on the sphere, km² (spherical excess, Chamberlain & Duquette 2007). */
export function ringArea(ring: LngLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    s += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs((s * R_KM * R_KM) / 2);
}

/** A circle as a closed ring of `steps` points. */
export function circleRing(c: LngLat, km: number, steps = 72): LngLat[] {
  const r: LngLat[] = [];
  for (let i = 0; i <= steps; i++) r.push(destination(c, km, (i * 360) / steps));
  return r;
}

/** The closed ring of a box given two opposite corners. */
export const boxRing = (a: LngLat, b: LngLat): LngLat[] => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]];

export const closeRing = (r: LngLat[]): LngLat[] => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);

/** Point in ring (ray casting, lng/lat plane; adequate for areas drawn on screen). */
export function inRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let k = 0, prev = n - 1; k < n; prev = k++) {
    const [xi, yi] = ring[k], [xj, yj] = ring[prev];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bboxOf(ring: LngLat[]): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

export function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(1000 * km)} m`;
  if (km < 100) return `${km.toLocaleString("it-IT", { maximumFractionDigits: 2 })} km`;
  return `${Math.round(km).toLocaleString("it-IT")} km`;
}
export function fmtKm2(a: number): string {
  if (a < 1) return `${Math.round(a * 1e6).toLocaleString("it-IT")} m²`;
  if (a < 100) return `${a.toLocaleString("it-IT", { maximumFractionDigits: 2 })} km²`;
  return `${Math.round(a).toLocaleString("it-IT")} km²`;
}
export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const compass = (b: number) => COMPASS[Math.round(b / 22.5) % 16];

/** Degrees as 44.8015° N, 10.3279° E. */
export function fmtLatLng(lat: number, lng: number, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(digits)}° ${lng >= 0 ? "E" : "O"}`;
}

/** Scale bar: the longest 1-2-5 distance that fits in maxPx at this zoom and latitude (512 px tiles). */
export function scaleFor(zoom: number, lat: number, maxPx = 100): { km: number; px: number; label: string } {
  const mPerPx = (40075016.686 * Math.cos(rad(lat))) / (512 * 2 ** zoom);
  const maxM = mPerPx * maxPx;
  const p = 10 ** Math.floor(Math.log10(maxM));
  const step = [5, 2, 1].map((k) => k * p).find((v) => v <= maxM) ?? p;
  return { km: step / 1000, px: step / mPerPx, label: step >= 1000 ? `${step / 1000} km` : `${step} m` };
}
