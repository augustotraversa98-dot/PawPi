-- Verification for migration 0100 (engagement weekly digest, unit E11).
-- Run in the Supabase SQL editor AFTER applying 0100. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'weekly_digest_prefs table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='weekly_digest_prefs'

  union all
  select 2, 'weekly_digest_prefs FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.weekly_digest_prefs'::regclass

  union all
  select 3, 'weekly_digest_prefs own-row policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='weekly_digest_prefs' and policyname='weekly_digest_prefs_all'

  union all
  select 4, 'weekly_digest_state table exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='weekly_digest_state'

  union all
  select 5, 'weekly_digest_state FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.weekly_digest_state'::regclass

  union all
  select 6, 'weekly_digest_state own-row policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='weekly_digest_state' and policyname='weekly_digest_state_all'

  union all
  select 7, 'weekly_digest_state UNIQUE(pet_id, week_start)',
         count(*)::text||' / 1',
         case when count(*)>=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.weekly_digest_state'::regclass and contype='u'
    and conname='weekly_digest_state_unique'

  union all
  select 8, 'notifications_type_check allows weekly_digest',
         case when pg_get_constraintdef(oid) like '%weekly_digest%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(oid) like '%weekly_digest%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_type_check'

  union all
  select 9, 'app_weekly_digest_due(timestamptz,int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_weekly_digest_due'

  union all
  select 10, 'app_weekly_digest_due is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_weekly_digest_due'

  union all
  select 11, 'pawpi_app can EXECUTE app_weekly_digest_due',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_weekly_digest_due'
    and has_function_privilege('pawpi_app', p.oid, 'execute')
)
select ord, check_name, detail, status from checks order by ord;
