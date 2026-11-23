-- ROLLBACK for migration 0139 (grantee read + caregiver append-only logging). Run in the Supabase SQL editor.
-- Idempotent and non-destructive: it only DROPS the policies 0139 added (no table, row or function is touched).
--
-- Effect after running it (nothing breaks):
--   • owners and FAMILY members are unaffected — their access comes from the 0022 owner policies and 0049's *_family_all;
--   • a CAREGIVER reads zero rows from the health logs / meds / allergies / conditions / emergency card and can no longer log;
--     the PR3 server code answers a friendly 403 `caregiver_logging_unavailable` for a caregiver's log write (policy-presence probe),
--     never a 500, and caregiver reads simply come back empty.
-- To confirm: supabase/verify_0139.sql should now FAIL rows 1, 2 and 4 (and PASS 3, 5-8). To re-apply, run 0139 again.
do $$
declare
  t text;
  log_tables text[] := array[
    'health_food_logs', 'health_general_checks', 'health_medical_care_logs', 'health_mobility_logs',
    'health_pee_logs', 'health_photo_checks', 'health_poo_logs', 'health_vomit_logs', 'health_walk_logs',
    'health_weight_logs', 'health_wellness_logs', 'health_timeline_events'
  ];
  read_only_tables text[] := array[
    'pet_medications', 'pet_preventive_treatments', 'pet_allergies', 'pet_conditions', 'pet_emergency_cards'
  ];
begin
  foreach t in array log_tables loop
    execute format('drop policy if exists %I on %I', t || '_grantee_read', t);
    execute format('drop policy if exists %I on %I', t || '_caregiver_insert', t);
  end loop;
  foreach t in array read_only_tables loop
    execute format('drop policy if exists %I on %I', t || '_grantee_read', t);
  end loop;
end
$$;
