# Ocean buoys and marine platforms: EMODnet, CMEMS, Mediterranean national networks and other public networks

Research only. Date: 2026-10-08, sample requests made 18:55–19:15 UTC.
User-Agent on every request: `NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)`. No Origin header, no authentication, no accounts.
The raw headers and bodies of every request are in `scratchpad/ocean/raw/*.h|*.b` (all under 2 MB; ranged GET).

"ACAO" means the `Access-Control-Allow-Origin` response header seen on a plain GET with no Origin header. If it is absent here, the server may still send it when a browser sends Origin, so a real browser test must settle CORS. **Absent = browser CORS NOT VERIFIED.**

Observations and models: everything classified below is an **in situ direct measurement** unless marked MODEL. CMEMS forecast, analysis and reanalysis products, and the Puertos del Estado `wave_*`, `circulation_*` and `harmonie*` THREDDS catalogues, are MODEL outputs. They must never become NEXUM "observations".

---

## 0. Classification table

| # | Network / endpoint | Class | Key reason |
|---|---|---|---|
| 1 | **EMODnet Physics – GeoServer WFS/WMS** (platform catalogue) | **GO** | Keyless HTTPS. Sends `Access-Control-Allow-Origin: *`. EMODnet products are CC BY 4.0, but each record must credit its data originator (field present in WFS) |
| 1b | EMODnet Physics – ERDDAP (time series) | **CONDITIONAL** | Server unreachable on 2026-10-08 (timeouts, then `502 Proxy Error`). Availability, CORS and dataset IDs NOT VERIFIED |
| 2 | **CMEMS In Situ TAC** (INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030 etc.) | **NO-GO for the browser. CONDITIONAL for a local connector** | Official FAQ: "To download and process data, you need to be signed in". Needs a (free) Copernicus Marine or CDSE account. The S3 store is reachable anonymously, but using it without signing in contradicts the documented rule, so do not use it |
| 3a | **ISPRA RMN** (tide gauges) via dati.isprambiente.it SPARQL/LOD | **GO (local snapshot)**. Browser: CONDITIONAL | Licensed CC BY 4.0, keyless, HTTPS. LOD updated daily (not real time). ACAO absent |
| 3b | ISPRA RON (wave buoys) | **CONDITIONAL** | LOD archive only, "aggiornato al 31/12/2023". The page says real-time data will follow "alla riattivazione della rete". Current activity NOT VERIFIED |
| 3c | ISPRA mareografico.it real-time pages | **CONDITIONAL** | Licence is CC BY 4.0 (ISPRA legal notes), but there is no documented API. Only HTML pages, which would mean scraping |
| 4 | **Puertos del Estado** (portus / opendap THREDDS) | **CONDITIONAL** (written authorisation) | Keyless THREDDS. The legal notice requires "autorización escrita previa" for reproduction and distribution. No open data licence found. Same data available through CMEMS/EMODnet |
| 5 | **CANDHIS (Cerema)** wave buoys | **NO-GO keyless. CONDITIONAL local** | Licence Ouverte Etalab 2.0 (good), but the API needs a key requested by email with name, activity and organisation type. Daily quota, IP bans |
| 6 | Météo-France marine buoys | **NOT VERIFIED (direct)** | No open buoy dataset found on data.gouv.fr. Météo-France buoys reach users via GTS → OSMC (CC0) and CMEMS |
| 7 | **SHOM REFMAR** tide gauges | **CONDITIONAL** | Licence Ouverte (etalab-2.0, `lov2`). The JSON endpoint answers keyless with `ACAO: *`, but the documented "flux" access goes through a subscription with name and email. Whether anonymous use is allowed is NOT VERIFIED. Limited to 31 days per request |
| 8 | **HCMR POSEIDON** (Greece) | **NO-GO (direct)** | Terms: "for their personal use only. Commercial or any other use … prohibited without the permission of HCMR". Use the HCMR platforms only via CMEMS/EMODnet, under their terms |
| 9 | **NOAA OSMC_RealTime** (GTS obs, AOML ERDDAP) | **GO (local)**. Browser CONDITIONAL | CC0 1.0, keyless, global (moored, tropical moored, weather buoys, tide gauges, ships, ice buoys). ACAO absent |
| 10 | **NOAA Global Drifter Program** (AOML ERDDAP) | **GO (history)** | CC BY 4.0. The hourly QC set is delayed mode (ends 2022-10-31). For real time use OSMC |
| 11 | **US IOOS sensors ERDDAP** | **CONDITIONAL** | Keyless. 11,505 datasets with data in the last day. The `license` attribute varies by provider and must be checked dataset by dataset |
| 12 | **Marine Institute (Ireland) IWBNetwork** | **GO** | CC BY 4.0, keyless ERDDAP. Sample returned M2, M3, M5, M6 with QC_Flag. ACAO absent |
| 13 | **IMOS / AODN** (Australia) | **GO (local)** | "IMOS data is licensed under a Creative Commons Attribution 4.0 International Licence" plus a mandatory acknowledgement. Public S3 listing works. ACAO absent |
| 14 | **ECCC MSC Datamart** (Canada moored buoys, SWOB-ML) | **GO (local)** | ECCC Data Servers End-use Licence v2.1.1 (commercial use OK, attribution). ACAO absent on the listing |
| 15 | DFO MEDS (Canada wave archive) | **CONDITIONAL** | Citation text verified. Licence and machine endpoint NOT VERIFIED |
| 16 | **UHSLC** (tide gauges, ERDDAP) | **CONDITIONAL** | "may be used and redistributed for free", but some originators add restrictions (e.g. SANHO asks for permission). Restricted stations must be excluded |
| 17 | IOC Sea Level Station Monitoring Facility (VLIZ) | **CONDITIONAL** | "may not be used for any commercial purposes". No QC. NEXUM is €0 and non-commercial, but redistribution terms and API terms are NOT VERIFIED |
| 18 | CDIP (Scripps) | **CONDITIONAL** | "freely available for public use, provided that they are not altered in any way" plus a link is required. Whether unit conversion or derivation counts as "altered" is NOT VERIFIED |
| 19 | MET Norway Frost | **NO-GO** (keyless rule) | "To access the API you need to create a user … client ID" |
| 20 | INCOIS (India) moored buoys | **NO-GO** | Data holdings table: "Public Access with only visualisation option. No download option." |
| 21 | JMA (Japan) | **NOT VERIFIED** | The website is under Public Data License 1.0 (attribution), but no buoy observation feed was identified |
| 22 | Cefas WaveNet / UK Met Office / BoM wave buoys | **NOT VERIFIED** | The WaveNet site is a JS app and its API path returned 404. Met Office and BoM were not verified. All three are present in CMEMS INSTAC (see the overlap section) |
| 23 | NOAA NDBC (for reference) | GO (likely covered in another report) | `latest_obs.txt` keyless, 884 lines. `activestations.xml` lists 1,354 stations. ACAO absent. The disclaimer page returned 403 to our UA |

