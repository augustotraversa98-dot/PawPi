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

## 2026-11-24 — Night run #4 · PR5b Phase 1C: alarm budget (soonest ~48 across all dogs) — client-only, needs EAS build 33

- One arming pass (`remindersStore.syncAlarms`, pure rule `utils/alarmBudget.js`) arms the soonest 48 routine reminders across all dogs; running snoozes, the daily-return nudge and other notifications are never evicted and the total stays under iOS's 64.
- Every dog is read once per launch and on each return to the foreground, then alarms are topped up (also offline).
- Alarms carry an `alertKey`, so unchanged ones are not re-scheduled.
- Trade-off (accepted, decision 8): without opening the app, a busy household is covered for days rather than 14 — documented in `pr5b-reminder-sync-design.md` §9b.
- The pending-alarm count telemetry is a separate PR (it needs a server allow-list change).

---

## 2026-11-24 — Night run #4 · PR5b Phase 1B: reconcile reminders on foreground and dog select — client-only, needs EAS build 33

- `ReminderReconciler` (tab layout) re-reads the selected dog's routines on dog select and on return from the background (at most every 15 s), and reads a newly seen shared dog once so its alarms are armed without opening Health.
- A re-read now brings reminders in step: edits move the alarm, deleted/paused routines drop their instances, "done" and snooze stay personal. Unchanged pending alarms are not re-scheduled.
- Loads are queued per dog (no duplicate instances); a background load never replaces the routines on screen; a failed automatic refresh keeps what is shown.
- No server pushes, no SQL, no native change.

---

## 2026-11-24 — Night run #4 · PR5b Phase 1A: losing access to a shared dog stops its alarms — client-only, needs EAS build 33

- `handleAccessLost` now also removes that dog's routines, reminders, snoozes and in-app reminder rows and cancels every pending local notification tagged with it (`utils/petReminderCleanup.js`). Other dogs are untouched.
- A loss that happened while the app was closed is caught too: after a successful pets read, alarms armed for a dog that is no longer listed are cancelled (an empty list must be seen twice, so a one-off blank answer cannot silence everything).
- Sweep hole fixed: removing a dog's LAST active routine now cancels its orphan alarms; running snoozes of still-active routines are protected from the sweep.
- One cancellation rule, `selectAlarmsToCancel(pending, {resolvedKeys, lostPetIds, validIds, scopePetIds})`. The streak nudge now carries the pet id so it is cancelled with the dog.
- No server or SQL change.

---

## 2026-11-24 — Family & caregivers series — PR5b design: reminders across household members — DOCS ONLY, nothing built

