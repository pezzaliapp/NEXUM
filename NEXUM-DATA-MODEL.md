# NEXUM — Modello dati

> **ONE OBJECT. MANY RELATIONS. ONE TIMELINE.**

Stato: bozza di progetto v0.1 — nessuna implementazione. Gli schemi sono descritti in forma logica; la sintassi SQL definitiva sarà scelta in fase di implementazione (vedi [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md)).


> **Revisione 2026-09-28 — Fase 1 v0.2 approvata.** Decisioni successive che aggiornano questo documento (senza cancellarne la storia; le parti superate sono marcate):

> - **Tipi come configurazione**: le tassonomie di §4.1, §5.1, §6.2 sono **esempi**; i tipi reali sono dichiarati in file di configurazione (`vocab/`) con identità, geometria ammessa, estremi e **natura** delle relazioni (`spatial`, `logical`, `temporal`, `infrastructural`, `organizational`, `technological`, `informational`). Il Core non conosce tipi di dominio.
> - **Location opzionale**: la geografia è una proprietà, non l'architettura.
> - **Evidence**: concetto autonomo; ogni relazione è **canonica** (una per tipo, estremi, inizio validità) e ha **più evidenze** (da record di fonte o da eventi), con conteggio dei gruppi di fonti indipendenti.
> - **ID deterministici** (§1), relazione `near` su richiesta (§5.1), **Insight** al posto di Hypothesis (§11), confidenza deterministica e non probabilistica (§8).
> - Nuovo tipo di esempio: `emergency.mapping_activation`.
> - Riferimento normativo: [NEXUM-PHASE1-SPEC.md](NEXUM-PHASE1-SPEC.md) §4, §8.4, §11, §15, §16, §20.

---

## 1. Visione d'insieme

```
            ┌──────────┐         ┌──────────────┐
            │  SOURCE  │◄────────│  RAW RECORD  │   (dato grezzo, immutabile)
            └──────────┘         └──────┬───────┘
                                        │ derivato da (PROVENANCE)
               ┌────────────────────────┼─────────────────────────┐
               ▼                        ▼                         ▼
          ┌─────────┐   RELATION   ┌─────────┐   partecipa   ┌─────────┐
          │ OBJECT  │─────────────►│ OBJECT  │◄──────────────│  EVENT  │
          └────┬────┘              └─────────┘   (ruolo)     └────┬────┘
               │ IDENTIFIER (schemi esterni)                      │
               ▼                                                  ▼
          ┌─────────┐                                       ┌──────────┐
          │  CLAIM  │  (attributi datati, con confidenza)   │ TIMELINE │
          └─────────┘                                       └────┬─────┘
                                                                 ▼
                                                      ┌───────────────────┐
                                                      │ CORRELATION /     │
                                                      │ HYPOTHESIS        │
                                                      └───────────────────┘
```

Regole fondamentali:

1. **Il dato grezzo non si modifica mai.** Tutto ciò che sta sopra è derivato e ricostruibile.
2. **Un oggetto del mondo reale esiste una sola volta** (ONE OBJECT). Più fonti che parlano della stessa cosa producono più *identificatori* e più *claim* sullo stesso oggetto, non oggetti duplicati.
3. **Ogni affermazione ha provenienza e confidenza.** Nessuna eccezione.
4. **Il tempo è bitemporale**: *quando è vero nel mondo* (valid time) e *quando NEXUM l'ha saputo* (recorded time).
5. **Identificatori stabili**: ~~ogni entità NEXUM ha un ID ULID~~ *(superato il 2026-09-28)*: le entità del mondo hanno **ID deterministici** derivati dalla chiave di identità del tipo; gli ULID restano solo per esecuzioni, raw record e log (specifica Fase 1 §8.4). Motivo: gli ULID casuali impediscono la riproducibilità richiesta dall'architettura.

---

## 2. Source (fonte)

Descrive una fonte dati e le condizioni legali del suo utilizzo. È la base del registro legale ([NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md)).

