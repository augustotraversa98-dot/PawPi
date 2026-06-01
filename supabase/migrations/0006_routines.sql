-- 0006_routines.sql
-- Care routines. pet_id -> pets.id, owner_user_id -> user_profiles.id (both confirmed).
-- Soft-delete via deleted_at (+ is_active=false set together). The seven *_schedule/*_details
-- columns are written with JSON.stringify(...) -> jsonb. `times`/`days` are passed RAW (not
-- stringified) -> typed here as jsonb but may be intended as text[]; see SCHEMA_NOTES.md.
-- routine_type is an app-level enum stored as text: feeding | walk | medication | photo_check |
-- medical_care | wellness_check | vet_appointment.

create table if not exists routines (
  id                       bigint generated always as identity primary key,
  pet_id                   bigint not null references pets(id) on delete cascade,
  owner_user_id            bigint not null references user_profiles(id) on delete cascade,
  routine_type             text not null,
  is_active                boolean not null default true,
  title                    text,
  description              text,
  feeding_schedule         jsonb,
  walk_schedule            jsonb,
  medication_details       jsonb,
  photo_check_details      jsonb,
  medical_care_details     jsonb,
  wellness_check_schedule  jsonb,
  vet_appointment_schedule jsonb,
  frequency                text,
  preferred_day            text,
  times                    jsonb,   -- passed raw in code; verify jsonb vs text[]
  days                     jsonb,   -- passed raw in code; verify jsonb vs text[]
  notification_enabled     boolean not null default true,
  time_sensitive           boolean not null default true,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index if not exists idx_routines_pet on routines (pet_id) where deleted_at is null;
