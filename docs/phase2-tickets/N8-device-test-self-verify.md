# N8 — Self-verify the device-test backlog using the iOS Simulator

**Status:** ready · docs-only outcome (no code unless a real bug is found) · run LAST in tonight's queue
· safe-parallel: no (touches the shared `docs/test-backlog.md` file other tickets also update — run after
N1–N7/N9 so their entries are stable)

## Context
`docs/test-backlog.md`'s "To test" section has accumulated device-only verification items going back to
Wave 6 (`DEV-1`...`DEV-5`, plus dozens of `[ ]` entries per merged ticket) that were never physically
checked because they historically needed Tats' phone. `docs/dev-pipeline.md` recorded on 2026-07-28 that
this is **no longer fully true** — a local iOS Simulator build works, Code can drive it, take screenshots,
and verify a screen itself. The 2.77 redesign was already verified entirely this way. This backlog has
never been swept with that new capability.

## Current issue
A large backlog of "merged + CI-green but never verified" items sits unresolved, most of which are now
self-verifiable without waiting on Tats.

## Expected behavior
1. Work through `docs/test-backlog.md`'s "To test" section and the `DEV-1`...`DEV-5` items top to bottom.
2. For each item, seed/use the demo account (per `docs/demo-seed-plan.md` — verify against real data, not
   an empty account) and drive the actual flow in the Simulator per the loop in `docs/dev-pipeline.md`
   (checkout branch if needed for anything not on `main`, `curl -X POST http://localhost:8081/reload`,
   drive, `xcrun simctl io <udid> screenshot`).
3. Anything that genuinely can't be verified without a physical device (real push notification delivery,
   real camera/photo-library permission prompts, Apple/Google Sign-In's actual OAuth round-trip, GPS in
   motion) — leave it flagged, note precisely why the Simulator can't cover it.
4. For each item: if it passes, move it to the "Passed" section with a one-line note + screenshot
   reference; if it's actually broken, do NOT silently leave it — open it as a real fix (either fix it
   inline if small and clearly in-scope, or write it up as a new ticket for a future batch, same as any
   other bug discovery).
5. Do not mark anything "passed" you didn't actually drive and screenshot — false confidence here is worse
   than an honest "still needs a real device."

## Data / API rules
No migration expected. If a verification uncovers a real bug that needs a data/schema fix, treat it as its
own scoped fix with the usual RLS/harness rules — don't bundle an unrelated fix into this ticket's PR.

## Acceptance criteria
- `docs/test-backlog.md`'s "To test" section shrinks to only what's genuinely device-only-verifiable, each
  with a one-line reason why the Simulator can't cover it.
- Everything else is either in "Passed" (with evidence) or has a linked fix ticket.
- Screenshots referenced (paths or attached to the PR) so Tats can spot-check without repeating the work.
- Update `docs/roadmap.md` + `PawPi_instructions.md` status block on merge.
