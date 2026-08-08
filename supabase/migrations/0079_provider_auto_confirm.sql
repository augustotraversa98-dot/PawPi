-- 0079_provider_auto_confirm.sql
-- Provider "auto-confirm bookings" setting. Additive, idempotent, re-runnable. ONE nullable-safe
-- boolean column, no backfill, no CHECK, no policy change.
--
-- WHY: a provider can opt into accepting new bookings WITHOUT a manual accept step. When ON, the
-- owner-booking route (POST /api/providers/[id]/book) creates the booking already 'confirmed' —
-- EXCEPT a booking that carries an order_id (a deposit/full pre-payment, 0070): that stays
-- 'requested' until payment clears, preserving the existing pay-before-accept gate (the provider
-- confirm route only accepts a paid order). When OFF (the default), today's 'requested' flow is
-- unchanged. booking_status already allows 'confirmed' (0030), so no CHECK change is needed.
--
-- Default false so every EXISTING provider keeps the current manual-accept behaviour; a provider
-- turns it on from the extranet profile settings.
--
-- ⚠️ HARNESS-ONLY THIS PR — the integration harness applies this to a throwaway Postgres. It is
-- NOT auto-applied to Supabase; hand-apply after merge (see the PR body's "MIGRATION TO APPLY IN
-- SUPABASE" block). Plain idempotent DDL (no functions / dollar-quoting) so the harness runs the
-- whole file in one simple-query call.

alter table providers
  add column if not exists auto_confirm_bookings boolean not null default false;
