// THE WORLD'S NEWS, FOUND (2026-10-19, author's review on the Samsung Fold: "the person does not understand how to switch
// on and read the news of the last 1, 6 and 24 hours"). On the real phones' engines: the tools button says «Strumenti»;
// in Strumenti the news switch is on the first screen, no scrolling; switched on, the existing windows (1, 6, 24 hours —
// no other) have a title, a one-line hint on reading them on the map, the sizes one tap away; switched off, Livelli
// invites to it; the help says the path of this screen. Nothing asks GDELT before the person switches the news on.
// GDELT's answers are REAL files of 17 October 2026 (tests/gdelt.shared.ts).
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [], asked: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().includes("gdeltproject.org")) asked.push(r.url()); });
  await gdelt(page);
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return { errors, asked };
}
const noSideScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1);
const inScreen = async (page: Page, testid: string) => {
  const b = (await page.getByTestId(testid).first().boundingBox())!, v = await page.evaluate(() => [innerWidth, innerHeight]);
  return b.x >= -1 && b.y >= -1 && b.x + b.width <= v[0] + 1 && b.y + b.height <= v[1] + 1;
};

test("from the map: «⌖ Strumenti» → Notizie dal mondo → 6 ore, in three taps, without scrolling", async ({ page }) => {
  const { errors, asked } = await open(page);
  const tools = page.getByTestId("ops-tools");
  await expect(tools).toBeVisible({ timeout: 30_000 });
  await expect(tools).toContainText("Strumenti");
  expect(await inScreen(page, "ops-tools")).toBe(true);
  // the button never covers the zoom or the legend
  const t = (await tools.boundingBox())!;
  for (const sel of ['.maplibregl-ctrl-zoom-out', '[data-testid="map-legend"]']) {
    const o = await page.locator(sel).first().boundingBox().catch(() => null);
    if (o) expect(t.y >= o.y + o.height - 1 || t.y + t.height <= o.y + 1 || t.x >= o.x + o.width - 1 || t.x + t.width <= o.x + 1, sel).toBe(true);
  }
  expect(asked, "nothing asks GDELT before the news are switched on").toEqual([]);
  await tools.tap();
  const row = page.getByTestId("ops-quick-news").locator("xpath=ancestor::label");
  await expect(row).toBeVisible();
  await expect(row).toContainText("Notizie dal mondo (GDELT)");
  await expect(row).toContainText("1, 6 o 24 ore");
  const r = (await row.boundingBox())!, vh = await page.evaluate(() => innerHeight);
  expect(r.y + r.height, "on the first screen of Strumenti").toBeLessThanOrEqual(vh + 1);
  await row.tap();
  await expect(page.getByTestId("ops-news-window-title")).toHaveText("Notizie delle ultime:");
  const seg = page.getByTestId("ops-news-window").first().locator(".seg button");
  expect(await seg.allTextContents()).toEqual(["1 ora", "6 ore", "24 ore"]);
  await page.getByTestId("ops-news-window-6").first().tap();
  await expect(page.getByTestId("ops-news-window-6").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ops-news-window-hint").first()).toHaveText("Tocca i punti sulla mappa per leggere le notizie e aprire le fonti.");
  // the sizes and what NEXUM keeps: one tap away, never in the way
  await expect(page.getByTestId("ops-news-window-note").first()).toBeHidden();
  await page.getByTestId("ops-news-window-more").first().locator("summary").tap();
  await expect(page.getByTestId("ops-news-window-note").first()).toContainText("MB");
  await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__nexum.ops.get().layers.news)).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("Livelli invites to the news while they are off; the help says this screen's path", async ({ page }) => {
  const { errors, asked } = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.tool("layers"));
  const inv = page.getByTestId("ops-layer-news-invite");
  await inv.scrollIntoViewIfNeeded();
  await expect(inv).toHaveText("Scopri cosa accade nel mondo: attiva e scegli 1, 6 o 24 ore.");
  expect(await noSideScroll(page)).toBe(true);
  await page.getByTestId("ops-layer-news").tap();
  await expect(inv).toHaveCount(0);
  await expect(page.getByTestId("ops-news-window-title")).toBeVisible();
  await page.evaluate(() => (window as any).__nexum.ops.tool("help"));
  await expect(page.getByTestId("help-news")).toHaveText(/^Scopri cosa accade nel mondo\. Tocca ⌖ Strumenti, attiva Notizie dal mondo \(GDELT\) e scegli 1, 6 o 24 ore\./);
  await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
