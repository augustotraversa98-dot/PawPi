# Pawpi directory seed — run manifest
_Last updated: 2026-08-27T21:57 (America/Buenos_Aires)_

## Master directory (3627 unique places)
- Providers: **2686**  — vet 1229, shop 1160, groomer 297
- Pet-friendly places: **941**
- Sources: SerpApi Google Maps 2949, OSM-only 678
- Coverage: phone 2696, hours 2949, website 1660, dog-policy 364
- Flagged **unclaimed on Google**: 462 (prime claim-flow targets)

## SerpApi run
- Credits spent this month: **235 / 250** (stopped at 235 cap)
- Queries completed: 235  |  queries skipped (for budget): 988
- Status: budget_reached

## Files (supabase/seed/directory/)
- `pawpi_directory_master.csv` / `.json` — the merged, deduped directory (use this)
- `serpapi_pull_caba_amba.csv` / `.json` — raw SerpApi pull
- `pawpi_directory_seed_caba_amba.csv` — raw OSM pull
- `serpapi_run_log.json` — resumable state (done/skipped queries)
- `serpapi_pull.py` — the pull script (resumable; reads key from .env)
- `DRAFT_provider_claimable_migration.sql` — the seed+claim schema draft

## To continue later (next month / more credits / another API)
Just run again — it resumes from `serpapi_run_log.json` and skips completed queries:
```
cd supabase/seed/directory
set -a; . ./.env; set +a
MAX_SEARCHES=485 python3 serpapi_pull.py    # raise the cap to go deeper (page 2/3, remaining areas)
```
There are **988 queries still unrun** (deeper pages + areas not reached under the 235 cap).

## Enrichment of unclaimed vets (bio, services, prices, hours — never photos)
Needs `anything/apps/web/node_modules`, `TINYFISH_API_KEY` in `./.env` (untracked), and migration 0162.
Every write is limited to listings still `claim_status='unclaimed'` and is safe to re-run. Without
`DIRECTORY_DATABASE_URL`, add `--sql x.generated.sql` to the two writing commands and run that file in the
Supabase SQL editor (create `enrich_universe.json` from `UNIVERSE_SQL` in `load_enrichment.mjs`).
```
node supabase/seed/directory/backfill_website_url.mjs                  # 1. website_url from the CSV
node supabase/seed/directory/load_enrichment.mjs --export-universe     # 2. who is eligible
cd supabase/seed/directory && MAX_AGENT_RUNS=10 python3 tinyfish_enrich.py   # 3. pull (costs money)
node supabase/seed/directory/load_enrichment.mjs --dry-run             # 4. REVIEW, then run without the flag
```
`AREA` (default `Palermo, CABA`) picks the neighbourhood; `MAX_AGENT_RUNS` is cumulative across runs.
