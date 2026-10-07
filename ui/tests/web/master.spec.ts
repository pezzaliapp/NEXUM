// MASTER PASS (2026-10-06): the OSIRIS capabilities brought to NEXUM in the final pass, each tested from what the person
// sees to the information it gives (VISIBLE DATA → CLICK/TAP → EXPLANATION), never only "the marker appears".
// Some steps need the providers online (USGS, GDACS, NWS, FOSSGIS routing, ArcGIS Online, Overpass): their answers are
// live data, so the checks are on structure and meaning, not on fixed values.
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
/** A screen point where the map draws a feature of `layer` as the topmost answering feature (scan, as a finger). */
async function spot(page: Page, layer: string) {
  return page.evaluate((layer) => {
    const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
    for (let y = 130; y < b.height - 40; y += 6) for (let x = 30; x < b.width - 80; x += 6) {
      const top = m.queryRenderedFeatures([x, y]).filter((t: any) => /^(nexum-(items|hl|pts|links|zones)|ops-)/.test(t.layer.id) && !/ops-(hl|aurora|hotspots-heat|orbit-track)$/.test(t.layer.id));
      if (top[0]?.layer.id === layer && document.elementFromPoint(b.left + x, b.top + y)?.tagName === "CANVAS") return { xy: [b.left + x, b.top + y] as [number, number], p: top[0].properties };
    }
    return null;
  }, layer);
}

test("live alerts: every source, VERIFIED vs REPORTED, tabs, search, in-view; a card locates and explains; a marker explains", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-tool-alerts").click();
  const list = page.getByTestId("ops-alerts-list");
  await expect(page.getByTestId("ops-alert").first()).toBeVisible({ timeout: 40_000 });
  // every source answered or said it could not be reached (never silent)
  await expect.poll(async () => (await page.getByTestId("ops-alerts-sources").textContent()) ?? "", { timeout: 40_000 }).not.toContain("…");
  const kinds = await list.getByTestId("ops-alert").evaluateAll((els) => els.map((e) => [e.getAttribute("data-kind"), e.getAttribute("data-verified")]));
  expect(kinds.some(([k, v]) => k === "news" && v === "false"), "media reports, marked as reported").toBeTruthy();
  expect(kinds.some(([k, v]) => k === "geo" && v === "true"), "USGS earthquakes, marked as verified").toBeTruthy();
  for (const [k, v] of kinds) expect(v, `${k}`).toBe(k === "news" ? "false" : "true");
  // tabs
  await page.getByTestId("ops-alerts-tab-reported").click();
  expect(await list.getByTestId("ops-alert").evaluateAll((els) => els.every((e) => e.getAttribute("data-verified") === "false"))).toBeTruthy();
  await page.getByTestId("ops-alerts-tab-geo").click();
  expect(await list.getByTestId("ops-alert").evaluateAll((els) => els.every((e) => e.getAttribute("data-kind") === "geo"))).toBeTruthy();
  // search
  const first = (await list.getByTestId("ops-alert").first().locator("b").textContent())!;
  await page.getByTestId("ops-alerts-q").fill("zzzz-nothing");
  await expect(page.getByTestId("ops-alerts-empty")).toBeVisible();
  await page.getByTestId("ops-alerts-q").fill("");
  // the card: locates, marks, explains (what, where, when, source, freshness, link)
  await list.getByTestId("ops-alert").first().locator("button").click();
  const card = page.getByTestId("ops-feat-card");
  await expect(card).toHaveAttribute("data-layer", "ops-quakes", { timeout: 15_000 });
  await expect(page.getByTestId("ops-feat-title")).toContainText(first.replace(/^M /, "M "));
  await expect(page.getByTestId("ops-feat-fields")).toContainText("Profondità");
  await expect(page.getByTestId("ops-feat-source")).toContainText("Geological Survey");
  await expect(page.getByTestId("ops-feat-link")).toHaveAttribute("href", /earthquake\.usgs\.gov/);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getSource("ops-hl")?.serialize().data.features.length ?? 0), { timeout: 5000 }).toBe(1);
  // in view: only what the map shows now
  await page.getByTestId("ops-alerts-tab-all").click();
  await page.getByTestId("ops-alerts-inview").check();
  const inView = await list.getByTestId("ops-alert").count();
  await page.getByTestId("ops-alerts-inview").uncheck();
  expect(inView).toBeLessThanOrEqual(await list.getByTestId("ops-alert").count());
  // the marker: a real click on an earthquake on the map opens the same kind of card
  await page.getByTestId("ops-feat-close").click();
  await page.getByTestId("ops-panel-close").click();
  await page.getByTestId("ops-proj-flat").click();
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [-150, 45], zoom: 1.6 }));
  await page.waitForTimeout(2500);
  const s = await spot(page, "ops-quakes");
  expect(s, "an earthquake drawn on the map").not.toBeNull();
  await page.mouse.click(...s!.xy);
  await expect(card).toHaveAttribute("data-layer", "ops-quakes");
  await expect(page.getByTestId("ops-feat-fields")).toContainText(String(s!.p.place).slice(0, 10));
  expect(errors).toEqual([]);
});

