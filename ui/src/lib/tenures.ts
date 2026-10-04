// TENURES (Phase 3B · block 3): whether a documented term covers a day, said only when the dates allow it.
// A term is [start, end) — end exclusive (the successor's first day belongs to the successor). A date known only to
// the year or month covers nothing it cannot decide: a day inside that year/month is UNCERTAIN, never guessed.
// Superseded, undated and conflicting terms never make an unambiguous "during the term of".

/** [person, label, start, end, status, statement, references, rank, flags, retrieved_ms] */
export type Term = [string, string, string | null, string | null, string, string | null, number | null, string | null, string[], number | null];
export interface Office { label: string; role: string | null; collegial: boolean; check: string | null; outcome: string; terms: Term[] }

/** -1 day before the period, 0 inside it (undecidable at this precision), 1 after it. */
function cmp(day: string, d: string): number {
  const p = day.slice(0, d.length);
  return p < d ? -1 : p > d ? 1 : 0;
}

/** true / false, or null when the precision of the dates cannot decide. */
export function covers(t: Term, day: string): boolean | null {
  const [, , start, end, status] = t;
  if (!start || status === "undated" || status === "superseded") return null;
  const a = cmp(day, start);
  if (a < 0) return false;
  if (a === 0 && start.length < 10) return null;
  if (!end) return status === "current" || status === "conflict" ? true : null;
  const b = cmp(day, end);
  if (b > 0 || (b === 0 && end.length === 10)) return false;                    // end exclusive
  if (b === 0) return null;
  return true;
}

export interface During { office: string; officeLabel: string; role: string | null; holders: Term[]; ambiguous: boolean }

/** The holders of each office on a day: one (unique), several sharing a collegial office, or AMBIGUOUS. */
export function duringOn(offices: [string, Office][], day: string): During[] {
  const out: During[] = [];
  for (const [id, o] of offices) {
    const hits = o.terms.filter((t) => covers(t, day) === true);
    if (!hits.length) continue;
    const people = new Set(hits.map((t) => t[0]));
    const ambiguous = hits.some((t) => t[4] === "conflict") || (people.size > 1 && !o.collegial);
    out.push({ office: id, officeLabel: o.label, role: o.role, holders: hits, ambiguous });
  }
  return out;
}
