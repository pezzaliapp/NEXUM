// GDELT IN THE BROWSER on the engines of the real phones (WebKit for the iPhone, Chrome for the Fold), from REAL files of
// 17 October 2026: the news layer and its window, the public-order tab and its categories, a report's card — all on
// screen without sideways scrolling. It does not replace the physical test.
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
const noSideScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1);

test("news on a phone: the window chosen, the state said, the public-order tab, a report's card readable", async ({ page }) => {
  await gdelt(page);
  const errors = await open(page);
  // the browser can unpack GDELT's files (DecompressionStream deflate-raw)
  expect(await page.evaluate(() => { try { new DecompressionStream("deflate-raw" as any); return true; } catch { return false; } })).toBe(true);
  await page.evaluate(() => (window as any).__nexum.ops.tool("layers"));
  await page.getByTestId("ops-layer-news").check();
  await page.getByTestId("ops-news-window-1").click();
  await expect(page.getByTestId("ops-layer-news-state")).toContainText("ultimo file 19:15 UTC", { timeout: 60_000 });
  expect(await noSideScroll(page)).toBe(true);
  await page.evaluate(() => (window as any).__nexum.ops.tool("alerts"));
  await page.getByTestId("ops-alerts-tab-order").click();
  await expect(page.getByTestId("ops-alerts-cats")).toBeVisible();
  await page.getByTestId("ops-alerts-cat-riot").click();
  await expect.poll(() => page.getByTestId("ops-alert").count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await noSideScroll(page)).toBe(true);
  await page.getByTestId("ops-alert").first().locator("button").tap();
  await expect(page.getByTestId("ops-feat-card")).toHaveAttribute("data-layer", "ops-news", { timeout: 10_000 });
  await expect(page.getByTestId("news-category")).toContainText("Scontri e disordini");
  await expect(page.getByTestId("news-codes")).toContainText("CAMEO");
  const box = await page.getByTestId("ops-feat-card").boundingBox();
  const vw = await page.evaluate(() => innerWidth);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("Notizie e ordine pubblico on a phone: filters, the two lists of a city, a card in sections — nothing cut, no sideways scroll", async ({ page }) => {
  await gdelt(page);
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.tool("news"));
  await expect(page.getByTestId("news-panel-state")).toContainText("ultimo file 19:15 UTC", { timeout: 60_000 });
  await page.getByTestId("news-f-nation").selectOption("Italy");
  await page.getByTestId("news-f-city").selectOption("Milan");
  await expect.poll(() => page.getByTestId("news-list-confirmed").getByTestId("news-item").count()).toBeGreaterThan(0);
  await expect.poll(() => page.getByTestId("news-list-suggested").getByTestId("news-item").count()).toBeGreaterThan(0);
  expect(await noSideScroll(page)).toBe(true);
  // every filter fully inside the screen
  const vw = await page.evaluate(() => innerWidth);
  for (const id of ["news-f-nation", "news-f-city", "news-f-cat", "news-f-geo"]) {
    const b = await page.getByTestId(id).boundingBox(); expect(b!.x).toBeGreaterThanOrEqual(-1); expect(b!.x + b!.width).toBeLessThanOrEqual(vw + 1);
  }
  await page.getByTestId("news-list-suggested").getByTestId("news-item").first().locator("button.ops-alert").tap();
  await expect(page.getByTestId("news-sentence")).toContainText("Luogo suggerito da GDELT, non verificato");
  for (const id of ["what", "where", "who", "attrib", "links", "sources"]) await expect(page.getByTestId(`news-sec-${id}`)).toBeAttached();
  const card = await page.getByTestId("ops-feat-card").boundingBox();
  expect(card!.x).toBeGreaterThanOrEqual(-1);
  expect(card!.x + card!.width).toBeLessThanOrEqual(vw + 1);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});
