// OBJECT MODE — the context around any element, in the same workspace. One call (/context/{id}), twelve sections;
// every reference is a pivot that becomes the new focus.

import LINKS from "../config/record-links.json";
import { lazyStale } from "../lib/stale";
import { Fragment, useEffect, useLayoutEffect, useMemo, useState, Suspense } from "react";
import { call, plain } from "../lib/api";
import { recompute } from "../lib/confidence";
import { conf, duration, km, num, utc } from "../lib/format";
import { S } from "../lib/strings";
import { store, useEntity, useStore } from "../store";
import { Conf, ErrorNote, Ref, Section, Support, useFetch, WhyButton } from "../components/common";
import { ConnectionsBlock } from "../components/Connections";
import { ObservationRecord, ObservationsBlock } from "../components/Observations";
import { TenuresBlock } from "../components/Tenures";
import { RatesBlock } from "../components/Rates";
import { clearNameOf } from "../components/SearchBox";
// loaded only when needed (O6: never part of the opening download): a place's view, the imagery, an indicator's table
const PlaceView = lazyStale(() => import("./PlaceView").then((m) => ({ default: m.PlaceView })));
const ImageryBlock = lazyStale(() => import("../components/Imagery").then((m) => ({ default: m.ImageryBlock })));
const PlaceWebcams = lazyStale(() => import("../components/Imagery").then((m) => ({ default: m.PlaceWebcams })));
const EventWebcams = lazyStale(() => import("../components/Imagery").then((m) => ({ default: m.EventWebcams })));
const IndicatorRecord = lazyStale(() => import("../components/Indicators").then((m) => ({ default: m.IndicatorRecord })));
import { buildConnections } from "../lib/connections";
import { dayLabel, inPeriod, periodName, periodOfWindow } from "../lib/period";
import { usePeriodName } from "../components/Period";
import { typeLabelOf, useSummaries } from "../components/Highlights";
import { fmtValue, sentence, summaryOf } from "../lib/summary";
import { isSheet, isTouch } from "../lib/layers";
const LocalTime = lazyStale(() => import("../components/LocalTime"));
const CamViewer = lazyStale(() => import("../components/CamViewer"));

const KIND_TITLE: Record<string, string> = S.kinds;
const SAT_SKIP = new Set(["observation", "person", "office", "government", "toll"]);

