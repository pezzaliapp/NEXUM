// NASA FIRMS hotspots drawn as ACTIVE FIRES only within the last 24 hours (2026-10-21): the published table of the
// snapshot as it is (stale: detections of 3–4 October), a table with recent and old detections, the table unreachable,
// and the app offline (the service worker's stored table, filtered by the device's clock with no network); the two
// satellites' sources (2026-10-22), one suspended, said by name. The site is served by its own static server behind a
// loopback proxy that only rewrites the hotspots table (and, for the satellites' test, the status); every third-party
// request is stopped in the browser: nothing leaves this machine.
//   NEXUM_FIRMS_DIR=<assembled site> (default ../data/deploy/web)
import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const dir = path.resolve(ui, process.env.NEXUM_FIRMS_DIR ?? "../data/deploy/web");
const SITE = 8803, PROXY = 8800;
const BASE = `http://127.0.0.1:${PROXY}/`;
const TABLE = /^\/s\/[^/]+\/api\/tables\/hotspots\.json$/;
const STATUS = /^\/s\/[^/]+\/api\/status\.json$/;
// the published world's sources as after the split (2026-10-22): NOAA-21 fetched now, NOAA-20 suspended after errors
let split = false;
let server: ChildProcess, proxy: http.Server;
let mode: "as-is" | "mixed" | "down" = "as-is";
const H = 3_600_000;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16);
// three detections of the last 24 hours and two older ones (the 4 October table's own time among them)
const mixed = (now: number) => [[12.5, 41.9, 8.1, "h", utc(now - 1 * H), "S"], [23.7, 38, 4.2, "n", utc(now - 5 * H), "N"],
  [-120.5, 38.6, 30.4, "h", utc(now - 20 * H), "N"], [150.1, -33.8, 2.2, "n", utc(now - 48 * H), "S"], [-60.1, -10.2, 6.6, "n", "2026-10-04T16:20", "S"]];
test.describe.configure({ mode: "serial", timeout: 300_000 });

