# NEXUM — Fase 3: studio di fattibilità (pubblicazione online a costo €0)

**Data:** 2026-09-29 · **Autore:** Alessandro Pezzali · **Stato:** direzione generale approvata; architettura **B** scelta. Decisioni E1, E2, E4–E9 **APPROVATE** ed E3 **SOSPESA** il 2026-09-29 (vedi `NEXUM-PHASE3-SPEC.md` §10–§11). Documento non versionato; implementazione non avviata.
**Base:** commit `e603d3f` (Fase 2 approvata e pubblicata su `origin/main`).
**Obiettivo:** NEXUM su `https://nexum.pezzaliapp.com`, usabile da desktop, tablet, Samsung Fold e iPhone, **senza il Mac acceso**, con costo **€0 garantibile** (non "basso").

Nessun codice applicativo è stato scritto; nessuna risorsa Cloudflare o GitHub creata; nessun dominio configurato. Le misure sono state prese con script temporanei fuori dal repository sul mondo **D1** reale (`data/d1/nexum.db`), usando il Core Python reale.

> **Nota di nomenclatura.** "D1" indica due cose diverse. In questo documento **mondo D1** è il dataset reale di NEXUM; **Cloudflare D1** è il database serverless di Cloudflare.

---

## 1. Audit della Fase 2: misure reali sul mondo D1

### 1.1 Dimensioni del mondo

| Voce | Valore misurato |
|---|---|
| File SQLite `nexum.db` | **350,9 MB** (350.892.032 byte) |
| Oggetti / eventi / relazioni / insight attivi | 86.393 / 6.563 / 86.472 / 242 |
| Evidenze / claim / record / archi di topologia | 266.726 / 550.328 / 92.956 / 92.650 |
| Identificatori / alias / righe `agg` / change log | 243.604 / 637 / 44.051 / 265.940 |
| Elementi con geometria | 92.956 |
| Righe `agg` per livello (−1 / 2 / 4 / 6 / 8) | 521 / 2.646 / 5.872 / 10.921 / 24.091 |
| Archivio raw | 22 payload, **5,13 MB gzip**; record più grande 12,1 MB non compresso |
| Build del mondo D1 da zero (Mac M5) | fetch 152 s (limitato dalla cortesia verso le fonti) + elaborazione 30,1 s (`data/reports/build.json`) |

Gli altri mondi non vanno online: D2 (4,5 GB) e D3s (1,1 GB) sono sintetici di scala; `ubench` è il mondo di benchmark; `mixed` contiene fixture D3.

### 1.2 Payload della Fase 2 (risposte API reali, byte JSON / gzip)

| Richiesta | JSON | gzip |
|---|---|---|
| status + facets | 1.312 | 492 |
| types | 1.028 | 482 |
| sources | 2.490 | 815 |
| mappa mondo (z4, z6, z8; budget 5.000) | 290.754 | **22.780** |
| mappa locale z11 Mandalay / Europa | 4.623 / 88.838 | 1.538 / 19.324 |
| timeline globale | 2.872 | 665 |
| insights (50) | 35.439 | 5.772 |
| search "Mandalay" | 1.359 | 630 |
| context: sisma / Myanmar / VYMD / USA | 22.257 / 52.077 / 11.289 / 179.219 | 4.704 / 14.566 / 3.197 / 59.277 |
| context insight R2 / relazione | 6.719 / 3.309 | 2.085 / 1.202 |
| explain R2 / relazione | 8.089 / 4.292 | 2.124 / 1.334 |
| neighborhood Myanmar p1 / USA p2 (2.000) | 10.862 / 88.496 | 2.423 / 18.697 |
| provenance R2 · entity_timeline Myanmar · evidence sisma | 4.839 · 6.446 · 1.286 | 1.599 · 1.733 · 732 |

**Carico iniziale di WORLD MODE**, somma delle voci misurate (gzip):
- JavaScript iniziale: 408 kB (U8);
- basemap (stile + GeoJSON "raw-polygons"): 430 kB;
- mappa del mondo: 22,8 kB;
- insights: 5,8 kB;
- status, types e sources: 1,8 kB;
- timeline: 0,7 kB.

In totale circa **869 kB gzip**. Il browser **non** scarica il mondo: scarica circa lo 0,25 % dei 351 MB.

