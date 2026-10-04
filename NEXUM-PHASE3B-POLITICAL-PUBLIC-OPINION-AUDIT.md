# NEXUM — Fase 3B: supplemento Political / Public Opinion

**Governi · persone pubbliche · opinione della popolazione · direzione percepita**

**Versione:** 0.1 · **Data:** 2026-10-03 · **Autore:** Alessandro Pezzali
**Stato:** solo audit e progettazione. **Nessuna implementazione.**
- Nessun codice, nessuna modifica a Core, dati, snapshot o giorno/notte.
- Nessun deploy, commit o push; production e DNS/E3 intatti.
- In attesa di GO.

**Integra:** `NEXUM-PHASE3B-DISCOVERY-AUDIT.md` (stessa data). Dove una nuova verifica cambia una conclusione precedente lo dichiaro con **PREVIOUS FINDING / NEW EVIDENCE / REVISED FINDING** (§1.2 e nelle sezioni).

**Metodo.**
- Tutte le cifre provengono da richieste reali del 2026-10-03:
  - query SPARQL su Wikidata;
  - API Commons, GOV.UK, Eurostat, Banca Mondiale, BCE, INSEE, ISTAT, OCSE;
  - file Eurobarometro, BCS, Afrobarometer, ONS, ESRI, Banca del Canada;
  - pagine ufficiali di governo e pagine dei termini di licenza.
- **Ogni richiesta** ha usato solo l'identificativo neutro `NEXUM-audit/0.2 (+https://github.com/pezzaliapp/NEXUM)`.
- Nessun account, modulo, login, chiave o accettazione di termini.
- Legenda:
  - **(F)** verificato con fetch diretto;
  - **(W)** pagina ufficiale letta;
  - **(S)** solo estratto di un motore di ricerca;
  - **n/v** non verificato.
- I file grezzi restano fuori dal repository.

---

## 1. Executive summary

### 1.1 In sintesi

