-- 0091_booking_pay_with_credit.sql
-- Ticket B4 (docs/phase2-tickets/B4-schedule-credit-walk.md) — an owner SCHEDULES a walk against
-- their prepaid pack (DECISION LOCK 6). A scheduled credit walk IS a normal walker booking
-- (vet_appointments, capability='walker', ticket 2.4) with a single marker that it will be paid by
-- CREDIT, not a fresh checkout. The credit is consumed at PICKUP (B3), NOT at booking — so a
-- no-show never burns a credit.
--
-- ONE additive, idempotent column, NO new table / function / RLS POLICY change (it rides the
-- existing vet_appointments RLS + reminder engine unchanged):
--   vet_appointments.pay_with_credit boolean NOT NULL DEFAULT false
-- Set true when the owner books from their pack; the booking then creates NO money order. Every
-- existing booking keeps pay_with_credit=false (the default), so nothing else changes.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness, NOT applied to
-- Supabase here (hand-applied by Tats after the Wave-B run; flagged in the PR body + test-backlog
-- ACTION 1). The consumer code DEGRADES CLEANLY while the column is absent (the book route sets the
-- flag via a savepoint'd UPDATE that swallows undefined_column 42703; the lists probe for the column
-- and omit the badge when it's missing) — a normal paid booking is unaffected. Idempotent.

alter table vet_appointments
  add column if not exists pay_with_credit boolean not null default false;
