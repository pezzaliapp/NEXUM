import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

export const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
// NEXUM_WEB=<url>: run the same tests against the online workspace (Phase 3 snapshot of world D1). The online
// deployment answers /api/v1 inside the page (snapshot worker), so direct API reads go through the page too, and
// worlds other than D1 are not published online (E7): their tests are skipped, not passed.
export const WEB = process.env.NEXUM_WEB ?? "";
export const URL_OF: Record<string, string> = WEB ? { d1: WEB } : {
  d1: process.env.NEXUM_D1 ?? "http://127.0.0.1:8765/",
  d3: process.env.NEXUM_D3 ?? "http://127.0.0.1:8766/",
  d2: process.env.NEXUM_D2 ?? "http://127.0.0.1:8767/",
  mixed: process.env.NEXUM_MIXED ?? "http://127.0.0.1:8768/",
  ubench: process.env.NEXUM_UBENCH ?? "http://127.0.0.1:8770/",
};

export async function open(page: Page, world: string, opts: { blockExternal?: boolean } = {}) {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const own = ["127.0.0.1", "localhost"].includes(u.hostname) || (!!WEB && u.origin === new URL(WEB).origin);
    if (!own && !["data:", "blob:"].includes(u.protocol)) {
      external.push(route.request().url());
      return opts.blockExternal ? route.abort() : route.continue();
    }
    return route.continue();
  });
  test.skip(!!WEB && world !== "d1", `world ${world} is not published online (E7)`);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL_OF[world]);
  await expect(page.locator(".app")).toBeVisible();
  const st = WEB ? await webApi(page, "/status") : await (await page.request.get(new URL(URL_OF[world]).origin + "/api/v1/status")).json();
  if (!st.data.has_geometry) await expect(page.getByTestId("focus-head")).toBeVisible();   // D8 initial GRAPH focus
  return { external, errors };
}

async function webApi(page: Page, path: string) {
  await page.waitForFunction(() => !!(window as any).__nexum?.apiFetch);
  const r = await page.evaluate((p) => (window as any).__nexum.apiFetch(p), path);
  expect(r.status, path).toBeLessThan(300);
  return r.body;
}

export async function api(page: Page, path: string) {
  if (WEB) return webApi(page, path);
  const base = new URL(page.url()).origin;
  const r = await page.request.get(base + "/api/v1" + path);
  expect(r.ok(), path).toBeTruthy();
  return r.json();
}

export async function select(page: Page, id: string, origin = "test", waitContext = true) {
  await page.evaluate(([i, o]) => (window as any).__nexum.store.select(i, o), [id, origin]);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  if (waitContext) await expect(page.locator('[data-section="relations"]')).toBeVisible();
}

export async function stage(page: Page, s: "map" | "graph" | "split") {
  await page.evaluate((x) => (window as any).__nexum.store.set({ stage: x }), s);
}

export const focusOf = (page: Page) => page.getByTestId("focus-head").getAttribute("data-focus");

/** Wait for a /api/v1 request of the page whose URL contains every given part (online: the snapshot worker's
 *  request log — the page answers /api/v1 itself, so there is no network request to observe). */
export async function waitForApi(page: Page, parts: string[]): Promise<void> {
  if (!WEB) { await page.waitForRequest((r) => parts.every((x) => r.url().includes(x))); return; }
  const from = await page.evaluate(() => (window as any).__nexum.apiLog.length);
  await page.waitForFunction(([ps, n]) => (window as any).__nexum.apiLog.slice(n as number)
    .some((u: string) => (ps as string[]).every((x) => decodeURIComponent(u).includes(x))), [parts, from] as const);
}
