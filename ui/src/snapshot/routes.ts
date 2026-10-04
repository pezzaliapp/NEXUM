// The /api/v1 contract of the local service (nexum/api/server.py), answered from the static snapshot.
// Parameter validation, budgets, reductions and error bodies follow the service; element-centred responses are
// the service's own (precomputed by nexum.snapshot); scope-dependent ones come from the read model (core.ts).

import { budgetOf, kindOf, LIMITS, QueryError, ReadModel } from "./core.ts";
import { NotFound, type SnapshotData } from "./data.ts";
import { pyInt } from "./py.ts";

export interface Reply { status: number; body: any; headers?: Record<string, string> }

class ApiError extends Error {
  status: number; code: string; hint: string | null;
  constructor(status: number, code: string, message: string, hint: string | null = null) {
    super(message);
    this.status = status; this.code = code; this.hint = hint;
  }
}

const CORE_MAX: Record<string, number> = Object.fromEntries(Object.entries(LIMITS).map(([k, [, hi]]) => [k, hi]));
const API_BYTES_MARGIN = 4096;
const MAX_BUCKETS = 400;
const BUCKET_MS: Record<string, number> = { hour: 3600e3, day: 86400e3, month: 30.44 * 86400e3, year: 365.25 * 86400e3 };
const BUCKET_ORDER = ["hour", "day", "month", "year"];
const ID = "((?:obj|evt|rel|ins)_[a-z0-9]{1,40})";
const ID_RE = /^(?:obj|evt|rel|ins)_[a-z0-9]{1,40}$/;

type P = Record<string, string>;

// ── parameter helpers (server.py) ────────────────────────────────────────────
function jsonParam(p: P, name: string, dflt: any = null): any {
  if (!(name in p)) return dflt;
  try { return JSON.parse(p[name]); } catch {
    throw new ApiError(400, `invalid_${name === "s" ? "scope" : name === "b" ? "budget" : "parameter"}`,
      `parameter '${name}' is not valid JSON`);
  }
}

function intParam(p: P, name: string, dflt: number | null, lo?: number, hi?: number, rejectAbove = false): [number, any] {
  if (!(name in p)) {
    if (dflt === null) throw new ApiError(400, "missing_parameter", `parameter '${name}' is required`);
    return [dflt, null];
  }
  const v = pyInt(p[name]);
  if (v === null) throw new ApiError(400, "invalid_parameter", `parameter '${name}' must be an integer`);
  if (lo !== undefined && v < lo) throw new ApiError(400, "invalid_parameter", `parameter '${name}' must be ≥ ${lo}`);
  if (hi !== undefined && v > hi) {
    if (rejectAbove) throw new ApiError(400, "invalid_parameter", `parameter '${name}' must be ≤ ${hi}`,
      "riduci il valore: il limite protegge dalle richieste illimitate");
    return [hi, { [name]: { requested: v, applied: hi } }];
  }
  return [v, null];
}

function required(p: P, name: string): string {
  const v = p[name];
  if (!v) throw new ApiError(400, "missing_parameter", `parameter '${name}' is required`);
  return v;
}

const isNum = (x: any) => typeof x === "number" && Number.isFinite(x);

function scopeParam(p: P, needViewport = false): any {
  let s = jsonParam(p, "s", {});
  if (!s) s = {};
  if (typeof s !== "object" || Array.isArray(s)) throw new ApiError(400, "invalid_scope", "scope must be a JSON object");
  if (needViewport) {
    const vp = s.viewport;
    if (!(Array.isArray(vp) && vp.length === 4 && vp.every(isNum)))
      throw new ApiError(400, "missing_parameter", "map projections require scope.viewport [w, s, e, n]",
        "la mappa chiede sempre solo l'area visibile");
    if (!(vp[0] < vp[2] && vp[1] < vp[3])) throw new ApiError(400, "invalid_scope", "viewport must satisfy w < e and s < n");
    if (typeof s.z !== "number") throw new ApiError(400, "missing_parameter", "map projections require scope.z");
  }
  const tw = s.time_window;
  if (tw !== undefined && tw !== null && !(Array.isArray(tw) && tw.length === 2 && tw.every((x: any) => typeof x === "number")
    && tw[0] <= tw[1])) throw new ApiError(400, "invalid_scope", "time_window must be [from_ms, to_ms] with from ≤ to");
  return s;
}

