# NEXUM — OSIRIS TRANSFORMATION PLAN (2026-10-07)

**Baseline:**
- NEXUM `e2b17d0d9ef3a4c6cda780b567abdd5b7787b48e`.
- Production `202610071322-z68u` on https://nexum.pezzalihub.app/.
- Verified backup: `~/NEXUM-BACKUPS/20261007T134641Z/`.

**OSIRIS audited:** OSIRIS-REFERENCE `7a3daec4`.

**Full matrix:** `NEXUM-OSIRIS-FULL-GAP-AUDIT.md`.
- 612 rows, every one with OSIRIS `file:line`, its NEXUM equivalent and the 12 required columns.

**Data baseline:**
- Before the transformation: `NEXUM-PRE-OSIRIS-DATA-BASELINE.md`, with its JSON twin `bench/osiris/baseline-PRE.json`.
- The 2026-10-04 baseline is kept as `bench/osiris/*-20261004.*`.

**Status:** this is a plan. No product code, data, deployment or configuration has been changed.

---

## 1. Complete OSIRIS inventory

| Area | What was read (all of it, by the part responsible) | Rows |
|---|---|---|
| Shell, map, search, PWA, SDK | `page.tsx` (every control and mobile tab), `layout.tsx`, `globals.css`, docs and privacy pages, the 12 shell components, the shell parts of `OsirisMap.tsx` and `LayerPanel.tsx`, `map-*`/`terrain-*`/style libraries, `geo`/`reverse`/`geosearch`/`proxy-tiles`/`health`/`stats`/`github-webhook`/SDK routes, `src/lib/sdk`, `public/`, `tools/` | 114 |
| Thematic layers, space, aviation, environment | `LayerPanel.tsx` (every toggle), every thematic source, layer and popup in `OsirisMap.tsx`, `SpaceCam`, `SatelliteCard`, `FlightWatchPanel`, `orbit`, `satellite-layer`, `satellite-programs`, `airports`; the routes satellites, orbit, space-weather, sentinel, radar, weather, air-quality, fires, earthquakes, aircraft, flights, flight-route | 64 |
| Alerts, news, intelligence, AI, markets, chain | `LiveAlerts`, `alert-digest`, `alert-places`, `IntelFeed`, `LiveNewsPreviews`, `AiOverview`, `ai-engine` and the 3 AI routes; news, live-news, gdelt, gdelt-events, conflicts, frontlines, country-risk, region-dossier, entity/expand, cloudflare-radar; `telegram`, `youtube`; markets (+history), `MarketsPanel`, `MarketChart`, crypto, `ScmPanel` and scm-suppliers, `ChainBrief`, `chainFeeds`, `chainIntel`, chain/daily, `sanctions` | 135 |
| Routing, navigation, drawing, AOI, watch, maritime, infrastructure, discovery and import | `DirectionsBar`, `NavigationView`, `navigation`, the directions route, `nominatim`; `DrawHud`, `DrawingToolbar`, `draw`, `aoi`, `aoi-export`, `watch`; maritime and infrastructure routes and their map layers; `ArcGISPanel` and the arcgis route | 124 |
| OSINT, cyber, intel server, backend | `OsintPanel` (every tab), `FingerprintSearch`, `fingerprint`, `sherlock`, `sanctions`, `c2-indicators`, `malware-intel`, `malware-live`; all 19 osint routes, scanner and sweep, the cyber, malware and crypto routes; `ssrf-guard`, `stealthFetch`, `httpJson`, `fetch-pool`, `sourceCache`, `osint-utils`; `intel/server.js` (776 lines), `engine/` | 35 |
| CCTV and webcams | `CameraViewer`, `CctvPreviews`, the CCTV layers of `OsirisMap`, `camera-catalog`, `camera-feed`, `camera-preview`, `cctv-snapshot`, `skyline`, `youtube`, `map-tile-layout`, `bulgaria-sources`; **all 70 files under `api/cctv/`** (47 adapters, 18 tests, 5 routes) | 140 |
| **Total** | **≈ 290 OSIRIS files read** | **612** |

