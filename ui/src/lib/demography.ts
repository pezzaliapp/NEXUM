// DEMOGRAPHIC LABELS (2026-10-08, demographic audit). Each figure says who produced it, the territory it measures and
// its year, as documented by its source (config/demography.json); the values themselves are never touched. Applied
// where the vocabulary's facts and headlines and the indicators' names enter the app, so every view says the same.
import D from "../config/demography.json";
import type { TypeInfo } from "./types";

type FactOverride = { label: string; label_no_year?: string; year?: string; note?: string };
const FACTS = D.facts as Record<string, Record<string, FactOverride>>;
const HEAD = D.headline as Record<string, Record<string, { prefix?: string; suffix?: string }>>;
const IND = D.indicators as Record<string, { label?: string; definition?: string }>;
const SUMMARY = D.summary_suffix as Record<string, { prefix?: string; suffix?: string }>;
const YEARS = D.pop_year as { scheme: string; by: Record<string, number> };

/** A type as the app shows it: its facts and headline named as their sources define them. */
export function withDemography(t: TypeInfo): TypeInfo {
  const f = FACTS[t.id], h = HEAD[t.id];
  if (!f && !h) return t;
  return { ...t,
    facts: t.facts?.map((x) => (f?.[x.property] ? { ...x, label: f[x.property].label } : x)),
    headline: t.headline?.map((x) => (h?.[x.property] ? { ...x, ...h[x.property] } : x)) };
}

/** The note that defines a fact (territory, year, what it is not), if any. */
export function factNote(type: string | undefined, property: string): string | null {
  return (type && FACTS[type]?.[property]?.note) || null;
}

/** A fact's label for one element: a "{year}" taken from the source's own year for that element, else said missing. */
export function factLabel(type: string | undefined, property: string, label: string, identifiers?: { scheme: string; value: string }[]): string {
  const f = type ? FACTS[type]?.[property] : undefined;
  if (!f || !label.includes("{year}")) return label;
  const id = (identifiers ?? []).find((x) => x.scheme === YEARS.scheme)?.value;
  const y = id ? YEARS.by[id] : undefined;
  return y ? label.replace("{year}", String(y)) : f.label_no_year ?? label.replace(" ({year})", "");
}

/** An indicator's name and definition as its source defines them. */
export function indicatorText(code: string | undefined): { label?: string; definition?: string } {
  return (code && IND[code]) || {};
}

/** A headline part of a summary sentence (computed on the server) with the same wording as the card. */
export function headText(prefix: string, suffix: string): [string, string] {
  const s = SUMMARY[suffix];
  return s ? [s.prefix ?? prefix, s.suffix ?? suffix] : [prefix, suffix];
}
