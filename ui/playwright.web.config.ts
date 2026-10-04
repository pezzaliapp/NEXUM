import { defineConfig } from "@playwright/test";

// Phase 3 — the online workspace (static snapshot), served by scripts/serve-web.mjs or by the real host
// (NEXUM_WEB=<url>). Installed Chrome only (D6).
export default defineConfig({
  testDir: "tests/web",
  testMatch: /\.spec\.ts$/,
  timeout: 600_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "../data/reports/phase3/playwright-web.json" }]],
  use: { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    actionTimeout: 30_000, baseURL: process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/" },
});
