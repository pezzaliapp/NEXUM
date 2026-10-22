// INDEXING (2026-10-22): the official address is open to search engines (robots.txt allows, no noindex, one canonical
// naming https://nexum.pezzalihub.app/); the project's pages.dev address is kept out of the index by a host rule in
// _headers, matched as Cloudflare Pages matches it (a path rule on every host, a host rule on its own host only); the
// security headers stay as they were. Previews get X-Robots-Tag: noindex from Cloudflare itself, not from NEXUM.
//   NEXUM_INDEX_DIR=<assembled site> (default ../data/deploy/web)
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const dir = path.resolve(ui, process.env.NEXUM_INDEX_DIR ?? "../data/deploy/web");
const PORT = 8806;
const BASE = `http://127.0.0.1:${PORT}/`;
const OFFICIAL = "https://nexum.pezzalihub.app/";
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), interest-cohort=()",
};
let server: ChildProcess;
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
});
test.afterAll(() => { server?.kill(); });

// the _headers rules and the headers a request to `url` gets from them (Cloudflare Pages: every matching rule applies)
const rules = () => {
  const out: { pat: string; h: Record<string, string> }[] = [];
  for (const line of fs.readFileSync(path.join(dir, "_headers"), "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) out.push({ pat: line.trim(), h: {} });
    else { const i = line.indexOf(":"); out.at(-1)!.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
};
const headersFor = (url: string) => {
  const u = new URL(url), h: Record<string, string> = {};
  for (const r of rules()) {
    const abs = r.pat.startsWith("https://");
    const target = abs ? `https://${u.host}${u.pathname}` : u.pathname;
    const re = new RegExp("^" + r.pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (re.test(target)) Object.assign(h, r.h);
  }
  return h;
};

test("robots.txt allows the whole public site", async ({ request }) => {
  const res = await request.get(`${BASE}robots.txt`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("User-agent: *\nAllow: /\n");
});

test("the home: no noindex, one canonical naming the official address, the security headers unchanged", async ({ request }) => {
  const res = await request.get(BASE);
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["x-robots-tag"]).toBeUndefined();
  for (const [k, v] of Object.entries(SECURITY)) expect(h[k.toLowerCase()], k).toBe(v);
  const html = await res.text();
  expect(html).not.toMatch(/<meta[^>]+name=["']?(robots|googlebot)["']?/i);
  expect(html).not.toMatch(/noindex/i);
  const canon = [...html.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)].map((m) => m[0]);
  expect(canon).toHaveLength(1);
  expect(canon[0]).toContain(`href="${OFFICIAL}"`);
});

test("_headers: noindex only on the pages.dev address; the official domain and the security rule untouched", () => {
  const off = headersFor(OFFICIAL), dev = headersFor("https://nexum-45e.pages.dev/");
  expect(off["X-Robots-Tag"]).toBeUndefined();
  expect(headersFor(`${OFFICIAL}s/x/api/status.json`)["X-Robots-Tag"]).toBeUndefined();
  expect(dev["X-Robots-Tag"]).toBe("noindex");
  expect(headersFor("https://nexum-45e.pages.dev/robots.txt")["X-Robots-Tag"]).toBe("noindex");
  // a preview's own host is not this rule's: Cloudflare marks previews noindex by itself
  expect(headersFor("https://live-review.nexum-45e.pages.dev/")["X-Robots-Tag"]).toBeUndefined();
  for (const [k, v] of Object.entries(SECURITY)) { expect(off[k], k).toBe(v); expect(dev[k], k).toBe(v); }
  // every rule that says noindex is a pages.dev host rule; the security rule holds exactly the four headers
  for (const r of rules()) if (r.h["X-Robots-Tag"]) expect(r.pat).toMatch(/^https:\/\/[a-z0-9-]+\.pages\.dev\/\*$/);
  expect(rules().find((r) => r.pat === "/*")!.h).toEqual(SECURITY);
});
