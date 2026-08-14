-- Verification for migration 0101 (engagement re-engagement / comeback loop, unit E12).
-- Run in the Supabase SQL editor AFTER applying 0101. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'reengagement_state table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='reengagement_state'

  union all
  select 2, 'reengagement_state FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.reengagement_state'::regclass

  union all
  select 3, 'reengagement_state own-row policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='reengagement_state' and policyname='reengagement_state_all'

  union all
  select 4, 'notifications_type_check allows winback',
         case when pg_get_constraintdef(oid) like '%winback%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(oid) like '%winback%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_type_check'

  union all
  select 5, 'app_reengagement_due(timestamptz,int,int,int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_reengagement_due'

  union all
  select 6, 'app_reengagement_due is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_reengagement_due'

  union all
  select 7, 'pawpi_app can EXECUTE app_reengagement_due',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_reengagement_due'
    and has_function_privilege('pawpi_app', p.oid, 'execute')

  union all
  select 8, 'app_winback_repair_streak(int,int,int) exists + DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when count(*)=1 and bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_winback_repair_streak'

  union all
  select 9, 'pawpi_app can EXECUTE app_winback_repair_streak',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_winback_repair_streak'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
