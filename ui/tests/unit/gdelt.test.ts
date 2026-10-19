// GDELT IN THE BROWSER (2026-10-18): the control cases of the author's GO, on REAL GDELT files of 17 October 2026
// (tests/fixtures/gdelt-20261017, unmodified) — what is in them is asserted, what is not is asserted as absent. Nothing
// here is invented to make a case pass: where GDELT has no evidence (Turin, Bologna, Bergamo as places) the test says so.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { addressWords, categoryOf, dedupeById, fileUrl, fromTable, geoChecks, groupRows, namesPlace, parseExport, parseLastUpdate, parseMentions,
  slotsBack, toReports, unzipFirst, type GRow, type OrderCfg, type Report } from "../../src/ops/gdeltcore.ts";
import { newsState } from "../../src/ops/newsstatus.ts";
import { filterNews, nationGroups } from "../../src/ops/newsmap.ts";
import { ccTld as ccTldOf } from "../../src/ops/gdeltcore.ts";

const FX = new URL("../fixtures/gdelt-20261017/", import.meta.url);
const CFG = JSON.parse(fs.readFileSync(new URL("../../src/config/publicorder.json", import.meta.url), "utf8")) as OrderCfg & Record<string, any>;
const NEWS = JSON.parse(fs.readFileSync(new URL("../../src/config/news.json", import.meta.url), "utf8"));
const OPS = JSON.parse(fs.readFileSync(new URL("../../src/config/ops.json", import.meta.url), "utf8"));

// the browser's own inflater (DecompressionStream "deflate-raw"), as in src/ops/gdelt.ts
async function inflate(b: Uint8Array) {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function text(name: string) {
  const buf = fs.readFileSync(new URL(name, FX));
  return new TextDecoder().decode(await unzipFirst(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), inflate));
}
const byName = (() => {
  const m = new Map<string, string>(), dn = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const c = String.fromCharCode(a, b), n = dn.of(c); if (n && n !== c) m.set(n.toLowerCase(), c); }
  for (const [n, c] of Object.entries(CFG.nationAliases as Record<string, string>)) m.set(n, c);
  return m;
})();
// the Italian cities of NEXUM's places index (snapshot live-949, settlements with nation "Italy"), as the browser reads them
const IT = ["Ancona", "Arezzo", "Asti", "Bari", "Barletta", "Benevento", "Bergamo", "Bologna", "Bolzano", "Brindisi", "Cagliari", "Campobasso", "Caserta",
  "Catania", "Catanzaro", "Civitavecchia", "Como", "Crotone", "Ferrara", "Florence", "Foggia", "Genoa", "L'Aquila", "Lecce", "Livorno", "Marsala", "Messina",
  "Milan", "Modena", "Naples", "Novara", "Palermo", "Parma", "Perugia", "Pescara", "Pisa", "Potenza", "Ragusa", "Ravenna", "Reggio di Calabria", "Rome",
  "Salerno", "Sassari", "Siena", "Siracusa", "Taranto", "Trento", "Treviso", "Trieste", "Turin", "Udine", "Venice", "Verona"];
const CTX = { cfg: CFG, base: NEWS.base, roots: OPS.news.roots, hotRoots: OPS.news.conflict, byName, armedRoles: CFG.armedRoles as string[],
  gazetteer: new Map([["IT", IT]]), a2a3: Object.fromEntries(Object.entries(NEWS.a3a2 as Record<string, string>).map(([a3, a2]) => [a2, a3])) };

const lensKeep = (c: string) => CFG.categories.some((k) => k.codes.includes(c) || k.codes.includes(c.slice(0, 3)));
let ALL: { rows: GRow[]; links: Map<string, string[]>; reports: Report[] } | null = null;
async function all() {
  if (ALL) return ALL;
  const files = fs.readdirSync(FX).filter((f) => f.includes(".export."));
  const rows: GRow[] = [];
  for (const f of files) rows.push(...parseExport(await text(f), f.includes("translation") ? "tr" : "en", (c, root) => root || lensKeep(c)));
  const ids = new Set(rows.map((r) => r.id)), links = new Map<string, string[]>();
  const meta = new Map();
  for (const f of fs.readdirSync(FX).filter((f) => f.includes(".mentions."))) parseMentions(await text(f), ids, 8, meta).forEach((v, k) => links.set(k, v));
  const uniq = dedupeById(rows);
  ALL = { rows: uniq, links, reports: toReports(groupRows(uniq), links, { ...CTX, meta }) };
  return ALL;
}
// the reports whose OWN article (the address GDELT coded them from: the first link) is this one
const at = (reps: Report[], url: string) => reps.filter((r) => (r.links[0] ?? "").includes(url));

