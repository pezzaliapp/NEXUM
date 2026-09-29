# NEXUM — Fase 2: Design Gate del workspace

**Versione:** 0.2 — **APPROVATA** il 2026-09-29 con le decisioni D1–D12 (§R). Criteri W1–W32 e benchmark A1–A10, U1–U10 **congelati** (§O, §P) prima dell'implementazione.
**Data:** 2026-09-29
**Autore:** Alessandro Pezzali
**Base:** Core della Fase 1, commit `7c62b6b`, 66/66 test e tutti i benchmark PASS.
**Stato del Core:** congelato. Unica eccezione approvata (D1): una nuova funzione pubblica di sola lettura `Query.explain(ref)`, additiva, che non cambia significato né risultati della Fase 1.

> NEXUM is a world of Objects, Relations and Events observed through Map, Graph, Timeline and Search.
> **ONE OBJECT. MANY RELATIONS. ONE TIMELINE.**

---

## 0. Sommario

La Fase 2 porta il Core in un **workspace investigativo locale ad alta densità**, costruito da tre pezzi:

1. **`nexum/api`**, un servizio di query locale scritto in Python con la sola libreria standard. Espone le operazioni del Core via HTTP su `127.0.0.1`, **impone budget, scadenze e cancellazione** e serve i file statici della UI. Non contiene logica di dominio né correlazione.
2. **`ui/`**, un'applicazione TypeScript a pagina singola. Mostra **un solo mondo** in cinque viste coordinate (MAP, GRAPH, TIMELINE, SEARCH, OBJECT MODE), sopra un **unico store normalizzato indicizzato per `EntityRef`**.
3. **WHY THIS RELATION?**, una vista che rende navigabili la provenienza, i fattori di confidenza, il raggruppamento dei candidati e gli elementi scartati, già registrati dal Core.

Nessuna nuova dipendenza Python a runtime. Lato browser ci sono 4 dipendenze runtime (React, React DOM, MapLibre GL JS, Sigma.js con Graphology), tutte con licenze permissive, più gli strumenti di build (Vite, TypeScript) e di test (Playwright), che servono solo in sviluppo.

Dall'analisi del Core sono emerse tre lacune che toccano "Why this relation?" (§I.5). La prima è risolta dalla decisione D1: una funzione pubblica di sola lettura `explain(ref)` nel Core.

---

## A. Architettura

### A.1 Schema

```
┌──────────────────────────── Browser (desktop / tablet / mobile) ─────────────────────────────┐
│  ui/  — TypeScript SPA (file statici, nessun server Node a runtime)                             │
│                                                                                                 │
│   ┌─────────── Workspace shell ───────────┐     ┌──────── Store unico (normalizzato) ────────┐  │
│   │ Command bar · Trail · Scope chips     │     │ entities: Map<id, EntityRecord>            │  │
│   │ Stage: MAP | GRAPH | split            │ ◀──▶│ selection / focus / hover  (solo id)       │  │
│   │ Inspector: OBJECT MODE | WHY | WORLD  │     │ scope (lo Scope del Core, uno solo)        │  │
│   │ Timeline strip (sempre presente)      │     │ trail (lista di {ref, scope})              │  │
│   └───────────────────────────────────────┘     │ world_version                              │  │
│                                                 └──────────────┬─────────────────────────────┘  │
│   Request manager: canali, debounce, AbortController, dedup, cache per world_version            │
└──────────────────────────────────────────────────────────────┬──────────────────────────────────┘
                                                               │ HTTP/1.1 JSON, solo 127.0.0.1
┌──────────────────────────────────────────────────────────────▼──────────────────────────────────┐
│  nexum/api/  — servizio locale (Python 3.12, solo stdlib)            FUORI DAL CORE             │
│   server      ThreadingHTTPServer, pool limitato (6 worker), bind 127.0.0.1, controllo Host     │
│   routes      allowlist operazioni → metodi di Query; parsing/validazione di Scope e Budget     │
│   policy      budget e scadenze per endpoint (sotto i massimi del Core)                         │
│   cancel      registro (canale, seq): richiesta superata → interrupt SQLite                     │
│   cache       LRU delle risposte per (op, parametri canonici, world_version)                    │
│   explain     compone WHY THIS RELATION? dalle operazioni del Core                              │
│   raw         estrae il singolo record dal Raw Store (non l'intero payload)                     │
│   basemap     costruisce la cartografia di base dal payload Natural Earth già acquisito         │
│   trails      persistenza dei trail in un DB separato (se approvata, §R D5)                     │
│   static      serve ui/dist                                                                     │
└──────────────────────────────────────────────────────────────┬──────────────────────────────────┘
                                                               │ connessioni SQLite read-only (mode=ro), una per worker
┌──────────────────────────────────────────────────────────────▼──────────────────────────────────┐
│  nexum/core/  — Fase 1, invariato: Query, confidence, raw, registry, correlate.load_rules       │
│  data/<world>/world.sqlite  ·  data/<world>/raw/                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ scritture: solo CLI esistente (fetch / process / correlate / rebuild), processo separato
```

### A.2 Principi

| Principio | Conseguenza |
|---|---|
| **Il Core resta la sola fonte di verità** | L'API non esegue SQL proprio sul mondo e **non legge mai campi interni SQLite** che appartengono semanticamente al Core (D1): ciò che serve passa da una funzione pubblica di `Query`. Ogni numero mostrato dalla UI viene da un'operazione di `Query`. |
| **L'API è un adattatore, non un secondo Core** | Nessuna regola, correlazione, confidenza ricalcolata o tipo di dominio nell'API. Il test P28 (termini vietati) si estende a `nexum/api` e `ui/src`. |
| **Sola lettura sul mondo** | Connessioni `mode=ro` e `PRAGMA query_only=ON`. Le scritture restano alla CLI, in un processo separato. La modalità WAL del Core permette letture concorrenti. |
| **Nessuna richiesta illimitata possibile** | Budget per endpoint, parametri obbligatori (viewport, finestra), scadenze, byte massimi. Dettagli in §J e §K. |
| **Una sola origine** | UI e API sullo stesso host e porta: niente CORS, niente servizi esterni, funziona offline. |
| **Local-first** | Nessun tile server, CDN, font remoto o telemetria. La cartografia di base viene da dati già presenti nel Raw Store. |

### A.3 Processi e ciclo di vita

- `python3 -m nexum.api serve <world> [--port 8765]` avvia il servizio e serve `ui/dist`. L'indirizzo di ascolto è un parametro di configurazione del servizio (default e unico valore ammesso in Fase 2: `127.0.0.1`, D10); la UI usa sempre URL **relativi** (`/api/v1/…`) e non contiene indirizzi, porte o ipotesi sul modello di deployment. Se `ui/dist` manca, il servizio lo segnala e risponde comunque alle chiamate API.
- Il mondo può essere aggiornato dalla CLI mentre il servizio è attivo. Ogni risposta riporta `world_version`. La UI legge `/status` ogni 30 s e, se la versione cambia, usa `changes_since` per aggiornare senza ricaricare.
- Chiusura pulita: `Ctrl-C` chiude le connessioni e interrompe le query in corso.

### A.4 Cancellazione delle query obsolete (senza modificare il Core)

