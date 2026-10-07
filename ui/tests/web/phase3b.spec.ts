// PHASE 3B · blocks 1–5 on the online workspace (static snapshot): webcams (described first, the image asked to its
// source only on the person's action, from an explicit allowlist), public opinion and official statistics (value,
// period and source; an arrow only beyond the sampling error; reality and perception side by side, never merged),
// governments and heads (role facts with their statement; "during the term of" as context), fuel prices (31-state
// coverage said, never "world"), the German truck toll (the law's rate, the amount of a road's sections).
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const DEPLOY = new URL("../../../data/deploy/web-live/", import.meta.url);

async function open(page: Page, vp = { width: 1440, height: 900 }) {
  await page.setViewportSize(vp);
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
}
const api = (page: Page, path: string) => page.evaluate(async (p) => (await (window as any).__nexum.apiFetch(p)).body, path);
async function select(page: Page, id: string) {
  await page.evaluate((i) => (window as any).__nexum.store.select(i, "test"), id);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
}
async function search(page: Page, q: string, type: string, label?: RegExp): Promise<string> {
  const r = await api(page, `/search?q=${encodeURIComponent(q)}&b=${encodeURIComponent(JSON.stringify({ max_items: 50 }))}`);
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const items = [...arr(r.data.groups).flatMap((g: any) => arr(g.items)), ...arr(r.data.ranked), ...arr(r.data.items)];
  const hit = items.find((x: any) => x.type === type && (!label || label.test(x.label)));
  expect(hit, `${q} (${type})`).toBeTruthy();
  return hit.id;
}
/** The entity a package keys by an office's competence: Italy, found through its office's label (no hard-coded ID). */
async function italy(page: Page): Promise<string> {
  const t = await api(page, "/tenures");
  const off = Object.entries(t.data.offices as Record<string, any>).find(([, o]) => /Repubblica Italiana/.test(o.label))![0];
  const ents = Object.entries(t.data.by_entity as Record<string, string[]>).filter(([, v]) => v.includes(off)).map(([e]) => e);
  const obs = await api(page, "/observations");
  return ents.find((e) => obs.data.by_entity[e])!;
}

// declared change (2026-10-06, physical acceptance): tapping the camera IS the request — its image comes at once (no
// second button); nothing is asked to a publisher before the camera is opened
test("webcams: nothing asked before the camera is opened; opening it asks its image from its source at once", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => asked.push(r.url()));
  await open(page);
  // declared change (2026-10-04): Caltrans "Donner" now has its live video; a camera with a current still is used
  const cam = await search(page, "Kelikamera Helsinki", "camera.public_webcam");
  const hosts = (JSON.parse(fs.readFileSync(new URL("../../media-hosts.json", import.meta.url), "utf8")).img as string[]);
  const isImg = (u: string) => hosts.some((h) => u.startsWith(h));
  expect(asked.filter(isImg), "no image before the camera is opened").toEqual([]);
  await select(page, cam);
  await expect(page.getByTestId("media")).toBeVisible();
  await expect(page.getByTestId("cam-state-text")).toContainText("non un video");
  await expect(page.getByTestId("media-img").or(page.getByTestId("media-error"))).toBeVisible({ timeout: 30_000 });
  expect(asked.filter(isImg).length, "the image is asked to its source").toBeGreaterThan(0);
  const img = page.getByTestId("media-img");
  if (await img.count()) expect(await img.getAttribute("referrerpolicy")).toBe("no-referrer");
});

test("webcams: the published CSP lists the camera hosts explicitly, never img-src *", () => {
  // declared change (2026-10-04): the policy is published in the page (<meta http-equiv>), because Cloudflare Pages drops
  // a header value over 2,000 characters; the header keeps frame-ancestors (a <meta> policy cannot carry it)
  const headers = fs.readFileSync(new URL("_headers", DEPLOY), "utf8");
  expect(headers).toMatch(/Content-Security-Policy: frame-ancestors 'none'/);
  const page = fs.readFileSync(new URL("index.html", DEPLOY), "utf8");
  const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
  const img = csp.match(/img-src ([^;]+)/)![1];
  expect(img).not.toMatch(/(^|\s)\*(\s|$)/);
  expect(img).not.toMatch(/https:(\s|$)/);
  for (const h of (JSON.parse(fs.readFileSync(new URL("../../media-hosts.json", import.meta.url), "utf8")).img as string[])) expect(img).toContain(h);
});

