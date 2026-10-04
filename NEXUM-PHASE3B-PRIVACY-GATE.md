# NEXUM — Fase 3B: gate privacy per le persone viventi (block 3)

| Campo | Valore |
|---|---|
| Data | 2026-10-03 |
| Titolare del trattamento | l'autore del progetto (persona fisica), contattabile tramite l'issue tracker pubblico del repository |
| Ambito | capi di Stato e capi di governo dei 193 Stati membri dell'ONU, con la storia di **quegli** uffici dal 1990 |
| Fonte | Wikidata (CC0), via SPARQL, con lo User-Agent neutro di NEXUM |
| Esito del gate | **Nessun blocco sostanziale per l'ambito ridotto descritto qui, con i limiti qui elencati.** La pubblicazione resta limitata al deploy `live-review`. Il passaggio in produzione richiede l'approvazione esplicita dell'autore di questo documento. |
| Cosa questo documento NON dichiara | NEXUM non si dichiara "conforme al GDPR". Questa è una valutazione documentata, non una certificazione né un parere legale. |

---

## 1. Finalità

Far vedere **chi esercita (o ha esercitato) le funzioni di capo di Stato o di capo di governo, e quando**, per collocare nel tempo i fatti osservati da NEXUM:
- vista Paese: "Governo e vertici dello Stato";
- vista evento: "L'evento è avvenuto durante il mandato di X". È un contesto temporale, **mai** una causa.

Non sono finalità di NEXUM, e il trattamento non le consente:
- profilazione;
- valutazione delle persone;
- classificazioni politiche;
- liste di persone politicamente esposte (PEP) o sanzionate;
- monitoraggio di attività private.

## 2. Base giuridica

**Art. 6(1)(f) GDPR — legittimo interesse.** La valutazione si articola in tre test.

| Test | Valutazione |
|---|---|
| **Finalità legittima** | Informazione sull'esercizio di funzioni pubbliche apicali, per contestualizzare dati pubblici aperti. È un interesse riconosciuto (trasparenza e informazione sul potere pubblico; considerando 47 e art. 85). |
| **Necessità** | Il nome del titolare e le date del mandato sono il dato minimo necessario: senza nome non si sa chi ricopriva l'ufficio. Non serve altro (§3). |
| **Bilanciamento** | Le persone interessate esercitano la massima funzione pubblica dello Stato. I fatti trattati sono quelli che esse stesse rendono pubblici nell'esercizio della funzione (nomine, insediamenti, cessazioni). L'aspettativa di riservatezza su questi fatti è minima. L'impatto è basso: nessun dato privato, nessuna inferenza, nessuna foto. L'interesse pubblico prevale. |

**Art. 9 (categorie particolari).** NEXUM **non tratta l'appartenenza a partiti** né alcun altro dato dell'art. 9:
- religione;
- salute;
- etnia;
- orientamento sessuale;
- opinioni.

Il partito, previsto dal Discovery Audit come facoltativo, è **escluso** da questa iterazione: non serve alla finalità del §1.

**Art. 10.** Nessun dato giudiziario o penale.

