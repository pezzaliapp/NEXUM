# NEXUM Offshore — Phase 1 Adriatic: legal and technical audit, implementation and checks (2026-10-10)

**Status:** developed and verified **locally** after the author's GO of 2026-10-10. Nothing committed, pushed or deployed.

**Legend:** **[FACT]** official text read on 2026-10-10 (quoted, with its URL) · **[TEST]** check run on 2026-10-10 ·
**NOT VERIFIED** not confirmed, no permission assumed.

## 1. Sources and licences

| Dataset (file read) | Licence | Reference date in the file |
|---|---|---|
| Piattaforme marine e strutture assimilabili (`dati/piattaforme/piattaforme.xlsx`) | [FACT] CC BY 4.0: "I dati sono distribuiti con licenza Creative Commons Attribuzione 4.0 Internazionale CC BY 4.0" (https://unmig.mase.gov.it/ricerca-e-coltivazione-di-idrocarburi/piattaforme-marine/) | "Dati al 31 dicembre 2025 - Aggiornamento del 12 febbraio 2026" |
| Pozzi per la coltivazione di idrocarburi (`dati/pozzi/pozzi-idrocarburi.xlsx`) | [FACT] CC BY 4.0, same wording (…/pozzi-produttivi/); "aggiornato semestralmente" | same |
| Centrali di raccolta e trattamento (`dati/centrali/centrali-idrocarburi.xlsx`) | [FACT] CC BY 4.0, same wording (…/centrali-di-raccolta-e-trattamento/) | same |
| Titoli minerari vigenti (`dati/titoli/titoli-idrocarburi.xlsx`) | [FACT] CC BY 4.0 (…/elenco-dei-titoli-minerari/; the CC logo images, not the text, sit in an HTML comment) | "Aggioramento: 30/9/2026" (sic); page: "Dati al 30 settembre 2026" |
| Schemi di collegamento (`dati/kml/collegamenti.kml`, WebGIS UNMIG) | [FACT] IODL 2.0 (licenseInfo of the WebGIS map, ArcGIS item 30c7bd2018ea4eac96a24df3e6097c56): attribution, "non riutilizzare le Informazioni in un modo che suggerisca che abbiano carattere di ufficialità" | none declared |
| MASE legal notes (https://www.mase.gov.it/portale/web/guest/note-legali-e-informativa-privacy, linked from the UNMIG footer) | [FACT] "Salvo ove diversamente indicato … CC-BY 4.0 … a patto che sia sempre citata la fonte e – ove possibile – riportato l'indirizzo web della pagina originale" | 04.05.2023 |
| Legend of the well status codes (last page of `pozzi-idrocarburi.pdf`, same edition) | CC BY 4.0 | PR Produttivo erogante · PP Produttivo non erogante · RE Reiniezione · MO Monitoraggio · AL Non produttivo · PS Potenzialmente utilizzabile per lo stoccaggio · ST Stoccaggio |

**Attribution on every card** (property `source_line` and the source's attribution in "Fonti"): source, list, edition,
page URL, "licenza CC BY 4.0", "Dati rielaborati da NEXUM – elaborazione non ufficiale"; the first fact is the
reference date in short ("31/12/2025 (agg. 12/02/2026)"), shown also by the compact card of a phone.

**Excluded:** ViDEPI historical wells (no licence found; Monte Mario longitudes); the decommissioning list (HTML table
whose page states no licence of its own); photographs; drilling rigs (no free official source of positions); pipeline
routes (none published: the WebGIS schemes are straight lines between structures).

## 2. What is imported (connector `connectors/unmig.py`, source `sources_live/mase.unmig.toml`, vocabulary `vocab_live/offshore.toml`)

| Type | Filter (columns of the source only) | Count [TEST] | Map |
|---|---|---|---|
| `energy.offshore_platform` | "Zona" ∈ {ZA, ZB} | 121 (120 structures + FSO Alba Marina) | yes (amber) |
| `energy.hc_well` | "Ub" = M and "Pr" ∈ {ZA, ZB} | 624 | no (on their platform; coordinates as text) |
| `energy.hc_centrale` | whole national list (the platforms name them) | 82 | yes (darker amber) |
| `energy.hc_concession` | "tipo" = Concessione di coltivazione, "ubic" = Mare, "zona" with Zona A/B | 48 | no (no polygons in Phase 1) |
| `org.company` | the platforms list's "Operatore" values | 3 (EDISON, ENERGEAN, ENI) | no |

Reading notes [TEST]: XLSX read with the standard library (zip + XML); coordinates rounded to the CSV's 6 decimals; the
FSO section of the platforms list repeats its header with "Presidite h24 7/7" (sic): repeated headers are read by
position; one title spans several rows in the titles list (zones and acts below, empty id): joined with " - " as the
CSV of the same page joins them.

## 3. Relations (only from a column of the source, by exact name)

| Relation | Column | Resolved [TEST] | Not resolved (kept apart, never applied) |
|---|---|---|---|
| well `on_platform` platform | wells "Piattaforma" | 624 / 624 | — |
| platform `delivers_to` plant or FSO | platforms "Centrale" | 111 (108 plants + 3 to the FSO Alba Marina) | 3 × "MARIA MARE" (in neither list); 7 empty or "-" |
| platform `in_concession` concession | platforms "Concessione di coltivazione" | 120 | 1 empty |
| platform `operated_by` company | platforms "Operatore" | 121 | — |
| platform `scheme_link` platform or plant | KML name "Collegamento A - B" | 116 | "Tie-in …", "Manifold …" ends and links of non-Adriatic structures |

Names never merged ("ENERGEAN" of the platforms ≠ "ENERGEAN ITALY" of the wells: wells and concessions keep operator and
holders as text). No enrichment and no rule uses the new types (tests). Relation types carry the display hint
`map_line = false`: the map never draws them as lines (a straight line would read as a pipeline route); they are in the
card and in the graph. The free-text notes of the source (e.g. "Collegata alla centrale SAN GIORGIO MARE" on VONGOLA
MARE 1, whose "Centrale" column says MARIA MARE) are shown as notes, never turned into relations.

## 4. Mandatory checks [TEST]

| # | Check | Result |
|---|---|---|
| 1 | Imported data = official CSV of the same pages (field by field) — `bench/offshore/check.py`, `tests/test_offshore.py` | PASS (121 / 624 / 82 / 48 / 3) |
| 2 | Zero invented relations: 1,092 relations, all of the five declared types, asserted by a UNMIG record, no distance; every pair = a pair the source declares; 0 rule outputs | PASS |
| 3 | Search index growth ≤ 22 KB | PASS: +9,137 bytes (4,483,947 → 4,493,084; ≈ 9 ms at 1,012,500 B/s) |
| 4 | O9 under the original conditions (spec unchanged) | PASS: first search max 5,852.8 ms (baseline 5,853.1) |
| 5 | O6, O8, mobile navigation | PASS O6/O8; mobile: no regression (the same 6 pre-existing failures on production m859); offshore spec 5/5 |

## 5. Performance and mobile (local host `scripts/serve-web.mjs`, same machine and session, baseline = production m859)

Snapshot `live-692-20261010T201102Z-0abd1d62` (+1,970 elements = 878 objects + 1,092 relations; nothing else changed);
parity 1,984 cases / 0 differences; bundles 335,080 / 0 differences. Baseline: the deployed production copy
(`data/deploy/web-prod`, build m859, snapshot live-685), measured in the same session. Results: `data/reports/offshore/`.

| Measure (spec `tests/web/bench.spec.ts`, unchanged) | Production m859 | Offshore candidate | Threshold |
|---|---|---|---|
| O6 desktop / phone (bytes) | 898,487 / 825,054 | 900,582 / 827,026 | ≤ 1,000,000 |
| O8 cold p95 / warm p95 (ms) | 674 / 17.0 | 680 / 17.5 | ≤ 1,500 / ≤ 450 |
| O9 first search, max of 5 cold sessions (ms) | 5,853.1 | 5,852.8 | ≤ 6,000 |
| O9 following p95, Fast 4G / unthrottled (ms) | 1,280.5 / 14.3 | 1,280.5 / 14.7 | 150 (Fast 4G: fails on both, pre-existing open question) |

Mobile (`navigation`, `bottomsheet`, `mobile` specs, 5 profiles): 46 passed, 6 failed, 13 skipped on **both** builds;
the 6 failures are the same tests on the same profiles (fold-closed: journey, filters; tablet-portrait: the four
navigation journeys), pre-existing. New `ui/tests/mobile/offshore.spec.ts`: 5/5 (card: short reference date, also on the
compact landscape card; "Dati rielaborati da NEXUM – elaborazione non ufficiale"; CC BY 4.0; no "LIVE"; related
elements with a place exist and the map draws 0 lines). Python suite 155 passed, 3 skipped; UI unit tests 82/82;
semantic gate 42/42.

## 6. Open points

- The physical test on the Fold8 Ultra and the iPhone 15 Pro Max is still the final gate (not done).
- Shown by the existing card, not introduced here: "Contesto · non sono connessioni" lists elements within 100 km
  (labelled "Vicinanza geografica: non è una connessione registrata"); the card's timeline lists the relations' recording
  date (2026-10-10, the acquisition), not a date of the world; the heading "Connessioni trovate da NEXUM" is the
  workspace's generic wording for every relation (each says "1 fonte" and opens "Perché?").
- Not verified: an exhaustive review of sector rules on publication (offshore safety, critical infrastructure); the
  datum of wells and plants is not stated (WGS84 by agreement with the platforms' coordinates).
- Automatic refresh: none (the scheduled job stays off); a manual run after each six-monthly edition.
