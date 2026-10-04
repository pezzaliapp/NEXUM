// SECURITY ZONES (World Intelligence, 2026-10-03): where UCDP documents lethal organised violence, by first-level
// administrative unit, over the last 90 days of its data — RED: documented violent activity (R1 ≥ 3 lethal events ·
// R2 ≥ 25 deaths in ≥ 2 events); ORANGE: documented exposure (O1 a foreign state actor in a state-based event). Never a
// forecast, never real time (UCDP Candidate data arrive 3–7 weeks late), never "a whole nation at war", never a
// neighbour coloured for being a neighbour. Each zone answers "PERCHÉ QUESTA ZONA?" with its events, period and source.

import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { S } from "../lib/strings";
import { store, useStore } from "../store";

export interface Zone { id: string; place: string | null; adm1: string; gw: number; color: "red" | "orange"; rule: string; events_n: number;
  deaths_best: number; foreign_n: number; first: string; last: string; cells: [number, number][];
  events: [string, string, number, number, number, string, string, string, number, string, string | null, boolean][] }
export interface SecurityPkg { zones: Zone[]; by_place: Record<string, number[]>; anchor: string | null; since: string; window_days: number;
  files: string[]; rules: Record<string, string> }

let pkg: Promise<SecurityPkg> | null = null;
let pkgWv: number | null = null;
export function loadSecurity(wv: number): Promise<SecurityPkg> {
  if (!pkg || pkgWv !== wv) {
    pkgWv = wv;
    pkg = call<any>("/security", undefined, { channel: "security-zones" }).then((r) => r.data as SecurityPkg);
    pkg.catch(() => { pkg = null; });
  }
  return pkg;
}

export function useSecurity(enabled = true): SecurityPkg | null {
  const wv = useStore((s) => s.worldVersion);
  const [d, setD] = useState<SecurityPkg | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadSecurity(wv).then((x) => { if (live) setD(x); }, () => {});
    return () => { live = false; };
  }, [wv, enabled]);
  return d;
}

const nf = new Intl.NumberFormat("it-IT");

export function SecurityZones({ id }: { id: string }) {
  const d = useSecurity(true);
  const on = useStore((s) => s.mapZones);
  if (!d) return <p className="xs dim">{S.loading}</p>;
  const zones = (d.by_place[id] ?? []).map((i) => d.zones[i]);
  return (
    <section className="zones" data-testid="security-zones">
      <div className="obs-topic">{S.zones.title}</div>
      <p className="xs dim" data-testid="zones-window">{S.zones.window(d.since, d.anchor ?? "", d.window_days)}</p>
      {zones.length === 0 ? <p className="xs" data-testid="zones-none">{S.zones.none}</p> : (
        <ul className="zone-list">
          {zones.sort((a, b) => (a.color === b.color ? b.events_n - a.events_n : a.color === "red" ? -1 : 1)).map((z) => (
            <li key={z.id} data-testid="zone" data-color={z.color} data-rule={z.rule}>
              <span className={`zone-dot ${z.color}`} aria-hidden /> <b>{z.adm1}</b>{" "}
              <span className="xs">{z.color === "red" ? S.zones.red : S.zones.orange}</span>
              <span className="xs dim"> · {S.zones.summary(z.events_n, z.deaths_best, z.first, z.last)}</span>
              <details className="zone-why" data-testid="zone-why">
                <summary className="xs linklike">{S.zones.why}</summary>
                <dl className="kv xs">
                  <dt>{S.zones.rule}</dt><dd>{z.rule} — {d.rules[z.rule]}</dd>
                  <dt>{S.zones.period}</dt><dd>{S.zones.window(d.since, d.anchor ?? "", d.window_days)}</dd>
                  <dt>{S.zones.area}</dt><dd>{S.zones.cells(z.cells.length)}</dd>
                  <dt>{S.zones.source}</dt><dd>{S.zones.sourceText(d.files)}</dd>
                </dl>
                <ul className="xs zone-events">
                  {z.events.slice(0, 15).map((e) => (
                    <li key={e[0]} data-testid="zone-event">
                      {e[1]} · {e[5]} · {S.zones.deaths(e[2], e[3], e[4])}{e[11] ? ` · ${S.zones.foreign}` : ""}
                      <span className="dim"> · {e[6]} — {e[7]} · UCDP {e[0]}</span>
                      {e[10] && <> <button type="button" className="linklike" onClick={() => store.select(e[10]!, "place")}>{S.zones.open}</button></>}
                    </li>))}
                </ul>
                {z.events.length > 15 && <p className="xs dim">{S.zones.more(z.events.length - 15)}</p>}
              </details>
            </li>))}
        </ul>)}
      <button type="button" className="primary xs" data-testid="zones-map" aria-pressed={on} onClick={() => store.set({ mapZones: !on })}>
        {on ? S.zones.hideMap : S.zones.showMap}</button>
      <p className="xs faint">{S.zones.note}</p>
    </section>);
}

export { nf };
