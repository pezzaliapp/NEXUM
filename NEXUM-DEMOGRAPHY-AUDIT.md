# NEXUM — Audit of demographic data (2026-10-08)

**Phase:** audit and proposed fix only. No code was changed, no snapshot rebuilt, nothing committed or deployed. Production stays at `202610081752-inmk`.

**Evidence:**
- `docs/demography-audit/definitions.md`: official definitions with quotes and URLs (World Bank, UN WUP, Natural Earth, Eurostat).
- `docs/demography-audit/comparisons-2026-10-08.txt`: worldwide comparisons computed on the NEXUM database (read-only).
- The original Natural Earth files kept in NEXUM's raw store (version 5.1.2 places; 5.1.1 countries), read-only.

**Legend:** [FACT] documented · [TEST] measured on NEXUM's data · [INFERENCE] deduced, not documented · NOT VERIFIED.

---

## 1. Technical cause
The figures are not wrong in themselves. NEXUM shows them **with labels that do not say what they measure**, so they read as rival measurements of the same population. There are three distinct causes, plus a data-quality bug:

1. **Labels that state no geographic unit:**
   - "Abitanti" for cities (Natural Earth `POP_MAX`);
   - "Popolazione della città più grande" (World Bank `EN.URB.LCTY`);
   - "Popolazione stimata" for countries (Natural Earth `POP_EST`).
2. **Missing reference years:** Natural Earth's national figure has a documented year (`POP_YEAR`, almost always **2019**), but NEXUM discards it. It then shows "60.297.396" next to the World Bank's "58,9 milioni (2025)".
3. **Definitions not reported:** `POP_MAX` is, per Natural Earth's own documentation, a **metropolitan-area** estimate (LandScan; for the ~500 largest areas aligned with the UN metro estimate), with **no documented year**. The card calls it "abitanti".
4. **Bug: the "most populous settlement known to NEXUM" is wrong in 32 countries** (§5). The server picks it only among places linked to the country by geometric containment (`located_in`). Coastal capitals (Lisbon, Stockholm, New York, Lagos, Monrovia, Reykjavík…) fall just outside the 1:50m outline and are linked with `near_place`, so they are never chosen.

## 2. Components and datasets involved
| Data | Source / field | Where it is used in NEXUM |
|---|---|---|
| Total population | World Bank **SP.POP.TOTL** (`connectors/worldbank_indicators.py:37`) | Country card › Panoramica (`views/PlaceView.tsx:263`), Sintesi dei fatti (`ops/Ai.tsx`) |
| Density | World Bank **EN.POP.DNST** (:40) | Panoramica |
| Urban population % | World Bank **SP.URB.TOTL.IN.ZS** (:42) | Panoramica |
| Largest city | World Bank **EN.URB.LCTY** (:45) plus the note `ui/src/config/indicator-context.json` (the "leader") | Panoramica, Sintesi dei fatti |
| National estimate | Natural Earth admin-0 **POP_EST** (`connectors/naturalearth_admin0.py:52-62`) → `population_estimate`; `POP_YEAR` **discarded** | Country card "Dati della fonte" ("Popolazione stimata", `vocab_live/geography.toml:8`); ranking in "Esplora un Paese" (`rank_property`) |
| Settlement population | Natural Earth populated places **POP_MAX** (`connectors/naturalearth_places.py:88`) → `population`; **POP_MIN, POP_OTHER, POP1950–2050 discarded** | City card (headline "N abitanti", fact "Abitanti", `geography.toml:37`); place-name ranking (`place_index.rank_property`, `nexum/api/server.py:1607-1616`); "most populous" leader (`server.py:1376-1390`); thresholds of 7 rules `rules_live/r_*_exposure.toml` (e.g. "centri abitati con più di 100.000 abitanti"); highlight sentences (`ui/src/lib/summary.ts:23`); map label sizes |
| City proper (municipality) | **Not present in NEXUM** (no ISTAT or equivalent source) | — |

