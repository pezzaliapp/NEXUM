# NEXUM — Relazione di fattibilità

Data: 2026-09-28 · Autore: Alessandro Pezzali · Fase: ricerca e architettura


> **Revisione 2026-09-28 — Fase 1 v0.2 approvata.** L'esito di fattibilità è confermato. La Fase 1 approvata costruisce un Core domain-agnostic (NEXUM WORLD) verificato con tre prove distinte: D1 dati reali (USGS, OurAirports, Natural Earth, Copernicus EMS), D2 scala sintetica, D3 mondo non geografico sintetico.

---

## 1. Esito

**NEXUM è fattibile a costo operativo €0**, come applicazione local-first costruita su open data istituzionali e software open source, con tre condizioni:

1. il valore del progetto sta nel **modello dati e nella correlazione spiegabile**, non nel numero di layer: il perimetro iniziale va tenuto stretto;
2. diverse fonti popolari sono **non commerciali, a pagamento o vietano la redistribuzione**: vanno escluse o rese *opt-in*, e il codice deve applicare queste regole in modo automatico;
3. **OSIRIS non è una base di codice utilizzabile**: è utile solo come elenco di fonti da riverificare e come esempio di cosa evitare.

## 2. Stato della repository NEXUM

| Voce | Stato |
|---|---|
| Remote | `github.com/pezzaliapp/NEXUM` configurata come `origin`, vuota |
| Branch locale | `main`, nessun commit prima di questa fase |
| Contenuto | nessun file preesistente |

Nessun vincolo ereditato: il progetto parte da zero.

## 3. OSIRIS in sintesi

Dettagli in [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md).

- Licenza MIT: il riuso sarebbe legalmente possibile, ma **non è raccomandato**.
- Motivi: mascheramento dell'origine delle richieste in circa 30 connettori; moduli di profilazione di persone; componenti distribuiti solo in forma compilata; dati di terzi con licenza non commerciale inclusi nel repository; dipendenze da SaaS; marchio e identità grafica non riutilizzabili per scelta.
- Manca proprio ciò che serve a NEXUM: modello a oggetti, relazioni, timeline, provenienza, confidenza.

**Decisione**: nessun codice, dato o asset di OSIRIS in NEXUM.

## 4. Fonti

Dettagli in [NEXUM-SOURCES.md](NEXUM-SOURCES.md). Circa 110 valutazioni in 13 domini:

| Verdetto | Numero indicativo |
|---|---|
| ADOPT | ~47 |
| ADOPT WITH CONDITIONS | ~36 |
| OPT-IN (non commerciali o restrittive) | ~15 |
| REJECT | ~12 (+ le categorie vietate per principio) |

Copertura per dominio con fonti **ADOPT** a costo zero, senza chiave:

| Dominio | Copertura €0 | Note |
|---|---|---|
| Geografia | ottima | OSM (estratti), Natural Earth, GeoNames, Protomaps |
| Terremoti / tsunami | ottima | USGS, EMSC, INGV, NOAA |
| Vulcani | buona | USGS HANS; Smithsonian solo metadati |
| Incendi | ottima | FIRMS (chiave gratuita), EFFIS, GWIS |
| Meteorologia | buona in Europa e USA | MeteoAlarm, DWD, ECMWF open, NWS; Open-Meteo solo opt-in |
| Space weather | ottima | NOAA SWPC, NASA DONKI |
| Satelliti | buona | CelesTrak con regole d'uso rigide; Space-Track escluso |
| Aviazione | **limitata** | anagrafiche ottime (OurAirports); tracciamento live solo tramite fonti comunitarie, con mitigazioni privacy; OpenSky escluso come feed |
| Navigazione | **limitata** | ottima nel Nord Europa (Finlandia, Norvegia), storico USA; nessuna copertura globale live gratuita e con licenza chiara |
| Infrastrutture | buona | OSM; tracker GEM con download manuale; cavi sottomarini meno completi senza TeleGeography |
| Energia | buona | ENTSO-E (token), EIA |
| Cybersecurity | ottima | KEV, CVE, NVD, MITRE, GHSA, OSV |
| Economia | ottima | World Bank, Eurostat, ECB, OECD, ISTAT |
| Open government | buona | licenza per dataset da gestire |
| News | accettabile | solo metadati; GDELT per il volume |

**Punti deboli reali**: tracciamento globale live di aerei e navi. Con i vincoli di NEXUM non esiste una fonte mondiale, gratuita, con licenza chiara e compatibile con la privacy. È una **limitazione accettata**: NEXUM si concentra su eventi, infrastrutture e contesto, non sul tracciamento di mezzi.

## 5. Tecnologia a €0

| Esigenza | Soluzione | Costo |
|---|---|---|
| Archivio | SQLite (R*Tree, FTS5 integrati) | €0 |
| Analisi | DuckDB opzionale | €0 |
| Mappe offline | MapLibre + PMTiles da OSM | €0 (solo spazio disco) |
| Elaborazione | Python + librerie open source | €0 |
| Hosting | macchina dell'utente; snapshot statici opzionali | €0 |
| CI | GitHub Actions su repository pubblico | €0 |

Nessun componente richiede server, database gestiti o servizi a pagamento.

## 6. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Fonti che diventano a pagamento o restrittive | media | medio | registro con data di verifica, sospensione automatica, alternative per dominio |
| Contaminazione di licenza (NC, SA) nelle esportazioni | media | alto | licenza su ogni record, filtro automatico in esportazione |
| Deriva verso funzioni di sorveglianza | bassa | alto | funzioni vietate definite nei documenti di progetto |
| Complessità eccessiva | media | medio | roadmap per fasi con criteri di uscita, un solo processo, un solo archivio |
| Correlazioni spurie presentate come fatti | media | alto | ipotesi con confidenza e spiegazione, mai modifiche ai dati |
| Carico su fonti comunitarie | bassa | medio | Polite Scheduler, cache, preferenza per bulk |

## 7. Raccomandazione

Procedere con la **Fase 1** di [NEXUM-ROADMAP.md](NEXUM-ROADMAP.md) (fondamenta a riga di comando con 5 fonti senza autenticazione — *superato il 2026-09-28: 4 fonti ADOPT reali più due dataset sintetici di test, vedi [NEXUM-PHASE1-SPEC.md](NEXUM-PHASE1-SPEC.md)*) dopo:

1. revisione e approvazione di questi documenti;
2. chiusura delle decisioni aperte (linguaggio, regione di prova, politica di conservazione);
3. riverifica, alla data di inizio della Fase 1, delle licenze delle fonti iniziali (4 nella specifica approvata).
