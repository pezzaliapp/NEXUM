# NEXUM — Fase 2: validazione

**Data:** 2026-09-29
**Autore:** Alessandro Pezzali
**Specifica:** `NEXUM-PHASE2-SPEC.md` v0.2 (criteri W1–W32 e benchmark A1–A10, U1–U10 congelati; emendamenti approvati in §S).
**Macchina:** Mac17,2, Apple M5, 24 GB, macOS 26.6.2; Chrome installato (Playwright `channel: "chrome"`).
**Evidenze locali (non versionate):** `baseline/` — log, screenshot e report JSON di ogni giro.

Questo documento è solo testo: riassume i risultati. I file generati (report JSON, log, screenshot) restano in `baseline/` e in `data/reports/phase2/`, esclusi da git.

---

## 1. Giro ufficiale da ambiente pulito (2026-09-29)

Sequenza (`python3 bench/phase2/run_phase2.py --phase1 --ui-clean --tests --bench --report`):
ricostruzione della Fase 1 da zero (fonti reali riscaricate; D1, D2, D3, D3s, mondo misto) e del mondo di benchmark UI `ubench`; installazione pulita della UI (`npm ci`), controllo licenze, build; suite Python completa (Fase 1 + Fase 2), test unitari UI, E2E in Chrome; benchmark API A1–A10 (A6: 30 minuti) e UI U1–U10.

| Esito | Valore |
|---|---|
| Criteri W1–W32 | **32/32 PASS** |
| Test Python (Fase 1 + Fase 2) | 92/92 |
| Test unitari UI | 7/7 |
| E2E | 19/19 |
| Benchmark della Fase 1 | 40/40 misure PASS (B14 D2: 3.973 MB < 4.000) |

### Benchmark API

| # | Misura | Soglia | Risultato |
|---|---|---|---|
| A1 | overhead API vs Core (p95, per operazione, D1 e D2) | ≤ 15 ms | massimo 9,8 ms — PASS |
| A2 | mappa D2, sequenza di zoom | p95 ≤ 150 ms | 89 ms — PASS |
| A3 | `context()` sui 10 hub D2 | p95 ≤ 200 ms | 180 ms — PASS |
| A4 | `expand` a pagine sugli hub | p95 ≤ 100 ms | 7,3 ms — PASS |
| A5 | latenza di cancellazione | p95 ≤ 50 ms | 4,1 ms, 50/50 interrotte — PASS |
| A6 | Σ `phys_footprint` del servizio, 30 minuti (metodo approvato) | ≤ 1,5 GB | 766 MB — PASS (riportati: Σ RSS 2.557 MB, pagine mappate 1.505 MB, page cache del database contata una volta 3.810 MB) |
| A7 | 4 canali concorrenti vs isolati | ≤ 2× | mappa 191 → 190 ms, timeline 33 → 34 ms — PASS |
| A8 | `explain` | p95 ≤ 100 ms | 1,1 ms — PASS |
| A9 | ricerca a ogni carattere | p95 ≤ 150 ms | 9,2 ms — PASS |
| A10 | estrazione del record grezzo (informativo) | ≤ 800 ms | p95 5,0 ms (rieseguito: nel giro ufficiale le fixture puntavano a `raw_id` precedenti alla ricostruzione e rispondevano 404; ora i locator sono risolti dai dati correnti) |

### Benchmark UI

| # | Misura | Soglia | Risultato |
|---|---|---|---|
| U1 | avvio a freddo D1 / D2 | ≤ 2,0 / 3,0 s | 436 / 476 ms — PASS |
| U2 | propagazione della selezione | p95 ≤ 100 ms | 13,8 ms — PASS |
| U3 | pivot D1 / D2 | ≤ 300 / 450 ms | 10,2 / 10,0 ms — PASS |
| U4 | pan con ≥ 4.000 elementi (`ubench`) | mediana ≥ 50 fps, p5 ≥ 30 | 4.506 elementi, 120 / 111 fps — PASS |
| U5 | grafo 2.000 nodi / 4.000 archi (`ubench`) | primo frame ≤ 1 s, ≥ 30 fps | 17 ms, 120 fps — PASS |
| U6 | timeline con 400 bucket (`ubench`) | p95 ≤ 16 ms | 0,7 ms — PASS |
| U7 | apertura di WHY | p95 ≤ 300 ms | 8,4 ms — PASS |
| U8 | JavaScript iniziale / totale (gzip) | ≤ 600 / 900 kB | 408 / 553 kB — PASS |
| U9 | heap, 200 passi (D2) | ≤ 300 MB, crescita ≤ 10 % | 27,6 MB, +2,1 % — PASS |
| U10 | aggiornamento dopo 1.000 modifiche (informativo) | ≤ 500 ms | 157 ms |

### Verifiche richieste dall'autore

- Modifiche al Core: solo `Query.explain()` (D1) e l'ottimizzazione autorizzata di A3 (`related_events`, `entity_timeline`); output di `context()` identico su 147 elementi; W1 le verifica funzione per funzione.
- Test visivi a 1920×1080, 1440×900, 1280×800, tablet 1024×768, telefono 390×844; catena completa WORLD → Search → Select → Object → Graph → pivot → Timeline → Insight → WHY → Evidence/Sources → nuovo focus.
- Smoke test su Safari (WebKit): WORLD MODE caricato correttamente.

---

## 2. Correzioni responsive successive al giro ufficiale (2026-09-29)

**Ambito:** solo UI (CSS e componente del grafo). **Nessuna modifica** a Core, API, dati, benchmark o soglie; A6 non rieseguito.

| Difetto | Correzione | Verifica |
|---|---|---|
| Tablet: con l'inspector aperto l'ultima chip della barra del grafo era coperta | nella fascia 768–1279 px i controlli del grafo restano a sinistra dell'inspector | E2E: ogni controllo del grafo termina prima del bordo dell'inspector |
| Tablet e telefono: etichette dei nodi troncate al bordo del grafo | vicino al bordo destro l'etichetta è disegnata a sinistra del nodo; sugli schermi stretti è accorciata con i puntini; sul telefono le etichette passano per la griglia anti-collisione (forzate solo per fuoco, secondo elemento e grafi fino a 12 nodi) | E2E: tutte le etichette dentro il canvas e nessuna coppia sovrapposta |
| Telefono: barra dei controlli del grafo su tre righe | una sola riga compatta: indicazione "prof. 1 · max 100" (i limiti del telefono previsti da §L, prima mostrati come controlli senza effetto), conteggio, pulsante "Filtri" che apre i filtri in un pannello | E2E: barra ≤ 48 px di altezza, entro la larghezza dello schermo; i filtri si aprono e cambiano davvero stato |

Test eseguiti dopo le correzioni:

| Test | Esito |
|---|---|
| Test Python (tutti; W rilevanti: W9, W10, W22…) | 92/92 |
| Test unitari UI | 7/7 |
| E2E (regressione responsive alle 5 dimensioni, catena su desktop, tablet e telefono, test dei tre difetti) | 23/23 |
| Benchmark UI U1–U9 | tutti PASS (U5 2.000 nodi / 4.000 archi, primo frame 17 ms; U9 +1,6 %) |
| U8 | 408 / 553 kB — PASS |
| Criteri W1–W32 (report rigenerato; A1–A10 dal giro ufficiale) | 32/32 PASS |
| Smoke test su Safari | fuoco dall'URL, cella evidenziata sulla mappa, inspector e timeline sincronizzati |
