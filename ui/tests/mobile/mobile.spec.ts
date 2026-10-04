// MOBILE ACCEPTANCE (2026-09-30) — the journey of a person who opens NEXUM for the first time, with one finger:
//   APRO → VEDO → TOCCO → CAPISCO → SCOPRO UNA CONNESSIONE → CHIEDO PERCHÉ → LA SEGUO → CONTINUO
// on iPhone 15 Pro Max (WebKit, portrait and landscape) and Samsung Fold (Chrome, closed and open), at the useful
// viewport. Each step is checked geometrically (geometry.ts) and photographed for the comparison page.
// These tests do not declare the mobile UX accepted: the physical test on the devices is the final gate.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { check, seen } from "./geometry";

const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
const M = FX.myanmar;
const BILMA = "obj_so46fbjmsawy2arc6l7bzey6le", NIGER = "obj_7puc6ihzym65lqdhadu7p357mm";
const SANT = "evt_4qhoqlynens5ybsmsauckquqnm", ITALY_TYPE = "place.country";
const PITCAIRN = "obj_jjgmkh6k3inlquyv57y7aqij2m";   // no relation, event or insight in D1


async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  return errors;
}
const sheet = (page: Page) => (page.viewportSize()!.width < 700);
async function search(page: Page, q: string, id: string) {
  await page.locator('[data-tab="search"]').click();
  await expect(page.getByTestId("overlay-search")).toBeVisible();
  await page.locator("#nexum-search").fill(q);
  await page.locator(`#nexum-results [data-ref="${id}"]`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  await expect(page.getByTestId("overlay-search")).toHaveCount(0);
  await expect(page.getByTestId("connections")).toBeVisible();
}
const focusOf = (page: Page) => page.evaluate(() => (window as any).__nexum.store.get().focus);

test("journey: open → see → touch → understand → connection → Perché? → follow → continue", async ({ page }, info) => {
  const P = info.project.name;
  const errors = await open(page);
  // APRO · VEDO — the map, the country names, where NEXUM's own connections are, what to do
  await expect(page.getByTestId("topbar")).toBeVisible();
  await expect(page.getByTestId("bottom-nav").locator("button")).toHaveText(["▦Mappa", "⋰Grafo", "▁▃▅Tempo", "⌕Cerca"]);
  // declared change (2026-10-02, map first): phones show one discovery and the way to the feed; Fold open and
  // tablets show the feed in the side panel
  if (page.viewportSize()!.width >= 700 && page.viewportSize()!.height >= 500) await expect(page.getByTestId("highlights")).toBeVisible();
  else {
    await expect(page.getByTestId("card-strip")).toContainText("Cosa ha trovato NEXUM");
    await expect(page.locator('[data-testid="home-discoveries"] [data-discovery]')).toHaveCount(1);
    await expect(page.getByTestId("strip-found")).toHaveText("Cosa sta succedendo ▴");
  }
  // the starting state is not a user filter (2026-10-01): "Filtri" without a number, the period written out
  await expect(page.getByTestId("filters-chip")).toHaveText("Filtri");
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · ultimi 12 mesi");
  await expect(page.getByTestId("reset")).toHaveCount(0);
  await check(page, P, "01-apertura");
  // TOCCO — an element (search is the reproducible way to touch the same one on every device)
  await search(page, "Mandalay", M.quake);
  await page.waitForTimeout(900);
  // CAPISCO — name, what · where · when, and the first real connection on the first screen
  await seen(page, ".focushead h1", "name");
  await seen(page, '[data-testid="focus-what"]', "what · where · when");
  await seen(page, '[data-testid="connections"] .conn-row .ref', "first connection");
  await expect(page.locator('[data-testid="connections"] .conn-row').first()).toHaveAttribute("data-cat", "insight");   // associations first
  // declared change (2026-10-01, richer world): R2 is one of several associations; it is followed by its identity
  const first = page.locator(`[data-testid="connections"] .conn-row[data-conn="${M.r2}"]`);
  await expect(first).toContainText("Associazione trovata da una regola");
  await seen(page, '[data-testid="connections"] .conn-row .whybtn', "Perché?");
  await check(page, P, "02-fuoco-mandalay");
  // CHIEDO PERCHÉ — the explanation opens in the card; Back returns to the element
  await first.locator(".whybtn").click();
  await expect(page.getByTestId("why")).toHaveAttribute("data-why", M.r2);
  await check(page, P, "03-perche");
  await page.goBack();
  await expect(page.getByTestId("why")).toHaveCount(0);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);
  // SEGUO la connessione — pivot: new focus, the trail grows, the map follows
  await first.locator(".ref").click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
  await expect(page.getByTestId("tb-title")).toContainText(/Associazione|EMSR|M /);
  await page.waitForTimeout(700);
  await check(page, P, "04-pivot-insight");
  // CONTINUO — follow one of its members
  const member = page.locator(`[data-testid="connections"] .conn-row[data-conn="${M.act}"] .ref`);
  await member.click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.act);
  // Graph and Time follow the same focus and say something about it first
  await page.locator('[data-tab="graph"]').click();
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.act);
  await expect(page.getByTestId("graph-say")).toBeVisible();
  await expect(page.getByText("prof. 1 · max 100")).toHaveCount(0);                        // technical details: in Opzioni
  await expect(page.getByTestId("graph-count")).toHaveCount(0);
  await check(page, P, "05-grafo");
  await page.locator('[data-tab="time"]').click();
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", M.act);
  await seen(page, '[data-testid="tv-say"]', "what happened, first");
  const [say, band] = await Promise.all([page.getByTestId("tv-say").boundingBox(), page.locator(".tv-band").boundingBox()]);
  expect(say!.y).toBeLessThan(band!.y);                                                     // the answer before the chart
  await check(page, P, "06-tempo");
  // Percorso — full names, no ellipses; ← goes back one step
  await page.getByTestId("tb-path").click();
  await expect(page.getByTestId("trail-sheet").locator(".path-step")).toHaveCount(3);
  const cut = await page.locator(".path-lbl").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || /…$/.test(e.textContent!)).length);
  expect(cut, "trail names cut").toBe(0);
  await check(page, P, "07-percorso");
  await page.goBack();                                                                      // Android Back / browser back
  await expect(page.getByTestId("overlay-trail")).toHaveCount(0);
  await page.getByTestId("tb-back").click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
  const title = await page.getByTestId("topbar").innerText();
  expect((title.match(/…|\.\.\./g) ?? []).length, "top bar made of ellipses").toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("Bilma Airport: what it is, where, the only connection (Si trova in → Niger), Perché?, pivot; map shows NIGER", async ({ page }, info) => {
  const P = info.project.name;
  await open(page);
  await search(page, "Bilma", BILMA);
  await expect(page.locator(".focushead h1")).toHaveText("Bilma Airport");
  // declared change (2026-10-04, integrity gate): OurAirports lists airports, airstrips, heliports, closed facilities
  await expect(page.getByTestId("focus-what")).toHaveText("Struttura aeronautica · Niger");
  await expect(page.getByTestId("conn-empty")).toContainText("Nessuna connessione supportata trovata per questo elemento.");   // declared change
  await expect(page.locator(`[data-testid="conn-geo"] .conn-row[data-conn="${NIGER}"]`)).toHaveCount(1);   // geography, apart
  const row = page.locator(`[data-testid="connections"] .conn-row[data-conn="${NIGER}"]`).first();
  await expect(row).toContainText("Si trova in");
  await seen(page, `[data-testid="connections"] .conn-row[data-conn="${NIGER}"] .ref`, "Niger");
  await seen(page, `[data-testid="connections"] .conn-row[data-conn="${NIGER}"] .whybtn`, "Perché?");
  await page.waitForTimeout(1200);
  await expect(page.locator(".maplabel.place.linked", { hasText: "NIGER" })).toHaveCount(1);
  await seen(page, ".maplabel.place.linked", "NIGER on the map");
  await check(page, P, "08-bilma");
  await row.locator(".ref").click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", NIGER);
  await check(page, P, "09-niger");
});