**Leftovers.** No OSIRIS component, route or library is left unclassified.
- Dead code is listed in each part rather than ignored. It includes `globalStats`, `demoMode`, `UptimeClock`, the unrendered `ScmPanel`, routes with no consumer, the simulated SDK, the empty satellite-AIS fallback, and the GPS-jamming estimate that is computed but never drawn.
- `WorldRemote` (a Bluetooth device-reconnaissance console) is classified in row S84.

## 2. Gap matrix

The complete matrix is `NEXUM-OSIRIS-FULL-GAP-AUDIT.md`, 612 rows. Totals counted from the tables:

| Classification | As permitted by the licence | Under NEXUM Option A |
|---|---|---|
| REUSE | 48 | 0 |
| ADAPT | 67 | 0 |
| REIMPLEMENT | 361 | **476** |
| ALTERNATIVE | 83 | **83** |
| IMPOSSIBLE | 53 | **53** |

Many REIMPLEMENT rows are **already implemented in NEXUM**, by the 2026-10-04/06 transformation passes; each row says so in "NEXUM current equivalent".

**What OSIRIS has that NEXUM still lacks** (the real functional gaps, from the matrix):

| # | Gap | Rows |
|---|---|---|
| 1 | **Air traffic**: everything, from live aircraft by category and popups to airframe identity, the watch panel, the flown track and airport markers | AV-*; see §8 and decision D2 |
| 2 | **Live Alerts depth**: per-source counts, totals, categories, search, geographic filter, severity, urgency, expiry, grouping, readable cards, map↔card, summaries | P3-001…; NEXUM has a GDELT marker layer and an alerts list, which the matrix does not count as equivalent |
| 3 | **News freshness**: NEXUM shows the last hour of GDELT frozen at each 6-hourly snapshot, OSIRIS refreshes every 3–5 minutes; no real headlines or outlet names (NEXUM shows the CAMEO action and URL-derived titles) | P3 top gaps 1–2; decisions D5 and D7 |
| 4 | **3D satellites**: OSIRIS draws them at a compressed altitude with picking and an orbit line in 3D, NEXUM draws them on the ground; catalogue 23 CelesTrak sets against about 45 | SP-01, SP-07, SP-08, SP-11 |
| 5 | **A top-level place search** with coordinate input, keyboard navigation and zoom by result type | S82, S91 |
| 6 | **Turn-by-turn navigation**: progress, ETA, a correct off-route test, the position dot and a follow/heading-up camera | N-02, N-03, R-31, R-10, R-11, N-10 |
| 7 | **Webcam sources NEXUM could lawfully add** | Part 6 R-rows |
| 8 | **Markets depth** | P3 markets rows |
| 9 | **Smaller shell items** | S39, S52, S60, S34, S43, S01, S40, S57, S66–S73 |
| 10 | **Other** | A-01, X-10/X-08, I-01, the cyber registers, SP and HZ rows |

Details for item 7:
- MLIT river cameras (Japan, PDL1.0);
- Lithuania (link-only first);
- public-body YouTube channels instead of Skyline wrappers;
- TfL JamCam clips (a new `mp4` type);
- preview placed below its mark near the top edge, labels at high zoom, weekly dead-page checks, a guard against a partial fetch shrinking a source, cross-source de-duplication.

Details for item 8:
- section tabs, a dollar index (Fed H.10), daily gas (EIA), XRP, daily FX change, breadth, sorting, an interactive chart, crypto intraday.

Details for item 9:
- an error boundary, terrain gating and status, a camera pad, a scale bar on phones, a resize observer, a splash keyed to the first draw, a WebGL fallback, a navigation follow-camera, Style Studio depth.

Details for item 10:
- "what is inside" an area should include the operational overlays (A-01);
- ArcGIS layer discovery (`layers[0]`) and the host limit (X-10, X-08);
- a nuclear-specific view (I-01);
- outages via OONI/IODA and CVE enrichment (EPSS, CIRCL) in the cyber registers;
- Sentinel-1 scene search, magnitude labels on earthquakes, the lower GDACS/NWS levels.

**Where NEXUM is already ahead** (stated by the auditors in code):
- honest LIVE / IN ONDA and image states;
- the Kp forecast, NOAA scales and aurora, passes and sky view, positions recomputed every 3 seconds;
- NRT / LATEST / HISTORICAL imagery labels, official-only video channels;
- Taiwan THB as live MJPEG, where OSIRIS shows proxied stills;
- lawful OSINT (DNS, RDAP, CT, RIPE, passive InternetDB, IEEE OUI, Tor exits, CVE, KEV, OFAC entities, DeFi incidents);
- a modelled sea route that is said to be modelled;
- the graph: Evidence, WHY, Timeline, Trail.

