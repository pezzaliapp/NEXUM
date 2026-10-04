// PLACES FIRST (integrity gate 2026-10-04): a place named exactly or by prefix is found before any event that shares its
// name; similar names stay distinct (Sudan / South Sudan, Niger / Nigeria, Congo / DR Congo, Guinea family, Dominica).
import assert from "node:assert/strict";
import test from "node:test";
import { matchPlaces, type Place } from "../../src/lib/places.ts";

const P: [string, string, string, string[], string | null][] = [
  ["sd", "c", "Sudan", ["Republic of the Sudan"], null],
  ["ss", "c", "S. Sudan", ["Republic of South Sudan", "South Sudan", "Sudan del Sud"], "South Sudan"],
  ["ne", "c", "Niger", ["Republic of Niger"], null],
  ["ng", "c", "Nigeria", ["Federal Republic of Nigeria"], null],
  ["cg", "c", "Congo", ["Republic of the Congo", "Congo (Brazzaville)"], null],
  ["cd", "c", "Dem. Rep. Congo", ["Democratic Republic of the Congo", "Congo (Kinshasa)"], "Democratic Republic of the Congo"],
  ["gn", "c", "Guinea", ["Republic of Guinea"], null],
  ["gw", "c", "Guinea-Bissau", ["Republic of Guinea-Bissau"], null],
  ["gq", "c", "Eq. Guinea", ["Equatorial Guinea", "Republic of Equatorial Guinea"], "Equatorial Guinea"],
  ["dm", "c", "Dominica", ["Commonwealth of Dominica"], null],
  ["do", "c", "Dominican Rep.", ["Dominican Republic"], "Dominican Republic"],
  ["ge", "c", "Georgia", ["Sakartvelo"], null],
  ["it", "c", "Italy", ["Italia", "Italian Republic"], null],
];
const first = (q: string) => matchPlaces(P as any, q)[0]?.id;
const ids = (q: string) => matchPlaces(P as any, q).map((x) => x.id);

test("exact names come first; similar names stay distinct", () => {
  assert.equal(first("Sudan"), "sd");
  assert.equal(first("suda"), "sd");
  assert.deepEqual(ids("suda").slice(0, 2), ["sd", "ss"]);
  assert.equal(first("South Sudan"), "ss");
  assert.equal(first("S. Sudan"), "ss");
  assert.equal(first("Niger"), "ne");
  assert.equal(first("Nigeria"), "ng");
  assert.equal(first("Congo"), "cg");
  assert.equal(first("Democratic Republic of the Congo"), "cd");
  assert.equal(first("Republic of the Congo"), "cg");
  assert.equal(first("Guinea"), "gn");
  assert.equal(first("Guinea-Bissau"), "gw");
  assert.equal(first("Equatorial Guinea"), "gq");
  assert.equal(first("Dominica"), "dm");
  assert.equal(first("Dominican Republic"), "do");
  assert.equal(first("Georgia"), "ge");
  assert.equal(first("Italia"), "it");
});

test("a clear name replaces an abbreviated source label", () => {
  assert.equal(matchPlaces(P as any, "South Sudan")[0].label, "South Sudan");
  assert.equal(matchPlaces(P as any, "Dem. Rep. Congo")[0].label, "Democratic Republic of the Congo");
});

test("namesakes: an explorable place first, then cities by rank (more inhabitants first), with their context", () => {
  const P: Place[] = [
    ["c1", "city", "London", [], null, 383822, "Canada"],
    ["c2", "city", "London", [], null, 8567000, "United Kingdom"],
    ["k1", "country", "Luxembourg", [], null],
    ["c3", "city", "Luxembourg", [], null, 107260, "Luxembourg"],
  ];
  const l = matchPlaces(P, "London");
  assert.deepEqual(l.map((x) => x.id), ["c2", "c1"]);
  assert.equal(l[0].context, "United Kingdom");
  assert.deepEqual(matchPlaces(P, "Luxembourg").map((x) => x.id), ["k1", "c3"]);
});
