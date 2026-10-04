// Aggregation grid and calendar helpers — ports of nexum.core.geo and nexum.core.timeutil (same arithmetic).
import { divmod } from "./py.ts";

export const MAX_LEVEL = 8;
export const AGG_LEVELS = [2, 4, 6, 8];
export const LOCAL_Z = 10;
export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

export function cell(lon: number, lat: number, level: number = MAX_LEVEL): [number, number] {
  const n = 2 ** level;
  const x = Math.trunc((lon + 180.0) / 360.0 * n);
  const y = Math.trunc((lat + 90.0) / 180.0 * n);
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)];
}

export function cellBbox(level: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** level;
  return [x * 360.0 / n - 180.0, (x + 1) * 360.0 / n - 180.0, y * 180.0 / n - 90.0, (y + 1) * 180.0 / n - 90.0];
}

/** Viewport (min_lon, min_lat, max_lon, max_lat) → cell ranges (x0, x1, y0, y1); two ranges across the antimeridian. */
export function viewportCells(vp: number[], level: number): [number, number, number, number][] {
  const [minLon, minLat, maxLon, maxLat] = vp;
  const y0 = cell(0.0, Math.max(-90.0, minLat), level)[1];
  const y1 = cell(0.0, Math.min(90.0, maxLat), level)[1];
  const spans: [number, number][] = minLon <= maxLon ? [[minLon, maxLon]] : [[minLon, 180.0], [-180.0, maxLon]];
  return spans.map(([a, b]) => [cell(a, 0.0, level)[0], cell(b, 0.0, level)[0], y0, y1]);
}

export function aggLevel(z: number | null | undefined): number {
  const zi = z === null || z === undefined ? 2 : Math.trunc(z);
  return Math.min(MAX_LEVEL, Math.max(2, 2 * Math.floor((zi + 2) / 2)));
}

/** Months since year 0 (year*12 + month-1), UTC. */
export function monthIndex(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthStartMs(mi: number): number {
  const [y, m] = divmod(mi, 12);
  const d = new Date(0);
  d.setUTCFullYear(y, m, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
