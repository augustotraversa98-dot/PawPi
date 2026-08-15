-- 0114_admin_identity.sql
-- MOD1 PR1 — admin identity + alerting foundation (Apple Guideline 1.2: you must be able to
-- ACT on reports). Reports land in content_reports (0065) and an admin queue API exists, but
-- prod has ZERO admins so the queue 403s for everyone. Three purely additive changes:
--
--   1. user_profiles.is_admin (boolean, default false) — a SECOND admin flag that does NOT
--      overload user_profiles.role. Tats is a real pet_owner/business and must stay one AND be
--      a moderator; role='admin' would rewrite his identity. is_admin is orthogonal.
--   2. app_is_admin() widened to (role = 'admin' OR is_admin = true) — BACKWARD COMPATIBLE:
--      every existing role='admin' user stays admin; the new flag is purely additive.
--   3. app_admin_recipients() SECURITY DEFINER reader — the alerting path (POST /api/reports)
--      runs in the REPORTER's request identity, which under user_profiles' owner-private FORCE
--      RLS cannot SELECT another user's profile. This returns (user_id, email) for every
--      non-banned admin so the report route can bell + email them. DEFINER + pinned search_path
--      + granted to pawpi_app (the 0093 app_provider_active_staff_ids / 0109 push-reader pattern).
--
-- No table's RLS is touched; no new table (so no rls-gap-closure allowlist entry needed).
-- Idempotent (add column if not exists / create or replace / guarded seed). Consumers degrade
-- cleanly while absent (42883 undefined_function / 42703 undefined_column → no admins, no alert,
-- never a 500). HARNESS-PROVEN; hand-applied to Supabase after merge via supabase/verify_0114.sql.

-- ── 1. is_admin flag ─────────────────────────────────────────────────────────────
alter table user_profiles add column if not exists is_admin boolean not null default false;

-- ── 2. app_is_admin() honors role='admin' OR is_admin=true (widen 0065) ───────────
create or replace function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from user_profiles
    where id = current_app_user_id()
      and (role = 'admin' or is_admin = true)
  )
$$;
grant execute on function app_is_admin() to pawpi_app;

-- ── 3. app_admin_recipients() — the admins to alert on a new report ───────────────
-- One row per non-banned admin with their email (from auth_users; nullable — the alert path
-- skips a null email and still rings the in-app bell). DEFINER so the reporter's identity can
-- enumerate admins it could never SELECT directly under FORCE RLS.
create or replace function app_admin_recipients()
returns table (user_id integer, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, a.email
  from user_profiles p
  left join auth_users a on a.id = p.auth_user_id
  where (p.role = 'admin' or p.is_admin = true)
    and p.banned_at is null
$$;
grant execute on function app_admin_recipients() to pawpi_app;

-- ── 4. Seed the launch admin (guarded, idempotent, email-matched — not a secret) ──
-- MOD1 needs at least one admin at launch (prod currently has ZERO, so the queue 403s for
-- everyone). This flags the owner's account by EMAIL LOOKUP — not a hardcoded id, not a
-- credential. It matches ZERO rows anywhere that account is absent (the integration harness
-- seeds `<username>@example.com` identities, so this is a safe no-op there). Re-runnable.
update user_profiles p
set is_admin = true
from auth_users a
where a.id = p.auth_user_id
  and lower(a.email) = lower('augustotraversa98@gmail.com')
  and p.is_admin is distinct from true;
