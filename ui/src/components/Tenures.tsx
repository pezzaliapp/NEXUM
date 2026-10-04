// GOVERNMENT AND HEADS (Phase 3B · block 3): who holds the offices with competence over the element in focus, since
// when, with the statement that says so; the terms of an office or of a person; and, for an event, "it happened
// during the term of X" — temporal context, never a cause. Role facts only (privacy gate): no photo, no personal data.

import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { duringOn, type Office, type Term } from "../lib/tenures";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { Section } from "./common";

interface Pkg { by_entity: Record<string, string[]>; offices: Record<string, Office>; byPerson: Map<string, [string, Term][]> }

const FIRST_LOAD_DELAY_MS = 800;
let pkg: Promise<Pkg> | null = null;
let pkgVersion: number | null = null;
function load(wv: number | null): Promise<Pkg> {
  if (!pkg || pkgVersion !== wv) {
    pkgVersion = wv;
    pkg = call<any>("/tenures", undefined, { channel: "tenures" }).then((r) => {
      const byPerson = new Map<string, [string, Term][]>();
      for (const [oid, o] of Object.entries(r.data.offices as Record<string, Office>))
        for (const t of o.terms) byPerson.set(t[0], [...(byPerson.get(t[0]) ?? []), [oid, t]]);
      return { ...r.data, byPerson };
    });
    pkg.catch(() => { pkg = null; });
  }
  return pkg;
}

/** Whether the element can have tenure information: an office type itself, or elements of an office type related to it. */
function relevant(id: string, ctxData: any): boolean {
  const types = store.get().types;
  const e = store.entity(id);
  if (e?.kind === "event") return true;
  if (types.get(e?.type ?? "")?.tenure) return true;
  return (ctxData?.relations?.groups ?? []).some((g: any) => (g.items ?? []).some((it: any) =>
    types.get(store.entity(it.other?.$ref)?.type ?? "")?.tenure));
}

const pick = (id: string) => store.select(id, "place");
const range = (t: Term) => t[3] ? S.gov.range(t[2] ?? "?", t[3]) : t[4] === "superseded" ? `${S.gov.since(t[2] ?? "?")} · ${S.gov.noEnd}` : S.gov.since(t[2] ?? "?");
const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");

export type TenurePkg = Pkg;

/** The tenures package (null while loading). `immediate`: the element's own view asks for it as content. */
export function useTenures(enabled: boolean, key: string, immediate = false): Pkg | null {
  const wv = useStore((s) => s.worldVersion);
  const [p, setP] = useState<Pkg | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // the first download of the package waits a moment: a person moving on to another element never has its
    // context queued behind this one's secondary information (once loaded, it is immediate)
    const go = () => load(wv).then((x) => { if (live) setP(x); }, () => {});
    const t = immediate || (pkg && pkgVersion === wv) ? (go(), 0) : window.setTimeout(go, FIRST_LOAD_DELAY_MS);
    return () => { live = false; window.clearTimeout(t); };
  }, [enabled, wv, key, immediate]);
  return p;
}

/** The current holders of the offices with competence over an element: [office id, office, current terms]. */
export function currentHolders(p: Pkg, id: string): [string, Office, Term[]][] {
  return (p.by_entity[id] ?? []).map((o) => [o, p.offices[o]] as const).filter(([, o]) => o)
    .sort(([, a], [, b]) => (a.role ?? "").localeCompare(b.role ?? ""))
    .map(([oid, o]) => [oid, o, o.terms.filter((t) => t[4] === "current" || t[4] === "conflict")]);
}

export function TenuresBlock({ id, ctxData, immediate = false }: { id: string; ctxData: any; immediate?: boolean }) {
  const show = relevant(id, ctxData);
  const p = useTenures(show, id, immediate);
  if (!show || !p) return null;
  const e = store.entity(id);
  if (e?.kind === "event") return <During p={p} id={id} ctxData={ctxData} />;
  if (p.offices[id]) return <section className="gov" data-testid="gov"><OfficeCard id={id} o={p.offices[id]} open /><Foot /></section>;
  if (p.byPerson.has(id)) return <PersonTerms p={p} id={id} />;
  const offs = (p.by_entity[id] ?? []).map((o) => [o, p.offices[o]] as const).filter(([, o]) => o)
    .sort(([, a], [, b]) => (a.role ?? "").localeCompare(b.role ?? ""));
  if (!offs.length) return null;
  return (
    <section className="gov" data-testid="gov">
      <div className="conn-h">{S.gov.title}</div>
      {offs.map(([oid, o]) => <OfficeCard key={oid} id={oid} o={o} />)}
      <Foot />
    </section>);
}

function Foot() {
  return <p className="xs faint gov-foot">{S.gov.privacy} {S.gov.source} ·{" "}
    <a href={S.gov.rectifyUrl} target="_blank" rel="noopener noreferrer" data-testid="gov-rectify">{S.gov.rectify}</a></p>;
}

