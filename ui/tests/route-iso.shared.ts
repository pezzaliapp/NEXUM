// LAYERS ARE ORTHOGONAL (2026-10-07, stabilization): a sea route is one line and touches nothing else. The whole map
// state — every layer's visibility, opacities and filter, the sources, the map's listeners, the categories on the map,
// the overlay switches, the webcams' legend — is the same before a route, while it is drawn (but for its one layer, its
// one source and its three handlers) and after it is closed; repeated routes leave nothing behind. Webcams, events and
// news stay drawn and answer while a route is shown. Shared by the web (desktop Chromium and WebKit) and mobile suites.
import { expect, type Page } from "@playwright/test";

export const CAM = "camera.public_webcam";
const OPAC = ["circle-opacity", "circle-stroke-opacity", "icon-opacity", "text-opacity", "fill-opacity", "line-opacity", "heatmap-opacity", "raster-opacity"];

/** Everything about the map that a route must not change. */
export const mapState = (page: Page) => page.evaluate((OPAC) => {
  const n = (window as any).__nexum, m = n.map, st = m.getStyle();
  const layers = st.layers.filter((l: any) => l.id !== "ops-searoute").map((l: any) => {
    const p: Record<string, unknown> = {};
    for (const k of OPAC) { try { const v = m.getPaintProperty(l.id, k); if (v !== undefined) p[k] = v; } catch { /* not this type */ } }
    return [l.id, m.getLayoutProperty(l.id, "visibility") ?? "visible", p, l.filter ?? null];
  });
  const count = (o: any) => Object.values(o ?? {}).reduce((a: number, x: any) => a + x.length, 0);
  const legend = document.querySelector('[data-testid="pts-legend"]') as HTMLElement | null;
  return JSON.stringify({ layers, sources: Object.keys(st.sources).filter((s) => s !== "ops-searoute").sort(), mapTypes: n.store.get().mapTypes,
    opsLayers: n.ops.get().layers, legend: legend ? getComputedStyle(legend).display : null,
    listeners: count(m._listeners) + count(m._delegatedListeners), layerHandlers: count(m._delegatedListeners) });
}, OPAC);
export const routeBits = (page: Page) => page.evaluate(() => {
  const m = (window as any).__nexum.map, st = m.getStyle();
  return { layers: st.layers.map((l: any) => l.id).filter((id: string) => /searoute|ops-routes/.test(id)), sources: Object.keys(st.sources).filter((s) => /searoute|ops-routes/.test(s)),
    features: (m.getSource("ops-searoute")?.serialize?.().data?.type === "Feature") ? 1 : (m.getSource("ops-searoute")?.serialize?.().data?.features?.length ?? 0) };
});
/** What is drawn now: webcam marks, NEXUM items (events, places), news points. */
export const drawn = (page: Page) => page.evaluate(() => {
  const m = (window as any).__nexum.map, ids = m.getStyle().layers.map((l: any) => l.id);
  const n = (re: RegExp) => { const ls = ids.filter((i: string) => re.test(i)); return ls.length ? m.queryRenderedFeatures({ layers: ls }).length : 0; };
  return { cams: n(/^nexum-pts-camera/), items: n(/^nexum-items$/), news: n(/^ops-news$/) };
});

export async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "layers" }));
  await expect(page.getByTestId("ops-panel-layers")).toBeVisible({ timeout: 30_000 });
}
/** The layers a case turns on — each by its own switch (the map's categories as in Filtri; news by its own layer). */
export async function turnOn(page: Page, what: { cams?: boolean; events?: boolean; news?: boolean }) {
  await page.evaluate(({ what, CAM }) => {
    const n = (window as any).__nexum, s = n.store, add: string[] = [];
    if (what.cams) add.push(CAM);
    if (what.events) for (const t of s.get().types.values()) if (t.kind === "event") add.push(t.id);
    const m = s.get().mapTypes;
    if (add.length && Array.isArray(m)) s.setMapTypes([...new Set([...m, ...add])]);
    if (what.news) n.ops.layer("news", true);
    n.map.jumpTo({ center: [11, 43], zoom: 5.3 });
  }, { what, CAM });
  await page.waitForTimeout(6000);
}
export async function computeRoute(page: Page, a = "Livorno", b = "Olbia") {
  if (!(await page.getByTestId("searoute-panel").isVisible().catch(() => false))) await page.getByTestId("searoute-open").click();
  for (const [id, q] of [["searoute-from", a], ["searoute-to", b]]) {
    await page.getByTestId(id).fill(q);
    await page.getByTestId(`${id}-hits`).locator("button").first().click({ timeout: 20_000 });
  }
  await expect(page.getByTestId("searoute-result")).toContainText("ROTTA MODELLATA", { timeout: 30_000 });
}
export async function closeRoute(page: Page) {
  await page.getByTestId("searoute-close").click();
  await expect(page.getByTestId("searoute-panel")).toHaveCount(0);
}

/** One case: the layers on, a route, the same state but for the route, the route closed, the same state exactly. */
export async function isolationCase(page: Page, what: { cams?: boolean; events?: boolean; news?: boolean }) {
  await turnOn(page, what);
  const before = await mapState(page), seen = await drawn(page);
  if (what.cams) expect(seen.cams, "webcams drawn before").toBeGreaterThan(0);
  if (what.events) expect(seen.items, "events drawn before").toBeGreaterThan(0);
  if (what.news) expect(seen.news, "news drawn before").toBeGreaterThan(0);
  await computeRoute(page);
  // E: one route, one geometry — and nothing of a network
  expect(await routeBits(page)).toEqual({ layers: ["ops-searoute"], sources: ["ops-searoute"], features: 1 });
  const during = JSON.parse(await mapState(page)), b = JSON.parse(before);
  // the route's own three layer handlers (tap, enter, leave), nothing else; MapLibre backs layer handlers with a few map
  // listeners of its own, all gone again when the route is closed (checked below: the total exactly as before)
  expect(during.layerHandlers, "the route's own three handlers, nothing else").toBe(b.layerHandlers + 3);
  expect(JSON.stringify({ ...during, listeners: 0, layerHandlers: 0 }), "no other layer touched while the route is drawn").toBe(JSON.stringify({ ...b, listeners: 0, layerHandlers: 0 }));
  // coexisting: back on the same view, the chosen layers are still drawn (and answer)
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [11, 43], zoom: 5.3 }));
  await page.waitForTimeout(3000);
  const with_ = await drawn(page);
  if (what.cams) expect(with_.cams, "webcams + route").toBeGreaterThan(0);
  if (what.events) expect(with_.items, "events + route").toBeGreaterThan(0);
  if (what.news) expect(with_.news, "news + route").toBeGreaterThan(0);
  // F: closed — nothing left, the state exactly as before
  await closeRoute(page);
  expect(await routeBits(page)).toEqual({ layers: [], sources: [], features: 0 });
  expect(await mapState(page), "closed: the map exactly as before").toBe(before);
}

/** G: routes opened and closed again and again leave nothing behind. */
export async function repeatCase(page: Page) {
  await turnOn(page, { cams: true });
  const before = await mapState(page);
  for (let k = 0; k < 5; k++) { await computeRoute(page, k % 2 ? "Genova" : "Livorno", k % 2 ? "Palermo" : "Olbia"); await closeRoute(page); }
  expect(await routeBits(page)).toEqual({ layers: [], sources: [], features: 0 });
  expect(await mapState(page), "after five routes: the map exactly as before").toBe(before);
}
