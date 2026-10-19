// SEARCH REVIEW (2026-10-18): "milano" opened an airfield in Brazil. A city's Italian and international names find the
// city first, named with its kind and nation; its namesakes follow with their nation; airports and other elements stay
// in the results (their own groups), never removed. From the city, its news. Needs a snapshot with naturalearth.places
// 1.2.0 (the other names Natural Earth gives).
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await gdelt(page);
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
async function search(page: Page, q: string) {
  await page.locator("#nexum-search").first().fill(q);
  await page.waitForFunction((q) => performance.getEntriesByName(`nexum:search:${q}`).length > 0, q, { timeout: 30_000 });
  const list = page.getByTestId("search-results");
  await expect(list.locator(".it").first()).toBeVisible();
  return list;
}

for (const [q, label] of [["milano", "Milan"], ["Milano", "Milan"], ["roma", "Rome"], ["torino", "Turin"], ["bologna", "Bologna"], ["firenze", "Florence"], ["napoli", "Naples"],
  ["milan", "Milan"], ["rome", "Rome"], ["turin", "Turin"], ["florence", "Florence"], ["naples", "Naples"]] as const) {
  test(`«${q}»: the first result is the city of ${label}, Italy — a city, with its nation`, async ({ page }) => {
    const errors = await open(page);
    const list = await search(page, q);
    await expect(list.locator(".grp").first()).toHaveText("Città / insediamento");
    const it = list.locator(".it").first();
    await expect(it).toContainText(label);
    await expect(it.getByTestId("search-context")).toHaveText("Italy");
    expect(errors).toEqual([]);
  });
}

test("namesakes: Florence and Naples of the United States follow, each with its nation; airports stay in the results", async ({ page }) => {
  await open(page);
  let list = await search(page, "florence");
  const ctx = await list.getByTestId("search-context").allTextContents();
  expect(ctx[0]).toBe("Italy");
  expect(ctx.slice(1)).toContain("United States of America");
  list = await search(page, "milano");
  const all = (await list.locator(".it").allTextContents()).join(" | ");
  expect(all).toContain("Milano Linate Airport");          // not removed from the index: ranked after the city
  expect(all).toContain("Aeródromo Fazenda Milano");
  const groups = await list.locator(".grp").allTextContents();
  expect(groups[0]).toBe("Città / insediamento");
  expect(groups).toContain("Struttura aeronautica");
});

test("Enter on «milano» opens Milan, Italy; its card opens the city's news, confirmed and suggested apart", async ({ page }) => {
  const errors = await open(page);
  await search(page, "milano");
  await page.locator("#nexum-search").first().press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.entity((window as any).__nexum.store.get().focus)?.label)).toBe("Milan");
  await page.getByTestId("place-news-open").first().click();
  await expect(page.getByTestId("news-panel")).toBeVisible();
  await expect(page.getByTestId("news-f-nation")).toHaveValue("Italy");
  await expect(page.getByTestId("news-f-city")).toHaveValue("Milan");
  await expect.poll(() => page.getByTestId("news-list-confirmed").getByTestId("news-item").count(), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId("news-h-suggested")).toBeVisible();
  expect(errors).toEqual([]);
});
