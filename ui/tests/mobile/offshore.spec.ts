// NEXUM OFFSHORE, Phase 1 Adriatic (2026-10-10): an offshore platform on a phone and a tablet. Its card states the source,
// the licence, the list's reference date and "Dati rielaborati da NEXUM – elaborazione non ufficiale", never "LIVE"; its
// declared relations are in the card, and none of them is drawn as a line on the map (vocabulary hint map_line = false:
// a straight line between two structures would read as a pipeline route).
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

/** The relation lines the map draws from the focus (its "nexum-links" source), as MapLibre serializes it. */
const links = (page: Page) => page.evaluate(() => { const src = (window as any).__nexum.map?.getSource("nexum-links");
  return src ? (src.serialize?.().data?.features ?? []).length : -1; });

test("an offshore platform: source, licence, reference date, not official, no line on the map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.locator('[data-tab="search"]').click();
  await page.locator("#nexum-search").fill("AGOSTINO A");
  const hit = page.locator('#nexum-results [data-ref^="obj_"]', { hasText: "AGOSTINO A" }).first();
  await expect(hit).toBeVisible({ timeout: 60_000 });
  const id = await hit.getAttribute("data-ref");
  await page.getByTestId("overlay-close").click();
  await page.evaluate((x) => (window as any).__nexum.store.select(x, "map"), id);
  await page.evaluate(() => (window as any).__nexum.store.set({ sheet: "full" }));
  const card = page.getByTestId("inspector");
  await expect(card).toContainText("Data di riferimento", { timeout: 60_000 });
  await expect(card).toContainText("31/12/2025 (agg. 12/02/2026)");     // also in the compact card (landscape phone)
  await expect(card).toContainText("Dati rielaborati da NEXUM – elaborazione non ufficiale");
  await expect(card).toContainText("CC BY 4.0");
  await expect(card).toContainText("ENI");
  expect(await card.innerText()).not.toMatch(/\bLIVE\b|in tempo reale|IN ONDA/);
  // the declared relations arrived (the context of the focus), and the map draws none of them
  await expect.poll(() => page.evaluate((x) => { const s = (window as any).__nexum.store.get();
    return s.context?.id === x ? (s.context.data?.related_objects?.items ?? []).length : -1; }, id), { timeout: 60_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(800);
  // not a vacuous zero: the platform has declared relations to elements with a place on the map (its plant, the
  // platforms of its schemes), which the focus lines would join were it not for the vocabulary hint map_line = false
  const withPlace = await page.evaluate((x) => { const st = (window as any).__nexum.store; const s = st.get();
    return (s.context?.id === x ? s.context.data?.related_objects?.items ?? [] : [])
      .filter((it: any) => String(it.reason).startsWith("relation:") && s.types.get(String(it.reason).slice(9))?.map_line === false
        && st.entity(it.$ref)?.point).length; }, id);
  expect(withPlace).toBeGreaterThan(0);
  expect(await links(page)).toBe(0);
  expect(errors).toEqual([]);
});
