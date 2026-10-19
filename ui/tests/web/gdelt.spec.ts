// GDELT IN THE BROWSER (2026-10-18, D7 option A): the control cases of the author's GO in the real page — news asked
// from GDELT only on demand, said with their real time (never "live"), public order shown by declared categories with the
// original codes, unconfirmed places drawn hollow, the snapshot's archive when GDELT cannot be reached, and the policy.
// GDELT's answers are real files of 17 October 2026 (tests/gdelt.shared.ts): nothing is invented.
import { expect, test, type Page } from "@playwright/test";
import { gdelt } from "../gdelt.shared";

async function open(page: Page) {
  const errors: string[] = [], csp: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy|Refused to connect/i.test(m.text())) csp.push(m.text()); });
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return { errors, csp };
}
const oneHour = async (page: Page) => {
  await page.getByTestId("ops-tool-layers").click();
  await page.getByTestId("ops-layer-news").check();
  await page.getByTestId("ops-news-window-1").click();
};
const items = (page: Page) => page.getByTestId("ops-alerts-list").getByTestId("ops-alert");

test("on demand only: no request to GDELT until the news layer or the alerts are opened; the policy allows GDELT, nothing else changes", async ({ page }) => {
  const asked = await gdelt(page);
  const { errors, csp } = await open(page);
  await page.waitForTimeout(3000);
  expect(asked, "nothing asked at start").toEqual([]);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("https://data.gdeltproject.org");
  await oneHour(page);
  await expect.poll(() => asked.filter((n) => n.startsWith("lastupdate")).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  // the window's budget: the 1 h default — 4 slots per stream — and the mentions of the same slots, nothing older
  const files = asked.filter((n) => n.endsWith(".zip"));
  expect(files.filter((n) => n.includes("export")).length).toBeLessThanOrEqual(2 * 4);
  expect(files.filter((n) => n.includes("mentions")).length).toBeLessThanOrEqual(2 * 4);
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
});

test("freshness: the newest GDELT file and its real time — files of 17 October are said LATE; never 'live', never 'ultima ora'", async ({ page }) => {
  await gdelt(page);
  await open(page);
  await oneHour(page);
  const st = page.getByTestId("ops-layer-news-state");
  await expect(st).toContainText(/GDELT IN RITARDO: ultimo file 19:15 UTC \(.+ fa\) · finestra 1 h/, { timeout: 60_000 });
  await expect(st).toHaveClass(/warn/);
  await expect(page.locator(".ops-group-h", { hasText: "Avvisi e notizie" })).toBeVisible();
  await expect(page.getByText("Avvisi in diretta")).toHaveCount(0);
  await expect(page.getByText(/ultima ora\)/i)).toHaveCount(0);
  await expect(page.getByTestId("ops-layer-news")).toBeChecked();
  expect(await st.textContent()).not.toMatch(/\blive\b|(?<!non )in diretta/i);
});

