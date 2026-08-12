-- 0087_provider_post_video_support.sql
-- Business "daily moments" — VIDEO on provider_posts. Mirrors 0068 (which taught the pet `posts`
-- table to carry a video) on the business-side provider_posts (0042). PURELY ADDITIVE columns that
-- RIDE the existing provider_posts RLS (0042 ENABLE+FORCE: staff-write / published-read) and the
-- moderation surface (0066 hidden_at) — NO policy change, NO new table, NO rename/drop.
--
-- An image post keeps image_urls and now reads media_type='image' with video_url/video_thumbnail_url
-- NULL; a video post sets media_type='video', video_url (the playable file) and video_thumbnail_url
-- (poster frame for the feed card). image_urls is untouched (a video post simply carries an empty
-- image list). Same additive pattern as 0068.
--
-- DEGRADE-CLEAN CONTRACT: the code deploys/merges FIRST; this SQL is hand-applied to Supabase AFTER
-- merge (test-backlog ACTION 1). While these columns are absent the compose UI stays image-only, the
-- posts create/PATCH ignore the media fields, and the feed's followed-business read catches Postgres
-- undefined_column (42703) and serves the same posts as image — never a 500. Idempotent (safe twice).

-- ── provider_posts — media kind + video columns ─────────────────────────────────
alter table provider_posts
  add column if not exists media_type          text not null default 'image',
  add column if not exists video_url           text,  -- the playable video (null for image posts)
  add column if not exists video_thumbnail_url text;  -- poster frame for the feed card (null for image posts)

alter table provider_posts
  drop constraint if exists provider_posts_media_type_check;
alter table provider_posts
  add constraint provider_posts_media_type_check
  check (media_type = any (array['image','video']::text[]));
