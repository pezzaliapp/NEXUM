# Demographic figures used by NEXUM — official definitions (research, 2026-10-08)

All HTTP requests used the User-Agent `NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)`. Each response was under 2 MB. Raw responses are in `scratchpad/demo/raw/`.
Nothing in the NEXUM repo was modified. Natural Earth values come from NEXUM's own cached copy of the zip (`data/live/raw/cd/14/cd1491…7b.gz`, sha256 `cd149186…1d7b`), which I unpacked into the scratchpad. That copy is the same file the CDN serves today (ETag `533bb687…`, Last‑Modified 13 May 2022).

Status markers: **VERIFIED** means quoted from or computed against an official source fetched today. **INFERRED** means my reasoning from verified numbers. **NOT VERIFIED** and **NOT FETCHED** are what they say.

---

## 1. World Bank WDI (source 2)

Metadata comes from `https://api.worldbank.org/v2/sources/2/series/<CODE>/metadata?format=json` and `https://api.worldbank.org/v2/indicator/<CODE>?format=json`. Values come from `https://api.worldbank.org/v2/country/ITA/indicator/<CODE>?format=json&mrv=3` (API `lastupdated` = 2026-10-08).

| Series | Producer (as stated) | Definition (exact quote, "Longdefinition") | Geographic unit | Latest ITA year → value | Estimate/projection | Comparability limits (quoted) |
|---|---|---|---|---|---|---|
| **SP.POP.TOTL** Population, total | Sources: "World Population Prospects, United Nations (UN) … UN Population Division; Statistical databases and publications from national statistical offices …; Eurostat: Demographic Statistics …; Population and Vital Statistics Report (various years), UN Statistics Division" | "Total population is based on the de facto definition of population, which counts all residents regardless of legal status or citizenship. The values shown are midyear estimates." | Country | **2025 → 58,915,656** (2024: 58,952,704; 2023: 58,984,216) | Midyear **estimate** ("Population estimates are from demographic modeling and so are susceptible to biases and errors") | "comparability of population indicators is limited by differences in the concepts, definitions, collection procedures, and estimation methods used by national statistical agencies". Also note: the WB count is de facto and taken at midyear, while ISTAT counts residents on 1 January, so the two never match exactly. |
| **EN.POP.DNST** Population density (people per sq. km of land area) | "FAO population estimates … ; World Bank population estimates" | "Population density is midyear population divided by land area in square kilometers. Population is based on the de facto definition of population, which counts all residents regardless of legal status or citizenship--except for refugees not permanently settled in the country of asylum, who are generally considered part of the population of their country of origin. Land area is a country's total area, excluding area under inland water bodies, national claims to continental shelf, and exclusive economic zones. In most cases the definition of inland water bodies includes major rivers and lakes." | Country, **land area** (inland waters excluded) | **2024 → 199.353** people/km² (the API has no 2025 value; it lags one year) | Derived from estimates | "a simple number of population density by itself does not give any meaningful measurement of human population density" (Developmentrelevance) |
| **SP.URB.TOTL.IN.ZS** Urban population (% of total population) | "World Urbanization Prospects, United Nations (UN), uri: https://population.un.org/wup/, note: … National definitions, publisher: UN Population Division" (no revision year given) | "Urban population refers to people living in urban areas as defined by national statistical offices. The data are collected and smoothed by United Nations Population Division." | Country; "urban" follows each **national** definition | **2025 → 69.6809 %** | WUP estimate. **VERIFIED:** the WB values for 2023, 2024 and 2025 are identical to the last digit with **WUP 2025** File F15 (National Definitions, % urban, Italy: 69.538154… / 69.604753… / 69.680861…). The WB therefore already uses the 2025 revision for this series. | "Because of national differences in the characteristics that distinguish urban from rural areas, the distinction between urban and rural population is not amenable to a single definition that would be applicable to all countries." / "Particular caution should be used in interpreting the figures for percentage urban for different countries." **Not comparable across countries.** |
| **EN.URB.LCTY** Population in largest city | "World Urbanization Prospects **2018**, United Nations (UN), uri: https://population.un.org/wup/, publisher: UN Population Division, date published: 2018" | "Population in largest city is the urban population living in the country's largest metropolitan area." Methodology: "The indicator is calculated using World Bank population estimates and urban ratios from the United Nations World Urbanization Prospects." | WB text says "metropolitan area". The underlying WUP 2018 city series uses a **country-specific concept**: city proper, urban agglomeration or metropolitan area (see §2). **The WB does not name the city.** | **2025 → 4,347,104** people (2024: 4,331,974; 2023: 4,315,671) | WUP 2018 has observed data up to about 2018 at most; the 2025 value is a **projection-based model value**: WUP 2018 ratios × WB total population (INFERRED from the methodology text). Referenceperiod "1960-2025". | "Because the estimates of city and metropolitan area are based on national definitions of what constitutes a city or metropolitan area, cross-country comparisons should be made with caution." "The population of a city or metropolitan area depends on the boundaries chosen." |
| **EN.URB.LCTY.UR.ZS** Population in the largest city (% of urban population) | WUP 2018 (same as above) | "Population in largest city is the percentage of a country's urban population living in that country's largest metropolitan area." | As above | **2025 → 10.589 %** | As above. INFERRED: 4,347,104 ÷ (58,915,656 × 0.696809) = 10.59 %. The numerator is based on WUP **2018**; the denominator's urban ratio is from WUP **2025**. One indicator therefore mixes two revisions. | Same as above |
| **EN.URB.MCTY** Population in urban agglomerations of more than 1 million | WUP 2018 | "Population in urban agglomerations of more than one million is the country's population living in metropolitan areas that in 2018 had a population of more than one million people." | Set of agglomerations above 1 M **in 2018** (fixed list) | **2025 → 11,506,575** | Projection-based, as above | "Due to varying definitions, it is not possible to compare different agglomerations around the world." |

