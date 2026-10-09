# A — NDBC, Argo/Euro-Argo, OceanSITES, OceanOPS, DBCP/GOOS (+ OSMC, GDP): verification for a NEXUM buoy layer

Research date: 2026-10-08 (all observations ~18:55–19:05 UTC). Research only. No code changes, no commits.
All requests used the User-Agent `NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)`.
No Origin header, no authentication, no accounts. Raw responses are in `scratchpad/ocean/raw/`.

**How to read the CORS column.** I never sent `Origin`. Several server stacks only send
`Access-Control-Allow-Origin` (ACAO) when a request includes `Origin`: ERDDAP, AWS S3 and some Jetty
and Apache configurations do this. So "ACAO absent" below means *not sent on a plain GET*. It does
**not** prove that a browser fetch would fail. Run the browser test (section 8) before choosing
browser-direct over a build-time snapshot.

**Departures from the brief:**
- **One oversized download.** I probed `https://www.ocean-ops.org/api/1/data/platform` to check whether it existed. It returned a 48.8 MB JSON (the full platform table). The file was deleted at once and not used. Every later request was capped with `head -c 2000000`.
- **Two retries.** The first `realtime2/41001.txt` attempt returned 404 (that station has no current file), so I retried with 44013. Two ERDDAP queries returned 400 (wrong variable case), so I corrected and retried them.

---

## 1. NOAA National Data Buoy Center (NDBC)

1. **Coverage.** Mostly US waters: Atlantic, Gulf, Pacific, Great Lakes, Alaska/Bering, Hawaii and Pacific islands. It also carries international partner arrays (PIRATA, RAMA), TAO across the equatorial Pacific, and global DART sites. The bounding box of `activestations.xml` is lat −46.96…71.32, lon −179.8…180.
2. **Station counts.** These come from `https://www.ndbc.noaa.gov/activestations.xml`, header `created="2026-10-08T18:55:07UTC" count="1354"`.
   - By type: 441 buoy, 710 fixed (C-MAN/coastal), 76 dart, 54 oilrig, 48 tao, 23 other, 2 usv.
   - By programme: IOOS Partners 510, NOS/CO-OPS 292, NDBC Met/Ocean 147, International Partners 142, NERRS 104, Tsunami 76, TAO 48, Marine METAR 35.
   - NDBC-owned: 86 met buoys, 36 fixed met (C-MAN), 39 DART, 48 TAO.
   - 905 stations have `met="y"`. `latest_obs.txt` had 882 rows at the time of the request.
   - `station_table.txt` has about 1,940 lines (includes inactive stations).
3. **Platform types.** Moored buoys, C-MAN coastal stations, partner coastal platforms, oil rigs, DART tsunameters, TAO moorings, USVs and drifting buoys (`.drift` files).
4. **Parameters.** From the realtime2 header: WDIR, WSPD, GST, WVHT, DPD, APD, MWD, PRES, ATMP, WTMP, DEWP, VIS, PTDY, TIDE. Other files add spectral waves, continuous winds, ADCP currents, ocean (`.ocean`), tide, and DART water-column height.
5. **Current and historical data.**
   - FAQ: "The Realtime directory data/realtime2 contains the current (last 45 days) data."
   - Historical data are gzipped yearly files under `https://www.ndbc.noaa.gov/data/historical/{stdmet,cwind,drift,...}/`. The page says these run "from the beginning of each station". Its end-date text is a broken template ("December 9e20"), so the end date is NOT VERIFIED.
6. **Update frequency.** FAQ: "Most stations report hourly and most of the data is available by 25 minutes after the hour." In practice 44013 had 10-minute rows. CoastWatch ERDDAP says "This dataset is now updated every 5 minutes."
7. **Access endpoints.**
   - Catalogue: `https://www.ndbc.noaa.gov/activestations.xml` (273 kB) and `https://www.ndbc.noaa.gov/data/stations/station_table.txt` (364 kB, pipe-delimited).
   - Latest for all stations: `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt` (105 kB).
   - Per station: `https://www.ndbc.noaa.gov/data/realtime2/{ID}.txt`. For 44013 this is 609 kB covering 45 days, so it is too heavy for one browser marker.
   - THREDDS: `https://dods.ndbc.noaa.gov/thredds/catalog/data/stdmet/44013/catalog.xml` (OPeNDAP/NetCDF).
   - ERDDAP mirror (NOAA CoastWatch ERD), dataset `cwwcNDBCMet`, info at `https://coastwatch.pfeg.noaa.gov/erddap/info/cwwcNDBCMet/index.csv`. Variables are uppercase (WD, WSPD, GST, WVHT, DPD, APD, MWD, BAR, ATMP, WTMP, DEWP, VIS, PTDY, TIDE, WSPU, WSPV, station metadata). Time coverage is 1970-02-26 to now.
   - SOS: `https://sdf.ndbc.noaa.gov/sos/server.php` gave **DNS failure** (host not resolvable on 2026-10-08), so treat it as unavailable or retired.
   - FTP: FAQ says it "is expected to be discontinued".
