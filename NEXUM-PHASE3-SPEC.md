# NEXUM — Fase 3: specifica (NEXUM online, costo €0)

**Versione:** 0.2 · **Data:** 2026-09-29 · **Autore:** Alessandro Pezzali
**Stato:**
- Direzione generale approvata.
- Decisioni **E1, E2, E4–E9 APPROVATE** il 2026-09-29.
- **E3 SOSPESA** (dominio e DNS): piano di migrazione in §11, da approvare.
- Documento non versionato. Implementazione **non avviata**: nessun codice, nessuna risorsa, nessuna modifica DNS.
**Fattibilità e misure:** `NEXUM-PHASE3-FEASIBILITY.md`.

---

## 1. Obiettivo e vincoli

- **Obiettivo.** NEXUM è raggiungibile su `https://nexum.pezzaliapp.com` con l'esperienza completa della Fase 2, su:
  - desktop;
  - tablet;
  - Samsung Fold (chiuso e aperto);
  - iPhone.
  Il Mac dell'autore non deve essere acceso.
- **Costo €0 strutturale:**
  - nessun metodo di pagamento su alcun account;
  - nessuna risorsa a consumo;
  - nessun servizio a pagamento o server personale permanente.
- **Invarianti:**
  - licenza MIT; autore unico; zero codice OSIRIS;
  - fonti lecite con attribuzione;
  - nessuna raccolta di dati personali: nessuna analytics, nessun cookie, nessuna richiesta a terzi dal browser;
  - provenienza, evidenza e confidenza ovunque; ID stabili.
- **Il browser non scarica mai il mondo.** Si conservano:
  - query per viewport;
  - LOD;
  - paginazione;
  - vicinato del grafo;
  - finestra della timeline;
  - caricamento progressivo.

---

## 2. Architettura (B, snapshot statico ibrido)

```
GitHub Actions (repository pubblico, €0)
  fetch → ingest → normalize → correlate   (Core Python della Fase 1–2, SQLite autorevole)
       → snapshot build (Core Python)      → parity (TS read model vs Core)   → publish
                                                                              ├─ Cloudflare Pages (primario, E2)
                                                                              └─ GitHub Pages (mirror e rollback)
Browser
  UI della Fase 2 (stesso store, stesse viste) ── DataSource "snapshot" ── file statici immutabili
                                             └─ read model TS (mappa, timeline, facets, grafo) + sqlite-wasm (FTS5)
  Trail: IndexedDB + export/import JSON
```

**Nessun Worker, nessun database remoto.** Se un giorno servisse un endpoint dinamico, sarà una fase separata con un nuovo gate.

---

## 3. Formato dello snapshot

Ogni snapshot è una cartella **immutabile** `s/<version>/`, dove `version` è formato da UTC e hash del contenuto.

| File | Contenuto | Note |
|---|---|---|
| `current.json` (fuori dalla cartella, `no-cache`) | versione attiva, versione precedente, età, hash | unico file mutabile |
| `manifest.json` | versione, data di build, fonti con `verified_at` e attribuzioni, conteggi, schema, hash di ogni file | |
| `world/status.json`, `types.json`, `sources.json`, `facets.json`, `insights.json`, `timeline.json` | payload globali della Fase 2 | risposte del Core |
| `basemap/…` | provider "raw-polygons" della Fase 2 | 430 kB gzip misurati |
| `agg.bin` | tabella `agg` compatta, tutti i livelli | 0,20 MB gzip misurati |
| `pts/<z>/<cella>.bin` | punti tassellati per cella e livello | 2,92 MB gzip in totale |
| `ent/<shard>.bin` | bundle per entità: output esatti del Core per `context`, `explain`, `provenance`, `evidence`, `entity_timeline`, `timeline_neighbors`, `timeline_step`, `locate`, pagine delle relazioni | limite superiore ingenuo 413 MB gzip; da ridurre con la deduplicazione |
| `topo/<shard>.bin` | liste di adiacenza (`src`, `edge_kind`, `type`, `dst`, `ref`) | 3,31 MB gzip in totale |
| `refs/<shard>.bin` | etichetta, tipo e confidenza per riferimento `$ref` | 2,55 MB gzip |
| `raw/<shard>.bin` | estratti del record grezzo per locator (A10) | da misurare |
| `search.sqlite` | indice FTS5 identico al Core più `rid_map` | 4,70 MB gzip misurati |

- **Regole sui file:**
  - ogni file pesa ≤ 25 MiB (limite Cloudflare);
  - uno snapshot contiene ≤ 9.000 file, così due snapshot convivono nel limite di 20.000;
  - obiettivo ≤ 64 kB gzip per shard di entità, per non sprecare banda su mobile.
- **Compressione:** gli shard sono gzip "pre-compressi" serviti come binari e decompressi con `DecompressionStream`. Il formato è identico sui due host, e GitHub Pages resta sotto 1 GB.
- **Assegnazione agli shard:** un hash stabile dell'ID. La località (entità e vicini nello stesso shard) è un'ottimizzazione da misurare, non un requisito.
- **Budget fissi della UI** incorporati nei bundle: context 25, evidence 10, neighbors 300, pagine relazioni 4 × 50. Oltre queste pagine (hub), le relazioni arrivano da `topo` + `refs` nello stesso ordine del Core, sotto parità.

---

## 4. Lato browser

### 4.1 DataSource

L'unico punto che cambia nella UI è il client API. `lib/api` diventa un'interfaccia `DataSource` con due implementazioni:
- `service`: quella della Fase 2, invariata, per l'uso locale;
- `snapshot`: quella nuova.

Lo store normalizzato, le viste, i budget per classe di schermo, la cache a byte e il protocollo di selezione e pivot **non cambiano**.

### 4.2 Operazioni

| Operazione | Implementazione `snapshot` | Fedeltà |
|---|---|---|
| `context`, `explain`, `provenance`, `evidence`, `entity_timeline`, `timeline_neighbors`, `timeline_step`, `locate`, pagine delle relazioni | lettura dello shard dell'entità | **identica per costruzione** (output del Core) |
| `project_map` | `agg` per i livelli bassi; celle `pts` nella viewport per i livelli alti; stesso budget e stesso LOD | parità |
| `project_timeline`, `facets` (con scope) | `agg` per periodo e filtri | parità |
| `neighborhood`, `expand`, `path` | BFS su `topo` a shard. Profondità: telefono 1, desktop 2. Budget di nodi come nella Fase 2. `path` bidirezionale con tetto di shard caricati e risposta "troncato" dichiarata | parità |
| `search` (E4) | `search.sqlite` in `@sqlite.org/sqlite-wasm` 3.53.4 (Apache-2.0), caricato in memoria con `sqlite3_deserialize` (sola lettura, senza OPFS né COOP/COEP), in un Worker dedicato; stessa query SQL del Core (`bm25` 10/4/6/1). Nell'attesa, suggerimenti sulle etichette già caricate | parità, con lo stesso motore (verificata: FEASIBILITY §11.1) |
| record grezzo | shard `raw` per locator | identica |
| cancellazione | `AbortController` sulle fetch e generazioni nello store (la risposta vecchia viene scartata) | semantica della Fase 2 lato UI |

### 4.3 Mobile

Restano i layout e i budget di §L della Fase 2:
- telefono: una vista alla volta, grafo con profondità 1 e 100 nodi, 300 elementi sulla mappa;
- tablet: budget dimezzati.

Viewport di test aggiunti:

| Dispositivo | Viewport CSS | Stato |
|---|---|---|
| iPhone | 390×844 (già usato) e 430×932 | |
| Samsung Fold chiuso | circa 344×882 | da confermare su un dispositivo reale |
| Samsung Fold aperto | circa 884×1104 | fascia tablet |
| Fold, piegatura | resize e cambio di orientamento a caldo senza perdere la selezione | |

**E6 (approvata):**
- **Manifest installabile:** `manifest.webmanifest` con nome, icone originali e `display: standalone`, così NEXUM si può aggiungere alla schermata Home.
- **Persistenza:** `navigator.storage.persist()` richiesto al primo salvataggio della trail.
- **Esclusi:** nessun service worker e nessuna PWA offline completa.
- **Motivo:** Safari cancella IndexedDB dopo 7 giorni di uso di Safari senza interazioni con il sito; le web app aggiunte alla schermata Home sono esenti (policy ufficiale di WebKit, FEASIBILITY §11.2).

### 4.4 Trail

- **Archiviazione:**
  - IndexedDB, un database per origine;
  - stesso schema logico della Fase 2 (passi con ID stabile, vista, scope, timestamp) e `snapshot_version` per ogni passo.
- **Export e import:**
  - **export** JSON versionato (`nexum.trail/1`) e **import** con validazione dello schema;
  - un ID assente dallo snapshot corrente resta nel trail come "non presente in questo snapshot", senza essere rimosso.
