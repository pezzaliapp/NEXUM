// OBSERVATIONS (Phase 3B · block 2): how a measured value is said, and when a CHANGE may be said. Pure functions.
// Perceived direction is never a forecast: it is the change of ONE observed series (same question, answer, population,
// unit and instrument), between two documented periods, shown with an arrow ONLY when it exceeds the sampling error:
//   · survey shares (%):  SE = √(p(1−p)/n) per point;  balances: the SE published with the point;
//   · SE(Δ) = √(SE₁² + SE₂²); arrow if |Δ| > 2·√deff·SE(Δ), deff = 2 (weighting, quotas, panels: a prudent default);
//   · otherwise "stabile" (within the error); no n/SE → no arrow ("non valutabile").
// Official statistics and prices have no sampling error: their change is stated as a change, never as a "perceived direction".

/** [start, end, value, n, se, ref, dataset?] */
export type Point = [string | null, string | null, number, number | null, number | null, string, string?];
export interface Series {
  id: string; type: string; kind: "survey" | "official" | string; label: string; source_id: string;
  props: Record<string, any>; points: Point[]; refs: string[];
}
export type Verdict = "up" | "down" | "stable" | "change" | "none";
export interface Direction { verdict: Verdict; delta: number | null; threshold: number | null; from: Point | null; to: Point; basis: string }

export const DEFF = 2;

function se(p: Point, statistic: string): number | null {
  if (p[4] != null) return p[4];
  if (statistic === "share" && p[3]) {
    const x = Math.min(Math.max(p[2] / 100, 0), 1);
    return 100 * Math.sqrt((x * (1 - x)) / p[3]);
  }
  return null;
}

const ym = (d: string | null) => (d ? d.slice(0, 7) : "");
function minusYear(d: string): string { return `${String(Number(d.slice(0, 4)) - 1).padStart(4, "0")}${d.slice(4)}`; }

/** The comparison point of the latest one, by the series' declared rule. */
export function previousOf(s: Series): Point | null {
  const pts = s.points;
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const rule = s.props.compare ?? (s.kind === "official" ? "previous_year" : "previous");
  if (rule === "same_month_previous_year" || (s.kind === "official" && s.props.frequency === "mensile")) {
    const target = ym(minusYear(last[1] ?? ""));
    return pts.find((p) => ym(p[1]) === target) ?? null;
  }
  return pts[pts.length - 2];
}

export function direction(s: Series): Direction {
  const to = s.points[s.points.length - 1];
  const from = previousOf(s);
  if (!from) return { verdict: "none", delta: null, threshold: null, from: null, to, basis: "single" };
  // statistics without sampling error (official figures, prices): their change is stated as published, never an arrow
  if (s.kind !== "survey") {
    const delta = Math.round((to[2] - from[2]) * 10000) / 10000;
    return { verdict: delta === 0 ? "stable" : "change", delta, threshold: null, from, to, basis: s.kind };
  }
  const delta = Math.round((to[2] - from[2]) * 10) / 10;
  const stat = s.props.statistic ?? "share";
  const a = se(from, stat), b = se(to, stat);
  if (a == null || b == null) return { verdict: "none", delta, threshold: null, from, to, basis: "no_error" };
  const threshold = Math.round(2 * Math.sqrt(DEFF) * Math.sqrt(a * a + b * b) * 10) / 10;
  const verdict: Verdict = Math.abs(delta) > threshold ? (delta > 0 ? "up" : "down") : "stable";
  return { verdict, delta, threshold, from, to, basis: stat };
}

/** Pairs REALITY and PERCEPTION by declared topic (two different measures, never one number). */
export function pairsByTopic(list: Series[]): { topic: string; reality: Series[]; perception: Series[] }[] {
  const by = new Map<string, { reality: Series[]; perception: Series[] }>();
  for (const s of list) {
    const t = s.props.topic;
    if (!t || (s.kind !== "official" && s.kind !== "survey")) continue;
    const b = by.get(t) ?? { reality: [], perception: [] };
    (s.kind === "official" ? b.reality : b.perception).push(s);
    by.set(t, b);
  }
  return [...by.entries()].filter(([, b]) => b.reality.length && b.perception.length)
    .map(([topic, b]) => ({ topic, ...b })).sort((x, y) => x.topic.localeCompare(y.topic));
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** The period a point describes, as the source dates it: a year, a month, or the fieldwork of a survey. */
export function periodLabel(p: Point): string {
  const [a, b] = [p[0] ?? p[1] ?? "", p[1] ?? p[0] ?? ""];
  if (!a) return "—";
  const [ya, ma, da] = a.split("-").map(Number), [yb, mb, db] = b.split("-").map(Number);
  if (ma === 1 && da === 1 && mb === 12 && db === 31 && ya === yb) return String(ya);
  const lastDay = new Date(Date.UTC(yb, mb, 0)).getUTCDate();
  if (ya === yb && ma === mb && da === 1 && db === lastDay) return `${MONTHS[ma - 1]} ${ya}`;
  const left = ya === yb ? `${da} ${MONTHS[ma - 1]}` : `${da} ${MONTHS[ma - 1]} ${ya}`;
  return a === b ? `${da} ${MONTHS[ma - 1]} ${ya}` : `${left} – ${db} ${MONTHS[mb - 1]} ${yb}`;
}

/** 95% margin of error of one point (survey only), with the same design effect as the direction rule. */
export function marginOfError(s: Series, p: Point): number | null {
  if (s.kind === "official") return null;
  const e = se(p, s.props.statistic ?? "share");
  return e == null ? null : Math.round(1.96 * Math.sqrt(DEFF) * e * 10) / 10;
}
