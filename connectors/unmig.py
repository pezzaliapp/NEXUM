"""MASE — UNMIG: the offshore hydrocarbon structures of the Italian Adriatic (NEXUM Offshore, Phase 1, 2026-10-10;
audit NEXUM-OFFSHORE-AUDIT.md).

Licence: CC BY 4.0 for the lists ("I dati sono distribuiti con licenza Creative Commons Attribuzione 4.0 Internazionale
CC BY 4.0", dataset pages read 2026-10-10); IODL 2.0 for the connection schemes of the WebGIS (attribution, never an
official character). Every element states its source, the list's own reference date and "Dati rielaborati da NEXUM –
elaborazione non ufficiale". Nothing is live: the lists are updated twice a year.

What is read (five static files, keyless):
- the platforms and similar structures (XLSX), zones ZA and ZB only (the Adriatic zones of the source's "Zona" column);
- the producing wells (XLSX), at sea ("Ub" = M) in zones ZA and ZB ("Pr" column), with the status code read through the
  legend printed in the official list (PDF of the same edition): no code is interpreted without it;
- the collection and treatment plants (XLSX), the whole national list (the platforms name them in their "Centrale" column);
- the mining titles in force (XLSX): production concessions at sea in zones A and B;
- the connection schemes (KML): straight lines between two named structures. They become relations only (never a line
  on the map, never a pipeline route), and only when both names are, exactly, structures of the lists.

Relations come only from a column of the source: well → platform ("Piattaforma"), platform → plant or FSO ("Centrale"),
platform → concession ("Concessione di coltivazione"), platform → operator ("Operatore"), platform → structure (scheme).
A name that is not exactly an element of the lists stays unresolved (the Core never applies it): nothing is deduced from
position or proximity, and names are never merged ("ENERGEAN" of the platforms is not "ENERGEAN ITALY" of the wells:
the wells and the concessions keep their operator and holders as the source writes them)."""

import datetime as dt
import io
import re
import xml.etree.ElementTree as ET
import zipfile

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://unmig.mase.gov.it/wp-content/uploads/dati/"
FILES = {
    "piattaforme.xlsx": BASE + "piattaforme/piattaforme.xlsx",
    "pozzi-idrocarburi.xlsx": BASE + "pozzi/pozzi-idrocarburi.xlsx",
    "centrali-idrocarburi.xlsx": BASE + "centrali/centrali-idrocarburi.xlsx",
    "titoli-idrocarburi.xlsx": BASE + "titoli/titoli-idrocarburi.xlsx",
    "collegamenti.kml": BASE + "kml/collegamenti.kml",
}
PAGES = {
    "piattaforme.xlsx": "https://unmig.mase.gov.it/ricerca-e-coltivazione-di-idrocarburi/piattaforme-marine/",
    "pozzi-idrocarburi.xlsx": "https://unmig.mase.gov.it/ricerca-e-coltivazione-di-idrocarburi/pozzi-produttivi/",
    "centrali-idrocarburi.xlsx": "https://unmig.mase.gov.it/ricerca-e-coltivazione-di-idrocarburi/centrali-di-raccolta-e-trattamento/",
    "titoli-idrocarburi.xlsx": "https://unmig.mase.gov.it/ricerca-e-coltivazione-di-idrocarburi/elenco-dei-titoli-minerari/",
    "collegamenti.kml": "https://unmig.mase.gov.it/webgis-unmig/",
}
LISTS = {
    "piattaforme.xlsx": "Elenco delle piattaforme marine e strutture assimilabili",
    "pozzi-idrocarburi.xlsx": "Elenco dei pozzi per la coltivazione di idrocarburi",
    "centrali-idrocarburi.xlsx": "Elenco delle centrali di raccolta e trattamento di idrocarburi",
    "titoli-idrocarburi.xlsx": "Elenco dei titoli minerari vigenti",
    "collegamenti.kml": "Schemi di collegamento tra piattaforme marine e tra piattaforme e centrali (WebGIS UNMIG)",
}
OWNER = "MASE – DG FTA – UNMIG"
NOT_OFFICIAL = "Dati rielaborati da NEXUM – elaborazione non ufficiale"
ZONES = {"ZA": "Zona A", "ZB": "Zona B"}            # Phase 1: the Adriatic zones of the source's "Zona" column
# the legend printed at the end of the official list of wells (pozzi-idrocarburi.pdf, "Dati al 31 dicembre 2025 -
# Aggiornamento del 12 febbraio 2026", read 2026-10-10); a code not in it is shown as is, never interpreted
WELL_STATUS = {"PR": "Produttivo erogante", "PP": "Produttivo non erogante", "RE": "Reiniezione", "MO": "Monitoraggio",
               "AL": "Non produttivo", "PS": "Potenzialmente utilizzabile per lo stoccaggio", "ST": "Stoccaggio"}