export function ObjectMode({ id }: { id: string }) {
  const wv = useStore((s) => s.worldVersion);
  const scope = useStore((s) => s.scope);
  const ctx = useFetch(JSON.stringify(["ctx", id, wv]), async () => {
    const r = await call<any>(`/context/${id}`, undefined, { channel: "context" });
    const data = store.normalize(r.data);
    store.set({ context: { id, data } });
    return { ...r, data };
  });
  const e = useEntity(id);
  const d = e?.details;
  useLayoutEffect(() => { if (ctx.data) performance.mark(`nexum:context:${id}`); }, [ctx.data, id]);
  void scope;
  const types = useStore((s) => s.types);
  // the connections of THIS element: only once its own context has arrived (never the previous element's)
  const ready = ctx.data && store.get().context?.id === id;
  const conn = useMemo(() => (ready && e ? buildConnections(id, e.kind, e.type, d, ctx.data!.data, {
    typeLabel: (t) => types.get(t)?.label ?? t.replace(/[._]/g, " "),
    entityLabel: (x) => store.entity(x)?.label ?? null, entityKind: (x) => store.entity(x)?.kind ?? null,
    entityType: (x) => store.entity(x)?.type ?? null, day: (ms) => utc(ms, "day"), km: (n) => km(n), duration: (ms) => duration(ms),
  }) : null), [ready, id, e?.kind, e?.type, d, ctx.data, types]);
  const tw = useStore((s) => s.scope.time_window);
  const explorable = !!types.get(e?.type ?? "")?.explore;
  // the clear name of a place whose source label is abbreviated ("S. Sudan · South Sudan")
  const [clearName, setClearName] = useState<string | null>(null);
  useEffect(() => { setClearName(null); if (explorable) clearNameOf(id).then(setClearName, () => {}); }, [id, explorable]);
  // a rule output: its name already says the rule; the line says what it is (found by NEXUM) and when
  const what = e?.kind === "insight" ? S.whyFound : conn?.what ?? types.get(e?.type ?? "")?.label ?? KIND_TITLE[e?.kind ?? ""] ?? "";
  // phone: what NEXUM found → the linked elements → Perché? → details (elsewhere Perché? stays by the result)
  const whyAfter = e?.kind === "insight" && isSheet();
  const when = conn?.when ?? (e?.kind === "event" || e?.kind === "insight" ? e?.t ?? null : null);
  const outside = when != null && !inPeriod(when, tw ?? null);
  return (
    <>
      <div className="focushead" data-testid="focus-head" data-focus={id}
        onClick={(ev) => { if (store.get().sheet === "mini" && !(ev.target as HTMLElement).closest("button")) store.set({ sheet: "peek" }); }}>
        <PlaceCrumb id={id} />
        <h1>{e?.label ?? id}{clearName && <span className="xs dim" data-testid="clear-name"> · {clearName}</span>}</h1>
        <div className="whatline"><span data-testid="focus-what">
          {[what, conn?.where, when != null ? dayLabel(when) : null].filter(Boolean).join(" · ")}</span>
          {outside && <span className="outside-mark" data-testid="focus-outside"> · {S.period.outsideShort}</span>}</div>
        {(d?.properties?.timezone || (d?.identifiers ?? []).some((x: any) => x.scheme === "iso3166a2")) && <Suspense fallback={null}>
          <LocalTime zone={d?.properties?.timezone ?? null} code={(d?.identifiers ?? []).find((x: any) => x.scheme === "iso3166a2")?.value ?? null} /></Suspense>}
        <ObservedWith id={id} />
        {e?.kind === "insight" && <InsightHead id={id} button={!whyAfter} />}
        {/* the support band says how well a CONNECTION is supported; for a place, a camera, a plant it is a record's
            technical confidence, kept in the details and in "Perché?" (2026-10-04: no jargon on the first surface) */}
        <div className="row small support">
          {(e?.kind === "insight" || e?.kind === "relation") && <Support value={d?.confidence ?? e?.confidence} />}
          <span className="grow" />
          {e?.kind === "relation" && <WhyButton id={id} />}
        </div>
        <button type="button" className="tab-only close-card" onClick={() => store.set({ inspectorOpen: false })}>{S.closePanel}</button>
      </div>
      <div className="pbody" data-testid="object-mode" key={id}>
        {ctx.loading && !ctx.data && <p className="note" style={{ padding: 12 }}>{S.loading}</p>}
        <ErrorNote error={ctx.error} />
        {/* an explorable element (vocabulary hint "explore"): its own overview and sections, never one endless column */}
        {explorable && ready && <Suspense fallback={<p className="note" style={{ padding: 12 }}>{S.loading}</p>}>
          <PlaceView id={id} d={d} ctxData={ctx.data!.data} conn={conn} /></Suspense>}
        {!explorable && <>
        {/* an observation's record: the measured results first, then its own facts and provenance */}
        {(types.get(e?.type ?? "")?.series || types.get(e?.type ?? "")?.wave) && <ObservationRecord id={id} />}
        {/* a camera (vocabulary hint "media"): the viewer of THIS camera, first; other cameras only after it, apart */}
        {d?.properties && types.get(e?.type ?? "")?.media && <Suspense fallback={<p className="xs dim conn-pad">{S.loading}</p>}><CamViewer id={id} props={d.properties} /></Suspense>}
        {ctx.data && e?.kind !== "insight" && <Facts id={id} d={d} data={ctx.data.data} />}
        {/* OSSERVA: the public webcams near a place (a city), surfaced in its own view */}
        {ready && types.get(e?.type ?? "")?.nearby_media_km && <Suspense fallback={null}><PlaceWebcams id={id} /></Suspense>}
        {ready && d?.properties && <RatesBlock id={id} props={d.properties} ctxData={ctx.data!.data} />}
        {ready && e?.kind !== "event" && <TenuresBlock id={id} ctxData={ctx.data!.data} />}
        {ready && <ObservationsBlock id={id} ctxData={ctx.data!.data} />}
        {conn && <ConnectionsBlock c={conn} />}
        {/* an indicator: compare the places it covers (after its connections: the first screen keeps them in view) */}
        {types.get(e?.type ?? "")?.indicator && d?.properties && <Suspense fallback={null}><IndicatorRecord props={d.properties} label={e?.label ?? ""} /></Suspense>}
        {/* an event: its connections first; "during the term of" is temporal context, after them */}
        {ready && e?.kind === "event" && <TenuresBlock id={id} ctxData={ctx.data!.data} />}
        {whyAfter && <div className="ins-why conn-pad"><WhyBig id={id} /></div>}
        {ready && e?.kind === "event" && <Suspense fallback={null}><EventWebcams id={id} /></Suspense>}
        {/* OSSERVA → IMMAGINI: places and events with a position (on request; never preloaded) */}
        {ready && (e?.kind === "event" || (e?.kind === "object" && !SAT_SKIP.has(types.get(e?.type ?? "")?.family ?? ""))) && (d?.geometry || e?.point) &&
          <Suspense fallback={null}><ImageryBlock id={id} geometry={d?.geometry} label={e?.label ?? ""} when={e?.kind === "event" ? e?.t ?? null : null} /></Suspense>}
        {outside && when != null && <OutsideNote when={when} />}
        {ctx.data && <Sections id={id} data={ctx.data.data} />}
        </>}
      </div>
    </>
  );
}