test("last update lists: slot and https URLs (GDELT lists http://)", () => {
  const l = parseLastUpdate(fs.readFileSync(new URL("lastupdate.txt", FX), "utf8"))!;
  assert.equal(l.slot, "20261017191500");
  assert.equal(l.urls.export, "https://data.gdeltproject.org/gdeltv2/20261017191500.export.CSV.zip");
  assert.equal(parseLastUpdate(fs.readFileSync(new URL("lastupdate-translation.txt", FX), "utf8"))!.urls.export,
    "https://data.gdeltproject.org/gdeltv2/20261017181500.translation.export.CSV.zip");
  assert.equal(parseLastUpdate("<html>not found</html>"), null);
  assert.deepEqual(slotsBack("20261017000000", 3), ["20261017000000", "20261016234500", "20261016233000"]);
  assert.equal(fileUrl("20261017181500", "tr", "mentions"), "https://data.gdeltproject.org/gdeltv2/20261017181500.translation.mentions.CSV.zip");
});

test("a real export unzips with the browser's inflater and parses (61 columns, places only)", async () => {
  const rows = parseExport(await text("20261017191500.export.CSV.zip"), "en", () => true);
  assert.ok(rows.length > 300, `${rows.length}`);
  assert.ok(rows.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(r.added)));
  await assert.rejects(unzipFirst(new ArrayBuffer(10), inflate), /zip/);
});

test("case 1 · Milan, 17 October: clashes reported, as GDELT coded them, with the original codes", async () => {
  const { reports } = await all();
  const milan = reports.filter((r) => r.place.startsWith("Milan"));
  const riot = milan.filter((r) => r.cats.includes("riot"));
  assert.ok(riot.length >= 3, `riot reports at Milan: ${riot.length}`);
  // the Italian article "Guerriglia in Duomo a Milano": CAMEO 145, the city confirmed (Italian outlet, named in the address)
  const duomo = at(milan, "guerriglia-in-duomo-a-milano")[0];
  assert.ok(duomo.codes.some(([c]) => c === "145"), JSON.stringify(duomo.codes));
  assert.equal(duomo.geo, "confirmed");
  assert.deepEqual(duomo.streams, ["tr"]);
  // the English article coded 190 (military force) between "Italy" (no role) and the opposition: the 19x rule needs a
  // role for both actors, so it stays "armed force" — with its original codes — and the city stays unconfirmed (.com)
  const whbl = at(milan, "whbl.com/2026/10/17/italian-police-clash")[0];
  assert.ok(whbl.cats.includes("armed") && whbl.rule === null, JSON.stringify([whbl.cats, whbl.rule, whbl.codes]));
  assert.ok(whbl.codes.some(([c]) => c.startsWith("19")) && whbl.codes.some(([c]) => c === "175"));
  assert.equal(whbl.geo, "unconfirmed", "one .com outlet: the city is not confirmed");
  // the English 145 report of the same evening (Straits Times and the outlets of GDELT's mentions)
  assert.ok(at(milan, "straitstimes.com/world/europe/italian-police-clash").some((r) => r.cats.includes("riot") && r.hosts >= 2));
  // every report keeps its original codes and descriptions
  assert.ok(reports.every((r) => r.codes.length > 0 && r.codes.every(([c, l]) => c && l)));
});

