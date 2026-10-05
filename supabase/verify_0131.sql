-- Verification for migration 0131 (notifications v2 foundation: push_tickets, notification_send_log,
-- device_push_tokens.invalid_since/last_seen + DEFINER helpers). Run in the Supabase SQL editor AFTER applying
-- 0131. EVERY row should read PASS. Human-applied (new tables + RLS + DEFINER fns).
with fns(name) as (
  values ('app_recipient_valid_push_tokens'), ('app_mark_push_token_invalid'), ('app_record_push_ticket'),
         ('app_pending_push_tickets'), ('app_resolve_push_tickets'), ('app_user_day_start'),
         ('app_notification_sends_today'), ('app_reserve_notification_send'), ('app_log_notification_send'),
         ('app_notification_send_log_gc'), ('app_set_email_consent')
),
tbls(name) as (values ('push_tickets'), ('notification_send_log')),
checks as (
  select 1 as ord, 'device_push_tokens.invalid_since + last_seen exist (timestamptz)' as check_name,
         count(*)::text || ' / 2' as detail,
         case when count(*) = 2 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='device_push_tokens'
    and column_name in ('invalid_since', 'last_seen') and data_type = 'timestamp with time zone'

  union all
  select 2, 'both new tables exist', count(*)::text || ' / 2',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from information_schema.tables t join tbls on tbls.name = t.table_name
  where t.table_schema = 'public'

  union all
  select 3, 'both new tables: RLS enabled AND forced', count(*)::text || ' / 2',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_class c join tbls on tbls.name = c.relname
  where c.relnamespace = 'public'::regnamespace and c.relrowsecurity and c.relforcerowsecurity

  union all
  select 4, 'both new tables: own-row SELECT policy present', count(*)::text || ' / 2',
         case when count(*) = 2 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and cmd = 'SELECT'
    and policyname in ('push_tickets_owner_select', 'notification_send_log_owner_select')

  union all
  select 5, 'both new tables: NO write policy (DEFINER helpers are the only writers)',
         count(*)::text || ' write policies',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public' and tablename in ('push_tickets', 'notification_send_log') and cmd <> 'SELECT'

  union all
  select 6, 'all 11 helper functions exist', count(*)::text || ' / 11',
         case when count(*) = 11 then 'PASS' else 'FAIL' end
  from pg_proc p join fns on fns.name = p.proname
  where p.pronamespace = 'public'::regnamespace

  union all
  select 7, 'all 11 helpers are SECURITY DEFINER with search_path pinned', count(*)::text || ' / 11',
         case when count(*) = 11 then 'PASS' else 'FAIL' end
  from pg_proc p join fns on fns.name = p.proname
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%pg_temp%')

  union all
  select 8, 'pawpi_app can EXECUTE every helper', count(*)::text || ' / 11',
         case when count(*) = 11 then 'PASS' else 'FAIL' end
  from pg_proc p join fns on fns.name = p.proname
  where p.pronamespace = 'public'::regnamespace and has_function_privilege('pawpi_app', p.oid, 'execute')

  union all
  select 9, 'anon / authenticated hold NO privilege on the new tables', count(*)::text || ' grants',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('push_tickets', 'notification_send_log')
    and grantee in ('anon', 'authenticated', 'PUBLIC')

  union all
  select 10, 'existing 0109 readers untouched (app_recipient_push_tokens still present)', count(*)::text || ' / 1',
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'app_recipient_push_tokens'
)
select * from checks order by ord;