test("Milan, 17 October: clashes among the reports, by category, each with its original CAMEO codes, its place and how sure it is", async ({ page }) => {
  await gdelt(page);
  const { errors } = await open(page);
  await oneHour(page);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.getByTestId("ops-tool-alerts").click();
  await page.getByTestId("ops-alerts-tab-order").click();
  await expect(page.getByTestId("ops-alerts-cats")).toBeVisible();
  await expect(page.getByTestId("ops-alerts-cat-note")).toContainText("Incendi collegati a disordini");
  await page.getByTestId("ops-alerts-cat-riot").click();
  await expect.poll(() => items(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const titles = await items(page).locator("b").allTextContents();
  expect(titles.every((t) => t.includes("Scontri e disordini")), titles.join(" | ")).toBeTruthy();
  await page.getByTestId("ops-alerts-q").fill("Milan");
  await expect.poll(() => items(page).count()).toBeGreaterThan(0);
  await items(page).first().locator("button").click();
  const card = page.getByTestId("ops-feat-card");
  await expect(card).toHaveAttribute("data-layer", "ops-news");
  await expect(page.getByTestId("news-status")).toContainText("RIPORTATO DAI MEDIA · non verificato · codifica automatica");
  await expect(page.getByTestId("news-category")).toContainText("Scontri e disordini");
  await expect(page.getByTestId("news-codes")).toContainText(/CAMEO (145|19\d)/);
  await expect(page.getByTestId("news-geo")).toContainText(/testata dello stesso paese: (sì|no); città nominata nell'indirizzo dell'articolo: (sì|no)/);
  await expect(page.getByTestId("news-reliability")).toContainText("non è un fatto verificato né una dichiarazione ufficiale");
  await expect(page.getByTestId("news-tolls")).toContainText("NEXUM non riporta bilanci");
  await expect(page.getByTestId("news-day")).toContainText("2026");
  await expect(page.getByTestId("news-stream")).toContainText("GDELT 2.0");
  expect(errors).toEqual([]);
});

test("places: only CONFIRMED places are points; 'Rome' of a US article and the articles naming Bologna are counted in Italy's circle, never a point", async ({ page }) => {
  await gdelt(page);
  await open(page);
  await oneHour(page);
  await page.getByTestId("ops-news-window-6").click();   // 6 h: the 17:00 file with the 'Rome' article of a US outlet
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().newsStatus?.hours), { timeout: 60_000 }).toBe(6);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [11, 44], zoom: 4.5 }));
  await page.waitForTimeout(2500);
  const pts = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-news").map((x: any) => x.properties));
  const agg = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-news-agg").map((x: any) => x.properties));
  expect(pts.length).toBeGreaterThan(0);
  expect(pts.every((p: any) => p.geo === "confirmed"), "points: confirmed places only").toBeTruthy();
  expect(pts.some((p: any) => String(p.links).includes("fox56.com/news/local/rome-man")), "the US 'Rome' article is not a point").toBeFalsy();
  expect(pts.some((p: any) => String(p.links).includes("bologna")) && pts.filter((p: any) => String(p.links).includes("bologna")).some((p: any) => p.place.startsWith("Milan")), "no Milan point from a Bologna article").toBeFalsy();
  const it = agg.find((p: any) => p.nation_name === "Italy");
  expect(it, "Italy's circle").toBeTruthy();
  expect(it.n).toBeGreaterThan(0);
  for (const c of ["Turin", "Torino", "Bologna", "Bergamo"]) expect(pts.filter((p: any) => String(p.place).startsWith(c)).length, c).toBe(0);
  const peaceful = pts.filter((p: any) => JSON.parse(p.codes).every(([c]: [string]) => c.startsWith("14") && !c.startsWith("145")));
  for (const p of peaceful) expect(JSON.parse(p.cats)).toEqual(["protest"]);
  // the circle's card says what it is and opens the list (the map centred on it, the Livelli panel closed)
  await page.getByTestId("ops-panel-close").click();
  const c = await page.evaluate(() => (window as any).__nexum.map.querySourceFeatures("ops-news-agg").find((x: any) => x.properties.nation_name === "Italy").geometry.coordinates);
  await page.evaluate((c) => (window as any).__nexum.map.jumpTo({ center: c, zoom: 4.5 }), c);
  await page.waitForTimeout(1200);
  const xy = await page.evaluate((c) => { const m = (window as any).__nexum.map, q = m.project(c), b = m.getCanvas().getBoundingClientRect(); return [b.left + q.x, b.top + q.y]; }, c);
  await page.mouse.click(xy[0], xy[1]);
  await expect(page.getByTestId("ops-feat-card")).toBeVisible();
  const n = page.getByTestId("ops-feat-n");
  for (let k = 0; k < 20 && !(await page.getByTestId("news-agg").count()); k++) { if (!(await n.isVisible())) break; await n.getByRole("button", { name: "Successivo" }).click(); }
  await expect(page.getByTestId("news-agg")).toContainText("Non hanno un punto preciso");
  await page.getByTestId("news-agg-open").click();
  await expect(page.getByTestId("news-panel")).toBeVisible();
  await expect(page.getByTestId("news-f-nation")).toHaveValue("Italy");
  await expect(page.getByTestId("news-f-geo")).toHaveValue("uncertain");
  expect(await page.getByTestId("news-item").evaluateAll((els) => els.every((e) => e.getAttribute("data-geo") !== "confirmed"))).toBeTruthy();
});