/** The way back to the explorable element this view was opened from (e.g. "← Italy · Opinione"): same world, same
 *  view, one tap — never a second object view. */
function PlaceCrumb({ id }: { id: string }) {
  const ctx = useStore((s) => s.placeCtx);
  const place = useEntity(ctx?.id ?? null);
  if (!ctx || ctx.id === id || !place) return null;
  const sec = S.place.nav[ctx.section] ?? (ctx.section.startsWith("obs:") ? store.get().types.get(ctx.section.slice(4))?.group : null);
  return (
    <button type="button" className="linklike place-crumb" data-testid="place-crumb" onClick={(ev) => { ev.stopPropagation(); store.select(ctx.id, "place-back", ctx.section); }}>
      ← {place.label}{sec && ctx.section !== "overview" ? ` · ${sec}` : ""}</button>);
}

/** What a rule output found, said first (the facts of its members); the engine stays in "Perché?". */
function InsightHead({ id, button }: { id: string; button: boolean }) {
  useSummaries([id]);
  const text = sentence(summaryOf(id), typeLabelOf);
  return (
    <div className="ins-head" data-testid="insight-head">
      {text && <p className="ins-sentence" data-testid="insight-sentence">{text}</p>}
      {button && <WhyBig id={id} />}
    </div>);
}

const WhyBig = ({ id }: { id: string }) =>
  <button type="button" className="whybtn big" data-testid="insight-why" data-why={id} onClick={() => store.why(id)}>{S.whyTitle}</button>;

/** The source's own data about the element, in words (the vocabulary's display hints choose and name them). An
 * element without connections is never an element without information. */
