# N3 — Restyle service/adoption.jsx to Liquid Glass (the one leftover 2.77 screen)

**Status:** ready · no migration · independent · safe-parallel: yes (single screen file + its local
components)

## Context
The 2.77 iOS 27 "Liquid Glass" redesign restyled every screen except one, deliberately:
`anything/apps/mobile/src/app/service/adoption.jsx`. Its restyle was originally authored in June against
the pre-Wave-9 version of the file; by the time it was cherry-picked, 7 conflict hunks would have
**reverted the Wave 9 adoption-browse work** (2-col grid card variant, age·size·gender row, distance
label, "See more") if the restyle's side had been taken, so it was skipped and the screen still has its
pre-redesign styling. This is now the last visual inconsistency in the app.

## Current issue
`service/adoption.jsx` looks visually out of place next to every other Liquid-Glass-restyled screen
(different surface treatment, spacing, motion — see the design tokens in
`apps/mobile/src/constants/` and primitives in `apps/mobile/src/components/ui/` that every other screen
already uses: `GlassSurface`, `Card`, `Sheet`, `PressableScale`, `Button`).

## Expected behavior
Restyle `service/adoption.jsx` (and its adoption-detail screen from ticket 2.87, if it also needs it —
check whether 2.87's detail page already got restyled or has the same gap) to match the rest of the app's
Liquid Glass look, using the existing design tokens and `ui/` primitives — **visual/motion only, zero
behavior change.**

## Data / API rules
No migration. No API change. This is styling only.

## Acceptance criteria
- Use the **structural parity check** the original 2.77 PRs used to catch silent reverts: before/after
  counts of `testID`, `useState`, `useQuery`, `onPress`, `<Text`, `ModerationMenu`,
  `accessibilityLabel` must be identical — a pure reskin changes none of them. This matters here
  specifically because the whole reason this screen was skipped is prior restyle attempts nearly
  reverted real functional work (the grid card variant, distance, "See more", and the
  `ModerationMenu` App-Store-required moderation actions on listings).
- Never gate content visibility on an entrance animation (the 2.77 "Motion HARD RULE" — no
  `entering={FadeInDown…}` wraps that start at opacity 0 and may never fire).
- Verify in the iOS Simulator against the seeded demo account (not an empty account — an empty adoption
  browse list makes the visual change unreviewable) per the updated self-verify loop in
  `docs/dev-pipeline.md`. Screenshot before/after.
- `npm test` (mobile jest) green, unchanged test count plus nothing broken.
- Update `docs/roadmap.md` 2.77 entry — remove the "ONE DELIBERATE EXCLUSION" note once this ships.
