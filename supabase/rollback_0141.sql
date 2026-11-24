-- ROLLBACK for migration 0141 (family write policies). Run in the Supabase SQL editor.
-- Idempotent and non-destructive: it only DROPS the policies 0141 added (no table, row or function is touched).
-- Effect: a FAMILY member can no longer write meds, preventive care, vaccines, appointments or create a medical profile for the
-- shared dog; the PR3b server code answers a friendly 403 `family_write_unavailable` (policy-presence probe) for new rows and 404 for
-- edits of existing rows — never a 500. Owners, caregivers and providers are unaffected.
-- It ALSO restores the pre-0141 owner own-row policy (no pet check) on pet_vaccinations, vet_appointments and pet_medical_profiles —
-- WARNING: that REOPENS the cross-pet write gap on those three tables; re-apply 0141 as soon as possible.
-- To confirm: supabase/verify_0141.sql should now FAIL rows 1, 2 and 8. To re-apply, run 0141 again.
do $$
declare
  t text;
  family_tables text[] := array['pet_medications', 'pet_preventive_treatments', 'pet_vaccinations', 'vet_appointments'];
begin
  foreach t in array family_tables loop
    execute format('drop policy if exists %I on %I', t || '_family_all', t);
  end loop;
end
$$;
drop policy if exists pet_medical_profiles_family_insert on pet_medical_profiles;

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
      || 'with check (owner_user_id = current_app_user_id())',
      t || '_owner_all', t
    );
  end loop;
end
$$;
