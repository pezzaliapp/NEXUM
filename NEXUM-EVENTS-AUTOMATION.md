# NEXUM — automatic natural events

**Status (2026-10-11):** implemented and tested locally; the schedule is **off** until the author's GO; production
deploys only by the author's GO (variable `NEXUM_AUTO_PUBLISH`). Decisions of the author of 2026-10-11 (D7 extended).

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

| Item | Where | Who |
|---|---|---|
| private repository `NEXUM-world` (with a first commit: a release needs one) | GitHub | Claude (gh) |
| first reference world (release `world-716-seed` from `data/live-ev`) | that repository | Claude (gh) |
| secret `NEXUM_WORLD_TOKEN`: fine-grained token, *Only select repositories* → `NEXUM-world`, *Contents: Read and write*, expiry ≤ 1 year | repository secrets | **the author** |
| variable `NEXUM_WORLD_REPO` | repository variables | Claude (gh) |
| environment `cloudflare` (deployment branches: `main`), variable `CLOUDFLARE_ACCOUNT_ID` | repository environments | Claude (gh) |
| secret `CLOUDFLARE_API_TOKEN` in `cloudflare`: *Custom token* → **Account · Cloudflare Pages · Edit**, this account only, an expiry date | Cloudflare dashboard → environment secret | **the author** |
| variable `NEXUM_AUTO_PUBLISH=true` and the schedule | after the GO | Claude, on the author's GO |

The Cloudflare token cannot be restricted to one project or to previews; it is an environment secret readable only by
workflows on `main`, and can be revoked at any time.

## Rollback

1. **Automatic:** a production deploy that fails its verification is rolled back by the job (Cloudflare API).
2. **By hand, any time:** Cloudflare dashboard → Pages → nexum → Deployments → a previous production deployment →
   *Rollback*; or `POST /accounts/<id>/pages/projects/nexum/deployments/<id>/rollback`.
3. **Data:** each production build has its reference world (`prod-*`, the 3 most recent); `pipeline.py restore`
   brings any of them back.
4. **Stop the automation:** disable the workflow (Actions → nexum-events → Disable) or remove `NEXUM_AUTO_PUBLISH`.

## Costs and limits (verified 2026-10-11)

| Item | Limit | NEXUM |
|---|---|---|
| GitHub Actions, public repository, standard runners | free; a job ≤ 6 h | update: minutes; publish: ~25 min on the author's Mac, estimated ≤ 90 min on a runner |
| Release assets | each file < 2 GiB; no limit on total size or bandwidth; usage "significantly excessive" may be limited | ~250 MB per reference; 4 uploads a day (~1 GB); ~7 references kept (~1.75 GB) |
| Schedule | ≥ 5 min; delays at the start of the hour; **disabled after 60 days without repository activity** | minute 23; the Events panel shows the age of the data |
| Cloudflare Pages Free | 500 builds a month, 20,000 files, 25 MiB per file | 1 deploy a day; 7,628 files; largest 4.5 MB |
| A private NEXUM repository (instead of public) | 2,000 min a month | not viable: the NEXUM repository stays public |
