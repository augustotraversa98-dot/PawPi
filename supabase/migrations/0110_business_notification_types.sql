-- 0110_business_notification_types.sql
-- BN2 PR2 (business notification EMISSION) — widen notifications_type_check to allow
-- the new provider-facing notification types.
--
-- BACKGROUND: until now the ONLY notification reaching a business recipient was a walk
-- request (walk_request_targeted / _broadcast → a walker's active staff). BN2 PR2 emits
-- the business events owners actually care about — new booking, client cancel/reschedule,
-- new order, new client chat message, new adoption application — to the provider OWNER +
-- the RELEVANT active STAFF (resolved via app_provider_active_staff_ids, 0093, since the
-- owner is enrolled as active staff at provider creation). Engagement (paws/comments on
-- the business's posts, a new follower) writes an IN-APP-ONLY bell (never pushed). Review /
-- payout categories are reserved in the catalog (OPTIONAL_PUSH) for when those events exist.
--
-- `notifications.type` carries a CHECK (notifications_type_check, last set in 0101). Adding
-- new types requires widening it (same drop+re-add pattern as 0096/0100/0101). This is the
-- ONLY DB change PR2 needs: recipient resolution reuses the 0093 DEFINER reader, and the
-- push-gating lives in the app layer (BN2 PR1 — the bell ALWAYS writes; the channel class +
-- notification_prefs govern whether it also pushes). app_notify()'s BX4 gate (0108) is left
-- untouched — it still maps only walk_requests; the new categories' push preference is
-- honored in the JS send-hook, so their in-app bell is never suppressed (the BN2 model:
-- "every business notification always writes an in-app bell row").
--
-- ADDITIVE — no table/RLS change. Idempotent (drop-if-exists + re-add). Verify:
-- supabase/verify_0110.sql. HARNESS-ONLY THIS TICKET — hand-applied to Supabase after merge.
-- Consumers degrade cleanly while absent: safeNotify swallows a CHECK violation (23514) like
-- any other error, so an un-widened DB simply drops the new bell rows, never 500s.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    -- ── existing (through 0101) ──
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined',
    'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
    'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
    -- ── BN2 PR2 — business (provider-facing) ──
    'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
    'biz_review','biz_payout','biz_post_engagement','biz_follow'
  ]::text[]));
