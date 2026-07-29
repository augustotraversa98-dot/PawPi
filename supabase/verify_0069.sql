-- Verification for migration 0069 (password_reset_tokens — self-service password reset).
-- Run in the Supabase SQL editor AFTER applying 0069. EVERY row should read PASS.
with checks as (
  -- 1. table exists
  select 1 as ord,
         'table present: password_reset_tokens' as check_name,
         (count(*))::text as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='password_reset_tokens'

  union all
  -- 2. RLS enabled + FORCED
  select 2,
         'RLS on+forced: password_reset_tokens',
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='password_reset_tokens'

  union all
  -- 3. exactly 1 policy (admin SELECT; ALL writes go through the DEFINER helpers)
  select 3,
         'policies: password_reset_tokens (expect 1: select)',
         count(*)::text||' / 1 cmds='||coalesce(string_agg(distinct cmd, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='password_reset_tokens'

  union all
  -- 4. expected columns present (8)
  select 4,
         'password_reset_tokens columns present (expect 8)',
         count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='password_reset_tokens'
    and column_name in ('id','auth_user_id','token_hash','expires_at',
                        'used_at','requested_ip','user_agent','created_at')

  union all
  -- 5. auth_user_id FK → auth_users with ON DELETE CASCADE
  select 5,
         'password_reset_tokens.auth_user_id FK → auth_users (cascade)',
         coalesce(string_agg(con.confdeltype, ','),'(none)'),
         case when bool_or(con.confdeltype='c') then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='password_reset_tokens'
  join pg_class f on f.oid=con.confrelid and f.relname='auth_users'
  where con.contype='f'

  union all
  -- 6. token_hash is UNIQUE (one live token per hash; a replayed insert can't fork a token)
  select 6,
         'unique index on password_reset_tokens.token_hash',
         coalesce(string_agg(i.relname, ','),'(none)'),
         case when count(*)>=1 then 'PASS' else 'FAIL' end
  from pg_index x
  join pg_class c on c.oid=x.indrelid and c.relname='password_reset_tokens'
  join pg_class i on i.oid=x.indexrelid
  where x.indisunique
    and (select array_agg(a.attname::text order by a.attname)
         from pg_attribute a
         where a.attrelid=c.oid and a.attnum = any(x.indkey)) = array['token_hash']

  union all
  -- 7. both SECURITY DEFINER helpers exist with prosecdef=true
  select 7,
         'SECURITY DEFINER fns: app_create/consume_password_reset_token (expect 2)',
         count(*)::text||' / 2',
         case when count(*)=2 and bool_and(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname in ('app_create_password_reset_token','app_consume_password_reset_token')
    and p.pronamespace=(select oid from pg_namespace where nspname='public')

  union all
  -- 8. pawpi_app has EXECUTE on both helpers
  select 8,
         'pawpi_app EXECUTE on both reset helpers (expect 2)',
         count(*) filter (where has_function_privilege('pawpi_app', p.oid, 'EXECUTE'))::text||' / 2',
         case when count(*) filter (where has_function_privilege('pawpi_app', p.oid, 'EXECUTE'))=2
              then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname in ('app_create_password_reset_token','app_consume_password_reset_token')
    and p.pronamespace=(select oid from pg_namespace where nspname='public')

  union all
  -- 9. pawpi_app has SELECT/INSERT on the table (rides 0019's blanket + default privileges;
  --    RLS — not a missing grant — is what denies the direct path)
  select 9,
         'pawpi_app SELECT/INSERT on password_reset_tokens',
         (has_table_privilege('pawpi_app','public.password_reset_tokens','SELECT')
            and has_table_privilege('pawpi_app','public.password_reset_tokens','INSERT'))::text,
         case when has_table_privilege('pawpi_app','public.password_reset_tokens','SELECT')
               and has_table_privilege('pawpi_app','public.password_reset_tokens','INSERT') then 'PASS' else 'FAIL' end

  union all
  -- 10. the consume helper must NOT have been left as a plain (INVOKER) function — it writes
  --     auth_accounts/auth_sessions and is called with no identity in scope.
  select 10,
         'app_consume_password_reset_token is SECURITY DEFINER',
         coalesce('prosecdef='||bool_or(p.prosecdef)::text, 'MISSING'),
         case when bool_or(p.prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p
  where p.proname='app_consume_password_reset_token'
    and p.pronamespace=(select oid from pg_namespace where nspname='public')
)
select check_name, detail, status from checks order by ord, check_name;