### 1.3 Costo per operazione nel Core (proxy su `sqlite3`: istruzioni SQL eseguite per chiamata)

| Operazione | Istruzioni SQL (media / massimo) | Nota |
|---|---|---|
| `context` aeroporto | 48 / 70 | caso più frequente |
| `context` evento | 52 / 62 | |
| `context` paese | fino a **3.823** | hub (USA) |
| `search` | fino a 204 | |
| `path` | fino a 471 | |
| `timeline_neighbors` | fino a 567 | |

Il Core è Python con molte query piccole e logica fra una query e l'altra (ranking, raggruppamenti, `explain` con ricalcolo). Questo modello funziona bene su un SQLite locale, ma diventa costoso quando ogni query è una chiamata di rete o viene contata a quota.

### 1.4 Classificazione delle operazioni della UI

| Classe | Operazioni | Dipendenza dall'input | Precalcolabile? |
|---|---|---|---|
| **Centrate su un'entità** | `context`, `explain`, `provenance_chain`, `evidence_of`, `entity_timeline`, `timeline_neighbors`, `timeline_step`, `locate`, pagine di `related_events` / `related_objects` | solo l'ID stabile (con i budget fissi della UI) | **sì, esattamente**: output del Core Python |
| **Dipendenti dallo scope** | `project_map` (viewport, zoom, filtri), `project_timeline` (finestra, filtri), `facets` | viewport, finestra e filtri continui | no come risposte; **sì come indici** (`agg`, punti tassellati) più una proiezione lato client |
| **Topologia** | `neighborhood`, `expand` (paginato), `path` | radice, profondità, budget, filtri | indici di adiacenza più una traversata lato client |
| **Testo libero** | `search` (FTS5, bm25 pesato 10/4/6/1, unicode61 senza diacritici) | stringa arbitraria | indice FTS5 esportato, interrogato nel browser |
| **Globali** | status, types, sources, insights, facets globali | nessuna | sì, file statici |
| **Raw** | estrazione del record grezzo (A10) | locator dell'evidenza | sì, estratti per locator |
| **Scrittura / stato** | trail, `changes_since` live | utente / tempo | trail nel browser; aggiornamenti a snapshot |

### 1.5 Misure dello snapshot (per l'architettura B)

**Bundle per entità.**
- **Contenuto:** tutte le risposte centrate sull'entità che la UI della Fase 2 chiede, con i budget della UI, generate dal **Core Python reale**:
  - `context` (25);
  - `provenance`, `evidence` (10);
  - timeline, `locate`, neighbors (300) e step;
  - `explain`;
  - fino a 4 pagine "mostra altro".
- **Campionamento:** stratificato, 250 entità per classe (tutte per paesi e insight).

| Classe | N | media JSON | media gzip | massimo JSON | totale JSON | totale gzip | build per entità |
|---|---|---|---|---|---|---|---|
| paese | 242 | 57,9 kB | 11,6 kB | 371 kB | 13,7 MB | 2,7 MB | 23,7 ms |
| aeroporto | 86.151 | 8,9 kB | 2,2 kB | 9,6 kB | 749,5 MB | 181,3 MB | 6,9 ms |
| evento | 6.563 | 81,0 kB | 12,6 kB | 181 kB | 519,2 MB | 80,5 MB | 7,9 ms |
| insight | 242 | 18,7 kB | 3,2 kB | 76 kB | 4,4 MB | 0,8 MB | 1,4 ms |
| relazione | 86.472 | 9,5 kB | 1,7 kB | 9,9 kB | 805,5 MB | 147,6 MB | 0,6 ms |
| **totale** | **179.670** | | | | **≈ 2,09 GB** | **≈ 413 MB** | **≈ 12 min** su un solo core (M5) |

Questo è il **limite superiore ingenuo**, senza deduplicazione: una relazione ripete in gran parte il `context` delle due estremità, e gli aeroporti ripetono la lista "vicini". La riduzione con deduplicazione non è stimata qui. Si misura nel primo slice di implementazione (§8 della SPEC).

**Indici compatti per le operazioni dipendenti dallo scope** (JSON / gzip):