function budgetParam(p: P, dflt: Record<string, number>, maximum: Record<string, number>): [any, any] {
  const b: any = { ...dflt };
  const reduced: any = {};
  let user = jsonParam(p, "b", {});
  if (!user) user = {};
  if (typeof user !== "object" || Array.isArray(user)) throw new ApiError(400, "invalid_budget", "budget must be a JSON object");
  for (const [k, v0] of Object.entries(user)) {
    let v: any = v0;
    if (k === "lod") { b.lod = v; continue; }
    if (!(k in CORE_MAX)) throw new ApiError(400, "invalid_budget", `unknown budget field '${k}'`);
    if (!Number.isInteger(v) || v <= 0) throw new ApiError(400, "invalid_budget", `budget.${k} must be a positive integer`);
    const cap = Math.min(maximum[k] ?? CORE_MAX[k], CORE_MAX[k]);
    if (v > cap) { reduced[k] = { requested: v, applied: cap }; v = cap; }
    b[k] = v;
  }
  const mb = Math.min(b.max_bytes ?? 2_000_000, CORE_MAX.max_bytes);
  b.max_bytes = Math.max(8192, mb - API_BYTES_MARGIN);
  return [b, reduced];
}

function hlParam(p: P): string[] | null {
  if (!("hl" in p)) return null;
  const ids = p.hl.split(",").filter((x) => x).slice(0, 20);
  for (const x of ids) if (!ID_RE.test(x)) throw new ApiError(400, "invalid_parameter", `invalid highlight id '${x}'`);
  return ids;
}

const sameJson = (a: any, b: any) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function canon(x: any): any {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])]));
  return x;
}

// ── router ───────────────────────────────────────────────────────────────────
type Handler = (m: RegExpMatchArray, p: P) => Promise<[any, any]>;
interface Route { rx: RegExp; name: string; deadline: number; fn: Handler }

export class SnapshotApi {
  d: SnapshotData;
  rm: ReadModel;
  private routes: Route[] = [];

  constructor(d: SnapshotData) {
    this.d = d;
    this.rm = new ReadModel(d);
    this.define();
  }

  private notOffline(): never {
    throw new ApiError(501, "not_available_offline",
      "operazione non disponibile nella versione online (snapshot statico)", "disponibile nel servizio locale di NEXUM");
  }

  /** Precomputed service response of an element (bundle key), or the Core's "not found". */
  private async precomputed(id: string, key: string): Promise<[any, any]> {
    kindOf(id);
    const b = await this.d.bundle(id);
    if (b === undefined) throw new QueryError(`entity ${id} not found`);
    const r = b[key];
    if (r === undefined) this.notOffline();
    const [status, body] = r;
    if (status !== 200) throw new ApiError(status, body.error.code, body.error.message, body.error.hint);
    const env = structuredClone(body);
    const reduced = env.api?.budget_applied ?? {};
    delete env.api;
    return [env, reduced];
  }

  private only(p: P, allowed: Record<string, any>) {
    // precomputed responses exist for the exact requests of the workspace; any other parameter set is not offline
    for (const k of Object.keys(p)) {
      if (!(k in allowed)) this.notOffline();
      const v = k === "b" || k === "s" ? jsonParam(p, k) : p[k];
      if (!sameJson(v, allowed[k])) this.notOffline();
    }
    for (const k of Object.keys(allowed)) if (!(k in p)) this.notOffline();
  }

