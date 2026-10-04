# NEXUM — World Intelligence: correction + completion + integration (report)

Date: 2026-10-03/04 · Author: Alessandro Pezzali · Deploy: **live-review only** (no production, no DNS, no commit, no push).

- Deploy URL: https://91fddc37.nexum-45e.pages.dev — alias **https://live-review.nexum-45e.pages.dev**
- Snapshot: `live-198-20261003T215722Z-8321d825` (world `live`, world_version 198) · 8,914 files (O7 ≤ 9,000) · 938 MB
- Lights: the 6 frozen files unchanged (sha256 verified before, during and after; the published asset `a7a3b2…cf36`)
- Core: unchanged (`git diff 7c62b6b -- nexum/core` = `query.py` only, as approved; W1 PASS)

## Data integrity fixes (real before/after, live world)
| Issue | Before | After | How |
|---|---|---|---|
| Storm time ≠ position | point = strongest position, time = first position | time = time of the position shown; track start/end kept | `nasa_eonet` 1.2.0 |
| Webcam ↔ event | 298 links, 272 to events > 1 year old | rule retired; webcams shown only near events of the last 30 days of data (≤ 25 km), as nearness | `rules_live/archive/`, API `/event-webcams` |
| UCDP labels | 279 labels with raw `XXX` codes | 0 — "conflitto/attore non ancora classificato dalla fonte (codice provvisorio …)"; UCDP types as UCDP defines them | `ucdp_candidate` 1.2.0 |
| Caltrans time | 3,591 cameras with a record time shown as image time (2016–2026) | 0; record time kept as `record_updated_at` | `caltrans_cctv` 1.1.0 |
| Multi-country | 387 airports in 2 countries | 0 — the source's asserted country prevails (geometric enrichment of airports removed) | `vocab_live/transport.toml` |
| Webcam state | none | CURRENT 8,100 · STALE 205 · OFFLINE 211 · LINK ONLY 1 (judged against the list itself) | `webcam_common.finalize` |
| "Dati aggiornati al 31 ott" | end of the last event month (future date) | newest raw payload time | `/status.data_received_ms` |

## New domains (all €0, no key, open licence verified)
World Bank WDI (33 indicators) · ILOSTAT · Ember (new release URL) · EIA International · Eurostat energy flows · FAO GIEWS FPMA ·
Statistics Norway · Swiss FSO · Uruguay ANCAP · HK Transport Dept · Vegagerðin · Madrid · Lyon CRITER · SITG Genève ·
Parma link-only (Wikidata coordinates) · UCDP digests (security zones) · NASA GIBS/CMR + EUMETView (browser, on request).
Details: `NEXUM-SOURCES-LIVE.md`. Country indicators: one object per indicator (95), "measured in" 16,791 places-values.

## Coverage (UN member states, 193)
| Domain | Coverage |
|---|---|
| Population, structure, life expectancy | 193 · largest city 149 |
| Economy (GDP, GDP pc, GNI pc, growth, trade, employment) | 173–192 |
| Salary: mean / median / minimum wage | 165 / 139 / 169 (one national source per country) |
| Cost of living: price level (USA = 100), PPP factor | 189 |
| Staple food prices (national averages) | bread 28 · rice 45 · flour 38 · milk 18 · eggs 17 · cooking oil 30 (56 countries) |
| Housing, household electricity/gas tariffs, water tariffs | **not integrated** (gap; Europe/OECD only, next step) |
| Fuel (petrol/diesel) | **34** (31 + Norway, Switzerland, Uruguay — maximum prices by decree) |
| Electricity: generation, demand, mix, capacity, net imports | 184 (nuclear rows 174; nuclear > 0 in 31) |
| Electricity imports/exports, geothermal, pumped storage, total energy, gas, oil | 184–186 (EIA) |
| Electricity access | 193 |
| Bilateral energy flows | Europe only: gas 369, electricity 167+167, crude 563 arcs (34/37/36/28 reporters) |
| Water access / stress | basic 192 · safely managed 137 · stress 176 (mostly FAO estimates, said) |
| Tolls | unchanged (German truck toll: 836 sections, 1 scheme) |
| Webcams | 8,517 records; images: USA, Canada, Finland, Iceland, Spain, France, Switzerland, Hong Kong (+ border cameras in NO/SE/RU); link only: Italy (Parma) |
| Imagery from orbit | worldwide on request (verified Europe, Africa, Asia, N. America, S. America, Oceania) |
| Security zones | 201 (190 red, 11 orange), 2026-06-03 → 2026-08-31, UCDP, never real time |

