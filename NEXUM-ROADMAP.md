# NEXUM — Roadmap

Principio: **ogni fase produce qualcosa di utilizzabile, verificato e documentato** prima di aprire la successiva. Nessuna fase introduce costi operativi. Le date non sono fissate: si avanza per criteri di uscita, non per calendario.


> **Revisione 2026-09-28.** Dopo l'approvazione della Product Vision e della specifica della Fase 1 v0.2, la roadmap è aggiornata nella sezione finale **"Roadmap aggiornata"**. Le sezioni originali restano per tracciabilità e sono marcate dove superate.

---

## Fase 0 — Ricerca e architettura *(completata il 2026-09-28)*

**Obiettivo**: decidere cosa costruire e con quali fonti, prima di scrivere codice.

- [x] Analisi della repository NEXUM (vuota, remota configurata, nessun commit)
- [x] Valutazione di OSIRIS → [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md)
- [x] Verifica di oltre 100 fonti in 13 domini → [NEXUM-SOURCES.md](NEXUM-SOURCES.md)
- [x] Confini legali ed etici → [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md)
- [x] Modello dati → [NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md)
- [x] Architettura e motore di correlazione → [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md)
- [x] Relazione di fattibilità → [NEXUM-FEASIBILITY.md](NEXUM-FEASIBILITY.md)
- [x] Revisione e approvazione dei documenti da parte dell'autore
- [x] Audit del codice OSIRIS → [NEXUM-OSIRIS-CODE-AUDIT.md](NEXUM-OSIRIS-CODE-AUDIT.md) (decisione: Opzione A — zero import)
- [x] Specifica della Fase 1 v0.2 approvata → [NEXUM-PHASE1-SPEC.md](NEXUM-PHASE1-SPEC.md)

**Criterio di uscita**: documenti approvati; scelte aperte (§ "Decisioni aperte") risolte.

---

## Fase 1 — Fondamenta (MVP tecnico, sola riga di comando) *(piano originale, superato — vedi "Roadmap aggiornata")*

**Obiettivo**: dimostrare la catena DATA → OBJECTS → EVENTS con provenienza, su fonti senza autenticazione.

- Source Registry dichiarativo + validazione (un connettore non parte senza voce valida)
- Polite Scheduler: rate limit per fonte, ETag/Last-Modified, backoff, User-Agent onesto, allowlist di host
- Raw Store content-addressed (zstd)
- Schema SQLite: Source, RawRecord, Object, Identifier, Claim, Relation, Event, Participation, Provenance
- Connettori iniziali:
  - riferimento: **Natural Earth** (paesi), **OurAirports** (aeroporti)
  - eventi: **USGS** (feed GeoJSON), **EMSC**, **INGV**
- Risoluzione entità dello stesso terremoto tra USGS / EMSC / INGV (tempo + distanza + magnitudo) con confidenza noisy-OR
- Relazioni calcolate `located_in` e `near`
- CLI: interrogazioni su finestra spazio-temporale; stampa della catena di provenienza

**Criteri di uscita**
- Ricostruzione completa del database dal Raw Store, con risultato identico
- Un terremoto riportato da 3 enti = **1 evento**, 3 claim, confidenza scomposta
- Test offline su payload registrati; test live separati e opzionali
- Nessuna chiave richiesta, costo €0

---

## Fase 2 — Timeline e interfaccia locale *(piano originale, superato — vedi "Roadmap aggiornata")*

**Obiettivo**: vedere e navigare ONE OBJECT / ONE TIMELINE.

- API locale su `127.0.0.1`
- UI: mappa MapLibre + basemap **PMTiles locale** (regione di prova), timeline unica con replay, scheda oggetto, pannello provenienza e attribuzioni
- Bitemporalità: vista "cosa sapevamo alle ore X"
- Politiche di conservazione del Raw Store

**Criteri di uscita**: funzionamento completo **offline** sui dati acquisiti; ogni elemento mostra fonte, licenza e confidenza.

---

## Fase 3 — Correlazione v1 *(piano originale, in parte anticipato in Fase 1)*

**Obiettivo**: prime ipotesi spiegabili tra domini.

- Primitive spaziali, temporali e di grafo
- Formato dichiarativo delle regole + template di spiegazione
- Fonti aggiuntive necessarie alle regole: **GDACS**, **NASA EONET**, **Copernicus EMS**, **MeteoAlarm**, **NOAA NTWC/PTWC**
- 3 regole iniziali, ad esempio:
  1. terremoto significativo → aeroporti/porti entro raggio → allarmi GDACS/tsunami collegati
  2. evento meteo severo → aree di allerta MeteoAlarm → infrastrutture nell'area
  3. stesso evento naturale riportato da più aggregatori (deduplica cross-fonte)
- Casi di test storici per ogni regola; conferma/scarto delle ipotesi da parte dell'utente

**Criteri di uscita**: ogni ipotesi ha spiegazione in una frase e catena di prove navigabile; esplosione combinatoria sotto controllo (limiti per regola).

---

## Fase 4 — Espansione domini (fonti ADOPT, senza dati personali)

Ordine suggerito, dal più semplice al più complesso:

