-- Verification for migration 0143 (pet invite codes). Run in the Supabase SQL editor AFTER applying 0143.
-- EVERY row should read PASS. Read-only (catalog queries only).
with
t as (select c.oid, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relowner from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relname = 'pet_invite_codes'),
fn as (select p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'app_redeem_pet_invite'),
checks as (
  select 1 as ord, 'pet_invite_codes exists with the 11 columns' as check_name,
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pet_invite_codes'
            and column_name in ('id','pet_id','owner_user_id','role','code_hash','expires_at','used_at','used_by_user_id','grant_id','revoked_at','created_at'))::text || ' / 11' as detail,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pet_invite_codes'
            and column_name in ('id','pet_id','owner_user_id','role','code_hash','expires_at','used_at','used_by_user_id','grant_id','revoked_at','created_at')) = 11
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'no column stores the code in clear text',
         coalesce((select string_agg(column_name, ',') from information_schema.columns
                   where table_schema = 'public' and table_name = 'pet_invite_codes' and column_name in ('code', 'plain_code', 'token')), 'none'),
         case when not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'pet_invite_codes' and column_name in ('code', 'plain_code', 'token'))
              and exists (select 1 from t) then 'PASS' else 'FAIL' end

  union all
  select 3, 'RLS is ENABLED and FORCED',
         coalesce((select 'enabled=' || relrowsecurity::text || ' forced=' || relforcerowsecurity::text from t), '(missing)'),
         case when exists (select 1 from t where relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  select 4, 'exactly the three owner policies (select, insert, update) and no delete / all policy',
         coalesce((select string_agg(policyname || ':' || cmd, ', ' order by policyname) from pg_policies
                   where schemaname = 'public' and tablename = 'pet_invite_codes'), '(none)'),
         case when (select string_agg(cmd, ',' order by cmd) from pg_policies
                    where schemaname = 'public' and tablename = 'pet_invite_codes') = 'INSERT,SELECT,UPDATE'
              and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pet_invite_codes'
                              and coalesce(qual, '') || coalesce(with_check, '') not like '%current_app_user_id()%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'the table grants nothing to PUBLIC / anon / authenticated',
         coalesce((select count(*)::text from t, lateral aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
                   left join pg_roles r on r.oid = a.grantee
                   where a.grantee = 0 or r.rolname in ('anon', 'authenticated')), '0') || ' forbidden grant(s)',
         case when exists (select 1 from t) and not exists (
                   select 1 from t, lateral aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
                   left join pg_roles r on r.oid = a.grantee
                   where a.grantee = 0 or r.rolname in ('anon', 'authenticated')) then 'PASS' else 'FAIL' end

  union all
  select 6, 'pawpi_app can select / insert / update the table',
         coalesce((select has_table_privilege('pawpi_app', oid, 'select')::text || '/' || has_table_privilege('pawpi_app', oid, 'insert')::text
                          || '/' || has_table_privilege('pawpi_app', oid, 'update')::text from t), '(missing)'),
         case when exists (select 1 from t where has_table_privilege('pawpi_app', oid, 'select')
                          and has_table_privilege('pawpi_app', oid, 'insert') and has_table_privilege('pawpi_app', oid, 'update'))
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'app_redeem_pet_invite is SECURITY DEFINER and pins search_path = public, pg_temp',
         (select count(*) from fn)::text || ' / 1',
         case when (select count(*) from fn) = 1 and (select bool_and(prosecdef and exists (select 1 from unnest(coalesce(proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp')) from fn)
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'pawpi_app can EXECUTE it; PUBLIC / anon / authenticated cannot',
         coalesce((select has_function_privilege('pawpi_app', oid, 'EXECUTE')::text from fn), '(missing)'),
         case when (select count(*) from fn) = 1
               and (select bool_and(has_function_privilege('pawpi_app', oid, 'EXECUTE')) from fn)
               and not exists (select 1 from fn f where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
               and not exists (select 1 from fn f join pg_roles r on r.rolname in ('anon', 'authenticated') where has_function_privilege(r.oid, f.oid, 'EXECUTE'))
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'codes are unique by hash and expire within 7 days (index + CHECK)',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint where conname = 'pet_invite_codes_expiry_check'), '(missing)'),
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_pet_invite_codes_hash' and indexdef ilike '%unique%')
               and exists (select 1 from pg_constraint where conname = 'pet_invite_codes_expiry_check') then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
