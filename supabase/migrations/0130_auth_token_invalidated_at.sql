-- 0130_auth_token_invalidated_at.sql
-- Server-side JWT revocation cutoff — AUDIT_2026-09 finding A-05 (P1).
--
-- ⚠️ HAND-APPLY AFTER REVIEW (auth core; pairs with app code that reads this
--    column on every /api/* request). Adds one nullable column, no data change.
--
-- WHY. The session is a 30-day JWT with no rotation and no server-side
-- revocation: logout is local-only and a password reset does not invalidate
-- already-issued tokens (the reset clears auth_sessions, which the JWT strategy
-- never reads). A leaked/replayed bearer therefore keeps working for up to 30
-- days even after the owner resets their password.
--
-- WHAT. A per-user "tokens issued before this instant are dead" cutoff. The
-- revocation guard (utils/tokenRevocation.js) 401s any request whose JWT `iat`
-- predates this value. Bumped on password reset, sign-out-everywhere and account
-- deletion. NULL (the default) means "nothing revoked" — existing sessions are
-- unaffected until one of those events sets it.
--
-- auth_users is one of the 5 RLS-exempt identity tables (documented allowlist);
-- this is an additive nullable column, so no RLS/policy change is required.

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS token_invalidated_at timestamptz;
