-- Verification for migration 0113 (PP3 write rate limiter).
-- Run in the Supabase SQL editor AFTER applying 0113. EVERY row should read PASS.
--
-- Row 10 exercises the limiter for real against a throwaway bucket
-- ('verify_0113'), which cannot collide with any bucket the app uses; the DELETE at
-- the bottom of this file removes the probe row, so running the whole script leaves
-- no trace. Run the script top-to-bottom, not the query alone.
with probe as materialized (
  -- Three attempts against a limit of 2. Row order is unspecified, so assert on the
  -- COUNT of allowed attempts, which is 2 no matter which call lands third.
  select t.allowed
  from (values (1), (2), (3)) as s(n),
       lateral app_rate_limit_hit('verify_0113', 'probe:verify', 3600, 2) t
),
checks as (
  select 1 as ord, 'rate_limit_hits table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='rate_limit_hits'

  union all
  select 2, 'columns bucket/subject/window_start/hits present',
         count(*)::text||' / 4',
         case when count(*)=4 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='rate_limit_hits'
    and column_name in ('bucket','subject','window_start','hits')

  union all
  select 3, 'primary key is (bucket, subject, window_start)',
         coalesce(string_agg(a.attname, ',' order by k.ord), '(none)'),
         case when coalesce(string_agg(a.attname, ',' order by k.ord),'') = 'bucket,subject,window_start'
              then 'PASS' else 'FAIL' end
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conname = 'rate_limit_hits_pkey' and c.contype = 'p'

  union all
  select 4, 'RLS is ENABLED and FORCED',
         'enabled='||coalesce(max(relrowsecurity)::text,'?')||' forced='||coalesce(max(relforcerowsecurity)::text,'?'),
         case when bool_and(relrowsecurity) and bool_and(relforcerowsecurity) then 'PASS' else 'FAIL' end
  from pg_class where relname='rate_limit_hits' and relkind='r'

  union all
  -- Exactly ONE policy, and it is SELECT-only: writes must be impossible for
  -- pawpi_app outside the DEFINER function. An INSERT/UPDATE policy appearing here
  -- would mean a caller could reset their own counter.
  select 5, 'exactly one policy, and it is SELECT-only',
         coalesce(string_agg(policyname||'('||cmd||')', ', '), '(none)'),
         case when count(*)=1 and bool_and(cmd='SELECT') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='rate_limit_hits'

  union all
  select 6, 'app_rate_limit_hit exists and is SECURITY DEFINER',
         case when count(*)=1 then 'present, prosecdef='||coalesce(max(p.prosecdef)::text,'?') else 'absent' end,
         case when count(*)=1 and bool_and(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_rate_limit_hit'

  union all
  select 7, 'app_rate_limit_hit has a pinned search_path',
         coalesce(array_to_string(max(p.proconfig),','), '(none)'),
         case when bool_and(array_to_string(p.proconfig,',') like 'search_path=%') then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_rate_limit_hit'

  union all
  select 8, 'pawpi_app can EXECUTE app_rate_limit_hit',
         case when has_function_privilege('pawpi_app',
                'public.app_rate_limit_hit(text,text,integer,integer)', 'EXECUTE')
              then 'granted' else 'NOT granted' end,
         case when has_function_privilege('pawpi_app',
                'public.app_rate_limit_hit(text,text,integer,integer)', 'EXECUTE')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'app_rate_limit_gc exists and pawpi_app can EXECUTE it',
         case when has_function_privilege('pawpi_app',
                'public.app_rate_limit_gc(integer)', 'EXECUTE')
              then 'granted' else 'NOT granted' end,
         case when has_function_privilege('pawpi_app',
                'public.app_rate_limit_gc(integer)', 'EXECUTE')
              then 'PASS' else 'FAIL' end

  union all
  select 10, 'behaviour: exactly 2 of 3 attempts allowed at a limit of 2',
         count(*) filter (where allowed)::text||' allowed / '||count(*)::text||' attempts',
         case when count(*) = 3 and count(*) filter (where allowed) = 2
              then 'PASS' else 'FAIL' end
  from probe

  union all
  select 11, 'behaviour: the window collapsed to ONE row (self-cleaning)',
         (select count(*)::text from rate_limit_hits where bucket='verify_0113')||' row(s)',
         case when (select count(*) from rate_limit_hits where bucket='verify_0113') = 1
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;

-- Remove the probe row so this script is side-effect free.
delete from rate_limit_hits where bucket = 'verify_0113';
