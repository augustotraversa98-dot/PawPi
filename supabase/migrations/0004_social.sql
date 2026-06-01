-- 0004_social.sql
-- Social feed: posts, paws (likes), barks (comments), and pet friendships.
-- posts.user_id -> user_profiles.id (confirmed via JOIN ON p.user_id = up.id).
-- posts.pet_id  -> pets.id           (confirmed via JOIN ON p.pet_id = pet.id).

create table if not exists posts (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references user_profiles(id) on delete cascade,
  pet_id          bigint not null references pets(id) on delete cascade,
  image_url       text,
  caption         text,
  is_daily_update boolean not null default false,
  post_date       date not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_posts_pet_id on posts (pet_id);
create index if not exists idx_posts_created_at on posts (created_at desc);

-- App enforces "one daily update per pet per day". Modeled here as a partial unique index
-- (inferred — not proven by DDL; see SCHEMA_NOTES.md).
create unique index if not exists uq_posts_daily_update
  on posts (pet_id, post_date) where is_daily_update;

-- Likes. App checks for an existing row before inserting -> composite unique (post_id, user_id).
create table if not exists post_paws (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- Comments. user_id -> user_profiles.id (confirmed via JOIN ON pb.user_id = up.id).
create table if not exists post_barks (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references user_profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_barks_post_id on post_barks (post_id);

-- Pet friendships. Only read (never written) in the routes inspected, so the full column
-- set and PK are inferred — see SCHEMA_NOTES.md.
create table if not exists pet_friendships (
  id                bigint generated always as identity primary key,
  requester_pet_id  bigint not null references pets(id) on delete cascade,
  receiver_pet_id   bigint not null references pets(id) on delete cascade,
  requester_user_id bigint not null references user_profiles(id) on delete cascade,
  receiver_user_id  bigint not null references user_profiles(id) on delete cascade,
  status            text not null default 'pending',  -- observed value: 'accepted'
  created_at        timestamptz not null default now()
);
