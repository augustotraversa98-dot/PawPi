-- 0023_rls_provider_records.sql
-- RLS hardening R2d (docs/rls-hardening.md §R2d, provider-design.md §3 assertCareAccess
-- + §5): the PROVIDER-ACCESSIBLE MEDICAL records + the bookings table. This is the
-- group where provider access is real, so — unlike the owner-only private group (R2c)
-- and the public-read social group (R2b) — READ and WRITE scopes DIFFER per table and
-- the policies are split per command. The owner is ALWAYS allowed (a FOR ALL owner
-- policy); a provider gets only the narrow command(s) the routes actually expose, via
-- the SECURITY DEFINER helpers. Everything else is denied by default.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness,
-- NOT applied to Supabase. R3 applies the whole accumulated R2 set at the DATABASE_URL
-- cutover to pawpi_app. Enabling FORCE RLS in prod now (privileged owner connection,
-- only pilot routes set identity) would make non-identity routes read zero rows — an
-- outage. See docs/rls-hardening.md.
--
-- The access model mirrors the routes EXACTLY (read directly to pin each predicate):
--   pet_medical_profiles  — SELECT: owner OR grant(medical_read); writes: owner only
--                           (no provider route writes this table; the record route
--                           only SELECTs it).
--   vet_notes             — SELECT: owner OR grant(medical_read);
--                           INSERT: owner OR grant(medical_write)  ← notes route;
--                           UPDATE/DELETE: owner only (notes route is INSERT-only).
--   pet_vaccinations      — SELECT: owner OR grant(medical_read);
--                           INSERT: owner OR grant(vaccinations_write) ← vaccinations
--                           route; UPDATE/DELETE: owner only. (The owner write-through
--                           path — the medical-care-logs reconciliation that inserts
--                           pet_vaccinations in OWNER context — is the owner INSERT
--                           branch; it is NOT broken.)
--   vet_appointments      — HYBRID: provider access is by STAFF MEMBERSHIP of the
--                           row's provider_id (the booking inbox/actions authorize with
--                           requireProviderRole/ALL_PROVIDER_ROLES — active staff, NOT a
--                           care grant). SELECT: owner OR active-staff-of(provider_id);
--                           UPDATE: owner OR active-staff-of(provider_id); INSERT:
--                           owner only (owner books; the provider_id on the row is the
--                           TARGET provider); DELETE: owner only (providers cancel via
--                           a booking_status UPDATE, they never delete).
--
-- The owner-allowed half of every table is a single FOR ALL owner policy (USING +
-- WITH CHECK owner_user_id = current_app_user_id()); permissive policies OR together
-- per command, so adding a provider FOR SELECT / FOR INSERT / FOR UPDATE policy widens
-- ONLY that command for the provider and leaves the others owner-only. This is the same
-- two-tier shape as pets (0020): one owner FOR ALL + narrow provider command policies.
--
-- DML + sequence grants for these four tables are ALREADY provided by 0019's blanket
-- `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES`:
-- all four predate 0019 (pet_medical_profiles / vet_notes / vet_appointments in 0005,
-- pet_vaccinations + the vet_appointments booking columns in 0016), so the blanket
-- grant at 0019 time covered them — exactly as pets (0020) / social (0021) /
-- owner-private (0022) relied on. No per-table re-grant here; the as-pawpi_app
-- integration test is the proof the grants suffice.

-- ─────────────────────────────────────────────────────────────────────────────
-- New helper: active-staff membership of a provider, mirroring requireProviderRole's
-- active-staff check (ALL_PROVIDER_ROLES) for the booking paths. SECURITY DEFINER +
-- pinned search_path + STABLE, matching 0019's provider helpers: the lookup reads
-- provider_staff, which gets its OWN RLS in R2e, so running it as the owner (DEFINER)
-- keeps it from being re-filtered by that future policy (under-count) and avoids
-- policy recursion (vet_appointments policy → helper → provider_staff policy → …).
-- It is the booking analogue of app_provider_has_grant: NO care grant required — any
-- active staff member of the provider, exactly like the inbox route.
create or replace function app_is_active_staff_of(p_provider_id integer)
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
  )
$$;

-- EXECUTE for the app role (explicit, so a later REVOKE FROM PUBLIC won't break it).
grant execute on function app_is_active_staff_of(integer) to pawpi_app;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pet_medical_profiles — owner read/write; provider READ ONLY via medical_read.
alter table pet_medical_profiles enable row level security;
alter table pet_medical_profiles force row level security;

drop policy if exists pet_medical_profiles_owner_all on pet_medical_profiles;
create policy pet_medical_profiles_owner_all on pet_medical_profiles
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

drop policy if exists pet_medical_profiles_provider_read on pet_medical_profiles;
create policy pet_medical_profiles_provider_read on pet_medical_profiles
  for select
  using (app_provider_has_grant(pet_id, 'medical_read'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vet_notes — owner read/write; provider READ via medical_read + INSERT via
--    medical_write (the notes route). No provider UPDATE/DELETE (route is INSERT-only).
alter table vet_notes enable row level security;
alter table vet_notes force row level security;

drop policy if exists vet_notes_owner_all on vet_notes;
create policy vet_notes_owner_all on vet_notes
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

drop policy if exists vet_notes_provider_read on vet_notes;
create policy vet_notes_provider_read on vet_notes
  for select
  using (app_provider_has_grant(pet_id, 'medical_read'));

drop policy if exists vet_notes_provider_insert on vet_notes;
create policy vet_notes_provider_insert on vet_notes
  for insert
  with check (app_provider_has_grant(pet_id, 'medical_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pet_vaccinations — owner read/write; provider READ via medical_read + INSERT via
--    vaccinations_write (the vaccinations route). No provider UPDATE/DELETE.
alter table pet_vaccinations enable row level security;
alter table pet_vaccinations force row level security;

drop policy if exists pet_vaccinations_owner_all on pet_vaccinations;
create policy pet_vaccinations_owner_all on pet_vaccinations
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

drop policy if exists pet_vaccinations_provider_read on pet_vaccinations;
create policy pet_vaccinations_provider_read on pet_vaccinations
  for select
  using (app_provider_has_grant(pet_id, 'medical_read'));

drop policy if exists pet_vaccinations_provider_insert on pet_vaccinations;
create policy pet_vaccinations_provider_insert on pet_vaccinations
  for insert
  with check (app_provider_has_grant(pet_id, 'vaccinations_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. vet_appointments — HYBRID. Owner read/write/book/delete; provider (active staff
--    of the row's provider_id) SELECT (inbox) + UPDATE (confirm/decline/cancel/assign
--    booking_status). Provider never INSERTs (owner books) or DELETEs (cancel = an
--    UPDATE). Access is by STAFF MEMBERSHIP, NOT a care grant.
alter table vet_appointments enable row level security;
alter table vet_appointments force row level security;

drop policy if exists vet_appointments_owner_all on vet_appointments;
create policy vet_appointments_owner_all on vet_appointments
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

drop policy if exists vet_appointments_provider_read on vet_appointments;
create policy vet_appointments_provider_read on vet_appointments
  for select
  using (app_is_active_staff_of(provider_id));

-- FOR UPDATE with no WITH CHECK reuses the USING expression for the new row too
-- (provider_id is unchanged by the booking actions, so staff-of-provider_id holds for
-- both old and new). Owner UPDATE stays covered by the FOR ALL owner policy above.
drop policy if exists vet_appointments_provider_update on vet_appointments;
create policy vet_appointments_provider_update on vet_appointments
  for update
  using (app_is_active_staff_of(provider_id));
