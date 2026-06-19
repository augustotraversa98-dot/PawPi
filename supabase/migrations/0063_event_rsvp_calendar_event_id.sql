-- 0063_event_rsvp_calendar_event_id.sql
-- Wave 8 ticket 2.80: calendar everywhere. The ONLY new DB object this ticket needs.
--
-- A device calendar event is PER ATTENDEE, so the id of the user's added calendar event
-- must live on THEIR event_rsvps row — NOT on the shared `events` row (which is one row
-- for all attendees). Bookings/transport/telehealth already ride
-- vet_appointments.calendar_event_id (0005), so no column is needed there.
--
-- ADDITIVE, idempotent: one nullable text column on an already-RLS'd, own-row-scoped
-- table. NO RLS POLICY CHANGE — the column rides the existing event_rsvps own-row
-- policies (0060: a user reads/writes ONLY their own rsvp), so the new column is
-- automatically owner-scoped (proven in events-rls.integration.test.ts).
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app; hand-applied to Supabase AFTER merge
-- (test-backlog ACTION 1). Last applied migration = 0062.

alter table event_rsvps
  add column if not exists calendar_event_id text;
