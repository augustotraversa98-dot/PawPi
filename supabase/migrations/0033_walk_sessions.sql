-- 0033_walk_sessions.sql
-- Phase 2 ticket 2.7 (docs/phase2-tickets/2.7-walking-gps.md,
-- docs/phase2-superapp-master-plan.md §1 walking row): the WALKER capability module.
-- An owner books a walk (the GENERALIZED booking from 2.4, capability='walker':
-- on-demand = immediate slot, recurring = pack/weekly), a walker CHECKS IN and the
-- route is GPS-tracked LIVE, the owner WATCHES, and on finish a WALK REPORT
-- (distance/duration/route/potty/notes/photos) flows into the pet's HEALTH TIMELINE.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — ONE new table: walk_sessions.
-- ════════════════════════════════════════════════════════════════════════════════
-- The live GPS session is the only NEW thing walking needs. Everything else is REUSE:
--   * the walk MENU is provider_services tagged capability='walker' (no new table);
--   * the BOOKING is a vet_appointments/provider_bookings row, capability='walker'
--     (0030, ticket 2.4 — no new booking table; recurrence_rule carries pack/weekly);
--   * the FEE is an orders/payments row (0029, ticket 2.3);
--   * live COORDINATION is the owner↔provider chat (0031, ticket 2.5);
--   * the WALK REPORT does NOT live on walk_sessions as the owner's source of truth —
--     on finish the route writes a health_walk_log (distance/duration/route summary +
--     potty events) via the EXISTING health-log path (health_walk_logs + the
--     health_timeline_events 'walk' event /api/health/timeline already surfaces). The
--     walk_sessions row is the LIVE/operational record (status, the GPS point stream,
--     the walker's working copy); the OWNER's health timeline is fed by the existing
--     health-log write, NOT a parallel one. The mobile owner already has the
--     PostWalkFeedback path that POSTs /api/health/walk-logs — the finish route mirrors
--     that exact shape so a provider-led walk lands identically to a self-logged one.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- LIVE-TRACKING CHOICE (documented per the ticket — don't over-build).
-- ════════════════════════════════════════════════════════════════════════════════
-- SHORT POLLING, not Supabase Realtime. The walker app POSTs GPS points to the
-- session route while the walk is in_progress (THROTTLED — a point every few seconds,
-- appended to walk_sessions.route); the owner app GETs the session on a short interval
-- (refetchInterval, the SAME lightweight pattern chat used in 2.5 — useMyThreads /
-- useThreadMessages poll, no websocket infra). No new realtime dependency, no new
-- server push, no Supabase Realtime channel/RLS-on-broadcast surface to harden. If
-- live latency ever needs to drop below the poll interval, Supabase Realtime on this
-- table (the participant RLS below already scopes who may read a row) is the documented
-- upgrade path — deliberately deferred.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CONSENT / ACCESS DECISION (documented per the ticket).
-- ════════════════════════════════════════════════════════════════════════════════
-- A walk session is provider→pet-data: the walker writes the live route + report onto
-- the OWNER's pet. We MIRROR the existing provider-write routes (grooming via
-- assertCareAccess, 2.6) so enforcement is identical to every other provider pet-data
-- write:
--   * APP LAYER: the walker session routes call assertCareAccess(petId, providerId,
--     'health_logs_write', …) — active staff + an active grant whose scopes include
--     'health_logs_write' — and write the care_access_audit row. The finish route's
--     health_walk_logs write lands in OWNER context (owner_user_id =
--     pets.owner_user_id), exactly like the grooming route derives the owner from the
--     pet. The MODULE itself is gated by requireProviderCapability(providerId,'walker')
--     (2.1) BEFORE any pet data is touched. Capability ≠ data access.
--   * RLS LAYER (this file): walk_sessions is PARTICIPANT-SCOPED — the OWNER (FOR ALL)
--     + the ASSIGNED active walker-staff of the provider (per-command). "Assigned" is
--     the crux: a walker may only read/write the session they are the staff_user_id of
--     (and must be active staff of that provider), NOT any session of the provider —
--     this is what keeps LIVE LOCATION from leaking to non-participants (an outsider,
--     another owner, even another walker of the same provider all read ZERO). The owner
--     ALWAYS sees their own sessions (the live map + the report); the assigned walker
--     reads/writes only theirs. This is the participant shape of chat (0031): owner
--     branch OR provider-staff branch, no wider.
--   * 'health_logs_write' reuses the scope grooming introduced (free-form text[],
--     0015 has NO CHECK on values) — the owner approving a walker's request adds it,
--     exactly like grooming. No constraint change.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the pet's owner). provider_id is the
-- walker provider; staff_user_id is the assigned walker's user_profiles.id. Provider
-- access is by active-staff MEMBERSHIP + assignment, never user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new table are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the table is
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- booking columns (0016/0030), provider_capabilities (0027), the payment tables (0029),
-- chat (0031) and groom_sessions (0032) relied on. No per-table re-grant; the
-- as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. walk_sessions — one row per booked walk (live + the operational record).
-- ════════════════════════════════════════════════════════════════════════════════
--   booking_id      — the booking this walk fulfils (vet_appointments id, ticket 2.4).
--                     Nullable + ON DELETE SET NULL: a removed booking only unlinks the
--                     session; the owner keeps the walk record.
--   pet_id/owner_user_id/provider_id — the standard scoping triple. owner_user_id =
--                     pets.owner_user_id (the owner key), set by the route from the pet.
--   staff_user_id   — the ASSIGNED walker's user_profiles.id (the participant on the
--                     provider side). Nullable + ON DELETE SET NULL: an unassigned
--                     session (scheduled, not yet picked up) has none. The RLS provider
--                     branch requires staff_user_id = the caller, so an unassigned
--                     session is provider-invisible until assigned — the owner still
--                     sees it (owner branch).
--   status          — scheduled → in_progress (checked in) → finished (report written)
--                     | cancelled. CHECK-constrained.
--   started_at/ended_at — check-in / finish stamps.
--   distance_m      — total distance in METRES (numeric); duration_s in SECONDS.
--   route           — jsonb ARRAY of GPS points [{lat,lng,t}] appended live by the
--                     walker (throttled). Default '[]' so an empty session is valid.
--   potty_pee/potty_poo — boolean flags (did the dog pee / poo on the walk).
--   notes           — the walker's free-text note for the report.
--   photo_urls[]    — Supabase Storage URLs of walk photos (the existing upload path).
create table if not exists walk_sessions (
  id              integer generated by default as identity primary key,
  booking_id      integer references vet_appointments(id) on delete set null,
  pet_id          integer not null references pets(id) on delete cascade,
  owner_user_id   integer not null references user_profiles(id) on delete cascade,
  provider_id     integer not null references providers(id) on delete cascade,
  staff_user_id   integer references user_profiles(id) on delete set null,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'in_progress', 'finished', 'cancelled')),
  started_at      timestamptz,
  ended_at        timestamptz,
  distance_m      numeric(10, 2),
  duration_s      integer,
  route           jsonb not null default '[]'::jsonb,
  potty_pee       boolean not null default false,
  potty_poo       boolean not null default false,
  notes           text,
  photo_urls      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_walk_sessions_pet_id on walk_sessions (pet_id);
