-- Verification for migration 0132 (notification_settings: per-owner quiet hours + DEFINER reader).
-- Run in the Supabase SQL editor AFTER applying 0132. EVERY row should read PASS. Human-applied (new table + RLS +
-- DEFINER fn).
with checks as (
  select 1 as ord, 'notification_settings table exists' as check_name,
         count(*)::text || ' / 1' as detail,
         case when count(*) = 1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables where table_schema = 'public' and table_name = 'notification_settings'

  union all
  select 2, 'RLS enabled AND forced', case when relrowsecurity and relforcerowsecurity then 'enabled+forced' else 'off' end,
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid = 'public.notification_settings'::regclass

  union all
  select 3, 'one own-row FOR ALL policy (notification_settings_owner_all)', count(*)::text || ' / 1',
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename = 'notification_settings'
    and policyname = 'notification_settings_owner_all' and cmd = 'ALL'

  union all
  select 4, 'defaults are 22:00-08:00, enabled', 
         coalesce((select string_agg(column_name || '=' || coalesce(column_default, 'null'), ', ' order by column_name)
                   from information_schema.columns
                   where table_schema = 'public' and table_name = 'notification_settings'
                     and column_name in ('quiet_hours_enabled', 'quiet_start', 'quiet_end')), '(absent)'),
         case when (select count(*) from information_schema.columns
                    where table_schema = 'public' and table_name = 'notification_settings'
                      and ((column_name = 'quiet_hours_enabled' and column_default = 'true')
                        or (column_name = 'quiet_start' and column_default = '22')
                        or (column_name = 'quiet_end' and column_default = '8'))) = 3
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'hour range CHECKs present (0-23)', count(*)::text || ' / 2',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid = 'public.notification_settings'::regclass
    and conname in ('notification_settings_quiet_start_check', 'notification_settings_quiet_end_check')

  union all
  select 6, 'app_recipient_notification_settings is SECURITY DEFINER with search_path pinned', count(*)::text || ' / 1',
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_recipient_notification_settings' and p.prosecdef
    and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%pg_temp%')

  union all
  select 7, 'pawpi_app can EXECUTE the reader', 
         case when has_function_privilege('pawpi_app', 'app_recipient_notification_settings(integer)', 'execute') then 'yes' else 'no' end,
         case when has_function_privilege('pawpi_app', 'app_recipient_notification_settings(integer)', 'execute') then 'PASS' else 'FAIL' end

  union all
  select 8, 'anon / authenticated hold NO privilege on the table', count(*)::text || ' grants',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'notification_settings' and grantee in ('anon', 'authenticated', 'PUBLIC')
)
select * from checks order by ord;
