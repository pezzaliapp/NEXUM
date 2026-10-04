# NEXUM — FINAL DATA INTEGRITY + DISCOVERY GATE

Date: 2026-10-04 · Author: Alessandro Pezzali · No commit, no push, no production, no DNS.
World: `live` (rebuilt 2026-10-04) · method: trace UI statement → normalized value → transformation → raw record → source →
definition/unit/period/geography → acquisition time. Missing data are acceptable; wrong data are not.


> **Update 2026-10-04 (completion):** the open points of §19 on pay, cost of living, webcams and fuel were worked on:
> see `NEXUM-WORLD-INTELLIGENCE-REPORT.md`, section "Completion". The ILOSTAT earnings stay AMBIGUOUS, now apart in
> "Dati disponibili con limiti metodologici"; the overview answers with Eurostat/OECD pay whose definition holds.

## 1. Executive verdict

**CONDITIONAL GO** for physical verification on live-review.
- Proven failures fixed: Italy wage presented as "gross monthly wage" (definition not verifiable), country search buried by
  events (Sudan / South Sudan / Niger / Nigeria), "N airports" counting mixed aviation facilities (incl. closed ones),
  UCDP technical codes dominating labels, a storm losing its position (regression I introduced), share/ratio misclassification,
  source anomalies not flagged, Parma not reachable from the city.
- Not fixed (documented): source-level quasi-duplicate storms (EONET), WB per-capita population basis (UA, CY, TZ),
  wage comparability (no comparable global source), Parma preview (legally/technically BLOCKED: link only).
- Webcams: usable, but the subsystem stays CONDITIONAL until the physical test.

## 2. Frozen systems (untouched)
Illumination (UTC solar geometry, terminator, night darkness), VIIRS 2016 reference lights (asset, curve, resolution, opacity),
layer order, borders, map styling, desktop breakpoint, Fold/mobile architecture, Graph, Timeline, Trail, Core (W1: `nexum/core`
differs from Phase 1 only by `query.py`, as approved), stable IDs, evidence/relation/provenance models, satellite on-demand
architecture, Country View tab architecture, clean default map. The 6 frozen light files: sha256 identical before and after.

## 3. Italy wage — root cause
UI (before): "Retribuzione media mensile (lorda) · 3534 valuta nazionale al mese · 2025 · ILOSTAT".
| Question | Answer (traced) |
|---|---|
| Series | ILOSTAT `EAR_EMTA_SEX_CUR_NB_A` "Average monthly earnings of employees by sex and currency", sex total, CUR_TYPE_LCU |
| Source of the Italian value | `BB:3069` "HIES – EU Statistics on Income and Living Conditions", ILO micro-data processing, age ≥ 16 |
| Value in source | **3,534.346 EUR — present as is**; NEXUM did not convert, divide or multiply (only rounding to 3534.35) |
| Gross / net | **not stated** by the series for this source |
| Monthly derivation | **not documented** (EU-SILC collects annual employee income) |
| Period | "2025" = **EU-SILC survey year**; EU-SILC incomes refer to the previous calendar year |
| Mapping | Italy (ITA → IT) correct |
| Series break | 2020 = 1,365 EUR (LFS, `BA:325`), 2021 = 3,078 EUR (EU-SILC): different instruments (NEXUM never splices: one source per country) |
| Independent check | Eurostat `nama_10_fte` (average full-time-adjusted salary per employee, national accounts) Italy 2024 = **33,523 EUR/year = 2,794 EUR/month** → ILOSTAT +26 % (FR +22 %, DE +11 %) |

**Root cause:** the label "(lorda)" and the plain "2025" were NEXUM's assumptions, not the source's definition; the value
is a correct copy of an ILOSTAT estimate whose concept (gross/net, monthly derivation, reference year) is not verifiable and
differs by source type. **Same logic, every country:** latest-source types of the 184 areas with mean earnings: LFS 85,
household income surveys 57, establishment surveys 14, household surveys 11, administrative 10, other 7 — heterogeneous.
**Fix:** `connectors/ilostat_earnings.py` 1.1.0 — mean and median earnings published as **AMBIGUOUS** (new nature), label
"Retribuzione mensile media dei dipendenti (ILOSTAT)", every value carries its readable source, currency and notes, and for
EU-SILC "anno dell'indagine: i redditi si riferiscono all'anno precedente". Not in Panoramica (a line says the value is
ambiguous); in Vivere with the tag "ambiguo"; comparison marked "NON CONFRONTABILE". The statutory minimum wage (157 of 175
from administrative sources) keeps its plain definition.