---

## 1. EMODnet Physics

1. **Coverage:** European seas plus global (Argo, DBCP, OceanSITES, GLOSS, PSMSL, SONEL, IABP, SOOS). Source: https://emodnet.ec.europa.eu/en/physics
2. **Count:** the WFS `EMODnet:EP_PLATFORMS_MO_ATLAS` returned `"totalFeatures": 5204` fixed and moored platforms on 2026-10-08T19:14Z. This "atlas" includes historical platforms. Other layers exist per type: `EP_PLATFORMS_DB_ATLAS` (drifting buoys), `_GL_` (gliders), `_FB_` (ferrybox), `_HFR_` (HF radar), `_RVFL_` (river flow), plus PSMSL/SONEL. The physics page says there are "over 600" river stations. Counts for the other types: NOT VERIFIED (not queried).
3. **Platform types:** MO moorings and fixed stations, DB drifting buoys, PF Argo, GL gliders, TG tide gauges, FB ferrybox, HFR, river stations, CTD.
4. **Parameters:** waves, currents, temperature, salinity, sea level, meteorology, oxygen, biochemistry, optics, carbon, river flow. These are the WFS layers `ERD_EP_*_INSITU`. Each feature also lists SeaDataNet P01 codes.
5. **Current and history:** the sample feature has `time_coverage_start` 2024-05-19 and `LastDataMeasured` 2026-10-08T18:50Z. Monthly `availableDates` are listed too.
6. **Update frequency:** "Operational data management is conducted in collaboration with the In Situ TAC of the Copernicus Marine Service … and Physics synchronizes these data several times per day" (physics page). The sample feature's `updateDate` was 2026-10-08T19:00Z.
7. **Access:**
   - GeoServer: `https://geoserver.emodnet-physics.eu/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities`. It answered after a 301 redirect, with 39 feature types.
   - WFS sample: `https://geoserver.emodnet-physics.eu/geoserver/EMODnet/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=EMODnet:EP_PLATFORMS_MO_ATLAS&count=2&outputFormat=application/json`
   - ERDDAP: `https://erddap.emodnet-physics.eu/erddap/`. On 2026-10-08 three requests timed out (40–120 s) and one returned `HTTP/1.1 502 Proxy Error`. The TCP port is open (151.1.245.87). **NOT VERIFIED.**
   - Map app (map.emodnet-physics.eu) now redirects to the EC geoviewer. Its internal API was not identified.
