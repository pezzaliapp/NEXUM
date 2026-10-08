// WAVE 1 — COMPLIANCE AND ROBUSTNESS (2026-10-07): the credits of the third-party map tiles drawn now are on screen
// (S33); a part that fails while drawing shows a notice in its place and the rest of NEXUM stays (S39); the public
// catalogue imports only openly licensed datasets (X-11); a closed route leaves no layer or source behind (R-01); the
// community services get one request a second from the whole app, not from each tab.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function open(page: Page, vp = { width: 1440, height: 900 }) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(vp);
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
const credits = (page: Page) => page.evaluate(() => (window as any).__nexum.store.get().mapCredits as string[]);

test("S33: the credits of the tiles drawn now — SAT, OGGI, relief, clouds, streets — in the status bar, and gone when hidden", async ({ page }) => {
  const errors = await open(page);
  const bar = page.getByTestId("attributions");
  const set = (p: any) => page.evaluate((p) => { const o = (window as any).__nexum.ops; o.set({ ...p, layers: { ...o.get().layers, ...(p.layers ?? {}) } }); }, p);
  await set({ base: "sat" });
  await expect.poll(() => credits(page), { timeout: 20_000 }).toEqual(expect.arrayContaining([expect.stringContaining("EOX"), expect.stringContaining("Blue Marble")]));
  await expect(bar).toContainText("EOX");
  await expect(bar).toContainText("CC BY 4.0");
  await set({ base: "today" });
  await expect.poll(() => credits(page)).toEqual([expect.stringContaining("NASA EOSDIS GIBS")]);
  await expect(bar).toContainText("NASA EOSDIS GIBS");
  await expect(bar).not.toContainText("EOX");
  await set({ base: "map", layers: { hillshade: true, clouds: true } });
  await expect.poll(() => (credits(page)).then((c) => c.join(" | "))).toMatch(/Terrain Tiles.*NOAA|NOAA.*Terrain Tiles/);
  await set({ layers: { hillshade: false, clouds: false, streets: true } });
  await expect.poll(() => credits(page), { timeout: 30_000 }).toEqual([expect.stringContaining("OpenStreetMap")]);
  await expect(bar).toContainText("OpenStreetMap");
  await set({ layers: { streets: false } });
  await expect.poll(() => credits(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("S33 on a phone: the same credits in the map strip", async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  await page.evaluate(() => (window as any).__nexum.ops.set({ base: "sat" }));
  await expect(page.getByTestId("map-attr")).toContainText("EOX", { timeout: 20_000 });
});

test("S39: a part that fails shows a notice in its place, the map stays; Riprova draws it again", async ({ page }) => {
  await open(page);
  const st = await page.evaluate(() => { const n = (window as any).__nexum, v = n.store.get().status; n.saved = v.sources; n.store.set({ status: { ...v, sources: null } }); return true; });
  expect(st).toBeTruthy();
  await expect(page.getByTestId("boundary").first()).toBeVisible({ timeout: 10_000 });
  expect(await page.locator('[data-testid="boundary"][data-part="app"]').count(), "not the whole app").toBe(0);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByTestId("boundary").first()).toContainText("Riprova");
  // repaired: Riprova on every notice, each part drawn again
  await page.evaluate(() => { const s = (window as any).__nexum.store; s.set({ status: { ...s.get().status, sources: (window as any).__nexum.saved } }); });
  for (let i = 0; i < 6 && await page.getByTestId("boundary").count(); i++) await page.getByTestId("boundary").first().getByRole("button", { name: "Riprova" }).click();
  await expect(page.getByTestId("boundary")).toHaveCount(0);
  await expect(page.getByTestId("statusbar")).toBeVisible();
});

test("R-01: a closed route leaves no layer and no source behind", async ({ page }) => {
  const errors = await open(page);
  const bits = () => page.evaluate(() => { const st = (window as any).__nexum.map.getStyle();
    return [...st.layers.map((l: any) => l.id), ...Object.keys(st.sources)].filter((x: string) => /^ops-route/.test(x)); });
  await page.getByTestId("ops-tool-route").click();
  const typePlace = async (id: string, q: string) => {
    await page.getByTestId(id).fill(q);
    await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
    await expect(page.getByTestId(id)).not.toHaveValue(q);
  };
  await typePlace("ops-route-from", "Parma");
  await typePlace("ops-route-to", "Reggio Emilia");
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toContainText(/km/, { timeout: 30_000 });
  expect((await bits()).length, "the route drawn").toBeGreaterThan(0);
  await page.getByTestId("ops-panel-close").click();
  await expect.poll(bits).toEqual([]);
  expect(errors).toEqual([]);
});

test("pacing: two tabs share one turn per provider — never two requests within a second", async ({ browser }) => {
  const ctx = await browser.newContext();
  const [a, b] = [await ctx.newPage(), await ctx.newPage()];
  for (const p of [a, b]) { await p.goto(BASE); await p.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 }); }
  // the pace of the running build (loaded with the tools), the same in both tabs
  const run = (p: Page) => p.evaluate(async () => {
    const n = (window as any).__nexum;
    n.ops.set({ tool: "route" });
    for (let i = 0; i < 100 && !n.polite; i++) await new Promise((r) => setTimeout(r, 100));
    const out: number[] = [];
    for (let i = 0; i < 3; i++) { await n.polite("test-provider"); out.push(Date.now()); }
    return out;
  });
  const [ta, tb] = await Promise.all([run(a), run(b)]);
  const all = [...ta, ...tb].sort((x, y) => x - y);
  for (let i = 1; i < all.length; i++) expect(all[i] - all[i - 1], `gap ${i}`).toBeGreaterThanOrEqual(1000);
  await ctx.close();
});

test("D3: the operator's contact is published (status bar, Info, route panel), never sent in any request", async ({ page }) => {
  const EMAIL = "pezzaliapp@gmail.com";
  const leaks: string[] = [];
  page.on("request", (r) => {
    const all = `${r.url()} ${JSON.stringify(r.headers())} ${r.postData() ?? ""}`;
    if (all.includes(EMAIL) || all.includes(encodeURIComponent(EMAIL))) leaks.push(r.url());
  });
  const errors = await open(page);
  const bar = page.getByTestId("statusbar").getByTestId("operator-contact");
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("href", `mailto:${EMAIL}`);
  // the route panel, next to the FOSSGIS credit, with a route asked for
  await page.getByTestId("ops-tool-route").click();
  await expect(page.getByTestId("ops-route-operator")).toContainText(EMAIL);
  await page.getByTestId("ops-route-from").fill("Parma");
  await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
  await page.getByTestId("ops-route-to").fill("Reggio Emilia");
  await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toContainText(/km/, { timeout: 30_000 });
  expect(leaks, "the address in no request").toEqual([]);
  expect(errors).toEqual([]);
});

test("D3 on a phone: the operator's contact in Info", async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  await page.evaluate(() => (window as any).__nexum.store.set({ overlay: "info" }));
  await expect(page.getByTestId("operator-contact")).toContainText("pezzaliapp@gmail.com");
  await expect(page.getByTestId("operator-contact").locator("a")).toHaveAttribute("href", "mailto:pezzaliapp@gmail.com");
});
