-- Verification for migration 0090 (QR pickup redeem, ticket B3).
-- Run in the Supabase SQL editor AFTER applying 0090. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'walk_sessions.pickup_lat exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='walk_sessions' and column_name='pickup_lat'

  union all
  select 2, 'walk_sessions.pickup_lng exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='walk_sessions' and column_name='pickup_lng'

  union all
  select 3, 'walk_sessions.credit_pack_id exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='walk_sessions' and column_name='credit_pack_id'

  union all
  select 4, 'FK walk_sessions.credit_pack_id -> walk_credit_packs(id)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c  on c.oid = con.conrelid and c.relname='walk_sessions'
  join pg_class rc on rc.oid = con.confrelid and rc.relname='walk_credit_packs'
  where con.contype='f'
    and (select attname from pg_attribute where attrelid=c.oid and attnum=con.conkey[1])='credit_pack_id'

  union all
  select 5, 'app_redeem_walk_credit(int,int,numeric,numeric,int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_redeem_walk_credit'

  union all
  select 6, 'app_redeem_walk_credit is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_redeem_walk_credit'
)
select ord, check_name, detail, status from checks order by ord;
