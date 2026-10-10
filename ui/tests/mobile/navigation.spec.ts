// TOUCH NAVIGATION (2026-10-10, first use on a phone: no obvious way back, out of a card or out of an investigation).
// ← in the top bar, the browser's Back (Android Back, iOS swipe) and × on the card: the topmost layer, then the screen
// before; × leaves the cards for where the first one was opened. Filters, period and the investigation are never
// touched; Back never leaves NEXUM while there is somewhere to go back to. Phone layouts (the bottom sheet).
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
const st = (page: Page) => page.evaluate(() => { const s = (window as any).__nexum.store.get();
  return { focus: s.focus, overlay: s.overlay, sheet: s.sheet, stage: s.stage, tab: s.mobileTab, steps: s.trail.steps.length,
    scope: JSON.stringify(s.scope), mapTypes: JSON.stringify(s.mapTypes), mapFloor: s.mapFloor }; });
/** Two events the world has (a tap on the map is not reproducible on every device; the navigation is what is tested). */
async function events(page: Page): Promise<string[]> {
  await page.locator('[data-tab="search"]').click();
  await page.locator("#nexum-search").fill("earthquake");
  await expect(page.locator('#nexum-results [data-ref^="evt_"]').nth(1)).toBeVisible({ timeout: 30_000 });
  const ids = await page.locator('#nexum-results [data-ref^="evt_"]').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("data-ref")!));
  await page.getByTestId("overlay-close").click();
  await expect(page.getByTestId("overlay-search")).toHaveCount(0);
  return ids;
}
const tapEvent = (page: Page, id: string) => page.evaluate((x) => (window as any).__nexum.store.select(x, "map"), id);   // as a tap on it
const atStart = async (page: Page) => {
  await expect.poll(() => st(page).then((s) => [s.focus, s.overlay, s.tab])).toEqual([null, null, "map"]);
  await expect(page.getByTestId("tb-back")).toBeDisabled();
  expect(new URL(page.url()).host).toBe(new URL(process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/").host);   // still in NEXUM
  await expect(page.getByTestId("topbar")).toBeVisible();
};

test.beforeEach(({}, info) => { test.skip(!/portrait|fold-closed/.test(info.project.name), "phone layouts"); });

test("Mappa → Evento → Dettaglio → Indietro → Mappa (browser Back and ←); Back never leaves NEXUM", async ({ page }) => {
  const errors = await open(page);
  const [a, b] = await events(page);
  await tapEvent(page, a);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  await expect(page.getByTestId("tb-back")).toBeEnabled();
  // the × is on the card, reachable, on top
  const hit = await page.getByTestId("sheet-close").evaluate((el) => { const r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.right <= innerWidth && !!h && (h === el || el.contains(h)); });
  expect(hit).toBe(true);
  await page.getByTestId("sheet-more").click();                               // the detail
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-sheet", "full");
  await page.goBack();                                                        // the detail closes, the element stays
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-sheet", "peek");
  expect((await st(page)).focus).toBe(a);
  await page.goBack();                                                        // the map
  await atStart(page);
  // the same with ←, one element deeper
  await tapEvent(page, a);
  await tapEvent(page, b);
  await page.getByTestId("tb-back").click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  await page.getByTestId("tb-back").click();
  await atStart(page);
  expect((await st(page)).steps).toBeGreaterThanOrEqual(2);                    // the investigation keeps its steps
  expect(errors).toEqual([]);
});

test("Mappa → Indagine → Evento → Chiudi → Indagine → Mappa", async ({ page }) => {
  const errors = await open(page);
  const [a, b] = await events(page);
  await tapEvent(page, a);
  await tapEvent(page, b);
  await page.getByTestId("sheet-close").click();                              // × : out of the cards, to the map
  await atStart(page);
  const steps = (await st(page)).steps;
  await page.getByTestId("tb-path").click();                                  // the Indagine
  await expect(page.getByTestId("overlay-trail")).toBeVisible();
  await page.getByTestId("trail-sheet").locator(`.path-step[data-ref="${a}"]`).first().click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  await expect(page.getByTestId("overlay-trail")).toHaveCount(0);
  await page.getByTestId("sheet-close").click();                              // Chiudi: back in the Indagine
  await expect(page.getByTestId("overlay-trail")).toBeVisible();
  expect((await st(page)).focus).toBeNull();
  expect((await st(page)).steps).toBe(steps);                                 // nothing of the work lost
  await page.getByTestId("overlay-close").click();                            // Chiudi the Indagine: the map
  await atStart(page);
  // the same with the browser's Back: step → Back → Indagine → Back → map
  await page.getByTestId("tb-path").click();
  await page.getByTestId("trail-sheet").locator(`.path-step[data-ref="${b}"]`).first().click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", b);
  await page.goBack();
  await expect(page.getByTestId("overlay-trail")).toBeVisible();
  await page.goBack();
  await atStart(page);
  expect(errors).toEqual([]);
});

test("Mappa → Filtri → Dettaglio → Indietro: the filters stay applied", async ({ page }) => {
  const errors = await open(page);
  const [a] = await events(page);
  await page.getByTestId("tb-more").click();
  await page.getByRole("menuitem", { name: /^Filtri/ }).click();
  await expect(page.getByTestId("overlay-filters")).toBeVisible();
  const before = await st(page);
  await page.getByTestId("filters-events").locator(".typerow input").first().click();   // one category of events on the map
  await expect.poll(() => st(page).then((s) => s.mapTypes + s.scope)).not.toBe(before.mapTypes + before.scope);
  const applied = await st(page);
  await page.getByTestId("overlay-close").click();
  await tapEvent(page, a);
  await page.getByTestId("sheet-more").click();
  await page.goBack();
  await page.goBack();
  await atStart(page);
  const after = await st(page);
  expect([after.scope, after.mapTypes, after.mapFloor]).toEqual([applied.scope, applied.mapTypes, applied.mapFloor]);
  expect(errors).toEqual([]);
});

test("Cerca → risultato → Indietro: the search with its words; Grafo and Tempo → Indietro: the map", async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-tab="search"]').click();
  await page.locator("#nexum-search").fill("earthquake");
  const first = page.locator('#nexum-results [data-ref^="evt_"]').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  const id = await first.getAttribute("data-ref");
  await first.click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id!);
  await page.goBack();
  await expect(page.getByTestId("overlay-search")).toBeVisible();
  await expect(page.locator("#nexum-search")).toHaveValue("earthquake");
  await page.goBack();
  await atStart(page);
  // another surface, nothing in focus: Back returns to the map (never out of NEXUM)
  await page.locator('[data-tab="graph"]').click();
  await expect(page.getByTestId("tb-back")).toBeEnabled();
  await page.goBack();
  await atStart(page);
  await page.locator('[data-tab="time"]').click();
  await page.getByTestId("tb-back").click();
  await atStart(page);
  // Mappa again, on the map, with an element: the map in view, the card on its name line (nothing closed)
  await tapEvent(page, id!);
  await page.locator('[data-tab="map"]').click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-sheet", "mini");
  expect((await st(page)).focus).toBe(id);
  await expect(page.getByTestId("sheet-close")).toBeVisible();
  expect(errors).toEqual([]);
});

test("browser history: a direct link, Back, Forward and reload stay consistent; Back from the start leaves as before", async ({ page }) => {
  const errors = await open(page);
  const [a] = await events(page);
  await page.goto("about:blank");
  await page.goto(`/#/f/${a}`);                                                 // a shared link to a card
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  await page.goBack();                                                        // the card closes, NEXUM stays
  await atStart(page);
  expect(new URL(page.url()).hash).toBe("");
  await page.goForward();                                                     // Forward: the same card again
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  expect(new URL(page.url()).hash).toBe(`#/f/${a}`);
  await page.reload();                                                        // reload on the card: the card
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", a);
  await page.goBack();
  await atStart(page);
  await page.goBack();                                                        // from the start: out, at the first press
  await expect.poll(() => page.url()).toBe("about:blank");
  // a new search starts empty (only Back from a result keeps the words)
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await events(page);
  await page.locator('[data-tab="search"]').click();
  await expect(page.locator("#nexum-search")).toHaveValue("");
  expect(errors).toEqual([]);
});
