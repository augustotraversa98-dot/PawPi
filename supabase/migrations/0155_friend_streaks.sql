-- 0155_friend_streaks.sql
-- A friend's Care Ring streak, shown as a flame next to their dog's name (feed + dog profile).
--
-- ONE read-only SECURITY DEFINER function. No table, column or policy changes.
--
-- WHY DEFINER: pet_streaks, pet_care_days and pets are owner / caregiver scoped (0094, 0102, 0020), so a
-- viewer's own RLS cannot read another dog's streak. The function therefore applies every rule itself and
-- returns two columns only: the pet id that was asked about and its current streak.
--
-- RULES (all inside the function, the app is not trusted for any of them):
--   * identity comes from current_app_user_id(), never from a parameter; no identity -> no rows;
--   * only a FRIEND of one of the viewer's own dogs: the viewer's dog follows it, or the two are an
--     accepted pet_friendship, or they share an ACTIVE pack streak (0097);
--   * never a dog the viewer owns (their own flame is a separate, unchanged surface);
--   * never across a block between the two owners (user_blocks in either direction, or a friendship row
--     marked 'blocked'), and never for a banned owner;
--   * only a TRUE current streak of 7 or more.
--
-- TRUE CURRENT STREAK: pet_streaks.current_count is written only when a ring closes, so a broken streak
-- keeps a stale number. This mirrors app_advance_care_streak (0095) without writing anything: count the
-- non-excused days strictly between last_closed_day and the OWNER's local today (excused = a rest day,
-- or a day on/before paused_until); the streak is alive only while those missed days fit in the banked
-- freezes. Today is still open, so it never counts as missed. After a reset the stored count is already
-- the new run, and a repair (app_repair_care_streak) raises it again.
--
-- Takes a LIST of pet ids (one call for a whole feed page); at most the first 200 are considered.
--
-- The web app DEGRADES CLEANLY while this is absent (the endpoint answers "not available", no flames).
-- Idempotent. HAND-APPLIED after merge. Verify: supabase/verify_0155.sql (every row PASS).

create or replace function app_friend_streaks(p_pet_ids integer[])
returns table (pet_id integer, streak integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select current_app_user_id() as uid
  )
  select s.pet_id, s.current_count
  from viewer v
  join pet_streaks s on s.pet_id = any (p_pet_ids[1:200])
  join pets p on p.id = s.pet_id
  join user_profiles o on o.id = p.owner_user_id
  cross join lateral (
    select (now() at time zone coalesce(o.timezone, 'America/Buenos_Aires'))::date as today
  ) d
  where v.uid is not null
    and s.current_count >= 7
    and s.last_closed_day is not null
    and p.owner_user_id <> v.uid
    and o.banned_at is null
    -- never across a block
    and not app_user_is_blocked(v.uid, p.owner_user_id)
    and not exists (
      select 1 from pet_friendships b
      where b.status = 'blocked'
        and (
          (b.requester_user_id = v.uid and b.receiver_user_id = p.owner_user_id)
          or (b.receiver_user_id = v.uid and b.requester_user_id = p.owner_user_id)
        )
    )
    -- a friend of one of the viewer's OWN dogs
    and exists (
      select 1 from pets mine
      where mine.owner_user_id = v.uid
        and (
          exists (
            select 1 from pet_follows f
            where f.follower_pet_id = mine.id and f.followed_pet_id = p.id
          )
          or exists (
            select 1 from pet_friendships f
            where f.status = 'accepted'
              and (
                (f.requester_pet_id = mine.id and f.receiver_pet_id = p.id)
                or (f.receiver_pet_id = mine.id and f.requester_pet_id = p.id)
              )
          )
          or exists (
            select 1 from pet_pack_streaks k
            where k.status = 'active'
              and (
                (k.requester_pet_id = mine.id and k.receiver_pet_id = p.id)
                or (k.receiver_pet_id = mine.id and k.requester_pet_id = p.id)
              )
          )
        )
    )
    -- still alive: the missed (non-excused) days since the last closed ring fit in the banked freezes
    and (
      select count(*)
      from generate_series(1, d.today - s.last_closed_day - 1) as g(n)
      where not (s.paused_until is not null and s.last_closed_day + g.n <= s.paused_until)
        and not exists (
          select 1 from pet_care_days c
          where c.pet_id = s.pet_id and c.day = s.last_closed_day + g.n and c.rest_day
        )
    ) <= s.freezes_available
$$;

revoke execute on function app_friend_streaks(integer[]) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_friend_streaks(integer[]) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_friend_streaks(integer[]) to pawpi_app;
