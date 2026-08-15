# PawPi — Business / Provider surface (design of record)

**Owner:** Tats · **Started in Cowork:** 2026-08-15 · This is the DESIGN of record for the
business/provider side of PawPi (the "business mode" app: Today · Bookings · Messages · Profile,
plus the provider web dashboard). Live build status lives in `docs/roadmap.md` + `docs/night-run-log.md`.
Update this doc whenever the business surface changes (Rule 6 — docs always mirror the as-built system).

## What exists today (as-built)

- **Business mode shell** — `apps/mobile/src/app/business/_layout.jsx`: Today (`index`) · Bookings ·
  Messages · Profile. A staff-only account is routed here post-login; a both-owner-AND-staff account
  reaches it from the pet-app More menu. Reflects the active provider (`activeProviderStore`).
- **BX1 — Profile + Log out (shipped).** The business Profile tab has an account section: identity +
  Settings + "Switch to Pet app" (dual accounts) + Log out (clears session → auth).
- **BX3 — Settings navigation (shipped).** Settings was pushing into the pet-owner tab group (dropped the
  user into pet context; back went to the pet feed). Fixed: the settings UI is now a shared,
  route-agnostic `AppSettings` component; the business route mounts it in-context (back → business
  Profile). Pet-owner More → Settings unchanged.
- **BX4 — Mode-aware notification settings (shipped).** `AppSettings` takes a `mode` prop; business mode
  hides the pet-owner categories + Walk-tracking/Apple-Health block. A server-side `notification_prefs`
  table (migration 0108, own-row RLS) gates delivery; `app_notify()` no-ops a business category when the
  recipient disabled it. **Audit finding that motivated Notifications v2 below:** the ONLY notification
  PawPi emits to a business today is a walk/job request — regular bookings notify only the pet owner,
  chat fires nothing, orders/adoption applications don't notify the provider at all.
- **Deep provider management** (services/products/hours/adoption listings) lives on the PawPi web
  dashboard, not the mobile shell.

---

# Business / Provider Notifications v2 (BN2) — DESIGNED 2026-08-15, QUEUED

**Problem:** businesses receive almost no notifications (only walk/job requests), and PawPi has **no
server→phone push layer** — the mobile app only schedules *local* reminders (`expo-notifications`) and
server events write to the in-app bell (`app_notify`); there is no device-push-token registration and no
`expo-server-sdk` send on the web. So important business events can't reach a phone.

**Goal:** (1) actually emit the business notifications owners care about, to the owner **+ the relevant
staff**, and (2) build the remote-push foundation so the *important* ones ring the phone while
engagement stays in-app only.

