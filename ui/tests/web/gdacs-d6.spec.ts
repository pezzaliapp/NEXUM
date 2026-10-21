// D6 — GDACS SUSPENDED (2026-10-21): no request reaches gdacs.org, whatever the person does with the features that
// asked it (the «Allerte e notizie» panel and its refresh and tabs, the GDACS layer — also from a saved state and from
// a shared link — and an area watching the live alerts); the panel says the source is suspended, never live; the CSP
// does not allow the host. Every third-party request is stopped in the browser: nothing leaves this machine.
//   NEXUM_D6_DIR=<assembled site> (default ../data/deploy/web)
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const dir = path.resolve(ui, process.env.NEXUM_D6_DIR ?? "../data/deploy/web");
const PORT = 8795;
const BASE = `http://127.0.0.1:${PORT}/`;
const GDACS = /gdacs\.org/i;
let server: ChildProcess;
test.describe.configure({ timeout: 300_000 });

test.beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
});
test.afterAll(() => { server?.kill(); });

test("the site's CSP does not allow gdacs.org", async ({ request }) => {
  const html = await (await request.get(BASE)).text();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  expect(csp).toContain("connect-src");
  expect(csp).not.toMatch(GDACS);
  expect(await (await request.get(`${BASE}_headers`)).text().catch(() => "")).not.toMatch(GDACS);
});

test("zero requests to GDACS: alerts panel, refresh, tabs, layer (saved, linked, asked) and area watch", async ({ page, context }) => {
  const hits: string[] = [];
  // 1. the network: every request of the page and of its service worker; third parties stopped, GDACS counted
  context.on("request", (r) => { if (GDACS.test(r.url())) hits.push(`request ${r.url()}`); });
  await context.route((u) => !u.href.startsWith(BASE), (r) => { if (GDACS.test(r.request().url())) hits.push(`route ${r.request().url()}`); return r.abort(); });
  // 2. the attempts the CSP would stop before the network: fetch, XHR and the CSP's own reports
  await page.addInitScript(() => {
    const w = window as any, seen: string[] = (w.__gdacs = []);
    const f = w.fetch.bind(w);
    w.fetch = (i: any, o?: any) => { const u = String(i?.url ?? i); if (/gdacs\.org/i.test(u)) seen.push(`fetch ${u}`); return f(i, o); };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, m: string, u: string | URL, ...rest: any[]) {
      if (/gdacs\.org/i.test(String(u))) seen.push(`xhr ${u}`);
      return (open as any).call(this, m, u, ...rest);
    } as any;
    document.addEventListener("securitypolicyviolation", (e) => { if (/gdacs\.org/i.test(e.blockedURI)) seen.push(`csp ${e.blockedURI}`); });
  });
  page.on("console", (m) => { if (GDACS.test(m.text())) hits.push(`console ${m.text().slice(0, 200)}`); });
  const all = async () => [...hits, ...await page.evaluate(() => (window as any).__gdacs as string[]).catch(() => [])];

  // a saved state with the GDACS layer on, and a shared link asking for it, read by a real new load of the page (a
  // change of the # alone reloads nothing): the saved buildings off and the linked quakes on prove both were read
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.setItem("nexum.ops.v1", JSON.stringify({ layers: { gdacs: true, buildings: false } })); });
  await page.goto("about:blank");
  await page.goto(`${BASE}#v=150,10,1.6&l=gdacs,quakes`);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  const layers = () => page.evaluate(() => (window as any).__nexum.ops.get().layers);
  const ops = async () => (await layers()).gdacs as boolean;
  expect(await layers()).toMatchObject({ gdacs: false, buildings: false, quakes: true });

  // the layer: shown, cannot be turned on, says why; asked by code, it stays off
  await page.evaluate(() => (window as any).__nexum.ops.tool("layers"));
  const sw = page.getByTestId("ops-layer-gdacs");
  await expect(sw).toBeDisabled();
  await expect(sw).not.toBeChecked();
  await expect(page.getByTestId("ops-layer-gdacs-off")).toContainText("sospese");
  await page.evaluate(() => (window as any).__nexum.ops.layer("gdacs", true));
  expect(await ops()).toBe(false);

  // the alerts panel: GDACS said suspended, no GDACS item, no "in corso" count; refresh and every tab
  await page.evaluate(() => (window as any).__nexum.ops.tool("alerts"));
  await expect(page.getByTestId("ops-alerts-gdacs-off")).toHaveText("GDACS sospese");
  await expect(page.getByTestId("ops-alerts-summary")).toContainText(/Ultime 24 ore: \d+ elementi/, { timeout: 60_000 });
  await expect(page.getByTestId("ops-alerts-summary")).not.toContainText("GDACS");
  await expect(page.getByTestId("ops-alerts-sources")).not.toContainText(/GDACS \d/);
  await page.getByTestId("ops-alerts-refresh").click();
  for (const t of ["verified", "reported", "order", "geo", "nexum", "all"]) await page.getByTestId(`ops-alerts-tab-${t}`).click();
  await expect(page.locator('[data-testid="ops-alert"][data-kind="gdacs"]')).toHaveCount(0);
  await expect(page.getByText("Allerte GDACS sospese").first()).toBeVisible();

  // an area watching the live alerts
  await page.getByTestId("ops-tool-draw").click();
  await page.getByTestId("ops-proj-flat").click();
  await page.waitForTimeout(800);
  await page.getByTestId("ops-draw-box").click();
  const b = (await page.getByTestId("map").boundingBox())!;
  await page.mouse.click(b.x + 120, b.y + 150); await page.waitForTimeout(400);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height - 80); await page.waitForTimeout(600);
  await expect(page.getByTestId("ops-shape")).toHaveCount(1);
  await page.getByTestId("ops-aoi-watch").check();
  await expect(page.getByTestId("ops-aoi-watch-log")).toContainText(/\d+ avvisi già dentro/, { timeout: 60_000 });
  await page.evaluate(() => localStorage.removeItem("nexum.aoi.shapes.v1"));

  // the layers' refresh period runs past one live tick's worth of work
  await page.waitForTimeout(5000);
  expect(await all()).toEqual([]);
});
