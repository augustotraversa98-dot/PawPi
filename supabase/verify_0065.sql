-- Verification for migration 0065 (UGC moderation — Guideline 1.2 primitives).
-- Run in the Supabase SQL editor AFTER applying 0065. EVERY row should read PASS.
with checks as (
  -- 1. both new tables exist
  select 1 as ord,
         'table present: '||t.tbl as check_name,
         (count(c.relname))::text as detail,
         case when count(c.relname)=1 then 'PASS' else 'FAIL' end as status
  from (values ('content_reports'),('user_blocks')) as t(tbl)
  left join pg_class c on c.relname=t.tbl
       and c.relnamespace=(select oid from pg_namespace where nspname='public')
  group by t.tbl

  union all
  -- 2. RLS enabled + FORCED on both new tables
  select 2,
         'RLS on+forced: '||c.relname,
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('content_reports','user_blocks')

  union all
  -- 3. content_reports has exactly 2 policies (select + insert; status changes via DEFINER only)
  select 3,
         'policies: content_reports (expect 2: select,insert)',
         count(*)::text||' / 2 cmds='||coalesce(string_agg(distinct cmd, ','),'(none)'),
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='content_reports'

  union all
  -- 4. user_blocks has exactly 4 policies (select,insert,update,delete — all owner-scoped)
  select 4,
         'policies: user_blocks (expect 4: select,insert,update,delete)',
         count(*)::text||' / 4',
         case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='user_blocks'

  union all
  -- 5. hidden_at column added to every peer-UGC content table (expect 11)
  select 5,
         'hidden_at present on content tables (expect 11)',
         count(*)::text||' / 11',
         case when count(*)=11 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and column_name='hidden_at'
    and table_name in ('posts','post_barks','forum_threads','forum_comments','messages',
                       'dm_messages','provider_reviews','adoptable_listings','events',
                       'social_walks','lost_reports')

  union all
  -- 6. banned_at column added to user_profiles
  select 6,
         'user_profiles.banned_at present',
         (count(*))::text,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='banned_at'

  union all
  -- 7. notifications_type_check widened to include 'report_received'
  select 7,
         'notifications type check allows report_received',
         case when pg_get_constraintdef(con.oid) like '%report_received%' then 'yes' else 'no' end,
         case when pg_get_constraintdef(con.oid) like '%report_received%' then 'PASS' else 'FAIL' end
  from pg_constraint con
  where con.conname='notifications_type_check'

  union all
  -- 8. the 7 SECURITY DEFINER moderation functions exist and are prosecdef=true
  select 8,
         'SECURITY DEFINER fn: '||f.fn,
         coalesce('prosecdef='||bool_or(p.prosecdef)::text, 'MISSING'),
         case when bool_or(p.prosecdef) then 'PASS' else 'FAIL' end
  from (values ('app_is_admin'),('app_user_is_blocked'),('app_moderate_hide'),
               ('app_moderate_unhide'),('app_ban_user'),
               ('app_admin_list_reports'),('app_admin_action_report')) as f(fn)
  left join pg_proc p on p.proname=f.fn
       and p.pronamespace=(select oid from pg_namespace where nspname='public')
  group by f.fn

  union all
  -- 9. pawpi_app has EXECUTE on each of the 7 functions
  select 9,
         'pawpi_app EXECUTE on '||p.proname,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text,
         case when has_function_privilege('pawpi_app', p.oid, 'EXECUTE') then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace=(select oid from pg_namespace where nspname='public')
    and p.proname in ('app_is_admin','app_user_is_blocked','app_moderate_hide',
                      'app_moderate_unhide','app_ban_user',
                      'app_admin_list_reports','app_admin_action_report')

  union all
  -- 10. pawpi_app has SELECT + INSERT on both new tables (rides 0019's blanket grant)
  select 10,
         'pawpi_app SELECT/INSERT on '||t.tbl,
         (has_table_privilege('pawpi_app','public.'||t.tbl,'SELECT')
            and has_table_privilege('pawpi_app','public.'||t.tbl,'INSERT'))::text,
         case when has_table_privilege('pawpi_app','public.'||t.tbl,'SELECT')
               and has_table_privilege('pawpi_app','public.'||t.tbl,'INSERT') then 'PASS' else 'FAIL' end
  from (values ('content_reports'),('user_blocks')) as t(tbl)

  union all
  -- 11. live-pair partial unique index on user_blocks exists
  select 11,
         'partial-unique idx_user_blocks_live_pair present',
         (count(*))::text,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes where schemaname='public' and indexname='idx_user_blocks_live_pair'
)
select check_name, detail, status from checks order by ord, check_name;
