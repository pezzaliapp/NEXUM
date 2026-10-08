// NAVIGATION, DRIVEN BY A SIMULATED GPS — on iPhone (WebKit) and Fold closed (Chrome): the same scenario as the web
// suite (tests/nav-gps.shared.ts). Not a road test.
import { test } from "@playwright/test";
import { driveScenario } from "../nav-gps.shared";

test.describe.configure({ timeout: 420_000 });
test("simulated GPS: drive, stop, signal lost and back, detour, Ferma", async ({ page }, info) => {
  test.skip(!["iphone15promax-portrait", "fold-closed"].includes(info.project.name), "one WebKit phone and one Chrome phone");
  await driveScenario(page);
});
