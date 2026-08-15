-- Verification for migration 0113 (PP3 write rate limiter).
-- Run in the Supabase SQL editor AFTER applying 0113. EVERY row should read PASS.
--
-- The query below checks SHAPE. The DO block after it checks BEHAVIOUR for real,
-- against a throwaway bucket ('verify_0113') that cannot collide with any bucket the
-- app uses, and cleans up after itself. Run the whole file, both parts.
with checks as (
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
         'enabled='||coalesce(bool_or(relrowsecurity)::text,'?')||' forced='||coalesce(bool_or(relforcerowsecurity)::text,'?'),
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
         case when count(*)=1 then 'present, prosecdef='||coalesce(bool_or(p.prosecdef)::text,'?') else 'absent' end,
         case when count(*)=1 and bool_and(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_rate_limit_hit'

  union all
  select 7, 'app_rate_limit_hit has a pinned search_path',
         coalesce(string_agg(array_to_string(p.proconfig, ','), '; '), '(none)'),
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
)
select ord, check_name, detail, status from checks order by ord;

-- ── Behaviour check (run this second) ────────────────────────────────────────
-- It has to be a DO block, one call per plpgsql statement. Calling the function
-- three times inside a SINGLE SQL statement does NOT work: every call in one
-- statement shares a snapshot, so each sees an empty counter and reports hits = 1.
-- (That mistake is why this file's first version reported a false FAIL.)
--
-- Raises an exception on failure, prints "PASS …" on success, and deletes its own
-- probe rows, so the whole script is side-effect free.
do $$
declare r record; seq text := '';
begin
  delete from rate_limit_hits where bucket = 'verify_0113';
  for i in 1..3 loop
    select * into r from app_rate_limit_hit('verify_0113', 'probe:verify', 3600, 2);
    seq := seq || r.hits || ':' || r.allowed || ' ';
  end loop;

  -- A limit of 2 permits exactly 2: the third attempt is denied.
  if seq <> '1:true 2:true 3:false ' then
    raise exception 'FAIL behaviour — expected "1:true 2:true 3:false ", got "%"', seq;
  end if;

  -- Self-cleaning: three hits collapse to ONE live window row.
  if (select count(*) from rate_limit_hits where bucket = 'verify_0113') <> 1 then
    raise exception 'FAIL self-cleaning — expected exactly one live window row';
  end if;

  delete from rate_limit_hits where bucket = 'verify_0113';
  raise notice 'PASS behaviour — % / one live window row / cleaned up', seq;
end $$;
