-- Verification for migration 0092 (walk_requests + accept helper + notify types, ticket C1).
-- Run in the Supabase SQL editor AFTER applying 0092. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'walk_requests table exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='walk_requests'

  union all
  select 2, 'walk_requests RLS enabled + forced',
         case when bool_and(relrowsecurity) and bool_and(relforcerowsecurity) then 'enabled+forced' else 'off' end,
         case when bool_and(relrowsecurity) and bool_and(relforcerowsecurity) then 'PASS' else 'FAIL' end
  from pg_class where relname='walk_requests'

  union all
  select 3, 'walk_requests policies (owner select/insert/update + provider read)',
         count(*)::text||' / 4',
         case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='walk_requests'

  union all
  select 4, 'FK walk_requests.owner_user_id -> user_profiles(id)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c  on c.oid = con.conrelid and c.relname='walk_requests'
  join pg_class rc on rc.oid = con.confrelid and rc.relname='user_profiles'
  where con.contype='f'
    and (select attname from pg_attribute where attrelid=c.oid and attnum=con.conkey[1])='owner_user_id'

  union all
  select 5, 'app_accept_walk_request(int,int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_accept_walk_request'

  union all
  select 6, 'app_accept_walk_request is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_accept_walk_request'

  union all
  select 7, 'notifications_type_check carries walk_request_accepted',
         case when pg_get_constraintdef(oid) like '%walk_request_accepted%' then 'present' else 'missing' end,
         case when pg_get_constraintdef(oid) like '%walk_request_accepted%' then 'PASS' else 'FAIL' end
  from pg_constraint where conname='notifications_type_check'
)
select ord, check_name, detail, status from checks order by ord;