- **Privacy:** nessun login e nessun invio al server. `localStorage` serve solo per le preferenze di interfaccia.
- **Mancata persistenza:** se IndexedDB non è disponibile (per esempio in navigazione privata), la trail vive solo in memoria e la UI lo dichiara.
- **Safari nel browser (non installato):**
  - la UI dichiara che la trail può essere cancellata dopo 7 giorni senza visite;
  - propone l'export JSON quando la trail cambia e non è stata esportata;
  - suggerisce l'aggiunta alla schermata Home (E6).
- **Persistenza negata:** se `persist()` restituisce `false`, la UI lo mostra; l'export resta l'unica garanzia.

### 4.5 Deep link e cambio di snapshot

- `?focus=<id>&view=<map|graph|timeline>&scope=…` funziona su qualunque snapshot perché gli ID sono stabili.
- Il client fissa la versione dello snapshot per tutta la sessione.
- Se `current.json` cambia, compare l'avviso "mondo aggiornato — ricarica". Non si mescolano mai due versioni.

---

## 5. Pipeline di aggiornamento (GitHub Actions)

- **Workflow:**
  - `build-world.yml` (`schedule` più `workflow_dispatch`);
  - `deploy.yml` (su artifact verificato).
- **Cadenze:**

  | Classe | Fonti | Cadenza |
  |---|---|---|
  | Dinamica | USGS, CEMS | ogni 6 ore |
  | Periodica | OurAirports | giornaliera |
  | Quasi statica | Natural Earth | settimanale |

  Le cadenze rispettano sempre `[politeness]` delle fonti; le richieste sono condizionali.
- **Passi:**
  1. ripristino del database precedente dall'artifact;
  2. fetch cortese;
  3. elaborazione con il Core;
  4. test della Fase 1 e 2 pertinenti;
  5. build dello snapshot;
  6. **parità bloccante**;
  7. controllo dei limiti dei file;
  8. publish su Cloudflare e mirror;
  9. aggiornamento di `current.json` per ultimo.
- **Credenziali:** un token API di Cloudflare limitato a "Cloudflare Pages: Edit" su un solo account, conservato come secret di Actions, per il direct upload del progetto Pages (E2). Nessun'altra credenziale.
- **Cadenze (E5, approvate):** USGS e CEMS ogni 6 ore, OurAirports ogni 24 ore, Natural Earth ogni settimana; circa 124 deploy al mese.
- **Commit:** nessun commit automatico su `main`.
- **Regola dei 60 giorni di inattività:** vedi FEASIBILITY §8.

---

## 6. Rollback

- **Snapshot:**
  - le cartelle degli snapshot sono immutabili;
  - il rollback consiste nel riscrivere `current.json` con la versione precedente, che resta pubblicata accanto a quella corrente;
  - effetto immediato, nessuna ricostruzione.
- **UI:** il rollback usa le versioni del deployment Cloudflare (riattivazione della precedente) oppure il redeploy dell'artifact precedente, conservato in Actions.
- **Host:** se Cloudflare Pages non è disponibile o cambia i limiti gratuiti, il CNAME `nexum` viene puntato a GitHub Pages, che serve lo stesso artefatto. La commutazione **non è istantanea**:
  - su GitHub Pages va configurato il dominio personalizzato;
  - il certificato viene emesso solo dopo che il DNS punta a GitHub, con un tempo da minuti a ore;
  - si raccomanda di verificare prima il dominio su GitHub (record TXT `_github-pages-challenge-…`), per evitare che altri possano rivendicarlo.
  
  Tutto questo dipende da E3.
- **Qualità:** se la parità o i controlli falliscono, niente viene pubblicato e resta attivo lo snapshot precedente.

---

## 7. Criteri di accettazione (O6, O8 e O9 approvati con E9)

