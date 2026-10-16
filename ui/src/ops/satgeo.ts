// SAT VIEW (2026-10-15): the pure part — the fields drawn on the map (each said as what it is: the REAL footprint
// of an acquisition, the THEORETICAL swath of an instrument, the CALCULATED horizon of a position) and the class of
// what the image section shows. No network, no DOM: tested with fixed inputs (tests/unit/satview.test.ts).
//
// Classes: LIVE VIDEO only for a stream the player itself says is live; ULTIMA ACQUISIZIONE for the newest product of
// THIS spacecraft while it is recent; IMMAGINE STORICA for an older one (asked by the person, or the newest when the
// spacecraft has stopped delivering); NON DISPONIBILE when the service has nothing (an empty frame is never shown).

import { bearing, destination, R_KM, type LngLat } from "./geo.ts";

export type SatClass = "live" | "latest" | "historical" | "none";
export const CLASS_LABEL: Record<SatClass, string> = {
  live: "LIVE VIDEO", latest: "ULTIMA ACQUISIZIONE", historical: "IMMAGINE STORICA", none: "NON DISPONIBILE",
};

/** What a field drawn on the map is: an acquisition's own footprint, the nominal swath, the computed horizon. */
export type FieldKind = "footprint" | "swath" | "horizon";
export const FIELD_LABEL: Record<FieldKind, string> = {
  footprint: "Area osservata (impronta reale dell'acquisizione)",
  swath: "Campo teorico dello strumento lungo l'orbita calcolata (non un'acquisizione)",
  horizon: "Orizzonte calcolato: la Terra visibile dalla posizione calcolata (non un campo osservato)",
};

/** The class of an image: the newest product of the spacecraft, within its freshness window → latest; else historical. */
export function classify(newest: boolean, atMs: number, nowMs: number, freshMs: number): SatClass {
  if (!Number.isFinite(atMs)) return "none";
  return newest && nowMs - atMs <= freshMs ? "latest" : "historical";
}

/** The age of orbital elements, in whole days (the card says it; past `staleDays` the position is said approximate). */
export function epochAgeDays(epoch: string, nowMs: number): number | null {
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`);   // CelesTrak epochs are UTC, written without a zone
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 86_400_000)) : null;
}

/** A time as the service gave it, in UTC: a day stays a day (never an invented hour). */
export function fmtUTC(at: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return `${at} (solo data, UTC)`;
  const t = Date.parse(at);
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC` : at;
}

/** How long ago, in Italian (minutes, hours, days); a day-only time counts whole UTC days. */
export function fmtAge(at: string, nowMs: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const d = Math.round((Date.parse(new Date(nowMs).toISOString().slice(0, 10)) - Date.parse(at)) / 86_400_000);
    return d <= 0 ? "oggi (UTC)" : d === 1 ? "ieri (UTC)" : `${d} giorni fa`;
  }
  const min = Math.round((nowMs - Date.parse(at)) / 60_000);
  if (!Number.isFinite(min)) return "";
  return min < 120 ? `${Math.max(0, min)} min fa` : min < 48 * 60 ? `${Math.round(min / 60)} ore fa` : `${Math.round(min / 1440)} giorni fa`;
}

/** Angular radius (degrees of arc on the Earth) of the horizon seen from altitude `altKm` (spherical Earth). */
export function horizonDeg(altKm: number): number {
  return (Math.acos(R_KM / (R_KM + Math.max(0, altKm))) * 180) / Math.PI;
}

/** A circle of `radiusDeg` of arc around `c`, longitudes kept continuous around the centre (no wrap across the map).
 *  null when it would contain a pole (a ring cannot draw it). */
export function capRing(c: LngLat, radiusDeg: number, steps = 96): LngLat[] | null {
  if (Math.abs(c[1]) + radiusDeg >= 89.5) return null;
  const km = (radiusDeg * Math.PI * R_KM) / 180, out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(c, km, (360 * i) / steps);
    let lng = p[0];
    while (lng - c[0] > 180) lng -= 360;
    while (lng - c[0] < -180) lng += 360;
    out.push([lng, p[1]]);
  }
  return out;
}

/** The nominal swath along a ground track: one quadrilateral per track step (± half the swath, across the track);
 *  steps crossing the antimeridian are left out rather than drawn across the whole map. */
export function swathQuads(track: LngLat[], swathKm: number): LngLat[][] {
  const half = swathKm / 2, out: LngLat[][] = [];
  const edge = (i: number): [LngLat, LngLat] => {
    const a = track[Math.max(0, i - 1)], b = track[Math.min(track.length - 1, i + 1)];
    const h = bearing(a, b);
    return [destination(track[i], half, h - 90), destination(track[i], half, h + 90)];
  };
  for (let i = 0; i + 1 < track.length; i++) {
    const [l0, r0] = edge(i), [l1, r1] = edge(i + 1);
    const q: LngLat[] = [l0, l1, r1, r0, l0];
    const lons = q.map((p) => p[0]);
    if (Math.max(...lons) - Math.min(...lons) > 180) continue;
    out.push(q);
  }
  return out;
}

/** The newest 10-minute slot a WMS time dimension declares ("start/end/PT10M" or a list), and a slot `hoursBack` before it
 *  (kept inside the declared range). Times are the service's own: never invented. */
export function wmsSlots(dimension: string, dflt: string | null): { latest: string | null; start: string | null } {
  const range = dimension.trim().split(",").pop()!.trim().split("/");
  const latest = dflt ?? (range.length >= 2 ? range[1] : range[0]) ?? null;
  return { latest: latest ? new Date(Date.parse(latest)).toISOString().replace(".000Z", "Z") : null, start: range.length >= 2 ? range[0] : null };
}
export function slotBack(latest: string, hoursBack: number, start: string | null): string | null {
  const t = Date.parse(latest) - hoursBack * 3_600_000;
  if (start && t < Date.parse(start)) return null;
  return new Date(t).toISOString().replace(".000Z", "Z");
}
