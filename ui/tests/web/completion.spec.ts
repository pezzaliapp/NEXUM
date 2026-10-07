// COMPLETION GOLDEN TESTS (2026-10-04): what a person reaches from WORLD with taps and words only — Italy's country
// view (pay with an explicit definition first, the cost of living, prices, energy, typed infrastructure, webcams and
// their coverage), cameras around the world from a city's card, South Sudan, the search of places.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function world(page: Page, w = 1440, h = 900) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
async function results(page: Page, q: string) {
  const input = page.locator("#nexum-search");
  await input.click();
  await input.fill(q);
  const first = page.locator("#nexum-results [data-ref]").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  return page.locator("#nexum-results [data-ref]");
}
async function open(page: Page, q: string, want?: RegExp) {
  const r = await results(page, q);
  if (want) await expect(r.first().locator(".grow"), q).toHaveText(want);
  await r.first().click();
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
}

test("A · Italy: pay with its definition and currency first; ILOSTAT apart; cost of living; prices; typed plants; webcams and coverage", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Italia", /^Italy$/);
  const living = page.getByTestId("ov-living");
  await expect(living).toContainText("Retribuzione netta annua", { timeout: 30_000 });
  await expect(living).toContainText("EUR");
  await expect(living).not.toContainText("ILOSTAT");
  await expect(living).not.toContainText("ambiguo");
  await expect(living).toContainText("dieta sana");
  await expect(page.getByTestId("ov-prices")).toContainText("Elettricità per le famiglie");
  await expect(page.getByTestId("ov-prices")).toContainText("Benzina");
  await expect(page.locator('[data-testid="ov-infra"]').filter({ hasText: "Centrali elettriche" })).toContainText("(");
  await expect(page.getByTestId("overview")).not.toContainText("(inverso)");
  await expect(page.getByTestId("overview")).not.toContainText("supporto forte");
  const cov = page.getByTestId("ov-observe").getByTestId("webcam-coverage");
  await expect(cov).toHaveAttribute("data-level", "partial");
  const n = Number((await cov.innerText()).match(/^([\d.]+) webcam/)?.[1].replace(/\./g, ""));
  expect(n).toBeGreaterThan(100);                                         // never again "Italy = Parma"
  await page.getByTestId("section-vivere").click();
  const sec = page.getByTestId("sec-vivere");
  await expect(sec.locator('[data-testid="obs-series"]').filter({ hasText: "per dipendente a tempo pieno" }).first()).toContainText("EUR");
  await expect(sec.locator('[data-testid="obs-series"]').filter({ hasText: "acquistabile con un mese di stipendio netto" }).first()).toBeVisible();
  const limited = sec.getByTestId("ind-limited");
  await expect(limited).toContainText("Dati disponibili con limiti metodologici");
  await limited.locator(":scope > summary").click();
  await expect(limited.locator('[data-testid="obs-series"]').filter({ hasText: "ILOSTAT" }).first()).toContainText("EUR al mese");
  await page.getByTestId("section-prezzi").click();
  await expect(page.getByTestId("sec-prezzi")).toContainText("Livello dei prezzi");
  expect(errors).toEqual([]);
});

const CITIES: [string, RegExp][] = [["London", /^London/], ["Taipei", /^Taipei/], ["Seattle", /^Seattle/], ["Helsinki", /^Helsinki/],
  ["Toronto", /^Toronto/], ["Madrid", /^Madrid/], ["Trento", /^Trento/]];

for (const [city, want] of CITIES) {
  test(`C · webcams near ${city}: listed from the city's card, one opens with a current image from its publisher`, async ({ page }) => {
    const errors = await world(page);
    await open(page, city, want);
    const near = page.getByTestId("place-webcams");
    await expect(near).toBeVisible({ timeout: 30_000 });
    const cams = near.getByTestId("place-webcam");
    expect(await cams.count()).toBeGreaterThan(0);
    // a real publisher can fail one image now and then: up to three cameras are tried, one must show its image
    const current = cams.and(page.locator('[data-availability="current_snapshot"]'));
    let ok = false;
    for (let k = 0; k < Math.min(3, await current.count()) && !ok; k++) {
      await current.nth(k).locator("button").click();
      await expect(page.getByTestId("media-img").or(page.getByTestId("media-error"))).toBeVisible({ timeout: 30_000 });
      const state = () => page.evaluate(() => {
        const i = document.querySelector('[data-testid="media-img"]') as HTMLImageElement | null;
        return i && i.complete && i.naturalWidth > 0 ? "ok" : document.querySelector('[data-testid="media-error"]') ? "error" : "loading";
      });
      await expect.poll(state, { timeout: 30_000 }).not.toBe("loading");
      ok = (await state()) === "ok";
      if (!ok) { await page.goBack(); await expect(near).toBeVisible({ timeout: 30_000 }); }
    }
    expect(ok).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test("C · Hong Kong: its own view says how many webcams NEXUM has and the coverage", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Hong Kong");
  await page.getByTestId("section-osserva").click();
  await expect(page.getByTestId("sec-osserva").getByTestId("webcam-coverage")).toHaveAttribute("data-level", "good");
  expect(errors).toEqual([]);
});

test("D · South Sudan: population, economy, energy, security, infrastructure, observation (no webcam source said plainly)", async ({ page }) => {
  const errors = await world(page);
  await open(page, "South Sudan", /^South Sudan/);
  for (const k of ["popolazione", "economia", "energia", "sicurezza", "infrastrutture", "osserva"])
    await expect(page.getByTestId(`section-${k}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ov-observe").getByTestId("webcam-coverage")).toHaveAttribute("data-level", "none");
  await expect(page.getByTestId("ov-observe")).toContainText("NESSUNA FONTE INTEGRATA");
  expect(errors).toEqual([]);
});

test("E · search: places first for the golden names", async ({ page }) => {
  const errors = await world(page);
  const cases: [string, RegExp][] = [["suda", /^Sudan$/], ["South Sudan", /^South Sudan/], ["Sudan", /^Sudan$/], ["Congo", /^Congo$/],
    ["Italy", /^Italy$/], ["Parma", /^Parma$/], ["London", /^London/], ["Taipei", /^Taipei/], ["Hong Kong", /Hong Kong/]];
  for (const [q, want] of cases) {
    const r = await results(page, q);
    await expect(r.first().locator(".grow"), q).toHaveText(want);
  }
  expect(errors).toEqual([]);
});
