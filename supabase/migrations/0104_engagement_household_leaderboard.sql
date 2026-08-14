-- 0104_engagement_household_leaderboard.sql
-- Pet Owner engagement WAVE 2 — unit E13 PR3 (Household leaderboard, docs/pet-owner-engagement.md).
--
-- A PRIVATE-to-the-household view of each caregiver's contributions this week — moments posted, care
-- actions logged, walks logged. POSITIVE framing only ("Sofia logged 12 care actions this week 💪"),
-- a friendly "most active caregiver"; it NEVER shames the less-active co-parent (that ranking + copy
-- rule lives in the route's pure logic). Per-household opt-out if it ever creates friction.
--
-- Attribution needs NO new column: the daily moment already carries its author (posts.user_id) and every
-- health log already stores the LOGGER as owner_user_id (the route sets it to the caller — so a
-- caregiver's walk/care log is attributed to the caregiver, while the SHARED ring still counts it by
-- pet_id, 0102). This migration adds:
--   1. household_leaderboard_prefs — the per-pet (household) opt-out.
--   2. app_household_leaderboard() — DEFINER: per-member weekly contribution counts for the pet's
--      household (owner + every active caregiver). Cross-owner → DEFINER (like app_leaderboard, 0098).
--
-- ADDITIVE + idempotent. Verify: supabase/verify_0104.sql. HARNESS-ONLY THIS TICKET — hand-applied after
-- merge. The route degrades cleanly while absent (42P01/42883 → feature absent, never 500).

-- ── 1. household_leaderboard_prefs — per-pet (household) opt-out ────────────────
create table if not exists household_leaderboard_prefs (
  pet_id        integer primary key references pets(id) on delete cascade,
  owner_user_id integer not null references user_profiles(id) on delete cascade,
  opted_out     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table household_leaderboard_prefs enable row level security;
alter table household_leaderboard_prefs force row level security;

-- The OWNER manages the opt-out (own-row FOR ALL); active caregivers can READ it (household-visible).
drop policy if exists household_leaderboard_prefs_owner_all on household_leaderboard_prefs;
create policy household_leaderboard_prefs_owner_all on household_leaderboard_prefs
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

drop policy if exists household_leaderboard_prefs_caregiver_read on household_leaderboard_prefs;
create policy household_leaderboard_prefs_caregiver_read on household_leaderboard_prefs
  for select
  using (app_user_has_pet_access(pet_id));

-- ── 2. app_household_leaderboard — per-member weekly contributions (DEFINER) ────
-- Members = the pet owner + every ACTIVE caregiver (pet_caregivers). For each, count this week's
-- moments (posts.user_id), walks (health_walk_logs.owner_user_id = logger) and care actions
-- (food/medical/wellness/photo, owner_user_id = logger) in [week_start, week_start+7) in the OWNER's tz.
-- Cross-owner reads → DEFINER. Verifies the caller has pet access first. Positive framing/ranking is the
-- ROUTE's job; this only returns the honest counts.
create or replace function app_household_leaderboard(p_pet integer, p_week_start date)
returns table (
  member_user_id integer,
  username text,
  avatar_url text,
  is_owner boolean,
  moments integer,
  walks integer,
  care_actions integer,
  total integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_owner integer;
  v_tz text;
  v_ws timestamptz;
  v_we timestamptz;
begin
  select p.owner_user_id, coalesce(u.timezone, 'America/Buenos_Aires')
    into v_owner, v_tz
  from pets p join user_profiles u on u.id = p.owner_user_id
  where p.id = p_pet;
  if v_owner is null then
    return;
  end if;
  -- Caller must be the owner or an active caregiver (no cross-household leakage).
  if not (v_owner = current_app_user_id() or app_user_has_pet_access(p_pet)) then
    return;
  end if;

  v_ws := (p_week_start::timestamp) at time zone v_tz;
  v_we := ((p_week_start + 7)::timestamp) at time zone v_tz;

  return query
  with members as (
    select v_owner as uid, true as is_owner
    union
    select g.grantee_user_id, false
    from pet_caregivers g
    where g.pet_id = p_pet and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
  ),
  counts as (
    select
      m.uid,
      up.username::text as username,
      up.avatar_url::text as avatar_url,
      m.is_owner,
      (select count(*)::int from posts po
         where po.pet_id = p_pet and po.user_id = m.uid and po.is_daily_update = true
           and po.post_date >= p_week_start and po.post_date < p_week_start + 7) as moments,
      (select count(*)::int from health_walk_logs w
         where w.pet_id = p_pet and w.owner_user_id = m.uid
           and w.start_time >= v_ws and w.start_time < v_we) as walks,
      (
        (select count(*)::int from health_food_logs f
           where f.pet_id = p_pet and f.owner_user_id = m.uid and f.logged_at >= v_ws and f.logged_at < v_we)
        + (select count(*)::int from health_medical_care_logs mc
           where mc.pet_id = p_pet and mc.owner_user_id = m.uid and mc.given_at >= v_ws and mc.given_at < v_we)
        + (select count(*)::int from health_wellness_logs wl
           where wl.pet_id = p_pet and wl.owner_user_id = m.uid and wl.logged_at >= v_ws and wl.logged_at < v_we)
        + (select count(*)::int from health_photo_checks pc
           where pc.pet_id = p_pet and pc.owner_user_id = m.uid and pc.created_at >= v_ws and pc.created_at < v_we)
      ) as care_actions
    from members m
    join user_profiles up on up.id = m.uid
  )
  select
    c.uid, c.username, c.avatar_url, c.is_owner,
    c.moments, c.walks, c.care_actions,
    (c.moments + c.walks + c.care_actions) as total
  from counts c
  order by total desc, c.is_owner desc;
end;
$$;

grant execute on function app_household_leaderboard(integer, date) to pawpi_app;
