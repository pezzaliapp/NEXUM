# NEXUM — Confini legali ed etici

Stato: v0.1 · Questo documento non è una consulenza legale. Descrive le regole che il progetto si impone e i criteri con cui ammette o esclude fonti e funzioni.

---

## 1. Vincoli non negoziabili

| # | Vincolo |
|---|---|
| V1 | Costo operativo **€0**: nessuna API a pagamento, nessuna carta di credito, nessuna trial destinata a diventare a pagamento, nessuna infrastruttura server a pagamento. |
| V2 | Solo fonti **pubbliche, lecite e gratuite**, preferibilmente open data istituzionali. |
| V3 | Rispetto di **licenze, termini d'uso, robots.txt e limiti** di ogni fonte. |
| V4 | **Nessuna elusione** di autenticazioni, paywall, CAPTCHA, rate limit o sistemi di protezione. |
| V5 | **Nessuna raccolta illecita di dati personali.** |
| V6 | **Nessuna funzione di sorveglianza invasiva.** |
| V7 | **Originalità**: nessuna copia di codice proprietario, marchi, asset grafici, terminologia proprietaria o interfacce di prodotti commerciali. |
| V8 | Autore unico: **Alessandro Pezzali**. Nessun coautore in commit, documentazione o metadati. |
| V9 | Licenza del codice: **MIT**, con dipendenze compatibili. |

## 2. Accessibile ≠ utilizzabile

Una fonte **non** è utilizzabile solo perché tecnicamente raggiungibile. Per essere ammessa deve superare tutti i controlli del §3. In caso di dubbio non risolto, la fonte è **esclusa** fino a verifica.

## 3. Criteri di ammissione di una fonte

| Controllo | Ammessa se | Esclusa se |
|---|---|---|
| Proprietario | identificato | anonimo o non verificabile |
| Accesso | API/feed/file **documentati pubblicamente** | endpoint interni non documentati di un sito web |
| Licenza | esplicita e compatibile con l'uso previsto | assente, o vieta l'uso previsto |
| Autenticazione | nessuna, chiave gratuita o account gratuito **senza carta di credito** | richiede pagamento, carta o contratto commerciale |
| Limiti | documentati e rispettabili con caching | uso utile impossibile senza superarli |
| Costo reale | €0 per l'utente finale | qualsiasi costo, anche indiretto (es. account cloud con fatturazione) |
| Rischio di futura dipendenza | basso o mitigabile (dati scaricabili, alternative) | unico fornitore con modello commerciale evidente e nessuna alternativa |
| Dati personali | assenti, oppure eliminabili in fase di acquisizione | la finalità della fonte è identificare o seguire persone |

Ogni fonte ammessa è registrata nel **Source Registry** con licenza, attribuzione, limiti e data di verifica. Le licenze vanno **riverificate almeno ogni 6 mesi** e a ogni release.

### 3.1 Classi di verdetto

| Verdetto | Significato |
|---|---|
| **ADOPT** | Uso libero secondo licenza (es. pubblico dominio, CC0, CC BY con attribuzione). |
| **ADOPT WITH CONDITIONS** | Uso consentito con vincoli operativi: chiave personale dell'utente, rate limit stretti, solo metadati, nessuna redistribuzione, uso non commerciale. Le condizioni sono dichiarate nel registro e applicate dal codice. |
| **OPT-IN** | Connettore disattivato per default; l'utente lo abilita consapevolmente dopo aver letto le condizioni (es. licenze non commerciali). |
| **REJECT** | Non utilizzabile. Il motivo è documentato in [NEXUM-SOURCES.md](NEXUM-SOURCES.md). |

## 4. Licenze dei dati e licenza del codice

- Il **codice** NEXUM è MIT.
- I **dati** restano sotto la licenza della fonte. Il repository **non contiene dataset di terzi**: contiene solo connettori che li scaricano sulla macchina dell'utente.
- Ogni record conserva `source_id` e `license_id`; le esportazioni includono automaticamente attribuzioni e licenze.

| Licenza dati | Conseguenza in NEXUM |
|---|---|
| Pubblico dominio (es. opere del governo USA), CC0 | uso libero; attribuzione comunque mostrata per trasparenza |
| CC BY 4.0 / licenze open governative equivalenti | attribuzione obbligatoria in UI ed esportazioni |
| ODbL (OpenStreetMap) | attribuzione "© OpenStreetMap contributors"; un database derivato pubblicato deve restare ODbL |
| CC BY-SA (Wikipedia) | testi tenuti separati dal codice; attribuzione e share-alike per i contenuti derivati |
| CC BY-NC / termini non commerciali | solo **OPT-IN**, uso locale, **mai** redistribuito né incluso in esportazioni predefinite |
| Termini "tutti i diritti riservati" (notizie) | solo metadati minimi: titolo, link, data, fonte, breve descrizione fornita dall'editore |

