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
export function useEventSourceDays(): { id: string; what: string; src: string; auto?: boolean; ms: number | null }[] {
  const status = useStore((s) => s.status);
  const by = new Map((status?.sources ?? []).map((s) => [s.source_id, s]));
  return COV.sources.filter((c) => by.has(c.id)).map((c) => ({ ...c, ms: by.get(c.id)?.last_success_ms ?? null }));
}

export function EventsCoverage() {
  const rows = useEventSourceDays();
  const status = useStore((s) => s.status);
  const day = (id: string) => status?.sources.find((s) => s.source_id === id)?.last_success_ms ?? null;
  if (!rows.length) return null;
  // the line says the OLDEST day of the sources the scheduled update refreshes (every one has data at least up to it); a
  // source updated by hand gets its own date after it (2026-10-18: NOAA NCEI made the whole line look stopped)
  const auto = rows.filter((r) => r.auto), manual = rows.filter((r) => !r.auto && r.ms != null);
  const known = (auto.length ? auto : rows).map((r) => r.ms).filter((m): m is number => m != null);
  const oldest = known.length ? Math.min(...known) : null;
  const age = oldest != null ? Math.floor((Date.now() - oldest) / DAY) : null;
  return (
    <div className="evcov xs" data-testid="events-coverage">
      <p className={age != null && age > STALE_DAYS ? "warn" : "dim"} data-testid="events-coverage-line">
        {oldest != null ? S.evcov.line(dayLabel(oldest)) : S.evcov.noDate}{age != null && age > STALE_DAYS ? S.evcov.stale(age) : ""}
        {auto.length > 0 && manual.length > 0 && <span className="dim" data-testid="events-coverage-manual">{S.evcov.manual(manual.map((r) => `${r.src} ${dayLabel(r.ms!)}`).join(", "))}</span>}
      </p>
      <p className="dim" data-testid="events-coverage-missing">{S.evcov.missing}</p>
      <details data-testid="events-coverage-more">
        <summary>{S.evcov.more}</summary>
        <ul className="list">{rows.map((r) => (
          <li key={r.id} data-source={r.id} data-ms={r.ms ?? ""}>{r.what} · <span className="dim">{r.src} · {r.ms != null ? S.evcov.at(dayLabel(r.ms)) : S.evcov.noDate}</span></li>))}
        </ul>
        <p className="dim">{COV.live}</p>
        <p className="dim" data-testid="events-coverage-partial-h">{S.evcov.partial}</p>
        <ul className="list" data-testid="events-coverage-partial">{COV.partial.map((r) => { const ms = r.archive ? day(r.id) : null; return (
          <li key={r.id} data-source={r.id}>{r.what} · <span className="dim">{r.how}{ms != null ? ` (${r.archive} ${dayLabel(ms)})` : ""}</span></li>); })}
        </ul>
        <p className="dim" data-testid="events-coverage-nd">{COV.notDistinguishable}</p>
      </details>
    </div>);
}
