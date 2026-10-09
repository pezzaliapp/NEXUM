// PLACE INDICATORS (World Intelligence, 2026-10-03): what the sources measured about a place — population, living
// conditions, prices, energy, economy, infrastructure — each value with its unit, period, source and how the source
// produced it (observed · estimated · modelled). Values NEXUM computes from two of them (per inhabitant) are said as
// such ("calcolato da NEXUM", the formula, the period, the sources) and only for the same year. Where a source has the
// indicator for other places but not for this one, the gap is said: never a zero, never a neighbour's value.

import { useEffect, useMemo, useState } from "react";
import { call } from "../lib/api";
import { type Point, type Series } from "../lib/observations";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { ByTopic, fmt } from "./Observations";
import CTX from "../config/indicator-context.json";
import { IndContext, type IndCtx } from "./IndContext";
import { indicatorText } from "../lib/demography";

export interface Flow { relation: string; type: string; type_label: string; direction: "out" | "in"; other: string; other_label: string | null;
  series: [string, number][]; unit: string; reporter: string; dataset: string; note: string; label: string }
export interface IndData { list: Series[]; flows: Flow[]; names: Record<string, string>; attribution: Record<string, string>;
  subtypes?: Record<string, [string | null, number][]> }
export interface CatalogItem { id: string; label: string; source_id: string; props: Record<string, any> }

const cache = new Map<string, Promise<IndData>>();
let catalog: Promise<{ catalog: CatalogItem[]; names: Record<string, string> }> | null = null;
let catalogWv: number | null = null;