| Campo | Tipo | Note |
|---|---|---|
| `source_id` | testo | slug stabile, es. `usgs.earthquakes` |
| `name`, `owner` | testo | ente proprietario |
| `homepage`, `endpoint` | URL | |
| `access_type` | enum | `rest_json`, `geojson`, `rss`, `atom`, `cap`, `bulk_file`, `stac`, `sparql`, `wms` |
| `license_id` | testo | SPDX quando esiste (`CC-BY-4.0`, `ODbL-1.0`, `CC0-1.0`), altrimenti `custom:<slug>` |
| `license_url`, `terms_url` | URL | versione verificata |
| `attribution` | testo | testo di attribuzione obbligatorio |
| `auth` | enum | `none`, `free_key`, `free_account` |
| `rate_limit` | testo strutturato | es. `1 req/min`, `10k/day` |
| `cache_policy` | testo | TTL minimo tra richieste, possibilità di conservazione |
| `redistribution` | enum | `allowed`, `allowed_with_attribution`, `share_alike`, `forbidden`, `unknown` |
| `commercial_use` | enum | `allowed`, `non_commercial_only`, `unknown` |
| `reliability_tier` | enum | vedi §8 |
| `verdict` | enum | `adopt`, `adopt_with_conditions`, `reject` |
| `verified_at` | data | ultima verifica di licenza/ToS |

Una fonte con `verdict = reject` non può avere un connettore attivo. Una fonte con `redistribution = forbidden` può essere usata solo localmente e i suoi dati non entrano in esportazioni.

## 3. Raw Record (dato grezzo)

| Campo | Note |
|---|---|
| `raw_id` | ULID |
| `source_id` | → Source |
| `fetched_at` | istante UTC di acquisizione |
| `request` | URL e parametri (mai credenziali) |
| `http_status`, `etag`, `last_modified` | per richieste condizionali e caching rispettoso |
| `content_hash` | SHA-256 del payload: deduplica e integrità |
| `payload_ref` | percorso del file compresso nell'archivio locale (content-addressed) |
| `parser_id`, `parser_version` | chi lo ha interpretato |

I payload sono conservati come file compressi (`zstd` nel progetto originale; **gzip** nella Fase 1, con campo `codec`, perché zstd non è nella libreria standard di Python 3.12) indirizzati per hash. Questo permette di **rigiocare** l'intera derivazione con un parser corretto senza riscaricare nulla.

---

## 4. Object (oggetto)

Un Object è un'entità persistente e identificabile.

| Campo | Note |
|---|---|
| `object_id` | ULID |
| `type` | tipo controllato (vedi tassonomia) |
| `label` | nome canonico leggibile |
| `geometry` | opzionale: GeoJSON (Point, LineString, Polygon…) in WGS84 |
| `bbox` | derivato, indicizzato spazialmente |
| `valid_from`, `valid_to` | esistenza nel mondo reale (es. data di messa in servizio/dismissione) |
| `status` | `active`, `merged_into:<id>`, `retired` |

Gli attributi variabili **non** stanno nell'oggetto: sono **Claim** (§4.3). Così ogni attributo ha la sua storia, la sua fonte e la sua confidenza.

### 4.1 Tassonomia iniziale degli oggetti

| Dominio | Tipi |
|---|---|
| Geografia | `place.country`, `place.admin_area`, `place.city`, `place.region`, `place.water_body` |
| Eventi naturali | `natural.volcano`, `natural.fault_zone`, `natural.river_basin` |
| Meteorologia | `weather.station`, `weather.warning_area` |
| Trasporti | `transport.airport`, `transport.port`, `transport.rail_station`, `transport.route`, `transport.chokepoint` |
| Aviazione | `aviation.aircraft` (solo identificatori tecnici pubblici, vedi §10), `aviation.airspace` |
| Navigazione | `maritime.vessel` (solo navi commerciali con IMO/MMSI pubblici, vedi §10) |
| Infrastrutture | `infra.power_plant`, `infra.substation`, `infra.power_line`, `infra.pipeline`, `infra.submarine_cable`, `infra.dam`, `infra.bridge` |
| Energia | `energy.bidding_zone`, `energy.interconnector` |
| Spazio | `space.satellite`, `space.launch_site`, `space.debris_object` |
| Cybersecurity | `cyber.vulnerability`, `cyber.product`, `cyber.vendor`, `cyber.weakness` (CWE), `cyber.technique` (catalogo pubblico), `cyber.network` (ASN) |
| Economia | `econ.indicator`, `econ.market_zone`, `econ.commodity` |
| Organizzazioni | `org.agency`, `org.operator`, `org.company` (solo persone giuridiche) |
| Informazione | `info.publisher`, `info.feed` |

