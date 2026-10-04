// PERIODO · FILTRI · RIPRISTINA — what the person is looking at, always readable, and one way back to the start.
// Four different notions are never mixed: the device date (unused), the publication of the snapshot, the observed
// period, the date of an event. "Filtri · N" counts only changes the person made; the starting display settings
// are not filters. Ripristina restores period and filters and never touches the focus (FOCUS ≠ FILTER).

import { useState } from "react";
import { openOverlay } from "../lib/layers";
import { dayLabel, DEFAULT_PERIOD, monthLabel, periodMonths, periodName, samePeriod, type Period } from "../lib/period";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { userChanges } from "../store/store";

export function usePeriodName(): string {
  const period = useStore((s) => s.period);
  const clock = useStore((s) => s.clock);
  return clock ? periodName(period, clock.anchor, clock.first) : "";
}

export function useChanges() {
  useStore((s) => s.scope);
  useStore((s) => s.period);
  useStore((s) => s.mapFloor);
  return userChanges(store.get());
}

/** Periodo · ultimi 12 mesi (accent when chosen by the person). */
export function PeriodChip() {
  const name = usePeriodName();
  const clock = useStore((s) => s.clock);
  const ch = useChanges();
  if (!clock) return null;
  return (
    <button type="button" className={`chip period-chip${ch.period ? " acc" : ""}`} data-testid="period-chip"
      data-changed={ch.period || undefined} onClick={() => openOverlay("period")}>{S.period.chip(name)}</button>);
}

/** Filtri — with a number only for the person's own changes. */
export function FiltersChip() {
  const ch = useChanges();
  return (
    <button type="button" className={`chip filters-chip${ch.filters ? " acc" : ""}`} data-testid="filters-chip" data-active={ch.filters}
      onClick={() => openOverlay("filters")}>{ch.filters ? `${S.m.filters} · ${ch.filters}` : S.m.filters}</button>);
}

/** Ripristina — visible as soon as anything differs from the start. */
export function ResetChip({ always = false }: { always?: boolean }) {
  const ch = useChanges();
  if (!always && !ch.period && !ch.filters) return null;
  return (
    <button type="button" className="chip reset-chip" data-testid="reset" title={S.resetTitle}
      disabled={!ch.period && !ch.filters} onClick={() => store.resetFilters()}>{S.reset}</button>);
}

/** Dati aggiornati al 29 set 2026 — the last time the world received data from its sources. */
export function Freshness({ className = "" }: { className?: string }) {
  const clock = useStore((s) => s.clock);
  if (!clock) return null;
  return <span className={`freshness ${className}`} data-testid="freshness" data-latest={clock.latestMs}>{S.period.fresh(dayLabel(clock.latestMs))}</span>;
}

/** The period choices: presets in whole months, one year, or custom months; the state is always written out. */
export function PeriodSheet() {
  const period = useStore((s) => s.period);
  const clock = useStore((s) => s.clock);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  if (!clock) return null;
  const { anchor, first } = clock;
  const choose = (p: Period) => { store.setPeriod(p); store.set({ overlay: null }); };
  const presets: { p: Period; label: string }[] = [
    { p: { kind: "month" }, label: `Questo mese · ${monthLabel(anchor)}` },
    { p: { kind: "last3" }, label: "Ultimi 3 mesi" },
    { p: DEFAULT_PERIOD, label: "Ultimi 12 mesi" },
    { p: { kind: "all" }, label: `Tutto · ${Math.floor(first / 12)}–${Math.floor(anchor / 12)}` },
  ];
  const years: number[] = [];
  for (let y = Math.floor(anchor / 12); y >= Math.floor(first / 12); y--) years.push(y);
  const months: number[] = [];
  for (let m = anchor; m >= first; m--) months.push(m);
  const f = from ?? (period.kind === "custom" ? period.from : anchor - 11), t = to ?? (period.kind === "custom" ? period.to : anchor);
  const months0 = periodMonths(period, anchor, first);
  return (
    <div className="ov-body period-sheet" data-testid="period-sheet">
      <p className="period-now"><strong>{periodName(period, anchor, first)}</strong>{months0 && months0 !== periodName(period, anchor, first) ? ` · ${months0}` : ""}</p>
      <p className="xs dim"><Freshness /></p>
      <div className="ov-h">{S.period.presets}</div>
      <div className="period-grid">
        {presets.map(({ p, label }) => (
          <button key={label} type="button" className="primary" aria-pressed={samePeriod(p, period)} data-period={p.kind}
            onClick={() => choose(p)}>{label}{samePeriod(p, DEFAULT_PERIOD) ? " (iniziale)" : ""}</button>))}
      </div>
      <div className="ov-h">{S.period.year}</div>
      <div className="period-grid years">
        {years.map((y) => (
          <button key={y} type="button" className="primary" aria-pressed={period.kind === "year" && period.year === y} data-year={y}
            onClick={() => choose({ kind: "year", year: y })}>{y}</button>))}
      </div>
      <div className="ov-h">{S.period.custom}</div>
      <div className="period-custom">
        <label>{S.period.from} <select value={f} onChange={(e) => setFrom(Number(e.target.value))}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <label>{S.period.to} <select value={t} onChange={(e) => setTo(Number(e.target.value))}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <button type="button" className="primary" data-testid="period-custom-apply"
          onClick={() => choose({ kind: "custom", from: Math.min(f, t), to: Math.max(f, t) })}>{S.period.apply}</button>
      </div>
      <p className="xs dim">{S.period.note}</p>
      <div className="ov-actions"><ResetChip always /></div>
    </div>);
}
