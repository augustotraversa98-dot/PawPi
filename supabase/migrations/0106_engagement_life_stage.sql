-- 0106_engagement_life_stage.sql
-- Pet Owner engagement WAVE 2 — unit E15 (Life-stage ring goals, docs/pet-owner-engagement.md).
--
-- Make the daily Care Ring feel personalised + credible by adapting its TARGETS / copy / suggested
-- actions to the dog's life stage (puppy / adult / senior). The ring stays THREE closeable segments —
-- life stage only tunes what counts / the copy, never the number of segments. Behavioral, never
-- diagnostic; a senior is never judged against a puppy's bar; the owner can OVERRIDE the detected stage.
--
-- The detected stage is DERIVED (pure code from birthday/age + weight-as-size); nothing to store for it.
-- This migration adds only the OWNER OVERRIDE:
--   pets.life_stage_override text — NULL = auto-detect (the default; every existing pet unaffected); a
--   value pins the stage. CHECK (null | 'puppy' | 'adult' | 'senior').
--
-- ADDITIVE — one nullable column on pets; no RLS/policy change (pets already owner RLS + 0049 family
-- update; the override write is gated owner-only in the route). Idempotent. Verify:
-- supabase/verify_0106.sql. HARNESS-ONLY THIS TICKET — hand-applied after merge. The route DEGRADES
-- CLEANLY while the column is absent (missing column 42703 → override treated as null / auto-detect).

alter table pets add column if not exists life_stage_override text;

alter table pets drop constraint if exists pets_life_stage_override_check;
alter table pets add constraint pets_life_stage_override_check
  check (life_stage_override is null or life_stage_override = any (array['puppy','adult','senior']::text[]));