**Decisions (Tats, 2026-08-15):** channel split = the proposed split (below); recipients = owner +
relevant staff; sequencing = **build both now** (emission + remote-push foundation), accepting that iOS
delivery stays dark until APNs/Expo credentials are configured against the Apple Developer account (same
dependency as the widget PR #187).

## Channel model — the catalog (shared web + mobile)

Every business notification ALWAYS writes an in-app bell row. Phone push is governed by the category's
channel class + the recipient's pref:

| Category (key) | Event | Channel class | Phone push default | Recipients |
|---|---|---|---|---|
| `biz_booking` | New booking / appointment request | PUSH | ON (toggle) | owner + assigned staff |
| `biz_booking_change` | Client cancels / reschedules | PUSH | ON (toggle) | owner + assigned staff |
| `biz_order` | New product order / purchase | PUSH | ON (toggle) | owner (+ staff if assigned) |
| `biz_message` | New client chat message | PUSH | ON (toggle) | business participants (owner + staff in thread) |
| `biz_adoption_application` | New adoption application | PUSH | ON (toggle) | owner (+ listing manager staff) |
| `biz_walk_job` | Walk / job request (existing) | PUSH | ON (toggle) | targeted walker / eligible staff |
| `biz_review` | New review | OPTIONAL_PUSH | OFF (toggle) | owner |
| `biz_payout` | Payment / payout received | OPTIONAL_PUSH | OFF (toggle) | owner |
| `biz_post_engagement` | Paws / comments on the business's posts | IN_APP_ONLY | never | owner (+ author staff) |
| `biz_follow` | New follower of the business | IN_APP_ONLY | never | owner |

**Push-send rule** (runs after `app_notify` creates the bell row):
- IN_APP_ONLY → never push.
- PUSH → push unless the recipient's `notification_prefs` row for that category is explicitly disabled
  (absent row = ON).
- OPTIONAL_PUSH → push only if the recipient explicitly enabled it (absent row = OFF).
- If pushing: look up the recipient's device push tokens and send via Expo.

## Data / DB

- **`device_push_tokens`** (new, migration 0109): id, user_id → user_profiles.id, token, platform
  (ios/android), updated_at; UNIQUE(user_id, token). ENABLE+FORCE RLS own-row; app runs as pawpi_app.
- **`notification_prefs`** (existing, 0108): reused for the per-category push preference. Semantics per
  the catalog default (PUSH → absent=ON; OPTIONAL_PUSH → absent=OFF). New category keys added to the
  shared catalog; no schema change unless a default-seed is needed.
- Integer IDs; own-row RLS; no fake data; EN+ES on every surface.

## iOS / Apple caveat (must be documented, not silently skipped)

Real iOS remote push requires APNs credentials configured in Expo/EAS against the Apple Developer
account. The push-SEND layer will be built and unit-tested (Expo client mocked), but on a device it will
only deliver where credentials exist; for unconfigured platforms it must **log-and-no-op, never crash**.
CC must write the exact "what Tats must configure in EAS/Apple to light up iOS push" steps into the
night-run-log so it's actionable when the Apple account is ready.

## Build order — 3 PRs, one autonomous CC wave

- **PR1 — Remote-push foundation. ✅ SHIPPED 2026-08-15** (`feat/bn2-pr1-push-foundation`; migration 0109
  awaits hand-apply). Mobile device-push-token registration (reuses the startup permission — no cold
  prompt; no-ops on simulators) → stored via `POST /api/push-tokens` (own-row `device_push_tokens`, 0109).
  Web push-send layer (`expo-server-sdk`): `sendPush()` resolves recipient tokens (DEFINER reader) + sends;
  wired as a post-`app_notify` hook in `safeNotify` that consults the catalog channel class + the
  recipient's pref (`notification_prefs`) and pushes per the rule below. Bilingual (EN+ES) push copy in the
  recipient's locale. Migration 0109 (`device_push_tokens` + 3 DEFINER readers) + `verify_0109.sql`.
  Graceful no-op when creds/tokens/table absent (never crashes, never blocks the action). Catalog stubbed
  with today's types (`walk_request_*` = PUSH; everything else IN_APP_ONLY) — PR2 fills it in. **iOS
  delivery dark until APNs configured — steps in `docs/night-run-log.md`.**
- **PR2 — Business notification emission + catalog. ✅ SHIPPED 2026-08-15** (`feat/bn2-pr2-business-emission`;
  migration 0110 awaits hand-apply). Each action route emits to owner + relevant staff via one resolver
  `notifyProviderTeam` (`app_provider_active_staff_ids`, since the owner is enrolled as active staff):
  booking create (`biz_booking`), client cancel/reschedule (`biz_booking_change`), product order create
  (`biz_order`, both checkout paths), client chat message (`biz_message`, client→business only), adoption
  application submit (`biz_adoption_application`); walk/job kept. Engagement is IN_APP_ONLY (a bell, never
  a push): paws/comments (`biz_post_engagement`) + new follower (`biz_follow`, owner-only), each only on a
  genuinely new row. Shared channel catalog added web + mobile (category → PUSH class + type↔category
  maps). Bilingual EN+ES bell + push copy. Migration 0110 widens `notifications_type_check` for the
  `biz_*` types. Harness-proven end-to-end (real router, owner+staff recipients, no cross-business leak,
  idempotent). `biz_review`/`biz_payout` reserved in the catalog (OPTIONAL_PUSH) but not emitted yet.
- **PR3 — Business Settings UI (channel-aware).** Business notifications section shows the real
  categories grouped: "Notify my phone" (the PUSH toggles) · "Optional push" (review/payout, default
  off) · an "In-app only" info group (post activity, followers — shown, not pushed). Toggles write
  `notification_prefs`; the PR1 send layer respects them. Pet-owner settings unchanged. EN+ES.

---

```
BN2 DRIVER PROMPT — PawPi Business/Provider Notifications v2 (autonomous, 3 PRs)

MODE: UNATTENDED, AUTONOMOUS run. Build 3 PRs IN ORDER — PR1 push foundation → PR2 business
emission + catalog → PR3 channel-aware business Settings — each its own PR, CI-green → merge →
deploy → log, without asking me anything. Take the recommended defaults; log any deviation.

ORIENTATION (read first): You are working on PawPi (anything/). Read ARCHITECTURE.md +
supabase/SCHEMA_NOTES.md, then docs/business-provider.md ("Business/Provider Notifications v2")
for the full design + channel catalog. Context: PawPi has NO server→phone push today (mobile
uses local expo-notifications; server events only write the in-app bell via app_notify; no
device push tokens; no expo-server-sdk). BX4 already added notification_prefs (migration 0108,
own-row RLS) + app_notify gating. Data rules: integer IDs; owner_user_id = user_profiles.id;
additive numbered migrations each with verify_XXXX.sql; new tables ENABLE+FORCE RLS + app runs
as pawpi_app; NO fake data; EN+ES on every surface. Live DB is at migration 0108 — use the next
number (0109).

PR1 — Remote-push foundation:
- Mobile: register the device's Expo push token (request permission at a sensible moment, not
  cold on launch); persist via POST /api/push-tokens into a new device_push_tokens table
  (migration 0109: id, user_id→user_profiles.id, token, platform, updated_at, UNIQUE(user_id,
  token); ENABLE+FORCE RLS own-row) + verify_0109.sql.
- Web: a push-send layer using expo-server-sdk — sendPush(recipient, {title, body, data})
  resolves the recipient's tokens and sends. Wire it as a post-app_notify hook: after a bell row
  is created, consult the shared channel catalog (PR2 adds it; for PR1 stub the catalog with the
  existing types) + the recipient's notification_prefs, and push per the rule (IN_APP_ONLY→never;
  PUSH→unless disabled; OPTIONAL_PUSH→only if enabled). MUST log-and-no-op (never crash) when
  credentials or tokens are absent (iOS APNs is not configured yet).
- Write into docs/night-run-log.md the EXACT EAS/Apple steps Tats must do to light up iOS push.
- Tests: token upsert + RLS own-row; sendPush gating (mock the Expo client) — disabled/absent
  behave per the rule.

PR2 — Business notification emission + channel catalog:
- Add the shared channel catalog (web + mobile) exactly per docs/business-provider.md's table
  (categories, channel class, default push, recipients).
- Emit provider-facing notifications by locating each action route and calling the notify path
  to the owner + the RELEVANT STAFF: booking create, booking cancel/reschedule, order create,
  chat message send, adoption application submit. Keep walk/job. Engagement (post paws/comments,
  new follower) create IN_APP_ONLY bell rows for the business (never pushed).
- Resolve recipients via the providers/staff schema (owner + assigned staff / thread participants
  / listing manager). Never double-notify the actor; never leak across businesses.
- Tests: each event notifies the right recipients (owner + staff), engagement stays in-app-only,
  push-eligibility respected.

PR3 — Channel-aware business Settings UI:
- Business notifications section shows the real categories grouped: "Notify my phone" (PUSH
  toggles, default on) · "Optional push" (review/payout, default off) · "In-app only" info group
  (post activity, followers — shown, not pushed). Toggles write notification_prefs (BX4); the PR1
  send layer respects them. Pet-owner Settings UNCHANGED. EN+ES.
- Tests: business mode renders the grouped categories; toggling writes the pref; pet mode intact.

RECOMMENDED DEFAULTS: reuse notification_prefs (no new prefs table); catalog default drives the
absent-row meaning (PUSH=on, OPTIONAL_PUSH=off); recipients = owner + relevant staff; push-send
degrades gracefully with no creds; leave pet-owner E5 local/AsyncStorage prefs as-is.

Per PR: CI-green → merge (merge commit + delete branch) → apply migration + verify + Railway
healthy (if this env can't apply DDL, log "0109 awaits hand-apply" + degrade cleanly) → append a
night-run-log.md entry (what shipped, PR, migration, test deltas, decisions/deviations, which
events now emit + to whom) + update docs/roadmap.md + update docs/business-provider.md as-built.
Flag "NEEDS ON-DEVICE CONFIRMATION" + the iOS/APNs setup steps. STOP only if a PR can't go green
after real effort (BLOCKED entry). START A NEW CLAUDE CODE CHAT.
```

## Open items (tracked)

- **iOS remote push** is blocked on APNs/Expo credentials tied to the Apple Developer account (same
  dependency as widget PR #187). Push-send is built + degrades gracefully; iOS delivery lights up once
  configured.
- **Notification unification** — business categories are server-side (`notification_prefs`); the
  pet-owner E5 preferences remain client-side (AsyncStorage). Unify onto one backend later if desired.
- **Staff routing depth** — v1 routes to owner + the directly-relevant staff; richer per-staff routing
  rules can follow with real multi-staff usage.
