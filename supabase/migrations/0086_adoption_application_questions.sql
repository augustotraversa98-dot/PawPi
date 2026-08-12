-- 0086_adoption_application_questions.sql
-- Adoption applications v2. TWO additive, idempotent changes on existing tables — NO new
-- table, function, or policy:
--
--   (1) adoptable_listings.application_questions — an ORDERED jsonb array of question strings
--       the shelter configures PER LISTING (0038 gave adoption_applications an `answers` jsonb
--       already; this is the question side of that pair). The applicant answers these on apply
--       and the responses land in the existing adoption_applications.answers. Defaults to '[]'
--       (no questions) so a listing created before a shelter adds any behaves exactly as today.
--       Rides the existing adoptable_listings RLS (0038): shelter-admin writes, published-
--       available discovery reads — no policy change (a new column inherits the table's policies).
--
--   (2) notifications_type_check — WIDEN (0044, last widened in 0080) additively to carry the
--       three adoption-application lifecycle types the APPLICANT cares about: the shelter moved
--       their application to under_review / approved / declined. Reuses the whole 2.26
--       notification system (table + app_notify() DEFINER helper + owner RLS) verbatim — no new
--       table/function/policy. Mirrors the 0050/0051/0061/0065/0080 widen convention exactly.
--
-- ⚠️ HAND-APPLIED to Supabase AFTER merge (this PR carries a migration; it does not auto-merge).
-- The code DEGRADES CLEANLY while this is unapplied: every read of application_questions catches
-- Postgres undefined_column (42703) and falls back to [] (no questions → the apply form works as
-- today); every write drops the column on 42703; and the applicant notify is a fire-and-forget
-- safeNotify() that swallows the CHECK-constraint failure (the new type isn't allowed yet), so a
-- status change never 500s. Idempotent. pawpi_app already has privileges on both tables.

-- (1) Per-listing application questions (ordered array of question strings).
alter table adoptable_listings
  add column if not exists application_questions jsonb not null default '[]'::jsonb;

-- (2) Widen the notifications type CHECK for the adoption-application lifecycle types.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined'
  ]::text[]));
