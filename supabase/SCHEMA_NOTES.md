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
`video_url` / `video_thumbnail_url`; schema only, no RLS/policy change)**. As of the original five-arc
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

Still deferred: **no RLS, no seed data, no app-code changes.**

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
