# NEXUM — protests, violence and public order in the news (GDELT in the browser)

**Status (2026-10-18):** implemented and tested LOCALLY by the author's GO of 2026-10-18 ("GO sviluppo locale"):
no commit, no push, no deploy. Production (`nexum.pezzalihub.app`) is unchanged.

## Why

Audit of 2026-10-18 (case: Italy, 17 October 2026, clashes in Milan, Turin, Bologna, Bergamo):

- NEXUM had no source of public order that updates. UCDP covers organised violence with at least 5 deaths, monthly
  (data up to 2026-08-31). The only channel, the GDELT news table `newsevents`, is filled only by a manual fetch and
  was frozen at **2026-10-06 14:30–15:15 UTC** in every snapshot up to production live-949 (2026-10-18).
- The layer was still called "Notizie dal mondo (GDELT, ultima ora)" and grouped under "Avvisi in diretta";
  the Core's health said `ok` (it means only that the last download succeeded).
- D7 option A (browser → GDELT → on-demand refresh → snapshot fallback), approved on 2026-10-07, was never implemented,
  and `data.gdeltproject.org` was not in the Content-Security-Policy.
- Only GDELT's standard stream (English-language sources) was read, only root events, only the last hour.

## What changed (UI only; the Core, the pipeline and the workflows are untouched)

