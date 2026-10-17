// What a line of the graph is: recorded relation, role, inference of a rule, or plain geography — never mixed, and an
// unknown kind is never shown as documented. Same partition as the focus card (connections.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { LINK_STYLE, linkClass, rowClass } from "../../src/graph/edgeStyle.ts";
import { buildConnections, GEO_ROLES } from "../../src/lib/connections.ts";

test("relations: documented unless spatial; spatial relations are geographic context", () => {
  assert.equal(linkClass("relation", "held_by", "organizational"), "documented");
  assert.equal(linkClass("relation", "imports_gas_from", "infrastructural"), "documented");
  assert.equal(linkClass("relation", "located_in", "spatial"), "geo");
  assert.equal(linkClass("relation", "near_place", "spatial"), "geo");
  assert.equal(linkClass("relation", "measured_in", "spatial"), "geo");
});

test("roles: an event's place is geography, any other role is a role", () => {
  for (const r of GEO_ROLES) assert.equal(linkClass("participation", r, null), "geo");
  assert.equal(linkClass("participation", "at_volcano", null), "role");
});

test("what a rule found is inferred: insight membership and hypothesized relations", () => {
  assert.equal(linkClass("insight_member", "event_event_association", null), "inferred");
  assert.equal(linkClass("hypothesis", "supplies", "hypothesis"), "inferred");
  assert.equal(LINK_STYLE.inferred.dashed, true);
  for (const c of ["documented", "role", "geo"] as const) assert.equal(LINK_STYLE[c].dashed, false);
});

test("a drawn path or an unknown kind has no kind (never documented)", () => {
  assert.equal(linkClass("path", "path", null), null);
  assert.equal(linkClass("something_new", "x", "organizational"), null);
});

test("the four looks are distinct (colour and, for inferences, the dash)", () => {
  const cs = Object.values(LINK_STYLE).map((s) => s.color);
  assert.equal(new Set(cs).size, cs.length);
});

test("the card's rows and the graph's lines agree: a row is never geographic, its kind follows its category", () => {
  const L = { typeLabel: (t: string) => t, entityLabel: () => null, entityKind: () => null, entityType: () => null,
    day: () => "", km: (n: number) => `${n}`, duration: () => "" };
  const c = buildConnections("obj_a", "object", "energy.plant", {}, {
    relations: { groups: [
      { type: "located_in", direction: "out", nature: "spatial", count: 1, items: [{ other: { $ref: "obj_c" }, relation: { $ref: "rel_1" } }] },
      { type: "held_by", direction: "out", nature: "organizational", count: 1, items: [{ other: { $ref: "obj_o" }, relation: { $ref: "rel_2" }, independent_sources: 2 }] }] },
    insights: { items: [{ ref: { $ref: "ins_1" }, confidence: 0.6, explanation: "x." }], total: 1 },
  }, L as any);
  assert.deepEqual(c.rows.map((r) => [r.target, rowClass(r.cat)]), [["ins_1", "inferred"], ["obj_o", "documented"]]);
  assert.deepEqual(c.geo.map((r) => r.target), ["obj_c"]);
  assert.equal(linkClass("relation", "located_in", "spatial"), "geo");
});
