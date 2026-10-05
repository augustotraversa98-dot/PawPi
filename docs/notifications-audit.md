# Notifications audit

Written **before** any nudge code (Task 3, Part A). Evidence is the code and the migrations at `main` = `8171cb4`
(PR #616). File paths are relative to the repo root; `WEB` = `anything/apps/web/src/app/api`,
`MOB` = `anything/apps/mobile/src`, `MIG` = `supabase/migrations`.

> **Scope note.** The brief for this audit was cut off after its first question ("How are notifications sent
> today? Local…"). This document answers that question in full and then covers the questions an engagement
> change needs answered next: what triggers each notification, who can switch it off, what is stored where,
> what is missing, and what is risky. Nothing was run against production: Railway env vars, Supabase data and
> whether any external scheduler calls the cron endpoints could not be checked from the repo and are marked
> **unverified**.
>
> Two things changed in parallel and are not reflected in the "today" findings below, because they are in open
> PRs: #617 (logout now cancels local notifications and unregisters the push token) and #618 (launch requests).

---

## 1. How are notifications sent today?

Four channels exist. Only one of them (local) is used for anything a pet owner is asked to *do*.

| Channel | Mechanism | Used for | Reaches the phone when the app is closed? |
|---|---|---|---|
| **Local** | `expo-notifications` scheduled **on the device** (`MOB/utils/notifications.js`) | every pet-owner reminder: routines (feeding, walks, medication, wellness, photo checks…), vet appointments, vaccines, the "video consult in 5 min" alert, the daily "come back" nudge, the streak-save nudge | yes, if the OS keeps it (see risks) |
| **Remote push** (BN2) | server → Expo Push API (`WEB/utils/push.js`, `expo-server-sdk`) to tokens in `device_push_tokens` (`MIG/0109`) | **business/provider events only** (new booking, order, message, adoption application, walk requests…) | yes (iOS delivery still needs the APNs key, `docs/LAUNCH-CHECKLIST.md`) |
| **Email** | Resend (`WEB/utils/email/index.js`) | password reset; weekly digest; win-back; admin report alerts | n/a |
| **In-app bell** | `notifications` table (`MIG/0044`), `GET /api/notifications` | everything social/transactional (paws, barks, follows, bookings, adoption, lost-pet alerts, digest, win-back…) | no, only when the app is open |

### 1a. Local notifications (device)

- One scheduler: `scheduleReminderNotification` (`MOB/utils/notifications.js:241-308`) creates a **DATE** trigger
  at the reminder time minus an optional lead time (`on_time`, `5m`, `15m`, `30m`, `1h`, `1d`, `1w`;
  `resolveReminderTiming` `:159-197` applies a lead only to wellness / photo / medication-or-supplement items).
  The OS id is stored on the in-memory reminder as `scheduledNotificationId`. No identifier is passed to the OS,
  so ids are random and **not namespaced by user or pet**; the only link back is `data.reminderId`.
- **Where reminders come from.** Routines are fetched with `GET /api/routines?petId=` and turned into 14 days of
  reminder instances by `routinesStore.loadRoutines` → `generateRemindersFromRoutine`
  (`MOB/store/routinesStore.js`, `MOB/utils/reminderGenerator.js:78`) → `remindersStore.addRemindersFromRoutines`
  (`MOB/store/remindersStore.js:97`). This runs **only when a screen calls `loadRoutines`** (Health → Today,
  Routines, Upcoming; the tab layout's mount effect). There is no background refill.
- **Vet appointments** are not scheduled as OS notifications by their hook: `MOB/hooks/useVetAppointmentReminders.js`
  only builds reminder objects for the Today list (offsets `1_hour_before` … `at_time` from
  `vet_appointments.reminder_timing`, `MIG/0005`). They reach the OS only through the same
  `addReminderFromRoutine` path.
- **Telehealth**: `MOB/utils/telehealthReminders.js` + `telehealthReminderSync.js` schedule "starts in 5 minutes"
  from `GET /api/me/bookings`, reconciled against the OS list by an id of the form
  `telehealth_<bookingId>_<triggerMs>`, every 5 minutes.
- **Daily-return nudge**: one DAILY trigger at 10:00 local, id kept in AsyncStorage `pawpi.dailyReturnReminderId`
  (`notifications.js:354-422`, scheduled from `MOB/hooks/useGettingStarted.js:104-113` once permission is granted).
  It ignores the preference/cap logic below.
- **Streak-save nudge** (E5): `MOB/utils/engagementNotifications.js:132-161` books a one-off at the learned
  send hour (mode of the last 30 cold-start hours, `notificationPolicy.js:111-131`, fallback 19:00) when the
  ring has exactly one segment left. It is the **only** scheduler that reads the preferences, and the only one
  that records a send for the frequency cap.
- **Permission**: asked once, cold, at app start, before login (`MOB/app/_layout.jsx` → `initNotifications`,
  `notifications.js:45-66`). The pre-permission alert copy (`:81-83`) is hard-coded English.
- **Tap routing**: `MOB/utils/notificationDeepLink.js` — a reminder tap opens Health → Today (vaccine / vet types
  open the Vet Record); anything else opens the bell.
- **Copy**: reminder titles/bodies come from `reminderGenerator.js` in hard-coded English plus the user's own
  routine titles and notes; telehealth copy is hard-coded English. Only the E5 nudges and the daily nudge use i18n
  keys (`engageNotif.*`, `gettingStarted.dailyReminderBody`, EN + ES).

### 1b. Remote push (BN2) — business events only

- **Tokens**: `device_push_tokens(user_id → user_profiles.id, token, platform, updated_at)`, `UNIQUE(user_id, token)`,
  ENABLE + FORCE RLS, own-row (`MIG/0109`). Registered by `POST /api/push-tokens`
  (`WEB/push-tokens/route.js:18-62`), called from `MOB/utils/registerPushToken.js` after login, once per app
  session (memoised).
- **Send**: `safeNotify` (`WEB/utils/notify.js:21-38`) writes the bell row through the DEFINER function
  `app_notify`, and only if it returned an id calls `pushForNotification` (`WEB/utils/push.js:125-162`).
- **Who gets a push** is decided by `WEB/utils/notificationCategories.js`: `PUSH` (on unless disabled) for
  `walk_requests`, `biz_booking`, `biz_booking_change`, `biz_order`, `biz_message`, `biz_adoption_application`;
  `OPTIONAL_PUSH` (off unless enabled) for `biz_review`, `biz_payout`; **everything else is `IN_APP_ONLY`**
  (`channelClassForType`, `:80-84`).
  **So no pet-owner notification type ever rings a phone** (`paw`, `bark`, `follow`, `lost_alert`,
  `emergency_contact`, `food_recall`, `booking_*`, `adoption_*`, `walk_request_accepted`, `welcome`, `pack_*`,
  `boop`, `weekly_digest`, `winback`).
- **Copy**: static EN/ES templates in `push.js` (`PUSH_COPY`, `:181-218`) keyed on the recipient's
  `user_profiles.preferred_locale` (`MIG/0107`); other types fall back to a generic string.
- **Preferences**: `notification_prefs(user_id, category, enabled)` (`MIG/0108`, own-row), edited via
  `GET/PUT /api/notification-prefs`. `app_notify` gates only `walk_request_*` in SQL (`MIG/0108:71-115`); the
  other business categories are gated in the JS send hook only.

### 1c. Email

- Provider: Resend (`EMAIL_API_KEY`, `EMAIL_FROM`; `sendEmail` never throws and no-ops when unconfigured).
- **Password reset** (`WEB/account/forgot-password/route.js`): English-only.
- **Weekly digest** (E11, `WEB/engagement/weekly-digest/run/route.js`): `POST` with `x-cron-secret`; `app_weekly_digest_due`
  (`MIG/0100`, `0107`) picks pets whose owner-local time is **Sunday ≥ 18:00**; claims `(pet_id, week_start)` in
  `weekly_digest_state`, writes a bell row and, if `weekly_digest_prefs.email_enabled` (default **off**), an email.
  Per **pet**, not per owner.
- **Win-back** (E12, `WEB/engagement/reengagement/run/route.js`): same secret gate; `app_reengagement_due`
  (`MIG/0101`) picks lapsed pets (7 days, capped one per 14 days via `reengagement_state`); writes a bell row and
  **emails whenever an address exists** (no email preference, no unsubscribe link; opt-out is per pet, in-app).
- **Locale**: `user_profiles.preferred_locale` (null → es-AR), written by `PUT /api/user-profile/locale`
  (`MOB/i18n/localePreference.js:54-66`).

### 1d. In-app bell

- `notifications(recipient_user_id, actor_user_id, type, subject_ref, body, read_at, created_at)` (`MIG/0044`),
  RLS: own-row SELECT/UPDATE, no INSERT/DELETE policy (inserts only through `app_notify`).
- `GET /api/notifications` (no unread-count field), `POST /api/notifications/read`.
- The bell screen (`MOB/app/notifications.jsx`) merges four sources: DB rows, **local reminder rows**
  (`socialPetStore.notifications`, written by `MOB/utils/reminderNotificationSync.js` every 60 s), pending
  care-access grants, and recent vet notes. The **unread badge** (`MOB/components/Feed/FeedHeader.jsx:37-47`)
  counts only the local rows + pending grants — **DB notifications never light the badge**.
- Current `notifications_type_check` types and their emitters are in appendix A.

---

## 2. What triggers a notification, and what stops it

| Notification | Trigger | Who can switch it off | Frequency control |
|---|---|---|---|
| Routine / walk / medication / wellness reminder | the routine's own schedule (14 days generated per `loadRoutines`) | per routine (`notification_enabled`), per item (`reminderEnabled`); OS permission | none beyond the routine's own cadence |
| Vet appointment reminder | `vet_appointments.reminder_timing` / `reminder_enabled` | per appointment | none |
| Telehealth "starts in 5 min" | upcoming booking | OS permission only | none |
| Daily "come back" | permission granted (scheduled once, daily 10:00) | OS permission only (no in-app toggle, no auto-cancel on revoke) | none; ignores caps and open-hour |
| Streak-save | ring one segment short, user has a streak | **`streak` toggle** (the only E5 toggle that does anything) | once per day (`recordSent`) |
| Business push | server event | `notification_prefs` per business category | none server-side |
| Weekly digest / win-back | cron endpoint (see §4) | digest: `weekly_digest_prefs`; win-back: per-pet opt-out | win-back: one per 14 days; digest: once per (pet, week) |

**E5 preferences are mostly cosmetic.** `MOB/components/Settings/AppSettings.jsx:176-272` shows four toggles
(`social`, `milestone`, `streak`, `care`) stored in AsyncStorage (`pawpi.notifPrefs.v1`,
`MOB/utils/notificationPreferences.js`). Only `streak` is read anywhere (`notificationPolicy.js:85`);
`social`, `milestone`, `care` gate nothing. The frequency cap (default 4/day) has **one writer** (streak-save), so
it cannot bind anything else. **Quiet hours do not exist**: `components/Health/Reminders/SettingsTab.jsx:40`
hard-codes `SHOW_QUIET_HOURS = false` and the action is a "coming soon" alert, though EN/ES strings exist.

Four copy builders exist with **no caller**: `buildMilestoneCountdownContent`, `buildMilestoneDayContent`,
`buildFriendPostedContent`, `buildDormantContent` (`MOB/utils/engagementNotifications.js`; keys `engageNotif.*`).

---

## 3. Database schema relevant to notifications

| Table / column | Source | RLS | Notes |
|---|---|---|---|
| `notifications` | 0044 | FORCE; own-row SELECT/UPDATE; insert via DEFINER `app_notify` | no retention / TTL, no unread column |
| `device_push_tokens` | 0109 | FORCE; own-row `FOR ALL` | no `last_seen`, no invalid-since; a token can sit under several users |
| `notification_prefs` | 0108 | FORCE; own-row | business categories only |
| `weekly_digest_prefs`, `weekly_digest_state` | 0100 | FORCE; own-row | the only real per-send log (digest only) |
| `reengagement_state` | 0101 | FORCE; own-row | the only server frequency cap (win-back only) |
| `reminder_dismissals` | 0011 | own-row | durable skip/dismiss per reminder instance |
| `routines` (`times text[]`, `days int[]`, `notification_enabled`, `time_sensitive`, schedule JSON) | 0006 | own-row | the **source of truth** for reminders; **no server-side next-fire time** |
| `vet_appointments` (`reminder_enabled`, `reminder_timing`, `time_sensitive`) | 0005 | own-row | |
| `user_profiles.preferred_locale` | 0107 | owner-private | CHECK null/en/es |
| `user_profiles.timezone` | 0094 | owner-private | **read by many routes, written by none** (see §5) |

**Missing for any server-driven nudge:** a notification/nudge **send log** (nothing records what was sent to
whom, so there is no cap, dedupe or analytics for push), a **quiet-hours** store, a **timezone writer**, a push
**invalid-token** column, and a pet-owner **push preference**.

---

## 4. Findings, ranked

### High — correctness / privacy
1. **Local reminders survive logout** (and so does the push-token association). Nothing called
   `cancelAllNotifications` or `DELETE /api/push-tokens`; the privacy text claims tokens are removed
   (`docs/legal/privacy-policy.md:163`). Also the once-per-session token memo meant a second user on the same
   device never registered. → **Fixed in #617** (not in `main`).
2. **Reminders are local-only.** They die on uninstall/reinstall/new device until a screen calls `loadRoutines`
   again, stop being generated after 14 days without an app open, and are never re-armed if the OS drops them.
   Nothing server-side can fire a routine reminder. *(Inferred from code; not reproduced on a device.)*
3. **Possible duplicate OS notifications.** De-dupe is against the in-memory reminder list only, ids are random,
   and nothing reconciles the OS's pending list for non-telehealth reminders — a cold start with a still-pending
   OS notification can arm a second one. *(Inferred; unverified on device.)* iOS also caps pending local
   notifications at 64 and nothing handles that.
4. **Timezone is Buenos Aires for everyone.** `user_profiles.timezone` is read with
   `COALESCE(timezone,'America/Buenos_Aires')` (e.g. `WEB/posts/owner-posted-today/route.js:34`) but no route,
   client code or SQL ever writes it (only a test does). Digest, win-back, care ring and streak boundaries are
   therefore wrong for any user outside UTC-3.

### Medium — product
5. **Digest and win-back have no scheduler in the repo.** `.github/workflows/cron-jobs.yml` schedules only
   `/api/payments/subscriptions/run` (06:00 UTC) and `/api/providers/calendar/sync` (06:15 UTC). Nothing calls
   `/api/engagement/weekly-digest/run` (needs ≥ hourly because it matches Sunday evening) or
   `/api/engagement/reengagement/run`. **Unverified:** a Railway cron or external caller may exist.
6. **"Push" in digest/win-back is a bell row.** Both routes call `app_notify` directly and their types are
   `IN_APP_ONLY`, so no phone push is ever sent, although docs and comments say "push".
7. **Win-back emails ignore consent**: sent to any account with an address, no email preference, no unsubscribe
   footer (`WEB/engagement/reengagement/message.js`).
8. **Pet-owner events never reach the phone**: booking confirmed/declined/cancelled, adoption decisions, a walker
   accepting, lost-pet alerts are all bell-only, and the bell badge ignores DB rows.
9. **No receipt / invalid-token handling in push**: `sendPushNotificationsAsync` tickets are discarded
   (`WEB/utils/push.js:94`); no `getPushNotificationReceiptsAsync`, no `DeviceNotRegistered` pruning; `sent`
   counts attempts. Pushes also run inside the request path, sequentially per recipient
   (`AUDIT_2026-09.md` A-18).
10. **Fake / partial controls**: three of four E5 toggles do nothing; quiet hours absent; daily nudge has no
    toggle and is not cancelled when permission is revoked.
11. **Permission is requested cold at launch**, before login, with English-only pre-permission copy — low
    opt-in odds for the one channel the product depends on.

### Low — copy / i18n
12. Reminder titles/descriptions, early-heads-up copy, telehealth copy, the permission alert, password-reset
    email, bell headers/filters and the raw bodies of `lost_alert` / `food_recall` / `emergency_contact` are
    **English-only**, against the EN + ES rule.
13. **Health-copy review: no diagnostic wording found.** Wellness reminders are neutral prompts ("Check your pet's
    mobility and movement", `reminderGenerator.js:1384-1392`); `food_recall` is factual. Reminders embed
    user-entered notes verbatim, and `notificationGuiltCopy.test.js` covers only the `engageNotif`, `notifPrefs`
    and `dailyReminderBody` keys — most reminder strings have no copy test. The streak copy keeps mild loss
    framing ("keep your N-day streak safe 🔥"), consistent with `docs/pet-owner-engagement.md` E5.

---

## 5. What this means for engagement nudges

The product wants more owners to **set up reminders**; the audit says the channel that can reach them is
**local**, and that the controls around it are thin. So:

- A nudge that asks an owner with **zero routines** to set up a first reminder can be a **local** notification:
  no server scheduler, no timezone dependency, no DB change, and it can be **cancelled the moment the owner
  creates a routine**.
- It must respect what exists — the `care` preference (currently unread), the frequency cap
  (`recordSent`, currently one writer) and the learned send hour — which also makes two of the "fake" controls
  in finding 10 real.
- Server-driven nudges (push for owners, digest/win-back actually firing, per-user timezone, a send log,
  quiet hours, receipts) are larger, need migrations and a decision on who calls the cron endpoints; they are
  listed as follow-ups, not done here.

Part B of this branch implements the local first-reminder nudge only (below).

---

## 6. Part B — what shipped: the first-reminder nudge

**Reading of the brief.** The brief's Part B text was cut off, so this is the most reasonable reading of
"engagement nudges … getting users to set up reminders are the priority": one nudge, aimed at the owner who
has a pet and **no routine yet**, built only from channels that exist today (local), with the controls the
audit found missing made real for it. **No migration** and no server change were needed, so nothing for a
human to apply.

| | |
|---|---|
| Who | an owner with an active pet, notification permission granted, and a **confirmed** empty routines list (`hasReminder === false`; unknown/loading never arms or cancels) |
| What | at most **two** local notifications per pet, ever: tomorrow and +4 days, at the owner's usual open hour **clamped to 09:00-20:00** (never at night; no quiet-hours feature exists yet) |
| Copy | `engageNotif.reminderSetupTitle1/2` + `reminderSetupBody1/2`, EN + ES (es-AR voseo), positive, names the pet, no guilt, no health claims; the existing guilt-copy test scans these keys |
| Tap | opens `/(tabs)/more/reminders` (where a routine is created — the same screen the "Set your first reminder" checklist item opens) via `notificationDeepLink.pushTapRoute` (`data.nudge === "reminder_setup"`) |
| Stops | cancelled **as soon as a reminder exists** (the Feed's routines read flips to `true`); never re-armed for that pet after that, or after both slots have passed |
| Respects | the **Care reminders** toggle (`care`, previously read by nothing); the toggle hint now says it includes this tip. Not counted in the E5 per-day log: that log stores only one day and is written by streak-save, so a future-dated write would erase today's count |
| Survives | the OS list being cleared (the #617 logout cleanup): future slots missing from the OS pending list are re-armed at the **same** times; fired slots are never repeated |
| Scoping | state key `pawpi.reminderNudge.v1.<petId>`; arming/cancelling one pet never touches another; cleared with the rest of the account's storage on owner logout |
| Code | `utils/notificationPolicy.js` (pure decision), `utils/engagementNotifications.js` (`maybeArmReminderSetupNudge`, `cancelReminderSetupNudges`, `buildReminderSetupContent`), `hooks/useGettingStarted.js` (the trigger), `utils/notificationDeepLink.js` |
| Tests | `reminderSetupNudge.test.js`, `notificationPolicy.test.js`, `notificationDeepLink.test.js`, `useGettingStarted.reminderNudge.test.jsx` |

**Limits.** It needs the app to have been opened with the pet and no routine at least once (that is when the
slots are armed) and notification permission to be granted at that moment; an owner who has not granted
permission is still served by the Getting-started card's "Enable notifications" item. It cannot reach
someone who reinstalls. It is local, so it is invisible to the server and to analytics.

**Follow-ups this audit recommends (not done; they need a decision or a migration):** write
`user_profiles.timezone` from the client; schedule the digest and win-back endpoints (or remove them); a
server send log + per-user frequency cap; push for pet-owner events; Expo push receipts and invalid-token
pruning; quiet hours; make the `social` / `milestone` toggles real; localize reminder copy.

---

## Appendix A — `notifications_type_check` types and emitters

Replaced in 0044, 0050, 0051, 0061, 0065, 0080, 0086, 0092, 0096, 0097, 0100, 0101, 0110; **no migration after
0110 touches it.** "Class" is the push class from `notificationCategories.js`.

| Type | Emitted by | Class |
|---|---|---|
| `paw` / `bark` / `follow` | `WEB/posts/[id]/paw`, `…/barks`, `pets/[id]/follow` via `safeNotify` | IN_APP_ONLY |
| `lost_alert` | `lost-reports/route.js`, `…/sightings/route.js` (direct `app_notify`) | in-app (bypasses push hook) |
| `emergency_contact` | DB `app_emergency_relay_contact` (0051) | in-app |
| `food_recall` | DB `match_food_recall` (0061) | in-app |
| `report_received` | `WEB/utils/adminAlert.js` (+ admin email) | IN_APP_ONLY |
| `booking_requested/confirmed/declined/cancelled` | `providers/[id]/book`, `bookings/[appointmentId]` | IN_APP_ONLY |
| `adoption_under_review/approved/declined` | `…/adoption-applications/[applicationId]` | IN_APP_ONLY |
| `walk_request_targeted/broadcast` | `walk-requests/route.js` | **PUSH** (only DB-gated category) |
| `walk_request_accepted` | `…/walk-requests/[requestId]/accept` | IN_APP_ONLY |
| `walk_request_taken` | **no emitter** (rendered by the bell, in the CHECK) | n/a |
| `welcome`, `pack_invite/accepted`, `boop` | DB functions (0096, 0097) | in-app |
| `weekly_digest`, `winback` | the two engagement run routes (direct `app_notify`) | in-app (labelled "push") |
| `biz_booking`, `biz_booking_change`, `biz_order`, `biz_message`, `biz_adoption_application` | book, vet-appointments, checkout, thread messages, adoption applications | **PUSH** |
| `biz_review`, `biz_payout` | **no emitter** | OPTIONAL_PUSH |
| `biz_post_engagement`, `biz_follow` | provider post comments/paws, provider follow | IN_APP_ONLY |

## Appendix B — where code and docs disagree

1. `WEB/push-tokens/route.js:10` and `docs/night-run-log.md:280` say DELETE is "called on logout"; no client did (#617).
2. `docs/legal/privacy-policy.md:163`, `docs/app-store-privacy-data-map.md:37`: token removed when notifications
   are disabled; only account deletion cascades it.
3. `docs/roadmap.md:207`, route headers: digest/win-back are "push"; they are bell rows.
4. `AppSettings.jsx:176-178` and E5 acceptance: toggles gate schedulers / caps are enforced; only `streak` is.
5. Quiet-hours strings exist in EN/ES; the feature is a hidden stub.
6. `AUDIT_2026-09.md` A-08 (OS taps never deep-link) is stale — `notificationDeepLink.js` handles taps; BN2 pushes
   carry `{type, subjectRef}`, not a `route`.
7. `MOB/utils/telehealthReminders.js:10-12` says no cron is wired; `cron-jobs.yml` now schedules two jobs (still
   not the notification endpoints).
8. `docs/roadmap.md:546` (CRON_SECRET unset on Railway as of 2026-08-01) predates `cron-jobs.yml`; current state
   unverified.
9. `0108` header says `walk_requests` is the only business category; `0110` and the JS catalog superseded that
   while `app_notify` still gates only `walk_requests` in SQL.
10. `docs/pet-owner-engagement.md` still lists per-user locale for emails as deferred; 0107 shipped it.