function OfficeCard({ id, o, open = false }: { id: string; o: Office; open?: boolean }) {
  const cur = o.terms.filter((t) => t[4] === "current" || t[4] === "conflict");
  const hist = [...o.terms].filter((t) => !cur.includes(t)).sort((a, b) => (b[2] ?? "").localeCompare(a[2] ?? ""));
  return (
    <div className="gov-office" data-testid="gov-office" data-outcome={o.outcome}>
      <div className="gov-role xs dim">{o.role}</div>
      <button type="button" className="linklike gov-olabel" onClick={() => pick(id)}>{o.label}</button>
      {o.outcome === "none" && <p className="xs dim" data-testid="gov-none">{S.gov.none}</p>}
      {o.outcome === "ambiguous" && <p className="xs warn" data-testid="gov-conflict">{S.gov.conflict}</p>}
      {o.outcome === "collegial" && <p className="xs dim">{S.gov.collegial}</p>}
      {cur.map((t) => <TermRow key={`${t[5]}`} t={t} o={o} />)}
      {hist.length > 0 && <Section title={S.gov.history(hist.length)} name="gov-history" open={open}>
        {hist.map((t) => <TermRow key={`${t[5]}`} t={t} o={o} />)}
      </Section>}
    </div>);
}

function TermRow({ t, o, office }: { t: Term; o: Office; office?: string }) {
  const [person, label, , , status, statement, refs, rank, flags, retrieved] = t;
  return (
    <details className="gov-term" data-testid="gov-term" data-status={status}>
      <summary>
        <button type="button" className="linklike" data-ref={person} onClick={(ev) => { ev.preventDefault(); pick(person); }}>{office ?? label}</button>
        <span className="xs dim"> · {range(t)}</span>
        {status !== "current" && status !== "ended" && <span className="xs warn"> · {S.gov.status[status] ?? status}</span>}
      </summary>
      <dl className="kv obs-kv">
        <dt>{S.gov.statement}</dt><dd className="mono small">{statement ?? "—"}</dd>
        <dt>{S.gov.refs}</dt><dd>{refs ?? 0}</dd>
        {rank && <><dt>{S.gov.rank}</dt><dd>{rank}</dd></>}
        <dt>{S.gov.retrieved}</dt><dd>{day(retrieved)}</dd>
        {o.check && <><dt>{S.gov.jurisdiction}</dt><dd>{o.check}</dd></>}
        {flags.length > 0 && <><dt>{S.gov.flags}</dt><dd>{flags.join(" · ")}</dd></>}
        <dt>{S.obs.source}</dt><dd>{S.gov.source}</dd>
      </dl>
    </details>);
}

function PersonTerms({ p, id }: { p: Pkg; id: string }) {
  const terms = (p.byPerson.get(id) ?? []).sort(([, a], [, b]) => (b[2] ?? "").localeCompare(a[2] ?? ""));
  return (
    <section className="gov" data-testid="gov-person">
      <div className="conn-h">{S.gov.personTerms}</div>
      {terms.map(([oid, t]) => <TermRow key={`${t[5]}`} t={t} o={p.offices[oid]} office={p.offices[oid].label} />)}
      <Foot />
    </section>);
}

/** An event: the holders of the offices with competence over the places it is located in, on its day. */
function During({ p, id, ctxData }: { p: Pkg; id: string; ctxData: any }) {
  const e = store.entity(id);
  const t: number | null = e?.details?.t_start_ms ?? e?.t ?? null;
  if (t == null) return null;
  const places = new Set<string>();
  // the places containing it (geography) and those it is related to: only those with offices in the package
  for (const c of ctxData?.geography?.containing ?? []) if (p.by_entity[c.$ref]) places.add(c.$ref);
  for (const g of ctxData?.relations?.groups ?? []) if (g.direction === "out") for (const it of g.items ?? []) if (p.by_entity[it.other?.$ref]) places.add(it.other.$ref);
  const offs = [...places].flatMap((pl) => p.by_entity[pl].map((o) => [o, p.offices[o]] as [string, Office]));
  const found = duringOn(offs, new Date(t).toISOString().slice(0, 10));
  if (!found.length) return null;
  return (
    <section className="gov" data-testid="gov-during">
      <div className="conn-h">{S.gov.during}</div>
      {found.map((d) => d.ambiguous
        ? <p key={d.office} className="xs warn" data-testid="during-ambiguous">{S.gov.duringAmbiguous(d.officeLabel)}</p>
        : <p key={d.office} className="xs during-line" data-testid="during-line">
            {S.gov.duringPre}{d.holders.map((h, i) => <span key={h[0]}>{i > 0 ? " e " : ""}<button type="button" className="linklike xs"
              data-ref={h[0]} onClick={() => pick(h[0])}>{h[1]}</button></span>)}{S.gov.duringPost(d.officeLabel, d.holders.map(range).join("; "))}</p>)}
      <p className="xs faint">{S.gov.duringNote} {S.gov.source}</p>
    </section>);
}
