// WAVE 1 — AFTER THE PHYSICAL TEST (2026-10-08). What the person saw, tested by what it does:
//  - routing: every mode its own answer (Parma → Civitanova Marche: car, bicycle, on foot), never the previous one's;
//    a provider's refusal said; constraints never silently dropped; a changed request offers "Ricalcola";
//  - navigation: said before it starts (GPS, and the start replaced when off the route), GPS and voice states shown,
//    an Italian voice really speaking, the voice off on its own, stopping keeps the route;
//  - the selection: named on the map, its ring answers (opens the card), × ends it; the source's own record linked;
//  - registers: every row opens its detail with the register's link; a NEXUM country linked only by its exact name;
//  - passive network lookups: input checked before any request, structured answers with source and time, CT as links;
//  - local AI: nothing downloaded until asked; requirements said.
// Some steps ask the providers online (FOSSGIS, Photon, DefiLlama, JRC, Google DNS, rdap.org, RIPEstat, MITRE).
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
test.describe.configure({ timeout: 240_000 });

async function open(page: Page, vp = { width: 1440, height: 900 }) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(vp);
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
async function place(page: Page, id: string, q: string) {
  await page.getByTestId(id).fill(q);
  await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
  await expect(page.getByTestId(id)).not.toHaveValue(q);
}
const settled = (page: Page) => expect(page.getByTestId("ops-route-busy")).toHaveCount(0, { timeout: 60_000 });
const result = async (page: Page) => {
  const r = page.getByTestId("ops-route-result");
  return { mode: await r.getAttribute("data-mode"), text: (await r.textContent()) ?? "", km: Number(((await r.textContent()) ?? "").match(/([\d.]+(?:,\d+)?) km/)?.[1].replace(/\./g, "").replace(",", ".")),
    step: (await page.getByTestId("ops-route-steps").locator("li").first().textContent()) ?? "" };
};

test("routing: Parma → Civitanova Marche — car, bicycle and on foot each their own answer, never the previous one's; refusals said; tolls avoided; a new destination asks Ricalcola", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "route" }));
  await place(page, "ops-route-from", "Parma");
  await place(page, "ops-route-to", "Civitanova Marche");
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toHaveAttribute("data-mode", "car", { timeout: 60_000 });
  const car = await result(page);
  expect(car.text).toContain("Auto");
  // bicycle: the car's answer gone at once, then the bicycle's own
  await page.getByTestId("ops-route-mode-bike").click();
  expect(await page.locator('[data-testid="ops-route-result"][data-mode="car"]').count(), "the car's result hidden at once").toBe(0);
  await settled(page);
  await expect(page.getByTestId("ops-route-result")).toHaveAttribute("data-mode", "bike", { timeout: 60_000 });
  const bike = await result(page);
  expect(bike.text).toContain("Bici");
  expect(bike.text).not.toBe(car.text);
  expect(bike.step).not.toBe(car.step);
  // the provider that could not answer is named, with its reason (Valhalla's 150 km limit for bicycles)
  if (/OSRM/.test(bike.text)) await expect(page.getByTestId("ops-route-note")).toContainText("Valhalla");
  // on foot
  await page.getByTestId("ops-route-mode-foot").click();
  await settled(page);
  await expect(page.getByTestId("ops-route-result")).toHaveAttribute("data-mode", "foot", { timeout: 60_000 });
  const foot = await result(page);
  expect(foot.text).toContain("A piedi");
  expect(foot.text).not.toBe(bike.text);
  // car again, avoiding tolls: computed again by itself, no toll in the answer
  await page.getByTestId("ops-route-mode-car").click();
  await settled(page);
  await page.getByTestId("ops-route-avoid-tolls").check();
  await settled(page);
  await expect(page.getByTestId("ops-route-result")).toHaveAttribute("data-mode", "car", { timeout: 60_000 });
  await expect.poll(async () => (await page.getByTestId("ops-route-result").textContent()) ?? "", { timeout: 30_000 }).not.toContain("pedaggio");
  // a new destination: the previous answer is hidden and Ricalcola offered
  await page.getByTestId("ops-route-avoid-tolls").uncheck();
  await settled(page);
  await place(page, "ops-route-to", "Reggio Emilia");
  await expect(page.getByTestId("ops-route-result")).toHaveCount(0);
  await expect(page.getByTestId("ops-route-stale")).toContainText("Ricalcola");
  expect(errors).toEqual([]);
});

