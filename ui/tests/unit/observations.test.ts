// Perceived direction (Phase 3B · block 2): an arrow only for a change of one series larger than its sampling error;
// "stabile" within the error; nothing without n/SE; official statistics state a change, never a perceived direction;
// monthly balances compare the same month of the previous year; reality and perception are paired, never merged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { direction, pairsByTopic, previousOf, type Series } from "../../src/lib/observations.ts";

const share = (vals: [string, number, number | null][], props: Record<string, any> = {}): Series => ({
  id: "x", type: "t", kind: "survey", label: "l", source_id: "s", refs: [],
  props: { statistic: "share", compare: "previous_wave", ...props },
  points: vals.map(([d, v, n]) => [d, d, v, n, null, "r"]),
});

test("survey share: arrow only beyond 2·√2·SE(Δ)", () => {
  // n = 1000, p ≈ 30%: SE ≈ 1.45 per point, SE(Δ) ≈ 2.05, threshold ≈ 5.8 points
  const up = direction(share([["2025-04-01", 30, 1000], ["2025-11-01", 37, 1000]]));
  assert.equal(up.verdict, "up"); assert.equal(up.delta, 7); assert.ok(up.threshold! > 5 && up.threshold! < 6.5);
  const st = direction(share([["2025-04-01", 30, 1000], ["2025-11-01", 34, 1000]]));
  assert.equal(st.verdict, "stable");                                       // +4 within the error: not a change
  const down = direction(share([["2025-04-01", 40, 1000], ["2025-11-01", 33, 1000]]));
  assert.equal(down.verdict, "down");
});

test("no sample size → no arrow; one point → nothing to compare", () => {
  assert.equal(direction(share([["2025-04-01", 30, null], ["2025-11-01", 50, null]])).verdict, "none");
  assert.equal(direction(share([["2025-04-01", 30, 1000]])).verdict, "none");
});

test("monthly balances: the same month of the previous year, with the published SE", () => {
  const pts: any[] = [];
  for (let y = 2025; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 8) break;
    const d = `${y}-${String(m).padStart(2, "0")}`;
    pts.push([`${d}-01`, `${d}-28`, y === 2025 ? -22.6 : -29.6, 2000, 0.9, "r"]);
  }
  const s: Series = { id: "b", type: "t", kind: "survey", label: "l", source_id: "s", refs: [], points: pts,
    props: { statistic: "balance", compare: "same_month_previous_year" } };
  assert.equal(previousOf(s)![1], "2025-08-28");
  const d = direction(s);
  assert.equal(d.delta, -7); assert.equal(d.verdict, "down");              // threshold ≈ 3.6
});

test("official statistics: a change, not a perceived direction", () => {
  const s: Series = { id: "o", type: "t", kind: "official", label: "l", source_id: "s", refs: [],
    props: { frequency: "annuale" }, points: [["2024-01-01", "2024-12-31", 1.0, null, null, "r"], ["2025-01-01", "2025-12-31", 1.5, null, null, "r"]] };
  const d = direction(s);
  assert.equal(d.verdict, "change"); assert.equal(d.delta, 0.5); assert.equal(d.threshold, null);
});

test("reality and perception are paired by topic, never merged", () => {
  const r: Series = { id: "r", type: "t", kind: "official", label: "inflation", source_id: "e", refs: [], props: { topic: "prezzi" }, points: [] };
  const p: Series = { id: "p", type: "t", kind: "survey", label: "prices perceived", source_id: "b", refs: [], props: { topic: "prezzi" }, points: [] };
  const lone: Series = { id: "q", type: "t", kind: "survey", label: "trust", source_id: "b", refs: [], props: { topic: "istituzioni" }, points: [] };
  const pairs = pairsByTopic([r, p, lone]);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].topic, pairs[0].reality[0].id, pairs[0].perception[0].id], ["prezzi", "r", "p"]);
});

test("periods as the source dates them; margin of error only for surveys", async () => {
  const { periodLabel, marginOfError } = await import("../../src/lib/observations.ts");
  assert.equal(periodLabel(["2025-01-01", "2025-12-31", 1, null, null, "r"]), "2025");
  assert.equal(periodLabel(["2026-08-01", "2026-08-31", 1, null, null, "r"]), "ago 2026");
  assert.equal(periodLabel(["2025-10-09", "2025-11-05", 1, null, null, "r"]), "9 ott – 5 nov 2025");
  const s = share([["2025-04-01", 50, 1000]]);
  assert.equal(marginOfError(s, s.points[0]), 4.4);               // 1.96·√2·1.58
  assert.equal(marginOfError({ ...s, kind: "official" }, s.points[0]), null);
});
