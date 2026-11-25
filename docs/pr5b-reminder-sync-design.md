# PR5b design — reminders and routines across household members (2026-11-24)

**Status: decisions 1–11 accepted 2026-11-24 (decision 7: no native change yet). Phase 1 is being built (see 9b); Phases 2 and 3 are not built.** The decisions are listed in section 9.
Written from the code on `main` after PR5a (#758) and the server work of #749–#753 (migrations 0137–0142). Anything I could
not confirm from code is collected in section 10 — please read that part before trusting any number here.

## 1. In one minute

- A shared dog's routines are now loaded on a member's phone, and that phone **schedules its own local alarms**. So both
  phones ring for the same meal, walk or pill. That part already works.
- The problem is the other half: **when one person logs it, the other person's alarm is not cancelled.** The alarm lives in
  that phone's operating system. Only code running on that phone can cancel it, and nothing tells that phone that someone else
  did the task.
- There is **no way to make this perfect** on iOS without a server that sends every alarm itself (option C). Every cheaper
  option leaves a window where the second phone still rings (app closed, offline, notifications throttled).
- **Recommendation:** a three-step rollout. Step 1 is client-only (no server change) and fixes the clean-up bugs
  (access lost, deleted routine, too many alarms). Step 2 adds one small server table + a "someone logged it" push and a
  best-effort silent push to cancel. Step 3 (server rings the phone itself) only if real use shows the double-ring still hurts.

## 2. How it works today (verified in code)

**Where reminders come from.** The server stores *routines* (a schedule), not individual reminders. Each phone turns routines
into reminder instances itself: `loadRoutines(petId)` in `store/routinesStore.js` fetches `GET /api/routines?petId=`,
runs `generateRemindersFromRoutine` (`utils/reminderGenerator.js`, default window **14 days ahead**) and hands them to
`addRemindersFromRoutines` (`store/remindersStore.js`). An instance id is deterministic: `reminder_<routine>_<item>_<date>`.

**Who may read/complete.** `GET /api/routines` allows owner, family and caregiver (`api/routines/route.js`); create/edit/delete
is owner + family. Logs written by a member are stored under the *owner's* id so the household shares one history
(`api/utils/petLogAccess.js`, `resolvePetLogOwner`). The caregiver may log/complete (`utils/petPermissions.js`, `completeReminder: ALL`).

**How an alarm is armed.** `scheduleReminderNotification` (`utils/notifications.js`) schedules a local `expo-notifications` DATE
trigger, using the instance id as the OS identifier (so re-arming replaces, never duplicates — flow audit F1-01). It skips
instances already in the past. The notification carries `data.petId` and `data.reminderId`.

**How an alarm is cancelled — only on the phone that acts.**
- `completeReminder` (`remindersStore.js:257`) cancels that instance's alarm — but only if *this* phone's in-memory store
  holds it, and it is only called by the screen where the person tapped (`HealthToday.jsx`, `UpcomingTab.jsx`).
- Pause/delete/edit of a routine cancels the future alarms **on the phone doing it** (`removeFutureRemindersByRoutine`,
  `disableFutureRemindersByRoutine`).
- Every `loadRoutines` ends with `reconcileRoutineNotifications` (`notifications.js:366`): it cancels pending alarms **for that
  pet** whose instance is no longer generated (routine deleted/paused/edited elsewhere). It runs only when the load generated
  at least one reminder (`routinesStore.js:116`).
- Logout cancels everything (`utils/auth/sessionCleanup.js`).

**What "done" means, per type.**
- *Persistent* types (wellness, medical care, photo check, vet appointment): Today's Overdue list is derived from routines
  minus **logs** minus **dismissals** (`utils/reminderResolution.js`, `hooks/useTodayReminders.js`). The logs are household-readable,
  so a member's log already clears the owner's Overdue list after a refetch.
- *Transient* types (feeding, walk, medication): "done" is only the in-memory status set by
  `completeReminder`. **The server has no record linking a feeding/walk log to a reminder instance.** The reminders list is not
  persisted (only the snooze map is), so a relaunch regenerates it.
- *Skips* (`reminder_dismissals`) are **owner-only**: GET filters on the caller, POST requires the caller to own the pet
  (`api/health/reminder-dismissals/route.js`). A family member's "skip" is therefore rejected and rolled back today. (I read the
  route; I did not run it as a member.)
