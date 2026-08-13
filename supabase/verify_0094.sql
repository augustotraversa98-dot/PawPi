-- Verification for migration 0094 (engagement Care Ring foundations, unit E0).
-- Run in the Supabase SQL editor AFTER applying 0094. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'user_profiles.timezone column exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='timezone'

  union all
  select 2, 'pets.adoption_date exists (reused as gotcha day, NOT re-added)',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='pets' and column_name='adoption_date'

  union all
  select 3, 'table pet_care_days exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='pet_care_days'

  union all
  select 4, 'pet_care_days columns present',
         count(*)::text||' / 11',
         case when count(*)=11 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='pet_care_days'
    and column_name in ('id','pet_id','owner_user_id','day','walk_done','moment_done',
                        'care_done','ring_closed','rest_day','created_at','updated_at')

  union all
  select 5, 'pet_care_days UNIQUE(pet_id, day)',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)>=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.pet_care_days'::regclass and contype='u'

  union all
  select 6, 'table pet_streaks exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='pet_streaks'

  union all
  select 7, 'pet_streaks columns present',
         count(*)::text||' / 9',
         case when count(*)=9 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='pet_streaks'
    and column_name in ('pet_id','owner_user_id','current_count','longest_count','last_closed_day',
                        'freezes_available','paused_until','created_at','updated_at')

  union all
  select 8, 'pet_streaks PK is pet_id',
         coalesce(string_agg(a.attname, ','),'(none)'),
         case when count(*)=1 and bool_and(a.attname='pet_id') then 'PASS' else 'FAIL' end
  from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.conrelid='public.pet_streaks'::regclass and c.contype='p'

  union all
  select 9, 'pet_care_days RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_care_days'::regclass

  union all
  select 10, 'pet_streaks RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_streaks'::regclass

  union all
  select 11, 'pet_care_days own-row FOR ALL policy',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='ALL') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='pet_care_days'

  union all
  select 12, 'pet_streaks own-row FOR ALL policy',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='ALL') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='pet_streaks'

  union all
  -- Guard: E0 must not change user_profiles' own RLS posture (owner-private group).
  select 13, 'user_profiles RLS still ENABLE+FORCE (unchanged)',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.user_profiles'::regclass
)
select ord, check_name, detail, status from checks order by ord;
