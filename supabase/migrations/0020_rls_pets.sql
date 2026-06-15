-- 0020_rls_pets.sql
-- RLS hardening R2a (docs/rls-hardening.md §R2a): ENABLE + FORCE ROW LEVEL SECURITY
-- on the `pets` table ONLY, with policies that mirror the app's CURRENT access model
-- exactly — no wider, no narrower than what the routes already enforce. Other table
-- groups (health_*, vet records, social, routines, provider tables) are later R2
-- tickets and get NO policies here.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness,
-- NOT applied to Supabase. R3 applies the whole R2 set at the role cutover. Enabling
-- FORCE RLS in prod now (privileged owner connection, only pilot routes set identity)
-- would make non-identity routes read zero rows. See docs/rls-hardening.md.
--
-- Access model (matches the routes):
--   • owner_user_id = current_app_user_id()  → the owner reads AND writes their pets
--     (GET/POST/PATCH /api/pets, /api/pets/[id] all scope `WHERE owner_user_id = me`).
--   • app_provider_has_grant(pets.id)         → a provider with an active, unexpired
--     care_access_grant READS the pet row (e.g. notes route reads pets after the
--     grant check). Providers never create/modify pets.
--   • app_provider_has_booking(pets.id)       → a provider READS the pet (name) via a
--     non-deleted booking — the inbox path, no grant required.
--
-- NOTE (follow-up, not this ticket): the public/social pet-profile read
-- (GET /api/pets/[id]/profile by id or handle) and the feed's `JOIN pets` expose a
-- LIMITED column subset of ANY pet to any signed-in user. That is broader than the
-- three predicates above and is NOT covered here — RLS is row-level, not column-
-- level. At R3 those reads would return zero rows under this policy, so reconciling
-- the social-read path (a scoped public-read predicate, a column-restricted view, or
-- a service-role read) is a tracked R2/R3 follow-up. R2a is deliberately scoped to
-- the owner + grant + booking access the pet-management routes enforce today.

alter table pets enable row level security;
alter table pets force row level security;   -- enforce even against the table owner

-- Owner: full read/write of their own pets. WITH CHECK pins INSERT/UPDATE so a row
-- can only be created/left owned by the caller (matches POST setting owner_user_id =
-- me and PATCH's `WHERE owner_user_id = me`).
drop policy if exists pets_owner_all on pets;
create policy pets_owner_all on pets
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider: READ ONLY, and only a pet they have a care grant OR a booking for.
-- Separate SELECT policy (permissive → OR'd with the owner policy for reads); no
-- INSERT/UPDATE/DELETE policy for providers, so writes by a non-owner are denied.
drop policy if exists pets_provider_read on pets;
create policy pets_provider_read on pets
  for select
  using (
    app_provider_has_grant(id)
    or app_provider_has_booking(id)
  );
