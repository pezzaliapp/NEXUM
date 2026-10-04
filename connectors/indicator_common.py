"""Shared shape of COUNTRY INDICATORS (World Intelligence, 2026-10-03): ONE object per indicator of a source (e.g.
"Popolazione totale · World Bank SP.POP.TOTL", "Generazione elettrica da nucleare · Ember"), holding the values of
every country the source covers, each "measured in" its country. One object per indicator — not one per country —
keeps the published world small (packaging per domain, O7) while every value stays a recorded fact with its period
and its source. Values are the source's own, in its unit; nothing is converted, estimated or filled where the source
publishes nothing (a missing country is a data gap, said as such by the views).

by_country = [[iso2, [[period, value, flag], …]], …] with period "YYYY" (a year), "YYYY-MM" (a month) or "YYYY-MM-DD";
flag is the source's own marker (e.g. "e" estimated) or None.
nature: how the source produced the values — observed · estimated · modelled · reported (as the source declares) ·
ambiguous (the definition cannot be verified: published with that status, never as a comparable value)."""

import json
import pathlib

from connectors.base import content_version
from connectors.obs_common import UN193
from nexum.core.records import Assertion, NormalizedRecord, Target

# ISO 3166-1 alpha-3 → alpha-2 for the 193 UN member states (World Bank country list, verified 2026-10-03)
ISO3_TO_2 = dict(p.split(":") for p in """AFG:AF AGO:AO ALB:AL AND:AD ARE:AE ARG:AR ARM:AM ATG:AG AUS:AU AUT:AT AZE:AZ BDI:BI BEL:BE
BEN:BJ BFA:BF BGD:BD BGR:BG BHR:BH BHS:BS BIH:BA BLR:BY BLZ:BZ BOL:BO BRA:BR BRB:BB BRN:BN BTN:BT BWA:BW CAF:CF CAN:CA CHE:CH CHL:CL
CHN:CN CIV:CI CMR:CM COD:CD COG:CG COL:CO COM:KM CPV:CV CRI:CR CUB:CU CYP:CY CZE:CZ DEU:DE DJI:DJ DMA:DM DNK:DK DOM:DO DZA:DZ ECU:EC
EGY:EG ERI:ER ESP:ES EST:EE ETH:ET FIN:FI FJI:FJ FRA:FR FSM:FM GAB:GA GBR:GB GEO:GE GHA:GH GIN:GN GMB:GM GNB:GW GNQ:GQ GRC:GR GRD:GD
GTM:GT GUY:GY HND:HN HRV:HR HTI:HT HUN:HU IDN:ID IND:IN IRL:IE IRN:IR IRQ:IQ ISL:IS ISR:IL ITA:IT JAM:JM JOR:JO JPN:JP KAZ:KZ KEN:KE
KGZ:KG KHM:KH KIR:KI KNA:KN KOR:KR KWT:KW LAO:LA LBN:LB LBR:LR LBY:LY LCA:LC LIE:LI LKA:LK LSO:LS LTU:LT LUX:LU LVA:LV MAR:MA MCO:MC
MDA:MD MDG:MG MDV:MV MEX:MX MHL:MH MKD:MK MLI:ML MLT:MT MMR:MM MNE:ME MNG:MN MOZ:MZ MRT:MR MUS:MU MWI:MW MYS:MY NAM:NA NER:NE NGA:NG
NIC:NI NLD:NL NOR:NO NPL:NP NRU:NR NZL:NZ OMN:OM PAK:PK PAN:PA PER:PE PHL:PH PLW:PW PNG:PG POL:PL PRK:KP PRT:PT PRY:PY QAT:QA ROU:RO
RUS:RU RWA:RW SAU:SA SDN:SD SEN:SN SGP:SG SLB:SB SLE:SL SLV:SV SMR:SM SOM:SO SRB:RS SSD:SS STP:ST SUR:SR SVK:SK SVN:SI SWE:SE SWZ:SZ
SYC:SC SYR:SY TCD:TD TGO:TG THA:TH TJK:TJ TKM:TM TLS:TL TON:TO TTO:TT TUN:TN TUR:TR TUV:TV TZA:TZ UGA:UG UKR:UA URY:UY USA:US UZB:UZ
VCT:VC VEN:VE VNM:VN VUT:VU WSM:WS YEM:YE ZAF:ZA ZMB:ZM ZWE:ZW""".split())
assert len(ISO3_TO_2) == 193 and set(ISO3_TO_2.values()) == UN193

