-- Verification for migration 0066 (provider_post moderation — Guideline 1.2 follow-up).
-- Run in the Supabase SQL editor AFTER applying 0066. EVERY row should read PASS.
with checks as (
  -- 1. content_reports_target_type_check now allows 'provider_post'
  select 1 as ord,
         'target_type check allows provider_post' as check_name,
         case when pg_get_constraintdef(con.oid) like '%provider_post%' then 'yes' else 'no' end as detail,
         case when pg_get_constraintdef(con.oid) like '%provider_post%' then 'PASS' else 'FAIL' end as status
  from pg_constraint con
  where con.conname = 'content_reports_target_type_check'

  union all
  -- 2. provider_posts.hidden_at column present
  select 2,
         'provider_posts.hidden_at present',
         (count(*))::text,
         case when count(*) = 1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'provider_posts' and column_name = 'hidden_at'

  union all
  -- 3. app_moderate_hide maps provider_post -> provider_posts
  select 3,
         'app_moderate_hide has provider_post case',
         case when pg_get_functiondef(p.oid) like '%provider_posts%' then 'yes' else 'no' end,
         case when pg_get_functiondef(p.oid) like '%provider_posts%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname = 'app_moderate_hide'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public')

  union all
  -- 4. app_moderate_unhide maps provider_post -> provider_posts
  select 4,
         'app_moderate_unhide has provider_post case',
         case when pg_get_functiondef(p.oid) like '%provider_posts%' then 'yes' else 'no' end,
         case when pg_get_functiondef(p.oid) like '%provider_posts%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname = 'app_moderate_unhide'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public')

  union all
  -- 5. app_admin_action_report knows provider_post (hideable list + ban resolution)
  select 5,
         'app_admin_action_report has provider_post case',
         case when pg_get_functiondef(p.oid) like '%provider_post%' then 'yes' else 'no' end,
         case when pg_get_functiondef(p.oid) like '%provider_post%' then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname = 'app_admin_action_report'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public')
)
select check_name, detail, status from checks order by ord, check_name;
