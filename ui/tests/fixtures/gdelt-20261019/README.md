# GDELT 2.0 file of 19 October 2026 (test fixture)

`20261019113000.export.CSV.zip`: a real, unmodified GDELT 2.0 Events export (standard stream, slot 2026-10-19 11:30
UTC) from `https://data.gdeltproject.org/gdeltv2/`. Its MD5, `014f692a6636e109739eaba4506847bf`, is the one GDELT's
`lastupdate.txt` gave for the slot. Source: The GDELT Project (gdeltproject.org), automatic coding of news media; open
data, used with citation (https://www.gdeltproject.org/about.html#termsofuse).

It holds GDELT's coding of news articles (event codes, places, the articles' addresses), not the articles. Used by
`tests/unit/gdelt.test.ts` and `tests/web/gdelt-filter.spec.ts` (the public-order filter's false positive of 19 October).

The file is GDELT's, under GDELT's terms: the MIT licence of NEXUM's code does not apply to it.
