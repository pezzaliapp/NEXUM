# NEXUM — Oceanographic Network: audit and design (2026-10-08)

**Phase:** research and design only. Nothing was implemented, no connector runs, nothing is imported, committed or deployed.

**Evidence:**
- `docs/ocean-audit/A-ndbc-argo-oceansites-oceanops.md`: NDBC, OceanSITES, Argo, Euro-Argo, OceanOPS, GOOS/DBCP, OSMC, GDP.
- `docs/ocean-audit/B-emodnet-cmems-med-others.md`: EMODnet, CMEMS, Mediterranean and other networks.
- `docs/ocean-audit/C-nexum-audit.md`: audit of NEXUM.
- Each section of those files quotes the official text with its URL.

**Legend:**
- **[FACT]**: documented in an official source, with the quote in the appendices.
- **[TEST]**: technical check run on 2026-10-08.
- **[DESIGN]**: proposal, not yet tested.
- **NOT VERIFIED**: not confirmed. No permission is assumed.

**Research incident (declared):** one probe of the OceanOPS API without a `limit` downloaded the whole platform table (48.8 MB), over the 2 MB per-request cap. The file was deleted without being used. Every other request stayed under 2 MB.

---

## 1. Networks verified (official links)

| Network | Platform type | Coverage | Indicative size | Access |
|---|---|---|---|---|
| **NOAA NDBC** · ndbc.noaa.gov | Moored buoys, C-MAN/coastal stations, oil platforms, DART, TAO, USV, drifting | US waters plus international partners (PIRATA, RAMA, TAO, DART) | [FACT] `activestations.xml` 2026-10-08: **1,354 stations** (441 buoy, 710 fixed, 76 DART, 54 oilrig, 48 TAO); 882 rows in `latest_obs.txt` | Static files (XML, fixed-width text), THREDDS, CoastWatch ERDDAP `cwwcNDBCMet` (since 1970) |
| **OceanSITES** · oceansites.org (site unreachable: TLS) | Deep-ocean observatories, moorings | Global, sparse | [FACT] 116 site folders in the GDAC | NetCDF via NDBC THREDDS / Ifremer ERDDAP |
| **Argo / Euro-Argo** · argo.ucsd.edu, euro-argo.eu | Drifting profiling floats | Global open ocean | [FACT] "close to 4000 active floats"; global index 318 MB | GDAC (https/S3), Ifremer ERDDAP `ArgoFloats`, Euro-Argo fleet API |
| **OceanOPS** · ocean-ops.org | Metadata of all GOOS networks | Global | [FACT] 86,020 platform records (metadata, no measurements) | REST API |
| **GOOS / DBCP** (IOC-UNESCO, WMO) | Coordination | — | — | No data endpoint of their own |
| **NOAA OSMC** (CoastWatch / AOML ERDDAP) | Data distributed on the GTS: moored buoys, drifters, tide gauges, ships | Global | NOT VERIFIED (sample only) | ERDDAP `OSMC_30day`, `OSMC_RealTime` |
| **NOAA Global Drifter Program** | Drifters | Global | — | AOML ERDDAP (hourly series end 2022-10-31; 6-hourly end 2025-06-18) |
| **EMODnet Physics** · emodnet-physics.eu | Moorings, tide gauges, drifters, Argo (aggregator) | Europe plus global | [FACT] 5,204 moorings (`EP_PLATFORMS_MO_ATLAS`, historical included) | GeoServer WFS/WMS, ERDDAP (unstable) |
| **Copernicus Marine In Situ TAC** · marine.copernicus.eu | Aggregator of national networks | Global | [FACT] 17,503 platforms in the "latest" dataset | Toolbox / S3 **with account** |
| **ISPRA RMN / RON** (Italy) · isprambiente.it, mareografico.it | Tide gauges (RMN 36), wave buoys (RON) | Italian coasts | [FACT] RMN 36; RON "aggiornato al 31/12/2023", real-time network inactive | SPARQL/RDF (LOD), HTML |
| **Puertos del Estado** (Spain) · puertos.es | Buoys (REDEXT/REDCOS), tide gauges, HF radar | Spain | ~45 tide gauges on THREDDS; 71 platforms in CMEMS | THREDDS (no buoys), portal |
| **CANDHIS / Cerema** (France) · candhis.cerema.fr | Wave buoys | France | ~30 in CMEMS | API with personal key |
| **SHOM REFMAR** (France) · refmar.shom.fr | Tide gauges | France / overseas territories | 233 in CMEMS | JSON/SOS; documented access by subscription |
| **HCMR POSEIDON** (Greece) · poseidon.hcmr.gr | Buoys | Aegean, Ionian | ~13 in CMEMS | Portal |
| **Marine Institute** (Ireland) · marine.ie | M-buoys (M2–M6) | Ireland | ~5 | ERDDAP `IWBNetwork` (with QC_Flag) |
| **IMOS / AODN** (Australia) | Wave buoys, moorings | Australia | NOT VERIFIED | Public S3 |
| **ECCC MSC Datamart** (Canada) | Moored buoys | Canada | NOT VERIFIED | SWOB-ML XML files |
| **US IOOS** (sensors ERDDAP) | Regional networks | USA | [FACT] 11,505 datasets with data from the last day | ERDDAP |
| **UHSLC** · uhslc.soest.hawaii.edu | Tide gauges | Global | NOT VERIFIED | ERDDAP (4–6 weeks late) |
| **IOC Sea Level Monitoring** · ioc-sealevelmonitoring.org | Tide gauges | Global | — | Portal / service |
| **CDIP** (Scripps), MET Norway, INCOIS, JMA, Cefas, Met Office, BoM | Various | — | — | See the classification |

