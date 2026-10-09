// WORLD MODE — "Cosa sta succedendo" (revised 2026-10-03): first the recent events that matter (the vocabulary's
// severity), then the strongest of the last 12 months of the data, a place to explore, what NEXUM found, the active
// domains — and only then, secondary and folded, the DOCUMENTED CHANGES (a new office holder, a new statistical
// release): they are changes of records, not world events, and are never mixed with them. Every line opens its element.
// Data: GET /highlights (computed from the Core's tables by the API layer).

import { ExploreBox, WorldChanges } from "./Explore";
import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { dayLabel } from "../lib/period";
import { colorOf, SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { head, loadAll, register, sentence, summaryOf, type Summary } from "../lib/summary";
import { store, useStore } from "../store";
import { ErrorNote, useFetch } from "./common";
import { Freshness } from "./Period";

export const typeLabelOf = (t: string) => store.get().types.get(t)?.label ?? t.replace(/[._]/g, " ");

/** The summaries of the given rule outputs (loaded once, on demand); re-renders when they arrive. */
export function useSummaries(ids: string[]) {
  const [, tick] = useState(0);
  const missing = ids.some((id) => !summaryOf(id));
  useEffect(() => {
    if (!missing) return;
    loadAll(() => call<any>("/insight-summaries", undefined, { channel: "summaries" }).then((r) => r.data.summaries))
      .then(() => tick((n) => n + 1));
  }, [missing, ids.join(",")]);
}

export function useHighlights() {
  const wv = useStore((s) => s.worldVersion);
  return useFetch(JSON.stringify(["hl", wv]), () => call<any>("/highlights", undefined, { channel: "highlights" })
    .then((r) => {
      for (const c of r.data.connections ?? []) register(c.ref.id, c.summary as Summary);
      return { ...r, data: store.normalize(r.data) };
    }));
}

/** One discovery: the rule's name, the sentence of its facts, the date; the whole line opens it. */
export function Discovery({ id, compact = false }: { id: string; compact?: boolean }) {
  const e = store.entity(id);
  const s = summaryOf(id);
  const text = sentence(s, typeLabelOf);
  return (
    <li className={`disc${compact ? " compact" : ""}`}>
      <button type="button" className="disc-btn" data-ref={id} data-discovery={id} onClick={() => store.select(id, "highlights")}>
        <span className="disc-kind"><span className="shape" style={{ color: colorOf(undefined, "insight") }} aria-hidden>{SHAPE.insight}</span> {s?.r ?? e?.label}</span>
        {text && <span className="disc-text">{text}</span>}
        {!compact && e?.t != null && <span className="disc-date">{dayLabel(e.t)}</span>}
      </button>
    </li>);
}

/** An event: what (type) and its headline fact, its name, when; the line opens it. */
export function EventLine({ id, h }: { id: string; h?: any[] }) {
  const e = store.entity(id);
  const t = store.get().types.get(e?.type ?? "");
  const fact = head(h as any);
  return (
    <li className="disc">
      <button type="button" className="disc-btn" data-ref={id} onClick={() => store.select(id, "highlights")}>
        <span className="disc-kind"><span className="shape" style={{ color: colorOf(t?.family, e?.kind, t?.id) }} aria-hidden>{SHAPE[e?.kind ?? "event"]}</span> {t?.label}{fact ? ` · ${fact}` : ""}</span>
        <span className="disc-text">{e?.label}</span>
        {e?.t != null && <span className="disc-date">{dayLabel(e.t)}</span>}
      </button>
    </li>);
}

export function Highlights() {
  const types = useStore((s) => s.types);
  useStore((s) => s.mapTypes);
  useStore((s) => s.rev);
  const h = useHighlights();
  const d = h.data?.data;
  if (h.error) return <div style={{ padding: 12 }}><ErrorNote error={h.error} /></div>;
  if (!d) return <p className="note" style={{ padding: 12 }}>{S.loading}</p>;
  const only = (t: string) => store.showOnly(t);
  const mapTypes = store.get().mapTypes;
  return (
    <section className="highlights" data-testid="highlights">
      <div className="hl-head"><strong>{S.hl.title}</strong><Freshness className="xs dim" /></div>
      {d.recent.length > 0 && <><div className="hl-h">{S.hl.recent}</div>
        <ul className="hl-list" data-testid="hl-recent">{d.recent.map((r: any) => <EventLine key={r.$ref} id={r.$ref} h={r.head} />)}</ul></>}
      {d.strongest.length > 0 && <><div className="hl-h">{S.hl.strongest}</div>
        <ul className="hl-list" data-testid="hl-strongest">{d.strongest.map((r: any) => <EventLine key={r.$ref} id={r.$ref} h={r.head} />)}</ul></>}
      <ExploreBox suggestions={d.explore ?? []} />
      {d.connections.length > 0 && (
        <>
          <div className="hl-h">{S.hl.connections}</div>
          <ul className="hl-list" data-testid="hl-connections">{d.connections.slice(0, 6).map((c: any) => <Discovery key={c.ref.$ref} id={c.ref.$ref} />)}</ul>
        </>)}
      {d.domains.length > 0 && (
        <>
          <div className="hl-h">{S.hl.domains}</div>
          <div className="hl-domains" data-testid="hl-domains">
            {d.domains.map((x: any) => {
              const t = types.get(x.type);
              const on = Array.isArray(mapTypes) && mapTypes.length === 1 && mapTypes[0] === x.type;
              return (
                <button key={x.type} type="button" className="chip" aria-pressed={on} data-type={x.type} title={S.hl.onlyThis}
                  onClick={() => (on ? store.setMapTypes(store.get().defaults.mapTypes) : only(x.type))}>
                  <span style={{ color: colorOf(t?.family, t?.kind, t?.id) }} aria-hidden>{SHAPE[t?.kind ?? "event"]}</span> {t?.label ?? x.type} · {x.n.toLocaleString("it-IT")}
                </button>);
            })}
          </div>
        </>)}
      {/* documented changes: secondary, folded — never mixed with the world's events */}
      <details className="hl-changes-fold" data-testid="hl-changes-fold">
        <summary className="hl-h">{S.changes.title}</summary>
        <WorldChanges c={d.changes} />
      </details>
    </section>);
}

export { head };