The WB metadata itself quotes the UN definitions (Developmentrelevance of EN.URB.MCTY / EN.URB.LCTY):
- "According to the United Nations, an Urban Agglomeration refers to the de facto population contained within the contours of a contiguous territory inhabited at urban density levels without regard to administrative boundaries."
- "According to the United Nations' definition, a metropolitan area includes both the contiguous territory inhabited at urban levels of residential density and additional surrounding areas of lower settlement density that are also under the direct influence of the city (e.g., through frequent transport, road linkages, commuting facilities etc.)."

**Wording conflict.** The WB short definition says "largest **metropolitan area**", the series name says "largest city", and WUP 2018 used urban agglomeration where possible (see §2). The WB wording is therefore looser than the UN's.

---

## 2. UN DESA — World Urbanization Prospects (WUP)

**A newer revision exists.** `https://population.un.org/wup/` (fetched today): "This web site presents the main findings of the **2025 Revision** of World Urbanization Prospects …". The FAQ (`https://population.un.org/wup/faqs`) says: "The WUP 2025 is the 22nd edition of the series. The previous one was issued in 2018." and "This revision supersedes all previous estimates and projections published by the United Nations." The launch was 18 November 2025.

### 2a. WUP 2014/2018 concepts (national definitions; the basis of EN.URB.LCTY / MCTY)

The WUP 2018 Methodology PDF (`https://population.un.org/wup/assets/Publications/WUP2018-Methodology.pdf`) is 4.4 MB, above the 2 MB limit, so it is **NOT FETCHED**. The quotes below come from the **WUP 2014 Methodology**, `https://population.un.org/wup/assets/Publications/WUP2014-Methodology.pdf`, pp. 4–5. I have **NOT VERIFIED** whether the 2018 text is word-for-word the same; the series continued the same approach.

