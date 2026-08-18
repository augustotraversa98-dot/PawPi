-- Verification for migration 0120 (VR-B — Vet Record attribution columns + vet_notes family
-- policy). Run in the Supabase SQL editor AFTER applying 0120. EVERY row should read PASS.
with checks as (
  -- 1. created_by_user_id present on all 8 record tables.
  select 1 as ord,
         'created_by_user_id present on 8 record tables' as check_name,
         count(*)::text||' / 8' as detail,
         case when count(*)=8 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and column_name='created_by_user_id'
    and table_name in ('pet_allergies','pet_conditions','pet_surgeries','pet_lab_results',
                       'vet_notes','vet_documents','pet_vaccinations','pet_medications')

  union all
  -- 2. created_by_role present on all 8 record tables.
  select 2, 'created_by_role present on 8 record tables',
         count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and column_name='created_by_role'
    and table_name in ('pet_allergies','pet_conditions','pet_surgeries','pet_lab_results',
                       'vet_notes','vet_documents','pet_vaccinations','pet_medications')

  union all
  -- 3. created_by_role CHECK constraint present on all 8.
  select 3, 'created_by_role CHECK on 8 record tables',
         count(*)::text||' / 8',
         case when count(*)=8 then 'PASS' else 'FAIL' end
  from pg_constraint
  where contype='c' and conname like '%_created_by_role_check'
    and conrelid in ('public.pet_allergies'::regclass,'public.pet_conditions'::regclass,
                     'public.pet_surgeries'::regclass,'public.pet_lab_results'::regclass,
                     'public.vet_notes'::regclass,'public.vet_documents'::regclass,
                     'public.pet_vaccinations'::regclass,'public.pet_medications'::regclass)

  union all
  -- 4. Backfill: no existing row left without an author.
  select 4, 'no NULL created_by_user_id remain (backfilled)',
         'orphans='||(
           (select count(*) from pet_allergies where created_by_user_id is null)
         + (select count(*) from pet_conditions where created_by_user_id is null)
         + (select count(*) from pet_surgeries where created_by_user_id is null)
         + (select count(*) from pet_lab_results where created_by_user_id is null)
         + (select count(*) from vet_notes where created_by_user_id is null)
         + (select count(*) from vet_documents where created_by_user_id is null)
         + (select count(*) from pet_vaccinations where created_by_user_id is null)
         + (select count(*) from pet_medications where created_by_user_id is null)
         )::text,
         case when (
           (select count(*) from pet_allergies where created_by_user_id is null)
         + (select count(*) from pet_conditions where created_by_user_id is null)
         + (select count(*) from pet_surgeries where created_by_user_id is null)
         + (select count(*) from pet_lab_results where created_by_user_id is null)
         + (select count(*) from vet_notes where created_by_user_id is null)
         + (select count(*) from vet_documents where created_by_user_id is null)
         + (select count(*) from pet_vaccinations where created_by_user_id is null)
         + (select count(*) from pet_medications where created_by_user_id is null)
         )=0 then 'PASS' else 'FAIL' end

  union all
  -- 5. vet_notes now carries the family FOR ALL policy (Editor can add a note).
  select 5, 'vet_notes_family_all FOR ALL policy present',
         coalesce(string_agg(policyname||':'||cmd, ','),'(none)'),
         case when count(*)=1 and bool_and(cmd='ALL') then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and tablename='vet_notes' and policyname='vet_notes_family_all'

  union all
  -- 6. Guard: vet_notes owner + provider policies untouched (owner_all + provider_read + provider_insert + family_all = 4).
  select 6, 'vet_notes policy set intact (owner+provider+family)',
         coalesce(string_agg(policyname, ','),'(none)'),
         case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_policies where schemaname='public' and tablename='vet_notes'

  union all
  -- 7. Guard: the five already-family record tables still carry their 0049 family policy.
  select 7, 'five record tables keep <t>_family_all (0049)',
         count(*)::text||' / 5',
         case when count(*)=5 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname='public' and policyname like '%_family_all'
    and tablename in ('pet_allergies','pet_conditions','pet_surgeries','pet_lab_results','vet_documents')
)
select ord, check_name, detail, status from checks order by ord;
