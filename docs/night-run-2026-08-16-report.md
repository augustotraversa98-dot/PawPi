# PawPi Pre-Launch Night Run — Findings & Report (2026-08-16 plan, run started 2026-08-15)

Live findings log for the autonomous 4-phase run (A QA/Hardening → B Performance → C Legal →
D Apple submission prep). Plan: [docs/night-run-2026-08-16.md](night-run-2026-08-16.md). Each item
is its own PR (CI-green → merge → deploy/verify → log). Severity: **P0** blocker · **P1** · **P2** ·
**cosmetic**. Status: FIXED (PR#…) · ON-DEVICE PUNCH LIST · DEFERRED · BLOCKED.

---

## Executive summary (updated as the run proceeds)

**Shipped so far:**
- (A2a) **Demo/seed content leak into real users' feeds — FIXED & MERGED** ([#410](https://github.com/augustotraversa98-dot/PawPi/pull/410); migration 0111 applied+verified on prod).
- (A2b) **Stale/dishonest + English-only "just now" post timestamps — FIXED & MERGED** ([#411](https://github.com/augustotraversa98-dot/PawPi/pull/411)).
- (A3) **Comment moderation gap — feed comments (barks) lacked Block + Delete-own — FIXED & MERGED** ([#412](https://github.com/augustotraversa98-dot/PawPi/pull/412)).
- (A3-follow-up) **Business-post (provider-post) comments lacked Report + Block — FIXED** (migration 0112 applied+verified on prod; PR pending).

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

**PR:** _feat/comment-moderation-block-delete (pending push/CI/merge)._

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

## DEFERRED / BLOCKED

- **ModerationMenu labels are English-only (EN/ES parity).** The shared `ModerationMenu`
  ("Report", "Block user", the report-reason labels) is hardcoded English — a pre-existing parity
  gap on every moderation surface, not introduced here. Flagged for an i18n pass (localize the
  `ModerationMenu` component + `REPORT_REASONS`). Not an Apple blocker (the actions work); tracked
  for the A3 i18n sweep.