  private define() {
    const R = (pattern: string, name: string, deadline: number, fn: Handler) =>
      this.routes.push({ rx: new RegExp(`^/api/v1${pattern}$`), name, deadline, fn });
    const rm = this.rm;

    R("/facets", "facets", 800, async (_m, p) => [await rm.facets(scopeParam(p)), {}]);
    R("/projections/map", "pmap", 1500, async (_m, p) => {
      const s = scopeParam(p, true);
      const [b, red] = budgetParam(p, { max_items: 2000 }, { max_items: 5000 });
      return [await rm.projectMap(s, b, hlParam(p)), red];
    });
    R("/projections/timeline", "ptimeline", 1500, async (_m, p) => {
      const s = scopeParam(p);
      const [b, red] = budgetParam(p, { max_items: 500 }, { max_items: 2000 });
      let bucket = p.bucket ?? "auto";
      if (!["auto", ...Object.keys(BUCKET_MS)].includes(bucket))
        throw new ApiError(400, "invalid_parameter", "bucket must be auto, hour, day, month or year");
      const tw = s.time_window;
      if (bucket !== "auto" && tw && tw.length) {
        const n = (tw[1] - tw[0]) / BUCKET_MS[bucket];
        if (n > MAX_BUCKETS) {
          const wanted = bucket;
          bucket = BUCKET_ORDER.find((c) => (tw[1] - tw[0]) / BUCKET_MS[c] <= MAX_BUCKETS) ?? "year";
          red.bucket = { requested: wanted, applied: bucket };
        }
      }
      return [await rm.projectTimeline(s, bucket, b, hlParam(p)), red];
    });
    R("/search", "search", 800, async (_m, p) => {
      const q = (p.q ?? "").trim();
      if ([...q].length < 2) throw new ApiError(400, "missing_parameter", "q must have at least 2 characters");
      const [b, red] = budgetParam(p, { max_items: 50 }, { max_items: 200 });
      return [await rm.searchText([...q].slice(0, 200).join(""), scopeParam(p), b), red];
    });
    R("/insights", "insights", 1000, async (_m, p) => {
      const [b, red] = budgetParam(p, { max_items: 50 }, { max_items: 500 });
      return [await rm.insights(scopeParam(p), b, p.cursor ?? null, p.rule_id ?? null, p.member ?? null), red];
    });
    R(`/entities/${ID}`, "entity", 500, async (m, p) => [await rm.getEntity(m[1], p.lod ?? "details"), {}]);
    R(`/context/${ID}`, "context", 1500, async (m, p) => { this.only(p, {}); return this.precomputed(m[1], "context"); });
    R(`/entities/${ID}/relations`, "relations", 1000, async () => this.notOffline());
    R(`/entities/${ID}/events`, "events", 1000, async (m, p) => {
      const [b, red] = budgetParam(p, { max_items: 50 }, { max_items: 500 });
      return [await rm.relatedEvents(m[1], scopeParam(p), b, p.cursor ?? null), red];
    });
    R(`/entities/${ID}/objects`, "objects", 1000, async (m, p) => {
      const [b, red] = budgetParam(p, { max_items: 50 }, { max_items: 500 });
      return [await rm.relatedObjects(m[1], scopeParam(p), b, p.cursor ?? null), red];
    });
    R(`/entities/${ID}/evidence`, "evidence", 1000, async (m, p) => {
      this.only(p, { b: { max_items: 10 } });
      return this.precomputed(m[1], "ev10");
    });
    R(`/entities/${ID}/supports`, "supports", 1000, async () => this.notOffline());
    R(`/entities/${ID}/sources`, "esources", 1000, async () => this.notOffline());
    R(`/provenance/${ID}`, "provenance", 1500, async (m, p) => { this.only(p, {}); return this.precomputed(m[1], "prov"); });
    R(`/entities/${ID}/timeline`, "etimeline", 1500, async (m, p) => {
      this.only(p, { b: { max_items: 400 } });
      return this.precomputed(m[1], "tl400");
    });
    R(`/entities/${ID}/timeline/neighbors`, "tneighbors", 1500, async (m, p) => {
      this.only(p, { b: { max_items: 300 } });
      return this.precomputed(m[1], "nb300");
    });
    R(`/entities/${ID}/timeline/step`, "tstep", 500, async (m, p) => {
      const d = p.dir ?? "next";
      if (d !== "next" && d !== "prev") throw new ApiError(400, "invalid_parameter", "dir must be next or prev");
      const [kind] = await rm.require(m[1]);
      if (kind !== "event") throw new QueryError("timeline_step requires an event");
      return this.precomputed(m[1], `step:${d}`);
    });
    R(`/entities/${ID}/spatial/nearby`, "nearby", 1500, async () => this.notOffline());
    R(`/entities/${ID}/spatial/containing`, "containing", 1500, async () => this.notOffline());
    R(`/entities/${ID}/spatial/contained`, "contained", 1500, async () => this.notOffline());
    R(`/entities/${ID}/locate`, "locate", 500, async (m, p) => { this.only(p, {}); return this.precomputed(m[1], "locate"); });
    R("/graph/neighborhood", "neighborhood", 2000, async (_m, p) => {
      const focus = required(p, "focus");
      const [depth] = intParam(p, "depth", 1, 1, 3, true);
      const [b, red] = budgetParam(p, { max_nodes: 200, max_edges: 400 }, { max_nodes: 2000, max_edges: 4000 });
      return [await rm.neighborhood(focus, depth, scopeParam(p), b), red];
    });
    R("/graph/expand", "expand", 1500, async (_m, p) => {
      const node = required(p, "node"), ek = required(p, "edge_kind"), et = required(p, "type");
      const d = p.dir ?? "out";
      if (d !== "out" && d !== "in") throw new ApiError(400, "invalid_parameter", "dir must be out or in");
      const [b, red] = budgetParam(p, { max_nodes: 200 }, { max_nodes: 1000 });
      return [await rm.expand(node, ek, et, d, b, p.cursor ?? null), red];
    });
    R("/graph/path", "path", 3000, async (_m, p) => {
      const a = required(p, "a"), b = required(p, "b");
      const [hops] = intParam(p, "max_hops", 4, 1, 4, true);
      return [await rm.path(a, b, hops), {}];
    });
    R("/changes", "changes", 1500, async () => this.notOffline());
    R(`/explain/${ID}`, "explain", 2000, async (m, p) => {
      this.only(p, {});
      const [kind] = await rm.require(m[1]);
      if (kind !== "insight" && kind !== "relation") throw new QueryError("explain accepts an insight or a relation");
      return this.precomputed(m[1], "explain");
    });
  }

