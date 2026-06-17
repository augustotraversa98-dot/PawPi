-- 0038_adoption.sql
-- Phase 2 ticket 2.12 (docs/phase2-tickets/2.12-adoption.md,
-- docs/phase2-superapp-master-plan.md §4): the ADOPTION module — a shelter/rescue
-- ("adoption place") = a provider holding the 'adoption' capability (REUSES the provider
-- spine: onboarding/profile/locations/staff). It lists its adoptable dogs IN THE EXISTING
-- DOG-PROFILE FORMAT; owners discover places, browse the dogs (dog-profile cards), FAVORITE,
-- APPLY, CHAT (2.5), pay an adoption FEE / DONATE (2.3); on APPROVAL the dog becomes the
-- adopter's own pet (a new pets row) so it enters the owner's normal health/social/services
-- experience.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- MODELLING CHOICE (documented per the ticket) — a SEPARATE adoptable_listings table,
-- NOT shelter-owned pets rows. WHY:
--   * The pets table keys owner_user_id -> user_profiles.id (a CONSUMER profile), and pets
--     RLS (0020) is strictly OWNER-scoped (owner_user_id = current_app_user_id()). A shelter
--     is a PROVIDER (provider_staff membership), not a user_profiles owner — so putting
--     adoptable dogs in `pets` would either (a) break the identity invariant (a provider is
--     not a profile) or (b) require widening pets RLS to a provider branch, polluting the
--     owner-private model with a discovery-readable carve-out. Both are exactly the "keep RLS
--     clean" failure the ticket warns against.
--   * adoptable_listings is provider-owned (provider_id) with a clean TWO-TIER RLS that
--     mirrors shop_products (0037): a PUBLISHED place's AVAILABLE listings are readable by any
--     authed user (DISCOVERY); shelter ADMIN/STAFF write. No owner-private leakage either way.
--   * It carries the SAME field shape as pets (name/breed/age/gender/size/photos/…) PLUS the
--     adoption-specific fields, so the EXISTING dog-profile UI renders a listing unchanged
--     ("place all their dogs in the format it currently is") — the render is REUSED, the row
--     is just sourced from adoptable_listings instead of pets.
--   * On APPROVAL we COPY the listing's profile into a NEW pets row owned by the adopter (the
--     transfer mechanics, below) — so the adopted dog flows into the owner's normal pet
--     experience exactly like any pet, while the listing is marked 'adopted'.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION ADDS — THREE new tables + ONE transfer helper. Fees/donations REUSE
-- the 2.3 payments foundation (0029) verbatim (orders kind='adoption_fee' / 'donation'); chat
-- REUSES 2.5 (0031). NO payment/chat tables are duplicated.
-- ════════════════════════════════════════════════════════════════════════════════
--   (1) adoptable_listings   — the adoptable dog, in dog-profile format (NEW). provider-owned;
--                              published-available discovery / shelter-staff write.
--   (2) adoption_applications — an owner's application to adopt a listing (NEW). applicant sees
--                              OWN only; shelter staff see THEIR place's applications.
--   (3) adoption_favorites   — an owner's saved/favorited listings (NEW). owner-private.
--   (4) app_approve_adoption(application_id) — the APPROVAL → pet-transfer SECURITY DEFINER
--                              helper: copies the listing into a new pets row owned by the
--                              applicant, marks the application 'approved' + the listing
--                              'adopted'. Authorized as shelter staff; runs atomically.
--
-- Identity convention (unchanged): app.current_user_id carries user_profiles.id, NEVER
-- auth_users.id. applicant_owner_user_id = the applying owner's user_profiles.id; provider_id
-- is the shelter; provider WRITE access is by active-staff/admin MEMBERSHIP, never by
-- user_profiles.role.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness, NOT applied
-- to Supabase here. Hand-applied to Supabase AFTER merge (see the PR body's "MIGRATION TO
-- APPLY TO SUPABASE" line). DML + sequence grants for the new tables are ALREADY provided by
-- 0019's blanket GRANT + ALTER DEFAULT PRIVILEGES (created by the owner role AFTER 0019) —
-- exactly as care_access_grants (0015), the payment tables (0029), chat (0031), and every
-- service module (0032–0037) relied on. No per-table re-grant; the as-pawpi_app test is the
-- proof. The new function gets an explicit GRANT EXECUTE to pawpi_app.
--
-- ⚠️ RECURSION: the policies below reuse 0019/0024's SECURITY DEFINER helpers
-- (current_app_user_id, app_is_active_staff_of, app_is_provider_admin) which read
-- provider_staff under DEFINER rights, bypassing that table's FORCE RLS — no recursion. The
-- discovery branch reads providers via a plain EXISTS under providers' OWN SELECT RLS (a
-- published provider is visible to any authed user), the same shape as shop_products (0037).
-- adoption_applications' SELECT reads adoptable_listings via a SECURITY DEFINER membership
-- helper (app_is_listing_shelter_staff) so the applications policy does not re-run the
-- listings policy (mirrors chat's app_is_thread_participant, 0031).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. adoptable_listings — the adoptable dog, in the existing dog-profile format.
-- ════════════════════════════════════════════════════════════════════════════════
--   provider_id     — the shelter/rescue. CASCADE: dropping the place drops its listings.
--   name/breed/age_years/age_months/gender/size — the dog-profile core (matches pets' shape
--                     so the SAME profile UI renders a listing). size is shelter-specific
--                     (small/medium/large/xlarge).
--   photo_urls[]    — Supabase Storage photo URLs (the existing upload path; the dog-profile
--                     gallery). video_url — an optional single intro video.
--   story           — the dog's bio / adoption story (the dog-profile "about").
--   good_with_kids / good_with_cats / good_with_dogs — tri-state compatibility (NULL =
--                     unknown, the honest shelter default; true/false when assessed).
--   energy_level    — low/medium/high (the dog-profile energy chip).
--   vaccination_status — up_to_date / partial / unknown (a shelter-stated summary; the richer
--                     per-vaccine records live on the adopter's pet after transfer).
--   adoption_fee_cents — the fee in cents (matches orders/payments money convention). >= 0.
--   currency        — ISO currency, defaults 'ARS' (the marketplace region, matches orders).
--   status          — available / pending / adopted (the listing lifecycle). pending = an
--                     application is under review; adopted = transferred to an adopter.
create table if not exists adoptable_listings (
  id                 integer generated by default as identity primary key,
  provider_id        integer not null references providers(id) on delete cascade,
  name               text not null,
  breed              text,
  age_years          integer,
  age_months         integer,
  gender             text,
  size               text,
  photo_urls         text[] not null default '{}',
  video_url          text,
  story              text,
  good_with_kids     boolean,
  good_with_cats     boolean,
  good_with_dogs     boolean,
  energy_level       text,
  vaccination_status text,
  adoption_fee_cents integer not null default 0,
  currency           text not null default 'ARS',
  status             text not null default 'available',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint adoptable_listings_fee_check check (adoption_fee_cents >= 0),
  constraint adoptable_listings_status_check
    check (status = any (array['available','pending','adopted']::text[])),
  constraint adoptable_listings_size_check
    check (size is null or size = any (array['small','medium','large','xlarge']::text[])),
  constraint adoptable_listings_energy_check
    check (energy_level is null or energy_level = any (array['low','medium','high']::text[])),
  constraint adoptable_listings_vax_check
    check (vaccination_status is null
           or vaccination_status = any (array['up_to_date','partial','unknown']::text[]))
);

create index if not exists idx_adoptable_listings_provider_id on adoptable_listings (provider_id);
-- Discovery filters by AVAILABLE listings of published places; index the status.
create index if not exists idx_adoptable_listings_status on adoptable_listings (provider_id, status);

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. adoption_applications — an owner's application to adopt a listing.
-- ════════════════════════════════════════════════════════════════════════════════
--   listing_id              — the adoptable dog applied for. CASCADE with the listing.
--   provider_id             — denormalized shelter id (the listing's provider). Lets the
--                             shelter-staff RLS branch + the dashboard queue filter by place
--                             WITHOUT a join back to adoptable_listings under its own RLS, and
--                             survives a listing delete only via the listing CASCADE (so it is
--                             always consistent). Kept in sync by the route + the approval
--                             helper.
--   applicant_owner_user_id — the applying owner's user_profiles.id (the RLS owner branch).
--   answers                 — the application form answers (jsonb): free-form Q&A the shelter
--                             configures (home type, other pets, experience, …). The module
--                             does not hard-code a schema; the UI renders the keys present.
--   status                  — submitted / under_review / approved / declined. The shelter
--                             advances it; approval triggers the pet transfer.
--   transferred_pet_id      — set by app_approve_adoption to the NEW pets row created for the
--                             adopter (the audit link from application → adopted pet). NULL
--                             until approved. SET NULL if that pet is later deleted.
create table if not exists adoption_applications (
  id                      integer generated by default as identity primary key,
  listing_id              integer not null references adoptable_listings(id) on delete cascade,
  provider_id             integer not null references providers(id) on delete cascade,
  applicant_owner_user_id integer not null references user_profiles(id) on delete cascade,
  answers                 jsonb not null default '{}'::jsonb,
  status                  text not null default 'submitted',
  transferred_pet_id      integer references pets(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint adoption_applications_status_check check (
    status = any (array['submitted','under_review','approved','declined']::text[])
  )
);

create index if not exists idx_adoption_applications_listing_id on adoption_applications (listing_id);
create index if not exists idx_adoption_applications_provider_id on adoption_applications (provider_id);
create index if not exists idx_adoption_applications_applicant on adoption_applications (applicant_owner_user_id);

-- At most ONE active (non-declined) application per (applicant, listing) — an owner can't
-- spam the same dog; a declined application may be re-applied. Partial unique index.
create unique index if not exists idx_adoption_applications_unique_active
  on adoption_applications (applicant_owner_user_id, listing_id)
  where status <> 'declined';

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. adoption_favorites — an owner's saved listings (the "favorite" action). Owner-private.
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists adoption_favorites (
  id            integer generated by default as identity primary key,
  owner_user_id integer not null references user_profiles(id) on delete cascade,
  listing_id    integer not null references adoptable_listings(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint adoption_favorites_unique unique (owner_user_id, listing_id)
);

create index if not exists idx_adoption_favorites_owner on adoption_favorites (owner_user_id);
create index if not exists idx_adoption_favorites_listing on adoption_favorites (listing_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. app_is_listing_shelter_staff(listing_id) — SECURITY DEFINER membership helper: is the
--    current app user active staff of the listing's provider? Reads adoptable_listings
--    (FORCE-RLS'd below) + provider_staff (via app_is_active_staff_of), so it MUST run as the
--    owner (DEFINER) to bypass those policies — same pattern + reason as chat's
--    app_is_thread_participant (0031). Lets the applications SELECT policy resolve the
--    shelter-staff branch without re-running the listings policy (avoids recursion + an
--    under-read). STABLE + pinned search_path (DEFINER hijack guard). EXECUTE to pawpi_app.
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function app_is_listing_shelter_staff(p_listing_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from adoptable_listings l
    where l.id = p_listing_id
      and app_is_active_staff_of(l.provider_id)
  )
$$;

grant execute on function app_is_listing_shelter_staff(integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. app_approve_adoption(application_id) — the APPROVAL → pet-transfer mechanics.
--
--    WHAT IT DOES (atomically, in one statement-block):
--      (a) authorizes the caller as ACTIVE STAFF of the application's provider (the shelter);
--          a non-staff caller does nothing and gets NULL back.
--      (b) reads the application's listing (the dog-profile source).
--      (c) CREATES A NEW pets row OWNED BY THE APPLICANT (owner_user_id =
--          applicant_owner_user_id), copying the dog-profile fields (name/breed/age/gender/
--          photo→avatar/story→notes). This is the TRANSFER: the dog now exists as the
--          adopter's own pet and flows into their normal health/social/services experience.
--      (d) marks the application 'approved' (+ links transferred_pet_id) and the listing
--          'adopted'. Other still-open applications for the same listing are left for the
--          shelter to decline (or they simply can no longer be approved — the listing is
--          adopted).
--      Returns the new pets.id (or NULL when not authorized / not approvable).
--
--    WHY SECURITY DEFINER: the new pets row is owned by the ADOPTER, but it is created by the
--    SHELTER STAFF (not the adopter). Under pets RLS (0020) only the owner may insert their
--    own pet (owner_user_id = current_app_user_id()), so a shelter staffer cannot directly
--    insert a pet for someone else. Running the transfer under DEFINER rights lets the
--    shelter complete the adoption without granting staff write access to other users' pets.
--    It is NARROW: it only ever creates the ONE pet that mirrors the approved listing, owned
--    by that application's applicant, and only when the caller is the shelter's active staff.
--    STABLE is NOT used (it writes); search_path is pinned (DEFINER hijack guard).
-- ════════════════════════════════════════════════════════════════════════════════
create or replace function app_approve_adoption(p_application_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app       adoption_applications%rowtype;
  v_listing   adoptable_listings%rowtype;
  v_new_pet   integer;
  v_handle    text;
begin
  -- Load the application; only an approvable (non-terminal) one proceeds.
  select * into v_app from adoption_applications where id = p_application_id;
  if v_app.id is null then
    return null;
  end if;
  if v_app.status not in ('submitted','under_review') then
    return null; -- already approved/declined → not re-approvable.
  end if;

  -- Authorize: the caller must be ACTIVE STAFF of the application's shelter.
  if not app_is_active_staff_of(v_app.provider_id) then
    return null;
  end if;

  -- Load the listing (the dog-profile source).
  select * into v_listing from adoptable_listings where id = v_app.listing_id;
  if v_listing.id is null then
    return null;
  end if;

  -- Build a collision-safe handle for the new pet (handle is UNIQUE on pets). A NULL handle
  -- is allowed, but a deterministic adopted-<listing>-<applicant> keeps it traceable and
  -- unique across re-homes.
  v_handle := 'adopted-' || v_listing.id || '-' || v_app.applicant_owner_user_id;

  -- (c) CREATE the adopter's new pet, copying the dog-profile fields. owner_user_id is the
  -- APPLICANT (the transfer target). avatar_url copies the first listing photo; notes carries
  -- the story. adoption_date stamps today.
  insert into pets (
    owner_user_id, name, handle, avatar_url, species, breed,
    age_years, age_months, gender, notes, adoption_date
  ) values (
    v_app.applicant_owner_user_id,
    v_listing.name,
    v_handle,
    coalesce(v_listing.photo_urls[1], null),
    'dog',
    v_listing.breed,
    v_listing.age_years,
    v_listing.age_months,
    v_listing.gender,
    v_listing.story,
    current_date
  )
  returning id into v_new_pet;

  -- (d) Mark the application approved + link the new pet; mark the listing adopted.
  update adoption_applications
  set status = 'approved', transferred_pet_id = v_new_pet, updated_at = now()
  where id = v_app.id;

  update adoptable_listings
  set status = 'adopted', updated_at = now()
  where id = v_listing.id;

  return v_new_pet;
end;
$$;

grant execute on function app_approve_adoption(integer) to pawpi_app;

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — adoptable_listings. Two-tier (mirrors shop_products, 0037): a PUBLISHED place's
--    AVAILABLE listings are readable by any authed (DISCOVERY); shelter ADMIN/STAFF write +
--    read everything (incl. pending/adopted + a draft place).
-- ════════════════════════════════════════════════════════════════════════════════
alter table adoptable_listings enable row level security;
alter table adoptable_listings force row level security;

-- SELECT: an AVAILABLE listing of a PUBLISHED provider (DISCOVERY — the providers EXISTS runs
-- under providers' own SELECT RLS, where a published provider is visible to any authed user)
-- OR active staff of the place (management read incl. pending/adopted + a draft place).
-- app_is_active_staff_of (0023) is a DEFINER helper over provider_staff → no recursion.
drop policy if exists adoptable_listings_read on adoptable_listings;
create policy adoptable_listings_read on adoptable_listings
  for select
  using (
    app_is_active_staff_of(provider_id)
    or (
      status = 'available'
      and exists (
        select 1 from providers p
        where p.id = provider_id and p.status = 'published'
      )
    )
  );

-- Writes (INSERT/UPDATE/DELETE): shelter ADMIN only (listing management). FOR ALL with the
-- admin predicate on USING + WITH CHECK — an owner/another place's staff cannot create or
-- mutate a listing. (app_approve_adoption flips status under DEFINER rights, so the adopted
-- transition doesn't need a staff UPDATE here.)
drop policy if exists adoptable_listings_admin_all on adoptable_listings;
create policy adoptable_listings_admin_all on adoptable_listings
  for all
  using (app_is_provider_admin(provider_id))
  with check (app_is_provider_admin(provider_id));

-- ════════════════════════════════════════════════════════════════════════════════
-- 7. RLS — adoption_applications. Applicant sees/owns OWN; shelter staff SEE + advance THEIR
--    place's applications. Per-command so the applicant can submit/withdraw while the shelter
--    can read + update (review) but never fabricate an application for an owner.
-- ════════════════════════════════════════════════════════════════════════════════
alter table adoption_applications enable row level security;
alter table adoption_applications force row level security;

-- SELECT: the applicant (their own) OR active staff of the application's shelter. The shelter
-- branch uses app_is_active_staff_of(provider_id) directly off the denormalized provider_id —
-- no read of adoptable_listings needed (so no listings-policy recursion).
drop policy if exists adoption_applications_select on adoption_applications;
create policy adoption_applications_select on adoption_applications
  for select
  using (
    applicant_owner_user_id = current_app_user_id()
    or app_is_active_staff_of(provider_id)
  );

-- INSERT: the applicant only — you may only submit AS yourself. provider_id must match the
-- listing's provider (the route sets it; this WITH CHECK pins the applicant identity).
drop policy if exists adoption_applications_applicant_insert on adoption_applications;
create policy adoption_applications_applicant_insert on adoption_applications
  for insert
  with check (applicant_owner_user_id = current_app_user_id());

-- UPDATE: the applicant (withdraw — though declined is the terminal they reach) OR active
-- shelter staff (review: under_review/declined; approval rides the DEFINER helper). Both
-- sides are bound by their identity so neither can act on another party's row.
drop policy if exists adoption_applications_update on adoption_applications;
create policy adoption_applications_update on adoption_applications
  for update
  using (
    applicant_owner_user_id = current_app_user_id()
    or app_is_active_staff_of(provider_id)
  )
  with check (
    applicant_owner_user_id = current_app_user_id()
    or app_is_active_staff_of(provider_id)
  );

-- DELETE: the applicant may withdraw their own application. (Shelters decline, not delete.)
drop policy if exists adoption_applications_applicant_delete on adoption_applications;
create policy adoption_applications_applicant_delete on adoption_applications
  for delete
  using (applicant_owner_user_id = current_app_user_id());

-- ════════════════════════════════════════════════════════════════════════════════
-- 8. RLS — adoption_favorites. OWNER-PRIVATE: an owner sees/owns only their own favorites.
-- ════════════════════════════════════════════════════════════════════════════════
alter table adoption_favorites enable row level security;
alter table adoption_favorites force row level security;

drop policy if exists adoption_favorites_owner_all on adoption_favorites;
create policy adoption_favorites_owner_all on adoption_favorites
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());