| Indice | Righe | JSON | gzip |
|---|---|---|---|
| `agg` (tutti i livelli) | 44.051 | 3,31 MB | **0,20 MB** |
| punti (ID, tipo, lon/lat, confidenza, fonte, banda, t) | 93.182 | 10,19 MB | 2,92 MB |
| riferimenti (ID, tipo, etichetta) | 93.198 | 7,33 MB | 2,55 MB |
| topologia (archi) | 92.650 | 11,09 MB | 3,31 MB |
| identificatori | 243.604 | 12,27 MB | 3,02 MB |
| **indice FTS5 reale** (tabelle ombra copiate più `rid_map`, dopo `optimize`) | 93.198 documenti | 12,32 MB | **4,70 MB** |

Una query `mandalay*` su quel file SQLite richiede 0,1 ms.

**Runtime nel browser misurati** (trasferimento gzip):

| Runtime | Dimensione | Esito |
|---|---|---|
| `@sqlite.org/sqlite-wasm` 3.53.4 (Apache-2.0, ammessa dalla policy) | 398 kB | candidato |
| `wa-sqlite` su npm | 274 kB | **licenza "Proprietary"** sul registro, quindi **esclusa** dalla policy |
| Pyodide (`pyodide.asm.wasm` 2,67 MB + stdlib 2,38 MB + JS 0,23 MB) | ≈ **5,3 MB** prima ancora dei dati | scartato: viola lo spirito di U8 e non risolve l'accesso ai dati |

### 1.6 Range request sugli host statici (misurate il 2026-09-29, `curl -r`)

| Host | Risposta a `Range: bytes=100-199` |
|---|---|
| GitHub Pages (`pages.github.com`, file PNG di 156.915 byte) | **206 Partial Content**, `Accept-Ranges: bytes` |
| Cloudflare Pages (`hello.pages.dev`, JS di 84.723 byte e JPG di 164.190 byte, tre tentativi) | **200** con il corpo intero (il Range è ignorato) |

Cloudflare Workers Static Assets non è stato provato: nessuna risorsa è stata creata. Non si presume nulla, e il progetto non dipende dai Range.

**Conseguenza:** un "SQLite remoto via HTTP Range" non è praticabile su Cloudflare Pages. Lo snapshot va quindi **suddiviso in file** (shard), non affettato a byte.

---

## 2. Obiettivo online (cosa significa "NEXUM online")

Tutto ciò che la Fase 2 offre deve funzionare anche online, **incluso il telefono** (con i layout e i budget di §L della Fase 2):
- WORLD MODE e OBJECT MODE;
- Map, Graph, Timeline, Search;
- selezione unica e pivot continuo;
- WHY con ricalcolo, Evidence e Sources fino al record grezzo;
- deep link per ID stabile;
- trail;
- insight;
- provenienza e confidenza sempre visibili.

Non è ammesso ridurre NEXUM a una demo.

---

## 3. Limiti ufficiali verificati (data di verifica: **2026-09-29**)

Fonti: documentazione ufficiale di Cloudflare (Workers limits, Static Assets billing, D1 limits e pricing, Pages limits, R2 pricing) e di GitHub (Actions limits e billing, Pages limits, "Disabling and enabling a workflow"), consultate in questa sessione.

### 3.1 Cloudflare Workers Free

- 100.000 richieste al giorno.
- 10 ms di CPU per invocazione.
- 128 MB di memoria.
- 50 subrequest.
- Script fino a 3 MB compresso.
- Oltre la quota le richieste **falliscono con un errore**: nessun addebito, perché il piano Free non ha un metodo di pagamento.

### 3.2 Static Assets (Workers) e Cloudflare Pages Free

- Le richieste a file statici sono **gratuite e illimitate** e non consumano la quota Workers, se non si usa `run_worker_first`.
- 20.000 file per versione, 25 MiB per file.
- Pages: 500 build al mese, banda illimitata, domini personalizzati inclusi.
- Nessuna carta richiesta.

### 3.3 Cloudflare D1 Free

- 5 milioni di righe lette al giorno.
- 100.000 righe scritte al giorno.
- 500 MB per database, 5 GB in totale, 10 database.
- **50 query per invocazione del Worker.**
- Oltre la quota le query falliscono fino alle 00:00 UTC: nessun addebito.

### 3.4 Cloudflare R2

- Piano gratuito: 10 GB al mese, 1 milione di operazioni di classe A, 10 milioni di classe B, egress gratuito.
- **L'attivazione richiede un metodo di pagamento.** È quindi **esclusa** dal vincolo "nessuna carta".

