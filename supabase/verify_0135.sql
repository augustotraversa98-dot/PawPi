-- Verification for migration 0135 (payment settlement: app_payment_for_webhook + app_apply_payment_status; flow matrix F3-01 / F3-03).
-- Run in the Supabase SQL editor AFTER applying 0135. EVERY row should read PASS.
-- Read-only (catalog queries only; calls neither function). Safe to run any number of times.
with
fns as (
  select p.oid, p.oid::regprocedure::text as signature, p.proname, p.proowner, p.proacl, p.prosecdef, p.proconfig
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('app_payment_for_webhook', 'app_apply_payment_status')
),
checks as (
  select 1 as ord, 'both functions exist with the expected signatures' as check_name,
         (select count(*) from fns)::text || ' / 2 found' as detail,
         case when to_regprocedure('app_payment_for_webhook(text)') is not null
               and to_regprocedure('app_apply_payment_status(integer,text,text)') is not null
               and (select count(*) from fns) = 2 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'both are SECURITY DEFINER',
         count(*) filter (where prosecdef)::text || ' / ' || count(*)::text,
         case when count(*) = 2 and bool_and(prosecdef) then 'PASS' else 'FAIL' end
  from fns

  union all
  select 3, 'both pin search_path = public, pg_temp',
         coalesce(string_agg(proname || ': ' || coalesce(array_to_string(proconfig, ' '), '(none)'), '; '), '(no functions)'),
         case when count(*) = 2
               and bool_and(exists (select 1 from unnest(coalesce(proconfig, '{}')) c
                                    where replace(c, ' ', '') = 'search_path=public,pg_temp')) then 'PASS' else 'FAIL' end
  from fns

  union all
  select 4, 'pawpi_app can EXECUTE both',
         count(*) filter (where has_function_privilege('pawpi_app', oid, 'EXECUTE'))::text || ' / ' || count(*)::text,
         case when count(*) = 2 and bool_and(has_function_privilege('pawpi_app', oid, 'EXECUTE')) then 'PASS' else 'FAIL' end
  from fns

  union all
  select 5, 'PUBLIC has no EXECUTE on either',
         count(*)::text || ' function(s) executable by PUBLIC',
         case when (select count(*) from fns) = 2 and count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f
  where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')

  union all
  select 6, 'anon / authenticated have no EXECUTE on either (roles absent = PASS)',
         count(*)::text || ' grant(s)',
         case when (select count(*) from fns) = 2 and count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f
  join pg_roles r on r.rolname in ('anon', 'authenticated')
  where has_function_privilege(r.oid, f.oid, 'EXECUTE')

  union all
  select 7, 'EXECUTE is granted to pawpi_app only (no other non-owner role can run them)',
         coalesce(string_agg(distinct g.rolname, ', '), '(none besides owner)'),
         case when (select count(*) from fns) = 2 and count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
  join pg_roles g on g.oid = a.grantee
  where a.privilege_type = 'EXECUTE'
    and g.oid <> f.proowner
    and g.rolname not in ('pawpi_app', 'service_role', 'supabase_admin', 'postgres')

  union all
  select 8, 'what the functions call is present (0037 stock, 0089 walk credits, 0079 auto-confirm, 0030 order link)',
         concat_ws(', ',
           case when to_regprocedure('app_adjust_order_stock(integer,integer)') is null then 'missing app_adjust_order_stock' end,
           case when to_regprocedure('app_grant_walk_credits(integer)') is null then 'missing app_grant_walk_credits' end,
           case when not exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = 'providers' and column_name = 'auto_confirm_bookings')
                then 'missing providers.auto_confirm_bookings' end,
           case when not exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = 'vet_appointments' and column_name = 'order_id')
                then 'missing vet_appointments.order_id' end),
         case when to_regprocedure('app_adjust_order_stock(integer,integer)') is not null
               and to_regprocedure('app_grant_walk_credits(integer)') is not null
               and exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'providers' and column_name = 'auto_confirm_bookings')
               and exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'vet_appointments' and column_name = 'order_id')
              then 'PASS' else 'FAIL' end

)
select ord, check_name, detail, status from checks order by ord;
