// THE CITIES ON THE MAP (2026-10-09, city map audit). The ranked places (vocabulary hint "place_index": inhabited
// places) are named by population — the most populous first, more as the map zooms in, those of the selected place
// first — within the label budget and the no-overlap rule, before the names of micro-states; each name opens its card.
// Every element's mark stays legible on the dark map and on imagery (a thin dark edge, size unchanged), also while a
// place (an area) is selected; the emphasis of a selected event is unchanged. Colours by meaning (src/config/palette.json).
// The index of places is read only once such a place is on the map. Desktop, iPhone, Fold closed and open; MAPPA and SAT; with and without Italy selected; zoom 4.5 / 5.7 / 7 / 8.5.
import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const DEVICES = [
  { name: "desktop", width: 1440, height: 900, mobile: false, max: 34 },
  { name: "iphone", width: 430, height: 740, mobile: true, max: 14 },
  { name: "fold-closed", width: 344, height: 690, mobile: true, max: 14 },
  { name: "fold-open", width: 884, height: 960, mobile: true, max: 34 },
] as const;
const ROME: [number, number] = [12.48, 41.9];

async function open(browser: Browser, d: (typeof DEVICES)[number]) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const index: string[] = [];
  page.on("request", (r) => { if (r.url().includes("places-index")) index.push(r.url()); });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => !!(window as any).__nexum.ops, null, { timeout: 60_000 });
  return { page, errors, index, close: () => ctx.close() };
}
const view = async (page: Page, center: [number, number], zoom: number) => {
  await page.evaluate(([c, z]) => (window as any).__nexum.map.jumpTo({ center: c, zoom: z }), [center, zoom] as const);
  await page.waitForTimeout(3500);
};
const base = (page: Page, b: "map" | "sat") => page.evaluate((b) => (window as any).__nexum.ops.set({ base: b }), b);
const italy = (page: Page) => page.evaluate(async () => {
  const id = (await (window as any).__nexum.apiFetch("/places-index")).body.data.places.find((x: any) => x[1] === "place.country" && x[2] === "Italy")[0];
  (window as any).__nexum.store.select(id, "test");
});
/** The names on the map: text, class, box; and whether any two overlap. */
const names = (page: Page) => page.evaluate(() => {
  const els = [...document.querySelectorAll<HTMLElement>("[data-testid=map-labels] .maplabel")];
  const boxes = els.map((e) => ({ t: e.textContent ?? "", city: e.classList.contains("city"), r: e.getBoundingClientRect() }));
  let overlap = "";
  for (let i = 0; i < boxes.length && !overlap; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) { overlap = `${boxes[i].t} × ${boxes[j].t}`; break; }
  }
  return { all: boxes.map((b) => b.t), cities: boxes.filter((b) => b.city).map((b) => b.t), overlap };
});

