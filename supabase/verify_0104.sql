-- Verification for migration 0104 (household leaderboard, unit E13 PR3).
-- Run in the Supabase SQL editor AFTER applying 0104. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'household_leaderboard_prefs table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='household_leaderboard_prefs'

  union all
  select 2, 'household_leaderboard_prefs FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.household_leaderboard_prefs'::regclass

  union all
  select 3, 'owner-manage + caregiver-read policies exist',
         count(*)::text||' / 2',
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='household_leaderboard_prefs'
    and policyname in ('household_leaderboard_prefs_owner_all','household_leaderboard_prefs_caregiver_read')

  union all
  select 4, 'app_household_leaderboard(int,date) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_household_leaderboard'

  union all
  select 5, 'app_household_leaderboard is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_household_leaderboard'

  union all
  select 6, 'pawpi_app can EXECUTE app_household_leaderboard',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_household_leaderboard'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
