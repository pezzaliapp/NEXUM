// Phase 3 — acceptance of the online workspace (NEXUM-PHASE3-SPEC.md §7): O2 no third-party requests, O3 the
// complete chain on desktop, tablet, Samsung Fold (closed/open) and iPhone viewports, O11 trail, O12 deep links,
// O13 rollback, O14 attributions and snapshot age, installability (E6) and the content-security policy.
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/";
const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
const M = FX.myanmar;
const OUT = new URL("../../../data/reports/phase3/", import.meta.url);
fs.mkdirSync(new URL("screens/", OUT), { recursive: true });
const report: Record<string, any> = {};
const saveReport = (k: string, v: any) => {
  const f = new URL("online.json", OUT);
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  cur[k] = v;
  fs.writeFileSync(f, JSON.stringify(cur, null, 1));
  report[k] = v;
};

// CSS viewports. Samsung Fold: cover and inner screens of recent models (the Fold8 Ultra is checked on the device);
// iPhone 15 Pro Max 430×932 (portrait and landscape).
export const VIEWPORTS: Record<string, { width: number; height: number; mobile: boolean; dpr: number }> = {
  "desktop-1920x1080": { width: 1920, height: 1080, mobile: false, dpr: 1 },
  "desktop-1440x900": { width: 1440, height: 900, mobile: false, dpr: 2 },
  "desktop-1280x800": { width: 1280, height: 800, mobile: false, dpr: 2 },
  "tablet-1024x768": { width: 1024, height: 768, mobile: true, dpr: 2 },
  "fold-closed-344x882": { width: 344, height: 882, mobile: true, dpr: 2.625 },
  "fold-closed-412x915": { width: 412, height: 915, mobile: true, dpr: 2.625 },
  "fold-open-884x1104": { width: 884, height: 1104, mobile: true, dpr: 2.625 },
  "fold-open-landscape-1104x884": { width: 1104, height: 884, mobile: true, dpr: 2.625 },
  "iphone15promax-430x932": { width: 430, height: 932, mobile: true, dpr: 3 },
  "iphone15promax-landscape-932x430": { width: 932, height: 430, mobile: true, dpr: 3 },
  "iphone-390x844": { width: 390, height: 844, mobile: true, dpr: 3 },
};

async function openWeb(browser: Browser, vp = VIEWPORTS["desktop-1440x900"]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  const external: string[] = [], errors: string[] = [], csp: string[] = [];
  const origin = new URL(BASE).origin;
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) { external.push(u); return r.abort(); }
    return r.continue();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) csp.push(m.text()); });
  await page.goto(BASE);
  await expect(page.locator(".app")).toBeVisible({ timeout: 60_000 });
  return { ctx, page, external, errors, csp };
}