Le **persone fisiche non sono un tipo di oggetto.** Vedi §10.

### 4.2 Identifier (identificatori esterni)

| Campo | Note |
|---|---|
| `object_id` | → Object |
| `scheme` | es. `wikidata`, `iso3166`, `icao`, `iata`, `unlocode`, `imo`, `gvp` (volcano number), `norad`, `cospar`, `cve`, `cwe`, `cpe`, `asn`, `osm`, `geonames`, `eic` (ENTSO-E) |
| `value` | valore nello schema |
| `source_id` | chi lo ha asserito |

Coppia (`scheme`, `value`) unica. È il meccanismo principale di **risoluzione delle entità**: se due fonti citano `icao:LIRF`, parlano dello stesso aeroporto.

### 4.3 Claim (attributo datato)

| Campo | Note |
|---|---|
| `claim_id` | ULID |
| `subject_id` | → Object (o Event) |
| `property` | nome controllato, es. `capacity_mw`, `elevation_m`, `population`, `cvss_base_score` |
| `value` | valore tipizzato + unità (SI dove possibile) |
| `valid_from`, `valid_to` | validità nel mondo |
| `recorded_at` | quando NEXUM l'ha registrato |
| `provenance` | → §7 |
| `confidence` | → §8 |

Più claim contraddittori sulla stessa proprietà **coesistono**; la vista "valore corrente" sceglie quello con confidenza più alta e mostra il disaccordo.

---

## 5. Relation (relazione)

Una Relation è un arco **tipizzato, orientato e datato** tra due Object.

| Campo | Note |
|---|---|
| `relation_id` | ULID |
| `type` | tipo controllato |
| `from_id`, `to_id` | → Object |
| `valid_from`, `valid_to` | le relazioni cambiano nel tempo |
| `attributes` | JSON ridotto (es. `distance_km`, `share_pct`) |
| `provenance`, `confidence` | obbligatori |
| `derivation` | `asserted` (dichiarata da una fonte) oppure `computed` (calcolata da NEXUM, es. prossimità) |

### 5.1 Tipi iniziali

| Tipo | Esempio | Derivazione tipica |
|---|---|---|
| `located_in` | aeroporto → città → paese | asserita / calcolata (point-in-polygon) |
| `near` | centrale → vulcano (con `distance_km`) | calcolata **su richiesta**; materializzata solo come evidenza di un insight (revisione 2026-09-28) |
| `part_of` | sottostazione → rete; zona di offerta → paese | asserita |
| `connects` | cavo sottomarino → punto di approdo; interconnettore → zone | asserita |
| `operated_by` | aeroporto → ente gestore (persona giuridica) | asserita |
| `supplies` | centrale → zona di offerta | asserita |
| `affects` | CVE → prodotto | asserita (NVD/CPE) |
| `instance_of_weakness` | CVE → CWE | asserita |
| `published_by` | feed → editore | asserita |
| `same_as` | usata solo durante la fusione di entità, poi risolta | calcolata |

Il vocabolario dei tipi è versionato in un file di configurazione, non nel codice.

---

## 6. Event (evento)

Un Event è qualcosa che **accade**: ha un tempo e, spesso, un luogo.

| Campo | Note |
|---|---|
| `event_id` | ULID |
| `type` | tipo controllato |
| `t_start`, `t_end` | istanti UTC; `t_end` nullo per eventi puntuali o in corso |
| `t_precision` | `second`, `minute`, `hour`, `day`, `month`, `year` |
| `t_uncertainty_s` | incertezza in secondi (es. ora di origine sismica ± 2 s) |
| `geometry` | punto, area o traccia |
| `geo_uncertainty_m` | incertezza spaziale |
| `severity` | scala normalizzata 0–1 + valore originale (es. `Mw 6.1`, `GDACS orange`, `CVSS 9.8`) |
| `status` | `preliminary`, `reviewed`, `updated`, `retracted` |
| `provenance`, `confidence` | obbligatori |

### 6.1 Partecipazione (Event ↔ Object)

