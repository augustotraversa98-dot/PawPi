-- Verification for migration 0105 (engagement family streak, unit E14).
-- Run in the Supabase SQL editor AFTER applying 0105. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'household_streaks table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='household_streaks'

  union all
  select 2, 'household_streaks FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.household_streaks'::regclass

  union all
  select 3, 'household_streaks own-row policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='household_streaks' and policyname='household_streaks_owner_all'

  union all
  select 4, 'app_advance_household_streak(int,date) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_advance_household_streak'

  union all
  select 5, 'app_advance_household_streak is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_advance_household_streak'

  union all
  select 6, 'pawpi_app can EXECUTE app_advance_household_streak',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_advance_household_streak'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
