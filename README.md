# NEXUM

**ONE OBJECT. MANY RELATIONS. ONE TIMELINE.**

> *NEXUM is a world of Objects, Relations and Events that can be observed through Map, Graph, Timeline and Search.*

NEXUM è una piattaforma open-source, local-first e a costo operativo €0 per la correlazione di dati pubblici, leciti e gratuiti:

```
DATA → OBJECTS → RELATIONS → EVENTS → TIMELINE → CORRELATION → INSIGHT
```

> Stato: **Fase 1 — NEXUM Core** (motore domain-agnostic, senza interfaccia grafica). Specifica: [NEXUM-PHASE1-SPEC.md](NEXUM-PHASE1-SPEC.md).

## Uso (Fase 1)

Requisiti: Python ≥ 3.12 (solo libreria standard) e `pytest` per i test. Nessuna chiave, nessun account, nessun servizio a pagamento.

```bash
python3 bench/run_phase1.py --clean --build   # scarica le 4 fonti reali (D1) e costruisce D1, D3, D3 scalato, mondo misto, D2
python3 bench/run_phase1.py --tests           # suite completa (criteri P1–P42)
python3 bench/run_phase1.py --bench           # benchmark B1–B28 → data/reports/benchmarks.json

python3 -m nexum.cli d1 query context '{"focus": "<id>"}'   # contratto di query in-process (HTTP locale in Fase 2)
python3 -m nexum.cli d1 attributions                         # attribuzioni delle fonti usate
```

Struttura: `nexum/core/` (Core domain-agnostic), `connectors/` (un modulo per fonte), `vocab/` (tipi di dominio),
`sources/` (registro delle fonti), `rules/` (regole di correlazione), `fixtures/` (mondi sintetici di test),
`tests/`, `bench/`. I dati scaricati e generati stanno in `data/` e non sono versionati.

## Documenti

| Documento | Contenuto |
|---|---|
| [NEXUM-VISION.md](NEXUM-VISION.md) | Visione, principi, cosa NEXUM non è |
| [NEXUM-FEASIBILITY.md](NEXUM-FEASIBILITY.md) | Relazione di fattibilità |
| [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md) | Architettura €0 local-first e motore di correlazione |
| [NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) | Object, Relation, Event, Timeline, Provenance, Confidence |
| [NEXUM-SOURCES.md](NEXUM-SOURCES.md) | Catalogo delle fonti verificate per dominio |
| [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md) | Valutazione di OSIRIS |
| [NEXUM-OSIRIS-CODE-AUDIT.md](NEXUM-OSIRIS-CODE-AUDIT.md) | Audit del codice OSIRIS, decisione zero import |
| [NEXUM-PHASE1-SPEC.md](NEXUM-PHASE1-SPEC.md) | Specifica approvata della Fase 1 (NEXUM Core) |
| [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) | Confini legali ed etici |
| [NEXUM-ROADMAP.md](NEXUM-ROADMAP.md) | Roadmap incrementale |

## Licenza

Codice e documentazione: [MIT](LICENSE) © 2026 Alessandro Pezzali.
I dati delle fonti esterne restano soggetti alle rispettive licenze e non sono inclusi nel repository.

## Fase 2 — workspace locale

```bash
# una volta: dipendenze e build della UI (Node serve solo in sviluppo)
cd ui && npm ci && npm run build && cd ..
# servizio locale (solo 127.0.0.1) con la UI: apri http://127.0.0.1:8765/
python3 -m nexum.api serve d1          # oppure d2, d3, mixed
# verifica completa da ambiente pulito
python3 bench/phase2/run_phase2.py --phase1 --ui-clean --tests --bench --report
```

Specifica: `NEXUM-PHASE2-SPEC.md` (criteri W1–W32, benchmark A1–A10 e U1–U10, note di implementazione §S).