| Domanda | Risposta breve |
|---|---|
| Chi governa **oggi**? | **Sì, quasi ovunque, per i vertici.** Wikidata (CC0), dopo i filtri di qualità, dà un capo di Stato affidabile in **179/193** Stati (185 utilizzabili) e un capo di governo affidabile in **160/193** (172 utilizzabili). I ministri sono un dato **meno affidabile**: 148/193 Stati a livello GOOD, e solo il **79%** dei ministri verificati sulle fonti ufficiali è risultato corretto. |
| Storia degli incarichi? | **Sì, utile.** 169/193 Stati coprono almeno il 90% del periodo 1990–2025 per capo di Stato e capo di governo. Il lookup "in carica alla data dell'evento" restituisce un risultato univoco nei 17 casi testati, ma **solo dopo tre correzioni all'algoritmo** (§6). |
| Biografie? | **Parziali.** Dati anagrafici e professione quasi sempre presenti. Studi 86%, incarichi precedenti datati 52%, partito con data 22%. Riferimenti istituzionali rari (35% sull'incarico attuale, 0% negli Stati deboli). Nessuna biografia va scritta da un modello: solo frasi ricostruite da enunciati documentati. |
| Opinione **recente**? | **50/193 Stati** con sole fonti ACCEPT (Eurobarometro, OECD Trust Survey). **98/193** se Afrobarometer conferma la redistribuibilità dei valori derivati. |
| **Futuro** (aspettative)? | **38/193** con fonti ACCEPT (Eurobarometro QA2.3, BCS UE, Giappone ESRI, Canada BoC). **82/193** con Afrobarometer. |
| **Trend** confrontabili? | **45/193** con fonti ACCEPT; il trend mensile con errore campionario calcolabile esiste per i 32 Stati ONU della BCS. |
| Redistribuibile? | Opinione: **50** Stati GOOD + 48 condizionati. Governi: CC0 per tutti i 193. **Foto: no.** |
| Ha senso farne una parte importante di NEXUM? | **Sì, con onestà sulla copertura**: vertici dello Stato quasi globali; opinione solida per Europa e OCSE, condizionata per l'Africa, assente per circa 78 Stati. Sempre "valore · data · fonte", mai giudizi né causalità. |

**Raccomandazione di ordine** (dettagli in §21): dividere C in tre parti, per separare il rischio legato alle persone viventi dal resto.
- **C1:** opinione pubblica e dati di realtà. Non coinvolge persone.
- **C2:** capi di Stato e di governo con lo storico, dopo il gate GDPR.
- **C3:** ministri, con badge "verifica in corso" e data `as_of`.

### 1.2 Revisioni del Discovery Audit

| Tema | PREVIOUS FINDING | NEW EVIDENCE | REVISED FINDING |
|---|---|---|---|
| Capo di Stato attuale | 192/193 con titolare (P35) | Lo stesso conteggio si riproduce (192 con un valore, 185 con data d'inizio, 37 con riferimento). Ma in 5 Stati P35 è vecchio mentre l'ufficio (P39) ha già il successore: SM, BB, FJ, MM, BD. | **179 affidabili, 185 utilizzabili.** Il titolare attuale va derivato dagli incarichi (P39) dell'ufficio; P35 serve solo come verifica incrociata. |
| Capo di governo attuale | 187/193 | 19 P6 vecchi; 52 Stati con ufficio unificato (sistemi presidenziali); 2 buchi reali (PE, TD) | **160 affidabili, 172 utilizzabili.** Il Perù è un buco di modellazione, il Ciad un buco di dati. |
| Ministri | 174–181 Stati con ≥5 | Con il filtro dei titolari superati: 177 (175 se iniziati dal 2015). GOOD (≥10 posizioni e ≥70% datate): 148. Su 47 posti verificati con le fonti ufficiali: 37 corretti (79%), 7 vecchi (Giappone 3/5, Sudafrica 4/7), 3 mancanti. | **~175–177 Stati con ≥5 ministri, 148 GOOD; la correttezza dei ministri non è garantita.** Serve il badge "può non essere aggiornato" con data `as_of`. |
| Algoritmo "in carica alla data" (§3.3) | rango preferito, mai indovinare | **83 personaggi di finzione** ricoprono incarichi reali (Presidente USA: 3 candidati senza filtro); un ministro lussemburghese ha un enunciato *preferito* sugli Interni dell'India; date di fine future salvate come fatti (es. 2029) | **Aggiungere:** solo esseri umani (P31 = Q5); controllo di giurisdizione e cittadinanza; un enunciato preferito in conflitto va segnalato, non accettato; date future ignorate; ufficio (P39) come fonte primaria. |
| Gabinetti e coalizioni | non valutati | Item di gabinetto attuale in 167 Stati, ma solo 28 hanno ≥5 membri collegati; nessun item ha partiti come valore | Gabinetto = solo "esiste un'entità". **Le coalizioni non si possono derivare** da Wikidata. |
| Foto | non conservare | 12 campioni: 8 richiedono attribuzione, 3 hanno restrizioni sui diritti della personalità, 1 è share-alike, 1 ha provenienza dubbia (Instagram) | **Confermato: nessuna foto conservata**; al più un link alla pagina del file Commons. |
| User-Agent | nessuna regola | Incidente del 2026-10-03; regola permanente decisa dall'autore | Identificativo neutro di progetto ovunque (§15). |
| File dello snapshot | 166 file di margine; raccomandati i pacchetti | decisione dell'autore: packaging per dominio, O7 resta 9.000 | ≤ 10 file in tutto per i domini Political/Opinion (§19). |

---

## 2. Decisioni ereditate dal Discovery Audit (2026-10-03)

| # | Decisione dell'autore | Effetto su questo supplemento |
|---|---|---|
| 1 | **Packaging per dominio**; niente file per Paese; O7 = 9.000 invariato | pacchetti `gov`, `opinion`, `reality` (§19) |
| 2 | **Nessuna API key, account, carta, trial, billing, servizio a consumo**, anche se gratuiti | ESS, WVS, dati Arab Barometer, dataset Pew, Asian Barometer, CSES, ISSP, election studies, BOK ECOS e INEGI (token) sono **esclusi**: candidati futuri |
| 3 | CSP webcam approvata con allowlist; LIVE ≠ immagine aggiornata ≠ riferimento statico | non toccata qui |
| 4 | Persone viventi: progettazione sì, **pubblicazione no** fino a questo supplemento; nessun dossier personale | §14, gate esplicito in §21 |
| 5 | Ordine provvisorio A–G, da confermare | raccomandazione in §21 |
| 6 | Costo di percorrenza: futuro, solo servizio locale; costo di percorrenza ≠ costo aziendale | invariato |
| 7 | Grafo e dettaglio: proposta §15 del Discovery Audit conservata | invariato |
| 8 | **Giorno/notte approvato come baseline:** non modificare | invariato |
| 9 | **Regola permanente sullo User-Agent** | applicata a ogni richiesta; verifica in §15 |

---

## 3. Copertura del governo attuale

Fonte: Wikidata via SPARQL. Regole di valutazione definite **prima** del calcolo:
- **GOOD** = item di gabinetto attuale, nazionale e datato, e ≥ 5 ministri attuali;
- **PARTIAL** = ≥ 5 ministri senza gabinetto, oppure gabinetto con < 5;
- **POOR** = da 1 a 4 ministri;
- **NONE** = niente.

| Elemento | Copertura (193) | Nota |
|---|---|---|
| Governo attuale (colonna A) | **156 GOOD · 33 PARTIAL · 4 POOR · 0 NONE** | L'item del gabinetto esiste in 167 Stati, ma solo **28** hanno ≥ 5 membri collegati (Italia 18, Paesi Bassi 28; USA e UK 0). I membri vanno quindi letti dagli incarichi ministeriali, non dal gabinetto. |
| Data di insediamento del gabinetto | parziale | I gabinetti usano P571/P576, quasi mai P580/P582; restano 708 item "aperti" già superati (la Germania ne ha 241, quasi tutti regionali). |
| Vice / deputy con titolare attuale | **89/193** | Il Sudafrica (Mashatile) manca; l'Italia ha 2 vicepresidenti (collegiale). |
| Parlamento (P194) | **191/193** (mancano NL sull'item del regno e AF) | — |
| Legislatura attuale (item di mandato) | **104/193** | Spesso incoerente: l'Italia XIX senza Stato collegato, il Botswana con 12 mandati "aperti", il 120° Congresso USA già presente con date future. |
| Partiti presenti nel governo | conteggio derivabile in 178/193 | **Solo conteggio, nessuna etichetta ideologica.** Le **coalizioni formali non sono derivabili** da Wikidata. |
| Forma di governo (P122) | 156/193 (Discovery Audit) | — |

**Non dedotto, per principio:** ideologia, orientamento, populismo, autoritarismo, democraticità, competenza, responsabilità, popolarità. L'affiliazione a un partito si mostra solo se è un fatto documentato (§14).

---

## 4. Copertura delle persone pubbliche

### 4.1 Vertici (193 Stati)

| Colonna | GOOD | PARTIAL | POOR | NONE | Regola |
|---|---|---|---|---|---|
| **B** Capo di Stato | **179** | 9 | 5 | 0 | GOOD: un titolare (o un insieme collegiale) non superato, con data d'inizio |
| **C** Capo di governo | **160** | 12 | 19 | 2 | stessa regola; nei sistemi presidenziali (52 Stati) l'ufficio unificato prende il voto di B |
| **D** Ministri | **148** | 29 | 13 | 3 | GOOD: ≥ 10 posizioni attuali con titolare e ≥ 70% datate; NONE: Vanuatu, Nauru, Maldive |

- **POOR in B:** SM, BB, FJ, MM, BD (P35 vecchio, ufficio già aggiornato).
- **NONE in C:** PE (buco di modellazione), TD (buco di dati).
- **D POOR/UNVERIFIED:** Svizzera e Nuova Zelanda sono buchi di modellazione: i capi di dipartimento federali non sono modellati come "ministro".

### 4.2 Test di correttezza su fonti ufficiali gratuite (senza chiave)

| Stato | Fonte ufficiale | Esito |
|---|---|---|
| IT | governo.it | 8/8 corretti |
| US | whitehouse.gov, justice.gov | 6/6 |
| GB | GOV.UK Content API | 5/5 con le stesse date; **manca la Giustizia** (Alex Norris dal 2026-07-20 su GOV.UK) |
| DE | bundesregierung.de | 6/6 |
| ES | lamoncloa.gob.es | 6/6; la Giustizia è dentro un ministero combinato |
| JP | kantei.go.jp | **2/5**: rimpasto del 2026-09-17 non ancora recepito (Esteri, Finanze, Segretario capo di gabinetto) |
| ZA | gov.za | **2/7**: 4 ministri fermi al gabinetto 2024; manca il vicepresidente |
| PE | gob.pe | 2/2 |
| FR | info.gouv.fr | 403 (n/v) |
| **Totale** | — | **37/47 corretti (79%) · 7 vecchi · 3 mancanti** · 1 errore certo (Interni dell'India) |

### 4.3 Test reale su 16 Stati (107 incarichi, 92 persone)

- **Copertura degli incarichi:**
  - 12 Stati nominati: **79/85 (93%)**;
  - Stati deboli (Guinea-Bissau, Ciad, Perù, Haiti): **15/22 (68%)**;
  - totale **94/107 (88%)**.
- I risultati per Stato (completezza per campo) sono in §5.1.

---

## 5. Completezza delle biografie

### 5.1 Campo per campo (92 persone: capi di Stato e di governo e 3–5 ministri per Stato)

| Campo | Tutti (92) | 12 Stati nominati (77) | Stati deboli (15) |
|---|---|---|---|
| Nome | 100% | 100% | 100% |
| Foto (P18) | 93% | 100% | 60% |
| Data di nascita | 96% | 100% | 73% |
| Partito | 76% | 84% | 33% |
| Partito **con data** | **28%** | 31% | 13% |
| Incarico attuale | 100% | 100% | 100% |
| Data d'inizio dell'incarico attuale (al giorno) | 98% | 100% | 87% |
| ≥ 1 incarico precedente | 85% | 94% | 40% |
| Incarichi precedenti datati (≥ 80%) | 45% | 47% | 33% |
| Governo/legislatura sull'incarico attuale | 24% | 29% | 0% |
| Membro del parlamento | 57% | 64% | 20% |
| Predecessore | 86% | 88% | 73% |
| Successore (incarichi conclusi) | 48% | — | — |
| Studi (P69) | 79% | 87% | 40% |
| Professione (P106) | 99% | 99% | 100% |
| **Una fonte sull'incarico attuale** | 65% | 64% | 73% |
| **Fonte istituzionale** (dominio ufficiale) sull'incarico attuale | **35%** | 42% | **0%** |
| Sito ufficiale (P856) | 46% | 55% | 0% |

Sugli 8.869 enunciati di queste persone: il 40,1% ha un riferimento qualsiasi, solo il 4,3% un riferimento a un dominio ufficiale.

**Su scala 193 (colonna F, 322 capi di Stato e di governo attuali umani):**
- nascita 322/322, professione 322/322, studi 277/322 (86%);
- ≥ 2 incarichi precedenti datati 167/322 (52%);
- partito con data 70/322 (22%);
- **F: 61 GOOD · 127 PARTIAL · 4 POOR · 1 UNVERIFIED** (Svizzera: il titolare è il Consiglio federale, non una persona).

### 5.2 Biografia "documentata", mai generata

Si costruisce solo con frasi a modello, una per enunciato, ognuna con il suo ID come evidenza:
- "È nato/a il … [ID]"
- "Ha studiato presso … [ID]"
- "Professione: … [ID]"
- "È stato/a … dal … al … [ID]"
- "Dal … ricopre … [ID]"

Ciò che manca non si dice e non si completa. Esempio reale (Presidente del Consiglio italiano):
- nascita (1 riferimento);
- professione: politica, giornalista;
- partiti in sequenza datata (solo l'ultimo ha un riferimento);
- consigliera provinciale 1999–2003;
- deputata in 5 legislature (2 con riferimento ufficiale);
- ministra 2008–2011 (0 riferimenti);
- Presidente del Consiglio dal 2022-10-22 (2 riferimenti, uno ufficiale);
- **studi assenti** in Wikidata.

Problemi trovati negli altri esempi:
- **doppia data di nascita** (al giorno e all'anno), quindi serve deduplica;
- mandati parlamentari **senza fine** che dovrebbero essersi chiusi;
- incarichi attuali con **0 riferimenti** (Presidente USA, Cancelliere tedesco).

---

## 6. Storia degli incarichi e timeline

**Colonna E** (copertura giornaliera 1990–2025 dei titolari datati di capo di Stato e di governo; dalla fondazione per 26 Stati nati dopo il 1990):
- **169 GOOD (≥ 90%) · 23 PARTIAL · 1 POOR (Afghanistan, 41,9%) · 0 NONE**;
- i PARTIAL sono in parte interruzioni reali (Libia, Sudan) e in parte date mancanti.

### 6.1 "L'evento è avvenuto durante il mandato di…" (test reali)

| Ufficio | Data | Esito | Titolare (enunciato) | Riferimenti |
|---|---|---|---|---|
| Presidente del Consiglio IT | 2026-10-03 | univoco | Meloni | 2 |
| Presidente del Consiglio IT | 2020-03-01 | univoco | Conte (2018-06-01 → 2021-02-13) | **0** |
| Presidente del Consiglio IT | 2010-06-01 | univoco | Berlusconi (2008-05-08 → 2011-11-16) | 1 |
| Presidente del Consiglio IT | 2022-10-22 (giorno del passaggio) | univoco | Meloni: la fine è esclusiva, quindi Draghi è escluso | — |
| Presidente della Repubblica IT | oggi / 2010-06-01 | univoco | Mattarella / Napolitano | 0 / 0 |
| Presidente USA | 2026-10-03 | univoco **solo con il filtro umani** | Trump (rango preferito) | **0**; senza filtro: 3 candidati (2 di finzione) |
| Presidente USA | 2020-06-01 | univoco | Trump | 14 |
| Presidente USA | 2010-06-01 | univoco | Obama | 1 |
| Presidente USA | 2021-01-20 | univoco | Biden | 6 |
| PM UK | oggi | univoco | Burnham (2026-07-20), coincide con GOV.UK | 1 |
| PM UK | 2019-07-01 / 2019-07-24 | univoco | May / Johnson | 1 / 2 |
| Cancelliere DE | 2015-06-01 / oggi | univoco | Merkel / Merz | 4 / 0 |
| Presidente BR | 2019-06-01 / oggi | univoco | Bolsonaro / Lula | 0 / 0 |
| Presidente FR | 2015-06-01 | univoco | Hollande | 0 |

**Algoritmo rivisto** (sostituisce il Discovery Audit §3.3):
1. **Fonte primaria:** gli incarichi (P39) dell'ufficio. P35/P6 sullo Stato solo come verifica incrociata.
2. **Solo esseri umani** (P31 = Q5).
3. **Giurisdizione coerente:** l'ufficio ha P1001 = lo Stato; la persona ha una cittadinanza (P27) compatibile, oppure si segnala.
4. Enunciati non deprecati con `inizio ≤ D < fine` (fine esclusiva), rispettando la precisione della data; **le date di fine o di scioglimento successive allo snapshot si ignorano**.
5. Rango preferito: si usa, ma **se contraddice altri candidati dello stesso ufficio si segnala come conflitto** invece di accettarlo.
6. Si scartano gli aperti superati: un titolare aperto con un successore aperto più recente. I successori interinali già conclusi non contano.
7. Uffici collegiali solo da elenco esplicito (BA, SM, AD, CH, NI).
8. Esito: `univoco` · `collegiale` · `ambiguo` (con tutti i candidati e le evidenze) · `nessun dato`. **Mai indovinare.**

**Significato della relazione:** "l'evento è avvenuto durante il mandato di X". **Mai** "X ha causato l'evento". L'etichetta in UI è fissa (§18).

---

## 7. Fonti di opinione pubblica

| Fonte | Autorità | Paesi (ultima ondata, verificati) | Indicatori | Ultimo campo | Confrontabilità | Accesso | Licenza/ToS | Aggregati redistribuibili | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Eurobarometro standard** (EB105, Volume A) | Commissione UE | **36 Stati ONU** (UE-27 + TR, MK, ME, RS, AL, MD, UK, BA, GE); ~1.000 interviste per Paese; **niente Ucraina** (F) | fiducia nel governo, nel parlamento e in altre 12 istituzioni; soddisfazione per la democrazia; situazione attuale; **aspettative a 12 mesi** (7 voci); **i 2 problemi più importanti**; **direzione giusta/sbagliata** (Paese, UE, la propria vita) (F) | 12 mar – 5 apr 2026 (F) | stesse formulazioni EB102–105; i numeri delle domande cambiano, quindi si mappa per testo (F) | xlsx aperto via API data.europa.eu, nessun account (F) | COM_REUSE / CC BY 4.0 ([legal notice](https://commission.europa.eu/legal-notice_en)) (W) | **sì** | PASS | basso | **ACCEPT** (nucleo) |
| **EC Business & Consumer Surveys (BCS)** | DG ECFIN | **32 Stati ONU** (UE-27 + ME, MK, AL, RS, TR); UK fino al 2020-12; Estonia sospesa da maggio 2026 (F) | indicatore di fiducia; Q1–Q9 come saldi (situazione finanziaria e generale passata e futura, prezzi percepiti e attesi, disoccupazione attesa, grandi acquisti); quote di risposta (F) | **mensile**, 2026-09; storico dal 1985 (F) | serie lunghe; rotture note (Polonia nuovo istituto; Italia 2026-09 assente) | zip/xlsx statici, nessuna chiave; la cartella cambia nome ogni mese (F) | CC BY 4.0 (legal notice CE) (W); gli istituti mantengono la proprietà con diritto d'uso libero della CE (F) | **sì** | PASS | basso | **ACCEPT** |
| **OECD Trust Survey** | OCSE | 2025: 33 membri OCSE + BG, BR, HR, PE, RO; 20 Paesi in tutte e 3 le ondate (F) | fiducia nel governo nazionale, nel parlamento, nella pubblica amministrazione, nei tribunali; 3 problemi principali (F) | 10 set – 11 dic 2025 (F) | ondate 2021/2023/2025, scala 0–10; **campioni online non probabilistici** | 2021/2023 via API SDMX (CORS); 2025 solo xlsx del rapporto (F) | il rapporto dichiara CC BY 4.0 (F); pagina dei termini OCSE 403 (n/v) | sì | PASS | medio | **ACCEPT** (con indicatore metodologico) |
| **ECB Consumer Expectations Survey** | BCE | 11 Paesi euro + area euro (F) | inflazione percepita e attesa (1/3/5 anni), crescita, disoccupazione attese; mediana, media, n (F) | mensile, 2026-08 (F) | dal 2020-04 | API `data-api.ecb.europa.eu`, nessuna chiave, CORS `*` (F) | uso libero citando la BCE (W) | sì | PASS | basso | **ACCEPT** |
| **ONS Opinions and Lifestyle Survey** | ONS | Gran Bretagna | "Important issues facing the UK" (% con IC 95%); costo della vita (F) | 5–30 ago 2026 (n = 3.560) (F) | dal 2022-10 | xlsx statico; limitazione delle richieste (429) | OGL v3 (standard ONS; testo esatto n/v) | sì | PASS | basso | **ACCEPT** (verificare la formula OGL) |
| **Japan ESRI Consumer Confidence** | Cabinet Office | Giappone | indice; aspettativa sulla vita in generale; 89% si aspetta prezzi in aumento (F) | mensile, 2026-08 (n = 8.400) (F) | dal 1982, rotture nel 2013 e 2018 | xlsx statico (F) | termini del governo giapponese compatibili con CC BY 4.0 (W) | sì | PASS | basso | **ACCEPT** |
| **Bank of Canada CSCE** | Banca del Canada | Canada | prospettive economiche; inflazione percepita e attesa (F) | trimestrale, T2 2026 (F) | dal 2023 / 2014 | API Valet, nessuna chiave, CORS `*` (F) | uso, copia e distribuzione libere con attribuzione (W) | sì | PASS | basso | **ACCEPT** |
| ISTAT fiducia consumatori · INSEE Camme | ISTAT · INSEE | IT · FR | indici e saldi nazionali (F) | mensile, 2026-09 (F) | scale diverse dalla BCS | SDMX / API BDM senza chiave (F) | CC BY 4.0 · Licence Ouverte 2.0 (W) | sì | PASS | **scale diverse** | **ACCEPT solo come verifica nazionale**, mai mescolati con la BCS |
| **Afrobarometer R10** | Afrobarometer | 38 Paesi; file per Paese scaricati per 32 (F) | **direzione giusta/sbagliata**; economia attuale; **economia a 12 mesi**; fiducia nel presidente e nel parlamento; 3 problemi principali (F) | gen 2024 – set 2025; solo **13** con campo successivo al 2024-10-03 (F) | stesse formulazioni R7–R10 | .sav/.csv diretti, **nessuna registrazione** (F) | "protected by copyright… required to acknowledge the source"; dati "free for you to use" (W). **Nessuna licenza aperta esplicita** | probabilmente | PASS | medio | **CONDITIONAL**: chiedere conferma scritta per la redistribuzione delle percentuali derivate |
| OECD Risks that Matter 2024 · OECD Trust LAC | OCSE | 27 · 4+2 | preoccupazioni a breve e lungo termine · fiducia (F) | fine 2024 · 2025 | ondate 2018–2024 | tabelle dei rapporti | CC BY 4.0 (documenti) | sì | PASS | estrazione manuale | **CONDITIONAL** |
| OECD CCI/BCI e saldi `DF_CS` | OCSE | 40 / 39 (F) | indici trasformati (media di lungo periodo = 100); saldi nazionali (F) | 2026-06…08 | **non è una risposta di sondaggio**, nessun errore campionario | SDMX senza chiave (F) | CC BY 4.0 (S); dati di terzi con possibili restrizioni | da verificare per singolo fornitore | PASS | licenza per fornitore | **CONDITIONAL** (mai come frecce principali) |
| Flash Eurobarometer | Commissione UE | variabile | temi singoli | variabile | raramente ripetuti | come EB | CC BY 4.0 | sì | PASS | basso | ACCEPT (approfondimenti, non nucleo) |
| **Latinobarómetro** | Corporación | 17 (2026) (F) | Paese in progresso o declino; economia a 12 mesi; fiducia; problema principale (F) | 7 mag – 17 giu 2026 (F) | annuale dal 1995 | zip diretto | "**Se prohíbe la redistribución**" (W) | **no** | PASS | legale alto | **REFERENCE ONLY** (solo link) |
| Pew Global Attitudes | Pew | 25 (2025) | economia, direzione, fiducia | 2025 | annuale | dataset con account; rapporti aperti | licenza "personal, revocable"; solo estratti (W) | no | — | alto | **REFERENCE ONLY** (dataset esclusi: account) |
| Ipsos What Worries the World | Ipsos | 29–30 | 3 preoccupazioni, direzione giusta/sbagliata | mensile, set 2026 | online, campioni più urbani | solo PDF | clausole contraddittorie: "public domain" ma riproduzione vietata senza permesso (W) | non chiaro | PASS | alto | **REFERENCE ONLY** |
| Arab Barometer (rapporti) | Arab Barometer | 9 | economia, fiducia | set 2025 – mag 2026 | ondate I–IX | dati solo con modulo | — | — | — | — | **REFERENCE ONLY** (rapporti); dati esclusi (modulo) |
| Gallup World Poll | Gallup | — | — | — | — | a pagamento | permesso richiesto per ogni uso (W) | no | FAIL | — | **REJECT** (solo link) |
| ESS · WVS/EVS · Asian Barometer · CSES · ISSP · LAPOP · GESIS · ANES/BES/GLES/ITANES · BOK · INEGI (token) | vari | — | — | — | — | registrazione, modulo, token o accettazione di termini | ESS **CC BY-NC-SA**; WVS non redistribuibile; LAPOP vieta la distribuzione (W) | — | — | — | **ESCLUSI** (decisione 2): candidati futuri, alcuni comunque incompatibili (NC, divieti) |
| University of Michigan · Conference Board · FGV | — | US, CA, BR | — | — | — | — | redistribuzione vietata / a pagamento (W) | no | FAIL | — | **REJECT** |
| RBI CCS · TI CPI · UNODC | RBI · TI · UNODC | IN · mondo | — | — | — | — | caching vietato · BY-ND · uso non commerciale (W) | no | — | — | **REFERENCE ONLY** |

**Formulazioni esatte** (indicatori chiave):
- **Eurobarometro** (EB105, Volume A):
  - QA6.10 "How much trust do you have in certain institutions?… The (NATIONALITY) Government" (UE-27: 37% fiducia);
  - QA3 "What do you think are the two most important issues facing (OUR COUNTRY) at the moment?" (UE-27: costo della vita 36%);
  - QA1.2 situazione dell'economia nazionale (38% buona / 60% cattiva);
  - **QA2.3** "What are your expectations for the next twelve months… The economic situation in (OUR COUNTRY)" (16% meglio / 44% peggio / 37% uguale);
  - **D73.1** "things are going in the right direction or in the wrong direction, in (OUR COUNTRY)" (31% giusta / 60% sbagliata).
- **Afrobarometer:**
  - Q3 "the country is going in the wrong direction or going in the right direction?";
  - Q6 "Looking ahead, do you expect economic conditions in this country to be better or worse in 12 months' time?";
  - Q46 "most important problems facing this country that government should address?".
- **BCS:**
  - Q4 "How do you expect the general economic situation in this country to develop over the next 12 months?";
  - Q5 "How do you think that consumer prices have developed over the last 12 months?";
  - Q51 la stessa domanda in percentuale.
- **ONS:** "What do you think are important issues facing the UK today?" (agosto 2026: costo della vita 89%, IC 87–90).
- **INSEE:** "au cours des douze prochains mois, le niveau de vie en France, dans l'ensemble va…"

---

## 8. Aspettative sul futuro

| Misura | Fonti ACCEPT | Stati |
|---|---|---|
| Aspettativa esplicita sul futuro (economia del Paese a 12 mesi; vita personale; ottimismo) | Eurobarometro QA2.3 (36) + BCS Q2/Q4 (32, sovrapposti) + Giappone ESRI + Canada BoC | **38/193** |
| con Afrobarometer Q6 (CONDITIONAL) | + 44 Paesi africani | **82/193** |
| con fonti REFERENCE ONLY (solo link) | + Latinobarómetro Q8 | ~97 (non redistribuibili) |

L'Eurobarometro copre anche le aspettative per la **propria vita** e per la **situazione finanziaria familiare** (QA2.x); la BCS copre situazione finanziaria familiare (Q2), economia generale (Q4), disoccupazione (Q7) e prezzi (Q6).

---

## 9. Direzione percepita

NEXUM **non prevede**: mostra come cambia una misura ripetuta.

- **"Direzione giusta/sbagliata" misurata davvero:** Eurobarometro D73.1 (**36** Stati), Afrobarometer Q3 (CONDITIONAL, ~38). Ipsos e Latinobarómetro sono solo riferimento.
- **Direzione della percezione** (variazione nel tempo): BCS mensile (32 Stati) ed Eurobarometro semestrale (36).

**Esempio reale** (BCS Q4 "situazione economica generale nei prossimi 12 mesi", saldo destagionalizzato; errore standard ricavato dalle quote di risposta e dalla numerosità dichiarata):

| Paese | Confronto | Δ | Soglia (2·√deff·SE, deff = 2) | Verdetto UI |
|---|---|---|---|---|
| IT (n = 2.000) | 2026-03 (−33,9) vs 2025-09 (−20,8) | **−13,1** | ~3,7 | **↓ −13,1 punti** |
| IT | 2026-08 (−30,4) vs 2026-03 | +3,5 | ~3,8 | **→ variazione non significativa** |
| FR (n = 1.670) | 2026-03 (−44,9) vs 2025-09 (−50,2) | **+5,3** | ~4,3 | **↑ +5,3 punti** |
| FR | 2026-09 (−45,7) vs 2026-03 | −0,8 | ~4,3 | **→ nessuna variazione significativa** |

**Lacuna reale:** il settembre 2026 dell'Italia manca nel file della Commissione, mentre ISTAT lo ha pubblicato e segnala cambiamenti nella rete di rilevazione. La UI **non** deve riempire il vuoto con ISTAT (scale diverse).

---

## 10. Confrontabilità dei sondaggi

**Le frecce ↑ ↓ → si mostrano solo se coincidono tutte queste condizioni:**
- stessa serie (stesso `comparable_series_id`);
- stessa domanda (testo, non numero della domanda);
- stessa popolazione;
- stessa unità (percentuale, saldo, indice, media);
- stessa correzione (destagionalizzato o grezzo);
- metodo senza rotture dichiarate tra le due date.

Altrimenti: **"non confrontabile"**.

| Statistica | Errore standard | Nota |
|---|---|---|
| **Percentuale** (Eurobarometro, ONS, Afrobarometer) | SE(p) = √(p(1−p)/n) | se la fonte pubblica margine o IC (ONS, Ipsos), **si usa quello della fonte** |
| **Saldo BCS** B = (PP + ½P) − (½M + MM), con "non so" nel denominatore | punteggi x ∈ {+1, +½, 0, −½, −1}; SE(B) = 100·√(Var(x)/n) | **non è una percentuale di persone**; il saldo INSEE (P − M senza "non so") **non è confrontabile** con quello BCS (FR set 2026: −60 contro −45,7) |
| **Indice OCSE CCI** | nessuno | è una trasformazione: niente frecce, salvo etichetta "senza margine d'errore" |
| **Variazione** | SE(Δ) = √(SE₁² + SE₂²) | campioni indipendenti; i panel a rotazione (INSEE) sono correlati |

**Regola:** freccia solo se |Δ| > 2·√deff·SE(Δ), con deff = 2 come default prudenziale (pesi, quote, panel), oppure con il margine dichiarato dalla fonte. Altrimenti "→ nessuna variazione significativa".

**Altre cautele:**
- **Indicatore metodologico obbligatorio:** probabilistico / quote / online non probabilistico (OECD Trust, Risks that Matter, Ipsos sono online).
- **Rotture note:** Polonia (nuovo istituto, storico sostituito), Estonia (sospesa), Italia 2026-09 (assente), Giappone 2013 e 2018, Eurobarometro (numeri delle domande che cambiano tra le ondate).
- **Mai un indice composito tra fonti diverse.**

---

## 11. Realtà e percezione

Due blocchi **separati**, ciascuno con la propria fonte. **Nessun indice** ("la popolazione ha torto o ragione", "distanza dalla realtà").

| Realtà (fonti ufficiali ACCEPT) | Copertura |
|---|---|
| Eurostat HICP (attenzione: la serie viva è `prc_hicp_minr`; `prc_hicp_manr` è **ferma al 2025-12**) | UE-27, mensile, 2026-09 (stima flash) (F) |
| Eurostat disoccupazione `une_rt_m` | UE-27, mensile, 2026-08 (F) |
| Banca Mondiale WDI (CC BY 4.0, CORS `*`): inflazione, disoccupazione (stima modellata ILO, da etichettare), PIL | **160/193** con inflazione e disoccupazione ≥ 2024 (F); mancano 33 Stati (es. AD, CU, KP, SO, SS, SY, UA, VE, YE) |
| BIS prezzi delle abitazioni | 61 aree, trimestrale (F) |
| FMI DataMapper · ILOSTAT | **CONDITIONAL**: proiezioni mescolate ai dati senza indicatore (FMI); termini letti solo da estratti |

**Esempio reale (Italia):**
- **Realtà:** HICP su 12 mesi 1,6% (2025-08) → 3,2% (2026-08) → 4,1% (2026-09, stima flash). Fonte: Eurostat.
- **Percezione:** saldo BCS Q5 "prezzi negli ultimi 12 mesi" 38,7 (2025-08) → 48,4 (2026-08). Fonte: Commissione UE, BCS.
- **La UI può dire solo** "entrambi in aumento"; le unità sono diverse.
- **Stessa unità, aggregato UE (T2 2026):** inflazione percepita BCS Q51, mediana 10,8%, contro HICP UE ~3,1%.
- **Ma** la BCE (CES) per la Francia dà 2,5% percepito contro 2,6% HICP.
- **Lezione:** l'ampiezza dello scarto dipende dallo strumento. Mostrare **sempre** il nome dello strumento accanto al numero.

**Opinione ≠ responsabilità.** La frase ammessa è "Durante questo periodo il sondaggio Y ha rilevato il 34%." Mai "Il Governo X ha causato il 34%." Correlazione temporale ≠ causalità.

---

## 12. Matrice di copertura dei 193 Stati

**Legenda:**
- G = GOOD · P = PARTIAL · R = POOR · N = NONE · U = UNVERIFIED.
- Colonne A–F: Wikidata con le regole di §3–§6.
- Colonne G–J: **solo fonti ACCEPT** (Eurobarometro, OECD Trust Survey, BCS, ESRI Giappone, BoC Canada).
- **Cond.** = disponibile Afrobarometer (CONDITIONAL, non contato nei voti).
- **Realtà** = inflazione e disoccupazione ufficiali ≥ 2024 (WDI/Eurostat).

**Definizioni delle colonne:**

| Col. | Contenuto | Criterio |
|---|---|---|
| A | Governo attuale | §3 |
| B | Capo di Stato | §4 |
| C | Capo di governo | §4 |
| D | Ministri | §4 |
| E | Storico degli incarichi | §6 |
| F | Profondità della biografia | §5 |
| G | Opinione pubblica recente | campo dopo il 2024-10-03: GOOD = Eurobarometro; PARTIAL = solo OECD Trust o solo serie ufficiale di percezione |
| H | Aspettative sul futuro | domanda esplicita sul futuro |
| I | Trend confrontabile | ≥ 3 osservazioni della stessa domanda |
| J | Redistribuibile | GOOD = fonte ACCEPT; PARTIAL = solo CONDITIONAL |

### 12.1 Totali reali

| Misura | Stati |
|---|---|
| Governo (A GOOD; +PARTIAL) | **156/193** (189) |
| Capo di Stato (B GOOD; +PARTIAL) | **179/193** (188) |
| Capo di governo (C GOOD; +PARTIAL) | **160/193** (172) |
| Ministri (D GOOD; ≥ 5 attuali) | **148/193** (~175–177) |
| Storico utile (E GOOD) | **169/193** |
| Biografia (F GOOD; +PARTIAL) | **61/193** (188) |
| Opinione recente (G, solo ACCEPT) | **50/193** (36 GOOD + 14 PARTIAL) · **98** con Afrobarometer · ~90 recenti se si contassero le fonti di solo riferimento (non redistribuibili) |
| Aspettative sul futuro (H) | **38/193** · 82 con Afrobarometer |
| Trend confrontabile (I) | **45/193** · 79 con le fonti CONDITIONAL |
| Opinione legalmente redistribuibile (J) | **50/193** GOOD + 48 PARTIAL (condizionati) |
| Realtà ufficiale (inflazione e disoccupazione ≥ 2024) | **160/193** |
| Nessun dato di opinione lecito in nessuno scenario | **78/193** (tra cui CN, RU, UA, PK, BD, Golfo, Asia centrale, Caraibi, Pacifico; India e Indonesia hanno solo fonti di riferimento) |

### 12.2 Matrice completa

(generata dagli esiti delle query; i file sorgente restano nello scratch di sessione)

| ISO | Stato | A | B | C | D | E | F | G | H | I | J | Cond. | Realtà |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AD | Andorra | G | G | G | P | G | P | N | N | N | N |  | — |
| AE | United Arab Emirates | P | G | P | G | G | P | N | N | N | N |  | ✓ |
| AF | Afghanistan | G | G | G | G | R | P | N | N | N | N |  | ✓ |
| AG | Antigua and Barbuda | G | G | P | G | G | P | N | N | N | N |  | — |
| AL | Albania | G | G | P | G | G | P | G | G | G | G |  | ✓ |
| AM | Armenia | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| AO | Angola | P | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| AR | Argentina | P | G | G | P | G | G | N | N | N | N |  | ✓ |
| AT | Austria | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| AU | Australia | P | G | G | G | G | P | P | N | G | G |  | ✓ |
| AZ | Azerbaijan | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| BA | Bosnia and Herzegovina | P | G | G | R | G | P | G | G | G | G |  | — |
| BB | Barbados | G | R | G | G | G | P | N | N | N | N |  | ✓ |
| BD | Bangladesh | G | R | G | G | G | P | N | N | N | N |  | ✓ |
| BE | Belgium | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| BF | Burkina Faso | G | G | R | G | G | P | N | N | N | P | Afro | ✓ |
| BG | Bulgaria | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| BH | Bahrain | P | G | G | G | G | P | N | N | N | N |  | ✓ |
| BI | Burundi | G | G | R | P | P | R | N | N | N | N |  | ✓ |
| BJ | Benin | G | G | R | G | G | P | N | N | N | P | Afro | ✓ |
| BN | Brunei | G | P | P | G | G | P | N | N | N | N |  | ✓ |
| BO | Bolivia | P | G | G | G | G | R | N | N | N | N |  | ✓ |
| BR | Brazil | G | G | G | G | G | G | P | N | N | G |  | ✓ |
| BS | The Bahamas | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| BT | Bhutan | P | G | G | G | P | P | N | N | N | N |  | ✓ |
| BW | Botswana | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| BY | Belarus | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| BZ | Belize | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| CA | Canada | G | G | G | G | G | G | P | G | G | G |  | ✓ |
| CD | Democratic Republic of the Congo | G | G | R | G | P | P | N | N | N | N |  | — |
| CF | Central African Republic | G | G | G | P | G | P | N | N | N | N |  | ✓ |
| CG | Republic of the Congo | G | G | G | G | P | P | N | N | N | P | Afro | ✓ |
| CH | Switzerland | P | P | P | R | G | U | P | N | N | G |  | ✓ |
| CI | Ivory Coast | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| CL | Chile | P | G | G | G | G | G | P | N | N | G |  | ✓ |
| CM | Cameroon | G | G | G | G | G | G | N | N | N | P | Afro | ✓ |
| CN | People's Republic of China | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| CO | Colombia | G | G | G | G | G | P | P | N | G | G |  | ✓ |
| CR | Costa Rica | P | G | G | G | G | P | P | N | N | G |  | ✓ |
| CU | Cuba | G | G | G | G | G | P | N | N | N | N |  | — |
| CV | Cape Verde | G | G | G | P | G | P | N | N | N | P | Afro | ✓ |
| CY | Cyprus | G | G | G | P | G | G | G | G | G | G |  | ✓ |
| CZ | Czech Republic | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| DE | Germany | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| DJ | Djibouti | G | G | G | P | G | P | N | N | N | N |  | ✓ |
| DK | Kingdom of Denmark | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| DM | Dominica | G | G | G | P | G | P | N | N | N | N |  | — |
| DO | Dominican Republic | G | G | G | G | G | G | N | N | N | P |  | ✓ |
| DZ | Algeria | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| EC | Ecuador | P | G | G | R | G | G | N | N | N | P |  | ✓ |
| EE | Estonia | G | G | G | P | G | G | G | G | G | G |  | ✓ |
| EG | Egypt | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| ER | Eritrea | G | G | G | G | G | P | N | N | N | N |  | — |
| ES | Spain | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| ET | Ethiopia | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| FI | Finland | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| FJ | Fiji | G | R | G | G | G | P | N | N | N | N |  | ✓ |
| FM | Federated States of Micronesia | P | G | G | R | G | P | N | N | N | N |  | — |
| FR | France | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| GA | Gabon | G | G | G | P | P | P | N | N | N | P | Afro | ✓ |
| GB | United Kingdom | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| GD | Grenada | G | G | G | G | G | P | N | N | N | N |  | — |
| GE | Georgia | G | G | G | G | P | G | G | G | G | G |  | ✓ |
| GH | Ghana | G | G | R | G | G | P | N | N | N | P | Afro | ✓ |
| GM | The Gambia | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| GN | Guinea | P | G | G | P | P | P | N | N | N | P | Afro | ✓ |
| GQ | Equatorial Guinea | P | G | G | P | G | P | N | N | N | N |  | ✓ |
| GR | Greece | G | G | G | P | G | P | G | G | G | G |  | ✓ |
| GT | Guatemala | G | G | G | G | G | P | N | N | N | P |  | ✓ |
| GW | Guinea-Bissau | P | P | G | R | G | P | N | N | N | P | Afro | ✓ |
| GY | Guyana | G | G | G | G | P | P | N | N | N | N |  | ✓ |
| HN | Honduras | P | G | G | P | G | P | N | N | N | N |  | ✓ |
| HR | Croatia | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| HT | Haiti | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| HU | Hungary | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| ID | Indonesia | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| IE | Ireland | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| IL | Israel | P | G | G | G | G | G | N | N | N | P |  | ✓ |
| IN | India | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| IQ | Iraq | G | G | R | G | G | P | N | N | N | N |  | ✓ |
| IR | Iran | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| IS | Iceland | G | G | G | G | G | P | P | N | G | G |  | ✓ |
| IT | Italy | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| JM | Jamaica | G | G | P | G | G | P | N | N | N | N |  | ✓ |
| JO | Jordan | G | P | G | G | G | P | N | N | N | N |  | ✓ |
| JP | Japan | G | G | G | G | G | G | P | G | G | G |  | ✓ |
| KE | Kenya | G | G | G | G | G | G | N | N | N | P | Afro | ✓ |
| KG | Kyrgyzstan | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| KH | Cambodia | G | G | P | P | G | P | N | N | N | N |  | ✓ |
| KI | Kiribati | G | G | G | G | G | P | N | N | N | N |  | — |
| KM | Comoros | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| KN | Saint Kitts and Nevis | G | G | G | G | G | P | N | N | N | N |  | — |
| KP | North Korea | G | G | G | G | G | R | N | N | N | N |  | — |
| KR | South Korea | G | G | G | G | G | P | P | N | G | G |  | ✓ |
| KW | Kuwait | G | G | P | G | G | P | N | N | N | N |  | ✓ |
| KZ | Kazakhstan | G | G | G | G | P | P | N | N | N | N |  | ✓ |
| LA | Laos | G | P | G | G | G | P | N | N | N | N |  | ✓ |
| LB | Lebanon | G | G | G | G | G | P | N | N | N | N |  | — |
| LC | Saint Lucia | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| LI | Liechtenstein | P | G | G | R | G | P | N | N | N | N |  | — |
| LK | Sri Lanka | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| LR | Liberia | P | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| LS | Lesotho | G | G | G | P | P | P | N | N | N | P | Afro | ✓ |
| LT | Lithuania | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| LU | Luxembourg | G | G | G | G | P | G | G | G | G | G |  | ✓ |
| LV | Latvia | G | G | R | P | G | G | G | G | G | G |  | ✓ |
| LY | Libya | G | G | R | G | P | P | N | N | N | N |  | ✓ |
| MA | Morocco | P | G | R | G | G | P | N | N | N | P | Afro | ✓ |
| MC | Monaco | R | G | G | R | G | P | N | N | N | N |  | — |
| MD | Moldova | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| ME | Montenegro | R | G | G | R | G | P | G | G | G | G |  | ✓ |
| MG | Madagascar | G | G | G | G | G | R | N | N | N | P | Afro | ✓ |
| MH | Marshall Islands | G | G | G | P | G | P | N | N | N | N |  | — |
| MK | North Macedonia | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| ML | Mali | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| MM | Myanmar | G | R | R | G | P | P | N | N | N | N |  | — |
| MN | Mongolia | P | G | G | G | G | P | N | N | N | N |  | ✓ |
| MR | Mauritania | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| MT | Malta | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| MU | Mauritius | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| MV | Maldives | P | G | G | N | G | G | N | N | N | N |  | ✓ |
| MW | Malawi | G | P | P | G | G | G | N | N | N | P | Afro | ✓ |
| MX | Mexico | G | G | G | G | G | G | P | N | G | G |  | ✓ |
| MY | Malaysia | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| MZ | Mozambique | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| NA | Namibia | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| NE | Niger | P | G | G | R | G | P | N | N | N | P | Afro | ✓ |
| NG | Nigeria | P | G | G | P | G | G | N | N | N | P | Afro | ✓ |
| NI | Nicaragua | G | P | P | G | G | G | N | N | N | N |  | ✓ |
| NL | Kingdom of the Netherlands | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| NO | Norway | G | G | G | G | G | G | P | N | G | G |  | ✓ |
| NP | Nepal | G | G | R | P | G | P | N | N | N | N |  | ✓ |
| NR | Nauru | P | G | G | N | G | P | N | N | N | N |  | — |
| NZ | New Zealand | P | G | G | R | G | P | P | N | G | G |  | ✓ |
| OM | Oman | P | G | G | G | G | G | N | N | N | N |  | ✓ |
| PA | Panama | G | G | G | G | P | G | N | N | N | N |  | ✓ |
| PE | Peru | G | G | N | G | G | G | P | N | N | G |  | ✓ |
| PG | Papua New Guinea | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| PH | Philippines | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| PK | Pakistan | P | G | G | G | G | P | N | N | N | N |  | ✓ |
| PL | Poland | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| PT | Portugal | G | G | G | P | G | P | G | G | G | G |  | ✓ |
| PW | Palau | G | G | G | P | G | P | N | N | N | N |  | — |
| PY | Paraguay | G | G | G | G | P | G | N | N | N | P |  | ✓ |
| QA | Qatar | P | G | G | G | G | P | N | N | N | N |  | ✓ |
| RO | Romania | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| RS | Serbia | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| RU | Russia | G | G | G | G | P | G | N | N | N | N |  | ✓ |
| RW | Rwanda | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| SA | Saudi Arabia | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| SB | Solomon Islands | G | G | R | G | G | P | N | N | N | N |  | ✓ |
| SC | Seychelles | G | G | G | G | G | P | N | N | N | P | Afro | — |
| SD | Sudan | G | G | R | P | P | P | N | N | N | P | Afro | — |
| SE | Sweden | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| SG | Singapore | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| SI | Slovenia | G | G | G | G | G | P | G | G | G | G |  | ✓ |
| SK | Slovakia | G | G | G | G | G | G | G | G | G | G |  | ✓ |
| SL | Sierra Leone | G | G | G | P | P | P | N | N | N | P | Afro | ✓ |
| SM | San Marino | R | R | R | R | G | P | N | N | N | N |  | — |
| SN | Senegal | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| SO | Somalia | G | G | R | G | G | P | N | N | N | N |  | — |
| SR | Suriname | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| SS | South Sudan | G | G | G | P | G | P | N | N | N | N |  | — |
| ST | São Tomé and Príncipe | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| SV | El Salvador | G | G | G | P | G | P | N | N | N | N |  | ✓ |
| SY | Syria | G | G | G | G | G | P | N | N | N | N |  | — |
| SZ | Eswatini | G | G | G | G | G | P | N | N | N | P | Afro | — |
| TD | Chad | G | P | N | G | G | P | N | N | N | P | Afro | ✓ |
| TG | Togo | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| TH | Thailand | G | G | R | G | G | P | N | N | N | N |  | ✓ |
| TJ | Tajikistan | P | P | G | G | P | G | N | N | N | N |  | — |
| TL | Timor-Leste | P | G | G | R | P | P | N | N | N | N |  | ✓ |
| TM | Turkmenistan | R | G | G | R | G | P | N | N | N | N |  | — |
| TN | Tunisia | G | G | G | G | G | P | N | N | N | P | Afro | ✓ |
| TO | Tonga | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| TR | Turkey | G | G | G | P | G | G | G | G | G | G |  | ✓ |
| TT | Trinidad and Tobago | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| TV | Tuvalu | G | G | G | P | G | P | N | N | N | N |  | — |
| TZ | Tanzania | G | G | G | G | G | G | N | N | N | P | Afro | ✓ |
| UA | Ukraine | G | G | G | G | G | P | N | N | N | N |  | — |
| UG | Uganda | G | G | G | P | P | P | N | N | N | P | Afro | ✓ |
| US | United States | G | G | G | G | G | G | N | N | N | P |  | ✓ |
| UY | Uruguay | G | G | G | G | G | P | N | N | N | N |  | ✓ |
| UZ | Uzbekistan | G | G | G | G | G | G | N | N | N | N |  | ✓ |
| VC | Saint Vincent and the Grenadines | G | G | P | G | G | P | N | N | N | N |  | ✓ |
| VE | Venezuela | G | G | G | G | G | G | N | N | N | N |  | — |
| VN | Vietnam | G | G | R | G | G | G | N | N | N | N |  | ✓ |
| VU | Vanuatu | P | G | G | N | P | P | N | N | N | N |  | ✓ |
| WS | Samoa | G | G | R | G | G | P | N | N | N | N |  | ✓ |
| YE | Yemen | G | G | R | G | G | P | N | N | N | N |  | — |
| ZA | South Africa | G | G | G | G | P | G | N | N | N | P | Afro | ✓ |
| ZM | Zambia | G | G | P | G | G | P | N | N | N | P | Afro | ✓ |
| ZW | Zimbabwe | G | G | G | G | G | G | N | N | N | P | Afro | — |

---

## 13. Licenze e redistribuzione

| Classe | Fonti | Cosa può entrare nello snapshot |
|---|---|---|
| **Pubblico dominio / CC0** | Wikidata | fatti degli incarichi, date, ID degli enunciati, riferimenti |
| **CC BY 4.0 o equivalenti** (attribuzione e indicazione delle modifiche) | Eurobarometro, BCS (CE), OECD Trust (rapporto), BCE, Eurostat, Banca Mondiale WDI, BIS, ISTAT, INSEE (LO 2.0), ONS (OGL), ESRI (termini JP), BoC, GOV.UK (OGL) | valori aggregati per Paese e data, con formula di attribuzione per fonte |
| **Licenza implicita / da confermare** | Afrobarometer (copyright + citazione obbligatoria, "free to use"), OECD CCI/DF_CS (per fornitore), FMI, ILOSTAT, ONS (testo OGL esatto) | **nulla finché la conferma non è scritta** |
| **Solo riferimento** (link, nessun valore copiato) | Latinobarómetro (redistribuzione vietata), Pew (estratti, licenza revocabile), Ipsos (clausole contraddittorie), rapporti Arab Barometer, RBI, Transparency International CPI (BY-ND), UNODC (non commerciale), protocollo ONU | link alla pubblicazione, con data |
| **Esclusi** | account/modulo/token (ESS, WVS, Asian Barometer, CSES, ISSP, LAPOP, GESIS, election studies, BOK, INEGI); licenze incompatibili (ESS NC-SA, OpenSanctions NC, IPU NC-SA); a pagamento (Gallup, Michigan, Conference Board, FGV, IEA) | nulla |
| **Testi biografici** | Wikipedia (CC BY-SA) | **solo link** (sitelink da Wikidata) |
| **Foto** | Commons (licenze per file: PD, CC BY, BY-SA, diritti della personalità) | **nessuna** copia; al più link alla pagina del file |

"Pubblicamente leggibile" **non** significa "redistribuibile": la colonna J della matrice conta solo il secondo.

---

## 14. Privacy e GDPR (persone viventi)

**Principio:** NEXUM **non crea dossier personali**. Una persona entra in NEXUM **solo perché ricopre o ha ricoperto un incarico pubblico**, e per quella sola attività.

| Aspetto | Proposta |
|---|---|
| **Base giuridica** | Art. 6(1)(f), legittimo interesse: informazione sull'esercizio di funzioni pubbliche. Prima della pubblicazione serve una **valutazione documentata del legittimo interesse** (finalità, necessità, bilanciamento) e una **valutazione d'impatto** se l'insieme è esteso (~38.600 persone, tra cui ~1.825 capi di Stato e di governo probabilmente viventi, più i ministri). |
| **Minimizzazione: campi ammessi** | nome pubblico; identificatori (QID, sito ufficiale); incarico attuale e precedenti con date, istituzione, governo, legislatura, circoscrizione; predecessore e successore; partito o gruppo parlamentare **solo se dichiarato, datato e con riferimento**; studi e professione **solo se documentati e pertinenti al ruolo pubblico**; anno di nascita (non la data completa) solo per disambiguare; luogo di nascita e cittadinanza solo se pertinenti all'incarico. |
| **Campi vietati** | indirizzi, telefoni ed email privati; familiari e coniugi; salute; religione (presente in Wikidata per 2.569 persone); etnia (198); orientamento sessuale; vita privata; patrimonio e social non istituzionali; informazioni speculative; valutazioni, punteggi, ideologia dedotta (incluso ParlGov `left_right`); qualunque inquadramento "PEP" o sanzionatorio. |
| **Art. 9 (opinione politica)** | Appartenenza a un partito solo se resa manifestamente pubblica dall'interessato (art. 9(2)(e)), con data e riferimento. Nessuna aggregazione in profili ideologici. |
| **Provenienza** | Ogni fatto con ID dell'enunciato Wikidata, riferimenti, data di recupero e indicatore di verifica incrociata (GOV.UK, governo.it e simili: solo l'indicatore, mai il contenuto di fonti non redistribuibili). |
| **Rettifica** | Contatto pubblico (issue tracker del repository) e procedura: correzione a monte su Wikidata quando possibile, eccezione locale documentata nello snapshot, tempo di risposta dichiarato. |
| **Rimozione** | Quando appropriato, per un incarico non più pubblico o un ruolo minore: esclusione locale tracciata. I titolari di incarichi apicali restano, perché l'interesse pubblico prevale. |
| **Conservazione** | Lo snapshot riflette lo stato alla data `as_of`; i dati superati non vengono accumulati oltre lo storico degli incarichi; nessun log delle consultazioni. |
| **Foto** | **Nessuna foto conservata o mostrata nella v1.** In futuro, solo se richiesto, link alla pagina Commons con licenza e autore verificati per file. |
| **Viventi / deceduti** | "Deceduto" solo con data di morte (P570) documentata; senza data di morte la persona è trattata come vivente. Per i viventi: niente data di nascita completa, solo fatti di ruolo. |
| **Ambito iniziale proposto** | capi di Stato e di governo (attuali e storici) e ministri attuali di gabinetto. **Non** parlamentari, funzionari, candidati o persone senza incarico apicale. |
| **Gate** | La pubblicazione delle persone viventi resta **NON autorizzata** finché l'autore non approva valutazione del legittimo interesse, procedura di rettifica e rimozione, ed elenco dei campi. |

---

## 15. Verifica privacy dello User-Agent

**Regola permanente** (decisione 9): mai email personale, nomi personali non necessari, percorsi locali o identificativi privati nelle richieste esterne. Solo un identificativo neutro di progetto.

| Controllo | Esito |
|---|---|
| Codice di NEXUM che fa richieste esterne | **OK.** Unico User-Agent nel Core: `NEXUM/0.1.0 (+https://github.com/pezzaliapp/NEXUM; local-first open-data research)` (`nexum/core/scheduler.py`). Tutti i connettori passano dallo scheduler; nessuna richiesta HTTP diretta altrove. |
| UI | **OK.** `ui/src/snapshot/client.ts` legge `navigator.userAgent` solo localmente (avviso sullo storage di Safari); nessun invio. |
| Sito pubblicato e snapshot | **OK.** Nessun percorso locale né email in `data/deploy/web-live` (JSON verificati per intero; 307 file `.jgz` campionati). |
| Richieste di questo supplemento | **OK.** Tutte con `NEXUM-audit/0.2 (+https://github.com/pezzaliapp/NEXUM)`, regola dichiarata nei prompt delle verifiche. Gli script di audit nello scratch non contengono l'email (l'unica email trovata è quella pubblica di un distributore sloveno, dentro un dataset scaricato). |
| **Esposizione residua 1 (risolta il 2026-10-04: percorso sostituito con `<LOCAL_PATH>/OSIRIS-REFERENCE`)** | `NEXUM-OSIRIS-CODE-AUDIT.md`, **già pubblicato nel repository pubblico**, contiene due volte il percorso locale `/Users/…/Projects/OSIRIS-REFERENCE`. Non va in alcuna richiesta ma è pubblico. **Proposta:** sostituirlo con `$NEXUM_OSIRIS_REFERENCE` in un prossimo commit approvato. Anche `NEXUM-PHASE3-SPEC.md` (non versionato) lo cita come problema storico. |
| Esposizione residua 2 (informativa) | I commit pubblici portano nome ed email dell'autore (regola di sola paternità). È una scelta dell'autore, non una richiesta a terzi; GitHub offre un indirizzo `noreply` se lo si desidera. |
| Incidente del 2026-10-03 | Alcune richieste a query.wikidata.org con l'email nello User-Agent; non annullabile lato Wikimedia. Nessun'altra esposizione trovata. |

---

## 16. Modello dati proposto (senza modificare il Core)

Il Core ha già validità temporale su oggetti, relazioni e claim (`valid_from_ms`/`valid_to_ms`) ed evidenze con riferimento al record grezzo: **nessuna modifica di schema**, solo nuovi tipi nel vocabolario e nuovi connettori, da approvare.

### 16.1 Governi e persone

| Tipo | Natura | Note |
|---|---|---|
| `place.country` (esistente) | oggetto | — |
| `gov.office` | oggetto | QID, giurisdizione, tipo (capo di Stato / capo di governo / vice / ministro / altro), alias e successori dell'ufficio (mappa curata per Stato, perché gli uffici sono frammentati e rinominati) |
| `gov.government` (gabinetto) | oggetto | QID, inizio/fine (P571/P576 o P580/P582); membri **solo** dagli incarichi |
| `gov.legislature`, `gov.legislative_term` | oggetti | solo via P1001/P13188 (non P17: porterebbe migliaia di mandati regionali) |
| `person.public_official` | oggetto | solo campi ammessi (§14) |
| `gov.party` | oggetto | QID, etichetta |
| `has_office`, `held_by [da, a)`, `member_of_party [da, a)`, `part_of_government [da, a)`, `member_of_legislature [da, a)` | relazioni con validità | precisione della data, rango, `acting`, predecessore e successore come attributi; evidenza = ID dell'enunciato + riferimenti |
| Freschezza | attributi | `valid_from`, `valid_to`, `retrieved_at`, `source_updated_at` (revisione Wikidata), `last_verified` (fonte ufficiale) |

### 16.2 `PublicOpinionObservation`

Un claim sull'oggetto Paese (o area), con validità uguale al periodo di campo.

| Campo | Esempio |
|---|---|
| `indicator` (vocabolario controllato) | `trust.government` · `economy.expect_12m` · `direction.country` · `concern.cost_of_living` |
| `question_original`, `question_language`, `question_id_in_wave` | QA2.3 … (il testo è la chiave di confrontabilità) |
| `answer` / `answer_scale` | "better" su better/worse/same/DK |
| `value`, `unit`, `statistic` | 16 · `%` · `share` (oppure `balance`, `index`, `median`, `mean`) |
| `geographic_scope`, `population` | IT · "residenti ≥ 15 anni" |
| `fieldwork_start`, `fieldwork_end`, `publication_date`, `retrieved_at` | 2026-03-12 · 2026-04-05 · … |
| `sample_size`, `weighting`, `seasonal_adjustment` | 1.021 · pesato · NSA |
| `methodology`, `polling_mode`, `probability_sample` | CAPI/CAWI · `true` / `false` (online non probabilistico) |
| `margin_of_error` / `se` / `ci_low`, `ci_high`, `deff_assumed` | dichiarato dalla fonte oppure calcolato (§10) |
| `source`, `dataset`, `wave`, `license`, `attribution` | Eurobarometro · EB105 · CC BY 4.0 |
| `provenance` | file, foglio, riga, sha256 del file |
| `comparable_series_id` | `EB:QA2.3:economy_country:share_better` (le frecce solo dentro la stessa serie) |
| `evidence` | link al record grezzo |

**Realtà:** `OfficialStatisticObservation`, stessa struttura senza i campi di sondaggio (indicatore, valore, unità, periodo, stima flash o definitiva, fonte, licenza).

### 16.3 Criteri di freschezza

| Dominio | CURRENT | RECENT | HISTORICAL | STALE |
|---|---|---|---|---|
| Incarichi | aperto alla data `as_of` e verificato (Wikidata settimanale; verifica ufficiale ≤ 30 giorni dove esiste) | — | concluso | aperto ma superato da un successore, oppure ministro non verificato da oltre 60 giorni dopo un rimpasto noto: badge "può non essere aggiornato" |
| Sondaggi mensili (BCS, BCE, ONS, ESRI) | campo ≤ 2 mesi fa | ≤ 12 mesi | > 12 mesi (serie storica) | serie interrotta o sospesa (es. Estonia), oppure mese mancante |
| Sondaggi semestrali/annuali (Eurobarometro, OCSE, Afrobarometer) | ultima ondata e campo ≤ 12 mesi fa | ≤ 24 mesi | ondate precedenti | > 24 mesi senza nuova ondata |
| Realtà (Eurostat mensile, WDI annuale) | ultimo periodo pubblicato | ≤ 1 anno (WDI ≤ 2 anni) | — | oltre questi limiti |

---

## 17. Relazioni tra domini

| Relazione | Natura | Significato ammesso |
|---|---|---|
| Paese → **governato attraverso** → Governo [da, a) | fatto documentato | "governo in carica dal …" |
| Ufficio → **ricoperto da** → Persona [da, a) | fatto documentato | "dal … ricopre …" |
| Persona → **ha ricoperto** → Ufficio [da, a) | fatto documentato | storia degli incarichi |
| Evento → **avvenuto durante il mandato di** → Persona/Governo | contesto temporale | "avvenuto durante il mandato di X" (mai causa) |
| Paese → **ha osservazione** → `PublicOpinionObservation` | misura | "il sondaggio Y ha rilevato il Z% (campo …)" |
| `PublicOpinionObservation` → **misura** → indicatore (es. percezione economica) | definizione | — |
| Paese → **ha osservazione** → `OfficialStatisticObservation` / `FuelPriceObservation` | misura | — |
| Periodo di governo ↔ osservazione di opinione | **solo affiancamento temporale** | "Durante questo periodo il sondaggio Y ha rilevato…" (**mai** "il governo ha causato") |
| Strada → **soggetta a** → Schema di pedaggio · Evento → **entro R** → Webcam | come nel Discovery Audit | — |

Nessuna relazione causale senza un'evidenza che la dichiari.

---

## 18. Proposta UX (non implementare)

### 18.1 Vista Paese

Sezioni generate dal vocabolario (regola W9: la UI non contiene parole di dominio).

1. **PANORAMICA** (risposta in una frase, solo dati presenti): "Repubblica parlamentare · Capo dello Stato: X (dal …) · Capo del governo: Y (dal …) · 'Costo della vita' primo problema per il 36% (Eurobarometro, primavera 2026)".
2. **GOVERNO:** capo dello Stato · capo del governo · governo · ministri principali → "Vedi tutti". I ministri hanno il badge "verificato il …" oppure "può non essere aggiornato".
3. **OPINIONE PUBBLICA**, cioè "Cosa pensa la popolazione":
   - principali preoccupazioni;
   - economia (ora e tra 12 mesi);
   - fiducia nelle istituzioni;
   - aspettative sul futuro.
   - Ogni dato mostra **VALORE · DATA · FONTE**. Approfondimento: **DOMANDA · CAMPIONE · METODOLOGIA · STORICO · EVIDENZA**.
   - Le frecce seguono la regola del §10. Altrimenti si vede "→ nessuna variazione significativa" oppure "non confrontabile".
4. **ECONOMIA:** realtà (inflazione, disoccupazione) e percezione affiancate, con fonti separate, senza indici.
5. **EVENTI** · **INFRASTRUTTURE** · **WEBCAM** · **CARBURANTI** · **PEDAGGI** (come nel Discovery Audit).
6. **EVIDENZE e FONTI**, poi **Dettagli tecnici** (chiuso).

Dove non ci sono dati di opinione (78 Stati), la sezione dice esplicitamente: "Nessun sondaggio con licenza aperta disponibile per questo Paese", con link alle fonti di solo riferimento quando esistono.

### 18.2 Vista Persona

Esiste solo per titolari di incarichi pubblici.
- Nome · incarico attuale · dal … · affiliazione documentata (con fonte).
- **Nessuna foto** nella v1.
- → **Storia degli incarichi** (timeline datata).
- → **Biografia documentata** (frasi a modello, ognuna con evidenza; ciò che manca non si scrive).
- → **Fonti**.
- Pulsante "Segnala un errore" (procedura di rettifica).

### 18.3 Vista Evento

Riga di contesto: "Avvenuto durante il mandato di Y (capo del governo) · Fonte: Wikidata [ID]". Se l'esito è `ambiguo`, si mostrano i candidati; se `nessun dato`, non si scrive nulla.

---

## 19. Snapshot e prestazioni (packaging per dominio)

| Pacchetto | Contenuto | Righe/oggetti (stima) | Dimensione |
|---|---|---|---|
| `gov` (2–3 file) | uffici (~7.250), incarichi `held_by` (62.814, misurati), persone (~38.600, solo campi ammessi), gabinetti e legislature | — | **misurato:** incarichi 8,35 MB grezzi / 2,5 MB gzip. **Stimato:** totale ~16–19 MB grezzi / **~5–6 MB gzip**; con l'ambito ridotto del §14 (capi di Stato e di governo storici + ministri attuali) ~1,5–2,5 MB gzip |
| `opinion` (1–2 file) | Eurobarometro (36 Stati × ~40 indicatori × 4 ondate ≈ 6k valori); BCS (33 × 13 serie × ~490 mesi ≈ 210k); BCE, OCSE Trust, ONS, ESRI, BoC | ~230k osservazioni | stima **~1,5–2,5 MB gzip** (riferimento misurato: 262k valori del Weekly Oil Bulletin = 1,41 MB gzip) |
| `reality` (1 file) | WDI (193 × 3 indicatori × 10 anni), Eurostat mensile UE, BIS | ~30–60k | **< 1 MB gzip** |
| **Totale** | — | — | **~3–9 MB gzip**, **≤ 6 file** (snapshot 8.834 → ≤ 8.840; margine su O7 = 9.000 preservato) |

- **Memoria nel browser:** i pacchetti si caricano **solo all'apertura** di un Paese, di una persona o della sezione Opinione (mai all'avvio: O6 invariato). Il pacchetto `gov` completo in JSON (~19 MB grezzi) sarebbe pesante sul telefono. **Proposta:** pacchetto `gov` come database SQLite letto da sqlite-wasm (lo stesso motore della ricerca attuale), interrogato per Paese e salvato in IndexedDB; memoria limitata alle righe lette. In alternativa, 3–4 frammenti per continente (sempre per dominio, pochi file).
- **Tempo di build (stima, n/v):**
  - Wikidata: ~150–300 query sequenziali (< 30 s ciascuna, con pause), cioè **~30–60 minuti** a settimana in GitHub Actions;
  - opinione e realtà: pochi minuti;
  - nessun costo, nessun servizio a consumo.

---

## 20. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Ministri non aggiornati dopo un rimpasto (JP, ZA) | informazione errata su persone reali | badge "può non essere aggiornato", data `as_of`, verifica ufficiale dove gratuita (GOV.UK, governo.it, ecc.), segnalazione errori |
| Enunciati sbagliati o vandalici (personaggi di finzione, enunciato preferito sull'India) | attribuzione errata | filtri del §6, conflitti segnalati, controlli di qualità in build, esito `ambiguo` |
| Persone viventi (GDPR) | legale e reputazionale | §14; gate di pubblicazione |
| Opinione letta come giudizio o causa | distorsione | testi fissi, nessun indice composito, regola delle frecce, metodologia sempre visibile |
| Campioni online non probabilistici | sovra-interpretazione | indicatore metodologico obbligatorio |
| Rotture di serie (Polonia, Estonia, Italia 2026-09, Giappone) | falsi trend | elenco delle rotture per serie; nessuna freccia attraverso una rottura |
| Licenze implicite (Afrobarometer) | redistribuzione non autorizzata | CONDITIONAL fino a conferma scritta |
| URL instabili (BCS rinominata ogni mese, Eurostat `manr`→`minr`, ID dei file EB) | ingest rotto o fermo senza errori | controllo di freschezza in build: una serie ferma diventa STALE e allarme |
| Copertura disomogenea (78 Stati senza opinione) | falsa impressione di completezza | copertura dichiarata in UI, "nessun dato" esplicito |
| Esposizione del percorso locale nel repository pubblico | privacy | correzione proposta (§15) |

---

## 21. Raccomandazioni finali

### 21.1 Tabella delle decisioni

| Capacità | Copertura | Freschezza | Redistribuibile | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|
| Governi attuali | 156 GOOD / 189 | settimanale (Wikidata) | sì (CC0) | sì | medio (membri dai ministri) | **CONDITIONAL GO** (gabinetto = entità; coalizioni non derivabili) |
| Capi di Stato | 179 GOOD / 188 | settimanale | sì | sì | basso con i filtri | **CONDITIONAL GO** (gate GDPR) |
| Capi di governo | 160 GOOD / 172 | settimanale | sì | sì | basso-medio | **CONDITIONAL GO** (gate GDPR) |
| Ministri | 148 GOOD; 79% corretti nel campione | in ritardo dopo i rimpasti | sì | sì | **alto** | **CONDITIONAL GO** con badge e `as_of`, dopo C2 |
| Titolari storici | 169 GOOD | stabile | sì | sì | basso (pochi riferimenti) | **GO** dopo il gate GDPR (molti sono deceduti) |
| Biografie politiche | F: 61 GOOD / 188 PARTIAL; fonte istituzionale 35% | settimanale | sì (solo fatti; Wikipedia solo link) | sì | medio | **CONDITIONAL GO** (solo frasi da enunciati, campi ammessi) |
| Foto dei politici | 93% presenti, licenze eterogenee | — | per file, con BY-SA e diritti della personalità | sì | alto | **NO-GO** v1 (al più link) |
| Opinione pubblica | 50/193 (98 con Afrobarometer) | semestrale / mensile | sì (ACCEPT) | sì | medio | **CONDITIONAL GO** (Afrobarometer da confermare) |
| Indicatori di fiducia | 36 (EB) + 38 (OCSE) → 50 | semestrale / triennale | sì | sì | medio (online OCSE) | **GO** |
| Percezione economica | 36 EB + 32 BCS mensile + JP + CA | mensile | sì | sì | basso | **GO** |
| Problemi principali | 36 EB + GB (ONS) + 38 OCSE (3 problemi) | semestrale / mensile | sì | sì | basso | **GO** |
| Aspettative sul futuro | 38 (82 con Afrobarometer) | mensile / semestrale | sì | sì | basso | **GO** (EB, BCS, JP, CA); Afrobarometer CONDITIONAL |
| Direzione giusta/sbagliata | 36 (EB D73.1) + Afrobarometer | semestrale | sì | sì | basso | **GO** (EB); Ipsos e Latinobarómetro **REFERENCE ONLY** |
| Trend confrontabili | 45 (32 mensili con errore calcolabile) | — | sì | sì | medio (rotture) | **GO** con la regola del §10 |
| Confronto realtà/percezione | 160 realtà; percezione 36–38 | mensile / annuale | sì | sì | medio (strumenti diversi) | **GO** come affiancamento, **mai** come indice |

### 21.2 Verifica di realtà

**A. Possiamo mostrare chi governa OGGI quasi ovunque?**
Sì per i vertici: capo di Stato affidabile in 179/193 (185 utilizzabili), capo di governo in 160/193 (172). Per i ministri no in modo garantito: 148 GOOD, 79% corretti nel campione verificato.

**B. Una storia utile degli incarichi?**
Sì: 169/193 Stati con almeno il 90% del periodo 1990–2025 coperto; lookup "durante il mandato di" univoco in 17/17 test, con l'algoritmo rivisto.

**C. Quanto sono complete le biografie?**
Parzialmente:
- nascita e professione ~100%;
- studi 79–86%;
- incarichi precedenti datati ~50%;
- partito con data 22–28%;
- fonte istituzionale 35% (0% negli Stati deboli).

Bastano per una "biografia documentata" breve, non per biografie ricche.

**D. Opinione RECENTE?**
50/193 con fonti ACCEPT; 98 con Afrobarometer; ~90 recenti se si contassero le fonti di solo riferimento (non redistribuibili).

**E. COME LA POPOLAZIONE VEDE IL FUTURO?**
38/193 (ACCEPT); 82 con Afrobarometer.

**F. TREND confrontabile?**
45/193; con errore campionario calcolabile e cadenza mensile, 32 Stati (BCS).

**G. Quanto è redistribuibile?**
- Governi: tutto ciò che viene da Wikidata (CC0), ma le foto no.
- Opinione: 50 Stati sicuri, 48 condizionati.
- Realtà: 160.

**H. REFERENCE ONLY.**
Latinobarómetro, Pew, Ipsos, rapporti Arab Barometer, RBI, Transparency International CPI, UNODC, protocollo ONU, CIA World Leaders (verifica), Wikipedia (link).

**I. Esclusi per account, API key o pagamento.**
- Account, modulo o token: ESS, WVS/EVS, dati Arab Barometer, dataset Pew, Asian Barometer, CSES, ISSP, LAPOP, GESIS, election studies (ANES, BES, GLES, ITANES), BOK ECOS, INEGI.
- A pagamento o con divieti: Gallup, Michigan, Conference Board, FGV, IEA, OpenSanctions (NC).

**J. Massimo realistico a €0.**
- Vertici dello Stato per **~185 Stati** con storico.
- Ministri per **~150–175 Stati** con badge di freschezza.
- Opinione per **50 Stati** (Europa, OCSE, alcuni in America Latina), **~98** se Afrobarometer conferma.
- Aspettative per **38 (82)**.
- Trend mensili statisticamente controllati per **32**.
- Realtà ufficiale per **160**.

**K. Ha senso farne una parte importante di NEXUM?**
**Sì**, come "contesto del Paese", perché collega eventi, governi e percezione con evidenze verificabili ed è quasi globale per i vertici. **Ma non è un dominio "mondiale" per l'opinione**: va presentato con la copertura reale dichiarata, senza giudizi, senza indici compositi e senza causalità.

### 21.3 Ordine di implementazione raccomandato

| Ordine | Blocco | Perché |
|---|---|---|
| **A** | Collisioni delle etichette del Grafo + gerarchia del dettaglio | difetti già visti nel test fisico; solo UI |
| **B** | Webcam (5 fonti ACCEPT, CSP con allowlist) | pronto, nessun rischio legato alle persone |
| **C1** | **Opinione pubblica e realtà** (Eurobarometro, BCS, BCE, OECD Trust, ONS, ESRI, BoC; Eurostat, WDI, BIS) | dati aggregati, licenze aperte, **nessuna persona coinvolta**; Afrobarometer dopo conferma scritta |
| **C2** | **Capi di Stato e di governo** attuali e storici + "durante il mandato di" | dopo il **gate GDPR** (§14) |
| **C3** | **Ministri** con badge di freschezza e verifica ufficiale dove gratuita | il dato più fragile: ultimo del blocco C |
| D | Prezzi carburanti | come nel Discovery Audit |
| E | Pedaggi automatici | come nel Discovery Audit |
| F | Agevolazioni + pedaggi trascritti | come nel Discovery Audit |
| G | Motore di costo di percorrenza locale | come nel Discovery Audit |

**Decisioni richieste all'autore prima del GO:**
1. Confermare l'ordine (con la divisione C1 / C2 / C3).
2. **Gate GDPR:** approvare valutazione del legittimo interesse, campi ammessi e vietati, rettifica e rimozione, ambito iniziale (capi di Stato e di governo + ministri attuali).
3. **Afrobarometer:** autorizzare una richiesta scritta di conferma (da un indirizzo di progetto, non personale) per la redistribuzione delle percentuali derivate.
4. Correggere in un commit approvato il percorso locale in `NEXUM-OSIRIS-CODE-AUDIT.md`.
5. Foto: confermare NO-GO nella v1.

---

*Fine del supplemento. Nessuna implementazione avviata. In attesa di GO.*