test("navigation: said before it starts; GPS and voice shown; an Italian voice speaks; the voice off on its own; stopping keeps the route", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 44.8015, longitude: 10.328 }, permissions: ["geolocation"] });
  await ctx.addInitScript(() => { const L = ((window as any).__sp = [] as any[]); const sp = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { L.push({ text: u.text, lang: u.lang, voice: u.voice?.lang ?? null }); try { sp(u); } catch { /* no voice */ } }; });
  const page = await ctx.newPage();
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "route" }));
  await place(page, "ops-route-from", "Parma");
  await place(page, "ops-route-to", "Reggio Emilia");
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("ops-nav-before")).toContainText("posizione del dispositivo");
  await expect(page.getByTestId("ops-nav-before")).toContainText("viene sostituita");
  await page.getByTestId("ops-nav-toggle").click();
  await expect(page.getByTestId("ops-nav-status")).toContainText("Navigazione attiva");
  await expect(page.getByTestId("ops-nav-gps")).toHaveAttribute("data-gps", "fix", { timeout: 20_000 });
  await expect(page.getByTestId("ops-nav-gps")).toContainText("precisione");
  await expect(page.getByTestId("ops-nav-voice-state")).toContainText("Voce:");
  await expect.poll(() => page.evaluate(() => (window as any).__sp.length), { timeout: 20_000 }).toBeGreaterThan(0);
  const said = await page.evaluate(() => (window as any).__sp[0]);
  expect(said.lang).toBe("it-IT");
  expect(said.text, "the departure, said as an instruction").toMatch(/^(Tra \d+ metri, )?\S/);
  expect(said.text).not.toMatch(/^Tra 0 metri/);
  const voices = await page.evaluate(() => speechSynthesis.getVoices().filter((v) => /^it/i.test(v.lang)).length);
  if (voices) expect(said.voice, "an Italian voice of the device").toMatch(/^it/i);
  await page.getByTestId("ops-nav-voice").click();
  await expect(page.getByTestId("ops-nav-voice-state")).toContainText("disattivata");
  await page.getByTestId("ops-nav-toggle").click();
  await expect(page.getByTestId("ops-nav-active")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("ops-route")?.serialize().data.geometry?.coordinates?.length ?? 0), "the route stays drawn").toBeGreaterThan(10);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("the selection: named on the map, its ring opens the card, × ends it (the trail stays); the source's own record linked", async ({ page }) => {
  const errors = await open(page);
  const input = page.locator("#nexum-search");
  await input.click(); await input.fill("Cesare Rossi Airfield");
  await page.locator("#nexum-results [data-ref]").first().click({ timeout: 30_000 });
  await expect(page.getByTestId("focus-head")).toContainText("Cesare Rossi Airfield", { timeout: 30_000 });
  await expect(page.getByTestId("selection-chip")).toContainText("Selezione attiva: Cesare Rossi Airfield");
  await expect(page.getByTestId("record-link")).toHaveAttribute("href", "https://ourairports.com/airports/IT-0280/");
  // the ring: a click on it opens the card (closed here first)
  await page.evaluate(() => (window as any).__nexum.store.set({ inspectorOpen: false }));
  await page.waitForTimeout(800);
  const xy = await page.evaluate(() => { const m = (window as any).__nexum.map; const f = m.getSource("nexum-sel").serialize().data.features[0];
    const q = m.project(f.geometry.coordinates), r = m.getCanvas().getBoundingClientRect(); return [r.left + q.x + 11, r.top + q.y]; });
  await page.mouse.click(xy[0], xy[1]);
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().inspectorOpen)).toBe(true);
  // × ends the selection: no outline, no ring; the trail keeps its step
  await page.getByTestId("selection-clear").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBeNull();
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("nexum-sel").serialize().data.features.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__nexum.store.get().trail.steps.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("tablet: the selection named in the strip with × to end it; phone: the card names it and ⌂ ends it", async ({ page }) => {
  await open(page, { width: 1000, height: 700 });
  const sel = async () => { const id = await page.evaluate(async () => { const r = await (window as any).__nexum.apiFetch("/search?q=Italy");
    return (r.body.data.groups as any[]).find((x) => x.type === "place.country").items[0].id; });
    await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), id);
    await page.waitForFunction(() => { const n = (window as any).__nexum; return n.store.entity(n.store.get().focus)?.label === "Italy"; }, null, { timeout: 30_000 }); };
  await sel();
  await page.evaluate(() => (window as any).__nexum.store.set({ inspectorOpen: false }));
  await expect(page.getByTestId("card-strip")).toContainText("Selezione:");
  await page.getByTestId("card-strip").getByTestId("selection-clear").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBeNull();
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("nexum-focus-geom").serialize().data.type)).toBe("FeatureCollection");
  // phone: the sheet card names the selection; ⌂ ends it (outline gone)
  await page.setViewportSize({ width: 412, height: 860 });
  await page.waitForTimeout(800);
  await sel();
  await expect(page.getByTestId("tb-title")).toContainText("Italy", { timeout: 20_000 });
  await page.getByTestId("tb-home").click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().focus)).toBeNull();
  expect(await page.evaluate(() => (window as any).__nexum.map.getSource("nexum-focus-geom").serialize().data.type)).toBe("FeatureCollection");
});

