// ACTIVE FIRE HOTSPOTS, RECENT ONLY (2026-10-21): a NASA FIRMS detection is drawn as an active fire only when it was
// acquired within the last 24 hours of the person's clock (UTC). Older detections stay in the published table (the
// archive) and are never drawn as active: the layer says how many it leaves out and why. Needs no network (offline too).
// Pure functions (no React, no store): unit-tested.

import { dayLabel } from "./period.ts";

export const HOT_MAX_H = 24;
/** A detection acquired after the device's clock by more than this is not trusted as recent (a clock behind). */
const AHEAD_MS = 3_600_000;

/** "2026-10-21T13:45" (UTC, the table's acquired_utc) → ms; null when it cannot be read. */
export function acquiredMs(t: unknown): number | null {
  if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export interface HotSplit<R> { recent: R[]; old: number; newestMs: number | null; oldestMs: number | null }

/** The table's rows ([lon, lat, frp, confidence, acquired_utc, sensor]) seen at `now`: the recent ones, and the count of
 *  the others (older than maxH, unreadable, or ahead of the clock) with the span of acquisition times of all rows. */
export function splitHotspots<R extends unknown[]>(rows: R[], now: number, maxH = HOT_MAX_H): HotSplit<R> {
  const recent: R[] = [];
  let old = 0, newestMs: number | null = null, oldestMs: number | null = null;
  for (const r of rows) {
    const t = acquiredMs(r[4]);
    if (t != null) { newestMs = newestMs == null ? t : Math.max(newestMs, t); oldestMs = oldestMs == null ? t : Math.min(oldestMs, t); }
    if (t != null && t <= now + AHEAD_MS && now - t <= maxH * 3_600_000) recent.push(r); else old++;
  }
  return { recent, old, newestMs, oldestMs };
}

export interface HotStatus { recent: number; old: number; newestMs: number | null; oldestMs: number | null; error: boolean }

/** What the layer says about what it draws, or null when every detection is recent. */
export function hotNote(s: HotStatus | null): { warn: boolean; text: string } | null {
  if (!s) return null;
  if (s.error) return { warn: true, text: "rilevamenti non disponibili ora: nessun punto mostrato come incendio attivo" };
  const span = s.oldestMs != null && s.newestMs != null
    ? (dayLabel(s.oldestMs) === dayLabel(s.newestMs) ? dayLabel(s.newestMs) : `${dayLabel(s.oldestMs)} – ${dayLabel(s.newestMs)}`) : null;
  if (!s.recent && !s.old) return { warn: false, text: "nessun rilevamento nella tabella pubblicata" };
  if (!s.recent) return { warn: true, text: `nessun rilevamento delle ultime ${HOT_MAX_H} ore: i dati disponibili${span ? ` (acquisiti ${span})` : ""} sono storici e non sono mostrati come incendi attivi` };
  if (s.old) return { warn: false, text: `${s.old.toLocaleString("it-IT")} rilevamenti più vecchi di ${HOT_MAX_H} ore non mostrati (restano nell'archivio)` };
  return null;
}

/** The sources of the table (2026-10-22: one per sensor, each fetched and judged on its own). */
export const HOT_SOURCES: Record<string, string> = { "nasa.firms": "NOAA-21", "nasa.firms.noaa20": "NOAA-20" };

interface SrcState { source_id: string; health: string; last_success_ms: number | null }

/** What the layer says about its sources: for each one whose last download failed, that was suspended or that is stale
 *  (`stale` = the app's staleDays), its own line; never hidden behind the other sensor's data. A world published
 *  before the split (nasa.firms only, then both sensors in one source) is said without a sensor's name. */
export function hotSourcesNote(sources: SrcState[] | undefined, stale: (s: SrcState) => number | null): { warn: boolean; text: string } | null {
  const present = (sources ?? []).filter((s) => s.source_id in HOT_SOURCES);
  const named = present.length > 1;
  const parts = present.sort((a, b) => HOT_SOURCES[a.source_id].localeCompare(HOT_SOURCES[b.source_id])).flatMap((s) => {
    const who = named ? `${HOT_SOURCES[s.source_id]}: ` : "";
    const since = s.last_success_ms ? `dati del ${dayLabel(s.last_success_ms)}` : "nessun dato ricevuto";
    if (s.health === "suspended") return [`${who}fonte sospesa dopo errori ripetuti (${since})`];
    if (s.health === "degraded" || s.health === "failed") return [`${who}ultimo aggiornamento non riuscito (${since})`];
    const d = stale(s);
    return d != null && s.last_success_ms ? [`${who}${since}, non aggiornati da ${d} giorni`] : [];
  });
  return parts.length ? { warn: true, text: parts.join("; ") } : null;
}