1. Ogni richiesta porta `X-Nexum-Channel`, per esempio `map`, `timeline`, `search` o `graph`, e `X-Nexum-Seq`, un numero crescente per canale.
2. Il browser annulla con `AbortController` le richieste superate, dopo un debounce di 120 ms per pan e zoom e di 150 ms per la digitazione.
3. Il server conserva `latest_seq[channel]`. Ogni connessione worker ha un `set_progress_handler` di SQLite, installato dall'API sulla propria connessione e quindi senza toccare il Core. Il gestore interrompe la query quando arriva una richiesta più recente sullo stesso canale o quando scade la scadenza dell'endpoint.
4. Esiti: una richiesta superata risponde `409 superseded` (il browser l'ha già scartata); una richiesta scaduta risponde `504 deadline_exceeded` con un suggerimento, cioè ridurre la finestra o lo zoom.
5. Il pool è limitato a 6 worker con coda massima di 24. Oltre, la risposta è `429 busy`, così il server non si satura durante un pan frenetico.

---

## B. Stack e motivazione

### B.1 Confronto dei framework UI

| Criterio | **React + Vite** | React + Next.js | Preact + Vite | TypeScript "vanilla" o Web Components (Lit) |
|---|---|---|---|---|
| Runtime richiesto | nessuno: file statici serviti da Python | server Node, oppure `output: export` che rinuncia alle funzioni di Next | nessuno | nessuno |
| Adatto a una SPA locale, dati da un'API Python | sì | no: SSR, routing server e React Server Components non servono e duplicano l'API Python | sì | sì |
| Peso runtime (gzip, misurato) | ~117 kB (react 4,6 + react-dom client 110 + scheduler 2,5) | ≥ quello di React più il runtime Next | ~9 kB (core 4,8 + compat 4,2) | ~0–6 kB |
| Dimensione del pacchetto installato | react-dom 8,1 MB | **next 184,8 MB** | 1,6 MB | ~0,1 MB |
| Manutenzione | React 19.3.0 (2026-09-09); Vite 8.3.1 (2026-09-24) | Next 16.3.6 | Preact 10.29.8 (2026-08-01) | Lit 3.3.3 |
| Rischio | basso, ecosistema più ampio | cambi frequenti delle convenzioni, lock-in sul modello server | compatibilità imperfetta con librerie React-only; non ne usiamo | molto codice di infrastruttura da scrivere (stato, ciclo di vita) |
| Coerenza con KISS | **alta**: un solo modello mentale, build statico | bassa | alta | media: semplice in piccolo, costosa in un workspace denso |

**Scelta (D2): React + Vite, in TypeScript.**

- Next.js è **escluso**. Porterebbe un secondo server, e le sue funzioni principali (SSR, routing lato server, server actions) non hanno ruolo in un'applicazione locale che legge da un'API Python.
- Preact non è adottato (D2); resta un'alternativa compatibile documentata, perché le parti pesanti (mappa, grafo, timeline) sono imperative e indipendenti dal framework.

### B.2 Mappa: MapLibre GL JS

- **Licenza e versione:** BSD-3-Clause, v6.11.2 (2026-09-24).
- **Peso:** 149 kB gzip più 10,5 kB di CSS.
- **Dipendenze transitive:** 18, tutte ISC, BSD-2/3, MIT o "MIT OR Apache-2.0".
- **Perché:** rendering WebGL, sorgenti GeoJSON aggiornabili con `setData`, `feature-state` per la selezione senza ricostruire i dati, `promoteId` per usare gli ID NEXUM come ID delle feature.
- **Alternative scartate:**
  - Leaflet: rendering DOM/Canvas, meno adatto a 5.000 elementi aggiornati durante il pan;
  - deck.gl: MIT, ma 17 dipendenze e una complessità che non serve;
  - OpenLayers: BSD-2, valido ma più pesante da configurare.
- **Cartografia di base, senza servizi esterni (D4):** poligoni di terre e confini costruiti dal payload Natural Earth 1:50m **già presente nel Raw Store** (pubblico dominio, fonte già registrata). Nessun tile server, OSM compreso.
- **Basemap come provider intercambiabile (D4):** la UI riceve la cartografia di base da `GET /api/v1/basemap/style.json`, uno **stile MapLibre** con sorgenti e layer di sfondo. Il WORLD MODE aggiunge i propri layer (celle, elementi, selezione) sopra lo stile, con ID riservati `nexum-*`, senza conoscere il tipo di sorgente della basemap. Una futura cartografia più dettagliata (per esempio vector tile locali) sostituisce solo il provider lato API e lo stile: WORLD MODE non cambia.
- **Etichette (D4, soluzione di Fase 2, non permanente):** nessun layer di testo MapLibre, che richiederebbe glyph PBF. Le poche etichette utili (fuoco, selezione, i primi N elementi nel viewport) sono **overlay HTML** posizionati con `map.project`, isolati in un unico modulo `labels` sostituibile da layer di testo quando esisterà un provider con glyph locali.

### B.3 Grafo: Sigma.js + Graphology

| Candidato | Licenza | Peso gzip | Rendering | Valutazione |
|---|---|---|---|---|
| **Sigma.js 3.0.3 + Graphology 0.26.0** | MIT + MIT | 47,2 + 13,9 kB | WebGL | **scelto**: gestisce da migliaia a decine di migliaia di nodi, API semplice, modello dati separato dal rendering, adatto all'espansione progressiva |
| Cytoscape.js 3.34.3 | MIT | 136,5 kB | Canvas | ricco (nodi composti, molti layout) ma più pesante e più lento oltre qualche migliaio di elementi |
| cosmos.gl 3.4.2 | MIT | — | GPU force | pensato per grafi enormi a colpo d'occhio, non per l'indagine passo per passo; 16 dipendenze |
| D3-force + SVG | ISC | piccolo | SVG | degrada oltre qualche centinaio di archi |

- **Layout deterministico (D3)**, scritto in NEXUM e senza dipendenze: fuoco al centro, vicini disposti per settori (tipo di arco), anelli per profondità, ordine dentro il settore per ID stabile. **Lo stesso contesto produce la stessa disposizione**; un'espansione aggiunge nodi senza spostare quelli esistenti.
- **Nessun force-layout in Fase 2 (D3).** Il layout è una funzione pura `layout(graph, previousPositions) → positions` dietro un'interfaccia `LayoutStrategy`; una futura modalità esplicita "Explore layout" potrà aggiungere un'altra strategia senza cambiare modello del grafo, store o API.

### B.4 Timeline, ricerca, liste, stato

Sono componenti **scritti in NEXUM**, senza librerie:

- **Timeline** su Canvas 2D: istogramma dei bucket, tracce degli elementi, pennello per la finestra, zoom temporale.
- **Liste virtualizzate** a righe di altezza fissa, circa 100 righe di codice. Evitano `@tanstack/react-virtual` (MIT, 14 kB): la dipendenza non è necessaria.
- **Stato** con uno store proprio e `useSyncExternalStore` di React. Niente Redux, Zustand o MobX.
- **Routing** con lo stato nell'hash dell'URL (`#/focus/evt_…?v=map,graph&t=…&bb=…`). Niente router di terze parti.
- **Icone:** SVG disegnate per NEXUM, poche e geometriche. Nessun set di icone esterno, nessun elemento grafico derivato da OSIRIS o Palantir.
- **Font di sistema** (`system-ui`, `ui-monospace`): nessun web font.

### B.5 Strumenti di sviluppo (non spediti al browser)

| Strumento | Licenza | Uso |
|---|---|---|
| Vite 8.3.1 + `@vitejs/plugin-react` 6.1.1 | MIT | build e server di sviluppo |
| TypeScript 7.0.2 | Apache-2.0 | tipi e controllo statico |
| Playwright 1.63.0 | Apache-2.0 | test E2E e benchmark UI; con `channel: "chrome"` usa il Chrome già installato, senza scaricare browser (D6); `npx playwright install` non viene mai eseguito |
| `node:test` (incluso in Node 24) | — | test unitari dello store e del request manager; niente Vitest |

Node.js 24 (già installato: v24.19.0) serve **solo per la build e i test**. A runtime basta Python.

---

## C. Struttura visuale del workspace

### C.1 Anatomia

```
┌ COMMAND BAR ─ wordmark · ricerca · scope (tipi, finestra, confidenza, fonti) · stato del mondo ┐
├ TRAIL ─ fuoco1 › fuoco2 › fuoco3 ›  ...                           ◀ ▶  salva trail ─────────────┤
├──────┬───────────────────────────────────────────────────────────┬───────────────────────────────┤
│ RAIL │ STAGE                                                     │ INSPECTOR                     │
│      │  MAP  |  GRAPH  |  MAP+GRAPH (split)                      │  senza fuoco: WORLD SUMMARY   │
│ tipi │                                                           │  con fuoco:   OBJECT MODE     │
│ layer│                                                           │  su richiesta: WHY            │
│ face-│                                                           │                               │
│ tte  │                                                           │                               │
├──────┴───────────────────────────────────────────────────────────┴───────────────────────────────┤
│ TIMELINE STRIP ─ densità · finestra (pennello) · tracce del fuoco e dei correlati · zoom       │
├ STATUS BAR ─ world_version · fonti ok/degradate/sospese · budget · attribuzioni ──────────────────┤
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Non ci sono dashboard a riquadri.** Lo spazio è diviso in cinque regioni fisse con separatori di 1 px; nessuna card galleggiante, nessuna griglia di widget.
- **La timeline è sempre visibile** perché incarna "ONE TIMELINE": è lo stesso asse temporale per tutto il workspace, non una vista tra le altre.
- **L'Inspector è l'OBJECT MODE.** Non si apre in un'altra pagina: il contesto compare accanto a ciò che si sta guardando.
- **Il Trail** è l'elemento identitario di NEXUM: la catena di pivot resta visibile e ogni passo è riapribile.
- **Rail e Inspector sono ridimensionabili e comprimibili.** Lo Stage prende tutto lo spazio libero.

### C.2 Identità visiva (approvata, D7)

| Elemento | Scelta |
|---|---|
| Tono | scuro, tecnico, piatto; separatori invece di scatole |
| Fondo / pannelli / rilievo | `#0D1012` / `#13171A` / `#1A1F23` |
| Linee | `#262C31` |
| Testo / testo secondario | `#D6DBDE` / `#8A949A` (contrasto ≥ 4,5:1 su tutti i fondi) |
| **Accento unico: selezione e fuoco** | ambra `#E0A640`: l'unico colore "caldo" dell'interfaccia |
| Interattivo (link, pivot) | blu desaturato `#79A7C9` |
| Famiglie di tipi | al massimo 6 tinte desaturate, assegnate da `display.family` in `vocab/` e mai scritte nel codice UI (esempio: luogo `#6E8797`, trasporto `#86A07A`, evento naturale `#C08064`, risposta `#9785B3`, sicurezza `#B39B5E`, altro `#77858B`) |
| Natura dell'elemento | **forma, non colore**: oggetto ■, evento ●, insight ◆; una relazione è una linea |
| Confidenza | opacità a tre fasce (debole 0,45 / media 0,7 / forte 1,0); ipotesi con contorno tratteggiato |
| Tipografia | `system-ui` 13 px per il testo denso; `ui-monospace` per ID, coordinate e numeri, con cifre tabulari |
| Movimento | solo transizioni funzionali ≤ 120 ms (pan verso la selezione); nessuna animazione decorativa, niente glow, gradienti, glassmorphism o sfondi "AI" |
| Wordmark | `NEXUM` in maiuscolo spaziato, con il motto nella schermata "Informazioni" e non nella barra |

---

## D. WORLD MODE

**Scopo:** il quadro globale con densità controllata, per passare in un clic dal globale al dettaglio.

### D.1 Composizione

- **Stage / MAP:**
  - fino a z 9: **aggregati** dalle celle del Core (`project_map` con LOD `aggregates`). Ogni cella è un simbolo quadrato proporzionale a √n, con il colore della famiglia dominante e un contorno ambra se contiene la selezione (`appears_as: in_cell`);
  - da z 10: **elementi singoli** (`refs`) nel viewport esatto;
  - clic su una cella: zoom sulla sua bbox reale, non su un elemento.
- **Rail:**
  - visibilità per tipo (i "layer") generata da `list_types`: raggruppata per famiglia, con conteggi dal vivo da `facets` nello Scope corrente;
  - filtri per natura della relazione, stato, fonte, confidenza minima.
- **Timeline strip:** densità per bucket dell'intero scope, con il pennello sulla finestra temporale, che è lo stesso `Scope.time_window` usato da tutte le viste.
- **Inspector: WORLD SUMMARY**, quando non c'è un fuoco:
  - conteggi per tipo nello Scope;
  - **insight rilevanti** nel viewport e nella finestra (`insights(scope)`, ordinati per confidenza, paginati da 50);
  - fonti con licenza e stato (`list_sources`: ok / degradata / sospesa, ultimo aggiornamento riuscito);
  - elementi esclusi (`excluded.no_geometry`), per esempio "1.842 elementi dello scope non hanno geometria: visibili in Graph, Timeline e Search".
- **Status bar:** `world_version`, stato delle fonti, budget effettivo dell'ultima risposta (per esempio "cella z6 · 412 celle · 28 ms"), attribuzioni obbligatorie delle fonti visibili.

### D.2 Regole

- **Mai l'intero mondo nel browser:** la mappa tiene al massimo 5.000 feature; lo store al massimo 20.000 riferimenti, con LRU e il fuoco e il trail sempre conservati.
- **Onestà del LOD:** se una risposta è troncata o aggregata, la UI lo dice nella status bar ("aggregato: livello 4 · troncato: sì"). I conteggi mostrati sono sempre quelli del Core.
- **Mondi senza geometria** (D3): la MAP non si nasconde né si svuota in silenzio. Mostra "Questo mondo non contiene elementi con geometria (0 su N)" e propone GRAPH come vista iniziale.
- **Vista iniziale (D8):** la MAP se il mondo ha geometrie, altrimenti il GRAPH sui membri dell'insight più recente con confidenza più alta.
- **Elementi non geografici, cittadini di prima classe (D8):** in un mondo misto la MAP resta la vista iniziale, ma gli elementi senza geometria sono raggiungibili da Search, Graph, Timeline, Object Mode e Insights con le stesse funzioni degli altri. La WORLD SUMMARY li conta ed elenca i loro insight; il loro OBJECT MODE è completo (con Geography "non applicabile"); nessuna funzione di NEXUM richiede una geometria, tranne la MAP stessa e le primitive spaziali.

---

## E. OBJECT MODE

**Ingresso:** clic su qualunque elemento, in qualunque vista. **Una chiamata:** `GET /context/{id}` (le otto sezioni del Core), più `/provenance/{id}` caricata quando si apre quella sezione.

### E.1 Sezioni dell'Inspector (12 richieste)

| # | Sezione | Contenuto | Operazione del Core |
|---|---|---|---|
| 1 | **Identity** | etichetta, ID stabile (copiabile), identificatori forti e deboli, alias | `context.focus` |
| 2 | **Type** | natura (oggetto/evento/relazione/insight), tipo, famiglia; regola e versione per gli insight | `context.focus` |
| 3 | **Properties** | proprietà con conflitti evidenziati ("2 valori da fonti diverse"); tempo con precisione e incertezza; severità | `context.focus` |
| 4 | **Sources** | fonti con licenza e attribuzione, ultimo aggiornamento | `context.sources` |
| 5 | **Evidence** | evidenze dirette, fonti indipendenti vs totali ("3 fonti indipendenti su 4 evidenze: il mirror non conta") | `context.evidence`, `evidence_of` |
| 6 | **Relations** | gruppi per tipo e natura con conteggi; per ogni relazione: estremo, confidenza, n. di evidenze e fonti indipendenti; accesso a **WHY** | `context.relations`, `relations` |
| 7 | **Related objects** | primi 25 per rilevanza più i conteggi per tipo; "altri N" pagina con cursore | `related_objects` |
| 8 | **Related events** | primi 25 per tempo e rilevanza più i conteggi per tipo | `related_events` |
| 9 | **Timeline** | mini-timeline del fuoco; "precedente/successivo" | `entity_timeline`, `timeline_step` |
| 10 | **Geography** | punto o geometria, luogo contenitore, elementi entro 100 km; se manca, **"non applicabile: l'elemento non ha geometria"** in modo esplicito | `context.geography`, `nearby`, `containing` |
| 11 | **Insights** | insight che includono il fuoco, compositi compresi, per confidenza; ciascuno con **WHY** | `context.insights` |
| 12 | **Provenance** | albero fuoco → evidenze → record → payload grezzo (`raw_id`, JSON path, hash, data di acquisizione) → fonte e licenza; "vedi record originale" estrae solo quel record | `provenance_chain`, `GET /raw/{raw_id}?path=` |

### E.2 Pivot e trail

- **Ogni riferimento è cliccabile e diventa il nuovo fuoco**, sia nell'Inspector sia nelle altre viste. Il trail aggiunge un passo `{ref, scope}` nel formato definito in Fase 1 (§21.3).
- Catena richiesta, senza passare per la home: **OBJECT → OBJECT → EVENT → INSIGHT → OBJECT**. Per esempio Myanmar → Mandalay International (VYMD) → terremoto M7.7 → insight R3 composito → Myanmar.
- `◀ ▶` e `[` `]` percorrono il trail; clic su un passo per riaprirlo; la cronologia del browser segue il trail tramite l'hash dell'URL.
- **Clic = SELECT + FOCUS coordinati (D9).** Map, Graph, Timeline e Object Mode usano lo stesso `ref.id` dallo store. **Il cambio di vista non perde la selezione**: passare da MAP a GRAPH (o a split, o ridimensionare fino al layout mobile) mantiene selezione, fuoco, Scope e trail; la nuova vista si posiziona sull'elemento selezionato (`locate`). L'hover mostra solo un'anteprima locale alla vista e non si propaga. Shift+clic aggiunge un secondo elemento, usato per "percorso tra due elementi".

### E.3 Trail persistente (D5)

- **WORLD DB = ciò che NEXUM conosce. TRAIL DB = il percorso investigativo dell'utente.** I trail vivono in `data/<world>/trails.sqlite`, un database separato dal mondo, scritto solo dal servizio API.
- Un trail è `{trail_id, name, created_ms, updated_ms, world_id, steps: [{ref, scope, added_ms, note?}]}`, cioè il formato della Fase 1 (§21.3) con metadati. I riferimenti sono ID stabili, non copie degli elementi.
- Il trail **non modifica** Objects, Events, Relations, Evidence o Insights: il servizio apre il WORLD DB in sola lettura anche quando scrive il TRAIL DB. `rebuild` del mondo non tocca i trail. Un riferimento che dopo un rebuild non esiste più viene mostrato come "non più presente".
- Endpoint: `GET /trails`, `GET /trails/{id}`, `PUT /trails/{id}`, `DELETE /trails/{id}`, `GET /trails/{id}/export` (JSON con formato e versione), `POST /trails/import`. Sono le uniche scritture del servizio, solo sul TRAIL DB.

---

## F. GRAPH MODE

### F.1 Funzioni

| Funzione | Comportamento | Operazione del Core |
|---|---|---|
| Nodo fuoco | il fuoco corrente, al centro, contorno ambra | — |
| Espansione del vicinato | profondità 1 di default; 2–3 su richiesta esplicita | `neighborhood(focus, depth ≤ 3)` |
| Profondità controllata | selettore 1/2/3 con stima del costo (conteggi dei gruppi) prima di espandere | `neighborhood` con LOD `counts` |
| Filtro per tipo di relazione | chip per tipo e natura (dallo Scope) | `Scope.types`, `Scope.natures` |
| Filtro temporale | la finestra della Timeline filtra archi ed eventi | `Scope.time_window` |
| Ispezione delle evidenze | clic su un arco: pannello con evidenze, fonti indipendenti, confidenza, **WHY** | `get_entity(rel)`, `evidence_of` |
| Espansione progressiva | doppio clic su un nodo: aggiunge i suoi vicini senza ridisegnare gli altri, che restano fermi | `neighborhood` / `expand` |
| **Protezione degli hub** | i gruppi oltre il budget diventano **nodi aggregati** ("+66.418 relazioni `located_in` → Paese"), mai migliaia di nodi | nodi aggregati del Core, cache dei gradi degli hub |
| Paginazione | un nodo aggregato si espande a pagine di 200 con cursore; "pagina successiva" o "mostra solo questi" | `expand(node, edge, cursor)` |
| Percorso tra due oggetti | fuoco più Shift+clic, poi "Percorso": cammino più breve ≤ 4 salti, evidenziato; "nessun percorso entro 4 salti" in modo esplicito | `path(a, b, max_hops ≤ 4)` |
| Pulizia | "tieni solo il cammino", "rimuovi i nodi non selezionati", "ricentra sul fuoco" | client |

### F.2 Limiti rigidi

- **Nel grafo visibile:** al massimo 2.000 nodi e 4.000 archi (i massimi del Core). Default 200 e 400.
- **Oltre il limite**, un'espansione è rifiutata dal client *prima* della richiesta, con un messaggio che propone di filtrare per tipo o finestra oppure di aprire un nodo aggregato.
- **Layout:** deterministico e incrementale (§B.3); i nodi esistenti non si spostano.
- Gli **insight** appaiono come nodi ◆ collegati ai loro membri (archi `insight_member`) solo se il filtro "insight" è attivo. Il default è attivo con profondità 1.

---

## G. TIMELINE

### G.1 Composizione (strip in basso, alta 120–220 px e ridimensionabile)

```
│ 2025 ── Q1 ────────── Q2 ────────── Q3 ──│  bucket: settimana ▾   finestra: 2025-03-01 → 2025-05-31  │
│ ▁▂▂▃▁▁▂█▇▃▂▁▁▂▁▁▁▂▁▁ (densità: eventi + insight nello Scope)                                    │
│ ●──────────────◆───────────────────────── (traccia del FUOCO: eventi e insight)                   │
│    ●  ●●        ●     ●                    (traccia dei CORRELATI, per tipo)                       │
│ [══════ pennello della finestra ══════]                                                          │
```

- **Densità e aggregazione:** `project_timeline(scope, bucket=auto)`. I bucket vengono dal Core (ora, giorno, settimana, mese, anno) e sono coerenti con le faccette (P34).
- **Tracce del fuoco e dei correlati:** `entity_timeline` e `timeline_neighbors(ref, window, hops)`, con l'incertezza temporale disegnata come segmento orizzontale.
- **Zoom temporale:** rotella o pizzico sull'asse; il bucket si adatta. Oltre il budget restano i bucket e mai gli elementi singoli.
- **Finestra:** il pennello imposta `Scope.time_window` per **tutte** le viste, con un debounce di 200 ms.
- **Sincronizzazione:** la selezione evidenzia l'elemento o il suo bucket (`highlight` → `appears_as: in_bucket`). Clic su un elemento della traccia: selezione e fuoco. Clic su un bucket: la finestra si restringe a quel bucket.
- **Tempo registrato vs tempo valido:** l'opzione "come noto al…" (`as_of_recorded`) è **nascosta di default** e compare in "avanzate".

---

## H. SEARCH

- **Posizione:** campo nella command bar (`/` per il focus), con un menù di risultati **raggruppati per natura e tipo**.
- **Esecuzione:** `search(q, scope)`. Richiede almeno 2 caratteri, debounce di 150 ms, canale `search` con annullamento delle richieste superate.
- **Onestà del ranking:** se il Core risponde `ranked: false` (termini molto comuni, Fase 1 §34), la UI dice "risultati non ordinati per rilevanza: N stimati, affina la ricerca".
- **Invio:** apre il primo risultato come fuoco. "Mostra nello scope" applica `Scope.text` a tutte le viste: mappa, grafo e timeline filtrati dallo stesso testo.
- **ID diretto:** incollare un ID stabile (`evt_…`, `obj_…`) apre direttamente il fuoco.
- **Non incluso:** ricerca semantica, fuzzy, suggerimenti AI.

---

## I. WHY THIS RELATION?

### I.1 Scopo

Rendere concreta la promessa "mostra perché quel nesso esiste" **senza nuova logica**: tutto ciò che la vista mostra è stato registrato dal Core al momento del calcolo, oppure è ricalcolabile in modo deterministico dai fattori memorizzati.

### I.2 Ingresso

Pulsante **WHY** su ogni insight e su ogni relazione: nell'Inspector, sugli archi del grafo e negli elenchi. Scorciatoia `W`. Si apre nell'Inspector come vista a sé, con "← torna all'elemento".

### I.3 Contenuto per un **insight**

| Blocco | Contenuto | Da dove |
|---|---|---|
| 1. Enunciato | spiegazione in linguaggio umano del Core, testualmente; banda di confidenza ("supporto medio 0,68") | `get_insight` |
| 2. Regola | ID, **versione**, tipo di output (association / context / composite / hypothesis); parametri effettivi (vincoli come `within_time 72 h`, `within_distance 150 km`, soglia di emissione, criteri di raggruppamento); se la versione non è più quella attiva, "versione archiviata" e parametri da `rules/archive/` | `rule_id`, `rule_version`, `correlate.load_rules` |
| 3. Membri | variabili del pattern → elementi, con ruolo, distanza, Δt, confidenza del membro; ognuno cliccabile come nuovo fuoco | `members` |
| 4. **Candidati considerati** | tabella dei candidati per la variabile raggruppata (ID, etichetta, severità, punteggio, distanza, Δt, gruppo) | `grouping_json.candidates` |
| 5. **Raggruppamento** | criteri di collegamento, gruppi con membri, **supporto del gruppo** e membro che lo fornisce, metodo (`max_member`) | `grouping_json.groups` |
| 6. **Rappresentante** | elemento scelto e motivo ("primo per severità decrescente, poi punteggio decrescente, tra i membri del gruppo") | `grouping_json.representative`, `representative_reason` |
| 7. **Scartati** | ogni candidato scartato con il motivo registrato ("membro del gruppo scelto, non rappresentante", "gruppo con supporto sotto soglia", ...) | `grouping_json.discarded` |
| 8. **Evidenze** | per ogni relazione e membro: evidenze, fonte, record, payload | `evidence_of`, `provenance_chain` |
| 9. **Fonti indipendenti** | gruppi di indipendenza con valore migliore per gruppo; fonti non indipendenti, come i mirror, mostrate barrate con il motivo | `confidence_factors` (metodo `independent_groups`) |
| 10. **Confidenza e fattori** | albero dei fattori: forza della relazione × membro meno sostenuto × fattori dei vincoli; per ogni evidenza, qualità della fonte × metodo × stato × completezza; formula mostrata e **ricalcolata nel browser** ("ricalcolato 0,682 = memorizzato 0,682 ✓") | `confidence_factors` e la stessa formula di `cf.recompute`, portata in TypeScript e verificata contro il Core |
| 11. Componenti (compositi) | per R3 e simili: gli insight componenti, ciascuno con il proprio WHY | `components` |
| 12. Avvertenza | sempre visibile: "Associazione: non indica un rapporto di causa." | testo fisso, soggetto al test P11 |

### I.4 Contenuto per una **relazione canonica**

Enunciato (from → tipo → to, natura), derivazione (asserita, calcolata, risolta per nome), evidenze raggruppate per gruppo di indipendenza, fonti, fattori (prodotto per evidenza, combinazione 1 − Π(1 − cᵍ) tra gruppi), catena di provenienza fino al record grezzo e, in senso inverso, **gli insight che la usano** (`supported`). I blocchi 4–7 non si applicano: una relazione non ha candidati; la UI lo dice e non lascia spazi vuoti.

### I.5 Lacune del Core emerse dall'analisi (decisione D1)

| # | Lacuna | Effetto su WHY | Proposta |
|---|---|---|---|
| L1 | `insight.grouping_json` è memorizzato dal motore ma **nessuna operazione di `Query` lo espone**: `get_insight` non lo restituisce | i blocchi 4–7 non sono raggiungibili dal contratto di query | **Risolta da D1 (approvata):** nuova funzione pubblica di sola lettura `Query.explain(ref)` nel Core (§I.6). Nessuna modifica ai metodi esistenti; 66 test e hash logico invariati. L'API non legge campi SQLite interni. |
| L2 | Per le regole **senza raggruppamento** (R1, R3, N1–N3) il Core registra solo il binding emesso, non gli altri candidati | "Candidati considerati" è disponibile solo per regole con `group` | La UI mostra "questa regola non raggruppa candidati: il binding emesso è l'unico registrato". Un *replay* deterministico della regola sull'ancora sarebbe possibile, ma rifletterebbe il mondo attuale e non quello del calcolo: **escluso dalla Fase 2** (§N). |
| L3 | Candidati e scartati sono limitati a 200 per insight (`[:200]` nel motore) | su gruppi enormi (D2) la lista è parziale | La UI dichiara "mostrati 200 candidati registrati su N". Nessun cambiamento. |

### I.6 `Query.explain(ref)` (D1)

Funzione pubblica, **sola lettura**, additiva. Accetta un ID di insight o di relazione. Restituisce nell'envelope comune i campi seguenti; ogni campo che la regola o l'elemento non possiede vale **`{"status": "not_recorded", "reason": "…"}`** oppure **`{"status": "not_applicable", "reason": "…"}`**, mai un valore inventato o ricostruito.

| Campo | Insight con raggruppamento (es. R2 v2) | Insight senza raggruppamento (R1, R3, N1–N3) | Relazione canonica |
|---|---|---|---|
| `rule` · `rule_version` | ID e versione; parametri dalla definizione caricata (attiva o archiviata) | idem | `not_applicable` (derivazione mostrata in `derivation`) |
| `candidates` | registrati (≤ 200, con `truncated`) | `not_recorded` | `not_applicable` |
| `candidate_groups` · `group_support` | gruppi, supporto e membro che lo fornisce | `not_recorded` | `not_applicable` |
| `representative` · `representative_reason` | registrati | `not_recorded` | `not_applicable` |
| `rejected_candidates` · `rejection_reasons` | registrati | `not_recorded` | `not_applicable` |
| `evidence` | membri con ruolo, distanza, Δt | idem | evidenze per gruppo di indipendenza |
| `independent_sources` | fonti/gruppi dei membri | idem | gruppi e valore migliore per gruppo |
| `confidence` · `confidence_factors` | valore e fattori espansi, con `recomputed` = `cf.recompute` | idem | idem |
| `components` | insight componenti (compositi) o lista vuota | idem | `not_applicable` |
| `explanation` | testo del Core | idem | enunciato "from → tipo → to" generato dai riferimenti |
| `limitations` | sempre presente: avvertenza sulla causalità più limiti noti (troncamento candidati, versione archiviata, regola senza raggruppamento, insight superato) | idem | idem |

Test specifici (in `tests/test_explain.py`): Myanmar R2 (candidati, gruppo, supporto 0,682, rappresentante M7.7, M6.7 scartata con motivo), R1 e N1 (`not_recorded` espliciti), relazione canonica, ID sconosciuto, parità `recomputed`, assenza di scritture (hash logico e `world_version` invariati dopo 1.000 chiamate).

---

## J. Contratto API Core → UI

### J.1 Convenzioni

- **Base:** percorso relativo `/api/v1` (in Fase 2 servito da `http://127.0.0.1:<porta>`), sola lettura sul mondo e `GET`, salvo `POST /trail/context` e gli endpoint dei trail, che scrivono solo sul TRAIL DB (§E.3).
- **Parametri:** `s` = Scope (JSON URL-encoded, lo stesso `Scope` del Core §22.2); `b` = Budget (JSON); `cursor`; `hl` = ID evidenziati, separati da virgole, al massimo 20.
- **Header di richiesta:** `X-Nexum-Channel`, `X-Nexum-Seq` (§A.4).
- **Risposta:** l'**envelope del Core** (§22.6 della Fase 1) invariato, più il blocco
  `"api": {"op", "channel", "seq", "deadline_ms", "cache": "hit|miss", "budget_applied": {…}}`.
- **ETag:** `W/"<world_version>-<hash dei parametri canonici>"`; una risposta 304 se non è cambiato nulla.
- **Errori:** `{"error": {"code", "message", "hint"}, "world_version"}`.

| HTTP | code | Quando |
|---|---|---|
| 400 | `invalid_scope` / `invalid_budget` / `missing_parameter` | JSON non valido, viewport mancante per la mappa, `q` troppo corta |
| 404 | `not_found` | ID sconosciuto (dopo un rebuild: "elemento non più presente") |
| 409 | `superseded` | richiesta superata sullo stesso canale |
| 429 | `busy` | coda piena |
| 503 | `world_unavailable` | DB assente o in ricostruzione |
| 504 | `deadline_exceeded` | scadenza superata; suggerisce come restringere lo Scope |

### J.2 Endpoint

Tutti i percorsi del Core coincidono con §22.5 della Fase 1. I default sono della UI; i massimi non superano quelli del Core.

| Endpoint | Operazione | Parametri obbligatori | Default → massimo | Scadenza |
|---|---|---|---|---|
| `GET /status` | meta del mondo: versione, estensione temporale, presenza di geometria, conteggi, salute delle fonti | — | — | 300 ms |
| `GET /types` · `GET /sources` | `list_types` · `list_sources` | — | — | 300 ms |
| `GET /facets` | `facets` | `s` | — | 800 ms |
| `GET /projections/map` | `project_map` | `s.viewport`, `s.z` | items 2.000 → 5.000 | 1.500 ms |
| `GET /projections/timeline` | `project_timeline` | `s.time_window` (altrimenti estensione da `/status`) | bucket ≤ 400; items 500 → 2.000 | 1.500 ms |
| `GET /search` | `search` | `q` (≥ 2 caratteri) | 50 → 200 | 800 ms |
| `GET /insights` | `insights` | — | 50 → 500, cursore | 1.000 ms |
| `GET /entities/{id}` | `get_entity` | — | `lod` | 500 ms |
| `GET /context/{id}` | `context` | — | 25 per sezione | 1.500 ms |
| `GET /entities/{id}/relations` · `/events` · `/objects` | `relations` · `related_events` · `related_objects` | — | 50 → 500, cursore | 1.000 ms |
| `GET /entities/{id}/evidence` · `/supports` · `/sources` | `evidence_of` · `supported` · `sources_of` | — | 100 → 1.000 | 1.000 ms |
| `GET /provenance/{id}` | `provenance_chain` | — | — | 1.500 ms |
| `GET /entities/{id}/timeline` · `/timeline/neighbors` · `/timeline/step` | `entity_timeline` · `timeline_neighbors` · `timeline_step` | finestra ≤ 10 anni; hops ≤ 2 | 200 → 1.000 | 1.500 ms |
| `GET /entities/{id}/spatial/nearby` · `/containing` · `/contained` | `nearby` · `containing` · `contained` | `km` ≤ 500 per `nearby` | 100 → 1.000, cursore | 1.500 ms |
| `GET /entities/{id}/locate` | `locate` | — | — | 500 ms |
| `GET /graph/neighborhood` | `neighborhood` | `focus` | depth 1 → 3; nodi 200 → 2.000; archi 400 → 4.000 | 2.000 ms |
| `GET /graph/expand` | `expand` | `node`, `edge_kind`, `type`, `dir` | pagina 200 → 1.000, cursore | 1.500 ms |
| `GET /graph/path` | `path` | `a`, `b` | `max_hops` 4 (massimo) | 3.000 ms |
| `GET /changes` | `changes_since` | `since` | 500 → 5.000 | 1.500 ms |
| `POST /trail/context` | `trail_context` | corpo con `trail` (≤ 50 passi) | — | 5.000 ms |
| `GET/PUT/DELETE /trails/{id}` · `GET /trails` · `GET /trails/{id}/export` · `POST /trails/import` | TRAIL DB (§E.3), non il mondo | corpo ≤ 1 MB, ≤ 500 passi | — | 1.000 ms |
| `GET /explain/{id}` | `explain` (§I.6) | — | candidati ≤ 200 | 2.000 ms |
| `GET /rules/{rule_id}?version=` | parametri della regola, attiva o archiviata | — | — | 300 ms |
| `GET /raw/{raw_id}?path=` | **solo il record** indicato dal JSON path, con hash e licenza | `path` | ≤ 256 kB | 1.500 ms |
| `GET /basemap/style.json` · `GET /basemap/{layer}.geojson` | provider della cartografia di base (§B.2), immutabile e in cache | — | ≤ 3 MB per layer | — |

### J.3 Tipi condivisi

- `EntityRef`, `Scope`, `Budget`, `Envelope<T>` e i DTO delle risposte sono descritti **una volta** in `nexum/api/contract.py` come dizionari dichiarativi, e rigenerati in `ui/src/contract.ts` da uno script di build.
- I **test di contratto**, lato Python, chiamano ogni endpoint su D1 e D3 e verificano la forma di ogni risposta rispetto al contratto: campi obbligatori, tipi, envelope completo, `bytes ≤ max_bytes`.

---

## K. Strategia per D2 e grandi dataset

| Rischio (D2: 1,05 M eventi, 2 M relazioni, 3,97 GB) | Contromisura |
|---|---|
| Richiesta accidentale di tutto il mondo | nessun endpoint senza limite: viewport obbligatorio per la mappa, finestra per la timeline, `q` per la ricerca, cursore per le liste; budget ridotti dall'API; `max_bytes` 2 MB di default e 10 MB al massimo, garantito dall'envelope del Core |
| Pan/zoom che accumula richieste | debounce di 120 ms; viewport agganciato alla griglia delle celle, così le richieste si ripetono e la cache funziona; un canale per vista; `AbortController` più interrupt SQLite lato server; pool limitato, 429 oltre la coda |
| Hub con più di 66.000 archi | nodi aggregati; espansione paginata da 200; stima dei conteggi prima di espandere; mai più di 2.000 nodi nel grafo |
| Timeline di 10 anni con 1 M di eventi | solo bucket aggregati (dalla tabella `agg` del Core) sopra il budget; elementi singoli solo in finestre piccole |
| Ricerca su termini comuni | pianificazione del Core; la UI dichiara quando i risultati non sono ordinati |
| Memoria del browser | ≤ 5.000 feature in mappa; ≤ 20.000 riferimenti nello store con LRU (fuoco e trail esclusi dall'espulsione); risposte vecchie scartate a ogni cambio di `world_version` |
| Memoria del servizio | 6 connessioni in sola lettura con `cache_size` ridotta a 64 MiB ciascuna (PRAGMA sulla connessione dell'API, non sul Core); obiettivo RSS ≤ 1,5 GB su D2 (benchmark A6) |
| Serializzazione | JSON compatto (`separators`), senza indentazione; gzip se il client lo accetta e la risposta supera 8 kB (stdlib `gzip`) |
| Cache ripetute | LRU di 256 risposte o 64 MB per `(op, parametri canonici, world_version)`; invalidata al cambio di versione |
| Dati D2 senza geometria (40%) | contati in `excluded.no_geometry` e visibili in Graph, Timeline e Search; la UI li dichiara |
| Mondo ricostruito mentre la UI è aperta | `changes_since` sotto il floor risponde `reset_required`: la UI ricarica le viste e mantiene il trail (gli ID sono stabili) |

---

## L. Desktop, tablet, mobile

**Principio:** desktop-first. Tablet e mobile sono **consultazione e pivot**, non analisi. Non si sacrifica la densità del desktop per avere una UI identica ovunque.

| Classe | Larghezza | Layout | Ridotto rispetto al desktop |
|---|---|---|---|
| **Desktop** | ≥ 1280 px (ottimizzato 1440–2560) | workspace completo: command bar, trail, rail, stage con split MAP+GRAPH, inspector, timeline, status bar | niente |
| **Tablet** | 768–1279 px | una vista nello stage (selettore MAP / GRAPH); rail come cassetto sopra lo stage; inspector come pannello laterale sovrapposto e comprimibile; timeline comprimibile a 48 px (solo densità) | niente split; budget di default dimezzati; target touch ≥ 40 px; pizzico e trascinamento su mappa, grafo e timeline |
| **Mobile** | < 768 px | **una vista per volta** con barra in basso: Mappa · Grafo · Tempo · Cerca · Fuoco; l'Inspector ("Fuoco") è a tutto schermo, a sezioni richiudibili; WHY a tutto schermo | grafo solo a profondità 1 e 100 nodi; mappa con 300 elementi; timeline a sola densità più traccia del fuoco; trail come menù |

- **Stessa applicazione e stesso store:** cambiano solo layout e budget di default, non il modello.
- **Accesso da tablet o telefono:** in Fase 2 il servizio ascolta **solo su 127.0.0.1** (D10); nessuna esposizione LAN o Internet. I layout tablet e mobile si verificano con i viewport emulati in Chrome sul Mac di sviluppo. La scelta non è incorporata nel modello applicativo: indirizzo di ascolto confinato nella configurazione del servizio, UI con URL relativi, nessuna identità o sessione legata a localhost. Il PWA installabile e la pubblicazione su `nexum.pezzaliapp.com` appartengono a una fase successiva con un modello di deployment diverso (§N).

---

## M. Dipendenze con licenze

Verificate sul registro npm il 2026-09-29. Pesi gzip misurati sui file distribuiti.

### M.1 Runtime (spedite al browser)

| Pacchetto | Versione | Licenza | Peso gzip | Ultima release | Dipendenze dirette | Necessità |
|---|---|---|---|---|---|---|
| `react` | 19.3.0 | MIT | 4,6 kB | 2026-09-09 | 0 | UI dichiarativa per i pannelli densi |
| `react-dom` (+ `scheduler` 0.28.0, MIT) | 19.3.0 | MIT | 110,5 + 2,5 kB | 2026-09-09 | 1 | idem |
| `maplibre-gl` | 6.11.2 | BSD-3-Clause | 149,5 kB JS + 10,5 kB CSS | 2026-09-24 | 18 | rendering WebGL della mappa; nessuna alternativa KISS equivalente |
| `sigma` | 3.0.3 | MIT | 47,2 kB | 2026-04-30 | 2 (`events` MIT, `graphology-utils` MIT) | grafo WebGL grande e progressivo |
| `graphology` | 0.26.0 | MIT | 13,9 kB | 2025-01-26 | 1 (`events`) | modello del grafo per Sigma |

- **Dipendenze transitive di MapLibre**, tutte verificate:
  - `@mapbox/point-geometry` ISC; `@mapbox/tiny-sdf` BSD-2; `@mapbox/unitbezier` BSD-2; `@mapbox/vector-tile` BSD-3;
  - `@maplibre/geojson-vt` ISC; `@maplibre/maplibre-gl-style-spec` ISC; `@maplibre/mlt` MIT OR Apache-2.0; `@maplibre/vt-pbf` MIT;
  - `@types/geojson` MIT; `bidi-js` MIT; `earcut` ISC; `gl-matrix` MIT; `kdbush` ISC; `murmurhash-js` MIT;
  - `pbf` BSD-3; `potpack` ISC; `quickselect` ISC; `tinyqueue` ISC.
- **Totale stimato del bundle iniziale:** circa 340 kB gzip di librerie più il codice NEXUM. Obiettivo ≤ 600 kB gzip (B-U8).

### M.2 Solo sviluppo

| Pacchetto | Versione | Licenza | Uso |
|---|---|---|---|
| `vite` | 8.3.1 | MIT | build |
| `@vitejs/plugin-react` | 6.1.1 | MIT | JSX e refresh |
| `typescript` | 7.0.2 | Apache-2.0 | tipi |
| `@playwright/test` | 1.63.0 | Apache-2.0 | E2E e benchmark UI |

### M.3 Esclusi dopo la valutazione

`next` (184,8 MB, server Node non necessario), `graphology-layout-forceatlas2` (nessun force-layout in Fase 2, D3), `cytoscape` (136 kB gzip, più lento su grafi grandi), `deck.gl`, `@cosmos.gl/graph`, `@tanstack/react-virtual`, `vitest`, librerie di stato, router, set di icone, web font, `pmtiles` (utile solo con basemap vettoriali in tile: non servono in Fase 2).

### M.4 Governance delle dipendenze

- `package-lock.json` versionato e installazione con `npm ci`.
- **Versionati (D11):** sorgenti UI, configurazione (Vite, TypeScript, Playwright), lockfile, script di build e di test. **Non versionati:** `ui/dist`, `node_modules`, report e screenshot generati (sotto `data/`, già ignorato).
- **Allowlist delle licenze** verificata da uno script sull'intero albero installato: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, "MIT OR Apache-2.0". Qualunque altra licenza fa fallire il criterio W2.
- Nessuna dipendenza aggiunta senza approvazione. È una condizione di STOP, come in Fase 1.
- Python: **nessuna nuova dipendenza** (stdlib: `http.server`, `json`, `gzip`, `sqlite3`, `threading`).

---

## N. Esclusioni deliberate dalla Fase 2

| Escluso | Motivo o fase |
|---|---|
| Deploy, DNS, hosting su `nexum.pezzaliapp.com` | decisione della Fase 1; da decidere in una fase successiva |
| PWA installabile e service worker offline | con il deploy |
| Autenticazione, utenti, collaborazione | servizio locale mono-utente |
| Scritture sul mondo: annotazioni, correzioni manuali, relazioni create a mano, conferma o rifiuto di insight | cambiano il modello di provenienza; richiedono una specifica dedicata |
| Editor di regole nella UI | le regole restano file TOML versionati |
| Replay o simulazione delle regole ("cosa succederebbe se") | vedi L2; rischio di confondere il mondo attuale con quello del calcolo |
| Nuove fonti o connettori | la Fase 2 è solo interfaccia |
| Demone di polling automatico delle fonti | resta la CLI schedulata esternamente; la UI mostra solo lo stato |
| Globo 3D, terreno, immagini satellitari, tile esterni | costo, dipendenze, fonti non registrate |
| Strumenti di disegno e misura liberi sulla mappa | c'è solo il raggio `nearby` dal fuoco |
| Esportazione di report (PDF, DOCX) | fase successiva |
| Notifiche, allarmi, regole "live" | fuori scopo |
| LLM, riassunti automatici, ricerca semantica | vincolo del progetto |
| Accesso di rete oltre `127.0.0.1` di default | vedi D10 |
| Localizzazione oltre l'italiano | stringhe centralizzate in un catalogo, così l'inglese si potrà aggiungere dopo |

---

## O. Criteri PASS/FAIL — CONGELATI (2026-09-29, D12)

Numerazione W (workspace). **Tutti obbligatori.** La Fase 2 è completata solo se W1–W32 sono tutti PASS. Ogni criterio ha un test automatico, salvo dove indicato come verifica visiva documentata (screenshot conservati in `data/reports/phase2/`).

Dopo il congelamento non si abbassano soglie, non si eliminano test falliti, non si modificano benchmark o dataset per ottenere PASS, non si aumentano i response budget per nascondere problemi e non si riduce D2. Se un requisito si dimostra tecnicamente errato: STOP → documentazione → richiesta di approvazione.

### O.1 Vincoli e architettura

| # | Criterio | PASS se |
|---|---|---|
| W1 | Core invariato salvo D1 | `git diff 7c62b6b -- nexum/core` contiene **solo** l'aggiunta di `Query.explain` (e helper privati nuovi usati solo da essa); nessuna riga esistente modificata nei metodi della Fase 1; i 66 test della Fase 1 passano; hash logico e `world_version` di D1 identici prima e dopo 1.000 chiamate a `explain` e dopo l'intera suite della Fase 2 |
| W2 | Dipendenze | albero npm installato = solo i pacchetti di §M e i loro transitivi; 0 licenze fuori allowlist (script sull'albero `node_modules`); 0 nuove dipendenze Python (import solo da stdlib e `nexum`) |
| W3 | Local-first | durante l'intero scenario E2E, **0 richieste verso host diversi da 127.0.0.1** (intercettazione di tutte le richieste del browser) |
| W4 | Superficie di rete | socket in ascolto solo su 127.0.0.1; richieste con header `Host` non locale → 421/400; nessun header `Access-Control-Allow-*` nelle risposte |
| W5 | Budget garantiti | fuzzing di 2.000 richieste casuali (seed fisso) su tutti gli endpoint e su D1, D2, D3: 0 risposte oltre `max_bytes`, 0 liste oltre il limite dichiarato, 100% delle risposte 2xx con envelope completo, 0 errori 500 |
| W6 | Richieste illimitate impossibili | mappa senza viewport o `z`, timeline di un'entità oltre 10 anni, `path` oltre 4 salti, `depth` oltre 3, budget oltre il massimo, `q` sotto 2 caratteri: rifiutati (4xx) o ridotti con la riduzione dichiarata in `api.budget_applied` |
| W7 | Cancellazione | sequenza di 50 pan rapidi (intervallo 30 ms) su D2: ≥ 90% delle richieste superate interrotte sul server o mai avviate (log del servizio) |
| W8 | Offline | con l'accesso di rete esterno bloccato nel browser (solo 127.0.0.1 ammesso), lo scenario E2E completo passa |
| W9 | Nessun dominio in UI e API | 0 termini della lista di P28 in `nexum/api` e `ui/src`; tipi, colori ed etichette di legenda vengono da `list_types`/`display` |
| W10 | Nessun materiale OSIRIS o Palantir | 0 file, icone, testi o stili copiati (confronto per hash e per righe con OSIRIS-REFERENCE, come P25) |
| W11 | Autore | tutti i commit di Alessandro Pezzali, 0 trailer di coautori |
| W12 | Nessuna regressione | suite (66 test) e benchmark bloccanti della Fase 1 ancora PASS da ambiente pulito |

### O.2 Modello e viste

| # | Criterio | PASS se |
|---|---|---|
| W13 | **Linked selection** | per 50 elementi di tutte le nature (D1 e D3, lista fissa), selezionare in una qualunque vista porta MAP, GRAPH, TIMELINE e INSPECTOR sullo **stesso `ref.id`** (`data-ref` nel DOM e stato dello store); se l'elemento è dentro un aggregato la vista indica cella, bucket o nodo aggregato; se la vista non è applicabile (senza geometria/tempo) lo dichiara |
| W14 | **Nessuna copia indipendente; selezione conservata** | test dello store: ogni entità una sola volta in `entities`; le viste conservano solo ID; un aggiornamento si riflette in tutte le viste. Il cambio di vista (MAP → GRAPH → split → layout mobile e ritorno) mantiene selezione, fuoco, Scope e trail (D9) |
| W15 | OBJECT MODE completo | le 12 sezioni di §E.1 presenti per oggetto, evento, relazione e insight; "non applicabile" esplicito dove serve |
| W16 | **Percorso d'indagine completo (Myanmar)** | in una sola sessione, senza ricaricare la pagina né passare dalla home: aprire NEXUM → vedere il mondo → individuare il Myanmar (mappa o ricerca) → selezionarlo → OBJECT MODE → relazioni → pivot OBJECT → OBJECT → EVENT → INSIGHT → OBJECT (Myanmar → VYMD → M7.7 → insight → Myanmar) → timeline del fuoco → WHY THIS RELATION? → evidenze → fonti e record grezzo → cambio di fuoco → prosecuzione; trail di ≥ 5 passi percorribile con ◀ ▶ |
| W17 | Catena D3 e mondo misto | la catena di §28.4 della Fase 1 nel mondo D3; la MAP dichiara 0 geometrie e la vista iniziale è GRAPH. Nel mondo misto: vista iniziale MAP e gli elementi D3 raggiungibili da Search, Graph, Timeline, Object Mode e Insights (D8) |
| W18 | **WHY Myanmar (R2 v2) via `explain`** | regola `r2_event_event_association` v2, criteri 72 h / 150 km, 2 candidati, 1 gruppo, supporto 0,682 dalla M6.7, rappresentante M7.7 con motivo, M6.7 tra gli scartati con motivo, fattori, spiegazione e avvertenza; confidenza **ricalcolata nel browser = memorizzata**; test Python di `explain` con gli stessi valori |
| W19 | WHY senza raggruppamento (N1 e R1) | N1: 3 fonti indipendenti, mirror non indipendente, campi di raggruppamento `not_recorded` espliciti (API e UI); R1: stesso comportamento; nessun valore inventato |
| W20 | WHY relazione canonica | per 20 relazioni (D1 e D3, lista fissa): evidenze per gruppo, fattori, provenienza fino al record grezzo, insight che la usano; campi di regola `not_applicable` |
| W21 | Parità della confidenza | la formula TypeScript riproduce `cf.recompute` su 1.000 fattori campionati (seed fisso) da D1, D2 e D3 con tolleranza 1e-12 |
| W22 | Linguaggio | 0 termini causali o probabilistici (liste di P11 e P35) nel catalogo delle stringhe UI |
| W23 | Coerenza numerica | per 100 Scope campionati: conteggi di celle, bucket, faccette e liste mostrati = quelli del Core |
| W24 | Attribuzioni | ogni fonte che contribuisce a ciò che è visibile compare con la sua attribuzione nel 100% degli stati dello scenario E2E |
| W25 | Grafo: protezione hub | su un hub D2: 0 render oltre `max_nodes`; nodo aggregato con conteggio esatto; paginazione con cursore fino a 5 pagine senza duplicati; layout identico per lo stesso contesto (due render → stesse coordinate) |
| W26 | Grafo: percorso | `path` nella UI = `path` del Core su 30 coppie; "nessun percorso" esplicito quando serve |
| W27 | Timeline sincronizzata | il pennello aggiorna lo Scope di tutte le viste; la selezione evidenzia elemento o bucket; conteggi dei bucket = Core |
| W28 | LOD della mappa | z ≤ 9 aggregati quando lo Scope supera il budget, z ≥ 10 elementi singoli; mai oltre 5.000 feature nelle sorgenti della mappa; mai oltre 20.000 riferimenti nello store |
| W29 | Responsive e **verifica visiva** | automatico: nei viewport 1920×1080, 1440×900, 1280×800, tablet 1024×768 e telefono 390×844 lo scenario "cerca → fuoco → WHY → pivot" è completabile; 0 overflow orizzontale del documento; 0 controlli interattivi tagliati fuori dal viewport; target ≥ 40 px nei layout touch. **Visivo:** screenshot di ogni vista principale nelle 5 dimensioni, esaminati con la checklist leggibilità · sovrapposizioni · pannelli tagliati · overflow · densità · controlli di mappa, grafo e timeline · selezione · fuoco · WHY · pivot; 0 difetti bloccanti aperti. Smoke test manuale su Safari se possibile (non bloccante, D6) |
| W30 | Leggibilità e tastiera | contrasto testo/fondo ≥ 4,5:1 per tutti i token (script); focus visibile; Inspector, liste e trail navigabili da tastiera |
| W31 | Trail persistenti (D5) | sopravvivono a riavvio del servizio e a rebuild del mondo; riferimenti scomparsi indicati come "non più presenti"; export JSON reimportabile identico; hash logico del mondo invariato dopo 100 operazioni sui trail |
| W32 | Benchmark | tutti i benchmark bloccanti di §P PASS |

---

## P. Benchmark API e UI — CONGELATI (2026-09-29, D12)

**Condizioni comuni.**

- **Macchina:** Mac di sviluppo (Mac17,2, Apple M5, 24 GB, macOS), alimentazione collegata, nessun altro carico pesante.
- **Dati:** mondi già costruiti da ambiente pulito con la pipeline della Fase 1: D1 reale, D2 (1,05 M eventi, 2 M relazioni, dimensione piena), D3.
- **Servizio:** avviato a freddo per ogni gruppo di benchmark, configurazione di default (6 worker).
- **API:** misurate da `bench/phase2/api_bench.py` con `http.client` (stdlib) come tempo di andata e ritorno lato client. 5 richieste di riscaldamento escluse. p95 per rango più vicino.
- **UI:** misurate da Playwright con il Chrome installato (`channel: "chrome"`), finestra **headed** 1440×900, DPR del display; build di produzione (`vite build`). Tempi da Performance API (`performance.mark/measure`) instrumentati nell'app, frame da `requestAnimationFrame`, memoria da CDP (`HeapProfiler.collectGarbage` e poi `Runtime.getHeapUsage`).
- **Liste fisse:** ID, centri, termini e scenari sono generati con seed fisso e salvati in `bench/phase2/fixtures.json` **prima** della prima misura.
- **Esito:** ogni benchmark è PASS se la condizione è vera sulla misura del run ufficiale da ambiente pulito; FAIL altrimenti. I bloccanti entrano in W32.

### P.1 API

| # | Dataset | Operazione | Misura | Soglia | Metodo | PASS se | Bloccante |
|---|---|---|---|---|---|---|---|
| A1 | D1 e D2 | `get_entity`, `context`, `project_map` (z 4), `search`, `neighborhood`, `insights` con budget di default | overhead dell'API: p95 HTTP − p95 della stessa chiamata diretta a `Query` nello stesso processo di bench | ≤ 15 ms | 50 ripetizioni per operazione e per mondo, 10 ID/Scope fissi | per **ogni** operazione e mondo overhead ≤ 15 ms | sì |
| A2 | D2 | `GET /projections/map` | tempo di andata e ritorno | p95 ≤ 150 ms | sequenza z 2 → 5 → 8 → 11 → 14 su 10 centri fissi, viewport di 1440×900 px, budget UI (2.000); 50 sequenze = 250 richieste | p95 ≤ 150 ms | sì |
| A3 | D2 | `GET /context/{id}` sui 10 hub | tempo di andata e ritorno | p95 ≤ 200 ms | 50 ripetizioni per hub (500 richieste) | p95 ≤ 200 ms | sì |
| A4 | D2 | `GET /graph/expand` pagina da 200 | tempo di andata e ritorno | p95 ≤ 100 ms | 10 hub × prime 5 pagine con cursore × 10 ripetizioni | p95 ≤ 100 ms | sì |
| A5 | D2 | cancellazione: richiesta costosa sul canale X, poi richiesta più recente sullo stesso canale dopo 20 ms | tempo dall'arrivo della richiesta più recente alla terminazione di quella superata (timestamp del servizio) | p95 ≤ 50 ms | 50 prove con richieste costose fisse (timeline e mappa senza aggregati a scope ampio) | p95 ≤ 50 ms | sì |
| A6 | D2 | scenario API di 30 minuti (mix di A2, A3, A4, A9, `explain`, timeline) | **emendato il 2026-09-29 (approvato dall'autore):** Σ `phys_footprint` di tutti i processi del servizio (`footprint`, campionato ogni 5 s); riportati senza soglia: Σ RSS, pagine di file mappate, page cache del file del database contata una volta (`mincore`). *Metodo originale: RSS massimo del processo servizio (`ps -o rss`)* | ≤ 1,5 GB | scenario ciclico con fixture fisse | massimo campionato ≤ 1,5 GB | sì |
| A7 | D2 | 4 canali concorrenti (map, timeline, search, graph) | p95 di ciascun canale in concorrenza vs isolato | ≤ 2× | 4 thread client, 200 richieste per canale; poi lo stesso mix per canale da solo | per ogni canale p95 concorrente ≤ 2 × p95 isolato | sì |
| A8 | D1 | `GET /explain/{id}` | tempo di andata e ritorno | p95 ≤ 100 ms | i 35 insight R2 × 10 ripetizioni | p95 ≤ 100 ms | sì |
| A9 | D2 | `GET /search` a ogni carattere | tempo di andata e ritorno | p95 ≤ 150 ms | 10 termini fissi estratti con seed dalle etichette di D2, digitati carattere per carattere dal 2°, senza debounce | p95 ≤ 150 ms | sì |
| A10 | D1 | `GET /raw/{raw_id}?path=` | tempo di andata e ritorno | ≤ 800 ms | 50 locator di evidenze fissi, incluso il payload USGS più grande | informativo: si riporta il valore | no |

### P.2 UI

| # | Dataset | Operazione | Misura | Soglia | Metodo | PASS se | Bloccante |
|---|---|---|---|---|---|---|---|
| U1 | D1 / D2 | avvio a freddo | da `navigationStart` al mark `nexum:ready` (mappa idle con i primi dati del mondo disegnati) | p95 ≤ 2,0 s / ≤ 3,0 s | 20 avvii per mondo, contesto browser nuovo, cache disabilitata | entrambe le soglie rispettate | sì |
| U2 | D1 | propagazione della selezione, dati in cache | dal clic al commit dell'evidenziazione in tutte e 4 le viste (mark per vista) | p95 ≤ 100 ms | 100 selezioni da una lista fissa, secondo passaggio (cache calda) | p95 ≤ 100 ms | sì |
| U3 | D1 / D2 | pivot | dal clic su un riferimento nell'Inspector a tutte le sezioni di OBJECT MODE disegnate | p95 ≤ 300 ms / ≤ 450 ms | 50 pivot fissi per mondo, cache fredda per elemento | entrambe le soglie rispettate | sì |
| U4 | D2 | pan della mappa | fps da `requestAnimationFrame` | mediana ≥ 50 fps e 5° percentile ≥ 30 fps | trascinamento scriptato di 20 s a z 10–11 in un'area fissa con ≥ 4.000 feature nella sorgente (verificato) | entrambe le condizioni vere | sì |
| U5 | D2 | grafo da 2.000 nodi e 4.000 archi | (a) dall'arrivo dei dati al primo frame Sigma; (b) fps durante 10 s di pan e zoom scriptati | (a) ≤ 1,0 s; (b) mediana ≥ 30 fps | vicinato di profondità 2 di un hub fisso con budget massimo; 10 ripetizioni per (a) | (a) p95 ≤ 1,0 s e (b) vere | sì |
| U6 | D2 | ridisegno della timeline durante il pennello | durata di ogni disegno (measure attorno alla funzione di draw) | p95 ≤ 16 ms | 400 bucket; 5 s di trascinamento scriptato del pennello | p95 ≤ 16 ms | sì |
| U7 | D1 | apertura di WHY | dal clic su WHY a vista completa disegnata | p95 ≤ 300 ms | 35 insight R2 × 3 ripetizioni | p95 ≤ 300 ms | sì |
| U8 | build | peso del JavaScript | gzip (livello 9) dei file JS iniziali (entry e import statici dal manifest Vite) / di tutti i file JS di `dist` | ≤ 600 kB / ≤ 900 kB | script su `ui/dist` dopo `vite build` | entrambe le soglie rispettate | sì |
| U9 | D2 | scenario di 200 passi (pivot, pan, espansioni, ricerche) | heap JS dopo GC forzato al passo 100 e al passo 200 | ≤ 300 MB al passo 200; crescita 100 → 200 ≤ 10% | scenario fisso scriptato | entrambe le condizioni vere | sì |
| U10 | D2 (clone APFS `cp -c` del DB) | aggiornamento dopo un cambio di `world_version` | da `/status` con versione nuova alle viste aggiornate via `changes_since` | ≤ 500 ms | 1.000 modifiche ingerite con lo stesso metodo di B25; 10 ripetizioni | informativo: si riporta il valore | no |

---

## Q. Wireframe testuali

I numeri nei wireframe sono illustrativi, tranne quelli dell’esempio Myanmar (§Q.3), che sono i valori reali della Fase 1.

### Q.1 WORLD MODE: desktop, D1, nessun fuoco

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NEXUM  │ ⌕ Cerca oggetti, eventi, ID…                │ Tipi 9/12 ▾ │ 2025-01 → 2025-09 ▾ │ Conf ≥ 0,5 ▾ │ v 18.204 · fonti 4/4 ● │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Trail: —                                                                                                │
├──────────────┬─────────────────────────────────────────────────────────────────┬────────────────────────┤
│ LUOGHI       │ [ MAP ]  GRAPH   MAP+GRAPH                          z 3 · celle │ QUADRO DELLO SCOPE     │
│ ■ Paese  242 │                                                                 │ Oggetti       86.377   │
│ TRASPORTO    │        ░░                ▪3                                     │ Eventi         4.112   │
│ ■ Aeroporto  │      ░░░░░   ▪12      ▪41   ▫                                   │ Insight          183   │
│   86.135     │     ░░░░░░░       ▪7          ▪156                              │ Senza geometria    0   │
│ EVENTI NAT.  │       ░░░        ▪88     ▪9      ▫▫                             │────────────────────────│
│ ● Terremoto  │                        ▪230                                     │ INSIGHT RILEVANTI      │
│   3.311      │         ▪4                 ▪61                                  │ ◆ 0,68 EMSR798 ↔ M7,7  │
│ RISPOSTA     │                                   ▪19                           │ ◆ 0,62 EMSR… ↔ M6,…    │
│ ● Attivaz.   │                                                                 │ ◆ 0,38 Composito Mya…  │
│   801        │                                                                 │   … altri 180 ›        │
│──────────────│                                                                 │────────────────────────│
│ Natura rel.  │                                                                 │ FONTI                  │
│ Stato        │                                                                 │ ● USGS   pubblico dom. │
│ Fonti        │                                                                 │ ● Copernicus EMS ©EU   │
│ Confidenza   │                                          ⊕ ⊖  ⌖                 │ ● OurAirports  ● NatE. │
├──────────────┴─────────────────────────────────────────────────────────────────┴────────────────────────┤
│ 2025 ▁▂▂▃▁▁▂█▇▃▂▁▁▂▁▁▁▂▁▁▂▃▂▁ │ bucket: settimana │ [═════════════ finestra ═════════════]             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ aggregato liv. 4 · 412 celle · 28 ms │ Dati: USGS; © European Union, Copernicus EMS; OurAirports; Natural Earth │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Q.2 OBJECT MODE: evento come fuoco, split MAP+GRAPH

```
├ Trail: Myanmar › Mandalay Intl (VYMD) › ● M7,7 us7000pn9s                                     ◀ ▶ ─────┤
├──────┬──────────────────────────────┬──────────────────────────────┬─────────────────────────────────────┤
│ rail │ MAP              z 7 · refs  │ GRAPH  prof. 1 · 23 nodi     │ ● EVENTO · terremoto                │
│  «   │                              │                              │ M7,7 — Myanmar      evt_7Q… ⧉      │
│      │      ■VYHH                   │   ■ Myanmar ── located_in    │ 2025-03-28 06:20:52 UTC ±0 s        │
│      │         ●M6,7                │      │                       │ supporto forte (0,95)               │
│      │   ■VYMD  ◉M7,7               │   ◉ M7,7 ──◆ R2 0,68 ── ● EMSR798│ ─ Proprietà                     │
│      │         ■VYNT                │      │  └─◆ R1 0,38 ── ■ ×5 aerop.│   magnitudo 7,7 · profondità 10 km│
│      │                              │      └──◆ R3 0,38             │ ─ Fonti (1)  USGS · pubbl. dominio │
│      │  ◌ 300 km (R1)               │   [+ 18 terremoti entro 150km]│ ─ Evidenze (1) · 1 fonte indip.   │
│      │                              │                              │ ─ Relazioni (2 gruppi)              │
│      │                              │                              │   location → Myanmar            ›   │
│      │                              │                              │ ─ Oggetti correlati (6) ›           │
│      │                              │                              │ ─ Eventi correlati (19) ›           │
│      │                              │                              │ ─ Geografia: in Myanmar · 5 aerop.  │
│      │                              │                              │ ─ Insight (3)                       │
│      │                              │                              │   ◆ 0,68 R2 v2 EMSR798   [WHY]      │
│      │                              │                              │   ◆ 0,38 R1 v1 5 aeroporti [WHY]    │
│      │                              │                              │ ─ Provenienza ›                     │
├──────┴──────────────────────────────┴──────────────────────────────┴─────────────────────────────────────┤
│ 2025-03 ▁▁▁█▅▂▁▁ │ ◉──◆──────● (fuoco) │  ● ●● ●  ● (correlati) │ [══ 2025-03-20 → 2025-04-10 ══]           │
```

### Q.3 WHY THIS RELATION?: insight R2 Myanmar

```
┌ ← M7,7 us7000pn9s                                     WHY THIS RELATION? ┐
│ ◆ ASSOCIAZIONE · regola r2_event_event_association · v2 (attiva)          │
│ «L'attivazione Copernicus EMS EMSR798 (earthquake, Myanmar/Burma) è       │
│  avvenuta 3 h 21 min dopo il terremoto M7,7 us7000pn9s … a 44,8 km …»     │
│ supporto medio 0,68                                                       │
│ ⚠ Associazione: non indica un rapporto di causa.                          │
├─ REGOLA ──────────────────────────────────────────────────────────────────┤
│ within_time ≤ 72 h dopo · within_distance ≤ 150 km · soglia 0,50          │
│ raggruppamento: 72 h / 150 km · supporto max_member · rappr. severità ↓   │
├─ CANDIDATI CONSIDERATI (2) ───────────────────────────────────────────────┤
│  grp  elemento        severità  punteggio  distanza   Δt                  │
│  0    ◉ M7,7 us7000…   0,74      0,602      44,8 km   3 h 21 min  RAPPR.  │
│  0    ● M6,7 us7000…   0,54      0,682      11,2 km   …           SUPP.   │
├─ RAGGRUPPAMENTO ──────────────────────────────────────────────────────────┤
│ 1 gruppo · supporto 0,682 fornito da M6,7 · rappresentante M7,7           │
│ motivo: primo per severità decrescente, punteggio decrescente             │
├─ SCARTATI (1) ────────────────────────────────────────────────────────────┤
│ ● M6,7 — membro del gruppo scelto, non rappresentante                     │
├─ CONFIDENZA ──────────────────────────────────────────────────────────────┤
│ 0,682 = forza 0,80 × membro meno sostenuto 0,90 × within_distance 0,96    │
│         × within_time 0,98 …          ricalcolato 0,682 = memorizzato ✓   │
├─ EVIDENZE E FONTI INDIPENDENTI (2 gruppi) ────────────────────────────────┤
│ USGS · pubblico dominio  › record $.features[79] · raw 01J… · sha 3f…     │
│ Copernicus EMS · © EU    › record $.results[145] · raw 01J… · sha 9a…     │
├─ USATA DA ────────────────────────────────────────────────────────────────┤
│ ◆ R3 composito Myanmar (0,38) [WHY]                                       │
└───────────────────────────────────────────────────────────────────────────┘
```

### Q.4 GRAPH MODE: hub protetto (D2)

```
│ GRAPH  fuoco: HUB-07 · prof. 1 · 201 nodi / 400 archi (budget)   filtri: related_to ✓ part_of ✓ │
│                                                                                                   │
│              ● e1   ● e2   ● e3            ┌──────────────────────────────┐                       │
│                 ╲    │    ╱                │ ⊞ +66.418 related_to → evento │ ← nodo aggregato       │
│        ■ o7 ──── ◉ HUB-07 ────────────────│   pagina 1/333 ▸  filtra ▾    │                       │
│                 ╱    │    ╲                └──────────────────────────────┘                       │
│              ■ o9   ● e4   ◆ ins                                                                   │
│ [Percorso verso…]  [Tieni solo il cammino]  [Ricentra]  layout: deterministico ▾                  │
```

### Q.5 Mobile: fuoco

```
┌──────────────────────────┐
│ ‹  ● M7,7 — Myanmar    ⋯ │
│ 2025-03-28 06:20 UTC     │
│ supporto forte (0,95)    │
│ ▸ Proprietà              │
│ ▸ Fonti (1)              │
│ ▸ Relazioni (2)          │
│ ▾ Insight (3)            │
│   ◆ 0,68 R2 · EMSR798 WHY│
│   ◆ 0,38 R1 · 5 aerop. WHY│
│ ▸ Provenienza            │
├──────────────────────────┤
│ Mappa Grafo Tempo Cerca ●│
└──────────────────────────┘
```

---

## R. Decisioni dell'autore (approvate il 2026-09-29)

| # | Decisione | Esito e vincoli |
|---|---|---|
| **D1** | Esposizione del raggruppamento | **Approvata con vincolo.** Funzione pubblica di sola lettura `Query.explain(ref)` nel Core (§I.6). L'API non legge campi interni SQLite che appartengono semanticamente al Core. Campi assenti restituiti come `not_recorded`/`not_applicable`, mai inventati. Significato e risultati della Fase 1 invariati. Test specifici, Myanmar incluso. |
| **D2** | Stack UI | **Approvata.** React + Vite + TypeScript, architettura semplice e client-side. Niente Next.js. |
| **D3** | Grafo | **Approvata.** Sigma.js + Graphology. Layout normale deterministico e stabile per lo stesso contesto. **Nessun force-layout automatico in Fase 2**; interfaccia `LayoutStrategy` pronta per una futura modalità esplicita "Explore layout". |
| **D4** | Cartografia | **Approvata con precisazione.** Natural Earth come basemap offline iniziale. Etichette HTML ammesse in Fase 2 come soluzione non permanente. MapLibre indipendente da come viene fornita la basemap (provider e stile, §B.2); nessun servizio cartografico esterno obbligatorio. |
| **D5** | Trail | **Approvata.** DB separato: WORLD DB = ciò che NEXUM conosce; TRAIL DB = percorso investigativo dell'utente. Export JSON. Il trail non modifica il mondo (§E.3). |
| **D6** | Browser di test | **Approvata.** Chrome installato come browser principale dei test automatici. Smoke test manuali su Safari/WebKit a fine fase, se possibile, senza dipendenze o infrastruttura aggiuntive. |
| **D7** | Identità visiva | **Approvata.** Interfaccia scura, un solo accento ambra, tipografia semplice e leggibile; niente gradienti decorativi, glassmorphism, estetica "AI", dashboard di card o animazioni decorative. La densità viene dai dati. |
| **D8** | Vista iniziale | **Approvata.** Con geometrie → MAP; senza → GRAPH. Nei mondi misti gli elementi non geografici restano cittadini di prima classe (§D.2). |
| **D9** | Clic | **Approvata.** Clic = SELECT + FOCUS coordinati, stesso ref in tutte le viste; il cambio di vista non perde la selezione. |
| **D10** | Rete | **Approvata per la Fase 2.** Solo 127.0.0.1, nessuna esposizione LAN/Internet. Scelta non incorporata nel modello applicativo; la pubblicazione su nexum.pezzaliapp.com è di una fase successiva. |
| **D11** | Artefatti | **Approvata.** Versionati sorgenti, configurazione, lockfile e script di build; non versionati `dist`, `node_modules` e artefatti generati. |
| **D12** | Congelamento | **Approvata.** W1–W32 e benchmark A1–A10, U1–U10 congelati in questa versione, prima di qualunque codice. |

### Piano di implementazione: vertical slice

Ogni slice deve funzionare, con test e verifica visiva in Chrome, prima di passare alla successiva.

1. API minima + WORLD MODE + MAP.
2. Selezione + OBJECT MODE + pivot.
3. GRAPH.
4. TIMELINE.
5. SEARCH + filtri.
6. WHY THIS RELATION? + `explain()`.
7. Persistenza ed export del trail.
8. Prestazioni su D2 + irrobustimento responsive; suite completa e benchmark da ambiente pulito; report.

Le condizioni di STOP della Fase 1 restano valide, con in più: qualunque dipendenza non in §M, qualunque richiesta di rete esterna e qualunque necessità di modificare il Core oltre D1.

---

## S. Note di implementazione della Fase 2 (2026-09-29) — nessun criterio, soglia o benchmark modificato

### S.1 Scelte fisiche

| Tema | Specifica | Implementazione | Motivo |
|---|---|---|---|
| Worker del servizio | pool di 6 thread | **4 processi** (`multiprocessing`, stdlib), ciascuno con la propria connessione in sola lettura; cancellazione tramite array condiviso delle sequenze per canale e deadline su orologio monotono di sistema | il Core fa molto lavoro in Python: con i thread il GIL impediva il parallelismo (A7 falliva: ricerca 2,6 → 28 ms in concorrenza); con i processi A7 passa. Nessun requisito cambiato |
| Gestore di progresso SQLite | — | ogni 100 istruzioni VM | il Core esegue molte istruzioni brevi: con 2.000 l'interruzione poteva non scattare |
| Canali di cancellazione | canale per vista | canale = sessione della pagina + vista | una pagina ricaricata riparte da seq 1: senza sessione le sue richieste risultavano "superate" (bug trovato nella verifica visiva) |
| Budget della mappa | default 2.000 → max 5.000 | desktop 5.000 · tablet 2.500 · telefono 300 | §L (budget per classe di schermo) e U4 (≥ 4.000 feature) |
| Zoom del Core | — | zoom Core = zoom MapLibre + 3 (tile da 512 px) | celle aggregate di 12–30 px a schermo |
| Budget minimo di `/context` | 25 per sezione | minimo 10, dichiarato in `budget_applied` | `context()` del Core restituisce sempre fino a 10 elementi vicini: il limite è reso esplicito, non nascosto |
| Relazioni oltre 50 per gruppo | "altri N" | pagine con `expand` del Core (cursore) | `relations()` del Core elenca al massimo 50 elementi per gruppo |
| Filtro testuale sullo Scope (§H "Mostra nello scope") | `Scope.text` per tutte le viste | **non implementato** | nessuna operazione del Core usa `Scope.text`: un pulsante senza effetto sarebbe stato ingannevole; servirebbe una modifica al Core oltre D1 |
| Basemap | Natural Earth dal Raw Store | provider generico `raw-polygons`, fonte in `config/basemap.toml`, attribuzione dal registro | nessun termine di dominio nel codice dell'API (W9) |
| Etichette mappa | overlay HTML | modulo isolato, al massimo 30 (12 su telefono), collisioni per rettangolo | D4 |
| Nodi del grafo | forma per natura | programma WebGL NEXUM su `NodeProgram` pubblico di Sigma (cerchio, quadrato, rombo) | nessun pacchetto aggiuntivo |
| Budget del grafo | 200 → 2.000 | selettore 200 / 1.000 / 2.000 nodi (archi = 2 × nodi) | §F, U5 |
| Aggiornamento dopo un cambio di `world_version` | via `changes_since` | le viste si riinterrogano | U10 è informativo; documentato |
| Telefono | status bar nascosta | riga di attribuzione compatta sulla mappa | le attribuzioni restano visibili (licenze) |
| Token `--faint` | `#6F797F` | `#808A90` | contrasto 3,73:1 → 4,71:1 (W30) |

### S.2 Errata della versione congelata (non cambiano il significato dei criteri)

1. **W18**: l'ID della regola R2 è `event_event_association` (il file è `rules/r2_event_event_association.toml`); il testo congelato riportava il nome del file. Il test verifica la regola R2 versione 2 con il suo ID reale.
2. **§M.2**: `@types/react` e `@types/react-dom` (MIT, solo sviluppo, dichiarazioni di tipo) sono necessari a qualunque progetto React in TypeScript (D2) e non erano elencati. Da ratificare.
3. **W10**: il confronto per righe con OSIRIS-REFERENCE segnalava quattro idiomi React/TypeScript generici (per esempio `const [open, setOpen] = useState(false);`): le variabili sono state rinominate. `ui/package-lock.json` condivide righe di metadati di pacchetti di terze parti (dipendenze di MapLibre) con il lockfile di OSIRIS: nel test W10 è confrontato solo per hash. Il test **P25 della Fase 1 non è stato modificato** e fallisce per lo stesso lockfile (vedi il report).

### S.3 Questioni aperte che richiedono una decisione dell'autore (STOP condition)

1. **A3 / Core su hub (modifica del Core oltre D1).** `related_events()` ed `entity_timeline()` del Core caricano e ordinano tutte le partecipazioni di un oggetto: su un hub D2 (~67.000 partecipazioni) `context()` impiega ~1,1 s (A3: p95 1.156 ms contro 200 ms). Soluzione proposta: nel Core, `related_events`/`entity_timeline` paginano con una query ordinata e limitata (indice su `edge(dst_id, edge_kind)` con join ordinato sul tempo dell'evento) e contano con `COUNT(*)` o con la cache dei gradi degli hub; risultati identici, API invariata.
2. **Licenza MPL-2.0 (W2).** Vite 8 installa `lightningcss` (MPL-2.0, anche come binario per darwin-arm64), usato solo durante la build e non incluso nel bundle. Opzioni: (a) ammettere MPL-2.0 per i soli strumenti di sviluppo non distribuiti; (b) passare a una versione di Vite che non lo installa.
3. **P25 e lockfile (W12).** Il test congelato della Fase 1 confronta per righe anche i lockfile generati. Opzione proposta: escludere dal confronto per righe i lockfile di dipendenze, mantenendo il confronto per hash.

### S.4 Dopo la baseline ufficiale (2026-09-29, autorizzazioni dell'autore)

- **Baseline ufficiale pre-correzione** conservata in `baseline/phase2-2026-09-29-pre-fix/` (report, log, screenshot). Esito: W2, W12, W32 FAIL; tutti gli altri PASS.
- **A3 — ottimizzazione autorizzata del Core.** Causa misurata: N+1 in `related_events()` ed `entity_timeline()` (67.112 `SELECT * FROM event WHERE event_id=?` per sezione, 134.266 per un `context()` sull'hub da 67.112 partecipazioni; le singole query usano la chiave primaria). Intervento: un solo recupero in blocco (`json_each`, colonne necessarie), cache derivata dell'ultimo elemento per `world_version` (le due sezioni di `context()` lo condividono), ordinamenti parziali `heapq.nsmallest` equivalenti all'ordinamento stabile completo. Output logico identico su 147 elementi (hash degli output di `context()`, `related_events()` e `entity_timeline()` anche con scope e cursore). Suite della Fase 1 PASS (hash, rebuild, idempotenza). Delta: `context()` sull'hub ~990 → ~175 ms con mmap, ~221 ms a freddo con le impostazioni dei worker (mmap 0). **A3 via API: p95 233 ms con mmap 0 (FAIL), 182 ms con mmap 1 GB (PASS) ma A6 sale a 2.313 MB in 3 minuti (FAIL).** Decisione richiesta all'autore.
- **W1** emendato secondo l'autorizzazione: il Core può differire solo per `explain` (D1) e per le funzioni dell'ottimizzazione A3; il test lo verifica funzione per funzione.
- **P25** corretto metodologicamente: classificazione per contenuto (codice, asset, dati, metadati di dipendenze verificati strutturalmente, altro); fixture positive e negative generate a runtime. W10 usa lo stesso classificatore.
- **W2** analizzato: `lightningcss@1.33.0` (MPL-2.0) è una dipendenza **diretta e obbligatoria** di `vite@8.3.1` (non opzionale né peer), minificatore CSS predefinito della build (`build.cssMinify = "lightningcss"`); binario nativo usato solo in build, non distribuito nel bundle (nel CSS compilato compare solo un suo effetto: `--lightningcss-light/dark` per `color-scheme`). Nessuna configurazione lo evita (l'alternativa `"esbuild"` richiede un pacchetto non presente in Vite 8). `vite@7.3.6` lo dichiara come peer opzionale e non lo installa. Decisione richiesta all'autore.
- **Benchmark UI (informativi, dopo la correzione del harness)**: U1, U2, U3, U7, U8 PASS; U4 area scelta dagli aggregati: 3.617 feature (< 4.000); U5 il presupposto "2.000 nodi / 4.000 archi a profondità 2" non è raggiungibile su D2 con la semantica del Core (550 nodi); U6 la UI usa il bucket automatico del Core (mese oltre 90 giorni): 400 bucket giornalieri non si presentano; U9 heap 36,5 → 46,3 MB (+27%, soglia 10%).

### S.5 Decisioni dell'autore (2026-09-29, seconda serie) — stato

- **W2** — eccezione MPL-2.0 **solo build-time, nominale** (`lightningcss` e binari di piattaforma), verificata automaticamente (non runtime, non nel bundle, non copiata nel progetto); policy in `ui/license-policy.json` con classi *runtime/distributed* e *build-only*; nessuna allowlist MPL generale. Test con casi negativi.
- **U4/U5/U6** — mondo sintetico deterministico dei benchmark UI `ubench` (`bench/phase2/generate_ubench.py`, `fixtures/ubench/`), separato da D1/D2/D3, costruito con la pipeline normale: U4 4.506 elementi nella vista a z 10; U5 2.000 nodi e 4.000 archi renderizzati con un nodo di sintesi dell'hub; U6 400 bucket annuali con il bucketing automatico del Core (nessuna regola della UI disattivata). Tutti PASS.
- **W25** — difetto trovato con U5: il grafo poteva superare il budget di nodi aggiungendo i nodi aggregati; ora il budget li include e le foglie omesse sono dichiarate.
- **U9** — causa misurata: cache delle risposte limitata in voci ma non in byte (16,9 MB di 39,5 MB di heap; +4 MB tra i passi 100 e 200). Correzione: cache limitata a 6 MB, risposte > 512 kB non conservate (revalidazione ETag). U9: +3,3 %, +2,8 %, +6,0 % in tre esecuzioni da browser pulito (PASS). Lo scenario di U9 usava uno zoom casuale: reso deterministico come richiede §P.
- **A6** — l'implementazione del mix di A6 non conteneva tutte le operazioni prescritte (A3, A4, explain): corretta secondo §P.1.
- **A3/A6** — misure in `memory_probe_*.json`; decisione dell'autore richiesta sul metodo di A6 (vedi il report della sessione): con mmap 0 A3 FAIL (p95 250 ms) e A6 PASS; con mmap 1 GB A3 PASS (p95 182 ms) e A6 FAIL col metodo attuale (Σ RSS 2.409 MB) ma Σ phys_footprint 756 MB.

### S.6 Emendamento di A6 e configurazione dei worker (approvati dall'autore il 2026-09-29)

- **A6**: il criterio si applica alla somma dei `phys_footprint` (memoria privata sporca e compressa attribuita dal sistema a ciascun processo) di tutti i processi del servizio; soglia invariata (1,5 GB). Motivo: con `mmap` le pagine del file SQLite sono page cache pulita e condivisa, contata nell'RSS una volta per ogni processo che la mappa (misurato: 1.378 MB sommati sui worker, ~1.025 MB contati più volte), mentre senza `mmap` la stessa cache esiste ma non entra nell'RSS; la memoria privata è la stessa nelle due configurazioni (784 MB con mmap 0, 756 MB con mmap 1 GB). Σ RSS, pagine mappate e page cache (contata una volta con `mincore`) restano riportati.
- **Worker del Core**: `mmap_size` = 1 GB (prima 0), che porta A3 sotto 200 ms.

### S.7 Correzioni responsive dopo il giro ufficiale (2026-09-29)

Solo UI (CSS e componente del grafo): controlli del grafo mai coperti dall'inspector su tablet, etichette dei nodi dentro il canvas e senza sovrapposizioni su tablet e telefono, barra del grafo in una sola riga sul telefono. Nessuna modifica a Core, API, dati, benchmark o soglie. Esiti in `NEXUM-PHASE2-VALIDATION.md` §2.
