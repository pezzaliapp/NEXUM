// SUMMARY OF THE FACTS (2026-10-08, the author's decision B after the physical test: a local language model, even
// checked, could change the meaning — "energia elettronica" for wind power, "almeno" for an exact value). NEXUM itself
// composes the summary of the element or event in focus from the facts it documents — what it is, the source's own
// fields, the latest indicators with year and source, the connections NEXUM found — each sentence a fixed form filled
// with values copied as they are, each with its source. No language model, no generated text, no download.

import { useEffect, useState } from "react";
import { store, useStore } from "../store";
import { typeLabelOf } from "../components/Highlights";
import { loadIndicators } from "../components/Indicators";
import { fmt } from "../components/Observations";
import { factLabel } from "../lib/demography";

/** The key indicators of a place's overview (PlaceView › Overview), in its order. */
const KEY = ["SP.POP.TOTL", "EN.POP.DNST", "SP.URB.TOTL.IN.ZS", "EN.URB.LCTY", "eurostat.earnings.net", "eurostat.earnings.gross", "oecd.wage.gross_annual",
  "NY.GDP.PCAP.CN", "NY.GDP.PCAP.CD", "elec.generation.total"];

export interface Line { label: string; items: { text: string; source: string }[] }

/** The facts NEXUM shows for the element in focus, grouped as the summary says them. Nothing is computed or rephrased:
 *  every value is copied from the card's own data, with its source. */
export async function summaryOfFocus(): Promise<{ name: string; kind: string; lines: Line[] } | null> {
  const st = store.get();
  if (!st.focus) return null;
  const e = store.entity(st.focus);
  if (!e) return null;
  const ctx = st.context?.id === st.focus ? st.context.data : null;
  const src = (ctx?.sources ?? []).map((s: any) => s.name).join(", ") || "NEXUM";
  const lines: Line[] = [];
  const props = e.details?.properties ?? {};
  const own = (st.types.get(e.type)?.facts ?? []).map((f) => [f, props[f.property]] as const).filter(([, v]) => v != null && v !== "")
    .map(([f, v]) => ({ text: `${factLabel(e.type, f.property, f.label, e.details?.identifiers)}: ${typeof v === "string" && f.values?.[v] ? f.values[v] : typeof v === "boolean" ? (v ? "sì" : "no") : v}${f.unit ? ` ${f.unit}` : ""}`, source: src }));
  if (e.t) own.push({ text: `Data: ${new Date(e.t).toISOString().slice(0, 10)}`, source: src });
  if (own.length) lines.push({ label: "Dati della fonte", items: own });
  try {
    const ind = await loadIndicators(st.focus, st.worldVersion);
    // the card's own key indicators first, in its order (Panoramica), then the others
    const key = KEY.flatMap((c) => ind.list.filter((x) => x.props.indicator === c));
    const items = [...key, ...ind.list.filter((x) => !key.includes(x))].slice(0, 8).flatMap((s) => {
      const last = s.points[s.points.length - 1];
      return last ? [{ text: `${s.label}: ${fmt(s, last[2])} (${String(last[1] ?? "").slice(0, 4)})`, source: (ind.names[s.source_id] ?? s.source_id).split(" — ")[0] }] : [];
    });
    if (items.length) lines.push({ label: "Indicatori più recenti", items });
  } catch { /* a place without indicators: said by the absence of the line */ }
  const links = ["related_objects", "related_events"].flatMap((sec) => (ctx?.[sec]?.items ?? []) as any[])
    .filter((it) => !String(it.reason ?? "").startsWith("shares_participant"));
  const named = links.slice(0, 5).flatMap((it) => { const r = store.entity(it.$ref); return r ? [{ text: `${r.label} (${typeLabelOf(r.type)})`, source: "NEXUM" }] : []; });
  lines.push({ label: links.length ? `Collegamenti trovati da NEXUM (${links.length}${links.length > named.length ? `, i primi ${named.length}` : ""})` : "Collegamenti trovati da NEXUM", items: named });
  return { name: e.label, kind: typeLabelOf(e.type), lines };
}

export default function Ai() {
  const focus = useStore((s) => s.focus);
  const ctxReady = useStore((s) => s.context?.id === s.focus);
  const [sum, setSum] = useState<Awaited<ReturnType<typeof summaryOfFocus>> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setSum(undefined);
    summaryOfFocus().then((x) => { if (live) setSum(x); });
    return () => { live = false; };
  }, [focus, ctxReady]);
  return (
    <div data-testid="ops-ai">
      <p className="xs dim" data-testid="ops-ai-about">La sintesi è composta da NEXUM <b>solo con i fatti che documenta</b> per l'elemento o l'evento in primo piano: ogni valore è copiato dalla scheda, con la sua fonte.
        Nessun modello linguistico, nessun testo generato, nessun download.</p>
      {!focus && <p className="xs" data-testid="ops-ai-none">Scegli un elemento o un evento sulla mappa, nel grafo o nella ricerca: qui comparirà la sintesi dei suoi fatti.</p>}
      {focus && sum === undefined && <p className="xs dim">…</p>}
      {focus && sum && <div className="ops-ai-out" data-testid="ops-ai-summary">
        <p data-testid="ops-ai-head"><b>{sum.name}</b> — {sum.kind}.</p>
        {sum.lines.map((l) => <div key={l.label} data-testid="ops-ai-line">
          <div className="hl-h">{l.label}</div>
          {l.items.length ? <ul className="ops-list">{l.items.map((x, i) => <li key={i} className="xs">{x.text} <span className="dim">· {x.source}</span></li>)}</ul>
            : <p className="xs dim">Nessuno.</p>}</div>)}
        <p className="xs dim">Le spiegazioni (Perché?), le prove e i dati grezzi sono nella scheda NEXUM.</p></div>}
    </div>);
}
