# NEXUM — automatic natural events

**Status (2026-10-11):** implemented and tested locally; the schedule is **off** until the author's GO; production
deploys only by the author's GO (variable `NEXUM_AUTO_PUBLISH`). Decisions of the author of 2026-10-11 (D7 extended).

## Data by themselves, code by approval — CODE PIN (2026-10-30)

**Why:** from 20 to 30 October 2026 production stayed at 22 October while every daily publish succeeded in the preview:
with `NEXUM_AUTO_PUBLISH=false` the data stopped together with the code, because the daily publish built the site from
main's newest commit. Now the two are separate.

- Repository variable **`NEXUM_CODE_PIN`** = an **annotated** tag `approved-YYYYMMDD-<sha>` on `main`, created and moved
  **only by the author** (the act of approval). Every run — the 6-hour updates and the daily publish — checks out that
  code (`actions/checkout` with `ref: vars.NEXUM_CODE_PIN`), never main's newest: pipeline, connectors, interface,
  configuration and the list of sources are the approved ones. Only the data change: the reference world and what the
  approved sources deliver.
- `.github/nexum-events/codepin.py check` stops the run (exit 4, an issue) when: the pin is missing or malformed, is
  a lightweight tag, names another commit than the one it points to, is not on `main`; the checkout is not the pin;
  a tracked file differs; **the workflow file on `main` differs from the pin's** (GitHub always runs the workflow of
  the default branch: a workflow change needs a new approval, or nothing runs). `codepin.py clean` before every deploy:
  no tracked file changed during the run.
- The deploy records the **approved commit** (`--commit-hash $CODE_SHA`, message `· code <pin>`); after a production
  deploy, Cloudflare's `canonical_deployment` must be this deployment of this commit, or production is rolled back.
- Manual run with input `code=main` (the author's hand, to try new code): **preview only**, refused for production,
  and it **stores no reference world** (a test never becomes the base of production).
- `NEXUM_AUTO_PUBLISH` keeps its role of switch: `true` = the daily publish deploys the new DATA to production with
  the approved code; anything else = preview.
- **Freshness:** every run reads production's `current.json`; after **48 hours** without a publication it opens one
  issue "nexum-events: production not updated for 48 h" (commented once a day by the publish run), closed by the first
  run that finds production fresh again (`.github/nexum-events/freshness.py`). The site says the same:
  «Ultima pubblicazione: … UTC (… fa) · dati ricevuti dalle fonti fino al … UTC», in warning past 48 hours
  (`PublishedLine`, «Cosa sta succedendo»).
- **Releasing code:** push to `main` → manual run `code=main`, `deploy=preview` → the author's approval → annotated tag
  `approved-YYYYMMDD-<sha7>` on that commit and `NEXUM_CODE_PIN` set to it. Between a push that changes this workflow
  and the new pin, every run stops (fail closed): push and pin go together.

**Limits, said plainly:** the workflow file always runs from `main`; its own guard protects against a change pushed
by mistake, not against someone who can push to `main` and rewrite the guard (today the author alone). Repository
variables and secrets are configuration outside git: changing them stays the author's act.

## USGS: deleted and merged events (2026-10-30)

The 7-day feed never says that USGS deleted an event or merged a preliminary solution into another: PTWC
`pt26297050`/`pt26298050` ("M 7.0 Bonin Islands", 24 October, deleted; the earthquake is `us6000u4r9`, M 6.5, 25
October 02:09:23 UTC) and `pt26293000` (M 6.6 Vanuatu, merged into `us6000u3jl`, M 6.3) stayed preliminary in the
world and were listed in «Cosa sta succedendo» (the Vanuatu one in production since 20 October).

- Before the acquisition the pipeline writes the USGS events still **preliminary after 6 hours** (at most 90 days old)
  into the connector's state; the connector asks each one to the FDSN service (`eventid=…&includedeleted=true`, at
  most 50 a run, through the Polite Scheduler). Deleted → `retracted`, flag `deleted_by_source`, label
  «M 7.0 · cancellato dalla fonte» (USGS strips the place); merged → the asked id `retracted`, flag
  `merged_into:<id>`, label «… · unito dalla fonte a <id>»; still there → its own revision. An id USGS answers twice with a client error is no longer
  asked (report: `unverifiable`), so it never blocks the others.
