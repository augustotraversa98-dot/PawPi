# N9 — Docs hygiene sweep (small, safe, no code)

**Status:** ready · docs-only · independent · safe-parallel: yes

## Context
A handful of small doc-accuracy issues have accumulated and are cheap to fix in one pass:

1. `docs/demo-seed-plan.md` still references `demo@pawpi.app` as the suggested/App-Review login — the
   demo accounts were just renamed to the `pawpi.info` domain (see recent PRs #261–#263, e.g.
   `augusto+demo@pawpi.info`). Update the plan doc's login references to match reality; do not touch the
   actual seed script/spec (that's already correct per the rename PR) — this is purely making the plan
   doc stop contradicting the code.
2. `docs/test-backlog.md` flags a stray untracked artifact: `supabase/verify_0063.sql` was left untracked
   in a prior Wave-8 pass, with a note to "tell Code to commit or delete it." Decide (it's almost
   certainly safe to just `git add` it alongside the other `verify_00XX.sql` files that ARE tracked, for
   consistency) and resolve it.
3. `docs/guideline-1.2-audit.md` is dated 2026-06-20 and its verdict section reads **"Coverage today: 0 of
   4 safeguards met... will be rejected under 1.2 as-is."** This is now false and dangerously misleading —
   the UGC moderation work (tickets T1–T9) shipped and merged after this audit was written, and all four
   safeguards are live in production. Anyone reading this file cold would think the app is unsubmittable.
   Add a prominent banner at the very top: superseded, moderation is complete, point to
   `docs/roadmap.md`'s UGC MODERATION section for current status. Do not rewrite the whole audit body (it
   has real historical/design value) — just make sure nobody mistakes it for current status.

## Expected behavior
Fix all three as small, independent, low-risk doc edits. No code changes.

## Data / API rules
None.

## Acceptance criteria
- `demo-seed-plan.md` no longer contradicts the actual current demo-account emails.
- `supabase/verify_0063.sql` is either tracked in git (preferred, for consistency with its siblings) or
  deliberately removed — not left in limbo.
- `guideline-1.2-audit.md` cannot be misread as describing current app-store readiness.
- No test suite impact (docs-only) — just confirm CI still passes on the PR as a sanity check.
