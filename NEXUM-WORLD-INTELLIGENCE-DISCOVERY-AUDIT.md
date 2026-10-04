# NEXUM — WORLD INTELLIGENCE DISCOVERY AUDIT

**Stato:** solo scoperta e audit. Nessuna implementazione, nessun deploy, nessun commit, nessun push, nessuna modifica a DNS o produzione, nessuna modifica alle luci.
**Data della misura:** 2026-10-03.
**Mondo misurato:** `data/live/nexum.db`, world_version 139, snapshot `live-139`. La misura è in sola lettura.
**Autore:** Alessandro Pezzali.

## Metodo

- **Misura reale.** Ogni copertura è stata misurata scaricando la fonte con lo User-Agent neutro di progetto (`NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`), senza chiavi né account. Nessun nome, email o percorso personale è stato inviato.
- **Denominatore.** Il denominatore è sempre **193 Stati membri ONU**.
- **Etichette.** "non verificato" significa che la pagina dei termini o l'endpoint non era raggiungibile (403/404/timeout). In quel caso l'elemento non è mai classificato ACCEPT.
- **Schede di dettaglio.** Sono nelle appendici:
  - A — reddito, economia e popolazione;
  - B — prezzi, casa e utenze;
  - C — carburanti;
  - D — energia;
  - E — acqua e conflitti;
  - F — webcam e Parma;
  - G — satellite.

  Ogni appendice contiene la propria matrice con URL riproducibili. Le sezioni 28, 29, 22, 23 e 32 sono misure dirette sul DB locale.
- **Classi:**

  | Classe | Significato |
  |---|---|
  | ACCEPT | €0, nessuna chiave, licenza aperta verificata, adatta alla redistribuzione |
  | CONDITIONAL | Termini non verificati o limiti d'uso da chiarire |
  | REFERENCE ONLY | Si cita o si collega, non si ridistribuisce |
  | REJECT | Esclusa |

- **Luci congelate.** L'hash sha256 dei file luce è stato preso prima dell'audit e ricontrollato alla fine: esito in §37.

---

## Sintesi esecutiva

| Dominio | Copertura onesta (su 193) | Fonte migliore a €0 senza chiave | Giudizio |
|---|---|---|---|
| Popolazione | **193** | WB WDI + UN WPP 2024 | mondiale vero |
| Economia (PIL/RNL pro capite, CPI, PPP, disoccupazione) | **169–187** | WB WDI (CC BY 4.0) | mondiale vero |
| Salari medi | **85 GOOD** (+51 parziali/vecchi); 19 Stati senza alcun dato | ILO ILOSTAT (CC BY 4.0) | quasi metà del mondo |
| Salario minimo | **166** | ILOSTAT | buono |
| Costo della vita (livello prezzi PPP) | **169** (solo indice) | WB ICP / `PA.NUS.PRVT.PLI` | indice relativo, **non** prezzi unitari |
| Beni essenziali (prezzi unitari) | **71** a livello mercato (59 correnti); nazionali **3** | WFP via HDX | Paesi WFP, non "mondo" |
| Casa (affitti/prezzi) | **34–47**, solo indici | Eurostat, OECD | Europa/OCSE; affitti e €/m² **0** |
| Utenze (elettricità/gas domestici) | **39 / 31**; acqua **0** confrontabili | Eurostat + EIA | Europa + USA |
| Carburanti (prezzo corrente) | **33 ACCEPT** (31 oggi + NO + AR) | fonti nazionali | 73 condizionali; tetto realistico ~106 |
| Accessibilità economica | **27** (litri per salario netto) | WOB + Eurostat | solo UE/EFTA |
| Energia (mix, capacità, domanda, import netti) | **184–187** | Ember (CC BY 4.0) + EIA INTL (PD) | mondiale vero |
| Flussi bilaterali gas/elettricità/greggio | **32 / 35 / 23 reporter** | Eurostat | solo Europa |
| Acqua (accesso, prelievi, stress) | **137–192** | WB WDI / UN SDG | mondiale; stress quasi tutto stimato |
| Governo | **179–181 + collegiali** | Wikidata (CC0), già nel DB | gate privacy da approvare |
| Opinione pubblica | **~38** | Eurobarometro, BCS | UE+candidati, non mondo |
| Conflitti | **47 Paesi** con ≥1 evento nel 2026 (30 negli ultimi 30 gg) | UCDP Candidate (CC BY 4.0) | unico compatibile; ritardo di 3–7 settimane |
| Webcam | **3 Paesi** oggi → 6 → max 8 | fonti nazionali aperte | **non** mondiale |
| Parma | **LINK ONLY** | pagina del Comune | niente embed, niente immagine |
| Satellite | **globale** (on-demand, nessun dato salvato) | NASA GIBS + EUMETView | fattibile, solo whitelist CSP |

**Cosa è davvero fattibile a livello mondiale:**
- popolazione;
- macroeconomia;
- energia (mix, capacità, domanda, accesso);
- acqua (accesso, prelievi);
- governo;
- satellite on-demand.

Tutti stanno sopra 165/193.

**Cosa non lo è** e va dichiarato come regionale o assente:
- prezzi al dettaglio, affitti, utenze, tariffe dell'acqua, accessibilità economica: Europa/OCSE;
- flussi bilaterali di energia: Europa;
- opinione pubblica: UE;
- webcam: pochi Paesi;
- reddito disponibile delle famiglie: nessuna fonte mondiale;
- capacità di raffinazione e geometrie dei gasdotti: nessun dato aperto.

---

## 1. GLOBAL COVERAGE MATRIX (§55)

TOTAL = Stati ONU con almeno un valore. GOOD = valore recente e confrontabile. PARTIAL = recente ma incompleto o con un anno più vecchio. STALE = l'ultimo valore è vecchio. "n.m." = non misurato.

| INDICATOR | TOTAL | GOOD | PARTIAL | STALE | NOT COMPARABLE | NO DATA | SOURCE | LATEST DATE | LICENSE | ZERO COST | NO KEY | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Popolazione totale | 193 | 193 | 0 | 0 | 0 | 0 | WB `SP.POP.TOTL` / UN WPP 2024 | 2024 (WPP proiezioni 2026) | CC BY 4.0 / CC BY 3.0 IGO | sì | sì | **ACCEPT** |
| Città più grande / urbanizzazione | 149 | 149 | – | – | – | 44 | WB `EN.URB.LCTY` | 2024 | CC BY 4.0 | sì | sì | ACCEPT (dichiarare 149) |
| PIL pro capite (USD, PPP) | 187 | 184 | 3 | – | 0 | 6 | WB WDI | 2024–2025 | CC BY 4.0 | sì | sì | **ACCEPT** |
| RNL pro capite | 186 | 184 | 2 | – | 0 | 7 | WB WDI | 2024 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Inflazione CPI | 172 | 172 | – | – | 0 | 21 | WB `FP.CPI.TOTL.ZG` | 2025 | CC BY 4.0 | sì | sì | **ACCEPT** |
| CPI (alternativa) | 184 | n.m. | – | – | 0 | 9 | FAOSTAT CPI | 2026 (mensile) | CC BY 4.0 | sì | sì | ACCEPT (integrazione) |
| Disoccupazione (modellata ILO) | 178 | 176 | – | – | stime modellate | 15 | WB/ILO `SL.UEM.TOTL.ZS` | 2025 | CC BY 4.0 | sì | sì | **ACCEPT** con "modellata" |
| Export / import % PIL | 165 | 165 | – | – | 0 | 28 | WB WDI | 2024 | CC BY 4.0 | sì | sì | ACCEPT |
| Debito pubblico % PIL | 185 (IMF) / 42 (WB) | IMF 185 | – | – | – | 8 | IMF WEO / WB | 2025 | IMF: download automatico in blocco vietato | sì | sì | **REFERENCE ONLY** (IMF), REJECT (WB 42) |
| Retribuzione media mensile (PPP) | 160 | 85 | 51 | 24 | definizioni nazionali | 33 | ILOSTAT | 2024 | CC BY 4.0 (dal 2023-05-03; verificare) | sì | sì | **ACCEPT con età del dato** |
| Retribuzione mediana | 87 | 87 | – | – | – | 49+ | ILOSTAT | 2024 | CC BY 4.0 | sì | sì | CONDITIONAL (copertura) |
| Salario minimo legale | 166 | 166 | – | – | alcuni Stati non hanno un minimo | 27 | ILOSTAT | 2025 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Livello dei prezzi (PLI, PPP consumi privati) | 169 | 169 | – | – | indice, non prezzo | 24 | WB `PA.NUS.PRVT.PLI` / `PA.NUS.PRVT.PP` | 2024 | CC BY 4.0 | sì | sì | **ACCEPT** come indice relativo |
| Consumo delle famiglie pro capite | 156 | 156 | – | – | – | 37 | WB WDI | 2024 | CC BY 4.0 | sì | sì | ACCEPT |
| Reddito disponibile delle famiglie | ~38 | OCSE | – | – | – | ~155 | OECD | 2023 | CC BY 4.0 | sì | sì | regionale; **nessuna fonte mondiale** |
| Prezzi al dettaglio dei beni essenziali (mercato) | 71 | 59 | – | 12 | prezzi locali, unità diverse | 122 | WFP via HDX | 2026 | CC BY-IGO | sì | sì | ACCEPT (Paesi WFP, mai "mondo") |
| Prezzi alimentari (FPMA) | 136 | n.m. | – | – | – | 57 | FAO GIEWS FPMA | 2026 | non specificata, dati di terzi | sì | sì | **CONDITIONAL** |
| Elettricità domestica €/kWh | 39 | 39 | – | – | tasse, fasce | 154 | Eurostat `nrg_pc_204` + EIA | 2025-S2 | Eurostat riuso / PD | sì | sì | ACCEPT (UE+USA) |
| Gas domestico €/kWh | 31 | 31 | – | – | – | 162 | Eurostat `nrg_pc_202` | 2025-S2 | Eurostat riuso | sì | sì | ACCEPT (UE) |
| Tariffe dell'acqua | 0 confrontabili | 0 | – | – | **tutte** (per utility) | 193 | IBNET (403 / NXDOMAIN) | – | non verificata | – | – | **NON ADOTTARE** |
| Indice dei prezzi delle case | 47 | 47 | – | – | indice | 146 | OECD / Eurostat | 2026-Q1 | CC BY 4.0 | sì | sì | ACCEPT (OCSE) |
| Rapporto prezzo/reddito, indice degli affitti | 37 / 41 | idem | – | – | indice | 156 / 152 | OECD | 2026-Q1 | CC BY 4.0 | sì | sì | ACCEPT (OCSE) |
| Affitto o prezzo al m² | 0 | 0 | – | – | – | 193 | – (Numbeo escluso) | – | – | – | – | **GAP** |
| % del reddito speso per la casa | 34 | 34 | – | – | – | 159 | Eurostat `ilc_mded01` | 2024 | Eurostat riuso | sì | sì | ACCEPT (UE) |
| Benzina/diesel, prezzo corrente | 33 | 33 | – | – | prezzo massimo ufficiale vs medio | 160 | nazionali (WOB, EIA, DESNZ, StatCan, MyGov…, +SSB NO, +AR) | 2026-09 | aperte verificate | sì | sì | **ACCEPT** |
| Carburanti, con permessi | +73 | – | – | – | – | – | fonti nazionali con termini da chiarire | varie | non verificate | sì | parz. | CONDITIONAL |
| Carburanti, storico | 137 | 0 | – | 137 (fermo 2025-04) | fonti eterogenee | 56 | WB Global Fuel Prices DB | 2025-04 | ODbL da confermare | sì | sì | **REFERENCE ONLY** |
| Litri di carburante per salario netto | 27 (+3) | 27 | – | – | – | 163 | WOB + Eurostat `earn_nt_net` | 2025 | riuso | sì | sì | ACCEPT (UE/EFTA) |
| Pane per salario nazionale | 0 | 0 | – | – | – | 193 | – | – | – | – | – | **GAP** |
| Generazione e domanda elettrica | 184 | 183 | 1 | 0 | 0 | 9 | Ember Yearly | 2025 (88) / 2024 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Elettricità pro capite (MWh) | 184 | 183 | 1 | 0 | popolazione Ember | 9 | Ember | 2025 | CC BY 4.0 | sì | sì | ACCEPT (ricalcolare con la popolazione WB) |
| Capacità installata per fonte | 187 | 187 | 0 | 0 | 0 | 6 | EIA INTL | 2024 | Public domain | sì | sì | **ACCEPT** |
| Nucleare (generazione > 0) | 31 produttori su 174 righe | 31 | – | – | – | – | Ember / EIA | 2025 | CC BY / PD | sì | sì | ACCEPT |
| Solare / eolico / idroelettrico (TWh, GW) | 181–184 | 172–183 | ≤1 | ≤2 | 0 | 9–12 | Ember | 2025 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Rinnovabili per 26 tecnologie | 190 | 190 | – | – | – | 3 | IRENASTAT | 2025 | termini non verificati | sì | sì | CONDITIONAL |
| Accesso all'elettricità | 193 | 193 | 0 | 0 | stime modellate | 0 | WB `EG.ELC.ACCS.ZS` | 2024 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Dipendenza energetica (import % uso) | 143 | 67 | 72 | ≥1 | – | 50 | WB `EG.IMP.CONS.ZS` | 2023 | CC BY 4.0 | sì | sì | CONDITIONAL |
| Gas: produzione/consumo/import/export | 187 | 186 | 0 | 1 | 0 | 6 | EIA INTL | 2024 | PD | sì | sì | **ACCEPT** |
| Gas mensile (pipeline/GNL) | 77–88 | 59–66 | – | 4–8 | – | 105–116 | JODI-Gas | 2026 | non verificati | sì | sì | CONDITIONAL |
| Gas: archi bilaterali per partner | 32 reporter / 185 archi | 32 | – | – | – | 161 | Eurostat `nrg_ti_gas` | 2024 | riuso | sì | sì | ACCEPT (**solo Europa**) |
| Gas via gasdotto (commercio) | 103 reporter / 316 archi | n.m. | – | – | kg/USD, non energia | 90 | UN Comtrade preview | 2024 | termini non verificati; limite 500 righe, 429 | sì | sì | CONDITIONAL |
| Punti di interconnessione del gas | 40 Paesi / 1.186 punti | 40 | – | – | – | 153 | ENTSOG | 2026 | termini non verificati | sì | sì | CONDITIONAL |
| Elettricità: archi bilaterali | 35 reporter / 146 archi | 35 | – | – | – | 158 | Eurostat `nrg_ti_eh` | 2024 | riuso | sì | sì | ACCEPT (**solo Europa**) |
| Elettricità: solo import netti | 184 | 183 | 1 | – | nessun partner | 9 | Ember | 2025 | CC BY 4.0 | sì | sì | ACCEPT |
| Greggio: produzione | 185 | 185 | 0 | 0 | 0 | 8 | EIA INTL | 2025 | PD | sì | sì | **ACCEPT** |
| Prodotti petroliferi: consumo | 186 | 186 | 0 | 0 | 0 | 7 | EIA INTL | 2025 | PD | sì | sì | ACCEPT |
| Greggio: import/export | 185 | 0 | 0 | 185 (2018/2020) | – | 8 | EIA INTL | 2020 | PD | sì | sì | **REJECT** (dato fermo) |
| Petrolio mensile (JODI) | 115 | 93 | – | n.m. | – | 78 | JODI-Oil | 2026-07 | non verificati | sì | sì | CONDITIONAL |
| Greggio: archi bilaterali | 23 reporter / 243 archi | 23 | – | – | – | 170 | Eurostat `nrg_ti_oil` | 2024 | riuso | sì | sì | ACCEPT (Europa) |
| Capacità di raffinazione | 0 | 0 | – | 185 (prodotti fermi al 2014) | – | 193 | – | – | – | – | – | **GAP** |
| Acqua potabile almeno di base | 192 | 183 | 4 | 5 | stime JMP | 1 | WB/JMP | 2024 | CC BY 4.0 | sì | sì | **ACCEPT** |
| Acqua potabile "safely managed" | 137 | 135 | 1 | 1 | stime | 56 | WB/JMP | 2024 | CC BY 4.0 | sì | sì | ACCEPT ("mancante ≠ 0") |
| Prelievi d'acqua / risorse pro capite | 179 / 181 | idem | 0 | 0 | anni riportati in avanti | 14 / 12 | AQUASTAT via WDI | 2022 | CC BY 4.0 | sì | sì | ACCEPT con l'anno reale |
| Stress idrico SDG 6.4.2 | 177 | 7 nazionali | – | – | **170 stimati (FAO)** | 16 | UN SDG API | 2023 | CC BY 4.0 | sì | sì | ACCEPT con "stimato" |
| Capo di Stato / di governo in carica | 183 / 182 | 179+4 / 181+1 | – | – | collegiali | 10 / 11 | Wikidata (già in NEXUM) | 2026-10 | CC0 | sì | sì | in uso; **gate privacy da approvare** |
| Opinione pubblica misurata | ~38 | 38 | – | – | – | ~155 | Eurobarometro, BCS | 2026 | riuso CE | sì | sì | in uso; regionale |
| Violenza organizzata letale | 47 Paesi (1.982 eventi, 2026) | 30 (≤30 gg) / 37 (≤90 gg) | – | – | filtro ≥5 morti | – | UCDP Candidate | 2026-08-31 | CC BY 4.0 | sì | sì | **ACCEPT**; è l'unica fonte |
| Conflitti con proteste / attacchi senza morti | 0 | – | – | – | – | 193 | ACLED (account, niente redistribuzione) | – | – | – | **no** | **REJECT** |
| Webcam pubbliche ACCEPT | 3 Paesi (6.626 camere) | 3 | – | – | – | 190 | Caltrans, USGS, AVO, DriveBC, Fintraffic | live | aperte | sì | sì | ACCEPT; candidati HK/TfL/SG → 6 |
| Immagini satellitari quasi in tempo reale | globale (on-demand) | – | – | – | latenza 15–52 min | – | NASA GIBS, EUMETView | ogni 10 min / giornaliera | NASA libero; EUMETSAT Core CC BY 4.0 | sì | sì | **ACCEPT** (solo visualizzazione) |

---

## 2. INCOME / SALARY

- **ILOSTAT, retribuzione media mensile:**
  - in PPP: 85 GOOD, 51 parziali, 24 vecchi, 33 senza dato;
  - in valuta locale: 86 GOOD, 21 senza dato.
- **Mediana:** 87 Paesi.
- **Salario minimo:** 166 Paesi. Alcuni Stati non hanno per legge un minimo: va scritto "nessun minimo legale", mai 0.
- **19 Stati senza alcun dato sui salari:** DZA, PRK, DMA, ERI, GAB, GRD, HTI, IRN, IRQ, LBY, MAR, FSM, MCO, OMN, CAF, KNA, VCT, SSD, TUV.
- **Reddito disponibile delle famiglie:** esiste solo per l'OCSE (~38). Non c'è una fonte mondiale.
- **Regola onesta:** mostrare sempre l'anno e la definizione (lordo/netto, settore, fonte nazionale). Niente classifiche tra Paesi con definizioni diverse.
- Dettagli in Appendice A.

## 3. COST OF LIVING

- **Esiste a livello mondiale solo come indice relativo:**
  - WB `PA.NUS.PRVT.PLI` e `PA.NUS.PRVT.PP`: 169 Paesi (`PA.NUS.PPPC.RF` è archiviato);
  - ICP 2021: 163 Paesi, solo come riferimento;
  - CPI: 172 (WB) o 184 (FAOSTAT).
- **Non esiste** un costo della vita in euro per città o Paese che sia aperto e confrontabile.
- **Esclusi:** Numbeo, Expatistan e GlobalPetrolPrices (licenze NC-ND o a pagamento).
- Dettagli in Appendice B.

## 4. ESSENTIAL GOODS

- **WFP via HDX:** 71 Paesi con prezzi di mercato (59 correnti), quasi solo nei contesti di insicurezza alimentare. Le medie nazionali esistono solo per 3 Paesi.
- **FAO FPMA:** 136 Paesi, ma licenza non specificata e dati di terzi → CONDITIONAL.
- **Pane, latte o uova con prezzo nazionale confrontabile nel mondo:** nessuna fonte. Il mondo non va dichiarato coperto.

## 5. HOUSING

- **Indici:**
  - OCSE: prezzi delle case 47, rapporto prezzo/reddito 37, affitti 41;
  - Eurostat: sovraccarico abitativo e quota di reddito per la casa 34.
- **Affitto o prezzo al m²:** 0 fonti aperte. È un gap.

## 6. UTILITIES

- **Elettricità domestica:** 39 Paesi (Eurostat 38 + EIA USA).
- **Gas domestico:** 31.
- **Acqua:** gap totale. IBNET risponde 403 o NXDOMAIN, e le tariffe sono per singola utility, non confrontabili tra Paesi.
- **Fuori da Europa e USA:** nessuna fonte aperta per le utenze.

## 7. FUEL PRICES

- **ACCEPT, 33 Paesi:** i 31 già in NEXUM più Norvegia (SSB, CC BY 4.0) e Argentina (dati aperti, CC BY 4.0).
- **CONDITIONAL, 73:** fonti nazionali con termini da chiarire.
- **REFERENCE ONLY, 31:** presenti solo nel WB Global Fuel Prices Database, fermo al 2025-04.
- **Nessuna fonte, 56.**
- **Tetti realistici:** ~106 Paesi con permessi espliciti; ~137 solo come dato storico.
- **Corea (Opinet):** serve una chiave → REJECT.
- **Avvertenze:**
  - prezzo massimo ufficiale ≠ prezzo medio osservato;
  - unità e qualità del carburante differiscono;
  - in molti Paesi i prezzi sono sussidiati (IMF e WB subsidies: REFERENCE).
- Dettagli in Appendice C.

## 8. PURCHASING POWER / AFFORDABILITY

| Indicatore | Copertura | Nota |
|---|---|---|
| Litri di benzina per salario netto mensile | **27** Paesi validi (+3 condizionali) | WOB + Eurostat `earn_nt_net` |
| Bolletta elettrica / salario | 27 | |
| % del reddito speso per la casa | 34 | dato diretto, senza calcoli |
| Rapporti locali WFP | benzina 7, pane 4, farina/riso 11 | |
| Pane per salario nazionale | **0** | |

- I rapporti salario/prezzo restano onesti solo se numeratore e denominatore sono dello stesso Paese, dello stesso anno e della stessa definizione.
- Fuori dall'UE/EFTA non si possono calcolare senza mischiare fonti incompatibili.

## 9. ENERGY

- **Ember Yearly (CC BY 4.0, aggiornato due volte al mese): 184 Paesi.**
  - Contiene generazione, domanda, import netti e mix per fonte in TWh, % e GW di capacità.
  - 183 Paesi hanno dati del 2023 o successivi; 88 hanno già il 2025.
  - Mancano: ALB, AND, FSM, LIE, MCO, MHL, PLW, SMR, TUV.
- **EIA International bulk (public domain): 185–187 Paesi.**
  - Contiene generazione, capacità per fonte (con geotermia e pompaggio), totali di gas e petrolio, energia primaria.
- **Ember ed EIA non sono indipendenti:** la differenza mediana è 0,2%. Vanno mostrate come due fonti, non come una conferma reciproca.
- **WB:**
  - accesso all'elettricità: 193;
  - `EG.ELC.RNEW.ZS` è fermo al 2021 → REJECT;
  - dipendenza energetica: 143, CONDITIONAL.
- Dettagli in Appendice D.

## 10. ENERGY PER CAPITA

- Ember MWh pro capite: 184 Paesi.
- Consumo elettrico pro capite della WB: solo 146 Paesi, derivato IEA → REFERENCE.
- **Raccomandazione:** calcolarlo in NEXUM dividendo la domanda Ember per la popolazione WB dello stesso anno, e dichiarare la formula.

## 11. NUCLEAR

- **Produzione:** 31 Paesi con generazione nucleare > 0 (Ember/EIA).
- **Impianti:**
  - GPPD: 195 siti nucleari, al 2021, già in NEXUM tramite `wri.power_plants`;
  - Wikidata: 434 centrali in 55 Paesi, con stato misto (attive, chiuse, in progetto) → filtrare per stato.
- **Reattori:** IAEA PRIS non ha accesso in blocco → REFERENCE. Non esiste un dato aperto per reattore.
- **Regole esistenti:** `quake/tsunami/storm_nuclear_exposure` hanno un alto valore informativo e le distanze sono verificate (§29).

## 12–14. SOLAR / WIND / HYDRO

- **Ember:** generazione e capacità.
  - Solare: 183 Paesi.
  - Eolico: 181.
  - Idroelettrico: 180.
- **IRENASTAT:** 190 Paesi e 26 tecnologie, ma termini non verificati → CONDITIONAL.
- **Impianti:**
  - GPPD, già presente;
  - GEM: CC BY 4.0, ma il modulo di download chiede nome ed email → serve una decisione dell'autore; i record "Solar TZ" sono NC → esclusi;
  - OSM: 163.816 impianti, ODbL share-alike → REFERENCE.
- **Dighe:** Global Dam Watch e GeoDAR sono CC BY 4.0 → candidati. GRanD e GDAT hanno clausole NC/ND → esclusi.

## 15. GAS

- **EIA:** produzione, consumo, import ed export totali in 187 Paesi (2024) → ACCEPT.
- **JODI-Gas mensile:** 77–88 Paesi, termini non verificati → CONDITIONAL.

## 16. GAS ORIGIN / FLOWS / PIPELINES / LNG

- **Origine per partner con licenza chiara: solo Europa** (Eurostat `nrg_ti_gas`, 32 reporter, 185 archi).
  - Esempio verificato, Italia 2024, in milioni di m³: Algeria 23.267, Azerbaigian 10.314, Qatar 6.902, Russia 5.696, Stati Uniti 5.187, Norvegia 3.603.
- **Commercio mondiale via gasdotto:** UN Comtrade preview (HS 271121), 103 reporter e 316 archi.
  - È in kg/USD, non in energia; il limite è 500 righe e risponde 429; termini non verificati → CONDITIONAL.
- **ENTSOG:** 1.186 punti, 40 Paesi, 128 coppie direzionali, nessuna chiave → CONDITIONAL.
- **Esclusi:** ENTSO-E (token), IEA Gas Trade (account), OSM `lng_terminal`.
- **Geometrie aperte dei gasdotti:** nessuna (GEM GGIT richiede il modulo con dati personali) → GAP.
- **Regola:** un arco "X fornisce gas a Y" è ammesso solo con volume, anno e fonte. Mai inferito dalla geografia.

## 17. ELECTRICITY IMPORT / EXPORT / INTERCONNECTORS

- **Fuori dall'Europa:** solo il saldo netto (Ember, 184 Paesi).
- **Per partner:** solo Europa (Eurostat `nrg_ti_eh`, 35 reporter, 146 archi).
- **Interconnettori fisici:** ENTSO-E richiede un token → REJECT. Non c'è una fonte mondiale aperta.

## 18. OIL / REFINING

| Indicatore | Copertura | Esito |
|---|---|---|
| Produzione di greggio (EIA) | 185 | ACCEPT |
| Consumo di prodotti petroliferi | 186 | ACCEPT |
| Import/export di greggio (EIA) | fermo al 2018/2020 | REJECT |
| Produzione di raffinati (EIA) | ferma al 2014 | REJECT |
| JODI-Oil mensile | 115 Paesi | CONDITIONAL |
| Archi Eurostat del greggio | 23 reporter, 243 archi | Europa |
| Capacità di raffinazione | nessuna fonte aperta | GAP |

## 19. WATER

- **Acqua potabile almeno di base:** 192 Paesi. **"Safely managed":** 137.
- **Sanificazione:** 192 di base, 138 "safely managed".
- **Prelievi e risorse rinnovabili:** 175–181 Paesi, ultimo anno 2022. Gli anni vengono riportati in avanti, quindi va mostrato l'anno di osservazione reale.
- **Stress idrico SDG 6.4.2:** 177 Paesi, ma **170 valori sono stime FAO**: va scritto per ogni Paese.
- **Già disponibili:** gli indicatori WDI passano dalla fonte `worldbank.wdi` già attiva (CC BY 4.0), quindi non serve una nuova fonte.
- **Gap:**
  - tariffe dell'acqua;
  - dissalazione: DesalData è a pagamento e non esiste un DB aperto;
  - origine dell'acqua (superficie/falda): solo parziale.
- Dettagli in Appendice E.

## 20. POPULATION

- **Copertura:** 193/193 (WB + UN WPP 2024, CC BY 3.0 IGO).
- **Città più grande:** 149 Paesi.
- **Già presente:** NEXUM ha già i centri abitati da Natural Earth.

## 21. ECONOMY

- **Dati mondiali:** PIL e RNL pro capite 184–187 Paesi, CPI 172–184, disoccupazione 176, commercio estero 165.
- **Debito pubblico:**
  - WB ha solo 42 Paesi → REJECT;
  - IMF ne ha 185, ma i suoi termini vietano il download automatico in blocco → REFERENCE (solo link).

## 22. GOVERNMENT — stato attuale

- **Dati:** Wikidata (CC0), capi di Stato e di governo dei 193 Stati ONU, mandati dal 1990. Sono 330 uffici, 3.083 titolari e 3.682 mandati.
- **Copertura del titolare attuale documentato:**
  - capo di Stato: 179 univoci + 4 collegiali (10 senza dato);
  - capo di governo: 181 + 1 (11 senza dato).
- **Privacy:** il gate (`NEXUM-PHASE3B-PRIVACY-GATE.md`) è **ancora da approvare** dall'autore per la produzione.
- **Ministri:** solo come modello.
- **Espansione:** nessuna proposta in questa fase.

## 23. PUBLIC OPINION — stato attuale

- **Fonti:** Eurobarometro standard (4 ondate 2024–2026, 38 Paesi tra UE e candidati) e indagini BCS sui consumatori (32 Paesi, mensili).
- **Regola:** la direzione percepita si mostra con una freccia solo oltre l'errore campionario.
- **Copertura mondiale:** **~38/193** Stati con opinione misurata e redistribuibile.
- **Non usati:** Afrobarometer e i barometri regionali, per licenza o accesso. Senza una licenza aperta non si va oltre l'Europa.

## 24. CONFLICT & SECURITY

- **Fonte compatibile: solo UCDP** (Candidate + GED 26.1, 1989–2025, CC BY 4.0).
- **Escluse:**
  - ACLED: account, niente redistribuzione;
  - HDX HAPI: richiede un identificativo con email;
  - ReliefWeb: serve l'approvazione di un appname;
  - GTD: fermo al 2021 e non redistribuibile;
  - GDELT: troppo rumoroso.
- **Stato locale:** 1.982 eventi (2026-01 → 2026-08), tutti preliminari.
  - Il filtro del connettore (`MIN_DEATHS = 5`, `connectors/ucdp_candidate.py:19`) **scarta l'85,5%** delle 13.659 righe grezze.
  - Paesi con ≥1 evento: 30 negli ultimi 30 giorni, 37 negli ultimi 90, 47 in tutto.
  - Il 37% degli eventi ha una precisione più grossolana del comune.
- **Zone proposte, solo su eventi documentati e senza previsioni.** Unità: admin-1. Finestra: 90 giorni.

  | Zona | Regola |
  |---|---|
  | **ROSSO, R1** | ≥3 eventi distinti |
  | **ROSSO, R2** | ≥25 morti con almeno 2 eventi |
  | **ARANCIONE, O1** | attore statale estero documentato (`gwnoa` ≠ Paese del luogo) |
  | **ARANCIONE, O2** | ≥2 eventi propri entro 50 km da un confine con una zona rossa di un altro Stato |

  - La sola prossimità non colora nulla.
  - Un intero Paese non diventa mai rosso per un singolo evento.
- **Cosa servirebbe:**
  - campi oggi non salvati: `gwnoa`, `gwnob`, `country_id`, `event_clarity`, `date_prec`, `priogrid_gid`;
  - `MIN_DEATHS` abbassato a 1;
  - i poligoni admin-1, che hanno un costo in volume (§32).
- **Ordine di grandezza:** già oggi 54 admin-1 hanno ≥3 eventi in 90 giorni, ed è una sottostima dovuta al filtro.
- **Cosa non si può fare onestamente:**
  - attacchi senza morti;
  - la categoria "terrorismo";
  - le proteste;
  - il tempo reale (ritardo di 3–7 settimane);
  - la criminalità organizzata;
  - le previsioni;
  - i confini contesi.

  In particolare, 32 eventi UCDP attribuiti a "Israel" cadono nel poligono Natural Earth "Palestine".
- Dettagli in Appendice E §2.

## 25. WEBCAMS

- **Oggi in NEXUM:** 6.626 camere in 3 Paesi ONU (USA, Canada, Finlandia).
- **Campione verificato:** ~83% delle immagini sono correnti.

  | Fonte | Immagini correnti | Nota |
  |---|---|---|
  | DriveBC | 100% | |
  | Fintraffic | 97,5% | |
  | AVO | 90% | |
  | Caltrans | 82,5% | 17,5% è un segnaposto "Temporarily Unavailable" servito con codice 200 |
  | USGS NIMS | 72,5% | 25% ferme |

