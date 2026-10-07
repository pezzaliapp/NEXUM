/// <reference lib="webworker" />
// The online workspace's data service, in a Web Worker: it answers the /api/v1 requests of the UI from the static
// snapshot (routes.ts), the browser's TRAIL store (trails.ts) and, on the first search, the FTS5 index in sqlite-wasm.

import { SnapshotData } from "./data.ts";
import { SnapshotApi } from "./routes.ts";
import { openSearch } from "./search.ts";
import { TrailStore } from "./trails.ts";

interface Current { version: string; base: string; world: string; world_version: number; built_utc: string }

let ready: Promise<{ api: SnapshotApi; trails: TrailStore; cur: Current }> | null = null;
const cancelled = new Set<number>();
// downloads of the map's object tiles in flight: a request for an element's context cancels them, so the element
// the person just chose never waits behind the surroundings (the map asks its tiles again once the context is in)
const tileDownloads = new Set<AbortController>();
class TileCancelled extends Error { name = "Superseded"; }

/** OFFLINE (2026-10-06): this worker's requests are not routed through the service worker in every engine (WebKit), so
 *  the files it reads are kept in the same data store (the snapshot's files are versioned and immutable) and read from it
 *  when the network cannot be reached. The pointer (current.json) is always asked to the network first. */
const DATA = "nexum-data";
async function kept(url: string, init?: RequestInit): Promise<Response> {
  try {
    const r = await fetch(url, init);
    if (r.ok && typeof caches !== "undefined") { const c = r.clone(); caches.open(DATA).then((s) => s.put(url, c)).catch(() => {}); }
    return r;
  } catch (e) {
    const hit = typeof caches !== "undefined" && !init?.signal?.aborted ? await caches.match(url).catch(() => undefined) : undefined;
    if (hit) return hit;
    throw e;
  }
}

/** The pointer from the page when this worker cannot reach it (offline in an engine that does not route this worker's
 *  requests through the service worker): the page's own requests always go through it, and it keeps the pointer. */
let askId = 0;
const asks = new Map<number, (v: any) => void>();
function askPage(): Promise<Current | null> {
  return new Promise((done) => {
    const rid = ++askId;
    asks.set(rid, done);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ needCurrent: true, rid });
    setTimeout(() => { if (asks.delete(rid)) done(null); }, 8000);
  });
}

async function init() {
  let cur: Current;
  try {
    const res = await kept("/current.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`current.json: HTTP ${res.status}`);
    cur = await res.json();
  } catch (e) {
    const c = await askPage();
    if (!c) throw e;
    cur = c;
  }
  const d = new SnapshotData(async (p) => {
    const tile = p.startsWith("otiles/");
    const ctl = tile ? new AbortController() : null;
    if (ctl) tileDownloads.add(ctl);
    let r: Response;
    try {
      r = await kept(cur.base + p, ctl ? { signal: ctl.signal } : undefined);
    } catch (e) {
      if (ctl?.signal.aborted) throw new TileCancelled(p);
      throw e;
    } finally {
      if (ctl) tileDownloads.delete(ctl);
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  await d.init();
  const api = new SnapshotApi(d);
  api.rm.setSearchEngine(async () => {
    // O9 (2026-10-04): the SQLite module (and its .wasm) is fetched and compiled WHILE the index downloads, not after it
    const engine = (async () => {
      const [mod, wasm] = await Promise.all([import("@sqlite.org/sqlite-wasm"), import("@sqlite.org/sqlite-wasm/sqlite3.wasm?url")]);
      return (mod.default as (o: any) => Promise<any>)({ print: () => {}, printErr: () => {}, locateFile: () => wasm.default });
    })();
    const [bytes, sqlite3] = await Promise.all([d.bytes("search.sqlite.jgz"), engine]);
    return openSearch(bytes, async () => sqlite3);
  });
  return { api, trails: new TrailStore(cur.world), cur };
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data?.rid && "current" in e.data) { asks.get(e.data.rid)?.(e.data.current); asks.delete(e.data.rid); return; }
  const m = e.data;
  if (m.cancel !== undefined) { cancelled.add(m.cancel); return; }
  const { id, method, url, body, channel, seq } = m;
  if (/(^|\/)context$/.test(String(channel ?? ""))) { for (const c of tileDownloads) c.abort(); tileDownloads.clear(); }
  let reply;
  try {
    ready ??= init();
    const { api, trails, cur } = await ready;
    const u = new URL(url, "http://x");
    const p: Record<string, string> = {};
    for (const [k, v] of u.searchParams) p[k] = v;
    if (u.pathname === "/api/v1/_snapshot") reply = { status: 200, body: { ...cur, manifest: { built_utc: api.d.manifest.built_utc,
      file_count: api.d.manifest.file_count, bytes: api.d.manifest.bytes }, loaded: { bytes: api.d.bytesLoaded, files: api.d.filesLoaded } } };
    else if (u.pathname.startsWith("/api/v1/trails")) reply = await trails.handle(method, u.pathname.slice("/api/v1/trails".length), body);
    else reply = await api.handle(method, u.pathname, p, { channel, seq });
  } catch (err) {
    ready = null;
    reply = { status: 503, body: { error: { code: "snapshot_unavailable", message: `dati non raggiungibili: ${(err as Error)?.message ?? err}`,
      hint: "controlla la connessione e ricarica" }, world_version: null } };
  }
  if (cancelled.delete(id)) return;
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ...reply });
};
