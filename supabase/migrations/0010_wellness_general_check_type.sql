-- 0010_wellness_general_check_type.sql
-- Allow 'general' as a health_wellness_logs.check_type.
--
-- The wellness log slice of Ticket 7 persists a "General check" ("All good" vs
-- "Noticed something") to health_wellness_logs so it carries the same routine_id +
-- wellness_check_item_index linkage as the other wellness checks. The original
-- CHECK (0008) omitted 'general', so a general insert would fail. This widens the
-- constraint to include it. Weight stays on health_weight_logs (Insights path) and
-- is intentionally NOT added here.
--
-- Idempotent: drop-if-exists then re-add, safe to re-run. Apply to the live
-- Supabase database the app is pointed at (Phase 1/2).

alter table health_wellness_logs
  drop constraint if exists health_wellness_logs_check_type_check;

alter table health_wellness_logs
  add constraint health_wellness_logs_check_type_check
  check (check_type = any (array[
    'general',
    'body_condition',
    'mobility',
    'mood_energy',
    'skin_coat',
    'appetite_hydration',
    'custom'
  ]::text[]));
