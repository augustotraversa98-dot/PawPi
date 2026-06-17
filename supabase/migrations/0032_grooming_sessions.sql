-- 0032_grooming_sessions.sql
-- Phase 2 ticket 2.6 (docs/phase2-tickets/2.6-grooming.md,
-- docs/phase2-superapp-master-plan.md §1 grooming row + §2): the GROOMER capability
-- module. A groomer publishes a service menu (provider_services tagged
-- capability='groomer'), an owner books a groom (the GENERALIZED booking from 2.4,
-- capability='groomer'), and the groomer LOGS THE SESSION — before/after photos +
-- coat/skin notes — against the pet.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — ONE new table: groom_sessions.
-- ════════════════════════════════════════════════════════════════════════════════
-- The session is the only NEW thing grooming needs. Everything else is REUSE:
--   * the groom MENU is provider_services tagged capability='groomer' (no new table);
--   * the BOOKING is a vet_appointments/provider_bookings row, capability='groomer'
--     (0030, ticket 2.4 — no new booking table);
--   * the DEPOSIT/FEE is an orders/payments row (0029, ticket 2.3);
--   * RECURRENCE ("every 6 weeks") reuses the booking's recurrence_rule (0030) and the
--     EXISTING reminder engine — NO new reminder path, NO per-cadence code here.
--   * COAT/SKIN NOTES are NOT stored on groom_sessions as the source of truth — they
--     flow into the pet's HEALTH TIMELINE via the EXISTING health-log write
--     (health_general_checks: skin_fur_status + notes, already surfaced by
--     /api/health/timeline as a 'general_check' event). groom_sessions.coat_skin_notes
--     is a convenience copy for the groomer's own session card; the owner's health
--     timeline is fed by the existing health-log write, NOT a parallel one.
--   * BEFORE/AFTER photos reuse the existing Supabase Storage upload path; their URLs
--     are stored on groom_sessions (before_urls[]/after_urls[]) and SURFACE ON THE PET
--     PROFILE (the owner reads them via /api/pets/[id]/groom-sessions).
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CONSENT / ACCESS DECISION (documented per the ticket).
-- ════════════════════════════════════════════════════════════════════════════════
-- A grooming session is provider→pet-data: the groomer writes media + notes onto the
-- OWNER's pet. We MIRROR the existing provider-write routes (vet_notes via
-- assertCareAccess) rather than invent an "owner-shared by booking" path, so the
-- enforcement is identical to every other provider pet-data write:
--   * APP LAYER: the session-write route calls assertCareAccess(petId, providerId,
--     'health_logs_write', …) — active staff + an active grant whose scopes include
--     'health_logs_write' — and writes the care_access_audit row. The coat/skin
--     health-log write (health_general_checks) lands in OWNER context (owner_user_id =
--     pets.owner_user_id), exactly like the vet_notes route derives the owner from the pet.
--   * RLS LAYER (this file): groom_sessions is owner read/write (FOR ALL) + provider
--     READ/INSERT/UPDATE via app_provider_has_grant(pet_id, 'health_logs_write') — the
--     same SECURITY DEFINER grant helper the medical group uses (0019/0023). The owner
--     ALWAYS sees the session (before/after on the profile); the provider only with an
--     active health_logs_write grant. This is the two-tier shape of pets (0020) and the
--     provider-records group (0023): one owner FOR ALL + narrow provider command policies.
--   * 'health_logs_write' is a NEW scope value. scopes is a free-form text[] (0015 has
--     NO CHECK on the values), so no constraint change is needed — the value is added by
--     the grant-issuing path (owner approving a groomer's request), exactly like
--     'medical_write'/'vaccinations_write' before it.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the pet's owner). provider_id is the
-- grooming provider; provider access is by active-staff MEMBERSHIP + grant, never
-- user_profiles.role. Capability ≠ data access: the capability gate
-- (requireProviderCapability(providerId,'groomer')) only unlocks the MODULE; the pet-data
-- write is still gated by assertCareAccess + this RLS.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new table are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the table is
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- booking columns (0016/0030), provider_capabilities (0027), the payment tables (0029)
-- and chat (0031) relied on. No per-table re-grant; the as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. groom_sessions — one row per logged grooming session.
-- ════════════════════════════════════════════════════════════════════════════════
--   booking_id      — the booking this session fulfils (vet_appointments id, ticket 2.4).
--                     Nullable + ON DELETE SET NULL: a removed booking only unlinks the
--                     session; the owner keeps the before/after on the profile.
--   pet_id/owner_user_id/provider_id — the standard scoping triple. owner_user_id =
--                     pets.owner_user_id (the owner key), set by the route from the pet.
--   before_urls[]/after_urls[] — Supabase Storage URLs of the before/after photos
--                     (the existing upload path). Default '{}' so an empty session is
--                     valid (a groomer may log notes before uploading photos).
--   coat_skin_notes — the groomer's coat/skin observation. A CONVENIENCE COPY for the
--                     session card; the OWNER's health timeline is fed by the separate
--                     health_general_checks write (skin_fur_status + notes) the route does.
--   products_used   — free-text shampoo/conditioner/etc. used in the session.
--   next_due_at     — when the next groom is due (e.g. +6 weeks). Drives the owner's
--                     "book again" nudge; the actual reminder is the booking's
--                     recurrence_rule + the existing engine, NOT a new path here.
create table if not exists groom_sessions (
  id              integer generated by default as identity primary key,
  booking_id      integer references vet_appointments(id) on delete set null,
  pet_id          integer not null references pets(id) on delete cascade,
  owner_user_id   integer not null references user_profiles(id) on delete cascade,
  provider_id     integer not null references providers(id) on delete cascade,
  before_urls     text[] not null default '{}',
  after_urls      text[] not null default '{}',
  coat_skin_notes text,
  products_used   text,
  next_due_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_groom_sessions_pet_id on groom_sessions (pet_id);
create index if not exists idx_groom_sessions_owner_user_id on groom_sessions (owner_user_id);
create index if not exists idx_groom_sessions_provider_id on groom_sessions (provider_id);
create index if not exists idx_groom_sessions_booking_id on groom_sessions (booking_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. RLS — groom_sessions. Owner read/write (FOR ALL) + provider read/insert/update
--    via app_provider_has_grant(pet_id, 'health_logs_write'). No provider DELETE
--    (the route never deletes; the owner may, through the FOR ALL owner policy).
-- ════════════════════════════════════════════════════════════════════════════════
alter table groom_sessions enable row level security;
alter table groom_sessions force row level security;

-- Owner: full control over their own pets' sessions (read on the profile, and they may
-- correct/remove). USING + WITH CHECK owner_user_id = current_app_user_id().
drop policy if exists groom_sessions_owner_all on groom_sessions;
create policy groom_sessions_owner_all on groom_sessions
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — active staff with a health_logs_write grant read the sessions they
-- can write (the groomer's own session list for the pet). app_provider_has_grant
-- (0019) is a SECURITY DEFINER helper over provider_staff + care_access_grants, so it
-- bypasses those tables' RLS and never recurses.
drop policy if exists groom_sessions_provider_read on groom_sessions;
create policy groom_sessions_provider_read on groom_sessions
  for select
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider INSERT — log a new session. WITH CHECK gates on the same grant: a groomer
-- can only create a session for a pet they hold a health_logs_write grant on.
drop policy if exists groom_sessions_provider_insert on groom_sessions;
create policy groom_sessions_provider_insert on groom_sessions
  for insert
  with check (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider UPDATE — append before→after photos / edit notes on a session they own.
-- USING (the existing row must be one they can write) reused for the new row too
-- (pet_id is unchanged by the update, so the grant predicate holds for both).
drop policy if exists groom_sessions_provider_update on groom_sessions;
create policy groom_sessions_provider_update on groom_sessions
  for update
  using (app_provider_has_grant(pet_id, 'health_logs_write'));
