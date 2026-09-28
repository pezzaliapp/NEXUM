# NEXUM — Specifica della Fase 1: NEXUM Core

Stato: **v0.2 APPROVATA dall'autore il 2026-09-28** (revisione della v0.1 alla luce della Product Vision) · Data: 2026-09-28 · Autore: Alessandro Pezzali
Prerequisiti: documenti della Fase 0; decisione "Opzione A — zero import" ([NEXUM-OSIRIS-CODE-AUDIT.md](NEXUM-OSIRIS-CODE-AUDIT.md)).

> Questa specifica **non contiene codice applicativo**. Schemi, firme e formati sono contratti di progetto. L'implementazione inizia solo dopo il GO dell'autore.

---

## 0. Sommario

> **"NEXUM is a world of Objects, Relations and Events that can be observed through Map, Graph, Timeline and Search."**
> *NEXUM è un mondo di Objects, Relations ed Events che può essere osservato attraverso Map, Graph, Timeline e Search.*

La Fase 1 costruisce il **NEXUM Core**: il motore che mantiene un unico **NEXUM WORLD**, indipendente dal dominio, local-first e a costo €0.

```
SOURCE → RAW DATA → NORMALIZATION → OBJECTS ↔ RELATIONS ↔ EVENTS → TIMELINE → CORRELATION → INSIGHTS
                                              │
                                        NEXUM WORLD (uno solo)
                                              │
        MAP · GRAPH · TIMELINE · SEARCH · OBJECT VIEW · EVENT VIEW · RELATIONS · INSIGHTS · SOURCES · FILTERS
                               (viste dello stesso mondo, nessuna copia dei dati)
```

La Fase 1 dimostra il Core con **due test architetturali complementari**:

| Test | Paradigma | Dati | Cosa dimostra |
|---|---|---|---|
| **PoC 1 — Myanmar** | spaziale / temporale | 4 fonti ADOPT reali: USGS, OurAirports, Natural Earth, Copernicus EMS | associazione tra eventi di fonti diverse e contesto geografico |
| **Test 2 — Mondo non geografico** | relazionale / senza coordinate | fixture deterministiche (vulnerabilità → software → prodotto → organizzazione → evento di sicurezza → fonte → evidenza) | lo **stesso Core**, senza modifiche, rappresenta e correla un mondo privo di geografia |

Principi: **CORRELATION IS NOT CAUSATION** · **Geography is a property of the world, not the architecture** · **DENSITY WITHOUT CHAOS** · **ONE OBJECT. MANY RELATIONS. ONE TIMELINE.**

---

## 1. Product Vision come requisiti

### 1.1 La STORY è un requisito

| Frase della STORY | Requisito di prodotto | Dove è garantito |
|---|---|---|
| "Unisci i puntini. Decodifica la complessità." | il valore primario è la **relazione**, non il dato singolo | §11 Relations, §19 Correlation, §21 Traversal |
| "Il problema non è trovare altri dati. È capire quali hanno qualcosa in comune." | ogni oggetto/evento espone ciò che condivide con altri (relazioni, eventi comuni, luoghi, fonti) | §21 OBJECT MODE, operazione `context` |
| "Mondi diversi normalmente rimangono separati. NEXUM prova a metterli in relazione." | un solo mondo multi-dominio; nessun silo per fonte o dominio | §4 NEXUM WORLD, §28.5 mondo misto |
| "Non una raccolta di dashboard. Non un'altra mappa piena di punti." | nessuna vista possiede dati propri; la mappa è una vista tra le altre | §21 ONE WORLD / MULTIPLE VIEWS, P30–P33 |
| "Ogni informazione mantiene la propria fonte, il proprio tempo e il proprio contesto." | provenienza, tempo e contesto obbligatori per ogni affermazione | §15 Evidence & Provenance, §13 Time |
| "NEXUM cerca le relazioni tra gli eventi e mostra perché quel nesso esiste." | ogni insight ha evidenze navigabili e spiegazione | §20 Insight, §21.4 evidence traversal |
| "Dati separati raccontano fatti. Collegati, possono raccontare qualcosa in più." | criterio di accettazione: almeno un insight per test che **nessuna fonte singola** contiene | P20, P40 |

### 1.2 Domande a cui NEXUM deve saper rispondere

La mappa risponde soprattutto a *"cosa succede e dove?"*. NEXUM deve rispondere anche alle domande seguenti, ciascuna mappata su un'operazione del Core (§22):

| Domanda | Operazione |
|---|---|
| Che cosa sto osservando? | `get_entity`, `context` |
| A cosa è collegato? | `relations`, `neighborhood` |
| Quando è successo? | `entity_timeline`, `project_timeline` |
| Quali altri eventi sono collegati? | `related_events`, `timeline_neighbors` |
| Quali fonti sostengono questa informazione? | `sources_of`, `provenance_chain` |
| Quali evidenze sostengono questa relazione? | `evidence_of` |
| Perché NEXUM considera interessante questo nesso? | `get_insight` (regola, fattori, spiegazione) |
| Come cambia il contesto se parto da un altro Object? | `context` sul nuovo fuoco + `trail_context` (§21.3) |

### 1.3 Cosa NEXUM non deve diventare

