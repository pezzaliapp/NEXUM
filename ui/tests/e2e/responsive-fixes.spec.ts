// Responsive fixes after the official run (2026-09-29): graph controls never under the tablet inspector, graph labels
// inside the canvas on tablet and phone, one compact graph toolbar row on phone; and the complete investigation
// chain on tablet and phone (desktop: journey.spec.ts).
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { FX, open } from "./helpers";

const M = FX.myanmar;
const OUT = new URL("../../../data/reports/phase2/screens/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const TABLET = { width: 1024, height: 768 }, PHONE = { width: 390, height: 844 };

async function ctx(browser: any, vp: { width: number; height: number }) {
  const c = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 768 });
  return { c, page: await c.newPage() };
}

async function labelsInside(page: Page) {
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const G = (window as any).__nexum.graph;
    G.sigma.refresh();
    return new Promise<any>((res) => requestAnimationFrame(() => {
      const w = G.sigma.getContainer().clientWidth;
      res({ w, boxes: G.labelBoxes() });
    }));
  });
  expect(r.boxes.length).toBeGreaterThan(0);
  for (const [a, b] of r.boxes) { expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(r.w); }
  // visible labels never overlap each other (same text line and intersecting horizontally)
  const overlaps = [];
  for (let i = 0; i < r.boxes.length; i++) for (let j = i + 1; j < r.boxes.length; j++) {
    const [a1, b1, y1] = r.boxes[i], [a2, b2, y2] = r.boxes[j];
    if (Math.abs(y1 - y2) < 12 && a1 < b2 && a2 < b1) overlaps.push([i, j]);
  }
  expect(overlaps).toEqual([]);
}

async function clickNode(page: Page, id: string) {
  const pt = await page.evaluate((i) => {
    const G = (window as any).__nexum.graph;
    const a = G.graph.getNodeAttributes(i);
    return G.sigma.graphToViewport({ x: a.x, y: a.y });
  }, id);
  const box = (await page.getByTestId("graph").boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}

test("fix 1 + 2 — tablet: graph controls are never under the inspector; labels stay inside the canvas", async ({ browser }) => {
  const { c, page } = await ctx(browser, TABLET);
  await open(page, "d1");
  await page.evaluate((id) => { const s = (window as any).__nexum.store; s.set({ stage: "graph" }); s.select(id, "test"); }, M.quake);
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.quake);
  await expect(page.getByTestId("inspector")).toBeVisible();
  const insp = (await page.getByTestId("inspector").boundingBox())!;
  const rights = await page.locator('[data-view="graph"] .view-toolbar > *, [data-view="graph"] .graph-side > *').evaluateAll(
    (els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().right));
  // declared change (mobile architecture of 2026-09-30): the technical chips live under "Opzioni"; the toolbar holds
  // Filtri and Opzioni, and the surface is laid out beside the card
  expect(rights.length).toBeGreaterThanOrEqual(2);
  for (const r of rights) expect(r).toBeLessThanOrEqual(insp.x);
  await page.screenshot({ path: new URL("fix-tablet-graph-inspector.png", OUT).pathname });
  await page.locator(".focushead button", { hasText: "Chiudi" }).click();
  await labelsInside(page);
  await page.screenshot({ path: new URL("fix-tablet-graph-labels.png", OUT).pathname });
  await c.close();
});

test("fix 2 + 3 — phone: one compact graph toolbar row, working filters, labels inside the canvas", async ({ browser }) => {
  const { c, page } = await ctx(browser, PHONE);
  await open(page, "d1");
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), M.mm);
  await page.locator(".tabs button", { hasText: "Grafo" }).click();
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.mm);
  // declared change (2026-10-01): the toolbar also holds Periodo and the graph's statements below the controls;
  // the controls themselves stay one compact row inside the screen
  const ctl = await page.locator('[data-view="graph"] .view-toolbar > button.chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.top, r.right]));
  expect(Math.max(...ctl.map((c) => c[0])) - Math.min(...ctl.map((c) => c[0]))).toBeLessThanOrEqual(4);   // one row
  for (const c of ctl) expect(c[1]).toBeLessThanOrEqual(PHONE.width);
  await expect(page.locator("[data-depth]")).toHaveCount(0);  // no controls without effect on phone (§L: depth 1, 100 nodes)
  await labelsInside(page);
  await page.screenshot({ path: new URL("fix-phone-graph.png", OUT).pathname });
  await page.getByTestId("graph-filters-toggle").click();
  const panel = page.getByTestId("graph-filters");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("graph-phone-limits")).toBeVisible();   // declared change: the limits are in "Opzioni"
  const chip = panel.locator("button.chip").nth(1);
  const before = await chip.getAttribute("class");
  await chip.click();
  expect(await chip.getAttribute("class")).not.toBe(before);    // a relation-type filter really toggles
  const pb = (await panel.boundingBox())!;
  expect(pb.x + pb.width).toBeLessThanOrEqual(PHONE.width);
  await page.screenshot({ path: new URL("fix-phone-graph-filters.png", OUT).pathname });
  await c.close();
});

for (const [name, vp] of [["tablet", TABLET], ["phone", PHONE]] as const) {
  test(`chain on ${name}: world → search → select → object → graph → pivot → timeline → insight → WHY → evidence → new focus`, async ({ browser }) => {
    const { c, page } = await ctx(browser, vp);
    const phone = vp.width < 768;
    const { external, errors } = await open(page, "d1", { blockExternal: true });
    await expect(page.getByTestId("map")).toBeVisible();                                    // WORLD
    // declared change (2026-09-30): on touch layouts search is the "Cerca" button of the bottom navigation
    await page.locator(".tabs button", { hasText: "Cerca" }).click();
    await page.locator("#nexum-search").fill("Mandalay");                                   // Search
    await page.locator(`#nexum-results [data-ref="${M.quake}"]`).click();                   // Select
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);    // Object
    await expect(page.locator('[data-section="insights"]')).toHaveCount(1);
    if (phone) await page.locator(".tabs button", { hasText: "Grafo" }).click();            // Graph
    else { await page.getByRole("button", { name: "Grafo", exact: true }).click(); await page.locator(".focushead button", { hasText: "Chiudi" }).click(); }
    await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.quake);
    await page.waitForTimeout(400);
    await clickNode(page, M.r2);                                                            // pivot (graph node)
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
    await page.locator(".tabs button", { hasText: "Tempo" }).click();                       // Timeline (a surface on touch)
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", M.r2);
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-appears", /mark|in_bucket/);
    // declared change: no "Fuoco" tab — the focus card is always there (phone: opened from its name line)
    if (phone) await page.getByTestId("sheet-handle").click();                              // Insight
    else await page.evaluate(() => (window as any).__nexum.store.set({ inspectorOpen: true }));
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
    await page.locator(`[data-testid="insight-why"][data-why="${M.r2}"]`).click();   // declared change: on phones after the linked elements
    await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
    await expect(page.getByTestId("group-support-0")).toHaveText("0,68");
    await page.locator(`[data-member-evidence="${M.quake}"] [data-raw]`).first().click();   // Evidence / sources
    await expect(page.getByTestId("raw-record").first()).toContainText("us7000pn9s");
    await expect(page.getByTestId("raw-record").first()).toContainText("public-domain");
    await page.getByTestId("why-technical").locator("summary").click();   // declared change: engine details collapsed by default
    await page.locator(`[data-candidate="${M.m67}"] [data-ref]`).click();                   // new focus
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.m67);
    await page.screenshot({ path: new URL(`chain-${name}-end.png`, OUT).pathname });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await c.close();
  });
}
