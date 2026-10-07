// Layers are orthogonal (2026-10-07, stabilization) — on every phone of the suite (Samsung-size Chrome: fold-closed and
// a 412×860 run; Fold open; iPhone WebKit portrait and landscape; tablet). Cases A–G: tests/route-iso.shared.ts.
import { test } from "@playwright/test";
import { isolationCase, ready, repeatCase } from "../route-iso.shared";

test("A · normal map → route → closed → the normal map, exactly", async ({ page }) => { await ready(page); await isolationCase(page, {}); });
test("B · webcams on → route → webcams + route → closed → webcams unchanged", async ({ page }) => { await ready(page); await isolationCase(page, { cams: true }); });
test("C · events on → route → events + route → closed → events unchanged", async ({ page }) => { await ready(page); await isolationCase(page, { events: true }); });
test("D · webcams + events + news → route → all coexist → closed → unchanged", async ({ page }) => { await ready(page); await isolationCase(page, { cams: true, events: true, news: true }); });
test("G · five routes opened and closed → nothing accumulated", async ({ page }) => { await ready(page); await repeatCase(page); });
test("H · Samsung-size viewport (412×860): webcams + events + news → route → closed", async ({ page }, info) => {
  test.skip(info.project.name !== "fold-closed", "one Chrome run at the Samsung size");
  await page.setViewportSize({ width: 412, height: 860 });
  await ready(page); await isolationCase(page, { cams: true, events: true, news: true });
});
