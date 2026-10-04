"""Eurostat — energy imports and exports BY PARTNER COUNTRY (annual, European reporters): natural gas imports
(nrg_ti_gas, million m³), electricity imports and exports (nrg_ti_eh / nrg_te_eh, GWh), crude oil imports
(nrg_ti_oil, thousand tonnes). Licence: Eurostat reuse policy ("reuse … is authorised provided the source is
acknowledged"). Each arc is stated by the REPORTING country, with the partner as Eurostat records it (for gas, the
partner can be a transit country or a trading hub — said so); years from 2015, the series kept on the relation.
Only arcs between two UN member states with at least one positive value; aggregates (EU, total, not specified) are
skipped. Nothing is inferred from geography: an arc exists only because the reporter declares a volume."""

import json

from connectors.obs_common import UN193, iso
from nexum.core.records import NormalizedRecord, Target
from nexum.core.scheduler import FetchRequest

VERSION = "1.0.0"
BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
SINCE = 2015
# dataset → (query, relation type, unit, label, note)
FLOWS = {
    "nrg_ti_gas": ("siec=G3000&unit=MIO_M3", "imports_gas_from", "milioni di m³",
                   "Import di gas naturale per Paese partner",
                   "Il partner è il Paese da cui il gas arriva secondo il dichiarante: può essere un Paese di transito o un hub commerciale, non necessariamente il Paese di produzione"),
    "nrg_ti_eh": ("siec=E7000&unit=GWH", "imports_electricity_from", "GWh",
                  "Import di elettricità per Paese partner", "Flussi fisici dichiarati dal Paese importatore"),
    "nrg_te_eh": ("siec=E7000&unit=GWH", "exports_electricity_to", "GWh",
                  "Export di elettricità per Paese partner", "Flussi fisici dichiarati dal Paese esportatore"),
    "nrg_ti_oil": ("siec=O4100_TOT&unit=THS_T", "imports_crude_from", "migliaia di tonnellate",
                   "Import di petrolio greggio per Paese d'origine", "Paese d'origine del greggio secondo il dichiarante"),
}


def describe():
    return {"connector_version": VERSION, "produces": sorted(v[1] for v in FLOWS.values())}


def plan(mode, state, source, today=None):
    return [FetchRequest(f"{BASE}{ds}?format=JSON&lang=EN&{q}&sinceTimePeriod={SINCE}", f"{ds}.json") for ds, (q, *_r) in FLOWS.items()]


def next_state(state, request, result, today=None):
    return state


def parse(data: bytes, meta: dict):
    d = json.loads(data.decode("utf-8"))
    url = meta.get("url") or ""
    ds = next((k for k in FLOWS if f"/data/{k}?" in url), None)
    if not ds:
        return
    _q, rtype, unit, label, note = FLOWS[ds]
    dims, size = d["id"], d["size"]
    idx = {k: d["dimension"][k]["category"]["index"] for k in dims}
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * size[i + 1]
    gi, pi, ti = dims.index("geo"), dims.index("partner"), dims.index("time")
    times = sorted(idx["time"].items(), key=lambda kv: kv[1])
    updated = (d.get("updated") or "")[:10]
    for g, gpos in sorted(idx["geo"].items()):
        a = iso(g)
        if a not in UN193:
            continue
        for p, ppos in sorted(idx["partner"].items()):
            b = iso(p)
            if b not in UN193 or b == a:
                continue
            series = []
            for t, tpos in times:
                v = d["value"].get(str(gpos * strides[gi] + ppos * strides[pi] + tpos * strides[ti]))
                if v is not None:
                    series.append([t, round(float(v), 3)])
            if not any(v > 0 for _t, v in series):
                continue
            last = next((s for s in reversed(series) if s[1] > 0), series[-1])
            attrs = {"series": series, "unit": unit, "reporter": a, "dataset": f"Eurostat {ds} (aggiornato {updated})",
                     "label": label, "note": note, "latest": series[-1], "latest_positive": last}
            yield NormalizedRecord(
                source_id=meta["source_id"], native_id=f"{ds}:{a}:{b}", kind="relation", type=rtype,
                native_version=json.dumps(series, separators=(",", ":"))[-200:] + updated,
                subject=Target("place.country", scheme="iso3166a2", value=a),
                obj=Target("place.country", scheme="iso3166a2", value=b),
                properties=attrs, status="reviewed", method="asserted", raw_locator="$.value")