# the sections of a country's view an indicator belongs to (labels are the views' own)
SECTIONS = ("popolazione", "vivere", "prezzi", "abitazione", "energia", "economia", "infrastrutture")
NATURES = ("observed", "estimated", "modelled", "reported", "ambiguous")
STATISTICS = ("level", "rate", "share", "price", "index", "per_capita", "ratio")


def _r(v):
    """The source's value, without float noise (6 significant digits; integers stay integers)."""
    if isinstance(v, int) or (isinstance(v, float) and v.is_integer() and abs(v) >= 1000):
        return int(v)
    return float(f"{v:.6g}")


# the one legal tender of each UN member state and the date it came into force (Unicode CLDR; connectors/currency_iso.json)
CURRENCY = json.loads((pathlib.Path(__file__).with_name("currency_iso.json")).read_text(encoding="utf-8"))["by_country"]


def local_units(template, rows):
    """[[iso2, unit], …] for values a source publishes in "local currency" without naming it: the currency is named only
    where the state has one legal tender that was already in force for the whole series (a series that crosses a
    change of currency, or a state with two legal tenders, keeps the generic unit)."""
    out = {}
    for c, pts in rows:
        cur = CURRENCY.get(c)
        if not cur or not pts:
            continue
        code, since = cur
        first = int(str(pts[0][0])[:4])
        if first > int(since[:4]) or (first == int(since[:4]) and since[5:] == "01-01"):
            out[c] = template.format(cur=code)
    return [[c, u] for c, u in sorted(out.items())]


def _units(rows, unit_local, unit_of):
    """The unit of each country's values where the indicator's own is generic: as the source states it (unit_of), else
    the country's currency named from CLDR (unit_local), else none (the generic unit stays)."""
    out = dict(local_units(unit_local, rows)) if unit_local else {}
    out.update({c: u for c, u in (unit_of or {}).items() if u})
    return [[c, out[c]] for c, _p in rows if c in out] or None


ANOMALY = "ANOMALIA"


def _flag(f, v, statistic, allow_negative):
    """A value outside the domain its own definition allows is FLAGGED (never corrected, never dropped): a share outside
    0–100, a negative amount. Ratios (e.g. water stress, trade in % of GDP) may exceed 100 and are not flagged."""
    why = None
    if statistic == "share" and not (-0.0001 <= v <= 100.0001) and not allow_negative:
        why = f"{ANOMALY}: quota fuori da 0–100 pubblicata dalla fonte"
    elif statistic in ("level", "per_capita") and v < 0 and not allow_negative:
        why = f"{ANOMALY}: valore negativo pubblicato dalla fonte (spesso una stima provvisoria)"
    return f"{why} · {f}" if why and f else why or f


def indicator(meta, code, label, unit, by_country, *, section, topic, definition, statistic, nature, frequency,
              dataset, keywords="", group=None, locator="", order=0, digits=None, note=None, text="",
              allow_negative=False, unit_local=None, unit_of=None):
    """One indicator of one source for every country it covers (only the 193 UN member states are kept)."""
    assert section in SECTIONS and nature in NATURES and statistic in STATISTICS, (section, nature, statistic)
    rows, anomalies = [], 0
    for c, pts in sorted(by_country.items()):
        if c not in UN193:
            continue
        pts = sorted((str(p), _r(v), _flag(f, v, statistic, allow_negative)) for p, v, f in pts if v is not None)
        anomalies += sum(1 for _p, _v, f in pts if f and f.startswith(ANOMALY))
        if pts:
            rows.append([c, [[p, v, f] if f else [p, v] for p, v, f in pts]])
    if not rows:
        return None
    sid = f"{meta['source_id']}:{code}"
    latest = max(p[-1][0] for _c, p in rows)
    props = {"indicator": code, "indicator_label": label, "unit": unit, "section": section, "topic": topic,
             "definition": definition, "statistic": statistic, "nature": nature, "frequency": frequency,
             "dataset": dataset, "keywords": keywords or None, "group": group, "order": order, "digits": digits,
             "note": note, "coverage_n": len(rows), "latest_period": latest, "anomalies_n": anomalies or None, "by_country": rows,
             "unit_by_country": _units(rows, unit_local, unit_of)}
    return NormalizedRecord(
        source_id=meta["source_id"], native_id=sid, native_version=content_version(props),
        kind="object", type="observation.indicator", label=label, identifiers=[("indicator", sid)], properties=props,
        assertions=[Assertion("relation", "measured_in", Target("place.country", scheme="iso3166a2", value=c),
                              attributes={"key": c}) for c, _p in rows],
        status="reviewed", method="asserted", raw_locator=locator, text=f"{label} {keywords} {text}".strip())
