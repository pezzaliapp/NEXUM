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
