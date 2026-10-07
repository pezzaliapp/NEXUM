// COMPLETION ON DEVICES (2026-10-04): the country view, its sections bar, "Osserva" with the webcam coverage, a
// webcam opened from a city, the search — on iPhone (portrait, landscape), Fold (closed, open) and a tablet, checked
// geometrically (no horizontal page scroll, nothing covered, targets reachable) and photographed. Not a substitute for
// the physical test on the devices.
import { expect, test, type Page } from "@playwright/test";
import { check } from "./geometry";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  return errors;
}
async function find(page: Page, q: string) {
  await page.locator('[data-tab="search"]').click();
  await page.locator("#nexum-search").fill(q);
  const first = page.locator("#nexum-results [data-ref]").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await first.click();
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
}
const noPageScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);

test("country view, sections bar, Osserva coverage, a webcam from a city, search", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  await find(page, "Italia");
  await expect(page.getByTestId("place-view")).toBeVisible();
  await expect(page.getByTestId("ov-living")).toBeVisible({ timeout: 30_000 });
  expect(await noPageScroll(page)).toBeTruthy();
  // the sections bar scrolls horizontally inside itself, never the page
  const nav = page.getByTestId("place-nav");
  expect(await nav.evaluate((n) => getComputedStyle(n).overflowX)).toMatch(/auto|scroll/);
  await check(page, P, "c01-italia");
  await page.getByTestId("section-osserva").scrollIntoViewIfNeeded();
  await page.getByTestId("section-osserva").click();
  await expect(page.getByTestId("sec-osserva").getByTestId("webcam-coverage")).toContainText("PARZIALE");
  expect(await noPageScroll(page)).toBeTruthy();
  // the sections bar scrolls inside itself: the first sections scrolled off to the left are not "outside the screen"
  await check(page, P, "c02-osserva", { allowOutside: /^button\[section-/ });
  await find(page, "London");
  const cam = page.getByTestId("place-webcams").locator('[data-availability="current_snapshot"]').first();
  await cam.scrollIntoViewIfNeeded();
  await cam.locator("button").click();
  const img = page.getByTestId("media-img");
  await expect(img).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 30_000 }).toBeTruthy();
  const box = await img.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await noPageScroll(page)).toBeTruthy();
  await check(page, P, "c03-webcam");
  expect(errors).toEqual([]);
});
