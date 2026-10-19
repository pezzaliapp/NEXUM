// GDELT IN THE BROWSER (2026-10-18, decision D7 option A, author's GO for local development): the pure part — the
// "last update" lists, the 15-minute slots, the zip of each export, its rows, what category of action each code is,
// how sure the place is, and which rows are one report. No network, no DOM: tested with real GDELT files
// (tests/unit/gdelt.test.ts). The configuration (categories, rules, labels) is passed in: ui/src/config/publicorder.json.
//
// Everything here is GDELT's own coding of what the news reported. Nothing is inferred beyond the declared rules: a
// category is a set of CAMEO codes; a place is the one GDELT assigned (never another city named by the same article);
// two rows are one report only when they come from the same article and place, or when GDELT coded the same action
// (full code) at the same place between the same actors in the same hour (the rule accepted on 2026-10-06).

export type Stream = "en" | "tr" | "snap";
/** How sure the place is (2026-10-18, review): CONFIRMED by evidence; UNCONFIRMED — assigned by GDELT, nothing confirms it
 *  (or only a region / nation centre); AMBIGUOUS — the article's own address names another city of the same nation. */
export type GeoLevel = "confirmed" | "unconfirmed" | "ambiguous";
export type GeoPrecision = "city" | "region" | "nation";

/** One row of a GDELT 2.0 events export, only the fields NEXUM shows (actors as codes: never a name). */
export interface GRow {
  id: string; day: string; added: string; code: string; root: string; quad: string; gold: number; ment: number; srcs: number;
  arts: number; tone: number; a1c: string; a1t: string; a1g: string; a2c: string; a2t: string; a2g: string;
  geoType: number; place: string; fips: string; feature: string; lon: number; lat: number; url: string; isRoot: boolean; stream: Stream;
}

export interface CategoryCfg { id: string; label: string; short: string; codes: string[]; note: string }
export interface OrderCfg {
  categories: CategoryCfg[];
  /** public-order words of an article's address (relevance of a report with a generic code) */
  relevance?: { words: string[] };
  civilForce: { id: string; rule: string; policeRoles: string[]; crowdRoles: string[] };
  subcodes: Record<string, string>;
}

// ── the "last update" lists and the slots ──
/** lastupdate.txt / lastupdate-translation.txt: "size md5 url" lines → the slot (YYYYMMDDHHMMSS) and the https URL of
 *  each file kind ("export", "mentions", "gkg"). GDELT lists http:// URLs: the browser asks the same files over https. */
export function parseLastUpdate(text: string): { slot: string; urls: Record<string, string> } | null {
  let slot = "";
  const urls: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const u = line.trim().split(/\s+/)[2];
    const m = u?.match(/\/(\d{14})\.(?:translation\.)?(export|mentions|gkg)\.csv\.zip$/i);
    if (!m) continue;
    slot = slot || m[1];
    urls[m[2].toLowerCase()] = u.replace(/^http:\/\//, "https://");
  }
  return slot ? { slot, urls } : null;
}

const slotMs = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
export const slotTime = slotMs;
const fmtSlot = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);

/** The n slots ending at `latest` (newest first), 15 minutes apart. */
export function slotsBack(latest: string, n: number): string[] {
  const t = slotMs(latest);
  return Array.from({ length: n }, (_, i) => fmtSlot(t - i * 900_000));
}

export function fileUrl(slot: string, stream: "en" | "tr", kind: "export" | "mentions"): string {
  return `https://data.gdeltproject.org/gdeltv2/${slot}.${stream === "tr" ? "translation." : ""}${kind}.CSV.zip`;
}

// ── the zip of one export (one file, deflated) ──
/** The first file of a zip archive, inflated by `inflate` (the browser's DecompressionStream("deflate-raw")). Sizes are
 *  read from the central directory (GDELT's zips may put them after the data). */
