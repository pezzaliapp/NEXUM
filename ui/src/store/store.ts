// The single workspace store (W13/W14). Every entity lives once in `entities`, keyed by its stable ID;
// views keep IDs only. Selection and focus are one coordinated value (decision D9): changing view never
// loses it. Pure TypeScript (no React) so that its invariants are unit-tested.

import type { Kind, Ref, Scope, TypeInfo, WorldStatus } from "../lib/types.ts";

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
    mobileTab: "map", railOpen: false, inspectorOpen: false, worldVersion: 0, rev: 0, mapInfo: null, viewport: null, context: null, path: null,
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
    select(id: string | null, origin: string) {
      if (typeof performance !== "undefined") performance.mark(`nexum:select:${id}`);
      if (!id) return set({ focus: null, secondary: null, origin, panel: "world", whyId: null });
      set({ focus: id, secondary: null, origin, panel: "object", whyId: null, trail: pushTrail(id),
        inspectorOpen: true });
    },
    setSecondary(id: string | null) { set({ secondary: id }); },
    why(id: string) { set({ panel: "why", whyId: id, inspectorOpen: true }); },
    back() { this.go(state.trail.index - 1); },
    forward() { this.go(state.trail.index + 1); },
    go(i: number) {
      const t = state.trail;
      if (i < 0 || i >= t.steps.length) return;
      set({ focus: t.steps[i].ref, origin: "trail", panel: "object", whyId: null, trail: { ...t, index: i },
        scope: t.steps[i].scope ?? state.scope });
    },
    setScope(patch: Partial<Scope>) {
      const scope = { ...state.scope, ...patch };
      for (const k of Object.keys(scope) as (keyof Scope)[]) if (scope[k] == null) delete scope[k];
      set({ scope });
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
