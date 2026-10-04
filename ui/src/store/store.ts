// The single workspace store (W13/W14). Every entity lives once in `entities`, keyed by its stable ID;
// views keep IDs only. Selection and focus are one coordinated value (decision D9): changing view never
// loses it. Pure TypeScript (no React) so that its invariants are unit-tested.

import type { Kind, Ref, Scope, TypeInfo, WorldStatus } from "../lib/types.ts";
import { DEFAULT_PERIOD, periodOfWindow, samePeriod, windowOf, type Period } from "../lib/period.ts";

export interface Entity extends Ref {
  confidence?: number | null;
  source_id?: string | null;
  point?: [number, number];
  t?: number | null;
  details?: any;
}

export interface TrailStep { ref: string; kind: Kind; label: string; scope: Scope; added_ms: number; note?: string }
export interface Trail { id: string; name: string; steps: TrailStep[]; index: number; savedAt: number | null; dirty: boolean }

export type Stage = "map" | "graph" | "split";
export type Panel = "object" | "why" | "world";
export type MobileTab = "map" | "graph" | "time" | "search" | "focus";
/** Touch layouts (< 1120 px): at most one overlay at a time, above a scrim (tap outside, Back or Esc close it). */
export type Overlay = "filters" | "menu" | "trail" | "search" | "info" | "period";
/** The focus card on touch layouts: a name line (mini), the first connections (peek), everything (full). */
export type Sheet = "mini" | "peek" | "full";

export interface State {
  status: WorldStatus | null;
  types: Map<string, TypeInfo>;
  focus: string | null;
  secondary: string | null;
  origin: string | null;
  scope: Scope;
  stage: Stage;
  panel: Panel;
  whyId: string | null;
  trail: Trail;
  mobileTab: MobileTab;
  railOpen: boolean;
  inspectorOpen: boolean;
  worldVersion: number;
  rev: number;
  mapInfo: { lod: string; level: number | null; returned: number; total: number; truncated: boolean;
    noGeometry: number; ms: number } | null;
  viewport: [number, number, number, number] | null;
  context: { id: string; data: any } | null;
  path: { a: string; b: string; ids: string[] | null } | null;
  overlay: Overlay | null;
  sheet: Sheet;
  /** Touch map default (display only, never sent as the scope of other views): minimum confidence of the
   * elements and events drawn on the MAP. Insights are not subject to it (different scale and meaning). */
  mapFloor: number;
  /** Graph drawn without the filters for this focus (explicit "Mostra" on hidden connections). */
  graphUnfiltered: string | null;
  /** The observed period (a user choice; starts at DEFAULT_PERIOD). Scope.time_window is derived from it. */
  period: Period;
  /** Time reference of the published world: month of its most recent data, its first month, that instant. */
  clock: { anchor: number; first: number; latestMs: number } | null;
  /** Incremented by "Esplora": the views return to the starting world view. */
  homeTick: number;
  /** Starting display settings (never counted as user filters). */
  defaults: { mapFloor: number; mapTypes: string[] | null };
  /** The categories the MAP draws (display only, never the scope of other views; null = every category). The world
   *  opens with the cities only (2026-10-03): the rest is one tap away (Tutto · Nessuno · one by one · Ripristina). */
  mapTypes: string[] | null;
  /** The security zones drawn on the map on request (World Intelligence; display only). */
  mapZones: boolean;
  /** The section open in the view of an explorable element ("overview" on every new selection). */
  section: string;
  /** A request to frame an area on the map ([west, south, east, north]; `t` makes a repeated request new). */
  mapFit: { bbox: [number, number, number, number]; t: number } | null;
  /** The explorable element whose links are drawn on the map on request (otherwise its containment links are not). */
  mapLinks: string | null;
  /** Where the person came from inside an explorable element's view (e.g. Italy · Opinione), kept while they go deeper
   *  from it, so the way back is one tap; cleared when they navigate from elsewhere. */
  placeCtx: { id: string; section: string } | null;
}

/** Changes the person made with respect to the starting state (the badge "Filtri · N" counts `filters`). */
export function userChanges(s: State): { period: boolean; filters: number } {
  const sc = s.scope;
  const filters = [Array.isArray(sc.types), !!sc.min_confidence, Array.isArray(sc.sources), s.mapFloor !== s.defaults.mapFloor,
    s.defaults.mapTypes !== undefined && JSON.stringify(s.mapTypes) !== JSON.stringify(s.defaults.mapTypes)].filter(Boolean).length;
  return { period: !!s.clock && !samePeriod(s.period, DEFAULT_PERIOD), filters };
}

/** The categories the map opens with: the cities (the borders and the cartography are always drawn). */
export const DEFAULT_MAP_TYPES = ["place.settlement"];

