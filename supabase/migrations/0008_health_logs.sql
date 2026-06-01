-- 0008_health_logs.sql
-- Append-only health tracking logs (12 tables). All share pet_id -> pets.id and
-- owner_user_id -> user_profiles.id (NOT NULL). The routes are POST/GET only (no UPDATE/DELETE)
-- and there are NO soft-delete columns.
-- NOTE: the timestamp column name is inconsistent across tables (logged_at / start_time /
-- created_at / given_at / event_time) — preserved as the app uses each. See SCHEMA_NOTES.md.
-- jsonb columns (written via JSON.stringify): potty_events, reaction_or_issue, values_json.

create table if not exists health_weight_logs (
  id                  bigint generated always as identity primary key,
  pet_id              bigint not null references pets(id) on delete cascade,
  owner_user_id       bigint not null references user_profiles(id) on delete cascade,
  weight              numeric,
  weight_unit         text default 'lbs',
  body_shape_estimate text,
  photo_url           text,
  notes               text,
  logged_at           timestamptz not null default now()
);

create table if not exists health_food_logs (
  id                   bigint generated always as identity primary key,
  pet_id               bigint not null references pets(id) on delete cascade,
  owner_user_id        bigint not null references user_profiles(id) on delete cascade,
  meal_type            text,
  food_name            text,
  amount               text,    -- free-form (e.g. "1 cup"); verify text vs numeric
  appetite             text,
  finished_meal        boolean not null default false,
  water_intake         text,    -- verify text vs numeric
  vomiting_or_reaction boolean not null default false,
  notes                text,
  logged_at            timestamptz not null default now()
);

create table if not exists health_poo_logs (
  id                bigint generated always as identity primary key,
  pet_id            bigint not null references pets(id) on delete cascade,
  owner_user_id     bigint not null references user_profiles(id) on delete cascade,
  amount            text,
  shape             text,
  color             text,
  blood             boolean not null default false,
  mucus             boolean not null default false,
  straining         boolean not null default false,
  accident_in_house boolean not null default false,
  photo_url         text,
  notes             text,
  logged_at         timestamptz not null default now()
);

create table if not exists health_pee_logs (
  id                bigint generated always as identity primary key,
  pet_id            bigint not null references pets(id) on delete cascade,
  owner_user_id     bigint not null references user_profiles(id) on delete cascade,
  frequency         text,    -- verify text vs integer count
  volume            text,
  color             text,
  accident_in_house boolean not null default false,
  difficulty_peeing boolean not null default false,
  pain_or_crying    boolean not null default false,
  blood_visible     boolean not null default false,
  increased_thirst  boolean not null default false,
  notes             text,
  logged_at         timestamptz not null default now()
);

create table if not exists health_vomit_logs (
  id                 bigint generated always as identity primary key,
  pet_id             bigint not null references pets(id) on delete cascade,
  owner_user_id      bigint not null references user_profiles(id) on delete cascade,
  number_of_episodes integer not null default 1,
  appearance         text,
  relation_to_food   text,
  appetite_after     text,
  energy             text,
  diarrhea_present   boolean not null default false,
  photo_url          text,
  notes              text,
  logged_at          timestamptz not null default now()
);

create table if not exists health_walk_logs (
  id                bigint generated always as identity primary key,
  pet_id            bigint not null references pets(id) on delete cascade,
  owner_user_id     bigint not null references user_profiles(id) on delete cascade,
  start_time        timestamptz not null default now(),  -- this table orders by start_time
  duration_minutes  integer,
  distance          numeric,
  distance_unit     text default 'miles',
  pace              text,    -- verify text vs numeric
  energy_after      text,
  potty_events      jsonb,
  route_or_location text,
  notes             text,
  steps             integer,
  average_speed     numeric,
  source            text default 'manual',
  source_device     text,
  created_at        timestamptz not null default now()
);

create table if not exists health_general_checks (
  id              bigint generated always as identity primary key,
  pet_id          bigint not null references pets(id) on delete cascade,
  owner_user_id   bigint not null references user_profiles(id) on delete cascade,
  eyes_status     text,
  ears_status     text,
  teeth_status    text,
  skin_fur_status text,
  paws_status     text,
  face_status     text,
  mood            text,
  energy          text,
  notes           text,
  logged_at       timestamptz not null default now()
);

create table if not exists health_photo_checks (
  id            bigint generated always as identity primary key,
  pet_id        bigint not null references pets(id) on delete cascade,
  owner_user_id bigint not null references user_profiles(id) on delete cascade,
  body_area     text not null,  -- app enum: paws|ears|eyes|teeth|skin_fur|face|full_body|other
  image_url     text not null,
  notes         text,
  created_at    timestamptz not null default now()  -- this table orders by created_at
);

create table if not exists health_medical_care_logs (
  id                   bigint generated always as identity primary key,
  pet_id               bigint not null references pets(id) on delete cascade,
  owner_user_id        bigint not null references user_profiles(id) on delete cascade,
  routine_id           bigint references routines(id) on delete set null,
  medical_care_item_id bigint,  -- references a medical_care_items table NOT in this codebase
  care_type            text,    -- medication|vaccine|flea_tick|deworming|heartworm|supplement|other
  name                 text,
  dose                 text,
  given_at             timestamptz not null default now(),  -- this table orders by given_at
  status               text not null,                       -- e.g. 'issue_reported'
  notes                text,
  reaction_or_issue    jsonb,
  created_at           timestamptz not null default now()
);

create table if not exists health_wellness_logs (
  id                        bigint generated always as identity primary key,
  pet_id                    bigint not null references pets(id) on delete cascade,
  owner_user_id             bigint not null references user_profiles(id) on delete cascade,
  routine_id                bigint references routines(id) on delete set null,
  wellness_check_item_index integer,  -- index into a routine checklist, not a FK
  check_type                text not null,
  logged_at                 timestamptz not null default now(),
  values_json               jsonb,
  notes                     text,
  image_url                 text,
  created_at                timestamptz not null default now()
);

-- No writer route exists for this table (only read by the timeline aggregator), so the column
-- set is PARTIAL — additional columns may exist. See SCHEMA_NOTES.md.
create table if not exists health_mobility_logs (
  id                  bigint generated always as identity primary key,
  pet_id              bigint not null references pets(id) on delete cascade,
  owner_user_id       bigint not null references user_profiles(id) on delete cascade,
  limping             boolean not null default false,
  stiffness           boolean not null default false,
  difficulty_standing boolean not null default false,
  notes               text,
  logged_at           timestamptz not null default now()
);

-- Denormalized unified-timeline event row. related_record_id is a POLYMORPHIC pointer to the
-- source log's id (resolved by event_type), so it is intentionally NOT a foreign key.
-- Currently the only writer is the walk-log POST (event_type = 'walk').
create table if not exists health_timeline_events (
  id                bigint generated always as identity primary key,
  pet_id            bigint not null references pets(id) on delete cascade,
  owner_user_id     bigint not null references user_profiles(id) on delete cascade,
  event_type        text not null,
  related_record_id bigint,        -- polymorphic id of the source log row (no FK)
  title             text,
  summary           text,
  event_time        timestamptz not null,
  created_at        timestamptz not null default now()
);
