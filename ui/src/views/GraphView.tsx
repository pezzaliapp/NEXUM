// GRAPH — investigation, not decoration. Neighbourhood of the focus from the Core, hub protection through aggregate
// nodes, progressive expansion (double click), paginated hub expansion, edge inspection with WHY, path between two
// elements. Never more than 2,000 nodes / 4,000 edges; deterministic layout (D3).

import Graph from "graphology";
import Sigma from "sigma";
import { useEffect, useRef, useState } from "react";
import { call, isSuperseded } from "../lib/api";
import { band } from "../lib/confidence";
import { conf } from "../lib/format";
import { bandOpacity, colorOf, TOKENS } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { radialSectors, type LNode } from "../graph/layout";
import { NodeShapeProgram } from "../graph/shapeProgram";
import { Ref, WhyButton } from "../components/common";
import { useViewportClass } from "../App";

const MAX_NODES = 2000, MAX_EDGES = 4000;
const SHAPE_CODE: Record<string, number> = { event: 0, object: 1, insight: 2, aggregate: 1, relation: 0 };

interface AggInfo { id: string; anchor: string; edge_kind: string; type: string; direction: string; count: number;
  remaining: number; cursor?: string | null; loaded: number; pages: number }

function alpha(hex: string, a: number) {
  const n = Math.round(a * 255).toString(16).padStart(2, "0");
  return hex + n;
}

// label geometry of the last rendered frame (read by the responsive E2E test)
const labelBoxes: [number, number, number][] = [];
const labelMaxPx = () => (innerWidth < 768 ? 150 : innerWidth < 1280 ? 220 : 360);

function fitLabel(ctx: CanvasRenderingContext2D, label: string, maxPx: number): string {
  if (ctx.measureText(label).width <= maxPx) return label;
  let lo = 0, hi = label.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(label.slice(0, mid) + "…").width <= maxPx) lo = mid; else hi = mid - 1;
  }
  return label.slice(0, lo).trimEnd() + "…";
}

