# NEXUM — Valutazione di OSIRIS

Data analisi: 2026-09-28 · Repository analizzato: `github.com/simplifaisoul/osiris` (commit `7a3daec`, clone locale di sola lettura, fuori dal repository NEXUM)

---

## 1. Sintesi

| Domanda | Risposta |
|---|---|
| La licenza consente il riuso? | **Sì, formalmente**: MIT, © 2026 simplifaisoul. Il riuso richiede di mantenere l'avviso di copyright e la licenza. |
| Conviene usarlo come **base di codice**? | **No.** Il progetto contiene pratiche incompatibili con i vincoli di NEXUM, componenti non verificabili e dati di terzi con licenze non compatibili. |
| Conviene usarlo come **riferimento**? | **Sì, con cautela**: come elenco di fonti pubbliche da verificare una per una e come esempio di problemi reali da evitare. |
| Decisione | **Nessuna riga di codice, asset o dato di OSIRIS entra in NEXUM.** Si riutilizzano solo idee generali (non tutelate da copyright), riscritte da zero. |

## 2. Identità del progetto

| Voce | Rilevato |
|---|---|
| Nome esteso | Open Source Intelligence & Reconnaissance Integrated System |
| Autore | un solo autore nel log disponibile (`simplifaisoul`) |
| Creazione repository | 2026-05-12 |
| Popolarità | ~10.100 stelle, ~2.090 fork |
| Descrizione GitHub | presenta il progetto come alternativa a un prodotto commerciale e include un indirizzo di token crypto |
| Finanziamento | Patreon, con vantaggi riservati ai sostenitori |
| Demo pubblica | sito ospitato dall'autore |

La presenza di un token crypto nella descrizione e di vantaggi a pagamento è un **segnale di rischio reputazionale**: NEXUM non deve apparire associato a iniziative di questo tipo.

## 3. Architettura di OSIRIS

| Livello | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, MapLibre GL, Tailwind, Framer Motion |
| Backend | API route di Next.js (~90 endpoint) che fanno da proxy verso fonti esterne, con cache in memoria |
| Servizio "intel" | server Express separato: indice sanzioni (OpenSanctions) + query Wikidata |
| Servizio "engine" | directory con **solo file Python compilati (`.pyc`)**, senza sorgenti |
| Scanner | backend esterno non incluso, raggiunto tramite variabili d'ambiente |
| Deploy | Vercel o Docker/GHCR |

Struttura: un grande client monolitico con molte route proxy. Non esiste un modello dati unificato né una nozione di provenienza o confidenza: ogni layer è un flusso indipendente mostrato sulla mappa.

**Implicazione per NEXUM**: il valore di NEXUM (oggetti unici, relazioni, timeline, correlazione spiegabile) **non esiste in OSIRIS**. Non c'è quindi un nucleo da riusare, solo connettori.

## 4. Dipendenze

| Dipendenza | Licenza | Compatibile con €0 / NEXUM? |
|---|---|---|
| maplibre-gl | BSD-3 | ✔ (NEXUM la adotta indipendentemente) |
| satellite.js | MIT | ✔ (alternativa Python: `sgp4`, MIT) |
| rss-parser | MIT | ✔ |
| react-force-graph-2d | MIT | ✔ |
| lightweight-charts | Apache-2.0 con richiesta di attribuzione visibile | ⚠ utilizzabile con attribuzione |
| hls.js | Apache-2.0 | non necessaria (NEXUM non riproduce stream video) |
| google-libphonenumber | Apache-2.0 | ✘ non pertinente: usata per ricerche su numeri di telefono |
| @google/generative-ai | Apache-2.0 (SDK) | ✘ il servizio sottostante è un'API commerciale con quote e termini propri |
| @vercel/analytics | MPL-2.0 (SDK) | ✘ lega a un SaaS di analytics |
| next, react | MIT | ✔ ma sovradimensionati per un'app locale |

## 5. Fonti usate da OSIRIS — prima classificazione

La verifica completa è in [NEXUM-SOURCES.md](NEXUM-SOURCES.md). Qui si riassume cosa OSIRIS insegna.

| Fonte in OSIRIS | Esito per NEXUM |
|---|---|
| USGS, NASA EONET, NASA FIRMS, GDACS, NOAA SWPC, NWS, CelesTrak, NVD, Wikidata, RIPEstat | candidati validi, da verificare singolarmente (licenze e limiti) |
| OpenSanctions | ✘ come fonte predefinita: licenza **CC BY-NC 4.0**, uso commerciale a pagamento. Sostituita dalle liste ufficiali (UE, OFAC, ONU) |
| OpenSky | verificare i termini (uso non commerciale/ricerca, OAuth2) |
| aisstream.io, N2YO | chiave gratuita; valutare rischio di dipendenza |
| Endpoint non ufficiali di siti finanziari | ✘ nessuna API pubblica documentata, termini d'uso non compatibili |
| Mappe di conflitto di siti di terzi | ✘ contenuti protetti, nessuna licenza di riuso |
| Canali Telegram tramite anteprima web | ✘ raccolta di contenuti generati da utenti con geolocalizzazione; fuori scopo |
| Oltre 17.000 webcam (DOT, siti commerciali di webcam, cataloghi amatoriali) | ✘ fuori scopo: NEXUM non aggrega video/immagini di luoghi; molti siti commerciali vietano l'embedding/proxy |
| Servizi di breach, infostealer, ricerca username/email/telefono | ✘ **esclusi**: trattamento di dati personali, funzione di profilazione |
| Scanner di porte/vulnerabilità | ✘ **escluso**: interazione attiva con sistemi di terzi |
| Tracciamento wallet crypto | ✘ fuori scopo |

