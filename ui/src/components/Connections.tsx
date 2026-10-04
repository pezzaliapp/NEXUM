// CONNESSIONI — the first thing OBJECT MODE says about an element: what it is connected to, of what nature, and
// the way to "Perché?". Every row is a pivot (same selection, same trail, Map · Graph · Timeline follow).
// Context that is not a connection (events sharing one element, proximity) stays apart, closed, and says what it is.

import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { buildConnections, excludedBy, type Connections as C } from "../lib/connections";
import { duration, km, utc } from "../lib/format";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { Ref, Support, WhyButton } from "./common";
import { typeLabelOf, useSummaries } from "./Highlights";
import { sentence, summaryOf } from "../lib/summary";

const LIMIT = 5;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function openSection(name: string) {
  const el = document.querySelector(`[data-section="${name}"]`) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ block: "start", behavior: "smooth" });
}
const SECTION_OF: Record<string, string> = { insight: "insights", relation: "relations", role: "related-events" };

/** The connections of an element, from its context once it is in the store (fetched by the focus card). */
export function useConnections(id: string | null): C | null {
  const ctx = useStore((s) => s.context);
  const types = useStore((s) => s.types);
  useStore((s) => s.rev);
  const e = store.entity(id);
  if (!id || !e || ctx?.id !== id) return null;
  return buildConnections(id, e.kind, e.type, e.details, ctx.data, {
    typeLabel: (t) => types.get(t)?.label ?? t.replace(/[._]/g, " "),
    entityLabel: (x) => store.entity(x)?.label ?? null, entityKind: (x) => store.entity(x)?.kind ?? null,
    entityType: (x) => store.entity(x)?.type ?? null, day: (ms) => utc(ms, "day"), km: (n) => km(n), duration: (ms) => duration(ms),
  });
}

/** Connected elements that the active filters exclude from the views (they stay listed in the card, marked). When a
 * confidence filter is active, the confidence of each connected element is read from the Core (refs). */
