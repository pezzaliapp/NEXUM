// ONE OPERATIONAL MAP (Phase 3B · block 0, 2026-10-03; illumination added by the author the same day): no day/night
// MODE anywhere (no toggle, no control), but the Earth's illumination always drawn from the current UTC time with the
// reference night lights on the night side only, under every NEXUM layer; aggregates only where the level of detail
// needs them, drawn as a continuous density (never a grid of squares, never columns), gone at local scale.
import { expect, test } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const VIEWS: [string, [number, number], number][] = [["world", [15, 25], 1.3], ["europe", [12, 50], 3.4], ["italy", [12.5, 42.5], 5],
  ["tuscany", [11.2, 43.4], 7.2], ["local", [11.25, 43.77], 10]];

for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["fold-closed", { width: 344, height: 690 }], ["fold-open", { width: 884, height: 960 }]] as const) {
  test(`one map on ${name}: no day/night, density only where needed, elements at local scale`, async ({ browser }) => {
    const touch = vp.width < 1280;
    const ctx = await browser.newContext({ viewport: vp, isMobile: touch, hasTouch: touch });
    const page = await ctx.newPage();
    const asked: string[] = [];
    page.on("request", (r) => asked.push(r.url()));
    await page.goto(BASE);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
    await expect(page.locator('[data-testid="daynight"], [data-testid="legend-daynight"], [data-testid="legend-lights"]')).toHaveCount(0);
    const layers: { id: string; type: string }[] = await page.evaluate(() => (window as any).__nexum.map.getStyle().layers.map((l: any) => ({ id: l.id, type: l.type })));
    expect(layers.some((l) => /daynight/i.test(l.id))).toBe(false);
    // declared change (2026-10-03, illumination diagnosis): land → density → night → reference lights → borders →
    // focus area → links → elements → selection; the density belongs to the geography the night darkens
    const at = (id: string) => layers.findIndex((l) => l.id === id);
    expect(layers[at("nexum-illumination")]?.type).toBe("raster");
    const order = ["basemap-land", "nexum-density", "nexum-illumination", "nexum-lights", "basemap-borders", "nexum-focus-fill", "nexum-links", "nexum-items", "nexum-sel"].map(at);
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(page.getByTestId("legend-illumination")).toHaveCount(1);
    expect(layers.some((l) => l.type === "fill" && l.id.startsWith("nexum-cell")), "no grid of shaded squares").toBe(false);
    expect(layers.find((l) => l.id === "nexum-density")?.type).toBe("heatmap");
    for (const [v, c, z] of VIEWS) {
      await page.evaluate(() => performance.clearMarks("nexum:map:rendered"));
      await page.evaluate(([cc, zz]) => (window as any).__nexum.map.jumpTo({ center: cc, zoom: zz }), [c, z] as any);
      await page.waitForFunction(() => performance.getEntriesByName("nexum:map:rendered").length > 0, null, { timeout: 60_000 });
      const info = await page.evaluate(() => {
        const m = (window as any).__nexum.map, i = (window as any).__nexum.store.get().mapInfo;
        return { lod: i.lod, cells: m.querySourceFeatures("nexum-cells").length, items: m.querySourceFeatures("nexum-items").length };
      });
      if (z >= 7) {   // local: the elements themselves, no aggregate at all
        expect(info.lod, `${v} lod`).toBe("refs");
        expect(info.cells, `${v} aggregate cells`).toBe(0);
      }
      if (v === "world") expect(info.lod).toBe("aggregates");
    }
    // the reference lights: one same-origin file, nothing else (no NASA request at run time)
    expect(asked.filter((u) => /night-lights/.test(u)).every((u) => new URL(u).origin === new URL(BASE).origin)).toBe(true);
    expect(asked.filter((u) => /nasa\.gov/.test(u))).toEqual([]);
    await ctx.close();
  });
}

test("the reference night-lights asset is published once, small, same origin", () => {
  const dir = new URL("../../../data/deploy/web-live/", import.meta.url);
  // declared change (2026-10-03, physical test): about 0.13° (2700 px wide), the most detail within O6
  expect(fs.statSync(new URL("ref/night-lights-2016.webp", dir)).size).toBeLessThan(50_000);
  expect(fs.existsSync(new URL("ref/night-lights-2016-0p2.webp", dir))).toBe(false);
});