| # | Criterio |
|---|---|
| O1 | Costo: nessun account usato ha un metodo di pagamento registrato; nessuna risorsa a consumo; verifica documentata |
| O2 | Nessuna richiesta del browser verso host diversi dall'origine NEXUM (E2E con blocco esterno, come nella Fase 2) |
| O3 | Catena completa (world → search → select → object → graph → pivot → timeline → insight → WHY → evidence/raw → nuovo focus) sui viewport desktop, tablet, Fold chiuso, Fold aperto, iPhone 390 e 430 contro lo snapshot |
| O4 | Parità: 100 % delle query campionate identiche al Core Python per `project_map`, `project_timeline`, `facets`, `neighborhood`, `expand`, `path`, `search`, con campioni stratificati per operazione e snapshot |
| O5 | Risposte centrate sull'entità byte per byte uguali all'output del Core (hash) per tutte le entità |
| O6 | Carico iniziale di WORLD MODE ≤ 1,0 MB gzip (misurato oggi: ≈ 869 kB). U8 invariato (≤ 600 / 900 kB di JS) |
| O7 | Nessun file oltre 25 MiB; ≤ 9.000 file per snapshot; sito totale ≤ 1 GB (mirror) |
| O8 | Pivot a cache fredda su rete emulata "Fast 4G" (profilo congelato sotto) ≤ 1,5 s p95; a cache calda ≤ 450 ms |
| O9 | Prima ricerca FTS5 su "Fast 4G" (runtime, indice, inizializzazione e prima query) ≤ **6 s**; ricerche successive p95 ≤ 150 ms (A9) |
| O10 | U2, U4, U5, U6, U7 e U9 della Fase 2 rieseguiti con la DataSource `snapshot`: stesse soglie |
| O11 | Trail: persistenza fra ricariche; export → import su un altro browser con esito identico; ID mancanti dichiarati |
| O12 | Deep link: `?focus=` di 100 ID campionati apre il fuoco corretto a freddo |
| O13 | Rollback: dopo lo switch di `current.json` la UI serve la versione precedente senza errori (test automatico) |
| O14 | Attribuzioni di tutte le fonti visibili in Sources e nel footer; età dello snapshot sempre visibile |
| O15 | Suite della Fase 1 e 2 invariata e verde; W1–W32 invariati sulla modalità `service` locale |
| O16 | P25 portabile: su un clone pulito il test non fallisce per un percorso assoluto e dichiara esplicitamente il proprio stato (§9) |

### 7.1 Profilo di rete "Fast 4G" (congelato con E9)

Valori letti dalla sorgente del preset di Chrome DevTools: `front_end/core/sdk/NetworkManager.ts`, `Fast4GConditions`, ramo `main` di `ChromeDevTools/devtools-frontend` al commit `2fd122501485`, letto il 2026-09-29.

| Parametro | Espressione nella sorgente | Valore applicato |
|---|---|---|
| download | `9 * 1000 * 1000 / 8 * .9` | **1.012.500 byte/s** (8,1 Mbit/s) |
| upload | `1.5 * 1000 * 1000 / 8 * .9` | **168.750 byte/s** (1,35 Mbit/s) |
| latenza | `fast4GTargetLatency * 2.75`, con `fast4GTargetLatency = 60` | **165 ms** |
| perdita di pacchetti | non impostata | 0 |

- **Applicazione:** i benchmark O8 e O9 applicano **questi numeri** tramite CDP (`Network.emulateNetworkConditions`) in Chrome installato, senza richiamare il preset per nome. Un cambiamento futuro del preset in DevTools non sposta quindi le soglie.
- **Cache fredda:** contesto di browser nuovo e cache disabilitata.
- **Cache calda:** stessa sessione, secondo accesso.

### 7.2 Margine di O9 (dichiarato)

**Misura del 2026-09-29** (componenti gzip):

| Componente | Dimensione |
|---|---|
| `sqlite3.wasm` | 402.035 byte |
| codice JS di collegamento, minificato | 63.660 byte |
| indice FTS5 del mondo D1 (`gzip -9`) | 4.841.083 byte |
| **totale** | **5.306.778 byte** |

- A 1.012.500 byte/s la sola trasmissione richiede **5,24 s**. Restano circa 0,76 s per latenze, inizializzazione (28–120 ms misurati), decompressione (22–55 ms) e prima query (15–85 ms).
- **Rischio:** il margine è **stretto**, e l'indice crescerà con le fonti dinamiche.
- **Mitigazioni ammesse**, che non abbassano la soglia e non riducono l'indice:
  - servire l'indice con `Content-Encoding: br` se l'host lo consente: con brotli 11 è 3.771.742 byte, da verificare nell'implementazione;
  - precaricarlo quando la rete è libera, se non è attiva la modalità risparmio dati.
- **Regola:** se O9 fallisce, **STOP** e decisione dell'autore. Nessuna modifica alla soglia né all'indice per ottenere il PASS.

---

## 8. Slice di implementazione (dopo il GO)

1. **Snapshot builder** (Python, fuori dal Core):
   - bundle esatti, deduplicazione, sharding;
   - **misura della dimensione reale** e verifica di O5 e O7.
