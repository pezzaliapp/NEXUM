// W14 — one copy of each entity, views hold IDs only, selection survives view changes; LRU never evicts the
// focus or the trail; D9 click semantics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, MAX_REFS } from "../../src/store/store.ts";

const ref = (i: number, kind = "event") => ({ kind, id: `evt_${String(i).padStart(8, "0")}`, type: "t.x", label: `E${i}` });

test("normalize keeps one copy per entity and replaces refs by ids", () => {
  const s = createStore();
  const a = s.normalize({ items: [ref(1), { ...ref(1), label: "E1 bis", reason: "r" }], nested: { other: ref(2) } });
  assert.deepEqual(a.items[0], { $ref: ref(1).id });
  assert.deepEqual(a.items[1], { $ref: ref(1).id, reason: "r" });
  assert.equal(s.entityCount(), 2);
  assert.equal(s.entity(ref(1).id)!.label, "E1 bis");   // the update is visible to every view
  const json = JSON.stringify(a);
  assert.ok(!json.includes('"label"'), "views never hold entity copies");
});

test("rich DTOs become details, with their nested refs normalized", () => {
  const s = createStore();
  const d = s.normalize({ focus: { ...ref(3), confidence_factors: { p: [1] }, members: [{ role: "A", ref: ref(4) }] } });
  assert.deepEqual(d.focus, { $ref: ref(3).id, $details: true });
  assert.deepEqual(s.entity(ref(3).id)!.details.members[0].ref, { $ref: ref(4).id });
});

test("click = select + focus; changing view keeps selection, focus, scope and trail (D9)", async () => {
  const s = createStore();
  s.normalize({ a: ref(1), b: ref(2) });
  s.select(ref(1).id, "map");
  s.setScope({ min_confidence: 0.5 });
  s.select(ref(2).id, "graph");
  const before = s.get();
  for (const stage of ["graph", "split", "map"] as const) s.set({ stage });
  s.set({ mobileTab: "time" });
  const after = s.get();
  assert.equal(after.focus, ref(2).id);
  assert.deepEqual(after.scope, before.scope);
  assert.deepEqual(after.trail.steps.map((x) => x.ref), [ref(1).id, ref(2).id]);
  s.back();
  assert.equal(s.get().focus, ref(1).id);
  s.forward();
  assert.equal(s.get().focus, ref(2).id);
});

test("LRU keeps at most MAX_REFS entities and never evicts focus or trail", () => {
  const s = createStore();
  s.normalize({ first: ref(0) });
  s.select(ref(0).id, "test");
  const batch = [];
  for (let i = 1; i <= MAX_REFS + 500; i++) batch.push(ref(i));
  s.normalize({ items: batch });
  assert.ok(s.entityCount() <= MAX_REFS);
  assert.ok(s.entity(ref(0).id), "focus and trail survive eviction");
});