test("Italy: opinion and official statistics with value, period and source; reality beside perception", async ({ page }) => {
  await open(page);
  const it = await italy(page);
  await select(page, it);
  // declared change (2026-10-03, WORLD DISCOVERY): the place's view has sections; opinion and reality are read in theirs
  await page.getByTestId("section-opinione").click();       // declared change (2026-10-03): Opinione section
  await expect(page.getByTestId("observations").first()).toBeVisible({ timeout: 30_000 });
  const rows = page.getByTestId("obs-series");
  expect(await rows.count()).toBeGreaterThan(10);
  for (let i = 0; i < Math.min(await rows.count(), 12); i++) {   // opinion rows; reality rows checked below
    const r = rows.nth(i);
    await expect(r.getByTestId("obs-value")).not.toBeEmpty();
    await expect(r.getByTestId("obs-when")).not.toBeEmpty();
    await expect(r.getByTestId("obs-source")).not.toBeEmpty();
  }
  // arrows only on surveys, and only beyond their stated threshold; official figures state a change
  const verdicts = await rows.evaluateAll((els) => els.map((e) => [e.closest("[data-section]")?.getAttribute("data-section"), e.getAttribute("data-verdict"),
    e.querySelector('[data-testid="obs-direction"]')?.textContent ?? ""]));
  for (const [sec, v, text] of verdicts) {
    if (v === "up" || v === "down") { expect(sec).toBe("opinion"); expect(text).toMatch(/oltre la soglia/); }
    if (sec !== "opinion") expect(["change", "stable", "none"]).toContain(v);
  }
  await expect(page.getByTestId("obs-pairs")).toBeVisible();   // reality beside perception, in the Opinione section
  await expect(page.getByTestId("obs-pair").first().locator('[data-side="reality"]')).toBeVisible();
  await expect(page.getByTestId("obs-pair").first().locator('[data-side="perception"]')).toBeVisible();
  // official figures now live in their sections (Prezzi · Economia): a stated change, never an arrow
  await page.getByTestId("section-prezzi").click();
  const realV = await page.locator('[data-testid="sec-prezzi"] [data-testid="obs-series"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-verdict")));
  expect(realV.length).toBeGreaterThan(0);
  for (const v of realV) expect(["change", "stable", "none"]).toContain(v);   // official figures: a change, never an arrow
  await page.getByTestId("section-opinione").click();
  const html = await page.getByTestId("sec-opinione").innerText();
  expect(html).not.toMatch(/indice di verità|punteggio|truth score|previsione:/i);
});

test("Italy: heads of state and government with their statement; no photo; fuel with its declared coverage", async ({ page }) => {
  await open(page);
  await select(page, await italy(page));
  await page.getByTestId("section-gov").click();                // declared change: the government has its own section
  const gov = page.getByTestId("gov");
  await expect(gov).toBeVisible({ timeout: 30_000 });
  expect(await gov.getByTestId("gov-office").count()).toBeGreaterThanOrEqual(2);
  await expect(gov.locator("img")).toHaveCount(0);
  const cur = gov.locator('[data-testid="gov-term"][data-status="current"]').first();
  await cur.locator("summary").click();
  await expect(cur).toContainText("Enunciato");
  await expect(gov.getByTestId("gov-rectify")).toHaveAttribute("href", /github\.com\/pezzaliapp\/NEXUM\/issues/);
  await page.getByTestId("section-prezzi").click();             // declared change (2026-10-03): fuel in Prezzi
  const fuel = page.getByTestId("sec-prezzi");
  await expect(fuel).toBeVisible();
  await expect(fuel.getByTestId("obs-coverage")).toContainText("37 Stati su 193");   // declared change (2026-10-04): + NZ, AU, UA
  await expect(fuel.getByTestId("obs-coverage")).toContainText("Non è una copertura mondiale");
  const f = fuel.locator('[data-testid="obs-series"]').filter({ hasText: "EUR/l" }).first();
  await f.locator("summary").click();
  await expect(f.getByTestId("obs-tax").first()).toContainText("in vigore dal");
});

test("an event in Italy: 'during the term of', said as context and never as a cause", async ({ page }) => {
  await open(page);
  const ev = await search(page, "Flood in Tuscany", "emergency.mapping_activation");
  await select(page, ev);
  const d = page.getByTestId("gov-during");
  await expect(d).toBeVisible({ timeout: 30_000 });
  await expect(d.getByTestId("during-line").first()).toContainText("durante il mandato di");
  await expect(d).toContainText("non indica alcuna causa");
});

test("German truck toll: the law's rate and the amount of a road's sections (no route)", async ({ page }) => {
  await open(page);
  const sec = await search(page, "A9 Baviera", "toll.road_section", /^A9 · Baviera/);
  await select(page, sec);
  const r = page.getByTestId("rates");
  await expect(r).toBeVisible({ timeout: 30_000 });
  await r.getByTestId("rate-d0").selectOption("5");          // > 18 t, 5 or more axles
  await r.getByTestId("rate-d1").selectOption("A");          // EURO VI
  await r.getByTestId("rate-d2").selectOption("1");          // CO₂ class 1
  await expect(r.getByTestId("rate-value")).toHaveText("0,348 EUR/km");
  await expect(r.getByTestId("rate-components")).toContainText("0,155");
  const e = await api(page, `/entities/${sec}`);
  const cents = (e.data.properties.segments as [number, string, string, number][]).reduce((s, x) => s + Math.round(x[3] * 0.348 * 100 + 1e-9), 0);
  await expect(r.getByTestId("rate-amount")).toHaveText(`€ ${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`);
  await expect(r).toContainText("NEXUM non calcola percorsi");
});

test("published files: no 'World Fuel Prices', no personal identifiers", () => {
  const walk = (d: URL): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(new URL(`${x.name}/`, d)) : /\.(js|html|css|json)$/.test(x.name) ? [new URL(x.name, d).pathname] : []);
  const files = walk(new URL("assets/", DEPLOY)).concat([new URL("index.html", DEPLOY).pathname]);
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    expect(t, f).not.toMatch(/World Fuel Prices/i);
    expect(t, f).not.toMatch(/pezzalialessandro|\/Users\/[a-z]/i);
  }
});