| Campo | Note |
|---|---|
| `event_id`, `object_id` | |
| `role` | `origin` (vulcano che erutta), `affected` (aeroporto chiuso), `subject` (CVE pubblicata), `reporter` (feed che ne parla), `location` |

### 6.2 Tipi iniziali

| Dominio | Tipi di evento |
|---|---|
| Sismica | `seismic.earthquake`, `seismic.tsunami_alert` |
| Vulcani | `volcanic.eruption`, `volcanic.activity_report`, `volcanic.ash_advisory` |
| Incendi | `fire.hotspot`, `fire.burned_area` |
| Meteo | `weather.warning`, `weather.extreme_observation`, `weather.tropical_cyclone` |
| Idrogeologico | `hydro.flood`, `hydro.landslide` |
| Space weather | `space.solar_flare`, `space.cme`, `space.geomagnetic_storm` |
| Spazio | `space.launch`, `space.reentry`, `space.conjunction` (solo dati pubblici) |
| Trasporti | `transport.airport_disruption`, `transport.notam_like` (se disponibile lecitamente), `maritime.port_call` (aggregato) |
| Energia | `energy.outage`, `energy.unavailability`, `energy.price_anomaly` |
| Cyber | `cyber.vuln_published`, `cyber.vuln_exploited_known` (catalogo KEV), `cyber.advisory` |
| Internet | `internet.outage` (misure aggregate per paese/ASN) |
| Economia | `econ.indicator_release` |
| Informazione | `info.article` (solo metadati: titolo, link, data, fonte) |
| Sistema | ~~`nexum.hypothesis_created`~~ → `nexum.insight_created` (revisione 2026-09-28) |

### 6.3 Evento vs. Claim

- Il valore della magnitudo di un terremoto è un **attributo dell'evento** (claim sull'evento).
- La revisione della magnitudo da 6.0 a 6.1 è un **nuovo claim** con `recorded_at` successivo: la storia delle revisioni resta visibile.

---

## 7. Provenance (provenienza)

Modello ispirato ai concetti pubblici di W3C PROV (Entity, Activity, Agent), ridotto al minimo.

| Campo | Note |
|---|---|
| `provenance_id` | ULID |
| `raw_ids` | uno o più Raw Record di origine |
| `activity` | `ingest`, `parse`, `resolve_entity`, `compute_relation`, `correlate`, `manual` |
| `agent` | `connector:<id>@<versione>`, `rule:<id>@<versione>`, `user:local` |
| `derived_from` | altri elementi NEXUM (per catene di derivazione) |
| `at` | istante UTC |

Proprietà garantite:

- **Tracciabilità completa**: da ogni insight si risale, clic dopo clic, al file grezzo e al testo della licenza.
- **Riproducibilità**: stessi raw record + stesse versioni di parser/regole ⇒ stesso risultato.
- **Revocabilità**: se una fonte viene esclusa (es. cambio di licenza), tutto ciò che ne deriva è individuabile e rimovibile.

---

## 8. Confidence (confidenza)

La confidenza è un numero in `[0, 1]` **sempre accompagnato dalla sua scomposizione**.

### 8.1 Fattori

| Fattore | Significato | Esempio |
|---|---|---|
| `source_reliability` | affidabilità della fonte (per tier) | ente istituzionale scientifico = alta |
| `method` | come è stato ottenuto il dato | valore misurato > derivato > estratto da testo |
| `precision` | precisione spazio-temporale | coordinate a 10 m vs centroide di paese |
| `corroboration` | numero di fonti **indipendenti** concordi | USGS + EMSC + INGV |
| `freshness` | età rispetto alla frequenza attesa della fonte; **solo per viste di stato corrente**, non per eventi storici (revisione 2026-09-28) | feed fermo da 3 giorni = penalità |
| `status` | stato dichiarato dalla fonte | `preliminary` < `reviewed` |

### 8.2 Tier di affidabilità delle fonti (classificazione NEXUM)

| Tier | Descrizione | Peso iniziale |
|---|---|---|
| `T1` | Ente scientifico/istituzionale con dati misurati e revisionati | 0.95 |
| `T2` | Ente istituzionale, dati operativi o preliminari | 0.85 |
| `T3` | Progetto open/community con controllo qualità (es. OSM, Wikidata) | 0.75 |
| `T4` | Rete crowdsourced senza revisione sistematica | 0.60 |
| `T5` | Media e notizie (metadati) | 0.50 |
| `T6` | Estrazione automatica da testo libero | 0.35 |

