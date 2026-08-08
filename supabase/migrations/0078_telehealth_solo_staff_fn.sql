-- 0078_telehealth_solo_staff_fn.sql
-- Telehealth "session at booking" (Phase 1, solo providers). PURELY ADDITIVE — one SECURITY
-- DEFINER reader function + a grant. NO table, NO policy change, NO rename/drop. Same definer
-- pattern as app_provider_has_active_staff (0024) and app_get_provider_payment_account (0072).
--
-- WHY: when an OWNER books a telehealth appointment we want to pre-create the video-consult
-- session (telehealth_sessions, 0040) already ASSIGNED to the vet, so the owner's consult is
-- immediately visible (but time-gated). To assign it we must know WHO the vet is. That read
-- runs under the identity of the PAYING OWNER — who is NOT staff of the provider — and
-- provider_staff is FORCE-RLS'd behind provider_staff_select (0024,
-- USING app_is_active_staff_of(provider_id) OR user_profile_id = current_app_user_id()). So a
-- direct `SELECT ... FROM provider_staff` by the owner returns ZERO rows and can neither count
-- staff nor read a staff id. This controlled definer reader closes exactly that gap.
--
-- SOLO-ONLY BY DESIGN: returns the lone ELIGIBLE (role owner|vet) ACTIVE staff member's
-- user_profiles.id ONLY when there is EXACTLY ONE such staffer; NULL for zero or multiple.
-- That NULL is the caller's signal to create nothing and fall back to today's vet-first flow —
-- so an ambiguous (multi-vet) provider is never auto-assigned and never gets a duplicate
-- session. The booking route gates the whole step on capability='telehealth' before calling.
--
-- WHY A DEFINER READER IS SAFE (and NOT a downgrade of provider_staff_select):
--   * The RLS invariant is PRESERVED — a non-staff owner's DIRECT `select ... from
--     provider_staff` still returns ZERO. This is a separate, controlled server-side path that
--     returns ONLY a single user_profiles.id (an integer already used as staff_user_id on the
--     session it creates), never the staff row, role, or any other provider detail.
--   * Read-only + STABLE: no writes, no side effects.
--
-- ⚠️ HAND-APPLIED AFTER MERGE (no schema change; see the PR body) — mirrors 0040/0072.

create or replace function app_provider_solo_telehealth_staff(p_provider_id integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Exactly one eligible active staffer → their id; zero or multiple → NULL. max() over a
  -- single matching row is that row's id; the count guard collapses 0/≥2 to NULL.
  select case when count(*) = 1 then max(ps.user_profile_id) else null end
  from provider_staff ps
  where ps.provider_id = p_provider_id
    and ps.status = 'active'
    and ps.role = any (array['owner', 'vet']::text[])
$$;

grant execute on function app_provider_solo_telehealth_staff(integer) to pawpi_app;
