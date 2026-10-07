// WORLD INTELLIGENCE (2026-10-03): what a person can reach from WORLD with taps and words only — the quiet start map,
// a country's living/energy/prices, the Parma golden webcam (a link, never a preview), an open webcam's on-demand image,
// imagery from orbit on six continents with honest labels, documented security zones, comparing places.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function world(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
async function explore(page: Page, name: string) {
  const open = page.getByTestId("home-explore-open"), head = page.getByTestId("home-explore-head");
  if (await open.isVisible().catch(() => false)) await open.click();
  else if (await head.isVisible().catch(() => false)) await head.click();
  const input = page.getByTestId("explore-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(name);
  await page.getByTestId("explore-results").locator("button").first().click();
  await expect(page.getByTestId("place-view")).toBeVisible({ timeout: 30_000 });
}
async function search(page: Page, text: string) {
  const input = page.locator("#nexum-search");
  await input.fill(text);
  return page.locator("#nexum-results [data-ref]");
}

test("WORLD starts with the cities only; Tutto · Nessuno · Ripristina (= the NEXUM default, not everything)", async ({ page }) => {
  const errors = await world(page);
  const st = () => page.evaluate(() => (window as any).__nexum.store.get().mapTypes);
  expect(await st()).toEqual(["place.settlement"]);
  await expect(page.getByTestId("map-select")).toBeVisible();
  await page.getByTestId("map-all").click();
  expect(await st()).toBeNull();
  await page.getByTestId("map-none").click();
  expect(await st()).toEqual([]);
  await page.getByTestId("map-default").click();
  expect(await st()).toEqual(["place.settlement"]);
  expect(errors).toEqual([]);
});

test("Parma golden webcam: the link to the publisher's page, never a NEXUM preview", async ({ page }) => {
  const errors = await world(page);
  const asked: string[] = [];
  page.on("request", (r) => { if (/skylinewebcams|comune\.parma\.it/.test(r.url())) asked.push(r.url()); });
  const res = await search(page, "webcam Piazza Garibaldi Parma");
  await expect(res.first()).toContainText("Piazza Garibaldi", { timeout: 30_000 });
  await res.first().click();
  const link = page.getByTestId("webcam-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveText(/APRI WEBCAM/);
  await expect(link).toHaveAttribute("href", "https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(page.getByTestId("media-status")).toContainText("SOLO COLLEGAMENTO");
  await expect(page.getByTestId("media-img")).toHaveCount(0);
  await expect(page.getByTestId("media-open")).toHaveCount(0);
  expect(asked, "nothing is asked to the publisher by NEXUM").toEqual([]);
  expect(errors).toEqual([]);
});

test("an open webcam (Hong Kong): marker, open, current image on request, status and source", async ({ page }) => {
  const errors = await world(page);
  const res = await search(page, "Aberdeen Praya Road");
  await expect(res.first()).toBeVisible({ timeout: 30_000 });
  await res.first().click();
  await expect(page.getByTestId("media-status")).toContainText("IMMAGINE CORRENTE", { timeout: 30_000 });
  await expect(page.getByTestId("media-img").or(page.getByTestId("media-error"))).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("media")).toContainText("Transport Department");
  expect(errors).toEqual([]);
});

for (const [place, kind] of [["Italia", "Europa"], ["Kenya", "Africa"], ["Japan", "Asia"], ["Mexico", "Nord America"], ["Brazil", "Sud America"], ["Australia", "Oceania"]]) {
  test(`imagery from orbit over ${place} (${kind}): an acquisition with time, product, source and an honest class`, async ({ page }) => {
    const errors = await world(page);
    await explore(page, place);
    await page.getByTestId("section-osserva").click();
    const block = page.getByTestId("imagery");
    await expect(block).toBeVisible({ timeout: 30_000 });
    await block.getByTestId("sat-viirs").click();
    const frame = block.getByTestId("sat-frame");
    await expect(frame.or(block.getByTestId("sat-none"))).toBeVisible({ timeout: 60_000 });
    if (await frame.isVisible()) {
      await expect(frame.getByTestId("sat-class")).toHaveText(/ULTIMA DISPONIBILE|STORICA/);
      await expect(frame.getByTestId("sat-time")).toContainText("acquisita 20");
      await expect(frame.getByTestId("sat-source")).toContainText("NASA");
      await expect(frame).not.toContainText(/\blive\b/i);
    }
    expect(errors).toEqual([]);
  });
}

test("Sudan: documented security zones with their window, rule and events (never real time)", async ({ page }) => {
  const errors = await world(page);
  await explore(page, "Sudan");
  await page.getByTestId("section-sicurezza").click();
  const zones = page.getByTestId("security-zones");
  await expect(zones).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("zones-window")).toContainText("non è una situazione in tempo reale");
  const z = zones.getByTestId("zone").first();
  await expect(z).toBeVisible();
  await z.getByTestId("zone-why").locator("summary").click();
  await expect(z.getByTestId("zone-event").first()).toContainText("morti");
  await zones.getByTestId("zones-map").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getSource("nexum-zones").serialize().data.features.length),
    { timeout: 20_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("compare places: an indicator lists every covered country alphabetically, with unit and year (no ranking)", async ({ page }) => {
  const errors = await world(page);
  await explore(page, "France");
  await page.getByTestId("section-energia").click();
  const row = page.locator('[data-testid="sec-energia"] [data-testid="obs-series"]').filter({ hasText: "Quota del mix elettrico: nucleare" }).first();
  await row.locator("summary").click();
  await row.getByTestId("obs-evidence").click();
  const rec = page.getByTestId("indicator-record");
  await expect(rec).toBeVisible({ timeout: 30_000 });
  await expect(rec).toContainText("Ordine alfabetico");
  await expect(page.getByTestId("cmp-pinned").locator('[data-iso="FR"]')).toBeVisible();
  await page.getByTestId("cmp-all").locator('[data-iso="DE"] button').click();
  await expect(page.getByTestId("cmp-pinned").locator('[data-iso="DE"]')).toBeVisible();
  expect(errors).toEqual([]);
});
