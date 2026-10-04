// THE EARTH'S ILLUMINATION (one Operational Map, 2026-10-03): where the Sun is overhead at a given UTC instant, and how
// high it stands at any place. Computed — CURRENT, from the clock — never observed. Pure functions.
// Low-precision solar coordinates (Astronomical Almanac, about 0.01° in this century): ample for a day/night shading.

const RAD = Math.PI / 180;

/** The subsolar point (latitude = solar declination, longitude where it is local solar noon), degrees. */
export function subsolar(ms: number): { lat: number; lon: number } {
  const n = ms / 86_400_000 + 2440587.5 - 2451545.0;            // days from J2000.0
  const L = (280.46 + 0.9856474 * n) % 360;                       // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;              // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;   // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * RAD;                     // obliquity of the ecliptic
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;         // Greenwich mean sidereal time, degrees
  let lon = (ra / RAD - gmst) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: dec / RAD, lon };
}

/** The Sun's altitude above the horizon at (lat, lon), degrees (negative: below it). */
export function solarAltitude(lat: number, lon: number, sun: { lat: number; lon: number }): number {
  const s = Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** How dark it is: 0 in daylight (Sun above +0.5°), 1 from the end of nautical twilight (−12°), smooth in between —
 *  a continuous terminator, never a band or a block. */
export function nightFactor(altitude: number): number {
  const t = Math.max(0, Math.min(1, (0.5 - altitude) / 12.5));
  return t * t * (3 - 2 * t);
}
