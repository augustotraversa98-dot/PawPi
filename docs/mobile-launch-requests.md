# Mobile app launch: API requests (before / after)

Context: the latency investigation (PR #616, `docs/observability/OPERATIONS.md` §18) found that one phone
opening the app sends 37-61 API calls in 2-3 s. Production is Railway us-east4 → Supabase sa-east-1, so every
request costs about 1.4 s of cross-continent round trips, and the pool (10 connections) serves a burst in
waves. Fewer, non-duplicated launch requests is the cheapest fix on the client.

**How this was produced.** A static trace of the code (not a device capture): every `fetch` / React Query
key reachable from app open to the first rendered tab, for an authenticated user with one pet, assuming the
iOS native tab bar mounts all five tabs eagerly (Android's JS tabs are already lazy, so Android only ever
mounted Feed). The new behaviour is pinned by jest tests that fail on the old code (listed at the bottom).
A real before/after capture still needs a device or simulator; the Grafana `api_call` events will show it
after the build ships.

## What fires at launch

"Crit" = needed for the first Feed paint. Pet-scoped = carries `pet_id` (as the pet's id in the path/query);
owner-scoped = the server scopes by the session, as always.

| # | Request | Before | After |
|---|---|---|---|
| 1 | `GET /api/telemetry/config` (anonymous) | 1 | 1 (unchanged) |
| 2 | `POST /api/telemetry/events` (batched) | ≥1 | ≥1 (unchanged) |
| 3 | `GET /api/me/bookings?today=` | 1, at +1.5 s **even signed out (401) and before auth was ready** | 1, only once signed in |
| 4 | `POST /api/push-tokens` | 1 | 1 |
| 5 | `GET /api/pets` (EntryPoint) | 1 raw, not cached | 1, **through `["pets"]`** (crit) |
| 6 | `GET /api/pets` (tabs, `usePetProfile`, ~12 observers) | 1 more | **0** (cache is fresh from #5) |
| 7 | `GET /api/providers` (EntryPoint, only used when there are no pets) | 1 | **0** with pets; 1 without |
| 8 | `GET /api/providers` (More → OwnerMenu) | 1 more | 0 at launch; 1 on first open of More (shares `["providers","mine"]`) |
| 9 | `PUT /api/user-profile/locale` | 1 | 1 |
| 10 | `GET /api/posts?limit=20&offset=0` **without** `viewerPetId` | 1, thrown away when the pet resolved | **0** (waits for the pets list) |
| 11 | `GET /api/posts?…&viewerPetId=X` (crit) | 1 | 1 |
| 12 | `GET /api/posts/today-daily-update?pet_id=X` (crit) | 1 | 1 |
| 13 | `GET /api/posts/owner-posted-today` (crit) | 1 | 1 |
| 14 | `GET /api/posts/streak?petId=X` | 1 | 1 |
| 15 | `GET /api/feed/suggestions` | 1 | 1 |
| 16 | `GET /api/care-access/grants` | 1 | 1 |
| 17 | `GET /api/user-profile` (bark modal) | 1 | 1 |
| 18 | `GET /api/pets/X/care-ring` (4 observers, one key) | 1 | 1 |
| 19 | `GET /api/health/food-logs?petId=X` (getting-started) | 1 | 1 |
| 20 | `GET /api/pets/X/profile` — getting-started (no viewer) and the More tab's own-pet Profile (`?viewerPetId=X`) | 2 (two keys) | 1 at launch (getting-started now uses the Profile tab's exact args → one entry) |
| 21 | `GET /api/routines?petId=X` (Feed checklist **and** Health `loadRoutines`) | 2 | 1 (shared `["routines", X]`) |
| 22 | `GET /api/feed/milestones` (only once the feed is unlocked) | 0-1 | 0-1 |
| 23 | Health tab: vet-appointments, 5 reminder-resolver reads (dismissals, wellness, weight, medical-care, photo-checks), general-checks, activity-insight, pack-streaks, leaderboard, vet-readiness, share-stats | 12 | **0** until Health is first opened |
| 24 | Training: `GET /api/training/self-progress?petId=X` | 1 | **0** until Training is first opened |
| 25 | Services: `GET /api/threads/unread-count` (polled every 30 s from launch) | 1+ | **0** until Services is first opened |
| 26 | Services: `GET /api/services/discover` (no coords, then again with `lat`/`lng`) | 2 | **0** until Services is first opened, then **1** (waits for the location answer) |

Totals at launch (one pet, all tabs mounted): **40 request instances before → 18 after (-22)**, and no
endpoint+params pair is requested twice. The 22 that moved are not removed from the app: each now fires the
first time the user opens the tab that needs it (`useHasBeenFocused`), so the API pool is free for the Feed
the user is actually looking at.

## Rules the change keeps

- **Scoping.** Every key still carries the pet id (`["posts","feed",limit,offset,viewerPetId]`,
  `["routines", petId]`, `["petProfile", petId, viewerPetId]`, …); the shared `["pets"]` /
  `["providers","mine"]` entries are session-scoped on the server, and `useAuthStore.setAuth` already clears the
  whole cache on every identity change, so one user's entry is never served to another
  (`index.launchRequests.test.jsx` has a two-user case).
- **No request before auth is ready.** The EntryPoint only reads after `isReady` + a usable token (unchanged);
  the telehealth poll no longer starts at mount (it was unconditional). Telemetry config/events are anonymous
  and still start at mount.
- **No stuck tab.** The first-focus gate reacts to the navigator's `focus` event and also polls `isFocused()` every
  400 ms as a backstop, so a navigator that did not emit the event delays a tab by at most 0.4 s instead of leaving it blank
  (this could not be verified on a real iPhone tab bar from here).
- **No flicker.** The pet-scoped feed read waits for the pets list (`useFeedData` already shows its loading
  state while the pet loads); the Discover pane shows its loading state (not an empty list) while it waits for
  the location answer, and never waits more than 3 s; a deferred tab renders a blank cream placeholder that is
  replaced in the same frame the tab gets focus.
- **`loadRoutines` is still a live read** (`staleTime: 0`): edits and pull-to-refresh behave as before; it only
  *joins* a request already in flight for the same pet.

## Tests (each fails on the old behaviour)

| Behaviour | Test |
|---|---|
| `/api/pets` once, `/api/providers` not at launch / once for a no-pet role check; scoping across users | `src/app/index.launchRequests.test.jsx` |
| Routines: Feed checklist + `loadRoutines` share one request; still a live read; per-pet scoping | `src/store/routines.sharedFetch.test.jsx` |
| Feed posts wait for the pets list, then one scoped request | `src/hooks/useFeedPosts.test.jsx` |
| Discover: one request with final lat/lng; none while location pending; never empty-flash; 3 s patience | `src/components/Services/ServicesDiscovery.launchRequests.test.jsx` |
| Tabs held back until first focus (Health, Training, Services, More) | `src/hooks/useHasBeenFocused.test.jsx` + one case in each tab's test |
| Telehealth poll only when signed in; stops on sign-out | `src/app/_layout.launchGate.test.jsx` |

## Not changed (follow-ups)

- Telemetry config/events fire before auth is ready (anonymous, no Bearer). Gating them is a separate decision.
- `GET /api/posts/owner-posted-today` duplicates `today-daily-update` for single-pet owners (could be derived).
- `care-ring` / `pack-streaks` use `staleTime: 0`, so a late-mounting observer refetches; with the tabs now
  mounting on first open they fetch then, not at launch.
- The Services unread-count poll and the vet-appointment poll keep polling while their tab is unfocused.
