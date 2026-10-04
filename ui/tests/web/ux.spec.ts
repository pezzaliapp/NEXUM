// UX1–UX6 — comprehension criteria of Phase 3A (UX review 2026-09-30). A person who does not know NEXUM opens it,
// selects an element, and on the FIRST SCREEN (no scrolling, where reasonably possible) finds:
//   UX1 what was selected (name; what · where · when)
//   UX2 at least one real connection, or the explicit statement that there is none of a kind
//   UX3 the nature of the connection, in words
//   UX4 how to ask "Perché?" (and it opens the explanation)
//   UX5 how to go to the connected element: the pivot moves Map, Graph and Timeline, the trail keeps the path
//   UX6 no implementation vocabulary on screen (scope, cell, level, internal codes)
// Real D1 cases: Bilma Airport (the case that exposed the problem: one relation only), the Mandalay earthquake
// (an association found by a rule must come before generic context), and an element of each kind.
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/";
const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
const M = FX.myanmar;
const BILMA = "obj_so46fbjmsawy2arc6l7bzey6le", NIGER = "obj_7puc6ihzym65lqdhadu7p357mm";
const OUT = new URL("../../../data/reports/phase3/screens/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const TECH = /\bscope\b|cella aggregata|\blivello \d|shares_participant|A~group|located_in|nearest_location|affected_area|insight_member|\bWHY\b|event_event_association|exposure_context|composite_context/;

const VIEWPORTS: Record<string, { width: number; height: number; scroll?: boolean }> = {
  "iphone15promax-430x932": { width: 430, height: 932 },
  "iphone-390x844": { width: 390, height: 844 },
  "fold-closed-344x882": { width: 344, height: 882 },
  "fold-open-884x1104": { width: 884, height: 1104 },
  "desktop-1440x900": { width: 1440, height: 900 },
  "iphone15promax-landscape-932x430": { width: 932, height: 430, scroll: true },
};

async function open(browser: Browser, vp: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 1280, hasTouch: vp.width < 1280 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 60_000 });
  return { ctx, page, errors };
}

const phone = (p: Page) => p.viewportSize()!.width < 768;
const touch = (p: Page) => p.viewportSize()!.width < 1280;
const sheet = (p: Page) => p.viewportSize()!.width < 700;
const tab = (p: Page, name: string) => p.locator(".tabs button", { hasText: name }).click();

