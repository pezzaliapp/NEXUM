// Layers are orthogonal (2026-10-07, stabilization) — desktop Chromium (this suite's browser) and desktop WebKit
// (Safari's engine, launched here). Cases A–G: tests/route-iso.shared.ts.
import { test, webkit } from "@playwright/test";
import { isolationCase, ready, repeatCase } from "../route-iso.shared";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
test.use({ baseURL: BASE });
test("J · desktop Chromium: A, B, C, D, G", async ({ page }) => {
  for (const what of [{}, { cams: true }, { events: true }, { cams: true, events: true, news: true }]) { await ready(page); await isolationCase(page, what); }
  await ready(page); await repeatCase(page);
});
test("J · desktop Safari (WebKit): webcams + events + news → route → closed; repeated", async () => {
  const b = await webkit.launch({ channel: undefined } as any), ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE }), page = await ctx.newPage();
  try { await ready(page); await isolationCase(page, { cams: true, events: true, news: true }); await ready(page); await repeatCase(page); }
  finally { await b.close(); }
});