---

## 2. Classification matrix

The rule is permanent: €0, no account or key, no trial, licence respected, no workarounds.

| Network | Class | Reason (details and quotes in the appendices) |
|---|---|---|
| **NDBC** (files and CoastWatch ERDDAP) | **GO**, build-time only | [FACT] NWS: "public domain, unless specifically noted otherwise". CoastWatch: "may be used and redistributed for free". Conditions: no endorsement, no NWS logo, "limit your retrievals to a minimal level" (at most once an hour per station). [TEST] browser **blocked by CORS**. ⚠ About 60% of stations belong to partners (IOOS, Scripps, ECCC…), whose terms are NOT VERIFIED. Start with stations owned by NDBC/NOS and mark the partners |
| **Argo** (GDAC, Ifremer ERDDAP) | **GO**, build-time only | [FACT] "freely available without restriction", with acknowledgement and DOI 10.17882/42182 (CC BY 4.0 on AWS). [TEST] Ifremer ERDDAP **blocked by CORS** in the browser |
| **NOAA OSMC** (GTS) | **GO**, build-time only, provisional | [FACT] CC0. Real coverage and delays NOT VERIFIED. [TEST] **blocked by CORS**. ⚠ The `wmo_list` dataset contains names and emails: never ingest it |
| **NOAA GDP** | **GO**, history only | [FACT] CC BY 4.0, DOI 10.25921/x46c-3620. [TEST] **blocked by CORS** |
| **EMODnet Physics** (GeoServer WFS) | **GO** for the catalogue, build-time | [FACT] CC BY 4.0, with credit to each record's originator. [TEST] a plain GET returned `ACAO: *`, but the real browser failed (timeout / "Failed to fetch"); ERDDAP returned 502. Unstable today. ⚠ Whether national restrictions (HCMR, Puertos) still apply to data redistributed through EMODnet is NOT VERIFIED |
| **Marine Institute Ireland** | **GO** (browser and build) | [FACT] CC BY 4.0, keyless. [TEST] **browser OK (CORS)** |
| **IMOS / AODN** | **GO**, build-time | [FACT] CC BY 4.0 plus the required acknowledgement. [TEST] S3 listing OK in the browser |
| **ECCC Datamart** | **GO**, build-time | [FACT] licence allows commercial use with attribution. [TEST] **blocked by CORS** |
| **ISPRA RMN** (LOD) | **GO**, build-time | [FACT] CC BY 4.0, keyless, updated daily (not real time) |
| **OceanSITES** | **CONDITIONAL** | [FACT] licence is per file: "User must display citation… contact PI prior to any commercial use". The official site is unreachable, so the general policy is NOT VERIFIED |
| **Euro-Argo fleet API** | **CONDITIONAL** | Terms NOT VERIFIED (`termsOfService: "urn:tos"`). [TEST] browser OK |
| **OceanOPS** | **CONDITIONAL** | No licence page found. The API spec declares keys. Needs written confirmation. Metadata only. [TEST] browser OK |
| **SHOM REFMAR** | **CONDITIONAL** | [FACT] Licence Ouverte, but documented access requires a subscription with name and email. [TEST] the JSON endpoint answers in the browser: technically possible but not documented as permitted. Confirm with SHOM first |
| **ISPRA RON**, mareografico.it | **CONDITIONAL** | Network inactive since 2023 / HTML only |
| **Puertos del Estado** | **CONDITIONAL** | Legal notice: "autorización escrita previa". THREDDS has no buoys |
| **US IOOS**, **UHSLC**, **IOC SLSMF**, **CDIP**, **DFO MEDS** | **CONDITIONAL** | Licence differs per dataset, or permissions are required, or commercial use is excluded, or "not altered" (CDIP) |
| **Copernicus Marine INSTAC** | **NO-GO** for NEXUM | [FACT] "To download and process data, you need to be signed in". An account is mandatory and NEXUM's rule is `auth = none`. The S3 files answering without login does not count as permission. EMODnet redistributes most of these data keyless |
| **CANDHIS** | **NO-GO** keyless | API key tied to a person's name, daily quota |
| **HCMR POSEIDON** (direct) | **NO-GO** | "personal use only… prohibited without the permission of HCMR" |
| **MET Norway Frost**, **INCOIS** | **NO-GO** | Account required / viewing only |
| **GOOS / DBCP** | **NO-GO** as a source | They coordinate and have no data endpoint. The DBCP site is "personal, non-commercial use" |
| JMA, Cefas, Met Office, BoM (direct) | NOT VERIFIED | Their buoys reach NEXUM through GTS/OSMC and EMODnet |