### 3.5 GitHub Actions (repository pubblico)

- I runner standard sono **gratuiti e senza limite di minuti** per i repository pubblici.
- Un job dura al massimo 6 ore; un workflow al massimo 35 giorni.
- 20 job concorrenti sul piano Free.
- Il periodo di conservazione degli artifact è configurabile.
- **"In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."**
- Se il repository diventasse privato: 2.000 minuti al mese inclusi; senza carta l'esecuzione si **ferma**, non viene addebitata.

### 3.6 GitHub Pages

- Sito pubblicato ≤ 1 GB.
- Banda con limite soft di 100 GB al mese.
- Build con limite soft di 10 all'ora.
- Nessun addebito: al superamento GitHub contatta il proprietario.
- Non destinato a SaaS commerciali; NEXUM è un progetto open source non commerciale, quindi è compatibile.
- **Supporta le range request (misurato).**

---

## 4. Architetture studiate

Il criterio di priorità è quello dell'autore: **€0 garantibile > esperienza NEXUM preservata > affidabilità > semplicità > prestazioni.**

### A — Static Assets/Pages + Worker + Cloudflare D1

La UI è servita come file statici. Un Worker espone la stessa API della Fase 2 su Cloudflare D1, dove viene caricata la copia SQLite del mondo.

| Aspetto | Valutazione con i dati misurati |
|---|---|
| Spazio | 351 MB < 500 MB per database: **ci sta, ma con solo il 30 % di margine**. Con la crescita delle fonti dinamiche il limite si avvicina; lo sharding su più database complica ogni query |
| Query per invocazione | `context` di un aeroporto usa 48 query in media e 70 al massimo; un paese fino a 3.823; `path` fino a 471. **Il limite di 50 per invocazione è superato dalle operazioni più comuni** |
| CPU | 10 ms: il Core Python non gira nei Worker così com'è; `explain` con ricalcolo e il ranking vanno riscritti |
| Righe al giorno | 5 milioni al giorno; una sessione tipica legge decine di migliaia di righe. Il tetto è **qualche centinaio di sessioni al giorno**, poi errori fino a mezzanotte UTC |
| Richieste | 100.000 invocazioni al giorno; ogni pan, zoom o pivot è una chiamata |
| Oltre la quota | errori, non addebiti: **€0 sì**, affidabilità no |
| Carta | no |
| Semantica | **riscrittura del Core** in TypeScript/SQL per ridurre le query per invocazione: alto rischio di divergenza da explain, WHY e confidence |

**Verdetto:** il costo è €0 garantito, ma affidabilità e fedeltà sono scarse. **Scartata come architettura primaria.**

### B — Snapshot statico precalcolato e indicizzato (+ GitHub Actions)

GitHub Actions ricostruisce il mondo con il **Core Python reale** (SQLite resta il motore autorevole), poi produce tre tipi di artefatti statici:

| Artefatto | Contenuto |
|---|---|
| **Bundle per entità** | risposte esatte del Core, raggruppate in shard |
| **Indici compatti** | `agg`, punti tassellati, topologia a shard, riferimenti |
| **Indice FTS5** | lo stesso file SQLite dell'indice, interrogato nel browser con `sqlite-wasm` |

La UI della Fase 2 legge questi file invece dell'API. Le operazioni che dipendono dallo scope (mappa, timeline, facets, grafo) sono ricalcolate nel browser da un **read model TypeScript**, verificato con **test di parità** contro il Core Python a ogni build.

| Aspetto | Valutazione |
|---|---|
| Spazio | circa 413 MB gzip di limite superiore ingenuo più circa 17 MB di indici. Cloudflare non documenta limiti di spazio totale sugli static assets, ma limita a 20.000 file × 25 MiB; GitHub Pages ammette ≤ 1 GB. **Ci sta su entrambi** |
| Richieste | file statici: **gratuiti e illimitati** su Cloudflare; su GitHub Pages valgono 100 GB al mese soft |
| CPU server | nessuna: non c'è un Worker. Il browser fa proiezioni su indici piccoli |
| Aggiornamento | build in Actions (gratuito, repository pubblico) e deploy dello snapshot. La latenza è di ore, non di secondi |
| Oltre la quota | non esiste una quota a consumo sugli statici Cloudflare |
| Carta | no |
| Semantica | le risposte centrate sull'entità sono **byte per byte quelle del Core Python** (WHY, explain, provenance, evidence). Solo mappa, timeline, facets, grafo e ricerca passano da codice client, sotto test di parità |