## Tests
pytest 116 passed (P25 with the OSIRIS reference: 20/20) · UI unit 48/48 · E2E local 23/23 · web 97 (96 + U9 re-run alone PASS) ·
mobile 36/36 · parity 1,982/1,982 identical · O6 987,300 B desktop / 920,968 B phone (≤ 1,000,000) · O7 8,914 files ·
O8 cold p95 639 ms · O9 first 5.5 s PASS, following on Fast 4G FAIL (unchanged open item) · worldintel on live-review 11/11 · discovery on live-review 28/28.

## Rejected / not integrated (reason)
Comtrade (premium subscription) · GEM (form with personal data) · IAEA PRIS (no coordinates; conditional) · Wikidata nuclear (incomplete) ·
Global Dam Watch (O7 trade-off: compact facility package next) · IRENASTAT/JODI/ENTSOG (not needed: Ember+EIA) · WFP national averages (5 countries) ·
fuel: Brazil (CC BY-ND), New Zealand (licence unreadable), India (PDF), Thailand, South Africa (NC), Argentina (host down), Dominican Rep. (unit), Japan (cities only) ·
webcams: TfL (registration), NZTA, DGT, Singapore; Toronto/Calgary/Iowa/Catalonia (countries already covered) · ACLED/HAPI/ReliefWeb (account).

## Unresolved / risks
Housing and household utility prices not integrated · affordability ratios (fuel/salary, bread/salary) not computed (currency/year compatibility
not guaranteed by the sources; per-inhabitant energy is computed, same year only) · energy flows outside Europe: totals only · relation
attributes (flow series) refresh on world rebuild · O7 margin 86 files · O9 following searches on Fast 4G · U9 flaky in the full run ·
FPMA series selection is a dated curated file (connectors/fpma_series.json) · Hong Kong is a separate place in the borders layer (its webcams are
not listed under China) · UCDP zones use first-level units named by the source; O2 (adjacency spill-over) not computed.

---

# Completion — observation coverage, living, cost of living (2026-10-04)

Author: Alessandro Pezzali · Deploy: **live-review only** · Sources and licences: `NEXUM-SOURCES-LIVE.md` (section
"Completion (2026-10-04)", and the rejected sources with their reason). OSIRIS (`github.com/simplifaisoul/osiris`) was
read only to learn which ORIGINAL public sources exist; no code, UI, asset or derived dataset was taken: every source
below was checked at its publisher (licence, terms, hotlink), and those that fail a check are not used.

## Webcams

Totale **21.166** webcam (prima: 8.517): immagine attuale 16.087 · solo collegamento 4.506 · offline 368 · immagine vecchia 205 · LIVE_STREAM 0 (nessun flusso video incorporato).

| Paese (si trova in / vicino a) | Totale | Immagine attuale | Solo collegamento | Offline / vecchia |
|---|---|---|---|---|
| United States of America | 7.708 | 7.234 | 76 | 398 |
| Canada | 3.166 | 2.421 | 679 | 66 |
| Spain | 2.575 | 391 | 2.184 | 0 |
| Taiwan | 2.465 | 2.456 | 0 | 9 |
| Hong Kong | 1.013 | 1.013 | 0 | 0 |
| United Kingdom | 890 | 821 | 0 | 69 |
| Finland | 805 | 805 | 0 | 0 |
| Italy | 662 | 57 | 602 | 3 |
| Austria | 659 | 177 | 471 | 11 |
| Iceland | 496 | 496 | 0 | 0 |
| Germany | 264 | 82 | 176 | 6 |
| Switzerland | 116 | 16 | 97 | 3 |
| Luxembourg | 94 | 94 | 0 | 0 |
| Czechia | 71 | 0 | 71 | 0 |
| Slovakia | 49 | 0 | 49 | 0 |
| Andorra | 44 | 0 | 44 | 0 |
| Slovenia | 28 | 0 | 28 | 0 |
| France | 21 | 15 | 6 | 0 |
| (fuori dai confini registrati, es. mare o confini) | 5 | 2 | 2 | 1 |
| Croatia | 4 | 0 | 4 | 0 |
| Puerto Rico | 4 | 2 | 0 | 2 |
| Morocco | 3 | 0 | 3 | 0 |
| San Marino | 3 | 0 | 3 | 0 |
| Belgium | 3 | 0 | 3 | 0 |
| Hungary | 3 | 0 | 3 | 0 |

