# NEXUM — Milan, 17–18 October 2026: are the documented episodes in GDELT and in NEXUM?

**Published (2026-10-19, author's GO alla pubblicazione):** commit d7d6aa1, build 202610192001-kgyd, snapshot
live-1016-20261019T195354Z-7cc15369, Cloudflare deployment 7773d032; reference world prod-1016-20261019T2002Z
(world-1004 + Natural Earth names + the 11 episodes, review = author). Rollback: deployment cdf5c024 (build saof,
live-949). The automatic publish's production check fails on three storm exposure types since world 996
(Super Typhoon Champi, run 39227742776): pre-existing, independent of this release, not changed.

**Status (2026-10-19):** verification only (no change to the Core, no commit/push/deploy). GDELT files: every 15-minute
export and mention file of 17 October and of 18 October up to 20:15 UTC, standard and multilingual streams (the files
NEXUM's browser reads). NEXUM's rules applied exactly as in `ui/src/ops/gdeltcore.ts`. Times are UTC (Milan = UTC+2).

## Episodes documented by public sources

Facts reported concordantly by several outlets are marked **fact (concordant)**; figures attributed to the Questura
or the Viminale are **attributed figures** (they differ between outlets: never merged); statements are **statements**.

| # | Episode | When (local) | Where | Sources | Nature |
|---|---|---|---|---|---|
| 1 | March "Italia in piazza" against the cost of living, ~5,000 people, organised online by a movement calling itself non-partisan | 17 Oct, afternoon | piazza Duomo, via Broletto | Il Post; Sky TG24 | fact (concordant); organiser as self-described |
| 2 | Stones, firecrackers and paving stones thrown at police; clashes moving through the centre | 17 Oct, from ~16:30 | via Broletto, piazza dei Mercanti, Cordusio, Duomo, corso Vittorio Emanuele, San Babila | Il Post; Il Giorno; Il Sole 24 Ore; AP | fact (concordant) |
| 3 | Police water cannon and tear gas | 17 Oct | piazza Duomo and nearby | Il Post; Al Jazeera | fact (concordant) |
| 4 | Shops looted, shop windows broken (corso Vittorio Emanuele, Galleria) | 17 Oct, evening | corso Vittorio Emanuele, Galleria | ANSA; AP; Fox News | fact (concordant) |
| 5 | Fires: a chemical toilet, a building site | 17 Oct | centre | Il Post (toilet); Il Giorno (building site) | reported (one outlet each) |
| 6 | Toll: 72 taken to the Questura, 16 or 17 arrested, 22 reported, 104 officers treated | 17 Oct, figures of 18 Oct | — | Il Giorno citing the Questura; Tgcom24; Sky TG24 | attributed figures, discordant (16/17; injured 15 / 25 / 104) |
| 7 | Carrefour in via Torino looted, shop windows broken | 18 Oct, ~15:05 | via Torino | LaPresse; Il Giorno | fact (concordant) |
| 8 | New clashes in piazza Duomo, water cannon and tear gas; windows broken in via Orefici / Cordusio, Rinascente | 18 Oct, 15:37–18:00 | piazza Duomo, via Orefici, Cordusio | Il Giorno (live); LaPresse | fact (live reporting) |
| 9 | Decathlon in piazza Castello raided; shops in Moscova / corso Garibaldi | 18 Oct, 16:41–17:50 | piazza Castello, Cairoli, Moscova | Il Giorno (live); LaPresse | reported (live) |
| 10 | People held: 60 → 160 → over 200 (80% minors) | 18 Oct | — | Il Giorno; Adnkronos; LaPresse; Viminale "a quanto si apprende" | attributed figures, preliminary |
| 11 | Statements: Meloni (X), Sala, Piantedosi (dispute on police numbers) | 17–18 Oct | — | Il Post; Al Jazeera; Tgcom24 | statements |

No official Questura communiqué for these days was found online; its figures are known only as reported by the press.

## In GDELT and in NEXUM

| # | In GDELT (files NEXUM reads) | In NEXUM (today's rules) | Reason for a gap |
|---|---|---|---|
| 1 | yes — e.g. zazoom "Italia in piazza, cortei in tredici città: a Milano lancio di sassi…" (id 1328467339, CAMEO 141, Milan, multilingual) | shown: "Manifestazione o protesta", Milan **confirmed**; other rows of the same article placed in Rome (suggested / ambiguous) | — |
| 2 | yes — zazoom "Guerriglia in Duomo a Milano…" (1328478420, **145**); Il Sole 24 Ore "Corteo Milano, lancio sassi contro polizia" (1328466675) coded **046 "Negoziato"**; AP wire copies (winnipegfreepress, thecourier…) | zazoom: "Scontri e disordini", **confirmed**. Il Sole 24 Ore: **misclassified** ("Negoziato", outside the public-order categories: visible only in the newest hour). AP copies: Milan **suggested, not verified** (.com outlets), some rows placed in **France** | GDELT's coding (046) and geography; English-language outlets are never "same nation" |
| 3 | yes, as code 153 (police mobilisation) or 190, mostly in articles naming several cities | mostly **suggested / ambiguous**; one "corteo in centro, scontri in stazione con fumogeni e idranti, cinque arresti" placed in Milan but likely about another city | articles mixing Milan, Bologna, Turin; GDELT places them in Milan |
| 4 | yes — ANSA "A Milano saccheggiati negozi in corso Vittorio Emanuele" (1328496168, **145**) | shown: "Scontri e disordini", **confirmed** — the looting is not a category of its own | CAMEO has no looting code (1712 "destroy property" was not used) |
| 5 | no article about the toilet or the building site; the AP headline "Rioters loot stores, **set fires** in central Milan" (codes 075, 145, 173) | AP copies **suggested, not verified**; fires **not distinguishable** | fires have no CAMEO code; Italian articles about them not in the files |
| 6 | figures never in GDELT; arrests coded 173 in some articles | arrests shown as "Intervento di polizia o di autorità", **no figures** (by design) | GDELT carries no figures; NEXUM never shows tolls |
| 7 | yes — zazoom "Milano, guerriglia in centro: saccheggiato un Carrefour, vetrine infrante…" (1328575810/12, **145**) | shown: "Scontri e disordini", **confirmed** | looting not a category of its own |
| 8 | partly — zazoom "Nuova giornata di guerriglia a Milano…" coded **110 / 180**; "Centinaia di giovani tornano in piazza Duomo…" **040**, secondary | 110 "Disapprovazione": **misclassified**, visible only in the newest hour; 180 "Aggressione": shown | GDELT's coding |
| 9 | **no** (no article naming Decathlon, piazza Castello, Moscova) | **not received** | not in GDELT's files for those hours |
| 10 | **no** (no article with those figures) | **not received** | not in GDELT; figures would not be shown anyway |
| 11 | yes — e.g. "Piantedosi contro Sala…" (111, Rome or Milan) | shown as "Critica o denuncia" (other news), **only in the newest hour** | statements are outside the public-order categories (correct: they are statements) |

Volumes for Milan (all GDELT rows whose article names Milan or whose place is Milan, per episode family): 17 Oct march
177 rows / 81 articles; clashes 159 / 67; water cannon 21 / 9; looting 59 / 20; 18 Oct Carrefour 24 / 16; 18 Oct
clashes 101 / 43. About two thirds come from the multilingual stream; one aggregator (zazoom.it) dominates the Italian
side. 20–35% of the rows are secondary mentions or non-public-order codes that NEXUM drops after the newest hour.

## The windows (1, 6, 24 h) — Milan public-order reports a person would see

| Looking at (UTC) | 1 h | 6 h | 24 h |
|---|---|---|---|
| 17 Oct 15:00 (before the clashes) | 2 (0 confirmed) | 15 (1) | 28 (2) |
| 17 Oct 19:00 (during) | 11 (3) | 26 (8) | 51 (10) |
| 18 Oct 07:00 (next morning) | 11 (2) | 36 (4) | 127 (18) |
| 18 Oct 16:00 (second day) | 14 (7) | 41 (10) | 169 (30) |
| 18 Oct 19:00 | 7 (1) | 46 (17) | 170 (31) |

(confirmed in brackets; the rest are suggested or ambiguous.) **With the default 1 hour, the next morning shows almost
nothing of the evening before; after 24 hours the episodes leave NEXUM entirely** — the browser keeps only the window,
and the snapshot's archive is still the hour of 6 October.

## Why the person could not find the episodes

1. **Search:** "milano" opened an airfield in Brazil — the places index had no Italian names (fixed locally, below).
2. **No memory:** GDELT reports exist only in the chosen window (≤ 24 h); nothing documents the episodes afterwards.
3. **Coding:** important articles coded as negotiation (046), disapproval (110) or "military force" (19x); looting and
   fires have no code of their own.
4. **Geography:** most reports are "suggested", correctly — but a person looking for Milan sees mostly uncertain items.
5. **Gaps:** episodes 9 and 10 are not in GDELT at all.

## Additional source (free, lawful, sustainable) — evaluated

| Source | Verdict |
|---|---|
| GDELT DOC 2.0 API (full-text article search, titles) | **not sustainable**: answered 429 to the first request ("one every 5 seconds", shared); GDELT directs heavy users elsewhere |
| GDELT GKG (titles, D5) | heavy (3–7 MB per 15 min); only with a small scheduled job (not approved, D7) |
| Questura / Polizia di Stato communiqués | none found online for these days; licence of the site to be verified |
| ANSA, LaPresse, Il Post (RSS) | terms of reuse to be verified for each; at most title + link, never text |
| Wikipedia (CC BY-SA) | days of delay; good for a consolidated summary, not for the day |
| **Curated documented episodes (manual, with sources)** | **recommended**: see below |

## Proposal (not implemented; needs the author's authorisation)

1. **Documented episodes, curated:** one NEXUM event per episode (`civil.public_order_event`, proposal in
   `NEXUM-NEWS-ACTORS-GRAPH-PROPOSAL.md`) written by the operator from public sources: date, place (verified: the
   street or square when the sources give it), category (march / clashes / looting / fire / police action / measures),
   sources (outlet, title, link, date), verification status (concordant / single source / attributed / statement),
   figures as attributed claims ("secondo la Questura, riportato da Il Giorno"), superseded, never overwritten. Zero
   cost; permanent; searchable by city (the city's related events, its timeline, the graph's documented links). They
   are NEXUM events and never mixed with GDELT reports.
2. **Search by city:** the city's card (now: "Notizie e ordine pubblico: Milan") would show first the documented
   episodes, then the GDELT reports in two lists (confirmed / suggested). Opening it from a city could take 24 hours
   by default (a decision: ~6–9 MB).
3. **Optional, by decision:** a small daily archive of GDELT's public-order reports per city in the snapshot (a
   scheduled job; D7 says none today), so that a day's reports do not vanish after 24 hours.

## Search fix (applied locally)

Cause: the connector `naturalearth.places` kept only the ASCII name; Natural Earth's own `NAME_IT`, `NAMEPAR`,
`NAMEALT` (Milano, Roma, Torino, Firenze, Napoli…) were dropped, so the places index did not know them and the first
full-text hit won (an airfield "Aeródromo Fazenda Milano", Brazil; "roma" → Romania). The geographic filter is not
involved (search ignores the period; the scope has no area).

Fix: `connectors/naturalearth_places.py` 1.2.0 takes those fields as aliases (Natural Earth's names only) and marks the
record version with the name set (else the Core keeps the earlier record). Tested on a scratch copy of world 949
(reprocess of that source only; objects, events and relations unchanged; aliases 779 → 2,640; no merge proposal);
search index 4,518,574 bytes (≤ 4,600,000). Applying it to the reference world needs the author's GO (a world update
of that source). The city's card links to its news (confirmed / suggested apart). Airports and every other element stay
in the index and in the results, in their own groups after the city.

## Implemented locally (2026-10-19, author's authorisation; no commit, push or deploy)

**1. Natural Earth names.** `naturalearth.places` 1.2.1: Natural Earth's `NAMEASCII`, `NAMEPAR`, `NAMEALT`, `NAME_IT`
as aliases, minus the variants that differ from the label (or from each other) only by accents, case or punctuation
(the Core's normalisation already finds them). Search index on the scratch world (949 + this source reprocessed + the
episodes, world 961): **4,519,504 bytes** — 949 had 4,505,148 (+14,356, +0.32 %); limit 4,600,000; margin 80,496
(98.25 % of the limit). The index was already at 97.9 % before this change: the margin is the author's O9 decision, not
an effect of the names. The deduplication saves less than expected (197 aliases) because the Core keeps the aliases of
earlier record versions (659 accent-only aliases of the 949 world remain); removing them would touch the Core: not done.

**2. Documented episodes** — source `curated.public_order` (`connectors/curated_public_order.py` + `.json`, vocabulary
`vocab_live/public_order.toml`; Core unchanged). 11 events for Milan, 17–18 October 2026, each with: date (and Milan's
time when the sources give it), place (street or square, coordinates from Wikidata CC0), category, verification status,
facts each with its sources, figures as claims (who gave them, who reported them, when; never merged), statements,
testimonies and accusations as such, notes, the cited sources (outlet, title, date, clean URL). Roles only where
documented: «Italia in piazza» → organiser (as reported) of the march only; Polizia di Stato → intervened (two
episodes); Questura di Milano → figures attributed to it (as reported by Il Giorno). No responsibility attributed
("Nessuna attribuzione documentata disponibile"), no person as an element. Status `preliminary`, review `draft`; not in
the automation's sources (a test checks it). Sources opened and read on 2026-10-19: Il Post, Il Giorno (17 Oct and the
18 Oct live), Il Sole 24 Ore, Sky TG24, LaPresse, ANSA (three articles). Not used: Tgcom24 (not verified), names of
persons linked by Sky TG24 to the movement (not a documented relation).

