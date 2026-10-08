// ROUTE / NAVIGATION LIFECYCLE (2026-10-07, physical test: during a webcam LIVE NEXUM started speaking route
// instructions and "Ricalcolo del percorso"). Turn-by-turn navigation is a deliberate feature, started only by
// "▶ Naviga": while it runs, NEXUM says so everywhere (an indicator above any card, with Ferma). Once it ends — Ferma
// (panel or indicator), the route panel closed, the map surface left — nothing of it remains: no voice, no position
// watcher, no reroute, no routing request, for at least 60 s. Changing view while it runs (a webcam, SAT, a country)
// does not end it, and the indicator stays reachable. A route and a webcam never alter each other.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const PARMA = { latitude: 44.8015, longitude: 10.328 };
test.describe.configure({ timeout: 240_000 });

async function start(browser: any, vp = { width: 1440, height: 900 }): Promise<{ ctx: BrowserContext; page: Page; routing: number[]; errors: string[] }> {
  const ctx: BrowserContext = await browser.newContext({ viewport: vp, geolocation: PARMA, permissions: ["geolocation"] });
  await ctx.addInitScript(() => {
    const L = ((window as any).__probe = { speech: [] as string[], watch: 0 });
    const sp = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { L.speech.push(u.text); try { sp(u); } catch { /* no voice */ } };
    const g = navigator.geolocation, w = g.watchPosition.bind(g), c = g.clearWatch.bind(g);
    g.watchPosition = ((...a: any[]) => { L.watch++; return (w as any)(...a); }) as any;
    g.clearWatch = (id: number) => { L.watch--; return c(id); };
  });
  const page = await ctx.newPage();
  const routing: number[] = [], errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/openstreetmap\.de\//.test(r.url())) routing.push(Date.now()); });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return { ctx, page, routing, errors };
}
async function routeAndNavigate(page: Page) {
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "route" }));
  for (const [id, q] of [["ops-route-from", "Parma"], ["ops-route-to", "Reggio Emilia"]]) {
    await page.getByTestId(id).fill(q);
    await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
  }
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toContainText(/km/, { timeout: 40_000 });
  await page.getByTestId("ops-nav-toggle").click();
  await expect(page.getByTestId("ops-nav")).toContainText(/tra /, { timeout: 20_000 });
  await expect(page.getByTestId("ops-nav-active")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__probe.watch)).toBe(1);
}
/** The device drifting (a desk's jitter, then off the route), for `s` seconds. */
async function drift(ctx: BrowserContext, page: Page, s: number) {
  for (let i = 0; i < s; i++) {
    await ctx.setGeolocation({ latitude: PARMA.latitude + (i % 7) * 4e-4, longitude: PARMA.longitude + (i % 5) * 6e-4 + (i > s / 3 ? 0.01 : 0) });
    await page.waitForTimeout(1000);
  }
}
/** Nothing of the navigation left: no voice, no watcher, no routing request, no indicator — for 60 s of drifting. */
async function nothingLeft(ctx: BrowserContext, page: Page, routing: number[]) {
  await expect(page.getByTestId("ops-nav-active")).toHaveCount(0);
  const speech0 = await page.evaluate(() => (window as any).__probe.speech.length), r0 = routing.length;
  expect(await page.evaluate(() => (window as any).__probe.watch), "no position watcher").toBe(0);
  await drift(ctx, page, 60);
  const after = await page.evaluate((n) => (window as any).__probe.speech.slice(n), speech0);
  expect(after, "no voice after the end").toEqual([]);
  expect(await page.evaluate(() => (window as any).__probe.watch), "no position watcher").toBe(0);
  expect(routing.length - r0, "no routing request after the end").toBe(0);
  expect(await page.evaluate(() => { try { return speechSynthesis.speaking || speechSynthesis.pending; } catch { return false; } }), "no speech queued").toBe(false);
}
/** The indicator: inside the viewport, on top, really clickable. */
async function stopFromIndicator(page: Page) {
  const pill = page.getByTestId("ops-nav-stop");
  await expect(pill).toBeVisible();
  const ok = await pill.evaluate((b) => { const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && (at === b || b.contains(at)); });
  expect(ok, "the indicator's Ferma is on screen and on top").toBeTruthy();
  await pill.click();
}
async function openLiveWebcam(page: Page) {
  const input = page.locator("#nexum-search");
  await input.click(); await input.fill("Etna live");
  await page.locator("#nexum-results [data-ref]").filter({ has: page.locator(".grow", { hasText: /^Etna \(live\)$/ }) }).first().click({ timeout: 30_000 });
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
}
const camState = (page: Page) => page.evaluate(() => {
  const n = (window as any).__nexum, m = n.map, out: any = { mapTypes: n.store.get().mapTypes, layers: {} };
  for (const l of m.getStyle().layers) if (/^nexum-pts-camera/.test(l.id)) out.layers[l.id] = [m.getLayoutProperty(l.id, "visibility") ?? "visible",
    m.getPaintProperty(l.id, l.type === "symbol" ? "icon-opacity" : "circle-opacity") ?? null];
  return JSON.stringify(out);
});
const routeLine = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__nexum.map.getSource("ops-route")?.serialize().data ?? null));