I pesi sono **configurabili** e documentati: nessun numero magico nascosto.

### 8.3 Composizione

- Singola fonte: `c = reliability × method × precision × freshness × status`.
- Più fonti indipendenti che concordano: combinazione del supporto per gruppi di indipendenza, `c = 1 − Π(1 − cᵍ)` con `cᵍ` = miglior evidenza del gruppo `g`; due mirror dello stesso dato non si sommano. *(Revisione 2026-09-28: la confidenza è un **grado di supporto deterministico, non una probabilità**; formula unica e fattori completi nella specifica Fase 1 §16.)*
- Correlazioni: la confidenza di un'ipotesi è limitata dalla confidenza del suo anello più debole moltiplicata per la forza della regola (vedi [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md) §6).

La UI mostra sempre la confidenza in forma leggibile (es. *alta — 3 fonti istituzionali concordi, dato revisionato*).

---

## 9. Timeline

La Timeline non è una tabella separata: è una **vista unificata** su tutto ciò che ha un tempo.

| Elemento sulla timeline | Origine |
|---|---|
| Eventi | `Event.t_start` / `t_end` |
| Cambiamenti di stato | `Claim.valid_from` (es. capacità di una centrale cambiata) |
| Nascita/fine di relazioni | `Relation.valid_from` / `valid_to` |
| Insight (ex "ipotesi di correlazione") | evento `nexum.insight_created` |

### 9.1 Regole temporali

- Tutti gli istanti in **UTC**, formato ISO 8601; il fuso originale è conservato come metadato.
- **Bitemporalità**: ogni riga ha *valid time* (quando è vero nel mondo) e *recorded time* (quando NEXUM lo ha saputo). Consente la domanda: *"cosa sapevamo alle 14:00 del 3 marzo?"*.
- **Precisione esplicita**: un evento datato "marzo 2026" non viene mai trattato come "1 marzo 2026 00:00".
- **Intervalli e incertezza**: gli operatori temporali (prima, dopo, sovrapposto, entro Δt) usano intervalli, non istanti puntuali.

### 9.2 Operazioni previste

- Filtro per finestra temporale, dominio, area geografica, oggetto.
- "Riproduzione" (replay) dello stato del mondo a un istante dato.
- Timeline di un singolo oggetto: tutto ciò che gli è accaduto e tutte le relazioni che ha avuto.

---

## 10. Dati personali e oggetti sensibili

- **Nessun oggetto di tipo persona fisica.** Se una fonte contiene nomi di persone (es. firmatari di una notizia), essi restano nel raw record e non diventano oggetti né relazioni.
- **Aeromobili**: solo identificatori tecnici pubblici (hex ICAO, registrazione) e solo per voli commerciali/di Stato già pubblici; blocco degli aeromobili segnalati nei programmi di tutela della privacy dei proprietari e conservazione delle tracce limitata e aggregata.
- **Navi**: solo navi con IMO; nessuna imbarcazione da diporto. Le posizioni sono conservate a bassa risoluzione temporale e aggregate per analisi.
- **Nessun campo** per email, numeri di telefono, username o indirizzi IP di individui.

I dettagli sono in [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md).

---

## 11. Correlation / Hypothesis *(rinominato **Insight** il 2026-09-28 — vedi specifica Fase 1 §20)*

| Campo | Note |
|---|---|
| `hypothesis_id` | ULID |
| `rule_id`, `rule_version` | regola che l'ha generata |
| `members` | eventi/oggetti coinvolti con il ruolo di ciascuno |
| `score` | confidenza composta (§8.3) |
| `explanation` | frase generata dalla regola, es. *"Hotspot FIRMS a 1,8 km dalla linea 380 kV X, 6 h prima dell'indisponibilità ENTSO-E della linea"* |
| `status` | `open`, `confirmed_by_user`, `dismissed_by_user`, `expired` |
| `provenance` | riferimenti a tutti gli elementi di input |

Le ipotesi sono **suggerimenti**: non modificano mai oggetti, relazioni o eventi.
