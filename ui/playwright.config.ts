import { defineConfig } from "@playwright/test";

// Installed Chrome only (D6): Playwright's own browsers are never downloaded.
export default defineConfig({
  testDir: "tests",
  testMatch: /(e2e|bench)\/.*\.spec\.ts$/,
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "../data/reports/phase2/playwright.json" }]],
  use: { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    actionTimeout: 20_000 },
});
