# C — NEXUM audit for an "OCEANOGRAPHIC NETWORK" layer (read-only, 2026-10-08, HEAD ac307e6)

## 1. Marine sources already in NEXUM
- No buoy, NDBC, wave, SST, tide-gauge, EMODnet, Argo or CMEMS source exists (sources/, sources_live/, connectors/, vocab_live/, ops.json).
- Snapshot tables (not NEXUM objects): `eurostat.searoute` (MARNET model, EUPL-1.2 → `/tables/searoutes`), `osm.navalbases` (ODbL, weekly), `osm.cables` (ODbL).
- NEXUM objects: `nga.world_port_index` → `transport.port` (2,938; public domain; `located_in`/`near_place` enrichment, vocab_live/transport.toml:34-50); `it.venezia_maree` = tide-centre WEBCAMS (`camera.public_webcam`, CC BY 3.0 IT), not tide gauges.
- Browser-live overlays (ui/src/ops/overlays.ts; ops.json; media-hosts.json): `ops-ais` (Digitraffic, Baltic only, 60 s while on), `ops-ports`/`ops-choke` (IMF PortWatch), `ops-nws`, `ops-gdacs`, `ops-quakes`; Open-Meteo point weather (non-commercial). No weather/sea observations.

## 2. Type model and measurements
- Types: `vocab_live/*.toml` `[object_type."x.y"]` with label, geometry, identity_schemes, display (family, group, facts, subtypes, series…), `[...properties]`, `[relation_type.*]`, `[[enrichment]]` (e.g. vocab_live/cameras.toml:5-26; tables in nexum/core/db.py:17-24).
- Existing series model (`vocab_live/observations.toml:1-70`): `props.series=[[start,end,value,n,se]]`, geometry none, `measured_in` → country, packed in one `/observations` package (nexum/api/server.py:1179-1242, hard 10 MB cap; today 3.2 MB). UI: ui/src/lib/observations.ts, components/Observations.tsx. Verdict: shape fits conceptually but is country-anchored, statistics-oriented, without geometry or QC slot — not for hourly per-station data.
- Claims (db.py:57-61, core/world.py:287-306): latest value with lineage (superseded_by), not a time series (1,008,234 claims).
- Provenance: raw_record (content-addressed gzip), record (source, native_id, raw_id, locator, quality_flags), identifier (scheme, value, strong), evidence, provenance (db.py:37-104); NormalizedRecord (core/records.py) has quality_flags, properties, geometry, identifiers, assertions.
- Live DB: 82 sources, 170,874 records, 313,733 identifiers, 351,768 evidence rows.

## 3. Map components
- `ui/src/map/points.ts` (293 lines): compact list `/types/<t>/points` → `[lon,lat,statusIdx,srcIdx]` (server.py:352-386), MapLibre clustering (radius 34, maxZoom 12), canvas marks with shape + word (never colour alone), legend `.pts-legend`, hover names on demand, same-place offsets, list popup, selection → full NEXUM card (ObjectMode). Config `ui/src/config/points.json`; lazy install for OWN_POINT_TYPES (views/MapView.tsx:28-32,553-560); snapshot `POINT_LAYERS` (nexum/snapshot/build.py:264,334-337).
- Gaps for a second point type: glyph hard-coded as a camera (points.ts:28-36,62-77) → needs a glyph key in config; two `.pts-legend` would overlap (styles.css:874); some Italian strings in the .ts.
- Ops overlays: plain GeoJSON, no clustering, taps → FeatCard ("Non è un oggetto NEXUM").
- Recommended: hybrid — platforms as NEXUM objects through points.ts; latest measurements as a published table (`options.published_table`, server.py:388-416, build.py:326-331); optional browser-live history on demand only for CORS-open sources.

## 4. Connectors
- Registry (nexum/core/registry.py:1-162): required id, name, owner, verdict, reliability_tier, verified_at, independence_group, connector; [license] id/url/attribution/redistribution/commercial_use; [access] type ∈ geojson|json|csv|zip|rss|atom|cap|local (:12) — **NetCDF and NDBC fixed-width text are not admissible types** (use ERDDAP csv/json or extend ACCESS_TYPES); `auth` must be "none" (admissible() :126-141); licence check older than 365 days blocks.
- Polite Scheduler (nexum/core/scheduler.py): host allowlist, honest UA, per-host and per-resource intervals, conditional GET, Retry-After, backoff, suspension after 5 errors; raw store 94 MB.
- Connector contract: describe(), plan(), next_state(), parse() → NormalizedRecords, optional table().
- Snapshot limits: 25 MiB per file, MAX_FILES 9,000 per snapshot (O7); current 7,506 files, 1.04 GB (ent 4,096 fixed shards 894 MB; edges 1,024; sdoc 628; otiles 656; raw 512; refs 512; ind 32; api 24). Headroom ≈ 1,494 files; a type of N objects adds ≈ N/256 sdoc files + few otiles + ≈ 5–6 KB per element in ent.
- Browser-live feeds: URL in ops.json, origin in media-hosts.json "connect" (explicit https origins), privacy list in ops.json.

## 5. Conflicts
- Maritime group (ops/OpsShell.tsx:290-297: ships, ports, chokepoints, cables, naval bases): a new row must not reuse ops-* ids or ops.layers keys; no third "port" concept; buoy wind/waves are not alerts; Venezia "maree" are cameras.
- W9 FORBIDDEN words (tests/test_domain_agnostic.py:10-13; applies to nexum/api, ui/src .ts/.tsx/.css, index.html, not JSON): earthquake, seismic, quake, magnitude, airport, aviation, aircraft, ship, vessel, copernicus, cems, usgs, ourairports, natural earth, naturalearth, weather, volcano, wildfire, flood, satellite, cve, vulnerability, malware, exploit, company, country, emergency, mainshock, aftershock, replica, repliche, sciame. A buoy layer is likely to need "weather", "ship/vessel", "satellite", "copernicus", "country", "flood", "emergency" → only in ops.json / points.json / vocab_live.
- P24: commits authored by Alessandro Pezzali only, no co-authored-by.

## 6. Data gates
- bench/osiris/data_baseline.py: counts per table/type/source, registered sources, published tables (must still exist), media hosts (identity-checked against e2b17d0 with declared reductions). Additions pass; never remove/rename types, sources, tables or hosts; never shrink another type; model inactive platforms as a property, not as retraction.
- bench/osiris/semantic_gate.py: Country/Event/Infra/Webcam/Relation/Timeline/Space chains — unaffected unless new objects displace items in `/entities/{Italy}/objects` (max 5,000) or `/search`.

## 7. Budgets and mobile rules
- O6 initial load ≤ 1.0 MB (now 883 KB, ≈117 KB headroom); O8 pass; **O9 first FTS search ≤ 6 s: now 5,949 ms — at the limit**: new searchable objects grow search.sqlite.jgz (4.4 MB) → the most fragile budget.
- O7 ≤ 9,000 snapshot files.
- Mobile geometry (ui/tests/mobile/geometry.ts): 44 px targets, no overlaps > 3 px, no covered controls, no clipped text; `.pts-pop` buttons are 40 px (unchecked) — a buoy popup must be ≥ 44 px; maritime.spec.ts pattern for a new row.
