-- 0124_provider_claimable.sql
-- Turn the existing provider spine (0014) into a SEED + CLAIM directory (Google-Business /
-- LinkedIn model): pre-populate real CABA+AMBA businesses as UNCLAIMED, publicly discoverable
-- listings, and let the real owner CLAIM their listing to take ownership.
--
-- DESIGN — owner invariant is preserved.
--   providers.owner_user_profile_id stays NOT NULL and the whole 0024 RLS set reasons from
--   "owner = creator". Seeded listings are owned by ONE system "PawPi Directory" account until
--   claimed; claim approval (a later migration, 0125) reassigns ownership.
--
-- Everything here is ADDITIVE and IDEMPOTENT. No existing row or policy is dropped or weakened.
-- No new SELECT policy is needed on providers — 0024 already public-reads status='published'.
-- Every EXISTING provider row is treated as claim_status='claimed' via the column default, so
-- behaviour is identical for the existing owner-created provider spine.
--
-- Pet-friendly places load into providers with provider_type='pet_friendly' (no services).
-- provider_type has no CHECK constraint on 0014, so 'pet_friendly' is a valid additive value.
--
-- ⚠️ HARNESS-ONLY THIS MIGRATION — proven as pawpi_app in the integration harness. Hand-apply
-- to Supabase at cutover (docs/rls-hardening.md), like the R2 set. Idempotent.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) providers — claim + provenance columns.
--    source        : where the row came from (drives trust / refresh policy).
--    external_*    : dedup + re-sync key so a second import UPDATEs rather than duplicates.
--    claim_status  : unclaimed → pending → claimed. Default 'claimed' means every EXISTING
--                    owner-created row is treated as already claimed — no behaviour change.
--    claimed_at    : when ownership transferred to the real owner.
alter table providers
  add column if not exists source          text        not null default 'owner',
  add column if not exists external_source text,
  add column if not exists external_id     text,
  add column if not exists claim_status    text        not null default 'claimed',
  add column if not exists claimed_at      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'providers_source_check') then
    alter table providers add constraint providers_source_check
      check (source = any (array['owner','manual','osm','serpapi_gmaps','import']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_claim_status_check') then
    alter table providers add constraint providers_claim_status_check
      check (claim_status = any (array['unclaimed','pending','claimed']::text[]));
  end if;
end $$;

-- One row per external place — lets a re-import upsert on (external_source, external_id).
create unique index if not exists providers_external_key
  on providers (external_source, external_id)
  where external_source is not null and external_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) provider_locations — pet_policy carried in from the source (OSM tag / Google note),
--    used by the pet-friendly map badge ("Dogs allowed inside / outside").
alter table provider_locations
  add column if not exists pet_policy text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) SYSTEM directory account — owns every seeded, unclaimed listing.
--    Kept minimal (only NOT NULL columns are set + a stable username). Idempotent — a re-run
--    finds the existing profile via the username lookup and does nothing. Runs under the
--    migration/superuser role, so FORCE RLS on user_profiles is bypassed here.
--
--    Explicit high ids (near int4 max) are used so this seed never collides with the low
--    fixture ids the integration harness inserts by hand (test/integration/*.integration.test.ts
--    routinely pins auth_users/user_profiles id=1..99). The identity sequences are left
--    untouched — subsequent auto-inserts (in prod AND in tests) still use nextval() from
--    wherever they were, so no live create flow is disturbed.
do $$
declare
  v_profile int;
  c_auth_id    constant int := 2147000001;
  c_profile_id constant int := 2147000001;
begin
  select up.id into v_profile
    from user_profiles up
    where up.username = 'pawpi_directory';

  if v_profile is null then
    insert into auth_users(id, name, email)
      values (c_auth_id, 'PawPi Directory', 'directory@pawpi.system');

    insert into user_profiles(id, auth_user_id, role, username, onboarding_completed)
      values (c_profile_id, c_auth_id, 'admin', 'pawpi_directory', true);
  end if;
end $$;

commit;
