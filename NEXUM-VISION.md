# NEXUM — Visione

> **ONE OBJECT. MANY RELATIONS. ONE TIMELINE.**

Autore: Alessandro Pezzali · Licenza: MIT · Stato: fase di ricerca e architettura (nessun codice applicativo)

---

## 1. Cos'è NEXUM

NEXUM è una piattaforma open-source di **correlazione e analisi di dati pubblici**. Trasforma flussi eterogenei di open data (terremoti, incendi, meteo, voli, navi, infrastrutture, vulnerabilità software, indicatori economici, notizie) in un unico grafo di oggetti collegati, ordinati su una sola linea temporale, da cui far emergere correlazioni spiegabili.

```
DATA → OBJECTS → RELATIONS → EVENTS → TIMELINE → CORRELATION → INSIGHT
```

| Stadio | Significato in NEXUM |
|---|---|
| **DATA** | Record grezzi scaricati da fonti pubbliche, lecite e gratuite, conservati immutati con la loro provenienza. |
| **OBJECTS** | Entità stabili e identificabili (un vulcano, un aeroporto, una centrale, un paese, una CVE). Ogni cosa del mondo reale esiste **una sola volta**. |
| **RELATIONS** | Collegamenti tipizzati e datati tra oggetti (*si trova in*, *alimenta*, *colpisce*, *gestito da*). |
| **EVENTS** | Fatti accaduti in un istante o intervallo (una scossa, un'eruzione, un blackout, la pubblicazione di una CVE). |
| **TIMELINE** | Un unico asse temporale condiviso da tutti i domini, su cui ogni evento e ogni cambiamento di stato è collocato. |
| **CORRELATION** | Regole esplicite (spazio, tempo, grafo, semantica) che propongono legami tra eventi di domini diversi. |
| **INSIGHT** | Ipotesi correlate, con punteggio di confidenza e catena di prove verificabile fino al dato grezzo. |

## 2. Principi

1. **Costo operativo €0.** Nessuna API a pagamento, nessuna carta di credito, nessuna trial, nessun server a pagamento. Se una dipendenza viola questo vincolo, viene scartata e documentata.
2. **Local-first.** NEXUM gira interamente sul computer dell'utente. Il cloud non è un requisito; è al massimo un'opzione gratuita e sostituibile (es. pagine statiche).
3. **Fonti lecite, rispetto delle regole.** Si usano solo fonti con licenza e termini d'uso compatibili; si rispettano robots.txt, rate limit e attribuzioni. Nessuna elusione di autenticazioni, paywall o protezioni.
4. **Provenienza totale.** Ogni oggetto, relazione, evento e insight è tracciabile fino al record grezzo, alla fonte, alla licenza e all'istante di acquisizione.
5. **Confidenza esplicita.** Nessun dato è "vero" di default: ogni affermazione porta con sé un punteggio e il motivo del punteggio.
6. **Spiegabilità prima dell'automazione.** Il motore di correlazione è basato su regole leggibili; ogni correlazione deve poter essere spiegata in una frase.
7. **Semplice e modulare.** Un connettore per fonte, un modello dati unico, un solo archivio locale. Niente microservizi finché non servono.
8. **Originalità.** NEXUM non copia codice, marchi, asset grafici, terminologia o interfacce di prodotti commerciali. Il vocabolario (Object, Relation, Event, Timeline, Provenance, Confidence) è generico e di dominio pubblico nella letteratura su grafi di conoscenza.

## 3. Cosa NEXUM non è

- **Non è uno strumento di sorveglianza.** Non profila persone fisiche, non traccia individui, non esegue ricerche su username/email/telefono, non consulta database di credenziali trafugate, non aggrega webcam.
- **Non è uno strumento offensivo.** Non esegue scansioni di porte o vulnerabilità su sistemi di terzi.
- **Non è un clone** di alcun prodotto proprietario di data intelligence.
- **Non è un aggregatore di contenuti protetti.** Le notizie sono trattate come metadati (titolo, link, data, fonte), non ripubblicate.

## 4. Utenti tipici

- Ricercatori, giornalisti di dati, studenti e analisti che vogliono **contestualizzare eventi pubblici** (es. "quali infrastrutture energetiche si trovano entro 50 km da questo incendio attivo?").
- Protezione civile e volontariato che vogliono un **cruscotto locale** di eventi naturali correlati a infrastrutture e trasporti.
- Analisti di sicurezza difensiva che vogliono correlare **vulnerabilità pubblicate** con cataloghi pubblici di exploit noti.

## 5. Esempi di insight attesi

- *Un terremoto M6.1 in Turchia (USGS + EMSC) → 3 aeroporti entro 100 km (OurAirports) → GDACS alert arancione → 14 notizie RSS nelle 6 ore successive.*
- *Hotspot di incendio (FIRMS) persistente per 48 h → linea elettrica ad alta tensione a 2 km (OSM) → prezzo day-ahead anomalo nella zona di offerta (ENTSO-E).*
- *CVE aggiunta al catalogo KEV di CISA → prodotto presente in avvisi CERT nazionali → pubblicazione di un aggiornamento correttivo.*

Ogni esempio è un'**ipotesi di correlazione**, non un'affermazione di causalità.

## 6. Documenti di progetto

| Documento | Contenuto |
|---|---|
| [NEXUM-FEASIBILITY.md](NEXUM-FEASIBILITY.md) | Relazione di fattibilità |
| [NEXUM-ARCHITECTURE.md](NEXUM-ARCHITECTURE.md) | Architettura a €0, local-first, moduli, motore di correlazione |
| [NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) | Object, Relation, Event, Timeline, Provenance, Confidence |
| [NEXUM-SOURCES.md](NEXUM-SOURCES.md) | Catalogo fonti verificate per dominio, con licenze e verdetti |
| [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md) | Analisi di OSIRIS e di cosa è riutilizzabile |
| [NEXUM-LEGAL-BOUNDARIES.md](NEXUM-LEGAL-BOUNDARIES.md) | Confini legali ed etici, criteri di ammissione delle fonti |
| [NEXUM-ROADMAP.md](NEXUM-ROADMAP.md) | Roadmap incrementale |
