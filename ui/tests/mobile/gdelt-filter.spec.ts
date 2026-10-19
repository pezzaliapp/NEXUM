// WHICH GDELT REPORTS ARE PUBLIC-ORDER NEWS, and one surface at a time, on the engines of the real phones (2026-10-19):
// the raw data are apart and readable; a report's card opened from the news list is the surface in use — the list
// waits under it, hidden (never half a list showing around the card), and is back, as it was, when the card closes.
// GDELT's answers are REAL files of 17 October 2026 (tests/gdelt.shared.ts).
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

test("a phone: the card over the news list hides the list, closing it brings the list back; the raw data apart, on screen", async ({ page }) => {
  await gdelt(page);
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.tool("news"));
  const panel = page.getByTestId("ops-panel-news");
  await expect(page.getByTestId("news-panel-state")).toContainText("ultimo file 19:15 UTC", { timeout: 60_000 });
  const item = page.getByTestId("news-list").getByTestId("news-item").first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.locator("button.ops-alert").tap();
  await expect(page.getByTestId("ops-feat-card")).toHaveAttribute("data-layer", "ops-news", { timeout: 10_000 });
  await expect(panel).toHaveAttribute("data-under-card", "1");
  await expect(panel).toBeHidden();
  await expect(page.getByTestId("news-relevance")).toBeVisible();
  await page.getByTestId("ops-feat-close").tap();
  await expect(page.getByTestId("ops-feat-card")).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("data-under-card", "1");
  // the raw data: a section of their own, inside the screen
  const raw = page.getByTestId("news-raw");
  await raw.scrollIntoViewIfNeeded();
  await raw.locator("summary").tap();
  const first = page.getByTestId("news-list-raw").getByTestId("news-item").first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("data-relevance", "raw");
  const b = (await first.boundingBox())!, vw = await page.evaluate(() => innerWidth);
  expect(b.x).toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width).toBeLessThanOrEqual(vw + 1);
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});
