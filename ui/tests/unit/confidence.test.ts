// W21 — the TypeScript formula reproduces the Core's confidence.recompute on 1,000 sampled decompositions
// (fixture written by bench/phase2/sample_factors.py from D1, D2 and D3).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recompute } from "../../src/lib/confidence.ts";

const file = new URL("../../../data/reports/phase2/factors.json", import.meta.url);

test("W21 confidence parity with the Core (tolerance 1e-12)", () => {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(rows.length, 1000);
  const worlds = new Set(rows.map((r: any) => r.world));
  assert.deepEqual([...worlds].sort(), ["d1", "d2", "d3"]);
  let bad = 0;
  for (const r of rows) for (const f of [r.factors, r.expanded]) if (Math.abs(recompute(f) - r.core) > 1e-12) bad++;
  assert.equal(bad, 0);
});