- City proper: "population statistics are often reported in terms of the territory delimited by administrative boundaries … Thus, the "city proper" as defined by administrative boundaries may not include suburban areas where an important proportion of the population working or studying in the city resides."
- Urban agglomeration: "the concept of an urban agglomeration, which refers to the population contained within the contours of contiguous territory inhabited at urban levels of residential density."
- Metropolitan region: "the concept of the metropolitan region, which includes both the contiguous territory inhabited at urban levels of residential density and additional surrounding areas of lower settlement density that are under the direct influence of the city (for example, through established transport networks, road linkages or commuting patterns)."
- Choice of concept: "the Population Division endeavoured to use data or estimates based on the concept of urban agglomeration. When those data were not consistently available, population data that refer to the city as defined by its administrative boundaries were used." … "In those instances, the data referring to the metropolitan area were usually preferred … However, the population of the metropolitan area is also likely to be larger than that of the urban agglomeration associated with it, so an upward bias may have been introduced in specific cases."
- Mixed concepts across countries (Table 2, 2014): city proper alone in 89 countries, urban agglomeration in 79, metropolitan area in 11, and mixed by city in the remaining countries.
- No harmonisation: "No attempts have been made to impose consistency in definitions across countries."

**Rome in WUP 2018.** I have **NOT VERIFIED** which statistical concept WUP 2018 uses for "Roma" (city proper, agglomeration or metro) or its 2025 projected value. Both are in `assets/Download/Archive/WUP2018-Excel-files.zip` (5.37 MB, over the limit, **NOT FETCHED**). INFERRED: the WB value of about 4.35 M fits an agglomeration or metro-type figure for Rome, not the comune (about 2.75 M). The WB does not say which city it is.

### 2b. WUP 2025 (Degree of Urbanisation, harmonised)

- Glossary (`https://population.un.org/wup/glossary-demographic-terms`):
  - "Cities: According to the Degree of Urbanization methodology, contiguous geographic areas with a high population density (at least 1,500 people per km2) and a total population of at least 50,000 inhabitants."
  - "Urban agglomeration: A continuous urban area formed by a city and its surrounding developed areas, regardless of administrative boundaries."
  - "Urban Population: De facto population living in areas classified as urban according to the criteria used by each area or country, or population living in cities and towns (based on DEGURBA). Data refer to 1 July of the year indicated".
- FAQ PDF (`assets/Publications/undesa_pd_2025_faq_wup25.pdf`), Q12: "A "city" is a contiguous agglomeration of 1-km² grid cells with a density of at least 1,500 inhabitants per km² and a total population of at least 50,000." Q31: "significant difference from WUP 2018, where Tokyo was ranked 1st and Jakarta was ranked 30th based on country-specific definitions."
- **Rome, VERIFIED.** WUP 2025 File F20 (`assets/Download/Cities/WUP2025-F20-DEGURBA-Capital_Cities.xlsx`, "Population of Capital Cities in mid-2025 (thousands)") lists: Italy · City_Code 4156 · "Roma (Rome)" · Type "City" · "National capital" · **Pop2025 = 2,376.474 thousand**, i.e. 2,376,474 at mid-2025. This is a 2025 estimate under the DEGURBA "city" concept (a dense grid cluster, roughly the high-density urban centre). It is **not** the comune and **not** the WUP 2018 agglomeration.

---

## 3. Natural Earth — Populated Places 1:10m (the file NEXUM uses)

NEXUM `sources_live/naturalearth.places.toml` names "Natural Earth — Populated places 1:10m", and the connector fetches `https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip`. It reads **only `pop_max`**.
**Version: 5.1.2**, from `ne_10m_populated_places.VERSION.txt` inside the zip. The download page today also says "version 5.1.2", and the CHANGELOG dates 5.1.2 to 2022-05-13. GitHub `master/VERSION` reads `5.2.0-pre`; the CHANGELOG lists 5.2.0 (2022-06-02), which updated physical themes only. The CDN zip is still 5.1.2.

Documentation (download page `https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/`, identical README.html in the zip):
- "We favor regional significance over population census in determining our selection of places."
- "LandScan derived population estimates are provided for 90% of our cities."
- "We provide a range of population values that account for the total "metropolitan" population rather than it's administrative boundary population. Use the PopMax column to size your town labels."
- "Starting in version 1.1, popMax has been throttled down to the UN estimated metro population for the ~500 largest urban areas in the world."
- Method: "Population estimates were derived from the LANDSCAN dataset maintained and distributed by the Oak Ridge National Laboratory. … pixels with fewer than 200 persons per square kilometer were removed … aggregated into contiguous units. … Thiessen polygons … As a result, our estimates capture a metropolitan and micropolitan populations per city regardless of administrative units."

