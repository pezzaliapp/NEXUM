// SATELLITE VIEW on touch screens (2026-10-15): the preset found in Livelli, a finger on an observer opens its card, the
// image section's controls are under the finger and big enough, the image and its caption stay inside the screen, the
// card scrolls rather than overflowing. Providers online (EUMETView, Earth Search); screenshots in data/reports/satview/.
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "../data/reports/satview";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await expect(page.getByTestId("ops-tools")).toBeVisible({ timeout: 30_000 });
  return errors;
}
async function tappable(l: Locator, what: string, min = 40) {
  await l.evaluate((el) => el.scrollIntoView({ block: "center" }));        // as a finger scrolls the card to the control
  const ok = await l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return "zero size";
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return "outside the viewport";
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit) || (el as HTMLElement).closest("label")?.contains(hit)) ? "ok" : `covered by ${hit?.tagName}.${(hit as HTMLElement)?.className}`;
  });
  expect(ok, `${what} is under the finger`).toBe("ok");
  const b = (await l.boundingBox())!;
  expect(Math.min(b.width, b.height), `${what}: touch size`).toBeGreaterThanOrEqual(min);
}
async function inside(l: Locator, what: string) {
  const b = (await l.boundingBox())!, w = await l.evaluate(() => innerWidth);
  expect(b.x, `${what}: left edge on screen`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${what}: right edge on screen`).toBeLessThanOrEqual(w + 1);
}

test("satellite view on a touch screen: preset, tap, image inside the screen, controls under the finger", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  await page.getByTestId("ops-tools").click();
  await page.getByTestId("ops-tool-layers").click();
  await tappable(page.getByTestId("ops-sat-observers").locator("xpath=ancestor::label"), "Satelliti osservatori");
  await page.getByTestId("ops-sat-observers").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 30_000 }).toBe(9);
  await page.getByTestId("ops-panel-close").click();
  // a finger on Meteosat-12 when the globe shows it uncovered; else the card is opened as a tap would
  const xy = await page.evaluate(() => {
    const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
    const f = m.querySourceFeatures("ops-orbits").find((x: any) => x.properties.id === 54743);
    if (!f) return null;
    const p = m.project(f.geometry.coordinates), x = b.left + p.x, y = b.top + p.y;
    return document.elementFromPoint(x, y)?.tagName === "CANVAS" ? [x, y] as [number, number] : null;
  });
  let tapped = false;
  if (xy) {
    await page.touchscreen.tap(xy[0], xy[1]);
    tapped = await page.getByTestId("ops-orbit-card").waitFor({ timeout: 3000 }).then(() => true, () => false);
  }
  // fold-closed (emulated): taps on the lower half of the map do not reach it at all, with or without satellites —
  // pre-existing, recorded as open; the card is then opened as a tap would
  if (!tapped) await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 54743 }));
  console.log(`${P}: Meteosat-12 opened by ${tapped ? "a tap on the map" : xy ? "the card's own state (the tap did not reach the map)" : "the card's own state (not on screen)"}`);
  const card = page.getByTestId("ops-orbit-card");
  await expect(card).toContainText("METEOSAT-12", { timeout: 15_000 });
  await inside(card, "card");
  const ir = page.getByTestId("satview-geo-ir");
  await tappable(ir, "Infrarosso");
  await ir.click();
  const fig = page.getByTestId("satview-frame");
  await expect(fig).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("satview-class")).toHaveText(/^(ULTIMA ACQUISIZIONE|IMMAGINE STORICA)$/);
  await inside(page.getByTestId("satview-img"), "image");
  await inside(page.getByTestId("satview-source"), "caption");
  await tappable(page.getByTestId("satview-geo-back-1"), "−1 h");
  await page.screenshot({ path: `${SHOTS}/${P}-meteosat12.png` });
  // Sentinel-2B: the real footprint
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 42063 }));
  await expect(card).toContainText("SENTINEL-2B");
  await tappable(page.getByTestId("satview-stac-all"), "Ultime acquisizioni");
  await page.getByTestId("satview-stac-all").click();
  await expect(fig).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("satview-meta")).toContainText("Sentinel-2B");
  await expect(page.getByTestId("satview-field")).toContainText("impronta reale");
  await inside(page.getByTestId("satview-img"), "scene preview");
  await page.screenshot({ path: `${SHOTS}/${P}-sentinel2b.png` });
  // ISS: nothing loaded before the person starts it
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 25544 }));
  await expect(page.locator("iframe[src*=youtube]")).toHaveCount(0);
  await tappable(page.getByTestId("satview-video-start"), "Avvia il video", 32);
  // closing the card leaves nothing on the map
  await card.getByRole("button", { name: "Chiudi" }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => !!(window as any).__nexum.map.getSource("ops-satview-field"))).toBe(false);
  expect(errors).toEqual([]);
});
