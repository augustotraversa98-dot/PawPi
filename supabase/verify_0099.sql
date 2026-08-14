-- Verification for migration 0099 (engagement activity insight, unit E9).
-- Run in the Supabase SQL editor AFTER applying 0099. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'app_activity_cohort(int,int,date,int) exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_activity_cohort'

  union all
  select 2, 'app_activity_cohort is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_activity_cohort'

  union all
  select 3, 'pawpi_app can EXECUTE app_activity_cohort',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_activity_cohort'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
