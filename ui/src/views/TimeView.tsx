// TIME on touch layouts — first the answer to "what happened around my focus, and when?", then a short band of the
// world by year with the focus's moments on it, then the connected dated elements in order of time (each one a
// pivot). Period and granularity are options, closed; no gesture on the band sets a window by accident.
// Sources: the Core's own timeline of the element (/entities/{id}/timeline) and density (/projections/timeline).
// Events that only share one element with the focus are context, listed apart and closed (never as connections).

import { useMemo, useState } from "react";
import { call } from "../lib/api";
import { isAssociation, ROLE_OF_PLACE } from "../lib/connections";
import { TOKENS } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { ErrorNote, Ref, useFetch } from "../components/common";
import { FiltersChip, Freshness, PeriodChip, ResetChip } from "../components/Period";
import { dayLabel } from "../lib/period";

interface Item { id: string; t: number; phrase: string; self?: boolean }

export function TimeView() {
  const focus = useStore((s) => s.focus);
  const scope = useStore((s) => s.scope);
  const status = useStore((s) => s.status);
  const wv = useStore((s) => s.worldVersion);
  useStore((s) => s.rev);
  const [bucket, setBucket] = useState<"year" | "month">("year");
  const f = focus && !focus.startsWith("rel_") ? focus : null;
  const label = store.entity(focus)?.label ?? focus ?? "";

  const tl = useFetch(f ? JSON.stringify(["tv", f, wv]) : null, () =>
    call<any>(`/entities/${f}/timeline`, { b: { max_items: 400 } }, { channel: "tv-focus" }).then((r) => ({ ...r, data: store.normalize(r.data) })));
  const { time_window: _tw, ...rest } = scope;
  const extent = status?.time_extent ?? null;
  const dens = useFetch(extent ? JSON.stringify(["tvd", rest, bucket, wv]) : null, () =>
    call<any>("/projections/timeline", { s: { ...rest, time_window: [Math.floor(extent![0]), Math.ceil(extent![1])] }, bucket, b: { max_items: 1, lod: "aggregates" } },
      { channel: "tv-density" }));

  const { items, context, more } = useMemo(() => {
    const items: Item[] = [], context: Item[] = [];
    if (!f || !tl.data || tl.data.data.focus !== f) return { items, context, more: 0 };
    const seen = new Set<string>();
    for (const e of tl.data.data.entries ?? []) {
      const id = e.ref?.$ref;
      if (!id || e.t_ms == null || seen.has(id)) continue;
      const [why, arg] = String(e.reason ?? "").split(":");
      if (e.entry === "event" && e.reason === "self") { items.push({ id, t: e.t_ms, phrase: S.time.focusSelf, self: true }); seen.add(id); }
      else if (e.entry === "insight") { items.push({ id, t: e.t_ms, phrase: isAssociation(store.entity(id)?.type)
        ? S.conn.ruleAssociation : S.conn.ruleContext }); seen.add(id); }
      else if (e.entry === "event" && why === "participation") { items.push({ id, t: e.t_ms, phrase: ROLE_OF_PLACE[arg] ?? arg.replace(/_/g, " ") }); seen.add(id); }
      else if (e.entry === "event" && why === "shares_participant") { context.push({ id, t: e.t_ms, phrase: "" }); seen.add(id); }
    }
    items.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    context.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    return { items, context, more: (tl.data.total ?? 0) - (tl.data.returned ?? 0) };
  }, [f, tl.data]);

  const dated = items.filter((i) => !i.self);
  const selfItem = items.find((i) => i.self);
  const inWin = (t: number) => !scope.time_window || (scope.time_window[0] <= t && t <= scope.time_window[1]);
  const say = !f ? S.time.world : !tl.data ? S.loading
    : dated.length ? S.time.around(dated.length, label, dayLabel(dated[0].t), dayLabel(dated[dated.length - 1].t))
      : S.time.noneAround(label);
  const appears = !focus ? "" : items.length ? "mark" : "not_applicable";

  return (
    <section className="timeview" aria-label="timeline" data-testid="timeline" data-selected={focus ?? ""} data-appears={appears}
      data-window={scope.time_window ? scope.time_window.join(",") : ""} data-items={dated.length}>
      <div className="tv-bar"><PeriodChip /><FiltersChip /><ResetChip /></div>
      <p className="tv-say" data-testid="tv-say" data-empty={!!f && !!tl.data && !dated.length || undefined}>{say}</p>
      {selfItem && <p className="small dim" style={{ margin: "0 0 6px" }}>{label} · {dayLabel(selfItem.t)}</p>}
      <ErrorNote error={tl.error} />
      {extent && <Band data={dens.data?.data} bucket={bucket} extent={extent} marks={items.map((i) => i.t)} window={scope.time_window ?? null} />}
      {dated.length > 0 && (
        <>
          <h3 className="tv-h">{S.time.list}</h3>
          <ol className="tv-list" data-testid="tv-list">
            {dated.map((i) => (
              <li key={i.id} data-tv={i.id}>
                <span className="tv-date">{dayLabel(i.t)}</span>
                <span className="tv-what"><Ref id={i.id} origin="time" /><span className="xs dim">{i.phrase}
                  {!inWin(i.t) && <> · <span className="tag-excl">{S.time.outside}</span></>}</span></span>
              </li>))}
          </ol>
          {more > 0 && <p className="xs dim">{S.conn.andMore(more)}</p>}
        </>
      )}
      {context.length > 0 && (
        <details className="conn-ctx" data-testid="tv-context">
          <summary>{S.time.contextTitle(context.length)}</summary>
          <div className="xs dim">{S.conn.sameTerritoryNote}</div>
          <ol className="tv-list">{context.map((i) => (
            <li key={i.id}><span className="tv-date">{dayLabel(i.t)}</span><span className="tv-what"><Ref id={i.id} origin="time" /></span></li>))}</ol>
        </details>
      )}
      <details className="conn-ctx tv-options" data-testid="tv-options">
        <summary>{S.time.options}</summary>
        <div className="tv-opt">
          <div className="row small" style={{ flexWrap: "wrap" }}><PeriodChip /><ResetChip /></div>
          <div className="xs dim"><Freshness /></div>
          <div className="row small">{S.time.granularity}
            <span className="seg">{(["year", "month"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={bucket === b} onClick={() => setBucket(b)}>{S.time.bucket[b]}</button>))}</span></div>
        </div>
      </details>
    </section>
  );
}

