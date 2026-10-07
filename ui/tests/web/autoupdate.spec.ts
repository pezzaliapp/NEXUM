// AUTOMATIC UPDATE, end to end (2026-10-06, master pass): two real builds, A and B, served by the Pages-like host;
// the page runs A (service worker installed and in control), then B is deployed under it (the folder is swapped, as a
// deploy replaces the site). Checked on desktop Chrome, Samsung/Chrome (mobile), Fold closed and iPhone/Safari (WebKit):
//   resume     the app comes back to the screen        → becomes B by itself, view and local data kept
//   reopen     the app is closed and opened again        → opens B at once (the worker never pins A)
//   idle       left open, untouched                      → becomes B after the idle time
//   visible    in use when B arrives → "Nuova versione disponibile" (running build shown) → AGGIORNA ORA → B, confirmed
//   chunk      a tool whose code moved in B is opened    → the notice (never a reload under the finger) → AGGIORNA ORA → B
//   offline    the host unreachable: the app still opens (A); reachable again → becomes B
//   loop       the host keeps saying "newer" (CDN lag)   → at most one reload, no loop
// Local data (localStorage, IndexedDB: the trail) is compared before and after every update.
import { expect, test, chromium, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const UI = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DATA = path.resolve(UI, "../data/deploy");
const LIVE = path.join(DATA, "upd-live"), A = path.join(DATA, "upd-A"), B = path.join(DATA, "upd-B");
const PORT = 8796, URL0 = `http://127.0.0.1:${PORT}/`;
let server: ChildProcess, buildA = "", buildB = "";

function assemble(out: string) {
  execSync(`node scripts/assemble-web.mjs --snapshot ../data/snapshot/live --out ${out}`, { cwd: UI, stdio: "ignore" });
  return JSON.parse(fs.readFileSync(path.join(out, "version.json"), "utf8")).build as string;
}
/** B's tools panel code under a new name (as a changed module gets a new hash): A's name is gone from the host. */
function renameLazyChunk(dir: string) {
  const assets = path.join(dir, "assets"), f = fs.readdirSync(assets).find((n) => /^Panels-.*\.js$/.test(n))!;
  const g = f.replace(/^Panels-/, "Panels-b");
  fs.renameSync(path.join(assets, f), path.join(assets, g));
  for (const n of fs.readdirSync(assets).filter((n) => n.endsWith(".js")))
    { const p = path.join(assets, n), t = fs.readFileSync(p, "utf8"); if (t.includes(f)) fs.writeFileSync(p, t.split(f).join(g)); }
  const sw = path.join(dir, "sw.js"); fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").split(f).join(g));
  return [f, g];
}
const deploy = (src: string) => { fs.rmSync(LIVE, { recursive: true, force: true }); fs.cpSync(src, LIVE, { recursive: true }); };

test.beforeAll(async () => {
  test.setTimeout(600_000);
  execSync("npm run build:web", { cwd: UI, stdio: "ignore" });
  buildA = assemble(A);
  execSync("npm run build:web", { cwd: UI, stdio: "ignore" });
  buildB = assemble(B);
  renameLazyChunk(B);
  expect(buildA).not.toBe(buildB);
  deploy(A);
  await startServer();
});
async function startServer() {
  server = spawn("node", ["scripts/serve-web.mjs", "--dir", LIVE, "--port", String(PORT)], { cwd: UI, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));
}
test.afterAll(() => { server?.kill(); for (const d of [LIVE, A, B]) fs.rmSync(d, { recursive: true, force: true }); });

const DEVICES = [
  { name: "desktop-chrome", engine: "chromium", opts: { viewport: { width: 1440, height: 900 } } },
  { name: "samsung-chrome", engine: "chromium", opts: { viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true } },
  { name: "fold-closed", engine: "chromium", opts: { viewport: { width: 344, height: 690 }, isMobile: true, hasTouch: true } },
  { name: "iphone-safari", engine: "webkit", opts: { viewport: { width: 430, height: 740 }, isMobile: true, hasTouch: true } },
] as const;

async function launch(engine: string): Promise<Browser> {
  return engine === "webkit" ? webkit.launch({ channel: undefined } as any) : chromium.launch({ channel: "chrome" });
}
async function openA(ctx: BrowserContext) {
  deploy(A);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.build), { timeout: 10_000 }).toBe(buildA);
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  // the worker installed and in control, the cache warmed
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
  // this build's worker settled (after a previous build's worker, a new one installs and takes over)
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r?.active && !r.installing && !r.waiting; }, null, { timeout: 30_000 });
  await page.waitForTimeout(3000);
  return { page, errors };
}
/** Local data the person owns: localStorage and every IndexedDB store's records (counted and hashed). */
const localData = (page: Page) => page.evaluate(async () => {
  const ls = Object.keys(localStorage).sort().map((k) => `${k}=${localStorage.getItem(k)?.length}`);
  const out: string[] = [];
  for (const d of (await (indexedDB as any).databases?.()) ?? []) {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    for (const s of Array.from(db.objectStoreNames)) {
      const all: any[] = await new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); });
      out.push(`${d.name}/${s}:${all.length}:${JSON.stringify(all).length}`);
    }
    db.close();
  }
  return { ls, idb: out };
});
const resume = (page: Page) => page.evaluate(() => {
  const set = (v: string) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); document.dispatchEvent(new Event("visibilitychange")); };
  set("hidden"); setTimeout(() => set("visible"), 300);
});
// each probe is time-limited: in WebKit an evaluation started as the page reloads never settles
const probe = (page: Page) => Promise.race([page.evaluate(() => (window as any).__nexum?.build).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2000))]);
// and the reload is let finish before probing (an evaluation in the middle of it disturbs WebKit's navigation)
/** The app ready after a reload, by time-limited probes (a wait installed while the page reloads can stall). */
const readyAgain = (page: Page) => expect.poll(() => Promise.race([page.evaluate(() => performance.getEntriesByName("nexum:ready").length > 0).catch(() => false),
  new Promise((r) => setTimeout(() => r(false), 2000))]), { timeout: 120_000, intervals: [1000] }).toBe(true);
