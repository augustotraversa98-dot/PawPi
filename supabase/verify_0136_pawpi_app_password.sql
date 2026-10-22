-- Verification for the HAND-APPLIED pawpi_app password rotation (docs/ops/secret-rotation-runbook.md, section 2.1).
-- There is no migration file: the change is `ALTER ROLE pawpi_app ... PASSWORD`, run by a human. 0136 only labels this
-- verify script; it is not a migration number (do not create supabase/migrations/0136_*.sql for it).
--
-- HOW TO RUN: connect AS pawpi_app with the NEW DATABASE_URL (the pooler URL the app uses), for example
--   psql "$DATABASE_URL" -f supabase/verify_0136_pawpi_app_password.sql
-- Row 1 reading PASS is what proves the new password authenticates. EVERY row should read PASS.
-- Run from the SQL editor (role postgres) it is expected to FAIL row 1 only; that is not a valid verification.
--
-- The password itself cannot be read from SQL (pg_roles.rolpassword always shows ********). The other half of the
-- proof is manual: the OLD password must be rejected (`password authentication failed`) when you try it with psql.
with me as (
  select r.* from pg_roles r where r.rolname = 'pawpi_app'
),
checks as (
  select 1 as ord, 'this session authenticated as pawpi_app (new password works)' as check_name,
         session_user::text as detail,
         case when session_user = 'pawpi_app' then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'pawpi_app is a plain login role (no superuser, createrole, createdb, replication, bypassrls)',
         'super=' || rolsuper || ' createrole=' || rolcreaterole || ' createdb=' || rolcreatedb
           || ' repl=' || rolreplication || ' bypassrls=' || rolbypassrls,
         case when rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb
                   and not rolreplication and not rolbypassrls then 'PASS' else 'FAIL' end
  from me

  union all
  select 3, 'password is not set to expire in the past',
         coalesce(rolvaliduntil::text, '(no expiry)'),
         case when rolvaliduntil is null or rolvaliduntil > now() then 'PASS' else 'FAIL' end
  from me

  union all
  select 4, 'pawpi_app is a member of no other role (no privilege inherited via membership)',
         coalesce(string_agg(g.rolname, ', ' order by g.rolname), '(none)'),
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_auth_members m
  join pg_roles g on g.oid = m.roleid
  join pg_roles u on u.oid = m.member and u.rolname = 'pawpi_app'

  union all
  select 5, 'statement_timeout = 15s and idle_in_transaction_session_timeout = 30s still set on the role (0127)',
         coalesce(array_to_string(rolconfig, ', '), '(unset)'),
         case when 'statement_timeout=15s' = any (rolconfig)
                   and 'idle_in_transaction_session_timeout=30s' = any (rolconfig) then 'PASS' else 'FAIL' end
  from me

  union all
  select 6, 'identity is deny-by-default: current_app_user_id() is NULL with no identity in scope',
         coalesce(current_app_user_id()::text, 'NULL'),
         case when current_app_user_id() is null then 'PASS' else 'FAIL' end

  union all
  select 7, 'RLS is enabled and forced on public.pets, and pawpi_app sees 0 rows without an identity',
         'relrowsecurity=' || c.relrowsecurity || ' relforcerowsecurity=' || c.relforcerowsecurity
           || ' visible_rows=' || (select count(*) from public.pets),
         case when c.relrowsecurity and c.relforcerowsecurity and (select count(*) from public.pets) = 0
              then 'PASS' else 'FAIL' end
  from pg_class c
  where c.oid = 'public.pets'::regclass
)
select ord, check_name, detail, status from checks order by ord;
