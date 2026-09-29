// Phase 2 UI benchmarks U1–U9 (frozen, NEXUM-PHASE2-SPEC.md §P.2). Installed Chrome, headed, 1440×900.
// Results → data/reports/phase2/ui_bench.json. U8 (bundle) and U10 (informative) are measured by run_phase2.py.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { FX, URL_OF } from "../e2e/helpers";

test.use({ headless: false, viewport: { width: 1440, height: 900 } });

const OUT = new URL("../../../data/reports/phase2/ui_bench.json", import.meta.url);
const RES: Record<string, any> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(RES, null, 1));
const p = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; };
const st = (xs: number[]) => ({ n: xs.length, p50: +p(xs, 0.5).toFixed(1), p95: +p(xs, 0.95).toFixed(1), max: +Math.max(...xs).toFixed(1) });

async function ready(page: Page) {
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 60000 });
  return page.evaluate(() => performance.getEntriesByName("nexum:ready")[0].startTime);
}

test("U1 cold start to interactive map (D1, D2)", async ({ browser }) => {
  const out: Record<string, any> = {};
  for (const [world, limit] of [["d1", 2000], ["d2", 3000]] as const) {
    const xs: number[] = [];
    for (let i = 0; i < 20; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await page.goto(URL_OF[world]);
      xs.push(await ready(page));
      await ctx.close();
    }
    out[world] = { ...st(xs), target_ms: limit, pass: p(xs, 0.95) <= limit };
  }
  RES.U1 = { ...out, pass: out.d1.pass && out.d2.pass };
  save();
});

async function allViews(page: Page, id: string) {
  return page.evaluate((i) => new Promise<number>((resolve) => {
    const t0 = performance.now();
    (window as any).__nexum.store.select(i, "bench");
    const check = () => {
      const ok = document.querySelector(`[data-testid="focus-head"][data-focus="${i}"]`) &&
        document.querySelector(`[data-testid="map"][data-selected="${i}"]`) &&
        document.querySelector(`[data-testid="graph"][data-root="${i}"]`) &&
        document.querySelector(`[data-testid="timeline"][data-selected="${i}"]`);
      if (ok) resolve(performance.now() - t0); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), id);
}

test("U2 selection propagation to the four views, cached data (D1)", async ({ page }) => {
  await page.goto(URL_OF.d1);
  await ready(page);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "split" }));
  const list = [...FX.linked_d1, ...FX.pivots_d1, ...FX.relations.slice(0, 10)].slice(0, 100);
  for (const id of list) { await allViews(page, id); await page.waitForTimeout(150); }   // first pass: warm the caches
  const xs: number[] = [];
  for (const id of list) xs.push(await allViews(page, id));
  RES.U2 = { ...st(xs), target_ms: 100, pass: p(xs, 0.95) <= 100 };
  save();
});

