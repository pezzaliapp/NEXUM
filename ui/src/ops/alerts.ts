// LIVE ALERTS (2026-10-06, master pass): one list of what is happening, from every source NEXUM may show, each item
// saying what kind of knowledge it is —
//   REPORTED   by the news media (GDELT, automatic coding of articles; several articles and rows about the same action
//              in the same place in the same hour are ONE item, with all their sources) — never a verified fact;
//   VERIFIED   by an institution: the geological survey's live events, GDACS alerts (EC/UN, automatic), NWS warnings, and
//              NEXUM's own events (with their evidence, relations and timeline).
// Shared by the panel and the map layers (one download per source and refresh). Nothing is stored outside this page.
import OPS from "../config/ops.json";
import NEWS from "../config/news.json";
import { call } from "../lib/api";
import ORDER from "../config/publicorder.json";
import { dedupeById, fromTable, groupRows, toReports, type OrderCfg, type Report } from "./gdeltcore";
import { liveNews, slotMs } from "./gdelt";
import { ops } from "./state";

export type AlertKind = "news" | "geo" | "gdacs" | "nws";
export interface Alert {
  id: string; kind: AlertKind; verified: boolean; title: string; place: string; t: number | null; c: [number, number] | null;
  src: string; url: string | null; level?: string; n?: number; links?: string[]; props: Record<string, any>;
}
/** `raw` (news only): the reports out of the public-order filter (gdeltcore relevanceOf) — never on the map, never
 *  counted, listed apart as raw data. */
export interface Feed { items: Alert[]; fetched: number; error?: string; meta?: any; raw?: Alert[] }

const A = OPS.alerts as any;
const cache = new Map<AlertKind, { at: number; p: Promise<Feed> }>();
const TTL: Record<AlertKind, number> = { news: 15 * 60_000, geo: 5 * 60_000, gdacs: 15 * 60_000, nws: 10 * 60_000 };

async function json(url: string, init?: RequestInit) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20_000);
  try { const r = await fetch(url, { ...init, signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}

// NEWS (2026-10-18, D7 option A): GDELT asked by the browser for the chosen window (ops state newsWindow); when GDELT
// cannot be reached or read, the snapshot's published table — an ARCHIVE of one past hour, said as such with its date.
// Both go through the same rules (gdeltcore.ts): categories of the public-order lens, how sure the place is, which rows
// are one report. A feed's meta says which it is: mode "live" (the newest GDELT slot and its time) or "archive".
const REPORT_CTX = (() => {
  const byName = new Map<string, string>();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) {
      const c = String.fromCharCode(a, b), n = dn.of(c);
      if (n && n !== c) byName.set(n.toLowerCase(), c);
    }
  } catch { /* no names: no place is confirmed by its outlet's nation */ }
  for (const [n, c] of Object.entries(ORDER.nationAliases as Record<string, string>)) byName.set(n, c);
  const a2a3 = Object.fromEntries(Object.entries(NEWS.a3a2 as Record<string, string>).map(([a3, a2]) => [a2, a3]));
  return { cfg: ORDER as unknown as OrderCfg, base: NEWS.base as Record<string, string>, roots: OPS.news.roots as Record<string, string>,
    hotRoots: OPS.news.conflict as string[], byName, a2a3, armedRoles: ORDER.armedRoles as string[] };
})();
// the cities NEXUM knows, per nation (the snapshot's places index: settlements with their nation's name), for the
// "another city is named" check; read once, empty when the index cannot be read (the check is then not made)
let gazetteerP: Promise<Map<string, string[]>> | null = null;
function gazetteer(): Promise<Map<string, string[]>> {
  return gazetteerP ??= call<any>("/places-index", undefined, { channel: "places-index-news" }).then((r) => {
    const m = new Map<string, string[]>();
    for (const p of (r.data.places ?? []) as any[]) {
      if (p[1] !== "place.settlement" || !p[6]) continue;
      const a2 = REPORT_CTX.byName.get(String(p[6]).toLowerCase());
      if (!a2) continue;
      const l = m.get(a2) ?? [];
      for (const n of [p[2], ...(p[3] ?? [])]) if (n && !l.includes(n)) l.push(n);
      m.set(a2, l);
    }
    return m;
  }, () => { gazetteerP = null; return new Map<string, string[]>(); });
}