export function useExcluded(targets: string[]): Set<string> {
  const scope = useStore((s) => s.scope);
  useStore((s) => s.rev);
  const key = targets.join(",");
  useEffect(() => {
    if (!scope.min_confidence && !scope.sources) return;
    for (const id of targets.filter((t) => store.entity(t)?.confidence == null).slice(0, 24))
      call<any>(`/entities/${id}`, { lod: "refs" }).then((r) => store.normalize(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scope.min_confidence, JSON.stringify(scope.sources)]);
  return new Set(targets.filter((t) => { const e = store.entity(t); return !!e && excludedBy(e, scope).length > 0; }));
}

// plain (a place's overview): what it is connected to and its "Perché?" — the support band and the filter state stay in
// the evidence and in the element's own connections, not on the first surface
function Row({ r, excluded, plain }: { r: C["rows"][number]; excluded: Set<string>; plain?: boolean }) {
  return (
    <li className="conn-row" data-cat={r.cat} data-conn={r.target} data-geo={r.geo || undefined}
      data-excluded={excluded.has(r.target) || undefined}>
      <div className="conn-line">
        <span className="conn-phrase">{cap(r.phrase)}</span><span className="conn-arrow" aria-hidden>→</span>
        <Ref id={r.target} origin="connections" />
      </div>
      {(r.confidence != null || r.why || excluded.has(r.target)) && (
        <div className="conn-meta">
          {!plain && excluded.has(r.target) && <span className="tag-excl" data-testid="conn-excluded">{S.hidden.tag}</span>}
          <span className="grow" />
          {!plain && r.confidence != null && <Support value={r.confidence} />}
          {r.why && <WhyButton id={r.why} />}
        </div>)}
      {(r.cat === "insight" && sentence(summaryOf(r.target), typeLabelOf)) ? <div className="conn-detail conn-result">{sentence(summaryOf(r.target), typeLabelOf)}</div>
        : r.detail && <div className="conn-detail">{r.detail}</div>}
      {r.more ? <button type="button" className="linklike xs" onClick={() => openSection(SECTION_OF[r.cat])}>
        {S.conn.andMore(r.more)}</button> : null}
    </li>);
}

export function ConnectionsBlock({ c, plain }: { c: C; plain?: boolean }) {
  const [all, setAll] = useState(false);
  // a connection found by a rule says its result (the facts of its members) instead of the rule's prose
  const insightIds = c.rows.filter((r) => r.cat === "insight").map((r) => r.target);
  useSummaries(insightIds);
  const excluded = useExcluded([...c.rows, ...c.geo].map((r) => r.target));
  const rows = all ? c.rows : c.rows.slice(0, LIMIT);
  const ctxCount = c.sameTerritory.items.length + c.nearby.length;
  return (
    <section className="conn" data-section="connections" data-testid="connections" data-rows={c.rows.length}>
      <div className="conn-h">{S.conn.title}</div>
      {c.empty && <p className="conn-empty" data-testid="conn-empty">{c.empty}</p>}
      <ul className="conn-list">
        {rows.map((r) => <Row key={`${r.cat}-${r.target}-${r.phrase}`} r={r} excluded={excluded} plain={plain} />)}
      </ul>
      {c.rows.length > LIMIT && <button type="button" className="linklike xs" data-testid="conn-all" onClick={() => setAll(!all)}>
        {all ? S.conn.fewer : S.conn.all(c.rows.length)}</button>}
      {c.geo.length > 0 && (
        <div className="conn-geo" data-testid="conn-geo">
          <div className="conn-h sub">{S.conn.geo}</div>
          <ul className="conn-list">{c.geo.map((r) => <Row key={`g-${r.cat}-${r.target}-${r.phrase}`} r={r} excluded={excluded} plain={plain} />)}</ul>
        </div>)}
      {ctxCount > 0 && (
        <details className="conn-ctx" data-testid="conn-context">
          <summary>{S.conn.context} <span className="count">{ctxCount}</span></summary>
          {c.sameTerritory.items.length > 0 && <div className="conn-ctx-group" data-testid="conn-same-territory">
            <div className="small">{S.conn.sameTerritory(c.sameTerritory.items.length, c.sameTerritory.via)}</div>
            <div className="xs dim">{S.conn.sameTerritoryNote}</div>
            <ul className="list">{c.sameTerritory.items.map((it) => (
              <li key={it.id} className="row"><span className="grow"><Ref id={it.id} origin="connections" /></span>
                {it.t != null && <span className="mono xs dim">{utc(it.t, "day")}</span>}</li>))}</ul>
          </div>}
          {c.nearby.length > 0 && <div className="conn-ctx-group" data-testid="conn-nearby">
            <div className="small">{S.conn.nearby(c.nearbyTotal)}</div>
            <div className="xs dim">{S.conn.nearbyNote}</div>
            <ul className="list">{c.nearby.map((n) => (
              <li key={n.id} className="row"><span className="grow"><Ref id={n.id} origin="connections" /></span>
                <span className="mono xs dim">{km(n.km)}</span></li>))}</ul>
          </div>}
        </details>)}
      <ViewsRow />
    </section>
  );
}

/** Map · Graph · Timeline: three ways of looking at the same connections (same focus). */
function ViewsRow() {
  // the card steps back to its name line on Graph and Time (they show the connections themselves)
  const go = (v: "map" | "graph" | "time") => store.set({ mobileTab: v, sheet: v === "map" ? "peek" : "mini",
    ...(v === "time" ? {} : { stage: v }) });
  return (
    <div className="conn-views" data-testid="conn-views"><span className="xs dim">{S.conn.see}</span>
      <button type="button" className="chip" aria-label={`${S.conn.see} ${S.views.map}`} onClick={() => go("map")}>{S.views.map}</button>
      <button type="button" className="chip" aria-label={`${S.conn.see} ${S.views.graph}`} onClick={() => go("graph")}>{S.views.graph}</button>
      <button type="button" className="chip not-desk" aria-label={`${S.conn.see} ${S.views.time}`} onClick={() => go("time")}>{S.views.time}</button>
    </div>
  );
}