async function pivot(page: Page, id: string) {
  return page.evaluate((i) => new Promise<number>((resolve) => {
    const t0 = performance.now();
    (window as any).__nexum.store.select(i, "inspector");   // exactly what a click on a reference does
    const check = () => {
      const head = document.querySelector(`[data-testid="focus-head"][data-focus="${i}"]`);
      const secs = document.querySelectorAll('[data-testid="object-mode"] [data-section]').length;
      const err = document.querySelector('[data-testid="object-mode"] [role="alert"]');
      if (head && (secs >= 11 || err)) resolve(err ? -1 : performance.now() - t0); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), id);
}

test("U3 pivot: click on a reference → OBJECT MODE drawn (D1, D2), cold per element", async ({ browser }) => {
  const out: Record<string, any> = {};
  for (const [world, list, limit] of [["d1", FX.pivots_d1, 300], ["d2", FX.pivots_d2, 450]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL_OF[world]);
    await ready(page);
    const xs: number[] = [];
    let errors = 0;
    for (const id of list) { const t = await pivot(page, id); if (t < 0) errors++; else xs.push(t); }
    out[world] = { ...st(xs), errors, target_ms: limit, pass: errors === 0 && p(xs, 0.95) <= limit };
    await ctx.close();
  }
  RES.U3 = { ...out, pass: out.d1.pass && out.d2.pass };
  save();
});

async function fps(page: Page, ms: number, drive: () => Promise<void>) {
  await page.evaluate(() => {
    (window as any).__frames = [];
    let last = performance.now();
    const loop = (t: number) => { (window as any).__frames.push(t - last); last = t; if ((window as any).__frames !== null) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await drive();
  const frames: number[] = await page.evaluate(() => { const f = (window as any).__frames.slice(2); (window as any).__frames = null; return f; });
  const rates = frames.filter((d) => d > 0).map((d) => 1000 / d);
  void ms;
  return { frames: rates.length, median_fps: +p(rates, 0.5).toFixed(1), p5_fps: +p(rates, 0.05).toFixed(1) };
}

test("U4 map pan with ≥ 4,000 features (UI-benchmark world)", async ({ page }) => {
  await page.goto(URL_OF.ubench);
  await ready(page);
  // fixed area of the deterministic benchmark fixture (generate_ubench.py): 4,500 points around 12°E 41.5°N
  const best = { c: [12.0, 41.5] };
  await page.evaluate(() => performance.clearMarks("nexum:map:rendered"));
  await page.evaluate((cc) => (window as any).__nexum.map.jumpTo({ center: cc, zoom: 7.0 }), best.c);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:map:rendered").length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const features = await page.evaluate(() => (window as any).__nexum.store.get().mapInfo?.returned ?? 0);
  const box = (await page.getByTestId("map").boundingBox())!;
  const r = await fps(page, 20000, async () => {
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 20000) {
      const dir = k++ % 2 ? -1 : 1;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dir * 240, box.y + box.height / 2 + dir * 60, { steps: 60 });
      await page.mouse.up();
    }
  });
  const lod = await page.evaluate(() => (window as any).__nexum.store.get().mapInfo?.lod);
  RES.U4 = { world: "ubench", features_in_source: features, lod, center: best.c, ...r, target: "median ≥ 50 fps and p5 ≥ 30 fps, ≥ 4,000 features",
    pass: features >= 4000 && r.median_fps >= 50 && r.p5_fps >= 30 };
  save();
});

test("U5 graph of 2,000 nodes / 4,000 edges: first frame and interaction (UI-benchmark world)", async ({ page }) => {
  await page.goto(URL_OF.ubench);
  await ready(page);
  const hub = (await (await page.request.get(URL_OF.ubench + "api/v1/search?q=Hub%20sintetico")).json())
    .data.groups.flatMap((g: any) => g.items).find((i: any) => i.label === "Hub sintetico").id;
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "graph" }));
  await page.locator('[data-depth="2"]').click();
  await page.locator('[data-max-nodes="2000"]').click();
  const xs: number[] = [];
  let order = 0, size = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => (window as any).__nexum.store.select(null, "bench"));
    await page.evaluate((h) => { performance.clearMarks(); (window as any).__nexum.store.select(h, "bench"); }, hub);
    await page.waitForFunction((h) => performance.getEntriesByName(`nexum:graph:frame:${h}`).length > 0
      && performance.getEntriesByName(`nexum:graph:data:${h}`).length > 0, hub, { timeout: 60000 });
    await page.waitForTimeout(300);
    xs.push(await page.evaluate((h) => performance.getEntriesByName(`nexum:graph:frame:${h}`).at(-1)!.startTime -
      performance.getEntriesByName(`nexum:graph:data:${h}`).at(-1)!.startTime, hub));
    order = await page.evaluate(() => (window as any).__nexum.graph.order());
    size = await page.evaluate(() => (window as any).__nexum.graph.size());
  }
  const aggregates = await page.evaluate(() => (window as any).__nexum.graph.aggregates().length);
  const r = await fps(page, 10000, async () => {
    await page.evaluate(() => new Promise<void>((res) => {
      const cam = (window as any).__nexum.graph.sigma.getCamera();
      const t0 = performance.now();
      const step = () => {
        const t = (performance.now() - t0) / 1000;
        cam.setState({ x: 0.5 + 0.2 * Math.sin(t), y: 0.5 + 0.2 * Math.cos(t * 0.7), ratio: 0.6 + 0.4 * Math.abs(Math.sin(t / 2)), angle: 0 });
        if (t < 10) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    }));
  });
  const precondition = order >= 2000 && size >= 4000 && aggregates > 0;   // frozen U5: 2,000 nodes, 4,000 edges
  RES.U5 = { world: "ubench", nodes: order, edges: size, aggregate_nodes: aggregates, precondition_2000_4000_met: precondition, first_frame: st(xs), interaction: r,
    target: "graph of 2,000 nodes / 4,000 edges; p95 first frame ≤ 1,000 ms; median ≥ 30 fps",
    pass: precondition && p(xs, 0.95) <= 1000 && r.median_fps >= 30 };
  save();
});

