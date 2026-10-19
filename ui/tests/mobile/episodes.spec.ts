// DOCUMENTED EPISODES on the real phones' engines (2026-10-19, local example: Milan, 17–18 October 2026): reached from
// Milan's card, the episode's card fits the screen (no sideways scrolling, sources tappable), and the phone's Tempo
// places the episode on its time line. Needs a snapshot with curated.public_order.
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await gdelt(page);
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  return errors;
}
const noSideScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1);

test("a phone: Milan's documented episodes, an episode's card on screen, and the episode in Tempo", async ({ page }) => {
  const errors = await open(page);
  // Milan (Natural Earth 1159151315 in this world; the web spec reaches it by searching «milano»)
  await page.evaluate(() => (window as any).__nexum.store.select("obj_ektl7qoujxtjxfg3z5stgj4hva", "test"));
  await page.evaluate(() => (window as any).__nexum.store.set({ sheet: "full" }));
  await expect(page.getByTestId("place-episode")).toHaveCount(11, { timeout: 30_000 });
  expect(await noSideScroll(page)).toBe(true);
  await page.getByTestId("place-episode").filter({ hasText: "Carrefour" }).locator(".ref, button, a").first().tap();
  await expect(page.getByTestId("episode-record")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.store.set({ sheet: "full" }));
  expect(await noSideScroll(page)).toBe(true);
  const a = page.getByTestId("episode-sources").locator("a").first();
  await a.scrollIntoViewIfNeeded();
  const b = (await a.boundingBox())!, vw = await page.evaluate(() => innerWidth);
  expect(b.x).toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width).toBeLessThanOrEqual(vw + 1);
  const id = await page.evaluate(() => (window as any).__nexum.store.get().focus);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "map", mobileTab: "time" }));
  const tv = page.locator('[data-view="time"] [data-testid="timeline"]');
  await expect(tv).toHaveAttribute("data-selected", id, { timeout: 30_000 });
  await expect(tv).toHaveAttribute("data-appears", "mark");
  expect(errors).toEqual([]);
});
