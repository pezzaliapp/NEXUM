// WORLD DISCOVERY (2026-10-03): the world panel says, at a glance, that its explorable elements (vocabulary hint
// "explore") can be opened — a compact search limited to them, the ones with the most data as starting points — and
// what has demonstrably changed in the world of NEXUM (new office holders, new releases of measured data), each with
// WHAT, WHERE, WHEN and its SOURCE. Not a news feed: nothing is listed that the sources did not record.

import { useEffect, useState } from "react";
import { call, isSuperseded } from "../lib/api";
import { periodLabel } from "../lib/observations";
import { S } from "../lib/strings";
import { store, useStore } from "../store";

export function ExploreBox({ suggestions }: { suggestions: [string, string][] }) {
  const types = useStore((s) => s.types);
  const ex = [...types.values()].filter((t) => t.explore);
  const hint = ex[0]?.explore;
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; label: string }[] | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2 || !ex.length) { setRes(null); return; }
    const t = setTimeout(() => {
      call<any>("/search", { q: text, s: { types: ex.map((x) => x.id) }, b: { max_items: 50 } }, { channel: "explore" }).then((r) => {
        const items = ((r.data.groups ?? []) as any[]).flatMap((g) => g.items).map((it) => ({ id: it.id, label: it.label }));
        const low = text.toLowerCase();
        items.sort((a, b) => Number(b.label.toLowerCase() === low) - Number(a.label.toLowerCase() === low));   // exact name first
        setRes(items);
      }, (e) => { if (!isSuperseded(e)) setRes([]); });
    }, 150);
    return () => clearTimeout(t);
  }, [q, ex.length]);
  if (!hint) return null;
  const open = (id: string) => { store.select(id, "explore"); setQ(""); };
  return (
    <section className="explore" data-testid="explore">
      <div className="hl-h">{hint.label}</div>
      <input type="search" value={q} placeholder={hint.placeholder ?? ""} aria-label={hint.label} data-testid="explore-input"
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && res?.[0]) open(res[0].id); }} />
      {res && (res.length ? <ul className="explore-list" data-testid="explore-results">
        {res.map((r) => <li key={r.id}><button type="button" className="linklike" data-ref={r.id} onClick={() => open(r.id)}>{r.label}</button></li>)}
      </ul> : <p className="xs dim">{S.explore.none}</p>)}
      {!q && suggestions.length > 0 && <>
        <div className="xs faint">{S.explore.suggestions}</div>
        <div className="explore-chips" data-testid="explore-suggestions">
          {suggestions.map(([id, label]) => <button key={id} type="button" className="chip" data-ref={id} onClick={() => open(id)}>{label}</button>)}
        </div></>}
      <p className="xs faint">{hint.hint}</p>
    </section>);
}

interface Changes { tenures: { start: string; person: string; person_label: string; office: string; office_label: string; role: string;
  statement: string; where: [string, string][] }[]; releases: { source_id: string; group: string; kind: string; dataset: string | null;
  period: [string | null, string]; n: number }[] }

export function WorldChanges({ c }: { c: Changes | undefined }) {
  const types = useStore((s) => s.types);
  const status = useStore((s) => s.status);
  if (!c || (!c.tenures.length && !c.releases.length)) return null;
  const many = [...types.values()].find((t) => t.explore)?.explore?.many ?? "";
  const src = (id: string) => status?.sources.find((s) => s.source_id === id)?.name.split(" — ")[0] ?? id;
  return (
    <section className="changes" data-testid="hl-changes">
      <ul className="hl-list">
        {c.tenures.slice(0, 3).map((t) => (
          <li key={t.statement} data-testid="change-tenure">
            <div className="xs dim">{S.changes.tenure(t.role)}</div>
            <button type="button" className="linklike" data-ref={t.person} onClick={() => store.select(t.person, "summary")}>{t.person_label}</button>
            <span className="xs dim"> · {t.office_label}</span>
            {t.where[0] && <> · <button type="button" className="linklike xs" data-ref={t.where[0][0]} onClick={() => store.select(t.where[0][0], "summary")}>{t.where[0][1]}</button></>}
            <div className="xs faint">{S.place.since(t.start)} · Wikidata {t.statement.split("-")[0]}</div>
          </li>))}
        {/* moderation: three of each, releases measured in several elements first (then the newest) */}
        {[...c.releases].sort((a, b) => Number(b.n > 1) - Number(a.n > 1) || b.period[1].localeCompare(a.period[1])).slice(0, 3).map((r) => (
          <li key={r.source_id} data-testid="change-release">
            <div className="xs dim">{S.changes.release(r.group)}</div>
            <span>{r.dataset ?? src(r.source_id)}</span>
            <div className="xs faint">{periodLabel([r.period[0], r.period[1], 0, null, null, ""])} · {S.changes.inN(r.n, many)} · {src(r.source_id)}</div>
          </li>))}
      </ul>
      <p className="xs faint">{S.changes.note}</p>
    </section>);
}