**Verdetto:** la migliore per €0 garantibile e per fedeltà. Il rischio principale è il read model TypeScript, mitigato dalla parità in CI.

### C — Worker + storage gratuito alternativo (R2 / KV) + GitHub Actions

- **R2:** l'attivazione richiede una carta. **Esclusa** dal vincolo.
- **Workers KV Free:** 100.000 letture al giorno, 1.000 scritture al giorno. Aggiornare migliaia di chiavi a ogni build supera le 1.000 scritture al giorno, e le letture richiedono il Worker, quindi valgono le 100.000 invocazioni al giorno.

**Verdetto:** non aggiunge nulla a B e introduce quote che producono errori. **Scartata.**

### D — Varianti valutate

| Variante | Esito |
|---|---|
| **D1: SQLite intero via HTTP Range** (VFS nel browser) | Cloudflare Pages ignora `Range` (misurato); GitHub Pages lo supporta. Resta però il problema delle 48–3.823 query per operazione, ciascuna con letture di pagine B-tree in rete: molti round trip su mobile. Inoltre la logica Python va comunque portata. **Scartata come principale** |
| **D2: Pyodide** (Core Python nel browser) | circa 5,3 MB di runtime misurati prima dei dati, e non risolve l'accesso a un database di 351 MB. **Scartata** |
| **D3: B su GitHub Pages** (host alternativo) | stessi artefatti di B, con Range disponibile, 1 GB e 100 GB al mese soft. **Adottata come mirror e rollback**, non come host primario (vedi §6) |

---

## 5. Modello dei costi

| Voce | A | B (raccomandata) | C |
|---|---|---|---|
| Hosting UI | €0 (static assets) | €0 | €0 |
| Calcolo server | €0 fino a 100.000 invocazioni al giorno, poi **errori** | **nessuno** | €0 fino alla quota, poi errori |
| Database | €0 fino a 5 milioni di righe al giorno, poi **errori** | nessuno | R2: **carta obbligatoria** |
| Banda | €0 | €0 (Cloudflare illimitata) | €0 |
| Build e aggiornamenti | Actions €0 (repository pubblico) | Actions €0 (repository pubblico) | idem |
| Dominio `nexum.pezzaliapp.com` | sottodominio di un dominio già posseduto: €0 | €0 | €0 |
| **Metodo di pagamento** | no | **no** | **sì** (R2) |
| **Possibilità di addebito automatico** | nessuna (piano Free) | **nessuna** | esiste una volta registrata la carta |
| **Rischio economico reale** | €0 | **€0** | > €0 possibile |

In B, il costo €0 è **strutturale**:
- non esistono risorse a consumo;
- nessun account ha un metodo di pagamento;
- oltre qualunque soglia il comportamento peggiore è un rifiuto, mai un addebito.

Condizioni da mantenere:
1. repository **pubblico**, altrimenti i minuti di Actions sono limitati; senza carta la build si ferma, ma non si paga;
2. nessun piano a pagamento attivato su Cloudflare;
3. nessuna risorsa che richieda una carta.

---

## 6. Host primario per B: Cloudflare o GitHub Pages?

| Criterio | Cloudflare (Static Assets / Pages) | GitHub Pages |
|---|---|---|
| Banda | illimitata | 100 GB al mese soft |
| File | 20.000 per versione, 25 MiB | sito ≤ 1 GB |
| Range | no (Pages, misurato) | sì |
| Rollback | versioni e deployment precedenti riattivabili | ridistribuzione di un artifact precedente |
| Account | serve un account Cloudflare gratuito (senza carta) e un token API come secret di Actions | nessun account aggiuntivo |
| Dominio | dominio personalizzato gratuito (per Workers la zona deve stare su Cloudflare; per Pages basta un CNAME esterno sul sottodominio) | CNAME |

**Decisione E2 (approvata):** **Cloudflare Pages** come host primario, per la banda illimitata; GitHub Pages come **mirror e rollback** con lo stesso artefatto.