test("U6 timeline redraw while brushing, 400 buckets (UI-benchmark world)", async ({ page }) => {
  await page.goto(URL_OF.ubench);
  await ready(page);
  // whole-extent view (400 consecutive years of events) with the Core's automatic bucketing (> 3 years → year)
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-bucket", "year", { timeout: 30000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="timeline"]')!.getAttribute("data-buckets")) >= 400, null, { timeout: 30000 });
  const buckets = Number(await page.getByTestId("timeline").getAttribute("data-buckets"));
  await page.evaluate(() => performance.clearMeasures("nexum:timeline:draw"));
  const box = (await page.getByTestId("timeline").locator("canvas").boundingBox())!;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    await page.mouse.move(box.x + 100, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 60, box.y + 40, { steps: 80 });
    await page.mouse.up();
    await page.evaluate(() => (window as any).__nexum.store.setScope({ time_window: null }));
  }
  const xs: number[] = await page.evaluate(() => performance.getEntriesByName("nexum:timeline:draw").map((e) => e.duration));
  RES.U6 = { world: "ubench", bucket: "year (automatic)", buckets, draws: xs.length, ...st(xs), target_ms: 16,
    pass: buckets >= 400 && p(xs, 0.95) <= 16 };
  save();
});

test("U7 open WHY (D1): 35 R2 insights × 3", async ({ page }) => {
  await page.goto(URL_OF.d1);
  await ready(page);
  const xs: number[] = [];
  for (let k = 0; k < 3; k++) for (const id of FX.r2_insights) {
    xs.push(await page.evaluate((i) => new Promise<number>((resolve) => {
      const t0 = performance.now();
      (window as any).__nexum.store.set({ panel: "world", whyId: null });
      (window as any).__nexum.store.why(i);
      const check = () => document.querySelector(`[data-testid="why"][data-why="${i}"] [data-testid="why-recompute"]`)
        ? resolve(performance.now() - t0) : requestAnimationFrame(check);
      requestAnimationFrame(check);
    }), id));
  }
  RES.U7 = { ...st(xs), target_ms: 300, pass: p(xs, 0.95) <= 300 };
  save();
});

test("U9 JS heap over a 200-step scenario (D2)", async ({ page }) => {
  await page.goto(URL_OF.d2);
  await ready(page);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "split" }));
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(300);
    await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576; };
  const marks: Record<number, number> = {};
  for (let i = 1; i <= 200; i++) {
    const kind = i % 4;
    if (kind === 0) await page.evaluate((id) => (window as any).__nexum.store.select(id, "bench"), FX.pivots_d2[i % FX.pivots_d2.length]);
    else if (kind === 1) await page.evaluate((c) => (window as any).__nexum.map.jumpTo({ center: c, zoom: 3 + ((c[0] * 7) % 5 + 5) % 5 }), FX.d2_centers[i % 10]);
    else if (kind === 2) await page.locator(`[data-depth="${1 + (i % 2)}"]`).click().catch(() => {});
    else { await page.locator("#nexum-search").fill(FX.d2_terms[i % 10].slice(0, 5)); }
    await page.waitForTimeout(250);
    if (i === 100 || i === 200) marks[i] = await heap();
  }
  const growth = (marks[200] - marks[100]) / marks[100];
  RES.U9 = { heap_mb_100: +marks[100].toFixed(1), heap_mb_200: +marks[200].toFixed(1), growth: +growth.toFixed(3),
    target: "≤ 300 MB at step 200, growth ≤ 10%", pass: marks[200] <= 300 && growth <= 0.10 };
  save();
});