/** World density per year (or month), with the focus's moments and the active window. Display only. */
function Band({ data, bucket, extent, marks, window: win }: { data: any; bucket: string; extent: [number, number];
  marks: number[]; window: [number, number] | null }) {
  const W = 1000, H = 64, T = 14;
  const x = (t: number) => ((t - extent[0]) / Math.max(1, extent[1] - extent[0])) * W;
  const buckets: { s: number; n: number }[] = (data?.buckets ?? []).map((b: any) => ({ s: b.start_ms, n: b.n }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const step = bucket === "year" ? 365.25 * 864e5 : 30.4 * 864e5;
  const y0 = new Date(extent[0]).getUTCFullYear(), y1 = new Date(extent[1]).getUTCFullYear();
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) if ((y - y0) % Math.max(1, Math.ceil((y1 - y0 + 1) / 5)) === 0) years.push(y);
  return (
    <figure className="tv-band" aria-label={S.time.band}>
      <figcaption className="xs dim">{S.time.band}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + T + 12}`} preserveAspectRatio="none" role="img" aria-hidden>
        {win && <rect x={x(win[0])} y={0} width={Math.max(2, x(win[1]) - x(win[0]))} height={H + T} fill="#E0A64018" />}
        {buckets.map((b) => {
          const h = Math.max(1, (Math.sqrt(b.n) / Math.sqrt(max)) * H);
          return <rect key={b.s} x={x(b.s) + 1} y={H - h} width={Math.max(1, x(b.s + step) - x(b.s) - 2)} height={h} fill="#4B5A63" />;
        })}
        {marks.map((t, i) => <rect key={i} x={x(t) - 2} y={H + 2} width={4} height={T - 4} fill={TOKENS.accent} />)}
      </svg>
      <div className="tv-years mono xs dim">{years.map((y) => <span key={y} style={{ left: `${(x(Date.UTC(y, 0, 1)) / W) * 100}%` }}>{y}</span>)}</div>
    </figure>
  );
}