test("filters: a connection hidden by a filter is declared, with Mostra; a real absence is said plainly", async ({ page }, info) => {
  const P = info.project.name;
  await open(page);
  // the Fold screenshot of 2026-09-30: "Paese / territorio" unchecked, Sant'Angelo earthquake, graph "1 nodo · 0 archi"
  await page.getByTestId("filters-chip").click();
  // declared change (2026-10-03, World Intelligence): the map starts with the cities only — "Tutto" first, then a
  // category turned off is a filter of every view (its connections are declared hidden), as before
  await page.getByTestId("overlay-filters").getByTestId("map-all").click();
  await page.locator(`.typerow[data-type="${ITALY_TYPE}"]`).click();
  await check(page, P, "10-filtri");
  await page.mouse.click(page.viewportSize()!.width - 8, page.viewportSize()!.height / 2);   // tap outside: closes
  await expect(page.getByTestId("overlay-filters")).toHaveCount(0);
  await search(page, "Sant'Angelo", SANT);
  await expect(page.locator('[data-testid="conn-excluded"]')).toHaveCount(1);              // in the card: listed, marked
  await page.locator('[data-tab="graph"]').click();
  await expect(page.getByTestId("graph-hidden")).toContainText("1 connessione nascosta dai filtri");
  await expect(page.getByTestId("graph-say")).not.toContainText("Nessuna connessione");
  await check(page, P, "11-grafo-nascosta");
  await page.getByTestId("graph-show-hidden").click();
  await expect(page.getByTestId("graph-unfiltered")).toBeVisible();
  // declared change (richer world): the unfiltered graph holds Italy and whatever else the world connects
  await expect.poll(async () => Number(await page.getByTestId("graph").getAttribute("data-order"))).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.graph.graph.nodes().some((n: string) => (window as any).__nexum.store.entity(n)?.label === "Italy"))).toBe(true);
  await check(page, P, "12-grafo-mostra");
  // a real absence
  await page.getByTestId("filters-chip").click();
  await page.getByTestId("overlay-filters").getByTestId("reset").first().click();
  await page.getByTestId("overlay-close").click();
  await expect(page.getByTestId("filters-chip").first()).toHaveText("Filtri");
  await search(page, "Pitcairn", PITCAIRN);
  await expect(page.getByTestId("graph-say")).toContainText("Nessuna connessione trovata per questo elemento.");
  await check(page, P, "13-grafo-nessuna");
  await page.locator('[data-tab="time"]').click();
  await expect(page.getByTestId("tv-say")).toHaveText("Nessun evento datato collegato a Pitcairn Is.");
  await check(page, P, "14-tempo-nessuno");
});

