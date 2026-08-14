# Night-run log — 2026-07-29

Fast, timestamped, one-line-per-merge scan for Augusto. Full detail lives in each PR and in
`docs/roadmap.md` / `PawPi_instructions.md`'s status block (updated in step). Ticket briefs:
`docs/phase2-tickets/N1-N10`; run preamble: `docs/night-run-2026-07-29.md`.

---

## Wave 2 — Pet Owner engagement: Household & Retention (E11–E15) — autonomous run 2026-08-14

Design of record: `docs/pet-owner-engagement.md` "WAVE 2" section. Each unit its own PR, CI-green + merge
+ deploy + log before the next. Recommended defaults taken per the driver prompt (logged per unit).

- **2026-08-14 — E11 "Rex's Week" weekly digest** — [#391](https://github.com/augustotraversa98-dot/PawPi/pull/391)
  MERGED (merge commit, branch deleted), CI-green (mobile jest / web vitest / integration all pass).
  - **What shipped:** `GET /api/pets/[id]/weekly-digest` (real owner-tz Mon–Sun stats: walks, ring days
    x/7, care actions, moments, best moment = most-pawed daily post, friends strip = accepted-friend pets
    that posted this week, milestone ≤7d; server owns honest `state` rich|quiet|empty). `GET/PUT
    /api/engagement/weekly-digest-prefs` (server-side push/email toggles). `POST
    /api/engagement/weekly-digest/run` (`CRON_SECRET`-gated Sunday-evening sender; DEFINER
    `app_weekly_digest_due` enumeration; claim-then-send idempotency; push + optional email). Mobile "Rex's
    Week" screen + `useWeeklyDigest` hooks + `weekly_digest` notification mapper/deep-link. EN+ES throughout.
  - **Migration 0100** (weekly_digest_prefs + weekly_digest_state own-row RLS, notifications_type_check +=
    'weekly_digest', app_weekly_digest_due DEFINER) + `verify_0100.sql`. **⚠️ awaits hand-apply to
    Supabase** (this env can't apply DDL); routes degrade cleanly while absent (42P01/42883 → feature
    absent, never 500) so Railway stays healthy.
  - **Decisions (recommended defaults taken):** weekly cadence Sunday evening owner-tz; push default ON /
    email default OFF; reused idempotency-state row (weekly_digest_state) per (pet, week); quiet/empty week
    degrades honestly (no fake numbers). **Deviation from spec:** E5's toggles are client-only (AsyncStorage),
    but a server-side sender can't read them, so the weekly-digest channel prefs are a NEW server-side table
    (weekly_digest_prefs) rather than "reuse E5 toggles" — logged; E5's send-time/caps concept is honoured by
    the tz-aware Sunday-evening gate. Server has no per-user locale column, so the EMAIL defaults to the app's
    es-AR fallback (both EN+ES live in the copy module); the PUSH body is JSON localized client-side.
  - **Gates:** web vitest 1924→**1942** (+18), integration 932→**948** (+16), mobile jest ~1809→**1816**.

- **2026-08-14 — E12 comeback / re-engagement loop** — [#392](https://github.com/augustotraversa98-dot/PawPi/pull/392)
  MERGED (merge commit, branch deleted), CI-green.
  - **What shipped:** `GET/POST /api/pets/[id]/reengagement` (lapse status = no ring activity for N owner-tz
    days, default 7, `?n` override; welcome-back payload = friends' REAL recent moments + next milestone +
    pack/streak status + repair availability; POST opt_out / repair / seen). `POST
    /api/engagement/reengagement/run` (`CRON_SECRET` win-back sender; DEFINER `app_reengagement_due`
    enumerates lapsed+due pets with real hook signals; claim-then-send cap guard = at most one per cap
    window; warm push `winback` + email preferred). Mobile "Welcome back" screen + `useReengagement` hooks +
    `winback` notif mapper/deep-link. EN+ES; no-shame grep test.
  - **Migration 0101** (reengagement_state own-row RLS; notifications_type_check += 'winback';
    `app_reengagement_due(timestamptz,int,int,int)` DEFINER; `app_winback_repair_streak(int,int,int)` DEFINER
    = E2 repair with a configurable grace window) + `verify_0101.sql`. **⚠️ awaits hand-apply**; routes
    degrade clean (42P01/42883) so Railway stays healthy.
  - **Decisions (recommended defaults taken):** lapsed threshold 7 days; win-back prefers email + at most one
    gentle in-app push; real hooks only (milestone > friend > memory fallback, never fabricated); returning-user
    repair grace window 14 days (kept free, v1). Cross-owner friend-activity + milestone signals computed in
    the DEFINER enumerator (owner RLS hides other pets). Reused E11's `upcomingMilestone` (same [id] dir) in the
    GET route; inlined the milestone math in the cron to avoid a cross-`[id]`-dir import.
  - **Gates:** web vitest 1942→**1954** (+12), integration 948→**958** (+10), mobile jest green (+E12 suites).

- **2026-07-29 00:19** — Prereq: password reset flow (migration 0069) merged — [#261](https://github.com/augustotraversa98-dot/PawPi/pull/261) (predates tonight's queue, landed first to bring `main` current).
- **2026-07-29 00:19** — Prereq: support-contact domain fix (augusto@pawpi.info) merged — [#262](https://github.com/augustotraversa98-dot/PawPi/pull/262).
- **2026-07-29 00:20** — Prereq: demo accounts renamed to pawpi.info — [#263](https://github.com/augustotraversa98-dot/PawPi/pull/263).
- **2026-07-29 03:53** — N2 (retire PATCH /api/pets repair handler) merged — [#266](https://github.com/augustotraversa98-dot/PawPi/pull/266). Docs-only: the actual code removal had already landed via an earlier PR #225; this closed the paper trail (FLAGGED item → FIXED).
- **2026-07-29 03:53** — N9 (docs hygiene sweep) merged — [#264](https://github.com/augustotraversa98-dot/PawPi/pull/264). Only 1 of 3 items needed a change (guideline-1.2-audit.md superseded banner); the other two were already resolved by #263.
- **2026-07-29 03:58** — N5 (payments go-live hardening + setup checklist) merged — [#268](https://github.com/augustotraversa98-dot/PawPi/pull/268).
- **2026-07-29 04:07** — N1 (address autofill on shared location picker) merged — [#270](https://github.com/augustotraversa98-dot/PawPi/pull/270). Needs a device pass (jest mocks expo-location) — see `docs/test-backlog.md`.
- **2026-07-29 04:08** — N7 (support page live + pawpi.info DNS gap documented) merged — [#265](https://github.com/augustotraversa98-dot/PawPi/pull/265). Support URL is live at the github.io URL; pawpi.info itself still needs Tats' one.com DNS action — see FLAGGED #5 in `docs/app-store-readiness.md`.
- **2026-07-29 04:08** — N6 (Apple Sign-in client-secret JWT automation) merged — [#271](https://github.com/augustotraversa98-dot/PawPi/pull/271).
- **2026-07-29 04:15** — N3 (adoption screen restyled to Liquid Glass) merged — [#269](https://github.com/augustotraversa98-dot/PawPi/pull/269). Structural parity confirmed (testID/useState/onPress/etc. counts unchanged).
- **2026-07-29 04:44** — N4 (medical profile sex/gender selector fix) merged — [#267](https://github.com/augustotraversa98-dot/PawPi/pull/267). Note: this PR's conflicts were resolved and pushed earlier but the actual merge call was missed until caught during N8 — see that entry below. Also found (not fixed, flagged): the Save button on this same screen is a pre-existing no-op from the 2.77 restyle (prop-name mismatch) — spawned as a separate follow-up task.
- **2026-07-29 05:11** — N8 (iOS Simulator self-verify pass) merged — [#272](https://github.com/augustotraversa98-dot/PawPi/pull/272). Confirmed the app boots + round-trips real backend data; fixed a stale dev-env LAN IP along the way. Caught and fixed the missed N4 merge above. Simulator tap-injection was unreliable for a stretch, so most of the historical `2.x` device-test backlog was left untouched rather than false-positived — documented honestly in `docs/test-backlog.md`.
- **2026-07-29 ~05:15** — N10 (widget PR #187 rebase) — **not merged, by design.** Rebased the ~40-day-stale branch cleanly onto `main` (2 conflicts resolved, zero reverted work, mobile jest 156/156 green). Confirmed `expo prebuild` generates both the app and widget Xcode targets. Left **open as an updated draft** — this PR is explicitly gated on Tats' Apple Developer account setup + on-device acceptance pass (see `docs/native-widgets.md`); tonight's job was just to un-stick it from staleness, not to merge it.

---

# Night-run log — 2026-08-11 (Wave 10, tickets 2.88–2.92)

Preamble: `docs/night-run-2026-08-11.md`. Continues the Shop/Store + business-social work. One line per merge.

- **2026-08-11 (2.88)** — provider-post open route fix merged — [#339](https://github.com/augustotraversa98-dot/PawPi/pull/339). Root cause: the storefront post card passed the whole post (signed image URLs with `?`/`&`/`%`) as a `router.push` param, corrupting the deep-link URL so expo-router fell back to the `/service` root ("screen doesn't exist"). Fix: navigate with only `providerId`+`postId`; hand the rich post off in memory (`utils/providerPostHandoff.js`). Mobile jest 1562→1565 (+3 regression tests). No migration.
- **2026-08-11 (2.89)** — grouped offering picker merged — [#340](https://github.com/augustotraversa98-dot/PawPi/pull/340). The dashboard nav was already capability-driven + grouped (#327/#328); the remaining flat list was the Business-Profile offering picker (and onboarding form). Added shared `provider/lib/capabilityGroups.js` (presentation-only taxonomy over the EXISTING keys — Veterinary & Health / Walking & Sitting / Training / Store / Adoption / Other); both pickers now render grouped sections. No capability key created/renamed/removed (`capabilities.js` untouched). web vitest 1764→1770. No migration.
- **2026-08-11 (2.90)** — Products enable clarity merged — [#341](https://github.com/augustotraversa98-dot/PawPi/pull/341). A store-less business hit the API's jargon 403 ("Provider does not have the 'shop' capability") on the Products page. Replaced with a friendly explainer + one "Enable Products" button that flips the SAME `shop` offering the profile controls (`useAddCapability`, reused) and lands on add-a-product; enabled-empty shows the inviting add-first state. Header Shop→Products. No user-facing jargon (grep-checked). web vitest 1770→1773. No migration.
- **2026-08-11 (2.91)** — adoption end-to-end fix merged — [#342](https://github.com/augustotraversa98-dot/PawPi/pull/342). Root causes: (a/b/c) the provider editor only edited MEDIA — no way to edit/see the name/breed/fee/story a shelter wrote; (d) the public browse (`/api/adoption/listings`) dropped any shelter without a map pin whenever the owner shared location (the geo bounding box required coords). Fixes: the per-listing action is now a full **Edit** modal prefilling every field + media (saves via the existing `useUpdateAdoptableListing` PATCH — backend already COALESCEd all fields); the browse now includes coordless shelters (distance unknown → sorted last) while still radius-filtering located ones. Mobile browse/detail already rendered real data (unchanged). Integration test proves a pin-less shelter surfaces. No migration, no RLS change.
- **2026-08-11 (2.92)** — follow a business merged — [#343](https://github.com/augustotraversa98-dot/PawPi/pull/343). Pet owners can FOLLOW a provider (mirrors pet_follows): **migration 0083** `provider_follows` (ENABLE+FORCE RLS — any-authed read, own-row write; passes the R2g completeness guard; PENDING hand-apply, flagged in test-backlog ACTION 1). API `GET/POST/DELETE /api/providers/[id]/follow` + `GET /api/providers/following`; mobile `ProviderFollowButton` (optimistic, guest→sign-in, follower count) on the provider screen + a "Businesses you follow" list off the More hub; EN+ES. **Degrades cleanly pre-migration** (catches undefined_table 42P01 → not following / 0 followers). All routes tested through the REAL router by URL (no `/providers/following` shadowing). web vitest 1773→1777 · integration +8 · mobile jest 1565→1570.

---

# Night-run log — 2026-08-12 (Wave 11, tickets 2.97 / 2.96 / 2.94 / 2.98 / 2.99)

Preamble: `docs/night-run-2026-08-12.md`. Adoption-on-profile + nav cleanup + business-post paws + the two activation checklists. One line per merge.

- **2026-08-12 (2.97)** — Adoption tab on the business storefront merged — [#PENDING]. A business with the `adoption` capability + ≥1 available listing now shows an **Adoption** tab on its mobile storefront (`getStorefrontTabs`, presence-aware, right after Services; i18n `storefront.tabs.adoption` EN "Adoption"/ES "Adopción"). The tab reuses the SAME browse card + detail/apply modal — extracted verbatim into a shared `components/adoption/AdoptionListingViews.jsx` now imported by BOTH `service/adoption.jsx` and `service/provider.jsx` (one implementation, no parallel design). Data via the existing `GET /api/adoption/listings?provider_id=` (`useAdoptableBrowse` gained an `enabled` gate so only shelters make the call). No migration, no web/API change. Mobile jest 1583→1592 (+9: 4 tab-resolver + 3 provider-screen + shared-module reuse proven in both suites).
- **2026-08-12 (2.96)** — remove the "Show all sections" nav escape hatch merged — [#PENDING]. The provider dashboard left nav (`ProviderShell.jsx` `Sidebar`) no longer lets you reveal unselected offerings: deleted the `showAll` state, the toggle button block, and the `showAll` param/branch in `navItemVisible`. A capability-gated section now shows ONLY when the business holds its offering (driven by the Business-Profile selections, already reactive); structural sections (Dashboard/Chats/Storefront/Profile/Staff/Sales) always show; the active section is still never hidden (deep-link safety unchanged). No migration/API/copy change. `ProviderShell.test.jsx` updated: an unselected offering is absent + there is NO "Show all sections" control; selecting the offering makes it appear; structural sections always render. web vitest 1786 green.
- **2026-08-12 (2.94)** — Paws (likes) on business posts merged — [#PENDING]. **Migration 0085** `provider_post_paws` (post_id → provider_posts, user_id → user_profiles, unique(post_id,user_id); ENABLE+FORCE RLS — any-authed read, own-row write; passes the R2g completeness guard; PENDING hand-apply, flagged in test-backlog ACTION 1). A signed-in owner paws a business post via a tap on the paw control OR a double-tap on the image (reuses the pet-feed `PawablePhoto` + brand-color pop from 2.64); optimistic toggle, guest → sign-in. New API `POST/DELETE /api/providers/[id]/posts/[postId]/paw` (static "paw" segment, no shadowing) + the single-post GET now returns `paw_count` + `is_pawed`; the public-profile `pawsCount` stat (already written in 2.93) lights up automatically once the table exists. **Degrades cleanly pre-migration** (every paw query catches undefined_table 42P01 → 0 paws / not-pawed / no-op; never a 500 — proven in a mocked unit test). New mobile `useProviderPostPaw` (query + optimistic toggle). web vitest 1786→1794 · integration +9 (paw/unpaw/count/guest/RLS/stats) · mobile jest 1592→1599. **PR body leads with the migration SQL block for Tats.**
- **2026-08-12 (2.98)** — Pet-owner activation checklist merged — [#PENDING]. A persistent **"Getting started"** card at the top of the Home tab with a % badge + progress bar; every item's done/undone is **derived** from existing data (no new table, no stored flag): add basics (name+breed), complete history (breed + age + real gender + weight), first reminder (`/api/routines` non-empty), first meal (food-logs non-empty), first post (pet-profile `stats.totalPosts`), turn on notifications (OS permission). `%` = completed ÷ 6; the card retires at 100% after a brief paw celebration (once, persisted). Each row taps through to the screen that completes it (profile-edit / reminders / health / composer / permission prompt). **Daily-return habit:** on enabling notifications, schedules a recurring **daily** local reminder exactly once (idempotent via a persisted id, guarded on permission — never double-schedules). New `utils/gettingStarted.js` (pure derivations), `hooks/useGettingStarted.js`, `components/Home/GettingStartedCard.jsx`, + `ensureDailyReturnReminder`/`getNotificationPermissionGranted` in `utils/notifications.js`. EN+ES neutral "tú". No migration, no web change. mobile jest 1599→1620 (+21: derivations, % math, card hides at 100%, permission item, daily-reminder-once).
- **2026-08-12 (2.99)** — Business activation checklist merged — [#PENDING]. The web mirror of 2.98: a persistent **"Getting started"** card at the top of the provider dashboard (`ProviderDashboard.jsx`) with a % badge + progress bar. Five items, each **derived** from existing provider reads (no new table/endpoint): complete profile (logo + bio), add what you offer (≥1 service OR product), set hours (≥1 availability window), add a location, share first post. Reuses the existing hooks (`useProvider`/`useProviderServices`/`useShopProducts`/`useAvailabilityWindows`/`useProviderLocations`/`useProviderPosts`); products query gated on the `shop` capability. Each row navigates to the screen that completes it (Profile/Services/Locations/Storefront). `%` = completed ÷ 5; retires at 100% after a brief success state (localStorage-remembered per provider). On-brand coral/cream, English-only (web). New `provider/lib/activation.js` (pure) + `provider/components/GettingStartedChecklist.jsx`. No migration. web vitest 1794→1805 (+11: derivations, % math, card hides at 100%, nav).

---

# Night-run log — 2026-08-13 (Pet Owner engagement wave, units E0–E4)

Preamble: `docs/pet-owner-engagement.md`. Sequential retention build: E0 foundations → E1 Care Ring →
E2 streak → E3 milestones → E4 share cards. Celebrate the dog, never shame the owner; forgiveness on
day one; no fake data. One line per merge.

- **2026-08-13 (E0)** — Data foundations merged — [#378](https://github.com/augustotraversa98-dot/PawPi/pull/378). **Migration 0094** (`pet_care_days`,
  `pet_streaks`, `user_profiles.timezone`; ENABLE+FORCE own-row RLS, `pawpi_app`). The gotcha/adoption
  day reuses the existing `pets.adoption_date` (already synced Dog Profile ↔ Medical Profile — no new
  column). `verify_0094.sql`; RLS proven in `engagement-foundations-rls.integration.test.ts` (+9
  integration). No mobile/web-app code change. **0094 ✅ APPLIED + verified on Supabase 2026-08-13.**
- **2026-08-13 (E1)** — Care Ring merged — [#379](https://github.com/augustotraversa98-dot/PawPi/pull/379). **NO migration** (visualization over existing
  walk/moment/care logs; reuses E0's `pet_care_days`/`pet_streaks`). New owner-scoped route
  `GET/POST /api/pets/[id]/care-ring`: derives the three segments for the **owner-tz day**
  (`(ts AT TIME ZONE tz)::date`, tz = `COALESCE(user_profiles.timezone,'America/Buenos_Aires')`),
  upserts the derived state into `pet_care_days`, and writes rest-day (`pet_care_days.rest_day`) +
  pause (`pet_streaks.paused_until`). Degrades cleanly pre-0094 (savepoint + 42P01 → derived-only).
  Mobile: `CareRing` (react-native-svg 3-arc ring, RN-Animated closing pop + guarded expo-haptics),
  `CareRingCard` on Health→Today (status copy that celebrates the dog / never shames, tappable segment
  deep-links, rest-day toggle + pause-until date), and a live ring around the owner's own pet-profile
  avatar; `useCareRing`/`useSetRestDay`/`useSetPause`; walk/moment/care log mutations invalidate
  `["care-ring", petId]` so a segment fills without reload. EN+ES. Gates: integration 872→893 (+21
  incl. E0), web vitest 1920 (unchanged), mobile jest 1721→1735 (+14 careRing util).
- **2026-08-13 (E2)** — Streak + forgiveness merged — [#380](https://github.com/augustotraversa98-dot/PawPi/pull/380). **Migration 0095** (`pet_streaks`
  += `pre_reset_count`/`reset_at`/`last_award_count`; `app_advance_care_streak` /
  `app_repair_care_streak` SECURITY DEFINER helpers — the single source of truth for the streak math,
  granted to pawpi_app). The ring route advances the streak when the ring closes (idempotent; a gap of
  missed **non-excused** days auto-consumes banked freezes; only a wider gap resets to 1, remembering
  the run; **rest/pause is never a miss**; milestones 7/30/100 bank a freeze, capped 2) and exposes a
  one-tap `repair_streak` (~48h window). Degrades cleanly pre-0095 (42P01/42883 → ring without a
  streak). Mobile: 🔥 `StreakChip` on the pet-profile + feed header (renders nothing at 0), a "streak
  is safe" line + "Restore your streak" CTA on the ring card; `useRepairStreak`. EN+ES. Gates:
  integration 893→901 (+8 forgiveness matrix), web vitest 1920 (unchanged), mobile jest 1735→1738 (+3).
- **2026-08-13 (E3)** — Milestone moments merged — [#381](https://github.com/augustotraversa98-dot/PawPi/pull/381). **NO migration** (reuses `pets.birthday`
  + `pets.adoption_date`). `feedDelight.js` gains `getMilestone` (type: birthday|gotcha + years) and
  `getUpcomingMilestone` (3-day countdown, strictly future). On a milestone day a daily moment gets an
  animated `MilestoneRibbon` + one-shot `Confetti` (RN Animated, jest-safe) + a "Share this 🎉" CTA
  (labeled `DailyShareButton`, stubs to the 2.62 share frame until E4). New owner-scoped
  `GET /api/feed/milestones?viewerPetId=&day=` returns followed pets whose birthday/gotcha falls today
  (+ `today_post_id` to wire paw/bark) → `FollowedMilestones`/`MilestoneEventCard` injected atop the
  home feed (tap → profile, "Send a paw" on the pet's moment). A `MilestoneCountdownBanner` on the
  pet-profile shows only in the 3-day window (feeds E5). Profile route now also returns `adoption_date`.
  EN+ES. Real dates only — nothing renders without a matching date. Gates: integration 901→906 (+5),
  web vitest 1920 (unchanged), mobile jest 1738→1746 (+8).
- **2026-08-13 (E4)** — Share cards deck merged — [#382](https://github.com/augustotraversa98-dot/PawPi/pull/382). **NO migration** (reads existing
  walk/moment logs + E0/E2 `pet_streaks`). New owner-scoped `GET /api/pets/[id]/share-stats?day=`
  returns REAL stats — streak (from `pet_streaks`, degrade-clean), walks in the last 7 owner-tz days,
  total daily moments; a non-owned pet 404s and another owner's logs never leak. Mobile:
  `ShareableStatCard` (story-sized 9:16 captured at **1080×1920**, PawPi-branded, carries **@handle + a
  handle-only deep link — never location**) + `ShareCardButton` reusing the 2.62 `react-native-view-shot`
  + `expo-sharing` capture path (load-gated, timeout, graceful no-op); `ShareCardDeck` modal lists the
  templates built from real stats (milestone / week-in-walks / streak / pet-of-the-day) with a clean
  empty state when a stat is 0 (no fake number), plus an **empty-safe monthly care-recap STUB** (depends
  on E10). Opened from a "Share a card" button on the owner's own pet-profile. EN+ES. Gates: integration
  906→910 (+4), web vitest 1920 (unchanged), mobile jest 1746→1752 (+6). **Pet Owner engagement wave
  E0–E4 COMPLETE.**
- **2026-08-14 (E5)** — Notification rewrite merged — #384. **NO migration** (client-side policy;
  toggles in AsyncStorage, streak-save is a local evening notification, send time from app-open history).
  Rebuilt around WANTED triggers only: `notificationPolicy.js` (pure — the exact at-risk streak-save
  condition [ring exactly one segment from close AND streak>0 AND not closed AND not rest/paused AND
  not-already-sent-today], global daily cap, personalized send hour), `notificationPreferences.js`
  (per-category toggles + per-day send log + rolling open-hour history), `engagementNotifications.js`
  (positive EN+ES copy builders + guarded `maybeScheduleStreakSave` wired into `CareRingCard`). Removed
  guilt/chore copy: reframed `notificationGenerator.js` (no "overdue"/"is due now") + the daily-return
  fallback. Settings → Notifications replaced 3 dead hardcoded switches with real persisted per-category
  toggles (Social / Milestones / Streak / Care). Warm friend-based dormant re-engagement copy ("Bella
  misses Rex", never "you haven't opened"). A no-guilt grep test scans EN+ES copy. Gates: mobile jest
  1752→1782 (+30); web vitest + integration unchanged (mobile-only).
- **2026-08-14 (E6)** — Onboarding D1 polish merged — #385. **Migration 0096** (welcome paw; ✅ APPLIED + verified on Supabase
  2026-08-14, verify_0096.sql all PASS). The first session now ends with the Care Ring STARTED: after the first
  daily moment is posted, `POST /api/onboarding/welcome` (a) seeds the day-1 streak (pet_streaks
  current_count=1, ON CONFLICT DO NOTHING so a real streak is never overwritten) and (b) grants the ONE
  allowed, honest, LABELLED seeded interaction — a first paw from the official "PawPi Welcome" account.
  The account is created LAZILY by the `app_welcome_account` DEFINER helper (NOT a migration-time seed
  INSERT — that would collide with the integration harness's explicit-id seeding in the first test),
  and `app_welcome_paw` DEFINER inserts the paw (post_paws' write policy only lets the actor paw) + a
  labelled `welcome` notification (notifications_type_check widened). Endpoint is idempotent and
  degrades cleanly pre-migration (42883/42P01 -> welcomed:false, never a 500). Onboarding now captures
  BOTH birthday AND gotcha/adoption day inline (both optional, two DateFields -- was either/or); the
  success screen shows "Day 1 -- {dog}'s care ring has begun" + "PawPi Welcome sent {dog} a paw", or a
  ring-start nudge ("Take {dog}'s first photo to close today's ring") when no moment was posted. No
  medical/health fields forced at signup. EN+ES (new onboarding.* keys). Gates: mobile jest 1782->1786
  (+4), web integration 910->915 (+5), web vitest 1920 (unchanged).
- **2026-08-14 (E7)** — Pack / shared streaks merged — #386. **Migration 0097** (✅ APPLIED + verified on Supabase 2026-08-14,
  verify_0097.sql all PASS). New `pet_pack_streaks` (requester/receiver user+pet, status pending/active/ended,
  current/longest count, last_active_day; unordered-pair unique index; participant-scoped ENABLE+FORCE
  RLS) + 5 SECURITY DEFINER helpers — every action crosses the owner boundary (pets + pet_care_days are
  owner-scoped, so a caller can't read a friend's pet, see their ring, or notify them): app_request_
  pack_streak (opt-in by partner @handle), app_accept_pack_streak, app_advance_pack_streaks (called on
  ring close — advances only when BOTH pets closed the same owner-tz day; idempotent; gap restarts at
  1), app_pack_boop (rate-limited once/pack/actor/day, only if the friend hasn't closed), app_pack_
  streaks_for_pet (reader w/ partner display + boop_available; needs `#variable_conflict use_column`
  because the RETURNS TABLE out-cols shadow the joined tables' id/status/etc.). notifications_type_check
  widened (pack_invite/pack_accepted/boop). `GET/POST /api/pets/[id]/pack-streaks`; the pack advance is
  wired into the care-ring close in its OWN savepoint so a pre-migration absence never degrades the
  personal streak. Consumers degrade clean (list->empty, actions->503). Mobile: usePackStreaks hooks +
  PackStreaksCard on Health->Today (flame+count, boop, accept invite, start by @handle; break copy shows
  the best run, never blames). Notifications screen localizes the new welcome/pack/boop types (EN+ES).
  Opt-in only. Gates: mobile jest 1786->1791 (+5), web integration 915->919 (+4), web vitest 1920.
- **2026-08-14 (E8)** — Leaderboards (density-gated) merged — #387. **Migration 0098** (✅ APPLIED + verified on Supabase
  2026-08-14, verify_0098.sql all PASS). Weekly care-effort leagues. XP = walks*10 + ring-closes*15 +
  care-actions*5 + paws-GIVEN*2 over the owner-tz week (paws RECEIVED / likes never count) via
  `app_pet_week_xp` DEFINER; `app_leaderboard` DEFINER builds the cohort per flavor (friends /
  breed / neighborhood), scores + ranks it, and returns NOTHING below the min cohort size so the
  route falls back to the friends board (never empty/fake) — DEFINER because ranking must read other
  owners' logs. Coarse OPT-IN geo added additively to pets (`lb_opt_in`/`lb_area`; never lat/lng);
  new `pet_leaderboard_weeks` (own-row ENABLE+FORCE RLS) snapshots each week so promotion/relegation
  movement (bronze<silver<gold, top/mid/bottom third) is real vs the prior week. `GET/POST /api/pets/
  [id]/leaderboard`; the reader needs `#variable_conflict use_column` and `drop table if exists
  _cohort` (re-callable within one tx — the route may call it twice: requested flavor then friends
  fallback). Degrades clean pre-migration (empty-safe board / opt-in 503). Mobile: useLeaderboard +
  LeaderboardCard on Health->Today (flavor tabs, tier badge + movement, gated fallback note,
  neighborhood coarse-area opt-in). EN+ES. Gates: mobile jest 1791->1793 (+2), web integration
  919->924 (+5), web vitest 1920.
- **2026-08-14 (E9)** — Comparative health insight merged — #388. **Migration 0099** (✅ APPLIED + verified on Supabase
  2026-08-14, verify_0099.sql all PASS). A positive, behavioral activity reward after logging. v1 defaults to
  the dog's OWN history: this week's walk count vs the prior 3 weeks → best-week-in-a-month /
  more-than-last-week / keep-going / gentle forward nudge. A breed+age COHORT win ("more active than
  X% of {breed}s his age") only renders when the pet is ABOVE median AND the cohort is >= min size, via
  `app_activity_cohort` DEFINER (owner-scoped RLS forbids reading peers' logs; the aggregate is
  same-breed + age±1yr weekly walk counts). The positive-only rule is ENFORCED in a pure,
  server-authoritative `decideInsight` (logic.js) — no bare-negative kind can ever be returned; below
  median falls through to personal/nudge. `GET /api/pets/[id]/activity-insight`; disclaimer always
  present (behavioral, never diagnostic); degrades clean pre-migration (cohort branch drops, personal
  history still renders). Mobile: useActivityInsight + ActivityInsightCard on Health->Today (maps the
  server `kind` to positive EN+ES copy; a no-negative grep test guards the strings). Gates: mobile jest
  1793->1805 (+12), web vitest 1920->1924 (+4), web integration 924->928 (+4).
- **2026-08-14 (E10)** — Health-update reinforcement merged — #389. **NO migration** (reads/writes
  existing tables). Three positive payoff loops: (1) one-tap "all good" on the Care Ring — writes a
  REAL health_wellness_logs general log (in the care-ring derivation), closing the Care segment in a
  single tap; (2) Vet-Summary readiness — new `GET /api/pets/[id]/vet-summary-readiness` counts REAL
  records across weight / meds / photo-checks / vet-visits (each in its own savepoint so a missing
  table degrades to 0, never 500), returns filled/total/percent + a positive level (start/building/
  great); 0 records → honest low state, never shames gaps; (3) monthly care recap — share-stats
  extended with `care_recap` (this month's ring_closed days / elapsed owner-tz days = percent, degrade
  clean), surfaced in-app via `VetSummaryReadinessCard` AND wired into the E4 share-card deck
  (`buildShareCards` + ShareableStatCard + ShareCardDeck now render the REAL recap percent, empty-safe
  at 0%). Mobile: useHealthReinforcement (useLogAllGood / useVetSummaryReadiness) + the one-tap button
  on CareRingCard + VetSummaryReadinessCard on Health->Today (links to the Vet Record). Behavioral, not
  diagnostic; a no-shame grep test guards the copy. EN+ES. Gates: mobile jest 1805->1809 (+4), web
  integration 928->932 (+4), web vitest 1924. **Pet Owner engagement wave E5–E10 COMPLETE.**
