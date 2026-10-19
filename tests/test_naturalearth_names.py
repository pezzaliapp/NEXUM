"""Search review (2026-10-18): a place is found by the other names Natural Earth gives it (Italian, local, alternative),
not only by its English label — "milano" found an airfield in Brazil. Only Natural Earth's own fields; a new name set
changes the record's version (else the Core keeps the earlier record)."""
from connectors import naturalearth_places as ne


def test_other_names_from_natural_earth_fields_only():
    assert ne.other_names({"NAME": "Milan", "NAMEASCII": "Milan", "NAMEPAR": "Milano", "NAMEALT": "", "NAME_IT": "Milano"}) == ["Milano"]
    assert ne.other_names({"NAME": "Turin", "NAMEASCII": "Turin", "NAMEALT": "Torino", "NAME_IT": "Torino"}) == ["Torino"]
    assert ne.other_names({"NAME": "Florence", "NAMEASCII": "Florence", "NAME_IT": "Firenze"}) == ["Firenze"]
    assert ne.other_names({"NAME": "Naples", "NAMEPAR": "Napoli", "NAME_IT": "Napoli"}) == ["Napoli"]
    assert ne.other_names({"NAME": "Rome", "NAME_IT": "Roma"}) == ["Roma"]
    assert ne.other_names({"NAME": "Bologna", "NAMEASCII": "Bologna", "NAME_IT": "Bologna"}) == []
    # several alternative names in one field (Natural Earth separates them with "|")
    assert ne.other_names({"NAME": "X", "NAMEALT": "A|B"}) == ["A", "B"]
    # a field Natural Earth does not have: nothing invented
    assert ne.other_names({"NAME": "Y"}) == []
    # a variant that differs only by accents or case is searched the same way already: not repeated (2026-10-19,
    # search index size), a really different name stays
    assert ne.other_names({"NAME": "Tây Ninh", "NAMEASCII": "Tay Ninh"}) == []
    assert ne.other_names({"NAME": "Kebili", "NAMEALT": "Kébili|Qibili"}) == ["Qibili"]
    assert ne.other_names({"NAME": "München", "NAMEASCII": "Munchen", "NAME_IT": "Monaco di Baviera"}) == ["Monaco di Baviera"]


def test_name_set_is_part_of_the_record_version():
    assert ne.NAMES_V == "names-2" and ne.VERSION >= "1.2.1"
    assert set(ne.NAME_FIELDS) == {"nameascii", "namepar", "namealt", "name_it"}
