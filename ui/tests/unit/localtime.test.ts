// LOCAL TIME (2026-10-04): offsets with half and three-quarter hours, negative offsets, daylight saving time, the
// change of day — at fixed instants, independent of the machine's own zone.
import assert from "node:assert/strict";
import test from "node:test";
import { distinctOffsets, localTime, utcLabel } from "../../src/lib/localtime.ts";

const AT = new Date("2026-10-04T15:45:00Z");          // a Sunday afternoon in UTC, summer time in Europe and the US

test("offsets: +2 (DST), −4 (DST), +9, +5:30, +5:45, ±0", () => {
  assert.equal(localTime("Europe/Rome", AT)!.utc, "UTC+2");
  assert.equal(localTime("Europe/Rome", AT)!.time, "17:45");
  assert.equal(localTime("America/New_York", AT)!.utc, "UTC−4");
  assert.equal(localTime("America/New_York", AT)!.time, "11:45");
  assert.equal(localTime("Asia/Kolkata", AT)!.utc, "UTC+5:30");
  assert.equal(localTime("Asia/Kolkata", AT)!.time, "21:15");
  assert.equal(localTime("Asia/Kathmandu", AT)!.utc, "UTC+5:45");
  assert.equal(localTime("Asia/Kathmandu", AT)!.time, "21:30");
  assert.equal(localTime("Atlantic/Reykjavik", AT)!.utc, "UTC±0");
});

test("the change of day: Tokyo and Sydney are already on 5 October", () => {
  const tk = localTime("Asia/Tokyo", AT)!;
  assert.equal(tk.time, "00:45");
  assert.match(tk.date, /^5 ottobre 2026$/);
  assert.equal(tk.utc, "UTC+9");
  const sy = localTime("Australia/Sydney", AT)!;            // DST began on 4 October 2026 in New South Wales
  assert.equal(sy.utc, "UTC+11");
  assert.match(sy.date, /^5 ottobre 2026$/);
});

test("daylight saving time changes the offset (Rome in January: +1)", () => {
  assert.equal(localTime("Europe/Rome", new Date("2026-01-15T12:00:00Z"))!.utc, "UTC+1");
  assert.equal(localTime("America/New_York", new Date("2026-01-15T12:00:00Z"))!.utc, "UTC−5");
});

test("several zones: counted by distinct offsets; one zone with DST still one", () => {
  assert.ok(distinctOffsets(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Pacific/Honolulu"], AT) >= 5);
  assert.equal(distinctOffsets(["Europe/Rome"], AT), 1);
  assert.equal(utcLabel(-570), "UTC−9:30");
});
