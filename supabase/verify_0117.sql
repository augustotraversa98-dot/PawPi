-- Verification for migration 0117 (NR4 — pet_medications + pet_preventive_treatments +
-- additive pet_vaccinations columns). Run in the Supabase SQL editor AFTER applying 0117.
-- EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'pet_vaccinations additive columns present' as check_name,
         count(*)::text||' / 3' as detail,
         case when count(*)=3 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='pet_vaccinations'
    and column_name in ('clinic_name','notes','reminder_enabled')

  union all
  select 2, 'table pet_medications exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='pet_medications'

  union all
  select 3, 'pet_medications columns present',
         count(*)::text||' / 14',
         case when count(*)=14 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='pet_medications'
    and column_name in ('id','pet_id','owner_user_id','name','dose','frequency','prescribed_by',
                        'notes','start_date','end_date','status','reminder_enabled','created_at','deleted_at')

  union all
  select 4, 'pet_medications.status CHECK (active|completed)',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)>=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.pet_medications'::regclass and contype='c' and conname like '%status%'

  union all
  select 5, 'pet_medications RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_medications'::regclass

  union all
  select 6, 'pet_medications own-row FOR ALL policy',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='ALL') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='pet_medications'

  union all
  select 7, 'table pet_preventive_treatments exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='pet_preventive_treatments'

  union all
  select 8, 'pet_preventive_treatments columns present',
         count(*)::text||' / 13',
         case when count(*)=13 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='pet_preventive_treatments'
    and column_name in ('id','pet_id','owner_user_id','product_name','treatment_type','frequency',
                        'last_given','next_due','notes','reminder_enabled','created_at','updated_at','deleted_at')

  union all
  select 9, 'pet_preventive_treatments RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_preventive_treatments'::regclass

  union all
  select 10, 'pet_preventive_treatments own-row FOR ALL policy',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='ALL') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='pet_preventive_treatments'

  union all
  -- Guard: 0117 must not change pet_vaccinations' own RLS posture (owner-private, 0022).
  select 11, 'pet_vaccinations RLS still ENABLE+FORCE (unchanged)',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.pet_vaccinations'::regclass
)
select ord, check_name, detail, status from checks order by ord;