**[TEST] Browser CORS, real Chrome, 2026-10-08:**
- **Readable directly:** Marine Institute ERDDAP, IMOS S3, Euro-Argo API, OceanOPS API, SHOM JSON.
- **Blocked:** NDBC (every file), CoastWatch ERDDAP, Ifremer ERDDAP (Argo), OSMC/AOML ERDDAP, UHSLC, ECCC.
- **Unstable:** EMODnet (GeoServer and ERDDAP).

**Consequence:** the global layer can only be built on the author's machine, as NEXUM's snapshot already is. Live reading from the browser is possible only for a few European sources.

---

## 3. Coverage and gaps
- **Well covered:**
  - US coasts and Gulf, plus the tropical Pacific, Atlantic and Indian Ocean through the TAO, PIRATA and RAMA moorings (NDBC);
  - the global open ocean through Argo (profiles every ~10 days, not continuous);
  - Ireland, Canada and Australia.
- **Europe and the Mediterranean:** the national networks (Italy, Spain, France, Greece) can be reached keyless only through EMODnet, which is unstable today and has to credit each originator. Directly: ISPRA RMN (36 tide gauges, daily). SHOM needs confirmation.
  - **Italian wave network (RON) inactive since 2023:** there are no Italian real-time wave buoys from an official open source.
- **Africa, Asia, South America:** only GTS (OSMC) and Argo. National networks are absent or not open.
- **Drifting buoys:** only through OSMC (GTS). GDP is historical.
- **Not observations:** models and reanalyses (CMEMS forecast, Puertos `wave_*`/`circulation_*`) are never shown as measurements.