export async function unzipFirst(buf: ArrayBuffer, inflate: (b: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const v = new DataView(buf), u = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("zip: no end of central directory");
  const cd = v.getUint32(eocd + 16, true);
  if (v.getUint32(cd, true) !== 0x02014b50) throw new Error("zip: bad central directory");
  const method = v.getUint16(cd + 10, true), csize = v.getUint32(cd + 20, true), local = v.getUint32(cd + 42, true);
  if (v.getUint32(local, true) !== 0x04034b50) throw new Error("zip: bad local header");
  const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  const data = u.subarray(start, start + csize);
  if (method === 0) return data;
  if (method !== 8) throw new Error(`zip: method ${method}`);
  return inflate(data);
}

// ── rows ──
const num = (s: string) => { const x = Number(s); return Number.isFinite(x) ? x : 0; };

/** The rows of an events export with a place (lat/lon), as GRow; `keep` chooses which (by code and root flag) before
 *  anything else is built, so a long window costs only the rows it keeps. */
export function parseExport(text: string, stream: Stream, keep: (code: string, isRoot: boolean) => boolean): GRow[] {
  const out: GRow[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const r = line.split("\t");
    if (r.length < 61 || !r[56] || !r[57]) continue;
    const isRoot = r[25] === "1";
    if (!keep(r[26], isRoot)) continue;
    const lat = Number(r[56]), lon = Number(r[57]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const a = r[59];
    out.push({ id: r[0], day: r[1], added: `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}T${a.slice(8, 10)}:${a.slice(10, 12)}`,
      code: r[26], root: r[28], quad: r[29], gold: num(r[30]), ment: num(r[31]), srcs: num(r[32]), arts: num(r[33]),
      tone: Math.round(num(r[34]) * 10) / 10, a1c: r[7], a1t: r[12], a1g: r[8], a2c: r[17], a2t: r[22], a2g: r[18],
      geoType: num(r[51]), place: r[52], fips: r[53], feature: r[58], lon: Math.round(lon * 1000) / 1000, lat: Math.round(lat * 1000) / 1000,
      url: r[60] ?? "", isRoot, stream });
  }
  return out;
}

/** A mentions export: the web articles (mention type 1) that reported each event, in GDELT's order. */
export interface MentionMeta { lang: string | null; seen: string | null }
/** `meta` (when given) gets, for each article address, the language GDELT says it was translated from (translingual
 *  stream, "srclc:por" → "por") and when GDELT saw it (MentionTimeDate). */
export function parseMentions(text: string, ids: Set<string>, max = 8, meta?: Map<string, MentionMeta>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    const m = line.split("\t");
    if (m.length < 6 || m[3] !== "1" || !ids.has(m[0])) continue;
    if (meta && !meta.has(m[5])) {
      const t = m[2] ?? "", lc = (m[14] ?? "").match(/srclc:([a-z]{3})/)?.[1] ?? null;
      meta.set(m[5], { lang: lc, seen: /^\d{12}/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}` : null });
    }
    const l = out.get(m[0]) ?? [];
    if (l.length < max && !l.includes(m[5])) l.push(m[5]);
    out.set(m[0], l);
  }
  return out;
}

// ── categories ──
/** The category of one row: the category whose codes hold its full code (else its 3-digit base); 19x becomes "riot"
 *  only by the declared rule (police against protesters, workers, students or civilians of the same nation). null: not an action of the public-order lens. */
export function categoryOf(r: Pick<GRow, "code" | "a1c" | "a1t" | "a2c" | "a2t">, nationA3: string | null, cfg: OrderCfg): { cat: string; rule: string | null } | null {
  const hit = (c: string) => cfg.categories.find((k) => k.codes.includes(c));
  const k = hit(r.code) ?? hit(r.code.slice(0, 3));
  if (!k) return null;
  if (k.id === "armed" && r.code.startsWith("19")) {
    const cf = cfg.civilForce, [x, y] = [r.a1t, r.a2t];
    const pair = (a: string, b: string) => cf.policeRoles.includes(a) && cf.crowdRoles.includes(b);
    const domestic = !!nationA3 && [r.a1c, r.a2c].every((c) => !c || c === nationA3);
    if (x && y && (pair(x, y) || pair(y, x)) && domestic) return { cat: "riot", rule: cf.id };
  }
  return { cat: k.id, rule: null };
}

/** The description of a code: the 4-digit sub-code's own when declared, else the 3-digit base's. */
export function codeLabel(code: string, base: Record<string, string>, cfg: OrderCfg): string {
  return cfg.subcodes[code] ?? base[code.slice(0, 3)] ?? `CAMEO ${code}`;
}

// ── how sure the place is ──
/** The national top-level domain of an address (uk → GB), or null for a generic one (.com, .org, .news…). */
export function ccTld(u: string): string | null {
  try {
    const last = new URL(u).hostname.split(".").pop() ?? "";
    return /^[a-z]{2}$/.test(last) ? (last === "uk" ? "GB" : last.toUpperCase()) : null;
  } catch { return null; }
}
export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** GDELT's geographic type: 1 nation, 2 US state, 3 US city, 4 world city, 5 world region. A city is CONFIRMED only when
 *  BOTH checks pass and nothing contradicts them: an outlet of the same nation reports it (its address's national
 *  domain: a "Rome" reported only by .com outlets may be Rome, New York), the article's own address names the city
 *  (GDELT often places articles about one city in the best known city of the nation: on 2026-10-17 every article about
 *  Turin, Bologna or Bergamo was placed in Milan, Rome, a region or the nation), and that address names NO other city of
 *  the nation known to NEXUM (`others`, from the places index) — else AMBIGUOUS. A region or nation centre is never a
 *  confirmed city. Never is an event moved to the other city named. */
export function geoChecks(geoType: number, links: string[], nationA2: string | null, place: string, own: string[] = links, others: string[] = []):
    { level: GeoLevel; precision: GeoPrecision; sameNation: boolean; named: boolean; otherNamed: string[] } {
  const precision: GeoPrecision = geoType === 1 ? "nation" : geoType === 2 || geoType === 5 ? "region" : "city";
  const sameNation = !!nationA2 && links.some((u) => ccTld(u) === nationA2);
  const named = own.some((u) => namesPlace(u, place));     // the article GDELT coded the action from (not the other mentions)
  const mine = place.split(",")[0] ?? "";
  // another city: its exact name among the address's words (no near spelling: "sassi" is not Sassari)
  const otherNamed = others.filter((n) => n.length >= 5 && !namesPlace(`https://x/${n}`, mine) && own.some((u) => namesExactly(u, n)));
  const level: GeoLevel = otherNamed.length ? "ambiguous" : precision === "city" && sameNation && named ? "confirmed" : "unconfirmed";
  return { level, precision, sameNation, named, otherNamed };
}
export function geoLevel(geoType: number, links: string[], nationA2: string | null, place = "", others: string[] = []): GeoLevel {
  return geoChecks(geoType, links, nationA2, place, links, others).level;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
/** The address (host and path) names the place's first part (e.g. "Milan" in …/scontri-a-milano-…): the same word, or
 *  the same name in another spelling (same first three letters, one letter apart; two for names longer than five). */
export function namesExactly(u: string, name: string): boolean {
  let words: string[];
  try { const x = new URL(u); words = fold(`${x.hostname} ${decodeURIComponent(x.pathname)}`).split(/[^\p{L}]+/u).filter(Boolean); } catch { return false; }
  const n = fold(name).split(/[^\p{L}]+/u).filter(Boolean);
  return n.length > 0 && words.some((_, i) => n.every((w, j) => words[i + j] === w));
}
export function namesPlace(u: string, place: string): boolean {
  let words: string[];
  try { const x = new URL(u); words = fold(`${x.hostname} ${decodeURIComponent(x.pathname)}`).split(/[^\p{L}]+/u).filter(Boolean); } catch { return false; }
  const name = fold(place.split(",")[0] ?? "").split(/[^\p{L}]+/u).filter(Boolean);
  if (!name.length) return false;
  const like = (w: string, n: string) => w === n || (n.length >= 4 && w.slice(0, 3) === n.slice(0, 3) && Math.abs(w.length - n.length) <= 2
    && lev(w, n) <= (n.length > 5 ? 2 : 1));
  return name.every((n) => words.some((w) => like(w, n)) || words.some((w) => w.includes(n) && n.length >= 5));
}

/** The nation a GDELT place names (its last part, in English), through a name → ISO 3166 alpha-2 table. */
export function nationOfPlace(place: string, byName: Map<string, string>): string | null {
  const last = place.split(",").pop()?.trim().toLowerCase() ?? "";
  return byName.get(last) ?? null;
}

// ── which reports are public-order news ──
/** ORDER: a code of the public-order categories; ADDRESS: a generic code, but the address of an article GDELT coded the
 *  action from has a public-order word (whole word, accents ignored); RAW: neither (a statement, an appeal, a
 *  negotiation… about anything) — kept apart as raw data. Only GDELT's own fields: the article's text is never read. */
export type Relevance = "order" | "address" | "raw";
export function addressWords(urls: string[], words: string[]): string[] {
  const want = new Set(words.map(fold)), out: string[] = [];
  for (const u of urls) {
    let ws: string[];
    try { const x = new URL(u); ws = fold(`${x.hostname} ${decodeURIComponent(x.pathname)}`).split(/[^\p{L}]+/u); } catch { continue; }
    for (const w of ws) if (want.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}
export function relevanceOf(cats: string[], own: string[], cfg: OrderCfg): { relevance: Relevance; words: string[] } {
  if (cats.length) return { relevance: "order", words: [] };
  const words = addressWords(own, cfg.relevance?.words ?? []);
  return { relevance: words.length ? "address" : "raw", words };
}

// ── which rows are one report ──
const hourOf = (added: string) => added.slice(0, 13);
const placeKey = (r: GRow) => r.feature || r.place.toLowerCase();

/** Rows → groups (one report each): same article at the same place, or GDELT's same action (full code) at the same
 *  place between the same actors in the same hour. Never merely the same day, place or code. */
export function groupRows(rows: GRow[]): GRow[][] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[y] = x; };
  const byArticle = new Map<string, number>(), byAction = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.url) { const k = `${r.url}|${placeKey(r)}`; const j = byArticle.get(k); if (j == null) byArticle.set(k, i); else join(j, i); }
    const k = [r.code, placeKey(r), r.a1c, r.a1t, r.a1g, r.a2c, r.a2t, r.a2g, hourOf(r.added)].join("|");
    const j = byAction.get(k); if (j == null) byAction.set(k, i); else join(j, i);
  });
  const out = new Map<number, GRow[]>();
  rows.forEach((r, i) => { const g = find(i); const l = out.get(g); if (l) l.push(r); else out.set(g, [r]); });
  return [...out.values()];
}

/** Rows of a later download replace nothing: an event is one GDELT event id, whatever the slot or stream. */
export function dedupeById(rows: GRow[]): GRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(`${r.stream}:${r.id}`) && !!seen.add(`${r.stream}:${r.id}`));
}

