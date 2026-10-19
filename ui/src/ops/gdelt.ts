// GDELT IN THE BROWSER (2026-10-18, decision D7 option A: browser → GDELT → on-demand refresh → snapshot fallback; no
// scheduled job, backend, proxy or relay). Asked only while the news layer or the alerts panel is open, at most once per
// refresh period: the two "last update" lists (standard and multilingual streams), then the 15-minute exports of the
// chosen window. The newest hour keeps every coded action (root events), with the articles of GDELT's mentions export;
// the older slots keep only the actions of the public-order lens (config publicorder.json), so a long window costs
// what it shows. Files GDELT has published never change: each slot is downloaded once per page and kept in memory only
// while it is inside the window (retention: nothing is written on the device; the browser's own cache keeps GDELT's
// files at most the hour GDELT's servers allow). Requests carry no header of NEXUM's (no cookie, no identifier).

import ORDER from "../config/publicorder.json";
import { fileUrl, parseExport, parseLastUpdate, parseMentions, slotsBack, slotTime, unzipFirst, type GRow, type MentionMeta, type OrderCfg } from "./gdeltcore";

const CFG = ORDER as unknown as OrderCfg;
const LENS = new Set(CFG.categories.flatMap((c) => c.codes));
const inLens = (code: string) => LENS.has(code) || LENS.has(code.slice(0, 3));
const RECENT = 4;                 // slots of the newest hour: every action, with mentions
const TIMEOUT = 20_000;
const PARALLEL = 4;
const BASE = "https://data.gdeltproject.org/gdeltv2/";

export interface LiveNews {
  rows: GRow[]; links: Map<string, string[]>; meta: Map<string, MentionMeta>;
  latest: { en: string | null; tr: string | null };
  files: { ok: number; failed: number; total: number }; bytes: number; errors: string[]; fetched: number;
}

/** The browser can unpack GDELT's zips (DecompressionStream "deflate-raw": Chrome 103+, Safari 16.4+). */
export function supported(): boolean {
  try { new DecompressionStream("deflate-raw" as CompressionFormat); return typeof fetch === "function"; } catch { return false; }
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function get(url: string): Promise<ArrayBuffer> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: c.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.arrayBuffer();
  } catch (e: any) { throw new Error(e?.name === "AbortError" ? "tempo scaduto" : String(e?.message ?? e)); }
  finally { clearTimeout(t); }
}

type Slot = { scope: "all" | "lens"; rows: GRow[]; bytes: number };
const slots = new Map<string, Promise<Slot>>();          // `${stream}:${slot}`
const mentions = new Map<string, Promise<{ m: Map<string, string[]>; meta: Map<string, MentionMeta>; bytes: number }>>();

function loadSlot(stream: "en" | "tr", slot: string, scope: "all" | "lens"): Promise<Slot> {
  const k = `${stream}:${slot}`, had = slots.get(k);
  if (had) return had.then((s) => s.scope === "all" && scope === "lens" ? { scope, rows: s.rows.filter((r) => inLens(r.code)), bytes: 0 }
    : s.scope === scope ? { ...s, bytes: 0 } : fetchSlot(stream, slot, scope));
  const p = fetchSlot(stream, slot, scope);
  slots.set(k, p);
  p.catch(() => slots.delete(k));                          // a failed slot is asked again at the next refresh
  return p;
}
async function fetchSlot(stream: "en" | "tr", slot: string, scope: "all" | "lens"): Promise<Slot> {
  const buf = await get(fileUrl(slot, stream, "export"));
  const text = new TextDecoder().decode(await unzipFirst(buf, inflate));
  // the newest hour: every root action, and every action of the lens (root or not); older: the lens only
  const keep = scope === "all" ? (c: string, root: boolean) => root || inLens(c) : (c: string) => inLens(c);
  return { scope, rows: parseExport(text, stream, keep), bytes: buf.byteLength };
}
function loadMentions(stream: "en" | "tr", slot: string, ids: Set<string>) {
  const k = `${stream}:${slot}`, had = mentions.get(k);
  if (had) return had.then((x) => ({ ...x, bytes: 0 }));
  const p = get(fileUrl(slot, stream, "mentions")).then(async (buf) => {
    const meta = new Map<string, MentionMeta>();
    return { m: parseMentions(new TextDecoder().decode(await unzipFirst(buf, inflate)), ids, 8, meta), meta, bytes: buf.byteLength };
  });
  mentions.set(k, p);
  p.catch(() => mentions.delete(k));
  return p;
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const j = i++; try { out[j] = { status: "fulfilled", value: await jobs[j]() }; } catch (e) { out[j] = { status: "rejected", reason: e }; } }
  }));
  return out;
}

