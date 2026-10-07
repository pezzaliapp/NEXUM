// A SEA ROUTE BETWEEN TWO PORTS (2026-10-06, physical acceptance): the shortest route of the MODEL (Eurostat SeaRoute's
// network, the table NEXUM publishes) between two points at sea — computed here, in the page, with no service. It is
// the model's shortest navigable path, not a route ships were seen to take, not a schedule. Canals and straits the
// network marks can be avoided; the seasonal Arctic passages are left out unless asked for.
export type SeaRow = [string, number, number[][]];
export interface SeaGraph { coords: [number, number][]; adj: [number, number][][]; edges: { line: number[][]; km: number; pass: string }[] }
export interface SeaRoute { line: number[][]; km: number; passes: string[]; snapA: number; snapB: number }

const R = 6371;
export function km(a: number[], b: number[]): number {
  const rad = Math.PI / 180, dl = (b[1] - a[1]) * rad, dn = (b[0] - a[0]) * rad;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// the two sides of the 180° meridian are one place
const key = (p: number[]) => `${Math.abs(Math.abs(p[0]) - 180) < 1e-9 ? 180 : p[0]},${p[1]}`;

export function graph(rows: SeaRow[]): SeaGraph {
  const ids = new Map<string, number>(), coords: [number, number][] = [], adj: [number, number][][] = [], edges: SeaGraph["edges"] = [];
  const node = (p: number[]) => { const k = key(p); let i = ids.get(k); if (i == null) { i = coords.length; ids.set(k, i); coords.push([p[0], p[1]]); adj.push([]); } return i; };
  for (const [pass, , line] of rows) {
    let l = 0;
    for (let i = 1; i < line.length; i++) l += km(line[i - 1], line[i]);
    const e = edges.length, a = node(line[0]), b = node(line[line.length - 1]);
    edges.push({ line, km: l, pass });
    adj[a].push([b, e]); adj[b].push([a, e]);
  }
  return { coords, adj, edges };
}

/** The network's node nearest to a point (within maxKm), or -1. */
export function nearest(g: SeaGraph, p: number[], maxKm = 150): number {
  let best = -1, d = maxKm;
  for (let i = 0; i < g.coords.length; i++) {
    const c = g.coords[i];
    if (Math.abs(c[1] - p[1]) > 3) continue;
    const x = km(p, c);
    if (x < d) { d = x; best = i; }
  }
  return best;
}

/** The model's shortest route between two points at sea; null when either is not near the network or none exists. */
export function route(g: SeaGraph, a: number[], b: number[], avoid: Set<string>): SeaRoute | null {
  const s = nearest(g, a), t = nearest(g, b);
  if (s < 0 || t < 0) return null;
  const dist = new Float64Array(g.coords.length).fill(Infinity), prev = new Int32Array(g.coords.length).fill(-1), via = new Int32Array(g.coords.length).fill(-1);
  dist[s] = 0;
  // a binary heap of [distance, node]
  const h: [number, number][] = [[0, s]];
  const push = (x: [number, number]) => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => { const top = h[0], last = h.pop()!; if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
  while (h.length) {
    const [d, u] = pop();
    if (u === t) break;
    if (d > dist[u]) continue;
    for (const [v, e] of g.adj[u]) {
      const ed = g.edges[e];
      if (ed.pass && avoid.has(ed.pass)) continue;
      const nd = d + ed.km;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; via[v] = e; push([nd, v]); }
    }
  }
  if (!Number.isFinite(dist[t])) return null;
  const parts: number[][][] = [], passes: string[] = [];
  for (let v = t; v !== s; v = prev[v]) {
    const ed = g.edges[via[v]];
    // each section oriented from the start towards the end
    parts.push(key(ed.line[ed.line.length - 1]) === key(g.coords[v]) ? ed.line : [...ed.line].reverse());
    if (ed.pass && !passes.includes(ed.pass)) passes.push(ed.pass);
  }
  parts.reverse(); passes.reverse();
  const raw = parts.flat();
  // across the 180° meridian: longitudes kept continuous so the map draws the short way
  for (let i = 1; i < raw.length; i++) { const dx = raw[i][0] - raw[i - 1][0]; if (dx > 180) raw[i] = [raw[i][0] - 360, raw[i][1]]; else if (dx < -180) raw[i] = [raw[i][0] + 360, raw[i][1]]; }
  const line: number[][] = [];
  for (const c of raw) { const l = line[line.length - 1]; if (!l || l[0] !== c[0] || l[1] !== c[1]) line.push(c); }
  return { line, km: dist[t], passes, snapA: km(a, g.coords[s]), snapB: km(b, g.coords[t]) };
}