CHANGELOG (`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/CHANGELOG`), release 2.0.0 (2012-10-12): "The populated places pop_max and pop_min attributes are now fully built out for all records (**pop max is for the metropolitan area, pop_min is for the incorporated city of the same name**)."

**Not documented** anywhere I found: a reference year for POP_MAX, POP_MIN or POP_OTHER; the LandScan vintage used; the UN (WUP) revision used for the "throttled" values; any definition at all of **POP_OTHER**; and whether values have been refreshed since about 2012. → **reference year NOT DOCUMENTED**.

**Rome row (VERIFIED, local NEXUM cache, v5.1.2 DBF, NE_ID 1159151593, FEATURECLA "Admin-0 capital"):**
POP_MAX **3,339,000** · POP_MIN **35,452** · POP_OTHER **2,050,212** · RANK_MAX 12 · RANK_MIN 7 · MEGANAME "Rome" · MAX_POP10 2,143,900 · MAX_POP50 2,666,328 · POP2010 3339, POP2015 3333, POP2020 3330, POP2025 3330 (in thousands; these POPyyyy columns are undocumented too).
- INFERRED: POP_MAX (3,339,000) equals POP2010 × 1000. The "UN metro" throttle therefore appears to have taken a UN estimate for **2010** from an older WUP revision. The year and revision are NOT DOCUMENTED.
- POP_MIN = 35,452 is clearly **not** Rome's comune (about 2.75 M), despite the CHANGELOG's "incorporated city" claim. The field is unreliable for Rome. For comparison, Milan's POP_MIN is 1,306,661 and Naples's is 988,972, which are plausible city-proper values.

---

## 4. ISTAT — Roma Capitale

**NOT FETCHED.** I stayed within the 1–2 request limit and both SDMX attempts failed:
1. `https://esploradati.istat.it/SDMXWS/rest/data/IT1,22_289_DF_DCIS_POPRES1_1,1.0/A.058091+ITI43.JAN.9.TOTAL.99?startPeriod=2024` → 404 "NoRecordsFound" (wrong code for one dimension).
2. The same dataflow with wildcards → 422 "Not enough key values in query, expecting 6 got 5".

Next step: fetch the structure (`/SDMXWS/rest/dataflow/IT1/22_289_DF_DCIS_POPRES1_1/1.0?references=all`) to get the correct REF_AREA codes for the comune (058091) and the città metropolitana. Alternatively read the "Bilancio demografico" table on https://demo.istat.it/.

Values from memory, **NOT VERIFIED**: Roma comune about 2.75 million residents on 1 Jan 2025; Città metropolitana di Roma Capitale about 4.2 million.
Definitions, **NOT VERIFIED** (not fetched):
- *Popolazione residente*: people with habitual residence (dimora abituale) in the comune, as recorded in the population register (anagrafe), counted at 1 January / 31 December.
- *Comune*: the basic administrative unit; Roma Capitale is the comune of Rome.
- *Città metropolitana*: the metropolitan local authority (L. 56/2014) that replaced the province. Its territory is the former Provincia di Roma, 121 comuni.

---

## 5. Eurostat vocabulary (reference)

- City: "a city is a local administrative unit (LAU) where at least 50 % of the population lives in one or more urban centres." (https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:City)
- Functional urban area: "a functional urban area consists of a city and its commuting zone. Functional urban areas therefore consist of a densely inhabited city and a less densely populated commuting zone whose labour market is highly integrated with the city (OECD, 2012)." (…title=Glossary:Functional_urban_area)
- The WB metadata quotes Eurostat's grid thresholds: urban clusters "of 1 km2 with a density of at least 300 inhabitants per km2 and a minimum population of 5,000", and high-density clusters "at least 1,500 inhabitants per km2 and a minimum population of 50,000".
- The "Metropolitan regions" glossary page returned 404, so no quote.

Vocabulary from smallest to largest: **comune / city proper** (administrative) < **urban centre / DEGURBA city** (dense grid cluster) ≈ **urban agglomeration** (contiguous built-up area) < **FUA / metropolitan area** (city + commuting zone) ≤ **città metropolitana** (an administrative unit; for Rome it is the former province).

---

## 6. Rome side by side

