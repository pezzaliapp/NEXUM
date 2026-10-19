// SOURCE FRESHNESS (2026-10-18): the Core's "ok" means the last download succeeded, not that it is recent. For the
// sources whose data are presented as current (config freshness.json), an old last success is said as "stale".

import FRESH from "../config/freshness.json";

const MAX = FRESH.maxAgeHours as Record<string, number>;

/** The health to show: the Core's, or "stale" when a source presented as current last delivered too long ago. */
export function shownHealth(s: { source_id: string; health: string; last_success_ms: number | null }, now = Date.now()): string {
  const h = MAX[s.source_id];
  if (s.health === "ok" && h != null && (s.last_success_ms == null || now - s.last_success_ms > h * 3_600_000)) return "stale";
  return s.health;
}
/** Days since the last success of a source presented as current, when it is stale (else null). */
export function staleDays(s: { source_id: string; health: string; last_success_ms: number | null } | undefined, now = Date.now()): number | null {
  if (!s || shownHealth(s, now) !== "stale" || s.last_success_ms == null) return null;
  return Math.floor((now - s.last_success_ms) / 864e5);
}
