-- Verification for migration 0103 (multi-caregiver daily moment, unit E13 PR2).
-- Run in the Supabase SQL editor AFTER applying 0103. EVERY row should read PASS.
with checks as (
  select 1 as ord, 'old per-pet-per-day daily index is gone' as check_name,
         count(*)::text||' / 0' as detail,
         case when count(*)=0 then 'PASS' else 'FAIL' end as status
  from pg_indexes
  where schemaname='public' and indexname='idx_posts_one_daily_per_pet_per_day'

  union all
  select 2, 'new per-author-per-pet-per-day daily index exists',
         count(*)::text||' / 1',
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_indexes
  where schemaname='public' and indexname='idx_posts_one_daily_per_author_per_pet_per_day'

  union all
  select 3, 'new index is UNIQUE + partial on is_daily_update',
         coalesce((select case when indexdef ilike '%unique%' and indexdef ilike '%is_daily_update%'
                          then 'unique+partial' else 'wrong' end
                   from pg_indexes where schemaname='public'
                     and indexname='idx_posts_one_daily_per_author_per_pet_per_day'), 'missing'),
         case when exists (
           select 1 from pg_indexes where schemaname='public'
             and indexname='idx_posts_one_daily_per_author_per_pet_per_day'
             and indexdef ilike '%unique%' and indexdef ilike '%is_daily_update%'
         ) then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