## 3. Licence and cost audit (summary; every source is detailed in its row)

**Code:** OSIRIS is MIT. Since decision D1 (2026-10-07) reuse and adaptation are allowed, with the MIT licence, copyright and notices kept.

**Data, API, tile, image, video and stream rights** were audited per provider, separately from the code. Providers that fail NEXUM's constraints:

| Provider or practice (in OSIRIS) | Why it fails | NEXUM position |
|---|---|---|
| `stealthFetch`: fake residential `X-Forwarded-For`/`X-Real-IP`, random browser User-Agents | header forgery is prohibited (NEXUM-LEGAL-BOUNDARIES) | IMPOSSIBLE; NEXUM's single honest User-Agent stays |
| `/api/cctv/proxy`: forged UA and Referer, **TLS off**, redirects not re-checked, frames re-served with `ACAO:*` | bypasses hotlink protection; insecure | IMPOSSIBLE; those sources become LINK_ONLY |
| CARTO basemaps | the CartoDB README now says an API key is required; OSIRIS proxies without one | ALTERNATIVE: OpenFreeMap (in NEXUM) |
| Esri World Imagery | needs an account and attribution | ALTERNATIVE: EOX S2 cloudless 2016 (CC BY 4.0) and NASA GIBS (in NEXUM) |
| ip-api.com IP geolocation | "strictly non-commercial", http, sends the visitor's IP to third parties | rejected; NEXUM never geolocates the visitor by IP |
| Nominatim during type-ahead (OSIRIS) | the policy forbids client-side autocomplete | NEXUM does not call it; a top-level search uses NEXUM's own place index (§9) |
| Public OSRM demo | "Access … shall be withdrawn at any time" | not used |
| FOSSGIS Valhalla and OSRM (NEXUM's routing today) | best-effort, 1 request/s per application, "operator email must be identifiable", "URLs should not be hard-coded", no guarantee | keep as best-effort with fixes; decision D3 |
| GraphHopper, OpenRouteService | key; non-commercial and credit limits | not used |
| aisstream.io (global AIS) | key, server, no SLA; browser use forbidden | IMPOSSIBLE globally; NEXUM keeps Digitraffic Baltic (CC BY 4.0) |
| OpenSky | CORS limited to its own origin; OAuth credentials can't sit in a public bundle | not usable from a static PWA |
| adsb.fi | "personal, non-commercial only" | not usable |
| airplanes.live | 403 | not usable |
| **ADSB.lol** | data ODbL 1.0, code BSD-3, "dynamic" limits, a key "in the future" for feeders; no browser CORS seen | the only lawful route, via a NEXUM-run relay; decision D2 |
| Gemini (OSIRIS AI) | "Paid Services" only for apps serving EEA users | ALTERNATIVE: NEXUM's in-browser WebLLM (Qwen2.5, Apache-2.0, opt-in) |
| Telegram scraping | the ToS "prohibits data scraping" | IMPOSSIBLE |
| Yahoo Finance | the ToS bans automated collection; exchange-licensed prices | ALTERNATIVE: ECB, FRED, EIA, World Bank; IMPOSSIBLE for equities, futures, VIX, intraday |
| OpenSanctions, Cloudflare Radar | CC BY-NC 4.0, and Radar needs a token | ALTERNATIVE: official OFAC SDN (public domain, in NEXUM); OONI (CC BY) and IODA for outages |
| DeepState frontlines | no licence or terms published | IMPOSSIBLE until a licensed source exists |
| TeleGeography cable map | licence page 404, likely non-commercial | ALTERNATIVE: OSM cables (ODbL, in NEXUM) |
| Webcam sources needing keys, forged headers or forbidden by their terms | IBI-511 states, Alberta, NSW, INDOT, MiDrive, ASFINAG, OpenCCTV ("no scraping"), NZTA ("personal use"), Rijkswaterstaat (Referer), Skyline posters ("no reproduction") | IMPOSSIBLE (evidence in Part 6) |

**Cost.** Every capability in the plan runs on the existing static PWA, the published snapshot, or a direct, on-request browser request to a provider whose terms allow it.
- **Exception, aircraft (D2):** a relay NEXUM would run on Cloudflare's free tier. No card is involved: the free plan stops when its limit is reached rather than billing.
- **Exception, news freshness (D7):** a scheduled job on GitHub Actions (free for public repositories) that updates small tables.

Neither exception is adopted without your decision.

## 4. REUSE (48 rows — legally reusable, but excluded by Option A)

Mostly in Part 2, where the MIT licence permits reusing the layer, orbit and popup code, and Part 3 (8 rows). Under Option A every one becomes REIMPLEMENT: NEXUM writes its own code, informed by what the OSIRIS code does.

## 5. ADAPT (67 rows)

Parts 3 (54: Live Alerts, digest, place extraction, markets UI patterns), 1 (5), 2 (3), 4 (4) and 6 (1, preview flip-below placement). Same Option A rule: reimplemented.

## 6. REIMPLEMENT (476 under Option A)

Grouped by wave in §14. Rows already done in NEXUM keep their existing tests as acceptance.

## 7. ALTERNATIVE (83 rows)

**Main substitutions** (each row names the licence and gives evidence):
- OpenFreeMap for CARTO;
- EOX and GIBS for Esri imagery;
- NEXUM's place index for ip-api and Nominatim;
- WebLLM for Gemini;
- ECB, FRED, EIA and World Bank for Yahoo;
- OFAC public domain for OpenSanctions;
- OONI and IODA for Cloudflare Radar;
- OSM for TeleGeography cables;
- Digitraffic AIS (Baltic) and IMF PortWatch for global AIS-derived port data;
- the IEEE OUI register for maclookup;
- Feodo C2 (pending licence, D4);
- honest webcam states for OSIRIS's misleading LIVE / "SAT-LINK" / "RECORDING" labels;
- NEXUM's own `live_stream?channel=` YouTube embed for scraped channel pages.

## 8. IMPOSSIBLE (53 rows), with evidence

| Group | Rows | Evidence (quoted or cited in the row) |
|---|---|---|
| Device reconnaissance | S84 WorldRemote (Bluetooth device recon, localhost probing) | NEXUM legal boundaries: no device intrusion, no surveillance of nearby devices or people; declared in the 2026-10-04 matrix |
| Active scanning of third-party hosts | P5-01 port scan, P5-02 vulnerability sweep, P5-06 IP sweep, P5-10 SSL/TLS probe, P5-12 headers, P5-13 technology detection | unauthorised probing is an intrusion offence (IT c.p. 615-ter/615-quater); it needs a keyed paid backend; a browser can't read cross-origin headers. The passive, lawful halves (CT, CVE, InternetDB) are kept |
| Person-centric OSINT | P5-14 username enumeration, P5-15 GitHub recon, P5-16 phone intel, P5-17 fingerprint console, P5-18 breach corpora, P3-100 person entity expansion, AV-10 registered owners | GDPR art. 5, 6 and 9; NEXUM-LEGAL-BOUNDARIES ("nessun oggetto persona fisica", "nessuna ricerca per persona", "profilazione di persone") |
| Tracking of individuals | P3-135 / P5-20 wallet tracking, W-02 named enter/exit tripwire | NEXUM-LEGAL-BOUNDARIES: no tracking of individuals' wallets or transactions; no-surveillance rule, `Panels.tsx:294`. Anonymous counts (W-05) are the lawful substitute |
| Header forgery and proxy bypass | XX-01 / P5-28 `stealthFetch`, S10 CCTV proxy | forging headers is prohibited; TLS off. The sources concerned become LINK_ONLY |
| Military command and control | P5-34 SDK ingest/stream ("Lattice"/"Polybolos") | outside lawful open data; a named commercial military product. OSIRIS's SDK is in any case simulated |
| Terms forbid it | P3-029, P3-030, P3-049 Telegram; P3-104, P3-107, P3-123 equities, futures, VIX, intraday; R53 OpenCCTV; R29a Skyline posters; R43 NZTA | quoted terms (Telegram "prohibits data scraping"; Yahoo "any automated means"; OpenCCTV no scraping or bulk download; Skyline no reproduction; NZTA personal use) |
| No licence published | P3-095 DeepState frontlines; AV-12 scheduled routes (adsbdb restricts route data; airplanes.live 403); R04 Ottawa | no redistribution permission found; to re-check (legal list) |
| Needs a key, forged header or credential | R09 Alberta, R28 NSW, R40, R49, R50, R51 (IBI-511 states), R46 TripCheck, R47 MiDrive, R48 INDOT, R17 ASFINAG, R16 Rijkswaterstaat, R58 Windy | per row: developer key, forged Referer or browser UA, hard-coded credential, or Referer-gated frames |
| Not possible without a server | G-03 a Nominatim budget shared across users | a static PWA has no request-time server; NEXUM's offline place index replaces it |
| Empty or dead upstream | M-17 satellite-AIS fallback (empty function), R12 IDOT (no cameras), R07 Montréal (endpoint now HTML), R22 free-webcambg (empty and http-only), C44 Skyline offline banner | the code itself or a probe |
| Law-enforcement cameras | R13 Butler County Sheriff | NEXUM excludes police and enforcement cameras (`NEXUM-SOURCES-LIVE.md:94`); no-surveillance rule |

**Re-checks.** Ottawa (R04), Montréal (R07), NZTA (R43), Rijkswaterstaat (R16), NSW (R28) and DeepState (P3-095) are IMPOSSIBLE **today**. Each has a named re-check on the legal list: an open-data licence or a written permission would move it to LINK_ONLY or ALTERNATIVE.

## 9. Proposed final architecture

**Unchanged foundations:**
- the Core (Objects, Relations, Events, Evidence, Claims, Provenance, deterministic IDs, WHY);
- the static snapshot;
- the PWA with auto-update and offline;
- the source registry and legal gates;
- the P0 process lifecycle;
- the views: Map, Graph, Timeline, Search, Trail, Country View, World Intelligence.

**The operational surface** (`ui/src/ops`) grows into a tool rail plus mobile bottom navigation, each tool a lazy module. Each tool owns only its own sources, layers, handlers and state, and leaves nothing behind when closed, as the sea route already does. The planned tools:
- **Cerca:** a top-level search over places, NEXUM elements, coordinates and categories, from NEXUM's index;
- **Livelli:** grouped and orthogonal; no layer changes another;
- **Allerte:** the full Live Alerts depth;
- **Notizie:** reported news with outlets and headlines (subject to D5/D7);
- **Spazio:** 3D satellites, sky / above me for any place or object, imagery;
- **Aria:** aircraft, if D2 is approved;
- **Marittimo:** observed AIS, reported port data, modelled sea route, static infrastructure, always labelled;
- **Percorso:** road and walking routes with navigation;
- **Disegna / Area:** drawing, AOI, "what is inside" including the overlays, anonymous counts;
- **Telecamere:** the existing viewer and states, plus the lawful new sources;
- **Mercati;**
- **Registri:** the cyber and sanctions registers;
- **Importa:** ArcGIS discovery with a strict licence gate;
- **Stile;**
- **Aiuto, Privacy.**

**Two delivery channels:**
1. The **static snapshot** (6 h / 24 h / weekly; unchanged) for the world model.
2. *(Decision D7)* a small **"live tables" channel**: a scheduled job that refreshes only small tables (news, hotspots, official alerts) every 15–30 minutes, as static files. No request-time server.

**Live per-request data** stays browser-to-provider, on request, only where the provider's terms and CORS allow it. The current examples are USGS, NWS, GDACS (licence check pending), PortWatch, Digitraffic and FOSSGIS. Aircraft would need the D2 relay.

## 10. Integration with Objects, Relations and Events

Every new capability feeds the NEXUM model where it is semantically sound. Transient data stays as labelled table rows and is never invented into objects.

| From | Integrated as |
|---|---|
| Official alerts (USGS, NWS, GDACS, EONET) | **Events** at snapshot time, with Evidence and Provenance, linked by rules to Country, Place and Infrastructure. The live layers keep showing the freshest items as reported rows |
| News (GDELT) | **reported** rows linked to Place and Country (nearness, never causality); kept distinct from NEXUM Events; clusters and threads deterministic |
| Airports | already **Objects**. Aircraft are transient: never Objects, never stored; a card links to the airport, country and nearby events |
| Satellites | the 570 notable spacecraft are **Objects** (in NEXUM); positions are computed and labelled; sky / above me starts from any Place or Object |
| Webcams | **Objects** with place, country and nearby events (as today); new sources go through the same connector, licence gate and states |
| Infrastructure (ports, power, pipelines, nuclear sites) | **Objects**; "what is inside" an area and the sea route list their NEXUM relations |
| Registers (sanctions entities, CVE/KEV, C2 lists) | **Objects/Claims** of non-personal entities only |

Each new map element follows VEDO → TOCCO → CAPISCO → VERIFICO LA FONTE → ESPLORO LE RELAZIONI: a card with what, where, when, source, age, original link and the NEXUM element (Evidence, WHY, Graph, Timeline) when one exists. No missing field is invented.

## 11. Performance strategy, desktop and mobile

- **Loading:** every tool and data table is lazy and loaded on request. Nothing new loads at start; the initial download budget O6 is kept (desktop 881 KB today).
- **Drawing:** viewport queries, clustering (as for webcams), LOD and zoom thresholds. No global geometry is drawn when it isn't needed; the 13,000-line network lesson is enforced by the isolation tests.
- **Satellites in 3D:** computed in a worker (as today); drawn only for the selected groups; LOD by zoom.
- **Aircraft (if D2):** requests bounded to the viewport, 30–60 s cache at the relay, clustering at low zoom.
- **Bounded growth:** graph expansion stays bounded, Timeline uses windows, Search is paginated.
- **Gates:** the layer-independence and lifecycle tests are extended to every new tool (map state, sources, layers and listeners identical after closing; repeated use leaves nothing behind). The performance probe (layers, sources, GeoJSON features, listeners, heap, long tasks, frame time) runs on mobile size with CPU throttling, before and after each wave.

## 12. Test plan

- **Existing suites, all kept and gating:**
  - web, mobile on 5 devices, U9, E2E, unit, pytest including P25, W9, W10 and P0;
  - auto-update A→B, the golden tests (webcam A–E, news, maritime, sea route, country ring);
  - the isolation tests A–J;
  - data comparison (0 losses), semantic gate, night-light checksums;
  - O6, O8, O9 performance.
- **New per capability:** the acceptance criterion of its matrix row, including mobile and a tap test (VISIBLE → TAP → EXPLANATION → SOURCE).
- **Semantic acceptance paths (§26), as end-to-end tests:**
  - Country → indicators → energy → infrastructure → events → webcams → satellite → government and security;
  - Event → place → infrastructure → nearby population → webcam → satellite → evidence;
  - Infrastructure → country → energy → nearby events;
  - Webcam → place → country → nearby events;
  - Relation → Evidence;
  - Object/Event → Timeline;
  - map element → Object/Event → source → Graph/Timeline.
- **Golden Country test (Italy):** immediate access to everything §27 lists, measured as the number of taps from selecting Italy. It must not exceed today's count for any item.
- **Real hosts and live sources:** tested on live-review, never on production, before any release.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Scope: 612 rows, about 480 to (re)implement | waves (§14), each gated and validated on live-review; nothing reaches production without your release decision |
| UI complexity hides NEXUM's data (§7, §27) | Italy golden test; progressive disclosure; tap counts measured |
| Provider terms change or best-effort services degrade (FOSSGIS, ADSB.lol, CelesTrak, GDELT) | runtime-switchable provider list; honest "non disponibile ora"; kill switches; no hard-coded single dependency |
| Performance regressions on real phones | isolation and performance gates per wave; lazy tools; the network lesson |
| Legal items still open (§ legal list) | nothing on the list is built before it is resolved |
| Option A: reimplementing about 115 rows the MIT licence would allow copying | more work, but authorship stays clean and P25/W10 stay strict (decision D1) |
| A server component (D2 relay, D7 job) changes NEXUM's static-only model | only with your decision; free plan without card, hard limits, kill switch |

## 14. Implementation order (waves; each wave = implement → test → correct → retest → live-review)

1. **Compliance and robustness**, found by the audit:
   - map attribution for every visible tile provider (S33);
   - a strict ArcGIS licence gate that rejects proprietary licences such as the "Esri Master License Agreement" (X-11);
   - routing layers removed, not just emptied, on close (R-01);
   - an error boundary (S39);
   - the incorrect ADSB.lol note in `ops.json` fixed;
   - routing providers in a switchable list;
   - routing request pacing per application.
2. **Shell and search:**
   - top-level search (S82, S91);
   - scale bar on phones, resize observer, terrain gating, status and retry, camera pad;
   - splash keyed to the first draw, WebGL fallback;
   - Style Studio depth;
   - Aiuto and privacy pages.
3. **Live Alerts and news:**
   - the full alerts depth: counts, categories, search, geographic filter, severity, urgency, expiry, grouping, cards, map↔card, Evidence/WHY for official alerts as Events;
   - precision labels;
   - deterministic clusters and briefs;
   - a WebLLM alerts mode;
   - headlines and freshness after D5 and D7.
4. **Space:**
   - 3D satellites with altitude, picking and orbit line;
   - catalogue breadth (CelesTrak sets, after a terms check);
   - sky / above me for any place or object;
   - Sentinel-1 scene search;
   - hotspot freshness.
5. **Routing, navigation, area tools:**
   - navigation: progress, ETA, off-route, position dot, follow;
   - "what is inside" including the overlays;
   - ArcGIS layer discovery;
   - nuclear view;
   - drawing keyboard support;
   - the sea route kept as it is.
6. **Webcams:**
   - new lawful sources: MLIT, Lithuania as links, public-body YouTube channels;
   - TfL clips (`mp4`);
   - preview placement, labels, dead-page checks, fetch guard, de-duplication.
7. **Markets and registers:**
   - market tabs, H.10, EIA, FX change, charts;
   - OONI/IODA outages, EPSS and CIRCL, CT subdomains;
   - Feodo/URLhaus after D4.
8. **Aircraft:** IMPOSSIBLE TODAY — RECHECK (D2: relay not approved); built only when a legal, card-free, relay-free, permanently-€0 source exists.
9. **Final acceptance:**
   - POST data baseline;
   - the final acceptance matrix (OSIRIS ORIGINAL | NEXUM BEFORE | NEXUM AFTER | CLASSIFICATION | SOURCE/LICENSE | €0 VERIFIED | MOBILE | INTERACTABLE | NEXUM GRAPH INTEGRATED | TEST RESULT);
   - live-review, then your release decision.

## Decisions of the author (2026-10-07)

- **D1 — MIT code: DECIDED.** "Zero OSIRIS code" is superseded. OSIRIS code that is actually MIT may be reused or adapted, with every required licence, copyright and notice kept; third-party code is never attributed to Alessandro Pezzali (sole author of NEXUM's original code); no false Co-authored-by; no artificial re-implementation only to avoid reuse. Code only: data, APIs, tiles, images, video, streams, assets and services keep their own audit. The matrix is updated (column "Final (D1 2026-10-07; D2, D4)").
- **D2 — Aircraft: relay NOT approved.** Classified IMPOSSIBLE TODAY — RECHECK. Research for a legal, card-free, relay-free, permanently-€0 source continues; aircraft are not abandoned.
- **D3 — Routing: APPROVED, condition met.** The FOSSGIS terms say: "For websites, an email address of the operator must be easily identifiable and directly reachable". The operator contact chosen by the author is `pezzaliapp@gmail.com`. It is published as a mailto link in the status bar, Info, the route panel and Aiuto. It is never sent in any request and never tied to users. No address, alias, account or DNS change was created.
- **D4 — abuse.ch: NOT USED.** IMPOSSIBLE TODAY / LEGAL CLARIFICATION REQUIRED; the provider is not contacted.
- **D5 — Headlines: APPROVED for Wave 3, within the verified limits only.** GKG `PAGE_TITLE` only, the publisher's original short title, labelled "Titolo dell'editore (via GDELT)", with a link to the original and the GDELT citation. No description or snippet, thumbnail, article body or article fetch without a new specific verification.
- **D6 — GDACS: direct access SUSPENDED — LICENCE UNCONFIRMED / RECHECK.** No request reaches gdacs.org: the host is out of the CSP and the layer cannot be turned on. The 367 EONET events that mention GDACS are kept unchanged (EONET/NEXUM heritage). JRC is not contacted for now. (Correction: the earlier "404" was a misspelled URL.)
- **D7 — Option A APPROVED:** browser → GDELT → conditional request → on-demand refresh → snapshot fallback. No scheduling, periodic GitHub Action, backend, proxy or relay. The technical gate in a real browser PASSED on 2026-10-07 (Chrome desktop, Android Chrome, iPhone WebKit):
  - CORS `*` on every response;
  - the http:// URLs listed in lastupdate.txt must be rewritten to https;
  - the browser revalidates by itself with 304 (JS must not add If-* headers: the preflight is not supported);
  - `DecompressionStream("deflate-raw")` unpacks the files;
  - about 28 MB per month per user with the layer open 1 hour a day.
- **Wave 1 — APPROVED and closed (2026-10-07).** Commit and push to main are authorised. Production stays on `202610071322-z68u` until a later approval; robots.txt stays `Disallow: /`; no DNS change.

**Wave 1 after the physical tests (2026-10-08, build `202610080854-1f3a` approved by the author):**
- Routing modes, provider refusals, navigation states, the selection (named, its ring answering, ×), the source's own record link, register details, passive network lookups, the floating close and the navigation indicator.
- The local AI overview is replaced by NEXUM's deterministic "Sintesi dei fatti" (decision B): no language model, no download.

**Declared reductions of the data gate (never hidden, the PRE baseline unchanged):**
- `media.hosts.connect` 52 → 51: `api.certspotter.com` removed from the CSP (keyless Cert Spotter is for personal or evaluation use only, L62). Approved by the author on 2026-10-08. Declared in `bench/osiris/declared-reductions.json`; `data_baseline.py compare` prints it as DECLARED, and any other reduction, or a lower value, stays a LOSS.

**Maintenance after Wave 1 (2026-10-08, the author's GO "punti 1 e 2"; not yet committed):**
- Navigation, tested with a simulated GPS (desktop, phone, iPhone/WebKit, Fold/Chrome; Parma → Reggio Emilia and Parma → Modena): fixed the next manoeuvre shown going back to one already passed after every turn (it was the nearest manoeuvre, not the next one along the route), off-route measured to the segments (it used every other vertex), each manoeuvre said once in order (also after a reroute), the departure said without "Tra 0 metri". The real road test stays open.
- `@mlc-ai/web-llm` (and its `loglevel`) removed: `package.json`, lock, licence report. The seven download hosts of the former model removed from the CSP. Declared reduction `media.hosts.connect` −7 (see `declared-reductions.json`, checked by host identity against `e2b17d0`).
- Workflow `nexum-live`: the schedule is off (decision recorded in the file); the job stays runnable by hand and installs `openpyxl`, the cause of every failure since 2026-10-04.

**Open after Wave 1:**
- The real road test of routing and GPS navigation (the author's own test, later).
- D6 (GDACS suspension): implemented and set aside as a patch, not in Wave 1.
- D7 option A and D5 headlines: approved, for Wave 3.

**Tests that depend on an external source (flaky, recorded, never hidden):**
- `tests/web/hotfix.spec.ts` › LIVE 3 (Taiwan Highway Bureau MJPEG). It failed inside the full web suite on z68u (final8) and on Wave 1 (final9, 47.6 s), and passed when run alone (5.0 s). A failure is re-run alone first; it is not a NEXUM regression unless the failure repeats.

## Further legal verification (before building the items concerned)

Consolidated from the six parts (each with its reason in the part):
- **Webcams:** river.go.jp under PDL1.0; eismoinfo (Lithuania) terms; TxDOT reuse; Edmonton datasets; Singapore image host; Québec image terms; Ottawa and Montréal open data; Rijkswaterstaat/NDW positions; NZTA and livetraffic.com; small European operators; the publisher of each YouTube channel; the YouTube terms clause; TfL clips.
- **Air and space:** ADSB.lol from the NEXUM origin in a real browser; OpenSky terms (403 to the auditor); CelesTrak terms for the extra sets.
- **News and markets:** GDACS; GDELT GKG titles; CoinGecko, Coinbase, DefiLlama (403); FRED series notices; OpenRouteService terms.
- **Cyber:** the abuse.ch master versus Feodo terms; Cert Spotter free quota.
- **Other:** TeleGeography (cables); NOAA and other environment providers listed in Part 2.
