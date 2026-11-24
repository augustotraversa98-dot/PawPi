-- ROLLBACK for migration 0142 (sharing lifecycle). Run in the Supabase SQL editor. Idempotent.
--
-- WHAT IT DOES: drops leave_pet_caregiver() and app_delete_my_account(), and restores delete_my_account() to the 0062 body
-- (account deletion deletes everything the member wrote on shared pets again; nothing is anonymised).
-- WHAT IT DELIBERATELY KEEPS: the widened status / audit-action / notification-type CHECKs and the extra pet_caregivers columns
-- (left_at, last_notified_at, resend_count). They are harmless supersets, and removing them would have to delete or rewrite real rows
-- ('left' grants, sharing notifications). Rows already marked 'left' simply stay 'left' (not live, history preserved).
-- Effect on the app after rolling back: leave/resend answer a friendly 503 `sharing_lifecycle_unavailable`; account deletion falls back
-- to the old cascade; invite/accept/revoke notifications keep working (their types are still allowed).
-- Anonymous "Former member" profiles already created are NOT removed (they own preserved posts/attribution).
-- To confirm: supabase/verify_0142.sql should now FAIL rows 5-7. To re-apply, run 0142 again.
drop function if exists leave_pet_caregiver(integer);
drop function if exists app_delete_my_account(boolean);

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
    delete from health_medical_care_logs where owner_user_id = v_uid;
    delete from user_profiles where id = v_uid;
    return true;
  end if;

  delete from health_medical_care_logs where owner_user_id = v_uid;
  delete from auth_users where id = v_auth;
  return true;
end;
$$;

revoke execute on function delete_my_account() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function delete_my_account() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function delete_my_account() to pawpi_app;