| Blocco | Fonti |
|---|---|
| Incendi | NASA FIRMS (MAP_KEY personale), EFFIS |
| Vulcani | Smithsonian GVP (metadati), USGS HANS |
| Meteo | DWD, NWS, NHC, MET Norway |
| Space weather | NOAA SWPC, NASA DONKI |
| Cyber | CISA KEV, CVE `cvelistV5`, MITRE CWE/ATT&CK, EPSS, GitHub Advisory, CERT-EU |
| Energia e infrastrutture | OSM power/condotte/cavi (Geofabrik), ENTSO-E (token personale), EIA |
| Economia | World Bank, Eurostat, ECB, OECD (cache), ISTAT (rate limit rigido) |
| Italia | Protezione Civile (GitHub), dati.gov.it (licenza per dataset) |
| News | feed RSS scelti dall'utente (solo metadati), GDELT (file 15 min) |

**Criterio di uscita per ciascun blocco**: voce nel registro verificata alla data, attribuzioni visibili, test offline, almeno una regola di correlazione che usa il nuovo dominio.

---

## Fase 5 — Trasporti e spazio (con mitigazioni privacy)

- Satelliti: **CelesTrak** (regola 1 download / 2 h) + propagazione orbitale locale; SatNOGS
- Marittimo: **Digitraffic**, **Kystverket** (stream aperto), storico **MarineCadastre**; solo navi con IMO, tracce aggregate
- Aviazione: **adsb.lol** (preferibilmente storico giornaliero) con elenco di soppressione, esclusione aviazione privata, nessun collegamento a proprietari
- GTFS dal catalogo Mobility Database (licenza per feed)

**Criterio di uscita**: revisione privacy documentata; conservazione e aggregazione verificate da test.

---

## Fase 6 — Esportazione e condivisione a €0

- Esportazione GeoJSON / Parquet con **filtro automatico per licenza** (esclude OPT-IN, NC, share-alike quando incompatibili) e file di attribuzioni generato
- Snapshot statico opzionale (HTML + dati) pubblicabile su hosting statico gratuito, solo dati redistribuibili
- Connettori **OPT-IN** (Open-Meteo, Global Fishing Watch, Cloudflare Radar, RIPEstat, ecc.) con schermata di consenso che mostra le condizioni

---

## Fase 7 — Consolidamento

- Verifica periodica automatizzata dei link a licenze/termini (segnala cambiamenti, non decide)
- Packaging (installazione in un comando; container opzionale)
- Documentazione utente e per autori di connettori/regole
- Valutazione di tecniche statistiche aggiuntive nel motore di correlazione, **solo** se spiegabili

---

## Decisioni aperte (da chiudere prima della Fase 1) *(chiuse il 2026-09-28: Python per il Core; UI candidata TypeScript + MapLibre, decisione in Fase 2; Italia come area di validazione con architettura globale; conservazione dei raw PoC a tempo indeterminato; contributi esterni: da definire)*

1. **Linguaggio**: Python proposto (ecosistema geo/feed maturo). Alternativa: TypeScript end-to-end.
2. **Framework UI**: nessun framework pesante vs. libreria leggera; da decidere in Fase 2.
3. **Regione di prova per la basemap offline** (proposta: Italia).
4. **Politica di conservazione** di default del Raw Store (proposta: 30 giorni per eventi, 7 giorni per posizioni di mezzi, riferimenti a tempo indeterminato).
5. **Contributi esterni**: se e come accettarli, dato il vincolo di autore unico.

## Rischi principali

| Rischio | Mitigazione |
|---|---|
| Cambiamento di licenza/termini di una fonte | Source Registry con data di verifica; sospensione automatica; Provenance per rimuovere i dati derivati |
| Fonti comunitarie gestite da una persona (CelesTrak, GDELT, adsb.lol) | Nessuna dipendenza unica: ogni dominio ha almeno un'alternativa o un fallback storico |
| Crescita del volume dati su un solo PC | Conservazione configurabile, aggregazione, esportazioni Parquet |
| Scope creep verso funzioni di sorveglianza | Elenco di funzioni vietate in [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) §7, non negoziabile |
| Correlazioni spurie | Regole con test storici, confidenza esplicita, ipotesi mai presentate come fatti |

## Roadmap aggiornata (2026-09-28)

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Ricerca, architettura, fonti, audit OSIRIS, specifica Fase 1 | completata |
| 1 | **NEXUM Core domain-agnostic**: NEXUM WORLD (objects, relations, events, evidence, provenance, confidence, timeline, insight), motore di correlazione a pattern, contratto di query multi-vista (WORLD/OBJECT MODE, budget, livelli di dettaglio, traversal), tre prove distinte: **D1** dati reali (USGS, OurAirports, Natural Earth, Copernicus EMS — caso Myanmar), **D2** scala sintetica, **D3** mondo non geografico sintetico | in corso |
| 2 | **Workspace multi-vista** (ONE WORLD — MULTIPLE VIEWS): API HTTP locale, MAP (candidato TypeScript + MapLibre, basemap PMTiles locale), GRAPH, TIMELINE, SEARCH, OBJECT/EVENT VIEW, RELATIONS, INSIGHTS, SOURCES, FILTERS; persistenza dell'investigation trail | pianificata |
| 3 | Estensione delle regole di correlazione e taratura su casi reali | pianificata |
| 4 | Espansione dei domini **come nuovi tipi e regole nello stesso mondo**: ogni blocco deve portare almeno una regola che lo collega ad altri domini | pianificata |
| 5 | Trasporti e spazio con mitigazioni privacy | pianificata |
| 6 | Esportazione e condivisione a €0; eventuale pubblicazione su **nexum.pezzaliapp.com** | pianificata |
| 7 | Consolidamento | pianificata |
