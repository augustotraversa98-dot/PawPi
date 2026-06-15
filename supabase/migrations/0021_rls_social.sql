-- 0021_rls_social.sql
-- RLS hardening R2b (docs/rls-hardening.md §R2b): the SOCIAL / PUBLIC-READ table
-- group. PawPi is a social app — any LOGGED-IN user views other pets' profiles and
-- sees other pets' posts in the global "Suggested" feed. So these tables are
-- READABLE by any authenticated user; only the ACTOR may WRITE their own rows.
-- This is the OPPOSITE shape from the private/medical group (R2c, strict owner/grant).
--
-- "any authenticated user" = current_app_user_id() IS NOT NULL (the GUC is set →
-- a real user_profiles.id is in scope). NULL (no identity) → deny by default.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as `pawpi_app` in the integration harness,
-- NOT applied to Supabase. R3 applies the whole accumulated R2 set at the
-- DATABASE_URL cutover to pawpi_app. Enabling FORCE RLS in prod now (privileged
-- owner connection, only pilot routes set identity) would make non-identity routes
-- read zero rows — an outage. See docs/rls-hardening.md.
--
-- DML + sequence grants for these tables are ALREADY provided by 0019's blanket
-- `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES`
-- (these tables predate 0019), exactly as `pets` (0020) relied on. No per-table
-- re-grant here; the as-pawpi_app integration test is the proof the grants suffice.

-- ──────────────────────────────────────────────────────────────────────────────
-- 0. pets — CORRECT the R2a read rule (the gap R2a flagged).
--    R2a scoped pets reads to owner + provider-grant/booking. But the social
--    profile read (GET /api/pets/[id]/profile, by id OR handle) and the feed's
--    `JOIN pets` expose ANY pet to ANY signed-in user — broader than owner+grant+
--    booking. So replace the provider-read policy with an any-authed SELECT policy.
--    The provider helpers (app_provider_has_grant/booking) STAY — they gate the
--    MEDICAL tables in R2c, not pets.
--
--    pets_owner_all (0020, FOR ALL, owner_user_id = me) is UNTOUCHED: writes stay
--    owner-only. Permissive SELECT policies OR together, so SELECT becomes
--    "owner OR any-authed" = any-authed, while INSERT/UPDATE/DELETE remain governed
--    ONLY by pets_owner_all (the read policy is SELECT-only) → owner-only writes.
--    Effective access: read = any authed; insert/update/delete = owner only.
drop policy if exists pets_provider_read on pets;

drop policy if exists pets_authed_read on pets;
create policy pets_authed_read on pets
  for select
  using (current_app_user_id() is not null);

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. posts — read: any authed (global feed + profile grids). write: the author
--    (user_id = me; POST sets user_id = caller after validating pet ownership).
alter table posts enable row level security;
alter table posts force row level security;

drop policy if exists posts_authed_read on posts;
create policy posts_authed_read on posts
  for select
  using (current_app_user_id() is not null);

-- Author's full read+write of their OWN posts. Permissive → its SELECT clause OR's
-- with posts_authed_read (read stays any-authed); INSERT/UPDATE/DELETE are governed
-- ONLY by this policy → author-only writes (WITH CHECK pins the row to the caller).
drop policy if exists posts_author_all on posts;
create policy posts_author_all on posts
  for all
  using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. post_paws — read: any authed (paw counts + user_has_pawed). write
--    (INSERT/DELETE): the actor (user_id = me).
alter table post_paws enable row level security;
alter table post_paws force row level security;

drop policy if exists post_paws_authed_read on post_paws;
create policy post_paws_authed_read on post_paws
  for select
  using (current_app_user_id() is not null);

drop policy if exists post_paws_author_all on post_paws;
create policy post_paws_author_all on post_paws
  for all
  using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. post_barks — read: any authed (comments + counts). write: the author
--    (user_id = me). pet_id is nullable/legacy (the commenting pet) — NOT gated on.
alter table post_barks enable row level security;
alter table post_barks force row level security;

drop policy if exists post_barks_authed_read on post_barks;
create policy post_barks_authed_read on post_barks
  for select
  using (current_app_user_id() is not null);

drop policy if exists post_barks_author_all on post_barks;
create policy post_barks_author_all on post_barks
  for all
  using (user_id = current_app_user_id())
  with check (user_id = current_app_user_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. pet_follows — read: any authed (follower/following counts, isFollowing,
--    feed subqueries). write (INSERT/DELETE): the caller must OWN the FOLLOWER pet.
--    Following another pet does NOT require owning the followed pet. The EXISTS on
--    `pets` is evaluated under pets' RLS as pawpi_app — the follower pet is the
--    caller's OWN, so pets_owner_all makes it visible (no SECURITY DEFINER needed).
alter table pet_follows enable row level security;
alter table pet_follows force row level security;

drop policy if exists pet_follows_authed_read on pet_follows;
create policy pet_follows_authed_read on pet_follows
  for select
  using (current_app_user_id() is not null);

drop policy if exists pet_follows_owner_write on pet_follows;
create policy pet_follows_owner_write on pet_follows
  for all
  using (
    exists (
      select 1 from pets p
      where p.id = pet_follows.follower_pet_id
        and p.owner_user_id = current_app_user_id()
    )
  )
  with check (
    exists (
      select 1 from pets p
      where p.id = pet_follows.follower_pet_id
        and p.owner_user_id = current_app_user_id()
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. pet_friendships — PARTICIPANT-scoped read AND write (NOT public). The only
--    app usage (social-walks GET, friends_only) reads friendships where one of the
--    caller's pets participates — i.e. the caller is requester_user_id OR
--    receiver_user_id. There is NO friendship write route in the app today, so this
--    is the safe-default participant scope (requester creates / either participates)
--    rather than a public-read policy — once FORCE RLS is on, the table must not be
--    left un-policied. A non-participant sees and writes zero.
alter table pet_friendships enable row level security;
alter table pet_friendships force row level security;

drop policy if exists pet_friendships_participant on pet_friendships;
create policy pet_friendships_participant on pet_friendships
  for all
  using (
    requester_user_id = current_app_user_id()
    or receiver_user_id = current_app_user_id()
  )
  with check (
    requester_user_id = current_app_user_id()
    or receiver_user_id = current_app_user_id()
  );