/** The scope the MAP asks with: the person's scope, narrowed to the categories the map draws. */
export function mapScope(s: Pick<State, "scope" | "mapTypes">): Scope {
  if (!Array.isArray(s.mapTypes)) return s.scope;
  const types = Array.isArray(s.scope.types) ? s.scope.types.filter((t) => s.mapTypes!.includes(t)) : [...s.mapTypes];
  return { ...s.scope, types };
}

export const MAX_REFS = 20000;
const ENTITY_FIELDS = new Set(["kind", "id", "type", "label", "confidence", "source_id", "point", "t"]);
const KINDS = new Set(["object", "event", "relation", "insight"]);

const newTrailId = () => `t-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function createStore() {
  let state: State = {
    status: null, types: new Map(), focus: null, secondary: null, origin: null, scope: {},
    stage: "map", panel: "world", whyId: null,
    trail: { id: newTrailId(), name: "Indagine", steps: [], index: -1, savedAt: null, dirty: false },
    section: "overview", mapFit: null, mapLinks: null, placeCtx: null, mobileTab: "map", railOpen: false, inspectorOpen: false, worldVersion: 0, rev: 0, mapInfo: null, viewport: null, context: null, path: null,
    overlay: null, sheet: "peek", mapFloor: 0, graphUnfiltered: null,
    period: DEFAULT_PERIOD, clock: null, defaults: { mapFloor: 0, mapTypes: DEFAULT_MAP_TYPES }, homeTick: 0,
    mapTypes: DEFAULT_MAP_TYPES, mapZones: false,
  };
  const entities = new Map<string, Entity>();
  const subscribers = new Set<() => void>();
  let pending = false;

  const emit = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; subscribers.forEach((l) => l()); });
  };
  const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

  function isRefLike(x: any): boolean {
    return x && typeof x === "object" && !Array.isArray(x) && KINDS.has(x.kind) && typeof x.id === "string" &&
      typeof x.type === "string" && typeof x.label === "string";
  }

  function upsert(x: any, details = false): string {
    const prev = entities.get(x.id);
    const e: Entity = prev ? { ...prev } : { kind: x.kind, id: x.id, type: x.type, label: x.label };
    for (const k of ENTITY_FIELDS) if (x[k] !== undefined && x[k] !== null) (e as any)[k] = x[k];
    if (details) e.details = x;
    if (prev) entities.delete(x.id);   // LRU order: most recent last
    entities.set(x.id, e);
    return x.id;
  }

  function evict() {
    if (entities.size <= MAX_REFS) return;
    const keep = protectedIds();
    for (const id of entities.keys()) {
      if (entities.size <= MAX_REFS) break;
      if (!keep.has(id)) entities.delete(id);
    }
  }

  function protectedIds(): Set<string> {
    const s = new Set<string>();
    if (state.focus) s.add(state.focus);
    if (state.secondary) s.add(state.secondary);
    if (state.whyId) s.add(state.whyId);
    for (const st of state.trail.steps) s.add(st.ref);
    return s;
  }

  /** Move every entity reference of a response into the store; return the tree with refs replaced by
   * {$ref: id, ...contextual annotations}. Rich DTOs (with confidence factors) become the entity's details. */
  function normalize<T = any>(tree: T): T {
    const walk = (x: any): any => {
      if (Array.isArray(x)) return x.map(walk);
      if (!x || typeof x !== "object") return x;
      if (isRefLike(x)) {
        if ("confidence_factors" in x) {
          // rich DTO: its nested references are normalized first, then it becomes the entity's details
          const det: any = {};
          for (const k of Object.keys(x)) det[k] = ENTITY_FIELDS.has(k) ? x[k] : walk(x[k]);
          const id = upsert(det, true);
          return { $ref: id, $details: true };
        }
        const id = upsert(x);
        const out: any = { $ref: id };
        for (const k of Object.keys(x)) if (!ENTITY_FIELDS.has(k)) out[k] = walk(x[k]);
        return out;
      }
      const out: any = {};
      for (const k of Object.keys(x)) out[k] = walk(x[k]);
      return out;
    };
    const r = walk(tree);
    evict();
    state = { ...state, rev: state.rev + 1 };
    emit();
    return r;
  }

  function pushTrail(id: string) {
    const e = entities.get(id);
    const t = state.trail;
    if (t.index >= 0 && t.steps[t.index]?.ref === id) return t;
    const steps = t.steps.slice(0, t.index + 1);
    steps.push({ ref: id, kind: (e?.kind ?? id.slice(0, 3)) as Kind, label: e?.label ?? id, scope: state.scope,
      added_ms: Date.now() });
    return { ...t, steps, index: steps.length - 1, dirty: true };
  }

  return {
    get: () => state,
    entity: (id: string | null | undefined) => (id ? entities.get(id) : undefined),
    entityCount: () => entities.size,
    entityIds: () => [...entities.keys()],
    subscribe: (l: () => void) => { subscribers.add(l); return () => subscribers.delete(l); },
    set,
    normalize,
    upsert: (x: any) => { upsert(x); evict(); set({ rev: state.rev + 1 }); },
    /** Click anywhere = SELECT + FOCUS (D9). */
    select(id: string | null, origin: string, section = "overview") {
      if (typeof performance !== "undefined") performance.mark(`nexum:select:${id}`);
      if (!id) return set({ focus: null, secondary: null, origin, panel: "world", whyId: null });
      // from inside an explorable element's view ("place"): remember it and its section; deeper steps keep it
      const cur = state.focus ? entities.get(state.focus) : undefined;
      const fromPlace = cur && state.types.get(cur.type)?.explore ? { id: cur.id, section: state.section } : state.placeCtx;
      const placeCtx = origin === "place" && id !== fromPlace?.id ? fromPlace : null;
      set({ focus: id, secondary: null, origin, panel: "object", whyId: null, trail: pushTrail(id),
        inspectorOpen: true, overlay: null, sheet: section === "overview" ? "peek" : "full", section, placeCtx });
    },
    setSecondary(id: string | null) { set({ secondary: id }); },
    why(id: string) { set({ panel: "why", whyId: id, inspectorOpen: true, overlay: null, sheet: "full" }); },
    back() { this.go(state.trail.index - 1); },
    forward() { this.go(state.trail.index + 1); },
    go(i: number) {
      const t = state.trail;
      if (i < 0 || i >= t.steps.length) return;
      // FOCUS ≠ FILTER: walking the path changes the focus only; the conditions a step was observed with stay in
      // the step (format unchanged) and are applied only by an explicit "Applica" (applyStep)
      set({ focus: t.steps[i].ref, origin: "trail", panel: "object", whyId: null, trail: { ...t, index: i },
        overlay: null, sheet: "peek" });
    },
    /** "Applica": the filters and period recorded with a step become the current ones (explicit choice). */
    applyStep(i: number) {
      const st = state.trail.steps[i];
      if (!st) return;
      const c = state.clock;
      const scope = { ...(st.scope ?? {}) };
      set({ scope, period: c ? periodOfWindow(scope.time_window, c.anchor, c.first) : state.period });
    },
    /** The observed period: a user choice; the Scope's time window follows it (whole months). */
    setPeriod(p: Period) {
      const c = state.clock;
      const w = c ? windowOf(p, c.anchor, c.first) : null;
      const scope: Scope = { ...state.scope, time_window: w };
      if (!w) delete scope.time_window;
      set({ period: p, scope });
    },
    /** ESPLORA: the focus closes and the views return to the world as at the start; filters stay as they are. */
    home() {
      set({ focus: null, secondary: null, origin: "home", panel: "world", whyId: null, overlay: null, sheet: "peek",
        inspectorOpen: false, homeTick: state.homeTick + 1 });
    },
    /** RIPRISTINA: period, types, sources, confidence and display settings back to the start. The focus stays. */
    resetFilters() {
      const c = state.clock;
      const w = c ? windowOf(DEFAULT_PERIOD, c.anchor, c.first) : null;
      set({ period: DEFAULT_PERIOD, scope: w ? { time_window: w } : {}, mapFloor: state.defaults.mapFloor, graphUnfiltered: null,
        mapTypes: state.defaults.mapTypes });
    },
    /** The categories drawn on the map (display only): null every one, [] none, a list some. */
    setMapTypes(types: string[] | null) {
      set({ mapTypes: types });
    },
    /** One category alone on the map (e.g. "Mostra sulla mappa" from a place or a domain): a display choice. */
    showOnly(type: string) {
      const scope = { ...state.scope };
      delete scope.types;
      set({ mapTypes: [type], scope });
    },
    setScope(patch: Partial<Scope>) {
      const scope = { ...state.scope, ...patch };
      for (const k of Object.keys(scope) as (keyof Scope)[]) if (scope[k] == null) delete scope[k];
      // the period is the name of the time window: both always say the same thing
      const c = state.clock;
      const period = "time_window" in patch && c ? periodOfWindow(scope.time_window, c.anchor, c.first) : state.period;
      set({ scope, period });
    },
    loadTrail(tr: { trail_id: string; name: string; steps: TrailStep[] }) {
      set({ trail: { id: tr.trail_id, name: tr.name, steps: tr.steps, index: tr.steps.length - 1, savedAt: Date.now(),
        dirty: false } });
      if (tr.steps.length) this.go(tr.steps.length - 1);
    },
    newTrail() {
      set({ trail: { id: newTrailId(), name: "Indagine", steps: [], index: -1, savedAt: null, dirty: false },
        focus: null, panel: "world" });
    },
    setWorldVersion(v: number) {
      if (v !== state.worldVersion) set({ worldVersion: v });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
