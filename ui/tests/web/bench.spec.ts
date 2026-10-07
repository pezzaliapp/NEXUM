// Phase 3 benchmarks of the online workspace (NEXUM-PHASE3-SPEC.md §7, thresholds approved with E9):
//   O6  initial WORLD MODE load ≤ 1.0 MB (compressed bytes on the wire, until the workspace is interactive)
//   O8  pivot on Fast 4G: cold ≤ 1.5 s p95, warm ≤ 450 ms p95
//   O9  first FTS5 search on Fast 4G ≤ 6 s; following searches p95 ≤ 150 ms
//   O10 Phase 2 U2, U4, U5, U6, U7, U9 with the snapshot DataSource, same thresholds
// Fast 4G = Chrome DevTools preset values, frozen in §7.1, applied with CDP (they also apply to the snapshot worker).
// Results → data/reports/phase3/bench.json
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";

// headed, like the Phase 2 UI benchmarks (frame rates need a real compositor)
test.use({ headless: false });

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/";
const UBENCH = process.env.NEXUM_WEB_UBENCH ?? "http://127.0.0.1:8793/";
const FAST4G = { offline: false, latency: 165, downloadThroughput: 1_012_500, uploadThroughput: 168_750 };
const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
const OUT = new URL("../../../data/reports/phase3/bench.json", import.meta.url);
fs.mkdirSync(new URL(".", OUT), { recursive: true });
const RES: Record<string, any> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(RES, null, 1));
const p = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; };
const st = (xs: number[]) => ({ n: xs.length, p50: +p(xs, 0.5).toFixed(1), p95: +p(xs, 0.95).toFixed(1), max: +Math.max(...xs).toFixed(1) });

async function fresh(browser: Browser, url = BASE, throttle = true, vp = { width: 1440, height: 900 }) {
  // service workers blocked (2026-10-06): a controlling worker fetches outside the page's throttling and disabled cache,
  // which would measure an unthrottled network; the benches measure a first visit on Fast 4G, as defined
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttle) await cdp.send("Network.emulateNetworkConditions", FAST4G);
  return { ctx, page, cdp };
}

async function ready(page: Page) {
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
}

/** Bytes on the wire (compressed body + headers) of every response of the page AND its workers (Playwright reports
 *  worker requests on the page; a CDP session on the page does not see the workers' traffic). */
function wire(page: Page) {
  const got: Promise<{ url: string; bytes: number }>[] = [];
  page.on("requestfinished", (r) => {
    if (r.url().startsWith("data:") || r.url().startsWith("blob:")) return;
    got.push(r.sizes().then((z) => ({ url: r.url().replace(/^https?:\/\/[^/]+/, ""), bytes: z.responseBodySize + z.responseHeadersSize })));
  });
  return async () => {
    const list = await Promise.all(got);
    return { total: list.reduce((s, x) => s + x.bytes, 0), files: list.length, list: list.sort((a, b) => b.bytes - a.bytes) };
  };
}

async function quiet(page: Page, ms = 1500) {
  // network idle: no new resource entries for `ms`
  let last = -1;
  for (;;) {
    const n = await page.evaluate(() => performance.getEntriesByType("resource").length);
    if (n === last) return;
    last = n;
    await page.waitForTimeout(ms);
  }
}

// O6 bytes = body bytes sent by the host (compressed), counted by the local Pages-like host (scripts/serve-web.mjs,
// /__stats): the browser's own accounting misses worker scripts. Against another host, Playwright's sizes are used.
async function hostBytes(): Promise<number | null> {
  try { return (await (await fetch(new URL("/__stats", BASE))).json()).bytes; } catch { return null; }
}

test("O6 initial WORLD MODE load (desktop 1440×900 and phone 390×844)", async ({ browser }) => {
  const out: any = {};
  for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { ctx, page } = await fresh(browser, BASE, false, vp);
    const w = wire(page);
    const h0 = await hostBytes();
    await page.goto(BASE);
    await ready(page);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:map:rendered").length > 0, null, { timeout: 60_000 });
    if (name === "desktop") await expect(page.getByTestId("world-summary")).toBeVisible();
    await quiet(page);
    const r = await w();
    const h1 = await hostBytes();
    const hb = h0 !== null && h1 !== null ? h1 - h0 : null;
    out[name] = { bytes: hb ?? r.total, method: hb !== null ? "host counter (body bytes, compressed)" : "browser sizes (body+headers)",
      browser_seen_bytes: r.total, files: r.files, largest: r.list.slice(0, 12) };
    await ctx.close();
  }
  RES.O6 = { ...out, target_bytes: 1_000_000, pass: out.desktop.bytes <= 1_000_000 && out.phone.bytes <= 1_000_000 };
  save();
  expect(RES.O6.pass).toBeTruthy();
});