Visible: Milan's card ("Episodi documentati · 11", before the GDELT look-up), search («milano»: the city first, then
the episodes in their own group), the episode's card (sections), the graph (Milan, Italia in piazza, Polizia di Stato,
Questura di Milano by their roles), the time line.

**3. News from a city: 24 hours.** "Notizie e ordine pubblico: <city>" opens the news with the 24-hour window; 1 and 6
hours stay one tap away. From a nation the window is unchanged.

**4. Fold closed (344 px).** The three failures were one defect: in the mini card the title was cut on one line and
nothing on the screen said it whole. Below 361 px the title takes two lines within the same mini height.

## Editorial check of the 11 episodes (2026-10-19, author's request; local only, no commit, push or deploy)

Every episode was compared again with the text of its sources (re-read the same day). Corrections:

- **"Durante il mandato"** (the office holders on the day, Wikidata) is the generic block every event has; on an
  episode it now sits apart, after the card, under «Contesto istituzionale (non è un collegamento con l'episodio)»,
  with a note that the sources do not link those office holders to the clashes. Other events: unchanged.
- **"Fonti pubbliche"** no longer reads as a verification: the source is «Episodi di ordine pubblico (redatti da NEXUM
  dagli articoli di stampa citati…)», its attribution says «non una verifica indipendente né una fonte ufficiale», the
  verification status counts outlets («concorde tra più testate», «riportato da due testate», «riportato da una sola
  testata»; no more «fonti indipendenti») and the card says so under it.
- **Roles and responsibility:** «Chi è coinvolto» → «Ruoli documentati dalle fonti» (an empty one says no movement,
  organisation or authority has a documented role, no longer "no attribution"); «Attribuzioni di responsabilità» →
  «Responsabilità accertate» (none: no judicial act or official statement cited attributes the violence to an
  identified subject; accusations stay statements). The organiser's role says it is limited to the organisation and
  that NEXUM does not attribute the violence to it (no longer a claim of innocence NEXUM cannot source).
- **Persons:** the line now says no person is linked as a subject; office holders appear only as authors of reported
  statements, or in the institutional context.
- **Statements:** Salvini's accusation and his proposal (a financial guarantee for organisers of risky
  demonstrations) are two items: an accusation and a statement. Added, as a statement: the Interior Ministry's
  description («a quanto si apprende», Il Giorno) of the 18 October violence as provoked by groups of mostly minor
  "teppisti" self-convened on social media — an authority's description, not a judicial finding, no identified
  subject.
