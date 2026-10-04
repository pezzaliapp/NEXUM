# NEXUM — Audit tecnico del codice OSIRIS

Data: 2026-09-28 · Repository analizzato: `<LOCAL_PATH>/OSIRIS-REFERENCE` (origin `github.com/simplifaisoul/osiris`, HEAD `7a3daec`, clone completo, 324 commit) · Modalità: **sola lettura** (nessun file OSIRIS modificato, nessuna dipendenza installata, nessun codice OSIRIS eseguito; `git status` pulito al termine).

Metodo: lettura del codice sorgente file per file in quattro aree (mappa e interfaccia, connettori dati, sicurezza e privacy, licenze/dipendenze/build), confronto con [NEXUM-SOURCES.md](NEXUM-SOURCES.md) e [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md), verifica diretta a campione delle affermazioni più importanti (uso effettivo del modulo di header falsificati, middleware di analytics, valori sintetici, dimensioni dei file candidati).

Classificazioni:

| Classe | Significato |
|---|---|
| **REUSE** | Codice MIT autonomo e valido, adattabile direttamente mantenendo l'avviso di copyright |
| **ADAPT** | Utile, ma richiede refactoring sostanziale per subordinarsi al modello NEXUM |
| **STUDY** | Idea, algoritmo o pattern da reimplementare autonomamente |
| **REJECT** | Non deve entrare in NEXUM (motivi tecnici, legali, sicurezza, privacy, qualità, dipendenze) |

---

## 1. Executive summary

**Verdetto: OSIRIS non conviene come base. Al massimo si possono importare circa 1.000 righe di utility pure per la mappa (geodesia, disegno di aree, controlli di camera), e solo nella Fase 2 se la UI resterà in TypeScript con MapLibre. Per la Fase 1 (ingestione Python) il riuso utile è zero.**

| Area | Esito |
|---|---|
| Map engine | Un unico componente di 3.321 righe con ~35 sorgenti e ~90 layer cablati, popup HTML come stringhe (alcuni non sanificati), stile e tile di un fornitore esterno. **REJECT.** Salvabili solo moduli puri di contorno (~1.000 LOC testate). |
| Connettori | Nessuna interfaccia comune, 4 trasporti HTTP diversi, 6 stili di cache, provenienza assente, valori inventati in alcuni output; 4 route usano header falsificati. **Nessun REUSE.** Alcuni buoni pattern da studiare (client Nominatim rispettoso, parser GDELT, normalizzazione multi-fornitore meteo). |
| UI | Stato in ~70 `useState` in un file di 2.004 righe; nessun timeline, nessun grafo (dipendenza presente ma inutilizzata), nessun clustering, nessun offline. |
| Sicurezza/privacy | Ampio insieme di funzioni vietate da NEXUM: ricerca persone per username/email/telefono, dati di violazioni e infostealer, scansioni, aggregazione di webcam con proxy, scraping di messaggistica, tracciamento wallet, header falsificati, analytics che registra l'IP dei visitatori. **REJECT** in blocco. |
| Licenze | Codice MIT; **dati, asset e servizi no**: cavi sottomarini con struttura dei dati TeleGeography (NC-SA), cataloghi webcam raccolti da siti terzi, stile e tile CARTO, immagini Esri senza attribuzione, font da CDN Google, logo e marchio OSIRIS. 219 commit su 324 sono di un agente AI ("Gemini CLI"): provenienza del codice non verificabile snippet per snippet. |
| Lavoro risparmiabile | Stima **3–6 giorni di sviluppo** complessivi (solo front-end), a fronte di obblighi di attribuzione e di una modifica della decisione già presa in [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md) §7. |

Il documento serve a **decidere insieme** cosa importare; non è stata copiata alcuna riga.

---

## 2. Architettura reale di OSIRIS

```
Browser
 └─ app/page.tsx (2.004 LOC, ~70 useState, dataRef mutabile + contatore di versione)
     ├─ components/OsirisMap.tsx (3.321 LOC, MapLibre imperativo, ~35 source GeoJSON, ~90 layer, ~22 popup HTML)
     │    ├─ lib/satellite-layer.ts (custom layer WebGL istanziato con picking GPU)
     │    ├─ lib/map-terrain.ts + terrain-tiles.ts (DEM Terrarium via protocollo custom)
     │    └─ overlay DOM: CctvPreviews, LiveNewsPreviews
     ├─ pannelli: LayerPanel, SearchBar, LiveAlerts, OsintPanel, FingerprintSearch, Markets, ...
     └─ polling: fetchEndpoint() + layerFetchedRef (latch una-tantum per sessione)

Next.js API routes (~90 endpoint, src/app/api/**)
 ├─ proxy verso fonti pubbliche (USGS, NASA, NOAA, GDACS, GDELT, CelesTrak, ...)
 ├─ proxy verso fonti non ufficiali o vietate (camere, Telegram, finanza, OSINT su persone)
 ├─ cache in memoria (cachedSource) o solo header CDN s-maxage
 └─ middleware.ts → analytics Umami (page view + evento con IP del visitatore)

Servizi laterali
 ├─ intel/server.js (Express: indice sanzioni OpenSanctions + Wikidata SPARQL)
 ├─ scanner esterno (non incluso; raggiunto via SCANNER_URL)
 └─ engine/ (solo bytecode Python .pyc, nessun sorgente, non referenziato da src)

Deploy: Docker (standalone Next) + nginx (cache tile CARTO 365 giorni) + GHCR; Vercel opzionale
```

Caratteristiche strutturali:

- **Nessun modello dati.** Ogni layer è un flusso indipendente `API → JSON ad hoc → FeatureCollection`. Non esistono oggetti, relazioni, eventi, provenienza o confidenza.
- **Nessun contratto di connettore.** Ogni `route.ts` fa fetch, parsing, normalizzazione e risposta inline.
- **Server obbligatorio.** Le API route sono proxy necessari (CORS, chiavi, cache); l'app non funziona come file statici né offline.

---

## 3. Technology stack verificato dal codice

| Livello | Tecnologia (versione bloccata) | Uso effettivo |
|---|---|---|
| Framework | Next.js 16.3.4, React 19.2.4 | App Router, `output: 'standalone'` fuori da Vercel |
| Linguaggio | TypeScript 5.9 (`strict: true`) | ampio uso di `any` nei componenti principali |
| Mappa | maplibre-gl 6.7.0 | uso imperativo; worker copiato in `public/vendor` |
| Mappa (dichiarata) | react-map-gl 8.1.1 | **mai importata** |
| Grafo (dichiarato) | react-force-graph-2d 1.29.1 | **mai importato** |
| Orbite | satellite.js 7.0.0 | SGP4 in `lib/orbit.ts` e route satelliti |
| UI | Tailwind 4, framer-motion 12, lucide-react 1.14 | stile con variabili CSS OSIRIS |
| Grafici | lightweight-charts 5.2 | pannello mercati |
| Video | hls.js 1.6 | stream webcam/news |
| Feed | rss-parser 3.13 (ma 4 parser RSS scritti a mano con regex) | news, GDACS, meteo |
| Telefono | google-libphonenumber | lookup telefonico (funzione vietata) |
| LLM | @google/generative-ai 0.24 | route `ai/*` (Gemini) |
| Analytics | @vercel/analytics (**mai importato**); Umami via middleware | |
| Immagini | sharp 0.35 (binari LGPL libvips) | solo ottimizzatore immagini Next |
| Server laterale | Express 5.2 (`intel/`) | con `node_modules` **committati** (589 file) |
| Test | Vitest 2.1.9 | 75 file, ~857 casi, solo unit test |

Dipendenze transitive (613 pacchetti): 478 MIT, 44 ISC, 37 Apache-2.0, 13 MPL-2.0, 12 BSD-2, 10 LGPL-3.0 (binari opzionali di sharp), 7 BSD-3, altri minori. Nessuna GPL/AGPL/SSPL/BUSL/NC.

---

## 4. Mappa delle directory

