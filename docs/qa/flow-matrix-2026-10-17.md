# Flow correctness matrix — 2026-10-17

Night run #2, PRs F1–F3. Method per flow: read the code path end to end (screen → API → DB → cron/notification → recipient screen), write the matrix (trigger, expected rows/state on both sides, expected notification, verified-by-code?, bug?), then prove with tests and fix. Findings come from read-only code audits (nothing was run against production or any live DB) and were re-verified while fixing. "NEEDS-HUMAN" = needs a migration/RLS/index/entitlement or a product decision — exact proposal included, **not** applied.

Sections are appended by each PR: **F1** (this file's first section), **F2** (owner ↔ owner), **F3** (owner ↔ business). The status table at the top of each section says what was fixed in which PR.

### Status after PR F1

| Bug | Status | Where |
|---|---|---|
| F1-01 duplicate / orphan OS notifications after relaunch | **FIXED** — deterministic OS id (= reminder id) + `petId` in payload; sweep of legacy random-id duplicates and orphans after each routines load | `utils/notifications.js`, `store/routinesStore.js`, `store/remindersStore.js` |
| F1-02 vet appointments never reach Today (Invalid Date) | **FIXED** in E2 (#656) | `hooks/useVetAppointmentReminders.js` |
| F1-03 no OS notification for vet appointments | OPEN — new scheduling path; proposed reconciler mirroring `telehealthReminders` (needs device check) | — |
| F1-04 pause/resume wipes wellness items | **FIXED** (client fallback field) + test | `store/routinesStore.js` |
| F1-05 editing a paused routine resumes it | **FIXED** in the 7 routine modals + test | `components/Health/Reminders/*Modal.jsx` |
| F1-06 first photo-area toggle gates all areas | **FIXED** (`some(...)`) | `PhotoCheckRoutineModal.jsx` |
| F1-07 complete/skip does not cancel the pending alert | **FIXED (a)** — cancel by reminder id; (b) persisting "completed" across relaunch is OPEN | `store/remindersStore.js` |
| F1-08 "Care reminders"/quiet-hours toggles don't affect local reminders | NEEDS-HUMAN (product decision: honour vs. reword) | — |
| F1-09 bell row recreated unread within 60 s | **FIXED** + test | `utils/notificationGenerator.js`, `reminderNotificationSync.js` |
| F1-10 unread counter drift | **FIXED** + test | `store/socialPetStore.js` |
| F1-11 push token stays on previous user | NEEDS-HUMAN — migration (SQL below) | — |
| F1-12…F1-26 | OPEN (see each entry; none is data-loss) | — |

## F1 — Reminders & notifications engine

Audited: 2026-10-17, branch `feat/username-backfill` (HEAD 10aa8a0f). Nothing was edited or run against any DB.
Paths are relative to the repo root. `MOB` = `anything/apps/mobile/src`, `WEB` = `anything/apps/web/src/app/api`, `MIG` = `supabase/migrations`.
Method: read the product docs (`docs/notifications-audit.md`, `docs/notifications-v2-design.md`, `docs/ops/railway-cron.md`) first, then traced every flow through code. Every bug below was confirmed by reading the exact lines (and, for F1-02, by executing the same string/Date operations in node against the installed `postgres@3.4.9` source). Nothing was reproduced on a device; items needing a device are flagged.

Legend for "verified": Y = traced line by line; Y* = traced, plus a node snippet; U = unverified.

Architecture facts that drive most findings
- Every pet-owner reminder (routine, wellness, photo, medical care, feeding, walk) is a LOCAL OS notification scheduled on the phone. There is NO server-side reminder or appointment scheduler and no cron for them. The only crons are weekly-digest, win-back, push-receipts (+ subscriptions, calendar-sync).
- The reminders store is NOT persisted (only `snoozes` is: `MOB/store/remindersStore.js:539-555`). Reminder instances are re-derived from routines on every `loadRoutines`.
- Server pushes exist for business events (always) and, behind `NOTIF_V2_ENABLED`, for owner events (bookings, adoption, walk accepted, lost alerts, opt-in digest/win-back).

---------------------------------------------------------------------------------------------------

## 1. FLOW MATRIX

Columns: trigger | expected DB / state | expected notification | verified | BUG?

### A. Routines -> Today items -> local notifications

| # | Flow | Trigger | Expected DB rows / state | Expected notification (recipient, type, EN/ES, deep link, read effect) | Verified | BUG? |
|---|------|---------|--------------------------|-------------------------------------------------------------------------|----------|------|
| A1 | Create routine (feeding/walk/photo/medical/wellness) | Save in modal -> `routinesStore.addRoutine` -> `POST /api/routines` | 1 `routines` row (`is_active=true`, `deleted_at NULL`); store gets 14 days of instances (`reminderGenerator`), one OS notif each | Local, owner, type=reminder type; title/body English only (known gap); tap -> `/(tabs)/health?section=today` (vet/vaccine -> `vet-record`) | Y | F1-06 (photo), F1-23 (meal ids), F1-26 (EN only) |
| A2 | Cold start / relaunch | App process start -> any screen calls `loadRoutines` | Store rebuilt from server | Should NOT re-arm what is already pending | Y | **F1-01 (High)** duplicates |
| A3 | Edit routine | Modal save -> `updateRoutine` -> `PUT /api/routines` | Row updated; old future instances removed, new generated, `::early` acks cleared | Old OS notifs cancelled (store ids only), new armed | Y | F1-01 (orphans), F1-05, F1-04 |
| A4 | Pause (is_active=false) | Toggle on RoutineCard -> `toggleRoutineActive` -> `updateRoutine({isActive:false})` | `is_active=false`, `deleted_at NULL`; routine still listed (dimmed); no new instances; Overdue hides it | Future OS notifs cancelled | Y | **F1-04 (High)** wipes wellness items; F1-01 orphans |
| A5 | Resume | Toggle again | `is_active=true`; instances regenerated | New OS notifs armed | Y | F1-04 |
| A6 | Delete routine | `deleteRoutine` -> `DELETE /api/routines?id=` | Soft delete (`deleted_at=now()`, `is_active=false`); logs untouched; `::early` acks deleted (real skip dismissals kept - verified `reminder-dismissals/route.js:122-127`); store future instances removed, past/completed kept | Future OS notifs cancelled | Y | F1-01 (orphans survive), F1-18 (stale client) |
| A7 | Edit a paused routine | Open modal on paused routine, save | `is_active` should stay false | none | Y | **F1-05 (Medium)** silently resumes |
| A8 | Complete / log item | Today card -> `completeReminder` (+ POST log) | Log row for persistent types; store status=completed (memory only) | Pending OS alert for that item should be cancelled | Y | **F1-07 (Medium)** |
| A9 | Snooze item | Snooze sheet -> `snoozeReminder` | `snoozes[id]` (persisted), store status=snoozed | Old OS notif cancelled; new at snooze end (store-backed items only) | Y | OK; U-06 (non-store items get no re-alert) |
| A10 | Log with issue | Medical "something off" / feeding issue modal | Log (`issue_reported`, given_at = scheduledAt) | Completes ONLY that instance | Y | OK (independence verified) |
| A11 | Photo check per body area | Reminder id = `reminder_<routine>_<bodyArea>_<date>`; resolution `maxPhotoDateByArea[area]` | Per-area independent | Per-area | Y | OK for ids/resolution; F1-06 for the enable flag |
| A12 | Wellness item | id `..._<checkType>_<itemIndex>_<date>`; resolution exact key `routine:index:date` (weight = date heuristic, documented) | Independent per index | Per item | Y | F1-22 (index identity) |
| A13 | Heads-up (lead time) | `reminderTiming` on item | OS notif at event-lead; Today "Upcoming" card; `::early` ack on Close | "Upcoming: ..." EN only | Y | OK (cancelled together with the instance) |
| A14 | Upcoming tab delete / pet scope | UpcomingTab "Delete" | n/a | n/a | Y | F1-24 (Low) |
| A15 | Time-sensitive flag | `timeSensitive` on item | Drives Due Soon cards + Android priority only (`notifications.js:288`) | iOS: no interruption level | Y | F1-25 (Low, NEEDS-HUMAN) |
| A16 | "Care reminders" toggle / quiet hours (local) | Settings switches | `pawpi.notifPrefs.v1` (AsyncStorage) | Toggle OFF should stop feeding/walk/health reminders (its own hint says so) | Y | **F1-08 (Medium)** fake control |

### B. Vet appointments

| # | Flow | Trigger | DB / state | Notification | Verified | BUG? |
|---|------|---------|------------|--------------|----------|------|
| B1 | Create appointment | `POST /api/vet-appointments` (`reminder_enabled`, `reminder_timing`, `time_sensitive`) | `vet_appointments` row `status='scheduled'` | Reminder at `reminder_timing` offset, local, owner | Y | **F1-03 (High)** no OS notification is ever scheduled; calendar events have `alarms: []` (`MOB/utils/calendarIntegration.js:326`) |
| B2 | Today item | `useVetAppointmentReminders` builds `${apt.appointment_date}T${apt.appointment_time}:00` | server returns `appointment_date` as ISO (`2026-10-20T00:00:00.000Z`) | Card in Due Soon/Overdue/Next Up | Y* | **F1-02 (High)** Invalid Date -> query throws -> no vet items in Today at all |
| B3 | Reschedule | `PUT` date/time | same row | old trigger must be cancelled, new armed | Y | covered by F1-03; F1-19 (dismissal key survives) |
| B4 | Owner deletes / cancels | `DELETE /api/vet-appointments?id=` | `deleted_at`, `status='cancelled'`; provider team notified `biz_booking_change` if `provider_id` | any OS alert must die | Y | N/A today (none scheduled); U-01 (telehealth session not cancelled) |
| B5 | Provider confirm/decline/cancel | `PATCH /api/providers/:id/bookings/:apptId` | `booking_status` (+ `status='cancelled'`, `reminder_enabled=false` on decline/cancel); linked telehealth session cancelled | Owner bell row `booking_*` + (flag) push `owner_bookings`, deep link `/service/booking-summary?id=` | Y | F1-17 (race / duplicates) |
| B6 | Telehealth "starts in 5 min" | `syncTelehealthBookingReminders` every 5 min | none (reconciles vs OS pending list by `data.reminderId`) | Local; cancelled/rescheduled bookings cleaned up (excludes deleted: `me/bookings` has `deleted_at IS NULL`) | Y | OK logic; F1-14 (tap goes to Today, not the consult), F1-26 (EN only) |
| B7 | Appointment time zone | Appointment is naive wall clock; mobile builds Date in DEVICE tz | no tz column | Fires at device-local wall time | Y | See U-05 (device tz != BA) |

### C. Server notifications / push / cron

| # | Flow | Trigger | DB / state | Notification | Verified | BUG? |
|---|------|---------|------------|--------------|----------|------|
| C1 | Emit bell row | `safeNotify` -> DEFINER `app_notify` (no dedupe) | `notifications` row, `read_at NULL`; self-notify skipped (JS + SQL) | in-app, recipient | Y | F1-16 (paw duplicate) |
| C2 | Business push | `pushForNotification` (PUSH/OPTIONAL_PUSH classes, `notification_prefs` via `app_notification_pref_enabled`) | send log + tickets (flag) | EN/ES by `preferred_locale`; data `{type, subjectRef}`; tap -> `/notifications` | Y | F1-14 (dead-end tap for providers) |
| C3 | Owner push (flag) | `pushForOwnerNotification`: flag -> category pref (promo opt-in) -> quiet hours owner-local -> valid token -> atomic daily cap (3) | `notification_send_log` | EN/ES | Y | F1-15 (digest multi-pet eats cap); order/semantics correct otherwise |
| C4 | Weekly digest cron (hourly :00) | Sunday >= 18:00 owner-local, `app_weekly_digest_due` | claim `weekly_digest_state UNIQUE(pet_id,week_start)` BEFORE send; bell row; email only with opt-in | idempotent on re-run (claim in same tx as bell row; rollback un-claims) | Y | F1-15 |
| C5 | Win-back cron (daily 13:30 UTC) | `app_reengagement_due` | claim via `ON CONFLICT DO UPDATE ... WHERE last_winback_sent < now()-cap` | consent + unsubscribe gate for email | Y | F1-15 (multi-pet) |
| C6 | Push receipts cron (hourly :20) | tickets >= 15 min old | resolves tickets, marks `DeviceNotRegistered` tokens invalid, GC log > 90 d | n/a | Y | OK; idempotent |
| C7 | Quiet hours / cap | `notification_settings` (0132), `app_reserve_notification_send` | advisory lock per user; owner-local day via `user_profiles.timezone` | suppresses PHONE only, bell row still written | Y | OK. Note slot is spent before the Expo send (U-08) |
| C8 | Timezone writer | `PUT /api/user-profile/timezone` (flag) | `user_profiles.timezone` | feeds C3/C4/C5/cap | Y | U-07 |

### D. Bell, unread, deep links, tokens

| # | Flow | Trigger | DB / state | Notification | Verified | BUG? |
|---|------|---------|------------|--------------|----------|------|
| D1 | List | `GET /api/notifications` (limit 30) | recipient-scoped; `unread_count` only with flag | merged with local reminder rows + pending access | Y | U-09 (count covers rows beyond page 1) |
| D2 | Mark one read | tap DB row -> `POST /api/notifications/read {ids}` | `read_at=now()` (recipient-scoped, idempotent) | badge refetch via `["notifications"]` invalidation | Y | OK |
| D3 | Mark all read | header button -> local `markAllNotificationsRead` + `POST {all:true}` | all recipient rows | badge -> 0 | Y | **F1-09 (Medium)** local reminder rows reappear unread within 60 s |
| D4 | Local reminder row read/unread counter | `markNotificationRead` / `completeReminder` | `unreadNotificationCount` | badge | Y | **F1-10 (Low)** counter drifts |
| D5 | Push tap (OS) | `registerNotificationTapRouting` -> `pushTapRoute(data)` | none | reminder data -> Health; server push -> `/notifications` inbox; cold start parked until `markNavigationReady` | Y | F1-13, F1-14 |
| D6 | Bell row tap (DB) | `handleNotifTap` | booking/adoption/walk/digest/winback/follow route; everything else `router.back()` | | Y | F1-14 (`lost_alert`, `food_recall`, `emergency_contact`, `biz_*` dead-end) |
| D7 | Register token | `registerPushTokenAsync` after login | `device_push_tokens UNIQUE(user_id, token)` | | Y | F1-12 |
| D8 | Logout / switch | `cleanUpAfterIdentityChange`: bump epoch, DELETE token with OLD jwt, `cancelAllScheduledNotifications`, clear stores incl. `snoozes` | token row removed | | Y | OK, except F1-11 (skipped when session already expired / offline) |
| D9 | Same device, user B logs in | POST under B | A's row may linger | A's pushes reach B's phone | Y | **F1-11 (Medium-High, NEEDS-HUMAN)** |
| D10 | Notification to self / deleted items | `safeNotify` guards recipient===actor; telehealth reconciler drops deleted/cancelled | | | Y | OK |

---------------------------------------------------------------------------------------------------

## 2. BUGS FOUND (confirmed by reading code)

Severity scale: High = wrong/lost data or the core promise of a feature is broken for most users; Medium = visible defect with a workaround or limited blast radius; Low = edge case / cosmetic.

### F1-01 (High) Every app relaunch re-arms the whole 14-day window; earlier OS notifications are never cancelled (duplicates + orphans)
- Where: `MOB/store/remindersStore.js:98-136` (`addRemindersFromRoutines` de-dupes only against in-memory `get().reminders`); store not persisted (`:539-555`, `partialize` keeps only `snoozes`); `MOB/utils/notifications.js:241-308` (`scheduleNotificationAsync` is called WITHOUT `identifier`, so the OS assigns a random id that is kept only in memory); `MOB/store/routinesStore.js:106-111` (calls it on every `loadRoutines`); the only reconcile against the OS pending list is for telehealth (`telehealthReminders.js:89`) and the setup nudge. `cancelAllNotifications` runs only on identity change (`sessionCleanup.js:71-73`).
- Scenario A (duplicates): owner with a daily 08:00 feeding. Launch 1 arms 14 notifications. Force-quit, launch 2: store is empty, `existingIds` is empty, 14 more are armed. Tomorrow 08:00 the phone shows two identical "Breakfast" alerts; after N launches, N+1. iOS keeps only the 64 soonest pending local notifications (Apple limit), so duplicates also push real future alerts out of the window: with 6 reminders/day, 2 launches already shrink coverage from ~10 days to ~5.
- Scenario B (orphans survive pause/delete): launch 1 arms id X, launch 2 arms id Y (store only knows Y). User deletes or pauses the routine: `removeFutureRemindersByRoutine`/`disableFutureRemindersByRoutine` (`remindersStore.js:139-195`) cancel Y only. X still fires for a DELETED/PAUSED routine. Same for edit: the old time keeps firing next to the new one. Also a routine deleted on another device keeps firing on this one until each OS notification has fired.
- Fix (minimal, no migration):
  1. In `scheduleReminderNotification` pass a deterministic identifier: `Notifications.scheduleNotificationAsync({ identifier: reminder.id, content, trigger })` (instance ids are already deterministic: `reminder_<routine>_<item>_<date>[...]`). Same id = replaces the pending request, so duplicates become impossible. Add `petId: reminder.petId` to `content.data`.
  2. Cancel by id, not only by stored id: in `removeFutureRemindersByRoutine`, `disableFuture...`, `deleteReminder`, `completeReminder`: `cancelNotification(reminder.scheduledNotificationId ?? reminder.id)`.
  3. One-time cleanup of already-duplicated legacy notifications + orphan sweep: after `loadRoutines(petId)` commits, `getAllScheduledNotificationsAsync()`; cancel every notification whose `content.data.reminderId` starts with `reminder_` AND (`identifier !== data.reminderId` [legacy random id] OR (`data.petId === petId` AND its reminderId is not in the freshly generated id set)). Gate the legacy part with an AsyncStorage flag so it runs once.
- Test: yes, Jest (mock `expo-notifications` with an in-memory pending list): run `loadRoutines` twice with `useRemindersStore.setState({reminders: []})` in between and assert pending count == unique ids; delete routine after a simulated restart and assert zero pending for that routine. Device check: Settings > schedule 1 reminder, relaunch twice, `getAllScheduledNotificationsAsync().length`.
- Risk: medium. `identifier` replace semantics should be confirmed on Android (iOS replaces pending requests with the same identifier). The orphan sweep must be petId-scoped or it would cancel other pets' alerts.

### F1-02 (High) Vet appointments never reach Today: the hook builds an Invalid Date and throws
- Where: `MOB/hooks/useVetAppointmentReminders.js:33-34` (`new Date(`${apt.appointment_date}T${apt.appointment_time}:00`)`), `:65` (`triggerDate.toISOString()`).
- Evidence: `vet_appointments.appointment_date` is a Postgres `date` (`MIG/0005_vet_records.sql:11`) and `appointment_time` is `time` (`:12`). The server uses porsager `postgres@3.4.9` with default types: OID 1082 is parsed to a JS `Date` (`web/node_modules/postgres/src/types.js:28-34`, `from: [1082, ...]`; many routes already rely on this, e.g. `posts/streak/route.js:44` `d instanceof Date`). `GET /api/vet-appointments` returns the raw columns (`vet-appointments/route.js:46-48`), so JSON carries `"2026-10-20T00:00:00.000Z"` and `"10:00:00"`. Node check of the exact expression: `"2026-10-20T00:00:00.000ZT10:00:00:00"` -> `Invalid Date` -> `RangeError: Invalid time value` at `toISOString()`. The query function throws, React Query errors, `vetAppointmentReminders` stays `[]`. Other mobile consumers already slice defensively (`HealthVetRecord.jsx:446-448`, `calendarFormat.combineDateAndTime`).
- Failing scenario: owner books a vet visit for tomorrow -> Today shows no countdown card, no Overdue/Snoozed entry, no snooze possible, no heads-up; Vet Record "next visit" does show it (separate parser).
- Fix: replace the template with the shared parsers: `const date = parseDateValue(apt.appointment_date); const time = parseTimeValue(apt.appointment_time); const aptDate = new Date(date); aptDate.setHours(time.hours, time.minutes, 0, 0);` (both from `@/utils/canonicalDateTime`, already used by `telehealthJoinGate.js:26-31`); skip the row (do not throw) when either is null. Guard the map with try/catch per row so one bad row cannot blank the list.
- Test: yes, unit test of the queryFn with `{appointment_date:"2026-10-20T00:00:00.000Z", appointment_time:"10:00:00"}` and the legacy `"2026-10-20"/"10:00"` shapes. Existing HealthToday tests mock the hook, which is why this was never caught.
- Risk: low. Caveat: not reproduced on a device (recommend a 2-minute check with a real appointment).

### F1-03 (High) No OS notification is ever scheduled for a vet appointment
- Where: `useVetAppointmentReminders.js` only returns objects for the Today list; the only callers of `scheduleReminderNotification` are `remindersStore` (routine instances, manual reminders) and telehealth (`grep` of `src/`); calendar export uses `alarms: []` (`MOB/utils/calendarIntegration.js:326`). The form promises "Reminder: at time / 1 hour / 1 day / 2 days / 1 week before" and stores `reminder_enabled`/`reminder_timing`/`time_sensitive`, but nothing consumes them for delivery.
- Scenario: owner sets "1 day before" -> nothing rings, ever. Deleting/rescheduling cannot leave stale alerts only because none exist.
- Fix (mirror the telehealth reconciler, which is already idempotent and survives restarts): in `useVetAppointmentReminders` (after a successful fetch) call a new `syncVetAppointmentNotifications(reminders)` that reads `getScheduledNotifications()`, keeps those with `data.reminderId` starting `vet_apt_`, cancels any whose id/trigger is no longer valid (deleted, cancelled, completed, `reminder_enabled=false`, rescheduled) and schedules `scheduleReminderNotification(r)` for each eligible future trigger that is not pending (id `vet_apt_<id>`; compare trigger time like `telehealthReminders.js:98-110`). Needs F1-02 first.
- Test: yes (same style as `telehealthReminders.test.js`).
- Risk: low-medium (new scheduling path; respect F1-01 identifier scheme).

### F1-04 (High) Pausing/resuming (or any non-wellness edit through the store) wipes a wellness routine's items
- Where: `MOB/store/routinesStore.js:345-351`: for a wellness routine `wellnessCheckSchedule` falls back to `routine.wellness_check_schedule || []`, but the in-store routine is the transformed object whose field is `wellnessCheckItems` (`:80`), so the fallback is always `[]`. `toggleRoutineActive` (`:549-564`) calls `updateRoutine(id, { isActive })`. Server `WEB/routines/route.js:289-291`: `wellnessCheckSchedule ? sql.json(...) : null` - `[]` is truthy in JS, so `COALESCE([], old)` stores `[]`.
- Scenario: owner has a wellness routine with 3 checks, taps the Active switch to pause it. DB `wellness_check_schedule` becomes `[]`; the response is mapped to `wellnessCheckItems: []`; `RoutineCard` hides empty wellness cards (QA inventory), the routine is effectively lost and "resume" brings back nothing. Existing tests (`routinesStore.clearEarlyDismissals.test.js:131-144`) toggle with a canned response and never assert the PUT body.
- Fix: in `updateRoutine` use `routine.wellnessCheckItems` as the fallback (the same shape the modal sends), i.e. `: routine.wellnessCheckItems || []`; defence in depth on the server: treat an empty array as "no change" for schedule columns unless an explicit `replace:true`, or only send the schedule key when `updates.<key>` is defined (best: build the payload from `updates` only for type-specific blocks).
- Test: yes - jest: toggle on `appRoutine()` with 2 items, capture the `PUT` body, expect `wellnessCheckSchedule` to have the 2 items. Also an API test that `{wellnessCheckSchedule: []}` does not blank a populated column if the server-side guard is chosen.
- Risk: low for the client fix. Data already lost for affected users cannot be recovered from code.

### F1-05 (Medium) Editing a paused routine silently resumes it
- Where: every routine modal hard-codes `isActive: true` in its save payload: `FeedingRoutineModal.jsx:196`, `WalkRoutineModal.jsx:237`, `PhotoCheckRoutineModal.jsx:325`, `WellnessCheckRoutineModal.jsx:417,498`, `MedicationRoutineModal.jsx:87`, `PreventiveCareRoutineModal.jsx:72`, `VaccineRoutineModal.jsx:69` (only `MedicalCareRoutineModal.jsx:235` preserves it). `updateRoutine` uses `updates.isActive ?? routine.isActive` (`routinesStore.js:299`).
- Scenario: pause "Walks" for a holiday, later tweak one walk's time -> routine is active again and reminders/OS notifications are re-armed without the owner noticing. Violates "pausing differs from deleting/active state is owner-controlled".
- Fix: `isActive: editingRoutine?.isActive ?? true` in each modal (or drop `isActive` from the edit payload so the store keeps the stored value: in `RoutinesTab.handleSaveRoutine` for the editing branch `delete routineToSave.isActive`).
- Test: yes (RTL/unit on `handleSaveRoutine` or on each modal's `onSave` argument). Risk: low.

### F1-06 (Medium) Photo-check routine: the FIRST body area's reminder toggle gates every other area
- Where: `PhotoCheckRoutineModal.jsx:333` `notificationEnabled: primary.reminderEnabled` (primary = `photoCheckSchedule[0]`); `reminderGenerator.js:80` and `:1975-1978` return `[]` when `!routine.notificationEnabled`, before the per-area `schedule.reminderEnabled === false` check at `:550`.
- Scenario: areas "ears" (reminders OFF) and "paws" (reminders ON). `notification_enabled=false` is saved, so `paws` produces no Today item, no Overdue, no OS notification, although it is switched on. Other multi-item types use `.some(...)` (wellness `:506`, medical `:239`, feeding) and are correct.
- Fix: `notificationEnabled: photoCheckSchedule.some((s) => s.reminderEnabled !== false)` (and `timeSensitive` likewise).
- Test: yes (modal `onSave` payload; generator with 2 areas). Risk: low. Existing rows keep the wrong value until re-saved; optional one-off: in `loadRoutines` derive the effective flag from the items for photo routines.

### F1-07 (Medium) Completing/skipping an item does not cancel its pending OS alert, and "completed" does not survive a relaunch
- Where: `remindersStore.completeReminder` (`:258-284`) never calls `cancelNotification`; `handleSkipOverdue` (`HealthToday.jsx:383-394`) neither. Completed status is memory-only (`partialize`), and future instances are not checked against the DB logs: `reminderSections.js` only drops `completed/disabled/dismissed/snoozed`; `isInstanceResolved` is applied only to Overdue (`reminderResolution.js:172-205`).
- Scenario 1: photo check due 18:00, owner photographs at 10:00 -> at 18:00 the "Take photo" alert still fires. Same for a 1-day-early heads-up on a medical item that is already given. Scenario 2: after the owner completes the 18:00 wellness check at 17:30 and relaunches at 17:45, the instance regenerates as upcoming, is re-armed, and shows again in Next Up/Due Soon until it becomes Overdue (then it is correctly hidden).
- Fix: (a) in `completeReminder` make it async and `await cancelNotification(reminder.scheduledNotificationId ?? reminder.id)` (needs F1-01 deterministic ids to also cover relaunch), same in the skip path; (b) in `loadRoutines`, before scheduling, drop generated instances that `isInstanceResolved(r, index)` using the already-fetched log queries (or, minimal, keep a persisted `completedIds` map next to `snoozes` and filter on regenerate).
- Test: yes (a: mock notifications, assert cancel on complete; b: generator + resolution index). Risk: low for (a), medium for (b).

### F1-08 (Medium) "Care reminders" toggle and "Quiet hours" do not stop the user's own feeding/walk/health reminders
- Where: `MOB/components/Settings/AppSettings.jsx:262-270` exposes `care` with the hint "Your feeding, walk and health reminders" (ES "Tus recordatorios de comida, paseos y salud"); `SCHEDULED_CATEGORIES` comment claims CARE covers them (`notificationPolicy.js:30-32`), but `scheduleReminderNotification` (`notifications.js:241`) never reads prefs; `care` is read only by `shouldArmReminderSetupNudge` (`engagementNotifications.js:306-318`). Quiet hours (server, flag ON) read "No phone notifications while you rest" but only gate server pushes; local reminders (the bulk of notifications) ignore them.
- Scenario: owner switches "Care reminders" OFF to stop all alerts -> every reminder still rings. This is a consent-expectation mismatch (the audit's "fake controls" finding 10 is only half resolved).
- Fix (minimum): either (1) honour it - in `scheduleReminderNotification` return null when `getNotificationPrefs().care === false` (+ on toggle OFF cancel pending reminder notifications, on ON re-run `loadRoutines`), or (2) rename the hint to what it really controls and remove the claim. Quiet hours: change the hint to "pushes from PawPi servers" or apply the window to local reminders too (product decision).
- Test: yes (Jest on `scheduleReminderNotification` with prefs mocked). Risk: low-medium (product decision which behaviour is wanted).

### F1-09 (Medium) Reading a reminder row (or "Mark all read") does not stick - the row is recreated unread within 60 s
- Where: `MOB/utils/reminderNotificationSync.js:21-44` runs every 60 s; `notificationGenerator.shouldCreateNotification` (`:226-248`) blocks only an existing UNREAD row (`if (existingNotif && !existingNotif.read) return false`), so a READ row for the same reminder lets `addNotification` insert a fresh unread row with the same id `notif_<reminderId>` (`socialPetStore.js:92-103`, no id de-dupe, count +1). Overdue instances stay `OVERDUE` indefinitely (`remindersData.js:87`), so the loop repeats until the item is completed/snoozed.
- Scenario: due feeding reminder -> bell badge 1 -> owner opens the bell (row marked read) -> within a minute a new unread row and badge 1 again; "Mark all read" is undone the same way. Duplicate ids in the list also trigger React key warnings.
- Fix: in `syncRemindersToNotifications` skip any reminder that already has ANY row (read or unread) for the same `reminderId` since the instance became due (key on `reminderId` only; new row only when the instance's due-state key changes, e.g. snooze end); simplest: `if (existingNotifications.some(n => n.reminderId === reminder.id)) return;` and let snooze end create a new id (`notif_<id>_<snoozedUntil>`).
- Test: yes (unit: run sync twice around `markNotificationRead`; expect one row, count 0). Risk: low.

### F1-10 (Low) Local unread counter drifts below the truth
- Where: `socialPetStore.js:105-111` decrements `unreadNotificationCount` for every `markNotificationRead` even if the row was already read; `remindersStore.completeReminder:276-283` calls it for the matching row regardless of `read`.
- Scenario: two unread rows A,B; tap A (count 1); complete reminder A -> `markNotificationRead(A)` again -> count 0 while B is still unread (badge hides it).
- Fix: derive the count (`notifications.filter(n => !n.read).length`) in each mutator, or only decrement when the row was unread. Test: yes (unit). Risk: low.

### F1-11 (Medium-High, privacy) A push token can stay attached to the previous user and be reused by the next user on the same device - NEEDS-HUMAN
- Where: `sessionCleanup.js:55-66` deliberately skips `DELETE /api/push-tokens` when the session already expired (`if (sessionExpired) return`), and the DELETE also fails offline; `WEB/push-tokens/route.js:37-62` upserts only `(user_id, token)` and never removes the same token from other users. `device_push_tokens` is `UNIQUE(user_id, token)` (0109); RLS is own-row so the route cannot delete another user's row.
- Scenario: user A's session expires (401) on a shared/handed-over phone -> A's token row remains. User B signs in -> B registers the same Expo token. A's business/owner pushes (new booking, adoption decision, lost-pet alert, copy is generic but still reveals activity) now ring B's phone until A's row is invalidated by Expo.
- Fix: NEEDS-HUMAN migration (hand-applied, then `supabase/verify_NNNN.sql`), plus a one-line call in `POST /api/push-tokens`:
```sql
-- NNNN_claim_push_token.sql  (SECURITY DEFINER, pinned search_path, explicit grant - per CLAUDE.md rules)
create or replace function app_claim_push_token(p_token text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with d as (
    delete from device_push_tokens
     where token = p_token
       and current_app_user_id() is not null
       and user_id <> current_app_user_id()
    returning 1
  )
  select count(*)::integer from d;
$$;
grant execute on function app_claim_push_token(text) to pawpi_app;
```
  Route: after validating `token`, `await sql\`SELECT app_claim_push_token(${token})\`` (inside `softV2`-style try/catch for `42883` so it degrades before the migration is applied). No new table => no RLS change.
- Test: integration (real PG, two users, same token). Risk: low (only removes rows for a token the caller just proved they hold).

### F1-12 (Medium) Push-token registration failure/permission-denied is memoized for the whole process, and a non-2xx response counts as success
- Where: `MOB/utils/registerPushToken.js:47-77`: `registerOncePromise` caches whatever the first attempt returned (including `null` when permission was not yet granted, or when `getExpoPushTokenAsync`/network threw); `fetchImpl(...)` response is never checked for `ok`, so a 401/503 right after login is treated as registered.
- Scenario: the permission prompt is shown at app start BEFORE login (`_layout.jsx:60-65`); owner taps "Maybe later", later enables notifications in iOS Settings and returns without a cold restart -> no token is registered until the next launch. Or the first POST hits a transient 5xx -> no push for the entire session.
- Fix: only keep the memo when `response.ok`; on `null`/failure reset `registerOncePromise = null`; re-run on `AppState` 'active' (cheap) and after the permission prompt resolves.
- Test: yes (existing `registerPushToken.test.js` pattern). Risk: low.

### F1-13 (Medium) A reminder-notification tap ignores which pet it belongs to
- Where: `notifications.js:277-290` puts only `{reminderId, type, relatedTracker, relatedBodyArea}` in `data`; `notificationDeepLink.js:36-52` routes to `/(tabs)/health?section=today|vet-record`. `HealthToday` filters strictly by the current pet (`HealthToday.jsx:167-172`).
- Scenario: owner of Mango and Luna has Mango selected; Luna's "Dinner" alert is tapped -> Today shows Mango's list, the tapped item is not there, no hint why.
- Fix: add `petId` to `content.data` (see F1-01), and in `deliver()` call `useSelectedPetStore.getState().setSelectedPetId(Number(data.petId))` (store exists: `hooks/usePetProfile.js:31`) before navigating. In-app bell rows already carry `petId` (`notificationGenerator.js:23`) - do the same in `handleNotificationTap`.
- Test: yes (`notificationDeepLink.test.js` + store assertion). Risk: low. Notifications scheduled by older builds have no `petId` -> fall back to current behaviour.

### F1-14 (Medium) Several taps land nowhere
- Where: (a) telehealth OS alert: data type `telehealth` is not in `VET_RECORD_TYPES` (`notificationDeepLink.js:27-32`), so "Video consult starting soon" opens Health > Today instead of the consult/join screen. (b) bell rows for `lost_alert`, `food_recall`, `emergency_contact`, `report_received` fall into the generic mapping (`notifications.jsx:372-391`: `relatedPostId = subject_ref`) and `handleNotifTap` ends in `router.back()` (`:582`); the owner push for `lost_alert` says "Tap to see the details" (`ownerNotifications.js:101-104`) but lands on the inbox and then dead-ends. (c) business `biz_*` rows: localized headline only, then `router.back()` (`:354-368`, `:582`); provider pushes (`push.js:211-259`) open the PET-OWNER inbox `/notifications`.
- Fix: (a) add `if (data.type === "telehealth") return { pathname: "/service/telehealth" }` (verify route/params; the booking id is encoded in `reminderId` `telehealth_<id>_<ms>` via `parseTelehealthReminderId`); (b) route `lost_alert` -> `/lost-found` (exists: `app/lost-found.jsx`) with the pet id, `food_recall`/`emergency_contact` -> pet profile or `/emergency-card`; (c) route `biz_booking*` -> `/business/bookings`, `biz_message` -> `/business/messages`, others -> `/business`.
- Test: yes (pure mapping tests). Risk: low. Needs a product decision on each destination.

### F1-15 (Medium) Weekly digest / win-back send one push PER PET: an owner with 3 pets burns the whole daily cap
- Where: `WEB/engagement/weekly-digest/run/route.js:128-176` iterates pets (`app_weekly_digest_due` returns one row per pet) and calls `pushForOwnerNotification` for each; win-back likewise (`reengagement/run/route.js:153`). The cap is per user (`dailyPushCap()` = 3, `ownerNotifications.js:141-146`). All pets of an owner are processed in the same hourly run.
- Scenario (opt-in owners only): 3 pets -> three near-identical "X's week" pushes at 18:00 Sunday, `notification_send_log` shows 3 sent, and a booking confirmation later that evening is suppressed by `skipped: "cap"` (bell row still written). The design doc assumes "digest is weekly" per owner.
- Fix: in both routes keep `const pushedOwners = new Set()` and only call `pushForOwnerNotification` when `!pushedOwners.has(ownerUserId)` (add after the call). Optionally reserve one slot of cap for transactional types.
- Test: yes - extend `engagement/cronWorkflow.test.js` with two pets of one owner; expect one push. Risk: low.

### F1-16 (Low-Medium) A concurrent double-tap on "paw" notifies the owner twice
- Where: `WEB/posts/[id]/paw/route.js:43-72`: the existence check is followed by `INSERT ... ON CONFLICT DO NOTHING` with no `RETURNING`, then `safeNotify` runs unconditionally. Two overlapping POSTs both pass the check, one inserts, both notify (`app_notify` has no dedupe). `pets/[id]/follow/route.js:72-80` shows the correct pattern (`RETURNING` + notify only when a row was inserted). Un-paw/re-paw also re-notifies each cycle.
- Fix: `INSERT ... RETURNING post_id` and notify only if `inserted.length > 0`. Test: yes (route unit test with a mocked second call returning `[]`). Risk: low.

### F1-17 (Low-Medium) Provider booking actions are read-then-write without a state guard: double-tap sends duplicate notifications and can overwrite an owner cancellation
- Where: `WEB/providers/[id]/bookings/[appointmentId]/route.js:68-91` (plain SELECT, no `FOR UPDATE`), updates at `:187-199, :221, :273, :299` filter only by id/provider, then `notifyOwner(...)` always runs (`:193, :202, :256, :280`).
- Scenario: front-desk double-tap on Confirm (or retry on a slow network): both requests read `requested`, both update, owner gets two "booking confirmed" bell rows (and pushes subject to cap). If the owner cancels in between (`DELETE /api/vet-appointments`: `deleted_at` set, `booking_status` untouched), a late Confirm sets `booking_status='confirmed'` on a deleted booking and tells the owner it is confirmed.
- Fix: put the expected state in the UPDATE and notify only when it matched: `UPDATE ... WHERE id=... AND provider_id=... AND booking_status='requested' AND deleted_at IS NULL RETURNING *` (cancel: `IN ('requested','confirmed')`, complete: `'confirmed'`); if `RETURNING` is empty answer 409 and do not notify. Test: yes (existing integration harness: `provider-auto-confirm.integration.test.ts` style, two concurrent PATCHes). Risk: low.

### F1-18 (Low-Medium) `PUT /api/routines` accepts a soft-deleted routine, and the client then resurrects its reminders
- Where: `WEB/routines/route.js:257` (ownership check) and `:306` (UPDATE) lack `AND deleted_at IS NULL`; `routinesStore.updateRoutine:378-421` maps the response without `deletedAt`, then regenerates and schedules instances (`:437-442`).
- Scenario: routine deleted on phone 1; phone 2 (stale list) toggles/edits it -> 200, and `is_active` may be flipped back to true; phone 2 re-arms OS notifications for a deleted routine until its next `loadRoutines`.
- Fix: add `AND deleted_at IS NULL` to both statements (404 when none); in the store treat 403/404 as "routine gone" -> remove it locally and `removeFutureRemindersByRoutine`. Test: yes (route unit + store). Risk: low.

### F1-19 (Low) Vet-appointment dismissal/snooze keys survive a reschedule
- Where: instance id is `vet_apt_<id>` (`useVetAppointmentReminders.js:58`), date-free; `reminder_dismissals` is unique on `(owner,pet,instance_key)` and applied everywhere (`reminderSections.js:75`, `useTodayReminders`).
- Scenario: owner taps Skip on an overdue visit, then edits the appointment to next week -> the new date never shows in Today (dismissal still matches). Routine instance ids embed the date, so only vets are affected.
- Fix: id `vet_apt_<id>_<appointment_date>_<appointment_time>` or clear dismissals for `vet_apt_<id>*` on `PUT` date/time change. Test: yes. Risk: low.

### F1-20 (Low) Vet reminder `scheduledAt` is the lead trigger, so a future appointment is listed under "Overdue"; Overdue has no lookback for vets; `missed` is never set
- Where: `useVetAppointmentReminders.js:65-66` (`scheduledAt = triggerDate`), `reminderResolution.js:169-206` (PERSISTENT type; `isPastDue(scheduledAt)`), `buildOverdueReminders` merges `vetReminders` without the 30-day lookback; nothing sets `status='missed'` (`grep` of WEB). Becomes visible once F1-02 is fixed.
- Scenario: appointment next Friday with "1 week before" -> from today it is in Overdue ("N min overdue"). Appointments from months ago that were never marked complete stay in Overdue until skipped.
- Fix: keep `scheduledAt = appointment time` and use `nextTriggerAt`/lead logic via the existing `reminderTiming` path (heads-up) or add `eventTime`; apply the lookback to vets and consider a nightly `UPDATE ... SET status='missed' WHERE status='scheduled' AND appointment_date < current_date - 1` (cron; needs a decision). Test: yes. Risk: medium (product semantics).

### F1-21 (Low) Streak-save nudge cannot be cancelled
- Where: `engagementNotifications.js:97-121` schedules a DATE notification and the id is not stored; `maybeScheduleStreakSave` (`:139-165`) runs at one moment.
- Scenario: ring is one segment short at 15:00 -> notification booked for 19:00; owner closes the ring at 17:00 or switches the `streak` toggle off at 16:00 -> the "keep your streak" nudge still fires at 19:00.
- Fix: persist the id under `pawpi.streakSaveId.<day>` and cancel it when the ring closes (CareRingCard) and when the toggle goes off. Test: yes. Risk: low.

### F1-22 (Low) Wellness/photo instance identity is the array index, so deleting/reordering items remaps logs and dismissals to the wrong item
- Where: `reminderGenerator.js:1547-1553` (`reminder_<routine>_<checkType>_<itemIndex>_<date>`), `reminderResolution.js:125-129` (`routine:index:date` keys), `resolveReminderTiming` (`notifications.js:131-149`) indexes arrays.
- Scenario: routine items [teeth, ears]; "teeth" done today; owner deletes "teeth" -> "ears" becomes index 0 and is instantly "resolved" for today and inherits teeth's dismissals. Hourly/daily independence otherwise holds.
- Fix: give each item a stable `id` at creation and use it in instance ids/keys (needs a compat shim for existing dismissal keys: keep index form when `item.id` is absent). Test: yes. Risk: medium (id scheme is "locked" per the generator comment) - schedule deliberately.

### F1-23 (Low) New meal id can collide with an existing one, silently dropping a meal's reminders
- Where: `FeedingRoutineModal.jsx:152` (`id: meal_${meals.length + 1}`), generator uses `meal.id` in the instance id (`reminderGenerator.js:227, 270, 320`), store de-dupes by id (`remindersStore.js:105`).
- Scenario: add snack (meal_3), add snack (meal_4), remove first snack, add snack -> `meal_4` twice -> one snack never gets reminders/OS alerts/Today card.
- Fix: `id: meal_${Date.now().toString(36)}` (or max existing suffix + 1). Test: yes. Risk: low.

### F1-24 (Low) Upcoming tab is not pet-scoped and its "Delete reminder" is not durable
- Where: `UpcomingTab.jsx:55-72` filters only status/active routine (the store is a flat multi-pet array; HealthToday filters at `:167-172`); `deleteReminder` (`remindersStore.js:233-245`) removes in memory and cancels its OS id, but the next `loadRoutines`/relaunch regenerates and re-arms it.
- Fix: filter by `currentPet.id`; implement delete as a `reminder_dismissals` row (the Skip path) instead. Test: yes. Risk: low.

### F1-25 (Low, NEEDS-HUMAN) The "Time-sensitive" switch has no effect on iOS delivery
- Where: `notifications.js:286-290` maps `timeSensitive` only to Android `priority`; no `interruptionLevel`, and no time-sensitive entitlement in `app.json` (iOS plist block `:21-35`).
- Fix: content `interruptionLevel: reminder.timeSensitive ? "timeSensitive" : "active"` (expo-notifications SDK 54) AND the entitlement `com.apple.developer.usernotifications.time-sensitive` via config plugin + a new native build; otherwise relabel the switch. Not provable in unit tests beyond payload shape. Risk: medium (App Store entitlement review).

### F1-26 (Low, known) Local reminder copy is English-only
- Where: `notifications.js:101-104` (title/body = routine/user text), generator titles/descriptions ("Time for breakfast", `reminderGenerator.js:239`), heads-up "Upcoming:/Due ..." (`notifications.js:134-139`), telehealth (`telehealthReminders.js:92-102`), pre-permission alert (`notifications.js:81-83`), `lost_alert` body (`lost-reports/route.js:134`). Already listed as finding 12 in `docs/notifications-audit.md`; still open and violates the EN+ES rule for an es-AR audience. Fix: pass `t` into the builders (as `engagementNotifications` already does) with `reminder.type` keyed strings. Test: yes. Risk: low-medium (wide copy surface).

---------------------------------------------------------------------------------------------------

## 3. NEEDS-HUMAN summary

| Item | What | Proposed action |
|------|------|-----------------|
| F1-11 | New DEFINER function `app_claim_push_token(text)` (SQL above), hand-apply + `supabase/verify_NNNN.sql` (every row PASS), note "human-applied" in the PR | no table/RLS change; one route call |
| F1-25 | iOS time-sensitive entitlement + native build | product/App Store decision; otherwise relabel the toggle |
| F1-20 (optional) | nightly `UPDATE vet_appointments SET status='missed' ...` job | product decision; if done as SQL function + cron it needs a migration + verify file; the code-only fix is lookback + `eventTime` |

No bug above requires an index or RLS change.

---------------------------------------------------------------------------------------------------

## 4. Verified-correct behaviour (so nobody re-audits it)

- Delete vs pause semantics are implemented as specified: delete = `deleted_at` + `is_active=false`, excluded from GET, generators, overdue (`reminderGenerator.js:11-13, 80, 1975`); pause = `is_active=false` only, still listed; deleting clears `::early` acks only and leaves real skips and every health log (`reminder-dismissals/route.js:114-135`). (Caveats: F1-01, F1-04, F1-05, F1-18.)
- Independence: snooze, dismiss and complete are keyed by the instance id; instance ids contain routine + item + date (+ time for hourly), photo ids contain the body area; medical resolution matches the exact `given_at` timestamp so a morning dose never resolves the evening dose; wellness (non-weight) resolution is an exact `routine:index:date` key. No code path completes one item because another was completed (`completeReminderByTracker` exists but has no caller). Known heuristic (documented): a weight log resolves every earlier weight-check instance, and a photo resolves every earlier instance of the same area.
- Sessions: `cleanUpAfterIdentityChange` bumps an epoch so in-flight loads abandon, cancels ALL pending local notifications, clears `routines`, `reminders`, `snoozes`, bell rows, and `queryClient.clear()` runs in `auth/store.js:53`.
- Server push pipeline (flag ON): category pref -> owner-local quiet hours (Intl, DST-correct, BA fallback) -> valid token -> atomic cap under `pg_advisory_xact_lock`; bell row always written first; self-notify skipped in JS and SQL; EN/ES by `preferred_locale`.
- Cron idempotency: digest claim `UNIQUE(pet_id, week_start)` inside the same tx as the bell row (rollback un-claims); win-back claim guarded by `last_winback_sent < now()-cap`; receipts only touch unresolved tickets; every endpoint is `x-cron-secret` gated (`secretEquals`), no-ops with the flag off, no-ops cleanly with the schema missing.
- Notification read endpoints are recipient-scoped and idempotent; unread badge refetches via the `["notifications"]` prefix invalidation.
- Telehealth reminders: reconcile against the OS pending list by an id that encodes booking + trigger time; cancelled/declined/completed/deleted bookings and rescheduled times are cleaned within 5 minutes.
- Push-token DELETE/POST are idempotent; token DELETE is scoped to the caller; logout path passes the OLD jwt explicitly.

---------------------------------------------------------------------------------------------------

## 5. Unverified suspicions (NOT counted as bugs)

- U-01 Owner `DELETE /api/vet-appointments` on a provider telehealth booking does not cancel the linked `telehealth_sessions` row (only provider decline/cancel cascade: `providers/[id]/bookings/[appointmentId]/route.js:75-85`). The provider-side session list may show a ghost "Scheduled" consult. Did not trace the provider session list query.
- U-02 `generateRemindersFromRoutine`/`generateOverdueInstances` return nothing when routine `notification_enabled=false` (`reminderGenerator.js:80, 1975`), i.e. turning reminders off also removes the item from Today/Overdue. May be intended ("no reminder = no item") but conflicts with "Today shows reminders" if an owner expects a silent list. Product call.
- U-03 `PUT /api/routines` uses `COALESCE(${title || null}, title)` (and notes/description), so an owner cannot clear notes/description server-side; the value reappears after reload (`routines/route.js:262-305`).
- U-04 `POST /api/routines` has no idempotency key; a double-tap on Save before the modal closes would create two routines (distinct routine ids -> two sets of reminders). The modal calls `onClose()` immediately, so likely rare.
- U-05 Device time zone != America/Argentina/Buenos_Aires: reminders and appointments are interpreted as device-local wall clock (generator uses local `setHours`; telehealth gate documents "naive local wall-clock"). OS notifications are armed as absolute instants, so after travel old alerts stay at the old instants until regenerated (with F1-01 they also duplicate). Server-side features use `user_profiles.timezone` (BA fallback), so a traveller can see a local reminder at 08:00 device time but a digest/quiet-hour boundary at BA time. No DST issue for BA itself.
- U-06 Snoozing an item that is not in the store (Overdue/vet) records only the `snoozes` map entry: no OS alert is booked for the snooze end (`remindersStore.js:308-311`). Product may expect a re-alert.
- U-07 `timezoneSync` caches the last synced zone in a single global AsyncStorage key (`pawpi.timezoneSynced.v1`); it is removed by `clearAccountStorage`, but a logout path that does not call it (e.g. session expiry) could leave user B's `user_profiles.timezone` unset. Did not trace which logout paths call `clearAccountStorage`.
- U-08 `app_reserve_notification_send` spends a cap slot before the Expo send; if every chunk fails the slot is consumed with no push (`push.js:104-119`). Low.
- U-09 `unread_count` counts all unread rows while the bell fetches only the newest 30 (no pagination in `useNotifications`), so the badge can exceed what is visible; "Mark all read" clears it.
- U-10 Owner `PUT /api/vet-appointments {status:"completed"}` on a provider booking appears to let the owner self-complete (unlocking the review gate) and notifies the provider with "A client cancelled or rescheduled a booking" copy; also `status` is unvalidated (a bad value hits the DB CHECK -> 500). Out of this flow's scope.
- U-11 Non-vet bookings (grooming/walk/daycare rows in `vet_appointments`) are rendered in Today as "Veterinary appointment" by the same hook (description fallback `useVetAppointmentReminders.js:63`).
- U-12 Permissions requested before login at app start (`_layout.jsx:60-65`) with English-only pre-permission alert; already in the audit doc.
- U-13 `scheduledNotificationId` stays `null` for reminders created while permission was not granted; the id-based de-dupe then prevents scheduling after the user grants permission until the next process start.
- U-14 iOS 64-pending-notification limit: no budgeting beyond F1-01 (14 days x many reminders per day will exceed 64 for busy routines even without duplicates; the OS silently drops the farthest). Needs a device to quantify.

---------------------------------------------------------------------------------------------------

## 6. Suggested fix order (smallest risk / biggest user impact first)

1. F1-04 (data loss) + F1-02 (Today crash) + F1-05 + F1-06: one small client PR each, all unit-testable.
2. F1-01 + F1-07(a) + F1-13 together (deterministic notification identifiers, petId in data, cancel on complete) - the largest user-visible win.
3. F1-03 (vet appointment notifications) after F1-02.
4. F1-09/F1-10 (bell), F1-12, F1-08 decision.
5. F1-11 migration (human), F1-15/F1-16/F1-17/F1-18 server tweaks.

