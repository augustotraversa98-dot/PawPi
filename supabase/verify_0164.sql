-- Verification for migration 0164 (walk distances in km). Run in the Supabase SQL editor AFTER applying 0164.
-- EVERY row should read PASS (3 rows). Read-only.
with
checks as (
  select 1 as ord, 'a new walk is in km unless it says otherwise' as check_name,
         coalesce((select column_default from information_schema.columns
                   where table_schema = 'public' and table_name = 'health_walk_logs' and column_name = 'distance_unit'), '(none)') as detail,
         case when exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'health_walk_logs' and column_name = 'distance_unit'
                             and column_default = '''km''::text')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'no walk is stored in miles',
         (select count(*)::text from health_walk_logs where distance_unit in ('miles', 'mi')) || ' in miles, '
           || (select count(*)::text from health_walk_logs where distance_unit = 'km') || ' in km',
         case when not exists (select 1 from health_walk_logs where distance_unit in ('miles', 'mi'))
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'row security is still enabled and forced on walk logs',
         coalesce((select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class
                   where oid = to_regclass('public.health_walk_logs')), '(missing)'),
         case when exists (select 1 from pg_class where oid = to_regclass('public.health_walk_logs')
                             and relrowsecurity and relforcerowsecurity)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
