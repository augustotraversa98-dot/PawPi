# PawPi Roadmap — active build queue (synced from Cowork's plan)

**This is a derived view, not the strategy.** The strategy lives in
[`docs/phase2-superapp-master-plan.md`](phase2-superapp-master-plan.md) (Cowork + Tats own it) and
the priority order in `PawPi_instructions.md`. **The authoritative build queue is Cowork's
paste-ready tickets in [`docs/phase2-tickets/`](phase2-tickets/00-README.md)** (2.0 → 2.14, with build
order + shared conventions in its README). Build those in order; this file is the status mirror.
Phone-checkable items land in [`docs/test-backlog.md`](test-backlog.md). See
[`docs/dev-pipeline.md`](dev-pipeline.md) for the loop.

**The bridge:** Cowork writes strategy/priorities into the master plan + instructions → Code (me)
derives this queue, builds, and writes status back here + into the instructions status block, then
commits. Keep this file in step with the master plan every time priorities change.

> **Note (2026-07-28):** the pipeline has been **Claude Code only** for several weeks — Cowork has not
> been driving. This file and the `PawPi_instructions.md` Snapshot were both refreshed on 2026-07-28
> so Cowork can pick the thread back up. Everything below the "CURRENT STATE" block is history.

---

## 📍 CURRENT STATE (2026-08-01)

### 🐾 WAVE — Pet Owner engagement (E0–E10) — IN PROGRESS

Design of record: [`docs/pet-owner-engagement.md`](pet-owner-engagement.md) (retention system — the Care
Ring is the spine; everything hangs off it). North star = daily/weekly active owners. Every mechanic
**celebrates the dog, never shames the owner**; forgiveness (freezes/repair/rest mode) ships on day one;
health framing is positive, never diagnostic; **no fake/mock data** (empty states only). Built one unit
at a time, in order — E0 is the schema foundation, E1 the Care Ring spine, E2–E4 build on it. Status
mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **E0** — Data foundations. Migration **0094** (`pet_care_days`, `pet_streaks`, `user_profiles.timezone`;
  ENABLE+FORCE own-row RLS). Reuses the existing `pets.adoption_date` as the gotcha/adoption day (already
  synced Dog Profile ↔ Medical Profile — no new column, no duplicate storage). `verify_0094.sql`;
  RLS proven as `pawpi_app` in `engagement-foundations-rls.integration.test.ts`. **0094 ✅ APPLIED + verified on Supabase 2026-08-13.**
- ✅ **E1** — The Care Ring. **No migration** (derives over existing logs + reuses E0's `pet_care_days`/
  `pet_streaks`). New route `GET/POST /api/pets/[id]/care-ring` (owner-tz day derivation of Walk/Moment/
  Care, upserts `pet_care_days`, rest-day + pause writes; degrades cleanly pre-0094 via savepoint).
  Mobile: `CareRing` (SVG, closing pop + haptic), `CareRingCard` on Health→Today, live ring around the
  owner's pet-profile avatar; `useCareRing`/`useSetRestDay`/`useSetPause`; log mutations invalidate the
  ring live. EN+ES. Proven: care-ring integration (+12), careRing util jest (+14).
- ✅ **E2** — Streak + forgiveness. Migration **0095** (`pet_streaks` repair/milestone columns +
  `app_advance_care_streak` / `app_repair_care_streak` SECURITY DEFINER helpers). The ring route
  advances the streak on close (idempotent; banked freezes bridge missed days; rest/pause never a
  miss; milestones 7/30/100 bank a freeze, capped 2) and exposes a one-tap repair (~48h). Mobile:
  🔥 `StreakChip` on the pet-profile + feed header, "streak is safe" line + "Restore your streak" CTA
  on the ring card. EN+ES. Proven: care-streak integration (+8: forgiveness matrix), careRing util
  jest (+3). **0095 ✅ APPLIED + verified on Supabase 2026-08-13.**
