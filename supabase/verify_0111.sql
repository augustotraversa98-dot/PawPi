-- Verification for migration 0111 (user_profiles.is_demo demo-content guard).
-- Run in the Supabase SQL editor AFTER applying 0111. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'user_profiles.is_demo column exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='is_demo'

  union all
  select 2, 'is_demo is NOT NULL with default false',
         coalesce(max(column_default),'(none)')||' / '||coalesce(max(is_nullable),'?'),
         case when max(is_nullable)='NO' and max(column_default) like 'false%' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='is_demo'

  union all
  select 3, 'partial index idx_user_profiles_is_demo present',
         case when count(*)=1 then 'present' else 'absent' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname='public' and indexname='idx_user_profiles_is_demo'

  union all
  select 4, 'providers.is_demo column exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='providers' and column_name='is_demo'

  union all
  -- After backfill these should be > 0; before backfill they are 0 (still PASS — the column
  -- just defaults everyone to real). Informational rows for eyeballing; never FAIL.
  select 5, 'demo profiles currently flagged (informational)',
         count(*)::text||' flagged is_demo=true',
         'PASS'
  from user_profiles where is_demo

  union all
  select 6, 'demo providers currently flagged (informational)',
         (select count(*)::text from providers where is_demo)||' flagged is_demo=true',
         'PASS'
)
select ord, check_name, detail, status from checks order by ord;
