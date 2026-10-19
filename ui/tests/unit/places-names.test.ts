// SEARCH REVIEW (2026-10-18): Italian and international names of cities, and their namesakes. The index entries are as
// the places index carries them after naturalearth.places 1.2.0 (aliases from Natural Earth's NAME_IT / NAMEPAR /
// NAMEALT; rank = inhabitants; context = nation). Airports and other elements are not in this index: they come after,
// in their own groups, never removed.
import assert from "node:assert/strict";
import test from "node:test";
import { matchPlaces, type Place } from "../../src/lib/places.ts";

const P: Place[] = [
  ["it-mi", "place.settlement", "Milan", ["Milano"], null, 2945000, "Italy"],
  ["it-rm", "place.settlement", "Rome", ["Roma"], null, 3339000, "Italy"],
  ["it-to", "place.settlement", "Turin", ["Torino"], null, 1652000, "Italy"],
  ["it-bo", "place.settlement", "Bologna", [], null, 488172, "Italy"],
  ["it-fi", "place.settlement", "Florence", ["Firenze"], null, 1500000, "Italy"],
  ["us-fl1", "place.settlement", "Florence", [], null, 57438, "United States of America"],
  ["us-fl2", "place.settlement", "Florence", [], null, 45349, "United States of America"],
  ["it-na", "place.settlement", "Naples", ["Napoli"], null, 2250000, "Italy"],
  ["us-na", "place.settlement", "Naples", [], null, 262306, "United States of America"],
  ["ro", "place.country", "Romania", [], null, null, null],
  ["do-lr", "place.settlement", "La Romana", [], null, 208437, "Dominican Republic"],
];
const first = (q: string) => matchPlaces(P, q, 5)[0];

test("the Italian name finds the Italian city first", () => {
  for (const [q, id] of [["milano", "it-mi"], ["roma", "it-rm"], ["torino", "it-to"], ["bologna", "it-bo"], ["firenze", "it-fi"], ["napoli", "it-na"],
    ["Milano", "it-mi"], ["ROMA", "it-rm"]] as const) {
    const h = first(q);
    assert.equal(h.id, id, q);
    assert.equal(h.context, "Italy", q);
  }
});

test("'roma' is Rome, not Romania nor La Romana (an exact name before a prefix)", () => {
  assert.deepEqual(matchPlaces(P, "roma", 5).map((h) => h.id).slice(0, 2), ["it-rm", "ro"]);
});

test("the international names find the city and its namesakes, each with its nation, the most inhabited first", () => {
  assert.deepEqual(matchPlaces(P, "florence", 5).map((h) => [h.id, h.context]), [["it-fi", "Italy"], ["us-fl1", "United States of America"], ["us-fl2", "United States of America"]]);
  assert.deepEqual(matchPlaces(P, "naples", 5).map((h) => [h.id, h.context]), [["it-na", "Italy"], ["us-na", "United States of America"]]);
  assert.equal(first("milan").id, "it-mi");
  assert.equal(first("rome").id, "it-rm");
  assert.equal(first("turin").id, "it-to");
});