test("overlays: one at a time; the scrim, the map and Back close each of them", async ({ page }, info) => {
  const P = info.project.name;
  await open(page);
  await search(page, "Mandalay", M.quake);
  const opens: [string, () => Promise<void>][] = [
    ["filters", () => page.getByTestId("filters-chip").click()],
    ["menu", () => page.getByTestId("tb-more").click()],
    ["trail", () => page.getByTestId("tb-path").click()],
    ["search", () => page.locator('[data-tab="search"]').click()],
    ["info", async () => { await page.getByTestId("tb-more").click(); await page.getByRole("menuitem", { name: "Informazioni" }).click(); }],
  ];
  for (const [name, openIt] of opens) {
    for (const how of ["tap", "back"] as const) {
      await openIt();
      await expect(page.getByTestId(`overlay-${name}`)).toBeVisible();
      await expect(page.locator(".ov")).toHaveCount(1);                                        // one at a time
      if (how === "tap") {
        const box = (await page.getByTestId(`overlay-${name}`).boundingBox())!;
        const vp = page.viewportSize()!;
        // a point outside the panel (on the map/surface underneath)
        const left = box.x, right = vp.width - (box.x + box.width);
        const x = left >= 20 ? left / 2 : right >= 20 ? vp.width - right / 2 : vp.width / 2;
        const y = left >= 20 || right >= 20 ? vp.height / 2 : Math.min(vp.height - 80, box.y + box.height + 20);
        if (name === "search") { await page.goBack(); }                                       // full-screen: Back / Chiudi
        else await page.mouse.click(x, y);
      } else await page.goBack();
      await expect(page.getByTestId(`overlay-${name}`), `${name} closes by ${how}`).toHaveCount(0);
      expect(await focusOf(page)).toBe(M.quake);                                               // closing never loses the focus
    }
  }
  // the card opened in full: Back returns it to its first screen; Esc closes the explanation (keyboards)
  if (sheet(page)) {
    await page.getByTestId("sheet-more").click();
    await expect(page.getByTestId("inspector")).toHaveAttribute("data-sheet", "full");
    await check(page, P, "15-scheda-completa");
    await page.goBack();
    await expect(page.getByTestId("inspector")).toHaveAttribute("data-sheet", "peek");
  }
  await page.locator(`.focushead`).first().waitFor();
  await page.locator('[data-testid="connections"] .conn-row .whybtn').first().click();
  await expect(page.getByTestId("why")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("why")).toHaveCount(0);
});