| Figure | Value | Unit / concept | Reference time | Producer | Status |
|---|---|---|---|---|---|
| WB EN.URB.LCTY (Italy, largest city, unnamed) | 4,347,104 | people, "largest metropolitan area" (WUP 2018 city concept, country-specific) | 2025, projection-based | World Bank from UN WUP 2018 | VERIFIED value; that the city is Rome is INFERRED |
| WUP 2025 DEGURBA city "Roma (Rome)" | 2,376,474 | people, DEGURBA city (≥1,500/km² grid cluster) | mid-2025 estimate | UN DESA WUP 2025 | VERIFIED |
| Natural Earth POP_MAX "Rome" | 3,339,000 | people, "metropolitan" (LandScan, throttled to UN metro) | NOT DOCUMENTED (matches its POP2010) | Natural Earth 5.1.2 | VERIFIED value |
| Natural Earth POP_OTHER | 2,050,212 | undocumented | NOT DOCUMENTED | Natural Earth | VERIFIED value, meaning NOT DOCUMENTED |
| Natural Earth POP_MIN | 35,452 | "incorporated city" per CHANGELOG, but obviously wrong for Rome | NOT DOCUMENTED | Natural Earth | VERIFIED value, unreliable |
| ISTAT residenti comune di Roma | ≈2.75 M | residents, comune | 1 Jan 2025 | ISTAT | NOT VERIFIED |
| ISTAT residenti Città metropolitana | ≈4.2 M | residents, città metropolitana (121 comuni) | 1 Jan 2025 | ISTAT | NOT VERIFIED |
| Italy total (context) | 58,915,656 | people, de facto, midyear | 2025 estimate | World Bank | VERIFIED |
| Italy % urban | 69.68 % | national definition | 2025 | WB = UN WUP 2025 | VERIFIED |

Rome therefore has four different "populations" ranging from 2.0 to 4.35 million. They are different concepts, not errors, except POP_MIN.

---

## 7. Recommended plain-Italian labels

| Figure | Label | Short note under the value |
|---|---|---|
| SP.POP.TOTL | **Popolazione del Paese (stima a metà anno, ONU/Banca Mondiale)** | "Conta chi vive nel Paese, a prescindere da cittadinanza e status legale." |
| EN.POP.DNST | **Densità di popolazione (abitanti per km² di terraferma)** | "Esclude laghi e fiumi principali; anno precedente." |
| SP.URB.TOTL.IN.ZS | **Quota di popolazione urbana (definizione nazionale, ONU)** | "Ogni Paese decide cosa è "urbano": non confrontabile tra Paesi." |
| EN.URB.LCTY | **Popolazione della città più grande (area urbana/metropolitana, ONU 2018, stima)** — or, shorter, *"Popolazione dell'area urbana più grande (stima ONU)"* | "La fonte non dice quale città. Confini definiti dall'ONU, diversi dal comune; valore 2025 proiettato dalla revisione 2018." Avoid "agglomerato" as the definite concept: the WB says "metropolitan area" and WUP mixes concepts. |
| EN.URB.LCTY.UR.ZS | **Quota della popolazione urbana nella città più grande (ONU, stima)** | same caveat |
| EN.URB.MCTY | **Popolazione nelle aree urbane oltre 1 milione (elenco ONU 2018, stima)** | |
| NE POP_MAX | **Stima dell'area urbana (Natural Earth, anno non documentato)** | "Stima indicativa per l'area metropolitana, non il comune; anno non documentato (circa 2010)." |
| NE POP_MIN / POP_OTHER | Do not display. They are undocumented or unreliable; Rome's POP_MIN is 35,452. | |
| WUP 2025 DEGURBA | **Popolazione della città (criterio ONU armonizzato, 2025)** | "Area densamente abitata ≥1.500 ab./km², uguale in tutti i Paesi." |
| ISTAT comune | **Residenti nel comune (ISTAT, 1° gennaio AAAA)** | |
| ISTAT CM | **Residenti nella Città metropolitana (ISTAT, 1° gennaio AAAA)** | |

Rule: never show two of these as "the population of Rome" without the concept label. Never compute or compare across concepts (for example POP_MAX against the comune).