test("cases 2–4 · Turin, Bologna, Bergamo: GDELT placed NO action there — articles about them sit elsewhere, said as unconfirmed", async () => {
  const { rows, reports } = await all();
  for (const city of ["Turin", "Torino", "Bologna", "Bergamo"]) assert.equal(rows.filter((r) => r.fips === "IT" && r.place.startsWith(city)).length, 0, city);
  // "Bologna, scontri davanti alla stazione": GDELT placed it in Milan; NEXUM never moves it to Bologna, and says the place is not confirmed
  const b = at(reports, "bologna-scontri-davanti-alla-stazione");
  assert.ok(b.length >= 1);
  for (const r of b) {
    assert.ok(!r.place.startsWith("Bologna"));
    if (r.place.startsWith("Milan")) { assert.equal(r.geo, "ambiguous"); assert.deepEqual(r.otherNamed, ["Bologna"]); }
  }
});

test("case 5 · 'Rome' in the United States is not confirmed as Rome, Italy; an Italian article naming Roma is", async () => {
  const { reports } = await all();
  const fox = at(reports, "fox56.com/news/local/rome-man");
  assert.ok(fox.length >= 1);
  for (const r of fox) { assert.equal(r.place, "Rome, Lazio, Italy"); assert.equal(r.geo, "unconfirmed"); assert.equal(r.sameNation, false); }
  assert.deepEqual(geoChecks(4, ["https://www.zazoom.it/2026-10-17/roma-tensione-al-corteo/1"], "IT", "Rome, Lazio, Italy", undefined, IT),
    { level: "confirmed", precision: "city", sameNation: true, named: true, otherNamed: [] });
  assert.deepEqual([geoChecks(1, ["https://x.it/a"], "IT", "Italy").level, geoChecks(1, ["https://x.it/a"], "IT", "Italy").precision], ["unconfirmed", "nation"]);
  assert.deepEqual([geoChecks(5, ["https://x.it/a"], "IT", "Piedmont, Piemonte, Italy").level, geoChecks(5, ["https://x.it/a"], "IT", "Piedmont, Piemonte, Italy").precision], ["unconfirmed", "region"]);
  assert.ok(namesPlace("https://www.milanotoday.it/attualita/scontri-corteo.html", "Milan, Lombardia, Italy"));
  assert.ok(!namesPlace("https://www.siracusaoggi.it/floridia-arrestato-42enne/", "Milan, Lombardia, Italy"));
  assert.ok(!namesPlace("https://example.com/romania-news", "Rome, Lazio, Italy"));
});

test("case 6 · peaceful demonstrations are never labelled violent", async () => {
  const { reports } = await all();
  const peaceful = reports.filter((r) => r.codes.every(([c]) => c.startsWith("14") && !c.startsWith("145")));
  assert.ok(peaceful.length >= 3, `${peaceful.length}`);
  for (const r of peaceful) { assert.deepEqual(r.cats, ["protest"]); assert.equal(r.title, "Manifestazione o protesta"); }
  const r = categoryOf({ code: "141", a1c: "ITA", a1t: "OPP", a2c: "ITA", a2t: "COP" }, "ITA", CFG)!;
  assert.equal(r.cat, "protest");
});

test("case 7 · one article coded with several CAMEO codes is ONE report listing them; distinct articles are never merged by day, place or code", async () => {
  const { reports } = await all();
  const multi = reports.filter((r) => r.codes.length > 1 && new Set(r.links.slice(0, 1)).size === 1);
  assert.ok(multi.length >= 1);
  const tv = at(reports, "studenti-in-piazza-tra-violenze")[0];
  assert.ok(tv.codes.length >= 2, JSON.stringify(tv.codes));
  // synthetic: same day, place and code, different articles and actors → two reports
  const base = { id: "1", day: "20261017", added: "2026-10-17T18:00", code: "145", root: "14", quad: "4", gold: -7, ment: 1, srcs: 1, arts: 1, tone: -5,
    a1c: "", a1t: "OPP", a1g: "", a2c: "", a2t: "COP", a2g: "", geoType: 4, place: "Milan, Lombardia, Italy", fips: "IT", feature: "-121", lon: 9.19, lat: 45.46,
    url: "https://a.it/x", isRoot: true, stream: "tr" as const };
  assert.equal(groupRows([base, { ...base, id: "2", url: "https://b.it/y", a1t: "CVL", added: "2026-10-17T21:00" }]).length, 2);
  assert.equal(groupRows([base, { ...base, id: "3", code: "141" }]).length, 1, "same article, same place");
  assert.equal(groupRows([base, { ...base, id: "4", url: "https://b.it/y" }]).length, 1, "GDELT's same action, place, actors and hour");
  assert.equal(dedupeById([base, { ...base }]).length, 1);
});

