// WHICH GDELT REPORTS ARE PUBLIC-ORDER NEWS (2026-10-19, author's request after a false positive in the preview: a
// «statement» placed in Rome, from The DePaulia's «Sadie's scoop: Justice for ugly ratatouille»). The main list, the
// map and the counts hold the reports coded in the public-order lens, and the generic-coded ones whose article's
// address has a public-order word; the rest is raw data, listed apart, never on the map. The Milan clashes of 17
// October stay. A card opened from the news list sits beside it on a wide screen, never over it.
// GDELT's answers are REAL files: the 19 October 11:30 export (tests/fixtures/gdelt-20261019, unmodified) and the
// 17 October files of tests/gdelt.shared.ts.
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

const FX19 = new URL("../fixtures/gdelt-20261019/", import.meta.url);

/** GDELT as it was at 11:30 UTC on 19 October 2026: the standard stream's newest file (the multilingual one missing). */
async function gdelt19(page: Page) {
  await page.route("https://data.gdeltproject.org/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (name === "lastupdate.txt") return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/plain" },
      body: "86645 014f692a6636e109739eaba4506847bf http://data.gdeltproject.org/gdeltv2/20261019113000.export.CSV.zip\n" });
    const f = new URL(name, FX19);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, headers: cors, body: "not found" });
    return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/zip" }, body: fs.readFileSync(f) });
  });
}
async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
const newsCount = (page: Page) => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0);

test("the false positive: The DePaulia's food column (CAMEO 010, Rome) is out of the list, the map and the counts — kept apart as raw data, said why", async ({ page }) => {
  await gdelt19(page);
  const errors = await open(page);
  await page.getByTestId("ops-tool-layers").click();
  await page.getByTestId("ops-layer-news").check();
  await expect.poll(() => newsCount(page), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.getByTestId("ops-tool-news").click();
  await expect(page.getByTestId("news-panel-state")).toContainText("11:30 UTC", { timeout: 60_000 });
  await expect(page.getByTestId("news-filter-note")).toContainText("codici CAMEO dell'ordine pubblico");
  // the main list: never the food column; the map's count is the main list's
  const main = page.getByTestId("news-list").getByTestId("news-item");
  await expect.poll(() => main.count()).toBeGreaterThan(0);
  const n = await page.getByTestId("news-count-line").textContent();
  expect(Number(n!.match(/^([\d.]+)/)![1].replace(/\./g, ""))).toBe(await newsCount(page));
  expect(await page.getByTestId("news-list").locator('[data-place="Roma, Lazio, Italy"]', { hasText: "depauliaonline.com" }).count()).toBe(0);
  expect(await page.getByTestId("news-list").locator('[data-relevance="raw"]').count()).toBe(0);
  const pts = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-news").map((x: any) => String(x.properties.links)));
  expect(pts.some((l: string) => l.includes("depauliaonline"))).toBe(false);
  // the raw data: there (among Italy's, as a person looking at Rome would find it), with no map button, and its card
  // says why it is out
  await page.getByTestId("news-f-nation").selectOption("Italy");
  const raw = page.getByTestId("news-raw");
  await raw.locator("summary").click();
  await expect(raw).toContainText("Dati grezzi GDELT esclusi dal filtro");
  const it = page.getByTestId("news-list-raw").locator('[data-testid="news-item"][data-place="Roma, Lazio, Italy"]', { hasText: "depauliaonline.com" });
  await expect(it).toHaveCount(1);
  await expect(it).toHaveAttribute("data-relevance", "raw");
  await expect(it.getByTestId("news-item-map")).toHaveCount(0);
  await it.locator("button.ops-alert").click();
  await expect(page.getByTestId("news-relevance")).toHaveAttribute("data-relevance", "raw");
  await expect(page.getByTestId("news-relevance")).toContainText("Esclusa dall'elenco principale e dalla mappa: codice generico (CAMEO 010)");
  await expect(page.getByTestId("news-codes")).toContainText("CAMEO 010");
  await expect(page.getByTestId("news-category")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the Milan clashes of 17 October stay: the lens's reports, and the generic-coded article whose address names the protests, said as such", async ({ page }) => {
  await gdelt(page);
  const errors = await open(page);
  await page.getByTestId("ops-tool-news").click();
  await page.getByTestId("ops-news-window-24").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().newsStatus?.hours), { timeout: 60_000 }).toBe(24);
  await page.getByTestId("news-f-nation").selectOption("Italy");
  await page.getByTestId("news-f-city").selectOption("Milan");
  const conf = page.getByTestId("news-list-confirmed").getByTestId("news-item");
  await expect.poll(() => conf.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const order = page.locator('[data-testid="news-list-confirmed"] [data-relevance="order"], [data-testid="news-list-suggested"] [data-relevance="order"]');
  expect(await order.count()).toBeGreaterThanOrEqual(5);
  // (its address also names Bologna: a place GDELT only suggests, in the second list — still in the main list, never raw)
  const imola = page.locator('[data-testid="news-list-suggested"] [data-testid="news-item"]', { hasText: "imolaoggi.it" }).filter({ hasText: "codice generico" });
  await expect(imola.first()).toBeVisible();
  await expect(imola.first()).toHaveAttribute("data-relevance", "address");
  await imola.first().locator("button.ops-alert").click();
  await expect(page.getByTestId("news-relevance")).toContainText("l'indirizzo dell'articolo contiene «proteste»");
  await expect(page.getByTestId("news-relevance")).toContainText("NEXUM non ha letto l'articolo");
  expect(errors).toEqual([]);
});

test("a card opened from the news list sits beside the list on a wide screen, never over it; closing it leaves the list as it was", async ({ page }) => {
  await gdelt(page);
  const errors = await open(page);
  await page.getByTestId("ops-tool-news").click();
  const item = page.getByTestId("news-list").getByTestId("news-item").first();
  await expect(item).toBeVisible({ timeout: 60_000 });
  await item.locator("button.ops-alert").click();
  const card = page.getByTestId("ops-feat-card"), panel = page.getByTestId("ops-panel-news");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-beside", "1");
  const [a, b] = [(await card.boundingBox())!, (await panel.boundingBox())!];
  expect(a.x + a.width, "the card ends before the list begins").toBeLessThanOrEqual(b.x + 1);
  expect(a.width).toBeGreaterThanOrEqual(280);
  await page.getByTestId("ops-feat-close").click();
  await expect(card).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});
