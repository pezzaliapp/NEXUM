# GDELT 2.0 files of 17 October 2026 (test fixtures)

Real, unmodified files downloaded on 2026-10-18 from `https://data.gdeltproject.org/gdeltv2/` (GDELT 2.0 Events and
Mentions, standard and translingual streams). Source: The GDELT Project (gdeltproject.org), automatic coding of news
media; open data, used with citation (https://www.gdeltproject.org/about.html#termsofuse).

They hold GDELT's coding of news articles (event codes, places, the articles' addresses), not the articles. Used by
`tests/unit/gdelt.test.ts` and `tests/web/gdelt.spec.ts` / `tests/mobile/gdelt.spec.ts`.

- `lastupdate.txt`, `lastupdate-translation.txt`: written for the tests in GDELT's format (size, md5, URL), naming the
  slots 2026-10-17 19:15 UTC (standard) and 18:15 UTC (translingual); the md5 column is not checked by NEXUM.
- standard stream: exports and mentions 18:30–19:15; export 17:00 (the "Rome" article from the United States).
- translingual stream: exports and mentions 17:30–18:15; exports 05:30 and 15:30; export of 18 October 14:00 (a Serbian
  article placed by GDELT in Milan, telegraf.rs).
