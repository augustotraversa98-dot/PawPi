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


---


### Status after PR F2

| Bug | Status | Where |
|---|---|---|
| F2-01 incoming DMs: no notification/push/badge | OPEN — bell row needs a new notification type (**SQL-1**, needs human); badge via the unused `/api/dm-threads/unread-count` is a client change not done tonight | — |
| F2-02 caregiver/family invite silent | NEEDS-HUMAN (SQL-1 for new notification types) | — |
| F2-03 "caregiver" role can read nothing through the API | OPEN — touches many read routes (medium risk) | — |
| F2-04 legacy `username` leaks / `granteeUserId` enumeration | OPEN — fixed at the data level by migration 0133 (human-applied) | — |
| F2-05 blocks not enforced on follow & paw | **FIXED** (403 either direction, no row, no notification) + hidden posts can't be pawed | `pets/[id]/follow`, `posts/[id]/paw` |
| F2-06 blocks not enforced elsewhere | **FIXED** for DM thread start, caregiver invite, lost sighting, forum vote; OPEN for pack request (inside the DEFINER fn → SQL-1) and walk join/invite | `dm-threads`, `pet-caregivers`, `lost-reports/[id]/sightings`, `forum/vote` |
| F2-08 duplicate paw → two notifications | **FIXED** (notify only when the INSERT returned a row) | `posts/[id]/paw` |
| F2-09 notification spam by toggling | NEEDS-HUMAN (SQL-1 dedupe inside `app_notify`) | — |
| F2-10 ended pack can't restart / invites can't be declined | NEEDS-HUMAN (SQL-2); friendly distinct 409 added in PR C | — |
| F2-11 pack invites unlimited | **FIXED** (`pack_request` bucket 10/h) | `pets/[id]/pack-streaks` |
| F2-12…F2-28 | OPEN (see entries) | — |
| (new, found while fixing) caregiver-invite duplicate and lost-sighting RLS rejection were *handled* errors that aborted the request transaction → **500 instead of 409/404** | **FIXED** (savepoints) | `pet-caregivers`, `lost-reports/[id]/sightings` |
| (new) forum vote accepted any target id | **FIXED** (404 for missing/hidden target) | `forum/vote` |

Product facts established while tracing: the real social graph is **one-way follows** (`pet_follows`); `pet_friendships` has no creation path in the app (F2-15), so "friend" features key on **mutual follow OR accepted friendship** (PR C).

## F2 — Owner ↔ owner

Repo: /Users/augustotraversa/Desktop/Pawpi/2026_05_23_Pawpi  (web = anything/apps/web/src/app/api, mobile = anything/apps/mobile/src, SQL = supabase/migrations)
Method: read every route, the DB helper it calls, the RLS/DEFINER SQL, the mobile hook and the recipient screen. No DB was touched. Path prefix `api/` below = `anything/apps/web/src/app/api/`; `m/` = `anything/apps/mobile/src/`.

Legend for "verified": YES = read end to end (route + SQL + recipient screen). Severity: High / Med / Low.

## 0. Ground truths confirmed up front

* `pet_follows` is the real social graph (0012; unique (follower,followed), no-self check; RLS any-authed read, write only if you own the FOLLOWER pet - 0021 l.98-128).
* `pet_friendships` has NO creation path in the app: the only `INSERT INTO pet_friendships` are in `test/integration/*.ts` and `scripts/demo-seed`. CONFIRMED. Yet four features read it as if friends existed: `api/social-walks/route.js:349-390` (friends_only discovery), `api/pets/[id]/reengagement/route.js:72-90`, `api/pets/[id]/weekly-digest/route.js:152-160`, and SQL `app_leaderboard` friends cohort (`0098_engagement_leaderboards.sql:133-138`). In production all four are permanently empty / solo. (F2-15)
* "pack-friends" route does not exist (only `api/pets/[id]/pack-streaks`). Pack requests are by partner @handle and require NO friendship/follow.
* "Mentions": there is no @mention feature anywhere (grep of web+mobile: only unrelated hits). Nothing to trace; not a bug, a gap.
* In-app bell rows (`notifications` via `app_notify`, 0044/0108) are the ONLY channel for paw/bark/follow/pack_invite/pack_accepted/boop/lost_alert/emergency_contact. None of them is a phone push: `api/utils/notificationCategories.js:67-71` returns IN_APP_ONLY for every non-business type; `OWNER_PUSH_TYPES` (`api/utils/ownerNotifications.js:25-35`) pushes only digest/winback/booking/adoption/walk_request_accepted/lost_alert and only when `NOTIF_V2_ENABLED` is on.
* Bell BADGE counts server rows only while `NOTIF_V2_ENABLED` is on (`api/notifications/route.js:52-61`, `m/utils/bellBadge.js`). With the flag off (default) a paw/bark/follow/pack invite never lights the badge.
* `app_notify` (0108 version, `supabase/migrations/0108_notification_prefs.sql:71-115`) has NO block check and NO dedupe; it only skips self/NULL recipients.
* Blocks: `app_user_is_blocked` (0065) is either-direction and used on READ paths (feed, search, forum, lost list, walks discovery, pet profile 404) and as a WRITE gate (`isBlockedBetween`) in exactly THREE routes: bark create, DM send, forum comment create.

## 1. FLOW MATRIX

