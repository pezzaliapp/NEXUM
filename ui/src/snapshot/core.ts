// Browser read model: the scope-dependent operations of nexum.core.query.Query, ported statement by statement
// onto the snapshot's ordered row sets. Same filters, same orderings, same envelopes. Every function names its
// Python original; the parity suite (nexum.snapshot.parity + tests/parity) compares the two on sampled requests.

import { NotFound, type SnapshotData } from "./data.ts";
import { AGG_LEVELS, aggLevel, cell, cellBbox, DAY, HOUR, LOCAL_Z, MAX_LEVEL, monthIndex, monthStartMs,
  viewportCells } from "./geo.ts";
import { cmp, divmod, pyFloatRepr, pyJsonLen, pyRound, truthy } from "./py.ts";

export class QueryError extends Error {}

const KIND_BY_PREFIX: Record<string, string> = { obj: "object", evt: "event", rel: "relation", ins: "insight" };
export const LIMITS: Record<string, [number, number]> = {
  max_items: [500, 5000], max_nodes: [200, 2000], max_edges: [400, 4000], max_bytes: [2_000_000, 10_000_000] };
const LODS = ["auto", "counts", "aggregates", "refs", "details"];
const BAND_FLOOR: Record<number, number> = { 0: 0.0, 1: 0.5, 2: 0.8 };
const RANK_LIMIT = 20_000;
const BAND_LABEL: Record<number, string> = { 2: "forte", 1: "medio", 0: "debole" };

export function kindOf(eid: string): string {
  const k = KIND_BY_PREFIX[eid.split("_", 1)[0]];
  if (k === undefined) throw new QueryError(`unknown entity id '${eid}'`);
  return k;
}

// ── Scope and Budget (dataclasses of the Core) ───────────────────────────────
export interface Scope {
  mode: string; focus: string | null; types: any[] | null; natures: any[] | null; time_window: number[] | null;
  as_of_recorded: number | null; viewport: number[] | null; z: number | null; min_confidence: number;
  sources: any[] | null; status: any[] | null; text: string | null;
}
const SCOPE_FIELDS = ["mode", "focus", "types", "natures", "time_window", "as_of_recorded", "viewport", "z",
  "min_confidence", "sources", "status", "text"];

export function scopeOf(d: any): Scope {
  const s: Scope = { mode: "world", focus: null, types: null, natures: null, time_window: null, as_of_recorded: null,
    viewport: null, z: null, min_confidence: 0.0, sources: null, status: null, text: null };
  if (d === null || d === undefined) return s;
  for (const k of Object.keys(d)) if (SCOPE_FIELDS.includes(k)) (s as any)[k] = d[k];
  if (s.mode !== "world" && s.mode !== "focus") throw new QueryError("scope.mode must be 'world' or 'focus'");
  if (s.mode === "focus" && !truthy(s.focus)) throw new QueryError("scope.focus is required in focus mode");
  return s;
}

export interface Budget { max_items: number; max_nodes: number; max_edges: number; max_bytes: number; lod: string }

export function budgetOf(d: any): Budget {
  const b: Budget = { max_items: 500, max_nodes: 200, max_edges: 400, max_bytes: 2_000_000, lod: "auto" };
  if (d) for (const k of Object.keys(d)) if (k in b) (b as any)[k] = d[k];
  for (const [k, [, hi]] of Object.entries(LIMITS)) {
    const v = (b as any)[k];
    if (!Number.isInteger(v) || v <= 0) throw new QueryError(`budget.${k} must be a positive integer`);
    (b as any)[k] = Math.min(v, hi);
  }
  if (!LODS.includes(b.lod)) throw new QueryError(`invalid lod '${b.lod}'`);
  return b;
}

const inList = (list: any[] | null, v: any) => (list as any[]).includes(v);
const between = (v: any, a: number, b: number) => v !== null && v !== undefined && a <= v && v <= b;

interface EnvOpts {
  lod?: string; total?: number | null; returned?: number | null; truncated?: boolean; cursor_next?: string | null;
  excluded?: Record<string, number> | null; facets?: any; highlight?: any; sources?: any[] | null; list_key?: string | null;
  as_of?: any; extra?: any;
}

