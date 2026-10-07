# NEXUM — physical acceptance correction pass: report (2026-10-06)

This pass fixes webcams, maritime routes, news (GDELT) and the update notice after the Samsung physical test. It is
**not an acceptance.** Nothing here is "parity" or "complete" until the physical test on the device says so.

- HEAD is unchanged (`ef651f0`). Nothing was committed or pushed, and production and DNS were not touched.
- Deploy target: live-review only.

**BUILD TO VERIFY: `202610061703-izhk`** (shown under ⋯ → "NEXUM · versione in uso: build …", in Info and in Aiuto).

---

## 1. WEBCAM

### OSIRIS — actual behaviour (read in its code; full audit in `scratchpad/research/osiris-webcam.md`)

**Architecture**
- The server builds a catalogue from 48 regional adapters (`src/app/api/cctv/route.ts`).
- The browser loads it once.
- Frames come straight from the operators. The exceptions go through an OSIRIS server proxy: Rijkswaterstaat, Skyline posters, DGT, Taiwan THB, Lithuania, Selangor and TxDOT.

**Map and previews**
- Plain dots with no clustering, names shown from zoom 10. A tap opens the viewer and flies to zoom 13 or more.
- **On-map previews** (`CctvPreviews.tsx`):
  - from zoom 13, at most 8 tiles, at most 4 of them playing video;
  - each tile is joined to its marker by a line, overlapping tiles are skipped, and tiles are clamped inside the screen;
  - JPEGs refresh every 15 s;
  - **every tile is badged "LIVE", snapshots included.**

**Viewer** (`CameraViewer.tsx`)
- A bottom sheet on mobile.
- JPEG refreshes every 5 s; HLS, MP4, MJPEG and iframe embeds also play.
- The label reads "LIVE FEED" or "LIVE SAT-LINK" whenever no load error occurred, with no check of the frame's age.
- Links: the raw feed, and the location on Google Maps.

