# N10 — Rebase and land the Home/Lock-screen widget (PR #187)

**Status:** ready, but the biggest/riskiest item tonight · native code · build LAST, only if tokens remain
· safe-parallel: no — do this alone, not alongside other native-touching work

## Context
Ticket 2.76 Phase 1 (Home/Lock-screen widget) has been staged on draft **PR #187** since ~2026-06, using
`@bacons/apple-targets` + the `pawpi://` deep-link scheme, CI-green at the time (mobile 979/979 + web
green). It was held only because the Apple Developer account didn't exist yet. **The account now exists —
TestFlight has reached Build 6 — so the original blocker is gone; this has simply never been picked back
up.** `docs/roadmap.md` explicitly flags it will need a rebase, since `main` has moved a long way since
June (the entire iOS build/TestFlight arc, the Railway production deploy + hardening, daily video moments,
legal/consent, and the full 2.77 redesign all landed after this branch was cut).

A finish-checklist was referenced at `docs/native-widgets.md` — that file does not currently exist on
`main`; it may only exist on the PR #187 branch itself (check there first before assuming it's missing).

## Current issue
A fully-built feature is sitting stale and unmerged, growing more conflict-prone the longer it waits.

## Expected behavior
1. Check out PR #187's branch, locate `docs/native-widgets.md` if it exists there, and read it as the
   authoritative finish-checklist.
2. Rebase onto current `main`. Given how much has changed, expect real conflicts — apply the same
   discipline the 2.77 redesign used for its 40-day-stale branches: a structural parity check per
   conflicted file (don't silently revert the `ModerationMenu` additions, the calendar/add-to-calendar
   buttons, the boot-trace splash-hang hardening, or anything else that landed after this branch was cut).
3. Get CI green (mobile jest + web vitest) on the rebased branch.
4. This is a **native module addition** — per `docs/dev-pipeline.md`, native changes need a real rebuild,
   not just a Metro/Simulator JS reload, to be properly verified. Confirm it at least builds cleanly for
   the Simulator; full on-device widget verification (does it actually render on a Lock Screen) still
   needs Tats' physical device — flag that explicitly rather than claiming full verification.

## Data / API rules
No migration expected (this is a mobile-native feature). If the branch's original design assumed anything
about now-changed backend surfaces, verify and update rather than assuming June's version is still
accurate.

## Acceptance criteria
- Rebased branch is CI-green with zero silently-reverted post-June work (verified via structural parity,
  same method as the 2.77 redesign PRs).
- Squash-merge if genuinely clean; if the rebase is going badly (extensive, risky conflicts, native build
  failures that can't be resolved with confidence unattended), **abandon cleanly** — leave PR #187 as a
  draft with notes on what was tried, rather than merging something uncertain into a submission-track app.
  This is explicitly the one item tonight where "stop and leave for Tats" is an acceptable, even
  preferred, outcome over forcing a merge.
- Update `docs/roadmap.md`'s NATIVE + REDESIGN TRACKS section either way (merged, or "attempted, held for
  the reasons below").
