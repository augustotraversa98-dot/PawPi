-- 0007_social_walks.sql
-- Scheduled group walks and their join requests.
-- social_walks.owner_user_id -> user_profiles.id (confirmed via JOIN ON sw.owner_user_id = up.id).
-- social_walks.routine_id -> routines.id (nullable; a walk may originate from a routine).
-- Exact join-request column names confirmed: social_walk_id (not walk_id), requester_user_id.

create table if not exists social_walks (
  id                       bigint generated always as identity primary key,
  routine_id               bigint references routines(id) on delete set null,
  routine_walk_index       integer,
  pet_id                   bigint not null references pets(id) on delete cascade,
  owner_user_id            bigint not null references user_profiles(id) on delete cascade,
  walk_name                text not null,
  scheduled_at             timestamptz not null,
  duration_minutes         integer,
  pace                     text,
  visibility               text not null,   -- 'nearby_pets' | 'friends_only'
  meeting_area             text,
  meeting_location_details text,
  max_pets                 integer not null default 4,
  approval_required        boolean not null default true,
  notes_for_guests         text,
  status                   text not null default 'scheduled',
  created_at               timestamptz not null default now()
);
create index if not exists idx_social_walks_scheduled_at on social_walks (scheduled_at);

create table if not exists social_walk_join_requests (
  id                bigint generated always as identity primary key,
  social_walk_id    bigint not null references social_walks(id) on delete cascade,
  requester_user_id bigint not null references user_profiles(id) on delete cascade,
  requester_pet_id  bigint not null references pets(id) on delete cascade,
  message           text,
  status            text not null default 'pending',  -- 'pending' | 'approved' | 'declined'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- App relies on a duplicate-key error to block repeat requests (see SCHEMA_NOTES.md).
  unique (social_walk_id, requester_user_id, requester_pet_id)
);
