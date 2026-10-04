"""World Bank — World Development Indicators, COUNTRY INDICATORS (World Intelligence, 2026-10-03): population and its
structure, the economy, living conditions (water, sanitation, electricity access), with the World Bank's own values,
units and years for the 193 UN member states (regional aggregates are skipped). Licence CC BY 4.0 ("The World Bank:
World Development Indicators"). One request per indicator; one object per indicator (connectors/indicator_common).

nature: "modelled" for the ILO modelled estimates; "estimated" for the WHO/UNICEF JMP coverage estimates and the
FAO AQUASTAT water series (AQUASTAT carries the latest observation forward: the year shown is not always a year of
measurement — said in the definition). Everything else as published ("reported": compiled from national sources)."""

import json

from connectors.indicator_common import indicator
from connectors.obs_common import UN193, iso
from nexum.core.scheduler import FetchRequest

VERSION = "1.1.0"   # 1.1.0 (2026-10-04): GDP in the country's currency first; dollar series as comparison measures
URL = "https://api.worldbank.org/v2/country/all/indicator/{}?format=json&per_page=20000&date=2010:2026"
JMP = "stima WHO/UNICEF JMP (modellata dove mancano indagini)"
AQ = ("FAO AQUASTAT: l'anno indicato è l'ultimo pubblicato e può riportare in avanti l'ultima osservazione nazionale; "
      "molti valori sono stime FAO")