2. **DataSource `snapshot`** per le operazioni centrate sull'entità, più la catena OBJECT, WHY ed evidence in locale da file statici.
3. **Read model** per mappa, timeline e facets, con la parità O4.
4. **Grafo** (`topo`) e `path`, con la parità.
5. **Search** con `sqlite-wasm` e FTS5, con la parità.
6. **Trail** in IndexedDB più export/import; deep link; cambio di snapshot.
7. **Mobile:** viewport Fold e iPhone; benchmark O6, O8, O9, O10.
8. **Pipeline Actions** su un fork di prova senza deploy, poi deploy **solo dopo** un secondo GO dell'autore.
9. **Validazione** O1–O16 e documento di validazione.

---

## 9. Portabilità di P25 (correzione specificata, **non applicata**)

**Problema.** `tests/test_governance.py:10` contiene `OSIRIS = pathlib.Path("<LOCAL_PATH>/OSIRIS-REFERENCE")`, e alla riga 132 `pytest.fail` se il percorso non esiste. Su un clone pulito, o in CI, P25 fallisce.

**Specifica.**
- Il percorso si legge da `NEXUM_OSIRIS_REFERENCE`. Nessun percorso assoluto resta nel repository.
- **Politica esplicita:**

  | Condizione | Esito |
  |---|---|
  | variabile impostata e percorso esistente | P25 viene eseguito come oggi (classificatore per contenuto, invariato) |
  | variabile impostata ma percorso inesistente | **fail**: configurazione errata |
  | variabile assente | **skip esplicito**, con motivo "P25 non verificabile: OSIRIS-REFERENCE non disponibile (NEXUM_OSIRIS_REFERENCE)" |
  | variabile assente e `NEXUM_REQUIRE_P25=1` | **fail** |

  Una skip non è mai un PASS: non viene contata come PASS nei report.
- **Gate di rilascio:** prima di ogni pubblicazione di codice (non di dati) l'autore esegue la suite in locale con `NEXUM_REQUIRE_P25=1`. La CI pubblica non ha e non avrà una copia di OSIRIS-REFERENCE.
- **Alternativa scartata:** committare impronte (hash) dei file OSIRIS per eseguire P25 in CI. Sarebbero dati derivati da OSIRIS nel repository, in contrasto con "zero OSIRIS"; si considera solo su decisione esplicita dell'autore.
- Un test della politica stessa verifica i quattro casi della tabella.

---

## 10. Decisioni dell'autore (2026-09-29)

| # | Decisione | Esito | Stato |
|---|---|---|---|
| E1 | Architettura | **B**: snapshot statico precalcolato | **APPROVATA** |
| E2 | Host | **Cloudflare Pages** principale, **GitHub Pages** come mirror e rollback | **APPROVATA** |
| E3 | Dominio e DNS di `pezzaliapp.com` | Il DNS è su AWS Route 53, e un CNAME lì ha un costo per query (FEASIBILITY §11.3). Migrazione dei nameserver a Cloudflare Free proposta in §11, **da approvare** dopo i controlli dell'autore. Divieto di modificare DNS, Route 53, CloudFront, ACM e Cloudflare | **SOSPESA** |
| E4 | Ricerca | FTS5 in `@sqlite.org/sqlite-wasm` | **APPROVATA** |
| E5 | Cadenze | USGS/CEMS 6 ore, OurAirports 24 ore, Natural Earth settimanale | **APPROVATA** |
| E6 | PWA | manifest installabile + `storage.persist()`, **senza** PWA offline completa | **APPROVATA** |
| E7 | Mondo online | solo il mondo D1 reale | **APPROVATA** |
| E8 | P25 | `NEXUM_OSIRIS_REFERENCE` + `NEXUM_REQUIRE_P25` (§9) | **APPROVATA** |
| E9 | Soglie | O6 ≤ 1,0 MB gzip; O8 ≤ 1,5 s a freddo / ≤ 450 ms a caldo; O9 ≤ 6 s per la prima ricerca FTS5; profilo Fast 4G congelato in §7.1 | **APPROVATA** |

**Vincolo sull'implementazione:** non inizia prima di un GO esplicito. Gli slice 1–7 (§8) non dipendono dal dominio. Il deploy su `nexum.pezzaliapp.com` dipende da E3; fino ad allora il deploy di prova userebbe `*.pages.dev`, e solo dopo un GO separato.

---

## 11. Piano di migrazione DNS (E3, **SOSPESO**: nulla è stato modificato)

### 11.1 Stato attuale, verificato pubblicamente il 2026-09-29

