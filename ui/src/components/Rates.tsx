// RATES of the element in focus (Phase 3B · block 5), as the vocabulary marks them: a rate table (hint "rates")
// shows the rate of the chosen dimensions with its components; an element priced by one (hint "rated") shows the
// amount of its sections for the chosen dimensions (length × rate, rounded per section). Never a route.

import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { amountCents, rateOf, sectionCents, type RateRow } from "../lib/rates";
import { S } from "../lib/strings";
import { store } from "../store";
import type { TypeInfo } from "../lib/types";

interface Table { rows: RateRow[]; dims: [string[], [string, string][], number[]]; labels: string[]; components: string[]; unit: string;
  validity?: string; rounding?: string; legal?: string }

const tableOf = (props: Record<string, any>, h: NonNullable<TypeInfo["rates"]>): Table | null => {
  const rows = props[h.property], dims = props[h.dims];
  if (!Array.isArray(rows) || !Array.isArray(dims) || dims.length !== 3) return null;
  return { rows, dims: dims as Table["dims"], labels: props[h.dim_labels] ?? ["", "", ""], components: props[h.components] ?? [], unit: props[h.unit] ?? "",
    validity: h.validity ? props[h.validity] : undefined, rounding: h.rounding ? props[h.rounding] : undefined, legal: h.legal ? props[h.legal] : undefined };
};

const tables = new Map<string, Promise<Table | null>>();
function loadTable(id: string): Promise<Table | null> {
  if (!tables.has(id)) {
    tables.set(id, call<any>(`/entities/${id}`, undefined, { channel: `rates-${id}` }).then((r) => {
      const d = r.data;
      const h = store.get().types.get(d?.type ?? "")?.rates;
      return h ? tableOf(d.properties ?? {}, h) : null;
    }));
    tables.get(id)!.catch(() => tables.delete(id));
  }
  return tables.get(id)!;
}

const eur = (cents: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const nf3 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function RatesBlock({ id, props, ctxData }: { id: string; props: Record<string, any>; ctxData: any }) {
  const t = store.get().types.get(store.entity(id)?.type ?? "");
  const [table, setTable] = useState<Table | null>(null);
  const via = t?.rated?.via;
  const target: string | null = via ? (ctxData?.relations?.groups ?? []).find((g: any) => g.type === via && g.direction === "out")?.items?.[0]?.other?.$ref ?? null : null;
  useEffect(() => {
    setTable(null);
    if (t?.rates) { setTable(tableOf(props, t.rates)); return; }
    if (!target) return;
    let live = true;
    loadTable(target).then((x) => { if (live) setTable(x); }, () => {});
    return () => { live = false; };
  }, [id, target, t?.rates ? 1 : 0]);
  if (!t?.rates && !t?.rated) return null;
  if (!table) return null;
  return <RateCalc table={table} segments={t?.rated ? props[t.rated.segments] : null} length={t?.rated ? props[t.rated.length] : null} tableId={target} />;
}

function RateCalc({ table, segments, length, tableId }: { table: Table; segments: [number, string, string, number][] | null; length: number | null; tableId: string | null }) {
  const [d0, setD0] = useState(table.dims[0].length - 1);
  const [d1, setD1] = useState(table.dims[1][0]?.[0] ?? "");
  const [d2, setD2] = useState(table.dims[2][0] ?? 1);
  const [showSeg, setShowSeg] = useState(false);
  const row = rateOf(table.rows, d0, d1, d2);
  const rate = row?.[3] ?? null;
  return (
    <section className="rates" data-testid="rates">
      <div className="conn-h">{S.rates.title}</div>
      <div className="rates-dims">
        <label><span className="xs dim">{table.labels[0]}</span>
          <select data-testid="rate-d0" value={d0} onChange={(e) => setD0(Number(e.target.value))}>
            {table.dims[0].map((l, i) => <option key={i} value={i}>{l}</option>)}</select></label>
        <label><span className="xs dim">{table.labels[1]}</span>
          <select data-testid="rate-d1" value={d1} onChange={(e) => setD1(e.target.value)}>
            {table.dims[1].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span className="xs dim">{table.labels[2]}</span>
          <select data-testid="rate-d2" value={d2} onChange={(e) => setD2(Number(e.target.value))}>
            {table.dims[2].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
      </div>
      {rate == null ? <p className="xs dim" data-testid="rate-none">—</p> : <>
        <p className="rates-rate"><span className="xs dim">{S.rates.rate}</span> <b data-testid="rate-value">{nf3.format(rate)} {table.unit}</b></p>
        <p className="xs dim" data-testid="rate-components">{S.rates.components}: {table.components.map((c, i) => `${c} ${nf3.format(Number(row![4 + i]))}`).join(" + ")}</p>
        {segments && <>
          <p className="rates-amount"><span className="xs dim">{S.rates.amount(String(segments.length), new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(length ?? 0))}</span>{" "}
            <b data-testid="rate-amount">€ {eur(amountCents(segments, rate))}</b></p>
          <button type="button" className="linklike xs" onClick={() => setShowSeg(!showSeg)}>{S.rates.segments(segments.length)}</button>
          {showSeg && <ul className="xs rates-seg" data-testid="rate-segments">{segments.slice(0, 200).map((s) => (
            <li key={s[0]}><span className="mono">{s[0]}</span> {s[1]} → {s[2]} · {s[3]} km · € {eur(sectionCents(s[3], rate))}</li>))}</ul>}
        </>}
      </>}
      <p className="xs faint">{S.rates.note}</p>
      <dl className="kv obs-kv">
        {table.validity && <><dt>{S.rates.validity}</dt><dd>{table.validity}</dd></>}
        {table.rounding && <><dt>{S.rates.rounding}</dt><dd>{table.rounding}</dd></>}
        {table.legal && <><dt>{S.rates.legal}</dt><dd>{table.legal}{tableId && <> · <button type="button" className="linklike xs" onClick={() => store.select(tableId, "inspector")}>↗</button></>}</dd></>}
      </dl>
    </section>);
}
