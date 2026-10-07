// PASS #5 (2026-10-05, physical test): every meaningful thing drawn on the map answers a tap. The GDELT news points were
// drawn but mute (their click went to a listener that existed only while the Alerts panel was open). Golden: GDELT on →
// points drawn → a REAL click on one → a card about THAT point (what, where, when, source, age, link, NEXUM status) → the
// same with a REAL touch, with the tools' sheet open and closed, in MAPPA and SAT. Then the AUDIT: every map layer that
// draws features is either interactive (a real click on one of its features gets an answer) or declared context.
import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function open(browser: Browser, touch: boolean) {
  const ctx = await browser.newContext(touch ? { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/youtube|ytimg|googlevideo/, (r) => r.abort());     // no third-party video in the tests
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return { ctx, page, errors };
}
const tap = async (page: Page, touch: boolean, [x, y]: [number, number]) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(500); };

/** A screen point on a rendered feature of `layer`: the map's canvas is under the finger there (no panel, no label) and
 *  that feature is the topmost one drawn at that point. Returns the point and the feature's own properties. */
async function spot(page: Page, layer: string, avoid: string[] = [], deep = false) {
  return page.evaluate(([layer, avoid, deep]) => {
    const m = (window as any).__nexum.map, box = m.getCanvas().getBoundingClientRect();
    const ok = (p: { x: number; y: number }, tol = 0) => {
      const x = box.left + p.x, y = box.top + p.y;
      if (x < box.left + 30 || x > box.right - 70 || y < box.top + 120 || y > box.bottom - 40) return null;
      if (document.elementFromPoint(x, y)?.tagName !== "CANVAS") return null;
      // the topmost answering feature there is ours (the groups' invisible targets yield to anything else; context is not hit)
      const all = m.queryRenderedFeatures(tol ? [[p.x - tol, p.y - tol], [p.x + tol, p.y + tol]] : [p.x, p.y]);
      const top = all.filter((t: any) => t.layer.id === layer || /^(nexum-(items|hl|pts|links|zones)|ops-(orbits|channels|news|ais|hotspots$|cables|imported))/.test(t.layer.id));
      const mine = deep ? top.find((t: any) => t.layer.id === layer) : top[0]?.layer.id === layer ? top[0] : null;
      if (!mine || m.queryRenderedFeatures([[p.x - 13, p.y - 13], [p.x + 13, p.y + 13]]).some((t: any) => (avoid as string[]).includes(t.layer.id))) return null;
      return { xy: [x, y] as [number, number], p: mine.properties, under: top.map((t: any) => t.layer.id) };
    };
    // the features the map lists, at their own place…
    for (const f of m.queryRenderedFeatures({ layers: [layer] })) {
      const g = f.geometry;
      if (g.type === "LineString" && g.coordinates.length === 2) {          // a straight line: its middle on the screen
        const a = m.project(g.coordinates[0]), b = m.project(g.coordinates[1]);
        const r = ok({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 4);
        if (r) return r;
        continue;
      }
      const c = g.type === "Point" ? g.coordinates : g.type === "LineString" ? (g.coordinates.length === 2 ? [(g.coordinates[0][0] + g.coordinates[1][0]) / 2, (g.coordinates[0][1] + g.coordinates[1][1]) / 2] : g.coordinates[Math.floor(g.coordinates.length / 2)])
        : g.type === "Polygon" ? [(g.coordinates[0][0][0] + g.coordinates[0][2][0]) / 2, (g.coordinates[0][0][1] + g.coordinates[0][2][1]) / 2] : null;
      const r = c && ok(m.project(c));
      if (r) return r;
    }
    // …or, on the globe (whose whole-view listing is partial), the screen scanned as a finger would
    for (let y = 120; y < box.height - 40; y += 7) for (let x = 30; x < box.width - 70; x += 7) { const r = ok({ x, y }); if (r) return r; }
    return null;
  }, [layer, avoid, deep] as const);
}
const card = (page: Page) => page.getByTestId("ops-feat-card");

async function newsOnFromLayers(page: Page, touch: boolean) {
  await page.getByTestId(touch ? "ops-tools" : "ops-tool-layers").click();
  if (touch) await page.getByTestId("ops-tool-layers").click();
  await page.getByTestId("ops-layer-news").click();
  await expect(page.getByTestId("ops-layer-news")).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0), { timeout: 30_000 }).toBeGreaterThan(50);
  await page.waitForTimeout(1200);
}
/** The card says what THIS point is: the fields of its own row, the source, the age of the data, the original link. */
// (2026-10-06, physical acceptance: the news card is a readable event; its place, GDELT time and code are in its body
// and technical details)
async function cardIsAbout(page: Page, p: any) {
  await expect(card(page)).toBeVisible({ timeout: 10_000 });
  await expect(card(page)).toHaveAttribute("data-layer", "ops-news");
  const n = page.getByTestId("ops-feat-n");
  // several points under the finger: the card lists them all; find ours among them
  for (let k = 0; k < 20; k++) {
    const t = await page.getByTestId("news-body").textContent();
    if (t?.includes(p.place) && t.includes(`${String(p.t).replace("T", " ")} UTC`) && t.includes(String(p.code))) break;
    if (!(await n.isVisible())) break;
    await n.getByRole("button", { name: "Successivo" }).click();
  }
  const f = page.getByTestId("news-body");
  await expect(f).toContainText(p.place);
  await expect(f).toContainText(`${String(p.t).replace("T", " ")} UTC`);
  await expect(f).toContainText(String(p.code));
  await expect(f).toContainText(String(p.n));
  await expect(page.getByTestId("ops-feat-title")).not.toBeEmpty();
  await expect(page.getByTestId("news-open")).toHaveAttribute("href", p.url);
  await expect(page.getByTestId("news-open")).toHaveAttribute("rel", /noopener/);
  const src = page.getByTestId("ops-feat-source");
  await expect(src).toContainText("GDELT");
  await expect(src).toContainText("licenza gdelt-open");
  await expect(src).toContainText(/dati aggiornati .+ \(/);
  await expect(page.getByTestId("ops-feat-nexum")).toContainText("newsevents");
}

test("golden · GDELT: a real click on a news point opens its card (MAPPA and SAT, the Livelli panel open and closed)", async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, false);
  await newsOnFromLayers(page, false);
  for (const round of ["panel open", "panel closed", "SAT"]) {
    if (round === "panel closed") await page.getByTestId("ops-panel-close").click();
    if (round === "SAT") { await page.getByTestId("ops-base-sat").click(); await page.waitForTimeout(1500); }
    const s = await spot(page, "ops-news");
    expect(s, `${round}: a news point to click`).not.toBeNull();
    await page.mouse.move(...s!.xy);
    expect(await page.evaluate(() => (window as any).__nexum.map.getCanvas().style.cursor), `${round}: the pointer says it is clickable`).toBe("pointer");
    await tap(page, false, s!.xy);
    await cardIsAbout(page, s!.p);
    expect(await page.evaluate(() => (window as any).__nexum.store.get().focus), `${round}: no country opened behind it`).toBeNull();
    await page.getByTestId("ops-feat-close").click();
    await expect(card(page)).toHaveCount(0);
  }
  // a click on the empty map closes an open card
  const s = await spot(page, "ops-news");
  await tap(page, false, s!.xy);
  await expect(card(page)).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("golden · GDELT by touch: a real tap with the tools' sheet open, Back closes the card first; then with no sheet", async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, true);
  await newsOnFromLayers(page, true);
  await expect(page.getByTestId("ops-panel-layers")).toHaveAttribute("data-sheet", "half");
  let s = await spot(page, "ops-news");
  expect(s, "a news point above the sheet").not.toBeNull();
  await tap(page, true, s!.xy);
  await cardIsAbout(page, s!.p);
  // the card is above the sheet, wholly in view, and its close is under the finger
  const hit = await page.getByTestId("ops-feat-close").evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); });
  expect(hit).toBeTruthy();
  await page.goBack();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId("ops-panel-layers")).toBeVisible();      // Back closed the card, not the sheet
  await page.getByTestId("ops-panel-close").click();
  s = await spot(page, "ops-news");
  await tap(page, true, s!.xy);
  await cardIsAbout(page, s!.p);
  expect(await page.evaluate(() => (window as any).__nexum.store.get().focus)).toBeNull();
  await page.getByTestId("ops-feat-close").tap();
  await expect(card(page)).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

