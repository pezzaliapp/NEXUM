# NEXUM — Architettura

Stato: progetto v0.1 — nessuna implementazione. Tutte le tecnologie proposte sono open source e utilizzabili a costo €0.

---

## 1. Requisiti architetturali

| Requisito | Conseguenza |
|---|---|
| Costo operativo €0 | Nessun server gestito, nessun database cloud, nessuna API a pagamento. |
| Local-first | Tutto gira su un solo computer (laptop o mini-PC); nessuna dipendenza da servizi propri online. |
| Offline quando possibile | Dati già acquisiti, mappe di base e analisi funzionano senza rete. |
| Semplice e modulare | Un processo, un archivio, un connettore per fonte. |
| Provenienza e riproducibilità | Dato grezzo immutabile, derivazioni rigiocabili. |
| Rispetto delle fonti | Scheduler centralizzato che applica rate limit, cache e richieste condizionali. |

## 2. Vista logica

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NEXUM (processo locale)                     │
│                                                                      │
│  ┌────────────┐   ┌────────────┐   ┌─────────────┐   ┌────────────┐  │
│  │ CONNECTORS │──►│ RAW STORE  │──►│  PIPELINE   │──►│   GRAPH    │  │
│  │ (1/fonte)  │   │ (file zstd │   │ parse →     │   │   STORE    │  │
│  │ + Source   │   │  per hash) │   │ normalize → │   │ (SQLite)   │  │
│  │  Registry  │   └────────────┘   │ resolve     │   └─────┬──────┘  │
│  └─────▲──────┘                    └─────────────┘         │         │
│        │ POLITE SCHEDULER                                  ▼         │
│        │ (rate limit, ETag, backoff)             ┌──────────────────┐ │
│        │                                         │ CORRELATION      │ │
│        │                                         │ ENGINE (regole)  │ │
│        │                                         └────────┬─────────┘ │
│        │                                                  ▼          │
│        │                               ┌───────────────────────────┐ │
│        │                               │ LOCAL API (HTTP 127.0.0.1)│ │
│        │                               └────────────┬──────────────┘ │
└────────┼────────────────────────────────────────────┼────────────────┘
         │                                            ▼
   Fonti pubbliche                       ┌───────────────────────────┐
   (HTTP, rispettose)                    │ WEB UI locale             │
                                         │ mappa · timeline · grafo  │
                                         └───────────────────────────┘
