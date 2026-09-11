-- Verification for migration 0128 (care_access_grants active-grant unique index).
-- Run in the Supabase SQL editor AFTER applying 0128. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'uq_care_access_grants_active_provider_pet exists' as check_name,
         coalesce((select 'present' from pg_indexes
                   where schemaname = 'public'
                     and indexname = 'uq_care_access_grants_active_provider_pet'), '(missing)') as detail,
         case when exists (
           select 1 from pg_indexes
           where schemaname = 'public'
             and indexname = 'uq_care_access_grants_active_provider_pet'
         ) then 'PASS' else 'FAIL' end as status
  union all
  -- The index is only meaningful if there are no duplicate active grants left.
  select 2,
         'no duplicate pending/active grants per (provider_id, pet_id)',
         coalesce((select string_agg(provider_id || ':' || pet_id, ', ')
                   from (
                     select provider_id, pet_id
                     from care_access_grants
                     where status in ('pending', 'active')
                     group by provider_id, pet_id
                     having count(*) > 1
                   ) d), '(none)'),
         case when not exists (
           select 1 from care_access_grants
           where status in ('pending', 'active')
           group by provider_id, pet_id
           having count(*) > 1
         ) then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
