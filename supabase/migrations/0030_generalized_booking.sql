-- 0030_generalized_booking.sql
-- Phase 2 ticket 2.4 (docs/phase2-tickets/2.4-generalized-booking.md,
-- docs/phase2-superapp-master-plan.md §2 item 2, §5): GENERALIZE booking beyond vet
-- so grooming / walking / daycare / sitting / training can all be booked on ONE model.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- ARCHITECTURE DECISION — PATH (a): EXTEND vet_appointments IN PLACE.
-- ════════════════════════════════════════════════════════════════════════════════
-- The ticket offered (a) extend vet_appointments into a general provider_bookings, or
-- (b) add a new provider_bookings table with vet_appointments as a special case. Path
-- (a) is chosen as the LOWER-RISK path that does NOT disturb the vet reminder engine:
--
--   * vet_appointments ALREADY carries the booking spine (0016: provider_id,
--     provider_location_id, service_id, staff_user_id, booking_status, source) AND
--     ALREADY has its full RLS (0023: owner FOR ALL + provider active-staff read/update)
--     AND IS the table the reminder engine reads. Re-homing bookings into a NEW table
--     would force the reminder engine, every booking route, and 0023's RLS to be
--     rewritten — exactly the disturbance the ticket forbids.
--   * This migration is ADDITIVE ONLY. Every new column is nullable or defaulted so
--     existing vet rows and the reminder engine see NO behavioural change. The existing
--     `status` (scheduled|completed|cancelled|missed) and `booking_status`
--     (requested|confirmed|declined|cancelled) columns and their CHECKs are LEFT AS-IS
--     except booking_status gains 'completed' (a strictly-widening add — no existing
--     row uses it, and the reviews path keys off the UNCHANGED `status`='completed').
--   * A `provider_bookings` VIEW (below) gives the new general routes/UI a clean,
--     capability-named read surface over the same physical rows. A view is relkind 'v',
--     so it is NOT a base table — it is outside the RLS completeness guard, and it
--     inherits vet_appointments' RLS (security_invoker) so it leaks nothing.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. owner_user_id = user_profiles.id (the booking pet's owner);
-- staff_user_id = the assigned provider_staff member's user_profiles.id. Provider access
-- is by provider_staff MEMBERSHIP (app_is_active_staff_of), never user_profiles.role.
-- Capability ≠ data access: a booking exposes booking context only; pet MEDICAL access
-- still requires a care_access_grant via assertCareAccess (UNCHANGED — see 0023; this
-- migration does NOT touch the medical-access path).
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's
-- "MIGRATION TO APPLY TO SUPABASE" line). vet_appointments is already FORCE-RLS'd
-- (0023); the new provider_availability table joins the same model. DML + sequence
-- grants for the new table are ALREADY provided by 0019's blanket grant + ALTER DEFAULT
-- PRIVILEGES (created by the owner role AFTER 0019) — exactly as care_access_grants
-- (0015), the booking columns (0016), provider_capabilities (0027) and the payment
-- tables (0029) relied on. No per-table re-grant; the as-pawpi_app test is the proof.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. Extend vet_appointments with the GENERALIZED booking columns. All additive.
-- ════════════════════════════════════════════════════════════════════════════════
--   capability      — the service kind this booking is for (vet|groomer|walker|…). The
--                     general booking switch. DEFAULT 'vet' + backfill so every existing
--                     row stays a vet booking and the vet path is unchanged. CHECK mirrors
--                     provider_capabilities.capability (0027) + the route's
--                     ALLOWED_CAPABILITIES.
--   start_at/end_at — the slot as timestamptz, for capabilities that book a time RANGE
--                     (walks/daycare/boarding) and for double-book prevention. Nullable:
--                     existing vet rows use appointment_date + appointment_time (kept,
--                     untouched), so start_at/end_at are only populated by the general
--                     book route. The reminder engine still reads appointment_date/time.
--   recurrence_rule — an iCal-style RRULE string for recurring walks/daycare (e.g.
--                     'FREQ=WEEKLY;BYDAY=MO,WE,FR'). Nullable; NULL = one-off booking.
--                     Stored as text — instance materialisation is a module follow-up.
--   order_id        — nullable deposit/payment link to orders (0029, ticket 2.3). A
--                     booking that requires a deposit references the order it created;
--                     SET NULL on delete so a removed order only unlinks the booking.
alter table vet_appointments
  add column if not exists capability      text not null default 'vet',
  add column if not exists start_at        timestamptz,
  add column if not exists end_at          timestamptz,
  add column if not exists recurrence_rule text,
  add column if not exists order_id        integer references orders(id) on delete set null;

-- capability CHECK — same allowed set as provider_capabilities (0027). Idempotent
-- (drop-if-exists then add). Existing rows already carry 'vet' (column default), which
-- is in the set, so the constraint validates immediately.
alter table vet_appointments
  drop constraint if exists vet_appointments_capability_check;
alter table vet_appointments
  add constraint vet_appointments_capability_check
  check (
    capability = any (array[
      'vet','groomer','walker','daycare','sitter','trainer',
      'shop','adoption','transport','pharmacy'
    ]::text[])
  );

-- Widen booking_status to also allow 'completed' (the general workflow's terminal happy
-- state, written by the provider 'complete' action). Strictly additive: requested|
-- confirmed|declined|cancelled all still pass; existing NULL booking_status still passes.
-- The reviews gate (0028 / reviews route) keys off the UNCHANGED lifecycle `status`
-- column = 'completed', so reviews keep working; 'completed' on booking_status is the
-- booking-workflow mirror, set alongside status='completed' by the complete action.
alter table vet_appointments
  drop constraint if exists vet_appointments_booking_status_check;