- *Snooze*: a per-phone map persisted under `pawpi:reminderSnoozes` (`remindersStore.js`, `snoozeReminder` at line 289). It re-arms
  that phone's alarm only. Never shared.

**When alarms are armed.** Only when `loadRoutines` runs for the **currently selected pet** (HealthToday on pet change and
pull-to-refresh, RoutinesTab, UpcomingTab). A shared dog the member never selects is never armed. The OS list is not cleared
when the person switches to another dog. (Whether the Health tab mounts at launch on iOS is not something I verified.)

**Server push pipeline (read-only look).** `api/utils/push.js` (`sendPush`, `pushForNotification`) sends **visible** Expo pushes to
a user's registered tokens (`api/push-tokens`, `device_push_tokens`, one row per user + token). Sharing events already use it:
`petShareNotify.js` (invite / accepted / declined / revoked / left / owner-deleted → category `owner_sharing`). Notifications v2
(`NOTIF_V2_ENABLED`, off unless set) adds quiet hours, a daily cap per person, valid-token filtering and receipts. There is
**no silent / data-only push path** (no `content-available` anywhere in `push.js`) and the mobile app has **no background task**:
no `expo-task-manager`, no `UIBackgroundModes` in `app.json`, and the only notification listener that reacts to anything is the
tap handler (`utils/notificationDeepLink.js`).

## 3. The problem cases

| # | Case | What happens today | Severity |
|---|---|---|---|
| 1 | Both phones ring for the same task | Expected and intended unless we choose otherwise; no way to say "only ring me" | Low–medium (annoying) |
| 2 | A logs it, B's alarm still rings | B's alarm fires at the scheduled time. B's Today list is correct after a refetch, the alarm is not | **High — the core bug** |
| 3 | B's phone offline | A's log can't reach B. B rings. For medication that is the *safe* failure | Accept |
| 4 | B's app killed / never opened that day | OS fires the alarm anyway; nothing can cancel it. Foreground-only fixes never run | **High** (limits option A) |
| 5 | Access lost (revoked / left / expired) | `handleAccessLost` clears React Query caches and the selection, but **not** the routines/reminders stores or the OS alarms for that dog. The ex-member keeps getting rung up to 14 days | **High — privacy/trust** |
| 6 | New member joins | Nothing armed until they select the shared dog and the Health tab loads routines. No push tells them to | Medium |
| 7 | Snooze | Personal per phone. A's snooze does not hold B's alarm | Low (arguably right) |
| 8 | Different time zones | Routine times are wall-clock; each phone builds dates in its own zone, so a traveller's "08:00" is a different real moment and, across big offsets, a different date in the instance id → completion keys could disagree | Low for a couple at home; **unsolved** for travel |
| 9 | Routine paused/deleted by A | B's alarms survive until B's phone next loads that dog; if A removed the **last** active routine, B's sweep is skipped (`allReminders.length > 0` guard) and orphans stay | Medium |
| 10 | Skip by a family member | Rejected by the server (owner-only) | Medium |
| 11 | iOS 64-alarm cap | iOS keeps only the soonest 64 pending local notifications. 3 meals + 2 walks + 2 doses a day × 14 days = 98, already over, per dog; the daily-return nudge and other dogs share the same 64. Sharing adds the shared dog to the member's budget | Medium, **already present**, I did not measure real phones |
| 12 | "Duplicates" | Same-phone duplicates are already solved (deterministic ids). The new duplicate risk is *one person getting both a local alarm and a server push for the same task* if we ever mix channels | Design rule: one channel per person per task |

## 4. What iOS lets us do (honest limits)

- **Local notifications** fire with the app closed, offline, even after a reboot. They cannot be cancelled remotely; only app
  code (or a notification-service extension, see D) can. Hard cap of **64 pending**; extras are silently dropped.
