-- ROLLBACK for migration 0140 (own-row policies also require the pet to be the caller's). Run in the Supabase SQL editor.
-- Idempotent and non-destructive: it re-creates, on the same 21 tables, the policy exactly as 0022 / 0117 defined it
-- (own rows only, no pet check). No table, row or function is touched.
--
-- WARNING: this REOPENS the gap 0140 closes (any signed-in user could insert a row stamped to themselves against any pet_id, or
-- re-point their own row at another pet). Do it only to get unblocked, and re-apply 0140 as soon as the cause is fixed.
-- The two route checks (PUT /api/routines, POST /api/health/reminder-dismissals) stay in force either way.
--
-- To confirm: supabase/verify_0140.sql should now FAIL row 1 (the pet check is gone) and PASS the rest. To re-apply, run 0140 again.
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
      || 'with check (owner_user_id = current_app_user_id())',
      t || '_owner_all', t
    );
  end loop;
end
$$;