**Not inheritable** (forbidden by NEXUM's rules)
- `stealthFetch`: random browser User-Agent plus fake `X-Forwarded-For` / `X-Real-IP`.
- Fake Referer/Origin per source (ASFINAG, INDOT, OpenCCTV).
- A hard-coded ASFINAG credential.
- An image proxy that fakes Referer and User-Agent, with **TLS verification off** and redirects that skip its allowlist.
- An official keyed API avoided on purpose (Louisiana).

**Not €0 / static**
- A Node server with proxy and resolve routes.

### NEXUM before (seen in the physical test)
- **Huaraz:** the card said "IMMAGINE ATTUALE · OFFLINE". No image was shown until a second button was pressed.
- **The Telecamere tool:** its previews showed "the first 6 in view", unrelated to the selected camera (Washington, Québec), so they looked like the selected camera's images.
- **Missing actions:** no fullscreen, refresh, locate or nearby list.

### NEXUM after (this pass)

**Viewer of the camera that was tapped** (`ui/src/components/CamViewer.tsx`, lazy)
- It is first in the card, and alone. Its media load **at once**: the tap is the request.
  - Live video plays muted.
  - A current image is shown with the time it was requested, and reloads every 30 s while the card is open and visible.
  - An offline camera shows its **last published image, said "ULTIMA IMMAGINE · non attuale"**, with the source's date and age (Huaraz: 29 Jul 2026, 69 days).
  - A link-only camera shows only the publisher's button.
- **States, in words:**
  - LIVE video, with "IN ONDA" only when frames actually arrive;
  - IMMAGINE CORRENTE, a still image and not a video;
  - IMMAGINE VECCHIA;
  - OFFLINE;
  - SOLO COLLEGAMENTO;
  - diretta non disponibile, in which case the still image is shown instead and called an image.
  - DEAD, BLOCKED, EXTERNAL_LIVE and UNKNOWN wording exists for sources that declare them.
- **Actions:** Aggiorna · Sulla mappa · Schermo intero (an overlay that works on every phone; closed by Back, Esc, × or a tap) · Apri la fonte originale.
- **Shown with it:** place, operator and credit.

**Nearby cameras**
- "**Altre telecamere vicine**" comes after the viewer, separated by a rule, and says "Non sono «X»".
- It lists at most 6 cameras within about 25 km, each with its distance and state.

**Telecamere tool**
- Opening it puts the cameras' marks on the map, with a switch to hide them. It is the same display choice as Filtri; the default map is unchanged.
- **Catalogue vs viewable:** "21.172 telecamere nel catalogo mondiale" and "Visualizzabili in NEXUM: N (LIVE · immagini attuali) · solo collegamento · fuori servizio o vecchie". It also gives the same split for the current view.
- The selected camera is shown first. Other cameras are listed and previewed with their **distance from the map centre**.

**On-map previews** (opt-in, zoom 13 or more)
- At most 8 tiles.
- Each tile is joined to its own mark by a stem, and the focused camera's tile is outlined.
- Overlapping tiles are not drawn, and tiles are drawn only where they fit inside the map. Short screens get smaller tiles.
- A live camera's tile shows its still image, labelled "diretta nella scheda". A still is never called LIVE.
- Refresh at most once a minute. Tapping a tile opens that camera.

**Rules kept**
- No proxy, no copy, no forged header, `referrerpolicy=no-referrer`, and the CSP host list is unchanged.
- Nothing is requested from a publisher before a camera, or the opt-in previews, is opened.

### Sources (catalogue unchanged: **21,172** records, nothing removed)

| state (source-declared) | cameras | sources |
|---|---|---|
| LIVE video (HLS/MJPEG) | 5,214 | Caltrans HLS 2,174 · Taiwan THB MJPEG 2,334 · Iowa DOT HLS 700 · GARR.tv (INGV, CNR-ISMAR) 6 |
| current image | 10,879 | WSDOT, Caltrans, Ontario MTO, DriveBC, HK TD, USGS NIMS, TfL, Fintraffic, Iowa, Vegagerðin, Madrid, Toronto, foto-webcam.eu, Taiwan WRA, Luxembourg CITA, MeteoGalicia, AVO, Lyon, Trentino, Venezia, Genève |
| link only (publisher does not allow images elsewhere) | 4,506 | DGT 1,921 · Open Data Hub Alto Adige 1,338 · Québec 680 · ARPA FVG 208 · Catalunya 159 · WSDOT 75 · Vigo 61 · Euskadi 60 · INGV OE 3 · Parma 1 |
| offline / old | 573 (368 offline · 205 old) | as declared by each source |

**OSIRIS sources that are IMPOSSIBLE for NEXUM as OSIRIS does them**, each for the reason shown:

| sources | reason |
|---|---|
| Rijkswaterstaat, Skyline posters, Lithuania (via proxy), DGT, THB | proxy that fakes the Referer (hotlink protection) |
| ASFINAG | credential plus fake Origin |
| OpenCCTV, INDOT | fake Referer |
| Louisiana | the official API key avoided on purpose |
| MiDrive | refuses the neutral User-Agent |
| 511 Ontario / Alberta | now need a key |

**Not adopted in this pass** (lawful candidates noted, coverage was not the physical failure):

| candidate | note |
|---|---|
| Via Lietuva | reuse with attribution; the frame loads without a Referer |
| Japan MLIT river cameras | terms to be checked |
| Singapore LTA | open data |
| Oregon TripCheck | terms to be checked |
| US IBI-511 states | terms to be checked |
| NZTA | licence still unverifiable |

**€0:** every frame comes from the publisher to the browser, with no NEXUM server.

**Golden tests** (`ui/tests/mobile/golden-pa.spec.ts`, real publishers, no mock; 5 devices)

| test | camera | path checked |
|---|---|---|
| A · LIVE | Etna, GARR | mark → Etna viewer → GARR stream requested → playing in Chrome (WebKit: said "non risponde" if it can't play) |
| B · CURRENT SNAPSHOT | Helsinki Pakila | mark → its own `digitraffic` image only → loaded → timestamp → refresh → fullscreen → nearby after, not containing itself |
| C · LINK ONLY | Parma, Piazza Garibaldi | link only, no image, nothing requested from the publisher |
| D · OFFLINE | Huaraz | OFFLINE → last image "non attuale" with its 2026 date → no other camera's image |
| E · SEVERAL NEARBY | London | nearby by distance; each tile on its own mark (stem geometry), no overlap; tile tap → that camera's viewer |

**PHYSICAL TEST REQUIRED:** Samsung, Fold and iPhone, on real networks.

---

## 2. MARITIME

**OSIRIS has no shipping routes.** Its "Maritime Lines" layer is submarine cables:
- `LayerPanel.tsx:58`, `OsirisMap.tsx:2193`;
- `/api/maritime` serves only aisstream ships (keyed), plus hard-coded ports and 10 chokepoints;
- no searoute/MARNET dependency.

The NEXUM request remains, so a lawful €0 source was found for it.

| layer | source | coverage | what it actually represents | tap → card | data age | licence | €0 | status |
|---|---|---|---|---|---|---|---|---|
| Navi | Digitraffic AIS (Fintraffic) | **Baltic only** (said in the row) | ship positions transmitted by the ships | yes | live (minutes) | CC BY 4.0 | yes | kept |
| **Rotte marittime (NEW)** | **Eurostat SeaRoute / MARNET 50 km** (fixed commit `0d777c0`, 2021-09-08) | worldwide, 15,434 lines | a **network MODEL of navigable sea lanes**: ORNL Global Shipping Lane Network 2000, plus AIS-derived lines around Europe, generalised. **Not observed traffic**: no counts, no dates | yes: what it is, type, canal/strait crossed, section length, period, method, source, licence, "in NEXUM" for straits | base 2000, file 2021 | EUPL-1.2 (repository); the ORNL 2000 original has no explicit licence of its own (residual risk, declared) | yes (one monthly static file, ~165 KB compressed) | **NEW, needs physical test** |
| Porti | IMF PortWatch | 2,000+ ports | daily port calls measured from AIS | yes | daily | CC BY 4.0 (PortWatch terms) | yes | kept |
| Stretti marittimi | IMF PortWatch | 28 chokepoints | daily transits measured from AIS | yes | daily | as above | yes | kept |
| Cavi sottomarini | OpenStreetMap | worldwide | mapped power and telecom cables | yes | weekly extract | ODbL | yes | kept |
| Basi navali | OpenStreetMap | worldwide | naval bases as mapped (name and operator only) | yes | weekly extract | ODbL | yes | kept |

**Candidates rejected or deferred**

| candidate | decision | reason |
|---|---|---|
| newzealandpaul/Shipping-Lanes | rejected | its CC BY, CC BY-SA and CC BY-NC statements conflict |
| World Bank/IMF AIS density, 2015–2021 | deferred | CC BY 4.0, but a 0.5 GB raster; observed density, not lines. A possible later complement, said as density |
| NOAA lanes | deferred | US only |
| EMODnet | deferred | Europe only |
| OSM ferries | deferred | possible later |

No route was invented by joining ports.

**Tests:** `ui/tests/mobile/maritime.spec.ts`, on 5 devices. The six rows are checked. Rotte marittime are switched on, real lines appear in the Mediterranean, and a line is tapped. The card must say "non traffico osservato", give the method, and name Eurostat SeaRoute with eupl-1.2.

---

## 3. NEWS (GDELT)

**RAW GDELT**
- Events export plus, new, the **Mentions export** of the same 15-minute slots.
- Actor **names** are still dropped. Only actor country and role **codes** are kept (government, police, protesters…), with GDELT's counts of sources, articles and mentions, and up to 8 web articles per event.
- The table is now about 630 KB, read only when the layer is turned on.
- The published data was refreshed: the window is now 14:30–15:15 UTC on 2026-10-06. Before, it was two days old.

**GROUPING**
- Rows are one event only when they share the same full CAMEO code, the same place (GDELT feature id), the same actors' codes and the same hour. Before, the key was "action family + place name", which merged different events.
- The card says how many rows were merged and by which rule.

**HUMAN-READABLE EVENT**

| line | content |
|---|---|
| title | the action in Italian, from the CAMEO codebook's own categories (e.g. "Manifestazione", "Visita ospitata") |
| status line | "RIPORTATO DAI MEDIA · non verificato · codifica automatica" |
| sentence | "Evento riportato dai media a <luogo>: <azione>." |
| headline | «title from the article's address», said as such (only when the address carries words) |
| LUOGO, QUANDO | the place; the time in UTC and its age |
| CHI | "roles and countries as GDELT codes them; no name" |
| FONTI | "1 evento · N articoli · M testate", counted from the URLs NEXUM actually has |

Nothing is inferred beyond the codes.

**SOURCE LIST**
- "Mostra le fonti (N)": each outlet with the title from its address, as an external link.

**ORIGINAL LINK**
- "APRI FONTE ORIGINALE ↗" opens a new tab, with the note: "pubblicità, cookie e abbonamenti sono del sito, non di NEXUM". No proxy, no scraping, no bypass.

**TECHNICAL DETAILS** (collapsed)
- CAMEO code and family, quad class, Goldstein, tone, GDELT counts, time added, coordinates, window, dataset and licence, download age, GDELT event ids.

**MAP INTERACTION**
- Pass #5 hit testing is unchanged. One point per grouped event.
- Golden test (5 devices): tap → status → sentence → place → time → counts → codes closed and placed after → sources → original → codes on request.

---

## 4. UPDATE (PWA)

| item | status |
|---|---|
| OLD BUILD | the build running on the device |
| NEW BUILD | 202610061703-izhk |
| DETECTION | version.json is checked on resume, focus, online and every 5 min |
| NOTICE | "Nuova versione disponibile · in uso: OLD · **disponibile: NEW** · AGGIORNA ORA" (new: the available build is named) |
| "serve per aprire questa funzione" | now shown **only** when a part the person opened cannot load. Warm-up failures of the old build no longer say it (the test asserts its absence in the "visible" scenario) |
| MANUAL UPDATE | AGGIORNA ORA checks that the new script is reachable, lets the worker settle, keeps the view, reloads once, then "NEXUM aggiornato · build NEW (prima OLD)" |
| AUTO UPDATE | on resume, when hidden, or after 30 s idle |
| STATE PRESERVATION | localStorage and IndexedDB (Trail) are checked identical, and the camera view is kept |
| OFFLINE | per-build stored page, data worker fallback |
| LOOP GUARD | one attempt per build per session; a build that never arrives does not reload |

---

## 5. Gates

All gates were run on the final code. Snapshot: `live-345-20261006T154158Z-d5cdde10`.

| gate | result |
|---|---|
| web suite | 145 passed and 3 failed in the full run; the 3 were fixed and rerun (below) |
| mobile suite (5 devices) | 117 passed, 3 skipped |
| golden tests (`golden-pa` + `maritime`, 5 devices) | 35/35 |
| U9 | 1/1 |
| E2E | 23/23 |
| unit | 63/63 |
| pytest | 136/136 (P25 strict, W9, W10, W22; 3 new connector tests) |
| auto-update A→B | 4/4 (desktop Chrome, Samsung, Fold, iPhone/WebKit) |
| data comparison | 0 losses against PRE and against MASTER-START |
| semantic gate | 0 failed |
| night lights | 6/6 checksums |
| performance | O6 initial download: desktop 880,380 B (+806 B vs the master pass), phone 813,687 B. O8 p95 684 ms. O9 first p95 5.94 s |

**The 3 web failures**
- Two Pass #5 tests still read the old news field list. The click/tap checks themselves were unchanged. Their helper now reads the same facts (place, GDELT time, code, original link) on the new card.
- The Caltrans live test read the player's state. A stream that doesn't answer now gives way to the still image, so it reads the viewer's state instead.
- After the fixes: Pass #5 golden 4/4 (two repeats), Caltrans 1/1.

**Older tests that encoded "image or video only after a second tap"** were updated to the new requirement (the tap on the camera is the request). Each change is marked "declared change (2026-10-06)" in the test file.

**Real host** (live-review, Samsung Chrome and iPhone WebKit)
- `202610061336-ot88` running → deploy `202610061703-izhk` → the notice in about 1 minute → AGGIORNA ORA → `izhk` running.
- Confirmation shown: "NEXUM aggiornato · build 202610061703-izhk (prima 202610061336-ot88)".
- The local-storage marker and the camera view were kept.
- The new tables are served: `searoutes` (15,434 lines) and `newsevents` with links.
- The `ot88` notice still uses the old wording (no "disponibile: …"), because that wording is drawn by the build already in use. It appears from `izhk` onwards.

## 6. Physical test sequence

1. **Build:** ⋯ → "NEXUM · versione in uso: build **202610061703-izhk**". If an older build is shown: "Nuova versione disponibile" → AGGIORNA ORA.
2. **Webcam LIVE / current image:**
   - open Telecamere: the camera marks appear and the panel shows catalogue vs viewable;
   - zoom on Etna or on Helsinki and tap the mark: the video or image of THAT camera appears at once, with its state, time and actions;
   - try Schermo intero and Back.
3. **Webcam OFFLINE:** search "Huaraz - Blick nach Osten": OFFLINE, its last image marked "non attuale" with its date, then the nearby cameras apart, below.
4. **Rotte marittime:** Strumenti → MARITTIMO → "Rotte marittime" → lines over the Mediterranean → tap one: what it is (a network model, not traffic), method, source, licence.
5. **News:** Livelli → Notizie → tap a point: the event in words, place, time, who (roles), "1 evento · N articoli · M testate" → Mostra le fonti → APRI FONTE ORIGINALE ↗ → Dettagli tecnici closed.
6. **Update:** keep NEXUM open. At the next deploy the notice names both builds, `in uso` and `disponibile` → AGGIORNA ORA → "NEXUM aggiornato".

---

## 7. Rotte marittime — correction after physical test 2 (build 202610061703-izhk: FAIL, "a web")

**The dataset as it really is.** `marnet_plus_50km.gpkg` has 15,498 sections and 7,390 nodes, forming one connected graph.
- Its only attribute is `pass`, which tags 12 canals and straits. There is no traffic, no class and no rank.
- Most nodes have degree 4 or more: it is a routing mesh, not a set of lanes.
- Eurostat's coarser versions (100 km: 9,847 edges) are also meshes, so none gives a hierarchy.
- Drawing every section at once was the error.

**Method: a hierarchy derived from the graph itself.** It is deterministic and implemented in `connectors/searoute_marnet.py`.
- **Main corridors (tier 1, 241 lines):** the union of the model's shortest routes between the world's large ports, from the NGA World Port Index (harbour size L).
  - Ports are kept at least 400 km apart, so a coast with many ports does not weigh more.
  - Routes are traced longest first. A section already chosen costs 0.55 of its length (edge bundling), so routes that would run side by side share one corridor. This is a declared cartographic generalisation.
  - The seasonal Arctic passages are never corridors.
- **Regional corridors (tier 2, 270 lines):** the same method with large and medium ports, at least 150 km apart.
- **Model network (tier 3, 12,675 sections):** the rest.
- No origin, destination, traffic, ship count or frequency is attached to any line; the model has none.

**On the map**

| tier | when drawn | style |
|---|---|---|
| main corridors | at every scale | bright |
| regional corridors | from zoom 3.8 | thin |
| model network | only from zoom 7 | faint and dashed |

At the scale of the physical test (Italy/Mediterranean, zoom about 4.5–5.5) you see the Gibraltar–Suez trunk through Messina, the Tyrrhenian, Adriatic and Aegean branches, and Malta–Libya. The map stays readable with ports, webcams and events.

**Card**
- Title: "Corridoio marittimo principale" or "regionale".
- Status line: "CORRIDOIO MARITTIMO MODELLATO · non traffico osservato".
- Then one plain sentence on what the corridor is, the canal or strait it passes (if any), and "È un modello: … non quante navi ci passano né quando".
- Model, hierarchy, period, line length, the tapped point, licence (with a link to the EUPL text) and source are in **Dettagli tecnici**, closed by default.

**Rotta tra due porti (new).** In Livelli → Marittimo → Rotte marittime, or from a corridor card ("⚓ Calcola una rotta tra due porti").
- Choose a departure port and an arrival port: NEXUM's 2,938 World Port Index ports, found by search.
- NEXUM draws only the model's shortest route between them, computed in the page (Dijkstra on the published network). Nothing is sent and no service is used.
- It gives km and nautical miles, and the canals and straits passed.
- Options: avoid Suez, avoid Panama, allow the Arctic passages.
- It is labelled as the model's shortest route, not an observed route and not a schedule.
- Test: Genova → Shanghai goes via Suez, between 15,000 and 20,000 km. With Suez avoided the route is more than 3,000 km longer and does not pass Suez.

**Licence chain ORNL → Eurostat → NEXUM: CLOSED.** Evidence is in `scratchpad/research/searoute-licence.md`.
- **ORNL:** its CTA Transportation Networks home page states: "CTA also uses customized versions of various waterway, global seaways, airways, and boundary datasets … These datasets are in the public domain." This appears in every capture from 2002 to 2015, for example https://web.archive.org/web/20150910054404/http://www-cta.ornl.gov/transnet/Index.html. ORNL's 2000 documentation (CNETDOC.TXT) describes the seaways network as built for USTRANSCOM's SAIL/JFAST models and joined to ORNL's waterway network.
- **GeoCommons archive** (geoiq/gc_data, dataset 25): its README says datasets are "available under their original license as listed in the metadata or via the Source link". The source link is the ORNL page above. It was also checked that dataset 25 is the ORNL seaway network: its first line starts at ORNL node 805640.
- **Eurostat SeaRoute:** EUPL-1.2, with the Art. 6 warranty of rights for its own additions. Eurostat's general notice: reuse allowed with acknowledgement.
- **NEXUM**
  - the derived file (`api/tables/searoutes.json`) is distributed under EUPL-1.2;
  - the licence text ships as `/licenses/EUPL-1.2.txt`, fetched from the pinned commit;
  - THIRD-PARTY-NOTICES.txt states the chain, "MODIFICATA da NEXUM il 2026-10-06" with what was changed, the pinned source commit, and that no endorsement is implied.
- **Residual caveats, declared:**
  - Eurostat's AIS-derived European additions and its 2021 Arctic lines name no source. They rest on Eurostat's EUPL warranty.
  - An open upstream pull request (#82) would add third-party AIS lines, so NEXUM stays pinned to commit `0d777c0`.
  - Fallback if ever needed: ORNL dataset 25 directly (public domain, routable, coarser).

**Not touched:** webcam, news, auto-update, NEXUM data, SAT, STRADE, illumination and the mobile bottom sheet.

**Seen during testing, not fixed (outside this correction):**
- PortWatch's daily-calls service briefly answered one port (Malamocco) with an empty list. The card correctly said "non disponibili ora", and the service answered normally a minute later.
- The same port card shows "Quota delle importazioni marittime del paese: 214.0 %". The PortWatch share fields are probably already percentages and are multiplied by 100 again. This is a pre-existing display bug, left for your decision.

**BUILD TO VERIFY (correction 2): `202610061916-i12v`.** Snapshot `live-345-20261006T181559Z-8f1d0b82` (it was `live-345-20261006T154158Z-d5cdde10`).

**Gates (correction 2)**

| gate | result |
|---|---|
| maritime (5 devices) | 5/5: corridors drawn at zoom 5 and no network lines; plain card; Genova → Shanghai via Suez; Suez avoided: longer |
| mobile suite | 117 passed, 3 skipped |
| web suite | 147/148. The 1 failure, "small parity items" (live external data), passed on rerun |
| U9 | 1/1 |
| E2E | 23/23 |
| unit | 67/67 (+4 for the route engine) |
| pytest | 137/137, after rephrasing one comment word (W9) and one generic line that coincided with OSIRIS (P25) |
| auto-update | 4/4 devices |
| data comparison | 0 losses ×2 |
| semantic gate | 0 failed |
| night lights | 6/6 |
| O6 | desktop 880,646 B (+266 B) |

**Real host, Samsung Chrome:** build `i12v` running. At Italy, zoom 5, rendered: 11 main corridors, 26 regional, 0 network sections. `/licenses/EUPL-1.2.txt` and the notices with the modification statement are served.

The first deploy attempt failed transiently in wrangler, and the direct retry succeeded. Because of that, this round has no real-host old→new notice proof; that flow was proven twice earlier today (`z1n7 → ot88`, `ot88 → izhk`).

---

## 8. Rotte marittime — visual hierarchy (physical test 3, build 202610061916-i12v: not accepted visually)

**Cause found before changing anything.** The Samsung screenshot shows "Filtri · 1 / Ripristina filtri". The webcams were on the map because the map's category filter still included them. That was introduced in this pass: opening the Telecamere tool added the Webcam category to the map, and it stayed after the tool was closed. So the giant clusters, LIVE badges and legend came from layer **state**, not from styling.

**Fix to the state** (`ui/src/ops/camsmap.ts`)
- The Telecamere tool and the on-map previews bring the webcam marks only while they are in use, and take them away when they end.
- A person's own choice (the switch in the tool, or Filtri) stays.
- The test: open and close the tool, and no webcam remains.

**Routes in the foreground** (presentation only; nothing is turned off and no data changes)
- While Rotte marittime is on, every non-maritime drawn layer is shown faint (webcam groups and LIVE badges, events, places, live alerts, news…), and the webcams' legend is put away. If those layers change their own emphasis meanwhile, the change is respected.
- Kept at full strength: the base map, the night, the focus ring and the maritime layers (ports, chokepoints, cables, naval bases, ships, the computed route).
- A chip says "Rotte in primo piano · il resto attenuato — Mostra tutto".
- Turning routes off (or "Mostra tutto") gives every layer back exactly as it was. The test compares the paint values before and after.

**Hierarchy:** unchanged from section 7 (main corridors always; regional from zoom 3.8; the model's network only from zoom 7).

**Selection**
- One tap = one corridor; the "1 di 3" list of lines crossing at the same spot is gone.
- The tapped corridor is drawn bright and thick over the others, which fade to 40%. It is followed through the junctions along its straightest continuation of the same tier (turns under 35°), so the whole axis stands out (e.g. the Mediterranean trunk), not a 30 km piece.

**Compact card**
- Title "Corridoio principale / regionale". Status "CORRIDOIO MARITTIMO MODELLATO · non traffico osservato", one sentence, the canal or strait if any, and "⚓ Calcola una rotta tra due porti".
- Everything else is inside **"Fonte, metodo e licenza"**, closed by default: the plain note, model, hierarchy, period, line length, tapped point, licence with the EUPL text, source, the record's source line, its freshness, and "not a NEXUM object".
- Height: under 42% of a portrait phone's screen, and at most half of a landscape one.

**Golden physical test reproduced (Samsung size):** webcams on the map, Italy/Mediterranean, routes on → the corridors are the subject and webcams and events are faint → tap → compact card, the corridor stands out → Genova → Shanghai.

**BUILD TO VERIFY (correction 3): `202610062203-cj0k`.** Snapshot unchanged (`live-345-20261006T181559Z-8f1d0b82`); no data changed.

**Gates (correction 3)**

| gate | result |
|---|---|
| maritime + golden (5 devices) | 35/35 |
| mobile suite | 117 passed, 3 skipped |
| web suite | 146/148. The 2 failures were 30 s timeouts in areas not touched (Italy discovery, the O11 trail) and passed on rerun |
| U9 | 1/1 |
| E2E | 23/23 |
| unit | 67/67 |
| pytest | 137/137 (P25, W9) |
| auto-update | 4/4 |
| data comparison | 0 losses ×2 |
| semantic gate | 0 |
| night lights | 6/6 |
| O6 | desktop 880,744 B (+98 B) |

**Real host, Samsung Chrome and iPhone WebKit**
- `i12v` running → deploy `cj0k` → the notice "Nuova versione disponibile · in uso: …i12v · disponibile: …cj0k · AGGIORNA ORA".
- Then "NEXUM aggiornato · build …cj0k (prima …i12v)", with local data kept.
- Then the Webcam category chosen and Rotte marittime on, at Italy zoom 4.3: the focus chip is shown, the webcams' legend is hidden, and the webcam marks are at 0.14 opacity.

---

## 9. Final stabilization (2026-10-07) — layers orthogonal, SeaRoute as an engine

**Physical test failures**
- Webcam ON + routes ON: the webcams "disappeared" while still selected.
- The map slowed down.
- The corridor hierarchy and the "routes in the foreground" focus mode were rejected.

**Causes**

| failure | cause |
|---|---|
| webcams "disappeared" | (a) the focus mode set every non-maritime layer's opacity to 0.12–0.14 and hid the webcams' legend: one layer changing others; (b) the context logic of the Telecamere tool added and removed the Webcam category by itself |
| slowdown | the network was drawn as 4 permanent line layers with up to 13,637 GeoJSON features (30× the normal map), plus a `styledata` handler re-scanning every layer, plus per-tier queries on every map idle |

**Removed entirely (not hidden)**
- Focus mode: the dimming, the chip, the legend hiding and the restore logic.
- The 4 route layers, their source, loader, tier styles, the corridor selection and "one tap one corridor".
- The corridor card (`SeaRouteBody`) and the "Rotte marittime" layer switch (`routes` in the overlay state).
- The webcam context logic (`camsmap.ts`). Webcam marks now depend only on their own switch: "Telecamere sulla mappa", which is the Webcam category in Filtri.
- The connector's tiers and its second World Port Index download.

**SeaRoute is an engine** (`ui/src/ops/searoute.ts`, `SeaRoutePanel.tsx`, `searouteLayer.ts`)
- **Where:** Livelli → Marittimo → "⚓ Rotta marittima tra due porti". The palette opens it there.
- **What it draws:** choose a departure and an arrival port (NGA WPI) → one route is computed in the page → **one line** (one source, one layer, three handlers).
- **ROTTA MODELLATA:** "un percorso calcolato: non una nave osservata, non traffico AIS, nessuna frequenza".
- **What it shows:**
  - departure and arrival ports (they open their NEXUM cards: sources, evidence, Perché?);
  - the canals and straits passed;
  - the events NEXUM documents within 50 km in the period observed, said as "vicinanza geografica, non un rischio né una causa", each opening its own card.
- "Fonte, metodo e licenza" is closed by default.
- Tapping the route reopens its panel. The route survives Livelli being closed.
- **Lifecycle:** "×" sets the state to `none`, removes the source, layer and handlers, and releases the model's graph. No hidden opacity and no leftover state.
- **Connector bug found by the tests and fixed:** sections were joined across a junction where other sections also met, so a canal could be cut off from the sea. Junctions are now kept. Genova → Shanghai: 16,186 km via Suez, Bab el-Mandeb and Malacca; Suez avoided: 25,354 km via Gibraltar; Livorno → Olbia: 287 km.

**Isolation golden tests** (`ui/tests/route-iso.shared.ts`)
- They compare the whole map state before, during and after a route: every layer's visibility, opacities and filter; the sources; the listeners; the categories; the overlay switches; the legend.
- **During a route:** the only difference allowed is the route's one layer, one source and its three layer handlers. MapLibre backs layer handlers with a few listeners of its own; they are gone after closing.
- **After closing, and after 5 routes:** the state must be identical.
- **Cases:** A normal map · B webcams · C events · D webcams + events + news (coexisting and drawn while the route is shown) · E one geometry · F nothing left · G repeated.
- **Devices** (H, I, J):
  - Samsung size (412×860 Chrome);
  - Fold closed and open;
  - iPhone WebKit portrait and landscape;
  - tablet;
  - desktop Chromium and desktop WebKit (Safari engine).

**Performance** (map probe; mobile viewport; CPU throttled 6×; same procedure on both builds)

| | before (`cj0k`) | after |
|---|---|---|
| baseline: map layers / sources / listeners | 43 / 32 / 175 | 39 / 30 / 151 |
| baseline JS heap | 49.8 MB | 43.6 MB |
| GeoJSON features with routes on / a route shown | 13,637 | ~450 (+1 line) |
| after closing | 4 route layers kept, features 451 | layers, sources and listeners back to baseline; heap 42.5 MB after 5 routes (the graph, 82 MB peak while a route is shown, is released) |
| frame time while panning (p50/p95) | 17/17 ms | 17/17 ms |

This Mac does not reproduce the phone's slowdown in frame times (the frame rate is capped at 60 fps). The structural load that the phone paid is what was removed.

**P0 process safety:** `tests/test_worker_lifecycle.py` 6/6 (a worker ends with its parent; a request past its deadline is stopped and the worker replaced; workers closed on a signal). No NEXUM Python process with PPID 1.

**Gates (stabilization, final code).** Snapshot `live-345-20261007T074407Z-a2c4ee9d`. Live-review build **`202610070850-20rb`**.

| gate | result |
|---|---|
| web suite | 150/150 |
| mobile suite | 143 passed, 7 skipped (3 pre-existing, plus the Samsung-size case that runs on one project only) |
| isolation A–H (mobile) | 31/31 |
| isolation J (desktop Chromium + desktop WebKit) | 2/2 |
| U9 | 1/1 |
| E2E | 23/23 |
| unit | 67/67 |
| pytest | 137/137 (P25, W9, W10, W22, connectors, P0 worker lifecycle 6/6) |
| auto-update | 4/4 (desktop Chrome, Samsung, Fold, iPhone/WebKit) |
| data comparison | 0 losses against PRE and against MASTER-START |
| semantic gate | 0 failed |
| night-light hashes | 6/6 |
| O6 initial download | desktop 880,832 B / phone 814,139 B (start of the physical passes: 880,380 / 813,687; +452 B) |
| O8 cold p95 | 673 ms |
| O9 first p95 | 5.94 s |

**Real host** (Samsung Chrome and iPhone WebKit, build `20rb`): webcams chosen, then Livorno → Olbia.
- The webcams stayed drawn (7 and 8 marks in view), and the only route layer was `ops-searoute`.
- Every other layer was unchanged while the route was shown and identical after closing it.
- No route layer or source was left behind.

**The 3-hour stall during this pass (process, not NEXUM)**
- **Cause:** several of my waiting shells used `until ! pgrep -f '<pattern>'`. `pgrep -f` matches the waiting shell's own command line, which contains that pattern, so the condition could never become true.
- **What was waiting:** the build/test chain queued behind one of them never started, and two others were left over from earlier passes.
- **Nothing hung in NEXUM, its tests or its data.**
- **What I did:**
  - the 6 waiting shells were identified and terminated: they were wait loops only, no build or test;
  - the long-lived local test servers were left running;
  - the work resumed from the finished snapshot;
  - from then on, waits use file markers with time limits.
