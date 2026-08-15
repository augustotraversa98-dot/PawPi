-- 0112 — allow reporting a business-post comment (night-run A3 / Apple 1.2 completeness).
--
-- Business-post (provider_post) comments could be deleted by their author but NOT reported or
-- used to block the commenter — the feed comment (bark) surface got that in the prior PR, but
-- business-post comments were still Report-less. Apple 1.2 wants Report + Block on ALL UGC.
--
-- `content_reports.target_type` carries a CHECK (last set with the base moderation arc). Adding
-- a new reportable surface requires widening it (same drop+re-add pattern as the notifications
-- type checks). ADDITIVE — no table/RLS change. Idempotent (drop-if-exists + re-add). The full
-- existing set is restated verbatim so the constraint stays a single source of truth.
-- Verify: supabase/verify_0112.sql. Degrades cleanly while absent: the reports route rejects an
-- unknown target_type with a 400 before any INSERT, so an un-widened DB simply can't file a
-- provider_post_comment report (never a 500 / never a CHECK violation reaching the client).

alter table content_reports drop constraint if exists content_reports_target_type_check;
alter table content_reports add constraint content_reports_target_type_check
  check (target_type = any (array[
    'post','bark','forum_thread','forum_comment','dm_message','provider_message','review',
    'pet_profile','user_profile','adoption_listing','event','social_walk','lost_report',
    'provider_post',
    -- ── A3 (night-run) — business-post comments ──
    'provider_post_comment'
  ]::text[]));