test.beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(SITE)], { stdio: "ignore" });
  proxy = http.createServer((req, res) => {
    const up = http.request({ host: "127.0.0.1", port: SITE, path: req.url, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${SITE}`, "accept-encoding": "identity" } }, (r) => {
      const u = (req.url ?? "").split("?")[0];
      if (split && STATUS.test(u)) {
        const chunks: Buffer[] = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const now = Date.now(), firms = body.data.sources.find((x: any) => x.source_id === "nasa.firms");
          Object.assign(firms, { health: "ok", last_success_ms: now - 2 * H });
          body.data.sources.push({ ...firms, source_id: "nasa.firms.noaa20", health: "suspended", last_success_ms: Date.parse("2026-10-19T06:00Z") });
          res.writeHead(200, { "content-type": "application/json", "cache-control": String(r.headers["cache-control"] ?? "no-cache") });
          res.end(JSON.stringify(body));
        });
        return;
      }
      if (!TABLE.test(u) || mode === "as-is") { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); return; }
      if (mode === "down") { r.resume(); res.writeHead(503, { "content-type": "text/plain" }); res.end("unavailable"); return; }
      const chunks: Buffer[] = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        body.data.rows = mixed(Date.now());
        const out = JSON.stringify(body);
        res.writeHead(200, { "content-type": "application/json", "cache-control": String(r.headers["cache-control"] ?? "no-cache") });
        res.end(out);
      });
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  }).listen(PROXY, "127.0.0.1");
  await new Promise((r) => setTimeout(r, 800));
});
test.afterAll(() => { server?.kill(); proxy?.close(); });

async function open(page: Page) {
  await page.context().route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
}
const hot = (page: Page) => page.evaluate(() => { const n = (window as any).__nexum;
  return { count: n.ops.get().counts.hotspots ?? 0, status: n.ops.get().hotStatus,
    times: (n.map.getSource("ops-hotspots")?.serialize().data.features ?? []).map((f: any) => f.properties.t) as string[] }; });
const layerOn = async (page: Page) => {
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.tool("layers"); o.layer("hotspots", true); });
  await expect.poll(async () => (await hot(page)).status, { timeout: 60_000 }).not.toBeNull();
  await expect(page.getByTestId("ops-layer-hotspots")).toBeChecked({ timeout: 30_000 });   // the layers panel, drawn
};

test("stale data (the snapshot's own table, 3–4 October): nothing drawn as an active fire, said as historical", async ({ page }) => {
  mode = "as-is";
  await open(page);
  await layerOn(page);
  const h = await hot(page);
  expect(h.count).toBe(0);
  expect(h.times).toEqual([]);
  expect(h.status.old).toBeGreaterThan(0);                              // the archive is still there, only not drawn
  await expect(page.getByTestId("ops-layer-hotspots-age")).toHaveText(/nessun rilevamento delle ultime 24 ore: i dati disponibili \(acquisiti .+\) sono storici e non sono mostrati come incendi attivi/);
  await expect(page.getByTestId("ops-layer-hotspots-age")).toHaveClass(/warn/);
  await expect(page.getByTestId("ops-layer-hotspots-state")).toContainText(/non aggiornati da \d+ giorni/);
});

test("recent data: only the detections of the last 24 hours; the older ones counted, kept in the archive", async ({ page }) => {
  mode = "mixed";
  await open(page);
  await layerOn(page);
  const h = await hot(page);
  expect(h.count).toBe(3);
  for (const t of h.times) expect(Date.now() - Date.parse(`${t}:00Z`)).toBeLessThanOrEqual(24 * H);
  expect(h.status).toMatchObject({ recent: 3, old: 2, error: false });
  await expect(page.getByTestId("ops-layer-hotspots-age")).toHaveText(" · 2 rilevamenti più vecchi di 24 ore non mostrati (restano nell'archivio)");
  // a detection's card says how long ago it was acquired
  const c = await page.evaluate(() => (window as any).__nexum.map.getSource("ops-hotspots").serialize().data.features[0].geometry.coordinates);
  await page.evaluate(([x, y]) => (window as any).__nexum.map.jumpTo({ center: [x, y], zoom: 8 }), c);
  await page.evaluate(() => (window as any).__nexum.ops.tool(null));
  await page.waitForTimeout(2500);
  const xy = await page.evaluate(([x, y]) => { const m = (window as any).__nexum.map; const p = m.project([x, y]); const r = m.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, c);
  await page.mouse.click(xy[0], xy[1]);
  await expect(page.getByTestId("ops-feat-fields")).toContainText(/Acquisito.*UTC \((meno di un'ora fa|1 ora fa|\d+ ore fa)\)/, { timeout: 10_000 });
});

test("one source per satellite: the suspended one is said by name, the other's recent detections drawn", async ({ page }) => {
  mode = "mixed";
  split = true;
  try {
    await open(page);
    await layerOn(page);
    expect((await hot(page)).count).toBe(3);
    await expect(page.getByTestId("ops-layer-hotspots-state")).toHaveText(" · NOAA-20: fonte sospesa dopo errori ripetuti (dati del 19 ott 2026)");
    await expect(page.getByTestId("ops-layer-hotspots-state")).toHaveClass(/warn/);
  } finally { split = false; }
});

test("source unreachable: said, nothing drawn as active", async ({ page }) => {
  mode = "down";
  await open(page);
  await layerOn(page);
  expect((await hot(page)).count).toBe(0);
  await expect(page.getByTestId("ops-layer-hotspots-age")).toHaveText(" · rilevamenti non disponibili ora: nessun punto mostrato come incendio attivo");
});

test("offline: the stored table, filtered by the device's clock with no network", async ({ context }) => {
  mode = "mixed";
  const first = await context.newPage();
  await open(first);
  await first.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
  await first.close();
  // a second visit in a new tab, as the app is used: controlled from the start, what it loads is stored by the worker
  const page = await context.newPage();
  await open(page);
  await layerOn(page);                                                  // the table and the layers panel, stored
  expect((await hot(page)).count).toBe(3);
  const t0 = Date.now();
  await context.setOffline(true);
  mode = "down";                                                        // and even the server would no longer answer
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  await expect.poll(async () => (await hot(page)).count, { timeout: 60_000 }).toBe(3);   // the layer was saved on
  // 21 hours later (the clock only): the 5- and 20-hour-old detections have turned older than 24 hours
  const again = async () => { await page.evaluate(() => (window as any).__nexum.ops.layer("hotspots", false));
    await page.evaluate(() => (window as any).__nexum.ops.layer("hotspots", true));
    await expect.poll(async () => (await hot(page)).status, { timeout: 30_000 }).not.toBeNull(); };
  await page.clock.setFixedTime(t0 + 21 * H);
  await again();
  expect(await hot(page)).toMatchObject({ count: 1, status: { recent: 1, old: 4, error: false } });
  // 25 hours later: none is recent — said as historical, still offline
  await page.clock.setFixedTime(t0 + 25 * H);
  await again();
  expect((await hot(page)).count).toBe(0);
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "layers" }));
  await expect(page.getByTestId("ops-layer-hotspots-age")).toContainText("sono storici e non sono mostrati come incendi attivi");
});