| Part | Where |
|---|---|
| GDELT read by the browser (D7 option A): `lastupdate.txt` and `lastupdate-translation.txt`, then the 15-minute exports of the chosen window, unzipped with `DecompressionStream("deflate-raw")`; timeouts (20 s per file), 4 requests at a time, failed files said; the snapshot's table as fallback, said **ARCHIVIO … non in diretta** | `ui/src/ops/gdelt.ts`, `ui/src/ops/alerts.ts` |
| Pure rules (no network): rows, categories, how sure the place is, which rows are one report | `ui/src/ops/gdeltcore.ts` |
| Categories, rules, labels, windows, retention, reliability texts (data, not code) | `ui/src/config/publicorder.json` |
| The feed's state, never "live": `aggiornato da GDELT ogni 15 min · ultimo file HH:MM UTC`, `GDELT IN RITARDO` after 45 minutes, `ARCHIVIO del …, non in diretta` | `ui/src/ops/newsstatus.ts`, `ui/src/ops/state.ts` (`newsStatus`) |
| Freshness of the sources presented as current: "non aggiornata" when the last success is older than declared (GDELT and FIRMS 24 h; USGS, EONET, CEMS, CelesTrak 48 h) | `ui/src/lib/freshness.ts`, `ui/src/config/freshness.json`, status bar, world summary, HUD |
| Layers: "Avvisi e notizie" (was "Avvisi in diretta"), "Notizie dal mondo (GDELT)" (was "…, ultima ora") with its state and window; FIRMS hotspots said "non aggiornati" when stopped | `ui/src/ops/Panels.tsx`, `ui/src/config/ops.json` |
| "Allerte e notizie" (was "Allerte dal vivo"): tab **Proteste e ordine pubblico**, categories with counts, the categories no source can tell apart | `ui/src/ops/Panels.tsx`, `ui/src/ops/OpsShell.tsx` |
| News card: category and every original CAMEO code with its description; place and why it is (not) confirmed; event date (GDELT's DAY); detected / last updated; stream; reliability; "NEXUM non riporta bilanci" | `ui/src/ops/Panels.tsx` |
| Map: a place not confirmed (or only a region / nation centre) is a HOLLOW point | `ui/src/ops/overlays.ts` |
| Events panel: what is covered only in part (public order: GDELT news; organised violence: UCDP) and what cannot be told apart | `ui/src/components/EventsCoverage.tsx`, `ui/src/config/events-coverage.json` |
| CSP `connect-src` + `https://data.gdeltproject.org` (one host, https, CORS `*`) | `ui/media-hosts.json` |
| Privacy table: GDELT moved from "always from the NEXUM site" to "only if you turn on the layer / open the tool" | `ui/src/config/ops.json` |

## Rules

**Categories** (CAMEO 1.1b3 codes, `publicorder.json`): protest (140–144 and sub-codes), clashes and riots (145 and
sub-codes), assault and physical violence (family 18), damage to property (171, 1712), police or authority action
(151, 153, 1711, 172x, 173, 174, 175), armed force (families 19, 20). **Fires during riots: not distinguishable** —
CAMEO has no such code; never inferred from the words of the articles. Vandalism has no code of its own.

**19x between police and a crowd:** an action coded 19x is shown among clashes only if GDELT coded BOTH actors with a
role — one police (COP), the other opposition, workers, students or civilians (OPP, LAB, EDU, CVL) — and every actor
nation, when given, is the nation of the place. The original code always stays visible.

**Place:** NEXUM uses only the place GDELT assigned. A city is **confirmed** only when an outlet of the same nation
reports it (its address's national domain) AND the article's own address names the city (same word, or the same name
spelled one letter apart; two for names longer than five). Otherwise it is **not confirmed** (hollow point, the card says
which check failed). Nation and region centres are **approximate** (hollow point).

**One report:** rows from the same article at the same place, or GDELT's same action (full code) at the same place
between the same actors in the same hour (the rule accepted on 2026-10-06). Never merely the same day, place or code.
Rows are unique by GDELT event id per stream.

**Kept rows:** the newest hour keeps every root action plus every lens action (root or not, a non-root one said
"menzione secondaria"); the older slots of the window keep only lens actions.

## Windows, traffic, retention (measured 2026-10-18 on the real GDELT, Chrome, CPU ×4 slower)

Default window: **1 hour** (the density of points the map had before; with 6 h a click on the world map at zoom 3
found more than 20 overlapping reports — the golden pass-5 tests). 6 h and 24 h are the person's choice, with their size.


| Window | Files | Download | Time | Points |
|---|---|---|---|---|
| 6 h, cold | 56 | 1.93 MB | 2.1 s | 3,987 |
| 24 h after 6 h (only the older slots) | 200 | +3.95 MB | 3.6 s | 10,560 |
| 1 h after 24 h | 16 (from memory) | 0 | 0.3 s | 1,757 |

File sizes of 17 October (256 files): export 45 KB, translingual export 40 KB, mentions 67 KB, translingual mentions
56 KB on average. JS heap growth stayed under 12 MB. Nothing is written on the device: the slots live in the page's
memory while they are inside the window; the browser's own cache keeps GDELT's files at most 1 hour
(`Cache-Control: public,max-age=3600`). Requests carry no NEXUM header, no cookie (`credentials: "omit"`), no referrer.

## What GDELT holds for the control case (17 October 2026, whole day, both streams: 116,514 rows)

- **Milan:** 411 rows, 136 of the public-order lens, 86 reports — clashes (145 and 19x), protests (141), damage
  (1712), police actions. Most come from the multilingual stream (Italian, Greek, Spanish, Russian… outlets).
- **Turin, Bologna, Bergamo:** **no row has them as place.** Articles about them were placed by GDELT in Milan
  (Torino 22, Bologna 27), Rome, "Italy", "Piedmont" or "Emilia-Romagna". NEXUM never moves them; the city stays
  "non confermato" when the address does not name it.
- **Rome (USA):** a US local article ("Rome man charged…", fox56.com) coded at Rome, Lazio, Italy: shown not confirmed.
- **Casualty and arrest figures:** never taken from GDELT or the articles.

## Limits that remain

- GDELT is automatic coding: wrong codes (a street clash as "military force" when an actor has no role), wrong
  places (the biggest city of the nation), articles about older facts. NEXUM says so; it cannot correct it.
- A city reported only by outlets of other nations (English-language agencies) stays "not confirmed".
- The window is at most 24 hours in the browser; older days are not available without a scheduled job (not approved).
- The published world still carries only the archive of 2026-10-06 (the pipeline does not fetch GDELT, D7).
- `page.clock` (Playwright) blocks the app's start: the "fresh" state is tested by the unit tests, the "late" state
  in the browser.

## Tests

`ui/tests/unit/gdelt.test.ts` (11, real files of 17 October in `ui/tests/fixtures/gdelt-20261017`),
`ui/tests/web/gdelt.spec.ts` (6) and `ui/tests/mobile/gdelt.spec.ts` (iPhone WebKit portrait/landscape, Fold closed/open,
tablet), with GDELT answered from the same files or refused.

Regression of 2026-10-18 (same snapshot live-716 for both builds; auto-update, bench, rollback, GPS navigation and
routing specs not run): web 177/179 new vs 178/179 baseline; mobile 126 passed, 3 failed, 11 skipped on both — the
same three pre-existing fold-closed failures (`mobile:36`, `mobile:135`, `stepA:32`). The two new web failures are the
golden `pass5` GDELT click tests: with LIVE GDELT data, at zoom 1.2 more than 20 reports sit on the very same pixel
(Washington, DC), beyond the card's 20 entries; with the archive data (GDELT refused by the policy) the new build passes
them (3/3). Python 188 passed, 3 skipped. UI unit 107/107.

## Publication and rollback (NOT executed: separate GO)

A push to `main` reaches production by itself at the next scheduled publish (03:23 UTC, `NEXUM_AUTO_PUBLISH=true`).
To test on the phones first:

1. Remove the repository variable `NEXUM_AUTO_PUBLISH` (the daily publish then deploys to the preview `live-review`).
2. Commit (author only, noreply address) and push to `main`; start a manual publish run (or wait for the scheduled one).
3. Physical test on the preview (iPhone, Fold closed and open): the news layer says its real time; the public-order
   tab; a card; GDELT refused (airplane mode after loading) → ARCHIVIO.
4. GO for production: set `NEXUM_AUTO_PUBLISH=true` again and run the publish; verify on the public site that the CSP
   holds `data.gdeltproject.org` and `version.json` is the new build.
4. Rollback: Cloudflare Pages → previous production deployment → *Rollback* (or the API), as in
   `NEXUM-EVENTS-AUTOMATION.md`; the change has no data migration, the snapshot is unchanged.

## Review of 2026-10-18 (author's GO, local)

Cases checked on the real GDELT files of 17–18 October (ids in `ui/tests/unit/gdelt.test.ts`): a Serbian crime story
(telegraf.rs, 1328567442) and Portuguese, Albanian, Macedonian articles placed in Milan; Italian articles naming Bologna
placed in Milan; a school march coded 190 (1328411666). Changes:

- **Place in three levels:** confirmed (same-nation outlet + city named in the article's address + no other city of
  the nation named, from NEXUM's places index), suggested by GDELT and not verified, ambiguous (another city named).
  Only confirmed places are points; the others are one circle per nation ("non hanno un punto preciso"), consultable.
  The sentence for a non-confirmed place: "Segnalazione dei media: … Luogo suggerito da GDELT, non verificato: …".
  No NEXUM place is offered for a non-confirmed place. Other cities are matched exactly ("sassi" is not Sassari).
- **Classification:** "Uso della forza (codice CAMEO militare)"; a 19x/20x code without an armed actor is flagged
  ambiguous ("non indica che sia intervenuto l'esercito"); codes of different categories in one article flagged;
  nothing inferred about injuries, arrests, looting, responsibility or gravity.
- **"Notizie e ordine pubblico" tool:** 1/6/24 h, filters (nation, city, category, place certainty), newest first, a
  city's confirmed and suggested reports in two lists, counts said as reports (not episodes), list ↔ map.
- **Card in sections:** what happened · where and when · who is involved (GDELT's categories, not organisations) ·
  attributions ("Nessuna attribuzione documentata disponibile") · documented connections (same article, same GDELT
  event; same outlet and same confirmed place said as coincidences) · original sources (outlet, language, stream,
  link; cookies and paywalls are the sites').
- **Dates:** the status bar says "fonti aggiornate al … · costruito il …"; the Events line takes its date from the
  sources the scheduled update refreshes, NOAA NCEI (updated by hand) gets its own date.
- **Crowded taps:** more than 20 reports under a tap → the card says how many more, with the list.
- **Globe:** news circles drawn on the globe's surface (`circle-pitch-alignment: map`): with the default, some views at
  zoom 3 drew no point (pre-existing, seen on the baseline too).
- **Tests:** golden and news specs answered by the frozen fixtures (deterministic); `tests/web/gdelt-live.spec.ts`
  checks the current GDELT apart; the navigation voice in the tests is silent (`volume = 0`), the person's voice unchanged.

Before/after (all reports in Milan, both streams; first version = city named + same-nation outlet):

| Day | Milan reports | First version: confirmed | Now: confirmed / suggested / ambiguous | Bologna-named articles in Milan confirmed (before → now) |
|---|---|---|---|---|
| 17 Oct | 194 | 41 | 34 / 145 / 15 | 6 → 0 (of 9) |
| 18 Oct | 263 | 55 | 51 / 197 / 15 | 1 → 0 (of 8) |

Actors, attributions and the graph: see `NEXUM-NEWS-ACTORS-GRAPH-PROPOSAL.md` (proposal, not implemented).
