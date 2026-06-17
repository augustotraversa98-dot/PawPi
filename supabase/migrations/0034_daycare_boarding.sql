-- 0034_daycare_boarding.sql
-- Phase 2 ticket 2.8 (docs/phase2-tickets/2.8-daycare-boarding.md,
-- docs/phase2-superapp-master-plan.md §1 daycare row): the DAYCARE/BOARDING capability
-- module. A facility sets CAPACITY + required VACCINES; an owner books a STAY (a date
-- range) and provides feeding/med instructions; the facility VERIFIES the required
-- vaccines, CHECKS the pet in/out, and posts DAILY REPORT CARDS the owner sees.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS
-- ════════════════════════════════════════════════════════════════════════════════
-- ONE additive column + THREE new tables. Everything else is REUSE:
--   * the daycare MENU is provider_services tagged capability='daycare' (no new table);
--   * the BOOKING is a vet_appointments/provider_bookings row, capability='daycare'
--     (0030, ticket 2.4 — no new booking table; recurrence_rule carries recurring/
--     multi-day stays). daycare_stays.booking_id links the stay to that booking;
--   * the DEPOSIT/FEE is an orders/payments row (0029, ticket 2.3);
--   * COORDINATION is the owner↔provider chat (0031, ticket 2.5);
--   * the VACCINE SSOT is pet_vaccinations (0016) — daycare NEVER stores its own copy
--     of a pet's vaccines; verification READS pet_vaccinations through the consent
--     model (see below), it does not duplicate it;
--   * report-card PHOTOS/VIDEO reuse the existing Supabase Storage upload path; their
--     URLs are stored on report_cards (photo_urls[]).
--
--   (1) provider_locations.capacity — the per-location bed/slot count a daycare can hold
--       at once. Additive, nullable: NULL = "unlimited / not capacity-managed" so every
--       existing non-daycare location is unchanged. The daycare book/check-in route
--       counts CONCURRENT stays (date ranges that overlap the requested range) at the
--       location and refuses a booking that would exceed capacity (OVERBOOK PREVENTION,
--       extending the 2.4 availability/double-book mechanism from per-staff-slot to
--       per-location-occupancy). A partial index supports that overlap count.
--   (2) daycare_requirements — the vaccines a facility REQUIRES, per provider (optionally
--       per location). The facility configures these; the app verifies a booking pet's
--       pet_vaccinations cover them.
--   (3) daycare_stays — one row per booked stay (the operational record: status +
--       check-in/out stamps + the owner's feeding/med instructions).
--   (4) report_cards — daily cards posted by facility staff, visible to the owner.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- CAPACITY / OVERBOOK DECISION (documented per the ticket).
-- ════════════════════════════════════════════════════════════════════════════════
-- A stay holds a DATE RANGE (start_date..end_date), not a single staff slot, so the
-- 2.4 per-staff partial-unique double-book index does NOT model daycare occupancy. The
-- daycare overbook guard is COUNT-BASED, like the social-walk max_pets guard: the route
-- counts the LIVE stays (status in booked|checked_in) at the location whose [start,end]
-- range OVERLAPS the requested range, and refuses if count >= location.capacity (a clean
-- 409). The route checks BEFORE insert (clean message); there is no single unique index
-- that can express "<= N overlapping ranges", so the COUNT under the request's identity
-- + the booked/checked_in status filter is the guard (the same shape booking's
-- availability check uses, generalized to a range + a capacity ceiling). Capacity NULL =
-- not enforced (an unlimited / non-daycare location).
--
-- ════════════════════════════════════════════════════════════════════════════════
-- VACCINE-REQUIREMENT VERIFICATION — CONSENT, NOT BYPASS (the ticket's DO-NOT).
-- ════════════════════════════════════════════════════════════════════════════════
-- pet_vaccinations is OWNER-private medical data (R2d): the provider-read path is gated
-- by a care_access_grant via app_provider_has_grant / assertCareAccess — NEVER bypassed.
-- The facility verifies coverage by READING the pet's pet_vaccinations against
-- daycare_requirements; that read requires the owner to have granted the facility a
-- medical/vaccinations read scope (mirroring grooming/walking's consent model). The
-- daycare verify route calls assertCareAccess(petId, providerId, 'medical_read', …) —
-- active staff + an active grant whose scopes include 'medical_read' — and writes the
-- care_access_audit row, exactly like every other provider→pet-data read. WITHOUT the
-- grant the verify returns a clean "needs consent" 403 (the owner is prompted to share),
-- it does NOT silently read or fake a pass. The verification result (pass/fail + the
-- missing vaccine names) is computed by the route and returned to BOTH sides; it is not
-- persisted as a parallel source of truth (pet_vaccinations stays the SSOT). The MODULE
-- itself is gated by requireProviderCapability(providerId,'daycare') (2.1) BEFORE any pet
-- data is touched. Capability ≠ data access.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- RLS — owner-scoped + provider-staff(participant)-scoped (like walk/chat tickets).
-- ════════════════════════════════════════════════════════════════════════════════
--   * daycare_requirements: facility CONFIGURATION (no pet data). Active staff of the
--     provider READ; owner|admin of the provider WRITE — the provider_availability
--     two-tier shape (0030). A PUBLISHED provider's requirements are also PUBLIC-readable
--     so an owner can see "this facility requires Rabies+DHPP" before booking. No pet
--     scoping (it is a per-provider/location list, not a per-pet record).
--   * daycare_stays: OWNER read/write (FOR ALL) + provider READ/INSERT/UPDATE via
--     app_provider_has_grant(pet_id, 'health_logs_write') — the grooming two-tier shape
--     (0032). The owner ALWAYS sees their stay (instructions + status); the facility
--     only with an active grant. (booking creates the stay in OWNER context; the facility
--     updates check-in/out under the grant.)
--   * report_cards: scoped THROUGH the parent stay. The OWNER of the stay reads (FOR ALL
--     so they may correct a card on their own stay); a provider with an active
--     health_logs_write grant on the stay's pet reads/inserts/updates (posts the daily
--     card). app_provider_has_grant is keyed off the stay's pet_id via a subselect — a
--     SECURITY DEFINER helper over provider_staff + care_access_grants, so it bypasses
--     those tables' RLS and never recurses.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the pet's owner). provider_id is the
-- daycare provider; provider access is by active-staff MEMBERSHIP + grant, never
-- user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). DML + sequence grants for the new tables are
-- ALREADY provided by 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (the tables are
-- created by the owner role AFTER 0019) — exactly as care_access_grants (0015), the
-- booking columns (0016/0030), provider_capabilities (0027), the payment tables (0029),
-- chat (0031), groom_sessions (0032) and walk_sessions (0033) relied on. No per-table
-- re-grant; the as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 0. provider_locations.capacity — per-location occupancy ceiling for daycare/boarding.
-- ════════════════════════════════════════════════════════════════════════════════
-- Additive + nullable: NULL = unlimited / not capacity-managed (every existing location
-- is unchanged). A daycare facility sets this on the location its stays run at; the
-- book/check-in route enforces it via the overlap count below.
alter table provider_locations
  add column if not exists capacity integer
    check (capacity is null or capacity > 0);

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. daycare_requirements — the vaccines a facility REQUIRES (per provider/location).
-- ════════════════════════════════════════════════════════════════════════════════
--   provider_id   — the daycare facility. CASCADE: dropping the provider drops its rules.
--   location_id   — optional per-location override. NULL = applies provider-wide (all the
--                   provider's locations). CASCADE on the location.
--   vaccine_name  — the required vaccine, matched (case-insensitive) against the pet's
--                   pet_vaccinations.name during verification. text (no FK — vaccines are
--                   free-text names, not a catalog table).
--   active        — soft toggle so a facility can retire a requirement without losing it.
create table if not exists daycare_requirements (
  id            integer generated by default as identity primary key,
  provider_id   integer not null references providers(id) on delete cascade,
  location_id   integer references provider_locations(id) on delete cascade,
  vaccine_name  text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_daycare_requirements_provider_id
  on daycare_requirements (provider_id);
create index if not exists idx_daycare_requirements_location_id
  on daycare_requirements (location_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. daycare_stays — one row per booked stay (the operational record).
-- ════════════════════════════════════════════════════════════════════════════════
--   booking_id            — the booking this stay fulfils (vet_appointments id, 2.4).
--                           Nullable + ON DELETE SET NULL: a removed booking only unlinks
--                           the stay; the owner keeps the stay record + report cards.
--   pet_id/owner_user_id/provider_id — the standard scoping triple. owner_user_id =
--                           pets.owner_user_id (the owner key), set by the route.
--   location_id           — which facility location the stay runs at (the capacity unit).
--                           Nullable + SET NULL (a provider with no locations modelled).
--   start_date/end_date   — the stay's DATE RANGE (inclusive). A day-care stay is one day
--                           (start=end); boarding spans nights. The overlap/capacity guard
--                           runs against this range.
--   status                — booked → checked_in (staff) → checked_out (staff) | cancelled.
--                           CHECK-constrained. booked|checked_in count toward occupancy.
--   feeding_instructions  — the OWNER's feeding notes, provided AT BOOKING.
--   med_instructions      — the OWNER's medication notes, provided AT BOOKING.
--   checked_in_at/out_at  — facility staff check-in / check-out stamps.
create table if not exists daycare_stays (
  id                   integer generated by default as identity primary key,
  booking_id           integer references vet_appointments(id) on delete set null,
  pet_id               integer not null references pets(id) on delete cascade,
  owner_user_id        integer not null references user_profiles(id) on delete cascade,
  provider_id          integer not null references providers(id) on delete cascade,
  location_id          integer references provider_locations(id) on delete set null,
  start_date           date not null,
  end_date             date not null,
  status               text not null default 'booked'
                         check (status in ('booked', 'checked_in', 'checked_out', 'cancelled')),
  feeding_instructions text,
  med_instructions     text,
  checked_in_at        timestamptz,
  checked_out_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint daycare_stays_date_range_check check (end_date >= start_date)
);

create index if not exists idx_daycare_stays_pet_id on daycare_stays (pet_id);
create index if not exists idx_daycare_stays_owner_user_id on daycare_stays (owner_user_id);
create index if not exists idx_daycare_stays_provider_id on daycare_stays (provider_id);
create index if not exists idx_daycare_stays_booking_id on daycare_stays (booking_id);
-- Occupancy count: the overbook guard counts LIVE stays at a location whose range
-- overlaps the request. A partial index over the live, location-bound stays serves it.
create index if not exists idx_daycare_stays_occupancy
  on daycare_stays (location_id, start_date, end_date)
  where status = any (array['booked', 'checked_in']) and location_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. report_cards — daily cards posted by facility staff, visible to the owner.
-- ════════════════════════════════════════════════════════════════════════════════
--   stay_id     — the parent stay (CASCADE: a deleted stay takes its cards). The card is
--                 scoped THROUGH the stay (owner/provider both reached via the stay's pet).
--   date        — the calendar day this card covers.
--   mood        — free-text mood note ("playful", "calm").
--   meals       — free-text meals summary ("ate breakfast + dinner").
--   activities  — free-text activities summary ("group play, two walks").
--   notes       — additional free-text.
--   photo_urls  — Supabase Storage URLs of photos/video for the day (the existing path).
create table if not exists report_cards (
  id          integer generated by default as identity primary key,
  stay_id     integer not null references daycare_stays(id) on delete cascade,
  date        date not null,
  mood        text,
  meals       text,
  activities  text,
  notes       text,
  photo_urls  text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_report_cards_stay_id on report_cards (stay_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. RLS — daycare_requirements. Facility CONFIGURATION (no pet data).
--    Active staff + a PUBLISHED provider's rules read; owner|admin write. Mirrors
--    provider_availability (0030).
-- ════════════════════════════════════════════════════════════════════════════════
alter table daycare_requirements enable row level security;
alter table daycare_requirements force row level security;

-- SELECT: active staff (management read incl. a draft provider) OR a rule of a PUBLISHED
-- provider (the public surface — an owner sees the required vaccines before booking). The
-- providers EXISTS runs under providers' OWN SELECT RLS (published = visible to any authed
-- user), so no DEFINER helper is needed there.
drop policy if exists daycare_requirements_read on daycare_requirements;
create policy daycare_requirements_read on daycare_requirements
  for select
  using (
    app_is_active_staff_of(provider_id)
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

-- Writes (INSERT/UPDATE/DELETE): owner|admin of the provider only — requirements are a
-- configuration surface, like services/locations/availability. app_is_provider_admin
-- (0024) is a DEFINER helper over provider_staff, so it bypasses that table's RLS and
-- never recurses.
drop policy if exists daycare_requirements_admin_all on daycare_requirements;
create policy daycare_requirements_admin_all on daycare_requirements
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. RLS — daycare_stays. Owner read/write (FOR ALL) + provider read/insert/update via
--    app_provider_has_grant(pet_id, 'health_logs_write'). Mirrors groom_sessions (0032).
-- ════════════════════════════════════════════════════════════════════════════════
alter table daycare_stays enable row level security;
alter table daycare_stays force row level security;

-- Owner: full control over their own pets' stays (book + instructions; read status; they
-- may also cancel/correct). USING + WITH CHECK owner_user_id = current_app_user_id().
drop policy if exists daycare_stays_owner_all on daycare_stays;
create policy daycare_stays_owner_all on daycare_stays
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- Provider SELECT — active staff with a health_logs_write grant read the stays they care
-- for (the facility's occupancy list for the pet). app_provider_has_grant (0019) is a
-- SECURITY DEFINER helper over provider_staff + care_access_grants, so it bypasses those
-- tables' RLS and never recurses.
drop policy if exists daycare_stays_provider_read on daycare_stays;
create policy daycare_stays_provider_read on daycare_stays
  for select
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider INSERT — a facility may create a stay for a pet it holds a health_logs_write
-- grant on (e.g. walk-in). WITH CHECK gates on the same grant.
drop policy if exists daycare_stays_provider_insert on daycare_stays;
create policy daycare_stays_provider_insert on daycare_stays
  for insert
  with check (app_provider_has_grant(pet_id, 'health_logs_write'));

-- Provider UPDATE — check in/out, edit status. USING gates the existing row (a stay they
-- can write); pet_id is unchanged by the update, so the grant predicate holds for both.
drop policy if exists daycare_stays_provider_update on daycare_stays;
create policy daycare_stays_provider_update on daycare_stays
  for update
  using (app_provider_has_grant(pet_id, 'health_logs_write'));

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — report_cards. Scoped THROUGH the parent stay (owner of the stay + provider
--    with a grant on the stay's pet). Same two-tier shape, reached via a subselect on
--    daycare_stays.
-- ════════════════════════════════════════════════════════════════════════════════
alter table report_cards enable row level security;
alter table report_cards force row level security;

-- Owner: full control over cards on THEIR OWN stays (read the daily card; they may
-- correct/remove on their own stay). The stay must be owned by the caller.
drop policy if exists report_cards_owner_all on report_cards;
create policy report_cards_owner_all on report_cards
  for all
  using (
    exists (
      select 1 from daycare_stays s
      where s.id = report_cards.stay_id
        and s.owner_user_id = current_app_user_id()
    )
  )
  with check (
    exists (
      select 1 from daycare_stays s
      where s.id = report_cards.stay_id
        and s.owner_user_id = current_app_user_id()
    )
  );

-- Provider SELECT — active staff with a health_logs_write grant on the stay's pet read
-- the cards they post. app_provider_has_grant bypasses provider_staff/care_access_grants
-- RLS (DEFINER); the daycare_stays subselect resolves the pet_id for the card's stay. The
-- subselect runs under report_cards' caller, but daycare_stays is FORCE-RLS'd too — so we
-- read pet_id via a DEFINER-style EXISTS that does not depend on the caller seeing the
-- stay row. We inline the grant check against the stay's pet_id by joining the stay.
drop policy if exists report_cards_provider_read on report_cards;
create policy report_cards_provider_read on report_cards
  for select
  using (
    exists (
      select 1 from daycare_stays s
      where s.id = report_cards.stay_id
        and app_provider_has_grant(s.pet_id, 'health_logs_write')
    )
  );

-- Provider INSERT — post a daily card on a stay whose pet they hold a grant on.
drop policy if exists report_cards_provider_insert on report_cards;
create policy report_cards_provider_insert on report_cards
  for insert
  with check (
    exists (
      select 1 from daycare_stays s
      where s.id = report_cards.stay_id
        and app_provider_has_grant(s.pet_id, 'health_logs_write')
    )
  );

-- Provider UPDATE — edit a card they posted (append photos, fix a note).
drop policy if exists report_cards_provider_update on report_cards;
create policy report_cards_provider_update on report_cards
  for update
  using (
    exists (
      select 1 from daycare_stays s
      where s.id = report_cards.stay_id
        and app_provider_has_grant(s.pet_id, 'health_logs_write')
    )
  );
