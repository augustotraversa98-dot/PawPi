-- 0103_engagement_multi_caregiver_moment.sql
-- Pet Owner engagement WAVE 2 — unit E13 PR2 (Multi-caregiver daily moment, docs/pet-owner-engagement.md).
--
-- The daily moment becomes PER-PET-PER-DAY (not per-user): each caregiver (owner OR a 'family' grantee)
-- may add ONE moment for that pet per day. All of a pet's moments for a day render as ONE "day card"
-- carousel with per-author slides (the day-card endpoint + mobile component do the grouping).
--
-- The ONLY schema change: swap the daily-moment uniqueness from ONE-PER-PET-PER-DAY (0004) to
-- ONE-PER-AUTHOR-PER-PET-PER-DAY, so a second caregiver can add their own slide while the 1/caregiver/day
-- cap still holds. A solo owner is unchanged (they are the only author → still one moment per day).
--
-- ADDITIVE + idempotent. No RLS change (posts already: any-authed read + author-only write, 0021; the
-- posts route broadens the daily-moment PET gate to owner OR 'family' caregiver in code). Verify:
-- supabase/verify_0103.sql. HARNESS-ONLY THIS TICKET — hand-applied after merge.

-- Drop the per-pet-per-day daily uniqueness (0004) and replace with per-author-per-pet-per-day.
drop index if exists idx_posts_one_daily_per_pet_per_day;

create unique index if not exists idx_posts_one_daily_per_author_per_pet_per_day
  on posts (pet_id, user_id, post_date)
  where (is_daily_update = true);