## 4. Parameters by network
| Parameter | NDBC | Argo | OSMC/GTS | EMODnet | Marine Inst. | ISPRA RMN | OceanSITES |
|---|---|---|---|---|---|---|---|
| Surface water temperature | WTMP | TEMP (surface profile) | sst | ✓ | SeaTemperature | ✓ | ✓ |
| Temperature at depth | `.ocean` some stations | **TEMP up to ~2000 m** | — | ✓ | — | — | ✓ |
| Air temperature | ATMP | — | atmp | ✓ | ✓ | ✓ | ✓ (some) |
| Waves: height / period / direction | WVHT, DPD, APD, MWD (+ spectra) | — | wvht | ✓ | WaveHeight, period | — (RON inactive) | some |
| Wind | WDIR, WSPD, GST | — | windspd/dir | ✓ | ✓ | ✓ | some |
| Pressure | PRES | (PRES = depth) | slp | ✓ | ✓ | ✓ | some |
| Salinity | `.ocean` some | **PSAL** | — | ✓ | ✓ (some) | — | ✓ |
| Currents | ADCP (some) | — (drift) | — | ✓ | — | — | ✓ |
| Dissolved oxygen | rare | DOXY (BGC) | — | ✓ | — | — | ✓ |
| pH, chlorophyll, turbidity | — | pH, CHLA, TURBIDITY (BGC) | — | ✓ (biochem/optics) | — | — | ✓ (some) |
| Sea level | TIDE (NOS) | — | tide gauges | ✓ | — | ✓ (m) | — |
| **Quality** | no per-value flag (automatic QC upstream) | `*_QC` 0–9 plus `data_mode` R/A/D | partial | per record | QC_Flag | NOT VERIFIED | `*_QC` |

[FACT] All of these are **direct measurements**. "Adjusted" Argo values are delayed-mode corrections, labelled as such.

## 5. Licences and economic sustainability
- **Cost:** €0 for every GO source. No key, no account, no paid quota.
- **Use already allowed by NEXUM's infrastructure:** files downloaded by the build process (Polite Scheduler, `auth = none` registry, conditional GET), redistributed in the static snapshot on Cloudflare Pages Free.
- **Attribution to show:**
  - "NOAA NDBC", with no endorsement and no logo;
  - Argo acknowledgement plus DOI;
  - "OSMC/NOAA" (CC0 does not require it, but it is correct to state it);
  - EMODnet Physics plus each record's originator;
  - Marine Institute and IMOS as their licences require.
- **Sustainable cadence:** NDBC at most once an hour (their request). Argo once a day (index). OSMC every 1–3 hours. EMODnet once a day (catalogue). All within the existing cadence of the live world.

## 6. Overlaps and deduplication
[FACT] Overlaps:
- TAO/PIRATA/RAMA are in NDBC and OceanSITES.
- NDBC, Argo and the European national buoys flow into GTS → OSMC.
- CMEMS includes the national networks, and EMODnet redistributes CMEMS.
- Argo is also in CMEMS and EMODnet.

[DESIGN] Deduplication by strong identifier, never by proximity:
1. **WMO ID / WIGOS ID** is the main key, as an `identifier(scheme="wmo", strong=1)`.
2. **Platform code** of each network (NDBC id, Argo float number, EMODnet `platform_code`) is a secondary identifier.
3. **Source order** for the same platform: the operator's network (NDBC, Marine Institute, ISPRA) → aggregator (EMODnet) → GTS (OSMC). The aggregator never overwrites the operator; it adds evidence.
4. **No identifier in common:** there is no merge. NEXUM's `merge_candidate` mechanism would flag the case for review, never merge it automatically.

