// GDELT AS IT IS NOW (2026-10-18, author's review): the same page against the CURRENT GDELT (no fixture) — what holds
// whatever the news are: the state said with the newest file's real time (or the archive, said as such, when GDELT
// cannot be reached), only confirmed places as points, every report in the list with its place's certainty.
import { expect, test } from "@playwright/test";

test("current GDELT: honest state, confirmed points only, the list consultable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.getByTestId("ops-tool-news").click();
  const st = page.getByTestId("news-panel-state");
  await expect(st).toContainText(/ultimo file \d\d:\d\d UTC|ARCHIVIO del .*, non in diretta/, { timeout: 90_000 });
  expect(await st.textContent()).not.toMatch(/\blive\b|(?<!non )in diretta/i);
  await expect.poll(() => page.getByTestId("news-item").count(), { timeout: 60_000 }).toBeGreaterThan(0);
  const geos = await page.getByTestId("news-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-geo")));
  expect(geos.every((g) => g === "confirmed" || g === "unconfirmed" || g === "ambiguous")).toBeTruthy();
  await page.evaluate(() => (window as any).__nexum.ops.layer("news", true));
  await page.waitForTimeout(3000);
  const pts = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-news").map((x: any) => x.properties.geo));
  expect(pts.every((g: string) => g === "confirmed")).toBeTruthy();
  expect(errors).toEqual([]);
});
