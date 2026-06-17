-- 0036_training_module.sql
-- Phase 2 ticket 2.10 (docs/phase2-tickets/2.10-training.md,
-- docs/phase2-superapp-master-plan.md §1 training row): the TRAINER capability module —
-- a trainer offers 1:1 SESSIONS, GROUP CLASSES (capacity-managed, multi-attendee) and
-- multi-session PROGRAMS; an owner books and (for programs) progresses through sessions
-- with trainer PROGRESS NOTES; optional async VIDEO LESSONS.
--
-- ⚠️ DISTINCT FROM THE CONSUMER "Training" TAB. The mobile app already has a Training tab
-- (anything/apps/mobile/src/app/(tabs)/training.jsx) — that is SELF/CONTENT training
-- (static how-to lessons, no provider, no DB). THIS module is the PROVIDER training
-- SERVICE: hiring a real trainer. It surfaces under Pet Services → Training (capability
-- discovery ?type=trainer), NOT inside the self-Training tab — it neither collides with nor
-- duplicates that tab. (The relationship is documented in the PR body + the mobile
-- more/training.jsx screen header.)
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — THREE new tables. Everything else is REUSE:
-- ════════════════════════════════════════════════════════════════════════════════
--   * the training MENU (1:1 session / group class / program, each with duration + price)
--     is provider_services tagged capability='trainer' (NO new table);
--   * the BOOKING is a vet_appointments/provider_bookings row, capability='trainer'
--     (0030, ticket 2.4 — NO new booking table; a group class = a multi-attendee slot,
--     a program = a series / recurrence_rule);
--   * the FEE (programs may be paid up front) is an orders/payments row (0029, ticket 2.3);
--   * COORDINATION is the owner↔provider chat (0031, ticket 2.5);
--   * VIDEO LESSONS reuse the existing Supabase Storage upload path; their URLs are stored
--     on training_programs (video_lesson_urls[]) and per-session on training_progress.
--
--   (1) training_programs — one row per program ENROLLMENT (per pet/owner/provider): the
--       package the owner bought, its total_sessions count, status, and the program-level
--       VIDEO-LESSON urls the owner can watch. A 1:1 course can also be modelled as a
--       1-session program; a pure ad-hoc 1:1 booking needs no program row.
--   (2) training_sessions — the scheduled session OCCURRENCES the trainer runs: a 1:1
--       session, a GROUP CLASS (capacity-managed, many attendees), or a session that
--       belongs to a program (program_id). A group class is the SHARED slot; its capacity
--       is the occupancy ceiling. Trainer-managed; a published provider's group classes are
--       publicly browseable so an owner can pick a class to join.
--   (3) training_progress — one row per (session, pet) ATTENDANCE + the trainer's PROGRESS
--       NOTE the owner reads, plus optional per-session video-lesson urls. This is ALSO the
--       group-class ROSTER row: capacity is enforced by COUNTING the live progress rows for
--       a class (the 2.8 count-based overbook pattern, generalized from a date range to a
--       single class slot). The owner reads their pet's progress only.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- GROUP-CLASS CAPACITY / OVERBOOK DECISION (documented per the ticket — reuses 2.8).
-- ════════════════════════════════════════════════════════════════════════════════
-- A group class is ONE training_sessions row carrying a capacity; each attendee is ONE
-- training_progress row (pet_id) on that session. There is no single unique index that can
-- express "<= N attendees", so — exactly like daycare occupancy (0034) — the booking route
-- COUNTS the live (non-cancelled) attendees of the class and refuses (clean 409) when that
-- count is already at training_sessions.capacity. capacity NULL = not capacity-managed
-- (a 1:1 session / an unlimited class). A partial index over the live attendee rows serves
-- the count.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CONSENT / ACCESS DECISION (documented per the ticket — mirrors grooming 2.6 / sitting 2.9).
-- ════════════════════════════════════════════════════════════════════════════════
-- Training progress is provider→pet-data: the trainer writes a progress note (+ video urls)
-- onto the OWNER's pet. We MIRROR the existing provider-write routes (grooming via
-- assertCareAccess, walking, daycare, sitting) so enforcement is identical:
--   * APP LAYER: the trainer routes call assertCareAccess(petId, providerId,
--     'health_logs_write', …) — active staff + an active grant whose scopes include
--     'health_logs_write' — and write the care_access_audit row. The MODULE itself is gated
--     by requireProviderCapability(providerId,'trainer') (2.1) BEFORE any pet data is
--     touched. Capability ≠ data access.
--   * RLS LAYER (this file):
--       - training_programs: OWNER read/write (FOR ALL) + provider read/insert/update via
--         app_provider_has_grant(pet_id,'health_logs_write') — the groom_sessions /
--         daycare_stays two-tier shape (the owner always sees their enrollment + video
--         lessons; the trainer only with an active grant).
--       - training_sessions: trainer CONFIGURATION/SCHEDULE (a class/series the trainer
--         runs). Active staff manage; a PUBLISHED provider's sessions are PUBLIC-readable
--         (an owner browses classes to join) — the daycare_requirements two-tier shape.
--         NOT pet-scoped (it is the per-provider class slot, not a per-pet record).
--       - training_progress: the per-pet attendance + progress note. OWNER read/write
--         (FOR ALL) + provider read/insert/update via app_provider_has_grant(pet_id,
--         'health_logs_write') — same two-tier shape as training_programs. The owner reads
--         their OWN pet's progress ONLY (the ticket's RLS test: "owner sees own pet's
--         progress only").
--   * 'health_logs_write' reuses the scope grooming/walking/daycare/sitting introduced
--     (free-form text[], 0015 has NO CHECK on values). No constraint change.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the pet's owner). provider_id is the
-- trainer provider; provider access is by active-staff MEMBERSHIP + grant, never
-- user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new tables are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the tables are
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- booking columns (0016/0030), provider_capabilities (0027), the payment tables (0029),
-- chat (0031), groom_sessions (0032), walk_sessions (0033), daycare (0034) and
-- sitting_visits (0035) relied on. No per-table re-grant; the as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. training_programs — one row per program ENROLLMENT (per pet/owner/provider).
-- ════════════════════════════════════════════════════════════════════════════════
--   booking_id      — the booking this enrollment fulfils (vet_appointments id, 2.4).
--                     Nullable + ON DELETE SET NULL: a removed booking only unlinks the
--                     enrollment; the owner keeps the program record + its progress/videos.
--   pet_id/owner_user_id/provider_id — the standard scoping triple. owner_user_id =
--                     pets.owner_user_id (the owner key), set by the route from the pet.
--   service_id      — the provider_services row this program enrolls in (the menu item).
--                     Nullable + SET NULL (a provider that deletes the service keeps the
--                     enrollment).
--   title           — the program's display name ("Puppy Foundations — 6 weeks").
--   total_sessions  — the package size (N sessions). The owner progresses through these;
--                     completed-session count is derived from training_progress.
--   status          — active → completed | cancelled. CHECK-constrained.
--   video_lesson_urls[] — Supabase Storage URLs of program-level async video lessons the
--                     owner can watch (the existing upload path).
create table if not exists training_programs (
  id                integer generated by default as identity primary key,
  booking_id        integer references vet_appointments(id) on delete set null,
  pet_id            integer not null references pets(id) on delete cascade,
  owner_user_id     integer not null references user_profiles(id) on delete cascade,
  provider_id       integer not null references providers(id) on delete cascade,
  service_id        integer references provider_services(id) on delete set null,
  title             text not null,
  total_sessions    integer not null default 1 check (total_sessions > 0),
  status            text not null default 'active'
                      check (status in ('active', 'completed', 'cancelled')),
  video_lesson_urls text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_training_programs_pet_id on training_programs (pet_id);
create index if not exists idx_training_programs_owner_user_id on training_programs (owner_user_id);
create index if not exists idx_training_programs_provider_id on training_programs (provider_id);
create index if not exists idx_training_programs_booking_id on training_programs (booking_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. training_sessions — the scheduled session OCCURRENCES the trainer runs.
-- ════════════════════════════════════════════════════════════════════════════════
--   provider_id   — the trainer provider. CASCADE: dropping the provider drops its sessions.
--   service_id    — the provider_services menu item this session is an occurrence of.
--                   Nullable + SET NULL.
--   program_id    — for a PROGRAM session, the parent enrollment series. NULL for a
--                   standalone 1:1 session or a group class. CASCADE on the program.
--   kind          — one_on_one | group_class | program. CHECK-constrained. Drives the
--                   capacity/roster behaviour (a group_class carries capacity).
--   title         — the session/class display name ("Saturday Recall Class").
--   scheduled_at  — when the session/class runs (timestamptz). Nullable (an unscheduled
--                   placeholder).
--   capacity      — the GROUP-CLASS occupancy ceiling (max attendees). NULL = not
--                   capacity-managed (1:1 / unlimited). CHECK > 0 when set.
--   status        — scheduled → completed | cancelled. CHECK-constrained.
create table if not exists training_sessions (
  id            integer generated by default as identity primary key,
  provider_id   integer not null references providers(id) on delete cascade,
  service_id    integer references provider_services(id) on delete set null,
  program_id    integer references training_programs(id) on delete cascade,
  kind          text not null default 'one_on_one'
                  check (kind in ('one_on_one', 'group_class', 'program')),
  title         text,
  scheduled_at  timestamptz,
  capacity      integer check (capacity is null or capacity > 0),
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_training_sessions_provider_id on training_sessions (provider_id);
create index if not exists idx_training_sessions_program_id on training_sessions (program_id);
create index if not exists idx_training_sessions_service_id on training_sessions (service_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. training_progress — one row per (session, pet): attendance + the trainer's PROGRESS
--    NOTE the owner reads, plus per-session video lessons. ALSO the group-class ROSTER row.
-- ════════════════════════════════════════════════════════════════════════════════
--   session_id    — the parent training_sessions occurrence. CASCADE: a deleted session
--                   takes its progress/roster rows.
--   program_id    — denormalised for a program session's progress (the enrollment series).
--                   Nullable + CASCADE.
--   pet_id/owner_user_id — the attendee pet + its owner (the owner key for RLS + read).
--   provider_id   — the trainer provider (kept for the provider-grant RLS predicate; avoids
--                   a session subselect in the policy).
--   attended      — boolean attendance flag the trainer toggles.
--   progress_note — the trainer's free-text progress note, OWNER-VISIBLE.
--   video_lesson_urls[] — optional per-session Supabase Storage video-lesson urls.
--   status        — booked (a roster slot) → completed | cancelled. CHECK-constrained.
--                   booked|completed count toward a group class's capacity.
create table if not exists training_progress (
  id                integer generated by default as identity primary key,
  session_id        integer not null references training_sessions(id) on delete cascade,
  program_id        integer references training_programs(id) on delete cascade,
  pet_id            integer not null references pets(id) on delete cascade,
  owner_user_id     integer not null references user_profiles(id) on delete cascade,
  provider_id       integer not null references providers(id) on delete cascade,
  attended          boolean not null default false,
  progress_note     text,
  video_lesson_urls text[] not null default '{}',
  status            text not null default 'booked'
                      check (status in ('booked', 'completed', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_training_progress_session_id on training_progress (session_id);
create index if not exists idx_training_progress_program_id on training_progress (program_id);
create index if not exists idx_training_progress_pet_id on training_progress (pet_id);
create index if not exists idx_training_progress_owner_user_id on training_progress (owner_user_id);
create index if not exists idx_training_progress_provider_id on training_progress (provider_id);
-- Group-class capacity count: the overbook guard counts LIVE attendees (booked|completed)
-- of a class. A partial index over the live roster rows serves it.
create index if not exists idx_training_progress_class_roster
  on training_progress (session_id)
  where status = any (array['booked', 'completed']);

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. RLS — training_programs. Owner read/write (FOR ALL) + provider read/insert/update via
--    app_provider_has_grant(pet_id, 'health_logs_write'). Mirrors daycare_stays (0034).
-- ════════════════════════════════════════════════════════════════════════════════
alter table training_programs enable row level security;
alter table training_programs force row level security;

-- Owner: full control over their own pets' program enrollments (book; read progress +
-- video lessons; cancel/correct). USING + WITH CHECK owner_user_id = current_app_user_id().
drop policy if exists training_programs_owner_all on training_programs;
create policy training_programs_owner_all on training_programs
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — active staff with a health_logs_write grant read the enrollments they
-- train. app_provider_has_grant (0019) is a SECURITY DEFINER helper over provider_staff +
-- care_access_grants, so it bypasses those tables' RLS and never recurses.
drop policy if exists training_programs_provider_read on training_programs;
create policy training_programs_provider_read on training_programs
  for select
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider INSERT — a trainer may enroll a pet they hold a health_logs_write grant on.
drop policy if exists training_programs_provider_insert on training_programs;
create policy training_programs_provider_insert on training_programs
  for insert
  with check (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider UPDATE — update status / attach video lessons. pet_id is unchanged by the
-- update, so the grant predicate holds for both the existing and the new row.
drop policy if exists training_programs_provider_update on training_programs;
create policy training_programs_provider_update on training_programs
  for update
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. RLS — training_sessions. Trainer CONFIGURATION/SCHEDULE (the class/series).
--    Active staff manage; a PUBLISHED provider's sessions are PUBLIC-readable (an owner
--    browses classes to join). Mirrors daycare_requirements (0034).
-- ════════════════════════════════════════════════════════════════════════════════
alter table training_sessions enable row level security;
alter table training_sessions force row level security;

-- SELECT: active staff (management read incl. a draft provider) OR a session of a PUBLISHED
-- provider (the public surface — an owner sees the class to join before booking). The
-- providers EXISTS runs under providers' OWN SELECT RLS (published = visible to any authed
-- user), so no DEFINER helper is needed there.
drop policy if exists training_sessions_read on training_sessions;
create policy training_sessions_read on training_sessions
  for select
  using (
    app_is_active_staff_of(provider_id)
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

-- Writes (INSERT/UPDATE/DELETE): active staff of the provider manage the schedule (create a
-- class, set capacity, mark complete). app_is_active_staff_of (0023) is a DEFINER helper
-- over provider_staff, so it bypasses that table's RLS and never recurses.
drop policy if exists training_sessions_staff_all on training_sessions;
create policy training_sessions_staff_all on training_sessions
  for all
  using (app_is_active_staff_of(provider_id))
  with check (app_is_active_staff_of(provider_id));

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — training_progress. The per-pet attendance + progress note (+ video lessons).
--    OWNER read/write (FOR ALL) + provider read/insert/update via
--    app_provider_has_grant(pet_id,'health_logs_write'). Same two-tier shape as programs.
--    The OWNER sees their OWN pet's progress ONLY (the ticket's RLS guarantee).
-- ════════════════════════════════════════════════════════════════════════════════
alter table training_progress enable row level security;
alter table training_progress force row level security;

-- Owner: full control over progress on THEIR OWN pets (read the note + video lessons; join
-- a class; cancel). USING + WITH CHECK owner_user_id = current_app_user_id() → an owner sees
-- ONLY their own pet's progress, never another owner's.
drop policy if exists training_progress_owner_all on training_progress;
create policy training_progress_owner_all on training_progress
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — active staff with a health_logs_write grant read the progress they log
-- (the class roster + per-pet progress). DEFINER helper, no recursion.
drop policy if exists training_progress_provider_read on training_progress;
create policy training_progress_provider_read on training_progress
  for select
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider INSERT — a trainer logs/creates progress (incl. adding a roster attendee) for a
-- pet they hold a grant on.
drop policy if exists training_progress_provider_insert on training_progress;
create policy training_progress_provider_insert on training_progress
  for insert
  with check (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider UPDATE — log attendance, write the progress note, attach a video lesson. pet_id
-- is unchanged, so the grant predicate holds for both rows.
drop policy if exists training_progress_provider_update on training_progress;
create policy training_progress_provider_update on training_progress
  for update
  using (app_provider_has_grant(pet_id, 'health_logs_write'));
