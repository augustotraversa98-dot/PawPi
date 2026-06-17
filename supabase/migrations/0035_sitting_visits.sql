-- 0035_sitting_visits.sql
-- Phase 2 ticket 2.9 (docs/phase2-tickets/2.9-sitting.md,
-- docs/phase2-superapp-master-plan.md §1 sitting row): the SITTER capability module —
-- in-home DROP-IN visits, OVERNIGHT, and HOUSE-SITTING, with per-visit LOGS + photo/video
-- updates and a MEET-AND-GREET pre-booking step. An owner books a sitting service (the
-- GENERALIZED booking from 2.4, capability='sitter': a single drop-in or a recurring pack
-- of drop-ins via recurrence_rule, an overnight, or a house-sit), optionally aligns with
-- the sitter in a MEET-AND-GREET first, the sitter LOGS each visit (status + notes +
-- photo/video + optional location check-in), and the OWNER reads those visit updates.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — ONE additive column + ONE new table: sitting_visits.
-- ════════════════════════════════════════════════════════════════════════════════
-- The per-visit log is the only NEW table sitting needs. Everything else is REUSE:
--   * the sitting MENU (drop-in / overnight / house-sit, each with duration + price) is
--     provider_services tagged capability='sitter' (no new table);
--   * the BOOKING is a vet_appointments/provider_bookings row, capability='sitter'
--     (0030, ticket 2.4 — no new booking table; recurrence_rule carries a recurring
--     drop-in pack, e.g. 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
--   * the FEE is an orders/payments row (0029, ticket 2.3);
--   * COORDINATION (incl. the MEET-AND-GREET conversation) is the owner↔provider chat
--     (0031, ticket 2.5) — sitting does NOT build any new messaging;
--   * visit PHOTOS/VIDEO reuse the existing Supabase Storage upload path; their URLs are
--     stored on sitting_visits (photo_urls[] / video_urls[]).
--
--   (1) vet_appointments.meet_and_greet — the MEET-AND-GREET FLAG. A lightweight
--       pre-booking step so owner + sitter ALIGN before the engagement. Additive boolean,
--       DEFAULT false so every existing booking (incl. every vet row) is unchanged. An
--       owner books with meet_and_greet=true to request an intro session; the two
--       coordinate over chat (2.5); the actual sitting engagement is booked normally. A
--       FLAG (not a new status) keeps the booking lifecycle (requested→confirmed→…)
--       intact — the meet-and-greet is just a booking that is tagged as the intro, so it
--       reuses the entire 2.4 booking workflow + RLS with NO new state machine.
--   (2) sitting_visits — one row per logged visit (the operational record the sitter
--       posts and the owner reads).
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CONSENT / ACCESS DECISION (documented per the ticket — mirrors walker 2.7 / daycare 2.8).
-- ════════════════════════════════════════════════════════════════════════════════
-- A sitting visit is provider→pet-data: the sitter writes a visit log (+ media + an
-- optional location check-in) onto the OWNER's pet. We MIRROR the existing provider-write
-- routes (grooming via assertCareAccess, 2.6; walking 2.7; daycare 2.8) so enforcement is
-- identical to every other provider pet-data write:
--   * APP LAYER: the sitter visit routes call assertCareAccess(petId, providerId,
--     'health_logs_write', …) — active staff + an active grant whose scopes include
--     'health_logs_write' — and write the care_access_audit row. The MODULE itself is
--     gated by requireProviderCapability(providerId,'sitter') (2.1) BEFORE any pet data is
--     touched. Capability ≠ data access.
--   * RLS LAYER (this file): sitting_visits is PARTICIPANT-SCOPED — the OWNER (FOR ALL)
--     + the ASSIGNED active sitter-staff of the provider (per-command). "Assigned" is the
--     crux: a sitter may only read/write the visit they are the staff_user_id of (and must
--     be active staff of that provider), NOT any visit of the provider — this is what keeps
--     a visit's NOTES/MEDIA/LOCATION from leaking to non-participants (an outsider, another
--     owner, even another sitter of the same provider all read ZERO). The owner ALWAYS sees
--     their own visits (the updates feed); the assigned sitter reads/writes only theirs.
--     This is the participant shape of walk_sessions (0033) / chat (0031): owner branch OR
--     provider-staff branch, no wider — the guard the ticket names ("visit media not exposed
--     to non-participants").
--   * 'health_logs_write' reuses the scope grooming/walking/daycare introduced (free-form
--     text[], 0015 has NO CHECK on values) — the owner approving a sitter's request adds
--     it, exactly like the other service modules. No constraint change.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the pet's owner). provider_id is the
-- sitter provider; staff_user_id is the assigned sitter's user_profiles.id. Provider
-- access is by active-staff MEMBERSHIP + assignment, never user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new table are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the table is
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- booking columns (0016/0030), provider_capabilities (0027), the payment tables (0029),
-- chat (0031), groom_sessions (0032), walk_sessions (0033) and daycare (0034) relied on.
-- No per-table re-grant; the as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 0. vet_appointments.meet_and_greet — the MEET-AND-GREET pre-booking FLAG.
-- ════════════════════════════════════════════════════════════════════════════════
-- Additive + defaulted false: every existing booking (incl. all vet rows) is a normal
-- (non-meet-and-greet) booking, unchanged. A sitter booking with this flag set is the
-- lightweight INTRO step — owner + sitter align over chat (2.5) before the engagement —
-- and otherwise rides the entire 2.4 booking lifecycle + RLS with no new state.
alter table vet_appointments
  add column if not exists meet_and_greet boolean not null default false;

-- Re-create the provider_bookings VIEW (0030) so the GENERAL booking read surface also
-- exposes meet_and_greet. security_invoker=true (unchanged) so it still inherits
-- vet_appointments' RLS verbatim and leaks nothing. Additive column only; every existing
-- consumer keeps its columns. (A view is relkind 'v' → outside the RLS completeness guard.)
create or replace view provider_bookings
with (security_invoker = true)
as
  select
    va.id,
    va.pet_id,
    va.owner_user_id,
    va.provider_id,
    va.provider_location_id,
    va.service_id,
    va.staff_user_id,
    va.capability,
    va.title,
    va.appointment_date,
    va.appointment_time,
    va.start_at,
    va.end_at,
    va.recurrence_rule,
    va.booking_status,
    va.status,
    va.source,
    va.order_id,
    va.reason_for_visit,
    va.notes,
    va.created_at,
    va.updated_at,
    va.deleted_at,
    -- 2.9: meet-and-greet flag appended LAST. CREATE OR REPLACE VIEW only permits NEW
    -- columns at the END of the select list (it cannot reorder/insert existing ones), so
    -- meet_and_greet must come after deleted_at to keep the replace idempotent.
    va.meet_and_greet
  from vet_appointments va;

grant select on provider_bookings to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. sitting_visits — one row per logged sitting visit (the operational record).
-- ════════════════════════════════════════════════════════════════════════════════
--   booking_id      — the booking this visit fulfils (vet_appointments id, ticket 2.4).
--                     Nullable + ON DELETE SET NULL: a removed booking only unlinks the
--                     visit; the owner keeps the visit record + its updates/media.
--   pet_id/owner_user_id/provider_id — the standard scoping triple. owner_user_id =
--                     pets.owner_user_id (the owner key), set by the route from the pet.
--   staff_user_id   — the ASSIGNED sitter's user_profiles.id (the participant on the
--                     provider side). Nullable + ON DELETE SET NULL: an unassigned visit
--                     (scheduled, not yet picked up) has none. The RLS provider branch
--                     requires staff_user_id = the caller, so an unassigned visit is
--                     provider-invisible until assigned — the owner still sees it (owner
--                     branch).
--   visit_at        — when the visit happened / is scheduled for (timestamptz).
--   status          — scheduled → completed (the update posted) | cancelled. CHECK-
--                     constrained. A drop-in pack books many bookings (2.4 recurrence);
--                     each materialised visit is one sitting_visits row.
--   notes           — the sitter's free-text update for the visit ("fed + walked, very
--                     happy").
--   photo_urls[]    — Supabase Storage URLs of visit photos (the existing upload path).
--   video_urls[]    — Supabase Storage URLs of visit videos (the existing upload path).
--   check_in_lat/lng — OPTIONAL location check-in (the sitter's coordinates at the visit).
--                     Nullable: a visit without a check-in is valid. numeric, not a PostGIS
--                     point — a single lightweight check-in, not a tracked route.
create table if not exists sitting_visits (
  id              integer generated by default as identity primary key,
  booking_id      integer references vet_appointments(id) on delete set null,
  pet_id          integer not null references pets(id) on delete cascade,
  owner_user_id   integer not null references user_profiles(id) on delete cascade,
  provider_id     integer not null references providers(id) on delete cascade,
  staff_user_id   integer references user_profiles(id) on delete set null,
  visit_at        timestamptz,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'completed', 'cancelled')),
  notes           text,
  photo_urls      text[] not null default '{}',
  video_urls      text[] not null default '{}',
  check_in_lat    numeric(9, 6),
  check_in_lng    numeric(9, 6),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_sitting_visits_pet_id on sitting_visits (pet_id);
