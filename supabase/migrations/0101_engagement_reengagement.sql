-- 0101_engagement_reengagement.sql
-- Pet Owner engagement WAVE 2 — unit E12 (Comeback / re-engagement loop, docs/pet-owner-engagement.md).
--
-- Reactivate lapsed owners with WARMTH, never guilt. "Lapsed" = no ring activity (walk / daily moment /
-- care log) for N owner-tz days (config, default 7). A win-back is sent on a REAL hook only (a friend's
-- recent real moment, an upcoming birthday/gotcha, or the pet's own memory) — never fabricated activity;
-- frequency-capped; one-tap opt-out. On return, a one-tap streak repair with a CONFIGURABLE grace window
-- (extends E2's ~48h repair for a returning user).
--
-- This migration adds only the plumbing:
--   1. reengagement_state    — per-pet lapse + win-back bookkeeping (cap + idempotency + opt-out).
--   2. notifications_type_check += 'winback' (the in-app win-back push category).
--   3. app_reengagement_due()— DEFINER cross-owner enumerator of lapsed pets DUE for a win-back, with the
--      REAL hook signals attached (a recently-active friend pet, birthday/adoption dates). The sender
--      connects as pawpi_app with no identity, so — like app_weekly_digest_due (0100) — it can only see
--      the cross-owner set through a DEFINER.
--   4. app_winback_repair_streak() — E2's repair with a configurable grace window (returning users).
--
-- reengagement_state ENABLE + FORCE RLS with a single own-row FOR ALL policy; app connects as pawpi_app.
-- ADDITIVE — no existing table's RLS is touched. Idempotent. Verify: supabase/verify_0101.sql.
-- HARNESS-ONLY THIS TICKET — hand-applied to Supabase after merge. Routes DEGRADE CLEANLY while absent.

-- ── 1. reengagement_state — per-pet lapse + win-back bookkeeping ────────────────
create table if not exists reengagement_state (
  pet_id            integer primary key references pets(id) on delete cascade,
  owner_user_id     integer not null references user_profiles(id) on delete cascade,
  lapsed_since      date,          -- the owner-tz day the pet was first detected lapsed (null = active)
  last_winback_sent timestamptz,   -- when the last win-back went out (frequency cap anchor)
  winback_channel   text,          -- 'email' | 'push' | 'email+push' (last send)
  winback_count     integer not null default 0,
  opted_out         boolean not null default false,  -- one-tap opt-out of win-backs
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_reengagement_state_owner
  on reengagement_state (owner_user_id);

alter table reengagement_state enable row level security;
alter table reengagement_state force row level security;

drop policy if exists reengagement_state_all on reengagement_state;
create policy reengagement_state_all on reengagement_state
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- ── 2. notifications_type_check += 'winback' ───────────────────────────────────
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined',
    'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
    'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback'
  ]::text[]));

-- ── 3. app_reengagement_due — cross-owner DEFINER enumeration of the due set ────
-- last_active_day = the most recent owner-tz day the pet had REAL ring activity (a walk, a daily moment,
-- or a care/food log). A pet is LAPSED when that day exists (it was active once) and is older than
-- p_lapsed_days before now. DUE = lapsed, not opted out, and no win-back within p_cap_days. Each row
-- carries the REAL hook signals: a friend pet's name (accepted friendship, posted a daily moment in the
-- last 7 days) and the pet's birthday / adoption date (for an upcoming-milestone hook).
create or replace function app_reengagement_due(
  p_now timestamptz, p_lapsed_days integer, p_cap_days integer, p_limit integer
)
returns table (
  owner_user_id integer,
  pet_id integer,
  pet_name text,
  tz text,
  email text,
  birthday date,
  adoption_date date,
  friend_name text,
  last_active_day date,
  today date
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      p.id as pet_id,
      p.owner_user_id,
      p.name as pet_name,
      p.birthday,
      p.adoption_date,
      coalesce(u.timezone, 'America/Buenos_Aires') as tz,
      au.email,
      (p_now at time zone coalesce(u.timezone, 'America/Buenos_Aires'))::date as today,
      greatest(
        (select max((w.start_time at time zone coalesce(u.timezone,'America/Buenos_Aires'))::date)
           from health_walk_logs w where w.pet_id = p.id and w.owner_user_id = p.owner_user_id),
        (select max(po.post_date) from posts po where po.pet_id = p.id and po.is_daily_update = true),
        (select max((f.logged_at at time zone coalesce(u.timezone,'America/Buenos_Aires'))::date)
           from health_food_logs f where f.pet_id = p.id and f.owner_user_id = p.owner_user_id)
      ) as last_active_day
    from pets p
    join user_profiles u on u.id = p.owner_user_id
    join auth_users au on au.id = u.auth_user_id
  )
  select
    b.owner_user_id,
    b.pet_id,
    b.pet_name,
    b.tz,
    b.email,
    b.birthday,
    b.adoption_date,
    (
      select fp.name
      from pet_friendships fr
      join pets fp on fp.id = case
        when fr.requester_pet_id = b.pet_id then fr.receiver_pet_id else fr.requester_pet_id end
      where fr.status = 'accepted'
        and (fr.requester_pet_id = b.pet_id or fr.receiver_pet_id = b.pet_id)
        and exists (
          select 1 from posts p2
          where p2.pet_id = fp.id and p2.is_daily_update = true
            and p2.post_date > b.today - 7
        )
      order by fp.id
      limit 1
    ) as friend_name,
    b.last_active_day,
    b.today
  from base b
  left join reengagement_state s on s.pet_id = b.pet_id
  where b.last_active_day is not null
    and b.last_active_day < b.today - p_lapsed_days
    and coalesce(s.opted_out, false) = false
    and (s.last_winback_sent is null or s.last_winback_sent < p_now - make_interval(days => p_cap_days))
  order by b.owner_user_id, b.pet_id
  limit greatest(coalesce(p_limit, 500), 1);
$$;

grant execute on function app_reengagement_due(timestamptz, integer, integer, integer) to pawpi_app;

-- ── 4. app_winback_repair_streak — E2 repair with a configurable grace window ───
-- Mirrors app_repair_care_streak (0095) but the "fresh reset" window is p_grace_days instead of the
-- fixed 48h — a returning lapsed user gets a gentle, longer window to reconnect their run. Free (no
-- paywall), one-tap. DEFINER so the math runs uniformly regardless of per-row RLS.
create or replace function app_winback_repair_streak(p_pet_id integer, p_owner_id integer, p_grace_days integer)
returns pet_streaks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row pet_streaks%rowtype;
begin
  select * into v_row from pet_streaks where pet_id = p_pet_id for update;
  if not found then
    return null;
  end if;

  -- Only when a real reset happened within the grace window.
  if v_row.reset_at is null or v_row.pre_reset_count is null
     or v_row.reset_at < now() - make_interval(days => greatest(coalesce(p_grace_days, 14), 1)) then
    return v_row;
  end if;

  v_row.current_count := v_row.pre_reset_count + v_row.current_count;
  if v_row.current_count > v_row.longest_count then
    v_row.longest_count := v_row.current_count;
  end if;

  update pet_streaks set
    current_count = v_row.current_count,
    longest_count = v_row.longest_count,
    pre_reset_count = null,
    reset_at = null,
    updated_at = now()
  where pet_id = p_pet_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function app_winback_repair_streak(integer, integer, integer) to pawpi_app;