test("case 8 · reports only in the multilingual stream exist and are kept", async () => {
  const { reports } = await all();
  const onlyTr = reports.filter((r) => r.streams.length === 1 && r.streams[0] === "tr" && r.cats.length);
  assert.ok(onlyTr.length >= 10, `${onlyTr.length}`);
  assert.ok(onlyTr.some((r) => r.place.startsWith("Milan") && r.cats.includes("riot")));
});

test("the 19x rule: police against a crowd of the same nation → clashes; armed actors, foreign actors or a lone actor → armed force", () => {
  const r = (a1c: string, a1t: string, a2c: string, a2t: string) => categoryOf({ code: "190", a1c, a1t, a2c, a2t }, "ITA", CFG)!.cat;
  assert.equal(r("", "COP", "", "OPP"), "riot");
  assert.equal(r("ITA", "COP", "", "EDU"), "riot");
  assert.equal(r("", "MIL", "", "CVL"), "armed");
  assert.equal(r("ISR", "COP", "", "CVL"), "armed");
  assert.equal(r("", "COP", "", ""), "armed");
  assert.equal(categoryOf({ code: "193", a1c: "", a1t: "COP", a2c: "", a2t: "OPP" }, null, CFG)!.cat, "armed", "unknown nation: no rule");
  assert.equal(categoryOf({ code: "042", a1c: "", a1t: "", a2c: "", a2t: "" }, "ITA", CFG), null, "outside the lens");
  assert.equal(categoryOf({ code: "1712", a1c: "", a1t: "", a2c: "", a2t: "" }, "ITA", CFG)!.cat, "damage");
  assert.equal(categoryOf({ code: "1711", a1c: "", a1t: "", a2c: "", a2t: "" }, "ITA", CFG)!.cat, "enforcement");
  assert.ok(CFG.notDistinguishable.some((x: any) => x.id === "fire"), "fires are declared as not distinguishable");
  assert.ok(!CFG.categories.some((c) => c.id === "fire"));
});

test("case 9 · GDELT unreachable or stale: archive and delay are said, never 'live'", () => {
  const now = Date.parse("2026-10-18T17:00:00Z");
  const arch = newsState({ mode: "archive", latestMs: null, from: "2026-10-06T14:30", to: "2026-10-06T15:15", hours: 6, error: "tempo scaduto" }, now);
  assert.equal(arch.cls, "archive");
  assert.match(arch.text, /^ARCHIVIO del 6 ott 2026.*, non in diretta · GDELT non raggiungibile ora \(tempo scaduto\)$/);
  const fresh = newsState({ mode: "live", latestMs: Date.parse("2026-10-18T16:45:00Z"), from: null, to: null, hours: 6, error: null }, now);
  assert.equal(fresh.cls, "fresh");
  assert.match(fresh.text, /ogni 15 min · ultimo file 16:45 UTC \(15 min fa\) · finestra 6 h/);
  const late = newsState({ mode: "live", latestMs: Date.parse("2026-10-18T14:00:00Z"), from: null, to: null, hours: 1, error: null }, now);
  assert.equal(late.cls, "late");
  assert.match(late.text, /^GDELT IN RITARDO/);
  for (const t of [arch.text, fresh.text, late.text]) assert.ok(!/\blive\b/i.test(t) && !/(?<!non )in diretta/.test(t), t);
  assert.equal(newsState(null, now).cls, "none");
});

