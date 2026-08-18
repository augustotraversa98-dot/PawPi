-- Verification for migration 0118 (QC-B — health_general_checks.areas jsonb).
-- Run in the Supabase SQL editor AFTER applying 0118. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'health_general_checks.areas column exists' as check_name,
         count(*)::text || ' / 1' as detail,
         case when count(*) = 1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema = 'public' and table_name = 'health_general_checks'
    and column_name = 'areas'

  union all
  select 2, 'health_general_checks.areas is jsonb',
         coalesce(max(data_type), '(missing)'),
         case when max(data_type) = 'jsonb' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'health_general_checks'
    and column_name = 'areas'

  union all
  select 3, 'health_general_checks RLS still ENABLE+FORCE',
         'enabled=' || coalesce(relrowsecurity::text, '?') ||
         ' forced=' || coalesce(relforcerowsecurity::text, '?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid = 'public.health_general_checks'::regclass

  union all
  select 4, 'flat status columns still present (unchanged)',
         count(*)::text || ' / 9',
         case when count(*) = 9 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'health_general_checks'
    and column_name in ('eyes_status','ears_status','teeth_status','skin_fur_status',
                        'paws_status','face_status','mood','energy','notes')
)
select ord, check_name, detail, status from checks order by ord;
