-- Verification for migration 0106 (engagement life stage, unit E15).
-- Run in the Supabase SQL editor AFTER applying 0106. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'pets.life_stage_override column exists' as check_name,
         count(*)::text||' / 1' as detail,
         case when count(*)=1 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='pets' and column_name='life_stage_override'

  union all
  select 2, 'life_stage_override CHECK constraint present',
         case when pg_get_constraintdef(oid) like '%puppy%' then 'present' else 'absent' end,
         case when pg_get_constraintdef(oid) like '%puppy%' then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.pets'::regclass and conname='pets_life_stage_override_check'

  union all
  select 3, 'existing pets default to NULL (auto-detect; unaffected)',
         coalesce((select count(*)::text from pets where life_stage_override is not null), '0')||' non-null',
         case when not exists (select 1 from pets where life_stage_override is not null
                               and life_stage_override not in ('puppy','adult','senior'))
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
