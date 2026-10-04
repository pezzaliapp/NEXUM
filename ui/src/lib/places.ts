// PLACES FIRST (integrity gate 2026-10-04): matching a text against the index of explorable places — exact name first
// (the label before a source name), then name prefix, then word prefix. Pure functions (unit-tested).

// [id, type, label, source names, clear name, rank among namesakes (e.g. inhabitants), context (e.g. its state)]
export type Place = [string, string, string, string[], (string | null)?, (number | null)?, (string | null)?];
export const normName = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Places matching a text: exact name (label first, then a source name), name prefix, word prefix (≥ 3 letters). */
export function matchPlaces(places: Place[], text: string, max = 5): { id: string; type: string; label: string; score: number; context?: string | null }[] {
  const t = normName(text);
  if (t.length < 2) return [];
  const out: { id: string; type: string; label: string; score: number; rank: number; context?: string | null }[] = [];
  for (const [id, type, label0, aliases, clear, rank, context] of places) {
    const label = clear ?? label0;
    let best = 99;
    [label, ...aliases, label0].forEach((n, i) => {
      const nn = normName(n), alias = i > 0 ? 0.5 : 0;
      const sc = nn === t ? 0 : nn.startsWith(t) ? 1 : t.length >= 3 && nn.split(" ").some((w) => w.startsWith(t)) ? 2 : 99;
      if (sc < 99) best = Math.min(best, sc + alias);
    });
    // an explorable place (no rank) comes before a namesake of the same score; namesakes by rank (more inhabitants first)
    if (best < 99) out.push({ id, type, label, score: best, rank: rank == null ? Infinity : rank, context: context ?? null });
  }
  return out.sort((a, b) => a.score - b.score || b.rank - a.rank || a.label.length - b.label.length || a.label.localeCompare(b.label))
    .slice(0, max).map(({ rank: _r, ...x }) => x);
}

