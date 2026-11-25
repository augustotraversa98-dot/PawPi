-- Rollback for 0144 (who logged each entry). Removes the trigger, the two columns (and their indexes) and the function.
-- The attribution recorded since 0144 is lost; the log entries themselves are untouched.
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
    'health_wellness_logs'
  ];
begin
  foreach t in array log_tables loop
    execute format('drop trigger if exists trg_stamp_logged_by on %I', t);
    execute format('alter table %I drop column if exists logged_by_user_id', t);
    execute format('alter table %I drop column if exists logged_by_known', t);
  end loop;
end
$$;
drop function if exists app_stamp_logged_by();