const becomesB = async (page: Page, timeout = 30_000) => {
  await page.waitForEvent("load", { timeout: Math.min(timeout, 60_000) }).catch(() => {});
  await page.waitForTimeout(3000);   // (WebKit harness: an evaluation right after the reload reads the outgoing page)
  await expect.poll(() => probe(page), { timeout, intervals: [500] }).toBe(buildB);
};

for (const d of DEVICES) {
  test(`auto-update A → B · ${d.name}: resume, reopen, idle, moved chunk, offline → online, no loop, data kept`, async () => {
    test.setTimeout(600_000);
    const browser = await launch(d.engine);
    // WebKit: an on-disk profile, as on a phone (Playwright's in-memory WebKit profile drops its stored files once no page
    // of it has been open for a while, which no real device does)
    const prof = d.engine === "webkit" ? fs.mkdtempSync(path.join(DATA, "upd-prof-")) : "";
    const ctx = prof ? await webkit.launchPersistentContext(prof, { ...d.opts, channel: undefined } as any) : await browser.newContext({ ...d.opts });
    await ctx.route(/youtube|ytimg|googlevideo/, (r) => r.abort());

    // ── resume: the app comes back to the screen ──
    let { page, errors } = await openA(ctx);
    await page.evaluate(() => { localStorage.setItem("nexum.test.marker", "kept"); (window as any).__nexum.map.jumpTo({ center: [12.49, 41.89], zoom: 6 }); });
    // an element focused (the address carries it)
    await page.evaluate(() => { const s = (window as any).__nexum.store; const id = [...s.get().entities?.keys?.() ?? []][0]; if (id) s.select(id, "test"); });
    await page.waitForTimeout(800);
    const before = await localData(page), hashBefore = await page.evaluate(() => location.hash);
    deploy(B);
    await resume(page);
    await becomesB(page);
    await readyAgain(page);
    const after = await localData(page);
    const keys = (l: string[]) => l.map((x) => x.split("=")[0]);
    for (const k of keys(before.ls)) expect(keys(after.ls), `localStorage ${k}`).toContain(k);
    expect(await page.evaluate(() => localStorage.getItem("nexum.test.marker"))).toBe("kept");
    for (const s of before.idb) expect(after.idb, `IndexedDB ${s}`).toContain(s);
    // the view kept: focus (if any) and the camera
    const f = hashBefore.match(/^#\/f\/[^&]*/)?.[0];
    if (f) expect(await page.evaluate(() => location.hash)).toContain(f);
    const c = await page.evaluate(() => (window as any).__nexum.map.getCenter().toArray());
    expect(Math.abs(c[0] - 12.49) + Math.abs(c[1] - 41.89), "camera kept").toBeLessThan(0.5);
    expect(await page.evaluate(() => document.documentElement.dataset.build)).toBe(buildB);
    await page.close();

    // ── visible: the person is using the app when B arrives → the notice, AGGIORNA ORA, B running and said so ──
    ({ page } = await openA(ctx));
    deploy(B);
    const active = async () => { await page.mouse.move(200, 300); await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerdown"))); };
    await active();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));        // a check while in use: no automatic reload yet
    await expect(page.getByTestId("update-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("update-banner")).toContainText("Nuova versione disponibile");
    await expect(page.getByTestId("update-banner")).toContainText(buildA);             // the build actually running
    await expect(page.getByTestId("update-available")).toContainText(buildB);          // and the one available
    // nothing the person opened needed new code (warm-ups of the old build failing say nothing of the kind)
    await expect(page.getByTestId("update-banner")).not.toContainText("serve per aprire");
    expect(await probe(page)).toBe(buildA);
    await active();
    await page.getByTestId("update-now").click();
    await page.waitForEvent("load", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await expect.poll(() => probe(page), { timeout: 30_000 }).toBe(buildB);
    await expect(page.getByTestId("update-done")).toContainText(buildB);
    await expect(page.getByTestId("update-done")).toContainText(`prima ${buildA}`);
    await expect(page.getByTestId("update-banner")).toHaveCount(0);
    if (await page.getByTestId("tb-more").isVisible().catch(() => false)) {       // phone: the ⋯ menu says the running build
      await page.getByTestId("tb-more").click();
      await expect(page.getByTestId("menu-build")).toContainText(buildB);
    }
    expect(await page.evaluate(() => localStorage.getItem("nexum.test.marker"))).toBe("kept");
    await page.close();

    // ── propagation window (seen on Cloudflare): B's page served while B's script still answers 404 ──
    // (a fresh browser profile that has only ever seen A: nothing of B stored; its own browser — in Playwright's WebKit,
    // closing a second context empties the first one's stored files, which no real device does)
    const browserW = await launch(d.engine);
    const ctxW = await browserW.newContext({ ...d.opts });
    await ctxW.route(/youtube|ytimg|googlevideo/, (r) => r.abort());
    ({ page } = await openA(ctxW));
    deploy(B);
    const entryB = fs.readFileSync(path.join(LIVE, "index.html"), "utf8").match(/assets\/index-[\w-]+\.js/)![0];
    const held = path.join(DATA, "upd-held.js");
    fs.renameSync(path.join(LIVE, entryB), held);
    await page.mouse.move(210, 310); await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerdown")));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("update-banner")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("update-now").click();
    await expect(page.getByTestId("update-retrying")).toBeVisible({ timeout: 20_000 });   // stays on A, says why
    expect(await probe(page)).toBe(buildA);
    // a normal opening meanwhile: the working page (A), never a page that cannot start
    const other = await ctxW.newPage();
    await other.goto(URL0);
    await readyAgain(other);
    expect(await probe(other)).toBe(buildA);
    await other.close();
    // the script arrives: B by itself, confirmed
    fs.renameSync(held, path.join(LIVE, entryB));
    await becomesB(page, 60_000);
    await expect(page.getByTestId("update-done")).toContainText(buildB);
    await browserW.close();

    // ── reopen: closed and opened again ──
    ({ page } = await openA(ctx));
    deploy(B);
    await page.close();
    page = await ctx.newPage();
    await page.goto(URL0);
    await becomesB(page, 20_000);
    await page.close();

    // ── idle: left open and untouched ──
    ({ page } = await openA(ctx));
    deploy(B);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));      // a check happens (focus, interval…)
    await becomesB(page, 90_000);
    await page.close();

    // ── a tool whose code moved in B ──
    ({ page, errors } = await openA(ctx));
    deploy(B);
    await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "layers" }));
    // the tool's code is gone from the host: the notice (never a reload under the finger), then AGGIORNA ORA
    await expect(page.getByTestId("update-banner")).toContainText("serve per aprire questa funzione", { timeout: 20_000 });
    await page.getByTestId("update-now").click();
    await becomesB(page, 30_000);
    await readyAgain(page);
    await expect.poll(() => Promise.race([page.evaluate(() => !!(window as any).__nexum.ops).catch(() => false), new Promise((r) => setTimeout(() => r(false), 2000))]), { timeout: 60_000 }).toBe(true);
    await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "layers" }));
    await expect(page.getByTestId("ops-panel-layers")).toBeVisible({ timeout: 20_000 });   // the tool works in B
    await page.close();

    // ── offline → online ──
    ({ page } = await openA(ctx));
    // opened again (the worker now controls the page from the start: what the app reads is stored as it is read)
    await page.reload();
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
    await page.waitForTimeout(4000);
    // really offline: the host cannot be reached (an emulated offline stops WebKit before its service worker answers)
    server.kill();
    await new Promise((r) => setTimeout(r, 800));
    await page.reload();
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as any).__nexum.build), "offline: the stored app opens").toBe(buildA);
    deploy(B);
    await startServer();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await becomesB(page, 90_000);
    await page.close();

    // ── no loop: the host keeps announcing a build that never arrives ──
    deploy(B);
    page = await ctx.newPage();
    let loads = 0;
    page.on("load", () => loads++);
    await page.route("**/version.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ build: "never-arrives" }) }));
    await page.goto(URL0);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
    for (let i = 0; i < 4; i++) { await resume(page).catch(() => {}); await page.waitForTimeout(3000); }
    expect(loads, "one reload at most, then it stops").toBeLessThanOrEqual(2);
    await page.close();

    // accepted: a moved chunk's import failure (handled by the notice) and, in WebKit, the browser's own update check of
    // sw.js failing while the offline step makes the host unreachable (NEXUM's own sw.js requests all handle rejection)
    expect(errors.filter((e) => !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|sw\.js due to access control checks/.test(e))).toEqual([]);
    await ctx.close();
    await browser.close();
    if (prof) fs.rmSync(prof, { recursive: true, force: true });
  });
}
