# NEXUM — OSIRIS master pass: report (2026-10-06)

The capability matrix is in `NEXUM-OSIRIS-COMPLETE-MATRIX.md` (section A of the requested report). This file holds
sections B to F, plus the backup.

## 0. Backup (done before any change)

| Item | Value |
|---|---|
| Location | `~/NEXUM-BACKUPS/20261006T023111Z/` (outside the working directory) |
| Snapshot | APFS clone of the whole project (tracked, untracked, ignored, data, builds, node_modules) |
| Archive | `NEXUM-20261006T023111Z.tar.gz`, 16 GB, SHA-256 `7bc7336d0a8eff9ee7345a48d382d8df3f38bc82c89e1d3a5643a01a9c19d9ed` |
| Manifest | `files.sha256` (139,272 files), `HEAD.txt` (`ef651f0`), `git-status*.txt`, `working-tree.diff` (+ SHA-256), `branches.txt` |
| Restore test | archive checksum OK → extracted elsewhere → every file identical, same HEAD, same git status, same working-tree diff → `tsc`, `build:web`, `build` OK, Python packages import |
| live-review | deployment `398bf4be` (and the earlier ones) kept by Cloudflare; hash of the deployed tree recorded |

## B. Data preservation

Baselines are written by `bench/osiris/data_baseline.py`:
- `PRE`: the original pre-OSIRIS baseline, kept unchanged.
- `MASTER-START`: this pass's start.
- `POST`: the end. The earlier transformation's POST is kept as `baseline-POST-TRANSFORMATION-20261004.json`.

| Measure | Pass start | Pass end |
|---|---|---|
| objects / events / relations | 142,211 / 16,303 / 162,592 | identical |
| evidence / claims / insights | 351,768 / 1,008,234 / 2,186 | identical |
| countries / settlements with time zone | 242 / 7,339 | identical |
| sources | 79 | 81 (+ `osm.cables`, `osm.navalbases`) |
| webcams | 21,172 (current_snapshot 10,879 · live_stream 5,214 · link_only 4,506 · offline 368 · stale 205) | identical |
| security zones | 201 | identical |
| energy flow relations | 1,266 | identical |
| published tables | 9 | 11 (+ `cables` 10,320 · `navalbases` 509) |

- **Loss check:** 0 losses against `MASTER-START` and 0 against the original `PRE`.
- **Semantic regression gate:** 0 failures (country → indicators/energy/infrastructure/webcams/events/government/
  security, event → place/infrastructure/population/webcam/satellite/evidence, relation → evidence, timeline).
- **Accessibility unchanged:** Italy Country View golden tests and the Parma/Etna/STRADE goldens pass. Nothing was
  removed from the left rail, Country View, Graph, Timeline, Search, Evidence/WHY or the trail.

## C. Legal / €0 report (new sources and services of this pass)

| Source or service | Use | Terms read | Cost | Privacy / cyber |
|---|---|---|---|---|
| USGS earthquake feed (2.5_day) | live layer and list, on request | US public domain | €0, keyless | no personal data |
| GDACS event list, NWS alerts | live layers (were list only) | GDACS terms (display, not imported); NWS public domain | €0 | — |
| FOSSGIS Valhalla (`valhalla1.openstreetmap.de`) | routes, alternatives, elevation | FOSSGIS terms read 2026-10-06: fair use, ≤ 1 request/s, OSM attribution + "report an error" link, valid origin; commercial use only if not substantial; high-traffic sites not permitted | €0 | NEXUM sends only its site origin to FOSSGIS (never a path or anything about the person) |
| OpenStreetMap via Overpass (one global query per week, at build time) | cables, naval bases | ODbL 1.0 (attribution, share-alike of the extract); FOSSGIS fair use | €0 | naval bases: name and operator only |
| IMF PortWatch (ArcGIS public services) | chokepoints, ports, daily transits and port calls | IMF terms: "Users may download, extract, copy, create derivative works, publish, distribute, and use Data… with attribution to the IMF"; commercial reuse needs IMF permission | €0 | aggregates, no vessel identities |
| ArcGIS Online search with `bbox` | dataset discovery | each item's declared licence shown; items without a licence are not importable | €0 | — |
| N2YO, CelesTrak, X, LinkedIn, Reddit | plain links | opened only when the person taps | €0 | nothing is sent before the tap |

**Removed:** the browser no longer contacts Overpass. The cables are now NEXUM's own published extract, and Overpass is
gone from the CSP.

**Decisions for Alessandro before the public release (not blocking live-review):**
1. **Operator email:** FOSSGIS requires a visibly reachable operator email on any website using its routing and
   Overpass servers. NEXUM shows none, and publishing an email address is your choice.
2. **High traffic:** FOSSGIS does not permit high-traffic sites. If public traffic grows, routing must move to another
   provider (a self-hosted Valhalla is €0 software but not €0 hosting).
3. **Commercial use:** IMF PortWatch data needs IMF permission for commercial reuse. NEXUM is non-commercial today.

## D. Performance

O6 is the initial load in bytes on the wire, measured by the host counter.