Con AWS CLI non disponibile, lo stato è ricostruito da `dig`, `whois`, header HTTP, TLS e Certificate Transparency.

| Elemento | Valore osservato |
|---|---|
| Registrar | Amazon Registrar, Inc.; scadenza 2027-09-08 |
| Nameserver (delega `.com`, TTL 172.800 s = 48 h) | `ns-31.awsdns-03.com`, `ns-562.awsdns-06.net`, `ns-1508.awsdns-60.org`, `ns-1546.awsdns-01.co.uk` |
| SOA | `ns-31.awsdns-03.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400` |
| DNSSEC | **non attivo**: nessun DS né DNSKEY |
| `pezzaliapp.com` A | 4 IP CloudFront, TTL 60, che cambiano a ogni risposta: è un **record Alias verso CloudFront** |
| `www.pezzaliapp.com` A | come l'apex: **Alias verso CloudFront**, stessa distribuzione (stesso ETag e contenuto) |
| AAAA | nessuna risposta: IPv6 non pubblicato |
| MX, TXT, CAA, wildcard, `_dmarc` | **assenti** (e nessun record trovato su 30 nomi comuni provati) |
| `nexum.pezzaliapp.com` | non esiste |
| Certificato TLS (ACM, emesso da Amazon RSA 2048 M01) | SAN `pezzaliapp.com` e `www.pezzaliapp.com`; valido dal 2026-07-10 al 2027-01-23 (198 giorni); rinnovi precedenti 2024-09-08 e 2025-08-09 (Certificate Transparency) |
| Rinnovo ACM | validazione DNS: **ci sono quindi due CNAME `_<hash>.… → _<hash>.….acm-validations.aws.`** (uno per SAN), con nomi non osservabili pubblicamente. ACM li ricontrolla **45 giorni prima della scadenza**, quindi verso il **2026-12-09** |
| Sito | CloudFront con origine S3; HTTP → 301 verso HTTPS; 404 personalizzato (12.984 byte); nessun HSTS; nessun redirect fra apex e `www` |

Il DNS pubblico **non** permette di elencare una zona: l'inventario completo va letto in Route 53 (§11.9).

### 11.2 Funzione dei record attesi in Route 53

| Record | Tipo | Funzione | Da replicare su Cloudflare |
|---|---|---|---|
| `pezzaliapp.com` NS e SOA | NS/SOA | delega e autorità della zona | **no**: Cloudflare genera i propri |
| `pezzaliapp.com` A (Alias → `dXXXX.cloudfront.net`) | A-Alias | sito principale | **sì**: CNAME all'apex (flattening) verso `dXXXX.cloudfront.net`, **DNS only** |
| `www.pezzaliapp.com` A (Alias → stessa distribuzione) | A-Alias | sito `www` | **sì**: CNAME verso `dXXXX.cloudfront.net`, **DNS only** |
| eventuali AAAA Alias | AAAA-Alias | IPv6 | coperti dal CNAME (oggi non pubblicati) |
| `_<hash>.pezzaliapp.com` e `_<hash>.www.pezzaliapp.com` | CNAME | validazione e **rinnovo** ACM | **sì, identici**, **DNS only** |
| qualunque altro record trovato nella console | — | da classificare | da decidere uno per uno |

### 11.3 Configurazione Cloudflare equivalente (piano Free)

- Zona `pezzaliapp.com`, piano **Free**.
- `CNAME @ → dXXXX.cloudfront.net`, **DNS only** (nuvola grigia).
  - Il flattening all'apex è automatico su tutti i piani.
  - Con DNS only Cloudflare restituisce gli IP del target, con TTL pari al minimo fra i due record.
- `CNAME www → dXXXX.cloudfront.net`, **DNS only**.
- I due CNAME ACM copiati **carattere per carattere**, **DNS only**.
- **Nessun record proxied** (arancione) per apex e `www`. Il proxy metterebbe Cloudflare davanti a CloudFront e cambierebbe TLS, cache e header: il sito non sarebbe più identico. Con la modalità SSL "Flexible" nascerebbe inoltre un loop di redirect, dato che CloudFront reindirizza HTTP → HTTPS.
- **Nessun record A importato dalla scansione automatica.** La scansione di Cloudflare vede gli IP CloudFront dietro gli Alias e li importerebbe come A **statici**; quegli IP cambiano, e il sito si romperebbe in seguito. Vanno cancellati e sostituiti dai CNAME.
- Non attivare DNSSEC durante la migrazione. Non aggiungere CAA.
- Dopo l'approvazione di E3 e il GO al deploy: `nexum` come dominio personalizzato del progetto Cloudflare Pages. Pages crea il record da sé; è separato dalla migrazione.