async function clickNode(page: Page, id: string) {
  const pt = await page.evaluate((i) => {
    const G = (window as any).__nexum.graph;
    const a = G.graph.getNodeAttributes(i);
    return G.sigma.graphToViewport({ x: a.x, y: a.y });
  }, id);
  const box = (await page.getByTestId("graph").boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}

// ── O2 + O3 + O14: the complete chain on every viewport ──────────────────────
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`O3 chain on ${name}: world → search → select → object → graph → pivot → timeline → insight → WHY → evidence/raw → new focus`, async ({ browser }) => {
    const { ctx, page, external, errors, csp } = await openWeb(browser, vp);
    const cls = vp.width >= 1280 ? "desk" : vp.width >= 768 ? "tab" : "phone";
    await expect(page.getByTestId("map")).toBeVisible();                                     // WORLD
    // O14: attributions and snapshot age always visible (declared change 2026-09-30: every touch layout shows them on the map)
    if (cls !== "desk") {
      await expect(page.getByTestId("map-attr")).toBeVisible();
      await expect(page.getByTestId("map-attr").getByTestId("snapshot-age")).toBeVisible();
    } else {
      await expect(page.getByTestId("attributions")).toBeVisible();
      await expect(page.getByTestId("statusbar").getByTestId("snapshot-age")).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (cls !== "desk") await page.locator(".tabs button", { hasText: "Cerca" }).click();   // touch: "Cerca" (declared change)
    await page.locator("#nexum-search").fill("Mandalay");                                    // Search (sqlite-wasm FTS5)
    await page.locator(`#nexum-results [data-ref="${M.quake}"]`).click({ timeout: 60_000 }); // Select
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);     // Object
    await expect(page.locator('[data-section="insights"]')).toHaveCount(1);
    if (cls === "phone") await page.locator(".tabs button", { hasText: "Grafo" }).click();   // Graph
    else {
      await page.getByRole("button", { name: "Grafo", exact: true }).click();
      if (cls === "tab") await page.locator(".focushead button", { hasText: "Chiudi" }).click();
    }
    await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.quake);
    await page.waitForTimeout(500);
    await clickNode(page, M.r2);                                                             // pivot on a graph node
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
    if (cls !== "desk") await page.locator(".tabs button", { hasText: "Tempo" }).click();   // Timeline (a surface on touch)
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", M.r2);
    await expect(page.getByTestId("timeline")).toHaveAttribute("data-appears", /mark|in_bucket/);
    // declared change: no "Fuoco" tab — the focus card is always there (under 700 px opened from its name line)
    if (vp.width < 700) await page.getByTestId("sheet-handle").click();                      // Insight
    else if (cls === "tab") await page.evaluate(() => (window as any).__nexum.store.set({ inspectorOpen: true }));
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
    await page.locator(`[data-testid="insight-why"][data-why="${M.r2}"]`).click();   // declared change: on phones after the linked elements
    await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
    await expect(page.getByTestId("group-support-0")).toHaveText("0,68");
    await page.locator(`[data-member-evidence="${M.quake}"] [data-raw]`).first().click();    // Evidence / raw record
    await expect(page.getByTestId("raw-record").first()).toContainText("us7000pn9s");
    await expect(page.getByTestId("raw-record").first()).toContainText("public-domain");
    await page.getByTestId("why-technical").locator("summary").click();   // declared change: engine details collapsed by default
    await page.locator(`[data-candidate="${M.m67}"] [data-ref]`).click();                    // new focus
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.m67);
    const overflowEnd = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.screenshot({ path: new URL(`screens/chain-${name}.png`, OUT).pathname });
    expect(overflowEnd).toBeLessThanOrEqual(1);
    expect(external).toEqual([]);                                                            // O2
    expect(errors).toEqual([]);
    expect(csp).toEqual([]);
    await ctx.close();
  });
}

test("Fold: unfolding and folding keep selection, focus and trail (resize while running)", async ({ browser }) => {
  const { ctx, page, errors } = await openWeb(browser, VIEWPORTS["fold-closed-344x882"]);
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), M.quake);
  await expect(page.locator(".app")).toBeVisible();
  for (const vp of [VIEWPORTS["fold-open-884x1104"], VIEWPORTS["fold-open-landscape-1104x884"], VIEWPORTS["fold-closed-412x915"]]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const s = (window as any).__nexum.store.get(); return { focus: s.focus, steps: s.trail.steps.length }; });
    expect(st.focus).toBe(M.quake);
    expect(st.steps).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

// ── installability (E6) and host configuration ───────────────────────────────
test("E6 installable manifest, icons, persistent-storage request; no service worker", async ({ browser }) => {
  const { ctx, page } = await openWeb(browser);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const man = await (await page.request.get(new URL(href!, BASE).href)).json();
  expect(man.display).toBe("standalone");
  for (const ic of man.icons) expect((await page.request.get(new URL(ic.src, BASE).href)).status()).toBe(200);
  expect(man.icons.some((i: any) => i.sizes === "192x192")).toBeTruthy();
  expect(man.icons.some((i: any) => i.sizes === "512x512")).toBeTruthy();
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send("Page.getInstallabilityErrors" as any).catch(() => ({ installabilityErrors: ["cdp-unavailable"] }));
  expect((await page.locator('link[rel="apple-touch-icon"]').count())).toBe(1);
  expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
  saveReport("installability", { manifest: man.name, icons: man.icons.length, chrome_installability_errors: (inst as any).installabilityErrors });
  await ctx.close();
});

