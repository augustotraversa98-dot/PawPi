-- 0150_grant_request_owner_and_caregiver_photo_ref.sql
-- Two follow-ups to 0147 / 0139, each a tightening of one INSERT policy. ADDITIVE and IDEMPOTENT; no row is changed.
--
-- 1. care_access_grants_insert (0147): the provider-staff branch (a pending request, no sections) accepted any
--    owner_user_id. It now also requires owner_user_id to be the pet's actual owner. The route
--    (POST /api/providers/[id]/access-requests) already derives the owner from the pet, so the normal path is unchanged.
--    A new helper, app_pet_owner_is(pet_id, owner_user_id), does the comparison as SECURITY DEFINER because provider
--    staff cannot see another owner's pet row through RLS. The owner branch is untouched.
--
-- 2. health_photo_checks_caregiver_insert (0139): a caregiver-role grantee's insert now also requires image_url to be a
--    private media key for THIS pet (pets/<pet_id>/<name>, the exact shape utils/mediaAccess.js produces and
--    GET /api/media serves), with no '..'. The owner and family policies are separate and unchanged, so their inserts
--    (including legacy stored URLs) behave as before. The photo-checks route returns a clear 400 for a caregiver who sends
--    anything else, so this never surfaces as a server error.
--
-- Data: both are INSERT checks, so existing rows are not evaluated. Read-only counts before applying are in the PR.
-- Function rules (CLAUDE.md): SECURITY DEFINER, pinned search_path, REVOKE from PUBLIC/anon/authenticated, GRANT to pawpi_app.
-- HAND-APPLIED after merge — supabase/verify_0150.sql (every row PASS). Proven as pawpi_app, through the real routes, in
-- test/integration/grant-request-owner-and-caregiver-photo.integration.test.ts.

-- ── 1. helper + the provider-staff branch ────────────────────────────────────────────────────────────────────────
create or replace function app_pet_owner_is(p_pet_id integer, p_owner_user_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from pets p where p.id = p_pet_id and p.owner_user_id = p_owner_user_id
  )
$$;

revoke execute on function app_pet_owner_is(integer, integer) from public;
do $$
declare r text;
begin
  -- REVOKE ... FROM a role that does not exist is a hard error; the integration harness has no anon/authenticated.
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_pet_owner_is(integer, integer) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_pet_owner_is(integer, integer) to pawpi_app;

drop policy if exists care_access_grants_insert on care_access_grants;
create policy care_access_grants_insert on care_access_grants
  for insert
  with check (
    (
      app_is_active_staff_of(provider_id)
      and requested_by = 'provider'
      and status = 'pending'
      and sections is null
      and app_pet_owner_is(pet_id, owner_user_id)
    )
    or (
      requested_by = 'owner'
      and owner_user_id = current_app_user_id()
      and pet_id in (select id from pets where owner_user_id = current_app_user_id())
    )
  );

-- ── 2. caregiver photo checks may only reference this pet's private media key ───────────────────────────────────────
drop policy if exists health_photo_checks_caregiver_insert on health_photo_checks;
create policy health_photo_checks_caregiver_insert on health_photo_checks
  for insert
  with check (
    app_user_has_pet_access(pet_id)
    and owner_user_id = (select p.owner_user_id from pets p where p.id = pet_id)
    and image_url ~ ('^pets/' || pet_id::text || '/[a-zA-Z0-9._-]+$')
    and position('..' in image_url) = 0
  );