test("Notizie e ordine pubblico: Milan's confirmed reports and the ones GDELT only suggests there are two lists; a card in sections; list ↔ map", async ({ page }) => {
  await gdelt(page);
  const { errors } = await open(page);
  await page.getByTestId("ops-tool-news").click();
  await expect(page.getByTestId("news-panel-state")).toContainText("ultimo file 19:15 UTC", { timeout: 60_000 });
  await page.getByTestId("news-f-nation").selectOption("Italy");
  await page.getByTestId("news-f-city").selectOption("Milan");
  await expect(page.getByTestId("news-count-line")).toContainText("segnalazioni (articoli codificati da GDELT, non episodi indipendenti)");
  const conf = page.getByTestId("news-list-confirmed").getByTestId("news-item"), sugg = page.getByTestId("news-list-suggested").getByTestId("news-item");
  await expect.poll(() => conf.count()).toBeGreaterThan(0);
  await expect.poll(() => sugg.count()).toBeGreaterThan(0);
  expect(await conf.evaluateAll((els) => els.every((e) => e.getAttribute("data-geo") === "confirmed"))).toBeTruthy();
  expect(await sugg.evaluateAll((els) => els.every((e) => e.getAttribute("data-geo") !== "confirmed"))).toBeTruthy();
  await expect(page.getByTestId("news-h-suggested")).toContainText("luogo non verificato o ambiguo");
  // a suggested one: the card never says the event happened in Milan
  await sugg.first().locator("button.ops-alert").click();
  await expect(page.getByTestId("news-sentence")).toContainText("Luogo suggerito da GDELT, non verificato: Milan");
  for (const id of ["what", "where", "who", "attrib", "links", "sources"]) await expect(page.getByTestId(`news-sec-${id}`)).toBeVisible();
  await expect(page.getByTestId("news-attrib")).toContainText("Nessuna attribuzione documentata disponibile");
  await expect(page.getByTestId("news-link-outlet")).toContainText("coincidenza");
  await expect(page.getByTestId("ops-feat-place")).toHaveCount(0);   // no NEXUM place offered for an unverified place
  await expect(page.getByTestId("news-sources-note")).toContainText("cookie, consenso o abbonamento");
  // a confirmed one: where it was reported; to the map and back to the list
  await conf.first().locator("button.ops-alert").click();
  await expect(page.getByTestId("news-sentence")).toContainText(/^Evento riportato dai media a Milan/);
  await conf.first().getByTestId("news-item-map").click();
  await expect(page.getByTestId("ops-layer-news")).toHaveCount(0);   // the layer turned on by the list (the Livelli panel is not open)
  expect(await page.evaluate(() => (window as any).__nexum.ops.get().layers.news)).toBe(true);
  await page.getByTestId("ops-feat-tolist").click();
  await expect(page.getByTestId("news-f-city")).toHaveValue("Milan");
  // a 190 code without armed actors is said ambiguous, never "the army"
  await page.getByTestId("news-f-city").selectOption("");
  await page.getByTestId("news-f-cat").selectOption("armed");
  const armed = page.getByTestId("news-list").getByTestId("news-item");
  if (await armed.count()) { await armed.first().locator("button.ops-alert").click(); await expect(page.getByTestId("news-codes")).toContainText(/CAMEO (19|20)\d/); }
  expect(errors).toEqual([]);
});

test("GDELT unreachable: the snapshot's ARCHIVE, with its date, never presented as current; the rest of the alerts still work", async ({ page }) => {
  const asked = await gdelt(page, "down");
  const { errors } = await open(page);
  await page.getByTestId("ops-tool-alerts").click();
  await expect(page.getByTestId("ops-alerts-news-state")).toContainText(/ARCHIVIO del 6 ott 2026.*non in diretta · GDELT non raggiungibile ora/, { timeout: 60_000 });
  await expect(page.getByTestId("ops-alerts-news-state")).toHaveClass(/warn/);
  expect(asked.length).toBeGreaterThan(0);
  await page.getByTestId("ops-alerts-tab-reported").click();
  await expect.poll(() => items(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(items(page).first()).toContainText("archivio");
  await items(page).first().locator("button").click();
  await expect(page.getByTestId("news-status")).toContainText("ARCHIVIO, non in diretta");
  expect(errors).toEqual([]);
});

test("sources presented as current but stopped are said 'non aggiornata' (the Core's 'ok' only means the last download worked)", async ({ page }) => {
  await gdelt(page, "down");
  await open(page);
  const title = await page.getByTestId("statusbar").locator('span[title*="GDELT"]').first().getAttribute("title");
  expect(title).toMatch(/GDELT[^\n]*: non aggiornata/);
  await page.getByTestId("ops-tool-layers").click();
  await expect(page.getByTestId("ops-layer-hotspots-state")).toContainText(/dati del .*, non aggiornati da \d+ giorni/);
});
