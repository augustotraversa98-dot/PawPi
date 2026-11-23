-- Verification for migration 0139 (grantee read + caregiver append-only logging; sharing series PR 3/7).
-- Run in the Supabase SQL editor AFTER applying 0139. EVERY row should read PASS.
-- Read-only (catalog queries only). Safe to run any number of times.
with
log_t(t) as (values
  ('health_food_logs'), ('health_general_checks'), ('health_medical_care_logs'), ('health_mobility_logs'),
  ('health_pee_logs'), ('health_photo_checks'), ('health_poo_logs'), ('health_vomit_logs'), ('health_walk_logs'),
  ('health_weight_logs'), ('health_wellness_logs'), ('health_timeline_events')
),
ro_t(t) as (values
  ('pet_medications'), ('pet_preventive_treatments'), ('pet_allergies'), ('pet_conditions'), ('pet_emergency_cards')
),
private_t(t) as (values
  ('vet_documents'), ('vet_notes'), ('pet_lab_results'), ('pet_surgeries'), ('pet_vaccinations'),
  ('vet_appointments'), ('prescriptions')
),
pol as (select * from pg_policies where schemaname = 'public'),
checks as (
  select 1 as ord, 'every log table has <t>_grantee_read (SELECT) gated on app_user_has_pet_access' as check_name,
         (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_grantee_read'
            and p.cmd = 'SELECT' and p.qual ilike '%app_user_has_pet_access(pet_id)%')::text || ' / 12' as detail,
         case when (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_grantee_read'
                      and p.cmd = 'SELECT' and p.qual ilike '%app_user_has_pet_access(pet_id)%') = 12 then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'every log table has <t>_caregiver_insert (INSERT) with the access gate AND the owner anchor',
         (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_caregiver_insert'
            and p.cmd = 'INSERT' and p.with_check ilike '%app_user_has_pet_access(pet_id)%'
            and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%')::text || ' / 12',
         case when (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_caregiver_insert'
                      and p.cmd = 'INSERT' and p.with_check ilike '%app_user_has_pet_access(pet_id)%'
                      and p.with_check ilike '%owner_user_id%' and p.with_check ilike '%pets%') = 12 then 'PASS' else 'FAIL' end

  union all
  select 3, 'append-only for a caregiver: NO update/delete/all policy on the log tables is gated on the any-grantee helper',
         coalesce((select string_agg(p.tablename || '.' || p.policyname, ', ')
                   from log_t l join pol p on p.tablename = l.t
                   where p.cmd in ('UPDATE', 'DELETE', 'ALL') and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%')),
                  '(none)'),
         case when not exists (select 1 from log_t l join pol p on p.tablename = l.t
                               where p.cmd in ('UPDATE', 'DELETE', 'ALL')
                                 and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%'))
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'meds / emergency-picture tables have <t>_grantee_read (SELECT)',
         (select count(*) from ro_t r join pol p on p.tablename = r.t and p.policyname = r.t || '_grantee_read'
            and p.cmd = 'SELECT' and p.qual ilike '%app_user_has_pet_access(pet_id)%')::text || ' / 5',
         case when (select count(*) from ro_t r join pol p on p.tablename = r.t and p.policyname = r.t || '_grantee_read'
                      and p.cmd = 'SELECT' and p.qual ilike '%app_user_has_pet_access(pet_id)%') = 5 then 'PASS' else 'FAIL' end

  union all
  select 5, 'those 5 tables give the any-grantee helper NO write policy',
         coalesce((select string_agg(p.tablename || '.' || p.policyname, ', ')
                   from ro_t r join pol p on p.tablename = r.t
                   where p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                     and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%')), '(none)'),
         case when not exists (select 1 from ro_t r join pol p on p.tablename = r.t
                               where p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                                 and (p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%'))
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'FORCE RLS is on every one of the 17 tables',
         (select count(*) from (select t from log_t union all select t from ro_t) x
          join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = x.t
          where c.relrowsecurity and c.relforcerowsecurity)::text || ' / 17',
         case when (select count(*) from (select t from log_t union all select t from ro_t) x
                    join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = x.t
                    where c.relrowsecurity and c.relforcerowsecurity) = 17 then 'PASS' else 'FAIL' end

  union all
  select 7, 'private vet records stay closed to caregivers: no policy on them uses the any-grantee helper',
         coalesce((select string_agg(p.tablename || '.' || p.policyname, ', ')
                   from private_t v join pol p on p.tablename = v.t
                   where p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%'), '(none)'),
         case when not exists (select 1 from private_t v join pol p on p.tablename = v.t
                               where p.qual ilike '%app_user_has_pet_access%' or p.with_check ilike '%app_user_has_pet_access%')
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'the 0049 family policies are intact on the log tables (<t>_family_all, FOR ALL)',
         (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_family_all' and p.cmd = 'ALL')::text || ' / 12',
         case when (select count(*) from log_t l join pol p on p.tablename = l.t and p.policyname = l.t || '_family_all' and p.cmd = 'ALL') = 12
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