- **Difetto:** Caltrans `image_observed_at` viene da `recordTimestamp` (`connectors/caltrans_cctv.py:32`), con date dal 2016 al 2026 → fuorviante.
- **Candidati con licenza aperta esplicita:**
  - Hong Kong: 1.013 camere;
  - TfL Londra: 890 camere, da chiarire l'obbligo di registrazione;
  - Singapore: solo 8 camere.

  Con loro si arriva a **6 Paesi**.
- **Da verificare:** le licenze di Nuova Zelanda (313) e Islanda (496) → **massimo 8 Paesi** (4,1%).
- **Esclusi:**
  - Windy, 511 USA/Canada, WSDOT, NSW/QLD: chiave;
  - Norvegia: registrazione;
  - Autobahn: nessuna webcam;
  - SkylineWebcams: vietato riprodurre.
- **Conclusione:** le webcam **non diventeranno mondiali** a €0 senza chiavi.

## 26. PARMA GOLDEN WEBCAM TEST

- **Verdetto: LINK ONLY.**
- **La camera:** è del Comune di Parma, su Piazza Garibaldi, pubblicata tramite SkylineWebcams (id 722).
  - Coordinate: 44,8015 N, 10,3280 E.
  - È stato verificato che inquadra il Palazzo del Governatore.
  - Video HLS con segmenti di 4 s e ritardo di ~10–20 s; la miniatura `live722.jpg` si aggiorna ogni ~4 min.
- **Blocchi:**
  - anti-hotlink tramite Referer: risponde con un HTML di 117 B;
  - l'HLS richiede un cookie di sessione;
  - l'embed è consentito solo ai domini autorizzati;
  - i termini vietano la riproduzione.
- **Cosa resta possibile:** un oggetto webcam di Parma con link alla pagina ufficiale, https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi, senza immagine e senza embed. Per mostrare l'immagine serve un permesso scritto del Comune o di Skyline.
- Dettagli in Appendice F.

## 27. SATELLITE EO

- **NASA GIBS** (nessuna chiave, CORS `*`):
  - VIIRS/MODIS true colour giornaliero;
  - luci notturne DNB della notte precedente;
  - anomalie termiche;
  - **HLS a 30 m senza account** (rivisita 2–5 giorni, condizionata dalle nubi);
  - GOES/Himawari ogni 10 min, latenza misurata 32–52 min.
- **Europa e Africa:** GIBS non ha un geostazionario su quest'area → **EUMETView**.
  - WMS senza registrazione, CORS `*`.
  - MTG-FCI ogni 10 min, latenza ~25 min.
  - MSG rapid scan ogni 5 min, latenza ~15 min.
  - Licenza Core CC BY 4.0.
- **Trappole verificate:**
  - GIBS WMS risponde 200 con un'immagine vuota quando i dati mancano → serve il controllo `Data-Present` (Worldview Snapshots);
  - EUMETView tiene in cache per 7 giorni se manca `time`;
  - di notte l'immagine visibile è nera → serve l'infrarosso.
- **Esclusi:** Copernicus Data Space / Sentinel Hub e USGS EarthExplorer (account); SLIDER e JMA (API interne); EOX cloudless (licenza).
- **Modifica necessaria:** solo la whitelist CSP.
  - `img-src`: `gibs.earthdata.nasa.gov` e `view.eumetsat.int`;
  - facoltativi: `wvs.earthdata.nasa.gov` e `cdn.star.nesdis.noaa.gov`;
  - `connect-src`: gli stessi più `cmr.earthdata.nasa.gov`.
- **Nessun dato salvato nello snapshot:** O6 e O7 non cambiano.
- **Etichette obbligatorie:** l'ora di acquisizione ("acquisizione del GG/MM HH:MM UTC") e "non in diretta".
- **Raccomandazione:** GO per OSSERVA → SATELLITE.
- Dettagli in Appendice G.

## 28. EXISTING EVENT DATA INTEGRITY

Misura sul mondo `live` locale (sola lettura). Il mondo pubblicato è fermo al recupero del 2026-10-01: non è attivo alcun aggiornamento automatico.

| Categoria | Fonte | N | Dal | Ultimo record | Senza coordinate | Stato |
|---|---|---|---|---|---|---|
| Terremoti | USGS | 5.498 | 2015-01-02 | 2026-09-29 | 0 | OK |
| Terremoti significativi | NOAA NCEI | 737 | 2012 | 2026-08-14 | 0 | OK (ritardo di settimane) |
| Tsunami | NOAA NCEI | 254 | 2012 | 2026-08-14 | 0 | OK |
| Eruzioni | NOAA NCEI | 91 | 2012 | 2026-05-07 | 0 | OK (ritardo di mesi) |
| Incendi | NASA EONET | 4.906 | 2015 | 2026-09-29 | **4** | OK, 4 senza geometria |
| Tempeste | NASA EONET | 1.085 | 2015 | 2026-09-30 | 0 | **QUESTIONABLE** |
| Attività vulcanica | NASA EONET | 569 | 2015 | 2026-06-15 | 0 | OK |
| Alluvioni | NASA EONET | 114 | 2015 | **2018-10-15** | 0 | **STALE** |
| Frane | NASA EONET | 2 | 2017 | **2018-10-11** | 0 | **STALE** |
| Emergenze Copernicus | CEMS | 1.065 | 2012 | 2026-09-15 | 0 | OK |
| Violenza organizzata | UCDP Candidate | 1.982 | 2026-01-01 | 2026-08-31 | 0 | OK (solo 2026) |

In nessuna categoria ci sono coordinate non valide, date future o una fine precedente all'inizio.

**Verifica a campione contro la fonte primaria:**
- USGS: **12/12 identici**.
- EONET: incendi 3/3 e vulcano 1/1 identici.
- NOAA NCEI: 3/3 coerenti.
- **Tempeste EONET:** il luogo è il punto di massima intensità, ma l'istante è quello della prima posizione. Così luogo e istante non sono contemporanei: negli esempi la distanza dalla prima posizione è di 1.555 km e 1.840 km.
- **UCDP:** alcune etichette sono codici grezzi ("XXX475 · …") con stato di fonte "Check dyad" → vanno mostrate come "attore non identificato dalla fonte".

**Possibili duplicati** (stesso tipo, < 1 h, < 10 km):

| Tipo | Coppie | Lettura |
|---|---|---|
| Terremoti | 190 | repliche attese |
| Incendi | 123 | spesso incendi distinti e contigui, da verificare |
| UCDP | 81 | diadi distinte, attese |

Non ci sono duplicati tra fonti diverse.

**Provenienza:** ogni evento ha il percorso completo record → raw (sha256, URL, data di recupero).

## 29. CONNECTION INTEGRITY

**Relazioni nel mondo:**
- `located_in`: 119.521;
- `near_place`: 2.516;
- `held_by`: 3.682;
- `measured_in`: 831;
- pedaggi: 1.673;
- governo: 588.

Insight attivi: **2.504** in 31 regole.

**Verifica geometrica:** ho ricalcolato le distanze e le ho confrontate con `evidence.distance_m`: **0 discrepanze in 27 regole su 31**. Le altre sono spiegate:
- distanza 0 = punto dentro il poligono dell'evento;
- `event_event_association` misura dal centro dell'area CEMS, e lo dichiara nel testo.

| Regola / famiglia | Classe | Motivo |
|---|---|---|
| `quake_impact_association`, `tsunami_quake_association` | VALID | stessa scossa in due fonti |
| `activation_*_association`, `event_event_association` | VALID | il testo dichiara "non causa" |
| `*_nuclear_exposure` | VALID, alto valore | infrastrutture critiche, distanze verificate |
| `violence_*_exposure` | VALID BUT LOW VALUE | rischio di lettura causale |
| `*_exposure` naturali | VALID BUT LOW VALUE | ancoraggi spesso più vecchi di 1 anno (es. 99/109 incendi–centri abitati) |
| `event_webcams_nearby` | **QUESTIONABLE** | **272/298 (91%)** collegano un'immagine ATTUALE a eventi più vecchi di 1 anno |
| `exposure_context`, `composite_context` | VALID BUT LOW VALUE | contesto generico |

**Altre anomalie:**
- **387 oggetti** risultano `located_in` più di un Paese (sovrapposizione dei poligoni Natural Earth 1:50m).
- **Fatti di fonte da non riscrivere:** per esempio "Tignes Airfield", che OurAirports colloca in Veneto.

**Vicinanza ≠ causalità:** tutte le spiegazioni campionate lo dichiarano. Nessun testo causale trovato.

## 30. DATA GAPS

| Gap | Copertura | Perché | Conseguenza per NEXUM |
|---|---|---|---|
| Affitti e prezzi al m² | 0 | nessuna fonte aperta (Numbeo NC/ND) | non mostrare |
| Tariffe dell'acqua | 0 confrontabili | IBNET non raggiungibile, dati per utility | non mostrare |
| Utenze fuori da UE e USA | 154 Paesi senza | nessuna fonte | "nessun dato" esplicito |
| Prezzo nazionale dei beni essenziali | 3 nazionali, 71 di mercato | WFP solo nei contesti umanitari | etichetta "prezzi di mercato WFP" |
| Reddito disponibile delle famiglie | ~38 (OCSE) | nessuna fonte mondiale | usare il RNL pro capite con nota |
| Salari | 19 Stati senza alcun dato, 75 parziali o vecchi | statistiche nazionali assenti | mostrare l'età del dato |
| Carburanti | 160 senza fonte ACCEPT | fonti nazionali chiuse o non verificate | 33 → max ~106 con permessi |
| Flussi energetici per partner fuori dall'Europa | ~160 | IEA/ENTSO-E con account; Comtrade non verificato | solo saldo netto |
| Geometrie di gasdotti ed elettrodotti | 0 | GEM con modulo personale; OSM share-alike | non mostrare linee |
| Capacità di raffinazione, reattori | 0 aperti | EIA fermo al 2014, PRIS senza bulk | GAP |
| Dissalazione | 0 | DesalData a pagamento | GAP |
| Opinione pubblica fuori dall'Europa | ~155 | Afrobarometer e altri non aperti | regionale |
| Conflitti senza morti, proteste, tempo reale | 0 | solo UCDP compatibile | dichiarare "violenza letale documentata" |
| Webcam | 190 Paesi | chiavi e termini | "nessuna webcam aperta" |
| Alluvioni e frane recenti | EONET fermo al 2018 | la categoria non produce più eventi | STALE: dichiararlo, oppure usare le attivazioni CEMS |
| Debito pubblico | IMF non redistribuibile | termini | solo link |

## 31. LICENSE / REDISTRIBUTION MATRIX

