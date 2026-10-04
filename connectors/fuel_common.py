"""Shared shape of FUEL PRICES (Phase 3B · block 4): the national average retail price of one fuel in one state, as
the publishing authority computes it, with its date, unit and currency — never converted to another currency, never
estimated where the source publishes nothing. Tax components only where the source publishes them, each with the date
since which it applies. Coverage is what the sources cover (31 states), never "worldwide"."""

from connectors.obs_common import record

FUEL_IT = {"petrol": "Benzina", "diesel": "Gasolio", "lpg": "GPL", "ron95": "Benzina RON95", "ron97": "Benzina RON97"}
KEEP_POINTS = 160          # about three years of weekly prices (monthly: all the 160 latest months kept)


def fuel(meta, iso2, fuel_type, points, *, unit, currency, frequency, definition, dataset, taxes=None,
         price_without_taxes=None, area="media nazionale", text=""):
    """points: [[start, end, value]] in the source's own unit and currency (sorted, the latest KEEP_POINTS kept)."""
    pts = sorted(points)[-KEEP_POINTS:]
    if not pts:
        return None
    sid = f"{meta['source_id']}:{fuel_type}:{iso2}"
    props = {"indicator": f"fuel.{fuel_type}", "indicator_label": f"{FUEL_IT.get(fuel_type, fuel_type)} · prezzo al consumo ({area})",
             "fuel_type": fuel_type, "statistic": "price", "unit": unit, "currency": currency, "frequency": frequency,
             "definition": definition, "dataset": dataset, "area": area,
             "series": [[a, b, round(v, 4), None, None] for a, b, v in pts], "comparable_series_id": sid}
    if taxes:
        props["taxes"] = taxes                       # [[label, value, unit, since]]
    if price_without_taxes is not None:
        props["price_without_taxes"] = round(price_without_taxes, 4)
    return record(meta, sid, "observation.fuel_price", props["indicator_label"], iso2, props, scheme="obs_series", text=text)