test("the snapshot's archive goes through the same rules (nation / region / city read from the place)", () => {
  const F = ["lon", "lat", "root", "code", "place", "added_utc", "goldstein", "articles", "tone", "url", "event_id", "quad", "actor1_country", "actor1_role",
    "actor1_group", "actor2_country", "actor2_role", "actor2_group", "feature_id", "sources", "mentions", "links"];
  const row = (place: string, code: string) => [12.5, 41.9, code.slice(0, 2), code, place, "2026-10-06T14:30", -5, 2, -3, "https://x.com/a", "9", "4", "", "OPP", "", "", "COP", "", place, 1, 2, ["https://x.com/a"]];
  const g = [fromTable(F, row("Italy", "145")), fromTable(F, row("Lazio, Italy", "141")), fromTable(F, row("Rome, Lazio, Italy", "042"))];
  assert.deepEqual(g.map((r) => r.geoType), [1, 5, 4]);
  const reps = toReports(groupRows(g), new Map(), CTX);
  assert.deepEqual(reps.map((r) => r.geo), ["unconfirmed", "unconfirmed", "unconfirmed"]);
  assert.deepEqual(reps.map((r) => r.precision).sort(), ["city", "nation", "region"]);
});

// ── REVIEW of 2026-10-18: the cases the author saw in the preview, with their GDELT ids ──
test("review · telegraf.rs (Serbian, 18 Oct, id 1328567442): a Belgrade crime story GDELT placed in Milan — suggested, never confirmed", async () => {
  const { reports } = await all();
  const t = at(reports, "telegraf.rs/vesti/hronika/4416274").filter((r) => r.place.startsWith("Milan"));
  assert.ok(t.length >= 1);
  for (const r of t) { assert.equal(r.place, "Milan, Lombardia, Italy"); assert.equal(r.geo, "unconfirmed"); assert.equal(r.sameNation, false); assert.equal(r.named, false); }
  assert.ok(t.some((r) => r.eids.includes("1328567442")));
});

test("review · articles of foreign outlets placed in Milan (Portuguese, Albanian, Macedonian, Serbian…) are never a confirmed Milan", async () => {
  const { reports } = await all();
  const foreign = reports.filter((r) => r.place.startsWith("Milan") && r.links[0] && ccTldOf(r.links[0]) !== "IT");
  assert.ok(foreign.length >= 3, `${foreign.length}`);
  for (const r of foreign) assert.notEqual(r.geo, "confirmed", r.links[0]);
  // the Portuguese article the author saw (operamundi, id 1328478725: a secondary mention, code 111, not loaded in the newest hour)
  assert.equal(geoChecks(4, ["https://operamundi.uol.com.br/europa/protestos-na-franca-e-italia-reunem-estudantes-e-trabalhadores-contra-cortes-e-custo-de-vida/"],
    "IT", "Milan, Lombardia, Italy", undefined, IT).level, "unconfirmed");
});

test("review · zazoom articles naming Bologna placed in Milan: AMBIGUOUS (another city named), never confirmed, never moved", async () => {
  const { reports } = await all();
  // (a report may join this article's rows with GDELT's same action from another article: any of its addresses)
  const both = reports.filter((r) => r.links.some((u) => u.includes("proteste-a-milano-e-bologna-sassi-contro-la-polizia")) && r.place.startsWith("Milan"));
  assert.ok(both.length >= 1);
  for (const r of both) { assert.equal(r.place, "Milan, Lombardia, Italy"); assert.equal(r.geo, "ambiguous"); assert.ok(r.otherNamed.includes("Bologna")); assert.ok(r.flags.includes("other-city")); }
  // "Le foto della guerriglia a Bologna" (ids 1328479879/84, code 120, secondary: not loaded) — the rule on its real address
  const g = geoChecks(4, ["https://www.zazoom.it/2026-10-17/le-foto-della-guerriglia-e-d-a-bologna-il-corteo-gli-scontri-e-i-danni-provocati-dai-manifestanti/19813452/"],
    "IT", "Milan, Lombardia, Italy", undefined, IT);
  assert.deepEqual([g.level, g.otherNamed], ["ambiguous", ["Bologna"]]);
  // "sassi" (stones) is not the city of Sassari
  assert.ok(!both.some((r) => r.otherNamed.includes("Sassari")));
});