- **Facts against the sources:** Cordusio on 18 October: «cassonetti» (LaPresse), not «cestini»; LaPresse's 60 had
  been checked in the Duomo area before the new disorders; «oltre 200» is attributed to the Interior Minister's meeting
  «a quanto si apprende» (18:59), the share of minors given without a source; Decathlon's location note matches the
  sources (Il Giorno: piazza Castello at 16:41 and piazza Cairoli; LaPresse: piazza Cairoli); Polizia di Stato's role
  in the 17 October clashes also cites Il Giorno, which names it explicitly.
- **When:** figures and statements say when they were given (`when_note`), never as a time of the violence.

Rebuilt from world 949 + Natural Earth names + the episodes (a re-processing of the same Wikidata payloads keeps, for
some entities, the earlier version on screen: the Core orders versions of the same fetch by their content hash —
noted, not changed). Search index unchanged: 4,519,504 bytes.

## GDELT false positive and the public-order filter (2026-10-19, author's request; local only)

The report: GDELT event 1328686526 (export 20261019113000, standard stream), CAMEO 010 «make statement», actor
STUDENT/MEDIA, ActionGeo «Roma, Lazio, Italy» (type 4, feature -126693), IsRootEvent 1, 5 articles, tone −0.24, from
https://depauliaonline.com/86355/opinions/sadies-scoop-justice-for-ugly-ratatouille/. It was shown because the newest
hour keeps every root action and the list's «Tutte» mixed «altre notizie» with public order; its place was unconfirmed.

Filter (gdeltcore `relevanceOf`, config `publicorder.json` → `relevance`), GDELT's own fields only, never the article's
text: ORDER (a code of the public-order lens) and ADDRESS (a generic code, but a public-order word in the address of
the article GDELT coded from, said as such) make the main list, the map and the counts; RAW (the rest) is listed apart,
«Dati grezzi GDELT esclusi dal filtro», never on the map. On real files: 19 Oct 11:30 — 77 order, 11 address, 250 raw;
Milan, 17 Oct — 16 order, 6 address (all about protests/strikes), 4 raw (none about the clashes). A miscoded lens code
cannot be caught without reading the article: the card says so.

Panels: on a wide screen a card opened while a tool's panel is open sits beside it (no overlap); on touch the tool's
sheet is hidden under the card and back when the card closes. Fixture added: tests/fixtures/gdelt-20261019 (real file,
MD5 as GDELT's lastupdate.txt). The 11 documented episodes: unchanged.
