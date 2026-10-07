// BRAND IMAGES (2026-10-07, physical test: the shared link showed a doubled, cut "N"). The installed-app icons and the
// link preview image, drawn by the browser from NEXUM's own mark (web-public/favicon.svg: the amber N on the dark
// square) and its own wordmark and motto (as in the app's header) — no new logo, nothing generated. Run once when the
// mark changes:  node scripts/brand-images.mjs   (writes web-public/icons/*.png and web-public/og-image.png)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pub = path.join(root, "web-public");
const svg = fs.readFileSync(path.join(pub, "favicon.svg"), "utf8");
const markUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const BG = "#0D1012", TEXT = "#D6DBDE", ACCENT = "#E0A640", DIM = "#8A949A";
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

const b = await chromium.launch({ channel: "chrome" });
const shot = async (w, h, html, out) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:${BG};width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: out, omitBackground: false });
  await p.close();
  console.log(out.replace(root + "/", ""), `${w}×${h}`);
};
// icons: the mark itself, whole, at the size asked (it is drawn square, edge to edge)
const icon = (s, scale = 1) => `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center">
  <img src="${markUri}" style="width:${Math.round(s * scale)}px;height:${Math.round(s * scale)}px;display:block"></div>`;
await shot(180, 180, icon(180), path.join(pub, "icons", "apple-touch-icon.png"));
await shot(192, 192, icon(192), path.join(pub, "icons", "icon-192.png"));
await shot(512, 512, icon(512), path.join(pub, "icons", "icon-512.png"));
// maskable: the mark within the central safe zone (the system may cut up to a 10% border on each side)
await shot(512, 512, icon(512, 0.78), path.join(pub, "icons", "icon-maskable-512.png"));
// link preview 1200×630 (1.91:1): mark, wordmark, motto — all inside the central square, so a square crop keeps them
await shot(1200, 630, `<div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px">
  <img src="${markUri}" style="width:220px;height:220px;display:block;border:1px solid #262C31">
  <div style="font:600 64px/1 ${MONO};letter-spacing:.32em;margin-right:-.32em;color:${TEXT}">NEX<b style="color:${ACCENT};font-weight:600">U</b>M</div>
  <div style="font:500 19px/1 ${MONO};letter-spacing:.1em;color:${DIM}">ONE OBJECT. MANY RELATIONS. ONE TIMELINE.</div></div>`, path.join(pub, "og-image.png"));
await b.close();