export function loadIndicators(id: string, wv: number): Promise<IndData> {
  const key = `${wv}:${id}`;
  if (!cache.has(key)) {
    const p = call<any>(`/indicators/${id}`, undefined, { channel: `indicators-${id}` }).then((r) => {
      const d = r.data;
      // a place's own unit where the source's is generic (e.g. its currency for "local currency")
      const list: Series[] = (d.series ?? []).map((x: any) => {
        const def = d.defs[x.def];
        const props = x.unit ? { ...def.props, unit: x.unit } : { ...def.props };
        // a value about one element the source does not name: the note, and NEXUM's own most populous one beside it
        const cx = (CTX as Record<string, any>)[def.props?.indicator];
        if (cx && typeof cx === "object") props._context = { ...cx, leader: d.leaders?.[cx.leader] ?? null } as IndCtx;
        const o = indicatorText(def.props?.indicator);   // the source's own definition (config/demography.json)
        if (o.definition) props.definition = o.definition;
        return { ...def, ...(o.label ? { label: o.label } : {}), props, id: x.id, points: x.points, refs: [x.def] };
      });
      return { list, flows: d.flows ?? [], names: d.source_names ?? {}, subtypes: d.subtypes ?? {},
        attribution: Object.fromEntries((r.sources ?? []).map((s: any) => [s.source_id, s.attribution])) };
    });
    p.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** The indicators of a place (null while loading; an empty list is a place without data). */
export function useIndicators(id: string, enabled = true): IndData | null {
  const wv = useStore((s) => s.worldVersion);
  const [data, setData] = useState<IndData | null>(null);
  useEffect(() => {
    setData(null);
    if (!enabled) return;
    let live = true;
    loadIndicators(id, wv).then((d) => { if (live) setData(d); }, () => { if (live) setData({ list: [], flows: [], names: {}, attribution: {} }); });
    return () => { live = false; };
  }, [id, wv, enabled]);
  return data;
}

/** Every indicator of the world with its coverage: what a place's view needs to say what is missing there. */
export function useCatalog(enabled: boolean) {
  const wv = useStore((s) => s.worldVersion);
  const [c, setC] = useState<{ catalog: CatalogItem[]; names: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (!catalog || catalogWv !== wv) {
      catalogWv = wv;
      catalog = call<any>("/indicators-catalog", undefined, { channel: "indicators-catalog" })
        .then((r) => ({ catalog: r.data.catalog ?? [], names: r.data.source_names ?? {} }));
      catalog.catch(() => { catalog = null; });
    }
    let live = true;
    catalog.then((x) => { if (live) setC(x); }, () => {});
    return () => { live = false; };
  }, [enabled, wv]);
  return c;
}

const byCode = (list: Series[], code: string) => list.find((s) => s.props.indicator === code);
const yearOf = (p: Point) => (p[1] ?? p[0] ?? "").slice(0, 4);

/** Values NEXUM computes per inhabitant: an amount of one source divided by the population of the World Bank, for the
 *  years both publish (never across years). */
export function perCapita(list: Series[]): Series[] {
  const pop = byCode(list, "SP.POP.TOTL");
  if (!pop) return [];
  const popBy = new Map(pop.points.map((p) => [yearOf(p), p[2]]));
  const out: Series[] = [];
  const add = (src: Series, code: string, label: string, unit: string, factor: number, digits: number) => {
    const pts: Point[] = [];
    for (const p of src.points) {
      const n = popBy.get(yearOf(p));
      if (!n) continue;
      pts.push([p[0], p[1], (p[2] * factor) / n, null, null, p[5]]);
    }
    if (!pts.length) return;
    out.push({ id: `nexum:${code}:${src.id}`, type: "nexum.derived", kind: "derived", label, source_id: "nexum.derived", refs: [],
      points: pts, props: { indicator: code, unit, statistic: "per_capita", digits, section: "energia", topic: "per abitante",
        nature: "derived", derived: true, frequency: "annuale", order: (src.props.order ?? 0) + 200,
        formula: S.ind.formula(src.label, src.props.unit, pop.label), sources: [src.source_id, pop.source_id] } });
  };
  for (const s of list) {
    const c = s.props.indicator as string;
    if (c === "elec.generation.total") add(s, "pc.elec.generation", S.ind.pcGeneration, "kWh per abitante", 1e9, 0);
    else if (c?.startsWith("elec.gen.")) add(s, `pc.${c}`, S.ind.pcFrom(s.label), "kWh per abitante", 1e9, 0);
    else if (c === "elec.demand") add(s, "pc.elec.demand", S.ind.pcDemand, "kWh per abitante", 1e9, 0);
    else if (c === "eia.elec.consumption") add(s, "pc.elec.consumption", S.ind.pcConsumption, "kWh per abitante", 1e9, 0);
    else if (c === "eia.energy.consumption") add(s, "pc.energy.consumption", S.ind.pcEnergy, "tep per abitante", 1e6, 2);
  }
  return out;
}

/** WHAT A MONTH OF NET PAY BUYS (computed by NEXUM, 2026-10-04): the net annual earnings of a single person on the
 *  average wage (Eurostat) ÷ 12, divided by a price paid in the same currency for the same calendar year — the average of
 *  that year's published prices (both half-years of a household price; at least 40 weekly prices of a pump price).
 *  Never across years, never across currencies, never with a household income (a person's pay with a person's price). */
export function purchasing(list: Series[]): Series[] {
  const net = byCode(list, "eurostat.earnings.net");
  if (!net || !String(net.props.unit ?? "").startsWith("EUR")) return [];
  const out: Series[] = [];
  const yearMean = (s: Series, minN: number) => {
    const by = new Map<string, number[]>();
    for (const p of s.points) { const y = yearOf(p); by.set(y, [...(by.get(y) ?? []), p[2]]); }
    return new Map([...by].filter(([, v]) => v.length >= minN).map(([y, v]) => [y, v.reduce((a, b) => a + b, 0) / v.length]));
  };
  const add = (price: Series | undefined, code: string, label: string, unit: string, minN: number, what: string) => {
    if (!price || !/^EUR\//.test(String(price.props.unit ?? "")) || (price.props.currency && price.props.currency !== "EUR")) return;
    const mean = yearMean(price, minN);
    const pts: Point[] = [];
    for (const p of net.points) {
      const m = mean.get(yearOf(p));
      if (m) pts.push([p[0], p[1], p[2] / 12 / m, null, null, p[5]]);
    }
    if (!pts.length) return;
    out.push({ id: `nexum:${code}`, type: "nexum.derived", kind: "derived", label, source_id: "nexum.derived", refs: [], points: pts,
      props: { indicator: code, unit, statistic: "level", digits: 0, section: "vivere", topic: S.ind.buyTopic, nature: "derived",
        derived: true, frequency: "annuale", order: 50, formula: S.ind.buyFormula(net.label, what), sources: [net.source_id, price.source_id] } });
  };
  add(byCode(list, "eurostat.price.electricity_household"), "buy.kwh", S.ind.buyKwh, "kWh", 2, S.ind.buyKwhWhat);
  add(list.find((s) => s.props.indicator === "fuel.petrol" && s.props.currency === "EUR"), "buy.petrol", S.ind.buyPetrol, "litri", 40, S.ind.buyPetrolWhat);
  return out;
}

/** The section of a place's view a series belongs to (indicators: their own; observations: by their kind/topic). */
export function sectionOf(s: Series): string {
  if (s.props.section) return s.props.section;
  if (s.kind === "survey") return "opinione";
  if (s.type === "observation.fuel_price" || s.kind === "price") return "prezzi";
  if (s.kind === "official") return s.props.topic === "prezzi" ? "prezzi" : "economia";
  return "economia";
}

/** A section's series in reading order (the source's order, then the label). */
export function inOrder(list: Series[]): Series[] {
  return [...list].sort((a, b) => (a.props.order ?? 999) - (b.props.order ?? 999) || a.label.localeCompare(b.label));
}

export function IndicatorList({ list, names, attribution }: { list: Series[]; names: Record<string, string>; attribution: Record<string, string> }) {
  const src = (s: Series) => (names[s.source_id] ?? (s.source_id === "nexum.derived" ? S.ind.nexum : s.source_id)).split(" — ")[0];
  const attr = (s: Series) => attribution[s.source_id] ?? (s.source_id === "nexum.derived" ? S.ind.nexumAttr : "");
  return <ByTopic list={inOrder(list)} src={src} attr={attr} />;
}

/** What other places have and this one does not: the indicators of the section without a value here. */
export function Gaps({ section, have, label }: { section: string; have: Set<string>; label: string }) {
  const [unfolded, setUnfolded] = useState(false);
  const c = useCatalog(unfolded);
  const missing = useMemo(() => (c?.catalog ?? []).filter((x) => x.props.section === section && !have.has(x.id)), [c, section, have]);
  return (
    <details className="ind-gaps" data-testid="ind-gaps" onToggle={(e) => setUnfolded((e.target as HTMLDetailsElement).open)}>
      <summary className="xs dim">{S.ind.gapsTitle(label)}</summary>
      {!c ? <p className="xs dim">{S.loading}</p> : missing.length === 0 ? <p className="xs dim">{S.ind.noGaps}</p> : (
        <ul className="xs ind-gap-list">{missing.map((x) => (
          <li key={x.id} data-testid="ind-gap"><span>{x.props.indicator_label ?? x.label}</span>
            <span className="dim"> · {S.ind.notAvailable} · {S.ind.coverage(x.props.coverage_n ?? 0)} · {(c.names[x.source_id] ?? x.source_id).split(" — ")[0]}</span></li>))}
        </ul>)}
    </details>);
}

const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });

/** Energy between places: who this place imports from and exports to, as the reporting place declares it (yearly
 *  volumes of the source; the partner as recorded). Elsewhere in the world: the gap is said. */
export function Flows({ flows, place }: { flows: Flow[]; place: string }) {
  const groups = useMemo(() => {
    const by = new Map<string, Flow[]>();
    for (const f of flows) {
      const k = `${f.type}|${f.direction}`;
      by.set(k, [...(by.get(k) ?? []), f]);
    }
    const last = (f: Flow) => f.series[f.series.length - 1]?.[1] ?? 0;
    return [...by.entries()].map(([k, fs]) => ({ k, fs: fs.sort((a, b) => last(b) - last(a)) }))
      .sort((a, b) => S.ind.flowOrder.indexOf(a.k) - S.ind.flowOrder.indexOf(b.k));
  }, [flows]);
  if (!groups.length) return <p className="xs dim" data-testid="flows-none">{S.ind.noFlows(place)}</p>;
  return (
    <div className="flows" data-testid="flows">
      {groups.map(({ k, fs }) => {
        const [type, dir] = k.split("|");
        const year = fs[0].series[fs[0].series.length - 1]?.[0];
        const shown = fs.filter((f) => (f.series[f.series.length - 1]?.[1] ?? 0) > 0);
        return (
          <section key={k} className="flow-group" data-testid="flow-group" data-flow={k}>
            <div className="obs-topic">{S.ind.flowTitle(type, dir)}</div>
            <p className="xs dim">{year ? `${year} · ` : ""}{fs[0].unit} · {dir === "out" ? S.ind.declaredBy(place) : S.ind.declaredByPartners} · {fs[0].dataset}</p>
            <ul className="flow-list">
              {shown.slice(0, 12).map((f) => {
                const v = f.series[f.series.length - 1];
                return (
                  <li key={f.relation} data-testid="flow" data-other={f.other}>
                    <button type="button" className="linklike" onClick={() => store.select(f.other, "place")}>{f.other_label ?? f.other}</button>{" "}
                    <b className="obs-v">{nf0.format(v[1])}</b> <span className="xs dim">{f.unit} · {v[0]}</span>{" "}
                    <button type="button" className="linklike xs" data-testid="flow-why" onClick={() => store.select(f.relation, "place")}>{S.ind.flowEvidence}</button>
                  </li>);
              })}
            </ul>
            {shown.length > 12 && <p className="xs dim">{S.ind.more(shown.length - 12)}</p>}
            {fs[0].note && <p className="xs faint">{fs[0].note}</p>}
          </section>);
      })}
    </div>);
}