test("review · a school march coded 190 (id 1328411666): kept as coded, said AMBIGUOUS — no armed actor, not 'the army'", async () => {
  const { reports } = await all();
  const c = at(reports, "il-corteo-per-linclusione-i-figli-della-crisi");
  assert.ok(c.length >= 1);
  const r = c.find((x) => x.codes.some(([k]) => k === "190"))!;
  assert.ok(r.flags.includes("force-no-armed"), JSON.stringify(r.flags));
  assert.ok(r.codes.some(([k, l]) => k === "190" && l === "Uso della forza militare"), "the original code and its description stay");
  assert.ok(!/esercito/i.test(r.title));
  assert.match(CFG.flags["force-no-armed"], /non indica che sia intervenuto l'esercito/);
  assert.equal(CFG.categories.find((x) => x.id === "armed")!.label, "Uso della forza (codice CAMEO militare)");
});

test("review · the sentence: a confirmed place is where the event was reported; any other is a place SUGGESTED by GDELT", () => {
  const S = CFG.sentence as any;
  assert.equal(S.confirmed.replace("{place}", "Milan, Lombardia, Italy").replace("{act}", "scontri e disordini"), "Evento riportato dai media a Milan, Lombardia, Italy: scontri e disordini.");
  assert.equal(S.other.replace("{place}", "Milan, Lombardia, Italy").replace("{act}", "scontri e disordini"),
    "Segnalazione dei media: scontri e disordini. Luogo suggerito da GDELT, non verificato: Milan, Lombardia, Italy.");
});

test("review · map and list: only confirmed places are points; the rest one circle per nation; Milan's confirmed and suggested reports apart", async () => {
  const { reports } = await all();
  const items = reports.map((r) => ({ id: r.key, c: r.c, t: r.t, props: { geo: r.geo, precision: r.precision, nation_name: r.place.split(",").pop()!.trim(),
    city: r.precision === "city" ? r.place.split(",")[0].trim() : "", cats: JSON.stringify(r.cats) } }));
  const g = nationGroups(items);
  const it = g.find((x) => x.nation === "Italy")!;
  assert.ok(it.n > 0 && it.ambiguous > 0);
  assert.equal(g.reduce((s, x) => s + x.n, 0) + items.filter((x) => x.props.geo === "confirmed").length, items.filter((x) => x.c && x.props.nation_name).length);
  const milan = filterNews(items, { nation: "Italy", city: "Milan", cat: "", geo: "" });
  const conf = filterNews(items, { nation: "Italy", city: "Milan", cat: "", geo: "confirmed" }), unc = filterNews(items, { nation: "Italy", city: "Milan", cat: "", geo: "uncertain" });
  assert.equal(conf.length + unc.length, milan.length);
  assert.ok(conf.length > 0 && unc.length > 0, `${conf.length} / ${unc.length}`);
  assert.ok(milan.every((x, i) => i === 0 || (milan[i - 1].t ?? 0) >= (x.t ?? 0)), "newest first");
  assert.ok(filterNews(items, { nation: "", city: "", cat: "riot", geo: "" }).every((x) => JSON.parse(x.props.cats).includes("riot")));
});

test("review · the source's language (GDELT's translation info) and when GDELT saw the article", async () => {
  const { reports } = await all();
  const tr = reports.filter((r) => r.streams.includes("tr") && r.lang);
  assert.ok(tr.length > 0 && tr.every((r) => /^[a-z]{3}$/.test(r.lang!)));
  assert.ok(reports.filter((r) => r.streams.includes("en")).every((r) => r.lang === "eng"));
  assert.ok(reports.some((r) => r.seen && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(r.seen)));
});

// ── which reports are public-order news (2026-10-19, author's request after a false positive) ──
// the false positive: a REAL GDELT file of 19 October 2026 (tests/fixtures/gdelt-20261019, unmodified: its MD5 is the
// one GDELT's lastupdate.txt gave, 014f692a6636e109739eaba4506847bf) has event 1328686526, CAMEO 010 «make statement»,
// actor «STUDENT/MEDIA», placed in «Roma, Lazio, Italy», from a student newspaper's food column
const FX19 = new URL("../fixtures/gdelt-20261019/", import.meta.url);
async function reports19() {
  const buf = fs.readFileSync(new URL("20261019113000.export.CSV.zip", FX19));
  const t = new TextDecoder().decode(await unzipFirst(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), inflate));
  const rows = parseExport(t, "en", () => true);       // the newest hour: every action, as the browser keeps it
  return { rows, reports: toReports(groupRows(dedupeById(rows)), new Map(), CTX) };
}

