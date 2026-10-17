-- Verification for migration 0085 (provider_post_paws — "Paws" on business posts, ticket 2.94).
-- Run in the Supabase SQL editor AFTER applying 0085. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'table provider_post_paws exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.tables
  where table_schema='public' and table_name='provider_post_paws'

  union all
  select 2,
         'columns id, post_id, user_id, created_at present',
         count(*)::text||' / 4',
         case when count(*)=4 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_post_paws'
    and column_name in ('id','post_id','user_id','created_at')

  union all
  select 3,
         'FK post_id -> provider_posts(id)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c  on c.oid = con.conrelid and c.relname='provider_post_paws'
  join pg_class rc on rc.oid = con.confrelid and rc.relname='provider_posts'
  where con.contype='f'
    and (select attname from pg_attribute where attrelid=c.oid and attnum=con.conkey[1])='post_id'

  union all
  select 4,
         'FK user_id -> user_profiles(id)',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c  on c.oid = con.conrelid and c.relname='provider_post_paws'
  join pg_class rc on rc.oid = con.confrelid and rc.relname='user_profiles'
  where con.contype='f'
    and (select attname from pg_attribute where attrelid=c.oid and attnum=con.conkey[1])='user_id'

  union all
  select 5,
         'UNIQUE(post_id, user_id) constraint present',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.provider_post_paws'::regclass
    and contype='u'
    and conname='provider_post_paws_post_id_user_id_key'

  union all
  select 6,
         'RLS is ENABLE + FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class
  where oid='public.provider_post_paws'::regclass

  union all
  select 7,
         'both RLS policies present (authed_read + owner_write)',
         coalesce(string_agg(policyname, ','),'(none)'),
         case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='provider_post_paws'
    and policyname in ('provider_post_paws_authed_read','provider_post_paws_owner_write')
)
select ord, check_name, detail, status from checks order by ord;