# COUNTRY CURRENCY FIRST (2026-10-04): the values in the country's own currency answer the country's view; the series
# converted by the World Bank into US dollars (market rates), constant 2015 dollars or PPP international dollars are
# kept as INTERNATIONAL COMPARISON measures, apart, each with a short note on what its unit is (never converted by
# NEXUM, never shown as money a resident spends)
COMPARE = "confronto internazionale"
UNIT_NOTE = {
    "NY.GDP.MKTP.CD": "convertito in dollari USA ai cambi di mercato dalla Banca Mondiale: serve a confrontare i Paesi",
    "NY.GDP.PCAP.CD": "convertito in dollari USA ai cambi di mercato dalla Banca Mondiale: serve a confrontare i Paesi",
    "NY.GNP.PCAP.CD": "dollari USA con il metodo Atlas della Banca Mondiale: serve a confrontare i Paesi",
    "NY.GDP.PCAP.PP.CD": "dollari internazionali a parità di potere d'acquisto: misura di confronto, non dollari USA",
    "NY.GNP.PCAP.PP.CD": "dollari internazionali a parità di potere d'acquisto: misura di confronto, non dollari USA",
    "NE.CON.PRVT.PC.KD": "dollari a prezzi costanti 2015: misura per confronti nel tempo e tra Paesi, non una spesa in dollari",
}
LOCAL = {"NY.GDP.MKTP.CN": "{cur} a prezzi correnti", "NY.GDP.PCAP.CN": "{cur} per abitante, prezzi correnti"}
# code: (section, topic, label, unit, statistic, nature, digits, keywords, definition)
INDICATORS = {
    "SP.POP.TOTL": ("popolazione", "popolazione", "Popolazione totale", "abitanti", "level", "reported", 0,
                    "population abitanti people inhabitants",
                    "Residenti, indipendentemente dallo status legale o dalla cittadinanza (stima di metà anno)"),
    "EN.POP.DNST": ("popolazione", "popolazione", "Densità di popolazione", "abitanti per km²", "ratio", "reported", 1,
                    "density densità", "Popolazione di metà anno divisa per la superficie delle terre emerse"),
    "SP.URB.TOTL.IN.ZS": ("popolazione", "città", "Popolazione urbana", "% della popolazione", "share", "estimated", 1,
                          "urban urbanizzazione città cities",
                          "Quota della popolazione che vive in aree urbane secondo le definizioni nazionali (UN World Urbanization Prospects)"),
    "EN.URB.LCTY": ("popolazione", "città", "Popolazione della città più grande", "abitanti", "level", "estimated", 0,
                    "largest city città più grande",
                    "Popolazione dell'agglomerato urbano più grande del Paese (UN World Urbanization Prospects)"),
    "SP.POP.GROW": ("popolazione", "popolazione", "Crescita della popolazione", "% annuo", "rate", "reported", 2,
                    "population growth crescita", "Variazione annua percentuale della popolazione"),
    "SP.POP.0014.TO.ZS": ("popolazione", "struttura per età", "Popolazione 0–14 anni", "% della popolazione", "share", "estimated", 1,
                          "age children giovani età", "Quota della popolazione tra 0 e 14 anni (UN World Population Prospects)"),
    "SP.POP.1564.TO.ZS": ("popolazione", "struttura per età", "Popolazione 15–64 anni", "% della popolazione", "share", "estimated", 1,
                          "age working age età lavorativa", "Quota della popolazione tra 15 e 64 anni (UN World Population Prospects)"),
    "SP.POP.65UP.TO.ZS": ("popolazione", "struttura per età", "Popolazione con 65 anni e più", "% della popolazione", "share", "estimated", 1,
                          "age elderly anziani età", "Quota della popolazione con almeno 65 anni (UN World Population Prospects)"),
    "SP.DYN.LE00.IN": ("popolazione", "salute", "Speranza di vita alla nascita", "anni", "level", "estimated", 1,
                       "life expectancy speranza di vita", "Anni che vivrebbe un neonato con i tassi di mortalità dell'anno"),
    "NY.GDP.MKTP.CN": ("economia", "prodotto", "Prodotto interno lordo (PIL)", "valuta nazionale, prezzi correnti", "level", "reported", 0,
                       "gdp pil economy economia", "Valore aggiunto lordo di tutti i produttori residenti, in valuta nazionale a prezzi correnti (conti nazionali)"),
    "NY.GDP.PCAP.CN": ("economia", "prodotto", "PIL pro capite", "valuta nazionale per abitante, prezzi correnti", "per_capita", "reported", 0,
                       "gdp per capita pil pro capite", "PIL in valuta nazionale diviso per la popolazione di metà anno. Non è uno stipendio"),
    "NY.GDP.MKTP.CD": ("economia", "prodotto", "Prodotto interno lordo (PIL)", "US$ correnti", "level", "reported", 0,
                       "gdp pil economy economia", "Valore aggiunto lordo di tutti i produttori residenti, in dollari correnti"),
    "NY.GDP.PCAP.CD": ("economia", "prodotto", "PIL pro capite", "US$ correnti", "per_capita", "reported", 0,
                       "gdp per capita pil pro capite", "PIL diviso per la popolazione di metà anno, in dollari correnti. Non è uno stipendio"),
    "NY.GDP.PCAP.PP.CD": ("economia", "prodotto", "PIL pro capite a parità di potere d'acquisto", "$ internazionali correnti (PPA)", "per_capita", "reported", 0,
                          "gdp ppp parità potere d'acquisto",
                          "PIL pro capite convertito in dollari internazionali con le parità di potere d'acquisto (ICP). Non è uno stipendio"),
    "NY.GDP.MKTP.KD.ZG": ("economia", "prodotto", "Crescita del PIL reale", "% annuo", "rate", "reported", 1,
                          "growth crescita", "Variazione annua del PIL a prezzi costanti"),
    "NY.GNP.PCAP.CD": ("economia", "reddito", "Reddito nazionale lordo pro capite (metodo Atlas)", "US$ correnti", "per_capita", "reported", 0,
                       "gni income reddito nazionale",
                       "Reddito nazionale lordo diviso per la popolazione, convertito con il metodo Atlas della Banca Mondiale. Non è uno stipendio"),
    "NY.GNP.PCAP.PP.CD": ("economia", "reddito", "Reddito nazionale lordo pro capite (PPA)", "$ internazionali correnti (PPA)", "per_capita", "reported", 0,
                          "gni ppp income reddito", "Reddito nazionale lordo pro capite a parità di potere d'acquisto. Non è uno stipendio"),
    "NE.EXP.GNFS.ZS": ("economia", "commercio", "Esportazioni di beni e servizi", "% del PIL", "ratio", "reported", 1,
                       "exports esportazioni trade", "Valore delle esportazioni di beni e servizi in percentuale del PIL"),
    "NE.IMP.GNFS.ZS": ("economia", "commercio", "Importazioni di beni e servizi", "% del PIL", "ratio", "reported", 1,
                       "imports importazioni trade", "Valore delle importazioni di beni e servizi in percentuale del PIL"),
    "SL.EMP.TOTL.SP.ZS": ("economia", "lavoro", "Tasso di occupazione (15 anni e più)", "% della popolazione 15+", "share", "modelled", 1,
                          "employment occupazione lavoro jobs", "Occupati in percentuale della popolazione di 15 anni e più, stima modellata dall'ILO"),
    "NE.CON.PRVT.PC.KD": ("vivere", "consumi", "Consumi delle famiglie pro capite", "US$ costanti 2015", "per_capita", "reported", 0,
                          "household consumption consumi famiglie spesa",
                          "Spesa per consumi finali delle famiglie divisa per la popolazione, a prezzi costanti 2015"),
    "PA.NUS.PRVT.PP": ("prezzi", "livello dei prezzi", "Fattore di conversione PPA (consumi privati)", "unità di valuta locale per $ internazionale", "ratio", "reported", 2,
                       "ppp purchasing power potere d'acquisto cost of living costo della vita",
                       "Quante unità di valuta locale comprano, in consumi delle famiglie, ciò che 1 dollaro compra negli Stati Uniti (ICP)"),
    "PA.NUS.PRVT.PLI": ("prezzi", "livello dei prezzi", "Livello dei prezzi dei consumi delle famiglie (USA = 100)", "indice (USA = 100)", "index", "reported", 1,
                        "price level livello dei prezzi cost of living costo della vita",
                        "Rapporto tra la parità di potere d'acquisto dei consumi delle famiglie e il tasso di cambio, Stati Uniti = 100: sotto 100 gli stessi consumi costano meno che negli USA (ICP). È un indice relativo, non un prezzo"),
    "SH.H2O.BASW.ZS": ("vivere", "acqua", "Accesso almeno di base all'acqua potabile", "% della popolazione", "share", "estimated", 1,
                       "water acqua potabile drinking", f"Popolazione con almeno una fonte d'acqua migliorata entro 30 minuti andata e ritorno; {JMP}"),
    "SH.H2O.SMDW.ZS": ("vivere", "acqua", "Acqua potabile gestita in sicurezza", "% della popolazione", "share", "estimated", 1,
                       "water acqua potabile safely managed", f"Fonte migliorata, accessibile in casa, disponibile quando serve e senza contaminazione; {JMP}"),
    "SH.STA.BASS.ZS": ("vivere", "servizi igienici", "Servizi igienici almeno di base", "% della popolazione", "share", "estimated", 1,
                       "sanitation servizi igienici", f"Servizi igienici migliorati non condivisi con altre famiglie; {JMP}"),
    "SH.STA.SMSS.ZS": ("vivere", "servizi igienici", "Servizi igienici gestiti in sicurezza", "% della popolazione", "share", "estimated", 1,
                       "sanitation servizi igienici safely managed", f"Servizi igienici migliorati con smaltimento sicuro dei reflui; {JMP}"),
    "EG.ELC.ACCS.ZS": ("vivere", "energia in casa", "Accesso all'elettricità", "% della popolazione", "share", "estimated", 1,
                       "electricity access elettricità accesso",
                       "Popolazione con accesso all'elettricità (SDG 7.1.1; stime modellate dove mancano indagini)"),
    "ER.H2O.INTR.PC": ("infrastrutture", "acqua", "Risorse idriche rinnovabili interne pro capite", "m³ per abitante", "per_capita", "estimated", 0,
                       "water resources risorse idriche", f"Deflusso interno di fiumi e falde da precipitazioni, per abitante; {AQ}"),
    "ER.H2O.FWTL.K3": ("infrastrutture", "acqua", "Prelievi annui di acqua dolce", "miliardi di m³", "level", "estimated", 2,
                       "water withdrawals prelievi acqua consumo", f"Prelievi totali di acqua dolce (senza perdite per evaporazione dei bacini); {AQ}"),
    "ER.H2O.FWAG.ZS": ("infrastrutture", "acqua", "Prelievi d'acqua per l'agricoltura", "% dei prelievi", "share", "estimated", 1,
                       "water agriculture agricoltura", f"Quota dei prelievi d'acqua dolce destinata all'agricoltura; {AQ}"),
    "ER.H2O.FWDM.ZS": ("infrastrutture", "acqua", "Prelievi d'acqua per uso domestico", "% dei prelievi", "share", "estimated", 1,
                       "water domestic domestico", f"Quota dei prelievi d'acqua dolce per uso domestico e municipale; {AQ}"),
    "ER.H2O.FWIN.ZS": ("infrastrutture", "acqua", "Prelievi d'acqua per l'industria", "% dei prelievi", "share", "estimated", 1,
                       "water industry industria", f"Quota dei prelievi d'acqua dolce per l'industria; {AQ}"),
    "ER.H2O.FWST.ZS": ("infrastrutture", "acqua", "Stress idrico (SDG 6.4.2)", "% delle risorse disponibili", "ratio", "estimated", 1,
                       "water stress stress idrico",
                       f"Prelievi d'acqua dolce in percentuale delle risorse rinnovabili disponibili, al netto dei fabbisogni ambientali; {AQ}"),
    "EG.IMP.CONS.ZS": ("energia", "dipendenza", "Import netti di energia", "% dell'uso di energia", "ratio", "reported", 1,
                       "energy imports dependency dipendenza energetica",
                       "Uso di energia meno produzione, in percentuale dell'uso (negativo = esportatore netto); serie derivata da IEA, copertura parziale"),
}


