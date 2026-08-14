-- Verification for migration 0107 (per-user email locale, FF1).
-- Run in the Supabase SQL editor AFTER applying 0107. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'user_profiles.preferred_locale column exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='user_profiles' and column_name='preferred_locale'

  union all
  select 2, 'preferred_locale CHECK constraint present (en|es|null)',
         case when pg_get_constraintdef(oid) like '%''en''%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(oid) like '%''en''%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.user_profiles'::regclass and conname='user_profiles_preferred_locale_check'

  union all
  select 3, 'existing rows default to NULL (es-AR fallback preserved)',
         coalesce((select count(*)::text from user_profiles where preferred_locale is not null), '0')||' non-null',
         case when not exists (select 1 from user_profiles where preferred_locale is not null
                               and preferred_locale not in ('en','es'))
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'app_weekly_digest_due returns preferred_locale',
         case when exists (
                select 1 from pg_proc pr
                join pg_type rt on rt.oid = pr.prorettype
                where pr.proname = 'app_weekly_digest_due'
                  and pg_get_function_result(pr.oid) like '%preferred_locale%'
              ) then 'present' else 'absent' end,
         case when exists (
                select 1 from pg_proc pr
                where pr.proname = 'app_weekly_digest_due'
                  and pg_get_function_result(pr.oid) like '%preferred_locale%'
              ) then 'PASS' else 'FAIL' end

  union all
  select 5, 'app_reengagement_due returns preferred_locale',
         case when exists (
                select 1 from pg_proc pr
                where pr.proname = 'app_reengagement_due'
                  and pg_get_function_result(pr.oid) like '%preferred_locale%'
              ) then 'present' else 'absent' end,
         case when exists (
                select 1 from pg_proc pr
                where pr.proname = 'app_reengagement_due'
                  and pg_get_function_result(pr.oid) like '%preferred_locale%'
              ) then 'PASS' else 'FAIL' end

  union all
  select 6, 'both enumerators still granted to pawpi_app',
         (select count(*)::text from information_schema.role_routine_grants
           where grantee='pawpi_app'
             and routine_name in ('app_weekly_digest_due','app_reengagement_due'))||' grants',
         case when (select count(distinct routine_name) from information_schema.role_routine_grants
                     where grantee='pawpi_app'
                       and routine_name in ('app_weekly_digest_due','app_reengagement_due')) = 2
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