8. **HTTPS and CORS:** GeoServer WFS returns `Access-Control-Allow-Origin: *`. ERDDAP: NOT VERIFIED.
9. **Auth, limits, cost:** none observed on GeoServer. No documented rate limits found (NOT VERIFIED).
10. **Licence**, from https://emodnet.ec.europa.eu/en/terms-use-emodnet-online-services-data-and-data-products:
    - "Unless indicated otherwise, data products created by EMODnet are owned by the EU and therefore licensed under Creative Commons CC-BY 4.0."
    - For data records: "When using one or more specific data record(s) or set(s), reference/acknowledgement is to be made to the data originator/provider … 'This data was downloaded from the EMODnet Portal (https://emodnet.ec.europa.eu/en/). The data originator(s) is/are [name …]'"
    - "…consult any use restrictions or licences of individual data originators, as noted in the metadata."
    - Physics page: "EMODnet Physics encourages the adoption of the CC-BY license".
    - So the platform/observation records are originator data, not automatically CC BY. NEXUM must carry `DataOwner` and EDMO for each platform. Originators known to restrict use (e.g. HCMR web terms) need a per-originator decision.
11. **Fields:**
    - `PlatformCode`, `PlatformID`, `PlatformTypeCode` (MO, …), `Country`, `DataOwner`, `properties.dataOwner.edmo`
    - point geometry in EPSG:4326, ISO UTC `LastDataMeasured`, SeaDataNet P01 parameter codes
    - QC/QF flags are in the ERDDAP data (NOT VERIFIED here)
12. **Overlap:** EMODnet Physics NRT is a redistribution of CMEMS INSTAC ("collaboration with the In Situ TAC"). It also includes regional providers, e.g. ARPAE Emilia-Romagna buoy "Nausicaa2" in the sample. EMODnet is therefore the **keyless route** to most INSTAC platform metadata.

## 2. Copernicus Marine Service – In Situ TAC

1. **Coverage:** global plus regional products (ARC, BAL, NWS, IBI, MED, BS).
2. **Count:** the platform index of the `latest` dataset (`platforms.json.gz`, generated 2026-10-08T18:08Z) lists **17,503 platforms**:

   | Type | Count |
   |---|---|
   | PF Argo | 6,064 |
   | TS ships | 3,987 |
   | DB drifting buoys | 3,783 |
   | MO moorings | 1,381 |
   | TG tide gauges | 700 |
   | ML | 367 |
   | CT | 280 |
   | GL | 268 |
   | RF river | 254 |
   | SM | 180 |
   | SD | 90 |
   | XB | 79 |
   | FB | 46 |
   | other | <10 each |

3. **Platform types:** as in the table above.
4. **Parameters:** temperature, salinity, currents, sea level, waves, oxygen, chlorophyll, meteorology. The STAC lists variables such as ATMP, DOXY, TEMP, VHM0 and others.
5. **Current and history:** the latest dataset covers 2024-05-20 → 2026-10-08T17:06Z (latest validStartDate 2026-09-08). There are also `monthly` and `history` datasets.
6. **Update frequency:** "near real-time (NRT) in situ quality controlled observations, hourly updated and distributed by INSTAC within 24-48 hours from acquisition in average" (STAC `product.stac.json`).
7. **Access:**
   - STAC (metadata, public): `https://stac.marine.copernicus.eu/metadata/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/product.stac.json`
   - Native NetCDF and index files: `https://s3.waw3-1.cloudferro.com/mdl-native-01/native/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/cmems_obs-ins_glo_phybgcwav_mynrt_na_irr_202311/` with `index_latest.txt` (43.7 MB), `index_platform.txt` (18.3 MB), `index_monthly.txt` (214 MB) and `index_history.txt`.
   - ARCO platform index: `https://s3.waw3-1.cloudferro.com/mdl-arco-time-061/arco/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/cmems_obs-ins_glo_phybgcwav_mynrt_na_irr_202311--ext--latest/platforms.json.gz` (115 KB)
   - WMTS.
   - Copernicus Marine Toolbox (`copernicusmarine get/subset`).