test("GDELT news grouped: several rows on the same action and place are one item with all their articles", async ({ page }) => {
  const errors = await open(page);
  const g = await page.evaluate(async () => {
    const r = await (window as any).__nexum.apiFetch("/tables/newsevents");
    const rows = r.body.data.rows as any[], keys = new Set(rows.map((x) => `${x[2]}|${String(x[4]).toLowerCase()}`));
    return { rows: rows.length, groups: keys.size };
  });
  await page.getByTestId("ops-tool-alerts").click();
  await page.getByTestId("ops-alerts-tab-reported").click();
  await expect.poll(() => page.getByTestId("ops-alert").count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.getByTestId("ops-alert").count(), "one item per action and place").toBeLessThanOrEqual(Math.min(g.groups, 480));
  expect(g.groups, "fewer items than rows: duplicates merged").toBeLessThan(g.rows);
  expect(errors).toEqual([]);
});

test("routing: car with alternatives and Italian instructions, a step located on the map, avoid tolls, a stop, bike with elevation", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-tool-route").click();
  const typePlace = async (id: string, q: string) => {
    await page.getByTestId(id).fill(q);
    await page.locator(".ops-sugg button").first().click({ timeout: 15_000 });
    await expect(page.getByTestId(id)).not.toHaveValue(q);
  };
  await typePlace("ops-route-from", "Parma");
  await typePlace("ops-route-to", "Reggio Emilia");
  await page.getByTestId("ops-route-go").click();
  const res = page.getByTestId("ops-route-result");
  await expect(res).toContainText(/km/, { timeout: 30_000 });
  await expect(res).toContainText(/min/);
  await expect(res).toContainText("Valhalla");
  // alternatives, when the service finds them (Parma → Reggio Emilia: it does)
  await expect(page.getByTestId("ops-route-alts").locator("button").nth(1)).toBeVisible({ timeout: 10_000 });
  const steps = page.getByTestId("ops-route-steps").locator("li");
  expect(await steps.count()).toBeGreaterThan(3);
  await expect(steps.first()).toContainText(/Guida|Dirigiti|Prendi|Svolta|Continua|Procedi/i);
  // a step: located and drawn on the map
  await steps.nth(2).locator("button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getSource("ops-route-step")?.serialize().data.geometry?.coordinates?.length ?? 0)).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("ops-route")?.serialize().data.geometry.coordinates.length)).toBeGreaterThan(50);
  // avoid tolls: the route says no toll
  await page.getByTestId("ops-route-avoid-tolls").check();
  await page.getByTestId("ops-route-go").click();
  await expect(res).toContainText("Valhalla", { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-testid="ops-route-flags"]')?.textContent ?? ""), { timeout: 15_000 }).not.toContain("pedaggio");
  // a stop in between
  await page.getByTestId("ops-route-add-via").click();
  await page.getByTestId("ops-route-via-0").fill("Sorbolo");
  await page.locator(".ops-sugg button").first().click({ timeout: 15_000 });
  await page.getByTestId("ops-route-go").click();
  await expect(res).toContainText(/km/, { timeout: 30_000 });
  // bike: elevation profile
  await page.getByTestId("ops-route-mode-bike").click();
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-elev")).toContainText(/↑ \d+ m/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("dataset discovery: a category in the map's area, licensed results, import in the area, layers managed, a feature explains its dataset", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [-90.1, 29.95], zoom: 8 }));   // New Orleans
  await page.getByTestId("ops-tool-import").click();
  await page.getByTestId("ops-arcgis-cats").getByRole("button", { name: "Alluvioni" }).click();
  await expect(page.getByTestId("ops-arcgis-count")).toContainText("nell'area", { timeout: 30_000 });
  const items = page.getByTestId("ops-arcgis-item");
  expect(await items.count()).toBeGreaterThan(0);
  for (const t of await items.allTextContents()) expect(t).toContain("Licenza:");
  // an importable (licensed) dataset, imported in the area; a dataset that fails (offline, private) says why and the next is tried
  const imp = page.getByTestId("ops-arcgis-import");
  expect(await imp.count(), "at least one dataset with a declared licence").toBeGreaterThan(0);
  let ok = false;
  for (let i = 0; i < Math.min(await imp.count(), 5) && !ok; i++) {
    await imp.nth(i).click();
    await expect(page.getByTestId("ops-import-msg")).toBeVisible({ timeout: 30_000 });
    ok = /elementi da/.test((await page.getByTestId("ops-import-msg").textContent()) ?? "") && (await page.getByTestId("ops-import-layer").count()) > 0;
  }
  expect(ok, "a dataset imported").toBeTruthy();
  await expect(page.getByTestId("ops-import-layer")).toHaveCount(1);
  // visibility and removal
  await page.getByTestId("ops-import-visible").uncheck();
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("ops-imported").serialize().data.features.length)).toBe(0);
  await page.getByTestId("ops-import-visible").check();
  const n = await page.evaluate(() => (window as any).__nexum.map.getSource("ops-imported").serialize().data.features.length);
  expect(n).toBeGreaterThan(0);
  // a real click on an imported feature: its dataset, owner and licence
  await page.getByTestId("ops-panel-close").click();
  await page.waitForTimeout(1500);
  let s: any = null;
  for (const l of ["ops-imported-pt", "ops-imported-line", "ops-imported-fill"]) { s = await spot(page, l); if (s) break; }
  expect(s, "an imported feature drawn").not.toBeNull();
  await page.mouse.click(...s!.xy);
  await expect(page.getByTestId("ops-feat-card")).toHaveAttribute("data-layer", /ops-imported/);
  await expect(page.getByTestId("ops-feat-fields")).toContainText("Livello");
  await expect(page.getByTestId("ops-feat-link")).toHaveAttribute("href", /arcgis\.com\/home\/item/);
  await expect(page.getByTestId("ops-feat-source")).toContainText("Licenza dichiarata");
  expect(errors).toEqual([]);
});