8. **HTTPS and observed headers.** All endpoints are HTTPS.
   - `www.ndbc.noaa.gov` (HTTP/2): **no ACAO** on activestations.xml, station_table.txt, latest_obs.txt or realtime2/44013.txt.
   - CoastWatch ERDDAP: **no ACAO**. It sends `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN` and a CSP header.
   - `dods.ndbc.noaa.gov` THREDDS: **no ACAO**.
9. **Authentication, limits, cost.** No key, free. The FAQ says: "We ask that you limit your retrievals to a minimal level." The NWS disclaimer (where `ndbc.noaa.gov/disclaimer.shtml` redirects) adds: "we may find it necessary to block IP addresses or query types … you should not request data for the same location more than once an hour" (given as an example for hourly data).
10. **Licence.** From https://www.weather.gov/disclaimer:
    > "The information on National Weather Service (NWS) Web pages are in the public domain, unless specifically noted otherwise, and may be used without charge for any lawful purpose so long as you do not: 1) claim it is your own …, 2) use it in a manner that implies an endorsement or affiliation with NOAA/NWS, or 3) modify its content and then present it as official government material."
    > "Use of the NWS name … and/or visual identifier are protected under trademark law."
    > "third parties producing copyrighted works consisting predominantly of the material appearing in NWS Web pages must provide notice … stating that such material is not subject to copyright protection."

    The CoastWatch `cwwcNDBCMet` licence attribute says:
    > "The data may be used and redistributed for free but is not intended for legal use, since it may contain inaccuracies. Neither the data Contributor, ERD, NOAA, nor the United States Government … makes any warranty …"

    **Caveat:** about 60% of stations belong to partners (IOOS regional associations, Scripps/CDIP, Environment and Climate Change Canada, Marine Exchange of Alaska, and others). The NWS public-domain statement says "unless specifically noted otherwise". Per-partner terms are **NOT VERIFIED**. One way to stay safe is to use `owner`/`pgm` to start with NDBC/NOS-owned stations, or to attribute partners explicitly.
11. **Identifiers, coordinates, time, QC.**
    - IDs are WMO-style 5-character IDs (`44013`) or C-MAN call signs (`FPSN7`; file names are uppercase).
    - Coordinates are decimal degrees in `activestations.xml` and in each `latest_obs` row.
    - Time is UTC, split into YYYY MM DD hh mm columns. ERDDAP gives ISO 8601 with `Z`.
    - Missing values are `MM` in the text files and `NaN` in ERDDAP. There are **no per-value QC flags** in realtime2 or `cwwcNDBCMet`. QC is applied upstream: per https://www.ndbc.noaa.gov/faq/qc.shtml, "the affected data are removed before posting", and the procedures are in tech doc T80-10. ERDDAP notes "historical data (quality controlled) and near real time data (less quality controlled)".
    - A NEXUM quality value should therefore be derived ("NDBC realtime, automated QC" or "historical QC").
12. **Overlaps.**
    - TAO (48), PIRATA and RAMA moorings are also OceanSITES sites. The OceanSITES DATA folder includes T0N110W and similar.
    - NDBC is the US OceanSITES GDAC (`dods.ndbc.noaa.gov/thredds/catalog/oceansites`).
    - NDBC data go on GTS and reappear in OSMC ERDDAP (`OSMC_30day`).
    - IOOS partner stations are also on IOOS regional ERDDAPs.
    - Presence in CMEMS INSTAC or EMODnet Physics is **NOT VERIFIED** in this pass.