function largestList(x: any): [any, any, number] {
  let best: [any, any, number, number] = [null, null, 0, -1];
  const walk = (node: any) => {
    const entries: [any, any][] = Array.isArray(node) ? node.map((v, i) => [i, v])
      : node && typeof node === "object" ? Object.entries(node) : [];
    for (const [k, v] of entries) {
      if (Array.isArray(v) && v.length) {
        const sz = pyJsonLen(v);
        if (sz > best[3]) best = [node, k, v.length, sz];
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(x);
  return [best[0], best[1], best[2]];
}

// ── the read model ───────────────────────────────────────────────────────────
export class ReadModel {
  private docsCache = new Map<string, number>();
  private search: { run: (sql: string, args: any[]) => any[][] } | null = null;
  private searchLoader: (() => Promise<{ run: (sql: string, args: any[]) => any[][] }>) | null = null;
  private eventsById: Map<string, any[]> | null = null;
  private ev: { cols: string[]; rows: any[][] } | null = null;

  d: SnapshotData;

  constructor(d: SnapshotData) { this.d = d; }

  setSearchEngine(loader: () => Promise<{ run: (sql: string, args: any[]) => any[][] }>) { this.searchLoader = loader; }

  get worldVersion(): number { return this.d.manifest.world_version; }

  // _envelope
  envelope(data: any, t0: number, budget: Budget, o: EnvOpts = {}): any {
    const env: any = { data, lod: o.lod ?? "details", total: o.total ?? null, returned: o.returned ?? null,
      truncated: !!o.truncated, cursor_next: o.cursor_next ?? null, excluded: truthy(o.excluded) ? o.excluded : {},
      facets: o.facets ?? null, highlight: o.highlight ?? null,
      sources: o.sources !== undefined && o.sources !== null ? o.sources : this.sourcesSummary(data),
      world_version: this.worldVersion, as_of: truthy(o.as_of) ? o.as_of : {}, timing_ms: 0 };
    if (o.extra) Object.assign(env, o.extra);
    let size = pyJsonLen(env);
    while (size > budget.max_bytes) {
      const [holder, key, n] = largestList(env.data);
      if (holder === null || n === 0) break;
      holder[key] = holder[key].slice(0, Math.floor(n / 2));
      env.truncated = true;
      if (o.list_key && data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data[o.list_key]))
        env.returned = data[o.list_key].length;
      size = pyJsonLen(env);
    }
    env.bytes = size;
    env.timing_ms = Math.trunc(performance.now() - t0);
    return env;
  }

  // _sources_summary
  sourcesSummary(data: any): any[] {
    const reg = this.d.manifest.sources;
    const ids = new Set<string>();
    const walk = (x: any) => {
      if (Array.isArray(x)) { for (const v of x) walk(v); return; }
      if (x && typeof x === "object") {
        const sid = x.source_id;
        if (typeof sid === "string" && sid in reg) ids.add(sid);
        for (const v of Object.values(x)) walk(v);
      }
    };
    walk(data);
    return [...ids].sort().map((s) => ({ source_id: s, attribution: reg[s].attribution, license_id: reg[s].license_id }));
  }

  // ── rows ─────────────────────────────────────────────────────────────────
  private async eventsTable() {
    if (!this.ev) {
      const ev = await this.d.events();
      if (!this.ev) {
        this.ev = ev;
        this.eventsById = new Map(ev.rows.map((r) => [r[0], r]));
      }
    }
    return this.ev!;
  }

  /** Row of an element as {column: value} (the columns the read model needs), or null. */
  private async row(kind: string, eid: string): Promise<any | null> {
    const r = await this.d.ref(eid);
    if (!r || r.ref.kind !== kind) return null;
    return r;
  }

  /** _require */
  async require(eid: string): Promise<[string, any]> {
    const kind = kindOf(eid);
    const r = await this.row(kind, eid);
    if (r === null) throw new QueryError(`entity ${eid} not found`);
    return [kind, r];
  }

  private objectRow(cols: string[], r: any[]): any {
    const o: any = {};
    cols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  }

  // _ref_min
  refMin(kind: string, row: any): any {
    const key = kind === "object" ? "object_id" : kind === "event" ? "event_id" : "insight_id";
    const r: any = { kind, id: row[key], type: row.type, label: row.label, confidence: row.confidence,
      source_id: kind !== "insight" ? row.source_id : null };
    if (row.lon !== null && row.lon !== undefined) r.point = [row.lon, row.lat];
    if (kind === "event" || kind === "insight") r.t = row.t_start_ms;
    return r;
  }

  // _scope_ok
  scopeOk(kind: string, row: any, sc: Scope): boolean {
    if (truthy(sc.types) && !inList(sc.types, row.type)) return false;
    if (truthy(sc.min_confidence) && (row.confidence || 0) < sc.min_confidence) return false;
    if (truthy(sc.sources) && kind !== "insight" && !inList(sc.sources, row.source_id)) return false;
    if (truthy(sc.time_window) && (kind === "event" || kind === "insight")) {
      const t = row.t_start_ms;
      if (t === null || t === undefined || !(sc.time_window![0] <= t && t <= sc.time_window![1])) return false;
    }
    if (sc.as_of_recorded !== null && sc.as_of_recorded !== undefined && kind !== "insight" &&
      (row.recorded_at_ms || 0) > sc.as_of_recorded) return false;
    if (truthy(sc.status) && !inList(sc.status, row.status)) return false;
    return true;
  }

  // ── time and aggregation helpers ─────────────────────────────────────────
  // _periods
  periods(sc: Scope): [number[], [number, number] | null] {
    if (!truthy(sc.time_window)) return [[0], null];
    const m0 = monthIndex(Math.trunc(sc.time_window![0])), m1 = monthIndex(Math.trunc(sc.time_window![1]));
    const out: number[] = [];
    let m = m0;
    while (m <= m1) {
      const [y, mm] = divmod(m, 12);
      if (mm === 0 && m + 11 <= m1) { out.push(y * 100); m += 12; } else { out.push(y * 100 + mm + 1); m += 1; }
    }
    return [out, [monthStartMs(m0), monthStartMs(m1 + 1) - 1]];
  }

  // _band_floor
  bandFloor(sc: Scope): [number, number] {
    const b = sc.min_confidence >= 0.8 ? 2 : sc.min_confidence >= 0.5 ? 1 : 0;
    return [b, BAND_FLOOR[b]];
  }

  // _agg_where as a row predicate over agg rows [period, cx, cy, kind, type, source, band, geo, n, maxconf]
  aggWhere(sc: Scope, cells: number[][] | null, kinds: string[] | null) {
    const [periods, eff] = this.periods(sc);
    const [band, bfloor] = this.bandFloor(sc);
    const pset = new Set(periods);
    const pred = (r: any[]) => {
      const [period, cx, cy, kind, type, source, rband] = r;
      if (!((kind === "object" && period === 0) || (kind !== "object" && kind !== null && pset.has(period)))) return false;
      if (truthy(sc.types) && !inList(sc.types, type)) return false;
      if (kinds && !kinds.includes(kind)) return false;
      if (truthy(sc.sources) && !inList(sc.sources, source)) return false;
      if (band && !(rband !== null && rband >= band)) return false;
      if (cells !== null) {
        let ok = false;
        for (const [x0, x1, y0, y1] of cells) if (between(cx, x0, x1) && between(cy, y0, y1)) { ok = true; break; }
        if (!ok) return false;
      }
      return true;
    };
    return { pred, eff, bfloor };
  }

  // _effective_viewport
  effectiveViewport(sc: Scope, level: number): [number[][], number[][]] {
    const cells = viewportCells(sc.viewport!, level);
    const bbs = cells.map(([x0, x1, y0, y1]) => {
      const a = cellBbox(level, x0, y0), b = cellBbox(level, x1, y1);
      return [a[0], a[2], b[1], b[3]];
    });
    return [cells, bbs];
  }

  private async noGeo(sc: Scope, kinds: string[]): Promise<number> {
    const { pred } = this.aggWhere(sc, null, kinds);
    let n = 0;
    for (const r of await this.d.agg(-1, truthy(sc.time_window))) if (pred(r) && r[7] === 0) n += r[8];
    return n;
  }

  // ── MAP ──────────────────────────────────────────────────────────────────
  // project_map
  async projectMap(scope: any, budget: any, highlight: string[] | null): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    if (!truthy(sc.viewport)) throw new QueryError("project_map requires scope.viewport");
    if (sc.z !== null && sc.z !== undefined && Math.trunc(sc.z) >= LOCAL_Z) return this.projectLocal(sc, bu, highlight, t0);
    let level = aggLevel(sc.z);
    const kinds = ["object", "event", "insight"];
    let cells: number[][], effBbs: number[][], rows: any[], total: number, eff: any, bfloor: number;
    for (;;) {
      [cells, effBbs] = this.effectiveViewport(sc, level);
      const w = this.aggWhere(sc, cells, kinds);
      eff = w.eff; bfloor = w.bfloor;
      rows = groupAgg((await this.d.agg(level, truthy(sc.time_window))).filter(w.pred), ["cx", "cy", "kind", "type"]);
      total = rows.reduce((s, r) => s + r.n, 0);
      const nCells = new Set(rows.map((r) => `${r.cx},${r.cy}`)).size;
      const wantAgg = bu.lod === "aggregates" || (bu.lod === "auto" && total > bu.max_items);
      if (!wantAgg || nCells <= bu.max_items || level <= Math.min(...AGG_LEVELS)) break;
      level -= 2;
    }
    const noGeo = await this.noGeo(sc, kinds);
    let lod = bu.lod;
    if (lod === "auto") lod = total > bu.max_items ? "aggregates" : "refs";
    const effective = { viewport: effBbs, level, time_window: eff, min_confidence: bfloor };
    const excluded = { no_geometry: noGeo };
    let hl: any = null;
    if (lod === "counts") {
      const byType: Record<string, number> = {};
      for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + r.n;
      return this.envelope({ counts_by_type: byType, effective_scope: effective }, t0, bu, { lod, total, returned: 0, excluded });
    }
    if (lod === "aggregates") {
      const cellmap = new Map<string, any>();
      for (const r of rows) {
        const k = `${r.cx},${r.cy}`;
        let c = cellmap.get(k);
        if (!c) { c = { z: level, x: r.cx, y: r.cy, n: 0, by_type: {}, maxconf: 0.0 }; cellmap.set(k, c); }
        c.n += r.n;
        c.by_type[r.type] = (c.by_type[r.type] ?? 0) + r.n;
        c.maxconf = Math.max(c.maxconf, r.mc || 0.0);
      }
      let out = [...cellmap.values()].sort((a, b) => cmp([a.x, a.y], [b.x, b.y]));
      for (const c of out) { c.bbox = cellBbox(level, c.x, c.y); c.dominant_type = dominant(c.by_type); }
      const cut = out.length > bu.max_items;
      if (cut) out = out.slice().sort((a, b) => cmp([-a.n, a.x, a.y], [-b.n, b.x, b.y])).slice(0, bu.max_items);
      if (highlight && highlight.length) {
        hl = [];
        for (const h of highlight) hl.push(await this.appearsMap(h, level, cellmap));
      }
      return this.envelope({ cells: out, effective_scope: effective }, t0, bu, { lod, total, returned: out.length,
        truncated: cut, excluded, highlight: hl, list_key: "cells", sources: [] });
    }
    const items = await this.mapRefs(sc, level, cells!, effBbs!, bu.max_items, rows);
    if (highlight && highlight.length) {
      const ids = new Set(items.map((i) => i.id));
      hl = highlight.map((h) => ({ ref: h, appears_as: ids.has(h) ? "single" : "outside_scope" }));
    }
    return this.envelope({ items, effective_scope: effective }, t0, bu, { lod, total, returned: items.length,
      truncated: items.length < total, excluded, highlight: hl, list_key: "items" });
  }

  // _appears_map
  private async appearsMap(eid: string, level: number, cellmap: Map<string, any>): Promise<any> {
    const kind = kindOf(eid);
    const row = await this.row(kind, eid);
    if (row === null || row.cx === null || row.cx === undefined) return { ref: eid, appears_as: "not_applicable" };
    const s = MAX_LEVEL - level;
    const x = row.cx >> s, y = row.cy >> s;
    if (cellmap.has(`${x},${y}`)) return { ref: eid, appears_as: "in_cell", cell: { z: level, x, y } };
    return { ref: eid, appears_as: "outside_scope" };
  }

  /** Object rows of the given types whose tile intersects the given level-`level` cell ranges or lon/lat boxes. */
  private async objectRows(types: string[] | null, tilesOf: (tl: number) => [number, number, number, number][]): Promise<any[]> {
    const t = this.d.manifest.tiles;
    const out: any[] = [];
    const byLevel = new Map<number, [number, number, number, number][]>();   // tile level of each type (builder)
    const loads: Promise<any[][]>[] = [];
    for (const [type, ti] of Object.entries(t.types)) {
      if (types !== null && !types.includes(type)) continue;
      const lvl: number = t.levels?.[String(ti)] ?? t.level;
      if (!byLevel.has(lvl)) byLevel.set(lvl, tilesOf(lvl));
      const ranges = byLevel.get(lvl)!;
      for (const [x, y] of t.cells[String(ti)] ?? []) {
        if (ranges.some(([x0, x1, y0, y1]) => x0 <= x && x <= x1 && y0 <= y && y <= y1)) loads.push(this.d.objectTile(ti, x, y));
      }
    }
    for (const rows of await Promise.all(loads)) for (const r of rows) out.push(this.objectRow(t.cols, r));
    return out;
  }

  private async kindRows(kind: string, objects: () => Promise<any[]>): Promise<any[]> {
    if (kind === "object") return objects();
    if (kind === "event") {
      const ev = await this.eventsTable();
      return ev.rows.map((r) => this.objectRow(ev.cols, r));
    }
    const w = await this.d.insightRows();
    return w.insights.map((r: any[]) => this.objectRow(w.insight_cols, r));
  }

  // _map_refs (rows: the agg groups of the same scope and cells — object types absent there have no candidate)
  private async mapRefs(sc: Scope, level: number, cells: number[][], effBbs: number[][], limit: number, aggRows: any[]) {
    const s = MAX_LEVEL - level;
    const periodsWindow = this.periods(sc)[1];
    const band = this.bandFloor(sc)[0];
    const objTypes = [...new Set(aggRows.filter((r) => r.kind === "object" && r.n > 0).map((r) => r.type as string))];
    // a kind with no aggregated element in the scope has no row to return: its table is not loaded (same output;
    // e.g. a map request for insight types only never downloads the events table)
    const kinds = new Set(aggRows.filter((r) => r.n > 0).map((r) => r.kind as string));
    const out = new Map<string, any>();
    for (const kind of ["object", "event", "insight"]) {
      if (!kinds.has(kind)) continue;
      const idKey = kind === "object" ? "object_id" : kind === "event" ? "event_id" : "insight_id";
      const rows = await this.kindRows(kind, () => this.objectRows(objTypes, (tl) => cells.map(([x0, x1, y0, y1]) =>
        tl >= level ? [x0 << (tl - level), ((x1 + 1) << (tl - level)) - 1, y0 << (tl - level), ((y1 + 1) << (tl - level)) - 1]
          : [x0 >> (level - tl), x1 >> (level - tl), y0 >> (level - tl), y1 >> (level - tl)])));
      for (const bb of effBbs) {
        for (const r of rows) {
          if (r.rid === null || r.rid === undefined || r.r_min_lon === null) continue;
          if (!(r.r_min_lon <= bb[2] && r.r_max_lon >= bb[0] && r.r_min_lat <= bb[3] && r.r_max_lat >= bb[1])) continue;
          if (r.cx === null || r.cx === undefined) continue;
          if (!cells.some(([x0, x1, y0, y1]) => x0 <= (r.cx >> s) && (r.cx >> s) <= x1 && y0 <= (r.cy >> s) && (r.cy >> s) <= y1)) continue;
          if (truthy(sc.types) && !inList(sc.types, r.type)) continue;
          if (kind === "insight" && r.status !== "active") continue;
          if (truthy(sc.sources) && !inList(sc.sources, kind !== "insight" ? r.source_id : "nexum.correlation")) continue;
          if ((r.band || 0) < band) continue;
          if (periodsWindow && kind !== "object") {
            if (r.t_start_ms === null || r.t_start_ms === undefined ||
              !(periodsWindow[0] <= r.t_start_ms && r.t_start_ms <= periodsWindow[1])) continue;
          }
          const o = this.refMin(kind, r);
          out.set(r[idKey], o);
        }
      }
    }
    return [...out.values()].sort((a, b) => cmp([-(a.confidence || 0), a.id], [-(b.confidence || 0), b.id])).slice(0, limit);
  }

  // _local_rows
  private async localRows(sc: Scope): Promise<Map<string, [string, any]>> {
    const [x0, y0, x1, y1] = sc.viewport!;
    const spans: [number, number][] = x0 <= x1 ? [[x0, x1]] : [[x0, 180.0], [-180.0, x1]];
    const window = sc.time_window;
    const band = this.bandFloor(sc)[0];
    const out = new Map<string, [string, any]>();
    for (const kind of ["object", "event", "insight"]) {
      const idKey = kind === "object" ? "object_id" : kind === "event" ? "event_id" : "insight_id";
      const types = truthy(sc.types) ? (sc.types as string[]) : null;
      const rows = await this.kindRows(kind, () => this.objectRows(types, (tl) => spans.map(([a, b]) => {
        const c0 = cell(a, Math.max(-90, y0), tl), c1 = cell(b, Math.min(90, y1), tl);
        return [c0[0], c1[0], c0[1], c1[1]] as [number, number, number, number];
      })));
      for (const [a, b] of spans) {
        for (const r of rows) {
          if (r.rid === null || r.rid === undefined || r.r_min_lon === null) continue;
          if (!(r.r_min_lon <= b && r.r_max_lon >= a && r.r_min_lat <= y1 && r.r_max_lat >= y0)) continue;
          if (r.lon === null || r.lon === undefined || !(a <= r.lon && r.lon <= b && y0 <= r.lat && r.lat <= y1)) continue;
          if (truthy(sc.types) && !inList(sc.types, r.type)) continue;
          if (kind === "insight" && r.status !== "active") continue;
          if (truthy(sc.sources) && !inList(sc.sources, kind !== "insight" ? r.source_id : "nexum.correlation")) continue;
          if ((r.band || 0) < band) continue;
          if (truthy(window) && kind !== "object" && (r.t_start_ms === null || r.t_start_ms === undefined ||
            !(window![0] <= r.t_start_ms && r.t_start_ms <= window![1]))) continue;
          out.set(r[idKey], [kind, r]);
        }
      }
    }
    return out;
  }

  // _project_local
  private async projectLocal(sc: Scope, bu: Budget, highlight: string[] | null, t0: number): Promise<any> {
    const rows = await this.localRows(sc);
    const total = rows.size;
    const noGeo = await this.noGeo({ ...sc, viewport: null }, ["object", "event", "insight"]);
    const effective = { viewport: [sc.viewport], level: null, time_window: sc.time_window,
      min_confidence: this.bandFloor(sc)[1], exact: true };
    let lod = bu.lod;
    if (lod === "auto") lod = total > bu.max_items ? "aggregates" : "refs";
    if (lod === "counts") {
      const byType: Record<string, number> = {};
      for (const [, r] of rows.values()) byType[r.type] = (byType[r.type] ?? 0) + 1;
      return this.envelope({ counts_by_type: byType, effective_scope: effective }, t0, bu, { lod, total, returned: 0,
        excluded: { no_geometry: noGeo } });
    }
    if (lod === "aggregates") {
      let level = Math.min(20, Math.trunc(sc.z!) + 2);
      let cellmap: Map<string, any>;
      for (;;) {
        cellmap = new Map();
        for (const [, r] of rows.values()) {
          const [x, y] = cell(r.lon, r.lat, level);
          const k = `${x},${y}`;
          let c = cellmap.get(k);
          if (!c) { c = { z: level, x, y, n: 0, by_type: {}, maxconf: 0.0 }; cellmap.set(k, c); }
          c.n += 1;
          c.by_type[r.type] = (c.by_type[r.type] ?? 0) + 1;
          c.maxconf = Math.max(c.maxconf, r.confidence || 0.0);
        }
        if (cellmap.size <= bu.max_items || level <= 2) break;
        level -= 2;
      }
      let out = [...cellmap.values()].sort((a, b) => cmp([a.x, a.y], [b.x, b.y]));
      for (const c of out) { c.bbox = cellBbox(level, c.x, c.y); c.dominant_type = dominant(c.by_type); }
      const cut = out.length > bu.max_items;
      if (cut) out = out.slice().sort((a, b) => cmp([-a.n, a.x, a.y], [-b.n, b.x, b.y])).slice(0, bu.max_items);
      return this.envelope({ cells: out, effective_scope: effective }, t0, bu, { lod, total, returned: out.length,
        truncated: cut, excluded: { no_geometry: noGeo }, list_key: "cells", sources: [] });
    }
    const items = [...rows.values()].map(([k, r]) => this.refMin(k, r))
      .sort((a, b) => cmp([-(a.confidence || 0), a.id], [-(b.confidence || 0), b.id]));
    let hl: any = null;
    if (highlight && highlight.length) {
      const ids = new Set(items.map((i) => i.id));
      hl = highlight.map((h) => ({ ref: h, appears_as: ids.has(h) ? "single" : "outside_scope" }));
    }
    const page = items.slice(0, bu.max_items);
    return this.envelope({ items: page, effective_scope: effective }, t0, bu, { lod, total, returned: page.length,
      truncated: page.length < total, excluded: { no_geometry: noGeo }, highlight: hl, list_key: "items" });
  }

  // ── TIMELINE ─────────────────────────────────────────────────────────────
  // project_timeline
  async projectTimeline(scope: any, bucket: string, budget: any, highlight: string[] | null): Promise<any> {
    const t0 = performance.now();
    let sc = scopeOf(scope);
    const bu = budgetOf(budget);
    if (!truthy(sc.time_window)) {
      const lo = (await this.d.world()).event_t_extent;
      if (lo[0] === null) return this.envelope({ buckets: [], items: [] }, t0, bu, { lod: "aggregates", total: 0, returned: 0 });
      sc = scopeOf({ ...sc, time_window: [lo[0], lo[1]] });
    }
    const tw = sc.time_window!;
    const span = tw[1] - tw[0];
    if (bucket === "auto") bucket = span > 3 * 365 * DAY ? "year" : span > 90 * DAY ? "month" : span > 3 * DAY ? "day" : "hour";
    let out: any[], effective: any;
    if (bucket === "year" || bucket === "month") {
      let level = -1;
      let cells: number[][] | null = null;
      if (truthy(sc.viewport)) { level = aggLevel(sc.z); cells = this.effectiveViewport(sc, level)[0]; }
      let [periods, eff] = this.periods(sc);
      const m0 = monthIndex(tw[0]), m1 = monthIndex(tw[1]);
      if (bucket === "month") {
        periods = [];
        for (let m = m0; m <= m1; m++) periods.push(Math.floor(m / 12) * 100 + divmod(m, 12)[1] + 1);
      } else {
        const y0 = Math.floor(m0 / 12), y1 = Math.floor(m1 / 12);
        periods = [];
        for (let y = y0; y <= y1; y++) {
          if (y * 12 >= m0 && y * 12 + 11 <= m1) periods.push(y * 100);
          else for (let mm = 0; mm < 12; mm++) if (m0 <= y * 12 + mm && y * 12 + mm <= m1) periods.push(y * 100 + mm + 1);
        }
      }
      const [band, bfloor] = this.bandFloor(sc);
      const pset = new Set(periods);
      const pred = (r: any[]) => {
        const [period, cx, cy, kind, type, source, rband] = r;
        if (!pset.has(period)) return false;
        if (kind !== "event" && kind !== "insight") return false;
        if (truthy(sc.types) && !inList(sc.types, type)) return false;
        if (truthy(sc.sources) && !inList(sc.sources, source)) return false;
        if (band && !(rband !== null && rband >= band)) return false;
        if (cells !== null && !cells.some(([x0, x1, yy0, yy1]) => between(cx, x0, x1) && between(cy, yy0, yy1))) return false;
        return true;
      };
      const rows = groupAgg((await this.d.agg(level, true, false)).filter(pred), ["period", "kind", "type"]);
      const buckets = new Map<number, any>();
      for (const r of rows) {
        const key = bucket === "year" ? Math.floor(r.period / 100) : r.period;
        let b = buckets.get(key);
        if (!b) { b = { bucket: key, n: 0, by_type: {} }; buckets.set(key, b); }
        b.n += r.n;
        b.by_type[r.type] = (b.by_type[r.type] ?? 0) + r.n;
      }
      out = [...buckets.keys()].sort((a, b) => a - b).map((k) => ({ ...buckets.get(k), start_ms: bucketStart(bucket, k) }));
      effective = { time_window: eff, bucket, min_confidence: bfloor };
    } else {
      const step = bucket === "day" ? DAY : HOUR;
      const outMap = new Map<number, any>();
      const band0 = this.bandFloor(sc)[0];
      const add = (t: number, type: string, src: string, band: number | null) => {
        if (truthy(sc.types) && !inList(sc.types, type)) return;
        if (truthy(sc.sources) && !inList(sc.sources, src)) return;
        if ((band || 0) < band0) return;
        const k = Math.floor(t / step) * step;
        let b = outMap.get(k);
        if (!b) { b = { bucket: k, n: 0, by_type: {}, start_ms: k }; outMap.set(k, b); }
        b.n += 1;
        b.by_type[type] = (b.by_type[type] ?? 0) + 1;
      };
      const ev = await this.eventsTable();
      const ci = colIndex(ev.cols);
      for (const r of ev.rows) {
        const t = r[ci.t_start_ms];
        if (between(t, tw[0], tw[1])) add(t, r[ci.type], r[ci.source_id], r[ci.band]);
      }
      const w = await this.d.insightRows();
      const ii = colIndex(w.insight_cols);
      for (const r of w.insights) {
        const t = r[ii.t_start_ms];
        if (between(t, tw[0], tw[1]) && r[ii.status] === "active") add(t, r[ii.type], "nexum.correlation", r[ii.band]);
      }
      out = [...outMap.keys()].sort((a, b) => a - b).map((k) => outMap.get(k));
      effective = { time_window: sc.time_window, bucket, min_confidence: this.bandFloor(sc)[1] };
    }
    const total = out.reduce((s, b) => s + b.n, 0);
    let items: any[] = [];
    if (total <= bu.max_items && ["auto", "refs", "details"].includes(bu.lod))
      items = await this.timelineItems(sc, effective.time_window, bu.max_items);
    let hl: any = null;
    if (highlight && highlight.length) {
      hl = [];
      for (const h of highlight) {
        const k = kindOf(h);
        const r = await this.row(k, h);
        const t = r !== null && (k === "event" || k === "insight") ? r.t : null;
        if (t === null || t === undefined) hl.push({ ref: h, appears_as: "not_applicable" });
        else hl.push({ ref: h, appears_as: "in_bucket", t_ms: t });
      }
    }
    return this.envelope({ buckets: out, items, effective_scope: effective }, t0, bu, {
      lod: items.length ? "refs" : "aggregates", total, returned: items.length, truncated: items.length < total,
      highlight: hl, list_key: "items" });
  }

  // _timeline_items
  private async timelineItems(sc: Scope, window: number[], limit: number): Promise<any[]> {
    const out: any[] = [];
    const band0 = this.bandFloor(sc)[0];
    const ev = await this.eventsTable();
    const w = await this.d.insightRows();
    for (const kind of ["event", "insight"]) {
      const rows = (kind === "event" ? ev.rows.map((r) => this.objectRow(ev.cols, r))
        : w.insights.map((r: any[]) => this.objectRow(w.insight_cols, r)).filter((r: any) => r.status === "active"))
        .filter((r: any) => between(r.t_start_ms, window[0], window[1]));
      const key = kind === "event" ? "event_id" : "insight_id";
      rows.sort((a: any, b: any) => cmp([a.t_start_ms, a[key]], [b.t_start_ms, b[key]]));
      for (const r of rows.slice(0, limit * 4)) {
        if (truthy(sc.types) && !inList(sc.types, r.type)) continue;
        if (truthy(sc.sources) && !inList(sc.sources, kind === "event" ? r.source_id : "nexum.correlation")) continue;
        if ((r.band || 0) < band0) continue;
        out.push(this.refMin(kind, r));
      }
    }
    out.sort((a, b) => cmp([a.t || 0, a.id], [b.t || 0, b.id]));
    return out.slice(0, limit);
  }

  // ── FACETS ───────────────────────────────────────────────────────────────
  // facets
  async facets(scope: any): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope);
    const w = await this.d.world();
    const rel: Record<string, number> = {};
    for (const [t, nat, n] of w.agg_rel) rel[`${t} (${nat === null ? "None" : nat})`] = n;
    if (truthy(sc.viewport) && sc.z !== null && sc.z !== undefined && Math.trunc(sc.z) >= LOCAL_Z) {
      const f: any = { kind: {}, type: {}, source: {}, band: {}, geometry: {} };
      const rows = await this.localRows(sc);
      for (const [kind, r] of rows.values()) {
        const src = kind !== "insight" ? r.source_id : "nexum.correlation";
        const lab = BAND_LABEL[r.band || 0];
        for (const [dim, val] of [["kind", kind], ["type", r.type], ["source", src], ["band", lab], ["geometry", "with_geometry"]])
          f[dim][val] = (f[dim][val] ?? 0) + 1;
      }
      const data = { facets: f, relations_by_type: rel, effective_scope: { viewport: [sc.viewport], exact: true,
        time_window: sc.time_window, min_confidence: this.bandFloor(sc)[1] } };
      return this.envelope(data, t0, budgetOf(null), { lod: "counts", total: rows.size, returned: 0, facets: f, sources: [] });
    }
    let level = -1;
    let cells: number[][] | null = null;
    if (truthy(sc.viewport)) { level = aggLevel(sc.z); cells = this.effectiveViewport(sc, level)[0]; }
    const { pred, eff, bfloor } = this.aggWhere(sc, cells, null);
    const f: any = { kind: {}, type: {}, source: {}, band: {}, geometry: {} };
    let total = 0;
    for (const g of groupAgg((await this.d.agg(level, truthy(sc.time_window))).filter(pred), ["kind", "type", "source", "band", "geo"], false)) {
      const n = g.n;
      total += n;
      f.kind[g.kind] = (f.kind[g.kind] ?? 0) + n;
      f.type[g.type] = (f.type[g.type] ?? 0) + n;
      f.source[g.source] = (f.source[g.source] ?? 0) + n;
      const lab = BAND_LABEL[g.band];
      f.band[lab] = (f.band[lab] ?? 0) + n;
      const gl = g.geo ? "with_geometry" : "without_geometry";
      f.geometry[gl] = (f.geometry[gl] ?? 0) + n;
    }
    const data = { facets: f, relations_by_type: rel, effective_scope: { level, time_window: eff, min_confidence: bfloor } };
    return this.envelope(data, t0, budgetOf(null), { lod: "counts", total, returned: 0, facets: f, sources: [] });
  }

  // ── INSIGHTS ─────────────────────────────────────────────────────────────
  // insights
  async insights(scope: any, budget: any, cursor: string | null, ruleId: string | null, member: string | null): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    const w = await this.d.insightRows();
    const rows = w.insights.map((r: any[]) => this.objectRow(w.insight_cols, r));
    let memberSet: Set<string> | null = null;
    if (truthy(member)) {
      const members = (await this.d.insightTexts()).insight_members;
      const direct = new Set<string>(members.filter(([, s]: string[]) => s === member).map(([i]: string[]) => i));
      const second = new Set<string>(members.filter(([, s]: string[]) => direct.has(s)).map(([i]: string[]) => i));
      memberSet = new Set([...direct, ...second]);
    }
    const where = (r: any) => {
      if (truthy(sc.status)) { if (!inList(sc.status, r.status)) return false; } else if (r.status !== "active") return false;
      if (truthy(ruleId) && r.rule_id !== ruleId) return false;
      if (truthy(sc.types) && !inList(sc.types, r.type)) return false;
      if (truthy(sc.min_confidence) && !(r.confidence !== null && r.confidence >= sc.min_confidence)) return false;
      if (truthy(sc.time_window) && !between(r.t_start_ms, sc.time_window![0], sc.time_window![1])) return false;
      if (memberSet && !memberSet.has(r.insight_id)) return false;
      if (truthy(sc.viewport)) {
        const [x0, y0, x1, y1] = sc.viewport!;
        if (!(r.min_lon !== null && r.min_lon <= x1 && r.max_lon >= x0 && r.min_lat <= y1 && r.max_lat >= y0)) return false;
      }
      return true;
    };
    const matching = rows.filter(where);
    const total = matching.length;
    let cand = matching;
    if (truthy(cursor)) {
      const [c, i] = cursor!.split("|");
      const cf = parseFloat(c);
      cand = cand.filter((r: any) => r.confidence !== null && (r.confidence < cf || (r.confidence === cf && r.insight_id > i)));
    }
    cand = cand.slice().sort((a: any, b: any) => {
      const ca = a.confidence, cb = b.confidence;
      if (ca !== cb) { if (ca === null) return 1; if (cb === null) return -1; return cb - ca; }
      return a.insight_id < b.insight_id ? -1 : a.insight_id > b.insight_id ? 1 : 0;
    }).slice(0, bu.max_items + 1);
    const page = cand.slice(0, bu.max_items);
    const texts = page.length && !("explanation" in (page[0] ?? {})) ? (await this.d.insightTexts()).texts : null;
    const txt = (r: any, i: 0 | 1) => (texts ? (texts[r.insight_id]?.[i] ?? null) : i === 0 ? r.explanation : r.confidence_text);
    const items = page.map((r: any) => ({ ref: { kind: "insight", id: r.insight_id, type: r.type, label: r.label },
      insight_kind: r.kind, rule_id: r.rule_id, confidence: r.confidence, confidence_text: txt(r, 1),
      explanation: txt(r, 0), t_start_ms: r.t_start_ms }));
    const last = page[page.length - 1];
    const nxt = cand.length > bu.max_items ? `${last.confidence === null ? "None" : pyFloatRepr(last.confidence)}|${last.insight_id}` : null;
    return this.envelope({ items }, t0, bu, { lod: "refs", total, returned: items.length, truncated: nxt !== null,
      cursor_next: nxt, list_key: "items" });
  }

  // ── related elements (rows precomputed per element by the builder) ───────
  private async bundleOf(eid: string): Promise<[string, any]> {
    const kind = kindOf(eid);
    const b = await this.d.bundle(eid);
    if (b === undefined) throw new QueryError(`entity ${eid} not found`);
    return [kind, b];
  }

  // related_events
  async relatedEvents(eid: string, scope: any, budget: any, cursor: string | null): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    const [, b] = await this.bundleOf(eid);
    const reason = new Map<string, string>();
    const rows: any[] = [];
    const rel: any[] = b.rel_ev;
    if (rel.length) await this.eventsTable();
    const ev = this.ev;
    for (const [id, why, missing] of rel) {
      reason.set(id, why);
      if (missing === null) continue;
      const raw = this.eventsById!.get(id);
      if (!raw) continue;
      const r = this.objectRow(ev!.cols, raw);
      if (!this.scopeOk("event", r, sc)) continue;
      rows.push(r);
    }
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;
    const start = cursor === null || cursor === undefined ? 0 : parseInt(cursor, 10);
    const page = rows.slice().sort((a, x) => cmp([-(a.t_start_ms || 0), a.event_id], [-(x.t_start_ms || 0), x.event_id]))
      .slice(start, start + bu.max_items);
    const items = page.map((r) => ({ ...this.refMin("event", r), reason: reason.get(r.event_id) }));
    const nxt = start + page.length < rows.length ? String(start + page.length) : null;
    return this.envelope({ items, counts_by_type: byType }, t0, bu, { lod: "refs", total: rows.length,
      returned: items.length, truncated: nxt !== null, cursor_next: nxt, list_key: "items" });
  }

  // related_objects
  async relatedObjects(eid: string, scope: any, budget: any, cursor: string | null): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    const [, b] = await this.bundleOf(eid);
    const cols = [...this.d.manifest.tiles.cols.slice(0, 12), "reason"];
    const rows = (b.rel_obj as any[][]).map((r) => this.objectRow(cols, r)).filter((r) => this.scopeOk("object", r, sc));
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;
    const start = cursor === null || cursor === undefined ? 0 : parseInt(cursor, 10);
    const page = rows.slice(start, start + bu.max_items);
    const items = page.map((r) => ({ ...this.refMin("object", r), reason: r.reason }));
    const nxt = start + page.length < rows.length ? String(start + page.length) : null;
    return this.envelope({ items, counts_by_type: byType }, t0, bu, { lod: "refs", total: rows.length,
      returned: items.length, truncated: nxt !== null, cursor_next: nxt, list_key: "items" });
  }

  // get_entity (lod=refs from the references; details = the focus section of the element's context)
  async getEntity(eid: string, lod: string): Promise<any> {
    const t0 = performance.now();
    const [, r] = await this.require(eid);
    let data: any = r.ref;
    if (lod !== "refs") {
      const b = await this.d.bundle(eid);
      data = b.context[1].data.focus;
    }
    return this.envelope(data, t0, budgetOf(null), { lod, total: 1, returned: 1 });
  }

  // ── GRAPH ────────────────────────────────────────────────────────────────
  // _edges_of
  private async edgesOf(eid: string, limitPerGroup: number, sc: Scope): Promise<[[string, any[]][], any[]]> {
    const node = await this.d.node(eid);
    const edges: [string, any[]][] = [], aggregates: any[] = [];
    if (!node) return [edges, aggregates];
    const natures = (await this.d.world()).relation_natures;
    for (const [ek, et, dr, n] of node.groups) {
      if (truthy(sc.natures) && ek === "relation" && et in natures && !inList(sc.natures, natures[et])) continue;
      const rows: any[][] = (node.rows[`${ek}|${et}|${dr}`] ?? []).slice(0, limitPerGroup);
      for (const r of rows) edges.push([dr, r]);
      if (n > rows.length) aggregates.push({ edge_kind: ek, type: et, direction: dr, count: n, shown: rows.length,
        remaining: n - rows.length });
    }
    return [edges, aggregates];
  }

  // neighborhood
  async neighborhood(focus: string, depth: number, scope: any, budget: any): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    depth = Math.max(1, Math.min(Math.trunc(depth), 3));
    const [, frow] = await this.require(focus);
    const nodes = new Map<string, any>([[focus, { ...frow.ref, depth: 0 }]]);
    const edges: any[] = [], aggNodes: any[] = [];
    const seen = new Set<string>();
    let frontier = [focus];
    let truncated = false;
    const perGroup = Math.max(3, Math.floor(bu.max_nodes / 20));
    for (let d = 1; d <= depth; d++) {
      const nxt: string[] = [];
      await Promise.all(frontier.map((nid) => this.d.node(nid)));   // prefetch the frontier's shards
      for (const nid of frontier) {
        const [es, aggs] = await this.edgesOf(nid, perGroup, sc);
        for (const a of aggs) {
          aggNodes.push({ ...a, id: `agg:${nid}:${a.edge_kind}:${a.type}:${a.direction}`, anchor: nid, kind: "aggregate" });
          truncated = true;
        }
        for (const [dr, r] of es) {
          const [src, dst, ekind, etype, nature, refId, conf, otherRef] = r;
          const other = dr === "out" ? dst : src;
          kindOf(other);
          const ek = `${src}\u0000${dst}\u0000${ekind}\u0000${etype}\u0000${refId}`;
          if (!nodes.has(other)) {
            if (nodes.size >= bu.max_nodes) { truncated = true; continue; }
            if (otherRef === null) continue;
            if (truthy(sc.types) && !inList(sc.types, otherRef.type) && other !== focus) continue;
            nodes.set(other, { ...otherRef, depth: d });
            nxt.push(other);
          }
          if (!seen.has(ek) && edges.length < bu.max_edges) {
            seen.add(ek);
            edges.push({ src, dst, edge_kind: ekind, type: etype, nature, ref_id: refId, confidence: conf });
          } else if (!seen.has(ek)) truncated = true;
        }
      }
      frontier = nxt;
    }
    const data = { focus, nodes: [...nodes.values()], edges, aggregates: aggNodes };
    return this.envelope(data, t0, bu, { lod: "refs", total: null, returned: nodes.size, truncated, list_key: "edges" });
  }

  // expand
  async expand(node: string, edgeKind: string, etype: string, direction: string, budget: any, cursor: string | null): Promise<any> {
    const t0 = performance.now();
    const bu = budgetOf(budget);
    const n = await this.d.node(node);
    let rows: any[][] = n ? (n.rows[`${edgeKind}|${etype}|${direction}`] ?? []) : [];
    const oi = direction === "out" ? 1 : 0;
    if (truthy(cursor)) rows = rows.filter((r) => r[oi] > cursor!);
    rows = rows.slice(0, bu.max_nodes + 1);
    const page = rows.slice(0, bu.max_nodes);
    const g = (n ? n.groups : []).find((x: any[]) => x[0] === edgeKind && x[1] === etype && x[2] === direction);
    const total = g ? g[3] : 0;
    const items = page.map((r) => {
      kindOf(r[oi]);
      return { node: r[7], edge: { src: r[0], dst: r[1], edge_kind: r[2], type: r[3], ref_id: r[5], confidence: r[6] } };
    });
    const nxt = rows.length > bu.max_nodes ? page[page.length - 1][oi] : null;
    return this.envelope({ items }, t0, bu, { lod: "refs", total, returned: items.length, truncated: nxt !== null,
      cursor_next: nxt, list_key: "items" });
  }

  // path (bidirectional BFS over the ordered neighbour lists of Query._neighbors)
  async path(a: string, b: string, maxHops: number, visitCap = 200000): Promise<any> {
    const t0 = performance.now();
    maxHops = Math.max(1, Math.min(Math.trunc(maxHops), 4));
    await this.require(a);
    await this.require(b);
    const ref = async (i: string) => (await this.d.ref(i))?.ref ?? null;
    if (a === b) return this.envelope({ path: [await ref(a)], hops: 0 }, t0, budgetOf(null), { lod: "refs" });
    const adj = await this.d.adjacency();
    const index = adjIndex(adj);
    const neighbors = (id: string): string[] => {
      const i = index.get(id);
      return i === undefined ? [] : adj.nb[i].map((j) => adj.ids[j]);
    };
    const pa = new Map<string, string | null>([[a, null]]), pb = new Map<string, string | null>([[b, null]]);
    let fa = [a], fb = [b];
    let meet: string | null = null;
    let hops = 0;
    while (fa.length && fb.length && hops < maxHops && meet === null) {
      const [f, p, q] = fa.length <= fb.length ? [fa, pa, pb] : [fb, pb, pa];
      const nxt: string[] = [];
      for (const n of f) {
        for (const m of neighbors(n)) {
          if (!p.has(m)) {
            p.set(m, n);
            nxt.push(m);
            if (q.has(m)) { meet = m; break; }
          }
        }
        if (meet) break;
      }
      if (f === fa) fa = nxt; else fb = nxt;
      hops += 1;
      if (pa.size + pb.size > visitCap) break;
    }
    if (meet === null) return this.envelope({ path: null, hops: null, explored: pa.size + pb.size }, t0, budgetOf(null), { lod: "refs" });
    const left: string[] = [];
    let n: string | null = meet;
    while (n !== null) { left.push(n); n = pa.get(n) ?? null; }
    const right: string[] = [];
    n = pb.get(meet) ?? null;
    while (n !== null) { right.push(n); n = pb.get(n) ?? null; }
    const ids = [...left.reverse(), ...right];
    const refs = [];
    for (const i of ids) { kindOf(i); refs.push(await ref(i)); }
    return this.envelope({ path: refs, hops: ids.length - 1 }, t0, budgetOf(null), { lod: "refs" });
  }

  // ── SEARCH (the Core's FTS5 index in sqlite-wasm) ────────────────────────
  private async engine() {
    if (!this.search) {
      if (!this.searchLoader) throw new Error("search engine not configured");
      this.search = await this.searchLoader();
    }
    return this.search;
  }

  // _term_docs (+ _term_docs_uncached)
  private termDocs(prefix: string, cap = RANK_LIMIT + 1): number {
    const hit = this.docsCache.get(prefix);
    if (hit !== undefined) return hit;
    let n = 0, terms = 0;
    for (const [d] of this.search!.run("SELECT doc FROM search_vocab WHERE term >= ? AND term < ? LIMIT 5000",
      [prefix, prefix + "\u{10FFFF}"])) {
      n += d as number;
      terms += 1;
      if (n >= cap) break;
    }
    const v = terms >= 5000 ? cap : n;
    this.docsCache.set(prefix, v);
    return v;
  }

  // search — the Core's statement joins rid_map (rid → element) and orders by (score, entity_id). The snapshot keeps
  // rid_map outside the index (sdoc shards): the same join and order are applied here, lazily, to the rows used.
  async searchText(q: string, scope: any, budget: any): Promise<any> {
    const t0 = performance.now();
    const sc = scopeOf(scope), bu = budgetOf(budget);
    const toks = (q || "").match(/[0-9A-Za-zÀ-ÿ]+/g)?.slice(0, 8) ?? [];
    if (!toks.length) return this.envelope({ groups: [] }, t0, bu, { lod: "refs", total: 0, returned: 0 });
    const eng = await this.engine();
    const docs = new Map<string, number>();
    for (const t of toks) docs.set(t, this.termDocs(t.toLowerCase()));
    const estimate = Math.min(...docs.values());
    let common = toks.filter((t) => docs.get(t)! > RANK_LIMIT);
    const rare = toks.filter((t) => docs.get(t)! <= RANK_LIMIT);
    const ranked = rare.length > 0;
    type Hit = { kind: string; id: string; score: number; doc: any[] };
    let hitsIter: AsyncGenerator<Hit>;
    if (ranked) {
      const match = rare.map((t) => `"${t}"*`).join(" ");
      // the Core's statement, with idrank() (rank of entity_id) standing for rid_map's entity_id in join and order
      const rows = eng.run("SELECT f.rowid, bm25(search_fts, 10, 4, 6, 1) AS score FROM search_fts f " +
        "WHERE search_fts MATCH ? AND idrank(f.rowid) IS NOT NULL ORDER BY score, idrank(f.rowid) LIMIT ?", [match, bu.max_items * 4]) as [number, number][];
      // O9: frequent words need every candidate (they are all read below): one parallel round trip, not four
      hitsIter = this.joinedHits(rows, common.length ? rows.length : 64);
    } else {
      const match = toks.map((t) => `"${t}"*`).join(" ");
      const rows = eng.run("SELECT f.rowid, 0.0 FROM search_fts f WHERE search_fts MATCH ? AND idrank(f.rowid) IS NOT NULL " +
        "LIMIT ?", [match, bu.max_items]) as [number, number][];
      hitsIter = this.joinedHits(rows);
      common = [];
    }
    let source: AsyncIterable<Hit> = hitsIter;
    if (common.length) {
      // frequent tokens filter the candidates on label, aliases and identifiers (all candidates are needed)
      const hits: Hit[] = [];
      for await (const h of hitsIter) hits.push(h);
      const words = /[0-9a-zà-ÿ]+/g;
      const low = common.map((c) => c.toLowerCase());
      // O9 (2026-10-04): a hit whose own label already holds every frequent word is kept without reading its
      // aliases and identifiers (same result: more words can only keep it) — only the others need their refs shard
      const byLabel = hits.map((h) => !!h.doc[5] && h.kind !== "relation" &&
        low.every((c) => ((h.doc[3] || "").toLowerCase().match(words) ?? []).some((w: string) => w.startsWith(c))));
      const refs = await Promise.all(hits.map((h, i) => (byLabel[i] ? null : this.d.ref(h.id))));
      const kept = hits.filter((h, i) => {
        if (byLabel[i]) return true;
        const r = refs[i];
        const parts: string[] = [];
        if (h.doc[5] && h.kind !== "relation") parts.push(h.doc[3] || "");
        for (const a of r?.aliases ?? []) parts.push(a);
        for (const [sch, v] of r?.ids ?? []) parts.push(`${sch} ${v}`);
        const ws = parts.join(" ").toLowerCase().match(words) ?? [];
        return low.every((c) => ws.some((w) => w.startsWith(c)));
      });
      source = (async function* () { yield* kept; })();
    }
    const groups = new Map<string, any>();
    let n = 0;
    for await (const h of source) {
      if (!h.doc[5]) continue;                                    // no row for the element: skipped by the Core
      const t = h.doc[2], label = h.doc[3];
      if (truthy(sc.types) && !inList(sc.types, t)) continue;
      if (h.kind === "insight" && h.doc[4] !== "active") continue;
      if (n >= bu.max_items) break;
      let g = groups.get(t);
      if (!g) { g = { type: t, items: [] }; groups.set(t, g); }
      g.items.push({ kind: h.kind, id: h.id, type: t, label, score: pyRound(-h.score, 4) });
      n += 1;
    }
    // O9: after the first search, the search documents are read in the background (a few files at a time), so the
    // following searches find them locally instead of waiting for the network
    this.d.prefetchSdoc();
    return this.envelope({ groups: [...groups.keys()].sort().map((t) => groups.get(t)), ranked, estimated_matches: estimate },
      t0, bu, { lod: "refs", total: n, returned: n, truncated: !ranked && estimate > n });
  }

  /** The joined rows in their SQL order, each with its rid_map entry (fetched in batches as they are consumed). */
  private async *joinedHits(rows: [number, number][], batch = 64): AsyncGenerator<{ kind: string; id: string; score: number; doc: any[] }> {
    for (let i = 0; i < rows.length; i += batch) {
      const docs = await Promise.all(rows.slice(i, i + batch).map(([rid]) => this.d.sdoc(rid)));
      for (let k = 0; k < docs.length; k++) {
        const doc = docs[k];
        if (doc === null) throw new Error(`rid ${rows[i + k][0]} with a rank but not in rid_map`);
        yield { kind: doc[0], id: doc[1], score: rows[i + k][1], doc };
      }
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function colIndex(cols: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  cols.forEach((c, i) => { o[c] = i; });
  return o;
}

const adjCache = new WeakMap<object, Map<string, number>>();
function adjIndex(adj: { ids: string[] }): Map<string, number> {
  let m = adjCache.get(adj);
  if (!m) { m = new Map(adj.ids.map((id, i) => [id, i])); adjCache.set(adj, m); }
  return m;
}

const AGG_COLS = ["period", "cx", "cy", "kind", "type", "source", "band", "geo", "n", "maxconf"];

/** SELECT <keys>, SUM(n) AS n, MAX(maxconf) AS mc FROM agg WHERE … GROUP BY <keys> [ORDER BY <keys>] */
function groupAgg(rows: any[][], keys: string[], ordered = true): any[] {
  const idx = keys.map((k) => AGG_COLS.indexOf(k));
  const groups = new Map<string, any>();
  for (const r of rows) {
    const vals = idx.map((i) => r[i]);
    const k = JSON.stringify(vals);
    let g = groups.get(k);
    if (!g) {
      g = { n: 0, mc: null, _k: vals };
      keys.forEach((kk, j) => { g[kk] = vals[j]; });
      groups.set(k, g);
    }
    g.n += r[8];
    if (r[9] !== null && (g.mc === null || r[9] > g.mc)) g.mc = r[9];
  }
  const out = [...groups.values()];
  if (ordered) out.sort((a, b) => cmp(a._k, b._k));
  return out;
}

function dominant(byType: Record<string, number>): string {
  let best: string | null = null;
  for (const t of Object.keys(byType).sort()) if (best === null || byType[t] > byType[best]) best = t;
  return best!;
}

function bucketStart(bucket: string, key: number): number {
  if (bucket === "year") return monthStartMs(key * 12);
  const [y, m] = divmod(key, 100);
  return monthStartMs(y * 12 + m - 1);
}

export { NotFound };