for (const d of DEVICES) {
  test(`cities on ${d.name}: named by population at every zoom, MAPPA and SAT, with and without Italy selected; no overlap`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, errors, index, close } = await open(browser, d);
    // the first screen never reads the index of places
    expect(index, "index of places read at the first screen").toEqual([]);
    const desk = d.name === "desktop";
    for (const b of ["map", "sat"] as const) {
      await base(page, b);
      for (const sel of [false, true]) {
        if (sel) await italy(page); else await page.evaluate(() => (window as any).__nexum.store.select(null, "test"));
        const tag = `${d.name}/${b}/${sel ? "Italy" : "world"}`;
        // 4.5 · national scale: the largest cities (≥ 1 million) — when the map shows elements there (a phone's budget
        // may answer with the density alone: then no element is named, as before)
        await view(page, [12.5, 42.6], 4.5);
        let n = await names(page);
        const lod = await page.evaluate(() => (window as any).__nexum.store.get().mapInfo?.lod);
        if (lod === "aggregates") expect(n.cities, `${tag} z4.5 (density)`).toEqual([]);
        else expect(n.cities, `${tag} z4.5`).toEqual(expect.arrayContaining(desk ? ["Rome", "Milan", "Naples"] : ["Rome"]));
        expect(n.overlap, `${tag} z4.5 overlap`).toBe("");
        // 5.7 · regional scale: the south (Rome, Naples) and, on wide screens, the north (Milan)
        for (const [c, want] of [[[13.6, 41.4], ["Rome", "Naples"]], ...(d.width >= 800 ? [[[10.0, 44.6], ["Milan"]]] : [])] as [[number, number], string[]][]) {
          await view(page, c, 5.7);
          n = await names(page);
          expect(n.cities, `${tag} z5.7 ${want}`).toEqual(expect.arrayContaining(want));
          expect(n.overlap, `${tag} z5.7 overlap`).toBe("");
          expect(n.all.length, `${tag} z5.7 budget`).toBeLessThanOrEqual(d.max + 1);
        }
        // 7 and 8.5 · Rome is named (never hidden by the micro-state it holds)
        for (const z of [7, 8.5]) {
          await view(page, ROME, z);
          n = await names(page);
          expect(n.cities, `${tag} z${z}`).toContain("Rome");
          expect(n.overlap, `${tag} z${z} overlap`).toBe("");
        }
      }
    }
    // read once, when the cities were first on the map
    expect(index.length, "index of places read once").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await close();
  });
}

test("a city's name opens its card (desktop and Fold closed)", async ({ browser }) => {
  for (const d of [DEVICES[0], DEVICES[2]]) {
    const { page, errors, close } = await open(browser, d);
    await view(page, ROME, 7);
    await page.locator("[data-testid=map-labels] .maplabel.city", { hasText: /^Rome$/ }).first().click();
    await expect(page.getByTestId("focus-head")).toContainText("Rome", { timeout: 30_000 });
    await expect(page.getByTestId("focus-head")).toContainText("Città / insediamento");
    expect(errors).toEqual([]);
    await close();
  }
});

test("marks: legible while a place (area) is selected (ports too); a selected event still makes them recede", async ({ browser }) => {
  const { page, errors, close } = await open(browser, DEVICES[0]);
  await page.evaluate(() => (window as any).__nexum.store.setMapTypes(["place.settlement", "transport.port"]));
  await page.evaluate(() => (window as any).__nexum.ops.set({ base: "sat" }));
  const expr = async () => JSON.stringify(await page.evaluate(() => (window as any).__nexum.map.getPaintProperty("nexum-items", "icon-opacity")));
  await view(page, [12.3, 41.85], 7.7);
  const IDLE = '["case",["==",["get","k"],"object"],0.75,1]';
  expect(await expr(), "idle: elements legible").toContain(IDLE);
  // a place (area) selected: the layers shown stay as they are — Fiumicino's port as legible as Rome
  await italy(page); await page.waitForTimeout(2500);
  await view(page, [12.3, 41.85], 7.7);
  expect(await expr(), "a selected place keeps every layer legible").toContain(IDLE);
  const port = await page.evaluate(() => {
    const m = (window as any).__nexum.map, N = (window as any).__nexum;
    const f = m.queryRenderedFeatures({ layers: ["nexum-items"] }).find((x: any) => /Fiumicino/.test(N.store.entity(x.properties.id)?.label ?? "") && N.store.entity(x.properties.id)?.type === "transport.port");
    return f ? { o: f.properties.o, k: f.properties.k } : null;
  });
  expect(port, "Fiumicino's port on the map").not.toBeNull();
  expect(port!.o * 0.75, "the port's opacity").toBeGreaterThanOrEqual(0.7);
  // an event selected: every unrelated element recedes, cities and ports included (unchanged emphasis)
  await page.evaluate(() => (window as any).__nexum.store.select("ins_22t2w7s2kfc634742klsncp7wq", "test"));
  await page.waitForTimeout(2000);
  const ev = await expr();
  expect(ev).toContain('"feature-state","lk"');
  expect(ev).toContain("0.35");
  // a thin dark edge on every element's mark (size and touch area unchanged); events keep none
  expect(JSON.stringify(await page.evaluate(() => (window as any).__nexum.map.getPaintProperty("nexum-items", "icon-halo-width")))).toBe('["case",["==",["get","k"],"object"],1.2,0]');
  expect(JSON.stringify(await page.evaluate(() => (window as any).__nexum.map.getLayoutProperty("nexum-items", "icon-size")))).toContain('"object",0.18,0.4');
  expect(errors).toEqual([]);
  await close();
});

