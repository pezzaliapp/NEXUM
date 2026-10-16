// SATELLITE VIEW (2026-10-15): tap an observing satellite → its card → what THAT satellite observed, with class, source,
// satellite, instrument and UTC time; the field on the map said as what it is; an unavailable service said and never
// blocking. Needs the providers online (EUMETView, Earth Search, NASA GIBS/CMR, YouTube): checks are on structure and
// meaning, never on fixed values. Screenshots: data/reports/satview/.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const SHOTS = "../data/reports/satview";

async function open(page: Page, vp = { width: 1440, height: 900 }) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(vp);
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
async function observers(page: Page) {
  await page.getByTestId("ops-tool-layers").click();
  await page.getByTestId("ops-sat-observers").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 30_000 }).toBe(9);
  await page.getByTestId("ops-panel-close").click();
}
/** The screen point of one satellite as drawn now. */
async function where(page: Page, norad: number) {
  return page.evaluate((norad) => {
    const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
    const f = m.querySourceFeatures("ops-orbits").find((x: any) => x.properties.id === norad);
    if (!f) return null;
    const p = m.project(f.geometry.coordinates);
    return [b.left + p.x, b.top + p.y] as [number, number];
  }, norad);
}
const UTC = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2} UTC| \(solo data, UTC\))$/;

test("the preset shows only the observers; a tap on Meteosat-12 opens its card; its newest full disc, then an older one", async ({ page }) => {
  const errors = await open(page);
  await observers(page);
  await expect.poll(() => where(page, 54743), { timeout: 15_000 }).not.toBeNull();
  const xy = (await where(page, 54743))!;
  await page.mouse.click(xy[0], xy[1]);
  const card = page.getByTestId("ops-orbit-card");
  await expect(card).toContainText("METEOSAT-12");
  await expect(page.getByTestId("satview")).toHaveAttribute("data-kind", "geo");
  await expect(page.getByTestId("satview-field")).toContainText("Orizzonte calcolato");
  // nothing asked of the service before the tap
  await expect(page.getByTestId("satview-frame")).toHaveCount(0);
  // the infrared disc (10.5 µm) has content at any hour: the true-colour one 6 h ago may be all night (black), and
  // a black frame is said NON DISPONIBILE, never shown
  await page.getByTestId("satview-geo-ir").click();
  const fig = page.getByTestId("satview-frame");
  await expect(fig).toBeVisible({ timeout: 40_000 });
  await expect(fig).toHaveAttribute("data-class", /^(latest|historical)$/);
  await expect(page.getByTestId("satview-time")).toHaveText(UTC);
  await expect(page.getByTestId("satview-meta")).toContainText("Meteosat-12");
  await expect(page.getByTestId("satview-meta")).toContainText("FCI");
  await expect(page.getByTestId("satview-source")).toContainText("EUMETSAT");
  const t0 = await page.getByTestId("satview-time").textContent();
  await page.screenshot({ path: `${SHOTS}/desk-meteosat12.png` });
  await page.getByTestId("satview-geo-back-6").click();
  await expect(fig).toHaveAttribute("data-class", "historical", { timeout: 40_000 });
  const t6 = await page.getByTestId("satview-time").textContent();
  expect(Date.parse(t0!.replace(" UTC", "Z").replace(" ", "T")) - Date.parse(t6!.replace(" UTC", "Z").replace(" ", "T"))).toBe(6 * 3_600_000);
  expect(errors).toEqual([]);
});

