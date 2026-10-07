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

export type AlertKind = "news" | "geo" | "gdacs" | "nws";
export interface Alert {
  id: string; kind: AlertKind; verified: boolean; title: string; place: string; t: number | null; c: [number, number] | null;
  src: string; url: string | null; level?: string; n?: number; links?: string[]; props: Record<string, any>;
}
export interface Feed { items: Alert[]; fetched: number; error?: string; meta?: any }

const A = OPS.alerts as any;
const cache = new Map<AlertKind, { at: number; p: Promise<Feed> }>();
const TTL: Record<AlertKind, number> = { news: 15 * 60_000, geo: 5 * 60_000, gdacs: 15 * 60_000, nws: 10 * 60_000 };

async function json(url: string, init?: RequestInit) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20_000);
  try { const r = await fetch(url, { ...init, signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function news(): Promise<Feed> {
  const r = await call<any>("/tables/newsevents", undefined, { channel: "newsevents-feed" });
  const d = r.data, roots = OPS.news.roots as Record<string, string>, groups = new Map<string, Alert>();
  const F = d.fields as string[], at = (x: any[], f: string) => { const i = F.indexOf(f); return i < 0 ? null : x[i]; };
  const ACT = F.findIndex((f) => f.startsWith("actor"));   // the six actor codes, in the table's order (1: where/role/group, 2: same)
  for (const x of d.rows as any[]) {
    const [lon, lat, root, code, place, added, gold, arts, tone, url] = x;
    // ONE EVENT (2026-10-06, physical acceptance): rows are the same event only when GDELT coded the same action (full
    // CAMEO code) at the same place (its feature id) between the same actors (their codes) in the same hour —
    // never merely because they are near each other or of the same broad kind
    const actors = [0, 1, 2, 3, 4, 5].map((i) => (F[ACT + i]?.startsWith("actor") ? x[ACT + i] ?? "" : ""));
    const k = [code, at(x, "feature_id") || String(place).toLowerCase(), ...actors].join("|");
    const links: string[] = Array.isArray(at(x, "links")) ? at(x, "links") : url ? [url] : [];
    const g = groups.get(k);
    const t = Date.parse(`${added}:00Z`);
    if (g) {
      g.n = (g.n ?? 0) + arts; g.props.rows += 1; g.props.sources += Number(at(x, "sources") ?? 0); g.props.tones.push(tone);
      for (const u of links) if (u && !g.links!.includes(u)) g.links!.push(u);
      g.props.eids.push(at(x, "event_id"));
      if (t > (g.t ?? 0)) g.t = t;
      continue;
    }
    groups.set(k, { id: `news:${k}`, kind: "news", verified: false, title: (NEWS.base as Record<string, string>)[String(code).slice(0, 3)] ?? roots[root] ?? `CAMEO ${root}`, place, t, c: [lon, lat],
      src: "GDELT", url, n: arts, links: [...links], props: { root, code, place, t: added, gold, n: arts, tone, url, rows: 1,
        quad: at(x, "quad"), a1c: actors[0], a1t: actors[1], a1g: actors[2], a2c: actors[3], a2t: actors[4], a2g: actors[5],
        sources: Number(at(x, "sources") ?? 0), mentions: Number(at(x, "mentions") ?? 0), tones: [tone], eids: [at(x, "event_id")],
        hot: (OPS.news.conflict as string[]).includes(root) } });
  }
  const items = [...groups.values()];
  for (const g of items) {
    const p = g.props;
    p.n = g.n; p.links = JSON.stringify(g.links!.slice(0, 12)); p.urls = g.links!.length; p.hosts = [...new Set(g.links!.map(host))].length;
    p.tone = Math.round((p.tones as number[]).reduce((s, v) => s + v, 0) / p.tones.length * 10) / 10;
    p.added = g.t != null ? new Date(g.t).toISOString().slice(0, 16) : p.t;
    p.eids = (p.eids as any[]).filter(Boolean).join(" "); delete p.tones;
  }
  return { items, fetched: d.fetched_ms ?? Date.now(), meta: d };
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