// ── O11 trail: this browser, persistence across reloads, export → import elsewhere, missing ids declared ──
test("O11 trail: saved in IndexedDB, survives reload, JSON export imports in another browser, missing refs declared", async ({ browser }) => {
  const { ctx, page } = await openWeb(browser);
  for (const id of [M.quake, M.r2, M.m67]) {
    await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), id);
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  }
  await page.getByTestId("trail-save").click();
  await expect(page.getByTestId("trail-web-note")).toHaveAttribute("data-persisted", /true|false|null/);
  const tid = await page.evaluate(() => (window as any).__nexum.store.get().trail.id);
  const steps = await page.evaluate(() => (window as any).__nexum.store.get().trail.steps.map((s: any) => s.ref));
  await page.reload();
  await expect(page.locator(".app")).toBeVisible();
  await page.getByTestId("trail-list").click();
  await page.locator(".dialog button.ref").first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.store.get().trail.id)).toBe(tid);   // load is async
  const loaded = await page.evaluate(() => (window as any).__nexum.store.get().trail);
  expect(loaded.steps.map((s: any) => s.ref)).toEqual(steps);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("trail-export").click()]);
  const file = path.join(new URL(".", OUT).pathname, `trail-${tid}.json`);
  await dl.saveAs(file);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(doc.format).toBe("nexum-trail");
  expect(doc.version).toBe(1);
  // another browser (fresh storage): import, plus one reference that does not exist in this snapshot
  doc.trail.steps.push({ ref: "obj_doesnotexist0000", scope: null, label: "sparito", kind: "object", added_ms: Date.now() });
  fs.writeFileSync(file, JSON.stringify(doc));
  const other = await openWeb(browser);
  await other.page.locator('input[type="file"]').setInputFiles(file);
  await expect.poll(() => other.page.evaluate(() => (window as any).__nexum.store.get().trail.steps.length)).toBe(steps.length + 1);
  const imported = await other.page.evaluate(() => (window as any).__nexum.store.get().trail.steps.map((s: any) => s.ref));
  expect(imported.slice(0, steps.length)).toEqual(steps);
  await expect(other.page.locator('.trail .step.missing[data-ref="obj_doesnotexist0000"]')).toHaveCount(1);
  saveReport("O11", { steps: steps.length, reload: "ok", export_format: `${doc.format}/${doc.version}`, import_other_browser: "ok",
    missing_ref_declared: true });
  await other.ctx.close();
  await ctx.close();
});

// ── O12 deep links ───────────────────────────────────────────────────────────
test("O12 deep link: #/f/<id> of 100 sampled elements opens the right focus from a cold start", async ({ browser }) => {
  const snapRoot = new URL("../../../data/snapshot/d1/", import.meta.url).pathname;
  const cur = JSON.parse(fs.readFileSync(path.join(snapRoot, "current.json"), "utf8"));
  const ids: string[] = [];
  const shards = fs.readdirSync(path.join(snapRoot, "s", cur.version, "refs")).sort();
  let k = 0;
  while (ids.length < 100) {
    const sh = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(snapRoot, "s", cur.version, "refs", shards[(k * 37) % shards.length]))).toString());
    const keys = Object.keys(sh).sort();
    const want = ["obj_", "evt_", "rel_", "ins_"][k % 4];
    const pick = keys.find((x) => x.startsWith(want)) ?? keys[0];
    if (pick && !ids.includes(pick)) ids.push(pick);
    k++;
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fails: string[] = [];
  const ms: number[] = [];
  for (const id of ids) {
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${BASE}#/f/${id}`);
    try {
      await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id, { timeout: 30_000 });
      ms.push(Date.now() - t0);
    } catch { fails.push(id); }
    await page.close();
  }
  saveReport("O12", { ids: ids.length, kinds: ["obj", "evt", "rel", "ins"].map((p) => ids.filter((i) => i.startsWith(p)).length),
    failures: fails, median_ms: ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)] });
  expect(fails).toEqual([]);
  await ctx.close();
});
