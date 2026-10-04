// THE VIEW OF AN EXPLORABLE ELEMENT (vocabulary hint "explore"; 2026-10-03): another reading of the same world —
// what NEXUM knows about it NOW, in a few lines, each leading to its data, its relations and its evidence.
// A compact section bar (only the sections that have data) instead of one endless column; the overview first:
// offices and their holders · public opinion (a few observations, a perceived direction only where valid) · reality
// beside perception · official figures · prices · recent events · places and infrastructure · what the map can show.
// Not a dashboard: no score, no index, no chart, no judgement; missing data are not shown, never invented.

import { useEffect, useMemo } from "react";
import { Flows, Gaps, IndicatorList, KeyLine, perCapita, purchasing, sectionOf, useIndicators, type Flow } from "../components/Indicators";
import { ImageryBlock, useWebcamCounts } from "../components/Imagery";
import SECTIONS_CFG from "../config/sections.json";
import COVERAGE_CFG from "../config/webcam-coverage.json";

const SECTION_WORDS: Record<string, string> = (SECTIONS_CFG as any).words;
import { SecurityZones } from "../components/Security";
import { call } from "../lib/api";
import { type Series } from "../lib/observations";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { ConnectionsBlock } from "../components/Connections";
import { ObservationsBlock, useObservations, hasObservations, fmt } from "../components/Observations";
import { currentHolders, TenuresBlock, useTenures } from "../components/Tenures";
import { Ref, Section, useFetch } from "../components/common";
import { dayLabel } from "../lib/period";
import { Facts, Related, Sections, TimelineSec } from "./ObjectMode";

type Conn = Parameters<typeof ConnectionsBlock>[0]["c"];