test("colours by meaning: cities, ports, airfields, power plants, volcanoes, violence apart — on the map and in the legend", async ({ browser }) => {
  const { page, errors, close } = await open(browser, DEVICES[0]);
  const want: Record<string, string> = { "place.settlement": "#C3CBD0", "transport.port": "#4F95BF", "transport.airport": "#9A8BC4",
    "energy.power_plant": "#C08064", "geo.volcano": "#B07A8C", "conflict.violence_event": "#B85B55", "seismic.earthquake": "#6FA3A0" };
  // the legend (Sulla mappa): one square or dot per category, in its colour
  const legend = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const el = document.querySelector<HTMLElement>(`.typerow[data-type="${id}"] span[aria-hidden]`);
    return [id, el ? getComputedStyle(el).color : null];
  })), Object.keys(want));
  const rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
  for (const [id, h] of Object.entries(want)) expect(legend[id], `legend ${id}`).toBe(rgb(h));
  expect(new Set(Object.values(want)).size, "all distinct").toBe(Object.keys(want).length);
  // the map draws the same colours
  await page.evaluate(() => (window as any).__nexum.store.setMapTypes(["place.settlement", "transport.port", "transport.airport", "energy.power_plant"]));
  await view(page, [12.3, 41.85], 8);
  const drawn = await page.evaluate(() => {
    const m = (window as any).__nexum.map, N = (window as any).__nexum, out: Record<string, string> = {};
    for (const f of m.queryRenderedFeatures({ layers: ["nexum-items"] })) { const t = N.store.entity(f.properties.id)?.type; if (t) out[t] = f.properties.c; }
    return out;
  });
  for (const t of ["place.settlement", "transport.port", "transport.airport", "energy.power_plant"]) expect(drawn[t], `map ${t}`).toBe(want[t]);
  expect(errors).toEqual([]);
  await close();
});

test("the Città layer off: no city marks nor names; ports and webcams unaffected", async ({ browser }) => {
  const { page, errors, close } = await open(browser, DEVICES[0]);
  await view(page, ROME, 5.7);
  expect((await names(page)).cities.length).toBeGreaterThan(0);
  const marks = () => page.evaluate(() => (window as any).__nexum.map.queryRenderedFeatures({ layers: ["nexum-items"] })
    .map((f: any) => (window as any).__nexum.store.entity(f.properties.id)?.type));
  // none
  await page.evaluate(() => (window as any).__nexum.store.setMapTypes([])); await page.waitForTimeout(3500);
  expect(await marks()).toEqual([]);
  expect((await names(page)).cities).toEqual([]);
  // ports alone: their marks only, no city names
  await page.evaluate(() => (window as any).__nexum.store.setMapTypes(["transport.port"])); await page.waitForTimeout(3500);
  const pm = await marks();
  expect(pm.length).toBeGreaterThan(0);
  expect(pm.every((x: any) => x === "transport.port")).toBe(true);
  expect((await names(page)).cities).toEqual([]);
  // webcams: their own clustered layer
  await page.evaluate(() => (window as any).__nexum.store.setMapTypes(["camera.public_webcam"])); await page.waitForTimeout(5000);
  const cams = await page.evaluate(() => {
    const m = (window as any).__nexum.map;
    const ls = (m.getStyle().layers as any[]).map((l) => l.id).filter((id) => id.startsWith("nexum-pts-camera"));
    return m.queryRenderedFeatures({ layers: ls }).length;
  });
  expect(cams).toBeGreaterThan(0);
  expect((await names(page)).cities).toEqual([]);
  expect(errors).toEqual([]);
  await close();
});
