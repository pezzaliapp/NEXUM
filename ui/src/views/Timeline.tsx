// TIMELINE — ONE TIMELINE for the whole workspace. Density per bucket from the Core (aggregates), the focus track and
// the related track; the brush sets Scope.time_window for every view; wheel zooms the time axis; clicking a bucket
// narrows the window to it; clicking an element selects it (same stable ref as everywhere else).

import { useEffect, useRef, useState } from "react";
import { call, isSuperseded } from "../lib/api";
import { utc } from "../lib/format";
import { colorOf, TOKENS } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { monthIndex } from "../lib/period";
import { ResetChip, useChanges, usePeriodName } from "../components/Period";

interface Bucket { start: number; end: number; n: number }
interface Mark { id: string; t: number; track: 0 | 1 }
const DAY = 86400e3, YEAR = 365.25 * DAY;
const PAD_L = 64, PAD_R = 12;

function bucketEnd(bucket: string, start: number) {
  const d = new Date(start);
  if (bucket === "year") return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  if (bucket === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return start + (bucket === "day" ? DAY : 3600e3);
}

export function Timeline() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const status = useStore((s) => s.status);
  const scope = useStore((s) => s.scope);
  const focus = useStore((s) => s.focus);
  const wv = useStore((s) => s.worldVersion);
  const rev = useStore((s) => s.rev);
  const extent = status?.time_extent ?? null;
  const [view, setView] = useState<[number, number] | null>(null);
  const [data, setData] = useState<{ buckets: Bucket[]; bucket: string; max: number; hlT: number | null } | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [marksFor, setMarksFor] = useState<string | null>(null);   // focus whose connections the marks show
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hover = useRef<string | null>(null);
  const pname = usePeriodName();
  const changed = useChanges().period;

  useEffect(() => {
    if (extent && !view) { const pad = (extent[1] - extent[0]) * 0.02; setView([extent[0] - pad, extent[1] + pad]); }
  }, [extent?.[0], extent?.[1]]);

  // density (aggregates) for the visible range, in the current scope without its time window
  useEffect(() => {
    if (!view) return;
    const { time_window: _tw, ...rest } = scope;
    if (Array.isArray(rest.types) && rest.types.length === 0) { setData({ buckets: [], bucket: "", max: 1, hlT: null }); return; }
    const t = setTimeout(() => {
      call<any>("/projections/timeline", { s: { ...rest, time_window: [Math.round(view[0]), Math.round(view[1])] },
        bucket: "auto", b: { max_items: 1, lod: "aggregates" }, hl: focus && !focus.startsWith("rel_") ? focus : undefined },
        { channel: "timeline" }).then((r) => {
        const bk = r.data.effective_scope.bucket as string;
        const raw = r.data.buckets as any[];
        const buckets = raw.map((b) => ({ start: b.start_ms, end: bucketEnd(bk, b.start_ms), n: b.n }));
        const hl = r.highlight?.find((h: any) => h.appears_as === "in_bucket");
        setData({ buckets, bucket: bk, max: Math.max(1, ...buckets.map((b) => b.n)), hlT: hl?.t_ms ?? null });
        setErr(null);
      }, (e) => { if (!isSuperseded(e)) setErr((e as Error).message); });
    }, 120);
    return () => clearTimeout(t);
  }, [view?.[0], view?.[1], JSON.stringify({ ...scope, time_window: null }), wv, focus]);

  // focus track + related track
  useEffect(() => {
    if (!focus || focus.startsWith("rel_")) { setMarks([]); return; }
    const out: Mark[] = [];
    const tasks: Promise<any>[] = [
      call<any>(`/entities/${focus}/timeline`, { b: { max_items: 400 } }, { channel: "tl-focus" }).then((r) => {
        const d = store.normalize(r.data);
        for (const e of d.entries ?? []) if (e.ref?.$ref && e.t_ms != null) out.push({ id: e.ref.$ref, t: e.t_ms, track: 0 });
      }),
    ];
    if (/^(evt|ins)_/.test(focus)) tasks.push(call<any>(`/entities/${focus}/timeline/neighbors`, { b: { max_items: 300 } },
      { channel: "tl-neigh" }).then((r) => {
      const d = store.normalize(r.data);
      for (const it of d.items ?? []) { const e = store.entity(it.$ref); if (e?.t != null) out.push({ id: it.$ref, t: e.t, track: 1 }); }
      if (d.center_ms != null) out.push({ id: focus, t: d.center_ms, track: 0 });
    }));
    Promise.allSettled(tasks).then(() => { setMarks(out); setMarksFor(focus); });
  }, [focus, wv]);

  // ── drawing ─────────────────────────────────────────────────────────────
  const geom = () => {
    const c = canvas.current!;
    const w = c.clientWidth, h = c.clientHeight;
    const x = (t: number) => PAD_L + ((t - view![0]) / (view![1] - view![0])) * (w - PAD_L - PAD_R);
    const t = (px: number) => view![0] + ((px - PAD_L) / (w - PAD_L - PAD_R)) * (view![1] - view![0]);
    const densH = Math.max(28, h - 58);
    return { w, h, x, t, densTop: 16, densH, trackF: 16 + densH + 12, trackR: 16 + densH + 30 };
  };

  const draw = () => {
    const c = canvas.current;
    if (!c || !view) return;
    const t0 = performance.now();
    const dpr = devicePixelRatio || 1;
    if (c.width !== Math.round(c.clientWidth * dpr) || c.height !== Math.round(c.clientHeight * dpr)) {
      c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = geom();
    ctx.clearRect(0, 0, g.w, g.h);
    // axis
    ctx.fillStyle = TOKENS.dim;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.strokeStyle = "#20272B";
    const span = view[1] - view[0];
    const step = span > 30 * YEAR ? 10 * YEAR : span > 6 * YEAR ? YEAR : span > 400 * DAY ? YEAR / 4 : span > 60 * DAY ? YEAR / 12 : span > 5 * DAY ? DAY * 7 : DAY;
    const d0 = new Date(view[0]);
    let tick = step >= YEAR ? Date.UTC(d0.getUTCFullYear(), 0, 1) : step >= YEAR / 12 ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) : Math.floor(view[0] / DAY) * DAY;
    let lastLabel = -1e9;
    for (let i = 0; i < 400 && tick < view[1]; i++) {
      const px = g.x(tick);
      if (px >= PAD_L) {
        const lab0 = step >= YEAR ? String(new Date(tick).getUTCFullYear()) : utc(tick, "day").slice(0, step >= YEAR / 12 ? 7 : 10);
        const room = lab0.length * 6.4 + 8;
        ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, g.h); ctx.stroke();
        if (px - lastLabel >= room) { ctx.fillText(lab0, px + 3, 10); lastLabel = px; }
      }
      if (step >= YEAR) tick = Date.UTC(new Date(tick).getUTCFullYear() + Math.round(step / YEAR), 0, 1);
      else if (step >= YEAR / 12) { const d = new Date(tick); tick = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.round(step / (YEAR / 12)), 1); }
      else tick += step;
    }
    // density
    if (data) {
      for (const b of data.buckets) {
        const x0 = g.x(b.start), x1 = g.x(bucketEnd(data.bucket, b.start));
        const hgt = Math.max(1, (Math.sqrt(b.n) / Math.sqrt(data.max)) * g.densH);
        const hl = data.hlT != null && data.hlT >= b.start && data.hlT < bucketEnd(data.bucket, b.start);
        ctx.fillStyle = hl ? TOKENS.accent : "#4B5A63";
        ctx.fillRect(x0 + 0.5, g.densTop + g.densH - hgt, Math.max(1, x1 - x0 - 1), hgt);
      }
    }
    // window (brush)
    const win = drag ? [Math.min(drag[0], drag[1]), Math.max(drag[0], drag[1])] : scope.time_window;
    if (win) {
      const a = g.x(win[0]), b = g.x(win[1]);
      ctx.fillStyle = "#E0A64018"; ctx.fillRect(a, 0, b - a, g.h);
      ctx.strokeStyle = TOKENS.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, g.h); ctx.moveTo(b, 0); ctx.lineTo(b, g.h); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // tracks
    ctx.fillStyle = TOKENS.dim;
    ctx.fillText(S.time.focusTrack, 2, g.trackF - 5);
    ctx.fillText(S.time.relatedTrack, 2, g.trackR - 5);
    const types = store.get().types;
    for (const m of marks) {
      const px = g.x(m.t);
      if (px < PAD_L - 4 || px > g.w - PAD_R + 4) continue;
      const e = store.entity(m.id);
      const y = m.track === 0 ? g.trackF : g.trackR;
      const isF = m.id === store.get().focus;
      ctx.fillStyle = isF ? TOKENS.accent : colorOf(types.get(e?.type ?? "")?.family, e?.kind);
      const r = isF ? 5 : m.id === hover.current ? 4.5 : 3.2;
      ctx.beginPath();
      if (e?.kind === "insight") { ctx.moveTo(px, y - r); ctx.lineTo(px + r, y); ctx.lineTo(px, y + r); ctx.lineTo(px - r, y); }
      else ctx.arc(px, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    performance.measure("nexum:timeline:draw", { start: t0, end: performance.now() });
  };

  useEffect(() => { draw(); });
  useEffect(() => { (window.__nexum ??= {}).timeline = { setView: (v: [number, number]) => setView(v) }; }, []);
  useEffect(() => {
    const on = () => draw();
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  });
  void rev;

  // ── interaction ─────────────────────────────────────────────────────────
  const markAt = (px: number, py: number) => {
    const g = geom();
    let best: Mark | null = null, bd = 7;
    for (const m of marks) {
      const y = m.track === 0 ? g.trackF : g.trackR;
      const d = Math.hypot(g.x(m.t) - px, y - py);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };
  const down = useRef<{ x: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!view) return;
    const r = canvas.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const m = markAt(px, py);
    if (m) { store.select(m.id, "timeline"); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    down.current = { x: px, t: geom().t(px) };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!view) return;
    const r = canvas.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (down.current && Math.abs(px - down.current.x) > 3) { setDrag([down.current.t, geom().t(px)]); return; }
    const m = markAt(px, py);
    if ((m?.id ?? null) !== hover.current) {
      hover.current = m?.id ?? null;
      canvas.current!.title = m ? `${store.entity(m.id)?.label ?? m.id} · ${utc(m.t)}` : S.time.brushHint;
      draw();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!down.current || !view) return;
    const r = canvas.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    // the period changes only by a deliberate drag (whole months, as the map counts them); a click changes nothing
    if (drag) {
      const a = Math.round(Math.min(drag[0], drag[1])), b = Math.round(Math.max(drag[0], drag[1]));
      setDrag(null);
      store.setPeriod({ kind: "custom", from: monthIndex(a), to: monthIndex(b) });
    }
    void px;
    down.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!view) return;
    const r = canvas.current!.getBoundingClientRect();
    const t = geom().t(e.clientX - r.left);
    const k = Math.exp(e.deltaY * 0.0015);
    const a = t - (t - view[0]) * k, b = t + (view[1] - t) * k;
    if (b - a < 6 * 3600e3 || b - a > 200 * YEAR) return;
    setView([a, b]);
  };

  if (!extent) return <section className="tl"><div className="overlay-center">{S.time.noTime}</div></section>;
  return (
    <section className="tl" aria-label="timeline" data-testid="timeline" data-bucket={data?.bucket ?? ""}
      data-selected={focus ?? ""} data-appears={!focus ? "" : marks.some((m) => m.id === focus) ? "mark" : data?.hlT != null ? "in_bucket" : "not_applicable"}
      data-hl={data?.hlT ?? ""} data-counts={data ? JSON.stringify(data.buckets.map((b) => [b.start, b.n])) : ""}
      data-buckets={data?.buckets.length ?? 0} data-window={scope.time_window ? scope.time_window.join(",") : ""}>
      <div className="tl-head">
        <span>{S.time.density} · per {S.time.bucket[data?.bucket ?? ""] ?? "—"}</span>
        <span className={changed ? "accent" : ""} data-testid="tl-window">{S.period.chip(pname)}</span>
        <span className="grow" />
        {err && <span className="err">{err}</span>}
        <ResetChip />
        <button type="button" className="xs" onClick={() => { const pad = (extent[1] - extent[0]) * 0.02; setView([extent[0] - pad, extent[1] + pad]); }}>{S.time.reset}</button>
      </div>
      <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
        onDoubleClick={() => { const pad = (extent[1] - extent[0]) * 0.02; setView([extent[0] - pad, extent[1] + pad]); }} />
      {focus && !focus.startsWith("rel_") && marksFor === focus && !marks.some((m) => m.id !== focus) && (
        <div className="tl-empty" data-testid="tl-empty">{S.time.noDated(store.entity(focus)?.label ?? focus)}</div>)}
    </section>
  );
}
