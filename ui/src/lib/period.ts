// PERIOD — what time a person is looking at, as a choice in whole months (the Core's map counts time by months:
// a finer window would promise a precision it does not have). Anchored to the most recent data of the published
// world ("Dati aggiornati al …"), never to the device's clock. Four different things, never mixed: the device date
// (unused), the snapshot's publication, the observed period, the date of an event.
// Pure functions (no React, no store): unit-tested.

export type Period =
  | { kind: "last12" } | { kind: "last3" } | { kind: "month" }
  | { kind: "year"; year: number } | { kind: "all" }
  | { kind: "custom"; from: number; to: number };   // month indexes (year * 12 + month0), inclusive

export const DEFAULT_PERIOD: Period = { kind: "last12" };

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const monthIndex = (ms: number) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const monthStart = (m: number) => Date.UTC(Math.floor(m / 12), m % 12, 1);
const monthLabel = (m: number) => `${MONTHS[m % 12]} ${Math.floor(m / 12)}`;

/** "9 mar 2026" (UTC, as every time in NEXUM). */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Inclusive month range of a period, given the month of the most recent data and the world's first month. */
export function monthsOf(p: Period, anchorMonth: number, _firstMonth: number): [number, number] | null {
  switch (p.kind) {
    case "last12": return [anchorMonth - 11, anchorMonth];
    case "last3": return [anchorMonth - 2, anchorMonth];
    case "month": return [anchorMonth, anchorMonth];
    case "year": return [p.year * 12, p.year * 12 + 11];
    case "custom": return [Math.min(p.from, p.to), Math.max(p.from, p.to)];
    case "all": return null;
  }
}

/** The Scope time window of a period: whole months, from the first millisecond of the first to the last of the last. */
export function windowOf(p: Period, anchorMonth: number, firstMonth: number): [number, number] | null {
  const m = monthsOf(p, anchorMonth, firstMonth);
  return m ? [monthStart(m[0]), monthStart(m[1] + 1) - 1] : null;
}

/** What the period is called on screen: "ultimi 12 mesi", "2025", "mar 2024 – giu 2025", "tutto (2012–2026)". */
export function periodName(p: Period, anchorMonth: number, firstMonth: number): string {
  switch (p.kind) {
    case "last12": return "ultimi 12 mesi";
    case "last3": return "ultimi 3 mesi";
    case "month": return monthLabel(anchorMonth);
    case "year": return String(p.year);
    case "all": return `tutto (${Math.floor(firstMonth / 12)}–${Math.floor(anchorMonth / 12)})`;
    case "custom": { const [a, b] = monthsOf(p, anchorMonth, firstMonth)!; return a === b ? monthLabel(a) : `${monthLabel(a)} – ${monthLabel(b)}`; }
  }
}

/** The months a period covers, in words ("ott 2025 – set 2026"); null for the whole period. */
export function periodMonths(p: Period, anchorMonth: number, firstMonth: number): string | null {
  const m = monthsOf(p, anchorMonth, firstMonth);
  return m ? (m[0] === m[1] ? monthLabel(m[0]) : `${monthLabel(m[0])} – ${monthLabel(m[1])}`) : null;
}

export const samePeriod = (a: Period, b: Period) => JSON.stringify(a) === JSON.stringify(b);

/** The period a recorded time window stands for (a preset when it is exactly one, otherwise custom months). */
export function periodOfWindow(w: [number, number] | null | undefined, anchorMonth: number, firstMonth: number): Period {
  if (!w) return { kind: "all" };
  const a = monthIndex(w[0]), b = monthIndex(w[1]);
  for (const p of [{ kind: "last12" }, { kind: "last3" }, { kind: "month" }] as Period[]) {
    const m = monthsOf(p, anchorMonth, firstMonth)!;
    if (m[0] === a && m[1] === b) return p;
  }
  if (a % 12 === 0 && b === a + 11) return { kind: "year", year: a / 12 };
  return { kind: "custom", from: a, to: b };
}

/** Does an instant fall in the period? (objects have no time: always inside) */
export function inPeriod(t: number | null | undefined, w: [number, number] | null | undefined): boolean {
  return t == null || !w || (w[0] <= t && t <= w[1]);
}

export { monthLabel, monthStart };
