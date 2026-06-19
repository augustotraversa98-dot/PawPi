-- 0062_account_deletion.sql
-- App Store readiness (ticket 2.78): in-app ACCOUNT DELETION (Apple Guideline 5.1.1(v) — required for
-- apps with account creation). A SECURITY DEFINER fn deletes the CALLER's account + all owner-scoped
-- data irreversibly, then the route signs the user out.
--
-- How the cascade works:
--   • Deleting auth_users CASCADES (0001/0002) → auth_sessions/accounts + user_profiles → pets (0003,
--     owner FK ON DELETE CASCADE) → every owner-scoped table whose FK is ON DELETE CASCADE (health logs,
--     vet records, routines, social walks, posts, bookings, orders, etc.). FKs declared ON DELETE SET
--     NULL (e.g. staff_user_id, actor_user_id, author_user_id) simply null out — the other party's row
--     survives, which is correct (e.g. a provider's record of a past appointment).
--   • The ONLY blocker is health_medical_care_logs (0008): its owner/pet FKs have NO on-delete action,
--     so we delete those rows by owner FIRST, then the auth_users delete cascades cleanly.
--   • Provider business entities the caller owns are NOT deleted here — a `providers` row is a separate
--     entity (it may have other staff + its own data). The caller's provider_staff membership cascades
--     away with their profile. Closing/transferring an owned provider is a separate action (documented in
--     docs/app-store-readiness.md).
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app; hand-applied to Supabase AFTER merge
-- (test-backlog ACTION 1). Idempotent (CREATE OR REPLACE).

create or replace function delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  integer := current_app_user_id();
  v_auth integer;
begin
  if v_uid is null then
    return false;
  end if;

  select auth_user_id into v_auth from user_profiles where id = v_uid;
  if v_auth is null then
    -- No linked auth row (shouldn't happen) — delete the profile directly after clearing no-cascade rows.
    delete from health_medical_care_logs where owner_user_id = v_uid;
    delete from user_profiles where id = v_uid;
    return true;
  end if;

  -- Clear the no-cascade health table first so the cascading delete below doesn't hit an FK block.
  delete from health_medical_care_logs where owner_user_id = v_uid;

  -- Delete the auth identity → cascades auth_sessions/accounts + user_profiles + all owner-scoped data
  -- (ON DELETE CASCADE) and nulls out ON DELETE SET NULL references. The account can no longer log in.
  delete from auth_users where id = v_auth;
  return true;
end;
$$;

grant execute on function delete_my_account() to pawpi_app;