// Pivot = the element's context arrived and drawn: the store's context becomes the element's when its /context
// answer is processed (ObjectMode keeps the previous data while loading, so neither its mark nor its sections are a
// valid signal); then the next frame is painted.
async function pivot(page: Page, id: string) {
  return page.evaluate((i) => new Promise<number>((resolve) => {
    const t0 = performance.now();
    (window as any).__nexum.store.select(i, "inspector");
    const check = () => {
      const c = (window as any).__nexum.store.get().context;
      const err = document.querySelector('[data-testid="object-mode"] [role="alert"]');
      if (c && c.id === i) requestAnimationFrame(() => resolve(performance.now() - t0));
      else if (err) resolve(-1);
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), id);
}

test("O8 pivot on Fast 4G: cold per element and warm (D1)", async ({ browser }) => {
  const { ctx, page } = await fresh(browser);
  await page.goto(BASE);
  await ready(page);
  await quiet(page);
  const list: string[] = [...FX.pivots_d1].slice(0, 30);
  const cold: number[] = [], warm: number[] = [];
  let errors = 0;
  for (const id of list) { const t = await pivot(page, id); if (t < 0) errors++; else cold.push(t); }
  // warm: every element again, each time coming from another (already loaded) element — never the current focus
  const away = [FX.myanmar.quake, FX.myanmar.m67];
  let k = 0;
  for (const id of list) { await pivot(page, away[k++ % 2]); const t = await pivot(page, id); if (t >= 0) warm.push(t); }
  RES.O8 = { network: "Fast 4G (§7.1)", elements: list.length, errors, cold: st(cold), warm: st(warm),
    target: "cold p95 ≤ 1,500 ms, warm p95 ≤ 450 ms", pass: errors === 0 && p(cold, 0.95) <= 1500 && p(warm, 0.95) <= 450 };
  save();
  await ctx.close();
  expect(RES.O8.pass).toBeTruthy();
});

test("O9 first FTS5 search on Fast 4G (5 fresh sessions) and following searches", async ({ browser }) => {
  const first: number[] = [];
  const next: number[] = [], nextLocal: number[] = [];
  for (let i = 0; i < 5; i++) {
    const { ctx, page, cdp } = await fresh(browser);
    await page.goto(BASE);
    await ready(page);
    await quiet(page);
    const t = await page.evaluate(() => new Promise<number>((resolve) => {
      const inp = document.getElementById("nexum-search") as HTMLInputElement;
      const t0 = performance.now();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      inp.focus();
      set.call(inp, "Mandalay");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      const check = () => (document.querySelector("#nexum-results [data-ref]") ? resolve(performance.now() - t0) : requestAnimationFrame(check));
      requestAnimationFrame(check);
    }));
    first.push(t);
    if (i === 0 || i === 1) {
      if (i === 1) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      const into = i === 0 ? next : nextLocal;
      for (const q of ["Tokyo", "Roma", "Chile", "flood", "KBOS", "Heathrow", "Sumatra", "Nepal", "EMSR", "Alaska", "Italy", "Lima"]) {
        // A9-style: from the search request to the processed results (mark set by SearchBox), without the debounce
        into.push(await page.evaluate((qq) => new Promise<number>((resolve) => {
          const inp = document.getElementById("nexum-search") as HTMLInputElement;
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
          const n0 = (window as any).__nexum.apiLog.length;
          set.call(inp, qq);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          const check = () => {
            const log = (window as any).__nexum.apiLog as string[], T = (window as any).__nexum.apiLogT as number[];
            const k = log.findIndex((u, idx) => idx >= n0 && u.includes("/search") && decodeURIComponent(u).includes(`q=${qq}`));
            const mark = performance.getEntriesByName(`nexum:search:${qq}`)[0];
            if (k >= 0 && mark) resolve(mark.startTime - T[k]); else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }), q));
        await page.waitForTimeout(400);
      }
    }
    await ctx.close();
  }
  RES.O9 = { network: "Fast 4G (§7.1)", query: "Mandalay", first: st(first),
    following_fast4g: st(next), following_unthrottled: st(nextLocal),
    target: "first ≤ 6,000 ms from typing (every session, debounce included); following p95 ≤ 150 ms from request to results",
    pass_first: Math.max(...first) <= 6000, pass_following_fast4g: p(next, 0.95) <= 150, pass_following_unthrottled: p(nextLocal, 0.95) <= 150 };
  save();
  expect(RES.O9.pass_first).toBeTruthy();
});

// ── O10: Phase 2 UI benchmarks on the snapshot DataSource ────────────────────
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

test("O10/U2 selection propagation to the four views, cached data (D1)", async ({ browser }) => {
  const { ctx, page } = await fresh(browser, BASE, false);
  await page.goto(BASE);
  await ready(page);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "split" }));
  const list = [...FX.linked_d1, ...FX.pivots_d1, ...FX.relations.slice(0, 10)].slice(0, 100);
  for (const id of list) { await allViews(page, id); await page.waitForTimeout(150); }
  const xs: number[] = [];
  for (const id of list) xs.push(await allViews(page, id));
  RES.U2 = { ...st(xs), target_ms: 100, pass: p(xs, 0.95) <= 100 };
  save();
  await ctx.close();
  expect(RES.U2.pass).toBeTruthy();
});