| Measure | Pass start | Pass end |
|---|---|---|
| O6 initial load, desktop | 996,264 B | **877,304 B** (−12 %) |
| O6 initial load, phone | 929,571 B | **810,611 B** (−13 %) |

**Why O6 fell.** MapLibre's shared engine (~516 KB raw, ~140 KB compressed) was downloaded twice: once by the main
thread and once inside the bundled worker. Both now import MapLibre's own unchanged files from a versioned
`/vendor/maplibre/6.11.2/` path, cached for a year. Same code, same version, no CDN.

**On demand.** Everything added in this pass loads only when the person opens or turns it on: alerts, routing,
discovery, maritime, previews, satellite categories. The 10,320-cable table (188 KB compressed) is downloaded only
when the cable layer is turned on.

**Bench correction.** With the service worker in control, the worker fetched outside the bench's throttling and
disabled cache, so O8 and O9 measured an unthrottled network. Bench contexts now block service workers, so the
benches again measure a first visit on Fast 4G.

Final run, service workers blocked, Fast 4G:

| Measure | Pass start | Pass end |
|---|---|---|
| O8 card latency, cold p95 / warm p95 | 692 ms / 17 ms | 680 ms / 17 ms |
| O9 first search | 5,940 ms | 5,957 ms (target ≤ 6,000 ms) |
| O9 following searches, p95 on Fast 4G | 1,173 ms | 1,163 ms (known FAIL from before OSIRIS, target 150 ms) |
| O9 following searches, unthrottled p95 | — | 15 ms |
| U2 / U7 / U4 / U5 / U6 / U9 | PASS | PASS |

## E. Automatic update (PWA)

**Cause of the stale version.** NEXUM had a manifest but no service worker and no update check:
- An open or installed page kept running the build it started with (iOS resumes an installed app instead of reloading it).
- After a deploy, that old page's lazy chunks were gone from the host (404), so opening a tool could fail.
- `/` itself had no `no-cache` rule.

**What it does now.**
- **Build id:**
  - every web build has an id;
  - it is published as `/version.json` (`no-store`);
  - it is visible discreetly: status-bar tooltip, `<html data-build>`, `window.__nexum.build`.
- **When the page checks:**
  - when it comes back to the screen (`visibilitychange`, `pageshow` from the back-forward cache);
  - on focus;
  - when the network returns;
  - every 5 minutes.
- **When an update is applied:**
  - at once if the app was off screen;
  - otherwise after 30 s without touch or typing, while no tool is drawing or picking and no video is playing.
- **What the reload keeps:**
  - the view is written into the address first (focus, camera, base map, projection);
  - layers, trail, shapes, IndexedDB and localStorage are untouched.
- **Loop guard:** one reload per new build every 2 minutes.
- **Stale chunk:** an old build's lazy chunk that is gone from the host (`vite:preloadError`) triggers the same update
  instead of a broken panel.
- **Service worker (`/sw.js`, regenerated with every build):**
  - registered 4 s after load, so it never competes with the first load;
  - same-origin GET requests only, so third-party requests are never touched;
  - the page: network first, the stored copy only offline;
  - hashed assets and MapLibre files: one shared store, trimmed by count, so a rollback or a page still open finds its
    files;
  - snapshot data: stored as used, capped;
  - `version.json` and `sw.js`: always from the network;
  - the new worker takes over at once.
- **Offline:**
  - the app and the data already viewed open without network from the second opening on (the first opening installs);
  - files loaded before the worker took control are passed through it once, from the browser cache.
