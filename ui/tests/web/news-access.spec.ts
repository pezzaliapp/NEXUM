// THE WORLD'S NEWS, FOUND — desktop (2026-10-19, author's review): the rail keeps its icons (no label); Livelli invites
// to the news while they are off; switched on, the existing windows (1, 6, 24 hours — no other) have a title and the
// hint says "Clicca"; the help says the desktop path (≡ Livelli). GDELT's answers: REAL files (tests/gdelt.shared.ts).
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await gdelt(page);
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}

test("desktop: Livelli invites, the windows have a title and a hint, the help says ≡ Livelli", async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId("ops-rail")).toBeVisible();
  await page.getByTestId("ops-tool-layers").click();
  await expect(page.getByTestId("ops-layer-news-invite")).toHaveText("Scopri cosa accade nel mondo: attiva e scegli 1, 6 o 24 ore.");
  await page.getByTestId("ops-layer-news").check();
  await expect(page.getByTestId("ops-layer-news-invite")).toHaveCount(0);
  await expect(page.getByTestId("ops-news-window-title")).toHaveText("Notizie delle ultime:");
  expect(await page.getByTestId("ops-news-window").locator(".seg button").allTextContents()).toEqual(["1 ora", "6 ore", "24 ore"]);
  await expect(page.getByTestId("ops-news-window-hint")).toHaveText("Clicca i punti sulla mappa per leggere le notizie e aprire le fonti.");
  await page.getByTestId("ops-news-window-24").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().newsStatus?.hours), { timeout: 60_000 }).toBe(24);
  await page.getByTestId("ops-tool-help").click();
  await expect(page.getByTestId("help-news")).toHaveText(/^Scopri cosa accade nel mondo\. Apri ≡ Livelli, attiva Notizie dal mondo \(GDELT\) e scegli 1, 6 o 24 ore\./);
  expect(errors).toEqual([]);
});