| Directory | Contenuto | File / LOC indicative | Valutazione |
|---|---|---|---|
| `src/app/page.tsx`, `layout.tsx`, `globals.css` | shell dell'app | 2.004 + ~200 | REJECT |
| `src/components/` | 40 componenti React | ~15.000 | quasi tutto REJECT; pochi piccoli REUSE/STUDY |
| `src/lib/` | utility, connettori condivisi, logica pura | ~70 file, ~12.000 | mix: le utility geo/disegno sono la parte migliore del repository |
| `src/app/api/` | ~90 route | ~20.000 | nessun REUSE; alcuni STUDY/ADAPT logici |
| `src/app/api/cctv/` | ~40 connettori webcam + dataset generati | ~5.000 | REJECT (funzione vietata) |
| `src/app/api/osint/` | 18 route di ricognizione | ~1.700 | REJECT |
| `src/lib/sdk/`, `api/sdk/` | integrazione con piattaforme C2 militari commerciali | ~1.000 | REJECT |
| `src/app/docs/` | pagina di documentazione API | ~2.000 | REJECT |
| `intel/` | server Express + node_modules committati | 776 + 589 file | REJECT (STUDY: allowlist host, escaping SPARQL) |
| `engine/__pycache__/` | 15 `.pyc` senza sorgenti | — | REJECT (non verificabile) |
| `scratch/` | script di scraping, procedure operative, cache di geocoding | 7 file | REJECT |
| `runs/` | output di previsioni LLM | 9 righe | REJECT |
| `tools/` | vendoring del worker MapLibre, loader Turbopack, smoke test CDP | 26 + 6 + 282 | REUSE condizionato (primi due) |
| `public/` | icone, logo, stile CARTO, dataset cavi, manifest | — | REJECT (vedi §11) |
| `docs/screenshots/` | 3 immagini | — | REJECT |
| `nginx/`, `Dockerfile`, `docker-compose.yml`, `deploy.sh`, `.github/` | deploy | — | STUDY minimo / REJECT |

---

## 5. Tabella riassuntiva REUSE / ADAPT / STUDY / REJECT

| # | Componente | Path principale | Classe | Motivo in una riga |
|---|---|---|---|---|
| 1 | Map engine | `src/components/OsirisMap.tsx` | REJECT | god component, cablato, popup non sanificati, zero test |
| 2 | Integrazione MapLibre (fallback contesto WebGL, ResizeObserver) | `OsirisMap.tsx:306-370, 1788` | STUDY | poche righe di buon senso, da riscrivere |
| 3 | Rendering WebGL custom (punti istanziati + picking GPU) | `src/lib/satellite-layer.ts` | STUDY / ADAPT | tecnica valida ma legata ad API semi-interne di MapLibre |
| 4 | Layer management | `OsirisMap.tsx:410-897, 2375-2415`, `LayerPanel.tsx` | REJECT (STUDY: gerarchia gruppi/sottolayer) | nessun registro, conoscenza duplicata |
| 5 | Marker management | `OsirisMap.tsx:1812-2300` | REJECT | `setData` completo a ogni aggiornamento, niente feature-state |
| 6 | Clustering | — | assente | decimazione "1 ogni 10" al posto del clustering |
| 7 | Viewport loading | — | assente | ogni layer scarica il dataset mondiale |
| 8 | Progressive loading | `page.tsx:683-855` | STUDY | caricamento scaglionato e on-toggle: idea semplice |
| 9 | Caching server | `src/lib/sourceCache.ts` | STUDY | dedup in-flight + stale-on-error, ma solo in memoria e semantica "vuoto = errore" |
| 10 | Polling client | `page.tsx:660-900` | STUDY (come anti-pattern) | latch che lascia layer vuoti dopo un errore |
| 11 | Deduplicazione richieste | `sourceCache.ts`, `stats/route.ts` | STUDY | single-flight corretto |
| 12 | Grandi quantità di entità | `satellite-layer.ts`, decimazione | STUDY | istanziazione GPU sì, decimazione no |
| 13 | Popup / pannelli di dettaglio | `OsirisMap.tsx:956-1760`, `SatelliteCard.tsx` | REJECT | HTML come stringhe, rischio XSS da dati upstream |
| 14 | Search | `src/components/SearchBar.tsx` | ADAPT | debounce, abort, tastiera; solo luoghi, da estendere a oggetti NEXUM |
| 15 | Filtri | booleani di layer, filtri LiveAlerts | REJECT | nessun filtro per attributo o tempo |
| 16 | Timeline | — | assente | solo etichette "x minuti fa" |
| 17 | Grafo / network | `OsirisMap.tsx:2105-2125` | REJECT | archi fabbricati per ordine di array, privi di significato |
| 18 | State management | `page.tsx` | REJECT | ~70 `useState`, `data: any`, ref che rispecchiano props |
| 19 | Normalizzazione dati | inline nelle route e negli effect | REJECT | nessuno schema comune |
| 20 | Architettura connettori | `src/app/api/**` | REJECT (STUDY singoli pattern) | nessun contratto, provenienza assente |
| 21 | API routes | `src/app/api/**` | REJECT | proxy server-side incompatibili con l'ingestione NEXUM |
| 22 | Self-hosting | Dockerfile, compose, nginx | STUDY | funziona senza Vercel, ma richiede rete esterna `umami_default` |
| 23 | Offline | — | assente | tutto remoto (tile, stili, font, dati) |
| 24 | Ottimizzazioni performance | throttling hover/coordinate, LRU tile DEM | STUDY | alcune buone, altre dannose (timer 200 ms, `setData` completo) |
| 25 | Componenti UI riutilizzabili | `MapControls`, `DrawHud`, `ErrorBoundary` | REUSE (piccoli) | autonomi, accessibili |
| 26 | Tastiera / navigazione | `KeyboardShortcuts.tsx`, handler in `page.tsx` | STUDY | elenco statico, binding sparsi |
| 27 | Responsive / mobile | `useIsMobile`, bottom sheet | STUDY | funzionale ma con alberi duplicati |
| 28 | Test | 75 file Vitest | STUDY | buoni test unitari su logica pura; nessun test di componenti |
| 29 | Build / deploy | `tools/`, `next.config.ts`, Docker | REUSE condizionato (tools) / STUDY | CSP di fatto nulla, proxy immagini aperto |
| 30 | Dipendenze | `package.json` | vedi §12 | due dipendenze morte, una SaaS |
| 31 | Geodesia | `src/lib/geo.ts` | **REUSE** | puro, testato, coerente [lng, lat] |
| 32 | Disegno aree (state machine) | `src/lib/draw.ts` | **REUSE** | reducer puro e testato |
| 33 | Adattatore disegno sulla mappa | `OsirisMap.tsx:3086-3245` | ADAPT | da estrarre in un hook |
| 34 | Selezione in area (AOI) | `src/lib/aoi.ts` | ADAPT | legato ai nomi dei layer OSIRIS; niente antimeridiano/buchi |
| 35 | Diff ingresso/uscita da area | `src/lib/watch.ts` | ADAPT | concettualmente vicino agli EVENT NEXUM |
| 36 | Esportazione AOI GeoJSON/CSV | `src/lib/aoi-export.ts` | **REUSE** | puro, testato |
| 37 | Controlli camera | `src/lib/map-camera-controls.ts` + `MapControls.tsx` | **REUSE** | rispetta `prefers-reduced-motion`, testato |
| 38 | Layout overlay a schermo | `src/lib/map-tile-layout.ts` | **REUSE** | puro, testato |
| 39 | Proiezione globo/mercator | `src/lib/map-projection.ts` | **REUSE** (o riscrivere: 32 righe) | banale |
| 40 | Terreno 3D | `map-terrain.ts`, `terrain-tiles.ts`, `terrain-layer-order.ts` | ADAPT | pulito e testato; da puntare a DEM locale |
| 41 | Orbite | `src/lib/orbit.ts` | ADAPT (solo front-end TS) | wrapper sottile; in Python si usa `sgp4` |
| 42 | Vendoring worker MapLibre | `tools/prepare-map-worker.mjs`, `tools/maplibre-url-loader.cjs` | **REUSE** condizionato | utile solo con Next.js + Turbopack |
| 43 | Guardia SSRF | `src/lib/ssrf-guard.ts` | STUDY | buon disegno, IPv6 debole; in NEXUM l'allowlist per fonte la rende superflua |
| 44 | Verifica HMAC webhook | `api/github-webhook/route.ts` | STUDY | corretta, `timingSafeEqual`, fail-closed |
| 45 | Tutti i moduli di §10 | vari | REJECT | fuori dai confini legali ed etici |

---

## 6. Audit Map Engine

### 6.1 Integrazione MapLibre

- Uso imperativo di `maplibre-gl` 6.7.0 in `OsirisMap.tsx:306-1796`.
- **Stile remoto CARTO** (`OsirisMap.tsx:310`) con tutte le richieste riscritte verso `/api/proxy-tiles` (335-342), che le inoltra al fornitore e le fa cacheare da nginx per un anno. Incompatibile con l'obiettivo offline e con i termini del fornitore.
- **Fallback del contesto WebGL** (351-370): se la creazione fallisce riprova con attributi più leggeri (low-power, senza antialias). **STUDY**: utile su hardware modesto.
- `ResizeObserver` → `map.resize()` (1788): corregge il bug del canvas 400×300. **STUDY**: 3 righe.
- Worker servito localmente via `setWorkerUrl` (313) e `tools/prepare-map-worker.mjs`.
- Proiezione globo di default con passaggio a mercator tra zoom 7 e 9 quando il terreno è attivo (`lib/map-projection.ts`).