// ── one report per group ──
export interface Report {
  key: string; title: string; cats: string[]; rule: string | null; codes: [string, string, number][];
  place: string; c: [number, number]; geo: GeoLevel; precision: GeoPrecision; sameNation: boolean; named: boolean; otherNamed: string[]; feature: string; nation: string | null;
  lang: string | null; seen: string | null; flags: string[];
  t: number; first: number; day: string; links: string[]; hosts: number;
  rows: number; arts: number; sources: number; mentions: number; tone: number; gold: number; quad: string; root: string; code: string;
  actors: string[]; eids: string[]; streams: Stream[]; secondary: boolean; hot: boolean;
  /** public-order news (a code of the lens), a generic code with a public-order address, or raw data */
  relevance: Relevance; relWords: string[];
}
export interface ReportCtx {
  cfg: OrderCfg; base: Record<string, string>; roots: Record<string, string>; hotRoots: string[];
  byName: Map<string, string>; a2a3: Record<string, string>;
  /** the cities NEXUM knows per nation (ISO 3166 alpha-2 → names), from the places index; empty: no contradiction check */
  gazetteer?: Map<string, string[]>; meta?: Map<string, MentionMeta>; armedRoles?: string[];
}

const ms = (added: string) => Date.parse(`${added}:00Z`);