- Withdrawn is a **status, never a deleted row**: no count goes down, so the loss checks (tables, sources, relation
  types, production's types) stay as strict as before. A withdrawn event that becomes active again **stops the run**
  (7), for the author to review. The report lists every event withdrawn in the run with its reason (`usgs_verify`).
- «Cosa sta succedendo» (`/highlights`: recent, strongest, active domains) never lists a withdrawn event; the map
  hides it by default (confidence 0).
- **Publish gate:** two USGS events of the last 60 days, not withdrawn, at the same instant and place (0.01°) stop the
  publish (10) — the reference world is still stored, so the next run can correct it.

## Decisions

1. **D7 extended:** a scheduled workflow updates and publishes the natural events. GDELT news stay under the
   original D7 (browser → GDELT, no scheduled job).
2. **Reference world:** persistent, versioned, verified by SHA-256, never rebuilt from scratch automatically. It lives
   in the releases of a **private** repository: the Raw Store keeps fields NEXUM never publishes (OFAC individuals,
   GDELT actor names, UCDP article columns) and OpenStreetMap extracts under ODbL.
3. **Phase 1:** USGS, NASA EONET, Copernicus EMS. Other sources are added one by one, by decision.
4. Every source isolated (one process each); nothing is written or published when the overall checks fail.
5. **Every 6 hours** the reference world is updated; **once a day** the snapshot is built, checked and deployed.
6. Data that are periodic are never called LIVE: the Events panel says the day of each source's data and
   "non in diretta" (`ui/src/components/EventsCoverage.tsx`).

## Workflow `nexum-events` and pipeline `.github/nexum-events/pipeline.py` (outside the Core)

| Step | What | When it fails |
|---|---|---|
| Reference | latest `world-*`/`prod-*` release: `world.tar.xz` (~250 MB) + `manifest.json`; archive and database SHA-256, `PRAGMA quick_check`, world version | stop: missing (3), corrupt (4); a world already present is never overwritten (5) |
| A. Acquisition | `nexum.cli live fetch --source S`, one process per source, timeout; USGS: the current year's FDSN window (M ≥ 5.5, 1 request) and the 7-day feed | one failed or suspended source: the run goes on, `attention.json`, an issue; every source failed: stop (9) |
| B. Processing | `nexum.cli live process` (the Core's own command) | stop (6) |
| C. Checks | every source outside the allowlist byte-identical; no table, source or relation type loses rows; no identifier on two elements; no event in the future; provenance on every new or changed event | stop (7), nothing written |
| Store | a new release `world-<version>-<time>`; its digest (GitHub's SHA-256) must equal the manifest before anything older is removed; the 4 most recent `world-*` are kept | the new release is deleted, the previous ones stay |
| D. Publish (daily) | snapshot, Python parity, bundles (0 different), licences, web build, browser parity (0 failures), assembly; Cloudflare Free limits; search index ≤ 4,600,000 bytes (O9 margin); every published raw record within its source's exposure policy; **no type with fewer elements than the site in production** (read from `https://nexum.pezzalihub.app`) | stop (8), nothing deployed |
| Deploy | `wrangler pages deploy` to the preview (`live-review`) or, with `NEXUM_AUTO_PUBLISH=true`, to production (`main`) | — |
| Verify | the deployment and, for production, the public domain serve exactly the new build (`version.json`) and snapshot (`current.json`, `api/status.json`) | **production is rolled back** to the previous production deployment (Cloudflare API), the run fails, an issue is opened |
| Mark | the reference world behind a production build becomes `prod-<version>-<time>`; the 3 most recent are kept | — |

A run that fails writes nothing; the next one starts again from the last good reference world. The sources' own
windows cover the gap: USGS 7 days, EONET 45 days, Copernicus EMS the latest 200 activations.

**Sources the Core suspends:** after 5 consecutive errors the Polite Scheduler suspends a source and never resumes it
by itself. The pipeline reports it as `suspended` (never hidden as `deferred`); resuming it is the author's act.

## Exposure policy of published raw records (2026-10-11)

A connector may declare `RAW_FIELDS`: the only fields of its raw records that a published file may show
(`nexum/api/rawx.py`, `nexum/api/server.py:raw_fields`). UCDP declares the imported fields (`KEEP`): the
`source_article`, `source_headline`, `source_office`, `source_date`, `source_original` columns — which can name
individuals — and 19 technical codes are no longer published; the provenance view says how many fields were not
published. The Raw Store and the database are unchanged. The audit of every published raw extraction (33 sources)
found no other field beyond the policies (`tests/test_exposure.py`; the pipeline's exposure check).
Builds deployed before this change still hold those columns at their own deployment URLs on Cloudflare Pages.

## Configuration

Alessandro Pezzali is the sole author of NEXUM; every item below was set up on the author's behalf, with the author's own account and decision.

| Item | Where | Who |
|---|---|---|
| private repository `NEXUM-world` (with a first commit: a release needs one) | GitHub | the author (via `gh`) |
| first reference world (release `world-716-seed` from `data/live-ev`) | that repository | the author (via `gh`) |
| secret `NEXUM_WORLD_TOKEN`: fine-grained token, *Only select repositories* → `NEXUM-world`, *Contents: Read and write*, expiry ≤ 1 year | repository secrets | **the author** |
| variable `NEXUM_WORLD_REPO` | repository variables | the author (via `gh`) |
| environment `cloudflare` (deployment branches: `main`), variable `CLOUDFLARE_ACCOUNT_ID` | repository environments | the author (via `gh`) |
| secret `CLOUDFLARE_API_TOKEN` in `cloudflare`: *Custom token* → **Account · Cloudflare Pages · Edit**, this account only, an expiry date | Cloudflare dashboard → environment secret | **the author** |
| variable `NEXUM_AUTO_PUBLISH=true` and the schedule | after the GO | the author |

The Cloudflare token cannot be restricted to one project or to previews; it is an environment secret readable only by
workflows on `main`, and can be revoked at any time.

## Rollback

1. **Automatic:** a production deploy that fails its verification is rolled back by the job (Cloudflare API).
2. **By hand, any time:** Cloudflare dashboard → Pages → nexum → Deployments → a previous production deployment →
   *Rollback*; or `POST /accounts/<id>/pages/projects/nexum/deployments/<id>/rollback`.
3. **Data:** each production build has its reference world (`prod-*`, the 3 most recent); `pipeline.py restore`
   brings any of them back.
4. **Stop the automation:** disable the workflow (Actions → nexum-events → Disable) or remove `NEXUM_AUTO_PUBLISH`.
5. **Code:** the previous approved code is the previous `approved-*` tag: set `NEXUM_CODE_PIN` back to it (the tags
   are never deleted). Production rollback (1–2) never changes the pin: the next daily publish uses the pin as it is.

## Costs and limits (verified 2026-10-11)

| Item | Limit | NEXUM |
|---|---|---|
| GitHub Actions, public repository, standard runners | free; a job ≤ 6 h | update: minutes; publish: ~25 min on the author's Mac, estimated ≤ 90 min on a runner |
| Release assets | each file < 2 GiB; no limit on total size or bandwidth; usage "significantly excessive" may be limited | ~250 MB per reference; 4 uploads a day (~1 GB); ~7 references kept (~1.75 GB) |
| Schedule | ≥ 5 min; delays at the start of the hour; **disabled after 60 days without repository activity** | minute 23; the Events panel shows the age of the data |
| Cloudflare Pages Free | 500 builds a month, 20,000 files, 25 MiB per file | 1 deploy a day; 7,628 files; largest 4.5 MB |
| A private NEXUM repository (instead of public) | 2,000 min a month | not viable: the NEXUM repository stays public |
