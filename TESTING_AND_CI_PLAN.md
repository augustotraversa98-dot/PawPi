# PawPi — Testing & CI Roadmap

**Status:** Finalized for approval (decisions folded in)
**Owner:** Tats
**Updated:** 2026-06-09
**Goal:** Replace the manual on-device test loop as the primary safety net. Add fast, phone-free automated tests that catch logic/data-shape bugs, wire them into CI so routine changes self-verify on every PR, and build toward Claude Code running overnight "fix-until-green" jobs that open PRs for morning review.

---

## Why this, why now

Every change currently needs a manual pass on the iPhone (pull main, update `EXPO_PUBLIC_BASE_URL`, Expo `--clear`, click through). That's the bottleneck. And the bugs that actually cost the most were **pure logic / data-shape bugs that never needed a phone to catch**:

- jsonb double-encode at the write boundary (PR #19) — a serialization-shape bug.
- `wellnessCheckSchedule` → `wellnessCheckItems` field-name mismatch — a contract bug.
- routine schedule fields arriving as stringified JSON, crashing generators — a parse/shape bug.
- `determinePetsRoute` auth/onboarding gating (PR #20) — a pure decision function (already unit-tested 31/31 — the model to copy).
- **The auth detour (PRs #21):** a redirect built from the wrong env origin (`AUTH_URL=localhost` → device -1004), then `secureCookie: process.env.AUTH_URL.startsWith(...)` throwing on an undefined value → every authenticated API route 500'd. **Hours of on-device log-spelunking to find two one-line bugs.** A unit test on the auth helper plus a CI smoke test hitting `/api/pets` with a session would have caught both in seconds.

The auth detour also exposed a **verification gap**: the fix was "verified" by testing the auth redirect/token endpoints directly, but no test ever hit an authenticated app route — so the 500 only surfaced on the physical phone. Closing that gap is an explicit goal of Phase A.

## Current state

- **Mobile:** Jest via `jest-expo`. One real suite (`determinePetsRoute`). No standard test script convention, no coverage setup, no CI.
- **Web backend (`anything/apps/web`):** Vitest installed but unused — no suites, not wired to anything.
- **No CI** running tests on PRs today.
- Auth is stable again as of PR #21 (Option B: `trustHost`, `AUTH_URL` unset, `secureCookie` guarded). Login + authenticated routes verified working.

## Guiding principles

1. **Phone-free first.** Optimize the base of the pyramid: pure functions and data-shape logic that run in milliseconds with no device, no Expo, ideally no DB.
2. **Every fixed bug gets a regression test.** A bug-fix PR includes the test that would have caught it. This is how the suite grows where it matters.
3. **Extract logic to test it.** Decision/serialization/generation logic moves out of components into pure functions (the `determinePetsRoute` pattern). Components stay thin.
4. **Test the path the user actually hits.** The auth detour proved that testing a subsystem in isolation isn't enough — an authenticated-route smoke test is worth more than ten endpoint-unit tests.
5. **CI is the gate, not a suggestion.** Green required to merge; red blocks.
6. **One writer at a time on the repo.** The two-Claude-Code-chats-clobbering-the-working-tree near-miss (the silent `trustHost` deletion) is a process bug; the autonomous phase formalizes single-writer discipline.

---

## Phase A — Test foundation (phone-free)

**Objective:** A reliable `npm test` on both mobile and web, plus first suites across all four high-value bug classes you selected.

### A1. Standardize the runners
- Mobile: commit a clean `jest.config` + `jest-expo` preset; add `"test"` / `"test:watch"` scripts; settle one test-file convention (`__tests__/` or co-located `*.test.js`).
- Web: activate the existing Vitest — config + `"test"` script + one trivial passing suite to prove the wire.
- Document the commands in `ARCHITECTURE.md`.

### A2. First suites — all four areas (your pick)

1. **Data-shape / serialization (lead with this).** Unit-test the write/read boundary where the double-encode happened: values written to jsonb columns are encoded once (the `sql.json` path), reads return parsed objects/arrays not stringified scalars. Pin the masked `medicalCareItems → []` case as an explicit regression test.
2. **Auth / API-route smoke (closes the detour's gap).** Tests that assert the *actual* request path: authenticated `GET /api/pets` → 200, anonymous → 401 (not 500), `GET /api/user-profile` → 200. A unit test on the `auth()` helper that it tolerates an unset `AUTH_URL` (the exact `secureCookie` line). This is the class that just cost hours.
3. **Routine generators.** Feeding / walk / wellness / medical-care: schedule → reminders. Assert item independence (completing Weight doesn't complete Mobility), delete-future-preserve-history, per-meal/body-area/item reminder fan-out, and that stringified-JSON schedule input is parsed.
4. **Pet/user scoping + decision functions.** Pure guards/selectors: data scoped by `pet_id` / `owner_user_id` (= `user_profiles.id`, never auth id); no cross-pet, no cross-user leakage. Keep extending the `determinePetsRoute` model for gating/branching logic.

### A3. Fixtures
Small hand-built fixtures matching the real identity chain (`auth_users.id` → `user_profiles.auth_user_id` → `user_profiles.id` → `pets.owner_user_id`) and the real column types (integer IDs, `text[]`, `integer[]`). Pure-unit items (A2.1, A2.3, A2.4) need no live DB; the auth/API-route smoke (A2.2) is best against the ephemeral Postgres set up in Phase C — start with a thin mock in A, upgrade to real round-trip in C.

**Acceptance criteria**
- `npm test` runs green on both mobile and web from a clean checkout.
- At least one regression test for each of: jsonb double-encode, the `auth()`/`secureCookie` unset-`AUTH_URL` throw, a generator stringified-input case, a scoping leak, a decision fn.
- The masked `medicalCareItems` case has a dedicated test.
- Conventions documented in `ARCHITECTURE.md`.

---

## Phase B — CI on every PR (GitHub Actions)

**Objective:** Routine changes self-verify. No green, no merge.

### B1. Workflow
- `.github/workflows/ci.yml` on PRs to `main` (and pushes to `main`).
- Jobs: install → lint (if present) → typecheck (if present) → mobile tests → web tests. Cache `node_modules`.
- Single Node version to start; keep it fast.

### B2. Branch protection + coverage
- Make the CI check **required** on `main` — a failing test blocks merge.
- Coverage is **informational** (reported on the PR, not gated). Tests passing is the merge gate; the coverage *number* is just visible. Flip to a hard threshold later, once the suite is mature, by adding a minimum to the test config — a one-line change.

### B3. Speed budget
- Keep the PR check well under a couple of minutes. Phone-free unit tests make this easy — that's the point.

**Acceptance criteria**
- Opening a PR auto-runs the suite; status shows on the PR.
- A failing test blocks merge on `main`.
- Coverage is reported but not blocking.
- CI time is short enough that you'll wait for it.

---

## Phase C — Broaden coverage + the data-layer round-trip

**Objective:** Move from "the bugs we already hit" to a durable net, and add the one thing pure unit tests can't fully prove: a real jsonb round-trip and a real authenticated request.

### C1. Ephemeral Postgres in CI
- Add a Postgres service to a CI job; run the actual migrations against it; execute true write→read round-trip tests on jsonb columns (the airtight double-encode catch), and run the **auth/API-route smoke (A2.2) against a real DB + session** so the detour's class is covered end to end. Keep this as a separate, slightly slower job so the fast unit job still gates PRs quickly.

### C2. Contract tests
- Lock the field-name contracts between mobile store ↔ backend ↔ DB (the `wellnessCheckItems` class).

### C3. Generator snapshots
- Snapshot generated-reminder output for representative routines so accidental fan-out changes show up in diffs.

### C4. The bug→test rule, formalized
- PR template line: "Regression test added (or N/A because …)." Makes principle #2 a habit.

**Acceptance criteria**
- CI runs real migrations + jsonb round-trip + authenticated-route tests against ephemeral Postgres.
- Routine-payload field-name contracts asserted.
- Generator outputs snapshotted.
- PR template enforces the regression-test prompt.

---

## Phase D — Autonomous overnight "fix-until-green" (detailed)

**Objective:** Hand Claude Code a scoped ticket at night; it iterates until the suite is green, then opens a PR you review over coffee. The A–C foundation is the precondition — without a trustworthy green signal, autonomous edits are unsafe. Build it last, but here's the full spec.

### D1. Preconditions (all must hold before switching it on)
- A–C suites are trusted: "green" genuinely means "didn't break the things that matter," including the auth/API-route smoke.
- CI is the required, independent gate on every PR (so the autonomous run can't be the only thing that says it's green).
- Tickets are scoped and their acceptance criteria are expressible as tests.

### D2. The task contract (what you write the night before)
A single ticket file per run, containing:
- **Title + context** — the same copy-paste format you already use.
- **Acceptance criteria as tests** — either tests that already exist and must go green, or a precise description of the tests the run should write *and* satisfy.
- **Scope boundaries** — the files/directories it may touch.
- **Forbidden zones (hard stops)** — no schema/migrations, no `.env` or secrets, no auth core, no dependency bumps, unless the ticket explicitly opts in.

### D3. The loop (what runs unattended)
1. Branch from `main` (naming: `auto/<ticket-slug>`).
2. Implement against the ticket.
3. Run the **full** suite locally.
4. If red, iterate fix→test — but **bounded**: a hard cap on iterations *and* wall-clock time. No infinite grinding.
5. If green within budget: push, open a PR labeled `autonomous` + `needs-review`, with a description listing what changed, which tests were added, and which acceptance criteria each satisfies.
6. If it **can't** reach green in budget: open a **draft** PR (or leave a report) stating exactly where it got stuck and what it tried — never a clean-looking PR that isn't actually green.

### D4. Guardrails (non-negotiable)
- **PR-only. No auto-merge. No force-push to `main`.** Human review is the merge gate, always.
- **Green-gated output:** a non-draft PR is opened only if the suite passes.
- **Independent CI re-check:** the PR must also go green in GitHub Actions (B), not just on the runner — catches env-specific passes.
- **Scoped blast radius:** one ticket per run; forbidden zones from D2 enforced.
- **No secrets in the loop:** connection strings/tokens stay in untracked `.env`; never printed, never committed.
- **No silent test-weakening:** the run may not delete, skip, or loosen a test to go green without flagging it loudly in the PR description. A weakened test is a red flag for your review. (Diff review is your backstop here.)
- **Single writer:** while an autonomous run is active on the repo, nothing else edits that working tree — the lesson from the two-chats `trustHost` clobber. Use a dedicated branch/checkout for the run.

### D5. Rollout (earn trust incrementally)
- Start with the **lowest-risk ticket types**: pure logic and copy/mock cleanup (e.g., Ticket 8 — the "Phoebe" strings + avatar fallback). No data writes.
- **One supervised dry run** (you watch it end to end) before any unattended overnight run.
- Widen scope only as the metrics justify it.

### D6. Morning review (your loop)
- Read the PR description, then the **diff** — not just the green check.
- Confirm CI is green on the PR independently.
- Confirm no test was weakened (the description must call out any test change).
- Merge, or send back with a comment. Sending back is cheap; that's the point.

### D7. Trust metrics (decide when to widen scope)
Track per autonomous PR: green-on-first-CI rate, your review time, and post-merge revert rate. Rising green-rate + low reverts = safe to hand it riskier tickets. Spikes in reverts = tighten scope or improve the suite.

### D8. Failure modes & mitigations
- **Flaky tests** → quarantine list; a flaky test must not be what an autonomous run "fixes."
- **Reward-hacking the tests** → the no-silent-weakening rule + human diff review.
- **Runaway iteration** → the D3 iteration/time caps.
- **Env drift** → pinned CI environment is the source of truth (B/C).

### D9. Infra needed
- A way to run Claude Code non-interactively against the repo on a schedule (nightly trigger).
- The green A–C suite.
- GitHub Actions as the independent gate.

**Acceptance criteria**
- A scoped ticket can be handed off and produce a green, reviewable, labeled PR with no human in the loop during the run.
- All D4 guardrails enforced; CI re-checks the PR independently.
- Stuck runs produce an honest draft/report, never a misleadingly-green PR.
- You spend mornings reviewing diffs, not re-running manual device tests.

---

## What's backend vs frontend vs CI

- **Mobile (frontend):** generator logic, scoping selectors, decision functions, store serialization boundary — pure, phone-free (Phase A).
- **Web backend:** Vitest suites for the data-access layer, the app↔DB serialization (`sql.json` write path), and the auth helper — pure unit + the ephemeral-Postgres round-trip and authenticated-route smoke (Phases A, C).
- **CI:** orchestrates both, gates `main`, hosts ephemeral Postgres, later hosts the autonomous loop (Phases B, C, D).

## What on-device testing becomes

It doesn't disappear; it shrinks to a **final visual smoke check** (does it render, does it feel right) instead of the place logic/data bugs are first discovered. Things tests still can't cover — keyboard-covers-input, date/time pickers, native camera/gallery, calendar permission flows — stay on-device, but as a short focused list, not "re-test everything."

## Recommended sequencing vs the ticket backlog

1. **Phase A + B now** (foundation + CI). Small, high-leverage; makes every later ticket cheaper to verify.
2. **Tickets 6 / 7** proceed in parallel — each lands with its own A2-style tests (Insights pet-scoping, Track DB writes). The bug→test rule paying for itself immediately.
3. **Phase C** once a few tickets have flowed through CI and you know where the friction is.
4. **Ticket 8 + More-tab nav**, then **Phase D** — by then the suite is trustworthy enough to gate autonomous runs, and Ticket 8 is the ideal first low-risk autonomous target.

## Decisions (resolved)

- **First-phase coverage:** all four areas — data-shape/serialization, auth/API-route smoke, routine generators, scoping + decision fns. Lead with data-shape; treat auth/API-route smoke as the gap-closer from the detour.
- **Coverage gating:** informational only (tests-pass is the gate; coverage % reported, not blocking). Revisit later.
- **Phase D:** detailed in full (D1–D9 above), but still built last on top of the A–C foundation.
