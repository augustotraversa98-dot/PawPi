-- Companion to verify_0134.sql: default privileges (what FUTURE objects inherit). Run in the Supabase SQL editor
-- after migration 0134 and after the manual supabase_admin step in
-- docs/db-migration-runbook-0134-revoke-anon-execute.md. EVERY row should read PASS.
-- (verify_0126.sql row 8 is the same check as row 1 here.)
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

)
select ord, check_name, detail, status from checks order by ord;
