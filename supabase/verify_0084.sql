-- Verification for migration 0084 (provider_post_comments.pet_id — additive pet attribution).
-- Run in the Supabase SQL editor AFTER applying 0084. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'provider_post_comments.pet_id present' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='provider_post_comments'
    and column_name='pet_id'

  union all
  select 2,
         'pet_id is integer + nullable',
         coalesce(data_type||' / nullable='||is_nullable,'MISSING'),
         case when data_type='integer' and is_nullable='YES' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_post_comments' and column_name='pet_id'

  union all
  select 3,
         'FK pet_id -> pets(id) ON DELETE SET NULL present',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='provider_post_comments'
  join pg_class ref on ref.oid=con.confrelid and ref.relname='pets'
  where con.contype='f'
    and con.confdeltype='n'  -- 'n' = SET NULL
    and array_position(con.conkey,
          (select attnum from pg_attribute
             where attrelid=c.oid and attname='pet_id')) is not null

  union all
  select 4,
         'index idx_provider_post_comments_pet present',
         coalesce(string_agg(indexname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname='public' and tablename='provider_post_comments'
    and indexname='idx_provider_post_comments_pet'

  union all
  -- RLS unchanged: the table should still be ENABLE + FORCE with its 0082 policy set intact.
  select 5,
         'provider_post_comments RLS still ENABLE + FORCE',
         'relrowsecurity='||relrowsecurity::text||' / relforcerowsecurity='||relforcerowsecurity::text,
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class where relname='provider_post_comments'
)
select ord, check_name, detail, status from checks order by ord;
