-- 0149_vet_notes_owner_pet_check.sql
-- vet_notes: add the pet-ownership condition to the owner policy's WITH CHECK, the same way 0140 did for the other 21
-- pet-linked tables. vet_notes was not in 0140's list because its policies come from the provider-records group (0023).
--
-- Before: vet_notes_owner_all  FOR ALL  USING (owner_user_id = current_app_user_id())
--                                       WITH CHECK (owner_user_id = current_app_user_id())
-- After:  same name, same USING, and
--                                       WITH CHECK (owner_user_id = current_app_user_id() AND app_owns_pet(pet_id))
--
-- app_owns_pet (0049) is the SECURITY DEFINER "does the caller own this pet" helper (pinned search_path, EXECUTE already granted to
-- pawpi_app). USING is unchanged, so reads and deletes of one's own rows behave exactly as before.
--
-- Untouched on purpose: vet_notes_family_all (0120), vet_notes_provider_read / vet_notes_provider_insert (0023) and
-- vet_notes_provider_section_read (0147). Both application writers already stamp owner_user_id with the PET OWNER
-- (POST /api/vet-record/notes via resolvePetLogOwner; POST /api/providers/[id]/pets/[petId]/notes via pets.owner_user_id), and
-- family / provider writes go through their own policies, so no existing flow changes.
--
-- Data: a read-only count against production on 2026-11-26 found 2 rows in vet_notes, none whose owner_user_id differs from its
-- pet's owner and none without a pet, so nothing existing is affected.
--
-- No new table, function or grant. Idempotent (drop-if-exists + create).
-- HAND-APPLIED after merge — supabase/verify_0149.sql (every row PASS). Proven as pawpi_app, through the real routes, in
-- test/integration/vet-notes-pet-ownership.integration.test.ts.

drop policy if exists vet_notes_owner_all on vet_notes;
create policy vet_notes_owner_all on vet_notes
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id() and app_owns_pet(pet_id));
