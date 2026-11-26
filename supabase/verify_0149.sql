-- Verification for migration 0149 (vet_notes owner policy also requires the pet to be the caller's).
-- Run in the Supabase SQL editor AFTER applying 0149. EVERY row should read PASS.
-- Read-only (catalog queries and counts only). Safe to run any number of times.
with
pol as (select * from pg_policies where schemaname = 'public' and tablename = 'vet_notes'),
checks as (
  select 1 as ord,
         'vet_notes_owner_all is FOR ALL and its WITH CHECK requires both the caller as owner and the caller''s pet' as check_name,
         coalesce((select with_check from pol where policyname = 'vet_notes_owner_all' and cmd = 'ALL'), '(missing)') as detail,
         case when exists (select 1 from pol where policyname = 'vet_notes_owner_all' and cmd = 'ALL'
                             and with_check ilike '%owner_user_id = current_app_user_id()%'
                             and with_check ilike '%app_owns_pet(pet_id)%')
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'USING is unchanged: own rows only',
         coalesce((select qual from pol where policyname = 'vet_notes_owner_all'), '(missing)'),
         case when exists (select 1 from pol where policyname = 'vet_notes_owner_all'
                             and qual ilike '%owner_user_id = current_app_user_id()%' and qual not ilike '%app_owns_pet%')
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'exactly one vet_notes_owner_all policy (no duplicate)',
         (select count(*) from pol where policyname = 'vet_notes_owner_all')::text,
         case when (select count(*) from pol where policyname = 'vet_notes_owner_all') = 1 then 'PASS' else 'FAIL' end

  union all
  select 4, 'family and provider policies are still in place and unchanged in shape',
         (select string_agg(policyname || ':' || cmd, ', ' order by policyname) from pol where policyname <> 'vet_notes_owner_all'),
         case when exists (select 1 from pol where policyname = 'vet_notes_family_all' and cmd = 'ALL'
                             and qual ilike '%app_user_has_pet_family(pet_id)%' and with_check ilike '%app_user_has_pet_family(pet_id)%')
               and exists (select 1 from pol where policyname = 'vet_notes_provider_read' and cmd = 'SELECT'
                             and qual ilike '%app_provider_has_grant(pet_id%medical_read%')
               and exists (select 1 from pol where policyname = 'vet_notes_provider_insert' and cmd = 'INSERT'
                             and with_check ilike '%app_provider_has_grant(pet_id%medical_write%')
               and exists (select 1 from pol where policyname = 'vet_notes_provider_section_read' and cmd = 'SELECT'
                             and qual ilike '%app_provider_has_section(pet_id%vet_notes%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'FORCE RLS is still on for vet_notes',
         (select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class
           where relnamespace = 'public'::regnamespace and relname = 'vet_notes'),
         case when exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'vet_notes'
                             and relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  select 6, 'app_owns_pet is SECURITY DEFINER with a pinned search_path and pawpi_app can execute it',
         coalesce((select 'definer=' || p.prosecdef::text || ' pawpi_app_exec=' || has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text
                     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_owns_pet' limit 1), '(missing)'),
         case when exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_owns_pet'
                             and p.prosecdef and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
                             and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp'))
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): no existing note was authored under a user who is not its pet's owner, and none lacks a pet.
  select 7, 'no existing vet_notes row has an owner different from its pet''s owner, or a missing pet',
         (select count(*) from vet_notes n join pets p on p.id = n.pet_id where p.owner_user_id <> n.owner_user_id)::text
           || ' mismatched, '
           || (select count(*) from vet_notes n where not exists (select 1 from pets p where p.id = n.pet_id))::text || ' orphaned',
         case when not exists (select 1 from vet_notes n join pets p on p.id = n.pet_id where p.owner_user_id <> n.owner_user_id)
               and not exists (select 1 from vet_notes n where not exists (select 1 from pets p where p.id = n.pet_id))
              then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord;