create index if not exists idx_sitting_visits_owner_user_id on sitting_visits (owner_user_id);
create index if not exists idx_sitting_visits_provider_id on sitting_visits (provider_id);
create index if not exists idx_sitting_visits_staff_user_id on sitting_visits (staff_user_id);
create index if not exists idx_sitting_visits_booking_id on sitting_visits (booking_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. RLS — sitting_visits. PARTICIPANT-SCOPED (the crux + the visit-media guard).
-- ════════════════════════════════════════════════════════════════════════════════
-- Visible/writable to EXACTLY: (a) the OWNER (FOR ALL) and (b) the ASSIGNED active
-- sitter-staff of the provider (per-command read/insert/update). No one else — an
-- outsider, another owner, and even another sitter of the SAME provider all read ZERO,
-- so a visit's NOTES / PHOTOS / VIDEO / LOCATION never leak to a non-participant (the
-- ticket's DO-NOT). app_is_active_staff_of (0023) is a SECURITY DEFINER helper over
-- provider_staff, so the staff check bypasses that table's RLS and never recurses.
alter table sitting_visits enable row level security;
alter table sitting_visits force row level security;

-- Owner: full control over their own pets' sitting visits (the updates feed; they may
-- also cancel/correct). USING + WITH CHECK owner_user_id = current_app_user_id().
drop policy if exists sitting_visits_owner_all on sitting_visits;
create policy sitting_visits_owner_all on sitting_visits
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — the ASSIGNED sitter reads their own visit (the update they post).
-- staff_user_id = caller AND the caller is active staff of the provider. A non-assigned
-- sitter (staff_user_id <> caller, or NULL) reads zero → visit media is participant-only.
drop policy if exists sitting_visits_sitter_read on sitting_visits;
create policy sitting_visits_sitter_read on sitting_visits
  for select
  using (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );

-- Provider INSERT — a sitter logs / creates the visit they are assigned to. WITH CHECK:
-- the new row's staff_user_id must be the caller AND the caller active staff of the
-- provider. A sitter cannot create a visit assigned to someone else, nor for a provider
-- they aren't staff of.
drop policy if exists sitting_visits_sitter_insert on sitting_visits;
create policy sitting_visits_sitter_insert on sitting_visits
  for insert
  with check (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );

-- Provider UPDATE — the assigned sitter edits the visit they own (append media, finish).
-- USING gates the existing row (must be theirs); WITH CHECK gates the new row too, so a
-- sitter cannot re-assign a visit away from themselves while editing.
drop policy if exists sitting_visits_sitter_update on sitting_visits;
create policy sitting_visits_sitter_update on sitting_visits
  for update
  using (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  )
  with check (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );
