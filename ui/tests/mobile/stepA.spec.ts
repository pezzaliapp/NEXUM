// STEP A (Phase 3B, 2026-10-03) — graph names never overlap and the focus is named; the narrow-phone graph keeps the
// room; the detail reads RESULT → LINKED ELEMENTS → PERCHÉ / SOURCES → TECHNICAL DETAILS (collapsed, still complete).
// Runs on every mobile project (iPhone portrait/landscape WebKit, Fold closed/open Chrome) with the geometric checks.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { check } from "./geometry";

const M = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8")).myanmar;
const PORTS = "ins_uxh6pbtiezarfj64sk6z3qayfa";      // "Porti vicino a un tsunami: Tsunami · Flores Sea (2026)"

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  return errors;
}

async function labelsOf(page: Page) {
  await page.waitForTimeout(500);
  return page.evaluate(() => new Promise<any>((res) => {
    const G = (window as any).__nexum.graph;
    G.sigma.refresh();
    requestAnimationFrame(() => {
      const c = G.sigma.getContainer();
      res({ w: c.clientWidth, h: c.clientHeight, labels: G.labels() });
    });
  }));
}

for (const [who, id] of [["Mandalay earthquake", M.quake], ["EMSR798 activation", M.act]] as const)
test(`graph (${who}): names never overlap, stay inside, the focus is named; the narrow graph keeps its room`, async ({ page }, info) => {
  const errors = await open(page);
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), id);
  await page.locator('[data-tab="graph"]').click();
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", id, { timeout: 30_000 });
  const r = await labelsOf(page);
  expect(r.labels.length).toBeGreaterThan(1);
  expect(r.labels.map((l: any) => l.key)).toContain(id);                            // the focus is named
  for (const l of r.labels) { expect(l.x1).toBeGreaterThanOrEqual(0); expect(l.x2).toBeLessThanOrEqual(r.w); expect(l.y1).toBeGreaterThanOrEqual(-1); expect(l.y2).toBeLessThanOrEqual(r.h + 1); }
  const hits: string[] = [];
  for (let i = 0; i < r.labels.length; i++) for (let j = i + 1; j < r.labels.length; j++) {
    const a = r.labels[i], b = r.labels[j];
    if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1) hits.push(`${a.key}×${b.key}`);
  }
  expect(hits, "overlapping names").toEqual([]);
  // the drawing area visible between the statements and the card/bottom bar is not a strip (Fold closed: was ~40 px)
  const room = await page.evaluate(() => {
    const g = document.querySelector('[data-testid="graph"]')!.getBoundingClientRect();
    const covers = [...document.querySelectorAll(".insp, .card-strip, [data-testid='bottom-nav']")].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
    const bottom = Math.min(g.bottom, ...covers.map((b) => b.top).filter((t) => t > g.top));
    return bottom - g.top;
  });
  expect(room, "visible drawing height").toBeGreaterThanOrEqual(page.viewportSize()!.height < 500 ? 100 : 250);
  // geometry of the whole screen (same focus as the existing journey's graph step: its card title fits the mini sheet;
  // the long Mandalay title is cut in the mini sheet as before STEP A — reported, not part of this step)
  if (id === M.act) await check(page, info.project.name, "A1-grafo");
  expect(errors).toEqual([]);
});

test("detail: result → linked elements → Perché? → sources; technical details collapsed but complete", async ({ page }, info) => {
  const errors = await open(page);
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), PORTS);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", PORTS);
  await expect(page.getByTestId("insight-sentence")).toContainText("2,9 m");
  // linked elements with their distances, in the human block
  const conn = page.getByTestId("connections");
  for (const [port, km] of [["Ende", "66,8 km"], ["Maumere", "101 km"], ["Larantuka", "179,5 km"], ["Waingapu", "192,9 km"]]) {
    const row = conn.locator(".conn-row", { hasText: port });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(km);
  }
  // reading order in the card
  const order = await page.evaluate(() => {
    const at = (sel: string) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + (e.closest(".pbody")?.scrollTop ?? 0) : null; };
    return { conn: at('[data-testid="connections"]'), why: at('[data-testid="insight-why"]'), sources: at('[data-section="sources"]'), tech: at('[data-testid="detail-technical"]') };
  });
  expect(order.conn!).toBeLessThan(order.sources!);
  expect(order.sources!).toBeLessThan(order.tech!);
  if (order.why != null && page.viewportSize()!.width < 700) expect(order.why).toBeLessThan(order.sources!);
  // technical details: collapsed, members with internal roles (#000…) not visible, but present and reachable
  const tech = page.getByTestId("detail-technical");
  await expect(tech).toHaveJSProperty("open", false);
  await expect(page.locator('[data-section="properties"]')).toHaveCount(1);
  // collapsed = the container is as tall as its own summary line (the members are not laid out on screen)
  const [hTech, hSum] = await tech.evaluate((e) => [e.getBoundingClientRect().height, e.querySelector(":scope > summary")!.getBoundingClientRect().height]);
  expect(hTech - hSum, "technical details collapsed").toBeLessThanOrEqual(2);
  if (page.viewportSize()!.width < 700) await page.getByTestId("sheet-more").click().catch(() => {});
  await check(page, info.project.name, "A2-dettaglio");
  await tech.scrollIntoViewIfNeeded();
  await page.screenshot({ path: new URL(`../../../data/reports/phase3/mobile/${info.project.name}/A2-dettagli-tecnici-chiusi.jpg`, import.meta.url).pathname, type: "jpeg", quality: 70 });
  await tech.locator(":scope > summary").click();
  await expect(tech).toHaveJSProperty("open", true);
  await expect(page.locator('[data-section="properties"]')).toContainText("#000");
  await expect(page.locator('[data-section="identity"]')).toBeVisible();
  expect(errors).toEqual([]);
});
