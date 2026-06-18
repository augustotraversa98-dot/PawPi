-- 0055_adoption_foster_urgent_flags.sql
-- Phase 2 ticket 2.57: foster workflow + urgent/featured flags on adoption. ALL ADDITIVE columns
-- that RIDE the existing adoption RLS (0038) — no new table, no policy change, no loosening (the
-- same pattern as the 2.20/2.23 additive columns). A rescue can offer a dog for foster and/or
-- adoption, flag it urgent (with a reason) and/or feature it; the columns surface through the same
-- published-available public read that already gates the rows.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (test-backlog ACTION 1). Idempotent.

-- ── adoptable_listings — placement + urgency/featured flags ─────────────────────
alter table adoptable_listings
  add column if not exists placement_type text not null default 'adopt',
  add column if not exists is_urgent      boolean not null default false,
  add column if not exists is_featured    boolean not null default false,
  add column if not exists urgent_reason  text,
  add column if not exists featured_until timestamptz;

alter table adoptable_listings
  drop constraint if exists adoptable_listings_placement_type_check;
alter table adoptable_listings
  add constraint adoptable_listings_placement_type_check
  check (placement_type = any (array['adopt','foster','both']::text[]));

-- Featured-first ordering helper (browse / discovery sort featured before recency).
create index if not exists idx_adoptable_listings_featured
  on adoptable_listings (provider_id, is_featured, created_at desc);

-- ── adoption_applications — the applicant's foster-vs-adopt intent ───────────────
alter table adoption_applications
  add column if not exists requested_placement text;

alter table adoption_applications
  drop constraint if exists adoption_applications_requested_placement_check;
alter table adoption_applications
  add constraint adoption_applications_requested_placement_check
  check (requested_placement is null
         or requested_placement = any (array['adopt','foster']::text[]));
