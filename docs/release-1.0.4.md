# Release — app v1.0.4 (next EAS iOS build)

**Status: PREPARED, not submitted.** v1.0.3 (build 27) is **live** on the App Store. This file is the delta, the commands and
the device checklist for the next release; it is modelled on [`release-build-26.md`](release-build-26.md). Nothing here
submits anything for App Store review — "Submit for Review" is always a manual button in App Store Connect.

## 1. Baseline — what is live

| Item | Value | How it was determined |
|---|---|---|
| Live build | v1.0.3, EAS build 27, profile `production`, channel `production`, runtime `1.0.0` | `eas build:list` (2026-10-26): the newest FINISHED iOS build is app version 1.0.3 |
| Built from commit | **`d49b494c`** (2026-10-20, #707) | Same `eas build:list` row (`gitCommitHash`); matches the `pawpi-build27` worktree. **Confidence: high.** |
| Version in repo | `anything/apps/mobile/app.json` → `expo.version` **1.0.4** (this release) | #729 |
| Build number | Not in the repo — `eas.json` has `appVersionSource: remote` + `build.production.autoIncrement: true`; EAS assigns the next one (28 expected) | `docs/release-build-26.md` §1 |
| Runtime version | `"1.0.0"` fixed string (see §7 OTA warning) | `app.json` |

## 2. What is in 1.0.4 — the delta `d49b494c..main`

No native change: `package.json`, `package-lock.json`, `app.json` plugins / permissions / infoPlist, `eas.json` and `patches/` are
identical to build 27 apart from the version string. The new code uses only modules already in build 27 (`expo-image`,
`expo-image-manipulator`, `expo-router`).

### Mobile-affecting PRs, by risk

| Risk | PR | What | User-visible? |
|---|---|---|---|
| **Higher** | #718 | Launch + feed quick wins: Feed paints on posts (skeleton while the lock state is unknown), fewer launch requests, session kept in memory instead of a Keychain read before every request, shared accessibility-prefs store, 15–30 s query stale windows, a paw no longer refetches the feed, photo single-tap 180 ms, Message opens `/chat` immediately | Yes (speed) |
| **Higher** | #724 | Feed images cached in memory + disk, 150 ms cross-fade; moments grid moved to `expo-image` | Yes |
| **Higher** | #725 | Hidden screens stop polling; chat lists poll every 30 s (`useFocusedPolling`) | Yes (battery / data) |
| **Higher** | #726 | Feed render hygiene: memoized locked rows, hoisted divider, only the first 3 locked cards pulse | Barely |
| **Higher** | #711 | Locked feed: avatar / name / @handle open the pet profile; other pets' Daily moments grid is gated until the viewer posts (server + app) | Yes |
| **Higher** | #712 | Server redacts other owners' media from `GET /api/posts` while locked; app side null-safe | Mostly no |
| **Higher** | #715 | Discover sneak-peek tiles for locked viewers; a locked tap prompts to post (EN + ES) | Yes |
| Medium | #713 | Weekly share card uses a real daily moment; literal `{{name}}` label fixed; positive-only stats | Yes |
| Medium | #714 | Notifications and Messages are cards, not modals | Yes |
| Medium | #720 | Followed-business posts render through the business card (name + logo), never the locked pet card | Yes |
| Medium | #721 | Vet-document photos downscaled; uploads get their own 120 s deadline; a retry reuses the stored file | Yes |
| Low | #722 | Profile lock title no longer breaks on a pet name ending in an emoji | Barely |

### Server-only PRs in the same range (already live — no app build needed)

#708 (MercadoPago webhook can find and settle a payment, migration 0135), #710 (secret-rotation runbook, env docs, dead Stripe shim
removed), #717 (fewer cross-region round trips), #723 (request pipeline: cached identity stamp, pipelined reads), #727
(`REQUEST_SINGLE_FLIGHT`), plus docs #716, #728.

## 3. Live-client compatibility (build 27 against today's server) — audited 2026-10-26

