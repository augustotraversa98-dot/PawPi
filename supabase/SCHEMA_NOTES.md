# Schema Notes — reconstructed PawPi database

This schema was **reverse-engineered from the API route SQL** under `anything/apps/web/src/app/api/**` and the Auth.js adapter in `anything/apps/web/src/auth.js`. There were **no migration/DDL files** in the repo, so every type, constraint, and default below is *inferred from how columns are read and written in code*, not from an authoritative schema. Treat it as a high-confidence blueprint to recreate the structure in Supabase, then verify the flagged items against the real database (if one is still reachable) before relying on it.

Migration order (parents → children): `0001_auth` → `0002_user_profiles` → `0003_pets` → `0004_social` → `0005_vet_records` → `0006_routines` → `0007_social_walks` → `0008_health_logs`. All statements use `IF NOT EXISTS` so the set is safely re-runnable.

Per the task: **no RLS, no seed data, no app-code changes.** RLS in particular should be added before this is exposed to clients.

---

## Global decisions (apply everywhere)

1. **Key types — biggest single assumption.**
   - **App tables use `bigint generated always as identity`** for `id` and `bigint` for all FK columns. Evidence: the code parses ids with `parseInt(...)` (e.g. `parseInt(petId)`), so ids are integers, not UUIDs.
   - **Auth tables use `uuid` for `id`** (`auth_users.id`, and the `"userId"` FKs). The adapter never inserts these ids (always DB-generated + `RETURNING`), so the underlying type is **not proven**. `uuid default gen_random_uuid()` is the Auth.js convention and the safest default, but it could be `text` or a serial. **Verify.**
   - Consequently `user_profiles.auth_user_id` is typed `uuid` to match `auth_users.id`. If `auth_users.id` is actually text/serial, change both.

2. **`created_at` / `updated_at`.** Added as `timestamptz not null default now()` on essentially every table. Some are directly referenced in code (`ORDER BY created_at`, `SET updated_at = NOW()`); others are **conventional additions not seen in code** — notably `created_at` on `user_profiles`, `post_paws`, `pet_friendships`, and on several health logs. Harmless if extra, but confirm they match reality.

3. **Foreign-key delete behavior is an inference.** The app does its own manual cascade/soft-delete logic; no DB-level FK actions were observed. I chose:
   - `ON DELETE CASCADE` for ownership edges (everything → `pets` / `user_profiles`, posts → paws/barks, etc.).
   - `ON DELETE SET NULL` for optional links (`vet_notes.appointment_id`, `routines` link on `social_walks.routine_id`, `routine_id` on the two health logs).
   Adjust if you prefer `RESTRICT`/no-action.

4. **UNIQUE constraints are app-enforced, not DDL-proven.** See per-item flags below.

---

## Things I had to guess (type-level)

| Table.column | Chosen type | Why / alternative |
|---|---|---|
| `auth_users.id` (+ FKs) | `uuid` | Auth.js convention; **never inserted in code** so unproven. Could be `text`/serial. |
| `auth_accounts.expires_at` | `bigint` | Auth.js stores OAuth expiry as Unix epoch **seconds**, not a timestamp. |
| `pets.weight`, health `weight`/`distance`/`average_speed` | `numeric` (no precision) | Precision/scale unknown. Consider `numeric(6,2)` etc. after checking real data. |
| `pets.birthday`, `pets.adoption_date`, `posts.post_date`, all vet `*_date` | `date` | Handled as date-only strings (`toISOString().split('T')[0]`); could be `timestamptz`. |
| `vet_appointments.appointment_time` | `time` | Stored in a **separate** column from `appointment_date`; could be `text`. |
| `routines.times`, `routines.days` | `jsonb` | **Passed RAW (not `JSON.stringify`d)** unlike the 7 sibling config columns — so these may actually be **`text[]`** (the Postgres driver serializes JS arrays to array literals). High-priority verify. |
| `pet_lab_results.results` | `text` | Stored raw with no `JSON.stringify`; could be `jsonb` if the client sends structured data. |
| `health_food_logs.amount` / `.water_intake` | `text` | Passed raw, no `parseFloat`; likely free-form ("1 cup"), could be numeric. |
| `health_pee_logs.frequency` | `text` | Passed raw; could be an integer count or a descriptor. |
| `health_walk_logs.pace` (and `social_walks.pace`) | `text` | Could be numeric in walk logs; modeled as text to be safe. |
| Many enum-like fields (`care_type`, `status`, `body_area`, `visibility`, `appetite`, `mood`, `severity`, …) | `text` | Value sets are validated in **app code**, not via Postgres `enum`/`CHECK`. Kept as `text`; add `CHECK`s later if desired. |

