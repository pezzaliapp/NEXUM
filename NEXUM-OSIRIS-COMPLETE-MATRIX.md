# NEXUM — OSIRIS complete capability matrix (master pass, 2026-10-06)

**Method.** The OSIRIS repository (`OSIRIS-REFERENCE`, commit `7a3daec`, 367 files) was read file by file in four
inventories: UI controls (39 components, `page.tsx`, docs, privacy), `src/lib` with the static data (88 files, `public/`),
server routes plus engine, intel and tools (78 modules), and CCTV (64 files, 74 camera sources). Every control, layer,
panel, route and dataset found there has one row below. The OSIRIS screenshots were used to check that nothing visible
was missed.

**Decisions** (only these): REUSE · ADAPT · REIMPLEMENT · ALTERNATIVE · IMPOSSIBLE. No OSIRIS file, asset or data was
copied (P25/W10 stay PASS), so REUSE applies only to shared open libraries. IMPOSSIBLE always gives its evidence.

**NEXUM BEFORE** is the state at the start of this pass: HEAD `ef651f0` plus the uncommitted work of the earlier passes
(see `NEXUM-OSIRIS-CAPABILITY-MATRIX.md`). **NEXUM AFTER** is the live-review build of this pass.

**Cost** of every row is €0. No service needs a key, an account, a card or a trial. Tests are in `ui/tests/web/master.spec.ts`
(M), `pass5.spec.ts` (P5), `autoupdate.spec.ts` (AU), `acceptance1.spec.ts` (A1) and the mobile suite (MOB).

## 0. Findings that change what "parity" means

1. **OSIRIS "LINEE MARITTIME" are submarine cables, not shipping lanes.** The layer draws `public/data/submarine-cables.json`
   (717 features, 127 drawn), cited as TeleGeography's submarinecablemap.com with no licence. The "257" next to the
   toggle counts a synthetic sample of flights, ships, quakes and news, not lines.
   - `sdk_air` and `sdk_naval` never receive data.
   - There is no shipping-lane dataset anywhere in OSIRIS.
   - NEXUM AFTER draws the legal equivalent: OpenStreetMap's submarine cables worldwide (10,320 ways, ODbL).
2. **"LEBANON BORDER", "GAZA CONFLICT" and similar are 15 hard-coded editorial zones.** Their "events" are RSS headlines
   placed at the anchor plus a deterministic jitter. NEXUM has measured equivalents: UCDP security zones and events.
3. **Chokepoint traffic and risk are editorial strings** ("12% world trade", "ELEVATED"). NEXUM AFTER uses IMF PortWatch:
   transits measured from AIS, per day, with no editorial risk.
4. **OSIRIS "Global Incidents" is GDACS RSS under a misleading route name** (`/api/gdelt`).
5. **Much OSIRIS fetching forges headers.** `stealthFetch` fakes X-Forwarded-For/X-Real-IP from residential ISP ranges
   and rotates browser User-Agents. The CCTV proxy forges Referer and disables TLS verification; the ASFINAG fetch embeds
   a Basic-auth credential. None of this is reproducible under NEXUM's rules.

## A. Header, status, branding

| # | OSIRIS control | Capability | OSIRIS file | NEXUM BEFORE | NEXUM AFTER | Decision | Source / licence | Test | Result |
|---|---|---|---|---|---|---|---|---|---|
| A1 | ZULU clock | UTC clock | page.tsx:78-88 | ZULU in HUD | same | REIMPLEMENT | — | web HUD | PASS |
| A2 | STATUS LIVE/ERROR | backend state | page.tsx:1426 | sources state | same | REIMPLEMENT | — | web | PASS |
| A3 | N LAYERS / N ENTITIES | counts | page.tsx:1428-1436 | HUD counts | same | REIMPLEMENT | — | web | PASS |
| A4 | SOLAR Kp | geomagnetic index | page.tsx:707 | Kp + time | same | ADAPT | NOAA SWPC (PD), published table | web | PASS |
| A5 | V5.0 version | version string | page.tsx:149 | snapshot version | + **build id** (status bar tooltip, `<html data-build>`, Help) | REIMPLEMENT | — | AU | PASS |
| A6 | $OSIRIS token chart | memecoin promo | TokenPanel.tsx | — | — | IMPOSSIBLE | third party's token promotion: not a capability | — | — |
| A7 | SUPPORT (Ko-fi, merch) | donations | SupportMenu.tsx | — | — | IMPOSSIBLE | OSIRIS's own payment accounts; reuse = impersonation | — | — |
| A8 | Splash stages | loader | page.tsx:1058 | wordmark splash | same | REIMPLEMENT | — | — | PASS |