## 5. Comportamento di rete

Regole imposte dall'architettura (Polite Scheduler), non lasciate al singolo connettore:

1. **User-Agent onesto** e identificabile, con URL del progetto. Mai user-agent casuali o di browser simulati.
2. **Nessuna falsificazione di header** di provenienza (es. indirizzi IP dichiarati), nessuna rotazione di IP o proxy per aggirare limiti.
3. Rispetto di `robots.txt` per ogni accesso non-API.
4. Rispetto di `Retry-After`, `Cache-Control`, `ETag`/`Last-Modified`.
5. Rate limit per fonte ≤ al limite documentato; backoff su errori; sospensione automatica dopo errori ripetuti.
6. **Allowlist di host** per connettore: nessuna richiesta verso URL arbitrari.
7. Credenziali gratuite **personali dell'utente**, conservate localmente, mai incluse nel repository né condivise tra installazioni.
8. Nessun accesso automatizzato a moduli, pagine di login o download protetti da registrazione manuale: in quei casi l'utente scarica il file e NEXUM lo importa.

## 6. Dati personali (GDPR e principi generali)

NEXUM è progettato per **non trattare dati personali** come finalità.

| Regola | Applicazione |
|---|---|
| Nessun oggetto "persona fisica" | il modello dati non lo prevede ([NEXUM-DATA-MODEL.md](NEXUM-DATA-MODEL.md) §10) |
| Minimizzazione | i campi personali eventualmente presenti nei payload grezzi non vengono estratti; i raw record hanno politiche di conservazione brevi |
| Nessuna ricerca per persona | nessuna funzione di ricerca per nome, username, email, telefono, IP di individui |
| Liste sanzioni | importate solo le voci relative a **organizzazioni, navi e aeromobili**; le voci relative a persone fisiche non vengono materializzate |
| Tracciamento di mezzi | aerei: esclusi gli aeromobili che aderiscono a programmi di tutela della privacy e l'aviazione privata non commerciale; navi: solo con IMO, nessuna imbarcazione da diporto; tracce conservate a bassa risoluzione e aggregate |
| Notizie | nessuna estrazione di nomi di persone come entità |

## 7. Funzioni vietate

Le seguenti funzioni **non saranno implementate** in NEXUM, indipendentemente dalla disponibilità tecnica delle fonti:

- ricerca o profilazione di persone (username, email, telefono, volti, targhe);
- consultazione di database di credenziali trafugate o dati da malware;
- scansione di porte, vulnerabilità o servizi su sistemi di terzi;
- aggregazione o proxy di webcam e flussi video;
- raccolta di contenuti da social network o app di messaggistica;
- tracciamento di wallet o transazioni di individui;
- elusione di paywall, CAPTCHA, autenticazioni o limiti;
- geolocalizzazione di individui da qualsiasi segnale.

## 8. Originalità e marchi

- Nessun riuso di codice, dati o asset di OSIRIS (vedi [NEXUM-OSIRIS-ASSESSMENT.md](NEXUM-OSIRIS-ASSESSMENT.md)).
- Nessun riferimento a nomi di prodotti commerciali di data intelligence in UI, codice o materiale promozionale di NEXUM; nessuna presentazione come "alternativa a" un prodotto proprietario.
- Terminologia generica (Object, Relation, Event, Timeline, Provenance, Confidence, Hypothesis) e identità grafica originale.
- Icone e font solo con licenze open (MIT, ISC, Apache-2.0, OFL).

## 9. Autorialità

- Autore e titolare del copyright del codice e della documentazione: **Alessandro Pezzali**.
- Nessun trailer di coautore nei commit, nessun coautore in documentazione o metadati del pacchetto.
- Contributi esterni futuri, se accettati, saranno regolati da una policy separata da definire prima di accettarli.

## 10. Procedura in caso di cambiamento di una fonte

1. Rilevazione (verifica periodica o errore del connettore).
2. Il connettore viene **sospeso** subito se la nuova condizione viola V1–V6.
3. Aggiornamento del Source Registry e di [NEXUM-SOURCES.md](NEXUM-SOURCES.md) con il motivo.
4. Se la licenza lo richiede, rimozione dei dati derivati tramite la Provenance.
5. Ricerca di una fonte alternativa.
