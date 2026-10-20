# fixtures/ocean — samples of the oceanographic sources (test fixtures)

Samples of the answers of the sources of NEXUM Ocean, added on 2026-10-09 (commit `e83ce67`) and used by
`tests/test_ocean.py` (no network in the tests). Each file stays under the licence of its source, as registered in
`sources_live/<id>.toml`; the MIT licence of NEXUM's code does not apply to them.

| File | Source (`sources_live/`) | Licence | Attribution |
|---|---|---|---|
| `ndbc_activestations.xml`, `ndbc_latest_obs.txt` | `noaa.ndbc` | public domain (U.S. Government work) | NOAA National Data Buoy Center (NDBC) |
| `coops_stations.json`, `coops_wl_8410140.json` | `noaa.coops` | public domain (U.S. Government work) | NOAA National Ocean Service — CO-OPS Tides & Currents |
| `ispra_rmn.json` | `ispra.rmn` | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) | ISPRA — Rete Mareografica Nazionale |
| `marine_ie_latest.csv` | `marine_ie.iwbn` | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) | Marine Institute — Irish Weather Buoy Network |
| `argo_day.csv` | `argo.ifremer` | free use with acknowledgement (https://argo.ucsd.edu/data/acknowledging-argo/) | Argo: data collected and made freely available by the International Argo Program and the national programs that contribute to it (https://argo.ucsd.edu, https://www.ocean-ops.org), part of the Global Ocean Observing System — DOI 10.17882/42182 |