- **Silent push** (`content-available`): wakes the app in the background *only if* the app has the `remote-notification`
  background mode, the person has Background App Refresh on, the app was not force-quit, and Apple chooses to deliver. Apple
  documents these as low-priority, throttled (roughly a few per hour) and not guaranteed. Treat as an **accelerator, never the
  source of truth**. Needs a native build change (Info.plist + a background notification task), i.e. a new EAS build and store review.
- **Background fetch / app refresh** is opportunistic (iOS decides when, can be hours or never). Not usable for a 08:00 alarm.
- **Visible push** from the server is the most reliable remote signal, but it only *tells a person*; it does not run code or
  cancel an alarm (unless a notification-service extension is added — native work, and I am **not sure** an extension may remove the
  app's pending local alarms; I did not verify).
- **Battery:** local alarms and a foreground refetch cost nothing noticeable; a per-minute poll would (do not do it). Silent pushes
  are throttled by iOS so cost is negligible.
- **Privacy:** pushes pass through Expo and Apple. Keep payloads to ids and a short sentence (`data: {petId, instanceKey, kind}`);
  never put medical detail in the payload; show the actor by public display name only ("Former member" fallback), as
  `petShareNotify.js` already does.

## 5. Options

**A — Reconcile when the app is in front.** On app foreground, on selecting the pet, and on Today focus: ask the server which
instances of the member's dogs are already done (or skipped, or whose routine changed) and cancel the matching local alarms; also
cancel alarms for dogs the person no longer has. No new native code.

**B — Add a silent push to cancel.** When a member completes an instance, the server sends a data-only push to the *other*
members' tokens; the phone wakes and cancels the alarm. A is still needed as the fallback.

**C — Server rings, phones don't (for shared dogs only).** Shared dogs get no local alarms; a server job computes due
instances and sends a normal push to each member, skipping ones already done.

**D — Hybrid with an owner of record.** Phones keep local alarms (A, plus B as accelerator), each person can switch "remind me
about this dog" on/off (so a couple can nominate who rings), and a visible "Sam logged Mango's breakfast" push goes to the others
when it is relevant (due within ± 30 min). Optional later: server-side single sender (C) for dogs where the household opts in.

| | A reconcile | B + silent push | C server-only | D hybrid |
|---|---|---|---|---|
| Effort (rough) | 2–3 dev-days client; +1–2 server days if we add the completions table | +3–4 days incl. native config and new build | 2–3 weeks: port the 2,000-line generator to the server, per-minute scheduler, timezone, cap/quiet hours, receipts | A + B + notify ≈ 1.5 weeks spread over phases |
| Fixes case 2 (A logs, B still rings) | Only if B opens the app before the alarm | Often, not guaranteed | Yes, whenever the phone has network and push permission | Mostly; residue when B is offline/killed/throttled |
| Fixes case 5 (access lost) | Yes, on next open | Yes (push on revoke) | Yes, instantly server-side | Yes |
| Works offline / no network | Rings (safe) | Rings (safe) | **Does not ring** — worst failure for medication | Rings (safe) |
| New native build + store review | No | **Yes** | No (needs push permission only) | Phase 2 yes |
| Server change | Optional | Yes (silent path, completions table) | Large | Yes (small) |
| Battery | ~0 | ~0 | none on device | ~0 |
| Main risk | "Works only when I open the app" | iOS throttling feels random | Missed pill when offline; big build | Complexity of two signals; need clear rule: one channel per person per task |

## 6. Recommendation: D, rolled out in three phases

Rationale: the failure we most want to avoid is a *missed* medication or meal; an extra ring is the lesser evil. So keep local
alarms as the base (works offline, free) and add signals that **cancel when we can**, never signals that **replace** the alarm.
Do not build C until real use proves it is needed.

**Phase 1 — client only, next build (no server, no migration).** Safe, reversible by revert.
1. *Access lost → clear that dog's alarms and reminders.* Extend `handleAccessLost` (`utils/petAccess.js`) to cancel pending
   alarms whose `data.petId` matches (same idea as `selectStaleRoutineNotifications`) and drop that pet's reminders from the store.
2. *Reconcile on foreground and pet select.* Re-run `loadRoutines` for the selected dog on app foreground (not only on Health
   mount) and fix the "no reminders generated → sweep skipped" hole so removing the last routine still cancels orphans.
3. *Arm the shared dog without opening Health:* on accepting an invite / first seeing a shared dog, load its routines once.
4. *Alarm budget:* arm soonest-first up to ~48 alarms across all dogs (leaving room for the daily-return nudge and snoozes), re-armed
   on every foreground, instead of "everything for 14 days". Add a tiny telemetry count of pending alarms to see real numbers.
5. *Per-person "Remind me about this dog" switch* (local setting, no server) — lets a couple choose who rings.
6. For persistent types, cancel alarms for instances already resolved by household logs (the data is already readable).

**Phase 2 — small server addition + native change (next-next build).**
1. New household-scoped table for "this instance is done / skipped, by whom" (describe in §7). Mobile writes it on every
   completion/skip; a member's skip stops being rejected.
2. A *visible* push to the other members when a relevant instance is completed (new category, default on, respects v2 quiet hours and
   cap) — this is the reliable human signal: "Sam gave Mango his pill at 08:02".
3. A *silent* push as accelerator (new send path; background mode `remote-notification` + a background notification task in the
   app) that cancels the matching alarm. If iOS drops it, Phase 1 reconcile and the visible push still cover.
4. Revoke/leave pushes already exist (`pet_share_revoked/left`); make the app act on them (cancel alarms) when it receives them.

**Phase 3 — only with data.** After ~4 weeks, count "rang after done" reports. If still a real complaint, offer C for households
that opt in (server single-sender for that dog, local alarms off for members of that dog — one channel per person per task).

## 7. Schema / API changes (describe only — not written)

Phase 1: none.
Phase 2:
- **Table `reminder_completions`** (name TBD): `pet_id`, `instance_key` (the deterministic reminder id), `routine_id`, `kind`
  (`done` | `skipped`), `completed_by_user_id`, `completed_at`; `UNIQUE (pet_id, instance_key)` (first writer wins, idempotent).
  Migration must follow `CLAUDE.md`: `ENABLE` + `FORCE` RLS, explicit policies — insert for owner/family/caregiver of the pet
  (access via `app_user_has_pet_access(pet_id)`), select for any active member, no update/delete — and a `verify_NNNN.sql`
  (hand-applied, so it needs the PR note). It would also give feeding/walk the missing link between a log and an instance.
  `reminder_dismissals` can stay for the existing owner skip path, or be folded in later.
- **Endpoints:** `POST /api/pets/:id/reminder-completions` (write, also fires the push) and `GET /api/pets/:id/reminder-completions?since=`
  (cheap, polled on foreground). Both gated like logs (`resolvePetLogOwner` with `allowCaregiver`), friendly 403 when the migration
  is not applied (same pattern as 0139/0141).
- **Push:** a data-only send helper (`_contentAvailable`, no title/body, excluded from the daily cap and quiet hours because it shows
  nothing) and one new visible notification type under a new category; EN + ES copy, es-AR voseo, actor by public name only.
- **Mobile:** `UIBackgroundModes: remote-notification` in `app.json`, a background notification task, and the pure
  "which alarms to cancel" function shared by foreground reconcile and the silent-push handler.

## 8. Test plan

- *Unit (jest):* the pure function `selectAlarmsToCancel(pending, {resolvedKeys, lostPetIds, validIds})` — done, skipped, access
  lost, deleted routine, last-routine-removed, other dog untouched, legacy ids; alarm-budget selection (soonest first, cap respected);
  `handleAccessLost` cancels only that dog's alarms; per-dog "remind me" off arms nothing.
- *Store tests:* completion from another member (via the GET) marks the instance completed and cancels once; snooze stays personal.
- *Server (vitest + integration with the real router):* completions table × owner / family / caregiver / outsider / revoked /
  expired / pending, idempotent double-complete, migration-absent friendly 403, push helper never sends to the actor or to a
  revoked member, silent push excluded from cap.
- *Device (needs two phones, or phone + Simulator with a local two-user backend):* A and B ring for the same meal; A logs 2 min before
  → B (app open) stops; B (app backgrounded) — record what iOS does; B app force-quit — expect B still rings (documented limit);
  B airplane mode; revoke while B has a pending alarm; delete the last routine; two time zones; count pending alarms with a
  heavy routine set. Results decide whether Phase 3 is worth it.

## 9. Decisions for Augusto (my recommended answer in bold)

1. **Should every member's phone ring by default for a shared dog?** **Yes (safer against a missed dose), plus a per-person "Remind me about this dog" switch so a couple can choose who rings.**
2. **Do you want a visible "Sam logged it" push to the others?** **Yes, but only when the task was due within ± 30 minutes; otherwise just the in-app bell.**
3. **Is a snooze personal or shared?** **Personal.** Shared snooze adds a server write for little value.
4. **Does one member's "skip" skip it for the whole household?** **Yes** (household truth; needs the Phase 2 table).
5. **Who may complete a task?** **Keep today's rule: owner, family and caregiver.**
6. **Do you accept that, in Phase 1–2, the second phone can still ring when it is offline, force-quit or iOS throttles the silent push?** **Yes — a spare ring beats a missed pill; revisit with data.**
7. **Approve a native build change (background mode `remote-notification` + background task) in Phase 2?** **Yes, but in a build after 33, not in 33.** It needs a new EAS build and store review.
8. **Alarm budget:** **arm the soonest ~48 alarms across all dogs and re-arm on each open, instead of 14 days of everything.** Trade-off: a person who does not open the app for several days gets fewer future alarms.
9. **Time zones:** **not supported for members in different zones in v1** (anchor to the owner's zone, document it).
10. **Accept one hand-applied migration (the completions table) in Phase 2?** **Yes** (small, additive, RLS-forced, with verify script).
11. **Phase 3 go/no-go (server single-sender):** **decide later, after four weeks of Phase 2 data.** Not now.

## 9b. Phase 1 as built: the alarm budget and its trade-off

**What is armed.** One pass (`remindersStore.syncAlarms`, rule in `utils/alarmBudget.js`) arms the **soonest 48 routine
reminders across all dogs**. It runs after every routines read, after local edits and snoozes, and on every return to the
foreground (every dog's routines are re-read then). The generator still builds 14 days; only the soonest 48 get an OS alarm.

**Never evicted:** a running snooze, the daily-return nudge, consult and setup nudges. If many of those are pending, the
routine share shrinks so the total stays at or under iOS's 64.

**The trade-off (accepted, decision 8).** A person who does **not open the app** for several days gets fewer future alarms
than before. With 48 alarms, one dog with 3 meals + 2 walks + 2 doses a day (7 a day) is covered for about **6–7 days**;
two such dogs for about **3 days**. After that the phone is silent until the app is opened once. Before this change iOS was
already dropping everything past 64 without telling anyone, so for busy households the horizon was never really 14 days.
Light schedules (a few reminders a day) still reach the full 14 days.

**Other limits.** A dog whose routines could not be read this launch (offline) keeps the alarms it already had, and they
count against the 48. Re-arming needs the app to run: nothing happens while it is closed (no background task, decision 7).

**Numbers.** The pending-alarm count telemetry (separate server + app change) is what will show whether 48 is enough.

---

## 10. What I could not verify

- Whether the Health tab (and therefore `loadRoutines`) runs at app launch on iOS, or only when it is first shown. This decides
  whether a member who never opens Health still gets alarms.
- The real number of pending alarms on a phone with a busy dog; whether the 64 cap is already clipping alarms in production. Needs
  `getAllScheduledNotificationsAsync` counted on a device.
- iOS silent-push behaviour for this app (delivery rate, throttling) — needs a device experiment with the proposed build change.
- Whether a notification-service extension could cancel the app's pending local alarms (not recommended anyway).
- The current value of `NOTIF_V2_ENABLED` and `NOTIF_V2_DAILY_CAP` in production (I did not query production or Railway), and whether
  push delivery to members works end to end today (APNs credentials — see memory/ops notes).
- A family member's skip being rejected is read from the route code, not reproduced.
- Effort numbers are my estimates from the size of the existing code, not commitments.
