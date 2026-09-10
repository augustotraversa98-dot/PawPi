-- Verification for migration 0126 (revoke Data-API roles; pin current_app_user_id search_path).
-- Run in the Supabase SQL editor AFTER applying 0126. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'anon/authenticated hold NO table privileges in public' as check_name,
         count(*)::text||' grants' as detail,
         case when count(*)=0 then 'PASS' else 'FAIL' end as status
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')

  union all
  select 2, 'anon/authenticated can EXECUTE no public function',
         count(*)::text||' functions', case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))

  union all
  select 3, 'anon cannot SELECT auth_users',
         has_table_privilege('anon','public.auth_users','SELECT')::text,
         case when has_table_privilege('anon','public.auth_users','SELECT') then 'FAIL' else 'PASS' end

  union all
  select 4, 'pawpi_app still reads pets (app unaffected)',
         has_table_privilege('pawpi_app','public.pets','SELECT')::text,
         case when has_table_privilege('pawpi_app','public.pets','SELECT') then 'PASS' else 'FAIL' end

  union all
  select 5, 'pawpi_app still executes current_app_user_id()',
         has_function_privilege('pawpi_app','public.current_app_user_id()','EXECUTE')::text,
         case when has_function_privilege('pawpi_app','public.current_app_user_id()','EXECUTE') then 'PASS' else 'FAIL' end

  union all
  select 9, 'pawpi_app can EXECUTE every public routine (app unaffected)',
         count(*)::text||' not executable', case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and not has_function_privilege('pawpi_app', p.oid, 'EXECUTE')

  union all
  select 6, 'service_role still reads pets (seed scripts unaffected)',
         has_table_privilege('service_role','public.pets','SELECT')::text,
         case when has_table_privilege('service_role','public.pets','SELECT') then 'PASS' else 'FAIL' end

  union all
  select 7, 'current_app_user_id() search_path pinned',
         coalesce(array_to_string(p.proconfig, ','), '(none)'),
         case when array_to_string(p.proconfig, ',') like '%search_path=public%' then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='current_app_user_id'

  union all
  select 8, 'no default privileges for anon/authenticated on future public tables',
         count(*)::text||' default acl entries', case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_default_acl d
  where d.defaclnamespace = 'public'::regnamespace
    and (array_to_string(d.defaclacl, ',') like '%anon=%' or array_to_string(d.defaclacl, ',') like '%authenticated=%')
)
select ord, check_name, detail, status from checks order by ord;
