// One map (Phase 3B · block 0, revised 2026-10-03 by the author): the Earth's illumination is part of the single
// Operational Map — always on, computed from the clock — and there is NO day/night mode: no toggle, no control, no
// preference, no alternative map. The reference night lights are a same-origin asset, described as a reference.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
function files(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);
}

test("no day/night mode: no toggle, control or preference anywhere in the UI sources", () => {
  const src = files(path.join(ROOT, "src")).filter((f) => /\.(tsx?|css)$/.test(f));
  const hits = src.filter((f) => /dayNight|DayNight|legend-daynight|dn-btn|rememberDayNight|nightMode|toggleNight/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
});

test("the illumination is installed by the map itself, unconditionally", () => {
  const mv = fs.readFileSync(path.join(ROOT, "src/views/MapView.tsx"), "utf8");
  assert.match(mv, /stopIllumination\.current = installIllumination\(m, "basemap-borders"\);/);
  const il = fs.readFileSync(path.join(ROOT, "src/map/illumination.ts"), "utf8");
  assert.match(il, /type: "canvas"/);                      // drawn in the page: no request but the asset (same origin)
  assert.doesNotMatch(il, /https?:\/\//);
});

test("the reference night lights ship as one small same-origin asset in both builds", () => {
  for (const d of ["public/ref", "web-public/ref"]) {
    const f = path.join(ROOT, d, "night-lights-2016.webp");
    assert.ok(fs.existsSync(f), f);
    assert.ok(fs.statSync(f).size < 50_000, "small enough for the opening map (O6 ≤ 1,000 KB is measured by the bench)");
  }
});
