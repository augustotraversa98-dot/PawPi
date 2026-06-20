# UGC Moderation Build Log (App Store Guideline 1.2)

Per-ticket record of the autonomous build of `docs/phase-ugc-moderation-plan.md` (T1–T7).
Build order: **T1 → T2 → T3 → T4**, then **T5, T6, T7**. Merge gate = green CI (mobile jest +
web vitest + web integration). Device tests deferred to Augusto's return (collected per ticket).

Baselines at start (post-#227, live DB at 0064): **mobile 1101 · web unit 1203 · integration 592.**
(Local web-unit shows 1210 because the uncommitted demo-seed `scripts/**` glob in `vitest.config.ts`
is present in the working tree; CI uses the committed config → 1203. That change is unrelated to this
phase and is deliberately NOT included in any UGC PR.)

---

## T1 — Migration 0065: moderation primitives (DB only)

- **Built:** `supabase/migrations/0065_ugc_moderation.sql` — the single schema change for the whole
  1.2 phase.
  - `content_reports` (polymorphic report ledger; reporter reads/writes only own; FORCE RLS;
    status changes via DEFINER only).
  - `user_blocks` (real user→user block, distinct from `pet_friendships.status='blocked'`;
    blocker reads/writes/soft-deletes own; partial-unique live pair; FORCE RLS).
  - `hidden_at timestamptz` (additive) on 11 peer-UGC content tables (posts, post_barks,
    forum_threads, forum_comments, messages, dm_messages, provider_reviews, adoptable_listings,
    events, social_walks, lost_reports) = "removed by us" (distinct from author `deleted_at`).
  - `banned_at timestamptz` (additive) on `user_profiles`.
  - DEFINER helpers (pinned search_path, EXECUTE→pawpi_app): `app_is_admin`,
    `app_user_is_blocked`, `app_moderate_hide`, `app_moderate_unhide`, `app_ban_user`.
  - Additive widen of `notifications_type_check` for `'report_received'`.
- **Files:** `supabase/migrations/0065_ugc_moderation.sql`,
  `anything/apps/web/test/integration/ugc-moderation.integration.test.ts` (21 tests),
  `supabase/verify_0065.sql` (11 PASS-row checks for the SQL editor).
- **Completeness guard:** the two new tables auto-classify (FORCE-RLS + policies) — no allowlist
  edit needed; `rls-gap-closure.integration.test.ts` still green.
- **Migration status:** harness-proven (65 migrations apply clean on embedded-postgres).
  **PENDING hand-apply to live Supabase** — the DB is unreachable from the build environment
  (`ECONNREFUSED`) and `DATABASE_URL` connects as the non-DDL `pawpi_app` role, so DDL must be run
  by Augusto in the Supabase SQL editor (same hand-apply pattern as every prior migration; "Tats
  ran it"). `supabase/verify_0065.sql` is ready — every row should read PASS.
- **Decision:** target_type `provider_message` maps to the provider-chat `messages` table and
  `dm_message` to owner↔owner `dm_messages`. `pet_profile`/`user_profile` report target_types are
  accepted by the ledger but NOT hideable via `app_moderate_hide` (no content row to hide) — abusive
  users are handled via `app_ban_user`; the hide helper raises on unsupported types. Smallest option
  consistent with the plan.
- **Decision:** skipped the optional `terms_accepted_at` audit column (Deferred list — acceptance is
  client-side in T5; not required for review).
- **Local suite:** mobile 1101 ✓ · web unit 1210 ✓ (1203 on CI) · integration **613** ✓ (592 + 21).
- **CI result:** ✅ all 3 green (mobile jest / web vitest / web integration).
- **Merge status:** ✅ squash-merged to main — **PR #228, commit `a382077`**, branch deleted.
- **Device tests needed:** none (pure DB). Augusto must hand-apply 0065 + run `verify_0065.sql`.

---

## T2 — Report / Block / admin-action APIs (backend, no UI)

- **Built:** thin routes over the 0065 tables/helpers (RLS pins reporter/blocker = caller; admin
  paths go through SECURITY DEFINER helpers).
  - `POST /api/reports` (file; idempotent per open (reporter,target)) · `GET /api/reports` (own).
  - `POST /api/blocks` (block; idempotent live pair) · `GET /api/blocks` (own live list) ·
    `DELETE /api/blocks/[id]` (unblock = soft-delete).
  - `GET /api/admin/reports?status=` (queue) · `POST /api/admin/reports/[id]/action`
    `{action:'hide'|'remove'|'dismiss', ban?}`.
- **DB decision (logged):** the admin queue runs under `pawpi_app` + FORCE RLS, where
  `content_reports`' reporter-own SELECT hides other users' reports and there is no UPDATE policy —
  so an admin literally cannot read the queue or change status directly. T1 shipped no admin
  read/dismiss helper. Smallest correct fix: **extend the single phase migration `0065`** (still
  the only schema change; not yet live-applied; `CREATE OR REPLACE` keeps it idempotent) with two
  admin DEFINER helpers — `app_admin_list_reports(status)` and
  `app_admin_action_report(report_id, action, ban)` (the latter resolves the content author for the
  ban). Updated `supabase/verify_0065.sql` (fn count 5→7). **0065 should be (re)applied in its final
  form after T2 merges** — idempotent, so re-applying over a T1-only 0065 is safe.
- **Files:** `src/app/api/reports/route.js` (+ test), `src/app/api/blocks/route.js` (+ test),
  `src/app/api/blocks/[id]/route.js` (+ test), `src/app/api/admin/reports/route.js` (+ test),
  `src/app/api/admin/reports/[id]/action/route.js` (+ test); `supabase/migrations/0065_ugc_moderation.sql`
  (+2 helpers), `supabase/verify_0065.sql`; extended `test/integration/ugc-moderation.integration.test.ts`
  (+5 admin-helper cases, proven as pawpi_app).
- **Tests:** +27 vitest route tests, +5 integration. All routes wrapped in `withRequestContext`
  (route-wrap completeness guard green).
- **Migration status:** 0065 extended — still PENDING hand-apply (now 7 DEFINER fns; `verify_0065.sql`).
- **Local suite:** mobile 1101 ✓ · web unit 1237 ✓ (1230 on CI) · integration 613 → **618** ✓.
- **CI result:** _pending push_
- **Merge status:** _pending_
- **Device tests needed:** none (curl-provable). Surfaces it powers get device tests in T4.

---
