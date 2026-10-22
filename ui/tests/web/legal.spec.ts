// LEGAL NOTICES (2026-10-20, licence audit A1, A6): the site carries the full licence text and copyright notice of every
// third-party package it distributes, and Aiuto links to them; opening the notices (a plain-text document) never
// replaces the app's page kept by the service worker.
//   NEXUM_LEGAL_DIR=<assembled site> (default ../data/deploy/web)
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const dir = path.resolve(ui, process.env.NEXUM_LEGAL_DIR ?? "../data/deploy/web");
const PORT = 8794;
const BASE = `http://127.0.0.1:${PORT}/`;
let server: ChildProcess;
test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
});
test.afterAll(() => { server?.kill(); });

test("the notices hold the licence text of every distributed package", async ({ request }) => {
  const res = await request.get(`${BASE}THIRD-PARTY-NOTICES.txt`);
  expect(res.status()).toBe(200);
  const t = await res.text();
  expect(t).toContain("Copyright (c) 2026 Alessandro Pezzali");
  expect(t).toContain("Permission is hereby granted");
  const listed = [...t.split("TESTI DELLE LICENZE")[0].matchAll(/^- (\S+) (\S+) — (.+?) — https:\/\/registry\.npmjs\.org\//gm)];
  expect(listed.length).toBeGreaterThan(30);
  const texts = t.split("TESTI DELLE LICENZE")[1];
  for (const [, name, version, licence] of listed) expect(texts, name).toContain(`\n${name} ${version} — ${licence}\n`);
  expect(t).toContain("UNICODE LICENSE V3");
  expect(t).toContain("CONDIZIONI SHARE-ALIKE");
  expect(t).toContain("Apache License");
  // NASA FIRMS (2026-10-22): the acknowledgement FIRMS asks for and a link to the LANCE disclaimer (README FIRMS, §4)
  expect(t).toContain("We acknowledge the use of imagery from the NASA LANCE FIRMS");
  expect(t).toContain("https://www.earthdata.nasa.gov/data/projects/lance/disclaimer");
  expect(t).toMatch(/^- NASA FIRMS .*\(nasa\.firms\) — nasa-open-data — Hotspots: NASA FIRMS \(LANCE\)/m);
});

test("Aiuto links the notices; opening them keeps the app's stored page", async ({ page, context }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.ops.tool("help"));
  const legal = page.getByTestId("help-legal");
  await expect(legal).toBeVisible();
  await expect(legal.getByRole("link", { name: /software e dati di terzi/ })).toHaveAttribute("href", "/THIRD-PARTY-NOTICES.txt");
  await expect(legal).toContainText("Alessandro Pezzali");
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
  const [doc] = await Promise.all([context.waitForEvent("page"), legal.getByRole("link", { name: /software e dati di terzi/ }).click()]);
  await doc.waitForLoadState();
  await expect(doc.locator("body")).toContainText("SOFTWARE DI TERZE PARTI");
  await doc.close();
  const pages = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) { const r = await (await caches.open(k)).match("/"); if (r) out.push(await r.text()); }
    return out;
  });
  expect(pages.length).toBeGreaterThan(0);
  for (const p of pages) expect(p.toLowerCase()).toContain("<!doctype html");
});
