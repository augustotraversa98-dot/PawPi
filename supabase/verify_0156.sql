-- Verification for migration 0156 (pet age from a birth date or a growing estimate). Run in the Supabase SQL editor
-- AFTER applying 0156. EVERY row should read PASS (10 rows). Read-only (catalog queries, counts and pure function
-- calls). Safe to run any number of times. verify_0099.sql, verify_0146.sql and verify_0152.sql should still read
-- PASS on every row too.
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc,
         replace(coalesce((select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'), ''), ' ', '') as sp,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
         ) as exposed,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_can
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('app_pet_age', 'app_emergency_card_json', 'app_activity_cohort')
),
cols as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'pets'
    and column_name in ('age_estimate_months', 'age_estimated_on')
),
checks as (
  select 1 as ord, 'pets has the estimate and its date: integer + date, optional, no default' as check_name,
         coalesce((select string_agg(column_name || ' ' || data_type || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '(none)'), ' | ' order by column_name) from cols), '(missing)') as detail,
         case when (select count(*) from cols where is_nullable = 'YES' and column_default is null
                      and ((column_name = 'age_estimate_months' and data_type = 'integer')
                        or (column_name = 'age_estimated_on' and data_type = 'date'))) = 2
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'the two are set together and the months are in range (validated constraint)',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.pets'::regclass and conname = 'pets_age_estimate_pair'), '(missing)'),
         case when exists (select 1 from pg_constraint
                           where conrelid = 'public.pets'::regclass and conname = 'pets_age_estimate_pair'
                             and contype = 'c' and convalidated)
              then 'PASS' else 'FAIL' end

  union all
  -- No new policy is expected: the columns are covered by the existing row policies on pets.
  select 3, 'pets still has RLS enabled and forced, with its row policies (the new columns need none of their own)',
         coalesce((select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class where oid = 'public.pets'::regclass), '(missing)')
           || ' policies=' || (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pets')::text,
         case when exists (select 1 from pg_class where oid = 'public.pets'::regclass and relrowsecurity and relforcerowsecurity)
               and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pets')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'pawpi_app can read and write the new columns; PUBLIC, anon and authenticated cannot',
         'select=' || has_column_privilege('pawpi_app', 'public.pets', 'age_estimated_on', 'SELECT')::text
           || ' update=' || has_column_privilege('pawpi_app', 'public.pets', 'age_estimated_on', 'UPDATE')::text,
         case when has_column_privilege('pawpi_app', 'public.pets', 'age_estimate_months', 'SELECT')
               and has_column_privilege('pawpi_app', 'public.pets', 'age_estimate_months', 'UPDATE')
               and has_column_privilege('pawpi_app', 'public.pets', 'age_estimated_on', 'SELECT')
               and has_column_privilege('pawpi_app', 'public.pets', 'age_estimated_on', 'UPDATE')
               and not exists (select 1 from information_schema.column_privileges
                               where table_schema = 'public' and table_name = 'pets'
                                 and column_name in ('age_estimate_months', 'age_estimated_on')
                                 and grantee in ('PUBLIC', 'anon', 'authenticated'))
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'app_pet_age: one version, not DEFINER, pinned search_path, app-only',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' ' || sp || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text, ' | ') from fn where proname = 'app_pet_age'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_pet_age') = 1
               and exists (select 1 from fn where proname = 'app_pet_age' and not prosecdef
                             and sp = 'search_path=public,pg_temp' and app_can and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'an estimate of 2 years given in November 2026 reads 3 years in November 2027',
         (select age_years || 'y ' || age_months || 'm ' || basis from app_pet_age(null, 24, date '2026-11-15', 2, 0, date '2027-11-15')),
         case when exists (select 1 from app_pet_age(null, 24, date '2026-11-15', 2, 0, date '2027-11-15')
                           where age_years = 3 and age_months = 0 and basis = 'estimate')
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'a birth date wins; a stored age with no estimate date is returned as stored',
         (select b.age_years || 'y ' || b.age_months || 'm ' || b.basis || ' / ' || s.age_years || 'y ' || s.age_months || 'm ' || s.basis
            from app_pet_age(date '2024-02-29', 120, date '2020-01-01', 10, 0, date '2025-03-01') b,
                 app_pet_age(null, null, null, 0, 18, date '2030-01-01') s),
         case when exists (select 1 from app_pet_age(date '2024-02-29', 120, date '2020-01-01', 10, 0, date '2025-03-01')
                           where age_years = 1 and age_months = 0 and basis = 'birthday')
               and exists (select 1 from app_pet_age(null, null, null, 0, 18, date '2030-01-01')
                           where age_years = 0 and age_months = 18 and basis = 'stored')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'card assembler: one version, DEFINER, pinned, app-only, ages from app_pet_age',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' ' || sp || ' exposed=' || exposed::text
                                     || ' computed=' || (prosrc like '%''age_years'', age.age_years%')::text, ' | ')
                   from fn where proname = 'app_emergency_card_json'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_emergency_card_json') = 1
               and exists (select 1 from fn where proname = 'app_emergency_card_json' and prosecdef
                             and sp = 'search_path=public,pg_temp' and app_can and not exposed
                             and prosrc like '%app_pet_age(p.birthday, p.age_estimate_months, p.age_estimated_on,%'
                             and prosrc like '%''age_years'', age.age_years%'
                             and prosrc like '%''age_months'', age.age_months%'
                             -- the 0152 addition is still there
                             and prosrc like '%case when c.contact_phone_enabled is null%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'activity cohort: DEFINER, pinned, app-only, compares computed ages',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' ' || sp || ' exposed=' || exposed::text
                                     || ' computed=' || (prosrc like '%app_pet_age(%')::text, ' | ')
                   from fn where proname = 'app_activity_cohort'), '(missing)'),
         case when (select count(*) from fn where proname = 'app_activity_cohort') = 1
               and exists (select 1 from fn where proname = 'app_activity_cohort' and prosecdef
                             and sp = 'search_path=public,pg_temp' and app_can and not exposed
                             and prosrc like '%app_pet_age(%'
                             and prosrc like '%abs(a.age_years - v_age) <= 1%'
                             and prosrc not like '%abs(p.age_years%')
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): no estimate is dated in the future.
  select 10, 'no estimate is dated after tomorrow',
         (select count(*) from pets where age_estimated_on > current_date + 1)::text || ' pet(s)',
         case when not exists (select 1 from pets where age_estimated_on > current_date + 1)
              then 'PASS' else 'FAIL' end
)
select check_name, detail, status from checks order by ord;