**Classification: GO** for build-time snapshots on the author's machine. Use the public domain, attribute "NOAA NDBC", imply no endorsement, keep a low polling rate, and flag partner stations.
Browser-direct is **CONDITIONAL**: no ACAO was observed on a plain GET, so it needs the browser test.

---

## 2. OceanSITES

1. **What it is.** The GOOS network of long-term, deep-ocean, multidisciplinary reference time-series sites (moorings and ship-based stations).
2. **Size.** The Ifremer GDAC `ftp://ftp.ifremer.fr/ifremer/oceansites/DATA/` lists **116 site directories** (2026-10-08). Examples: ALOHA, BATS, DYFAMED, E1M3A, ESTOC, KEO, PAPA, PAP, NTAS, Stratus, the TAO `T*N*W` moorings, MOVE, CCE.
   - `oceansites_index.txt` is 20.8 MB, last updated 2026-10-08T16:45:02Z.
   - `etc/oceansites_index_platform.txt` is 1.0 MB.
   - An "active sites" count from official docs is **NOT VERIFIED**: the www.oceansites.org site was unreachable (see point 8).
3. **Platform types.** Fixed deep-ocean moorings, surface flux buoys, cabled observatories, ship-based repeat stations, PIES.
4. **Parameters.** CF standard names per file, for example sea_water_temperature, sea_water_practical_salinity, conductivity, currents, met and flux variables, and biogeochemistry.
5. **Current and historical data.** Mostly historical deployments. The index has a `DATA_MODE` column with values R / D / M / P (real-time, delayed, mixed, provisional) and an UPDATE_INTERVAL column. Realtime is available for some sites (TAO, NTAS etc.); most is delayed mode.
6. **Update frequency.** Varies per file (UPDATE_INTERVAL). The GDAC index is refreshed daily.
7. **Access endpoints.**
   - GDAC FTP: `ftp://ftp.ifremer.fr/ifremer/oceansites/` and `ftp://data.ndbc.noaa.gov/data/oceansites` (as stated in the index header).
   - THREDDS: `https://dods.ndbc.noaa.gov/thredds/catalog/oceansites/catalog.html` (folders DATA, DATA_GRIDDED, deployment_data, long_timeseries).
   - ERDDAP (Ifremer): only a few OceanSITES datasets, e.g. `OS_DYFAMED_1994-2014_D_TSO2`.
   - `https://data-oceansites.ifremer.fr/` gave **DNS failure**.
   - The format is OceanSITES NetCDF (CF).
8. **HTTPS and observed headers.**
   - `https://www.oceansites.org/` **failed the TLS handshake** with both LibreSSL and OpenSSL 3.0.15 ("sslv3 alert handshake failure"). Plain HTTP returned 409. So the official site, its documentation and its data-policy page could **not** be read: NOT VERIFIED.
   - NDBC THREDDS: HTTPS, **no ACAO**. Ifremer ERDDAP: HTTPS, **no ACAO**.
   - FTP is not usable from a browser.
9. **Authentication, limits, cost.** No authentication, free. Published limits: NOT VERIFIED.
10. **Licence.** Per-file NetCDF global attributes (verified on two files). ALOHA, via NDBC THREDDS `.das`:
    > "Following CLIVAR standards, cf. www.clivar.org/data/data_policy.php. Data available free of charge. User assumes all risk for use of data. User must display citation in any publication or product using data. **User must contact PI prior to any commercial use of data**"

    DYFAMED (Ifremer ERDDAP) has the same wording, plus the citation:
    > "These data were collected and made freely available by the OceanSITES project and the national programs that contribute to it."

    A blanket CC BY 4.0 for OceanSITES is **NOT VERIFIED**: I found no evidence of it. The licence is set per file or per site.
