# NEXUM — OSIRIS capability matrix (full transformation, 2026-10-04)

**Baseline.** NEXUM BEFORE = commit `ef651f0` (backup `NEXUM-BACKUPS/pre-osiris-ef651f0`, verified). OSIRIS = `osiris-master` (MIT, © 2026 simplifaisoul), audited file by file in four inventories (map/UI, CCTV, feeds, AI/OSINT) plus the SKY benchmark.

**Classes.**
- REUSE / ADAPT: the OSIRIS function, carried over.
- REIMPLEMENT: rewritten in NEXUM's own idiom.
- ALTERNATIVE: same function, different provider, because the OSIRIS provider is paid, keyed, unlicensed or needs a server.

**Code reuse.** No OSIRIS file was copied. The algorithms were rewritten, and P25/W10 (zero OSIRIS code, assets or data) stay PASS. Attribution of the design inspiration is in the Help panel.

**Results.** PASS = available to the person in NEXUM AFTER (live-review build), legal, €0, keyless. IMPOSSIBLE = with the concrete reason; "not a priority" is never a reason.

**Privacy rule kept (O2).** The browser contacts third parties only when the person asks: a mode, a layer, a tool or a button. The Help panel lists, per moment, who is contacted.

## A. Map, globe, imagery, interface

| # | Capability (OSIRIS) | OSIRIS original | NEXUM BEFORE | NEXUM AFTER | Class | Result |
|---|---|---|---|---|---|---|
| A1 | WebGL map engine | MapLibre 6.7 | MapLibre 6.11.2 | same | REUSE (library) | **PASS** |
| A2 | 3D globe | globe projection | flat only | globe by default; terrain-aware tilt/rotate | REIMPLEMENT | **PASS** |
| A3 | 2D toggle | key G | — | **3D/2D** in the header, key **P**. G stays NEXUM's graph | REIMPLEMENT | **PASS** |
| A4 | Idle globe spin | always on | — | "Rotazione lenta del globo" layer (opt-in, world scale only) | REIMPLEMENT | **PASS** |
| A5 | Opening view facing the visitor | from time zone | fixed 20°E | Europe–Africa by default; faces the device's time zone when it is on another side of the Earth (> 45°; no IP) | REIMPLEMENT | **PASS** |
| A6 | Dark street map | CARTO dark-matter (needs a key under current terms) | NEXUM cartography | **STRADE** (OpenFreeMap / OpenMapTiles, keyless, no limits), opt-in and remembered | ALTERNATIVE | **PASS** |
| A7 | Tile proxy | `/api/proxy-tiles` | — | not needed: every provider is CORS-open and read directly | ALTERNATIVE | **PASS** (function); a proxy itself is IMPOSSIBLE (static site, no server, no redistribution) |
| A8 | SAT imagery | Esri World Imagery | — | **SAT**: NASA Blue Marble (z0–8) + Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, to z14), road/name overlay | ALTERNATIVE | **PASS**. Esri is IMPOSSIBLE: Esri ToU require Esri software or a paid ArcGIS subscription/metered key |
| A9 | Today's Earth | — | GIBS on request (Imagery) | **OGGI**: NASA GIBS VIIRS true colour of yesterday as basemap; NEXUM Imagery kept | ADAPT | **PASS** |
| A10 | 3D buildings | fill-extrusion on CARTO | — | OpenMapTiles building heights, extruded when tilted (with STRADE/SAT) | ADAPT | **PASS** |
| A11 | 3D terrain | AWS Terrain Tiles | — | Terrain Tiles 3D relief + hillshade (new) | REIMPLEMENT | **PASS** |
| A12 | Day/night | simple terminator, ±1° | NEXUM illumination (physically approved), night lights | unchanged; 6/6 light files SHA-256 identical. Over imagery only, the night is drawn at 55 % so the picture stays readable | — | **PASS** |
| A13 | Live clouds | NOAA GMGSI lifted to cloud altitude with shadows (custom WebGL) | — | NOAA nowCOAST GMGSI infrared, hourly, as a flat layer under the borders | ALTERNATIVE (rendering) | **PASS**. Same data and cadence; the 3D lift is drawing, not information |
| A14 | Satellites at altitude | server SGP4 from TLE, custom layer | — | browser SGP4 (satellite.js, worker) from CelesTrak OMM; sub-points refreshed every 3 s, ground track, card with altitude and speed | ADAPT | **PASS**. Positions said "calcolate", never live. OMM instead of TLE (catalogue > 99999) |
| A15 | Scale bar | yes | — | yes (1-2-5) | REIMPLEMENT | **PASS** |
| A16 | Cursor coordinates | yes | — | yes | REIMPLEMENT | **PASS** |
| A17 | Place under cursor | Nominatim on hover | — | offline, NEXUM's country polygons (never a request per mouse move) | ALTERNATIVE | **PASS** |
| A18 | Zoom readout | yes | — | yes | REIMPLEMENT | **PASS** |
| A19 | Nav pad | zoom ± and hold-to-pan | zoom ± | zoom ±, compass when tilted; keyboard arrows pan, keyboard ± zooms | ADAPT | **PASS** |
| A20 | View presets | 12 regions | — | 12 presets (Layers panel) | REIMPLEMENT | **PASS** |
| A21 | Keyboard shortcuts | F O L M C I S R G … | / [ ] W M G Esc | all kept, plus F R P B O T and one key per tool; ? opens the help | REIMPLEMENT | **PASS** |
| A22 | Fullscreen | yes | — | yes (F) | REIMPLEMENT | **PASS** |
| A23 | Share / permalink | URL never restored (bug) | `#/f/<id>` focus | `#/f/<id>&v=lng,lat,z&b=&p=&l=` restores focus, camera, base, projection and layers | ADAPT (bug fixed) | **PASS** |
| A24 | Style studio | 6 presets, token editor | — | 6 themes (accent, links, surfaces), saved in the browser | REIMPLEMENT | **PASS** |
| A25 | Fonts | Google Fonts (visitor IP sent) | system fonts | system fonts (no third party) | ALTERNATIVE | **PASS** |
| A26 | Boot splash | animated | wordmark | pulsing wordmark until the world is ready | REIMPLEMENT | **PASS** |
| A27 | Home city from IP | ipapi / ip-api (IP to third parties) | — | time-zone facing (A5); device position only when asked (SKY, navigation) | ALTERNATIVE | **PASS**. IP geolocation is IMPOSSIBLE (personal data to third parties; ip-api is non-commercial and HTTP only) |
| A28 | Status header | ZULU, status, layers, entities, Kp | status bar | ZULU, sources state, layers, entities drawn, Kp with its time (from NEXUM's own published table) | REIMPLEMENT | **PASS** |
| A29 | Ticker | crypto + USGS quakes | — | NEXUM's recent relevant events (quakes, storms, fires…), each opens its card | ADAPT | **PASS** |
| A30 | Drawing: area, box, radius, path | yes | — | yes, live spherical measures | REIMPLEMENT | **PASS** |
| A31 | AOI: what is inside | OSIRIS feeds | — | **NEXUM elements** inside each shape, counted by type and listed | REIMPLEMENT | **PASS** |
| A32 | Export | GeoJSON, CSV | trail JSON | shapes GeoJSON; contents GeoJSON and CSV | REIMPLEMENT | **PASS** |
| A33 | Place search | Photon + Nominatim | NEXUM search | NEXUM search (unchanged) + Photon (OSM) in Route and Point, debounced, only while typing | ADAPT | **PASS** |
| A34 | Turn-by-turn navigation | GPS, voice | — | device position (not stored or sent), next manoeuvre, distance, spoken instructions | REIMPLEMENT | **PASS** |
| A35 | Layer panel | yes | NEXUM rail (types) | NEXUM rail unchanged + operational layers panel | REIMPLEMENT | **PASS** |
| A36 | Cables | TeleGeography (CC BY-NC-SA) | — | OpenStreetMap submarine cables via Overpass, in view, on request | ALTERNATIVE | **PASS** |
| A37 | Sentinel scenes | API not wired in OSIRIS UI | — | Earth Search STAC: last 45 days, footprint and preview | ADAPT | **PASS** |
| A38 | Region dossier | Wikipedia/Wikidata | NEXUM place view | Point panel: coordinates, local time, weather and air now, nearby NEXUM elements, Wikipedia nearby, sky, route | ALTERNATIVE | **PASS** |
| A39 | Support menu (Ko-fi, merch) | OSIRIS's own accounts | — | — | — | **IMPOSSIBLE**: they are OSIRIS's own payment and shop accounts. Reusing them is impersonation; a NEXUM donation channel needs an account Alessandro must open himself |
| A40 | WorldRemote / MARAUDER (Bluetooth, local network) | yes | — | — | — | **IMPOSSIBLE**: device scanning and surveillance (GDPR; c.p. 615-ter, 617-quater; NEXUM-LEGAL-BOUNDARIES) |
| A41 | Umami analytics | yes | — | — | — | **IMPOSSIBLE**: visitor tracking (privacy gate) |

## B. Cameras and live video

| # | Capability | OSIRIS original | NEXUM BEFORE | NEXUM AFTER | Class | Result |
|---|---|---|---|---|---|---|
| B1 | Camera catalogue | ~30k from 52 regions, proxied, some keys/Referer forging | **21,172 NEXUM objects**, 5,214 true LIVE | unchanged objects (POST baseline) | — | **PASS** |
| B2 | Camera map layer | unclustered dots | NEXUM webcams layer (rail) | unchanged | — | **PASS** |
| B3 | Camera panel | player, retry, fly-to | NEXUM card: image on request, LIVE (HLS/MJPEG) only when frames arrive | unchanged + **Telecamere** tool: cameras in view, opt-in still previews (with time), official channels | ADAPT | **PASS** |
| B4 | Official public-body YouTube live channels | in OSIRIS's lists | — | **19 channels** (ports, municipalities, parks, university) as a map layer and a list; youtube-nocookie, click-to-load; "IN ONDA" only when the player really plays; off-air said | ADAPT | **PASS**. They are a curated map layer, not DB objects: building an object needs an automated fetch, and YouTube's robots.txt (`/feeds/videos.xml` disallowed) and terms forbid that |
| B5 | Live news | 7 embeddable broadcasters | — | the same 7 official channels, click-to-load; RT excluded (EU sanctions) | ADAPT | **PASS** |
| B6 | Live from space | Sen + re-uploads | — | Sen ISS 4K (operator) + NASA and ESA official channels; re-uploaders excluded | ADAPT | **PASS** |
| B7 | MLIT river cameras (JP) | 33 hand-made IDs | — | — | — | **IMPOSSIBLE** now: no catalogue endpoint, and river.go.jp publishes no fetchable reuse terms (MLIT's PDL 1.0 covers mlit.go.jp; river cameras are run by several bodies). Without terms, showing the images is not lawful reuse |
| B8 | Lithuania eismoinfo | 305 cams, proxied with forged Referer | — | — | — | **IMPOSSIBLE**: images are anti-hotlinked (403 with a foreign Referer, so showing them is a bypass), and the list has no published licence (none on data.gov.lt) |
| B9 | Other OSIRIS cameras (IBI 511, Sweden, RWS, TxDOT, Skyline, NSW, Singapore…) | keys, proxies, forged headers, commercial | already assessed | — | — | **IMPOSSIBLE**: key or terms circumvention, Referer forging, commercial or private sources (inventory B, per-row proof) |

## C. Feeds and layers

| # | Capability | OSIRIS original | NEXUM BEFORE | NEXUM AFTER | Class | Result |
|---|---|---|---|---|---|---|
| C1 | Live aircraft | adsb.fi / OpenSky (OAuth) | — | **AIR TRAFFIC: BLOCKED**, said in Layers and SKY | — | **IMPOSSIBLE**: adsb.lol and adsb.fi have no CORS and are non-commercial only; airplanes.live returns 403; ADS-B Exchange is paid; OpenSky is excluded as default. No proxy allowed. Never simulated |
| C2 | Aircraft track / identity / route | adsb.lol traces, adsbdb, hexdb | — | — | — | **IMPOSSIBLE**: per-aircraft tracking (personal tracking), and no lawful €0 source |
| C3 | Ships (AIS) | aisstream (key, server WebSocket) | ports (NGA WPI) | Digitraffic AIS (CC BY 4.0, keyless): commercial and passenger traffic of the Baltic; pleasure craft never drawn | ALTERNATIVE | **PASS** (Baltic coverage; worldwide keyless AIS does not exist) |
| C4 | Satellites | CelesTrak TLE via server | — | CelesTrak OMM: 23 sets via the build (once per update), 570 notable spacecraft as NEXUM objects, full catalogue published | ADAPT | **PASS** |
| C5 | Space weather | Kp, X-ray flares, SWPC alerts | — | Kp (header + 3-day forecast), NOAA scales, GOES flares, SWPC alerts, aurora oval | ADAPT | **PASS** |
| C6 | Earthquakes | USGS feeds | **NEXUM events** (USGS, NOAA NCEI) | unchanged | — | **PASS** |
| C7 | Fires | FIRMS 24 h | EONET wildfire events | + **FIRMS VIIRS hotspots 24 h** (published table, layer on request) | ADAPT | **PASS** |
| C8 | Severe weather / disaster alerts | NWS, EONET, GDACS RSS | EONET/CEMS events | + **Allerte** tool: NEXUM events, GDACS orange/red (live display, never imported: no reuse licence), NWS severe/extreme | ADAPT | **PASS** |
| C9 | GDELT events | 15-min export | — | GDELT last hour (published table), layer + list, actors dropped | ADAPT | **PASS** |
| C10 | GDELT DOC article search | API | — | — | — | **IMPOSSIBLE**: every probe returned 429 ("one request every 5 seconds"); a shared public site cannot respect a per-IP quota for all its visitors |
| C11 | Live alerts from Telegram + wire RSS | 9 Telegram channels, RSS | — | GDELT (news with source links) + GDACS + NWS + NEXUM events | ALTERNATIVE | **PASS** (function). Telegram scraping is IMPOSSIBLE (messaging content, terms); republishing wire headlines is IMPOSSIBLE (publishers' copyright) |
| C12 | Conflicts | editorial zones + RSS | UCDP events, security zones | unchanged | — | **PASS** |
| C13 | Frontlines (DeepState) | undocumented API | — | — | — | **IMPOSSIBLE**: proprietary map, no published licence |
| C14 | Internet outages (IODA) | API | — | — | — | **IMPOSSIBLE**: responses are "Copyright Georgia Tech… All Rights Reserved"; needs written permission |
| C15 | Cloudflare Radar | Bearer token | — | — | — | **IMPOSSIBLE**: account token and server needed |
| C16 | Air quality | OpenAQ (v2 gone, v3 key) | — | Open-Meteo air quality (CAMS) and weather, per point on request | ALTERNATIVE | **PASS** |
| C17 | Nuclear facilities | ~45 hand-typed | WRI power plants (incl. nuclear) | unchanged | — | **PASS** |
| C18 | Botnet C2 / malware URLs (abuse.ch) | yes | — | — | — | **IMPOSSIBLE**: abuse.ch terms are non-commercial with no derivative works; the geolocation goes through ip-api (non-commercial, HTTP) |
| C19 | Known exploited vulnerabilities | CISA KEV | — | CISA KEV (published table) in Registri | ADAPT | **PASS** |
| C20 | Country risk | editorial 0–100 | security zones | + INFORM Risk Index (EC JRC) in Registri | ALTERNATIVE | **PASS** |
| C21 | Directions | Valhalla / OSRM demo | — | FOSSGIS OSRM (car, bike, foot), one route per request, ≤ 1 req/s | ADAPT | **PASS** |
| C22 | ArcGIS import | search + query | — | public ArcGIS Online search (licence shown) + import of ArcGIS-hosted services (≤ 2,000 features) + GeoJSON/CSV files | ADAPT | **PASS**. Services on arbitrary agency servers are blocked: the CSP allows only explicit origins |
| C23 | Crypto | CoinGecko | — | Coinbase public rates (BTC, ETH, SOL) | ALTERNATIVE | **PASS** |
| C24 | Markets: FX, rates, commodities | Yahoo (fake UA, proxy) | NEXUM fuel prices, ECB context | ECB reference rates + 3-month spark; US Treasury yields; Brent/WTI daily (EIA); 20 commodities monthly (World Bank Pink Sheet) | ALTERNATIVE | **PASS** |
| C25 | Equity indices, VIX, single stocks | Yahoo | — | said in the panel | — | **IMPOSSIBLE**: exchange-licensed data with no free public licence; Yahoo forbids automated use |
| C26 | Chain daily brief | DeFiLlama, NVD, OpenSanctions (NC) | — | DeFiLlama incidents (protocols) + KEV + OFAC (official) | ALTERNATIVE | **PASS** |
| C27 | Wallet forensics | mempool, Blockscout… | — | — | — | **IMPOSSIBLE**: tracking of individuals' wallets (personal tracking) |
| C28 | Sanctions | OpenSanctions (CC BY-NC) | — | OFAC SDN official (public domain): entities, vessels, aircraft; persons never | ALTERNATIVE | **PASS** |
| C29 | Precipitation radar | RainViewer (personal/small-scale terms) | — | NASA GPM IMERG (daily) | ALTERNATIVE | **PASS** |
| C30 | AOI tripwire for aircraft/vessels | yes | — | AOI counts NEXUM elements | — | **IMPOSSIBLE** for tracking vehicles (personal tracking); AOI on NEXUM data **PASS** |
| C31 | Supplier risk (SCM) | 14 hard-coded sites | exposure insights (infrastructure near hazards) | unchanged + AOI | REIMPLEMENT | **PASS** |

## D. AI, OSINT, network, tooling

| # | Capability | OSIRIS original | NEXUM BEFORE | NEXUM AFTER | Class | Result |
|---|---|---|---|---|---|---|
| D1 | AI overview / analyze | Gemini (metered key) | — | local LLM in the browser (WebLLM, Qwen2.5 Apache-2.0), opt-in: rewrites only NEXUM's facts; marked as generated | ALTERNATIVE | **PASS** (needs WebGPU; said when absent) |
| D2 | OI forecasting / assist | server engines | — | AI panel questions on the element's facts (hypotheses must be declared) | ALTERNATIVE | **PASS** |
| D3 | DNS | dns.google | — | DoH (Google Public DNS) | ADAPT | **PASS** |
| D4 | WHOIS | rdap.org | — | RDAP (registries and RIRs) | ADAPT | **PASS** |
| D5 | Certificates | crt.sh | — | Cert Spotter CT | ALTERNATIVE | **PASS** |
| D6 | BGP / ASN | ip-api + RIPEstat | — | RIPEstat | ALTERNATIVE | **PASS** |
| D7 | MAC vendor | maclookup API | — | IEEE MA-L registry (published table) | ALTERNATIVE | **PASS** |
| D8 | Shodan InternetDB | yes | — | opt-in, passive | ADAPT | **PASS** |
| D9 | CVE lookup | MITRE + CIRCL | — | MITRE CVE API | ADAPT | **PASS** |
| D10 | Tor exits | Tor list | — | Tor exit list (published table) | ADAPT | **PASS** |
| D11 | Threat feed (AlienVault OTX) | key | — | — | — | **IMPOSSIBLE**: OTX requires an account key |
| D12 | GitHub recon, username/fingerprint search, phone intel, leaks / Hudson Rock, IP sweep, port/vuln scanners, self-track, IP reputation of individuals | yes | — | — | — | **IMPOSSIBLE**: profiling and searching persons, breach data, offensive scanning (GDPR art. 6; c.p. 615-ter, 615-quater, 617-quater; NEXUM-LEGAL-BOUNDARIES) |
| D13 | DonBot / token panel | proprietary promo | — | — | — | **IMPOSSIBLE**: third-party brand and token promotion |
| D14 | stealthFetch | header/IP falsification | — | — | — | **IMPOSSIBLE**: forged headers (NEXUM rule: no bypass, no fake headers) |
| D15 | GitHub webhook relay | server + secret | — | — | — | **IMPOSSIBLE**: needs a hosted server and secret |
| D16 | Polybolos / Lattice SDK | server + key | — | — | — | **IMPOSSIBLE**: needs a hosted server and a third party's keyed platform |
| D17 | MCP server | hosted | — | `python3 -m nexum.mcp <world>`: stdio, read-only tools (search, entity, relations, timeline, evidence, tables) over the local world | REIMPLEMENT | **PASS** |
| D18 | Entity resolution | intel/server.js | NEXUM graph, Wikidata | unchanged (organisations, vessels, aircraft; persons never) | — | **PASS** |
| D19 | Stats / health | routes | status, sources | header counts + status bar | REIMPLEMENT | **PASS** |

## E. SKY (Stowaway capability benchmark)

| # | Capability | NEXUM AFTER | Result |
|---|---|---|---|
| E1 | Sky from an observer | map centre, right-click point, Point panel place search, device position only on request (not stored or sent) | **PASS** |
| E2 | Satellites | CelesTrak OMM, one download per update (each set once per ≥ 2 h); SGP4 in a worker; azimuth, elevation, range; horizon; next passes (rise, culmination, set); time scrub ±12 h with play | **PASS** |
| E3 | Labels | "POSIZIONI CALCOLATE (propagate…), non osservate" with the elements' epoch | **PASS** |
| E4 | LOD / on demand | catalogue downloaded only when orbits, SKY or an orbit card is opened; main objects by default, "Tutti" on request | **PASS** |
| E5 | Sun | NEXUM's own astronomy (same as the illumination) | **PASS** |
| E6 | Aircraft | **BLOCKED** (C1) | **IMPOSSIBLE** |
| E7 | Golden test Parma → SKY | 573 objects above Parma's horizon at 19:03 UTC (329 main ones), Sun at −24° to the west; passes listed per object | **PASS** |

## Gates of the transformation (final build, snapshot `live-345-20261004T210203Z-55efad39`)

| Gate | Baseline (ef651f0) | After | Result |
|---|---|---|---|
| pytest (with P25 required) | 129 | **130** passed (+ MCP) | PASS |
| web (Playwright, incl. O6–O13, U2–U9) | 123 | **132** passed | PASS |
| mobile | 50 | **50** passed | PASS |
| E2E | 23 | **23** passed | PASS |
| unit | 55 | **63** passed (+ geometry, shapes, SGP4) | PASS |
| parity Python ↔ browser | 2,018/2,018 | **1,984/1,984** identical (the sample is data-driven: graph-expansion pages 353 → 319; every other group equal) | PASS |
| Data PRE → POST | — | **0 losses** (`bench/osiris/data_baseline.py compare`) | PASS |
| Semantic regression gate | — | **0 failures** (`bench/osiris/semantic_gate.py`) | PASS |
| O6 initial load | 996,315 B (desktop), 929,622 B (phone) | **991,474 B**, **924,781 B** | PASS (lower) |
| O7 snapshot files | 7,491 | 7,502 (published tables) | PASS (≤ 9,000) |
| O8 pivot cold p95 | 683 ms | 688–701 ms (5 runs); PRE remeasured today: 678–683 ms | PASS (≤ 1,500 ms); **+1.5 %**, see note |
| O9 first search | 5,938 ms | ~5,992 ms; PRE today: 5,944–5,954 ms | PASS (≤ 6,000 ms); **+0.7 %**, see note |
| O9 following p95 (known FAIL) | 1,187 ms | 1,218–1,382 ms; PRE today: 1,201–1,215 ms | FAIL as before; **worse by 1–14 %**, see note |
| Lights (6 files, SHA-256) | — | 6/6 identical | PASS |
| P0 processes | 0 orphans | 0 | PASS |
| CSP | header (1,599 chars) | full policy in `<meta>` (Pages drops header values > 2,000 chars); header keeps frame-ancestors, object-src, base-uri; enforcement verified in the browser | PASS |
| O2 no third-party request without the person's action | PASS | PASS (O3 chain on every viewport with external requests blocked) | PASS |

**Note on O8/O9.** A build with the operational shell disabled measures the same as the full build, and so does a build with the element card eager. The +0.5 to 1.5 % comes from the data: the 570 spacecraft are now searchable NEXUM objects (search index +20 KB gzip, result shards slightly larger). Removing them from the search index brings O8/O9 back exactly to the baseline, at the cost of not finding spacecraft by name. That is Alessandro's choice.
