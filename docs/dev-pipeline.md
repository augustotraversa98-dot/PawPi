# PawPi automated dev pipeline

This replaces the manual relay (Cowork → you copy/paste → Claude Code → you copy/paste back).
One orchestrator (Claude Code, in this repo) now does the planning *and* the building. You keep
only the two decisions that are genuinely yours.

## The loop

```
        ┌─────────────────────────────────────────────────────────────┐
        │  roadmap.md  (you own priorities — the only thing you curate) │
        └─────────────────────────────────────────────────────────────┘
                                   │
   GATE 1 ── you approve a BATCH ──┤   (a handful of safe-parallel items)
                                   ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  build-batch workflow:  N sub-agents, isolated git worktrees  │
        │  each → implement → npm test (mobile+web) green → DRAFT PR    │
        │         + a device-test checklist in the PR body             │
        └─────────────────────────────────────────────────────────────┘
                                   │
   GATE 2 ── you test on device ───┤   (the checklist; mark DEV-n done)
                                   ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  you approve merge → squash-merge → roadmap updated → next    │
        └─────────────────────────────────────────────────────────────┘
```

## Your two gates (everything else is automated)

1. **Pick the batch.** I propose a set of `READY`, `safe-parallel: yes` items from `roadmap.md`
   with a one-line plan each. You say which go in (or reprioritise). This is the "key decision."
2. **Test on device + approve merge.** I can't physically use your phone. I hand you a tight
   checklist per PR; you run it and say merge / fix. On merge I squash, update the roadmap, and
   queue the next batch.

I never merge without your OK. Draft PRs only until you clear gate 2.

## How to run a batch

> Approve a batch (e.g. "build P3-FEED, P3-WALK, QW-DEADCODE"), then I trigger the
> `build-batch` workflow with those item IDs.

The workflow:
- Spins one sub-agent per item, each in its **own git worktree** (no cross-talk).
- Each agent: branches off `main`, implements only its item, runs `npm test` for mobile (jest)
  and web (vitest), and opens a **draft** PR with a device checklist.
- Returns a consolidated "test these" report: PR links + per-PR device steps.

Items must be `safe-parallel: yes` (disjoint files). `db` items and `safe-parallel: no` items
run alone, with an explicit plan-approval gate first.

## Conventions the pipeline must honor (from PawPi_instructions.md)

- **One prompt = one fresh branch off current `main`.** Never stack on an already-merged branch.
- **New-chat prompts** open with: *"Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get
  oriented, then I'll give you the task."* (Sub-agents read these as their first step.)
- **Merge strategy:** default **Squash and merge** (one clean commit per feature on `main`),
  unless a PR has a reason to preserve commits. State it per-PR; never assume.
- **No fake/mock data.** Empty states only. Scope every feature by `pet_id` + `owner_user_id`
  (`owner_user_id` = `user_profiles.id`, NOT the auth id).
- **Persistence:** create/update/delete must hit the DB + refetch; soft-delete (`deleted_at` /
  `active=false`); preserve past health history; remove future reminders on routine delete.
- **CI must be green** (mobile jest + web vitest) before a PR leaves draft-buildable state.
  Lockfile changes: validate with `npx npm@10 ci --dry-run` before pushing (npm 11 vs CI npm 10).
- **Device-pass tracking:** anything that can only be verified on a phone goes to the
  "Awaiting your device test" section of `roadmap.md` as `DEV-n`, with its checklist.

## Sync rule (how Code and Cowork "talk" — the bridge)

There is no live channel between Cowork and Code. The **repo is the channel**. To keep them in sync:

- **Before every batch:** read Cowork's source-of-truth docs for priority changes —
  `docs/phase2-superapp-master-plan.md` (strategy) and the priority order + status block in
  `PawPi_instructions.md`. Re-derive `docs/roadmap.md` from them. Never let the roadmap drift from
  what Cowork has written.
- **After every batch/merge:** update `docs/roadmap.md` AND the status block in
  `PawPi_instructions.md`, then commit. That is how Cowork sees what Code did.
- **Committed + pushed to `origin/main` is the sync point.** Build-agents work in worktrees branched
  off `origin/main`, so they only see bridge docs (roadmap, dev-pipeline, master plan, instructions)
  that are *merged to main*. Uncommitted planning docs are invisible to them — push them first.
- Cowork-owned files (`PawPi_instructions.md`, the master plan) may have uncommitted Cowork edits —
  never clobber; append to the status block, and surface Cowork's WIP rather than overwriting it.

## Communication rule (always, plain English)

Augusto is not reading code. Every interaction obeys this:

1. **Before building any item:** explain in plain English *what the thing is for* and *what the
   issue is* — no jargon, no file paths in the explanation. Confirm understanding before fixing.
2. **After building:** a plain-English report with two clearly labelled parts:
   - **What changed** — what was fixed/added, in everyday language.
   - **What to test (when you have time)** — concrete, phone-side steps, plain English.
   Keep file paths / technical detail in the PR body, not the summary to Augusto.

## What I still proactively tell you

- When a batch is ready to test (with the checklists).
- When something needs a real decision (ambiguous product logic, risky migration, tradeoff).
- The merge strategy per PR.

## Where the old Cowork brief lives

`PawPi_instructions.md` remains the product bible (data rules, feature specs, status history).
The roadmap pulls *priorities* from it; this pipeline doc owns *process*.
