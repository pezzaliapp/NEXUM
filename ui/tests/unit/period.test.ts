// The observed period and the starting state (2026-10-01): FOCUS ≠ FILTER · DEFAULT ≠ USER FILTER ·
// SELECTING AN EVENT ≠ CHANGING THE TIME WINDOW.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, inPeriod, monthIndex, periodName, periodOfWindow, windowOf } from "../../src/lib/period.ts";
import { createStore, userChanges } from "../../src/store/store.ts";

const SEP26 = monthIndex(Date.UTC(2026, 8, 29)), APR12 = monthIndex(Date.UTC(2012, 3, 1));

test("periods are whole months anchored to the world's latest data, named in words", () => {
  const w = windowOf({ kind: "last12" }, SEP26, APR12)!;
  assert.equal(new Date(w[0]).toISOString(), "2025-10-01T00:00:00.000Z");
  assert.equal(new Date(w[1]).toISOString(), "2026-09-30T23:59:59.999Z");
  assert.equal(periodName({ kind: "last12" }, SEP26, APR12), "ultimi 12 mesi");
  assert.equal(periodName({ kind: "year", year: 2025 }, SEP26, APR12), "2025");
  assert.equal(periodName({ kind: "all" }, SEP26, APR12), "tutto (2012–2026)");
  assert.equal(periodName({ kind: "custom", from: 2024 * 12 + 2, to: 2025 * 12 + 5 }, SEP26, APR12), "mar 2024 – giu 2025");
  assert.equal(windowOf({ kind: "all" }, SEP26, APR12), null);
  assert.equal(dayLabel(Date.UTC(2026, 2, 9, 23)), "9 mar 2026");
});

test("a recorded window is read back as the period it stands for", () => {
  assert.deepEqual(periodOfWindow(windowOf({ kind: "last12" }, SEP26, APR12), SEP26, APR12), { kind: "last12" });
  assert.deepEqual(periodOfWindow(windowOf({ kind: "year", year: 2020 }, SEP26, APR12), SEP26, APR12), { kind: "year", year: 2020 });
  assert.deepEqual(periodOfWindow(null, SEP26, APR12), { kind: "all" });
  assert.equal(inPeriod(Date.UTC(2020, 5, 1), windowOf({ kind: "last12" }, SEP26, APR12)), false);
  assert.equal(inPeriod(null, windowOf({ kind: "last12" }, SEP26, APR12)), true);     // no time: always inside
});

function started() {
  const s = createStore();
  const clock = { anchor: SEP26, first: APR12, latestMs: Date.UTC(2026, 8, 29) };
  s.set({ clock, defaults: { mapFloor: 0.8 }, mapFloor: 0.8, scope: { time_window: windowOf({ kind: "last12" }, SEP26, APR12)! } });
  for (const i of [1, 2, 3]) s.upsert({ kind: "event", id: `evt_${i}`, type: "t.x", label: `E${i}`, t: Date.UTC(2020, i, 1) });
  return s;
}

test("the starting state is not a user filter; only the person's changes are counted", () => {
  const s = started();
  assert.deepEqual(userChanges(s.get()), { period: false, filters: 0 });
  s.setScope({ types: ["t.x"] });
  s.setPeriod({ kind: "year", year: 2025 });
  assert.deepEqual(userChanges(s.get()), { period: true, filters: 1 });
});

test("selecting, Back and the path change the focus only; Ripristina keeps the focus; Applica is explicit", () => {
  const s = started();
  s.select("evt_1", "map");                                   // observed with the last 12 months
  s.setPeriod({ kind: "year", year: 2020 });
  s.select("evt_2", "map");                                   // observed with 2020
  const w2020 = s.get().scope.time_window;
  s.select("evt_3", "map");
  assert.deepEqual(s.get().scope.time_window, w2020);         // selecting never changes the period
  s.setPeriod({ kind: "last12" });
  s.back();
  assert.equal(s.get().focus, "evt_2");
  assert.deepEqual(s.get().period, { kind: "last12" });       // Back never reapplies the step's period
  s.applyStep(s.get().trail.index);                           // only "Applica" does
  assert.deepEqual(s.get().period, { kind: "year", year: 2020 });
  s.setScope({ sources: ["x"] });
  s.set({ mapFloor: 0 });
  s.resetFilters();
  assert.equal(s.get().focus, "evt_2");                       // Ripristina keeps the focus
  assert.deepEqual(s.get().period, { kind: "last12" });
  assert.equal(s.get().mapFloor, 0.8);
  assert.deepEqual(userChanges(s.get()), { period: false, filters: 0 });
});
