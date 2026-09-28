# NEXUM — Catalogo delle fonti

Verifica eseguita il **2026-09-28** consultando pagine ufficiali di licenza, termini d'uso e documentazione API; per molti endpoint è stata fatta anche una richiesta di prova senza credenziali. Le licenze cambiano: ogni voce va **riverificata prima dell'implementazione del connettore** e poi almeno ogni 6 mesi (vedi [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md)).

## Legenda

| Simbolo | Significato |
|---|---|
| **ADOPT** | Utilizzabile secondo licenza |
| **COND** | *Adopt with conditions*: vincoli operativi dichiarati (chiave personale, rate limit, solo metadati, nessuna redistribuzione…) |
| **OPT-IN** | Disattivata per default; licenza non commerciale o termini restrittivi, l'utente la abilita consapevolmente |
| **REJECT** | Esclusa, motivo documentato |
| Auth | `—` nessuna · `key` chiave gratuita · `acct` account gratuito (mai carta di credito) |
| Conf. | Confidenza della verifica: A alta · M media · B bassa |
| Tier | Affidabilità della fonte ([NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) §8.2) |
| PD | Pubblico dominio (opere del governo USA o dichiarazione esplicita) |

Salvo diversa indicazione, **costo reale €0** e nessuna carta di credito richiesta.

**Regola generale per chiavi e account:** le credenziali gratuite sono **personali dell'utente**, inserite nella sua configurazione locale. NEXUM non distribuisce chiavi.