## 6. Problemi riscontrati (motivi di esclusione del codice)

Descritti a livello generale; non si riportano dettagli operativi.

1. **Mascheramento dell'origine delle richieste.** Un modulo condiviso da circa 30 connettori genera header che dichiarano indirizzi IP di provenienza falsi e user-agent casuali. È una pratica di **elusione** dei controlli delle fonti, incompatibile con il principio NEXUM di identificarsi in modo onesto e rispettare i limiti. Qualsiasi connettore OSIRIS è quindi "contaminato" da questo schema.
2. **Funzioni di profilazione di persone.** Ricerca di username su centinaia di siti, verifica di email/telefono in database di violazioni e di malware che rubano credenziali. Incompatibile con il divieto di raccolta di dati personali e di sorveglianza invasiva.
3. **Componenti non verificabili.** La directory `engine/` contiene solo bytecode Python compilato, senza sorgenti: codice non ispezionabile, da non eseguire né redistribuire.
4. **Dati di terzi con licenza incompatibile inclusi nel repository.** `public/data/submarine-cables*.json` ha la stessa struttura dei dati pubblicati dalla mappa dei cavi sottomarini di TeleGeography, distribuiti con licenza **CC BY-NC-SA** (non commerciale, share-alike) e senza attribuzione nel repository. Non può essere incluso in un progetto MIT.
5. **Proxy verso URL arbitrari** (immagini di webcam, tile), mitigati da un filtro anti-SSRF, ma concettualmente l'opposto dell'allowlist per fonte prevista da NEXUM.
6. **Documenti operativi dell'autore** in `scratch/` (procedure di deploy con indirizzi di server, script di scraping), segnale di scarsa separazione tra progetto e ambiente personale.
7. **Marchio e asset grafici** (nome OSIRIS, occhio di Horus, palette cyan/oro, favicon, screenshot): **non riutilizzabili** per scelta di originalità, indipendentemente dalla licenza.
8. **Dipendenza da SaaS** (hosting Vercel, analytics, LLM commerciale) che contraddice il vincolo €0 local-first.

## 7. Cosa è legalmente riutilizzabile e cosa NEXUM riutilizza davvero

| Elemento | Legalmente riutilizzabile? | Decisione NEXUM |
|---|---|---|
| Codice sorgente TypeScript | Sì (MIT, con avviso di copyright) | **Non riutilizzato** (motivi §6) |
| Bytecode `engine/` | Non verificabile | **Escluso** |
| Dati in `public/data` | **No** per i cavi (NC-SA) | **Escluso** |
| Asset grafici e nome | Licenza MIT copre il codice, non il marchio | **Esclusi** |
| Elenco delle fonti pubbliche | Un elenco di fatti non è protetto | **Usato come checklist**, ogni fonte riverificata da zero |
| Idea di cache con TTL, deduplica delle richieste concorrenti e "stale-on-error" | Idee generali, non protette | **Riscritta da zero** nel Polite Scheduler |
| Idea di guard anti-SSRF | Idea generale | Sostituita da **allowlist di host per fonte** (più semplice e restrittiva) |
| Test "live" separati dai test offline | Pratica comune | Adottata come principio |
| Esportazione di aree di interesse in GeoJSON | Funzione generica | Prevista in NEXUM con dati redistribuibili |

Se in futuro si decidesse di riutilizzare un frammento di codice OSIRIS, occorrerà: (a) verificare che non usi i moduli di §6, (b) conservare l'avviso MIT originale in un file `THIRD_PARTY_NOTICES`, (c) documentarlo in questo file. **Allo stato attuale non è previsto.**

## 8. Lezioni per NEXUM

- Un bel cruscotto con molti layer **non è** una piattaforma di correlazione: serve un modello dati unico.
- Più layer ≠ più valore: ogni fonte aggiunge obblighi di licenza, manutenzione e rischio. Meglio poche fonti affidabili, ben modellate.
- La tentazione di "far funzionare comunque" una fonte (header falsi, endpoint non documentati) va respinta in fase di progetto: la regola deve stare nell'architettura (Source Registry + scheduler), non nella buona volontà del singolo connettore.
- Il repository non deve mai contenere dati di terzi, solo codice che li scarica sulla macchina dell'utente nel rispetto delle licenze.