test("registers: every row of OFAC, KEV, INFORM and DeFi opens its detail with the register's link; INFORM links the NEXUM country by its exact name", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "registers" }));
  const expectFor: Record<string, RegExp> = { sanctions: /sanctionssearch\.ofac\.treas\.gov\/Details\.aspx\?id=\d+/, kev: /cve\.org\/CVERecord\?id=CVE-/, inform: /drmkc\.jrc\.ec\.europa\.eu/, hacks: /defillama\.com|https?:\/\// };
  for (const t of ["sanctions", "kev", "inform", "hacks"]) {
    await page.getByTestId(`ops-reg-tab-${t}`).click();
    await expect(page.getByTestId("ops-reg-row").first()).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("ops-reg-row").nth(1).click();
    const d = page.getByTestId("ops-reg-detail");
    await expect(d).toHaveAttribute("data-tab", t);
    expect(await d.locator("dt").count(), `${t}: fields`).toBeGreaterThan(1);
    expect(await page.getByTestId("ops-reg-link").first().getAttribute("href")).toMatch(expectFor[t]);
    await expect(page.getByTestId("ops-reg-detail-title")).not.toHaveText("");
    if (t === "inform") await expect(page.getByTestId("ops-reg-nexum")).not.toContainText("Ricerca", { timeout: 20_000 });
    await page.getByTestId("ops-reg-detail-close").click();
    await expect(d).toHaveCount(0);
  }
  // INFORM: a country found by its exact official name opens in NEXUM
  await page.getByTestId("ops-reg-tab-inform").click();
  await page.getByTestId("ops-reg-q").fill("ITA");
  await page.getByTestId("ops-reg-row").first().click();
  await expect(page.getByTestId("ops-reg-nexum")).toContainText("In NEXUM: Italy", { timeout: 20_000 });
  await page.getByTestId("ops-reg-nexum").getByRole("button", { name: "Italy" }).click();
  await expect(page.getByTestId("focus-head")).toContainText("Italy", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("passive network lookups: inputs checked before any request, structured answers with source and time; CT only as links", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => { if (/dns\.google|rdap\.org|stat\.ripe\.net|cveawg\.mitre\.org|crt\.sh|certspotter/.test(r.url())) asked.push(r.url()); });
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "net" }));
  const kind = page.getByTestId("ops-net-kind"), q = page.getByTestId("ops-net-q");
  // invalid inputs: said, no request
  for (const [k, v] of [["dns", "193.0.6.139"], ["ripe", "example.com"], ["flaw", "log4j"], ["tor", "example.com"]]) {
    await kind.selectOption(k); await q.fill(v);
    await expect(page.getByTestId("ops-net-invalid")).toBeVisible();
    await expect(page.getByTestId("ops-net-go")).toBeDisabled();
  }
  expect(asked, "no request for an invalid input").toEqual([]);
  // valid inputs: structured answers
  for (const [k, v, field] of [["dns", "example.com", "A"], ["rdap", "193.0.6.139", "handle"], ["ripe", "AS3333", "titolare"], ["flaw", "CVE-2021-44228", "titolo"]]) {
    await kind.selectOption(k); await q.fill(v);
    await page.getByTestId("ops-net-go").click();
    const out = page.getByTestId("ops-net-out");
    await expect(out).toHaveAttribute("data-error", "false", { timeout: 30_000 });
    await expect(out).toContainText("fonte:");
    await expect(out).toContainText("chiesto alle");
    await expect(out.locator("dt", { hasText: field }).first()).toBeVisible();
  }
  // the example fills the input
  await kind.selectOption("rdap");
  await page.getByTestId("ops-net-accepts").locator("button").click();
  await expect(q).toHaveValue("example.com");
  // CT: links to the services' own pages, never an automated request
  await kind.selectOption("ct"); await q.fill("example.com");
  await expect(page.getByTestId("ops-net-ct").locator("a").first()).toHaveAttribute("href", "https://crt.sh/?q=example.com");
  expect(asked.filter((u) => /crt\.sh|certspotter/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
});