> **Revisione 2026-09-28 — Fase 1 v0.2 approvata.** Le quattro fonti del PoC reale della Fase 1 (USGS, OurAirports, Natural Earth, Copernicus EMS) sono ADOPT e sono state riverificate il 2026-09-28; note di qualità aggiunte per Natural Earth e Copernicus EMS. Nuovo verdetto tecnico `fixture` per fonti sintetiche ammesse **solo** nei test (vedi [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §3.1).

---

## 1. Geografia e dati di base

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OpenStreetMap (OSMF) | estratti bulk `.osm.pbf` | — | ODbL 1.0 | usare estratti, non le API di editing | mondo · continuo | sì; attribuzione "© OpenStreetMap contributors", share-alike sui DB derivati | sì | basso | **ADOPT** | T3 | A |
| Geofabrik (Geofabrik GmbH) | `download.geofabrik.de` | — | ODbL | niente download massivi paralleli; estratti pubblici senza dati degli utenti | regioni · giornaliero | sì (ODbL) | sì | basso | **ADOPT** | T3 | A |
| Protomaps / PMTiles | build planet `maps.protomaps.com/builds`, `pmtiles extract` | — | dati ODbL (produced work) | ~120 GB planet; estrarre regioni; **non** fare hotlink, ospitare localmente | mondo · giornaliero | sì, locale | sì | basso | **ADOPT** — basemap locale predefinita | — | A |
| Natural Earth | download (`naciscdn.org/naturalearth/…`; l'URL del sito ha restituito 500 il 2026-09-28) | — | PD | alcuni paesi hanno `ISO_A2 = -99`: usare `ISO_A2_EH`/`ISO_A3_EH` | mondo · raro | sì | sì | basso | **ADOPT** — confini e basemap a bassa scala | T1 | A |
| GeoNames | dump giornalieri; web service | key (username) per WS | CC BY 4.0 | WS 10.000 crediti/giorno, 1.000/ora | mondo · giornaliero | sì con attribuzione | sì | basso | **ADOPT** (dump locali; WS raramente) | T3 | A |
| Wikidata (Wikimedia) | dump, API entità, SPARQL `query.wikidata.org` | — | CC0 | timeout 60 s; User-Agent descrittivo obbligatorio; dal 2025 grafo scientifico separato | mondo · continuo | sì | sì | basso (dati) / medio (motore SPARQL) | **COND** — preferire API entità e dump, cache | T3 | A |
| Wikipedia / Wikimedia API | Action API, REST | — | testi CC BY-SA 4.0 | 2026: 10 req/min senza UA conforme, 200/min con UA conforme | mondo | sì, share-alike, testi separati dal codice | sì | basso-medio | **COND** — solo estratti brevi con link | T3 | A |
| Nominatim (istanza OSMF) | `nominatim.openstreetmap.org` | — | ODbL | **max 1 req/s**, cache obbligatoria, niente autocompletamento, niente bulk | mondo | risultati da cachare | sì | basso | **COND** — geocoding occasionale; per volumi: istanza locale | T3 | A |
| Overpass API (pubblica) | `overpass-api.de` | — | ODbL | per applicazioni ~100 query e 10 MB/giorno; nessuna query parallela | mondo | sì | uso commerciale ⇒ istanza propria | basso | **COND** — solo query occasionali dell'utente | T3 | A |
| Tile server OSM (`tile.openstreetmap.org`) | tile raster | — | ODbL | vietati prefetch e archivi offline | — | — | — | — | **REJECT** come basemap: incompatibile con l'uso offline; sostituito da Protomaps | — | A |

## 2. Eventi naturali: terremoti, tsunami, vulcani, incendi, alluvioni

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| USGS Earthquake Hazards | feed GeoJSON `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/…`; FDSN event | — | PD (USA) | nessun limite numerico; preferire i feed alle query | mondo · 1 min | sì; credito "U.S. Geological Survey" | sì | basso | **ADOPT** — feed sismico mondiale di riferimento | T1 | A |
| EMSC SeismicPortal (EMSC-CSEM) | FDSN `seismicportal.eu/fdsnws/event/1/`; WebSocket | — | CC BY 4.0 | niente mirror dell'intero catalogo; robots.txt esclude le query ai crawler | mondo (forte Euro-Med) · tempo reale | sì con attribuzione | sì (dati) | basso-medio | **COND** — WebSocket, cache locale, attribuzione | T1 | A |
| INGV (Italia) | FDSN `webservices.ingv.it/fdsnws/event/1/` | — | CC BY 4.0 | non documentati | Italia e dintorni · quasi tempo reale | sì con attribuzione | sì | basso | **ADOPT** | T1 | A |
| NOAA NTWC / PTWC (tsunami) | Atom/CAP `tsunami.gov/events/xml/*.xml` | — | PD (implicito) | — | Pacifico, Atlantico, Caraibi · a evento | sì | sì | basso | **ADOPT** — verificare firme CAP | T1 | M-A |
| GDACS (JRC UE + ONU OCHA) | GeoRSS, CAP, JSON `gdacs.org/gdacsapi/…/EVENTS4APP` | — | **nessuna licenza esplicita** (disclaimer; probabilmente politica di riuso UE) | robots.txt: 1 req/60 s; ultimi 100 eventi | mondo multi-rischio · minuti-ore | con attribuzione e disclaimer | non verificato | basso | **COND** — polling ogni 5–15 min; chiedere conferma scritta della licenza | T2 | M |
| NASA EONET v3 | `eonet.gsfc.nasa.gov/api/v3/events` | — | PD (NASA) | servizio "prototipo" | mondo · continuo | sì | sì | medio (disponibilità) | **ADOPT** — aggregatore, non fonte primaria | T2 | A |
| NASA FIRMS | API area CSV/JSON, file bulk | key (MAP_KEY gratuita) | NASA open data | 5.000 transazioni / 10 min | mondo · NRT < 3 h | sì; "NASA LANCE FIRMS" | sì | basso | **COND** — MAP_KEY personale | T1 | A |
| Smithsonian Global Volcanism Program | RSS/CAP settimanale; database VOTW | — | termini Smithsonian: uso **non commerciale** per contenuti non-PD | robots.txt esclude alcune directory | vulcani olocenici mondiali · settimanale | riassunto + link, citazione | limitato/non chiaro | basso | **COND** — solo metadati e link; segnalare il limite non commerciale | T1 | M |
| USGS Volcano Hazards (HANS) | `volcanoes.usgs.gov/hans-public/api/` | — | PD | — | vulcani USA · a evento | sì | sì | basso | **ADOPT** | T1 | M |
| NOAA NCEI Natural Hazards | REST, database storici | — | PD | — | mondo · storico | sì | sì | basso | **ADOPT** — base storica per correlazioni | T1 | M |
| Copernicus EMS Rapid Mapping | `mapping.emergency.copernicus.eu/activations/api/` | — | accesso libero e aperto (Reg. UE 2021/696) | alcuni prodotti riservati; **`activationTime` senza fuso** (assunto UTC con incertezza); testo descrittivo talvolta incoerente con i campi strutturati (prevalgono i campi strutturati) | mondo, su attivazione | sì, con citazione | sì | basso | **ADOPT** | T1 | A |
| EFFIS (JRC / CEMS) | WMS/WFS, download | — | CC BY 4.0 | storici tramite modulo (import manuale) | Europa, MENA · giornaliero/NRT | sì con attribuzione | sì | basso | **ADOPT** | T1 | A |
| GWIS (JRC / CEMS) | servizi web | — | CC BY 4.0 | — | mondo · giornaliero | sì | sì | basso | **ADOPT** (da verificare in dettaglio) | T1 | M |
| GloFAS / EFAS (CEMS / ECMWF) | EWDS (stesso stack del CDS), WMS | acct | CC BY 4.0 (dal 2025-07) | code di elaborazione; alcuni prodotti EFAS riservati alle autorità | mondo / Europa · giornaliero | sì con citazione | sì | basso | **OPT-IN** — dati pesanti, GDACS copre già gli allarmi | T1 | M |
| Protezione Civile (DPC, GitHub `pcm-dpc`) | file in repository Git | — | CC BY 4.0 (bollettini idro); altri repo da verificare | preferire `git pull` | Italia · giornaliero | sì, "Dipartimento della Protezione Civile" | sì | basso (dipende da GitHub) | **ADOPT** | T1 | M-A |

## 3. Meteorologia e clima

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MeteoAlarm (EUMETNET) | JSON/Atom/CAP `feeds.meteoalarm.org` | — | equivalente CC BY 4.0 + condizioni | citare la fonte, mostrare sempre l'ora di emissione, ridistribuire l'originale se modificato | ~38 paesi europei · tempo reale | sì, con le 3 condizioni | sì | basso | **COND** | T1 | A |
| DWD Open Data (Germania) | `opendata.dwd.de` (CAP, GRIB, CSV), WMS/WFS | — | CC BY 4.0 | IP registrati per 7 giorni | Germania; modelli globali · minuti-ore | sì; "Quelle: Deutscher Wetterdienst" | sì | basso (obbligo di legge) | **ADOPT** | T1 | A |
| ECMWF Open Data | file GRIB2 `data.ecmwf.int/forecasts/` + mirror cloud | — | CC BY 4.0 (intero catalogo real-time aperto dal 2025-10) | 500 connessioni simultanee; archivio 2–3 giorni | mondo 0,25° · 4 run/giorno | sì con attribuzione | sì | basso | **ADOPT** — per layer derivati (elaborazione GRIB) | T1 | A |
| ECMWF — servizio di consegna ad alto volume | — | — | — | prevede costi di servizio | — | — | — | — | **REJECT** — non a costo zero; usare il sottoinsieme aperto | — | A |
| NOAA / NWS `api.weather.gov` | GeoJSON, CAP, Atom | — (User-Agent obbligatorio) | PD | limite "ragionevole" non dichiarato | USA · tempo reale | sì, rispettare header di cache | sì | basso | **ADOPT** (copertura USA) | T1 | A |
| NOAA NHC (uragani) | GIS e RSS/Atom `nhc.noaa.gov` | — | PD | — | Atlantico, Pacifico orientale · a evento | sì | sì | basso | **ADOPT** | T1 | M |
| MET Norway (`api.met.no`) | REST JSON | — (UA unico obbligatorio) | CC BY 4.0 / NLOD | traffico pesante vietato; cache obbligatoria | mondo · orario | sì con attribuzione | sì | basso | **COND** — alternativa usabile anche commercialmente a Open-Meteo | T1 | M |
| Open-Meteo (API ospitata) | `api.open-meteo.com/v1/…` | — | dati CC BY 4.0; server AGPLv3 | **piano gratuito solo non commerciale**: < 10.000 chiamate/giorno | mondo · orario | sì con attribuzione | **no** sull'API gratuita; sì se self-hosted | medio | **OPT-IN** — non commerciale; endpoint configurabile; per uso commerciale istanza self-hosted da dati AWS Open Data. Nessun codice AGPL incluso in NEXUM | T2 | A |
| Copernicus CDS / ERA5 | `cdsapi` | acct + accettazione licenza per dataset | CC BY 4.0 (dal 2025-07) | a coda | mondo, 1940→oggi · giornaliero | sì con citazione | sì | basso | **OPT-IN** — linee di base storiche | T1 | A |

## 4. Space weather e spazio

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NOAA SWPC | `services.swpc.noaa.gov/json/…` (dominio ora `spaceweather.gov`) | — | PD | file rinominati o ritirati periodicamente | eliosfera · 1 min-giorno | sì, "NOAA SWPC" | sì | basso | **ADOPT** | T1 | A |
| NASA DONKI (CCMC) | `kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/…` | — | PD (NASA) | endpoint diretto senza chiave | eliosfera · a evento | sì | sì | basso | **ADOPT** | T1 | M |
| CelesTrak (T.S. Kelso) | `celestrak.org/NORAD/elements/gp.php?…&FORMAT=json` | — | nessuna licenza esplicita; dati SSA di base USSPACECOM ridistribuibili con citazione | **max 1 download per insieme ogni 2 h**; ~100 MB/giorno per IP; blocco dopo errori ripetuti | tutti gli oggetti pubblici · 2 h | cache **obbligatoria**, citare "CelesTrak" | non dichiarato | basso-medio (gestito da una persona) | **COND** | T2 | M-A |
| SatNOGS DB (Libre Space Foundation) | `db.satnogs.org/api/` | — (token per telemetria) | CC BY-SA 4.0 | non verificati | satelliti amatoriali · continuo | sì, share-alike | sì | basso | **ADOPT** | T3 | M-A |
| Launch Library 2 (The Space Devs) | `ll.thespacedevs.com/2.3.0/` | — | non verificata | **15 req/ora** senza autenticazione; limiti superiori a pagamento | lanci mondiali | cache aggressiva | non verificato | medio | **COND** — pochi aggiornamenti/ora; licenza da confermare | T3 | M |
| NASA API (`api.nasa.gov`) | REST | key gratuita | per lo più PD | DEMO_KEY 30/ora, 50/giorno; chiave 1.000/ora | varia | sì | sì | basso-medio | **COND** — chiave personale, mai DEMO_KEY nel codice | T1 | M-A |
| Copernicus Data Space Ecosystem (Sentinel) | OData, STAC, S3 | acct (OAuth) | licenza Sentinel: libera, completa e aperta | 12 TB / 30 giorni; 10.000 req/mese OData/STAC | mondo · giornaliero | sì, "Contains modified Copernicus Sentinel data [anno]" | sì | basso | **OPT-IN** — immagini satellitari per aree di interesse | T1 | A |
| Earth Search (Element 84, AWS Open Data) | STAC `earth-search.aws.element84.com/v1` | — | Sentinel aperta / Landsat PD | nessuna garanzia di servizio | mondo | sì | sì | medio | **COND** — ricerca metadati; fallback su CDSE | T2 | A |
| Space-Track.org (USSPACECOM) | REST | acct personale | accordo d'uso: niente trasferimento a terzi senza approvazione | < 30 req/min | — | **no** | — | — | **REJECT** come fonte condivisa: CelesTrak fornisce gli stessi dati GP | — | A |
| N2YO | REST | key | proprietaria, termini non chiari | 1.000/ora | — | non chiaro | non chiaro | medio | **REJECT** — duplica CelesTrak + propagazione SGP4 locale | — | M |

## 5. Aviazione

Tutte le fonti ADS-B comunitarie **non filtrano** gli aeromobili che aderiscono a programmi di privacy dei proprietari. Mitigazioni obbligatorie in NEXUM: elenco locale di soppressione, nessun collegamento registrazione → proprietario → persona, tracce di aviazione privata non commerciale **escluse** o solo aggregate/ritardate, indirizzi ICAO di privacy non risolti, conservazione limitata delle tracce grezze ([NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §6).

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OurAirports | CSV `davidmegginson.github.io/ourairports-data/` | — | PD | — | aeroporti mondiali · notturno | sì | sì | basso | **ADOPT** — anagrafica aeroporti di riferimento | T3 | A |
| adsb.lol (comunità) | `api.adsb.lol`; storico giornaliero su GitHub | — (chiave per soli feeder annunciata) | ODbL 1.0 | limiti dinamici non documentati | mondo · ~1 s; storico giornaliero | sì (ODbL, share-alike) | sì | medio | **COND** — preferire lo storico giornaliero; attribuzione ODbL; mitigazioni privacy | T4 | M |
| adsb.fi | `opendata.adsb.fi/api/v2` | — | **solo uso personale non commerciale** | 1 req/s; raggio max 250 NM | mondo (forte Europa) · live | vietata la rivendita | no | medio | **OPT-IN** | T4 | A |
| airplanes.live | `api.airplanes.live/v2` | — | uso educativo non commerciale | ~1 req/s (non verificato) | mondo · live | non verificato | no | medio | **OPT-IN** | T4 | B-M |
| OpenSky Network | REST, OAuth2 | acct | solo ricerca/didattica non profit; **l'uso operativo e automatizzato richiede un accordo scritto** | 400–8.000 crediti/giorno | mondo · 5–10 s | nessuna redistribuzione generale | no | medio | **REJECT** come feed continuo (l'ingestione automatica di NEXUM è uso operativo). Uso manuale di ricerca con account personale dell'utente: possibile, fuori da NEXUM | — | M-A |
| ADS-B Exchange (JETNET) | RapidAPI | key con **carta di credito** | proprietaria | ~10 $/mese | — | — | solo licenza enterprise | alto | **REJECT** — a pagamento | — | M |
| OpenFlights | file su GitHub | — | ODbL + DbCL | **rotte ferme al 2014**, aeroporti al 2017 | — | sì | sì | — | **REJECT** per uso operativo (obsoleta); OurAirports la sostituisce | — | A |

## 6. Navigazione marittima

Mitigazioni obbligatorie: solo navi con IMO, nessuna imbarcazione da diporto o piccolo peschereccio, tracce conservate a bassa risoluzione e aggregate.

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Digitraffic Marine (Fintraffic, Finlandia) | REST + MQTT `meri.digitraffic.fi` | — (header `Digitraffic-User` e gzip obbligatori) | CC BY 4.0 | 60 req/min senza header identificativo | Finlandia, Baltico · tempo reale | sì con attribuzione | sì | basso | **ADOPT** | T1 | A |
| Kystverket AIS (Norvegia) | stream NMEA TCP aperto | — | NLOD | dati aperti già esclusi i piccoli pescherecci e le imbarcazioni da diporto | ZEE norvegese · tempo reale | sì (parte aperta) con attribuzione | sì | basso | **ADOPT** (solo stream aperto) | T1 | A |
| BarentsWatch AIS (Norvegia) | API OAuth | acct | NLOD | — | ZEE norvegese, Artico | sì | sì | basso | **COND** — da verificare direttamente | T1 | M |
| NOAA/BOEM MarineCadastre AIS | file giornalieri (CSV zstd, GeoParquet) | — | CC0 / PD | solo storico | acque costiere USA · periodico | sì | sì | basso-medio | **ADOPT** — base storica | T1 | M-A |
| Global Fishing Watch | API v3 | acct (token) | **CC BY-NC 4.0** | 50.000 req/giorno | mondo (pesca) · ~giornaliero | sì non commerciale | no | basso-medio | **OPT-IN** | T2 | A |
| AISStream.io | WebSocket | key (acct) | **nessuna licenza né termini pubblicati** | 3 connessioni per account | mondo (a macchia) | non verificato | non verificato | medio-alto | **OPT-IN** — lacuna di licenza documentata; nessuna redistribuzione | T4 | M |
| AISHub | feed per soli contributori | acct + **ricevitore AIS proprio** | — | richiede hardware (~€50–300) | — | — | — | — | **REJECT** come predefinita (costo hardware); possibile per chi è già contributore | — | A |

## 7. Trasporti terrestri

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mobility Database (MobilityData) | catalogo CSV/JSON su GitHub | — (API: acct) | catalogo CC0 | **ogni feed GTFS ha la propria licenza** | 6.000+ feed in 99+ paesi | secondo feed | secondo feed | basso | **ADOPT** catalogo; feed **COND** con verifica licenza per feed | T2 | A |
| Digitraffic rail/road (Fintraffic) | REST + MQTT | — | CC BY 4.0 | come la parte marittima | Finlandia · tempo reale | sì | sì | basso | **ADOPT** | T1 | A |

## 8. Infrastrutture ed energia

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ENTSO-E Transparency Platform | REST API | key (token gratuito, richiesto via email; ~3 giorni lavorativi) | CC BY 4.0 per i dataset nell'elenco open data; termini generali della piattaforma | 400 req/min per IP e token; oltre ⇒ 429 e blocco 10 min | Europa · da 15 min a giornaliero | sì con attribuzione | sì (dataset open) | basso | **COND** — token personale; limitatore ben sotto 400/min; licenza da confermare per dataset | T1 | M-A |
| US EIA Open Data API v2 | REST | key | PD (citazione richiesta) | 5.000 righe per richiesta; soglie non pubblicate | USA · varia | sì | sì | basso | **COND** — chiave personale, paginazione lenta | T1 | A |
| OSM — dati "power" (linee, sottostazioni, centrali) | estratti Geofabrik + osmium | — | ODbL | — | mondo · giornaliero | sì (ODbL) | sì | basso | **ADOPT** — fonte primaria per le infrastrutture elettriche | T3 | A |
| Open Infrastructure Map (server del progetto) | tile | — | dati OSM ODbL | nessuna policy per app di terzi; export bulk commerciali | — | — | — | — | **REJECT** come backend: usare OSM direttamente | — | A |
| Global Energy Monitor (tracker) | file Excel dietro modulo (nome/email) | modulo manuale | CC BY 4.0 salvo eccezioni (alcuni record solari CC BY-NC) | nessuna API pubblica | mondo · semestrale | sì con attribuzione della release | sì (escludere i record NC) | basso | **COND** — **download manuale** dell'utente + import locale; non automatizzare il modulo | T2 | A |
| WRI Global Power Plant Database | GitHub | — | CC BY 4.0 | **non più mantenuto dal 2021** (v1.3.0) | mondo · congelato | sì | sì | — | **COND** — solo base storica; sostituito dai tracker GEM | T2 | A |
| Mappa cavi sottomarini TeleGeography | endpoint JSON non documentato del sito | — | **CC BY-NC-SA 3.0**; dati geocodificati venduti separatamente | non è un'API pubblicata | — | NC-SA, non ricompresa in MIT | no | — | **REJECT** come fonte integrata; sostituita dai dati OSM (riga seguente) | — | A |
| OSM — cavi sottomarini e condotte | estratti Geofabrik + osmium (tag `communication=line`/`power=cable` con `location=underwater`, `seamark:type=cable_submarine`, `man_made=pipeline` + `substance`) | — | ODbL | copertura offshore dei cavi incompleta; condotte buone in Europa e Nord America | mondo · giornaliero | sì (ODbL) | sì | basso | **ADOPT** — completezza da misurare | T3 | A (licenza) / M (copertura) |
| GEM Global Gas / Oil Infrastructure Tracker | file dietro modulo; tracciati GIS "su richiesta" | modulo manuale | CC BY 4.0 (licenza generale GEM) | — | mondo · semestrale | sì con attribuzione della release | sì | basso | **COND** — download manuale dell'utente + import | T2 | M |

## 9. Internet e cybersecurity

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NVD API 2.0 (NIST) | REST `services.nvd.nist.gov/rest/json/cves/2.0` | — (key opzionale gratuita) | PD (USA) | 5 req / 30 s senza chiave, 50 / 30 s con chiave | mondo · continuo | sì | sì | basso | **COND** — sincronizzazione incrementale per data di modifica; chiave personale consigliata | T1 | A |
| Cloudflare Radar | API | acct gratuito + token | **CC BY-NC 4.0** | 1.200 req / 5 min (limite generale API) | mondo · continuo | nessuna redistribuzione | no | medio | **OPT-IN** | T2 | A |
| abuse.ch (URLhaus, ThreatFox, MalwareBazaar) | API ed export | key (`Auth-Key` obbligatoria dal 2025) | termini propri: uso gratuito **solo non commerciale**, vietate opere derivate senza consenso | "volumi ragionevoli" | mondo | nessuna redistribuzione | no (abbonamento a pagamento) | alto | **OPT-IN** — solo locale, mai ridistribuito | T2 | A |
| CISA KEV | JSON/CSV | — | CC0 1.0 | — | mondo · a evento | sì | sì | basso | **ADOPT** | T1 | A |
| CVE Program `cvelistV5` | `git pull` o zip giornalieri/orari dalle release GitHub | — | CVE Terms of Use (licenza perpetua, gratuita, irrevocabile; riportare l'avviso MITRE) | aggiornamento ~7 min | mondo | sì con avviso | sì | basso | **ADOPT** — fonte bulk preferita rispetto a NVD | T1 | A |
| MITRE ATT&CK | STIX su GitHub / TAXII | — | licenza MITRE: ricerca, sviluppo e uso commerciale; avviso di copyright obbligatorio | — | catalogo tecniche · periodico | sì con avviso | sì | basso | **ADOPT** — solo catalogo di riferimento | T1 | A |
| MITRE CWE / CAPEC | XML/CSV | — | stessa licenza MITRE | — | cataloghi · periodico | sì con avviso | sì | basso | **ADOPT** | T1 | A |
| FIRST EPSS | CSV giornaliero; `api.first.org/data/v1/epss` | — | attribuzione richiesta (licenza formale non verificata) | limiti non pubblicati | mondo · giornaliero | sì con attribuzione | sì | basso | **COND** — un CSV al giorno, non una richiesta per CVE | T2 | M |
| OSV.dev (Google + fonti) | bulk `gs://osv-vulnerabilities` (zip), API | — | **licenza per fonte**: CC BY 4.0, CC0, MIT, BSD, Apache-2.0; **Ubuntu CC BY-SA 4.0** | nessun limite dichiarato | ecosistemi open source · continuo | secondo la fonte | secondo la fonte | basso | **COND** — licenza registrata per record; record share-alike esclusi dalle esportazioni | T2 | A |
| GitHub Advisory Database | `git clone github/advisory-database` (JSON OSV) | — | CC BY 4.0 | clone senza token | ecosistemi open source | sì con attribuzione | sì | basso | **ADOPT** | T2 | A |
| CERT-EU | RSS per categoria | — | CC BY 4.0 salvo indicazione (politica di riuso UE) | poche letture al giorno | UE | sì con attribuzione | sì | basso | **ADOPT** | T1 | A |
| CSIRT Italia (ACN) | pagine alert e bollettini | — | **copyright**: riproduzione e pubblicazione solo con permesso scritto | — | Italia | solo titolo, link, data, ID CVE | no (senza permesso) | basso | **COND** — solo metadati e link | T1 | A |
| ENISA EUVD | API pubblica | — (User-Agent descrittivo) | **termini non verificati** (sito non raggiungibile durante la verifica) | ~2 req/s adottati da connettori di terzi | UE/mondo | da verificare | da verificare | basso | **COND** — connettore possibile, nessuna redistribuzione finché i termini non sono verificati | T1 | B |
| RIPEstat Data API (RIPE NCC) | REST | — (`sourceapp` oltre 1.000 req/giorno) | termini RIPEstat: uso commerciale solo con permesso scritto; vietato ri-confezionare o ridistribuire | — | Internet mondiale | no | no | basso | **OPT-IN** — interrogazioni live dell'utente, nessuna redistribuzione | T1 | A |
| IODA (Georgia Tech) | API `api.ioda.inetintel.cc.gatech.edu/v2/` | — | licenza dati non pubblicata; software solo ricerca/didattica | non pubblicati | interruzioni Internet per paese/ASN | no | non chiaro | medio | **OPT-IN** — ricerca, attribuzione, richiesta scritta dei termini | T1 | B |
| PeeringDB | REST | — / key (acct) | AUP: solo scopi operativi Internet, vietato uso commerciale e trasferimento bulk a terzi | 20 req/min anonimi, 40 con chiave | interconnessioni mondiali | no | no | basso | **OPT-IN** — solo oggetti org/net/ix/fac, **mai** i contatti di persone | T3 | A |
| CAIDA (dataset pubblici) | download | acct | AUA pubblica: licenza limitata, non trasferibile; citazione obbligatoria | — | Internet (AS) | no | trattare come solo ricerca | basso | **OPT-IN** — download manuale dell'utente | T1 | M |

## 10. Dati economici pubblici

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| World Bank Indicators | `api.worldbank.org/v2/` | — | CC BY 4.0 (quasi tutti i dataset) | nessun limite pubblicato | 200+ economie · più volte l'anno | sì con attribuzione | sì | basso (possibile migrazione a Data360) | **ADOPT** | T1 | A |
| IMF Data | SDMX `api.imf.org/external/sdmx/3.0` | — o key (non verificato) | termini IMF: riuso con attribuzione, nessuna alterazione ingannevole | non verificati | mondo | sì con attribuzione | sì con condizioni | basso | **COND** — supporto chiave opzionale | T1 | M |
| OECD | SDMX `sdmx.oecd.org/public/rest/` | — | CC BY 4.0 | **60 query/ora** | paesi OCSE | sì | sì | basso-medio | **COND** — cache aggressiva, sincronizzazione pianificata | T1 | A |
| Eurostat | `ec.europa.eu/eurostat/api/dissemination/` | — | politica di riuso UE (≈ CC BY 4.0) | richieste grandi asincrone | UE · 2 volte/giorno | sì | sì | basso | **ADOPT** | T1 | A |
| ECB Data Portal | SDMX `data-api.ecb.europa.eu/service/` | — | riuso libero citando la fonte | — | area euro · giornaliero | sì | sì | basso | **ADOPT** | T1 | M-A |
| BIS Data Portal | SDMX `stats.bis.org/api/v2/` | — | riuso con attribuzione | — | mondo | sì | sì | basso | **ADOPT** (da verificare) | T1 | M |
| ISTAT | SDMX `esploradati.istat.it/SDMXWS/rest/` | — | CC BY 4.0 | **5 query/min per IP; oltre ⇒ blocco 1–2 giorni** | Italia | sì | sì | basso | **COND** — limitatore rigido ≤ 4/min | T1 | A |
| Banca d'Italia (BDS) | API | — | open data con attribuzione | — | Italia | sì | sì | basso | **ADOPT** (da verificare) | T1 | M |
| FRED (Fed St. Louis) | `api.stlouisfed.org/fred/` | key (acct) | termini FRED: disclaimer obbligatorio; serie "Copyright" di terzi escluse; licenza revocabile | ~120 req/min | ~800k serie | niente dati pre-distribuiti | con condizioni | basso (revoca possibile) | **COND** — chiave personale, filtrare serie protette, disclaimer | T1 | A |
| UN Comtrade | `comtradeapi.un.org` | key (acct) | licenza Comtrade: redistribuzione di dati originali oltre 100.000 record **a pagamento** | 500 chiamate/giorno | commercio mondiale | solo aggregati/trasformati | con condizioni | medio | **COND** — solo cache locale, pubblicare solo aggregati | T1 | M-A |
| UN SDG API | `unstats.un.org/sdgapi/` | — | termini ONU (licenza dati non verificata) | — | mondo · annuale | con attribuzione | da verificare | basso | **COND** | T1 | M |
| GLEIF LEI | `api.gleif.org/api/v1/` | — | CC0 | — | persone giuridiche mondiali · giornaliero | sì | sì | basso | **ADOPT** — risoluzione di entità societarie | T1 | M |
| SEC EDGAR | `data.sec.gov` | — (User-Agent dichiarato) | PD | 10 req/s | società USA | sì | sì | basso | **ADOPT** | T1 | M |

## 11. Open government data e liste ufficiali

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| data.europa.eu | API di ricerca, SPARQL | — | metadati aperti; **licenza per dataset** | — | UE | secondo dataset | secondo dataset | basso | **COND** — catalogo di scoperta; licenza registrata per dataset | T1 | M-A |
| dati.gov.it (AgID) | CKAN `dati.gov.it/opendata/api/3/action/` | — | per dataset (spesso CC BY 4.0, IODL 2.0) | — | Italia, ~65k dataset | secondo dataset | secondo dataset | basso | **COND** — come sopra | T1 | A |
| data.gov (USA, GSA) | nuova API dietro `api.data.gov` | key | metadati PD; dataset per agenzia | ~1.000 req/ora | USA | secondo dataset | secondo dataset | basso (piattaforma instabile) | **COND** — solo nuova API; il vecchio CKAN è in dismissione | T1 | M |
| Lista consolidata sanzioni finanziarie UE | XML/RSS pubblici (webgate.ec.europa.eu) | — (token pubblico nella pagina) | politica di riuso UE | — | a modifica normativa | sì con attribuzione | sì | basso | **ADOPT** — **solo voci di organizzazioni, navi e aeromobili** | T1 | M-A |
| OFAC SDN (Tesoro USA) | `sanctionslistservice.ofac.treas.gov` | — | PD | — | più volte a settimana | sì | sì | basso | **ADOPT** — stessa regola sulle persone fisiche | T1 | A |
| Lista consolidata del Consiglio di Sicurezza ONU | XML `scsanctions.un.org` | — | termini ONU | — | a modifica | sì con attribuzione | sì | basso | **ADOPT** — stessa regola | T1 | M |
| OpenSanctions | bulk e API | API con key limitata | **CC BY-NC 4.0**; uso commerciale a pagamento | — | — | non commerciale | no | alto | **REJECT** come fonte predefinita; le liste ufficiali sopra forniscono i dati di base | — | A |

## 12. Eventi, conflitti e contesto umanitario

| Fonte (proprietario) | Endpoint / accesso | Auth | Licenza | Limiti e note | Copertura · aggiornamento | Cache / redistribuzione | Commerciale | Rischio futuro | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GDELT 2.0 | file ogni 15 min (`data.gdeltproject.org/gdeltv2/lastupdate.txt`); API DOC/GEO | — | uso libero anche commerciale con citazione e link | API DOC ~1 req/5 s (non verificato) | mondo · 15 min | sì, anche mirror | sì | basso-medio (progetto con un solo manutentore) | **ADOPT** — file, **non** la via BigQuery (richiede account cloud con fatturazione) | T6 | A |
| ReliefWeb (ONU OCHA) | `api.reliefweb.int/v2/` | `appname` **pre-approvato** (dal 2025-11) | termini ReliefWeb; i report restano dei rispettivi autori | ~1.000 chiamate/giorno | mondo | solo metadati e link | con condizioni | basso | **COND** — appname registrato da ogni installazione | T2 | M-A |
| UCDP (Uppsala) | API (token gratuito via email) e CSV bulk | token | CC BY 4.0 | ~5.000 req/giorno | mondo · annuale/mensile | sì con attribuzione | sì | basso-medio | **COND** — preferire CSV bulk | T1 | M-A |
| ACLED | API con account | acct | EULA: **non commerciale**, nessuna redistribuzione, scraping vietato | — | — | no | no | alto | **REJECT** — incompatibile con distribuzione MIT aperta; sostituita da UCDP | — | A |

## 13. News / RSS

| Fonte | Accesso | Auth | Licenza | Regole NEXUM | Verdetto | Tier | Conf. |
|---|---|---|---|---|---|---|---|
| Feed RSS/Atom di editori | HTTP | — | tutti i diritti riservati salvo diversa indicazione; in UE diritto degli editori (Dir. 2019/790, art. 15) | solo **titolo, link, data, fonte, breve descrizione fornita dall'editore**; nessun testo completo; robots.txt e termini del feed; ETag; polling ≥ 15–60 min; **feed scelti dall'utente**, NEXUM fornisce al massimo un elenco di URL di esempio | **COND** | T5 | M |
| Feed istituzionali (agenzie, protezione civile, CERT, organismi internazionali) | RSS/Atom | — | secondo l'ente (spesso open) | come sopra; testo completo solo se la licenza lo consente | **COND** | T2 | M |
| Common Crawl News (CC-NEWS) | file WARC | — | termini Common Crawl; gli articoli restano degli editori | solo metadati per analisi locale; molto pesante | **OPT-IN** | T6 | M-A |

## 14. Fonti escluse — riepilogo

| Fonte | Motivo |
|---|---|
| ADS-B Exchange | a pagamento, carta di credito |
| OpenSky Network (feed continuo) | l'uso operativo automatizzato richiede accordo scritto |
| AISHub (predefinita) | richiede hardware proprio |
| OpenFlights (operativa) | dati fermi al 2014 |
| Tile server OSM come basemap | vietati prefetch e uso offline |
| Space-Track.org (condivisa) | redistribuzione vietata senza approvazione |
| N2YO | proprietaria, termini non chiari, duplicato |
| ECMWF consegna ad alto volume | costi di servizio |
| Open Infrastructure Map (server) | nessuna policy per terzi; export commerciali |
| TeleGeography (cavi sottomarini) | CC BY-NC-SA, endpoint non pubblicato |
| OpenSanctions (predefinita) | CC BY-NC, uso commerciale a pagamento |
| ACLED | EULA non commerciale, redistribuzione vietata |
| GDELT via BigQuery | richiede account cloud con fatturazione |
| Endpoint non ufficiali di portali finanziari | nessuna API pubblica, termini incompatibili |
| Mappe di conflitto di siti di terzi | contenuti protetti senza licenza di riuso |
| Canali Telegram e altri social | contenuti di utenti, profilazione; fuori scopo |
| Webcam / CCTV | fuori scopo (sorveglianza), termini dei siti |
| Servizi di breach, infostealer, ricerca username/email/telefono | dati personali, profilazione — funzione vietata |
| Servizi di scansione di host | interazione attiva con sistemi di terzi — funzione vietata |
| LLM o analytics a pagamento | viola il vincolo €0 |

## 15. Fonti da verificare in seguito

- Licenza formale GDACS (richiesta scritta ai gestori).
- Testo completo dei termini Smithsonian GVP (pagina non accessibile durante la verifica).
- Licenza e termini commerciali di Launch Library 2.
- Limiti numerici USGS, INGV, EMSC, NWS, SWPC (non pubblicati: adottare default prudenti).
- Danish Maritime Authority (AIS storico), Microsoft Planetary Computer.
- Avvisi pubblicati sulla pagina news di NVD nel 2025–2026.
- Termini e licenza dati di ENISA EUVD (sito non raggiungibile durante la verifica).
- Termini d'uso dei dati IODA (richiesta scritta al gruppo di ricerca).
- Formulazione formale della licenza EPSS.
- Autenticazione effettivamente richiesta dall'API IMF.