def describe():
    return {"connector_version": VERSION, "produces": ["observation.indicator"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL.format(i), f"wdi_{i}.json") for i in INDICATORS]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    doc = json.loads(data.decode("utf-8"))
    if not isinstance(doc, list) or len(doc) < 2 or not doc[1]:
        return
    by, code = {}, None
    for r in doc[1]:
        code = (r.get("indicator") or {}).get("id")
        c = iso((r.get("country") or {}).get("id"))
        if code not in INDICATORS or c not in UN193 or r.get("value") is None:
            continue
        by.setdefault(c, []).append((r["date"], r["value"], None))
    if code not in INDICATORS or not by:
        return
    section, topic, label, unit, stat, nature, digits, kw, definition = INDICATORS[code]
    compare = code in UNIT_NOTE
    rec = indicator(meta, code, label, unit, by, section=section, topic=COMPARE if compare else topic, definition=definition, statistic=stat,
                    nature=nature, frequency="annuale", dataset=f"World Bank WDI {code} (aggiornato {doc[0].get('lastupdated', '')})",
                    keywords=kw, digits=digits, order=list(INDICATORS).index(code) + (100 if compare else 0), locator="$[1]", text="World Bank",
                    unit_note=UNIT_NOTE.get(code), unit_local=LOCAL.get(code),
                    allow_negative=code in ("EG.IMP.CONS.ZS", "SP.POP.GROW", "NY.GDP.MKTP.KD.ZG"))
    if rec:
        yield rec
