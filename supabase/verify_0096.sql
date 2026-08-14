-- Verification for migration 0096 (engagement welcome paw, unit E6).
-- Run in the Supabase SQL editor AFTER applying 0096. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'app_welcome_account() exists (lazy official-account maker)' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_welcome_account'

  union all
  select 2, 'app_welcome_account() is SECURITY DEFINER + pawpi_app can EXECUTE',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef)
               and bool_and(has_function_privilege('pawpi_app', p.oid, 'execute'))
              then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_welcome_account'

  union all
  select 3, 'app_welcome_paw(int) exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_welcome_paw'

  union all
  select 4, 'app_welcome_paw is SECURITY DEFINER',
         case when bool_and(prosecdef) then 'definer' else 'invoker' end,
         case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_welcome_paw'

  union all
  select 5, 'pawpi_app can EXECUTE app_welcome_paw',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_welcome_paw'
    and has_function_privilege('pawpi_app', p.oid, 'execute')

  union all
  select 6, 'notifications_type_check allows ''welcome''',
         case when pg_get_constraintdef(c.oid) like '%welcome%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(c.oid) like '%welcome%' then 'PASS' else 'FAIL' end
  from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass
    and c.conname = 'notifications_type_check'
)
select ord, check_name, detail, status from checks order by ord;
