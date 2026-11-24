-- Verification for migration 0142 (sharing lifecycle: leave, notifications, account deletion that preserves contributions).
-- Run in the Supabase SQL editor AFTER applying 0142. EVERY row should read PASS. Read-only (catalog queries only).
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl, p.proowner, pg_get_functiondef(p.oid) as def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('leave_pet_caregiver', 'app_delete_my_account', 'delete_my_account')
),
con as (
  select conname, pg_get_constraintdef(oid) as def from pg_constraint
  where conname in ('pet_caregivers_status_check', 'pet_caregiver_audit_action_check', 'notifications_type_check')
),
checks as (
  select 1 as ord, 'pet_caregivers status CHECK allows ''left''' as check_name,
         coalesce((select def from con where conname = 'pet_caregivers_status_check'), '(missing)') as detail,
         case when (select def from con where conname = 'pet_caregivers_status_check') ilike '%''left''%' then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'pet_caregiver_audit action CHECK allows leave + resend',
         coalesce((select def from con where conname = 'pet_caregiver_audit_action_check'), '(missing)'),
         case when (select def from con where conname = 'pet_caregiver_audit_action_check') ilike '%''leave''%'
               and (select def from con where conname = 'pet_caregiver_audit_action_check') ilike '%''resend''%' then 'PASS' else 'FAIL' end

  union all
  select 3, 'notifications type CHECK allows the six pet_share_* types (and still the business types)',
         (select count(*) from unnest(array['pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted']) x
          where (select def from con where conname = 'notifications_type_check') ilike '%''' || x || '''%')::text || ' / 6',
         case when (select count(*) from unnest(array['pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted']) x
                    where (select def from con where conname = 'notifications_type_check') ilike '%''' || x || '''%') = 6
               and (select def from con where conname = 'notifications_type_check') ilike '%''biz_follow''%' then 'PASS' else 'FAIL' end

  union all
  select 4, 'pet_caregivers has left_at, last_notified_at, resend_count',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pet_caregivers'
            and column_name in ('left_at', 'last_notified_at', 'resend_count'))::text || ' / 3',
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pet_caregivers'
                      and column_name in ('left_at', 'last_notified_at', 'resend_count')) = 3 then 'PASS' else 'FAIL' end

  union all
  select 5, 'the 3 functions exist, are SECURITY DEFINER and pin search_path = public, pg_temp',
         (select count(*) from fn)::text || ' / 3',
         case when (select count(*) from fn) = 3 and (select bool_and(prosecdef and exists (select 1 from unnest(coalesce(proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp')) from fn)
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'pawpi_app can EXECUTE all 3; PUBLIC / anon / authenticated cannot',
         (select count(*) filter (where has_function_privilege('pawpi_app', oid, 'EXECUTE'))::text || ' pawpi_app ok; '
                 || count(*) filter (where exists (select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))::text || ' public grant(s)' from fn),
         case when (select count(*) from fn) = 3
               and (select bool_and(has_function_privilege('pawpi_app', oid, 'EXECUTE')) from fn)
               and not exists (select 1 from fn f where exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
               and not exists (select 1 from fn f join pg_roles r on r.rolname in ('anon', 'authenticated') where has_function_privilege(r.oid, f.oid, 'EXECUTE'))
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'delete_my_account() delegates to app_delete_my_account (the anonymising engine) and keeps its signature',
         coalesce((select pg_get_function_result(oid) || ' delete_my_account(' || pg_get_function_arguments(oid) || ')' from fn where proname = 'delete_my_account'), '(missing)'),
         case when exists (select 1 from fn where proname = 'delete_my_account' and def ilike '%app_delete_my_account%' and pg_get_function_arguments(oid) = '' and pg_get_function_result(oid) = 'boolean')
               and exists (select 1 from fn where proname = 'app_delete_my_account' and def ilike '%former_member%' and def ilike '%created_by_user_id%')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
