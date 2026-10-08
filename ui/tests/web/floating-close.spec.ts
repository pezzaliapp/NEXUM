// FLOATING CARDS AND PANELS: THE CLOSE IS ALWAYS REACHABLE (2026-10-07, physical test: a map card's × under the top
// bar). The tallest real card (a GDELT news item) and the tallest tool panel, at desktop sizes from 1120×600 to
// 1920×1080, on a tablet and on a phone: the close is inside the viewport, below the top bar and the map's HUD, not
// covered by anything, and a real click closes. The card's content scrolls and its header stays in view.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
test.describe.configure({ timeout: 180_000 });

async function open(page: Page, w: number, h: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
/** The tallest news card the map can give right now, opened as a click on it would. */
async function tallCard(page: Page) {
  await page.evaluate(() => { const n = (window as any).__nexum; n.ops.layer("news", true); n.map.jumpTo({ center: [12, 42], zoom: 3 }); });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.queryRenderedFeatures({ layers: ["ops-news"] }).length), { timeout: 40_000 }).toBeGreaterThan(0);
  await page.evaluate(() => { const m = (window as any).__nexum.map;
    const f = m.queryRenderedFeatures({ layers: ["ops-news"] }).sort((a: any, b: any) => JSON.stringify(b.properties).length - JSON.stringify(a.properties).length)[0];
    (window as any).__nexum.ops.set({ feat: { c: f.geometry.coordinates, fs: [{ l: "ops-news", p: f.properties }] } }); });
  await expect(page.getByTestId("ops-feat-card")).toBeVisible();
  await page.waitForTimeout(800);
}
/** Inside the viewport, under the top bar (and the map's HUD on desktop), on top of everything at its centre. */
const reachable = (page: Page, testid: string) => page.getByTestId(testid).evaluate((x) => {
  const r = x.getBoundingClientRect(), cmd = document.querySelector(".cmd, .topbar")?.getBoundingClientRect(), hudEl = document.querySelector(".ops-hud") as HTMLElement | null, hud = hudEl && getComputedStyle(hudEl).display !== "none" ? hudEl.getBoundingClientRect() : null;
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, underTopBar: !cmd || r.top >= cmd.bottom,
    underHud: !hud || r.top >= hud.bottom || r.right <= hud.left || r.left >= hud.right, onTop: at === x || x.contains(at) };
});

for (const [w, h] of [[1120, 600], [1280, 600], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`desktop ${w}×${h}: the map card's × and the tool panel's × are reachable and close`, async ({ page }) => {
    const errors = await open(page, w, h);
    await tallCard(page);
    expect(await reachable(page, "ops-feat-close")).toEqual({ inViewport: true, underTopBar: true, underHud: true, onTop: true });
    // the card stays inside the map; its content scrolls, its header stays in view
    const g = await page.getByTestId("ops-feat-card").evaluate((c) => { const v = c.closest('[data-view="map"]')!.getBoundingClientRect(), r = c.getBoundingClientRect();
      c.scrollTop = c.scrollHeight; return { inside: r.top >= v.top && r.bottom <= v.bottom, scrolls: c.scrollHeight <= c.clientHeight || getComputedStyle(c).overflowY === "auto" }; });
    expect(g).toEqual({ inside: true, scrolls: true });
    expect((await reachable(page, "ops-feat-close")).onTop, "the × still on top with the content scrolled").toBe(true);
    await page.getByTestId("ops-feat-close").click();
    await expect(page.getByTestId("ops-feat-card")).toHaveCount(0);
    // the tallest tool panel (Livelli)
    await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "layers" }));
    await expect(page.getByTestId("ops-panel-layers")).toBeVisible();
    expect(await reachable(page, "ops-panel-close")).toEqual({ inViewport: true, underTopBar: true, underHud: true, onTop: true });
    await page.getByTestId("ops-panel-close").click();
    await expect(page.getByTestId("ops-panel-layers")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const [name, w, h] of [["tablet", 1024, 700], ["phone", 390, 844], ["short phone", 390, 640]] as const) {
  test(`${name} ${w}×${h}: the map card's × is reachable, also with its content scrolled, and closes`, async ({ page }) => {
    const errors = await open(page, w, h);
    await tallCard(page);
    const x = page.getByTestId("ops-feat-close");
    const r = await reachable(page, "ops-feat-close");
    expect({ inViewport: r.inViewport, underTopBar: r.underTopBar, onTop: r.onTop }).toEqual({ inViewport: true, underTopBar: true, onTop: true });
    await page.getByTestId("ops-feat-card").evaluate((c) => { c.scrollTop = c.scrollHeight; });
    await page.waitForTimeout(200);
    expect((await reachable(page, "ops-feat-close")).onTop, "the × still on top with the content scrolled").toBe(true);
    await x.click();
    await expect(page.getByTestId("ops-feat-card")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