| Fonte | Licenza | Redistribuzione | Chiave/account | Classe |
|---|---|---|---|---|
| World Bank WDI | CC BY 4.0 | sì, con attribuzione | no | ACCEPT (già in uso) |
| UN WPP 2024 | CC BY 3.0 IGO | sì | no | ACCEPT |
| ILOSTAT | CC BY 4.0 (dal 2023-05-03; verificare la pagina) | sì | no | ACCEPT con verifica manuale |
| OECD | CC BY 4.0 (dal 2024-07) | sì | no | ACCEPT |
| Eurostat | riuso con citazione (già in `sources_live/eurostat.reality.toml`) | sì | no | ACCEPT |
| FAOSTAT / AQUASTAT | CC BY 4.0 (dati di terzi esclusi) | sì, controllando ogni serie | no | ACCEPT |
| UN SDG API | dati FAO/JMP: CC BY 4.0 | sì | no | ACCEPT |
| Ember | CC BY 4.0 | sì | no | ACCEPT |
| EIA (INTL, fuel) | Public domain | sì | no (bulk) | ACCEPT |
| UCDP | CC BY 4.0 | sì | no (file; l'API usa un token) | ACCEPT |
| NASA GIBS / EONET | uso libero, attribuzione | sì | no | ACCEPT |
| EUMETView (Core) | CC BY 4.0 | sì | no | ACCEPT |
| WFP HDX | CC BY-IGO | sì | no | ACCEPT |
| SSB Norvegia, dati aperti Argentina | CC BY 4.0 | sì | no | ACCEPT |
| DATA.GOV.HK, TfL, data.gov.sg | licenze aperte esplicite | sì | TfL: registrazione da chiarire | CANDIDATE |
| Global Dam Watch, GeoDAR | CC BY 4.0 | sì | no | CANDIDATE |
| IRENASTAT, JODI, ENTSOG, Comtrade preview | **non verificata** | ? | no | CONDITIONAL |
| FAO FPMA | non specificata | ? | no | CONDITIONAL |
| WB Global Fuel Prices DB | ODbL da confermare, fonti a monte eterogenee | share-alike | no | REFERENCE ONLY |
| GEM | CC BY 4.0, ma modulo con nome ed email; Solar TZ NC | – | dati personali | decisione dell'autore |
| OSM / Open Infrastructure Map | ODbL share-alike | vincolante | no | REFERENCE ONLY |
| IMF (WEO, subsidies) | download automatico in blocco vietato | no | no | REFERENCE ONLY |
| IAEA PRIS, Energy Institute | nessun bulk / termini 403 | no | – | REFERENCE ONLY |
| SkylineWebcams (Parma) | riproduzione vietata | **no** | – | LINK ONLY |
| ACLED, HDX HAPI, ReliefWeb | account/email, niente redistribuzione | no | **sì** | REJECT |
| ENTSO-E, IEA, Korea Opinet, Windy, 511, WSDOT, NSW | token/account | – | **sì** | REJECT |
| Copernicus Data Space, USGS EE | account | – | **sì** | REJECT |
| GTD, GRanD, GDAT, Numbeo, GlobalPetrolPrices, DesalData | NC/ND, a pagamento | **no** | – | REJECT |

## 32. VOLUME / PERFORMANCE ESTIMATE

**Stato attuale:**
- **O7:** `live-139` ha **8.871 file** su 9.000 → **margine 129 file**.
- **O6:** **987.744 B desktop** e 919.123 B telefono su 1.000.000 → **margine ~12 KB**.

**Cosa fa crescere O7:**
- `sdoc`: +1 file ogni 256 entità ricercabili;
- `otiles`: per tipo, livello 5 sopra 20.000 oggetti.

`ent` (4.096) e `refs` (2.048) hanno un numero fisso di file.

| Pacchetto proposto | Dimensione stimata | File (O7) | O6 |
|---|---|---|---|
| Indicatori Paese (WB+ILO+UN WPP, ~40 serie × 193, 2015+) | ~0,3–0,5 MB gz | **+1–3** (un file per dominio) | 0 (caricato all'apertura) |
| Energia (Ember subset + EIA ~25 serie + archi Eurostat) | ~1,2–1,5 MB gz (Ember 240 KB gz) | +2–4 | 0 |
| Acqua (WDI/SDG ~10 serie) | < 100 KB gz | +1 | 0 |
| Carburanti +2 Paesi | trascurabile | 0–1 | 0 |
| UCDP con soglia 1 morto | eventi da ~1.982 a ~13.000 (2026) | **+~45 `sdoc`** + otiles | 0 |
| Poligoni admin-1 per le zone di conflitto | solo i Paesi con eventi, semplificati: ~0,5–1 MB | +1–2 | 0 |
| Impianti come oggetti ricercabili (GEM/Wikidata, ~50.000) | – | **+~195 `sdoc`** → **O7 superato** | 0 |
| Satellite (on-demand) | 0 | 0 | 0 |
| Webcam HK+TfL+SG (~1.900) | – | +~8 `sdoc` | 0 |

**Conclusioni:**
- I pacchetti per dominio (un file globale per dominio, come oggi le osservazioni da 317 KB gz e i mandati da 268 KB gz) sono compatibili con O6 e O7.
- **UCDP a soglia 1 e nuovi oggetti ricercabili non stanno nel margine di 129 file** senza:
  - rendere non ricercabili gli eventi minori; oppure
  - impacchettare `sdoc` in modo più denso; oppure
  - un GO esplicito per alzare O7.

  Nessuna di queste modifiche è proposta senza GO.

## 33. PROPOSED DOMAIN PACKAGES

Ogni pacchetto è un file statico per dominio, caricato solo quando si apre il Paese o la vista: mai all'avvio.

| Pacchetto | Contenuto | Copertura | Fonti |
|---|---|---|---|
| **P-PEOPLE** (popolazione ed economia) | popolazione, urbanizzazione, PIL/RNL pro capite, CPI, PLI, consumi, disoccupazione, commercio | 149–193 | WB WDI, UN WPP |
| **P-WORK** (lavoro e salari) | retribuzione media/mediana (LCU+PPP), salario minimo, con l'anno | 85–166 | ILOSTAT |
| **P-ENERGY** | generazione, domanda, pro capite, mix e capacità per fonte, import netti, gas/petrolio totali, accesso all'elettricità | 184–193 | Ember, EIA INTL, WB |
| **P-ENERGY-EU-FLOWS** | archi bilaterali gas/elettricità/greggio per anno | 23–35 reporter | Eurostat |
| **P-WATER** | accesso, sanificazione, prelievi per uso, risorse, stress con flag "stimato" | 137–192 | WDI, UN SDG |
| **P-PRICES-EU** (regionale) | utenze, casa, accessibilità economica, sempre etichettati "UE/OCSE" | 27–47 | Eurostat, OECD |
| **P-FUEL** (estensione) | +Norvegia, +Argentina | 33 | SSB, AR |
| **P-SECURITY** | zone admin-1 R1/R2/O1/O2 derivate da UCDP, con la catena PERCHÉ | 30–47 Paesi | UCDP |
| **OSSERVA → SATELLITE** | nessun pacchetto dati: solo layer on-demand con l'ora di acquisizione | globale | GIBS, EUMETView |
| **Webcam** (estensione) | HK, TfL, SG dopo la verifica della licenza | +3 Paesi | open data nazionali |

## 34. PROPOSED OBJECT / RELATION / EVENT / OBSERVATION MODEL

Nessun nuovo tipo di base: tutto si mappa sul Core esistente.

**Oggetti:**
- **Country:** esiste già, primo livello.
- **Admin-1 region:** nuovo tipo di oggetto geografico, solo se si attiva P-SECURITY.
- **Impianti:** `power_plant` esiste (GPPD). Le dighe sono un candidato, ma soggette al vincolo O7.

**Osservazioni** (`observation.official_series`, già usato per WDI ed Eurostat): `subject = Country`, `indicator`, `period`, `value`, `unit`, `source`, `nature` (osservato / stimato / modellato), `as_of`.
- `nature` va reso obbligatorio per AQUASTAT, SDG e JMP e per la disoccupazione modellata.

**Relazioni:**
- **Nuova `energy_flow`** (Paese → Paese):
  - campi: `commodity` (gas / elettricità / greggio), `year`, `volume`, `unit`, `source`, `reporter`;
  - è un'osservazione con due soggetti, mai inferita;
  - la direzione riflette il reporter (import dichiarato da Y con origine X).
- **Nuova `located_in` verso admin-1** per gli eventi UCDP (dal campo `adm_1` della fonte).
- **Correzione `located_in` multi-Paese:** la relazione asserita prevale su quella calcolata; dove restano entrambe, dire "al confine tra".

**Eventi:**
- invariati;
- UCDP aggiunge gli attributi `gwnoa`, `gwnob`, `country_id`, `event_clarity`, `date_prec`, `where_prec` e `priogrid_gid` (nessun dato personale).

**Insight / regole:**
- **Nuove:** `security_zone_red` (R1/R2), `security_zone_orange` (O1/O2), con evidenze = eventi e una finestra datata;
- **`event_webcams_nearby`:** limitata agli eventi in corso o degli ultimi N giorni.

**Viste (non dati):** satellite e link webcam (Parma) sono riferimenti esterni con un'etichetta temporale. Non entrano nello snapshot.

## 35. IMPLEMENTATION PRIORITIES (criteri A–I)

Voto da 1 a 3 per criterio:
- A = utilità;
- B = copertura mondiale;
- C = affidabilità;
- D = €0;
- E = licenza;
- F = freschezza;
- G = relazioni NEXUM reali;
- H = prestazioni;
- I = semplicità.

La semplicità (I) non decide mai da sola.

| # | Pacchetto | A | B | C | D | E | F | G | H | I | Totale | Nota |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | **Integrità esistente:** tempeste, `event_webcams_nearby` recenti, etichette UCDP, timestamp Caltrans, `located_in` multi-Paese, alluvioni/frane marcate STALE | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 | **26** | correggere ciò che è già pubblicato viene prima di aggiungere |
| 1 | **P-ENERGY** | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 | **26** | 184–193 Paesi, CC BY / PD, si lega agli impianti esistenti |
| 2 | **P-PEOPLE + P-WORK** | 3 | 3 | 3 | 3 | 3 | 2 | 2 | 3 | 3 | **25** | WDI già attivo; salari con l'età del dato |
| 3 | **OSSERVA → SATELLITE** | 3 | 3 | 2 | 3 | 3 | 3 | 2 | 3 | 2 | **24** | solo CSP + vista; trappole note (immagine vuota, cache) |
| 4 | **P-WATER** | 2 | 3 | 2 | 3 | 3 | 2 | 1 | 3 | 3 | **22** | stime da etichettare |
| 5 | **P-SECURITY** (zone admin-1 UCDP) | 3 | 2 | 2 | 3 | 3 | 2 | 3 | 1 | 1 | **20** | alto valore ma costo O7 (soglia 1 morto) e poligoni admin-1: richiede una decisione O7 |
| 6 | **P-ENERGY-EU-FLOWS** | 3 | 1 | 3 | 3 | 3 | 2 | 3 | 3 | 2 | **23** | solo Europa: sempre etichettato regionale; dopo P-ENERGY |
| 7 | **P-FUEL +2** | 2 | 1 | 3 | 3 | 3 | 3 | 2 | 3 | 3 | **23** | piccolo, ma copertura bassa |
| 8 | **Webcam HK/TfL/SG** | 2 | 1 | 2 | 3 | 2 | 3 | 2 | 2 | 2 | **19** | prima la verifica delle licenze |
| 9 | **P-PRICES-EU** | 2 | 1 | 3 | 3 | 3 | 2 | 1 | 3 | 2 | **20** | regionale; non dichiararlo "costo della vita mondiale" |
| – | Parma: oggetto con solo il link | 1 | 1 | 3 | 3 | 3 | – | 1 | 3 | 3 | – | si può fare insieme al n. 8 |

**Ordine raccomandato (per punteggio): 0 → 1 → 2 → 3 → 6 → 7 → 4 → 5 → 9 → 8.**
- P-SECURITY ha un punteggio più basso non per difficoltà, ma perché richiede prima una tua decisione su O7 e sulla soglia di morti. Il suo valore (A=3, G=3) è alto.
- Un passo per GO.

**Da non fare:**
- costo della vita "mondiale";
- affitti;
- tariffe dell'acqua;
- pane per salario;
- geometrie dei gasdotti;
- conflitti in tempo reale o proteste;
- embed della webcam di Parma;
- impianti come oggetti ricercabili senza una decisione su O7.

## 36. FILES THAT WOULD NEED CHANGES (indicativo, nessuna modifica fatta)

**Connettori e registro:**
- **Nuovi connettori:**
  - `connectors/ember_yearly.py`, `connectors/eia_intl.py`, `connectors/ilostat_earnings.py`, `connectors/eurostat_energy_flows.py`, `connectors/ssb_fuel.py`, `connectors/ar_fuel.py`;
  - più avanti: `connectors/hk_td_cctv.py`, `connectors/tfl_jamcams.py`, `connectors/sg_lta_cameras.py`.
- **Connettori esistenti:**
  - `connectors/worldbank_wdi.py`: nuovi indicatori (popolazione, PLI, acqua, accesso all'elettricità);
  - `connectors/ucdp_candidate.py`: `MIN_DEATHS` e i campi aggiuntivi;
  - `connectors/nasa_eonet.py`: istante delle tempeste;
  - `connectors/caltrans_cctv.py`: timestamp e segnaposto;
  - `connectors/obs_common.py` e `connectors/fuel_common.py`: campo `nature`.
- **Fonti:** `sources_live/*.toml` per ogni nuova fonte (licenza, citazione, UA neutro).
- **Vocabolari:** `vocab_live/observations.toml`, `vocab_live/infrastructure_live.toml` e un nuovo `vocab_live/energy.toml` / `security.toml`.

**Regole:**
- `rules_live/r_event_webcams_nearby.toml`: finestra temporale;
- nuove `rules_live/r_security_zone_*.toml`.

**Core e snapshot:**
- `nexum/core/geo.py` / `nexum/core/correlate.py`: priorità asserita > calcolata per `located_in`, gestione admin-1;
- `nexum/snapshot/build.py`: pacchetti per dominio e controllo O6/O7;
- `nexum/api/server.py` (~riga 783, CSP `img-src` / `connect-src` per GIBS ed EUMETView) e `ui/scripts/assemble-web.mjs` (header web).

**Interfaccia:**
- `ui/src/views/PlaceView.tsx`, `ui/src/views/ObjectMode.tsx`, `ui/src/components/Observations.tsx`, `ui/src/lib/observations.ts`, `ui/src/lib/strings.ts`, `ui/src/lib/types.ts`, `ui/src/store/store.ts`;
- `ui/src/views/MapView.tsx`: solo nuovi layer sopra gli esistenti, **senza toccare** `ui/src/map/illumination.ts`.

**Test e benchmark:**
- `tests/test_api.py`, `tests/test_governance.py`, nuovi test dei connettori;
- `ui/tests/e2e/*.spec.ts`;
- `bench/phase3/` (O6/O7).

**Documentazione:** `NEXUM-SOURCES-LIVE.md` e `README.md`.

**Mai:**
- `ui/src/map/illumination.ts`, `ui/src/lib/sun.ts`, `ui/scripts/night-lights.py`, `ui/tests/unit/sun.test.ts`;
- gli asset `night-lights-2016.webp`.

## 37. REGRESSION RISKS

1. **O7 (margine di 129 file).** È il rischio maggiore: UCDP a soglia 1, gli impianti ricercabili e le webcam aggiungono file `sdoc` e `otiles`. Ogni pacchetto deve misurare O7 prima del deploy.
2. **O6 (margine ~12 KB).** Nessun pacchetto deve caricarsi all'avvio; anche solo nuove stringhe in `strings.ts` consumano margine.
3. **CSP.** Aggiungere host satellitari allarga la superficie. Vanno limitati `img-src` e `connect-src` a host precisi, mai un jolly.
4. **Onestà temporale.**
   - Un'immagine satellitare può essere vuota o in cache e sembrare attuale.
   - Una webcam ferma può sembrare live.
   - UCDP ha un ritardo di 3–7 settimane.

   Serve sempre una data esplicita.
5. **Falsa copertura mondiale.** I pacchetti regionali (UE/OCSE, archi Eurostat, opinione) devono dire "regionale".
6. **Doppia conferma apparente.** Ember ed EIA non sono indipendenti: non mostrarle come conferme reciproche.
7. **Lettura causale.** Le zone di sicurezza e le esposizioni non devono suggerire una previsione. La prossimità da sola non colora nulla.
8. **Confini contesi.** Il calcolo delle zone dipende dai poligoni Natural Earth: serve una nota esplicita.
9. **Licenze CONDITIONAL.** Non vanno ingerite prima della verifica manuale (IRENASTAT, JODI, ENTSOG, Comtrade, FPMA, ILO).
10. **Test esistenti.** L'ultima regressione completa è passata:
    - pytest 106/106;
    - e2e 86 + 36 + 23;
    - unit 48;
    - O6/O8/O9/U* PASS.

    Ogni pacchetto deve rieseguirla.
11. **Luci (vincolo §0).** Nessun nuovo layer va inserito tra `basemap-land` e `nexum-lights`. L'hash dei file congelati va riverificato a ogni passo.

**Verifica di fine audit:** gli hash sha256 dei file luce sono stati confrontati con lo stato precedente all'audit. Esito: vedi il blocco qui sotto.

```
ui/src/map/illumination.ts: OK
ui/src/lib/sun.ts: OK
ui/public/ref/night-lights-2016.webp: OK
ui/web-public/ref/night-lights-2016.webp: OK
ui/scripts/night-lights.py: OK
ui/tests/unit/sun.test.ts: OK
```

---

# APPENDICI — schede di dettaglio degli agenti di scoperta (misure del 2026-10-03)


---

<!-- Appendice A-income-economy-population -->

## Appendice — NEXUM — Audit fonti dati A: REDDITO / POTERE D'ACQUISTO / ECONOMIA / POPOLAZIONE

Data audit: 2026-10-03 · Modalità: sola lettura, nessuna chiave/account, User-Agent neutro `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`.
Universo: **193 Stati membri ONU** (lista ISO3 codificata a mano, verificata: tutti e 193 presenti tra le 217 economie World Bank non aggregate). Dove utile si riporta anche il conteggio su **217 economie WB**.

## Criteri di classificazione (misurati, non stimati)

- Per ogni paese si prende l'**ultimo anno con valore non nullo**.
- **GOOD** = ultimo anno ≥ 2023 (≤ 3 anni) · **PARTIAL** = 2019–2022 · **STALE** = ≤ 2018 · **NO DATA** = nessun valore.
- World Bank: query limitate a `date=2010:2026`, quindi "NO DATA" WB = nessun valore dal 2010 (un valore pre-2010 conterebbe come NO DATA).
- ILO: file completo (tutti gli anni). Per le serie ILO "modelled" e IMF WEO si è **escluso tutto ciò che è > 2025** (proiezioni) — ma i valori 2024–2025 possono essere comunque stime/nowcast, non osservazioni.
- **NOT COMPARABLE**: non quantificabile in modo automatico per paese; dove rilevante è descritto nelle note (valore "—").
- Totale = 193 per ogni riga (GOOD+PARTIAL+STALE+NO DATA = 193).

## Licenze (verificate)

| Fonte | Licenza | Ridistribuzione in snapshot statico pubblico | Evidenza |
|---|---|---|---|
| World Bank WDI | CC BY 4.0 (default per dataset WB) | Sì, con attribuzione e indicazione modifiche | https://datacatalog.worldbank.org/public-licenses — citazione: *"licenses datasets under the Creative Commons Attribution 4.0 International license (CC-BY 4.0) … allows users to copy, modify and distribute data in any format for any purpose, including commercial use"*. Nota: *"Many datasets are available under other licenses. They are labeled accordingly"* → WDI è etichettato CC BY 4.0. |
| ILO ILOSTAT | CC BY 4.0 (dal 3 maggio 2023) | Sì, con credito "ILO" e indicazione modifiche | https://www.ilo.org/resource/news/international-labour-organization-goes-open-access e https://www.ilo.org/rights-and-permissions — *"As of 3 May 2023, databases and datasets together with the accompanying referential metadata are covered by the Creative Commons CC BY 4.0 licence"*. ATTENZIONE: re3data (r3d100013044) riporta ancora CC BY-NC 3.0 IGO (dato obsoleto); la pagina ilostat.ilo.org/about/terms-of-use risponde 403 al fetch automatico → **verificare a mano** prima del rilascio. |
| UN DESA WPP 2024 | CC BY 3.0 IGO | Sì, con attribuzione | Dichiarato nel WPP 2024 (population.un.org/wpp, "made available under a Creative Commons license CC BY 3.0 IGO"); pagina licenza non scaricabile in testo (SPA). |
| IMF (DataMapper/WEO) | Termini propri IMF (non CC), pagina in vigore dall'11-10-2024 | **Condizionata/incerta**: consente download, opere derivate, pubblicazione e distribuzione con attribuzione, ma **vieta il bulk download automatizzato senza permesso esplicito** e chiede permesso per riuso commerciale | https://www.imf.org/en/about/copyright-and-terms (403 al fetch diretto; contenuto da risultati di ricerca — **verificare a mano**). |
| OECD | CC BY 4.0 per contenuti/dati pubblicati dal 1-7-2024 (Open Access Policy) | Sì, con citazione + disclaimer per adattamenti; esclusi materiali di terzi | https://www.oecd.org/en/about/terms-conditions.html (403 al fetch; testo da risultati di ricerca). |
| Eurostat | CC BY 4.0 (Decisione Commissione 2011/833/UE) | Sì | non misurato in questo audit (solo UE/EFTA). |

## 1. REDDITO / SALARI

| DOMAIN | INDICATOR | SOURCE | TOTAL | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY | COST | NOTE QUALITÀ/COMPARABILITÀ | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Reddito | Retribuzione media mensile dipendenti, valuta locale | ILOSTAT `EAR_EMTA_SEX_NB_A` (sex=SEX_T) via https://rplumber.ilo.org/data/indicator/?id=EAR_EMTA_SEX_NB_A&format=.csv | 193 | 87 | 32 | 32 | — | 42 | 2025 | continuo (last.update 02/10/2026) | CC BY 4.0 | Sì | No | €0 | Solo dipendenti (no autonomi/informali). Fonte dell'ultimo dato per 151 paesi ONU: LFS 75, HIES 58, altre indagini famiglie 11, indagini imprese 6, amministrativo 1 → misure eterogenee. 46 paesi hanno serie da tipi di fonte diversi (rotture di serie). | CONDITIONAL |
| Reddito | Retribuzione media mensile, LCU / PPP / USD | ILOSTAT `EAR_EMTA_SEX_CUR_NB_A` (classif1 = CUR_TYPE_LCU / _PPP / _USD) | 193 | LCU 86 · PPP 85 · USD 86 | 53 · 51 · 50 | 33 · 24 · 29 | — | 21 · 33 · 28 | 2025 | continuo (25/09/2026) | CC BY 4.0 | Sì | No | €0 | Variante "con valuta" più ampia (172 paesi ONU in LCU). PPP = $ internazionali (PPP consumi privati). Concetto contabile dichiarato solo per 28/172 paesi ("Gross", nota T10:138); per 144 **lordo/netto non specificato**. 13 paesi hanno ultimo valore PPP ≤ 2015 (es. ARE, JAM, MKD, NIC, YEM). | CONDITIONAL — usare PPP per confronti, mostrare sempre anno + tipo fonte |
| Reddito | Retribuzione **mediana** mensile, valuta locale | ILOSTAT `EAR_EMTM_SEX_NB_A` | 193 | 87 | 32 | 25 | — | 49 | 2025 | continuo | CC BY 4.0 | Sì | No | €0 | Mediana disponibile solo dove ILO ha microdati armonizzati; esiste `EAR_EMTM_SEX_CUR_NB_A` (150 aree, non contata separatamente). Preferibile alla media (meno distorta), ma copertura inferiore. | CONDITIONAL |
| Reddito | Salario minimo legale mensile, LCU / PPP / USD | ILOSTAT `EAR_INEE_NOC_NB_A`; `EAR_INEE_CUR_NB_A` | 193 | LCU 166 · PPP 155 · USD 158 | 2 · 10 · 7 | 1 · 1 · 1 | — | 24 · 27 · 27 | 2026 (moda 2024) | continuo (03/09/2026) | CC BY 4.0 | Sì | No | €0 | NO DATA include paesi **senza minimo legale nazionale** (AUT, DNK, FIN, ITA, NOR, SWE, SGP… minimi per contratto collettivo) → non è "dato mancante" ma "non applicabile". Minimo ≠ salario tipico; può essere settoriale/regionale (valore nazionale scelto da ILO). | ACCEPT (con etichetta "non esiste minimo legale" dove pertinente) |
| Reddito | Reddito nazionale netto rettificato pro capite | WB `NY.ADJ.NNTY.PC.CD` | 193 | 0 | 175 | 5 | — | 13 | 2021 | fermo al 2021 | CC BY 4.0 | Sì | No | €0 | Serie non aggiornata oltre il 2021. Aggregato macro, non reddito familiare. | REFERENCE ONLY |
| Reddito | Indice di Gini (contesto distribuzione) | WB `SI.POV.GINI` | 193 | 61 | 63 | 39 | — | 30 | 2025 (moda 2023) | irregolare (indagini) | CC BY 4.0 | Sì | No | €0 | Mescola indagini su reddito e su consumo (non comparabili tra loro). | REFERENCE ONLY |

**Reddito disponibile delle famiglie (netto, per famiglia o equivalente)**: nessuna fonte mondiale €0 con copertura significativa trovata. Esistono: Eurostat `ilc_di03` (reddito netto equivalente mediano, solo UE/EFTA ~35 paesi) e OECD (reddito disponibile famiglie, ~38 membri) — **non misurati** in questo audit (copertura per costruzione < 20% dei 193). WB PIP (Poverty & Inequality Platform) offre medie di reddito/consumo da indagini, ma per giorno e PPP 2021, con anni sparsi — non misurato.

## 2. POTERE D'ACQUISTO

| DOMAIN | INDICATOR | SOURCE | TOTAL | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY | COST | NOTE | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PPA | Fattore di conversione PPP, consumi privati (LCU per $ int.) | WB `PA.NUS.PRVT.PP` | 193 | 169 | 18 | 2 | — | 4 | 2025 | annuale (WDI 2026-07-13) | CC BY 4.0 | Sì | No | €0 | Benchmark ICP 2021; anni non-benchmark sono estrapolati. Fattore corretto per convertire salari/consumi. | ACCEPT |
| PPA | Fattore PPP, PIL | WB `PA.NUS.PPP` | 193 | 184 | 3 | 3 | — | 3 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Da usare per PIL, non per salari. | ACCEPT |
| PPA | Indice livello dei prezzi, consumi famiglie | WB `PA.NUS.PRVT.PLI` | 193 | 169 | 18 | 2 | — | 4 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Mancano CUB, LIE, MCO, PRK; STALE VEN, YEM. Il vecchio codice `PA.NUS.PPPC.RF` (price level ratio) **è archiviato** (API: "indicator was not found"). | ACCEPT |
| PPA | Indice livello dei prezzi, PIL | WB `PA.NUS.GDP.PLI` | 193 | 184 | 3 | 3 | — | 3 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |
| PPA | Consumi finali famiglie pro capite (US$ costanti 2015) | WB `NE.CON.PRVT.PC.KD` | 193 | 156 | 2 | 6 | — | 29 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Mancano tra gli altri AFG, JAM, JOR, MMR, MWI, NGA, PNG, VEN, TTO e molti micro-Stati. Consumo, non reddito. Include NPISH. | CONDITIONAL |
| PPA | Consumi finali famiglie, PPP (US$ int. correnti) | WB `NE.CON.PRVT.PP.CD` | 193 | 152 | 10 | 6 | — | 25 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Totale nazionale: dividere per `SP.POP.TOTL` per il pro capite. | CONDITIONAL |
| PPA | Inflazione CPI (% annua) | WB `FP.CPI.TOTL.ZG` | 193 | 172 | 6 | 6 | — | 9 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Fonte originaria IMF IFS. Mancano AND, CUB, ERI, LIE, MCO, MHL, PRK, SOM, TKM; STALE COD, NRU, TJK, TUV, VEN, YEM. | ACCEPT |
| PPA | Inflazione CPI (% annua) | IMF DataMapper `PCPIPCH` — https://www.imf.org/external/datamapper/api/v1/PCPIPCH | 193 | 188 | 1 | 1 | — | 3 | 2025 (proiezioni fino 2031) | 2 volte/anno (WEO apr/ott) | Termini IMF | Incerta (vedi licenze) | No | €0 | Valori 2024–25 in parte stime WEO. | REFERENCE ONLY (licenza) |

## 3. ECONOMIA

| DOMAIN | INDICATOR | SOURCE | TOTAL | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY | COST | NOTE | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Economia | PIL (US$ correnti) | WB `NY.GDP.MKTP.CD` | 193 | 187 | 2 | 3 | — | 1 | 2025 | annuale (2026-07-13) | CC BY 4.0 | Sì | No | €0 | Manca PRK; STALE ERI, SSD, YEM. | ACCEPT |
| Economia | Crescita PIL reale % | WB `NY.GDP.MKTP.KD.ZG` | 193 | 187 | 1 | 3 | — | 2 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |
| Economia | PIL pro capite (US$ correnti) | WB `NY.GDP.PCAP.CD` | 193 | 187 | 2 | 3 | — | 1 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | **Non è un salario** (vedi avvertenze). Sensibile al cambio. | ACCEPT |
| Economia | PIL pro capite PPP (US$ int. correnti) | WB `NY.GDP.PCAP.PP.CD` | 193 | 184 | 1 | 4 | — | 4 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Mancano CUB, LIE, MCO, PRK. | ACCEPT |
| Economia | RNL pro capite, metodo Atlas (US$) | WB `NY.GNP.PCAP.CD` | 193 | 185 | 2 | 3 | — | 3 | 2025 | annuale (base classificazione redditi WB, 1° luglio) | CC BY 4.0 | Sì | No | €0 | Mancano LIE, MCO, PRK. | ACCEPT |
| Economia | RNL pro capite PPP | WB `NY.GNP.PCAP.PP.CD` | 193 | 184 | 1 | 4 | — | 4 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |
| Economia | Disoccupazione, stima modellata ILO (15+) | WB `SL.UEM.TOTL.ZS` = ILOSTAT `UNE_2EAP_SEX_AGE_RT_A` (AGE_YTHADULT_YGE15) | 193 | 176 | 2 | 0 | — | 15 | 2025 (ILO fino 2027 proiez.) | annuale (ILO modelled Nov. 2025) | CC BY 4.0 | Sì | No | €0 | Comparabile per costruzione (modello), ma è **stima**, non osservazione. Mancano 15 micro-Stati (AND, ATG, DMA, FSM, GRD, KIR, KNA, LIE, MCO, MHL, NRU, PLW, SMR, SYC, TUV). Conteggi WB e ILO identici. | ACCEPT |
| Economia | Disoccupazione, definizione nazionale | WB `SL.UEM.TOTL.NE.ZS` / ILOSTAT `UNE_DEAP_SEX_AGE_RT_A` | 193 | WB 118 · ILO 123 | 43 · 42 | 23 · 24 | — | 9 · 4 | 2025 | continuo | CC BY 4.0 | Sì | No | €0 | Definizioni/età/fonti nazionali diverse: 131 paesi con tipi di fonte multipli in ILO. | CONDITIONAL (solo trend intra-paese) |
| Economia | Tasso di occupazione (occupati/popolazione 15+), modellato | WB `SL.EMP.TOTL.SP.ZS` = ILOSTAT `EMP_2WAP_SEX_AGE_RT_A` | 193 | 176 | 2 | 0 | — | 15 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Variante nazionale `SL.EMP.TOTL.SP.NE.ZS`: 118/43/21/11. | ACCEPT |
| Economia | Debito amministrazione centrale % PIL | WB `GC.DOD.TOTL.GD.ZS` | 193 | 42 | 18 | 16 | — | 117 | 2024 | annuale | CC BY 4.0 | Sì | No | €0 | **Copertura insufficiente** (mancano DEU, FRA, ITA, CHN, JPN…). | REJECT come fonte primaria |
| Economia | Debito lordo amministrazioni pubbliche % PIL | IMF DataMapper `GGXWDG_NGDP` | 193 | 185 | 1 | 1 | — | 6 | 2025 (proiez. 2031) | 2 volte/anno | Termini IMF | Incerta | No | €0 | Unica fonte con copertura mondiale misurata. Mancano CUB, LBY, MCO, PRK, SOM, YEM. Governo generale ≠ centrale. | CONDITIONAL — solo dopo verifica manuale licenza IMF; in alternativa REFERENCE ONLY (link) |
| Economia | Esportazioni beni e servizi % PIL | WB `NE.EXP.GNFS.ZS` | 193 | 165 | 3 | 5 | — | 20 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Contabilità nazionale (non dogane). | ACCEPT |
| Economia | Importazioni beni e servizi % PIL | WB `NE.IMP.GNFS.ZS` | 193 | 165 | 3 | 5 | — | 20 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |
| Economia | Disoccupazione (IMF) | IMF DataMapper `LUR` | 193 | 105 | 1 | 5 | — | 82 | 2025 | 2 volte/anno | Termini IMF | Incerta | No | €0 | Copertura inferiore a ILO. | REJECT (ILO migliore) |

## 4. POPOLAZIONE

| DOMAIN | INDICATOR | SOURCE | TOTAL | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY | COST | NOTE | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Popolazione | Popolazione totale | WB `SP.POP.TOTL` | 193 | 193 | 0 | 0 | — | 0 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | 217/217 economie WB. Basata su WPP + censimenti nazionali. | ACCEPT |
| Popolazione | Popolazione, indicatori demografici (pop. 1 lug., densità, età mediana, ecc.) | UN WPP 2024 `WPP2024_Demographic_Indicators_Medium.csv.gz` (16,6 MB gz) | 193 | 193 | 0 | 0 | — | 0 | stime fino 2023, proiezioni 2024–2100 | biennale (file del 13-12-2024; WPP 2026 non trovato ai nomi file testati) | CC BY 3.0 IGO | Sì | No | €0 | 237 aree con ISO3, 67 colonne. Valori 2024+ sono **proiezioni** (variante media). | ACCEPT |
| Popolazione | Crescita popolazione % | WB `SP.POP.GROW` | 193 | 193 | 0 | 0 | — | 0 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |
| Popolazione | Densità (ab./km²) | WB `EN.POP.DNST` | 193 | 193 | 0 | 0 | — | 0 | 2023 | annuale | CC BY 4.0 | Sì | No | €0 | Ultimo anno 2023 (in ritardo di 2 anni su pop.). In alternativa calcolare pop/superficie. | ACCEPT |
| Popolazione | Popolazione urbana % | WB `SP.URB.TOTL.IN.ZS` | 193 | 193 | 0 | 0 | — | 0 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Definizioni nazionali di "urbano" diverse (UN WUP) → confronto tra paesi limitato. | ACCEPT (con nota) |
| Popolazione | Popolazione della città più grande | WB `EN.URB.LCTY` | 193 | 149 | 0 | 0 | — | 44 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Solo agglomerati ≥ 300.000 ab. (UN WUP) → mancano 44 Stati piccoli (es. ISL, LUX, MLT, SVN, CYP, BTN…). Nome della città non incluso. Per elenchi città: GeoNames/Natural Earth (fuori scopo). | CONDITIONAL |
| Popolazione | Età 0–14 % | WB `SP.POP.0014.TO.ZS` | 193 | 193 | 0 | 0 | — | 0 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | Derivato da WPP. Classi quinquennali complete: `WPP2024_PopulationByAge5GroupSex_Medium.csv.gz` (29,9 MB gz). | ACCEPT |
| Popolazione | Età 65+ % | WB `SP.POP.65UP.TO.ZS` | 193 | 193 | 0 | 0 | — | 0 | 2025 | annuale | CC BY 4.0 | Sì | No | €0 | | ACCEPT |

## Lacune reali di dati (DATA GAPS)

- **Nessun dato ILO di retribuzione (né media, né mediana, in nessuna valuta, in nessun anno): 19 Stati ONU** — Algeria (DZA), Corea del Nord (PRK), Dominica (DMA), Eritrea (ERI), Gabon (GAB), Grenada (GRD), Haiti (HTI), Iran (IRN), Iraq (IRQ), Libia (LBY), Marocco (MAR), Micronesia (FSM), Monaco (MCO), Oman (OMN), Rep. Centrafricana (CAF), Saint Kitts e Nevis (KNA), Saint Vincent e Grenadine (VCT), Sud Sudan (SSD), Tuvalu (TUV).
- Inoltre solo dati vecchi (PPP ≤ 2015) per 13 paesi: ARE, BRN, CMR, COG, CPV, JAM, MDG, MKD, MWI, NIC, SLB, VUT, YEM.
- Salario minimo assente per 24 Stati: in parte **per assenza di minimo legale** (AUT, DNK, FIN, ITA, NOR, SWE, SGP, ARE, BRN…), in parte per mancanza dati (ERI, PRK, SOM, SSD, YEM, ZWE…).
- Retribuzione media **GOOD (≤3 anni) solo per ~85–87 Stati su 193 (≈45%)**: una mappa mondiale dei salari "attuali" non è ottenibile senza mescolare anni.
- Reddito disponibile delle famiglie: **nessuna fonte mondiale aperta** — solo UE/OCSE.
- Debito pubblico: WDI copre 42 Stati GOOD; solo IMF arriva a ~185 ma con licenza da chiarire.
- Buchi trasversali ricorrenti: PRK, MCO, LIE, CUB, ERI, SSD, YEM, VEN, SOM, micro-Stati del Pacifico/Caraibi.

## Avvertenze metodologiche

1. **PIL pro capite / RNL pro capite NON sono salari**: includono profitti, rendite, ammortamenti, imposte e la popolazione non occupata (bambini, anziani). Nella UI non devono mai essere etichettati "reddito medio" o "stipendio". Il salario medio ILO tipicamente è molto diverso (e copre solo i dipendenti).
2. **Lordo vs netto**: ILO dichiara "Gross" solo per 28/172 serie; le indagini sulle famiglie (LFS/HIES, fonte dell'ultimo dato per 133/151 paesi) rilevano spesso il guadagno riferito dal rispondente, sovente **netto**. Le serie amministrative/imprese sono di solito **lorde**. Non confrontare paesi come se fossero omogenei.
3. **Mensile vs annuale vs orario**: ILO EMTA = mensile; esistono serie orarie (`EAR_EHRA`, ~107–147 aree). OECD "average annual wages" è annuale e per FTE (solo ~38 paesi, non misurato).
4. **Individuale vs famiglia**: ILO = per dipendente individuale; Eurostat/OECD reddito disponibile = per famiglia equivalente; WB consumi = per abitante (aggregato contabile, include NPISH).
5. **Media vs mediana**: la media è gonfiata dagli alti redditi; preferire `EAR_EMTM` dove esiste.
6. **PPP**: per salari usare il fattore **consumi privati** (`PA.NUS.PRVT.PP`), non quello del PIL. Gli anni tra benchmark ICP (2017, 2021) sono estrapolati.
7. **Stime vs osservazioni**: ILO "modelled", IMF WEO e WPP 2024+ sono modelli/proiezioni; mostrarli come tali (flag "stima").
8. **Rotture di serie**: in ILO molti paesi hanno più fonti (46 per EMTA LCU, 131 per disoccupazione nazionale) → trend intra-paese solo su stessa fonte (`source`).
9. WB `PA.NUS.PPPC.RF` (price level ratio) è archiviato: usare `PA.NUS.PRVT.PLI` / `PA.NUS.GDP.PLI`.
10. IMF: il divieto di download massivo automatizzato rende **non conforme** un connettore NEXUM che scarichi periodicamente tutto il DataMapper senza permesso. Preferire WDI (che ripubblica CPI IMF IFS sotto CC BY 4.0).

## Volumi, forma API, aggiornamento

- **WB API v2** (JSON, no key): `https://api.worldbank.org/v2/country/all/indicator/{CODE}?format=json&date=2010:2026&per_page=20000` → ~2.300–4.200 osservazioni non nulle per indicatore (incl. aggregati esclusi); 30 indicatori × 217 × 16 anni ≈ 100k valori, qualche MB di JSON. Ultimo aggiornamento WDI misurato: `lastupdated 2026-07-13`. API lenta: una richiesta è andata in timeout a 120 s (usare timeout ≥ 300 s e retry).
- **ILOSTAT rplumber** (CSV, no key): `https://rplumber.ilo.org/data/indicator/?id={ID}&format=.csv`. Dimensioni misurate (file completi, tutti gli anni): EMTA_NB 0,43 MB; EMTA_CUR 2,7 MB; EMTM_NB 0,41 MB; INEE_NOC 0,28 MB; INEE_CUR 1,0 MB; UNE_2EAP 7,6 MB; EMP_2WAP 7,5 MB; UNE_DEAP 30,6 MB. Catalogo: `https://rplumber.ilo.org/metadata/toc/indicator/?lang=en&format=.csv` (0,74 MB). Il vecchio bulk `webapps.ilo.org/ilostat-files/WEB_bulk_download/...` risponde **404**; gli ID senza disaggregazione (es. `EAR_4MTH_SEX_CUR_NB_A`) sono **deprecati** (errore 400).
- **UN WPP 2024** CSV gz: Demographic Indicators 16,6 MB; Population by 5-year age/sex 29,9 MB. Nessuna API senza token necessaria (l'API Data Portal non è stata usata).
- **IMF DataMapper** JSON: `https://www.imf.org/external/datamapper/api/v1/{IND}` → 58–176 KB per indicatore, ~226–229 aree.

## Comandi per la riproducibilità

```bash
UA="NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)"
## Appendice — Elenco economie WB (217 non aggregate)
curl -s -A "$UA" "https://api.worldbank.org/v2/country?format=json&per_page=400"
## Appendice — Ogni indicatore WB (ripetuto per ciascun codice nelle tabelle)
curl -s -A "$UA" "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?format=json&date=2010:2026&per_page=20000"
## Appendice — Elenco indicatori WDI (ricerca codici PLI)
curl -s -A "$UA" "https://api.worldbank.org/v2/source/2/indicator?format=json&per_page=3000"
## Appendice — ILOSTAT
curl -s -A "$UA" "https://rplumber.ilo.org/metadata/toc/indicator/?lang=en&format=.csv"
for id in EAR_EMTA_SEX_NB_A EAR_EMTA_SEX_CUR_NB_A EAR_EMTM_SEX_NB_A EAR_INEE_NOC_NB_A EAR_INEE_CUR_NB_A \
          UNE_2EAP_SEX_AGE_RT_A UNE_DEAP_SEX_AGE_RT_A EMP_2WAP_SEX_AGE_RT_A; do
  curl -s -A "$UA" "https://rplumber.ilo.org/data/indicator/?id=$id&format=.csv" -o ilo_$id.csv; done
curl -s -A "$UA" "https://rplumber.ilo.org/metadata/dic/?var=source&lang=en&format=.csv"
curl -s -A "$UA" "https://rplumber.ilo.org/metadata/dic/?var=note_indicator&lang=en&format=.csv"
## Appendice — IMF DataMapper
for i in GGXWDG_NGDP NGDPDPC PCPIPCH LUR; do curl -s -A "$UA" "https://www.imf.org/external/datamapper/api/v1/$i"; done
## Appendice — UN WPP 2024
curl -s -A "$UA" "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz"
curl -sI -A "$UA" "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz"
```

Logica di conteggio (Python): per ogni file/risposta si scartano valori nulli, si filtra `sex=SEX_T` (ILO) e `classif1` pertinente (`CUR_TYPE_LCU|PPP|USD`, `AGE_YTHADULT_YGE15`), si calcola `max(anno)` per ISO3, si interseca con la lista dei 193 ISO3 ONU e si classifica con le soglie sopra. Gli script usati sono nella scratchpad di sessione (`wi/a/un.py, wb*.py, ilo.py`), non nel repository.

## Non misurato

- OECD (salari medi annuali `AV_AN_WAGE`, reddito disponibile famiglie): non interrogato via SDMX in questo audit; copertura strutturale ≈ 38 membri OCSE.
- Eurostat (`earn_ses_*`, `ilc_di03`, `prc_ppp_ind`): non interrogato; copertura UE/EFTA/candidati.
- UNData/UNSD National Accounts (AMA): non interrogato.
- WB PIP (reddito/consumo medio da indagini): non interrogato.
- Testo integrale delle pagine licenza ILO, IMF, OECD: 403 al fetch automatico; citazioni ricavate da pagine ILO di annuncio/risultati di ricerca → **verifica manuale richiesta** prima di pubblicare.

---

<!-- Appendice B-prices-housing-utilities -->

## Appendice — NEXUM — Audit fonti B: costo della vita, prezzi beni essenziali, casa, utenze domestiche, affordability

Data audit: 2026-10-03. Modalità: sola lettura, nessun account, nessuna chiave, nessun servizio a pagamento.
User-Agent usato per tutte le richieste: `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`.
Universo: 193 Stati membri ONU (lista ISO3 fissa; esclusi PSE, XK/Kosovo, territori). Eurostat `EL`→GRC.

Legenda colonne di copertura (paesi ONU):
- **GOOD** = dato disponibile, ultimo periodo ≤ ~4 mesi fa (mensili) o ultimo periodo di rilascio regolare (semestrali/annuali);
- **PARTIAL** = dato presente ma in ritardo di un ciclo, o solo sub-nazionale/mercato;
- **STALE** = ultimo dato più vecchio di 2 cicli;
- **NOT COMPARABLE** = dato presente ma non confrontabile tra paesi senza normalizzazione non garantita;
- **NO DATA** = 193 − paesi con dati.
"non misurato" = non ho potuto scaricare/contare.

---

## 1. Prezzi beni essenziali (staple) e indici prezzi

| DOMINIO | INDICATORE | FONTE (id + URL) | TOT (193) | GOOD | PARTIAL | STALE | NOT COMPARABLE | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | KEY/ACCOUNT | COSTO | QUALITÀ/COMPARABILITÀ | RACCOMANDAZIONE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Staple | Prezzi retail per mercato (pane, riso, farina, olio, latte, uova, carburante, salari giornalieri) | WFP VAM via HDX `global-wfp-food-prices` (file annuali `wfp_food_prices_global_YYYY.csv`) https://data.humdata.org/dataset/global-wfp-food-prices | 71 (retail 2025–26) | 59 (≥2026-06) | 10 (2025-07…2026-05) | 2 | 71 (tutti: unità eterogenee, livello mercato) | 122 | 2026-09-15 | mensile (HDX: 30 gg) | CC BY-IGO | Sì, con attribuzione | No | 0 € | Livello mercato (mediana 25 mercati/paese, min 1, max 454); media nazionale solo in 3 paesi; prezzi `actual` vs `aggregate` da distinguere; valuta locale + `usdprice` | **ACCEPT** (come prezzi di mercato, mai come "prezzo nazionale") |
| Staple | Prezzi retail/wholesale domestici | FAO GIEWS FPMA, API `https://fpma.fao.org/giews/v4/price_module/api/v1/FpmaSerieDomestic/` (4 844 serie) | 136 (retail+wholesale) | 127 | 9 | 1 | 136 (unità e tipi mercato eterogenei) | 57 | 2026-09 (settimanale AFG 2026-09-25) | mensile/settimanale | Catalogo FAO: "License not specified" (https://data.apps.fao.org/catalog/dataset/domestic-market-prices-fpma); termini DB FAO: CC BY 4.0 **ma** "may include data provided by third parties which may not be redistributed … without the consent of the original data provider" | Solo per serie di fonte libera (WFP, FEWS NET, Eurostat/DG AGRI); 1 264/4 817 serie ONU sono WFP | No (API non documentata) | 0 € | Fonti miste (WFP, FEWS NET, ministeri, INS); tipo mercato eterogeneo ("Retail", capitale, media regionale…) | **CONDITIONAL** (filtrare per `source_name`; resto REFERENCE ONLY) |
| Staple | CPI generale / alimentare (2015=100), inflazione alimentare | FAOSTAT `ConsumerPriceIndices` bulk https://bulks-faostat.fao.org/production/ConsumerPriceIndices_E_All_Data_(Normalized).zip | 184 (generale), 183 (food) | 178 | 2 (generale) / 1 (food) | 4 | 0 (indice, non livello) | 9 / 10 | 2026-03 | mensile (rilascio con ~6 mesi di ritardo) | CC BY 4.0 (https://www.fao.org/contact-us/terms/db-terms-of-use/en/) con eccezione terze parti | Sì, con citazione FAO | No | 0 € | Indice: misura variazione, NON livello di prezzo; mancano CUB, ERI, LIE, MCO, MHL, NRU, PRK, TKM, TUV (+GUY per food) | **ACCEPT** (solo variazioni) |
| Staple | HICP per voce ECOICOP 2 (incl. pane/cereali CP01111) | Eurostat `prc_hicp_minr` https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr | 36 (totale), 35 (CP01111) | 36 | 0 | 0 | 0 | 157 | 2026-09 (21 paesi flash), 2026-08 (15) | mensile | Eurostat: riuso autorizzato con citazione fonte (Decisione 2011/833/UE, CC BY 4.0) | Sì | No | 0 € | Indice. **Attenzione**: `prc_hicp_manr`/`midx` (ECOICOP 1) sono congelati a 2025-12 → usare `minr` (NEXUM già lo fa in `connectors/eurostat_reality.py`) | **ACCEPT** (solo variazioni) |
| Staple | Price Level Index (World=100) per categoria ICP ("Bread and cereals", "Milk, cheese and eggs", "Oils and fats", "Actual housing, water, electricity, gas") | World Bank ICP 2021, API source 90 https://api.worldbank.org/v2/sources/90/series | 163 | 0 | 0 | 163 (anno unico 2021) | 0 | 30 | 2021 (pubbl. 2024-08) | ciclico (ICP 2017, 2021; prossimo non misurato) | CC BY 4.0 (WB Data Catalog) | Sì | No | 0 € | **Non sono prezzi unitari**: sono indici di livello prezzi per aggregato; via API solo 48 serie (categorie/classi), non le ~155 basic heading | **REFERENCE ONLY** |
| Staple | Costo dieta sana/energetica (LCU, PPP), % che non può permettersela | World Bank "Food Prices for Nutrition", API source 88 | 165 (CoHD_LCU), 145 (headcount) | 165 | 0 | 0 | 0 | 28 | etichetta 2025 | annuale | CC BY 4.0 (politica WB; scheda specifica non verificata) | Sì (da confermare) | No | 0 € | Basato su prezzi ICP 2021 aggiornati con CPI: stima modellata, non osservazione | **CONDITIONAL** (etichettare come stima) |
| Costo vita | Indici costo vita / prezzi città | Numbeo https://www.numbeo.com/common/terms_of_use.jsp | non misurato (scraping vietato) | – | – | – | – | – | – | crowdsourced | Proprietaria: "does not permit the republication or dissemination of Numbeo data through other APIs or public-facing data feeds without prior consent"; "Automated data collection methods (such as scraping or crawling) are strictly prohibited" | **No** | licenza commerciale | a pagamento | Crowdsourcing, campioni piccoli, livello città | **REJECT** |
| Costo vita | Indici costo vita città | Expatistan https://www.expatistan.com/tos | non misurato (pagina ToS risponde 403 al fetch) | – | – | – | – | – | – | crowdsourced | Nessuna licenza aperta individuata | Non dimostrata → No | – | servizi a pagamento (USD 50 salary calc.) | Crowdsourcing | **REJECT** |

## 2. Casa (housing)

| DOMINIO | INDICATORE | FONTE | TOT (193) | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | KEY | COSTO | QUALITÀ/COMPARABILITÀ | RACCOM. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Casa | Tasso di sovraccarico costo abitativo (% pop. con costi casa >40% reddito disponibile) | Eurostat `ilc_lvho07a` (EU-SILC) | 34 | 30 (2025) | 3 (2024) | 1 (2023; tra ALB, CHE, MNE, MKD) | 0 | 159 | 2025 | annuale | CC BY 4.0 (Eurostat) | Sì | No | 0 € | Definizione armonizzata EU-SILC; costi al netto dei sussidi casa | **ACCEPT** |
| Casa | Quota dei costi abitativi sul reddito disponibile (%) | Eurostat `ilc_mded01` | 34 | 30 | 3 | 1 | 0 | 159 | 2025 | annuale | CC BY 4.0 | Sì | No | 0 € | Calcolata a livello famiglia (micro), quindi corretta: è il "% income for housing" | **ACCEPT** |
| Casa | Indice prezzi abitazioni (2015=100) | Eurostat `prc_hpi_q` / `prc_hpi_a` | 28 (q) / 29 (a) | 28 (2026-Q2) | 1 (TUR 2024, annuale) | 0 | 0 | 164 | 2026-Q2 | trimestrale | CC BY 4.0 | Sì | No | 0 € | Indice, non €/m² | **ACCEPT** (variazioni) |
| Casa | HPI nominale, reale, price-to-income, price-to-rent, indice affitti | OECD `DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES` https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,1.0/all | HPI 47; HPI_YDH 37; HPI_RPI 40; RPI 41 | HPI 43; YDH 32; RPI 30 | HPI 3; YDH 4; RPI 10 | 1 ciascuno | 0 | 146 (HPI) | 2026-Q2 (RPI 2026-Q3) | trimestrale | CC BY 4.0 (default OECD dal 1-7-2024, https://www.oecd.org/en/about/terms-conditions.html) | Sì | No | 0 € | Indici 2015=100: price-to-income è un **indice di rapporto**, non il rapporto in anni di reddito | **ACCEPT** (variazioni) |
| Casa | Affordable Housing Database (HM/HC: costi casa su reddito, affitti) | OECD AHD https://www.oecd.org/en/data/datasets/oecd-affordable-housing-database.html | non misurato (xlsx per indicatore) | – | – | – | – | – | – | irregolare | CC BY 4.0 (default OECD) | Sì | No | 0 € | ~OCSE+UE, anni eterogenei per paese | **REFERENCE ONLY** fino a misura |
| Casa | Indicatori urbani (slum, accesso casa adeguata SDG 11.1.1) | UN-Habitat Urban Indicators | non misurato | – | – | – | – | – | – | – | non verificata | – | – | – | Non contiene affitti né prezzi | **REFERENCE ONLY** |
| Casa | Affitto €/m², prezzo €/m², capitale vs nazionale | Nessuna fonte aperta globale trovata (solo Numbeo/portali immobiliari, proprietari) | 0 aperte | 0 | 0 | 0 | 0 | 193 | – | – | – | – | – | – | Gap strutturale | **GAP** |

## 3. Utenze domestiche

| DOMINIO | INDICATORE | FONTE | TOT (193) | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | KEY | COSTO | QUALITÀ/COMPARABILITÀ | RACCOM. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Utenze | Prezzo elettricità famiglie €/kWh, banda DC 2 500–4 999 kWh, I_TAX/X_VAT/X_TAX | Eurostat `nrg_pc_204` | 38 | 37 (2025-S2) | 1 (ISL 2025-S1) | 0 | 0 | 155 | 2025-S2 | semestrale | CC BY 4.0 | Sì | No | 0 € | Armonizzato (Reg. UE 2016/1952); separa tasse/IVA | **ACCEPT** |
| Utenze | Componenti prezzo elettricità famiglie (energia, rete, tasse, IVA, **allowance = sussidi**) | Eurostat `nrg_pc_204_c` | 38 | 37 (2025) | 1 (ISL 2024) | 0 | 0 | 155 | 2025 | annuale | CC BY 4.0 | Sì | No | 0 € | Permette tariffa vs tasse vs oneri vs sussidi (TAX_*_ALLOW, ALLOW_OTH) | **ACCEPT** |
| Utenze | Prezzo gas famiglie €/kWh, banda D2 20–199 GJ | Eurostat `nrg_pc_202` | 31 | 30 (2025-S2) | 0 | 1 (POL 2023-S2) | 0 | 162 | 2025-S2 | semestrale | CC BY 4.0 | Sì | No | 0 € | Paesi senza rete gas/mercato non coperti | **ACCEPT** |
| Utenze | Prezzo medio elettricità residenziale (¢/kWh) per Stato USA | EIA Electric Power Monthly Tab. 5.6.A https://www.eia.gov/electricity/monthly/xls/table_5_06_a.xlsx | 1 (USA) | 1 | 0 | 0 | 0 | 192 | 2026-07 | mensile | Pubblico dominio (governo USA) | Sì | No (xlsx senza chiave; API v2 richiede key) | 0 € | Prezzo medio = ricavi/vendite (include tasse/oneri statali, non solo tariffa) — colonna "Residential" separata da "Industrial" | **ACCEPT** |
| Utenze | Prezzo elettricità famiglie, ~140 paesi | GlobalPetrolPrices https://www.globalpetrolprices.com/terms_conditions.php | (dichiarati 140) non misurato | – | – | – | – | – | – | trimestrale | CC BY-NC-ND 3.0; "No third-party provider is authorized to distribute or sell our data without explicit consent"; download 20 USD/paese/trimestre | **No** (NC-ND) | account/acquisto | a pagamento | Commerciale, metodologia proprietaria | **REJECT** |
| Utenze | Prezzo acqua/gas/elettricità famiglie Regno Unito | DESNZ Quarterly Energy Prices | non misurato | – | – | – | – | – | – | trimestrale | OGL v3 (da verificare) | probabile | No | 0 € | Copre GBR, assente da Eurostat | **CONDITIONAL** (da misurare) |
| Utenze | Tariffe acqua | IBNET (World Bank) / regolatori nazionali | non misurato | – | – | – | – | – | – | – | – | – | – | – | Nessuna fonte globale armonizzata verificata | **GAP** |
| Utenze | "Water (drinking)", "Fuel (gas)", charcoal, firewood | WFP (sopra) | non misurato per paese | – | – | – | – | – | 2026-09 | mensile | CC BY-IGO | Sì | No | 0 € | Acqua in bottiglia/venditore, bombola gas: **non** tariffe di rete | **CONDITIONAL** (mai come "tariffa") |

## 4. Denominatori: salari e redditi (per affordability)

| DOMINIO | INDICATORE | FONTE | TOT (193) | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | KEY | COSTO | QUALITÀ | RACCOM. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Salari | Guadagno medio mensile dipendenti (valuta locale) | ILOSTAT `EAR_EMTA_SEX_NB_A` (rplumber) | 133 (dal 2015) | 77 (≥2024) | 23 (2022–23) | 33 (<2022) | multi-fonte (LFS `BA`, `BB`, amministrativa `BX`) | 60 | 2025 | annuale | CC BY 4.0 (ILOSTAT) | Sì | No | 0 € | Lordo vs netto e copertura (formale/totale) variano per fonte; scegliere 1 serie/paese | **CONDITIONAL** |
| Salari | Salario minimo mensile | ILOSTAT `EAR_INEE_NOC_NB_A` | 168 | 165 (≥2024) | 3 | 0 | 0 | 25 | 2026 | annuale | CC BY 4.0 | Sì | No | 0 € | Legale, non salario medio; può non applicarsi a tutti | **ACCEPT** (etichettato "minimo") |
| Salari | Guadagno netto annuo, singolo al 100% del salario medio | Eurostat `earn_nt_net` (ecase P1_NCH_AW100, NET, EUR) | 33 (UE + EFTA + JPN, USA, TUR…) | 27 (2025) | 6 (2023) | 0 | 0 | 160 | 2025 | annuale | CC BY 4.0 | Sì | No | 0 € | Modello fiscale OCSE/UE armonizzato, netto | **ACCEPT** |
| Salari | Salario giornaliero lavoro non qualificato/casual, per mercato | WFP (sopra) | 11 | 11 | 0 | 0 | 0 | 182 | 2026-09 | mensile | CC BY-IGO | Sì | No | 0 € | Stesso mercato e data dei prezzi: confronto locale valido | **ACCEPT** (solo rapporti locali) |

---

## 5. Gap reali di dati

**Prezzi elettricità domestica** (fonti accettabili: Eurostat 38 + EIA USA = 39/193). Mancano, per regione ONU (mancanti/totale):
Africa sub-sahariana 48/48, America Latina e Caraibi 33/33, Nord Africa 6/6, Asia meridionale 9/9, Asia orientale 5/5, Sud-Est asiatico 11/11, Asia centrale 5/5, Oceania 14/14, Asia occidentale 14/17, Nord America 1/2 (CAN), Europa 8/43 (AND, BLR, CHE, GBR, MCO, RUS, SMR, UKR).
→ Fuori da UE/Balcani/USA **non esiste** una fonte aperta, ridistribuibile e armonizzata di prezzi elettricità/gas domestici; l'unica copertura ampia (GlobalPetrolPrices) è NC-ND e a pagamento. Tariffe acqua: nessuna fonte globale verificata (gap totale).

**Prezzi staple (qualunque prezzo retail, WFP 2025–26 ∪ FPMA corrente)**: 103/193 coperti. Mancanti per regione: Europa 37/43, Oceania 12/14, America Latina 16/33, Asia occidentale 6/17, Sud-Est asiatico 5/11, Africa sub-sahariana 8/48, Asia orientale 2/5, Asia meridionale 2/9, Nord Africa 1/6, Nord America 1/2, Asia centrale 0/5.
→ Paradosso strutturale: prezzi unitari (€/kg) ci sono quasi solo nei paesi a rischio alimentare (WFP/FEWS NET); per Europa/OCSE esistono solo **indici** (HICP/CPI), non prezzi al kg pubblicati in modo aperto e armonizzato.

**Casa**: prezzi/affitti per m² assenti da fonti aperte per tutti i 193; indicatori di onere abitativo solo per 34 paesi europei (EU-SILC); indici OCSE per 47.

Staple per prodotto (paesi ONU, retail correnti):
- WFP 2025–26: riso 66, olio 63, uova 43, farina di frumento 39, latte 33, pane 24.
- FPMA (≥2025-10): riso 80, farina 64, olio 51, pane 37, latte 29, uova 27.
- Unità pane WFP 2026: KG 1 488 righe, "1.1 KG" 1 041, "Unit" 300, "8 pcs" 143, "150 G" 135, "Loaf" 80, "800 G" 64… → per "pezzo"/"loaf" la conversione in kg **non è possibile** senza peso dichiarato. FPMA pane: "1 unit" 31 serie, Kg 15, 500 g 2, 240/400/720 g, "Libra".

## 6. AFFORDABILITY: cosa è calcolabile correttamente e dove

Condizioni minime di validità per ogni rapporto prezzo/reddito:
1. stesso periodo (prezzo medio sull'anno/mese di riferimento del salario, non spot vs annuale);
2. stessa geografia (nazionale/nazionale, oppure mercato/mercato) — mai prezzo della capitale su salario nazionale senza dichiararlo;
3. definizione del salario dichiarata (lordo/netto, medio/mediano/minimo, mensile/giornaliero, formale/totale);
4. stessa valuta e unità fisica certa (kg o litro, non "pezzo");
5. nessun incrocio tra fonti con revisioni non sincronizzate senza versione/hash registrato.

| Rapporto derivato | Combinazione valida | Paesi validi (strict) | Paesi condizionali | Note |
|---|---|---|---|---|
| Litri di benzina per salario medio mensile | Weekly Oil Bulletin (EU27, media annua 2025 dai settimanali, IVA inclusa) ÷ Eurostat `earn_nt_net` 2025 netto/12 | **27** | +3 (USA via EIA, GBR via DESNZ, CAN via StatCan con ILO `EAR_EMTA` ≥2025 → 30/31); MYS: ILO ≥2025 presente ma fonte e definizione da verificare | Dichiarare "salario netto, single 100% AW". Con ILO (lordo) non mischiare con Eurostat (netto) nella stessa classifica |
| Litri di benzina per salario (paesi WFP) | WFP benzina prezzo di mercato ÷ ILO salario nazionale | **0** | 3 (GTM, PAK, TUR) incrociati ma geografia incompatibile | NON valido come nazionale |
| Litri di benzina per giornata di lavoro casual | WFP benzina ÷ WFP salario giornaliero, stesso mercato e data | **7** (ETH, IRQ, LBR, PAK, SSD, TJK, YEM) | – | Valido solo come indicatore locale per mercato |
| Kg di pane per salario | Europa: nessun prezzo unitario aperto (HICP è indice) | **0** | – | Non calcolabile in UE/OCSE |
| Kg di pane per giornata di lavoro casual | WFP pane (solo unità KG) ÷ WFP salario stesso mercato/data | **4** (AFG, IRQ, SYR, TJK) | – | Escludere righe "Unit"/"Loaf"/"pcs" |
| Kg di farina/riso per giornata di lavoro casual | WFP stesso mercato/data | **11** (AFG, CMR, ETH, IRQ, LBR, MLI, PAK, SSD, SYR, TJK, YEM) | – | Indicatore di potere d'acquisto locale migliore disponibile |
| Kg di pane per salario medio nazionale | FPMA pane media nazionale ÷ ILO salario ≥2024 | **0** (5 paesi FPMA con media nazionale: GIN, KGZ, SYR, TJK, TKM — nessuno con salario ILO ≥2024) | 9 (FPMA pane qualunque mercato × ILO ≥2024) ma geografia mercato/capitale vs nazionale | NON pubblicare come nazionale |
| % del reddito speso per la casa | Usare direttamente Eurostat `ilc_mded01` (rapporto calcolato su microdati) e `ilc_lvho07a` | **34** | OCSE `HPI_YDH`: 37 paesi ma solo indice di variazione | **Non derivare** affitto/salario: nessuna fonte aperta di affitti in livelli → 0 paesi derivabili |
| Bolletta elettrica annua / salario | Eurostat `nrg_pc_204` (banda DC, I_TAX) × consumo tipo (es. 3 500 kWh) ÷ `earn_nt_net` | **27** (intersezione 2025) | – | Ipotesi di consumo esplicita; nessun altro paese possibile |

## 7. Avvertenze metodologiche

- **ICP ≠ prezzi**: i PLI ICP 2021 sono livelli relativi per aggregato (World=100), anno unico 2021; non danno €/kg di pane. Non estrapolare all'oggi senza dichiararlo.
- **Indici ≠ livelli**: HICP/FAOSTAT CPI/HPI/OCSE sono base 2015=100: confrontare solo variazioni, mai livelli tra paesi.
- **Industriale ≠ domestico**: in EIA usare solo la colonna "Residential"; in Eurostat solo `nrg_pc_204`/`202` (domestici), mai `nrg_pc_205`/`203` (non domestici). GPP pubblica anche mappa "industry": scartata comunque.
- **Tariffa vs tasse vs sussidi**: `nrg_pc_204` dà I_TAX/X_VAT/X_TAX; le compensazioni (allowance, es. sussidi crisi energetica) sono solo in `nrg_pc_204_c`, annuale e con valori negativi: non sommare con i semestrali.
- **Bande di consumo**: il prezzo €/kWh dipende dalla banda (DA…DE); fissare DC (elettricità) e D2 (gas) e dichiararlo.
- **WFP**: `priceflag` `aggregate` (83 312 righe nel 2026) è una media calcolata da WFP, `actual` è osservazione; separare. Valute miste nello stesso paese (es. ZWE: USD e ZWL). Mercati: 7 paesi con un solo mercato (DOM, EGY, GTM, IRN, NIC, SLV, TUR) — non rappresentativi del paese.
- **FPMA**: è un aggregatore; 1 264 serie su 4 817 vengono da WFP (già coperte a CC BY-IGO); le altre sono di fonti nazionali/FEWS NET/DG AGRI con licenze proprie. API non documentata ufficialmente: possibile cambio senza preavviso.
- **ILO salari**: più fonti per lo stesso paese (LFS vs amministrativa) con livelli diversi; scegliere una serie e registrare `source`. 33 paesi hanno ultimo dato <2022: non usarli con prezzi 2026.
- **Eurostat HICP**: dal 2026 serie ECOICOP 2 (`prc_hicp_minr`, dimensione `coicop18`); le serie storiche `prc_hicp_manr`/`midx` sono ferme a 2025-12.
- **Kosovo (XK)** presente in Eurostat ma non ONU: escluso dal denominatore 193.
- **Numbeo/Expatistan/GPP**: non solo licenze incompatibili; Numbeo vieta esplicitamente lo scraping. Nessuna loro cifra va in snapshot pubblico.

## 8. Comandi e URL riproducibili

```bash
UA="NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)"
## Appendice — WFP (HDX CKAN)
curl -s -A "$UA" "https://data.humdata.org/api/3/action/package_search?q=wfp+food+prices&fq=organization:wfp&rows=500&fl=name,license_id"
curl -s -A "$UA" "https://data.humdata.org/api/3/action/package_show?id=global-wfp-food-prices"
curl -sL -A "$UA" -O "https://data.humdata.org/dataset/31579af5-3895-4002-9ee3-c50857480785/resource/502190c6-0d3d-4b84-977e-ef062f053662/download/wfp_food_prices_global_2026.csv"
curl -sL -A "$UA" -O "https://data.humdata.org/dataset/31579af5-3895-4002-9ee3-c50857480785/resource/d62af4be-cff6-437b-89a3-67f8fa4c53bf/download/wfp_food_prices_global_2025.csv"
## Appendice — FAO FPMA (serie domestiche, metadati + end_date)
curl -s -A "$UA" "https://fpma.fao.org/giews/v4/price_module/api/v1/FpmaSerieDomestic/"
## Appendice — FAOSTAT CPI
curl -sL -A "$UA" -O "https://bulks-faostat.fao.org/production/ConsumerPriceIndices_E_All_Data_(Normalized).zip"
## Appendice — Eurostat (JSON-stat)
B=https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data
curl -s -A "$UA" "$B/nrg_pc_204?format=JSON&nrg_cons=KWH2500-4999&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=2023-S1"
curl -s -A "$UA" "$B/nrg_pc_202?format=JSON&nrg_cons=GJ20-199&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=2023-S1"
curl -s -A "$UA" "$B/nrg_pc_204_c?format=JSON&nrg_cons=KWH2500-4999&nrg_prc=NRG_SUP&currency=EUR&sinceTimePeriod=2024"
curl -s -A "$UA" "$B/ilc_lvho07a?format=JSON&age=TOTAL&sex=T&rskpovth=TOTAL&sinceTimePeriod=2022"
curl -s -A "$UA" "$B/ilc_mded01?format=JSON&hhcomp=TOTAL&rskpovth=TOTAL&sinceTimePeriod=2022"
curl -s -A "$UA" "$B/prc_hpi_q?format=JSON&purchase=TOTAL&unit=I15_Q&sinceTimePeriod=2025-Q3"
curl -s -A "$UA" "$B/prc_hicp_minr?format=JSON&unit=RCH_A&coicop18=TOTAL&sinceTimePeriod=2026-05"
curl -s -A "$UA" "$B/earn_nt_net?format=JSON&currency=EUR&estruct=NET&ecase=P1_NCH_AW100&sinceTimePeriod=2022"
curl -s -A "$UA" "https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en"
## Appendice — OECD house prices (SDMX CSV)
curl -sL -A "$UA" -H "Accept: application/vnd.sdmx.data+csv; charset=utf-8" "https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,1.0/all?startPeriod=2024&dimensionAtObservation=AllDimensions"
## Appendice — World Bank ICP 2021 (source 90) e Food Prices for Nutrition (source 88)
curl -s -A "$UA" "https://api.worldbank.org/v2/sources/90/country/all/series/1101110/classification/PX.WL/time/YR2021?format=json&per_page=20000"
curl -s -A "$UA" "https://api.worldbank.org/v2/sources/88/country/all/series/CoHD_LCU?format=json&per_page=20000"
## Appendice — ILOSTAT
curl -sL -A "$UA" "https://rplumber.ilo.org/data/indicator/?id=EAR_EMTA_SEX_NB_A&sex=SEX_T&timefrom=2015&type=code&format=.csv"
curl -sL -A "$UA" "https://rplumber.ilo.org/data/indicator/?id=EAR_INEE_NOC_NB_A&timefrom=2015&type=code&format=.csv"
## Appendice — EIA elettricità residenziale per Stato (senza chiave)
curl -sL -A "$UA" -O "https://www.eia.gov/electricity/monthly/xls/table_5_06_a.xlsx"
## Appendice — Mappa M49→ISO3 per FAOSTAT
curl -sL -A "$UA" -O "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.csv"
```

Licenze consultate: https://www.numbeo.com/common/terms_of_use.jsp · https://www.globalpetrolprices.com/terms_conditions.php · https://www.fao.org/contact-us/terms/db-terms-of-use/en/ · https://data.apps.fao.org/catalog/dataset/domestic-market-prices-fpma · https://www.oecd.org/en/about/terms-conditions.html (via ricerca; pagina 403 al fetch diretto) · HDX `license_id: cc-by-igo` da `package_show`. ILOSTAT CC BY 4.0 e Expatistan: pagine ToS 403 al fetch, licenza ILO confermata solo via ricerca (re3data), Expatistan non verificata → trattata come non ridistribuibile.

Note di prudenza: ILO `EAR_4MTH_SEX_CUR_NB_A` risulta "deprecated or invalid" su rplumber (usare `EAR_EMTA_*`). Copertura FPMA misurata su metadati di serie (`periodicity.end_date`), non scaricando i valori.

---

<!-- Appendice C-fuel -->

## Appendice — NEXUM — Audit C: prezzi al consumo dei carburanti verso la copertura mondiale

Data dell'audit: 2026-10-03. Audit in sola lettura: nessun file del repository modificato.
Estende `NEXUM-PHASE3B-DISCOVERY-AUDIT.md` §4 senza ripeterne le decisioni. Lì era stato fissato:
WOB per UE-27, DESNZ, EIA, StatCan, data.gov.my in produzione, cioè 31 Stati.

Tutte le richieste di rete sono partite con User-Agent `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`.
Non è stata creata nessuna chiave e nessun account.

Legenda delle evidenze:
- **(F)**: aperto e letto da me oggi, con valori citati.
- **(G)**: fonte indicata nel foglio *Data Collection Meth & Sources* del World Bank Global Fuel Prices Database (§3.1), ma non aperta da me.
- **n/v**: non verificato, perché la pagina era bloccata, in timeout o resa solo via JavaScript.

Il budget di WebSearch della sessione si è esaurito a metà audit. Le licenze non leggibili via HTTP restano quindi n/v e non sono state dedotte.

---

## 0. Scoperta principale

Il **World Bank Global Fuel Prices Database (GFPD)**, autrice Elcin Akcura, ha queste caratteristiche:
- versione "April 2025", ultimo aggiornamento 2025-04-23 (F, letto dal foglio *Title Page* del file XLSX);
- prezzi **mensili** da 2015-12 a 2025-04 per **144 economie**, di cui 137 Stati ONU;
- valori sia in valuta locale sia in USD;
- per ogni Paese è indicata la fonte nazionale.

Copertura per prodotto (conteggio mio sul file scaricato, F):

| Prodotto | Paesi con dati | di cui con dati ≥ 2025-01 |
|---|---|---|
| Diesel | 142 | 135 |
| Benzina premium (RON ≥ 95) | 111 | 105 |
| Benzina regular (RON < 95) | 83 | 76 |
| GPL in bombola | 51 | 42 |
| GPL auto | 41 | 39 |
| Cherosene | 60 | 46 |

Due limiti pesano più degli altri:
- **Licenza ODbL**: la pagina del catalogo dice "Open Database License" (F, letto due volte). Un solo riassunto di ricerca indicava CC BY 4.0: va confermato. L'ODbL è share-alike sul database.
- **Dataset fermo** da 17 mesi, nonostante dichiari frequenza "Monthly".

Va quindi usato come **storico e mappa delle fonti**, non come feed vivo. Vedi §3.

---

## 1. Matrice di copertura mondiale

GRAN. = granularità. Abbreviazioni nella colonna RACC. (raccomandazione):
- ACC = ACCEPT
- COND = CONDITIONAL
- REF = REFERENCE ONLY
- REJ = REJECT

Raccomandazione per tipo di licenza:
- licenza aperta esplicita + nessuna chiave + dato vivo → ACC;
- pubblicazione ufficiale stabile ma senza licenza (o licenza n/v) → COND (va chiesto un permesso o fatta una verifica legale);
- terze parti, notizie o dati fermi → REF.

| REGIONE | PAESE | FONTE | BENZ. | DIES. | GPL | TASSE | GRAN. | ULTIMA DATA | FREQ. | FORMATO | LICENZA | REDISTR. | CHIAVE | RACC. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Europa | UE-27 | EC Weekly Oil Bulletin (in produzione) | ✓ | ✓ | 19/27 | ✓ IVA, accisa | nazionale | 2026-09-28 (§4 prec.) | settimanale | XLSX | CC BY 4.0 | sì | no | ACC |
| Europa | UK | DESNZ road fuel prices (in produzione) | ✓ | ✓ | — | ✓ accisa+IVA | nazionale | 2026-09-28 | settimanale | CSV/ODS | OGL v3 | sì | no | ACC |
| Europa | **Norvegia** | SSB tabella 09654 (F) | ✓ 95 ott. | ✓ diesel tassato | — | — | nazionale | **2026M08** (F) | mensile, dal 1986M08 | API JSON-stat | **CC BY 4.0**: "Like the rest of ssb.no, the APIs use the license CC BY 4.0" (F) | sì | no | **ACC (nuovo)** |
| Europa | Moldova | ANRE "Prețul maxim de referință" (F) | ✓ | ✓ | n/v | n/v | nazionale (tetto) | 02.10.2026 (F) | giornaliero | HTML | n/v | n/v | no | COND |
| Europa | Svizzera | UST/BFS prezzi medi IPC | n/v | n/v | — | — | — | — | — | — | opendata.swiss "terms_by" per il portale; dataset carburanti non trovato via API CKAN (F) | — | no | n/v |
| Europa | Serbia, Bosnia ed Erzegovina, Macedonia del Nord | GFPD ← fuelo.net (G), aggregatore commerciale | ✓ | ✓ | ✓ | — | nazionale | 2025-03 | mensile (fermo) | XLSX | ODbL (GFPD) | condiz. | no | REF |
| Europa | Ucraina | GFPD ← index.minfin.com.ua (G), privato | ✓ | ✓ | ✓ | — | nazionale | 2025-03 | fermo | XLSX | ODbL | condiz. | no | REF (Ukrstat n/v) |
| Europa | Russia | GFPD ← mfa.ru, solo Mosca (G) | ✓ | ✓ | — | — | **solo Mosca** | 2025-03 | fermo | XLSX | ODbL | condiz. | no | REF (Rosstat irraggiungibile, F) |
| Europa | Azerbaigian | Consiglio Tariffe (G) | ✓ | ✓ | — | — | nazionale (regolato) | 2025-04 (GFPD) | a variazione | HTML | n/v | n/v | no | COND |
| Americhe | USA | EIA (in produzione) | ✓ | ✓ | — | — | nazionale + PADD | settimanale | settimanale | XLS/HTML | pubblico dominio | sì | no | ACC |
| Americhe | Canada | StatCan 18-10-0001 (in produzione) | ✓ | ✓ | — | — | ~20 città | 2026-08 | mensile | CSV | Statistics Canada Open Licence | sì | no | ACC |
| Americhe | **Argentina** | Sec. Energía "precios-en-surtidor" Res. 314/2016 (F) | ✓ | ✓ | n/v | — | **per impianto**, prezzi dichiarati dagli operatori | **2026-10-02** (F) | giornaliero | CSV (vigenti + storici) | **CC BY 4.0** (`license_title` CKAN, F) | sì | no | **ACC (nuovo)**, mediana derivata da NEXUM |
| Americhe | Brasile | ANP Levantamento | ✓ (+etanolo) | ✓ | ✓ | — | impianto/comune | settimanale | settimanale | XLSX/CSV | CC BY vs CC BY-ND (ambigua, §4 prec.) | da chiarire | no | COND finché la licenza non è chiarita |
| Americhe | Messico | CNE (ex CRE) `publicacionexterna…/prices` + `/places` (F) | ✓ regular/premium | ✓ | — | — | **per impianto** (coordinate) | istantanea senza data nel XML (F) | continuo | XML | datos.gob.mx (403, n/v) | n/v | no | COND |
| Americhe | Cile | CNE "Precio Mensual Regional de Combustibles Líquidos" + GPL + "estructura_precios" (F) | ✓ | ✓ | ✓ (file separato) | ✓ struttura dei prezzi | **regionale** | file 2026-09-07 (F) | mensile; margini RM settimanali | XLSX | non dichiarata (n/v) | n/v | no (l'API `api.cne.cl` richiede registrazione, F) | COND |
| Americhe | Colombia | datos.gov.co `gjy9-tpph` (liquidi) / `he3q-86dn` (GNCV) (F) | ✓ fino a 2022 | ✓ fino a 2022 | — | — | comune/impianto | liquidi 2022-12-31; **GNCV 2026-10-03** (F) | mensile | Socrata API | **CC BY-SA 4.0** (F) | share-alike | no | COND (liquidi fermi) |
| Americhe | Uruguay | ANCAP "Histórico Precios" (F) | ✓ Super 95, Premium 97 | ✓ Gasoil 10S/50S | ✓ Supergás | — | nazionale (regolato) | **01/10/2026** (F) | mensile, dal 01/07/2021 | HTML | n/v | n/v | no | COND |
| Americhe | Costa Rica | RECOPE / ARESEP datos abiertos (G) | ✓ | ✓ | ✓ | n/v | nazionale | 2025-03 (GFPD) | a variazione | HTML/dati aperti | n/v (timeout, F) | n/v | no | COND |
| Americhe | Perù | Osinergmin SCOP / Facilito (G) | ✓ | ✓ | ✓ | — | Lima (GFPD); impianto (Facilito) | 2025-04 (GFPD) | — | HTML | n/v (portale dati: WAF 418, F) | n/v | no | COND |
| Americhe | Rep. Dominicana, Guatemala, Nicaragua, Panama, Bolivia, Giamaica, Barbados, Grenada, Belize, Saint Lucia, Trinidad e Tobago | ministeri, regolatori, banche centrali (G) | ✓ | ✓ | vari | — | nazionale; Panama solo capitale | 2025-01…04 (GFPD) | settimanale/mensile | HTML/PDF | n/v | n/v | no | COND |
| Americhe | Ecuador, Honduras, El Salvador, Venezuela | GFPD ← notizie / X (G) | ✓ | ✓ | vari | — | nazionale | 2025-04 | fermo | XLSX | ODbL | condiz. | no | REF |
| Asia | Malaysia | data.gov.my (in produzione) | ✓ | ✓ | — | sussidiato vs mercato | nazionale | settimanale | settimanale | API/Parquet | CC BY 4.0 | sì | no | ACC |
| Asia | India | PPAC "RSP of Petrol and Diesel in Metro Cities since 16.6.2017" + "Price Build up" (F) | ✓ | ✓ | ✓ LPG domestico Delhi | ✓ build-up (accisa, IVA, commissione) | 4 metropoli | "Last Updated On: 01-10-2026" (F) | a variazione | XLS/PDF | "Content Owned … by PPAC": nessuna licenza aperta (F); data.gov.in 403 (F) | n/v | no | COND |
| Asia | Pakistan | PSO "POL Effective From" (F) | ✓ Premier Euro 5 Rs 392,76/l | ✓ HSD Rs 399,64/l | — | — | nazionale | **2026-10-03** (F) | quasi giornaliero | HTML | n/v | n/v | no | COND (OGRA n/v) |
| Asia | Sri Lanka | CPC "Historical Prices" (F) | ✓ LP92 414, LP95 475 LKR/l | ✓ LAD 392, LSD 528 | — | — | nazionale (regolato) | **01.10.2026** (F) | mensile | HTML paginato | n/v | n/v | no | COND |
| Asia | Arabia Saudita | Aramco "Prices for the month of September 2026" (F) | ✓ G91 2,18, G95 2,33, G98 4,64 SAR/l | ✓ 1,79 | — | — | nazionale | 2026-09 (F) | mensile | HTML | ToS aziendali n/v | n/v | no | COND |
| Asia | Corea del Sud | Opinet API (F) / KOSIS (G) | ✓ | ✓ | ✓ | ✓ (sezione 유류세) | impianto/regione | — | giornaliero | API | — | — | **sì, "인증키 발급"** (F) | REJ per l'API; KOSIS COND (n/v) |
| Asia | Giappone | ANRE/METI 石油製品価格調査 (G) | ✓ | ✓ | n/v | — | nazionale + prefettura | — | settimanale | XLS | 政府標準利用規約 (n/v) | n/v | no | COND (**403** al nostro UA, F) |
| Asia | Thailandia | EPPO statistiche prezzi (F, pagina aperta; tabelle n/v) | ✓ | ✓ | ✓ | ✓ struttura completa (§4 prec.) | nazionale | 2025-02 (GFPD) | giornaliero | XLS | n/v (data.go.th 403, F) | n/v | no | COND |
| Asia | Filippine | DOE "Retail Pump Prices Metro Manila" (F, pagina aperta; PDF n/v) | ✓ | ✓ | ✓ (LPG monitor) | — | Metro Manila | 2025-03 (GFPD) | settimanale | PDF | n/v | n/v | no | COND |
| Asia | Israele | gov.il `fuel_prices_xls` (G) | ✓ | — | ✓ | n/v | nazionale (tetto) | 2025-03 (GFPD) | mensile | XLS | n/v (Cloudflare 403, F) | n/v | no | COND |
| Asia | Cina | annunci NDRC / dati provinciali; GFPD ← eastmoney (G) | ✓ | ✓ | — | — | provincia (tetti) | 2025-03 (solo Pechino in GFPD) | ~10 giorni lavorativi | HTML | n/v | n/v | no | COND |
| Asia | Turchia | EPDK "Fiyatlandırma / Akaryakıt İzleme Raporu" (F, menu); GFPD ← TPPD (G) | ✓ | ✓ | ✓ | n/v | 5 città (GFPD) | 2025-03 | mensile | PDF | n/v | n/v | no | COND |
| Asia | Bangladesh, Nepal, Vietnam, Indonesia, Cambogia, Laos, Myanmar, Maldive, Mongolia, Kirghizistan, Giordania, Libano, Oman, Qatar, EAU | regolatori / compagnie statali (G); ENOC 403, WOQOD vuota (F) | ✓ | ✓ | vari | BD, NP n/v | nazionale o capitale | 2025-02…04 (GFPD) | mensile o a variazione | HTML/PDF | n/v | n/v | no; Pertamina dietro Cloudflare 403 (F) | COND |
| Asia | Iran, Iraq, Siria, Bahrein, Kazakistan, Uzbekistan | GFPD ← notizie / goldenpages (G) | ✓ | ✓ | — | — | nazionale | 2023-12…2025-04 | fermo | XLSX | ODbL | condiz. | no | REF |
| Africa | Zambia | ERB "Pump Prices, Press Statement and Price Build-ups" (F) | ✓ 31,46 ZMW/l | ✓ 33,27 | — | ✓ price build-up | nazionale | **ottobre 2026** (F) | mensile | HTML+PDF | n/v | n/v | no | COND |
| Africa | Zimbabwe | ZERA "Current fuel prices" (F) | ✓ E20 2,06 USD/l | ✓ D50 2,08 USD/l | — | — | nazionale | 17-09-2026 (F) | a variazione | HTML | "© 2026 ZERA. All Rights Reserved" (F) | no | no | REF |
| Africa | Lesotho | Petroleum Fund "Fuel Price Report" (F) | ✓ | ✓ | n/v | n/v | nazionale | settembre 2026 (F) | mensile + metà mese | PDF | n/v | n/v | no | COND |
| Africa | Kenya | EPRA prezzi massimi alla pompa (G) | ✓ | ✓ | — | ✓ build-up (G) | **per città** (Nairobi in GFPD) | 2025-04 (GFPD) | mensile (14 del mese) | PDF | n/v (timeout, F) | n/v | no | COND |
| Africa | Sudafrica | DMRE adeguamenti mensili (G) | ✓ 93/95 | ✓ 50/500 ppm | ✓ | ✓ struttura regolata | costa / Gauteng | 2025-03 (GFPD) | mensile | PDF/HTML | n/v (503 e timeout, F) | n/v | no | COND |
| Africa | Ghana | NPA ex-pump/indicative (F, pagina; dati n/v) | ✓ | ✓ | ✓ | n/v (PBU) | nazionale | 2025-03 (GFPD) | quindicinale | PDF | "© 2026 NPA" (F) | n/v | no | COND |
| Africa | Nigeria | NBS "PMS/AGO Price Watch" (G) | ✓ | ✓ | ✓ | — | **per Stato federato** | 2025-01 (GFPD) | mensile | XLSX/PDF | n/v | n/v | no | COND |
| Africa | Egitto, Tunisia, Mauritania, Capo Verde, Camerun, Mauritius, Madagascar, Mozambico, Malawi, Tanzania, Botswana, Namibia, Uganda, Sierra Leone, Benin, Etiopia, Angola | regolatori / ministeri / compagnie (G); NAMCOR "All Rights Reserved" (F); BERA ultimo comunicato visibile 2023-11 (F) | ✓ | ✓ | vari | MW, TZ n/v | nazionale; TZ Dar es Salaam; BW Gaborone | 2023-10…2025-04 (GFPD) | mensile | PDF/HTML/Facebook | n/v | n/v | no | COND (Etiopia, Angola: REF) |
| Africa | Algeria, Costa d'Avorio, Senegal, Mali, Niger, Burkina Faso, Togo, Gabon, Congo, RDC, RCA, Guinea Equatoriale, Liberia, Gambia | GFPD ← notizie (G) | ✓ | ✓ | vari | — | nazionale | 2023-09…2025-04 | fermo | XLSX | ODbL | condiz. | no | REF |
| Oceania | Australia | QLD (CC BY 4.0), NSW (CC BY-SA), WA (ARR) (§4 prec.); GFPD ← AIP **TGP all'ingrosso** (G) | ✓ | ✓ | ✓ | — | statale / impianto | mensile | mensile | CSV/XLSX | mista | parziale | no (l'API NSW live sì) | COND (nessuna media nazionale aperta) |
| Oceania | **Nuova Zelanda** | MBIE weekly fuel price monitoring `weekly-table.csv` (F) | ✓ 91 e 95R | ✓ | — | ✓ **GST, ETS, Taxes, prezzo al netto delle tasse, margine dell'importatore** | nazionale | **2026-09-25 (2026w39)** (F) | settimanale, dal 2004 | CSV | n/v (pagina resa via JavaScript, F) | n/v | no | COND → ACC se confermata la CC BY 4.0 |
| Oceania | Figi, Papua Nuova Guinea, Vanuatu | FCCC, ICCC, DoE (G) | ✓ | ✓ | FJ ✓ | — | FJ solo Viti Levu | 2024-09…2025-04 | mensile | HTML/PDF | n/v | n/v | no | COND |
| Mondo | 144 economie | **WB Global Fuel Prices Database** (F) | ✓ 83 + 111 | ✓ 142 | ✓ 51 + 41 | — | nazionale o città | **2025-04 (fermo)** | dichiarata "Monthly" | XLSX 5,6 MB | **ODbL** (F, da confermare) | sì, share-alike | no | COND (storico) / REF |

---

## 2. Totali sui 193 Stati ONU

I conteggi sono fatti con uno script sul file GFPD e sulla lista ONU (F).

| Categoria | Stati | Quota |
|---|---|---|
| **ACCEPT**: licenza aperta verificata, senza chiave, dato vivo | **33** | 17% |
| **CONDITIONAL**: pubblicazione ufficiale nazionale individuata, licenza assente o n/v | **73** | |
| **REFERENCE ONLY**: solo GFPD fermo ad apr. 2025, con fonte a monte giornalistica o commerciale | **31** | |
| **Nulla di individuato** | **56** | |

**ACCEPT (33)**:
- i 31 già in produzione: UE-27, UK, US, CA, MY;
- due nuovi: **Norvegia** (SSB, CC BY 4.0) e **Argentina** (CC BY 4.0, per impianto).

Rispetto al §4 precedente l'Australia esce dall'ACCEPT: NEXUM pubblica medie nazionali e manca una media nazionale con licenza aperta. Il Brasile resta in attesa del chiarimento sulla licenza.

**CONDITIONAL (73)**, per regione:

| Regione | n. | Stati |
|---|---|---|
| Africa | 22 | Benin, Botswana, Capo Verde, Camerun, Egitto, Ghana, Kenya, Lesotho, Madagascar, Malawi, Mauritania, Mauritius, Mozambico, Namibia, Nigeria, Sierra Leone, Sudafrica, Tanzania, Tunisia, Uganda, Zambia, Zimbabwe |
| Americhe | 18 | Barbados, Belize, Bolivia, Brasile, Cile, Colombia, Costa Rica, Rep. Dominicana, Grenada, Guatemala, Giamaica, Messico, Nicaragua, Panama, Perù, Saint Lucia, Trinidad e Tobago, Uruguay |
| Asia | 26 | Bangladesh, Cambogia, Cina, India, Indonesia, Israele, Giappone, Giordania, Kirghizistan, Laos, Libano, Maldive, Mongolia, Myanmar, Nepal, Oman, Pakistan, Filippine, Qatar, Arabia Saudita, Corea del Sud, Sri Lanka, Thailandia, Turchia, EAU, Vietnam |
| Europa | 2 | Azerbaigian, Moldova |
| Oceania | 5 | Australia, Figi, Nuova Zelanda, Papua Nuova Guinea, Vanuatu |

Note sulla tabella CONDITIONAL:
- Lo Zimbabwe è "All Rights Reserved". Lo conto qui perché è una fonte ufficiale, ma in matrice è REF.

**REFERENCE ONLY via GFPD (31)**:
- **Africa (16)**: Algeria, Angola, Burkina Faso, RCA, Congo, RDC, Costa d'Avorio, Guinea Equatoriale, Etiopia, Gabon, Gambia, Liberia, Mali, Niger, Senegal, Togo.
- **Americhe (4)**: Ecuador, El Salvador, Honduras, Venezuela.
- **Asia (6)**: Bahrein, Iran, Iraq, Kazakistan, Siria, Uzbekistan.
- **Europa (5)**: Bosnia ed Erzegovina, Macedonia del Nord, Russia, Serbia, Ucraina.

**Nulla di individuato (56)**:
- **Africa (16)**: Burundi, Ciad, Comore, Gibuti, Eritrea, Eswatini, Guinea, Guinea-Bissau, Libia, **Marocco** (prezzi liberalizzati dal 2015, nessuna pubblicazione ufficiale), Ruanda, São Tomé e Príncipe, Seychelles, Somalia, Sud Sudan, Sudan.
- **Americhe (10)**: Antigua e Barbuda, Bahamas, Cuba, Dominica, Guyana, Haiti, Paraguay, Saint Kitts e Nevis, Saint Vincent e Grenadine, Suriname.
- **Asia (10)**: Afghanistan, Bhutan, Brunei, Kuwait, Corea del Nord, Singapore, Tagikistan, Timor Est, Turkmenistan, Yemen.
- **Europa (11)**: Albania, Andorra, Armenia, Bielorussia, Georgia, **Islanda**, Liechtenstein, Monaco, Montenegro, San Marino, **Svizzera** (fonte UST probabile ma n/v).
- **Oceania (9)**: Kiribati, Isole Marshall, Micronesia, Nauru, Palau, Samoa, Isole Salomone, Tonga, Tuvalu.

L'Africa conta 16 Stati sia nei REFERENCE ONLY sia qui: è una coincidenza dei conteggi, non un errore.

**Tetto realistico:**
- con licenze aperte verificate: **33/193**;
- con permessi o verifiche legali sulle 73 CONDITIONAL: ~**106/193 (55%)** di dati vivi;
- con lo storico GFPD fino ad apr. 2025 (ODbL): ~**137/193** per la sola serie storica.

La "copertura mondiale" completa non è raggiungibile con fonti aperte vive.

---

## 3. Dataset multi-Paese

### 3.1 World Bank Global Fuel Prices Database (Akcura 2025)

URL: `datacatalogfiles.worldbank.org/ddh-published/0066829/DR0095290/Global_Fuel_Prices_Database.xlsx`, 5.603.258 byte, scaricato (F).

**Struttura:**
- un foglio per prodotto, sia in valuta locale sia in USD;
- tassi di cambio mensili;
- un foglio con metodologia e fonti per ciascuna economia.

**Avvertenze dichiarate:**
- "the prices in the LCU workbooks are not in uniform units (e.g., some may be in liters and others in gallons)" (F);
- "If the data is sourced from a news article, the link … is provided in the comment boxes" (F).

**Fonti a monte miste.** La metodologia (F) indica:
- per i Paesi UE, la media mensile semplice del WOB;
- per altri Paesi, aggregatori commerciali: fuelo.net (BA, MK, RS), mypetrolprice.com (IN), eastmoney (CN), goldenpages.uz (UZ), index.minfin.com.ua (UA);
- per 20+ Paesi, articoli di stampa.

La licenza ODbL della Banca Mondiale non può "ripulire" diritti di terzi a monte: è un rischio da valutare.

**Copertura geografica eterogenea:**
- solo città per CN (Pechino), ID (Giacarta), KE (Nairobi), PE (Lima), PH (Manila), RU (Mosca), MM (Yangon), NP (Kathmandu), TZ (Dar es Salaam), BW (Gaborone), PA, LA, CO (Bogotá/Medellín), IN (Delhi/Mumbai);
- l'Australia è **TGP all'ingrosso**, non prezzo al dettaglio (F).

**Freschezza:** ultimo aggiornamento 2025-04-23; nessuna versione successiva vista nel catalogo (F). La copertura per Paese finisce tra 2023-09 (Gambia), 2023-10 (Uganda), 2023-12 (Siria) e 2025-04.

**Accesso:** l'API del catalogo (`datacatalogapi.worldbank.org`) ha risposto 429 in modo persistente: va distanziata di 60 s o più (F).

**Decisione:** COND (storico 2015–2025, con attribuzione "Global Fuel Prices Database. World Bank. 2025." e rispetto dell'ODbL). Prima di qualsiasi uso va confermata la licenza sulla pagina del catalogo. Il dataset è più prezioso come **registro delle fonti nazionali**: è la base delle righe (G) del §1.

### 3.2 WB Global Fuel Subsidies & Price Control Measures Database

ID catalogo 0066833. Pagina del catalogo letta (F):
- licenza "Open Database License";
- 154 economie, periodo 2021–apr. 2025, metadati del 2025-05-28;
- manutenzione "annual";
- contiene il **tipo di regolazione del prezzo** per Paese, sussidi, contrabbando e scarsità.

Non contiene prezzi, ma è ottimo per il flag "regolato vs mercato" (§4). **COND**.

### 3.3 IMF Fossil Fuel Subsidies Data, 2025 Update

Riferimento: WP/25/270, dicembre 2025, 170 Paesi, annuale.

I prezzi al dettaglio vengono da questionari IMF/WB **integrati con GlobalPetrolPrices, IEA, Enerdata**, tutte fonti commerciali (da riassunto di ricerca; la pagina IMF ha dato **403**, F). La licenza del dashboard è "custom" (n/v).

**REF**: utile per sussidi impliciti ed espliciti, non come prezzo al consumo.

### 3.4 Altri dataset

| Dataset | Esito | Decisione |
|---|---|---|
| IMF Kpodar–Abdallah WP/16/254 (162 Paesi, 2000–2014; aggiornamento a 190 Paesi fino al 2020) | redistribuzione non chiarita | REF storico |
| GlobalPetrolPrices | commerciale (§4 prec.; non riaperto oggi) | REJ |
| IEA End-use prices | a pagamento | REJ |
| IEA Fossil Fuel Subsidies DB | sussidi per ~40 Paesi, non prezzi | REF per i sussidi |
| WB `EP.PMP.SGAS.CD` / `EP.PMP.DESL.CD`, GIZ International Fuel Prices | dismessi o fermi (§4 prec.) | REJ |
| JODI | solo volumi | non pertinente |
| OPEC ASB | n/v | REF |
| WB Microdata cat. 6134 "Monthly energy price estimates by product and market" (AF, AM, GM e altri 8) | stime di mercato; n/v | REF |
| fuelo.net | aggregatore privato | REJ |

---

## 4. Avvertenze metodologiche

1. **Prezzo massimo ufficiale ≠ media osservata.** Sono prezzi fissati per atto (tetto o prezzo amministrato): LK, PK, BD, NP, MD, ZM, ZW, KE, ZA, GH, EG, SA, AE, QA, OM, CN, VN, ID, IL, UY, gran parte dell'Africa francofona.
   Le medie da indagine sono invece quelle di: WOB, DESNZ, EIA, StatCan, SSB, MBIE, ANP, CNE, NBS, JP.
   NEXUM deve esporre `statistic: "official_max" | "regulated" | "survey_mean"` e non mescolarli in un confronto.
2. **Data effettiva ≠ settimana d'indagine ≠ media mensile.**
   - PSO cambia quasi ogni giorno (F).
   - Il WOB è al lunedì.
   - Il GFPD fa la media semplice mensile dei dati settimanali.
   - EPRA vale dal 15 al 14 del mese successivo.
   - Aramco è mensile.
   Conservare `[start, end]` come fa già `fuel_common.fuel()`.
3. **Unità:**
   - US in $/gal;
   - CA in ¢/l, NZ in c/L, AU in c/l;
   - GFPD in valuta locale "non uniforme" (F);
   - ZW pubblica in doppia valuta, USD e ZWG (F).
   Non convertire mai: dichiarare unità e valuta come da sorgente, regola già in `fuel_common`.
4. **Valuta e ridenominazioni:** ZWL→ZWG (ZW), VES (VE), ARS con inflazione molto alta. Il cambio BCE non copre ARS, CLP, COP, KES, NGN (§4 prec.): nessun confronto in EUR per questi.
5. **Gradi di prodotto non omogenei:**
   - Benzina: RON 91/92/95/97/98. Il GFPD separa regular < 95 da premium ≥ 95.
   - Miscele: E10 (PK), **E20** (ZW, F), gasolina C con circa il 27–30% di etanolo (BR).
   - Diesel per tenore di zolfo: 10S/50S (UY), LAD/LSD (LK), 50/500 ppm (ZA).
   Non chiamare "benzina" un prodotto senza indicarne il grado.
6. **Sussidi e prezzi a più livelli:**
   - MY: sussidiato vs mercato;
   - BO: prezzi diversi per nazionali e stranieri (G);
   - IR: quote a più livelli;
   - NG: deregolazione 2023;
   - BJ: benzina di contrabbando inclusa nell'IPC (G).
   Mostrare il livello, non una media inventata.
7. **Tasse:** componenti pubblicate solo da UE-27 (WOB), UK, NZ (GST/ETS/Taxes, F), IN (build-up), CL (estructura), ZM (build-up), TH, KE (G). Altrove "tasse: non pubblicate", mai stimate.
8. **Granularità:** solo dove la sorgente la dà. Città o capitale non equivalgono a "nazionale"; regioni o impianti solo per AR, MX, BR, CO, CL, AU, IN, KE, NG, CN, ZA.
9. **Ingrosso ≠ dettaglio:** TGP australiano, prezzi di parità CNE, ex-refinery. Vanno esclusi.

---

## 5. URL riproducibili (verificati oggi salvo indicazione)

- WB GFPD XLSX: https://datacatalogfiles.worldbank.org/ddh-published/0066829/DR0095290/Global_Fuel_Prices_Database.xlsx
- Catalogo GFPD: https://datacatalog.worldbank.org/search/dataset/0066829/global-fuel-prices-database
- WB Subsidies & Price Controls: https://datacatalog.worldbank.org/search/dataset/0066833/global-fuel-subsidies-and-price-control-measures-database
- Norvegia SSB: https://data.ssb.no/api/v0/en/table/09654. Licenza: https://www.ssb.no/en/api
- Argentina (CKAN): https://datos.gob.ar/api/3/action/package_search?q=precios%20surtidor
  - CSV vigenti: http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv
  - CSV storici: …/resource/f8dda0d5-2a9f-4d34-b79b-4e63de3995df/download/precios-historicos.csv
- Nuova Zelanda: https://www.mbie.govt.nz/assets/Data-Files/Energy/Weekly-fuel-price-monitoring/weekly-table.csv
- Messico: https://publicacionexterna.azurewebsites.net/publicaciones/prices e …/places
- Cile: https://www.cne.cl/estadisticas/hidrocarburo/ (es. `wp-content/uploads/2026/09/precios_comb_liquidos_en_el_pais-2026-09-07-2.xlsx`, `…/2026/04/estructura_precios_combustibles.xlsx`)
- Colombia: https://www.datos.gov.co/resource/he3q-86dn.json e https://www.datos.gov.co/resource/gjy9-tpph.json
- Uruguay: https://www.ancap.com.uy/10564/1/historico-precios-combustibles.html
- India: https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017
- Pakistan: https://www.psopk.com/fuel-prices/pol/archives?page=1
- Sri Lanka: https://ceypetco.gov.lk/historical-prices/
- Arabia Saudita: https://www.aramco.com/en/what-we-do/energy-products/retail-fuels
- Zambia: https://www.erb.org.zm/
- Zimbabwe: https://www.zera.co.zw/
- Lesotho: https://petroleum.org.ls/fuel-price-reports/
- Moldova: https://www.anre.md/
- Corea (API con chiave): https://www.opinet.co.kr/user/custapi/openApiInfo.do
- Bloccati o n/v oggi:
  - enecho.meti.go.jp (403)
  - gov.il (Cloudflare)
  - epra.go.ke (timeout)
  - dmre.gov.za ed energy.gov.za (timeout/503)
  - data.gov.in (403), data.go.th (403)
  - datosabiertos.gob.pe (WAF 418)
  - mypertamina.id (Cloudflare)
  - enoc.com (403)
  - imf.org (403)
  - pagina MBIE (resa via JavaScript)
- Fonti (G) di altri ~80 Paesi: foglio "Data Collection Meth & Sources" dentro lo XLSX GFPD (colonna "Relevant website links").

**Passi successivi proposti (solo studio, nessuna implementazione):**
1. Aggiungere i connettori SSB 09654 (NO) e Argentina (mediana nazionale/provinciale derivata, dichiarata come tale).
2. Chiedere conferma scritta della licenza a MBIE (NZ), ANP (BR), CNE (CL) e CNE-MX: con quattro email lo stato ACCEPT passerebbe a ~37.
3. Valutare il GFPD in ODbL come livello storico separato, con licenza propria.

---

<!-- Appendice D-energy -->

## Appendice — NEXUM — Audit fonti dati ENERGIA (dominio D) — sola lettura

Data audit: 2026-10-03. Universo: i 193 Stati membri ONU (lista `UN193` di `connectors/obs_common.py`, mappata a ISO3 tramite l'elenco paesi della World Bank).
User-Agent di tutte le richieste: `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`. Nessun account, nessuna chiave, nessun form compilato.
File scaricati in `scratchpad/wi/en/` (fuori dal repo). Il repo NEXUM non è stato modificato.

## 0. Convenzioni

- **TOTAL (193)** = paesi ONU con almeno un valore non vuoto (gli zeri dichiarati contano come dato).
- **GOOD** = ultimo anno ≥ 2023 (serie mensili: ultimo mese ≥ 2025-07). **PARTIAL** = 2021–2022. **STALE** = ≤ 2020 o dataset congelato.
- **NOT COMPARABLE** = valore presente ma non confrontabile (unità/definizioni diverse dalle altre fonti) — indicato solo quando misurato.
- **NO DATA** = 193 − TOTAL.
- "non misurato" = non verificato con download/query in questa sessione.
- Le licenze sono citate testualmente quando la pagina è stata letta; se la pagina ha risposto 403/402/JS-only è scritto esplicitamente.

## 1. Tabella principale — indicatori paese

| DOMAIN | INDICATOR | SOURCE | TOTAL | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY/ACCOUNT | COST | QUALITY | REC. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a | Generazione elettrica totale (TWh) | Ember Yearly Electricity Data, `yearly_full_release_long_format.csv` (https://ember-energy.org/data/yearly-electricity-data/) | 184 | 183 (2025: 88, 2024: 90, 2023: 5) | 1 (2022) | 0 | 0 | 9 (ALB, AND, FSM, LIE, MCO, MHL, PLW, SMR, TUV) | 2025 | "updated twice a month" | "Ember content is released under a Creative Commons Attribution Licence (CC-BY-4.0)" https://ember-energy.org/creative-commons/ | sì, con attribuzione | no | €0 | ottima; per molti paesi è di fatto EIA (vedi §6) | **ACCEPT** |
| a | Domanda elettrica (TWh) e domanda pro capite (MWh) | Ember Yearly | 184 | 183 | 1 | 0 | 0 | 9 | 2025 | bimensile | CC BY 4.0 (idem) | sì | no | €0 | pro capite calcolato da Ember con la sua popolazione | **ACCEPT** |
| a/e | Import netti elettricità (TWh, senza partner) | Ember Yearly `Net Imports` | 184 (120 con valore ≠ 0 nel 2024) | 183 | 1 | 0 | 0 | 9 | 2025 | bimensile | CC BY 4.0 | sì | no | €0 | solo saldo, nessun partner | **ACCEPT** |
| a | Generazione netta, consumo netto, import/export/net import elettricità (TWh) | EIA International bulk `INTL.zip` (https://api.eia.gov/bulk/INTL.zip) | 185 | 185 (2024) | 0 | 0 | 0 | 8 (AND, LIE, MCO, MHL, PLW, SMR + 2) | 2024 | bulk rigenerato (last_updated 2026-09-30) | "U.S. government publications are in the public domain and are not subject to copyright protection." https://www.eia.gov/about/copyrights_reuse.php | sì (citare EIA) | no | €0 | stime/modelli per paesi piccoli; "net" generation | **ACCEPT** (fonte primaria indipendente da usare come controllo) |
| a | Capacità installata totale (GW) | EIA INTL `Electricity installed capacity` | 187 | 187 (2024) | 0 | 0 | 0 | 6 | 2024 | idem | public domain | sì | no | €0 | include FSM, TUV, ALB (assenti in Ember) | **ACCEPT** |
| a | Accesso all'elettricità (% popolazione) | World Bank WDI `EG.ELC.ACCS.ZS` (API v2) | 193 | 193 (2024) | 0 | 0 | 0 | 0 | 2024 (lastupdated 2026-07-13) | annuale | CC BY 4.0 https://datacatalog.worldbank.org/public-licenses | sì | no | €0 | molti valori modellati (SDG7 tracking) | **ACCEPT** |
| a | Consumo elettrico pro capite (kWh) | WB `EG.USE.ELEC.KH.PC` | 146 | 145 (2023: 104, 2024: 41) | 1 | 0 | 0 | 47 | 2024 | annuale | CC BY 4.0 | sì | no | €0 | derivato IEA, copertura bassa | **REFERENCE ONLY** (preferire Ember) |
| a | Dipendenza energetica: import netti % uso energia | WB `EG.IMP.CONS.ZS` | 143 | 67 (2023) | 72 (2022: 71, 2021: 1) | ≥1 (2004) | 0 | 50 | 2023 | annuale | CC BY 4.0 | sì | no | €0 | derivato IEA; incompleto | **CONDITIONAL** |
| a | Dipendenza energetica (% , UE+vicinato) | Eurostat `nrg_ind_id` | non misurato per paese (file 34 KB, 534 righe) | — | — | — | — | — | 2024 | annuale | riuso autorizzato con citazione (policy già in `sources_live/eurostat.reality.toml`) | sì | no | €0 | definizione armonizzata UE | **ACCEPT** (solo Europa) |
| a | Consumo energia primaria e pro capite | OWID energy (`owid-energy-data.csv`) | 187 | 187 (2023: 110, 2024: 77) | 0 | 0 | 0 | 6 | 2024 | ~annuale | "Creative Commons BY"; ma "The data produced by third parties ... is subject to the license terms from the original third-party authors" (https://ourworldindata.org/energy) | condizionata alla fonte (EI/EIA) | no | €0 | mix EI (77 paesi) + EIA | **CONDITIONAL** |
| a | Totale energia prodotta/consumata (quad Btu, Mtoe, TJ) | EIA INTL | 187 | 187 (2024) | 0 | 0 | 0 | 6 | 2024 | idem | public domain | sì | no | €0 | coerente, unità multiple | **ACCEPT** |
| b | Mix GENERAZIONE per fonte (TWh e %): nuclear, solar, wind, hydro, gas, coal, other fossil, bioenergy, other renewables | Ember Yearly | 181–184 per fonte (Other Renewables 162; Nuclear 174 righe, 31 con valore > 0) | 172–183 | ≤1 | ≤2 | 0 | 9–31 | 2025 | bimensile | CC BY 4.0 | sì | no | €0 | geotermia inclusa in "Other Renewables"; oil dentro "Other Fossil" | **ACCEPT** |
| b | Mix CAPACITÀ per fonte (GW) | Ember Yearly `Capacity` | Solar 183, Wind 181, Hydro 180, Bioenergy 183, Nuclear 173, Gas 119, Coal 81 | 177 (solar) | 1 | 0–2 | Gas/Coal: righe solo dove la fonte esiste | 10–112 | 2025 | bimensile | CC BY 4.0 | sì | no | €0 | copertura capacità fossile disomogenea | **ACCEPT** (fossili: CONDITIONAL) |
| b | Mix generazione e capacità per fonte (incl. geotermia, pumped storage, biomassa, petrolio) | EIA INTL | 185 (gen), 185–187 (cap) | tutti 2024 | 0 | 0 | 0 | 6–8 | 2024 | idem | public domain | sì | no | €0 | separa geotermia e pumped storage | **ACCEPT** |
| b | Capacità e generazione rinnovabile/non rinnovabile per tecnologia (26 tecnologie, on/off-grid) | IRENASTAT PxWeb `Country_ELECSTAT_2026_H2_PX.px` (https://pxweb.irena.org/api/v1/en/IRENASTAT/) | 190 (cap. rinnovabile), 190 (gen. rinnovabile), 188 (gen. non rinn.) | 190 cap (2025), 190 gen (2024) | 0 | 0 | 0 | 3 (LIE, MCO, SMR); gen non rinn.: +ALB, ETH | cap 2025, gen 2024 | semestrale (H2 2026, aggiornato 2026-09-28) | pagina termini 403 in sessione: **non verificata** | non verificata | no (API PxWeb aperta) | €0 | fonte ufficiale per capacità rinnovabile, include off-grid | **CONDITIONAL** (verificare termini IRENA prima dell'uso) |
| b | Mix per fonte, pro capite (kWh/persona) | OWID (`*_elec_per_capita`) | 185 | 184 | 1 | 0 | 0 | 8 | 2025 | ~annuale | CC BY (derivato Ember) | sì | no | €0 | popolazione OWID/UN WPP, non WB | **CONDITIONAL** (ricalcolare in NEXUM con popolazione dello stesso anno) |
| b | Quota nucleare / rinnovabile (% elettricità) | WB `EG.ELC.NUCL.ZS`, `EG.ELC.RNEW.ZS` | 190 | NUCL 33; RNEW 0 | NUCL 157 (2021); RNEW 186 (2021) | RNEW 3 | 0 | 3 | 2024 / 2021 | annuale | CC BY 4.0 | sì | no | €0 | ferma al 2021 per quasi tutti | **REJECT** (superata da Ember) |
| d | Gas: produzione, consumo, import, export (bcm) | EIA INTL `Dry natural gas *` | 187 | 186 (2024) | 0 | 1 (2020) | 0 | 6 | 2024 | idem | public domain | sì | no | €0 | totali senza partner | **ACCEPT** |
| d | Gas mensile: produzione, import pipeline/LNG, export, domanda | JODI-Gas World DB `GAS_world_NewFormat.zip` (https://www.jodidata.org/jodi-publisher/gas/27/GAS_world_NewFormat.zip) | INDPROD 88; TOTIMPSB 84; IMPLNG 81; IMPPIP 83; TOTDEMC 77 | 59–66 (ultimo mese ≥ 2025-07) | — | 4–8 per flusso (ultimo anno 2015–2017) | — | 105–116 | 2026 | mensile | termini non leggibili (pagine 403/404) — **non verificati** | non verificata | no | €0 | flag qualità `ASSESSMENT_CODE` (2025+: ~80% codice 1, ~15–20% codice 3 "non valutato") | **CONDITIONAL** |
| d | Gas: produzione/consumo (EI Statistical Review via OWID) | OWID `gas_production`, `gas_consumption` | prod 185; cons 77 | prod 49 (2024); cons 77 | 0 | prod 136 (2016, serie Shift) | — | prod 8; cons 116 | 2024 | annuale | EI: pagina termini 403 → **non verificata**; OWID avverte che vale la licenza del terzo | dubbia | no | €0 | produzione ferma al 2016 per 136 paesi | **REFERENCE ONLY** |
| f | Petrolio: produzione greggio (kb/d) | EIA INTL `Crude oil including lease condensate production` | 185 | 185 (2025) | 0 | 0 | 0 | 8 | 2025 | idem | public domain | sì | no | €0 | include zeri | **ACCEPT** |
| f | Petrolio: consumo prodotti (kb/d) | EIA INTL `Petroleum and other liquids consumption` | 186 | 186 (2024: 149, 2025: 36) | 0 | 0 | 0 | 7 | 2025 | idem | public domain | sì | no | €0 | buona | **ACCEPT** |
| f | Petrolio: import/export greggio (totali) | EIA INTL `Crude oil ... imports/exports` | 185 | 0 | 0 | 185 (2018: 148, 2020: 36) | 0 | 8 | 2020 | congelato | public domain | sì | no | €0 | serie ferma | **REJECT** (usare JODI) |
| f | Raffinazione: produzione prodotti raffinati | EIA INTL `Refined petroleum products production` | 185 | 0 | 0 | 185 (2014) | 0 | 8 | 2014 | congelato | public domain | sì | no | €0 | ferma al 2014; nessuna serie "capacità di raffinazione" trovata in INTL | **REJECT** |
| f | Petrolio mensile: produzione, import, export, input raffinerie (greggio) | JODI-Oil World DB, CSV annuali `annual-csv/primary/{2025,primaryyear2026}.csv` | 115 (nei file 2025–2026) | 93 (dato ≥ 2026-01) | non misurato | non misurato (file pre-2025 non scaricati) | — | 78 | 2026-07 | mensile | **non verificati** | non verificata | no | €0 | stesse 5 unità (KBD, KBBL, KTONS, KL, CONVBBL); KBD con molti "-" | **CONDITIONAL** |

## 2. Tabella — relazioni bilaterali (partner) e interconnessioni

| DOMAIN | INDICATOR | SOURCE | TOTAL (reporter ONU) | GOOD | PARTIAL | STALE | NOT COMP. | NO DATA | LATEST | UPDATE | LICENSE | REDISTR. | KEY/ACCOUNT | COST | QUALITY | REC. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| d | Import gas per paese partner (mio m³ e TJ GCV) | Eurostat `nrg_ti_gas` (SDMX TSV, 204 KB gz) | 35 | 32 (2024) | 0 | 3 (2019, 2020, …) | 0 | 158 | 2024 | annuale | riuso con citazione (Eurostat) | sì | no | €0 | 2024: 185 archi ONU→ONU, 76 partner distinti; il partner può essere hub/transito (NL, DE) | **ACCEPT** (solo Europa+vicinato) |
| e | Import elettricità per partner (GWh) | Eurostat `nrg_ti_eh` | 38 | 35 (2024) | 0 | 3 (2013, 2019, …) | 0 | 155 | 2024 | annuale | idem | sì | no | €0 | 2024: 146 archi | **ACCEPT** (solo Europa) |
| f | Import greggio per paese d'origine (kt) | Eurostat `nrg_ti_oil` (`O4100_TOT`) | 32 | 23 (2024) | non misurato | 4 (2019: 2, 2013: 2) | 0 | 161 | 2024 | annuale | idem | sì | no | €0 | 2024: 243 archi, 93 partner | **ACCEPT** (solo Europa) |
| d | Import gas gassoso (pipeline) per partner, HS 271121 | UN Comtrade API *public preview* (https://comtradeapi.un.org/public/v1/preview/C/A/HS) | 103 (2023) | 103 | — | — | unità kg, non m³ | 90 | 2023 (2024 parziale) | continuo | pagina termini solo JS → **non verificata** | non verificata (bulk storicamente limitato) | no per preview (max 500 righe/chiamata; ricevuto HTTP 429 a raffica) | €0 | 2023: 316 archi ONU→ONU; partner = origine dichiarata in dogana | **CONDITIONAL** |
| d | Import GNL per partner, HS 271111 | Comtrade preview | non misurato (risposta troncata a 500 righe) | — | — | — | kg | — | 2023 | — | idem | idem | servirebbero ~190 chiamate per reporter | €0 | — | **CONDITIONAL** |
| d/f/e | Import totali HS 2711 (gas), 2709 (greggio), 2716 (elettricità) partner=Mondo | Comtrade preview | 2711: 156 (2023) / 133 (2024); 2709: 120 / 109; 2716: 96 / 83 | 2023 | — | — | valori in USD e kg | 37–110 | 2024 | — | idem | idem | no (preview) | €0 | copertura reporter in calo sull'anno più recente | **CONDITIONAL** |
| d | Punti di interconnessione gas, LNG, stoccaggi, flussi fisici giornalieri | ENTSOG Transparency Platform API `api/v1/interconnections` (https://transparency.entsog.eu/api/v1/) | 40 paesi (38 ONU + UK, SM ecc.; inclusi DZ, LY, MA, RU, BY, TR, UA) | 2026 | — | — | — | ~153 | giornaliero | continuo | legal notice solo JS → **non verificata** | non verificata | no (risposta HTTP 200 senza chiave) | €0 | 1.186 punti; 128 coppie direzionali paese→paese; 42 punti LNG, 151 stoccaggi | **CONDITIONAL** |
| e | Flussi fisici transfrontalieri elettricità orari | ENTSO-E Transparency Platform API | non misurato | — | — | — | — | — | — | orario | — | — | **sì: token di sicurezza** (risposta `Authentication failed.`) | €0 ma account | — | **REJECT** (richiede account) |
| d | Flussi gas per punto di confine (Gas Trade Flows) | IEA | 31 paesi (pagina IEA) | — | — | — | — | — | M-1 | mensile | "Terms of Use for Non-CC Material" | no/limitata | **account IEA obbligatorio** | €0 | — | **REJECT** |
| e | Mensile generazione/domanda | Ember Monthly (`monthly_full_release_long_format.csv`, 70 MB) | 84 | 34 a 2026-06 | — | 2 (2024-06) | — | 109 | 2026-06 | bimensile | CC BY 4.0 | sì | no | €0 | solo 84 paesi | **CONDITIONAL** (solo se serve granularità mensile) |

## 3. Tabella — impianti come oggetti (FACILITIES)

| DOMAIN | OGGETTO | SOURCE | PAESI ONU COPERTI | CONTEGGI MISURATI | LATEST | LICENSE | REDISTR. | KEY/ACCOUNT | REC. |
|---|---|---|---|---|---|---|---|---|---|
| c | Centrali (tutte le fonti) | WRI GPPD v1.3 (già in NEXUM) | 161 | 34.936 impianti; ≥20 MW: 16.679 (Hydro 3.631, Gas 3.149, Wind 3.137, Solar 2.575, Coal 2.247, Oil 838, Biomass 455, Waste 222, Nuclear 195, Geothermal 134, Storage 28) | dati 2021, congelato | CC BY 4.0 | sì | no | **ACCEPT** (già adottato; mostrare sempre "dati 2021") |
| c | Centrali nucleari (siti) | GPPD | 30 | 195 siti nucleari | 2021 | CC BY 4.0 | sì | no | **ACCEPT** come "siti", non reattori |
| c | Reattori nucleari (unità, stato, MWe) | IAEA PRIS (https://pris.iaea.org → redirect a https://pris-stats.iaea.org/) | non misurato | non misurato (nessun bulk pubblico) | — | termini IAEA generali (da risultato di ricerca, pagina 402/403 in sessione): riuso "provided that appropriate acknowledgement of the IAEA as the source is given"; per PRIS: "the complete data can be accessed and retrieved only by registered users in Member States" e i dati non pubblici "shall not be quoted in any public or international forum without permission" | parziale (solo pagine pubbliche) | dati completi: account registrato | **REFERENCE ONLY** (controllo manuale di conteggi) |
| c | Reattori/centrali nucleari | GEM Global Nuclear Power Tracker | non misurato | non misurato | release ago 2026 (citazione raccomandata) | "freely available under a Creative Commons Attribution 4.0 International Public License unless otherwise noted" | sì | **form con nome + email** per il download | **CONDITIONAL** (solo download manuale deciso dall'utente; vietato invio automatico di identificativi) |
| c | Centrali nucleari (item) | Wikidata SPARQL (Q134447 e sottoclassi, P17) | 53 | 434 item, 55 paesi (USA 98, CHN 48, JPN 35, DEU 30, RUS 26, FRA 26, GBR 25, IND 17) — **include dismesse/pianificate** | live | CC0 | sì | no | **CONDITIONAL** (filtrare per stato P5817; usare per ID e link) |
| c | Solar farm, eolico, idro, gas/carbone/petrolio, bioenergia, geotermia, stoccaggio | GEM trackers (Solar, Wind, Hydro, Coal Plant, Oil & Gas Plant, Bioenergy, Geothermal) | non misurato | Solar tracker: 103.940 fasi (dichiarato da GEM, non misurato) | 2025–2026 | CC BY 4.0, **ma** nel Solar tracker i record con "TZ ID" sono "CC BY-NC 4.0" (TransitionZero) | sì, esclusi i record NC | form nome+email | **CONDITIONAL** (escludere TZ ID; download manuale) |
| c | Impianti per fonte (OSM `power=plant`) | Overpass API (conteggi) | non misurato per paese | totale 163.816 (549 nodi, 144.621 way, 18.646 relation); `plant:source`: solar 110.166, hydro 16.011, wind 11.540, gas 5.937, coal 2.990, nuclear 223 | live (2026-10-03) | ODbL | **share-alike**: un DB derivato pubblicato deve restare ODbL | no | **REFERENCE ONLY** (contaminazione ODbL dello snapshot) |
| d | Gasdotti / terminali GNL | GEM Global Gas Infrastructure Tracker | non misurato | non misurato | — | "Licence: CC BY 4.0"; "Excel workbooks behind a form that asks for a name and email address; there is no public API" (https://lngatlas.org/data-sources/) | sì | form | **CONDITIONAL** |
| d | Gasdotti (geometrie) | OSM `man_made=pipeline` + `substance=gas` | — | 105.826 way (soprattutto distribuzione locale) | live | ODbL | share-alike | no | **REFERENCE ONLY** |
| d | Terminali GNL | OSM `man_made=lng_terminal` | — | **1** elemento: tag praticamente inutilizzato | live | ODbL | — | no | **REJECT** |
| d | Terminali GNL (punti) | ENTSOG `interconnections` (tipo "LNG Terminals") | Europa | 42 punti | live | non verificata | — | no | **CONDITIONAL** |
| c | Dighe/idro (GRanD/GDAT) | — | non misurato | non misurato | — | non verificata | — | — | non misurato |
| f | Raffinerie | OSM `industrial=refinery` | — | non misurato (Overpass in errore per carico) | — | ODbL | share-alike | no | non misurato |
| c | Open Infrastructure Map | (render di OSM) | — | — | — | ODbL (derivato OSM) | share-alike | no | **REFERENCE ONLY** |

## 4. Relazioni NEXUM effettivamente supportate dai dati

| RELAZIONE | FONTE | PAESI / ARCHI MISURATI | PESO / QUOTA DISPONIBILE | VERDETTO |
|---|---|---|---|---|
| COUNTRY → IMPORTS_GAS_FROM → COUNTRY | Eurostat `nrg_ti_gas` | 32 reporter (2024), 185 archi ONU→ONU | sì: quota = partner / `TOTAL` (es. Italia 2024: totale 59.461 mio m³; DZ 23.267, AZ 10.314, QA 6.902, RU 5.696, US 5.187, NO 3.603, NL 2.402, LY 1.407) | supportata **solo per Europa** |
| COUNTRY → IMPORTS_GAS_FROM → COUNTRY (globale, pipeline) | Comtrade HS 271121 (preview) | 103 reporter, 316 archi (2023) | sì, ma in kg/USD (Italia 2024: totale 31,75 Mt; DZA 15,17, AZE 7,39, RUS 3,93, NOR 3,48, LBY 1,02, NLD 0,74) | supportata con condizioni (termini Comtrade da verificare) |
| COUNTRY → IMPORTS_LNG_FROM → COUNTRY | Comtrade HS 271111 | non misurato (troncamento a 500 righe) | — | da misurare |
| COUNTRY → IMPORTS_ELECTRICITY_FROM → COUNTRY | Eurostat `nrg_ti_eh` | 35 reporter (2024), 146 archi | sì (GWh) | supportata **solo per Europa** |
| COUNTRY → NET_ELECTRICITY_IMPORTS (attributo, senza partner) | Ember | 184 paesi (120 con saldo ≠ 0 nel 2024) | saldo TWh | supportata globalmente come attributo, **non come arco** |
| COUNTRY → IMPORTS_CRUDE_FROM → COUNTRY | Eurostat `nrg_ti_oil` | 23 reporter (2024), 243 archi | sì (kt) | solo Europa |
| COUNTRY → IMPORTS_CRUDE_FROM → COUNTRY (globale) | Comtrade HS 2709 | 109–120 reporter (totali); archi non misurati | — | da misurare |
| COUNTRY → CONNECTED_BY → PIPELINE | ENTSOG (punti) | 40 paesi, 128 coppie direzionali | capacità tecnica/flussi per punto | supportata come **punto di interconnessione**, non come oggetto gasdotto con geometria |
| PIPELINE (oggetto con tracciato) → CONNECTS → COUNTRY | GEM GGIT | non misurato | — | solo con download manuale GEM |
| POWER_PLANT → LOCATED_IN → COUNTRY | GPPD | 161 paesi, 16.679 impianti ≥ 20 MW | capacità MW (2021) | supportata (già in NEXUM) |
| REACTOR → PART_OF → NUCLEAR_PLANT | — | nessuna fonte libera bulk misurata | — | **non supportata** |
| COUNTRY → HAS_CAPACITY / GENERATES (per fonte) | Ember, EIA, IRENA | 184 / 185 / 190 | GW e TWh | supportata (attributi, non archi) |
| COUNTRY → EXPORTS_GAS_TO → COUNTRY | speculare dei reporter importatori (mirror) | come sopra | — | derivabile ma non da dichiarazioni dell'esportatore |

## 5. Lacune dati

1. **Partner bilaterali fuori dall'Europa**: l'unica fonte libera globale è UN Comtrade (preview con 500 righe/chiamata, rate-limit 429 osservato, termini non verificati). Nessuna fonte CC BY con import gas/greggio per partner a copertura mondiale.
2. **Reattori nucleari**: nessun bulk aperto e verificato. PRIS = solo pagine web; GEM = form; Wikidata = mescola stati; GPPD = siti al 2021 (30 paesi), mancano impianti avviati dopo il 2021.
3. **Capacità di raffinazione**: EIA INTL non la espone (prodotti raffinati fermi al 2014); JODI dà solo input raffinerie (REFINOBS), non la capacità.
4. **Gasdotti come geometrie**: solo GEM (form) o OSM (ODbL, prevalentemente rete di distribuzione locale).
5. **Microstati**: AND, LIE, MCO, SMR, MHL, PLW assenti in EIA ed Ember; ALB assente in Ember yearly (presente in EIA, IRENA, Eurostat); FSM, TUV assenti in Ember.
6. **Import/export greggio totali EIA** fermi al 2018/2020 → usare JODI Oil (115 paesi ONU nei file 2025–26).
7. **JODI Gas**: solo 77–88 paesi ONU; nessun dettaglio partner.
8. **Ember mensile**: solo 84 paesi.

## 6. Avvertenze metodologiche

- **Capacità ≠ generazione**: GW installati (Ember/EIA/IRENA/GPPD) non indicano energia prodotta; il fattore di capacità varia (solare ~10–25%, nucleare ~80–90%). La UI non deve mai mostrare una quota di mix calcolata dalla capacità come "quota di generazione".
- **Quota ≠ pro capite**: la quota (%) è sulla generazione nazionale; il pro capite richiede la popolazione **dello stesso anno**. Ember 2025 copre 88 paesi, mentre la popolazione WB arriva al 2024: non combinare la generazione 2025 con la popolazione 2024. Ember calcola la domanda pro capite con la propria popolazione; OWID usa UN WPP. Per NEXUM: ricalcolare con un'unica serie di popolazione e lo stesso anno, oppure usare il valore pro capite della fonte senza ricombinarlo.
- **Origine del greggio ≠ origine del carburante alla pompa**: il greggio importato viene raffinato e i prodotti sono commerciati separatamente (HS 2710 ≠ 2709). Mai collegare in NEXUM "carburante italiano ← greggio libico".
- **Partner ≠ origine fisica**: in Eurostat e in Comtrade compaiono hub di transito (NL, DE, BE). L'Italia 2024 riporta 5.696 mio m³ da RU in Eurostat, mentre Comtrade 271121 riporta 3,93 Mt: unità e perimetri diversi (GNL incluso o no).
- **Unità**: Eurostat in mio m³ / TJ GCV; Comtrade in kg e USD; JODI in M3/TJ (gas) e KBD/KBBL/KTONS/KL (petrolio); EIA in bcm, Btu, kb/d. Non sommare fonti diverse.
- **Fonti non indipendenti**: generazione 2024 Ember e EIA confrontate su 147 paesi → **differenza mediana 0,2%** (6 paesi > 15%: KHM, COL, ETH, LTU, LUX, PRY). Ember usa EIA come input per molti paesi: stessa `independence_group` ai fini della corroborazione. Capacità solare 2024 Ember e EIA: 77 coppie, differenza mediana 2,9%, 13 > 15%. OWID è derivato da Ember + EI: non è una terza fonte.
- **Gross vs net**: EIA dichiara "net generation"; Ember mescola definizioni per paese (verificare la metodologia Ember). Colombia: 89,1 TWh (Ember) contro 115,3 TWh (EIA).
- **Valori modellati**: l'accesso all'elettricità WB (193/193) contiene stime modellate; EIA stima per piccoli paesi; i codici JODI 3 = "non valutato".
- **GPPD**: congelato al 2021 → mai presentato come live (già così nel connettore).
- **Licenze a cascata**: OWID CC BY non copre i dati EI; il GEM Solar tracker contiene record CC BY-NC (TZ ID); OSM ODbL è share-alike.

## 7. Comandi riproducibili

```sh
UA="NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)"
## Appendice — Ember (CC BY 4.0)
curl -sSL -A "$UA" -o ember_yearly.csv  https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/yearly_full_release_long_format.csv
curl -sSL -A "$UA" -o ember_monthly.csv https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/monthly_full_release_long_format.csv
## Appendice — EIA International bulk (public domain)
curl -sSL -A "$UA" -o INTL.zip https://api.eia.gov/bulk/INTL.zip
## Appendice — OWID energy
curl -sSL -A "$UA" -o owid_energy.csv https://owid-public.owid.io/data/energy/owid-energy-data.csv
## Appendice — World Bank
curl -sSL -A "$UA" "https://api.worldbank.org/v2/country/all/indicator/EG.ELC.ACCS.ZS?format=json&per_page=20000&date=2000:2025"
## Appendice — IRENASTAT PxWeb (metadati GET, dati POST JSON)
curl -sS -A "$UA" "https://pxweb.irena.org/api/v1/en/IRENASTAT/Power%20Capacity%20and%20Generation/Country_ELECSTAT_2026_H2_PX.px"
## Appendice — Eurostat import per partner
for ds in nrg_ti_gas nrg_ti_eh nrg_ti_oil nrg_ind_id; do
  curl -sS -A "$UA" -o $ds.tsv.gz "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/$ds/?format=TSV&compressed=true"; done
## Appendice — JODI (elenco file gas via API del publisher; petrolio: CSV annuali)
curl -sS -A "$UA" https://api.publisher.jodidata.org/web/files/gas
curl -sSL -A "$UA" -O https://www.jodidata.org/jodi-publisher/gas/27/GAS_world_NewFormat.zip
curl -sSL -A "$UA" -O https://www.jodidata.org/_resources/files/downloads/oil-data/annual-csv/primary/2025.csv
curl -sSL -A "$UA" -O https://www.jodidata.org/_resources/files/downloads/oil-data/annual-csv/primary/primaryyear2026.csv
## Appendice — ENTSOG (senza chiave)
curl -sS -A "$UA" "https://transparency.entsog.eu/api/v1/interconnections?limit=-1"
## Appendice — UN Comtrade public preview (senza chiave; max 500 righe; rispettare il rate limit)
curl -sS -A "$UA" "https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=2023&cmdCode=271121&flowCode=M&includeDesc=true"
## Appendice — GPPD
curl -sS -A "$UA" -O https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv
## Appendice — Wikidata: centrali nucleari per paese (CC0)
## Appendice —   SELECT ?iso (COUNT(DISTINCT ?p) AS ?n) WHERE { ?p wdt:P31/wdt:P279* wd:Q134447 . ?p wdt:P17 ?c . ?c wdt:P298 ?iso } GROUP BY ?iso
## Appendice — Overpass (solo conteggi): [out:json];nwr[power=plant]["plant:source"="nuclear"];out count;
```

Non riuscito / bloccato: ENTSO-E (`Authentication failed.`); termini EI, IRENA, JODI e IAEA (403/402/404); GEM (form); Comtrade (pagina termini solo JS); Overpass per raffinerie e linee AT (timeout del server).

## 8. Volumi stimati per un pacchetto statico

| FILE SORGENTE | GREZZO | GZIP | RIGHE | NOTE |
|---|---|---|---|---|
| Ember yearly (formato lungo) | 49,1 MB | 2,7 MB | 370.784 | sottoinsieme ONU, variabili chiave, 2015+: **57.935 righe, 1,8 MB → 240 KB gz** |
| Ember monthly | 70,3 MB | non misurato | 515.264 | solo se serve il mensile |
| EIA INTL.txt | 128,8 MB | 24,7 MB | 105.082 serie | estrarre ~25 serie annuali × 187 paesi: stima < 1 MB |
| OWID energy | 15,9 MB | 5,2 MB | 23.377 × 130 colonne | ridondante con Ember+EIA |
| GPPD | 12,0 MB | 1,9 MB | 34.936 | già in NEXUM (16.679 ≥ 20 MW) |
| JODI Gas world | 12,9 MB | 1,6 MB | 315.758 | |
| JODI Oil primary 2025 | 11,6 MB | non misurato | non misurato | + 2026: 5,5 MB |
| Eurostat nrg_ti_gas / eh / oil | 204 KB / 82 KB / 2,7 MB (gz) | — | 29.369 / 14.685 / 278.769 | archi 2024: 185 / 146 / 243 |
| ENTSOG interconnections | 1,85 MB JSON | non misurato | 1.186 punti | |
| IRENASTAT (totali ren/non-ren, 4 anni) | 190 KB JSON | — | non misurato | tabella completa: non misurata |

Stima del pacchetto energia per lo snapshot (indicatori paese + archi Europa + impianti GPPD già presenti): **circa 2–4 MB gzip** in più, di cui la quota principale è GPPD (già incluso).

## 9. Raccomandazione sintetica

- **ACCEPT**: Ember yearly (mix di generazione e capacità, domanda, import netti; CC BY 4.0, 184/193); EIA INTL (generazione, capacità per fonte incl. geotermia/pumped storage, gas e petrolio totali; public domain, 185–187/193); WB `EG.ELC.ACCS.ZS` (193/193); Eurostat `nrg_ti_gas`/`nrg_ti_eh`/`nrg_ti_oil` per gli archi bilaterali europei; GPPD (già in NEXUM).
- **CONDITIONAL**: IRENASTAT (termini da verificare), JODI Gas/Oil (termini da verificare), Comtrade preview (termini e limiti), ENTSOG (termini), GEM (solo download manuale deciso dall'utente, esclusi i record NC), Wikidata nucleare (filtrare per stato), OWID (solo la parte derivata da Ember).
- **REFERENCE ONLY**: IAEA PRIS, Energy Institute Statistical Review, OSM/Open Infrastructure Map (ODbL), WB `EG.USE.ELEC.KH.PC`.
- **REJECT**: ENTSO-E (token/account), IEA Gas Trade Flows (account + licenza non-CC), serie EIA congelate (import di greggio al 2018/2020, raffinati al 2014), WB `EG.ELC.RNEW.ZS` (ferma al 2021), OSM `lng_terminal`.

---

<!-- Appendice E-water-conflict -->

## Appendice — NEXUM · Audit fonti E — Acqua · Conflitto e sicurezza

Data audit: 2026-10-03 · modalità: SOLA LETTURA (nessun file del repo modificato; DB aperto con `?mode=ro`).
UA di rete: `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`. Nessun account, nessuna chiave.
Universo: 193 Stati membri ONU (lista ISO3 in `scratchpad/wi/e/un.py`).
Classi di attualità (relative all'anno massimo dell'indicatore = MAX): **GOOD** ≥ MAX−2 · **PARTIAL** MAX−6…MAX−3 ·
**STALE** < MAX−6 · **NO DATA** nessun valore 2000–2026. **NOT COMPARABLE** = valore presente ma stimato/modellato o
metodologicamente non confrontabile tra Paesi (dichiarato in colonna separata, non sottratto dalle altre).

---

## PARTE 1 — ACQUA

### 1.1 Copertura misurata (API World Bank WDI v2 e UN SDG API, interrogate il 2026-10-03)

| DOMINIO | INDICATORE | FONTE | TOTALE (193) | GOOD | PARTIAL | STALE | NOT COMPARABLE | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | CHIAVE/ACCOUNT | COSTO | QUALITÀ | RACCOMANDAZIONE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Acqua potabile | Servizio *safely managed* (% pop.) `SH.H2O.SMDW.ZS` | JMP WHO/UNICEF via WDI | 137 | 135 | 1 | 1 | 0 (ma molte stime JMP modellate) | 56 | 2024 | annuale (WDI agg. 2026-07-13) | CC BY 4.0 (WDI) | sì, con attribuzione | no | €0 | alta, ma lacune su 56 Stati | ADOTTARE con avviso "dato mancante ≠ 0" |
| Acqua potabile | Servizio almeno *basic* (% pop.) `SH.H2O.BASW.ZS` | JMP via WDI | 192 | 183 | 4 | 5 | 0 | 1 | 2024 | annuale | CC BY 4.0 | sì | no | €0 | alta | ADOTTARE (indicatore di base) |
| Igiene/servizi | Sanificazione *safely managed* `SH.STA.SMSS.ZS` | JMP via WDI | 138 | 135 | 2 | 1 | 0 | 55 | 2024 | annuale | CC BY 4.0 | sì | no | €0 | alta, lacune | ADOTTARE con avviso |
| Igiene/servizi | Sanificazione almeno *basic* `SH.STA.BASS.ZS` | JMP via WDI | 192 | 181 | 6 | 5 | 0 | 1 | 2024 | annuale | CC BY 4.0 | sì | no | €0 | alta | ADOTTARE |
| Igiene/servizi | Defecazione all'aperto `SH.STA.ODFC.ZS` | JMP via WDI | 192 | 176 | 6 | 10 | 0 | 1 | 2024 | annuale | CC BY 4.0 | sì | no | €0 | media | OPZIONALE |
| Prelievi | Prelievi d'acqua dolce totali (mld m³) `ER.H2O.FWTL.K3` | FAO AQUASTAT via WDI | 179 | 179 | 0 | 0 | sì (vedi nota A) | 14 | 2022 | WDI riprende AQUASTAT (accesso FAO 2024-05-29) | CC BY 4.0 | sì | no | €0 | media: anni "riportati in avanti" | ADOTTARE solo con anno di osservazione reale |
| Prelievi | Prelievi % risorse interne `ER.H2O.FWTL.ZS` | AQUASTAT via WDI | 175 | 175 | 0 | 0 | sì (A) | 18 | 2022 | idem | CC BY 4.0 | sì | no | €0 | media | OPZIONALE (preferire 6.4.2) |
| Prelievi per uso | Agricoltura / domestico / industria (% prelievo) `ER.H2O.FWAG/FWDM/FWIN.ZS` | AQUASTAT via WDI | 178/178/177 | 178/178/177 | 0 | 0 | sì (A) | 15/15/16 | 2022 | idem | CC BY 4.0 | sì | no | €0 | media | ADOTTARE come "origine della domanda", non come "origine dell'acqua" |
| Risorse | Risorse interne rinnovabili pro capite (m³) `ER.H2O.INTR.PC` | AQUASTAT via WDI | 181 | 181 | 0 | 0 | sì (A, solo il denominatore pop. cambia) | 12 | 2022 | idem | CC BY 4.0 | sì | no | €0 | media-alta (grandezza strutturale) | ADOTTARE |
| Stress idrico | SDG 6.4.2 livello di stress `ER.H2O.FWST.ZS` | AQUASTAT via WDI | 176 | 176 | 0 | 0 | sì (A) | 17 | 2022 | idem | CC BY 4.0 | sì | no | €0 | media | usare la versione SDG API (più recente) |
| Stress idrico | SDG 6.4.2 `ER_H2O_STRESS` | UN SDG Global Database (API senza chiave) | 177 | 177 | 0 | 0 | **170 con Nature=E (stimato), solo 7 C (dato nazionale)** | 16 | 2023 | annuale | dati FAO: CC BY 4.0 (termini DB FAO) | sì, attribuzione FAO | no | €0 | media: per lo più stime FAO | ADOTTARE mostrando il flag "stimato" per ogni Paese |
| Efficienza | SDG 6.4.1 efficienza d'uso (USD/m³) `ER_H2O_WUEYST` | UN SDG API | 181 | 181 | 0 | 0 | 145 E + 1 NA | 12 | 2023 | annuale | CC BY 4.0 (FAO) | sì | no | €0 | bassa-media (dipende da PIL e prezzi) | NON prioritario |
| Acqua potabile | SDG 6.1.1 `SH_H2O_SAFE` | UN SDG API (JMP) | 137 | 135 | 1 | 1 | 137 con Nature=E | 56 | 2024 | annuale | da verificare per JMP (WDI lo ripubblica in CC BY 4.0) | via WDI: sì | no | €0 | come WDI | usare WDI (licenza chiara) |
| Tariffe | Tariffe domestiche acqua/fognatura per utility | IBNET (World Bank) | n.m. | — | — | — | **TUTTO** (vedi nota B) | n.m. | storico: database 2010+, IBNET 1.0 = 401 tariffe | irregolare | Blue Book CC BY 3.0 IGO; database: termini non verificabili | non verificata | piattaforma nuova (newibnet.org) risponde **403** ai client automatici; `ib-net.org` e `ibnet.worldbank.org` = **NXDOMAIN** | €0 dichiarato | bassa per confronti | NON ADOTTARE ora |
| Infrastruttura | Dighe/serbatoi georeferenziati | Global Dam Watch v1.0 (include GRanD+GOODD) | n.m. (globale, puntuale) | — | — | — | — | — | release 2024 | statico | CC BY 4.0 (da letteratura GDW, Sci. Data 2024) | sì | no | €0 | alta per grandi dighe | CANDIDATO (verificare file e licenza al download) |
| Infrastruttura | GRanD v1.3 (7 320 dighe) | GWSP/McGill | — | — | — | — | — | — | v1.3 | statico | **non commerciale, vietata ridistribuzione** senza permesso | **no** | no | €0 | alta | NON ADOTTARE direttamente (passare da GDW/GeoDAR) |
| Infrastruttura | GeoDAR v1.1 | Wang et al. (Zenodo) | — | — | — | — | — | — | 2022 | statico | CC BY 4.0 | sì | no | €0 | alta | CANDIDATO alternativo |
| Infrastruttura | GDAT Global Dam Tracker (31 780 dighe) | Zhang & Gu | — | — | — | — | — | — | 2023 | statico | **CC BY-NC-ND 4.0** | no derivati | no | €0 | alta | NON ADOTTARE (ND incompatibile con normalizzazione) |
| Infrastruttura | Impianti di dissalazione | DesalData (GWI) | — | — | — | — | — | — | — | — | proprietaria | no | account | **a pagamento** | alta | ESCLUSO (€0); nessun dataset globale aperto trovato |

Note:
- **A — "GOOD" ingannevole per AQUASTAT.** In WDI tutti i Paesi coperti risultano con anno 2022: AQUASTAT
  pubblica serie con anni riempiti/stimati; l'anno visualizzato non è l'anno di misura. Nel SDG API 6.4.2, 170 su
  177 valori più recenti sono `Nature=E` (stimati) e solo 7 `C` (dato del Paese). NEXUM deve mostrare "stimato"
  e, ove disponibile, l'anno dell'ultima osservazione nazionale, non dichiarare attualità.
- **B — Tariffe non confrontabili.** IBNET è per *utility* (città), non per Paese; strutture a blocchi crescenti,
  quote fisse, fognatura inclusa/esclusa, IVA, sussidi, valuta e anno diversi; molte utility campionate una volta.
  Una "tariffa nazionale" o una classifica tra Paesi sarebbe metodologicamente scorretta. Al massimo: scheda di una
  singola utility con anno, struttura e consumo di riferimento dichiarato (es. 15 m³/mese) — e solo se la licenza
  del database diventa verificabile.
- **"Origine dell'acqua"** (superficiale/sotterranea/dissalata/riuso): AQUASTAT ha variabili dedicate (es. prelievi
  da acque superficiali e sotterranee, acqua dissalata prodotta), ma con coperture molto più sparse e anni vecchi;
  non misurate qui via API stabile → da trattare come *PARTIAL non quantificato*.
- **Licenza FAO** (verificata su fao.org "Database terms of use"): «All datasets disseminated through FAO corporate
  statistical databases … are licensed under the Creative Commons Attribution-4.0 International licence (CC BY 4.0)»;
  eccezione: dati di terzi inclusi «may not be redistributed or reused without the consent of the original data
  provider» → controllare i metadati per serie. Citazione obbligatoria nel formato FAO indicato. Non è CC BY-NC-SA 3.0
  IGO (quella si applica alle *pubblicazioni* FAO, non ai database statistici).
- La fonte `worldbank.wdi` è già attiva in NEXUM (CC BY 4.0): gli indicatori acqua possono essere aggiunti come
  `observation.official_series` senza nuova fonte né nuova licenza.

---

## PARTE 2 — CONFLITTO E SICUREZZA

### 2.1 Fonti

| DOMINIO | INDICATORE | FONTE | TOTALE (193) | GOOD | PARTIAL | STALE | NOT COMPARABLE | NO DATA | ULTIMA DATA | AGGIORN. | LICENZA | REDISTRIB. | CHIAVE/ACCOUNT | COSTO | QUALITÀ | RACCOMANDAZIONE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Violenza organizzata | Eventi letali georeferenziati (mensile) | UCDP Candidate 26.01–26.06, 26.0.7, 26.0.8 (**già in NEXUM**) | 78 Paesi con ≥1 evento nei file grezzi; 47 nel DB (filtro ≥5 morti) | 47 (dato ≤ 1 mese) | — | — | stato "preliminary"; 698/1 982 con code_status ≠ Clear | 146 senza eventi (= *nessun evento registrato*, non "pace") | evento più recente 2026-08-31 (date_end max 2026-09-10) | mensile, ~20 gg dopo fine mese (26.0.8 pubblicato 2026-09-20) | CC BY 4.0 | sì, citando Sundberg & Melander 2013; Davies et al. | no | €0 | alta, ma preliminare | MANTENERE; base per ROSSO |
| Violenza organizzata | GED annuale 26.1 (1989–2025) | UCDP | globale | — | — | — | definitivo | — | 2025 | annuale | CC BY 4.0 | sì | no | €0 | molto alta | AGGIUNGERE come storico/validazione (sostituisce Candidate a consolidamento) |
| Conflitto/proteste | Eventi ACLED (battaglie, esplosioni, violenza su civili, proteste) | ACLED | globale | — | — | — | — | — | quasi tempo reale | settimanale | EULA proprietaria | **no** (vedi citazioni) | **sì**: account myACLED + email/password OAuth; API solo con email istituzionale su richiesta | €0 non commerciale; commerciale = licenza corporate | alta | NON ADOTTARE |
| Media/eventi | GDELT 2.0 Events (CAMEO 18–20) | GDELT Project | globale | — | — | — | **TUTTO** (codifica automatica da notizie) | — | ogni 15 min (`lastupdate.txt` risponde 200) | 15 min | uso libero con citazione | sì | no | €0 | **bassa** per "attività violenta documentata": duplicati, geocodifica al centroide, eventi riportati ≠ avvenuti | NON per zone; al più contesto testuale separato |
| Terrorismo | Global Terrorism Database | START / UMD | globale | — | — | **sì: dati 1970–2020 + gen–giu 2021** | — | — | 2021-06 | fermo | EULA: solo ricerca non commerciale; vietato «publicly post or display the data» senza permesso scritto (eccetto analisi/visualizzazioni) | **no** | modulo di download | €0 non comm. | alta ma ferma | NON ADOTTARE |
| Conflitto aggregato | HDX HAPI `coordination-context/conflict-events` | OCHA HDX (dati ACLED aggregati) | ~paesi HRP | — | — | — | — | — | mensile | mensile | eredita termini ACLED | non chiara | **app_identifier obbligatorio** = base64(nome app + **email**) → in conflitto con la regola "nessun identificatore personale in uscita"; senza: `{"error":"Invalid app identifier"}` | €0 | media | NON ADOTTARE |
| Rapporti umanitari | ReliefWeb API v2 | OCHA | — | — | — | — | testo, non eventi | — | quotidiano | continuo | per documento | variabile | **appname pre-approvato**: senza → HTTP 403 "You are not using an approved appname" | €0 | contesto, non misura | NON per zone |
| Conflitto armato | IISS Armed Conflict Database, Janes ecc. | IISS ecc. | — | — | — | — | — | — | — | — | proprietaria | no | abbonamento | **a pagamento** | alta | ESCLUSO (€0) |

**ACLED — citazioni verbatim (EULA, acleddata.com/eula):**
- §1.2 «Commercial entities may not access or use the Content and/or Platforms without first obtaining a corporate license.»
- §3.1 «Licensee may only publish or distribute materials incorporating ACLED's data where such materials are transformative in nature and do not allow reverse engineering of the underlying dataset.»
- §3.1 «It is not sufficient for Licensed Content to simply be supplemented, appended, excerpted, reorganized, or made available through Licensee's own dashboard.»
- §10: divieto di usare i contenuti «to develop, train, support, or assist in the development of any product or service that is competitive with Licensor's products or services, including but not limited to datasets, APIs, or software tools.»
→ Uno snapshot statico con eventi puntuali e catena "PERCHÉ?" fino al record sarebbe proprio la ridistribuzione
"reorganized … through Licensee's own dashboard" esclusa; in più serve un account personale. Incompatibile.

### 2.2 Cosa contiene oggi il DB locale (misure reali, `data/live/nexum.db`, sola lettura)

| Misura | Valore |
|---|---|
| Eventi `conflict.violence_event` nel DB | **1 982** (fonte `ucdp.candidate`, tutti `status=preliminary`) |
| Righe grezze UCDP nei 3 file (id univoci) | 13 659; best ≥ 1: 12 110; best = 0: 1 549; best ≥ 5: 1 982 → il filtro `MIN_DEATHS=5` scarta l'**85,5 %** |
| Intervallo date (start) | 2026-01-01 → **2026-08-31** (date_end max 2026-09-10) |
| Eventi per mese (DB) | gen 264 · feb 208 · mar 303 · apr 264 · mag 270 · giu 198 · lug 244 · ago 231 |
| Tipo di violenza (DB) | 1 stato-vs-gruppo armato: 1 436 (81 561 morti best) · 2 non statale: 226 (2 906) · 3 contro civili: 320 (24 423) |
| Paesi con ≥1 evento — ultimi 30 gg dei dati | **30** (≥3 eventi: 14; ≥10: 8) — Pakistan 42, Nigeria 38, Yemen 26, Ucraina 22, Etiopia 16, Sudan 15, RD Congo 11, Somalia 10 |
| Paesi con ≥1 evento — ultimi 90 gg | **37** (≥3: 27; ≥10: 14) |
| Paesi con ≥1 evento — "365 gg" (= tutti i dati, solo 8 mesi) | **47** (≥3: 36; ≥10: 27); tutti e 47 sono Stati membri ONU |
| Unità admin-1 con ≥1 evento (≥5 morti) | 30 gg: 83 (≥3 eventi: 23) · 90 gg: 146 (≥3: 54) · intero periodo: 267 |
| Celle PRIO-GRID 0,5° con ≥1 evento | 30 gg: 164 · 90 gg: 381 · intero periodo: 844 |
| `where_prec` (DB) | 1 esatto: 719 · 2 entro 25 km: 551 · 3 admin-2: 384 · 4 admin-1: 139 · 5 area/linea (anche confini): 148 · 6 solo Paese: 40 · 7 acque/spazio aereo internaz.: 1 |
| `date_prec` (best ≥5, grezzi) | 1 giorno: 1 538 · 2–5 (intervalli fino a mese/anno): 444 |
| `event_clarity=2` (ambiguo) | 267 su 1 982 |
| `code_status` ≠ Clear | 698 (Check dyad 338, Check deaths 142, Check geography 80, Check type 58, Check vague/biased source 25, …) |
| Distanza da confine terrestre internazionale (≤50 km) | **605 / 1 960** eventi geolocalizzati in un poligono (30,9 %): ≤10 km 153 · 10–25 km 174 · 25–50 km 278; >50 km 1 355; 22 fuori dai poligoni (costa/mare) |
| — di cui con `where_prec` 1–2 (posizione affidabile) | 441 |
| — Paesi (poligono NE) con più eventi ≤50 km dal confine | Nigeria 88, Libano 87, Pakistan 83, RD Congo 59, Burkina Faso 36, Palestina (poligono NE) 32, Sudan 31, Niger 30, Ucraina 23, Haiti 16, Mali 16 |
| Attribuzione transfrontaliera nativa UCDP | sì: `gwnoa`/`gwnob` (codici Gleditsch-Ward degli attori statali) + `country_id` del luogo. Tipo 1 con attore statale fuori dal proprio territorio: 2 769 grezzi, **298 con ≥5 morti** (Russia→Ucraina 182, Israele→Libano 89, Afghanistan→Pakistan 5, Pakistan→Afghanistan 3, Nigeria→Ciad 3, Iran→Iraq 3, Iran→Libano 2, …) |
| Questi campi sono nel DB? | **No**: il connettore conserva `side_a/side_b/country_name` ma scarta `gwnoa`, `gwnob`, `country_id`, `priogrid_gid`, `event_clarity`, `date_prec` |

Metodo distanza: poligoni `place.country` (Natural Earth, 242 oggetti) nel DB; Paese ospite = point-in-polygon;
vicini terrestri = poligoni che condividono vertici (arrotondati a 0,01°; 326 coppie, 79 territori senza vicini);
distanza = minimo punto–segmento verso i poligoni vicini in proiezione equirettangolare locale. Errore atteso
qualche km (scala dei poligoni). Per `where_prec` ≥ 4 la distanza è priva di significato (coordinate = centroide
di admin-1/Paese) e va esclusa da qualsiasi regola di confine.

### 2.3 Fattibilità della semantica di zona proposta

**Unità spaziale raccomandata: admin-1** (UCDP fornisce `adm_1` per 1 918/1 982 eventi) per la visualizzazione,
con eventi puntuali mostrati sopra. Le celle PRIO-GRID (0,5°, `priogrid_gid` già nei file) sono più neutre
politicamente ma meno leggibili; buffer circolari attorno ai punti suggeriscono una precisione inesistente per
`where_prec` ≥ 3 (≈ 37 % degli eventi). Paese intero: **mai** rosso per un singolo evento.

**ROSSO — attività violenta documentata (admin-1, finestra 90 giorni, nessuna previsione):**
- R1: ≥ 3 eventi UCDP distinti (best ≥ 1, date_prec ≤ 2, where_prec ≤ 4) nell'admin-1 negli ultimi 90 giorni
  dalla data dell'ultimo evento del dataset; **oppure**
- R2: ≥ 25 morti (somma `best`) nell'admin-1 negli ultimi 90 giorni, con almeno 2 eventi.
- Esclusi dal conteggio: `event_clarity=2`, `code_status ∈ {Check vague or biased source}`; eventi `where_prec`
  5–7 mostrati ma non colorano aree.
- Decadenza: la zona torna neutra se nessun evento nei 90 giorni (dichiarare "ultimo evento: data").
- Ordine di grandezza con i dati attuali (filtro ≥5 morti, quindi sottostima): 54 admin-1 con ≥3 eventi in 90 gg.
  Il filtro `MIN_DEATHS=5` va abbassato a 1 per R1 (altrimenti si perde l'85 % degli eventi letali).

**ARANCIONE — esposizione/spillover documentato (mai sola prossimità):**
- O1 (attribuzione esplicita): admin-1 dove UCDP registra ≥ 1 evento tipo 1 con attore statale estero
  (`gwnoa` ≠ `country_id` del luogo) negli ultimi 90 giorni **e** non già ROSSO → "attacchi transfrontalieri".
  Attenzione: Russia→Ucraina è conflitto interstatale con occupazione, non "spillover": etichettare
  "attore statale estero", non "sconfinamento".
- O2 (ripetizione presso confine): admin-1 confinante con un admin-1 ROSSO di un **altro** Stato **e** con
  ≥ 2 eventi propri (qualsiasi tipo, where_prec ≤ 2) entro 50 km dal confine in 90 giorni.
- Prossimità da sola (vicino a zona rossa senza eventi propri) = nessun colore. Nessuna regola basata su notizie,
  dichiarazioni o "presenza di attori armati" senza eventi registrati: UCDP non fornisce la presenza di attori
  senza vittime.

**Catena "PERCHÉ?" (provenienza):**
`ZONA (admin-1, colore, finestra, data riferimento) → INDICATORE (regola R1/R2/O1/O2 con soglie e valori
calcolati, es. "4 eventi, 31 morti in 90 gg") → EVENTI (id `ucdp_ged`, data, tipo 1/2/3, morti best/low/high,
where_prec, side_a/side_b) → RECORD (raw_id, file `GEDEvent_v26_0_8.csv`, `row:n`, sha256, fetched_at) →
FONTE (ucdp.candidate, CC BY 4.0, citazione, status preliminary)`. Già quasi tutto disponibile nelle tabelle
`event`, `provenance`, `raw_record`; mancano i campi indicati sopra (`gwnoa`, `gwnob`, `country_id`,
`event_clarity`, `date_prec`, `priogrid_gid`) — tutti privi di dati personali.

### 2.4 Cosa NON si può fare onestamente con i dati disponibili
1. **Missili/droni/bombardamenti senza vittime**: UCDP registra solo eventi con ≥1 morto in conflitti/diadi
   riconosciuti; un attacco con droni senza morti non esiste nei dati. Il ROSSO va definito "violenza letale
   organizzata documentata", non "qualsiasi attività militare".
2. **Terrorismo come categoria distinta**: UCDP non ha un'etichetta "terrorismo" (rientra in tipo 3 o 1); GTD è
   fermo al 2021 e non ridistribuibile. Non dichiarare "terrorismo documentato".
3. **Proteste/disordini**: UCDP Candidate non le include (le proteste violente sono in dataset separati); ACLED le ha
   ma non è utilizzabile. Bene: coerente con "mai protesta = guerra".
4. **Tempo reale**: ritardo strutturale 3–7 settimane (oggi 2026-10-03 l'ultimo evento è del 2026-08-31;
   settembre arriverà con 26.0.9 attorno al 20 ottobre). Ogni zona deve mostrare "dati fino al …".
5. **Criminalità organizzata** (Messico, Ecuador, Haiti): copertura parziale e diadi da verificare (1 evento in
   Messico ≥5 morti); assenza di evento ≠ sicurezza.
6. **Validità a lungo termine**: con solo 8 mesi nel DB, la finestra "365 giorni" non è calcolabile; servirebbe
   GED 26.1 per lo storico.
7. **Previsione/rischio**: esclusa per scelta; nessun dato giustifica "zona a rischio".
8. **Attribuzione transfrontaliera tra attori non statali** (es. gruppi jihadisti nel Sahel tra Mali/Burkina/Niger):
   `gwnoa/gwnob` coprono solo attori statali; per i non statali solo la prossimità — quindi O1 non si applica, O2 sì.
9. **Confini contesi** (Palestina/Israele, Kashmir, Sahara occidentale): il poligono NE non è un'autorità; il calcolo
   distanze dipende dalla scelta dei poligoni (32 eventi UCDP "Israel" cadono nel poligono NE "Palestine").

### 2.5 Lacune dati (sintesi)
- Acqua: 56 Stati senza *safely managed drinking water*; 6.4.2 quasi tutto stimato; tariffe non confrontabili e
  fonte IBNET non raggiungibile automaticamente; nessuna base aperta per dissalazione; dighe: solo GDW/GeoDAR
  (CC BY 4.0) ridistribuibili, GRanD e GDAT no.
- Conflitto: unica fonte compatibile = UCDP; tutto il resto è chiuso (ACLED, GTD, IISS), richiede identificatori
  personali (HAPI) o approvazione (ReliefWeb), oppure è inaffidabile per "documentato" (GDELT).

---

## Comandi riproducibili
```sh
DB="file:data/live/nexum.db?mode=ro"
sqlite3 "$DB" "select count(*),min(date(t_start_ms/1000,'unixepoch')),max(date(t_start_ms/1000,'unixepoch')) from event where type='conflict.violence_event'"
sqlite3 "$DB" "select json_extract(props_json,'$.where_precision'),count(*) from event where type='conflict.violence_event' group by 1"
sqlite3 "$DB" "select json_extract(props_json,'$.violence_type'),count(*),sum(json_extract(props_json,'$.deaths_best')) from event where type='conflict.violence_event' group by 1"
sqlite3 "$DB" "select raw_id,path,last_modified from raw_record where source_id='ucdp.candidate'"
## Appendice — finestre 30/90 gg, distanze dai confini, cross-border gwnoa (legge DB e file grezzi gz in sola lettura):
python3 <LOCAL_PATH>/scratchpad/wi/ucdp_audit.py
## Appendice — copertura WDI acqua sui 193 (API World Bank, senza chiave):
cd .../scratchpad/wi/e && python3 wbw.py
## Appendice — UN SDG API (senza chiave) + mappa M49→ISO3 dalla pagina UNSD M49:
curl -A "NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)" "https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode=ER_H2O_STRESS&pageSize=100000" -o sdg_ER_H2O_STRESS.json
python3 sdg.py      # GOOD/PARTIAL/STALE/NO + conteggio Nature (E/C)
## Appendice — Prove di accesso: HAPI senza app_identifier → "Invalid app identifier"; ReliefWeb v2 → 403 appname non approvato;
## Appendice — host IBNET storici → NXDOMAIN; newibnet.org → 403.
```

---

<!-- Appendice F-webcams-parma -->

## Appendice — F — Audit webcam pubbliche: dataset NEXUM, copertura mondiale, test golden Parma

Data audit: 2026-10-03 (circa 19:35–19:55 UTC). Modalità: SOLA LETTURA. Nessun file del repo modificato.
DB letto con `sqlite3 "file:data/live/nexum.db?mode=ro"`. Tutte le richieste di rete con
User-Agent `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)`; nessun dato personale inviato.
Campionamento: 40 telecamere casuali per fonte (seed 42) + 12 telecamere `in_service=false`.
Le poche immagini scaricate per un controllo visivo (8 file) sono state cancellate subito dopo.
Limite: il budget WebSearch della sessione era esaurito; la ricerca è stata fatta con richieste dirette
(curl/WebFetch) a siti noti. Dove un dato non è stato controllato è scritto "non verificato".

---

## PARTE 1 — Dataset esistente (6.626 `camera.public_webcam`)

Conteggio nel DB per fonte: caltrans.cctv 3.591 (196 `in_service=false`), usgs.nims 1.121,
drivebc.webcams 1.045 (15 `in_service=false`), fintraffic.weathercam 809, avo.webcams 60.
Allowlist `img-src` attuale (`ui/media-hosts.json`): cwwp2.dot.ca.gov, weathercam.digitraffic.fi,
www.drivebc.ca, usgs-nims-images.s3.amazonaws.com, avo.alaska.edu.

Nessuna delle 5 fonti offre una diretta video (LIVE_STREAM) tramite gli URL che NEXUM ha in archivio: sono tutte
immagini JPEG statiche che la fonte aggiorna periodicamente (snapshot).

### Risultati per fonte (n=40 casuali ciascuna)

| Fonte | CURRENT_SNAPSHOT | OFFLINE (segnaposto o immagine vecchia) | DEAD | UNKNOWN | Note sugli header |
|---|---|---|---|---|---|
| caltrans.cctv | 33 (82,5%) | 7 (17,5%) – segnaposto "Temporarily Unavailable" | 0 | 0 | 200 image/jpeg, ACAO `*`, Last-Modified ≈ ora |
| drivebc.webcams | 40 (100%) | 0 | 0 | 0 | 200 image/jpeg, ACAO `*`, CORP `cross-origin`, nessun Last-Modified (`cache-control: no-cache`) |
| fintraffic.weathercam | 39 (97,5%) | 0 | 0 | 1 (2,5%) – JPEG troncato | 200 image/jpeg, ACAO `*`, età < 7 min |
| usgs.nims | 29 (72,5%) – di cui 25 entro 1 h, 4 entro 26 h | 10 (25%) – fermi da 14 giorni fino a 3 anni | 1 (2,5%) – 404 | 0 | 200 image/jpeg; nessun header ACAO (irrilevante per `<img>`) |
| avo.webcams | 36 (90%) – entro ~4,5 h | 3 (7,5%) – fermi da 81 a 427 giorni | 1 (2,5%) | 0 | 200 image/jpeg, ACAO `*` |

Stima ponderata sull'intero dataset: circa **5.500 telecamere su 6.626 (~83%) mostrano un'immagine attuale**.
Il calcolo: Caltrans 0,825×3.395 in servizio + 0 delle 196 fuori servizio; le altre fonti usano le percentuali della tabella.

### Evidenze specifiche

- **Caltrans: segnaposti che rispondono 200.** Le immagini "Temporarily Unavailable" e "Down for Construction"
  restituiscono `200 image/jpeg` di 13–16 KB. Hanno timestamp e Last-Modified aggiornati, quindi controllare solo
  lo status HTTP non basta. Le ho riconosciute misurando quanta parte dell'immagine è bianca (0,87–0,91 contro
  meno di 0,1 per le immagini reali) e poi guardandole.
  Tutte le 11 telecamere Caltrans `in_service=false` campionate mostrano un segnaposto: `in_service` è affidabile.
  Il 17,5% delle `in_service=true` mostra comunque un segnaposto.
- **Caltrans: `image_observed_at` non indica l'ora dell'immagine.** Il connettore usa `recordTimestamp`
  (`connectors/caltrans_cctv.py:32`), che vale dal 2016 al 2026. Telecamere con valore "2019"
  (es. `ker46atrte33`) servono in realtà un fotogramma di oggi, con sovraimpressione "Saturday, October 03, 2026 12:38:10 PDT"
  e EXIF datetime corrente. La data mostrata all'utente sarebbe quindi fuorviante (è la data del record, non dell'immagine).
- **DriveBC:** anche la telecamera `in_service=false` 772 mostra un fotogramma reale (sovraimpressione 12:03:05 PDT,
  scaricata alle 12:39 PDT, quindi circa 36 minuti di ritardo).
- **Fintraffic:** `C1054901.jpg` risponde 200 con `content-length` 215.541, ma il JPEG è troncato
  ("broken data stream"). Il problema si è ripetuto due volte.
- **USGS NIMS:** il 25% delle immagini `_newest.jpg` è fermo da tempo (es. `WI_RS1_STAFF` 2023-10-02,
  `MA_West_Brook_RISE` 2024-11-24, `LA_Bayou_Grosse_Tete` 2024-05-08). Il campo `image_observed_at` nel DB
  riporta già correttamente queste date. Una telecamera dà 404 (`NY_Panther_Kill_..._Phoenicia`, `application/xml` S3).
- **AVO:** `yvoBiscuit/current.jpg` risponde `200 image/jpeg` ma il corpo è una pagina HTML "404 Not Found" di 315 byte
  (DEAD mascherato). Fermi: `spurr_ckt` (2025-08-02), `iliamna_nnl` (2025-11-04), `aniakchak_pth` (2026-07-14).
  Al primo passaggio Python sono falliti 34 TLS e 4 timeout. Era un problema locale (certificati Python su macOS)
  più una certa lentezza del server: ripetendo con curl a 1 s di distanza tutte le 40 hanno risposto 200.
  Conviene mantenere un ritmo prudente.
- **Fotogrammi grigi uniformi** (AVO redoubt, katmai_kabu) sono nebbia o nuvole, non segnaposti: verificato a vista
  ("Redoubt-RDJH-Cam 2026-10-03 11:01:46 AKST").

### Raccomandazioni (solo proposte, nessuna modifica fatta)

1. Caltrans: non mostrare `recordTimestamp` come "osservato alle". Meglio "aggiornata ogni ~15 min (data del fotogramma
   nella sovraimpressione)".
2. NIMS/AVO: marcare come "non aggiornata" una telecamera con `image_observed_at` più vecchio di 7 giorni
   (circa il 25% di NIMS) e non proporre l'anteprima.
3. Caltrans: avvisare nella UI che "l'immagine può essere un cartello di non disponibilità". Il browser non può
   riconoscerla senza leggere i pixel, e serve CORS: ACAO `*` c'è, ma NEXUM non deve fare altro oltre a mostrare `<img>`.
4. Per AVO e NIMS non è possibile fidarsi del solo status 200.

---

## PARTE 2 — Copertura mondiale delle fonti webcam

Significato delle colonne: KEY = serve una chiave; HOTLINK = verificato richiedendo l'immagine con
`Referer: https://example.pages.dev/`; img-src = host da aggiungere all'allowlist.
"Verificato" = risposta HTTP osservata oggi; il resto è "non verificato".

| Paese | Fornitore | Tipo | N. | Formato/API | KEY | Licenza/termini | Hotlink | img-src | Freschezza | Raccomandazione |
|---|---|---|---|---|---|---|---|---|---|---|
| USA (CA) | Caltrans CWWP2 | snapshot | 3.591 | JSON/XML statico | no | in uso (registro NEXUM) | sì (ACAO *) | cwwp2.dot.ca.gov | ~minuti | ACCEPT (già presente) |
| USA | USGS NIMS | snapshot | 1.121 | JSON S3 | no | pubblico dominio USGS | sì | usgs-nims-images.s3.amazonaws.com | 15 min–24 h; 25% fermo | ACCEPT + filtro età |
| USA (AK) | AVO | snapshot | 60 | ashcam-api JSON | no | USGS/UAF | sì (ACAO *) | avo.alaska.edu | ≤ 1 h tipico | ACCEPT (già presente) |
| Canada (BC) | DriveBC | snapshot | 1.045 | JSON | no | OGL-BC (credit nel DB) | sì, CORP cross-origin | www.drivebc.ca | ~15–40 min | ACCEPT (già presente) |
| Finlandia | Fintraffic Digitraffic | snapshot | 809 | REST JSON | no | CC BY 4.0 | sì | weathercam.digitraffic.fi | ≤ 10 min | ACCEPT (già presente) |
| Regno Unito (Londra) | TfL JamCams | snapshot JPG + clip MP4 | 890 (verificato) | `api.tfl.gov.uk/Place/Type/JamCam`, risponde senza chiave | no per uso basso; i termini parlano di registrazione | "worldwide, royalty-free, perpetual, non-exclusive Licence"; attribuzione "Powered by TfL Open Data" ([termini](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service)) | sì (200 con referer esterno; S3) | s3-eu-west-1.amazonaws.com (host S3 condiviso, da valutare) | LM ~3 min | CANDIDATE ACCEPT (chiarire l'obbligo di registrazione) |
| Cina (Hong Kong SAR) | Transport Dept / DATA.GOV.HK | snapshot | 1.013 chiavi nell'XML | XML statico | no | "browse, download, distribute, reproduce, hyperlink to ... commercial and non-commercial ... free-of-charge" + attribuzione ([termini](https://data.gov.hk/en/terms-and-conditions)) | sì (ACAO *) | tdcctv.data.one.gov.hk | LM ~1 min, s-maxage 60 | CANDIDATE ACCEPT |
| Singapore | LTA via data.gov.sg | snapshot | **8** oggi (API v1 "healthy", ma solo 8 telecamere) | REST JSON; URL immagine con UUID che cambia a ogni scatto | no | Singapore Open Data Licence: "use, access, download, copy, distribute..." + notice e link alla licenza | sì, però `content-type: application/octet-stream` + nosniff (resa in `<img>` non verificata) | images.data.gov.sg | ~1 min | REVIEW (copertura ridotta; servirebbe chiamare l'API al click → connect-src) |
| Nuova Zelanda | NZTA / trafficnz.info | snapshot | 313 (61 offline) | REST XML | no (verificato) | non verificato (pagina InfoConnect vuota via fetch) | sì | trafficnz.info | LM ~1 min | REVIEW licenza |
| Islanda | Vegagerðin | snapshot | 496 | JSON `gagnaveita.vegagerdin.is` | no (verificato) | non verificato | sì | www.vegagerdin.is | LM ~1 min | REVIEW licenza |
| Canada ON/AB/NS/NB | 511 (piattaforma IBI) | snapshot | n.d. | `/api/v2/get/cameras` → "Invalid Key" (verificato) | **sì** | non verificato | – | – | – | REJECT (chiave) |
| USA GA, AZ | 511GA, AZ511 | snapshot | n.d. | "Invalid Key" (verificato) | **sì** | – | – | – | – | REJECT (chiave) |
| USA OH | OHGO | snapshot | n.d. | "API key required." (verificato) | **sì** | – | – | – | – | REJECT |
| USA WA | WSDOT | snapshot | n.d. | 401 "access code missing" (verificato) | **sì** (gratuita) | – | – | – | – | REJECT (chiave) |
| USA NY | 511NY | snapshot/stream | n.d. | endpoint senza chiave restituisce HTML (verificato) | sì (secondo la documentazione, non verificato) | – | – | – | – | REJECT |
| USA UT | UDOT | snapshot | n.d. | 403 (verificato) | probabile chiave | – | – | – | – | REJECT |
| Australia NSW | Transport for NSW | snapshot | n.d. | 401 "unauthenticated" (verificato) | **sì** | – | – | – | – | REJECT |
| Australia QLD | QLDTraffic | snapshot | n.d. | 401 "Unauthorized" (verificato) | **sì** | – | – | – | – | REJECT |
| Norvegia | Statens vegvesen | snapshot | n.d. | DATEX 401 (verificato); il portale webkamera è una SPA | registrazione | NLOD (non verificato) | non verificato | – | – | REJECT finché serve registrazione |
| Germania | Autobahn GmbH API | – | **0** | `services/webcam` → `{"webcam":[]}` su A7 e A9 (verificato) | no | dl-de/by-2-0 (non verificato) | – | – | – | NON UTILE (nessuna webcam pubblicata) |
| Spagna | DGT | snapshot | n.d. | l'URL immagine provato restituisce una SPA HTML (verificato) | non verificato | non verificato | – | – | – | non verificato |
| Québec | Québec 511 | snapshot | n.d. | 403 sul feed RSS provato (verificato) | – | non verificato | – | – | – | non verificato |
| Taiwan | Freeway Bureau tisvcloud | MJPEG/snapshot | n.d. | timeout (verificato) | – | non verificato | – | – | – | non verificato |
| Irlanda | TII | – | n.d. | il portale data.tii.ie è HTML | – | non verificato | – | – | – | non verificato |
| Giappone | JMA vulcani | snapshot | n.d. | pagina bosai/volcano 200; URL delle immagini non individuati | – | non verificato | – | – | – | non verificato |
| Italia | INGV-OE (Etna) | snapshot | n.d. | URL provato → 404 | – | non verificato | – | – | – | non verificato |
| Mondo | Windy Webcams API | snapshot/timelapse | molte | REST | **sì** (`x-windy-api-key`) | "Link every image with either our webcam page or timelapse player"; token immagine "10 minutes for the free API tier" | solo URL con token | – | – | REJECT (chiave + token a scadenza) |
| Mondo | SkylineWebcams | stream HLS | molte | HLS con token di sessione | – | "non può scaricare, estrapolare ... né per fini commerciali, né per uso personale" (vedi Parte 3) | **no** (anti-hotlink tramite Referer) | – | – | LINK ONLY |
| Mondo | EarthCam, Webcamtaxi | stream/embed | – | – | – | termini EarthCam non raggiunti (404/redirect); Webcamtaxi 403 | – | – | – | REFERENCE ONLY (non verificato) |

Paesi non indagati per mancanza di ricerca web: Danimarca, Svezia (Trafikverket: chiave secondo la
documentazione, non verificato), Svizzera, Austria (ASFINAG), Paesi Bassi, Francia (Bison Futé),
Italia (ANAS/Autostrade), Corea, Thailandia, Brasile, Cile, Sudafrica. Per tutti: **non verificato**.

### Conteggio dei paesi ONU con almeno una webcam pubblica di fonte ACCEPT

- **Oggi in NEXUM: 3 paesi su 193** (Stati Uniti, Canada, Finlandia) = 1,6%.
- **Con i candidati verificati tecnicamente e con licenza aperta già citata** (TfL → Regno Unito; DATA.GOV.HK → Cina;
  data.gov.sg → Singapore): **6 su 193** (3,1%).
- **Se si chiarisce anche la licenza di NZ e Islanda: al massimo 8 su 193** (4,1%).
- Non posso indicare altri paesi con evidenza. Le fonti "mondiali" (Windy, Skyline, EarthCam) non sono ACCEPT
  secondo le regole NEXUM, quindi non contano.

---

## PARTE 3 — TEST GOLDEN: Parma, Piazza Garibaldi / Palazzo del Governatore

### Telecamera trovata

- **Fornitore della diretta:** SkylineWebcams (VisioRay). Pagina originale:
  https://www.skylinewebcams.com/it/webcam/italia/emilia-romagna/parma/piazza-garibaldi.html
  (`<title>【LIVE】 Webcam Parma - Piazza Garibaldi | SkylineWebcams</title>`; meta description:
  "...mentre ammiri il Palazzo del Governatore"). ID interno telecamera: **722**.
- **Proprietario/ospitante della telecamera:** Comune di Parma. Il link "Webcam host" della pagina Skyline
  decodificato in base64 dà `722|0|https://www.comune.parma.it/`.
- **Pagina del Comune:** https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi
  ("Cosa succede all'ombra di Garibaldi: guarda la Piazza in tempo reale", ultimo aggiornamento 18-06-2024).
  Contiene un `<iframe src="https://www.skylinewebcams.com/...piazza-garibaldi.html?w=722">` e un link
  "Se non visualizzi correttamente la webcam clicca qui" verso Skyline.
- **Contenuto verificato a vista:** la miniatura `live722.jpg` delle 19:44 UTC (21:44 locali) mostra di notte la piazza
  e la facciata del Palazzo del Governatore con la torre dell'orologio. Immagine cancellata subito dopo il controllo.
- **Coordinate (OSM Nominatim, verificate):** Piazza Giuseppe Garibaldi 44.80148 N, 10.32798 E;
  Palazzo del Governatore (Piazza Garibaldi 19) 44.80186 N, 10.32805 E. Il valore atteso (44.8015, 10.3280) è
  **confermato**. La telecamera guarda verso nord il Palazzo del Governatore, quindi è probabilmente sul lato sud
  della piazza (Palazzo Municipale). La posizione esatta è **non verificata**.

### Tipo di flusso e freschezza

- **Diretta HLS.** La pagina carica Clappr con `source:'livee.m3u8?a=<PHPSESSID>'`. Il player
  (`playerj.js`) la riscrive in `https://hd-auth.skylinewebcams.com/live.m3u8?a=<sessione>`.
  La playlist osservata ha `#EXT-X-TARGETDURATION:4`, segmenti `.ts` da 4 s su `hddn55.skylinewebcams.com`,
  e il segmento più recente aveva un Last-Modified di 12 s prima: ritardo di circa 10–20 s.
  **Senza token** `live.m3u8` restituisce `text/html` invece della playlist. Il token è il cookie di sessione PHP
  della pagina.
- **Miniatura `https://cdn.skylinewebcams.com/live722.jpg`:** 344×193, `cache-control: public, max-age=1080`.
  Last-Modified 19:44:13, poi 19:48:13: si aggiorna circa ogni **4 minuti**.
- **Poster `_722.jpg`:** Last-Modified 13:02 UTC, max-age 43200 (non utile come anteprima).

### Header osservati (prove)

| Richiesta | Risultato |
|---|---|
| Pagina Skyline | `200`, `x-frame-options: SAMEORIGIN`, `set-cookie: PHPSESSID=…`, contiene AdSense |
| `live722.jpg` senza Referer | `200 image/jpeg 11347 B` |
| `live722.jpg` con Referer skylinewebcams.com | `200 image/jpeg 11347 B` |
| `live722.jpg` con Referer `https://example.pages.dev/`, `https://nexum.pages.dev/`, `http://localhost:5173/` | `200 text/html 117 B` → **anti-hotlink** |
| `_722.jpg` con Referer esterno | `200`, 117 B (bloccato) |
| `live.m3u8?a=<sessione>` | `200 application/x-mpegURL`, `access-control-allow-origin: *`, `x-frame-options: DENY`, no-store |
| `live.m3u8` senza token | `200 text/html` (niente playlist) |
| Iframe `…piazza-garibaldi.html?w=722`, nessun Referer | `301` → pagina normale con `X-Frame-Options: SAMEORIGIN` |
| Iframe `?w=722` con Referer `https://example.pages.dev/` | `200`, pagina "SkylineWebcams Live Cam (Authorization Denied) – example.pages.dev not Autorized!" |
| Iframe `?w=722` con Referer `https://www.comune.parma.it/` | `200`, player con `live.m3u8` e `lapse.m3u8` → **embed autorizzato per dominio** |

### Termini d'uso (SkylineWebcams, https://www.skylinewebcams.com/it/terms-of-use.html)

- "VisioRay autorizza gli Utenti a prendere visione di tutti i Contenuti di SkylineWebcams e, ove siano presenti
  link di condivisione, a condividere le immagini delle webcam in diretta solo attraverso tali link."
- "l'Utente non può scaricare, estrapolare, fotografare, stampare o effettuare copie di alcun Contenuto, ivi compresi
  sequenze di immagini, immagini singolarmente prese [...] né per fini commerciali, né per uso personale."
- "è vietato utilizzarli, modificarli, adattarli, riformattarli, scaricarli, riprodurli [...] trasmetterli, pubblicarli
  [...] senza previa autorizzazione scritta di VisioRay."
- Costo per chi guarda: gratuito (sito finanziato dalla pubblicità). Costo e condizioni di un embed autorizzato:
  non verificati; richiedono un accordo scritto con VisioRay (`info@…`), quindi fuori dalle regole NEXUM
  (nessun account o accordo commerciale).

### Valutazione rispetto alle regole NEXUM

| Opzione | Funziona tecnicamente? | Ammessa da termini e regole NEXUM? |
|---|---|---|
| `<img src=live722.jpg>` al click | Solo togliendo il Referer (`referrerpolicy="no-referrer"`): sarebbe aggirare l'anti-hotlink | **NO**: i termini vietano di "estrapolare" e "riprodurre"; aggirare la protezione è inaccettabile |
| Riproduzione HLS (`hls.js`) | Richiede un token di sessione preso dalla pagina Skyline (scraping + cookie) | **NO** |
| Iframe `?w=722` | Mostra "not Autorized!" per qualsiasi dominio non autorizzato | **NO** senza autorizzazione scritta per dominio |
| Iframe del Comune di Parma | La pagina del Comune ha `X-Frame-Options: sameorigin` | **NO** |
| Link esterno (nuova scheda) alla pagina Skyline o del Comune | Sì | **SÌ**: è l'uso esplicitamente consentito ("condividere [...] solo attraverso tali link") |

### VERDETTO PARMA: **LINK ONLY**

Esiste una vera diretta pubblica di Piazza Garibaldi / Palazzo del Governatore: telecamera del Comune di Parma
trasmessa da SkylineWebcams in HLS, con circa 10–20 s di ritardo. NEXUM però non può mostrarla né come anteprima
né come embed: le immagini hanno un anti-hotlink basato sul Referer, l'HLS richiede un token di sessione,
l'embed è autorizzato per singolo dominio e i termini vietano la riproduzione.
Proposta d'uso: oggetto "camera.public_webcam" con coordinate di Piazza Garibaldi (44.8015, 10.3280),
`image_url = null`, nessun host in `img-src`, link esterno a
https://www.comune.parma.it/it/informazioni-generali/webcam-su-piazza-garibaldi (fonte istituzionale) e/o alla pagina Skyline,
con la nota "diretta di terzi — si apre sul sito del fornitore".
Per avere un'anteprima servirebbe l'autorizzazione scritta di VisioRay o del Comune: è un'azione dell'utente,
non dell'agente, e non va avviata senza GO.

---

<!-- Appendice G-satellite -->

## Appendice — G — Osservazione satellitare della Terra: audit di fattibilità (sola lettura)

Data misure: **2026-10-03, 19:32–19:38 UTC**. Tutte le richieste con UA `NEXUM-audit/0.3 (+https://github.com/pezzaliapp/NEXUM)` e `Origin: https://nexum.pages.dev` (solo per leggere gli header CORS). Nessun account, nessuna chiave. Le immagini scaricate per la verifica sono rimaste nello scratchpad (mai nel repo); dove indicato le ho anche ispezionate visivamente.
Per "latenza" si intende: istante del fotogramma più recente pubblicato rispetto all'ora della misura.

## 1. Sintesi

- **NASA GIBS** (WMTS/WMS, nessuna chiave, `Access-Control-Allow-Origin: *`) è la spina dorsale: VIIRS/MODIS true colour giornaliero (250 m nominali, nella pratica ~375–750 m), VIIRS Day/Night Band, **HLS a 30 m (Landsat+Sentinel-2)** con 1–5 giorni di ritardo, e i geostazionari **GOES-East, GOES-West, Himawari a 10 minuti**.
- **GIBS non copre l'Europa/Italia con un geostazionario** (verificato: GOES-East/Himawari sull'Italia restituiscono un PNG vuoto da 1096 B). Per l'Europa/Africa serve **EUMETView** (`view.eumetsat.int`, WMS, nessuna registrazione, CORS `*`): MTG-FCI full disk ogni 10 min (latenza misurata ~25 min) e MSG rapid scan ogni 5 min (~15 min). Licenza: le immagini sono "Advanced Image Products", classificate **Core → CC-BY-4.0**.
- Niente è "LIVE". Nel migliore dei casi si ha un dato **NEAR REAL-TIME** con 10–50 min di ritardo e 0,5–2 km/pixel, buono per nubi, tempeste, pennacchi e grandi incendi. **Non dà dettaglio urbano.** Il dettaglio da 30 m (HLS) è **LATEST AVAILABLE**: di solito ha qualche giorno e spesso è nuvoloso o assente sul punto.
- Copernicus Data Space / Sentinel Hub: le OGC richiedono **account + instance ID** → esclusi. Landsat USGS (EarthExplorer) richiede account → escluso. In compenso Landsat e Sentinel-2 arrivano già pronti tramite **HLS su GIBS**, senza account.

## 2. Tabella delle fonti

Legenda classi: LIVE (non raggiungibile), NRT = near real-time (<~1 h), LATEST = ultima disponibile (ore/giorni), HIST = storico.

| FONTE | PRODOTTO/LAYER | SENSORE | RISOLUZIONE | CADENZA | LATENZA MISURATA | COPERTURA | ACCESSO | KEY/ACCOUNT | CORS | LICENZA | HOTLINK on-demand | CLASSE | RACCOMANDAZIONE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NASA GIBS | `GOES-East_ABI_GeoColor` | GOES-19 ABI | TileMatrixSet 1km (nativo 0,5–2 km) | PT10M | ultimo 18:40Z alle 19:32Z → **~52 min** (default via WMTS) | Americhe/Atlantico; **non Italia** | WMTS/WMS | no | `*` | NASA: nessuna restrizione d'uso, attribuzione richiesta (§4) | sì | NRT | SÌ per luoghi nelle Americhe |
| NASA GIBS | `GOES-East/West_ABI_Band2_Red_Visible_1km`, `..._Band13_Clean_Infrared` (2km), `Air_Mass`, `Dust`, `FireTemp` (1km) | ABI | 1–2 km | PT10M | Band2 E 18:50Z (~42 min); Band13 W 19:00Z (~32 min) | Americhe/Pacifico E | WMTS/WMS | no | `*` | NASA | sì | NRT | SÌ (IR anche di notte) |
| NASA GIBS | `Himawari_AHI_Band3_Red_Visible_1km`, `Himawari_AHI_Band13_Clean_Infrared`, `Himawari_AHI_Air_Mass` | Himawari AHI | 1 km (VIS), 2 km (IR) | PT10M | WMTS `default` → `layer-time-actual: 2026-10-03T19:00:00Z` alle 19:33Z → **~33 min** | Asia orientale/Oceania/Pacifico W | WMTS/WMS | no | `*` | NASA (dati JMA) | sì | NRT | SÌ per Giappone/Asia; **in GIBS non c'è un true colour Himawari**, solo banda rossa VIS (B/N) e IR |
| NASA GIBS | `VIIRS_NOAA20/NOAA21/SNPP_CorrectedReflectance_TrueColor`, `MODIS_Terra/Aqua_CorrectedReflectance_TrueColor` | VIIRS, MODIS | matrice 250 m; nativo VIIRS 375–750 m, MODIS 250–500 m | P1D (1 passaggio diurno per satellite) | data 2026-10-03 già presente; Italia completa alle 19:32Z (passaggio di metà giornata) | globale, a strisciate | WMTS/WMS | no | `*` | NASA | sì | LATEST (stesso giorno) | SÌ come "foto del giorno" per paesi e regioni |
| NASA GIBS | `VIIRS_*_CorrectedReflectance_TrueColor_Granule` | VIIRS | 250 m (matrice) | PT6M per granulo | NOAA-20 ultimo 16:42Z → ~2 h 50 min | strisciata | WMTS | no | `*` | NASA | sì | LATEST | opzionale |
| NASA GIBS | `VIIRS_*_DayNightBand` (1 km), `..._At_Sensor_Radiance` (500 m) | VIIRS DNB | 500 m–1 km (nativo ~750 m) | P1D (passaggio notturno) | 2026-10-03 presente (Italia OK) | globale | WMTS/WMS | no | `*` | NASA | sì | LATEST | SÌ "luci notturne della notte scorsa" |
| NASA GIBS | `VIIRS_*_Thermal_Anomalies_375m_All/Day/Night`, `MODIS_*_Thermal_Anomalies_*` | VIIRS 375 m / MODIS 1 km | punti a 375 m / 1 km | P1D | 2026-10-03 presente | globale | WMTS **MVT** (vector tile); il WMS restituisce PNG renderizzato (verificato, punti rossi) | no | `*` | NASA (FIRMS) | sì | LATEST/NRT | SÌ come overlay per gli incendi |
| NASA GIBS | `HLS_S30_Nadir_BRDF_Adjusted_Reflectance`, `HLS_L30_...` | Sentinel-2 MSI / Landsat 8-9 OLI (armonizzati) | **31,25 m** (nativo 30 m) | P1D nominale; sul singolo punto rivisita 2–5 giorni, condizionata dalle nubi | default 2026-10-01 (≥2 giorni); Etna disponibile 2026-09-30 / 09-28 / 09-27, vuoto 10-01 / 09-29 / 09-26 | terre emerse, per tile MGRS | WMTS/WMS | no | `*` | NASA (Landsat: pubblico dominio; S2: Copernicus, attribuzione) | sì | LATEST | **SÌ: unica fonte a 30 m senza account.** Etichettare "acquisizione del GG/MM" |
| NASA GIBS | `OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1`, `OPERA_L3_DIST-ALERT-HLS`, `OPERA_L3_Dynamic_Surface_Water_Extent-*` | Sentinel-1 SAR, HLS | 30 m | P1D (rivisita di giorni) | default 2026-10-03 / 10-01 | parziale | WMTS | no | `*` | NASA | sì | LATEST | in seguito (alluvioni, disturbi): **non verificato visivamente** |
| NASA GIBS | `Landsat_WELD_*` | Landsat 5/7 | 30 m | annuale/mensile | fermo al 2000-2001 | USA | WMTS | no | `*` | NASA | sì | HIST | NO (vecchio) |
| NASA Worldview Snapshots | `wvs.earthdata.nasa.gov/api/v1/snapshot` (stessi layer GIBS) | — | come GIBS | — | header `acquisition-time: 2026-10-03T18:40:00Z`, `data-present: true` | globale | immagine statica (GetSnapshot) | **no** (200 senza chiave) | `*` + espone `Data-Present`, `Acquisition-Time` | NASA | sì | come il layer | SÌ in alternativa a WMS (header utili) |
| NOAA STAR CDN | `cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/<car,eus,...>/GEOCOLOR/{250..4000}x...jpg`, `FD`, GOES18 | ABI | settori 0,5–2 km; JPEG 250–4000 px | settore `car` PT10M (1440 file ≈ 10 giorni); CONUS/meso 5 min/1 min (non misurato) | `car` ultimo `20262761910` (19:10Z) alle 19:34Z → **~24 min**; `Last-Modified 19:35:28` | 22 settori fissi Americhe + full disk | JPEG statico (`latest.jpg` = 9,7 MB!) | no | `*` | "Users are free to use the images… as long as credit is given to NOAA/NESDIS/STAR"; "not official NOAA operational products… experimental" | sì (sola immagine) | NRT | Facoltativo: settori fissi, nessun bbox arbitrario |
| RAMMB/CIRA SLIDER | `slider.cira.colostate.edu/data/json/goes-19/full_disk/geocolor/latest_times.json` | ABI/AHI/SEVIRI-FCI | fino a 0,5 km | 10 min (ultimo `20261003191020`) | ~25 min | globale (più satelliti) | tile/JSON non documentati come API pubblica | no | **assente** sull'header JSON | nessuna licenza esplicita trovata; disclaimer "Meteosat imagery contains modified EUMETSAT…" | **non verificato** | NRT | NO (API interna, terms poco chiari) |
| EUMETSAT EUMETView | `mtg_fd:rgb_geocolour`, `mtg_fd:rgb_truecolour`, `mtg_fd:vis06_hrfi`, `mtg_fd:ir105_hrfi`, `mtg_fd:rgb_firetemperature`, `mtg_fd:frp`, `mtg_fd:li_afa` | MTG-I1 FCI / LI | FCI 1 km VIS / 2 km IR; HRFI 0,5 km VIS06 / 1 km IR | **PT10M** (LI PT5M) | default 19:10Z alle 19:35Z → **~25 min** | Europa/Africa/Atlantico (full disk 0°) | WMS 1.3.0 (`view.eumetsat.int/geoserver/ows`) | **no** | `*` | Data Policy (01/01/2025): Advanced Image Products FCI = **Core → CC-BY-4.0**; attribuzione obbligatoria | sì | NRT | **SÌ per Italia/Europa/Africa** |
| EUMETSAT EUMETView | `msg_rss:rgb_naturalenhncd_nrt`, `msg_rss:ir039_nrt`, `msg_fes:*`, `msg_iodc:*` | MSG SEVIRI | 3 km (HRV 1 km) | RSS PT5M; FES/IODC PT15M | RSS 19:20Z alle 19:35Z → **~15 min**; FES 19:15Z | Europa (RSS); Africa / Oceano Indiano | WMS | no | `*` | CC-BY-4.0 (Core) | sì | NRT | SÌ (cadenza a 5 min sull'Europa) |
| EUMETSAT EUMETView | `copernicus:daily_sentinel3ab_olci_l1_rgb_fulres` | Sentinel-3 OLCI | 300 m | per passaggio (~1/giorno/sat) | ultimo 15:56Z → ~3,6 h | globale | WMS | no | `*` | Copernicus (attribuzione) | sì | LATEST | opzionale (true colour a 300 m) |
| JMA | `www.jma.go.jp/bosai/himawari/data/satimg/...` (`targetTimes_fd.json`, `targetTimes_jp.json`) | Himawari AHI | ~1–2 km | FD 10 min; area Giappone **2,5 min** | jp 19:30Z alle 19:38Z → **~8 min** | Giappone/Asia | tile JPEG (endpoint **interno, non documentato**) | no | `*` (max-age 60) | Public Data License v1.0: riuso consentito con fonte "出典：気象庁ホームページ"; "リンクフリー" | link libero; hotlink della tile **non regolato esplicitamente** | NRT | Solo dopo verifica; preferire GIBS Himawari |
| Copernicus Data Space / Sentinel Hub | OGC WMS/WMTS S1/S2/S3 | — | 10 m (S2) | 2–5 giorni | — | — | OGC | **sì**: "To use any of our OGC services you will need a 'configuration instance'" | — | Copernicus aperta | — | — | **ESCLUSO** (account) |
| EOX Sentinel-2 cloudless | mosaico annuale | S2 | 10 m | annuale | — | globale | WMTS | no | non verificato | uso commerciale solo con licenza EOX; attribuzione "EOxCloudless … (Contains modified Copernicus Sentinel data [year])" | non verificato | HIST | NO (licenza non pienamente libera, non è osservazione) |
| USGS Landsat (EarthExplorer/M2M) | scene L1/L2 | OLI/TIRS | 15–30 m | 8–16 giorni | — | globale | download | **sì** (EROS account) | — | pubblico dominio | — | — | **ESCLUSO**; usare HLS L30 su GIBS |

Note sulla misura GIBS: le GetCapabilities WMTS (`/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml`, 5,3 MB, `cache-control: max-age=1800`) elencano 1319 layer. Per i geostazionari mostrano solo gli ultimi 100 intervalli `start/end/PT10M`, che però non esauriscono l'archivio: Himawari IR alle 12:40Z, che cade fuori dall'ultimo intervallo dichiarato, restituisce 200 con `layer-time-actual: 2026-10-03T12:40:00Z`. GOES-East GeoColor del 2026-09-01T18:40Z → 200, 648 KB.

## 3. Esempi misurati (URL reali)

Base WMS GIBS: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&WIDTH=768&HEIGHT=768` (BBOX in ordine lat,lon con EPSG:4326 / WMS 1.3.0)

| Luogo | Parametri aggiunti | HTTP | Esito |
|---|---|---|---|
| Italia | `&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&BBOX=36,6,47.5,19&TIME=2026-10-03` | 200, 110 KB, 0,9 s | Italia nitida, nubi sul Tirreno (verificato a vista) |
| Italia | idem `TIME=2026-10-02` | 200, 122 KB | ok |
| Italia | idem `TIME=2026-10-10` (futuro) | **200, 3,7 KB** | **immagine vuota con status 200** → trappola |
| Etna | `&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&BBOX=37.5,14.7,38,15.3&TIME=2026-10-03` | 200, 43 KB | sgranato, bordo di strisciata visibile, nubi: **inutile su 0,5°** |
| Etna 30 m | `&LAYERS=HLS_S30_Nadir_BRDF_Adjusted_Reflectance&FORMAT=image/png&BBOX=37.6,14.85,37.85,15.15&TIME=2026-09-30` | 200, 1,44 MB | crateri, colate e nubi ben visibili (verificato a vista); cucitura tra due tile MGRS |
| Etna 30 m | idem `TIME=2026-10-01` | 200, 2,4 KB | vuoto (nessun passaggio) |
| Genova porto 30 m | `HLS_S30… BBOX=44.38,8.84,44.43,8.95&TIME=2026-09-28` | 200, 2,4 KB | vuoto. CMR indica S30 il 2026-09-29 (nubi 88%) e il 09-22 (33%) |
| Giappone | `&LAYERS=Himawari_AHI_Band13_Clean_Infrared&FORMAT=image/png&BBOX=30,128,46,146&TIME=2026-10-03T18:40:00Z` | 200, 365 KB | ok (IR, di notte in Giappone) |
| Giappone | idem con `Himawari_AHI_Band3_Red_Visible_1km` | 200, 5,9 KB | quasi vuoto: **di notte il visibile è nero** |
| Sakurajima | `Himawari_AHI_Band3_Red_Visible_1km&BBOX=31,130,32,131.2&TIME=2026-10-03T03:00:00Z` | 200, 18 KB | grigio a blocchi da ~1 km: il vulcano non è riconoscibile |
| Florida/Caraibi | `&LAYERS=GOES-East_ABI_GeoColor&FORMAT=image/png&BBOX=20,-90,32,-74&TIME=2026-10-03T18:40:00Z` | 200, 1,44 MB | sistema nuvoloso ben visibile (verificato a vista) |
| Italia | `GOES-East_ABI_GeoColor` / `Himawari…` `BBOX=36,6,47.5,19` | 200, **1096 B** | **vuoto: fuori dal disco** |
| Italia notte | `VIIRS_NOAA20_DayNightBand&BBOX=36,6,47.5,19&TIME=2026-10-03` | 200, 325 KB | luci urbane e nubi |
| Italia incendi | `VIIRS_NOAA20_Thermal_Anomalies_375m_All&FORMAT=image/png&TIME=2026-10-02` | 200, 11 KB | punti rossi su fondo trasparente |

WMTS GIBS (EPSG:3857):
- `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-10-03/GoogleMapsCompatible_Level9/6/23/34.jpg` → 200, `access-control-allow-origin: *`, `cache-control: no-store`, `access-control-expose-headers: layer-identifier-request, layer-identifier-actual, layer-time-request, layer-time-actual`.
- Stesso layer con `/default/default/` → `layer-time-actual: 2026-10-03T00:00:00Z`; con `/2026-10-04/` → **404** (il WMTS restituisce 404 per il futuro, mentre il WMS dà 200 vuoto).
- `.../Himawari_AHI_Band13_Clean_Infrared/default/2026-10-03T18:47:00Z/GoogleMapsCompatible_Level6/4/6/14.png` → 200, `layer-time-actual: 18:40:00Z` (aggancio al fotogramma precedente). Con `default` → `19:00:00Z`; con `19:10:00Z` → 404.
- `.../GOES-East_ABI_GeoColor/default/2026-10-03T18:40:00Z/GoogleMapsCompatible_Level7/5/13/8.png` → 200, 145 KB.

EUMETView (base `https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&crs=EPSG:4326&width=768&height=768&styles=`):
- `&layers=mtg_fd:rgb_truecolour&format=image/jpeg&bbox=36,6,47.5,19&time=2026-10-03T12:40:00Z` → 200, 79 KB: Italia true colour (verificato).
- `&layers=mtg_fd:rgb_geocolour&format=image/jpeg&bbox=36,6,47.5,19` (senza time = 19:10Z) → 200, 91 KB. È notte: le luci delle città sono **uno sfondo statico**, non osservazione notturna in diretta.
- `&layers=mtg_fd:vis06_hrfi&format=image/png&bbox=37.3,14.5,38.2,15.6&time=2026-10-03T12:40:00Z` → 200, 31 KB: Etna e costa riconoscibili a ~0,5 km, nubi convettive.
- `&layers=msg_rss:rgb_naturalenhncd_nrt&...&time=2026-10-03T15:00:00Z` → 200; `copernicus:daily_sentinel3ab_olci_l1_rgb_fulres&time=2026-10-03` → 200, 118 KB.
- Header: `access-control-allow-origin: *`, **`cache-control: max-age=604800`** anche sulla richiesta senza `time` → il browser terrebbe in cache "l'ultima" per 7 giorni: **passare sempre un `time` esplicito**.

Altri:
- `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2026-10-03&BBOX=36,6,47.5,19&CRS=EPSG:4326&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor,Coastlines_15m&WRAP=day,x&FORMAT=image/jpeg&WIDTH=768&HEIGHT=768` → 200, CORS `*`, senza chiave.
- `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/car/GEOCOLOR/1000x1000.jpg` → 200, 974 KB, CORS `*`.
- `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=HLSS30&point=8.9,44.4&sort_key=-start_date&page_size=3` → 200, CORS `*`, nessuna chiave: restituisce date e `cloud_cover` per punto. Serve a scegliere la data HLS giusta.

## 4. Licenze (citazioni)

- **NASA GIBS/Earthdata** ([data use guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance)): "NASA material may not be used to suggest or imply endorsement by NASA…"; "NASA should be acknowledged as the source of the material where applicable." Dalla [doc GIBS](https://nasa-gibs.github.io/gibs-api-docs/): "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." Su quote e limiti di richieste le pagine consultate non dicono nulla: **non documentato / non verificato**.
- **EUMETSAT** ([Data Policy, PDF, emendata il 01/01/2025](https://www-cdn.eumetsat.int/files/2025-02/45173%20-%20Data_Policy(1442019%20V1).pdf)): art. 5.1 "Access to Core Data and Products is granted to all users world-wide on a Free and Unrestricted basis under a CC-BY-4.0 licence". Nella tabella Core compaiono "All SEVIRI, FCI, IRS and LI Advanced Image Products"; la definizione di "Advanced Image Product" include le "visualisations of individual channels (e.g. used in Web Map Services)". L'art. 6.3 impone l'attribuzione: "[Contains modified] EUMETSAT [Meteosat/Metop] [data/product] [Year…]". Attenzione: i dati L1 numerici con latenza < 1 h sono "Recommended" (a pagamento). A NEXUM non servono, perché usa solo le immagini.
- **NOAA STAR**: "Users are free to use the images… as long as credit is given to the NOAA/NESDIS Center for Satellite Applications and Research"; "not official NOAA operational products" ([disclaimer](https://star.nesdis.noaa.gov/star/productdisclaimer.php), letto tramite estratto di ricerca, non sulla pagina originale).
- **JMA** ([condizioni](https://www.jma.go.jp/jma/kishou/info/coment.html)): Public Data License v1.0, fonte "出典：気象庁ホームページ", "リンクフリー".
- **Copernicus/HLS-S30**: dati Sentinel con attribuzione "Contains modified Copernicus Sentinel data [anno]" (prassi Copernicus; testo legale **non riletto** in questo audit).
- **SLIDER**: nessuna licenza trovata → **non verificato**, non usare.

## 5. Fattibilità

### 5.1 "OSSERVA → SATELLITE" per luogo
Fattibile a €0 con un `<img src>` costruito nel browser dal bbox del luogo. NEXUM non salva niente: è il browser a richiedere l'immagine, e solo su clic. Scelta del layer per tipo di luogo:

| Tipo luogo | Layer primario | Perché / limite onesto |
|---|---|---|
| Paese / regione grande (>3°) | VIIRS NOAA-20/21 o MODIS true colour, data di oggi (UTC) o di ieri | foto del giorno, con nubi; ~375–750 m |
| Meteo / tempesta / ciclone | Europa-Africa: EUMETView `mtg_fd:rgb_truecolour` (giorno) o `ir105_hrfi` (notte); Americhe: GIBS GOES GeoColor o Band13; Asia-Pacifico: GIBS Himawari Band13 o Band3 | NRT 10 min, ritardo 15–50 min, 1–2 km |
| Vulcano (pennacchio) | geostazionario della zona (come sopra) + HLS 30 m all'ultima data senza nubi | il pennacchio si vede a 1 km; i crateri solo con HLS, vecchio di giorni |
| Incendi | `VIIRS_*_Thermal_Anomalies_375m_All` come overlay su VIIRS true colour; Americhe `GOES-*_ABI_FireTemp`; Europa `mtg_fd:rgb_firetemperature` | sono **rilevazioni di calore**, non foto del fuoco |
| Città / porto / infrastruttura | HLS S30/L30 30 m, data scelta tramite CMR (meno nubi, più recente) | a 30 m si vedono moli e piste ma **non navi né veicoli**; spesso ritardo di 2–10 giorni |
| Notte / luci | VIIRS DayNightBand | luci della notte precedente; nubi illuminate dalla luna |

Etichetta obbligatoria sotto ogni immagine: **prodotto · sensore/satellite · istante dell'acquisizione (UTC) · età ("acquisita 34 min fa" / "acquisita 3 giorni fa") · risoluzione nominale · fonte e attribuzione · classe (NRT/LATEST)**. L'istante va preso da `layer-time-actual` (WMTS GIBS, header esposto via CORS → richiede `fetch`), da `Acquisition-Time`/`Data-Present` (Worldview Snapshots) o dalla `Dimension time` delle GetCapabilities EUMETView. Problema: un `<img>` non legge gli header, e il WMS restituisce **200 con immagine vuota** quando mancano i dati (fuori disco, futuro, nessun passaggio). Serve quindi `fetch` → blob → objectURL, oppure un controllo della dimensione o dell'header. In alternativa conviene preferire WVS (header `Data-Present`) o il WMTS, che restituisce 404 per i tempi futuri.

### 5.2 Timeline (striscia di fotogrammi)
- **Fotogrammi reali a 10 min**: GIBS GOES-East/West e Himawari (verificati -1 h, -3 h, -6 h, -24 h e il 1° settembre, tutti 200 con dati). EUMETView MTG FD a 10 min, MSG RSS a 5 min, MSG FES/IODC a 15 min.
- Proposta: ultimo, -30 min, -1 h, -3 h, -6 h, -24 h, allineati ai multipli di 10 min (o di 15 min per MSG FES). Prima di costruire la striscia, determinare il "più recente" (WMTS `default` + `layer-time-actual`, oppure GetCapabilities EUMETView) e **non** dedurlo dall'orologio.
- **VIIRS/MODIS/HLS non hanno fotogrammi orari**: per questi la timeline è giornaliera (oggi, -1 g, -2 g…), e per HLS le date esistono solo quando c'è stato un passaggio (lista da CMR).
- Visibile e true colour sono neri di notte: la timeline deve passare all'IR, oppure segnalare "notte".

### 5.3 MapLibre raster on demand vs immagine singola
- Immagine singola (WMS GetMap/WVS 512–1024 px): 1 richiesta, 0,6–2,2 s misurati, 40 KB–1,4 MB. **Consigliata per l'anteprima** nel pannello del luogo.
- MapLibre `raster` source con template WMTS GIBS (`{z}/{y}/{x}` su `GoogleMapsCompatible_LevelN`, livello massimo per layer: Level9 per 250 m, Level7 per 1 km, Level6 per 2 km, più alto per HLS 31,25 m) o con WMS `bbox={bbox-epsg-3857}` per EUMETView. È fattibile, solo su toggle esplicito dell'utente, con `minzoom`/`maxzoom` per evitare raffiche di tile. MapLibre carica le tile via `fetch` → serve `connect-src` oltre a `img-src`. Il tempo della tile deve essere fisso nell'URL, mai "default" (cache e coerenza tra tile).

### 5.4 Host CSP necessari
- `img-src` (anteprime): `https://gibs.earthdata.nasa.gov`, `https://view.eumetsat.int`. Opzionali: `https://wvs.earthdata.nasa.gov`, `https://cdn.star.nesdis.noaa.gov`.
- `connect-src` (header, capabilities, MapLibre, date HLS): `https://gibs.earthdata.nasa.gov`, `https://view.eumetsat.int`, `https://cmr.earthdata.nasa.gov`. Opzionale: `https://wvs.earthdata.nasa.gov`.
- Se si usa fetch → blob: aggiungere `blob:` a `img-src`. MapLibre: `worker-src blob:` (già da verificare nella CSP esistente).
- Nessun host di JMA o SLIDER (endpoint non documentati o terms poco chiari).

### 5.5 €0, limiti, fair use
Tutto gratuito e senza chiave, verificato. Non ho trovato quote documentate per GIBS né per EUMETView (**non verificato**). Regole consigliate:
- solo richieste su clic, mai precaricamento;
- al massimo una timeline (≤8 fotogrammi) per azione;
- dimensione ≤1024 px;
- niente polling automatico: al massimo un aggiornamento manuale;
- non usare `latest.jpg` STAR (9,7 MB);
- non scaricare le GetCapabilities GIBS intere nel browser (5,3 MB): usare WMTS `default` + header, o la GetCapabilities EUMETView (282 KB, cache 120 s).

Poiché nulla passa da NEXUM, il costo per NEXUM resta €0. Il carico ricade sui servizi pubblici, quindi va tenuto basso.

### 5.6 Cosa NON promettere
- Niente "live", "in diretta" o "in tempo reale". Dire "quasi in tempo reale: acquisita N min fa" (15–50 min misurati).
- Niente dettaglio urbano: a 0,5–2 km/pixel (geostazionari) e ~375–750 m (VIIRS) non si vedono quartieri, navi, aerei, veicoli né persone. Con HLS a 30 m si vedono moli, piste e grandi impianti, ma non oggetti, e l'immagine ha giorni.
- Niente garanzia di immagine "di oggi" su un punto (nubi, strisciate, rivisita HLS di 2–5 giorni).
- Nessuna copertura geostazionaria GIBS sull'Italia o l'Europa: serve EUMETView.
- Niente true colour di notte: GeoColor notturno usa luci di città **statiche** come sfondo.
- Niente "fuoco visto": le anomalie termiche sono pixel caldi da 375 m–1 km, con falsi positivi (industrie, vulcani).
- Niente Sentinel-2 a 10 m "fresco" senza account (CDSE e Sentinel Hub esclusi).
- Nessuna immagine salvata, ripubblicata o cachata da NEXUM: solo hotlink richiesti dal browser, con attribuzione.

## 6. Raccomandazione
1. **GO** per l'anteprima "OSSERVA → SATELLITE" usando due provider senza chiave: **GIBS** (VIIRS/MODIS, DNB, Thermal Anomalies, HLS 30 m, GOES, Himawari) ed **EUMETView** (MTG/MSG per Europa e Africa). Scelta del geostazionario in base alla longitudine del luogo: circa -150…-30 → GOES (West/East); -30…+75 → MTG/MSG; +75…+180 → Himawari. I confini sono indicativi e vanno verificati con il 200-vuoto/1096 B.
2. Etichetta onesta obbligatoria (§5.1), con il tempo reale letto dal servizio, mai inventato. Rilevare le immagini vuote.
3. Timeline a 10 min solo per i geostazionari; giornaliera per VIIRS/HLS.
4. Esclusi: Sentinel Hub/CDSE OGC (account), USGS EarthExplorer (account), SLIDER e endpoint JMA (API non documentate o terms non chiari), EOX cloudless (licenza ristretta).
5. Attribuzioni da mostrare: "Imagery: NASA GIBS/ESDIS"; "Contains modified EUMETSAT Meteosat data 2026" (CC-BY-4.0); per HLS-S30 "Contains modified Copernicus Sentinel data 2026"; per STAR (se usato) "NOAA/NESDIS/STAR".

Non verificato: limiti di rate GIBS/EUMETView; disponibilità e qualità visiva dei layer OPERA; terms specifici SLIDER; testo legale completo di Copernicus ed EOX; cadenze dei settori CONUS e mesoscale di STAR.