**Vincoli sul dominio (E3, sospesa).** Il DNS di `pezzaliapp.com` è su **AWS Route 53** (§11.3). Da qui tre conseguenze:
- Workers Custom Domains richiede una zona attiva su Cloudflare; Pages accetta un CNAME esterno sul sottodominio.
- Un CNAME su Route 53 ha però un costo per query, quindi non è €0 garantibile.
- La delega del solo sottodominio a Cloudflare è riservata al piano Enterprise.

La via €0 è spostare i nameserver della zona su Cloudflare Free. Il piano, verificabile e reversibile, è nella SPEC §11 e attende l'approvazione dell'autore.

---

## 7. Cosa mantiene e cosa perde ciascuna soluzione

| Funzione della Fase 2 | A | B | C |
|---|---|---|---|
| WORLD MODE e navigazione della mappa (viewport, LOD, budget) | sì, se la riscrittura riesce | **sì**: `agg` (0,2 MB) e punti tassellati, proiezione nel browser | sì |
| OBJECT MODE, selezione, pivot, ID stabili | sì | **sì** | sì |
| Relazioni e "mostra altro" (paginazione) | sì | **sì**, pagine precalcolate (4 × 50) oltre le 25 iniziali; per gli hub, pagine ulteriori con `expand` sulla topologia | sì |
| Traversata del grafo (profondità, budget, filtri, `path`) | sì, con quota di query | **sì**: topologia a shard; profondità 1–2 per richiesta, `path` bidirezionale con tetto di shard | sì |
| Timeline (finestra, bucket, passo, vicini) | sì | **sì**: `agg` per periodi più neighbors e step precalcolati | sì |
| Search (FTS5, stessi pesi) | sì | **sì**: stesso indice FTS5 in `sqlite-wasm`, caricato alla prima ricerca (4,7 MB gzip) | sì |
| Insight e WHY con ricalcolo | riscrittura | **sì, byte per byte** (output del Core) | sì |
| Evidence, Sources, record grezzo | sì | **sì**: estratti per locator precalcolati; attribuzioni visibili | sì |
| Deep link | sì | **sì**: `?focus=<id>`, risolto nello shard | sì |
| Trail | da spostare nel browser | **browser** (IndexedDB) con export/import JSON | idem |
| Aggiornamento live (`changes_since`, U10) | quasi live | **per snapshot** (ore) | quasi live |
| Cancellazione e deadline lato server (A5) | parziali | **non applicabili**: nessun server. La cancellazione diventa `AbortController` e abbandono dei calcoli nel browser | parziali |
| Mondo D2 di scala | no | no (non è un obiettivo online) | no |

**Cosa si perde davvero con B, dichiarato:**
1. i dati sono aggiornati **a ogni snapshot**, non in tempo reale;
2. la trail non è condivisa fra dispositivi, salvo export/import;
3. i benchmark API A1–A10 non hanno più un servizio da misurare e sono sostituiti da criteri online (O-criteri nella SPEC);
4. la prima ricerca su telefono scarica 4,7 MB.

---

## 8. Strategia di aggiornamento dei dati

Pipeline in GitHub Actions: `fetch` → `ingest` → `normalize` → `correlate` → `snapshot` → `parity` → `publish`. Tutto con il Core e i connettori esistenti, rispettando i vincoli `[politeness]` già presenti in `sources/*.toml`.

| Classe | Fonti (intervallo minimo dichiarato) | Cadenza proposta |
|---|---|---|
| **Quasi statica** | Natural Earth (7 giorni) | settimanale |
| **Periodica** | OurAirports (1 giorno) | giornaliera |
| **Dinamica** | USGS (60 s), CEMS (600 s) | **ogni 6 ore** (4 build al giorno) |

- Le 4 build al giorno sono ben dentro i limiti gratuiti; l'intervallo resta configurabile.
- Tutte e quattro le fonti dichiarano `redistribution = allowed` o `allowed_with_attribution` (verificato il 2026-09-28). La pubblicazione online è una redistribuzione, quindi le attribuzioni restano visibili in Sources e nel footer.
- **Stato fra build:** il database precedente viene ripristinato da un artifact di Actions per le richieste condizionali (ETag, If-Modified-Since) e per il change log. Se manca, si ricostruisce da zero: gli ID sono deterministici e la build completa richiede circa 3 minuti di fetch cortese più 30 s.
- **Nessun commit automatico su `main`:** la pipeline pubblica artifact, non commit, così l'autorialità resta dell'autore.
- **Regola dei 60 giorni:** senza attività sul repository i workflow schedulati si disattivano.
  - **Effetto:** il sito resta online con l'ultimo snapshot. La UI mostra sempre l'età dello snapshot e un avviso oltre 48 ore.
  - **Rimedio:** qualunque attività dell'autore sul repository, o la riattivazione manuale del workflow.