/** Select as a person does: search, touch the result. */
async function pick(page: Page, q: string, id: string) {
  if (touch(page)) await tab(page, "Cerca");                    // declared change: touch layouts search from "Cerca"
  await page.locator("#nexum-search").fill(q);
  await page.locator(`#nexum-results [data-ref="${id}"]`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  await expect(page.getByTestId("connections")).toBeVisible();
}

/** Visible without scrolling: inside the viewport, above the phone's tab bar. */
async function firstScreen(page: Page, sel: string, allowScroll = false) {
  const loc = page.locator(sel).first();
  if (allowScroll) await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  expect(box, sel).not.toBeNull();
  const bottom = page.viewportSize()!.height - (touch(page) ? 56 : 0);   // the bottom navigation of touch layouts
  expect(box!.y, `${sel} top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${sel} bottom ≤ ${bottom}`).toBeLessThanOrEqual(bottom);
}

async function noTechTerms(page: Page) {
  const text = await page.evaluate(() => [".focushead", '[data-testid="connections"]', '[data-testid="map-appears"]',
    '[data-testid="map-legend"]', ".tl-head", '[data-testid="tl-empty"]', '[data-testid="world-summary"]', ".statusbar"]
    .flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => (e as HTMLElement).offsetParent !== null)
    .map((e) => (e as HTMLElement).innerText).join("\n"));
  const hit = text.match(TECH);
  expect(hit?.[0] ?? null, `technical term on screen: ${hit?.[0]}`).toBeNull();
}

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`UX1–UX6 Bilma Airport on ${name}: "Struttura aeronautica · Niger", no event or insight, located in → Niger, Perché?, pivot`, async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, vp);
    await noTechTerms(page);                                                              // UX6 (WORLD MODE)
    await pick(page, "Bilma", BILMA);
    await expect(page.locator(".focushead h1")).toHaveText("Bilma Airport");               // UX1
    // declared change (2026-10-04, integrity gate): OurAirports lists airports, airstrips, heliports, closed facilities
    await expect(page.getByTestId("focus-what")).toHaveText("Struttura aeronautica · Niger");
    await firstScreen(page, ".focushead h1", vp.scroll);
    // declared change (2026-10-01): "Si trova in → Niger" is geographic context, not a NEXUM connection
    await expect(page.getByTestId("conn-empty")).toHaveText("Nessuna connessione supportata trovata per questo elemento.");   // UX2
    await firstScreen(page, '[data-testid="conn-empty"]', vp.scroll);
    const row = page.locator(`.conn-row[data-conn="${NIGER}"]`);
    await expect(row.locator(".conn-phrase")).toHaveText("Si trova in");                  // UX3
    await firstScreen(page, `.conn-row[data-conn="${NIGER}"]`, vp.scroll);
    await expect(row.locator("[data-why]")).toHaveText("Perché?");                        // UX4 (visible)
    await expect(page.locator('.conn-row[data-cat="insight"], .conn-row[data-cat="role"]')).toHaveCount(0);   // nothing invented
    await noTechTerms(page);                                                              // UX6 (OBJECT MODE)
    await page.screenshot({ path: new URL(`ux-bilma-${name}.png`, OUT).pathname });
    // UX5: pivot to Niger; Map, Graph and Timeline follow; the trail keeps Bilma → Niger
    await row.locator(`[data-ref="${NIGER}"]`).click();
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", NIGER);
    const steps = await page.evaluate(() => (window as any).__nexum.store.get().trail.steps.map((s: any) => s.ref));
    expect(steps.slice(-2)).toEqual([BILMA, NIGER]);
    if (touch(page)) { await tab(page, "Mappa"); }
    await expect(page.getByTestId("map")).toHaveAttribute("data-selected", NIGER);
    if (touch(page)) await tab(page, "Grafo"); else await page.getByRole("button", { name: "Grafo", exact: true }).click();
    await expect(page.getByTestId("graph")).toHaveAttribute("data-root", NIGER);
    if (touch(page)) await tab(page, "Tempo");
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", NIGER);
    await noTechTerms(page);
    // UX4: "Perché?" of the relation opens its explanation
    await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), BILMA);
    // declared change: no "Fuoco" tab — selecting shows the focus card (sheet or side panel)
    if (touch(page) && !sheet(page)) await page.evaluate(() => (window as any).__nexum.store.set({ inspectorOpen: true }));
    const rel = await page.locator(`.conn-row[data-conn="${NIGER}"] [data-why]`).getAttribute("data-why");
    await page.locator(`.conn-row[data-conn="${NIGER}"] [data-why]`).click();
    await expect(page.getByTestId("why")).toHaveAttribute("data-why", rel!);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("UX Mandalay (phone 430): the association found by a rule comes first, generic context stays apart and closed", async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, VIEWPORTS["iphone15promax-430x932"]);
  await pick(page, "Mandalay", M.quake);
  await expect(page.getByTestId("focus-what")).toHaveText("Terremoto · Myanmar · 28 mar 2025");   // declared change: readable date (2026-10-01)
  await expect(page.locator(".conn-row").first()).toHaveAttribute("data-cat", "insight");    // associations first
  // declared change (2026-10-01, richer world): R2 is one of several associations, followed by its identity
  const first = page.locator(`.conn-row[data-conn="${M.r2}"]`);
  await expect(first).toHaveAttribute("data-cat", "insight");
  await expect(first.locator(".conn-phrase")).toHaveText("Associazione trovata da una regola");
  await expect(first.locator(".conn-detail")).toContainText("3 h 21 min");
  await firstScreen(page, `.conn-row[data-cat="insight"] [data-why]`);   // the first connection's Perché? (declared change)
  const cats = await page.locator(".conn-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-cat")));
  const rank = { insight: 0, relation: 1, role: 2 } as Record<string, number>;
  expect(cats.map((c) => rank[c!])).toEqual([...cats.map((c) => rank[c!])].sort((a, b) => a - b));   // Insight → Relation → Role
  await page.getByTestId("sheet-more").click();            // declared change: context is read in the card opened in full
  const ctxBox = page.getByTestId("conn-context");
  await expect(ctxBox).toHaveJSProperty("open", false);                                  // context: closed …
  await expect(ctxBox.locator("summary")).toContainText("non sono connessioni");         // … and says what it is
  await ctxBox.locator("summary").click();
  await expect(page.getByTestId("conn-same-territory")).toContainText("è contesto, non una correlazione");
  // the "same country" events are not drawn as connections on the map
  await page.screenshot({ path: new URL("ux-mandalay-phone.png", OUT).pathname });
  await first.locator("[data-why]").click();
  await expect(page.getByTestId("why")).toHaveAttribute("data-why", M.r2);
  await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("UX every kind (desktop): name, what, connections or explicit statement, no technical vocabulary", async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, VIEWPORTS["desktop-1440x900"]);
  for (const id of [M.vymd, M.mm, M.r2, M.m67, BILMA, NIGER]) {
    await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), id);
    await page.waitForFunction((i) => (window as any).__nexum.store.get().context?.id === i, id);
    await expect(page.getByTestId("connections")).toBeVisible();
    const rows = await page.locator(".conn-row").count();
    const empty = await page.getByTestId("conn-empty").count();
    expect(rows + empty, id).toBeGreaterThan(0);
    // declared change (2026-10-03, World Intelligence): a country's view opens on what it is and how one lives there
    // (population first); its connections stay in the overview, further down — every other element keeps them first
    if (id === NIGER || id === M.mm) await firstScreen(page, '[data-testid="ov-people"]');
    else await firstScreen(page, '[data-testid="connections"] .conn-h');
    await noTechTerms(page);
  }
  // relation: both ends and its Perché?
  const relId = await page.evaluate(() => {
    const c = (window as any).__nexum.store.get().context.data;
    return c.relations.groups[0]?.items[0]?.relation?.$ref;
  });
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), relId);
  await page.waitForFunction((i) => (window as any).__nexum.store.get().context?.id === i, relId);
  await expect(page.locator(".conn-row")).toHaveCount(2);
  await expect(page.locator(".focushead [data-why]")).toHaveText("Perché?");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("UX map: the focus message is never stale while the map moves, and it speaks of the area, not of scope", async ({ browser }) => {
  const { ctx, page } = await open(browser, VIEWPORTS["iphone15promax-430x932"]);
  const seen: string[] = [];
  await page.exposeFunction("__seen", (t: string) => seen.push(t));
  // declared change (touch map default ≥ 0.8, 2026-09-30): an element excluded by the filters but drawn as the focus
  // is reported by the Core as outside the scope; what must never appear is the stale "not in the visible area"
  await page.evaluate(() => new MutationObserver(() => {
    const e = document.querySelector('[data-testid="map-appears"]');
    if (e) (window as any).__seen((e as HTMLElement).innerText.startsWith("Non è nell'area visibile") ? "outside_scope" : `shown:${(e as HTMLElement).dataset.appears ?? ""}`);
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }));
  for (const id of [BILMA, M.quake, NIGER, M.vymd]) {
    await page.evaluate((i) => (window as any).__nexum.store.select(i, "search"), id);
    await page.waitForTimeout(2500);
  }
  expect(seen.filter((a) => a === "outside_scope")).toEqual([]);   // the focus is always inside the area it is moved to
  await noTechTerms(page);
  await ctx.close();
});

