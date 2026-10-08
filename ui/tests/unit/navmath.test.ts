// NAVIGATION GEOMETRY (2026-10-08): progress along the route, the next manoeuvre always ahead, off-route measured to
// the segments (a long straight segment is still "on the route").
import assert from "node:assert/strict";
import test from "node:test";
import { cumulative, nextStep, project, stepVertices, type LL } from "../../src/ops/navmath.ts";

// an L-shaped route near Parma: 2 km east (one long straight segment), then 1 km north
const A: LL = [10.30, 44.80], B: LL = [10.3253, 44.80], C: LL = [10.3253, 44.809];
const line: LL[] = [A, B, C];
const cum = cumulative(line);
const steps = [{ a: 0, maneuver: { location: A } }, { a: 1, maneuver: { location: B } }, { a: 2, maneuver: { location: C } }];
const vtx = stepVertices(line, steps);

test("lengths", () => { assert.ok(Math.abs(cum[1] - 2) < 0.02, String(cum[1])); assert.ok(Math.abs(cum[2] - 3) < 0.02, String(cum[2])); });

test("the middle of a long straight segment is on the route (no vertex near it)", () => {
  const f = project(line, cum, [10.3126, 44.8001]);
  assert.equal(f.seg, 0);
  assert.ok(f.dist < 0.02, `distance ${f.dist}`);
});

test("the next manoeuvre is the one ahead, with its distance along the road; never one already passed", () => {
  let f = project(line, cum, [10.3126, 44.80]);
  assert.deepEqual(nextStep(vtx, cum, f).i, 1);
  assert.ok(Math.abs(nextStep(vtx, cum, f).d - 1) < 0.03);
  // 60 m after the turn: the next is the arrival, not the turn behind
  f = project(line, cum, [10.3253, 44.80055], f.seg);
  assert.equal(f.seg, 1);
  assert.equal(nextStep(vtx, cum, f).i, 2);
  // at the very start: the departure
  assert.equal(nextStep(vtx, cum, project(line, cum, A)).i, 0);
});

test("off the route: the distance to the segments", () => {
  const f = project(line, cum, [10.3126, 44.8045]);   // 500 m north of the straight segment
  assert.ok(f.dist > 0.45 && f.dist < 0.55, String(f.dist));
});

test("OSRM steps (no shape index): their vertices found in order", () => {
  assert.deepEqual(stepVertices(line, steps.map((s) => ({ maneuver: s.maneuver }))), [0, 1, 2]);
});