**Costi, verificati sulla documentazione Cloudflare il 2026-09-29:**
- *"For customers on Free, Pro, or Business plans, Cloudflare does not charge for DNS queries."*
- Quota record della zona Free: **200** per zone create dal 2024-09-01.
- La scelta del piano avviene in fase di aggiunta del dominio: va scelto **Free**, e nessun metodo di pagamento va registrato.
- Il registrar resta Amazon: il rinnovo del dominio non cambia.
- La zona Route 53, finché esiste, continua a costare 0,50 $ al mese sull'account AWS esistente (costo già in essere, non introdotto da NEXUM). La sua eliminazione è facoltativa e decisa dall'autore, dopo il periodo di rollback.

### 11.4 Controlli prima della migrazione

1. **Inventario completo** dei record da Route 53 (§11.9, punto 1), confrontato con la tabella §11.2. Qualunque record in più blocca la migrazione finché non è classificato.
2. **Baseline del sito** registrata il giorno stesso:
   - apex e `www`, HTTP e HTTPS;
   - pagine, PDF, `robots.txt`, `sitemap.xml`, `manifest.json`, 404;
   - per ciascuno: codice, `Location`, `Content-Type`, lunghezza, SHA-256 del corpo, ETag;
   - certificato: SAN, emittente, scadenza.
   
   Una baseline di riferimento del 2026-09-29 (52 URL) è conservata fuori dal repository.
3. **ACM:** certificato "Issued", "In use: Yes", "Renewal eligibility: Eligible"; stato di validazione "Success" per entrambi i domini.
4. **Zona Cloudflare** creata ma non ancora attiva (i nameserver non sono cambiati). Si interrogano direttamente i nameserver assegnati, per esempio `dig @<nome>.ns.cloudflare.com pezzaliapp.com A`, per `www` e per i due CNAME ACM. Le risposte devono coincidere con quelle di Route 53: stesso target CloudFront; gli IP possono variare, ma devono appartenere a CloudFront.
5. **Prova del sito attraverso le risposte Cloudflare** senza cambiare il DNS: `curl --resolve pezzaliapp.com:443:<IP restituito da Cloudflare>`, con confronto dei risultati con la baseline.
6. **Tempistica:** data **lontana dal 2026-12-09** (verifica di rinnovo ACM), e con almeno 14 giorni di osservazione dopo la migrazione prima di quella data. Consigliata una data entro il 2026-11-15.

### 11.5 Procedura di migrazione (da eseguire solo dopo l'approvazione di E3)

1. Controlli pre-migrazione §11.4 tutti verdi.
2. **Route 53 → Registered domains → `pezzaliapp.com` → Name servers → Edit:**
   - sostituire i 4 nameserver `awsdns` con i **2 nameserver Cloudflare** assegnati (copiati, non digitati);
   - **non toccare** la hosted zone Route 53: resta intatta per tutto il periodo di rollback.
3. **Propagazione fino a 48 h** (TTL della delega `.com`). In questo intervallo i resolver interrogano l'uno o l'altro provider; siccome le due zone rispondono allo stesso modo, **non c'è interruzione**.
4. Cloudflare segnala la zona "Active". Controlli post-migrazione (§11.6).
5. Osservazione per **almeno 14 giorni**, oltre la verifica ACM del 2026-12-09. Solo dopo, su decisione dell'autore, eventuale eliminazione della hosted zone Route 53.

### 11.6 Controlli dopo la migrazione (il sito deve restare identico)

- **Delega:** `dig +trace pezzaliapp.com NS` mostra i nameserver Cloudflare; `whois` mostra i nuovi nameserver.
- **Risoluzione:** tramite `1.1.1.1`, `8.8.8.8` e `9.9.9.9`, apex e `www` restituiscono IP CloudFront, e i due CNAME ACM restituiscono i target `acm-validations.aws`.
- **Contenuto:** stesso elenco di URL della baseline, con codici, `Location`, `Content-Type`, lunghezze, SHA-256 ed ETag identici.
  - Se il sito è stato aggiornato nel frattempo, la baseline va rifatta subito prima della migrazione.
  - Header come `x-amz-cf-pop` possono variare: sono informativi.