test("illumination: Europe by day, by night and on the terminator; both sides on the world view; no band", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.illumination?.lightsReady(), null, { timeout: 30_000 });
  // the alpha of the illumination canvas at a place (0 = daylight, untouched map)
  const alphaAt = (iso: string, lon: number, lat: number) => page.evaluate(([t, x, y]) => {
    const il = (window as any).__nexum.illumination;
    il.pin(Date.parse(t as string));
    const c = il.canvas as HTMLCanvasElement, g = c.getContext("2d")!;
    const px = Math.floor((((x as number) + 180) / 360) * c.width);
    const my = Math.log(Math.tan(Math.PI / 4 + ((y as number) * Math.PI) / 360));
    const py = Math.floor(((1 - my / Math.PI) / 2) * c.height);
    return g.getImageData(px, py, 1, 1).data[3];
  }, [iso, lon, lat] as const);
  expect(await alphaAt("2026-10-03T11:00:00Z", 12, 48)).toBe(0);                          // Europe by day: the map as it is
  expect(await alphaAt("2026-10-03T23:00:00Z", 12, 48)).toBeGreaterThan(150);             // Europe by night: darkened
  const dusk = await alphaAt("2026-10-03T17:15:00Z", 12, 48);                            // the terminator over Europe
  expect(dusk).toBeGreaterThan(0); expect(dusk).toBeLessThan(200);
  // the world at 18:00 UTC: day over the Americas, night over Asia at the same time
  expect(await alphaAt("2026-10-03T18:00:00Z", -75, 5)).toBe(0);
  expect(await alphaAt("2026-10-03T18:00:00Z", 100, 30)).toBeGreaterThan(150);
  // continuous across the terminator: along a parallel, neighbouring pixels never jump (no band, no block)
  const jump = await page.evaluate(() => {
    const il = (window as any).__nexum.illumination;
    il.pin(Date.parse("2026-10-03T17:15:00Z"));
    const c = il.canvas as HTMLCanvasElement, row = c.getContext("2d")!.getImageData(0, Math.floor(c.height * 0.33), c.width, 1).data;
    let max = 0;
    for (let x = 1; x < c.width; x++) max = Math.max(max, Math.abs(row[x * 4 + 3] - row[(x - 1) * 4 + 3]));
    return max;
  });
  expect(jump).toBeLessThan(40);
  await ctx.close();
});

/** Mean luminance (0–255) of a screenshot around screen points, decoded in the page (what was actually drawn). */
async function luminanceAt(page: any, png: Buffer, pts: [number, number][], r = 5): Promise<number[]> {
  return page.evaluate(async ([b64, ps, rr]: [string, [number, number][], number]) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    return ps.map(([x, y]) => {
      const d = g.getImageData(x - rr, y - rr, 2 * rr + 1, 2 * rr + 1).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    });
  }, [png.toString("base64"), pts, r] as any);
}

test("world at 2026-10-03 17:32 UTC: day, terminator and night are told apart; the density never greys the night", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.illumination?.lightsReady(), null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.illumination.pin(Date.parse("2026-10-03T17:32:00Z")));
  await page.addStyleTag({ content: ".maplabels{display:none!important}" });   // the surface itself, not the names
  await page.evaluate(() => { const m = (window as any).__nexum.map; for (const id of ["nexum-items", "nexum-hl", "nexum-hl-ring", "nexum-links", "nexum-sel"]) m.setLayoutProperty(id, "visibility", "none"); });
  await page.waitForTimeout(2000);
  const day: [number, number][] = [[-98, 38], [-55, -10], [-65, -35]], night: [number, number][] = [[90, 62], [20, 26], [133, -25], [95, 35]];
  const screen = (ll: [number, number][]) => page.evaluate((l: any) => { const m = (window as any).__nexum.map, r = m.getCanvas().getBoundingClientRect();
    return l.map((p: any) => { const q = m.project(p); return [Math.round(r.left + q.x), Math.round(r.top + q.y)]; }); }, ll);
  const D = await screen(day), N = await screen(night);
  const all = await page.screenshot();
  const dayL = await luminanceAt(page, all, D), nightL = await luminanceAt(page, all, N);
  const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
  expect(mean(dayL), `day ${dayL} night ${nightL}`).toBeGreaterThan(2.2 * mean(nightL));       // night clearly darker than day
  for (const v of nightL) expect(v).toBeLessThan(16);                                         // a night is night: no grey veil on it
  await page.evaluate(() => (window as any).__nexum.map.setLayoutProperty("nexum-density", "visibility", "none"));
  await page.waitForTimeout(800);
  const noDensity = await luminanceAt(page, await page.screenshot(), N);
  for (let i = 0; i < N.length; i++) expect(Math.abs(nightL[i] - noDensity[i])).toBeLessThan(2.5);   // the night darkens the density too
  await ctx.close();
});

test("desktop windows from 1120 px keep the full workspace on an element (left panel, no bottom navigation)", async ({ browser }) => {
  for (const vp of [{ width: 1152, height: 720 }, { width: 1120, height: 700 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
    await page.getByTestId("explore-input").fill("Turkey");
    await page.getByTestId("explore-results").locator("button").first().click();
    await expect(page.getByTestId("place-view")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".rail")).toBeVisible();
    await expect(page.locator(".rail")).toContainText("Eventi");
    expect(await page.locator(".tabs").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length)).toBe(0);
    await ctx.close();
  }
});

test("a selected element keeps its contextual relation line (Konya → Turkey); only a whole area's web is quiet", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.locator("#nexum-search").fill("Konya");
  // declared change (2026-10-04): a city's result also says its state ("Konya · Turkey"); the label is matched
  const hit = page.locator("#nexum-results .it[data-ref]").filter({ has: page.locator(".grow", { hasText: /^Konya$/ }) }).first();
  await hit.click({ timeout: 30_000 });
  await expect(page.getByTestId("focus-head")).toContainText("Konya");
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getSource("nexum-links").serialize().data.features.length), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await ctx.close();
});