test("false positive · «Sadie's scoop: Justice for ugly ratatouille» (a statement placed in Rome) is raw data, never public-order news", async () => {
  const { rows, reports } = await reports19();
  const row = rows.find((r) => r.id === "1328686526")!;
  assert.deepEqual([row.code, row.root, row.place, row.isRoot, row.a1t], ["010", "01", "Roma, Lazio, Italy", true, "EDU"]);
  assert.equal(row.url, "https://depauliaonline.com/86355/opinions/sadies-scoop-justice-for-ugly-ratatouille/");
  // why it was there: the newest hour keeps every root action; no public-order category; the place is unconfirmed
  assert.equal(categoryOf(row, "ITA", CFG), null);
  const rep = at(reports, "sadies-scoop-justice-for-ugly-ratatouille");
  assert.equal(rep.length, 1);
  assert.deepEqual([rep[0].cats, rep[0].relevance, rep[0].relWords, rep[0].geo], [[], "raw", [], "unconfirmed"]);
});

test("filter · a generic code (statement, appeal, consultation, disapproval, negotiation…) is public-order news only with a public-order word in its article's address", async () => {
  const { reports } = await reports19();
  for (const r of reports) {
    if (r.cats.length) assert.equal(r.relevance, "order");
    else assert.equal(r.relevance, r.relWords.length ? "address" : "raw");
  }
  // every generic root of the newest hour is mostly raw data: none is public-order news by its code alone
  const generic = reports.filter((r) => ["01", "02", "03", "04", "05", "11", "12"].includes(r.root) && !r.cats.length);
  assert.ok(generic.length > 20 && generic.every((r) => r.relevance !== "order"));
  assert.ok(generic.filter((r) => r.relevance === "raw").length > generic.length * 0.8);
  // whole words only: «protestant», «manifesto» or «clashing» are not public-order words
  assert.deepEqual(addressWords(["https://x.it/il-manifesto-protestante-clashing"], CFG.relevance!.words), []);
  assert.deepEqual(addressWords(["https://x.it/scontri-a-milano-guerriglia"], CFG.relevance!.words), ["scontri", "guerriglia"]);
});

test("filter · the Milan clashes of 17 October stay: every report coded in the lens, and the generic-coded ones whose address names the clashes", async () => {
  const { reports } = await all();
  const milan = reports.filter((r) => r.place.startsWith("Milan"));
  // coded in the public-order lens: all kept
  const lens = milan.filter((r) => r.cats.length);
  assert.ok(lens.length >= 10 && lens.every((r) => r.relevance === "order"));
  // coded with a generic code by GDELT, but about the clashes by their address: kept, said as such
  // (rows the browser keeps: root actions, and every action of the lens — a secondary generic row is never downloaded)
  for (const [u, w] of [["imolaoggi.it/2026/10/17/proteste-milano-bologna-violenze", "proteste"],
    ["scontri-milano-oltre-500mila-euro-danni", "scontri"]]) {
    const r = milan.filter((x) => x.links[0]?.includes(u));
    assert.ok(r.length > 0, u);
    for (const x of r) { assert.deepEqual(x.cats, []); assert.equal(x.relevance, "address", u); assert.ok(x.relWords.includes(w), u); }
  }
  // the confirmed Milan reports of the lens or of the address are never raw
  assert.ok(milan.filter((r) => r.geo === "confirmed" && r.relevance === "raw").every((r) => !r.links.some((u) => /scontri|guerriglia|corteo|protest/.test(u))));
  // a generic report placed in Milan with nothing of the clashes in its address: raw
  const art = milan.filter((r) => r.links[0]?.includes("lintimita-dellarte-sul-lago"));
  assert.ok(art.length > 0 && art.every((r) => r.relevance === "raw"));
});
