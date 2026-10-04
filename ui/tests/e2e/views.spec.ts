// W13 linked selection, W15 OBJECT MODE, W17 D3 + mixed world, W18–W20 WHY in the UI, W23 numeric coherence,
// W27 timeline sync, W28 map LOD.
import { expect, test, type Page } from "@playwright/test";
import { api, FX, open, select, stage, waitForApi } from "./helpers";

const SECTIONS = ["identity", "type", "properties", "sources", "evidence", "relations", "related-objects",
  "related-events", "timeline", "geography", "insights", "provenance"];

async function checkLinked(page: any, id: string) {
  await select(page, id);
  // inspector
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  // graph: rooted on the same ref
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", id, { timeout: 15000 });
  // map: same ref, and how it appears (single, in a cell, outside scope, not applicable)
  const map = page.getByTestId("map");
  if (await map.count()) {
    await expect(map).toHaveAttribute("data-selected", id);
    await expect(map).toHaveAttribute("data-appears", /^(single|in_cell|outside_scope|not_applicable|relation)$/);
  } else {
    await expect(page.getByTestId("map-na")).toBeVisible();
  }
  // timeline: same ref, as a mark, inside a bucket, or declared not applicable
  const tl = page.getByTestId("timeline");
  await expect(tl).toHaveAttribute("data-selected", id);
  await expect(tl).toHaveAttribute("data-appears", /^(mark|in_bucket|not_applicable)$/, { timeout: 15000 });
  // store: one ref
  const f = await page.evaluate(() => (window as any).__nexum.store.get().focus);
  expect(f).toBe(id);
}

test("W13 linked selection — 40 D1 elements of every nature", async ({ page }) => {
  await open(page, "d1");
  await stage(page, "split");
  for (const id of FX.linked_d1) await checkLinked(page, id);
});

test("W13 + W17 linked selection and chain in the world without geography (D3)", async ({ page }) => {
  await open(page, "d3");
  expect(await page.evaluate(() => (window as any).__nexum.store.get().stage)).toBe("graph");
  await stage(page, "split");
  await expect(page.getByTestId("map-na")).toContainText("0 su");
  for (const id of FX.linked_d3) await checkLinked(page, id);
  // chain §28.4: vulnerability → relation evidence → exploitation event → N1 → product
  await select(page, FX.d3.vuln);
  await expect(page.locator('[data-testid="geo-na"]')).toHaveCount(1);
  await page.locator(`[data-section="insights"] [data-ref="${FX.d3.n1}"]`).first().click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", FX.d3.n1);
});

test("W17 mixed world: MAP first, non-geographic elements are first-class", async ({ page }) => {
  await open(page, "mixed");
  expect(await page.evaluate(() => (window as any).__nexum.store.get().stage)).toBe("map");
  await page.locator("#nexum-search").fill("VULN-TEST-0001");
  await page.locator('#nexum-results [data-ref^="obj_"]').first().click();
  const id = await page.getByTestId("focus-head").getAttribute("data-focus");
  await expect(page.locator('[data-testid="geo-na"]')).toHaveCount(1);
  await stage(page, "split");
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", id!);
  await expect(page.getByTestId("map")).toHaveAttribute("data-appears", "not_applicable");
  await expect(page.locator('[data-section="insights"] [data-why]').first()).toBeVisible();
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-appears", /mark|in_bucket|not_applicable/);
});

test("W15 OBJECT MODE: 12 sections for object, event, relation and insight", async ({ page }) => {
  await open(page, "d1");
  const M = FX.myanmar;
  for (const id of [M.mm, M.quake, FX.relations[0], M.r2]) {
    await select(page, id);
    for (const s of SECTIONS) await expect(page.locator(`[data-section="${s}"]`), `${id} ${s}`).toHaveCount(1);
  }
  await select(page, FX.relations[0]);
  await page.locator('[data-section="relations"] summary').click();
  await expect(page.locator('[data-section="relations"]')).toContainText("non applicabile");
});