11. **Identifiers, coordinates, time, QC.**
    - Site codes such as `PAPA` and `T0N165E`. Platform codes and WMO IDs are inside the files.
    - Lat/lon and depth bounds are in the index. Time is ISO 8601 UTC in the index and CF time in the files.
    - Per-variable `<PARAM>_QC` flags follow the OceanSITES/Argo flag scale (OceanSITES format manual, referenced at http://www.oceansites.org/docs/oceansites_data_format_reference_manual.pdf, not reachable). Exact flag semantics are NOT VERIFIED here.
12. **Overlaps.** TAO, PIRATA and RAMA (also in NDBC), NTAS and Stratus (NDBC partner moorings). OceanSITES data also flow to CMEMS INSTAC (NOT VERIFIED here).

**Classification: CONDITIONAL.** Free of charge with mandatory citation, but "contact PI prior to any commercial use" applies.
- NEXUM is €0 and non-commercial. The author still needs to confirm that NEXUM counts as non-commercial and keep a per-file citation as evidence.
- The official site and data policy could not be read (TLS failure), so they are NOT VERIFIED.
- The data are mostly delayed-mode NetCDF. Only a build-side NetCDF connector is practical; nothing browser-direct.

---

## 3. Argo / Euro-Argo

1. **Coverage.** The global ice-free ocean, 0–2000 m. Deep Argo and BGC-Argo extend this.
2. **Size.** https://argo.ucsd.edu/about/status/ (undated page, read 2026-10-08): "Today, even with close to 4000 active floats". It also says "the 3 millionth profile collected in July 2024". The AWS Open Data registry entry says "18.000 profiling floats (4.000 active)".
3. **Platform type.** Drifting autonomous profiling floats with a 10-day cycle.
4. **Parameters.** Core: PRES, TEMP, PSAL. BGC: DOXY, CHLA, NITRATE, BBP, pH, irradiance, TURBIDITY. Each has `_ADJUSTED`, `_QC`, `_ADJUSTED_QC` and `_ADJUSTED_ERROR` variants.
5. **Current and historical data.** Everything since 1997. Real-time (R/A) and delayed mode (D). Per the Argo guide: "Core Argo delayed mode files are available 1 – 2 years after a profile is taken".
6. **Update frequency.** Status page: "delivers 90% of profiles to users via two global data centers (GDACs) within 12 hours and 80% arriving within 6 hours". The GDAC index is rewritten several times per day: Ifremer showed `Date of update : 20261008182416`. AWS says "Data is updated daily."
7. **Access endpoints.**
   - Coriolis GDAC: `https://data-argo.ifremer.fr/` (and `ftp://ftp.ifremer.fr/ifremer/argo`).
   - US GDAC: `https://nrlgodae1.nrlmry.navy.mil/pub/outgoing/argo`. This **reset the connection** from here. `https://usgodae.org/pub/outgoing/argo/...` returned 404.
   - AWS S3: `https://argo-gdac-sandbox.s3.eu-west-3.amazonaws.com/pub/` (`s3://argo-gdac-sandbox`). It is a mirror of Coriolis, and the index was 15 h older than Ifremer's.
   - rsync: `vdmzrs.ifremer.fr::argo/`.
   - Index `ar_index_global_prof.txt` is **317,721,254 bytes** (318 MB), `.gz` is 58.7 MB (Last-Modified 2026-10-08 18:25 GMT). It is build-side only and must be range or stream processed. There are also smaller indexes, such as `ar_index_global_meta.txt`, and the `latest_data` folder.
   - ERDDAP: `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats` (variables platform_number, cycle_number, time, latitude, longitude, data_mode, pres/temp/psal + _qc/_adjusted, BGC). Its `license` attribute is garbled ("falsestandard]"), so do not rely on it.
   - THREDDS: `https://tds0.ifremer.fr/thredds/catalog/CORIOLIS-ARGO-GDAC-OBS/catalog.html`.
   - Euro-Argo fleet monitoring API: `https://fleetmonitoring.euro-argo.eu/floats/{wmo}` (JSON, 346 kB for one float). Swagger is at `https://fleetmonitoring.euro-argo.eu/v2/api-docs`, with paths `/floats`, `/floats/basic/{wmo}`, `/floats/count`, `/platformCodes`, `/technical-data/{wmo}`, etc.
   - Monthly DOI snapshots: https://doi.org/10.17882/42182
8. **HTTPS and observed headers.** All HTTPS.
   - **No ACAO** on `data-argo.ifremer.fr` (HTTP/2), `erddap.ifremer.fr`, the S3 range GET, or `fleetmonitoring.euro-argo.eu`. The Euro-Argo API sends `referrer-policy: same-origin`, `x-content-type-options: nosniff`.
   - S3 only answers CORS when Origin is present and a bucket CORS policy exists, so a browser test is required.
9. **Authentication, limits, cost.** None and free. Published rate limits: NOT VERIFIED.
10. **Licence.** From https://argo.ucsd.edu/data/acknowledging-argo/:
    > "Argo data are freely available without restriction. However, to track uptake and impact, we ask that where Argo data are used in a publication or product, an acknowledgement be given."
    > Suggested sentence: "These data were collected and made freely available by the International Argo Program and the national programs that contribute to it. (https://argo.ucsd.edu, https://www.ocean-ops.org). The Argo Program is part of the Global Ocean Observing System."
    > Cite the DOI: "Argo (YYYY). Argo float data and metadata from Global Data Assembly Centre (Argo GDAC) – Snapshot … SEANOE. https://doi.org/10.17882/42182#<key>"

    The AWS registry (maintained by Euro-Argo) says:
    > "License: Open data, there are no restrictions on the use of this data. https://creativecommons.org/licenses/by/4.0/"

    `argodatamgt.org/DataAccess.html`: "Argo data are freely available from US-Godae and Coriolis GDAC sites".
    The former Argo data-policy page `https://argo.ucsd.edu/about/argo-data-policy/` is 404.

    **Euro-Argo fleet monitoring API terms: NOT VERIFIED.** The swagger has `"termsOfService": "urn:tos"`, a placeholder. Its "Apache 2.0" licence is generic API-doc boilerplate, not a data licence.
11. **Identifiers, coordinates, time, QC.**
    - Float WMO number (7 digits, e.g. 4903654) plus cycle_number. The WIGOS ID form `0-22000-0-4903654` is accepted by OceanOPS.
    - Per-profile lat/lon with `position_qc`. Time is UTC (ERDDAP ISO `Z`) with `time_qc`.
    - QC flags use the Argo 0–9 scale (1 = good … 4 = bad, 9 = missing). `data_mode` is R / A / D. The greylist lists suspect floats.
12. **Overlaps.** OSMC `OSMC_PROFILERS` (Argo via GTS), OceanOPS metadata, CMEMS INSTAC (NOT VERIFIED here) and AWS.

**Classification:**
- **GO** for Argo GDAC and Ifremer ERDDAP data: free, unrestricted, with acknowledgement and DOI. Use build-side snapshots only, because of index size and missing ACAO.
- **CONDITIONAL** for the Euro-Argo fleet monitoring API: terms NOT VERIFIED. Ask Euro-Argo before relying on it, or avoid it.

---

## 4. OceanOPS (formerly JCOMMOPS)

1. **What it is.** The WMO/IOC centre that tracks **platform metadata and status** for all GOOS networks: Argo, DBCP drifters and moored buoys, OceanSITES, SOT/VOS ships, GLOSS tide gauges, gliders and GO-SHIP. It also issues WMO IDs. The share directory `https://www.ocean-ops.org/share/` lists Argo, DBCP, GLOSS, GO-SHIP, OceanGliders, OceanOPS, OceanSITES, SOCONET, SOT. It holds metadata, status and positions, **not** measurement time series.
2. **Size.** `GET https://www.ocean-ops.org/api/data/platform?limit=1` returned `"total":86020` platform records (all eras, active and inactive). An active count from OceanOPS: NOT VERIFIED.
3. **Platform types.** All of the above.
4. **Parameters.** Metadata only: platform ref, WIGOS ID, status, dates, model, sensors, programme, country, last location.
5–6. **Data availability and updates.** Continuously maintained metadata. `updateDate` fields were seen.
7. **Access endpoints.**
   - Dashboard: `https://www.ocean-ops.org/board` (JS app).
   - API: base `https://www.ocean-ops.org/api`, specs `https://www.ocean-ops.org/api/oceanops-api-legacy.yaml` (OpenAPI "OceanOPS API for metadata access", v1.16.62) and `oceanops-api-push.yaml` ("GOOS Passport API").
   - Endpoints: `/data/platform`, `/data/platform/ref/{ref}`, `/data/platform/wigosid/{id}`, `/data/platform/wmdr/...`, `/data/ship`.
   - Also `https://www.ocean-ops.org/api/1/...` (legacy). It returned the whole platform table, 48.8 MB, unpaginated, so **do not call it without a limit**.
8. **HTTPS and observed headers.** HTTPS, Jetty. Response headers:
   ```
   access-control-allow-credentials: true
   access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
   access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin
   access-control-max-age: 86400
   ```
   There was **no `Access-Control-Allow-Origin`** on the plain GET. It may echo Origin, but that is untested, hence the browser test.
9. **Authentication, limits, cost.**
   - The legacy spec declares `securitySchemes` `X-OceanOPS-Metadata-ID` / `X-OceanOPS-Metadata-Token` **on the read endpoints** (`/data/platform` etc.). The unauthenticated sample still returned 200 with data.
   - The metadata page says tokens are obtained "once logged in on the OceanOPS web dashboard" (they are used for ID requests and pushes).
   - Because the spec declares auth, unauthenticated read access must **not** be treated as permission.
   - Rate limits: NOT VERIFIED.
10. **Licence and redistribution: NOT VERIFIED.**
    - No terms-of-use, licence or data-policy page was found: `/legal`, `/terms` and `/about` are 404, and the board and metadata pages have no licence link.
    - The OpenAPI `license: Apache 2.0` covers the API specification, not the data.
    - OSMC re-serves an "OceanOPS Active WMO ID LIST" (`https://osmc.noaa.gov/erddap/info/wmo_list/index.csv`, institution "OSMC; OceanOPS") under the ERD boilerplate "may be used and redistributed for free". That dataset contains **CONTACT_NAME and EMAIL columns (personal data)**. NEXUM must not ingest or republish those fields.
11. **Identifiers.** OceanOPS `ref` (usually equal to the WMO ID), internal `id`, WIGOS ID (`0-22000-0-<wmo>`), `lastLocId`, ISO timestamps.
12. **Overlaps.** OceanOPS is the metadata hub for everything else here.

**Classification: CONDITIONAL.**
- Usable only as a metadata cross-reference after written confirmation from OceanOPS (support@ocean-ops.org / dev@ocean-ops.org) that unauthenticated read-only use and redistribution of platform metadata is allowed, and with what attribution.
- Until then, licence, redistribution and rate limits are NOT VERIFIED.
- Never ingest contact or email fields.

---

## 5. IOC/UNESCO GOOS, DBCP, GTS, and drifter data

**GOOS** (https://goosocean.org/) is a coordination framework only: networks, EOVs, OCG. It provides no data service, so it is NO-GO as a source.

**DBCP** (https://www.ocean-ops.org/dbcp/)
- Counts: "1,500+ active buoys" and "over 1,250 drifting buoys and 400 moored buoys in the DBCP network" (homepage, © 2025, undated count).
- It only coordinates. Its data-access page (https://www.ocean-ops.org/dbcp/data_access.html) sends users to:
  - GTS / WIS2.0 (operational WMO exchange, not a simple static source);
  - Canada ISDM ("archive of all buoy data on behalf of the DBCP and GOOS … within 2 months of observation");
  - NCEI, Coriolis, AOML GDP and NDBC.
- Data policy, quoted:
  > "The DBCP encourages free and open access to data. … In many cases, the policies relating to the release and use of these data are not immediately clear. The Panel is seeking clarification …"
- Website copyright (https://www.ocean-ops.org/dbcp/copyright.html) covers site material:
  > "You may freely download and copy the DBCP material … for your personal, non-commercial use, without any right to resell, redistribute, compile or create derivative works therefrom".

  This is about website content. It is one more reason not to treat DBCP pages as a data source.

**Classification: NO-GO as a direct source** (GOOS and DBCP coordinate; they publish no open data endpoint). Use the data services they point to:

**NOAA Global Drifter Program (AOML ERDDAP)**, `https://erddap.aoml.noaa.gov/gdp/erddap/`
- Datasets: `drifter_hourly_qc` (1987-10-02 → **2022-10-31**), `drifter_6hour_qc` (1979-02-15 → **2025-06-18**), plus climatologies.
- Variables: ID, WMO, time, lat/lon, sst, flg_sst, ve, vn, err_*, drogue_lost_date and more.
- Licence attribute:
  > "Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/) This study used data collected and made freely available by the NOAA Global Drifter Program …"
  > Citation DOI 10.25921/x46c-3620
- The summary says it is updated quarterly in delayed mode, but "the data processing team has experienced unforeseen setbacks".
- HTTPS, **no ACAO**.
- **GO** for a historical or delayed drifter layer. It is not real-time.

**OSMC ERDDAP (NOAA Observing System Monitoring Center)**, `https://osmc.noaa.gov/erddap/`
- Datasets: `OSMC_30day` (title "OSMC 90 day RT data"), `OSMC_flattened` ("observations from GTS"), `OSMC_PROFILERS` (Argo), `OSMCV4_DUO_*`, `wmo_list`.
- Variables: platform_code, platform_type, country, time, lat, lon, sst, atmp, slp, windspd, winddir, wvht, waterlevel, sss, ztmp, zsal, uo, vo and more.
- Licence attribute (verbatim, including a stray "page 62 of 86"):
  > "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide page 62 of 86 through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0 1.0)"
- One sample (`platform_type`, last hour, distinct) returned only C-MAN, SHIPS, TIDE GAUGE. Drifters and moored buoys were absent in that 1-hour window, so ingestion lag or coverage needs checking. NOT VERIFIED.
- HTTP 1.1 over HTTPS, **no ACAO**.
- Caveat: the underlying observations come from many national GTS contributors. CC0 is NOAA's statement for its compilation.
- **GO**, provisionally, as a near-real-time, all-platform source. Re-check coverage and contributor attribution.

---

## 6. Classification summary

| Network / service | Class | Key condition |
|---|---|---|
| NDBC files (`www.ndbc.noaa.gov`) | **GO** (build-side snapshot) | NWS public domain "unless specifically noted otherwise". No endorsement, no NWS logo. "limit your retrievals". Partner-station terms NOT VERIFIED. No ACAO observed. |
| NDBC via CoastWatch ERDDAP `cwwcNDBCMet` | **GO** | "may be used and redistributed for free". No QC flags. No ACAO observed. |
| NDBC SOS (`sdf.ndbc.noaa.gov`) | NO-GO (unavailable) | DNS does not resolve |
| OceanSITES (GDAC FTP / NDBC THREDDS) | **CONDITIONAL** | Per-file CLIVAR licence: citation mandatory, "contact PI prior to any commercial use". Official site unreachable (TLS failure), policy NOT VERIFIED. Mostly delayed-mode NetCDF. |
| Argo GDAC (Ifremer https / S3) + Ifremer ERDDAP `ArgoFloats` | **GO** (build-side) | "freely available without restriction" + acknowledgement + DOI 10.17882/42182. AWS lists CC BY 4.0. Index 318 MB. No ACAO observed. |
| Euro-Argo fleet monitoring API | **CONDITIONAL** | Terms NOT VERIFIED (`termsOfService: urn:tos`) |
| OceanOPS API | **CONDITIONAL** | Licence and redistribution NOT VERIFIED. Spec declares API-key headers on reads. Ask OceanOPS. Metadata only. Exclude contact/email fields. |
| GOOS / DBCP | **NO-GO** as direct source | Coordination only. DBCP data policy "not immediately clear". Website content non-commercial / no redistribution. |
| NOAA GDP drifters (AOML ERDDAP) | **GO** (historical) | CC BY 4.0 + DOI citation. Data end 2022-10 (hourly) / 2025-06 (6-hourly). |
| OSMC ERDDAP (GTS, all platforms) | **GO (provisional)** | CC0 per attribute. Verify per-platform coverage and lag. Never use `wmo_list` contact/email. |

ACAO on a plain GET without Origin was **absent on every endpoint tested**. OceanOPS sends other ACA-* headers but no ACAO. Browser-direct use is therefore unproven everywhere. For now, assume Python connectors build snapshots on the author's machine, and Cloudflare Pages serves the static JSON.

## 7. NEXUM object mapping (suggested, not implemented)

- **Identity:**
  - NDBC `station_id`, plus WMO/WIGOS where the ID is 5-digit WMO.
  - Argo WMO float number, with the WIGOS form `0-22000-0-<wmo>`.
  - OceanSITES site code + platform code.
  - GDP `ID` + `WMO`.
- **Measurement:** value, unit, UTC `time`, quality.
  - NDBC: derived "realtime-autoQC" / "historical-QC", because there are no flags.
  - Argo: `*_qc` / `*_adjusted_qc` + `data_mode`.
  - OceanSITES: `*_QC`.
  - GDP: `flg_sst`.
- **Evidence:** source URL of the exact file or ERDDAP query, `Last-Modified`, and the licence string quoted from the source.

## 8. URLs for the author's browser CORS test

Open DevTools → Console on any https page (e.g. https://nexum.pezzalihub.app) and run `fetch(URL).then(r=>r.text()).then(t=>console.log(t.slice(0,300)))`. A CORS error means the URL cannot be used browser-direct. Except where marked "untested", every URL below was fetched once from here and returned 200.

**NDBC**
- Catalogue: `https://www.ndbc.noaa.gov/activestations.xml`
- Latest (all stations): `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt`
- Time series (45 days, 609 kB): `https://www.ndbc.noaa.gov/data/realtime2/44013.txt`

**NDBC via CoastWatch ERDDAP**
- Short series (24 h): `https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv?station%2Clongitude%2Clatitude%2Ctime%2CWD%2CWSPD%2CWVHT%2CATMP%2CWTMP&station=%2244013%22&time%3E=now-1day`
- Latest (untested variant): `https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.json?station%2Ctime%2CWSPD%2CWVHT%2CATMP%2CWTMP&station=%2244013%22&time%3E=now-1day&orderByMax(%22time%22)`
- Catalogue (untested variant): `https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.json?station%2Clongitude%2Clatitude&time%3E=now-3hours&distinct()`

**Argo**
- Ifremer ERDDAP, short query (surface values, last 3 days, Ligurian box): `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv?platform_number%2Ccycle_number%2Ctime%2Clatitude%2Clongitude%2Cdata_mode%2Cpres%2Ctemp%2Ctemp_qc%2Cpsal%2Cpsal_qc&time%3E=now-3days&pres%3C=5&latitude%3E=40&latitude%3C=44&longitude%3E=4&longitude%3C=10`
- Float series (untested): `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv?platform_number%2Ccycle_number%2Ctime%2Clatitude%2Clongitude%2Cdata_mode%2Ctemp%2Ctemp_qc&platform_number=%224903654%22&pres%3C=5&time%3E=now-90days`
- Float metadata (Euro-Argo, 346 kB): `https://fleetmonitoring.euro-argo.eu/floats/4903654`
- GDAC file header via S3 (range request; a browser fetch needs a `Range` header, which is not a forged header): `https://argo-gdac-sandbox.s3.eu-west-3.amazonaws.com/pub/idx/ar_index_global_prof.txt`. Do not fetch it whole: it is 318 MB.

**OceanSITES**
- Catalogue (THREDDS): `https://dods.ndbc.noaa.gov/thredds/catalog/oceansites/catalog.html`
- Dataset info (Ifremer ERDDAP): `https://erddap.ifremer.fr/erddap/info/OS_DYFAMED_1994-2014_D_TSO2/index.csv`

**OceanOPS**
- `https://www.ocean-ops.org/api/data/platform?limit=1`
- `https://www.ocean-ops.org/api/data/platform/wigosid/0-22000-0-4903654`
- Never call `/api/1/data/platform` without a limit: it returns 48.8 MB.

**OSMC**
- Platform types (last hour): `https://osmc.noaa.gov/erddap/tabledap/OSMC_30day.csv?platform_type&time%3E=now-1hour&distinct()`
- One platform, 24 h (untested): `https://osmc.noaa.gov/erddap/tabledap/OSMC_30day.json?platform_code%2Cplatform_type%2Ctime%2Clatitude%2Clongitude%2Csst%2Catmp%2Cslp%2Cwindspd%2Cwvht&platform_code=%2244013%22&time%3E=now-1day`

**GDP drifters**
- Info: `https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_6hour_qc/index.csv`
- 1-day slice (untested): `https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_6hour_qc.csv?ID%2CWMO%2Ctime%2Clatitude%2Clongitude%2Csst%2Cflg_sst&time%3E=2025-06-17T00:00:00Z&time%3C=2025-06-17T06:00:00Z`

## 9. Open items (NOT VERIFIED)

- OceanSITES official data policy and site count: www.oceansites.org TLS failure.
- OceanOPS licence, redistribution and rate limits; whether read endpoints formally require the API key.
- Euro-Argo fleet monitoring API terms.
- Licences for NDBC partner stations (IOOS RAs, CDIP/Scripps, ECCC, etc.).
- Whether ERDDAP, S3 or OceanOPS return ACAO when the browser sends Origin: needs the browser test in section 8.
- OSMC per-platform coverage and lag (the 1-hour sample showed no buoys).
- Overlaps with CMEMS INSTAC / EMODnet Physics: not checked in this pass.
- US Argo GDAC (`nrlgodae1.nrlmry.navy.mil`): connection reset from this network.
