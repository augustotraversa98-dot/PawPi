-- Verification for migration 0098 (engagement leaderboards, unit E8).
-- Run in the Supabase SQL editor AFTER applying 0098. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'pets opt-in coarse-geo columns present (lb_opt_in, lb_area)' as check_name,
         count(*)::text||' / 2' as detail,
         case when count(*)=2 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='pets' and column_name in ('lb_opt_in','lb_area')

  union all
  select 2, 'pet_leaderboard_weeks table exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables where table_schema='public' and table_name='pet_leaderboard_weeks'

  union all
  select 3, 'pet_leaderboard_weeks is ENABLE + FORCE RLS, own-row policy',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity
               and exists (select 1 from pg_policies where schemaname='public'
                           and tablename='pet_leaderboard_weeks' and policyname='pet_leaderboard_weeks_owner')
              then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_leaderboard_weeks'::regclass

  union all
  select 4, 'app_pet_week_xp + app_leaderboard exist, SECURITY DEFINER, pawpi_app EXECUTE',
         count(*)::text||' / 2',
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('app_pet_week_xp','app_leaderboard')
    and p.prosecdef and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
