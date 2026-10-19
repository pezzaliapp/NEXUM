// NEWS ON THE MAP (2026-10-18, review): only reports whose place is CONFIRMED are points; the others (suggested by GDELT
// and not verified, ambiguous, or only a region / nation) are counted in ONE circle per nation, at the nation's centre
// as GDELT gives it (a nation-level report's point) or, without one, the mean of the nation's report points — said as
// such in its card: never a precise place. Pure: tested in tests/unit/gdelt.test.ts.

export interface NewsLike { id: string; c: [number, number] | null; props: Record<string, any> }
export interface NationGroup { nation: string; n: number; unconfirmed: number; ambiguous: number; coarse: number; c: [number, number] }

export const isConfirmed = (x: NewsLike) => x.props?.geo === "confirmed";

export function nationGroups(items: NewsLike[]): NationGroup[] {
  const by = new Map<string, NewsLike[]>();
  for (const x of items) {
    if (isConfirmed(x) || !x.c) continue;
    const k = String(x.props?.nation_name ?? "");
    if (!k) continue;
    (by.get(k) ?? by.set(k, []).get(k)!).push(x);
  }
  return [...by].map(([nation, xs]) => {
    const centre = xs.find((x) => x.props?.precision === "nation")?.c;
    const mean: [number, number] = [xs.reduce((s, x) => s + x.c![0], 0) / xs.length, xs.reduce((s, x) => s + x.c![1], 0) / xs.length];
    return { nation, n: xs.length, unconfirmed: xs.filter((x) => x.props?.geo === "unconfirmed" && x.props?.precision === "city").length,
      ambiguous: xs.filter((x) => x.props?.geo === "ambiguous").length, coarse: xs.filter((x) => x.props?.precision !== "city").length,
      c: centre ?? [Math.round(mean[0] * 1000) / 1000, Math.round(mean[1] * 1000) / 1000] };
  }).sort((a, b) => b.n - a.n);
}

export interface NewsFilterLike { nation: string; city: string; cat: string; geo: "" | "confirmed" | "uncertain"; cityAlt?: string[] }
const cats = (x: NewsLike): string[] => { try { return JSON.parse(x.props?.cats ?? "[]"); } catch { return []; } };
/** The list's filters: nation and city as GDELT names them, a category ("other": no public-order category), the
 *  place's certainty; newest first. */
export function filterNews<T extends NewsLike & { t: number | null }>(items: T[], f: NewsFilterLike): T[] {
  return items.filter((x) => (!f.nation || x.props?.nation_name === f.nation) && (!f.city || x.props?.city === f.city || (f.cityAlt ?? []).includes(x.props?.city))
    && (!f.cat || (f.cat === "other" ? cats(x).length === 0 : cats(x).includes(f.cat)))
    && (!f.geo || (f.geo === "confirmed") === isConfirmed(x))).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
}
