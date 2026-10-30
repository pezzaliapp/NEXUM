// "Cosa sta succedendo" says when this site was last published, apart from the day its sources delivered data, and past
// 48 hours without a publication says so (2026-10-30); an earthquake USGS deleted or merged into another is never listed
// (the Bonin M 7.0 told twice, the Vanuatu M 6.6). The site is served by its own static server behind a loopback proxy
// that may only age current.json; every third-party request is stopped in the browser: nothing leaves this machine.
//   NEXUM_PUBLISHED_DIR=<assembled site> (default ../data/deploy/web)
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const dir = path.resolve(ui, process.env.NEXUM_PUBLISHED_DIR ?? "../data/deploy/web");
const SITE = 8807, PROXY = 8806;
const BASE = `http://127.0.0.1:${PROXY}/`;
let server: ChildProcess, proxy: http.Server;
let agedHours = 0;
test.describe.configure({ mode: "serial", timeout: 300_000 });

test.beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(SITE)], { stdio: "ignore" });
  proxy = http.createServer((req, res) => {
    const up = http.request({ host: "127.0.0.1", port: SITE, path: req.url, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${SITE}`, "accept-encoding": "identity" } }, (r) => {
      if ((req.url ?? "").split("?")[0] !== "/current.json" || !agedHours) { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); return; }
      const chunks: Buffer[] = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        body.built_utc = new Date(Date.now() - agedHours * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" });
        res.end(JSON.stringify(body));
      });
    });
    up.on("error", () => { res.writeHead(502); res.end(); });              // the site not up yet
    req.pipe(up);
  }).listen(PROXY, "127.0.0.1");
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(BASE + "current.json")).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
});
test.afterAll(async () => { server?.kill(); proxy?.close(); });

async function open(page: import("@playwright/test").Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(BASE);
  await expect(page.getByTestId("highlights")).toBeVisible({ timeout: 120_000 });
  return page.getByTestId("published-line");
}

test("the last publication and the day of the data, two dates; no earthquake withdrawn by USGS", async ({ page }) => {
  agedHours = 0;
  const line = await open(page);
  await expect(line).toBeVisible();
  const built = await (await fetch(BASE + "current.json")).json();
  await expect(line).toHaveAttribute("data-built", built.built_utc);
  await expect(line).toHaveAttribute("data-stale", "0");
  await expect(line).toContainText(`Ultima pubblicazione: ${built.built_utc.replace("T", " ").slice(0, 16)} UTC`);
  await expect(line).toContainText("dati ricevuti dalle fonti fino al");
  await expect(line).not.toContainText("48 ore");
  const listed = await page.locator('[data-testid="hl-recent"] .disc-text, [data-testid="hl-strongest"] .disc-text').allTextContents();
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.filter((t) => t.startsWith("M 7.0 - Bonin Islands"))).toEqual([]);
  expect(listed.filter((t) => t.includes("cancellato dalla fonte"))).toEqual([]);
  expect(listed).not.toContain("M 6.6 - 195 km NW of Port-Olry, Vanuatu");
  const recent = await page.locator('[data-testid="hl-recent"] .disc-text').allTextContents();
  expect(new Set(recent).size).toBe(recent.length);                      // no event told twice among the recent ones
});

test("past 48 hours without a publication the line says so", async ({ page }) => {
  agedHours = 60;
  const line = await open(page);
  await expect(line).toHaveAttribute("data-stale", "1");
  await expect(line).toHaveClass(/warn/);
  await expect(line).toContainText("2 giorni fa");
  await expect(line).toContainText("nessuna pubblicazione da oltre 48 ore");
});
