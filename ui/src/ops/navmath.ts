// NAVIGATION GEOMETRY (2026-10-08, simulated-GPS acceptance: the manoeuvre shown went back to one already passed after
// every turn — it was the NEAREST manoeuvre, not the next one along the route; off-route was measured to every other
// vertex, so a long straight segment could look "off the route"). Progress is now measured ALONG the route: the fix
// is projected on the nearest segment (searched forward from where the person already is), the next manoeuvre is the
// first one ahead of that point, its distance is measured along the road, and off-route is the distance to the
// segments themselves. Pure functions, tested on fixed inputs.

export type LL = [number, number];   // [lng, lat]

const R = 6371.0088;
/** Planar offsets (km) of b from a, for short distances (equirectangular around a). */
const dxy = (a: LL, b: LL): [number, number] => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return [((b[0] - a[0]) * Math.PI / 180) * R * k, ((b[1] - a[1]) * Math.PI / 180) * R];
};
const len = (a: LL, b: LL) => Math.hypot(...dxy(a, b));

/** Cumulative length (km) of the route at each vertex. */
export function cumulative(line: LL[]): number[] {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + len(line[i - 1], line[i]));
  return c;
}

export interface Fix { seg: number; t: number; dist: number; at: number }
/** The point of the route nearest to p: its segment, the fraction along it, the distance (km) from p, and how far along
 *  the route it is (km). Searched first forward from `from` (where the person was), then on the whole route. */
export function project(line: LL[], cum: number[], p: LL, from = 0): Fix {
  const best: Fix = { seg: 0, t: 0, dist: Infinity, at: 0 };
  const scan = (lo: number, hi: number) => {
    for (let i = Math.max(0, lo); i < Math.min(line.length - 1, hi); i++) {
      const a = line[i], [bx, by] = dxy(a, line[i + 1]), [px, py] = dxy(a, p);
      const L2 = bx * bx + by * by, t = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
      const d = Math.hypot(px - t * bx, py - t * by);
      if (d < best.dist) Object.assign(best, { seg: i, t, dist: d, at: cum[i] + t * (cum[i + 1] - cum[i]) });
    }
  };
  scan(from - 2, from + 400);
  if (best.dist > 0.1) scan(0, line.length);   // not near the part ahead: anywhere on the route
  if (line.length === 1) Object.assign(best, { seg: 0, t: 0, dist: len(line[0], p), at: 0 });
  return best;
}

/** The vertex index of each manoeuvre on the route: given (Valhalla's begin_shape_index), or the nearest vertex at or
 *  after the previous manoeuvre's (OSRM gives only the location). */
export function stepVertices(line: LL[], steps: { a?: number; maneuver: { location: LL } }[]): number[] {
  let from = 0;
  return steps.map((s) => {
    if (typeof s.a === "number") { from = s.a; return s.a; }
    let bi = from, bd = Infinity;
    for (let i = from; i < line.length; i++) { const d = len(line[i], s.maneuver.location); if (d < bd) { bd = d; bi = i; } if (d > bd + 2) break; }
    from = bi;
    return bi;
  });
}

/** The next manoeuvre ahead of the fix and its distance along the road (km). At the very start: the departure. */
export function nextStep(vtx: number[], cum: number[], f: Fix): { i: number; d: number } {
  if (f.at < 0.02) return { i: 0, d: f.at };
  let i = vtx.findIndex((v, k) => k > 0 && v > f.seg);
  if (i < 0) i = vtx.length - 1;
  return { i, d: Math.max(0, cum[Math.min(vtx[i], cum.length - 1)] - f.at) };
}
