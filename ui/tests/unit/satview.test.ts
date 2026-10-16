// SATELLITE VIEW (2026-10-15): the fields drawn on the map, the class of an image, the age of orbital elements, the
// service's own time slots — and the configuration's promise that every product belongs to its satellite alone.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { haversine } from "../../src/ops/geo.ts";
import { capRing, classify, epochAgeDays, fmtAge, fmtUTC, horizonDeg, slotBack, swathQuads, wmsSlots } from "../../src/ops/satgeo.ts";

const NOW = Date.parse("2026-10-15T20:00:00Z");
const CFG = JSON.parse(fs.readFileSync(new URL("../../src/config/satview.json", import.meta.url), "utf8"));

test("classes: newest and recent → latest; older or not the newest → historical; no time → none", () => {
  assert.equal(classify(true, NOW - 30 * 60_000, NOW, 3 * 3_600_000), "latest");
  assert.equal(classify(true, NOW - 5 * 86_400_000, NOW, 3 * 86_400_000), "historical");   // a satellite that stopped delivering
  assert.equal(classify(false, NOW - 3_600_000, NOW, 3 * 3_600_000), "historical");          // an earlier frame asked by the person
  assert.equal(classify(true, NaN, NOW, 1), "none");
});

test("orbital elements: age in whole days, epochs without a zone read as UTC", () => {
  assert.equal(epochAgeDays("2026-10-04T12:43:41.833920", NOW), 11);
  assert.equal(epochAgeDays("2026-10-15T19:00:00Z", NOW), 0);
  assert.equal(epochAgeDays("not a date", NOW), null);
});

test("times: a day stays a day; ages in minutes, hours, days", () => {
  assert.equal(fmtUTC("2026-10-14"), "2026-10-14 (solo data, UTC)");
  assert.equal(fmtUTC("2026-10-15T19:40:00Z"), "2026-10-15 19:40 UTC");
  assert.equal(fmtAge("2026-10-15T19:40:00Z", NOW), "20 min fa");
  assert.equal(fmtAge("2026-10-15T14:00:00Z", NOW), "6 ore fa");
  assert.equal(fmtAge("2026-10-14", NOW), "ieri (UTC)");
  assert.equal(fmtAge("2026-10-15", NOW), "oggi (UTC)");
});

test("horizon: ISS ≈ 20°, geostationary ≈ 81°", () => {
  assert.ok(Math.abs(horizonDeg(420) - 20.3) < 0.3, String(horizonDeg(420)));
  assert.ok(Math.abs(horizonDeg(35786) - 81.3) < 0.2, String(horizonDeg(35786)));
  assert.equal(horizonDeg(0), 0);
});

test("cap ring: radius kept, longitudes continuous across the antimeridian, none over a pole", () => {
  const r = capRing([179, 10], 20)!;
  for (const p of r) assert.ok(Math.abs(haversine([179, 10], [((p[0] + 540) % 360) - 180, p[1]]) - 20 * Math.PI * 6371.0088 / 180) < 1);
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i][0] - r[i - 1][0]) < 30, "no jump across the map");
  assert.equal(capRing([0, 75], 20), null);
});

test("swath: quads of the stated width, none drawn across the whole map", () => {
  const track: [number, number][] = [[170, 0], [175, 1], [179.5, 2], [-176, 3], [-171, 4]];
  const q = swathQuads(track, 290);
  assert.equal(q.length, 3);                                   // the step over the antimeridian is left out
  for (const quad of q) {
    assert.ok(Math.abs(haversine(quad[0], quad[3]) - 290) < 3, String(haversine(quad[0], quad[3])));
    const lons = quad.map((p) => p[0]);
    assert.ok(Math.max(...lons) - Math.min(...lons) < 180);
  }
});

test("WMS time slots: the service's latest, earlier slots inside its declared range", () => {
  const s = wmsSlots("2024-09-23T02:00:00.000Z/2026-10-15T20:00:00.000Z/PT10M", "2026-10-15T20:00:00Z");
  assert.equal(s.latest, "2026-10-15T20:00:00Z");
  assert.equal(slotBack(s.latest!, 6, s.start), "2026-10-15T14:00:00Z");
  assert.equal(slotBack(s.latest!, 24 * 900, s.start), null);
  assert.equal(wmsSlots("2026-10-15T19:50:00Z,2026-10-15T20:00:00Z", null).latest, "2026-10-15T20:00:00Z");
});

test("configuration: one satellite per product, attribution and instrument always stated", () => {
  const layers = new Set<string>(), platforms = new Set<string>();
  for (const [norad, s] of Object.entries<any>(CFG.sats)) {
    assert.ok(/^\d+$/.test(norad));
    assert.ok(s.name && s.instrument && s.source && s.attribution, norad);
    assert.ok(["video", "geo", "stac", "daily"].includes(s.kind), norad);
    if (s.kind === "daily") {
      assert.ok(!layers.has(s.layer), `layer shared: ${s.layer}`); layers.add(s.layer);
      assert.ok(s.cmr && s.swath_km > 0, norad);
    }
    if (s.kind === "stac") { assert.ok(!platforms.has(s.platform)); platforms.add(s.platform); assert.ok(s.swath_km > 0); }
    if (s.kind === "geo") for (const p of s.products) { assert.ok(p.layer.startsWith("mtg_fd:"), "Meteosat-12 products are MTG full-disc layers only"); }
    if (s.kind === "video") assert.ok(s.playlist && s.channel);
  }
  // the satellites the MVP promises
  for (const n of ["25544", "54743", "40697", "42063", "60989", "43013", "54234"]) assert.ok(CFG.sats[n], n);
});
