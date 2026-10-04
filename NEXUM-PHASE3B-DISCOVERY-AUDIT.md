# NEXUM — Fase 3B: discovery audit

**Webcam pubbliche · governi e incarichi pubblici · carburanti · agevolazioni accise · pedaggi · costo di percorrenza**

**Versione:** 0.1 · **Data:** 2026-10-03 · **Autore:** Alessandro Pezzali
**Stato:** solo ricerca, audit e proposta. **Nessuna implementazione.**
- Nessun codice applicativo scritto.
- Nessuna modifica a Core, regole, dati, snapshot, confidence o evidence.
- Nessuna modifica alla resa giorno/notte NASA/VIIRS.
- Nessun deploy, nessun commit, nessun push; production e DNS/E3 intatti.
- In attesa di GO.

**Base:** mondo `live` pubblicato (snapshot `live-95-20261002T040502Z-9cea4a00`: 8.834 file, 892 MB), preview `live-review`.

**Metodo.** Ogni numero, clausola di licenza, header CORS e limite di frequenza qui riportato proviene da richieste reali fatte il 2026-10-03: file scaricati, API interrogate, query SPARQL eseguite, pagine dei termini lette. Legenda:
- **(F)**: verificato con un fetch diretto.
- **(W)**: pagina ufficiale letta.
- **(S)**: solo estratto di un motore di ricerca, verifica incompleta.
- **n/v**: non verificato.

I file grezzi dell'audit sono fuori dal repository (scratchpad di sessione) e non fanno parte del progetto.

---

## 1. Executive summary

| Capacità | Esito | In una riga |
|---|---|---|
| **Webcam pubbliche** | **CONDITIONAL GO** | 6.721 camere da 5 fonti originali senza chiave e con licenza aperta (USA, Canada-BC, Finlandia); solo immagine corrente su richiesta. L'Europa continentale è quasi assente. |
| **Governi e incarichi** | **CONDITIONAL GO** | Wikidata (CC0) copre 192/193 capi di Stato e 187/193 capi di governo in carica, con storico datato. La qualità richiede controlli automatici, e prima della pubblicazione di persone viventi servono valutazione GDPR e procedura di rimozione. |
| **Prezzi carburanti** | **CONDITIONAL GO (33/193)** | Copertura affidabile: UE-27 + UK, US, CA, BR, MY, AU (livello statale). Componenti fiscali solo per UE-27, UK e Thailandia. **Nessuna copertura mondiale.** |
| **Agevolazioni accise trasporto** | **CONDITIONAL, sola curatela** | Non esiste alcun dataset strutturato delle aliquote di rimborso. Si possono documentare a mano 4 schemi certi (quadro UE art. 7, IT, FR, ES) e circa 7 realistici. |
| **Pedaggi e costi infrastrutturali** | **CONDITIONAL GO** | Solo 4 sistemi hanno tariffe ufficiali leggibili da macchina (DE camion, NO, HR, UK Dartford), più le fasce di prezzo US/FHWA. Circa 25 sistemi europei sono trascrivibili a mano da atti ufficiali. Le tariffe dei concessionari francesi sono protette. |
| **Costo di percorrenza (route cost)** | **CONDITIONAL GO solo servizio locale**; **NO-GO** routing live sul sito statico | Nessun motore open source calcola gli importi dei pedaggi: servirebbe un motore tariffario NEXUM. Il costo aziendale completo del trasporto è **NO-GO** come dato: solo parametri inseriti dall'utente. |

Il valore per NEXUM non sta nei dataset in sé ma in **tre nuovi tipi di contesto**, tutti evidence-first e senza causalità:
1. **Prossimità verificabile** (evento → webcam, ponte, tunnel, tratta a pedaggio entro un raggio dichiarato).
2. **Contesto istituzionale alla data dell'evento** (chi ricopriva un incarico in quel giorno, con l'enunciato Wikidata come evidenza).
3. **Contesto economico del Paese** (prezzo del gasolio, accise, regime di pedaggio validi in quella data).

**Due vincoli architetturali emersi dall'audit** (§12):
- Il budget di file dello snapshot (O7 ≤ 9.000) lascia solo **166 file** liberi.
- Il test W9 vieta parole di dominio nella UI: le sezioni Paese/Webcam/Carburanti devono nascere dal vocabolario, non dal codice.

---

## 2. Webcam pubbliche

### 2.1 Fonti

CORS verificato con `curl -I` e header `Origin`. Per `<img>` il CORS non serve; serve per canvas e hls.js.

