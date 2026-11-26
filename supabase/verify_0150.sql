-- Verification for migration 0150 (provider-request owner check + caregiver photo reference check).
-- Run in the Supabase SQL editor AFTER applying 0150. EVERY row should read PASS.
-- Read-only (catalog queries and counts only). Safe to run any number of times.
with
gp  as (select * from pg_policies where schemaname = 'public' and tablename = 'care_access_grants'),
pp  as (select * from pg_policies where schemaname = 'public' and tablename = 'health_photo_checks'),
fn  as (select * from pg_proc where pronamespace = 'public'::regnamespace and proname = 'app_pet_owner_is'),
checks as (
  select 1 as ord, 'app_pet_owner_is exists as SECURITY DEFINER with a pinned search_path' as check_name,
         coalesce((select 'definer=' || prosecdef::text from fn limit 1), '(missing)') as detail,
         case when exists (select 1 from fn where prosecdef
                             and exists (select 1 from unnest(coalesce(proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp'))
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'app_pet_owner_is: pawpi_app can execute it; PUBLIC, anon and authenticated cannot',
         coalesce((select 'pawpi_app=' || has_function_privilege('pawpi_app', oid, 'EXECUTE')::text
                          || ' public_acl=' || (proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0))::text from fn limit 1), '(missing)'),
         case when exists (select 1 from fn
                           where has_function_privilege('pawpi_app', oid, 'EXECUTE')
                             and proacl is not null
                             and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0)
                             and not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated')
                                              and has_function_privilege(r.oid, fn.oid, 'EXECUTE')))
              then 'PASS' else 'FAIL' end
  from (select 1) one

  union all
  select 3, 'care_access_grants_insert: provider-staff branch also requires app_pet_owner_is(pet_id, owner_user_id); owner branch unchanged',
         (select count(*) from gp where policyname = 'care_access_grants_insert')::text || ' policy',
         case when (select count(*) from gp where policyname = 'care_access_grants_insert') = 1
               and exists (select 1 from gp where policyname = 'care_access_grants_insert' and cmd = 'INSERT'
                             and with_check ilike '%app_is_active_staff_of(provider_id)%'
                             and with_check ilike '%app_pet_owner_is(pet_id, owner_user_id)%'
                             and with_check ilike '%requested_by = ''provider''%'
                             and with_check ilike '%status = ''pending''%'
                             and with_check ilike '%sections IS NULL%'
                             and with_check ilike '%requested_by = ''owner''%'
                             and with_check ilike '%owner_user_id = current_app_user_id()%')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'care_access_grants select/update policies are still in place',
         (select string_agg(policyname || ':' || cmd, ', ' order by policyname) from gp where policyname <> 'care_access_grants_insert'),
         case when exists (select 1 from gp where policyname = 'care_access_grants_select' and cmd = 'SELECT')
               and exists (select 1 from gp where policyname = 'care_access_grants_update' and cmd = 'UPDATE')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'health_photo_checks_caregiver_insert requires pet access, the pet''s owner as owner_user_id, and a private media key for this pet',
         (select count(*) from pp where policyname = 'health_photo_checks_caregiver_insert')::text || ' policy',
         case when (select count(*) from pp where policyname = 'health_photo_checks_caregiver_insert') = 1
               and exists (select 1 from pp where policyname = 'health_photo_checks_caregiver_insert' and cmd = 'INSERT'
                             and with_check ilike '%app_user_has_pet_access(pet_id)%'
                             and with_check ilike '%owner_user_id = ( SELECT p.owner_user_id%FROM pets p%'
                             and with_check ilike '%^pets/%'
                             and with_check ilike '%(pet_id)::text%'
                             and with_check ilike '%POSITION((''..''::text) IN (image_url)) = 0%')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'the other health_photo_checks policies (owner, family, grantee read, provider section read) are unchanged',
         (select string_agg(policyname || ':' || cmd, ', ' order by policyname) from pp where policyname <> 'health_photo_checks_caregiver_insert'),
         case when exists (select 1 from pp where policyname = 'health_photo_checks_owner_all' and cmd = 'ALL'
                             and with_check ilike '%owner_user_id = current_app_user_id()%' and with_check ilike '%app_owns_pet(pet_id)%')
               and exists (select 1 from pp where policyname = 'health_photo_checks_family_all' and cmd = 'ALL')
               and exists (select 1 from pp where policyname = 'health_photo_checks_grantee_read' and cmd = 'SELECT')
               and exists (select 1 from pp where policyname = 'health_photo_checks_provider_section_read' and cmd = 'SELECT')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'FORCE RLS is still on for care_access_grants and health_photo_checks',
         (select count(*) from pg_class where relnamespace = 'public'::regnamespace
            and relname in ('care_access_grants', 'health_photo_checks') and relrowsecurity and relforcerowsecurity)::text || ' / 2',
         case when (select count(*) from pg_class where relnamespace = 'public'::regnamespace
                      and relname in ('care_access_grants', 'health_photo_checks') and relrowsecurity and relforcerowsecurity) = 2
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): no stored provider request names an owner other than the pet's owner.
  select 8, 'no existing provider-requested grant has an owner different from its pet''s owner',
         (select count(*) from care_access_grants g join pets p on p.id = g.pet_id
           where g.requested_by = 'provider' and p.owner_user_id <> g.owner_user_id)::text || ' mismatched',
         case when not exists (select 1 from care_access_grants g join pets p on p.id = g.pet_id
                                where g.requested_by = 'provider' and p.owner_user_id <> g.owner_user_id)
              then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord;
