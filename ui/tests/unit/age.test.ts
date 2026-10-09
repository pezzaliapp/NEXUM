// The age of an observation: plain words, "recente" only within the threshold, never "live"; unreadable time → none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOf } from "../../src/lib/age.ts";

const NOW = Date.parse("2026-10-09T12:00Z");

test("minutes, hours, days — recent only within the threshold", () => {
  assert.deepEqual(ageOf("2026-10-09T11:30Z", NOW, 3), { hours: 0.5, text: "meno di un'ora fa", recent: true });
  assert.equal(ageOf("2026-10-09T11:00Z", NOW, 3)!.text, "1 ora fa");
  assert.equal(ageOf("2026-10-09T09:00Z", NOW, 3)!.recent, true);
  assert.equal(ageOf("2026-10-09T08:00Z", NOW, 3)!.recent, false);
  assert.equal(ageOf("2026-10-08T00:00Z", NOW, 3)!.text, "36 ore fa");
  assert.equal(ageOf("2026-09-29T12:00Z", NOW, 3)!.text, "10 giorni fa");
});

test("a time in the future (clock skew) is not older than now; unreadable → none; never 'live'", () => {
  assert.equal(ageOf("2026-10-09T12:10Z", NOW)!.hours, 0);
  assert.equal(ageOf("not a time", NOW), null);
  assert.equal(ageOf(null, NOW), null);
  for (const t of ["2026-10-09T11:59Z", "2026-10-01T00:00Z"]) assert.ok(!/live/i.test(ageOf(t, NOW)!.text));
});
