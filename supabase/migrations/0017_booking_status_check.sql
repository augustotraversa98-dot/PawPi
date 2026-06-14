-- 0017_booking_status_check.sql
-- Provider/Business side, ticket 6a (owner booking). 0016 added the
-- vet_appointments booking columns (provider_id/.../booking_status/source) as
-- free-text. This locks the two workflow enums with CHECK constraints so the
-- owner-booking route (POST /api/providers/[id]/book) and the provider 6b
-- confirm/decline side can only ever write known values.
--
--   booking_status  requested|confirmed|declined|cancelled   (NULL allowed — the
--                   provider-workflow field; DISTINCT from the existing status
--                   column scheduled|completed|cancelled|missed, untouched here)
--   source          owner|provider                            (NULL allowed)
--
-- Existing rows pass: owner-created appointments have booking_status NULL and
-- source 'owner' (the 0016 default), both permitted by the NULL-or-IN-set form.
--
-- Idempotent: Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each constraint is
-- dropped-if-exists then re-added — the file is safely re-runnable.
-- Matches supabase_schema.sql (addendum block) exactly. Schema only — no data
-- change; the reminder engine is not affected (these columns are not reminder fields).

alter table vet_appointments
  drop constraint if exists vet_appointments_booking_status_check;
alter table vet_appointments
  add constraint vet_appointments_booking_status_check
  check (
    booking_status is null
    or booking_status = any (array['requested', 'confirmed', 'declined', 'cancelled'])
  );

alter table vet_appointments
  drop constraint if exists vet_appointments_source_check;
alter table vet_appointments
  add constraint vet_appointments_source_check
  check (
    source is null
    or source = any (array['owner', 'provider'])
  );
