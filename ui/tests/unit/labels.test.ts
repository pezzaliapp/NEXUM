// Graph labels (Phase 3B · A1): no two written names overlap, the focus is always named, priority decides who is
// named when space is short, names stay inside the drawing area and off interface elements, unrelated names keep the
// previous density, and the plan is deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabels, type LabelCandidate, type Placement } from "../../src/graph/labels.ts";

const FS = 11;
const box = (p: Placement) => ({ x1: p.x - 3, y1: p.baseline - FS + 1 - 2, x2: p.x + p.w + 3, y2: p.baseline + 3 + 2 });
const overlap = (a: any, b: any) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const cand = (key: string, x: number, y: number, priority: number, w = 120, size = 5, r = 5): LabelCandidate => ({ key, x, y, r, w, priority, size });

test("a crowded star (the Fold case): names never overlap and the focus is named", () => {
  // focus in the middle, 12 neighbours on a small ring: their names cannot all fit
  const cs = [cand("focus", 170, 60, 0, 90, 9, 9)];
  for (let i = 0; i < 12; i++) cs.push(cand(`n${i}`, 170 + 40 * Math.cos(i * Math.PI / 6), 60 + 30 * Math.sin(i * Math.PI / 6), i < 4 ? 2 : 3));
  const plan = planLabels(cs, { width: 344, height: 120, fontSize: FS });
  assert.ok(plan.has("focus"), "the focus is named");
  const boxes = [...plan.values()].map(box);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `labels ${i} and ${j} overlap`);
  for (const b of boxes) assert.ok(b.x1 >= 4 - 3 && b.x2 <= 344 - 4 + 3 && b.y1 >= 0 && b.y2 <= 120, "inside the drawing area");
  assert.ok(plan.size < cs.length, "not every name is written when space is short");
});

test("priority: when two names want the same place, the more relevant one is written", () => {
  // two nodes at the same height, side by side: only one name fits between and around them in a narrow area
  const a = cand("rest", 100, 50, 4, 200), b = cand("nexum", 110, 50, 2, 200);
  const plan = planLabels([a, b], { width: 330, height: 100, fontSize: FS });
  assert.ok(plan.has("nexum"));
  if (plan.has("rest")) assert.ok(!overlap(box(plan.get("rest")!), box(plan.get("nexum")!)));
});

test("names avoid interface elements over the canvas and never leave it", () => {
  const plan = planLabels([cand("a", 20, 20, 3, 100)], { width: 300, height: 200, fontSize: FS, obstacles: [{ x1: 0, y1: 0, x2: 300, y2: 40 }] });
  const p = plan.get("a");
  if (p) assert.ok(box(p).y1 >= 40, "below the interface element");
  const edge = planLabels([cand("b", 295, 100, 3, 100)], { width: 300, height: 200, fontSize: FS });
  assert.equal(edge.get("b")?.side, "left", "near the right edge the name goes to the left");
});

test("unrelated names keep the previous density (one per cell); related ones are not capped by it", () => {
  const rest = [cand("r1", 50, 40, 4, 20), cand("r2", 50, 80, 4, 20)];        // same 90 px cell, room for both
  assert.equal(planLabels(rest, { width: 400, height: 300, fontSize: FS, cell: 90 }).size, 1);
  const near = [cand("n1", 50, 40, 3, 20), cand("n2", 50, 80, 3, 20)];
  assert.equal(planLabels(near, { width: 400, height: 300, fontSize: FS, cell: 90 }).size, 2);
});

test("deterministic: the same input gives the same plan, whatever the input order", () => {
  const cs = Array.from({ length: 40 }, (_, i) => cand(`k${i}`, (i * 37) % 300, (i * 53) % 200, i % 5, 60 + (i % 3) * 20, i % 7));
  const p1 = planLabels(cs, { width: 320, height: 220, fontSize: FS });
  const p2 = planLabels([...cs].reverse(), { width: 320, height: 220, fontSize: FS });
  assert.deepEqual([...p1.entries()].sort(), [...p2.entries()].sort());
});

test("a name that fits nowhere in full is written in its shorter form rather than left out", () => {
  // two nodes on one line: "a" (bigger, placed first) writes its long name to the right, across the middle; "b" fits
  // neither right (edge), left (over a's name), above nor below (edges) in full — only its short form, to its right
  const plan = planLabels([cand("a", 60, 20, 2, 200, 6), { ...cand("b", 300, 20, 2, 240, 5), wShort: 60 }], { width: 380, height: 40, fontSize: FS });
  assert.ok(plan.has("a") && plan.has("b"));
  assert.equal(plan.get("b")!.short, true);
  assert.ok(!overlap(box(plan.get("a")!), box(plan.get("b")!)));
});
