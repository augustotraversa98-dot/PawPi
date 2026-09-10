-- 0126_revoke_data_api_roles.sql
-- Security hardening — AUDIT_2026-09 findings A-01 (P0, latent) and A-32 (P2).
--
-- ⚠️ HAND-APPLY AFTER REVIEW. Not applied by any automation. It REVOKES privileges, so it
-- must be read by a human first — but note it revokes nothing the app uses (see "Why safe").
--
-- WHAT
-- 1. Supabase's default GRANT ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public TO
--    anon, authenticated was never revoked. The live audit (2026-09-09) found both roles hold
--    SELECT/INSERT/UPDATE/DELETE/TRUNCATE on EVERY public table — including the five
--    RLS-EXEMPT identity tables (auth_users with password hashes, auth_accounts,
--    auth_sessions, auth_verification_token, user_profiles; RLS disabled by 0026 on
--    purpose) — and EXECUTE on all 92 SECURITY DEFINER helpers, several of which take their
--    subject as a parameter (app_notify, app_grant_walk_credits, ingest_food_recall,
--    app_record_consent, app_create_password_reset_token, …). PostgREST (the Supabase Data
--    API) is running and exposes schema public, so the only thing between the internet and a
--    full dump of auth_users is the project's anon key — which Supabase itself treats as a
--    "publishable" value. PawPi never uses the Data API: the app connects directly as
--    pawpi_app (RLS live, 0019), the seed/verification scripts use service_role. So these
--    grants are pure attack surface. This migration revokes them and stops future objects
--    from inheriting them (default privileges).
-- 2. current_app_user_id() (0019) has a role-mutable search_path — the one live Supabase
--    security-advisor warning. It is SECURITY INVOKER and only reads a GUC, so this is
--    hygiene, but every RLS policy calls it; pin search_path like every other helper.
--
-- WHY SAFE
-- - pawpi_app (the app's role) is untouched.
-- - service_role (seed scripts, storage verification curls) is untouched.
-- - postgres / supabase_admin / dashboard are untouched.
-- - Nothing in the repo uses supabase-js, the anon key, or /rest/v1 (verified by grep
--   across mobile + web + scripts on 2026-09-09).
-- - Idempotent: REVOKE of an absent privilege is a no-op; the role-existence guards make it
--   a no-op in the embedded-Postgres harness (no anon/authenticated roles there).
--
-- BELT AND BRACES (dashboard, not SQL): Settings → API → "Exposed schemas": remove `public`.
-- The app does not use the Data API, so nothing is lost and the surface goes to zero even
-- if a future migration re-grants something by mistake.
--
-- VERIFY (supabase/verify_0126.sql): every row must read PASS.

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all privileges on all tables    in schema public from %I', r);
      execute format('revoke all privileges on all sequences in schema public from %I', r);
      execute format('revoke all privileges on all routines  in schema public from %I', r);
    end if;
  end loop;

  -- Functions are EXECUTE-able by PUBLIC by default in PostgreSQL, so revoking the
  -- role-specific grant alone leaves anon/authenticated able to call every helper through
  -- PUBLIC (proven in the harness). Close that: revoke from PUBLIC and grant the app role
  -- (and service_role, for the seed scripts) explicitly. pawpi_app already holds explicit
  -- grants on the 0019 helpers; this widens it to every public routine so nothing the app
  -- calls today can regress. Owners/superusers (postgres, supabase_admin) are unaffected.
  revoke execute on all routines in schema public from public;
  grant  execute on all routines in schema public to pawpi_app;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all routines in schema public to service_role;
  end if;

  -- Future objects: Supabase's platform default is
  --   alter default privileges for role postgres in schema public grant all on … to anon, authenticated, service_role
  -- Undo the anon/authenticated part for objects created by postgres (the role the SQL
  -- editor / migrations run as). Guarded: only when all three roles exist (harness: none
  -- do) and only if the executing role may alter postgres's defaults (it is postgres on
  -- Supabase; a plain notice otherwise, never a failed migration).
  if exists (select 1 from pg_roles where rolname = 'postgres')
     and exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    begin
      execute 'alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated';
      execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated';
      execute 'alter default privileges for role postgres in schema public revoke all on routines  from anon, authenticated';
      execute 'alter default privileges for role postgres in schema public revoke execute on routines from public';
      execute 'alter default privileges for role postgres in schema public grant execute on routines to pawpi_app';
    exception when insufficient_privilege then
      raise notice '0126: could not alter default privileges for role postgres (run as postgres to also cover future objects)';
    end;
  end if;
end
$$;

-- A-32: pin the search_path of the identity helper every RLS policy calls.
alter function current_app_user_id() set search_path = public, pg_temp;