alter table vet_appointments
  add constraint vet_appointments_booking_status_check
  check (
    booking_status is null
    or booking_status = any (array['requested','confirmed','declined','cancelled','completed'])
  );

-- Indexes for the general read/availability paths. capability filters the general
-- inbox; start_at orders/ranges the calendar.
create index if not exists idx_vet_appointments_capability on vet_appointments (capability);
create index if not exists idx_vet_appointments_start_at on vet_appointments (start_at);
create index if not exists idx_vet_appointments_order_id on vet_appointments (order_id);

-- ────────────────────────────────────────────────────────────────────────────────
-- DOUBLE-BOOK PREVENTION. A confirmed booking ties up a (provider, staff) at a slot.
-- A partial UNIQUE index over the LIVE, slot-based, ASSIGNED, ACTIVE bookings rejects a
-- second confirmed/requested booking for the same staff member at the same start_at.
-- Scoped narrowly so it NEVER touches the vet path: it only binds rows that have BOTH a
-- staff_user_id AND a start_at (the general slot model) and are not dead/declined —
-- existing vet rows (start_at NULL) are entirely outside the index. The route ALSO
-- checks availability before insert (clean 409 instead of a raw constraint error); this
-- index is the last-line race guard.
create unique index if not exists idx_vet_appointments_no_double_book
  on vet_appointments (provider_id, staff_user_id, start_at)
  where staff_user_id is not null
    and start_at is not null
    and deleted_at is null
    and booking_status = any (array['requested','confirmed']);

-- Backfill is a no-op for existing rows (capability already defaulted to 'vet' by the
-- ADD COLUMN ... DEFAULT). Stated explicitly for the reader: existing vet bookings are
-- 'vet'-capability, slot columns NULL, no recurrence, no order link — unchanged.

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. provider_availability — per-provider (optionally per-staff) bookable windows.
-- ════════════════════════════════════════════════════════════════════════════════
-- A weekly availability template: a provider (or a specific staff member) is bookable
-- on `weekday` (0=Mon..6=Sun, matching the app-wide DayChips convention) from
-- start_time to end_time, in `slot_minutes` increments. The book/availability routes
-- generate concrete slots from these windows and subtract already-booked slots
-- (double-book prevention). staff_user_id NULL = a provider-wide window (any staff);
-- non-NULL = that staff member's own window.
create table if not exists provider_availability (
  id             integer generated by default as identity primary key,
  provider_id    integer not null references providers(id) on delete cascade,
  -- The staff member this window belongs to. NULL = provider-wide (front-desk bookable).
  staff_user_id  integer references user_profiles(id) on delete cascade,
  -- Which capability this window serves (a groomer's chair vs a walker's slot). NULL =
  -- all capabilities the provider holds. CHECK mirrors the capability set.
  capability     text,
  weekday        integer not null,
  start_time     time not null,
  end_time       time not null,
  slot_minutes   integer not null default 30,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint provider_availability_weekday_check check (weekday >= 0 and weekday <= 6),
  constraint provider_availability_slot_check check (slot_minutes > 0),
  constraint provider_availability_time_check check (end_time > start_time),
  constraint provider_availability_capability_check check (
    capability is null
    or capability = any (array[
      'vet','groomer','walker','daycare','sitter','trainer',
      'shop','adoption','transport','pharmacy'
    ]::text[])
  )
);

create index if not exists idx_provider_availability_provider_id
  on provider_availability (provider_id);
create index if not exists idx_provider_availability_staff_user_id
  on provider_availability (staff_user_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. RLS — provider_availability. Active staff of the provider read+write their windows;
--    a PUBLISHED provider's windows are PUBLIC-readable (an owner needs to see open slots
--    to book). Mirrors the provider_services/_locations two-tier read shape (0024/0027).
-- ════════════════════════════════════════════════════════════════════════════════
alter table provider_availability enable row level security;
alter table provider_availability force row level security;

-- SELECT: active staff (management read incl. a draft provider) OR a window of a
-- PUBLISHED provider (the public booking surface — any authed user reads open slots).
-- The providers EXISTS runs under providers' OWN SELECT RLS (published = visible to any
-- authed user), so no DEFINER helper is needed there.
drop policy if exists provider_availability_read on provider_availability;
create policy provider_availability_read on provider_availability
  for select
  using (
    app_is_active_staff_of(provider_id)
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

-- Writes (INSERT/UPDATE/DELETE): owner|admin of the provider only — availability is a
-- configuration surface, like services/locations. app_is_provider_admin (0024) is a
-- DEFINER helper over provider_staff, so it bypasses that table's RLS and never recurses.
drop policy if exists provider_availability_admin_all on provider_availability;
create policy provider_availability_admin_all on provider_availability
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. provider_bookings VIEW — the GENERAL read surface over vet_appointments.
-- ════════════════════════════════════════════════════════════════════════════════
-- The new general routes/UI read "bookings", not "vet_appointments". This view renames
-- the physical table to its generalized identity and surfaces exactly the booking spine
-- (no medical columns — a view cannot widen access). security_invoker=true so it is
-- evaluated under the CALLER's RLS against vet_appointments — i.e. it inherits 0023's
-- owner / provider-active-staff policies verbatim and leaks nothing the base table
-- wouldn't. A view is relkind 'v', so the RLS completeness guard (base tables only)
-- does not flag it; its safety comes entirely from the base table's FORCE RLS.
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
    va.deleted_at
  from vet_appointments va;

-- The app role reads the view; SELECT inherits the base table's RLS via security_invoker.
grant select on provider_bookings to pawpi_app;
