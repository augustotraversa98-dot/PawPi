-- 0019_rls_role_helpers.sql
-- RLS hardening R2a (docs/rls-hardening.md §R2a, provider-design.md §5): the shared
-- foundation every table's policies will build on — a dedicated NON-OWNER app role
-- and the reusable identity / provider-access helper functions. NO policies on any
-- real table live here (pets policies land in 0020); this file only creates the
-- role, its least-privilege grants, and the helpers.
--
-- ⚠️ HARNESS-ONLY THIS TICKET. The integration harness (npm run test:integration)
-- runs every migration against a throwaway embedded Postgres, so this role + helpers
-- exist there and the pets policies (0020) are proven as `pawpi_app`. These
-- migrations are NOT applied to Supabase yet — R3 applies the whole R2 set at the
-- DATABASE_URL cutover to pawpi_app. Applying RLS now (while prod still connects as
-- the privileged owner and only pilot routes set identity) would make non-identity
-- routes read zero rows — an outage. See docs/rls-hardening.md.
--
-- Identity convention: app.current_user_id carries user_profiles.id (NEVER
-- auth_users.id), stamped per-request by withRequestContext (R1).

-- 1. The dedicated non-owner application role. LOGIN so R3 can point DATABASE_URL
--    at it; NOBYPASSRLS so FORCE ROW LEVEL SECURITY actually constrains it (a role
--    with BYPASSRLS would silently defeat every policy). No SUPERUSER, no CREATEDB,
--    no CREATEROLE — it can only run DML the grants below allow, never DDL.
--    CREATE ROLE has no IF NOT EXISTS form, so guard with a catalog check.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pawpi_app') then
    create role pawpi_app login password 'pawpi_app' nobypassrls;
  end if;
end
$$;

-- 2. Least-privilege grants: exactly the DML the app issues, nothing more.
--    USAGE on the schema; SELECT/INSERT/UPDATE/DELETE on tables (no TRUNCATE /
--    REFERENCES / TRIGGER, no DDL); USAGE on sequences so identity-column INSERTs
--    can draw next values. ALTER DEFAULT PRIVILEGES keeps future tables/sequences
--    (created by the owner in later migrations) covered without re-granting.
grant usage on schema public to pawpi_app;
grant select, insert, update, delete on all tables in schema public to pawpi_app;
grant usage on all sequences in schema public to pawpi_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to pawpi_app;
alter default privileges in schema public
  grant usage on sequences to pawpi_app;

-- 3. Identity helper. Reads the per-request GUC back as the caller's
--    user_profiles.id. current_setting(..., true) yields '' (not NULL) once the
--    placeholder has been defined on a connection and then reset, so nullif maps
--    both "never set" and "reset" to NULL — and an int comparison against NULL is
--    NULL (falsy), giving deny-by-default whenever no identity is in scope.
--    Pure GUC read, no table access: plain (SECURITY INVOKER) STABLE is enough.
create or replace function current_app_user_id()
returns integer
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::int
$$;

-- 4. Provider-access helpers. A row of pet data is reachable by a provider when the
--    caller is ACTIVE staff of a provider that holds the relevant relationship to
--    the pet — mirroring the app's assertCareAccess (grant path) and the booking
--    inbox (booking path) exactly, and granting no more than they already do.
--
--    ⚠️ SECURITY DEFINER (owned by the privileged migration role), STABLE, and a
--    pinned search_path. These helpers read provider_staff / care_access_grants /
--    vet_appointments, which get their OWN RLS in later R2 tickets. Running the
--    membership/grant lookup as the table owner (DEFINER) keeps it from being
--    re-filtered by those tables' future policies — which would both under-count
--    (a real grant invisible to the policy) and risk infinite policy recursion
--    (pets policy → helper → care_access_grants policy → …). The pinned
--    search_path closes the classic SECURITY DEFINER search-path-hijack hole.
--    EXECUTE is granted to pawpi_app explicitly (below) so the grant survives any
--    future REVOKE … FROM PUBLIC.

-- Active grant for (pet, provider-of-caller). scope NULL means "any active grant"
-- (pet-row visibility); a non-NULL scope additionally requires it in scopes[],
-- matching assertCareAccess's per-scope check.
create or replace function app_provider_has_grant(p_pet_id integer, p_scope text default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    join care_access_grants g
      on g.provider_id = ps.provider_id
    where ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and g.pet_id = p_pet_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and (p_scope is null or p_scope = any (g.scopes))
  )
$$;

-- Non-deleted booking for (pet, provider-of-caller). Mirrors the bookings inbox,
-- which surfaces a pet's NAME via vet_appointments to any active staff member — no
-- care grant required, deleted_at IS NULL filtered (the inbox path).
create or replace function app_provider_has_booking(p_pet_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    join vet_appointments va
      on va.provider_id = ps.provider_id
    where ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and va.pet_id = p_pet_id
      and va.deleted_at is null
  )
$$;

-- EXECUTE for the app role (explicit, so a later REVOKE FROM PUBLIC won't break it).
grant execute on function current_app_user_id() to pawpi_app;
grant execute on function app_provider_has_grant(integer, text) to pawpi_app;
grant execute on function app_provider_has_booking(integer) to pawpi_app;
