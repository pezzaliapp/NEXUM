// OPERATIONAL SURFACE (2026-10-04): the spherical measurements of the drawing tools, the shapes, the scale bar, the
// antimeridian split of orbit tracks and the SGP4 propagation the orbits and the sky rely on (positions computed, never
// observed). Fixed inputs, independent of the machine.
import assert from "node:assert/strict";
import test from "node:test";
import { bearing, boxRing, circleRing, compass, destination, fmtKm, fmtKm2, haversine, inRing, pathLength, ringArea, scaleFor } from "../../src/ops/geo.ts";
import { shapeOf, shapesGeoJSON, toCSV } from "../../src/ops/draw.ts";
import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic, gstime, json2satrec, propagate } from "satellite.js";

const PARMA: [number, number] = [10.3279, 44.8015], MILANO: [number, number] = [9.19, 45.4642], ROMA: [number, number] = [12.4964, 41.9028];

test("great-circle distances (±0.5 % of the ellipsoid)", () => {
  assert.ok(Math.abs(haversine(PARMA, MILANO) - 115.6) < 1.5, String(haversine(PARMA, MILANO)));
  assert.ok(Math.abs(haversine(MILANO, ROMA) - 477) < 4, String(haversine(MILANO, ROMA)));
  assert.equal(haversine(PARMA, PARMA), 0);
  // a quarter of the equator
  assert.ok(Math.abs(haversine([0, 0], [90, 0]) - 10007.5) < 1);
});

test("bearing, destination and compass agree", () => {
  assert.ok(Math.abs(bearing([0, 0], [0, 10])) < 1e-9);          // due north
  assert.ok(Math.abs(bearing([0, 0], [10, 0]) - 90) < 1e-9);     // due east on the equator
  const d = destination(PARMA, 100, 45);
  assert.ok(Math.abs(haversine(PARMA, d) - 100) < 1e-6);
  assert.ok(Math.abs(bearing(PARMA, d) - 45) < 0.1);
  assert.equal(compass(0), "N"); assert.equal(compass(90), "E"); assert.equal(compass(225), "SO"); assert.equal(compass(359), "N");
});

test("areas on the sphere: a 1°×1° cell at the equator and a circle", () => {
  const cell = ringArea([[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.ok(Math.abs(cell - 12363.7) < 15, String(cell));           // ≈ 111.2 km × 111.2 km
  const r = 10, circle = ringArea(circleRing(PARMA, r).slice(0, -1));
  assert.ok(Math.abs(circle - Math.PI * r * r) / (Math.PI * r * r) < 0.002, String(circle));
  assert.ok(Math.abs(pathLength(circleRing(PARMA, r)) - 2 * Math.PI * r) < 0.05);
});

test("inside a shape", () => {
  const ring = boxRing([10, 44], [11, 45]);
  assert.ok(inRing(PARMA, ring));
  assert.ok(!inRing(MILANO, ring));
  assert.ok(inRing(PARMA, circleRing(PARMA, 5)));
});

test("shapes: area, box, radius and path with their measures; GeoJSON and CSV", () => {
  const a = shapeOf("area", [[10, 44], [11, 44], [11, 45]], null)!;
  assert.equal(a.ring!.length, 4);
  assert.ok(a.km2 > 4000 && a.km2 < 4600, String(a.km2));
  const b = shapeOf("box", [[10, 44]], [11, 45])!;                  // the cursor is the provisional second corner
  assert.ok(Math.abs(b.km2 - ringArea(boxRing([10, 44], [11, 45]).slice(0, -1))) < 1e-6);
  const c = shapeOf("radius", [PARMA, destination(PARMA, 25, 0)], null)!;
  assert.ok(Math.abs(c.km - 25) < 1e-6);
  const p = shapeOf("path", [PARMA, MILANO, ROMA], null)!;
  assert.equal(p.ring, null);
  assert.ok(Math.abs(p.km - (haversine(PARMA, MILANO) + haversine(MILANO, ROMA))) < 1e-9);
  assert.equal(shapeOf("path", [PARMA], null), null);
  const fc = shapesGeoJSON([a, p]);
  assert.equal(fc.features[0].geometry.type, "Polygon");
  assert.equal(fc.features[1].geometry.type, "LineString");
  assert.equal(toCSV(["a", "b"], [["x,y", 'q"r'], [1, null]]), 'a,b\n"x,y","q""r"\n1,');
});

test("scale bar: 1-2-5 steps that fit", () => {
  const s = scaleFor(5, 45);
  assert.ok(s.px <= 100 && s.px > 30, JSON.stringify(s));
  assert.match(s.label, /^(1|2|5|10|20|50|100|200|500)(0)* (k?m)$/);
  assert.equal(fmtKm(0.25), "250 m");
  assert.equal(fmtKm2(12345.6), "12.346 km²");   // Italian groups from five digits
});

// An element set of the ISS (OMM, CelesTrak layout; the epoch is the reference instant of the check)
const ISS = { OBJECT_NAME: "ISS (ZARYA)", OBJECT_ID: "1998-067A", EPOCH: "2026-10-04T12:00:00.000", MEAN_MOTION: 15.50103472, ECCENTRICITY: 0.0006703,
  INCLINATION: 51.6416, RA_OF_ASC_NODE: 247.4627, ARG_OF_PERICENTER: 130.536, MEAN_ANOMALY: 325.0288, BSTAR: 0.00021, MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0, NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999 };

test("SGP4 from OMM elements: a station-like orbit stays at 400 ± 60 km, ±51.6° latitude, ~7.66 km/s", () => {
  const rec = json2satrec(ISS as any);
  for (let m = 0; m <= 180; m += 15) {
    const d = new Date(Date.parse("2026-10-04T12:00:00Z") + m * 60_000);
    const pv = propagate(rec, d) as any;
    const geo = eciToGeodetic(pv.position, gstime(d));
    assert.ok(geo.height > 340 && geo.height < 460, `${m}: ${geo.height}`);
    assert.ok(Math.abs(degreesLat(geo.latitude)) <= 52);          // geodetic latitude: a little above the inclination
    assert.ok(Math.abs(degreesLong(geo.longitude)) <= 180);
    const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
    assert.ok(v > 7.5 && v < 7.8, String(v));
  }
});

test("look angles: an object straight above the observer is at ~90° elevation and at its own altitude", () => {
  const rec = json2satrec(ISS as any);
  const d = new Date("2026-10-04T12:30:00Z");
  const pv = propagate(rec, d) as any;
  const g = gstime(d), geo = eciToGeodetic(pv.position, g);
  const la = ecfToLookAngles({ latitude: geo.latitude, longitude: geo.longitude, height: 0 }, eciToEcf(pv.position, g));
  assert.ok(la.elevation * 180 / Math.PI > 89, String(la.elevation));
  assert.ok(Math.abs(la.rangeSat - geo.height) < 2, `${la.rangeSat} vs ${geo.height}`);
});
