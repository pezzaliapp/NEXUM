// Deterministic recomputation of a stored confidence from its factors: the same formula as the Core's
// confidence.recompute (a degree of support, never a probability). Used by WHY to show that the value is
// reproducible, and verified against the Core by W21.

export type Factors = Record<string, any>;

export function recompute(f: Factors): number {
  if (Array.isArray(f.p)) return f.p.reduce((v: number, x: number) => v * Number(x), 1);
  if (f.g && typeof f.g === "object") return groups(f.g);
  switch (f.method) {
    case "independent_groups":
      return groups(f.groups);
    case "product":
      return Object.keys(f.factors).sort().reduce((v, k) => v * Number(f.factors[k]), 1);
    case "insight": {
      let v = Number(f.relation_strength) * Number(f.members_min);
      for (const k of Object.keys(f.scored ?? {}).sort()) v *= Number(f.scored[k]);
      return v;
    }
  }
  throw new Error(`unknown factor method ${f.method}`);
}

function groups(g: Record<string, number>): number {
  let rest = 1;
  for (const k of Object.keys(g).sort()) rest *= 1 - Number(g[k]);
  return 1 - rest;
}

export function band(c: number | null | undefined): 0 | 1 | 2 {
  if (c == null) return 0;
  return c >= 0.8 ? 2 : c >= 0.5 ? 1 : 0;
}
