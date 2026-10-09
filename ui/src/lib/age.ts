// THE AGE OF AN OBSERVATION (2026-10-09, oceanographic network): how long ago a source measured a value, said plainly —
// "recente" only within the type's own threshold (vocabulary hint latest.recent_h), never "live". Pure (unit-tested).

export interface Age { hours: number; text: string; recent: boolean }

/** "2026-10-09T11:00Z" (UTC) seen at `now` → its age; null when the time cannot be read. */
export function ageOf(observedUtc: string | null | undefined, now: number, recentH = 3): Age | null {
  if (!observedUtc) return null;
  const t = Date.parse(observedUtc);
  if (Number.isNaN(t)) return null;
  const hours = Math.max(0, (now - t) / 3_600_000);
  const h = Math.floor(hours), d = Math.floor(hours / 24);
  const text = hours < 1 ? "meno di un'ora fa" : hours < 48 ? (h === 1 ? "1 ora fa" : `${h} ore fa`) : `${d} giorni fa`;
  return { hours, text, recent: hours <= recentH };
}
