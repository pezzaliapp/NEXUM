// OBSERVATIONS of the element in focus (Phase 3B · block 2): what surveys measured there and what official statistics
// recorded there, each value with its period, its source and, on request, how it was measured. Information about
// the element, never a map layer. Shown only where the vocabulary's measured types point at the element.
// Reality and perception stay two measures side by side: no index, no score, no judgement, no forecast.

import { Fragment, useEffect, useState } from "react";
import { call } from "../lib/api";
import { direction, marginOfError, pairsByTopic, periodLabel, type Point, type Series } from "../lib/observations";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { Section } from "./common";

interface Pkg { by_entity: Record<string, { id: string; def: string; points: Point[] }[]>; defs: Record<string, Omit<Series, "id" | "points" | "refs">>;
  groups: Record<string, string>; notes: Record<string, string>; source_names: Record<string, string>; attribution: Record<string, string> }

const FIRST_LOAD_DELAY_MS = 800;
let pkg: Promise<Pkg> | null = null;
let pkgVersion: number | null = null;
/** One package for the whole world, asked once (and again only when the world changes). */
function load(wv: number | null): Promise<Pkg> {
  if (!pkg || pkgVersion !== wv) {
    pkgVersion = wv;
    pkg = call<any>("/observations", undefined, { channel: "observations" }).then((r) => ({
      ...r.data, attribution: Object.fromEntries((r.sources ?? []).map((s: any) => [s.source_id, s.attribution])) }));
    pkg.catch(() => { pkg = null; });
  }
  return pkg;
}

/** Whether the context of the element lists elements of a measured type (series / wave hints) pointing at it. */
export function hasObservations(ctxData: any): boolean {
  const types = store.get().types;
  return (ctxData?.relations?.groups ?? []).some((g: any) => g.direction === "in" &&
    (g.items ?? []).some((it: any) => {
      const t = types.get(store.entity(it.other?.$ref)?.type ?? it.other?.type ?? ""); return !!(t?.series || t?.wave); }));
}

const nf = (d: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: d, minimumFractionDigits: 0 });
/** Digits as the value needs them: shares whole, prices per litre or gallon to the thousandth, the rest to one decimal. */
export const digits = (s: Series, v: number) => (s.props.digits != null ? s.props.digits
  : s.props.statistic === "share" ? 0 : s.props.statistic === "price" && Math.abs(v) < 10 ? 3 : 1);