/** The chosen window (hours) of both streams, from their own newest slots. Throws when GDELT cannot be reached at all
 *  (the caller falls back to the snapshot's archive, said as such). */
export async function liveNews(hours: number): Promise<LiveNews> {
  if (!supported()) throw new Error("questo browser non sa aprire i file GDELT");
  const lists = await Promise.allSettled([get(`${BASE}lastupdate.txt`), get(`${BASE}lastupdate-translation.txt`)]);
  const latest = lists.map((l) => l.status === "fulfilled" ? parseLastUpdate(new TextDecoder().decode(l.value))?.slot ?? null : null);
  if (!latest[0] && !latest[1]) throw new Error(lists.map((l) => l.status === "rejected" ? String((l.reason as Error)?.message ?? l.reason) : "elenco non valido")[0]);
  const n = Math.max(1, Math.round(hours * 4));
  const plan: { stream: "en" | "tr"; slot: string; scope: "all" | "lens" }[] = [];
  (["en", "tr"] as const).forEach((stream, i) => {
    const l = latest[i];
    if (l) slotsBack(l, n).forEach((slot, j) => plan.push({ stream, slot, scope: j < RECENT ? "all" : "lens" }));
  });
  // retention: what left the window is forgotten
  const keepKeys = new Set(plan.map((p) => `${p.stream}:${p.slot}`));
  for (const k of [...slots.keys()]) if (!keepKeys.has(k)) slots.delete(k);
  for (const k of [...mentions.keys()]) if (!keepKeys.has(k)) mentions.delete(k);

  const res = await pool(plan.map((p) => () => loadSlot(p.stream, p.slot, p.scope)), PARALLEL);
  const rows: GRow[] = [], errors: string[] = [];
  // one stream missing is said, never hidden (the other is shown)
  latest.forEach((l, i) => { if (!l) errors.push(`flusso ${i ? "multilingue" : "standard"} non disponibile ora`); });
  let bytes = 0, ok = 0;
  res.forEach((r, i) => {
    if (r.status === "fulfilled") { ok++; bytes += r.value.bytes; rows.push(...r.value.rows); }
    else errors.push(`${plan[i].stream === "tr" ? "multilingue" : "standard"} ${plan[i].slot.slice(8, 10)}:${plan[i].slot.slice(10, 12)}: ${(r.reason as Error)?.message ?? r.reason}`);
  });
  if (!ok) throw new Error(errors[0] ?? "nessun file");
  // the articles of the newest hour's events (GDELT's mentions export)
  const links = new Map<string, string[]>(), meta = new Map<string, MentionMeta>();
  const recent = plan.filter((p) => p.scope === "all");
  const ids = new Set(rows.map((r) => r.id));
  const mres = await pool(recent.map((p) => () => loadMentions(p.stream, p.slot, ids)), PARALLEL);
  let mok = 0;
  for (const r of mres) if (r.status === "fulfilled") { mok++; bytes += r.value.bytes; r.value.m.forEach((v, k) => links.set(k, v)); r.value.meta.forEach((v, k) => meta.set(k, v)); }
  return { rows, links, meta, latest: { en: latest[0], tr: latest[1] }, files: { ok: ok + mok, failed: plan.length + recent.length - ok - mok, total: plan.length + recent.length },
    bytes, errors, fetched: Date.now() };
}

/** Milliseconds of a slot's time (UTC). */
export const slotMs = (s: string | null) => (s ? slotTime(s) : null);
