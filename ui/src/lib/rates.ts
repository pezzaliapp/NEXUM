// RATES (Phase 3B · block 5): a rate looked up in an official table by its three dimensions, and the amount of a set of
// sections = Σ (length × rate), each section rounded to the cent as the law prescribes. No route is computed.

/** [dim0, dim1, dim2, total, ...components] */
export type RateRow = [number, string, number, number, ...number[]];

export function rateOf(rows: RateRow[], d0: number, d1: string, d2: number): RateRow | null {
  return rows.find((r) => r[0] === d0 && r[1] === d1 && r[2] === d2) ?? null;
}

/** Cents of one section: commercial rounding of length × rate (a tiny epsilon keeps 0.5 cents from binary drift). */
export const sectionCents = (km: number, rate: number) => Math.round(km * rate * 100 + 1e-9);

export function amountCents(segments: [number, string, string, number][], rate: number): number {
  return segments.reduce((s, x) => s + sectionCents(x[3], rate), 0);
}
