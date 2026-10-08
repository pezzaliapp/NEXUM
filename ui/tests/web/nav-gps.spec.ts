// NAVIGATION, DRIVEN BY A SIMULATED GPS (2026-10-08) — desktop and phone in Chrome; the scenario and the fake GPS are
// in tests/nav-gps.shared.ts (also run by the mobile suite: iPhone/WebKit, Fold/Chrome). Not a road test.
import { expect, test } from "@playwright/test";
import { driveScenario, gps, motorway, push, setup } from "../nav-gps.shared";

test.use({ baseURL: process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/" });
test.describe.configure({ timeout: 420_000 });

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 412, height: 860 }]) {
  test(`${vp.name}: driving the route — GPS shown, manoeuvres ahead and in order, spoken once each, no reroute on the route; a stop; signal lost and back; a detour → one reroute; Ferma ends all and keeps the route`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await driveScenario(page);
  });
}

test("a whole route with motorway stretches (Parma → Modena): never off the route, the manoeuvre never goes back", async ({ page }) => {
  await motorway(page, "Parma", "Modena");
});

test("a start away from the route: the navigation computes the route from the device's position, said as «La tua posizione»", async ({ page }) => {
  const { routing, errors, line } = await setup(page);
  // the device 2 km west of the route's start, standing
  const far: [number, number] = [line[0][0] - 0.025, line[0][1] + 0.002];
  await push(page, far, 10);
  await page.getByTestId("ops-nav-toggle").click();
  const r0 = routing.length;
  for (let i = 0; i < 10; i++) { await push(page, [far[0] + (i % 2) * 2e-5, far[1]], 10); await page.waitForTimeout(1000); }
  await expect.poll(() => routing.length - r0, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("ops-route-from")).toHaveValue("La tua posizione", { timeout: 30_000 });
  const start: [number, number] = await page.evaluate(() => (window as any).__nexum.map.getSource("ops-route").serialize().data.geometry.coordinates[0]);
  expect(Math.abs(start[0] - far[0]) + Math.abs(start[1] - far[1]), "the new route starts where the device is").toBeLessThan(0.01);
  await expect(page.getByTestId("ops-nav-toggle")).toContainText("Ferma");
  await page.getByTestId("ops-nav-toggle").click();
  expect((await gps(page)).watchers).toBe(0);
  expect(errors).toEqual([]);
});