export function fmt(s: Series, v: number): string {
  const stat = s.props.statistic;
  if (stat === "balance") return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(1).format(Math.abs(v))} ${S.obs.units.balance}`;
  const unit = s.props.unit?.startsWith("%") ? " %" : s.props.unit ? ` ${s.props.unit}` : "";
  // large counts said in words (59,3 milioni abitanti; 2.254,9 miliardi US$): the value itself is never rounded away
  const a = Math.abs(v);
  if (a >= 1e9 && (stat === "level" || stat === "per_capita")) return `${nf(1).format(v / 1e9)} ${S.obs.units.bn}${unit}`;
  if (a >= 1e6 && (stat === "level" || stat === "per_capita")) return `${nf(1).format(v / 1e6)} ${S.obs.units.mn}${unit}`;
  return `${nf(digits(s, v)).format(v)}${unit}`;
}
export const signed = (v: number, d = 1) => {
  // a large change said in words, like its value (+56,0 miliardi, not +56.017.500.000)
  const a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "−" : "±";
  if (a >= 1e9) return `${s}${nf(1).format(a / 1e9)} ${S.obs.units.bn}`;
  if (a >= 1e6) return `${s}${nf(1).format(a / 1e6)} ${S.obs.units.mn}`;
  return `${s}${nf(d).format(a)}`;
};

export interface ObsData { list: Series[]; groups: Record<string, string>; notes: Record<string, string>; names: Record<string, string>;
  attribution: Record<string, string> }

/** The element's observations (null while loading, or when it has none). `immediate`: no first-load delay — the
 *  element's own view asks for them as its content, not as secondary information. */
export function useObservations(id: string, enabled: boolean, immediate = false): { data: ObsData | null; unavailable: boolean } {
  const wv = useStore((s) => s.worldVersion);
  const [data, setData] = useState<ObsData | null>(null);
  const [pkgUnavailable, setPkgUnavailable] = useState<boolean>(false);
  useEffect(() => {
    setData(null); setPkgUnavailable(false);
    if (!enabled) return;
    let live = true;
    // as for the other secondary packages: the first download waits a moment (moving on cancels it)
    const go = () => load(wv).then((p) => {
      if (!live) return;
      const list = (p.by_entity[id] ?? []).map((x) => ({ ...p.defs[x.def], id: x.id, points: x.points, refs: [...new Set(x.points.map((q) => q[5]))] } as Series));
      setData({ list, groups: p.groups ?? {}, notes: p.notes ?? {}, names: p.source_names ?? {}, attribution: p.attribution });
    }, () => { if (live) setPkgUnavailable(true); });
    const t = immediate || (pkg && pkgVersion === wv) ? (go(), 0) : window.setTimeout(go, FIRST_LOAD_DELAY_MS);
    return () => { live = false; window.clearTimeout(t); };
  }, [id, enabled, wv, immediate]);
  return { data, unavailable: pkgUnavailable };
}

/** The source said briefly (its registry name before the dash). */
export const sourceShort = (d: ObsData, s: Series) => (d.names[s.source_id] ?? s.source_id).split(" — ")[0];

/** All the observations, or one part of them (the sections of an explorable element's view):
 *  "opinion" · "reality" (reality and perception side by side, then the official series) · "other" (e.g. prices). */
export function ObservationsBlock({ id, ctxData, part, immediate = false }: { id: string; ctxData: any; part?: "opinion" | "reality" | "other" | "pairs"; immediate?: boolean }) {
  const show = hasObservations(ctxData);
  const { data, unavailable } = useObservations(id, show, immediate);
  if (!show) return null;
  if (unavailable) return null;
  if (!data) return <p className="note xs conn-pad" data-testid="obs-loading">{S.obs.loading}</p>;
  if (!data.list.length) return null;
  const perception = data.list.filter((s) => s.kind === "survey");
  const reality = data.list.filter((s) => s.kind === "official");
  // other measured groups of the vocabulary (e.g. prices): a section each, named by the vocabulary, with its coverage note
  const others = new Map<string, Series[]>();
  for (const s of data.list) if (s.kind !== "survey" && s.kind !== "official") others.set(s.type, [...(others.get(s.type) ?? []), s]);
  const pairs = pairsByTopic(data.list);
  const src = (s: Series) => sourceShort(data, s);
  const attr = (s: Series) => data.attribution[s.source_id] ?? "";
  const want = (p: string) => !part || part === p;
  return (
    <div className="obs" data-testid="observations">
      {(want("reality") || part === "pairs") && pairs.length > 0 && <section className="obs-pairs" data-testid="obs-pairs">
        <div className="conn-h">{S.obs.pairs}</div>
        <p className="xs dim">{S.obs.pairNote}</p>
        {pairs.map((p) => (
          <div key={p.topic} className="obs-pair" data-testid="obs-pair" data-topic={p.topic}>
            <div className="obs-topic">{cap(p.topic)}</div>
            <div className="obs-cols">
              <div className="obs-col" data-side="reality"><div className="xs faint">{S.obs.official}</div>
                {p.reality.map((s) => <Brief key={s.id} s={s} src={src(s)} />)}</div>
              <div className="obs-col" data-side="perception"><div className="xs faint">{S.obs.perceived}</div>
                {p.perception.map((s) => <Brief key={s.id} s={s} src={src(s)} />)}</div>
            </div>
          </div>))}
      </section>}
      {want("opinion") && perception.length > 0 && <Section title={S.obs.opinion} count={perception.length} name="opinion">
        <p className="xs faint">{S.obs.dirNote}</p>
        <ByTopic list={perception} src={src} attr={attr} />
      </Section>}
      {want("reality") && reality.length > 0 && <Section title={S.obs.reality} count={reality.length} name="reality">
        <ByTopic list={reality} src={src} attr={attr} />
      </Section>}
      {want("other") && [...others.entries()].map(([t, list]) => (
        <Section key={t} title={data.groups[t] ?? t} count={list.length} name={`obs-${list[0].kind}`}>
          {data.notes[t] && <p className="xs faint" data-testid="obs-coverage">{data.notes[t]}</p>}
          <ByTopic list={list} src={src} attr={attr} />
        </Section>))}
    </div>);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A value said in one line: value · period · source (the details are in the full section). */
function Brief({ s, src }: { s: Series; src: string }) {
  const last = s.points[s.points.length - 1];
  return (
    <div className="obs-brief" data-testid="obs-brief">
      <div className="xs">{s.label}</div>
      <div><b className="obs-v">{fmt(s, last[2])}</b> <span className="xs dim">{periodLabel(last)} · {src}</span></div>
    </div>);
}

export function ByTopic({ list, src, attr }: { list: Series[]; src: (s: Series) => string; attr: (s: Series) => string }) {
  const topics = new Map<string, Series[]>();
  for (const s of list) { const t = s.props.topic ?? ""; topics.set(t, [...(topics.get(t) ?? []), s]); }
  return <>{[...topics.entries()].map(([t, ss]) => <TopicGroup key={t} topic={t} list={ss} src={src} attr={attr} />)}</>;
}

/** Long lists (e.g. the most important issues) start with the five highest latest values. */
function TopicGroup({ topic, list, src, attr }: { topic: string; list: Series[]; src: (s: Series) => string; attr: (s: Series) => string }) {
  const [all, setAll] = useState(false);
  const sorted = list.length > 6 ? [...list].sort((a, b) => b.points[b.points.length - 1][2] - a.points[a.points.length - 1][2]) : list;
  const shown = all ? sorted : sorted.slice(0, list.length > 6 ? 5 : list.length);
  return (
    <div className="obs-group" data-topic={topic}>
      {topic && <div className="obs-topic">{cap(topic)}</div>}
      {shown.map((s) => <SeriesRow key={s.id} s={s} src={src(s)} attr={attr(s)} />)}
      {shown.length < sorted.length && <button type="button" className="linklike xs" data-testid="obs-more" onClick={() => setAll(true)}>
        {S.obs.more(sorted.length - shown.length)}</button>}
    </div>);
}

/** A series whose latest value is far behind its own source's newest period (an indicator) or behind the data's
 *  clock by more than four years: said as such ("dato vecchio"), never shown as current. */
export function stale(s: Series): boolean {
  const end = s.points[s.points.length - 1]?.[1];
  const clock = store.get().clock;
  if (!end) return false;
  const y = Number(end.slice(0, 4));
  if (s.props.latest_period && Number(String(s.props.latest_period).slice(0, 4)) - y >= 3) return true;
  return !!clock && new Date(clock.latestMs).getUTCFullYear() - y > 4;
}

/** The change of a series' latest value, said as the rule allows: an arrow only for a survey beyond its error. */
export function changeOf(s: Series): { d: ReturnType<typeof direction>; dirText: string; arrow: string } {
  const d = direction(s);
  const last = d.to;
  const prevName = d.from ? periodLabel(d.from) : "";
  let dirText = "", arrow = "";
  if (d.basis === "single") dirText = S.obs.single;
  else if (d.verdict === "none") dirText = S.obs.none;
  else if (d.verdict === "change") { dirText = S.obs.change(signed(d.delta!, s.kind === "survey" ? 1 : digits(s, last[2])), prevName); }
  else if (s.kind !== "survey") dirText = S.obs.noChange(prevName);
  else if (d.verdict === "stable") dirText = `${S.obs.stable} ${S.obs.vs(prevName)} (${S.obs.within(signed(d.delta!), nf(1).format(d.threshold!))})`;
  else { arrow = d.verdict === "up" ? "↑" : "↓"; dirText = `${d.verdict === "up" ? S.obs.up : S.obs.down} ${S.obs.vs(prevName)} (${S.obs.beyond(signed(d.delta!), nf(1).format(d.threshold!))})`; }
  return { d, dirText, arrow };
}

export function SeriesRow({ s, src, attr }: { s: Series; src: string; attr: string }) {
  const { d, dirText, arrow } = changeOf(s);
  const last = d.to;
  const moe = marginOfError(s, last);
  const flags: [string, string][] = s.props.estimate_flags ?? [];
  const isEstimate = flags.some(([m]) => (last[0] ?? "").startsWith(m));
  const p = s.props;
  return (
    <details className="obs-row" data-testid="obs-series" data-series={s.id} data-verdict={d.verdict}>
      <summary>
        <span className="obs-label">{s.label}</span>
        <span className="obs-line">
          <b className="obs-v" data-testid="obs-value">{fmt(s, last[2])}</b>
          {arrow && <span className={`obs-arrow ${d.verdict}`} aria-hidden>{arrow}</span>}
          <span className="xs dim" data-testid="obs-when"> {periodLabel(last)}{isEstimate ? ` (${S.obs.estimate})` : ""}</span>
          <span className="xs faint" data-testid="obs-source"> · {src}</span>
          {p.derived && <span className="tag derived" data-testid="obs-derived"> {S.obs.derived}</span>}
          {!p.derived && (p.nature === "estimated" || p.nature === "modelled") && <span className="tag est"> {S.obs.natureShort[p.nature]}</span>}
          {p.nature === "ambiguous" && <span className="tag stale" data-testid="obs-ambiguous"> {S.obs.natureShort.ambiguous}</span>}
          {String(last[6] ?? "").startsWith("ANOMALIA") && <span className="tag stale" data-testid="obs-anomaly"> {S.obs.anomalyTag}</span>}
          {stale(s) && <span className="tag stale" data-testid="obs-stale"> {S.obs.staleTag}</span>}
        </span>
        {p.unit_note && <span className="xs faint obs-unitnote" data-testid="obs-unit-note">{p.unit_note}</span>}
        <span className="xs dim obs-dir" data-testid="obs-direction">{dirText}</span>
      </summary>
      {/* the fact first: what was measured, the result, its period, its change (only when valid) */}
      <dl className="kv obs-kv obs-fact" data-testid="obs-fact">
        <dt>{S.obs.measured}</dt><dd>{s.label}{p.answer && !s.label?.toLowerCase().includes(String(p.answer).toLowerCase()) ? ` — ${p.answer}` : ""}</dd>
        <dt>{S.obs.result}</dt><dd><b className="obs-v">{fmt(s, last[2])}</b>{arrow ? ` ${arrow}` : ""}</dd>
        <dt>{s.kind === "official" ? S.obs.when : S.obs.fieldwork}</dt><dd>{periodLabel(last)}{isEstimate ? ` (${S.obs.estimate})` : ""}</dd>
        {d.from && d.verdict !== "none" && <><dt>{S.obs.changeLabel}</dt><dd>{dirText}</dd></>}
      </dl>
      <dl className="kv obs-kv">
        {p.question && <><dt>{S.obs.question}</dt><dd>{p.question}</dd></>}
        {p.answer && <><dt>{S.obs.answer}</dt><dd>{p.answer}</dd></>}
        {p.definition && <><dt>{S.obs.definition}</dt><dd>{p.definition}</dd></>}
        {p.nature && <><dt>{S.obs.nature}</dt><dd data-testid="obs-nature">{S.obs.natures[p.nature] ?? p.nature}</dd></>}
        {p.formula && <><dt>{S.obs.formula}</dt><dd data-testid="obs-formula">{p.formula}</dd></>}
        {p.coverage_n != null && <><dt>{S.obs.coverage}</dt><dd>{S.obs.coverageOf(p.coverage_n)}</dd></>}
        {p.note && <><dt>{S.obs.note}</dt><dd>{p.note}</dd></>}
        {p.population && <><dt>{S.obs.population}</dt><dd>{p.population}</dd></>}
        {last[3] != null && <><dt>{S.obs.sample}</dt><dd>{S.obs.interviews(nf(0).format(last[3]))}</dd></>}
        {p.method && <><dt>{S.obs.method}</dt><dd>{p.method}</dd></>}
        {p.seasonal && <><dt>{S.obs.seasonal}</dt><dd>{p.seasonal}</dd></>}
        {moe != null && <><dt>{S.obs.moe}</dt><dd data-testid="obs-moe">{(p.statistic === "balance" ? S.obs.moeBalance : S.obs.moeText)(nf(1).format(moe))}</dd></>}
        {(last[6] || p.dataset) && <><dt>{S.obs.dataset}</dt><dd>{last[6] ?? p.dataset}</dd></>}
        <><dt>{S.obs.source}</dt><dd>{attr || src}</dd></>
        {p.area && <><dt>{S.obs.area}</dt><dd>{p.area}</dd></>}
        {p.currency && <><dt>{S.obs.currency}</dt><dd>{p.currency}</dd></>}
        {p.price_without_taxes != null && <><dt>{S.obs.withoutTaxes}</dt><dd data-testid="obs-notax">{fmt(s, p.price_without_taxes)} ({periodLabel(last)})</dd></>}
        {(p.taxes ?? []).map((t: [string, number, string, string]) => <Fragment key={t[0]}><dt>{t[0]}</dt>
          <dd data-testid="obs-tax">{nf(t[2] === "%" ? 1 : 4).format(t[1])} {t[2]} · {S.obs.taxSince(t[3])}</dd></Fragment>)}
        {flags.length > 0 && <><dt>{S.obs.flags}</dt><dd>{flags.map(([m, f]) => `${m}: ${f === "e" ? S.obs.estimate : f}`).join(" · ")}</dd></>}
      </dl>
      {s.points.length > 1 && <div className="obs-hist"><div className="xs faint">{S.obs.history}</div>
        <ul className="xs">{s.points.slice(-7, -1).reverse().map((q) => <li key={`${q[0]}${q[1]}`}><span className="obs-v">{fmt(s, q[2])}</span> · {periodLabel(q)}</li>)}</ul></div>}
      <button type="button" className="linklike xs" data-testid="obs-evidence" data-ref={last[5]} onClick={() => store.select(last[5], "place")}>{S.obs.evidence}</button>
    </details>);
}

/** The record of an observation (a survey wave, an official or price series), FACT FIRST: what it measured and the
 *  results, with their period and — only where valid — the change against the previous comparable observation; the
 *  question, sample, method, source and provenance follow in the record's own sections. */
export function ObservationRecord({ id }: { id: string }) {
  const wv = useStore((s) => s.worldVersion);
  const [rows, setRows] = useState<{ s: Series; at: number }[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    load(wv).then((p) => {
      if (!live) return;
      const out: { s: Series; at: number }[] = [];
      for (const list of Object.values(p.by_entity)) for (const x of list) {
        const at = x.points.findIndex((q) => q[5] === id);
        if (at < 0) continue;
        out.push({ s: { ...p.defs[x.def], id: x.id, points: x.points, refs: [] } as Series, at });
      }
      setRows(out); setNames(p.source_names ?? {});
    }, () => { if (live) setRows([]); });
    return () => { live = false; };
  }, [id, wv]);
  if (!rows || !rows.length) return null;
  const first = rows[0].s.points[rows[0].at];
  const byTopic = new Map<string, { s: Series; at: number }[]>();
  for (const r of rows) byTopic.set(r.s.props.topic ?? "", [...(byTopic.get(r.s.props.topic ?? "") ?? []), r]);
  return (
    <section className="obs-record" data-testid="obs-record">
      <div className="conn-h">{rows.length > 1 ? S.obs.record : S.obs.recordSeries}</div>
      <p className="xs dim">{periodLabel(first)}{first[6] ? ` · ${first[6]}` : ""} · {(names[rows[0].s.source_id] ?? rows[0].s.source_id).split(" — ")[0]}</p>
      {[...byTopic.entries()].map(([t, rs]) => (
        <div key={t} className="obs-group">
          {t && byTopic.size > 1 && <div className="obs-topic">{cap(t)}</div>}
          {rs.map(({ s, at }) => {
            const upto: Series = { ...s, points: s.points.slice(0, at + 1) };     // the change of THIS observation
            const { d, dirText, arrow } = changeOf(upto);
            const q = s.points[at];
            return (
              <div key={s.id} className="ov-line" data-testid="obs-record-line">
                <span className="ov-label">{s.label}</span>{" "}<b className="obs-v">{fmt(s, q[2])}</b>{arrow && <span className="obs-arrow"> {arrow}</span>}
                {d.from && d.verdict !== "none" && <span className="xs dim"> · {dirText}</span>}
              </div>);
          })}
        </div>))}
      <p className="xs faint">{S.obs.dirNote}</p>
    </section>);
}