export function Facts({ id, d, data }: { id: string; d: any; data: any }) {
  const e = store.entity(id);
  const t = store.get().types.get(e?.type ?? "");
  const facts = (t?.facts ?? []).map((f) => [f, d?.properties?.[f.property]] as const)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
  const src = data?.sources?.map((x: any) => x.name).join(" · ");
  const ident = (d?.identifiers ?? []).find((x: any) => x.strong) ?? (d?.identifiers ?? [])[0];
  // a card on a phone's first screen (sheet not opened in full, or a landscape phone) keeps the first facts on one
  // line so the connections stay in view; the source and its identifier come with the card opened in full
  const sheet = useStore((s) => s.sheet);
  const compact = window.innerWidth < 700 ? sheet !== "full" : isTouch() && window.innerHeight < 500;
  // compact: the facts that do not repeat the name, short ones first
  const lbl = (e?.label ?? "").toLowerCase();
  const brief = facts.filter(([, v]) => !(typeof v === "string" && (v.length > 40 || lbl.includes(v.toLowerCase())))).slice(0, 2);
  if (!facts.length && !src) return null;
  if (compact && !brief.length) return null;
  return (
    <section className={`facts${compact ? " compact" : ""}`} data-testid="facts">
      {!compact && <div className="conn-h">{S.facts.title}</div>}
      {facts.length > 0 && <p className="facts-line">
        {(compact ? brief : facts).map(([f, v]) => (
          <span key={f.property} className="fact"><span className="fk">{f.label}</span>{" "}
            <span data-fact={f.property}>{typeof v === "string" && f.values?.[v] ? f.values[v] : fmtValue(v as any, f.digits ?? null)}{f.unit ? ` ${f.unit}` : ""}</span></span>))}
      </p>}
      {!compact && (src || ident) && <p className="facts-src xs dim">{src && <>{S.facts.source}: {src}</>}{src && ident ? " · " : ""}
        {ident && <span className="mono">{ident.scheme} {ident.value}</span>}
        {(() => { const L = (LINKS as Record<string, any>)[e?.source_id ?? ""] ?? (LINKS as Record<string, any>)[(d?.identifiers ?? []).find((x: any) => (LINKS as any)[x.source_id])?.source_id ?? ""];
          const v = L && (d?.identifiers ?? []).find((x: any) => x.scheme === L.scheme)?.value;
          return v ? <> · <a href={L.url.replace("{v}", encodeURIComponent(v))} target="_blank" rel="noopener noreferrer" className="record-link" data-testid="record-link">{L.label} {v} ↗</a></> : null; })()}</p>}
    </section>);
}

/** SELECTING ≠ CHANGING THE PERIOD: the focus outside the observed period stays visible; going to its year is an
 * explicit choice (a period the person chose, cancellable with Ripristina). */
function OutsideNote({ when }: { when: number }) {
  const pname = usePeriodName();
  const year = new Date(when).getUTCFullYear();
  return (
    <div className="period-notes conn-pad" data-testid="outside-note">
      <div className="pn-row">{S.period.outside(pname)}
        <button type="button" className="primary" data-testid="go-year" onClick={() => store.setPeriod({ kind: "year", year })}>{S.period.goYear(year)}</button></div>
    </div>);
}

/** After walking the path: the conditions this step was observed with, when they differ. Only "Applica" applies them. */
function ObservedWith({ id }: { id: string }) {
  const scope = useStore((s) => s.scope);
  const clock = useStore((s) => s.clock);
  const trail = useStore((s) => s.trail);
  const origin = useStore((s) => s.origin);
  if (!clock) return null;
  const step = trail.steps[trail.index];
  const keys = ["time_window", "types", "sources", "min_confidence"] as const;
  const norm = (sc: any) => JSON.stringify(keys.map((k) => sc?.[k] ?? null));
  if (!(origin === "trail" && step?.ref === id && norm(step.scope) !== norm(scope))) return null;
  const stepPeriod = periodName(periodOfWindow(step.scope?.time_window, clock.anchor, clock.first), clock.anchor, clock.first);
  const others = keys.slice(1).some((k) => JSON.stringify((step.scope as any)?.[k] ?? null) !== JSON.stringify((scope as any)[k] ?? null));
  return (
    <div className="period-notes" data-testid="observed-with">
      <button type="button" className="pn-apply" data-testid="apply-step" onClick={() => store.applyStep(trail.index)}>
        {S.period.observedWith(`${S.period.label} ${stepPeriod}${others ? " e altri filtri" : ""}`)} · <b>{S.period.applyStep}</b></button>
    </div>);
}

