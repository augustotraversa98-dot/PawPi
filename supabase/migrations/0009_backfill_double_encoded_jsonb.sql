-- 0009_backfill_double_encoded_jsonb.sql
-- Backfill for the double-encoded jsonb bug (Phase B).
--
-- Cause: app code JSON.stringify'd values before insert, so porsager `postgres`
-- encoded a second time and stored a jsonb *string scalar* (jsonb_typeof = 'string')
-- whose text is itself JSON, e.g. "[{\"name\":\"Breakfast\"}]" instead of the array.
-- The write paths are now fixed (sql.json(value)); this converts pre-existing rows.
--
-- `#>> '{}'` extracts the inner text of the string scalar, re-cast to jsonb yields the
-- real array/object. Idempotent: the WHERE jsonb_typeof(...) = 'string' guard skips
-- already-correct rows, so this is safe to re-run.

update routines
  set feeding_schedule = (feeding_schedule #>> '{}')::jsonb
  where jsonb_typeof(feeding_schedule) = 'string';

update routines
  set walk_schedule = (walk_schedule #>> '{}')::jsonb
  where jsonb_typeof(walk_schedule) = 'string';

update routines
  set medication_details = (medication_details #>> '{}')::jsonb
  where jsonb_typeof(medication_details) = 'string';

update routines
  set photo_check_details = (photo_check_details #>> '{}')::jsonb
  where jsonb_typeof(photo_check_details) = 'string';

update routines
  set medical_care_schedule = (medical_care_schedule #>> '{}')::jsonb
  where jsonb_typeof(medical_care_schedule) = 'string';

update routines
  set medical_care_details = (medical_care_details #>> '{}')::jsonb
  where jsonb_typeof(medical_care_details) = 'string';

update routines
  set wellness_check_schedule = (wellness_check_schedule #>> '{}')::jsonb
  where jsonb_typeof(wellness_check_schedule) = 'string';

update routines
  set vet_appointment_schedule = (vet_appointment_schedule #>> '{}')::jsonb
  where jsonb_typeof(vet_appointment_schedule) = 'string';

update health_walk_logs
  set potty_events = (potty_events #>> '{}')::jsonb
  where jsonb_typeof(potty_events) = 'string';

update health_wellness_logs
  set values_json = (values_json #>> '{}')::jsonb
  where jsonb_typeof(values_json) = 'string';

update health_medical_care_logs
  set reaction_or_issue = (reaction_or_issue #>> '{}')::jsonb
  where jsonb_typeof(reaction_or_issue) = 'string';