test("summary of the facts: composed by NEXUM from the card's facts, with their sources — no language model, no download", async ({ page }) => {
  const dl: string[] = [];
  page.on("request", (r) => { if (/huggingface|hf\.co|mlc|web-llm/.test(r.url())) dl.push(r.url()); });
  const errors = await open(page);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "ai" }));
  await expect(page.getByTestId("ops-ai-about")).toContainText("Nessun modello linguistico");
  await expect(page.getByTestId("ops-ai-none")).toBeVisible();
  // a country: its source's fields, its latest indicators (as in the card), each with its source
  const id = await page.evaluate(async () => { const r = await (window as any).__nexum.apiFetch("/search?q=Italy");
    return (r.body.data.groups as any[]).find((x) => x.type === "place.country").items[0].id; });
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), id);
  const sum = page.getByTestId("ops-ai-summary");
  await expect(page.getByTestId("ops-ai-head")).toContainText("Italy", { timeout: 30_000 });
  await expect(sum).toContainText("Indicatori più recenti", { timeout: 30_000 });
  // the same value as the card shows (copied, never rephrased)
  const cardPop = await page.locator('[data-testid="ov-key"][data-indicator]').first().locator(".obs-v").textContent().catch(() => null);
  if (cardPop) await expect(sum).toContainText(cardPop.trim());
  for (const li of await sum.locator("li").allTextContents()) expect(li, "every fact with its source").toContain(" · ");
  // an airfield: the source's own fields
  const input = page.locator("#nexum-search");
  await input.click(); await input.fill("Cesare Rossi Airfield");
  await page.locator("#nexum-results [data-ref]").first().click({ timeout: 30_000 });
  await expect(page.getByTestId("ops-ai-head")).toContainText("Cesare Rossi Airfield", { timeout: 30_000 });
  await expect(sum).toContainText("Montegiorgio (AP)");
  await expect(sum).toContainText("OurAirports");
  await expect(sum).not.toContainText("GENERATO");
  expect(dl, "no model download").toEqual([]);
  expect(errors).toEqual([]);
});
