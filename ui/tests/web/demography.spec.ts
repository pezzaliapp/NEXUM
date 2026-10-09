// DEMOGRAPHIC FIGURES SAY WHAT THEY MEASURE (2026-10-08, demographic audit). Italy and Rome: national population,
// urban share (national definition), the largest urban area (UN estimate, unnamed), Natural Earth's metropolitan
// estimate (year not documented) — never "abitanti" of a municipality; the Natural Earth state estimate with its own
// year (POP_YEAR). The most populous settlement of a place: the place its source declares, not only the coarse outline
// (US → New York, Portugal → Lisbon, Sweden → Stockholm, Iceland → Reykjavík, Lebanon → Beirut, and the 11 places that
// had none), disputed or ambiguous settlements attributed to nobody. Values are unchanged.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
// the place by its exact name in the published index of places (not the search ranking)
const placeId = (page: Page, label: string) => page.evaluate(async (label) => {
  const r = await (window as any).__nexum.apiFetch("/places-index");
  return ((r.body.data.places as any[]).find((x) => x[1] === "place.country" && x[2] === label) ?? [null])[0];
}, label);
const leaderOf = async (page: Page, label: string) => {
  const id = await placeId(page, label);
  expect(id, `${label} found`).toBeTruthy();
  return page.evaluate(async (id) => (await (window as any).__nexum.apiFetch(`/indicators/${id}`)).body.data.leaders?.["place.settlement"]?.label ?? null, id);
};

test("Italy: each figure says what it measures — national, urban share (national definition), largest urban area (UN, unnamed), Natural Earth estimate of 2019", async ({ page }) => {
  const errors = await open(page);
  const id = await placeId(page, "Italy");
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), id);
  const ov = page.getByTestId("overview");
  await expect(ov).toContainText("Popolazione nazionale", { timeout: 30_000 });
  await expect(ov).toContainText("Quota di popolazione urbana (definizione nazionale)");
  await expect(ov).toContainText("Popolazione della maggiore area urbana (stima ONU)");
  await expect(ov).not.toContainText("Popolazione della città più grande");
  // the source names no area; NEXUM's own most populous settlement, said as a metropolitan estimate, not comparable
  const ctx = page.getByTestId("ind-context").first();
  await expect(ctx).toContainText("non la nomina");
  await expect(page.getByTestId("ind-leader").first()).toContainText("Rome");
  await expect(page.getByTestId("ind-leader").first()).toContainText("≈ 3.339.000 nell'area metropolitana");
  await expect(page.getByTestId("ind-leader").first()).toContainText("anno non documentato");
  await expect(page.getByTestId("ind-leader").first()).not.toContainText("abitanti");
  // the values themselves are unchanged
  await expect(ov).toContainText("58,9 milioni");
  await expect(ov).toContainText("69,7 %");
  // the Natural Earth state estimate with the year of the original file
  await page.getByText("Tutte le connessioni e i dettagli").first().click().catch(() => {});
  const facts = page.getByTestId("facts").first();
  await expect(facts).toContainText("Stima Natural Earth della popolazione (2019)", { timeout: 15_000 });
  await expect(facts).toContainText("60.297.396");
  expect(errors).toEqual([]);
});

test("Rome: Natural Earth's metropolitan estimate (year not documented), never the residents of the municipality", async ({ page }) => {
  const errors = await open(page);
  const input = page.locator("#nexum-search");
  await input.click(); await input.fill("Rome");
  await page.locator("#nexum-results [data-ref]").filter({ has: page.locator(".grow", { hasText: /^Rome$/ }) }).first().click({ timeout: 30_000 });
  await expect(page.getByTestId("focus-head")).toContainText("Rome", { timeout: 30_000 });
  await expect(page.getByTestId("focus-head")).not.toContainText("abitanti");
  const facts = page.getByTestId("facts").first();
  await expect(facts).toContainText("Stima metropolitana Natural Earth");
  await expect(facts).not.toContainText("Abitanti");
  await expect(page.getByTestId("fact-note").first()).toContainText("Non è la popolazione residente nel comune");
  await expect(page.getByTestId("fact-note").first()).toContainText("Anno non documentato");
  expect(errors).toEqual([]);
});

test("a sentence about a settlement says the Natural Earth figure as a metropolitan estimate, not inhabitants", async ({ page }) => {
  const errors = await open(page);
  // "Centri abitati vicino a violenza organizzata": Zahlé, 78.145 (Natural Earth POP_MAX)
  await page.evaluate(() => (window as any).__nexum.store.select("ins_22t2w7s2kfc634742klsncp7wq", "test"));
  const card = page.locator(".insp").first();
  await expect(card).toContainText("Zahlé (≈ 78.145 nell'area metropolitana, stima)", { timeout: 30_000 });
  await expect(card).not.toContainText("78.145 abitanti");
  expect(errors).toEqual([]);
});

test("the most populous settlement of a place: as its source declares it (coastal capitals), disputed ones attributed to nobody", async ({ page }) => {
  const errors = await open(page);
  const expected: [string, string | null][] = [
    ["United States of America", "New York"], ["Portugal", "Lisbon"], ["Sweden", "Stockholm"], ["Iceland", "Reykjavík"], ["Lebanon", "Beirut"],
    // the 11 that had none
    ["Bahrain", "Manama"], ["Barbados", "Bridgetown"], ["Kiribati", "Tarawa"], ["Macao", "Macau"], ["Marshall Is.", "Majuro"], ["Monaco", "Monaco"],
    ["New Caledonia", "Nouméa"], ["Palau", "Koror"], ["St. Vin. and Gren.", "Kingstown"], ["Turks and Caicos Is.", "Grand Turk"], ["Tuvalu", "Funafuti"],
    // edge cases: a dependency declared with its sovereign's code keeps its own; contained only; unchanged ones
    ["Niue", "Alofi"], ["Taiwan", "Taipei"], ["Italy", "Rome"], ["Nigeria", "Lagos"], ["Liberia", "Monrovia"],
    // disputed or ambiguous: the settlement claimed by two places is attributed to neither
    ["Vatican", null],
  ];
  for (const [place, city] of expected) expect(await leaderOf(page, place), place).toBe(city);
  // Jerusalem and Nicosia (declared and contained in different places) are nobody's leader
  for (const place of ["Israel", "Palestine", "Cyprus", "N. Cyprus"]) {
    const l = await leaderOf(page, place);
    expect(l === "Jerusalem" || l === "Nicosia", `${place}: ${l}`).toBe(false);
  }
  expect(errors).toEqual([]);
});
