-- 0003_pets.sql
-- Pets. owner_user_id -> user_profiles.id (NOT auth_users.id). The web API contains an
-- explicit repair handler whose sole job is to fix rows that wrongly stored the auth id here.
-- handle is treated as unique by the app (uniqueness checked before insert/update).

create table if not exists pets (
  id            bigint generated always as identity primary key,
  owner_user_id bigint not null references user_profiles(id) on delete cascade,
  name          text not null,
  handle        text unique,
  avatar_url    text,
  species       text default 'dog',
  breed         text,
  age_years     integer,
  age_months    integer,
  gender        text,
  weight        numeric,
  weight_unit   text default 'lbs',
  birthday      date,
  adoption_date date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pets_owner_user_id on pets (owner_user_id);
