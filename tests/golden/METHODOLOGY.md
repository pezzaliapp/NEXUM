# Golden set di R2 — metodologia (congelato il 2026-09-28)

File: `tests/golden/r2_golden_set.json` — SHA-256 registrato in `NEXUM-PHASE1-SPEC.md` §27.6.
Il golden set è stato costruito e congelato **prima** dell'implementazione di R2 v2 e non va modificato
per far passare una regola. Classificazioni, eventi attesi, esclusioni e soglie P17/P18/P19 sono fissi.

## Universo

Tutte le attivazioni Copernicus EMS Rapid Mapping con `category = earthquake` presenti nei dati D1
acquisiti il 2026-09-28: **43 attivazioni**.

## Classificazione (4 classi, disgiunte)

1. **Positivi (36)** — attivazioni che rispondono a un terremoto specifico, con attivazione dal
   2015-01-01 in poi e terremoto M ≥ 5,5 presente nel catalogo USGS ingerito (perimetro dichiarato di R2).
   *Evento atteso*: il terremoto che ha originato l'attivazione, identificato così:
   - nome, paese e data dell'attivazione (campi strutturati Copernicus) identificano l'evento di riferimento;
   - tra gli eventi USGS dello stesso episodio (stessa area e stessi giorni) l'evento atteso è quello
     riconosciuto pubblicamente come evento principale dell'episodio; in tutti i 36 casi coincide con
     l'evento di magnitudo massima dell'episodio nel catalogo USGS, verificato caso per caso sul titolo USGS
     (es. "2025 Mandalay, Burma (Myanmar) Earthquake", "2017 Tehuantepec, Mexico Earthquake",
     "48 km W of Illapel, Chile");
   - l'identificazione dell'evento atteso **non** usa la regola R2 né i suoi punteggi.
2. **Da non abbinare (3)** — attivazioni reali di categoria `earthquake` che non rispondono a un evento
   recente: valutazione del rischio (EMSN021), esercitazione (EMSR198), analisi post-evento tre mesi dopo
   (EMSN061). R2 non deve produrre insight: ogni insight è un falso positivo.
3. **Esclusi (4)** — fuori perimetro, né positivi né negativi: EMSR004 e EMSR005 (2012, prima della finestra
   del catalogo), EMSR172 (sciame senza eventi M ≥ 5,5), EMSN074 (evento di Zagabria sotto M 5,5).
   Verificato: nessun evento M ≥ 5,5 entro 14 giorni e 500 km nel catalogo ingerito.

Totale: 36 + 3 + 4 = 43.

## Negativi (20 eventi)

I 20 terremoti M ≥ 6,5 di magnitudo più alta (a parità, il più antico) per cui **non esiste** alcuna
attivazione `earthquake` entro 14 giorni dopo l'evento ed entro 500 km. P19: al più 1 di essi può comparire
come evento abbinato in un insight di R2.

## Metriche

- **TP**: positivo abbinato all'evento atteso.
- **FP**: insight che abbina un evento diverso da quello atteso (positivi) oppure qualsiasi insight su
  un'attivazione "da non abbinare".
- **FN**: positivo senza abbinamento all'evento atteso (mancato o sbagliato).
- Precisione = TP / (TP + FP); Recall = TP / 36.
- Soglie approvate (non modificabili): P17 recall ≥ 90 %, P18 precisione ≥ 95 %, P19 ≤ 1.

## Riproducibilità

Il golden set cita identificatori USGS (`usgs_id`) e codici Copernicus (`activation`), quindi è
verificabile su qualsiasi ricostruzione del mondo D1 dagli stessi dati grezzi.