- ✅ **E3** — Milestone moments. **No migration** (reuses `pets.birthday` + `pets.adoption_date`). Extends
  `feedDelight.js` (`getMilestone` type+years, `getUpcomingMilestone` 3-day countdown). On a milestone
  day a moment gets an animated `MilestoneRibbon` + `Confetti` + a "Share this" CTA (stubbed to the
  existing 2.62 share frame). New `GET /api/feed/milestones` (followed pets with a real milestone today,
  owner-scoped) → `FollowedMilestones`/`MilestoneEventCard` on the home feed (paw the pet's moment). A
  3-day `MilestoneCountdownBanner` on the pet-profile (feeds E5). EN+ES. Proven: feed-milestones
  integration (+5), feedDelight jest (+8).
- ✅ **E4** — Share cards. **No migration** (reads existing logs + E0/E2 `pet_streaks`). New owner-scoped
  `GET /api/pets/[id]/share-stats` (real: streak, walks-this-week, moments-total; empty-safe). Mobile:
  `ShareableStatCard` (1080×1920 PawPi-branded, @handle + handle-only deep link — never location) + a
  `ShareCardButton` reusing the 2.62 view-shot/expo-sharing path; `ShareCardDeck` (milestone /
  week-in-walks / streak / pet-of-the-day cards + an empty-safe monthly-recap **stub** for E10), opened
  from a "Share a card" button on the owner's pet-profile. Real stats only — 0/absent → clean empty
  state. EN+ES. Proven: share-stats integration (+4), shareLinks jest (+6).
- ✅ **E5** — Notification rewrite. **No migration** (client-side policy). Rebuilt around WANTED
  triggers only: `notificationPolicy` (pure at-risk streak-save decision + daily cap + personalized
  send hour), `notificationPreferences` (AsyncStorage per-category toggles + send-log + open-hour
  history), `engagementNotifications` (positive EN+ES copy + guarded `maybeScheduleStreakSave`, wired
  into `CareRingCard`). Guilt/chore copy removed (reframed `notificationGenerator` + daily-return);
  Settings → Notifications now real per-category toggles (Social / Milestones / Streak / Care). Proven:
  policy/prefs/engagement/no-guilt-grep jest (+30).
- ✅ **E6** — Onboarding D1 polish. **Migration 0096** (welcome paw; ✅ APPLIED + verified 2026-08-14). First session
  ends with the ring STARTED: first moment posted → day-1 streak seeded + the ONE allowed labelled
  seeded interaction, a first paw from the official "PawPi Welcome" account (lazily created by the
  `app_welcome_account` / `app_welcome_paw` DEFINER helpers — NO migration-time seed row, so the
  integration harness is unaffected) + a labelled `welcome` notification. New `POST /api/onboarding/
  welcome` (idempotent, degrades clean pre-migration). Onboarding now captures BOTH birthday AND
  gotcha/adoption day inline (optional); success screen shows "🔥 Day 1" + the welcome paw, or a
  ring-start nudge. No health fields forced. EN+ES. Proven: onboarding-welcome integration (+5),
  onboardingWelcome jest (+4).
- ✅ **E7** — Pack / shared streaks. **Migration 0097** (pack streaks; ✅ APPLIED + verified 2026-08-14). New
  `pet_pack_streaks` (participant-scoped ENABLE+FORCE RLS) + 5 DEFINER helpers (request by @handle /
  accept / advance-on-close / boop / reader) — DEFINER because every action crosses the owner boundary
  (pets + pet_care_days are owner-scoped). A pack advances only when BOTH close their ring the same
  owner-tz day (wired into the care-ring close, own savepoint); a "boop" nudges a friend whose ring
  isn't closed (rate-limited, only if open). `GET/POST /api/pets/[id]/pack-streaks`. Mobile:
  `usePackStreaks` hooks + `PackStreaksCard` on Health→Today (flame + boop + accept + start-by-handle;
  break copy celebrates the best run, never blames). Opt-in. EN+ES. Proven: pack-streaks integration
  (+4), usePackStreaks jest (+5).
- ✅ **E8** — Leaderboards (density-gated). **Migration 0098** (✅ APPLIED + verified 2026-08-14). Weekly care-effort
  leagues: XP from walks / ring closes / care actions / paws GIVEN (never likes received) via
  `app_pet_week_xp` + `app_leaderboard` DEFINER (ranks across owners). DENSITY-GATED — friends always;
  breed/neighborhood only at/above a min cohort (config) else fall back to friends (never empty/fake).
  Coarse **opt-in** geo (`pets.lb_opt_in`/`lb_area`, never lat/lng); `pet_leaderboard_weeks` snapshot
  drives real promotion/relegation movement. `GET/POST /api/pets/[id]/leaderboard`. Mobile:
  `useLeaderboard` + `LeaderboardCard` on Health→Today (flavor tabs, tier + movement, gated empty-safe
  state, neighborhood opt-in). EN+ES. Proven: leaderboard integration (+5), useLeaderboard jest (+2).
- ✅ **E9** — Comparative health insight (density-gated, always positive). **Migration 0099** (✅ APPLIED + verified 2026-08-14 —
  hand-apply). Positive, behavioral activity reward. v1 defaults to the dog's OWN history (best-week-in-
  a-month / more-than-last / gentle nudge). A breed+age cohort win ("more active than X% of {breed}s his
  age") only renders ABOVE median + at/above a min cohort via `app_activity_cohort` DEFINER; below median
  NEVER shows a negative comparison — enforced in a pure server-authoritative `decideInsight` (no bare
  negative kind can be returned). `GET /api/pets/[id]/activity-insight`; disclaimer always present, never
  diagnostic. Mobile: `useActivityInsight` + `ActivityInsightCard` on Health→Today. EN+ES. Proven:
  activity-insight integration (+4), decideInsight vitest (+4), renderer jest (+12).
- ✅ **E10** — Health-update reinforcement. **No migration** (reads/writes existing tables). Three
  positive payoff loops: (1) one-tap "all good" on the Care Ring writes a REAL wellness (general) log →
  closes the Care segment in a tap; (2) a positive **Vet-Summary readiness** indicator (`GET /api/pets/
  [id]/vet-summary-readiness`) that grows with real records (weight/meds/photo-checks/vet-visits),
  celebrates progress, links to the Vet Summary — 0 records → honest low state, never shame; (3) a
  **monthly care recap** ("{name}'s care was X% this month") from real ring completion (share-stats
  `care_recap`), surfaced in-app AND wired into the E4 share-card deck (fills the recap stub). Mobile:
  `useHealthReinforcement` + `VetSummaryReadinessCard` on Health→Today + the one-tap button on
  `CareRingCard`. EN+ES; behavioral, not diagnostic. Proven: health-reinforcement integration (+4),
  hooks/shareLinks/no-shame jest (+4). **Pet Owner engagement wave E5–E10 COMPLETE.**

> **Update (2026-08-13, Wave B COMPLETE) — ticket B5 (walker walk history with map):** **NO
> migration** (reads existing `walk_sessions` + B3's pickup columns). The walker's finished walks,
> newest-first: dog + date + duration + distance, expandable to the real route drawn on a map
> (`MapLocationView`), the **pickup marker** (from B3), and any photos. New screen
> `walker-history.jsx` → `/walker-history`, reached from a "Walk history" link in `walker-walks`.
> The walk-sessions GET additively surfaces `pickup_lat/lng` via a **guarded column probe** (so the
> live walker list/history never 500s on an unmigrated prod). Sessions with no route render "No
> route recorded" gracefully; null pickup shows no marker. EN+ES. Gates: integration 852→855
> (walker-history), mobile jest 1704→1708, web vitest 1920 (unchanged). **Wave B (B1–B5) is done —
> 5 PRs merged; migrations 0088–0091 await Tats' hand-apply.**

> **Update (2026-08-13, Wave B) — ticket B4 (schedule a walk against a pack):** migration **0091**
> (additive `vet_appointments.pay_with_credit`; no RLS/table/function change; ⏳ PENDING hand-apply).
> An owner with a balance schedules a walker booking marked **pay_with_credit** — it creates **no
> money order**; the credit is consumed at **pickup (B3)**, not at booking (so a no-show never burns
> a credit). The `book` route 409s a zero-balance owner, forces `order_id=null` for a credit walk,
> and stamps the flag via a savepoint'd UPDATE (degrade-clean); the owner still can't self-confirm
> (staff-only). The `pay_with_credit` flag is surfaced on the walker agenda + owner list via a
> guarded column probe. Mobile: "Schedule with my pack" on the walker storefront (reuses
> `BookingFormModal` with `payWithCredit`, no checkout) + a "Uses a walk" badge in `walker-walks`.
> EN+ES. Gates: web vitest 1918→1920, integration 846→852 (schedule-credit-walk), mobile jest
> 1702→1704.

> **Update (2026-08-13, Wave B) — ticket B3 (QR pickup: scan → deduct a credit + check in):**
> migration **0090** (`walk_sessions` += `pickup_lat/pickup_lng/credit_pack_id` + the DEFINER
> `app_redeem_walk_credit`; NO RLS policy change; ⏳ PENDING hand-apply). At pickup the **owner shows
> a QR**, the **walker scans it** — one atomic action verifies a stateless HMAC-signed token
> (`utils/walkPickupToken.js`, ~5-min TTL, bound to the provider), **deducts 1 credit**, **checks in
> the walk** (creates the `in_progress` `walk_session`), and **captures the walker's GPS as the
> pickup point**. The redeem is the ONLY credit-spend path (owner can't self-decrement). New API:
> `GET /pets/[id]/walk-pickup-token`, `POST /providers/[id]/walk-pickup/redeem` (409 no-credits;
> degrade-clean 503 when unmigrated). Mobile: owner "Show pickup QR" on the walker storefront
> (`react-native-qrcode-svg`); walker "Scan pickup" in `walker-walks.jsx` (`expo-camera` `CameraView`)
> → success drops into the existing live tracking. EN+ES. Gates: web vitest 1901→1918, integration
> 836→846 (walk-pickup-redeem), mobile jest 1695→1702.

> **Update (2026-08-13, Wave B) — ticket B2 (walk packages + prepaid credit balance):** migration
> **0089** (`walk_packages` + `walk_credit_packs` + `orders.kind` 'walk_package' + the DEFINER
> `app_grant_walk_credits`; ENABLE+FORCE RLS: public-active read / admin write for packages,
> owner+provider-staff read / NO-direct-write for balances; ⏳ PENDING hand-apply). A walker sets
> prepaid packs (single/10/20, each priced) on the **web extranet** (a walker-only section inside
> `ProviderServices`, with 1/10/20 quick-add suggestions); an owner **buys** one on the walker
> storefront (`service/provider.jsx` → same MercadoPago checkout as the shop) → a credit balance
> scoped per owner↔provider, usable across their pets. Credits are **granted on PAID** (in
> `applyPaymentStatus`, idempotent) and **spent at pickup (B3)** — not here. New API: walk-packages
> CRUD, `POST /pets/[id]/walk-package-checkout`, `GET /providers/[id]/walk-credits`, + `walk_packages`
> on the public profile. Degrade-clean throughout (missing tables → []/0/no-op). EN+ES. Gates: web
> vitest 1869→1901, integration 819→836 (walk-packages-credits), mobile jest 1691→1695.

> **Update (2026-08-13, Wave B) — ticket B1 (walker "Available now" live toggle):** migration **0088**
> (`provider_live_availability` — one row/provider, ENABLE+FORCE RLS: published-or-own-staff read,
> active-staff-only write; ⏳ PENDING hand-apply). A walker business flips a live "Accepting walks now"
> flag from the business **Today** hub (`hasWalker` only), separate from the recurring availability
> windows: enabling captures the device's current GPS point (best-effort; still allowed if denied) and
> stamps an 8h auto-expiry; a row reads AVAILABLE iff `accepting AND expires_at>now()`, evaluated at
> READ time. New API `GET/PUT /api/providers/[id]/live-availability` (degrade-clean: missing table →
> `{accepting:false}`, never 500) + hooks `useProviderLiveAvailability`/`useSetProviderLiveAvailability`.
> EN+ES. Gates: web vitest +11, integration +10 (live-availability-rls: staff upsert / outsider reject /
> removed-staff / published-vs-draft read / expiry-at-read / completeness), mobile jest business Today +2.

> **Update (2026-08-12b) — ticket 2.102 (live walk map + vet-record walk history):** mobile + web,
> **no migration / no RLS change**, open PR — do NOT merge. Finishes the ~90%-built walker live-GPS
> feature (2.7). **Four gaps:** (1) **business entry point** — a **"Walks"** quick action on the business
> **Today** hub (surfaced when the active provider holds the `walker` capability, no extra fetch) plus a
> **"Start walk"** affordance on `walker` booking rows in the Bookings tab, both `router.push('/walker-walks')`;
> (2) **owner live watch → real map** — `walk-live.jsx`'s SVG polyline is replaced by the shared
> `MapLocationView` (Apple `PROVIDER_DEFAULT`, no key): the full `walk_sessions.route` feeds the polyline, a
> start + latest marker anchor it, and the map is keyed on the point count so each 5s poll re-fits to the
> newest points (empty/waiting states unchanged — `< 2` points → "Waiting for the first GPS points…" /
> "No route was recorded"); (3) **walker sees their own live map** — a new `WalkerLiveMap` renders the same
> map inside the active `StartWalkModal` (new additive `topContent` prop), driven by the points being POSTed;
> location-denied degrades to a graceful "time still tracks, no map" note (no nag, no fake route); (4)
> **vet record walk PATTERN** — `GET /api/vet-record/full-summary` `walks` block gains **`items`** (most-recent
> per-walk `{start_time, duration_minutes, distance}`, capped at 24, null-duration omitted) + **`perWeek`**
> (walks averaged over the `from..to` window, divide-by-zero → 0), additively (count/totalMinutes/totalDistance
> unchanged); surfaced in the Vet Summary as a "≈2 walks/week · recent: 30, 25, 27 min" line. Touched endpoint
> re-proven through the REAL Hono router by URL (`test/integration/vet-record-walks.integration.test.ts`).
> EN + ES. Gates: mobile jest 1663→1674, web vitest 1855, integration 803 (+2), all green.

> **Update (2026-08-12):** **Shelter adoption management view** (web, **no migration / no API change**,
> open PR — do NOT merge). Pure UI over the two lists already fetched by the adoptable-listings + adoption-
> applications GETs, in `ProviderAdoption.jsx`. Both the dogs list and the applications list now: (1)
> **collapse "Past" items** — an expanded **Active** group on top and a default-collapsed **Past (n)** section
> below (dogs: Active = available/pending, Past = adopted; applications: Active = submitted/under_review,
> Past = approved/declined); (2) a **fast client-side type-search** (case-insensitive, no debounce) — dogs by
> name + breed, applications by applicant name + email + dog name — filtering **both** groups so a search
> surfaces a past item (a search auto-expands Past); (3) **status filter chips** (dogs: All/Available/Pending/
> Adopted; applications: All/Submitted/Under review/Approved/Declined; default All) that compose with the
> search and, when a specific status is picked, show a flat fully-visible list (pulling a past status into
> view). Empty states: "No dogs match" / "No applications match" when a search/filter yields nothing; the Past
> section is omitted when there are no past items. Everything already there still works (re-list, edit, the
> questions editor, applicant info + answers, live status updates). web vitest 1824→1833 (+9).

> **Update (2026-08-12):** **Adoption applications v2** (web + mobile, **migration 0086**, degrades cleanly,
> PENDING hand-apply — **open PR, do NOT merge** until the SQL is applied). Six changes on the existing 0038
> module: (1) per-listing **application questions** (new `adoptable_listings.application_questions jsonb` +
> an add/edit/remove/reorder editor in `ProviderAdoption.jsx`, seeded with a recommended "Best contact
> number"); (2) the shared mobile apply modal renders one input per question and stores the responses as
> `[{question, answer}]` in the existing `adoption_applications.answers`, shown back on the provider review;
> (3) the provider applications list joins `auth_users` to return the applicant's **name + email**; (4) the
> review mutation invalidates both the applications AND listings query so the status updates live (kept +
> verified); (5) a new shelter-admin **re-list** endpoint puts a listing back to `available` and re-opens a
> mistakenly-approved application to `under_review` (a plain gated UPDATE; the transferred pet stays as
> history); (6) every status transition **notifies the applicant** (`adoption_under_review`/`_approved`/
> `_declined` via the reused 2.26 `app_notify`; the migration widens the notifications type CHECK; the mobile
> notifications screen renders them, EN+ES). Degrades cleanly pre-apply (42703 → no questions; the notify
> swallows the CHECK failure → never a 500). Proven through the **real Hono router** in the integration suite.
> web vitest 1817→1823, mobile jest +6, integration +9.

> **Update (2026-08-12):** **Adoption editor now sets the dog's age** (web, no migration, PR-only).
> The provider adoption editor (`ProviderAdoption.jsx`) had no age input, so every listing saved
> `age_years`/`age_months` as NULL and pet owners always saw **"Age unknown"** even though the schema
> (0038) and the browse/detail render already support age. Added a years + optional-months input to the
> create form **and** the edit modal (which now prefills the stored age); shared `parseAge` validation
> (years ≥ 0 integer, months 0–11, empty → null). The create POST + update PATCH already accepted the
> fields; the PATCH now also lets an explicit null clear the age, with server-side validation on both.
> web vitest 1805→1817.

> **Update (2026-08-01):** full audit of the blocker list below against Railway's real variables
> + live production tests (not just this doc's claims) — the same standard as blocker #3's
> device test. Found **two items marked "blocking" that were already done**: telehealth's Daily.co
> key (blocker #1 — `VIDEO_PROVIDER`/`VIDEO_API_KEY` confirmed set on Railway, a real join tested
> end to end against production) and migration `0069` (password reset's own table — confirmed
> applied via a live `forgot-password` call against production, no DB error). Both corrected below.
> Also: Augusto **rotated the `pawpi_app` DB password** (blocker #5, now done) — production's
> Railway `DATABASE_URL` picked it up fine (healthy deploy + live traffic confirmed), but this
> repo's local `.env` still has the pre-rotation password and will fail direct-DB scripts until
> updated locally. Going forward, a Railway env var change or a manual/device test is a doc-sync
> trigger too, same as a PR merge (`docs/dev-pipeline.md`'s sync rule).
>
> **Update (2026-07-31):** password reset is now fully live in production — `EMAIL_API_KEY` /
> `EMAIL_FROM` / `APP_BASE_URL` are set and confirmed on Railway (Resend, `pawpi.info` domain
> verified), and the full flow was device-tested end to end. See blocker #3 below.

**The app is feature-complete for v1 and is in the App Store submission phase.** All build waves
(Phase 1, Phase 2, Waves 3–9), the UGC-moderation phase, and the 2.77 visual redesign are merged.
What remains is submission logistics and a handful of go-live keys — not feature work.

- **Backend is LIVE in production** on Railway at `https://pawpi-production.up.railway.app`, serving
  the mobile app. Database is Supabase.
- **Live DB is at migration `0069`.** (0056–0068 verified directly against production 2026-07-28;
  `0069_password_reset_tokens.sql` confirmed applied 2026-08-01 via a live `forgot-password` call
  against production completing with no DB error — the table + its `app_create_password_reset_token`/
  `app_consume_password_reset_token` helpers exist and work. Older docs claiming "0067 PENDING" or
  "0069 PENDING" were both stale; nothing is pending now.)
- **Test baselines: mobile jest 1170 · web vitest 1367 · integration 663.**
- **iOS:** builds and runs. TestFlight got to **Build 6**; a long native splash-hang arc was fixed
  (#253, #255–#259). A **local iOS Simulator build now works on Augusto's Mac**, so mobile UI can be
  self-verified without a device round-trip — see the Simulator loop notes in `docs/dev-pipeline.md`.
- **Demo/App-Review account is seeded on PRODUCTION**: `augusto+demo@pawpi.info`, hero pet **Mango** (6 posts,
  friends, a vet clinic, a full health/vet record). Re-runnable and resettable — `docs/demo-seed-plan.md`.
  *All current production data is disposable test data and will be wiped once the app is accepted.*

**What is actually blocking submission** (all need Augusto, none are code):
1. ~~Telehealth join needs a real vendor~~ — **✅ DONE, confirmed 2026-08-01.** Daily.co is live:
   Railway has both `VIDEO_PROVIDER` and `VIDEO_API_KEY` set (confirmed via Railway's actual
   variable list, not a doc claim), and a real join was tested end to end via Expo against
   production — it created a genuine Daily room (`room_ref`) and flipped the session to
   `in_progress`. This was previously listed here as blocking; it wasn't. Nothing left to do.
2. `CRON_SECRET` + an external scheduler — subscription auto-charge, recall ingest, calendar sync.
   Confirmed still unset on Railway (2026-08-01) — genuinely still blocking.
3. ~~`/account/forgot-password` is a frontend-only stub~~ — **BUILT (2026-07-28) and LIVE (2026-07-31).**
   The full reset flow now exists end to end: forgot-password → single-use 30-minute token (migration
   **0069**) → emailed link → "set a new password" screen → `/api/account/reset-password`.
   ~~apply migration 0069~~ ✅ done, ~~set `EMAIL_API_KEY` + `EMAIL_FROM` + `APP_BASE_URL`~~ ✅ done
   (2026-07-31) — Resend verified on sending domain **pawpi.info**, confirmed on Railway. Augusto
   device-tested the full flow end to end: Welcome → Forgot password? → emailed link → set new
   password → logged in successfully with the new password. Re-confirmed live 2026-08-01 (see the
   audit note above) — migration 0069 is genuinely applied, not just claimed. Details + device
   checklist in `docs/test-backlog.md`.
4. Remaining go-live keys (OAuth, payments, maps browser key, enrichment) — each feature degrades
   cleanly until set. Confirmed still absent from Railway's variable list (2026-08-01): no
   `AUTH_APPLE_ID`/`AUTH_GOOGLE_ID`, no payment-rail keys, no `GOOGLE_PLACES_API_KEY`/
   `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, no `ENRICHMENT_LLM_KEY` — genuinely still open. (Email
   was in this list before; it's done — see #3 — and has been removed from here.) Full list in
   `docs/test-backlog.md`.
5. ~~Pre-launch security: change the placeholder `pawpi_app` DB password~~ — **✅ DONE** (rotated by
   Augusto 2026-08-01). Production's Railway `DATABASE_URL` already reflects it (confirmed via a
   healthy fresh deploy + live `/api/auth/session` traffic, which touches the DB). **Follow-up, not
   a submission blocker:** this repo's local `anything/apps/web/.env` still has the pre-rotation
   password — direct-DB scripts run from this machine will fail auth until it's updated to match.

**Known code gaps deliberately left open** (tracked, not forgotten):
- The demo seed writes only HISTORICAL data, so Health → Today renders empty. Add same-day entries
  before shooting App Store screenshots.
- **FIXED:** `EditMedicalProfileModal`'s Save button was wired to `KeyboardSafeFormModal` with the
  wrong prop names (`onSave`/`saveText`/`loading` instead of `onCtaPress`/`ctaLabel`/`ctaDisabled`),
  so tapping Save on the Edit Medical Profile screen did nothing. Pre-existing since the 2.77 Vet
  Record restyle (#205), not caused by N4. Corrected to the same `onCtaPress`/`ctaLabel`/`ctaDisabled`
  pattern already used correctly by the other three `KeyboardSafeFormModal` consumers
  (`BookingFormModal`, `PhotoCheckRoutineModal`, `ReminderCreationModal` — swept and confirmed clean).
  npm test green (1195 mobile tests). Simulator touch-input was non-functional this session (confirmed
  via multiple gesture types and a full device reboot — hardware buttons still worked), so on-device
  tap-and-save confirmation is still owed before the next device-test pass.
- **FIXED:** `EditMedicalProfileModal`'s save wrote breed/birthday/gender/weight to the `pets` row
  correctly (scoped `WHERE id = petId AND owner_user_id = ownerUserId` — unchanged, confirmed correct)
  but never invalidated the `["pets"]` React Query cache, unlike `profile-edit.jsx`'s own PATCH save.
  So Dog Profile (`more/profile.jsx`, which reads `currentPet.weight`/`.gender`/etc. straight off
  `usePetProfile`/`useCurrentPet`) kept showing the pre-edit value until the 45s `staleTime` lapsed or
  the app restarted. Fixed by adding the same `queryClient.invalidateQueries({queryKey:["pets"]})` +
  `refetchQueries({queryKey:["pets","current"]})` calls `profile-edit.jsx` uses. Swept every other
  pet-editing call site (`AddDogModal`/`useCreatePet`, `onboarding.jsx`) — both already invalidate
  `["pets"]` correctly; no other gap found. Added a real-Postgres integration test
  (`pet-medical-profiles.integration.test.ts`) proving an owner with 2+ pets editing pet A never
  touches pet B, plus the cross-owner 404 case. mobile jest 1197 green / web vitest 1386 green /
  integration green.
- **RESOLVED — Dog Profile weight-source flag (follow-up to #274).** **Convention: weight is a
  HISTORY, not a single field.** "Current weight" anywhere in the app always means the latest
  `health_weight_logs` row for the pet, falling back to `pets.weight`/`weight_unit` only when the pet
  has zero weigh-ins logged ever — never re-derive this; there is exactly one implementation,
  `getCurrentWeight()` in `api/utils/petWeight.js`. `POST /api/pet-medical-profiles` already only
  wrote to `pets.weight` in that same zero-logs fallback case (unchanged). The GET side of that route
  already preferred the latest log for its own `currentWeight` field (unchanged, now calls the shared
  helper). What was fixed: `GET /api/pets` (list) and `GET /api/pets/[id]` — the routes behind
  `useCurrentPet`/`usePetProfile` — now merge each pet's `weight`/`weight_unit` through the same
  helper before responding, so Dog Profile (`more/profile.jsx`) and the Edit Pet Profile prefill
  (`more/profile-edit.jsx`), the only two direct `pets.weight` display reads found (grepped the whole
  mobile app), get the correct value with no mobile-side change needed. Health → Track weight
  chart/history was already reading `health_weight_logs` directly and is unaffected. New integration
  coverage (`pets-current-weight.integration.test.ts`) proves the latest-log-wins and zero-logs-fallback
  cases, plus per-pet scoping for an owner with 2 pets; `pet-medical-profiles.integration.test.ts`
  gained a regression pair proving its own `currentWeight` is unchanged by the extraction. Do **not**
  add a second "current weight" field or write path — if a screen needs to show or edit weight, read
  through `getCurrentWeight()` (or `currentWeight` from `/api/pet-medical-profiles`) and log new
  weigh-ins to `health_weight_logs`, never write a display value back to `pets.weight`.
- **RESOLVED — weight WRITE-side consolidation (follow-up to #275/#276).** The read-side fix above
  left the write side split: `PATCH /api/pets/[id]` (Dog Profile edit) still wrote weight straight to
  `pets.weight`/`weight_unit`, while `POST /api/pet-medical-profiles` (Edit Medical Profile) correctly
  inserted a new `health_weight_logs` row once history existed — so a Dog Profile weight edit on a pet
  with any weigh-in history wrote to a column the read side no longer looked at, and the edit appeared
  to silently not save. **Convention: there is exactly one write implementation too** —
  `logCurrentWeight(petId, ownerUserId, weight, weightUnit)`, alongside `getCurrentWeight()` in
  `api/utils/petWeight.js`. It mirrors the read fallback exactly: insert a new `health_weight_logs` row
  once the pet has any history, else seed `pets.weight`/`weight_unit` directly (the zero-history case
  `getCurrentWeight()` falls back to). Both `PATCH /api/pets/[id]` and `POST /api/pet-medical-profiles`
  now call this one helper instead of each having its own copy of the insert-vs-seed branch. Pet
  CREATION (`POST /api/pets`) is untouched on purpose — that write IS the legitimate zero-history seed
  value, not an edit. Mobile: both `profile-edit.jsx` and `EditMedicalProfileModal.jsx` now also
  invalidate `["health","weight-logs"]` and `["health","timeline"]` (not just `["pets"]`) after save,
  since either screen can now create a `health_weight_logs` row — otherwise Health → Track weight would
  have kept showing the stale chart until its own cache expired. New integration coverage
  (`pets-patch-weight.integration.test.ts`) proves the seed-vs-insert branch and per-pet scoping for
  PATCH; `pet-medical-profiles.integration.test.ts` gained a regression proving its insert-when-history
  path is unchanged. **Do not add a third weight write path** (a new screen, a bulk-import feature,
  etc.) — always call `logCurrentWeight()`.
- **RESOLVED — Dog Profile current-weight-source ticket, age/birthday follow-on.** **Convention: a known
  birthday always wins; `age_years`/`age_months` is only an ESTIMATE for when the birthday isn't known.**
  `pets` has both a `birthday` (date) and independent `age_years`/`age_months` (plain numbers) that used
  to be edited as unlinked fields and displayed via five separate ad-hoc formatters (`profile.jsx`
  `formatAge`, `pet-profile.jsx`'s own `formatAge`, an inline computation in `HealthVetRecord.jsx`, plus
  two more on the unrelated adoptable-listings side that were deliberately left alone — see below). The
  model, same idea as the weight convention: **if `birthday` is set, "Age" is ALWAYS the live-calculated
  years/months as of today — the stored `age_years`/`age_months` estimate is never read or shown once a
  birthday exists.** If `birthday` is NOT set, the stored estimate is shown instead, marked approximate
  (a leading `~`, e.g. `~2 years`) so it never reads as precise. There is exactly one implementation,
  `getDisplayAge(pet)` in mobile `src/utils/petAge.js` (a pure frontend util, not backend, because — unlike
  weight — there's no separate history table to query; birthday and the estimate are both already plain
  columns on the same `pets` row every consumer already fetches). `profile.jsx`, `pet-profile.jsx`, and
  `HealthVetRecord.jsx` all now call it instead of their own formatter. One real gap this closed: `GET
  /api/pets/[id]/profile` (the Dog Social Profile route) was selecting `age_years`/`age_months` but never
  `birthday`, so that screen could never calculate an age even when a birthday existed — fixed by adding
  `birthday` to its SELECT (both the numeric-id and handle lookup).
  **The "I don't know the birthday" state is now explicit, not just "birthday happens to be null."** A
  shared `<BirthdayOrAgeField>` component (`mobile/src/components/Pets/BirthdayOrAgeField.jsx`, used by
  both `profile-edit.jsx` and `EditMedicalProfileModal.jsx` — the two editable surfaces; onboarding is
  create-only and keeps its own existing birthday/adoption/"I'm not sure" step) renders a two-way toggle —
  "I know the birthday" vs. "I'm not sure" — that shows either the birthday `DateField` or estimated-years/
  estimated-months inputs, never both. `EditMedicalProfileModal` previously had NO age fields at all (only
  birthday), so a pet whose profile was only ever touched from Vet Record had no way to ever get an age
  estimate — that gap is now closed; `POST /api/pet-medical-profiles` gained `ageYears`/`ageMonths` body
  handling to match. **Write rule, mirrors the weight convention's "don't clobber":** when the toggle is on
  "I know the birthday," the client leaves `age_years`/`age_months` OUT of the save payload entirely (not
  sent as `null`) so any previously-stored estimate is left untouched in the database — harmless, since
  display never reads it once a birthday exists. When the toggle is "I'm not sure," `birthday` is
  explicitly written as `null` and the typed estimate (or `null`, if left blank) is written. Do **not** add
  a third age representation or a "birthday_unknown" database column — the toggle state is derived on load
  from whether `birthday` is set and owned by the screen from then on; that derivation plus the two-way
  toggle IS the "deliberate unknown" affordance, no new column needed. Deliberately **out of scope and
  unchanged**: `adoption_date` (already correctly wired everywhere, consumed by `feedDelight.js`/
  `memoriesWrapped.js`); the adoptable-listings `age_years`/`age_months` on the unrelated `adoptable_listings`
  table (`service/adoption.jsx`'s `ageLabel`, duplicated in `AdoptionFeedCard.jsx`) — that table has no
  birthday column at all and is a shelter-listing concept, not an owned-pet concept. Coverage: unit tests
  for every `getDisplayAge` branch (`petAge.test.js`), toggle + payload-shape tests in
  `EditMedicalProfileModal.test.jsx` and a new `profile-edit.test.jsx`, plus two new real-Postgres
  integration tests in `pet-medical-profiles.integration.test.ts` proving the age write never leaks across
  an owner's two pets and that omitting `ageYears`/`ageMonths` truly leaves the old estimate untouched.
  mobile jest / web vitest / integration all green.

## Status legend
`READY` build-eligible · `BATCH:n` assigned · `BUILDING` draft PR open · `DEVICE` waiting on your
phone test · `BLOCKED` has a predecessor · `IDEA` needs scoping.
Tags: **scope** fe/be/db · **safe-parallel** yes only if it touches files no other READY item touches.

---

## ✅ PHASE 2 COMPLETE (2026-06-17) — all 15 tickets merged

2.0 nav · 2.1 capabilities · 2.2 reviews · 2.3 payments · 2.4 booking · 2.5 chat · 2.6 grooming ·
2.7 walking · 2.8 daycare · 2.9 sitting · 2.10 training · 2.11 shop · 2.12 adoption · 2.13 feed ·
2.14 dashboards. PRs #109–#127. Migrations 0027–0038 pending hand-apply to Supabase (see
[`docs/test-backlog.md`](test-backlog.md) ACTION 1). Device tests + go-live actions also in the backlog.

### Phase 2 follow-ups (noted by build agents — not blocking, schedule when wanted)
- **Payments:** recurring-subscription scheduler/cron (fire `next_charge_at` → order+charge); encrypt provider OAuth tokens at rest.
- **Capabilities:** mobile provider-onboarding multi-select + owner discovery filter chips by capability.
- **Adoption:** per-listing deep-link from feed/discovery (currently opens the adoption hub); foster workflow; urgent/featured listings; multi-pet bulk import.
- **Native uploads:** photo/video upload for visit/session media needs real-device re-test (shared fetch.ts path).
- **Docs hygiene:** `ARCHITECTURE.md` says a standalone `useCurrentPet.js` exists — it actually lives in `usePetProfile.js`; `supabase/SCHEMA_NOTES.md` migration-order line stops at 0011. Refresh both.
- **Social mock chat:** the old pet-friend chat (`messages.jsx`/`chat.jsx`) still uses mock data (separate from the new provider chat) — convert off mock or retire.

## 🌊 WAVE 3 + WAVE 4 — COMPLETE (tickets 2.15–2.31, all merged)

Build order + blockers in [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md). Status mirror
(✅ merged · 🔨 building · ⛔ blocked-on-prereq · ☐ queued):

- ✅ **2.15** mobile capability multi-select — merged (#130), no migration.
- ✅ **2.16** encrypt payment tokens — merged (#131), no migration.
- ✅ **2.17** sub auto-charge cron — merged (#132), migration 0039 (fn only).
- ✅ **2.18** telehealth — merged (#133), migration 0040 (telehealth_sessions + 2 widened CHECKs).
- ✅ **2.19** More-tab nav fix — merged (#134), no migration (service screens → root `service/` stack).
- ✅ **2.20** provider onboarding links — merged (#135), migration 0041 (4 link columns).
- ✅ **2.21** AI enrichment (confirm-first) — merged (#136), no migration (proposes a draft; applies via existing routes).
- ✅ **2.23** service/product images — merged (#137), migration 0043 (provider_services.image_urls[]).
- ✅ **2.22** storefront + posts — merged (#138), migration 0042 (provider_posts + providers.cover_image_url).
- ✅ **2.24** web bookings calendar — merged (#139), no migration (week/day grid; reuses inbox actions).
- ✅ **2.25** search/discover real data — merged (#140), no migration (/api/search + /api/discover; mock data removed).
- ✅ **2.26** notifications real data — merged (#141), migration 0044 (notifications + app_notify DEFINER insert).
- ✅ **2.27** owner↔owner DMs — merged (#142), migration 0045 (dm_threads + dm_messages, participant RLS).
- ✅ **2.28** daily share frame — merged (#143), no migration (react-native-view-shot + expo-sharing).
- ✅ **2.30** adoption deep-link — merged (#144), no migration (feed "Adopt me" → that exact listing).
- ✅ **2.29** i18n EN/ES — merged (#145), no migration (i18next + react-i18next + expo-localization; framework + core + Settings toggle).
- ✅ **2.31** docs hygiene — merged, docs-only (ARCHITECTURE single useCurrentPet; SCHEMA_NOTES migration order → 0045 + source-of-truth pointer).

Migrations 0039–0045 pending hand-apply (see [`docs/test-backlog.md`](test-backlog.md) ACTION 1).

## 🌊 WAVE 5 — polish, fixes, big features + the "epic four" (tickets 2.32–2.50)

Built unattended per the Wave 5 autonomy preamble in `00-README.md`. Status mirror
(✅ merged · 🔨 building · ⛔ blocked-on-prereq · ☐ queued):

- ✅ **2.32** password security rules — merged (#148), no migration (shared `passwordStrength` validator; server-enforced on sign-up only, existing logins untouched; live strength meter).
- ✅ **2.33** notifications filter-chips layout fix — merged (#149), no migration (horizontal chip row centers items so chips size to content instead of stretching into tall rectangles).
- ✅ **2.34** current-pet header sync — merged (#150), no migration (More header reads the reactive `useCurrentPet` instead of a stale AsyncStorage snapshot; updates on switch/create).
- ✅ **2.35** onboarding required fields — merged (#151), no migration (@handle required + format rule in a pure `validateHandle` util; KeyboardAwareScrollView so inputs clear the keyboard).
- ✅ **2.36** feed daily-post fixes — merged (#152), no migration (owner-only DELETE /api/posts/[id]; own posts now in the feed; view-today fixed).
- ✅ **2.37** feed streak + birthday — merged (#153), no migration (🔥 consecutive-day streak via /api/posts/streak; 🎂 + orange frame on birthday/adoption day).
- ✅ **2.38** profile fixes — merged (#154), no migration (profile/feed share button reuses the 2.28 branded share; real `formatRelativeTime(created_at)` replaces fake "Just now").
- ✅ **2.39** Instagram nav — merged (#155), no migration (bottom-right tab is now Profile; the former More menu lives behind a top-right ☰ burger; 2.19 nav fix intact).
- ✅ **2.40** unified messages — merged (#156), no migration (one Messages hub: People DMs + Businesses threads + All/People/Businesses filter + owner search → start DM; two backends stay separate).
- ✅ **2.41** vet-record owner upload — merged (#157), no migration (owner Add/open/delete documents into existing owner-scoped `vet_documents`; medical-profile edit already persists).
- ✅ **2.42** vet-record history log — merged (#158), no migration (append-only History view over `vet_notes`: author label vet/"You" + dated entries + derived summary + owner add/delete; append-only integrity already RLS-proven in provider-records integration).
- ✅ **2.43** walks with buddies — merged, migration `0046` (social_walks `lat/lng/location_name` + new `social_walk_invites` table; map picker + public/private toggle + nearby bounding-box discovery + invited view; private walks RLS-invisible to non-invitees, harness-proven).
- ✅ **2.44** community forum — merged, migration `0047` (Reddit-style `forum_threads`/`forum_comments`/`forum_votes`; any-authed read + author-only write/soft-delete; idempotent voting via the `forum_vote` DEFINER helper that recomputes score; mobile category/sort browse + thread detail + compose + comment + vote; COMMUNITY_POSTS mock removed).
- ✅ **2.45** training supreme — merged, migration `0048` (`training_progress_self`, owner-scoped per-pet completion; 8-program AKC-style researched curriculum in the static `trainingCurriculum` content module; training.jsx rebuilt as program→session→detail with Mark-complete + progress bars per active pet; TRAINING_LESSONS mock removed; "Want a pro?" banner still links to the provider service).
- ✅ **2.46** Apple/Google sign-in — merged, NO migration (additive + env-gated `@auth/core` Google + Apple providers via `socialProviders(env)`; Credentials path untouched; buttons appear only when keys configured, else "Coming soon"; new OAuth users get a `user_profiles` row via the existing lazy path; env keys flagged for Tats).
- ✅ **2.47** family/caregiver sharing — merged, migration `0049` (`pet_caregivers` person↔person grants + audit mirroring care_access; family co-manage vs caregiver scoped read-only + expiry + instant revoke; additive per-table RLS via `app_user_has_pet_access`/`app_user_has_pet_family` helpers + `pets_guard_owner_transfer` trigger; owner-only delete preserved; proven hard in `family-caregiver-rls.integration.test.ts`).
- ✅ **2.48** lost & found — merged, migration `0050` (`lost_reports` + `lost_sightings`; active alert any-authed read, owner-only resolve, sighting-on-active RLS via `app_owns_lost_report`/`app_lost_report_active`; widened `notifications` type for `lost_alert`; best-effort `app_notify` to followers/owner; mobile `lost-found.jsx` near-me browse + mark-lost map pin + sighting + resolve).
- ✅ **2.49** memories & wrapped — merged, NO migration (pure TZ-safe aggregation in `memoriesWrapped.js`: on-this-day, milestone detection [birthday/gotcha/streak/post-count], Wrapped tallies + slides, all empty-safe; one read route `posts/history`; `memories.jsx` + `wrapped.jsx` reusing the 2.28 capture+share flow via `ShareableMemoryCard`/`MemoryShareButton`).
- ✅ **2.50** AI health intelligence + real Vet Summary — merged, NO migration (date-ranged owner+pet-scoped aggregation route `vet-record/full-summary` replaces the fake `mockSummaryData`; pure tested trend helpers `healthInsights.js` [weight/vomit/stool/urinary/appetite/med-adherence flags, empty-safe, non-diagnostic] + `buildRecap`; `VetSummaryModal`/`VetSummaryDashboard` rewired to real data + insight flags + range selector + questions-for-vet + share-as-text via `vetSummaryText.js`; disclaimer intact). **Wave 5 COMPLETE.**

---

## 🌊 WAVE 6 — UX fix-pack + trust + new capabilities (tickets 2.51–2.66) — IN PROGRESS

Authoritative spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md)
(Wave 6 section). Decided with Tats 2026-06-18 (+ an on-device UX fix-pack). Built per the ⚡ Wave 5
autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

**Part A — mobile UX fix-pack (do FIRST; NO migrations): ✅ COMPLETE** — all 9 built unattended, CI-green,
squash-merged to `origin/main` (PRs #168–#176; planning #167). No migrations (as expected). Next: Part B.
- ✅ **2.55** remove "Phoebe" + avatar fallback — do first (avatar fallback reused by 2.60).
- ✅ **2.62** share frame attaches the real daily-moment photo (capture was firing before image load).
- ✅ **2.63** app-wide keyboard: tap field first, then keyboard (kill auto-focus on bark/comments).
- ✅ **2.64** double-tap image → Paw/like (brand-color animation).
- ✅ **2.65** edit own daily-update caption (owner-only PATCH posts/[id]).
- ✅ **2.66** Health → Today "Today's Progress" on real logged data (kills hardcoded chips).
- ✅ **2.59** floating IG-style tab bar (edits `(tabs)/_layout.jsx`).
- ✅ **2.60** Profile tab → active pet's social profile + pet-photo icon — ⛔ after 2.59 + 2.55.
- ✅ **2.61** followers/following lists + paw follow/unfollow + search — ⛔ after 2.60 (no migration).

**Part A device feedback (Tats, 2026-06-18):** tests pass; one device bug found — tapping Followers/
Following lands on expo-router **+not-found** (the 2.61 `/follows` route doesn't resolve on the running
build; likely a stale Metro route tree needing `expo start --clear`, plus an embedded empty-`petId` edge).
Logged as a follow-up fix:
- ✅ **2.67** fix Followers/Following → +not-found (robust nav + embedded petId fallback) — no migration.
  Absolute-href nav to the root `/follows` route + active-pet fallback so the tab never pushes an empty
  petId; counts non-interactive while the pet loads (no dead tap). `follows` falls back to the active pet
  on a paramless open. Reproduction finding: route file + `_layout` registration are correct on main, so
  the device +not-found is a stale Metro route tree (clean `expo start --clear` resolves it) — the code
  fixes are hardening for the embedded entry point.

**Part B — capabilities + loose ends (migrations 0051–0055):**
- ✅ **2.56** adoption public single-listing GET — no migration. Public GET on
  `adoptable-listings/[listingId]` returns the dog IFF published + available (public
  columns only, exact browse visibility; no RLS change); the 2.30 feed deep-open now
  fetches the single listing directly (resolves a dog not in the loaded browse list),
  keeping the graceful "no longer available" path + the 2.19 nav.
- ✅ **2.51** emergency mode + printable medical-card tag QR + revocable vet link — migration **0051**.
  Two owner-only tables + 3 SECURITY DEFINER public-read fns (tag basic/medical-opt-in; revocable+expiring
  vet link; relay contact). Two PUBLIC no-login web pages (`/p/tag/[token]`, `/p/card/[token]`); mobile
  Emergency Card screen (assembled card + image share reusing 2.28 + printable tag QR + create/revoke vet
  links). LOST banner from 2.48. Harness-proven RLS + completeness guard. Migration flagged in test-backlog.
- ✅ **2.52** transport / pet-taxi — migration **0052**. `transport_trips` on the spine (owner +
  provider-staff + assigned-driver RLS; owner can't self-advance status). Capability-gated
  (`transport`); a trip IS a generalized booking (2.4) so it surfaces in the existing inbox/calendar;
  fare via payments (2.3), chat via 2.5. Mobile transport screen (discovery + map-picker booking form +
  trips list + cancel/message). Harness-proven; migration flagged in test-backlog.
- ✅ **2.53** vet Rx (inside Veterinary) — migration **0053** (strictest medical RLS). `prescriptions`
  (owner READ-ONLY, append-only — vet issues, owner can't forge) + `rx_refill_requests` (owner files,
  vet decides via `decide_rx_refill` DEFINER which decrements refills; no provider UPDATE policy). Web:
  vet issue/list/cancel + refill queue/decision; owner read + request-refill. Mobile: Vet Record
  Prescriptions section ("Prescribed by {clinic}", request refill, no owner edit). Harness-proven; flagged.
- ✅ **2.54** insurance marketplace — migration **0054**. New `insurance` capability (CHECKs widened
  +ALLOWED_CAPABILITIES). `insurance_plans` (published-public read, admin-managed) + `insurance_leads`
  (owner-or-provider scoped). Lead-gen v1 (no binding/payment, no Vet Record sent). Web: plans editor +
  leads inbox/status. Mobile: marketplace (discovery → plans → compare → quote form prefilled from the
  pet → lead). Harness-proven; migration flagged.
- ✅ **2.57** adoption foster/urgent flags — migration **0055**; ⛔ after 2.56. Additive columns riding
  the existing adoption RLS: `placement_type` (adopt/foster/both), `is_urgent`/`urgent_reason`,
  `is_featured`/`featured_until` on listings + `requested_placement` on applications. Web: editor +
  applications view fields, featured-first ordering, public read returns flags. Mobile: URGENT badge +
  placement chips on cards, urgent banner + foster/adopt picker in the detail. Harness-proven; flagged.
- ✅ **2.58** feed "Suggested" divider + ARCHITECTURE.md/SCHEMA_NOTES.md — no migration; built LAST.
  `mergeFeed` tags each post `feed_group`; the feed shows a "Suggested for you" divider at the
  Following→Suggested boundary (only when followed content sits above real suggested content). Docs:
  ARCHITECTURE.md gained a Wave 6 feature-surfaces section (2.51–2.58 + tables/RLS); SCHEMA_NOTES.md
  migration-order line advanced to 0055.

**Wave 6 COMPLETE (2026-06-18).** Part A (2.55, 2.59–2.66) + 2.67 fix + Part B (2.56, 2.51–2.54, 2.57,
2.58) all built, CI-green, squash-merged. Migrations **0051–0055** are **APPLIED + VERIFIED on Supabase
(2026-06-18)** — see [`docs/test-backlog.md`](test-backlog.md) ACTION 1. Part A added none.

---

## 🌊 WAVE 7 — money/transport loops + discovery/community/health add-ons (tickets 2.68–2.75) — ✅ COMPLETE

Authoritative spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 7
section). Scoped + ticketed with Tats 2026-06-18 from the un-ticketed post-core list (memorials dropped;
widgets/Apple-Watch deferred to a dedicated attended effort). Cross-cutting requirement: **Apple Maps in
every section that captures/shows a location** — 2.68 builds the shared component first; the rest reuse it.
Build per the ⚡ Wave 5 autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **2.68** Shared Apple-Maps location component — mobile, no migration. **Built FIRST** (foundation):
  `src/components/Map/{MapLocationPicker,MapLocationView,LocationField}.jsx` (Apple Maps via
  `PROVIDER_DEFAULT`); `WalkMapPicker` is now a thin wrapper over the shared picker, transport adopts
  `MapLocationPicker` directly; i18n `map.*` EN+ES; mobile jest +7.
- ✅ **2.69** Provider Sales / payouts + reconciliation UI — web, **no migration** (read-only surfacing of
  2.3 money): `GET /api/providers/[id]/sales` (active-staff-scoped: revenue net/gross series + ledger
  [payments × orders] + payouts/pending + aggregate reconciliation, no money mutated) → enabled `Sales`
  dashboard section (`provider/sales/page.jsx` + `ProviderSales.jsx`, recharts + empty states). web vitest +6.
- ✅ **2.70** Transport live-GPS tracking — migration **0056** (`transport_trip_locations`; append-only
  driver pings; INSERT only by the assigned driver while en_route via `app_can_post_trip_location`, SELECT by
  owner+driver+staff via `app_can_read_trip_location`; harness-proven as pawpi_app + completeness guard).
  Driver ping POST + owner/staff `/track` GET; owner live Apple-map screen (`transport-track.jsx`, reuses 2.68
  `MapLocationView`, 5s polling) + driver "Share live location" (`expo-location`, en_route-only). i18n EN+ES.
- ✅ **2.71** Rx fulfillment (delivery/pickup + charging) — migration **0057** (`rx_fulfillment_orders`;
  owner-creates-only-on-owned-refillable-Rx via `app_owns_fulfillable_rx`, pharmacy-staff advance, the
  `fulfill_rx_order` DEFINER consumes a refill on the 2.53 safe path — prescriptions stay append-only;
  harness-proven + completeness guard). `pharmacy` already in the CHECK (0040) — no widen. Owner routes +
  provider queue routes; mobile request flow (delivery via 2.68 `LocationField` / pickup, pay via 2.3) +
  provider dashboard `Rx Fulfillment` queue. i18n EN+ES.
- ✅ **2.72** Insurance in-app binding + payment — migration **0058** (`insurance_policies`; owner applies +
  accepts terms but can't self-issue number/premium or self-activate; insurer staff issue/advance but can't
  set `active`; `activate_insurance_policy` DEFINER is the only path to active, requiring an approved 2.3
  payment; harness-proven + completeness guard). `insurance` already in the CHECK (0054). Owner apply/pay/hub
  + provider dashboard `Policies` view; non-underwriting disclaimer (insurer = party-of-record). i18n EN+ES.
- ✅ **2.73** Pet-friendly places directory — migration **0059** (`saved_places` owner-FOR-ALL RLS; NO cache
  table — the proxy fetches live; harness-proven + completeness guard). Server-side key-gated Google Places
  proxy (`/api/places/search|[placeId]`, degrades clean to `configured:false`, key never reaches the client)
  + owner favorites; mobile Places screen (2.68 Apple map + list + category chips + Saved tab + directions
  hand-off, permission/empty/not-set-up states). i18n EN+ES. Reuses `GOOGLE_PLACES_API_KEY`.
- ✅ **2.74** Events / meetups — migration **0060** (`events` + `event_rsvps`; forum-style published-public
  read + host-only writes/soft-delete + own-only RSVP toggle, COUNT-on-read attendee count, no DEFINER
  [non-recursive EXISTS subquery]; harness-proven + completeness guard). Web events CRUD + rsvp upsert;
  mobile Events section in Community (2.68 Apple map + list + RSVP + directions + create via the 2.68
  picker/DateField/TimeField + host cancel). i18n EN+ES. (Best-effort RSVP notify deferred — no CHECK widen.)
- ✅ **2.75** Nutrition plans + food-recall alerts — migration **0061** (`nutrition_plans` owner-RLS [family
  follow-up noted]; `food_recalls` public reference data [any-authed read, DEFINER-only `ingest_food_recall`];
  `pet_food_recall_matches` owner-RLS; `match_food_recall` DEFINER links a recall→plan + best-effort
  `food_recall` notify; notifications CHECK widened; harness-proven + completeness guard). Owner nutrition
  CRUD + secret-gated idempotent recall ingest (`/api/recalls/ingest`, degrade-clean) + owner recall-matches;
  mobile Nutrition card (non-diagnostic disclaimer) + dismissible recall alerts. i18n EN+ES. Needs `CRON_SECRET`
  + an external scheduler to post the feed.

Migrations **0056–0061 (+ 0062 account-deletion) are APPLIED + VERIFIED on Supabase 2026-06-19** — all 30
checks PASS via `supabase/verify_0056_0062.sql`. (Wave 8/9 migrations **0063 + 0064** were applied next, on
2026-06-20 — see below; the live DB is now at **0064**, none pending.) 2.69/2.71/2.72/2.75
were parallel-safe; the map-dependent trio (2.70/2.73/2.74) rode on 2.68.

### ✅ 2.78 — App Store readiness pass (final step of the autonomous run; PRs #197–#199)
Pre-submission hardening against Apple's current guidelines: iOS permission usage strings + privacy manifest
+ metadata (name PawPi, placeholder bundle id); removed the `wrongPets` debug query (2.3.1); privacy/terms
config slot wired into welcome (5.1.1); **in-app account deletion** (migration **0062** `delete_my_account()`
DEFINER + `DELETE /api/account` + Settings danger-zone; FK-clean cascade, self-only; harness-proven) per
5.1.1(v); wired two "coming soon" no-ops (weight-log delete + profile photo) to real functionality (2.1).
Sign in with Apple parity (4.8) + non-diagnostic disclaimers (1.4.1) verified. The handoff —
FIXED / FLAGGED policy items / account-gated submission checklist — is in
[`docs/app-store-readiness.md`](app-store-readiness.md). Code+config is submission-ready; the EAS build +
App Store Connect upload need the Apple Developer account.

## 🌊 WAVE 8 — calendar integration (tickets 2.79–2.80) — ✅ COMPLETE

Scoped with Tats 2026-06-20 from the un-ticketed post-core list: the buildable, CI-verifiable half of
calendar integration (true two-way EventKit sync deferred to a later attended device pass). Authoritative
spec + build order: [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 8 section). Built
per the ⚡ Wave 5 autonomy preamble. Foundation-first (mirrors 2.68). Status mirror (☐ queued · 🔨 building ·
✅ merged):

- ✅ **2.79** Calendar foundation — mobile refactor + web ICS route, **no migration**. De-duped
  `calendarIntegration.js` into one generic layer (`getOrCreatePawPiCalendar` + `upsertCalendarEvent` +
  `deleteCalendarEvent`) + an expo-free, jest-covered `calendarFormat` module; walk/vet wrappers + call-sites
  unchanged; owner-scoped `GET /api/calendar/booking/[id].ics` (RFC 5545, harness-proven owner-scoped read).
- ✅ **2.80** Calendar everywhere — mobile + web, migration **0063**. Add/update/remove on generalized
  bookings (BookingFormModal toggle, incl. telehealth), transport trips, and RSVP'd events; persists the
  device event id (bookings/transport/telehealth → `vet_appointments.calendar_event_id`; events → new
  `event_rsvps.calendar_event_id`); added `GET /api/calendar/event/[id].ics`. One additive column, no RLS
  policy change (rides existing own-row policies); degrade-clean when calendar permission is denied.

Migration **0063** (`event_rsvps.calendar_event_id`) is **APPLIED + VERIFIED on Supabase 2026-06-20**
(all 6 checks PASS via `supabase/verify_0063.sql`) — see [`docs/test-backlog.md`](test-backlog.md)
ACTION 1. 2.79 added none.

---

## 🌊 WAVE 9 — business magic-onboarding + calendar import + adoption browse (tickets 2.81–2.87) — ✅ COMPLETE

Scoped with Tats 2026-06-20. Authoritative spec + build order:
[`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md) (Wave 9 section). Built per the ⚡ Wave 5
autonomy preamble. Status mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **2.81** Provider location map pin — mobile + web, **no migration**. Mobile onboarding shows the shared
  `LocationField` and persists the pin as the provider's primary `provider_locations` row; web Locations form
  gets an interactive `LocationMapPicker` (reuses `@vis.gl/react-google-maps`) that degrades to manual lat/lng
  inputs when `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is unset. lat/lng already exist (0014) — no schema change.
- ✅ **2.82** Enrichment: document catalog source — web, no migration. `fetchDocumentCatalog` (3rd
  enrichment source): CSV/XLSX rows → catalog (plain parsing, no LLM); PDF text → LLM-structured
  (dormant default). `POST .../enrich/document` (owner|admin, dormant behind `ENRICHMENT_LLM_KEY`,
  writes nothing) + a confirm-first `DocumentCatalogImport` panel that applies rows via the existing
  services/shop-products CRUD. Adds `xlsx` (lazy-loaded).
- ✅ **2.83** Mobile "magic onboarding" wizard — mobile, no migration. Service types → map pin → links
  + optional price-list doc → "Build my profile" creates the draft + location, runs confirm-first
  enrichment (`/enrich` + `/enrich/document`), shows ONE editable review (description + proposed
  services), saves via the existing PATCH/services CRUD. Keyless → empty draft → fully manual, no dead
  ends. New hooks + pure `enrichmentDraft` mapping util.
- ✅ **2.84** Business calendar import (ICS feed → busy blocks) — web, migration **0064**.
  `provider_calendar_feeds` + `provider_calendar_busy` (owner/staff RLS; busy is read-only — only the
  DEFINER `app_sync_calendar_feed` writes it). Pure ICS parser; feed CRUD + "Refresh now" +
  CRON_SECRET sync endpoint; availability subtracts imported busy and the book route 409s on overlap
  (via `app_provider_busy_windows`). Web dashboard `/provider/calendar-import`. Provider mgmt is
  web-primary, so no separate mobile screen. Migration 0064 **APPLIED + VERIFIED on Supabase 2026-06-20**
  (all 16 checks PASS via `supabase/verify_0064.sql`).
- ✅ **2.85** Adoption listing image + video upload — provider editor, no migration. Create form +
  per-listing "Media" editor wire real uploads to `photo_urls[]` (reuses `ImageUploader`: reorder/
  remove, first = cover) + `video_url` (new `VideoUploader`) via the existing Storage path; cover
  thumbnail + "N photos · video" in the list. Reuses 0038 columns + RLS — no migration.
- ✅ **2.86** Adoption browse: gallery, nearest-first, filters — mobile, no migration. New owner-facing
  `GET /api/adoption/listings` (flat read across published shelters' available dogs, joined to provider
  primary location; composable filters + bounding-box; nearest-first via haversine, else featured/
  recent). Mobile Browse redesigned to a 2-col grid of photo-top/info-below cards with distance label
  + a filter sheet; device location with clean fallback. Consumer UI is mobile; the endpoint is the
  shared layer for any future web view. RLS-proven (integration). No migration.
- ✅ **2.87** Adoption detail page — mobile, no migration. Extended the public single-listing GET
  (2.56) to return the shelter's primary location; rewrote the detail into a rich profile: swipeable
  media gallery (photos + `expo-av` video), key-facts grid (unknowns omitted), compatibility chips,
  story, a shelter card with a `MapLocationView` pin (2.68), and the existing Apply/Foster CTA +
  deep-link landing. Real fields only — no fake media/location.

New go-live env keys (degrade clean until set): `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (2.81 web pin),
`ENRICHMENT_LLM_KEY` (2.82, already listed), `CRON_SECRET` + external scheduler (2.84).

---

## 🛡️ UGC MODERATION — App Store Guideline 1.2 (tickets T1–T9) — ✅ COMPLETE (PRs #228–#237)
> **Both go-live steps are now DONE:** migrations `0065` + `0066` were APPLIED + VERIFIED on Supabase
> 2026-06-21, and the legal docs are hosted with their URL env vars set (#251). Nothing pending here.
> Two follow-ups landed after T1–T7: **T8** (#236, migration **0066**) brings provider storefront posts
> into the moderation surface, and **T9** (#237) adds the Terms gate to the mobile vet/business signup
> entry point.
>
> ⚠️ The `ModerationMenu` components this phase added are an **App Store requirement**. The 2.77
> redesign rebase nearly deleted several of them — never drop one while restyling.

Plan: [`docs/phase-ugc-moderation-plan.md`](phase-ugc-moderation-plan.md) · build log:
[`docs/ugc-moderation-build-log.md`](ugc-moderation-build-log.md). The minimum 1.2 safeguards to pass
review: EULA gate, content filter, report/flag, block, contact info. Order **T1 → T2 → T3 → T4**, then
**T5, T6, T7**. (✅ merged · 🔨 building · ☐ queued.)

- ✅ **T1** Migration `0065` — moderation primitives (DB only) — merged (#228). `content_reports` +
  `user_blocks` (both FORCE-RLS), `hidden_at` on 11 peer-UGC content tables, `user_profiles.banned_at`,
  DEFINER helpers (`app_is_admin`/`app_user_is_blocked`/`app_moderate_hide`/`app_moderate_unhide`/
  `app_ban_user`), `notifications` `report_received` widen. Migration ⏳ PENDING hand-apply on
  Supabase (`verify_0065.sql`).
- ✅ **T2** Report/Block/admin APIs (backend) — merged (#229). `/api/reports`, `/api/blocks` (+`[id]`),
  `/api/admin/reports` (+`[id]/action`). Extended `0065` with two admin DEFINER helpers
  (`app_admin_list_reports`/`app_admin_action_report`) so the admin queue works under FORCE RLS.
- ✅ **T3** Enforcement in read paths — merged (#230). `hidden_at IS NULL` + block filtering across
  feed/forum/DM/search/walks/reviews/events/lost-reports/pet-profile; blocked-pair interaction 403.
  Shared `utils/moderation.js`; real-handler-as-pawpi_app integration proof.
- ✅ **T4** Report/Block UI actions (mobile) — merged (#231). Shared `<ModerationMenu>` + `useModeration`
  into 9 UGC surfaces (feed post/bark, forum thread/comment, DM header, pet profile, provider review,
  adoption listing, event, walk). DEVICE PASS required.
- ✅ **T5** EULA acceptance gate (web signup + mobile welcome, required unchecked checkbox) +
  zero-tolerance Terms clause (24h review, content removal, account ejection) — merged (#232).
- ✅ **T6** Contact info wiring — merged (#233). Settings "Contact Us" → `mailto:` support; "Help Center"
  → hosted URL (falls back to email). `SUPPORT_EMAIL`/`HELP_CENTER_URL` config slots. Hosting + env are
  Augusto's go-live step.
- ✅ **T7** Text content filter — merged (#234). Shared `moderateText` (leetspeak/spacing-tolerant,
  Scunthorpe-safe) at 13 UGC write chokepoints; rejects objectionable text with 422.

---

## 🎬 DAILY VIDEO MOMENTS + FEED LOCKED-STATE — ✅ COMPLETE (2026-06-22 → 06-28)

Feed work that followed the UGC phase. Built in steps, each its own PR.

- **Locked-feed tease** (#242 → #243 → #244, iterated on device feedback). The locked feed is a
  BeReal-style tease: other pets' posts must read as *clearly present but heavily blurred* behind the
  lock card, so the user is incentivised to post. Final form = floating card over a blurred, static
  (non-scrolling) feed; the locked chrome was repainted to **warm solid, NOT glass** — the unlocked
  feed keeps the Liquid Glass look. Obscure via blur + cream wash, never via opacity.
- **Camera-only composer** (#245) — dropped the gallery/library path; moments must be captured now.
- **Daily video moments** — **migration 0068** (#246, schema only: additive `posts.media_type` /
  `video_url` / `video_thumbnail_url`) → daily video-eligibility gate + server-side enforcement (#247)
  → mobile capture/upload/post (#248) → playback in PostCard + PostDetailModal (#249) → the
  "lucky day" composer treatment (#250).

## ⚖️ LEGAL + APP STORE SUBMISSION PREP — ✅ COMPLETE (2026-06-22 → 06-29)

- **Consent ledger — migration 0067** (#238): `legal_consents`, append-only, keyed to `auth_users.id`
  (user_profiles is lazily created, so there's no profile id at signup); admin-only SELECT, no owner
  write policy — the ONLY writer is the `app_record_consent` SECURITY DEFINER helper.
- **#239** removed the duplicate Terms gate from the welcome screen (the signup gate is the real one).
  *Do not re-add a Terms footer to `welcome.jsx`.*
- **Legal docs finalized + hosted** (#251, #241) on GitHub Pages from a separate public repo
  (`pawpi-legal`); URL env vars set. This closed the App Store legal-URL blocker.
- **Submission prep** (#252): iPhone-only v1 + finalized the App Store Connect content pack.
- **Demo-seed tooling + screenshot storyboard** (#240) — `docs/demo-seed-plan.md`,
  `docs/screenshot-storyboard.md`, runner at `apps/web/scripts/demo-seed/`.

## 📱 iOS BUILD / TESTFLIGHT ARC — ✅ RESOLVED (2026-07-01 → 07-12)

A long native-only failure chain; none of it was reproducible in Expo Go, which hides native modules.
Worth reading before touching native config.

- **#253** fixed the EAS iOS production build (bundling, ITMS-90683 permission strings, launch crash,
  splash hang). **#255** pointed Build 6 at the live Railway backend + fixed uploads.
- **#256** un-brickable startup: a hard splash deadline, boot breadcrumbs, and a production error
  boundary — so a stalled launch always falls through to Welcome instead of hanging on the splash.
  This is what renders the on-device **"Startup diagnostic"** line on `welcome.jsx`; keep those
  boot-trace imports.
- **#257** native pre-JS splash-hang fix (stub the Anything menu in release; soften the TurboModule
  NSException patch). **#258** fixed a SIGABRT on first Fabric mount (a nil third-party component in
  the codegen'd provider). **#259** shipped the real PawPi paw-emblem icons + coral splash.
- **2.76 widgets stays parked** — see the native track below.

## 🚀 WEB PRODUCTION DEPLOY + PRODUCTION HARDENING — ✅ LIVE (2026-07-02, hardened 2026-07-28)

- **#254** made the web app production-deployable (`build` + `start` path; three prod-only traps fixed).
  Deployed to **Railway**; the mobile app now talks to `https://pawpi-production.up.railway.app`.
- **2026-07-28 production incident + hardening** (committed directly to `main`, not via PRs):
  - **Login was fully broken in production** — the `Secure` cookie flag was mis-detected behind
    Railway's TLS-terminating proxy, so CSRF/session cookies never stuck (`15966bd`, `3fb5140`,
    `e827439`). The rule: check `x-forwarded-proto`, not `request.url`, which is plain http internally.
  - **Uploads were broken** — request body limit raised 4.5mb → 50mb (`791f049`), and the
    provider dashboard was still posting to the dead `/_create` host (`9bcaeba`).
  - **Error-info disclosure** — stopped leaking raw errors to clients + fixed the transaction-escape
    root cause (`669e41e`).
  - From an 11-agent QA sweep of the API surface: unsafe JSON body parsing on 14 routes (`638d0c0`),
    a lost-report visibility gap (resolved/hidden/blocked owner, `bfae4af`), petId/checkType input
    validation (`888407c`), and leftover create.xyz crash-screen copy (`4b6f478`).
- **#260 (2026-07-29) — mobile login bounce-back.** Sign-in stored a valid JWT and then dropped the
  user straight back to Welcome. The global fetch wrapper read the token from the **wrong Keychain
  service**: `expo-secure-store` derives `kSecAttrService` from `options.keychainService` and falls
  back to `"app"` when omitted, so a bare `getItemAsync(authKey)` missed the token the auth store had
  written under `anything-auth`. Every first-party request went out unauthenticated → 401 on
  `/api/pets` → the EntryPoint gate correctly cleared the "expired" session. **This would have hit
  every user on every login, and curl-based testing can never catch it (curl has no Keychain).**
  Key + options now live in one shared module (`utils/auth/secureStore.js`); guard test
  `src/__create/fetch.test.js`. Anything touching auth needs a real device/Simulator login pass.

## NATIVE + REDESIGN TRACKS (sequenced separately from Wave 7)

- **2.76 Widgets / Live Activities / Apple Watch (ATTENDED).** **Phase 1 (Home/Lock-screen widget) STAGED
  + REBASED (ticket N10, 2026-07-29)** on draft **PR #187**. Used `@bacons/apple-targets`; added the
  `pawpi://` deep-link scheme; finish-checklist in `docs/native-widgets.md`. Phases 2 (Live Activity) + 3
  (Apple Watch) are later PRs, ⛔ after the account + Phase 1 merge (Phase 2's transport half soft-needs
  2.70). The branch was ~40 days stale (last touched pre-Wave-7); N10 rebased it cleanly onto current
  `main` — 2 conflicted files (`_layout.jsx`, `health.jsx`), both resolved by combining (zero lines of
  `main`'s work reverted, verified via diff), `app.json`/`package.json` auto-merged clean. **mobile jest
  156/156 suites green** on the rebased branch. Local native verification (no Apple account needed):
  `expo config` resolves the plugin cleanly, `expo prebuild -p ios` generates **both** the `PawPi` and
  `widget` Xcode targets/schemes (confirmed via `xcodebuild -list`) — `pod install` hit an unrelated local
  Ruby/CocoaPods environment bug, so a full compiled Simulator build wasn't reached tonight. **Still NOT
  merged, deliberately** — PR #187's own "do NOT merge yet" note stands: App Group id, signing,
  capabilities, EAS credentials, and the on-device acceptance pass are all account/device-gated and need
  Tats. The rebase just gets it unstuck from being stale; the finish checklist in `docs/native-widgets.md`
  is a short, mechanical step whenever the account side is ready.
- **2.77 iOS 27 "Liquid Glass" redesign (cross-cutting) — ✅ COMPLETE (merged 2026-07-28).**
  Visual/motion only; the COLORS palette is unchanged. Foundation-first, then one screen-group PR each:
  **#202** design-system + motion foundation → **#203** Feed (reference screen) → **#204** Health →
  **#205** Vet Record → **#206** Services → **#207** Community → **#208** Messages/Notifications →
  **#209** Profile/onboarding/auth. Design tokens live in `apps/mobile/src/constants/`
  (`spacing`/`typography`/`elevation`/`motion`, barrel `theme.js`); primitives in
  `apps/mobile/src/components/ui/` (`GlassSurface`, `Card`, `Sheet`, `PressableScale`, `Button`).
  Every screen was verified in the iOS Simulator on the seeded demo account before merge.
  - **`src/app/service/adoption.jsx` restyled (ticket N3, 2026-07-29)** — the one screen left out of
    #204–#209 (its June restyle was authored against the pre-2.86 file; cherry-picking would have
    reverted the Wave 9 adoption browse work). Restyled fresh against current `main`: GlassSurface
    headers, `Card` + `PressableScale` content surfaces, `TYPE`/`SPACING`/`RADIUS`/`MATERIALS` tokens,
    on both the browse grid and the 2.87 rich detail page (gallery, key facts, shelter map). The
    grid card variant, age·size·gender row, distance label, "See more", and the `ModerationMenu` on
    listings are all preserved — structural parity counts identical to `main` (mobile jest green,
    1173/1173, unchanged test count).
  - **Hazard worth knowing (it recurred on every conflicted file):** #204–#209 sat as drafts for ~40 days,
    so each one tried to silently revert newer work — the `ModerationMenu` (Guideline 1.2, an App Store
    requirement) on provider/events/forum/chat, the add-to-calendar buttons (2.80) on transport/events,
    and on `welcome.jsx` **both** a Terms/Privacy footer that #239 had deliberately deleted **and** the
    boot-trace "Startup diagnostic" line from the splash-hang work. All caught and preserved by a
    per-file structural parity check (counts of `testID`, `useState`, `useQuery`, `onPress`, `<Text`,
    `ModerationMenu`, `accessibilityLabel` must be identical to `main` — a pure reskin changes none).
  - **Motion HARD RULE:** never gate content visibility on an entrance animation. An early Feed restyle
    wrapped items in `entering={FadeInDown…}` (starts at opacity 0), reanimated-4 didn't reliably run it,
    and later posts stayed invisible. All entrance builders were removed from `motion.js`.
  - Shipped alongside: `Button` now defaults `accessibilityLabel` to `title`, so replacing a hand-rolled
    `TouchableOpacity` with the shared primitive can't silently drop its screen-reader label.

---

## ★ PREVIOUS PRIORITY — Phase 2: the pet-services super-app (now done; reference below)

From the master plan's sequenced roadmap (§6). Surface-what's-live first, then the cross-cutting
unlocks (payments/reviews/chat/booking) that make every later service cheap, then roll out types.

### Ready now (gate 1 — you approve which go in the next batch)

- [ ] **2.0 NAV-SURFACE** Promote "Pet Services" to a quick-access nav spot; move Community into More; feature only live types (Veterinary only for now). Makes the built vet loop reachable. *(Cowork notes a ticket is already written — I'll pull its spec before building.)* scope: fe. safe-parallel: yes.
- [ ] **2.1 REVIEWS** Surface existing `provider_reviews`: write-a-review after a completed booking; show aggregate rating on discovery + profiles (one review per completed booking). scope: fe+be. safe-parallel: yes (separate files from 2.0).

### Next, in order (the cross-cutting unlocks — mostly sequential, each its own gate)

- [ ] **2.2 PAYMENTS** Payments foundation: money tables (+RLS+harness proofs), provider-agnostic payment layer (createCheckout/handleWebhook/getStatus/refund/payout), MercadoPago split adapter + Binance adapter (key-stubbed), provider OAuth connect, signed webhooks. Big cross-cutting unlock — everything monetizable depends on it. scope: db+be. safe-parallel: no. Needs a plan-approval gate.
- [ ] **2.3 BOOKING-GEN** Generalize `vet_appointments` → cross-type booking + calendar (recurring, 2-way sync). scope: db+be. BLOCKED by direction set in 2.2 area.
- [ ] **2.4 CHAT** Owner↔provider booking-scoped messaging (new RLS participant-scoped tables). scope: db+be.
- [ ] **2.5 TYPES** Service-type rollout, one ticket each: Groomer → Walker (GPS) → Daycare/Boarding → Sitter → Trainer. Each builds on payments+booking+chat. BLOCKED until 2.2–2.4 land.
- [ ] **2.6 SHOP** Catalog/inventory/orders + product payments + subscriptions. BLOCKED by 2.2.
- [ ] **2.7 ADOPTION** `adoption` provider type + adoptable-dog listings (dog-profile format) + application workflow + fee/donation payments. BLOCKED by 2.2.
- [ ] **2.8 FEED** Surface businesses/services in the social feed. 
- [ ] **2.9 DASHBOARDS** Provider revenue/bookings/reviews/occupancy; owner orders/bookings hub.

**Rule from the master plan:** every NEW Phase-2 table ships with RLS policies + real-Postgres
harness proofs from the start (no retro-RLS), and the completeness guard must stay green.

---

## Awaiting YOUR device test (gate 2 — only you can clear; independent of build work)

Phase-1 work that's built + CI-green but never physically verified. Clear whenever; doesn't block Phase 2.

- [ ] **DEV-1** Combined wellness reminder device pass (each cadence saves→fires; multi-day weekly Wed&Fri; biweekly; edit round-trip; back-compat; collapsed-card label for Yearly/Hourly/Once; "15 min before" fires early while Today row stays at real time).
- [ ] **DEV-2** Keyboard fix device pass (PR #40 — bottom-of-screen inputs not covered; MedicationModal focus-switch; VetSummary pinned button).
- [ ] **DEV-3** Date/time pickers device pass (PR #38 — birthday ×3, MedicationModal vaccine+preventive, all routine modals; "21 April 2025" display, correct values in Supabase).
- [ ] **DEV-4** Pull-to-refresh device pass (PR #36 — all 4 Health tabs render/scroll/switch).
- [ ] **DEV-5** PhotoCheck combined device pass (PR #57 — cadences fire; same-vs-custom mode; early push; back-compat).

---

## Deferred — Phase 1 reminder polish (NOT current priority; revisit after Phase 2 momentum)

The reminders engine is feature-complete; these are the remaining template rollouts. Lower priority
than Phase 2 per Cowork's reset. Pull back up only if you decide to finish the scheduling polish.

- [ ] **P3-FEED / P3-WALK / P3-VET / P3-REMIND** Roll the wellness ScheduleBlock template into the Feeding / Walk / VetAppointment / ReminderCreation modals (one PR each, safe-parallel). Gated on DEV-1 first (they copy the wellness template).
- [ ] **P3-CARD** Shared ReminderSettingsCard extraction. BLOCKED until the four above land.

---

## Done (recent)

- **Wave 10 night-run (2.88–2.92)** — Shop/Store + business-social finish. **2.88** provider-post open route
  fix (mobile): tapping a storefront post opened the `/service` dead-end because the full post (signed image
  URLs) was passed as a route param and corrupted the deep-link URL; now passes only `providerId`+`postId` and
  hands the post off in memory. Regression test added (#339). **2.89** grouped the flat Business-Profile
  offering picker (+ onboarding) into a clear parent taxonomy via a shared presentation-only module — no
  capability key changed; nav was already capability-driven (#340). **2.90** replaced the Products page's
  jargon 403 with a friendly "Enable Products" prompt that flips the same `shop` offering and drops into
  add-a-product (#341). **2.91** adoption end-to-end fix: shelters can now edit a listing's info (not just
  media) via a prefilled Edit modal, and the public browse no longer hides pin-less shelters from
  location-sharing owners (#342). **2.92** follow-a-business: pet owners follow providers
  (`provider_follows`, migration 0083 pending hand-apply) — follow/unfollow/count/list API + a mobile
  Follow toggle + "Businesses you follow" list; degrades cleanly until the migration lands. (2026-08-11.)
- **2.93 (attended)** — business storefront Posts → pet-social-profile design parity. The business profile
  now reads like a pet's: the storefront header shows an **@handle** (from the provider slug) + an **info
  line** (its bio), a **stat row** (Posts · Paws · Barks · Followers) styled exactly like the pet profile,
  and the Posts tab is a **moments-style image grid** whose tiles open the existing post detail (full-size
  images + comments; guests read, signed-in owners comment). Reuses the pet profile via two extracted shared
  components (`components/social/SocialStatRow` + `MomentsGrid`, now used by both screens). Web: the public
  profile payload gains a `stats { postsCount, pawsCount, barksCount }` read (Barks from the 0082 comments,
  both edge tables `to_regclass`-guarded so a missing table degrades to 0); Followers comes from the follow
  endpoint. **Paws stays 0 until 2.94** adds `provider_post_paws` — the read never 500s. Moderation moved
  from the (now grid) post cards onto the post detail header. No migration. (2026-08-11.)
- **2.95 (attended)** — adoption: surface located-but-far + newly-created listings, and confirm apply-to-adopt.
  Root cause of "nothing to adopt": the owner browse (`GET /api/adoption/listings`) HARD-filtered located
  shelters to a `radius_km` (default 100km) bounding box, so with sparse early data almost every shelter WITH a
  map pin was hidden (2.91 had already rescued only *coordless* shelters). Fix: **distance now RANKS, it does not
  exclude** — the box is removed from the default browse and gated behind an explicit opt-in `enforce_radius=true`
  (off by default); every AVAILABLE dog of every PUBLISHED provider is returned, sorted nearest-first when the
  owner shares location (coordless shelters last), featured/recent otherwise. New listings were already visible:
  the create-listing INSERT relies on `adoptable_listings.status` default `'available'` (0038), verified. Mobile:
  the Apply-to-adopt CTA now shows a persistent **"Application sent"** confirmation (no duplicate re-apply).
  Integration test extended to prove a located shelter ~111km out (beyond the old radius) now appears, ranked
  after nearer ones, alongside the coordless case. No migration, no RLS change. (2026-08-11.)
- **2.95 follow-up (attended)** — the apply CTA reflects the owner's existing application + the server blocks
  re-apply after a decline. `GET /api/adoption/listings` now projects **`my_application_status`** (a correlated
  read of `adoption_applications` scoped strictly to the current user → null | submitted | under_review |
  approved | declined; no cross-user leak). The shared `AdoptionListingViews` CTA renders off it: null → active
  "Apply to adopt"; submitted/under_review → DISABLED "The center is reviewing your application"; approved →
  DISABLED "Application approved"; declined → DISABLED "Application declined" (no re-apply). EN+ES via a new
  `adoption.apply.*` catalog. Server: `POST /api/adoption/applications` now 409s (`{ already_applied, status }`)
  when the applicant already has ANY application for that listing in ANY status — fixing a prod bug where a
  DECLINED application let the same owner re-apply (the 0038 partial unique index allows a non-declined
  duplicate; the route guard closes it, index stays the race net). No migration, no index/RLS change. Proven
  through the REAL router: browse integration +1, applications-v2 integration +2, mobile jest +6. (2026-08-12.)
- **2.95 follow-up (attended)** — the pet-owner Adoption section now always reflects the live list. Bug:
  refreshing/re-opening Adoption didn't show newly-added available dogs and didn't drop adopted ones — a
  CLIENT cache staleness issue, not the endpoint (`GET /api/adoption/listings` already returns only
  `status='available'` from published providers). The global QueryClient sets `staleTime` 5 min and
  `useAdoptableBrowse` didn't override it, so re-entering served the stale cached list. Fix: `useAdoptableBrowse`
  now sets **`staleTime: 0` + `refetchOnMount: true` + `refetchOnReconnect: true`** (mirrors
  `usePetSocialProfile` / `useTodayDailyUpdate`), so re-entering the standalone screen AND the storefront
  Adoption tab (2.97, same hook) always refetch. Pull-to-refresh already forces a network fetch
  (`runRefresh` awaits React Query's `refetch()`, which bypasses staleTime) — verified; the storefront's pull
  now also refetches the adoption list (gated so non-shelter providers make no extra call). Mobile-only, no
  web/API/migration. mobile jest +3 (hook config test). (2026-08-12.)
- **Wave 11 night-run (2.97 / 2.96 / 2.94 / 2.98 / 2.99)** — adoption-on-profile + nav cleanup + business-post
  paws + owner/business activation checklists. **2.97** Adoption tab on the mobile business storefront: an
  adoption-capable business with ≥1 available listing shows an **Adoption** tab (`getStorefrontTabs`,
  presence-aware, after Services; i18n `storefront.tabs.adoption`), reusing the SAME browse card + detail/apply
  modal — extracted into shared `components/adoption/AdoptionListingViews.jsx` imported by both the browse and
  the storefront. Data via the existing `GET /api/adoption/listings?provider_id=`; no migration. (2026-08-12.)
  **2.96** removed the "Show all sections" nav escape hatch on the provider dashboard: the left nav now lists
  ONLY the offerings the business selected (capability-gated sections show when held; structural sections always
  show; no override), with the active-section-never-hidden safety kept. No migration. (2026-08-12.)
  **2.94** put real **Paws** (likes) on business posts: tap the paw control OR double-tap the image (reuses the
  pet-feed `PawablePhoto` + brand pop, 2.64); optimistic, guest → sign-in. **Migration 0085** `provider_post_paws`
  (ENABLE+FORCE RLS, own-row write / any-authed read; PENDING hand-apply) + `POST/DELETE .../posts/[postId]/paw`
  + `paw_count`/`is_pawed` on the single-post GET; the 2.93 `pawsCount` stat lights up once the table lands.
  Degrades cleanly pre-migration (42P01 → 0 / no-op, never a 500). (2026-08-12.)
  **2.98** added a pet-owner **"Getting started" activation checklist** — a persistent Home-tab card with a
  derived % (add basics / complete history / first reminder / first meal / first post / turn on notifications),
  each row tapping through to the screen that completes it; retires at 100% with a brief celebration. Enabling
  notifications schedules a recurring **daily** local "come back" reminder exactly once. All derived from
  existing data — no migration, no web change. (2026-08-12.)
  **2.99** added the web mirror — a **"Getting started" checklist on the provider dashboard** (complete
  profile / add an offering / set hours / add a location / share first post), each derived from existing
  provider reads, each linking to its screen; retires at 100%. No migration, no new endpoint. (2026-08-12.)
- **Business "daily moments" + video** — completes the original business-social ask: a business posts an image
  OR a **video** moment, and people who **follow** the business (`provider_follows`, 2.92) see those moments in
  their **main feed**. **Migration 0087** mirrors 0068 on `provider_posts` (`media_type` default `'image'` +
  `video_url` + `video_thumbnail_url` + a CHECK; additive, no RLS change; PENDING hand-apply). Web: the
  storefront composer attaches a video (reuses `VideoUploader`) alongside the image path; the posts
  create/PATCH accept the media fields. **Feed integration (the core piece):** `GET /api/posts` now merges
  followed-providers' posts into the Following stream, interleaved by recency (`mergeFollowingByRecency`),
  item_type `provider_post`, public business fields + media + paw/comment counts only — a non-follower sees
  none. Mobile: a distinct **business-post feed card** (logo + name + @handle, image OR the `FeedVideo` player,
  paw/comment counts) that taps through to the existing provider-post detail (which now plays video too);
  EN + ES. Degrades cleanly pre-migration (feed read catches 42703 → image; create/PATCH withSavepoint →
  base insert or a clean 409 for video; never a blank post, never a 500). Proven through the real router
  (`business-daily-moments.integration.test.ts`). (2026-08-12.)
- **Mobile business mode** — a provider/business account is no longer forced through pet onboarding, and can
  post daily moments from the phone. **Role-aware entry (the critical fix):** the post-login gate now also reads
  the account's providers (`GET /api/providers` = the businesses the user is active staff of; same read as web
  `useProviders()`), and `determinePetsRoute` routes on it — a staff-only account (no pet) lands on a new
  **Business home** instead of "let's meet your dog"; an account that is BOTH staff AND a pet owner keeps the pet
  app and gets a **Business** entry in the More menu; a non-staff account is unchanged. A failed/absent providers
  read degrades to "not a business" so it never blocks the pet flow. **Business home** (new `app/business` stack,
  MVP): business name + logo, a **provider switcher** when staff of several (persisted via `activeProviderStore`),
  a **"Post a moment"** primary action that REUSES the pet daily-moment composer (`PostComposerModal`, now
  parametrized: `allowVideo`/`showLuckyBanner`/`copy`) + the shared `useUpload` + `expo-video-thumbnails` path to
  POST an image OR a short video to `/api/providers/[id]/posts` (`media_type='video'` + `video_url` + poster), the
  business's **recent moments** with paw/comment counts tapping through to the existing `service/provider-post`
  detail (paws + comments already work there), a **Notifications** shortcut, and a **"Manage on web"** note (the
  extranet still owns services/products/hours/applications/adoption). No migration, no new endpoint — the one
  touched read, `GET /api/providers/[id]/posts`, gains degrade-clean per-post `paw_count`/`comment_count` and is
  proven through the real router (`provider-posts-list.integration.test.ts`). EN + ES. mobile jest 1640→1650;
  web vitest 1854→1855 (+integration). Business CREATION/management stays web-only. (2026-08-12.)
- **Business mode v2 — the daily hub** — turns the bare Business home into a real **tab shell** (mobile only, shown
  in business mode): **Today · Bookings · Messages · Profile**, all reflecting the currently-active provider (a
  shared `useActiveProvider` resolver over `activeProviderStore`, so the switcher swaps the business and every tab
  follows in lockstep). **Today:** the business header + switcher, the reused **BusinessStatRow** (Followers · Posts ·
  Paws · Barks, tapping through to Profile), a **"Today at a glance"** card — today's bookings count + next-up, unread
  messages, and (adoption-capable providers only) pending applications, each derived from an existing provider read
  and tapping to its tab — plus the existing "Post a moment" + recent moments + "Manage on web". **Bookings:** an
  agenda of upcoming reservations (client/pet/service/date-time/status) via the SAME `GET /api/providers/[id]/bookings`
  the web BookingsInbox uses, with **Confirm/Decline** on requested bookings (the existing action-based status
  `PATCH`, ported `bookingActions` rules); full calendar grid intentionally deferred (agenda IS the MVP calendar).
  **Messages:** the provider-side thread inbox (`/api/threads?side=provider`) with unread state, opening the shared
  `provider-chat` (generalized with an optional `meUserId`/`title` so staff replies right-align — owner surface
  unchanged). **Profile:** the storefront-as-followers-see-it (reused `useProviderProfile` by slug + BusinessStatRow +
  MomentsGrid) with a **"View public profile"** deep-link to the full `service/provider` storefront and "Manage on
  web". **No migration, no new/changed web endpoint** — every read reuses existing provider endpoints; the glance is
  derived client-side. EN + ES. mobile jest 1650→1663 (+3 suites). `apps/web` untouched. (2026-08-12.)
- **QW-DEADCODE** — removed the unreachable SimpleRoutineModal create/edit UI; legacy GENERAL/WEIGHT enums + handlers kept. Draft **PR #109**, CI green (mobile 627, web 394). Awaiting merge. (2026-06-16, first pipeline run.)
- **QW-PHOTOAREA** — already live before the roadmap existed (PhotoCheck body-area collapsible header). Verified 2026-06-16.
- Phase 1: RLS arc complete + LIVE in Supabase (Jun 16); reminders engine (P1/P2 + cadence); date/time pickers (#38); keyboard (#37/#40); pull-to-refresh (#36); provider/vet spine end-to-end.