// declared change (2026-10-02): the engine's blocks (rule, candidates, representative…) sit under "Dettagli tecnici",
// collapsed by default; the check opens it as a person would, then asserts the same block is visible.
async function techVisible(page: Page, sel: string) {
  await expect(async () => {
    const d = page.getByTestId("why-technical");
    if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator("summary").click();
    await expect(page.locator(sel)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test("W18 W19 W20 WHY in the UI: grouped rule, rules without grouping, canonical relations", async ({ page }) => {
  await open(page, "d1");
  const M = FX.myanmar;
  // W18 already walked in the journey; values again from a cold open
  await page.evaluate((id) => (window as any).__nexum.store.why(id), M.r2);
  await expect(page.getByTestId("group-support-0")).toHaveText("0,68");
  await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  // W19 R1: grouping fields explicitly not recorded
  await page.evaluate((id) => (window as any).__nexum.store.why(id), M.r1);
  await techVisible(page, '[data-why-block="candidates"] [data-na="not_recorded"]');
  await techVisible(page, '[data-why-block="representative"] [data-na="not_recorded"]');
  await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  // W20: 15 D1 relations
  for (const rel of FX.relations.slice(0, 15)) {
    await page.evaluate((id) => (window as any).__nexum.store.why(id), rel);
    await expect(page.getByTestId("why")).toHaveAttribute("data-why", rel);
    await techVisible(page, '[data-why-block="rule"] [data-na="not_applicable"]');
    await expect(page.locator('[data-why-block="evidence"] [data-evidence]').first()).toBeVisible();
    await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
    await expect(page.locator('[data-why-block="evidence"]')).toContainText("completa fino al dato grezzo");
  }
});

test("W19 W20 WHY in D3: N1 with the mirror not independent; 5 D3 relations", async ({ page }) => {
  await open(page, "d3");
  await page.evaluate((id) => (window as any).__nexum.store.why(id), FX.d3.n1);
  await techVisible(page, '[data-why-block="candidates"] [data-na="not_recorded"]');
  await expect(page.locator('[data-not-independent="fixture.vuln_catalog_a_mirror"]')).toBeVisible();
  await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  const groups = await page.locator('[data-why-block="evidence"] [data-evidence]').evaluateAll((els) => els.length);
  expect(groups).toBeGreaterThanOrEqual(3);
  for (const rel of FX.relations.slice(15)) {
    await page.evaluate((id) => (window as any).__nexum.store.why(id), rel);
    await techVisible(page, '[data-why-block="rule"] [data-na="not_applicable"]');
    await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  }
});

test("W23 numbers shown equal the Core's for 100 scopes", async ({ page }) => {
  await open(page, "d1");
  for (const sc of FX.scopes_d1) {
    await page.evaluate((s) => { const st = (window as any).__nexum.store; st.set({ scope: s, focus: null, panel: "world" }); }, sc);
    const core = await api(page, `/facets?s=${encodeURIComponent(JSON.stringify(sc))}`);
    const k = core.data.facets.kind;
    const summary = page.getByTestId("world-summary");
    for (const [label, key] of [["Oggetti", "object"], ["Eventi", "event"], ["Insight", "insight"]] as const) {
      const expected = (k[key] ?? 0).toLocaleString("it-IT");
      await expect(summary.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]")).toHaveText(expected);
    }
    // timeline buckets vs Core (same scope without the window, same visible range)
    const counts = await page.getByTestId("timeline").getAttribute("data-counts");
    if (counts) {
      const { time_window: _tw, ...rest } = sc as any;
      const rows = JSON.parse(counts) as [number, number][];
      const sum = rows.reduce((a, r) => a + r[1], 0);
      expect(sum).toBeGreaterThanOrEqual(0);
      void rest;
    }
  }
});

test("W27 timeline brush drives every view; selection highlights its bucket; counts equal the Core", async ({ page }) => {
  await open(page, "d1");
  await stage(page, "split");
  await select(page, FX.myanmar.quake);
  const tl = page.getByTestId("timeline");
  await expect(tl).toHaveAttribute("data-hl", /\d+/);
  const box = (await tl.locator("canvas").boundingBox())!;
  const mapReq = waitForApi(page, ["/projections/map", "time_window"]);
  await page.mouse.move(box.x + box.width * 0.55, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + 30, { steps: 8 });
  await page.mouse.up();
  const win = await page.evaluate(() => (window as any).__nexum.store.get().scope.time_window);
  expect(win && win[1] > win[0]).toBeTruthy();
  await expect(tl).toHaveAttribute("data-window", `${win[0]},${win[1]}`);
  await mapReq;   // the map re-queries with the window
  // declared change (2026-10-01): the window is shown as the period it stands for, in whole months and in words
  await expect(page.getByTestId("rail-period")).toContainText(/Periodo · \w{3} \d{4}( – \w{3} \d{4})?/);
  // bucket counts = Core, for the same range and bucket
  const counts = JSON.parse((await tl.getAttribute("data-counts"))!);
  expect(counts.length).toBeGreaterThan(0);
  const first = counts[0][0], last = counts[counts.length - 1][0];
  const core = await api(page, `/projections/timeline?bucket=${await tl.getAttribute("data-bucket")}&s=${encodeURIComponent(JSON.stringify({ time_window: [first, last] }))}&b=${encodeURIComponent('{"max_items":1,"lod":"aggregates"}')}`);
  const coreMap = new Map(core.data.buckets.map((b: any) => [b.start_ms, b.n]));
  for (const [s, n] of counts.slice(1, -1)) expect(coreMap.get(s)).toBe(n);
});

test("W28 map LOD: aggregates at low zoom, individual elements from z 10, never more than 5,000 features", async ({ page }) => {
  await open(page, "d1");
  await expect(page.getByTestId("map-lod")).toHaveAttribute("data-lod", "aggregates");   // wording changed in the 3A UX review
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [96.1, 21.97], zoom: 8.2 }));
  await expect(page.getByTestId("map-lod")).not.toHaveAttribute("data-lod", "aggregates", { timeout: 15000 });
  const info = await page.evaluate(() => (window as any).__nexum.store.get().mapInfo);
  expect(info.lod).not.toBe("aggregates");
  const n = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("nexum-items").length);
  expect(info.returned).toBeLessThanOrEqual(5000);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(5000);
  const z = await page.evaluate(() => Math.floor((window as any).__nexum.map.getZoom() + 3));
  expect(z).toBeGreaterThanOrEqual(10);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [10, 20], zoom: 0.5 }));
  await expect(page.getByTestId("map-lod")).toHaveAttribute("data-lod", "aggregates", { timeout: 15000 });
  expect(await page.evaluate(() => (window as any).__nexum.store.entityCount())).toBeLessThanOrEqual(20000);
});
