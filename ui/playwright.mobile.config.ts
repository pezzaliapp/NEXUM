import { defineConfig } from "@playwright/test";

// Mobile acceptance (2026-09-30): the touch workspace on the engines of the real devices — WebKit for the iPhone,
// Chrome for the Samsung Fold — at the USEFUL viewport (screen minus the browser's own bars), not the nominal screen.
// These checks catch overlaps, clipping, covered surfaces, tiny targets; they do not replace the physical test.
export default defineConfig({
  testDir: "tests/mobile",
  testMatch: /\.spec\.ts$/,
  timeout: 300_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "../data/reports/phase3/playwright-mobile.json" }]],
  use: { baseURL: process.env.NEXUM_WEB ?? "http://127.0.0.1:8790/", actionTimeout: 30_000, deviceScaleFactor: 3, hasTouch: true },
  projects: [
    { name: "iphone15promax-portrait", use: { browserName: "webkit", isMobile: true, viewport: { width: 430, height: 740 } } },
    { name: "iphone15promax-landscape", use: { browserName: "webkit", isMobile: true, viewport: { width: 932, height: 340 } } },
    { name: "fold-closed", use: { browserName: "chromium", channel: "chrome", isMobile: true, viewport: { width: 344, height: 690 } } },
    { name: "fold-open", use: { browserName: "chromium", channel: "chrome", isMobile: true, viewport: { width: 884, height: 960 } } },
    // 2026-10-04: a tablet (iPad Air, portrait, Safari's useful viewport)
    { name: "tablet-portrait", use: { browserName: "webkit", isMobile: true, viewport: { width: 820, height: 1050 } } },
  ],
});
