# Phase 4 Audit — "Current Pet" Concept (mobile)

> **Audit only. No code changed.** Maps how the active dog is determined, stored, read, and threaded into queries today, plus a recommendation for a canonical hook and a persistence design. Line numbers reference files at the current commit. All mobile paths are under `anything/apps/mobile/src/`.

---

## TL;DR

- There is **no concept of a *selected* pet**. "Current pet" = **`pets[0]`** — the first row of `GET /api/pets`, which the server returns `created_at DESC` (so it's really "most recently created pet").
- **Two `useCurrentPet` hooks exist**, backed by **two different React Query caches** (`["pets","current"]` vs `["pets"]`) and **two separate `/api/pets` fetches**. Writers use one, readers use the other.
- **No persistence of a selection.** Nothing in AsyncStorage/SecureStore/DB stores "which pet is active." A `socialPetStore.currentPet` exists but its setter is **never called** (dead).
- A selection trivially "survives restart" only because it's always recomputed as `pets[0]`. The moment real multi-pet selection is added, nothing will persist.
- **Owner identity is resolved entirely server-side** from the session; the mobile client never sends an owner id, so the `auth_users.id` vs `user_profiles.id` footgun cannot be triggered from the client. The pet's `.id` (= `pets.id`) is the only id the client passes, and the server scopes every query by `owner_user_id = <user_profiles.id>`.

---

## 1. Every `useCurrentPet` hook (and equivalents)

### Hook A — `hooks/useCurrentPet.js` (standalone)
- **Returns:** a raw React Query result object. `data` = `pets[0]` or `null`. Also exposes `.isLoading`, `.error`, `.refetch`, etc.
- **Picks the pet:** fetches `/api/pets` itself and returns `data.pets[0]` (`:17`) — i.e. **first pet** (most-recently-created).
- **Cache:** `queryKey: ["pets", "current"]`, `staleTime: 5 min` (`:8,19`). No `refetchOnMount`/`onWindowFocus`. **No auto-repair.**
- Comment in-file admits it's a placeholder: *"For now, we just get the first pet… Later this can be expanded to support multi-pet selection."*

### Hook B — `hooks/usePetProfile.js` → `useCurrentPet()` (derived)
- **Returns:** `{ data, isLoading, error, hasPet }` where `data` = `pets[0]` or `null`, `hasPet = !!currentPet` (`:116-132`).
- **Picks the pet:** calls `usePetProfile()` (which fetches `/api/pets`, returns the **array**), then takes `pets[0]` (`:119`) — **first pet**, same rule as A.
- **Cache (via `usePetProfile`):** `queryKey: ["pets"]`, `staleTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true` (`:40-42`).
- **Side effect:** when `pets.length === 0`, `usePetProfile` fires `PATCH /api/pets` once (the owner-id **auto-repair**) and invalidates `["pets"]` (`:46-110`).

### Do they differ?
**Yes, materially:**
| | Hook A `useCurrentPet.js` | Hook B `usePetProfile.js` |
|---|---|---|
| Query key | `["pets","current"]` | `["pets"]` |
| Network call | its own `/api/pets` fetch | shared `usePetProfile` fetch |
| Stale time | 5 min | 0 (always refetch) |
| Refetch on mount/focus | no | yes |
| Auto-repair on 0 pets | **no** | **yes** |
| Invalidated by `useCreatePet`/`useRepairPets` (which target `["pets"]`) | **no** | **yes** |
| Return shape | full RQ object (`data`) | `{data, isLoading, error, hasPet}` |

Both expose the pet on `.data`, so the common `const { data: currentPet } = useCurrentPet()` works against either — which is exactly why the duplication has gone unnoticed. The dangerous part is the **two independent caches**: they can hold different snapshots of `pets[0]` at the same moment (see §4).

### Equivalents / related
- `store/socialPetStore.js:16-17` — `currentPet` state + `setCurrentPet`. **`setCurrentPet` is never called anywhere** (confirmed by grep — only the definition exists). Dead for pet selection.
- `store/routinesStore.js` — pet-id-*agnostic*; it never reads the current pet, the caller passes `petId` into `loadRoutines(petId)`.
- No `selectedPetId` / `activePetId` / `currentPetId` exists anywhere.

---

## 2. Storage & persistence — does a selection survive restart?

- **No persistence of a selection at all.** The current pet is **recomputed on every mount** from the server (`pets[0]`).
- **AsyncStorage** holds only onboarding cache, never a selection: `onboarding_pet_photo`, `onboarding_progress`, `pet_profile`, `has_completed_onboarding` (`app/onboarding.jsx:78,84,104,290,291`). `useFeedData.js:296` explicitly comments *"Return database pet instead of AsyncStorage"* — the old AsyncStorage pet fallback was removed in favor of the DB.
- **SecureStore** holds only auth tokens (per ARCHITECTURE §3).
- **Zustand** `socialPetStore.currentPet` is in-memory only and never written.
- **Does it survive an app restart?** There is nothing to survive — on each launch the app re-fetches and uses `pets[0]`. For a **single-pet** user this is stable. For a **multi-pet** user, any notion of "the dog I was looking at" is **lost on every remount/restart**, and would silently jump to the newest pet.

---

## 3. Consumers, grouped by hook

### Group A — import `@/hooks/useCurrentPet` (cache `["pets","current"]`) — 18 sites
**Screens / components:**
- `app/nearby-walks.jsx:40`
- `app/(tabs)/more/profile.jsx:41`
- `app/(tabs)/more/profile-edit.jsx:38`
- `components/Health/FeedingCountdownCard.jsx:26`
- `components/Health/FeedingIssueModal.jsx:36`
- `components/Health/HealthVetRecord.jsx:54` (drives ~9 sub-queries keyed on `currentPet?.id`)
- `components/Health/Weight/WeightModal.jsx:99`
- `components/Health/Pee/PeeTrackerModal.jsx:32`
- `components/Health/Vomit/VomitTrackerModal.jsx:42`
- `components/Health/WellnessCheck/WellnessMoodEnergyModal.jsx:46`
- `components/Health/WellnessCheck/WellnessMobilityModal.jsx:37`
- `components/Health/WalkActivity/WalkCountdownCard.jsx:34`
- `components/Health/WalkActivity/PostWalkFeedbackModal.jsx:42`
- `components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:123`
- `components/Health/Reminders/RoutinesTab.jsx:40` (feeds `routinesStore.loadRoutines(currentPet.id)`)
- `components/Health/Reminders/VetAppointmentRoutineModal.jsx:51`

**Hooks:**
- `hooks/useHealthTracking.js:3` — **all 8 write mutations** (`useLogFood/Poo/Walk/GeneralCheck/PhotoCheck/Pee/Vomit/Weight`)
- `hooks/useVetAppointmentReminders.js:2`

### Group B — import `./usePetProfile` (cache `["pets"]`) — 2 sites
- `hooks/useFeedData.js:3` (Feed tab data; also re-exports `currentPet`/`hasPet`/`petProfile`)
- `hooks/useFetchHealthData.js:2` — **all 10 read hooks** (food/poo/walk/general/photo/timeline/pee/vomit/weight logs)

**The split that matters:** health **writes** go through Group A's cache; health **reads** go through Group B's cache. They independently compute `pets[0]` from two different fetches.

---

## 4. How `pet_id` / `owner_user_id` flow into queries — and where a wrong id could appear

### The flow (mobile → server)
1. Hook returns `currentPet` (= `pets[0]`). `currentPet.id` is **`pets.id`** (the pet PK).
2. Components/hooks pass it as **`petId`** — either in the query string (`?petId=${currentPet.id}`, e.g. `useFetchHealthData.js`, `HealthVetRecord.jsx`, `useVetAppointmentReminders.js`) or in the JSON body (`petId: currentPet.id`, all of `useHealthTracking.js`, the tracker modals, `nearby-walks.jsx`).
3. The mobile client **never sends an owner id.** Owner is resolved **server-side**: `session.user.id` (= `auth_users.id` = `token.sub`) → `SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}` → `userProfileId` → every query filters `... AND owner_user_id = ${userProfileId}` (verified in `web/.../health/weight-logs/route.js:13,33,57`; same pattern repo-wide per ARCHITECTURE §3).

### Where the wrong id *could* be used
- **Not from the client.** Because the client only sends `pets.id` and the server derives the owner from the session, the `auth_users.id` vs `user_profiles.id` vs `pets.owner_user_id` confusion **cannot be introduced by the mobile current-pet path.** A foreign/stale `petId` simply matches no rows (server ANDs in `owner_user_id`), returning empty rather than leaking — safe-by-default.
- **Server-side historical bug (data, not client):** `pets.owner_user_id` was once written as `auth_users.id` instead of `user_profiles.id`. The `PATCH /api/pets` repair fixes it. **Auto-repair only fires through Hook B** (`usePetProfile`). **Screens that mount on Hook A alone never trigger repair** — if a user's pets are "invisible" due to the bad mapping, a Hook-A-only screen shows `null` forever and won't self-heal; the user must hit a Hook-B surface (Feed/Health data) first.
- **Cross-cache divergence (the real client risk):** Hooks A and B are separate caches. After creating the **first** pet (or any pet), `useCreatePet`/`useRepairPets` invalidate **only `["pets"]`** (Hook B). Hook A (`["pets","current"]`, 5-min stale, no invalidation) can still return `null` or a *different* `pets[0]`. Concrete failure: reads (Hook B) show the new pet while writes (Hook A) still throw `"No current pet selected"`, or vice-versa — until A's 5-minute stale window lapses or the app remounts.

---

## 5. Null-safety — where current pet is assumed but could be null

**Generally guarded.** Almost every consumer guards `if (!currentPet?.id)` before using it:
- All 8 write mutations in `useHealthTracking.js` throw `"No current pet selected"` (`:12,58,105,…`).
- All 10 read hooks in `useFetchHealthData.js` short-circuit to empty + `enabled: !!currentPet?.id`.
- `HealthVetRecord.jsx:376` renders an explicit empty state when `!currentPet`; its sub-queries are `enabled: !!currentPet?.id`.
- Tracker modals (`Weight/Pee/Vomit/Wellness*/PhotoCheck/PostWalkFeedback/FeedingIssue`) and `nearby-walks.jsx:47` all guard before submit.
- `profile.jsx` / `profile-edit.jsx` guard (`profile-edit.jsx:199` returns early if `!currentPet`).

**Flags (assumed-present or weak fallbacks):**
- **Hardcoded demo fallbacks:** `WalkCountdownCard.jsx:37` and `PostWalkFeedbackModal.jsx:158` default the pet name to **`"Phoebe"`** when `currentPet` is null — leftover seed data that will show a stranger's dog name to a new/no-pet user.
- **Cosmetic fallbacks elsewhere:** `"Your pet"` / `"My Dog"` / `"your pup"` (`FeedingCountdownCard.jsx:95`, `profile.jsx:157`, `useFeedData.js:16`) — benign but inconsistent.
- **`RoutinesTab.jsx:145`** uses `currentPet?.id || routine.petId` on save — if `currentPet` is null it silently falls back to the routine's own `petId`, which can write to a *different* pet than the one displayed.
- **No global "create your first pet" gate.** Each surface degrades on its own; there's no single source that blocks pet-scoped screens until a pet exists. Whether a no-pet user sees a clean empty state or `"Phoebe"`/spinners depends entirely on which component they land on.

---

## Recommendations

### A. Canonical hook — keep ONE, delete the other
**Make `usePetProfile.js`'s `useCurrentPet` (Hook B) canonical; delete the standalone `hooks/useCurrentPet.js` (Hook A).**

Why B wins:
- Single shared `["pets"]` cache — eliminates the writer/reader cross-cache divergence in §4.
- Already participates in `useCreatePet`/`useRepairPets` invalidation, so new/repaired pets appear immediately.
- Carries the auto-repair side effect, so every consumer self-heals the historical owner-id bug.
- Exposes `hasPet` for clean empty-state gating.

Migration (next phase, not now): repoint the 18 Group-A imports from `@/hooks/useCurrentPet` to the `usePetProfile` export, delete `hooks/useCurrentPet.js`. The common `{ data: currentPet }` destructure is already compatible; only sites relying on raw RQ methods (`.refetch` in `profile.jsx:41`) need `usePetProfile().refetch` instead.

> ⚠️ One caveat to design for: Hook B's `staleTime: 0` + `refetchOnWindowFocus` means **every** consumer currently refetches `/api/pets` aggressively. Once it's the single source for ~20 sites, bump `staleTime` to ~30–60 s (selection rarely changes) to avoid a refetch storm.

### B. Introduce a real selection (replaces "always `pets[0]`")
1. Add `selectedPetId` to a persisted store (see C). The canonical hook becomes:
   `currentPet = pets.find(p => p.id === selectedPetId) ?? pets[0] ?? null`.
2. Repurpose the **already-present-but-dead** `socialPetStore.setCurrentPet` (or a new `setSelectedPetId`) as the setter — wired to a pet switcher UI later.

### C. Persistence design for the selected pet
- **Store:** `selectedPetId` (integer) in **AsyncStorage** under a namespaced key, e.g. `pawpi:selectedPetId` — mirror it into the canonical store on launch. (Selection is non-sensitive, so AsyncStorage over SecureStore; it's also where onboarding cache already lives.) Use `zustand/middleware` `persist` if you want it automatic.
- **Restore on launch:** hydrate `selectedPetId` from AsyncStorage, then resolve against the fetched `pets`:
  - **0 pets:** `currentPet = null`, `hasPet = false` → route to onboarding / "add your first dog"; **remove** the demo `"Phoebe"` fallbacks so no-pet users never see seed names.
  - **1 pet:** ignore stored id, always use the single pet (and write its id back as the selection).
  - **≥2 pets:** use stored `selectedPetId` if it still exists in the list; else fall back to `pets[0]` and overwrite the stale stored id.
- **On delete:** if the deleted pet was selected, clear/reselect (`pets[0]`).
- **On create:** optionally auto-select the newly created pet (matches today's "newest is current" behavior without surprising existing-pet users).

---

## Cross-references to existing docs
- Identity chain & the `owner_user_id` repair history: `ARCHITECTURE.md` §3.
- Integer (not uuid) ids; owner = `user_profiles.id`: `supabase/SCHEMA_NOTES.md` (resolved flag #1).
- `sql(string, array)` no-op gotcha (relevant when touching any pet-scoped route later): `supabase/SCHEMA_NOTES.md` → "DB query gotcha".
