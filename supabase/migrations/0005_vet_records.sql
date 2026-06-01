-- 0005_vet_records.sql
-- Vet record domain. Every table has BOTH pet_id -> pets.id AND owner_user_id -> user_profiles.id.
-- vet_appointments is created first because vet_notes.appointment_id references it.
-- Soft-delete (deleted_at) exists ONLY on vet_appointments and pet_medical_profiles; the rest
-- are hard-deleted by the app.

create table if not exists vet_appointments (
  id               bigint generated always as identity primary key,
  pet_id           bigint not null references pets(id) on delete cascade,
  owner_user_id    bigint not null references user_profiles(id) on delete cascade,
  title            text not null,
  appointment_date date not null,
  appointment_time time not null,         -- stored separately from the date (see SCHEMA_NOTES.md)
  clinic           text,
  veterinarian     text,
  reason_for_visit text,
  notes            text,
  reminder_enabled boolean not null default true,
  time_sensitive   boolean not null default true,
  reminder_timing  text default 'at_time',
  add_to_calendar  boolean not null default false,
  calendar_event_id text,
  status           text not null default 'scheduled',  -- 'scheduled' | 'completed' | 'cancelled'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_vet_appointments_pet on vet_appointments (pet_id);

-- One medical profile per pet (app does a manual upsert keyed by pet). Modeled as a partial
-- unique index over live rows (inferred — see SCHEMA_NOTES.md).
create table if not exists pet_medical_profiles (
  id                       bigint generated always as identity primary key,
  pet_id                   bigint not null references pets(id) on delete cascade,
  owner_user_id            bigint not null references user_profiles(id) on delete cascade,
  microchip_id             text,
  spayed_neutered_status   text,
  spayed_neutered_date     date,
  primary_vet_name         text,
  primary_clinic_name      text,
  vet_phone                text,
  vet_email                text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  insurance_provider       text,
  insurance_policy_number  text,
  medical_notes            text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists uq_pet_medical_profiles_pet
  on pet_medical_profiles (pet_id) where deleted_at is null;

create table if not exists pet_allergies (
  id             bigint generated always as identity primary key,
  pet_id         bigint not null references pets(id) on delete cascade,
  owner_user_id  bigint not null references user_profiles(id) on delete cascade,
  allergen       text not null,
  severity       text,
  reaction       text,
  diagnosed_date date,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists pet_conditions (
  id             bigint generated always as identity primary key,
  pet_id         bigint not null references pets(id) on delete cascade,
  owner_user_id  bigint not null references user_profiles(id) on delete cascade,
  condition      text not null,
  status         text not null default 'active',  -- condition status, NOT a soft delete
  diagnosed_date date,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists pet_lab_results (
  id            bigint generated always as identity primary key,
  pet_id        bigint not null references pets(id) on delete cascade,
  owner_user_id bigint not null references user_profiles(id) on delete cascade,
  test_name     text not null,
  test_date     date not null,
  results       text,            -- possibly jsonb; stored raw, see SCHEMA_NOTES.md
  ordered_by    text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists pet_surgeries (
  id            bigint generated always as identity primary key,
  pet_id        bigint not null references pets(id) on delete cascade,
  owner_user_id bigint not null references user_profiles(id) on delete cascade,
  procedure     text not null,
  surgery_date  date not null,
  surgeon       text,
  clinic        text,
  complications text,
  recovery      text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists vet_documents (
  id            bigint generated always as identity primary key,
  pet_id        bigint not null references pets(id) on delete cascade,
  owner_user_id bigint not null references user_profiles(id) on delete cascade,
  name          text not null,
  document_type text not null,
  file_url      text not null,
  document_date date,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists vet_notes (
  id             bigint generated always as identity primary key,
  pet_id         bigint not null references pets(id) on delete cascade,
  owner_user_id  bigint not null references user_profiles(id) on delete cascade,
  vet_name       text,
  note_date      date not null,
  note           text not null,
  appointment_id bigint references vet_appointments(id) on delete set null,
  created_at     timestamptz not null default now()
);