/** [west, south, east, north] of a GeoJSON geometry (null without coordinates). */
export function bboxOf(g: any): [number, number, number, number] | null {
  let w = 180, s = 90, e = -180, n = -90, any = false;
  const walk = (c: any) => {
    if (typeof c?.[0] === "number") { any = true; w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g?.coordinates);
  return any ? [w, s, e, n] : null;
}

/** Show one category of the map in the element's area: an explicit, reversible filter (the usual "Ripristina"). */
function showOnMap(type: string, geometry: any) {
  const bbox = bboxOf(geometry);
  store.showOnly(type);
  const st = store.get();
  store.set({ mapFit: bbox ? { bbox, t: Date.now() } : null, stage: st.stage === "graph" ? "map" : st.stage,
    sheet: st.sheet === "full" ? "peek" : st.sheet });
}

// The sections of a place's view, in the order of what a person wants to know first (2026-10-03): how it is made and
// how one lives there, what it costs, its energy, its infrastructure and economy — then government, opinion, security,
// events, what can be observed, the sources. Only sections with data are shown.
const ORDER = ["overview", "popolazione", "vivere", "prezzi", "abitazione", "energia", "infrastrutture", "economia", "gov",
  "opinione", "sicurezza", "eventi", "osserva", "sources"];
const CONFLICT = "conflict.violence_event";

export function PlaceView({ id, d, ctxData, conn }: { id: string; d: any; ctxData: any; conn: Conn | null }) {
  const section = useStore((s) => s.section);
  const types = useStore((s) => s.types);
  const obsOn = hasObservations(ctxData);
  const { data: obs } = useObservations(id, obsOn, true);
  const ind = useIndicators(id, true);
  const ten = useTenures(true, id, true);
  const holders = ten ? currentHolders(ten, id) : [];
  const relObj = ctxData?.related_objects, relEv = ctxData?.related_events;
  const counts: Record<string, number> = relObj?.counts_by_type ?? {};
  const evCounts: Record<string, number> = relEv?.counts_by_type ?? {};
  // every measured series of the place: observations (opinion, official figures, prices) and indicators, plus what
  // NEXUM computes per inhabitant from two of them (same year only)
  const all = useMemo(() => {
    const base = [...(obs?.list ?? []), ...(ind?.list ?? [])];
    return [...base, ...perCapita(ind?.list ?? []), ...purchasing(base)];
  }, [obs, ind]);
  const bySec = useMemo(() => {
    const m = new Map<string, Series[]>();
    for (const s of all) { const k = sectionOf(s); m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [all]);
  const names = { ...(obs?.names ?? {}), ...(ind?.names ?? {}) };
  const attribution = { ...(obs?.attribution ?? {}), ...(ind?.attribution ?? {}) };
  // the map categories found in the element, as the vocabulary marks them: images (media), priced roads (rated), the rest
  const mapTypes = Object.entries(counts).filter(([t, n]) => n > 0 && types.get(t)?.map !== false);
  const mediaTypes = mapTypes.filter(([t]) => types.get(t)?.media), ratedTypes = mapTypes.filter(([t]) => types.get(t)?.rated);
  const plainTypes = mapTypes.filter(([t]) => !types.get(t)?.media && !types.get(t)?.rated).sort((a, b) => b[1] - a[1]);
  const conflictN = evCounts[CONFLICT] ?? 0;
  const otherEvents = (relEv?.total ?? 0) - conflictN;
  const has = (k: string) => (bySec.get(k)?.length ?? 0) > 0;
  const avail: Record<string, boolean> = {
    overview: true, vivere: has("vivere"), prezzi: has("prezzi"), abitazione: has("abitazione"),
    energia: has("energia") || (ind?.flows.length ?? 0) > 0, infrastrutture: has("infrastrutture") || plainTypes.length > 0 || ratedTypes.length > 0,
    economia: has("economia"), popolazione: has("popolazione"), gov: holders.length > 0, opinione: has("opinione"),
    sicurezza: conflictN > 0, eventi: otherEvents > 0, osserva: true, sources: true,
  };
  const nav: [string, string][] = ORDER.filter((k) => avail[k]).map((k) => [k, S.place.nav[k] ?? k]);
  // a search shortcut ("nuclear France", "inflazione Italia" → "?words"): the section whose data or name say the words
  // (series labels, topics, keywords of the sources; the sections' own names in Italian and English)
  useEffect(() => {
    if (!section.startsWith("?") || (obsOn && !obs) || !ind || !ten) return;
    const words = section.slice(1).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    // a whole word counts twice a part of a word ("gas" in "da gas" before "gasolio")
    const score = (...txt: (string | null | undefined)[]) => words.reduce((n, w) => {
      const whole = new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
      return n + (txt.some((t) => t && whole.test(t.toLowerCase())) ? 2 : txt.some((t) => t?.toLowerCase().includes(w)) ? 1 : 0);
    }, 0);
    const cands: [number, string][] = holders.map(([, o]) => [score(o.label, o.role) + 0.5, "gov"] as [number, string]);
    for (const s of all) cands.push([score(s.label, s.props.topic, s.props.keywords, obs?.groups[s.type]), sectionOf(s)]);
    for (const k of ORDER) cands.push([score(S.place.nav[k], SECTION_WORDS[k]) + 0.25, k]);
    const best = cands.filter(([n, k]) => n >= 1 && avail[k]).sort((a, b) => b[0] - a[0])[0];
    store.set({ section: best ? best[1] : "overview" });
  }, [section, obs, ind, ten]);
  const cur = nav.some(([k]) => k === section) ? section : "overview";
  // a section is read in full: on a phone the card opens completely (the overview may stay half open over the map)
  const go = (k: string) => store.set({ section: k, sheet: k === "overview" ? (store.get().sheet === "mini" ? "peek" : store.get().sheet) : "full" });
  const label = d?.label ?? store.entity(id)?.label ?? "";
  const secList = (k: string) => (bySec.get(k) ?? []).filter((s) => s.kind !== "survey");
  const have = new Set((ind?.list ?? []).map((s) => s.refs[0]));
  // the coverage notes the vocabulary gives to measured types of the section (e.g. "31 Stati su 193 …")
  const notesOf = (k: string) => [...new Set(secList(k).map((s) => obs?.notes[s.type]).filter(Boolean))] as string[];
  // values whose definition cannot be verified are kept, apart and closed: never the section's answer
  const sec = (k: string, extra?: any) => {
    const clear = secList(k).filter((s) => s.props.nature !== "ambiguous"), limited = secList(k).filter((s) => s.props.nature === "ambiguous");
    return (
      <div className="place-sec" data-testid={`sec-${k}`}>
        {extra}
        {notesOf(k).map((n) => <p key={n} className="xs faint" data-testid="obs-coverage">{n}</p>)}
        <IndicatorList list={clear} names={names} attribution={attribution} />
        {limited.length > 0 && <details className="ind-limited" data-testid="ind-limited">
          <summary className="xs dim">{S.ind.limitedTitle(limited.length)}</summary>
          <p className="xs faint">{S.ind.limitedNote}</p>
          <IndicatorList list={limited} names={names} attribution={attribution} />
        </details>}
        <Gaps section={k} have={have} label={label} />
      </div>);
  };
  return (
    <div className="place" data-testid="place-view">
      <nav className="place-nav" aria-label={S.place.navLabel} data-testid="place-nav">
        {nav.map(([k, lab]) => (
          <button key={k} type="button" className={k === cur ? "on" : ""} aria-pressed={k === cur} data-testid={`section-${k}`}
            onClick={() => go(k)}>{lab}</button>))}
      </nav>
      {cur === "overview" && <Overview id={id} d={d} ctxData={ctxData} holders={holders} go={go} conn={conn} bySec={bySec}
        names={names} flows={ind?.flows ?? []} loading={!ind} mediaTypes={mediaTypes} ratedTypes={ratedTypes} plainTypes={plainTypes}
        conflictN={conflictN} otherEvents={otherEvents} opinionN={(bySec.get("opinione") ?? []).length} subtypes={ind?.subtypes ?? {}} />}
      {cur === "vivere" && sec("vivere")}
      {cur === "prezzi" && sec("prezzi")}
      {cur === "abitazione" && sec("abitazione")}
      {cur === "energia" && sec("energia", <Flows flows={ind?.flows ?? []} place={label} />)}
      {cur === "infrastrutture" && sec("infrastrutture", <Infrastructure id={id} d={d} plainTypes={plainTypes} ratedTypes={ratedTypes} subtypes={ind?.subtypes ?? {}} />)}
      {cur === "economia" && sec("economia")}
      {cur === "popolazione" && sec("popolazione")}
      {cur === "gov" && <TenuresBlock id={id} ctxData={ctxData} immediate />}
      {cur === "opinione" && <div className="place-sec" data-testid="sec-opinione">
        <ObservationsBlock id={id} ctxData={ctxData} part="opinion" immediate />
        <ObservationsBlock id={id} ctxData={ctxData} part="pairs" immediate /></div>}
      {cur === "sicurezza" && <Security id={id} label={label} />}
      {cur === "eventi" && <div className="place-sec"><Related id={id} title={S.sections.relatedEvents} name="related-events" sec={relEv} path="events" />
        <TimelineSec id={id} data={ctxData.timeline} kind="object" /></div>}
      {cur === "osserva" && <Observe id={id} d={d} mediaTypes={mediaTypes} />}
      {cur === "sources" && <Sections id={id} data={ctxData} />}
    </div>);
}

/** The place's infrastructure on the map: the categories found in it, each one shown on the map on request. */
function Infrastructure({ id, d, plainTypes, ratedTypes, subtypes }: { id: string; d: any; plainTypes: [string, number][]; ratedTypes: [string, number][];
  subtypes: Record<string, [string | null, number][]> }) {
  const types = useStore((s) => s.types);
  // what a count is made of, as the source names its categories (never "103 airports" for 103 mixed facilities)
  const parts = (t: string) => {
    const st = types.get(t)?.subtypes, rows = subtypes[t];
    if (!st || !rows?.length) return null;
    return (
      <div className="xs" data-testid="infra-subtypes">
        {rows.map(([v, n], i) => <span key={String(v)}>{i ? " · " : ""}{(v != null && st.values?.[v]) ?? v ?? S.place.unspecified} {n.toLocaleString("it-IT")}</span>)}
        {st.note && <p className="xs faint">{st.note}</p>}
      </div>);
  };
  return (
    <div className="infra" data-testid="infra">
      {[...plainTypes, ...ratedTypes].map(([t, n]) => (
        <section key={t} className="ov-block" data-testid="infra-type" data-type={t}>
          <div className="ov-line"><b>{n.toLocaleString("it-IT")}</b> <span>{types.get(t)?.group ?? types.get(t)?.label ?? t}</span>{" "}
            <button type="button" className="primary xs ov-map" onClick={() => showOnMap(t, d?.geometry)}>{S.place.showOnMap}</button></div>
          {parts(t)}
          <SomeOf id={id} type={t} />
        </section>))}
    </div>);
}

/** Documented organised violence in the place (UCDP events): the events, their period, their source — never a
 *  forecast, never "the whole nation at war". */
function Security({ id, label }: { id: string; label: string }) {
  const f = useFetch(JSON.stringify(["security", id]), () => call<any>(`/entities/${id}/events`, { s: { types: [CONFLICT] }, b: { max_items: 12 } },
    { channel: "security" }).then((r) => store.normalize(r.data)));
  const items = (f.data?.items ?? []) as any[];
  return (
    <div className="place-sec" data-testid="sec-sicurezza">
      <p className="xs dim">{S.place.securityNote(label)}</p>
      <SecurityZones id={id} />
      <ul className="ov-some">{items.map((it) => <li key={it.$ref}><Ref id={it.$ref} origin="place" /> <span className="xs dim">{store.entity(it.$ref)?.t != null ? dayLabel(store.entity(it.$ref)!.t!) : ""}</span></li>)}</ul>
    </div>);
}

/** How much of the place the integrated webcam sources cover (config/webcam-coverage.json: NEXUM's assessment of its
 *  own sources, never a count of the cameras that exist), for a place with a two-letter code. */
export function coverageOf(d: any): { level: string; label: string; note: string } | null {
  const iso = (d?.identifiers ?? []).find((x: any) => x.scheme === "iso3166a2")?.value;
  if (!iso) return null;
  const cfg = COVERAGE_CFG as any, row = cfg.countries[iso];
  const level = row?.[0] ?? "none";
  return { level, label: cfg.labels[level], note: row?.[1] ?? "" };
}

function CoverageLine({ d, n, id }: { d: any; n: number; id: string }) {
  const c = coverageOf(d);
  // never one total that hides how many are live: LIVE · current images · link only · offline or old, apart
  const by = useWebcamCounts(id);
  const live = by?.live_stream ?? 0, cur = by?.current_snapshot ?? 0, link = by?.link_only ?? 0, off = (by?.offline ?? 0) + (by?.stale ?? 0);
  return (
    <div className="xs" data-testid="webcam-coverage" data-level={c?.level ?? ""}>
      <p>{S.place.webcamsInNexum(n)}{c && <> · {S.place.coverage} <b className={`cov ${c.level}`}>{c.label}</b>{c.note ? <span className="dim"> — {c.note}</span> : null}</>}</p>
      {by && n > 0 && <p data-testid="webcam-counts" data-live={live} data-current={cur} data-link={link}>
        <b className={live ? "live-on" : "dim"}>{S.media.countLive(live)}</b> · {S.media.countCurrent(cur)} · {S.media.countLink(link)}
        {off ? <span className="dim"> · {S.media.countOff(off)}</span> : null}</p>}
    </div>);
}

/** What can be observed of the place now: imagery from orbit on request, public webcams with a current image. */
function Observe({ id, d, mediaTypes }: { id: string; d: any; mediaTypes: [string, number][] }) {
  const types = useStore((s) => s.types);
  return (
    <div className="place-sec" data-testid="sec-osserva">
      <CoverageLine d={d} id={id} n={mediaTypes.reduce((a, [, n]) => a + n, 0)} />
      <ImageryBlock id={id} geometry={d?.geometry} label={d?.label ?? ""} />
      {mediaTypes.map(([t, n]) => (
        <section key={t} className="ov-block" data-testid="ov-media">
          <div className="ov-h"><span className="ov-title">{types.get(t)?.group ?? types.get(t)?.label ?? t}</span></div>
          <div className="ov-line"><b>{n.toLocaleString("it-IT")}</b> <span className="xs dim">{types.get(t)?.label}</span>{" "}
            <button type="button" className="primary xs ov-map" data-testid="ov-media-map" onClick={() => showOnMap(t, d?.geometry)}>{S.place.showOnMap}</button></div>
          <SomeOf id={id} type={t} />
        </section>))}
      {!mediaTypes.length && <p className="xs dim" data-testid="no-webcams">{S.place.noWebcams}</p>}
    </div>);
}

function Block({ title, k, go, children, test }: { title: string; k?: string; go: (k: string) => void; children: any; test: string }) {
  return (
    <section className="ov-block" data-testid={test}>
      <div className="ov-h">{k ? <button type="button" className="linklike ov-title" onClick={() => go(k)}>{title} →</button> : <span className="ov-title">{title}</span>}</div>
      {children}
    </section>);
}

function Overview(p: { id: string; d: any; ctxData: any; conn: Conn | null; holders: ReturnType<typeof currentHolders>; go: (k: string) => void;
  bySec: Map<string, Series[]>; names: Record<string, string>; flows: Flow[]; loading: boolean; mediaTypes: [string, number][];
  ratedTypes: [string, number][]; plainTypes: [string, number][]; conflictN: number; otherEvents: number; opinionN: number;
  subtypes: Record<string, [string | null, number][]> }) {
  const { id, d, ctxData, holders, go, bySec, names } = p;
  const types = useStore((s) => s.types);
  const pick = (k: string, ...codes: string[]) => codes.map((c) => (bySec.get(k) ?? []).find((s) => s.props.indicator === c)).filter(Boolean) as Series[];
  const fuel = (bySec.get("prezzi") ?? []).filter((s) => s.type === "observation.fuel_price");
  const people = pick("popolazione", "SP.POP.TOTL", "EN.POP.DNST", "SP.URB.TOTL.IN.ZS", "EN.URB.LCTY");
  // HOW ONE LIVES THERE (2026-10-04): pay with an explicit definition first (net and gross of the same person, else the
  // gross wage per full-time employee), the household income, what a month of net pay buys, the cost of eating well and
  // who cannot afford it; the minimum wage. A value whose definition cannot be verified never answers here.
  const net = pick("vivere", "eurostat.earnings.net", "eurostat.earnings.gross");
  const pay = net.length ? net : pick("vivere", "oecd.wage.gross_annual");
  const living = [...pay, ...pick("vivere", "eurostat.income.median_equivalised", "buy.kwh", "buy.petrol", "fpn.healthy_diet.unaffordable", "ilo.minimum_wage")]
    .filter((s) => s.props.nature !== "ambiguous").slice(0, 7);
  const limitedPay = (bySec.get("vivere") ?? []).some((s) => s.props.nature === "ambiguous" && s.props.topic === "stipendi");
  const pli = pick("prezzi", "icp.pli.consumption");
  const prices = [...fuel.slice(0, 2), ...pick("prezzi", "eurostat.price.electricity_household", "fpn.healthy_diet.cost_lcu"),
    ...(pli.length ? pli : pick("prezzi", "PA.NUS.PRVT.PLI"))];
  const inflation = (bySec.get("prezzi") ?? []).filter((s) => s.props.topic === "prezzi" && s.kind === "official");
  const energy = pick("energia", "elec.generation.total", "pc.elec.generation", "elec.demand", "pc.elec.demand", "elec.net_imports");
  const mix = pick("energia", "elec.share.nuclear", "elec.share.solar", "elec.share.wind", "elec.share.hydro", "elec.share.gas", "elec.share.coal", "elec.share.other_fossil", "elec.share.bioenergy")
    .filter((s) => s.points[s.points.length - 1][2] > 0).sort((a, b) => b.points[b.points.length - 1][2] - a.points[a.points.length - 1][2]);
  const gasFrom = p.flows.filter((f) => f.type === "imports_gas_from" && f.direction === "out" && (f.series[f.series.length - 1]?.[1] ?? 0) > 0)
    .sort((a, b) => b.series[b.series.length - 1][1] - a.series[a.series.length - 1][1]).slice(0, 3);
  // the place's own currency first; the dollar and PPP series are comparison measures, said apart in one small line
  const gdp = pick("economia", "NY.GDP.MKTP.CN"), gdpPc = pick("economia", "NY.GDP.PCAP.CN");
  const economy = [...(gdp.length ? gdp : pick("economia", "NY.GDP.MKTP.CD")), ...(gdpPc.length ? gdpPc : pick("economia", "NY.GDP.PCAP.CD")),
    ...pick("economia", "NY.GDP.MKTP.KD.ZG")];
  const compare = [...(gdp.length ? pick("economia", "NY.GDP.MKTP.CD") : []), ...pick("economia", "NY.GDP.PCAP.PP.CD")];
  const unemployment = (bySec.get("economia") ?? []).filter((s) => s.kind === "official").slice(0, 1);
  const mixYear = mix[0] ? (mix[0].points[mix[0].points.length - 1][1] ?? "").slice(0, 4) : "";
  const events = ((ctxData?.related_events?.items ?? []) as any[]).map((it) => store.entity(it.$ref)).filter(Boolean)
    .sort((a: any, b: any) => (b.t ?? 0) - (a.t ?? 0)).slice(0, 3);
  const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
  // what a count of facilities is made of, as the source names its kinds (the three largest; the rest in the section)
  const kinds = (t: string) => {
    const st = types.get(t)?.subtypes, rows = p.subtypes[t];
    if (!st || !rows?.length) return "";
    const named = rows.filter(([v]) => v != null).slice(0, 3).map(([v, n]) => `${st.values?.[v!] ?? v} ${n.toLocaleString("it-IT")}`);
    return named.join(" · ") + (rows.length > 3 ? " …" : "");
  };
  return (
    <div className="overview" data-testid="overview">
      {p.loading && <p className="xs dim">{S.loading}</p>}
      {people.length > 0 && <Block title={S.place.people} k="popolazione" go={go} test="ov-people">
        {people.map((s) => <KeyLine key={s.id} s={s} names={names} />)}</Block>}
      {(living.length > 0 || !pay.length) && <Block title={S.place.livingOnly} k="vivere" go={go} test="ov-living">
        {living.map((s) => <KeyLine key={s.id} s={s} names={names} />)}
        {!pay.length && <p className="xs faint" data-testid="ov-salary-none">{limitedPay ? S.place.limitedSalary : S.place.noSalary}</p>}
      </Block>}
      {(prices.length > 0 || inflation.length > 0) && <Block title={S.place.prices} k="prezzi" go={go} test="ov-prices">
        {prices.map((s) => <KeyLine key={s.id} s={s} names={names} />)}
        {inflation.slice(0, 1).map((s) => <KeyLine key={s.id} s={s} names={names} />)}
      </Block>}
      {(energy.length > 0 || mix.length > 0) && <Block title={S.place.energy} k="energia" go={go} test="ov-energy">
        {energy.map((s) => <KeyLine key={s.id} s={s} names={names} />)}
        {mix.length > 0 && <div className="ov-line" data-testid="ov-mix"><span className="ov-label">{S.place.mix(mixYear)}</span>{" "}
          {mix.slice(0, 5).map((s, i) => <span key={s.id}>{i ? " · " : ""}{s.label.replace(/^Quota del mix elettrico: /, "")} <b className="obs-v">{nf1.format(s.points[s.points.length - 1][2])} %</b></span>)}
          <span className="xs dim"> · Ember</span></div>}
        {gasFrom.length > 0 && <div className="ov-line" data-testid="ov-gas"><span className="ov-label">{S.place.gasFrom}</span>{" "}
          {gasFrom.map((f, i) => <span key={f.relation}>{i ? " · " : ""}{f.other_label} <b className="obs-v">{f.series[f.series.length - 1][1].toLocaleString("it-IT", { maximumFractionDigits: 0 })}</b></span>)}
          <span className="xs dim"> {gasFrom[0].unit} · {gasFrom[0].series[gasFrom[0].series.length - 1][0]} · Eurostat</span></div>}
      </Block>}
      {(p.plainTypes.length > 0 || p.ratedTypes.length > 0) && <Block title={S.place.places} k="infrastrutture" go={go} test="ov-places">
        {[...p.plainTypes, ...p.ratedTypes].slice(0, 7).map(([t, n]) => (
          <div key={t} className="ov-line xs" data-testid="ov-infra" data-type={t}>
            <b>{n.toLocaleString("it-IT")}</b> {types.get(t)?.group ?? types.get(t)?.label ?? t}
            {kinds(t) && <span className="dim"> ({kinds(t)})</span>}</div>))}
      </Block>}
      {(economy.length > 0 || unemployment.length > 0) && <Block title={S.place.economy} k="economia" go={go} test="ov-economy">
        {economy.map((s) => <KeyLine key={s.id} s={s} names={names} />)}
        {unemployment.map((s) => <KeyLine key={s.id} s={s} names={names} />)}
        {compare.length > 0 && <p className="xs dim" data-testid="ov-compare">{S.place.compareLead}{" "}
          {compare.map((s, i) => <span key={s.id}>{i ? " · " : ""}{s.label} <b>{fmt(s, s.points[s.points.length - 1][2])}</b></span>)}
          {" "}<span className="faint">({S.place.compareNote})</span></p>}
      </Block>}
      {holders.length > 0 && <Block title={S.place.gov} k="gov" go={go} test="ov-gov">
        {holders.map(([oid, o, cur]) => (
          <div key={oid} className="ov-line" data-testid="ov-holder">
            <span className="xs dim">{o.role}</span>{" "}
            {cur.length ? cur.map((t, i) => <span key={t[5] ?? i}>{i > 0 ? " · " : ""}<button type="button" className="linklike" data-ref={t[0]}
              onClick={() => store.select(t[0], "place")}>{t[1]}</button> <span className="xs dim">{S.place.since(t[2] ?? "?")}</span></span>)
              : <span className="xs dim">{S.place.noHolder}</span>}
          </div>))}
      </Block>}
      {p.opinionN > 0 && <Block title={S.place.opinion} k="opinione" go={go} test="ov-opinion">
        <button type="button" className="linklike xs" data-testid="ov-opinion-all" onClick={() => go("opinione")}>{S.place.exploreAll(p.opinionN, S.place.opinion)}</button>
      </Block>}
      {p.conflictN > 0 && <Block title={S.place.security} k="sicurezza" go={go} test="ov-security">
        <p className="xs dim">{S.place.conflictCount(p.conflictN)}</p></Block>}
      {p.otherEvents > 0 && <Block title={S.place.events} k="eventi" go={go} test="ov-events">
        <p className="xs dim">{S.place.eventsCount(ctxData.related_events.total)}</p>
        {events.map((e: any) => <div key={e.id} className="ov-line"><Ref id={e.id} origin="place" /> <span className="xs dim">{e.t != null ? dayLabel(e.t) : ""}</span></div>)}
      </Block>}
      <Block title={S.place.observe} k="osserva" go={go} test="ov-observe">
        <p className="xs dim">{S.place.observeImagery}</p>
        <CoverageLine d={d} id={id} n={p.mediaTypes.reduce((a, [, n]) => a + n, 0)} /></Block>
      {/* what NEXUM found around it (the same connections as every element), after what is known about it */}
      {p.conn && <LinksOnMap id={id} />}
      {p.conn && <ConnectionsBlock c={p.conn} plain />}
      {/* the element's own record (its source, identifiers) closes the overview: what NEXUM knows comes first */}
      <Facts id={id} d={d} data={ctxData} />
      <Section title={S.sections.sources} count={ctxData.sources?.length ?? 0} name="sources" open={false}>
        <ul className="list">{(ctxData.sources ?? []).map((x: any) => (
          <li key={x.source_id}><div>{x.name}</div><div className="xs dim">{x.attribution} · {x.license_id}</div></li>))}</ul>
      </Section>
    </div>);
}

/** The element's links on the map, on request: a large area's "located in" is never drawn by default. */
function LinksOnMap({ id }: { id: string }) {
  const on = useStore((s) => s.mapLinks === id);
  return (
    <div className="ov-block ov-links">
      <button type="button" className="linklike xs" data-testid="map-links-toggle" aria-pressed={on}
        onClick={() => store.set({ mapLinks: on ? null : id })}>{on ? S.place.hideLinks : S.place.showLinks}</button>
    </div>);
}

/** A few elements of one category related to the element (opened like any other element). */
function SomeOf({ id, type }: { id: string; type: string }) {
  const f = useFetch(JSON.stringify(["someof", id, type]), () => call<any>(`/entities/${id}/objects`, { s: { types: [type] }, b: { max_items: 5 } },
    { channel: `someof-${type}` }).then((r) => store.normalize(r.data)));
  const items = (f.data?.items ?? []) as any[];
  if (!items.length) return null;
  return <ul className="ov-some">{items.map((it) => <li key={it.$ref}><Ref id={it.$ref} origin="place" /></li>)}</ul>;
}
