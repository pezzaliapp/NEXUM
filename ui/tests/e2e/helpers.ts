import { expect, type Page } from "@playwright/test";
import fs from "node:fs";

export const FX = JSON.parse(fs.readFileSync(new URL("../../../bench/phase2/fixtures.json", import.meta.url), "utf8"));
export const URL_OF: Record<string, string> = {
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
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) {
      external.push(route.request().url());
      return opts.blockExternal ? route.abort() : route.continue();
    }
    return route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL_OF[world]);
  await expect(page.locator(".app")).toBeVisible();
  const st = await (await page.request.get(new URL(URL_OF[world]).origin + "/api/v1/status")).json();
  if (!st.data.has_geometry) await expect(page.getByTestId("focus-head")).toBeVisible();   // D8 initial GRAPH focus
  return { external, errors };
}

export async function api(page: Page, path: string) {
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
