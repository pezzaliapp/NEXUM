// Visual check helper: open NEXUM in the installed Chrome at a given size, optionally run steps, save a screenshot.
// usage: node scripts/shot.mjs <url> <width>x<height> <out.png> [steps.json]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [url, size, out, stepsFile] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu"] });
const touch = width < 1280;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: width < 768 });
const external = [];
page.on("request", (r) => { const u = new URL(r.url()); if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol !== "data:" && u.protocol !== "blob:") external.push(r.url()); });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, "utf8")) : [];
for (const s of steps) {
  if (s.click) await page.locator(s.click).first().click({ modifiers: s.shift ? ["Shift"] : [] });
  if (s.fill) await page.locator(s.fill).fill(s.value);
  if (s.press) await page.keyboard.press(s.press);
  if (s.eval) await page.evaluate(s.eval);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: s.shot });
}
await page.waitForTimeout(600);
await page.screenshot({ path: out });
const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log(JSON.stringify({ out, overflow, external }));
await browser.close();