/** One line of the overview: label · value · period · source (flagged when computed, estimated or old). */
export function KeyLine({ s, names }: { s: Series | undefined; names: Record<string, string> }) {
  if (!s) return null;
  const last = s.points[s.points.length - 1];
  const src = s.source_id === "nexum.derived" ? S.ind.nexum : (names[s.source_id] ?? s.source_id).split(" — ")[0];
  return (
    <div className="ov-line" data-testid="ov-key" data-indicator={s.props.indicator}>
      <span className="ov-label">{s.label}</span>{" "}<b className="obs-v">{fmt(s, last[2])}</b>
      <span className="xs dim"> · {(last[1] ?? "").slice(0, 4)} · {src}{s.props.derived && src !== S.ind.nexum ? ` · ${S.obs.derived}` : ""}</span>
      <IndContext c={s.props._context} />
    </div>);
}

export { byCode };

const regionName = (() => {
  try { const dn = new Intl.DisplayNames(["it"], { type: "region" }); return (c: string) => dn.of(c) ?? c; } catch { return (c: string) => c; }
})();

/** COMPARE PLACES (first version): one indicator, every place the source covers — value, unit, period, source —
 *  in alphabetical order (never a ranking, never "better/worse"). The person pins the countries to compare on top. */
export function IndicatorRecord({ props, label }: { props: Record<string, any>; label: string }) {
  const ctx = useStore((s) => s.placeCtx);
  const rows: [string, [string, number, string?][]][] = props.by_country ?? [];
  const [pinned, setPinned] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const here = useMemo(() => {
    const e = ctx ? store.entity(ctx.id) : null;
    const iso = (e?.details?.identifiers ?? []).find((x: any) => x.scheme === "iso3166a2")?.value;
    return iso ?? null;
  }, [ctx]);
  useEffect(() => { setPinned(here ? [here] : []); }, [here, label]);
  const fake: Series = { id: "x", type: "observation.indicator", kind: "indicator", label, source_id: "", refs: [], points: [], props };
  const list = rows.map(([c, pts]) => ({ c, name: regionName(c), last: pts[pts.length - 1] }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const shown = list.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const pin = (c: string) => setPinned((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c].slice(-8)));
  const row = (r: (typeof list)[number]) => (
    <tr key={r.c} data-testid="cmp-row" data-iso={r.c} className={pinned.includes(r.c) ? "on" : ""}>
      <td><button type="button" className="linklike" onClick={() => pin(r.c)} aria-pressed={pinned.includes(r.c)}>{r.name}</button></td>
      <td className="num"><b>{fmt(fake, r.last[1])}</b></td>
      <td className="xs dim">{String(r.last[0]).slice(0, 7)}</td>
    </tr>);
  return (
    <section className="ind-record" data-testid="indicator-record">
      <div className="conn-h">{S.cmp.title}</div>
      <p className="xs dim">{S.cmp.note(props.coverage_n ?? rows.length)}</p>
      {props.nature === "ambiguous" && <p className="xs warn" data-testid="cmp-not-comparable">{S.cmp.notComparable}</p>}
      {pinned.length > 0 && <table className="cmp" data-testid="cmp-pinned"><tbody>{list.filter((r) => pinned.includes(r.c)).map(row)}</tbody></table>}
      <input type="search" className="cmp-q" placeholder={S.cmp.filter} value={q} onChange={(e) => setQ(e.target.value)} data-testid="cmp-filter" />
      <div className="cmp-scroll"><table className="cmp" data-testid="cmp-all"><tbody>{shown.map(row)}</tbody></table></div>
      <p className="xs faint">{S.cmp.caveat}</p>
    </section>);
}
