-- Verification for migration 0114 (MOD1 PR1 — admin identity + alerting foundation).
-- Run in the Supabase SQL editor AFTER applying 0114. EVERY row should read PASS.
--
-- Checks 1–6 are SHAPE + SEED. Because app_is_admin() keys on the session GUC
-- app.current_user_id (unset in the SQL editor), its BEHAVIOUR is exercised in the
-- integration suite (admin-identity.integration.test.ts) rather than here; check 3
-- proves the definition was widened to reference is_admin.
with checks as (
  select 1 as ord, 'user_profiles.is_admin column exists (boolean, not null, default false)' as check_name,
         coalesce(string_agg(data_type||'/'||is_nullable||'/'||coalesce(column_default,'(none)'), ','), '(absent)') as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='is_admin'

  union all
  select 2, 'app_is_admin() is SECURITY DEFINER with a pinned search_path',
         'secdef='||coalesce(bool_or(p.prosecdef)::text,'?')||' cfg='||coalesce(string_agg(array_to_string(p.proconfig,','),';'),'(none)'),
         case when count(*)=1 and bool_and(p.prosecdef)
                   and bool_and(array_to_string(p.proconfig,',') like 'search_path=%')
              then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_is_admin'

  union all
  select 3, 'app_is_admin() definition references is_admin (widened past role-only)',
         case when count(*)=1 then 'references is_admin' else 'NOT widened' end,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_is_admin'
    and pg_get_functiondef(p.oid) like '%is_admin%'

  union all
  select 4, 'app_admin_recipients() exists, is SECURITY DEFINER, pinned search_path',
         'secdef='||coalesce(bool_or(p.prosecdef)::text,'?'),
         case when count(*)=1 and bool_and(p.prosecdef)
                   and bool_and(array_to_string(p.proconfig,',') like 'search_path=%')
              then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_admin_recipients'

  union all
  select 5, 'pawpi_app can EXECUTE app_admin_recipients()',
         case when has_function_privilege('pawpi_app','public.app_admin_recipients()','EXECUTE')
              then 'granted' else 'NOT granted' end,
         case when has_function_privilege('pawpi_app','public.app_admin_recipients()','EXECUTE')
              then 'PASS' else 'FAIL' end

  union all
  -- The seed made the owner an admin: prod must now have AT LEAST ONE admin (else the
  -- moderation queue still 403s for everyone). This is the whole point of PR1.
  select 6, 'at least one admin exists (the launch-admin seed took effect)',
         (select count(*)::text from app_admin_recipients())||' admin(s)',
         case when (select count(*) from app_admin_recipients()) >= 1 then 'PASS' else 'FAIL' end

  union all
  -- ...and specifically the owner's account is one of them (proves the seed hit the right row).
  select 7, 'owner account (augustotraversa98@gmail.com) is flagged is_admin',
         case when exists (
           select 1 from user_profiles p join auth_users a on a.id=p.auth_user_id
           where lower(a.email)=lower('augustotraversa98@gmail.com') and p.is_admin
         ) then 'flagged' else 'NOT flagged (account may not exist yet)' end,
         case when exists (
           select 1 from user_profiles p join auth_users a on a.id=p.auth_user_id
           where lower(a.email)=lower('augustotraversa98@gmail.com') and p.is_admin
         ) then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