**Art. 14 (dati non ottenuti presso l'interessato).** L'informazione individuale a ciascun capo di Stato o di governo sarebbe sproporzionata (art. 14(5)(b)). Al suo posto c'è un'informativa pubblica: questo documento e la nota nella UI, con il link per rettifica e rimozione.

## 3. Minimizzazione

| Ammessi (solo questi) | Vietati (mai, anche se presenti nella fonte) |
|---|---|
| nome pubblico (etichetta Wikidata, italiano → inglese → multilingue) | foto e immagini (nessuna copia, nessun link nella v1) |
| identificativo Wikidata (QID) | data e luogo di nascita, età |
| ufficio ricoperto, Stato, ruolo (capo di Stato / di governo) | familiari, coniugi, figli |
| data d'inizio e di fine del mandato, con la loro precisione | partito, ideologia, orientamento, punteggi |
| rango dell'enunciato, ID dell'enunciato, numero di riferimenti | religione, etnia, salute, orientamento sessuale |
| esito della verifica: giurisdizione, conflitti, date future | indirizzi, telefoni, email, social non istituzionali |
| data di recupero | patrimonio, vita privata, informazioni speculative |
| | inquadramenti "PEP", sanzioni, procedimenti |

Il connettore (`connectors/wikidata_heads.py`) **non richiede** alla fonte i campi vietati: la query SPARQL legge solo gli enunciati di incarico e le etichette. Quindi non li conserva nemmeno nei dati grezzi.

## 4. Provenienza

Ogni mandato porta:
- l'ID dell'enunciato Wikidata;
- il numero di riferimenti dell'enunciato;
- il rango;
- la precisione delle date;
- la data di recupero (`retrieved_at`).

Nella UI si vedono con il pulsante di dettaglio, insieme alla fonte e alla licenza. Le regole del supplemento Political/Public Opinion (§6.1), cioè le correzioni permanenti, si applicano prima della visualizzazione:
- solo esseri umani;
- fonte primaria = enunciati dell'ufficio;
- verifica della giurisdizione;
- rango preferito in contraddizione = conflitto segnalato;
- date future ignorate;
- aperti superati mai attuali;
- uffici collegiali da elenco esplicito;
- mai indovinare.

## 5. Esattezza e rettifica (art. 16)

- **Canale:** l'issue tracker pubblico del repository (`https://github.com/pezzaliapp/NEXUM/issues`). Il link è nella UI accanto ai mandati.
- **Procedura:**
  1. verifica della segnalazione su fonte istituzionale;
  2. correzione a monte su Wikidata, quando possibile;
  3. altrimenti un'eccezione locale documentata, applicata alla build successiva dello snapshot.
- **Tempi dichiarati:** presa in carico entro 30 giorni (art. 12(3)).
- **Segnale di dubbio:** quando la fonte è contraddittoria (più titolari attuali, rango preferito contraddetto) NEXUM **mostra il conflitto** e non sceglie. Quando un ufficio collegiale può avere membri mancanti, lo dice.

## 6. Opposizione e rimozione (art. 17 e 21)

- I titolari di incarichi apicali restano, per il periodo del mandato, perché prevale l'interesse pubblico (art. 17(3)(a)).
- Si rimuovono su richiesta, con esclusione locale tracciata:
  - persone inserite per errore (omonimia, enunciato sbagliato);
  - dati fuori dall'elenco del §3.

## 7. Conservazione

- Lo snapshot riflette lo stato della fonte alla data di recupero.
- Non c'è accumulo oltre la storia degli incarichi dal 1990.
- NEXUM non registra le consultazioni: lo snapshot è statico e la pagina non contiene tracciamento. Il fornitore dell'hosting statico può tenere log tecnici propri.
- Le build precedenti restano come versioni del deploy statico solo finché servono per il rollback.

## 8. Persone viventi e decedute

- NEXUM **non distingue** viventi e decedute: tutte le persone sono trattate con le regole dei viventi.
- Non conserva la data di morte né quella di nascita.

## 9. Valutazione d'impatto (art. 35), screening

| Criterio (linee guida WP248) | Presente? |
|---|---|
| Valutazione o punteggio | No |
| Decisioni automatizzate con effetti giuridici | No |
| Monitoraggio sistematico | No (fatti di ruolo pubblici, nessun tracciamento) |
| Dati sensibili o altamente personali | No (§2, §3) |
| Trattamento su larga scala | Limitato: circa 3.100 persone, solo per il ruolo apicale |
| Incrocio di insiemi di dati | Solo l'affiancamento temporale con eventi pubblici, senza inferenze sulla persona |
| Soggetti vulnerabili | No |
| Tecnologie innovative | No |
| Ostacolo all'esercizio di diritti | No |

**Esito dello screening:** al più un criterio, in forma attenuata. Una DPIA completa non risulta necessaria per questo ambito. Va ripetuta se l'ambito si estende, ad esempio a:
- ministri;
- parlamentari;
- partiti;
- biografie;
- foto.

## 10. Rischi residui e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Titolare sbagliato o non aggiornato (la fonte è collaborativa) | regole del §4; conflitti mostrati; badge di freschezza; rettifica (§5); niente "attuale" senza data d'inizio |
| Lettura causale ("X ha causato l'evento") | etichetta fissa "durante il mandato di", nota permanente "contesto temporale, non causa" |
| Profilazione politica tramite NEXUM | nessun partito, nessuna valutazione, nessuna aggregazione per persona oltre agli incarichi apicali |
| Omonimia | identità per QID, mai per nome |
| Esposizione involontaria dell'autore verso la fonte | User-Agent neutro di progetto, nessuna email o percorso (regola permanente) |

## 11. Blocchi

- **Nessun blocco sostanziale** per l'ambito di questo documento.
- **Fuori ambito, e quindi NON pubblicati in questa iterazione:**
  - ministri: solo modello e UI;
  - partiti;
  - biografie;
  - foto;
  - parlamentari;
  - le 38.646 persone dell'insieme completo.
- Per i ministri, un PoC richiede record istituzionali verificati con "VERIFICATO IL / FONTE". In questa iterazione non è stato prodotto.
