// PHYSICAL ACCEPTANCE FIXES #1 (2026-10-05): the regressions found by the author's physical test, now golden tests.
//   1 · WEBCAMS: with Webcam as the only map category, every webcam is in the map's own clustered layer (none dropped);
//       Europe → Italy shows webcam groups; marks tell LIVE video, image and link-only apart (shape + word).
//   2 · ETNA: "Etna (live)" is a LIVE mark beside the link-only INGV page at the same place; pointing names it; a click
//       opens the live camera's card (the publisher's video, started only on request).
//   3 · STRADE: the switch draws and removes the street detail in SAT and in MAPPA, across mode, projection and zoom
//       changes (OpenFreeMap; the test needs the provider online).
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const CAM = "camera.public_webcam";

async function webcamsOnly(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await expect(page.getByTestId("ops-hud")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Nessuno", exact: true }).first().click();
  await page.locator(".typerow", { hasText: "Webcam" }).first().click();
  await page.getByTestId("ops-proj-flat").click();
  return errors;
}
const own = (page: Page) => page.evaluate(() => { const m = (window as any).__nexum.map;
  const ids = m.getStyle().layers.map((l: any) => l.id).filter((i: string) => i.startsWith("nexum-pts"));
  return m.queryRenderedFeatures({ layers: ids }).map((f: any) => ({ layer: f.layer.id, p: f.properties, xy: m.project(f.geometry.coordinates) })); });

test("1 · webcams: all of them in their own clustered layer; Europe → Italy shows webcam groups; LIVE told apart", async ({ page }) => {
  const errors = await webcamsOnly(page);
  const status = await page.evaluate(() => (window as any).__nexum.store.get().types.get("camera.public_webcam").count);
  await expect.poll(() => page.evaluate((t) => (window as any).__nexum.points?.[t]?.features ?? 0, CAM), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(status);                                              // every webcam (+ the official channels)
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [10, 47], zoom: 3.6 }));
  await page.waitForTimeout(3000);
  const europe = await own(page);
  expect(europe.length, "webcam groups at continental scale").toBeGreaterThan(10);
  expect(europe.some((f) => f.p.live > 0), "a group holding live video").toBeTruthy();
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [12.5, 42.5], zoom: 5.4 }));
  await page.waitForTimeout(2500);
  const italy = await page.evaluate(() => { const m = (window as any).__nexum.map; const b = [[6.6, 36.6], [18.5, 47.1]];
    const ids = m.getStyle().layers.map((l: any) => l.id).filter((i: string) => i.startsWith("nexum-pts"));
    return m.queryRenderedFeatures({ layers: ids }).filter((f: any) => { const [x, y] = f.geometry.coordinates; return x > b[0][0] && x < b[1][0] && y > b[0][1] && y < b[1][1]; }).length; });
  expect(italy, "webcams visible over Italy").toBeGreaterThan(3);
  await expect(page.getByTestId("pts-legend")).toContainText("LIVE video");
  await expect(page.getByTestId("pts-legend")).toContainText("solo link");
  expect(errors).toEqual([]);
});

test("2 · Etna: the LIVE camera is a LIVE mark, named on pointing, and a click opens its live card", async ({ page }) => {
  const errors = await webcamsOnly(page);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [14.9934, 37.751], zoom: 14 }));
  await page.waitForTimeout(3500);
  const marks = (await own(page)).filter((f) => !f.p.point_count);
  const live = marks.find((f) => f.p.s === "live_stream"), link = marks.find((f) => f.p.s === "link_only");
  expect(live, "Etna (live) is a LIVE mark").toBeTruthy();
  expect(link, "the INGV page beside it, link only").toBeTruthy();
  expect(Math.abs(live!.xy.x - link!.xy.x) + Math.abs(live!.xy.y - link!.xy.y)).toBeLessThan(1);   // the same place…
  const box = (await page.getByTestId("map").boundingBox())!;
  const ox = Number(live!.p.dx ?? 0);                                             // …drawn side by side
  await page.mouse.move(box.x + live!.xy.x + ox, box.y + live!.xy.y);
  await expect(page.locator(".pts-tip")).toContainText("Etna (live)", { timeout: 15_000 });
  await expect(page.locator(".pts-tip")).toContainText("LIVE");
  await page.mouse.click(box.x + live!.xy.x + ox, box.y + live!.xy.y);
  await expect(page.getByTestId("focus-head")).toContainText("Etna (live)", { timeout: 30_000 });
  await expect(page.getByTestId("media-status")).toHaveText("● LIVE", { timeout: 30_000 });
  await expect(page.getByTestId("live-player")).toBeVisible();                    // declared change (2026-10-06): the tap on the camera starts its video
  // Vulcano: its true status (link only), never shown as live
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [14.962, 38.404], zoom: 14 }));
  await page.waitForTimeout(2500);
  const vul = (await own(page)).filter((f) => !f.p.point_count);
  expect(vul.map((f) => f.p.s)).toContain("link_only");
  expect(vul.every((f) => f.p.s !== "live_stream")).toBeTruthy();
  expect(errors).toEqual([]);
});

