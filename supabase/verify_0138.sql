-- Verification for migration 0138 (request_idempotency_keys: the optional Idempotency-Key on POST /api/pets).
-- Run in the Supabase SQL editor AFTER applying 0138. EVERY row should read PASS.
-- Read-only (catalog queries only). Safe to run any number of times.
with
t as (
  select c.oid, c.relrowsecurity as rls, c.relforcerowsecurity as forced, c.relacl, c.relowner
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname = 'request_idempotency_keys' and c.relkind = 'r'
),
pol as (
  select * from pg_policies where schemaname = 'public' and tablename = 'request_idempotency_keys'
),
checks as (
  select 1 as ord, 'table public.request_idempotency_keys exists' as check_name,
         (select count(*) from t)::text || ' found' as detail,
         case when (select count(*) from t) = 1 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'RLS is ENABLED and FORCED',
         'enabled=' || coalesce(rls::text, 'n/a') || ' forced=' || coalesce(forced::text, 'n/a'),
         case when rls and forced then 'PASS' else 'FAIL' end
  from t

  union all
  select 3, 'exactly one policy: the own-row FOR ALL policy keyed on current_app_user_id()',
         coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), '(none)'),
         case when count(*) = 1
               and bool_and(policyname = 'request_idempotency_keys_owner_all' and cmd = 'ALL'
                            and qual ilike '%owner_user_id = current_app_user_id()%'
                            and with_check ilike '%owner_user_id = current_app_user_id()%') then 'PASS' else 'FAIL' end
  from pol

  union all
  select 4, 'primary key is (owner_user_id, scope, idem_key)',
         coalesce((select string_agg(a.attname, ', ' order by array_position(i.indkey::int2[], a.attnum))
                   from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                   where i.indrelid = (select oid from t) and i.indisprimary), '(none)'),
         case when (select string_agg(a.attname, ',' order by array_position(i.indkey::int2[], a.attnum))
                    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                    where i.indrelid = (select oid from t) and i.indisprimary) = 'owner_user_id,scope,idem_key'
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'owner_user_id references user_profiles(id) ON DELETE CASCADE',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = (select oid from t) and contype = 'f' limit 1), '(none)'),
         case when exists (select 1 from pg_constraint
                           where conrelid = (select oid from t) and contype = 'f'
                             and pg_get_constraintdef(oid) ilike '%user_profiles%' and pg_get_constraintdef(oid) ilike '%ON DELETE CASCADE%')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'pawpi_app holds DML (select/insert/update/delete)',
         (select string_agg(p, ',') from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
          where has_table_privilege('pawpi_app', (select oid from t), p)),
         case when (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
                    where has_table_privilege('pawpi_app', (select oid from t), p)) = 4 then 'PASS' else 'FAIL' end

  union all
  select 7, 'PUBLIC / anon / authenticated hold NO privilege on it (roles absent = PASS)',
         count(*)::text || ' grant(s)',
         case when (select count(*) from t) = 1 and count(*) = 0 then 'PASS' else 'FAIL' end
  from t tt
  cross join lateral aclexplode(coalesce(tt.relacl, acldefault('r', tt.relowner))) a
  left join pg_roles r on r.oid = a.grantee
  where a.grantee = 0 or r.rolname in ('anon', 'authenticated')
)
select ord, check_name, detail, status from checks order by ord;