export function GraphView() {
  const canvasBox = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graph = useRef(new Graph({ multi: true, type: "directed", allowSelfLoops: false }));
  const nodesMeta = useRef(new Map<string, LNode>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const aggs = useRef(new Map<string, AggInfo>());
  const root = useRef<string | null>(null);
  const [tick, setTick] = useState(0);
  const [depth, setDepth] = useState(1);
  const [maxNodes, setMaxNodes] = useState(innerWidth < 768 ? 100 : 200);
  const [showIns, setShowIns] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [agg, setAgg] = useState<AggInfo | null>(null);
  const [edge, setEdge] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [path, setPath] = useState<{ ids: string[]; none: boolean } | null>(null);
  const [outOfWindow, setOutOfWindow] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const size = useViewportClass();
  const phone = size === "phone";
  const focus = useStore((s) => s.focus);
  const secondary = useStore((s) => s.secondary);
  const scope = useStore((s) => s.scope);
  const wv = useStore((s) => s.worldVersion);
  const state = useRef({ focus, secondary, showIns, hidden, path, outOfWindow });
  state.current = { focus, secondary, showIns, hidden, path, outOfWindow };

  // ── sigma instance ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasBox.current) return;
    const g = graph.current;
    const s = new Sigma(g, canvasBox.current, {
      nodeProgramClasses: { shape: NodeShapeProgram },
      defaultNodeType: "shape",
      defaultEdgeColor: "#3A444B",
      labelColor: { color: TOKENS.text },
      labelFont: "system-ui, -apple-system, sans-serif",
      labelSize: 11,
      labelWeight: "400",
      labelDensity: innerWidth < 768 ? 0.35 : 0.6,
      labelGridCellSize: innerWidth < 768 ? 150 : 90,
      labelRenderedSizeThreshold: 5,
      enableEdgeEvents: true,
      zIndex: true,
      allowInvalidContainer: true,
      minCameraRatio: 0.03,
      maxCameraRatio: 12,
      // labels stay inside the canvas: near the right edge they are drawn on the left of the node, and on narrow
      // screens they are shortened with an ellipsis (responsive fix after the official run)
      defaultDrawNodeLabel: (ctx, data, settings) => {
        if (!data.label) return;
        const size = settings.labelSize;
        ctx.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
        const text = fitLabel(ctx, data.label, labelMaxPx());
        const w = ctx.measureText(text).width;
        const width = (ctx.canvas as HTMLCanvasElement).clientWidth;
        const right = data.x + data.size + 3;
        const x = right + w > width - 4 ? Math.max(4, data.x - data.size - 3 - w) : right;
        ctx.fillStyle = TOKENS.text;
        ctx.fillText(text, x, data.y + size / 3);
        labelBoxes.push([x, x + w, data.y]);
      },
      defaultDrawNodeHover: (ctx, data, settings) => {
        const size = settings.labelSize;
        ctx.font = `${size}px ${settings.labelFont}`;
        const label = fitLabel(ctx, data.label ?? "", labelMaxPx());
        const w = ctx.measureText(label).width + 12;
        const width = (ctx.canvas as HTMLCanvasElement).clientWidth;
        const x0 = data.x + data.size + 4 + w > width - 4 ? Math.max(0, data.x - data.size - 4 - w) : data.x + data.size + 4;
        ctx.fillStyle = TOKENS.panel;
        ctx.strokeStyle = "#323A40";
        ctx.fillRect(x0, data.y - size, w, size * 2);
        ctx.strokeRect(x0, data.y - size, w, size * 2);
        ctx.fillStyle = TOKENS.text;
        ctx.fillText(label, x0 + 6, data.y + size / 3);
      },
      nodeReducer: (id, attrs) => {
        const st = state.current;
        const out: any = { ...attrs };
        const onPath = st.path?.ids.includes(id);
        // small neighbourhoods: every node is named (on phone only very small ones; otherwise the label grid decides)
        if (graph.current.order <= (innerWidth < 768 ? 12 : 40)) out.forceLabel = true;
        if (attrs.kind === "insight" && !st.showIns && id !== st.focus) out.hidden = true;
        if (st.outOfWindow.has(id)) out.hidden = true;
        if (id === st.focus) { out.color = TOKENS.accent; out.size = attrs.size * 1.6; out.zIndex = 3; out.forceLabel = true; }
        else if (id === st.secondary) { out.color = TOKENS.link; out.size = attrs.size * 1.4; out.zIndex = 2; out.forceLabel = true; }
        else if (st.path && !st.path.none) { out.color = onPath ? TOKENS.accent : alpha(attrs.baseColor, 0.25); out.forceLabel = onPath; }
        return out;
      },
      edgeReducer: (id, attrs) => {
        const st = state.current;
        const out: any = { ...attrs };
        if (st.hidden.has(`${attrs.edge_kind}:${attrs.etype}`)) out.hidden = true;
        const [a, b] = graph.current.extremities(id);
        if (st.outOfWindow.has(a) || st.outOfWindow.has(b)) out.hidden = true;
        if (!st.showIns && attrs.edge_kind === "insight_member") out.hidden = true;
        if (st.path && !st.path.none) {
          const i = st.path.ids.indexOf(a), j = st.path.ids.indexOf(b);
          if (i >= 0 && j >= 0 && Math.abs(i - j) === 1) { out.color = TOKENS.accent; out.size = 2.5; out.zIndex = 2; }
          else out.color = "#22292E";
        } else if (a === st.focus || b === st.focus) out.color = "#56636B";
        return out;
      },
    });
    s.on("clickNode", ({ node, event }) => {
      const attrs = g.getNodeAttributes(node);
      if (attrs.kind === "aggregate") { setAgg(aggs.current.get(node) ?? null); return; }
      if ((event.original as MouseEvent).shiftKey) store.setSecondary(node);
      else store.select(node, "graph");
    });
    s.on("doubleClickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      if (g.getNodeAttribute(node, "kind") !== "aggregate") expandNode(node);
    });
    s.on("clickEdge", ({ edge: e }) => setEdge({ ...g.getEdgeAttributes(e), ext: g.extremities(e) }));
    s.on("clickStage", () => setEdge(null));
    s.on("enterNode", () => { canvasBox.current!.style.cursor = "pointer"; });
    s.on("leaveNode", () => { canvasBox.current!.style.cursor = ""; });
    sigmaRef.current = s;
    (window.__nexum ??= {}).graph = { positions: () => Object.fromEntries(positions.current), order: () => g.order,
      size: () => g.size, sigma: s, graph: g, aggregates: () => [...aggs.current.values()],
      labelBoxes: () => labelBoxes.map((b) => [...b]) };
    s.on("beforeRender", () => { labelBoxes.length = 0; });
    return () => { s.kill(); sigmaRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sigmaRef.current?.refresh(); }, [focus, secondary, showIns, hidden, path, outOfWindow]);
  useEffect(() => {   // make sure the relation/insight behind a selected edge is in the store (for its label)
    const id = edge?.ref_id;
    if (id && /^(rel|ins)_/.test(id) && !store.entity(id))
      call<any>(`/entities/${id}`, { lod: "refs" }).then((r) => store.normalize(r.data)).catch(() => {});
  }, [edge]);

  // ── building the graph ──────────────────────────────────────────────────
  const layout = () => {
    const f = root.current!;
    const pos = radialSectors.place([...nodesMeta.current.values()], positions.current, f);
    positions.current = pos;
    const g = graph.current;
    for (const [id, p] of pos) if (g.hasNode(id)) g.mergeNodeAttributes(id, p);
  };

  const addNode = (id: string, parent: string | null, group: string, extra: Record<string, any> = {}) => {
    const g = graph.current;
    if (g.hasNode(id)) return false;
    const e = store.entity(id);
    const kind = extra.kind ?? e?.kind ?? "object";
    const t = store.get().types.get(e?.type ?? "");
    const base = kind === "aggregate" ? "#56636B" : colorOf(t?.family, kind);
    const color = kind === "aggregate" ? base : alpha(base, bandOpacity[band(e?.confidence ?? 0.9)]);
    g.addNode(id, { label: extra.label ?? e?.label ?? id, kind, x: 0, y: 0, size: kind === "aggregate" ? 7 : kind === "object" ? 5.5 : 5,
      color, baseColor: base, shape: SHAPE_CODE[kind] ?? 0, ...extra });
    nodesMeta.current.set(id, { id, parent, group });
    return true;
  };

  const addEdge = (e: any) => {
    const g = graph.current;
    if (!g.hasNode(e.src) || !g.hasNode(e.dst) || g.size >= MAX_EDGES) return;
    const key = `${e.src}|${e.dst}|${e.edge_kind}|${e.type}|${e.ref_id}`;
    if (g.hasEdge(key)) return;
    g.addDirectedEdgeWithKey(key, e.src, e.dst, { edge_kind: e.edge_kind, etype: e.type, ref_id: e.ref_id,
      confidence: e.confidence, size: e.edge_kind === "insight_member" ? 0.6 : 1,
      color: e.edge_kind === "insight_member" ? "#4A4436" : "#3A444B" });
  };

  // the rendered graph never exceeds the node budget, aggregate nodes included (W25): the most recently added
  // leaves farthest from the focus are left out first, and the omission is declared
  const [omitted, setOmitted] = useState(0);
  const enforceBudget = (limit: number, protect: string[] = []) => {
    const g = graph.current;
    if (g.order <= limit) return;
    const keep = new Set([root.current, store.get().focus, store.get().secondary, ...protect].filter(Boolean) as string[]);
    const ids = [...nodesMeta.current.keys()].reverse();
    let removed = 0;
    for (const depthFirst of [true, false]) {
      for (const id of ids) {
        if (g.order <= limit) break;
        if (!g.hasNode(id) || keep.has(id) || g.getNodeAttribute(id, "kind") === "aggregate") continue;
        if (depthFirst && g.degree(id) > 1) continue;
        g.dropNode(id);
        nodesMeta.current.delete(id);
        positions.current.delete(id);
        removed++;
      }
    }
    setOmitted((o) => o + removed);
  };

  const merge = (data: any, anchor: string, limit = MAX_NODES) => {
    const d = store.normalize(data);
    const known = new Set(graph.current.nodes());
    const parentOf = new Map<string, { p: string; g: string }>();
    for (const e of d.edges) {
      const dir = e.src === anchor || known.has(e.src) ? "out" : "in";
      const [from, to] = dir === "out" ? [e.src, e.dst] : [e.dst, e.src];
      if (!parentOf.has(to) && to !== anchor) parentOf.set(to, { p: from, g: `${e.edge_kind}:${e.type}:${dir}` });
    }
    let added = 0;
    for (const n of d.nodes) {
      const id = n.$ref;
      const pg = parentOf.get(id);
      if (addNode(id, id === anchor ? null : pg?.p ?? anchor, pg?.g ?? "other")) added++;
    }
    for (const e of d.edges) addEdge(e);
    for (const a of d.aggregates ?? []) {
      if (graph.current.hasNode(a.id)) continue;
      const info: AggInfo = { id: a.id, anchor: a.anchor, edge_kind: a.edge_kind, type: a.type, direction: a.direction,
        count: a.count, remaining: a.remaining, loaded: 0, pages: Math.ceil(a.remaining / 200), cursor: undefined };
      aggs.current.set(a.id, info);
      addNode(a.id, a.anchor, `${a.edge_kind}:${a.type}:${a.direction}~agg`, { kind: "aggregate",
        label: S.graph.aggregate(a.remaining, a.type) });
      addEdge({ src: a.direction === "out" ? a.anchor : a.id, dst: a.direction === "out" ? a.id : a.anchor,
        edge_kind: a.edge_kind, type: a.type, ref_id: a.id, confidence: null });
    }
    enforceBudget(limit);
    layout();
    return added;
  };

  const rebuild = async (f: string) => {
    const g = graph.current;
    g.clear();
    nodesMeta.current.clear();
    positions.current = new Map();
    aggs.current.clear();
    root.current = f;
    setAgg(null); setEdge(null); setPath(null); setMsg(null);
    try {
      const r = await call<any>("/graph/neighborhood", { focus: f, depth: innerWidth < 768 ? 1 : depth, s: store.get().scope,
        b: { max_nodes: maxNodes, max_edges: maxNodes * 2 } }, { channel: "graph" });
      if (root.current !== f) return;
      performance.mark(`nexum:graph:data:${f}`);
      setOmitted(0);
      merge(r.data, f, maxNodes);
      sigmaRef.current?.once("afterRender", () => performance.mark(`nexum:graph:frame:${f}`));
      sigmaRef.current?.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1.4, angle: 0 });
      performance.mark(`nexum:graph:${f}`);
      setTick((t) => t + 1);
    } catch (e) { if (!isSuperseded(e)) setMsg((e as Error).message); }
  };

  const expandNode = async (id: string) => {
    const g = graph.current;
    const room = MAX_NODES - g.order;
    if (room < 10) { setMsg(S.graph.tooMany); return; }
    try {
      const r = await call<any>("/graph/neighborhood", { focus: id, depth: 1, s: store.get().scope,
        b: { max_nodes: Math.min(200, room), max_edges: Math.min(400, MAX_EDGES - g.size) } }, { channel: "graph-expand" });
      merge(r.data, id);
      setTick((t) => t + 1);
    } catch (e) { if (!isSuperseded(e)) setMsg((e as Error).message); }
  };

  const loadAggPage = async (a: AggInfo) => {
    const g = graph.current;
    const room = MAX_NODES - g.order;
    if (room < 1) { setMsg(S.graph.tooMany); return; }
    const r = await call<any>("/graph/expand", { node: a.anchor, edge_kind: a.edge_kind, type: a.type, dir: a.direction,
      cursor: a.cursor ?? undefined, b: { max_nodes: Math.min(200, room) } }, { channel: "graph-agg" });
    const d = store.normalize(r.data);
    const group = `${a.edge_kind}:${a.type}:${a.direction}`;
    let added = 0;
    for (const it of d.items) {
      if (addNode(it.node.$ref, a.anchor, group)) added++;
      addEdge(it.edge);
    }
    const next: AggInfo = { ...a, cursor: r.cursor_next, loaded: a.loaded + d.items.length,
      remaining: Math.max(0, a.remaining - added) };
    aggs.current.set(a.id, next);
    if (g.hasNode(a.id)) {
      if (!r.cursor_next || next.remaining === 0) { g.dropNode(a.id); nodesMeta.current.delete(a.id); }
      else g.setNodeAttribute(a.id, "label", S.graph.aggregate(next.remaining, a.type));
    }
    layout();
    setAgg(r.cursor_next ? next : null);
    setTick((t) => t + 1);
  };

  // rebuild when the focus is chosen outside the graph, or when depth, scope or world change
  const last = useRef<string>("");
  useEffect(() => {
    if (!focus) return;
    const origin = store.get().origin;
    const key = JSON.stringify([depth, maxNodes, scope.types, scope.min_confidence, scope.sources, wv]);
    const inGraph = graph.current.hasNode(focus) && origin === "graph";
    if (inGraph && last.current === key) return;
    last.current = key;
    rebuild(inGraph && root.current ? root.current : focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, depth, maxNodes, JSON.stringify([scope.types, scope.min_confidence, scope.sources]), wv]);

  // temporal filter: events adjacent to the root outside the time window are hidden (and counted)
  useEffect(() => {
    const f = root.current;
    if (!f || !scope.time_window) { setOutOfWindow(new Set()); return; }
    call<any>(`/entities/${f}/events`, { s: { time_window: scope.time_window }, b: { max_items: 500 } }, { channel: "graph-time" })
      .then((r) => {
        const inside = new Set(store.normalize(r.data).items.map((i: any) => i.$ref));
        const out = new Set<string>();
        graph.current.forEachNode((id, a) => { if (a.kind === "event" && !inside.has(id) && id !== store.get().focus) out.add(id); });
        setOutOfWindow(out);
      }).catch(() => {});
  }, [JSON.stringify(scope.time_window), tick]);

  const findPath = async () => {
    const a = store.get().focus, b = store.get().secondary;
    if (!a || !b) return;
    const r = await call<any>("/graph/path", { a, b, max_hops: 4 });
    const d = store.normalize(r.data);
    const ids: string[] = (d.path ?? []).map((x: any) => x.$ref);
    if (!ids.length) { setPath({ ids: [], none: true }); return; }
    for (let i = 0; i < ids.length; i++) addNode(ids[i], i ? ids[i - 1] : null, "path");
    for (let i = 1; i < ids.length; i++) {
      const g = graph.current;
      if (!g.someEdge(ids[i - 1], ids[i], () => true) && !g.someEdge(ids[i], ids[i - 1], () => true))
        addEdge({ src: ids[i - 1], dst: ids[i], edge_kind: "path", type: "path", ref_id: `path-${i}`, confidence: null });
    }
    enforceBudget(MAX_NODES, ids);
    layout();
    setPath({ ids, none: false });
    setTick((t) => t + 1);
  };

  const keepPath = () => {
    if (!path || path.none) return;
    const keep = new Set(path.ids);
    graph.current.forEachNode((id) => { if (!keep.has(id)) { graph.current.dropNode(id); nodesMeta.current.delete(id); } });
    setTick((t) => t + 1);
  };

  const edgeGroups = new Map<string, number>();
  graph.current.forEachEdge((_e, a) => { if (a.edge_kind !== "path") edgeGroups.set(`${a.edge_kind}:${a.etype}`, (edgeGroups.get(`${a.edge_kind}:${a.etype}`) ?? 0) + 1); });
  const g = graph.current;
  void tick;

  const empty = !focus && !g.order;
  return (
    <>
      <div ref={canvasBox} className="graph-canvas" data-testid="graph" data-root={root.current ?? ""} data-order={g.order} data-size={g.size} />
      {empty && <div className="overlay-center" data-testid="graph-empty"><div>{S.graph.noFocus}</div></div>}
      <div className="view-toolbar">
        {!phone && <>
          <span className="chip">{S.graph.depth}</span>
          <span className="seg">{[1, 2, 3].map((d) => (
            <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)} data-depth={d}>{d}</button>))}</span>
          <span className="chip">{S.graph.budgetLabel}</span>
          <span className="seg">{[200, 1000, 2000].map((n) => (
            <button key={n} type="button" aria-pressed={maxNodes === n} onClick={() => setMaxNodes(n)} data-max-nodes={n}>{n}</button>))}</span>
        </>}
        {phone && <span className="chip mono" data-testid="graph-phone-limits">{S.graph.phoneLimits}</span>}
        <span className="chip mono" data-testid="graph-count">{S.graph.nodes(g.order, g.size)}</span>
        {phone && <button type="button" className="chip" aria-expanded={filtersOpen} data-testid="graph-filters-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}>{S.graph.filters} {filtersOpen ? "▴" : "▾"}</button>}
        {(!phone || filtersOpen) && <span className={phone ? "graph-filters" : "contents"} data-testid="graph-filters">
          <button type="button" className="chip" aria-pressed={showIns} onClick={() => setShowIns(!showIns)}>◆ {S.graph.insightsToggle}</button>
          {[...edgeGroups.entries()].sort().slice(0, 8).map(([k, n]) => (
            <button key={k} type="button" className={`chip${hidden.has(k) ? "" : " acc"}`} title={k} onClick={() => {
              const nx = new Set(hidden); nx.has(k) ? nx.delete(k) : nx.add(k); setHidden(nx);
            }}>{k.split(":")[1]} {n}</button>))}
        </span>}
        {outOfWindow.size > 0 && <span className="chip">{outOfWindow.size} eventi fuori finestra</span>}
        {omitted > 0 && <span className="chip" data-testid="graph-omitted">{S.graph.omitted(omitted)}</span>}
      </div>
      <div className="graph-side">
        {secondary && <button type="button" className="chip acc" onClick={findPath} data-testid="path-btn">{S.graph.pathTo}</button>}
        {!secondary && !phone && <span className="chip">{S.graph.pathHint}</span>}
        {path && <span className="chip acc" data-testid="path-result" data-path={path.ids.join(",")}>
          {path.none ? S.graph.pathNone : S.graph.pathFound(path.ids.length - 1)}</span>}
        {path && !path.none && <button type="button" className="chip" onClick={keepPath}>{S.graph.keepPath}</button>}
        <button type="button" className="chip" onClick={() => { setPath(null); sigmaRef.current?.getCamera().animatedReset({ duration: 200 }); }}>{S.graph.recenter}</button>
        {agg && (
          <div className="aggpanel" data-testid="agg-panel">
            <div><strong>{S.graph.aggregate(agg.remaining, agg.type)}</strong></div>
            <div className="xs dim">{agg.edge_kind} · {agg.direction} · totale {agg.count.toLocaleString("it-IT")}</div>
            <div className="xs dim">{S.graph.pageOf(Math.ceil(agg.loaded / 200), Math.ceil((agg.count) / 200))}</div>
            <button type="button" className="primary small" data-testid="agg-next" onClick={() => loadAggPage(agg)}>{S.graph.nextPage}</button>
          </div>
        )}
        {msg && <span className="chip acc">{msg}</span>}
      </div>
      {edge && (
        <div className="edgepanel" data-testid="edge-panel">
          <div className="row"><strong className="grow">{S.graph.edgeKinds[edge.edge_kind] ?? edge.edge_kind} · {edge.etype}</strong>
            <button type="button" onClick={() => setEdge(null)}>×</button></div>
          <div className="row small"><Ref id={edge.ext[0]} origin="graph" /> → <Ref id={edge.ext[1]} origin="graph" /></div>
          {edge.confidence != null && <div className="xs dim">confidenza {conf(edge.confidence)}</div>}
          {/^(rel|ins)_/.test(edge.ref_id ?? "") && <div className="row" style={{ marginTop: 4 }}>
            <Ref id={edge.ref_id} origin="graph" /><WhyButton id={edge.ref_id} /></div>}
          {edge.edge_kind === "participation" && <div className="xs dim">ruolo di partecipazione dell'evento: {edge.etype}</div>}
        </div>
      )}
    </>
  );
}