The server changes above shipped before this build. Audited by reading the code at `d49b494c` and running its own jest setup with
fixture payloads shaped exactly like the new server responses (locked `/api/posts` items with `image_url`, `video_url`,
`video_thumbnail_url`, `caption` = `null` and `locked: true`; a locked video item; a business item).

**Result: build 27 does not crash and its core flows work. Cosmetic differences only.**

- Locked feed (`LockedFeedOverlay` → `PostCard locked`): `PostCard.jsx` already derives `lockedMediaUri = isVideo ? posterUri : photo`
  and falls back to a solid wash when it is empty (`useSolidFallback = reduceTransparency || !lockedMediaUri`); the caption is replaced
  by a placeholder bar while locked, so `post.caption` is never read. Fixture test passes.
- An UNLOCKED `PostCard` given a redacted post (only possible if app and server disagree about "posted today", e.g. a travelling phone)
  renders without throwing — a blank photo and no caption (`post.caption &&` guard, `photoUri` null). Low-probability, cosmetic.
- `/api/discover` tiles still carry `image_url` and `caption`; the extra `locked` / `video_thumbnail_url` / `user_id` fields are ignored.
  A tap opens the pet profile as before.
- Pet profile of ANOTHER owner's pet: server returns `posts: []` + `momentsLocked: true`; build 27 shows its normal empty state
  ("no daily posts") instead of a lock message. **Misleading copy, not a bug** — fixed in 1.0.4 (#711).
- `/api/posts/history`: only gated for pets the viewer does not own; the app only requests its own pet's history. No effect.
- Weekly digest: extra `week_moments` field is ignored.
- Business posts in a locked feed: build 27 renders them through the locked pet card (empty avatar, no name) — pre-existing, the server
  never redacted them; fixed in 1.0.4 (#720).
- 401 behaviour: unchanged by these PRs (the #698 session handling is already in build 27).
- Server note: the revocation cache (#723) means a password reset made on a *different* replica is honoured within 30 s.

## 4. Commands — run by you, from a clean checkout of `main`

```bash
git checkout main && git pull
cd anything/apps/mobile && npm ci && npm test          # all green first (CI runs the same)
eas whoami                                             # confirm you are logged in as the PawPi owner
eas build:list --platform ios --limit 3                # last build should be 1.0.3; note its number
eas build --platform ios --profile production          # builds 1.0.4; EAS auto-increments the build number
eas submit --platform ios --profile production         # uploads to App Store Connect / TestFlight ONLY
```

Notes:
- `eas.json` → `build.production.env` supplies `EXPO_PUBLIC_BASE_URL=https://www.pawpi.info` (and the other `EXPO_PUBLIC_*` URLs); a
  local `.env.local` is not part of the EAS upload. Do not run `eas build` from a branch with a localhost base URL anywhere.
- `eas submit` can sit IN_QUEUE for ~40 minutes with a frozen spinner. Poll the submission instead of re-running it.
- After upload, wait for App Store Connect's "Processing" to finish before TestFlight shows the build.

## 5. TestFlight checklist — real iPhone, EN + ES where noted

- [ ] **Cold launch on Wi-Fi and on LTE:** the Feed appears quickly (skeleton, then posts); images cross-fade in.
- [ ] **Scroll away and back** in the feed: images do not flash or reload.
- [ ] **Business post:** a business you follow shows to everyone in the feed with its name and logo (never an empty locked card).
- [ ] **Locked viewer** (account that has not posted today): other pets' moments are locked; tapping a **name / avatar opens that pet's
      profile**; tapping the photo or CTA opens the composer.
- [ ] **Discover:** sneak-peek tiles for a locked viewer; tapping one prompts to post; after posting, tiles open normally.
- [ ] **Weekly share card:** real photo, the label shows the pet's name (no `{{name}}`), no zero stats, share sheet works and
      **Save to Photos** works.
- [ ] **Notifications and Messages open as cards**; back button and swipe-back both return correctly; the **More tab opens its
      landing page**.
- [ ] **Large vet-document photo** (full-size camera photo) uploads and appears.
- [ ] **Paw and un-paw** counts update correctly and the feed does not jump.
- [ ] **Sign-in:** email, Apple and Google.
- [ ] **Force-quit and reopen** stays signed in.
- [ ] **Airplane mode at launch** shows "We couldn't reach PawPi", not Welcome.
- [ ] **MOST IMPORTANT — log out, then log in as a DIFFERENT account:** nothing of the first account anywhere (feed, pets, profile,
      reminders, Messages, notifications badge, Discover, share card). #718 keeps the session in memory — check this explicitly.
- [ ] **Reminders fire once** (no double alerts).
- [ ] **Spanish device:** the camera permission prompt is in Spanish.
- [ ] **Settings footer** reads `v1.0.4 (N)` with N = the build number EAS assigned.
- [ ] (If telemetry is ON) Grafana shows events for `app_version="1.0.4"` within a few minutes of a cold launch.

## 6. Before pressing Submit for Review

1. TestFlight build installed and the checklist above done on a real iPhone.
2. Paste the text from [`app-store-whats-new-1.0.4.md`](app-store-whats-new-1.0.4.md) (EN + ES); delete any bullet that failed on device.
3. Attach the processed build to the 1.0.4 version page, confirm Privacy Policy URL `https://www.pawpi.info/privacy`, export
   compliance "No", then Submit for Review. Privacy declaration: **no change**.

## 7. Rollback

- **Bad TestFlight build:** do not submit it. Fix on `main`, then run the build commands again (a new build number is assigned).
- **Bad build already in review:** in App Store Connect remove it from the version and re-attach build N-1 (build 27, v1.0.3), or
  expedite a fix as 1.0.5. If it is already live, expedite a fix; build 27 can be re-promoted from App Store Connect.
- **OTA (EAS Update) only for tiny JS-only hotfixes.** `runtimeVersion` is the fixed string `"1.0.0"`, so an update published to the
  `production` channel is eligible for **every** installed build (21, 24, 26, 27, 28…), not just the newest. `eas update` does not
  apply `build.production.env`: the update would bake whatever `EXPO_PUBLIC_*` values the publishing shell has (a stray `.env.local`
  pointing at localhost would break every device). Prefer the App Store path.
- **Server flags (Railway variables — do not change them from this doc):**
  - `TELEMETRY_INGEST_ENABLED=false` — kills client telemetry ingest.
  - `NOTIF_V2_ENABLED` — **ON in production** (since build 26 rollout); `false` returns push to the previous behaviour.
  - `REQUEST_SINGLE_FLIGHT` — **ON in production now.** Set it to `false` (and redeploy) to return the API to one round trip per
    query; use that first if latency or odd 5xx on `/api/posts`, `/api/discover`, `/api/pets` appears after the release.
- The server half of 1.0.4 is already live and backward compatible with build 27 (§3), so rolling the app back does not need a
  server rollback.

## 8. Build record

| Item | Value |
|---|---|
| Version / EAS iOS build number | **1.0.4 / 30** |
| EAS build | `66caf988-1657-4f7d-a8c4-b6664b4c200c` — https://expo.dev/accounts/augusto-firulais/projects/pawpi/builds/66caf988-1657-4f7d-a8c4-b6664b4c200c |
| Built from commit | `280fc814` (main after #729 + #730), profile `production`, channel `production`, runtime `1.0.0` |
| Built | 2026-10-27 (EAS build finished 12:50 UTC) |
| EAS submission | `c244403c-5fbf-4f05-ba9a-f0199e7b1568` — uploaded to App Store Connect / TestFlight on 2026-10-28 (upload only; **not** submitted for review) |
| Next step | Wait for Apple's processing email, install from TestFlight, run §5, then paste the What's New and Submit for Review manually |

Build 30 is the one to test; any earlier 1.0.4 build numbers (28, 29) are not used.
