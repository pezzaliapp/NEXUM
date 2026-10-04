// FINAL DATA INTEGRITY GATE (2026-10-04): golden tests of what the physical review found — reached from WORLD with
// taps and words only (no store calls): places before events in search, the Italy wage said as ambiguous, aviation
// facilities never called "airports", UCDP labels a person can read, Parma's camera from the city, data statuses.
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
async function results(page: Page, q: string) {
  const input = page.locator("#nexum-search");
  await input.click();
  await input.fill(q);
  const first = page.locator("#nexum-results [data-ref]").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  return page.locator("#nexum-results [data-ref]");
}
async function openFirst(page: Page, q: string) {
  const r = await results(page, q);
  await r.first().click();
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
}

test("E · search: a place named exactly or by prefix comes before events; similar names stay distinct", async ({ page }) => {
  const errors = await world(page);
  const cases: [string, RegExp][] = [["suda", /^Sudan$/], ["Sudan", /^Sudan$/], ["South Sudan", /^South Sudan \(S\. Sudan\)$/],
    ["S. Sudan", /South Sudan/], ["Niger", /^Niger$/], ["Nigeria", /^Nigeria$/], ["Congo", /^Congo$/],
    ["Democratic Republic of the Congo", /Democratic Republic of the Congo/], ["Guinea", /^Guinea$/], ["Guinea-Bissau", /^Guinea-Bissau$/],
    ["Equatorial Guinea", /Equatorial Guinea/], ["Dominica", /^Dominica$/], ["Dominican Republic", /Dominican Republic/], ["Georgia", /^Georgia$/],
    ["Italia", /^Italy$/]];
  for (const [q, want] of cases) {
    const r = await results(page, q);
    await expect(r.first().locator(".grow"), q).toHaveText(want);
  }
  const r = await results(page, "suda");
  await expect(r.nth(1).locator(".grow")).toHaveText(/South Sudan/);              // both countries before any event
  expect(errors).toEqual([]);
});

test("A/B · Italy: the ILOSTAT wage is AMBIGUOUS (source, survey year), never 'gross monthly wage'; not in the overview", async ({ page }) => {
  const errors = await world(page);
  await openFirst(page, "Italia");
  // declared change (2026-10-04, completion): the overview answers with pay whose definition holds (Eurostat net, OECD
  // gross per full-time employee); the ILOSTAT values sit apart, closed, in "Dati disponibili con limiti metodologici"
  await expect(page.getByTestId("ov-living")).toContainText("Retribuzione netta annua", { timeout: 30_000 });
  await expect(page.getByTestId("ov-living")).not.toContainText("ILOSTAT");
  await page.getByTestId("section-vivere").click();
  const limited = page.locator('[data-testid="sec-vivere"] [data-testid="ind-limited"]');
  await limited.locator(":scope > summary").click();
  const row = limited.locator('[data-testid="obs-series"]').filter({ hasText: "Retribuzione mensile media dei dipendenti (ILOSTAT)" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("obs-ambiguous")).toBeVisible();
  await expect(page.getByTestId("sec-vivere")).not.toContainText("(lorda)");
  await row.locator("summary").click();
  await expect(row).toContainText("EU Statistics on Income and Living Conditions");
  await expect(row).toContainText("anno precedente");
  await expect(row.getByTestId("obs-nature")).toContainText("AMBIGUO");
  expect(errors).toEqual([]);
});

test("C · South Sudan: aviation facilities by kind (never 'airports'); UCDP labels readable; zones explained", async ({ page }) => {
  const errors = await world(page);
  await openFirst(page, "South Sudan");
  await page.getByTestId("section-infrastrutture").click();
  const air = page.locator('[data-testid="infra-type"]').filter({ hasText: "Strutture aeronautiche" }).first();
  await expect(air).toBeVisible({ timeout: 30_000 });
  await expect(air.getByTestId("infra-subtypes")).toContainText("grande aeroporto");
  await expect(air.getByTestId("infra-subtypes")).toContainText("pista o aeroporto minore");
  await expect(air.getByTestId("infra-subtypes")).toContainText("non è un numero di aeroporti in funzione");
  await page.getByTestId("section-sicurezza").click();
  await expect(page.getByTestId("zones-window")).toContainText("non è una situazione in tempo reale", { timeout: 30_000 });
  // what a person reads first (zone lines, event labels) never shows the source's provisional codes; they stay in the
  // evidence ("Perché questa zona?", an event's facts)
  for (const t of await page.locator('[data-testid="zone"] > b, [data-testid="sec-sicurezza"] .ov-some li').allInnerTexts())
    expect(t).not.toContain("codice provvisorio");
  expect(errors).toEqual([]);
});

test("D · Sudan: its own country view (not South Sudan) with security and sources", async ({ page }) => {
  const errors = await world(page);
  await openFirst(page, "Sudan");
  await expect(page.locator(".focushead h1")).toHaveText(/^Sudan/);
  await expect(page.locator(".focushead h1")).not.toContainText("South");
  await expect(page.getByTestId("section-sicurezza")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("F/G · Parma: the city shows its nearby webcam; Piazza Garibaldi is LINK ONLY (blocked preview), never a NEXUM image", async ({ page }) => {
  const errors = await world(page);
  const asked: string[] = [];
  page.on("request", (r) => { if (/skylinewebcams|comune\.parma\.it/.test(r.url())) asked.push(r.url()); });
  const r = await results(page, "Parma");
  await expect(r.first().locator(".grow")).toHaveText("Parma");
  await r.first().click();
  const near = page.getByTestId("place-webcams");
  await expect(near).toBeVisible({ timeout: 30_000 });
  const cam = near.getByTestId("place-webcam").filter({ hasText: "Piazza Garibaldi" });
  await expect(cam).toContainText("SOLO COLLEGAMENTO");
  await cam.locator("button").click();
  await expect(page.getByTestId("webcam-link")).toHaveAttribute("href", /comune\.parma\.it/);
  await expect(page.getByTestId("media-img")).toHaveCount(0);
  for (const q of ["webcam Parma", "Parma webcam", "Piazza Garibaldi Parma", "webcam Piazza Garibaldi"]) {
    await page.goto(BASE);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
    const x = await results(page, q);
    await expect(x.first(), q).toContainText("Piazza Garibaldi");
  }
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});

test("Q/R/S · data statuses: an old value, a modelled value, a missing value are said as such", async ({ page }) => {
  const errors = await world(page);
  await openFirst(page, "Italia");
  await page.getByTestId("section-energia").click();
  await expect(page.locator('[data-testid="sec-energia"] [data-testid="obs-series"]').filter({ hasText: "serie storica" }).first()
    .getByTestId("obs-stale")).toBeVisible({ timeout: 30_000 });                                     // EIA crude imports, frozen at 2020
  await page.getByTestId("section-economia").click();
  await expect(page.locator('[data-testid="sec-economia"] [data-testid="obs-series"]').filter({ hasText: "Tasso di occupazione" }).first())
    .toContainText("modellato");
  await page.getByTestId("section-vivere").click();
  await page.getByTestId("ind-gaps").locator("summary").click();
  await expect(page.getByTestId("ind-gap").filter({ hasText: "Salario minimo" }).first()).toContainText("dato non disponibile");
  expect(errors).toEqual([]);
});
