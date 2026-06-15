# PawPi Provider/Business Side — Design Spec

Status: **design locked, pre-implementation**. Kickoff 2026-06-14.
This is the provider-facing mirror of the consumer vet/health features. It is the canonical
reference for every provider-side Claude Code ticket — link it from each prompt.

---

## 0. Context that constrains everything

- **Stack:** Next.js (web, `anything/apps/web`) + Expo/React Native (mobile). DB client is
  `postgres` (porsager) via `src/app/api/utils/sql.js`. Auth.js with a custom adapter.
- **Identity chain:** `auth_users` → `user_profiles` (1:1 via `auth_user_id`). Everything
  app-side keys on `user_profiles.id`, called `owner_user_id` on pet-owned rows.
  NOTE: `owner_user_id` is `user_profiles.id`, **not** `auth_users.id`.
- **Isolation is pure app-layer.** Every route resolves the caller's `user_profiles.id` and
  scopes queries `WHERE owner_user_id = <that id>`. There is **no RLS** today.
- **Conventions:** integer PKs (`generated as identity`), snake_case, `created_at`/`updated_at`
  timestamptz default now(), `deleted_at` soft-delete where appropriate.

---

## 1. Locked decisions

| # | Fork | Decision |
|---|------|----------|
| 1 | Account model | **Entity owned by an existing account.** No second login. `providers` table + `provider_staff` link to existing `user_profiles`. "Provider mode" is UX. |
| 2 | Consent grant | Per **(pet ↔ provider)**, scoped/revocable/audited. Staff inherit via `provider_staff`. |
| 3 | Enforcement | **`assertCareAccess` is the only path** to provider→pet-data. App-layer chokepoint + audit now. |
| 4 | RLS | **Deferred to a pre-launch hardening phase** (see §5). NOT app-layer forever; NOT on the current privileged connection. |
| 5 | First type | **Vet**, end-to-end. |
| 6 | Booking record | **Extend `vet_appointments`** for the Vet MVP; generalize to `provider_bookings` later. |

`user_profiles.role` (`pet_owner|vet|business|shelter|admin`) stays a coarse hint only —
real capability comes from `provider_staff`.

---

## 2. Data model

### Shared spine (new)

```
providers
  id, owner_user_profile_id FK user_profiles, provider_type, name, slug UNIQUE,
  bio, logo_url, status(draft|published) default draft, created_at, updated_at

provider_locations
  id, provider_id FK providers, name, address, lat, lng, hours_json jsonb, phone,
  created_at, updated_at

provider_staff
  id, provider_id FK providers, user_profile_id FK user_profiles,
  role(owner|admin|staff|vet), status(invited|active|removed),
  created_at, updated_at, UNIQUE(provider_id, user_profile_id)

provider_services
  id, provider_id FK providers, name, description, duration_min, price_cents,
  deposit_cents, active bool default true, created_at, updated_at

provider_reviews
  id, provider_id FK providers, owner_user_id FK user_profiles, pet_id FK pets,
  rating int CHECK 1..5, body text, created_at

provider_payment_accounts            -- Stripe Connect, later phase
  id, provider_id FK providers, stripe_account_id, status, created_at, updated_at
```

### Consent (the cornerstone)

```
care_access_grants
  id
  pet_id          FK pets
  owner_user_id   FK user_profiles      -- granting authority (the revoker)
  provider_id     FK providers
  scopes          text[]                -- enumerated, see below
  status          pending|active|revoked|expired   default pending
  requested_by    owner|provider
  booking_id      FK (nullable)         -- the care relationship justifying the grant
  granted_at, expires_at, revoked_at timestamptz
  created_at, updated_at
  -- index on (provider_id, pet_id, status); (owner_user_id, status)

care_access_audit                       -- append-only
  id, grant_id FK care_access_grants, staff_user_id FK user_profiles,
  action(read|write), resource text     -- e.g. 'vet_notes:123'
  at timestamptz default now()
```

**Scopes (enumerated):** `medical_read`, `medical_write`, `vaccinations_write`,
`appointments`, `health_logs_read`, `health_logs_write`, `messaging`.
Vet requests `[medical_read, medical_write, vaccinations_write, appointments]`.
Groomer requests `[health_logs_write, appointments]`.

