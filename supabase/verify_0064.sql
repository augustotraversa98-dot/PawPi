-- Verification for Wave 9 migration 0064 (provider calendar import — ICS feed → busy blocks).
-- Run in the Supabase SQL editor. EVERY row should read PASS.
with checks as (
  -- 1. both new tables exist
  select 1 as ord,
         'table present: '||t.tbl as check_name,
         (count(c.relname))::text as detail,
         case when count(c.relname)=1 then 'PASS' else 'FAIL' end as status
  from (values ('provider_calendar_feeds'),('provider_calendar_busy')) as t(tbl)
  left join pg_class c on c.relname=t.tbl
       and c.relnamespace=(select oid from pg_namespace where nspname='public')
  group by t.tbl

  union all
  -- 2. RLS enabled + FORCED on both tables
  select 2,
         'RLS on+forced: '||c.relname,
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('provider_calendar_feeds','provider_calendar_busy')

  union all
  -- 3. feeds has exactly 2 policies (admin_all + staff_read)
  select 3,
         'policies: provider_calendar_feeds (expect 2)',
         count(*)::text||' / 2',
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='provider_calendar_feeds'

  union all
  -- 4. busy has exactly 1 policy, and it is SELECT-only (read-only table)
  select 4,
         'policies: provider_calendar_busy (expect 1, SELECT-only)',
         count(*)::text||' policy / cmds='||coalesce(string_agg(distinct cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='SELECT') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='provider_calendar_busy'

  union all
  -- 5. the 4 SECURITY DEFINER functions exist and are prosecdef=true
  select 5,
         'SECURITY DEFINER fn: '||f.fn,
         coalesce('exists prosecdef='||bool_or(p.prosecdef)::text, 'MISSING'),
         case when bool_or(p.prosecdef) then 'PASS' else 'FAIL' end
  from (values ('app_active_calendar_feeds'),('app_sync_calendar_feed'),
               ('app_remove_calendar_feed'),('app_provider_busy_windows')) as f(fn)
  left join pg_proc p on p.proname=f.fn
       and p.pronamespace=(select oid from pg_namespace where nspname='public')
  group by f.fn

  union all
  -- 6. pawpi_app has EXECUTE on each of the 4 functions
  select 6,
         'pawpi_app EXECUTE on '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text,
         case when has_function_privilege('pawpi_app', p.oid, 'EXECUTE') then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.pronamespace=(select oid from pg_namespace where nspname='public')
    and p.proname in ('app_active_calendar_feeds','app_sync_calendar_feed',
                      'app_remove_calendar_feed','app_provider_busy_windows')

  union all
  -- 7. pawpi_app has SELECT on both tables (rides 0019's blanket grant)
  select 7,
         'pawpi_app SELECT on '||t.tbl,
         has_table_privilege('pawpi_app', 'public.'||t.tbl, 'SELECT')::text,
         case when has_table_privilege('pawpi_app', 'public.'||t.tbl, 'SELECT') then 'PASS' else 'FAIL' end
  from (values ('provider_calendar_feeds'),('provider_calendar_busy')) as t(tbl)
)
select check_name, detail, status from checks order by ord, check_name;