test("Sentinel-2C: its own newest scenes, the real footprint on the map, platform and time from the catalogue", async ({ page }) => {
  const errors = await open(page);
  await observers(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 60989 }));
  await expect(page.getByTestId("satview")).toHaveAttribute("data-kind", "stac");
  await expect(page.getByTestId("satview-field")).toContainText("Campo teorico");
  await page.getByTestId("satview-stac-all").click();
  const fig = page.getByTestId("satview-frame");
  await expect(fig).toBeVisible({ timeout: 40_000 });
  await expect(fig).toHaveAttribute("data-class", /^(latest|historical)$/);
  await expect(page.getByTestId("satview-meta")).toContainText("Sentinel-2C");
  await expect(page.getByTestId("satview-meta")).toContainText("MSI");
  await expect(page.getByTestId("satview-time")).toHaveText(UTC);
  await expect(page.getByTestId("satview-field")).toContainText("impronta reale");
  await expect(page.locator("[data-testid=satview-img]")).toHaveJSProperty("complete", true, { timeout: 30_000 });
  expect(await page.evaluate(() => (document.querySelector("[data-testid=satview-img]") as HTMLImageElement).naturalWidth)).toBeGreaterThan(50);
  await page.screenshot({ path: `${SHOTS}/desk-sentinel2c.png` });
  expect(errors).toEqual([]);
});

test("NOAA-21: the daily mosaic said as such, with the instrument's newest delivery from NASA CMR", async ({ page }) => {
  const errors = await open(page);
  await observers(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 54234 }));
  await expect(page.getByTestId("satview")).toHaveAttribute("data-kind", "daily");
  await page.getByTestId("satview-daily-sub").click();
  await expect(page.getByTestId("satview-state")).toContainText("NASA CMR", { timeout: 40_000 });
  const fig = page.getByTestId("satview-frame"), none = page.getByTestId("satview-none");
  await expect(fig.or(none)).toBeVisible({ timeout: 40_000 });
  if (await fig.count()) {
    await expect(fig).toContainText("MOSAICO GIORNALIERO");
    await expect(page.getByTestId("satview-time")).toHaveText(/\(solo data, UTC\)$/);
    await expect(page.getByTestId("satview-meta")).toContainText("NOAA-21");
  }
  await page.screenshot({ path: `${SHOTS}/desk-noaa21.png` });
  expect(errors).toEqual([]);
});

test("ISS: nothing loaded until the person starts it; LIVE only when the player says live", async ({ page }) => {
  const errors = await open(page);
  await observers(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 25544 }));
  await expect(page.getByTestId("satview")).toHaveAttribute("data-kind", "video");
  await expect(page.locator("iframe[src*=youtube]")).toHaveCount(0);
  await expect(page.getByTestId("satview-field")).toContainText("Orizzonte calcolato");
  await page.getByTestId("satview-video-start").click();
  await expect(page.locator("iframe[src*='youtube-nocookie.com/embed/videoseries']")).toHaveCount(1);
  const v = page.getByTestId("satview-video");
  await expect.poll(() => v.getAttribute("data-class"), { timeout: 30_000 }).not.toBe("pending");
  const cls = await v.getAttribute("data-class");
  const txt = await page.getByTestId("satview-video-state").textContent();
  console.log(`ISS video: class=${cls} · ${txt}`);
  if (cls !== "live") expect(txt).not.toContain("LIVE VIDEO");
  await page.screenshot({ path: `${SHOTS}/desk-iss.png` });
  await page.getByTestId("satview-video-stop").click();
  await expect(page.locator("iframe[src*=youtube]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a service down is said NON DISPONIBILE and the map keeps working; a non-observer says no image", async ({ page }) => {
  const errors = await open(page);
  await page.route(/view\.eumetsat\.int/, (r) => r.abort());
  await observers(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 54743 }));
  await page.getByTestId("satview-geo-tc").click();
  await expect(page.getByTestId("satview-error")).toContainText("NON DISPONIBILE", { timeout: 30_000 });
  await expect(page.getByTestId("satview-frame")).toHaveCount(0);
  // the map still answers
  await page.evaluate(() => (window as any).__nexum.ops.set({ satObs: false }));
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 15_000 }).toBeGreaterThan(1000);
  const other = await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 100615 }));   // a Starlink
  void other;
  await expect(page.getByTestId("ops-orbit-noimage")).toContainText("NON DISPONIBILE");
  await expect(page.getByTestId("satview")).toHaveCount(0);
  expect(errors).toEqual([]);
});
