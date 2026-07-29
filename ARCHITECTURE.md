# Social Pet / PawPi — Architecture Inventory

> Read-only inventory of the codebase as exported from "Anything." Describes **what exists** as of this commit. No changes proposed. All paths are relative to the repo root unless noted; line numbers reference the current files.

> **Standing convention:** `docs/*.md` specs and `PawPi_instructions.md` are version-controlled — when you edit one, commit it in the same change so the remote stays current.

---

## 1. Repo Layout

### Top level
```
.claude/
.git/
.gitignore
ARCHITECTURE.md   (this file)
anything/
└── apps/
    ├── *.md          (~28 implementation/summary/visual-guide docs)
    ├── mobile/       (Expo / React Native app)
    └── web/          (React Router v7 + Vite web app — also the API backend)
```

- **There is no `packages/` directory** anywhere in the tree, and **no root `package.json`**.
- **Not a true monorepo.** There is no workspace tooling (no `workspaces` field, no turbo/nx/lerna/pnpm-workspace). `mobile` and `web` are two independent, self-contained projects that happen to be colocated under `anything/apps/`. Each is `"private": true`, each has its own lockfile and its own `overrides`.
- **Different package managers per app:** mobile uses **npm** (`package-lock.json`); web uses **bun** (`bun.lock`).

### Which folder is what
| Folder | Role | Evidence |
|---|---|---|
| `anything/apps/mobile` | **Mobile (Expo) app** | `package.json` name `"mobile"`; depends on `expo`, `expo-router`, `react-native` |
| `anything/apps/web` | **Web app + REST/SQL backend** | `package.json` name `"web"`; React Router v7 + Vite; serves `/api/*` routes against Postgres |
| (none) | Shared packages | None exist |

### Mobile app — key versions & dependencies (`anything/apps/mobile/package.json`)
- **Expo SDK:** `54.0.34` · **React Native:** `0.81.5` · **React:** `19.1.0`
- **Navigation:** `expo-router ~6.0.23` (file-based) + `@react-navigation/native ^7.1.8`, `@react-navigation/bottom-tabs ^7.4.0` (underlying)
- **State management:** `zustand 5.0.3` (routines/reminders/social) + `@tanstack/react-query 5.72.2` (pet/server data)
- **Networking:** no axios — a patched `fetch` wrapper; uploads via `@uploadcare/upload-client 6.14.3`; `@react-native-community/netinfo ^11.4.1`
- **Storage:** `@react-native-async-storage/async-storage 2.2.0`, `expo-secure-store ~15.0.8`, `expo-file-system 19.0.22`
- **UI/styling:** tailwind 3 + `@tailwindcss/postcss`, `@gorhom/bottom-sheet 5.2.6`, `react-native-reanimated 4.1.1`, `moti 0.30.0`, `lucide-react-native`, `@shopify/react-native-skia`, `sonner-native`
- **Notifications:** `expo-notifications ~0.32.17`
- **Monetization:** `react-native-purchases ^9.6.0`
- **Auth:** no dedicated auth library — WebView-based (see §3); tokens kept in `expo-secure-store`

### Web app — key versions & dependencies (`anything/apps/web/package.json`)
- **Framework:** React Router v7 (framework mode) on **Vite 6**; server via Hono (`react-router-hono-server`)
- **React:** `^18.2.0` (note: web is React 18, mobile is React 19)
- **DB client:** `@neondatabase/serverless ^0.10.4` (Neon serverless Postgres)
- **Auth:** `@auth/core` + `@hono/auth-js`; password hashing via `argon2`; internal `@auth/create` adapter
- **Payments:** `stripe ^18.2.1`
- **State/data:** `@tanstack/react-query`, `@tanstack/react-table`, `zustand`
- **UI:** Chakra UI 2.8.2 + Emotion, tailwind 3, `lucide-react`

---

## Testing

Each app carries its own test runner and suite (no root/workspace runner). Run from each app dir; `npm test` works regardless of which package manager installed deps (use `npm`, not `bun test`, for web — `bun test` bypasses Vitest).

