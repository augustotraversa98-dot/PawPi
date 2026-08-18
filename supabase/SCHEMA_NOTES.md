# Schema Notes — PawPi database

**Status: VERIFIED against the real database.** The migrations in `supabase/migrations/` are now a faithful reproduction of `supabase/supabase_schema.sql` — the schema-only dump exported from Anything's Neon Postgres database and cleaned for Supabase. `supabase_schema.sql` is the **source of truth**; the migrations restate it as ordered, idempotent files (parents → children) so it can be applied and version-controlled cleanly.

The earlier version of this file documented *guesses* from a code-only reconstruction. Those guesses have now been confirmed or corrected against the dump — see "Previously-flagged uncertainties: RESOLVED" below.

Migration order: numeric, `0001` → current. **`supabase/migrations/` is the source of truth** for the
full list (don't hand-maintain an enumeration here — it goes stale). Beyond 0055 the set continues through
Waves 7–9 + App Store readiness (0056–0064), UGC moderation (0065 base + 0066 the provider_post moderation
follow-up), and **legal consent at signup (0067 — `legal_consents`
append-only ledger keyed to `auth_users.id` + the `app_record_consent` SECURITY DEFINER insert helper;
admin-only SELECT, DEFINER-only writes, server-authoritative versions). 0067 took the next free integer
past the reserved 0066.** Then **daily video moments — step 1 (0068 — additive `posts.media_type` /
`video_url` / `video_thumbnail_url`; schema only, no RLS/policy change)**, and **self-service password
reset (0069 — `password_reset_tokens` + the `app_create_password_reset_token` /
`app_consume_password_reset_token` SECURITY DEFINER helpers; new table only, no existing table's RLS
touched)**. As of the original five-arc
write-up the set ran `0001`–`0055`, in five arcs:
- **0001–0011 — base schema:** auth, user_profiles, pets, social, vet_records, routines, social_walks,
  health_logs, the double-encoded-jsonb backfill (0009), the wellness `general` check-type widen (0010),
  and reminder_dismissals (0011).
- **0012–0018 — Phase-2 prerequisites:** pet_follows, post_barks.pet_id, providers, care_access,
  vaccinations + booking columns, the booking_status check, vaccination reconciliation.
- **0019–0026 — the RLS arc:** role helpers + `pawpi_app` + `current_app_user_id()` (0019), then per-area
  ENABLE/FORCE policies (pets, social, owner-private, provider-records, provider-business, consent-ledger)
  and the gap-closure/completeness guard (0026).
- **0027–0045 — Phase 2 + Wave 3/4 features:** provider capabilities, reviews-surfacing RLS, payments,
  generalized booking, chat, the service modules (grooming/walking/daycare/sitting/training), shop,
  adoption, the subscription cron fn (0039), telehealth (0040), provider links (0041), provider_posts
  (0042), provider_services.image_urls (0043), notifications + `app_notify` (0044), and owner↔owner DMs
  (0045).
- **0046–0055 — Wave 5 + Wave 6 features:** walks-with-buddies (0046), community forum (0047),
  self-training progress (0048), family/caregiver sharing (0049), lost & found (0050); then Wave 6 —
  emergency medical card + DEFINER public-read fns (0051), transport_trips (0052), vet prescriptions +
  refill DEFINER helpers (0053), insurance marketplace + capability-CHECK widen (0054), and the additive
  adoption foster/urgent flags (0055). 0046–0055 are all **APPLIED + VERIFIED on Supabase (2026-06-18)**
  (see `docs/test-backlog.md` ACTION 1).

Migrations are written to be **re-runnable** (DDL uses `IF NOT EXISTS`/`CREATE OR REPLACE`; data backfills
and constraint-widens drop-if-exists then re-add). Per-migration call-outs that matter are kept below; the
0039–0045 set is harness-proven and hand-applied to Supabase as each ticket lands (see `docs/test-backlog.md`
ACTION 1).

> **0010** widens `health_wellness_logs.check_type` to also allow `'general'` (Ticket 7 wellness-log slice) so a "General check" lands in `health_wellness_logs` with the same `routine_id` + `wellness_check_item_index` linkage as the other wellness checks. Weight intentionally stays on `health_weight_logs` (Insights path) and is **not** in this constraint. `supabase_schema.sql` (line ~574) was updated to match.

> **0011** adds `reminder_dismissals` — a durable "skip/dismiss" record per scheduled reminder instance (Ticket 8 Today-Overdue slice). The reminders store is in-memory, so a skip would otherwise reappear after an app restart; this table lets the on-load reconciliation clear dismissed overdue items alongside the log-derived "resolved" set. `instance_key` is the reminder's deterministic id (`reminder_<routine>_<item>_<date>` or `vet_apt_<id>`); the `UNIQUE(owner_user_id, pet_id, instance_key)` makes a repeat dismissal idempotent. `routine_id` is nullable (vet-appointment reminders are not routine-backed) with `ON DELETE SET NULL`. Appended to `supabase_schema.sql` as a post-dump addendum.

> **0068** adds video support to `posts` (foundation for the daily "lucky user" video moment) — three
> PURELY ADDITIVE columns, no RLS/policy change (posts is already ENABLE+FORCE RLS from 0004 and in the
> UGC-moderation surface — `hidden_at` + the `'post'` report type from 0065 — both untouched):
> `media_type text NOT NULL DEFAULT 'image'` with a `posts_media_type_check` CHECK (`image`|`video`),
> `video_url text` (the playable file; NULL for image posts), and `video_thumbnail_url text` (poster
> frame for the feed + locked-blur; NULL for image posts). `image_url` is kept as-is (still the photo for
> image posts) — nothing dropped or renamed. Existing rows default to `media_type='image'` with both video
> columns NULL, so all current image posts are unaffected. Idempotent (`add column if not exists` +
> drop-if-exists/re-add the constraint). Verify: `supabase/verify_0068.sql` (all rows PASS). HARNESS-ONLY
> this ticket — hand-applied to Supabase after merge.

> **0069** adds self-service password reset — the server side of `/account/forgot-password`, which was
> a frontend-only stub. One new table plus two SECURITY DEFINER helpers; **no existing table's RLS is
> touched**.
> - `password_reset_tokens` — keyed to **`auth_users.id`, not `user_profiles.id`**, for the same reason
>   0067's `legal_consents` is: profiles are created lazily, and here the requester is by definition
>   logged OUT, so `app.current_user_id` is unset for the entire flow and no owner policy could ever be
>   satisfied. Stores **`token_hash` = sha256(token)** (unique index) — never the token itself, so a DB
>   dump yields nothing redeemable. Single-use is enforced on `used_at`; expiry on `expires_at` (the
>   route mints 30 minutes).
> - RLS: ENABLE + FORCE with **admin-only SELECT** (reuses `app_is_admin()`) and **no
>   INSERT/UPDATE/DELETE policy at all**. That leaves the two DEFINER helpers as the only writers, and
>   means a logged-in attacker cannot read a pending reset off a session — not even their own.
> - `app_create_password_reset_token(...)` issues one token; it returns **NULL** rather than raising
>   when an account exceeds 5 tokens/hour, so the route's uniform "if that email exists…" response
>   stays uniform (a throttled request is indistinguishable from an unknown address).
> - `app_consume_password_reset_token(token_hash, password_hash)` validates unused+unexpired under
>   `FOR UPDATE`, burns the token **and every other outstanding token for that account**, writes the
>   password hash to `auth_accounts` (creating a `credentials` row if the account was social-only), and
>   deletes that account's `auth_sessions`. It returns the `auth_users.id`, or **NULL for every failure
>   reason** so the route can't leak which one. Every statement is filtered by the token's own
>   `auth_user_id` — no other account is read or written.
> - Password hashing stays in the **app layer** (argon2, as in `src/auth.js`); Postgres is handed a hash
>   and never sees a plaintext password. Verify: `supabase/verify_0069.sql`. HARNESS-ONLY this ticket —
>   hand-applied to Supabase after merge.

> **0070** adds per-service booking payment policy — the schema side of "let a provider charge for
> a booking" (booking-payments Phase 1). ONE purely additive column on `provider_services`:
> `payment_policy text NOT NULL DEFAULT 'none'` with a `provider_services_payment_policy_check` CHECK
> (`none`|`deposit`|`full`). `none` = pay in person (the default, so every existing service is
> unchanged); `deposit` = charge the existing `deposit_cents` (0014) up front; `full` = charge the
> existing `price_cents` up front. No new table, no RLS/policy change (provider_services is already
> ENABLE+FORCE RLS from 0024; this column rides it). The money model is unchanged — an up-front charge
> is still an orders/payments row (0029) linked via `vet_appointments.order_id` (0030); this column
> only records the provider's INTENT. Idempotent (`add column if not exists` + drop/re-add the CHECK).
> Verify: `supabase/verify_0070.sql`. HARNESS-ONLY this ticket — hand-applied to Supabase after merge.

> **0071** adds daycare per-night pricing — a DEDICATED `nightly_rate_cents integer` (CHECK null-or-≥0)
> on `provider_services` (the daycare menu is provider_services capability='daycare', 0034). Purely
> additive, rides existing 0024 RLS; no policy/table change. Kept separate from the generic `price_cents`
> on purpose — a stay is priced rate × nights, not flat. WHEN to charge reuses `payment_policy` (0070):
> full → nightly_rate_cents × nights, deposit → deposit_cents, none → free. The charge is a normal
> orders/payments row; a stay links via the order source_ref = 'daycare:<stayId>' (no stay column, same
> pattern as transport). Idempotent. Verify: `supabase/verify_0071.sql`. HARNESS-ONLY this ticket —
> hand-applied to Supabase after merge.

> **0094** adds the "Pet Owner engagement" wave foundations (unit E0, `docs/pet-owner-engagement.md`) —
> the shared schema the Care Ring (E1), Streak+forgiveness (E2), Milestone moments (E3) and Share cards
> (E4) hang off. THREE additive changes, **no existing table's RLS touched**:
> - The **gotcha / adoption day already exists** as `pets.adoption_date` (0003) and is already synced
>   Dog Profile ↔ Pet Medical Profile (both `/api/pets/[id]` PATCH and `/api/pet-medical-profiles`
>   read+write the SAME column — one storage). E3 reads it as the spec's "adopted_on". So 0094 adds **no**
>   new adoption column — it reuses `adoption_date`.
> - `user_profiles.timezone text` — the per-owner IANA tz the ring uses for its day boundary. **NULLABLE,
>   no default** (honest: empty until the owner sets it; consumers resolve `COALESCE(timezone,
>   'America/Buenos_Aires')`). Purely additive; user_profiles' owner-private RLS is unchanged.
> - `pet_care_days` — one row per (pet, owner-tz `day`) with the ring's derived segment state
>   (`walk_done`/`moment_done`/`care_done`), `ring_closed`, and a `rest_day` flag (E1 rest/vacation mode);
>   `UNIQUE(pet_id, day)`. `pet_streaks` — one row per pet (PK `pet_id`): `current_count`/`longest_count`/
>   `last_closed_day`/`freezes_available` (default 1)/`paused_until` — the ring-close streak + forgiveness
>   state. Both **ENABLE+FORCE RLS** with a single own-row `FOR ALL` policy
>   (`owner_user_id = current_app_user_id()`), the 0048/0050 pattern; app connects as `pawpi_app`.
> - Idempotent. Verify: `supabase/verify_0094.sql` (all PASS). RLS proven as `pawpi_app` in
>   `engagement-foundations-rls.integration.test.ts`. **✅ APPLIED + VERIFIED on Supabase 2026-08-13**
>   (verify_0094 all PASS).

> **0095** adds the engagement STREAK + FORGIVENESS layer (unit E2) on top of the Care Ring — no
> existing table's RLS touched. TWO additive changes:
> - `pet_streaks` gains `pre_reset_count` / `reset_at` (the ~48h one-tap **repair** window — what a
>   restore brings back) and `last_award_count` (so a milestone freeze is banked **once**, never
>   re-granted). Additive columns; pet_streaks' own-row RLS (0094) is unchanged.
> - Two **SECURITY DEFINER** helpers own the streak math (single source of truth), pinned search_path,
>   granted to pawpi_app: `app_advance_care_streak(pet, owner, day)` — called when the ring CLOSES;
>   idempotent (same day = no-op); a gap of missed **non-excused** days auto-consumes banked freezes,
>   and only a gap wider than the bank resets to 1 (remembering the run for repair). A `rest_day`
>   (`pet_care_days.rest_day`) or a paused day (`<= pet_streaks.paused_until`) is **excused** — never a
>   miss. Milestones 7/30/100 bank a freeze, capped at 2. `app_repair_care_streak(pet, owner)` — within
>   ~48h of a reset, reconnects the pre-reset run (`current := pre_reset_count + current`) and clears
>   the window. DEFINER so the math runs uniformly regardless of per-row RLS (mirrors
>   `app_grant_walk_credits`). The `/api/pets/[id]/care-ring` route calls advance on close and exposes a
>   `repair_streak` POST action; both DEGRADE CLEANLY pre-migration (undefined_table 42P01 /
>   undefined_function 42883 → ring without a streak, never a 500). Idempotent. Verify:
> `supabase/verify_0095.sql`. **✅ APPLIED + VERIFIED on Supabase 2026-08-13** (verify_0095 all PASS).

> **0096–0099** are the "Pet Owner engagement" wave PART 2 (units E6–E9, `docs/pet-owner-engagement.md`).
> All ADDITIVE, harness-proven, and **✅ APPLIED + VERIFIED on Supabase 2026-08-14** (verify_0096–0099
> all PASS). No existing table's RLS is touched; consumer code degraded cleanly (42P01/42883 → feature
> absent, never 500) before they were applied. (E5 + E10 shipped with NO migration.)
> - **0096** (E6 onboarding welcome paw): `app_welcome_account()` **lazily** creates the single official
>   "PawPi Welcome" account (username `pawpi_welcome`) — deliberately NOT a migration-time seed INSERT,
>   because seeding an identity row at migration time collides with the integration harness's explicit-id
>   first-test seeding. `app_welcome_paw(post_id)` DEFINER inserts that account's paw on a new owner's
>   first post + a labelled `welcome` notification (post_paws' write policy only lets the *actor* paw).
>   `notifications_type_check` widened with `'welcome'`. Verify: `verify_0096.sql`.
> - **0097** (E7 pack streaks): `pet_pack_streaks` (participant-scoped ENABLE+FORCE RLS, unordered-pair
>   unique index) + 5 DEFINER helpers (request-by-@handle / accept / advance-on-close / boop / reader) —
>   DEFINER because every action crosses the owner boundary. Reader needs `#variable_conflict use_column`
>   (RETURNS TABLE out-cols shadow the joined tables' `id`/`status`). Type check += `pack_invite` /
>   `pack_accepted` / `boop`. Verify: `verify_0097.sql`.
> - **0098** (E8 leaderboards): additive opt-in coarse-geo on `pets` (`lb_opt_in` / `lb_area`; **never**
>   lat/lng) + `pet_leaderboard_weeks` (own-row ENABLE+FORCE RLS, weekly snapshot for promotion/
>   relegation) + `app_pet_week_xp` / `app_leaderboard` DEFINER (XP from care effort incl. paws GIVEN,
>   never received; density-gated cohorts). Reader uses `#variable_conflict use_column` + `drop table if
>   exists _cohort` (re-callable within one tx). Verify: `verify_0098.sql`.
> - **0099** (E9 activity insight): `app_activity_cohort` DEFINER (same-breed + age±1yr weekly walk
>   counts → cohort_size / above_median / percentile); no table. The positive-only rule lives in the
>   route's pure `decideInsight`. Verify: `verify_0099.sql`.

> **0100–0106** are the "Pet Owner engagement" **WAVE 2** (units E11–E15, Household & Retention). All
> ADDITIVE, harness-proven, and **✅ APPLIED + VERIFIED on Supabase 2026-08-14** (verify_0100–0106 all
> PASS). No existing table's RLS is loosened beyond "owner OR accepted caregiver"; consumers degrade
> cleanly (42P01/42883/42703/RLS-denial → feature absent, never 500).
> - **0100** (E11 weekly digest): `weekly_digest_prefs` + `weekly_digest_state` (own-row RLS,
>   UNIQUE(pet,week)); notifications_type_check += 'weekly_digest'; `app_weekly_digest_due(timestamptz,int)`
>   DEFINER cross-owner "Sunday-evening due" enumerator (like app_due_subscriptions). Verify `verify_0100.sql`.
> - **0101** (E12 comeback): `reengagement_state` (own-row); type_check += 'winback';
>   `app_reengagement_due(...)` DEFINER lapsed-pet enumerator w/ real hook signals + `app_winback_repair_streak`
>   (E2 repair w/ configurable grace window). Verify `verify_0101.sql`.
> - **0102** (E13 PR1 shared ring): caregiver `FOR ALL` policies on pet_care_days + pet_streaks (alongside
>   the 0094 owner own-row) + `app_pet_ring_segments(pet,tz,day)` DEFINER (derives by pet_id across ALL
>   contributors). Reuses 0049's `app_user_has_pet_access`. Verify `verify_0102.sql`.
> - **0103** (E13 PR2 day-card): swap the daily-moment unique index from one-per-pet-per-day (0004) to
>   one-per-AUTHOR-per-pet-per-day (`idx_posts_one_daily_per_author_per_pet_per_day`). Verify `verify_0103.sql`.
> - **0104** (E13 PR3 leaderboard): `household_leaderboard_prefs` (owner-manage + caregiver-read) +
>   `app_household_leaderboard(pet,week_start)` DEFINER (per-member weekly counts). Verify `verify_0104.sql`.
> - **0105** (E14 family streak): `household_streaks` (own-row) + `app_advance_household_streak(owner,day)`
>   DEFINER (advances only when EVERY owned dog closed; forgiveness-aware; opt-in). Verify `verify_0105.sql`.
> - **0106** (E15 life stage): additive `pets.life_stage_override` (CHECK null|puppy|adult|senior; NULL =
>   auto-detect). No RLS change. Verify `verify_0106.sql`.

> **0107** is the Wave 2 **Fix-pack** FF1 (per-user email locale). ADDITIVE, harness-proven, and
> **✅ APPLIED + VERIFIED on Supabase 2026-08-14** (verify_0107 all PASS). No existing table's RLS is
> touched; consumers degrade cleanly (undefined_column / old-function-without-column → es-AR fallback).
> - Adds `user_profiles.preferred_locale text` (CHECK null|'en'|'es'; NULL = es-AR fallback, so current
>   behaviour is preserved) — the E11 weekly-digest + E12 win-back EMAILS are server-rendered and now
>   render in the recipient's stored language.
> - DROPs+recreates the two DEFINER enumerators `app_weekly_digest_due` / `app_reengagement_due` to also
>   RETURN `preferred_locale` (RETURNS TABLE gains a column → can't CREATE OR REPLACE; drop-then-create,
>   re-grant to pawpi_app). The senders pass it to `digestEmail`/`winbackEmail`. Written from the app via
>   `PUT /api/user-profile/locale` (owner-scoped; only en/es persist, else NULL) on login + Settings change.
> - Verify: `supabase/verify_0107.sql`.

> **0109** is BN2 PR1 (remote-push foundation). ADDITIVE, harness-proven, and **✅ APPLIED + VERIFIED
> on Supabase 2026-08-15** (verify_0109 all PASS). No existing table's RLS is touched; consumers degrade
> cleanly (42P01/42883 → the send layer + `/api/push-tokens` no-op, never 500).
> - `device_push_tokens` — per-device Expo push-token registry (`user_id → user_profiles.id`, `token`,
>   `platform` (ios|android CHECK), `updated_at`, `UNIQUE(user_id, token)`). **ENABLE + FORCE RLS** with a
>   single own-row `FOR ALL` policy; app connects as `pawpi_app`. It is the device side of the first
>   server→phone push PawPi has had (mobile registers via `POST /api/push-tokens`).
> - Three **SECURITY DEFINER** readers so the web push send-hook — which runs in the ACTOR's request
>   identity, not the recipient's — can cross the owner boundary without loosening the own-row RLS (the
>   0093 `app_provider_active_staff_ids` pattern): `app_recipient_push_tokens(user)` (setof token,platform),
>   `app_notification_pref_enabled(user, category)` (boolean; NULL = absent → caller applies the catalog
>   default), `app_recipient_locale(user)` (preferred_locale for bilingual push copy). All granted to
>   pawpi_app. Idempotent. Verify: `supabase/verify_0109.sql`.

> **0110** is BN2 PR2 (business notification emission). ADDITIVE, harness-proven, and **✅ APPLIED +
> VERIFIED on Supabase 2026-08-15** (verify_0110 all PASS). The ONLY DB change PR2 needs: it widens
> `notifications_type_check` (last set in 0101) to also allow the nine business types `biz_booking` /
> `biz_booking_change` / `biz_order` / `biz_message` / `biz_adoption_application` / `biz_review` /
> `biz_payout` / `biz_post_engagement` / `biz_follow`. No table/RLS change; `app_notify()`'s BX4 gate
> (0108) is untouched (still maps only `walk_requests`) — the new categories follow the BN2 "bell always
> writes, push gated in the JS send-hook" model. Recipient resolution reuses the 0093 DEFINER reader
> (owner is enrolled as active staff). Idempotent (drop-if-exists + re-add). Degrades clean while absent
> (safeNotify swallows the 23514 CHECK violation → the new bell rows drop, never 500). Verify:
> `supabase/verify_0110.sql`.

> **0113** is PP3 (pre-launch polish fix-pack) — the write rate limiter. ADDITIVE, harness-proven
> (`test/integration/rate-limit.integration.test.ts`, 15 cases). No existing table, policy or function
> is touched; the app **degrades cleanly while absent** — `utils/rateLimit.js` runs the counter call in
> a SAVEPOINT and **fails open**, so a pre-migration deploy behaves exactly as today.
> - `rate_limit_hits` — fixed-window counter, PK `(bucket, subject, window_start)`. `subject` is
>   `'u:<user_profiles.id>'`, or `'ip:<addr>'` when unauthenticated (prefixed so the id spaces cannot
>   collide). `bucket` is free-form on purpose: the limits live in the app-side catalog
>   (`RATE_LIMITS` in `utils/rateLimit.js`), so adding a limited endpoint never needs a migration.
> - **ENABLE + FORCE RLS with a SELECT-only own-row policy and NO write policy.** That is the security
>   property, not an omission: `pawpi_app` cannot INSERT/UPDATE/DELETE this table on any code path, so a
>   caller can never reset their own counter. The only writer is the DEFINER function below.
> - `app_rate_limit_hit(bucket, subject, window_seconds, limit)` — **SECURITY DEFINER**, pinned
>   search_path, granted to pawpi_app. One atomic upsert returns `(allowed, hits, retry_after_seconds)`;
>   `allowed` is `hits <= limit` on the POST-increment count. Self-cleaning: the upsert detects that it
>   INSERTED (`xmax = 0`, i.e. the first hit of a new window) and only then deletes that same
>   `(bucket, subject)`'s older rows, so the steady state is one row per active subject.
> - `app_rate_limit_gc(older_than_seconds)` — ops sweep for subjects that never came back (the
>   self-clean only fires when a subject returns). Verify: `supabase/verify_0113.sql`.

> **0117** is NR4 (docs/night-run-2026-08-18.md) — the REAL backend for "Medications & Care" (the
> mobile modal was an in-memory mock seeded with fake meds). THREE additive changes, no existing
> table's RLS is loosened; consumers degrade cleanly (42P01 → empty list / empty states):
> - **pet_vaccinations (0016) += three ADDITIVE columns** so the owner-side Vaccines tab keeps a full
>   form: `clinic_name text`, `notes text`, `reminder_enabled boolean not null default false`. Purely
>   additive; the table's existing owner-private RLS (0022) is untouched and provider writes are
>   unaffected. Owner create/edit/delete added to `/api/pet-vaccinations` (was GET-only).
> - **pet_medications** — one row per medication; `status` CHECK (`active`|`completed`) with `end_date`
>   stamped on completion; soft-delete via `deleted_at`. Own-row `FOR ALL` RLS
>   (`owner_user_id = current_app_user_id()`), ENABLE+FORCE — the 0048/0050/0094 pattern.
> - **pet_preventive_treatments** — flea/tick/heartworm/dewormer/supplement, `next_due`-driven status;
>   soft-delete; same own-row RLS.
> - Routes: `GET/POST/PATCH/DELETE /api/health/medications` + `.../preventive-treatments` (owner+pet
>   scoped). Mobile hooks `usePetMedications` / `usePetPreventiveTreatments` / extended
>   `usePetVaccinations`. Integer ids; owner_user_id = user_profiles.id; NO seed data.
> - Idempotent. Verify: `supabase/verify_0117.sql`. Own-row RLS proven as pawpi_app in
>   `pet-medications.integration.test.ts`. HARNESS-ONLY this ticket — hand-applied to Supabase after merge.

> **0118** is QC-B (docs/night-run-2026-08-18b.md) — Quick Check per-area detail. The Quick Check form
> (GeneralCheckModal) collects, PER body area, a status + "what changed" selections + a note + photos, but
> `health_general_checks` (0008) only had flat `*_status` + `mood` + `energy` + one `notes` field, so the
> per-area `changes[]` and photos were DROPPED and per-area notes flattened. ONE additive column:
> `areas jsonb` storing the full per-area object `{ eyes: { status, changes:[...], notes, photos:[...] },
> ears: {...}, ... }`. The flat status columns are still written alongside (the route writes both), so
> every current GET consumer is unaffected. The table's owner-private RLS (0022) is UNTOUCHED — the column
> rides it. The `/api/health/general-checks` POST binds it via `sql.json`, isolated in a SAVEPOINT with a
> 42703 fallback insert so a pre-0118 DB degrades (saves the flat check) instead of 500ing. Idempotent
> (`add column if not exists`). Verify: `supabase/verify_0118.sql` (all PASS). Round-trip proven in
> `general-checks-areas.integration.test.ts`. **✅ APPLIED + VERIFIED on Supabase 2026-08-18** (verify_0118
> all PASS; areas jsonb round-trip also confirmed on prod pet 18 = ears `{status:changed, changes:[redness]}`).

> **0119** is QC-C (docs/night-run-2026-08-18b.md) — a completed Quick Check fills the Care Ring's Care
> segment. The ring's `care_done` (E1) was derived from food / medical-care / wellness / photo-check logs
> only, so a general check never filled Care. `CREATE OR REPLACE app_pet_ring_segments` (extends the 0102
> shared derivation, same signature/return) so `care_done` is ALSO true when a same-day
> `health_general_checks` row has **≥1 observation** (any non-null status OR non-empty `notes`; photos-only
> rows don't count). GUARD: an all-empty completion does not fill the ring. Counts by `pet_id` (shared ring
> — owner or caregiver). The inline owner-scoped fallback in `pets/[id]/care-ring/route.js`
> (`deriveSegmentsOwnerScoped`, pre-0102 only) gets the identical branch, kept in sync; `useLogGeneralCheck`
> invalidates `["care-ring", petId]` so the ring fills live. Idempotent. Verify: `supabase/verify_0119.sql`.
> Behaviour matrix proven in `care-ring.integration.test.ts`. **✅ APPLIED + VERIFIED on Supabase
> 2026-08-18** (empty→false, status-obs→true, notes-only→true; confirmed live on-device: completing a Quick
> Check filled the Care Ring's ✓ Care segment).

> **0120** is VR-B (docs/night-run-2026-08-18c.md) — record AUTHORSHIP on the Vet Record tables + the one
> missing family write policy. The mobile "Add record" picker was wired to real per-type add flows this
> ticket, and every record now shows "Added by {name} · {role} · {date}", so the tables need to record who
> authored each row (owner vs a granted FAMILY/Editor — e.g. a vet the owner shared the pet with). TWO
> additive changes, no existing policy loosened beyond the vet_notes family add:
> - `created_by_user_id integer (→ user_profiles, ON DELETE SET NULL)` + `created_by_role text`
>   (CHECK null|'owner'|'editor') on the SIX record tables the picker writes (`pet_allergies`,
>   `pet_conditions`, `pet_surgeries`, `pet_lab_results`, `vet_notes`, `vet_documents`) PLUS
>   `pet_vaccinations` + `pet_medications` for consistency (their owner CRUD stamps 'owner'). Purely
>   additive — every table's existing RLS (0022 owner-private / 0023 R2d / 0049 family / 0117 own-row)
>   rides unchanged. Backfill: every existing row is owner-authored → `created_by_user_id = owner_user_id`,
>   `created_by_role = 'owner'`.
> - `vet_notes_family_all` — the OTHER five record tables already carry `<t>_family_all` (0049 §6d), so a
>   family Editor can already write them; vet_notes (R2d group, 0023) was the one left out. Add the
>   identical additive FOR ALL family policy so an Editor can append a clinical note too. Owner
>   (`vet_notes_owner_all`) + provider (`vet_notes_provider_*`) access is byte-for-byte unchanged.
> - Routes `vet-record/{allergies,conditions,surgeries,lab-results,notes,documents}` now gate reads/writes
>   with the shared owner-OR-family path (`resolvePetLogOwner`, FF2): `owner_user_id` anchors to the pet's
>   OWNER, `created_by_user_id = caller`, `created_by_role = isOwner ? 'owner' : 'editor'`; a Viewer
>   (caregiver) gets 403. GET joins `user_profiles` for `created_by_name`. Idempotent. Verify:
> `supabase/verify_0120.sql`. Owner/editor attribution + Viewer-403 proven as pawpi_app in
> `vet-record-attribution.integration.test.ts`. **✅ APPLIED + VERIFIED on Supabase 2026-08-18**
> (verify_0120 all 7 PASS; add-allergy round-trip confirmed on the iOS Simulator).

> **0121** is VR-C (docs/night-run-2026-08-18c.md) — a tidy CATEGORY on each Vet Record document.
> Documents phase 1 (upload → store → open/download → delete) already worked; this adds owner TAGGING so
> a document lands tidily in history. `vet_documents` had a free-form `document_type` (0005) but nothing
> constrained it to the small, filterable set the history view groups by. ONE purely additive column:
> `category text` with a CHECK for the five canonical buckets (`vaccine`|`lab`|`visit`|`invoice`|`other`),
> nullable (existing rows stay untagged → shown under "other"). Kept SEPARATE from the descriptive
> `document_type` (which the summary counts read) to avoid overloading it. No RLS/policy change —
> vet_documents is already ENABLE+FORCE RLS (0022 owner-private + 0049 family + 0120 attribution) and the
> column rides it. The `/api/vet-record/documents` POST normalizes an unknown category to NULL (CHECK-safe);
> the mobile AddDocumentModal offers the five localized category chips (EN+ES) and the Documents tab shows
> the category + filters by it. AI auto-reading is phase 2 (an honest coming-soon hint in the modal).
> Idempotent. Verify: `supabase/verify_0121.sql`. Category round-trip proven in
> `vet-record-attribution.integration.test.ts`. **✅ APPLIED + VERIFIED on Supabase 2026-08-18**
> (verify_0121 all 4 PASS).

Still deferred: **no seed data.**

---

## Gotchas

### DB query gotcha (neon→porsager, Phase 2 regression)

`api/utils/sql.js` is **porsager's `postgres`** — it executes queries **only via tagged templates**: `` sql`SELECT ... ${val}` ``. The neon-style **positional call `sql(queryString, paramsArray)` does not execute** — it silently returns a `Builder`, runs no query, throws no error, and returns `undefined` with HTTP 200 (so callers believe the write/read succeeded when nothing happened).

- For static queries: use a tagged template — `` sql`...${val}...` ``.
- For runtime-built/dynamic queries (variable column lists): use **`sql.unsafe(queryString, paramsArray)`** — params are still bound; "unsafe" refers only to the query string being non-templated.
- **Never use `sql(string, array)`.**

Swept repo-wide **June 2026**: `health/pee-logs`, `health/weight-logs`, `health/vomit-logs`, `pets/[id]`, `user-profile`, `vet-appointments`, `pet-medical-profiles`.

### Auth.js origin gotcha (dev: AUTH_URL vs the device)

The Auth.js origin is derived from the **request host** via `trustHost: true` in `__create/index.ts`. For local/device dev, **`AUTH_URL` must NOT be set** in `web/.env`.

- Re-adding `AUTH_URL=http://localhost:4000` makes `@hono/auth-js` rewrite every request's origin to `localhost`, so the post-login redirect points at `http://localhost:4000/...` — on a phone that's the device itself, so the auth WebView fails with iOS **-1004 "Could not connect to the server"** and sign-in/sign-up break. Leave `AUTH_URL` unset; the redirect then follows the host the client actually used (LAN IP on device, `localhost` in a browser).
- **`basePath: '/api/auth'` stays pinned** in `__create/index.ts`. Without `AUTH_URL`, `@auth/core` would otherwise default `basePath` to `/auth` and break all auth routing.
- **`__create/@auth/create.js:10` `secureCookie` tolerates an unset `AUTH_URL`** — it reads `process.env.AUTH_URL?.startsWith('https') ?? false`. With `AUTH_URL` unset (the Option B dev state above), the old `process.env.AUTH_URL.startsWith(...)` threw `TypeError: undefined is not an object` *inside* `auth()`, before the session guard — so **every** app API route that calls `auth()` returned 500 (e.g. `GET /api/pets`), even unauthenticated. Do **not** "fix" a future cookie issue by re-adding `AUTH_URL=localhost`: that reopens the device -1004 redirect bug above. In dev (http) `secureCookie` is correctly `false`; in prod the https `AUTH_URL` makes it `true`.
- **Production:** a fixed `AUTH_URL` on the real domain is expected (and re-enables `trustHost` automatically).
- **`scripts/dev-backend.sh` self-heals this (Jun 2026):** on startup it comments out any active `AUTH_URL=` line in `web/.env` (and prints `🧹 Commented out active AUTH_URL ...`). A stale `AUTH_URL` left over after a DHCP IP change was making post-login redirect to an unreachable host → **"site can't be reached"** on web (same root cause as the device -1004). Do not re-add `AUTH_URL` for local/device dev.

### Lazy `user_profiles` creation (`ensureUserProfile`) — business owners with no pet

`user_profiles` rows are created **lazily**, not at signup (`src/auth.js` is a locked managed file, so `createUser` can't be hooked). Historically only the pet flow (`pets/route.js`) created the profile, so a **business owner who signs up and goes straight to creating a provider had no profile** → `resolveUserId` returned `null` → `POST /api/providers` 404'd `"User profile not found"`.

- Shared helper `ensureUserProfile(authUserId, { fullName, email })` in `api/utils/currentUser.js`: returns the existing `user_profiles.id`, else inserts one (collision-safe `uniqueUsername`, same default role as pets) and returns the new id. **Critical RLS ordering (the #108 lesson):** it calls `setCurrentUserId(newId)` immediately after the insert, BEFORE any dependent insert, so a same-request `providers`/`provider_staff` INSERT passes the FORCE-RLS `WITH CHECK (... = current_app_user_id())`. `resolveUserId` stays read-only.
- `POST /api/providers` uses it. `pets/route.js` still has its own inline copy — migrating it onto the shared helper is a flagged follow-up.

### RLS `WITH CHECK` can't see a sibling INSERT in the same CTE (`provider_capabilities`)

`POST /api/providers` originally created `providers` + owner `provider_staff` + `provider_capabilities` in **one atomic CTE**. `provider_capabilities`' write policy (`0027`) requires `app_is_provider_admin(provider_id)` — i.e. an **existing** active owner/admin row in `provider_staff`. Inside a single statement, the owner-staff row inserted by the sibling `new_staff` CTE **is not visible** to the `new_caps` `WITH CHECK` (CTEs share one snapshot) → `"new row violates row-level security policy for table provider_capabilities"`.

- Fix: **split the `provider_capabilities` INSERT into a separate statement** after the provider+staff insert, **in the same request transaction** (`withRequestContext`). Under READ COMMITTED the later statement sees the owner-staff row → `app_is_provider_admin` passes. Still atomic (one txn; a failure rolls back the whole create).
- `provider_staff`'s OWN insert works inside the CTE only because its policy uses a snapshot-safe **membership-absence** bootstrap (`not app_provider_has_active_staff(...)`), not membership-presence.
- **General lesson:** a combined multi-INSERT CTE cannot satisfy an RLS check that depends on a *sibling* INSERT — split such writes into ordered statements within one transaction. Covered by `provider-create-rls.integration.test.ts` (runs the real route as `pawpi_app`).

---

## Previously-flagged uncertainties: RESOLVED

| # | Earlier guess | Reality in the dump | Action taken |
|---|---|---|---|
| 1 | `auth_users.id` (+ FKs) is `uuid` | **`integer`** (serial sequence; `auth_users.id`, `user_profiles.auth_user_id`, all `"userId"` FKs are integer) | All keys/FKs changed to `integer`. **Biggest correction.** |
| 2 | `routines.times`/`days` are `jsonb` | **`times text[]`, `days integer[]`**; also **`preferred_day integer`** (guessed text) | Types corrected to arrays + integer. |
| 3 | `routines` config = 7 jsonb columns | Real has **`medical_care_schedule` AND `medical_care_details`** (both jsonb) + `wellness_check_schedule` + `vet_appointment_schedule` | Added the missing `medical_care_schedule` column; column set now matches. |
| 4 | `pet_lab_results.results` maybe jsonb | **`text`** | Kept `text`. |
| 5 | `health_food_logs.amount`/`water_intake`, `pee.frequency`, `walk.pace` maybe numeric | All **`text`** | Kept `text`. |
| 6 | `vet_appointments.appointment_time` maybe text | **`time without time zone`** | Confirmed `time`. |
| 7 | `health_mobility_logs` likely missing columns | Confirmed: real adds **`difficulty_stairs_or_jumping`, `pain_signs`** (boolean) | Added both. |
| 8 | `pet_friendships` mostly inferred | Confirmed columns + **`status` CHECK (`pending`/`accepted`/`blocked`)**, all 4 FKs cascade, 6 indexes | Reproduced exactly. |
| 9 | numeric precision unknown | **`weight numeric(5,2)`, `distance numeric(10,2)`, `average_speed numeric(5,2)`** | Applied. |
| 10 | dates maybe timestamptz | All `*_date` columns and `post_date` are **`date`** (`post_date` defaults `CURRENT_DATE`) | Confirmed `date`. |

---

## What changed from the reconstructed migrations (corrections)

Beyond the resolved flags above, replacing guesses with the real dump changed:

- **Key type:** `bigint generated always as identity` → **`integer generated by default as identity`** everywhere (the dump used `integer` serial sequences; `by default as identity` is the idempotent equivalent and, like the original `nextval` default, still permits explicit-id inserts).
- **Auth uniqueness removed:** the reconstruction invented `UNIQUE` on `auth_users.email`, `auth_sessions."sessionToken"`, and `auth_accounts(provider,"providerAccountId")`, and made `email NOT NULL`. **The real schema has none of these** — auth tables have only their primary keys, and `email` is nullable. Corrected.
- **No `pgcrypto` / `gen_random_uuid()`** — not needed now that keys are integer; the extension line was removed.
- **`pets`:** removed the invented `species`/`weight_unit` defaults (real schema has none); `weight` is `numeric(5,2)`.
- **`user_profiles`:** `varchar(255/100/50)` widths (not `text`), plus the real **`valid_role` CHECK** (`pet_owner`/`vet`/`business`/`shelter`/`admin`).
- **`pet_medical_profiles`:** real uses a plain **`UNIQUE(pet_id)`** constraint, not the partial-index-over-live-rows I had guessed.
- **`social_walk_join_requests`:** uniqueness is a **partial unique index `WHERE status='pending'`** (named `idx_social_walk_join_requests_unique_pending`), not a full unique constraint.
- **`social_walks`:** added `visibility` default `'private'` and the real **status/visibility CHECK** constraints.
- **`vet_appointments`:** `status` CHECK includes **`missed`**; `created_at`/`updated_at` are nullable-with-default in the real schema (not `NOT NULL`).
- **`health_photo_checks`:** added `included_in_vet_summary` + the **body_area CHECK**.
- **`health_timeline_events`:** `related_record_id` is **`integer NOT NULL`** (not nullable bigint) + the **event_type CHECK**; no `updated_at`.
- **`health_medical_care_logs`:** `medical_care_item_id` is **`text`** (not bigint), and this table's `pet_id`/`owner_user_id`/`routine_id` FKs are **plain references with no ON DELETE action** — unlike every other health log, which cascades.
- **`health_wellness_logs`:** added the **check_type CHECK**; `routine_id` FK is `ON DELETE SET NULL`.
- **Indexes:** added the full real index set, including a handful of **redundant duplicate indexes** present in the live DB (e.g. `idx_pets_owner` + `idx_pets_owner_user_id`, `idx_posts_pet` + `idx_posts_pet_id`, the doubled `post_paws`/`post_barks`/`user_profiles` indexes). Kept verbatim for fidelity — see note below.

---

## Notes / minor fidelity caveats

- **`integer` vs `serial`:** the dump defines ids as `integer` columns backed by explicit `CREATE SEQUENCE ... nextval` defaults (classic serial). The migrations use `integer generated by default as identity`, which produces the same integer auto-increment behavior and is Supabase's recommended form. The column **data type is identical (`integer`)**; only the auto-increment implementation differs. If you need byte-for-byte serial parity, swap the identity clause for explicit sequences.
- **`timestamptz`** is written in the migrations as the canonical alias of the dump's `timestamp with time zone` — same type.
- **Redundant duplicate indexes** were reproduced because they exist in the real DB. They are harmless but you may wish to drop one of each pair (`idx_pets_owner`, `idx_posts_pet`, `idx_posts_user`, `idx_post_paws_post`/`_user`, `idx_post_barks_post`/`_user`, `idx_user_profiles_auth_user`) in a later cleanup migration.
- **`medical_care_item_id` (text)** has no FK in the real schema; there is no `medical_care_items` table in the dump.

## Next step

RLS can now be designed against these confirmed column names — every owned table filters by `owner_user_id` = the caller's `user_profiles.id` (resolved from `auth_user_id`). Deliberately not included here.
