-- Verification for migration 0162 (provider_services.source). Run in the Supabase SQL editor AFTER
-- applying 0162. EVERY row should read PASS (6 rows). Read-only (catalog and data checks only).
with
col as (
  select data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'provider_services' and column_name = 'source'
),
con as (
  select pg_get_constraintdef(oid) as def, convalidated
  from pg_constraint
  where conrelid = 'public.provider_services'::regclass and conname = 'provider_services_source_check'
),
rel as (
  select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.provider_services'::regclass
),
pol as (
  select string_agg(policyname, ',' order by policyname) as names
  from pg_policies where schemaname = 'public' and tablename = 'provider_services'
),
checks as (
  select 1 as ord, 'source is a NOT NULL text column' as check_name,
         coalesce((select data_type || ' nullable=' || is_nullable from col), '(missing)') as detail,
         case when exists (select 1 from col where data_type = 'text' and is_nullable = 'NO') then 'PASS' else 'FAIL' end as result
  union all
  select 2, 'source defaults to owner',
         coalesce((select column_default from col), '(none)'),
         case when exists (select 1 from col where column_default like '''owner''%') then 'PASS' else 'FAIL' end
  union all
  select 3, 'source only allows owner or auto_enriched',
         coalesce((select def from con), '(missing)'),
         case when exists (select 1 from con where convalidated and def like '%''owner''%' and def like '%''auto_enriched''%')
              then 'PASS' else 'FAIL' end
  union all
  select 4, 'RLS still enabled and forced',
         coalesce((select relrowsecurity::text || '/' || relforcerowsecurity::text from rel), '(missing)'),
         case when exists (select 1 from rel where relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end
  union all
  select 5, 'the 0024 policies are unchanged (no policy added or removed)',
         coalesce((select names from pol), '(none)'),
         case when (select names from pol) = 'provider_services_admin_all,provider_services_read' then 'PASS' else 'FAIL' end
  union all
  select 6, 'anon and authenticated hold no grant on provider_services',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'provider_services' and grantee in ('anon', 'authenticated', 'PUBLIC')),
         case when not exists (select 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'provider_services' and grantee in ('anon', 'authenticated', 'PUBLIC'))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, result from checks order by ord;
