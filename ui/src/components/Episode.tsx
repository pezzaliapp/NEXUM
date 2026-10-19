import type { ReactNode } from "react";
import { store, useStore } from "../store";
import { Ref } from "./common";
import NEWS_UI from "../config/publicorder.json";

// DOCUMENTED EPISODES (2026-10-19, author's authorisation, local example: Milan, 17–18 October 2026): events written
// by hand from public sources that were read (connectors/curated_public_order.json). Their card says what happened
// with the sources of each line, the figures as claims (who gave them, who reported them, when), statements and
// accusations as such, the documented roles only, and "no attribution" when there is none. Never GDELT's coding.
const E = (NEWS_UI as any).episodes;

type Src = { ref: string; outlet: string; title: string; url: string; published: string };

/** "17 ottobre 2026" or "18 ottobre 2026, 15:05" (Milan's time) — the time only when the sources give it. */
function localWhen(ms: number | null | undefined, precision: string | null | undefined) {
  if (ms == null) return "";
  const o: Intl.DateTimeFormatOptions = { timeZone: precision === "day" ? "UTC" : "Europe/Rome", day: "numeric", month: "long", year: "numeric",
    ...(precision === "day" ? {} : { hour: "2-digit", minute: "2-digit" }) };
  return new Intl.DateTimeFormat("it-IT", o).format(new Date(ms));
}

function Cites({ keys, srcs, lead = " — " }: { keys: string[]; srcs: Map<string, Src>; lead?: string }) {
  return <span className="xs dim">{lead}{keys.map((k, i) => { const s = srcs.get(k); return s
    ? <span key={k}>{i ? ", " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer" data-testid="episode-cite">{s.outlet}</a></span> : null; })}</span>;
}

/** The card of one documented episode. */
export function EpisodeRecord({ d }: { d: any }) {
  const p = d?.properties ?? {};
  const srcs = new Map<string, Src>(((p.sources ?? []) as Src[]).map((s) => [s.ref, s]));
  const S = E.sections;
  const roles = (d?.participants ?? []).filter((x: any) => E.roles[x.role]);
  return (
    <section className="episode conn-pad" data-testid="episode-record" data-category={p.category} data-verification={p.verification}>
      <p className="xs warn" data-testid="episode-draft">{(E.review as Record<string, string>)[p.review] ?? ""}</p>
      <div className="conn-h">{S.what}</div>
      <p className="small">{p.summary}</p>
      {(p.facts ?? []).length > 0 && <ul className="list small" data-testid="episode-facts">{(p.facts as any[]).map((f, i) => <li key={i}>{f.text}<Cites keys={f.sources} srcs={srcs} /></li>)}</ul>}
      <div className="conn-h">{S.where}</div>
      {/* figures and statements: when they were given, not a time of the violence */}
      <p className="small" data-testid="episode-where">{p.place_detail} · {p.when_note ?? localWhen(d?.t_start_ms, d?.t_precision)}</p>
      <p className="xs">{E.verification}: <b data-testid="episode-verification">{p.verification_name}</b></p>
      <p className="xs dim" data-testid="episode-verification-note">{E.verificationNote}</p>
      {(p.figures ?? []).length > 0 && <><div className="conn-h">{S.figures}</div>
        <ul className="list small" data-testid="episode-figures">{(p.figures as any[]).map((f, i) => <li key={i}><b>{f.text}</b>
          <span className="xs dim"> · {E.figureBy} {f.by} · {E.reportedBy}</span><Cites keys={f.reported_by} srcs={srcs} lead=" " />
          {f.as_of && <span className="xs dim"> · {E.asOf} {f.as_of.replace("T", " ")}</span>}</li>)}</ul></>}
      {(p.statements ?? []).length > 0 && <><div className="conn-h">{S.statements}</div>
        <ul className="list small" data-testid="episode-statements">{(p.statements as any[]).map((s, i) => <li key={i} data-nature={s.nature}>
          <span className="ops-badge rep">{E.nature[s.nature] ?? s.nature}</span> {s.by && <b>{s.by}: </b>}{s.text}
          <span className="xs dim"> · {E.reportedBy}</span><Cites keys={s.reported_by} srcs={srcs} lead=" " /></li>)}</ul></>}
      <div className="conn-h">{S.who}</div>
      {roles.length ? <ul className="list small" data-testid="episode-roles">{roles.map((r: any) => <li key={`${r.role}-${r.object?.$ref}`}>
        {r.object && <Ref id={r.object.$ref} />} <span className="xs dim">· {E.roles[r.role]}</span></li>)}</ul>
        : <p className="xs dim" data-testid="episode-roles-none">{E.rolesNone}</p>}
      <div className="conn-h">{S.attrib}</div>
      <p className="xs" data-testid="episode-attrib">{(p.attributions ?? []).length ? "" : E.attribNone}</p>
      {(p.notes ?? []).length > 0 && <><div className="conn-h">{S.notes}</div>{(p.notes as string[]).map((n) => <p key={n} className="xs dim">{n}</p>)}</>}
      <div className="conn-h">{S.sources}</div>
      <ul className="list xs" data-testid="episode-sources">{[...srcs.values()].map((s) => <li key={s.ref}>
        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.outlet} — {s.title} ↗</a> <span className="dim">· {s.published.replace("T", " ")}</span></li>)}</ul>
      <p className="xs faint">{E.noPersons}</p>
    </section>);
}

/** The office holders on the episode's day (Wikidata), apart from the card and after it: institutional context, never a
 *  role in the episode (the sources do not link them to it; a statement is in the card, with its sources). */
export function EpisodeContext({ children }: { children: ReactNode }) {
  return (
    <section className="episode-context conn-pad" data-testid="episode-context">
      <div className="conn-h">{E.sections.context}</div>
      <p className="xs dim">{E.contextNote}</p>
      {children}
    </section>);
}

/** The documented episodes of a place, first in its news; the place's other events stay where they are. Read from
 *  the place's context (its related events, already loaded with the card): no request of its own. */
export function PlaceEpisodes({ id }: { id: string }) {
  const ctx = useStore((s) => s.context);
  const items = (ctx?.id === id ? (ctx.data?.related_events?.items ?? []) as any[] : [])
    .map((it) => store.entity(it.$ref)).filter((e: any) => e?.type === E.type)
    .sort((a: any, b: any) => (a.t ?? 0) - (b.t ?? 0));
  if (!items.length) return null;
  return (
    <div className="xs" data-testid="place-episodes">
      <div className="hl-h">{E.title} · {items.length}</div>
      <p className="dim">{E.intro} {E.reviewList}</p>
      <ul className="ov-some">{items.map((e: any) => <li key={e.id} data-testid="place-episode"><Ref id={e.id} origin="place" /></li>)}</ul>
    </div>);
}