WELL_LEGEND = "legenda dell'elenco ufficiale dei pozzi (PDF UNMIG della stessa edizione)"
# the Yes/No columns of the platforms list, named as the source names them
FLAGS = ["Inattiva", "Supporto alla produzione", "Transito", "Compressione", "Dismissione", "Modulo alloggi",
         "Presidiata h24 7/7"]
MINERAL = {"GAS": "gas", "OLIO": "olio"}
MAX_XML = 40 * 1024 * 1024                          # a list is < 2 MB unpacked: anything far larger is not one of them
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
KML = "{http://www.opengis.net/kml/2.2}"


def describe():
    return {"connector_version": VERSION, "produces": ["energy.offshore_platform", "energy.hc_well", "energy.hc_centrale",
                                                       "energy.hc_concession", "org.company"]}


def plan(mode, state, source, today=None):
    return [FetchRequest(url, key) for key, url in FILES.items()]


def next_state(state, request, result, today=None):
    return state


def name_key(s):
    """The exact name of a structure as a key (the source's spaces and case aside): never a fuzzy match."""
    return re.sub(r"\s+", " ", str(s or "")).strip().upper()


def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def xlsx_rows(data: bytes):
    """The rows of the first sheet of an XLSX file, as lists of strings (standard library only)."""
    z = zipfile.ZipFile(io.BytesIO(data))
    for name in ("xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"):
        if name in z.namelist() and z.getinfo(name).file_size > MAX_XML:
            raise ValueError(f"{name}: too large for a UNMIG list")
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    rows = []
    for r in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(NS + "row"):
        cells = {}
        for c in r.iter(NS + "c"):
            v, t = c.find(NS + "v"), c.get("t")
            if t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is None:
                val = ""
            elif t == "s":
                val = shared[int(v.text)]
            else:
                val = v.text or ""
            cells[_col(c.get("r"))] = val
        rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
    return rows


