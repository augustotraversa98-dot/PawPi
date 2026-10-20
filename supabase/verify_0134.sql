-- Verification for migration 0134 (revoke EXECUTE from PUBLIC / anon / authenticated on every public function; finish 0126).
-- Run in the Supabase SQL editor AFTER applying 0134. EVERY row should read PASS.
-- (The default-privileges part for role supabase_admin is checked by supabase/verify_0134_default_acl.sql.)
with
fns as (
  select p.oid, p.oid::regprocedure::text as signature, p.proname, p.proowner, p.proacl
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
named as (
  select unnest(array[
    'app_log_notification_send', 'app_mark_push_token_invalid', 'app_notification_send_log_gc',
    'app_notification_sends_today', 'app_pending_push_tickets', 'app_recipient_notification_settings',
    'app_recipient_valid_push_tokens', 'app_record_push_ticket', 'app_reserve_notification_send',
    'app_resolve_push_tickets', 'app_set_email_consent', 'app_user_day_start'
  ]) as proname
),
checks as (
  select 1 as ord, 'no public function is executable by PUBLIC' as check_name,
         count(*)::text || ' function(s)' as detail,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as status
  from fns f
  where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')

  union all
  select 2, 'anon / authenticated can EXECUTE no public function (roles absent = PASS)',
         count(*)::text || ' function(s)',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f
  join pg_roles r on r.rolname in ('anon', 'authenticated')
  where has_function_privilege(r.oid, f.oid, 'EXECUTE')

  union all
  select 3, 'the 12 notification-v2 functions: present, closed to anon/authenticated/PUBLIC, open to pawpi_app',
         count(*) filter (where closed)::text || ' / ' || (select count(*) from named)::text,
         case when count(*) = (select count(*) from named) and bool_and(closed) then 'PASS' else 'FAIL' end
  from (
    select f.signature,
           has_function_privilege('pawpi_app', f.oid, 'EXECUTE')
             and not exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                             where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             and not exists (select 1 from pg_roles r
                             where r.rolname in ('anon', 'authenticated')
                               and has_function_privilege(r.oid, f.oid, 'EXECUTE')) as closed
    from fns f join named n on n.proname = f.proname
  ) x

  union all
  select 4, 'pawpi_app can EXECUTE every public function (app unaffected)',
         count(*)::text || ' not executable',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f where not has_function_privilege('pawpi_app', f.oid, 'EXECUTE')

  union all
  select 5, 'service_role can EXECUTE every public function (seed scripts unaffected; role absent = PASS)',
         count(*)::text || ' not executable',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from fns f
  join pg_roles r on r.rolname = 'service_role'
  where not has_function_privilege(r.oid, f.oid, 'EXECUTE')

  union all
  select 6, 'no table / view / sequence in public is granted to PUBLIC, anon or authenticated',
         count(*)::text || ' grant(s)',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_class c
  cross join lateral aclexplode(c.relacl) a
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))

  union all
  select 7, 'default privileges for role postgres in public grant nothing to PUBLIC / anon / authenticated',
         count(*)::text || ' entry(ies)',
         case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace
    and d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
    and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
)
select ord, check_name, detail, status from checks order by ord;
