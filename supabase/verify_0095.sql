-- Verification for migration 0095 (engagement streak + forgiveness, unit E2).
-- Run in the Supabase SQL editor AFTER applying 0095. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'pet_streaks repair/milestone columns present' as check_name,
         count(*)::text||' / 3' as detail,
         case when count(*)=3 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='pet_streaks'
    and column_name in ('pre_reset_count','reset_at','last_award_count')

  union all
  select 2, 'app_advance_care_streak(int,int,date) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_advance_care_streak'

  union all
  select 3, 'app_repair_care_streak(int,int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_repair_care_streak'

  union all
  select 4, 'both streak helpers are SECURITY DEFINER',
         string_agg(proname||':'||case when prosecdef then 'definer' else 'invoker' end, ','),
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('app_advance_care_streak','app_repair_care_streak')

  union all
  select 5, 'pawpi_app can EXECUTE both helpers',
         count(*)::text||' / 2',
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('app_advance_care_streak','app_repair_care_streak')
    and has_function_privilege('pawpi_app', p.oid, 'execute')

  union all
  -- E2 must not change pet_streaks' RLS posture (still ENABLE+FORCE, own-row).
  select 6, 'pet_streaks RLS still ENABLE+FORCE (unchanged)',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_streaks'::regclass
)
select ord, check_name, detail, status from checks order by ord;