## 4. Country indicator integrity
- Traced families: population (WB/UN WPP), economy (WB), wages (ILOSTAT), prices (WB ICP, FAO FPMA, fuel sources),
  energy (Ember, EIA, Eurostat flows), water (WB/JMP/AQUASTAT), government (Wikidata), opinion (Eurobarometer, BCS),
  security (UCDP), observation (GIBS/EUMETView).
- Deterministic sanity checks over **232,281 values** and 8,027 identity checks (age shares sum, mix sum, GDP = GDPpc × pop,
  demand = generation + net imports):

| Check | Result | Classification |
|---|---|---|
| future periods | 0 | — |
| ratios misclassified as shares (water stress, trade % GDP, energy import dependency) | 399 values > 100 or < 0 | **NEXUM error** (statistic) → fixed to "ratio" |
| shares outside 0–100 published by the source | 31 (Ember 2025 provisional, AQUASTAT e.g. Bolivia agriculture 521 %) | source anomaly → **flagged "anomalia nella fonte"**, never changed |
| negative amounts published by the source | 11 (Ember 2025 provisional, e.g. Costa Rica other fossil −1.15 TWh) | source anomaly → flagged |
| age shares ≠ 100 (±1) | 0 / 2,123 | OK |
| electricity mix ≠ 100 (±1.5) | 0 / 1,921 | OK |
| demand ≠ generation + net imports | 0 / 1,915 | OK |
| GDP ≠ GDPpc × population (±3 %) | 33 (Ukraine, Cyprus, Tanzania, all years) | source: WB per-capita uses its own population basis — documented |
- Units: every indicator states unit, period, source and nature; PPP values only in "$ internazionali PPA"; local currency
  never shown as USD; annual values never as monthly (wages: monthly as published, flagged ambiguous).
- Per-capita values computed by NEXUM only for the same year (formula and sources shown, tag "calcolato da NEXUM").

## 5. Sudan / South Sudan search
**Root cause (proven):** the Core full-text search (frozen, `nexum/core/query.py` `search`) ranks the best `max_items × 4`
documents and applies the type filter afterwards; thousands of UCDP labels ("Sudan: Government · Sudan") outrank the
country, so "Sudan", "Niger", "Nigeria" did not even return the country (type-filtered: `Sudan → [S. Sudan]`,
`Niger → []`). **Fix (API/UI layer, no Core change):** `/places-index` (242 explorable places, labels + source names, 26 KB,
read on the first search) → exact name first (label before source names), then name prefix, then word prefix; places are a
first group, never duplicated below. Clear names where the source label is abbreviated and the place is a sovereign state:
"South Sudan (S. Sudan)", "Democratic Republic of the Congo (Dem. Rep. Congo)", "Equatorial Guinea (Eq. Guinea)",
"Dominican Republic (Dominican Rep.)" (search results and the place header; Core labels unchanged — D1 frozen).
Regression: unit (17 names) + web (15 queries: Sudan, suda, South Sudan, S. Sudan, Congo, DRC, Republic of the Congo,
Guinea, Guinea-Bissau, Equatorial Guinea, Dominica, Dominican Republic, Niger, Nigeria, Georgia, Italia).

## 6. Infrastructure taxonomy
"Aeroporti 86,151" = small airport 42,762 · heliport 23,224 · **closed 13,548** · medium 4,106 · seaplane base 1,273 ·
large 1,175 · balloonport 63. South Sudan "103" = 93 small, 4 heliports, 3 medium, 2 closed, 1 large.
**Fix:** type "Struttura aeronautica", group "Strutture aeronautiche", per-country breakdown by kind (readable names) with
the note "anche strutture chiuse; il numero non è un numero di aeroporti in funzione". Same principle: "Porti e approdi"
(by WPI harbour size, incl. very small), "Centrali elettriche" (by fuel; GPPD ≥ 20 MW, 2021; operating status not stated).
Facts show readable values ("eliporto", "chiusa (secondo la fonte)").