| Fonte | Totale | Immagine attuale | Solo collegamento | Offline / vecchia |
|---|---|---|---|---|
| `caltrans.cctv` | 3.591 | 3.395 | 0 | 196 |
| `tw.thb_cctv` | 2.334 | 2.334 | 0 | 0 |
| `es.dgt` | 1.921 | 0 | 1.921 | 0 |
| `us.wsdot` | 1.705 | 1.630 | 75 | 0 |
| `it.odh_webcams` | 1.338 | 0 | 1.338 | 0 |
| `us.iowa_dot` | 1.259 | 1.259 | 0 | 0 |
| `usgs.nims` | 1.121 | 925 | 0 | 196 |
| `ca.ontario_mto` | 1.087 | 1.034 | 0 | 53 |
| `drivebc.webcams` | 1.045 | 1.030 | 0 | 15 |
| `hk.td_cctv` | 1.013 | 1.013 | 0 | 0 |
| `uk.tfl_jamcams` | 890 | 821 | 0 | 69 |
| `fintraffic.weathercam` | 809 | 809 | 0 | 0 |
| `ca.quebec_mtmd` | 680 | 0 | 680 | 0 |
| `is.vegagerdin` | 496 | 496 | 0 | 0 |
| `es.madrid_traffic` | 357 | 357 | 0 | 0 |
| `ca.toronto` | 336 | 336 | 0 | 0 |
| `eu.foto_webcam` | 326 | 300 | 0 | 26 |
| `it.arpa_fvg` | 208 | 0 | 208 | 0 |
| `es.catalonia_sct` | 159 | 0 | 159 | 0 |
| `tw.wra_cctv` | 131 | 122 | 0 | 9 |
| `lu.cita` | 96 | 96 | 0 | 0 |
| `es.vigo` | 61 | 0 | 61 | 0 |
| `avo.webcams` | 60 | 51 | 0 | 9 |
| `es.euskadi_traffic` | 60 | 0 | 60 | 0 |
| `es.meteogalicia` | 34 | 34 | 0 | 0 |
| `fr.lyon_criter` | 15 | 15 | 0 | 0 |
| `it.meteotrentino` | 11 | 11 | 0 | 0 |
| `it.venezia_maree` | 10 | 10 | 0 | 0 |
| `ch.geneve_sitg` | 9 | 9 | 0 | 0 |
| `it.ingv_oe` | 3 | 0 | 3 | 0 |
| `curated.webcam_links` | 1 | 0 | 1 | 0 |

Italia: 662 webcam — `it.odh_webcams` 433, `it.arpa_fvg` 165, `eu.foto_webcam` 39, `it.meteotrentino` 11, `it.venezia_maree` 10, `it.ingv_oe` 3, `curated.webcam_links` 1.

What a person sees: a city's card lists the webcams within 10 km (the 20 nearest, and how many in all); a country's
"Osserva" says "N webcam disponibili in NEXUM (non sono tutte le webcam del Paese)" and the coverage of the integrated
sources — BUONA (a national official source), PARZIALE (regional or city sources), LIMITATA, NESSUNA FONTE INTEGRATA —
with the sources named (`ui/src/config/webcam-coverage.json`). A CURRENT image is loaded by the browser from its
publisher only when the person opens the camera (never copied, archived or proxied; time of the image where the source
gives it); a LINK ONLY camera opens the publisher's own page, with the reason on the card. No camera is called live.

Italy: from 1 camera (Parma) to the cameras of Meteotrentino, Comune di Venezia (tide centre), the foto-webcam.eu
network (Garda, South Tyrol), Open Data Hub Südtirol and ARPA FVG (link only), INGV (Etna, Stromboli, Vulcano, link
only), Parma (link only, unchanged). No open national list exists: ANAS publishes none; Autostrade per l'Italia
reserves all rights; CAV and A22 state no terms (not a permission).

## Living, pay and the cost of living

- **Pay with an explicit definition first.** Eurostat net and gross annual pay of a single person on the average
  wage (34 countries); OECD gross average annual wage per full-time-equivalent employee (41 countries, the currency
  as the OECD states it); Eurostat median equivalised net household income (36). The overview answers with these.
- **ILOSTAT mean/median earnings** stay in the data, apart and closed: "Dati disponibili con limiti metodologici",
  with the limit said once; their currency is the one ILOSTAT states (164 of 165 countries), never "valuta nazionale"
  when known. The statutory minimum wage keeps its plain definition.
