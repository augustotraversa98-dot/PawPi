-- Verification for migration 0088 (provider_live_availability — walker "Accepting walks now", ticket B1).
-- Run in the Supabase SQL editor AFTER applying 0088. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'table provider_live_availability exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='provider_live_availability'

  union all
  select 2,
         'columns provider_id, accepting, lat, lng, expires_at, updated_at present',
         count(*)::text||' / 6',
         case when count(*)=6 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_live_availability'
    and column_name in ('provider_id','accepting','lat','lng','expires_at','updated_at')

  union all
  select 3,
         'provider_id is PRIMARY KEY (one row per provider)',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.provider_live_availability'::regclass
    and contype='p'

  union all
  select 4,
         'FK provider_id -> providers(id)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c  on c.oid = con.conrelid and c.relname='provider_live_availability'
  join pg_class rc on rc.oid = con.confrelid and rc.relname='providers'
  where con.contype='f'
    and (select attname from pg_attribute where attrelid=c.oid and attnum=con.conkey[1])='provider_id'

  union all
  select 5,
         'RLS is ENABLE + FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class
  where oid='public.provider_live_availability'::regclass

  union all
  select 6,
         'both RLS policies present (read + staff_write)',
         coalesce(string_agg(policyname, ','),'(none)'),
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='provider_live_availability'
    and policyname in ('provider_live_availability_read','provider_live_availability_staff_write')
)
select ord, check_name, detail, status from checks order by ord;
