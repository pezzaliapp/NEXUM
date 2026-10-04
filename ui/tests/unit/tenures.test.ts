// "During the term of" (Phase 3B · block 3): end exclusive, never decided below the precision of the dates, never from
// superseded or undated terms; conflicts and several holders on a non-collegial office are ambiguous, not chosen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { covers, duringOn, type Office, type Term } from "../../src/lib/tenures.ts";

const T = (p: string, start: string | null, end: string | null, status = end ? "ended" : "current"): Term =>
  [p, p, start, end, status, "Q$1", 1, "normal", [], 0];

test("end exclusive: the handover day belongs to the successor", () => {
  assert.equal(covers(T("draghi", "2021-02-13", "2022-10-22"), "2022-10-21"), true);
  assert.equal(covers(T("draghi", "2021-02-13", "2022-10-22"), "2022-10-22"), false);
  assert.equal(covers(T("meloni", "2022-10-22", null), "2022-10-22"), true);
  assert.equal(covers(T("meloni", "2022-10-22", null), "2022-10-21"), false);
});

test("a date known to the year or month never decides a day inside it", () => {
  assert.equal(covers(T("x", "2010", "2015-06-01"), "2010-03-01"), null);
  assert.equal(covers(T("x", "2010", "2015-06-01"), "2011-03-01"), true);
  assert.equal(covers(T("x", "2010-01-01", "2015-06"), "2015-06-10"), null);
  assert.equal(covers(T("x", "2010-01-01", "2015-06"), "2015-07-10"), false);
});

test("superseded and undated terms never make a 'during the term of'", () => {
  assert.equal(covers(T("old", "2001-01-01", null, "superseded"), "2005-01-01"), null);
  assert.equal(covers(T("old", null, null, "undated"), "2005-01-01"), null);
});

test("conflicts and several holders of a single office are ambiguous; a collegial office is not", () => {
  const single: Office = { label: "PM", role: "capo di governo", collegial: false, check: null, outcome: "ambiguous",
    terms: [T("a", "2020-01-01", null, "conflict"), T("b", "2020-01-01", null, "conflict")] };
  const coll: Office = { ...single, collegial: true, outcome: "collegial", terms: [T("a", "2025-02-18", null), T("b", "2025-02-18", null)] };
  assert.equal(duringOn([["o", single]], "2026-01-01")[0].ambiguous, true);
  const d = duringOn([["c", coll]], "2026-01-01")[0];
  assert.equal(d.ambiguous, false); assert.equal(d.holders.length, 2);
  assert.deepEqual(duringOn([["c", coll]], "2020-01-01"), []);
});