export function Sections({ id, data }: { id: string; data: any }) {
  const e = store.entity(id);
  const d = e?.details ?? {};
  const kind = e?.kind;
  return (
    <>
      {/* the reading order (Phase 3B · A2): result and linked elements above → sources and evidence → context →
          the internal structure (identity, type and rule, raw properties, members with their roles, provenance),
          kept whole but collapsed under one "Dettagli tecnici" */}
      <Section title={S.sections.sources} count={data.sources?.length ?? 0} name="sources">
        <ul className="list">{(data.sources ?? []).map((s: any) => (
          <li key={s.source_id}><div>{s.name}</div><div className="xs dim">{s.attribution} · {s.license_id}</div></li>))}</ul>
      </Section>
      <Evidence data={data.evidence} />
      <Relations id={id} data={data.relations} kind={kind} />
      <Related id={id} title={S.sections.relatedObjects} name="related-objects" sec={data.related_objects} path="objects" />
      <Related id={id} title={S.sections.relatedEvents} name="related-events" sec={data.related_events} path="events" />
      <TimelineSec id={id} data={data.timeline} kind={kind} />
      <Geography data={data.geography} />
      <Section title={S.sections.insights} count={data.insights?.total ?? 0} name="insights" open={(data.insights?.total ?? 0) > 0}>
        {!data.insights?.items?.length && <p className="note">{S.none}</p>}
        <ul className="list">{(data.insights?.items ?? []).map((it: any) => (
          <li key={it.ref.$ref}>
            <div className="row"><Conf value={it.confidence} text={it.confidence_text} />
              <span className="grow"><Ref id={it.ref.$ref} /></span><WhyButton id={it.ref.$ref} /></div>
            {it.explanation && <div className="xs dim" style={{ marginTop: 2 }}>{it.explanation}</div>}
          </li>))}</ul>
      </Section>
      <details className="tech-group" data-testid="detail-technical">
        <summary>{S.sections.technical}</summary>
      <Section title={S.sections.identity} name="identity" open={false}>
        <dl className="kv">
          <dt>ID</dt><dd className="mono small">{id} <button type="button" className="xs" title={S.copy}
            onClick={() => navigator.clipboard?.writeText(id)}>⧉</button></dd>
          {(d.identifiers ?? []).map((x: any) => (
            <Fragment key={`${x.scheme}-${x.value}`}><dt>{x.scheme}</dt><dd className="mono small">{x.value}{x.strong ? "" : " ·"}</dd></Fragment>
          ))}
          {d.aliases?.length > 0 && <><dt>alias</dt><dd className="small">{d.aliases.slice(0, 12).join(" · ")}</dd></>}
        </dl>
      </Section>
      <Section title={S.sections.type} name="type" open={false}>
        <dl className="kv">
          <dt>natura</dt><dd>{KIND_TITLE[kind ?? ""]}</dd>
          <dt>tipo</dt><dd className="mono small">{e?.type}</dd>
          {store.get().types.get(e?.type ?? "")?.family && <><dt>famiglia</dt><dd>{store.get().types.get(e!.type)!.family}</dd></>}
          {kind === "insight" && <><dt>{S.whyRule}</dt><dd className="mono small">{d.rule_id} v{d.rule_version}</dd>
            <dt>output</dt><dd>{d.insight_kind}</dd></>}
          {kind === "relation" && <><dt>natura rel.</dt><dd>{d.nature}</dd><dt>{S.derivation}</dt><dd>{d.derivation}</dd></>}
        </dl>
      </Section>
      <Properties id={id} d={d} kind={kind} />
      <Provenance id={id} />
      </details>
    </>
  );
}

