// U10 (informative): after 1,000 modifications of a D2 clone, time from /status reporting the new world_version to
// the views updated. The service runs on the clone (port 8769), started by run_phase2.py.
import { test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = new URL("../../../data/reports/phase2/ui_bench.json", import.meta.url);
const ROOT = new URL("../../../", import.meta.url).pathname;

test("U10 update after a world_version change (D2 clone, informative)", async ({ page }) => {
  const clone = process.env.NEXUM_U10_DIR!;
  await page.goto(process.env.NEXUM_U10_URL ?? "http://127.0.0.1:8769/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 60000 });
  const v0 = await page.evaluate(() => (window as any).__nexum.store.get().worldVersion);
  const out = execFileSync("python3", ["bench/phase2/u10_modify.py", "modify", clone], { cwd: ROOT }).toString();
  const ms = await page.evaluate(async () => {
    performance.clearMarks("nexum:map:rendered");
    const t0 = performance.now();
    await fetch("/api/v1/status").then((r) => r.json()).then((s) => (window as any).__nexum.store.setWorldVersion(s.world_version));
    await new Promise<void>((res) => { const c = () => performance.getEntriesByName("nexum:map:rendered").length ? res() : requestAnimationFrame(c); c(); });
    return performance.now() - t0;
  });
  const v1 = await page.evaluate(() => (window as any).__nexum.store.get().worldVersion);
  const res = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  res.U10 = { world_version_before: v0, world_version_after: v1, update_ms: +ms.toFixed(1), modify: out.trim(),
    note: "the UI re-queries its views on a new world_version (it does not apply changes_since deltas)", blocking: false };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
});