function asAlerts(reps: Report[], mode: "live" | "archive"): Alert[] {
  return reps.map((g) => ({
    id: g.key, kind: "news" as const, verified: false, title: g.title, place: g.place, t: g.t, c: g.c, src: "GDELT", url: g.links[0] ?? null,
    n: g.arts, links: g.links,
    props: { root: g.root, code: g.code, place: g.place, t: new Date(g.first).toISOString().slice(0, 16), added: new Date(g.t).toISOString().slice(0, 16),
      gold: g.gold, n: g.arts, tone: g.tone, url: g.links[0] ?? null, rows: g.rows, quad: g.quad,
      a1c: g.actors[0], a1t: g.actors[1], a1g: g.actors[2], a2c: g.actors[3], a2t: g.actors[4], a2g: g.actors[5],
      sources: g.sources, mentions: g.mentions, links: JSON.stringify(g.links), urls: g.links.length, hosts: g.hosts,
      eids: g.eids.join(" "), hot: g.hot, cats: JSON.stringify(g.cats), rule: g.rule ?? "", codes: JSON.stringify(g.codes),
      geo: g.geo, geo_ok: g.geo === "confirmed", precision: g.precision, same_nation: g.sameNation, named: g.named, nation: g.nation ?? "",
      other_named: JSON.stringify(g.otherNamed), flags: JSON.stringify(g.flags), lang: g.lang ?? "", seen: g.seen ?? "",
      nation_name: g.place.split(",").pop()?.trim() ?? "", city: g.precision === "city" ? g.place.split(",")[0].trim() : "",
      day: g.day, streams: g.streams.join(" "), secondary: g.secondary, mode, relevance: g.relevance, rel_words: JSON.stringify(g.relWords) } }));
}
/** The public-order reports, and the raw data apart. */
const split = (xs: Alert[]) => ({ items: xs.filter((x) => x.props.relevance !== "raw"), raw: xs.filter((x) => x.props.relevance === "raw") });

// 1 hour by default: the density of points the map had (a longer window is the person's choice, its size said)
let newsHours = 1;
/** The window of the news feed (hours): a new choice is downloaded at the next request. */
export function setNewsWindow(h: number) { if (h !== newsHours) { newsHours = h; cache.delete("news"); } }
export const newsWindow = () => newsHours;