## B. Left layer rail

| # | OSIRIS control | Capability | OSIRIS file | NEXUM BEFORE | NEXUM AFTER | Decision | Source / licence | Test | Result |
|---|---|---|---|---|---|---|---|---|---|
| B1 | SDK OSIRIS → Linee marittime | submarine cables (TeleGeography, unlicensed) | LayerPanel:58, OsirisMap:2193 | OSM cables **in view, zoom ≥4** | **OSM cables worldwide at every zoom**, clickable (name, kind, operator, OSM link, licence) | ALTERNATIVE | OpenStreetMap ODbL 1.0, weekly Overpass extract (`osm.cables`) | M maritime | PASS |
| B2 | sdk_air / sdk_naval | "air corridor", "naval intel" lines | OsirisMap:850-886 | — | — | IMPOSSIBLE | no data source exists in OSIRIS: the layers are never fed (OsirisMap:1389-1421) | — | — |
| B3 | Aviation: commercial / private / jets / military | live aircraft by class | flights/route.ts | BLOCKED, stated | same, re-verified 2026-10-06 | IMPOSSIBLE | adsb.lol and adsb.fi send no CORS header; airplanes.live 403; OpenSky ACAO = its own origin. A static site cannot read them without a proxy (forbidden); OpenSky needs OAuth | probe log in the report | — |
| B4 | Flight card, airframe, route PRG→TLV, Watch aircraft, FlightAware/ADS-B/RadarBox links | per-aircraft tracking | OsirisMap:976-1074, FlightWatchPanel | — | — | IMPOSSIBLE | no lawful €0 source (B3); following a single aircraft is personal tracking (privacy gate) | — | — |
| B5 | Maritime: ports (52 hard-coded) | port dots | maritime/route.ts:9-66 | NGA WPI ports (NEXUM objects) | + **IMF PortWatch ports** (2,065, measured daily calls, import/export t) | ALTERNATIVE | IMF PortWatch, IMF terms (reuse with attribution) | M maritime | PASS |
| B6 | Naval bases with fleet names (13 hard-coded) | naval bases | maritime/route.ts:9-66 | — | **OSM naval bases** (509): name and operator only, no fleet or other tags | ALTERNATIVE | OpenStreetMap ODbL (`osm.navalbases`); privacy/cyber gate: only public map facts | M maritime | PASS |
| B7 | Chokepoints + editorial risk | 10 hard-coded chokepoints | maritime/route.ts:69-79 | — | **28 IMF PortWatch chokepoints**: yearly AIS averages by ship type, latest daily transits and tonnes, 7-day mean, 30-day course | ALTERNATIVE | IMF PortWatch (AIS, IMF terms) | M maritime | PASS |
| B8 | Port congestion "LIVE n WAITING m" | AIS congestion | maritime/route.ts:247-304 (never shown: OsirisMap:2177 bug) | — | PortWatch daily port calls (measured) | ALTERNATIVE | as B5 | M maritime | PASS |
| B9 | AIS ships worldwide | live vessels | aisstream.io (key, server WS) | Digitraffic AIS, Baltic | same | ALTERNATIVE | aisstream needs a key and a server: IMPOSSIBLE; Digitraffic CC BY 4.0 keyless | P5 audit | PASS (Baltic) |
| B10 | Space tracking: all / Starlink-comms / military / GPS / earth obs / stations | satellites by category | satellites/route.ts:15-96, LayerPanel:85-90 | satellites (families), no category switches | **7 category switches with counts** (CelesTrak groups, never name guessing) | REIMPLEMENT | CelesTrak OMM | M satellites | PASS |
| B11 | Satellite card + orbit track + N2YO | card | SatelliteCard.tsx | card + track | + **N2YO and CelesTrak catalogue links**; card opens without a tool open (pass #5 fix) | ADAPT | links only | M small, P5 | PASS |
| B12 | CCTV cameras | camera catalogue | cctv/* (74 sources) | 21,172 NEXUM cameras, 5,214 true live | same (all preserved) | ALTERNATIVE | per-source licences (registry); see §H | A1 | PASS |
| B13 | CCTV live previews | thumbnails on the map ≥ z13 | CctvPreviews.tsx | still previews in the Cameras tool | **opt-in map previews ≥ z13**, 6 nearest; still image labelled with its load time (never "LIVE"); live streams show a LIVE tile that opens the card | REIMPLEMENT | publishers' images, loaded only after the person asks | M camera previews | PASS |
| B14 | Live news feeds (TV channels) | YouTube/Rumble channels | live-news/route.ts | 7 official broadcasters, click-to-load | same | ADAPT | YouTube embed; RT excluded (EU sanctions) | ops-sheet | PASS |
| B15 | Earthquakes | USGS 2.5_day | page.tsx:685 | NEXUM events (USGS, NCEI) | + **live USGS layer and list** (clickable: magnitude, place, UTC time, age, depth, review status, PAGER, tsunami flag, USGS link) | ADAPT | USGS public domain | M alerts | PASS |
| B16 | Active fires + "NASA FIRMS map" link | FIRMS 24 h | fires/route.ts | FIRMS hotspots layer, card | + **FIRMS map link** in the card | ADAPT | NASA open data | P5 audit | PASS |
| B17 | Severe weather | NWS + EONET + GDACS | weather/route.ts | NEXUM events + Allerte | + **GDACS and NWS map layers**, clickable | ADAPT | GDACS (EC/UN), NWS (PD) | M alerts | PASS |
| B18 | Nuclear facilities + seismic flag | 64 hand-typed sites | infrastructure/route.ts | WRI power plants incl. nuclear; exposure insights | same | ALTERNATIVE | WRI GPPD (CC BY 4.0) | semantic gate | PASS |
| B19 | Global incidents (GDACS RSS) | disaster points | gdelt/route.ts | GDACS list | + GDACS layer | ADAPT | GDACS | M alerts | PASS |
| B20 | Conflict-zone markers (15 editorial) | warzone labels | conflicts/route.ts:41-115 | UCDP security zones (201), clickable since pass #5 | same | ALTERNATIVE | UCDP (CC BY 4.0) | P5 audit | PASS |
| B21 | Live alert pins (Telegram + RSS, geocoded) | news pins | news/route.ts, alert-places.ts | GDELT points | **grouped GDELT points** (one per action and place, every article listed) | ALTERNATIVE | Telegram scraping: IMPOSSIBLE (messaging content, terms); wire RSS headlines: IMPOSSIBLE (publishers' copyright); GDELT open | M alerts, P5 | PASS |
| B22 | GDELT events | 15-min export | gdelt-events/route.ts | GDELT table | grouped | ADAPT | GDELT open | M GDELT | PASS |
| B23 | Live malware / botnet C2 | malicious hosts on the map | malware/*, cyber-attacks | — | — | IMPOSSIBLE | cyber gate (republishing live attack infrastructure); abuse.ch non-commercial/no-derivatives terms; geolocation through ip-api (non-commercial, HTTP) | — | — |
| B24 | Internet outages / attack origins | Cloudflare Radar | cloudflare-radar | — | — | IMPOSSIBLE | account token and server needed; IODA responses "All Rights Reserved" | — | — |
| B25 | Day/night, 3D buildings, 3D terrain | display | OsirisMap | NEXUM illumination (approved), buildings, terrain | unchanged (6/6 light files identical) | REIMPLEMENT | — | lights SHA | PASS |
| B26 | Style Studio, Ghost theme | theming | StyleStudio.tsx | 6 themes | same | REIMPLEMENT | — | — | PASS |
| B27 | balloons, radiation, war_alerts keys | — | page.tsx | — | — | IMPOSSIBLE | routes do not exist in OSIRIS (404): no capability | — | — |

## C. Right tool strip and panels

| # | OSIRIS control | Capability | OSIRIS file | NEXUM BEFORE | NEXUM AFTER | Decision | Source / licence | Test | Result |
|---|---|---|---|---|---|---|---|---|---|
| C1 | LIVE ALERTS panel | sources health, counts, tabs, search, perspective, threads, time groups, cards, map pins | LiveAlerts.tsx | separate lists | **Avvisi in diretta**: every source with its freshness or failure, summary line, tabs (all / verified / reported / quakes / NEXUM) with counts, search, "only in view", groups by age, VERIFIED vs REPORTED badge, card → fly + mark + information card, marker → same card | REIMPLEMENT | USGS, GDACS, NWS, GDELT, NEXUM events | M alerts | PASS |
| C2 | Same story from several channels merged | dedup by first 24 words | telegram.ts:325 | — | GDELT rows merged by action + place (one item, all articles) | REIMPLEMENT | — | M GDELT grouping | PASS |
| C3 | Perspective filter (Western / Russian-aligned…) | editorial bloc labels | alert-digest.ts | — | — | IMPOSSIBLE | editorial classification of publishers, not data; NEXUM labels knowledge by kind (verified vs reported), never by political bloc | — | — |
| C4 | AI overview (Gemini) | LLM brief | ai-engine.ts | local WebLLM (opt-in) | + deterministic summary line in the alerts | ALTERNATIVE | no commercial AI | M small | PASS |
| C5 | Route: Drive/Walk/Bike, stops, swap, avoid tolls/highways/ferries, alternatives, steps (click → segment), summary, badges, elevation, navigation, off-route reroute, wake lock | directions | DirectionsBar.tsx, directions/route.ts | OSRM one route, steps, navigation | **Valhalla (FOSSGIS)**: 3 modes, ≤3 stops, swap, hard avoid, up to 2 alternatives, Italian instructions with click-to-locate, toll/motorway/ferry badges, arrival time, elevation (walk/bike), navigation with **auto reroute after 6 s off route**, wake lock, weak-signal tolerance; OSRM fallback | ADAPT | FOSSGIS e.V. (terms read: fair use, ≤1 req/s, origin sent); OSM ODbL | M routing, M navigation | PASS |
| C6 | ArcGIS Intel: scan in map extent, category chips, result cards, import in bbox, active layers (show/hide, colour, opacity, remove) | dataset discovery | ArcGISPanel.tsx | free-text search, single import | **extent search, 6 category chips, cards (owner, views, description, tags, licence), import in the area (≤2,000), multiple layers (visibility, colour, frame, remove), every feature clickable with its dataset and licence** | REIMPLEMENT | ArcGIS Online public items, each with its declared licence (undeclared = not importable) | M discovery | PASS |
| C7 | ArcGIS "Military" preset | preset query | ArcGISPanel.tsx:61-67 | — | not offered as a preset (free search remains) | IMPOSSIBLE | privacy/cyber gate: no ready-made targeting of military installations | — | — |
| C8 | Draw: area/box/radius/path, measures, AOI contents, export | AOI | DrawingToolbar.tsx | same | same | REIMPLEMENT | — | MOB maptools | PASS |
| C9 | AOI tripwire (watch) | arrivals in an area | watch.ts | — | **watch of live alerts inside a shape** (events only), logged while the page is open | REIMPLEMENT | as C1 | M small | PASS |
| C10 | AOI tripwire on aircraft/vessels | vehicle tracking | aoi.ts | — | — | IMPOSSIBLE | personal tracking (privacy gate); no lawful aircraft source | — | — |
| C11 | Markets: indices, defence stocks, oil, commodities, crypto, FX; candle chart with ranges | market data | MarketsPanel, MarketChart | ECB FX (3 months), Treasury, EIA, Pink Sheet, crypto | + **FX ranges 1M–5Y** | ALTERNATIVE | ECB/Frankfurter, US Treasury, EIA, World Bank, Coinbase; Yahoo: IMPOSSIBLE (forbids automated use; fake browser UA in OSIRIS) | M small | PASS |
| C12 | Search (address, city, coordinates) | geocoding | SearchBar, geosearch | NEXUM search + Photon (route/point) | same | ADAPT | Photon (OSM) | — | PASS |
| C13 | Space cam (ISS live) | video | SpaceCam.tsx | Sen ISS + NASA/ESA official | same | ADAPT | operators' official channels | — | PASS |
| C14 | Statistics | `/api/stats` (fetched, never shown in OSIRIS) | page.tsx:496 | HUD counts | same | REIMPLEMENT | — | — | PASS |
| C15 | Region dossier (double right-click) | place brief | region-dossier | Point panel | same | ALTERNATIVE | Open-Meteo, Wikipedia, NEXUM data | — | PASS |
| C16 | Share view: copy link, X / LinkedIn / Reddit | share | SharePanel.tsx | copy link (permalink) | + **X, LinkedIn, Reddit intent links** (opened only on tap) | ADAPT | — | M small | PASS |
| C17 | View presets (12, "hot") | fly-to | ViewPresets.tsx | 12 presets | same | REIMPLEMENT | — | — | PASS |
| C18 | Keyboard shortcuts, fullscreen, reset | — | page.tsx:505 | same | same | REIMPLEMENT | — | — | PASS |
| C19 | Docs / API catalogue / try-it | server API docs | app/docs | NEXUM API spec, MCP server, Help | same | ALTERNATIVE | NEXUM has no public server (static site); its API is documented in the repo and served by `nexum.api` locally | — | PASS |
| C20 | Privacy page | disclosures | privacy/page.tsx | Help: who is contacted, when | updated with every new provider | ADAPT | — | — | PASS |

## D. OSINT recon toolkit (OsintPanel, 19 tools)

| # | Tool | NEXUM AFTER | Decision | Reason / source | Result |
|---|---|---|---|---|---|
| D1 | DNS, WHOIS/RDAP, certificates, BGP/ASN, MAC vendor, Shodan InternetDB, CVE, Tor exits | Rete panel | ADAPT / ALTERNATIVE | Google DoH, RDAP, Cert Spotter, RIPEstat, IEEE MA-L, InternetDB, MITRE, Tor list | PASS |
| D2 | Sanctions (OFAC) | Registri | ALTERNATIVE | OFAC SDN official (PD); persons never shown | PASS |
| D3 | Chain daily brief | Registri | ALTERNATIVE | DefiLlama, KEV, OFAC | PASS |
| D4 | Port scan, vuln sweep, subdomains, SSL, headers, tech detect (external scanner) | — | IMPOSSIBLE | active scanning of third-party hosts (c.p. 615-ter/615-quater); needs a keyed server | — |
| D5 | IP sweep, self-track, IP geolocation of targets | — | IMPOSSIBLE | device enumeration and IP profiling (privacy and cyber gate) | — |
| D6 | Username enumeration, fingerprint, GitHub recon, phone intel, email breaches, infostealer logs | — | IMPOSSIBLE | searching and profiling persons, breach data (GDPR art. 6, 9; privacy gate) | — |
| D7 | Wallet forensics | — | IMPOSSIBLE | tracking individuals' wallets | — |
| D8 | Threat feed (AlienVault OTX) | — | IMPOSSIBLE | account key required | — |

## E. Other OSIRIS components

| # | Component | Decision | Reason | Result |
|---|---|---|---|---|
| E1 | WorldRemote "MARAUDER" (Bluetooth probing, GATT writes, localhost port probe) | IMPOSSIBLE | device intrusion and surveillance (c.p. 615-ter, 617-quater; GDPR) | — |
| E2 | Umami analytics with visitor IP | IMPOSSIBLE | visitor tracking (privacy gate) | — |
| E3 | IP geolocation of the visitor (ipapi, freeipapi, ip-api) | IMPOSSIBLE (ALTERNATIVE: time-zone facing) | personal data to third parties | PASS (alternative) |
| E4 | Polybolos SDK / Lattice adapter / SDK ingest-stream | IMPOSSIBLE | needs a server and a third party's keyed platform; "simulated" in OSIRIS itself | — |
| E5 | PYTHIA engine (LLM forecasts, swarm) | ALTERNATIVE | NEXUM never forecasts; facts with evidence and declared hypotheses only (local AI opt-in) | PASS |
| E6 | intel/server.js entity graph (incl. persons) | ALTERNATIVE | NEXUM graph, Wikidata; persons never | PASS |
| E7 | stealthFetch, forged Referer proxy, TLS off, embedded credentials | IMPOSSIBLE | header forging and access-control bypass (NEXUM rule) | — |
| E8 | CARTO tile proxy, Esri imagery | ALTERNATIVE | OpenFreeMap (STRADE), EOX/NASA (SAT), GIBS (OGGI) | PASS |
| E9 | Frontlines (DeepState) | IMPOSSIBLE | proprietary map, no licence | — |
| E10 | Supplier risk (SCM) | ALTERNATIVE | NEXUM exposure insights + AOI | PASS |
| E11 | Country risk (editorial) | ALTERNATIVE | INFORM Risk Index (EC JRC) | PASS |
| E12 | Air quality (OpenAQ v2, dead) | ALTERNATIVE | Open-Meteo CAMS, per point | PASS |

## H. Cameras (74 OSIRIS sources)

| OSIRIS source group | NEXUM | Decision | Reason |
|---|---|---|---|
| TfL, WSDOT, Caltrans, Ontario 511, Quebec, Toronto, DriveBC, Fintraffic, Hong Kong TD, Iceland, Taiwan THB, Spain DGT (official list) | present as NEXUM sources (21,172 cameras in all) | ALTERNATIVE | official open data with verified licences |
| Ottawa, Montréal, Alberta, Edmonton, Utah/Florida/Georgia/NC/Arizona/Nevada/Louisiana (IBI 511), Indiana, Oregon, Michigan, Texas internal endpoints | — | IMPOSSIBLE | undocumented site endpoints; several sidestep a documented keyed API (Louisiana comment), forge Referer (Indiana) or answer 403 |
| ASFINAG, Rijkswaterstaat, Lithuania eismoinfo, SkylineWebcams posters, OpenCCTV | — | IMPOSSIBLE | forged Referer/Origin, embedded credential, anti-hotlink bypass, commercial or internal APIs |
| Butler County Sheriff, CHUV heliport (Axis camera CGI) | — | IMPOSSIBLE | direct pulls from devices' CGI: not a published service |
| OSIRIS's hand-curated YouTube / public-webcam lists | 19 public-body channels + 5,214 live streams of NEXUM's sources | ALTERNATIVE | copying OSIRIS's lists would be OSIRIS data (P25); NEXUM curates its own |
| MLIT river cameras | — | IMPOSSIBLE | no published reuse terms (pass 2026-10-04) |
| New Zealand NZTA | — | IMPOSSIBLE today | licence not verifiable: pages unreachable without a browser and the API states no terms (2026-10-06); to be verified by hand |
| Singapore LTA | — | not added | lawful (Singapore Open Data Licence) but the feed returns 8 cameras today; noted for a later source pass |

## Remaining IMPOSSIBLE capabilities (summary)

Live aircraft and every aircraft feature (B3, B4, C10); worldwide AIS (B9 beyond the Baltic); malware, C2 and outage
maps (B23, B24); the offensive and person-centric OSINT tools (D4–D8); Bluetooth and device intrusion (E1); visitor
tracking and IP geolocation (E2, E3); the SDK platform (E4); header forging and access bypass (E7); proprietary
front lines (E9); editorial bloc labelling (C3); a military-installation search preset (C7); the camera sources listed
in §H. Each has its evidence or legal reason in its row.