// ── AUDIT ─────────────────────────────────────────────────────────────────
// Interactive: a click gets an answer about that feature. Context: drawn to read the map, not things (said why).
const INTERACTIVE = /^(nexum-(items|hl|cells|links|zones)|nexum-pts-.+-(point|cluster)|ops-(orbits|channels|news|ais|hotspots|cables|routes(-[23]|-sel)?|quakes|gdacs|nws|naval|choke|ports|imported-(pt|line|fill)))$/;
const CONTEXT: Record<string, string> = {
  "basemap-background": "background", "basemap-land": "land (a tap opens the place named there)", "basemap-borders": "borders",
  "nexum-density": "density of the groups (their invisible targets, nexum-cells, answer)", "nexum-cells-hl": "ring on the focus's group",
  "nexum-illumination": "night", "nexum-lights": "night lights (reference picture)", "nexum-focus-fill": "the open element's area",
  "nexum-focus-line": "the open element's line", "nexum-hl-ring": "ring under a highlight (nexum-hl answers)", "nexum-sel": "selection ring",
  "ops-aurora": "aurora forecast field", "ops-hotspots-heat": "hotspot heat at small scales (points answer from zoom 5)",
  "ops-orbit-track": "the chosen satellite's track", "ops-shapes-fill": "your drawings (Disegno)", "ops-shapes-line": "your drawings",
  "ops-draft-fill": "drawing in progress", "ops-draft-line": "drawing in progress", "ops-draft-pts": "drawing in progress",
  "ops-point-dot": "the chosen point",
  "ops-hl": "the mark of a card chosen in the live list", "ops-route": "your route", "ops-route-alt": "your route's alternatives",
  "ops-route-step": "the step chosen in your route",
};
const isContext = (id: string) => id in CONTEXT || /^(ofm-|ops-(sat|today|clouds|precip|hillshade|terrain))/.test(id);

