-- 0111 — mark demo/seed accounts so their content never leaks into real users' feeds.
--
-- The App-Review demo seed (scripts/demo-seed) creates ONE sanctioned demo account plus a
-- clinic, two friend accounts, and ~54 filler "fans" whose sole purpose is to make the demo
-- pet (Mango) look popular. Those rows are real (RLS-faithful) so the demo login works for
-- Apple review — but because PawPi's GLOBAL surfaces (Discover, Search, feed "Suggested",
-- provider/adoption discovery) rank/return content across ALL users, the fake fans + Mango's
-- posts + the demo clinic + its adoption listings surface to every real user. That is a
-- no-fake-data violation (docs/night-run-2026-08-16.md A2a).
--
-- This migration adds an honest per-profile flag so those global surfaces can EXCLUDE
-- demo-owned content while owner/following-scoped views (the demo account's own profile,
-- Health, bookings — what Apple review actually exercises) stay untouched.
--
-- PURELY ADDITIVE. No existing table's RLS is touched (user_profiles keeps its owner-private
-- policy from the RLS arc; a boolean column with a default rides it). Consumers degrade
-- cleanly: pre-migration the exclusion predicate simply isn't present, so behaviour is exactly
-- as it is today (fake data visible). After apply + backfill, demo content drops out of the
-- global surfaces. Idempotent (add column if not exists).
-- Verify: supabase/verify_0111.sql. Backfill of live rows is a data step (see the report /
-- night-run-log), NOT baked into this DDL migration.

-- ── user_profiles.is_demo ─────────────────────────────────────────────────────
-- NOT NULL DEFAULT false — every real account is a real account. Only the demo-seed runner
-- (and the one-off prod backfill) ever set this true. The column is owner-agnostic metadata
-- (no PII), so it rides the existing owner-private RLS without a policy change; the global
-- discovery queries read it through the same broad SELECT paths they already use for
-- banned_at / blocked-user exclusion.
alter table user_profiles add column if not exists is_demo boolean not null default false;

comment on column user_profiles.is_demo is
  'True only for demo/seed accounts (App Review demo, its clinic/friends, and filler fans). '
  'Global surfaces (Discover, Search, feed Suggested, provider/adoption discovery) exclude '
  'content owned by is_demo profiles so seed data never reaches real users. Set by '
  'scripts/demo-seed and the prod backfill only.';

-- Optional partial index: the exclusion subqueries filter "WHERE is_demo" (a tiny set), so a
-- partial index keeps those lookups cheap even as the user base grows.
create index if not exists idx_user_profiles_is_demo on user_profiles (id) where is_demo;

-- ── providers.is_demo (denormalized) ──────────────────────────────────────────
-- The provider-facing global surfaces have a deliberate NO-LEAK contract: feed/suggestions
-- must not read user_profiles at all, and providers discovery must never even reference
-- owner_user_profile_id (both enforced by their route tests). So the demo flag is denormalized
-- onto providers itself — a provider owned by a demo profile is a demo provider. This keeps the
-- exclusion a plain "p.is_demo IS NOT TRUE" with no owner join. Rides the existing 0024 RLS.
alter table providers add column if not exists is_demo boolean not null default false;

comment on column providers.is_demo is
  'True for demo/seed providers (mirrors the owner profile''s is_demo). Provider/adoption '
  'discovery excludes these so the seed clinic never appears to real users. Set by '
  'scripts/demo-seed and the prod backfill only.';

create index if not exists idx_providers_is_demo on providers (id) where is_demo;