8. **HTTPS and CORS:** HTTPS. ACAO absent on STAC and S3 plain GETs.
9. **Auth (decisive):**
   - The S3 objects answered anonymously (HTTP 200/206), but the official documentation requires sign-in to download.
   - Help Center (https://help.marine.copernicus.eu/en/articles/4220332-how-to-register-for-copernicus-marine-service): "Can I have access to data without registering to Copernicus Marine? Yes. You can search and view data with MyOcean Pro directly in your browser without any account. **To download and process data, you need to be signed in**, but you don't necessarily need a Copernicus Marine account to do so" (a CDSE account also works).
   - Toolbox login: "creates a configuration file called .copernicusmarine-credentials that grants access to all Copernicus Marine Data Store services".
   - SLA: "Login and password are personal to the signatory of the SLA and non-transferable."
   - **Verdict:** a mandatory (free) account means NO-GO for keyless browser use. For a local connector it is CONDITIONAL on the author deciding to hold a free account. Note that the Help Center says registration means accepting the Terms of Use. Do not use the anonymous S3 path as a workaround.
10. **Licence:** https://marine.copernicus.eu/user-corner/service-commitments-and-licence
    - "2.1 This Licence is granted free of charge."
    - 2.2: "(b) modify, adapt, develop, create and distribute Value Added Products or Derivative Work … for any purpose; (c) redistribute, disseminate any Copernicus Marine Service Product in their original form via any media."
    - 2.4: credits must be "clearly visible on the home page of the Licensee's website or at least on the page allowing to access to the products". Derived work: "Generated using E.U. Copernicus Marine Service Information; insert DOIs links here".
    - 2.6 obliges the licensee to "maintain such records to document and trace use … This requirement will be propagated in all descending licences". This clause matters for NEXUM redistribution.
    - Free of charge "until … 30 June 2028". The FAQ states a planned update to "always be free of charge".
    - The STAC `license` field says `"proprietary"`.
11. **Identifiers and QC:**
    - platform code + type (e.g. `61499___MO`), WMO and EDMO codes, DOIs per platform
    - OceanSITES/Copernicus NetCDF with `*_QC` flags (0–9 scale per the INSTAC PUM; flag scale NOT VERIFIED here)
    - UTC times
12. **Overlap:** CMEMS INSTAC is the hub. Institutions in `latest` include:
    - ISPRA ("Institute for Environmental Protection and Research") 38
    - Puertos del Estado 71 (MO 30, TG 40)
    - HCMR 6+6+1
    - Cerema about 30 (CANDHIS buoys)
    - Météo-France CMM 26 + 39
    - SHOM 233
    - Marine Institute 42
    - Cefas 18
    - Met Office about 280
    - BoM 90
    - DFO MEDS about 170
    - ECCC about 28
    - JMA 255
    - INCOIS 83
    - NDBC about 180
    - Scripps 1,658 (CDIP and drifters)
    - SOCIB 51, OGS about 155
    - "Unknown institution" 7,256

    EMODnet Physics mirrors it (see section 1).

## 3. Mediterranean national networks

### 3.1 Italy – ISPRA RMN / RON (and regional)

1. **Coverage:** Italian coasts.
2. **Counts:**
   - RMN: "composta di 36 stazioni" (https://dati.isprambiente.it/dataset/rmn/).
   - RON: "quindici stazioni" (https://dati.isprambiente.it/dataset/ron/).
   - The SPARQL station query returned 95 platforms: 36 RMN, 49 RON (historical positions), 10 RMLV (Venice lagoon).
3. **Types:** tide gauges with met sensors; directional wave buoys.
4. **Parameters:** RMN measures sea level (m), water temperature, air temperature, humidity, pressure, wind direction and wind speed. RON measures Hm0, Tm, Tp and Dir, plus monthly-max indicators.
5. **History and current:**
   - RON on LOD covers 2009–2014 initially and is "aggiornato al 31/12/2023". The page says "Alla riattivazione della rete di monitoraggio, si provvederà alla distribuzione dei dati rilevati in tempo reale".
   - RMN: "aggiornamento giornaliero" (https://dati.isprambiente.it/accesso-ai-dati/download/).
6. **Update frequency:** RMN LOD is daily. mareografico.it shows "ULTIMI RILEVAMENTI" for the RMN, RON and RETE ADSP MAC networks (HTML only).
7. **Access:**
   - SPARQL `https://dati.isprambiente.it/sparql`, which returns JSON with `format=application/sparql-results+json`
   - dump `https://rep.isprambiente.it/downloads/lod/rdf/rmn/kg/rmn_dump.nt.gz` (and `/ron/kg/`)
   - WHOW-API `https://dati.isprambiente.it/accesso-ai-dati/endpoint-api/` (not tested)
8. **HTTPS and CORS:** HTTPS. ACAO absent on SPARQL.
9. **Auth:** none.
10. **Licence:**
    - dati.isprambiente.it: "Il sito ed i dati in esso pubblicati sono rilasciati con licenza Creative Commons Attribution 4.0 International License".
    - ISPRA legal notes (https://www.isprambiente.gov.it/it/note-legali): "Salvo ove diversamente indicato, i dati pubblicati sul presente sito sono messi a disposizione con licenza CC-BY 4.0 … liberamente accessibili, distribuibili e riutilizzabili, a patto che sia sempre citata la fonte".
11. **Identifiers:** platform URIs such as `https://w3id.org/italia/env/ld/rmlv/platform/00107_rmlv05_00`, plus lat/long. The validation level is stated per parameter in the metadata.
12. **Overlap:** ISPRA has 38 platforms in CMEMS. Regional ARPA buoys appear in EMODnet, e.g. ARPAE "Nausicaa2".

### 3.2 Spain – Puertos del Estado

- **THREDDS** at `https://opendap.puertos.es/thredds/catalog.html`. Keyless and HTTPS. It sends `Access-Control-Allow-Credentials: true` but **no ACAO** on a plain GET.
  - Observations: about 45 tide gauges (`tidegauge_*`, yearly files, e.g. Barcelona from 2007) and HF radars (`radar_local_*`).
  - MODEL: `wave_*`, `circulation_*`, `harmonie*`, `nivmar`.
  - No REDEXT/REDCOS buoy catalogue appears on THREDDS. Buoy access is through the portus.puertos.es JS app; its API was NOT VERIFIED.
- **Licence:** no open data licence found. The legal notice (https://www.puertos.es/aviso-legal) says: "la reproducción total o parcial, uso, explotación, distribución y comercialización, requiere en todo caso de la autorización escrita previa por parte del prestador". This text is written for the website, and whether it also covers data is NOT VERIFIED.
- **Overlap:** CMEMS has 71 Puertos del Estado platforms (30 MO, 40 TG). They also appear in EMODnet.
- **Verdict:** CONDITIONAL. It needs written authorisation, or the data can be taken via CMEMS/EMODnet under those terms.

### 3.3 France – CANDHIS (Cerema)

- **Coverage:** French coasts and overseas territories. About 30 Cerema buoys are in CMEMS. Network status notes on https://candhis.cerema.fr/ are dated up to 08/10/2026.
- **API:** `https://candhis.cerema.fr/API/v1/`, with getCampListe, getCampInfos, getCampTR (real time), getCampTD (delayed mode) and others.
  - "L'API Candhis est protégée par une clé d'accès. Pour en obtenir une, merci d'en faire la demande en envoyant un message … en indiquant : votre nom, votre domaine d'activité, … le type de votre structure".
  - Requests need an `Authorization` header token.
  - HTTP 429 "Quota requêtes quotidiennes atteint". HTTP 423 "IP bannie".
  - Source: `https://candhis.cerema.fr/doc/04_Candhis_API_v1_Utilisateur.pdf`
- **Licence** (https://candhis.cerema.fr/doc/01_Utilisation.fr.pdf): "Les données CANDHIS sont diffusées sous licence ouverte Etalab". Attribution must be at least "Candhis" plus the date of last update, ideally also the partner organisations.
- **Verdict:** NO-GO for keyless use. CONDITIONAL locally (needs a key request that carries personal data, which is the author's decision).

### 3.4 France – Météo-France buoys

- Two data.gouv.fr API searches found no Météo-France buoy observation dataset. Direct open access is NOT VERIFIED.
- Météo-France buoys are on GTS, so they reach OSMC (CC0, section 4.1) and CMEMS (Météo-France CMM: MO 7, DB 19, plus 39 more).

### 3.5 France – SHOM REFMAR (tide gauges)

- **Licence:**
  - data.gouv.fr datasets "REFMAR – Marégraphes RONIM" and "– Marégraphes partenaires" have licence `lov2` (Licence Ouverte v2).
  - refmar.shom.fr: "Sauf mention contraire, tous les contenus de ce site sont sous licence etalab-2.0".
- **Access** (https://refmar.shom.fr/donnees-refmar-sur-data.shom.fr/telechargement-des-donnees):
  - Manual download, and "Abonnement aux flux" where you enter your name and email and the service URL is sent to you.
  - The page itself publishes the URLs: `https://services.data.shom.fr/maregraphie/observation/json/{id}?sources=…&dtStart=…&dtEnd=…` and the SOS endpoint `…/maregraphie/sos/service?request=GetCapabilities`.
  - "le téléchargement par flux des observations est limité à 31 jours par requête".
  - Data sources: 1 = raw high frequency (1-minute), 2 = raw delayed (10-minute), 3/4 = validated (per the doc).
- **Sample:** `…/observation/json/3?sources=4&dtStart=2026-10-07T00:00:00Z&dtEnd=2026-10-07T03:00:00Z` returned `200 {"data":[]}`. Source 4 was empty for that window, so a different source is needed.
  - Headers: `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS`.
- **Overlap:** CMEMS has 233 SHOM platforms, with REFMAR DOIs `10.17183/REFMAR#…`.
- **Verdict:** CONDITIONAL. It must be verified with SHOM whether the documented GET endpoint may be used without subscribing.

### 3.6 Greece – HCMR POSEIDON

- **Site:** poseidon.hcmr.gr. It covers buoys, a cabled seabed observatory, ferrybox, Argo, gliders, HF radar and tide gauges. There is an API at `https://api.poseidon.hcmr.gr/swagger/`; whether it needs a token is NOT VERIFIED.
- **Terms** (https://poseidon.hcmr.gr/terms-use-disclaimer): "The content and the provided services of this website are property of HCMR and are disseminated to the visitors for their personal use only. Commercial or any other use of the provided information is prohibited without the permission of HCMR."
- **Verdict:** NO-GO direct. HCMR platforms appear in CMEMS (MO 4, TG 2, PF/GL) and EMODnet. The originator's restriction should be weighed before showing them even via those channels (CONDITIONAL).

## 4. Other networks for worldwide coverage

### 4.1 NOAA OSMC_RealTime (AOML ERDDAP)

- **Endpoint:** `https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime`
- **What it is:** "OSMC flattened observations from GTS". Variables include platform_code, platform_type, country, time, lat/lon, sst, atmp, slp, windspd/dir, wvht, waterlevel, sss, uo/vo and others.
- **Platform types seen in the last hour:** C-MAN, ICE BUOYS, MOORED BUOYS (GENERIC), SHIPS, SHORE AND BOTTOM STATIONS, TIDE GAUGE STATIONS, TROPICAL MOORED BUOYS, UNCREWED SURFACE VEHICLE, VOS, WEATHER BUOYS. Drifting buoys were absent in that hour; why is NOT VERIFIED.
- **Licence:** "not subject to copyright protection in the United States. NOAA waives … through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0 1.0)".
- **Access:** keyless HTTPS. ACAO absent. There are no QC flags in the variable list.

### 4.2 NOAA Global Drifter Program

- **Endpoint:** `https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_hourly_qc`
- **Licence:** "Creative Commons Attribution 4.0 … This study used data collected and made freely available by the NOAA Global Drifter Program".
- **Coverage:** 1987-10-02 → 2022-10-31. It is a delayed-mode quarterly release. There is also `drifter_6hour_qc`.
- **Real time:** comes via GTS/OSMC.
- **CORS:** ACAO absent.

### 4.3 US IOOS (sensors ERDDAP)

- **Endpoint:** `https://erddap.sensors.ioos.us/erddap/` (ERDDAP 2.31). `allDatasets` returned 11,505 datasets with `maxTime >= now-1day`. These include met and other stations, not only buoys.
- **Licence varies by provider.** For example, `ism-secoora-org_cormp_sun2` (UNCW CORMP) has a `license` that is a website-use disclaimer, not a reuse grant.
- **Verdict:** CONDITIONAL. Licences must be checked dataset by dataset. ACAO absent.

### 4.4 Marine Institute, Ireland

- **Endpoint:** `https://erddap.marine.ie/erddap/tabledap/IWBNetwork`
- **Licence:** "Creative Commons Attribution 4.0".
- **Sample:** M2, M3, M5 and M6 at 2026-10-08T18:00Z with WaveHeight, SeaTemperature and `QC_Flag`. The acknowledgement attribute describes "five buoys".
- **CORS:** ACAO absent.

### 4.5 IMOS / AODN, Australia

- **Licence:** "IMOS data is licensed under a Creative Commons Attribution 4.0 International Licence" (https://imos.org.au/terms-of-use).
- **Required acknowledgement:** "Data were sourced from Australia's Integrated Marine Observing System (IMOS) – IMOS is enabled by the National Collaborative Research Infrastructure Strategy (NCRIS)." (https://imos.org.au/resources/acknowledging-us)
- **Access:**
  - Public S3: `https://imos-data.s3-ap-southeast-2.amazonaws.com/?list-type=2&prefix=IMOS/COASTAL-WAVE-BUOYS/&delimiter=/`, which returned the prefix `WAVE-BUOYS/`. ACAO absent.
  - The guessed AODN GeoServer layer `imos:aodn_wave_nrt_v2_timeseries_map` does not exist. The correct WFS layer is NOT VERIFIED.
- **Counts:** NOT VERIFIED. BoM in CMEMS: 90 platforms.

### 4.6 Canada

- **ECCC MSC Datamart:** `https://dd.weather.gc.ca/today/observations/swob-ml/marine/moored-buoys/` lists daily folders, in SWOB-ML XML.
  - Licence: ECCC Data Servers End-use Licence v2.1.1: "worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, including for commercial purposes"; "Data Source: Environment and Climate Change Canada" (https://eccc-msc.github.io/open-data/licence/readme_en/).
  - CORS: ACAO absent on the listing.
- **DFO MEDS waves:** https://www.meds-sdmm.dfo-mpo.gc.ca/isdm-gdsi/waves-vagues/index-eng.htm
  - Citation: "DFO (current year). Marine Environmental Data Section Archive, https://meds-sdmm.dfo-mpo.gc.ca …".
  - The licence and the machine-readable endpoint are NOT VERIFIED. A guessed station URL returned 404.

### 4.7 UHSLC (University of Hawaii Sea Level Center)

- **Endpoint:** `https://uhslc.soest.hawaii.edu/erddap/`, with datasets `global_hourly_fast` / `global_daily_fast` (to 2026-09-30), `global_hourly_rqds`, and `global_hourly_gesla`.
- **Variables:** sea_level, quality, uhslc_id, gloss_id, ssc_id.
- **Licence attribute:** "The data may be used and redistributed for free but is not intended for legal use".
- **Originator caveat** on the legacy portal: "The South African Navy Hydrographic Office (SANHO) is the owner and copyright holder … requests that anyone downloading this data request permission".
- **Timeliness:** fast delivery is 4–6 weeks behind, so it is not real time.
- **CORS:** ACAO absent.

### 4.8 IOC Sea Level Station Monitoring Facility (VLIZ)

- **Disclaimer** (https://www.ioc-sealevelmonitoring.org/disclaimer.php): "has not undergone any quality control"; "Data and products available on this web-site may not be used for any commercial purposes."
- **Citation:** DOI 10.14284/482.
- **Timeliness:** most stations report 1-minute values every 5 minutes.
- **Status:** the API and service terms page was not fetched (NOT VERIFIED).

### 4.9 CDIP (Scripps)

- **Terms** (https://cdip.ucsd.edu/m/documents/data_access.html): "CDIP data and products are freely available for public use, provided that they are not altered in any way. When used for web displays and online resources, please provide a link to the CDIP homepage."
- **Access:** THREDDS `https://thredds.cdip.ucsd.edu` (not sampled). Realtime files are updated about every 30 minutes (per the doc).
- **Overlap:** CDIP buoys are also published by NDBC (46xxx).

### 4.10 MET Norway Frost, INCOIS, JMA, Cefas, Met Office

- **Frost** (https://frost.met.no/howto.html): "To access the API you need to create a user … You will get a client ID". This makes it NO-GO.
- **INCOIS** (https://incois.gov.in/site/dataholdings.jsp): Moored Buoy "Public Access with only visualisation option. No download option." Wave Rider buoys are the same. NO-GO.
- **JMA:** the website is under "Public Data License (Version 1.0)" with source citation (https://www.jma.go.jp/jma/en/copyright.html). No buoy feed was identified (NOT VERIFIED).
- **Cefas WaveNet** (https://wavenet.cefas.co.uk/) is a JS app, and `https://wavenet-api.cefas.co.uk/` returned 404. NOT VERIFIED.
- **Met Office** and **BoM:** not verified. Their buoys are in CMEMS and also on GTS/OSMC.

---

## 5. Overlap summary

- **GTS layer:** NDBC, Met Office, Météo-France, BoM, ECCC, JMA and other moored and weather buoys appear in **OSMC_RealTime (CC0)**.
- **European hub:** **CMEMS INSTAC**, needs an account. It is aggregated keyless in **EMODnet Physics**: ISPRA, Puertos del Estado, Cerema/CANDHIS, SHOM, HCMR, SOCIB, OGS, ARPA, Marine Institute, Cefas.
- **Deduplication keys:** WMO ID, platform_code, `PlatformCode` in EMODnet, and GLOSS ID / UHSLC ID / IOC code for tide gauges.
- **Suggested NEXUM path (for the author to decide):**
  1. EMODnet GeoServer for the European platform catalogue (keyless, CORS `*`).
  2. OSMC_RealTime for global GTS real-time values (CC0).
  3. Direct national open feeds where the licence is clean: ISPRA LOD (CC BY), Marine Institute (CC BY), IMOS (CC BY), ECCC (ECCC licence).
  4. CMEMS only if the author accepts a free account for a local connector.

## 6. Sample URLs for a later browser CORS check (small)

| Network | Purpose | URL | ACAO on plain GET (2026-10-08) |
|---|---|---|---|
| EMODnet GeoServer | catalogue (moorings) | `https://geoserver.emodnet-physics.eu/geoserver/EMODnet/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=EMODnet:EP_PLATFORMS_MO_ATLAS&count=2&outputFormat=application/json` | `*` |
| EMODnet GeoServer | catalogue (drifters) | same with `typeNames=EMODnet:EP_PLATFORMS_DB_ATLAS` | not tested |
| EMODnet ERDDAP | server check | `https://erddap.emodnet-physics.eu/erddap/version` | timeout / 502 |
| CMEMS STAC | product metadata | `https://stac.marine.copernicus.eu/metadata/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/product.stac.json` | absent (metadata only; data needs login) |
| ISPRA SPARQL | RMN/RON/RMLV station list | the full URL is in `raw/ispra_sparql_url.txt`; append `&format=application%2Fsparql-results%2Bjson` | absent |
| ISPRA dump | RMN full KG | `https://rep.isprambiente.it/downloads/lod/rdf/rmn/kg/rmn_dump.nt.gz` (size not checked) | not tested |
| SHOM | latest observations (31-day max per request) | `https://services.data.shom.fr/maregraphie/observation/json/3?sources=1&dtStart=2026-10-07T00:00:00Z&dtEnd=2026-10-07T01:00:00Z` | `*` |
| SHOM | catalogue | `https://services.data.shom.fr/maregraphie/sos/service?request=GetCapabilities` | not tested |
| Puertos THREDDS | tide gauge catalogue | `https://opendap.puertos.es/thredds/catalog/tidegauge_bar2/catalog.html` | absent (Allow-Credentials only) |
| OSMC | latest GTS buoys | `https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime.csv?platform_code,platform_type,latitude,longitude,time,sst,wvht,slp&time%3E=now-1hours&platform_type=%22MOORED%20BUOYS%20(GENERIC)%22` | absent |
| GDP | metadata | `https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_hourly_qc/index.json` | absent |
| IOOS | active dataset catalogue (1.2 MB) | `https://erddap.sensors.ioos.us/erddap/tabledap/allDatasets.csv?datasetID,title,minTime,maxTime&maxTime%3E=now-1day` | absent |
| Marine Institute | latest observations | `https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv?station_id,longitude,latitude,time,WaveHeight,SeaTemperature,QC_Flag&time%3E=now-2hours` | absent |
| Marine Institute | short series | `https://erddap.marine.ie/erddap/tabledap/IWBNetwork.json?time,WaveHeight,QC_Flag&station_id=%22M3%22&time%3E=now-1day` | not tested |
| UHSLC | catalogue | `https://uhslc.soest.hawaii.edu/erddap/tabledap/global_hourly_fast.csv?uhslc_id,station_name,latitude,longitude&distinct()` | not tested (`version`: absent) |
| IMOS | S3 listing | `https://imos-data.s3-ap-southeast-2.amazonaws.com/?list-type=2&prefix=IMOS/COASTAL-WAVE-BUOYS/WAVE-BUOYS/&delimiter=/` | absent |
| ECCC | moored buoys today | `https://dd.weather.gc.ca/today/observations/swob-ml/marine/moored-buoys/` | absent |
| NDBC | latest observations | `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt` | absent |

## 7. Open points (NOT VERIFIED)

- EMODnet ERDDAP availability and its NRT dataset IDs. Retry later, and confirm in the browser whether GeoServer `ERD_EP_*_INSITU` layers can serve latest values.
- Whether EMODnet originator-level restrictions (e.g. HCMR, Puertos del Estado) carry over to NEXUM display.
- Whether SHOM allows anonymous use of the documented GET endpoint without the "flux" subscription.
- ISPRA RON: whether the network has been reactivated, and whether there is a real-time machine feed.
- Puertos del Estado: whether a data-specific licence exists (portus).
- Licences for DFO MEDS, Cefas WaveNet, Met Office, BoM and JMA buoys.
- ACAO behaviour when the browser sends Origin. ERDDAP and THREDDS often add CORS only on request. This must be tested in a real browser.
