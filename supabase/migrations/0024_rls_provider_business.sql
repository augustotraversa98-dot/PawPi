-- 0024_rls_provider_business.sql
-- RLS hardening R2e (docs/rls-hardening.md §R2e, provider-design.md §1/§5): the
-- PROVIDER / BUSINESS entity tables — providers, provider_staff, provider_services,
-- provider_locations, provider_reviews. The fourth access shape, distinct from R2b
-- (public-read social), R2c (owner-only private) and R2d (provider-accessible
-- medical): access is by provider-STAFF MEMBERSHIP (active staff, admin, or the
-- business owner), with a public-read window for PUBLISHED discovery data. Mirrors
-- the routes EXACTLY — no wider (read directly to pin each predicate):
--   providers          — SELECT: published (discovery, any authed) OR active staff
--                          (management read incl. draft);
--                        INSERT: owner_user_profile_id = me (the creator owns it);
--                        UPDATE: owner|admin (profile PATCH + publish);
--                        DELETE: owner only (no provider-delete route — safe default).
--   provider_staff     — SELECT: active staff of the provider OR my own row (powers
--                          /provider-invites: an invited/removed user sees their row);
--                        INSERT: BOOTSTRAP (the create CTE's owner row) OR INVITE
--                          (owner|admin invites admin/staff/vet — see below);
--                        UPDATE: my own row (invitee self-accept) OR owner|admin
--                          (role change / soft-remove);
--                        DELETE: none (remove is a soft UPDATE; no hard-delete route).
--   provider_services  — SELECT: active staff OR (active service of a PUBLISHED
--                          provider — the public profile); writes: owner|admin.
--   provider_locations — SELECT: active staff OR any location of a PUBLISHED provider
--                          (public profile returns all locations); writes: owner|admin.
--   provider_reviews   — owner(reviewer)-scoped FOR ALL (no read/write route surfaces
--                          reviews today — safe default so the table isn't un-policied
--                          under FORCE). When reviews-surfacing ships (public read of a
--                          provider's reviews), THAT feature updates this SELECT policy.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness,
-- NOT applied to Supabase. R3 applies the whole accumulated R2 set at the DATABASE_URL
-- cutover to pawpi_app. Enabling FORCE RLS in prod now (privileged owner connection,
-- only pilot routes set identity) would make non-identity routes read zero rows — an
-- outage. See docs/rls-hardening.md.
--
-- DML + sequence grants for all five tables are ALREADY provided by 0019's blanket
-- `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES`:
-- every table predates 0019 (all five land in 0014), so the blanket grant at 0019 time
-- covered them — exactly as pets (0020) / social (0021) / owner-private (0022) /
-- provider-records (0023) relied on. No per-table re-grant; the as-pawpi_app test is
-- the proof the grants suffice.
--
-- ⚠️ RECURSION: the SECURITY DEFINER helpers (0019's app_provider_has_grant /
-- app_provider_has_booking, 0023's app_is_active_staff_of, and the two added below)
-- all READ provider_staff. Once provider_staff is FORCE-RLS'd here, those helpers must
-- still bypass that RLS — which they do, being SECURITY DEFINER owned by the privileged
-- migration role (DEFINER runs with the owner's rights, not the caller's NOBYPASSRLS
-- role). The full R2a–R2d integration suite exercises the helpers against
-- pets/medical/appointments, so a green suite after this migration is the recursion
-- re-proof (a broken/​recursing provider_staff RLS would turn those tests red).

-- ─────────────────────────────────────────────────────────────────────────────
-- New helpers. Both SECURITY DEFINER + pinned search_path + STABLE, matching 0019's
-- provider helpers and for the same reason: they read provider_staff, which gets its
-- RLS in THIS migration, so running them as the owner (DEFINER) keeps them from being
-- re-filtered by provider_staff's own policy (under-count) and avoids policy recursion
-- (a provider_staff policy → helper → provider_staff policy → … is exactly what
-- Postgres rejects with "infinite recursion detected in policy"). EXECUTE granted to
-- pawpi_app explicitly so a future REVOKE … FROM PUBLIC is safe.

-- Owner|admin membership of a provider, mirroring requireProviderRole's DEFAULT gate
-- (owner|admin) used by every provider WRITE route (PATCH/publish, services/locations
-- writes, staff invite + role-change/remove).
create or replace function app_is_provider_admin(p_provider_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    where ps.provider_id = p_provider_id
      and ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and ps.role in ('owner', 'admin')
  )
$$;

-- Does a provider already have ANY active staff? Used ONLY by the provider_staff
-- INSERT bootstrap branch (below) to distinguish "claiming the owner row of a
-- brand-new provider I am creating" from "attaching myself as owner to someone else's
-- existing provider". A brand-new provider has no active staff yet → bootstrap allowed;
-- an established provider always has ≥1 active staff (its owner, which the routes never
-- let you remove) → bootstrap denied. SECURITY DEFINER so it bypasses provider_staff's
-- own RLS (no recursion) — and the membership-absence semantics are snapshot-safe (see
-- the bootstrap comment for why ownership-by-EXISTS would NOT be).
create or replace function app_provider_has_active_staff(p_provider_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    where ps.provider_id = p_provider_id
      and ps.status = 'active'
  )
$$;

grant execute on function app_is_provider_admin(integer) to pawpi_app;
grant execute on function app_provider_has_active_staff(integer) to pawpi_app;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. providers — per-command (writes differ: create=owner, edit=admin, delete=owner).
alter table providers enable row level security;
alter table providers force row level security;

-- SELECT: published (discovery — any authed, identity-independent so the public
-- business view works) OR the business owner OR active staff of the provider
-- (management read incl. draft). The owner_user_profile_id branch is NOT redundant
-- with active-staff: the providers-create CTE's `RETURNING *` (and the final
-- `SELECT * FROM new_provider`) applies THIS SELECT policy to the brand-new DRAFT row
-- in the SAME statement, where the creator's owner provider_staff row is not yet
-- visible (data-modifying CTEs share one snapshot) — so app_is_active_staff_of(id) is
-- still false. owner_user_profile_id lives ON the providers row the INSERT just set, so
-- it is the only branch that lets the creator read back their own draft provider. In
-- steady state the owner is also active staff, so this grants no read the routes don't.
drop policy if exists providers_select on providers;
create policy providers_select on providers
  for select
  using (
    status = 'published'
    or owner_user_profile_id = current_app_user_id()
    or app_is_active_staff_of(id)
  );

-- INSERT: the creator owns the row (providers POST sets owner_user_profile_id = me).
drop policy if exists providers_insert on providers;
create policy providers_insert on providers
  for insert
  with check (owner_user_profile_id = current_app_user_id());

-- UPDATE: owner|admin (profile PATCH + publish). WITH CHECK defaults to USING; neither
-- route changes id, so app_is_provider_admin(id) holds for the new row too.
drop policy if exists providers_update on providers;
create policy providers_update on providers
  for update
  using (app_is_provider_admin(id));

-- DELETE: owner only. No provider-delete route exists — this is a safe default so the
-- command isn't left un-policied (un-policied + FORCE = nobody, which is also safe, but
-- owner-scoped matches the entity-ownership model).
drop policy if exists providers_delete on providers;
create policy providers_delete on providers
  for delete
  using (owner_user_profile_id = current_app_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. provider_staff — per-command. THIS table feeds the DEFINER helpers, so its
--    policies must never query provider_staff except via those helpers.
alter table provider_staff enable row level security;
alter table provider_staff force row level security;

-- SELECT: active staff of the provider (the staff-list reads) OR my own row (an
-- invited/removed user reads their own membership → powers GET /provider-invites and
-- the accept route's pre-state).
drop policy if exists provider_staff_select on provider_staff;
create policy provider_staff_select on provider_staff
  for select
  using (
    app_is_active_staff_of(provider_id)
    or user_profile_id = current_app_user_id()
  );

-- INSERT: two mutually-exclusive shapes.
--   (a) BOOTSTRAP — the providers-create CTE inserts the creator's OWNER row in the
--       SAME statement as the providers row. The owner row's WITH CHECK CANNOT verify
--       "this provider is owned by me" by selecting the providers row: data-modifying
--       CTEs share one snapshot, so the sibling providers INSERT is NOT visible here
--       (and providers' own SELECT RLS would hide a just-created DRAFT row anyway). So
--       the gate is membership-ABSENCE, which IS snapshot-safe: a brand-new provider
--       has no active staff yet (the only invisible row is the one we're inserting),
--       while an existing provider always has its (unremovable) owner → a bare
--       owner-insert against someone else's provider is rejected. Self only
--       (user_profile_id = me) and role = 'owner'.
--   (b) INVITE — an owner|admin invites a user as admin/staff/vet (the staff route's
--       INVITABLE_ROLES; 'owner' is never invitable — no ownership transfer in the MVP).
drop policy if exists provider_staff_insert on provider_staff;
create policy provider_staff_insert on provider_staff
  for insert
  with check (
    (
      user_profile_id = current_app_user_id()
      and role = 'owner'
      and not app_provider_has_active_staff(provider_id)
    )
    or (
      app_is_provider_admin(provider_id)
      and role in ('admin', 'staff', 'vet')
    )
  );

-- UPDATE: my own row (invitee self-accept flips invited→active/removed) OR owner|admin
-- (role change / soft-remove). WITH CHECK defaults to USING — both branches hold for the
-- new row (the accept path leaves user_profile_id = me; the admin path leaves the row's
-- provider_id, so app_is_provider_admin still holds). No hard-DELETE policy: removal is
-- a soft UPDATE (status='removed'), and there is no hard-delete route, so DELETE is
-- denied by default.
drop policy if exists provider_staff_update on provider_staff;
create policy provider_staff_update on provider_staff
  for update
  using (
    user_profile_id = current_app_user_id()
    or app_is_provider_admin(provider_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. provider_services — two-tier (R2d shape): admin FOR ALL + a public-read FOR
--    SELECT. Permissive policies OR per command, so writes stay owner|admin while the
--    read widens to the public for active services of a published provider.
alter table provider_services enable row level security;
alter table provider_services force row level security;

-- Writes (INSERT/UPDATE/DELETE) + the staff read: owner|admin. The DELETE route is a
-- soft UPDATE (active=false), but the real DELETE command is policied admin too.
drop policy if exists provider_services_admin_all on provider_services;
create policy provider_services_admin_all on provider_services
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));

-- SELECT: active staff (the management GET returns ALL services incl. inactive) OR an
-- ACTIVE service of a PUBLISHED provider (the public /providers/public/[slug] profile,
-- which filters active=true). The providers EXISTS runs under providers' SELECT RLS —
-- a published provider is visible there, so no DEFINER helper is needed.
drop policy if exists provider_services_read on provider_services;
create policy provider_services_read on provider_services
  for select
  using (
    app_is_active_staff_of(provider_id)
    or (
      active = true
      and exists (
        select 1 from providers p
        where p.id = provider_id and p.status = 'published'
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. provider_locations — two-tier, same as services. The public profile returns ALL
--    locations of a published provider (no active filter on locations).
alter table provider_locations enable row level security;
alter table provider_locations force row level security;

-- Writes + staff read: owner|admin. Locations DELETE is a HARD delete by admin.
drop policy if exists provider_locations_admin_all on provider_locations;
create policy provider_locations_admin_all on provider_locations
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));

-- SELECT: active staff OR any location of a PUBLISHED provider (public profile).
drop policy if exists provider_locations_read on provider_locations;
create policy provider_locations_read on provider_locations
  for select
  using (
    app_is_active_staff_of(provider_id)
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. provider_reviews — owner(reviewer)-scoped FOR ALL. No route reads or writes
--    reviews today (reviews-surfacing is deferred), so a single owner_user_id-scoped
--    policy keeps the table from being un-policied under FORCE without granting any
--    access the routes don't. FUTURE: when reviews-surfacing ships (public read of a
--    provider's reviews), THAT feature's ticket adds a FOR SELECT public-read policy.
alter table provider_reviews enable row level security;
alter table provider_reviews force row level security;

drop policy if exists provider_reviews_owner_all on provider_reviews;
create policy provider_reviews_owner_all on provider_reviews
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());
