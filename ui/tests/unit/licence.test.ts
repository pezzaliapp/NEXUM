// THE CATALOGUE'S LICENCE GATE (2026-10-07, Wave 1 — X-11): only licences recognised as open let a dataset in; any
// restriction closes the gate, even next to an open name; an empty or unknown text closes it too.
import assert from "node:assert/strict";
import test from "node:test";
import { licenceVerdict } from "../../src/ops/licence.ts";

test("open licences are recognised", () => {
  for (const [t, name] of [
    ["This work is licensed under a Creative Commons Attribution 4.0 International License.", "CC BY"],
    ["CC BY 4.0", "CC BY"], ["https://creativecommons.org/licenses/by/4.0/", "CC BY"],
    ["CC-BY-SA 4.0", "CC BY-SA"], ["CC0 1.0 Universal", "CC0"], ["Public Domain", "pubblico dominio"],
    ["Open Database License (ODbL) v1.0", "ODbL"], ["Contains public sector information licensed under the Open Government Licence v3.0.", "Open Government Licence"],
    ["Licenza IODL 2.0", "IODL"], ["Licence Ouverte / Open Licence Etalab 2.0", "Licence Ouverte (Etalab)"], ["dl-de/by-2-0", "Datenlizenz Deutschland"],
  ] as const) {
    const v = licenceVerdict(t);
    assert.ok(v.open, t);
    assert.equal(v.open && v.name, name, t);
  }
});

test("restricted or unknown licences are refused — even next to an open name", () => {
  for (const t of [
    "", "   ", "See terms.", "Esri Master License Agreement", "Use of this data is governed by the Esri Master License Agreement (MLA).",
    "© 2024 County. All rights reserved.", "Proprietary data", "CC BY-NC 4.0", "Creative Commons Attribution-NonCommercial 4.0",
    "CC BY-ND 4.0", "CC BY-NC-SA", "Public domain, but written permission is required for redistribution.",
    "Creative Commons Attribution 4.0 — all rights reserved for imagery", "For internal use only",
  ]) assert.equal(licenceVerdict(t).open, false, t);
  assert.equal(licenceVerdict(null).open, false);
  assert.deepEqual(licenceVerdict("Esri Master License Agreement"), { open: false, why: "licenza proprietaria Esri" });
});
