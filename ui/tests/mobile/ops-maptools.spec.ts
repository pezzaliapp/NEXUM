// MAP TOOLS ON A PHONE (2026-10-05, physical test #3): a tool that needs taps on the map opens as a COMPACT bottom
// sheet — the map above it visible and really tappable. Golden: Disegno e misure → Raggio → two real taps on the map →
// the result → delete → draw again → back to Strumenti → close. The same for Area, Riquadro, Percorso; and choosing a
// point by a tap for Punto, Percorso (from/to) and Cielo. Every tool opens in the state of its class (map/hybrid compact,
// informational expanded) and can switch. Taps are real touch events at screen points, checked to land on the map.
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
async function tool(page: Page, id: string) {
  await page.getByTestId("ops-tools").click();
  await page.getByTestId(`ops-tool-${id}`).click();
  await expect(page.getByTestId(`ops-panel-${id}`)).toBeVisible();
}
/** Points of the map still visible beside the sheet — near the wished fractions of that free area — each one where the
 *  element under the finger is the map's own canvas (not a name, a chip or a legend over it). */
async function mapPoints(page: Page, fr: [number, number][]) {
  const pts = await page.evaluate((fr) => {
    const m = document.querySelector('[data-testid="map"]')!.getBoundingClientRect();
    const sh = document.querySelector("section.ops-sheet")?.getBoundingClientRect();
    const side = !!sh && sh.width < innerWidth * 0.8;
    const x0 = m.left + 10, x1 = (side ? sh!.left : m.right) - 50, y0 = m.top + 10, y1 = (!side && sh ? Math.min(m.bottom, sh.top) : m.bottom) - 10;
    const free = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName === "CANVAS";
    const out: [number, number][] = [];
    for (const [fx, fy] of fr) {
      const tx = x0 + fx * (x1 - x0), ty = y0 + fy * (y1 - y0);
      let best: [number, number] | null = null, bd = Infinity;
      for (let y = y0; y <= y1; y += 8) for (let x = x0; x <= x1; x += 8) {
        if (!free(x, y) || out.some(([a, b]) => Math.hypot(a - x, b - y) < 30)) continue;
        const d = Math.hypot(x - tx, y - ty);
        if (d < bd) { bd = d; best = [Math.round(x), Math.round(y)]; }
      }
      if (best) out.push(best);
    }
    return { out, area: (x1 - x0) * (y1 - y0) };
  }, fr);
  expect(pts.area, "a usable area of map beside the sheet").toBeGreaterThan(150 * 120);
  expect(pts.out.length, "free points of the map to tap").toBe(fr.length);
  return pts.out;
}
async function tapAt(page: Page, [x, y]: [number, number]) { await page.touchscreen.tap(x, y); await page.waitForTimeout(450); }

test("golden: Raggio drawn with two real taps on the map, result, delete, again, back to Strumenti, close", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  await tool(page, "draw");
  await expect(page.getByTestId("ops-panel-draw")).toHaveAttribute("data-sheet", "half");
  await page.getByTestId("ops-draw-radius").click();
  await expect(page.getByTestId("ops-panel-draw")).toHaveAttribute("data-sheet", "peek");   // a tap on the map is needed: the strip
  await expect(page.getByTestId("ops-draw-hint")).toBeVisible();
  const [a, b] = await mapPoints(page, [[0.3, 0.5], [0.7, 0.5]]);
  await tapAt(page, a); await tapAt(page, b);
  const shape = page.getByTestId("ops-shape");
  await expect(shape).toHaveCount(1, { timeout: 10_000 });
  await expect(shape.first()).toContainText("Raggio");
  await expect(shape.first()).toContainText(/km²|m²/);
  await expect(page.getByTestId("ops-panel-draw")).toHaveAttribute("data-sheet", "half");   // back to half: the result is read
  await check(page, P, "maptools-01-raggio");
  // the result is drawn on the map
  expect(await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-shapes").length)).toBeGreaterThan(0);
  // change: delete, then draw it again (the tool stays usable)
  await shape.first().getByRole("button", { name: "Elimina" }).click();
  await expect(shape).toHaveCount(0);
  await page.getByTestId("ops-draw-radius").click();
  const [c, d] = await mapPoints(page, [[0.4, 0.4], [0.6, 0.7]]);
  await tapAt(page, c); await tapAt(page, d);
  await expect(shape).toHaveCount(1, { timeout: 10_000 });
  // back to Strumenti, then close: nothing left over the map
  await page.getByTestId("ops-panel-tools").click();
  await expect(page.getByTestId("ops-rail")).toBeVisible();
  await page.getByTestId("ops-palette-close").click();
  await expect(page.locator("section.ops-sheet")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("nexum.aoi.shapes.v1"));
  expect(errors).toEqual([]);
});

