// HOTFIX GOLDEN TESTS (2026-10-04, after the physical review of 31c547a): LIVE video that really plays (INGV Etna on
// GARR.tv, Caltrans HLS, Taiwan MJPEG) and never a refreshed still called live; the local date and time of cities and
// countries from their IANA zone (DST, negative and half/three-quarter-hour offsets, change of day, several zones);
// the country's own currency first and the dollar/PPP series said as comparison measures.
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";

async function world(page: Page, w = 1440, h = 900) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  return errors;
}
async function open(page: Page, q: string, label?: RegExp) {
  const input = page.locator("#nexum-search");
  await input.click();
  await input.fill(q);
  await expect(page.locator("#nexum-results [data-ref]").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  const hit = label ? page.locator("#nexum-results [data-ref]").filter({ has: page.locator(".grow", { hasText: label }) }).first()
    : page.locator("#nexum-results [data-ref]").first();
  await hit.click();
  await expect(page.getByTestId("focus-head")).toBeVisible({ timeout: 30_000 });
}
async function playLive(page: Page) {
  await expect(page.getByTestId("media-status")).toHaveText("● LIVE", { timeout: 30_000 });
  // declared change (2026-10-06): the camera's tap starts its video (muted) — no second button
  await expect(page.getByTestId("live-player")).toHaveAttribute("data-state", "playing", { timeout: 45_000 });
  await expect(page.getByTestId("live-state")).toContainText("IN ONDA");
}

test("LIVE 1 · INGV Etna on GARR.tv: the HLS video really plays (time advances)", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Etna live", /^Etna \(live\)$/);
  await playLive(page);
  const t0 = await page.getByTestId("live-video").evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(4000);
  expect(await page.getByTestId("live-video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t0);
  expect(errors).toEqual([]);
});

test("LIVE 2 · Caltrans HLS from a city's card (Los Angeles)", async ({ page }) => {
  const errors = await world(page);
  // a publisher's stream can be paused: up to four live cameras are tried, one must play
  let ok = false;
  for (let k = 0; k < 4 && !ok; k++) {
    await open(page, "Los Angeles", /^Los Angeles$/);
    const live = page.getByTestId("place-webcams").locator('[data-availability="live_stream"]');
    await expect(live.first()).toContainText("● LIVE", { timeout: 30_000 });
    await live.nth(k).locator("button").click();
    // (2026-10-06: a stream that does not answer gives way to the camera's still, said as an image: the viewer keeps the state)
    await expect(page.getByTestId("media")).not.toHaveAttribute("data-live-state", "loading", { timeout: 45_000 });
    ok = (await page.getByTestId("media").getAttribute("data-live-state")) === "playing";
  }
  expect(ok).toBeTruthy();
  expect(errors).toEqual([]);
});

test("LIVE 3 · Taiwan Highway Bureau MJPEG near Taipei; LIVE counts apart in Taiwan's Osserva", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Taipei", /^Taipei$/);
  await page.getByTestId("place-webcams").locator('[data-availability="live_stream"]').first().locator("button").click();
  await playLive(page);
  await open(page, "Taiwan", /^Taiwan$/);
  const counts = page.getByTestId("ov-observe").getByTestId("webcam-counts");
  await expect(counts).toContainText("LIVE", { timeout: 30_000 });
  expect(Number(await counts.getAttribute("data-live"))).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("no still called LIVE: a London JamCam (current image) has no live video", async ({ page }) => {
  const errors = await world(page);
  await open(page, "London", /^London$/);
  const cur = page.getByTestId("place-webcams").locator('[data-availability="current_snapshot"]').first();
  await expect(cur).toContainText("IMMAGINE CORRENTE", { timeout: 30_000 });
  await cur.locator("button").click();
  await expect(page.getByTestId("media-status")).toHaveText(/IMMAGINE CORRENTE/);
  await expect(page.getByTestId("live-start")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Italy · Osserva says LIVE, current images and link-only apart; INGV and CNR live in Italy", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Italia", /^Italy$/);
  const counts = page.getByTestId("ov-observe").getByTestId("webcam-counts");
  await expect(counts).toBeVisible({ timeout: 30_000 });
  expect(Number(await counts.getAttribute("data-live"))).toBeGreaterThanOrEqual(2);
  expect(Number(await counts.getAttribute("data-current"))).toBeGreaterThan(10);
  expect(Number(await counts.getAttribute("data-link"))).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

const CLOCKS: [string, RegExp | undefined, string, boolean][] = [
  ["Italia", /^Italy$/, "Europe/Rome", false], ["Parma", /^Parma$/, "Europe/Rome", false], ["London", /^London$/, "Europe/London", false],
  ["New York", /^New York$/, "America/New_York", false], ["Tokyo", /^Tokyo$/, "Asia/Tokyo", false],
  ["South Sudan", /^South Sudan/, "Africa/Juba", false], ["Sydney", /^Sydney$/, "Australia/Sydney", false],
  ["India", /^India$/, "Asia/Kolkata", false], ["Nepal", /^Nepal$/, "Asia/Kathmandu", false],
  ["Hong Kong", /^Hong Kong$/, "Asia/Hong_Kong", false], ["United States", /United States/, "America/New_York", true],
];
for (const [q, label, zone, multi] of CLOCKS) {
  test(`local time · ${q}: ${zone}${multi ? " (several zones: the capital's time, said as such)" : ""}`, async ({ page }) => {
    const errors = await world(page);
    await open(page, q, label);
    const lt = page.getByTestId("local-time");
    await expect(lt).toBeVisible({ timeout: 30_000 });
    await expect(lt).toHaveAttribute("data-zone", zone);
    // the offset and time the browser computes for that zone now (not the machine's zone)
    const want = await page.evaluate((z) => {
      const part = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "longOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")!.value;
      const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
      if (!m) return "UTC±0";
      const h = Number(m[2]), mm = Number(m[3] ?? 0);
      return `UTC${m[1] === "+" ? "+" : "−"}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
    }, zone);
    await expect(lt).toHaveAttribute("data-utc", want);
    if (zone === "Asia/Kolkata") expect(want).toBe("UTC+5:30");
    if (zone === "Asia/Kathmandu") expect(want).toBe("UTC+5:45");
    if (multi) {
      await expect(lt.getByTestId("local-time-multi")).toContainText("Più fusi orari");
      await expect(lt).toContainText("Ora della capitale (Washington, D.C.)");
    } else await expect(lt).toContainText("Ora locale");
    expect(errors).toEqual([]);
  });
}

test("currency · Italy: EUR first; US$ and PPP said as comparison measures; constant dollars explained", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Italia", /^Italy$/);
  const eco = page.getByTestId("ov-economy");
  await expect(eco.getByTestId("ov-key").first()).toContainText("EUR", { timeout: 30_000 });
  await expect(eco.getByTestId("ov-compare")).toContainText("US$");
  await expect(eco.getByTestId("ov-compare")).toContainText("non la valuta del Paese");
  await page.getByTestId("section-economia").click();
  const ppp = page.locator('[data-testid="sec-economia"] [data-testid="obs-series"]').filter({ hasText: "parità di potere d'acquisto" }).first();
  await expect(ppp.getByTestId("obs-unit-note")).toContainText("non dollari USA");
  await page.getByTestId("section-vivere").click();
  const cons = page.locator('[data-testid="sec-vivere"] [data-testid="obs-series"]').filter({ hasText: "Consumi delle famiglie pro capite" }).first();
  await expect(cons.getByTestId("obs-unit-note")).toContainText("prezzi costanti 2015");
  await page.getByTestId("section-prezzi").click();
  await expect(page.locator('[data-testid="sec-prezzi"] [data-testid="obs-series"]').filter({ hasText: "dieta sana · per persona" }).first()).toContainText("EUR");
  expect(errors).toEqual([]);
});

test("currency · Japan in JPY, United States in USD; South Sudan without a local series still readable", async ({ page }) => {
  const errors = await world(page);
  await open(page, "Japan", /^Japan$/);
  await expect(page.getByTestId("ov-economy").getByTestId("ov-key").first()).toContainText("JPY", { timeout: 30_000 });
  await open(page, "United States", /United States/);
  await expect(page.getByTestId("ov-economy").getByTestId("ov-key").first()).toContainText("USD", { timeout: 30_000 });
  await expect(page.getByTestId("ov-living")).toContainText("USD all'anno (netto)");      // Eurostat's national-currency series, not its EUR conversion
  await expect(page.getByTestId("ov-living")).not.toContainText("EUR");
  await open(page, "South Sudan", /^South Sudan/);
  await expect(page.getByTestId("ov-economy")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
