-- Verification for migration 0162 (prices as bigint). Run in the Supabase SQL editor AFTER applying 0162.
-- EVERY row should read PASS (5 rows). Read-only (catalog queries only).
with
cols as (
  select table_name || '.' || column_name as col, udt_name
  from information_schema.columns
  where table_schema = 'public' and column_name like '%\_cents'
),
fn as (
  select p.oid, p.proname, p.prosecdef, p.proowner,
         pg_get_function_result(p.oid) as result,
         coalesce(array_to_string(p.proconfig, ','), '(none)') as config,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
         ) as exposed,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_can
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'app_payment_for_webhook'
),
touched as (
  select unnest(array['adoptable_listings', 'insurance_policies', 'order_items', 'orders', 'payments', 'payouts',
                      'provider_services', 'rx_fulfillment_orders', 'shop_products', 'walk_packages']) as t
),
checks as (
  select 1 as ord, 'every cents column is bigint' as check_name,
         (select count(*)::text from cols where udt_name = 'int8') || ' bigint, still narrower: '
           || coalesce((select string_agg(col, ' ' order by col) from cols where udt_name <> 'int8'), 'none') as detail,
         case when (select count(*) from cols where udt_name = 'int8') = 14
                and not exists (select 1 from cols where udt_name <> 'int8')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'the price limits (not negative, former price above price) are all still enforced',
         (select count(*)::text from pg_constraint c
           where c.contype = 'c' and c.convalidated and c.connamespace = 'public'::regnamespace
             and pg_get_constraintdef(c.oid) like '%\_cents%') || ' checks',
         case when (select count(*) from pg_constraint c
                     where c.contype = 'c' and c.convalidated and c.connamespace = 'public'::regnamespace
                       and pg_get_constraintdef(c.oid) like '%\_cents%') >= 11
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'an owner still cannot set a policy premium, on insert or update',
         coalesce((select string_agg(policyname || ':' || cmd, ' ' order by policyname) from pg_policies
                   where schemaname = 'public' and tablename = 'insurance_policies'), '(none)'),
         case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'insurance_policies') = 5
                and exists (select 1 from pg_policies where tablename = 'insurance_policies' and policyname = 'insurance_policies_owner_insert'
                              and cmd = 'INSERT' and with_check like '%owner_user_id = current_app_user_id()%'
                              and with_check like '%premium_cents IS NULL%' and with_check like '%policy_number IS NULL%')
                and exists (select 1 from pg_policies where tablename = 'insurance_policies' and policyname = 'insurance_policies_owner_update'
                              and cmd = 'UPDATE' and qual like '%owner_user_id = current_app_user_id()%'
                              and with_check like '%premium_cents IS NULL%' and with_check like '%policy_number IS NULL%'
                              and with_check like '%cancelled%')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'the webhook lookup returns the wider amount and is pinned, owned by a role that bypasses row security, not exposed',
         coalesce((select result || ' secdef=' || prosecdef::text || ' exposed=' || exposed::text from fn), '(missing)'),
         case when exists (select 1 from fn join pg_roles r on r.oid = fn.proowner
                           where fn.prosecdef and fn.config like 'search_path=%pg_temp%' and fn.app_can and not fn.exposed
                             and fn.result like '%amount_cents bigint%' and (r.rolsuper or r.rolbypassrls))
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'row security is still enabled and forced on every table that changed',
         coalesce((select string_agg(t, ' ' order by t) from touched
                   where not exists (select 1 from pg_class c where c.oid = to_regclass('public.' || t)
                                       and c.relrowsecurity and c.relforcerowsecurity)), 'all forced'),
         case when not exists (select 1 from touched
                               where not exists (select 1 from pg_class c where c.oid = to_regclass('public.' || t)
                                                   and c.relrowsecurity and c.relforcerowsecurity))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