/** The groups of rows as reports: the categories of all their codes (in the configuration's order), every original
 *  code with its description and how many rows carry it, the place GDELT assigned and how sure it is, the event date
 *  GDELT gives (its DAY field), when GDELT first and last added a row, the articles (each row's own, then the mentions'). */
export function toReports(groups: GRow[][], links: Map<string, string[]>, ctx: ReportCtx): Report[] {
  const order = ctx.cfg.categories.map((c) => c.id);
  return groups.map((g) => {
    const nation = nationOfPlace(g[0].place, ctx.byName);
    const nationA3 = nation ? ctx.a2a3[nation] ?? null : null;
    const cats = new Set<string>(); let rule: string | null = null;
    const codes = new Map<string, number>();
    for (const r of g) {
      const k = categoryOf(r, nationA3, ctx.cfg);
      if (k) { cats.add(k.cat); rule = rule ?? k.rule; }
      codes.set(r.code, (codes.get(r.code) ?? 0) + 1);
    }
    const lensRows = g.filter((r) => categoryOf(r, nationA3, ctx.cfg));
    const rep = [...(lensRows.length ? lensRows : g)].sort((a, b) => b.arts - a.arts)[0];
    const urls: string[] = [];
    for (const r of g) for (const u of [r.url, ...(links.get(r.id) ?? [])]) if (u && !urls.includes(u)) urls.push(u);
    const catList = order.filter((c) => cats.has(c));
    const label = (id: string) => ctx.cfg.categories.find((c) => c.id === id)!.label;
    const times = g.map((r) => ms(r.added)).filter(Number.isFinite);
    const own = g.map((r) => r.url).filter(Boolean);
    const gc = geoChecks(rep.geoType, urls, nation, rep.place, own, (nation && ctx.gazetteer?.get(nation)) || []);
    // what the codes cannot settle, said (never resolved by guessing)
    const armed = ctx.armedRoles ?? [];
    const flags: string[] = [];
    if (g.some((r) => /^(19|20)/.test(r.code) && ![r.a1t, r.a2t].some((x) => armed.includes(x)))) flags.push("force-no-armed");
    if (catList.includes("protest") && catList.some((c) => c !== "protest" && c !== "enforcement")) flags.push("mixed");
    if (g.every((r) => !r.isRoot)) flags.push("secondary");
    if (gc.otherNamed.length) flags.push("other-city");
    const m0 = own.map((u) => ctx.meta?.get(u)).find(Boolean);
    const rel = relevanceOf(catList, own, ctx.cfg);
    return {
      key: `news:${rep.stream}:${rep.id}`,
      title: catList.length ? catList.map(label).join(" · ") : (ctx.base[rep.code.slice(0, 3)] ?? ctx.roots[rep.root] ?? `CAMEO ${rep.root}`),
      cats: catList, rule,
      codes: [...codes].map(([c, n]) => [c, codeLabel(c, ctx.base, ctx.cfg), n] as [string, string, number]),
      place: rep.place, c: [rep.lon, rep.lat], geo: gc.level, precision: gc.precision, sameNation: gc.sameNation, named: gc.named, otherNamed: gc.otherNamed, feature: rep.feature, nation,
      t: Math.max(...times), first: Math.min(...times), day: rep.day, links: urls.slice(0, 12), hosts: new Set(urls.map(hostOf).filter(Boolean)).size,
      rows: g.length, arts: g.reduce((s, r) => s + r.arts, 0), sources: g.reduce((s, r) => s + r.srcs, 0), mentions: g.reduce((s, r) => s + r.ment, 0),
      tone: Math.round(g.reduce((s, r) => s + r.tone, 0) / g.length * 10) / 10, gold: rep.gold, quad: rep.quad, root: rep.root, code: rep.code,
      actors: [rep.a1c, rep.a1t, rep.a1g, rep.a2c, rep.a2t, rep.a2g], eids: g.map((r) => r.id),
      streams: [...new Set(g.map((r) => r.stream))], secondary: g.every((r) => !r.isRoot),
      lang: m0?.lang ?? (g.some((r) => r.stream === "en") ? "eng" : null), seen: m0?.seen ?? null, flags,
      hot: catList.length > 0 || ctx.hotRoots.includes(rep.root),
      relevance: rel.relevance, relWords: rel.words,
    };
  });
}