test("3 · Rome: STRADE draws and removes the street detail in SAT and MAPPA, across mode, projection and zoom changes", async ({ page }) => {
  const errors = await webcamsOnly(page);
  const s = () => page.evaluate(() => { const m = (window as any).__nexum.map, o = (window as any).__nexum.ops.get();
    const ids = m.getStyle().layers.map((l: any) => l.id).filter((i: string) => i.startsWith("ofm-"));
    return { visible: ids.filter((i: string) => m.getLayoutProperty(i, "visibility") !== "none").length,
      rendered: m.queryRenderedFeatures().filter((f: any) => f.layer.id.startsWith("ofm-")).length, on: o.layers.streets, status: o.streetsStatus }; });
  await page.getByTestId("ops-base-sat").click();
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [12.4924, 41.8902], zoom: 13.4 }));
  await page.waitForTimeout(3000);
  expect((await s()).visible, "SAT, STRADE off: the picture alone").toBe(0);
  await page.getByTestId("ops-streets").click();
  await expect.poll(async () => (await s()).rendered, { timeout: 30_000 }).toBeGreaterThan(100);
  expect(await s()).toMatchObject({ on: true, status: "ready" });
  await expect(page.getByTestId("ops-streets")).toHaveAttribute("data-status", "on");
  await page.getByTestId("ops-streets").click();
  await page.waitForTimeout(800);
  expect((await s()).visible, "SAT, STRADE off again").toBe(0);
  await page.getByTestId("ops-base-map").click();
  await page.getByTestId("ops-streets").click();
  await expect.poll(async () => (await s()).rendered, { timeout: 30_000 }).toBeGreaterThan(100);
  await page.getByTestId("ops-base-sat").click(); await page.waitForTimeout(800);
  expect((await s()).visible, "MAPPA → SAT keeps the street detail").toBeGreaterThan(0);
  await page.getByTestId("ops-base-map").click();
  await page.getByTestId("ops-proj-globe").click(); await page.waitForTimeout(800);
  await page.getByTestId("ops-proj-flat").click(); await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ zoom: 5 })); await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ zoom: 13.4 }));
  await expect.poll(async () => (await s()).rendered, { timeout: 30_000 }).toBeGreaterThan(100);
  await page.getByTestId("ops-streets").click(); await page.waitForTimeout(800);
  expect(await s()).toMatchObject({ visible: 0, on: false });
  expect(errors).toEqual([]);
});

// 4 · (mobile physical test #2) the largest-city figure: the source names no city — said; NEXUM's own most populous
// settlement of the place shown beside it as a separate fact with its value and source, linked to its card; generic.
for (const [q, country] of [["Italia", "Italy"], ["India", "India"]] as const) {
  test(`4 · ${country}: the largest-city value says its source names no city, and shows NEXUM's most populous settlement apart`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
    const input = page.locator("#nexum-search");
    await input.click(); await input.fill(q);
    await page.locator("#nexum-results [data-ref]").filter({ hasText: country }).first().click();
    await expect(page.getByTestId("place-view")).toBeVisible({ timeout: 30_000 });
    const line = page.locator('[data-testid="ov-key"][data-indicator="EN.URB.LCTY"]');
    await expect(line).toBeVisible({ timeout: 30_000 });
    await expect(line.getByTestId("ind-unnamed")).toContainText("non il suo nome");
    const leader = line.getByTestId("ind-leader-link");
    await expect(leader).toBeVisible();
    const name = (await leader.textContent())!.trim();
    expect(name.length).toBeGreaterThan(1);
    await expect(line.getByTestId("ind-leader")).toContainText("Natural Earth");
    await expect(line.getByTestId("ind-leader")).toContainText("può non coincidere");
    await leader.click();                                                          // the settlement's own card
    await expect(page.getByTestId("focus-head")).toContainText(name, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
}
