// DOCUMENTED EPISODES (2026-10-19, author's authorisation, local example: Milan, 17–18 October 2026). They are found
// by searching the city, listed first in the city's card, apart from GDELT's reports; an episode's card says what
// happened with its sources, the figures attributed, statements and accusations as such, the documented roles only
// and "no responsibility established"; the march's organiser is linked to the march, never to the clashes; the office
// holders on the day are institutional context, apart from the card and after it, never a role; the verification
// status counts outlets, never an independent check; the graph draws the documented links. From the city, the news open on 24 hours, with 1 and 6 hours one tap away. Needs a snapshot with
// curated.public_order.
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await gdelt(page);
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
async function search(page: Page, q: string) {
  await page.locator("#nexum-search").first().fill(q);
  await page.waitForFunction((q) => performance.getEntriesByName(`nexum:search:${q}`).length > 0, q, { timeout: 30_000 });
  const list = page.getByTestId("search-results");
  await expect(list.locator(".it").first()).toBeVisible();
  return list;
}
const focusLabel = (page: Page) => page.evaluate(() => (window as any).__nexum.store.entity((window as any).__nexum.store.get().focus)?.label);
async function openMilan(page: Page) {
  await search(page, "milano");
  await page.locator("#nexum-search").first().press("Enter");
  await expect.poll(() => focusLabel(page)).toBe("Milan");
}
async function openEpisode(page: Page, text: string) {
  await page.goto("/");                       // each episode from the city's card, as a person would reach it
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await openMilan(page);
  await expect(page.getByTestId("place-episode")).toHaveCount(11, { timeout: 30_000 });
  await page.getByTestId("place-episode").filter({ hasText: text }).locator(".ref, button, a").first().click();
  await expect(page.getByTestId("episode-record")).toBeVisible({ timeout: 30_000 });
}

test("«milano»: the city first, then its documented episodes in their own group (airports stay)", async ({ page }) => {
  const errors = await open(page);
  const list = await search(page, "milano");
  const groups = await list.locator(".grp").allTextContents();
  expect(groups[0]).toBe("Città / insediamento");
  expect(groups.some((g) => /episodi documentati|Episodio di ordine pubblico/.test(g))).toBe(true);
  const all = (await list.locator(".it").allTextContents()).join(" | ");
  expect(all).toMatch(/Milano, 1[78] ottobre 2026/);
  expect(all).toContain("Milano Linate Airport");
  expect(errors).toEqual([]);
});

test("Milan's card lists the 11 documented episodes first, in order of time, apart from GDELT's reports", async ({ page }) => {
  const errors = await open(page);
  await openMilan(page);
  const eps = page.getByTestId("place-episodes");
  await expect(eps).toContainText("Episodi documentati · 11");
  await expect(eps).toContainText("approvazione dell'autore (19 ottobre 2026), non revisionati da una seconda persona");
  const labels = await page.getByTestId("place-episode").allTextContents();
  expect(labels[0]).toMatch(/17(–18)? ottobre/);
  expect(labels.at(-1)).toMatch(/18 ottobre/);
  // the GDELT reports stay a separate look-up, after the episodes
  const order = await page.evaluate(() => { const a = document.querySelector('[data-testid="place-episodes"]')!, b = document.querySelector('[data-testid="place-news"]')!;
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); });
  expect(order).toBe(true);
  expect(errors).toEqual([]);
});

