// NEWS FRESHNESS (2026-10-18): what the news layer and its panels say about the data they show — never "live": GDELT
// publishes a file every 15 minutes, read by the browser on request; the snapshot's table is an archive of one past
// hour. Pure: tested in tests/unit/gdelt.test.ts.

export type NewsClass = "fresh" | "late" | "archive" | "none";
export interface NewsStatusLike { mode: "live" | "archive"; latestMs: number | null; from: string | null; to: string | null; hours: number; error: string | null }

const LATE_MS = 45 * 60_000;      // three GDELT slots: later than that, GDELT itself (or the network) is behind
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const dayHm = (s: string) => {
  const t = Date.parse(`${s}:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : s;
};
export function ageText(ms: number, now: number): string {
  const m = Math.round((now - ms) / 60000);
  return m < 1 ? "ora" : m < 90 ? `${m} min fa` : m < 2880 ? `${Math.round(m / 60)} h fa` : `${Math.round(m / 1440)} giorni fa`;
}

/** The class and the sentence of the news feed's state. */
export function newsState(s: NewsStatusLike | null, now: number): { cls: NewsClass; text: string } {
  if (!s) return { cls: "none", text: "si scarica da GDELT quando attivi il livello o apri le allerte" };
  if (s.mode === "archive") {
    const when = s.from ? `${dayHm(s.from)}–${s.to ? s.to.slice(11, 16) : ""} UTC` : "data non registrata";
    return { cls: "archive", text: `ARCHIVIO del ${when}, non in diretta${s.error ? ` · GDELT non raggiungibile ora (${s.error})` : ""}` };
  }
  if (s.latestMs == null) return { cls: "late", text: "GDELT: ora dell'ultimo file sconosciuta" };
  const late = now - s.latestMs > LATE_MS;
  return { cls: late ? "late" : "fresh",
    text: `${late ? "GDELT IN RITARDO: ultimo file" : "aggiornato da GDELT ogni 15 min · ultimo file"} ${hm(s.latestMs)} UTC (${ageText(s.latestMs, now)}) · finestra ${s.hours} h${s.error ? ` · ${s.error}` : ""}` };
}