---

## Tables / structures that were ambiguous

- **`health_mobility_logs` — PARTIAL.** There is **no writer route** for this table; it's only read by the timeline aggregator (`health/timeline/route.js`). Only `id, pet_id, owner_user_id, limping, stiffness, difficulty_standing, notes, logged_at` are referenced. **Other columns very likely exist** (e.g. severity, energy, photo_url) but cannot be reconstructed from code. The three booleans are inferred from truthy usage.

- **`pet_friendships` — mostly inferred.** Only *read* in `social-walks/route.js` (never inserted/updated in the inspected routes). Referenced columns: `requester_pet_id`, `receiver_pet_id`, `requester_user_id`, `receiver_user_id`, `status` (observed value `'accepted'`). The `id` PK and `created_at` are conventional additions; the full column set and any unique constraint (e.g. one friendship per pet pair) are unknown.

- **`health_timeline_events` — polymorphic + single writer.** `related_record_id` points to the source log's id, resolved by `event_type`; it is intentionally **not** a FK. Today only the walk-log POST writes it (`event_type='walk'`). The timeline GET does **not** read this table (it aggregates the individual log tables in memory), so the table may be incompletely populated and its intended full event vocabulary is unknown.

- **`medical_care_item_id` (in `health_medical_care_logs`)** and the **`routine_id`** columns reference tables/values outside the inspected scope. `routine_id` → `routines.id` (FK added). `medical_care_item_id` would reference a `medical_care_items` table **that does not exist in this codebase** — left as a plain `bigint` with no FK. Confirm whether that table exists elsewhere.

- **Soft-delete is inconsistent by design.** Only `vet_appointments` and `pet_medical_profiles` have `deleted_at`; `routines` has `deleted_at` + `is_active`. All other vet-record tables and all health logs are **hard-deleted / append-only**. This asymmetry is faithful to the code, not a mistake.

- **Timestamp column naming is inconsistent across health logs** (`logged_at` vs `start_time` vs `created_at` vs `given_at` vs `event_time`). Preserved as-is so existing queries keep working; flagged in case you want to normalize during the migration.

---

## UNIQUE / constraint inferences to verify

| Constraint (as written) | Basis | Confidence |
|---|---|---|
| `user_profiles.auth_user_id UNIQUE` | `WHERE auth_user_id = ... LIMIT 1` treated as unique lookup | High |
| `user_profiles.username UNIQUE` | App dedupes generated usernames | Medium |
| `pets.handle UNIQUE` | App checks handle uniqueness before insert/update | High |
| `post_paws (post_id, user_id) UNIQUE` | App checks "already pawed" before insert | High |
| `posts (pet_id, post_date) WHERE is_daily_update` partial unique | App enforces one daily update per pet per day | Medium |
| `pet_medical_profiles (pet_id) WHERE deleted_at IS NULL` partial unique | App upserts one live profile per pet | Medium |
| `social_walk_join_requests (social_walk_id, requester_user_id, requester_pet_id) UNIQUE` | App catches `duplicate key value` error to block repeat requests | High |
| `auth_accounts (provider, "providerAccountId") UNIQUE` | Auth.js standard + used as a unique selector | High |
| `auth_sessions."sessionToken" UNIQUE`, `auth_users.email UNIQUE` | Auth.js standard + unique lookups | High |

---

## Recommended verification steps before trusting this

1. **Confirm `auth_users.id` type** (uuid vs text vs serial) against the live DB or the Anything platform's auth schema — this cascades to `user_profiles.auth_user_id` and both `"userId"` FKs.
2. **Dump the real DDL if the Neon/Anything database is still reachable** (`pg_dump --schema-only`) and diff it against these files — that resolves every flag above at once.
3. **Resolve `routines.times` / `routines.days`** (jsonb vs text[]) by inspecting an existing row, since it affects how the app must send data.
4. **Recover `health_mobility_logs` and `pet_friendships` full columns** — both are reconstructed from read-only references and are the most likely to be missing columns.
5. **Decide on numeric precision, `date` vs `timestamptz`, and `time` vs `text`** for the flagged columns; tighten with `CHECK`/`enum` where you want DB-level enforcement.
6. **Add Row Level Security** (every owned table filters by `owner_user_id` = the caller's `user_profiles.id`) before exposing the DB to clients — deliberately omitted here.