| App | Runner | Convention | Run |
|---|---|---|---|
| `anything/apps/mobile` | jest-expo (`preset: jest-expo`) | colocated `*.test.{js,jsx,ts,tsx}` next to source (`testMatch` pinned in `package.json`) | `npm test` · `npm run test:watch` |
| `anything/apps/web` | Vitest (jsdom, `vitest.config.ts`) | colocated `*.{test,spec}.{js,ts,jsx,tsx}` under `src/` | `npm test` · `npm run test:watch` |
| `anything/apps/web` (integration) | Vitest (node, `vitest.integration.config.ts`) | `test/integration/**/*.integration.test.ts` against a **real throwaway Postgres** | `npm run test:integration` |

Current suites:
- **mobile** — `src/utils/auth/determinePetsRoute.test.js` (the EntryPoint 401-vs-network gate, PR #20), plus two `__create/` logger tests.
- **web (unit, mocked)** — `src/smoke.test.ts` (wiring proof) and `src/app/api/utils/jsonb.test.js`, the first data-shape regression: it pins the jsonb write/read boundary (PR #19) — values are encoded once not double-encoded, reads return parsed objects/arrays not string scalars, and masked `medical_care_details.medicalCareItems` resolves to `[]`. The rule it guards lives in `src/app/api/utils/jsonb.js`. This mocked suite is the fast PR gate.
- **web (integration, real Postgres)** — `test/integration/*.integration.test.ts` run against a fresh throwaway Postgres (the **RLS R0 harness** / TESTING_AND_CI_PLAN Phase C). `globalSetup.ts` boots an [`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres) cluster (a real Postgres binary run as a child process — **no Docker required**), applies every `supabase/migrations/*.sql` in order, and publishes the connection string via Vitest `provide()`/`inject()`. Tests get a real `sql` (porsager) over it; `resetDb()` truncates between tests. Today it proves (a) the identity-chain + owner-scoping round-trip and (b) the jsonb write→read round-trip (the airtight double-encode catch). This is the prerequisite for the deferred RLS hardening (R1 identity plumbing → R2 policies/role → R3 cutover); it does **not** add RLS or touch app code / `sql.js` / the schema. The throwaway DB is never Supabase.

**CI:** `.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. Fast jobs (PR #25), both required to merge: **mobile (jest)** installs with `npm ci` and runs `npm test`; **web (vitest)** installs with `bun install --frozen-lockfile` then runs `npm test` (via npm, not `bun test`, so Vitest isn't bypassed). A SEPARATE, slightly slower **web (integration / real Postgres)** job runs `npm run test:integration` against an `embedded-postgres` cluster (no Docker; the `@embedded-postgres/*` binary is hydrated via `trustedDependencies`) — kept apart so the fast jobs still gate PRs quickly.

---

## 2. Backend & Data Layer

### What backend is this?
The **"Anything" / create.xyz platform backend**, backed by **Neon serverless Postgres**. **It is NOT Supabase** — a case-insensitive search for `supabase` across the whole tree returns zero matches.

### Request flow
```
Mobile app  ──fetch("/api/...")──►  web app /api/* routes  ──SQL──►  Neon Postgres
```
- Mobile does **not** touch the DB directly. Its patched `fetch` rewrites relative `/api/...` paths to an absolute URL using `EXPO_PUBLIC_BASE_URL` (the web host), attaches platform headers, and adds a Bearer JWT from SecureStore.
  - `anything/apps/mobile/src/__create/fetch.ts:24-29, 37, 56-58` (base-URL rewrite), `:66-71` (platform headers), `:79-89` (JWT from SecureStore; key = `${EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`, built at `:5`).
- The web app runs SQL against Neon.
  - DB client: `anything/apps/web/src/app/api/utils/sql.js:1` (`import { neon } ...`), `:13` (`neon(process.env.DATABASE_URL)`).
  - Auth DB pool: `anything/apps/web/src/auth.js:9` (`Pool` from neon), `:254` (`connectionString: process.env.DATABASE_URL`).
  - Uploads: `anything/apps/web/src/app/api/utils/upload.js:6` → `https://api.anything.com/v0/upload`.
- Note: `anything/apps/web/src/app/api/utils/create.js:6-13` references an `/api/db/:database` endpoint that **does not exist** in this tree (likely a platform-provided route).

### Database tables referenced in code (32 total)
Resolved from SQL in `anything/apps/web/src/app/api/**` (28 app tables) and `anything/apps/web/src/auth.js` (4 auth tables). One example reference each:

**Auth (in `web/src/auth.js`):** `auth_users` (`:39`), `auth_accounts` (`:117`), `auth_sessions` (`:171`), `auth_verification_token` (`:19`).

**Social/profile:** `posts` (`posts/route.js:29`), `post_paws` (`posts/[id]/paw/route.js:53`), `post_barks` (`posts/[id]/barks/route.js:72`), `user_profiles` (`posts/route.js:30`), `pets` (`pets/route.js:258`), `pet_friendships` (`social-walks/route.js:111`).

**Vet record:** `pet_medical_profiles` (`pet-medical-profiles/route.js:79`), `pet_allergies` (`vet-record/allergies/route.js:32`), `pet_conditions` (`.../conditions/route.js:32`), `pet_lab_results` (`.../lab-results/route.js:32`), `pet_surgeries` (`.../surgeries/route.js:32`), `vet_notes` (`.../notes/route.js:32`), `vet_documents` (`.../documents/route.js:32`), `vet_appointments` (`vet-appointments/route.js:54`).

**Routines & walks:** `routines` (`routines/route.js:45`), `social_walks` (`social-walks/route.js:62`), `social_walk_join_requests` (`social-walks/[id]/join-request/route.js:96`).

**Health logs:** `health_weight_logs`, `health_food_logs`, `health_poo_logs`, `health_pee_logs`, `health_vomit_logs`, `health_walk_logs`, `health_general_checks`, `health_photo_checks`, `health_medical_care_logs`, `health_wellness_logs` (each `INSERT` in its `health/*-logs/route.js`); `health_mobility_logs` (read-only in `health/timeline/route.js:229`); `health_timeline_events` (`health/walk-logs/route.js:107`).

> No SQL migration/DDL files were found in the repo — table names are inferred from queries only.

### Environment variables

**Mobile (`anything/apps/mobile/.env`) — present:** `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_BASE_CREATE_USER_CONTENT_URL`, `EXPO_PUBLIC_BASE_URL`, `EXPO_PUBLIC_CREATE_ENV`, `EXPO_PUBLIC_CREATE_TEMP_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (empty), `EXPO_PUBLIC_HOST`, `EXPO_PUBLIC_LOGS_ENDPOINT`, `EXPO_PUBLIC_PROJECT_GROUP_ID`, `EXPO_PUBLIC_UPLOADCARE_PUBLIC_KEY` (empty).

- **Referenced in mobile code but NOT in `.env`:** `EXPO_PUBLIC_PROXY_BASE_URL`, `EXPO_PUBLIC_IS_ANYTHING_APP`, `EXPO_PUBLIC_DEV_SERVER_ID`, `EXPO_PUBLIC_REVENUE_CAT_APP_STORE_API_KEY`, `EXPO_PUBLIC_REVENUE_CAT_PLAY_STORE_API_KEY`, `EXPO_PUBLIC_REVENUE_CAT_TEST_STORE_API_KEY`, `NODE_ENV`.
- **In `.env` but unused in code:** `EXPO_PUBLIC_APP_URL`.

**Web (`anything/apps/web/.env`) — present:** `ANYTHING_PROJECT_TOKEN` (a live JWT; not referenced via `process.env` in source).

- **Referenced in web code but NOT in `.env` (expected to be injected by the platform/runtime):** `DATABASE_URL` (critical — the Neon connection string), `AUTH_SECRET`, `AUTH_URL`, `CORS_ORIGINS`, `NEXT_PUBLIC_CREATE_API_BASE_URL`, `NEXT_PUBLIC_CREATE_BASE_URL`, `NEXT_PUBLIC_CREATE_ENV`, `NEXT_PUBLIC_CREATE_HOST`, `NEXT_PUBLIC_PROJECT_GROUP_ID`, `NODE_ENV`.

---

## 3. Identity / ID Model  ⚠️ (known bug area)

### How auth works
WebView-based login wrapping the web app's Auth.js (credentials provider) with a **JWT session strategy**.
1. Mobile `useAuth().signIn/signUp` opens a modal that renders a WebView at the web app's `/account/{signin|signup}` — `anything/apps/mobile/src/utils/auth/useAuth.js:43-48`, `AuthWebView.jsx:13-14, 71`.
2. On success the web side sets a session cookie; the app exchanges it for a token:
   - Device: `GET /api/auth/token` → `{ jwt, user }` — `AuthWebView.jsx:7, 90-113`.
   - Expo web: iframe `/api/auth/expo-web-success` posts `{ type: "AUTH_SUCCESS", jwt, user }` — `AuthWebView.jsx:40-52`.
3. `setAuth({ jwt, user })` persists to SecureStore under `${EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt` — `store.js:4, 34-50`; re-read on launch in `useAuth.js:19-39`; exposed via `useUser` (`useUser.js:6`).

### The user ID it produces
The auth user id is **`token.sub`**, which equals **`auth_users.id`** (the row the Auth.js adapter creates).
- `web/__create/index.ts:103` — `session.user.id = token.sub;` (source of truth)
- `web/src/app/api/auth/token/route.js:30-34` & `expo-web-success/route.js:41-45` — `user: { id: jwt.sub, email, name }`
- `auth_users` created in `web/src/__create/@auth/create.js:36-49`.

So `session.user.id` (auth id) is **not** the same as `user_profiles.id`.

### The two-level ID model
```
auth_users.id  ( = token.sub = session.user.id )
      │  linked via column user_profiles.auth_user_id
      ▼
user_profiles.id   ◄── this is the "application user id" used as the owner key everywhere
      │
      ▼
pets.owner_user_id  ( = user_profiles.id )
```
Every API route follows the same pattern: take `session.user.id`, look up `SELECT id FROM user_profiles WHERE auth_user_id = <auth id>`, then use `userProfile[0].id` as the owner key for all data.

### Reference inventory (representative)
- **Auth user id (`session.user.id` / `token.sub`):** `web/__create/index.ts:103`; `@auth/create.js:15`; `auth/token/route.js:31`; `pets/route.js:18,129,303`; `pets/[id]/route.js:20,222`; `user-profile/route.js:12,53`; `posts/route.js:120`; and the `if (!session?.user?.id)` guard in essentially every API route.
- **`user_profiles` / `user_profiles.id`:** lookups `WHERE auth_user_id = ...` in `pets/route.js:26,137,311`, `pets/[id]/route.js:29,229`, `user-profile/route.js:17,60`, `posts/route.js:59,126`, and every health/vet/routines/social-walks route; inserts `(auth_user_id, ...)` in `pets/route.js:160,334` and `user-profile/route.js:24`; joins `ON ... = up.id` in `posts/route.js:30,261`, `social-walks/route.js:181,213,257`.
- **`pets.owner_user_id`:** INSERT `pets/route.js:259,264` (value `${userId}` = `user_profiles.id`); filter `pets/route.js:57`, `pets/[id]/route.js:49,245`.

### Conclusion: what `owner_user_id` maps to
**In the current code, `pets.owner_user_id` maps to `user_profiles.id` — NOT to the auth user id.** This is consistent across every write and read path, and the same convention applies to the `owner_user_id` column on all dependent tables (health logs, vet records, routines, social walks, vet appointments).

Concrete trace in `pets/route.js`: `authUserId = session.user.id` (`:129`) → `SELECT id ... FROM user_profiles WHERE auth_user_id = ${authUserId}` (`:134-139`) → `userId = userProfile[0].id` (`:170`) → `INSERT INTO pets (owner_user_id, ...) VALUES (${userId}, ...)` (`:257-270`) → reads filter `WHERE owner_user_id = ${userId}` (`:55-59`).

### Flagged inconsistencies
- **Naming footgun:** `owner_user_id` *sounds* like it should hold an auth/user id, but it holds `user_profiles.id`. Behavior is uniform, but the name invites the exact mistake below.
- **Evidence of a historical mismatch + built-in repair tool.** `pets/route.js` contains diagnostics and a `PATCH` "repair" handler (`:289-558`) whose sole purpose is to find pets created with `owner_user_id = auth_user_id` (the *wrong* value) and rewrite them to `user_profiles.id`. See `:80` (`// check if pets exist with auth_user_id instead (wrong mapping)`), `:90`, `:351`, `:366` (`WHERE owner_user_id = ${authUserId}`), `:493` (`SET owner_user_id = ${correctUserId}`). This means an earlier version inserted the auth id into `owner_user_id`; **existing DB rows may still hold either value until repaired.** Code is settled on `user_profiles.id`; the data may not be.
- **Cosmetic variation only:** the owner variable is named `userProfileId` in some routes and `ownerUserId`/`userId` in others, but all derive from `userProfile[0].id`.

---

## 4. Core Stores / Context

Two parallel mechanisms; **no Redux, no pets Context provider:**
- **Zustand** (`anything/apps/mobile/src/store/`) for routines, reminders, and social/notification state — three stores created with `create(...)`: `routinesStore.js:6`, `socialPetStore.js:7`, `remindersStore.js` (documented in `src/store/README.md`).
- **TanStack React Query** for pet/server data, fetched from `/api/pets`.

### "Current pet" — how it's determined
There is **no `selectedPetId` and no persisted pet selection.** The current pet is implicitly **`pets[0]`** — the first item of the React Query result (the server returns pets ordered `created_at DESC`).
- `src/hooks/usePetProfile.js` fetches `useQuery(["pets"], ... fetch("/api/pets"))`; the **single** `useCurrentPet()` (at `usePetProfile.js:126`) returns `pets[0]`.
- There is **one** `useCurrentPet`, exported from `usePetProfile.js`. The earlier standalone `src/hooks/useCurrentPet.js` was removed when the hooks were unified (PR #12) — that file no longer exists. Consumers import it from `@/hooks/usePetProfile` (e.g. `pet-profile.jsx`, `nearby-walks.jsx`, `walk-live.jsx`, plus `useFeedData.js`, `useFetchHealthData.js`).
- `socialPetStore.currentPet` / `setCurrentPet` (`socialPetStore.js:16-17`) exist but **`setCurrentPet` is never called** — dead for pet selection.
- Persistence: pet data is **not** the source of truth in AsyncStorage/SecureStore; it is re-fetched via React Query. AsyncStorage holds only an onboarding/offline fallback (`onboarding.jsx:285`, `index.jsx:41`); SecureStore holds only auth tokens.

### Routines store & how pet_id reaches features
- `routinesStore.js` keeps a **flat `routines: []` array** (`:8`); each routine carries `petId` (`:31`). It is **pet-id-agnostic** — it never reads the current pet itself; the caller passes `petId` into `loadRoutines(petId)` which fetches `/api/routines?petId=...` (`:14-18`) and **replaces** the whole array (`:88`).
- The component layer injects the id. Canonical chain:
  1. `useCurrentPet()` → `pets[0]` (`usePetProfile.js:126`)
  2. `RoutinesTab.jsx:40` reads `const { data: currentPet } = useCurrentPet();`
  3. `RoutinesTab.jsx:57-63` effect calls `loadRoutines(currentPet.id)` when the id changes
  4. `routinesStore.loadRoutines` fetches and populates (`routinesStore.js:14-18, 88`)
- Health trackers follow the identical pattern (e.g. `FeedingCountdownCard.jsx:26,51`, `HealthVetRecord.jsx:54,81,90`).
- `useWalkRoutineState.js` is purely local form state for the walk-routine editor; it does not touch pet_id or the store.

---

## 5. Navigation

### System: Expo Router (file-based)
- `app.json:26-32` registers the `expo-router` plugin; `:62-64` enables typed routes.
- `src/app/_layout.jsx:2` imports `{ Stack }` from `expo-router`; root `<Stack>` at `:87-104` mounts `(tabs)` plus modal screens `notifications`, `search`, `messages` (`presentation: "modal"`).
- No `@react-navigation` `createXNavigator` usage. (React Navigation is present only as expo-router's underlying dependency.)

### Bottom tabs (`src/app/(tabs)/_layout.jsx`)
A `<Tabs>` navigator (`:38`) with five tabs:

| Label | `Tabs.Screen name` | Screen file | Def |
|---|---|---|---|
| Feed | `index` | `(tabs)/index.jsx` | `:62-68` |
| Health | `health` | `(tabs)/health.jsx` | `:69-75` |
| Training | `training` | `(tabs)/training.jsx` | `:76-82` |
| Community | `community` | `(tabs)/community.jsx` | `:83-89` |
| More | `more/index` | `(tabs)/more/index.jsx` | `:90-96` |

The More tab's `name` is `"more/index"` (`:91`) — it points directly at the nested group's index route.

### More tab — nested Stack (`src/app/(tabs)/more/_layout.jsx`)
A `<Stack>` nested inside the More tab (`:5-12`), declaring screens: `index`, `vet`, `adopt`, `shop`, `profile`, `settings`. The layout component holds **no state**.

Files actually present in `(tabs)/more/`: `index.jsx`, `vet.jsx`, `adopt.jsx`, `shop.jsx`, `profile.jsx`, `profile-edit.jsx`, `reminders.jsx`, `settings.jsx`.
- **Discrepancy:** `reminders` and `profile-edit` exist and are navigated to but are **not declared** as `<Stack.Screen>`. Expo Router auto-registers them, but with no declared options/ordering.

### Routine-creation flow vs. the More tab (known-bug area)
Routine creation is **not a router route** — it is in-component React Native `<Modal>` state, all owned by `RoutinesTab`, which renders inline inside the `reminders` screen:
- `more/reminders.jsx` is a normal **pushed Stack screen** reached via `router.push("/(tabs)/more/reminders")` (`more/index.jsx:258`); it conditionally renders `<RoutinesTab />` (`reminders.jsx:129`).
- `RoutinesTab.jsx` owns the creation state (`typeSelectorVisible`, `selectedType`, `editingRoutine` — `:51-53`). "Create" → `setTypeSelectorVisible(true)` (`:131-134`) → `<RoutineTypeSelector>` modal (`RoutineTypeSelector.jsx:38`, a `transparent` `<Modal>`) → selecting a type sets `selectedType`, which gates a per-type `<Modal>` (e.g. `FeedingRoutineModal.jsx:219`).
- Leaving: close/save call `closeAllModals` / `handleSaveRoutine` → `setSelectedType(null); setEditingRoutine(null)` (`RoutinesTab.jsx:155-156, 181-184`). Leaving the whole screen = header back → `router.back()` (`reminders.jsx:86`).

**Structurally suspicious patterns observed (no fix proposed):**
1. `reminders` (and `profile-edit`) are **navigated to but not declared** in the More Stack (`more/_layout.jsx:5-12`). Undeclared-but-used routes in a nested Stack are a known source of inconsistent back/dismiss behavior relative to `index`.
2. **Mixed path styles to the same nested Stack:** `more/index.jsx:258` pushes the absolute `"/(tabs)/more/reminders"`, while `more/profile.jsx:192` pushes the group-relative `"/more/profile-edit"`. Absolute vs. group-relative hrefs can resolve to different navigation states.
3. **Routine creation is plain `<Modal>` state with no `onRequestClose`** (`FeedingRoutineModal.jsx:219`, `RoutineTypeSelector.jsx:38`). On Android hardware-back / iOS swipe-dismiss, the OS dismisses the modal layer while `RoutinesTab`'s `selectedType`/`typeSelectorVisible` stay set — leaving the underlying `reminders` screen's React state disagreeing with what's shown. A subsequent `router.back()` returns to `more/index`, the route reported as corrupted.
4. `more/index.jsx:102,106` issues `router.replace("/welcome")` in a logout/"Reset App Data" handler — a `replace` from the More root rewrites history (gated behind a reset button, not the routine flow itself, but noted given the symptom centers on the More root).

---

## Wave 6 feature surfaces (tickets 2.51–2.58)

Added on top of the unified provider spine + RLS model. Migrations **0051–0055** are harness-proven
and PENDING hand-apply to Supabase (`docs/test-backlog.md` ACTION 1). All new owned tables are
ENABLE+FORCE RLS and pass the completeness guard (`test/integration/rls-gap-closure.integration.test.ts`).

- **Emergency Card (2.51, migration 0051).** Owner-facing card that ASSEMBLES existing medical sources
  (`pet_medical_profiles`/`pet_allergies`/`pet_conditions`/`pets` + the 0050 `lost_reports`) for a real
  vet, plus two **PUBLIC no-login web pages**: `/p/tag/[token]` (the permanent printed-QR tag — basic
  info; medical only if the owner opts in) and `/p/card/[token]` (a revocable/expiring vet link).
  Tables: `pet_emergency_cards` + `pet_emergency_share_links`, both **OWNER FOR ALL only**. The public
  read is NOT a broad policy — it flows ONLY through SECURITY DEFINER fns `app_emergency_card_by_tag`,
  `app_emergency_card_by_link`, `app_emergency_relay_contact` (pinned search_path, GRANT to pawpi_app).
  Owner API: `/api/emergency-card` (+ `/links`); public API: `/api/public/emergency/tag|card/[token]`.
  Mobile screen `app/emergency-card.jsx` (reached from the Vet Record) reuses the 2.28 share +
  `react-native-qrcode-svg` for the printable tag. Widens `notifications_type_check` for `'emergency_contact'`.
- **Transport / pet-taxi (2.52, migration 0052).** A `transport` capability on the spine; a trip IS a
  generalized booking (2.4), so it surfaces in the existing inbox/calendar. New `transport_trips`
  (owner FOR-ALL-but-can't-self-advance + active-staff read/update; reuses `app_is_active_staff_of`).
  Web: `/api/providers/[id]/transport-trips` (+ `[tripId]`), owner `/api/transport-trips`. Mobile:
  `app/service/transport.jsx` (discovery → booking form with `WalkMapPicker` pickup/dropoff → trips list).
- **Vet prescriptions / Rx (2.53, migration 0053).** A section INSIDE Veterinary + the Vet Record, NOT
  a pharmacy. `prescriptions` (OWNER read-only, append-only — no provider UPDATE/DELETE policy) +
  `rx_refill_requests` (owner files, vet decides). Controlled mutations via DEFINER helpers
  `decide_rx_refill` (decrements refills on approve) + `cancel_rx`; INSERT gate `app_provider_can_rx`
  (staff + medical_write grant OR booking). Mobile: `PrescriptionsSection` in the Vet Record
  ("Prescribed by {clinic}", request refill, no owner edit).
- **Insurance marketplace (2.54, migration 0054).** A lead-gen `insurance` capability (capability CHECKs
  + ALLOWED_CAPABILITIES widened). `insurance_plans` (admin-managed; published-public read, two-tier like
  provider_services) + `insurance_leads` (owner-or-provider scoped). No binding/payment, no Vet Record
  sent. Web: `/api/providers/[id]/insurance-plans|insurance-leads`, owner `/api/insurance-leads`. Mobile:
  `app/service/insurance.jsx` (discovery → plans → compare → quote form prefilled from the pet → lead).
- **Adoption foster/urgent flags (2.57, migration 0055).** ADDITIVE columns riding the existing adoption
  RLS (0038): `adoptable_listings` += `placement_type`/`is_urgent`/`is_featured`/`urgent_reason`/
  `featured_until`; `adoption_applications` += `requested_placement`. Browse orders featured-first; mobile
  shows an URGENT badge + foster/adopt picker. No new table, no policy change.
- **Feed "Suggested" divider (2.58, no migration).** `mergeFeed` tags each post `feed_group`
  (`following`|`suggested`); `UnlockedFeed` renders a "Suggested for you" divider at the boundary, only
  when followed content sits above real suggested content.
- **Followers/Following route fix (2.67, no migration).** Hardened the 2.61 `/follows` navigation
  (absolute-href to the root route + active-pet fallback so the embedded Profile tab never pushes an
  empty petId; counts non-interactive while the pet loads).

---

## Top 5 things I'm least sure about (please verify)

1. **Live DB schema vs. code-inferred schema.** No migration/DDL files exist in the repo; the 32 table names and all column mappings (incl. `pets.owner_user_id → user_profiles.id`) are inferred from queries only. Whether the actual Neon DB has these tables, columns, and FK constraints — and whether existing `pets` rows still carry the *wrong* `owner_user_id` (auth id) that the repair handler targets — needs to be checked against the real database.

2. **Whether the `owner_user_id` repair has actually been run.** The code clearly anticipates bad historical data (`pets/route.js` PATCH `:289-558`), but I cannot tell from code whether production/your dev data is already clean or still mixed. This directly affects the "identity bug" you mentioned.

3. **The exact mechanism of the More-tab corruption bug.** I identified several plausible structural contributors (undeclared nested routes, mixed absolute/relative paths, modals without `onRequestClose`), but I did **not** reproduce the bug or confirm which one (or combination) is the actual cause — that requires running the app and exercising Android back / iOS swipe-dismiss from routine creation.

4. **The `/api/db/:database` endpoint referenced in `web/src/app/api/utils/create.js`.** It's imported/used but no matching route exists in this tree. I'm unsure whether `create.js` is actually exercised at runtime, or is dead/legacy scaffolding from the Anything export superseded by the direct `sql.js` + per-resource API routes.

5. **RESOLVED — `useCurrentPet` is a single hook.** An earlier version of this doc flagged two same-named hooks; they were unified (PR #12). There is now ONE `useCurrentPet`, exported from `src/hooks/usePetProfile.js` (the standalone `useCurrentPet.js` was removed). No duplication / divergence remains.
