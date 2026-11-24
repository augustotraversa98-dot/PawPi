-- Verification for migration 0141 (family write policies; sharing series PR 3b).
-- Run in the Supabase SQL editor AFTER applying 0141. EVERY row should read PASS.
-- Read-only (catalog queries only). Safe to run any number of times.
with
fam_t(tab) as (values ('pet_medications'), ('pet_preventive_treatments'), ('pet_vaccinations'), ('vet_appointments')),
all_t(tab) as (values ('pet_medications'), ('pet_preventive_treatments'), ('pet_vaccinations'), ('vet_appointments'), ('pet_medical_profiles')),
pol as (select * from pg_policies where schemaname = 'public'),
checks as (
  select 1 as ord, 'the 4 tables have <t>_family_all (FOR ALL) gated on app_user_has_pet_family, WITH CHECK tying the row to the pet''s owner' as check_name,
         (select count(*) from fam_t f join pol p on p.tablename = f.tab and p.policyname = f.tab || '_family_all' and p.cmd = 'ALL'
            and p.qual ilike '%app_user_has_pet_family(pet_id)%'
            and p.with_check ilike '%app_user_has_pet_family(pet_id)%' and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%')::text || ' / 4' as detail,
         case when (select count(*) from fam_t f join pol p on p.tablename = f.tab and p.policyname = f.tab || '_family_all' and p.cmd = 'ALL'
                      and p.qual ilike '%app_user_has_pet_family(pet_id)%'
                      and p.with_check ilike '%app_user_has_pet_family(pet_id)%' and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%') = 4
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'pet_medical_profiles_family_insert exists (INSERT) with the family gate and the owner anchor',
         (select count(*) from pol p where p.tablename = 'pet_medical_profiles' and p.policyname = 'pet_medical_profiles_family_insert' and p.cmd = 'INSERT'
            and p.with_check ilike '%app_user_has_pet_family(pet_id)%' and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%')::text || ' / 1',
         case when exists (select 1 from pol p where p.tablename = 'pet_medical_profiles' and p.policyname = 'pet_medical_profiles_family_insert' and p.cmd = 'INSERT'
                           and p.with_check ilike '%app_user_has_pet_family(pet_id)%' and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'a CAREGIVER (any-grantee helper) has NO write policy on these 5 tables',
         coalesce((select string_agg(p.tablename || '.' || p.policyname, ', ') from all_t a join pol p on p.tablename = a.tab
                   where p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                     and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%')), '(none)'),
         case when not exists (select 1 from all_t a join pol p on p.tablename = a.tab
                               where p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                                 and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%'))
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'vaccines and appointments stay closed to caregivers entirely (no policy on them uses the any-grantee helper)',
         coalesce((select string_agg(p.tablename || '.' || p.policyname, ', ') from pol p
                   where p.tablename in ('pet_vaccinations', 'vet_appointments')
                     and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%')), '(none)'),
         case when not exists (select 1 from pol p where p.tablename in ('pet_vaccinations', 'vet_appointments')
                               and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%'))
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'FORCE RLS is on all 5 tables',
         (select count(*) from all_t a join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = a.tab
          where c.relrowsecurity and c.relforcerowsecurity)::text || ' / 5',
         case when (select count(*) from all_t a join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = a.tab
                    where c.relrowsecurity and c.relforcerowsecurity) = 5 then 'PASS' else 'FAIL' end

  union all
  select 6, 'the 0049 family policies this PR relies on are intact (pets_family_update, routines_family_write, pet_medical_profiles_family_update)',
         (select count(*) from pol p where (p.tablename, p.policyname) in
            (('pets', 'pets_family_update'), ('routines', 'routines_family_write'), ('pet_medical_profiles', 'pet_medical_profiles_family_update')))::text || ' / 3',
         case when (select count(*) from pol p where (p.tablename, p.policyname) in
                      (('pets', 'pets_family_update'), ('routines', 'routines_family_write'), ('pet_medical_profiles', 'pet_medical_profiles_family_update'))) = 3
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'the owner own-row policy on pet_vaccinations, vet_appointments and pet_medical_profiles also requires the pet to be the caller''s (USING unchanged)',
         (select count(*) from all_t a join pol p on p.tablename = a.tab and p.policyname = a.tab || '_owner_all' and p.cmd = 'ALL'
            and a.tab in ('pet_vaccinations', 'vet_appointments', 'pet_medical_profiles')
            and p.with_check ilike '%owner_user_id = current_app_user_id()%' and p.with_check ilike '%app_owns_pet(pet_id)%'
            and p.qual ilike '%owner_user_id = current_app_user_id()%' and p.qual not ilike '%app_owns_pet%')::text || ' / 3',
         case when (select count(*) from all_t a join pol p on p.tablename = a.tab and p.policyname = a.tab || '_owner_all' and p.cmd = 'ALL'
                      and a.tab in ('pet_vaccinations', 'vet_appointments', 'pet_medical_profiles')
                      and p.with_check ilike '%owner_user_id = current_app_user_id()%' and p.with_check ilike '%app_owns_pet(pet_id)%'
                      and p.qual ilike '%owner_user_id = current_app_user_id()%' and p.qual not ilike '%app_owns_pet%') = 3
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (read-only): nothing in these three tables was authored by someone who does not own the pet.
  select 9, 'no existing row in pet_vaccinations / vet_appointments / pet_medical_profiles was authored by a non-owner of its pet',
         (select count(*) from (
            select owner_user_id, pet_id from pet_vaccinations union all select owner_user_id, pet_id from vet_appointments
            union all select owner_user_id, pet_id from pet_medical_profiles) r
          join pets p on p.id = r.pet_id where p.owner_user_id <> r.owner_user_id)::text || ' mismatched row(s)',
         case when not exists (select 1 from (
            select owner_user_id, pet_id from pet_vaccinations union all select owner_user_id, pet_id from vet_appointments
            union all select owner_user_id, pet_id from pet_medical_profiles) r
          join pets p on p.id = r.pet_id where p.owner_user_id <> r.owner_user_id)
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'the family helper exists as SECURITY DEFINER with a pinned search_path and pawpi_app can execute it',
         coalesce((select 'definer=' || p.prosecdef::text || ' pawpi_app_exec=' || has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text
                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_user_has_pet_family' limit 1), '(missing)'),
         case when exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_user_has_pet_family'
                           and p.prosecdef and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
                           and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp'))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
