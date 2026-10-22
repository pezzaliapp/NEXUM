// Hotspots drawn as active fires only within the last 24 hours (UTC, the person's clock); the rest is the archive, said.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acquiredMs, hotNote, splitHotspots } from "../../src/lib/hotspots.ts";

const NOW = Date.parse("2026-10-21T12:00Z");
const row = (t: unknown) => [10, 45, 3.2, "n", t, "S"];

test("the table's acquired_utc is read as UTC; anything else is unreadable", () => {
  assert.equal(acquiredMs("2026-10-21T11:59"), Date.parse("2026-10-21T11:59Z"));
  for (const x of ["2026-10-21", "2026-10-21T11:59Z", "21/10/2026 11:59", "", null, 20261021, undefined]) assert.equal(acquiredMs(x), null, String(x));
});

test("recent data: every detection of the last 24 hours is drawn", () => {
  const s = splitHotspots([row("2026-10-21T11:00"), row("2026-10-20T12:00"), row("2026-10-21T12:30")], NOW);
  assert.equal(s.recent.length, 3);                                   // exactly 24 h old is still recent; 30 min ahead tolerated
  assert.equal(s.old, 0);
  assert.equal(hotNote({ ...s, recent: 3, error: false }), null);
});

test("stale data (the 3–4 October table seen on 21 October): nothing drawn, said as historical", () => {
  const s = splitHotspots([row("2026-10-03T00:01"), row("2026-10-04T16:20")], NOW);
  assert.deepEqual(s.recent, []);
  assert.equal(s.old, 2);
  assert.equal(s.oldestMs, Date.parse("2026-10-03T00:01Z"));
  assert.equal(s.newestMs, Date.parse("2026-10-04T16:20Z"));
  const n = hotNote({ recent: 0, old: 2, newestMs: s.newestMs, oldestMs: s.oldestMs, error: false })!;
  assert.equal(n.warn, true);
  assert.equal(n.text, "nessun rilevamento delle ultime 24 ore: i dati disponibili (acquisiti 3 ott 2026 – 4 ott 2026) sono storici e non sono mostrati come incendi attivi");
});

test("mixed data: only the recent ones; the older ones counted and left in the archive", () => {
  const s = splitHotspots([row("2026-10-21T06:00"), row("2026-10-20T11:59"), row("bad"), row("2026-10-21T14:00")], NOW);
  assert.equal(s.recent.length, 1);
  assert.equal(s.old, 3);                                             // 24 h + 1 min, unreadable, 2 h ahead of the clock
  assert.deepEqual(hotNote({ recent: 1, old: 3, newestMs: s.newestMs, oldestMs: s.oldestMs, error: false }),
    { warn: false, text: "3 rilevamenti più vecchi di 24 ore non mostrati (restano nell'archivio)" });
});

test("the same table later: detections leave the map as they turn 24 hours old (no network needed)", () => {
  const rows = [row("2026-10-21T06:00"), row("2026-10-21T11:00")];
  assert.equal(splitHotspots(rows, NOW).recent.length, 2);
  assert.equal(splitHotspots(rows, Date.parse("2026-10-22T08:00Z")).recent.length, 1);
  assert.equal(splitHotspots(rows, Date.parse("2026-10-22T11:01Z")).recent.length, 0);
});

test("source unreachable or empty: said, nothing drawn as active", () => {
  assert.deepEqual(hotNote({ recent: 0, old: 0, newestMs: null, oldestMs: null, error: true }),
    { warn: true, text: "rilevamenti non disponibili ora: nessun punto mostrato come incendio attivo" });
  assert.equal(hotNote({ recent: 0, old: 0, newestMs: null, oldestMs: null, error: false })!.text, "nessun rilevamento nella tabella pubblicata");
  assert.equal(hotNote(null), null);
  const one = Date.parse("2026-10-04T10:00Z");
  assert.match(hotNote({ recent: 0, old: 5, newestMs: one, oldestMs: one, error: false })!.text, /\(acquisiti 4 ott 2026\)/);
});

test("the two satellites' sources: each one failing, suspended or stale is said on its own; a world of before, unnamed", async () => {
  const { hotSourcesNote } = await import("../../src/lib/hotspots.ts");
  const day = Date.parse("2026-10-21T08:00Z");
  const ok = (id: string) => ({ source_id: id, health: "ok", last_success_ms: day });
  const none = () => null;
  assert.equal(hotSourcesNote([ok("nasa.firms"), ok("nasa.firms.noaa20"), ok("usgs.earthquakes")], none), null);
  assert.deepEqual(hotSourcesNote([ok("nasa.firms"), { ...ok("nasa.firms.noaa20"), health: "degraded" }], none),
    { warn: true, text: "NOAA-20: ultimo aggiornamento non riuscito (dati del 21 ott 2026)" });
  assert.equal(hotSourcesNote([{ ...ok("nasa.firms"), health: "suspended" }, { ...ok("nasa.firms.noaa20"), health: "degraded", last_success_ms: null }], none)!.text,
    "NOAA-20: ultimo aggiornamento non riuscito (nessun dato ricevuto); NOAA-21: fonte sospesa dopo errori ripetuti (dati del 21 ott 2026)");
  assert.equal(hotSourcesNote([ok("nasa.firms"), ok("nasa.firms.noaa20")], (s) => s.source_id === "nasa.firms" ? 3 : null)!.text,
    "NOAA-21: dati del 21 ott 2026, non aggiornati da 3 giorni");
  // a world published before the split: nasa.firms alone (then both satellites), said without a satellite's name
  assert.equal(hotSourcesNote([ok("nasa.firms")], () => 17)!.text, "dati del 21 ott 2026, non aggiornati da 17 giorni");
  assert.equal(hotSourcesNote(undefined, none), null);
});