test("the Carrefour episode: what, where and when (Milan's time), verification, sources linked, no attribution", async ({ page }) => {
  const errors = await open(page);
  await openEpisode(page, "Carrefour");
  const r = page.getByTestId("episode-record");
  await expect(r).toHaveAttribute("data-category", "looting");
  await expect(page.getByTestId("episode-where")).toContainText("via Torino");
  await expect(page.getByTestId("episode-where")).toContainText("15:05");
  await expect(page.getByTestId("episode-verification")).toContainText("concorde");
  await expect(page.getByTestId("episode-draft")).toContainText("non revisionato da una seconda persona");
  await expect(page.getByTestId("episode-attrib")).toContainText("Nessuna responsabilità accertata");
  await expect(page.getByTestId("episode-verification-note")).toContainText("non è una verifica indipendente");
  const hrefs = await page.getByTestId("episode-sources").locator("a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(hrefs.length).toBe(2);
  for (const h of hrefs) { const u = new URL(h); expect(u.protocol).toBe("https:"); expect(u.search).toBe(""); }
  expect(hrefs.join(" ")).toContain("lapresse.it");
  expect(errors).toEqual([]);
});

test("the march names its organiser as reported; the clashes do not; figures are attributed; accusations are not facts", async ({ page }) => {
  const errors = await open(page);
  await openEpisode(page, "corteo");
  await expect(page.getByTestId("episode-roles")).toContainText("Italia in piazza");
  await expect(page.getByTestId("episode-roles")).toContainText("NEXUM non gli attribuisce le violenze");
  await openEpisode(page, "scontri tra via Broletto");
  await expect(page.getByTestId("episode-roles")).not.toContainText("Italia in piazza");
  await expect(page.getByTestId("episode-roles")).toContainText("Polizia di Stato");
  await openEpisode(page, "cifre sui fatti del 17 ottobre");
  const figs = page.getByTestId("episode-figures").locator("li");
  expect(await figs.count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByTestId("episode-figures")).toContainText("secondo nota della Questura di Milano");
  await openEpisode(page, "dichiarazioni pubbliche");
  await expect(page.getByTestId("episode-statements").locator('li[data-nature="accusa"]').first()).toContainText("ACCUSA (non un fatto accertato)");
  await expect(page.getByTestId("episode-facts")).toHaveCount(0);
  // an accusation is one claim; the proposal that came with it is a statement of its own
  const salvini = page.getByTestId("episode-statements").locator("li", { hasText: "Salvini" });
  await expect(salvini.and(page.locator('[data-nature="accusa"]'))).toHaveCount(1);
  await expect(salvini.and(page.locator('[data-nature="dichiarazione"]'))).toContainText("proposta politica");
  // when the statements were given, not a time of the violence
  await expect(page.getByTestId("episode-where")).toContainText("17 e del 18 ottobre");
  expect(errors).toEqual([]);
});

test("the office holders on the day are institutional context, apart from the card and after it, never a role", async ({ page }) => {
  const errors = await open(page);
  await openEpisode(page, "dichiarazioni pubbliche");
  await expect(page.getByTestId("episode-roles-none")).toBeVisible();
  const ctx = page.getByTestId("episode-context");
  await expect(ctx).toContainText("Contesto istituzionale (non è un collegamento con l'episodio)", { timeout: 30_000 });
  await expect(ctx.getByTestId("gov-during")).toContainText("durante il mandato di");
  // never inside the card, never before it
  await expect(page.getByTestId("episode-record").getByTestId("gov-during")).toHaveCount(0);
  await expect(page.locator('[data-testid="object-mode"] > [data-testid="gov-during"], [data-testid="object-mode"] > section[data-testid="gov-during"]')).toHaveCount(0);
  const after = await page.evaluate(() => { const a = document.querySelector('[data-testid="episode-record"]')!, b = document.querySelector('[data-testid="episode-context"]')!;
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); });
  expect(after).toBe(true);
  expect(errors).toEqual([]);
});

test("graph and time: the episode is drawn with Milan and its documented roles, and is on the time line", async ({ page }) => {
  const errors = await open(page);
  await openEpisode(page, "corteo");
  const id = await page.evaluate(() => (window as any).__nexum.store.get().focus);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "graph" }));
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", id, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => { const g = (window as any).__nexum.graph?.sigma?.getGraph?.();
    return g ? g.nodes().map((n: string) => g.getNodeAttribute(n, "label")).join(" | ") : ""; }), { timeout: 30_000 }).toMatch(/(Milan[\s\S]*Italia in piazza)|(Italia in piazza[\s\S]*Milan)/);
  // the workspace's time line (desktop): the episode is dated, never "nothing dated" (the phone's Tempo: mobile spec)
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "map" }));
  await expect(page.getByTestId("timeline").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("tl-empty")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("from the city, the news open on 24 hours; 1 and 6 hours stay available", async ({ page }) => {
  const errors = await open(page);
  await openMilan(page);
  await page.getByTestId("place-news-open").first().click();
  await expect(page.getByTestId("news-panel")).toBeVisible();
  await expect(page.getByTestId("ops-news-window-24")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ops-news-window-1")).toBeEnabled();
  await page.getByTestId("ops-news-window-6").click();
  await expect(page.getByTestId("ops-news-window-6")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
