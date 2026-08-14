-- 0105_engagement_family_streak.sql
-- Pet Owner engagement WAVE 2 — unit E14 (Multi-pet household: the optional FAMILY streak,
-- docs/pet-owner-engagement.md).
--
-- A household-level flame that advances on days when EVERY one of the household's active dogs closed its
-- ring (recommended default, chosen with a real multi-pet account). Forgiveness-aware (banked freezes
-- bridge a missed day, like the per-pet streak E2) and OPT-IN — a belonging bonus, never a source of
-- shame (it never blames one dog for another's miss; that framing lives in the client copy).
--
-- The "household" for the family streak = the pets a user OWNS (the common two-dog family on one
-- account). Co-cared pets belong to their own owner's family streak. Keyed to owner_user_id.
--
--   1. household_streaks — one row per owner: current/longest, last_closed_day, freezes, pause + repair
--      bookkeeping, and opted_in (the streak is inert until the owner opts in).
--   2. app_advance_household_streak(owner, day) — DEFINER: when ALL of the owner's pets closed their ring
--      on `day`, advance the family streak (idempotent; forgiveness-aware). Reads pet_care_days across
--      the owner's pets → DEFINER. No-op unless opted_in.
--
-- ENABLE + FORCE RLS, own-row policy; app connects as pawpi_app. ADDITIVE + idempotent. Verify:
-- supabase/verify_0105.sql. HARNESS-ONLY THIS TICKET — hand-applied after merge. The care-ring route's
-- advance call DEGRADES CLEANLY while absent (42P01/42883 → no family streak, never a 500).

-- ── 1. household_streaks — per-owner family streak ─────────────────────────────
create table if not exists household_streaks (
  owner_user_id     integer primary key references user_profiles(id) on delete cascade,
  current_count     integer not null default 0,
  longest_count     integer not null default 0,
  last_closed_day   date,
  freezes_available integer not null default 1,
  pre_reset_count   integer,
  reset_at          timestamptz,
  paused_until      date,
  opted_in          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table household_streaks enable row level security;
alter table household_streaks force row level security;

drop policy if exists household_streaks_owner_all on household_streaks;
create policy household_streaks_owner_all on household_streaks
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- ── 2. app_advance_household_streak — advance when ALL the owner's dogs closed ──
-- Called when a pet's ring closes for `day`. If the owner opted in AND every one of their pets closed
-- its ring on `day`, advance the family flame. Idempotent (same day = no-op); a gap of non-paused missed
-- days consumes banked freezes, and only a gap wider than the bank resets (remembering pre_reset_count).
-- A non-household-close day (not all dogs closed) NEVER resets — it just doesn't advance (mirrors E2).
create or replace function app_advance_household_streak(p_owner integer, p_day date)
returns household_streaks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       household_streaks%rowtype;
  v_missed    integer;
  v_pet_count integer;
  v_all_closed boolean;
begin
  select * into v_row from household_streaks where owner_user_id = p_owner for update;
  if not found or not v_row.opted_in then
    return v_row;  -- opt-in required; inert otherwise
  end if;

  select count(*) into v_pet_count from pets where owner_user_id = p_owner;
  if v_pet_count = 0 then
    return v_row;
  end if;

  -- Household-close day = EVERY owned pet closed its ring on p_day.
  select bool_and(exists (
           select 1 from pet_care_days cd
           where cd.pet_id = p.id and cd.day = p_day and cd.ring_closed
         ))
    into v_all_closed
  from pets p where p.owner_user_id = p_owner;

  if not coalesce(v_all_closed, false) then
    return v_row;  -- not all dogs closed today → no advance (and no reset)
  end if;

  -- Idempotent / backfill guard.
  if v_row.last_closed_day is not null and p_day <= v_row.last_closed_day then
    return v_row;
  end if;

  if v_row.last_closed_day is null then
    v_row.current_count := 1;
  else
    -- Missed = days strictly between last close and today, excluding paused days.
    select count(*) into v_missed
    from generate_series(v_row.last_closed_day + 1, p_day - 1, interval '1 day') g(d)
    where not (v_row.paused_until is not null and g.d::date <= v_row.paused_until);

    if v_missed = 0 then
      v_row.current_count := v_row.current_count + 1;
    elsif v_missed <= v_row.freezes_available then
      v_row.freezes_available := v_row.freezes_available - v_missed;
      v_row.current_count := v_row.current_count + 1;
    else
      v_row.pre_reset_count := v_row.current_count;
      v_row.reset_at := now();
      v_row.current_count := 1;
    end if;
  end if;

  v_row.last_closed_day := p_day;
  if v_row.current_count > v_row.longest_count then
    v_row.longest_count := v_row.current_count;
  end if;

  update household_streaks set
    current_count = v_row.current_count,
    longest_count = v_row.longest_count,
    last_closed_day = v_row.last_closed_day,
    freezes_available = v_row.freezes_available,
    pre_reset_count = v_row.pre_reset_count,
    reset_at = v_row.reset_at,
    updated_at = now()
  where owner_user_id = p_owner
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function app_advance_household_streak(integer, date) to pawpi_app;