- **TLS:** stesso certificato ACM (SAN, emittente, scadenza) su apex e `www`.
- **ACM:** in console "Renewal eligibility: Eligible"; nessun evento AWS Health relativo alla validazione.
- **Latenza:** `x-amz-cf-pop` e tempo di risposta da una rete italiana, confrontati con la baseline. Con il flattening dell'apex, CloudFront potrebbe scegliere un PoP diverso; va misurato, e non incide sul contenuto.
- **Ripetizione:** controlli a +1 h, +24 h, +48 h, +7 giorni, e dopo il 2026-12-09 (rinnovo ACM).

### 11.7 Rollback

- **Quando:**
  - un qualunque controllo §11.6 fallisce e non si corregge nella zona Cloudflare entro pochi minuti;
  - oppure l'autore lo decide.
- **Come:** Route 53 → Registered domains → Name servers → rimettere i **4 nameserver `awsdns` originali** (§11.1). La hosted zone Route 53, mai modificata, riprende a rispondere.
- **Tempi:** propagazione fino a 48 h. Durante il rollback le due zone devono continuare a dare le stesse risposte, quindi la zona Cloudflare **non va eliminata** prima di 48 h. Poi Cloudflare la segna "Moved" e la elimina da sola dopo 7 giorni (piano Free).
- **Costi:** nessuno, né per la migrazione né per il rollback.

### 11.8 Rischi di interruzione

| Rischio | Effetto | Prevenzione |
|---|---|---|
| Record A importati dalla scansione (IP CloudFront statici) | il sito smette di funzionare quando CloudFront cambia IP | cancellarli; solo CNAME (§11.3) |
| Record proxied per errore | TLS e cache diversi; possibili loop di redirect | tutto DNS only; verifica §11.4 punto 5 |
| CNAME ACM mancanti o sbagliati | rinnovo fallito; **certificato scaduto il 2027-01-23**, sito irraggiungibile in HTTPS | copia esatta; controllo in console; migrazione prima di metà novembre |
| Record sconosciuto non migrato | servizio collegato interrotto | inventario completo dalla console (§11.4 punto 1) |
| Nameserver digitati male | dominio irraggiungibile fino a 48 h | copia e incolla; verifica immediata con `whois` e `dig +trace`; rollback |
| DNSSEC attivato durante la migrazione | fallimento di risoluzione per i resolver validanti | non attivarlo (oggi non è attivo) |
| Zona Free "Pending" per più di 28 giorni | Cloudflare elimina la zona in attesa | cambiare i nameserver entro 28 giorni dall'aggiunta, oppure riaggiungerla |

### 11.9 Controlli personali dell'autore (in sola lettura, prima di approvare E3)

**AWS:**
1. **Route 53 → Hosted zones → `pezzaliapp.com`:** annotare ogni record (nome, tipo, Alias sì/no, target, TTL). In alternativa, con **AWS CloudShell** (gratuito) e solo in lettura:
   ```
   aws route53 list-hosted-zones-by-name --dns-name pezzaliapp.com
   aws route53 list-resource-record-sets --hosted-zone-id <ID>
   ```
   Verificare anche che esista **una sola** hosted zone per `pezzaliapp.com`.
2. **Route 53 → Registered domains → `pezzaliapp.com`:** nameserver attuali (devono essere i 4 di §11.1), rinnovo automatico, blocco di trasferimento, DNSSEC "disabled".
3. **CloudFront → la distribuzione del sito:**
   - nome di dominio `dXXXX.cloudfront.net`;
   - "Alternate domain names" (attesi: `pezzaliapp.com`, `www.pezzaliapp.com`);
   - IPv6 attivo o no;
   - certificato ACM associato;
   - "Viewer protocol policy".
4. **ACM (regione us-east-1) → il certificato:**
   - stato, "In use", "Renewal eligibility";
   - per ciascun dominio, **nome e valore del CNAME** di validazione: sono i due record da copiare.

**Cloudflare**, solo se hai già un account:

5. *Account home → Domains:* `pezzaliapp.com` non deve essere già presente, nemmeno "Pending".
6. *Manage account → Billing → Payment info:* **nessun metodo di pagamento**.
7. *Billing → Subscriptions:* nessun abbonamento; *Workers & Pages → Plans:* piano **Free**.

Per ora non va aggiunto nulla: nessun dominio, nessuna risorsa.

---

**Fine della specifica v0.2.** E1, E2, E4–E9 approvate; E3 sospesa. Nessun codice, nessun commit, nessun push, nessuna risorsa, nessuna modifica DNS.
