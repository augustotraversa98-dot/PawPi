-- Verification for migration 0093 (walk_requests broadcast read, ticket C2).
-- Run in the Supabase SQL editor AFTER applying 0093. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'app_staffs_a_walker() exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_staffs_a_walker'

  union all
  select 2, 'app_staffs_a_walker is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_staffs_a_walker'

  union all
  select 3, 'app_provider_active_staff_ids(int[]) exists + is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when count(*)=1 and bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_provider_active_staff_ids'

  union all
  select 4, 'walk_requests_broadcast_read policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='walk_requests' and policyname='walk_requests_broadcast_read'

  union all
  select 5, 'idx_provider_live_availability_accepting exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname='public' and indexname='idx_provider_live_availability_accepting'
)
select ord, check_name, detail, status from checks order by ord;
