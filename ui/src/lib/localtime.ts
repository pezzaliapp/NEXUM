// LOCAL DATE AND TIME OF A PLACE (2026-10-04): computed by the browser from the place's IANA time zone (Intl, with
// daylight saving time) — never the browser's own zone, never a paid service. A place spanning several zones is never
// given one "national" time: its zones are counted and the capital's time is said as the capital's.
// Pure functions (unit-tested).

export interface LocalTime { date: string; time: string; abbr: string | null; utc: string; offsetMin: number; zone: string }

/** Offset of a zone from UTC at an instant, in minutes (e.g. 330 for Asia/Kolkata, -240 for America/New_York in summer). */
export function offsetMinutes(zone: string, at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-−])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "UTC+2", "UTC−4", "UTC+5:30", "UTC+5:45", "UTC±0". */
export function utcLabel(min: number): string {
  if (min === 0) return "UTC±0";
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `UTC${min > 0 ? "+" : "−"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** The place's date, time, zone abbreviation (when the zone has a common one) and UTC offset at an instant. */
export function localTime(zone: string, at: Date = new Date()): LocalTime | null {
  try {
    const date = new Intl.DateTimeFormat("it-IT", { timeZone: zone, day: "numeric", month: "long", year: "numeric" }).format(at);
    const time = new Intl.DateTimeFormat("it-IT", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    // the common abbreviation where one exists: the American zones in en-US (EDT, PST…), the others in en-GB (CEST, BST…)
    const name = (loc: string) => new Intl.DateTimeFormat(loc, { timeZone: zone, timeZoneName: "short" }).formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
    const us = name("en-US"), short = /^[A-Z]{2,5}$/.test(us) && us !== "UTC" && us !== "GMT" ? us : name("en-GB");
    const offsetMin = offsetMinutes(zone, at);
    // an abbreviation only when it is a real one (CEST, EDT, JST…), not a "GMT+5:30" placeholder
    const abbr = /^[A-Z]{2,5}$/.test(short) && short !== "GMT" && short !== "UTC" ? short : null;
    return { date, time, abbr, utc: utcLabel(offsetMin), offsetMin, zone };
  } catch {
    return null;
  }
}

/** How many different offsets a set of zones has at an instant (several zones may share one offset). */
export function distinctOffsets(zones: string[], at: Date = new Date()): number {
  return new Set(zones.map((z) => { try { return offsetMinutes(z, at); } catch { return NaN; } })).size;
}

/** The zone city of an IANA name ("America/Argentina/Buenos_Aires" → "Buenos Aires"). */
export const zoneCity = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ");
