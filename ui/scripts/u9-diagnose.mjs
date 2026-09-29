// U9 diagnosis: the 200-step scenario of U9 with measurements at steps 0/50/100/150/200 and two heap snapshots
// (steps 100 and 200) aggregated by constructor; at step 200 each suspect is released in turn to attribute the growth.
// usage: node scripts/u9-diagnose.mjs http://127.0.0.1:8767/ out.json
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [url, out] = process.argv.slice(2);
const FX = JSON.parse(fs.readFileSync(new URL("../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await page.goto(url);
await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 60000 });
await page.evaluate(() => window.__nexum.store.set({ stage: "split" }));
const gc = async () => { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(300); await cdp.send("HeapProfiler.collectGarbage"); };
const heapMb = async () => { await gc(); return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576; };
const diag = () => page.evaluate(() => {
  const n = window.__nexum, st = n.store.get();
  let details = 0;
  for (const id of n.store.entityIds()) if (n.store.entity(id).details) details++;
  return { entities: n.store.entityCount(), entities_with_details: details, api_cache: n.apiCache.stats(),
    perf_entries: performance.getEntries().length, perf_marks: performance.getEntriesByType("mark").length,
    perf_measures: performance.getEntriesByType("measure").length, trail_steps: st.trail.steps.length,
    graph_nodes: n.graph?.order?.() ?? null, dom_nodes: document.getElementsByTagName("*").length };
});
async function snapshot() {
  const chunks = [];
  const on = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await gc();
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  const snap = JSON.parse(chunks.join(""));
  const f = snap.snapshot.meta.node_fields, types = snap.snapshot.meta.node_types[0], n = f.length;
  const iType = f.indexOf("type"), iName = f.indexOf("name"), iSize = f.indexOf("self_size");
  const agg = {};
  for (let i = 0; i < snap.nodes.length; i += n) {
    const t = types[snap.nodes[i + iType]];
    const name = t === "object" || t === "closure" ? snap.strings[snap.nodes[i + iName]] : `(${t})`;
    const a = (agg[name] ??= { count: 0, bytes: 0 });
    a.count++; a.bytes += snap.nodes[i + iSize];
  }
  return agg;
}
const res = { steps: {}, release: {} };
let s100;
for (let i = 0; i <= 200; i++) {
  if (i > 0) {
    const kind = i % 4;
    if (kind === 0) await page.evaluate((id) => window.__nexum.store.select(id, "bench"), FX.pivots_d2[i % FX.pivots_d2.length]);
    else if (kind === 1) await page.evaluate((c) => window.__nexum.map.jumpTo({ center: c, zoom: 3 + ((c[0] * 7) % 5 + 5) % 5 }), FX.d2_centers[i % 10]);
    else if (kind === 2) await page.locator(`[data-depth="${1 + (i % 2)}"]`).click().catch(() => {});
    else await page.locator("#nexum-search").fill(FX.d2_terms[i % 10].slice(0, 5));
    await page.waitForTimeout(250);
  }
  if (i % 50 === 0) { res.steps[i] = { heap_mb: +(await heapMb()).toFixed(2), ...(await diag()) }; console.log(i, JSON.stringify(res.steps[i])); }
  if (i === 100) s100 = await snapshot();
}
const s200 = await snapshot();
res.growth_by_constructor = Object.entries(s200).map(([k, v]) => ({ name: k, bytes: v.bytes - (s100[k]?.bytes ?? 0),
  count: v.count - (s100[k]?.count ?? 0) })).sort((a, b) => b.bytes - a.bytes).slice(0, 25);
// attribution: release each suspect in turn and measure the heap
let h = await heapMb();
res.release.baseline_mb = +h.toFixed(2);
await page.evaluate(() => window.__nexum.apiCache.clear());
let h2 = await heapMb(); res.release.api_cache_mb = +(h - h2).toFixed(2); h = h2;
await page.evaluate(() => { performance.clearMarks(); performance.clearMeasures(); });
h2 = await heapMb(); res.release.performance_entries_mb = +(h - h2).toFixed(2); h = h2;
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res.release), JSON.stringify(res.growth_by_constructor.slice(0, 12)));
await browser.close();
