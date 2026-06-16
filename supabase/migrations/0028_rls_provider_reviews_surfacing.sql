-- 0028_rls_provider_reviews_surfacing.sql
-- Phase 2 ticket 2.2 (reviews surfacing). 0024 (R2e) parked provider_reviews under a
-- single owner(reviewer)-scoped FOR ALL policy as a safe default, with the explicit
-- note: "When reviews-surfacing ships (public read of a provider's reviews), THAT
-- feature updates this SELECT policy." This is that update.
--
-- The reviews feature opens a PUBLIC READ window (GET /api/providers/[id]/reviews is
-- any-authed: it shows a published provider's reviews to anyone browsing) while keeping
-- WRITES owner-only. So the single FOR ALL policy is replaced by per-command policies
-- that mirror the routes EXACTLY — no wider:
--   SELECT  — a review of a PUBLISHED provider (the public reviews list + the discovery/
--             public-profile aggregates) OR my own review (so an owner sees a review they
--             left on a still-draft/unpublished provider). The published EXISTS runs under
--             providers' own SELECT RLS (0024) — a published provider is visible there, a
--             draft is not — so no DEFINER helper is needed and a draft provider's reviews
--             stay private.
--   INSERT  — owner-only: owner_user_id = current_app_user_id(). The "must have a COMPLETED
--             booking with this provider" precondition is enforced in the APP layer
--             (POST /api/providers/[id]/reviews looks up a completed vet_appointments row +
--             dedups one-per-booking); RLS guarantees you can only ever author AS yourself.
--   UPDATE  — own review only (edit your own; never another's).
--   DELETE  — own review only. Providers get NO write path to reviews anywhere (no
--             provider-side INSERT/UPDATE/DELETE policy), so a provider can neither edit
--             nor delete a review — the anti-abuse rule, enforced at the database.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT
-- applied to Supabase here. Like the rest of the R2 set it is hand-applied to Supabase at
-- the operator's cutover (see docs/rls-hardening.md / the PR body's MIGRATION line). The
-- table already has the DML + sequence grants from 0019's blanket GRANT (provider_reviews
-- predates 0019 in 0014), so no per-table re-grant is needed.
--
-- Idempotent: drop-if-exists each policy then (re)create. ENABLE/FORCE are no-ops if 0024
-- already ran (this migration may run on a DB that has 0024's FOR ALL policy — the DROP of
-- provider_reviews_owner_all removes it cleanly).

-- ── one-per-booking dedup column ──────────────────────────────────────────────
-- provider_reviews ties each review to the COMPLETED booking it is FOR. appointment_id
-- references the vet_appointments row (the booking surface — see ./book); ON DELETE SET
-- NULL keeps the review if the booking is later hard-deleted. A partial UNIQUE index over
-- non-null appointment_id enforces the anti-abuse rule at the DATABASE: one review per
-- completed booking (the app also checks, but the index is the airtight guard against a
-- double-submit race). Nullable + partial so any legacy rows (pre-2.2, no booking link)
-- are unaffected. Idempotent (IF NOT EXISTS).
alter table provider_reviews
  add column if not exists appointment_id integer
  references vet_appointments(id) on delete set null;

create unique index if not exists idx_provider_reviews_appointment_unique
  on provider_reviews (appointment_id)
  where appointment_id is not null;

alter table provider_reviews enable row level security;
alter table provider_reviews force row level security;

-- Remove the R2e placeholder FOR ALL policy — it is superseded by the per-command set.
drop policy if exists provider_reviews_owner_all on provider_reviews;

-- SELECT: a published provider's reviews (public list + aggregates) OR my own review.
drop policy if exists provider_reviews_select on provider_reviews;
create policy provider_reviews_select on provider_reviews
  for select
  using (
    owner_user_id = current_app_user_id()
    or exists (
      select 1 from providers p
      where p.id = provider_id and p.status = 'published'
    )
  );

-- INSERT: owner-only (author AS yourself). The completed-booking precondition is app-layer.
drop policy if exists provider_reviews_insert on provider_reviews;
create policy provider_reviews_insert on provider_reviews
  for insert
  with check (owner_user_id = current_app_user_id());

-- UPDATE: my own review only.
drop policy if exists provider_reviews_update on provider_reviews;
create policy provider_reviews_update on provider_reviews
  for update
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- DELETE: my own review only (no provider-side delete path → providers cannot remove reviews).
drop policy if exists provider_reviews_delete on provider_reviews;
create policy provider_reviews_delete on provider_reviews
  for delete
  using (owner_user_id = current_app_user_id());
