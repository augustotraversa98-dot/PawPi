-- 0095_engagement_streak_forgiveness.sql
-- Unit E2 of the "Pet Owner engagement" wave (docs/pet-owner-engagement.md). The streak + FORGIVENESS
-- layer on top of the Care Ring (E1): the streak = consecutive days the ring closed, with a soft
-- landing so it never becomes anxiety. Forgiveness is shipped WITH it — an auto paw-freeze silently
-- covers a missed day, milestones bank more, and a one-tap repair restores a fresh reset. Rest/pause
-- (E1) is never a miss.
--
-- TWO additive changes, no existing table's RLS touched:
--   1. pet_streaks gains three bookkeeping columns (repair + idempotent milestone grants):
--        pre_reset_count  — the streak just before the last reset (what "repair" restores)
--        reset_at         — when that reset happened (repair is offered for ~48h)
--        last_award_count — the highest streak count already granted a milestone freeze (so a freeze
--                           is banked once per milestone, never re-granted)
--   2. Two SECURITY DEFINER helpers own the streak math (the single source of truth), granted to
--      pawpi_app:
--        app_advance_care_streak(pet, owner, day) — called when the ring CLOSES for `day`. Idempotent
--          (a second call for the same day is a no-op). Advances the streak; a gap of missed,
--          NON-EXCUSED days auto-consumes banked freezes to bridge it, and only a gap wider than the
--          freeze bank resets to 1 (remembering pre_reset_count for repair). A rest_day
--          (pet_care_days.rest_day) or a paused day (<= pet_streaks.paused_until) is EXCUSED — never a
--          miss. Milestones (7/30/100) bank a freeze, capped at 2.
--        app_repair_care_streak(pet, owner) — within ~48h of a reset, reconnect the pre-reset run
--          (current := pre_reset_count + current) and clear the repair window. One-tap, no paywall.
--      DEFINER (owner of pet_streaks/pet_care_days) so the math runs uniformly regardless of the
--      per-row RLS, mirroring app_grant_walk_credits; pinned search_path closes the hijack hole.
--
-- HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to Supabase
-- AFTER merge. Consumer code DEGRADES CLEANLY while absent (the route catches undefined_table/function
-- and returns the ring without a streak — never a 500). Idempotent. Verify: supabase/verify_0095.sql.

-- ── 1. pet_streaks repair + milestone bookkeeping (additive) ───────────────────
alter table pet_streaks add column if not exists pre_reset_count  integer;
alter table pet_streaks add column if not exists reset_at         timestamptz;
alter table pet_streaks add column if not exists last_award_count integer not null default 0;

-- ── 2a. advance the streak when the ring closes for a day ──────────────────────
create or replace function app_advance_care_streak(p_pet_id integer, p_owner_id integer, p_day date)
returns pet_streaks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     pet_streaks%rowtype;
  v_missed  integer;
begin
  -- Ensure a row exists for this pet, then lock it.
  insert into pet_streaks (pet_id, owner_user_id)
  values (p_pet_id, p_owner_id)
  on conflict (pet_id) do nothing;

  select * into v_row from pet_streaks where pet_id = p_pet_id for update;

  -- Idempotent / backfill guards: today already counted, or an older day → leave the streak as-is.
  if v_row.last_closed_day is not null and p_day <= v_row.last_closed_day then
    return v_row;
  end if;

  if v_row.last_closed_day is null then
    v_row.current_count := 1;
  else
    -- Missed = NON-excused days strictly between the last closed day and this one. A rest_day or a
    -- paused day (<= paused_until) is excused, so it never counts as a miss.
    select count(*) into v_missed
    from generate_series(v_row.last_closed_day + 1, p_day - 1, interval '1 day') g(d)
    where not (
      exists (
        select 1 from pet_care_days c
        where c.pet_id = p_pet_id and c.day = g.d::date and c.rest_day
      )
      or (v_row.paused_until is not null and g.d::date <= v_row.paused_until)
    );

    if v_missed = 0 then
      v_row.current_count := v_row.current_count + 1;
    elsif v_missed <= v_row.freezes_available then
      -- Auto paw-freeze: silently bridge the missed day(s).
      v_row.freezes_available := v_row.freezes_available - v_missed;
      v_row.current_count := v_row.current_count + 1;
    else
      -- Gap wider than the freeze bank → reset, but remember the run so repair can restore it.
      v_row.pre_reset_count := v_row.current_count;
      v_row.reset_at := now();
      v_row.current_count := 1;
    end if;
  end if;

  v_row.last_closed_day := p_day;
  if v_row.current_count > v_row.longest_count then
    v_row.longest_count := v_row.current_count;
  end if;

  -- Milestone freezes (7/30/100), banked once each, capped at 2.
  if v_row.current_count > v_row.last_award_count
     and v_row.current_count in (7, 30, 100) then
    v_row.freezes_available := least(2, v_row.freezes_available + 1);
    v_row.last_award_count := v_row.current_count;
  end if;

  update pet_streaks set
    current_count = v_row.current_count,
    longest_count = v_row.longest_count,
    last_closed_day = v_row.last_closed_day,
    freezes_available = v_row.freezes_available,
    pre_reset_count = v_row.pre_reset_count,
    reset_at = v_row.reset_at,
    last_award_count = v_row.last_award_count,
    updated_at = now()
  where pet_id = p_pet_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function app_advance_care_streak(integer, integer, date) to pawpi_app;

-- ── 2b. one-tap repair within ~48h of a reset ─────────────────────────────────
create or replace function app_repair_care_streak(p_pet_id integer, p_owner_id integer)
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

  -- Only when a real reset happened in the last 48h.
  if v_row.reset_at is null or v_row.pre_reset_count is null
     or v_row.reset_at < now() - interval '48 hours' then
    return v_row;
  end if;

  v_row.current_count := v_row.pre_reset_count + v_row.current_count;
  if v_row.current_count > v_row.longest_count then
    v_row.longest_count := v_row.current_count;
  end if;
  v_row.pre_reset_count := null;
  v_row.reset_at := null;

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

grant execute on function app_repair_care_streak(integer, integer) to pawpi_app;
