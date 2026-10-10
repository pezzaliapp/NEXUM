"""NEXUM OFFSHORE, Phase 1 Adriatic (2026-10-10): the connector reads the official UNMIG lists and states what it read.
Fixed inputs (fixtures/offshore: unmodified copies of the official files read on 2026-10-10), no network.

- Parity: what is imported from the XLSX lists equals the CSV the same pages publish (an independent file), field by field.
- Relations: only from a column of the source, by exact name; nothing from position (the connector computes no distance).
- Wells: the status code is read only through the legend printed in the official list.
- Every element carries its reference date, the source with its licence and "Dati rielaborati da NEXUM – elaborazione
  non ufficiale"; nothing is said to be live; a list without its reference date publishes nothing.
- Connection schemes: relations of the graph only (vocabulary hint map_line = false)."""

import csv
import io
import pathlib
import re

from connectors import unmig
from nexum.core.types import load_types

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIX = ROOT / "fixtures" / "offshore"
TS = load_types([str(ROOT / "vocab_live")])
NEW_TYPES = {"energy.offshore_platform", "energy.hc_well", "energy.hc_centrale", "energy.hc_concession", "org.company"}


def _recs(key, path=None):
    return list(unmig.parse((FIX / (path or key)).read_bytes(), {"source_id": "mase.unmig", "url": unmig.FILES[key]}))


def _csv(name, enc):
    return list(csv.DictReader(io.StringIO((FIX / name).read_text(encoding=enc)), delimiter=";"))


def _by_type(recs, t):
    return [r for r in recs if r.type == t]


def _col(row, name):   # the CSV headers carry stray spaces and no-break spaces
    return next(v for k, v in row.items() if k and k.replace("\xa0", " ").strip() == name)


def test_platforms_equal_the_official_csv():
    recs = _by_type(_recs("piattaforme.xlsx"), "energy.offshore_platform")
    rows = [r for r in _csv("piattaforme.csv", "latin-1") if r["Zona"] in ("ZA", "ZB")]
    assert len(recs) == len(rows) == 121
    by_id = {r.native_id.split(":", 1)[1]: r for r in recs}
    for row in rows:
        r = by_id[row["Id"]]
        p = r.properties
        assert r.label == row["Nome struttura"].strip()
        assert r.geometry["coordinates"] == [float(row["Longitudine"].replace(",", ".")), float(row["Latitudine"].replace(",", "."))]
        assert p["operator"] == row["Operatore"].strip() and p["concession"] == (row["Concessione di coltivazione"].strip() or None)
        assert p["structure"] == row["Tipo struttura"].strip() and (p["centrale"] or "-") == (row["Centrale"].strip() or "-")
        assert p["year_installed"] == int(row["Anno di installazione"])
        assert p["wells_connected"] == int(row["Numero pozzi collegati"])
        flags = [f for f in unmig.FLAGS if row[f].strip() == "Sì"]
        assert p["unmig_flags"] == (" · ".join(flags) if flags else "nessuna")
        assert p["mineral"] == {"GAS": "gas", "OLIO": "olio"}[row["Minerale"]]
        TS.validate_props(r.type, p)


def test_wells_centrali_titles_equal_the_official_csv():
    wells = _by_type(_recs("pozzi-idrocarburi.xlsx"), "energy.hc_well")
    rows = [r for r in _csv("pozzi-idrocarburi.csv", "latin-1") if r["Ub"].strip() == "M" and r["Pr"].strip() in ("ZA", "ZB")]
    assert len(wells) == len(rows) == 624
    by_id = {r.native_id.split(":", 1)[1]: r for r in wells}
    for row in rows:
        r = by_id[row["Id"].strip()]
        assert r.label == row["Nome pozzo"].strip() and r.properties["status_code"] == row["Stato"].strip()
        assert r.properties["platform"] == row["Piattaforma"].strip()
        assert r.geometry is None                                   # information about a platform, never a map point
    cen = _by_type(_recs("centrali-idrocarburi.xlsx"), "energy.hc_centrale")
    crow = _csv("centrali-idrocarburi.csv", "latin-1")
    assert len(cen) == len(crow) == 82
    cby = {r.native_id.split(":", 1)[1]: r for r in cen}
    for row in crow:
        r = cby[row["Id"]]
        assert r.label == row["Nome centrale"].strip()
        assert r.geometry["coordinates"] == [float(row["Longitudine"].replace(",", ".")), float(_col(row, "Latitudine").replace(",", "."))]
    tit = _by_type(_recs("titoli-idrocarburi.xlsx"), "energy.hc_concession")
    trow = [r for r in _csv("titoli-idrocarburi.csv", "utf-8-sig") if r["tipo"] == "Concessione di coltivazione"
            and r["ubic"] == "Mare" and re.search(r"\bZona [AB]\b", r["zona"])]
    assert {r.native_id.split(":", 1)[1] for r in tit} == {r["id"] for r in trow} and len(tit) == 48
    tby = {r.native_id.split(":", 1)[1]: r for r in tit}
    for row in trow:
        p = tby[row["id"]].properties
        assert tby[row["id"]].label == row["titolo"].strip() and p["granted"] == row["conferimento"]
        assert p["zone"] == row["zona"] and p["holders"] == row["titolari"] and p["period"] == row["vigenza"]