---

## 9. Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Divergenza del read model TypeScript dal Core Python | media | alto | parità bloccante in CI su query campionate per ogni operazione e snapshot; niente pubblicazione se la parità fallisce |
| Crescita dello snapshot oltre i limiti di file | bassa | medio | deduplicazione; shard dimensionati; soglie di guardia nella build |
| Ricerca su mobile lenta alla prima volta (4,7 MB) | media | medio | caricamento dopo la prima interazione; cache HTTP immutabile per versione; risultati delle etichette come anticipo, da decidere in E4 |
| Account Cloudflare con piano cambiato per errore | bassa | alto (costo) | nessuna carta registrata: un piano a pagamento non si può attivare |
| Workflow disattivato dopo 60 giorni | media | basso | età dello snapshot visibile; il sito continua a funzionare |
| Cambi di termini delle fonti | bassa | medio | `verified_at` e verdetti già nei manifest; la build fallisce se una fonte viene declassata |
| Cambi dei limiti gratuiti dei provider | bassa | medio | stesso artefatto su due host (Cloudflare e GitHub Pages): si commuta solo il DNS |
| P25 non eseguibile su un clone pulito o in CI | certo (oggi) | medio | correzione portabile specificata (SPEC §9) |

---

## 10. Raccomandazione

**Architettura B (snapshot statico ibrido)**, così composta:
- risposte esatte del Core Python per tutto ciò che è centrato sulle entità;
- indici compatti più un read model TypeScript, sotto parità, per ciò che dipende dallo scope;
- lo stesso FTS5 via `sqlite-wasm` per la ricerca;
- Cloudflare Static Assets o Pages come host primario, GitHub Pages come mirror e rollback;
- aggiornamenti da GitHub Actions;
- trail in IndexedDB.

È l'unica architettura in cui €0 è **strutturale** e in cui WHY, explain ed evidence restano identici al Core. Il dettaglio di implementazione e i criteri di accettazione sono in `NEXUM-PHASE3-SPEC.md`.

---

## 11. Verifiche successive al design gate (2026-09-29)

Tutte le prove sono state eseguite con file temporanei **fuori dal repository**. Nessuna risorsa è stata creata e nessuna configurazione modificata.

### 11.1 `@sqlite.org/sqlite-wasm` 3.53.4 (E4)

- **Pacchetto e licenza:**
  - mantenuto ufficialmente dal progetto SQLite; wrapper **Apache-2.0**, ammessa dalla policy runtime di NEXUM;
  - SQLite è di pubblico dominio;
  - il pacchetto npm **non contiene un file LICENSE**: la distribuzione dovrà includere il testo Apache-2.0 nelle note di terze parti;
  - Vite richiede `optimizeDeps.exclude` per questo pacchetto.
- **FTS5:** `PRAGMA compile_options` della build distribuita contiene `ENABLE_FTS5` (e anche `ENABLE_RTREE`).
- **Parità:** l'indice FTS5 reale del mondo D1 (tabelle ombra più `rid_map`, 12.922.880 byte), interrogato con la query SQL del Core (`bm25(search_fts, 10, 4, 6, 1)`), restituisce **gli stessi ID e gli stessi punteggi** di SQLite 3.45.3 in Python su tutti i motori provati.
- **Dimensioni compresse:**

  | Componente | gzip -9 | brotli 11 |
  |---|---|---|
  | `sqlite3.wasm` | 402.035 byte | 348.812 byte |
  | codice JS di collegamento, minificato | 63.660 byte | — |
  | indice | 4.841.083 byte | 3.771.742 byte |

  Il file per OPFS (`sqlite3-opfs-async-proxy.js`) non serve.

**Compatibilità provata:** caricamento in memoria con `sqlite3_deserialize`, sola lettura, `crossOriginIsolated = false`.

