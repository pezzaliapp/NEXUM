// TRAIL store of the online workspace: the /api/v1/trails contract of nexum/api/trails.py on IndexedDB (this
// browser only; no login, nothing leaves the device). Same validation, messages and export format ("nexum-trail",
// version 1), so a trail exported online imports locally and vice versa.

import type { Reply } from "./routes.ts";

const FORMAT = "nexum-trail";
const FORMAT_VERSION = 1;
const MAX_STEPS = 500;
const TRAIL_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REF_ID = /^(obj|evt|rel|ins)_[a-z0-9]{1,40}$/;

class TrailError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

interface Row { trail_id: string; name: string; world_id: string; created_ms: number; updated_ms: number; steps: any[] }

const now = () => Date.now();
const pyStr = (x: any) => (x === null || x === undefined ? "None" : typeof x === "string" ? x : String(x));

function validate(body: any): [string, any[]] {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TrailError(400, "invalid_body", "trail must be a JSON object");
  const name = body.name || "Indagine";
  if (typeof name !== "string" || [...name].length > 200)
    throw new TrailError(400, "invalid_body", "name must be a string of at most 200 characters");
  const steps = body.steps;
  if (!Array.isArray(steps) || steps.length > MAX_STEPS)
    throw new TrailError(400, "invalid_body", `steps must be a list of at most ${MAX_STEPS} items`);
  const clean = [];
  for (const s of steps) {
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof s.ref !== "string" || !REF_ID.test(s.ref))
      throw new TrailError(400, "invalid_body", "each step needs a stable ref id");
    const scope = s.scope;
    if (scope !== undefined && scope !== null && (typeof scope !== "object" || Array.isArray(scope)))
      throw new TrailError(400, "invalid_body", "step scope must be an object");
    const note = s.note;
    if (note !== undefined && note !== null && (typeof note !== "string" || [...note].length > 2000))
      throw new TrailError(400, "invalid_body", "note must be a string of at most 2000 characters");
    const step: any = { ref: s.ref, scope: scope ?? null, added_ms: Math.trunc(Number(s.added_ms || now())),
      label: [...pyStr(s.label || "")].slice(0, 300).join(""), kind: [...pyStr(s.kind || "")].slice(0, 20).join("") };
    if (note) step.note = note;
    clean.push(step);
  }
  return [name, clean];
}

export class TrailStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private worldId: string;

  constructor(worldId: string) { this.worldId = worldId; }

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise<IDBDatabase>((opened, failed) => {
        const r = indexedDB.open("nexum-trails", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("trail", { keyPath: "trail_id" });
        r.onsuccess = () => opened(r.result);
        r.onerror = () => failed(r.error ?? new Error("IndexedDB non disponibile"));
      });
      this.dbp.catch(() => { this.dbp = null; });
    }
    return this.dbp;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((done, failed) => {
      const t = db.transaction("trail", mode);
      const req = fn(t.objectStore("trail"));
      t.oncomplete = () => done(req.result);
      t.onerror = () => failed(t.error);
      t.onabort = () => failed(t.error);
    });
  }

  private async get(tid: string): Promise<Row> {
    const r = await this.tx<Row | undefined>("readonly", (s) => s.get(tid) as IDBRequest<Row | undefined>);
    if (!r || r.world_id !== this.worldId) throw new TrailError(404, "not_found", `trail ${tid} not found`);
    return r;
  }

  private pub(r: Row) {
    return { trail_id: r.trail_id, name: r.name, world_id: r.world_id, created_ms: r.created_ms, updated_ms: r.updated_ms, steps: r.steps };
  }

  async handle(method: string, sub: string, body: any): Promise<Reply> {
    try {
      const [status, data] = await this.route(method, sub, body);
      const headers: Record<string, string> = { "Cache-Control": "no-store" };
      return { status, body: data, headers };
    } catch (e) {
      if (e instanceof TrailError) return { status: e.status, body: { error: { code: e.code, message: e.message, hint: null }, world_version: null } };
      return { status: 503, body: { error: { code: "storage_unavailable", message: `archivio locale non disponibile: ${(e as Error)?.message ?? e}`,
        hint: "la trail resta in memoria: esportala per conservarla" }, world_version: null } };
    }
  }

  private async route(method: string, sub: string, body: any): Promise<[number, any]> {
    if ((sub === "" || sub === "/") && method === "GET") {
      const all = await this.tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
      const items = all.filter((r) => r.world_id === this.worldId)
        .sort((a, b) => b.updated_ms - a.updated_ms).slice(0, 200)
        .map((r) => ({ trail_id: r.trail_id, name: r.name, updated_ms: r.updated_ms, steps: r.steps.length }));
      return [200, { data: { items } }];
    }
    if (sub === "/import" && method === "POST") {
      if (!body || typeof body !== "object" || body.format !== FORMAT) throw new TrailError(400, "invalid_body", "not a NEXUM trail export");
      if (body.version !== FORMAT_VERSION) throw new TrailError(400, "invalid_body", `unsupported trail format version ${pyStr(body.version)}`);
      const t = body.trail || {};
      const [name, steps] = validate(t);
      let tid: string | null = typeof t.trail_id === "string" && TRAIL_ID.test(t.trail_id) ? t.trail_id : null;
      if (tid !== null) {
        const exists = await this.tx<any>("readonly", (s) => s.get(tid!));
        if (exists) tid = null;
      }
      if (tid === null) tid = `imp-${now().toString(16)}`;
      const n = now();
      const row: Row = { trail_id: tid, name, world_id: this.worldId, created_ms: Math.trunc(Number(t.created_ms || n)), updated_ms: n, steps };
      await this.tx("readwrite", (s) => s.add(row));
      return [201, { data: this.pub(await this.get(tid)) }];
    }
    const m = sub.match(/^\/([a-z0-9][a-z0-9-]{0,39})(\/export)?$/);
    if (!m) throw new TrailError(404, "not_found", "no such trail endpoint");
    const tid = m[1], exp = !!m[2];
    if (exp && method === "GET") return [200, { format: FORMAT, version: FORMAT_VERSION, exported_ms: now(), trail: this.pub(await this.get(tid)) }];
    if (exp) throw new TrailError(405, "method_not_allowed", "export is read-only");
    if (method === "GET") return [200, { data: this.pub(await this.get(tid)) }];
    if (method === "PUT") {
      const [name, steps] = validate(body);
      const n = now();
      const prev = await this.tx<Row | undefined>("readonly", (s) => s.get(tid) as IDBRequest<Row | undefined>);
      const row: Row = { trail_id: tid, name, world_id: this.worldId, created_ms: prev ? prev.created_ms : n, updated_ms: n, steps };
      await this.tx("readwrite", (s) => s.put(row));
      return [200, { data: this.pub(await this.get(tid)) }];
    }
    if (method === "DELETE") {
      await this.get(tid);
      await this.tx("readwrite", (s) => s.delete(tid));
      return [200, { data: { deleted: tid } }];
    }
    throw new TrailError(405, "method_not_allowed", "method not allowed");
  }
}