  private static(path: string): Promise<any> { return this.d.json(path); }

  private error(e: ApiError, wv: number | null): Reply {
    return { status: e.status, body: { error: { code: e.code, message: e.message, hint: e.hint }, world_version: wv },
      headers: { "Cache-Control": "no-store" } };
  }

  /** Answer one request of the workspace (method, path without query, parsed query string, JSON body). */
  async handle(method: string, path: string, p: P, meta: { channel?: string | null; seq?: number | null } = {}): Promise<Reply> {
    const wv = this.d.manifest.world_version;
    let routed = false;   // the service reports world_version only for errors raised inside a Core route
    try {
      if (path.startsWith("/api/v1/trails")) throw new ApiError(500, "internal", "trails are handled by the browser store");
      if (method === "GET" && (path === "/api/v1/status" || path === "/api/v1/types" || path === "/api/v1/sources" ||
        path === "/api/v1/highlights" || path === "/api/v1/insight-summaries" || path === "/api/v1/observations" || path === "/api/v1/tenures" ||
        path === "/api/v1/indicators-catalog" || path === "/api/v1/security" ||
        path === "/api/v1/event-webcams" || path === "/api/v1/places-index"))
        return { status: 200, body: await this.static(`api/${path.slice(8)}.json`) };
      const im = path.match(/^\/api\/v1\/indicators\/((?:obj|evt|rel|ins)_[a-z0-9]{1,40})$/);
      if (im && method === "GET") {
        // a place without indicators answers as the service does: an empty list (a data gap, not an error)
        const body = await this.d.indicators(im[1]);
        return { status: 200, body: body ?? { data: { entity: im[1], series: [], defs: {}, flows: [], source_names: {} }, lod: "refs",
          total: 0, returned: 0, truncated: false, cursor_next: null, excluded: {}, facets: null, highlight: null, sources: [],
          world_version: wv, as_of: {}, timing_ms: 0 } };
      }
      if (method === "GET" && path === "/api/v1/basemap/style.json") return { status: 200, body: await this.static("basemap/style.json") };
      if (method === "GET" && path === "/api/v1/basemap/labels.json") return { status: 200, body: await this.static("basemap/labels.json") };
      if (path === "/api/v1/diagnostics") return { status: 200, body: { snapshot: this.d.manifest.version,
        bytes_loaded: this.d.bytesLoaded, files_loaded: this.d.filesLoaded } };
      let m = path.match(/^\/api\/v1\/raw\/([0-9a-z]{26})$/);
      if (m && method === "GET") {
        const loc = required(p, "path");
        const r = await this.d.raw(m[1], loc);
        if (r === undefined) throw new ApiError(404, "not_found", `record ${m[1]} ${loc} not in this snapshot`);
        if (r[0] !== 200) throw new ApiError(r[0], r[1].error.code, r[1].error.message, r[1].error.hint);
        return { status: 200, body: r[1], headers: { "Cache-Control": "max-age=3600" } };
      }
      m = path.match(/^\/api\/v1\/rules\/([a-z0-9_]{1,80})$/);
      if (m && method === "GET") {
        const version = p.version ?? null;
        const r = (await this.d.rules())[`${m[1]}|${version ?? ""}`];
        if (r === undefined) throw new ApiError(404, "not_found", `rule ${m[1]} v${version ?? "None"} not found in this world's rule files`);
        if (r[0] !== 200) throw new ApiError(r[0], r[1].error.code, r[1].error.message, r[1].error.hint);
        return { status: 200, body: r[1] };
      }
      for (const route of this.routes) {
        const mm = path.match(route.rx);
        if (!mm || method !== "GET") continue;
        routed = true;
        const t0 = performance.now();
        let env: any, reduced: any;
        try {
          [env, reduced] = await route.fn(mm, p);
        } catch (e) {
          if (e instanceof QueryError) {
            const nf = e.message.includes("not found");
            throw new ApiError(nf ? 404 : 400, nf ? "not_found" : "invalid_request", e.message);
          }
          throw e;
        }
        env.api = { op: route.name, channel: meta.channel ?? null, seq: meta.seq ?? null, deadline_ms: route.deadline,
          elapsed_ms: Math.round((performance.now() - t0) * 100) / 100, cache: "miss", budget_applied: reduced };
        return { status: 200, body: env, headers: { "Cache-Control": "no-cache" } };
      }
      throw new ApiError(404, "not_found", `no endpoint ${method} ${path}`);
    } catch (e) {
      if (e instanceof ApiError) return this.error(e, routed ? wv : null);
      // a download cancelled for the person's newer choice (the worker's tile downloads): superseded, never an error
      if ((e as Error)?.name === "Superseded") return this.error(new ApiError(409, "superseded", "superseded"), wv);
      if (e instanceof NotFound) return this.error(new ApiError(503, "snapshot_changed",
        "il mondo pubblicato è cambiato: ricarica la pagina", "ricarica per usare lo snapshot più recente"), wv);
      return this.error(new ApiError(500, "internal", String((e as Error)?.message ?? e)), wv);
    }
  }
}

export { budgetOf };