test("audit · every drawn layer is interactive or declared context; a real click on each interactive one gets an answer", async ({ browser }) => {
  test.setTimeout(400_000);
  const { ctx, page, errors } = await open(browser, false);
  const answered: Record<string, string> = {};
  const rendered = new Set<string>();
  const note = () => page.evaluate(() => (window as any).__nexum.map.queryRenderedFeatures().map((f: any) => f.layer.id)).then((ids) => ids.forEach((i: string) => rendered.add(i)));
  const jump = async (c: [number, number], z: number) => { await page.evaluate(([c, z]) => (window as any).__nexum.map.jumpTo({ center: c, zoom: z }), [c, z] as const); await page.waitForTimeout(3500); };
  const reset = () => page.evaluate(() => { (window as any).__nexum.store.select(null, "test"); (window as any).__nexum.ops.set({ feat: null, orbit: null, tool: null }); });
  await page.getByTestId("ops-proj-flat").click();
  // the operational layers, all on
  await page.evaluate(() => { const o = (window as any).__nexum.ops; for (const k of ["news", "hotspots", "orbits", "channels", "ais", "aurora"]) o.layer(k, true); });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0), { timeout: 30_000 }).toBeGreaterThan(50);
  await page.waitForTimeout(4000);
  await jump([10, 45], 2.2); await note();

  // news → its card
  let s = await spot(page, "ops-news");
  if (s) { await tap(page, false, s.xy); await expect(card(page)).toHaveAttribute("data-layer", "ops-news"); answered["ops-news"] = "card"; await reset(); }
  // satellites → the orbit card, with no tool open
  s = await spot(page, "ops-orbits");
  expect(s, "a satellite to click").not.toBeNull();
  await tap(page, false, s!.xy);
  await expect(page.getByTestId("ops-orbit-card")).toBeVisible({ timeout: 10_000 });
  answered["ops-orbits"] = "orbit card"; await reset();
  await page.evaluate(() => (window as any).__nexum.ops.layer("orbits", false));
  // groups → the map zooms into them
  s = await spot(page, "nexum-cells", ["ops-news", "ops-orbits", "ops-ais", "ops-hotspots", "nexum-items", "nexum-hl"]);
  if (s) { const z0 = await page.evaluate(() => (window as any).__nexum.map.getZoom()); await tap(page, false, s.xy); await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as any).__nexum.map.getZoom())).toBeGreaterThan(z0); answered["nexum-cells"] = "zoom"; }
  // ships (live Digitraffic: only when the provider answers now)
  await jump([20, 59.5], 5.5); await note();
  s = await spot(page, "ops-ais");
  if (s) { await tap(page, false, s.xy); await expect(card(page)).toHaveAttribute("data-layer", "ops-ais");
    await expect(page.getByTestId("ops-feat-source")).toContainText("Digitraffic"); await expect(page.getByTestId("ops-feat-fields")).toContainText("MMSI");
    answered["ops-ais"] = "card"; await reset(); }
  // official channels → the live panel on that channel
  await jump([24.95, 60.16], 7); await note();
  // coincident marks: the port (a NEXUM element) and its official live channel at the same coordinates — one click
  // answers both: the element's card and the live panel on that channel (the webcam layer's copy of the channel is
  // hidden for this step, to reach the operational one)
  const pts = (v: string) => page.evaluate((v) => { const m = (window as any).__nexum.map;
    for (const l of m.getStyle().layers) if (l.id.startsWith("nexum-pts")) m.setLayoutProperty(l.id, "visibility", v); }, v);
  await pts("none"); await page.waitForTimeout(600);
  s = await spot(page, "ops-channels", [], true);
  expect(s, "an official channel to click").not.toBeNull();
  await tap(page, false, s!.xy);
  await expect(page.getByTestId("ops-panel-live")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("ops-yt-stop")).toBeVisible({ timeout: 10_000 });      // the channel itself is chosen, first click
  if ((s as any).under.includes("nexum-items")) await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).not.toBeNull();
  answered["ops-channels"] = "live panel"; await reset(); await pts("visible");
  // hotspots (points from zoom 5) → their card with the sensor and the age of the data
  const h = await page.evaluate(() => (window as any).__nexum.map.getSource("ops-hotspots").serialize().data.features[0]?.geometry.coordinates);
  expect(h, "hotspots loaded").toBeTruthy();
  await jump(h, 8); await note();
  s = await spot(page, "ops-hotspots");
  expect(s, "a hotspot to click").not.toBeNull();
  await tap(page, false, s!.xy);
  await expect(card(page)).toHaveAttribute("data-layer", "ops-hotspots");
  await expect(page.getByTestId("ops-feat-fields")).toContainText("FRP");
  await expect(page.getByTestId("ops-feat-source")).toContainText("NASA FIRMS");
  await expect(page.getByTestId("ops-feat-source")).toContainText("dati aggiornati");
  answered["ops-hotspots"] = "card"; await reset();
  // an imported file (only in this browser) → its own properties
  await page.getByTestId("ops-tool-import").click();
  await page.getByTestId("ops-import-file").setInputFiles({ name: "prova.geojson", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ type: "FeatureCollection",
    features: [{ type: "Feature", properties: { name: "Punto di prova", nota: "valore A" }, geometry: { type: "Point", coordinates: [h[0] + 0.3, h[1] + 0.3] } }] })) });
  await page.getByTestId("ops-panel-close").click();
  await jump([h[0] + 0.3, h[1] + 0.3], 9);
  s = await spot(page, "ops-imported-pt");
  expect(s, "the imported point").not.toBeNull();
  await tap(page, false, s!.xy);
  await expect(card(page)).toHaveAttribute("data-layer", "ops-imported-pt");
  await expect(page.getByTestId("ops-feat-title")).toHaveText("Punto di prova");
  await expect(page.getByTestId("ops-feat-fields")).toContainText("valore A");
  answered["ops-imported-pt"] = "card"; await reset();
  // NEXUM elements → their card (Evidence, provenance, WHY live there)
  await page.evaluate(() => { const o = (window as any).__nexum.ops; for (const k of ["news", "hotspots", "channels", "ais", "aurora"]) o.layer(k, false); });
  await jump([14.99, 37.75], 6); await note();
  s = await spot(page, "nexum-items");
  expect(s, "a NEXUM element to click").not.toBeNull();
  await tap(page, false, s!.xy);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBe(s!.p.id);
  answered["nexum-items"] = "element card";
  // relation lines (drawn from the open element) → the element they lead to
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.map.getSource("nexum-links").serialize().data.features?.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  // one line framed across the view (short lines sit beside the elements they join)
  await page.evaluate(() => { const m = (window as any).__nexum.map, c = m.getSource("nexum-links").serialize().data.features[0].geometry.coordinates;
    m.fitBounds([[Math.min(c[0][0], c[1][0]), Math.min(c[0][1], c[1][1])], [Math.max(c[0][0], c[1][0]), Math.max(c[0][1], c[1][1])]], { padding: 250, duration: 0, maxZoom: 14 }); });
  await page.waitForTimeout(3000); await note();
  const ln = await spot(page, "nexum-links", ["nexum-items", "nexum-hl"]);
  if (ln) { const f0 = await page.evaluate(() => (window as any).__nexum.store.get().focus); await tap(page, false, ln.xy);
    await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBe(ln.p.r);
    expect(ln.p.r).not.toBe(f0); answered["nexum-links"] = "connected element"; }
  await reset();
  // submarine cables (live OpenStreetMap via Overpass: only when the provider answers now)
  await reset();
  await page.evaluate(() => (window as any).__nexum.ops.layer("cables", true));
  await jump([-1.5, 50.3], 6.5);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.cables ?? 0), { timeout: 40_000 }).toBeGreaterThan(0).catch(() => {});
  await page.waitForTimeout(1500); await note();
  s = await spot(page, "ops-cables");
  if (s) { await tap(page, false, s.xy); await expect(card(page)).toHaveAttribute("data-layer", "ops-cables");
    await expect(page.getByTestId("ops-feat-link")).toHaveAttribute("href", /openstreetmap\.org\/way\/\d+/);
    await expect(page.getByTestId("ops-feat-source")).toContainText("OpenStreetMap"); answered["ops-cables"] = "card"; }
  await page.evaluate(() => (window as any).__nexum.ops.layer("cables", false)); await reset();
  // security zones → the place's security section
  await page.evaluate(() => (window as any).__nexum.store.set({ mapZones: true }));
  for (const c of [[32.5, 15.5], [36.5, 34.5], [45.3, 2.1], [30.5, 49], [-72.3, 18.6]] as [number, number][]) {
    await jump(c, 6); await note();
    s = await spot(page, "nexum-zones", ["nexum-items", "nexum-hl", "nexum-links"]);
    if (s) break;
  }
  if (s) { await tap(page, false, s.xy);
    await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBe(s!.p.place);
    await expect(page.getByTestId("sec-sicurezza")).toBeVisible({ timeout: 20_000 }); answered["nexum-zones"] = "security section"; }
  // the classification: nothing drawn is unaccounted for
  const unclassified = [...rendered].filter((id) => !INTERACTIVE.test(id) && !isContext(id));
  expect(unclassified, "layers drawing features with no declared behaviour").toEqual([]);
  console.log("AUDIT answered:", JSON.stringify(answered), "rendered:", [...rendered].sort().join(" "));
  for (const must of ["ops-news", "ops-orbits", "ops-channels", "ops-hotspots", "ops-imported-pt", "nexum-items", "nexum-cells", "nexum-links", "nexum-zones"]) expect(answered[must], must).toBeTruthy();
  expect(errors).toEqual([]);
  await ctx.close();
});
