-- 0128_care_access_grants_active_unique.sql
-- Dedup backstop for care access grants — AUDIT_2026-09 finding A-26 (P2).
--
-- ⚠️ HAND-APPLY AFTER REVIEW (adds a UNIQUE constraint; a build over pre-existing
--    duplicate active grants would FAIL — de-dup first, see the runbook).
--
-- WHY. POST /api/care-access/grants dedups with a select-then-insert: two
-- concurrent requests both find no existing grant and both insert, leaving two
-- active grants for the same (provider_id, pet_id). There is no unique backstop
-- (0015 created only non-unique indexes).
--
-- WHAT. A PARTIAL unique index over the ACTIVE lifecycle states only, so a pet
-- can still accumulate historical revoked/expired/denied grant rows for the same
-- provider (audit trail) but only ONE pending-or-active grant at a time. The
-- route now catches the resulting 23505 and returns the winning grant instead of
-- a 500 (forward-compatible: before this index exists, no 23505 is raised).
--
-- HARNESS. The integration migrate runner applies this on a fresh DB with no
-- care_access_grants rows, so the index builds clean. On PROD, run the de-dup in
-- the runbook FIRST (there may already be duplicate active grants — that is the
-- bug this closes), then build the index (CONCURRENTLY, outside a txn, preferred
-- on prod to avoid a write lock; the plain form below is what the harness runs).

CREATE UNIQUE INDEX IF NOT EXISTS uq_care_access_grants_active_provider_pet
  ON care_access_grants (provider_id, pet_id)
  WHERE status IN ('pending', 'active');