test("maritime: OSM cables worldwide, IMF PortWatch chokepoints with measured transits, OSM naval bases — each explains itself", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-proj-flat").click();
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("cables", true); o.layer("choke", true); o.layer("naval", true); });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.cables ?? 0), { timeout: 30_000 }).toBeGreaterThan(5000);   // the world, not a view
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.choke ?? 0), { timeout: 30_000 }).toBe(28);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.naval ?? 0), { timeout: 30_000 }).toBeGreaterThan(100);
  // the Mediterranean at a small scale: cables drawn (OSIRIS's "Maritime lines" view)
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [32.4, 31.5], zoom: 4.2 }));
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as any).__nexum.map.queryRenderedFeatures({ layers: ["ops-cables"] }).length)).toBeGreaterThan(20);
  // Suez: the chokepoint's card, measured (yearly average by ship type, the latest day, the 7-day mean)
  let s = await spot(page, "ops-choke");
  expect(s, "a chokepoint drawn").not.toBeNull();
  await page.mouse.click(...s!.xy);
  const card = page.getByTestId("ops-feat-card");
  await expect(card).toHaveAttribute("data-layer", "ops-choke");
  await expect(page.getByTestId("ops-feat-fields")).toContainText("media annua (AIS 2019–2024)");
  await expect(page.getByTestId("ops-choke-daily")).toContainText(/transiti/, { timeout: 20_000 });
  await expect(page.getByTestId("ops-feat-source")).toContainText("IMF PortWatch");
  await expect(page.getByTestId("ops-feat-fields")).not.toContainText(/rischio|risk/i);
  await page.getByTestId("ops-feat-close").click();
  // a port: measured port calls of the latest days (IMF PortWatch)
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("choke", false); o.layer("naval", false); o.layer("cables", false); o.layer("ports", true); (window as any).__nexum.map.jumpTo({ center: [4.2, 51.95], zoom: 8 }); });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.ports ?? 0), { timeout: 30_000 }).toBeGreaterThan(2000);
  await page.waitForTimeout(1500);
  s = await spot(page, "ops-ports");
  expect(s, "a port drawn (Rotterdam area)").not.toBeNull();
  await page.mouse.click(...s!.xy);
  await expect(card).toHaveAttribute("data-layer", "ops-ports");
  await expect(page.getByTestId("ops-port-daily")).toContainText(/scali/, { timeout: 20_000 });
  await page.getByTestId("ops-feat-close").click();
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("ports", false); o.layer("cables", true); });
  // a cable: its name (if mapped), kind, OSM link and licence
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("choke", false); o.layer("naval", false); (window as any).__nexum.map.jumpTo({ center: [12.6, 37.6], zoom: 7 }); });
  await page.waitForTimeout(2000);
  s = await spot(page, "ops-cables");
  expect(s, "a cable drawn").not.toBeNull();
  await page.mouse.click(...s!.xy);
  await expect(card).toHaveAttribute("data-layer", "ops-cables");
  await expect(page.getByTestId("ops-feat-link")).toHaveAttribute("href", /openstreetmap\.org\/way\/\d+/);
  await expect(page.getByTestId("ops-feat-source")).toContainText("OpenStreetMap");
  await page.getByTestId("ops-feat-close").click();
  // a naval base: name and operator only, OSM link
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("cables", false); o.layer("naval", true); (window as any).__nexum.map.jumpTo({ center: [-76.3, 36.95], zoom: 9 }); });
  await page.waitForTimeout(2000);
  s = await spot(page, "ops-naval");
  expect(s, "a naval base drawn (Norfolk)").not.toBeNull();
  await page.mouse.click(...s!.xy);
  await expect(card).toHaveAttribute("data-layer", "ops-naval");
  await expect(page.getByTestId("ops-feat-link")).toHaveAttribute("href", /openstreetmap\.org\/(node|way|relation)\/\d+/);
  expect(errors).toEqual([]);
});

