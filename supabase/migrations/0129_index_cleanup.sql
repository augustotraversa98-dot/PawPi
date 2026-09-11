-- 0129_index_cleanup.sql
-- Index hygiene — AUDIT_2026-09 finding A-19 (P2) + the A-14 discovery indexes.
--
-- ⚠️ HAND-APPLY AFTER REVIEW (index DDL only — no application data written).
--    Prefer CONCURRENTLY on prod (outside a transaction); see the runbook.
--
-- WHY. Advisors flagged 8 exact-duplicate indexes (two indexes on the same
-- column, from historical create-if-not-exists drift) and a set of unindexed
-- foreign keys on hot paths. Duplicates waste write bandwidth + storage; the
-- missing FK indexes force sequential scans on joins/filters that run per request.
--
-- WHAT.
--   1. Drop one index of each duplicate pair (keep the *_id-suffixed name, which
--      matches the column). Idempotent: DROP INDEX IF EXISTS.
--   2. Add the hot-path FK indexes the advisor named + the A-14 discovery index
--      providers(status, provider_type). (provider_reviews(provider_id) already
--      exists from 0014.) Idempotent: CREATE INDEX IF NOT EXISTS.
--
-- Only the ~11 highest-traffic unindexed FKs are added here; the ~45 low-traffic
-- ones the advisor also lists are deliberately left (an index that is never
-- scanned is pure write overhead). Harness applies this on the full schema so
-- both indexes of each pair exist and the drops are exercised.

-- 1) Drop duplicate indexes (keep the *_id-suffixed sibling).
DROP INDEX IF EXISTS idx_pets_owner;                 -- keep idx_pets_owner_user_id
DROP INDEX IF EXISTS idx_post_barks_post;            -- keep idx_post_barks_post_id
DROP INDEX IF EXISTS idx_post_barks_user;            -- keep idx_post_barks_user_id
DROP INDEX IF EXISTS idx_post_paws_post;             -- keep idx_post_paws_post_id
DROP INDEX IF EXISTS idx_post_paws_user;             -- keep idx_post_paws_user_id
DROP INDEX IF EXISTS idx_posts_pet;                  -- keep idx_posts_pet_id
DROP INDEX IF EXISTS idx_posts_user;                 -- keep idx_posts_user_id
DROP INDEX IF EXISTS idx_user_profiles_auth_user;    -- keep idx_user_profiles_auth_user_id

-- 2a) Missing hot-path FK indexes.
CREATE INDEX IF NOT EXISTS idx_care_access_grants_pet_id
  ON care_access_grants (pet_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_user_id
  ON notifications (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_vet_appointments_service_id
  ON vet_appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_vet_appointments_staff_user_id
  ON vet_appointments (staff_user_id);
CREATE INDEX IF NOT EXISTS idx_vet_notes_appointment_id
  ON vet_notes (appointment_id);
CREATE INDEX IF NOT EXISTS idx_rx_fulfillment_orders_pet_id
  ON rx_fulfillment_orders (pet_id);
CREATE INDEX IF NOT EXISTS idx_walk_requests_pet_id
  ON walk_requests (pet_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_pet_id
  ON event_rsvps (pet_id);
CREATE INDEX IF NOT EXISTS idx_health_medical_care_logs_routine_id
  ON health_medical_care_logs (routine_id);
CREATE INDEX IF NOT EXISTS idx_health_wellness_logs_routine_id
  ON health_wellness_logs (routine_id);
CREATE INDEX IF NOT EXISTS idx_reminder_dismissals_routine_id
  ON reminder_dismissals (routine_id);

-- 2b) Discovery index (A-14): the providers listing filters on status + type.
-- (provider_reviews(provider_id) is ALREADY indexed by idx_provider_reviews_provider_id
--  from 0014 — the A-14 "if missing" note; nothing to add there.)
CREATE INDEX IF NOT EXISTS idx_providers_status_provider_type
  ON providers (status, provider_type);
