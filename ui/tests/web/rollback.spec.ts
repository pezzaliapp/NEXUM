// O13 — rollback: snapshots are immutable folders; the active one is named by current.json. Switching current.json
// to the previous version serves it immediately; an open session keeps its own version (never mixes two), is told
// that another version is published, and if its files disappear it asks for a reload instead of showing wrong data.
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ui = new URL("../../", import.meta.url).pathname;
const src = path.resolve(ui, "../data/deploy/web");
const dir = path.resolve(ui, "../data/deploy/web-rollback");
const PORT = 8792;
const BASE = `http://127.0.0.1:${PORT}/`;
let server: ChildProcess;
// files are hard-linked from the real deployment: never write through a link (replace the file instead)
const put = (f: string, body: string) => { fs.rmSync(f, { force: true }); fs.writeFileSync(f, body); };
const swap = (from: string, to: string) => put(to, fs.readFileSync(from, "utf8"));

function linkTree(a: string, b: string) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    const s = path.join(a, e.name), d = path.join(b, e.name);
    if (e.isDirectory()) linkTree(s, d); else fs.linkSync(s, d);
  }
}

test.beforeAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  linkTree(src, dir);
  const cur = JSON.parse(fs.readFileSync(path.join(dir, "current.json"), "utf8"));
  // version B: a second published snapshot (same content, its own immutable folder and version id)
  const vB = `${cur.version}-b`;
  const sB = path.join(dir, "s", vB);
  linkTree(path.join(dir, "s", cur.version), sB);
  const style = path.join(sB, "basemap", "style.json");
  const body = fs.readFileSync(style, "utf8").replaceAll(`/s/${cur.version}/`, `/s/${vB}/`);
  put(style, body);
  put(path.join(dir, "current-a.json"), JSON.stringify(cur));
  put(path.join(dir, "current-b.json"), JSON.stringify({ ...cur, version: vB, base: `/s/${vB}/` }));
  swap(path.join(dir, "current-b.json"), path.join(dir, "current.json"));
  server = spawn(process.execPath, [path.join(ui, "scripts/serve-web.mjs"), "--dir", dir, "--port", String(PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
});
test.afterAll(() => { server?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test("O13 rollback: switching current.json serves the previous snapshot; open sessions stay consistent", async ({ browser }) => {
  const a = JSON.parse(fs.readFileSync(path.join(dir, "current-a.json"), "utf8"));
  const b = JSON.parse(fs.readFileSync(path.join(dir, "current-b.json"), "utf8"));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // session 1 opens on version B
  const p1 = await ctx.newPage();
  await p1.goto(BASE);
  await expect(p1.getByTestId("statusbar").getByTestId("snapshot-age")).toHaveAttribute("data-version", b.version, { timeout: 60_000 });
  await expect(p1.getByTestId("map-lod")).toBeVisible();
  // rollback: current.json → A (one small file; no rebuild)
  const t0 = Date.now();
  swap(path.join(dir, "current-a.json"), path.join(dir, "current.json"));
  const p2 = await ctx.newPage();
  await p2.goto(BASE);
  await expect(p2.getByTestId("statusbar").getByTestId("snapshot-age")).toHaveAttribute("data-version", a.version, { timeout: 60_000 });
  await expect(p2.getByTestId("map-lod")).toBeVisible();
  const switchMs = Date.now() - t0;
  // session 1 keeps B and is told another version is published
  await p1.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(p1.getByTestId("snapshot-newer")).toBeVisible({ timeout: 20_000 });
  await expect(p1.getByTestId("statusbar").getByTestId("snapshot-age")).toHaveAttribute("data-version", b.version);
  await p1.evaluate((id) => (window as any).__nexum.store.select(id, "test"), "evt_52533tha44nldvbuqjsciuqz3m");
  await expect(p1.getByTestId("focus-head")).toHaveAttribute("data-focus", "evt_52533tha44nldvbuqjsciuqz3m");
  // B removed from the host (as after a rollback deployment): session 1 asks for a reload, never mixes versions
  fs.rmSync(path.join(dir, "s", b.version), { recursive: true, force: true });
  const r = await p1.evaluate(() => (window as any).__nexum.apiFetch("/entities/obj_r67mjum3oegfzbyykyabuoxj3y/locate"));
  expect(r.status).toBe(503);
  expect(r.body.error.code).toBe("snapshot_changed");
  // after reload, session 1 is on A
  await p1.reload();
  await expect(p1.getByTestId("statusbar").getByTestId("snapshot-age")).toHaveAttribute("data-version", a.version, { timeout: 60_000 });
  fs.mkdirSync(new URL("../../../data/reports/phase3/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL("../../../data/reports/phase3/rollback.json", import.meta.url), JSON.stringify({
    from: b.version, to: a.version, new_session_on_previous_ms: switchMs, open_session_kept_version: true,
    open_session_notified: true, removed_files_answer: "503 snapshot_changed", after_reload: a.version }, null, 1));
  await ctx.close();
});