## 7. Event integrity
| Family | n | future t | bad coords | no geometry | end<start | close pairs (<1 h, <10 km) | latest |
|---|---|---|---|---|---|---|---|
| earthquakes (USGS) | 5,498 | 0 | 0 | 0 | 0 | 162 (aftershocks, distinct IDs) | 2026-09-29 |
| wildfires (EONET) | 4,906 | 0 | 0 | 4 (source) | 0 | 110 (distinct IDs) | 2026-09-29 |
| organised violence (UCDP) | 1,982 | 0 | 0 | 0 | 0 | 76 (distinct dyads) | 2026-08-31 |
| storms (EONET) | 1,085 | 0 | 0 | **0** (was 1, fixed) | 0 | 14 (**source quasi-duplicates**: same storm under two EONET ids, e.g. "10w"/"Mindulle") | 2026-10-01 |
| Copernicus EMS | 1,065 | 0 | 0 | 0 | 0 | 0 | 2026-09-15 |
| significant earthquakes / tsunamis / eruptions (NCEI) | 737 / 254 / 91 | 0 | 0 | 0 | 0 | 0 | 2026-08 / 08 / 05 |
| volcanic activity (EONET) | 569 | 0 | 0 | 0 | 0 | 0 | 2026-06-15 |
| floods / landslides (EONET) | 114 / 2 | 0 | 0 | 0 | 0 | 0 | **2018** (category no longer fed: STALE) |
Primary-source checks: USGS 5/5 identical (time, position, magnitude); EONET wildfires 3/3 and storms 2/2 (position shown
and its own time are a source position); UCDP 3/3 against the raw file (deaths, date, coordinates); NCEI 2 checked.
Fixed: storm position chosen among valid source points only (Super Typhoon Maria 2018 had lost its geometry because its
first source point has latitude 93 — a regression of my earlier tie-break). Noted: UCDP attributes Gaza events to "Israel"
(source country attribution; disputed borders).

## 8. Connection integrity
All 30 active rules: wording audited; every exposure rule states "vicinanza registrata, non una stima di danni né un
rapporto di causa"; associations "non un rapporto di causa"; government "contesto temporale: non indica alcuna causa né
responsabilità". No misleading statement found → no change. The retired webcam↔event rule stays retired.

