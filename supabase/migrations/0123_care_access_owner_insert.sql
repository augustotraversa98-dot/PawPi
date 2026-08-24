-- 0123_care_access_owner_insert.sql
-- BUGFIX (GitHub issue #506): owner-initiated care sharing was blocked by RLS.
--
-- `POST /api/care-access/grants` is the OWNER-INITIATED "Share clinic history" path
-- (booking detail → share). It inserts an ACTIVE grant with requested_by='owner' and
-- owner_user_id = the caller (see the route: it first verifies `pets WHERE id = :petId
-- AND owner_user_id = :me`, so the pet provably belongs to the caller).
--
-- But the INSERT policy from 0025 (R2f) only allowed the PROVIDER-request branch:
--     app_is_active_staff_of(provider_id) AND requested_by = 'provider'
-- with NO owner branch. Under FORCE RLS the owner's insert therefore ALWAYS failed the
-- WITH CHECK → the route 500s and owner-initiated sharing (an advertised feature) never
-- works. 0025's own comment ("the owner never inserts grants") predates that feature.
--
-- This migration replaces ONLY the care_access_grants INSERT policy, adding an owner
-- branch alongside the untouched provider branch. Everything else (SELECT/UPDATE/DELETE
-- policies, FORCE RLS, care_access_audit) is unchanged.
--
-- ── The owner branch, and why it is safe ──────────────────────────────────────
-- A grant CONFERS provider access: 0019's app_provider_has_grant(pet_id, scope) — the
-- SECURITY DEFINER helper every medical/pet policy consults — matches a grant purely on
-- (pet_id, provider_id-via-staff, status, scope). It does NOT consult owner_user_id. So
-- an owner-insert branch keyed only on `owner_user_id = current_app_user_id()` would be a
-- privilege-escalation hole: a caller could insert (owner_user_id = me, pet_id = SOMEONE
-- ELSE'S pet, provider_id = any provider) and thereby grant that provider read access to
-- a pet they do not own.
--
-- The owner branch therefore gates on OWNERSHIP OF THE SUBJECT (the pet), using the exact
-- ownership convention the codebase already uses — pets.owner_user_id = current_app_user_id()
-- (0020) — expressed as a subquery (the same in-policy subquery shape 0054's
-- insurance_plans_read / 0029's payments use):
--     requested_by = 'owner'
--     AND owner_user_id = current_app_user_id()
--     AND pet_id IN (SELECT id FROM pets WHERE owner_user_id = current_app_user_id())
-- The pet subquery is the real gate ("the caller owns this pet"); the owner_user_id
-- equality additionally pins the stored owner column to the caller, keeping the row
-- consistent with the owner SELECT trust view (0025) and the owner-only UPDATE policy.
-- The route only ever grants READ scopes (medical_read) — the policy imposes no scope
-- constraint (that stays app-layer, as the provider branch already does).
--
-- The `pets` subquery reads pets, which is FORCE-RLS'd by 0020. That is fine and does NOT
-- recurse: a care_access_grants policy referencing pets is not a cycle (pets' policies
-- never reference care_access_grants), and the subquery runs under the caller's own pets
-- SELECT policy (owner_user_id = current_app_user_id()) — which returns exactly the
-- caller's pets, the set we want to gate on. current_app_user_id() is STABLE and returns
-- NULL when no identity is set, so a no-identity caller matches zero pets → denied.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT yet
-- applied to Supabase. See docs/rls-hardening.md. Plain idempotent DDL (DROP … IF EXISTS
-- then CREATE), no dollar-quoting, so the whole file runs in one simple-query call.
-- Mirrored into supabase/supabase_schema.sql.

-- INSERT: EITHER the provider-request branch (active staff of provider_id requesting), OR
-- the owner-initiated branch (the caller owns the subject pet, requesting as 'owner').
drop policy if exists care_access_grants_insert on care_access_grants;
create policy care_access_grants_insert on care_access_grants
  for insert
  with check (
    (
      app_is_active_staff_of(provider_id)
      and requested_by = 'provider'
    )
    or (
      requested_by = 'owner'
      and owner_user_id = current_app_user_id()
      and pet_id in (select id from pets where owner_user_id = current_app_user_id())
    )
  );