```

## 3. Moduli

### 3.1 Source Registry

File dichiarativi (YAML/TOML), uno per fonte, versionati in Git. Contengono i campi di `Source` ([NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) §2): licenza, attribuzione, autenticazione, rate limit, verdetto. **Un connettore non può partire se la sua fonte non è registrata con `verdict ≠ reject`.** Il registro è anche la fonte del file di attribuzioni mostrato nell'interfaccia.

### 3.2 Connectors

- Un modulo per fonte, con interfaccia minima: `plan()` (quali richieste fare), `fetch()` (tramite lo scheduler), `parse(raw) → records normalizzati`.
- User-Agent onesto e identificabile (`NEXUM/<versione> (+URL progetto)`), come richiesto da molte fonti (es. Wikimedia, NWS).
- Nessuna rotazione di identità, nessuna falsificazione di header, nessun proxy per aggirare limiti.
- Chiavi gratuite (quando necessarie) fornite dall'utente nel proprio file locale di configurazione, mai nel repository.

### 3.3 Polite Scheduler

- Rate limit per fonte, dichiarato nel registro; il più restrittivo tra quello documentato e quello di default NEXUM.
- Richieste condizionali (`If-None-Match`, `If-Modified-Since`) e rispetto di `Cache-Control`/`Retry-After`.
- Backoff esponenziale su errori e 429; sospensione automatica del connettore dopo errori ripetuti.
- Preferenza per **feed aggregati e file bulk** rispetto a molte richieste puntuali.
- Controllo di `robots.txt` per le fonti web non-API.

### 3.4 Raw Store

Directory locale di file compressi (`zstd`), indirizzati per SHA-256, con indice nel database. Immutabile. Politiche di conservazione configurabili per fonte (es. posizioni di trasporto: 7 giorni di dettaglio, poi solo aggregati).

### 3.5 Pipeline

1. **Parse**: raw → record normalizzati (unità SI, UTC, WGS84).
2. **Resolve**: associazione a Object esistenti tramite `Identifier`, poi tramite regole di prossimità + nome (con soglia di confidenza); in caso di dubbio si crea un nuovo oggetto e si propone una fusione, mai una fusione silenziosa.
3. **Materialize**: scrittura di Object, Claim, Relation, Event con Provenance e Confidence.
4. **Compute**: relazioni calcolate (`located_in`, `near`) incrementali.

Ogni passo è deterministico e versionato; la pipeline può essere rieseguita da zero sul Raw Store.

### 3.6 Graph Store

**Scelta raccomandata: SQLite** (pubblico dominio).

- Un solo file, nessun server, backup = copia del file.
- `R*Tree` integrato per indici spaziali su bounding box; `FTS5` integrato per ricerca testuale.
- Grafo modellato come tabelle `object`, `relation`, `event`, `claim`, ecc.; attraversamenti con CTE ricorsive.
- Geometrie in GeoJSON; calcoli geometrici precisi nel codice applicativo con librerie open source.

**Opzionale: DuckDB** (MIT) per analisi pesanti e per leggere/scrivere file Parquet (esportazioni, dataset storici), in sola lettura sul file SQLite o su esportazioni.

Scartati per la fase iniziale: server di database a grafo e motori di ricerca distribuiti — funzionano gratis self-hosted, ma aggiungono processi, memoria e complessità non giustificati dal volume atteso (milioni, non miliardi, di righe).

### 3.7 Correlation Engine

Vedi §6.

### 3.8 Local API

Server HTTP legato a `127.0.0.1` (non esposto in rete per default). Endpoint di sola lettura per UI e script: oggetti, eventi in finestra spazio-temporale, vicini nel grafo, timeline di un oggetto, ipotesi, attribuzioni.

### 3.9 Web UI locale

- **Mappa**: MapLibre GL JS (BSD-3-Clause), con mappa di base **vettoriale locale** in un file PMTiles (formato aperto, BSD) generato da dati OpenStreetMap (ODbL, con attribuzione). Nessun tile server esterno richiesto; funziona offline.
- **Timeline**: vista temporale unica, filtrabile per dominio, con replay.
- **Grafo**: vista dei vicini di un oggetto (profondità 1–2), non un "grafo di tutto".
- **Pannello provenienza**: per ogni elemento, fonte, licenza, raw record, confidenza scomposta.
- Identità visiva **originale**: palette, icone (set open source con licenza compatibile, es. MIT/ISC) e terminologia NEXUM.

## 4. Stack proposto (da confermare in fase di implementazione)

| Componente | Proposta | Licenza | Costo |
|---|---|---|---|
| Linguaggio backend/ingestion | Python 3 | PSF | €0 |
| Database | SQLite | Public domain | €0 |
| Analisi opzionale | DuckDB | MIT | €0 |
| API locale | framework HTTP Python leggero (es. FastAPI o Starlette) | MIT / BSD | €0 |
| Geometria | Shapely (GEOS) | BSD / LGPL (dinamica) | €0 |
| Parsing feed | feedparser | BSD-2 | €0 |
| Orbite | sgp4 | MIT | €0 |
| Frontend mappa | MapLibre GL JS | BSD-3 | €0 |
| Basemap offline | PMTiles da OSM | BSD (formato) / ODbL (dati) | €0 |
| Compressione | zstd | BSD | €0 |
| CI | GitHub Actions (repository pubblico) | — | €0 |

Nota di compatibilità: MIT per il codice NEXUM è compatibile con dipendenze MIT/BSD/ISC/Apache-2.0/PSF. Librerie LGPL (es. GEOS tramite Shapely) sono usate come dipendenze dinamiche e non incorporate. **Nessuna dipendenza GPL/AGPL** nel codice distribuito, salvo verifica esplicita.

I **dati** hanno licenze proprie (ODbL, CC BY, ecc.) indipendenti dalla licenza MIT del codice: il repository non conterrà dataset di terzi, solo connettori che li scaricano sulla macchina dell'utente.

## 5. Distribuzione a €0

| Modalità | Descrizione |
|---|---|
| **Locale (primaria)** | `git clone` + installazione Python; un comando avvia scheduler, API e UI. |
| **Container (opzionale)** | Dockerfile per chi preferisce; nessun registry a pagamento richiesto. |
| **Snapshot statico (opzionale)** | Esportazione di una vista (GeoJSON/Parquet + pagina HTML statica) pubblicabile su hosting statico gratuito. Solo dati con `redistribution` compatibile. |

Scartati: hosting con piani free a rischio di conversione a pagamento come **requisito** dell'architettura. Possono essere usati dall'utente, ma NEXUM non ne dipende.

## 6. Motore di correlazione

### 6.1 Principi

- **Regole dichiarative**, leggibili, versionate (file di configurazione), ognuna con un'**explanation template**.
- Nessun modello di machine learning nella fase iniziale: prima si misura cosa funziona con regole trasparenti.
- Le correlazioni producono **ipotesi**, mai modifiche ai dati.

### 6.2 Primitive

| Primitiva | Descrizione | Implementazione |
|---|---|---|
| **Spaziale** | entro distanza, dentro area, lungo linea | R*Tree per il prefiltro, geometria esatta in seguito |
| **Temporale** | entro Δt, prima/dopo, sovrapposizione di intervalli | indici su `t_start` / `t_end` |
| **Grafo** | oggetto collegato a X entro k salti | CTE ricorsive, profondità limitata |
| **Semantica** | stesso identificatore, stessa entità citata | tabella `identifier`, FTS5 per metadati di notizie |
| **Statistica semplice** | valore fuori dalla norma storica (z-score, percentili) | su serie temporali dei claim |

### 6.3 Forma di una regola (illustrativa, non codice)

```yaml
id: fire_near_power_line
version: 1
when:
  event: fire.hotspot
  min_confidence: 0.6
