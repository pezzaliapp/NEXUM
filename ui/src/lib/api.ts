// Request manager: relative URLs only (no host, port or deployment assumption — D10), one channel per view,
// newer requests abort older ones in the browser and supersede them on the server (X-Nexum-Channel/Seq),
// small in-memory cache per world_version.

import type { Envelope } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public hint?: string | null) {
    super(message);
  }
}
export class Superseded extends Error {}

const BASE = "/api/v1";
const seq = new Map<string, number>();
// channels are scoped to this page session: a reloaded page restarts its sequence numbers
const SESSION = Math.random().toString(36).slice(2, 10);
const inflight = new Map<string, AbortController>();
// response cache bounded in BYTES (U9: a count bound let large map projections fill the heap); responses larger than
// CACHE_ITEM_MAX are not kept here — the service's ETag revalidation (304) covers them
const cache = new Map<string, { env: Envelope; bytes: number }>();
const CACHE_MAX_BYTES = 6 * 1024 * 1024;
const CACHE_ITEM_MAX = 512 * 1024;
let cacheBytes = 0;
let cacheVersion = -1;
export const lastWorldVersion = { value: 0, listeners: new Set<(v: number) => void>() };

export function qs(params: Record<string, any> = {}): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    out.push(`${encodeURIComponent(k)}=${encodeURIComponent(s)}`);
  }
  return out.length ? `?${out.join("&")}` : "";
}

export interface CallOpts { channel?: string; method?: "GET" | "POST" | "PUT" | "DELETE"; body?: any; noCache?: boolean }

export async function call<T = any>(path: string, params?: Record<string, any>, opts: CallOpts = {}): Promise<Envelope<T>> {
  const url = BASE + path + qs(params);
  const method = opts.method ?? "GET";
  const cacheable = method === "GET" && !opts.noCache;
  if (cacheable) {
    const hit = cache.get(url);
    if (hit && hit.env.world_version === lastWorldVersion.value) {
      cache.delete(url); cache.set(url, hit);
      if (opts.channel) inflight.get(opts.channel)?.abort();
      return hit.env as Envelope<T>;
    }
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  let signal: AbortSignal | undefined;
  if (opts.channel) {
    inflight.get(opts.channel)?.abort();
    const ctl = new AbortController();
    inflight.set(opts.channel, ctl);
    signal = ctl.signal;
    const n = (seq.get(opts.channel) ?? 0) + 1;
    seq.set(opts.channel, n);
    headers["X-Nexum-Channel"] = `${SESSION}/${opts.channel}`;
    headers["X-Nexum-Seq"] = String(n);
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(url, { method, headers, signal, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Superseded("aborted");
    throw e;
  } finally {
    if (opts.channel && inflight.get(opts.channel)?.signal === signal) inflight.delete(opts.channel);
  }
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = {}; }
  if (!res.ok) {
    if (res.status === 409) throw new Superseded("superseded");
    const err = json?.error ?? {};
    throw new ApiError(res.status, err.code ?? "error", err.message ?? res.statusText, err.hint);
  }
  const env = json as Envelope<T>;
  if (typeof env.world_version === "number") {
    if (env.world_version !== lastWorldVersion.value) {
      lastWorldVersion.value = env.world_version;
      lastWorldVersion.listeners.forEach((l) => l(env.world_version));
    }
    if (cacheVersion !== env.world_version) { cache.clear(); cacheBytes = 0; cacheVersion = env.world_version; }
  }
  if (cacheable && typeof env.world_version === "number" && text.length <= CACHE_ITEM_MAX) {
    const old = cache.get(url);
    if (old) { cacheBytes -= old.bytes; cache.delete(url); }
    cache.set(url, { env, bytes: text.length });
    cacheBytes += text.length;
    while (cacheBytes > CACHE_MAX_BYTES && cache.size) {
      const [k, v] = cache.entries().next().value!;
      cache.delete(k);
      cacheBytes -= v.bytes;
    }
  }
  return env;
}

/** Plain JSON endpoints outside the Core envelope (raw records, trails, basemap style). */
export async function plain<T = any>(path: string, opts: CallOpts = {}, params?: Record<string, any>): Promise<T> {
  const res = await fetch(BASE + path + qs(params), {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as any)?.error ?? {};
    throw new ApiError(res.status, err.code ?? "error", err.message ?? res.statusText, err.hint);
  }
  return json as T;
}

export const isSuperseded = (e: unknown) => e instanceof Superseded;

/** Diagnostics (read-only): size of the in-memory response cache. */
export function cacheStats() {
  return { entries: cache.size, approx_bytes: cacheBytes };
}
export function clearCache() { cache.clear(); cacheBytes = 0; }
if (typeof window !== "undefined") {
  const w = window as any;
  w.__nexum ??= {};
  w.__nexum.apiCache = { stats: cacheStats, clear: clearCache };
}
