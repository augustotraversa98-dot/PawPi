-- Verification for migration 0130 (auth_users.token_invalidated_at — AUDIT A-05).
-- Run in the Supabase SQL editor AFTER applying 0130. EVERY row should read PASS.
--
-- Human-applied migration (auth core): pairs with app code (utils/tokenRevocation.js
-- + the /api/* revocation guard) that reads this column on every authenticated
-- request. The column is additive + nullable, so applying it does NOT change any
-- existing session (NULL = "nothing revoked").
select 1 as ord,
       'auth_users.token_invalidated_at column exists' as check_name,
       coalesce((select data_type from information_schema.columns
                 where table_schema='public' and table_name='auth_users'
                   and column_name='token_invalidated_at'), '(absent)') as detail,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='auth_users'
           and column_name='token_invalidated_at'
       ) then 'PASS' else 'FAIL' end as status
union all
select 2,
       'column is timestamptz',
       coalesce((select data_type from information_schema.columns
                 where table_schema='public' and table_name='auth_users'
                   and column_name='token_invalidated_at'), '(absent)'),
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='auth_users'
           and column_name='token_invalidated_at'
           and data_type='timestamp with time zone'
       ) then 'PASS' else 'FAIL' end
union all
select 3,
       'column is nullable (NULL = nothing revoked; existing sessions unaffected)',
       coalesce((select is_nullable from information_schema.columns
                 where table_schema='public' and table_name='auth_users'
                   and column_name='token_invalidated_at'), '(absent)'),
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='auth_users'
           and column_name='token_invalidated_at'
           and is_nullable='YES'
       ) then 'PASS' else 'FAIL' end
union all
select 4,
       'no session pre-revoked by the migration itself (all cutoffs still NULL)',
       (select count(*)::text || ' non-null cutoffs' from auth_users
        where token_invalidated_at is not null),
       case when (select count(*) from auth_users where token_invalidated_at is not null) = 0
            then 'PASS' else 'FAIL' end
order by ord;
