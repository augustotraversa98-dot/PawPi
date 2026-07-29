# N2 — Retire the PATCH /api/pets ownership-repair handler

**Status:** ready · no migration (or trivial) · independent · safe-parallel: yes

## Context
`docs/app-store-readiness.md` FLAGGED item #4 and the 2026-06-19 pre-launch backend quality pass both
called this out: `anything/apps/web/src/app/api/pets/route.js` has a legacy `owner_user_id` repair
handler (`PATCH`) that predates RLS and is now dead code under it (reads are already scoped to the
profile id, so its old `WHERE owner_user_id = <auth id>` lookup matches nothing). It was previously left
as an unmerged DRAFT PR specifically because its mobile caller, `RepairPetsButton.jsx`, lived inside the
then-open redesign PR #209 (Profile) — the two needed to land together. **#209 merged as part of the
2.77 redesign completion (2026-07-28), so that blocker is gone.**

## Current issue
Dead/legacy repair endpoint + its mobile trigger button are still live in production, unused, and are
debug/maintenance surface that shouldn't ship to the App Store.

## Expected behavior
1. Locate the current draft/branch state of this cleanup (search recent branches/PRs for
   "ENABLE_PET_OWNERSHIP_REPAIR" and "RepairPetsButton" — the backend half may already exist gated behind
   that env flag from the earlier pass). If the draft PR still exists and is close to mergeable, finish
   it; otherwise redo the two-sided removal fresh against current `main`.
2. Remove (or fully gate off, returning a clean 410) the `PATCH` repair handler.
3. Find and remove `RepairPetsButton.jsx` and its call site (grep the mobile app for the component name)
   now that #209 is merged and it's safe to touch that screen.
4. Confirm nothing else references the removed handler/button.

## Data / API rules
No schema change expected. If the handler removal needs a migration for any reason, use the next free
number and flag it in `docs/test-backlog.md` ACTION 1 per the usual convention — but this should not be
necessary, it's a pure code deletion.

## Acceptance criteria
- `npm test` (mobile jest + web vitest) green.
- Grep confirms zero remaining references to `RepairPetsButton` or the repair `PATCH` handler.
- Update `docs/app-store-readiness.md` — move FLAGGED item #4 to FIXED.
- Update `docs/roadmap.md` + `PawPi_instructions.md` status block on merge.
