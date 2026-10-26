# PawPi performance audit - 2026-10-23

_Read-only audit plus measurement. No application or server code, schema or production data was changed. Method and limits are in section 7. Builds on the earlier latency work in
`docs/observability/OPERATIONS.md` section 18 (PR #616) and `docs/mobile-launch-requests.md`; it does not repeat what those already fixed._

## 0. Summary

**The app feels like a slow website because it is one: every screen waits on API calls that each take 1.2-2.3 s, and the app has nothing cached to show while it waits.**

1. **Server (about two thirds of the wait).** The database itself is fast (the whole feed query executes in 1.9 ms; the web server's CPU is 0.4 %). The time is **network distance**:
   Railway runs in Virginia, Supabase in São Paulo, and each request makes **5-12 sequential database round trips of ~170 ms**. Measured p50 on production: `GET /api/posts` 2.05-2.30 s, `GET /api/pets` 1.2-1.6 s.
   Every authenticated request first pays a fixed floor of 4 round trips (~0.7 s) before its handler runs a single query, and only 15 `Promise.all` exist in 287 route files. A local experiment with the real driver at a simulated 170 ms round trip shows pipelining the same statements takes **520 ms instead of 1,039 ms**.
2. **Phone (the other third, and all of the "dead screen" feeling).** Nothing is persisted between launches (no query cache persister, no placeholder data), so every cold start is splash -> "Loading..." -> Feed spinner with two serial network hops. The Feed spinner waits on four queries ANDed together,
   the first screen fires ~13 requests into a 10-connection pool (some of them for UI that is not visible), images are full-size originals with no placeholder and `cache-control: no-cache`, the Feed is a non-virtualised `ScrollView` of 20 cards, a photo tap waits 260 ms on purpose, and each paw refetches the whole feed.
3. **Region.** Railway has no South America region (US West, US East, Amsterdam, Singapore only). Code changes get the feed from ~2.1 s to an estimated ~1.0 s; only moving the **database** next to the web service (Supabase `us-east-1`) takes a request to ~0.4-0.5 s. The database has 84 users, so this is the cheapest it will ever be to move.

**Recommended order:** (1) quick-wins bundle (section 5.1, all small, no schema change) -> (2) request-pipeline PR (5.2) and mobile launch PRs (5.3, 5.4) -> (3) re-measure with section 6 -> (4) decide on co-location (5.8) with the new numbers.

## 1. Top 10 findings, ranked by user-felt impact x ease

_Impact numbers for server changes are estimates from the measured model (`latency = round trips x ~170 ms + ~250 ms edge`) and must be confirmed with the baselines in section 6. Mobile items were found by static reading and spot-checked by hand; nothing was profiled on a device._

| # | Finding | Evidence | Proposed fix | Effort | Risk | Expected gain |
|---|---|---|---|---|---|---|
| 1 | **Every request pays a fixed 4-round-trip floor** (revocation check, `BEGIN`, identity lookup, `COMMIT`) before its handler runs | `__create/index.ts:486-535`; `utils/tokenRevocation.js:34-50`; `utils/requestContext.js:76-111`; measured: awaited stamp+query 694 ms vs pipelined 518 ms | Cache the "not revoked" answer per user for 30 s (cleared by `invalidateUserTokens`); cache `auth_user_id -> user_profiles.id` in process; send the identity `set_config` pipelined with the handler's first statement | M | Medium: RLS identity code (keep the anti-leak test; positive results only, TTLs) | -2 round trips on **every** request, ~0.35 s |
| 2 | **Hot routes await independent statements one by one, and wrap reads in savepoints** | `posts/route.js:216-364` (11-15 trips), `discover/route.js:47-102` (8), `pets/route.js:30-65` (7, repeats the identity lookup); 74 `withSavepoint` sites; 15 `Promise.all` in 287 routes; measured: 4 statements 1,039 ms serial vs 520 ms `Promise.all`; savepoint +1 trip | Group independent reads in `Promise.all` inside the request transaction; drop savepoints whose migrations are verified applied; one query for pets+weights | M (S per route) | Low-medium (read-only routes; add a trip-count assertion to each route's integration test) | Feed 11 -> ~5 trips (-1.0 s); pets 7 -> 3 (-0.7 s); discover 8 -> 4 (-0.7 s) |
| 3 | **The Feed spinner waits for four queries ANDed together** | `hooks/useFeedData.js:305-306` (`loadingPosts \|\| loadingPet \|\| loadingDailyUpdate \|\| loadingOwnerPosted`), spinner at `(tabs)/index.jsx:240` | Render posts as soon as the posts query resolves; lock state falls back to the existing logic and shows a skeleton while unknown | S | Low | Feed visible after 1 round trip chain instead of the slowest of 3, ~0.3-1 s |
| 4 | **The first screen fires ~13 requests, several for UI that is not visible, into a pool of 10** | Cold-start table in section 4.2: `BarkModal.jsx:49` fetches `/api/user-profile` while the modal is closed; the Getting Started trio (`useGettingStarted.js:74-82`, one of which loads a whole pet profile for a single number); `PUT /api/user-profile/locale` every launch; care grants for a badge | `enabled: visible` on the Bark modal; render Getting Started data hooks only if the card can show; send locale only when it changed; fold the badges into one endpoint later | S | Low | -5 requests in the launch burst (13 -> 8): the burst finishes in 1 wave of the pool instead of 2 |
| 5 | **Cold database connections cause the 3-4 s p99 outliers and pool exhaustion** | 4,729 `DISCARD ALL` + 4,644 porsager type-fetch statements since 2026-07-28 (`pg_stat_statements`); `sql.js:30-39` defaults (`max` 10, `max_lifetime` 30-60 min randomised, `idle_timeout` 0); a connection is held ~1.2-2 s per request | Pre-warm the pool at boot, raise `max_lifetime`, keep-alive; raise `max` only after confirming the pooler port is 6543 (transaction mode) | S | Low (pool `max` change: medium, verify the port first) | Removes a ~0.8 s penalty every ~15-50 min and after each deploy; p99 3.8 s -> ~2 s |
| 6 | **Images are full-size originals, served `no-cache`, shown without a placeholder** | `upload/route.js:93-104` stores raw bytes with no cache header; sample object `cache-control: no-cache`, 2.87 MB, 1.07 s; media mean 1.7 MB, median 526 KB, max 5.9 MB (89 objects); `PostComposerModal.jsx:163-168` no max dimension; no `cachePolicy`/`placeholder`/`transition` on feed images (`PawablePhoto.jsx:99-104`); Supabase `render/image` answers 200 | Resize to <= 1440 px (`expo-image-manipulator`, already a dependency) before upload; `cache-control: max-age=31536000, immutable` on upload (UUID names); serve `render/image?width=` variants in lists; `transition` + placeholder | S (client resize + header) then M (variants) | Low | Feed image bytes -85-95 %; images stop revalidating; posting is faster |
| 7 | **Taps that wait on purpose or on the network** | `PawablePhoto.jsx:9,88-93` 260 ms single-tap delay (same in `FeedVideo.jsx:10,89-92`); `pet-profile.jsx:122-138` awaits `startDM` before `router.push`; each paw runs `invalidateQueries({queryKey:["posts"]})` in `onSettled` (`useFeedPosts.js:255-257`) which refetches feed + streak + barks | Shorten/remove the tap delay (product decision); navigate immediately with a pending state; drop the whole-`["posts"]` invalidation after paw (the optimistic update already shows the result) | S | Low (tap-delay change is a UX decision) | -260 ms on every photo tap; -3 requests per paw |
| 8 | **Nothing survives a cold start** | No persister, `placeholderData`, `keepPreviousData` or `prefetchQuery` in `src` (grep); `index.jsx:251-274` "Loading..." until `GET /api/pets` returns; `queryClient.js:7-31` | Persist an allowlist of non-sensitive queries (pets list, feed page, daily/lock state, badge counts) with `PersistQueryClientProvider`, keyed by user id and app version, restored as stale; route to the tabs immediately when a session + onboarding flag exist | M | Medium: identity bleed (see `demo-wrong-pet-cache-bleed` history) and no PHI in unencrypted storage | First paint of Feed from disk, ~0.5 s instead of 3-4 s on a warm relaunch |
| 9 | **The database is ~7,500 km from the web service** | Railway regions: US West, US East, Amsterdam, Singapore (no South America); web `us-east4`, DB `sa-east-1`; each trip ~120-180 ms vs ~1-2 ms co-located | Move the database to AWS `us-east-1` (new Supabase project, dump/restore, cutover runbook); keep storage where it is | L | Medium-high (cutover; hand-applied objects must be re-verified) | Every request ~0.25 s + microseconds; combined with #1-2, p50 <= 0.45 s |
| 10 | **The Feed is a `ScrollView` of 20 mounted cards; up to ~100 native accessibility calls at first render (estimate); cold-start JS is eager** | `UnlockedFeed.jsx:127` `items.map`; `useAccessibilityPrefs.js:15-44` does its own native call per `PressableScale`/card; Metro `inlineRequires: false` (`ExpoMetroConfig.js:322`, `metro.config.js:205-214` does not override) with ~86k lines of screens evaluated before the splash hides; no FlashList anywhere | One shared accessibility-prefs store (S); `FlashList` + `useInfiniteQuery` for the Feed (M); `inlineRequires: true` after a before/after `markBootStep` profile (S, needs QA) | S-M | Medium (lock overlay, day cards, suggestions interleave; module-evaluation order) | Smoother scroll, faster mount, shorter splash (unmeasured: take M7/M10 first) |

Also found, lower rank (details in sections 2 and 4): polling (~24 `refetchInterval` hooks; the chat unread count ran 32,364 times), hidden iOS tabs keep polling and re-rendering (NativeTabs mount all five tabs, no lazy option), `pg_timezone_names` check costs 0.9 s in Postgres, provider search statements average 100-300 ms, reminders are scheduled one native call at a time before Health Today shows, a Services tab that waits up to 3 s for GPS, ~20 unused native packages linked into the binary.


## 2. Where the time goes (measured, not guessed)

### 2.1 The database is not slow. The distance to it is.

| Evidence | Number | Source |
|---|---|---|
| Database size today | 84 users, 19 pets, 18 posts, 216 paws (largest tables: `providers` 3,633, `provider_locations` 3,632) | `pg_stat_user_tables` (read-only) |
| Whole feed query, executed | **1.9 ms** (planning 3.2 ms) | `EXPLAIN (ANALYZE)` of the `GET /api/posts` "suggested" query |
| Web server CPU | avg 0.4 %, max 3.3 % of 8 vCPU; 160 MB of 8 GB | Railway metrics, 24 h |
| Most-called statements | `user_profiles` lookup 194,306 calls @ 0.06 ms; `begin` 106,730; `commit` 106,459; `set_config` 103,866 | `pg_stat_statements`, role `pawpi_app`, since 2026-07-28 |
| Railway p50 / p95 / p99, all routes, busiest 24 h buckets | 1.3-1.7 s / 2.6-2.9 s / 3.5-3.8 s | Railway `http-response-time` |
| Railway p50 per route, 72 h | `GET /api/posts` **2.05-2.30 s** (one low-traffic day 3.8 s), `GET /api/pets` **1.2-1.6 s**, `GET /api/discover` **1.2 s** | Railway `http-response-time` with `path` filter |
| Origin region vs DB region | Railway `us-east4` (1 replica) vs Supabase `sa-east-1`; DB-side sessions are all `Supavisor` | `describe-service`, `list_projects`, `pg_stat_activity` |

Every statement a request runs is a **sequential round trip São Paulo ↔ Virginia, about 120-180 ms each**. A request's latency is therefore
`(number of sequential statements) x ~170 ms + ~250 ms edge`, almost independent of what the SQL does. The model predicts the observed numbers well:

| Route | Sequential round trips per request (counted in code) | Predicted at ~170 ms | Observed p50 |
|---|---|---|---|
| `GET /api/pets` | revocation check, `BEGIN`, identity+`set_config`, **second** `user_profiles` lookup, pets, weights, `COMMIT` = **7** | 1.2 s | 1.2-1.6 s |
| `GET /api/discover` | revocation, `BEGIN`, identity, profiles, moments, viewer profile, posted-today, `COMMIT` = **8** | 1.4 s | 1.2 s |
| `GET /api/posts` (feed) | revocation, `BEGIN`, identity, following, suggested, **savepoint + select (2)**, viewer profile, posted-today, paws, `COMMIT` = **11** (15 when the viewer follows a business) | 1.9 s (2.6 s) | 2.05-2.30 s |
| `GET /api/threads/unread-count` | revocation, `BEGIN`, identity, count, `COMMIT` = **5** | 0.85 s | ~1.4 s before PR #616 (docs/observability/OPERATIONS.md section 18) |

Only **15** `Promise.all` exist in the whole API (287 route files). Nothing in the handlers overlaps its statements.

Real infrastructure that sits in front of this (all fine): the app URL is `https://www.pawpi.info` (Cloudflare proxied, HTTP/2 + h3 advertised, brotli on),
TLS terminates at Railway's edge `gru1` (São Paulo), then the request crosses to the Virginia origin. A DB-free route (`/api/telemetry/config`) answers in ~0.30 s
including TLS, so the floor for any API call is about 0.25-0.3 s before the first database statement.

### 2.2 The fixed tax every authenticated request pays (4 round trips = ~0.7 s)

| # | Round trip | Where | Needed? |
|---|---|---|---|
| 1 | `SELECT token_invalidated_at FROM auth_users` (revocation guard) on a *separate* pooled connection, before the transaction | `anything/apps/web/__create/index.ts:486-535`, `utils/tokenRevocation.js:34-50` | Needed, but the answer changes only on password reset / sign-out-everywhere / deletion. Cacheable for 30-60 s. |
| 2 | `BEGIN` (porsager awaits it alone before the handler runs) | `utils/requestContext.js:109-111`, porsager `index.js:242` | Needed for RLS, but can share a flight with the identity stamp. |
| 3 | `SELECT id, set_config('app.current_user_id', ...)` | `utils/requestContext.js:76-96` | `auth_user_id -> user_profiles.id` never changes (`UNIQUE(auth_user_id)`); can be cached in process and the stamp pipelined. |
| 4 | `COMMIT` | porsager `index.js:275-279` | Needed for writes; for read-only GETs it still costs a full round trip. |

PR #616 already took this from 8 to 5 by merging the lookup and the stamp and memoising the identity (`utils/requestIdentity.js`). This audit finds the remaining 4.

### 2.3 Backend findings (detail)

**B1. Statements that could be pipelined are awaited one by one.** porsager pipelines queued statements on one connection (`max_pipeline: 100`,
`node_modules/postgres/src/connection.js:66,176`), so independent statements started together with `Promise.all` inside the request transaction cost
**one** round trip instead of N. `GET /api/posts` runs `following` -> `suggested` -> followed-business posts -> viewer profile -> posted-today -> paws strictly in
series (`posts/route.js:216-364`); `GET /api/discover` does the same (`discover/route.js:47-98` then `:102`); `GET /api/pets` repeats the profile lookup that
`applyIdentity` already did (`pets/route.js:30-37` vs `utils/requestContext.js:76-92`) and fetches pets and weights in series (`:46-65`).
Care Ring `GET` has ~29 awaits including writes and 5 guarded blocks (`pets/[id]/care-ring/route.js:44-250`).
**Measured (this audit, local Postgres behind a proxy that adds 85 ms each way = 170 ms RTT, porsager 3.4.9, the project's real driver):**

| Pattern inside `sql.begin` | Time | Round trips |
|---|---|---|
| 4 statements awaited in series (today's style) | 1,039 ms | 6 (`BEGIN`, 4, `COMMIT`) |
| the same 4 statements in one `Promise.all` | **520 ms** | 3 |
| identity `set_config` awaited, then 1 query (today) | 694 ms | 4 |
| identity `set_config` + the query in one `Promise.all` | **518 ms** | 3 |
| 1 statement inside `tx.savepoint(...)` | 691 ms | 4 (+1 vs no savepoint: 520 ms) |
| brand-new connection (TCP, startup, type fetch) + 1 query | 541 ms | ~3 (more over TLS to Supabase) |

So pipelining is real and large: N independent statements cost one trip, the identity stamp can ride with the first read, a savepoint costs one extra trip, and a cold connection costs ~3.

**B2. `withSavepoint` costs 1 extra round trip per guarded call** (measured above; porsager awaits `savepoint`, the `release` rides with the next flight).
It was added so a *pre-migration* database degrades instead of 500ing (`utils/requestContext.js:44-61`). There are **74 call sites in 35 files**.
In the feed, three guarded reads for followed-business posts (`posts/route.js:80-168`) add 1-3 round trips (plus 2 more for the paw/comment counts when the viewer follows a business) for tables (`provider_follows`, `provider_posts`, media columns)
whose migrations are long applied in production. Remove the guard where the migration is verified applied (keep a plain try/catch for the feed's business block so a failure is
isolated *without* a savepoint by running it outside the transaction or after the main reads).

**B3. Connection pool: one connection held for the whole request, 10 connections.** `postgres()` in `utils/sql.js:30-39` uses defaults (`max` 10, no acquire timeout,
`idle_timeout` 0). A request holds its connection from `BEGIN` to `COMMIT`, i.e. 1.2-2 s, of which >95 % is waiting for the network. Capacity is therefore about
`10 / 1.4 s = 7 req/s`, and an app-open burst of 18-61 calls (docs/mobile-launch-requests.md) is served in waves of 10 (OPERATIONS.md section 18). Supabase `max_connections` is 60,
24 in use (10 are Supavisor -> `pawpi_app`). Whether `max` can go up depends on `DATABASE_URL` being the **transaction** pooler (port 6543) rather than the session pooler.
Not verified in this audit (the connection string was deliberately not printed; check the port in Railway).

**B4. Connection churn pays a cold-connection penalty about every 15-50 minutes.** `pg_stat_statements` shows **4,729 `DISCARD ALL`** and **4,644 porsager type-fetch
queries** (`select b.oid, b.typarray from pg_catalog.pg_type ...`, `fetch_types: true`, `node_modules/postgres/src/index.js:460`) since 2026-07-28: one per new connection, versus 106k
transactions. `max_lifetime` is randomised to 30-60 minutes (`index.js:515`), every Railway deploy restarts the single replica and its pool, and Supavisor connections have an average
age of 14 min (max 53 min). A new connection costs TCP + TLS + auth + the type query (~4-5 round trips, 0.7-0.9 s) on top of the request that triggered it. This is the likely source of the
3-4 s p99 outliers. Fix: pre-warm the pool at boot, raise `max_lifetime`, keep-alive ping.

**B5. Polling multiplies B1-B4.** The mobile app has ~30 `refetchInterval` hooks (5-60 s; `hooks/useProviders.js`, `useDMs.js`, `useNotifications.js`, ...). Evidence in the database: the chat unread count ran
**32,364 times** and the booking/thread lists 8-10k times each. Every poll is a 5-7 round-trip request that occupies a pooled connection for ~1 s.

**B6. `PUT /api/user-profile/timezone` validates against `pg_timezone_names`, which costs 912 ms mean (max 1.2 s) inside Postgres** (`user-profile/timezone/route.js:37`; 12 calls). The JS
`isValidTimeZone` check on the line above already rejects invalid names; the catalogue lookup can use `Intl.supportedValuesOf('timeZone')` or a cached set.

**B7. Discover and provider search do real work per request that grows with data.** `GET /api/discover` ranks *every* pet with four correlated sub-selects before `LIMIT`
(`discover/route.js:49-72`) and aggregates the whole `post_paws`/`post_barks` tables for the moments tile (`:77-97`). Provider search/discover statements average **100-300 ms** inside Postgres
(`SELECT p.id, p.slug, p.name, (SELECT ROUND(AVG(r.rating)...` 74/29/95 calls, 253/302/101 ms mean; `providers` has 3,633 rows) - AUDIT A-14. At today's size discover is cheap; the
provider directory already is not. Both are cache candidates (public, not per-user, rank changes slowly).

**B8. The feed over-fetches and re-aggregates.** `SELECT p.*` plus a `LEFT JOIN (SELECT post_id, COUNT(*) ... GROUP BY post_id)` over the full paw and bark tables
(`posts/route.js:218-302`); the plan re-runs the `HashAggregate` once per outer row (`loops=18`), O(posts x paws). 2 ms today, a cliff later. Count only for the page's ids.

**B9. Media is served unresized and uncached.** 89 objects in the public `media` bucket: mean 1.7 MB, median 526 KB, max 5.9 MB. A sample object returns
`cache-control: no-cache` (so every view revalidates), `cf-cache-status: HIT`, 2.87 MB in 1.07 s. The upload route sets no cache header (`upload/route.js:93-104`) and stores the original
bytes. Supabase's image transformation endpoint (`/storage/v1/render/image/public/...?width=600&quality=70`) answers 200 for this project, so thumbnails are available without new infrastructure.

**B10. Writes during GET and server-side defaults worth knowing.** `GET /api/pets/[id]/care-ring` upserts the day row and advances streaks on read (`care-ring/route.js:173-245`), so a read costs write round trips.
The session JWT is decoded 3x per request (guard, `applyIdentity`, handler) - CPU only, not material (CPU is 0.4 %).

**B11. Database advisors (Supabase Performance): 4 groups, none user-felt today.** 46 unindexed foreign keys, 132 unused indexes, 930 "multiple permissive policies" findings (mostly Supabase-internal
roles; `pawpi_app` policies are evaluated per row but tables are tiny), 1 Auth connection-strategy note. Park these until data grows; they will not move p50 now.

## 3. Network and region

| Question | Answer (verified) |
|---|---|
| What does the app call? | `EXPO_PUBLIC_BASE_URL=https://www.pawpi.info` (`anything/apps/mobile/eas.json` production profile) |
| CDN / TLS / protocol | Cloudflare proxy (`server: cloudflare`, `cf-ray ...-EZE`), HTTP/2, `alt-svc: h3`, HSTS. Railway edge `gru1` (São Paulo) terminates and forwards to the `us-east4` origin. |
| Compression | brotli confirmed on the HTML shell; JSON responses ride the same Cloudflare proxy. Tiny test payloads were not compressed (below the threshold), so API JSON compression was not independently measured. |
| API caching | None. `cf-cache-status: DYNAMIC` on every API route (even `/api/telemetry/config`, which sends `public, max-age=300`, because Cloudflare does not cache JSON without a cache rule). Only about a dozen `Cache-Control` headers exist in the API, all `no-store` except `social-enabled` and `telemetry/config`. No ETag/304 anywhere. |
| Static / media | App JS/images are bundled. User media comes from `qaebbesldduvgwttqlnq.supabase.co` (Supabase Storage behind Cloudflare, cache HIT) with `cache-control: no-cache` and no resizing (B9). |
| Warm-connection cost | A cold client pays DNS 0.47 s + TCP 0.02 s + TLS 0.03 s in the measured run; `/api/health/deep` (touches the DB) 1.19 s. |

### Region options (do not execute; for a decision)

Railway's selectable regions are only **US West (California `us-west2`), US East (Virginia `us-east4-eqdc4a`), EU West (Amsterdam `europe-west4-drams3a`), Southeast Asia (Singapore
`asia-southeast1-eqsg3a`)** (docs.railway.com/deployments/regions). **There is no South America region**, so the backend cannot move next to a `sa-east-1` database. The options are:

| Option | What changes | Round trips per DB statement | Cost / risk |
|---|---|---|---|
| (a) Cut round trips in code (B1-B5) | Fewer sequential statements, cached identity/revocation, pipelined reads | stays ~150 ms, but ~3 statements instead of 7-12 | S-M effort per route, low-medium risk, reversible. Gets `/api/pets` from ~1.2 s to ~0.5-0.6 s, feed from ~2.1 s to ~0.8-0.9 s. |
| (b) Add a cache layer | In-process TTL caches (identity, revocation, discover, directory) first; Redis on Railway only if more than one replica is ever run | removes statements entirely for cached reads | S for in-process (1 replica today), M for shared; invalidation is the risk. |
| (c) Co-locate: move the **database** to AWS `us-east-1` (N. Virginia, same metro as Railway `us-east4`) | Supabase cannot change a project's region in place. It means a **new** project in `us-east-1`, `pg_dump`/restore of schema + data + the custom `pawpi_app` role, grants, RLS and DEFINER functions, all hand-applied objects re-verified with the `supabase/verify_*.sql` scripts, `DATABASE_URL` swapped on the web service and the 5 cron services, a short write freeze for cutover, and the old project kept read-only for rollback. Storage can stay on the old project (public media URLs are stored as absolute `.../storage/v1/object/public/media/...` in rows, so moving storage would require rewriting them). | ~150 ms -> ~1-2 ms. A request drops from `N x 170 ms` to one cross-hemisphere hop (~0.25 s) plus microseconds. | L effort, real cutover risk, but the database is tiny today (84 users, a dump takes seconds) - it will never be cheaper to move. Do (a) first so the improvement is measured, then decide on (c) with the "after" numbers. |

Moving Railway to Virginia -> Virginia is already the case; moving Railway elsewhere (California, Amsterdam, Singapore) makes the distance to São Paulo worse.


## 4. Mobile findings (static code reading; spot-checked, not profiled on a device)

_Correction to the brief and to ARCHITECTURE.md section 5: the five tabs are Feed (`index`), Health (`health`), Care (`training`), Stores & Vets (`services`) and Profile (`more`). Community is a screen under `more/community.jsx`, not a tab._

**Already done (do not redo):** the EntryPoint shares the `["pets"]` cache (`utils/launchQueries.js`), `FirstFocusGate` defers four tabs, `/api/providers` is only fetched for accounts with no pets, fetches have a 15 s deadline, offline mode and background-poll pausing are wired (`utils/connectivity.js`), production builds strip `console.log` (`babel.config.js:12-14`), Hermes + New Architecture are on, `expo-updates` does not block launch (`fallbackToCacheTimeout: 0`), fonts are system fonts, i18n initialises synchronously. No finding below concerns these.

### 4.1 Findings by area

| Area | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| Launch | Splash waits on SecureStore, then a hidden "Loading..." screen waits on `GET /api/pets` with nothing cached; `await AsyncStorage.setItem` sits on the redirect path; the string is hard-coded English | `_layout.jsx:25,106-115`; `useAuth.js:28-31`; `index.jsx:108-113,168-170,251-274` | Persisted pets + optimistic route (item 8 above); make the `setItem` fire-and-forget; localise the string | M / S |
| Launch | Eager route loading: `inlineRequires: false`, no `asyncRoutes`; ~86k lines of screens evaluated before the splash hides; `lucide-react-native` imported in 206 files via the ESM barrel (effect unverified) | `ExpoMetroConfig.js:322`; `metro.config.js:205-214`; `app.json:80-84` | `inlineRequires: true`, measure `markBootStep` before/after, full QA pass | S (+QA) |
| Launch | The patched `fetch` reads and `JSON.parse`s the Keychain token before **every** first-party request (~13 awaited native calls in the launch burst) | `__create/fetch.ts:160`; invalidation point `utils/auth/store.js:19-52` | Cache the parsed token in memory, clear in `setAuth` | S |
| Launch | Reminder sync started twice (two 60 s intervals); boot trace does synchronous file writes per distinct step | `_layout.jsx:89` and `(tabs)/_layout.jsx:223`; `__create/boot-trace.ts:76-85` | Delete one start; write the trace once or batched | S |
| Feed | Spinner = posts AND pet AND daily update AND owner lock | `useFeedData.js:305-306` | Render on posts; skeleton for the unknown lock | S |
| Feed | Unneeded launch requests: Bark modal profile while closed, Getting Started trio (one loads a full pet profile for `stats.totalPosts`), care grants for a badge | `BarkModal.jsx:49`; `useGettingStarted.js:63-82`; `FeedHeader.jsx:45` | `enabled: visible`; gate by "card can show"; one `/api/home-badges` | S-M |
| Feed | Opening `/pet-profile` mounts `useFeedData`, refetching feed + daily update + owner lock (`staleTime: 0`, `refetchOnMount`) | `pet-profile.jsx:78`; `useFeedPosts.js:59-61`; `useTodayDailyUpdate.js:78-80`; `useOwnerPostedToday.js:28-30` | 15-30 s `staleTime` (mutations already invalidate); call only what the screen needs | S |
| React Query | Eleven `staleTime: 0` queries; four also refetch on foreground, so returning to the app after 3 s refetches 5-6 requests (several in hidden tabs) | `useFeedPosts.js:59`, `useTodayDailyUpdate.js:78`, `useCareRing.js:25`, `useOwnerPostedToday.js:28`, `usePetSocialProfile.js:26`, `routinesStore.js:31`, `usePackStreaks.js:17`, `useProviders.js:1100,1687` | 15-60 s stale windows; foreground refetch for the feed only | S |
| React Query | Paw, create and delete invalidate the whole `["posts"]` prefix (feed + streak + barks) and then explicitly refetch the same queries again | `useFeedPosts.js:83-124,148-167,222,255-257`; `useFeedData.js:229-233` | Optimistic update + rollback only; narrow or `refetchType: "none"` invalidation; remove the duplicate refetch | S |
| React Query | No pagination: feed fixed at 20, no `useInfiniteQuery` anywhere; notifications and messages unpaged | `useFeedPosts.js:26` | Infinite feed (with the FlashList change) | M |
| Polling | ~24 `refetchInterval` hooks (5 s to 4 min; chat 8-15 s); the Feed's 60 s unread poll keeps running while the user is on another tab because iOS NativeTabs mount every tab and offer no `lazy` | `hooks/useProviders.js`, `useDMs.js:10,25`, `useNotifications.js:35`; NativeTabsView mounts all five | Longer intervals, `enabled` by focus (`useIsFocused`), one badge endpoint | S-M |
| Health | Opening Health Today: `loadRoutines` in an effect (extra hop), then 5 reminder-resolver reads + vet appointments in parallel; then reminders are scheduled with one awaited native call each (permission check per reminder), and the store commits only at the end | `HealthToday.jsx:~133-139`; `useTodayReminders.js:111-137`; `store/remindersStore.js:109-139`; `utils/notifications.js:246,283` | Commit reminders to the store first, schedule OS notifications in the background, one permission check per batch; later a `/api/health/today` aggregate | S-M / M |
| Services | Discover waits up to 3 s for a GPS fix before its first request | `ServicesDiscovery.jsx:235-280,104` | Request unlocated immediately, re-sort when the fix arrives | S-M |
| Images | No resize at upload, no variants, no placeholder or transition on feed/avatars, ~10 files still use RN `Image`; `expo-image-manipulator` is installed but never imported | `PostComposerModal.jsx:163-168`; `PawablePhoto.jsx:99-104`; `PostCard.jsx:216-219` | See top-10 item 6 | S-M |
| Lists | Feed is `ScrollView` + `map` (20 mounted cards); `SuggestedDivider` defined inside render; `LockedFeedOverlay` passes an inline closure that defeats `PostCard`'s `memo`; `ThreadCard` defined inside the screen body (Community) | `(tabs)/index.jsx:289`; `UnlockedFeed.jsx:90,127`; `LockedFeedOverlay.jsx:132-136`; `more/community.jsx:64` | FlashList + infinite query; hoist inline components | M |
| Re-renders | `useReducedMotion`/`useReduceTransparency` each make their own async native call + listener per use (735 `PressableScale` uses, ~4-5 per feed card) | `hooks/useAccessibilityPrefs.js:15-44`; `PressableScale.jsx:36`; `GlassSurface.jsx:57`; `PostCard.jsx:79-80` | Module-level store + `useSyncExternalStore` | S |
| Animation | Each locked card runs an infinite Moti pulse (up to 20 concurrent) | `PostCard.jsx:~407-436` | Pulse only the first 2-3, or drop | S |
| Navigation | Photo single-tap waits 260 ms; "Message" awaits the network before pushing `/chat`; composer fetches video eligibility on each open | `PawablePhoto.jsx:9,88-93`; `FeedVideo.jsx:10,89-92`; `pet-profile.jsx:122-138`, `messages.jsx:131-135`; `PostComposerModal.jsx:126-153` | Instant tap response; push first with a pending state; cache eligibility | S |
| Feedback | No skeletons: every loading state is a centred `ActivityIndicator` | `(tabs)/index.jsx:240`; `index.jsx:262` | Skeleton cards for Feed/Health (pairs with persisted cache) | S-M |
| Hygiene | ~20 packages with zero imports are still linked natively (Skia, `expo-gl`, `three`, `react-native-graph`, `react-native-reanimated-carousel`, ...); `expo-av` deprecated in SDK 54; telemetry's 20-event flush can trip inside the launch burst | `package.json:13-17` (autolinking excludes only 3); `telemetry/queue.js:16-21`, `apiTelemetry.js:29` | Remove or exclude after checking config plugins; exclude `api_call` from the flush trigger | S |

### 4.2 Requests fired at cold start (signed in, one pet; order of firing)

| # | Endpoint | Trigger | Blocks UI? |
|---|---|---|---|
| 0 | SecureStore token read (not network) | `useAuth.js:28` | Yes (splash) |
| 1 | `GET /api/pets` | `index.jsx:108` via `launchQueries.js:29` | **Yes** ("Loading..." screen) |
| 2 | `POST /api/push-tokens` | `_layout.jsx:70` | No |
| 3 | `GET /api/telemetry/config` (opted-in only) | `TelemetryProvider.jsx:31` | No |
| 4 | `PUT /api/user-profile/locale` (every launch) | `(tabs)/_layout.jsx:190` | No |
| 5 | `PUT /api/user-profile/timezone` (only if zone changed; **0.9 s in Postgres**) | `(tabs)/_layout.jsx:192` | No |
| 6 | `GET /api/posts?limit=20&viewerPetId=` | `useFeedPosts.js:50` | **Yes** (Feed spinner) |
| 7 | `GET /api/posts/today-daily-update` | `useTodayDailyUpdate.js:36` | **Yes** |
| 8 | `GET /api/posts/owner-posted-today` | `useOwnerPostedToday.js:20` | **Yes** |
| 9 | `GET /api/posts/streak` | `useFeedPosts.js:16` | No |
| 10 | `GET /api/feed/suggestions` | `useFeedSuggestions.js:16` | No |
| 11 | `GET /api/care-access/grants` | `FeedHeader.jsx:45` | No |
| 12 | `GET /api/notifications?limit=1` (then every 60 s) | `FeedHeader.jsx:50` | No |
| 13 | `GET /api/health/food-logs` | `useGettingStarted.js:74` | No |
| 14 | `GET /api/pets/{id}/profile` (whole profile for one number) | `useGettingStarted.js:78` | No |
| 15 | `GET /api/routines` | `useGettingStarted.js:82` | No |
| 16 | `GET /api/user-profile` (**modal is closed**) | `BarkModal.jsx:49` | No |
| 17 | `GET /api/me/bookings` at +1.5 s, then every 5 min | `_layout.jsx:98-101` | No |
| 18 | `GET /api/feed/milestones` (unlocked feed only) | `MilestoneEventCard.jsx:70` | No |
| 19 | `POST /api/telemetry/events` (20-event flush can trip here) | `apiTelemetry.js:29` | No |

Shape: token read -> pets (serial) -> rows 6-8 in parallel (Feed appears after the slowest) -> everything else in parallel once `currentPet` exists. Rows 2-5, 17, 19 start independently. At ~1.2-2 s per request and a pool of 10 connections, the ~18 requests complete in two waves.


## 5. Implementation prompts

Each prompt is self-contained: paste it into a new session. Common rules for all of them (repeated in short inside each): clean worktree off `origin/main`; stage explicit paths only (CLAUDE.md "Committing"); no `git add -A`; `owner_user_id` = `user_profiles.id`; no fake data; user-facing copy EN + ES in `en.json`/`es.json` (insert as text, never round-trip the JSON through Python); migrations follow `supabase/migrations/TEMPLATE.sql` and are hand-applied with a `verify_NNNN.sql`; **none of the prompts below needs a schema change unless it says so**.
Before each fix, take the baselines in section 6 that it names, and paste before/after into the PR body.

### 5.1 Quick-wins bundle (all small; one prompt, two PRs because web deploys on merge and mobile needs an EAS build)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: PERF QUICK WINS (docs/perf-audit-2026-10-23.md, sections 1, 2, 4). Two PRs off a clean origin/main worktree: PR-A web (anything/apps/web), PR-B mobile
(anything/apps/mobile). Every item is small and independent; do them as separate commits. No schema changes.

CONTEXT. Production is Railway us-east4 -> Supabase sa-east-1. Each sequential DB statement is a ~170 ms round trip, so latency ~= round trips x 170 ms + 250 ms.
Baselines (24-72 h, Railway): GET /api/pets p50 1.2-1.6 s, GET /api/posts p50 2.05-2.30 s, p99 3.5-3.8 s. Cold DB connections: 4,700 DISCARD ALL in 87 days.

PR-A (web) items:
 1. Revocation cache. __create/index.ts:486-535 + utils/tokenRevocation.js: keep an in-process Map<authUserId, {cutoffMs|null, at}> with a 30 s TTL for the
    token_invalidated_at lookup (compare iat against the cached cutoff, so any token of that user is judged correctly). invalidateUserTokens() must delete the
    entry. Only cache successful reads; keep fail-open on errors. Add unit tests: cached within TTL (1 query for 2 requests), re-read after TTL, cleared by
    invalidateUserTokens, a revoked token is still rejected, an error is not cached.
 2. GET /api/pets (pets/route.js:30-37): use resolveUserId() (it reuses the identity applyIdentity already resolved) instead of a second user_profiles lookup; keep
    returning { pets: [] } when no profile exists and keep selecting the same columns (onboarding_completed etc. are not used by this handler - confirm before dropping).
 3. GET /api/posts (posts/route.js:80-168): remove the three withSavepoint wrappers around the followed-business reads ONLY after confirming read-only, on prod,
    that provider_follows, provider_posts (+media columns, 0087), provider_post_paws and provider_post_comments exist (information_schema / to_regclass; report the
    result). Keep the existing try/catch so a failure still degrades to "no business posts". Do not change the response shape.
 4. DB pool hygiene (utils/sql.js): at boot run N concurrent `select 1` (N = max) so no user request pays a cold connection; set max_lifetime to ~6 h (porsager
    option, seconds) and keep_alive; do NOT change `max` and do NOT touch ssl/prepare. Add a one-line log of boot-warm duration.
 5. PUT /api/user-profile/timezone (user-profile/timezone/route.js:37): drop the pg_timezone_names query (912 ms mean in Postgres); keep isValidTimeZone() and add
    a cached Intl.supportedValuesOf('timeZone') membership check. Existing route tests must still pass.
 6. POST /api/upload (upload/route.js:93-104): send `cache-control: max-age=31536000` (object names are UUIDs, immutable) on the Supabase storage upload. Do not
    rewrite existing objects in this PR (list them as a follow-up).

PR-B (mobile) items:
 7. Feed gating (hooks/useFeedData.js:305-306): loadingPosts must depend on the posts query only; while the lock state (owner-posted-today / today-daily-update) is
    unknown show the existing locked/neutral layout with placeholders, never a full-screen spinner. Keep the server-enforced lock (the API already redacts).
 8. Wasted launch requests: BarkModal user-profile query `enabled: visible` (BarkModal.jsx:49); Getting Started data hooks only when the card can show and
    never fetch the whole pet profile for stats.totalPosts if a lighter signal exists (useGettingStarted.js:63-82 - read the "celebrated gate" memory first and keep
    the correctness it protects); send PUT /api/user-profile/locale only when the stored value differs from the last synced one (localePreference.js:57).
 9. Stale windows: staleTime 15-30 s (not 0) for useFeedPosts, useTodayDailyUpdate, useOwnerPostedToday, usePetSocialProfile, useCareRing; refetchOnWindowFocus
    only for the feed. pet-profile.jsx:78 must not mount useFeedData (extract the two values it needs).
10. Paw/create/delete: remove invalidateQueries({queryKey:["posts"]}) from the paw mutation's onSettled (useFeedPosts.js:255-257); keep optimistic update +
    rollback in onError; remove the duplicate explicit refetches in useFeedData.js:229-233.
11. In-memory token cache in __create/fetch.ts:160 (invalidate in utils/auth/store.js setAuth, incl. logout and account switch).
12. Single shared accessibility-prefs store (hooks/useAccessibilityPrefs.js): one native read + one listener, exposed through useSyncExternalStore; same hook API.
13. Photo single tap: reduce DOUBLE_TAP_DELAY to 180 ms (PawablePhoto.jsx:9, FeedVideo.jsx:10) - flag in the PR that this is a UX decision.
14. Message button (pet-profile.jsx:122-138, messages.jsx:131-135): navigate immediately and show the pending state in /chat.
15. Resize before upload: expo-image-manipulator, max 1440 px long edge, JPEG 0.75, in the shared upload helper used by PostComposerModal and the pickers.
16. Delete the duplicate startReminderNotificationSync() in (tabs)/_layout.jsx:223; make the AsyncStorage.setItem at index.jsx:169 fire-and-forget.

EXPECTED BEHAVIOUR. No visible change except speed: same data, same lock behaviour, same copy. Identity safety: no authenticated request is ever served from a
revoked token for longer than 30 s after the revocation (document this bound in tokenRevocation.js).

DATA RULES. No schema change. owner_user_id = user_profiles.id everywhere. No fake data. No new user-facing strings (if any: EN + ES).

ACCEPTANCE (measured, paste before/after):
 - Round trips: floor of an authenticated GET 4 -> 3; GET /api/pets 7 -> 5; GET /api/posts 11 -> <= 8 (assert in each route's integration test with a counting wrapper).
 - Railway p50 after 24 h: /api/pets <= 1.1 s, /api/posts <= 1.6 s; p99 (all routes) <= 2.5 s.
 - pg_stat_statements: DISCARD ALL and the pg_type statement <= 10/day outside deploys; no pg_timezone_names calls.
 - Mobile requests at cold start (docs/mobile-launch-requests.md method): <= 14 (from 18); returning from background after 3 s fires <= 2 requests (from 5-6).
 - Feed shows posts after /api/posts resolves (not after the slowest of 3); photo tap response <= 180 ms.
 - npm test passes in both apps; npm run test:integration passes; CI green. State clearly what you could not verify on a device.
```

### 5.2 Request-pipeline PR (web; M-L)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: CUT SEQUENTIAL DATABASE ROUND TRIPS IN THE REQUEST PATH AND THE HOT ROUTES (docs/perf-audit-2026-10-23.md, sections 1-2). No schema change.

CONTEXT. Each statement is a ~170 ms Virginia<->São Paulo round trip. Measured with the project's porsager 3.4.9 at a simulated 170 ms: 4 statements awaited in series inside
sql.begin 1,039 ms vs the same in one Promise.all 520 ms; awaited identity set_config + query 694 ms vs pipelined 518 ms; a savepoint adds one round trip.
Today: floor per request = revocation check + BEGIN + identity + COMMIT (utils/requestContext.js, __create/index.ts). Hot routes: GET /api/posts (11-15 trips),
/api/discover (8), /api/pets (7), pets/[id]/care-ring GET (~15+), notifications, threads/unread-count (5).

DO:
 1. Identity cache (utils/requestIdentity.js / requestContext.js applyIdentity): in-process Map authUserId -> user_profiles.id, positive results only, 5 min TTL, cleared on account deletion. On a hit, issue
    `select set_config('app.current_user_id', $id, true)` pipelined (not awaited alone) with the handler's FIRST statement so it still executes first on the connection; on a miss keep today's single lookup+stamp statement.
    The anti-leak integration test and the "no profile => no stamp" behaviour must keep passing; add a test that a cached id never stamps another user.
 2. Provide a small helper (e.g. utils/pipeline.js) that runs independent tagged-template statements on the active request tx with Promise.all and returns their results in order; document that a failed
    statement aborts the transaction (25P02 for later ones) so it is only for reads that cannot fail on a migrated DB.
 3. Rewrite, in this order, keeping response shapes byte-identical: threads/unread-count, notifications, pets (pets+weights as one LATERAL/DISTINCT ON query), discover (profiles+moments+viewer status in one batch;
    cache the profiles ranking 60 s in process - it is public data), posts (following+suggested+business posts+viewer status in one batch, then the paws lookup; counts only for the page's ids instead of aggregating the whole
    post_paws/post_barks tables), pets/[id]/care-ring GET (derive+upsert+streak steps batched where independent).
 4. withSavepoint: remove it from reads whose migrations are verified applied on prod (list them in the PR); keep it where a failure must not abort the request.
 5. Add a counting wrapper (test helper) that asserts the number of awaited round trips per route in the integration suite so a regression fails CI.

EXPECTED BEHAVIOUR. Identical JSON, identical RLS behaviour (own-row, caregiver, blocked-user and demo-account exclusions unchanged), identical error handling.

DATA RULES. No schema change. owner_user_id = user_profiles.id. Never cache anything per-user beyond the identity map and revocation cutoff. No fake data. Parametrised SQL only (the identity value
is an integer from the DB; still bind it).

ACCEPTANCE: round trips per request: floor 3 -> 2 (cached identity); pets 3; posts <= 5; discover <= 4; unread-count 3; notifications 3. Railway p50 after 24 h: /api/pets <= 0.8 s, /api/posts <= 1.0 s, /api/discover <= 0.8 s,
/api/threads/unread-count <= 0.8 s. EXPLAIN (read-only) of the new feed query on prod shows no full-table aggregate of post_paws/post_barks. All unit + integration tests green; no new RLS test is weakened.
```

### 5.3 Mobile launch and cache (M)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: INSTANT-ON LAUNCH (docs/perf-audit-2026-10-23.md, top-10 items 4, 8 and section 4). Mobile only (anything/apps/mobile).

CONTEXT. Nothing is cached between launches: splash -> "Loading..." (waits on GET /api/pets) -> Feed spinner. There is no persister/placeholderData/prefetch (grep src). queryClient.js is the single QueryClient; setAuth clears it on identity change
(store.js:50). A past account-switch cache-bleed bug exists (memory: demo-wrong-pet-cache-bleed).

DO:
 1. Add @tanstack/query-async-storage-persister + PersistQueryClientProvider (pin versions compatible with react-query 5.72; npm 10 lockfile per memory). Persist ONLY an allowlist via dehydrateOptions.shouldDehydrateQuery:
    ["pets"], the first feed page, today-daily-update, owner-posted-today, notification badge, suggestions. Never medical/vet-record/health logs, chat, orders or addresses (AsyncStorage is unencrypted).
 2. Key the persisted cache by user id + app version (buster); delete it in setAuth on every identity change and on logout; restore as stale (it must still revalidate); max age 24 h.
 3. EntryPoint (index.jsx:108-170): if a session token and has_completed_onboarding are present and a persisted pets list exists, route to (tabs) immediately and validate pets in the background; keep today's handling of 401/403 and
    network errors (utils/auth/determinePetsRoute.js tests). Localise the "Loading..." text (EN + ES).
 4. Skeleton cards for Feed (and Health Today) instead of centred spinners; no flicker when cached data arrives.
 5. Hide cost: lock-state fallback must never reveal another owner's media (server redaction is authoritative; persisted lock state must be restored as unknown, not as unlocked).

DATA RULES. No backend change. Never persist PHI or tokens. Two-user test (A then B on one device) must show zero data from A. No fake data.

ACCEPTANCE: M7 (time to first Feed frame, release build, 5 runs median) warm relaunch <= 2.0 s and cold first-ever <= 3.0 s; M6 requests at cold start <= 12; no screen shows stale data from a previous account (jest two-user case +
simulator check); jest suite green; list what needs a device re-test.
```

### 5.4 Images (S then M; web + mobile)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: IMAGE PIPELINE (docs/perf-audit-2026-10-23.md, top-10 item 6).

CONTEXT. media bucket: 89 objects, mean 1.7 MB, median 526 KB, max 5.9 MB, served `cache-control: no-cache`. Supabase render endpoint /storage/v1/render/image/public/media/... works on this project (HTTP 200).
Uploads go through POST /api/upload (service-role relay). Feed uses expo-image without cachePolicy/placeholder/transition (PawablePhoto.jsx:99-104, PostCard.jsx:216-219).

DO: (a) client resize at upload (max 1440 px, JPEG 0.75) in the shared helper; (b) cache-control max-age=31536000 on new uploads; (c) a small url helper `imageUrl(url, {width})` that rewrites public media URLs to the render endpoint
(width 640 for feed cards, 160 for avatars, 320 for grids) and leaves non-Supabase URLs untouched; (d) expo-image `cachePolicy="memory-disk"`, `transition={150}`, a neutral placeholder, `recyclingKey` in lists; (e) migrate the ~10 RN <Image> sites;
(f) list (do not run) the one-off to re-upload existing objects with cache-control, as a runbook entry for the owner.

DATA RULES. No schema change; stored URLs stay the original public URLs (variants are derived at render time). Private bucket (medical/chat) stays signed-URL only and is never transformed or cached publicly. No fake data.

ACCEPTANCE: M9 feed bytes for 20 posts <= 150 KB per image (from ~1.7 MB mean); a second view of the same image makes no network request (verified in the proxy); transform requests succeed on the production project (report the plan/limits
you checked); feed scroll shows placeholder then image with no layout shift.
```

### 5.5 Feed virtualisation and pagination (M)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: VIRTUALISED, PAGINATED FEED (docs/perf-audit-2026-10-23.md, top-10 item 10, section 4).

CONTEXT. The Feed renders 20 posts with ScrollView + items.map (UnlockedFeed.jsx:127, LockedFeedOverlay.jsx:132-136); there is no pagination (useFeedPosts limit 20, offset 0). GET /api/posts already supports limit/offset (mergeFeed contract).
PostCard is memo'd; SuggestedDivider is defined inside render; the locked overlay passes an inline closure; each locked card runs an infinite Moti pulse.

DO: FlashList (add @shopify/flash-list pinned to the Expo 54-compatible version) + useInfiniteQuery (first page 8, then 12), estimatedItemSize from the 4:5 card, stable keyExtractor with the item_type-aware key used by mergeFeed, hoist inline
components, stable handlers, pulse only the first 2-3 locked cards, keep: Following/Suggested divider, daily-moment lock overlay, milestone cards, business (provider_post) cards, pull-to-refresh, optimistic paw.

DATA RULES. No backend change (offset/limit already exist). No fake data. The server-side daily lock stays authoritative.

ACCEPTANCE: M10 >= 55 fps average over a 10 s scroll of 40 posts (release build, iPhone); first page request returns <= 8 posts; older posts reachable; existing feed jest tests green plus new ones for page 2 and for the lock with pagination.
```

### 5.6 Aggregates and polling (M; web + mobile)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: FEWER, CHEAPER BACKGROUND REQUESTS (docs/perf-audit-2026-10-23.md, section 2 B5 and section 4).

CONTEXT. ~24 refetchInterval hooks (useProviders.js, useDMs.js, useNotifications.js); the chat unread count ran 32,364 times; iOS NativeTabs mount all five tabs so hidden tabs keep polling; Health Today fires 7 parallel reads plus a
routines hop; the badge numbers (unread, pending grants) come from separate calls.

DO: (1) GET /api/home-badges returning unread notifications, unread messages, pending care-access grants in ONE pipelined round-trip batch (reuse the existing queries, same RLS); (2) a useFocusedPolling helper so intervals run only
while the screen's tab/stack is focused and the app is active; raise intervals (chat list 15 -> 30 s, open chat 8 s stays, background tabs 0); (3) GET /api/health/today?petId= aggregating the reminder-resolver reads for Health Today, pipelined;
(4) commit reminders to the store before scheduling OS notifications, one permission check per batch (remindersStore.js:109-139, notifications.js:246,283) - keep the epoch/identity safety logic; (5) Services discover: request unlocated first, re-sort when GPS arrives.

DATA RULES. No schema change. owner_user_id = user_profiles.id; every new endpoint is session-scoped and goes through withRequestContext. No fake data. EN + ES for any copy.

ACCEPTANCE: requests per minute from an idle signed-in app on the Feed <= 2 (from ~5-6); chat unread-count calls/day down >= 70 % (pg_stat_statements deltas); Health Today first content <= 1.2 s warm; Services list visible without waiting for GPS.
```

### 5.7 Cold-start code loading and dead native weight (S-M; mobile)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: STARTUP CODE COST (docs/perf-audit-2026-10-23.md, top-10 item 10, section 4). Measure first, change second.

DO: take markBootStep deltas (__create/boot-trace.ts) and a Hermes sampling profile of a release cold start; then (1) set inlineRequires: true in the getTransformOptions wrapper (metro.config.js:207-213) and re-measure; (2) try expo-router asyncRoutes
for the heavy, rarely-first screens (HealthVetRecord 2967 lines, onboarding 1859, ServicesDiscovery 1606) if (1) is not enough; (3) remove or add to expo.autolinking.exclude the packages with zero imports (react-native-skia, expo-gl, expo-three, three,
react-native-graph, react-native-reanimated-carousel, react-native-screen-transitions, react-native-calendars, sonner-native, lodash, date-fns, expo-video, expo-sensors, expo-battery, expo-contacts, react-native-purchases-ui, @uploadcare/upload-client,
expo-store-review, @react-native-community/slider) after checking each config plugin in app.json; (4) write the boot trace once, not per step.

DATA RULES. No backend/schema change. Keep the prod-only-crash guard in mind (memory: ios-prod-only-native-crashes): every removal needs a release build test on device, not Expo Go.

ACCEPTANCE: splash-to-first-frame (boot-trace) -20 % or better, binary size reported before/after, a full release-build smoke pass (auth, onboarding, feed, health, services, push, IAP sandbox) with no new crash.
```

### 5.8 Database co-location plan (L; plan first, human-applied)

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: PLAN (do not execute) MOVING THE DATABASE TO us-east-1 (docs/perf-audit-2026-10-23.md section 3). Output: docs/db-region-move-runbook.md, a verify script, and a cutover/rollback checklist. No production change in this task.

CONTEXT. Railway has no South America region; web is us-east4 (Virginia). DB is Supabase sa-east-1 (PG 17). Supabase cannot change a project's region in place. 84 users, 19 pets; app connects only as pawpi_app through Supavisor with RLS ENABLE+FORCE;
media URLs are stored as absolute https://<ref>.supabase.co/storage/v1/object/public/media/... in rows; hand-applied objects (0126/0127 grants, 0128/0129 indexes, 0130, 0133-0135) have verify_NNNN.sql scripts.

COVER: new project in us-east-1 (same PG major); pg_dump/restore of schema+data including custom roles (pawpi_app), grants, default privileges, RLS policies, SECURITY DEFINER functions with pinned search_path, extensions (pg_stat_statements), sequences;
keep the old project as storage-only (so stored media URLs stay valid) or a URL-rewrite plan; DATABASE_URL swap on the web service and the 5 cron services (names only, never print values); Supavisor mode/port decision and pool size; write-freeze
window and its length; run every supabase/verify_*.sql and test/integration against the new DB; rollback (old project untouched for 7 days, env var revert); monitoring during cutover (Grafana pawpi_db_* , Railway p50); cost delta.

DATA RULES. Read-only against production. owner_user_id = user_profiles.id must survive byte-for-byte (row counts and FK checks per table in the verify script). No secrets in the doc.

ACCEPTANCE: a reviewer can execute the runbook step by step; expected result stated as a number: DB statement RTT ~170 ms -> <= 3 ms (measured with SELECT 1 loop from Railway), every route p50 <= 0.45 s after cutover.
```


## 6. Baseline measurements (take now, re-take after every fix)

All of these are read-only. Save each run's numbers in the PR body so every claimed improvement has a before and an after.

| # | Metric | How to measure | Baseline (2026-10-23) | Target after the quick-wins PR | Target after route work | Target after co-location |
|---|---|---|---|---|---|---|
| M1 | Server p50 / p95 per route | Railway `http-response-time` with `path` + `method` over 24 h, or Grafana `pawpi_http_request_duration_seconds` by `route` | `GET /api/pets` 1.2-1.6 s; `GET /api/posts` 2.05-2.30 s; `GET /api/discover` 1.2 s; all routes p95 2.6-2.9 s, p99 3.5-3.8 s | `/api/pets` <= 1.1 s, `/api/posts` <= 1.6 s | `/api/pets` <= 0.8 s, `/api/posts` <= 1.0 s, `/api/discover` <= 0.8 s | every route p50 <= 0.45 s |
| M2 | Sequential round trips per request | Count statements and awaits in the route (add the assertion to the route's integration test using a counting proxy over `sql`), cross-check with `pg_stat_statements` deltas on a quiet staging DB | pets 7, discover 8, posts 11 (15), unread-count 5, floor 4 | floor 3, pets 5, posts 8 | floor 2, pets 3, posts 4-5, discover 4 | unchanged (each trip ~2 ms instead of ~170 ms) |
| M3 | Fixed floor of a trivial authenticated call | `GET /api/threads/unread-count` x 20 with a demo token, median (script below) | ~1.1-1.4 s | <= 0.95 s | <= 0.8 s | <= 0.4 s |
| M4 | Cold-connection events | `pg_stat_statements` count of `DISCARD ALL` and of the `pg_type` type-fetch statement per day (take two readings 24 h apart; they cannot be reset by us) | ~4,700 each in 87 days (~54/day) | < 10/day outside deploys | unchanged | unchanged |
| M5 | Pool pressure | Peak `pg_stat_activity` count for `pawpi_app`/Supavisor; Grafana `pawpi_db_*` wait metrics | 10 of 10 busy during bursts | headroom (max raised if the pooler allows) | - | - |
| M6 | Requests at cold start (one pet, signed in) | Run the app on the simulator with the Metro network log (`docs/mobile-launch-requests.md` method), count `fetch` calls in the first 5 s | 18 after PR #616 (40 before) | <= 14 | <= 12 | - |
| M7 | Time to first usable Feed frame (cold start to feed cards painted) | Release build on a physical iPhone, screen-record at 60 fps, count frames from app-icon tap to first post card; repeat 5x, report median | not yet taken - **take first** | -20 % | <= 2.0 s with warm cache, <= 3.0 s cold | - |
| M8 | Tab switch cost (Feed -> Health -> Community -> More -> Feed) | Screen-record; time from tap to first content (not spinner) per tab, 5 runs | not yet taken | <= 300 ms for tabs already visited | <= 300 ms, first visit <= 1.2 s | - |
| M9 | Feed bytes on the wire | Proxy (Proxyman/Charles) or Railway/Cloudflare analytics: total bytes for one feed load of 20 posts | media avg 1.7 MB per image x visible cards | <= 150 KB per image | - | - |
| M10 | JS thread health while scrolling the Feed | React Native Perf Monitor / Instruments Hermes sampling: dropped frames over a 10 s scroll of 40 posts | not yet taken | no regression | >= 55 fps average | - |
| M11 | Database health (to prove we did not trade latency for load) | `pg_stat_statements` top-10 by `total_exec_time` for `pawpi_app`; `get_advisors` performance | 4 advisor groups, none urgent | no new | no new | - |

Authenticated timing script (no secrets in the repo; export a short-lived token for the demo account in your shell, never commit it):

```bash
# PAWPI_TOKEN = the Bearer JWT of a demo account (from the app's SecureStore or /api/auth/token). Do not paste it anywhere.
for p in /api/threads/unread-count /api/pets /api/notifications /api/discover; do
  echo "== $p"
  for i in $(seq 1 20); do
    curl -s -o /dev/null -H "Authorization: Bearer $PAWPI_TOKEN" -w '%{time_starttransfer}\n' "https://www.pawpi.info$p"
  done | sort -n | awk '{a[NR]=$1} END {printf "p50=%.2fs p90=%.2fs max=%.2fs\n", a[int(NR*0.5)], a[int(NR*0.9)], a[NR]}'
done
```

Pipelining experiment (reproduces the numbers in section 2.3): a 30-line Node script that puts a TCP proxy delaying each chunk by 85 ms in each direction between porsager 3.4.9 and a throwaway local Postgres
(the `@embedded-postgres` binary already in `anything/apps/web/node_modules`), then times `sql.begin` bodies with statements awaited in series vs `Promise.all`. Re-run it if porsager is upgraded.


### 6.1 The flight-cost model (2026-10-26) and REQUEST_SINGLE_FLIGHT

The 2026-10-26 re-measure showed origin time was NOT "(2 + N) x 267 ms" as first read, and PR #723's pipelining did not remove round trips in production. The corrected model, which fits every measurement:

> **latency = flights x ~133 ms** (Railway us-east4 <-> Supabase sa-east-1). A *flight* is one wait for the database.

With porsager 3.4.9 and `prepare:false` (what `sql.js` used until now):

| Statement | Flights | Why |
|---|---|---|
| `BEGIN` (`sql.begin`) | 1 | porsager awaits it alone before it runs the handler |
| statement with no parameters | 1 | Parse/Bind/Execute/Sync in one write; several of them overlap (`Promise.all` works) |
| statement with a bound parameter | **2, and they never overlap** | porsager sends Parse+Describe, WAITS for the parameter types, then sends Bind+Execute (`describeFirst`, `connection.js:238`) |
| identity stamp `set_config($1)` | 2 | it is parameterised, so "pipelined with the first statement" (#723) only moved it, it still cost two flights |
| `COMMIT` | 1 | awaited alone after the handler |

| Route | BEGIN | stamp | handler | COMMIT | flights | measured |
|---|---|---|---|---|---|---|
| unauthenticated 401 | 1 | - | - | 1 | 2 | 268 ms |
| `/api/posts/owner-posted-today` | 1 | 2 | 2 | 1 | 6 | 800 ms |
| `/api/pets` (pets + weights) | 1 | 2 | 2 + 2 | 1 | 8 | 1064 ms |
| `/api/posts` (3 reads) | 1 | 2 | 2 x 3 | 1 | 10 | 1335 ms |

The #723 integration test counted awaits in JavaScript, so against a Postgres on localhost it saw "1 flight" for `/api/pets` and could not see any of this. `test/integration/roundTrips.ts` now says so; the wire-level counter is `test/integration/delayProxy.ts` (a TCP proxy that delays each direction and counts real flights).

**Spike on production** (`railway run -s PawPi node spike.mjs`, `select 1` statements only; the pooler port in `DATABASE_URL` is **5432**, session mode):

| Scenario (port 5432) | flights |
|---|---|
| 4 parallel `select $1::int` in `sql.begin`, `prepare:false` | 10.9 |
| same, `prepare:true` | 3.9 |
| BEGIN + stamp(`$1`) + 4 reads + COMMIT written together on a reserved connection, `prepare:true` | **1.1** |
| the same, `prepare:false` | 7.9 |
| `prepare:true`, 4 + 1 clients x 20 transactions | 0 errors |
| port **6543** (transaction mode), `prepare:true`, same stress | **37 x `26000` (prepared statement does not exist)** + 6 closed connections |

So: Supavisor in session mode relays pipelined messages and serves named prepared statements; the cost was porsager's, not the pooler's. **Never point `DATABASE_URL` at 6543 with prepared statements on** (the code refuses: `preparedStatementsAllowed`).

**The fix, behind `REQUEST_SINGLE_FLIGHT` (OFF by default).** `on` / `1` / `true` / `yes` turns on:

1. `prepare:true` on the pool (not on port 6543), so a parameterised statement is one flight once prepared on that connection. The first use of each statement on each connection still costs the extra flight; the pool keeps connections for 5-7 h.
2. `withRequestContext` reserves a connection (`utils/singleFlightTx.js`), does not send `BEGIN` until the handler's first statement, and writes `BEGIN` + the identity stamp + that statement in one chunk. A request that never touches the database (a 401, a validation error) costs **0** flights.
3. Routes that pass `{ deferCommit: true }` (the five hot GETs: pets, posts, discover, owner-posted-today, unread-count) return their response without waiting for `COMMIT`'s flight, **unless** a statement that looks like a write ran (e.g. the lazy profile create), in which case `COMMIT` is awaited as before.

Expected: warm identity cache, prepared statements warm: the five hot GETs = **1 flight** (~133 ms + handler time), cache miss = 2, 401 = 0; the old path stays at 6-10.

Rollout: set `REQUEST_SINGLE_FLIGHT=on` in Railway, redeploy, re-run the section-6 timing script; roll back by removing the variable (no migration, no data change). Watch `pg_prepared_statements` per backend (statements that vary in shape, e.g. `IN (...)` lists of different length, add one entry each) and the pool's busy count (a deferred `COMMIT` holds its connection for one extra flight).

Targets after the flag is on (origin time): pets/posts/discover <= 0.35 s, a no-database 401 <= the 0.30 s floor.

## 7. What this audit did and did not do

**Did (all read-only):** read the request path, 15 hot routes and the mobile launch/tabs/lists/images code at `origin/main` 8bcbc75e; queried Railway (service config, p50-p99 latency per route, CPU/memory) and Supabase (`pg_stat_user_tables`, `pg_stat_statements`, `pg_stat_activity`,
`EXPLAIN (ANALYZE)` of the feed query, storage object sizes, performance advisors); probed the public API and one public media object with `curl`; ran a local pipelining experiment (throwaway Postgres + delay proxy, nothing near production).
The mobile half was produced by a second reviewer reading the code; the claims that rank highest (tap delay, Feed gate, `["posts"]` invalidation, per-instance accessibility calls, missing persister/`cachePolicy`, `inlineRequires: false`) were re-checked by hand against the source.

**Did not / could not:**
- No device profiling: time-to-first-frame, scroll fps, bundle size and the lucide barrel effect are **unmeasured** (M7, M8, M10 must be taken before any mobile change).
- No Grafana read: no Grafana tooling was available, so per-route p95 comes from Railway (low traffic: some routes have 1-4 buckets in 72 h; `/api/session` had none).
- The pooler port in `DATABASE_URL` (6543 transaction vs 5432 session) was not checked: the connection string was deliberately not printed. It decides whether `max` can be raised (finding 5).
- `pg_stat_statements` counts since 2026-07-28 and cannot be reset by this audit; use deltas.
- Server-side gains are modelled (`round trips x ~170 ms`); the model matches three measured routes within ~10 %, but each fix must prove itself against section 6.
- Advisor findings (46 unindexed FKs, 132 unused indexes, 930 multiple-permissive-policy findings) were counted, not triaged: with 84 users none is user-felt.
- Nothing was merged, deployed, applied or changed other than this document.
