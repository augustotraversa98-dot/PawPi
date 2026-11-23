-- Verification for migration 0140 (own-row policies now also require the pet to be the caller's; sharing series PR 3/7).
-- Run in the Supabase SQL editor AFTER applying 0140. EVERY row should read PASS.
-- Read-only (catalog queries only). Safe to run any number of times.
with
t(tab) as (values
  ('health_food_logs'), ('health_general_checks'), ('health_medical_care_logs'), ('health_mobility_logs'),
  ('health_pee_logs'), ('health_photo_checks'), ('health_poo_logs'), ('health_vomit_logs'), ('health_walk_logs'),
  ('health_weight_logs'), ('health_wellness_logs'), ('health_timeline_events'),
  ('pet_allergies'), ('pet_conditions'), ('pet_lab_results'), ('pet_surgeries'), ('vet_documents'),
  ('routines'), ('reminder_dismissals'), ('pet_medications'), ('pet_preventive_treatments')
),
pol as (select * from pg_policies where schemaname = 'public'),
checks as (
  select 1 as ord, 'each of the 21 tables has <t>_owner_all (FOR ALL) whose WITH CHECK requires the pet to be the caller''s' as check_name,
         (select count(*) from t join pol p on p.tablename = t.tab and p.policyname = t.tab || '_owner_all' and p.cmd = 'ALL'
            and p.with_check ilike '%owner_user_id = current_app_user_id()%' and p.with_check ilike '%app_owns_pet(pet_id)%')::text || ' / 21' as detail,
         case when (select count(*) from t join pol p on p.tablename = t.tab and p.policyname = t.tab || '_owner_all' and p.cmd = 'ALL'
                      and p.with_check ilike '%owner_user_id = current_app_user_id()%' and p.with_check ilike '%app_owns_pet(pet_id)%') = 21
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'USING is unchanged: own rows only (owner_user_id = current_app_user_id())',
         (select count(*) from t join pol p on p.tablename = t.tab and p.policyname = t.tab || '_owner_all'
            and p.qual ilike '%owner_user_id = current_app_user_id()%' and p.qual not ilike '%app_owns_pet%')::text || ' / 21',
         case when (select count(*) from t join pol p on p.tablename = t.tab and p.policyname = t.tab || '_owner_all'
                      and p.qual ilike '%owner_user_id = current_app_user_id()%' and p.qual not ilike '%app_owns_pet%') = 21
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'exactly one *_owner_all policy per table (no duplicate / stray owner policy)',
         coalesce((select string_agg(tab, ', ') from (select t.tab from t join pol p on p.tablename = t.tab and p.policyname like '%\_owner\_all' escape '\'
                   group by t.tab having count(*) <> 1) x), '(none)'),
         case when not exists (select 1 from (select t.tab from t join pol p on p.tablename = t.tab and p.policyname like '%\_owner\_all' escape '\'
                                              group by t.tab having count(*) <> 1) x)
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'FORCE RLS is still on for all 21 tables',
         (select count(*) from t join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.tab
          where c.relrowsecurity and c.relforcerowsecurity)::text || ' / 21',
         case when (select count(*) from t join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.tab
                    where c.relrowsecurity and c.relforcerowsecurity) = 21 then 'PASS' else 'FAIL' end

  union all
  select 5, 'the helper exists as SECURITY DEFINER with a pinned search_path and pawpi_app can execute it',
         coalesce((select 'definer=' || p.prosecdef::text || ' pawpi_app_exec=' || has_function_privilege('pawpi_app', p.oid, 'EXECUTE')::text
                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_owns_pet' limit 1), '(missing)'),
         case when exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_owns_pet'
                           and p.prosecdef and has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
                           and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where replace(c, ' ', '') = 'search_path=public,pg_temp'))
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (read-only): nothing in these tables is authored by someone other than the pet's owner.
  select 6, 'no existing row in the 21 tables was authored by a user who does not own its pet (so tightening cannot orphan data)',
         (select count(*) from (
            select owner_user_id, pet_id from health_food_logs union all select owner_user_id, pet_id from health_general_checks
            union all select owner_user_id, pet_id from health_medical_care_logs union all select owner_user_id, pet_id from health_mobility_logs
            union all select owner_user_id, pet_id from health_pee_logs union all select owner_user_id, pet_id from health_photo_checks
            union all select owner_user_id, pet_id from health_poo_logs union all select owner_user_id, pet_id from health_vomit_logs
            union all select owner_user_id, pet_id from health_walk_logs union all select owner_user_id, pet_id from health_weight_logs
            union all select owner_user_id, pet_id from health_wellness_logs union all select owner_user_id, pet_id from health_timeline_events
            union all select owner_user_id, pet_id from pet_allergies union all select owner_user_id, pet_id from pet_conditions
            union all select owner_user_id, pet_id from pet_lab_results union all select owner_user_id, pet_id from pet_surgeries
            union all select owner_user_id, pet_id from vet_documents union all select owner_user_id, pet_id from routines
            union all select owner_user_id, pet_id from reminder_dismissals union all select owner_user_id, pet_id from pet_medications
            union all select owner_user_id, pet_id from pet_preventive_treatments
          ) r join pets p on p.id = r.pet_id where p.owner_user_id <> r.owner_user_id)::text || ' mismatched row(s)',
         case when not exists (select 1 from (
            select owner_user_id, pet_id from health_food_logs union all select owner_user_id, pet_id from health_general_checks
            union all select owner_user_id, pet_id from health_medical_care_logs union all select owner_user_id, pet_id from health_mobility_logs
            union all select owner_user_id, pet_id from health_pee_logs union all select owner_user_id, pet_id from health_photo_checks
            union all select owner_user_id, pet_id from health_poo_logs union all select owner_user_id, pet_id from health_vomit_logs
            union all select owner_user_id, pet_id from health_walk_logs union all select owner_user_id, pet_id from health_weight_logs
            union all select owner_user_id, pet_id from health_wellness_logs union all select owner_user_id, pet_id from health_timeline_events
            union all select owner_user_id, pet_id from pet_allergies union all select owner_user_id, pet_id from pet_conditions
            union all select owner_user_id, pet_id from pet_lab_results union all select owner_user_id, pet_id from pet_surgeries
            union all select owner_user_id, pet_id from vet_documents union all select owner_user_id, pet_id from routines
            union all select owner_user_id, pet_id from reminder_dismissals union all select owner_user_id, pet_id from pet_medications
            union all select owner_user_id, pet_id from pet_preventive_treatments
          ) r join pets p on p.id = r.pet_id where p.owner_user_id <> r.owner_user_id)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