async function news(): Promise<Feed> {
  const f = await loadNews();
  const m = f.meta ?? {};
  ops.set({ newsStatus: { mode: m.mode, latestMs: m.latest_ms ?? null, from: m.notes?.from ?? null, to: m.notes?.to ?? null, hours: m.hours ?? newsHours,
    error: m.mode === "archive" ? m.liveError ?? null
      : [m.files?.failed ? `${m.files.failed} file su ${m.files.total} non scaricati` : "", ...(m.errors ?? []).filter((e: string) => e.startsWith("flusso"))].filter(Boolean).join(" · ") || null,
    files: m.files ?? null, bytes: m.bytes ?? null, fetched: f.fetched } });
  return f;
}
async function loadNews(): Promise<Feed> {
  let liveError: string | null = null;
  try {
    const L = await liveNews(newsHours);
    const rows = dedupeById(L.rows);
    const items = asAlerts(toReports(groupRows(rows), L.links, { ...REPORT_CTX, gazetteer: await gazetteer(), meta: L.meta }), "live");
    const added = rows.map((r) => r.added).sort();
    return { ...split(items), fetched: L.fetched, meta: { mode: "live", table: null, source_id: "gdelt.events", attribution: ORDER.attribution, license_id: "gdelt-open",
      fetched_ms: L.fetched, latest: L.latest, latest_ms: Math.max(slotMs(L.latest.en) ?? 0, slotMs(L.latest.tr) ?? 0) || null, hours: newsHours,
      files: L.files, bytes: L.bytes, errors: L.errors.slice(0, 6), notes: { from: added[0] ?? null, to: added.at(-1) ?? null, mentions: true } } };
  } catch (e: any) { liveError = String(e?.message ?? e); }
  // the archive: the snapshot's table (one past hour), never presented as current
  const r = await call<any>("/tables/newsevents", undefined, { channel: "newsevents-feed" });
  const d = r.data, F = d.fields as string[];
  const rows = (d.rows as any[]).map((x) => fromTable(F, x));
  const links = new Map<string, string[]>();
  const LI = F.indexOf("links");
  if (LI >= 0) (d.rows as any[]).forEach((x, i) => { if (Array.isArray(x[LI])) links.set(rows[i].id, x[LI]); });
  const items = asAlerts(toReports(groupRows(rows), links, { ...REPORT_CTX, gazetteer: await gazetteer() }), "archive");
  return { ...split(items), fetched: d.fetched_ms ?? Date.now(), meta: { ...d, mode: "archive", liveError, latest_ms: d.fetched_ms ?? null } };
}
async function geoEvents(): Promise<Feed> {
  const d = await json(A.geoFeed);
  return { fetched: Date.now(), meta: { attribution: A.geoCredit, license_id: "public-domain", generated: d.metadata?.generated },
    items: (d.features as any[]).map((f) => { const p = f.properties;
      return { id: `geo:${f.id}`, kind: "geo" as const, verified: true, title: `M ${Number(p.mag).toFixed(1)}`, place: p.place ?? "", t: p.time,
        c: [f.geometry.coordinates[0], f.geometry.coordinates[1]] as [number, number], src: A.names.geo, url: p.url ?? null, level: p.alert ?? undefined,
        props: { qid: f.id, mag: p.mag, place: p.place, time: p.time, depth: f.geometry.coordinates[2], tsunami: p.tsunami, felt: p.felt, alert: p.alert,
          sig: p.sig, status: p.status, url: p.url, magType: p.magType } }; }) };
}
async function gdacs(): Promise<Feed> {
  const d = await json(A.gdacs), F = A.gdacsFields as Record<string, string>, types = A.gdacsTypes as Record<string, string>;
  return { fetched: Date.now(), meta: { attribution: A.gdacsCredit },
    items: ((d.features ?? []) as any[]).map((f, i) => { const p = f.properties ?? {};
      return { id: `gdacs:${p.eventid ?? i}`, kind: "gdacs" as const, verified: true, title: `${types[p[F.type]] ?? p[F.type]} · ${p[F.name] ?? ""}`, place: p[F.place] ?? "",
        t: p[F.from] ? Date.parse(p[F.from]) : null, c: f.geometry?.coordinates?.slice(0, 2) ?? null, src: "GDACS", url: p[F.links]?.report ?? null,
        level: String(p[F.level] ?? ""), props: { type: types[p[F.type]] ?? p[F.type], name: p[F.name], place: p[F.place], level: p[F.level],
          from: p[F.from], to: p.todate, severity: p[F.severity]?.severitytext, url: p[F.links]?.report } }; }) };
}
async function nws(): Promise<Feed> {
  const d = await json(A.nws, { headers: { Accept: "application/geo+json" } });
  const centre = (g: any): [number, number] | null => {
    const ring = g?.type === "Polygon" ? g.coordinates[0] : g?.type === "MultiPolygon" ? g.coordinates[0][0] : null;
    if (!ring) return null;
    const s = ring.reduce((a: number[], p: number[]) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  };
  return { fetched: Date.now(), meta: { attribution: A.nwsCredit },
    items: ((d.features ?? []) as any[]).map((f) => { const p = f.properties;
      return { id: `nws:${f.id}`, kind: "nws" as const, verified: true, title: p.event, place: p.areaDesc ?? "", t: p.sent ? Date.parse(p.sent) : null,
        c: centre(f.geometry), src: "NWS", url: p["@id"] ?? null, level: p.severity,
        props: { event: p.event, area: p.areaDesc, severity: p.severity, urgency: p.urgency, certainty: p.certainty, sent: p.sent, expires: p.expires, headline: p.headline, url: p["@id"] } }; }) };
}
const LOAD: Record<AlertKind, () => Promise<Feed>> = { news, geo: geoEvents, gdacs, nws };

/** One source's items (one request per refresh period, shared by the panel and the map). */
export function feed(k: AlertKind, fresh = false): Promise<Feed> {
  const c = cache.get(k);
  if (!fresh && c && Date.now() - c.at < TTL[k]) return c.p;
  const p = LOAD[k]().catch((e) => ({ items: [], fetched: Date.now(), error: String(e?.message ?? e) }));
  cache.set(k, { at: Date.now(), p });
  return p;
}
export const KINDS: AlertKind[] = ["geo", "gdacs", "nws", "news"];
export const SOURCE_NAME = A.names as Record<AlertKind, string>;
