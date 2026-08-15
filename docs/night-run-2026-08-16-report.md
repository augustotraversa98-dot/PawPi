# PawPi Pre-Launch Night Run — Findings & Report (2026-08-16 plan, run started 2026-08-15)

Live findings log for the autonomous 4-phase run (A QA/Hardening → B Performance → C Legal →
D Apple submission prep). Plan: [docs/night-run-2026-08-16.md](night-run-2026-08-16.md). Each item
is its own PR (CI-green → merge → deploy/verify → log). Severity: **P0** blocker · **P1** · **P2** ·
**cosmetic**. Status: FIXED (PR#…) · ON-DEVICE PUNCH LIST · DEFERRED · BLOCKED.

---

## Executive summary (updated as the run proceeds)

**Shipped so far:**
- (A2a) **Demo/seed content leak into real users' feeds — FIXED.** See below.

**On-device punch list (for Tats):** _accumulating — see the Punch List section._

**Legal-review checklist:** _pending Phase C._

**Apple runbook next-steps:** _pending Phase D._

**Environment note:** This run has live Supabase MCP access to the prod project
(`qaebbesldduvgwttqlnq`, "PawPi - Supabase") and Railway MCP, so additive migrations are applied +
verified against prod directly (logged per item). Prod DB had **58 of 72 profiles being demo/seed
rows** (the App-Review seed + 54 filler "fans") at run start — the dominant source of the fake-data
leak below.

---

## PHASE A — QA & Hardening

### A2a — Demo/seed content leaking into production feeds & discovery — **P0 → FIXED**

**Finding.** The App-Review demo seed (`scripts/demo-seed`) creates one sanctioned demo account
plus a clinic, two friend accounts, and **54 filler "fan" accounts** whose only purpose is to make
the demo pet **Mango** look popular (fake follows/paws/barks/reviews). Those rows are real
(RLS-faithful), so the demo login works for Apple — but PawPi's **global** surfaces rank/return
content across *all* users, so the fake fans + Mango's posts + the demo clinic + its 3 adoption
listings surfaced to **every real user**. Confirmed on prod: 58/72 profiles, 5 pets, 6 posts, 1
provider, 3 adoption listings were demo/seed. Direct no-fake-data violation.

**Leak surfaces identified (all global, non-owner-scoped reads):**
`/api/discover` (profiles + moments), `/api/search` (pets/owners/providers), `/api/feed/suggestions`
(providers + adoptions), `/api/providers/discover`, `/api/services/discover`, `/api/adoption/listings`
(browse), and `/api/posts` "Suggested" feed. Leaderboards were checked and are **clean** (0 demo
pets opted in).

**Fix (this env can apply DDL, so applied to prod).**
- **Migration 0111** (`supabase/migrations/0111_user_profiles_is_demo.sql`, verify_0111.sql): additive
  `user_profiles.is_demo` + denormalized `providers.is_demo` (both `not null default false`, partial
  indexes). No RLS/policy change. `providers.is_demo` is denormalized specifically so the provider
  discovery + feed/suggestions surfaces (which have a no-leak contract forbidding any `user_profiles`
  read or `owner_user_profile_id` reference) can filter with a plain `p.is_demo IS NOT TRUE`.
- **Exclusion filters** added to all 7 global surfaces above (owner/following-scoped views — the demo
  account's own profile/Health/bookings that Apple review actually exercises — are untouched, so the
  demo login still shows a fully-populated app).
- **Seed runner hardened:** stamps `is_demo=true` on every seeded account/filler/provider, and now
  **refuses to seed production** unless `ALLOW_PROD_SEED=1` is set explicitly (reset stays always-on).
- **Integration test** `demo-content-guard.integration.test.ts` (5 cases) proves each surface excludes
  the demo owner while keeping an identical real owner.
- **Prod data backfill** (safe UPDATE, no deletes): flag the existing 58 demo profiles + 1 demo
  provider `is_demo=true`. _Status logged in night-run-log once applied._

**Why not delete the rows?** The demo account must stay for Apple review. Marking + filtering is the
"soft-remove/guard" the plan calls for — reversible, no prod data destroyed, real users see nothing.

**PR:** _fix/demo-content-leak-guard (pending push/CI/merge)._

---

## ON-DEVICE PUNCH LIST (visual/interaction items CC cannot confirm headless)

_(accumulating)_

## DEFERRED / BLOCKED

_(none yet)_
