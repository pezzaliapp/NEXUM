// What NEXUM found, in a sentence a person reads first ("6 morti registrati; Kryvyy Rih (652.380 abitanti) a 4,0 km").
// Built only from the summary the API layer derives from the Core's records (GET /insight-summaries: members, recorded
// distances and time gaps, the facts the vocabulary's display hints mark as headline). Nothing is inferred: an absent
// value is simply not said. Pure functions + a small registry; the engine (rule, thresholds, confidence) stays in
// "Perché?".

import { headText } from "./demography";
import { duration } from "./format";

export type HeadPart = [string, string | number | boolean, string, number | null];
/** [id, type, label, headline parts, t] (+ distance km for the nearest collected member) */
export type Member = [string, string, string, HeadPart[], number | null, (number | null)?];
export interface Summary { k: string; r: string; a?: Member | null; b?: Member | null; n?: Member | null; c?: number; km?: number; dt?: number }

const nf = (d: number | null) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: d ?? 2, minimumFractionDigits: 0 });

export function fmtValue(v: string | number | boolean, digits: number | null): string {
  if (typeof v === "number") return nf(digits).format(v);
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (Array.isArray(v)) return (v as unknown[]).join(", ");
  return String(v);
}

/** "M 6,1", "652.380 abitanti", "Nuclear · 1.746 MW" */
export function head(parts: HeadPart[] | undefined | null): string {
  return (parts ?? []).map(([p, v, s, d]) => { const [a, b] = headText(p, s); return `${a}${fmtValue(v, d)}${b}`; }).join(" · ");
}

const km = (n: number) => `${nf(1).format(n)} km`;
const gap = (ms: number) => duration(Math.abs(ms));

/** The sentence of a rule output, from its members. typeLabel names the types (vocabulary labels). */
export function sentence(s: Summary | null | undefined, typeLabel: (t: string) => string): string | null {
  if (!s) return null;
  if (s.k === "context" && s.n) {
    const ha = head(s.a?.[3]);
    const hn = head(s.n[3]);
    const dist = s.n[5];
    return [ha || null, `${s.n[2]}${hn ? ` (${hn})` : ""}${dist != null ? ` a ${km(dist)}` : ""}${(s.c ?? 0) > 1 ? ` · ${s.c} in tutto nel raggio` : ""}`]
      .filter(Boolean).join("; ");
  }
  if (s.a && s.b) {
    const one = (m: Member) => `${typeLabel(m[1])}${head(m[3]) ? ` (${head(m[3])})` : ""}`;
    const tail = [s.km != null ? km(s.km) : null, s.dt != null ? `${gap(s.dt)} di distanza nel tempo` : null].filter(Boolean).join(", ");
    return `${one(s.b)} e ${one(s.a).toLowerCase()}${tail ? ` · ${tail}` : ""}`;
  }
  return null;
}

/** A short label for the map: the fact and the nearest element, or the two kinds associated. */
export function shortLabel(s: Summary | null | undefined, typeLabel: (t: string) => string): string | null {
  if (!s) return null;
  if (s.k === "context" && s.n) {
    const ha = head(s.a?.[3]);
    return `${ha ? `${ha} · ` : ""}${s.n[2]}${s.n[5] != null ? ` a ${km(s.n[5])}` : ""}`;
  }
  if (s.a && s.b) return `${typeLabel(s.b[1])} e ${typeLabel(s.a[1]).toLowerCase()}`;
  return s.r;
}

// ── registry (filled by the highlights inline and by GET /insight-summaries, loaded once on demand) ──
const REG = new Map<string, Summary>();
let all: Promise<void> | null = null;
export const summaryOf = (id: string) => REG.get(id) ?? null;
export function register(id: string, s: Summary | null | undefined) { if (s) REG.set(id, s); }
export function loadAll(fetcher: () => Promise<Record<string, Summary>>): Promise<void> {
  if (!all) all = fetcher().then((m) => { for (const [k, v] of Object.entries(m)) REG.set(k, v); }).catch(() => { all = null; });
  return all;
}
