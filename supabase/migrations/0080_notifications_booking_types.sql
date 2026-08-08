-- 0080_notifications_booking_types.sql
-- Owner booking-lifecycle notifications: widen the notifications type CHECK (0044,
-- last widened in 0065) additively so the existing notifications table + app_notify()
-- DEFINER helper can carry booking events the OWNER cares about — booking requested,
-- confirmed, declined, cancelled — each deep-linking to the booking summary. No new
-- table, column, function, or policy: this reuses the whole 2.26 notification system.
--
-- Additive + idempotent (drop-if-exists then re-add). Mirrors the 0050/0051/0061/0065
-- widen convention exactly. HAND-APPLIED to Supabase AFTER merge (this PR does not
-- auto-merge because it carries a migration).

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled'
  ]::text[]));