create index if not exists idx_walk_sessions_owner_user_id on walk_sessions (owner_user_id);
create index if not exists idx_walk_sessions_provider_id on walk_sessions (provider_id);
create index if not exists idx_walk_sessions_staff_user_id on walk_sessions (staff_user_id);
create index if not exists idx_walk_sessions_booking_id on walk_sessions (booking_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. RLS — walk_sessions. PARTICIPANT-SCOPED (the crux + the live-location guard).
-- ════════════════════════════════════════════════════════════════════════════════
-- Visible/writable to EXACTLY: (a) the OWNER (FOR ALL) and (b) the ASSIGNED active
-- walker-staff of the provider (per-command read/insert/update). No one else — an
-- outsider, another owner, and even another walker of the SAME provider all read ZERO,
-- so a session's LIVE LOCATION never leaks to a non-participant. app_is_active_staff_of
-- (0023) is a SECURITY DEFINER helper over provider_staff, so the staff check bypasses
-- that table's RLS and never recurses.
alter table walk_sessions enable row level security;
alter table walk_sessions force row level security;

-- Owner: full control over their own pets' walk sessions (the live map + the report;
-- they may also cancel/correct). USING + WITH CHECK owner_user_id = current_app_user_id().
drop policy if exists walk_sessions_owner_all on walk_sessions;
create policy walk_sessions_owner_all on walk_sessions
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — the ASSIGNED walker reads their own session (the live route they
-- are posting). staff_user_id = caller AND the caller is active staff of the provider.
-- A non-assigned walker (staff_user_id <> caller, or NULL) reads zero → live location
-- is participant-only.
drop policy if exists walk_sessions_walker_read on walk_sessions;
create policy walk_sessions_walker_read on walk_sessions
  for select
  using (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );

-- Provider INSERT — a walker checks in / creates the session they are assigned to.
-- WITH CHECK: the new row's staff_user_id must be the caller AND the caller active
-- staff of the provider. A walker cannot create a session assigned to someone else,
-- nor for a provider they aren't staff of.
drop policy if exists walk_sessions_walker_insert on walk_sessions;
create policy walk_sessions_walker_insert on walk_sessions
  for insert
  with check (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );

-- Provider UPDATE — the assigned walker posts GPS points / writes the report on the
-- session they own. USING gates the existing row (must be theirs); WITH CHECK gates the
-- new row too, so a walker cannot re-assign a session away from themselves while editing.
drop policy if exists walk_sessions_walker_update on walk_sessions;
create policy walk_sessions_walker_update on walk_sessions
  for update
  using (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  )
  with check (
    staff_user_id = current_app_user_id()
    and app_is_active_staff_of(provider_id)
  );
