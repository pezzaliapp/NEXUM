// MOBILE BOTTOM SHEETS (2026-10-05, physical test #4): the map stays the main surface — the tools' sheet and the focus
// card are dragged by their handle between a strip, half and the whole height, and at strip/half the map is really
// usable (it pans; a layer turned on is seen on it). Golden sequences of the author's test, on every device profile:
//   Livelli → Satelliti on → sheet down → globe moved → sheet up → Satelliti off → Navi on → sheet down → map moved → close
//   Italy → card: strip → half → whole → Popolazione → half → map moved → whole
// The handle is dragged with pointer events (as a finger does); the map is moved by a drag on its visible part.
import { expect, test, type Page } from "@playwright/test";
import { check } from "./geometry";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await expect(page.getByTestId("ops-tools")).toBeVisible({ timeout: 30_000 });
  return errors;
}
/** Drag a handle vertically by dy (negative: up). */
async function drag(page: Page, testid: string, dy: number) {
  const b = (await page.getByTestId(testid).boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (dy * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(400);
}
/** The part of the map not covered (above a bottom sheet, left of a side one), as a box. */
const freeMap = (page: Page, sel: string) => page.evaluate((sel) => {
  const m = document.querySelector('[data-testid="map"]')!.getBoundingClientRect();
  const s = document.querySelector(sel)?.getBoundingClientRect();
  const side = !!s && s.width < innerWidth * 0.8;
  return { x0: m.left, y0: m.top, x1: side ? s!.left : m.right, y1: !side && s ? Math.min(m.bottom, s.top) : m.bottom, h: m.height };
}, sel);
/** Move the map by a drag on a free spot of its visible part; returns how far its centre moved (degrees). */
async function panMap(page: Page, sel: string) {
  const f = await freeMap(page, sel);
  const c0 = await page.evaluate(() => (window as any).__nexum.map.getCenter().toArray());
  const spot = await page.evaluate((f) => {
    for (let y = f.y0 + (f.y1 - f.y0) * 0.6; y > f.y0 + 20; y -= 10) for (let x = f.x0 + 40; x < f.x1 - 60; x += 12)
      if (document.elementFromPoint(x, y)?.tagName === "CANVAS" && document.elementFromPoint(x + 40, y)?.tagName === "CANVAS") return [x, y];
    return null;
  }, f);
  expect(spot, "a free spot of the map to drag").not.toBeNull();
  const [x, y] = spot!;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + 7 * i, y);
  await page.mouse.up(); await page.waitForTimeout(600);
  const c1 = await page.evaluate(() => (window as any).__nexum.map.getCenter().toArray());
  return Math.abs(c1[0] - c0[0]) + Math.abs(c1[1] - c0[1]);
}

test("Livelli: switches seen on the map, sheet down, map moved, sheet up, again, close", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  await page.getByTestId("ops-tools").click();
  await page.getByTestId("ops-tool-layers").click();
  const sheet = page.getByTestId("ops-panel-layers");
  await expect(sheet).toHaveAttribute("data-sheet", "half");
  const f = await freeMap(page, "section.ops-sheet");
  expect((f.y1 - f.y0) * (f.x1 - f.x0), "a large part of the map stays in view at half").toBeGreaterThan(0.3 * f.h * (f.x1 - f.x0) * 0.8);
  await check(page, P, "sheet-01-livelli-half");
  // Satelliti on → on the map
  await page.getByTestId("ops-layer-orbits").click();
  await expect(page.getByTestId("ops-layer-orbits")).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 30_000 }).toBeGreaterThan(1000);
  // the sheet down (dragged), the globe moved
  await drag(page, "ops-sheet-handle", 250);
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  expect(await panMap(page, "section.ops-sheet"), "the globe moves under the finger").toBeGreaterThan(0.2);
  // up again (dragged), Satelliti off, Navi on
  await drag(page, "ops-sheet-handle", -150);
  await expect(sheet).toHaveAttribute("data-sheet", /half|full/);
  await page.getByTestId("ops-layer-orbits").click();
  await expect(page.getByTestId("ops-layer-orbits")).not.toBeChecked();
  await page.getByTestId("ops-layer-ais").click();
  await expect(page.getByTestId("ops-layer-ais")).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getLayer("ops-ais") ? (window as any).__nexum.map.getLayoutProperty("ops-ais", "visibility") ?? "visible" : "absent"), { timeout: 20_000 }).toBe("visible");
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 10_000 }).toBe(0);
  await drag(page, "ops-sheet-handle", 300);
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  expect(await panMap(page, "section.ops-sheet"), "the map moves under the finger").toBeGreaterThan(0.2);
  await page.getByTestId("ops-panel-close").click();
  await expect(page.locator("section.ops-sheet")).toHaveCount(0);
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("ais", false); });
  expect(errors).toEqual([]);
});

test("Country View: strip → half → whole → Popolazione → half → map moved → whole", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  const sheetLayout = await page.evaluate(() => innerWidth < 700);
  test.skip(!sheetLayout, "a side panel beside the map on this width (the map is never covered)");
  await page.locator('[data-tab="search"]').click();
  await page.locator("#nexum-search").fill("Italia");
  await page.locator("#nexum-results [data-ref]").first().click();
  await expect(page.getByTestId("place-view")).toBeVisible({ timeout: 30_000 });
  const st = () => page.evaluate(() => (window as any).__nexum.store.get().sheet);
  // strip
  await drag(page, "sheet-handle", 400);
  await expect.poll(st).toBe("mini");
  // half: the overview with the map above
  await drag(page, "sheet-handle", -200);
  await expect.poll(st).toBe("peek");
  await expect(page.getByTestId("place-view")).toBeVisible();
  const f = await freeMap(page, ".insp");
  expect(f.y1 - f.y0, "the map in view above the card at half").toBeGreaterThan(f.h * 0.3);
  await check(page, P, "sheet-02-italy-half");
  // whole
  await drag(page, "sheet-handle", -400);
  await expect.poll(st).toBe("full");
  // Popolazione keeps the height; then down to half, the map moved, up again
  await page.getByTestId("section-popolazione").click();
  await expect.poll(st).toBe("full");
  await drag(page, "sheet-handle", 300);
  await expect.poll(st).toBe("peek");
  await expect(page.getByTestId("section-popolazione")).toHaveAttribute("aria-pressed", "true");
  expect(await panMap(page, ".insp"), "the map moves under the finger with the card at half").toBeGreaterThan(0.2);
  await drag(page, "sheet-handle", -400);
  await expect.poll(st).toBe("full");
  expect(errors).toEqual([]);
});
