-- 0139_grantee_read_and_caregiver_log_rls.sql
-- Family-sharing series PR 3/7 (docs/family-sharing-audit-2026-11.md; owner decision 2 of 2026-11-23).
--
-- Roles after this migration (family = "co-owner", caregiver = "viewer + logger"):
--   • CAREGIVER (any ACTIVE, UNEXPIRED grantee): READ the pet's health logs, meds, preventive care, allergies/conditions
--     (the emergency picture) and the emergency card; INSERT new log rows (log / complete a task). Can NOT update or
--     delete a log, edit routines, the vet record, the pet profile or sharing.
--   • FAMILY: unchanged here (0049's *_family_all already gives read+write on the health logs and the vet-record tables).
--
-- WHY A MIGRATION. 0049 gave caregivers read on pets / routines / pet_medical_profiles only; every health table, the
-- medications tables and the emergency card were owner-or-family. A caregiver therefore could not read the logs or log a
-- walk even where the product says they should. The routes are changed in the same PR; these policies make RLS agree
-- (defence in depth: the API gate is not the only thing standing between a grantee and the rows).
--
-- WHAT. Purely ADDITIVE permissive policies (they OR with the existing owner / family / provider policies, so nobody
-- loses anything):
--   1. <t>_grantee_read   FOR SELECT using (app_user_has_pet_access(pet_id))   — on the 12 health_* log tables, plus
--      pet_medications, pet_preventive_treatments, pet_allergies, pet_conditions, pet_emergency_cards.
--   2. <t>_caregiver_insert FOR INSERT with check (app_user_has_pet_access(pet_id) AND owner_user_id = the pet's owner)
--      — on the 12 health_* log tables ONLY. The owner anchor is checked IN the policy (a caregiver can never stamp a row
--      to themselves or someone else), which the older family policies do not do. No UPDATE / DELETE policy => a
--      caregiver cannot edit or remove a log (append-only for them), exactly the product rule.
--   The helpers (app_user_has_pet_access, 0049) are SECURITY DEFINER with a pinned search_path and already carry the
--   REVOKE/GRANT pair; no function is created here. Revoked, declined, pending and expired grants return false from the
--   helper, so they lose access on the very next statement.
--   Deliberately NOT granted to caregivers: vet_documents, vet_notes, pet_lab_results, pet_surgeries, pet_vaccinations,
--   vet_appointments, prescriptions, insurance, nutrition plans (private records beyond "emergency + feeding + logs").
--
-- DEGRADES SAFELY if not applied: the routes still work for owners and family; a caregiver simply reads zero rows and a
-- caregiver log insert is refused by RLS (the route maps that to a friendly 403, never a 500).
--
-- Idempotent (drop-if-exists + create). HAND-APPLIED after merge — supabase/verify_0139.sql (every row PASS). Proven as
-- pawpi_app in test/integration/shared-pets-access.integration.test.ts.

do $$
declare
  t text;
  log_tables text[] := array[
    'health_food_logs',
    'health_general_checks',
    'health_medical_care_logs',
    'health_mobility_logs',
    'health_pee_logs',
    'health_photo_checks',
    'health_poo_logs',
    'health_vomit_logs',
    'health_walk_logs',
    'health_weight_logs',
    'health_wellness_logs',
    'health_timeline_events'
  ];
  read_only_tables text[] := array[
    'pet_medications',
    'pet_preventive_treatments',
    'pet_allergies',
    'pet_conditions',
    'pet_emergency_cards'
  ];
begin
  -- 1a. read on the log tables
  foreach t in array log_tables loop
    execute format('drop policy if exists %I on %I', t || '_grantee_read', t);
    execute format(
      'create policy %I on %I for select using (app_user_has_pet_access(pet_id))',
      t || '_grantee_read', t
    );
    -- 2. append-only logging for any active grantee, anchored to the pet's owner
    execute format('drop policy if exists %I on %I', t || '_caregiver_insert', t);
    execute format(
      'create policy %I on %I for insert with check ('
      || 'app_user_has_pet_access(pet_id) '
      || 'and owner_user_id = (select p.owner_user_id from pets p where p.id = pet_id))',
      t || '_caregiver_insert', t
    );
  end loop;

  -- 1b. read-only on meds / emergency-picture tables
  foreach t in array read_only_tables loop
    execute format('drop policy if exists %I on %I', t || '_grantee_read', t);
    execute format(
      'create policy %I on %I for select using (app_user_has_pet_access(pet_id))',
      t || '_grantee_read', t
    );
  end loop;
end
$$;