/** A row of the snapshot's published table (the archive) as a GRow: the table keeps root events only, has no geographic
 *  type (read from the place's parts: nation / region / city) and no event date. */
export function fromTable(fields: string[], x: any[]): GRow {
  const at = (f: string) => { const i = fields.indexOf(f); return i < 0 ? null : x[i]; };
  const place = String(at("place") ?? ""), parts = place.split(",").length;
  return { id: String(at("event_id") ?? ""), day: "", added: String(at("added_utc") ?? ""), code: String(at("code") ?? ""), root: String(at("root") ?? ""),
    quad: String(at("quad") ?? ""), gold: Number(at("goldstein") ?? 0), ment: Number(at("mentions") ?? 0), srcs: Number(at("sources") ?? 0),
    arts: Number(at("articles") ?? 0), tone: Number(at("tone") ?? 0), a1c: at("actor1_country") ?? "", a1t: at("actor1_role") ?? "", a1g: at("actor1_group") ?? "",
    a2c: at("actor2_country") ?? "", a2t: at("actor2_role") ?? "", a2g: at("actor2_group") ?? "",
    geoType: parts <= 1 ? 1 : parts === 2 ? 5 : 4, place, fips: "", feature: String(at("feature_id") ?? ""),
    lon: Number(at("lon")), lat: Number(at("lat")), url: String(at("url") ?? ""), isRoot: true, stream: "snap" };
}