function Properties({ id, d, kind }: { id: string; d: any; kind?: string }) {
  const props = Object.entries(d.properties ?? {}).filter(([, v]) => v !== null && v !== "");
  const conflicts = new Map<string, number>((d.conflicts ?? []).map((c: any) => [c.property, c.values]));
  return (
    <Section title={S.sections.properties} name="properties">
      <dl className="kv">
        {kind === "event" && <>
          <dt>tempo</dt><dd className="mono small">{utc(d.t_start_ms, "second")}{d.t_uncertainty_s ? ` ±${d.t_uncertainty_s} s` : ""}</dd>
          {d.t_end_ms && d.t_end_ms !== d.t_start_ms && <><dt>fine</dt><dd className="mono small">{utc(d.t_end_ms)}</dd></>}
          {d.severity != null && <><dt>severità</dt><dd className="mono small">{conf(d.severity)}</dd></>}
        </>}
        {kind === "insight" && <>
          <dt>spiegazione</dt><dd className="small">{d.explanation}</dd>
          {d.t_start_ms && <><dt>tempo</dt><dd className="mono small">{utc(d.t_start_ms)}</dd></>}
        </>}
        {kind === "relation" && <>
          <dt>da</dt><dd>{d.from && <Ref id={d.from.$ref} />}</dd>
          <dt>a</dt><dd>{d.to && <Ref id={d.to.$ref} />}</dd>
          <dt>evidenze</dt><dd className="small">{S.independentOf(d.independent_sources ?? 0, d.evidence_count ?? 0)}</dd>
        </>}
        {props.map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd className="small">
            {typeof v === "number" ? num(Math.round(v * 1000) / 1000) : typeof v === "boolean" ? (v ? "sì" : "no") : String(v)}
            {conflicts.has(k) && <span className="warn"> · {S.conflicts(conflicts.get(k)!)}</span>}</dd></Fragment>
        ))}
      </dl>
      {kind === "insight" && d.members?.length > 0 && (
        <><div className="group-h">{S.sections.members}</div>
          <ul className="list">{d.members.slice(0, 40).map((m: any) => (
            <li key={`${m.role}-${m.ref?.$ref}`} className="row"><span className="mono xs dim" style={{ minWidth: 70 }}>{m.role}</span>
              <span className="grow">{m.ref && <Ref id={m.ref.$ref} />}</span>
              {m.distance_km != null && <span className="mono xs dim">{km(m.distance_km)}</span>}</li>))}</ul></>
      )}
      {kind === "event" && d.participants?.length > 0 && (
        <><div className="group-h">{S.sections.participants}</div>
          <ul className="list">{d.participants.map((p: any) => (
            <li key={`${p.role}-${p.object?.$ref}`} className="row"><span className="mono xs dim" style={{ minWidth: 70 }}>{p.role}</span>
              <span className="grow">{p.object && <Ref id={p.object.$ref} />}</span>
              {p.distance_m != null && <span className="mono xs dim">{km(p.distance_m / 1000)}</span>}</li>))}</ul></>
      )}
      <span className="sr">{id}</span>
    </Section>
  );
}

function Evidence({ data }: { data: any }) {
  const items = data?.items ?? [];
  return (
    <Section title={S.sections.evidence} count={`${data?.independent_sources ?? 0} / ${data?.total ?? 0}`} name="evidence" open={false}>
      <p className="note">{S.independentOf(data?.independent_sources ?? 0, data?.total ?? 0)}</p>
      <ul className="list">{items.map((ev: any) => <EvidenceItem key={ev.evidence_id} ev={ev} />)}</ul>
    </Section>
  );
}