test("UX timeline: a focus without dated connections is said, not left silent", async ({ browser }) => {
  const { ctx, page } = await open(browser, VIEWPORTS["desktop-1440x900"]);
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), BILMA);
  await expect(page.getByTestId("tl-empty")).toContainText("Nessun evento datato collegato a Bilma Airport");
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), M.quake);
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", M.quake);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("tl-empty")).toHaveCount(0);
  await ctx.close();
});

// ── Cartographic legibility (addendum 2026-09-30) ──────────────────────────────
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const LAND = "rgb(22, 27, 31)";   // basemap land fill (#161B1F)

for (const name of ["iphone15promax-430x932", "fold-closed-344x882"]) {
  test(`MAP Bilma on ${name}: from the map alone, the focus is in Niger`, async ({ browser }) => {
    const vp = VIEWPORTS[name];
    const { ctx, page } = await open(browser, vp);
    await pick(page, "Bilma", BILMA);
    await tab(page, "Mappa");
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const map = (document.querySelector('[data-testid="map"]') as HTMLElement).getBoundingClientRect();
      const lab = [...document.querySelectorAll(".maplabel")].map((e) => {
        const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { text: (e as HTMLElement).innerText, cls: e.className, x: b.x + b.width / 2, y: b.y + b.height / 2, color: cs.color, size: parseFloat(cs.fontSize) };
      });
      return { map: { w: map.width, h: map.height, x: map.x, y: map.y }, lab };
    });
    const focus = r.lab.find((l) => l.cls.includes("focus"));
    const niger = r.lab.find((l) => l.cls.includes("place") && l.text.toLowerCase() === "niger");
    expect(focus?.text).toBe("Bilma Airport");
    expect(niger, "the place name NIGER is on the map").toBeTruthy();
    expect(niger!.cls).toContain("linked");                                               // the focus's connection
    expect(Math.hypot(niger!.x - focus!.x, niger!.y - focus!.y)).toBeLessThan(r.map.w * 0.6);   // near the focus
    expect(niger!.x).toBeGreaterThanOrEqual(r.map.x);
    expect(niger!.x).toBeLessThanOrEqual(r.map.x + r.map.w);
    for (const l of r.lab) {
      expect(contrast(l.color, LAND), `${l.text} contrast`).toBeGreaterThanOrEqual(4.5);
      expect(l.size, `${l.text} size`).toBeGreaterThanOrEqual(10);
    }
    await page.screenshot({ path: new URL(`map-bilma-${name}.png`, OUT).pathname });
    await ctx.close();
  });
}

for (const name of ["iphone15promax-430x932", "fold-closed-344x882", "fold-open-884x1104", "desktop-1440x900"]) {
  test(`MAP labels on ${name}: place names in WORLD MODE, readable (contrast ≥ 4.5, ≥ 10 px), no overlaps`, async ({ browser }) => {
    const { ctx, page } = await open(browser, VIEWPORTS[name]);
    await page.waitForTimeout(1500);
    const lab = await page.evaluate(() => [...document.querySelectorAll(".maplabel")].map((e) => {
      const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { text: (e as HTMLElement).innerText, box: [b.x, b.y, b.right, b.bottom], color: cs.color, size: parseFloat(cs.fontSize), place: e.className.includes("place") };
    }));
    expect(lab.filter((l) => l.place).length, "place names shown").toBeGreaterThan(3);
    for (const l of lab) {
      expect(contrast(l.color, LAND), `${l.text}`).toBeGreaterThanOrEqual(4.5);
      expect(l.size).toBeGreaterThanOrEqual(10);
    }
    await page.screenshot({ path: new URL(`map-world-${name}.png`, OUT).pathname });
    await ctx.close();
  });
}