**Lifecycle:** provider books → requests grant (`pending`) → owner approves (`active`) →
access flows → owner `revoke` anytime (instant) → `expires_at` auto-expires (long for vets,
short/one-shot for groomers).

### Vet-type reuse

```
-- Extend existing vet_appointments (booking record for vet MVP):
ALTER vet_appointments ADD
  provider_id FK providers (nullable),
  provider_location_id FK provider_locations (nullable),
  service_id FK provider_services (nullable),
  staff_user_id FK user_profiles (nullable),
  booking_status text,            -- requested|confirmed|declined|... (distinct from status)
  source text default 'owner'     -- owner|provider

-- NEW table (gap: no vaccination table exists today):
pet_vaccinations
  id, pet_id FK pets, owner_user_id FK user_profiles,
  name, date_given date, expires_on date, lot,
  administered_by_provider_id FK providers (nullable),
  created_at, updated_at, deleted_at
```

`vet_notes`, `vet_documents`, `pet_medical_profiles`, `pet_lab_results` are reused as-is for
vet write-back — all access gated by `assertCareAccess`.

---

## 3. Enforcement contract — `assertCareAccess`

Single mandatory helper (web `src/app/api/utils/`). **No provider route reads or writes pet
data except through it.**

```
assertCareAccess(petId, providerId, requiredScope) -> { grant }  | throws 403
  1. caller is active staff of providerId  (provider_staff: status='active')
  2. an active, unexpired care_access_grants row exists for (petId, providerId)
     whose scopes include requiredScope
  3. write a care_access_audit row (grant_id, staff_user_id, action, resource)
```

Owner-context routes keep the existing `WHERE owner_user_id = me` pattern unchanged.
Requires exhaustive tests: no membership → 403; expired/revoked grant → 403; missing scope →
403; happy path → audit row written; cross-provider grant does not leak.

---

## 4. MVP loop → ticket sequence

Each ≈ one Claude Code prompt. Build the shared spine *through* Vet.

1. **`0014_providers`** — providers, provider_staff, provider_locations, provider_services + indexes.
2. **`0015_care_access`** — care_access_grants, care_access_audit, `assertCareAccess` helper + tests.
3. **`0016_vaccinations_and_booking`** — pet_vaccinations; extend vet_appointments.
4. **Provider onboarding + profile** (web) — create provider, publish, staff invite.
5. **Discovery** — surface published providers in Pet Services / Veterinary.
6. **Booking** — owner books → provider confirms (writes vet_appointments).
7. **Grant flow** — provider requests scoped access; owner approves/revokes (the trust UI).
8. **Clinical read/write** — provider views shared record + writes vet_note + vaccination, all via `assertCareAccess`.

Then layer: payments (Stripe Connect), 2-way calendar sync, reviews surfacing, telehealth.

---

## 5. RLS hardening (deferred, pre-launch — do NOT skip before real medical data)

> Implementation progress and per-phase notes live in [`rls-hardening.md`](./rls-hardening.md)
> (R0 harness done; R1 per-request identity done; R2 policies + role; R3 cutover).

App-layer chokepoint is the MVP boundary, **not the permanent one**. Before real users:

1. Move the app off its privileged DB connection to a **dedicated non-owner role**.
2. Set per-request identity via **`SET LOCAL`** (the caller's `user_profiles.id` + provider context).
3. `ENABLE` + `FORCE ROW LEVEL SECURITY` on **all** pet-data tables; write policies that allow
   a row when `owner_user_id = current identity` **OR** an active grant covers it.
4. Prove it: a test that connects **AS the app role** and shows a cross-boundary `SELECT`
   returns **zero rows**.

**Do NOT add RLS policies on the current privileged/owner connection** — they won't enforce and
would give false confidence. RLS is meaningless until step 1 is done.

---

## 6. Other provider types (post-Vet, same spine)

- **Walker** — GPS walk tracking + walk report → `health_walk_logs`; recurring/pack walks (ties into `routines`/`social_walks`); check-in/out.
- **Daycare/Boarding** — check-in/out, capacity/occupancy, daily report cards; **vaccine-requirement verification reads `pet_vaccinations`**; owner feeding/med instructions.
- **Shop** — catalog/inventory, prescription products, orders + subscriptions/auto-reorder, loyalty.
- **Groomer** — service menu, before/after photos → pet profile, coat/skin notes → `health_logs`, recurring grooming cycles.