test("map hierarchy: with a focus, secondary data recede; at world scale no grid of squares", async ({ page }, info) => {
  const P = info.project.name;
  await open(page);
  // declared change (2026-10-03, one operational map): aggregates are a soft density (heatmap), never squares or a
  // shaded grid — on touch and on desktop alike
  const cells = await page.evaluate(() => {
    const m = (window as any).__nexum.map;
    const ls = m.getStyle().layers.filter((l: any) => l.source === "nexum-cells");
    return { drawn: ls.filter((l: any) => l.type !== "heatmap" && !(l.type === "circle" && m.getPaintProperty(l.id, "circle-opacity") === 0)
      && l.id !== "nexum-cells-hl").map((l: any) => l.id), shading: !!m.getLayer("nexum-cellfill") };
  });
  expect(cells.drawn, "no square marks for aggregates").toEqual([]);
  expect(cells.shading, "no shaded grid").toBe(false);
  await search(page, "Mandalay", M.quake);
  await page.waitForTimeout(1200);
  await seen(page, ".maplabel.focus", "focus name on the map");
  const lab = (await page.locator(".maplabel.focus").boundingBox())!;
  expect(lab.x + lab.width, "focus name inside the screen").toBeLessThanOrEqual(page.viewportSize()!.width);
  await check(page, P, "16-mappa-fuoco");
});

test("period: the start is the last 12 months of the data; selecting an old event never changes it; Ripristina keeps the focus", async ({ page }, info) => {
  const P = info.project.name;
  await open(page);
  await expect(page.getByTestId("map-attr")).toContainText("Dati aggiornati al");
  // an event of 2025 (outside the last 12 months): date in the head, outside the period, the period unchanged
  await search(page, "Mandalay", M.quake);
  await expect(page.getByTestId("focus-what")).toHaveText("Terremoto · Myanmar · 28 mar 2025");
  await expect(page.getByTestId("focus-outside")).toContainText("fuori dal periodo osservato");     // on the first screen
  await seen(page, ".focushead .whatline", "outside the period, said in the head");
  await expect(page.getByTestId("outside-note")).toContainText("Fuori dal periodo osservato · ultimi 12 mesi");
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · ultimi 12 mesi");
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("map-appears")).toContainText("fuori dal periodo osservato");   // the focus stays drawn
  await seen(page, '[data-testid="map-appears-action"]', "Vai al 2025 on the map");
  await check(page, P, "17-fuori-periodo");
  // "Vai al 2025" is an explicit choice: a period the person chose, cancellable with Ripristina
  await page.getByTestId("map-appears-action").click();
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · 2025");
  await expect(page.getByTestId("reset").first()).toBeVisible();
  await expect(page.getByTestId("focus-outside")).toHaveCount(0);
  // a new focus and Back: the period stays as chosen; the step observed with another period says so
  await page.locator(`[data-testid="connections"] .conn-row[data-conn="${M.r2}"] .ref`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
  await page.getByTestId("reset").first().click();                                         // Ripristina: focus kept
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · ultimi 12 mesi");
  await page.getByTestId("tb-back").click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · ultimi 12 mesi");   // never reapplied silently
  await check(page, P, "18-indietro");
  // the period choices: words, whole months, the freshness of the data
  await page.getByTestId("period-chip").click();
  // the data's most recent month moved to October 2026 (events of 2026-10-01): the last 12 whole months follow it
  await expect(page.getByTestId("period-sheet")).toContainText("nov 2025 – ott 2026");
  await expect(page.getByTestId("period-sheet")).toContainText("Dati aggiornati al");
  await check(page, P, "19-periodo");
  await page.locator('[data-year="2020"]').click();
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · 2020");
  await page.getByTestId("filters-chip").click();
  await page.locator('.typerow[data-type="place.country"]').click();
  await page.getByTestId("overlay-close").click();
  await expect(page.getByTestId("filters-chip").first()).toHaveText("Filtri · 1");
  await check(page, P, "20-modificato");
  await page.getByTestId("reset").first().click();
  await expect(page.getByTestId("filters-chip").first()).toHaveText("Filtri");
  await expect(page.getByTestId("period-chip")).toHaveText("Periodo · ultimi 12 mesi");
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);
});
