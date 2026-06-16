-- 0025_rls_consent_ledger.sql
-- RLS hardening R2f (docs/rls-hardening.md §R2f, provider-design.md §2 Consent + §3
-- enforcement): the CONSENT LEDGER — care_access_grants (the per-(pet ↔ provider)
-- grant the owner approves/revokes) + care_access_audit (the append-only access log
-- assertCareAccess writes). This is the FINAL R2 policy group: with it, every real
-- table is FORCE-RLS'd. Mirrors the routes EXACTLY — no wider (read directly to pin
-- each predicate):
--   care_access_grants — SELECT: owner (the trust view) OR active staff of provider_id
--                          (REQUIRED — see the RETURNING-snapshot note below — and the
--                          assertCareAccess grant lookup runs a direct SELECT as staff);
--                        INSERT: active staff of provider_id AND requested_by='provider'
--                          (the access-request route; the owner never inserts grants);
--                        UPDATE: owner only (approve/deny/revoke);
--                        DELETE: none (grants are status-flipped, never deleted — no
--                          delete route → denied under FORCE).
--   care_access_audit  — INSERT: staff_user_id = me (assertCareAccess writes its own row);
--                        SELECT: NONE (append-only, no reader route today → zero for all
--                          under FORCE — correct); UPDATE/DELETE: none (append-only).
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase. R3 applies the whole accumulated R2 set at the DATABASE_URL
-- cutover to pawpi_app. Enabling FORCE RLS in prod now (privileged owner connection,
-- only pilot routes set identity) would make non-identity routes read zero rows — an
-- outage. See docs/rls-hardening.md.
--
-- DML + sequence grants for BOTH tables are ALREADY provided by 0019's blanket
-- `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES`:
-- both tables land in 0015, which predates 0019, so the blanket grant covered them —
-- exactly as pets (0020) / social (0021) / owner-private (0022) / provider-records
-- (0023) / provider-business (0024) relied on. No per-table re-grant; the as-pawpi_app
-- test is the proof the grants suffice.
--
-- ⚠️ RECURSION RE-PROOF: 0019's app_provider_has_grant (SECURITY DEFINER, STABLE,
-- pinned search_path) READS care_access_grants — which THIS migration FORCE-RLS's.
-- Being DEFINER (owned by the privileged migration role) the helper still BYPASSES that
-- RLS: the grant lookup is not re-filtered by care_access_grants' own SELECT policy (no
-- under-count) and there is no policy recursion (a care_access_grants policy → helper →
-- care_access_grants policy → … is exactly what Postgres rejects with "infinite
-- recursion detected in policy" — and our grants policies never call the helper, so even
-- that indirect loop can't form). The proof is twofold: (a) the full R2a–R2e integration
-- suite stays green (R2d's medical tables + R2a's pets/booking exercise
-- app_provider_has_grant against care_access_grants — a broken/recursing grants RLS
-- would turn them red), and (b) an explicit assertion that app_provider_has_grant
-- returns correctly with care_access_grants under FORCE RLS.
--
-- No NEW helper: reuse 0023's app_is_active_staff_of(provider_id).
-- Idempotent (ENABLE/FORCE are no-ops if already set; DROP POLICY IF EXISTS guards
-- re-runs). Mirrored into supabase/supabase_schema.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. care_access_grants — per-command (reads differ from writes; only the owner acts).
alter table care_access_grants enable row level security;
alter table care_access_grants force row level security;

-- SELECT: the OWNER's trust view (GET /care-access/grants: WHERE owner_user_id = me) OR
-- active staff of the provider. The staff branch is NOT optional:
--   (a) the access-request route INSERTs with `RETURNING *`. The new row's owner_user_id
--       is the PET OWNER, not the requesting staff member, so an owner-only SELECT policy
--       would hide the just-created row and RETURNING would come back empty (the same
--       snapshot trap R2e hit with providers' draft-create). app_is_active_staff_of
--       (provider_id) is the only branch that lets the inserting staff read it back.
--   (b) assertCareAccess (utils/careAccess.js step 2) does a DIRECT `SELECT * FROM
--       care_access_grants WHERE provider_id = … AND status='active' …` as the acting
--       staff member — NOT via the DEFINER helper — so it needs this SELECT branch too.
-- The branch grants no read the care relationship doesn't already imply: a provider
-- seeing the grants for THEIR OWN provider is legitimate (assertCareAccess already lets
-- active staff act on active ones). A different provider's staff fails app_is_active_
-- staff_of(provider_id) → zero.
drop policy if exists care_access_grants_select on care_access_grants;
create policy care_access_grants_select on care_access_grants
  for select
  using (
    owner_user_id = current_app_user_id()
    or app_is_active_staff_of(provider_id)
  );

-- INSERT: only active staff of the provider, and only as a provider request
-- (requested_by='provider'). The owner never inserts grants — they approve a pending
-- one via UPDATE. scope/booking validity is app-layer (the route enumerates VALID_SCOPES
-- and verifies the booking); the policy gate is staff membership of provider_id. The new
-- row's owner_user_id is the pet owner — the INSERT WITH CHECK does NOT constrain it
-- (the route derives it from the pet), only that the caller is staff requesting.
drop policy if exists care_access_grants_insert on care_access_grants;
create policy care_access_grants_insert on care_access_grants
  for insert
  with check (
    app_is_active_staff_of(provider_id)
    and requested_by = 'provider'
  );

-- UPDATE: owner only (PATCH /care-access/grants/[grantId] approve/deny/revoke, scoped
-- WHERE owner_user_id = me). WITH CHECK defaults to USING — the transitions never change
-- owner_user_id, so the owner predicate still holds for the updated row, and the route's
-- `RETURNING *` (owner still = me) reads back fine. No provider UPDATE: a provider cannot
-- self-approve or alter a grant.
drop policy if exists care_access_grants_update on care_access_grants;
create policy care_access_grants_update on care_access_grants
  for update
  using (owner_user_id = current_app_user_id());

-- DELETE: no policy. Grants are status-flipped (pending→active→revoked/expired), never
-- deleted, and there is no delete route — so leaving DELETE un-policied means FORCE RLS
-- denies it for everyone, which is exactly the intended append-then-flip model.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. care_access_audit — APPEND-ONLY. assertCareAccess writes one row per successful
--    provider→pet-data access; nothing reads it yet (no audit-review UI), nothing mutates
--    it. So only an INSERT policy exists; SELECT/UPDATE/DELETE have none → FORCE RLS
--    denies all three for everyone, which is correct for an append-only log.
alter table care_access_audit enable row level security;
alter table care_access_audit force row level security;

-- INSERT: a staff member writes their OWN audit row. assertCareAccess runs as the acting
-- staff under pawpi_app and inserts with staff_user_id = that user (no RETURNING — the
-- helper does not read the audit row back, so no SELECT policy is needed for the app
-- path). WITH CHECK pins staff_user_id = me so one staff member cannot forge an audit row
-- attributed to another.
drop policy if exists care_access_audit_insert on care_access_audit;
create policy care_access_audit_insert on care_access_audit
  for insert
  with check (staff_user_id = current_app_user_id());

-- SELECT: none today. FUTURE: when an audit-review feature ships (an owner sees who
-- accessed their pet's data), THAT ticket adds a FOR SELECT policy — owner via the
-- grant_id → care_access_grants.owner_user_id join (and/or the acting staff member
-- reading their own rows). Until then, zero rows for everyone is the safe default.
-- UPDATE/DELETE: none — an audit row is immutable.
