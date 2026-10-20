-- 0134_revoke_public_execute_sweep.sql
-- Finish 0126 (AUDIT_2026-09 A-01): close the Data-API exposure for objects created AFTER 0126.
--
-- ⚠️ HAND-APPLY AFTER REVIEW (privilege revokes; see docs/db-migration-runbook-0134-revoke-anon-execute.md).
--    Human-applied: ships supabase/verify_0134.sql (every row must read PASS). It revokes nothing the app
--    uses: pawpi_app keeps — and is re-granted — EXECUTE on every function.
--
-- WHAT WENT WRONG. 0126 ran `revoke execute on all routines in schema public from public` once. Postgres
-- gives EVERY NEW function EXECUTE-to-PUBLIC by default, and a schema-scoped `alter default privileges …
-- revoke … from public` cannot undo that (a schema default ACL can only ADD privileges). So the 12
-- notification-v2 functions created by 0131 / 0132 came back callable by `anon` / `authenticated` through
-- PostgREST with the publishable key — verify_0126 row 2 reads FAIL on production:
--   app_log_notification_send, app_mark_push_token_invalid, app_notification_send_log_gc,
--   app_notification_sends_today, app_pending_push_tickets, app_recipient_notification_settings,
--   app_recipient_valid_push_tokens, app_record_push_ticket, app_reserve_notification_send,
--   app_resolve_push_tickets, app_set_email_consent, app_user_day_start.
-- Rather than list those 12, this migration SWEEPS: it re-applies the revoke to EVERY routine, table and
-- sequence in schema public, so any other object created since 0126 (or left over from before) is closed too.
-- Idempotent: revoking an absent privilege is a no-op, re-granting to pawpi_app is a no-op.
--
-- WHY SAFE. The app connects as pawpi_app, never via the Data API (docs/db-data-api-safety-evidence.md).
-- pawpi_app (and service_role, for the seed scripts) are explicitly granted EXECUTE on every routine below.
-- Guards: the anon / authenticated / service_role / supabase_admin statements only run when that role
-- exists (the integration harness has none of them, a plain Postgres cluster either).
--
-- FUTURE FUNCTIONS. The PUBLIC default cannot be removed per schema, so every migration that creates a
-- function must carry its own `revoke execute … from public, anon, authenticated; grant execute … to
-- pawpi_app` pair (supabase/migrations/TEMPLATE.sql §2). CI enforces it:
-- test/integration/no-public-grants.integration.test.ts fails on any function left executable by PUBLIC.
--
-- DEFAULT PRIVILEGES for role supabase_admin (verify_0126 row 8 — 3 entries granting anon/authenticated on
-- future tables / sequences / functions): attempted below, guarded. If the SQL editor role may not alter
-- another role's defaults this prints a NOTICE and changes nothing; the runbook then has the exact manual
-- step. Either way verify_0134_default_acl.sql tells you whether it is closed.

do $$
declare
  r text;
begin
  -- 1. Every routine in public: nobody but the owner/superusers and the roles we name can execute it.
  revoke execute on all routines in schema public from public;

  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all privileges on all routines  in schema public from %I', r);
      execute format('revoke all privileges on all tables    in schema public from %I', r);
      execute format('revoke all privileges on all sequences in schema public from %I', r);
    end if;
  end loop;

  -- 2. The roles that legitimately call them.
  grant execute on all routines in schema public to pawpi_app;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all routines in schema public to service_role;
  end if;

  -- 3. Future objects created by supabase_admin must not be handed to the Data API roles.
  --    (0126 already did this for role postgres, the role migrations run as.)
  if exists (select 1 from pg_roles where rolname = 'supabase_admin')
     and exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    begin
      execute 'alter default privileges for role supabase_admin in schema public revoke all on tables    from anon, authenticated';
      execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
      execute 'alter default privileges for role supabase_admin in schema public revoke all on routines  from anon, authenticated';
    exception when insufficient_privilege then
      raise notice '0134: could not alter default privileges for role supabase_admin from this role — run the manual step in docs/db-migration-runbook-0134-revoke-anon-execute.md';
    end;
  end if;
end
$$;