## 7. Proposed architecture in NEXUM [DESIGN]
Based on the NEXUM audit (appendix C), the proposal reuses what exists, without parallel systems.
- **Objects:** a new type `ocean.platform` in `vocab_live/ocean.toml`.
  - `subtypes`: moored buoy · drifting buoy · profiling float (Argo) · coastal station · offshore platform · tide gauge · tsunami station (DART) · deep-ocean observatory.
  - Properties: network, operating organisation, `position_kind` (fixed/mobile), `status` (active / not reporting / historical, **as a property, never a retraction**), `sensors` (parameters actually present), `last_obs_utc`, `first_obs_utc`.
  - `identity_schemes`: wmo, wigos, ndbc, argo, emodnet.
- **Documented relations only:**
  - `part_of_network` → network object (`ocean.network`, e.g. "NDBC", "Argo", "TAO", "IOOS"), from the source catalogue's own field (`pgm`, `owner`);
  - `operated_by` → organisation, only if the catalogue names it.
  - **No relation by proximity:** no `near_place` / 15 km rule for buoys.
- **Measurements:** NOT one object per measurement and NOT claims.
  - **Latest values:** a published table `ocean_latest`, with rows `[platform id, time UTC, parameter, value, unit, quality, source]` and notes for window and QC legend. Same mechanism as hotspots and orbits.
  - **Short series** (7 days), in a few compressed shard files loaded only when a card opens. The 9,000-file cap leaves about 1,494 free.
  - **Long history:** link to the original source (ERDDAP or the network's page). Live reading only for sources with CORS OK (Marine Institute).
- **Evidence / provenance:** the existing chain (raw_record → record → evidence; quality_flags of the record).
- **Connectors:** CSV/JSON through ERDDAP or WFS, which the registry already accepts. NDBC fixed-width text would need a new access type in the registry, or the CoastWatch ERDDAP mirror. NetCDF is avoided.
- **W9:** the words "weather", "ship", "satellite", "country", "copernicus" go only in `vocab_live` / `points.json` / `ops.json`, never in `.ts`.

## 8. Proposed UX [DESIGN]
- **Layer:** "OCEANOGRAPHIC NETWORK — Boe e osservatori marini" in Livelli › Marittimo, separate from ships (AIS), ports and routes. It is never mixed with weather alerts.
- **Map:** reuses `ui/src/map/points.ts`.
  - Clustering for thousands of points; shape plus word, never colour alone.
  - Shapes: ● moored buoy, ◇ drifting buoy / float, ■ coastal station, ▲ offshore platform, ≋ tide gauge.
  - Two changes are needed in `points.ts`: the symbol set from configuration, and a legend that does not overlap the webcam legend.
- **Card:** the full NEXUM card (ObjectMode).
  - Identity, network, operator, type, position (with "last position of …" for drifters).
  - Latest measurements: value, unit, UTC time, quality, source.
  - State said plainly: **"recente (< 3 h)" / "dati di N giorni fa" / "nessun dato disponibile"**. No "LIVE".
  - 7-day graph if available.
  - Link to the original source, plus "Sintesi dei fatti".
- **Mobile:** sheet card, 44 px targets, list popup with 44 px buttons (today `.pts-pop` is 40 px), legend not over the controls. Tested on iPhone (WebKit), Fold closed and open, and tablet.

## 9. Estimated impact [DESIGN, approximate figures]
- **Objects:** NDBC ~1,354 + Argo ~4,000 + Marine Institute/ISPRA/IMOS ~100 = **~5,500 objects** in phase 1. Up to ~10–15,000 with OSMC and EMODnet.
- **Snapshot:**
  - files: ~22–60 sdoc files plus a few tiles, about 2–4% of the 9,000 cap (headroom 1,494);
  - objects: ~5–6 KB per element in the ent shards, so +30–80 MB;
  - `ocean_latest` table: ~1–3 MB;
  - 7-day shards: ~5–15 MB total, split into ≤ 2 MB files.
- **⚠ Fragile budget: O9** (first search now 5,949 of 6,000 ms). Making ~5,500 platforms searchable grows the search index. **Decision needed:** either exclude platforms from the global search (searchable only inside the layer, by WMO ID) or accept re-measuring O9. Without a decision, O9 would likely break.
- **O6 (initial load):** no impact if the layer stays lazy (loaded only when switched on).
- **Browser:**
  - Network: one points file (~0.3–0.5 MB) only when the layer is switched on; measurements only when a card opens.
  - Polling: none. Updates arrive with the snapshot.
  - Battery and memory: like the webcam layer.
- **Drifters:** positions change. Argo every ~10 days, drifters every hour (if added). The position claim history grows by ~150,000 per year. This is acceptable and is useful: it records the trajectory.
- **Data gates:** additions only. PRE-OSIRIS and MASTER-START stay at 0 losses (verified on the gate's logic, appendix C §6).

## 10. Incremental plan with acceptance criteria [DESIGN]
1. **P0 — decisions** (author):
   - initial sources;
   - O9 strategy;
   - colour and symbol of the layer;
   - inclusion of NDBC partner stations.
2. **P1 — catalogue:** NDBC (owned by NDBC/NOS, partners marked) and Argo (active floats) as `ocean.platform`, with network relations. Layer, card and source link; no measurements yet.
   - **Acceptance:**
     - object counts equal the catalogues (± stations without coordinates, stated);
     - 0 losses against PRE / MASTER-START;
     - O6 and O9 within threshold;
     - W9 / W22;
     - mobile geometry;
     - a tap on a buoy opens its card with the source;
     - same-place points separated;
     - no dataset with personal data ingested.
3. **P2 — latest measurements:** `ocean_latest` table (NDBC `latest_obs`, Argo surface of the last profile, OSMC moored).
   - **Acceptance:**
     - every value with unit, UTC time, quality and source;
     - "recente / N giorni fa / non disponibile" indicators correct on fixed inputs;
     - no "LIVE";
     - semantic gate with a new "Ocean" chain (platform → identifier → table row → provenance).
4. **P3 — short history:** 7-day shards, graph in the card.
   - **Acceptance:** shard ≤ 2 MB; loaded only on opening; graph values equal to the source's.
5. **P4 — Europe:** EMODnet catalogue (when stable) with originator credit; Marine Institute; ISPRA RMN; SHOM only after confirmation.
   - **Acceptance:** deduplication by WMO with the operator → aggregator → GTS order; never by proximity.
6. **P5 — global extension:** OSMC (moored and drifting buoys from the GTS), GDP history.
   - **Acceptance:** bounded cadence, conditional GET, O7 / O9 respected.

Each phase follows the usual cycle: live-review, full regression, author's approval, then production.

## 11. Risks, limits and open points
- **Licences NOT VERIFIED:**
  - NDBC partner stations (about 60%);
  - OceanOPS terms;
  - Euro-Argo API terms;
  - OceanSITES general policy (site unreachable);
  - whether HCMR and Puertos restrictions still apply to data seen through EMODnet;
  - SHOM's permission to use the endpoint without subscribing;
  - licences of MEDS, Cefas, Met Office, BoM and JMA.
- **Availability:** EMODnet unstable (ERDDAP 502); NDBC SOS discontinued; OceanSITES site unreachable; US Argo centre unreachable.
- **Quality:** NDBC has no per-value flag; QC is automatic upstream, and NEXUM will say so ("controllo automatico della fonte"). Real-time Argo is less reliable than delayed-mode Argo, and NEXUM will show the mode.
- **Privacy:** OSMC's `wmo_list` contains contacts (names, emails) and must never be ingested. Organisations as operators are fine, individuals are not.
- **Coverage:** no Italian real-time wave data from an official open source (RON inactive). Africa, Asia and South America only via GTS and Argo.
- **Performance:** O9 at the limit (see §9).
- **Confusion to avoid:** buoys ≠ ships (AIS) ≠ weather alerts ≠ forecast models. The Venezia "maree" webcams stay cameras.
- **Not covered by this phase:** real-time monitoring, alerts on thresholds (they would be new events not documented by the source), forecasts.

*Author of NEXUM: Alessandro Pezzali. Implementation waits for the author's GO.*
