"""Germany — truck toll rates of the Federal Trunk Road Toll Act (BFStrMG), Anlage 1, read AUTOMATICALLY from the
official consolidated XML of the law (gesetze-im-internet.de; statutory text, not protected: §5 UrhG). No manual
transcription: the four partial rates are parsed from the law's own tables and summed exactly as §3(3) prescribes —
infrastructure (by weight and axles) + air pollution (by Euro category) + noise + CO₂ (by CO₂ emission class).
Rates in EUR per kilometre. Validity: the consolidated text as of its "Stand" line, kept with the record.
Also the toll SCHEME object (operator, legal basis) that road sections are subject to."""

import html
import io
import re
import zipfile

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
URL = "https://www.gesetze-im-internet.de/bfstrmg/xml.zip"
SCHEME = "DE-LKW-MAUT"
TARIFF = "DE-BFSTRMG-ANLAGE1"
# vehicle classes (technically permissible maximum mass × axles), as the law's columns name them
CLASSES = ["> 3,5 t e < 7,5 t", "≥ 7,5 t e < 12 t", "≥ 12 t e ≤ 18 t", "> 18 t, fino a 3 assi", "> 18 t, 4 assi", "> 18 t, 5 o più assi"]
# Euro categories of Anlage 1 no. 2(b)
EURO = {"A": "EURO VI", "B": "EURO V / EEV 1", "C": "EURO IV", "D": "EURO III", "E": "EURO II", "F": "EURO I o nessuna",
        "G": "più pulito di EURO VI (cat. G)"}
# the CO₂ class 1 rows of no. 4(a) depend on the Euro class
CO2_1_ROW = {"F": 0, "E": 1, "D": 1, "C": 2, "B": 2, "A": 3}


def describe():
    return {"connector_version": VERSION, "produces": ["toll.scheme", "toll.tariff"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(URL, "bfstrmg_xml.zip")]


def next_state(state, request, result, today=None):
    return dict(state or {})


def _num(s):
    return float(s.replace(",", "."))


def _rows(fragment):
    """Table rows of an XML fragment as lists of cell texts."""
    out = []
    for row in re.findall(r"<row[^>]*>(.*?)</row>", fragment, re.S):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<entry[^>]*>(.*?)</entry>", row, re.S)]
        out.append(cells)
    return out


def tariff_from_xml(x):
    i = x.find("<enbez>Anlage 1</enbez>")
    j = x.find("<enbez>Anlage 2</enbez>")
    a = x[i:j]
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", a)))
    part1 = text[text.find("1. Mautteilsatz"):text.find("2. Mautteilsatz")]
    infra5 = [_num(v) for v in re.findall(r"(\d,\d{3}) Euro", part1)]
    tables = [_rows(t) for t in re.findall(r"<tgroup[^>]*>(.*?)</tgroup>", a, re.S)]
    air = {r[0]: [_num(v) for v in r[1:6]] for r in tables[0] if r and r[0] in EURO}
    noise5 = next([_num(v) for v in r[:5]] for r in tables[1] if r and re.match(r"^\d,\d{3}$", r[0] or ""))
    co2 = [r for r in tables[2] if r and any(re.match(r"^\d,\d{3}$|^0$", c) for c in r)]
    co2_1 = [[_num(v) for v in r[-6:]] for r in co2[:4]]                # class 1, by Euro class (4 rows)
    co2_k = {int(r[0]): [_num(v) for v in r[-6:]] for r in co2[4:]}     # classes 2–5
    assert len(infra5) == 5 and len(air) == 7 and len(noise5) == 5 and len(co2_1) == 4 and sorted(co2_k) == [2, 3, 4, 5], \
        "the law's Anlage 1 changed shape: not parsed rather than guessed"
    six = lambda five: five + [five[4]]                                  # "> 18 t, 4 or more axles" covers 4 and 5+
    rates = []
    for c in range(6):
        for e in EURO:
            for k in (1, 2, 3, 4, 5):
                if k == 1 and e == "G":
                    continue                                             # category G is not in the class-1 rows
                c2 = co2_1[CO2_1_ROW[e]][c] if k == 1 else co2_k[k][c]
                parts = [six(infra5)[c], six(air[e])[c], six(noise5)[c], c2]
                rates.append([c, e, k, round(sum(parts), 3), *parts])
    stand = re.search(r"<standkommentar>(.*?)</standkommentar>", x)
    return rates, (stand.group(1) if stand else None)


def parse(data: bytes, meta: dict):
    if data[:2] != b"PK":
        return
    z = zipfile.ZipFile(io.BytesIO(data))
    x = z.read(next(n for n in z.namelist() if n.endswith(".xml"))).decode("utf-8")
    rates, stand = tariff_from_xml(x)
    scheme_props = {"operator": "Toll Collect GmbH (per conto della Repubblica federale di Germania)",
                    "legal_basis": "Bundesfernstraßenmautgesetz (BFStrMG)", "vehicles": "veicoli > 3,5 t",
                    "infrastructure": "autostrade e strade federali (Bundesfernstraßen)", "currency": "EUR"}
    yield NormalizedRecord(source_id=meta["source_id"], native_id=SCHEME, native_version=content_version(scheme_props),
                           kind="object", type="toll.scheme", label="Pedaggio autocarri in Germania (Lkw-Maut)",
                           identifiers=[("toll_scheme", SCHEME)], properties=scheme_props,
                           assertions=[Assertion("relation", "located_in", Target("place.country", scheme="iso3166a2", value="DE"))],
                           status="reviewed", method="asserted", raw_locator="BFStrMG")
    props = {"rates": rates, "dims": [CLASSES, [[k, v] for k, v in EURO.items()], [1, 2, 3, 4, 5]],   # class · Euro · CO₂
             "dim_labels": ["Classe del veicolo (massa e assi)", "Categoria Euro", "Classe di emissione CO₂"],
             "components": ["infrastruttura", "inquinamento atmosferico", "rumore", "CO₂"], "unit": "EUR/km", "currency": "EUR",
             "rounding": "per tratta: lunghezza × tariffa, arrotondata al centesimo (§ 3 comma 4)",
             "validity": stand or "testo consolidato", "legal_ref": "BFStrMG, Anlage 1 (zu § 3 Absatz 3)"}
    yield NormalizedRecord(source_id=meta["source_id"], native_id=TARIFF, native_version=content_version(props),
                           kind="object", type="toll.tariff", label="Tariffe Lkw-Maut (BFStrMG, Anlage 1)",
                           identifiers=[("toll_tariff", TARIFF)], properties=props,
                           assertions=[Assertion("relation", "tariff_of", Target("toll.scheme", scheme="toll_scheme", value=SCHEME))],
                           status="reviewed", method="asserted", raw_locator="BFStrMG Anlage 1")