New proposal doc [`pr5b-reminder-sync-design.md`](pr5b-reminder-sync-design.md) for you to decide on. Problem: a member's phone arms its own local alarms for the shared dog, but when one person logs a task the other phone's already-armed alarm is not cancelled (and an ex-member's alarms are not cleared when access ends).
- Read from the real code: alarms are local `expo-notifications` DATE triggers armed by `loadRoutines` for the selected dog only; cancel happens only on the phone that acts; feeding/walk have no server link between a log and a reminder; skips are owner-only; no silent-push path or background task exists; iOS keeps only 64 pending alarms.
- Four options compared (reconcile on open, silent push, server-only sender, hybrid). **Recommendation: hybrid in 3 phases** — (1) client-only clean-up: clear alarms on access loss, reconcile on foreground, alarm budget, per-dog "remind me" switch; (2) one small household-scoped completions table + a "Sam logged it" push + best-effort silent push (needs a native build after 33); (3) server single-sender only if real use shows it is needed.
- 11 numbered decisions for Augusto with recommended answers, plus a list of what could not be verified, are at the end of the doc.
- No code, no SQL, no EAS build needed.

---

## 2026-11-24 — Family & caregivers series — PR5a: the shared dog is visible and usable (mobile) — client-only, needs EAS build 33

Server work (#749–#753, migrations 0137–0142) is merged and applied; this is the app side so a couple living with ONE dog can each sign in with their own account and see and edit the SAME dog.
- **One list, everywhere.** Every place that lists pets now asks `GET /api/pets?include_shared=1` (own pets first, then pets shared with the person; `is_shared`, `access_role`, `owner_display`, `access_version`). It goes through the single `fetchPets` / `["pets"]` cache, so the launch gate, the pet picker, Feed, Health, My Dog, the onboarding guard and Add-a-dog all see shared dogs at once. There is exactly one `useCurrentPet` (the "duplicate hooks" were already gone).
- **Launch routing.** A person whose ONLY dog is shared with them goes into the app, never into onboarding (their list is non-empty). #747's guarantees are re-asserted with the real EntryPoint: brand-new account → onboarding, business-only → Business home, a transient empty read after the session knew a dog → app. The onboarding guard (mount + right before the POST) counts shared dogs.
- **No add-dog path can create a duplicate.** Onboarding and More → Add a dog send an `Idempotency-Key` (one per attempt, reused by retries, new once the name changes); Add a dog also asks "You already have {name}… is this a different dog?" when the name matches an own OR shared dog. "Add your dog first" now only shows to someone with no dog at all (a shared-only person gets "Only the owner manages sharing" + the owner's name + a household button).
- **Roles — one helper.** `utils/petPermissions.js` (`canDo(role, action)`, `usePetPermissions()`) is the single table, mapped 1:1 to the server matrix and pinned by a test that also fails if any other file reads `access_role`. Applied to: routines (caregiver read-only: no add/edit/pause/delete), vet record (caregiver sees a friendly locked card; family can add but only the owner deletes entries), medications sheet (caregiver read-only, no vaccines tab), vaccine + appointment reads (a caregiver's phone never asks → no 403s), emergency card (tag QR / contact settings / vet links are the owner's), Dog Profile edit button (owner + family), posting a moment (owner + family; a caregiver gets a friendly explanation), Family & caregivers → manage (owner only). A shared dog's posts are not offered edit/delete to the viewer.
- **Role badge + who the owner is, per viewer.** `SharedPetBadge` ("Family · Shared by Sam", "Caregiver · Shared with you" when the owner has no public name — never a username or e-mail) in the picker, the More → My Dogs row and Dog Profile / profile hero; the owner's own dog shows nothing.
- **Access lost (revoked / left / expired).** `access_version` + the list itself are the authority: when a shared dog disappears from a read, everything keyed to it is dropped from the cache, a persisted selection pointing at it is cleared (the person is moved to another dog), and ONE friendly alert is shown (`AccessLostNotice`, EN + ES). A `403 pet_access_revoked` on any request makes the fetch wrapper refetch the pet lists. A failed read no longer wipes a stored selection. All of it is reset on sign-out / account switch (cache-bleed guard).
- **Household reachable.** More menu → "Household & dogs" (was an orphan screen); tapping a shared dog now actually switches to it (the old selection reset is gone).
- **Words.** Raw `pending/active/revoked` → translated labels (EN + ES) incl. `expired/left/declined`; "Former member" / "Ex integrante" for vet-record "Added by", feed names and anonymised ex-members (`former_member_xxxx` usernames); a **Leave** button (with confirmation) on "Shared with me" using the PR4 endpoint. Invite stays handle search (invite code/link is PR6).
- **Tests (EN + ES where text is involved).** New: `petPermissions.test.js` (full matrix + guard), `sharingLabels`, `petAccess`, `findSamePet`, `fetch.accessRevoked`, `usePetProfile.shared` (owner/family/caregiver/shared-only/no dog/loading/error/revoked/role change), `index.sharedOnly` (real EntryPoint), `pet-sharing.roles`, `sharedDog.components` (badge, picker, notice), `AddDogModal.shared`, `RoutinesTab.roles`, `MedicationModal.roles`, `HealthVetRecord.roles`, `health.roles`, `profile.roles`, `petRoleGating.hooks`, plus additions to emergency-card, onboarding, Feed, OwnerMenu, launchQueries, determinePetsRoute, onboardingGuard tests. Existing tests that matched the exact `/api/pets` URL were updated to the new URL.
- **Not done here (PR5b / later), on purpose:** the delete-my-contributions choice on the delete-account screen (needs the legal sentence reviewed first); resend-invite button; reminders shared across phones (a member's phone now loads the shared dog's routines and will schedule its own notifications, so both phones can ring; the owner's already-scheduled notification is still not cancelled when a member logs); a family member deleting their OWN daily moment on the shared dog; the Simulator two-account run (needs a local two-user backend; device checklist in `test-backlog.md`).
- No SQL change needed. Server gaps found: none that block (see the PR body for the two notes).

---

## 2026-11-24 — Keyboard no longer hides text fields, app-wide (shared KeyboardSafeSheet + CI guard) — client-only, needs EAS build 33

Reported: Quick Check on iPhone, keyboard open, the notes box under Ears hidden and the visible scroll area tiny (it had been "fixed" before, screen by screen).
- **Root cause (layout math, `docs/keyboard-convention.md`).** Hand-rolled sheets were `Modal transparent > KeyboardAvoidingView > View "90%"` with fixed header, instruction block, footer hint + button and `insets.bottom + 20` home-indicator padding: with the keyboard up ~270pt of chrome was left inside ~464pt, so ~194pt (SE-size ~130pt) of scroll. And the focused input was scrolled only "above the keyboard", not above the pinned footer, so the last field stayed hidden under it.
- **Fix at the shared level.** New `KeyboardSafeSheet` (+ `useKeyboardMetrics`, pure `keyboardLayout.js`): full-window transparent Modal driven by the real keyboard overlap, sheet grows to all space above the keyboard, sub-header/hint collapse and footer padding drops while typing, footer pinned above the keyboard outside the scroll, backdrop tap and drag dismiss the keyboard. `KeyboardAwareScrollView` now scrolls into the VISIBLE area (min of scroll bottom and keyboard top).
- **Migrated:** Quick Check (both modes), Medication sheet, medical-care issue, place/provider review, walk request, caregiver walk log, 7 routine modals, feeding issue, add-dog, vet appointment detail, vet-record proposal review, `KeyboardSafeFormModal`. Left on purpose (listed with reasons in the guard): Bark, ServicesDiscovery, PhotoCheckCapture, chat screens, pageSheet forms whose CTA is inside the scroll.
- **Guard:** `keyboardSafety.guard.test.js` scans every src file with a `<TextInput>` and fails on a bypass (plain ScrollView, hand-rolled transparent sheet, new unlisted file). Device checklist in `test-backlog.md`.
- No SQL change needed.

---

## 2026-11-23 — Care Ring arcs no longer all turn green on a rest day — client-only, needs EAS build 33

Reported on a live iPhone: pet 27's ring showed all three arcs green while the card said "2 of 3", and no moment was uploaded (one had been posted then deleted).
- **Diagnosis (read-only production check, counts/booleans only).** NOT stale state and NOT the database: pet 27 has 0 posts, `pet_care_days.moment_done = false`, `ring_closed = false`, and the server derivation (`app_pet_ring_segments`, 0137) is correct, because `posts` is a HARD delete (no `deleted_at`) and the delete hook already invalidates `["care-ring"]` (AUDIT A-24). The real cause: `pet_care_days.rest_day = true` for that pet today (one tap on the "Taking a rest day?" link). On a rest/paused day `CareRing` repainted ALL three arcs in one "resting" green and hid the count, while the card's text still read the real "2 of 3".
- **Fix (`CareRing.jsx`, `careRing.js`).** Arcs always show what was really logged (new pure `ringArcTones`): done arcs keep their colour; open arcs on a rest day get a pale sage track (never "finished"); the centre keeps the moon and now also the real n/3 count.
- Tests: `careRing.test.js` (4 new `ringArcTones` cases), new `CareRing.arcs.test.jsx` (4), new `useCareRing.momentDelete.test.jsx` (post a moment then delete it: the mounted ring closes then reverts to 2/3 via the real hooks).
- No SQL change needed.

---

## 2026-11-23 — Care Ring pills stay tappable at every progress (0/3 to 3/3) — client-only, needs EAS build 33

Reported on a live iPhone: once 1 of 3 ring pills was done, tapping the other pills (to do a quick update) did nothing.
- **Root cause.** Not a disabled state tied to the done-count. On Health → Today the Walk and Care pills (and the ring arcs) called `router.push("/(tabs)/health")` — the screen the owner is already on — so the tap was a silent no-op at any progress. Only Moment (feed tab) navigated.
- **Fix (`CareRingCard.jsx`).** The card now handles taps itself: Walk opens the quick walk log in place, Care opens the quick check (`GeneralCheckModal`, quick mode), Moment still hands off to `onPressSegment` (feed). The ring's own arcs share the same handler. A completed pill behaves the same way (log another walk / another quick check) — a tap is never swallowed.
- Tests: new `CareRingCard.pills.test.jsx` — every pill and the ring arc, across 0/3, 1/3 (walk or care done), 2/3 and 3/3.

---

## 2026-11-23 — Date picker hardening (the "1969" bug) — client-only, needs EAS build 33

Reported on a live iPhone (UTC-3): Health → Track → Medications & care → Vaccine → Add vaccine, expiration date opened on Dec 1969, a picked future date jumped back to 31 Dec 1969, repeating it crashed.
- **Root cause (partly verified).** I could not reproduce it on the Simulator with the current shared `DateField` in isolation (opens on today, picks work), so the exact native trigger is **not proven**. What the code audit and tests do prove: 1969 is what null / "" / 0 / an Invalid Date / a native timestamp of 0 turn into in UTC-3, and several paths let those through (`formatLocal*` helpers with `new Date(null)`, `toCanonicalDate` on an invalid Date, an unfiltered picker callback, a `new Date()` max bound that changes every render, un-guarded `new Date(...).toISOString()` in event/transport booking).
- **Fix: one shared layer in `utils/canonicalDateTime.js`.** Empty-ish values and the 31 Dec 1969 / 1 Jan 1970 epoch read as "no date" everywhere (never displayed, picked or saved); the picker is only handed a valid, in-bounds Date; dismiss / empty / invalid / epoch picks keep the previous value; min/max bounds are normalised and stable; `combineDateTimeToISO` replaces three throwing `toISOString()` call sites; `formatLocalDate/Time/DateTime` return "" instead of "31 Dec 1969"; date-only strings no longer shift a day in UTC-3.
- **Audit result:** every date input already goes through `DateField` (25 files); no typed dates. Fixed the leftover paths above (Medications & Care, vet appointment + medical profile validation, event/transport/walk booking).
- Tests: new util tests (run in Rome AND Buenos Aires), new `DateField` tests, vaccine + preventive form component tests (`MedicationModal.dates.test.jsx`).

---

## 2026-11-23 — Family & caregivers series — PR4: sharing LIFECYCLE (leave, resend, notifications, account deletion) — OPEN, NOT merged (builds on merged #752; migration **0142** after 0141)

Owner decision 1 (account deletion) and the lifecycle half of the audit (Q10: B4 no leave, B9 respond 500, C6 double revoke).

- ✅ **Leave.** `POST /api/pet-caregivers/[id]/leave` (grantee only, ACTIVE grant) → new soft status **`left`** + `left_at` + audit row; history is kept, the owner can re-invite the same person. A still-pending invite "left" is a decline. Idempotent (2nd call = 200 `already`). The function is `leave_pet_caregiver()` SECURITY DEFINER (grantees still have no UPDATE/DELETE on `pet_caregivers` — tested).
- ✅ **Revoke** is idempotent (PR1 pin C6 flipped: 2nd revoke = 200 `already`, no 2nd audit row/notification). **Respond** is fixed with a lookup + `withSavepoint` (PR1 pin B9 flipped: wrong account / double tap / expired invite = friendly 404 `invite_not_found` / `invite_not_pending` / 410 `invite_expired`, never a 500, one state change under concurrent taps).
- ✅ **Resend a pending invite.** `POST /api/pet-caregivers/[id]/resend` (owner only): atomic limiter (≥1 h between sends, ≤5 resends → 429 `resend_too_soon` with `retry_after_seconds` / `resend_limit`), optionally extends `expiresAt` (future only). Fresh bell row to the invitee only.
- ✅ **Notifications** (existing infra: `notifications` row + `safeNotifyIsolated` savepoint + push through the v2 owner-push pipeline, new `owner_sharing` category defaulting ON): `pet_share_invite` → invitee; `pet_share_accepted` / `_declined` / `_left` → owner; `pet_share_revoked` → the member (active only; cancelling a pending invite is silent); `pet_share_owner_deleted` → every active/pending member before an owner's account goes. Exactly one recipient (`user_profiles.id`), never yourself, never duplicated (idempotent actions send nothing the second time). Body is a plain sentence in the recipient's language (builds 30–32 render unknown types as a bell row with that body). If the notification type CHECK is not yet widened the action still succeeds and the notice is skipped.
- ✅ **Instant effect.** The grant status is read live on every request, so the member's *very next request* after revoke/leave is denied (`403 code: pet_access_revoked`), and their opt-in pet list / `?mine=true` no longer include the pet. For PR5: `access_version` (a short hash of the caller's active grants) is returned by `GET /api/pets?include_shared=1` and `GET /api/pet-caregivers?mine=true` — when it changes the app refetches pets; **no mobile UI in this PR**.
- ✅ **Account deletion (decision 1).** `delete_my_account()` keeps its exact signature and now delegates to `app_delete_my_account(p_delete_contributions)`. A **member** who deletes their account: their **posts on pets they do not own are kept** and re-attributed to a fresh anonymous profile — username `former_member_<random>`, name "Former member", no e-mail, no avatar, no sign-in method, hidden from people search; vet-record attribution (`created_by_user_id` on the 8 record tables) points at it too and renders **"Former member"** (also fixes the legacy "Editor · Editor" for rows whose author was already nulled); their grant + audit history stay as `left`; their reactions, push tokens and notifications are deleted. `DELETE /api/account?delete_contributions=1` deletes their posts on others' pets instead (PR5 will surface the choice). Logs a member wrote are stored under the OWNER's id and never carried the author, so they simply stay. An **owner** who deletes their account: the pet and everything on it go (cascade, unchanged); every active/pending member is notified first, in the same transaction. A person who held no grant creates no anonymous profile. Still SECURITY DEFINER, pinned `search_path`, REVOKE/GRANT pair.
- ✅ **Migration 0142** (`sharing_lifecycle`; `verify_0142.sql` **7 rows**, `rollback_0142.sql`) — written, **NOT applied, human-applied** after 0141: `left` status + `left_at`/`last_notified_at`/`resend_count`, audit actions `leave`/`resend`, six notification types, `leave_pet_caregiver()`, `app_delete_my_account()`, the `delete_my_account()` wrapper. **Safe without it:** leave/resend → friendly 503 `sharing_lifecycle_unavailable`; accept/revoke notices that need a new type are skipped; account deletion keeps the old cascade.
- **Apple account-deletion (Guideline 5.1.1(v)).** The requirement is that the user can delete *their account* in-app and that this actually deletes the account and its personal data. That is met: the login, e-mail, name, avatar, tokens, reactions and notifications are gone and nothing links the kept content back to the person. What stays is content on someone else's dog, now attributed to "Former member". Apple accepts retention that is anonymised/legally required, but it is **not a legal opinion**: a kept caption or photo can still identify a person (a face, a name typed in the text). Mitigations shipped/queued: the **delete-my-contributions option** exists server-side now (`?delete_contributions=1`) and PR5 puts it on the delete screen; the privacy policy / delete-account copy should say "posts you made on a pet you do not own stay on that pet, shown as 'Former member', unless you choose to delete them". Please have that sentence reviewed before build 33 goes to App Review.
- Tests: `sharing-lifecycle.integration.test.ts` (46: owner / family / caregiver / outsider / revoked / expired / pending × invite, respond, revoke, leave, resend, notifications, account deletion, old-build shapes, migration-absent), `verify-scripts-0142`, `rollback-scripts-0142`, unit tests for the notify helpers/prefs; PR1 pins B9, B4, C6 flipped.

| | |
|---|---|
| Needs build 33? | **No** for the server behaviour (all of it works with builds 30–32: same shapes, plain-text bodies, 403 `pet_access_revoked` is just a 403). **Yes** for the UI that uses it (Leave / Resend buttons, delete-contributions choice, refetch on `access_version`) — PR5. |
| Server-only? | **Yes**, plus one hand-applied migration (0142). |
| Safe for builds 30–32? | **Yes.** Success shapes of invite/respond/revoke/list are unchanged (additive fields only); nothing a 30–32 build calls changes status; revoke is now idempotent (200 instead of a 404 alert). |
| Migration by hand? | **0142** — `verify_0142.sql` 7 PASS; rollback `rollback_0142.sql`. Order **0139, 0140, 0141, 0142** (0139–0141 already applied). |

---

## 2026-11-23 — Family & caregivers series — PR3b: family / co-owner WRITE paths — MERGED (#752; migration order **0139, 0140, 0141**, all applied + verified)

Owner decision 2: **family/co-owner reads and writes everything except managing sharing and deleting the pet; caregiver stays read + log only.** PR3 delivered the reads; this delivers the writes, in the API **and** RLS.

- ✅ **Routines** (create / edit / move / soft-delete), **pet profile** (`PATCH /api/pets/[id]`: name, breed, handle, avatar, notes, weight…), **medical profile** (update + first-time create), **medications**, **preventive treatments**, **vaccinations**, **vet appointments** (list / create / edit / cancel) — for the **owner and an active family grantee**. Every row a family member writes is **anchored to the pet's OWNER** (`owner_user_id` = the pet's owner; `created_by_user_id` / `created_by_role='editor'` record who actually wrote it where the table has them), so the household sees one history. A routine can only move between dogs of the SAME owner.
- ✅ **"Recorded as given" vaccine path** (`POST /api/health/medical-care-logs` with `careType:'vaccine'`, status given/completed — it also writes `pet_vaccinations`): owner and **family** allowed; a **caregiver** gets a friendly `403 vaccine_family_only` (PR3's `vaccine_owner_only` is relaxed to family). A caregiver still logs/completes any non-vaccine care.
- ✅ **Pet GET by id** now also serves any active grantee (read access), so a shared dog's profile loads for family AND caregiver.
- ✅ **Still owner-only, unchanged:** managing sharing (invite / revoke) and deleting the pet (there is no delete-pet route at all). A caregiver cannot edit any of the above (404/403/refused by RLS).
- ✅ **Migration 0141** (`family_write_policies`; `verify_0141.sql` **9 rows**, `rollback_0141.sql`) — written, **NOT applied, human-applied** after 0139 and 0140. (a) `<t>_family_all` FOR ALL on `pet_medications`, `pet_preventive_treatments`, `pet_vaccinations`, `vet_appointments` and `pet_medical_profiles_family_insert`, each with a WITH CHECK that ties the row to the pet's owner (stricter than the 0049 family policies); (b) **owner own-row hardening on 3 more tables** — the PR3 tests showed `pet_vaccinations`, `vet_appointments` and `pet_medical_profiles` (left out of 0140 because they carry provider policies) have the same "any user can write a row against any pet" gap, so their `<t>_owner_all` also gets `AND app_owns_pet(pet_id)` (production, read-only counts 2026-11-23: 0 of 38 rows authored by a non-owner). Provider policies are untouched.
- ✅ **Safe without 0141:** a family member's first write to those tables answers a friendly `403 family_write_unavailable` (policy-presence probe), edits of existing rows match zero rows (404) — never a 500; owners, caregivers and providers are unaffected. Tested by dropping the policies (and restoring them).
- ✅ **Old builds (30–32): unchanged.** They never reach a shared dog (it is opt-in, PR3); every owner path keeps its status codes, shapes and `created_by_role:'owner'`. A stranger POSTing for someone else's dog still gets the old `404 Pet not found`.
- Tests: `family-write-paths.integration.test.ts` (26: every area × owner / family / caregiver / outsider / revoked / expired / pending, RLS directly as `pawpi_app`, migration-absent, old-build invariants — **13 fail without 0141**), `verify-scripts-0141`, `rollback-scripts` (+0141); PR1/PR3 pins that encoded "family cannot edit the pet profile / record a vaccine" flipped.

| | |
|---|---|
| Needs build 33? | **No** (server + DB). The family editing UI is PR5 (build 33+). |
| Server-only? | **Yes**, plus one hand-applied migration (0141). |
| Safe for builds 30–32? | **Yes** (see above). |
| Migration by hand? | **0141** — `verify_0141.sql` 9 PASS; rollback `rollback_0141.sql`. Order **0139, 0140, 0141**. |

---

## 2026-11-23 — FOLLOW-UP (before the next release): sweep migration for the ~30 other pet-linked tables with own-row-only policies

Not in any PR yet. The pattern "`<t>_owner_all` checks WHO wrote a row, never WHICH PET it points at" (found in PR3, closed by 0140 for 21 tables and by 0141 for 3 more) still exists on about **30 other pet-linked tables** — `daycare_stays`, `groom_sessions`, `household_leaderboard_prefs`, `insurance_leads`, `insurance_policies`, `lost_reports`, `nutrition_plans`, `pet_care_days`, `pet_emergency_cards`, `pet_emergency_share_links`, `pet_food_recall_matches`, `pet_leaderboard_weeks`, `pet_streaks`, `reengagement_state`, `rx_fulfillment_orders`, `rx_refill_requests`, `sitting_visits`, `social_walks`, `telehealth_sessions`, `training_programs`, `training_progress`, `training_progress_self`, `transport_trips`, `walk_requests`, `walk_sessions`, `weekly_digest_state`, `provider_reviews` (own-row insert/update), and the update policies of a few more (production catalog query 2026-11-23: only `pet_caregivers_insert` and `care_access_grants_insert` check the pet today).
- **Recommendation:** ONE sweep migration (`0142+`), but **each table checked against its own flow first** — several legitimately reference a pet the author does not own (a walker's session, a provider's booking, a review of a place, shared "social" rows), so a blanket `app_owns_pet(pet_id)` would break them. Method: for each table (1) list the writers (routes, DEFINER fns, crons), (2) pick `app_owns_pet` / `app_user_has_pet_family` / provider-grant as appropriate in WITH CHECK, (3) add a harness test like `non-member-pet-writes.integration.test.ts` (insert / re-point / update / delete refused for a non-member; legit paths still pass; fails without the migration), (4) `verify_NNNN.sql` with a read-only "0 mismatched rows" data check, (5) `rollback_NNNN.sql`. Apply before the next release; none is exploitable through the API today (the routes check pet ownership), so this is defence in depth, but the DB should not rely on every route remembering.

---

## 2026-11-23 — FOLLOW-UP (separate item, NOT fixed in PR3b): provider walk-report and groom-note writes into the owner's health tables look broken (RLS)

**What I found (read-only, 2026-11-23).**
- `PATCH /api/providers/[id]/walk-sessions/[sessionId]` (`action:'finish'`) writes the walk report as a `health_walk_logs` row (+ a `health_timeline_events` row) with `owner_user_id = the pet's owner`, **under the walker's (staff) identity**. `POST /api/providers/[id]/pets/[petId]/groom-sessions` does the same for a coat/skin note into `health_general_checks`.
- Production `pg_policies` on `health_walk_logs`, `health_general_checks` and `health_timeline_events` contain ONLY `<t>_owner_all` (owner_user_id = me) and `<t>_family_all` (0049) — **there is no provider policy**. A walker is neither the owner nor a family grantee, so the INSERT is refused by RLS ("new row violates row-level security policy").
- **Reproduced in the harness** (a walker with an active `health_logs_write` care grant finishing an in-progress walk): the response is **HTTP 500 `Internal server error`, the walk session stays `in_progress`, and no health log is written.** The cause is the `try { … } catch (healthError) { console.error(…) }` around the INSERT: the code comment says "the session is finished regardless … do NOT roll back the finish", but the INSERT is NOT in a savepoint, so the failed statement aborts the request transaction and the final COMMIT fails — `withRequestContext` turns that into a blanket 500 and **rolls back the finish UPDATE too**. (The inner timeline `try/catch` has the same flaw.) So the "best-effort" write is not best-effort: it takes the whole finish down.
- **Production impact today: none visible — `walk_sessions` has 0 rows and `groom_sessions` has 0 rows in production** (and `health_walk_logs` holds only 3 `manual` rows), so the walker/groomer flows have never run there. It will fail the first time a real walker finishes a walk.

**Recommendation (own PR, before any walker/groomer goes live):**
1. Wrap each of the two health writes (and the timeline write) in `withSavepoint` so a failure can never roll back the finish, and test that the finish returns 200 with `healthLog: null` when the report write is refused.
2. Decide the intended access model and implement it explicitly instead of through the owner policy: either (a) a **provider write policy** on the 3 tables gated on `app_provider_has_grant(pet_id, 'health_logs_write')` + staff membership (INSERT only, owner-anchored `owner_user_id = pets.owner_user_id`), or (b) a `SECURITY DEFINER` helper `app_write_walk_report(...)` (pinned search_path, REVOKE/GRANT pair) that does the insert after checking the grant — (b) is the smaller surface. Add `verify_NNNN.sql` + rollback + a harness test for walker/groomer × granted / ungranted / revoked / expired grant.
3. Same review for any other provider route that writes into an owner-private table under staff identity (`sitting-visits`, `daycare-stays/report-cards`, `training-progress`, `transport-trips`): grep shows they write their own provider tables, but worth confirming none also writes owner health data.

---

## 2026-11-23 — Family & caregivers series — PR3/7: shared pets (opt-in list) + grantee read paths + caregiver logging + moment lock + expiry — OPEN, NOT merged

PR1 (#749) and PR2 (#750) are MERGED. This PR makes the shared dog **usable by the server for the partner who owns no dog**, with **zero behaviour change for builds 30–32**.

- ✅ **`GET /api/pets` — shared pets are OPT-IN (`?include_shared=1`).** The default response is byte-for-byte what it always was (proven by a test that compares the body before/after the user is given an active grant, mutation-tested). With the opt-in: owned pets first (the same rows + `is_shared:false`, `access_role:'owner'`), then pets the user holds an **active, unexpired** grant on (`is_shared:true`, `access_role: family|caregiver`, `grant_id`, `grant_expires_at`, `owner_display {full_name|null, username, avatar_url}`, weight from the pet's latest weigh-in); no duplicates; revoked/expired/pending/declined never listed.
- ✅ **Owner decision 2 (roles), enforced in the API AND in RLS.** Caregiver: **reads** health logs, routines, medical profile, emergency card, meds, preventive care, allergies/conditions; **logs / completes** (append-only, anchored to the pet's owner); can NOT edit/delete a log, routines, the vet record, the pet profile or sharing. Family keeps what 0049 gave it. Vet documents / labs / surgeries / notes / vaccinations / appointments stay closed to caregivers.
- ✅ **Health reads anchored to the pet's owner** (`owner_user_id = (SELECT owner FROM pets WHERE id=… AND (owner OR active grantee))`) on all 11 health GETs + timeline + meds/preventive; routines, medical profile and emergency card resolve the same way. The emergency card for a grantee is **read-only**: no lazy create (that mints the tag token), no tag token / contact fields / share links.
- ✅ **Daily-moment lock:** a family/caregiver on THIS dog is never locked out of its moments; "posted today" now counts a moment on any dog in the viewer's household (owned or shared, whoever posted it) or authored by them. For a user with no grants it is exactly the old rule.
- ✅ **Expiry:** `GET ?mine=true` no longer lists an expired grant; the owner's list shows `status:'expired'` + `is_expired`; an expired pending invite answers `410 invite_expired`; inviting with a past/garbage expiry is a friendly `400`.
- ✅ **Migration 0139** (`grantee_read_and_caregiver_log_rls`; `verify_0139.sql`, 8 rows) — written, **NOT applied, human-applied**. Safe without it: a caregiver reads nothing and logging is a friendly `403 caregiver_logging_unavailable` (never a 500); owners and family never depended on it.
- ✅ **Pre-existing policy gap found while testing, now closed for the health/vet-record/routine tables — migration 0140.** The 0022/0117 own-row policy (`owner_user_id = me`) checked WHO wrote a row, never WHICH PET: any signed-in user could INSERT a row stamped to themselves against ANY `pet_id`, or UPDATE one of their own rows to re-point `pet_id` at someone else's dog (21 tables: the 12 `health_*` logs, allergies/conditions/labs/surgeries/vet documents, routines, reminder dismissals, meds, preventive treatments). They could NOT read or delete anyone else's rows, nor stamp a row to the owner. Reachable through the API in exactly two places (`PUT /api/routines` with a foreign `petId`, `POST /api/health/reminder-dismissals`) — both now check pet ownership in the route (live as soon as the server deploys); everything else was reachable only by direct DB access (the Data API is revoked, 0126). Effect of a planted row: invisible to the pet's owner in the owner-scoped routes, but visible to family via the pet-keyed policies and counted by `app_pet_ring_segments` (a stranger could fill another dog's Care Ring). **Production (read-only counts, 2026-11-23): 0 rows in those 21 tables were authored by someone who is not the pet's owner** (≈125 rows) — nothing has been exploited. 0140 adds `AND app_owns_pet(pet_id)` to WITH CHECK (USING unchanged); proof: `non-member-pet-writes.integration.test.ts` (48 tests, **fails on all 21 tables when 0140 is removed**). **0139 alone does NOT close it** (it adds permissive policies; it cannot remove the old one). ⚠️ The same own-row shape exists on ~30 other pet-linked tables (bookings, nutrition, insurance, lost reports, walk/daycare/sitting/groom, training, leaderboards, `pet_care_days`…): recommended follow-up = one sweep migration, each table checked against its own flow first.
- **Scoped OUT (next, before PR4):** family **write** paths that are still owner-only in the API — routines create/edit/delete, pet profile PATCH, medical profile, meds/preventive/vaccination/appointment writes (RLS exists for some, not all). Not needed for the shared-dog flow to work; they make "co-owner edits everything" true.

| | |
|---|---|
| Needs build 33? | **No** for this PR (server + DB). The opt-in is consumed by the mobile work in PR5 (build 33+). |
| Server-only? | **Yes** (+ one hand-applied policy migration) |
| Safe for builds 30–32? | **Yes** — default `GET /api/pets` unchanged byte-for-byte; owner payloads of emergency card / medical profile unchanged (helper columns stripped); the only visible change is the expiry fix (an expired grant stops being listed as "active") and log writes by a caregiver now succeeding. |
| Migration by hand? | **0139** (`verify_0139.sql`, 8 PASS) — optional for owner/family, required for caregiver reads/logging. **0140** (`verify_0140.sql`, 6 PASS incl. a "0 mismatched rows" data check) — security hardening; apply after 0139. |

---

## 2026-11-23 — Family & caregivers series — PR2/7: duplicate-pet guard on `POST /api/pets` — MERGED #750 (2026-11-23)

Fixes audit gap **B8** (a retry / double tap / lost response created a second row for the same real dog). PR1 ([#749](https://github.com/augustotraversa98-dot/PawPi/pull/749)) is **MERGED** (squash `2bbf8425`): journey tests + migration 0137 (`app_pet_ring_segments` caller check — hand-apply, ACTION 9) + two CI-harness fixes (checkpointing the throwaway Postgres, explicit heap for the single integration fork; CI had been failing on file-slot exhaustion and then heap OOM — `main`'s own run after #748 was red for the same reason).

- ✅ **No client cooperation (builds 30–32):** same `owner_user_id` + same name (case- and whitespace-insensitive) as a pet that owner created in the last **5 minutes** → `200` with the SAME `{ pet }` shape (header `Idempotent-Replay: true`) and the existing row **unchanged**; no second row. A same-named dog created later, a different name, or another owner's dog → created as before. The check runs **before** the handle checks, so a retry carrying an explicit handle is a replay, not a confusing `409 handle_taken`.
- ✅ **Concurrency:** every create takes a transaction-level advisory lock keyed on the owner (`pg_advisory_xact_lock(hashtext('pet-create'), owner)`); simultaneous identical requests are serialised, the second sees the first's committed row. Proven (and mutation-tested: without the lock the race tests fail with two `201`s).
- ✅ **Optional `Idempotency-Key` header** (future clients): same owner + same key → the same pet forever (no window); an unseen key = a new attempt (created even if the name matches a pet from a minute ago); same key for a different dog → `422 idempotency_key_reused`; malformed → `400`. Needs **migration 0138** (`request_idempotency_keys`, own-row FORCE RLS). **Until 0138 is applied the key is ignored and the retry-window guard still protects** (tested: no 500).
- ✅ Grants are irrelevant to the guard: a family/caregiver on someone else's dog can still add their own, even with the same name. `GET /api/pets` untouched (that is PR3).
- Accepted trade-off: two genuinely different dogs with the SAME name added by the same owner within 5 minutes will be treated as one (a retry cannot be told apart from it without a client key). Newer clients can send a fresh `Idempotency-Key` to opt out.
- PR1's `TODAY [B8]` / `DESIRED [PR2]` pins are flipped into one passing test; the new matrix is `pets-duplicate-guard.integration.test.ts`.

| | |
|---|---|
| Needs build 33? | **No** (builds 30–32 benefit immediately once the server deploys) |
| Server-only? | **Yes** |
| Safe for builds 30–32? | **Yes** — same request/response shape; a replay is `200` instead of `201` (the app treats any 2xx as success) |
| Migration by hand? | **0138 — optional**, only for the explicit-key path; `verify_0138.sql` (7 rows PASS) |

---

## 2026-11-23 — Family & caregivers (couples sharing ONE dog) — audit + fix series PR1/7 (tests + ring caller check) — MERGED #749 (2026-11-23)

Audit: [`family-sharing-audit-2026-11.md`](family-sharing-audit-2026-11.md) (verdict table, permission matrix, release map, lifecycle, UI-vs-RLS, ranked gaps). Owner decisions 2026-11-23: members' posts/logs are **anonymized** (not deleted) when a member deletes their account; an owner deleting theirs takes the pet with it **after notifying members**; **caregiver** reads feeding/routines/meds/emergency/health logs and can LOG/complete but not edit; **family** reads+writes everything except managing sharing and deleting the pet (API **and** RLS, UI to match); a nullable `logged_by` on health logs + routine completions; a hashed one-time **invite link/code** table (migration written, hand-applied by the owner).

| PR | What | Build 33? | Server-only? | Safe for builds 30–32? |
|---|---|---|---|---|
| **1 (this)** | Journey integration tests (owner / family partner who owns no dog / caregiver / outsider, real router as `pawpi_app`) incl. `it.fails` pins for every desired behaviour + **migration 0137** (`app_pet_ring_segments` authorises its caller) + `verify_0137.sql` | no | yes (tests + one DB function; **0137 hand-applied**) | yes — legitimate callers unchanged, denied callers get zero rows and the care-ring route already falls back |
| 2 | Duplicate-pet guard on `POST /api/pets` (idempotency/retry) | no | yes | yes (additive) |
| 3 | `GET /api/pets` returns shared pets additively (`is_shared`, `access_role`); family/caregiver READ paths; daily-moment lock; expiry display | no | server (+ a policy migration for the caregiver read/log tables) | yes — old builds ignore the new fields; shared rows must not expose edit controls on old clients |
| 4 | Leave / resend / revoke, notifications, instant cache invalidation, account-deletion behaviour | partly (UI buttons) | server first | yes |
| 5 | Mobile: shared-only launch routing, selector/Feed/Health/My Dog with a shared pet, reminders shared completion, EN+ES, "Editor · Editor" | **yes (build 33+)** | no | n/a |
| 6 | Invite link/code (migration + API + UI), Apple Hide My Email path | yes for the UI | API + migration first | yes |
| 7 | `logged_by` | UI part yes | server + migration first | yes |

- Findings pinned by PR1 as `TODAY` tests (they flip on purpose when fixed): B1 shared-only `GET /api/pets` is empty; B2 family writes but cannot read health logs / routines / medical profile / emergency card; B4 no leave, expired grants shown "active"; B8 no duplicate-pet guard; B9 a non-grantee answering an invite gets a **500** instead of the intended 404 (the RAISE aborts the request transaction; needs a savepoint — fixed in PR4); C6 revoking twice is a 404.
- Production (read-only, counts only, 2026-11-23): `pet_caregivers` 1 grant total (0 active/pending). Older medical files still on the PUBLIC bucket: **2 of 3** `vet_documents` and **3 of 4** `health_photo_checks` rows are legacy public URLs (6 objects already in `media-private`); `areas` photos in general checks: 0. Tiny, but a revoked member keeps any URL they saw — the A-04 "privatize/expire existing public URLs" step is still the fix.

---

## 2026-11-23 — Family & caregivers no longer throws a new owner back into onboarding — #747 MERGED (squash `bac6e176`), NOT device-tested, NOT in any build yet

- ✅ **Bug:** after finishing onboarding, tapping a ROOT-level More-menu item (**Family & caregivers** `/pet-sharing`, **Lost & found**, **Memories**) landed on `/onboarding-photo` (after a relaunch it silently bounced back to Profile). Reproduced on the iOS Simulator; Grafana shows 2 real `nav_unexpected_redirect` events (`/pet-sharing` → `/onboarding-photo`, `onboarding_guard`) from build 1.0.4 and no `onboarding_wizard_for_existing_owner` in 90 days (that guard only runs on mount, and the wizard screen was already mounted underneath).
- ✅ **Cause:** `(tabs)/more/index.jsx` called `navigation.popToTop()` on the Profile tab's `blur` (#571). A root screen pushed over the tabs also blurs the tab; the stack was already at its root, so POP_TO_TOP bubbled to the ROOT stack and popped it to its first route (the wizard, for a fresh sign-up). Present in builds 27–32; **not** Apple-specific and **not** a wrong `owner_user_id` (refuted by a production aggregate check and a real-Postgres test).
- ✅ **Fix:** `utils/popStackOnTabLeave.js` (reset only the Profile stack; never when it is already at its root or the same tab is still selected; action targeted at the stack key). Launch routing: an empty/transient pets read no longer sends an owner whose pets this session already knows to onboarding (`determinePetsRoute` `knownPets`); a genuinely new account is unchanged. `pet-sharing` shows a "no dog yet" empty state (EN + ES) and never navigates away. `utils/onboardingGuard.js` untouched.
- ✅ **Tests:** real-navigator regression with a control that reproduces the old bug; launch-hardening cases (new account, switched account, account deletion, empty/junk cache, 401, business-only, both-roles); every OwnerMenu item pushes its own path; Apple-style sign-up stores `pets.owner_user_id = user_profiles.id`.
- ⏳ **Ships only with a new native build** (JS-only change, but the live builds embed their own JS). EAS shows iOS builds **30** (1.0.4, `280fc814`), **31** (1.0.4, `2d456ec7`) and **32** (1.0.5, `6b105099`), all FINISHED, all containing the bug; which of them is submitted/live was not checked. Device checklist: [`test-backlog.md`](test-backlog.md) "To test — #747". **Over-the-air option (NOT used, nothing published):** EAS Update is configured (`updates.url` set, channel `production`, runtime `"1.0.0"` on builds 27/30/31/32 — all would receive an update on `production`). The fix cherry-picks cleanly onto the build-30 commit `280fc814` (121 related tests pass there). Publish it only from such a hotfix branch (NOT from `main`, which carries every merged change since) with the `EXPO_PUBLIC_*` values from `eas.json` `build.production.env` set inline (`eas update` does not apply them) and no `.env.local`; see `release-1.0.4.md` §7 for the OTA cautions.
- Known, accepted limit of the launch hardening: if every dog were removed on the SERVER while a session is alive and the launch gate re-ran in that same session, the owner would reach the app (not onboarding) until the next sign-in. There is no in-app way to delete a dog, and account deletion / logout / switching account wipes the cache first, so this needs a manual DB change.

---

## 2026-11-03 — v1.0.5 PREPARED (docs + version bump only) — NOT built, NOT submitted, NOT device-tested

v1.0.4 (EAS build 30, built from `280fc814`) is live. 1.0.5 exists for two bugs found after it; the plan, commands and checklist are in [`release-1.0.5.md`](release-1.0.5.md), the store text in [`app-store-whats-new-1.0.5.md`](app-store-whats-new-1.0.5.md).

- ✅ **Signed out ~7 days after sign-in:** the server session token lived 7 days with no refresh. **#732 (server, LIVE on Railway):** 30-day lifetime (`AUTH_JWT_MAX_AGE_SECONDS`) + rolling refresh header `X-Pawpi-Refreshed-Token` after 24 h (`AUTH_JWT_REFRESH_AFTER_SECONDS`), backward compatible (builds 21–30 ignore it). **#733 (app, in 1.0.5):** stores the refreshed token, a header-less launch 401 no longer clears the session, token-cache race fix, new anonymous `auth_diag` kinds (`token_refreshed`, `cleared_age_*`, `launch_*`). Builds ≤ 1.0.4 keep their 7-day tokens until the user updates and signs in once.
- ✅ **Keyboard covered the daily-moment caption:** **#734** swaps `KeyboardAvoidingView` + plain `ScrollView` for the existing `KeyboardAwareScrollView` on 12 screens (composer, Pee, Poo, Weight, Wellness log, six reminder sheets, Nearby walks); caption box capped at 160 pt. **Not verified on a device before merge.**
- ✅ **No native change** vs build 30 (`package.json`, lockfile, `eas.json`, `patches/`, `app.json` plugins/infoPlist identical); only `expo.version` 1.0.4 → 1.0.5. App Store privacy declaration: no change.
- ⏳ Owner: run the build commands (`release-1.0.5.md` §4), do the TestFlight pass (§5 — first real-device test of #733 and #734), then Submit for Review manually.

---

## 2026-10-23 — Discover is a sneak peek again — NOT device-tested

- ✅ **Discover tiles are unredacted for locked viewers:** `GET /api/discover` returns other owners' tile thumbnail (`image_url` / `video_thumbnail_url`) and `caption` as before, tagged `locked: true` until the viewer has posted today (`applyDailyMomentsLock(..., { redact: false })`); `video_url` is never selected. `GET /api/posts` redaction and the welcome-back friends' photos are unchanged. Pet profile + `posts/history` stay server-gated, so a tile can't open more than its thumbnail.
- ✅ **Locked tap → prompt:** tapping a locked Discover tile shows "Post your daily moment to see this" (EN + ES voseo) with a primary button into the Feed composer (the `compose` param the weekly digest uses) and a dismiss; unlocked taps open the pet profile as before. Creating or deleting a post invalidates `["discover"]` so tiles update without leaving the screen. JS/server only, no migration.

---

## 🤖 UNATTENDED RUN 2026-10-22 — daily-post lock follow-up, weekly share card, navigation layers — merged to `main`, NOT device-tested

- ✅ **Locked feed redacts other owners' media server-side:** `GET /api/posts` (Discover was later made a sneak peek, see the 2026-10-23 entry below) returns other owners' `image_url` / `video_url` / `video_thumbnail_url` / `caption` as `null` + `locked: true` until the viewer has posted today (shared `utils/dailyMomentsGate.js`); own posts and the unlocked case are untouched. JS/server only, no migration.
- ✅ **Weekly summary share card:** pick one of the week's real daily moments as the card image (best → most recent → profile photo → a prompt to post a moment; never the paw), "Share {{name}}'s week" label fixed, positive-only stat line (no "0 walks · 0/7"), EN+ES; `GET /api/pets/[id]/weekly-digest` gains `week_moments`. Guard test: no single-arg `t()` call may target a string with `{{vars}}`. No migration.
- ✅ **Navigation layers:** Notifications and Messages are cards on the one back stack, not root modals (back arrow in the header); `navigation-layers.test.js` now fails if any modal/sheet screen navigates onward. JS-only.

---

## 🌙 NIGHT RUNS 2026-10-16 / 2026-10-17 (post build 26) — merged to `main`, NOT in any build yet

Two autonomous runs after build 26 went to review. Nothing was built or submitted; mobile changes ship with the next build (all JS-only, OTA-safe). Full log: [`qa/runs/2026-10-17_fix-log.md`](qa/runs/2026-10-17_fix-log.md) (and `2026-10-16_fix-log.md`).

- **Run 1 (#642–#649):** tab-bar/safe-area overlap, Log out, privacy (no owner names from e-mail), ES copy, empty-state paw art.
- **Run 2 (#650–#664):** tab bar stays light glass (#650); only-available pet handles (#651); friend picker for "Streak with a friend" + server-side friend authorization (#652);
  **migration 0133 username backfill — ✅ APPLIED + VERIFIED by the owner (2026-10-20)** (#653, [`db-migration-runbook-0133-username-backfill.md`](db-migration-runbook-0133-username-backfill.md));
  app-wide consistency audit (#654 → [`qa/consistency-audit-2026-10-17.md`](qa/consistency-audit-2026-10-17.md)) and its low-risk fixes (#655 copy/i18n, #656 dates, #657 popups, #658 colour tokens, #660 a11y/dead code);
  flow-correctness passes with a matrix ([`qa/flow-matrix-2026-10-17.md`](qa/flow-matrix-2026-10-17.md)): reminders/notifications (#659), owner↔owner (#661), owner↔business (#662); general sweep (#663).
- **Needs a human before launch-critical go-live:** (0133 is applied) the payment-webhook settlement migration **`0135`** (F3-01/02/03 — written, PR open, awaiting your hand-apply; [`db-migration-runbook-0135-payment-settlement.md`](db-migration-runbook-0135-payment-settlement.md)) **before** enabling real MercadoPago charges; the notification-type widening (F2 SQL-1); see the fix log "needs human" and [`db-migration-inventory.md`](db-migration-inventory.md) for everything still unapplied in the database.

---

## 📦 BUILD 26 (v1.0.2) — SUBMITTED FOR APP STORE REVIEW (2026-10-14) — newest status; everything below this block is history

**Build 26** (v1.0.2, commit `49a834b1`, includes **#617–#629**, all merged) is **in App Store review**. Build 25 exists in EAS but is
stale and was never distributed; build 24 (v1.0.1) is what was on TestFlight before. Details, build history and the device
checklist: [`release-build-26.md`](release-build-26.md); on-device queue: [`test-backlog.md`](test-backlog.md) → "To test — build 26".

- ✅ **Migrations 0131 + 0132 applied and verified** on production; **`NOTIF_V2_ENABLED=true`** on Railway (notifications v2 is live —
  [`notifications-v2-design.md`](notifications-v2-design.md)). The mobile toggles / quiet hours / time-zone sync arrive with build 26.
- ✅ **App Privacy published** (App Store Connect): Product Interaction, Performance Data, Other Diagnostic Data — Analytics, not linked,
  not tracking; **Crash Data not declared** ([`privacy/telemetry.md`](privacy/telemetry.md) §6, [`app-store-privacy-data-map.md`](app-store-privacy-data-map.md)).
  Privacy policy: `https://www.pawpi.info/privacy` (EN + ES).
- ✅ **Branch cleanup done** — six stale branches deleted. **Kept for a later decision:** `claude/night-3b-notif-v2-schedule` and
  `claude/night-3c-notif-v2-owner-events`.
- ✅ **Scheduled jobs: Railway cron DONE and verified (2026-10-16).** All 5 services ran on schedule for 24 h (hourly jobs every hour, no gaps; all `status=200 OK`). GitHub cron fired the hourly jobs ~6×/day, so
  #632 moved the five jobs to Railway cron services (`scripts/cron/cron-trigger.mjs`); `cron-jobs.yml` is now a manual fallback (no
  `schedule:`). Runbook [`ops/railway-cron.md`](ops/railway-cron.md); `test-backlog.md` → ACTION 5. No migration.
- ✅ **Subscription charger is overlap-safe.** `POST /api/payments/subscriptions/run` takes a per-subscription `pg_try_advisory_xact_lock`
  and re-checks `next_charge_at` under it, so two simultaneous runs (e.g. the manual fallback during the 06:00 Railway run) create exactly one
  order and one charge attempt. No migration. Runbook [`ops/railway-cron.md`](ops/railway-cron.md); test `subscription-run-overlap.integration.test.ts`.
- ⏳ **Next:** Apple's review result → release; run the build-26 device checklist; resume Grafana client alert rules a few days after build 26
  has live data; APNs `.p8` key still gates business pushes.

---

## 🚀 LAUNCH + v1.0.1 RELEASE LINE (2026-10-03) — history; superseded by the build 26 block above

**PawPi is LIVE in the App Store.** v1.0.0 (build 21) was accepted 2026-09-27 (built + submitted 2026-09-22;
the 2.5.4 `UIBackgroundModes=audio` rejection was fixed by #566 — dropped the unused `expo-audio` plugin and
stopped shipping a stale committed `ios/`). Production = Railway web/API at `https://www.pawpi.info`, Supabase DB.

**v1.0.1 (build 24) is being cut now.** Marketing version bumped by #579; EAS `appVersionSource: remote` +
`autoIncrement` owns the build number. Status: ⏳ pending the owner's on-device pass
(checklist: [`test-backlog.md`](test-backlog.md) → "To test — build 24") and then **Submit for Review**
in App Store Connect (manual step).

**No new migrations in the #567–#592 run** — nothing under `supabase/` changed since #566; the latest migration
is still **0130** (0128/0129 remain file-only, hand-apply tracked in `test-backlog.md` ACTION 1).

### CI minutes (2026-10-20) — ✅ done (#693, #694, #696, #697, #703), repo may go private 2026-10-31 (2,000 free Actions min/month)
**New CI behavior** (all merged, details in `TESTING_AND_CI_PLAN.md` B4-B6):
- **Path-aware CI** (`scripts/ci/changed-areas.mjs`): the three required checks (`mobile (jest)`, `web (vitest)`, `web (integration / real Postgres)`) keep their names and always end green, but on a PR each job only does real work when the PR touches what it tests (docs-only PR: all three green in ~10-20 s, no installs). **Pushes to `main` skip all three jobs only when every changed file is non-code**; any code, workflow, lockfile, migration, observability/scripts change or unmapped path runs everything there. Anything unsure (API error, force push, > 3000 files) runs everything.
- **Honesty-test rule for new top-level code folders:** `anything/apps/web/src/observability/ciAreas.test.js` fails CI if a tracked file is not covered by a rule in `scripts/ci/changed-areas.mjs`, if a top-level or `anything/apps/*` folder has no rule, or if a web/mobile test reads a repo file outside its own app that the filter would not trigger on. **Adding a new code folder = add a rule there** (or an explicit `ignore`), otherwise CI tells you.
- **Cancel superseded runs:** `ci.yml` + `gitleaks.yml` cancel a PR's older in-progress run when the PR gets a newer push; runs on push to `main` have a unique group and are never cancelled.
- **Integration job ~35 % faster:** the throwaway Postgres keeps its data dir on `/dev/shm` (Linux, >= 1 GB free), else the OS temp dir (`PAWPI_INTEGRATION_TMPFS=0` forces that).
- **The integration check is now truthful:** `vitest run --config vitest.integration.config.ts` used to exit 0 even when tests failed (the `globalSetup` teardown ended the process with 0), so the required check could never go red and 8 tests (stale since #645) had been failing unnoticed. The teardown now restores `process.exitCode` (proven red on a throwaway failing test), the 8 tests were updated, and any future integration failure turns the check red on PRs and on `main`.

**Minutes estimate (30 days of real runs replayed through the real mapping, steady-state costs):** before ~2,850 min/month (4,549 measured in the 30 days to 10-19, incl. ~1,234 from the old broken mobile jest job and ~347 from the retired GitHub cron); CI 2,666 -> 1,968 after path filters (PRs 1,438 -> 872, main pushes 1,228 -> 1,096) -> ~1,590 after cancel-superseded (~-50) and the integration speed-up (~-330); with gitleaks + autofix (~180) **≈ 1,770 min/month (~11 % under the 2,000 free minutes)**. A night-run-heavy month (2x volume) would not fit. Main pushes are deliberately **not** narrowed per area (would save ~370 more): revisit after a week of real billing numbers.

**Owner check:** Augusto will look at the billing page (Settings > Billing > Usage) around **Oct 27** and decide on making the repo private for **Oct 31** (see `test-backlog.md` ACTION 7).

### ✅ #567–#592 — done (all merged, CI-green)
Status mirror (✅ merged). Grouped by theme; PR numbers link to `augustotraversa98-dot/PawPi`.

**Social login + auth hardening**
- ✅ **#567 — Sign in with Apple (native) + Google (system browser), end-to-end.** Apple via
  `expo-apple-authentication` → the `apple-native` credentials provider (JWKS + nonce verification); Google via
  `WebBrowser.openAuthSessionAsync` → `/api/auth/mobile-start` → `/api/auth/mobile-return` → `pawpi://` deep link.
  See `ARCHITECTURE.md` → "Social login / auth".
- ✅ (no PR #) `f3bc1a37` — allow Google's authorize endpoint in the form-action CSP.
- ✅ **#580 — app base URL → `https://www.pawpi.info`** (was the Railway host).
- ✅ **#582 — auth DB adapter wired into the handler**, so Google OAuth creates a real integer-id `auth_users` row
  instead of minting a random-UUID `sub`.
- ✅ **#585 — fail-closed 401 for ghost sessions** (non-integer `sub`) instead of a 500 (22P02 aborting the
  request tx).
- ✅ **#583 / #586 / #587 — sign-in recovery UX:** never strand a user after a failed sign-in ("Start over" +
  back, #583); onboarding steps no longer clip behind the keyboard/footer (#586); "Use a different account"
  log-out escape inside onboarding (#587).
- ✅ **#578 — top-level error boundary** for render/effect crashes.
- ✅ **#577 — onboarding Next-gate hardening** against the async-wedge risk (not a gender-casing bug).

**Onboarding + first-run polish**
- ✅ **#588 — onboarding UX pass:** keyboard-safe footer, compact type scale, breed ranking, **kg default**.
- ✅ **#568** crash-proof keyboard on the name step + a working step-0 back arrow · **#573** pet-handle
  uniqueness validated at step 2, not only on review · **#570** keyboard-listener crash on app-data
  reset/logout · **#571** Profile tab's nav stack resets when switching away (not just on re-tap) ·
  **#572** es-AR translation leaks closed (Dog Profile, Settings tracking card, Feed daily-moment tag) ·
  **#574** web `services/discover` "All" scoped to providers with a real capability.
- ✅ **#569 / #575** simulator QA sweeps C + D (docs only) · **#576** autofix: HighLatencyP95 investigation.

**App-wide UX audit + consistency (the build-24 content)**
- ✅ **#589 — app-wide UX audit:** restored ~126 dropped `trackers.*` i18n keys EN+ES (Track + Reminders →
  Upcoming were showing raw keys) with a **guard test** so they can't silently drop again; keyboard-aware
  scroll across ~45 screens; metric / 24h locale defaults.
- ✅ **#590 — weight-unit consistency:** the wellness-check now saves `"lbs"`; legacy `"lb"` is **read-aliased**
  to `"lbs"` across the endpoints + mobile. **No rows migrated** (read-side alias only).
- ✅ **#591 — uniform 24-hour time everywhere** (`hourCycle: "h23"`, so midnight renders `00:00`, no AM/PM).
- ✅ **#592 — Place review sheet is keyboard-aware** (`KeyboardAwareScrollView`) so the comment field clears
  the keyboard.
- ✅ **#579 — version bumped to 1.0.1.**

### ⏭ Deferred (noted, not scheduled)
- **Pinned-footer redesign for long routine forms** — a design change rather than a bug fix, so it was left
  out of v1.0.1. Revisit after the build-24 device pass.
- Older open items (go-live env keys, A-35 hardcoded-string remainder, etc.) are unchanged — see the open list
  in `PawPi_instructions.md`.

---

## 📈 OBSERVABILITY NIGHT RUN (2026-10-04) — Grafana becomes the main instrument (A–D merged, E in review)

Plan + contract: [`docs/observability/night-run/`](observability/night-run/README.md); runbook: [`docs/observability/OPERATIONS.md`](observability/OPERATIONS.md).
Everything below is **code merged to `main`**; nothing is live in Grafana until the human actions list is done (no Grafana/Loki credentials existed in the run).

- ✅ **#599 — Step A: server metrics for every feature area** (`pawpi_http_*`, DB, process, business events, `GET /api/health/deep`).
- ✅ **#600 — Step B: anonymous client telemetry** — ingest endpoints + mobile SDK (allowlist registry, Settings opt-out "Help improve PawPi", kill switch). Reaches users from **app build 26** (build 25 was never distributed).
- ✅ **#601 — Step C: 11 Grafana dashboards as code** + `apply-grafana.mjs` (dry-run by default, `pawpi-` uids only, never deletes).
- ✅ **#602 — Step D: 15 alert rules (all created PAUSED), P1/P2 routing, 5 synthetic checks, richer autofix relay payload.**
- 🟡 **Step E (this PR): structured redacted access logs -> Loki `job="pawpi-web"`, deploy annotation per start, CI coverage guard** ("a new route/screen/funnel step/dashboard/alert without coverage fails the build"), `OPERATIONS.md` rewritten, monthly review checklist.

**Human actions owed (not automatable; tracked as ACTION 4 in [`test-backlog.md`](test-backlog.md)):**
1. ✅ **App build 26** (client telemetry) is submitted for review; **App Store Connect → App Privacy** is published per [`docs/privacy/telemetry.md`](privacy/telemetry.md) §6 and [`docs/app-store-privacy-data-map.md`](app-store-privacy-data-map.md) (#608) matches it. Live privacy-policy paragraph: see the telemetry checklist (§7).
2. Add the Railway env vars: `GRAFANA_LOKI_URL` / `GRAFANA_LOKI_USER` / `GRAFANA_LOKI_TOKEN`, `GRAFANA_URL`, `GRAFANA_ANNOTATION_TOKEN` (annotations-write service account).
3. Run `scripts/observability/apply-grafana.mjs` — dry run, then `--apply`, for dashboards, alerts + policies (set `ALERT_DIGEST_EMAIL`) and synthetics (`GRAFANA_SM_*`).
4. **Un-pause alerts after data flows** (server rules first; client rules only after build 26 has live data; P2 only after the digest exists) — order in `OPERATIONS.md` section 8.
5. Optional: Grafana mobile push for P1 on `Augusto`; a scripted sign-in journey with a clearly labelled test account.
- Found, not fixed (product bugs, see PROGRESS.md): unknown `/api/...` paths return 200 + HTML (SPA catch-all) instead of a JSON 404.

---

## 📍 CURRENT STATE (2026-08-01) — history; superseded by the 2026-10-03 block above

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

### 🐾 WAVE 2 — Pet Owner engagement: Household & Retention (E11–E15) — ✅ COMPLETE (built 2026-08-14; migrations 0100–0106 ✅ APPLIED + VERIFIED on Supabase 2026-08-14 — all verify_010x.sql PASS)

Design of record: [`docs/pet-owner-engagement.md`](pet-owner-engagement.md) → "WAVE 2" section (full unit
specs + paste-ready grey-box Claude Code prompts). Chosen with Tats. Run each unit as its own CC session, in
order; prepend the Wave 2 orientation preamble. Live DB at 0099 — use the next migration number. Status
mirror (☐ queued · 🔨 building · ✅ merged):

- ✅ **E11 — "Rex's Week" weekly digest** — [#391](https://github.com/augustotraversa98-dot/PawPi/pull/391)
  MERGED 2026-08-14. In-app weekly recap (real owner-tz-week stats; honest rich/quiet/empty state, never a
  fake number) + `CRON_SECRET`-gated Sunday-evening sender (push via `weekly_digest` notif + optional email;
  claim-then-send idempotency) + server-side channel prefs + E4 share. **Migration 0100** (weekly_digest_prefs
  / weekly_digest_state / app_weekly_digest_due DEFINER) — **awaits hand-apply**; degrades clean while absent.
  EN+ES. Gates: vitest 1942 (+18), integration 948 (+16), jest 1816.
- ✅ **E12 — Comeback / re-engagement loop** — [#392](https://github.com/augustotraversa98-dot/PawPi/pull/392)
  MERGED 2026-08-14. Server-side "lapsed" (no ring activity N owner-tz days, default 7) → warm win-back on a
  REAL hook (upcoming gotcha/birthday · a friend's real moment · the pet's own memory), frequency-capped,
  one-tap opt-out; `CRON_SECRET` sender + welcome-back screen + one-tap streak repair (grace window). No
  guilt. **Migration 0101** (reengagement_state own-row RLS; app_reengagement_due + app_winback_repair_streak
  DEFINER) — **awaits hand-apply**; degrades clean. EN+ES. Gates: vitest 1954, integration 958, jest green.
- ✅ **E13 — Shared custody / caregivers (tiered)** — 3 PRs MERGED 2026-08-14: shared ring
  [#393](https://github.com/augustotraversa98-dot/PawPi/pull/393) · day-card
  [#394](https://github.com/augustotraversa98-dot/PawPi/pull/394) · household leaderboard
  [#395](https://github.com/augustotraversa98-dot/PawPi/pull/395). **RECONCILED with the EXISTING
  `pet_caregivers` (ticket 2.47/migration 0049)** — it already ships the membership + invite/accept/revoke
  + owner-OR-caregiver RLS on pets/routines/medical/health. E13 extended it to the engagement layer: shared
  ring/streak (0102, caregiver policies on pet_care_days/pet_streaks + `app_pet_ring_segments` by pet_id),
  per-author daily moment + day-card carousel (0103), household leaderboard (0104). Role map: owner=Owner/Admin,
  0049 family=Caregiver, 0049 caregiver=Viewer. **Migrations 0102–0104 await hand-apply.** Solo owner a strict
  no-op. EN+ES. (original spec below — superseded by the reconciliation)
- ☐ ~~E13 — Shared custody / caregivers (tiered).~~ Owner/Admin · Caregiver · Viewer via new `pet_caregivers`
  (RLS = owner OR accepted caregiver, no leakage). Multi-caregiver daily moment = per-pet-per-day, 1/caregiver,
  one bumping "day card" carousel with per-author slides. Shared per-pet ring/streak. Private household
  leaderboard (celebrate, never shame a co-parent). **Riskiest unit — 3 PRs in one chat.**
- ✅ **E14 — Multi-pet household** — [#396](https://github.com/augustotraversa98-dot/PawPi/pull/396)
  MERGED 2026-08-14. Household home view (owned + co-cared dogs, per-dog ring/streak, tap-to-switch via
  the existing persisted selectedPetStore) + opt-in family streak. **Migration 0105** (household_streaks
  own-row RLS + `app_advance_household_streak` DEFINER — advances only when EVERY owned dog closed;
  forgiveness-aware) wired into care-ring close — **awaits hand-apply**; degrades clean; single-dog
  account a strict no-op. Family-streak metric decided: "every dog's ring closed". EN+ES. Gates: vitest
  1958, integration 983.
- ✅ **E15 — Life-stage ring goals** — [#397](https://github.com/augustotraversa98-dot/PawPi/pull/397)
  MERGED 2026-08-14. Ring copy/suggested-actions adapt to puppy/adult/senior (3 segments UNCHANGED),
  size-scaled senior threshold, owner override. **Migration 0106** (`pets.life_stage_override`; NULL =
  auto-detect) — **awaits hand-apply**; degrades clean; behavioral not diagnostic. EN+ES. Gates: vitest
  1970, integration 989, jest 1847. **Wave 2 (E11–E15) COMPLETE.**

### 🩺 VET RECORD CLEANUP (VR2) — Health → Vet Record: 13 sections → 3 groups + EN/ES — ✅ BUILT 2026-08-18 (own PR; mobile-only, no migration)

Design of record: [`docs/vet-record-cleanup-ticket.md`](vet-record-cleanup-ticket.md) (VR2). The screen's
13 hardcoded-English collapsible sections consolidate into **three groups**:
**1. Medical profile** (unchanged, `EditMedicalProfileModal`) · **2. Next visit** — merges "Upcoming
Appointments" + "Prepare for Next Visit" into one card: the soonest scheduled appointment from
`/api/vet-appointments` (SAME source as Health → Today `VetAppointmentCountdownCard`, one source of
truth) + the **Create Vet Summary** action (`VetSummaryDashboard`, reused) + a readiness hint ·
**3. Medical history** — one parent section with a compact scrollable **chip sub-nav** (like the Quick
Check area stepper): Vaccines · Visits & procedures · Medications · Labs · Conditions & allergies
(merged) · Notes · Documents · Photos, each reusing its existing list/query/modal with a count badge +
empty state; defaults to the first non-empty tab. Every string localized (new `health.vetRecord.*`
namespace, EN + ES; the old `health.vetRecord` string became the `.title` key). No new record types or
backend. Tests rewritten (`HealthVetRecord.vaccines.test.jsx`): 3 groups render EN **and** ES, sub-nav
switches lists, add/delete flows + Add-Record no-dead-end behavior. **Full mobile jest gate green
(251 suites / 1937 tests).**

### 🩺 TRACK CONSOLIDATION — Health → Track: Everyday vs. Health records — ✅ BUILT 2026-08-17 · 🔁 REVISED 2026-08-18 (on-device feedback; 1 PR #433; mobile-only, no migration)

Design of record: [`docs/track-consolidation-ticket.md`](track-consolidation-ticket.md) (see the
"Revision — 2026-08-18" section). Collapses the 14-tile, English-only Track grid into two owner-shaped
sections; the 2026-08-18 device test trimmed Health records to **7 tiles, zero "Soon"**. Status
mirror (☐ queued · 🔨 building · ✅ merged):
- ✅ **Two-section grid (final)** — **Everyday** (Food & Water · Bathroom & Digestion · Walk & Activity ·
  Weight · Quick Check) + **Health records** (Medications & Care · Photo Check). Merged the Food+Water and
  Pee/Poo/Vomit duplicates (Bathroom & Digestion opens a chooser sheet over the three already-persisting
  modals); folded Symptoms & Behavior into Quick Check.
- 🔁 **Revision — removed three Health-records tiles** (on-device feedback): **Vaccines** folded into
  Medications & Care (same modal; its desc now names vaccines & preventives); **Vet Visits** removed —
  vet-authored medical history belongs in the read-only Vet Record, not an owner quick-log (dropped the
  `AddVetNoteModal` wiring from Track); **Vital Signs** removed entirely (not just "Soon").
- ✅ **No "Soon" tiles remain** — every tile opens a real logging surface. Care Ring integrity invariant
  (`comingSoonTrackersHaveNoAction`) now holds vacuously and still guards future additions. The reported
  "tapping Vital Signs filled a ring segment" could NOT be reproduced on this branch (the structural guard
  returns before any dispatch); removing the tile closes it for good — pre-guard build / mis-attribution.
- 🔁 **Quick Check flow fix** — `GeneralCheckModal`: the per-area status choice is now the obvious first
  action (prominent prompt + a coral "Choose an option to continue" hint while Next is disabled, which
  disappears on select), and the whole modal is localized EN+ES (`health.generalCheck.*`) — it was hardcoded English.
- ✅ **Full EN+ES localization** of the Track screen + Quick Check modal; removed now-dead
  `vaccines/vetVisits/vitalSigns` `Label/Desc` keys from both dictionaries (parity: 1063 = 1063 keys).
- ✅ **Persistence audit (unchanged from build)** — `GeneralCheckModal` POSTs to `/api/health/general-checks`
  via `useLogGeneralCheck`; `useLogFood` invalidates `["care-ring", petId]`.
- ⏳ **Known follow-up (out of scope):** Photo Check from Track still needs the upload flow
  (`PhotoCheckCaptureModal` + `useUpload`) to persist a hosted URL; `PhotoCheckModal` only yields a local
  `file://` URI, so it is deliberately NOT POSTed (no bad-data record). GeneralCheck dashboard still reads mock seed data.
- Gates: mobile jest **1920** (default) + **4** (tz-negative) green. HealthTrack.test.jsx rewritten to the
  7-tile set (no Vaccines/Vet Visits/Vital Signs, no "Soon" badge, invariant = zero coming-soon); new
  GeneralCheckModal.test.jsx (Next disabled→enabled + advance, full-flow save-once, EN+ES render). ⚠️ owed: on-device pass.

### 🔧 WAVE 2 FIX-PACK (BX1·BX2·FF1–FF3) — ✅ COMPLETE 2026-08-14

Design of record: [`docs/wave2-finish-fixpack.md`](wave2-finish-fixpack.md). Closes the 3 deferred Wave 2
niceties (FF1–FF3) + 2 on-device bugs (BX1·BX2). Status mirror (☐ queued · 🔨 building · ✅ merged):
- ✅ **BX2 — Walker QR "Scan pickup" close (X) not tappable** — [#398](https://github.com/augustotraversa98-dot/PawPi/pull/398)
  MERGED 2026-08-14. `PickupScannerModal` header pinned above the native camera (opaque bg + zIndex/elevation),
  row `pointerEvents="box-none"`, close button hitSlop. NO migration. **⚠️ needs on-device tap confirmation.**
  Gates: jest 1847→1848.
- ✅ **BX1 — Business account: no profile / log out on mobile** — [#399](https://github.com/augustotraversa98-dot/PawPi/pull/399)
  MERGED 2026-08-14. Always-visible Account section on the business Profile tab: identity + Settings +
  "Switch to Pet app" (dual account) + working Log out (mirrors OwnerMenu). NO migration. Gates: jest 1848→1852.
- ✅ **FF1 — Per-user language for digest / win-back emails** — [#400](https://github.com/augustotraversa98-dot/PawPi/pull/400)
  MERGED 2026-08-14. `user_profiles.preferred_locale` (0107) + both DEFINER enumerators return it; senders
  render in the recipient's locale (es-AR fallback); `PUT /api/user-profile/locale` + mobile sync on
  login/Settings. **Migration 0107 ✅ APPLIED + VERIFIED 2026-08-14.** Gates: vitest 1970→1976, integration 989→990.
- ✅ **FF2 — Caregiver in-app logging buttons (walks / health)** — [#401](https://github.com/augustotraversa98-dot/PawPi/pull/401)
  MERGED 2026-08-14. `resolvePetLogOwner` owner-OR-family write gate on walk/food/general-check routes
  (family writes anchor to the pet's owner, Viewer→403); mobile "Log a walk" on active family shared rows.
  NO migration (0049 RLS unchanged). Gates: vitest 1976→1982, integration 990→995, jest 1852→1854.
- ✅ **FF3 — Day-card into the main feed** — [#402](https://github.com/augustotraversa98-dot/PawPi/pull/402)
  MERGED 2026-08-14. `groupFeedDayCards` collapses a pet's same-day daily moments into the multi-caregiver
  DayCard (reuses component + endpoint shape; built from feed data, no per-group call); non-moment posts
  unchanged. NO migration. Gates: jest 1854→1863.

**Fix-pack final gates:** mobile jest **1863**, web vitest **1982**, web integration **995**. **Migration
0107 (FF1) ✅ APPLIED + VERIFIED on Supabase 2026-08-14.** **BX2 still needs an on-device tap confirmation.**

> **Update (2026-08-15, BX4 — business notification settings, mode-aware + functional):** **2 PRs
> MERGED CI-green** ([#404](https://github.com/augustotraversa98-dot/PawPi/pull/404) server prefs +
> gating · [#405](https://github.com/augustotraversa98-dot/PawPi/pull/405) mode-aware business
> Settings UI). Audited **every** `app_notify`/`safeNotify` site: the **only** notification that
> reaches a **business** recipient today is a **walk request** (`walk_request_targeted`/`_broadcast`)
> landing on a walker's active staff — regular provider bookings notify the **owner**, and chat /
> reviews / payouts fire **no** notification — so exactly **one** honest category ships (**"Walk &
> job requests"**); the rest are omitted (no fake toggle). New `notification_prefs` own-row table
> (**0108** ✅ APPLIED + VERIFIED on Supabase 2026-08-15) gates delivery inside `app_notify()` (fail-open); `AppSettings`
> gains `mode="business"` (server-backed toggle; hides the pet-owner categories + Walk-tracking; pet
> mode unchanged). E5 pet-owner client-side prefs left as-is (logged split). EN+ES. Gates: vitest
> 1982→**1989**, integration 995→**1000**, mobile jest 1863→**1874**. **⚠️ business Settings visual
> needs on-device confirmation.**

> **Update (2026-08-15, BN2 PR1 — remote-push FOUNDATION):** **1 PR** (feat/bn2-pr1-push-foundation)
> — the first server→phone push layer PawPi has ever had. Before this, the app only scheduled **local**
> reminders (`expo-notifications`) and server events wrote the in-app bell (`app_notify`); nothing rang
> a phone. Ships: (a) **migration 0109** `device_push_tokens` (own-row FORCE RLS) + three DEFINER
> readers (`app_recipient_push_tokens` / `app_notification_pref_enabled` / `app_recipient_locale`) so the
> web send-hook — which runs as the *actor*, not the recipient — can resolve a recipient's tokens/pref/
> locale across the owner boundary; (b) **`POST/DELETE /api/push-tokens`**; (c) a web **`sendPush()`**
> layer (`expo-server-sdk`) wired as a **post-`app_notify` hook** in `safeNotify` — after a bell row is
> created it consults the channel catalog + the recipient's `notification_prefs` and pushes per the BN2
> rule (IN_APP_ONLY→never · PUSH→unless disabled · OPTIONAL_PUSH→only if enabled); (d) mobile
> `registerPushTokenAsync` (reuses the startup permission — no cold prompt; no-ops on simulators),
> registered after auth in `_layout`. **Degrades clean end-to-end**: no tokens / no creds / unmigrated →
> log-and-no-op, never a crash or a failed action. **iOS delivery stays DARK until APNs/Expo creds are
> configured** (same Apple-account dependency as widget PR #187) — the exact EAS/Apple steps are in
> `docs/night-run-log.md`. PR1 catalog is stubbed with today's types only (`walk_request_*` = PUSH); PR2
> adds the full business catalog + emission. Gates: vitest 1989→**2010** (+21), integration 1000→**1006**
> (+6), mobile jest 1874→**1879** (+5). **0109 ✅ APPLIED + VERIFIED on Supabase 2026-08-15.** **NEEDS ON-DEVICE
> CONFIRMATION** (token registration + a real push once APNs is live).

> **Update (2026-08-15, BN2 PR2 — business notification EMISSION + catalog):** **1 PR**
> (feat/bn2-pr2-business-emission). PawPi now actually emits the business notifications owners care
> about, to the provider **OWNER + relevant active STAFF** (one call: `app_provider_active_staff_ids`,
> 0093 — the owner is enrolled as active staff). Events wired: **new booking** (`biz_booking`, the
> book route) · **client cancel/reschedule** (`biz_booking_change`, vet-appointments PUT/DELETE) ·
> **new product order** (`biz_order`, payments/checkout `kind=product` + shop-checkout) · **new client
> chat message** (`biz_message`, threads/[id]/messages — only client→business; the staff→client
> direction stays out of scope) · **new adoption application** (`biz_adoption_application`). Engagement
> stays **IN-APP-ONLY** (a bell, never a push): **paws/comments** on the business's posts
> (`biz_post_engagement`) + **new follower** (`biz_follow`, owner-only). Shared channel **catalog**
> added web (`notificationCategories.js`) + mobile (`businessNotificationPrefs.js`) with the PUSH
> channel class per category (PUSH default-on · OPTIONAL_PUSH review/payout default-off · IN_APP_ONLY).
> The BN2 model: **every business notification always writes the in-app bell**; the channel class +
> `notification_prefs` govern whether it also rings the phone (the PR1 send-hook). New helper
> `notifyProviderTeam` (never double-notifies the actor, never leaks across businesses, degrades clean).
> Bilingual EN+ES on the push copy + the in-app bell (`bizNotifBell.*`). **Migration 0110** widens
> `notifications_type_check` for the `biz_*` types (**awaits hand-apply**). Gates: vitest 2010→**2022**
> (+12), integration 1006→**1011** (+5, real-router emission end-to-end: owner+staff recipients, actor
> = client, no cross-business leak, owner-only follow, idempotent no-re-notify), mobile jest 1879→**1882**
> (+3). PR3 wires the grouped Settings UI. **0110 ✅ APPLIED + VERIFIED on Supabase 2026-08-15.**

> **Update (2026-08-15, BN2 PR3 — channel-aware business Settings UI):** **1 PR**
> (feat/bn2-pr3-business-settings). **Mobile-only, no migration.** The business-mode notification
> settings (`AppSettings` `mode="business"`) now render the real BN2 categories **grouped by channel
> class**, consuming the PR2 catalog (`businessNotificationPrefs.js`): **"Notify my phone"** (the PUSH
> toggles — bookings / changes / orders / messages / adoption / walk requests, default ON) · **"Optional
> push"** (reviews / payouts, default OFF, opt-in) · an **"In-app only"** info group (post activity /
> followers — shown with a bell tag, **never a toggle**, with a note that they stay in the app). Toggles
> write `notification_prefs` via the existing GET/PUT (BX4); the PR1 send-hook respects them. **Pet-owner
> Settings unchanged** (mode gate untouched — pet mode still shows the E5 categories + Walk-tracking).
> EN+ES (group headers + all category labels/hints). Gates: mobile jest 1882→**1883** (+1; web/integration
> unchanged — no web change). **BN2 COMPLETE** (3/3 PRs). **NEEDS ON-DEVICE CONFIRMATION** of the grouped
> screen + a real push once APNs is configured (steps in `docs/night-run-log.md`).

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

## 🛡️ MOD2 — Rich, scannable moderation rows + discoverability — ✅ SHIPPED (2/2 PRs; 1 human action owed)
> On-device review of MOD1 surfaced three gaps: rows too thin (no content/author/reporter/exact
> time), console undiscoverable (no nav link), and a fresh admin dumped into provider onboarding.
> Ticket: [`docs/moderation-console-v2-ticket.md`](moderation-console-v2-ticket.md).
> - ✅ **PR1 — Enriched triage rows** (#425, migration **0116 APPLIED + VERIFIED on prod**, 5/5).
>   `app_admin_list_reports_v2(p_status)` — DEFINER + `app_is_admin()`-gated reader resolving each
>   report to a triage card: content preview {text+image}, reported author {id, handle}, reporter
>   handle + `reporters_count` (distinct reporters on the target), reason + note, and both the
>   report's and the target's exact timestamps. Polymorphic over all 15 reportable types with a
>   clean NULL fallback. UI rebuilt as a scannable card (preview + thumbnail, absolute + relative
>   time), **EN + ES** via a self-contained label map (extranet has no i18n runtime). vitest
>   2065→2067 · integration 1043.
> - ✅ **PR2 — Discoverability + admin routing** (#426, **no migration**). `GET /api/admin/
>   moderation-summary` capability probe → `{ is_admin, open_count }`; provider sidebar gains an
>   admin-only **Moderation** nav link + open-count badge (hidden for non-admins); the
>   no-provider admin gets a **prominent card** offering the console instead of being forced into
>   "pick a type of business" (create form stays available; normal users unchanged). vitest
>   2067→2075.
> - ⚠️ **OWED (human, carried from MOD1):** still no prod admin account — the link + card stay
>   hidden until `augustotraversa98@gmail.com` / support@pawpi.info is granted admin (`is_admin=true`
>   or `role='admin'`, per 0114). Everything is correctly gated until then.

## 🛡️ MOD1 — Report routing + moderation console (Guideline 1.2 "act within 24h") — ✅ SHIPPED (1 human action owed)
> The 1.2 *safeguards* (T1–T9 below) shipped, but reports went into a drawer nobody could open: prod had
> **zero admins**, nothing alerted anyone, and there was no admin UI. MOD1 closed that in 2 PRs.
> - ✅ **PR1 — Admin identity + alerting** (#423, migration **0114 APPLIED + VERIFIED on prod**).
>   `user_profiles.is_admin` + `app_is_admin()` widened (`role='admin' OR is_admin=true`) +
>   `app_admin_recipients()` DEFINER reader; `POST /api/reports` now bells + rate-limited-emails every
>   admin on a new report (best-effort, savepoint-safe, degrades clean).
> - ✅ **PR2 — Moderation console** (#424, migration **0115 APPLIED + VERIFIED on prod**).
>   `/admin/moderation` gated by the admin-only API (non-admin 403 → no data); lists
>   `GET /api/admin/reports`; Remove/Dismiss/Ban → the action route. 0115 closed the one unhandled
>   reportable type (`provider_post_comment`) — Remove now actually hides it + Ban resolves the author.
> - ⚠️ **OWED (human):** the launch-admin seed is a no-op until `augustotraversa98@gmail.com` has a
>   **prod account** — sign in once + re-run 0114's one-liner, or name an existing account to flag (see
>   night-run-log 2026-08-15 MOD1 PR1). Until then the console is live + correctly gated, but there is
>   no admin to open it with.

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

- **Quick Check completeness night-run (QC-A/B/C, 2026-08-18b)** — three on-device bugs in the Quick Check
  (GeneralCheckModal) that passed jest but failed on device. **QC-A** (#443) progress bar/"% complete" was
  driven by stepper position (`currentAreaIndex`) so jumping to Teeth showed 38% / Energy 100% with nothing
  assessed; now progress = areas with a chosen status ÷ 8, right counter relabeled "N of 8 checked". **QC-B**
  (#444, migration 0118) the Take/Choose photo buttons were dead and per-area detail was lost; wired the
  buttons (expo-image-picker → useUpload) and added `areas jsonb` on `health_general_checks` storing the full
  per-area `{status,changes[],notes,photos[]}` (flat status cols still written; route degrades pre-migration).
  **QC-C** (#445, migration 0119) a completed Quick Check didn't fill the Care Ring; extended
  `app_pet_ring_segments` (+ the inline fallback) so a same-day general check with ≥1 observation fills Care.
  All three verified on the iOS Simulator; 0118 + 0119 applied + verified on Supabase. (2026-08-18.)
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
- **Pre-launch night run (2026-08-16 plan)** — ✅ 4 phases, PRs #410–#415. A2a demo-content leak
  guarded out of all global feeds/discovery (migration 0111, is_demo); A2b honest+localized post
  timestamps; A3 Report/Block/Delete-own on feed + business-post comments (migration 0112); Phase C
  Privacy+Terms EN+ES DRAFT; Phase B perf audit (no migration warranted — all app queries <2ms);
  Phase D Apple submission runbook + config + EN/ES metadata + App Privacy map. Punch list + legal
  review + Apple next-steps in `docs/night-run-2026-08-16-report.md`. (2026-08-15.)
- **PP1 — Search/Discovery is a card push, not a modal** — ✅ PR #417, mobile-only, no migration.
  Closes the night run's A2c "layers on layers": `search` was a root-Stack modal while everything it
  opens is a push, so pet-profile stacked on it and the photo sheet on that. Now one back stack, with
  a real back affordance; a source-level nav-contract test pins it. mobile jest 1887→1891.
  ⚠️ on-device feel check still owed. (2026-08-15.)
- **PP2 — EN/ES parity: iOS permission prompts + ModerationMenu + Search** — ✅ mobile + app config,
  no migration. `expo.locales` + `CFBundleLocalizations` so the **OS** renders camera/photos/location/
  mic/calendar prompts in Spanish (guarded by `locales/locales.test.js`, since nothing at runtime
  could catch drift); `ModerationMenu` fully through `t()` (`REPORT_REASONS.labelKey` — the wire
  `key` unchanged); Search & Discover localized (10 new keys). `*.es.test.jsx` companions render the
  real Spanish catalog. mobile jest 1891→1905. Residual debt logged: 158 hardcoded `Alert.alert`
  literals, 83/255 files using `useTranslation` — its own ticket. (2026-08-15.)
- **PP3 — write rate-limiting (migration 0113)** — ✅ web-only. DB-backed fixed-window limiter
  (`rate_limit_hits` + `app_rate_limit_hit()` DEFINER) because multiple Railway instances make an
  in-process counter useless. Table is FORCE-RLS with a SELECT-only own-row policy and **no write
  policy**, so a caller can't reset their own counter. Seven write handlers wrapped (posts, barks,
  paw, reports, pet+provider follow, provider book); **no GET**. 429 with `Retry-After` + EN+ES copy.
  Fails open and runs in a SAVEPOINT, so it can neither block nor 500 the app. web vitest 2023→2048,
  integration 1020→1035. (2026-08-15.)
- **WEB1 PR1 — Public legal/support pages on the web app** — ✅ PR #427, no migration. New no-auth
  routes `/privacy /terms /eula /support` in `apps/web`, reachable logged-out, es-AR default + en
  `?lang=` toggle, branded (paw SVG, Nunito, cream/brown/coral-buttons-only), content ported from
  `docs/legal/*.md` (DRAFT stripped), client-side SEO head (title/desc/canonical/hreflang). Mobile
  legal URLs repointed to `pawpi.info/{privacy,terms,support,eula}` (+ EULA slot). Live + verified on
  `pawpi-production.up.railway.app`. ⚠️ **`pawpi.info` DNS still points at one.com, not Railway** —
  add the custom domain on Railway + repoint one.com DNS before the `pawpi.info` URLs resolve (needs a
  human; see night-run-log 2026-08-17). web vitest 2075→2094. (2026-08-17.)
- **WEB1 PR2 — Branded homepage + SEO** — ✅ PR #428, no migration. Replaces the logged-out `/`
  landing with an on-brand homepage (hero es/en, feature strip, 3 audience entry points, **honest
  "coming soon" App Store CTA — not a dead link**), keeps logged-in → `/provider`. Adds OG/Twitter +
  `hreflang`/canonical (client-side head) and `public/robots.txt` + `public/sitemap.xml` (served at
  root). Also paints `<html>`/`<body>` cream on all public pages (`usePublicChrome`) — fixes a dark
  band when scrolling the transparent-body app. Live + verified on `pawpi-production.up.railway.app`.
  web vitest 2094→2099. **WEB1 done (2/2 PRs).** Remaining human task: point `pawpi.info` at Railway.
  (2026-08-17.)
- **WEB2 — Canonical `www.pawpi.info` + one published contact `support@pawpi.info`** — ✅ PR #429, no
  migration. The apex `pawpi.info` carries MX (email) so it can't point at Railway → **`www.pawpi.info`
  is canonical**. Replaced `https://pawpi.info` → `https://www.pawpi.info` in the web `SITE_URL` token
  (drives canonical/OG/hreflang), `public/sitemap.xml`, `robots.txt`; mobile `eas.json` legal URLs +
  `constants/legal.js` (+ local `.env`/`.env.local`); and the App Store Marketing URL doc. Unified the
  single public contact on **`support@pawpi.info`** (a verified alias landing in the `augusto@` inbox):
  web `SUPPORT_EMAIL` token + rendered legal content (privacy/terms/support/**eula**, EN+ES), mobile
  `SUPPORT_EMAIL` default, `docs/legal/*` source + App Store content/runbook. web vitest 2099 (steady),
  mobile jest 1905. Content verified on `pawpi-production.up.railway.app`. ⚠️ **`www.pawpi.info` is
  attached as a Railway custom domain (DNS CNAME live) but still served Railway's wildcard cert + 404
  at cutover — cert issuance/propagation pending on Railway's side (human/ops wait, not code).**
  (2026-08-17.)
