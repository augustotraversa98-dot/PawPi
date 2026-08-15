-- Verification for migration 0109 (BN2 PR1 device_push_tokens + DEFINER readers).
-- Run in the Supabase SQL editor AFTER applying 0109. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'device_push_tokens table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='device_push_tokens'

  union all
  select 2, 'device_push_tokens RLS enabled',
         case when relrowsecurity then 'enabled' else 'off' end,
         case when relrowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.device_push_tokens'::regclass

  union all
  select 3, 'device_push_tokens FORCE RLS on',
         case when relforcerowsecurity then 'forced' else 'not forced' end,
         case when relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.device_push_tokens'::regclass

  union all
  select 4, 'device_push_tokens own-row FOR ALL policy exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='device_push_tokens'
    and policyname='device_push_tokens_all'

  union all
  select 5, 'UNIQUE(user_id, token) constraint exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.device_push_tokens'::regclass
    and conname='device_push_tokens_user_token_key'

  union all
  select 6, 'platform CHECK (ios|android) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.device_push_tokens'::regclass
    and conname='device_push_tokens_platform_check'

  union all
  select 7, 'app_recipient_push_tokens is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_recipient_push_tokens'

  union all
  select 8, 'app_notification_pref_enabled is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_notification_pref_enabled'

  union all
  select 9, 'app_recipient_locale is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_recipient_locale'

  union all
  select 10, 'pawpi_app can execute app_recipient_push_tokens',
         case when has_function_privilege('pawpi_app',
                'public.app_recipient_push_tokens(integer)','execute')
              then 'granted' else 'missing' end,
         case when has_function_privilege('pawpi_app',
                'public.app_recipient_push_tokens(integer)','execute')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