- **Cost of living.** World Bank/FAO cost of a healthy diet per person per day and the share of people who cannot
  afford it (145–165 countries, computed by the source); ICP 2021 price levels by category, world = 100 (168);
  Eurostat household electricity and gas prices with all taxes (40 / 34), housing cost share and overburden (36).
- **Computed by NEXUM** only when currency and year match: kWh of household electricity and litres of petrol bought
  with one month of net pay (Eurostat net pay ÷ 12 ÷ the same year's average price, both EUR) — said "calcolato da
  NEXUM" with the formula. Never across currencies, years, or a household income with a person's price.
- **Not available from open sources** (said in the view's gap list): rent levels and house prices per m² comparable
  across countries; household water tariffs.

## Prices and fuel

Italy checked against a second official source: Weekly Oil Bulletin 2026-09-28 Euro-super 95 2,156.17 and diesel
2,350.66 EUR per 1,000 l = MASE weekly averages, identical. Coverage 34 → **37 of 193** (New Zealand weekly main-port
average, Australia quarterly national average, Ukraine monthly national average); never called worldwide.

## Infrastructure and energy

Power plants are typed by the source's fuel in the overview and the section ("Centrali elettriche N (solare … ·
eolica … · …)", WRI GPPD, ≥ 20 MW, data of 2021); ports by size; aviation facilities by kind. Capacity, generation,
share of the mix and per-inhabitant values stay separate measures. LNG terminals, refineries and pipelines: no open
global source without a personal-data form (Global Energy Monitor) — not integrated.

## Search, overview, wording

Cities are in the places index (ranked by inhabitants among namesakes, the state as context): "London", "Taipei",
"Madrid", "Trento" reach the city before the thousands of webcams that share its name. The overview follows
population · living · prices · energy · infrastructure · economy · government · opinion · security · observation;
"(inverso)" is replaced by the relation's own reading from the other side; support bands and filter tags stay in the
evidence ("Perché?").

## Processes and performance

P0 (worker lifecycle) unchanged and verified again after build, tests and deploy. Packaging: `refs` 2,048 → 512 and
search documents 256 → 1,024 per file (O7 margin). O9: the following searches no longer read the references of
hits whose own label already holds the frequent words, and the search documents are read in the background after the
first search.

## Measured (2026-10-04, snapshot `live-272-20261004T150041Z-d015c75f`)

| Check | Result |
|---|---|
| O6 initial transfer | 994,772 B desktop · 928,078 B phone (≤ 1,000,000) — PASS |
| O7 snapshot files | 7,491 (≤ 9,000; was 8,915) — PASS |
| O8 cold p95 (Fast 4G) | 682 ms — PASS |
| O9 first search (Fast 4G) | 5,945 ms (≤ 6,000; the SQLite engine is now fetched while the index downloads) — PASS |
| O9 following searches (Fast 4G) | p50 215 ms, p95 1,196 ms (were 404 / 1,498) — FAIL: one network round trip alone is 165 ms on Fast 4G; unthrottled p95 15 ms |
| Parity Core ↔ snapshot ↔ browser | 1,988 / 1,988 identical |
| pytest (P25 with the OSIRIS reference, W1, W9) | 129 passed |
| UI unit | 51 / 51 |
| Web (Playwright, incl. completion and gate golden tests) | 105 passed (one webcam test hardened: a publisher's image can fail once, up to three cameras tried) |
| Mobile (iPhone portrait/landscape, Fold closed/open, tablet) | 50 / 50 |
| E2E local (API service) | 23 / 23; after SIGTERM: 0 servers, 0 workers, 0 multiprocessing-fork, 0 PPID 1 |
| Night lights (6 frozen files) | sha256 unchanged |

## Still open (with the best lawful €0 alternative)

- Webcams: Italy has no open national list (ANAS, Autostrade, CAV, A22); asking CAV and A22 for written permission
  would add geolocated motorway cameras. Germany's motorway cameras are not published; Austria (ASFINAG), Norway,
  Sweden, Estonia, NSW, Oregon and the ibi511 states require a key or forbid reuse.
- Rent levels and house prices per m², household water tariffs: no open comparable source.
- Fuel: 37 of 193; Japan (ANRE) blocks the project's User-Agent; Turkey (EPDK) states no licence.
- LNG terminals, refineries, pipelines: Global Energy Monitor requires personal data to download.
- O9 following searches on Fast 4G (see above).
