-- 0141_family_write_policies.sql
-- Family-sharing series PR 3b (docs/family-sharing-audit-2026-11.md; owner decision 2 of 2026-11-23): a FAMILY grantee (co-owner) can
-- read AND write meds, preventive care, vaccines, appointments and the medical profile of the shared dog. A CAREGIVER still cannot
-- (nothing here is gated on the any-grantee helper). Managing sharing and deleting the pet stay owner-only (not touched).
--
-- WHAT. Purely ADDITIVE permissive policies (they OR with the existing owner / provider policies, so nobody loses anything):
--   1. <t>_family_all  FOR ALL on pet_medications, pet_preventive_treatments, pet_vaccinations, vet_appointments:
--        USING (app_user_has_pet_family(pet_id))
--        WITH CHECK (app_user_has_pet_family(pet_id) AND owner_user_id = the pet's owner)
--      The WITH CHECK ties the row to the pet's OWNER (the household anchor), so a family member can never stamp a row to themselves
--      or someone else — stricter than the older 0049 family policies, which only check the pet.
--   2. pet_medical_profiles_family_insert  FOR INSERT, same check — 0049 gave family UPDATE on the profile but not the first-time INSERT.
--   Already in place and unchanged: pets_family_update + the owner-transfer trigger (pet profile), routines_family_write,
--   pet_medical_profiles_family_update (all 0049).
-- The helper app_user_has_pet_family (0049) is SECURITY DEFINER with a pinned search_path and the REVOKE/GRANT pair; no function is
-- created here. Revoked, declined, pending and expired grants return false, so they lose write access on the very next statement.
--
-- ALSO in this migration (same tables, same write paths): the OWNER own-row policy of pet_vaccinations, vet_appointments and
-- pet_medical_profiles gets the pet check 0140 added to the other 21 tables. Those three were left out of 0140 on purpose (they carry
-- provider policies, R2d / 0023); the tests for this PR showed the old gap is open on them too — any signed-in user could insert a row
-- stamped to themselves against ANY pet_id, or re-point their own row. `<t>_owner_all` is re-created with
--   WITH CHECK (owner_user_id = current_app_user_id() AND app_owns_pet(pet_id))      (USING unchanged)
-- Provider policies (pet_vaccinations_provider_insert, vet_appointments_provider_update…) are separate and untouched. Production check
-- 2026-11-23 (read-only, counts only): 0 of 38 rows in these three tables were authored by someone other than the pet's owner.
--
-- PROVIDERS are unaffected: provider-booked appointments and provider-written vaccinations keep their own policies (0023); this only
-- adds a family branch.
--
-- DEGRADES SAFELY if not applied: the routes still work for owners; a family member's first write to one of these tables gets a friendly
-- 403 `family_write_unavailable` (a policy-presence probe), edits of existing rows simply match zero rows (404), never a 500.
--
-- Idempotent (drop-if-exists + create). HAND-APPLIED after 0139 and 0140 — supabase/verify_0141.sql (every row PASS); rollback:
-- supabase/rollback_0141.sql. Proven as pawpi_app in test/integration/family-write-paths.integration.test.ts.

do $$
declare
  t text;
  family_tables text[] := array[
    'pet_medications',
    'pet_preventive_treatments',
    'pet_vaccinations',
    'vet_appointments'
  ];
begin
  foreach t in array family_tables loop
    execute format('drop policy if exists %I on %I', t || '_family_all', t);
    execute format(
      'create policy %I on %I for all '
      || 'using (app_user_has_pet_family(pet_id)) '
      || 'with check (app_user_has_pet_family(pet_id) '
      || 'and owner_user_id = (select p.owner_user_id from pets p where p.id = pet_id))',
      t || '_family_all', t
    );
  end loop;
end
$$;

drop policy if exists pet_medical_profiles_family_insert on pet_medical_profiles;
create policy pet_medical_profiles_family_insert on pet_medical_profiles
  for insert
  with check (
    app_user_has_pet_family(pet_id)
    and owner_user_id = (select p.owner_user_id from pets p where p.id = pet_id)
  );

-- ── owner own-row policy: also require the pet to be the caller's (the 0140 hardening, for the three tables 0140 did not cover) ──
do $$
declare
  t text;
  owner_tables text[] := array['pet_vaccinations', 'vet_appointments', 'pet_medical_profiles'];
begin
  foreach t in array owner_tables loop
    execute format('drop policy if exists %I on %I', t || '_owner_all', t);
    execute format(
      'create policy %I on %I for all '
      || 'using (owner_user_id = current_app_user_id()) '
      || 'with check (owner_user_id = current_app_user_id() and app_owns_pet(pet_id))',
      t || '_owner_all', t
    );
  end loop;
end
$$;