export function EvidenceItem({ ev }: { ev: any }) {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const s = ev.support ?? {};
  const f = ev.factors;
  return (
    <li data-evidence={ev.evidence_id}>
      <div className="row">
        <span className="mono xs dim">{ev.role}</span>
        <span className="grow ellipsis small">{s.$ref ? <Ref id={s.$ref} /> : <>{s.source_id} · <span className="mono">{s.native_id}</span></>}</span>
        <span className="mono xs dim" title="gruppo di indipendenza">{ev.independence_group}</span>
        {ev.weight != null && <span className="badge">{conf(ev.weight)}</span>}
      </div>
      {f?.method === "product" && <div className="xs faint mono">{Object.entries(f.factors).map(([k, v]) => `${k} ${conf(v as number)}`).join(" × ")}
        {" = "}{conf(recompute(f))}</div>}
      {s.kind === "record" && (
        <div className="xs dim">
          {s.locator} · raw {s.raw_id} · sha {String(s.raw_sha256).slice(0, 10)}… · {S.fetched} {utc(s.fetched_ms, "day")}
          {" "}<button type="button" className="xs" data-raw={s.raw_id} onClick={() => {
            if (raw) return setRaw(null);
            plain<any>(`/raw/${s.raw_id}`, {}, { path: s.locator }).then((r) => setRaw(r.data), (e) => setErr(e.message));
          }}>{raw ? S.rawHide : S.rawOpen}</button>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {raw && (<div data-testid="raw-record"><div className="xs dim">{S.rawRecord} · {raw.source_id} · {S.licence}: {raw.licence?.license_id} · {raw.licence?.attribution}</div>
        <pre className="raw">{typeof raw.record === "string" ? raw.record : JSON.stringify(raw.record, null, 1)}</pre></div>)}
    </li>
  );
}

function Relations({ id, data, kind }: { id: string; data: any; kind?: string }) {
  // extra pages per group, loaded with the Core's paginated expand (relations() lists at most 50 per group)
  const [extra, setExtra] = useState<Record<string, { items: any[]; cursor: string | null }>>({});
  useEffect(() => setExtra({}), [id]);
  if (kind === "relation") return (
    <Section title={S.sections.relations} name="relations" open={false}><p className="note">{S.notApplicable}</p></Section>);
  const groups = data?.groups ?? [];
  const more = async (g: any) => {
    const key = `${g.type}-${g.direction}`;
    const cur = extra[key];
    const r = await call<any>("/graph/expand", { node: id, edge_kind: "relation", type: g.type, dir: g.direction,
      cursor: cur?.cursor ?? undefined, b: { max_nodes: 100 } });
    const d = store.normalize(r.data);
    const seen = new Set([...g.items.map((i: any) => i.other.$ref), ...(cur?.items ?? []).map((i: any) => i.other.$ref)]);
    const add = d.items.filter((it: any) => !seen.has(it.node.$ref)).map((it: any) => ({
      relation: { $ref: it.edge.ref_id }, other: it.node, confidence: it.edge.confidence }));
    setExtra((x) => ({ ...x, [key]: { items: [...(cur?.items ?? []), ...add], cursor: r.cursor_next } }));
  };
  return (
    <Section title={S.sections.relations} count={num(data?.total ?? 0)} name="relations" open={(data?.total ?? 0) > 0}>
      {!groups.length && <p className="note">{S.none}</p>}
      {groups.map((g: any) => {
        const key = `${g.type}-${g.direction}`;
        const items = [...g.items, ...(extra[key]?.items ?? [])];
        return (
          <div key={key}>
            <div className="group-h">{g.type} · {g.nature} · {g.direction === "in" ? "←" : "→"} <span className="mono">{num(g.count)}</span></div>
            <ul className="list">{items.map((it: any) => (
              <li key={it.relation.$ref} className="row" data-relation={it.relation.$ref}>
                <span className="grow"><Ref id={it.other.$ref} /></span>
                {it.evidence_count != null && <span className="mono xs dim" title="fonti indipendenti / evidenze">{it.independent_sources}/{it.evidence_count}</span>}
                <Conf value={it.confidence} />
                <WhyButton id={it.relation.$ref} />
              </li>))}</ul>
            {g.count > items.length && extra[key]?.cursor !== null && <button type="button" className="primary small" data-testid="relations-more"
              onClick={() => more(g)}>{S.showMore} ({S.more(g.count - items.length)})</button>}
          </div>
        );
      })}
      <span className="sr">{id}</span>
    </Section>
  );
}

export function Related({ id, title, name, sec, path }: { id: string; title: string; name: string; sec: any; path: string }) {
  const [extra, setExtra] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  useEffect(() => { setExtra([]); setCursor(undefined); }, [id]);
  const items = [...(sec?.items ?? []), ...extra];
  const total = sec?.total ?? 0;
  const more = async () => {
    const r = await call<any>(`/entities/${id}/${path}`, { b: { max_items: 50 }, cursor: cursor ?? undefined });
    const d = store.normalize(r.data);
    const seen = new Set(items.map((x) => x.$ref));
    setExtra((x) => [...x, ...d.items.filter((i: any) => !seen.has(i.$ref))]);
    setCursor(r.cursor_next);
  };
  return (
    <Section title={title} count={num(total)} name={name} open={total > 0}>
      {sec?.counts_by_type && <div className="xs dim">{Object.entries(sec.counts_by_type).map(([t, n]) =>
        `${store.get().types.get(t)?.label ?? t} ${num(n as number)}`).join(" · ")}</div>}
      {!items.length && <p className="note">{S.none}</p>}
      <ul className="list">{items.map((it: any) => (
        <li key={it.$ref} className="row"><span className="grow"><Ref id={it.$ref} /></span>
          {it.reason && <span className="xs faint ellipsis" style={{ maxWidth: 120 }} title={it.reason}>{it.reason.split(":")[0]}</span>}</li>))}</ul>
      {total > items.length && cursor !== null && <button type="button" className="primary small" onClick={more}>{S.showMore} ({S.more(total - items.length)})</button>}
    </Section>
  );
}

export function TimelineSec({ id, data, kind }: { id: string; data: any; kind?: string }) {
  const entries = data?.entries ?? [];
  const step = (dir: "next" | "prev") => call<any>(`/entities/${id}/timeline/step`, { dir }).then((r) => {
    const d = store.normalize(r.data);
    const target = d?.step?.$ref;
    if (target) store.select(target, "timeline");
  }).catch(() => {});
  return (
    <Section title={S.sections.timeline} count={num(data?.total ?? 0)} name="timeline" open={false}>
      {kind === "event" && <div className="row" style={{ marginBottom: 4 }}>
        <button type="button" className="primary small" onClick={() => step("prev")}>◂ {S.prev}</button>
        <button type="button" className="primary small" onClick={() => step("next")}>{S.next} ▸</button></div>}
      {!entries.length && <p className="note">{S.none}</p>}
      <ul className="list">{entries.map((t: any) => (
        <li key={`${t.ref?.$ref}-${t.t_ms}`} className="row"><span className="mono xs dim" style={{ minWidth: 86 }}>{utc(t.t_ms, "day")}</span>
          <span className="grow">{t.ref && <Ref id={t.ref.$ref} origin="timeline" />}</span></li>))}</ul>
    </Section>
  );
}

function Geography({ data }: { data: any }) {
  if (!data || data.not_applicable) return (
    <Section title={S.sections.geography} name="geography" open={false}><p className="note" data-testid="geo-na">{S.geographyNA}</p></Section>);
  return (
    <Section title={S.sections.geography} name="geography" open={false}>
      <dl className="kv"><dt>punto</dt><dd className="mono small">{data.point?.map((x: number) => x.toFixed(4)).join(", ")}</dd>
        <dt>geometria</dt><dd className="small">{data.geometry_type}</dd>
        {data.containing?.length > 0 && <><dt>{S.contains}</dt><dd>{data.containing.map((c: any) => <Ref key={c.$ref} id={c.$ref} />)}</dd></>}</dl>
      {data.nearby_100km && <><div className="group-h">{S.nearby(data.nearby_100km.total)}</div>
        <ul className="list">{data.nearby_100km.items.map((n: any) => (
          <li key={n.$ref} className="row"><span className="grow"><Ref id={n.$ref} /></span><span className="mono xs dim">{km(n.distance_km)}</span></li>))}</ul></>}
    </Section>
  );
}

function Provenance({ id }: { id: string }) {
  const [provOpen, setProvOpen] = useState(false);
  const p = useFetch(provOpen ? `prov-${id}` : null, () => call<any>(`/provenance/${id}`).then((r) => ({ ...r, data: store.normalize(r.data) })));
  return (
    <details className="sec" data-section="provenance" onToggle={(e) => setProvOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{S.sections.provenance}{p.data && <span className="count">{p.data.data.complete ? "completa" : "incompleta"}</span>}</summary>
      <div className="body tree">
        {p.loading && <p className="note">{S.loading}</p>}
        <ErrorNote error={p.error} />
        {p.data && <ul style={{ borderLeft: 0, paddingLeft: 0 }}><ProvNode node={p.data.data.chain} /></ul>}
      </div>
    </details>
  );
}

function ProvNode({ node, depth = 0 }: { node: any; depth?: number }) {
  if (!node) return null;
  return (
    <li>
      {node.ref?.$ref ? <Ref id={node.ref.$ref} /> : <span className="mono xs">{node.ref?.id}</span>}
      {node.cycle_or_depth_limit && <span className="xs faint"> (già mostrato)</span>}
      {node.evidence?.length > 0 && (
        <ul>{node.evidence.slice(0, 30).map((ev: any, i: number) => (
          <li key={i}><span className="mono xs dim">{ev.role} · {ev.method}</span>
            {ev.record && <div className="xs dim">{ev.record.source_id} · {ev.record.locator} · raw {ev.record.raw_id} ·
              {" "}{ev.licence?.license_id} · {ev.licence?.attribution}</div>}
            {ev.chain && depth < 5 && <ul><ProvNode node={ev.chain} depth={depth + 1} /></ul>}</li>))}
          {node.evidence.length > 30 && <li className="xs faint">{S.more(node.evidence.length - 30)}</li>}</ul>
      )}
    </li>
  );
}

export { duration };
