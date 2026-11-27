-- Verification for migration 0159 (editing an existing share). Run in the Supabase SQL editor AFTER applying 0159.
-- EVERY row should read PASS (4 rows). Read-only (catalog queries only).
-- After 0159, verify_0153 rows 1 and 8 read FAIL by design (the new column and the widened end-date rule).
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc, p.proowner,
         pg_get_function_identity_arguments(p.oid) as args,
         coalesce(array_to_string(p.proconfig, ','), '(none)') as config,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
         ) as exposed,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_can
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),
pol as (
  select policyname, cmd, coalesce(with_check, '') as with_check
  from pg_policies where schemaname = 'public' and tablename = 'care_record_links'
),
checks as (
  select 1 as ord, 'a link still ends within a year of when its terms were last set' as check_name,
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conname = 'care_record_links_expiry_check'
                     and conrelid = to_regclass('public.care_record_links')), '(missing)') as detail,
         case when exists (select 1 from pg_constraint
                           where conname = 'care_record_links_expiry_check' and convalidated
                             and conrelid = to_regclass('public.care_record_links')
                             and pg_get_constraintdef(oid) like '%expires_at > created_at%'
                             and pg_get_constraintdef(oid) like '%COALESCE(terms_changed_at, created_at) + ''366 days''::interval%')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'app_update_record_link: only the pet''s owner, only a link in use, locked',
         coalesce((select 'args=[' || args || '] secdef=' || prosecdef::text || ' config=' || config || ' pawpi_app='
                          || app_can::text || ' exposed=' || exposed::text from fn where proname = 'app_update_record_link'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_update_record_link') = 1
                and exists (select 1 from fn where proname = 'app_update_record_link' and prosecdef
                              and config like 'search_path=%pg_temp%' and app_can and not exposed
                              and args = 'p_link_id integer, p_sections text[], p_edit_sections text[], p_expiry text'
                              and prosrc like '%l.owner_user_id = current_app_user_id()%'
                              and prosrc like '%p.owner_user_id = l.owner_user_id%'
                              and prosrc like '%for update;%'
                              and prosrc like '%v_link.revoked_at is not null or v_link.expires_at <= now()%'
                              and prosrc !~* '\m(delete|insert|token_hash)\M')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'the function owner bypasses row security (the owner has no direct edit right)',
         coalesce((select r.rolname from fn join pg_roles r on r.oid = fn.proowner where fn.proname = 'app_update_record_link'), '(missing)'),
         case when exists (select 1 from fn join pg_roles r on r.oid = fn.proowner
                           where fn.proname = 'app_update_record_link' and (r.rolsuper or r.rolbypassrls))
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'directly, an owner can still only remove a link',
         coalesce((select with_check from pol where policyname = 'care_record_links_owner_update'), '(missing)'),
         case when (select count(*) from pol where cmd in ('UPDATE', 'ALL')) = 1
                and exists (select 1 from pol where policyname = 'care_record_links_owner_update'
                              and with_check like '%revoked_at IS NOT NULL%' and with_check not like '% OR %')
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