- **Headers:** `no-cache` for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`; `no-store` for `/version.json`;
  `immutable` for `/vendor/*`.

**Test `autoupdate.spec.ts`.** Two real builds, A and B, are served by the Pages-like host. B's tools chunk is renamed,
as a changed module gets a new hash.

| Scenario | What is checked |
|---|---|
| resume | A running → B deployed → the app comes back to the screen → B; view, localStorage keys and every IndexedDB store kept |
| reopen | A → B deployed → the app is closed and reopened → B at once |
| idle | A open and untouched → B deployed → becomes B by itself |
| moved chunk | A → B deployed → a tool whose code moved is opened → becomes B; the tool then works |
| offline → online | the host unreachable → the stored app opens (A) → host back with B → B |
| no loop | the host keeps announcing a build that never arrives → at most one reload |

**Devices.** Desktop Chrome, Samsung/Chrome (mobile), Fold closed and iPhone/Safari (WebKit). All pass.

**Real host (live-review).** Two pages were open on live-review with build `202610060517-8i2v`: Chrome desktop, and
WebKit as an iPhone. Build `202610060546-tg0e` was then deployed to live-review. On resume, both pages became the new
build by themselves, and pages reopened in the same browsers opened it at once.

**Pages opened before this pass.** A page still running the build deployed before this pass (`398bf4be`, which has
no updater) gets the update at its next normal load, because the page itself is served `no-cache`. Every later
deploy updates by itself.

**Harness notes (not NEXUM behaviour):**
- Playwright's emulated offline stops WebKit before its service worker answers, so the offline step makes the host
  really unreachable instead.
- In WebKit, a page evaluation started during the reload reads the outgoing page, so the check waits 3 s after the
  reload.
- An installed home-screen PWA cannot be emulated by Playwright. It runs the same code, and the resume path covers
  iOS's resume behaviour.

## F. Remaining IMPOSSIBLE capabilities

Each one is listed with its evidence in `NEXUM-OSIRIS-COMPLETE-MATRIX.md`:
- **Aircraft:** live aircraft and all aircraft features. Re-verified 2026-10-06: no CORS on adsb.lol and adsb.fi,
  airplanes.live answers 403, OpenSky allows only its own origin; following one aircraft is personal tracking.
- **Ships:** worldwide AIS (keyed server stream; NEXUM keeps the keyless Baltic).
- **Cyber maps:** malware, botnet C2 and outage maps (cyber gate, terms, tokens).
- **Person-centric and offensive tools:** OSINT on persons, scanning, wallet forensics.
- **Devices and tracking:** Bluetooth and device intrusion; visitor tracking and IP geolocation.
- **OSIRIS platform:** the SDK platform; header forging and access bypass.
- **Proprietary or editorial content:** front lines; editorial "perspective" labels on publishers.
- **Gate choice:** a ready-made "military installations" search preset.
- **Camera sources:** those listed in the matrix §H. NZTA is pending a licence verification that cannot be done
  without a browser today.

There is no PARTIAL whose missing part is lawful, €0 and feasible, with two declared exceptions:
- Singapore LTA cameras: 8 cameras today, noted for a later source pass.
- NZTA cameras: licence not verifiable today.

## G. Physical test fixes (2026-10-06, after the master pass)

The physical test found two failures. Both are fixed and deployed to live-review only.

### G1. Update UX: visible, one-tap, says which build is running

- **Build in use:** the app shows the build it is actually running (`__NEXUM_BUILD__` of the executing bundle, not
  version.json). It appears in the ⋯ menu ("NEXUM · versione in uso: build …"), in Info and in Aiuto.
- **Notice:** when version.json announces a newer build, a non-intrusive banner appears: "Nuova versione disponibile ·
  in uso: <build>", with the button **AGGIORNA ORA**.
- **AGGIORNA ORA** first checks that the new build's main script is actually served. It then lets the new service
  worker settle, keeps the view (hash permalink), and reloads once.
  - After the reload: "NEXUM aggiornato · build B (prima A)", hidden after 12 s.
  - Local data, Trail, settings and localStorage/IndexedDB are never touched; the test checks them.
- **Automatic update is kept:** NEXUM still updates by itself on resume, when hidden, and when idle for 30 s. The
  notice is for a person using the app at that moment.
- **No reload loop:** a sessionStorage guard allows one attempt per build. A build that never arrives is retried
  quietly every 15 s, with no reload.
- **Edge propagation** (seen on Cloudflare: new page served while its script still answers 404):
  - the page waits ("il server la sta ancora distribuendo: riprovo da solo tra pochi secondi") and switches on its own
    when the script arrives;
  - the service worker serves a new page only once that page's main script is reachable, and otherwise keeps the last
    working page;
  - each build's page is stored in its own cache, so offline never opens another build's page.
- **A tool whose code moved in the new build:** the notice appears ("serve per aprire questa funzione"), never a
  blank part or a reload under the finger.
- **Offline data:** the snapshot worker keeps the files it reads. When it cannot reach `current.json` (WebKit does not
  route a module worker's requests through the service worker), it asks the page, whose requests are routed through
  it.
- **Tests:** `tests/web/autoupdate.spec.ts` on desktop Chrome, Samsung, Fold closed and iPhone (WebKit). Each run
  covers OLD → NEW deploy → visible notice → AGGIORNA ORA → new build running and confirmed, plus resume, reopen, idle,
  moved chunk, propagation window, offline → online, no loop and data kept. Result: 8/8 over two repeats.
  - Harness notes: the propagation scenario runs in its own browser instance, and the iPhone profile is kept on disk.
  - Why: Playwright's in-memory WebKit profile empties its stored files when another context closes or no page is
    open, which a real phone does not do.

### G2. MARITTIMO: discoverable, each capability on its own

- A **MARITTIMO** group appears in Livelli (desktop panel and phone bottom sheet) and in the quick layer palette. Each
  of these rows has its own switch, total count and status in the current view:
  - **Navi:** AIS, Mar Baltico only, said explicitly;
  - **Porti:** PortWatch, daily port calls;
  - **Chokepoint:** 28, measured transits;
  - **Cavi sottomarini:** worldwide;
  - Basi navali.
- **Turning a row on** shows its data at once. If the current view has none, the row says so and offers
  "Vai a <area>" (for example, Navi → Mar Baltico).
- **Every item explains itself** on tap or click (VISIBLE DATA → CLICK/TAP → EXPLANATION → SOURCE).
- **Tests:** `tests/mobile/maritime.spec.ts` on 5 devices.
  - Adriatic and Italy port → daily calls panel.
  - Chokepoint → "Vai a" → transits.
  - Mediterranean cable → explanation and source.
  - Navi → Baltic ships.
