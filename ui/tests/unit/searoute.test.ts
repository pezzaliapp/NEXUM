// SEA ROUTE BETWEEN PORTS (2026-10-06): the model's shortest path on a small network — the right lines, oriented from
// start to end, a canal avoided on request, the 180° meridian crossed the short way, a point far from the sea refused.
import assert from "node:assert/strict";
import test from "node:test";
import { graph, route, type SeaRow } from "../../src/ops/searoute.ts";

// A square A(0,0) B(10,0) C(10,10) D(0,10); the short side A–B is a "canal"
const rows: SeaRow[] = [["suez", 1, [[0, 0], [10, 0]]], ["", 2, [[10, 0], [10, 10]]], ["", 2, [[10, 10], [0, 10]]], ["", 3, [[0, 10], [0, 0]]],
  ["", 1, [[170, 0], [180, 0]]], ["", 1, [[-180, 0], [-170, 0]]]];
const g = graph(rows);

test("shortest route, oriented, with the canal it passes", () => {
  const r = route(g, [0, 0.1], [10, 0.1], new Set())!;
  assert.deepEqual(r.line, [[0, 0], [10, 0]]);
  assert.deepEqual(r.passes, ["suez"]);
  assert.ok(Math.abs(r.km - 1111.95) < 1);
});

test("a canal avoided: the long way round", () => {
  const r = route(g, [0, 0], [10, 0], new Set(["suez"]))!;
  assert.deepEqual(r.line, [[0, 0], [0, 10], [10, 10], [10, 0]]);
  assert.deepEqual(r.passes, []);
});

test("across the 180° meridian: one continuous line, the short way", () => {
  const r = route(g, [170, 0], [-170, 0], new Set())!;
  assert.deepEqual(r.line, [[170, 0], [180, 0], [190, 0]]);
});

test("a point far from the network: no route", () => {
  assert.equal(route(g, [5, 40], [10, 0], new Set()), null);
});