| Ambiente | Esito | Inizializzazione | Scaricamento e decompressione | Query |
|---|---|---|---|---|
| Chrome 154 installato, desktop | OK | 28 ms | 27 ms | 15–28 ms |
| Chrome 154 con emulazione Android (Pixel 7) | OK | 27 ms | 26 ms | 15–28 ms |
| Safari 26.6.2 su macOS (reale) | OK | 45 ms | 22 ms | 18–28 ms |
| Safari su iOS 17.5 (simulatore iPhone 15) | OK | 120 ms | 55 ms | 24–85 ms |
| Safari su iOS 26.5 (simulatore) | OK | 88 ms | 55 ms | 21–51 ms |

Limiti di queste prove:
- **Android reale e Samsung Internet non sono stati provati.** Serve una prova su un dispositivo, per esempio il Fold, prima della validazione.
- I tempi dei simulatori usano la CPU del Mac; i file erano serviti in locale.

### 11.2 IndexedDB, OPFS e persistenza (E6)

- **IndexedDB:** apertura e scrittura riuscite in tutti gli ambienti della §11.1; `navigator.storage.persist` è presente ovunque.
- **OPFS non è usato.** Se servisse in futuro:
  - la variante `opfs` richiede COOP/COEP (impossibile sul mirror GitHub Pages, che non consente header personalizzati) e Safari ≥ 17;
  - la variante `opfs-sahpool` non richiede COOP/COEP, ma non ammette connessioni simultanee.
- **Safari (policy WebKit):**
  - IndexedDB, localStorage e cache vengono cancellati *"after seven days of Safari use without user interaction on the site"*;
  - le web app aggiunte alla schermata Home hanno un contatore proprio e *"We do not expect the first-party in such a web application to have its website data deleted"*;
  - `storage.persist()` esiste da Safari 17, con concessione euristica (tipicamente per le web app installate).
  
  Da qui la decisione E6: manifest installabile, `persist()` ed export della trail.

### 11.3 Dominio `pezzaliapp.com` (E3, sospesa)

**Stato osservato:**
- registrar Amazon;
- DNS su **Route 53**, senza DNSSEC;
- apex e `www` sono Alias verso **CloudFront**, con origine S3 e certificato ACM (SAN apex e `www`, valido fino al 2027-01-23);
- nessun MX, TXT o CAA;
- `nexum` non esiste.

Dettaglio completo nella SPEC §11.1.

**Costi, dalla documentazione ufficiale:**

| Voce | Costo |
|---|---|
| Route 53, query standard (i CNAME rientrano qui) | 0,40 $ per milione |
| Route 53, query Alias verso CloudFront/S3 | gratuite |
| Route 53, hosted zone | 0,50 $ al mese (costo già esistente) |
| Cloudflare DNS: *"For customers on Free, Pro, or Business plans, Cloudflare does not charge for DNS queries."* | €0 |

**Cloudflare, dalla documentazione ufficiale:**
- **Subdomain setup:** solo **Enterprise**.
- **Pages:** un sottodominio con DNS esterno è ammesso tramite CNAME.
- **Workers Custom Domains:** richiede una zona attiva su Cloudflare.
- **Flattening del CNAME all'apex:** automatico su tutti i piani.
- **Quota record della zona Free:** 200.
- **Zone Free:** una zona "Pending" viene eliminata dopo 28 giorni; una zona "Moved" dopo 7.

**ACM:** i certificati a 198 giorni si rinnovano 45 giorni prima della scadenza. Servono i CNAME di validazione *"present and accessible via public DNS"*.

**Conclusione:** l'unica via €0 garantibile per `nexum.pezzaliapp.com` è spostare i nameserver della zona su Cloudflare Free, mantenendo identico il sito esistente (record DNS only verso CloudFront, CNAME ACM copiati). Procedura, controlli, rollback e rischi sono nella SPEC §11. **Nulla è stato modificato.**

### 11.4 Profilo "Fast 4G" (E9)

Letto dalla sorgente di Chrome DevTools (`NetworkManager.ts`, `Fast4GConditions`, commit `2fd122501485`):
- download 1.012.500 byte/s;
- upload 168.750 byte/s;
- latenza 165 ms;
- nessuna perdita di pacchetti.

Congelato nella SPEC §7.1. Con questo profilo, la prima ricerca FTS5 (5.306.778 byte gzip) richiede **5,24 s** di sola trasmissione contro la soglia O9 di 6 s: il margine è stretto e dichiarato (SPEC §7.2).
