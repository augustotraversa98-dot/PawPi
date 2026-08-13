-- Verification for migration 0089 (walk packages + prepaid credit balance, ticket B2).
-- Run in the Supabase SQL editor AFTER applying 0089. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'table walk_packages exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='walk_packages'

  union all
  select 2, 'table walk_credit_packs exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.tables
  where table_schema='public' and table_name='walk_credit_packs'

  union all
  select 3, 'walk_packages columns present',
         count(*)::text||' / 7',
         case when count(*)=7 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='walk_packages'
    and column_name in ('id','provider_id','walks_count','price_cents','currency','active','created_at')

  union all
  select 4, 'walk_credit_packs columns present',
         count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='walk_credit_packs'
    and column_name in ('id','owner_user_id','provider_id','walks_total','walks_used','order_id','purchased_at','active')

  union all
  select 5, 'orders.kind CHECK includes walk_package',
         case when pg_get_constraintdef(oid) like '%walk_package%' then 'yes' else 'no' end,
         case when pg_get_constraintdef(oid) like '%walk_package%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.orders'::regclass and conname='orders_kind_check'

  union all
  select 6, 'app_grant_walk_credits(integer) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_grant_walk_credits'

  union all
  select 7, 'walk_packages RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.walk_packages'::regclass

  union all
  select 8, 'walk_credit_packs RLS ENABLE+FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where oid='public.walk_credit_packs'::regclass

  union all
  select 9, 'walk_packages policies (read + admin_all)',
         coalesce(string_agg(policyname, ','),'(none)'),
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='walk_packages'

  union all
  select 10, 'walk_credit_packs SELECT-only policy (no write policy)',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='SELECT') then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='walk_credit_packs'
)
select ord, check_name, detail, status from checks order by ord;