| # | Flow | Trigger | Expected DB rows / state (BOTH sides) | Expected notification (recipient / type / text / deep-link / read) | Verified | BUG? |
|---|------|---------|----------------------------------------|---------------------------------------------------------------------|----------|------|
| 1 | Follow pet | `m/hooks/usePetSocialProfile.js:58` -> POST `api/pets/[id]/follow` (`route.js:50`) | `pet_follows(follower_pet_id=my pet, followed_pet_id=target)` ON CONFLICT DO NOTHING (`route.js:85-90`). Followed side: `followers` +1 (profile `route.js:99`, follows list). Follower side: `following` +1 (own profile). Response returns followersCount only; mobile invalidates only `["petProfile", petId]` (`usePetSocialProfile.js:105`) so the follower's own `following` count and `["follows",...]` list (staleTime 30 s) lag. Ownership of follower pet enforced (`route.js:27-31`), self-follow 400 (`:67`). | to followed pet's OWNER only (`recipient = followedPet.owner_user_id`, `route.js:94-100`), type `follow`, EN "started following your pet" / ES "empezo a seguir a tu mascota" (client i18n `notifications.type_follow`), unread. Deep link: `subject_ref = followedPetId` (the RECIPIENT's own pet) -> tap opens the recipient's own pet profile, not the follower's (`notifications.jsx:391`). No self-notify (safeNotify skips recipient===actor). Same-owner pet->pet follow: skipped correctly. | YES | F2-05, F2-09, F2-18 |
| 2 | Unfollow | DELETE same route (`route.js:113`) | row deleted; counts -1 both sides; idempotent (DELETE of absent row = 200). Previous bell row is NOT retracted. | none | YES | F2-09 |
| 3 | Followers/Following lists | GET `api/pets/[id]/follows` | public pet cards; `is_following` for viewer pet. No block / banned filter (`route.js:58-87`). | - | YES | F2-23 |
| 4 | Friendships | (no creation path) | `pet_friendships` stays empty forever | - | YES | F2-15 |
| 5 | Paw post | POST `api/posts/[id]/paw` | `post_paws(post_id,user_id)` unique (0004). Existing check then `INSERT ... ON CONFLICT DO NOTHING` WITHOUT `RETURNING` (`route.js:44-62`). paw_count recomputed. Already-pawed returns `{message}` with no `paw_count` (`:51`). | post OWNER only, type `paw`, EN "pawed your post" / ES "le dio una patita a tu publicacion", unread. NOT guarded by "was this a new row" (`:72-78`) -> duplicates on race; re-paw after un-paw re-notifies. Deep link: tap -> `router.back()` (`notifications.jsx:582`), post never opened. Self: none. | YES | F2-08, F2-09, F2-05, F2-18 |
| 6 | Un-paw | DELETE same route | row removed, count -1; bell row stays | none | YES | F2-09 |
| 7 | Bark (comment) | POST `api/posts/[id]/barks` | `post_barks(post_id,user_id,pet_id,text)`; pet ownership checked (`route.js:82-93`); content filter (`:74`); blocked pair 403 vs post owner (`:106`); rate limit 30/5 min. GET filters hidden + blocked authors (`:27-28`). | post OWNER only, type `bark`, "barked on your post" / "dejo un ladrido en tu publicacion"; no self; tap -> `router.back()`. Bark text not in the notification (fine). | YES | F2-18 (deep link), F2-22 (counts) |
| 8 | Delete bark | DELETE `api/posts/[id]/barks/[barkId]` | author-scoped hard delete (`route.js:40-44`); IDOR-safe; counts -1 | existing bell row remains (orphan, harmless: tap just goes back) | YES | none |
| 9 | Delete post | DELETE `api/posts/[id]` | cascade removes paws/barks | bell rows remain | YES | none |
| 10 | Edit post caption | PATCH `api/posts/[id]` | author-scoped | - | YES | F2-16 (no content filter) |
| 11 | Mentions | - | not implemented | - | YES | gap, not bug |
| 12 | Pack request | POST `api/pets/[id]/pack-streaks` `{action:"request", partner_handle}` -> `app_request_pack_streak` (0097:70-108) | `pet_pack_streaks` row `pending`; one row per UNORDERED pair (unique idx `0097:36-37`). Returns NULL (-> HTTP 409 "check the @handle, or a pack may already exist", `route.js:76-81`) for unknown handle, own pet, OR ANY existing row for the pair incl. status `ended`. No friendship, no block, no rate limit. | partner OWNER, type `pack_invite`, EN "invited you to a pack streak" / ES "te invito a una racha en manada", unread; tap -> `router.back()` (invite is accepted from Health tab card, user is not sent there). | YES | F2-10, F2-11, F2-06 |
| 13 | Pack accept | `action:"accept"` -> `app_accept_pack_streak` (0097:113-129) | receiver only, only from `pending`; sets `active` | requester OWNER, `pack_accepted`, "accepted your pack streak" | YES | none (idempotent: 2nd call -> 409) |
| 14 | Pack end / decline / cancel | `action:"end"` (`route.js:115-119`) plain UPDATE to `ended`, no status guard, no notification, no UI (`PackStreaksCard.jsx` has no end/decline/cancel button; `useEndPackStreak` is unused) | `ended` is TERMINAL: the pair can never start another pack (see F2-10) | none | YES | F2-10 |
| 15 | Pack advance | ring close -> `care-ring/route.js:223-228` -> `app_advance_pack_streaks` (0097:137-174) | both closed same day -> count +1 / restart at 1; count is never reset on a gap | none | YES | F2-12 |
| 16 | Boop | `action:"boop"` -> `app_pack_boop` (0097:180-223) | no row; 1 boop/pack/actor/UTC day computed from `notifications` | partner OWNER `boop` "booped you - finish your ring" - in-app only (never a phone push), so a nudge nobody sees in time | YES | F2-18 |
| 17 | Walk with buddies - create | POST `api/social-walks` | `social_walks`; private walk -> `social_walk_invites` rows (`route.js:126-146`, ON CONFLICT DO NOTHING, invalid user id -> FK 23503 -> whole request 500); `friends_only` branch builds a friend list then does nothing (`:149-168`) | NONE to invitees (no safeNotify anywhere in the file). Invitee only sees it by opening nearby-walks "invited" tab (`GET ?invited=true`, `:225-262`, block-filtered). No invitee accept/decline route exists although 0046 RLS allows it. | YES | F2-13, F2-14, F2-15 |
| 18 | Walk join request | POST `api/social-walks/[id]/join-request` | `social_walk_join_requests` pending (always - `approval_required=false` ignored, `route.js:108`); no visibility/hidden/block/past-date check (`:47-57`); message stored unfiltered (`:107`) | owner: NONE ("This will be handled via a notification system", `:114-115`). | YES | F2-13, F2-14, F2-06 |
| 19 | Walk approve / decline | POST `.../approve`, `.../decline` | status flips (owner-scoped `:28-31`, `:54-59`); approve does not check walk still scheduled | requester: NONE (`approve:69`, `decline:56` are TODO comments) | YES | F2-13 |
| 20 | Join-request list (owner) | GET `.../join-request` | returns `up.username AS requester_username` (`route.js:182`) | - | YES | F2-04 |
| 21 | DM start thread | POST `api/dm-threads` | `dm_threads(user_a<user_b)` unique pair; idempotent reuse. Any authed user, any integer id, no relationship/block/ban check (`route.js:82-121`), no rate limit. Empty thread appears in the recipient's inbox (GET lists all threads, `:56-60`). | none | YES | F2-21, F2-06 |
| 22 | DM send | POST `api/dm-threads/[id]/messages` | `dm_messages` (RLS: sender=caller and participant), bump `last_message_at`; blocked pair -> 403 (`:114`); content filter (`:102`); 60/min; `image_url` stored as any string (`:89-92`) | **NONE**: no `safeNotify`, no push, no bell row (`route.js:122-146`). Receiver learns only by opening Messages (polls 15 s, `useDMs.js:8`). `/api/dm-threads/unread-count` is never called by the app (only listed in `m/telemetry/apiRoutes.js:48`); the Feed header message icon has no badge (`FeedHeader.jsx:77-79`). | YES | F2-01, F2-20, F2-21 |
| 23 | DM read / unread | POST `.../read`, list `unread_count` | read_at set for messages from other side (`read/route.js:30-37`); chat marks read on `rawMessages.length` change (`chat.jsx:53-57`) - stalls once 50 msgs loaded (limit 50). List `unread_count` and `last_message_body` include moderator-hidden messages (`dm-threads/route.js:42-55`); `unread-count` too (`unread-count/route.js:19-26`) | - | YES | F2-20, F2-21 |
| 24 | Family/caregiver invite | POST `api/pet-caregivers` (by `granteeUsername` or `granteeUserId`) | `pet_caregivers` pending (+ audit 'grant'); owner of pet enforced (`route.js:96-101`); self 400; unique live (pet,grantee) -> 409; `expiresAt` accepted unvalidated (`:89`), not settable from the app UI (`pet-sharing.jsx:84`); no block check | grantee: **NONE**. Grantee must open More > Family & caregivers > "Shared with me" to find it. | YES | F2-02, F2-04, F2-06, F2-19 |
| 25 | Caregiver accept/decline | POST `api/pet-caregivers/[id]/respond` -> `respond_pet_caregiver` (0049:98-127) | pending -> active/declined (+audit); grantee-pinned DEFINER, cannot alter role/scopes | owner: NONE | YES | F2-02 |
| 26 | What the grantee can actually do | RLS 0049 6a-6d vs API | RLS lets ANY active grantee SELECT pets/routines/medical profile and FAMILY write ~18 health tables. The API read routes are owner-only (`routines/route.js:36-59`, `pets/[id]/route.js:66`, `pets/route.js:80`, `pet-medical-profiles/route.js:49,73`, `health/medications/route.js:33`, `health/timeline/route.js:74-116`). Only reachable grantee surfaces: health-log POSTs gated by `resolvePetLogOwner` (`utils/petLogAccess.js`), care-ring shared ring, `api/household` co-cared list, "Log a walk". A `caregiver` (viewer) role can read NOTHING through the app though the intro copy promises "a scoped view". | - | YES | F2-03 |
| 27 | Revoke | DELETE `api/pet-caregivers/[id]` | `status='revoked'`, audit row; access gone instantly (RLS `status='active'` in helpers 0049:60-72). Revoked rows REMAIN in the owner's list (`GET` filters only `declined`, `route.js:63`) and tapping the bin again 404s ("Failed to revoke"). Expired-but-'active' grants are never flipped to 'expired' and still occupy the unique live index. | grantee: NONE (list just changes on next fetch) | YES | F2-19, F2-02 |
| 28 | Lost - activate | POST `api/lost-reports` | `lost_reports` active (unique per pet, `:124`); content filter on notes/area only (reward unfiltered, `:103`); no lat/lng range check (`:99-100`) | each FOLLOWER-pet owner (not "nearby users"): `app_notify(..,'lost_alert', petId, "<Pet> is missing near <area>. Keep an eye out!")` hard-coded English body (`:142-143`); bell shows body raw (no i18n key, `notifications.jsx:386`); push only if `NOTIF_V2_ENABLED` + pref (`ownerNotifications.js:34`); tap -> back, no deep link; unbounded loop inside request. | YES | F2-17, F2-18, F2-26 |
| 29 | Lost - sighting | POST `api/lost-reports/[id]/sightings` | `lost_sightings` (RLS: report must be active); note/photo unfiltered, `photoUrl` unvalidated (`:23-26`); no rate limit, no block check | owner: `lost_alert`, `subject_ref = reportId` (differs from #28 where it is petId), English "New sighting reported for your lost pet" | YES | F2-16, F2-17, F2-06 |
| 30 | Lost - resolve | POST `.../resolve` | status resolved (owner-scoped `:21-26`) | followers get no "found" update | YES | F2-17 (gap) |
| 31 | Emergency tag contact (anonymous) | POST `api/public/emergency/tag/[token]/contact` -> `app_emergency_relay_contact` (0051:175-198) | none | owner: `emergency_contact`, actor NULL, body = stranger's raw text (<=500, unfiltered). Bell title falls back to localized "Pet parent" (actor null) which mislabels a stranger as a pet parent; body not localized; IP rate limit 10/h. | YES | F2-16, F2-17 |
| 32 | Forum thread / comment / vote | `api/forum/*` | threads/comments soft-delete, author-only edit (RLS); list/detail hide hidden + blocked authors; comment create blocked-pair check only vs THREAD author (`comments/route.js:47`); vote via DEFINER `forum_vote` (0047:156-199) with no target validation | none (no reply/vote notifications exist) | YES | F2-07, F2-16, F2-22, F2-24 |
| 33 | Block user | POST `api/blocks` (mobile: `useModeration.js:54` only) | `user_blocks` live pair, idempotent; GET/DELETE routes exist but are NEVER called by the app: no blocked-list, no unblock | - | YES | F2-05, F2-06, F2-23 |
| 34 | Bell list / mark read | GET `api/notifications`, POST `.../read` | recipient-scoped (WHERE + RLS) - IDOR safe (`read/route.js:35-49`); actor shown by `full_name` only (QA bug 04 fixed) ; no block / hidden-target filter | - | YES | F2-27, F2-28 |

## 2. Block enforcement matrix (every interaction surface)

| Surface | Enforced? | Where |
|---|---|---|
| Feed / search / pet profile (404) / lost list / walks discovery / forum read / bark read | YES (read filter) | multiple |
| Bark create | YES (post author only) | `posts/[id]/barks/route.js:106` |
| DM send | YES | `dm-threads/[id]/messages/route.js:114` |
| Forum comment create | PARTIAL - thread author only, not parent-comment author | `forum/threads/[id]/comments/route.js:47` |
| Follow pet | **NO** | `pets/[id]/follow/route.js:50-110` |
| Paw | **NO** | `posts/[id]/paw/route.js:8-88` |
| Pack request | **NO** | `0097:70-108` |
| Walk join request / invite | **NO** (invite hidden only on invitee read) | `join-request/route.js`, `social-walks/route.js:138-145` |
| Caregiver invite | **NO** | `pet-caregivers/route.js:117` |
| DM thread start | **NO** | `dm-threads/route.js:82-121` |
| Lost sighting | **NO** | `sightings/route.js` |
| Forum vote | **NO** | `forum/vote/route.js:34` |
| Notification creation (`app_notify`) | **NO** | `0108:71-115` |
| Existing follows / packs / caregiver grants / DM threads when a block is created | NOT cleaned up | - |
| Unblock | no UI at all | `useModeration.js` |

## 3. BUGS FOUND (all confirmed by reading code)

### F2-01  HIGH  - Incoming DMs produce no notification, no push, no unread badge
* Files: `api/dm-threads/[id]/messages/route.js:122-146` (INSERT + bump only; no `safeNotify`); `m/components/Feed/FeedHeader.jsx:77-79` (message icon has no badge; bell badge = reminders + pending care grants + DB notifications only, `:51-55`); `/api/dm-threads/unread-count` has no mobile caller (grep: only `m/telemetry/apiRoutes.js:48`).
* Scenario: A sends B "Is Rex coming to the park?". B's phone is silent, bell empty, header icon unchanged. B sees it only if she opens Messages (15 s poll).
* Minimal fix (code only, no migration): add `useDmUnreadCount()` (GET `/api/dm-threads/unread-count`, `refetchInterval` 60 s, `retry:false`) and render a count dot on the MessageCircle `HeaderIconButton`; also add its result into `bellBadgeCount` or a separate dot. For a bell row + push: `safeNotify({recipient: otherUserId, actor: userId, type:'dm_message', subjectRef:String(threadId), body:'sent you a message'})` after the INSERT - BUT `notifications_type_check` rejects the type -> **NEEDS-HUMAN (SQL-1 below)**. Until then `safeNotify` would swallow the error (it never throws) so the code change is safe to ship first.
* Test: unit (route test with mocked sql + `vi.mock` of notify: assert `safeNotify` called once with recipient = other participant); badge via RNTL on FeedHeader. Integration to prove the CHECK widen.
* Risk: low for badge; push volume needs a per-thread dedupe (one push per unread burst).

### F2-02  HIGH(Med-High)  - Caregiver/family invite, accept, decline and revoke are completely silent
* Files: `api/pet-caregivers/route.js:125-148` (no notify), `api/pet-caregivers/[id]/respond/route.js:29` , `api/pet-caregivers/[id]/route.js:22-35`; recipient screen `m/app/pet-sharing.jsx:229-291` is the only place pending invites show (bell merges only provider `care_access_grants`, `notifications.jsx:506-508`).
* Scenario: owner invites B as family. B is never told; the grant stays `pending`. Owner is never told B accepted/declined; B is never told of revocation.
* Fix: after INSERT call `safeNotify({recipient: granteeId, actor: userId, type:'caregiver_invite', subjectRef:String(created[0].id)})`; in respond route read the grant's owner (`SELECT owner_user_id`) and notify `caregiver_accepted`/declined. Needs new notification types -> **NEEDS-HUMAN (SQL-1)**. Code-only interim: add pending-invite count to `bellBadgeCount` (`useSharedWithMe` where status==='pending') and to `notifications.jsx` as an "access" style item, exactly like `mapAccessGrant`.
* Test: unit (mock sql/safeNotify). Risk: low.

### F2-03  HIGH  - "Caregiver (viewer)" grant gives the grantee nothing they can read; family grant only enables log writes
* Files: owner-only gates `api/routines/route.js:36-59`, `api/pets/[id]/route.js:66,285`, `api/pets/route.js:80`, `api/pet-medical-profiles/route.js:49,73`, `api/health/medications/route.js:33`, `api/health/timeline/route.js:74-116`. The RLS side is correct (`0049_family_caregiver_sharing.sql` 6a-6d) so the DB would allow it; the route WHEREs prevent it. Copy promises it: `en.json petSharing.intro` ("Family co-manage everything; caregivers get a scoped, optionally expiring view").
* Scenario: owner shares Rex as `caregiver`; B accepts, sees "Active" but `GET /api/routines?petId=Rex` -> 403, `GET /api/pet-medical-profiles` -> owner-only. B can never read feeding/med instructions or emergency info.
* Fix: add `resolvePetReadAccess(callerId, petId)` next to `utils/petLogAccess.js` using `SELECT app_user_has_pet_access(${petId})` (same savepoint/42883 degrade pattern) and use it in routines GET, pet-medical-profiles GET, pets/[id] GET; drop the `owner_user_id = me` predicate on the grantee path (query by `pet_id`; RLS scopes). Also add a "Shared pets" entry to a read-only screen. Medium effort; no migration.
* Test: integration (real PG + real router) - grantee GET returns rows, stranger 403, expired grantee 403. Risk: medium (touches many read routes; do one route at a time).

### F2-04  MED (HIGH while 0133 is unapplied)  - `username` (legacy e-mail-derived) still leaks to other users; granteeUserId enumerates users
* Files: `api/pet-caregivers/route.js:38` (`owner.username AS owner_username` shown to the grantee) and `:58` (`grantee.username`, shown to the owner); `api/social-walks/[id]/join-request/route.js:182` (`up.username AS requester_username`); `api/search/route.js:52-61` (owners list returns and ILIKE-matches `username`); `m/app/pet-sharing.jsx:188,215,243` render `@{username}`. QA 2026-10-16 bug 04 (see `utils/ownerDisplay.js:1-12`) moved everything else to `full_name`. `supabase/migrations/0133_username_backfill.sql` is HUMAN-APPLIED and unapplied.
* Extra vector: POST accepts any `granteeUserId` integer (`route.js:88,104`); the owner then GETs `grantee_username` back -> iterate ids 1..N to harvest usernames AND spam every user with pending invites (no notification today, but a pending row exists).
* Fix: select `NULLIF(BTRIM(full_name),'') AS ..._name` (use `publicOwnerName`) instead of username in the three routes and make the UI fall back to `t('common.petParent')`; restrict `granteeUserId` path to ids returned by search (or drop it and require `granteeUsername`); keep `search` ILIKE on full_name only if product allows. No migration.
* Test: unit (route test asserts response has no `username`/e-mail-like value). Risk: low; UI strings need EN+ES.

### F2-05  MED  - Blocks are not enforced on follow and paw (and the blocker receives the notification)
* Files: `api/pets/[id]/follow/route.js:66-101` (no block check), `api/posts/[id]/paw/route.js:34-78` (none; also no `hidden_at` check on the post, `:35-37`).
* Scenario: A blocks B. B (direct API, or a cached screen) POSTs `/api/pets/<A's pet>/follow` or `/api/posts/<A's post>/paw`: row inserted and A gets "started following your pet" / "pawed your post" from the person they blocked. (Profile GET already 404s, so only the UI path is protected, not the API.)
* Fix: after resolving the target owner / post, `if (await isBlockedBetween(owner.userId, followedPet[0].owner_user_id)) return 403 {error:"You can't interact with this user"}` (import from `@/app/api/utils/moderation`), and add `AND hidden_at IS NULL` to the post SELECT in paw. Same for DELETE not needed.
* Test: unit (mock `isBlockedBetween`); integration to prove end to end. Risk: low. Defense in depth: SQL-1 (block gate inside `app_notify`).

### F2-06  MED  - Blocks not enforced on pack request, walk join/invite, caregiver invite, DM thread start, lost sighting, forum vote
* Files: `0097_engagement_pack_streaks.sql:70-108`; `api/social-walks/[id]/join-request/route.js:47-111`; `api/social-walks/route.js:131-145`; `api/pet-caregivers/route.js:117-130`; `api/dm-threads/route.js:93-121`; `api/lost-reports/[id]/sightings/route.js:34-45`; `api/forum/vote/route.js:34`.
* Scenario: blocked user keeps sending pack invites ("invited you to a pack streak"), walk join requests, caregiver invites, empty DM threads (these appear in the blocker's inbox: list has no filter, `dm-threads/route.js:56-60`), sightings (notify the blocker), and votes on the blocker's thread.
* Fix (code): call `isBlockedBetween(userId, <other>)` -> 403 in each route before the INSERT (pack: the partner owner is resolved inside the DEFINER fn and pets RLS hides it from the route, so for pack use the SQL-1 central gate or add the check inside `app_request_pack_streak` -> NEEDS-HUMAN for pack only). DM list: add `AND NOT app_user_is_blocked(${userId}, ou.id)` to the thread list and unread-count queries.
* Test: unit per route. Risk: low-med (403 copy must be localized in UI: chat currently shows nothing, see F2-20).

### F2-07  LOW-MED  - Forum reply to a comment authored by someone who blocked you (or hidden/deleted/other-thread parent)
* File: `api/forum/threads/[id]/comments/route.js:24-26, 37-58`: `parentCommentId` is never validated; block check is against the THREAD author only.
* Scenario: C blocked D; D replies under C's comment inside E's thread -> row inserted (visible to others, hidden from C by read filter). D can also set `parentCommentId` to a comment of another thread (no composite FK) -> orphan reply.
* Fix: when `parentCommentId` is set: `SELECT author_user_id FROM forum_comments WHERE id=${pid} AND thread_id=${threadId} AND deleted_at IS NULL AND hidden_at IS NULL` -> 404 if none; run `isBlockedBetween(userId, parent.author_user_id)` -> 403. Test: unit. Risk: low.

### F2-08  MED  - Paw notification fires even when no row was inserted (double-tap race) - "idempotent" only for the count
* File: `api/posts/[id]/paw/route.js:44-78`. The SELECT-then-INSERT `ON CONFLICT DO NOTHING` has no `RETURNING`; `safeNotify` at `:72` runs unconditionally.
* Scenario: two concurrent POSTs (double tap / client retry on flaky network): both pass the existence check, one inserts, the other no-ops, BOTH notify -> post owner gets two "pawed your post".
* Fix: `const ins = await sql\`INSERT ... ON CONFLICT (post_id,user_id) DO NOTHING RETURNING id\`; if (ins.length > 0) await safeNotify(...)` (same pattern follow already uses at `follow/route.js:85-101`). Also return `paw_count` on the "Already pawed" branch (`:51`).
* Test: unit (mock sql so INSERT returns []; assert safeNotify not called) - fully provable. Risk: very low.

### F2-09  MED  - Notification spam by toggling (paw/un-paw, follow/unfollow)
* Files: `paw/route.js:72` and `follow/route.js:92-101` notify on every fresh insert; limiter allows 120 paw toggles/min (`utils/rateLimit.js:60`) and 60 follows/5 min (`:61`); `app_notify` has no dedupe.
* Scenario: a user (or a flaky-network retry loop) toggles a paw 60 times -> the owner gets 60 bell rows.
* Fix in code is limited because the ACTOR cannot read the recipient's `notifications` (recipient-only SELECT RLS). **NEEDS-HUMAN (SQL-1)**: dedupe `paw`/`follow` per (recipient, actor, type, subject_ref) for 24 h inside `app_notify`. Cheap code-side mitigation: lower `paw_toggle` to ~20/min and notify only if `!user previously pawed` (cannot know) - so prefer SQL-1.
* Test: integration only (needs real DB). Risk: low.

### F2-10  MED  - An ENDED (or declined) pack can never be restarted; invites cannot be declined or cancelled
* Files: unique index `0097:36-37` on `least/greatest(requester_pet_id, receiver_pet_id)`; `app_request_pack_streak` returns NULL for ANY existing row regardless of status (`0097:92-98`); route maps NULL to a generic 409 (`api/pets/[id]/pack-streaks/route.js:76-81`); mobile shows a generic `packStreaks.requestFailed` (`PackStreaksCard.jsx:41`). `end` is the only way out (`route.js:115-119`), has no UI (`PackStreaksCard.jsx` has no end/decline/cancel button; `useEndPackStreak` at `usePackStreaks.js:62` has no caller), so in practice a pending invite can neither be declined nor withdrawn.
* Scenario 1: Rex+Luna run a pack, someone calls `end` (API, or a future button) -> forever "Couldn't start that pack". Scenario 2: Luna's owner doesn't want the invite; the only action is `end` = permanently blocks the pair. Scenario 3: requester typo'd the wrong dog, invite sits pending forever and cannot be re-sent to the same pet.
* Fix: code-only mitigations - add Decline/Cancel/End buttons using the existing `end` action and make the 409 copy distinguish "already exists" (return `reason:"exists"|"unknown_handle"` by doing a participant-scoped `SELECT status FROM pet_pack_streaks WHERE <pair>` before calling the fn: RLS shows the caller their own pairs). Real fix = **NEEDS-HUMAN (SQL-2)**: let the function revive an `ended` row.
* Test: integration (real PG: request -> accept -> end -> request must create/revive). Risk: low-med.

### F2-11  LOW-MED  - Pack invites: no rate limit, no block, no relationship, generic error
* `api/pets/[id]/pack-streaks/route.js:143-145` (POST not wrapped in `withRateLimit`); `0097:85-90` resolves ANY pet by handle. A user can invite every handle they can guess (notification to each owner).
* Fix: wrap POST with `withRateLimit("pack_request", ...)` (add bucket e.g. 10/hour in `utils/rateLimit.js`, fail-open) when `action==='request'`. Risk: low.

### F2-12  LOW  - Broken pack still displays its old flame count
* `0097:137-174` only writes on a mutual close; no job resets `current_count` on a missed day. `PackStreaksCard.jsx:63-65` prints `p.current_count` for any `active` pack without comparing `last_active_day` to today/yesterday.
* Fix (client/route): in `api/pets/[id]/pack-streaks/route.js` GET, map rows: if `last_active_day < (owner-tz today - 1)` return `current_count: 0` (keep `longest_count`). Test: unit. Risk: low. (Timezone: see suspicion U-1.)

### F2-13  MED  - Walk-with-buddies flow is entirely silent (invites, join requests, approvals, declines)
* Files: `api/social-walks/route.js:138-146` (no notify to invitees), `social-walks/[id]/join-request/route.js:114-115` (TODO comment), `approve/route.js:68-69`, `decline/route.js:55-56` (TODO comments). There is also no invitee accept/decline route although 0046 RLS (`social_walk_invites_update`) supports it.
* Scenario: owner invites 3 friends to a private walk; nobody is told. Friend requests to join; owner is never told; owner approves; requester never learns.
* Fix: call `safeNotify` in the four places (types need widening -> **NEEDS-HUMAN SQL-1**: `walk_invite`, `walk_join_request`, `walk_join_approved`, `walk_join_declined`); body = JSON via the existing `bizNotifyBody`-style helper; deep link target nearby-walks screen. Test: unit with mocked notify. Risk: low-med (needs i18n keys EN+ES and bell mapping).

### F2-14  MED  - Join-request ignores visibility, moderation, approval mode, block, dates; invalid invite id 500s the whole create
* `join-request/route.js:47-57` (`SELECT * ... WHERE id AND status='scheduled'` - RLS hides only `private` walks; a `friends_only` walk is joinable by anyone who guesses the id; no `hidden_at IS NULL`, no `scheduled_at > now()`); `:107` message stored without `moderationResponse` (shown to the walk owner); `:108` `'pending'` hard-coded so `approval_required=false` never auto-approves; no `isBlockedBetween`; GET `:182` leaks username (F2-04). `social-walks/route.js:131-145`: `inviteUserIds` not checked to exist -> FK 23503 -> unhandled 500 and the walk creation rolls back.
* Fix: add `AND hidden_at IS NULL AND scheduled_at > now()`; require visibility rules (friends_only -> mutual follow, see F2-15); `moderationResponse(message)`; if `!approval_required` insert as `approved` (respecting max_pets in the same statement); `isBlockedBetween`; validate invitee ids with `SELECT id FROM user_profiles WHERE id = ANY(${cleanIds})` first. Test: unit + integration. Risk: medium.

### F2-15  MED  - Features that depend on `pet_friendships` are dead in production
* `social-walks/route.js:349-390` (friends_only discovery + the no-op block `:149-168`), `pets/[id]/reengagement/route.js:72-90`, `pets/[id]/weekly-digest/route.js:152-160`, SQL `0098:133-138` (friends leaderboard = only your own pet).
* Fix (code): define "friend" as MUTUAL follow: `EXISTS (SELECT 1 FROM pet_follows a JOIN pet_follows b ON a.follower_pet_id=b.followed_pet_id AND a.followed_pet_id=b.follower_pet_id WHERE a.follower_pet_id = sw.pet_id AND a.followed_pet_id = ANY(${userPetIds}))` in the three routes; leaderboard function = **NEEDS-HUMAN (SQL-3)**. Test: integration. Risk: medium (product decision: is a friend = mutual follow?).

### F2-16  MED  - Content filter bypassed on edit and on several user-text fields (Guideline 1.2)
* No `moderationResponse` on: `api/posts/[id]/route.js:77-137` (caption edit; POST create does filter, `posts/route.js:435`), `api/forum/threads/[id]/route.js:70-110` (title/body edit), `api/forum/comments/[id]/route.js:8-39` (comment edit), `social-walks/[id]/join-request/route.js:107` (message), `lost-reports/[id]/sightings/route.js:23-26` (note), `lost-reports/route.js:103` (`reward` unfiltered), `api/public/emergency/tag/[token]/contact/route.js:15` (anonymous message), `forum/threads/route.js:85` (category free text).
* Scenario: post a clean caption, then PATCH it to objectionable text.
* Fix: `const blocked = moderationResponse(text); if (blocked) return blocked;` at each site (helper already imported elsewhere). Test: unit (mirror the existing create-route tests). Risk: very low.

### F2-17  LOW-MED  - Lost/sighting/emergency notifications are English-only, inconsistent and mislabelled
* `lost-reports/route.js:143` (English template), `sightings/route.js:53` (English; subject_ref=reportId whereas #28 uses petId), `0051:192`; recipient `notifications.jsx:372-393` falls to `n.body || t("notifications.newActivity")` - there is no `notifications.lost_alert`/`emergency_contact` key in en.json/es.json. Spanish users read English; the title for the anonymous emergency relay is `ownerDisplayName(null)` = "Pet parent". No "found" update to followers on resolve (`resolve/route.js:21-30`).
* Fix: add i18n keys + branch in `mapDbNotification` for `lost_alert` (pet name/area from a JSON body via `bizNotifyBody`), `emergency_contact` (title key "Someone scanned the tag"), keep subject_ref = reportId everywhere; on resolve notify the same followers (`lost_alert` body `{resolved:true}`). Test: RNTL for the mapping. Risk: low.

### F2-18  MED  - Deep links from owner<>owner notifications go nowhere useful
* `m/app/notifications.jsx:580-583` (`router.back()` for paw/bark/pack_*/boop/lost_alert/emergency_contact - the user lands on whatever screen the bell was opened from); `:391` follow -> opens the recipient's OWN pet because `subject_ref = followedPetId` (`follow/route.js:98`). `m/utils/notificationDeepLink.js:47-53` sends every OS push tap to the inbox.
* Fix: follow route -> `subjectRef: String(followerPetId)` so the tap opens the follower's profile; add branches: paw/bark -> open post detail (route that exists for a single post, else feed with `postId`), pack_invite/accepted/boop -> `/(tabs)/health?section=...` pack card, lost_alert -> lost-report detail screen. Test: RNTL on `handleNotifTap`. Risk: low-med (need target screens).

### F2-19  LOW  - Family/caregiver list state bugs
* `api/pet-caregivers/route.js:63` returns revoked/expired rows (only `declined` excluded) so a revoked grantee stays listed with a bin that now 404s (`[id]/route.js:25`: `status <> 'revoked'` -> 404 -> alert "Failed to revoke"); `route.js:41-45` (`mine`) lists expired 'active' grants as active (UI shows "Active" + "Log a walk" that RLS then denies, `pet-sharing.jsx:247-268`); nothing ever sets `status='expired'` so an expired grant keeps the unique live slot and the owner gets 409 "already has a pending or active grant" on re-invite; `expiresAt` cannot be set from the UI (`pet-sharing.jsx:84`); raw English `status`/hard-coded English alerts (`usePetSharing.js:48`).
* Fix: owner GET `AND pc.status IN ('pending','active')`; both GETs add `AND (pc.expires_at IS NULL OR pc.expires_at > now())` and a `computed_status`; POST first runs `UPDATE pet_caregivers SET status='expired', updated_at=now() WHERE pet_id=${petId} AND grantee_user_id=${granteeId} AND status='active' AND expires_at <= now()` (owner UPDATE policy allows it) before INSERT; validate `expiresAt` (`Number.isNaN(Date.parse())`, future) -> 400; i18n the alerts. Test: unit/integration. Risk: low.

### F2-20  MED  - Chat send failures are invisible; read-mark stalls at 50 messages
* `m/app/chat.jsx:68-72` (`send.mutate(...)` with no `onError`, no error UI; grep for isError/Alert returns nothing). A 403 "You can't message this user", 400 content-filter rejection (`messages/route.js:102-103`) and 429 all leave the text in the box with no feedback. `chat.jsx:53-57` effect depends on `rawMessages?.length` but the query is `limit=50` (`useDMs.js:28`): at 50 loaded, new incoming messages don't change the length so `markRead` never re-fires and the unread count sticks.
* Fix: show `send.error?.message` inline (+ localize known codes); deps `[threadId, rawMessages?.[0]?.id]`. Test: RNTL. Risk: low.

### F2-21  LOW-MED  - DM list/unread include hidden messages; empty/blocked threads listed; image_url unvalidated
* `dm-threads/route.js:42-55` and `unread-count/route.js:19-26` have no `hidden_at IS NULL` (messages GET has it, `messages/route.js:52,60`): a moderator-removed message still previews in the inbox and counts as unread; list has no block filter and shows threads with zero messages; `messages/route.js:89-92` accepts any string as `image_url` (the recipient's client fetches an arbitrary URL).
* Fix: add `AND m.hidden_at IS NULL` in the three subqueries; `AND NOT app_user_is_blocked(${userId}, ou.id)`; hide threads with no messages unless I am the creator; validate `image_url` host against the media bucket (`utils/uploadValidation.js` / `mediaAccess.js`). Test: unit. Risk: low.

### F2-22  LOW  - Counts disagree with what each side can see
* Feed/profile counts include hidden + blocked-author barks and hidden posts: `posts/route.js` (`LEFT JOIN (SELECT post_id, COUNT(*) FROM post_barks GROUP BY post_id)`, no `hidden_at`/block), `pets/[id]/profile/route.js:92-98` (total_posts/paws/barks include hidden posts), forum list `comment_count` (`forum/threads/route.js:45-48`) ignores hidden/blocked while detail filters them (`forum/threads/[id]/route.js:57-59`). Followers counts include banned/blocked owners.
* Fix: add the same predicates to the count subqueries (`pb.hidden_at IS NULL AND NOT app_user_is_blocked(current_app_user_id(), pb.user_id)`). Test: integration. Risk: low (perf: per-row function call; keep limit sane).

### F2-23  LOW  - Blocking is one-way in the UI and leaves relationships alive
* `m/hooks/useModeration.js:54-60` is the only caller of `/api/blocks` (no list, no unblock UI; `GET /api/blocks`, `DELETE /api/blocks/[id]` unused); `BLOCK_SENSITIVE_KEYS` (`:23-35`) lists `"pet-social-profile"` but the real key is `"petProfile"` (`usePetSocialProfile.js:7`) and omits `"follows"`, `"notifications"`; existing pet_follows, pack streaks, caregiver grants and DM threads between the pair survive a block (a blocked caregiver keeps access to the pet's health data until the owner revokes by hand); followers list (`follows/route.js:58-87`) still shows blocked/banned owners' pets.
* Fix: add Blocked users screen (GET/DELETE already exist), fix cache keys, on `POST /api/blocks` also `DELETE FROM pet_follows` both directions for the two users' pets, `UPDATE pet_pack_streaks SET status='ended'` and `UPDATE pet_caregivers SET status='revoked'` where the BLOCKER is owner (all allowed by owner/participant RLS), and filter `/follows` with `NOT app_user_is_blocked`. Test: integration. Risk: medium (product decision on caregiver auto-revoke).

### F2-24  LOW  - Forum vote has no target validation
* `forum/vote/route.js:27-36` -> `forum_vote` (0047:156-199) accepts any `target_id` (orphan vote rows for non-existent ids), votes on hidden/deleted/blocked-author content, and self-votes. Fix: before calling the fn `SELECT 1 FROM forum_threads|forum_comments WHERE id=... AND deleted_at IS NULL AND hidden_at IS NULL` -> 404; reject self-vote or ignore. Test: unit. Risk: low.

### F2-25  LOW  - Non-numeric ids become 500s
* `parseInt(params.id)` without NaN guard: `pet-caregivers/[id]/route.js:20` (revoke), `[id]/respond/route.js:21` (guarded, ok), `lost-reports/[id]/resolve/route.js:19`, `sightings/route.js:21`, `lost-reports/[id]/route.js:20`, `forum/threads/[id]/route.js:20,80,122`, `forum/threads/[id]/comments/route.js:21`; `posts/[id]/paw/route.js:16` and `barks/route.js:12` pass the raw string to `WHERE id = ${postId}` (22P02 -> 500). Fix: `if (!Number.isInteger(id)) return 400`. Test: unit. Risk: none.

### F2-26  LOW  - Lost-alert fan-out is unbounded inside the request
* `lost-reports/route.js:133-150`: one `app_notify` round-trip per follower in the request transaction (push is capped at 100, the bell insert is not). A pet with 5,000 followers makes activation take seconds and can time out the `pawpi_app` timeout (0127). Fix: single set-based `INSERT ... SELECT` is blocked (app_notify is the only insert path) so cap the loop at e.g. 500 and queue the rest. NEEDS-HUMAN only if a set-returning DEFINER is wanted. Test: unit. Risk: low.

### F2-27  LOW  - Bell list shows rows from actors the viewer has since blocked
* `api/notifications/route.js:31-47` has no block / hidden filter; with F2-05 unfixed it is also how blocked users still reach the blocker. Fix: `AND (n.actor_user_id IS NULL OR NOT app_user_is_blocked(${userId}, n.actor_user_id))`. Test: integration. Risk: low.

### F2-28  LOW (config)  - Social notifications never light the bell badge unless NOTIF_V2_ENABLED is on
* `api/notifications/route.js:52-61`, `m/utils/bellBadge.js:15`. Documented behaviour, but it means paw/bark/follow/pack_invite are invisible until the user opens the bell. Action: NEEDS-HUMAN env (Railway) decision on flipping `NOTIF_V2_ENABLED` after migrations 0131/0132 are applied.

## 4. NEEDS-HUMAN SQL (not applied; proposals only)

### SQL-1  widen types + block gate + dedupe in `app_notify` (central fix for F2-01/02/05/06/09/13)
```sql
-- 0134_notify_types_block_dedupe.sql  (proposed; copy TEMPLATE.sql conventions; hand-apply + verify_0134.sql)
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
  'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
  'adoption_under_review','adoption_approved','adoption_declined',
  'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
  'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
  'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
  'biz_review','biz_payout','biz_post_engagement','biz_follow',
  -- new
  'dm_message','walk_invite','walk_join_request','walk_join_approved','walk_join_declined',
  'caregiver_invite','caregiver_accepted','caregiver_declined'
]::text[]));

create index if not exists idx_notifications_dedupe
  on notifications (recipient_user_id, actor_user_id, type, subject_ref, created_at desc);

create or replace function app_notify(
  p_recipient integer, p_actor integer, p_type text, p_subject_ref text, p_body text
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_id integer; v_category text; v_enabled boolean;
begin
  if p_recipient is null or p_recipient = p_actor then return null; end if;
  -- block gate: a blocked pair never notifies each other (system/anonymous actor = NULL is exempt)
  if p_actor is not null and app_user_is_blocked(p_recipient, p_actor) then return null; end if;
  -- dedupe taps: same actor+type+subject within 24h
  if p_type in ('paw','follow','dm_message') and exists (
      select 1 from notifications n
      where n.recipient_user_id = p_recipient and n.actor_user_id = p_actor and n.type = p_type
        and n.subject_ref is not distinct from p_subject_ref
        and n.created_at > now() - interval '24 hours'
        and (p_type <> 'dm_message' or n.read_at is null)) then
    return null;
  end if;
  v_category := case p_type
    when 'walk_request_targeted' then 'walk_requests'
    when 'walk_request_broadcast' then 'walk_requests'
    else null end;
  if v_category is not null then
    select enabled into v_enabled from notification_prefs where user_id = p_recipient and category = v_category;
    if v_enabled is false then return null; end if;
  end if;
  insert into notifications (recipient_user_id, actor_user_id, type, subject_ref, body)
  values (p_recipient, p_actor, p_type, p_subject_ref, p_body) returning id into new_id;
  return new_id;
end; $$;
grant execute on function app_notify(integer, integer, text, text, text) to pawpi_app;
```
Notes: keep the existing 0108 body byte-for-byte except the two inserted blocks; the latest CHECK list is the one in `0110_business_notification_types.sql` (re-read it before applying in case 0131+ widened it). Re-apply-safe. Provide `supabase/verify_0134.sql` (every row PASS) per CLAUDE.md rule 4 because it is hand-applied.

### SQL-2  let a pack be restarted after `ended`
```sql
-- replace the "a pack for this pair already exists" block in app_request_pack_streak (0097:92-98)
declare v_existing record;
...
select * into v_existing from pet_pack_streaks
 where least(requester_pet_id, receiver_pet_id) = least(p_pet, v_partner_pet)
   and greatest(requester_pet_id, receiver_pet_id) = greatest(p_pet, v_partner_pet) for update;
if found then
  if v_existing.status <> 'ended' then return null; end if;      -- pending/active: still a conflict
  update pet_pack_streaks
     set requester_user_id = p_owner, receiver_user_id = v_partner_owner,
         requester_pet_id = p_pet,     receiver_pet_id = v_partner_pet,
         status = 'pending', current_count = 0, last_active_day = null, updated_at = now()
   where id = v_existing.id;                                        -- longest_count preserved (celebrate the best run)
  perform app_notify(v_partner_owner, p_owner, 'pack_invite', v_existing.id::text, 'invited you to a pack streak');
  return v_existing.id;
end if;
```
(`longest_count` kept so history is not lost; SECURITY DEFINER pinning/grant unchanged.)

### SQL-3  friends leaderboard cohort = mutual follows (replace `0098:133-138` branch)
```sql
insert into _cohort (pet_id)
select f.followed_pet_id from pet_follows f
where f.follower_pet_id = p_pet
  and exists (select 1 from pet_follows r where r.follower_pet_id = f.followed_pet_id and r.followed_pet_id = p_pet)
on conflict do nothing;
```
(keep the preceding `select p_pet` seed row).

## 5. Unverified suspicions (NOT confirmed - do not count as bugs)
* U-1 Pack day mismatch across time zones: `app_advance_pack_streaks` looks up the partner's `pet_care_days.day = p_day` where `p_day` is the CLOSING pet's owner-tz day (0097:153-154); partner rows are keyed by the partner's own tz day. Could mis-pair near midnight for owners in different zones. Needs a two-tz integration test.
* U-2 Whether prod has migrations 0097/0113 applied (pack streaks, rate limit): code degrades silently if not; cannot check (no DB access by instruction).
* U-3 RLS of `social_walk_join_requests` (requester can see own request status?) not read; mobile has no obvious "my request status" view - unknown if requester can even see approved/declined.
* U-4 Rate-limit window semantics for `paw_toggle` under multiple replicas - relies on 0113 being applied.
* U-5 `app_pack_boop` / `app_pack_streaks_for_pet` expose partner pet name/avatar/handle without a block/ban/demo filter - not tested whether a banned partner remains visible.
* U-6 `withRequestContext` + `safeNotify` ordering: `safeNotify` runs `app_notify` inside the request transaction with no savepoint (`utils/notify.js:25-30`); a CHECK violation there (e.g. the new types before SQL-1) would abort the whole transaction and 500 the actor's request if the error were thrown - `safeNotify` catches it, but the failed statement still poisons a Postgres transaction (25P02 on the next query). Needs a real-PG test before shipping F2-01/02/13 notify calls: wrap in `withSavepoint` (as `softV2` does) to be safe.
* U-7 `GET /api/posts/[id]/barks` has no `auth()` call (`barks/route.js:10-37`); relies on RLS `current_app_user_id() is not null`. Probably fine; confirm an anonymous request returns 401/empty rather than 500.
* U-8 `pets/[id]/follows` pagination orders by `created_at DESC` only (no id tiebreak) - possible duplicate/missing rows across pages under bulk follows.