| Fonte | Autorità | Area | Camere (come misurate) | Live/still · aggiornamento | Formato | CORS | Licenza/ToS | Chiave | Ingest statico | Runtime browser | Attribuzione | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Caltrans CWWP2 `cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json` | California DOT | California (12 distretti) | **3.591** (3.395 in servizio; 2.305 con HLS), contando i 12 JSON (F) | still ~5 min; HLS live | JPEG ~13 KB, HLS | `*` (F) | "considered in the public domain" ([conditions-of-use](https://dot.ca.gov/conditions-of-use)) (W); immagini "neither retained nor archived" (W) | no | sì | sì | consigliata | PASS | basso | **ACCEPT** |
| Fintraffic Digitraffic weathercam `tie.digitraffic.fi/api/weathercam/v1/stations` | Fintraffic | Finlandia | **809** stazioni, 2.275 inquadrature (F) | still (~10 min, n/v) | JPEG ~300 KB | `*` (F) | CC BY 4.0 ([terms](https://www.digitraffic.fi/en/terms-of-service/)) (W) | no (gzip obbligatorio, header `Digitraffic-User` consigliato) | sì | sì | **obbligatoria** | PASS | risoluzione alta (§2.3) | **ACCEPT** |
| DriveBC `www.drivebc.ca/api/webcams/` | BC Ministry of Transportation | British Columbia | **1.066** (1.045 attive) (F) | still, mediana 900 s | JPEG ~44 KB | lista no, JPEG `*` (F) | OGL-BC (comunicato 2016 + repo `bcgov/drivebc-webcam-api`) (W); licenza non ribadita sull'endpoint attuale | no | sì (build) | sì | OGL-BC + campo `credit` per camera (82 camere, es. City of Vancouver) | PASS | medio: endpoint dall'aspetto interno | **ACCEPT** |
| USGS HIVIS/NIMS `api.waterdata.usgs.gov/nims/cameras` | USGS | USA (49 stati) | 1.356; **1.101** con `hideCam=false` (F) | still ~15 min | JPEG su S3 | API `*`, S3 no (F) | opera federale, pubblico dominio; pagina copyright USGS in errore 502 il giorno dell'audit (n/v) | no (`x-ratelimit-limit: 2000`) | sì | sì | "USGS" | PASS | basso (fiumi) | **ACCEPT** |
| AVO Ashcam API `avo.alaska.edu/ashcam-api/webcamApi/webcams` | Alaska Volcano Observatory (USGS/UAF) | Alaska, alcune HVO/YVO | 396 totali; **154 non-FAA** (F) | still, minuti | JPEG | `*` (F) | ToS esplicite non trovate (n/v) | no | sì | sì | AVO/USGS | PASS | camere stagionali; le immagini FAA ospitate vanno escluse | **ACCEPT (solo non-FAA)** |
| NZTA `trafficnz.info/service/traffic/rest/4/cameras/all` | Waka Kotahi | Nuova Zelanda | **313** (255 online) (F) | still ~30 s (S) | JPEG ~74 KB | no | CC BY 4.0 + termini NZTA (S: la pagina restituisce solo una shell JS) | no | sì | sì | CC BY | PASS | basso-medio | **CONDITIONAL**: termini da leggere a mano |
| Vegagerðin `gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1` | Islanda, strade e coste | Islanda | **496** inquadrature, 165 siti (F) | still ~5 min | JPEG ~108 KB | no | licenza libera perpetua, attribuzione "Based on data from Vegagerðin", rispetto della privacy (S) | no | sì | sì | obbligatoria | PASS | basso | **CONDITIONAL**: termini da leggere a mano |
| WSDOT `data.wsdot.wa.gov/mobile/Cameras.json` | Washington DOT | Washington | 1.706 (F); alcune URL 404 | still | JPEG | no | n/v; l'API ufficiale richiede un codice gratuito via email | (codice gratuito) | sì | sì | ? | PASS | medio | **CONDITIONAL** |
| Statens vegvesen (DATEX) | NPRA | Norvegia | n/v (accesso su richiesta) | still | JPEG | — | NLOD | utente DATEX gratuito | sì (con credenziali) | sì | NLOD | PASS | basso | **CONDITIONAL**: registrazione |
| Trafikverket | Trasporti, Svezia | Svezia | n/v (401 senza chiave) | still | JPEG | — | CC0 (S) | chiave gratuita | sì | sì | — | PASS | basso | **CONDITIONAL**: chiave |
| Famiglia "511" (ON, AB, NS, GA, AZ), Ohio OHGO, 511NY, Danimarca | DOT/province | CA, US, DK | n/v (chiave) | still | JPEG | — | termini non trovati o parziali | chiave gratuita | sì | ? | ? | PASS | medio | **CONDITIONAL** |
| Autobahn GmbH `verkehr.autobahn.de/.../webcam` | Autobahn GmbH | Germania | **0** su 110 autostrade (F) | — | — | — | — | no | — | — | — | — | — | **REJECT** (vuoto) |
| FAA WeatherCams | FAA | Alaska e altri | 401 (F) | — | — | — | nessuna API pubblica | — | no | — | — | — | alto | **REJECT** |
| Windy Webcams API v3 | Windy.com (aggregatore commerciale) | mondo | 403 senza chiave (F) | still/timelapse | URL che scadono dopo 10 min nel livello gratuito (W) | — | [docs](https://api.windy.com/webcams/docs) | chiave | **no** | solo con chiamata runtime | sì | (piano gratuito con upsell) | alto | **REJECT** |
| OSM `contact:webcam` | contributori OSM | mondo | **9.787** oggetti (taginfo); quasi tutti link a portali (F) | misto | perlopiù pagine HTML | — | ODbL (share-alike sul database derivato) | no | sì | solo link esterno | © OpenStreetMap | PASS | siti arbitrari | **CONDITIONAL**: solo metadati come link, mai incorporati |
| OSM `surveillance:type=camera` | — | mondo | 383.181 (taginfo) | — | — | — | — | — | — | — | — | — | infrastruttura di sorveglianza | **REJECT** (fuori dai principi NEXUM) |
| EarthRadar, Webcamtaxi, Skyline e simili | aggregatori commerciali | — | — | — | — | — | — | — | — | — | — | — | — | **REJECT**: aggregatori, si usano le fonti originali |

Non esaminati: UK National Highways, Paesi Bassi, Francia, Italia (ANAS/Autostrade), Giappone, Transport NSW (chiave), Québec, webcam di porti, aeroporti e spiagge.

### 2.2 Copertura reale

- **ACCEPT oggi: 6.721 camere.** Circa 6.500 attive; 8.187 viste se si contano le inquadrature finlandesi.
- **Con i due termini da confermare: 7.530** (+ NZ 313, + Islanda 496).
- **Paesi:** 3 (USA parziale, Canada solo BC, Finlandia). In attesa di conferma: NZ, IS. Con chiavi gratuite: NO, SE, DK, ON, AB, OH, WA, NY, GA, AZ.
- **Buchi:**
  - quasi tutta l'Europa continentale (DE 0; nessuna fonte aperta trovata per UK, FR, IT, ES, NL, IE);
  - America Latina, Africa, Medio Oriente, Asia, Australia;
  - gli USA fuori dalla California senza le fonti a chiave.

### 2.3 Note tecniche e privacy

- **Immagine corrente su richiesta, senza archivio.**
  - Lo snapshot contiene solo l'URL stabile dell'immagine, mai i byte.
  - Al tocco su "Mostra immagine attuale": `<img src="URL?t=<ora>" referrerpolicy="no-referrer">`. Nessun polling, nessun canvas, nessun proxy.
  - Mostra l'ora dell'immagine dichiarata dalla fonte quando la lista la riporta.
  - In caso di errore: "camera non disponibile".
  - Non si usano mai gli endpoint di archivio o timelapse (Caltrans `referenceImage*`, HIVIS `tlDir`, archivi AVO).
- **CSP: modifica di policy da approvare.**
  - Andrebbe aggiunto a `img-src`: `cwwp2.dot.ca.gov`, `weathercam.digitraffic.fi`, `www.drivebc.ca`, `usgs-nims-images.s3.amazonaws.com`, `avo.alaska.edu`.
  - L'HLS richiederebbe anche `media-src`, `connect-src` e `worker-src`, più hls.js nel bundle (licenza da verificare). **Proposta: v1 solo immagini fisse; HLS (solo Caltrans) eventualmente dopo, come opt-in.**
- **Privacy.**
  - Camere fisse di infrastruttura (strade, fiumi, vulcani). Nessuna analisi dell'immagine, nessun riconoscimento, nessuna conservazione, nessuna funzione "segui lungo le camere".
  - Le immagini finlandesi (~300 KB) possono rendere leggibili targhe o persone vicine: NEXUM mostra solo ciò che l'autorità già pubblica, e solo su richiesta.

### 2.4 Relazioni proposte

| Relazione | Base | Nota |
|---|---|---|
| `Event —entro_raggio{km, R}→ Camera` | distanza haversine ≤ R (R dichiarato nella regola, es. 25 km) | etichetta "webcam vicina", **mai** "webcam che mostra l'evento" |
| `Camera —gestita_da→ Organization` | campo della fonte | licenza e credito come attributi |
| `Camera —osserva→ Object` | **solo** se la fonte lo dichiara | HIVIS `nwisId` → stazione idrometrica; AVO `vnum` → vulcano; Caltrans `route` → strada |
| `Camera —in→ area amministrativa` | point-in-polygon su confini esistenti | contesto geografico, non connessione |

**Dimensione:** 364 B per camera in JSON minificato, ~42 B gzip (misurato su 756 camere Caltrans). Per 6.721 camere: ~2,4 MB grezzi, **~0,3–0,6 MB gzip**.

---

## 3. Governi e titolari di incarichi pubblici

### 3.1 Fonti

| Fonte | Autorità | Paesi (misurati) | Dati | Freschezza | Licenza/ToS | Chiave | Limiti | CORS | Statico | Runtime | Attribuzione | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wikidata SPARQL** `query.wikidata.org` | Wikimedia (comunitaria) | P35 su 193/193; P6 su 188/193 | capo di Stato e di governo (P35/P6), forma di governo (P122), incarichi (P39) con inizio/fine (P580/P582) e predecessore/successore (P1365/P1366), partito (P102), uffici, ID enunciato, riferimenti | vivo; inizio più recente visto 2026-09-27 (F) | "released into the public domain under Creative Commons Zero" ([Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) (W) | no | 60 s di calcolo ogni 60 s per user-agent+IP; 30 query in errore al minuto; 5 parallele; timeout 60 s; 429 con Retry-After (W) | `*` (F) | **sì**, query a lotti in GitHub Actions | sconsigliato (timeout 504 a 65 s osservato) | facoltativa (CC0); citare comunque l'ID dell'enunciato | PASS | qualità (§3.2), vandalismi | **ACCEPT** come base, con controlli di qualità |
| Dump Wikidata | Wikimedia | tutti | JSON completo / N-Triples truthy | `latest-all.json.bz2` **103 GB** (F) | CC0 | no | — | — | **no** su CI gratuito; il truthy non ha qualificatori, quindi niente date | no | — | PASS | disco | **REJECT** per la CI |
| CIA World Leaders | CIA | 199 voci, 5.764 nomi (F) | solo nome e titolo attuali, senza date | dichiarato settimanale, ma campione IT fermo al 2025-03-14 (F) | pubblico dominio salvo indicazione (W). Il World Factbook è stato **chiuso il 2026-02-04** (W) | no | robots vieta `/*.json$` | n/v | HTML, con cortesia | no | "CIA World Leaders" | PASS | dati vecchi, nessuna data | **CONDITIONAL**: solo controllo incrociato |
| UN Protocol "Heads of State…" | ONU | tutti i membri (PDF di 60 pagine) | capo di Stato e di governo, ministro degli esteri, **data di nomina** | PDF del 19/09/2026 (F) | riproduzione vietata senza permesso scritto (W) | no | — | — | parsing possibile, redistribuzione no | no | — | PASS | copyright | **REJECT** come contenuto; solo controllo manuale, senza conservarne nulla |
| GOV.UK Content API `/api/content/government/ministers` | Governo UK | 1 | ruoli con `started_on`/`ended_on`; PM con 81 nomine dal 1721; 23 ministri di gabinetto (F) | 2026-07-28 | OGL v3.0 (W) | no | n/v | `*` (F) | sì | — | OGL | PASS | basso | **ACCEPT** come verifica ufficiale UK |
| governo.it | Presidenza del Consiglio | 1 | ministri e sottosegretari (HTML) | n/v | CC BY 3.0 IT ([note legali](https://www.governo.it/it/note-legali)) (W) | no | n/v | n/v | parsing HTML | no | CC BY | PASS | HTML fragile | **CONDITIONAL**: verifica incrociata |
| EU Whoiswho (Ufficio pubblicazioni) | UE | istituzioni UE (non Stati) | persone e posizioni | metadati 2022, cadenza dichiarata bimestrale | CC BY 4.0 | no | n/v | n/v | SPARQL o CSV | no | © UE | PASS | soprattutto funzionari non politici | **CONDITIONAL**: solo cariche apicali, fuori dalla v1 |
| ParlGov 2024 | Döring & Manow (Dataverse) | **37** paesi, 1.621 governi, 1900–2023 (F) | governi, partiti, PM | rilascio finale 2024-08-12 (F) | CC0 (F) | no | — | — | file unico | no | citazione | PASS | fermo al 2023; contiene il punteggio ideologico `left_right` | **CONDITIONAL**: solo storico UE/OCSE, **senza `left_right`** |
| OpenSanctions PEP / EveryPolitician | OpenSanctions GmbH | 264 "paesi" | persone esposte politicamente | giornaliero | **CC BY-NC 4.0**, licenza commerciale a pagamento (W) | no | — | — | — | no | — | **FAIL** (licenza) | NC e inquadramento di compliance | **REJECT** |
| IPU Parline | Inter-Parliamentary Union | n/v (403) | parlamenti | n/v | CC BY-NC-SA (S) | — | — | — | bloccato | no | — | non chiaro | NC-SA | **REJECT** |
| Wikipedia | Wikimedia | — | biografie | vivo | CC BY-SA 4.0 (F) | no | — | — | il testo renderebbe lo snapshot share-alike | no | BY-SA | PASS | contaminazione share-alike | **solo link** (sitelink da Wikidata), nessun testo |
| Rulers.org | privato | — | cariche e date | — | vietate opere derivate e query automatiche (W) | — | vietate | — | vietato | — | — | — | legale | **REJECT** |
| WhoGov v4, Archigos 4.1 | accademici | 177 / n/v | ministri 1966–2023 / leader fino al 2015 | annuale / fermo | licenza n/v | modulo | — | — | — | — | — | n/v | licenza ignota | **REJECT** per redistribuzione |
| Bundesregierung | Governo federale DE | 1 | gabinetto | n/v | licenza n/v | — | — | — | — | — | — | n/v | — | **REJECT** finché la licenza non è verificata (solo link) |

### 3.2 Copertura e qualità (query SPARQL reali)

**Lista dei 193 Stati.** La query più ovvia sbaglia:
- include Taiwan (appartenenza ONU con fine, ma visibile nella vista "truthy");
- esclude la Romania (rango non migliore del suo enunciato "Stato sovrano");
- senza filtro sulla fine produce 195 voci, con duplicati.

Proposta: una **lista di QID fissata nel repository** (codice ISO → QID), non una query di classe dal vivo.

| Indicatore (193 Stati, enunciati di rango migliore) | Capo di Stato (P35) | Capo di governo (P6) |
|---|---|---|
| Stati con titolare attuale | **192** (manca Guinea-Bissau) | **187** |
| …con data di inizio | 185 | 172 |
| …con almeno un riferimento | **37** | **39** |
| Enunciati totali / con inizio / con fine | 922 / 908 / 711 | 1.097 / 1.047 / 871 |

- **Senza P6:** Venezuela, Botswana e San Marino non hanno un ufficio di tipo PM (legittimo). **Perù e Ciad** sembrano veri buchi.
- **Uffici collegiali:** Bosnia (presidenza a 3), San Marino (2 Capitani Reggenti) e Andorra (2 coprincipi) hanno legittimamente più titolari.
- **Il rango va rispettato.** Contando tutti gli enunciati senza data di fine:
  - 13 Stati risultano con più capi di Stato "in carica";
  - il Lussemburgo ha 18 ex PM senza fine;
  - Samoa ha due ex PM ancora "aperti".

**Uffici e titolari:**
- 334 uffici di capo di Stato o di governo (P1906/P1313).
- 10.579 incarichi (P39) per **7.025 persone**: 9.840 con inizio, 9.494 con fine, 6.269 con predecessore.
- 1.076 incarichi senza fine, contro circa 380 veri titolari attuali: molti sono date di fine mancanti.
- 20 incarichi finiscono prima di iniziare.
- Precisione delle date: giorno 10.769, anno 470, mese 64. La precisione va conservata: una data al solo anno crea false sovrapposizioni.

**Ministri:**
- 6.920 posizioni ministeriali (sottoclassi di "ministro", Q83307, con giurisdizione = Stato).
- 56.126 incarichi per **35.043 persone**.
- Stati con almeno 5 posizioni ministeriali con titolare attuale: **181**, oppure **174** con il criterio prudente (senza fine e iniziato dal 2015 in poi).
- 333 posizioni mostrano più di una persona "attuale" contemporaneamente.

**Profondità temporale, esempio: Presidente del Consiglio italiano (Q796897).**
- 67 incarichi per 31 persone, da De Gasperi (1946-07-14) a Meloni (2022-10-22, aperto); 67/67 con inizio.
- Solo 7 riferimenti distinti in tutto.
- La query "titolare al 2020-03-01" restituisce esattamente Giuseppe Conte (2018-06-01 → 2021-02-13), con l'ID dell'enunciato come evidenza.
- Per il Regno Unito, Wikidata coincide con GOV.UK (Starmer fino al 2026-07-20, Burnham dal 2026-07-20).

**Campi sulle persone (7.025 capi di Stato e di governo):**
- partito: 4.407 persone, di cui **solo 626 con data di inizio**;
- immagine: 5.158;
- **religione (P140): 2.569** ed **etnia (P172): 198**. Sono categorie particolari da **escludere**.

**Totale persone** (capi di Stato e di governo più ministri): **38.646**, con 62.814 legami di incarico su 6.854 uffici.

### 3.3 "Chi ricopriva l'incarico alla data dell'evento" (deterministico)

Per l'ufficio O e la data D:
1. **Candidati:** enunciati non deprecati con `inizio ≤ D < fine (o +∞)`. Il confronto rispetta la precisione della data; una data al solo anno vale per tutto l'anno ed è marcata `approssimato`.
2. Se esistono enunciati di rango preferito, si usano solo quelli.
3. Si scartano gli enunciati aperti più vecchi dell'inizio del successore più recente (falsi "attuali").
4. Se restano più candidati:
   - per un ufficio collegiale in elenco esplicito si restituisce l'insieme;
   - altrimenti si restituisce **`ambiguo`** con tutti i candidati e le loro evidenze. **Mai indovinare.**
5. Nessun candidato: "nessun dato".

### 3.4 Cosa NON conservare

- religione, etnia, orientamento sessuale, salute;
- ideologia o orientamento dedotti, punteggi, classifiche (incluso ParlGov `left_right`);
- appartenenza a un partito **senza data di inizio e senza riferimento**;
- famiglia, coniugi, indirizzi, patrimonio, account social;
- **fotografie**;
- testi biografici copiati da Wikipedia;
- qualunque inquadramento "PEP" o sanzionatorio.

Istruzione e incarichi precedenti sono ammessi solo come fatti di ruolo pubblico, con riferimento.

**Dimensione:**
- legami di incarico, misurati: **133 B ciascuno, 8,35 MB grezzi, 2,5 MB gzip**;
- persone, uffici e Paesi, stimati: ~7 MB grezzi;
- **totale ~16–19 MB grezzi, ~5–6 MB gzip**, da suddividere per Paese.

---

## 4. Prezzi dei carburanti

### 4.1 Fonti

| Fonte | Autorità | Paesi | Dati | Freschezza | Licenza/ToS | Chiave | Limiti | CORS | Statico | Runtime | Attribuzione | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Weekly Oil Bulletin** | Commissione UE, DG ENER | UE-27 (UK fino al 2020) | prezzi con e senza tasse; IVA, accise (con componenti bio/fossile), altre imposte indirette; benzina 95, gasolio, gasolio riscaldamento, olio combustibile, GPL (F) | settimanale; storico 2005-01-03 → 2026-09-28, 1.114 settimane (F) | "Reproduction is authorised provided the source is acknowledged" (F); CC BY 4.0 (Decisione 2011/833/UE) (W) | no | 429 con richieste ravvicinate: distanziare ~20 s (F) | n/v | sì (Action settimanale) | no | © UE, Weekly Oil Bulletin | PASS | GPL assente per 8 Stati | **ACCEPT** |
| MIMIT prezzi carburanti | MIMIT | IT | ~23.900 impianti; benzina, gasolio, GPL, metano, HVO; coordinate (F) | giornaliero (F) | IODL 2.0 (W) | no | n/v | n/v | sì | no | "Fonte: MIMIT" | PASS | separatore cambiato a `\|` il 2026-02-10 | **ACCEPT** |
| Prix des carburants | DGCCRF | FR | 9.822 impianti; gazole, SP95, SP98, E10, E85, GPLc (F) | tempo reale; archivi annuali (F) | Licence Ouverte 2.0 (F) | no | header X-RateLimit | `*` (F) | sì | possibile | DGCCRF | PASS | basso | **ACCEPT** |
| Geoportal Gasolineras | Ministero, ES | ES | 11.476 impianti, oltre 30 prodotti inclusi GPL, GNC, GNL, idrogeno (F) | ogni 30 min (F) | riuso con citazione della fonte e della data (S) | no | n/v | `*` (F) | sì | possibile | Ministerio | PASS | pagina della licenza da leggere | **ACCEPT** (confermare la licenza) |
| DESNZ Weekly road fuel prices | DESNZ | UK | benzina e gasolio (p/l), accisa, IVA (F) | settimanale, 28/09/2026 (F) | OGL v3 (default del sito, n/v sulla pagina) | no | — | n/v | sì | no | DESNZ | PASS | basso | **ACCEPT** |
| EIA bulk `PET.zip`, `pswrgvwall.xls` | US EIA | US (nazionale, PADD, alcuni Stati) | benzina (3 gradi) e diesel, $/gal (F) | settimanale (F) | "U.S. government publications are in the public domain" (F) | **no** per bulk e XLS; l'API v2 vuole una chiave | n/v | API `*` | sì | no | EIA | PASS | basso | **ACCEPT** (bulk) |
| StatCan 18-10-0001 | Statistics Canada | CA (~20 città) | benzina, diesel, gasolio riscaldamento, ¢/l (F) | mensile 1979 → 2026-08 (F) | Statistics Canada Open Licence (F) | no | — | n/v | sì | no | StatCan | PASS | basso | **ACCEPT** |
| ANP Levantamento de Preços | ANP | BR | per impianto: gasolina, etanol, diesel, GNV, GLP (F) | settimanale (F) | CC BY (S); il footer gov.br dice CC BY-ND 3.0 (F) | no | — | n/v | sì | no | ANP | PASS | licenza ambigua | **ACCEPT** (confermare la licenza) |
| data.gov.my `fuelprice` | MOF/DOSM | MY | RON95, RON97, diesel; prezzo sussidiato vs di mercato (F) | settimanale (F) | CC BY 4.0 (F) | no | — | n/v | sì | possibile | data.gov.my | PASS | basso | **ACCEPT** |
| data.qld.gov.au fuel price reporting | Queensland | AU-QLD | variazioni di prezzo per impianto (F) | mensile (F) | CC BY 4.0 (F) | no | — | — | sì | no | Queensland | PASS | solo uno Stato | **ACCEPT** |
| NSW FuelCheck (storico) | NSW | AU-NSW | storico mensile XLSX (F) | mensile (F) | **CC BY-SA** (F) | no (l'API live vuole chiave) | — | — | sì | no | NSW | PASS | share-alike | **CONDITIONAL** |
| WA FuelWatch | WA | AU-WA | prezzi giornalieri (F) | giornaliero | "All Rights Reserved" (F) | no | — | — | — | — | — | PASS | nessuna licenza di riuso | **CONDITIONAL/REJECT** |
| MX (CRE/CNE), AR (datos.gob.ar, CC BY 4.0), CL (CNE, token), KR (Opinet, chiave), TH (EPPO), IN (PPAC PDF), PH (DOE PDF) | enti nazionali | 7 | prezzi; per TH struttura fiscale completa (F) | giornaliero/settimanale | licenza n/v, token, chiave o PDF | vari | — | — | sì o PDF | — | — | PASS | licenza o accesso | **CONDITIONAL** |
| Tankerkönig / MTS-K | Tankerkönig | DE | prezzi live | tempo reale | storico **BY-NC-SA**, download massivo vietato (W) | chiave | 1 richiesta/min | — | no | — | — | — | NC | **REJECT** (il WOB copre DE) |
| IEA End-use prices | IEA | ~150 | — | — | **€1.745/anno** o termini non CC (W) | account | — | — | — | — | — | **FAIL** | a pagamento | **REJECT** |
| GlobalPetrolPrices | fornitore privato | — | vende i download | — | commerciale; pagina dei termini 429 | — | — | — | — | — | — | **FAIL** | commerciale | **REJECT** |
| World Bank EP.PMP.SGAS.CD, GIZ International Fuel Prices | WB / GIZ | — | — | archiviato / ultima edizione 2020 | — | — | — | — | — | — | — | — | dismessi | **REJECT** |
| Colombia `gjy9-tpph` | MinEnergía | CO | — | ultime righe 2022 | CC BY-SA | — | — | — | — | — | — | — | vecchio | **REJECT** |
| NZ MBIE, JP METI, KE EPRA, ZA DMRE | enti nazionali | 4 | — | — | n/v | — | — | — | bloccati (muro anti-bot, 403, timeout) (F) | — | — | — | — | **n/v** |
| **BCE tassi di riferimento** | BCE | 29 valute + EUR | cambi giornalieri (F) | giornaliero | riuso libero citando la BCE (W) | no | — | `*` (F) | sì | sì | "Source: ECB" | PASS | mancano ARS, CLP, COP, KES, NGN | **ACCEPT** (cambi) |

### 4.2 Matrice di copertura per Paese

✓ = presente · s = per impianto · ½ = parziale

| Paese | Benzina | Gasolio | GPL | GNC/GNL | Ricarica EV | Componenti fiscali | Storico | Frequenza | Fonte | Licenza |
|---|---|---|---|---|---|---|---|---|---|---|
| UE-27 (ciascuno) | ✓ | ✓ | ✓ in 19 (non AT, CY, DK, FI, GR, IE, MT, SE) | — | — | ✓ con/senza tasse, IVA, accisa, altre imposte | 2005→ | settimanale | WOB | CC BY 4.0 |
| ↳ IT (dettaglio) | s | s | s | s (metano) | — | (WOB) | estratti datati | giornaliero | MIMIT | IODL 2.0 |
| ↳ FR (dettaglio) | s | s | s | — | — | (WOB) | archivi annuali | tempo reale | DGCCRF | LO 2.0 |
| ↳ ES (dettaglio) | s | s | s | s (GNC + GNL) | — | (WOB) | da autoarchiviare | 30 min | Ministero | citazione |
| UK | ✓ | ✓ | — | — | — | accisa + IVA | 2003→ | settimanale | DESNZ | OGL (n/v) |
| US | ✓ | ✓ | — | — | — | — | anni '90→ | settimanale | EIA | pubblico dominio |
| CA | ✓ | ✓ | — | — | — | — | 1979→ | mensile | StatCan | Open Licence |
| BR | s (+ etanolo) | s | s | s | — | — | sì | settimanale | ANP | CC BY (S) |
| MY | ✓ | ✓ | — | — | — | sussidiato vs mercato | sì | settimanale | data.gov.my | CC BY 4.0 |
| AU (QLD; NSW) | s | s | s | — | — | — | mensile | mensile | QLD; NSW | CC BY 4.0; CC BY-SA |
| *CONDITIONAL:* MX, AR, CL, KR, TH, IN, PH | ✓ | ✓ | CL, TH ½ | CL ½ | — | TH ✓ completa | varia | giornaliero/settimanale | §4.1 | n/v, token, chiave |

**Totali:**
- **Prezzo affidabile: 33/193 Stati ONU (17%)**: UE-27 + UK, US, CA, BR, MY, AU a livello statale.
- **40/193 (21%)** contando le fonti CONDITIONAL.
- **Componenti fiscali:** solo UE-27, UK, TH.
- **Ricarica EV:** nessuna fonte gratuita.
- **GNC/GNL:** solo IT, ES, BR, CL.

**Dimensione:**
- WOB storico completo normalizzato: **1,41 MB gzip** (misurato).
- Mediane regionali giornaliere IT/FR/ES/BR: ~1–2 MB gzip all'anno.
- US, CA, UK, MY: < 0,5 MB.
- **Totale ~3–5 MB gzip**, in 5–15 file.
- I dati grezzi per impianto restano fuori dallo snapshot e da git (solo IT ≈ 190 MB/anno gzip).

---

## 5. Agevolazioni accise per il trasporto commerciale

| Paese | Schema | Autorità | Base giuridica | Condizioni | Importo/formula · validità | Leggibile da macchina? | Sforzo di curatela |
|---|---|---|---|---|---|---|---|
| **UE (quadro)** | gasolio commerciale, Dir. 2003/96/CE art. 7 | Consiglio | CELEX 32003L0096 (F) | merci con MTT ≥ 7,5 t; passeggeri M2/M3 (F) | minimi: gasolio €330/1000 l (F) | testo sì (Cellar) | basso |
| **Italia** | rimborso accise gasolio commerciale (art. 24-ter TUA) | ADM | D.Lgs. 504/1995 art. 24-ter; D.Lgs. 43/2025; D.L. 63/2026 (L. 113/2026); nota ADM prot. 00642547 del 30-09-2026 (F) | merci ≥ 7,5 t; esclusi Euro 4 e inferiori; HVO a parte (F) | **rimborso = accisa ordinaria in vigore − €403,22/1000 l**. Nel 3° trimestre 2026 il gasolio ha avuto 5 importi: €219,68 / 269,68 / 129,68 / 169,68 / 219,68 per sotto-periodo; domande 1 ott – 2 nov 2026 (F) | no (PDF + modello XLSX) | **alto** (trimestrale, fino a 5 importi per trimestre) |
| **Francia** | rimborso parziale accisa gazole | DGFiP/douane | CIBS L.312-51 e L.312-53 (W) | merci ≥ 7,5 t; trasporto collettivo | 2026: merci €15,56/hL (Corsica €14,21); passeggeri €21,56/hL (W) | no | basso-medio (annuale) |
| **Spagna** | gasóleo profesional | AEAT | Ley 38/1992 art. 52 bis (XML consolidato BOE) (F); Orden HFP/941/2022 (W) | ≥ 7,5 t (S); taxi; bus | €49/1000 l, tetto 50.000 l per veicolo e anno (S); aiuti aggiuntivi 2026 (S) | testo sì (BOE), importo no | basso |
| Belgio | gasoil professionnel ("cliquet") | SPF Finances | n/v | ≥ 7,5 t (S) | €0,1913/l dal 2026-01-01 (S, fonte terza) | no | medio |
| Slovenia | rimborso accisa trasporto commerciale | FURS | n/v | (S) | mensile; **€0 ad aprile 2026** (S) | no | medio (mensile) |
| Ungheria | rimborso gasolio commerciale | NAV | opuscolo NAV n. 83 (S) | ≥ 7,5 t o M2/M3 (S) | importo n/v | no (PDF) | medio |
| Australia | Fuel Tax Credits | ATO | Fuel Tax Act 2006 (n/v) | veicoli pesanti > 4,5 t (n/v) | 21,3 c/l, poi **20,2 c/l dal 3 ago 2026** (S; sito ATO bloccato per i bot) | no | medio |
| US / CA | IFTA (ripartizione, non agevolazione); esenzioni off-road | — | — | — | — | — | fuori ambito |

**Conteggi:**
- **Dataset leggibili da macchina delle aliquote di rimborso: 0.**
- **Documentabili con curatela affidabile:** 4 subito (quadro UE, IT, FR, ES); **~7 realisticamente** (+ BE, SI, HU dopo conferma dalle pagine ufficiali); AU parziale.

**Modello:** ogni schema è una **regola con validità**, mai un semplice sì/no. Campi:
- giurisdizione, nome dello schema, autorità, base giuridica (URL, CELEX/ELI/ID BOE);
- beneficiari: attività, categoria del veicolo, massa minima, classe Euro minima, esclusioni;
- importo (fisso o formula, con unità e valuta) e tetto;
- `valid_from` / `valid_to`, periodo di domanda;
- documento sorgente (URL, protocollo, data, sha256);
- `curated_by`, `curated_at`, `review_due`.

L'Italia va registrata come più righe, una per sotto-periodo, con la stessa formula. L'accisa ordinaria letta dal WOB serve come **controllo automatico di coerenza**, non come autorità.

---

## 6. Pedaggi e costo delle infrastrutture stradali

### 6.1 Fonti principali

| # | Fonte / autorità | Paesi | Dati | Freschezza | Licenza/ToS | Chiave | Statico | €0 | Rischio | Decisione |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **BALM Mauttabelle** + WFS Toll Collect | DE (Maut camion su tutte le strade federali) | **134.019 tratte** (versione 165, valida dal 01.10.2026): ID, nodi, lunghezza, strada, coordinate. Una tratta percorsa in parte si paga per intero (F) | ~ogni 6 settimane; archivio dal 2018 | dl-by-de/2.0 (catalogo); WFS "kostenfrei … keine Zugangsbeschränkungen" (F) | no | sì (zip 8 MB) | PASS | licenza indicata solo nel catalogo | **ACCEPT** |
| 2 | **BFStrMG Anlage 1** | DE | €/km = infrastruttura + inquinamento + rumore + CO₂, per peso × assi × Euro × classe CO₂. Esempio: Euro VI, CO₂ 1, > 18 t, 5+ assi = **€0,348/km** (F) | legge modificata il 15.5.2026 | testo di legge, non tutelabile (§5 UrhG) | no | trascrizione da XML di legge | PASS | effetto dell'emendamento 2026 sulle tariffe n/v | **ACCEPT** |
| 3 | **NVDB stazioni di pedaggio** (tipo 45) | NO (AutoPASS, 6 traghetti) | **463 stazioni**: tariffe auto e mezzi pesanti, fasce di punta, direzione, gestore, geometria (F) | data di inizio per oggetto | **NLOD** | no (header `X-Client` obbligatorio dal 5 gen 2026, solo identificazione) | sì | PASS | solo 2 classi di veicolo | **ACCEPT** |
| 4 | **HAC API prezzi** + WFS INSPIRE | HR | **2.484 coppie entrata/uscita**, classi IA e I–IV, EUR (F) | prezzi in euro dal 2023 | "Otvorena dozvola"; WFS "Bez ograničenja" (F) | token pubblico nel PDF open data | sì | PASS | robots.txt `Disallow: /api` in contrasto con l'offerta open data | **CONDITIONAL**: chiedere conferma a HAC |
| 5 | **gov.uk Dart Charge** | UK | classi A–D (C £4,20; D £8,40) (F) | 2024-12-17 | OGL v3.0 (F) | no | sì | PASS | prezzi in HTML dentro il JSON | **ACCEPT** |
| 6 | **FHWA Toll Facilities** | US | **300 strade, 189 ponti/tunnel, 115 traghetti**: fasce min/max per auto e camion (F) | edizione 2023 | Public Domain (F) | no | sì | PASS | fasce di prezzo, non tariffe per viaggio | **ACCEPT** (contesto) |
| 7 | data.gouv.fr gares de péage (DGITM) | FR | **1.266** stazioni con coordinate (F) | 2025 | ODC-BY | no | sì | PASS | solo geometria | **ACCEPT** |
| 8 | ANSFISA / ART (dati.gov.it) | IT | rete a pedaggio per concessionario (F) | 2026 | CC BY 4.0 | no | sì | PASS | nessun prezzo | **ACCEPT** (infrastruttura) |
| 9 | Autostrade per l'Italia, tariffe unitarie | IT | €/km IVA inclusa dal 1/1/2026: A 0,07869 · B 0,08054 · 3 0,10615 · 4 0,16108 · 5 0,19034; montagna a parte; **nessuna classe Euro o CO₂** (F) | annuale | "Tutti i diritti riservati" | no | trascrizione | PASS | km tariffari non pubblicati; il calcolatore non si interroga in automatico | **CONDITIONAL** (stima = €/km × km a pedaggio) |
| 10 | MIT adeguamenti tariffari | IT | variazione % per concessionario | 1 gennaio | CC BY 3.0 | no | trascrizione | PASS | solo percentuali | **ACCEPT** |
| 11 | e-TOLL | PL | €/km per peso × Euro × categoria di strada (es. ≥ 12 t, ≥ Euro 5: 0,56 zł/km) (F) | 1 feb 2026 | CC BY 3.0 PL (F) | no | trascrizione | PASS | autostrade in concessione escluse | **ACCEPT** |
| 12 | Area C Milano (varchi) | IT-Milano | posizione dei varchi (F) | 2026-09-30 | CC BY | no | sì | PASS | tariffe da trascrivere | **ACCEPT** (geometria) |
| 13 | ÖVDAT GIP rete ASFINAG | AT | geometria autostradale (WFS) | 2026-06 | CC BY 4.0 | no | sì | PASS | — | **ACCEPT** (geometria) |
| 14 | ASFINAG GO-Maut + vignetta | AT | assi × CO₂ × Euro (es. 0,2774 €/km); vignetta 2026 | 1 gen 2026 | sito "Alle Rechte vorbehalten"; il regolamento è nei dati aperti RIS | no | trascrizione dalla norma | PASS | basso se si cita la norma | **CONDITIONAL** |
| 15 | HU, SI (Gazzetta ufficiale), SK (Slov-Lex), CZ (e-Sbírka), CH (Fedlex), BE (Viapass), BG (BGToll), RO (CNAIR), DK (vejafgifter), NL (vrachtwagenheffing), ES (BOE), PT (IMT), RS (Putevi Srbije), TR (KGM) | 14 | tariffe per classe, Euro e CO₂ in PDF, HTML, immagini o atti normativi (F/W) | 2025–2026 | perlopiù ©; gli atti normativi pubblicati sono liberi; BOE con licenza di riuso | no | **trascrizione dagli atti ufficiali** | PASS | vignette CH/HU/CZ/SK n/v; RO solo immagine | **CONDITIONAL** |
| 16 | Attraversamenti fissi: Øresund, Storebælt, Monte Bianco / Fréjus (identici: classe 4 andata €404,80), Gran San Bernardo, Osmangazi (F) | DK/SE, FR/IT, CH/IT, TR | prezzi per attraversamento | 2026 | perlopiù © (pochi valori, citabili come fatti) | no | trascrizione | PASS | — | **CONDITIONAL** |
| 17 | TfL Congestion Charge / ULEZ | UK | — | — | la licenza TfL **esclude l'estrazione automatica** dal sito Congestion Charging (W) | registrazione | solo trascrizione | PASS | geometria delle zone n/v | **CONDITIONAL** |
| 18 | Stoccolma/Göteborg (Lag 2004:629), Singapore ERP (API rimossa il 30 set 2024, S), Cile MOP, TfNSW (chiave) | SE, SG, CL, AU | tariffe in leggi, PDF o API con chiave | — | leggi libere / Singapore Open Data Licence / CC BY | vari | trascrizione | PASS | — | **CONDITIONAL** |
| 19 | **OpenStreetMap** (estratti Geofabrik, taginfo) | mondo | geometria e indicazione di pedaggio; **quasi nessun prezzo** (F) | giornaliero | ODbL | no | sì (Geofabrik; mai Overpass a runtime) | PASS | copertura disomogenea | **ACCEPT** (geometria) |
| 20 | APRR/AREA, VINCI, Sanef | FR | matrici entrata/uscita (PDF di 300 pagine) | 1 feb 2026 | APRR: riproduzione "interdite" senza consenso; VINCI: nessuna licenza oltre la consultazione; Sanef: muro anti-bot (W) | — | no | — | copyright | **REJECT** senza permesso degli operatori |
| 21 | myto.cz, NEXCO, calcolatori commerciali (ASFINAG, ASPI, Satellic, Linkt…), roviniete.ro | CZ, JP, vari | — | — | CAPTCHA, nessun open data, termini derivati, rivenditore privato | — | no | — | scraping | **REJECT** |

### 6.2 Tipologie di sistema

| Tipo | Esempi |
|---|---|
| **A distanza** (per km su una rete di tratte) | DE, AT, CZ, PL, HU, SK, SI, BE, BG, CH (LSVA per tonnellata-km), DK e NL dal 2025/26, RO |
| **Entrata/uscita** (sistema chiuso, matrice tra stazioni) | IT, FR, ES, PT, GR, HR, RS, JP, turnpike US |
| **Barriera aperta** (prezzo fisso per stazione) | parte di FR e PT, stazioni NO |
| **Vignetta** (a tempo) | AT, CH, CZ, SK, SI, HU, RO, BG, MD; Eurovignette solo SE e LU |
| **Attraversamento fisso** | Øresund, Storebælt, Monte Bianco, Fréjus, Gran San Bernardo, Millau, Dartford, Bosforo, ponti e tunnel US |
| **Traghetto** come parte di un collegamento stradale | NO, US (FHWA), OSM `route=ferry` |
| **Urbano / a fasce orarie** | Londra, Stoccolma, Göteborg, Milano Area C, Singapore, Oslo/Bergen (punta) |
| **Per emissioni** | non è un tipo a sé ma un **modificatore** di tutti gli altri (classe Euro, classe CO₂ 1–5, emissioni zero) |

Il modello italiano a casello **non** è universale: il modello dati deve rappresentarli tutti (§13).

### 6.3 Copertura reale

- **Tariffe ufficiali leggibili da macchina e calcolabili per viaggio: 4 sistemi.**
  - DE camion: l'unico modello completo, aperto e per tratta per i mezzi pesanti.
  - NO: 463 stazioni.
  - HR: 2.484 coppie, dopo la conferma di HAC.
  - UK: Dartford.
  - In più, fasce di prezzo per US/FHWA (300 strade, 189 ponti/tunnel, 115 traghetti).
- **Trascrizione manuale da atti ufficiali:** ~25 sistemi europei, più Cile, Svezia, Londra, Milano e Singapore. **Stima nostra: ~10–15 giornate-persona** per il primo passaggio, poi un aggiornamento annuale.
- **Attraversamenti fissi con tariffa verificata:** ~7 in Europa, più 189 record US con fasce.
- **Vignette con prezzo verificato:** **3** (AT, BG, SI).
- **Geometria OSM (taginfo, dati al 2026-10-02):**
  - nel mondo: `toll=yes` 563.513 · `barrier=toll_booth` 63.560 · `highway=toll_gantry` 7.717 · `toll:hgv=yes` 128.617;
  - **prezzi: `toll=yes` con `charge` solo 2.378**, quindi **OSM non è una fonte di tariffe**;
  - per i camion OSM è buona in BE, PL, HU, CZ e SK, ma **debole in Germania** (2.287 oggetti `toll:hgv` contro 134.019 tratte ufficiali: per DE va usata la tabella BALM).

---

## 7. Fattibilità del costo di percorrenza (solo studio)

| Componente | Verdetto | Note |
|---|---|---|
| **Motore di routing** | fattibile | **Valhalla** (MIT): profilo camion con peso, assi, altezza, merci pericolose; `use_tolls`, `use_ferry`, indicatori `has_toll`. **GraphHopper** (Apache-2.0): campi `toll`, peso, profilo camion. OSRM (BSD-2): solo `exclude=toll`, nessun profilo camion. openrouteservice: API pubblica con chiave e quote, quindi solo self-host. **Nessuno calcola l'importo dei pedaggi.** I server demo di OSRM e FOSSGIS valgono solo per "uso ragionevole non commerciale": **REJECT a runtime**. L'API commerciale GraphHopper è **REJECT**. |
| **Importo dei pedaggi** | motore tariffario NEXUM | Associa le tratte del percorso (way OSM o geometria) a infrastruttura e tariffe. **Esatto** per DE (tratte BALM × €/km di classe), NO, HR, Dartford, attraversamenti fissi e vignette. **Solo stima** per IT/FR (€/km × km a pedaggio: i km tariffari differiscono dai km percorsi), da dichiarare come tale. |
| **Carburante** | fattibile | prezzi da WOB, MIMIT e DGCCRF; il **consumo lo inserisce l'utente**, senza valori di default inventati |
| **Traghetti** | parziale | solo indicatori più NVDB, FHWA e tariffe trascritte |
| **Urbano / congestione** | parziale | trascrizione manuale |
| **Agevolazioni** | parziale | regole curate (§5) |
| **Archiviazione e calcolo** | — | Estratti Geofabrik: Europa 35,1 GB, pianeta 95,1 GB, IT 2,24 GB, DE 4,85 GB (F). Grafo Valhalla ~1–1,5× il file PBF (dichiarazione dei manutentori, n/v), cioè ~35–53 GB per l'Europa. **Una build nazionale o regionale è realistica su un portatile da 16–32 GB**; l'Europa è al limite. |

**Modalità:**
- **Servizio locale: CONDITIONAL GO.** Valhalla in Docker sulla macchina dell'utente più le tabelle tariffarie NEXUM.
- **Sito statico:**
  - **corridoi precalcolati: GO** (coppie fisse calcolate in build, piccoli JSON);
  - **routing live nel browser: NO-GO** per l'Europa: limiti Pages di 25 MB per file e 20.000 file; `valhalla-wasm` è sperimentale (pubblicato il 2026-09-20) e la sua demo usa S3/R2, vietati.

**Due costi da non confondere:**
- **Costo di percorrenza stimato:** km, carburante con consumo inserito dall'utente, pedaggi, attraversamenti, vignette, traghetti e tariffe urbane, ciascuno con la sua fonte. È l'unico che NEXUM può offrire.
- **Costo aziendale completo del trasporto:** richiederebbe anche autista, ore, soste (Reg. 561/2006 solo per la fattibilità oraria), pneumatici, manutenzione, ammortamento, assicurazione, tasse sul veicolo, ritorno a vuoto, attese e costi generali. **Nessuno di questi esiste come dato aperto a €0:** solo parametri inseriti dall'utente, mai valori predefiniti inventati.

---

## 8. Relazioni tra domini (la parte più importante)

Principio: **la vicinanza non diventa mai causa.** Ogni relazione ha un predicato neutro, una regola dichiarata (raggio, finestra temporale, validità), le misure registrate (distanza, Δt, data di validità) e l'evidenza della fonte. Le connessioni NEXUM restano di due nature già esistenti:
- **associazione:** due fonti indipendenti registrano fatti compatibili;
- **contesto:** ciò che si trova entro un raggio, o ciò che era valido in una data.

| Relazione | Natura | Regola / misura | Evidenza | Esempio di frase |
|---|---|---|---|---|
| Incendio/Alluvione/Tempesta/Vulcano → **entro R** → Webcam | contesto (esposizione) | haversine ≤ R; R dichiarato per tipo di evento | registro camera + evento | "4 webcam pubbliche entro 25 km dall'evento" |
| Terremoto/Alluvione → **entro R** → Tunnel, ponte, tratta a pedaggio | contesto | come le regole di esposizione attuali | registro infrastruttura (OSM/BALM/NVDB) | "Tunnel del Fréjus a 18 km" (**mai** "colpito") |
| Tsunami → **entro R** → Porto | contesto | già presente nel mondo live | — | — |
| Evento (nel Paese P, alla data D) → **titolare alla data** → Persona (ufficio O) | contesto istituzionale | §3.3, deterministico, `ambiguo` ammesso | ID enunciato Wikidata + riferimenti | "Alla data dell'evento il capo del governo era X (Wikidata Q…)" |
| Paese → **ha ufficio** → Ufficio → **ricoperto da [da, a)** → Persona | fatto documentato | validità dell'incarico | enunciato + riferimento | — |
| Paese → **prezzo osservato** → Osservazione del gasolio (data) | osservazione | `valid_from` = data di rilevazione | riga WOB/MIMIT (hash) | "Gasolio in Italia: €1,72/l (settimana del 28/09/2026)" |
| Paese → **ha regola** → Agevolazione accise [da, a) | regola documentata | validità + condizioni | documento ADM/DGFiP/AEAT (sha256) | — |
| Tratta → **soggetta a** → Schema di pedaggio; Infrastruttura → **ha tariffa** → Tariffa [da, a) | fatto documentato | validità | BALM, NVDB, atto normativo | — |
| Percorso → **attraversa** → Infrastruttura a pedaggio | derivato (servizio locale) | corrispondenza geometrica | motore di routing + tabelle | "Pedaggio stimato" con fonte per voce |
| Evento → **nel Paese** → contesto economico alla data (prezzo, regime) | contesto | validità alla data dell'evento | come sopra | "In quella settimana il gasolio costava…" (nessun nesso dichiarato) |

**Vietati come predicati automatici:** causato, colpito, interessato, responsabile di, dovuto a. "Interessato" è ammesso solo se una fonte lo dichiara esplicitamente, ad esempio un'attivazione Copernicus che elenca l'infrastruttura.

---

## 9. Registro delle fonti (sintesi delle decisioni)

| Dominio | ACCEPT | CONDITIONAL | REJECT |
|---|---|---|---|
| Webcam | Caltrans CWWP2, Fintraffic Digitraffic, DriveBC, USGS HIVIS, AVO (non-FAA) | NZTA, Vegagerðin (termini da leggere); NO, SE, WSDOT, 511, OHGO, DK (chiave/registrazione gratuita); OSM `contact:webcam` (solo link) | Autobahn (vuoto), FAA, Windy, aggregatori/EarthRadar, OSM `surveillance` |
| Governi | Wikidata (build), GOV.UK (verifica) | CIA World Leaders, governo.it (verifica); ParlGov senza `left_right`; EU Whoiswho (cariche apicali) | dump Wikidata in CI, ONU come contenuto, OpenSanctions/EveryPolitician (NC), IPU (NC-SA), Rulers.org, testo Wikipedia, WhoGov, Archigos, Bundesregierung (licenza n/v) |
| Carburanti | WOB, MIMIT, DGCCRF, Ministero ES, DESNZ, EIA bulk, StatCan, ANP, data.gov.my, QLD, BCE (cambi) | NSW (BY-SA), WA, MX, AR, CL, KR, TH, IN, PH, Fuel Finder UK, E-Control, DGEG, goriva.si | Tankerkönig, IEA, GlobalPetrolPrices, World Bank, GIZ, Colombia |
| Agevolazioni | quadro UE (Cellar), IT/FR/ES da atti ufficiali (curati) | BE, SI, HU, AU | — (non esistono dataset) |
| Pedaggi | BALM + BFStrMG, NVDB, Dart Charge, FHWA, gares de péage FR, ANSFISA/ART, MIT, e-TOLL PL, Area C (geometria), GIP AT, OSM (geometria) | HAC, ASPI €/km, ASFINAG, HU/SI/SK/CZ/CH/BE/BG/RO/DK/NL/ES/PT/RS/TR, attraversamenti fissi, TfL, SE, SG, CL, TfNSW | APRR/VINCI/Sanef senza permesso, myto.cz, NEXCO, calcolatori, roviniete.ro |
| Routing | Valhalla / GraphHopper core self-host (servizio locale) | valhalla-wasm (sperimentale) | server demo OSRM/FOSSGIS a runtime, API GraphHopper, openrouteservice pubblico come dipendenza |

---

## 10. Matrice di copertura per Paese (sintesi)

| Capacità | Copertura reale | Nota |
|---|---|---|
| Webcam (ACCEPT) | **3 Paesi** (US parziale, CA solo BC, FI); **6.721 camere** | +NZ, IS dopo la verifica dei termini (7.530) |
| Dati istituzionali | **193/193** con capo di Stato (192 con titolare attuale); **187/193** capo di governo attuale; **174–181/193** con almeno 5 ministri attuali | riferimenti scarsi: 37/192 per i capi di Stato |
| Prezzo carburanti affidabile | **33/193** (17%); 40/193 con le fonti CONDITIONAL | componenti fiscali solo UE-27, UK, TH |
| Agevolazioni trasporto documentabili | **4** subito, **~7** realistici; **0** leggibili da macchina | aggiornamento trimestrale (IT), mensile (SI) |
| Pedaggi utilizzabili | tariffe leggibili da macchina: **4 sistemi** (DE, NO, HR*, UK-Dartford) + fasce US; trascrivibili: **~25 sistemi** europei + 5 extra-UE | *HR in attesa di conferma |
| Attraversamenti fissi / vignette | **~7** attraversamenti europei + 189 record US (fasce); **3** vignette verificate | CH, HU, CZ, SK n/v |
| Frequenza di aggiornamento | webcam: alla richiesta (alla fonte 30 s–15 min) · governi: build settimanale · carburanti: settimanale (WOB) / giornaliero (nazionali) · pedaggi: ~6 settimane (DE), annuale (altri) | — |

**Principali buchi geografici:** Africa, Medio Oriente, Asia meridionale e orientale, America Latina (salvo BR e i CONDITIONAL MX/AR/CL) e, per webcam e pedaggi, gran parte dell'Europa occidentale (FR, IT, ES, UK, NL, DE per le webcam).

---

## 11. Rischi legali e di licenza

| Rischio | Dove | Mitigazione |
|---|---|---|
| **GDPR, persone viventi** (~1.825 capi di Stato e di governo probabilmente viventi, più i ministri) | governi | Valutazione documentata del legittimo interesse (art. 6(1)(f)); minimizzazione dei dati; contatto e procedura di rimozione/correzione; data `as_of` per snapshot; niente data di nascita (al più l'anno), niente foto. |
| **Art. 9: appartenenza a un partito** (opinione politica) | governi | Solo se dichiarata, datata e con riferimento (art. 9(2)(e)); nessuna deduzione o aggregazione. Religione ed etnia escluse del tutto. |
| **Accuratezza e diffamazione** ("titolare alla data" errato) | governi | Mostrare evidenza, precisione della data e stato `ambiguo`; mai presentare un enunciato senza riferimento come fatto certo. |
| **Share-alike** (CC BY-SA, ODbL) | Wikipedia, NSW, OSM | Wikipedia: solo link. OSM: database derivato sotto ODbL, con attribuzione; tenere separati i livelli derivati da OSM. NSW: etichettare BY-SA o escludere. |
| **Non commerciale** (NC) | OpenSanctions, IPU, Tankerkönig (storico) | Esclusi: incompatibili con uno snapshot open source riutilizzabile. |
| **Copyright dei concessionari** | FR (APRR, VINCI, Sanef), ASPI, ASFINAG, HU, BG, RO | Trascrivere dalle **norme e gazzette ufficiali**, non dai siti; i pochi valori di attraversamenti fissi citati come fatti, con fonte; altrimenti chiedere il permesso. |
| **robots.txt in contrasto con l'open data** | HAC (HR) | Chiedere conferma scritta prima dell'ingest. |
| **Estrazione automatica vietata** | TfL Congestion Charging, Rulers.org, calcolatori | Solo trascrizione manuale, oppure esclusione. |
| **Privacy delle immagini** | webcam ad alta risoluzione (FI) | Solo su richiesta, nessuna conservazione o analisi; nessuna fonte di sorveglianza. |
| **Endpoint non documentati** | DriveBC (nuova API), WSDOT mobile, DGEG | Preferire le API documentate; registrare la licenza per fonte; possibilità di disattivare una singola fonte. |
| **User-Agent e contatti** | Wikidata, Digitraffic, NVDB | User-Agent di **progetto** (URL del repository e pagina delle issue), **mai** indirizzi personali. |

---

## 12. Stima di prestazioni e archiviazione

| Dominio | Snapshot (gzip) | File (stima) | Note |
|---|---|---|---|
| Webcam (6.721) | 0,3–0,6 MB | 1–5 | misurato su un campione |
| Governi | 5–6 MB | 193 se per Paese (oppure ~10 pacchetti) | legami di incarico misurati; persone e uffici stimati |
| Carburanti | 3–5 MB | 5–15 | WOB storico misurato |
| Agevolazioni | < 0,05 MB | 1 | — |
| Pedaggi | ~3–6 MB (stima n/v; Mauttabelle zip grezzo 8 MB) | 10–50 | DE è il dataset più grande |
| **Totale aggiuntivo** | **~12–18 MB gzip** | **~30–260** | lo snapshot attuale è di 892 MB grezzi |

**Vincolo critico: budget di file.**
- Lo snapshot live conta **8.834 file**; il criterio O7 è **≤ 9.000**, quindi restano **166 file**.
- Cloudflare Pages ne consente 20.000, ma O7 è un criterio approvato.
- Prima di qualsiasi GO serve una di queste scelte:
  - **(a)** pacchetti per dominio invece di file per Paese (es. 10 pacchetti per i governi, caricati su richiesta);
  - **(b)** una decisione esplicita su O7.
- **Raccomandazione: (a).** Nessuna soglia viene modificata.

**Prestazioni:**
- Nessuno dei nuovi domini entra nel caricamento iniziale: O6 resta invariato.
- I dati si caricano su richiesta alla selezione di un Paese, di un evento o di un livello.
- Le immagini delle webcam sono caricate dal browser direttamente dalla fonte, solo al tocco.

---

## 13. Estensioni proposte del modello dati

Il Core attuale supporta già validità temporale su oggetti (`valid_from_ms`/`valid_to_ms`), relazioni (`valid_from_ms`/`valid_to_ms`) e claim (`valid_from_ms`/`valid_to_ms`), oltre a evidence con distanza e Δt. **Nessuna delle proposte richiede di cambiare lo schema del Core**; servono nuovi tipi nel vocabolario e nuove regole, da approvare.

| Tipo (vocabolario) | Natura | Campi principali |
|---|---|---|
| `camera.public_webcam` | oggetto | ID fonte stabile, posizione, gestore, URL immagine corrente, frequenza dichiarata, stato (`inService`/`hideCam`/`offline`), licenza, credito |
| `place.country` (esistente) + `gov.office` | oggetti | ufficio: QID, tipo (capo di Stato / capo di governo / ministro / altro), giurisdizione |
| `person.public_official` | oggetto | QID, etichette, link Wikidata e Wikipedia; nessun campo vietato (§3.4) |
| `gov.cabinet`, `gov.party` | oggetti | QID / ID ParlGov |
| relazioni `has_office`, `held_by [da,a)`, `member_of_party [da,a)` (solo se datata e referenziata) | relazioni con validità | precisione della data, rango, `acting`, predecessore/successore come attributi dell'incarico |
| `fuel.price_observation` | claim sul Paese o sulla regione (oppure serie) | prodotto, valore, valuta, unità, prezzo/litro normalizzato, base fiscale, componenti (IVA, accisa, altre imposte), data di osservazione e pubblicazione, cambio BCE usato |
| `fuel.tax_component` | claim con validità | Paese, prodotto, componente, valore, valuta, `valid_from` ("Since" del WOB) |
| `transport.fuel_tax_relief` | oggetto-regola con validità | §5 |
| `toll.scheme`, `toll.infrastructure`, `toll.tariff`, `toll.exemption` | oggetti + claim con validità | §6.2; codice di classe nativo **più** una tabella di corrispondenza esplicita; componenti (infrastruttura, aria, rumore, CO₂) |
| eventi `toll.tariff_change`, `toll.scheme_start/end`, `toll.network_version` | eventi | data, schema, evidenza |

**Nuove regole** (stesso motore delle regole di esposizione attuali): webcam entro R da incendi, alluvioni, tempeste, vulcani; tunnel, ponti e tratte a pedaggio entro R da terremoti, alluvioni e tempeste.

**"Titolare alla data"** come interrogazione di presentazione sulle relazioni con validità (§3.3), **non** come insight. Evita di cambiare il Core.

**W9.** La UI resta agnostica rispetto al dominio: sezioni ed etichette ("Governo", "Carburanti", "Pedaggi") arrivano dai suggerimenti di visualizzazione del vocabolario, come i gruppi dei filtri di oggi. La parola "country" è vietata nel codice UI dal test W9.

---

## 14. UX proposta

Prima la risposta comprensibile, poi il dettaglio. Nessuna nuova fila di checkbox: i nuovi domini entrano come **sezioni del contesto** dell'elemento selezionato e come **gruppi** nei filtri esistenti (Luoghi e infrastrutture → Webcam, Pedaggi).

### 14.1 WORLD MODE

- **Mappa:** le webcam sono un gruppo di "Luoghi e infrastrutture", spento di default, visibile a zoom regionale. I pedaggi compaiono come geometria solo a zoom stradale.
- **"Cosa sta succedendo":** nessun cambiamento di struttura. Le nuove connessioni (es. "4 webcam entro 25 km dall'incendio X") entrano tra le "Connessioni trovate da NEXUM" come le altre.
- **Pannello del Paese**, al tocco sul nome del Paese o dalla ricerca: si apre l'OBJECT MODE del Paese.

### 14.2 OBJECT MODE: Paese (es. ITALIA)

1. **Risposta:** "Repubblica parlamentare · capo dello Stato X dal … · capo del governo Y dal … · gasolio €1,72/l (settimana del 28/09/2026) · 3 eventi in corso" (solo dati presenti; ciò che manca non viene detto).
2. **Governo:** uffici apicali con titolare e data di inizio; tocco → persona.
3. **Persone e incarichi:** ministri attuali (lista compressa), con "storico" a richiesta.
4. **Eventi in corso** (connessioni esistenti).
5. **Infrastrutture:** porti, aeroporti, energia (esistenti), più tunnel, ponti e regime di pedaggio.
6. **Webcam:** quante e dove; tocco → immagine attuale su richiesta.
7. **Carburanti:** prezzo con e senza tasse, componenti fiscali, andamento a 12 mesi.
8. **Pedaggi e agevolazioni:** tipo di sistema (a distanza, entrata/uscita, vignetta), tariffa per classe a richiesta, agevolazioni accise con validità.
9. **Evidenze e fonti**, poi **Dettagli tecnici** (chiuso).

### 14.3 OBJECT MODE: Evento (es. alluvione)

1. **Cosa, dove, quando** (dati della fonte).
2. **Connessioni NEXUM:** centri abitati, infrastrutture e **webcam entro R** ("4 webcam pubbliche entro 25 km · Mostra immagine attuale").
3. **Strade, ponti e tunnel vicini**, con distanza (mai "colpiti").
4. **Contesto del Paese alla data:** "in quel giorno il capo del governo era X" (con evidenza), prezzo del gasolio di quella settimana. È contesto, non connessione.
5. **Perché? → evidenze → fonti → dettagli tecnici.**

**Mobile (Fold chiuso).** Mappa protagonista invariata. Il Paese e l'evento si aprono nel foglio esistente con la stessa gerarchia: la prima schermata mostra la risposta e le prime connessioni, il resto è a un tocco. Le immagini delle webcam si aprono a schermo intero solo su richiesta, senza aggiornamento automatico.

---

## 15. Audit UX: Grafo e gerarchia del dettaglio (da non implementare ora)

### 15.A Collisioni delle etichette nel Grafo

**Diagnosi (codice in `ui/src/views/GraphView.tsx`):**
- Per i vicinati piccoli (≤ 12 nodi su telefono, ≤ 40 altrove) il reducer imposta `forceLabel = true`. Questo **scavalca la griglia anti-sovrapposizione di Sigma** (`labelDensity`/`labelGridCellSize`), così tutte le etichette vengono disegnate.
- Il disegnatore personalizzato `defaultDrawNodeLabel` registra i box delle etichette (`labelBoxes`) ma **non verifica mai la sovrapposizione**; si limita a spostare a sinistra le etichette vicine al bordo destro.
- Con l'ellissi a 150 px (telefono) o 220 px (tablet), sul Fold chiuso etichette lunghe si sovrappongono quando i nodi sono vicini. Sul Fold aperto accade in parte, con vicinati da 13 a 40 nodi.

**Proposta KISS:**
1. **Rilevamento delle collisioni nel disegnatore.** Per ogni etichetta si prova il posto a destra, poi a sinistra, poi sopra; se tutti e tre si sovrappongono a box già disegnati (o ai controlli del grafo), l'etichetta **non** si disegna. Riusa i `labelBoxes` già calcolati.
2. **Priorità:** nodi con connessioni NEXUM e risultati di regole, poi i nodi più grandi (grado), poi gli altri. Ordinamento stabile, quindi stesso risultato a ogni frame.
3. **`forceLabel` solo** per il fuoco (desktop), il secondario e il percorso. Niente più forzatura per dimensione del vicinato.
4. **Le etichette non disegnate restano raggiungibili:** tocco sul nodo, e la lista "Collegati" già presente sopra il grafo (`graph-say`).
5. **Test:** zero intersezioni tra i box delle etichette disegnate su Fold chiuso e aperto (la geometria è già esposta da `labelBoxes()` per i test).

### 15.B Gerarchia del dettaglio (#000, #001, MEMBRI)

**Diagnosi (`ui/src/views/ObjectMode.tsx`, `Sections`).** Dopo la scheda (risultato → elementi collegati → Perché?) le sezioni seguono un ordine tecnico:
- Identità e Tipo (chiuse);
- **Proprietà aperta**, che ripete la spiegazione e mostra i nomi grezzi delle proprietà (es. `deaths_best`) e, per gli insight, **MEMBRI** con i ruoli tecnici (`#000`, `#001`, `A~group`…) in monospazio, già rappresentati in "Elementi collegati";
- Fonti aperta, Evidenze chiusa, Relazioni aperta, Correlati, Timeline, Geografia, Insight aperta, Provenienza.

**Proposta di ordine:**

| Ordine | Contenuto | Stato iniziale |
|---|---|---|
| 1 | **Risultato** (frase e dati della fonte) | visibile |
| 2 | **Elementi collegati** (connessioni NEXUM) | visibile |
| 3 | **Perché / evidenze:** "2 fonti indipendenti · Perché questa connessione?" | visibile, compatto |
| 4 | **Fonti** (nome, licenza, attribuzione) | chiusa |
| 5 | **Contesto** (geografia, stesso territorio, timeline) | chiuso |
| 6 | **Dettagli tecnici** (un solo contenitore chiuso): Identità, Tipo e regola, Proprietà grezze, Membri con ruoli `#000`, Relazioni grezze, Provenienza | chiuso |

- I ruoli `#000` restano disponibili ma solo nei Dettagli tecnici.
- Nelle viste umane: "elemento 1 nell'area", "evento all'origine" (formula già usata in Connessioni).
- Le proprietà grezze usano le etichette del vocabolario quando esistono (`facts`).
- **Nessuna informazione eliminata:** cambiano solo l'ordine e lo stato iniziale. I test esistenti che aprono sezioni tecniche dichiareranno l'apertura del contenitore, come per "Dettagli tecnici" del Perché.

---

## 16. Decisioni proposte per capacità

| Capacità | Esito | Con quali fonti / perché €0 | Cosa manca (CONDITIONAL) o perché no (NO-GO) |
|---|---|---|---|
| **Webcam: immagine corrente su richiesta** | **CONDITIONAL GO** | Caltrans (pubblico dominio), Fintraffic (CC BY 4.0), DriveBC (OGL-BC), USGS HIVIS e AVO non-FAA (pubblico dominio federale). Lista in build, immagine caricata dal browser direttamente dalla fonte: nessun server, nessuna chiave, nessun servizio a consumo. | (1) approvare la modifica CSP `img-src`; (2) leggere a mano i termini NZTA e Vegagerðin; (3) decidere se le chiavi gratuite senza carta sono ammesse in build (NO, SE, WSDOT…); (4) verificare la pagina copyright USGS e i termini AVO. |
| Webcam: video HLS | **CONDITIONAL (dopo)** | solo Caltrans, CORS `*` | hls.js nel bundle (licenza), CSP `media-src`/`connect-src`/`worker-src` |
| Webcam: elenco mondiale | **NO-GO** | — | non esiste a €0 con licenza: Windy, aggregatori e OSM sorveglianza esclusi |
| **Governi e titolari con storico** | **CONDITIONAL GO** | Wikidata (CC0) via SPARQL a lotti in GitHub Actions, con lista di QID fissata; verifica con GOV.UK (OGL) e CIA World Leaders (pubblico dominio). Nessun runtime SPARQL, nessun costo. | (1) controlli di qualità in build (un titolare per ufficio non collegiale, fine ≥ inizio, sovrapposizioni con precisione); (2) `ambiguo` come risposta di prima classe; (3) elenco di campi ammessi (§3.4); (4) **valutazione del legittimo interesse e procedura di rimozione prima di pubblicare persone viventi**; (5) data `as_of` e ID dell'enunciato su ogni legame. |
| Biografie e foto delle persone | **NO-GO** | — | Wikipedia BY-SA (solo link), diritti all'immagine; non necessarie |
| **Prezzi carburanti (33 Stati)** | **CONDITIONAL GO** | WOB (CC BY 4.0), MIMIT (IODL 2.0), DGCCRF (LO 2.0), Ministero ES, DESNZ (OGL), EIA bulk (pubblico dominio), StatCan (Open Licence), ANP, data.gov.my (CC BY 4.0), QLD (CC BY 4.0), BCE per i cambi: file pubblici senza chiave, cron di GitHub Actions, output statico. | confermare le licenze ES e BR; distanziare i download WOB; solo aggregati per impianto; dichiarare in UI la copertura (33/193), mai "mondiale". |
| Prezzi ricarica EV; scomposizione fiscale mondiale | **NO-GO** | — | nessuna fonte gratuita (IEA a pagamento; OCSE n/v) |
| **Agevolazioni accise trasporto** | **CONDITIONAL GO (curatela)** | atti ufficiali (Cellar UE, BOE, ADM, impots.gouv): curatela manuale nel repository, nessun servizio | nessun dataset strutturato; 4 schemi subito, ~7 realistici; revisione trimestrale (IT) e mensile (SI) con `review_due` |
| **Pedaggi: fase A automatica** | **CONDITIONAL GO** | BALM + BFStrMG (DE), NVDB (NO, NLOD), Dart Charge (OGL), FHWA (pubblico dominio); geometria da gares de péage FR, ANSFISA/ART, GIP AT, Area C, OSM/Geofabrik (ODbL) | conferma HAC (HR) per robots.txt; budget di file (§12) |
| Pedaggi: fase B trascritta | **CONDITIONAL GO** | atti normativi e gazzette (PL CC BY 3.0, AT RIS, SI, SK, CZ, CH, BE, BG, RO, DK, NL, ES, PT, RS, TR) | ~10–15 giornate-persona; revisione annuale; doppio controllo `manual_transcription` |
| Pedaggi da concessionari FR e calcolatori | **NO-GO** | — | copyright, nessuna licenza, anti-bot |
| **Costo di percorrenza: servizio locale** | **CONDITIONAL GO** | Valhalla (MIT) self-host da estratti Geofabrik sulla macchina dell'utente, più tabelle tariffarie NEXUM e prezzi carburanti | motore tariffario da costruire; etichetta "stima" per i sistemi chiusi; consumo inserito dall'utente |
| Costo di percorrenza: corridoi precalcolati sul sito | **CONDITIONAL GO** | build-time, piccoli JSON | scelta dei corridoi; stessi limiti di stima |
| Costo di percorrenza: routing live sul sito statico | **NO-GO** | — | grafi da decine di GB oltre i limiti di Pages; demo pubbliche non utilizzabili; R2 vietato |
| **Costo aziendale completo del trasporto** | **NO-GO come dato** | — | nessun dato aperto per autista, ammortamento, assicurazione…: solo parametri dell'utente, mai default inventati |
| **Collisioni etichette del Grafo** | **GO (proposta pronta)** | solo UI | — |
| **Gerarchia del dettaglio** | **GO (proposta pronta)** | solo UI | — |

**Decisioni richieste prima di un GO:**
1. **Budget di file:** pacchetti per dominio (raccomandato) oppure revisione di O7.
2. **Chiavi gratuite senza carta in build:** sì o no.
3. **Modifica della CSP** per le immagini delle webcam.
4. **Pubblicazione di persone viventi:** valutazione del legittimo interesse e procedura di rimozione.
5. **Ordine di priorità** dei domini. Proposta: (1) Grafo e gerarchia del dettaglio; (2) webcam; (3) carburanti UE+6; (4) governi; (5) pedaggi fase A; (6) agevolazioni e pedaggi fase B; (7) costo di percorrenza in servizio locale.

---

*Fine del documento. Nessuna implementazione avviata. In attesa di GO.*