match:
  object: infra.power_line
  spatial: { within_km: 3 }
then_look_for:
  event: energy.unavailability
  temporal: { after: 0h, within: 48h }
  graph: { object_linked_via: [part_of, connects], max_hops: 2 }
strength: 0.5
explain: >
  Hotspot {fire.id} a {distance_km} km dalla linea {line.label};
  indisponibilità {outage.id} registrata {delta_h} h dopo.
```

### 6.4 Punteggio

`score = strength(regola) × min(confidenza dei membri) × fattore_prossimità × fattore_temporale`

- `fattore_prossimità` e `fattore_temporale` decrescono linearmente con distanza e Δt entro la finestra della regola.
- Più regole indipendenti sulla stessa coppia di eventi si combinano con noisy-OR.

### 6.5 Esecuzione

- **Incrementale**: ogni nuovo evento attiva solo le regole in cui compare il suo tipo.
- **Batch**: ricalcolo completo notturno o su richiesta (utile dopo modifiche alle regole).
- Limiti rigidi su risultati per regola, per evitare esplosioni combinatorie.

### 6.6 Valutazione

Ogni regola ha un file di casi di test (eventi storici noti con esito atteso). Gli utenti possono marcare ipotesi come confermate o scartate; i conteggi restano locali e servono a tarare `strength`.

## 7. Local-first e offline

| Funzione | Online | Offline |
|---|---|---|
| Acquisizione nuovi dati | ✔ | ✘ (coda, riprende alla riconnessione) |
| Consultazione dati acquisiti | ✔ | ✔ |
| Mappa di base | ✔ | ✔ (PMTiles locale) |
| Correlazione | ✔ | ✔ sui dati presenti |
| Riferimenti statici (paesi, aeroporti, vulcani, centrali) | ✔ | ✔ (snapshot periodici locali) |

Risorse indicative (da misurare): basemap regionale 100 MB–2 GB, basemap mondiale a bassa scala < 1 GB; database di lavoro sotto qualche GB con politiche di conservazione attive.

## 8. Sicurezza

- API legata a `localhost`; nessuna autenticazione esposta in rete nella configurazione di default.
- Chiavi gratuite di terzi in file locale escluso da Git.
- Connettori limitati a una **allowlist di host** dichiarata nel Source Registry: nessuna richiesta a URL arbitrari forniti dall'utente (niente proxy aperti).
- Nessuna funzione di scansione, sondaggio o interazione attiva con sistemi di terzi.

## 9. Anti-obiettivi architetturali

- Nessun microservizio, coda distribuita o orchestratore nella fase iniziale.
- Nessuna dipendenza da SaaS proprietari (analytics, error tracking, LLM a pagamento).
- Nessuna funzione che richieda un server pubblico acceso 24/7.