## 3. Verified definitions ([FACT], quotes in `definitions.md`)
| Figure | Producer | Geographic unit | Year | Notes |
|---|---|---|---|---|
| SP.POP.TOTL | World Bank (UN WPP sources and others) | Country, "de facto", all residents | 2025 (Italy 58,915,656) | Midyear estimate |
| EN.POP.DNST | World Bank | Country, land area only | 2024 (Italy 199.35/km²) | 2025 not yet published |
| SP.URB.TOTL.IN.ZS | World Bank from UN WUP (2025 values aligned with the 2025 revision) | "urban areas as defined by national statistical offices" | 2025 (Italy 69.68%) | **Not comparable across countries** (national definitions) |
| EN.URB.LCTY | World Bank from **UN WUP 2018** | "the country's largest metropolitan area". The UN 2014 methodology adds: target "urban agglomeration", otherwise "city proper", sometimes "metropolitan area"; "No attempts have been made to impose consistency in definitions across countries" | 2025 = **projection** from the 2018 revision (Italy 4,347,104) | The source **does not name** the city |
| Natural Earth POP_EST (countries) | Natural Earth | Country | `POP_YEAR`: **2019** for 222 of 240 units | Estimate; year documented in the file |
| Natural Earth POP_MAX (cities) | Natural Earth (LandScan; UN metro for ~500 large areas) | "total 'metropolitan' population rather than it's administrative boundary population"; CHANGELOG 2012: "pop max is for the metropolitan area, pop_min is for the incorporated city of the same name" | **NOT DOCUMENTED** | [INFERENCE] For Rome it equals the file's own `POP2010` column (3,339 thousand) |
| Natural Earth POP_MIN | Natural Earth | "incorporated city" (municipality), per the CHANGELOG | NOT DOCUMENTED | [TEST] **Unreliable**: Rome 35,452 · Paris 11,177 · Madrid 50,437 · Lagos 1,536 |
| UN WUP 2025 (new, 18 Nov 2025) | UN DESA | "city" with a harmonised definition (Degree of Urbanisation: contiguous cells ≥ 1,500 inh./km², ≥ 50,000 inhabitants) | 2025 (Rome 2,376,474) | Not used by NEXUM; replaces previous revisions |
| ISTAT resident population | ISTAT | Municipality / Città metropolitana | — | **NOT VERIFIED** (the service did not answer). Not in NEXUM |

## 4. Verified example: Italy and Rome
| What the card shows today | Value | Real concept | Year |
|---|---|---|---|
| "Popolazione totale" | 58.9 million | Country, de facto residents (World Bank) | 2025 |
| "Popolazione stimata" (Dati della fonte) | 60,297,396 | Country, Natural Earth estimate | **2019** (not shown today) |
| "Popolazione urbana" | 69.7% | Share in areas that are urban **by the Italian definition** | 2025 |
| "Popolazione della città più grande" | 4.3 million | Largest **metropolitan area / agglomeration** (UN WUP 2018, projection) | 2025 |
| "Centro abitato più popoloso noto a NEXUM: Rome — 3.339.000 abitanti" | 3,339,000 | Rome's **metropolitan area**, Natural Earth estimate | **not documented** ([INFERENCE] ≈ 2010) |
| Rome card: "3.339.000 abitanti" | 3,339,000 | Same Natural Earth estimate, **not** the residents of the municipality | not documented |

The four figures are all correct, but they measure **four different perimeters and years**. The UN 2025 harmonised city (2.38 million) and the ISTAT municipality (not verified) would be two more.

## 5. Countries with similar apparent contradictions ([TEST], full list in `comparisons-2026-10-08.txt`)
- **Wrong "most populous settlement" (32 countries).** Geometric containment versus the country declared by Natural Earth. Examples:
  - United States: Los Angeles → **New York**;
  - Portugal: Porto → **Lisbon**;
  - Sweden: Göteborg → **Stockholm**;
  - Iceland: Akureyri → **Reykjavík**;
  - Lebanon: Ṭarābulus → **Beirut**;
  - Nigeria: Kano → **Lagos**;
  - Liberia: Buchanan → **Monrovia**;
  - Guinea: Gueckedou → **Conakry**;
  - Djibouti: Ali Sabih → **Djibouti**;
  - United Arab Emirates: Sharjah → **Dubai**;
  - Cyprus, Fiji, Cabo Verde, Belize, Greenland, Bahamas…
  - No leader at all: Bahrain, Monaco, Vatican, Barbados, Macao and others (11).
  - Sensitive cases, report the country **as declared by Natural Earth** and say so: Palestine (Jerusalem/Gaza), Hong Kong/Shenzhen, Sri Lanka (Colombo 217,000: Natural Earth figure).
