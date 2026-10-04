// DISCOVERY (2026-10-03): what NEXUM knows about a place is found from WORLD by a person who does not know how NEXUM
// is built — only what a person can do: look, tap, type. No store call, no ID, no API shortcut to reach anything.
// Desktop, Fold open, Fold closed, iPhone.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const DEVICES: [string, { width: number; height: number }, boolean][] = [
  ["desktop", { width: 1440, height: 900 }, false], ["fold-open", { width: 884, height: 960 }, true],
  ["fold-closed", { width: 344, height: 690 }, true], ["iphone", { width: 430, height: 932 }, true]];

async function world(browser: any, vp: { width: number; height: number }, touch: boolean) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: touch, hasTouch: touch });
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return { ctx, page, errors };
}
const tap = async (page: Page, sel: ReturnType<Page["locator"]>, touch: boolean) => { await expect(sel).toBeVisible(); if (touch) await sel.tap(); else await sel.click(); };

/** WORLD → the visible "Esplora un Paese" → type a name → open it (the panel on desktop, the home strip on touch). */
async function explore(page: Page, name: string, touch: boolean) {
  const open = page.getByTestId("home-explore-open"), head = page.getByTestId("home-explore-head");
  if (await open.isVisible().catch(() => false)) await tap(page, open, touch);
  else if (await head.isVisible().catch(() => false)) await tap(page, head, touch);
  const input = page.getByTestId("explore-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(name);
  const hit = page.getByTestId("explore-results").locator("button").first();
  await tap(page, hit, touch);
  await expect(page.getByTestId("place-view")).toBeVisible({ timeout: 30_000 });
}

for (const [dev, vp, touch] of DEVICES) {
  // declared change (2026-10-03, WORLD INTELLIGENCE): the overview reads how the place is made and how one lives there
  // first (population, living and prices, energy, economy); government and opinion follow, opinion as one line
  test(`${dev}: WORLD → Italy → overview (population, prices, energy, economy, government) → opinion → energy`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    await explore(page, "Italia", touch);
    await expect(page.getByTestId("focus-head")).toContainText("Italy");
    const ov = page.getByTestId("overview");
    await expect(ov.getByTestId("ov-people")).toContainText("Popolazione totale", { timeout: 30_000 });
    // declared change (2026-10-04, completion): prices have their own block after "Vivere"
    await expect(ov.getByTestId("ov-prices")).toContainText("EUR/l");
    await expect(ov.getByTestId("ov-energy")).toContainText("Produzione di elettricità");
    await expect(ov.getByTestId("ov-mix")).toContainText("%");
    await expect(ov.getByTestId("ov-gas")).toContainText("Algeria");
    await expect(ov.getByTestId("ov-economy")).toContainText("PIL");
    const gov = ov.getByTestId("ov-gov");
    await gov.scrollIntoViewIfNeeded();
    await expect(gov.getByTestId("ov-holder")).toHaveCount(2);
    await expect(gov).toContainText("Sergio Mattarella");
    await expect(gov).toContainText("Giorgia Meloni");
    // opinion: one line in the overview, the full list in its own section (question, fieldwork, sample, error)
    await expect(ov.getByTestId("ov-opinion").getByTestId("ov-line")).toHaveCount(0);
    await tap(page, page.getByTestId("section-opinione"), touch);
    const rows = page.locator('[data-section="opinion"] [data-testid="obs-series"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(10);
    await rows.first().locator("summary").click();
    await expect(rows.first()).toContainText("Domanda");
    await expect(page.getByTestId("obs-pairs")).toContainText("Dato ufficiale");
    // energy: where the gas comes from (declared by Italy, Eurostat), with volume, year and source
    await tap(page, page.getByTestId("section-energia"), touch);
    const gas = page.locator('[data-flow="imports_gas_from|out"]');
    await expect(gas).toContainText("Algeria", { timeout: 30_000 });
    await expect(gas).toContainText("milioni di m³");
    await expect(gas).toContainText("Eurostat");
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`${dev}: WORLD → Germany → infrastructure → road charges → a road drawn on the map with the law's rate`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    await explore(page, "Germany", touch);
    await tap(page, page.getByTestId("section-infrastrutture"), touch);
    const rated = page.locator('[data-testid="infra-type"]').filter({ hasText: "pedaggio" }).first();
    await rated.scrollIntoViewIfNeeded();
    await expect(rated).toBeVisible({ timeout: 30_000 });
    const road = rated.locator(".ov-some [data-ref]").first();
    await road.scrollIntoViewIfNeeded();
    await tap(page, road, touch);
    await expect(page.getByTestId("focus-head")).toContainText("tratte a pedaggio");
    await expect(page.getByTestId("rates")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("nexum-focus-geom").length), { timeout: 20_000 })
      .toBeGreaterThan(0);                                                                   // the road's line is on the map
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`${dev}: WORLD → United States → webcams → a camera; its image is requested only after the tap`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    const hosts = (JSON.parse(fs.readFileSync(new URL("../../media-hosts.json", import.meta.url), "utf8")).img as string[]);
    const asked: string[] = [];
    page.on("request", (r) => { if (hosts.some((h) => r.url().startsWith(h))) asked.push(r.url()); });
    await explore(page, "United States", touch);
    await tap(page, page.getByTestId("section-osserva"), touch);                          // declared change: OSSERVA
    const media = page.getByTestId("ov-media");
    await media.scrollIntoViewIfNeeded();
    await expect(media).toBeVisible({ timeout: 30_000 });
    const cam = media.locator(".ov-some [data-ref]").first();
    await cam.scrollIntoViewIfNeeded();
    await tap(page, cam, touch);
    await expect(page.getByTestId("media")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    expect(asked, "no image before the tap").toEqual([]);
    const openBtn = page.getByTestId("media-open");
    await openBtn.scrollIntoViewIfNeeded();
    await tap(page, openBtn, touch);
    await expect(page.getByTestId("media-img").or(page.getByTestId("media-error"))).toBeVisible({ timeout: 30_000 });
    expect(asked.length, "the image is asked to its source after the tap").toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("desktop: the name of a place on the map opens it (no search, no hunting for a dot)", async ({ browser }) => {
  const { ctx, page, errors } = await world(browser, { width: 1440, height: 900 }, false);
  const label = page.locator('[data-testid="map-labels"] .maplabel.explorable[data-name="Italy"]');
  await expect(label).toBeVisible({ timeout: 30_000 });
  await label.click();
  await expect(page.getByTestId("focus-head")).toContainText("Italy", { timeout: 30_000 });
  await expect(page.getByTestId("place-view")).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("desktop: search puts the place first and a 'word + place' query opens its section", async ({ browser }) => {
  const { ctx, page, errors } = await world(browser, { width: 1440, height: 900 }, false);
  const input = page.locator("#nexum-search");
  await input.fill("Italy");
  await expect(page.locator("#nexum-results [data-ref]").first()).toHaveText(/Italy$/, { timeout: 30_000 });
  await input.fill("inflazione Italia");
  const sc = page.getByTestId("search-shortcut");
  await expect(sc).toContainText("Italy", { timeout: 30_000 });
  await sc.click();
  await expect(page.getByTestId("section-prezzi")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(page.getByTestId("sec-prezzi")).toContainText("Inflazione");
  await input.fill("benzina Germania");
  await expect(page.getByTestId("search-shortcut")).toContainText("Germany", { timeout: 30_000 });
  await page.getByTestId("search-shortcut").click();
  await expect(page.getByTestId("sec-prezzi")).toContainText("Benzina", { timeout: 30_000 });
  // English words lead to the same sections (World Intelligence): "nuclear France" → Energia
  await input.fill("nuclear France");
  await expect(page.getByTestId("search-shortcut")).toContainText("France", { timeout: 30_000 });
  await page.getByTestId("search-shortcut").click();
  await expect(page.getByTestId("sec-energia")).toContainText("nucleare", { timeout: 30_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("the world panel shows documented changes (secondary, folded) with what, where, when and source", async ({ browser }) => {
  const { ctx, page } = await world(browser, { width: 1440, height: 900 }, false);
  // declared change (2026-10-03): documented changes are secondary — folded after the events, never mixed with them
  const fold = page.getByTestId("hl-changes-fold");
  await expect(fold).toBeVisible({ timeout: 30_000 });
  await fold.locator("summary").click();
  const ch = page.getByTestId("hl-changes");
  await expect(ch).toBeVisible({ timeout: 30_000 });
  const t = ch.getByTestId("change-tenure").first();
  await expect(t).toContainText("Nuovo titolare");
  await expect(t).toContainText("dal 20");
  await expect(t).toContainText("Wikidata");
  await expect(ch.getByTestId("change-release").first()).toContainText("Nuovi dati");
  await expect(page.getByTestId("explore-suggestions").locator("button").first()).toBeVisible();
  await ctx.close();
});

// ── after the author's physical test (2026-10-03, evening) ───────────────────────────────────────────────────────
for (const [dev, vp, touch] of DEVICES.filter(([d]) => d !== "fold-open")) {
  test(`${dev}: Italy → Opinione → an observation (fact first) → back to Italy in one tap`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    await explore(page, "Italia", touch);
    await tap(page, page.getByTestId("section-opinione"), touch);
    const row = page.locator('[data-section="opinion"] [data-testid="obs-series"]').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await tap(page, row.locator("summary"), touch);
    // fact first: what was measured, the result, the period come before the question and the method
    const fact = row.getByTestId("obs-fact");
    await expect(fact).toContainText("Misurato");
    await expect(fact).toContainText("Risultato");
    const order = await row.evaluate((r) => { const t = (r as HTMLElement).innerText; return [t.indexOf("Risultato"), t.indexOf("Domanda"), t.indexOf("Metodo")]; });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[0]).toBeLessThan(order[2]);
    const ev = row.getByTestId("obs-evidence");
    await ev.scrollIntoViewIfNeeded();
    await tap(page, ev, touch);
    // the observation's own view: its results first, and the way back to Italy · Opinione
    const rec = page.getByTestId("obs-record");
    await expect(rec).toBeVisible({ timeout: 30_000 });
    expect(await rec.getByTestId("obs-record-line").count()).toBeGreaterThan(0);
    const crumb = page.getByTestId("place-crumb");
    await expect(crumb).toContainText("Italy");
    await expect(crumb).toContainText("Opinione");
    await tap(page, crumb, touch);
    await expect(page.getByTestId("focus-head")).toContainText("Italy");
    await expect(page.getByTestId("section-opinione")).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`${dev}: Sudan on the map — no web of "located in" lines; links only on request`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    await explore(page, "Sudan", touch);
    await expect(page.getByTestId("overview")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    const links = () => page.evaluate(() => (window as any).__nexum.map.getSource("nexum-links").serialize().data.features.length);
    expect(await links()).toBe(0);
    const toggle = page.getByTestId("map-links-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await tap(page, toggle, touch);
    await expect.poll(links).toBeGreaterThan(0);                      // the relations are kept: shown on request
    await tap(page, toggle, touch);
    await expect.poll(links).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`${dev}: no "undefined", "null" or "NaN" shown — world, tooltips, a place's view`, async ({ browser }) => {
    const { ctx, page } = await world(browser, vp, touch);
    const bad = /\bundefined\b|\bNaN\b|\bnull\b/;
    expect(await page.locator("body").innerText()).not.toMatch(bad);
    if (!touch) {   // the density's tooltip at world scale (the case of the physical test)
      const tip = page.locator(".tooltip");
      const box = (await page.getByTestId("map").boundingBox())!;
      let seen = 0;
      for (let i = 1; i < 12 && seen < 3; i++) {
        await page.mouse.move(box.x + (box.width * i) / 12, box.y + box.height * 0.45);
        await page.waitForTimeout(150);
        if (await tip.isVisible()) { seen++; expect(await tip.innerText()).not.toMatch(bad); }
      }
      expect(seen).toBeGreaterThan(0);
    }
    await explore(page, "Japan", touch);
    await page.waitForTimeout(2500);
    expect(await page.locator("body").innerText()).not.toMatch(bad);
    await ctx.close();
  });

  test(`${dev}: a relation's "Perché?" still opens its explanation (from a place's connections)`, async ({ browser }) => {
    const { ctx, page, errors } = await world(browser, vp, touch);
    await explore(page, "Italia", touch);
    const why = page.locator('[data-testid="connections"] .conn-row [data-why]').first();
    await why.scrollIntoViewIfNeeded();
    await tap(page, why, touch);
    await expect(page.getByTestId("why")).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("reference lights by scale over Japan at night: visible on the continent, subordinate in the region, gone locally", async ({ browser }) => {
  const { ctx, page } = await world(browser, { width: 1440, height: 900 }, false);
  await page.waitForFunction(() => (window as any).__nexum.illumination?.lightsReady(), null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.illumination.pin(Date.parse("2026-10-03T15:00:00Z")));   // night in Japan
  // the lights layer's opacity as the map evaluates it at each scale (the rendered value, not the style's text)
  const effect = async (z: number) => {
    await page.evaluate((zz) => (window as any).__nexum.map.jumpTo({ center: [139.7, 35.7], zoom: zz }), z);
    await page.waitForTimeout(1200);
    return page.evaluate(() => (window as any).__nexum.map.getLayer("nexum-lights").paint.get("raster-opacity") as number);
  };
  const continent = await effect(3.5), regional = await effect(5.5), local = await effect(8);
  expect(continent).toBe(1);
  expect(regional).toBeGreaterThan(0); expect(regional).toBeLessThan(0.5);   // subordinate in the region
  expect(local).toBe(0);                                                     // no cells of a 0.2° composite at local scale
  // the night itself stays at every scale (only the reference lights fade)
  expect(await page.evaluate(() => (window as any).__nexum.map.getLayer("nexum-illumination").paint.get("raster-opacity"))).toBe(1);
  await ctx.close();
});
