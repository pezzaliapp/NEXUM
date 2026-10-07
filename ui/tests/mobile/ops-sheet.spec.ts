// MOBILE TOOLS SHEET (2026-10-05, physical test on the phone): the palette and a tool's panel are ONE surface — never
// both, never one under the other intercepting touches. The real sequence of the author's test on every device:
// palette → Dirette → use → close → palette → Sentinel-2 → use → close → Livelli → a layer → Satelliti → Navi → close →
// the map again; plus Back, the palette replacing an open panel, and the moving layers switched from the palette.
// Each control is hit-tested at its centre (the element under the finger must be the control), not only found in the DOM.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { check } from "./geometry";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await expect(page.getByTestId("ops-tools")).toBeVisible({ timeout: 30_000 });
  return errors;
}
/** The control is really under the finger: the element at its centre is the control or inside it. */
async function tappable(l: Locator, what: string) {
  await l.scrollIntoViewIfNeeded();
  const ok = await l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return "zero size";
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return "outside the viewport";
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit) || (el as HTMLElement).closest("label")?.contains(hit)) ? "ok"
      : `covered by ${hit?.tagName}.${(hit as HTMLElement)?.className}`;
  });
  expect(ok, `${what} is under the finger`).toBe("ok");
  const b = (await l.boundingBox())!;
  expect(Math.min(b.width, b.height), `${what}: touch size`).toBeGreaterThanOrEqual(l.toString().includes("checkbox") ? 20 : 40);
}
const surfaces = (page: Page) => page.evaluate(() => ({
  palette: !!document.querySelector('[data-testid="ops-rail"]'),
  panels: document.querySelectorAll('section.ops-panel:not(.ops-palette)').length,
}));

test("tools sheet: one surface at a time through the real sequence; Satelliti and Navi reachable; the map usable after", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  // 2 · the palette, labelled
  await page.getByTestId("ops-tools").click();
  await expect(page.getByTestId("ops-rail")).toBeVisible();
  await expect(page.getByTestId("ops-tool-live")).toContainText("Dirette");
  await expect(page.getByTestId("ops-tool-scenes")).toContainText("Sentinel-2");
  await check(page, P, "ops-01-palette");
  // 3–4 · Dirette replaces the palette; its controls are usable
  await tappable(page.getByTestId("ops-tool-live"), "Dirette");
  await page.getByTestId("ops-tool-live").click();
  await expect(page.getByTestId("ops-panel-live")).toBeVisible();
  expect(await surfaces(page)).toEqual({ palette: false, panels: 1 });
  const chan = page.getByTestId("ops-live-channels").locator("button").first();
  await tappable(chan, "a channel of Dirette");
  await tappable(page.getByTestId("ops-panel-close"), "close ×");
  await check(page, P, "ops-02-dirette");
  // 5 · close: nothing left over the map
  await page.getByTestId("ops-panel-close").click();
  expect(await surfaces(page)).toEqual({ palette: false, panels: 0 });
  // 6–8 · palette → Sentinel-2, its search button usable
  await page.getByTestId("ops-tools").click();
  await page.getByTestId("ops-tool-scenes").click();
  await expect(page.getByTestId("ops-panel-scenes")).toBeVisible();
  expect(await surfaces(page)).toEqual({ palette: false, panels: 1 });
  await tappable(page.getByTestId("ops-scenes-search"), "Sentinel-2 search");
  await check(page, P, "ops-03-sentinel");
  // the palette from inside a panel replaces it (never both)
  await page.getByTestId("ops-panel-tools").click();
  expect(await surfaces(page)).toEqual({ palette: true, panels: 0 });
  // 10–13 · Livelli: a layer, then Satelliti and Navi (at the top of the list), the header always reachable
  await page.getByTestId("ops-tool-layers").click();
  await expect(page.getByTestId("ops-panel-layers")).toBeVisible();
  for (const [id, what] of [["ops-layer-orbits", "Satelliti"], ["ops-layer-ais", "Navi"], ["ops-layer-clouds", "a layer"]] as const) {
    const box = page.getByTestId(id).locator("xpath=ancestor::label");
    await tappable(box, what);
  }
  await page.getByTestId("ops-layer-clouds").locator("xpath=ancestor::label").click();
  await expect(page.getByTestId("ops-layer-clouds")).toBeChecked();
  await page.getByTestId("ops-layer-clouds").locator("xpath=ancestor::label").click();
  await expect(page.getByTestId("ops-layer-clouds")).not.toBeChecked();
  await expect(page.getByTestId("ops-panel-layers")).toContainText("posizioni calcolate (SGP4), non osservate");
  await expect(page.getByTestId("ops-panel-layers")).toContainText("solo Mar Baltico");
  // the content scrolls inside the sheet; the close stays reachable at the end
  await page.getByTestId("ops-panel-layers").locator(".ops-pb").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await tappable(page.getByTestId("ops-panel-close"), "close × after scrolling");
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);    // the page never scrolls
  await check(page, P, "ops-04-livelli");
  // 14 · Back closes the sheet
  await page.goBack();
  await expect(page.getByTestId("ops-panel-layers")).toHaveCount(0);
  expect(await surfaces(page)).toEqual({ palette: false, panels: 0 });
  // Satelliti and Navi from the palette itself, said for what they are
  await page.getByTestId("ops-tools").click();
  await expect(page.getByTestId("ops-quick")).toContainText("posizioni calcolate (SGP4), non osservate");
  await expect(page.getByTestId("ops-quick")).toContainText("non è una copertura mondiale");
  await tappable(page.getByTestId("ops-quick-orbits").locator("xpath=ancestor::label"), "Satelliti (palette)");
  await tappable(page.getByTestId("ops-quick-ais").locator("xpath=ancestor::label"), "Navi (palette)");
  await page.getByTestId("ops-palette-close").click();
  // 15 · the map again: its centre is the map itself, nothing invisible over it
  const centre = await page.getByTestId("map").evaluate((el) => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 3);
    return hit ? (el.contains(hit) || hit.classList.contains("maplabels") || !!hit.closest(".maplabels") ? "map" : `${hit.tagName}.${(hit as HTMLElement).className}`) : "none";
  });
  expect(centre).toBe("map");
  expect(errors).toEqual([]);
});
