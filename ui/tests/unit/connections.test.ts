// Connections are the Core's records, ordered by nature; context is never presented as a connection.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConnections, excludedBy, firstSentence } from "../../src/lib/connections.ts";

const L = { typeLabel: (t: string) => ({ "transport.airport": "Aeroporto", "place.country": "Paese / territorio", "seismic.earthquake": "Terremoto",
  located_in: "si trova in" } as any)[t] ?? t, entityLabel: (id: string) => ({ obj_niger: "Niger", obj_mm: "Myanmar" } as any)[id] ?? null,
  entityKind: () => null, entityType: (id: string) => (id === "ins_a" ? "event_event_association" : id === "ins_b" ? "exposure_context" : null),
  day: (ms: number) => new Date(ms).toISOString().slice(0, 10), km: (n: number) => `${n} km`, duration: (ms: number) => `${ms} ms` };

test("an airport with one relation: explicit statement, located in → country with its WHY, nothing invented", () => {
  const c = buildConnections("obj_bilma", "object", "transport.airport", {}, {
    relations: { total: 1, groups: [{ type: "located_in", nature: "spatial", direction: "out", count: 1,
      items: [{ relation: { $ref: "rel_1" }, other: { $ref: "obj_niger" }, confidence: 0.97, independent_sources: 2 }] }] },
    related_events: { total: 0, items: [] }, insights: { total: 0, items: [] },
    geography: { nearby_100km: { total: 1, items: [{ $ref: "obj_dirkou", distance_km: 31.4 }] } } }, L);
  assert.equal(c.what, "Aeroporto");
  assert.equal(c.where, "Niger");
  // declared change (2026-10-01): a plain geographic link is context, never presented as a NEXUM discovery
  assert.equal(c.empty, "Nessuna connessione supportata trovata per questo elemento.");   // wording of 2026-10-02
  assert.deepEqual(c.rows, []);
  assert.deepEqual(c.geo.map((r) => [r.cat, r.target, r.phrase, r.why]), [["relation", "obj_niger", "si trova in", "rel_1"]]);
  assert.deepEqual(c.nearby, [{ id: "obj_dirkou", km: 31.4 }]);   // proximity: context only
});

test("an event: insights first, then its place; events sharing only one element are context", () => {
  const c = buildConnections("evt_q", "event", "seismic.earthquake", { t_start_ms: 0,
    participants: [{ object: { $ref: "obj_mm" }, role: "location", confidence: 0.9 }] }, {
    relations: { total: 0, groups: [] }, insights: { total: 2, items: [
      { ref: { $ref: "ins_a" }, confidence: 0.68, explanation: "Attivazione 3 h 21 min dopo, a 44,8 km. Associazione, non causa." },
      { ref: { $ref: "ins_b" }, confidence: 0.38, explanation: null }] },
    related_events: { total: 2, items: [{ $ref: "evt_x", reason: "shares_participant:obj_mm" }, { $ref: "evt_y", reason: "insight:ins_a" }] } }, L);
  assert.deepEqual(c.rows.map((r) => r.cat), ["insight", "insight"]);
  assert.deepEqual(c.geo.map((r) => [r.cat, r.phrase]), [["role", "luogo dell'evento"]]);   // declared change: geography apart
  assert.equal(c.rows[0].phrase, "associazione trovata da una regola");
  assert.equal(c.rows[0].detail, "Attivazione 3 h 21 min dopo, a 44,8 km.");
  assert.equal(c.rows[1].phrase, "contesto trovato da una regola");
  assert.equal(c.where, "Myanmar");
  assert.equal(c.empty, null);
  assert.deepEqual(c.sameTerritory, { via: "Myanmar", items: [{ id: "evt_x", t: undefined }] });
  assert.ok(!c.rows.some((r) => r.target === "evt_x"));
});

test("first sentence is a substring of the recorded explanation", () => {
  assert.equal(firstSentence("Entro 300 km dall'epicentro (us7000pn9s, 2025-03-28 06:20 UTC) si trovano 5 aeroporti. Informazione."),
    "Entro 300 km dall'epicentro (us7000pn9s, 2025-03-28 06:20 UTC) si trovano 5 aeroporti.");
  assert.equal(firstSentence(null), null);
});

test("excludedBy: a connected element hidden by the active filters, only on facts known for it", () => {
  const quake = { kind: "event", type: "seismic.earthquake", confidence: 0.95, source_id: "usgs", t: 1000 };
  const country = { kind: "object", type: "place.country", confidence: 0.9, source_id: "ne" };
  assert.deepEqual(excludedBy(country, {}), []);
  assert.deepEqual(excludedBy(country, { types: ["seismic.earthquake"] }), ["type"]);          // the Fold case
  assert.deepEqual(excludedBy(quake, { min_confidence: 0.96 }), ["confidence"]);
  assert.deepEqual(excludedBy({ ...country, confidence: null }, { min_confidence: 0.96 }), []);  // unknown: never counted
  assert.deepEqual(excludedBy(quake, { time_window: [2000, 3000] }), ["time"]);
  assert.deepEqual(excludedBy(country, { time_window: [2000, 3000] }), []);                     // objects have no time
  assert.deepEqual(excludedBy(quake, { sources: ["ne"] }), ["source"]);
  assert.deepEqual(excludedBy({ kind: "insight", type: "exposure_context", confidence: 0.4 }, { sources: ["ne"] }), []);
});