| Anti-obiettivo | Contromisura architetturale |
|---|---|
| Un clone o un'evoluzione di EarthRadar ("cosa e dove", mappa + layer) | modello a grafo con geografia opzionale; test non geografico obbligatorio (P27, P41); la mappa non ha operazioni privilegiate |
| Una raccolta di dashboard | nessuna vista con dati propri; un solo contratto di query (§22) |
| Una mappa OSINT con un correlation engine aggiunto | la correlazione opera su pattern di grafo, tempo ed evidenza, e solo opzionalmente sullo spazio; le regole senza geografia sono di prima classe (§19) |
| Un fork di OSIRIS | zero import (decisione A); criterio P25 |
| Un clone di prodotti proprietari di data intelligence | vocabolario generico, identità, UX e codice originali ([NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §8) |

### 1.4 Identità

- Nome: **NEXUM** · Claim: **ONE OBJECT. MANY RELATIONS. ONE TIMELINE.** · Destinazione prevista: `nexum.pezzaliapp.com` (nessun deployment né DNS in Fase 1).
- OSIRIS e prodotti commerciali sono solo riferimenti concettuali: nessun codice, layout, grafica, marchio, logo, icona, testo, nomenclatura proprietaria, asset o design distintivo.

---

## 2. Obiettivi, non-obiettivi, vincoli

### 2.1 Obiettivi della Fase 1

1. **NEXUM WORLD** unico, multi-dominio, con Objects, Relations, Events, Time, Location, Evidence, Provenance, Confidence, Insight.
2. Core **domain-agnostic**: nessun concetto di dominio nel codice del Core (§5.2).
3. **Provenienza end-to-end** e **riproducibilità** (stessi raw + stesse versioni ⇒ stesso mondo, stessi ID).
4. **Correlazione generica** basata su pattern, con regole dichiarative spaziali e non spaziali.
5. **Contratto di query per viste multiple** (Map, Graph, Timeline, Search, viste di dettaglio), con WORLD MODE e OBJECT MODE, pensato per un workspace ad alta densità **senza mai scaricare il database intero**.
6. **Offline** dopo l'acquisizione; **aggiornamenti incrementali** (live quando la fonte lo consente) tramite versione del mondo.

### 2.2 Non-obiettivi

- Nessuna UI; nessun server HTTP pubblico. Il contratto è implementato come query layer in-process con DTO serializzabili; l'esposizione HTTP su `127.0.0.1` è in Fase 2.
- Nessun ML, nessun LLM, nessuna API AI.
- Nessuna fonte OPT-IN, con chiave, o con dati personali.
- Nessuna dipendenza di runtime di terze parti.

### 2.3 Vincoli invariati

Costo €0 · local-first · nessuna API a pagamento · nessun SaaS obbligatorio · nessun LLM/API AI necessario · fonti lecite · provenienza completa · autore unico Alessandro Pezzali, nessun coautore · zero codice OSIRIS · architettura globale (Italia solo area iniziale di validazione).

---

## 3. Decisioni tecniche della Fase 1

| Tema | Decisione | Motivazione |
|---|---|---|
| Linguaggio del Core | **Python ≥ 3.12** (ambiente: 3.12.6) | stdlib sufficiente |
| Database | **SQLite** via `sqlite3` (ambiente: 3.45.3; **R*Tree e FTS5 verificati**) | un file, nessun server |
| Dipendenze di runtime | **nessuna** oltre la stdlib | €0, superficie minima |
| Dipendenze di sviluppo | `pytest` (MIT) | test |
| HTTP | `urllib.request`, solo dentro lo Scheduler | cortesia centralizzata |
| Raw Store | **gzip** + campo `codec` | zstd non disponibile nella stdlib 3.12 |
| Configurazione (registro, tipi, regole) | **TOML** (`tomllib`) | leggibile, senza dipendenze |
| Identificatori | **deterministici** per il mondo; ULID solo per esecuzioni e raw (§8.4) | riproducibilità |
| Tempo | UTC in millisecondi, con precisione e incertezza | confronto semplice |
| UI futura | **TypeScript + MapLibre candidato**, nessuna decisione | fuori dalla Fase 1 |

---

## 4. Modello concettuale: il NEXUM WORLD

### 4.1 I 14 concetti

| Concetto | Definizione nel Core | Obbligatorio per ogni elemento? |
|---|---|---|
| **SOURCE** | fonte registrata con licenza, termini, affidabilità, gruppo di indipendenza | sì (via provenienza) |
| **RAW RECORD** | byte immutabili ricevuti dalla fonte | sì (via provenienza) |
| **OBJECT** | entità persistente e identificabile | — |
| **OBJECT TYPE** | tipo dichiarato in configurazione (identità, proprietà, geometria ammessa) | sì per ogni Object |
| **RELATION** | arco tipizzato, orientato, con validità temporale, tra due Objects | — |
| **RELATION TYPE** | tipo dichiarato: estremi ammessi, **natura** (`spatial`, `logical`, `temporal`, `infrastructural`, `organizational`, `technological`, `informational`), simmetria | sì per ogni Relation |
| **EVENT** | qualcosa che accade in un tempo, con partecipanti | — |
| **EVENT TYPE** | tipo dichiarato: ruoli ammessi, normalizzazione della severità | sì per ogni Event |
| **TIME** | istante/intervallo con precisione e incertezza; valid time + recorded time | sì per Events; opzionale altrove |
| **LOCATION** | geometria **opzionale** con incertezza; oppure riferimento a un Object-luogo | **no** |
| **EVIDENCE** | unità che sostiene un'affermazione (claim, relation, participation, event, insight), con fonte e gruppo di indipendenza | sì per ogni affermazione |
| **PROVENANCE** | catena di derivazione fino al raw e alla licenza | sì |
| **CONFIDENCE** | grado di supporto **deterministico e spiegabile**, **non una probabilità** | sì |
| **INSIGHT** | risultato di una regola di correlazione con evidenze e spiegazione | — |

### 4.2 Un solo mondo

- Esiste **un solo** grafo: Objects, Relations, Events e Insights di tutti i domini convivono e possono collegarsi.
- Ogni elemento ha un **riferimento stabile** (`EntityRef = {kind, id, type, label}`), identico in tutte le viste e in tutte le risposte.
- **Nessuna vista possiede dati.** Map, Graph, Timeline e Search sono proiezioni diverse del mondo, ottenute dallo stesso contratto di query (§22).
- **La geografia è una proprietà**, non l'architettura: un elemento senza geometria è un cittadino di prima classe; semplicemente non compare nelle proiezioni spaziali.

### 4.3 Sistema dei tipi come dati

I tipi non sono nel codice: sono **file di configurazione** in `vocab/` caricati in tabelle (`object_type`, `event_type`, `relation_type`, `property_def`). Per ogni tipo:

| Campo | Esempio (Object type) | Esempio (Relation type) |
|---|---|---|
| `id` | `transport.airport` | `affects` |
| `label`, `description` | "Aeroporto" | "colpisce" |
| `identity_schemes` (ordinati, forti) | `ourairports`, `icao` | — |
| `geometry` | `point` / `none` / `any` | — |
| `endpoints` | — | `from ∈ {…}`, `to ∈ {…}` (o `any`) |
| `nature` | — | `technological` |
| `symmetric` | — | `false` |
| `properties` | `scheduled_service: bool`, `elevation: length` | `version_range: text` |
| `severity` (solo Event type) | funzione dichiarativa su una proprietà | — |
| `display_hints` | famiglia semantica, priorità di densità, colore **semantico** | stile semantico dell'arco |

`display_hints` sono **suggerimenti neutrali per la UI** (famiglia, priorità, rango di densità), non stili grafici.

---

## 5. Struttura dei moduli e regola domain-agnostic

### 5.1 Moduli (progetto, non codice)

```
nexum/core/
  registry/     Source Registry
  types/        caricamento e validazione del sistema dei tipi (vocab/)
  scheduler/    unico punto di I/O di rete
  raw/          Raw Store
  normalize/    primitive di normalizzazione (unità, tempo, geometria) guidate dalla configurazione
  world/        scrittura di Object, Relation, Event, Claim, Participation, Evidence
  resolve/      entity resolution e deduplicazione
  geo/          geometria e indice spaziale (usati solo se gli elementi hanno geometria)
  time/         modello temporale e indici
  graph/        indice di adiacenza, gradi, traversal
  provenance/   catene di derivazione
  confidence/   fattori e composizione
  correlate/    motore di pattern, primitive, punteggio, spiegazioni
  insight/      modello Insight
  query/        contratto di query, LOD, aggregazioni, DTO
  changes/      versione del mondo e change log
  cli/
connectors/     un modulo per fonte (plan + parse): l'unico posto dove compaiono nomi di fonti
vocab/          tipi di dominio (TOML), alias, unità, arricchimenti dichiarativi
sources/        registro delle fonti (TOML)
rules/          regole di correlazione (TOML)
fixtures/       mondi di test, incluso il mondo non geografico
tests/  bench/  data/ (non versionato)
```

### 5.2 Regola domain-agnostic (verificata automaticamente)

Nel codice sotto `nexum/core/` **non devono comparire** (identificatori, stringhe, commenti) termini di dominio. Lista minima, verificata da un test statico (P28):

`earthquake`, `seismic`, `quake`, `magnitude`, `airport`, `aviation`, `aircraft`, `ship`, `vessel`, `copernicus`, `cems`, `usgs`, `ourairports`, `natural earth`, `weather`, `volcano`, `wildfire`, `flood`, `satellite`, `cve`, `vulnerability`, `malware`, `exploit`, `company`, `country`, `emergency`.

Il Core conosce solo: *object, relation, event, type, property, role, time, location, evidence, source, provenance, confidence, rule, pattern, insight, scope, view, filter, budget*.

Anche **severità**, **ruoli dei partecipanti** e **arricchimenti spaziali** sono **dichiarati in configurazione**, non scritti nel Core (§7.3, §14.4).

---

## 6. Source Registry

```toml
# sources/usgs.earthquakes.toml (contenuto illustrativo)
id = "usgs.earthquakes"
name = "USGS Earthquake Hazards Program"
owner = "U.S. Geological Survey"
verdict = "adopt"
reliability_tier = "T1"
verified_at = "2026-09-28"
independence_group = "usgs"

[license]
id = "public-domain-us-gov"
url = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"
attribution = "U.S. Geological Survey"
redistribution = "allowed"
commercial_use = "allowed"

[access]
type = "geojson"
auth = "none"
allowed_hosts = ["earthquake.usgs.gov"]

[politeness]
min_interval_s = 60
max_rps = 0.2
conditional_get = true
respect_retry_after = true

[updates]
mode = "poll"            # poll | bulk | none — gli aggiornamenti "live" esistono solo se consentiti
min_poll_interval_s = 60
```

Regole di validazione: `reject` ⇒ blocco; `opt_in` ⇒ escluso dalla Fase 1; `auth ≠ none` ⇒ chiave solo da configurazione utente; `verified_at` > 180 giorni ⇒ avviso, > 365 ⇒ blocco; host fuori `allowed_hosts` ⇒ blocco; `independence_group` obbligatorio. Verdetto speciale `fixture`: ammesso **solo** nei test.

`source_health`: ultimo tentativo, ultimo successo, errori consecutivi, `Retry-After`, stato (`ok`, `degraded`, `suspended` dopo 5 errori).

---

## 7. Connector interface e normalizzatori

### 7.1 Contratto

Il connettore è **puro**: non fa I/O di rete né accede al DB.

| Operazione | Output |
|---|---|
| `describe()` | `source_id`, `connector_version`, tipi prodotti |
| `plan(mode, state)` | `FetchRequest` (URL, parametri, `resource_key`); `mode ∈ {incremental, backfill}` |
| `parse(raw)` | sequenza di `NormalizedRecord` |
| `next_state(state, results)` | nuovo stato (cursori) |

### 7.2 `NormalizedRecord` (generico)

| Campo | Descrizione |
|---|---|
| `source_id`, `native_id`, `native_version` | identità e versione nella fonte |
| `kind` | `object` · `event` · `relation` (una fonte può asserire relazioni come record propri) |
| `type` | tipo del vocabolario |
| `label` | etichetta |
| `identifiers` | coppie (`scheme`, `value`) |
| `properties` | valori tipizzati con unità, validati contro `property_def` |
| `location` | **opzionale**: GeoJSON + incertezza |
| `time` | opzionale per object/relation (validità); obbligatorio per event |
| `status` | `preliminary`, `reviewed`, `updated`, `retracted` |
| `assertions` | relazioni/partecipazioni asserite dalla fonte, con estremi non ancora risolti (per identificatore o nome) |
| `raw_locator` | posizione nel payload |
| `quality_flags` | anomalie |

### 7.3 Normalizzatori dichiarativi

La trasformazione fonte-specifica sta nel connettore; le trasformazioni **riusabili** sono **dichiarate** in `vocab/` e applicate da primitive generiche del Core (`linear_severity`, `contained_in`, `nearest_within`). Esempio illustrativo:

```toml
# vocab/natural_hazards.toml (illustrativo — fuori dal Core)
[event_type."seismic.earthquake"]
identity_schemes = ["usgs"]
severity = { property = "magnitude", min = 4.0, max = 9.0, clamp = true }
roles = ["location", "nearest_location"]

[[enrichment]]
when_event_type = "seismic.earthquake"
role = "location"
contained_in_object_type = "place.country"
fallback_nearest_within_km = 200
fallback_role = "nearest_location"
```

### 7.4 Connettori del PoC 1

| Connettore | Richieste | Prodotti | Particolarità |
|---|---|---|---|
| `usgs.earthquakes` | incrementale: `summary/4.5_week.geojson` (ETag); backfill: FDSN `minmagnitude=5.5` a finestre mensili | Event `seismic.earthquake` | `updated` come versione; `status` automatic/reviewed |
| `ourairports.airports` | `airports.csv` (ETag) | Object `transport.airport` + asserzione `located_in` verso il paese (codice ISO) | tipi di aeroporto e `scheduled_service` come proprietà |
| `naturalearth.admin0` | `ne_50m_admin_0_countries.zip` (`naciscdn.org`) | Object `place.country` | `ISO_A2_EH`/`ISO_A3_EH`; alias dei nomi |
| `cems.rapid_mapping` | `activations/api/activations/` paginato | Event `emergency.mapping_activation` + asserzione `affected_area` verso paesi (per nome) | fuso non dichiarato ⇒ UTC con flag e incertezza; `lastUpdate` come versione |

---

## 8. Raw ingestion

- Flusso: `plan → Scheduler (allowlist, rate, ETag, Retry-After) → 200: sha256 → file gzip content-addressed → raw_record | 304: nessun nuovo raw | errore: backoff`.
- Raw Store `data/raw/<aa>/<bb>/<sha256>.gz`, **immutabile**.
- Ogni esecuzione crea un `run` con versioni di Core, connettori, tipi e regole.

### 8.4 Identificatori

| Elemento | Identificatore |
|---|---|
| `run`, `raw_record`, `fetch_log` | ULID |
| `record` | `rec_` + hash(`source_id`, `native_id`, `native_version`) |
| Object / Event | `obj_` / `evt_` + hash del primo identificatore forte secondo `identity_schemes` del tipo |
| Relation | `rel_` + hash(tipo, from, to, inizio validità): **una relazione canonica** per coppia e tipo, con più evidenze |
| Claim, Evidence, Insight | hash dei campi identificanti |

Hash: SHA-256 troncato a 128 bit, base32. Collisione rilevata ⇒ errore bloccante.

---

## 9. Normalization

| Aspetto | Regola |
|---|---|
| Tempo | UTC ms; fuso assente ⇒ UTC + flag + incertezza dichiarata per fonte |
| Precisione temporale | dichiarata, mai inventata |
| Location | opzionale; se presente: WGS84 `[lon, lat]`, validazione, incertezza dalla fonte o default dichiarato nel registro |
| Unità | SI; grandezze non SI come proprietà con scala |
| Testo | Unicode NFC |
| Vocabolari | termini sconosciuti ⇒ errore |
| Valori mancanti | `null`; **mai valori sintetici** |
| Anomalie | `quality_flags` visibili fino alla UI |

---

## 10. Objects

- Un Object ha tipo, etichetta, **location opzionale**, validità opzionale, stato (`active`, `merged_into`, `retired`).
- Gli attributi variabili sono **Claim** con validità, evidenze e confidenza; la vista "valore corrente" sceglie il claim valido con confidenza più alta e **mostra i conflitti**.
- Un Object può essere un **luogo**: la geografia esiste come proprietà (geometria) **o** come Object con cui relazionarsi.

---

## 11. Relations

### 11.1 Natura delle relazioni

| Natura | Esempi | Richiede geometria? |
|---|---|---|
| `spatial` | `located_in`, `near`, `crosses` | sì (calcolata) oppure asserita |
| `logical` | `same_as`, `part_of`, `instance_of` | no |
| `temporal` | `precedes`, `during` | no |
| `infrastructural` | `connects`, `supplies`, `depends_on` | no |
| `organizational` | `operated_by`, `produced_by`, `owned_by` (solo persone giuridiche) | no |
| `technological` | `affects`, `component_of`, `runs_on`, `associated_with` | no |
| `informational` | `published_by`, `reported_by`, `cites` | no |

Il Core tratta tutte le nature allo stesso modo; la natura serve a filtri, stile semantico e scelta delle primitive.

### 11.2 Relazione canonica ed evidenze

- **Una** relazione canonica per (tipo, from, to, inizio validità).
- Ogni fonte che la asserisce aggiunge una **Evidence** (`supports = relation`) con fonte, gruppo di indipendenza, record e locator.
- Anche un **Event** può sostenere una relazione (es. un avviso che dichiara un prodotto colpito): Evidence con `support_kind = event`.
- La confidenza della relazione deriva dalle evidenze (§16), incluso il **numero di fonti indipendenti**.
- Selezionando una relazione nel GRAPH si ottengono **gli eventi e le fonti che la sostengono** (`evidence_of`).

### 11.3 Relazioni calcolate

| Categoria | Materializzazione |
|---|---|
| Asserita | sempre |
| Calcolata strutturale (es. contenimento dichiarato in `enrichment`) | sempre, con provenienza dell'attività |
| Calcolata di prossimità (`near`) | **non** in forma generale: su richiesta; materializzata solo come evidenza di un insight |

### 11.4 Relazioni del PoC 1

| Tipo | Natura | Estremi | Derivazione |
|---|---|---|---|
| `located_in` | spatial | `transport.airport` → `place.country` | asserita (codice ISO) **e** calcolata (contenimento): due evidenze sulla stessa relazione; discordanza ⇒ due relazioni distinte con flag |

### 11.5 Relazioni del Test 2 (non geografico)

| Tipo | Natura | Estremi |
|---|---|---|
| `affects` | technological | vulnerabilità → software |
| `component_of` | technological | software → prodotto |
| `produced_by` | organizational | prodotto → organizzazione |
| `associated_with` | technological | vulnerabilità → tecnica |
| `published_by` | informational | avviso → organizzazione |

---

## 12. Events

### 12.1 Modello

Tipo, etichetta, tempo (obbligatorio), **location opzionale**, severità normalizzata **definita dal tipo in configurazione** (o `null`), stato, versioni. Partecipanti tramite `event_participant` (evento, object, **ruolo dichiarato dal tipo**).

### 12.2 Versioni

Stessa `native_id` con versione più recente ⇒ stesso evento, nuovi claim. `retracted` ⇒ evento marcato; insight dipendenti ⇒ `stale`.

### 12.3 Tipi dei due test (in `vocab/`, non nel Core)

| Test | Event type | Ruoli |
|---|---|---|
| PoC 1 | `seismic.earthquake` | `location`, `nearest_location` |
| PoC 1 | `emergency.mapping_activation` | `affected_area` |
| Test 2 | `security.vulnerability_published` | `subject`, `publisher` |
| Test 2 | `security.exploitation_listed` | `subject` |
| Test 2 | `security.advisory_issued` | `subject`, `concerns`, `publisher` |

---

## 13. Time e Timeline

### 13.1 Modello

- Istanti e intervalli in UTC ms, `t_precision`, `t_uncertainty_s`.
- **Bitemporale**: valid time + `recorded_at`; query `as_of_recorded`.
- Evento in corso: `t_end = null`, intervallo aperto.

### 13.2 Timeline unica

Vista su tutto ciò che ha un tempo: eventi, cambi di claim, inizio/fine di relazioni, insight. **Una sola timeline** per il mondo: ogni vista temporale (globale, di un oggetto, di un insight) è un **filtro** su di essa.

### 13.3 Timeline traversal

- `entity_timeline(ref, window)`: tutto ciò che è accaduto a un elemento o lo riguarda.
- `timeline_neighbors(ref, window, hops)`: eventi collegati all'elemento (direttamente o entro k passi nel grafo), prima e dopo, in una finestra limitata.
- `timeline_step(ref, prev|next)`: evento collegato precedente o successivo.

---

## 14. Location e spazio

### 14.1 Principio

**Geography is a property of the world, not the architecture.** Le funzioni spaziali si applicano **solo** agli elementi con location; tutte le altre funzioni (grafo, tempo, ricerca, insight, contesto) funzionano identiche con o senza geometria.

### 14.2 Indice spaziale

- R*Tree su bbox (`object_rtree`, `event_rtree`, `insight_rtree`); geometrie GeoJSON.
- "Entro d km": bbox espansa con gestione di antimeridiano (due query) e poli (longitudine completa), poi haversine (raggio medio 6.371,0088 km; errore accettato < 0,5 %).
- Contenimento: ray casting su MultiPolygon con buchi, prefiltro R*Tree.
- Elementi senza geometria **non entrano** negli indici spaziali e non generano errori.

### 14.3 Celle di aggregazione spaziale

Griglia geografica **indipendente dalla proiezione della UI**: al livello `z` la cella misura `360 / 2^z` gradi di longitudine per `180 / 2^z` gradi di latitudine; chiave `(z, x, y)`. La UI proietta come preferisce.

### 14.4 Arricchimenti spaziali dichiarativi

Come in §7.3: "un evento puntuale di tipo T partecipa con ruolo R all'oggetto di tipo U che lo contiene; altrimenti al più vicino entro D km con ruolo R′". Il Core fornisce la primitiva; la configurazione la attiva.

---

## 15. Evidence e Provenance

### 15.1 Evidence

| Campo | Descrizione |
|---|---|
| `evidence_id` | deterministico |
| `supports_kind`, `supports_id` | `claim`, `relation`, `participation`, `event`, `insight` |
| `support_kind`, `support_id` | `record` (con locator), `event`, `object`, `relation`, `insight` |
| `role` | `asserts`, `computes`, `trigger`, `match`, `context`, `component` |
| `source_id`, `independence_group` | per il conteggio delle fonti indipendenti |
| `distance_m`, `delta_t_ms` | quando pertinente |
| `weight` | contributo alla confidenza |
| `prov_id` | provenienza |

### 15.2 Provenance

`provenance(activity, agent, run)` + `provenance_input(kind, id, locator)`. Catena garantita:

```
insight → evidence → event/object/relation/claim → evidence(record) → record (locator)
        → raw_record (hash, URL, fetched_at) → source (licenza, attribuzione, verified_at)
```

Operazioni: `provenance_chain(ref)`, `evidence_of(ref)`, `sources_of(ref)`, `supported(ref)`.

---

## 16. Confidence

### 16.1 Natura

La confidenza NEXUM è un **grado di supporto deterministico** in `[0, 1]`. **Non è una probabilità scientifica** e non va mai presentata come tale: nessuna percentuale di probabilità, nessuna parola "probabilità" nei DTO o nelle spiegazioni. È **ricostruibile**: dalla scomposizione memorizzata si ottiene lo stesso valore.

### 16.2 Fattori

| Fattore | Significato | Si applica a |
|---|---|---|
| `provenance` | catena completa fino al raw e alla licenza (incompleta ⇒ 0) | tutto |
| `source_quality` | tier della fonte (T1 0,95 · T2 0,85 · T3 0,75 · T4 0,60 · T5 0,50 · T6 0,35) | evidenze |
| `method` | misurato 1,0 · asserito 0,95 · calcolato geometricamente 0,95 · risolto per nome 0,85 · proposto 0,5 | evidenze |
| `status` | reviewed 1,0 · preliminary 0,9 · retracted 0 | eventi, claim |
| `data_completeness` | quota dei campi richiesti dal tipo effettivamente presenti | tutto |
| `evidence_count` | numero di evidenze | relazioni, insight |
| `independent_sources` | numero di gruppi di indipendenza distinti | relazioni, claim, insight |
| `temporal_proximity` | funzione decrescente di Δt nella finestra della regola | insight |
| `spatial_proximity` | funzione decrescente della distanza, **solo se pertinente** | insight |
| `relation_strength` | forza dichiarata della regola o del tipo di relazione | insight, relazioni calcolate |

### 16.3 Composizione (deterministica)

- **Evidenza**: `source_quality × method × status × data_completeness`.
- **Affermazione con più evidenze**: combinazione del supporto per **gruppi indipendenti** `1 − Π(1 − cᵍ)`, dove `cᵍ` è la miglior evidenza del gruppo `g`. Evidenze dello stesso gruppo **non si sommano**.
- **Insight**: `relation_strength × min(confidenza dei membri) × temporal_proximity × spatial_proximity (se pertinente, altrimenti 1) × independent_support (se richiesto dalla regola, altrimenti 1)`.
- Ogni valore è memorizzato con `factors_json` e una **frase generata** (es. *"supporto medio: fonti di livello T1, luogo condiviso, Δt 3 h, distanza 45 km"*). Etichette: *supporto forte* (≥ 0,8), *medio* (0,5–0,8), *debole* (< 0,5).

---

## 17. Entity resolution e deduplicazione

| Livello | Chiave | Esito |
|---|---|---|
| Byte | sha256 | nessuna copia |
| Record | fonte + id nativo + versione | nessuna nuova riga |
| Entità nella stessa fonte | fonte + id nativo | nuova versione ⇒ nuovi claim |
| Entità tra fonti | identificatore forte condiviso | collegamento deterministico |
| Entità tra fonti senza identificatore forte | regole di corrispondenza del tipo (nome + alias, prossimità se c'è geometria, attributi) | ≥ 0,95 collega; 0,80–0,95 **proposta** (`merge_candidate`); sotto: nuova entità o riferimento non risolto |
| Relazioni | tipo + estremi + inizio validità | una relazione canonica, più evidenze |
| Eventi di tipo diverso | — | **non** si fondono: le associazioni sono compito della correlazione |

Algoritmo deterministico (ordinamento per fonte e id nativo); mai fusioni silenziose; ogni collegamento ha provenienza.

Casi del PoC 1 (in `connectors/` e `vocab/aliases`, non nel Core): codici ISO speciali di Natural Earth (`-99` ⇒ `ISO_A2_EH`); nomi di paese di Copernicus ⇒ alias; aeroporti costieri fuori dai poligoni 1:50m ⇒ fallback al paese asserito con flag.

Casi del Test 2: stesso software citato da due fonti con identificatore forte ⇒ un solo Object; stesso software citato solo per nome da una terza fonte ⇒ proposta di fusione, non fusione.

---

## 18. Indici

| Indice | Contenuto | Uso |
|---|---|---|
| Spaziale | R*Tree su bbox | proiezione MAP, primitive spaziali |
| Temporale | B-tree su `(type, t_start)`, `t_start`, `t_end`, claim `valid_from` | TIMELINE, primitive temporali |
| **Grafo** | tabella `edge` unificata (relazioni, partecipazioni, evidenze, appartenenze a insight, ipotesi), indicizzata nelle due direzioni | GRAPH, traversal, contesto |
| **Gradi** | `degree(entity, edge_kind, type, direction, count)` mantenuto incrementalmente | espansione con budget ("+37 eventi di tipo X") |
| Testo | FTS5 su etichette, alias, identificatori, spiegazioni | SEARCH |
| **Aggregati** | `agg_cell(z, x, y, kind, type, month)` per `z = 0…8`; `agg_time(bucket, kind, type)` | densità a basso zoom e timeline lunghe |
| **Cambiamenti** | `change_log(world_version, kind, id, op)` | aggiornamenti incrementali/live, cache della UI |

---

## 19. Correlation Engine (generico)

### 19.1 Principi

- Il Core **non contiene funzioni di correlazione di dominio** (nessuna `correlate_x_with_y`). Contiene un **motore di pattern** e **primitive**; le regole sono file TOML in `rules/`.
- Le regole producono **insight** e non modificano mai il mondo. Una regola può proporre una **relazione ipotetica**: resta un insight (`kind = relation_hypothesis`), mostrata nel grafo come arco distinto e mai confusa con le relazioni canoniche.
- Esecuzione incrementale (ogni nuovo elemento attiva i pattern che può soddisfare) e batch, con stesso risultato.
- Limiti rigidi per regola; linguaggio delle spiegazioni **non causale**.

### 19.2 Pattern

Una regola è un **pattern su variabili** legate a elementi del mondo:

```toml
# forma generale (illustrativa)
[rule]
id = "…"
version = "1"
strength = 0.8
emit_threshold = 0.3
max_results_per_trigger = 20

[[rule.var]]           # variabili: event | object | relation | insight
name = "A"
kind = "event"
type = "…"
where = "…"            # filtro su proprietà/claim correnti

[[rule.constraint]]    # vincoli tra variabili con le primitive di §19.3
expr = "…"

[rule.output]
kind = "association"   # association | context | composite | relation_hypothesis
explain = "template con {variabili}"
```

### 19.3 Primitive

| Famiglia | Primitive | Richiede geometria? |
|---|---|---|
| Tempo | `within_time(A, B, min, max)` · `overlaps(A, B)` · `before/after(A, B)` (con incertezza) | no |
| Spazio | `within_distance(A, B, km)` · `contained_in(A, B)` · `intersects(A, B)` | **sì — se un membro non ha geometria, la primitiva è falsa, mai errore** |
| Grafo | `related(A, B, type?, nature?, direction?)` · `path(A, B, via=[…], max_hops ≤ 3)` · `shares_neighbor(A, B, via)` | no |
| Partecipazione | `concerns(Event, Object, role?)` | no |
| Evidenza | `independent_support(Relation, min_groups)` · `evidence_count(X) ≥ n` | no |
| Identità | `same_identifier(A, B, scheme)` | no |
| Attributi | `where` su claim correnti, con unità | no |
| Conteggio | `count(pattern) ≥ n` entro una finestra | no |
| **Raggruppamento dei candidati** *(aggiunto con R2 v2)* | `group(var, link=[criteri], support, representative)` — vedi §19.7 | **no**: i criteri di collegamento sono scelti dalla regola (tempo, spazio se disponibile, partecipazione condivisa, relazione) |

### 19.4 Stesso motore, due paradigmi

**Spaziale/temporale** (PoC 1, forma concettuale):

```
EVENT A (type = seismic.earthquake, magnitude ≥ 5.5)
EVENT B (type = emergency.mapping_activation, category = earthquake)
within_time(A, B, −1h, +7d)
AND within_distance(A, B, 300 km)
AND (concerns(A, P) AND concerns(B, P))          → bonus se condividono il luogo P
→ INSIGHT association
```

**Non spaziale/relazionale** (Test 2, forma concettuale):

```
OBJECT V (type = security.vulnerability)
OBJECT S (type = software.package)
related(V, S, affects) AND independent_support(affects(V, S), 2)
EVENT E (type = security.exploitation_listed) AND concerns(E, V)
EVENT P (type = security.vulnerability_published) AND concerns(P, V)
within_time(P, E, 0, 30d)
→ INSIGHT association

OBJECT P1, P2 (type = software.product), P1 ≠ P2
shares_neighbor(P1, P2, via = component_of⁻¹) = S
AND related(V, S, affects)
→ INSIGHT relation_hypothesis ("P1 e P2 condividono il componente S colpito da V")
```

I nomi di dominio compaiono **solo nelle regole e nei tipi**, mai nel motore.

### 19.5 Esecuzione

1. Indicizzazione delle regole per tipi coinvolti.
2. Candidati via indici (spaziale, temporale, grafo) → ≤ `max_candidates` (default 500).
3. Verifica esatta dei vincoli.
4. Punteggio (§16.3) con fattori memorizzati.
5. Emissione se ≥ `emit_threshold`; unicità se dichiarata (es. "per ogni B solo la A migliore").
6. Scrittura atomica di insight + evidenze + provenienza + change log.
7. Invalidazione quando un membro cambia (nuova versione ⇒ ricalcolo; il vecchio insight passa a `superseded`).

### 19.7 Primitiva di raggruppamento dei candidati *(approvata il 2026-09-28)*

Modello: **CANDIDATES → CANDIDATE GROUPS → GROUP SUPPORT → REPRESENTATIVE → INSIGHT**.

| Passo | Cosa fa il Core | Cosa dichiara la regola |
|---|---|---|
| Candidati | tutte le assegnazioni valide della variabile raggruppata (vincoli soddisfatti), ciascuna con il suo punteggio | la variabile (`group.var`) |
| Gruppi | componenti connesse (single-linkage, deterministiche) della relazione "collegati" tra candidati | i criteri `link`: `within_time`, `within_distance` (falso se manca la geometria), `shares_participant`, `related`; tutti devono valere |
| Supporto del gruppo | `max_member` (miglior punteggio tra i membri) o `representative` | `support` |
| Rappresentante | primo membro secondo un ordinamento di chiavi generiche: `severity`, `score`, `time`, `confidence` | `representative` (es. `[["severity","desc"],["score","desc"]]`) |
| Insight | soglia applicata al **supporto del gruppo**; membri = assegnazione del rappresentante + altri membri del gruppo (`A~group#nnn`) | `emit_threshold`, `unique` |

Il Core **non** conosce concetti di dominio (evento principale, replica, sequenza): valuta primitive generiche con parametri forniti dalla regola. La `severity` è la proprietà dichiarata dal tipo nel vocabolario; il suo significato e il suo ordinamento appartengono al dominio. La stessa primitiva è usata, con criteri diversi e senza coordinate, nella fixture anti-overfitting (`shares_participant` invece della distanza).

**Provenienza del raggruppamento**: ogni insight prodotto con raggruppamento conserva in `insight.grouping_json` candidati considerati (con punteggio, severità, distanza, Δt, gruppo), gruppi prodotti, criteri di collegamento, metodo e valore del supporto, membro che fornisce il supporto, rappresentante e motivo della scelta, candidati scartati con motivo, regola e versione. La confidenza dell'insight è il supporto del gruppo; la spiegazione usa distanza e tempo del rappresentante.

**Versionamento**: gli insight conservano `rule_id` e `rule_version`; la tabella `rule` conserva il testo di ogni versione usata; le versioni respinte restano in `rules/archive/`. Un cambio di versione ritira gli insight della versione precedente (`superseded`) senza cancellarli.

### 19.6 Regole dei test

| Regola | Test | Output | Parametri |
|---|---|---|---|
| R1 `exposure_context` | PoC 1 | context | oggetti di tipo configurato entro un raggio funzione della severità: 100 / 200 / 300 km per M 5,5–6,4 / 6,5–7,4 / ≥ 7,5; filtri `scheduled_service = yes`, tipi large/medium |
| R2 `event_event_association` **v2** | PoC 1 | association | Δt ∈ [−1 h, +7 g]; ≤ 300 km; bonus per luogo condiviso; **raggruppamento dei candidati A: collegamento entro 72 h e 150 km (parametri della regola), supporto = miglior membro, rappresentante = severità dichiarata dal tipo, poi punteggio**; un solo gruppo per attivazione. La v1 (solo punteggio individuale) è stata respinta: §27.6 |
| R3 `composite_context` | PoC 1 | composite | R1 + R2 dello stesso evento; confidenza = minimo dei componenti |
| N1 `independently_supported_temporal_association` | Test 2 | association | relazione con ≥ 2 gruppi indipendenti; evento sul soggetto entro 30 giorni dall'evento di pubblicazione |
| N2 `shared_neighbor_exposure` | Test 2 | relation_hypothesis | due oggetti condividono un vicino colpito |
| N3 `organization_context` | Test 2 | context | per un oggetto-organizzazione: prodotti, componenti, vulnerabilità e avvisi collegati entro 3 passi |

---

## 20. Insight model

| Campo | Descrizione |
|---|---|
| `insight_id` | deterministico: hash(regola, versione, membri ordinati) |
| `kind` | `context`, `association`, `composite`, `relation_hypothesis` |
| `rule_id`, `rule_version` | |
| `confidence`, `factors_json`, `confidence_text` | §16 |
| `explanation` | testo dal template; **nessun termine causale né probabilistico** |
| `t_start_ms`, `t_end_ms` | intervallo dei membri (se temporali) |
| `bbox` | **solo se** almeno un membro ha geometria |
| `status` | `active`, `superseded`, `stale`, `confirmed_by_user`, `dismissed_by_user` |
| `created_at_ms`, `run_id`, `prov_id` | |

Le evidenze stanno in `evidence` con `supports_kind = insight`. Un insight è un **nodo del mondo**: compare nel GRAPH (collegato ai membri), nella TIMELINE (nel suo intervallo), sulla MAP (se ha bbox), nella SEARCH (per spiegazione) e nelle viste di dettaglio dei membri.

Ogni insight conserva: **fonti**, **dati di origine**, **objects**, **events**, **relations**, **tempo**, **posizione/distanza quando pertinente**, **regola**, **confidence**, **spiegazione**.

---

## 21. ONE WORLD — MULTIPLE VIEWS

### 21.1 Viste come proiezioni

| Vista | Proiezione del mondo | Operazioni principali |
|---|---|---|
| MAP | elementi con geometria nel viewport, con LOD | `project_map` |
| GRAPH | vicinato di un fuoco, con budget | `neighborhood`, `expand`, `path` |
| TIMELINE | elementi con tempo in una finestra, con bucket | `project_timeline`, `entity_timeline` |
| SEARCH | risultati testuali raggruppati per tipo | `search` |
| OBJECT VIEW / EVENT VIEW | contesto completo di un elemento | `context` |
| RELATIONS | relazioni di un elemento per tipo e natura, con evidenze | `relations`, `evidence_of` |
| INSIGHTS | insight filtrati o di un elemento | `insights`, `get_insight` |
| SOURCES | registro, salute, fonti di un elemento | `sources`, `sources_of`, `provenance_chain` |
| FILTERS | faccette e conteggi comuni a tutte le viste | `facets`, `types` |

Tutte le operazioni ricevono lo **stesso `Scope`** (§22.2) e restituiscono **gli stessi `EntityRef`**. Nessuna vista ha tabelle o cache proprie nel Core.

### 21.2 WORLD MODE

- **Scopo**: vedere il quadro globale (fenomeni, oggetti, eventi, insight) con densità controllata.
- **Scope**: `mode = world`, filtri, finestra temporale, eventuale viewport.
- **Risposte**: aggregati prima dei dettagli (celle spaziali, bucket temporali, conteggi per tipo e natura, faccette); poi elementi singoli entro il budget, ordinati per rilevanza (confidenza, severità, recenza).
- **Ingresso in OBJECT MODE**: selezionare qualunque `EntityRef` in qualunque vista.

### 21.3 OBJECT MODE

- **Scopo**: selezionato un elemento, NEXUM ricostruisce il contesto attorno ad esso.
- **Operazione** `context(focus, scope, budget)`, una sola risposta:

```
FOCUS (Object | Event | Relation | Insight)
 ├── Sources           fonti e licenze che lo sostengono
 ├── Evidence          evidenze dirette, con conteggio di fonti indipendenti
 ├── Relations         raggruppate per tipo e natura (spaziali e non), con conteggi
 ├── Related Objects   primi N per rilevanza + conteggi per tipo
 ├── Related Events    primi N per tempo/rilevanza + conteggi per tipo
 ├── Timeline          finestra centrata sul fuoco, con bucket
 ├── Geography         solo se esiste: geometria, luogo contenitore, conteggio di elementi vicini
 └── Insights          insight che lo includono, ordinati per confidenza
```

- **Pivot**: ogni elemento restituito è un `EntityRef` utilizzabile come nuovo fuoco (terremoto del Myanmar → Mandalay International → sue relazioni → Myanmar → altri eventi in Myanmar → nuovo contesto), **senza tornare alla home**.
- **Trail**: la sequenza dei fuochi è una lista di `EntityRef` con lo `Scope` di ciascun passo; il Core offre `trail_context(trail)`. La persistenza del trail come "indagine" è rinviata alla Fase 2 (decisione I.3); il formato è definito ora.

### 21.4 Traversal

| Traversal | Operazioni | Garanzia |
|---|---|---|
| **Graph** | `neighborhood(focus, depth ≤ 3, scope, budget)` · `expand(node, edge, budget, cursor)` · `path(a, b, max_hops ≤ 4)` | i nodi oltre il budget diventano **nodi aggregati** con conteggio e tipo; espansione paginata |
| **Timeline** | `entity_timeline(ref, window)` · `timeline_neighbors(ref, window, hops)` · `timeline_step(ref, prev/next)` | ordinamento per tempo con incertezza; finestre sempre limitate |
| **Evidence** | `evidence_of(ref)` · `sources_of(ref)` · `provenance_chain(ref)` · `supported(ref)` | da qualsiasi insight/relazione si arriva a raw e licenze; da qualsiasi fonte si vede cosa sostiene |
| **Spatial** (solo con geometria) | `nearby(ref, km, scope, budget)` · `containing(ref)` · `contained(ref, scope, budget)` | elementi senza geometria esclusi e contati, senza errori |

### 21.5 Coerenza tra viste

1. **Stesso ID ovunque**: un elemento ha lo stesso `EntityRef` in tutte le operazioni (P30).
2. **Selezione collegata**: ogni operazione accetta `highlight: [EntityRef]` e indica come compare ciascuno (singolo, dentro una cella aggregata, dentro un bucket, dentro un nodo aggregato).
3. **Localizzabilità**: `locate(ref)` restituisce per ogni vista dove si trova l'elemento (coordinate/bbox, bucket temporale, cammino nel grafo dal fuoco corrente) o `not_applicable`.
4. **Coerenza dei conteggi**: aggregati, faccette e liste coincidono per lo stesso `Scope` (P34).

---

## 22. Contratto di query (viewport, LOD, budget)

### 22.1 Principio

**Nessuna operazione restituisce il mondo intero.** Ogni operazione ha `Scope`, `Budget`, livello di dettaglio, paginazione a cursore e segnalazione di troncamento.

### 22.2 `Scope` (condiviso da tutte le operazioni)

| Campo | Descrizione |
|---|---|
| `mode` | `world` · `focus` |
| `focus` | `EntityRef` (solo in `focus`) |
| `types` | tipi di object/event/relation/insight visibili (**visibilità per layer/tipo**) |
| `natures` | nature di relazione incluse |
| `time_window` | `[from, to]` + `as_of_recorded` opzionale |
| `viewport` | opzionale: bbox + `z` |
| `min_confidence` | soglia |
| `sources` | inclusione/esclusione di fonti |
| `status` | stati ammessi |
| `text` | filtro testuale opzionale |

### 22.3 `Budget` e LOD

| Campo | Default | Massimo |
|---|---|---|
| `max_items` | 500 | 5.000 |
| `max_nodes` / `max_edges` | 200 / 400 | 2.000 / 4.000 |
| `max_bytes` della risposta | 2 MB | 10 MB |
| `lod` | `auto` | `counts` · `aggregates` · `refs` · `details` |

| LOD | Contenuto | Uso tipico |
|---|---|---|
| `counts` | totali e faccette | intestazioni, filtri |
| `aggregates` | celle spaziali, bucket temporali, nodi aggregati per tipo | WORLD MODE a basso zoom, timeline lunghe, hub del grafo |
| `refs` | `EntityRef` + geometria minima + tempo + confidenza | mappa a zoom medio/alto, liste |
| `details` | DTO completi | viste di dettaglio |

`lod = auto`: `aggregates` se gli elementi nello scope superano `max_items`, altrimenti `refs`.

### 22.4 Aggregazioni

- **Spaziali**: celle `(z, x, y)` con conteggio per tipo, tipo dominante, bbox reale degli elementi, confidenza massima; da `agg_cell` per `z ≤ 8` con finestre mensili, calcolate al volo altrimenti.
- **Temporali**: bucket automatici in funzione della finestra (ora, giorno, settimana, mese, anno) con conteggi per tipo.
- **Grafo**: vicini oltre il budget raggruppati per (tipo di arco, tipo di nodo) in **nodi aggregati** espandibili.
- **Clustering**: la griglia è il clustering di base; la UI può applicare clustering visivo sopra `refs`.

### 22.5 Operazioni

| Operazione | Futuro endpoint `/api/v1` | Note |
|---|---|---|
| `get_entity(ref, lod)` | `GET /entities/{id}` | object, event, relation, insight |
| `context(focus, scope, budget)` | `GET /context/{id}` | OBJECT MODE |
| `relations(ref, scope, budget)` | `GET /entities/{id}/relations` | per tipo e natura, con conteggio di evidenze e fonti indipendenti |
| `related_events(ref, scope, budget)` | `GET /entities/{id}/events` | |
| `related_objects(ref, scope, budget)` | `GET /entities/{id}/objects` | |
| `neighborhood(focus, depth, scope, budget)` | `GET /graph/neighborhood` | |
| `expand(node, edge, budget, cursor)` | `GET /graph/expand` | |
| `path(a, b, max_hops)` | `GET /graph/path` | |
| `project_map(scope, budget)` | `GET /projections/map` | richiede `viewport`; elementi senza geometria esclusi e **contati** in `excluded` |
| `project_timeline(scope, bucket, budget)` | `GET /projections/timeline` | |
| `entity_timeline(ref, window)` | `GET /entities/{id}/timeline` | |
| `timeline_neighbors(ref, window, hops)` | `GET /entities/{id}/timeline/neighbors` | |
| `nearby` · `containing` · `contained` | `GET /entities/{id}/spatial/…` | solo con geometria |
| `search(q, scope, budget)` | `GET /search` | FTS5, raggruppato per tipo |
| `facets(scope)` | `GET /facets` | |
| `insights(scope, budget, cursor)` | `GET /insights` | |
| `get_insight(id)` | `GET /insights/{id}` | con evidenze |
| `evidence_of(ref)` · `supported(ref)` | `GET /entities/{id}/evidence` · `/supports` | |
| `sources_of(ref)` · `provenance_chain(ref)` | `GET /entities/{id}/sources` · `GET /provenance/{id}` | |
| `sources()` | `GET /sources` | registro + salute + conteggi |
| `types()` | `GET /types` | sistema dei tipi con `display_hints` (layer, legende) |
| `locate(ref)` | `GET /entities/{id}/locate` | posizione in ogni vista |
| `changes_since(world_version, scope)` | `GET /changes` | aggiornamenti incrementali/live |
| `trail_context(trail)` | `POST /trail/context` | |

### 22.6 Risposta comune

```
{
  "data": …,
  "lod": "counts|aggregates|refs|details",
  "total": <int>, "returned": <int>, "truncated": <bool>, "cursor_next": <string|null>,
  "excluded": { "no_geometry": <int>, "below_confidence": <int>, … },
  "facets": { … } | null,
  "highlight": [{ "ref", "appears_as" }] | null,
  "sources": [{ "source_id", "attribution", "license_id" }],
  "world_version": <int>, "as_of": { … },
  "timing_ms": <int>
}
```

DTO descritti da **JSON Schema** versionati; test di contratto su ogni operazione.

### 22.7 Live e cache

- `world_version` cresce a ogni transazione che modifica il mondo; ogni risposta la riporta.
- `changes_since(v, scope)` restituisce solo gli elementi modificati che rientrano nello scope: la UI aggiorna senza ricaricare.
- Gli aggiornamenti "live" esistono solo per fonti con `updates.mode = poll` e rispettano i limiti del registro.

---

## 23. Requisiti per il futuro workspace ad alta densità

Non implementati in Fase 1; il Core deve **renderli possibili** (verificato da P30–P39 e B16–B28).

| Requisito del workspace | Supporto del Core |
|---|---|
| Grande workspace globale, molti tipi di dati insieme | `Scope.types`, aggregati multi-tipo, `display_hints` |
| Elevata densità senza caos | LOD, budget, aggregazioni, ordinamento per rilevanza, `excluded` |
| Layer e visibilità per tipo | sistema dei tipi + `types()` + `Scope.types` |
| Oggetti, eventi, infrastrutture, rotte e collegamenti | relazioni con geometria derivabile dagli estremi; archi del grafo con natura |
| Pannelli contestuali, più elementi aperti insieme | `context` per fuoco; risposte indipendenti e cacheabili per `world_version` |
| Aggiornamenti live consentiti dalle fonti | `changes_since` |
| Navigazione fluida | latenze p95 dei benchmark; pivot con una sola chiamata |
| Strumenti operativi (misura, area, filtro per area) | primitive spaziali esposte (`nearby`, `contained`) |
| 2D/3D | geometria WGS84 con eventuale quota come proprietà; la scelta 2D/3D è della UI |
| Filtri e ricerca | `facets`, `search`, stesso `Scope` |
| Passaggio immediato da ciò che si vede al suo contesto | `EntityRef` stabili + `context` + `locate` |

---

## 24. Schema SQLite

Tabelle `STRICT`, chiavi esterne attive, `journal_mode = WAL`.

```sql
-- ── Sistema dei tipi (caricato da vocab/) ───────────────────────────────
object_type(   type_id TEXT PK, label TEXT, geometry TEXT, identity_schemes TEXT,
               display_hints TEXT, vocab_hash TEXT )
event_type(    type_id TEXT PK, label TEXT, roles TEXT, severity_def TEXT,
               identity_schemes TEXT, display_hints TEXT, vocab_hash TEXT )
relation_type( type_id TEXT PK, label TEXT, nature TEXT, symmetric INT,
               from_types TEXT, to_types TEXT, display_hints TEXT, vocab_hash TEXT )
property_def(  owner_type TEXT, property TEXT, value_kind TEXT, unit TEXT, required INT,
               PRIMARY KEY(owner_type, property) )

-- ── Registro e acquisizione ─────────────────────────────────────────────
source(        source_id TEXT PK, name TEXT, owner TEXT, verdict TEXT, tier TEXT,
               license_id TEXT, license_url TEXT, attribution TEXT, redistribution TEXT,
               commercial_use TEXT, independence_group TEXT, verified_at TEXT,
               updates_mode TEXT, registry_hash TEXT )
source_health( source_id TEXT PK→source, last_attempt_ms INT, last_success_ms INT,
               consecutive_errors INT, retry_after_ms INT, state TEXT )
run(           run_id TEXT PK, kind TEXT, started_ms INT, ended_ms INT, core_version TEXT,
               versions_json TEXT, outcome TEXT )
fetch_log(     fetch_id TEXT PK, run_id TEXT→run, source_id TEXT→source, url TEXT,
               requested_ms INT, http_status INT, not_modified INT, raw_id TEXT NULL,
               bytes INT, duration_ms INT, error TEXT NULL )
raw_record(    raw_id TEXT PK, source_id TEXT→source, sha256 TEXT UNIQUE, codec TEXT,
               size INT, url TEXT, fetched_ms INT, etag TEXT, last_modified TEXT,
               content_type TEXT, path TEXT )
connector_state( source_id TEXT PK→source, state_json TEXT, updated_ms INT )
record(        record_id TEXT PK, source_id TEXT→source, native_id TEXT, native_version TEXT,
               kind TEXT, type TEXT, raw_id TEXT→raw_record, raw_locator TEXT,
               parser_version TEXT, quality_flags TEXT,
               UNIQUE(source_id, native_id, native_version) )

-- ── Mondo ───────────────────────────────────────────────────────────────
object(        object_id TEXT PK, type TEXT→object_type, label TEXT,
               geometry TEXT NULL, min_lon REAL NULL, max_lon REAL NULL,
               min_lat REAL NULL, max_lat REAL NULL, geo_uncertainty_m REAL NULL,
               valid_from_ms INT NULL, valid_to_ms INT NULL, status TEXT,
               merged_into TEXT NULL, confidence REAL, factors_json TEXT,
               prov_id TEXT→provenance, recorded_at_ms INT, world_version INT )
event(         event_id TEXT PK, type TEXT→event_type, label TEXT,
               t_start_ms INT, t_end_ms INT NULL, t_precision TEXT, t_uncertainty_s INT,
               geometry TEXT NULL, min_lon REAL NULL, max_lon REAL NULL,
               min_lat REAL NULL, max_lat REAL NULL, geo_uncertainty_m REAL NULL,
               severity REAL NULL, status TEXT, confidence REAL, factors_json TEXT,
               prov_id TEXT→provenance, recorded_at_ms INT, world_version INT )
relation(      relation_id TEXT PK, type TEXT→relation_type, from_kind TEXT, from_id TEXT,
               to_kind TEXT, to_id TEXT, derivation TEXT, attributes_json TEXT,
               valid_from_ms INT NULL, valid_to_ms INT NULL, evidence_count INT,
               independent_groups INT, confidence REAL, factors_json TEXT,
               prov_id TEXT→provenance, recorded_at_ms INT, world_version INT )
event_participant( event_id TEXT→event, object_id TEXT→object, role TEXT,
               derivation TEXT, distance_m REAL NULL, confidence REAL,
               prov_id TEXT→provenance, PRIMARY KEY(event_id, object_id, role) )
claim(         claim_id TEXT PK, subject_kind TEXT, subject_id TEXT, property TEXT,
               value_json TEXT, unit TEXT NULL, valid_from_ms INT NULL, valid_to_ms INT NULL,
               recorded_at_ms INT, confidence REAL, factors_json TEXT,
               superseded_by TEXT NULL, prov_id TEXT→provenance, world_version INT )
identifier(    scheme TEXT, value TEXT, entity_kind TEXT, entity_id TEXT, strong INT,
               source_id TEXT→source, prov_id TEXT→provenance,
               PRIMARY KEY(scheme, value, entity_id) )
evidence(      evidence_id TEXT PK, supports_kind TEXT, supports_id TEXT,
               support_kind TEXT, support_id TEXT, role TEXT, source_id TEXT NULL,
               independence_group TEXT NULL, record_id TEXT NULL, locator TEXT NULL,
               distance_m REAL NULL, delta_t_ms INT NULL, weight REAL,
               prov_id TEXT→provenance )
merge_candidate( candidate_id TEXT PK, entity_kind TEXT, a_id TEXT, b_id TEXT, score REAL,
               reason_json TEXT, status TEXT, prov_id TEXT→provenance )

-- ── Provenienza ─────────────────────────────────────────────────────────
provenance(    prov_id TEXT PK, activity TEXT, agent TEXT, run_id TEXT→run, at_ms INT )
provenance_input( prov_id TEXT→provenance, input_kind TEXT, input_id TEXT, locator TEXT NULL )

-- ── Correlazione ────────────────────────────────────────────────────────
rule(          rule_id TEXT, version TEXT, definition_toml TEXT, definition_hash TEXT,
               PRIMARY KEY(rule_id, version) )
insight(       insight_id TEXT PK, kind TEXT, rule_id TEXT, rule_version TEXT,
               confidence REAL, factors_json TEXT, confidence_text TEXT, explanation TEXT,
               t_start_ms INT NULL, t_end_ms INT NULL, min_lon REAL NULL, max_lon REAL NULL,
               min_lat REAL NULL, max_lat REAL NULL, status TEXT, superseded_by TEXT NULL,
               created_at_ms INT, run_id TEXT→run, prov_id TEXT→provenance, world_version INT,
               grouping_json TEXT NULL )   -- provenienza del raggruppamento (§19.7)

-- ── Indici di navigazione ───────────────────────────────────────────────
edge(          src_kind TEXT, src_id TEXT, dst_kind TEXT, dst_id TEXT,
               edge_kind TEXT,     -- relation | participation | evidence | insight_member | hypothesis
               type TEXT, nature TEXT NULL, ref_id TEXT, t_ms INT NULL, confidence REAL )
degree(        entity_id TEXT, edge_kind TEXT, type TEXT, direction TEXT, count INT,
               PRIMARY KEY(entity_id, edge_kind, type, direction) )
agg_cell(      z INT, x INT, y INT, kind TEXT, type TEXT, month INT, count INT, max_conf REAL,
               min_lon REAL, max_lon REAL, min_lat REAL, max_lat REAL,
               PRIMARY KEY(z, x, y, kind, type, month) )
agg_time(      bucket_kind TEXT, bucket_start_ms INT, kind TEXT, type TEXT, count INT,
               PRIMARY KEY(bucket_kind, bucket_start_ms, kind, type) )
change_log(    world_version INT PK, entity_kind TEXT, entity_id TEXT, op TEXT, at_ms INT )
rid_map(       rid INTEGER PK, entity_kind TEXT, entity_id TEXT UNIQUE )   -- per R*Tree

object_rtree  USING rtree(rid, min_lon, max_lon, min_lat, max_lat)
event_rtree   USING rtree(rid, min_lon, max_lon, min_lat, max_lat)
insight_rtree USING rtree(rid, min_lon, max_lon, min_lat, max_lat)
search_fts    USING fts5(entity_kind, entity_id UNINDEXED, label, aliases, identifiers, text)

INDEX edge(src_id, edge_kind, type), edge(dst_id, edge_kind, type), edge(t_ms)
INDEX event(type, t_start_ms), event(t_start_ms), event(t_end_ms)
INDEX claim(subject_id, property, valid_from_ms), claim(recorded_at_ms)
INDEX relation(from_id, type), relation(to_id, type)
INDEX event_participant(object_id, role)
INDEX evidence(supports_id), evidence(support_id), evidence(source_id)
INDEX identifier(entity_id)
INDEX insight(rule_id, status, confidence), insight(t_start_ms)

VIEW claim_current, timeline_entry
schema_version( version INT PK, applied_ms INT )
```

Il database è un **artefatto derivato**: `rebuild` lo ricrea da Raw Store + configurazione + versioni.

---

## 25. Strategia di test

| Livello | Contenuto |
|---|---|
| Unit | geometria (antimeridiano, poli, buchi), tempo, confidenza, ID deterministici |
| Connettori con fixture | payload reali ridotti delle 4 fonti del PoC 1 → record attesi |
| Registry e tipi | validazione dei file; vincoli sugli estremi delle relazioni |
| Scheduler | server HTTP loopback: rate, ETag/304, `Retry-After`, backoff, UA, allowlist |
| Entity resolution | casi limite di entrambi i test |
| **Domain-agnostic statico** | ricerca dei termini di §5.2 in `nexum/core/` ⇒ 0 |
| **Domain-agnostic dinamico** | il Test 2 aggiunge un dominio **senza modificare file sotto `nexum/core/`** (verifica sul diff) |
| **Test architetturale non geografico** | §28: mondo senza geometria; tutte le operazioni non spaziali funzionano; N1–N3 producono gli insight attesi e nessun altro |
| **Mondo misto** | PoC 1 + Test 2 nello stesso database: nessuna interferenza; risultati identici ai DB separati |
| Golden di correlazione | PoC 1: golden set congelato (§27.6); Test 2: insight attesi enumerati nella fixture |
| **Anti-overfitting del raggruppamento** | fixture sintetica congelata `fixtures/r2_grouping/`: variante D corretta su 5/5 scenari, varianti B e v1 falliscono come previsto |
| **Cross-view** | per un campione di elementi: stesso `EntityRef` in `project_map`, `neighborhood`, `project_timeline`, `search`, `context`, `locate` |
| **Traversal** | catene di pivot §27.4 e §28.4 eseguite passo per passo |
| **Budget** | ogni operazione rispetta `max_items`, `max_nodes`, `max_bytes`; `truncated` corretto; nessuna operazione senza limite |
| **Coerenza aggregati** | somma delle celle = conteggio esatto nello scope, su viewport casuali deterministici |
| Riproducibilità · idempotenza · incrementale = batch | come v0.1 |
| **Live** | `changes_since` dopo un'ingestione incrementale restituisce esattamente gli elementi cambiati |
| Contratto | JSON Schema per ogni operazione |
| Linguaggio | nessun termine causale; nessun termine probabilistico |
| Confidenza | ricostruzione del valore dai fattori (tolleranza 1e-9); indipendenza dei gruppi |
| Licenze | ogni elemento risale a una licenza; file di attribuzioni completo |
| Offline | tutte le query e la correlazione con socket bloccati |
| Rete reale | opt-in con `NEXUM_LIVE_TESTS=1` |

---

## 26. Benchmark

Macchina di riferimento: computer dell'autore (Apple silicon, SSD). Mediana e p95 su ≥ 20 ripetizioni a cache calda, salvo indicazione.

### 26.1 Dataset

| Dataset | Contenuto |
|---|---|
| **D1 — PoC reale** | OurAirports (~85k), Natural Earth (~240), USGS M ≥ 5,5 dal 2015, Copernicus EMS (~1.100) |
| **D2 — Scala sintetica** | generatore deterministico (seed fisso): **200.000 objects, 1.000.000 events, 2.000.000 relations, 50.000 insight**, 30 tipi, **40 % degli elementi senza geometria**, gradi a coda lunga (nodi hub con ≥ 50.000 archi) |
| **D3 — Non geografico** | Test 2 scalato dal generatore: 50.000 vulnerabilità, 20.000 software, 5.000 prodotti, 2.000 organizzazioni, 100.000 eventi di sicurezza, 0 geometrie |

### 26.2 Obiettivi

| ID | Misura | Dataset | Obiettivo |
|---|---|---|---|
| B1 | ingest OurAirports | D1 | < 30 s |
| B2 | ingest Natural Earth | D1 | < 10 s |
| B3 | backfill USGS (esclusa rete) | D1 | < 20 s |
| B4 | ingest Copernicus EMS (esclusa rete) | D1 | < 5 s |
| B5 | contenimento di tutti gli aeroporti | D1 | < 60 s |
| B6 | `nearby(point, 200 km)` | D1 | p95 < 20 ms |
| B7 | `get_entity` (`details`) | D1, **D2** | p95 < 30 ms |
| B8 | `project_timeline` su 10 anni, bucket automatici | D1, **D2** | p95 < 100 ms |
| B9 | `neighborhood(depth 2, budget 200)` **su nodo hub** (≥ 50.000 archi) | **D2** | p95 < 100 ms |
| B10 | `search` FTS5 | D1, **D2** | p95 < 50 ms |
| B11 | correlazione incrementale per nuovo elemento (tutte le regole) | D1, **D3** | p95 < 200 ms |
| B12 | correlazione batch completa | D1 | < 60 s |
| B13 | `rebuild` completo | D1 | < 5 min |
| B14 | dimensione del DB | D1 / **D2** | < 500 MB / **< 4 GB** |
| B15 | dimensione del Raw Store | D1 | < 200 MB |
| **B16** | `project_map` a scala mondiale (`z = 2`, `lod auto`) | D2 | p95 < 100 ms, risposta ≤ 2 MB |
| **B17** | `project_map` a scala regionale (`z = 8`) | D2 | p95 < 100 ms |
| **B18** | `project_map` a scala locale (`z = 12`, `refs`) | D2 | p95 < 50 ms |
| **B19** | `context(focus)` OBJECT MODE completo | D1, D2, D3 | p95 < 150 ms |
| **B20** | `expand(node)` paginato su nodo hub | D2 | p95 < 50 ms per pagina |
| **B21** | `path(a, b, max_hops 4)` | D2, D3 | p95 < 200 ms |
| **B22** | `entity_timeline` + `timeline_neighbors(hops 2)` | D2 | p95 < 80 ms |
| **B23** | `provenance_chain` di un insight fino al raw | D1, D3 | p95 < 50 ms |
| **B24** | `facets(scope)` | D2 | p95 < 150 ms |
| **B25** | `changes_since` dopo 1.000 modifiche | D2 | p95 < 50 ms |
| **B26** | catena di pivot di 6 passi (una chiamata `context` per passo) | D1, D3 | totale p95 < 1 s |
| **B27** | correlazione batch non spaziale | D3 | < 60 s |
| **B28** | caricamento di D2 (generazione esclusa) | D2 | < 15 min |

Rispetto alla v0.1: **B7, B8, B10** estesi a D2; **B9** reso più severo (nodo hub, stesso obiettivo); **B11** esteso a D3; **B14** con obiettivo aggiuntivo per D2; **B16–B28 nuovi**. Nessun obiettivo precedente è stato allentato.

---

## 27. PoC 1 — Myanmar (spaziale/temporale)

### 27.1 Fonti

| Ruolo | Fonte | Verdetto | Tier | Chiave | Licenza |
|---|---|---|---|---|---|
| A | USGS Earthquake Hazards | ADOPT | T1 | no | pubblico dominio (USA) |
| B | OurAirports | ADOPT | T3 | no | pubblico dominio |
| C | Natural Earth Admin 0 1:50m | ADOPT | T1 | no | pubblico dominio |
| D | Copernicus EMS Rapid Mapping | ADOPT | T1 | no | accesso libero e aperto, citazione |

Endpoint verificati il 2026-09-28 (note di qualità in §31, C10–C11).

### 27.2 Correlazione attesa (valori verificati sui dati reali il 2026-09-28)

| Passo | Dato |
|---|---|
| Evento A | `us7000pn9s`, M 7,7, 2025-03-28 06:20:52 UTC, 22,011° N 95,936° E, profondità 10 km, `reviewed` |
| Luogo | contenuto nel poligono Myanmar (Natural Earth) ⇒ partecipazione `location` |
| Evento D | `EMSR798` "Earthquakes in Myanmar", attivazione 2025-03-28T09:42 (UTC assunto), centroide 21,608° N 95,919° E, paese Myanmar |
| R2 | Δt = +3 h 21 min 07 s; distanza 44,8 km; luogo condiviso |
| R1 | 5 aeroporti large/medium con voli di linea entro 300 km: **VYMD 34,6 km**, VYHH 166,1 km, VYLS 215,3 km, VYNT 266,9 km, VYLK 290,1 km |
| R3 | insight composito A + B + C + D |

Spiegazione attesa (forma):

> *L'attivazione Copernicus EMS EMSR798 (terremoto, Myanmar) è avvenuta 3 h 21 min dopo il terremoto M7.7 USGS del 28/03/2025, con centro dell'area a 44,8 km dall'epicentro. Entro 300 km dall'epicentro si trovano 5 aeroporti con voli di linea; il più vicino è Mandalay International (VYMD) a 34,6 km. Associazione spazio-temporale e informazione di contesto, non un rapporto di causa verificato.*
> *Fonti: U.S. Geological Survey; Copernicus Emergency Management Service (© European Union); OurAirports; Natural Earth. Supporto medio: fonti istituzionali, luogo condiviso, Δt 3 h, distanza 45 km.*

Il golden test fisserà i valori dallo snapshot acquisito (tolleranza ±1 km, ±1 min); il numero di aeroporti può variare con gli aggiornamenti notturni di OurAirports.

### 27.3 Informazione che nessuna fonte fornisce

USGS non conosce aeroporti né attivazioni; OurAirports non conosce eventi; Copernicus non indica il terremoto USGS corrispondente né gli aeroporti; Natural Earth non conosce nessuno dei tre.

### 27.4 Catena di navigazione attesa (OBJECT MODE)

```
WORLD (scope: marzo 2025; tipi evento + insight)
 → EVENT us7000pn9s          context: fonti USGS, evidenze, luogo Myanmar, insight R1/R2/R3
 → INSIGHT R3                evidenze: A, D, VYMD…; provenance_chain fino ai 4 raw
 → OBJECT VYMD               context: located_in Myanmar (2 evidenze: asserita + calcolata), eventi collegati, insight
 → OBJECT Myanmar            context: eventi con partecipazione nel paese (timeline), aeroporti (conteggio), insight
 → EVENT EMSR798             context: fonte Copernicus, partecipazioni, insight R2
```

Ogni passo: una chiamata `context`; stesso `EntityRef` in MAP, GRAPH, TIMELINE e SEARCH.

### 27.5 Validazione sull'Italia

Aeroporti `IT` contenuti nel poligono Italia (salvo casi documentati); terremoti USGS in Italia con partecipazione `location` Italia; attivazioni Copernicus con paese Italia risolte all'oggetto Italia.

### 27.6 Storia della regola R2: v1 respinta, v2 approvata (2026-09-28)

**Golden set** congelato prima di qualsiasi modifica (commit `1d52690`): `tests/golden/r2_golden_set.json`, SHA-256 `d5412eafa7371244a575bb84de74ae5b70f82b2e50f61eea41e3afa824b178a1`; metodologia in `tests/golden/METHODOLOGY.md`. 43 attivazioni `earthquake`: 36 positivi, 3 da non abbinare (valutazione del rischio, esercitazione, analisi post-evento), 4 esclusi (fuori perimetro); 20 eventi negativi M ≥ 6,5.

**R2 v1 (come da specifica v0.2) — FAIL**: TP 29, FP 6, FN 7; precisione 82,9 %, recall 80,6 %. Myanmar abbinato alla replica M6.7 invece della M7.7.

**Problema scoperto**: v1 usava un unico punteggio di prossimità sia per decidere *se* l'associazione è sostenuta sia per *quale* evento la rappresenta. Nelle sequenze di eventi dello stesso tipo vinceva il membro più vicino al centro dell'area mappata (errori: EMSR137, EMSR240, EMSR304, EMSR317, EMSR798, EMSR882) e un evento lontano nel tempo scendeva sotto soglia (EMSR393). La mitigazione prevista ("unicità per attivazione") non era sufficiente.

**Varianti confrontate (simulazione sullo stesso golden set, confronto per magnitudo)**:

| Variante | TP | FP | FN | Precisione | Recall | Nota |
|---|---|---|---|---|---|---|
| A. v1 | 29 | 6 | 7 | 82,9 % | 80,6 % | respinta |
| B. candidato più severo | 33 | 0 | 3 | 100 % | 91,7 % | la soglia usa solo il rappresentante |
| C. B + scala temporale 14 g | 35 | 0 | 1 | 100 % | 97,2 % | parametro scelto dopo aver visto i dati: scartata |
| D. raggruppamento generico | 35 | 0 | 1 | 100 % | 97,2 % | stabile per finestre ≥ 72 h e 50–300 km |
| E. severità come fattore del punteggio | 32 | 3 | 4 | 91,4 % | 88,9 % | scartata |

**Decisione**: R2 v2 = variante D (primitiva generica §19.7). Motivazione architetturale: separa la forza dell'associazione (supporto del gruppo, dalla prossimità) dalla scelta del rappresentante (proprietà generica dichiarata dal tipo); non introduce concetti di dominio nel Core; vale anche senza geografia.

**Rischio di overfitting**: parametri 72 h / 150 km documentati come parametri della regola, non scelti per massimizzare il golden set (risultato identico da 72 a 168 h e da 50 a 300 km). Nel golden set reale nessuna finestra contiene due gruppi separati, quindi il vantaggio di D su B è dimostrato dalla **fixture anti-overfitting** sintetica (`fixtures/r2_grouping/`, congelata con i risultati attesi prima dell'implementazione): D corretto in 5/5 scenari (sequenza con evento dominante, due sequenze indipendenti, evento molto severo nel gruppo sbagliato, raggruppamento senza coordinate via partecipazione, rappresentante diverso dal candidato più vicino), B in 1/5, v1 in 2/5.

**Risultato reale di R2 v2 (motore, confronto per identificatore USGS)**: TP 34, FP 1, FN 2; **precisione 97,1 %, recall 94,4 %**; 0 negativi con insight. P17, P18, P19: PASS. Errori residui:
- **EMSR393 (Ambon)**: FN — supporto sotto soglia per il decadimento temporale (Δt 107 h); il decadimento non è stato modificato.
- **EMSR585 (Iran meridionale)**: FP + FN — due eventi M6.0 a due ore di distanza (doppietta); il golden set indica il primo (`us6000hz8x`), la regola a parità di severità sceglie il secondo per punteggio (`us6000hz9v`). L'attribuzione è intrinsecamente ambigua; il golden set **non** è stato modificato. La simulazione precedente (35/0/1) contava i due eventi come equivalenti perché confrontava la magnitudo, non l'identificatore.

**Correzione separata di P15 (entity resolution)**: alias espliciti legati all'identificatore canonico in `vocab/geography.toml` — `Viet Nam` → VNM, `Myanmar/Burma` → MMR, `Türkiye` → TUR, `Mayotte` → FRA (contenimento geografico verificato: in Natural Earth 1:50m Mayotte è inclusa nella feature France). `United States Minor Outlying Islands` resta non risolto di proposito (nessuna feature, identità ISO distinta). Nessun fuzzy matching. Risultato: **1.127 nomi di paese risolti su 1.128 (99,91 %)**, 1 non risolto (UM); le partecipazioni distinte sono 1.124 perché in 3 attivazioni "France" e "Mayotte" risolvono allo stesso oggetto.

---

## 28. Test 2 — Mondo non geografico (relazionale)

### 28.1 Scopo

Dimostrare che **lo stesso Core, senza modifiche**, rappresenta e correla un mondo **privo di coordinate**, e che WORLD MODE, OBJECT MODE, GRAPH, TIMELINE, SEARCH, evidenze e insight funzionano identici.

### 28.2 Fixture

- Fonti di test con `verdict = "fixture"`: `fixture.vuln_catalog_a` (gruppo `grpA`), `fixture.vuln_catalog_b` (`grpB`), `fixture.vuln_catalog_a_mirror` (`grpA`: verifica che un mirror **non** conti come fonte indipendente), `fixture.advisories` (`grpC`), `fixture.exploitation_list` (`grpD`).
- Identificatori **sintetici** (es. `VULN-TEST-0001`, `SW-TEST-lib`), formati ispirati a fonti ADOPT del catalogo, **nessun dato reale**, nessuna licenza di terzi (decisione I.1).
- Vocabolario `vocab/fixture_security.toml`: object types `security.vulnerability`, `software.package`, `software.product`, `org.organization`, `security.technique`; event types di §12.3; relation types di §11.5; **`geometry = none`** per tutti i tipi.

### 28.3 Mondo atteso (estratto)

```
VULN-TEST-0001 ──affects──▶ SW-TEST-lib            evidenze: grpA, grpB (+ mirror grpA: non conta)
SW-TEST-lib ──component_of──▶ PRODUCT-X, PRODUCT-Y
PRODUCT-X ──produced_by──▶ ORG-ALPHA ; PRODUCT-Y ──produced_by──▶ ORG-BETA
VULN-TEST-0001 ──associated_with──▶ TECH-TEST-01
EVENT vulnerability_published(subject VULN-TEST-0001)                  t0
EVENT exploitation_listed(subject VULN-TEST-0001)                      t0 + 4 giorni
EVENT advisory_issued(concerns PRODUCT-X, publisher ORG-ALPHA)         t0 + 6 giorni  → evidenza di affects via prodotto
```

Insight attesi:

| Regola | Insight | Spiegazione (forma) |
|---|---|---|
| N1 | association | "La relazione *VULN-TEST-0001 colpisce SW-TEST-lib* è sostenuta da 2 fonti indipendenti; l'inserimento nell'elenco di sfruttamenti è avvenuto 4 giorni dopo la pubblicazione. Associazione temporale, non un rapporto di causa verificato." |
| N2 | relation_hypothesis | "PRODUCT-X e PRODUCT-Y condividono il componente SW-TEST-lib, colpito da VULN-TEST-0001. Ipotesi di esposizione comune da verificare." |
| N3 | context | "ORG-ALPHA: 1 prodotto, 1 componente colpito, 1 vulnerabilità con sfruttamento elencato, 1 avviso pubblicato." |

Casi negativi inclusi: relazione sostenuta solo da `grpA` + mirror `grpA` ⇒ N1 **non** si attiva; evento di sfruttamento dopo 45 giorni ⇒ N1 non si attiva; prodotti con componenti diversi ⇒ N2 non si attiva.

**Informazione che nessuna fonte fornisce** (P40): nessuna fixture contiene l'esposizione comune di PRODUCT-X e PRODUCT-Y, né il quadro complessivo di ORG-ALPHA.

### 28.4 Catena di navigazione attesa

```
WORLD (scope: tipi security/software/org; nessun viewport)
 → OBJECT VULN-TEST-0001     context: fonti (grpA, grpB), relations (affects, associated_with), events (2), insight N1/N2
 → RELATION affects(…)       evidence_of: 3 evidenze, 2 gruppi indipendenti; eventi che la sostengono
 → OBJECT SW-TEST-lib        context: component_of → PRODUCT-X, PRODUCT-Y
 → OBJECT PRODUCT-X          context: produced_by ORG-ALPHA, advisory_issued, insight N2
 → OBJECT ORG-ALPHA          context: insight N3, timeline degli eventi collegati
```

`project_map` su questo scope restituisce `excluded.no_geometry = totale` e **nessun errore**; `locate(ref)` restituisce `not_applicable` per la mappa e posizioni valide per timeline e grafo.

### 28.5 Mondo misto

Il Test 2 viene eseguito anche **nello stesso database** del PoC 1: i due domini coesistono senza interferenze, e le operazioni comuni (search, facets, timeline, graph, insights) restituiscono risultati corretti per ciascuno scope.

---

## 29. Criteri PASS / FAIL

La Fase 1 è **PASS** solo se **tutti** i criteri sono soddisfatti. I benchmark mancati vanno motivati; sono bloccanti B13, B14, B16, B19 e B26 (P42).

### 29.1 Criteri della v0.1 (confermati o rafforzati)

| # | Criterio | PASS se | Variazione |
|---|---|---|---|
| P1 | Chiavi, account, carte richiesti | 0 | — |
| P2 | Registro valido e licenze verificate ≤ 30 giorni (fonti reali) | 4/4 | — |
| P3 | Richieste fuori allowlist · oltre rate · senza UA | 0 · 0 · 0 | — |
| P4 | Richieste senza header condizionali dove supportati | 0 | — |
| P5 | Test offline superati | 100 % | — |
| P6 | Hash logico del mondo dopo 2 rebuild | identico | — |
| P7 | Righe nuove alla seconda ingestione | 0 | — |
| P8 | Differenza incrementale vs batch | 0 | — |
| P9 | Elementi con catena non risolta fino a raw + licenza | 0 | esteso da insight a **relazioni, claim, partecipazioni** |
| P10 | Insight privi di un campo obbligatorio (§20) | 0 | — |
| P11 | Termini causali nelle spiegazioni | 0 | — |
| P12 | Eventi duplicati per stesso id nativo | 0 | — |
| P13 | Aeroporti con paese risolto | ≥ 99,5 % | — |
| P14 | Concordanza contenimento/paese asserito (large/medium) | ≥ 98 % | — |
| P15 | Nomi di paese Copernicus risolti; errori nel campione ≥ 50 | ≥ 98 %; 0 errori | — |
| P16 | Errore haversine vs riferimento (≥ 30 coppie) | < 0,5 % | — |
| P17 | Recall R2 (≥ 20 positivi) | ≥ 90 % | — |
| P18 | Precisione R2 | ≥ 95 % | — |
| P19 | Falsi positivi R2 (≥ 20 negativi) | ≤ 1 | — |
| P20 | Insight composito Myanmar con VYMD | presente | — |
| P21 | Operazioni con DTO validi | 100 % | esteso a **tutte le operazioni di §22.5** |
| P22 | Elementi senza licenza risalente · fonti mancanti nelle attribuzioni | 0 · 0 | — |
| P23 | *(sostituito da P28 e P29)* | — | rafforzato |
| P24 | Commit con autore diverso o coautori | 0 | — |
| P25 | Codice/asset/dati OSIRIS | 0 | — |
| P26 | B13 e B14 entro obiettivo | sì | assorbito da P42 |

### 29.2 Nuovi criteri per la Product Vision

| # | Criterio | Misura | PASS se |
|---|---|---|---|
| **P27** | Test non geografico | insight attesi N1–N3 prodotti · casi negativi prodotti · geometrie nel mondo del Test 2 | 100 % · 0 · 0 |
| **P28** | Core domain-agnostic (statico) | occorrenze dei termini di §5.2 in `nexum/core/` | 0 |
| **P29** | Core domain-agnostic (dinamico) | file modificati sotto `nexum/core/` per aggiungere il dominio del Test 2 | 0 |
| **P30** | Riferimento stabile tra viste | ≥ 200 elementi campionati (entrambi i test) con `EntityRef` identico in `project_map` (se geo), `neighborhood`, `project_timeline`, `search`, `context`, `locate` | 100 % |
| **P31** | Pivot completi | catene §27.4 e §28.4: passi che restituiscono le sezioni attese | 100 % |
| **P32** | Evidence traversal | relazioni con evidenze navigabili fino a fonte e raw; eventi che sostengono una relazione restituiti da `evidence_of` | 100 % |
| **P33** | Nessun download del mondo | operazioni che accettano richieste senza budget · risposte oltre `max_items`/`max_nodes`/`max_bytes` · `truncated` errato | 0 · 0 · 0 |
| **P34** | Coerenza degli aggregati | ≥ 100 scope casuali deterministici: somma celle = somma bucket = totale lista = faccette | 100 % esatti |
| **P35** | Confidenza spiegabile | valori ricostruiti dai fattori (tolleranza 1e-9) · valori senza scomposizione · termini probabilistici in DTO e spiegazioni | 100 % · 0 · 0 |
| **P36** | Indipendenza delle fonti | evidenze dello stesso gruppo conteggiate come indipendenti (test con mirror) | 0 |
| **P37** | OBJECT MODE completo | `context` sul terremoto del Myanmar: 8 sezioni non vuote; su VULN-TEST-0001: 7 sezioni non vuote e Geography `not_applicable` | 100 % |
| **P38** | Geografia opzionale | errori delle operazioni su elementi senza geometria · esclusioni non contate in `excluded` | 0 · 0 |
| **P39** | Aggiornamenti incrementali | differenza tra `changes_since` e cambiamenti reali dopo un'ingestione incrementale | 0 |
| **P40** | Valore della connessione (Test 2) | insight del Test 2 con informazione assente da ogni singola fonte fixture (verifica enumerata) | ≥ 1 |
| **P41** | Mondo misto | risultati di PoC 1 e Test 2 nello stesso DB vs DB separati | identici |
| **P42** | Benchmark bloccanti | B13, B14, B16, B19, B26 | entro obiettivo |

**FAIL** se anche uno solo dei criteri P1–P42 (escluso P23, sostituito) non è soddisfatto. Nessuna soglia della v0.1 è stata abbassata.

---

## 30. Piano di lavoro della Fase 1 (dopo il GO)

| Passo | Contenuto | Criteri |
|---|---|---|
| 1 | Riverifica licenze delle 4 fonti; golden set PoC 1; fixture Test 2 | P2 |
| 2 | Sistema dei tipi, registro, schema, migrazioni, test statico domain-agnostic | P28 |
| 3 | Scheduler, Raw Store, server di test | P3, P4, P7 |
| 4 | Mondo: objects, events, relazioni canoniche, evidence, claim, provenance, confidence | P9, P35, P36 |
| 5 | Connettori OurAirports, Natural Earth, USGS, Copernicus EMS; arricchimenti dichiarativi | P12–P15 |
| 6 | Indici (spaziale, temporale, grafo, gradi, testo, aggregati, change log) | P16, P34, P39 |
| 7 | Contratto di query: scope, budget, LOD, proiezioni, context, traversal | P21, P30–P33, P37, P38 |
| 8 | Motore di pattern; regole R1–R3, N1–N3 | P8, P10, P11, P17–P20, P27, P40 |
| 9 | Test 2 senza modifiche al Core; mondo misto | P29, P41 |
| 10 | Generatore D2/D3, benchmark, rebuild, offline, report finale | P5, P6, P42 |

Ogni passo si chiude con test verdi e commit locale (autore unico, nessun coautore, nessun push senza autorizzazione).

---

## 31. Confronto con la Fase 0 — contraddizioni (riesaminate)

### 31.1 Le 16 contraddizioni della v0.1

| # | Documento | Contraddizione | Risoluzione | Stato |
|---|---|---|---|---|
| C1 | ROADMAP Fase 1 | fonti EMSC/INGV; EMSC è COND | PoC su 4 fonti ADOPT | confermata |
| C2 | ROADMAP | correlazione prevista in Fase 3 | la Fase 1 include il motore generico | **ampliata**: anche contratto multi-vista e test non geografico |
| C3 | DATA-MODEL §1 | ULID per tutte le entità vs riproducibilità | ID deterministici | confermata |
| C4 | DATA-MODEL §5.1 | `near` materializzata | su richiesta / come evidenza | confermata |
| C5 | DATA-MODEL §11, ARCH §6 | "Hypothesis" | **Insight** con `kind`, incluso `relation_hypothesis` | ampliata |
| C6 | ARCH §3.4 | zstd | gzip + `codec` | confermata |
| C7 | ARCH §4 | Shapely, feedparser, FastAPI | zero dipendenze di runtime; HTTP in Fase 2 | confermata |
| C8 | DATA-MODEL §6.2 | manca `emergency.mapping_activation` | aggiunto **in `vocab/`**, non nel Core | **modificata** |
| C9 | DATA-MODEL §8.1 | `freshness` su eventi storici | solo per viste di stato corrente | confermata |
| C10 | SOURCES §2 | note mancanti su Copernicus EMS (fuso, date testuali incoerenti) | note da aggiungere | confermata |
| C11 | SOURCES §1 | Natural Earth `-99`, URL di download | note da aggiungere | confermata |
| C12 | FEASIBILITY §7 | "5 fonti" | 4 fonti reali + fixture | confermata |
| C13 | ROADMAP, decisioni aperte | linguaggio, regione | Python; Italia come validazione | confermata |
| C14 | LEGAL §3 | riverifica licenze | passo 1 + P2 | confermata |
| C15 | VISION §5 | esempi con fonti COND | nessuna modifica | confermata |
| C16 | ARCH §6.4 vs DATA-MODEL §8.3 | due formule di punteggio | formula unica di §16.3 | **ampliata**: nuovi fattori |

### 31.2 Nuove contraddizioni emerse dalla Product Vision

| # | Documento | Contraddizione | Risoluzione |
|---|---|---|---|
| C17 | [NEXUM-VISION.md](NEXUM-VISION.md) | mancano frase fondante, STORY, NEXUM WORLD, WORLD/OBJECT MODE, differenza da EarthRadar, destinazione `nexum.pezzaliapp.com` | aggiornare la visione con §1 di questa specifica |
| C18 | [NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) §5 | una relazione ha un solo `provenance`; mancano evidenze multiple e conteggio delle fonti indipendenti | relazione canonica + tabella `evidence` (§11.2, §15) |
| C19 | DATA-MODEL §4.1, §5.1, §6.2 | tassonomie scritte come parte del modello | i tipi diventano **dati di configurazione** (§4.3); le tassonomie restano esempi |
| C20 | DATA-MODEL §8 | linguaggio della confidenza vicino al probabilistico ("noisy-OR") | grado di supporto deterministico, esplicitamente non probabilistico (§16) |
| C21 | [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md) §3.9 | UI descritta come "mappa, timeline, grafo, pannello provenienza", mappa per prima | sostituire con ONE WORLD / MULTIPLE VIEWS, WORLD MODE e OBJECT MODE |
| C22 | ARCHITECTURE §3.8 | API locale per "oggetti, eventi in finestra spazio-temporale, vicini, timeline" | sostituire con il contratto di §22 |
| C23 | ARCHITECTURE §6.2 | primitive con la spaziale per prima; nessuna primitiva di evidenza | primitive di §19.3 |
| C24 | [NEXUM-ROADMAP.md](NEXUM-ROADMAP.md) Fase 2 | "mappa MapLibre + basemap PMTiles" come primo elemento | Fase 2 = workspace multi-vista (UI candidata TypeScript + MapLibre); la mappa è una delle viste |
| C25 | ROADMAP Fase 4 | espansione "per blocchi di dominio" | espansione come nuovi tipi e regole nello stesso mondo; ogni blocco porta almeno una regola che lo collega ad altri domini |
| C26 | v0.1 di questa specifica | severità, ruoli, arricchimenti spaziali e casi di risoluzione descritti nelle sezioni del Core | spostati in `vocab/`, `connectors/`, `rules/` (§5.2, §7.3) |
| C27 | v0.1 di questa specifica | query layer con `map_features`/`within` come operazioni centrali; niente `context`, budget, evidenze per le relazioni | contratto §22 |

Nessuna contraddizione con i vincoli non negoziabili, con la decisione A o con le funzioni vietate. **Le modifiche ai documenti della Fase 0 non sono ancora applicate**: verranno fatte dopo il GO, in un commit separato.

---

## 32. Rischi specifici

| Rischio | Mitigazione |
|---|---|
| Il Core generico è più lento di query specializzate | indici dedicati (`edge`, `degree`, `agg_cell`), benchmark su D2 con nodi hub |
| Il motore di pattern cresce in complessità | primitive limitate (§19.3), `max_hops ≤ 3/4`, limiti di candidati; nessun linguaggio generale |
| Aggregati materializzati incoerenti | ricalcolo in `rebuild`, P34 |
| Il test non geografico diventa "di facciata" | P27, P29, P40, P41 e benchmark su D3 |
| Centroide Copernicus ≠ epicentro | raggio 300 km, incertezza 50 km, golden set |
| Repliche sismiche | unicità per attivazione |
| Fuso Copernicus non dichiarato | finestra −1 h, flag |
| Soglie arbitrarie | parametri versionati, tarati sul golden set |
| Dimensione di D2 su SQLite | B14 < 4 GB, B28 < 15 min; se non raggiungibili, la misura guida l'ottimizzazione, **non** il rilassamento delle soglie |

---

## 33. Decisioni dell'autore (prese il 2026-09-28)

| # | Decisione presa |
|---|---|
| I.1 | **Dati sintetici deterministici** con identificatori fittizi per il Test 2 (D3). Il test dimostra solo che il Core è domain-agnostic e funziona senza geografia; **non** è una prova di accuratezza su fenomeni reali. |
| I.2 | **D2 approvato**: 1.000.000 eventi, 2.000.000 relazioni, 40 % senza geometria, nodi con oltre 50.000 collegamenti; generabile deterministicamente; nel repository si include **solo il generatore** se il dataset è troppo grande. |
| I.3 | **Formato dell'investigation trail nella Fase 1**; persistenza rinviata alla Fase 2. |
| I.4 | Destinazione prevista **nexum.pezzaliapp.com**; nessun deployment né DNS nella Fase 1. |

**Tre prove distinte e non intercambiabili**: D1 (validazione su dati reali), D2 (validazione di scala), D3 (validazione di indipendenza dal dominio). Un PASS ottenuto con dati sintetici non sostituisce un criterio che richiede dati reali.

### 33.1 Opzioni che erano state proposte

| # | Decisione | Opzioni | Raccomandazione |
|---|---|---|---|
| I.1 | Dati del Test 2 | (a) **sintetici** con identificatori fittizi · (b) piccolo estratto reale da fonti ADOPT (CISA KEV CC0 + CVE + MITRE, con avvisi di licenza) | **(a)** in Fase 1: deterministico, nessun obbligo di licenza, nessun rischio di affermazioni fattuali errate; (b) quando il dominio cyber entrerà nella roadmap |
| I.2 | Dataset sintetico di scala D2/D3 come base dei benchmark di densità | sì · no | **sì** |
| I.3 | Persistenza del *trail* di indagine | Fase 1 (tabella nel Core) · Fase 2 (con la UI) | **Fase 2**; formato definito ora |
| I.4 | Uso di `nexum.pezzaliapp.com` | sito di progetto statico · demo con snapshot statico · nessun uso fino alla Fase 6 | decidere entro la Fase 2; **nessun impatto sulla Fase 1** |

---

## 34. Note di implementazione della Fase 1 (2026-09-29)

Scelte fisiche adottate durante l'implementazione. Non cambiano requisiti, soglie o contratto logico; sono registrate qui per trasparenza.

| Tema | Schema logico (§24) | Implementazione | Motivo |
|---|---|---|---|
| Evidence | `evidence_id` come chiave | chiave naturale `(supports_id, support_id, role)`; `evidence_id` calcolato in modo deterministico ed esposto nei DTO | spazio (B14 su D2) |
| Archi del grafo | `src_kind`, `dst_kind`, `confidence` copiata | tipo di entità ricavato dal prefisso dell'ID; chiave primaria sull'origine; confidenza letta dalla riga canonica (relazione/partecipazione) | spazio; nessun dato duplicato da mantenere coerente |
| Relazioni e partecipazioni | indici per estremo | lettura per estremo attraverso gli archi (`edge`), già indicizzati nelle due direzioni | indici duplicati eliminati |
| `degree` | tutti i gruppi | **cache dei soli gruppi grandi** (≥ 100 archi, "hub"); gli altri conteggi sono calcolati a richiesta; gruppi distinti trovati con ricerche mirate sull'indice | spazio; risultati identici |
| Provenienza | `prov_id` testuale | handle intero; la chiave deterministica resta in `provenance.prov_key`; per le affermazioni asserite la provenienza è per payload (raw), il collegamento puntuale è `evidence → record → raw_locator` | spazio |
| `record.parser_version` | per record | versione del connettore in `raw_processed` (per payload) | ridondanza |
| Full-text | tabella con contenuto | FTS5 *contentless* con cancellazione, legata a `rid_map` | spazio |
| Alias | anche l'etichetta | solo nomi aggiuntivi (fonte, vocabolario) e l'etichetta dei tipi con `name_match`; la risoluzione per nome usa anche la ricerca full-text sull'etichetta con confronto esatto normalizzato | spazio; nessun fuzzy matching |
| Claim | anche valori mancanti | solo valori presenti (un valore assente non è un'affermazione) | correttezza e spazio |
| Change log | ogni modifica | nei caricamenti massivi iniziali si registra un "floor"; `changes_since` sotto il floor risponde `reset_required` (serve un ricaricamento completo) | spazio e tempo |
| Manutenzione | — | `VACUUM` a fine costruzione (`Nexum.compact`); i benchmark riportano la dimensione prima e dopo | frammentazione delle B-tree con chiavi hash |
| Rate limit per host | in memoria | ricostruito dal `fetch_log` persistente all'avvio di ogni sessione | **bug trovato dal test P3**: una nuova sessione poteva interrogare lo stesso host subito dopo la precedente |
| Budget della mappa | — | in modalità aggregata, se le celle superano `max_items` il livello di aggregazione diventa più grossolano; solo al livello minimo si tronca e si segnala | DENSITY WITHOUT CHAOS; bug trovato dal test P33 |
| OBJECT MODE | insight con il fuoco come membro | anche gli insight costruiti su quelli (compositi), un livello di transitività | il nesso composito deve comparire nel contesto dell'evento |
| Backfill USGS | finestre mensili | finestre annuali FDSN (12 richieste invece di ~140) | meno carico sulla fonte |
| CLI e configurazioni dei mondi | `nexum/core/cli` | `nexum/cli.py` e `nexum/worlds.py`, **fuori dal Core** | i percorsi dei mondi sono configurazione di installazione, non concetti del Core |
| Generatore D2 | — | coppie di eventi piantate e distribuzione dei tipi corrette per rispettare i parametri approvati (50.000 insight, 40 % senza geometria) prima della misura finale | la prima versione del generatore non rispettava i parametri |
| Ordine di risoluzione dei pattern | ordine di dichiarazione delle variabili | ordinamento dinamico: prima la variabile collegata da un vincolo generativo a una già assegnata (join ordering generico); risultati indipendenti dall'ordine | benchmark B11 su D3 (648 ms → ~135 ms), stessi insight |
| Correlazione incrementale su grandi cambiamenti | sempre incrementale | se cambia più del 20 % del mondo si esegue un passaggio batch (risultati identici, verificati da P8) | prima ingestione di mondi grandi |
| Mappa a zoom locale (z ≥ 10) | celle di aggregazione | viewport **esatto** con conteggi dal vivo (R*Tree); le celle servono solo quando la densità supera il budget; conteggi, faccette e verifica indipendente usano la stessa semantica | B18: l'aggancio alle celle di livello 8 includeva un'area troppo grande |
| Ricerca su termini molto comuni | sempre ordinata per rilevanza | pianificazione della query: i token con oltre 20.000 documenti (o prefissi che si espandono in migliaia di termini) non guidano la ricerca full-text ma filtrano i candidati su etichetta, alias e identificatori; se tutti i token sono frequenti i risultati sono restituiti senza ranking e la risposta lo dichiara (`ranked: false`, stima dei risultati); le frequenze dei termini sono in cache per versione del mondo | B10: le liste di documenti dei termini frequenti dominavano il costo |