def _h(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def _num(v, digits=None):
    s = str(v or "").strip().replace(",", ".")
    if s in ("", "-"):
        return None
    try:
        x = float(s)
    except ValueError:
        return None
    return round(x, digits) if digits is not None else x


def _int(v):
    x = _num(v)
    return int(x) if x is not None and x == int(x) else None


def _text(v):
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s if s and s != "-" else None


def reference(rows, key):
    """The list's own reference date, as it prints it in its first rows ("Dati al …" / "Aggiornamento: …")."""
    for r in rows[:6]:
        s = _h(r[0] if r else "")
        if key == "titoli-idrocarburi.xlsx":
            m = re.match(r"Aggio\w*ament\w*\s*:\s*(\d{1,2}/\d{1,2}/\d{4})$", s, re.I)   # the source writes "Aggioramento"
            if m:
                return f"Aggiornamento al {m.group(1)}"
        elif re.match(r"Dati al \d{1,2} \w+ \d{4}", s):
            return s
    return None


MONTHS = {m: i for i, m in enumerate(["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
                                       "settembre", "ottobre", "novembre", "dicembre"], start=1)}


def as_of(ref):
    """The reference date in short, for the card's first line (a phone shows only short facts): "Dati al 31 dicembre 2025
    - Aggiornamento del 12 febbraio 2026" → "31/12/2025 (agg. 12/02/2026)"; "Aggiornamento al 30/9/2026" → as the
    source dates it. The full wording stays in data_ref."""
    d = [f"{int(g):02d}/{MONTHS[m.lower()]:02d}/{y}" for g, m, y in re.findall(r"(\d{1,2}) (\w+) (\d{4})", ref or "") if m.lower() in MONTHS]
    if len(d) == 2 and ref.startswith("Dati al"):
        return f"{d[0]} (agg. {d[1]})"
    m = re.match(r"Aggiornamento al (\d{1,2}/\d{1,2}/\d{4})$", ref or "")
    return f"{m.group(1)} (aggiornamento)" if m else ref


def _source_line(key, ref):
    return f"Fonte: {OWNER}, «{LISTS[key]}» — {ref} — {PAGES[key]} — licenza CC BY 4.0. {NOT_OFFICIAL}."


def _table(rows, first):
    """(header, data rows) of a list whose header row starts with `first`; section titles are kept per row."""
    header, out, section = None, [], None
    for r in rows:
        cells = [_h(c) for c in r]
        if cells and cells[0] == first:
            # a later section repeats the header: its columns are the same, by position (the FSO section of the
            # 2025 list spells one of them "Presidite h24 7/7"), so the first header names them
            if header is None or len(cells) != len(header):
                header = cells
            continue
        filled = [c for c in cells if c]
        if len(filled) == 1 and cells[0] and header is not None and not cells[0].isdigit():
            section = cells[0]
            continue
        if header is None and len(filled) == 1 and cells[0]:
            section = cells[0]
            continue
        if header and len(filled) > 2:
            out.append((dict(zip(header, r)), section))
    return header, out


def key_of(meta):
    url = meta.get("url") or ""
    return next((k for k, u in FILES.items() if url == u), url.rsplit("/", 1)[-1])


def parse(data: bytes, meta: dict):
    key = key_of(meta)
    if key == "collegamenti.kml":
        yield from links(data, meta)
        return
    rows = xlsx_rows(data)
    ref = reference(rows, key)
    if not ref:
        return                                          # no reference date in the file: nothing is published without one
    fn = {"piattaforme.xlsx": platforms, "pozzi-idrocarburi.xlsx": wells, "centrali-idrocarburi.xlsx": centrali,
          "titoli-idrocarburi.xlsx": titles}.get(key)
    if fn:
        yield from fn(rows, ref, meta, key)


def _company(sid, name):
    return NormalizedRecord(
        source_id=sid, native_id=f"operator:{name}", native_version=name, kind="object", type="org.company", label=name,
        identifiers=[("unmig_operator", name)], properties={"role_note": "Operatore delle piattaforme nell'elenco UNMIG"},
        status="reviewed", method="asserted", raw_locator=f"operator:{name}")


def platforms(rows, ref, meta, key):
    sid = meta["source_id"]
    _hdr, table = _table(rows, "N.")
    names = {name_key(r.get("Nome struttura")) for r, _s in table}
    fso = {name_key(r.get("Nome struttura")) for r, _s in table if "galleggiante" in (_text(r.get("Tipo struttura")) or "")}
    operators = set()
    for i, (r, section) in enumerate(table):
        zone, uid, name = _text(r.get("Zona")), _text(r.get("Id")), _text(r.get("Nome struttura"))
        lat, lon = _num(r.get("Latitudine"), 6), _num(r.get("Longitudine"), 6)
        if zone not in ZONES or not (uid and uid.isdigit()) or not name or lat is None or lon is None:
            continue
        structure = _text(r.get("Tipo struttura"))
        flags = [f for f in FLAGS if _text(r.get(f)) == "Sì"]
        centrale = _text(r.get("Centrale"))
        props = {
            "structure_class": structure_class(structure), "structure": structure, "section": section,
            "zone": ZONES[zone], "concession": _text(r.get("Concessione di coltivazione")),
            "operator": _text(r.get("Operatore")), "mineral": MINERAL.get(_text(r.get("Minerale")) or "", _text(r.get("Minerale"))),
            "year_installed": _int(r.get("Anno di installazione")), "coast_km": _num(r.get("Distanza dalla costa (km)")),
            "height_m": _num(r.get("Altezza SLM (m)")), "depth_m": _num(r.get("Profondità fondale (m)")),
            "centrale": centrale, "wells_connected": _int(r.get("Numero pozzi collegati")),
            "within_12nm": _text(r.get("Entro 12 miglia dalla costa e dalle aree marine protette")),
            "unmig_flags": " · ".join(flags) if flags else "nessuna",
            "source_note": _text(r.get("Note")), "as_of": as_of(ref), "data_ref": ref, "source_line": _source_line(key, ref),
        }
        a = []
        if centrale:
            ck = name_key(centrale)
            if ck in names and ck in fso:            # an FSO of the same list named as the structure's "Centrale"
                a.append(Assertion("relation", "delivers_to", Target("energy.offshore_platform", scheme="unmig_platform_name", value=ck)))
            elif ck not in names:
                a.append(Assertion("relation", "delivers_to", Target("energy.hc_centrale", scheme="unmig_centrale_name", value=ck)))
        if props["concession"]:
            a.append(Assertion("relation", "in_concession", Target("energy.hc_concession", scheme="unmig_title_name", value=name_key(props["concession"]))))
        if props["operator"]:
            operators.add(props["operator"])
            a.append(Assertion("relation", "operated_by", Target("org.company", scheme="unmig_operator", value=props["operator"])))
        yield NormalizedRecord(
            source_id=sid, native_id=f"platform:{uid}", native_version=content_version([r, section, ref, VERSION]),
            kind="object", type="energy.offshore_platform", label=name,
            identifiers=[("unmig_platform", uid), ("unmig_platform_name", name_key(name))], properties=props,
            geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=50.0, status="reviewed",
            method="asserted", assertions=a, raw_locator=f"{key}#Id={uid}")
    for name in sorted(operators):
        yield _company(sid, name)


def structure_class(s):
    """The kind of structure, as the source's own words begin ("struttura reticolare 8 gambe" → struttura reticolare)."""
    s = (s or "").lower()
    for k in ("struttura reticolare", "monotubolare", "bitubolare", "cluster", "testa pozzo sottomarina", "unità galleggiante"):
        if s.startswith(k):
            return k
    return "altro" if s else None


def wells(rows, ref, meta, key):
    sid = meta["source_id"]
    _hdr, table = _table(rows, "Id")
    for r, _s in table:
        uid, name = _text(r.get("Id")), _text(r.get("Nome pozzo"))
        if _text(r.get("Ub")) != "M" or _text(r.get("Pr")) not in ZONES or not (uid and uid.isdigit()) or not name:
            continue
        code = _text(r.get("Stato"))
        lat, lon = _num(r.get("Latitudine"), 6), _num(r.get("Longitudine"), 6)
        platform = _text(r.get("Piattaforma"))
        centrale = _text(r.get("Centrale"))
        props = {
            "status_code": code, "status": (f"{WELL_STATUS[code]} ({WELL_LEGEND})" if code in WELL_STATUS else
                                            (f"codice «{code}» non presente nella legenda ufficiale" if code else None)),
            "field": _text(r.get("Campo")), "platform": platform, "concession": _text(r.get("Concessione")),
            "centrale": centrale, "operator": _text(r.get("Operatore")), "zone": ZONES[_text(r.get("Pr"))],
            "coordinates": (f"{lat:.6f} N, {lon:.6f} E (dichiarate dalla fonte)" if lat is not None and lon is not None else None),
            "as_of": as_of(ref), "data_ref": ref, "source_line": _source_line(key, ref),
        }
        a = []
        if platform:
            a.append(Assertion("relation", "on_platform", Target("energy.offshore_platform", scheme="unmig_platform_name", value=name_key(platform))))
        yield NormalizedRecord(
            source_id=sid, native_id=f"well:{uid}", native_version=content_version([r, ref, VERSION]), kind="object",
            type="energy.hc_well", label=name, identifiers=[("unmig_well", uid)], properties=props, status="reviewed",
            method="asserted", assertions=a, raw_locator=f"{key}#Id={uid}")


def centrali(rows, ref, meta, key):
    sid = meta["source_id"]
    _hdr, table = _table(rows, "Id")
    for r, _s in table:
        uid, name = _text(r.get("Id")), _text(r.get("Nome centrale"))
        lat, lon = _num(r.get("Latitudine"), 6), _num(r.get("Longitudine"), 6)
        if not (uid and uid.isdigit()) or not name or lat is None or lon is None:
            continue
        props = {
            "mineral": _text(r.get("Minerale")), "wells_connected": _int(r.get("N. pozzi")), "comune": _text(r.get("Comune")),
            "provincia": _text(r.get("Provincia")), "regione": _text(r.get("Regione")), "operator": _text(r.get("Operatore")),
            "area_m2": _num(r.get("Area (m2")),
            "as_of": as_of(ref), "data_ref": ref, "source_line": _source_line(key, ref),
        }
        yield NormalizedRecord(
            source_id=sid, native_id=f"centrale:{uid}", native_version=content_version([r, ref, VERSION]), kind="object",
            type="energy.hc_centrale", label=name, identifiers=[("unmig_centrale", uid), ("unmig_centrale_name", name_key(name))],
            properties=props, geometry={"type": "Point", "coordinates": [lon, lat]}, geo_uncertainty_m=200.0,
            status="reviewed", method="asserted", raw_locator=f"{key}#Id={uid}")


def title_rows(rows):
    """The titles of the list: one title spans several rows (its zones, holders and acts go on below, with an empty id);
    their values are joined as the CSV of the same page joins them (" - ")."""
    header, out = None, []
    for r in rows:
        cells = [_h(c) for c in r]
        if cells and cells[0] == "id":
            header = cells
        elif header and cells and cells[0].isdigit():
            out.append(dict(zip(header, r)))
        elif header and out and any(cells):
            for k, v in zip(header, r):
                if _h(v):
                    out[-1][k] = f"{out[-1][k]} - {v}" if _h(out[-1].get(k)) else v
    return out


def titles(rows, ref, meta, key):
    sid = meta["source_id"]
    for r in title_rows(rows):
        uid, name = _text(r.get("id")), _text(r.get("titolo"))
        zone = _text(r.get("zona")) or ""
        if (_text(r.get("tipo")) != "Concessione di coltivazione" or _text(r.get("ubic")) != "Mare"
                or not re.search(r"\bZona [AB]\b", zone) or not (uid and uid.isdigit()) or not name):
            continue
        props = {"title_kind": _text(r.get("tipo")), "holders": _text(r.get("titolari")), "granted": excel_date(r.get("conferimento")),
                 "period": _text(r.get("vigenza")), "area_km2": _num(r.get("area")), "zone": zone,
                 "as_of": as_of(ref), "data_ref": ref, "source_line": _source_line(key, ref)}
        yield NormalizedRecord(
            source_id=sid, native_id=f"title:{uid}", native_version=content_version([r, ref, VERSION]), kind="object",
            type="energy.hc_concession", label=name, identifiers=[("unmig_title", uid), ("unmig_title_name", name_key(name))],
            properties=props, status="reviewed", method="asserted", raw_locator=f"{key}#id={uid}")


def excel_date(v):
    """A date cell: an Excel serial day (1900 system) as dd/mm/yyyy, or the source's text as is."""
    s = _text(v)
    if s and re.fullmatch(r"\d{4,5}", s):
        d = dt.date(1899, 12, 30) + dt.timedelta(days=int(s))
        return d.strftime("%d/%m/%Y")
    return s


def link_names(name):
    """The two structures a scheme joins, from its name ("Collegamento A - B"), or None."""
    m = re.fullmatch(r"Collegamento (.+?) - (.+)", re.sub(r"\s+", " ", name or "").strip())
    return (m.group(1).strip(), m.group(2).strip()) if m else None


def links(data, meta):
    """Connection schemes → relations between two named structures (graph only). The first name is a platform; the
    second a platform or a plant: both are asked by exact name, and the names of the two lists never coincide (checked
    by the tests), so at most one of the two resolves; the other stays unresolved and is never applied."""
    sid = meta["source_id"]
    note = (f"Schema di collegamento del WebGIS UNMIG (licenza IODL 2.0): indica che due strutture sono collegate, non il "
            f"tracciato della condotta; nessuna data di riferimento dichiarata dalla fonte. {NOT_OFFICIAL}.")
    for i, pm in enumerate(ET.fromstring(data).iter(KML + "Placemark")):
        pair = link_names((pm.findtext(KML + "name") or ""))
        if not pair:
            continue
        a, b = (name_key(x) for x in pair)
        for to_type, scheme in (("energy.offshore_platform", "unmig_platform_name"), ("energy.hc_centrale", "unmig_centrale_name")):
            yield NormalizedRecord(
                source_id=sid, native_id=f"link:{a}|{b}|{to_type}", native_version=content_version([a, b, VERSION]),
                kind="relation", type="scheme_link",
                subject=Target("energy.offshore_platform", scheme="unmig_platform_name", value=a),
                obj=Target(to_type, scheme=scheme, value=b), properties={"note": note, "scheme_name": f"{pair[0]} - {pair[1]}"},
                status="reviewed", method="asserted", raw_locator=f"collegamenti.kml#Placemark[{i}]")
