-- 0068_post_video_support.sql
-- Daily video moments — STEP 1 (schema only): teach `posts` to carry a video as well as a photo.
-- PURELY ADDITIVE columns that RIDE the existing posts RLS (0004 table; ENABLE+FORCE RLS) and the
-- UGC-moderation surface (hidden_at + 'post' report type from 0065) — NO policy change, NO new table,
-- NO rename/drop. Same additive pattern as 0055.
--
-- An image post keeps image_url and now reads media_type='image' with video_url/video_thumbnail_url
-- NULL; a video post sets media_type='video', video_url (the playable file) and video_thumbnail_url
-- (poster frame for the feed + locked-blur). image_url is untouched.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (test-backlog ACTION 1). Idempotent (safe to run twice).

-- ── posts — media kind + video columns ──────────────────────────────────────────
alter table posts
  add column if not exists media_type          text not null default 'image',
  add column if not exists video_url           text,  -- the playable video (null for image posts)
  add column if not exists video_thumbnail_url text;  -- poster frame for feed + locked-blur (null for image posts)

alter table posts
  drop constraint if exists posts_media_type_check;
alter table posts
  add constraint posts_media_type_check
  check (media_type = any (array['image','video']::text[]));