### 6.2 Rendering WebGL

- Quasi tutto è **GeoJSON source + layer circle/symbol/line** disegnati dalla GPU: approccio corretto.
- Icone disegnate su canvas e registrate con `addImage` (223-256, 416-436).
- **`lib/satellite-layer.ts` (612 LOC)**: `CustomLayerInterface` vero, con quad istanziati posizionati in quota tramite il prelude di proiezione di MapLibre, **picking GPU** su framebuffer fuori schermo e tracciato orbitale. È il pezzo tecnicamente più interessante del repository, ma dipende da un'API semi-interna (`projectTileFor3D`) fragile tra versioni. **STUDY/ADAPT**: utile solo se NEXUM dovrà mostrare decine di migliaia di punti in quota; altrimenti bastano i layer `circle` standard o una libreria dedicata.

### 6.3 Layer e marker management

- Nessun registro: ~35 source create vuote al caricamento (410) e riempite da ~25 `useEffect` separati (1812-2300).
- Visibilità gestita da un unico grande effect su tutto l'oggetto `activeLayers` (2375-2415), con ~20 cast `as any`.
- `LayerPanel.tsx:52-200` duplica la conoscenza dei layer.
- Ogni aggiornamento ricostruisce l'intera `FeatureCollection`: niente aggiornamenti incrementali, niente `promoteId`/feature-state per la selezione.

### 6.4 Clustering, viewport, progressive loading

- **Clustering assente.** Densità gestita decimando i voli (1 su 10 commerciali, 1 su 2 privati) e con `minzoom` sulle etichette. Per NEXUM: usare `cluster: true` nativo di MapLibre o indici spaziali locali.
- **Viewport loading assente** per i dati: ogni layer scarica il dataset globale una volta. Solo overlay e terreno sono sensibili al viewport.
- **Progressive loading presente** e semplice: feed principali subito, mercati a 800 ms, space weather a 5 s, layer caricati solo quando attivati, splash fino al primo `idle`.

### 6.5 Popup e dettagli

