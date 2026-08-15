# PawPi Pre-Launch Night Run — Findings & Report (2026-08-16 plan, run started 2026-08-15)

Live findings log for the autonomous 4-phase run (A QA/Hardening → B Performance → C Legal →
D Apple submission prep). Plan: [docs/night-run-2026-08-16.md](night-run-2026-08-16.md). Each item
is its own PR (CI-green → merge → deploy/verify → log). Severity: **P0** blocker · **P1** · **P2** ·
**cosmetic**. Status: FIXED (PR#…) · ON-DEVICE PUNCH LIST · DEFERRED · BLOCKED.

---

## Executive summary (updated as the run proceeds)

**Run status: COMPLETE.** All four phases worked through. 6 PRs (#410–#415) merged; migrations 0111
+ 0112 applied + verified on prod; final closeout PR pending. Full test suite green at closeout:
**mobile jest 1887 · web vitest 2023 · web integration 1020.**

**Shipped (merged):**
- (A2a) **Demo/seed content leak into real users' feeds — FIXED** ([#410](https://github.com/augustotraversa98-dot/PawPi/pull/410); migration 0111 applied+verified on prod; 58 demo profiles + 1 provider backfilled).
- (A2b) **Stale/dishonest + English-only "just now" post timestamps — FIXED** ([#411](https://github.com/augustotraversa98-dot/PawPi/pull/411)).
- (A3) **Feed comment (bark) moderation — added Block + Delete-own — FIXED** ([#412](https://github.com/augustotraversa98-dot/PawPi/pull/412)).
- (A3-follow-up) **Business-post comment moderation — added Report + Block — FIXED** ([#413](https://github.com/augustotraversa98-dot/PawPi/pull/413); migration 0112 applied+verified on prod).
- (Phase C) **Privacy Policy + Terms rewritten EN+ES, DRAFT-stamped** ([#414](https://github.com/augustotraversa98-dot/PawPi/pull/414)).
- (Phase B + D) **Perf audit (no migration warranted) + Apple submission runbook / config / metadata / privacy map** ([#415](https://github.com/augustotraversa98-dot/PawPi/pull/415)).

**Assessed (no code change needed / device-gated):** A1 lifecycle **verified** via the existing
integration suite (+2 new tests); A2c navigation **root-caused** (search-is-modal) → **FIXED in the
PP1 fix-pack, [#417](https://github.com/augustotraversa98-dot/PawPi/pull/417)** (on-device feel check
still owed); A3 interactive controls **clean**; A4 security **strong** (48 RLS test files) with one
gap (rate-limiting — being closed by PP3).

**On-device punch list (for Tats):** _accumulating — see the Punch List section._

**Legal-review checklist:** ✅ drafted — see [docs/legal/LEGAL-REVIEW-CHECKLIST.md](legal/LEGAL-REVIEW-CHECKLIST.md). Privacy Policy + Terms rewritten EN+ES, DRAFT-stamped; awaits a lawyer's review + publishing to the hosted `pawpi-legal` repo.

**Apple runbook next-steps:** ✅ [docs/app-store-submission-runbook.md](app-store-submission-runbook.md)
— every ASC console step + the exact `eas build`/`eas submit` commands + APNs setup. Config finalized
(eas.json `appleId` placeholder added; ascAppId/appleTeamId present; permission strings present).
EN+ES metadata + App Privacy data map ready. **Tats runs the eas commands + ASC steps** (CC never
submits). Top next-steps: fill `appleId`, create the APNs key (`eas credentials`), publish reviewed
legal to `pawpi-legal`, build → submit → paste metadata → screenshots → Submit for Review.

**Performance (Phase B):** ✅ audited — **no urgent optimization warranted** (evidence below): every
app query on prod is <~2ms mean (`pg_stat_statements`), hot tables fully indexed, N+1s avoided.

**Environment note:** This run has live Supabase MCP access to the prod project
(`qaebbesldduvgwttqlnq`, "PawPi - Supabase") and Railway MCP, so additive migrations are applied +
verified against prod directly (logged per item). Prod DB had **58 of 72 profiles being demo/seed
rows** (the App-Review seed + 54 filler "fans") at run start — the dominant source of the fake-data
leak below.

---

## PHASE A — QA & Hardening

### A2a — Demo/seed content leaking into production feeds & discovery — **P0 → FIXED**

**Finding.** The App-Review demo seed (`scripts/demo-seed`) creates one sanctioned demo account
plus a clinic, two friend accounts, and **54 filler "fan" accounts** whose only purpose is to make
the demo pet **Mango** look popular (fake follows/paws/barks/reviews). Those rows are real
(RLS-faithful), so the demo login works for Apple — but PawPi's **global** surfaces rank/return
content across *all* users, so the fake fans + Mango's posts + the demo clinic + its 3 adoption
listings surfaced to **every real user**. Confirmed on prod: 58/72 profiles, 5 pets, 6 posts, 1
provider, 3 adoption listings were demo/seed. Direct no-fake-data violation.

**Leak surfaces identified (all global, non-owner-scoped reads):**
`/api/discover` (profiles + moments), `/api/search` (pets/owners/providers), `/api/feed/suggestions`
(providers + adoptions), `/api/providers/discover`, `/api/services/discover`, `/api/adoption/listings`
(browse), and `/api/posts` "Suggested" feed. Leaderboards were checked and are **clean** (0 demo
pets opted in).

**Fix (this env can apply DDL, so applied to prod).**
- **Migration 0111** (`supabase/migrations/0111_user_profiles_is_demo.sql`, verify_0111.sql): additive
  `user_profiles.is_demo` + denormalized `providers.is_demo` (both `not null default false`, partial
  indexes). No RLS/policy change. `providers.is_demo` is denormalized specifically so the provider
  discovery + feed/suggestions surfaces (which have a no-leak contract forbidding any `user_profiles`
  read or `owner_user_profile_id` reference) can filter with a plain `p.is_demo IS NOT TRUE`.
- **Exclusion filters** added to all 7 global surfaces above (owner/following-scoped views — the demo
  account's own profile/Health/bookings that Apple review actually exercises — are untouched, so the
  demo login still shows a fully-populated app).
- **Seed runner hardened:** stamps `is_demo=true` on every seeded account/filler/provider, and now
  **refuses to seed production** unless `ALLOW_PROD_SEED=1` is set explicitly (reset stays always-on).
- **Integration test** `demo-content-guard.integration.test.ts` (5 cases) proves each surface excludes
  the demo owner while keeping an identical real owner.
- **Prod data backfill** (safe UPDATE, no deletes): flag the existing 58 demo profiles + 1 demo
  provider `is_demo=true`. _Status logged in night-run-log once applied._

**Why not delete the rows?** The demo account must stay for Apple review. Marking + filtering is the
"soft-remove/guard" the plan calls for — reversible, no prod data destroyed, real users see nothing.

**PR:** [#410](https://github.com/augustotraversa98-dot/PawPi/pull/410) — **MERGED**. Migration 0111
APPLIED + VERIFIED on prod; 58 demo profiles + 1 demo provider backfilled `is_demo=true`.

### A2b — Stale / dishonest / English-only "just now" post timestamps — **P1 → FIXED**

**Finding.** Post timestamps had two bugs:
1. **The lie.** `PostCard` and `PostDetailModal` rendered
   `formatRelativeTime(post.created_at) || post.timestamp || "just now"` — a hardcoded `"just now"`
   fallback. Any post whose `created_at` was missing/unparseable (and the dead `post.timestamp` mock
   field) displayed a **fabricated "just now"** regardless of real age. (`post.timestamp` came only
   from `src/data/feedData.js`, a mock that is imported nowhere — dead code.)
2. **EN/ES parity break.** `formatRelativeTime` returned English literals (`"just now"`, `"yesterday"`,
   `"5m"`, `"3d"`) to **every** user — Spanish users saw English timestamps on every post. Only
   `BusinessPostCard` localized its fallback.

**Fix.**
- `relativeTime.js` now takes an optional translator: 2nd arg is either a `now` epoch (back-compat) or
  `{ now, t }`. With `t`, every bucket is localized via `feed.*` keys; without it, English literals
  (keeps the pure unit tests + any untranslated caller working). A missing/invalid timestamp still
  returns `""` (renders nothing — never a fabricated time).
- Added `feed.minutesShort` / `hoursShort` / `daysShort` / `yesterday` to **en.json + es.json**
  (`feed.justNow` already existed). ES: "hace {{count}} min/h/d", "ayer".
- All 5 call sites (`PostCard`, `PostDetailModal`, `BusinessPostCard`, `provider-post` ×2) now pass
  `{ t }` and **dropped the `"just now"` / `post.timestamp` fallbacks**.
- Tests: extended `relativeTime.test.js` with the localized (`{ now, t }`) path + honesty cases;
  wired the English-catalog i18n mock into `PostDetailModal.test.jsx`.

Note: `posts.created_at` is `timestamptz` on prod (serializes with tz), so real feed posts always
carried a parseable timestamp — the visible "Mango just now" symptom was compounded by the A2a leak
(demo posts appearing at all). The formatter itself was already correct on valid input; this fix
removes the dishonest fallback + closes the i18n gap.

**PR:** _fix/honest-relative-timestamps (pending push/CI/merge)._

### A3 — Comment moderation affordances (Apple 1.2) — **P1 → PARTIALLY FIXED**

**Audit (Report / Block / Delete-own on posts AND comments):**

| Surface | Report | Block author | Delete own | Notes |
|---|---|---|---|---|
| Feed **post** (PostDetailModal) | ✓ | ✓ | ✓ | complete (was already wired) |
| Feed post (PostCard) | ✓ via detail | ✓ via detail | ✓ via detail | moderation reachable by opening the post; a card-level ··· is a nice-to-have (punch list) |
| Feed **comment (bark)** | ✓ | **added** | **added** | **FIXED this PR** — was Report-only |
| Business **post** (provider-post) | ✓ | ✓ | ✓ | complete |
| Business **comment** (provider-post) | **added** | **added** | ✓ | **FIXED (follow-up PR)** — migration 0112 widened `content_reports.target_type` for `provider_post_comment`; ModerationMenu (report+block via `c.author_user_id`) now on non-own business-post comments |
| Forum thread/comment, DM, reviews, adoption, events, lost | ✓ | ✓ | — | ModerationMenu already present |

**Fixed this PR (feed comments / barks):** added a DELETE endpoint
`/api/posts/[id]/barks/[barkId]` (author-scoped, RLS `post_barks_author_all` as defence-in-depth,
no migration), a `useDeleteBark` hook, and wired `BarkModal` so a comment I authored shows **Delete**
(confirm dialog, EN+ES) and someone else's shows **Report + Block the commenter** (via
`bark.user_id`). New `moderation.*` i18n keys (EN+ES). Integration test `bark-delete` (author deletes;
non-author 404 + row survives — IDOR-safe; wrong-post 404; 401). Mobile `BarkModal` tests for both
affordance states.

**Follow-up (business-post comments):** tracked below in DEFERRED — small, needs a CHECK-widen
migration; doing it next.

**PR:** [#412](https://github.com/augustotraversa98-dot/PawPi/pull/412) (barks) +
[#413](https://github.com/augustotraversa98-dot/PawPi/pull/413) (business-post comments, migration
0112) — **MERGED**.

### A1 — End-to-end journey (lifecycle) — **VERIFIED (no new backend bugs beyond A2/A3)**

CC cannot tap a device, so the "act like a user" journey is realized as API-level integration
coverage against real Postgres (as `pawpi_app`, FORCE RLS). **Every lifecycle stage already has a
passing integration test**, and this run added two more:

| Journey step | Integration coverage |
|---|---|
| signup → onboarding (profile created lazily) | `onboarding-rls` |
| create pet | `pets-rls` |
| reminders / care ring / streak | `care-ring`, `care-streak` |
| post moment · paws/barks · milestones · day-card | `social-rls`, `feed-milestones`, `day-card`, **`bark-delete` (new)** |
| invite + accept caregiver | `family-caregiver-rls`, `caregiver-health-logs` |
| book provider → cancel | `generalized-booking-rls` |
| weekly digest / streak | `weekly-digest`, `care-streak` |
| delete account | `account-deletion` |
| demo content excluded from real feeds | **`demo-content-guard` (new)** |

Full suite green: **web integration 1020 / vitest 2023 / mobile jest 1887** at closeout. The only
backend defects found this run were A2a/A2b/A3 (all fixed). No further lifecycle bugs surfaced.

### A2c — Navigation "layers on top of layers" — **P2 → FIXED (PP1, [#417](https://github.com/augustotraversa98-dot/PawPi/pull/417)) · still needs an on-device feel check**

**Root cause (code-level).** `search` is declared `presentation: "modal"` in
`src/app/_layout.jsx`. Discovery/search opens as a modal; tapping a pet does
`router.push("/pet-profile")` (a normal **card**), which stacks *over* the modal, and opening a photo
adds another layer — the "modal-on-modal" feel. `pet-profile` itself is already a card push (good).

**Fix shipped (PP1, [#417](https://github.com/augustotraversa98-dot/PawPi/pull/417)).**
- `_layout.jsx` — `search` is a plain **card push**; `presentation: "modal"` removed. The chain
  Discovery → pet-profile → photo now lives on **one back stack**.
- `search.jsx` — the header affordance reads as **back** (`ChevronLeft`) instead of a modal-dismiss
  `X`, with a localized a11y label (`common.back`, already EN+ES). The clear-query `X` is untouched.
- **Photo viewer checked:** there is no separate full-screen photo route — a tapped photo opens
  `PostDetailModal` (`presentationStyle="pageSheet"`). With `search` now a card that page sheet is the
  **only** modal in the chain, which satisfies the "never stack a modal on a modal" rule. `BarkModal`
  can't stack on it either (`onOpenBarks` closes the detail sheet first).
- Deep link `/search` and the tab's initial route are unchanged.
- Guards: `navigation-layers.test.js` (source-level nav contract — `search`/`pet-profile` must never
  be modals) + `search.test.jsx` back-affordance and push-only tap-through tests. Mobile jest 1891.

**Left as-is on purpose (follow-up decision, not a regression).** `notifications` and `messages` are
still `presentation: "modal"` and both `router.push` cards from inside themselves — the same shape as
the search bug. PP1 was scoped to Search/Discovery, so they were **not** changed blind; whether they
should become cards depends on whether swipe-down-to-dismiss is the right feel for them.

**⚠️ STILL NEEDS ON-DEVICE CONFIRMATION (punch list).** Swipe-back through
search → pet-profile → photo, and whether losing swipe-down-to-dismiss on search feels right.

### A3 (remaining audits) — interactive controls · empty states · i18n · responsive/a11y

- **Interactive controls — clean.** Repo-wide scan found **no dead/broken/no-op handlers**: the only
  two `onPress={() => {}}` are intentional (a **disabled** adoption status button + the moderation
  sheet's backdrop swallow). No "coming soon" stubs in app screens (the matches were input
  placeholders); a single TODO. No broken nav targets found.
- **Empty states — honest.** Feed/search/messages and the engagement surfaces have real empty-state
  copy (`feed.empty`, `search.nothingHere`, `messages.empty`, …) — no fabricated fillers (reinforced
  by the A2a demo-guard).
- **i18n parity — enforced, two gaps.** `i18n.test.js` enforces EN/ES key parity; A2b + A3 kept both
  catalogs in sync. **Gaps flagged (DEFERRED):** the shared `ModerationMenu` component labels
  ("Report"/"Block user"/reason labels) are hardcoded English, and the iOS permission usage strings
  are EN-only.
- **Responsive / accessibility — mostly code-clean; punch-list the visual.** Moderation controls
  carry `accessibilityRole`/`accessibilityLabel`; images use `expo-image` with sizing. Small-screen
  (iPhone SE) text overflow/truncation and contrast can only be confirmed on device → punch list.

### A4 — Abuse / security hardening — **STRONG; one gap (rate-limiting)**

- **RLS / authz — comprehensively proven.** **48 `*-rls` integration test files** exercise the real
  handlers as `pawpi_app` under FORCE RLS and assert cross-user / cross-pet / cross-business /
  cross-tenant **denial** (owner-private, pets, social, provider-business, care-access,
  family-caregiver, chat + owner messaging, payments, prescriptions, adoption, insurance, shop,
  places, notifications, push-tokens, …). The new `bark-delete` test adds an explicit IDOR check
  (non-author DELETE → 404, row survives). The `biz_*` notify + caregiver paths resolve recipients
  via SECURITY DEFINER readers (0093/0109) without loosening own-row RLS.
- **Input validation — present** on write routes (integer-id guards, required-field 400s, report
  `target_type`/`target_id`/`reason` allow-lists, caption length cap, on-submit content-moderation
  filter for posts/barks).
- **Rate-limiting — GAP (DEFERRED).** No application-level rate-limiting on write endpoints (no
  429/limiter found). Auth + RLS + content-filter mitigate abuse, but a determined authed user can
  spam writes. **Recommendation:** add lightweight rate-limiting (edge via Railway/Cloudflare, or a
  small per-identity limiter) on the highest-risk writes (posts, barks, reports, messages, bookings).
  Not built here — it needs a shared store + design; flagged as a hardening follow-up.

---

## PHASE C — Legal (Privacy Policy + Terms, EN + ES)

**Data-collection audit (from the live schema).** PawPi collects/processes: account+email+auth
(hashed passwords), pet profiles, **health/medical data** (incl. microchip, vet + emergency contact
+ insurance details the user enters), **location** (nearby, walks, pet-taxi live-share, lost&found;
coarse-geo leaderboard opt-in), photos/videos + social content, **caregivers/shared custody** (scoped
+ revocable), **push tokens** + notification prefs, **payments/orders** (amounts, shipping address;
processors keep card data), adoption applications, legal-consent records, and device/usage
diagnostics. Subprocessors: Supabase (DB), Railway (hosting), Expo (push), MercadoPago/Binance/Stripe
(payments), Resend (email), Uploadcare/media-upload (storage), Google Maps (maps).

**Delivered.**
- Rewrote `docs/legal/privacy-policy.md` (EN) — expanded with legal bases, a subprocessor table, push
  tokens, coarse-geo, caregivers, retention specifics, and a **DRAFT — not legal advice** stamp.
- Rewrote/stamped `docs/legal/terms-of-service.md` (EN) — added the DRAFT stamp + a caregivers/shared
  access section (UGC/moderation, health-not-diagnostic, payments, liability already strong).
- Added full **ES** translations: `privacy-policy.es.md`, `terms-of-service.es.md` (Argentine
  Spanish; kept in sync with EN).
- Added `docs/legal/LEGAL-REVIEW-CHECKLIST.md` — the 12-point list for counsel + the publishing steps.

**Reachability.** In-app links are config slots (`EXPO_PUBLIC_PRIVACY_POLICY_URL` /
`EXPO_PUBLIC_TERMS_URL`, `constants/legal.js`) consumed by Settings + the signup consent line, and
resolve to the hosted `pawpi-legal` GitHub Pages repo. **Tats action:** publish the reviewed drafts
to `pawpi-legal`, set the effective date, drop the DRAFT banner, confirm the env vars point live.

**PR:** _docs/legal-privacy-terms-en-es (pending push/CI/merge)._

---

## PHASE B — Performance

**Method.** Index audit (compared every hot query's WHERE/JOIN/ORDER columns against
`pg_indexes`), N+1 review of the hot API routes, and **`pg_stat_statements`** on prod (the
gold-standard evidence — independent of table size).

**Evidence (top app queries by total time on prod, `pg_stat_statements`):**

| Query | Calls | Mean |
|---|---|---|
| `SELECT id FROM user_profiles WHERE auth_user_id = $1` (identity, every request) | 95,498 | **0.04 ms** |
| vet_appointments (reminders/bookings view) | 5,859 | 1.50 ms |
| threads (chat inbox) | 5,232 | 1.45 ms |
| vet_appointments (booking view) | 3,229 | 2.01 ms |
| provider_staff membership check | 10,621 | 0.30 ms |
| adoption_applications | 4,069 | 0.75 ms |

No app query exceeds ~2 ms mean; the identity lookup that runs on nearly every request is 0.04 ms.
Everything above the app rows in the raw output is Supabase internal (pgbouncer auth, role/extension
introspection, WAL) — not PawPi's queries.

**Index coverage.** The retention-critical paths are already indexed on their scoped columns:
`notifications(recipient_user_id, created_at DESC)`, `posts` created_at/pet/user, `pet_follows` both
directions, `pet_care_days(pet_id, day)`, `vet_appointments` (pet/owner/provider/date/start_at), the
0111 demo-exclusion is backed by partial `idx_user_profiles_is_demo` / `idx_providers_is_demo`.
N+1s are avoided — discover/feed compute paw/bark counts via `LEFT JOIN` grouped aggregates, not
per-row fetches.

**Conclusion.** No index migration or query rewrite is warranted right now — the data is small and the
hot paths are fast and indexed. Shipping a speculative index would add write-amplification with no
measured benefit. **Deliberately NOT shipping a make-work migration** (surgical-change discipline).

**Optional follow-ups (flagged, not shipped):**
- **Redundant duplicate indexes** exist (e.g. `idx_posts_pet` + `idx_posts_pet_id`, the doubled
  `post_paws`/`post_barks` post/user indexes) — SCHEMA_NOTES already flags them. A future cleanup
  migration could drop one of each pair to cut write cost; low benefit at current scale, so left for a
  dedicated, carefully-verified cleanup.
- **Re-profile as data grows.** `pg_stat_statements` is enabled on prod — re-run the query above
  periodically; add a partial `notifications(recipient_user_id) WHERE read_at IS NULL` index only if
  the mark-all-read path ever shows up hot.

---

## PHASE D — Apple submission prep (build-to-`eas submit`-ready + runbook; CC never submits)

**Delivered.**
- **`docs/app-store-submission-runbook.md`** (new): ordered one-time prerequisites (App record, Push
  capability, `eas credentials`/APNs key, `appleId`, legal URLs, review demo account) → build →
  submit → ASC listing → screenshots + localized metadata → Submit for Review, with the exact `eas`
  commands. Explicitly documents what CC did **not** do (no Apple login/submit).
- **`eas.json`**: added the `appleId` placeholder under `submit.production.ios` (ascAppId
  `6785949610` + appleTeamId `YHQ4T9T96K` already present; `appVersionSource: remote` +
  `autoIncrement` manages buildNumber).
- **`docs/app-store-privacy-data-map.md`** (new): the App Privacy "nutrition label" derived from
  Phase C — Contact Info, User Content, Location (precise + coarse), Identifiers (User ID + push
  Device ID), Purchase History; Tracking = No, Analytics = None, Data deletion = Yes.
- **ES App Store metadata** (`app-store-connect-content.md` §13): Spanish subtitle, promo text,
  description, keywords, "What's New".
- **Cross-checked** `app-store-readiness.md` + `guideline-1.2-audit.md`: the 1.2 UGC requirements
  (Report + Block on posts AND comments) are now fully satisfied after A3/A3-follow-up.

**Config status.** version `1.0.0`; bundle `com.pawpi.app`; iPhone-only (`supportsTablet:false`);
`ITSAppUsesNonExemptEncryption:false`; permission usage strings present (EN). **EN/ES permission
strings** need `CFBundleLocalizations` + per-locale `InfoPlist.strings` (config-plugin/prebuild) —
not a blocker (English usage strings are accepted); flagged in the runbook + punch list.

**Tats next-steps (from the runbook):** fill `appleId` → `eas credentials` (APNs) → publish reviewed
legal to `pawpi-legal` + confirm the URL env vars → `eas build -p ios --profile production` →
`eas submit -p ios` → paste EN+ES metadata + App Privacy → shoot iPhone 6.9"/6.7" screenshots →
Submit for Review.

**PR:** _docs/apple-submission-runbook-phase-d (pending push/CI/merge)._

---

## ON-DEVICE PUNCH LIST (visual/interaction items CC cannot confirm headless)

- **Feed card (PostCard) has no inline ··· moderation** — Report/Block/Delete are reachable only by
  opening the post detail. Confirm on device this feels acceptable; a card-level overflow menu is a
  nice-to-have (not an Apple blocker since Report is reachable).
- **Bark/comment Delete + Block feel** — verify the new trash icon + confirm dialog and the
  Report/Block sheet look right on device (added headless; A3).
- **A2c navigation feel** — after the recommended `search` modal→card change (see A2c), verify on
  device that Discovery → pet profile → photo pushes as a real back stack (no modal-on-modal), iOS
  swipe-back works through the chain, and dismissing search still feels right.
- **Responsive / small-screen (A3)** — check iPhone SE vs large: text overflow/truncation, safe-area
  insets, and contrast on the main screens (feed, health/today, vet record, discovery, booking).
- **Timestamps on device (A2b)** — confirm real relative times render (e.g. "5m", "hace 2 h", "ayer")
  and no post shows a fabricated "just now".
- **Demo content gone from real feeds (A2a)** — on a fresh (non-demo) account, confirm Discover /
  Search / Suggested / provider+adoption discovery no longer show Mango, the seed clinic, or the
  filler "fans".

## DEFERRED / BLOCKED

- **ModerationMenu labels are English-only (EN/ES parity).** The shared `ModerationMenu`
  ("Report", "Block user", the report-reason labels) is hardcoded English — a pre-existing parity
  gap on every moderation surface, not introduced here. Flagged for an i18n pass (localize the
  `ModerationMenu` component + `REPORT_REASONS`). Not an Apple blocker (the actions work); tracked
  for the A3 i18n sweep.
- **iOS permission usage strings are EN-only.** Localize via `CFBundleLocalizations: ["en","es"]` +
  per-locale `InfoPlist.strings` (needs a config-plugin / prebuild step). Not a submission blocker —
  English usage strings are accepted — but recommended for the ES store listing (A3/Phase D).
- **No application-level rate-limiting on writes (A4).** Auth + RLS + content-filter mitigate abuse,
  but there is no per-identity write throttle. Recommend edge (Railway/Cloudflare) or a small
  per-identity limiter on posts/barks/reports/messages/bookings. Needs a shared store + design; not
  built here.
- **Redundant duplicate indexes (Phase B).** Harmless but add write cost; a future cleanup migration
  can drop one of each pair (SCHEMA_NOTES lists them). Low benefit at current scale.
- **`PawPi_instructions.md` snapshot refresh — left to Augusto.** The file has **uncommitted local
  edits** in the working tree, so CC did not modify it (avoids clobbering WIP / mixing unrelated
  changes). This report's executive summary is the authoritative night-run snapshot; fold the
  highlights into `PawPi_instructions.md` when convenient.

---

## Follow-up: Pre-launch Polish Fix-pack (PP1–PP3) — 2026-08-15

Three of the DEFERRED items above are being closed by the fix-pack driven from
[docs/pre-launch-polish-fixpack.md](pre-launch-polish-fixpack.md). Status per ticket:

| Ticket | Closes | Status |
|---|---|---|
| **PP1** — Search/Discovery card push | A2c "layers on layers" | ✅ **FIXED** — [#417](https://github.com/augustotraversa98-dot/PawPi/pull/417) · ⚠️ on-device feel check owed |
| **PP2** — EN/ES parity | ModerationMenu labels + EN-only iOS permission strings | _in progress_ |
| **PP3** — Write rate-limiting | A4 rate-limiting gap | _queued_ |