- **Largest city, World Bank vs Natural Earth leader:** 96 of 148 countries outside ±25%. Partly the bug above, partly different definitions and years.
- **National population, Natural Earth 2019 vs World Bank 2025:** 75 of 193 countries outside ±10%. The causes are the year (fast-growing countries: Somalia 0.52, Chad, Mali, DR Congo, Côte d'Ivoire) and revisions or territorial definitions (Eritrea 1.69, Syria, Yemen, Ukraine, Marshall Islands). Without the year shown, they look like contradictions.

## 6. Minimal, robust fix (proposal, nothing changed)
Principles:
- No value is removed or replaced: Natural Earth and the World Bank coexist.
- Every figure says **who, what perimeter, what year**.
- Labels live in the vocabulary and configuration, not in the TypeScript (W9 rule).

1. **Settlements (Natural Earth POP_MAX):**
   - Fact label: "Abitanti" → **"Stima della popolazione dell'area metropolitana"**.
   - Note: "Natural Earth (LandScan / stima ONU per le grandi aree), anno non documentato; non è la popolazione residente nel comune".
   - Headline: "3.339.000 abitanti" → **"≈ 3.339.000 · area metropolitana (stima)"**.
   - The same wording in highlight sentences (`summary.ts`, which takes the suffix from the vocabulary).
2. **Countries (Natural Earth POP_EST):**
   - Also store `POP_YEAR`: an additive property, recomputed from the raw data already in the store, no new download.
   - Label: **"Stima Natural Earth della popolazione (2019)"**.
   - Remove nothing. The World Bank's "Popolazione totale (2025)" stays the main figure in the Panoramica.
3. **World Bank EN.URB.LCTY:**
   - Label **"Popolazione dell'area urbana più grande (stima ONU)"**.
   - Note: "proiezione 2025 dalla revisione 2018 delle World Urbanization Prospects; la fonte non nomina la città; definizioni non uniformi tra Paesi".
   - Year and "estimate" stay visible, as today.
4. **SP.URB.TOTL.IN.ZS:** label **"Popolazione urbana (definizione nazionale)"**, note "non confrontabile tra Paesi".
5. **"Most populous settlement" note** (`indicator-context.json`):
   - "Centro abitato più popoloso noto a NEXUM: Rome — stima dell'area metropolitana ≈ 3.339.000 (Natural Earth, anno non documentato)".
   - The existing caveat stays.
6. **Leader bug:** pick the most populous settlement among those Natural Earth **declares** in the country (`country_iso2`, the source's ADM0 field: asserted data, not proximity), and no longer only by geometric containment.
   - It is a query change in `server.py`; data and relations are unchanged.
   - The 32 cases are fixed. The NE wording "secondo Natural Earth" for sensitive territories is kept.
7. **POP_MIN / POP_OTHER:** neither imported nor shown (POP_MIN is unreliable). "Residenti nel comune" will appear **only** with a source that measures it (e.g. ISTAT, once licence and access are verified): a separate intervention.

Expected effect on Italy: "Popolazione totale 58,9 milioni (2025, Banca Mondiale)" · "Popolazione urbana (definizione nazionale) 69,7%" · "Popolazione dell'area urbana più grande (stima ONU) 4,3 milioni — proiezione 2025" · "Centro abitato più popoloso noto a NEXUM: Roma — stima area metropolitana ≈ 3,34 milioni (Natural Earth, anno non documentato)" · Dati della fonte: "Stima Natural Earth della popolazione (2019) 60.297.396".

## 7. Data-quality problems needing separate interventions (not part of the minimal fix)
1. **Coastal cities related to their country with `near_place` instead of `located_in`.** Beyond the leader, they also affect the country's settlement lists and counts, and "what is inside".
   - The fix would add the relation declared by the source.
   - It changes the knowledge graph: adds `located_in` relations.
   - **Do not remove `near_place`, or the baselines would record losses.** It needs its own decision.
2. **Wording in the 7 exposure rules** ("centri abitati con più di 100.000 abitanti"): the threshold uses the metropolitan estimate.
   - Changing the text regenerates the insight explanations (a reprocessed world).
   - Separate intervention.
3. **Natural Earth anomalies:** POP_MIN (Rome 35,452 etc.); Sri Lanka (Colombo 217,000 < Jaffna). Report them to Natural Earth; NEXUM will not correct them by hand.
4. **Possible ISTAT source** for Italian municipalities (and equivalents elsewhere): licence, access and year to be verified. Future source, not a replacement.
5. **WUP 2025** (harmonised city): an option to consider for comparable cities across countries; the World Bank has not adopted it for `EN.URB.LCTY` yet.

## 8. Tests needed
- **Labels:** web and mobile test with Italy, Rome, Portugal, Liberia, the United States and Bahrain. The card must say area, year and source. "Abitanti" does not appear for Natural Earth figures. The year 2019 appears beside the Natural Earth estimate.
- **Leader:** Lisbon, Stockholm, New York, Lagos, Monrovia, Reykjavík appear as the "most populous settlement". No country loses a leader it had. The 11 countries without one get it when Natural Earth declares one.
- **Unchanged values:** every figure equal before and after (only labels change; the year is added).
- **Data gates:** 0 losses against PRE-OSIRIS and MASTER-START. Only additions are allowed: the new `population_year` property. Semantic gate, Country chain (Italy).
- **Search and map:** the place ranking still uses POP_MAX (unchanged). O9 within threshold. Map unchanged. Graph and relations unchanged in the minimal fix.
- **Governance:** W9 (no domain words in the TypeScript), W22.
- **Full regression** (web, mobile, E2E, unit, pytest, autoupdate) and live-review before production.

## 9. Regression risks
- **Snapshot rebuild:** the new `population_year` property needs the world to be reprocessed (already-downloaded raw data). Snapshot size is practically unchanged.
- **Labels in the vocabulary:** they also change the search text (vocabulary label keywords). Mitigation: keep the old keywords ("abitanti", "population") among the search keywords.
- **Leader:** the query moves from `located_in` to the declared country. Places without `country_iso2` keep the geometric rule as a fallback.
- **Rules:** the minimal fix does not touch them (§7.2).

## 10. Implementation and verification (2026-10-08/09, after the author's GO)
- **Done differently from §6:** no new `population_year` property, no vocabulary change, no database rewrite. The labels, notes and years come from the UI configuration `ui/src/config/demography.json`. The Natural Earth `POP_YEAR` is copied there per `ADM0_A3` from the original admin-0 file. The most populous settlement follows `config/place-membership.json`: declared `country_iso2` first, `located_in` as fallback. A disagreeing settlement is attributed to nobody, except a dependency whose declared name is its container's. Before/after for every country: `docs/demography-audit/leaders-before-after.md`.
- **Results:** 32 countries change their most populous settlement and none loses it; 210 → 221 countries have one. 20 settlements are in conflict and 7 are unresolved, all listed and attributed to nobody. Figures are unchanged. Snapshot `live-345-20261008T202859Z-07c54c2b` differs from `a2c4ee9d` in 36 files: indicator packages (leaders only), manifests, and two order/path-only files.
- **Gates:** web and mobile regression, E2E, unit, pytest, autoupdate. Data gates show 0 losses against PRE-OSIRIS and MASTER-START, apart from the CSP hosts already declared. Semantic gate 0 failures, lights freeze 6/6.
- **Pre-existing anomaly, not changed here:** `tests/mobile/nav-gps.spec.ts` on the `fold-closed` profile fails at the detour step: "Ricalcolo del percorso" is spoken 3 times instead of 1. It fails identically against production build `202610081752-inmk` (commit ac307e6), before this change. The other profiles pass. To be handled in a separate navigation task.
- **Other pre-existing issues:** searching "Lebanon" returns only events, not the place. ISTAT figures for Italian municipalities are not verified.

*Author: Alessandro Pezzali.*