- ~22 popup come **stringhe HTML inline** con stili incorporati. Esistono helper di escaping (964-966) ma **non sono usati ovunque**: in alcuni popup titoli e URL dei dati upstream finiscono nel DOM non sanificati (es. meteo, `OsirisMap.tsx:1589-1597`, dove anche l'attributo `href` riceve un valore non validato). **Rischio XSS** dai dati delle fonti.
- Gestori `onclick` inline che richiamano funzioni globali su `window`.
- **REJECT.** NEXUM userà componenti di dettaglio renderizzati dal framework, con escaping automatico e pannello di provenienza.

### 6.6 Timeline e grafo

- **Timeline: assente.** C'è solo un log a scorrimento di 100 eventi (`lib/watch.ts`).
- **Grafo: assente.** La "mesh" di rete collega ogni nodo ai due successivi nell'array: archi privi di significato. La dipendenza `react-force-graph-2d` non è mai importata.

Nessuno dei due elementi centrali del modello NEXUM (ONE TIMELINE, MANY RELATIONS) ha un corrispondente in OSIRIS.

### 6.7 Valutazione del map engine

**REJECT.** Riscrivere il modulo mappa di NEXUM attorno a:

- un **registro dichiarativo di layer** indicizzato per tipo di Object/Event;
- aggiornamenti incrementali da uno store locale;
- selezione con feature-state;
- source con `cluster: true`;
- espressione di filtro temporale pilotata dalla timeline;
- protocollo PMTiles per la basemap locale.

Costa meno che districare `OsirisMap.tsx`.

---

## 7. Audit Data / Connector layer

### 7.1 Architettura

| Aspetto | Stato in OSIRIS | Requisito NEXUM |
|---|---|---|
| Interfaccia comune | assente | `plan / fetch / parse` via Source Registry |
| Trasporti HTTP | 4 (fetch globale, `httpJson`, `https.get`, modulo con header falsificati) + WebSocket | uno solo, lo scheduler rispettoso |
| Cache | 6 stili (header CDN, `revalidate`, variabili di modulo, `cachedSource`, cache su disco Nominatim, file satelliti); molte route **senza cache** | Raw Store persistente + ETag + TTL per fonte |
| Rate limit in uscita | solo Nominatim; cooldown dopo 429 su voli; **nessuna gestione di `Retry-After`** | per fonte, dichiarato nel registro |
| Provenienza | al più una stringa `source` | Provenance completa |
| Tempo | istante di osservazione e di acquisizione spesso confusi | bitemporale |
| Errori | `catch → console.warn → []`; "vuoto" e "sconosciuto" quasi mai distinti | stati espliciti |
| Duplicazione | 4 parser RSS a regex, GDACS scaricato da 2 route con 2 parser, USGS da 3 route, 2 tabelle di centroidi, 3+ funzioni di distanza | un connettore per fonte |

### 7.2 Connettori di dati pubblici

Legenda header: **Onesto** = User-Agent identificabile · **Falsificato** = usa il modulo di header falsificati o un UA di browser simulato.

| # | Sorgente | File | Endpoint | Auth | Header | Cache | Rate limit | Trasformazione | Valore per NEXUM | NEXUM-SOURCES | Classe |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | USGS | `api/earthquakes/route.ts` | feed `2.5_day.geojson` | — | UA di default | solo CDN 60 s | — | lista piatta | basso (banale) | ADOPT | ADAPT (riscrivere in Python con FDSN/GeoJSON e provenienza) |
| 2 | NASA FIRMS + EONET vulcani | `api/fires/route.ts` | CSV globali 24 h VIIRS/MODIS; EONET | — (file pubblici) | onesto | CDN 600 s | — | campionamento a ~2.000 righe; **luminosità e FRP inventati per i vulcani** | medio (parser CSV) | FIRMS COND, EONET ADOPT | ADAPT (senza campionamento né valori sintetici; decidere file pubblici vs MAP_KEY) |
| 3 | EONET + NWS + GDACS | `api/weather/route.ts` | EONET open, `api.weather.gov/alerts/active`, GDACS RSS | — | **Falsificato su EONET e GDACS**; NWS onesto ma senza contatto | `cachedSource` 3 min; stale solo se tutti falliscono | — | `WeatherEvent` unificato; centroide dei poligoni NWS | **alto** (miglior normalizzazione multi-fornitore) | ADOPT / ADOPT / COND | STUDY/ADAPT (logica), mai il trasporto |
| 4 | GDACS | `api/gdelt/route.ts` (nome errato) | RSS | — | modulo importato ma non chiamato | `revalidate` 300 s | — | stringa `html` costruita da titolo/descrizione **non sanificati** | basso | COND | ADAPT (usare API JSON/CAP e parser XML vero) |
| 5 | GDELT 2.0 export | `api/gdelt-events/route.ts`, `lib/gdeltEvents.ts` | `lastupdate.txt` → `export.CSV.zip` | — | UA di default, IPv4 | solo CDN (lo zip si riscarica a ogni miss) | ripiego fino a 3 finestre su 404 | `GdeltEvent` con CAMEO, QuadClass, Goldstein, tono, geo | **alto** | ADOPT | ADAPT (mappa delle 61 colonne e logica delle finestre; in Python `zipfile`+`csv`) |
| 6 | NOAA SWPC | `api/space-weather/route.ts` | Kp 1 min, alert, flare GOES | — | onesto | **nessuna** | — | Kp (`null` se ignoto), scala G, alert, flare | medio | ADOPT | ADAPT (buona distinzione null/0; aggiungere cache) |
| 7 | CelesTrak + SatNOGS | `api/satellites/route.ts`, `satellites/orbit/route.ts`, `lib/orbit.ts` | ~40 gruppi `gp.php` in parallelo + `sup-gp.php`; SatNOGS | — | CelesTrak onesto; **fallback SatNOGS falsificato** | memoria 1 h, disco 4 h | — | posizioni SGP4 + etichette "missione" per parola chiave | medio | COND / ADOPT | ADAPT (rispettare la regola di 1 download ogni 2 h; OMM JSON; niente etichette inventate) |
| 8 | CISA KEV | `api/cyber-threats/route.ts` | KEV JSON (+ ping a una dashboard di terzi senza uso dei dati) | — | onesto | — | — | top 10 degli ultimi 30 giorni, **tutti etichettati CRITICAL** | basso | ADOPT | ADAPT (senza severità inventata) |
| 9 | abuse.ch Feodo | `api/cyber-attacks/route.ts`, `lib/c2-indicators.ts` | blocklist JSON | — | onesto | 5 min | — | IP C2 al centroide del paese | basso | OPT-IN | REJECT per la Fase 1 (dati per IP, termini non commerciali) |
| 10 | Cloudflare Radar | `api/cloudflare-radar/route.ts` | outage, origini attacchi L3 | token | onesto | solo CDN | — | quote per paese al centroide | basso | OPT-IN | ADAPT (opt-in; buon fail-closed senza token) |
| 11 | IODA | `api/radar/route.ts` | outage events | — | onesto | solo CDN | — | outage a centroidi **con jitter casuale** | basso | OPT-IN | ADAPT (opt-in; togliere il jitter) |
| 12 | Nominatim reverse | `api/geo/reverse/route.ts`, `lib/nominatim.ts` | `/reverse` | — | onesto | disco 30 giorni, griglia 0,1° | **coda serializzata, 1 req/2 s, max 40 in coda** | `{label, attribution}` | **alto** come modello | COND | STUDY (modello per il Polite Scheduler) |
| 13 | Photon + Nominatim | `api/geosearch/route.ts` | `photon.komoot.io`, Nominatim search | — | onesto | `cachedSource` | via coda Nominatim | risultati fusi e deduplicati | medio | Photon non a catalogo; Nominatim COND | ADAPT (Photon da catalogare o istanza locale) |
| 14 | Wikipedia / Wikidata / Commons | `api/region-dossier/route.ts` | pageprops, statements, `wbgetentities`, summary | — | onesto | 24 h | 1 retry | dati paese, **capo di Stato**, estratto, bandiera | medio | COND | ADAPT (buon filtro "statement corrente"; eliminare dati su persone) |
| 15 | Earth Search + CDSE STAC | `api/sentinel/route.ts` | POST `/search` | — | onesto | solo CDN | — (raggio e date illimitati) | metadati scene | medio | COND / OPT-IN | ADAPT (in Python `pystac-client`, con limiti) |
| 16 | adsb.lol trace + adsbdb | `api/aircraft/route.ts` | file trace del sito (non l'API documentata); adsbdb | — | onesto | 2 min per hex | — | dettaglio aereo con **proprietario registrato** | basso | COND (storico, mitigazioni privacy); adsbdb non a catalogo | STUDY (segmentazione della tratta corrente); il connettore viola §6 |
| 17 | adsb.fi + OpenSky | `api/flights/route.ts` | 30 regioni adsb.fi, `/mil`; OpenSky `states/all` | OAuth OpenSky | **Falsificato** | 90 s, dedup, stale | cooldown 15 min su 429 | liste commerciali / **privati** / militari | nessuno | OPT-IN / REJECT | REJECT |
| 18 | adsbdb, hexdb, airplanes.live | `api/flight-route/route.ts` | callsign / hex | — | **Falsificato ("per evitare i rate limit")** | 30 min / 2 min | cooldown 3 min | tratta + arco | nessuno | non a catalogo / OPT-IN | REJECT |
| 19 | aisstream.io + tabelle statiche | `api/maritime/route.ts` | WebSocket globale | chiave | onesto | Map in memoria (20k navi) | riconnessione fissa 5 s | navi, porti, **basi navali**, colli di bottiglia con rischio editoriale | basso | OPT-IN | ADAPT solo opt-in (senza filtro IMO né esclusione diporto viola §6); tabelle REJECT |
| 20 | Publisher RSS + Telegram | `api/news/route.ts`, `lib/alert-*.ts` | 9 feed + 9 canali `t.me/s/` | — | **UA di browser sui feed** | 3–5 min | cap sui geocoding | **testo completo e media**, rischio per parole chiave, etichetta di "blocco" politico | basso | Telegram REJECT; RSS COND (solo metadati) | REJECT (STUDY: estrazione luoghi candidati, fingerprint cross-post) |
| 21 | Conflitti | `api/conflicts/route.ts` | 3 RSS | — | **UA di browser** | CDN | — | 15 zone statiche, eventi con **coordinate fabbricate** | nessuno | REJECT | REJECT |
| 22 | DeepStateMap | `api/frontlines/route.ts` | API non documentata del sito | — | onesto | CDN 1.800 s | — | pass-through | nessuno | REJECT | REJECT |
| 23 | Yahoo Finance | `api/markets/*.ts` | endpoint non ufficiale | — | **UA di browser** | `cachedSource` | — | quotazioni, OHLC | nessuno | REJECT | REJECT |
| 24 | Rischio paese | `api/country-risk/route.ts`, `lib/country-risk.ts` | USGS 4.5 | — | onesto | — | — | punteggi **editoriali** + magnitudo sommate | basso | USGS ADOPT; punteggi non sono una fonte | REJECT (dati) / STUDY (separazione "editoriale" vs "osservato") |
| 25 | Infrastrutture nucleari | `api/infrastructure/route.ts` | USGS 4.5 | — | onesto | CDN | — | ~70 impianti scritti a mano, stato sovrascritto con "SEISMIC RISK" entro 150 km | basso | infrastrutture da OSM/GEM | REJECT (dati); la correlazione di prossimità appartiene al motore NEXUM |
| 26 | Fornitori SCM | `api/scm-suppliers/route.ts` | USGS + chiamate alle proprie route | — | — | — | — | 14 aziende con livelli di rischio inventati; **bug**: legge un campo inesistente | nessuno | — | REJECT |
| 27 | Routing | `api/directions/route.ts` | Valhalla FOSSGIS, OSRM demo | — | onesto | CDN | — | percorso, passi, quota | nessuno (fuori scopo) | non a catalogo | STUDY (`decodePolyline` testato) |
| 28 | OpenAQ v2 | `api/air-quality/route.ts` | `/v2/latest` | — | onesto | — | — | stazioni PM2.5 | basso | non a catalogo | REJECT (v2 presumibilmente ritirata; valutare v3 nel catalogo) |
| 29 | ArcGIS | `api/arcgis/route.ts` | ricerca ArcGIS Online + **qualsiasi FeatureServer** indicato dall'utente | — | onesto | 30 min | retry; limite in ingresso | GeoJSON pass-through | basso | non a catalogo; contrario all'allowlist | STUDY (import guidato dall'utente) |
| 30 | Geolocazione visitatore | `api/geo/route.ts` | 3 servizi di IP geolocation (uno in HTTP) | — | onesto | no-store | cascata | posizione e ISP del visitatore | nessuno | non a catalogo | REJECT (§6/§7) |
| 31 | Tile CARTO | `api/proxy-tiles/route.ts` | `*.cartocdn.com` | — | — | 1 anno, CORS `*` | — | byte dei tile | nessuno | basemap = Protomaps | REJECT |
| 32 | Live news | `api/live-news/route.ts`, `lib/youtube.ts` | link statici a stream | — | — | 24 h | — | canali video | nessuno | fuori scopo | REJECT |
| 33 | Espansione entità | `api/entity/expand/route.ts` | server `intel` (tipi **persona** e **ip**) | env | inoltra l'IP reale del client | 1 h | in ingresso | grafo nodi/archi | nessuno | — | REJECT |
| 34 | Stats / health | `api/stats`, `api/health` | route interne | — | — | snapshot single-flight 30 s | — | contatori | basso | — | STUDY (salute per fonte ↔ Source Registry) |
| 35 | Bulgaria | `lib/bulgaria-sources.ts` | nessuno | — | — | — | — | — | nessuno | — | REJECT (codice morto) |

### 7.3 Pezzi autonomi del layer dati

| Pezzo | LOC | Punti di forza | Debolezze | Equivalente per NEXUM (Python) | Classe |
|---|---|---|---|---|---|
| `src/lib/httpJson.ts` | 141 | UA onesto, timeout, decompressione, GET condizionale con ETag/304 | niente redirect, niente `Retry-After`, corpo in memoria | `httpx`, ~30 righe | STUDY |
| `src/lib/sourceCache.ts` | 132 | TTL, dedup in-flight, stale-on-error, chiavi limitate, `peek`/`seed` | solo array; un risultato vuoto legittimo è trattato come errore; retry fisso 60 s; solo memoria | tabella TTL nel DB locale, ~60 righe | STUDY |
| `src/lib/fetch-pool.ts` | 47 | concorrenza limitata | — | `asyncio.Semaphore` | STUDY |
| `src/lib/nominatim.ts` | 207 | coda con intervallo minimo, rifiuto se piena, cache negativa, snapshot atomico su disco, contatori | coda globale condivisa da chiamanti diversi | modello per il Polite Scheduler, ~80 righe | STUDY (miglior riferimento) |
| `src/lib/gdeltEvents.ts` | 260 | mappa di 61 colonne, ripiego su finestre mancanti, filtro QuadClass | parsing ZIP artigianale fragile; nessuna cache | `zipfile` + `csv`, ~60 righe | ADAPT (logica) |
| normalizzatori USGS/EONET/NWS/GDACS | 20–150 ciascuno | centroide poligoni NWS, mappatura severità GDACS | inline, tipizzati `any` | riscrittura | STUDY |
| `src/lib/ssrf-guard.ts` | 312 | risoluzione DNS e verifica di ogni hop di redirect | controllo IPv6 per prefisso testuale non normalizzato | superfluo con allowlist per fonte | STUDY |

**Conclusione connettori:** NEXUM prevede l'ingestione in Python con un contratto di connettore, provenienza e cache persistente. Nessun file TypeScript di OSIRIS è trasferibile; il valore sta in **~6 idee** (§14.3), che si reimplementano in poche decine di righe ciascuna.

---

## 8. Audit UI

| Elemento | Osservazioni | Classe |
|---|---|---|
| Shell (`page.tsx`) | 2.004 righe, ~70 `useState`, polling e rendering mescolati, alberi desktop/mobile duplicati | REJECT |
| `MapControls.tsx` + `lib/map-camera-controls.ts` (88 + 110) | pad di pan/zoom con ripetizione alla pressione, annullamento su gesto utente, rispetto di `prefers-reduced-motion`; testato | REUSE |
| `DrawHud.tsx` (134) | HUD di misura durante il disegno | REUSE |
| `DrawingToolbar.tsx` (493) | AOI, watch ed export in un solo componente | STUDY |
| `ErrorBoundary.tsx` (53) | generico | REUSE (o riscrittura in 10 minuti) |
| `SearchBar.tsx` (313) | debounce, AbortController, frecce, bias sul centro mappa; solo luoghi | ADAPT |
| `LayerPanel.tsx` (554) | gerarchia gruppi/sottolayer e abilitazione per capacità: buona idea; `LAYER_GROUPS` cablato | STUDY |
| `ScaleBar.tsx` (60) | MapLibre ha già `ScaleControl` | STUDY / non necessario |
| `KeyboardShortcuts.tsx` (73) | solo modale di aiuto; i binding sono in `page.tsx` | STUDY |
| Style Studio, palette, token (413 + 148 + 446) | ponte variabili CSS → palette mappa via evento custom; sovradimensionato | STUDY |
| `CctvPreviews`, `LiveNewsPreviews` (476 + 363) | pattern: overlay DOM riposizionati su `move`, ricalcolati su `moveend`, numero limitato | STUDY (solo pattern); funzione REJECT |
| Pannelli di dominio (LiveAlerts, Markets, IntelFeed, GlobalStatusBar, DirectionsBar, NavigationView, ChainBrief, AiOverview, SatelliteCard, ViewPresets) | specifici di OSIRIS; `GlobalStatusBar` chiama API di terzi direttamente dal browser | REJECT |
| `WorldRemote.tsx` (545) | ricognizione Bluetooth e sondaggio di porte locali; codice minificato su una riga | REJECT |
| Responsive | `useIsMobile` via larghezza JS, bottom sheet, long-press per il dossier | STUDY |
| Accessibilità | `prefers-reduced-motion` rispettato nei controlli camera; altrove non verificata | — |
| Tema | variabili CSS e palette OSIRIS (ciano/oro), font da CDN Google | REJECT (identità da non riprendere) |

---

## 9. Audit performance

| Tecnica | Dove | Valutazione |
|---|---|---|
| Rendering GPU di tutte le entità | source GeoJSON | ✔ corretto |
| Punti istanziati con picking GPU | `satellite-layer.ts` | ✔ efficace per ~19k oggetti; API fragile |
| Picking hover a 10 Hz e sospeso durante il movimento | `OsirisMap.tsx:1193-1209` | ✔ STUDY |
| Callback coordinate mouse a 100 ms | 910-917 | ✔ |
| LRU con deduplica e concorrenza 2 per i tile DEM | `terrain-tiles.ts` | ✔ ADAPT |
| Pixel ratio max 1,5 e pitch max 60 con terreno | `map-terrain.ts` | ✔ |
| Worker MapLibre con cache immutabile | `next.config.ts` | ✔ |
| `React.memo` sulla mappa | — | ✘ inefficace: l'identità di `data` cambia a ogni fetch |
| `setData` completo a ogni aggiornamento | effect della mappa | ✘ |
| Due `setInterval` a 200 ms per animazioni di pulsazione | 2095, 2301 | ✘ lavoro continuo della CPU |
| `JSON.stringify` di array nelle proprietà delle feature | 2468-2470 | ✘ |
| Decimazione dei voli invece del clustering | 1826-1839 | ✘ perdita di dati |
| Nessun Web Worker per trasformazioni client | — | ✘ |
| Nessuna cache in-process in molte route; affidamento a header CDN | route API | ✘ inutile in locale |
| Download ripetuto dello zip GDELT a ogni miss | `gdelt-events` | ✘ |

---

## 10. Audit security / privacy

Descrizione di inventario: cosa fa ciascun componente e perché è escluso. Non si riportano dettagli operativi. Riferimenti: [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) V4, §5, §6, §7, §8.

### 10.1 Funzioni vietate

| Categoria | Componenti | LOC | Regola NEXUM | Classe |
|---|---|---|---|---|
| **Person search** | `api/osint/github/route.ts` (profilo, email, località), `api/entity/expand` (tipo persona), `intel/server.js` (risoluzione entità incl. persone) | 39 + ~80 + 776 | §6, §7 | REJECT |
| **Username enumeration** | `lib/sherlock.ts`, `api/osint/username`, `api/osint/fingerprint`, `lib/fingerprint.ts`, `components/FingerprintSearch.tsx` | 418 + 66 + 88 + 181 + 923 | §7 | REJECT |
| **Email lookup / breach data** | `api/osint/leaks` (servizio di violazioni) | 51 | §6, §7 | REJECT |
| **Infostealer data** | `api/osint/hudsonrock` (email, username, telefono, dominio) | 103 | §7 | REJECT |
| **Phone lookup** | `api/osint/phone` (con coordinate per prefisso) | 186 | §7 (geolocalizzazione di individui) | REJECT |
| **IP geolocation / profiling** | `api/osint/ip`, `api/geo` (visitatore), `api/osint/bgp` (parte ip-api), `lib/malware-live.ts` | 84 + … | §6, §7 | REJECT |
| **Scanning** | `api/scanner` (proxy verso scanner esterno: porte, SSL, sottodomini, tecnologie, vulnerabilità), `lib/osint-utils.ts` | 98 + 185 | §7 | REJECT |
| **Probing** | `api/osint/sweep` (classificazione dispositivi di una sottorete), `api/osint/shodan`, `api/osint/mac`, `components/WorldRemote.tsx` (Bluetooth, porte locali), `api/cctv/stream-status` | 126 + 38 + 38 + 545 + 52 | §7 | REJECT |
| **Aggregazione camere** | `api/cctv/**` (~48 fonti, ~23k camere), `lib/cctv-snapshot.ts`, `camera-*.ts`, `components/CctvPreviews.tsx`, `CameraViewer.tsx` | ~6.000 | §7 | REJECT |
| **Scraping problematico** | proxy camere che supera le protezioni anti-hotlink (`api/cctv/proxy`), risoluzione di pagine web in stream (`api/cctv/resolve`), `scratch/scrape_*.js`, cataloghi `*.generated.ts`, Telegram (`lib/telegram.ts`, `api/news`), endpoint non ufficiali (finanza, mappe di conflitto, file trace ADS-B) | ~3.000 | V4, §3, §5, §7 | REJECT |
| **Spoofing / manipolazione header** | `lib/stealthFetch.ts` (IP di provenienza falsi + UA casuali): **importato in 28 file, chiamato effettivamente in 4 route di dati** (`flights`, `flight-route`, `satellites`, `weather`) e in ~20 connettori camere; UA di browser simulati in `sherlock.ts`, `osint/leaks`, `cctv/proxy`, `cctv/resolve`, `cctv/stream-status`, `cctv/asfinag`, `conflicts`, `news`, `markets`, `markets/history`, `scratch/scrape_public_webcams.js` | 117 + usi | V4, §5.1–5.2 | REJECT (blocklist rigida) |
| **Aggiramento limiti di una fonte** | `scratch/injection_tutorial.html`: procedura per iniettare in produzione una cache con timestamp alterato al fine di evitare i limiti di CelesTrak | 199 | V4, §5.5 | REJECT (blocklist rigida) |
| **Crypto tracing** | `lib/chainIntel.ts`, `api/osint/crypto`, `api/chain/daily`, `lib/chainFeeds.ts` | 615 + 66 + 34 + 256 | §7 | REJECT |
| **Analytics con IP dei visitatori** | `src/middleware.ts`: invia ogni page view e un evento separato con l'IP del visitatore a Umami; ID sito cablato | 59 | §6 (minimizzazione) | REJECT |
| **LLM a pagamento** | `lib/ai-engine.ts`, `api/ai/*`, `components/AiOverview.tsx` (Gemini) | 276 + 790 + 292 | V1 | REJECT |
| **Integrazioni militari commerciali** | `lib/sdk/*`, `api/sdk/*` (adattatori per piattaforme C2 commerciali, terminologia proprietaria) | ~1.000 | V7, §8 | REJECT |
| **Token crypto / monetizzazione** | `components/TokenPanel.tsx` (iframe di un token), `SupportMenu.tsx` | 66 + 110 | §8 | REJECT |
| **Binari opachi** | `engine/__pycache__/*.pyc` (15 moduli, nessun sorgente; le stringhe indicano un sistema di previsione basato su LLM e un collegamento a un mercato di previsioni) | ~164 KB | verificabilità, V1, V7 | REJECT |
| **Infrastruttura esposta** | `deploy.sh`, `scratch/architecture.html`, `scratch/injection_tutorial.html`: IP di produzione, accesso root, percorsi personali; percorsi personali anche nei `.pyc` | — | igiene | REJECT |

### 10.2 Lookup "benigni" e loro compatibilità

| Route | Fonte usata da OSIRIS | Stato in NEXUM-SOURCES | Esito |
|---|---|---|---|
| `osint/cve` | cve.circl.lu, cveawg.mitre.org (per query) | non a catalogo; catalogo: cvelistV5 ADOPT, KEV ADOPT, NVD COND | **Funzione compatibile**, da ricostruire come indice locale da fonti bulk catalogate |
| `osint/sanctions` | mirror OpenSanctions, include persone | OpenSanctions REJECT; liste ufficiali ADOPT solo per organizzazioni, navi, aeromobili | Compatibile dopo ricostruzione; nota: il codice OSIRIS dichiara CC BY, in contrasto con la licenza CC BY-NC registrata nel catalogo |
| `osint/bgp` | RIPEstat + ip-api | RIPEstat OPT-IN | Solo la parte RIPEstat, per ASN/prefisso, opt-in |
| `osint/whois` | rdap.org | non a catalogo | Borderline: contatti = dati personali; escluso fino a revisione |
| `osint/dns` | DoH pubblico | non a catalogo | Non necessario |
| `osint/certs` | crt.sh | non a catalogo | Borderline; escluso fino a revisione |

### 10.3 Igiene di sicurezza da studiare (non copiare)

| Elemento | Valutazione |
|---|---|
| `lib/ssrf-guard.ts` (312) | Buon disegno (range riservati IPv4 completi, rifiuto di notazioni non canoniche, verifica di tutti i record DNS, redirect rivalidati). Debole su IPv6 (confronto per prefisso testuale), manca pinning dell'IP e limite di dimensione. In NEXUM l'**allowlist di host per connettore** è più semplice e più forte. |
| `getClientIp` + `client-ip.test.ts` | Lezione corretta (non fidarsi del primo elemento di X-Forwarded-For), ma si fida senza condizioni di header impostabili dal client. Irrilevante per un'app locale. |
| `api/github-webhook` | HMAC-SHA256 con confronto a tempo costante, fail-closed. Corretto. |
| `intel/server.js` | Allowlist di domini in uscita, escaping degli input SPARQL, UA identificativo verso Wikidata: buoni pattern (coerenti con NEXUM §5.1 e §5.6). |
| `next.config.ts` | Esempio da **non** seguire: CSP con `unsafe-inline`, `unsafe-eval` e `https:` (di fatto nessuna protezione); ottimizzatore immagini aperto a qualsiasi host HTTPS. |

---

## 11. Audit licenze

### 11.1 Matrice per tipo di artefatto

| Tipo | Artefatto | Licenza / termini | Può entrare in NEXUM (MIT)? |
|---|---|---|---|
| **CODE** | codice first-party (`src/`, `tools/`, `intel/server.js`) | MIT © 2026 simplifaisoul; nessuna intestazione SPDX né commento "copiato da" | Sì, con l'avviso MIT. **Provenienza non verificabile**: 219/324 commit da un agente AI |
| CODE | worker MapLibre vendorizzato (`public/vendor/maplibre/6.7.0/`) | BSD-3-Clause con `LICENSE.txt` | Sì, ma si rigenera dal pacchetto |
| CODE | `intel/node_modules/**` (589 file committati) | MIT/ISC/BSD-3 | No: si rigenerano dal lockfile |
| CODE | `engine/*.pyc` | nessuna dichiarazione, nessun sorgente | **No** |
| CODE | `lib/stealthFetch.ts`, `scratch/*.js` | MIT, ma finalità incompatibili | **No** |
| **DATA** | `public/data/submarine-cables.json` e `-filtered.json` (identici, 665 KB, 717 feature) | struttura identica ai dati della mappa TeleGeography (CC BY-NC-SA), senza attribuzione | **No** |
| DATA | `api/cctv/*skyline.generated.ts` | catalogo raccolto da un sito commerciale di webcam | **No** |
| DATA | `api/cctv/public-webcams.generated.ts`, `scratch/public-webcams-places.json` | indice raccolto da un catalogo amatoriale + geocoding Nominatim (ODbL) | **No** |
| DATA | elenchi camere scritti a mano (`poland.ts`, `spain.ts`, `japan.ts`, …) | URL di stream di terzi | **No** |
| DATA | `lib/airports.ts` (~375 righe) | origine non dichiarata (probabilmente OurAirports) | No: usare OurAirports (PD) direttamente |
| DATA | tabelle editoriali (zone di conflitto, rischio paese, impianti nucleari, porti/basi navali, fornitori, classificazioni "missione" dei satelliti) | first-party, ma contenuto editoriale non verificato | No: non sono dati di fonte |
| DATA | `countryCentroids.ts`, `landing-cities.ts` | fatti approssimati "a occhio" | No: usare Natural Earth |
| DATA | `runs/ledger.jsonl` | output LLM | No |
| **ASSET** | `public/dark-matter-style.json` | stile CARTO Dark Matter (metadata `"owner":"Carto"`), punta a tile/sprite/glyph CARTO | No |
| ASSET | logo, favicon, icone PWA, `og-image.png`, `eye-of-horus.svg`, `casaos-icon.png` | nessuna dichiarazione; marchio OSIRIS; il simbolo SVG sembra proveniente da un archivio esterno | **No** (originalità, §8) |
| ASSET | `docs/screenshots/*.jpg` | contengono basemap di terzi e fotogrammi di camere | No |
| ASSET | font Inter e JetBrains Mono | SIL OFL 1.1, caricati dalla CDN Google | I font sì (OFL) se ospitati localmente; non la CDN |
| ASSET | icone lucide | ISC | Sì, dal pacchetto originale |
| **SERVICE** | basemap CARTO (proxy + cache nginx 1 anno) | termini CARTO: gratuito solo per uso non commerciale entro soglie | **No** |
| SERVICE | immagini satellitari Esri World Imagery | termini Esri; **attribuzione assente nel codice** | **No** |
| SERVICE | DEM Terrarium su AWS Open Data | aperto con attribuzione (presente) | Sì, con attribuzione (o DEM locale) |
| SERVICE | Nominatim, Valhalla FOSSGIS, OSRM demo, Photon | policy d'uso a bassa intensità | Solo come da catalogo NEXUM |
| SERVICE | OpenSanctions, ip-api, ipapi.co, Yahoo, DeepStateMap, aisstream, Gemini, Umami | vari, spesso non commerciali o non documentati | No, salvo quanto già in catalogo |

### 11.2 Conformità MIT di OSIRIS stesso

- `.dockerignore` esclude `LICENSE`: l'immagine pubblicata su GHCR non contiene l'avviso MIT.
- Nessun file `THIRD_PARTY_NOTICES`; dataset di terzi senza attribuzione.
- Nessuna CLA/DCO per i contributi esterni.

---

## 12. Dipendenze riutilizzabili

Le dipendenze si prendono **dai pacchetti originali**, non da OSIRIS. L'elenco indica solo quali scelte tecniche di OSIRIS sono coerenti con NEXUM.

| Dipendenza | Licenza | Per NEXUM | Nota |
|---|---|---|---|
| maplibre-gl | BSD-3 | **Sì** (già prevista) | pinning della versione, worker locale |
| satellite.js | MIT | Sì, solo se la UI propaga orbite in browser | in Python: `sgp4` |
| lucide-react | ISC | Sì, opzionale | icone neutre |
| react / react-dom | MIT | Da decidere (Fase 2) | |
| next | MIT | **Da valutare con cautela** | pesante per un'app locale; Vite + libreria UI leggera è un'alternativa più semplice |
| framer-motion | MIT | Non necessaria | peso elevato |
| tailwindcss | MIT | Opzionale | |
| vitest | MIT | Sì, se il front-end è TS | usare la versione corrente |
| rss-parser | MIT | No | in Python: `feedparser` |
| react-force-graph-2d | MIT | Forse, per la vista grafo di NEXUM | in OSIRIS non è usata |
| lightweight-charts | Apache-2.0 con attribuzione | Forse | richiede link di attribuzione |
| react-map-gl | MIT | No | non necessaria |
| hls.js | Apache-2.0 | No | niente video |
| google-libphonenumber | MIT/Apache | **No** | funzione vietata |
| @google/generative-ai | Apache-2.0 | **No** | SaaS |
| @vercel/analytics | MIT | **No** | SaaS, codice morto |
| sharp | Apache-2.0 + LGPL | No | non necessaria |
| express | MIT | No | API locale prevista in Python |

---

## 13. Componenti da non importare

Elenco vincolante (blocklist). Nessun file, frammento o dato da questi percorsi entra in NEXUM:

```
src/lib/stealthFetch.ts                       ← e qualunque codice che lo importa, senza revisione riga per riga
src/lib/sherlock.ts
src/lib/fingerprint.ts
src/lib/telegram.ts
src/lib/chainIntel.ts
src/lib/chainFeeds.ts
src/lib/malware-intel.ts
src/lib/malware-live.ts
src/lib/c2-indicators.ts
src/lib/sanctions.ts
src/lib/osint-utils.ts
src/lib/ai-engine.ts
src/lib/cctv-snapshot.ts
src/lib/camera-*.ts
src/lib/sdk/**
src/lib/airports.ts, countryCentroids.ts, landing-cities.ts, bulgaria-sources.ts, country-risk.ts
src/middleware.ts
src/app/api/osint/**
src/app/api/scanner/**
src/app/api/cctv/**
src/app/api/ai/**
src/app/api/sdk/**
src/app/api/crypto/**, chain/**, malware/**, cyber-attacks/**
src/app/api/geo/route.ts, entity/**, flights/**, flight-route/**, markets/**, conflicts/**, frontlines/**,
            live-news/**, proxy-tiles/**, scm-suppliers/**, country-risk/**, infrastructure/**
src/components/OsirisMap.tsx
src/app/page.tsx
src/components/OsintPanel.tsx, FingerprintSearch.tsx, CctvPreviews.tsx, CameraViewer.tsx,
               TokenPanel.tsx, SupportMenu.tsx, AiOverview.tsx, WorldRemote.tsx
intel/**
engine/**
scratch/**
runs/**
public/** (dataset, stile, icone, logo, immagini)
docs/screenshots/**
deploy.sh, nginx/nginx.conf, docker-compose.yml (x-casaos, rete umami)
```

---

## 14. Componenti candidati al riuso

### 14.1 REUSE (copia con adattamenti minimi, mantenendo l'avviso MIT)

| Componente | Path | LOC | Dipendenze | Accoppiamento con OSIRIS | Complessità | Vantaggio vs riscrittura | Rischio tecnico | Lavoro per NEXUM |
|---|---|---|---|---|---|---|---|---|
| Geodesia | `src/lib/geo.ts` (+ `geo.test.ts`) | 174 | nessuna | nessuno | bassa | medio: funzioni già testate; ma Turf copre lo stesso | basso | 15 min: rinomina, test |
| Disegno aree (reducer) | `src/lib/draw.ts` (+ test) | 255 | `geo.ts` | basso | media | **buono**: poligono/rettangolo/cerchio/linea, undo, chiusura; più leggero delle librerie di disegno | basso | 1 h |
| Export AOI | `src/lib/aoi-export.ts` (+ test) | 150 | tipi di `draw.ts`/`aoi.ts` | basso (chiave `osiris.*` in storage) | bassa | basso-medio | basso | 1 h; esportazione collegata al filtro licenze NEXUM |
| Controlli camera | `src/lib/map-camera-controls.ts` + `src/components/MapControls.tsx` (+ test) | 110 + 88 | maplibre-gl, framer-motion, lucide | basso (variabili CSS) | bassa | medio: controlli accessibili pronti | basso | 1 h; sostituire token di tema, valutare rimozione di framer-motion |
| Layout overlay | `src/lib/map-tile-layout.ts` (+ test) | 87 | nessuna | basso | bassa | basso-medio | basso | 30 min |
| Proiezione | `src/lib/map-projection.ts` (+ test) | 32 | maplibre-gl | basso | minima | minimo | basso | 15 min (o riscrittura) |
| HUD disegno | `src/components/DrawHud.tsx` | 134 | lucide | basso | bassa | basso | basso | 1 h |
| Error boundary | `src/components/ErrorBoundary.tsx` | 53 | nessuna | nessuno | minima | trascurabile | nessuno | riscrittura consigliata |
| Vendoring worker | `tools/prepare-map-worker.mjs`, `tools/maplibre-url-loader.cjs` | 26 + 6 | fs | basso | bassa | medio **solo con Next.js/Turbopack**; nullo con Vite | basso | 30 min |

**Totale REUSE: ~1.060 LOC** più i relativi test.

### 14.2 ADAPT (refactoring sostanziale)

| Componente | Path | LOC | Lavoro stimato | Nota |
|---|---|---|---|---|
| Adattatore disegno → hook | `OsirisMap.tsx:3086-3245` | ~160 | 1 giorno | estrarre un `useDrawTool(map)` indipendente |
| Selezione in area | `src/lib/aoi.ts` | 176 | 0,5 giorni | pilotare dai tipi di Object NEXUM; aggiungere antimeridiano, buchi e indice spaziale |
| Diff ingresso/uscita | `src/lib/watch.ts` | 136 | 0,5 giorni | trasformare l'output in EVENT NEXUM con provenienza |
| Terreno 3D | `src/lib/map-terrain.ts`, `terrain-tiles.ts`, `terrain-layer-order.ts` | 314 | 0,5 giorni | puntare a DEM locale (PMTiles) o URL configurabile con attribuzione |
| Ricerca | `src/components/SearchBar.tsx` | 313 | 1 giorno | ricerca su indice locale di Object + luoghi |
| Orbite (solo front-end) | `src/lib/orbit.ts` | 121 | 15 min | solo se la UI propaga orbite; altrimenti `sgp4` lato Python |
| Layer satelliti WebGL | `src/lib/satellite-layer.ts` | 612 | 2–4 giorni | solo se servono >50k punti o rendering in quota |

### 14.3 STUDY (idee da reimplementare, soprattutto in Python)

| Idea | Riferimento in OSIRIS | Dove va in NEXUM |
|---|---|---|
| Coda rispettosa con intervallo minimo, rifiuto se piena, cache negativa, snapshot su disco, contatori | `src/lib/nominatim.ts` | Polite Scheduler |
| Dedup in-flight + stale-on-error, con stati "vuoto" e "fallito" distinti | `src/lib/sourceCache.ts` | Polite Scheduler / Raw Store |
| Servire dati vecchi solo se **tutti** i fornitori falliscono | `src/app/api/weather/route.ts` | pipeline multi-fonte |
| `null` per "sconosciuto" invece di uno zero finto | `src/app/api/space-weather/route.ts` | regole di normalizzazione |
| Mappa colonne GDELT, ripiego su finestre mancanti, filtro QuadClass | `src/lib/gdeltEvents.ts` | connettore GDELT |
| Filtro "statement corrente" di Wikidata (esclude quelli con data di fine) | `src/app/api/region-dossier/route.ts` | connettore Wikidata |
| Fail-closed quando manca un token | `src/app/api/cloudflare-radar/route.ts` | connettori OPT-IN |
| Separazione esplicita tra componente "editoriale" e "osservata" | `src/lib/country-risk.ts` | Confidence/Provenance |
| Salute per fonte con contatori | `src/app/api/health/route.ts` | Source Registry |
| Fallback del contesto WebGL, ResizeObserver | `OsirisMap.tsx:351-370, 1788` | modulo mappa |
| Overlay DOM limitati e riposizionati | `CctvPreviews.tsx` (solo pattern) | schede fissate sulla mappa |
| Gerarchia gruppi/sottolayer con abilitazione per capacità | `LayerPanel.tsx` | registro layer |
| Picking GPU e punti istanziati | `satellite-layer.ts` | eventuale layer ad alta densità |
| Test live separati e opzionali (`RUN_LIVE_TESTS`) | `vitest.config.ts`, test dei connettori | strategia di test NEXUM |
| Allowlist di domini + escaping SPARQL | `intel/server.js` | connettori |

---

## 15. Stima del lavoro risparmiabile

| Scenario | Lavoro risparmiato | Costi aggiuntivi | Saldo |
|---|---|---|---|
| **Fase 1** (ingestione Python, CLI) | **0**: nessun codice TS trasferibile | — | nullo |
| **Fase 2**, UI in TypeScript + MapLibre, import dei soli REUSE (§14.1) | ~1 settimana di scrittura di utility geo/disegno/controlli → 2–3 giorni di integrazione | file `THIRD_PARTY_NOTICES`, modifica della decisione di progetto, revisione riga per riga di ~1.060 LOC scritte in gran parte da un agente AI | **risparmio netto 3–5 giorni** |
| Fase 2 + ADAPT (§14.2) | ulteriori ~1–2 giorni netti | refactoring, test da adattare | **risparmio netto complessivo 4–6 giorni** |
| Fase 2 con UI **non** TypeScript o senza MapLibre | 0 | — | nullo |
| Tentativo di partire dal map engine o dai connettori di OSIRIS | negativo | districare 5.000+ righe accoppiate, rimuovere trasporti contaminati, aggiungere provenienza | **perdita** stimata di 1–3 settimane |

Le idee di §14.3 fanno risparmiare **tempo di progettazione** (errori già visti e risolti) più che righe di codice: valore reale ma non misurabile in LOC.

---

## 16. Proposta di integrazione con NEXUM Core

Principio: **OSIRIS non determina l'architettura**. Qualsiasi frammento importato diventa una libreria di utility subordinata al modello NEXUM.

```
NEXUM Core (Python)                         NEXUM UI (TypeScript, Fase 2)
────────────────────                        ─────────────────────────────
Source Registry                             store locale (Object/Event/Relation dal Local API)
Polite Scheduler   ← idee §14.3             registro layer per tipo di Object/Event
Raw Store                                   timeline unica → filtro temporale dei layer
Pipeline → OBJECT ↔ RELATION ↔ EVENT        pannello dettaglio + provenienza
Correlation Engine                          │
Local API (127.0.0.1) ─────────────────────►│
                                            └─ ui/vendor/geo-utils/   ← eventuali REUSE §14.1
                                                 geo, draw, aoi-export, camera-controls,
                                                 tile-layout, projection
                                                 + THIRD_PARTY_NOTICES (MIT simplifaisoul)
```

Regole di integrazione, se si decide di importare:

1. **Nessun import nella Fase 1.** Il Core Python si scrive da zero; OSIRIS è consultato solo per le idee di §14.3.
2. I file REUSE confluiscono in un'unica directory isolata (es. `ui/vendor/geo-utils/`) con intestazione di provenienza (path originale, commit `7a3daec`) e avviso MIT in `THIRD_PARTY_NOTICES`.
3. Ogni file importato viene **rivisto riga per riga**, rinominato secondo le convenzioni NEXUM, privato di riferimenti a OSIRIS (chiavi di storage, token di tema) e coperto dai suoi test.
4. Nessun file importato può dipendere da stato, route o tipi OSIRIS; i tipi di input/output diventano quelli di NEXUM (GeoJSON standard, Object/Event).
5. Aggiornare [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md) §7 e [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §8, che oggi escludono qualsiasi riga di OSIRIS, con l'elenco esatto dei file autorizzati.
6. Un controllo automatico (in CI) verifica che nessun file della blocklist di §13 o nessun pattern di header falsificati compaia nel repository NEXUM.

---

## 17. Elenco preciso dei file OSIRIS eventualmente consigliati

Tutti i path sono relativi a `<LOCAL_PATH>/OSIRIS-REFERENCE/` (commit `7a3daec`). **Nessuno è stato copiato.**

### 17.1 REUSE — candidati alla copia (solo Fase 2, UI TypeScript + MapLibre)

| Path originale | LOC | Test associato |
|---|---|---|
| `src/lib/geo.ts` | 174 | `src/lib/geo.test.ts` |
| `src/lib/draw.ts` | 255 | `src/lib/draw.test.ts` |
| `src/lib/aoi-export.ts` | 150 | `src/lib/aoi-export.test.ts` |
| `src/lib/map-camera-controls.ts` | 110 | `src/lib/map-camera-controls.test.ts` |
| `src/components/MapControls.tsx` | 88 | — |
| `src/lib/map-tile-layout.ts` | 87 | `src/lib/map-tile-layout.test.ts` |
| `src/lib/map-projection.ts` | 32 | `src/lib/map-projection.test.ts` |
| `src/components/DrawHud.tsx` | 134 | — |
| `tools/prepare-map-worker.mjs` | 26 | — (solo con Next.js + Turbopack) |
| `tools/maplibre-url-loader.cjs` | 6 | — (solo con Next.js + Turbopack) |

### 17.2 ADAPT — candidati al riadattamento

| Path originale | LOC |
|---|---|
| `src/lib/aoi.ts` | 176 |
| `src/lib/watch.ts` | 136 |
| `src/lib/map-terrain.ts` | 137 |
| `src/lib/terrain-tiles.ts` | 104 |
| `src/lib/terrain-layer-order.ts` | 73 |
| `src/components/SearchBar.tsx` | 313 |
| `src/lib/orbit.ts` | 121 |
| `src/components/OsirisMap.tsx` (solo righe 3086-3245, adattatore disegno) | ~160 |
| `src/lib/satellite-layer.ts` (solo se necessario) | 612 |

### 17.3 STUDY — da leggere, non copiare

`src/lib/nominatim.ts`, `src/lib/sourceCache.ts`, `src/lib/httpJson.ts`, `src/lib/fetch-pool.ts`, `src/lib/gdeltEvents.ts`, `src/app/api/weather/route.ts`, `src/app/api/space-weather/route.ts`, `src/app/api/region-dossier/route.ts`, `src/app/api/cloudflare-radar/route.ts`, `src/app/api/health/route.ts`, `src/lib/ssrf-guard.ts`, `src/components/LayerPanel.tsx`, `vitest.config.ts`.

---

## Decisioni richieste all'autore

1. **Importare o no?** Opzioni:
   - **A — zero import** (coerente con la decisione attuale): costo stimato +3–6 giorni in Fase 2, nessun obbligo di attribuzione, nessun dubbio di provenienza.
   - **B — import limitato dei soli file §17.1** nella Fase 2, con `THIRD_PARTY_NOTICES` e revisione riga per riga.
   - **C — B + ADAPT selezionati** di §17.2.
2. **Stack della UI** (Fase 2): TypeScript + MapLibre è prerequisito perché B/C abbiano valore.
3. **Aggiornamento dei documenti di progetto** (ASSESSMENT §7, LEGAL-BOUNDARIES §8) in base alla scelta.

Raccomandazione: **A per la Fase 1** (obbligata: non c'è nulla da importare) e **decisione tra A e B rinviata all'inizio della Fase 2**, quando lo stack della UI sarà fissato. Il risparmio di B è reale ma modesto; C conviene solo per il terreno 3D e il diff ingresso/uscita, se entreranno nel perimetro.

---

## Decisione dell'autore

**2026-09-28 — Scelta: OPZIONE A (zero import).**

- Per la Fase 1 nessun codice, asset, dato, componente UI o frammento di OSIRIS entra in NEXUM.
- `OSIRIS-REFERENCE` resta esclusivamente materiale di studio e confronto, in sola lettura.
- Le idee elencate in §14.3 possono ispirare la progettazione, ma ogni implementazione NEXUM è scritta da zero.
- La valutazione di un eventuale import limitato (opzioni B/C) potrà essere riaperta solo con una nuova decisione esplicita dell'autore.

Resta quindi valida la regola di [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md) §7 e [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §8.
