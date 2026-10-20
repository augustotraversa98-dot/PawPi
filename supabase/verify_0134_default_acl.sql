-- Companion to verify_0134.sql: default privileges (what FUTURE objects inherit). Run in the Supabase SQL editor
-- after migration 0134 and after the manual supabase_admin step in
-- docs/db-migration-runbook-0134-revoke-anon-execute.md. EVERY row should read PASS.
-- (verify_0126.sql row 8 is the same check as row 1 here.)
--
-- KNOWN ACCEPTED FAIL on production (owner decision 2026-10-20, see the "Decision recorded" section of
-- docs/db-migration-runbook-0134-revoke-anon-execute.md): ROW 1 reads FAIL with exactly the three role
-- supabase_admin entries (tables r, sequences S, functions f) because the SQL editor role gets 42501 trying
-- to revoke them. Rows 2 and 3 MUST still read PASS: row 3 proves the leftover is ONLY supabase_admin.
with checks as (
  select 1 as ord, 'no default privilege in schema public grants anon / authenticated, for ANY owning role' as check_name,
         coalesce(string_agg(distinct d.defaclrole::regrole::text || ':' || d.defaclobjtype::text, ', '), '(none)') as detail,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as status
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace
    and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))

  union all
  select 2, 'no default privilege in schema public grants PUBLIC',
         count(*)::text || ' entry(ies)',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace and a.grantee = 0

  union all
  -- Guard that makes the accepted row-1 leftover safe: no OTHER owning role may grant anon/authenticated.
  select 3, 'no default privilege grants anon / authenticated for any role OTHER than the accepted supabase_admin leftover',
         coalesce(string_agg(distinct d.defaclrole::regrole::text || ':' || d.defaclobjtype::text, ', '), '(none)'),
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace
    and d.defaclrole <> coalesce((select oid from pg_roles where rolname = 'supabase_admin'), 0)
    and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
)
select ord, check_name, detail, status from checks order by ord;
