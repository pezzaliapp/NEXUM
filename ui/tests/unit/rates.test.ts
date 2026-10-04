// Toll amounts (Phase 3B · block 5): the rate is the table's row for the three dimensions (none → no amount); each
// section is rounded to the cent before summing (BFStrMG § 3(4)), so the sum differs from rounding the total.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCents, rateOf, sectionCents, type RateRow } from "../../src/lib/rates.ts";

const rows: RateRow[] = [[5, "A", 1, 0.348, 0.155, 0.023, 0.012, 0.158], [0, "F", 1, 0.248, 0.052, 0.102, 0.014, 0.08]];

test("the row of the three dimensions, or nothing", () => {
  assert.equal(rateOf(rows, 5, "A", 1)![3], 0.348);
  assert.equal(rateOf(rows, 5, "A", 2), null);
});

test("each section rounded to the cent, then summed", () => {
  assert.equal(sectionCents(3.1, 0.348), 108);                 // 1.0788 → 1.08
  assert.equal(sectionCents(3.8, 0.348), 132);                 // 1.3224 → 1.32
  const segs: [number, string, string, number][] = [[1, "a", "b", 0.1], [2, "b", "c", 0.1], [3, "c", "d", 0.1]];
  assert.equal(amountCents(segs, 0.348), 9);                   // 3 × round(3.48) = 9 cents, not round(10.44) = 10
});