test("O10/U7 open WHY (D1): 35 R2 insights × 3", async ({ browser }) => {
  const { ctx, page } = await fresh(browser, BASE, false);
  await page.goto(BASE);
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
  RES.U7 = { ...st(xs), target_ms: 300, note: "includes the first load of each insight's precomputed WHY (no network throttling)",
    pass: p(xs, 0.95) <= 300 };
  save();
  await ctx.close();
  expect(RES.U7.pass).toBeTruthy();
});

async function fps(page: Page, drive: () => Promise<void>) {
  await page.evaluate(() => {
    (window as any).__frames = [];
    let last = performance.now();
    const loop = (t: number) => { (window as any).__frames.push(t - last); last = t; if ((window as any).__frames !== null) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await drive();
  const frames: number[] = await page.evaluate(() => { const f = (window as any).__frames.slice(2); (window as any).__frames = null; return f; });
  const rates = frames.filter((d) => d > 0).map((d) => 1000 / d);
  return { frames: rates.length, median_fps: +p(rates, 0.5).toFixed(1), p5_fps: +p(rates, 0.05).toFixed(1) };
}

test.describe("frame rates and heap", () => {

  test("O10/U4 map pan with ≥ 4,000 features (UI-benchmark world snapshot)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(UBENCH);
    await ready(page);
    const c = [12.0, 41.5];
    await page.evaluate(() => performance.clearMarks("nexum:map:rendered"));
    await page.evaluate((cc) => (window as any).__nexum.map.jumpTo({ center: cc, zoom: 7.0 }), c);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:map:rendered").length > 0, null, { timeout: 60_000 });
    await page.waitForTimeout(1000);
    const features = await page.evaluate(() => (window as any).__nexum.store.get().mapInfo?.returned ?? 0);
    const box = (await page.getByTestId("map").boundingBox())!;
    const r = await fps(page, async () => {
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
    RES.U4 = { world: "ubench (snapshot)", features_in_source: features, lod, ...r, target: "median ≥ 50 fps and p5 ≥ 30 fps, ≥ 4,000 features",
      pass: features >= 4000 && r.median_fps >= 50 && r.p5_fps >= 30 };
    save();
    expect(RES.U4.pass).toBeTruthy();
  });


  test("O10/U5 graph of 2,000 nodes / 4,000 edges (UI-benchmark world snapshot)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(UBENCH);
    await ready(page);
    const hub = (await page.evaluate(() => (window as any).__nexum.apiFetch("/search?q=Hub%20sintetico")))
      .body.data.groups.flatMap((g: any) => g.items).find((i: any) => i.label === "Hub sintetico").id;
    await page.evaluate(() => (window as any).__nexum.store.set({ stage: "graph" }));
    await page.locator('[data-depth="2"]').click();
    await page.locator('[data-max-nodes="2000"]').click();
    const xs: number[] = [];
    let order = 0, size = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => (window as any).__nexum.store.select(null, "bench"));
      await page.evaluate((h) => { performance.clearMarks(); (window as any).__nexum.store.select(h, "bench"); }, hub);
      await page.waitForFunction((h) => performance.getEntriesByName(`nexum:graph:frame:${h}`).length > 0
        && performance.getEntriesByName(`nexum:graph:data:${h}`).length > 0, hub, { timeout: 60_000 });
      await page.waitForTimeout(300);
      xs.push(await page.evaluate((h) => performance.getEntriesByName(`nexum:graph:frame:${h}`).at(-1)!.startTime -
        performance.getEntriesByName(`nexum:graph:data:${h}`).at(-1)!.startTime, hub));
      order = await page.evaluate(() => (window as any).__nexum.graph.order());
      size = await page.evaluate(() => (window as any).__nexum.graph.size());
    }
    const aggregates = await page.evaluate(() => (window as any).__nexum.graph.aggregates().length);
    const r = await fps(page, async () => {
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
    const precondition = order >= 2000 && size >= 4000 && aggregates > 0;
    RES.U5 = { world: "ubench (snapshot)", nodes: order, edges: size, aggregate_nodes: aggregates, precondition_2000_4000_met: precondition,
      first_frame: st(xs), interaction: r, target: "2,000 nodes / 4,000 edges; p95 first frame ≤ 1,000 ms; median ≥ 30 fps",
      pass: precondition && p(xs, 0.95) <= 1000 && r.median_fps >= 30 };
    save();
    expect(RES.U5.pass).toBeTruthy();
  });

  test("O10/U6 timeline redraw while brushing, 400 buckets (UI-benchmark world snapshot)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(UBENCH);
    await ready(page);
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-bucket", "year", { timeout: 60_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="timeline"]')!.getAttribute("data-buckets")) >= 400, null, { timeout: 60_000 });
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
    RES.U6 = { world: "ubench (snapshot)", buckets, draws: xs.length, ...st(xs), target_ms: 16, pass: buckets >= 400 && p(xs, 0.95) <= 16 };
    save();
    expect(RES.U6.pass).toBeTruthy();
  });

  test("O10/U9 JS heap over a 200-step scenario (D1 snapshot: D2 is not published online, E7)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await ready(page);
    await page.evaluate(() => (window as any).__nexum.store.set({ stage: "split" }));
    const cdp = await page.context().newCDPSession(page);
    const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(300);
      await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576; };
    const centers = [[96, 21], [139.7, 35.7], [12.5, 41.9], [-70.6, -33.4], [-150, 61], [85.3, 27.7], [100, 0], [-77, -12], [28, 38], [-100, 20]];
    const terms = ["Mandalay", "Tokyo", "Roma", "Chile", "Alaska", "Nepal", "Sumatra", "Lima", "Turkey", "Mexico"];
    const marks: Record<number, number> = {};
    for (let i = 1; i <= 200; i++) {
      const kind = i % 4;
      if (kind === 0) await page.evaluate((id) => (window as any).__nexum.store.select(id, "bench"), FX.pivots_d1[i % FX.pivots_d1.length]);
      else if (kind === 1) await page.evaluate((c) => (window as any).__nexum.map.jumpTo({ center: c, zoom: 3 + ((c[0] * 7) % 5 + 5) % 5 }), centers[i % 10]);
      else if (kind === 2) await page.locator(`[data-depth="${1 + (i % 2)}"]`).click().catch(() => {});
      else await page.locator("#nexum-search").fill(terms[i % 10].slice(0, 5));
      await page.waitForTimeout(250);
      if (i === 100 || i === 200) marks[i] = await heap();
    }
    const growth = (marks[200] - marks[100]) / marks[100];
    RES.U9 = { world: "d1 (snapshot)", heap_mb_100: +marks[100].toFixed(1), heap_mb_200: +marks[200].toFixed(1), growth: +growth.toFixed(3),
      note: "main-thread heap (as in Phase 2); the snapshot worker's heap is not included",
      target: "≤ 300 MB at step 200, growth ≤ 10%", pass: marks[200] <= 300 && growth <= 0.10 };
    save();
    expect(RES.U9.pass).toBeTruthy();
  });
});
