// EVENTS COVERAGE (2026-10-11): what the events of the published world are made of — for each source the day it last
// delivered data (the world's own record, never the device or the snapshot), what it covers, what NEXUM does not
// monitor, and where the only live data are. One short line and one folded list: never a "LIVE" for snapshot data.

import COV from "../config/events-coverage.json";
import { dayLabel } from "../lib/period";
import { S } from "../lib/strings";
import { useStore } from "../store";

const DAY = 864e5;
const STALE_DAYS = 2;

/** The day each event source last delivered data (null when the world has no record of it). */
export function useEventSourceDays(): { id: string; what: string; src: string; ms: number | null }[] {
  const status = useStore((s) => s.status);
  const by = new Map((status?.sources ?? []).map((s) => [s.source_id, s]));
  return COV.sources.filter((c) => by.has(c.id)).map((c) => ({ ...c, ms: by.get(c.id)?.last_success_ms ?? null }));
}

export function EventsCoverage() {
  const rows = useEventSourceDays();
  if (!rows.length) return null;
  const known = rows.map((r) => r.ms).filter((m): m is number => m != null);
  // the line says the OLDEST day: every event source has data at least up to it
  const oldest = known.length ? Math.min(...known) : null;
  const age = oldest != null ? Math.floor((Date.now() - oldest) / DAY) : null;
  return (
    <div className="evcov xs" data-testid="events-coverage">
      <p className={age != null && age > STALE_DAYS ? "warn" : "dim"} data-testid="events-coverage-line">
        {oldest != null ? S.evcov.line(dayLabel(oldest)) : S.evcov.noDate}{age != null && age > STALE_DAYS ? S.evcov.stale(age) : ""}
      </p>
      <p className="dim" data-testid="events-coverage-missing">{S.evcov.missing}</p>
      <details data-testid="events-coverage-more">
        <summary>{S.evcov.more}</summary>
        <ul className="list">{rows.map((r) => (
          <li key={r.id} data-source={r.id} data-ms={r.ms ?? ""}>{r.what} · <span className="dim">{r.src} · {r.ms != null ? S.evcov.at(dayLabel(r.ms)) : S.evcov.noDate}</span></li>))}
        </ul>
        <p className="dim">{COV.live}</p>
      </details>
    </div>);
}
