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
2. **Test on device + approve merge.** I hand you a tight checklist per PR; you run it and say
   merge / fix. On merge I squash, update the roadmap, and queue the next batch.

I never merge without your OK. Draft PRs only until you clear gate 2.

### ⚠️ Gate 2 has changed (2026-07-28) — I can now self-verify mobile UI

Gate 2 used to exist because *"I can't physically use your phone."* That's no longer fully true:
**Xcode is installed and a local iOS Simulator build works**, so I can drive the app, take
screenshots, and verify a screen myself before asking you to look. The 2.77 redesign rollout was
verified this way, screen by screen, with before/after screenshots in each PR.

The loop for **JS-only** changes (styling, layout, most UI work) — no native rebuild needed, because
the Debug build loads JS from Metro:

1. `git checkout <branch>` — Metro serves the working tree, so the branch on disk *is* what runs.
2. `curl -X POST http://localhost:8081/reload` (give it ~8s).
3. Drive with the Simulator tools; capture with `xcrun simctl io <udid> screenshot <path>.png`.

**What still needs you:**
- **The login.** I don't type passwords. You sign in once per session; the session then survives
  reloads *and* branch switches, so it's a one-time cost, not per screen.
- **Native changes** (anything touching `ios/`, native modules, permissions, build config) — those
  need a real rebuild, and release-only behaviour still needs TestFlight. Expo Go hides native
  modules, so a whole class of crash only ever appears in the real build.
- **Taste.** I can confirm a screen renders and nothing is lost; whether it *looks right* is yours.

**Verify against seeded data, not an empty account** — an empty account makes a visual change
unreviewable (half the cards render "nothing logged yet"). Seed first: `docs/demo-seed-plan.md`.

### Local dev vs. production-pointed testing

The normal loop above (`Start PawPi.command` / `scripts/dev.sh`) runs Metro against **your own
Mac's local backend + database** (`scripts/dev-backend.sh` + `scripts/sync-mobile-ip.sh`) — great
for fast, offline iteration, but it never exercises the real Railway backend or Supabase database
the shipped app actually uses.

For a final check before submitting to TestFlight/App Store Review, use **`scripts/dev-mobile-prod.sh`**
(double-clickable launcher: **`Start PawPi (Production Backend).command`**) instead. It starts Metro
(`expo start -c`) pointed at the live Railway backend (`https://pawpi-production.up.railway.app`) and
does **not** start `scripts/dev-backend.sh` — there is no local backend in this mode. The production
URL is exported as shell env vars scoped to that one `expo start` process only; it is never written
into `anything/apps/mobile/.env`, so a normal `dev.sh` / `Start PawPi.command` run afterward reverts
to local with no leftover state.

- **Use local (`Start PawPi.command`)** for day-to-day feature work and iteration.
- **Use production-pointed (`Start PawPi (Production Backend).command`)** as a pre-submission smoke
  test — does the real build talk to the real backend correctly end-to-end.
- **Safety: only sign in with the seeded demo account (`demo@pawpi.app`)** in this mode. It is a
  live production database — any other account's writes are permanent, real writes, not test data.

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

> **Lesson from the 2026-06-20 → 07-28 stretch (read this).** The sync rule above was NOT followed:
> Code kept shipping (video moments, legal/consent, the whole iOS build arc, the Railway production
> deploy, a production login outage, the 2.77 redesign) while `roadmap.md` and the instructions
> Snapshot stayed frozen at Wave 9. Cowork would have had a five-week-stale picture, and the docs had
> drifted into being **actively wrong** — they listed migrations 0067/0068 as "PENDING" when both were
> live. Both files were rebuilt on 2026-07-28.
>
> Two habits that prevent a repeat:
> - **Update the bridge docs in the same commit as the work**, not "later" — later never comes.
> - **Verify claims of record against reality rather than against another doc.** Migration status was
>   settled by querying production directly; the docs had been copying a stale claim forward.
>
> Also note: work has been **Claude Code only** for several weeks, so a lot landed as direct commits
> to `main` rather than as reviewed PRs (the whole 2026-07-28 production-hardening batch). Read
> `git log`, not just the PR list, when reconstructing what happened.

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