test("Area, Riquadro and Percorso drawn with real taps on the visible map", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => localStorage.removeItem("nexum.aoi.shapes.v1"));
  await tool(page, "draw");
  const shapes = page.getByTestId("ops-shape");
  await page.getByTestId("ops-draw-box").click();
  for (const p of await mapPoints(page, [[0.2, 0.3], [0.5, 0.8]])) await tapAt(page, p);
  await expect(shapes).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId("ops-draw-area").click();
  for (const p of await mapPoints(page, [[0.6, 0.3], [0.9, 0.35], [0.75, 0.8]])) await tapAt(page, p);
  await page.getByTestId("ops-draw-hint").getByRole("button", { name: "Fine" }).click();
  await expect(shapes).toHaveCount(2, { timeout: 10_000 });
  await page.getByTestId("ops-draw-path").click();
  for (const p of await mapPoints(page, [[0.1, 0.9], [0.5, 0.5], [0.9, 0.2]])) await tapAt(page, p);
  await page.getByTestId("ops-draw-hint").getByRole("button", { name: "Fine" }).click();
  await expect(shapes).toHaveCount(3, { timeout: 10_000 });
  await expect(shapes.nth(0)).toContainText("Riquadro");
  await expect(shapes.nth(1)).toContainText("Area");
  await expect(shapes.nth(2)).toContainText("Percorso");
  await page.evaluate(() => localStorage.removeItem("nexum.aoi.shapes.v1"));
  expect(errors).toEqual([]);
});

test("a point chosen by a tap: Punto, Percorso (from and to), Cielo", async ({ page }) => {
  const errors = await open(page);
  await tool(page, "point");
  await expect(page.getByTestId("ops-panel-point")).toHaveAttribute("data-sheet", "half");
  await page.getByTestId("ops-pick-point").click();
  await expect(page.getByTestId("ops-pick-hint")).toBeVisible();
  await tapAt(page, (await mapPoints(page, [[0.5, 0.5]]))[0]);
  await expect(page.getByTestId("ops-point-coords")).toBeVisible({ timeout: 10_000 });
  // Percorso: the start and the end tapped on the map
  await page.getByTestId("ops-panel-tools").click();
  await page.getByTestId("ops-tool-route").click();
  await page.getByTestId("ops-route-from-pick").click();
  await tapAt(page, (await mapPoints(page, [[0.3, 0.5]]))[0]);
  await expect(page.getByTestId("ops-route-from")).toHaveValue(/°/);
  await page.getByTestId("ops-route-to-pick").click();
  await tapAt(page, (await mapPoints(page, [[0.7, 0.5]]))[0]);
  await expect(page.getByTestId("ops-route-to")).toHaveValue(/°/);
  // Cielo: the observer tapped on the map
  await page.getByTestId("ops-panel-tools").click();
  await page.getByTestId("ops-tool-sky").click();
  await page.getByTestId("ops-sky-pick").click();
  await tapAt(page, (await mapPoints(page, [[0.5, 0.4]]))[0]);
  await expect(page.getByTestId("ops-sky-observer")).toContainText("°", { timeout: 10_000 });
  // while a pick was armed the map's own taps did not open anything else
  expect(await page.evaluate(() => (window as any).__nexum.store.get().focus)).toBeNull();
  expect(errors).toEqual([]);
});

test("every tool opens at half (the map in view) and can switch to the whole height; Back closes the sheet", async ({ page }) => {
  const errors = await open(page);
  const ids = ["layers", "draw", "point", "route", "sky", "cams", "alerts", "scenes", "import", "live", "space", "markets", "registers", "net", "ai", "style", "share", "help"];
  for (const id of ids) {
    await tool(page, id);
    const sheet = page.getByTestId(`ops-panel-${id}`);
    expect(await sheet.getAttribute("data-class"), id).not.toBeNull();
    await expect(sheet, id).toHaveAttribute("data-sheet", "half");
    await page.getByTestId("ops-sheet-toggle").click();
    await expect(sheet).toHaveAttribute("data-sheet", "full");
    await page.getByTestId("ops-sheet-toggle").click();
    await expect(sheet).toHaveAttribute("data-sheet", "half");
    await page.getByTestId("ops-panel-close").click();
    await expect(sheet).toHaveCount(0);
  }
  await tool(page, "layers");
  await page.goBack();
  await expect(page.locator("section.ops-sheet")).toHaveCount(0);
  expect(errors).toEqual([]);
});