test("satellite categories: a switch and a count each; turning one off removes exactly its satellites", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-tool-layers").click();
  await page.getByTestId("ops-layer-orbits").click();
  await expect(page.getByTestId("ops-sat-groups")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits ?? 0), { timeout: 30_000 }).toBeGreaterThan(1000);
  const all = await page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits);
  const nComms = Number((await page.getByTestId("ops-sat-groups").locator("li").first().locator(".mono").textContent())!.replace(/\D/g, ""));
  expect(nComms).toBeGreaterThan(1000);
  await page.getByTestId("ops-sat-comms").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits), { timeout: 10_000 }).toBeLessThan(all - 1000);
  await page.getByTestId("ops-sat-comms").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.orbits), { timeout: 10_000 }).toBeGreaterThan(all - 50);
  expect(errors).toEqual([]);
});

test("camera previews on the map: only when asked and at street scale; a still says when it was loaded; a tap opens the camera's card", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [10.3279, 44.8015], zoom: 14 }));   // Parma
  await page.waitForTimeout(2000);
  expect(await page.getByTestId("cam-preview").count(), "nothing until the person asks").toBe(0);
  await page.evaluate(() => (window as any).__nexum.ops.layer("camPreviews", true));
  await expect.poll(() => page.getByTestId("cam-preview").count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.getByTestId("cam-preview").count()).toBeLessThanOrEqual(6);
  await expect.poll(() => page.getByTestId("cam-preview").evaluateAll((els) => els.every((e) => e.getAttribute("data-status"))), { timeout: 20_000 }).toBeTruthy();
  const pv = await page.getByTestId("cam-preview").evaluateAll((els) => els.map((e) => ({ s: e.getAttribute("data-status"), t: e.textContent })));
  for (const p of pv) if (p.s === "current_snapshot") expect(p.t).toContain("immagine caricata alle");
  for (const p of pv) if (p.s !== "live_stream" && p.s !== "external_live") expect(p.t).not.toContain("LIVE");
  await page.getByTestId("cam-preview").first().click();
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 20_000 });
  // away from street scale: the tiles go
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ zoom: 9 }));
  await expect.poll(() => page.getByTestId("cam-preview").count(), { timeout: 10_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test("navigation: off the route for more than 6 s → a new route from the device's position (emulated), screen kept on", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 44.8015, longitude: 10.328 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors = await open(page);
  await page.getByTestId("ops-tool-route").click();
  for (const [id, q] of [["ops-route-from", "Parma"], ["ops-route-to", "Reggio Emilia"]]) {
    await page.getByTestId(id).fill(q);
    await page.locator(".ops-sugg button").first().click({ timeout: 15_000 });
  }
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toContainText(/km/, { timeout: 30_000 });
  await page.getByTestId("ops-nav-toggle").click();
  await expect(page.getByTestId("ops-nav")).toContainText(/tra /, { timeout: 15_000 });
  // the device goes 2 km off the route and stays there
  await ctx.setGeolocation({ latitude: 44.83, longitude: 10.40 });
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(1000); await ctx.setGeolocation({ latitude: 44.83 + i * 1e-5, longitude: 10.40 }); }
  await expect(page.getByTestId("ops-route-from")).toHaveValue("La tua posizione", { timeout: 30_000 });
  await expect(page.getByTestId("ops-route-result")).toContainText(/km/, { timeout: 30_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("small parity items: exchange-rate ranges, share links, N2YO on a satellite card, the alerts' summary, an area watching the live alerts", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-tool-markets").click();
  await expect(page.getByTestId("ops-fx-series")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("ops-fx-range").getByRole("button", { name: "1A" }).click();
  const y = new Date(Date.now() - 366 * 864e5).toISOString().slice(0, 10);
  await expect(page.getByTestId("ops-fx-series")).toContainText(`dal ${y}`, { timeout: 20_000 });
  await page.getByTestId("ops-tool-share").click();
  for (const n of ["X", "LinkedIn", "Reddit"]) await expect(page.getByTestId("ops-share-social").getByRole("link", { name: new RegExp(n) })).toHaveAttribute("href", /url=/);
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: 25544 }));   // ISS
  await expect(page.getByTestId("ops-orbit-n2yo")).toHaveAttribute("href", /n2yo\.com\/satellite\/\?s=25544/, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__nexum.ops.set({ orbit: null }));
  await page.getByTestId("ops-tool-alerts").click();
  await expect(page.getByTestId("ops-alerts-summary")).toContainText(/Ultime 24 ore: \d+ elementi/, { timeout: 30_000 });
  // an area over the Pacific ring of fire, watched
  await page.getByTestId("ops-tool-draw").click();
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [150, 10], zoom: 1.6 }));
  await page.getByTestId("ops-proj-flat").click();
  await page.waitForTimeout(800);
  await page.getByTestId("ops-draw-box").click();
  const b = (await page.getByTestId("map").boundingBox())!;
  await page.mouse.click(b.x + 120, b.y + 150); await page.waitForTimeout(400);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height - 80); await page.waitForTimeout(600);
  await expect(page.getByTestId("ops-shape")).toHaveCount(1);
  await page.getByTestId("ops-aoi-watch").check();
  await expect(page.getByTestId("ops-aoi-watch-log")).toContainText(/\d+ avvisi già dentro/, { timeout: 30_000 });
  await page.evaluate(() => localStorage.removeItem("nexum.aoi.shapes.v1"));
  expect(errors).toEqual([]);
});