def test_relations_only_from_declared_columns():
    plat = _recs("piattaforme.xlsx")
    rows = {r["Id"]: r for r in _csv("piattaforme.csv", "latin-1")}
    for r in _by_type(plat, "energy.offshore_platform"):
        row = rows[r.native_id.split(":", 1)[1]]
        declared = {"delivers_to": unmig.name_key(row["Centrale"]), "in_concession": unmig.name_key(row["Concessione di coltivazione"]),
                    "operated_by": row["Operatore"].strip()}
        for a in r.assertions:
            assert a.target.value == declared[a.type] and a.target.value     # the value of the row's own column, exactly
    for r in _by_type(_recs("pozzi-idrocarburi.xlsx"), "energy.hc_well"):
        assert [(a.type, a.target.value) for a in r.assertions] == [("on_platform", unmig.name_key(r.properties["platform"]))]
    for r in _recs("titoli-idrocarburi.xlsx") + _recs("centrali-idrocarburi.xlsx"):
        assert not r.assertions
    src = (ROOT / "connectors" / "unmig.py").read_text()
    assert not re.search(r"haversine|distance|radians|near", src.split('"""', 2)[2])   # no proximity in the code


def test_relation_targets_resolve_only_by_exact_name():
    plat = _by_type(_recs("piattaforme.xlsx"), "energy.offshore_platform")
    pnames = {unmig.name_key(r.label) for r in plat}
    cnames = {unmig.name_key(r.label) for r in _by_type(_recs("centrali-idrocarburi.xlsx"), "energy.hc_centrale")}
    assert not pnames & cnames                                             # a scheme's end resolves to one list at most
    wells = _by_type(_recs("pozzi-idrocarburi.xlsx"), "energy.hc_well")
    assert all(a.target.value in pnames for r in wells for a in r.assertions)       # 624/624 wells on a listed platform
    ends = [a.target.value for r in plat for a in r.assertions if a.type == "delivers_to"]
    unresolved = sorted({v for v in ends if v not in cnames and v not in pnames})
    assert unresolved == ["MARIA MARE"]                                   # named by the list, absent from both lists: no relation
    links = _recs("collegamenti.kml")
    assert len(links) == 2 * 137 and all(r.type == "scheme_link" and "non il tracciato" in r.properties["note"] for r in links)
    ok = {(r.subject.value, r.obj.value) for r in links if r.subject.value in pnames and
          r.obj.value in (pnames if r.obj.type == "energy.offshore_platform" else cnames)}
    assert len(ok) == 116          # Adriatic structures at both ends; "Tie-in …"/"Manifold …" ends are not elements


def test_wells_status_only_through_the_official_legend():
    legend = dict(re.match(r"(\w\w)\s+(.+)", line).groups() for line in (FIX / "pozzi-legenda.txt").read_text().splitlines() if line.strip())
    assert legend == unmig.WELL_STATUS
    head = (FIX / "pozzi-legenda-intestazione.txt").read_text()
    ref = next(r.properties["data_ref"] for r in _recs("pozzi-idrocarburi.xlsx"))
    assert ref in head                                                      # the legend is of the same edition
    rec = next(r for r in _recs("pozzi-idrocarburi.xlsx"))
    unknown = unmig.wells([["Dati al 31 dicembre 2025 - x"], ["Id", "Nome pozzo", "Ub", "Pr", "Stato", "Piattaforma"],
                           ["1", "X 1", "M", "ZA", "QQ", rec.properties["platform"]]], "Dati al 31 dicembre 2025", {"source_id": "s"}, "pozzi-idrocarburi.xlsx")
    assert "non presente nella legenda" in next(unknown).properties["status"]


def test_every_element_states_source_licence_reference_date_and_not_official():
    for key in ("piattaforme.xlsx", "pozzi-idrocarburi.xlsx", "centrali-idrocarburi.xlsx", "titoli-idrocarburi.xlsx"):
        for r in _recs(key):
            if r.type == "org.company":
                continue
            p = r.properties
            assert p["data_ref"] and p["data_ref"] in p["source_line"]
            assert p["as_of"] and len(p["as_of"]) <= 40 and p["as_of"] != p["data_ref"]   # short: the compact card shows it
            assert "CC BY 4.0" in p["source_line"] and unmig.NOT_OFFICIAL in p["source_line"] and unmig.PAGES[key] in p["source_line"]
            assert not re.search(r"\blive\b|tempo reale", " ".join(str(v) for v in p.values()), re.I)
            TS.validate_props(r.type, p)
    data = (FIX / "piattaforme.xlsx").read_bytes()
    rows = unmig.xlsx_rows(data)
    assert unmig.reference(rows, "piattaforme.xlsx") == "Dati al 31 dicembre 2025 - Aggiornamento del 12 febbraio 2026"
    assert unmig.reference(rows[3:], "piattaforme.xlsx") is None           # no reference date → nothing published


def test_vocabulary_keeps_the_schemes_off_the_map_and_no_rule_touches_the_new_types():
    for rt in ("on_platform", "delivers_to", "in_concession", "operated_by", "scheme_link"):
        assert TS.relation(rt).display.get("map_line") is False
    for p in list((ROOT / "rules").glob("*.toml")) + list((ROOT / "rules_live").glob("*.toml")):
        assert not NEW_TYPES & set(re.findall(r'"([a-z_]+\.[a-z_]+)"', p.read_text())), p.name
    for e in TS.enrichments:
        assert not NEW_TYPES & set(e.when_types or []) and e.container_type not in NEW_TYPES
