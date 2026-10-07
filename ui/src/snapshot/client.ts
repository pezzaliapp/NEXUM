import { addProtocol } from "maplibre-gl";
import { decodePolygons } from "./basemap.ts";
import { gunzip } from "./data.ts";

// Main-thread side of the online workspace: a fetch-compatible transport for /api/v1 (answered by the snapshot
// worker), the published snapshot's identity and age, persistent-storage requests and new-snapshot detection.

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (m: any) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      // the worker cannot reach the pointer (offline, outside the service worker): the page answers it (through the worker)
      if (e.data?.needCurrent) {
        fetch("/current.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          .then((c) => worker!.postMessage({ rid: e.data.rid, current: c }));
        return;
      }
      const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data); }
    };
  }
  return worker;
}

/** fetch() for /api/v1 URLs, answered by the snapshot worker (same status codes and bodies as the local service). */
const log: string[] = [];   // requested URLs (test hook, bounded): the online "network" of /api/v1
const logT: number[] = [];  // performance.now() of each request

export function snapshotFetch(url: string, init: RequestInit = {}): Promise<Response> {
  log.push(url);
  logT.push(performance.now());
  if (log.length > 500) { log.splice(0, log.length - 500); logT.splice(0, logT.length - 500); }
  const headers = new Headers(init.headers);
  const seqH = headers.get("X-Nexum-Seq");
  const msg = { method: init.method ?? "GET", url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    channel: headers.get("X-Nexum-Channel"), seq: seqH ? Number(seqH) : null };
  return new Promise<Response>((answered, aborted) => {
    if (init.signal?.aborted) { aborted(new DOMException("aborted", "AbortError")); return; }
    const id = ++nextId;
    const w = getWorker();
    pending.set(id, (m) => answered(new Response(JSON.stringify(m.body), { status: m.status,
      headers: { "Content-Type": "application/json", ...(m.headers ?? {}) } })));
    init.signal?.addEventListener("abort", () => {
      if (pending.delete(id)) { w.postMessage({ cancel: id }); aborted(new DOMException("aborted", "AbortError")); }
    });
    w.postMessage({ id, ...msg });
  });
}

// test hook (like window.__nexum.store): read the online /api/v1 as the page does
if (typeof window !== "undefined") {
  const w = window as any;
  w.__nexum ??= {};
  w.__nexum.apiLog = log;
  w.__nexum.apiLogT = logT;
  w.__nexum.apiFetch = async (path: string) => {
    const r = await snapshotFetch("/api/v1" + path);
    return { status: r.status, body: await r.json() };
  };
}

export interface SnapshotInfo { version: string; built_utc: string; world: string; world_version: number }
let info: SnapshotInfo | null = null;
const listeners = new Set<(i: SnapshotInfo, newer: SnapshotInfo | null) => void>();
let newer: SnapshotInfo | null = null;

export async function snapshotInfo(): Promise<SnapshotInfo> {
  if (!info) {
    const r = await snapshotFetch("/api/v1/_snapshot");
    const b = await r.json();
    info = { version: b.version, built_utc: b.built_utc, world: b.world, world_version: b.world_version };
  }
  return info;
}

export function onSnapshot(f: (i: SnapshotInfo, newer: SnapshotInfo | null) => void): () => void {
  listeners.add(f);
  snapshotInfo().then((i) => f(i, newer), () => {});
  return () => { listeners.delete(f); };
}

/** A newer snapshot was published: the session keeps its version (no mixing) and offers a reload. */
async function checkNewer() {
  try {
    const cur = await snapshotInfo();
    const r = await fetch("/current.json", { cache: "no-cache" });
    if (!r.ok) return;
    const c = await r.json();
    if (c.version !== cur.version) { newer = c; listeners.forEach((f) => f(cur, newer)); }
  } catch { /* offline: try again later */ }
}
if (typeof window !== "undefined") {
  setInterval(checkNewer, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkNewer(); });
}

/** E6: ask the browser to keep this site's storage (the trail); the answer is shown, never assumed. */
export async function requestPersist(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

/** Safari (not installed on the Home Screen) deletes site data after 7 days of use without visits (WebKit policy). */
export function safariEviction(): boolean {
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Android/.test(ua);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  return safari && !standalone;
}

export function ageText(builtUtc: string, nowMs = Date.now()): string {
  const h = Math.max(0, (nowMs - Date.parse(builtUtc)) / 3600e3);
  if (h < 1) return "meno di 1 h fa";
  if (h < 48) return `${Math.floor(h)} h fa`;
  return `${Math.floor(h / 24)} giorni fa`;
}

// Basemap layers of the snapshot are compact (basemap.ts): MapLibre asks for nexum-basemap:///s/<v>/basemap/<n>.bmz
// and receives the provider's identical GeoJSON.
addProtocol("nexum-basemap", async (params) => {
  const r = await fetch(params.url.replace(/^nexum-basemap:\/\//, ""));
  if (!r.ok) throw new Error(`basemap: HTTP ${r.status}`);
  return { data: decodePolygons(await gunzip(new Uint8Array(await r.arrayBuffer()))) };
});
