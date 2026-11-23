-- 0140_owner_private_pet_ownership_check.sql
-- Family-sharing series PR 3/7 — closes the pre-existing "own-row policy trusts owner_user_id alone" gap for the pet-linked
-- HEALTH / VET-RECORD / ROUTINE tables (found while writing PR3's tests; written up in docs/family-sharing-audit-2026-11.md §A5).
--
-- THE GAP. 0022 (and 0117 for the meds tables) gave every owner-private table one policy:
--     <t>_owner_all  FOR ALL  USING (owner_user_id = current_app_user_id())  WITH CHECK (owner_user_id = current_app_user_id())
-- It checks WHO WROTE the row but never WHICH PET it points at. So any signed-in user could
--   • INSERT a row stamped to THEMSELVES with pet_id = ANY pet (someone else's dog), and
--   • UPDATE one of their own rows to re-point pet_id at someone else's dog.
-- They could NOT read or delete anyone else's rows (USING keeps that own-row), and they could not impersonate the owner
-- (owner_user_id must be themselves). What a planted row does: it sits under the planter's id (invisible to the pet's owner in
-- the owner-scoped routes), but anything keyed on pet_id alone sees it — the family policies (0049) read by pet, and
-- app_pet_ring_segments counts by pet, so a stranger could fill another dog's Care Ring. Production check 2026-11-23 (read-only,
-- counts only): 0 rows in the 21 tables below were authored by someone other than the pet's owner, i.e. nothing has been
-- exploited; this closes the door.
--
-- THE FIX. Same policy name and shape, with the pet check added to WITH CHECK:
--     WITH CHECK (owner_user_id = current_app_user_id() AND app_owns_pet(pet_id))
-- app_owns_pet (0049) is the SECURITY DEFINER "does the caller own this pet" helper (pinned search_path, EXECUTE granted to
-- pawpi_app). USING is unchanged, so reads and deletes of one's own rows behave exactly as before.
-- What stays untouched: the 0049 *_family_all policies (family writes are anchored to the pet's OWNER and gated by
-- app_user_has_pet_family), 0139's caregiver INSERT (gated by app_user_has_pet_access AND the owner anchor), provider-side policies.
-- A row stamped to the OWNER by a family member / caregiver / provider never goes through this policy, so none of those flows change.
--
-- SCOPE. The 21 tables listed in the DO block (the 19 of 0022 + pet_medications + pet_preventive_treatments). The same own-row shape
-- exists on ~30 other pet-linked tables (bookings, nutrition, insurance, lost reports…); see the PR for the recommended follow-up —
-- they each need their own flow check, so they are NOT changed here.
--
-- Idempotent (drop-if-exists + create). HAND-APPLIED after merge — supabase/verify_0140.sql (every row PASS). Proven as pawpi_app in
-- test/integration/non-member-pet-writes.integration.test.ts. If it is not applied the routes still refuse these writes (the two
-- API paths that could reach the gap — PUT /api/routines and POST /api/health/reminder-dismissals — now check pet ownership themselves).

do $$
declare
  t text;
  tables text[] := array[
    'health_food_logs', 'health_general_checks', 'health_medical_care_logs', 'health_mobility_logs',
    'health_pee_logs', 'health_photo_checks', 'health_poo_logs', 'health_vomit_logs', 'health_walk_logs',
    'health_weight_logs', 'health_wellness_logs', 'health_timeline_events',
    'pet_allergies', 'pet_conditions', 'pet_lab_results', 'pet_surgeries', 'vet_documents',
    'routines', 'reminder_dismissals',
    'pet_medications', 'pet_preventive_treatments'
  ];
begin
  foreach t in array tables loop
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
