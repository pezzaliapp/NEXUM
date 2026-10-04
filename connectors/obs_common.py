"""Shared shape of OBSERVATIONS (Phase 3B · block 2): what a survey or an official statistic measured, for a country,
with the dates, the instrument and the source. PERCEPTION (survey answers) and REALITY (official statistics) are two
distinct object types and are never combined into an index. Every object is "measured in" its country."""

from connectors.base import content_version
from nexum.core.records import Assertion, NormalizedRecord, Target

# ISO 3166 codes used by European surveys that differ from ISO (EL = Greece, UK = United Kingdom)
SURVEY_TO_ISO = {"EL": "GR", "UK": "GB"}
# Italian names of the countries covered by the European surveys (labels only; identity is the ISO code)
NAMES_IT = {"AT": "Austria", "BE": "Belgio", "BG": "Bulgaria", "CY": "Cipro", "CZ": "Cechia", "DE": "Germania", "DK": "Danimarca",
            "EE": "Estonia", "GR": "Grecia", "ES": "Spagna", "FI": "Finlandia", "FR": "Francia", "HR": "Croazia", "HU": "Ungheria",
            "IE": "Irlanda", "IT": "Italia", "LT": "Lituania", "LU": "Lussemburgo", "LV": "Lettonia", "MT": "Malta", "NL": "Paesi Bassi",
            "PL": "Polonia", "PT": "Portogallo", "RO": "Romania", "SE": "Svezia", "SI": "Slovenia", "SK": "Slovacchia",
            "TR": "Turchia", "MK": "Macedonia del Nord", "ME": "Montenegro", "RS": "Serbia", "AL": "Albania", "MD": "Moldova",
            "GB": "Regno Unito", "BA": "Bosnia ed Erzegovina", "GE": "Georgia", "JP": "Giappone", "CA": "Canada", "US": "Stati Uniti"}

# the 193 member states of the United Nations (ISO 3166-1 alpha-2)
UN193 = set("AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW ".split())


def iso(code):
    c = (code or "").strip().upper()
    c = SURVEY_TO_ISO.get(c, c)
    return c if len(c) == 2 and c.isalpha() else None


def record(meta, native_id, typ, label, iso2, props, scheme="obs_series", text=""):
    props = {**props, "country_iso2": iso2}
    return NormalizedRecord(
        source_id=meta["source_id"], native_id=native_id, native_version=content_version(props),
        kind="object", type=typ, label=label, identifiers=[(scheme, native_id)], properties=props,
        assertions=[Assertion("relation", "measured_in", Target("place.country", scheme="iso3166a2", value=iso2))],
        status="reviewed", method="asserted", raw_locator=native_id, text=text)
