// The browser read model reproduces Python semantics where the Core's results depend on them. The expected values
// are produced by Python itself (snapshot-python-vectors.json, regenerated from nexum.core and nexum.snapshot).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fnv1a } from "../../src/snapshot/data.ts";
import { aggLevel, cell, cellBbox, monthIndex, monthStartMs, viewportCells } from "../../src/snapshot/geo.ts";
import { pyFloatRepr, pyJsonLen, pyRound, truthy } from "../../src/snapshot/py.ts";

const V = JSON.parse(fs.readFileSync(new URL("./snapshot-python-vectors.json", import.meta.url), "utf8"));

test("repr() of floats", () => { for (const [f, r] of V.reprs) assert.equal(pyFloatRepr(f), r, `repr(${f})`); });
test("round(x, n): correctly rounded, ties to even", () => {
  for (const [x, n, r] of V.rounds) assert.ok(Object.is(pyRound(x, n), r) || pyRound(x, n) === r, `round(${x}, ${n}) = ${r}, got ${pyRound(x, n)}`);
});
test("len(json.dumps(...)) with ensure_ascii and default separators", () => {
  for (const [o, n] of V.dumps) assert.equal(pyJsonLen(o), n, JSON.stringify(o));
});
test("aggregation grid: cell, cell_bbox, viewport_cells, agg level", () => {
  for (const [lon, lat, lvl, c] of V.cells) assert.deepEqual(cell(lon, lat, lvl), c, `cell(${lon}, ${lat}, ${lvl})`);
  for (const [lvl, x, y, b] of V.bboxes) assert.deepEqual(cellBbox(lvl, x, y), b);
  for (const [vp, lvl, cs] of V.viewports) assert.deepEqual(viewportCells(vp, lvl), cs);
  for (const [z, l] of V.agg_levels) assert.equal(aggLevel(z), l, `agg level of z=${z}`);
});
test("calendar: month_index, month_start_ms", () => {
  for (const [ms, mi] of V.months) assert.equal(monthIndex(ms), mi, `month_index(${ms})`);
  for (const [mi, ms] of V.month_starts) assert.equal(monthStartMs(mi), ms, `month_start_ms(${mi})`);
});
test("FNV-1a shard function = the builder's", () => { for (const [s, h] of V.hashes) assert.equal(fnv1a(s), h, s); });
test("Python truthiness", () => {
  for (const x of [null, undefined, false, 0, "", [], {}]) assert.equal(truthy(x), false);
  for (const x of [1, "a", [0], { a: 0 }, true, 0.5]) assert.equal(truthy(x), true);
});
test("compact basemap decodes to the identical GeoJSON (Python encoder)", async () => {
  const { decodePolygons } = await import("../../src/snapshot/basemap.ts");
  const out = decodePolygons(new Uint8Array(Buffer.from(V.basemap.b64, "base64")));
  assert.deepEqual(out, V.basemap.geojson);
  assert.deepEqual(Object.keys(out), Object.keys(V.basemap.geojson));
});
