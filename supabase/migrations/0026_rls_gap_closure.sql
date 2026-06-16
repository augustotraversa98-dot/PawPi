-- 0026_rls_gap_closure.sql
-- RLS hardening R2g (docs/rls-hardening.md §R2g, provider-design.md §5): the GAP CLOSURE.
-- During the R3 cutover a verification check on LIVE Supabase found 7 public tables with
-- RLS ENABLED but ZERO policies — meaning the not-yet-active pawpi_app role would read
-- ZERO rows from them. (RLS was enabled on those tables by Supabase's own setup; our
-- migrations never enabled it, so in the embedded-postgres harness they have RLS OFF — the
-- harness cannot reproduce the "RLS-on-no-policy" Supabase state for the auth/identity
-- tables, which is expected. The harness DOES prove the social_walks policies + that
-- pawpi_app can read the identity tables after the DISABLE below.) This migration closes
-- the gap in two ways: DISABLE RLS on the 5 auth/identity infra tables (they live OUTSIDE
-- the RLS model by necessity), and ADD proper policies to the 2 social-walk DATA tables.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven in the integration harness, NOT applied to Supabase.
-- The user applies 0026 on Supabase DURING the cutover (then re-runs the policy-count
-- check, then flips DATABASE_URL to pawpi_app). Applying it from here would change prod.
-- See docs/rls-hardening.md §R2g.
--
-- Idempotent: ALTER … DISABLE / ENABLE / FORCE are naturally idempotent; DROP POLICY IF
-- EXISTS guards re-runs. Mirrored into supabase/supabase_schema.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AUTH / IDENTITY INFRASTRUCTURE — DISABLE RLS (these are RLS-EXEMPT by necessity).
--
-- WHY they cannot be RLS-gated on app.current_user_id: the app reads them BEFORE that GUC
-- is set. resolveUserId (src/app/api/utils/currentUser.js) — and every route's inline
-- `SELECT id FROM user_profiles WHERE auth_user_id = …` — reads user_profiles to TRANSLATE
-- the auth id into the user_profiles.id that withRequestContext then stamps into
-- app.current_user_id (R1). And the Auth.js adapter (src/auth.js) reads auth_users /
-- auth_accounts / auth_sessions / auth_verification_token during login/session, also before
-- any identity exists. A policy keyed on current_app_user_id() would therefore deny the very
-- lookups that ESTABLISH the identity → an unbreakable chicken-and-egg lockout once pawpi_app
-- connects. So these five tables sit outside the RLS model and are protected by the app
-- (auth flow) + least-privilege grants (0019), not by row policies.
--
-- pawpi_app already holds table grants on all five (0019's blanket GRANT … ON ALL TABLES;
-- these tables predate 0019). With RLS OFF, those grants let it resolve identity + sessions.
--
-- In the harness these five ALREADY have RLS off (our migrations never enabled it), so each
-- DISABLE is a no-op here — fine/idempotent. On Supabase they flip RLS OFF so pawpi_app,
-- which the Supabase-enabled-but-unpolicied RLS would otherwise block, can bootstrap.
alter table auth_users              disable row level security;
alter table auth_accounts           disable row level security;
alter table auth_sessions           disable row level security;
alter table auth_verification_token disable row level security;
alter table user_profiles           disable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. social_walks — a SOCIAL DATA table (mirrors the routes EXACTLY — no wider).
--
-- The route SQL (src/app/api/social-walks/**) was read directly to pin each predicate:
--   READ  = any authenticated user. social_walks is a social/discovery surface: the GET
--           route returns nearby_pets / friends_only walks owned by OTHER users, and the
--           join-request POST reads ANY scheduled walk by id (no visibility filter) so a
--           prospective participant can see the walk it is joining. The route layer does the
--           visibility/friendship filtering in its WHERE clauses; RLS only needs to not block
--           those reads. Same any-authed read shape as posts (R2b).
--   WRITE = owner only. The owner CREATEs the walk (POST, owner_user_id = me); there is no
--           update/delete route today. A single owner FOR ALL policy is the safe default
--           (a FORCE-RLS'd table must not be left un-policied) and keeps every write
--           owner-scoped — same two-tier shape as pets (R2a) / posts (R2b).
alter table social_walks enable row level security;
alter table social_walks force row level security;

-- READ: any authenticated user (SELECT-only — writes stay governed by the owner policy).
drop policy if exists social_walks_authed_read on social_walks;
create policy social_walks_authed_read on social_walks
  for select
  using (current_app_user_id() is not null);

-- WRITE (and owner read): the walk owner, USING/WITH CHECK owner_user_id = me. Permissive
-- SELECT policies OR together, so effective access = read any-authed, write owner-only.
drop policy if exists social_walks_owner_all on social_walks;
create policy social_walks_owner_all on social_walks
  for all
  using (owner_user_id = current_app_user_id())
  with check (owner_user_id = current_app_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. social_walk_join_requests — per-command (reads/writes differ; requester vs walk owner).
--
-- Mirrors the routes EXACTLY:
--   SELECT — three audiences the routes expose:
--     (a) the REQUESTER reads their OWN requests, any status (the join-request POST's
--         "already approved?" check WHERE requester_user_id = me; a requester's self-view);
--     (b) any authed user reads APPROVED rows — the discovery GET surfaces
--         approved_participants_count via a COUNT subquery to any authed reader, and the
--         join-request POST lets a prospective (non-owner) participant COUNT approved rows to
--         enforce max_pets. A COUNT only sees RLS-visible rows, so approved rows must be
--         readable to any authed user or those guards would silently undercount. This is the
--         row-level equivalent of the count the app already exposes — no wider;
--     (c) the WALK OWNER reads ALL requests for THEIR walk (the GET list + approve/decline +
--         the myWalks pending/approved count subqueries). The EXISTS runs under social_walks'
--         own (any-authed) SELECT RLS — the owner's walk is visible there, so NO security-
--         definer helper is needed and there is no recursion (social_walks' policies never
--         reference this table). Same self-referential-write reasoning as pet_follows (R2b).
--   INSERT — the REQUESTER creates their own row (requester_user_id = me). The route verifies
--            pet ownership + walk availability at the app layer; the policy pins the actor.
--   UPDATE — the WALK OWNER only (approve/decline flips status). social_walk_id never changes,
--            so the owner EXISTS holds for the updated row (WITH CHECK defaults to USING) and
--            the route's RETURNING * reads it back (owner branch + the approved branch).
--   DELETE — no policy: there is no delete route → FORCE denies it for everyone.
alter table social_walk_join_requests enable row level security;
alter table social_walk_join_requests force row level security;

drop policy if exists social_walk_join_requests_select on social_walk_join_requests;
create policy social_walk_join_requests_select on social_walk_join_requests
  for select
  using (
    requester_user_id = current_app_user_id()
    or (current_app_user_id() is not null and status = 'approved')
    or exists (
      select 1 from social_walks sw
      where sw.id = social_walk_id
        and sw.owner_user_id = current_app_user_id()
    )
  );

drop policy if exists social_walk_join_requests_insert on social_walk_join_requests;
create policy social_walk_join_requests_insert on social_walk_join_requests
  for insert
  with check (requester_user_id = current_app_user_id());

drop policy if exists social_walk_join_requests_update on social_walk_join_requests;
create policy social_walk_join_requests_update on social_walk_join_requests
  for update
  using (
    exists (
      select 1 from social_walks sw
      where sw.id = social_walk_id
        and sw.owner_user_id = current_app_user_id()
    )
  );
