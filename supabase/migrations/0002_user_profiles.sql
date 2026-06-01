-- 0002_user_profiles.sql
-- Application-level user profile. THE identity hinge:
--   auth_users.id  --(auth_user_id)-->  user_profiles  --(id)-->  used as owner everywhere
-- Every API route resolves session.user.id (= auth_users.id) to user_profiles.id, and that
-- user_profiles.id is the value stored in pets.owner_user_id and all *.owner_user_id columns.
-- App tables use integer (bigint identity) surrogate keys (code uses parseInt on ids).

create table if not exists user_profiles (
  id                   bigint generated always as identity primary key,
  auth_user_id         uuid not null unique references auth_users(id) on delete cascade,
  full_name            text,
  username             text unique,
  avatar_url           text,
  role                 text not null default 'pet_owner',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
