// LOCAL DATE AND TIME in a place's header (2026-10-04), from its IANA zone (Intl, daylight saving time included):
//   a place with its own zone (vocabulary data "timezone")      → "Ora locale · 4 ottobre 2026 · 17:45 CEST · UTC+2"
//   a place with a two-letter code and one offset               → the same, from config/timezones.json (IANA zone.tab)
//   a place spanning several offsets                            → "Più fusi orari (N)" and the CAPITAL's time, said as the
//                                                                 capital's — never one "national" time
// Refreshed every 15 seconds, without reload. Loaded lazily (the zone table stays out of the first download).
import { useEffect, useState } from "react";
import TZ from "../config/timezones.json";
import { distinctOffsets, localTime, zoneCity } from "../lib/localtime";
import { S } from "../lib/strings";

const BY = (TZ as any).by_code as Record<string, { zones: string[]; capital?: [string, string] }>;

export default function LocalTime({ zone, code }: { zone?: string | null; code?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  const row = code ? BY[code] : undefined;
  let lead: string, z: string | undefined, multi = 0;
  if (zone) { lead = S.clock.local; z = zone; }
  else if (row?.zones.length) {
    multi = distinctOffsets(row.zones, now);
    if (multi <= 1) { lead = S.clock.local; z = row.zones[0]; }
    else if (row.capital) { lead = S.clock.capital(row.capital[0]); z = row.capital[1]; }
    else { lead = S.clock.ofCity(zoneCity(row.zones[0])); z = row.zones[0]; }
  } else return null;
  const t = localTime(z!, now);
  if (!t) return null;
  return (
    <div className="xs dim localtime" data-testid="local-time" data-zone={t.zone} data-utc={t.utc} data-multi={multi > 1 ? multi : undefined}>
      {multi > 1 && <span data-testid="local-time-multi">{S.clock.multi(multi)} · </span>}
      <span>{lead}</span> · <span>{t.date}</span> · <b>{t.time}</b>{t.abbr ? ` ${t.abbr}` : ""} · <span>{t.utc}</span>
    </div>);
}
