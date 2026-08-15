-- Verification for migration 0108 (BX4 server-side notification prefs + gating).
-- Run in the Supabase SQL editor AFTER applying 0108. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'notification_prefs table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='notification_prefs'

  union all
  select 2, 'notification_prefs RLS enabled',
         case when relrowsecurity then 'enabled' else 'off' end,
         case when relrowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.notification_prefs'::regclass

  union all
  select 3, 'notification_prefs FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.notification_prefs'::regclass

  union all
  select 4, 'notification_prefs own-row FOR ALL policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='notification_prefs'
    and policyname='notification_prefs_all'

  union all
  select 5, 'UNIQUE(user_id, category) constraint exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.notification_prefs'::regclass
    and conname='notification_prefs_user_category_key'

  union all
  select 6, 'app_notify is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_notify'

  union all
  select 7, 'app_notify body gates the walk_requests category',
         case when pg_get_functiondef(p.oid) like '%walk_requests%' then 'gated' else 'absent' end,
         case when pg_get_functiondef(p.oid) like '%walk_requests%' then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_notify'

  union all
  select 8, 'pawpi_app can execute app_notify',
         case when has_function_privilege('pawpi_app',
                'public.app_notify(integer,integer,text,text,text)','execute')
              then 'granted' else 'missing' end,
         case when has_function_privilege('pawpi_app',
                'public.app_notify(integer,integer,text,text,text)','execute')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
