-- Verification for migration 0097 (engagement pack / shared streaks, unit E7).
-- Run in the Supabase SQL editor AFTER applying 0097. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'pet_pack_streaks table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='pet_pack_streaks'

  union all
  select 2, 'pet_pack_streaks is ENABLE + FORCE RLS',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_pack_streaks'::regclass

  union all
  select 3, 'participant own-row policy present',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='pet_pack_streaks' and policyname='pet_pack_streaks_participant'

  union all
  select 4, 'unordered-pair unique index present',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname='public' and tablename='pet_pack_streaks' and indexname='idx_pet_pack_streaks_pair'

  union all
  select 5, 'all 5 DEFINER helpers exist + SECURITY DEFINER + pawpi_app EXECUTE',
         count(*)::text||' / 5',
         case when count(*)=5 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('app_request_pack_streak','app_accept_pack_streak','app_advance_pack_streaks',
                      'app_pack_boop','app_pack_streaks_for_pet')
    and p.prosecdef
    and has_function_privilege('pawpi_app', p.oid, 'execute')

  union all
  select 6, 'notifications_type_check allows boop/pack_invite/pack_accepted',
         case when pg_get_constraintdef(c.oid) like '%boop%'
               and pg_get_constraintdef(c.oid) like '%pack_invite%'
               and pg_get_constraintdef(c.oid) like '%pack_accepted%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(c.oid) like '%boop%'
               and pg_get_constraintdef(c.oid) like '%pack_invite%'
               and pg_get_constraintdef(c.oid) like '%pack_accepted%' then 'PASS' else 'FAIL' end
  from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_type_check'
)
select ord, check_name, detail, status from checks order by ord;
