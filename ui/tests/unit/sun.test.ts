// The Earth's illumination of the one Operational Map: the subsolar point follows the clock (equinoxes, solstices,
// noon at Greenwich), altitudes are coherent, and the night factor is continuous (no step, no band).
import { test } from "node:test";
import assert from "node:assert/strict";
import { nightFactor, solarAltitude, subsolar } from "../../src/lib/sun.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("subsolar latitude at the solstices and equinoxes", () => {
  near(subsolar(Date.UTC(2026, 5, 21, 12)).lat, 23.43, 0.1, "June solstice");
  near(subsolar(Date.UTC(2026, 11, 21, 12)).lat, -23.43, 0.1, "December solstice");
  near(subsolar(Date.UTC(2026, 2, 20, 12)).lat, 0, 0.5, "March equinox");
});

test("around 12:00 UTC the Sun is overhead near Greenwich (equation of time within ±4.5°)", () => {
  for (const m of [0, 3, 6, 9]) near(subsolar(Date.UTC(2026, m, 15, 12)).lon, 0, 4.5, `month ${m + 1}`);
  assert.ok(Math.abs(subsolar(Date.UTC(2026, 3, 15, 0)).lon) > 170);
});

test("altitudes: 90° under the Sun, −90° at the antipode, Europe in daylight at noon and in darkness at midnight", () => {
  const s = subsolar(Date.UTC(2026, 9, 3, 12));
  near(solarAltitude(s.lat, s.lon, s), 90, 1e-6, "subsolar");
  near(solarAltitude(-s.lat, s.lon + 180, s), -90, 1e-6, "antipode");
  assert.ok(solarAltitude(45.5, 9.2, s) > 30, "Milan at noon");
  assert.ok(solarAltitude(45.5, 9.2, subsolar(Date.UTC(2026, 9, 3, 0))) < -30, "Milan at midnight");
});

test("the night factor is continuous and monotone across the terminator (no band, no step)", () => {
  assert.equal(nightFactor(10), 0);
  assert.equal(nightFactor(-20), 1);
  let prev = 0;
  for (let h = 2; h >= -14; h -= 0.05) {
    const f = nightFactor(h);
    assert.ok(f >= prev - 1e-12, "monotone");
    assert.ok(f - prev < 0.02, `no jump at ${h.toFixed(2)}°`);
    prev = f;
  }
});