test("Percorso → navigation → webcam LIVE 60 s: the navigation runs, said on screen; Ferma from the indicator ends it — then nothing for 60 s; route and webcam untouched by each other", async ({ browser }) => {
  const { ctx, page, routing, errors } = await start(browser);
  const cams0 = await camState(page);
  await routeAndNavigate(page);
  expect(await camState(page), "a route leaves the webcams as they were").toBe(cams0);
  const line0 = await routeLine(page);
  await openLiveWebcam(page);
  await expect(page.getByTestId("live-player")).toHaveAttribute("data-state", "playing", { timeout: 45_000 });
  expect(await routeLine(page), "a webcam leaves the route as it was").toBe(line0);
  await drift(ctx, page, 60);
  await expect(page.getByTestId("ops-nav-active"), "while it runs, NEXUM says so over the webcam").toBeVisible();
  await stopFromIndicator(page);
  await expect(page.getByTestId("ops-nav-toggle")).toContainText("Naviga");
  await nothingLeft(ctx, page, routing);
  await expect(page.getByTestId("live-player"), "the webcam keeps playing").toHaveAttribute("data-state", "playing");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Percorso → navigation → the route panel closed: nothing of it for 60 s", async ({ browser }) => {
  const { ctx, page, routing, errors } = await start(browser);
  await routeAndNavigate(page);
  await page.getByTestId("ops-panel-close").click();
  await nothingLeft(ctx, page, routing);
  expect(await page.evaluate(() => Object.keys((window as any).__nexum.map.getStyle().sources).filter((s) => /^ops-route/.test(s)))).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Percorso → navigation → SAT and a country's view: the navigation keeps running, said on screen; Ferma in the panel ends it — nothing for 60 s", async ({ browser }) => {
  const { ctx, page, routing, errors } = await start(browser);
  await routeAndNavigate(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ base: "sat" }));
  const id = await page.evaluate(async () => { const r = await (window as any).__nexum.apiFetch(`/search?q=Italy`);
    return (r.body.data.groups as any[]).find((x) => x.type === "place.country")?.items[0]?.id ?? null; });
  expect(id).toBeTruthy();
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), id);
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
  await drift(ctx, page, 10);
  await expect(page.getByTestId("ops-nav-active")).toBeVisible();
  await page.getByTestId("ops-nav-toggle").click();          // Ferma la navigazione, in the panel
  await nothingLeft(ctx, page, routing);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Percorso → navigation → Graph (desktop): leaving the map ends the navigation — nothing for 60 s, also back on the map", async ({ browser }) => {
  const { ctx, page, routing, errors } = await start(browser);
  await routeAndNavigate(page);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "graph" }));
  await nothingLeft(ctx, page, routing);
  await page.evaluate(() => (window as any).__nexum.store.set({ stage: "map" }));
  await page.waitForFunction(() => (window as any).__nexum.map?.loaded?.(), null, { timeout: 60_000 }).catch(() => {});
  expect(await page.evaluate(() => (window as any).__probe.watch)).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("phone: Percorso → navigation → Tempo, then Mappa: nothing of the navigation for 60 s", async ({ browser }) => {
  const { ctx, page, routing, errors } = await start(browser, { width: 412, height: 860 });
  await routeAndNavigate(page);
  await stopFromIndicatorVisibleOnly(page);
  await page.locator('[data-testid="bottom-nav"] [data-tab="time"]').click();
  await nothingLeft(ctx, page, routing);
  await page.locator('[data-testid="bottom-nav"] [data-tab="map"]').click();
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as any).__probe.watch)).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
/** Phone: the indicator is on screen and on top while navigating (not pressed here). */
async function stopFromIndicatorVisibleOnly(page: Page) {
  const ok = await page.getByTestId("ops-nav-stop").evaluate((b) => { const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.bottom <= innerHeight && (at === b || b.contains(at)); });
  expect(ok, "phone: the indicator's Ferma on screen and on top").toBeTruthy();
}
