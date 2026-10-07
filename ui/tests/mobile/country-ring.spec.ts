// ONE SELECTION, ONE MARK (2026-10-07, physical test on Samsung: two orange circles for one country; France's in West
// Africa). A selected country shows its outline and ONE ring with its name, inside its mainland — never the extra empty
// ring of the aggregate cell holding it, at any zoom, in flat and globe, while zooming. Italy, Germany, France.
import { expect, test, type Page } from "@playwright/test";

const COUNTRIES = [
  { name: "Italy", box: [6.6, 36.6, 18.6, 47.1] },
  { name: "Germany", box: [5.8, 47.2, 15.1, 55.1] },
  { name: "France", box: [-5.2, 41.3, 9.6, 51.2] },        // mainland France and Corsica (not its overseas territories)
] as const;

async function open(page: Page, projection: "flat" | "globe") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/#p=${projection}`);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  return errors;
}
async function selectCountry(page: Page, name: string) {
  const id = await page.evaluate(async (name) => {
    const r = await (window as any).__nexum.apiFetch(`/search?q=${encodeURIComponent(name)}`);
    const g = (r.body.data.groups as any[]).find((x) => x.type === "place.country");
    return g?.items.find((i: any) => i.label === name)?.id ?? null;
  }, name);
  expect(id, `${name} found`).toBeTruthy();
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), id);
  await expect(page.getByTestId("focus-head")).toContainText(name, { timeout: 30_000 });
  return id as string;
}
/** The marks of the selection now drawn: focus rings (and where), cell rings. */
const marks = (page: Page) => page.evaluate(() => {
  const m = (window as any).__nexum.map;
  const sel = m.queryRenderedFeatures({ layers: ["nexum-sel"] }).filter((f: any) => f.properties.role === "focus").map((f: any) => f.geometry.coordinates);
  const cells = m.getLayer("nexum-cells-hl") ? m.queryRenderedFeatures({ layers: ["nexum-cells-hl"] }).length : 0;
  const src = m.getSource("nexum-sel")?.serialize?.().data;
  const all = (src?.features ?? []).filter((f: any) => f.properties.role === "focus").map((f: any) => f.geometry.coordinates);
  return { sel, cells, all };
});

for (const projection of ["flat", "globe"] as const) {
  test(`one ring per selected country (${projection}): Italy, Germany, France — zooms and transitions`, async ({ page }, info) => {
    test.skip(info.project.name !== "fold-closed", "Samsung-size Chrome run");
    await page.setViewportSize({ width: 412, height: 860 });
    const errors = await open(page, projection);
    for (const c of COUNTRIES) {
      await selectCountry(page, c.name);
      await page.waitForTimeout(3500);                                       // the move to the country, then the map answers
      for (const z of [2.2, 3.5, 4.5, 5.5, 7]) {
        await page.evaluate(({ z, box }) => { const m = (window as any).__nexum.map; m.jumpTo({ center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], zoom: z }); }, { z, box: c.box as unknown as number[] });
        await page.waitForTimeout(1800);
        const k = await marks(page);
        expect(k.all.length, `${c.name} z${z}: one selection ring`).toBe(1);
        expect(k.cells, `${c.name} z${z}: no second (cell) ring`).toBe(0);
        const [x, y] = k.all[0];
        expect(x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3], `${c.name} z${z}: the ring inside the country (${x.toFixed(2)}, ${y.toFixed(2)})`).toBeTruthy();
      }
      // while zooming (out and in): never a second ring
      await page.evaluate(() => { const m = (window as any).__nexum.map; m.easeTo({ zoom: 2, duration: 1500 }); });
      for (let i = 0; i < 6; i++) { await page.waitForTimeout(250); expect((await marks(page)).cells, `${c.name}: no cell ring while zooming out`).toBe(0); }
      await page.waitForTimeout(1500);
      await page.evaluate(() => { const m = (window as any).__nexum.map; m.easeTo({ zoom: 6, duration: 1500 }); });
      for (let i = 0; i < 6; i++) { await page.waitForTimeout(250); expect((await marks(page)).cells, `${c.name}: no cell ring while zooming in`).toBe(0); }
      await page.waitForTimeout(1500);
    }
    expect(errors).toEqual([]);
  });
}