## 9. Conflict & security
RED = ≥ 3 lethal events or ≥ 25 deaths in ≥ 2 events in a first-level unit, 90 days of UCDP data; ORANGE = a state-based
event with a documented foreign state actor (never proximity). 201 zones (190 red, 11 orange), window 2026-06-03 → 2026-08-31;
drawn as 0.5° cells holding the events (never a whole country). "Perché questa zona?" lists rule, window, events (UCDP id,
date, deaths best/low/high, sides) and source. UCDP labels: provisional codes no longer in labels ("Violenza organizzata
(attori non identificati dalla fonte) · place"); the code stays in the event's facts. Not real time (3–7 weeks), stated.

## 10. Webcam audit
| Source | records | data status | sample (image as NEXUM loads it) | median age |
|---|---|---|---|---|
| Caltrans | 3,591 | current 3,395 · offline 196 | 15/15 · 0 placeholders in 40 | 1 min |
| USGS NIMS | 1,121 | current 925 · stale 196 | 14/15 | 7.5 h |
| DriveBC | 1,045 | current 1,030 · offline 15 | 15/15 · 0 placeholders in 40 | n/d |
| Hong Kong TD | 1,013 | current 1,013 | 15/15 | 1 min |
| Fintraffic | 809 | current 809 | 15/15 | 2 min |
| Vegagerðin | 496 | current 496 | 15/15 | ~0 min |
| Madrid | 357 | current 357 | 15/15 | 5 min |
| AVO | 60 | current 51 · stale 9 | 15/15 | 24 min |
| Lyon | 15 | current 15 | 13/15 (1 small, 1 error) | n/d |
| Genève | 9 | current 9 | 8/9 | ~0 min |
| Parma (curated) | 1 | link only | BLOCKED | — |
Internal classes: LIVE_STREAM 0 · CURRENT_SNAPSHOT 8,100 · STALE (shown "NON DISPONIBILE · immagine ferma") 205 ·
OFFLINE 211 · BLOCKED/link only 1 · METADATA_ONLY 0 · DEAD/UNKNOWN: sample error rate ≈ 2.5 % (4/159). No JPEG is called LIVE.

## 11. Parma golden test
Original publisher: Comune di Parma page "Webcam su Piazza Garibaldi" → SkylineWebcams page (camera id 722), HLS with session
token, thumbnail `cdn.skylinewebcams.com/live722.jpg`: with a foreign Referer it answers a 117-byte HTML (anti-hotlink);
loading it without Referer would circumvent that protection and Skyline's terms forbid reproduction. **Verdict: BLOCKED —
link only** (legal + technical). Flow now: search "Parma" → Parma (city) → "Webcam nelle vicinanze" → "Webcam di Piazza
Garibaldi · Palazzo del Governatore (Parma)" 1.1 km · SOLO COLLEGAMENTO → "APRI WEBCAM ↗" (publisher page); no image request
by NEXUM. Also found by "webcam Parma", "Parma webcam", "Piazza Garibaldi Parma", "webcam Piazza Garibaldi".

## 12. Satellite metadata / licensing
Products: Meteosat MTG (EUMETView, CC BY 4.0, "Contains modified EUMETSAT Meteosat data"), GOES / Himawari (NASA GIBS,
NOAA/JMA data), VIIRS NOAA-20 daily, HLS 30 m (Copernicus Sentinel / Landsat attribution). Time: GIBS from the service's
Acquisition-Time header; daily products date-only (age in days, never an invented hour); EUMETView: the requested 10-minute
frame time (the frame is verified as an image; nearest-frame snapping by the service not verified — documented). Classes:
NEAR REAL-TIME (geostationary latest), LATEST AVAILABLE (daily, 30 m), HISTORICAL (past dates / earlier frames). Empty frames
rejected. On demand only. Unchanged.

## 13. Worldwide coverage matrix
See Appendix A (95 indicators + observation families, generated from the published data): population 149–193, economy
173–193, energy 141–193, water 137–192, staple prices 17–45 (FAO national averages), fuel 34, opinion 32–36, wages 133–165
**all NOT COMPARABLE**. Global = ≥ 180 only.

## 14. Government
Wikidata (CC0): heads of state 128 unique + 4 collegial + 8 none; heads of government 127 + 8 none; head of state and
government 54 + 1 collegial; 0 flagged conflicts; 0 terms starting in the future. Italy: Mattarella (since 2015-02-03),
Meloni (since 2022-10-22). Limitation: Wikidata only, no official cross-check in this world; privacy gate still to approve
before production; no expansion.

## 15. Public opinion
Unchanged: survey observations with question, sample, fieldwork, method; perceived direction only beyond the sampling error;
reality and perception side by side, never combined; no social sentiment, no score.

## 16. Data-status model
Published natures: observed · reported · estimated (tag "stima") · modelled ("modellato") · **ambiguous** ("ambiguo", new) ·
calculated by NEXUM ("calcolato da NEXUM"); per value: "dato vecchio" (stale), "anomalia nella fonte" (new); per section:
"Dati non disponibili" (gap list with source coverage); comparison: "NON CONFRONTABILE".
Mapping: AVAILABLE = reported/observed · PARTIAL = coverage < 193 shown per indicator · STALE = tag · ESTIMATED/MODELLED = tags ·
CALCULATED_BY_NEXUM = tag · NOT_COMPARABLE/AMBIGUOUS = ambiguous nature · NOT_AVAILABLE = gap list.

## 17. Performance (O6 / O7, not exceeded)
O6 initial transfer: 989,114 B desktop / 922,780 B phone (limit 1,000,000) — PASS. O7: 8,915 files (limit 9,000; margin 85) —
PASS. O8 cold p95 616 ms — PASS. O9: first search PASS; following searches on simulated Fast 4G FAIL (pre-existing, unchanged
open item). The new globals (`places-index`, `event-webcams`) are fetched lazily (search focus, card opened), not at start.

## 18. Fixes applied (exact)
| Area | Fix | Files |
|---|---|---|
| Wages | ILOSTAT mean/median earnings → nature AMBIGUOUS, source/survey note per value, labels without "lorda"; not in the overview; compare "NON CONFRONTABILE" | `connectors/ilostat_earnings.py` 1.1.0, `connectors/indicator_common.py`, `ui/src/views/PlaceView.tsx`, `ui/src/components/Indicators.tsx`, `ui/src/components/Observations.tsx`, `ui/src/lib/strings.ts` |
| Sanity | 399 ratio indicators mislabelled "share" → "ratio"; source anomalies flagged ("anomalia nella fonte"), never changed | `connectors/worldbank_indicators.py`, `connectors/ember_yearly.py`, `connectors/indicator_common.py`, `vocab_live/indicators.toml` |
| Search | places index first (exact/prefix/word-prefix), clear sovereign name for abbreviated labels, no shortcut when the whole text is a place | `nexum/api/server.py` (`places_index_of`), `nexum/snapshot/build.py`, `ui/src/snapshot/routes.ts`, `ui/src/lib/places.ts` (new), `ui/src/components/SearchBox.tsx`, `ui/src/views/ObjectMode.tsx` |
| Taxonomy | "Struttura aeronautica" + breakdown by kind with note; ports and power plants by subtype | `vocab_live/transport.toml`, `vocab_live/infrastructure_live.toml`, `nexum/api/server.py` (`subtypes`), `ui/src/views/PlaceView.tsx` |
| Events | storm position chosen among valid coordinates (fixes a regression of mine: Maria 2018) | `connectors/nasa_eonet.py` 1.3.0 |
| Security | UCDP provisional codes no longer lead the label ("Violenza organizzata (attori non identificati dalla fonte)"), code kept in facts | `connectors/ucdp_candidate.py` 1.3.0 |
| Webcams | webcams near a city (≤ 10 km) on its card; Parma reachable, LINK ONLY | `vocab_live/geography.toml`, `nexum/api/server.py` (`event_media_of` by_place), `ui/src/components/Imagery.tsx` |
| P0 worker lifecycle | worker exits when its parent dies; SIGTERM/SIGHUP close workers; a request past deadline + 5 s ends its process and a fresh worker replaces it; `/insight-summaries` keeps whole summaries within the byte budget (D2: hours → 0.7 s; live output byte-identical) | `nexum/api/server.py`, `nexum/api/__main__.py` |

## 19. Unresolved
- Wages: no globally comparable gross monthly wage exists in the open sources used; all mean/median earnings stay AMBIGUOUS.
- 14 quasi-duplicate EONET storms (source); floods/landslides stale since 2018 (source frozen) — shown with their dates.
- GDP identity differs for UA/CY/TZ (World Bank population basis) — documented, not changed.
- Parma image: BLOCKED by the publisher (anti-hotlink + terms) — link only by design.
- Government: Wikidata only; privacy gate to approve before production.
- O9 following searches on Fast 4G; O7 margin 85 files.
- Housing / household utility prices not integrated (coverage gap, Appendix A).

## 20. Golden regression tests
Web (`ui/tests/web/gate.spec.ts`): E search (15 similar names, places before events) · A/B Italy wage AMBIGUOUS with source and
survey year · C South Sudan facilities by kind, readable UCDP labels, zone window · D Sudan own view · F/G Parma city → nearby
webcam LINK ONLY, no request to the publisher · Q/R/S stale / modelled / not available. Python (`tests/test_world_intelligence.py`,
17): ILO ambiguous, anomaly flags, ratio statistics, storm geometry, UCDP label, subtypes, places index. Unit
(`ui/tests/unit/places.test.ts`). P0 (`tests/test_worker_lifecycle.py`, 6): busy worker ends with its parent (SIGKILL, SIGTERM),
deadline overrun replaces the worker, service closes workers on SIGTERM/SIGINT/SIGHUP — fails 3/6 without the fix.

## 21. Physical verification needed (live-review)
Search "suda", "South Sudan", "Congo", "Niger"; Italy → Vivere (wage "ambiguo"), Energia (stale tag); South Sudan →
Infrastrutture (aviation breakdown), Sicurezza; Parma → "Webcam nelle vicinanze" → Piazza Garibaldi link; phone layout of these cards.

## 22. Verdict
**CONDITIONAL GO** — data integrity issues found are fixed or explicitly labelled; nothing is presented as more certain than its
source. Condition: physical review of §21 on live-review. No commit, no push, no production.

## Appendix A — Coverage matrix (UN 193, generated from the published snapshot)
| Sezione | Indicatore | Fonte | Licenza | TOTAL | GOOD | STALE | NOT COMPARABLE | NO DATA | Ultimo periodo |
|---|---|---|---|---|---|---|---|---|---|
| economia | Prodotto interno lordo (PIL) | worldbank.indicators | CC-BY-4.0 | 192 | 187 | 5 | 0 | 1 | 2025 |
| economia | PIL pro capite | worldbank.indicators | CC-BY-4.0 | 192 | 187 | 5 | 0 | 1 | 2025 |
| economia | PIL pro capite a parità di potere d'acquisto | worldbank.indicators | CC-BY-4.0 | 189 | 184 | 5 | 0 | 4 | 2025 |
| economia | Crescita del PIL reale | worldbank.indicators | CC-BY-4.0 | 191 | 187 | 4 | 0 | 2 | 2025 |
| economia | Reddito nazionale lordo pro capite (metodo Atlas) | worldbank.indicators | CC-BY-4.0 | 190 | 185 | 5 | 0 | 3 | 2025 |
| economia | Reddito nazionale lordo pro capite (PPA) | worldbank.indicators | CC-BY-4.0 | 189 | 184 | 5 | 0 | 4 | 2025 |
| economia | Esportazioni di beni e servizi | worldbank.indicators | CC-BY-4.0 | 173 | 165 | 8 | 0 | 20 | 2025 |
| economia | Importazioni di beni e servizi | worldbank.indicators | CC-BY-4.0 | 173 | 165 | 8 | 0 | 20 | 2025 |
| economia | Tasso di occupazione (15 anni e più) | worldbank.indicators | CC-BY-4.0 | 178 | 176 | 2 | 0 | 15 | 2025 |
| energia | Produzione di elettricità | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Domanda di elettricità | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Import netti di elettricità | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Import di elettricità | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Export di elettricità | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Consumo netto di elettricità | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Produzione elettrica da nucleare | ember.yearly | CC-BY-4.0 | 174 | 173 | 1 | 0 | 19 | 2025 |
| energia | Produzione elettrica da solare | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Produzione elettrica da eolico | ember.yearly | CC-BY-4.0 | 182 | 181 | 1 | 0 | 11 | 2025 |
| energia | Produzione elettrica da idroelettrico | ember.yearly | CC-BY-4.0 | 181 | 180 | 1 | 0 | 12 | 2025 |
| energia | Produzione elettrica da gas | ember.yearly | CC-BY-4.0 | 181 | 180 | 1 | 0 | 12 | 2025 |
| energia | Produzione elettrica da carbone | ember.yearly | CC-BY-4.0 | 182 | 181 | 1 | 0 | 11 | 2025 |
| energia | Produzione elettrica da petrolio e altri fossili | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Produzione elettrica da bioenergia | ember.yearly | CC-BY-4.0 | 184 | 183 | 1 | 0 | 9 | 2025 |
| energia | Produzione elettrica da altre rinnovabili (soprattutto geotermico) | ember.yearly | CC-BY-4.0 | 162 | 161 | 1 | 0 | 31 | 2025 |
| energia | Produzione elettrica da geotermico | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Quota del mix elettrico: rinnovabili | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Quota del mix elettrico: fossili | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Quota del mix elettrico: basse emissioni (rinnovabili + nucleare) | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Quota del mix elettrico: nucleare | ember.yearly | CC-BY-4.0 | 174 | 172 | 2 | 0 | 19 | 2025 |
| energia | Quota del mix elettrico: solare | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Import netti di energia | worldbank.indicators | CC-BY-4.0 | 141 | 139 | 2 | 0 | 52 | 2023 |
| energia | Quota del mix elettrico: eolico | ember.yearly | CC-BY-4.0 | 182 | 180 | 2 | 0 | 11 | 2025 |
| energia | Quota del mix elettrico: idroelettrico | ember.yearly | CC-BY-4.0 | 181 | 179 | 2 | 0 | 12 | 2025 |
| energia | Quota del mix elettrico: gas | ember.yearly | CC-BY-4.0 | 181 | 179 | 2 | 0 | 12 | 2025 |
| energia | Quota del mix elettrico: carbone | ember.yearly | CC-BY-4.0 | 182 | 180 | 2 | 0 | 11 | 2025 |
| energia | Quota del mix elettrico: petrolio e altri fossili | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Quota del mix elettrico: bioenergia | ember.yearly | CC-BY-4.0 | 184 | 182 | 2 | 0 | 9 | 2025 |
| energia | Quota del mix elettrico: altre rinnovabili (soprattutto geotermico) | ember.yearly | CC-BY-4.0 | 162 | 160 | 2 | 0 | 31 | 2025 |
| energia | Capacità installata: nucleare | ember.yearly | CC-BY-4.0 | 172 | 171 | 1 | 0 | 21 | 2025 |
| energia | Capacità installata: solare | ember.yearly | CC-BY-4.0 | 183 | 182 | 1 | 0 | 10 | 2025 |
| energia | Capacità installata: eolico | ember.yearly | CC-BY-4.0 | 181 | 180 | 1 | 0 | 12 | 2025 |
| energia | Capacità installata: idroelettrico | ember.yearly | CC-BY-4.0 | 180 | 179 | 1 | 0 | 13 | 2025 |
| energia | Capacità installata: gas | ember.yearly | CC-BY-4.0 | 119 | 118 | 1 | 0 | 74 | 2025 |
| energia | Capacità installata: carbone | ember.yearly | CC-BY-4.0 | 81 | 80 | 1 | 0 | 112 | 2025 |
| energia | Capacità installata: petrolio e altri fossili | ember.yearly | CC-BY-4.0 | 152 | 152 | 0 | 0 | 41 | 2025 |
| energia | Capacità installata: bioenergia | ember.yearly | CC-BY-4.0 | 183 | 182 | 1 | 0 | 10 | 2025 |
| energia | Capacità installata: altre rinnovabili (soprattutto geotermico) | ember.yearly | CC-BY-4.0 | 161 | 159 | 2 | 0 | 32 | 2025 |
| energia | Capacità installata: geotermico | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Capacità di accumulo idroelettrico (pompaggio) | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2024 |
| energia | Produzione totale di energia primaria | eia.intl | US-PD | 186 | 186 | 0 | 0 | 7 | 2024 |
| energia | Consumo totale di energia primaria | eia.intl | US-PD | 186 | 186 | 0 | 0 | 7 | 2024 |
| energia | Produzione di gas naturale | eia.intl | US-PD | 186 | 185 | 1 | 0 | 7 | 2024 |
| energia | Consumo di gas naturale | eia.intl | US-PD | 186 | 185 | 1 | 0 | 7 | 2024 |
| energia | Import di gas naturale | eia.intl | US-PD | 186 | 186 | 0 | 0 | 7 | 2024 |
| energia | Export di gas naturale | eia.intl | US-PD | 186 | 186 | 0 | 0 | 7 | 2024 |
| energia | Produzione di petrolio greggio | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2025 |
| energia | Consumo di petrolio e liquidi | eia.intl | US-PD | 185 | 185 | 0 | 0 | 8 | 2025 |
| energia | Import di petrolio greggio (serie storica) | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2020 |
| energia | Export di petrolio greggio (serie storica) | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2020 |
| energia | Produzione di prodotti raffinati (serie storica) | eia.intl | US-PD | 184 | 184 | 0 | 0 | 9 | 2014 |
| infrastrutture | Risorse idriche rinnovabili interne pro capite | worldbank.indicators | CC-BY-4.0 | 181 | 181 | 0 | 0 | 12 | 2022 |
| infrastrutture | Prelievi annui di acqua dolce | worldbank.indicators | CC-BY-4.0 | 179 | 179 | 0 | 0 | 14 | 2022 |
| infrastrutture | Prelievi d'acqua per l'agricoltura | worldbank.indicators | CC-BY-4.0 | 178 | 178 | 0 | 0 | 15 | 2022 |
| infrastrutture | Prelievi d'acqua per uso domestico | worldbank.indicators | CC-BY-4.0 | 178 | 178 | 0 | 0 | 15 | 2022 |
| infrastrutture | Prelievi d'acqua per l'industria | worldbank.indicators | CC-BY-4.0 | 177 | 177 | 0 | 0 | 16 | 2022 |
| infrastrutture | Stress idrico (SDG 6.4.2) | worldbank.indicators | CC-BY-4.0 | 176 | 176 | 0 | 0 | 17 | 2022 |
| popolazione | Popolazione totale | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Densità di popolazione | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2023 |
| popolazione | Popolazione urbana | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Popolazione della città più grande | worldbank.indicators | CC-BY-4.0 | 149 | 149 | 0 | 0 | 44 | 2025 |
| popolazione | Crescita della popolazione | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Popolazione 0–14 anni | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Popolazione 15–64 anni | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Popolazione con 65 anni e più | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2025 |
| popolazione | Speranza di vita alla nascita | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2024 |
| prezzi | Pane · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 28 | 26 | 2 | 0 | 165 | 2026-09 |
| prezzi | Riso · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 45 | 41 | 4 | 0 | 148 | 2026-09 |
| prezzi | Farina di frumento · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 38 | 35 | 3 | 0 | 155 | 2026-09 |
| prezzi | Latte · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 18 | 18 | 0 | 0 | 175 | 2026-09 |
| prezzi | Uova · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 17 | 17 | 0 | 0 | 176 | 2026-09 |
| prezzi | Olio alimentare · prezzo al dettaglio (media nazionale) | fao.fpma | CC-BY-4.0 | 30 | 29 | 1 | 0 | 163 | 2026-09 |
| prezzi | Fattore di conversione PPA (consumi privati) | worldbank.indicators | CC-BY-4.0 | 189 | 169 | 20 | 0 | 4 | 2025 |
| prezzi | Livello dei prezzi dei consumi delle famiglie (USA = 100) | worldbank.indicators | CC-BY-4.0 | 189 | 169 | 20 | 0 | 4 | 2025 |
| vivere | Retribuzione mensile media dei dipendenti (ILOSTAT) | ilostat.earnings | CC-BY-4.0 | 165 | 0 | 0 | 165 | 28 | 2025 |
| vivere | Retribuzione mensile media dei dipendenti in dollari PPA (ILOSTAT) | ilostat.earnings | CC-BY-4.0 | 157 | 0 | 0 | 157 | 36 | 2025 |
| vivere | Retribuzione mensile mediana dei dipendenti (ILOSTAT) | ilostat.earnings | CC-BY-4.0 | 139 | 0 | 0 | 139 | 54 | 2025 |
| vivere | Retribuzione mensile mediana in dollari PPA (ILOSTAT) | ilostat.earnings | CC-BY-4.0 | 133 | 0 | 0 | 133 | 60 | 2025 |
| vivere | Salario minimo legale mensile | ilostat.earnings | CC-BY-4.0 | 169 | 165 | 4 | 0 | 24 | 2026 |
| vivere | Salario minimo mensile in dollari PPA | ilostat.earnings | CC-BY-4.0 | 166 | 154 | 12 | 0 | 27 | 2026 |
| vivere | Consumi delle famiglie pro capite | worldbank.indicators | CC-BY-4.0 | 164 | 156 | 8 | 0 | 29 | 2025 |
| vivere | Accesso almeno di base all'acqua potabile | worldbank.indicators | CC-BY-4.0 | 192 | 183 | 9 | 0 | 1 | 2024 |
| vivere | Acqua potabile gestita in sicurezza | worldbank.indicators | CC-BY-4.0 | 137 | 135 | 2 | 0 | 56 | 2024 |
| vivere | Servizi igienici almeno di base | worldbank.indicators | CC-BY-4.0 | 192 | 181 | 11 | 0 | 1 | 2024 |
| vivere | Servizi igienici gestiti in sicurezza | worldbank.indicators | CC-BY-4.0 | 138 | 135 | 3 | 0 | 55 | 2024 |
| vivere | Accesso all'elettricità | worldbank.indicators | CC-BY-4.0 | 193 | 193 | 0 | 0 | 0 | 2024 |
| osservazioni | observation.official_series | (varie) | — | 187 | — | — | — | 6 | — |
| osservazioni | observation.fuel_price | (varie) | — | 34 | — | — | — | 159 | — |
| osservazioni | observation.survey_wave | (varie) | — | 36 | — | — | — | 157 | — |
| osservazioni | observation.opinion_series | (varie) | — | 32 | — | — | — | 161 | — |
