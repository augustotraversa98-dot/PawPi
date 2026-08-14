-- Verification for migration 0102 (engagement shared ring, unit E13 PR1).
-- Run in the Supabase SQL editor AFTER applying 0102. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'pet_care_days caregiver policy exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_policies
  where schemaname='public' and tablename='pet_care_days' and policyname='pet_care_days_caregiver_all'

  union all
  select 2, 'pet_streaks caregiver policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='pet_streaks' and policyname='pet_streaks_caregiver_all'

  union all
  select 3, 'owner own-row policies still present (solo owner unchanged)',
         count(*)::text||' / 2',
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public'
    and ((tablename='pet_care_days' and policyname='pet_care_days_owner_all')
      or (tablename='pet_streaks' and policyname='pet_streaks_owner_all'))

  union all
  select 4, 'app_pet_ring_segments(int,text,date) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_pet_ring_segments'

  union all
  select 5, 'app_pet_ring_segments is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_pet_ring_segments'

  union all
  select 6, 'pawpi_app can EXECUTE app_pet_ring_segments',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_pet_ring_segments'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
