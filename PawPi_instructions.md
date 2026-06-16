PawPi instructions claude cowork

*Note: the prompts to be given to Claude Code always send them in a grey box to make it clear*

*When asked to update instructions, update the PawPi_instructions.md file*

# Social Pet Project Instructions

You are helping me design, structure, and improve a mobile app called **Social Pet**.

Social Pet is an all-in-one app for dog owners. The app combines:

* Social feed
* Dog social profiles
* Health tracking
* Reminders and routines
* Vet records
* Training
* Community
* Adoption
* Pet shop
* Pet services

Your role in this project is to help me think through product structure, UX flows, database logic, feature requirements, and implementation prompts for Claude Code or Anything.

Do **not** assume the app is starting from scratch. Many parts already exist visually, but some areas still use mock data, are not fully connected to the database, or have incomplete navigation/persistence behavior.

## Main goal

Help me turn the existing app into a real, connected, production-ready mobile app where:

* user data persists correctly
* pet data is linked across the app
* health records are structured
* reminders generate real actions
* social profiles show real data
* navigation behaves correctly
* no fake/mock data appears in production

## Current core app structure

The app has bottom navigation:

* Feed
* Health
* Training
* Community
* More

Important areas:

* Feed
* Dog social profile
* More → My Dog
* More → Dog Profile
* More → Reminders & Routines
* More → Pet Services → Veterinary
* Health → Today
* Health → Track
* Health → Insights
* Health → Vet Record

## Important product distinction

There are different types of dog/profile pages:

1. **Dog Social Profile**

   * Public/social-facing dog profile.
   * Opened from Feed by tapping a dog name/avatar.
   * Opened from More → My Dog for the owner’s current dog.
   * Shows daily posts, paws, barks, pet friends, public dog info, and daily moments.

2. **Dog Profile**

   * Private/editable dog profile under More.
   * Stores profile data such as name, breed, age, gender, weight, birthday, notes, photo.

3. **Pet Medical Profile**

   * Health/Vet Record profile.
   * Stores medical-specific data such as microchip, vet clinic, insurance, emergency contact, spayed/neutered status, medical notes.
   * Shared fields must sync with Dog Profile where appropriate.

Do not mix these concepts. They can share data, but they are not the same UI purpose.

## Data principles

Almost every feature should be scoped by:

* `pet_id`
* `owner_user_id`

Use `owner_user_id` from `user_profiles.id` unless the existing app schema clearly requires another pattern.

Avoid mixing:

* `auth_users.id`
* `user_profiles.id`
* `pets.owner_user_id`

Be careful with this because incorrect IDs have caused bugs where pet data, routines, posts, or profiles do not link correctly.

Do not allow data from one pet to appear under another pet.

Do not allow data from one user to appear under another user.

## Persistence principles

If the user creates, edits, or deletes something, it must persist.

Do not only update local UI state.

For existing saved records:

* create/update/delete must be saved to the database
* refetch after save/delete
* deleted items must not reappear after closing and reopening
* avoid duplicate rows

For deletion:

* prefer soft delete where appropriate:

  * `deleted_at`
  * `active = false`
* remove or disable future reminders
* preserve past health logs/history

Past health history should not be deleted just because a routine or future reminder is deleted.

## No fake data

Do not use fake data, mock counts, placeholder records, or sample images unless I explicitly ask.

If no data exists, use empty states.

Examples:

* “No upcoming appointments”
* “No photo checks yet”
* “No current medications”
* “No daily moments yet”

Do not show fake:

* allergies
* medications
* vaccine records
* vet notes
* documents
* dog posts
* profile stats
* health logs
* appointments

## Health positioning

The app must not diagnose.

Health copy should make clear:

“Social Pet helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care.”

Health features should help owners:

* track changes
* prepare vet conversations
* organize records
* notice patterns

Do not present the app as a medical diagnosis tool.

## Reminders & Routines

Reminders & Routines lives under:

More → Reminders & Routines

It has:

* Routines
* Settings

The old/upcoming list inside Reminders & Routines should not be the main place for upcoming reminders. Health → Today should show upcoming/due reminders.

Routine categories include:

* Feeding
* Walks
* Photo Check
* Medical Care
* Wellness Check
* Vet Appointment

General routine logic:

* Routines define schedules.
* Health → Today shows reminders generated from schedules.
* Each scheduled item should be independent.
* Completing one item should not complete unrelated items.
* Deleting a routine/item should remove future reminders but preserve history.
* Inactive/paused is different from deleted.

## Feeding routines

Feeding should support multiple meals.

Each meal should have its own:

* name
* time
* frequency
* days
* notes
* reminder enabled
* time-sensitive setting

Example:

* Breakfast every day at 8:00 AM
* Dinner only Wednesdays and Fridays at 8:00 PM

Health → Today should show the specific meal name and allow:

* log all good
* log with issue
* snooze

## Walk routines

Walks should support multiple scheduled walks.

Each walk can have:

* name
* time
* frequency
* duration
* pace
* notes
* reminder enabled
* time-sensitive setting
* social walk setting

Walk activity should eventually support:

* start walk
* countdown/timer
* finish early
* extend
* finish
* post-walk feedback
* save to history

Social walk should eventually support:

* friends only
* nearby pets

Calendar integration should allow adding walks as private calendar events.

Future Apple Health / Apple Watch integration may track distance, speed, and duration.

## Photo Check routines

Photo Check is for visual health monitoring.

Body areas:

* Paws
* Ears
* Eyes
* Teeth
* Skin / Fur
* Face
* Full Body
* Other

The user should be able to select multiple body areas in one Photo Check routine.

Each selected body area should generate its own reminder.

Example:

* Paws Check
* Eyes Check
* Ears Check

Health → Today should show the specific body area.

When the user taps “Take photo,” it should:

* open camera/gallery
* strongly recommend photo but not require it
* allow notes/comments
* save to health photo logs
* keep data separated by body area

Do not mix paws, eyes, ears, etc. into one generic photo log.

## Medical Care routines

Medical Care should cover:

* Medication
* Vaccine
* Flea/tick prevention
* Deworming
* Heartworm prevention
* Supplement
* Other

Each medical care item should have its own schedule and reminder.

Medical Care should feed into:

* Health → Today reminders
* Current Medications in Vet Record
* Vaccination History in Vet Record
* medical history/logs

## Wellness Check routines

Wellness Check should allow multiple check items inside one routine.

Check item types:

* General check
* Weight
* Body condition
* Mobility
* Mood / Energy
* Skin / Coat
* Appetite / Hydration
* Custom

Each item should have:

* unique id
* type
* name
* frequency
* preferred day
* preferred time
* reminder enabled
* time-sensitive setting
* notes
* active state

Each item should generate its own reminder.

Examples:

* Weight Check → Log weight
* Mobility Check → Start check
* Mood / Energy → Log check
* General Check → Start check

Completing Weight must not complete Mobility or other items.

Known current issue:
Wellness Check can add multiple items, but deleting an item may only remove it locally and not persist. Deletion must save to DB so deleted items do not reappear after closing/reopening.

## Vet Appointment reminders

Vet Appointment should support multiple appointments, not only one form.

Each appointment should include:

* title
* date
* time
* clinic
* veterinarian
* reason for visit
* notes
* reminder enabled
* time-sensitive setting
* reminder timing
* optional add to phone calendar

Preferred table:
`vet_appointments`

Suggested fields:

* id
* pet_id
* owner_user_id
* title
* appointment_date
* appointment_time
* clinic
* veterinarian
* reason_for_visit
* notes
* reminder_enabled
* time_sensitive
* reminder_timing
* add_to_calendar
* calendar_event_id
* status
* created_at
* updated_at
* deleted_at

Statuses:

* scheduled
* completed
* cancelled
* missed

Vet appointments should appear in:

* Health → Today
* Vet Record → Upcoming Appointments
* Vet Record → Vet Visit History after completion
* More → Pet Services → Veterinary later

Calendar integration should be optional and should not block saving if permission is denied.

## Vet Record

Health → Vet Record is the dog’s medical history hub.

It includes:

* Pet Medical Profile
* Upcoming Appointments
* Prepare for Next Visit
* Allergies
* Known Conditions
* Current Medications
* Vaccination History
* Vet Visit History
* Surgery History
* Lab Results
* Documents
* Photo History
* Vet Notes
* Vet Summary / Create Vet Summary
* Add Record
* Share

Vet Record must be data-driven.

No hardcoded fake records or fake counts.

Each section should show:

* real count
* real data
* empty state when no data
* detail section when tapped
* add/edit/delete where appropriate

Vet Record should pull from multiple sources:

* pets
* pet_medical_profiles
* vet_appointments
* medical care routines/logs
* health_photo_checks
* health logs
* documents/uploads
* allergies
* known conditions
* vet notes
* vaccinations
* lab results
* surgeries

Pet Medical Profile should sync with Dog Profile for shared fields:

* name
* breed
* birthday/age
* gender
* weight
* photo
* notes

Medical-only fields:

* microchip
* spayed/neutered
* primary vet/clinic
* vet phone/email
* emergency contact
* insurance
* medical notes

## Dog Social Profile

There should be one canonical Dog Social Profile screen.

Accessible from:

* More → My Dog
* Feed → tap dog name/avatar
* later Community/pet friend lists

It should load by real:

* pet_id
* or pet handle

It should show:

* real dog name
* real handle
* real owner
* real dog photo
* real breed/age
* real stats
* real daily moments grid

Stats:

* Daily posts = count of posts for that pet
* Paws = total paws received on that pet’s posts
* Barks = total barks/comments received on that pet’s posts
* Pet friends = accepted/mutual pet friendships

Daily Moments:

* should show real posts/images from the posts table
* no sample images
* tapping a moment opens the real post

More → My Dog should open the current selected dog’s social profile.

Feed dog name/avatar should open that specific dog’s social profile.

Back behavior should return to the correct previous tab.

## Navigation principles

The app has had navigation state bugs.

Known bug:

* Health → Manage routines opens Reminders & Routines
* User goes to Feed
* Then taps More
* More opens inside a stale routine creation flow instead of the More landing page

Expected behavior:

* More bottom tab should open More landing page
* Health → Manage routines can deep link to Reminders & Routines
* Leaving that flow should not corrupt More tab root
* Routine creation modals/screens should close/reset when switching bottom tabs
* Back should return to the correct parent depending on origin

## UI and UX principles

Keep the current warm, modern, friendly design unless I explicitly ask for a redesign.

Use clear, non-technical messages.

Do not show:

* database errors
* debug banners
* “row updated”
* “JSON saved”
* internal IDs
* technical success popups

Use friendly messages:

* “Saved”
* “Check removed”
* “Routine deleted”
* “Could not save. Please try again.”

Forms must be mobile-safe:

* Keyboard should not cover inputs.
* Save buttons should remain accessible.
* Scroll should work.
* Date inputs should be easy, ideally date picker or auto-format.
* Time inputs should be validated or use picker.
* Phone/email fields should use correct keyboard types.

## How I want you to help

When I ask for help, do not jump into huge implementations.

Prefer:

1. Clarify the product logic if needed.
2. Break big features into smaller steps.
3. Give me precise prompts for Claude Code or Anything.
4. Explain what should be database/backend vs frontend.
5. Help identify likely causes of bugs.
6. Help keep the app architecture consistent.

When writing implementation prompts:

* Include context.
* Include current issue.
* Include expected behavior.
* Include database/data rules.
* Include acceptance criteria.
* Keep prompts focused.
* Split large work into multiple prompts.

Do not use vague prompts like “fix this.”
Be specific.

## Current priority areas

The current priority areas are:

1. Finish Reminders & Routines correctly.
2. Make Vet Record fully data-driven and functional.
3. Connect Dog Social Profile to real data.
4. Fix navigation issues between Health, More, Feed, and routine creation.
5. Ensure data persists correctly and is scoped to the current pet/user.

## Important working style

I often use Claude for planning/discussion and Claude Code for editing the app.

When I ask you for “a prompt,” write it as a copy-paste-ready prompt for Claude Code or Anything.

When I ask for product advice, give clear recommendations and explain tradeoffs.

When I ask for structure, help me decide the safest order of implementation.

Always assume I want incremental, testable progress.

## Workflow rules: Claude Code chats & Cowork chats

Context: I plan and write prompts in this PawPi Cowork project. The actual app
editing happens in Claude Code (a separate app, pointed at the same repo folder).
Both Claude Code conversations AND these Cowork conversations build up context over
time and should be restarted at the right moments. Help me manage that.

1. Remind me when to start a NEW Claude Code chat.
   Proactively tell me to start a fresh Claude Code conversation whenever:
   - a task or PR is finished/merged and we're moving to a new distinct task,
     phase, or feature;
   - the next prompt is clearly a new chunk of work (not a fix or follow-up to
     what Claude Code just did);
   - I mention Claude Code has gotten slow, confused, or very long.
   Keep me in the SAME Claude Code chat while working through a single task and its
   follow-up errors/fixes — do not tell me to restart mid-task.
   When I should start a new one, say it explicitly, e.g.:
   "▶ START A NEW CLAUDE CODE CHAT for this."

2. Give every new-Claude-Code-chat prompt the correct opening line.
   Whenever you hand me a prompt that BEGINS a new Claude Code conversation, make
   the first line of that prompt:
   "Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll
   give you the task."
   Then put the actual task underneath, in my preferred copy-paste format (context,
   current issue, expected behavior, data/DB rules, acceptance criteria).
   If a prompt CONTINUES an existing Claude Code chat, do NOT add the orientation
   line. (Update the file list if other key context files become important later.)

3. Remind me when to start a NEW PawPi Cowork chat (here).
   Proactively tell me to start a fresh Cowork conversation when:
   - we finish a phase or a big topic and are about to switch to a different one;
   - this conversation has gotten long.
   When you do, label it clearly, e.g. "⏩ START A NEW COWORK CHAT — paste this to
   continue:", followed by a short recap I can paste into the new chat (current
   phase, what's done, what's next).
   Note: project files (ARCHITECTURE.md, supabase/SCHEMA_NOTES.md, the migrations)
   and these project instructions persist across Cowork chats, so a fresh chat
   loses nothing important.

4. Always clarify the merge strategy before I merge a PR.
   Whenever a PR is ready to merge, explicitly ask / state whether I should
   "Squash and merge" or "Create a merge commit" (and why) — do NOT assume.
   Default recommendation: Squash and merge (one clean commit per feature on main,
   hides intermediate/WIP churn), unless there's a specific reason to preserve the
   branch's individual commits. Remind me it's a per-PR choice with identical final
   code — it only affects main's history.

## Migration roadmap (moving PawPi off Anything onto Supabase)

The app was exported from "Anything" (create.xyz + Neon Postgres). We are no longer
paying for Anything, so we are moving to our own stack. Backend = the existing web
app in anything/apps/web (kept, not rewritten). Database = Supabase (plain Postgres).
We are NOT doing a big-bang rewrite; we migrate in safe, testable phases:

  Phase 1 — Build the database in Supabase (real schema recovered from Anything).
  Phase 2 — Reconnect the backend to Supabase (swap the Neon-only DB driver for a
            standard Postgres driver; set env vars; run locally) and replace the two
            Anything-only pieces: login adapter (@auth/create) and photo uploads
            (api.anything.com).
  Phase 3 — Reconnect the mobile app to the backend and test core flows end to end
            (sign up, add dog, post, log health).
  Phase 4 — Fix the real product bugs on stable ground: the "current pet" foundation
            (no persisted selection; duplicate useCurrentPet hooks), data scoping by
            pet_id/owner_user_id, and the More-tab navigation corruption.

Key facts to remember:
- Identity chain: auth_users.id -> user_profiles.auth_user_id -> user_profiles.id
  -> pets.owner_user_id. owner_user_id holds user_profiles.id, NOT the auth id.
- IDs are integers (not uuid). routines.times is text[], routines.days is integer[].
- Test data is disposable; the database starts empty. No fake/mock data in the app.
- Connection strings / tokens are secrets: they live only in untracked .env files,
  never in chat or committed files.

## Current status (keep this updated)

Status tracked in this block, maintained by Claude in Cowork (this file is the living source of truth; the Settings instructions block points here). Audit doc: CURRENT_PET_AUDIT.md.

- Phase 1: DONE — schema recovered, 33 tables in Supabase, migrations match real DB (PR #3).
- Phase 2: DONE (core) — DB driver swap (PR #4); auth on Supabase (PR #5); uploads to Supabase Storage (PR #6).
- Phase 2 follow-up: fixed silent no-op positional-sql writes (tagged templates + sql.unsafe). In SCHEMA_NOTES.md.
- Phase 3: DONE — 6 photo-upload flows verified; Poo/Vomit trackers fixed.

- Phase 4: IN PROGRESS — current-pet foundation, data scoping, More-tab nav.
  - Foundation: DONE — single useCurrentPet (PR #12); persisted selection pawpi:selectedPetId (PR #13).
  - Native iOS photo uploads via fetch.ts (PR #14); local-iPhone dev setup.
  - Ticket 3 — pet switcher + add-a-dog (no logout): DONE (PR #15). Verified live.
  - Ticket 4 — Health logs scoped to active pet, refetch on switch: DONE (PR #16). Verified live.
  - Ticket 5 — Feed scoping to active pet: DONE (PR #18). Verified live.
  - Systemic jsonb-as-string fix: DONE (PR #19). JSON.stringify → sql.json at 11 sites + backfill migration 0009.
  - Onboarding-gate / auth-recovery bug: DONE (PR #20). Pure determinePetsRoute() (31/31). On-device check pending.

  - Testing / CI track (parallel to product tickets):
    - Auth env-origin fixes: DONE (PR #21).
    - Phase A step 1 + jsonb regression test + write-path governance: DONE (PR #23).
    - Phase B (CI): GitHub Actions, two parallel Node-20 jobs (mobile + web), required to merge. DONE (PR #25).
    - Dual-lockfile cleanup: mobile npm-only, only-allow guard. DONE (PR #26).
    - Docs: TESTING_AND_CI_PLAN.md + ARCHITECTURE.md §Testing. PR #28 (OPEN — merge when ready).
    - 1a — auth/API-route smoke (web, Vitest): DONE (PR #29, merged). Web baseline 19.
    - 1b — routine generators (mobile, Jest): DONE (PR #30, merged). Test-only.
    - Wellness dispatcher fix: DONE (PR #31, merged). Wired case ROUTINE_TYPES.WELLNESS_CHECK; flipped 1b tripwire. On-device verified.
    - Test baselines (all green): mobile 85 (testflight-logger 18 + report-error-to-remote 6 + determinePetsRoute 7 + reminderGenerator 13 + wellnessLog 14 + reminderGenerator.overdue 17 + reminderResolution 10); web 19 (smoke 1 + jsonb 8 + auth/route 10).

  - Ticket 7 (wellness slice) — wellness log entry + persist real rows: DONE (PR #32, merged; migration 0010 applied to Supabase). Config-driven WellnessLogModal + pure wellnessLog.js. Weight → health_weight_logs (Insights path); general+rest → health_wellness_logs (routine_id + item_index + values_json.scheduledDate). On-device verified all types incl. general.

  - Overdue reminders + restart reconciliation (Health → Today): PR1 = PR #33 MERGED. Migration 0011 (reminder_dismissals) APPLIED to Supabase (no RLS, consistent with all tables). Known tradeoffs/follow-ups in PR body (UpcomingTab not rewired; medical given_at backdated).
    - On-device BUG found: overdue generators don't clamp enumeration start to routine creation / item start, so a routine created today backfills ~30 days of phantom overdue (saw 61 items). generateOverdueWellnessChecks (~L1187) + photo path start at windowStart unconditionally; medical clamps to item.startDate only (no createdAt fallback); locked future gen clamps via max(now,startDate).
    - Follow-up PR #34 (same CC chat as #33): (a) clamp overdue enumeration start to max(windowStart, routine.createdAt, item.startDate) across wellness/medical/photo (shared clampOverdueStart helper; createdAt already in store transform; +5 clamp tests); (b) collapsible Overdue section in HealthToday (Overdue (N) + chevron; auto-collapse when N>5; user choice sticks) — also addresses backlog item #2. CI green (mobile 85, web 19), no migration. MERGED into main (origin/main @ #34). On-device: confirm fresh routine → minimal/0 overdue + collapse alongside #35 testing.
    - BUG (on-device, found after #34) — overdue item appears then disappears for good. Repro: medication dose set in future → passes → shows under Overdue → ~1min later when a feeding reminder surfaces / a background query refetches, it vanishes permanently (completing food doesn't restore). NOT the weight/photo heuristic (medication is exact-matched, no medical log exists). Root cause area: useTodayReminders derives overdue from transient sources (storeReminders) + recomputes only on query-refetch/store change, and `now` is NOT reactive (passed undefined). Fix = PR #35 (ticket/overdue-deterministic-now), OPEN, CI green (mobile 91, web 19). Root cause CONFIRMED via deterministic jest probe: the in-memory reminders store was the only non-deterministic Overdue source, and `now` wasn't a memo dep, so the list rebuilt on refetch/60s-sync timing (when a feeding reminder surfaces) not the clock — store entry churned → card dropped with nothing to re-derive it. generated path + medical jsonb round-trip proven reliable. Fix: new pure buildOverdueReminders derives Overdue from generateOverdueInstances(routines)+vet only (store dropped as source), minus (resolved∪dismissed); per-minute reactive `now`; medical overdue now bounds daily doses by item.endDate (parity w/ future gen). +6 regression tests incl. unchanged-routines+advanced-clock-keeps-instance. RESIDUAL RISK: removing the store fallback means a dose shows ONLY if generated emits it from the REAL refetched routine — must verify on device that medication overdue APPEARS (~1min, new tick) AND STAYS; if it never appears, generated isn't emitting from the real shape (reopen). Pending: merge → on-device verify medication + wellness + photo overdue appear and stay. Blocks PR2.
    - BUG (on-device, overdue action parity): Overdue + Next Up inline cards (HealthToday ~L533/L720) only wire onComplete; missing the "Something off?"/issue secondary action the countdown cards have (onSomethingOff → medical issue modal). Medical overdue logs status "given" silently with no issue option; wellness/photo overdue OK (handleComplete opens their modals). Fix = HealthToday rendering only, reuse handleSomethingOff/saveMedicalCareLog. Own PR (new CC chat, off main). Independent of PR C but NOT same-time editing (shared working dir).
    - PR2 (feeding/walk today-only overdue) after the disappearance bug is fixed + #34 verified.
    - Additive generateOverdueInstances(routine,{lookbackDays=30,now}) for persistent types (wellness/medical/photo); locked generator path + tests untouched.
    - reminderResolution.js: wellness=exact key; weight/photo=date heuristic; medical=exact day. useTodayReminders subtracts (resolved ∪ dismissed) in one pass.
    - reminder_dismissals table (migration 0011) for durable skip + /api/health/reminder-dismissals route.
    - Feeding/Walk today-only overdue = PR2 (next, transient, lower-risk).

  - App-wide UX polish (separate workstream/CC chat; one PR per concern; #2 & #3 align with UI principles here). AUDIT DONE (verified by direct grep; sub-agent misses corrected — VomitTrackerModal not protected, MedicationModal 15 unprotected inputs).
    - Baselines: RefreshControl in ZERO files; DateTimePicker in ZERO files (no native picker dep; every date/time hand-typed); keyboard — KeyboardSafeFormModal (gold standard, only EditMedicalProfileModal uses it) + KeyboardAvoidingAnimatedView; ~22 forms protected, ~12 TextInput modals UNprotected (worst MedicationModal 15 inputs; also VomitTracker, GeneralCheck, WalkActivity, PhotoCheckRoutine, ReminderCreation, SimpleRoutine, VetAppointmentDetail, FoodWaterTracker, etc.). FeedingIssueModal missing keyboardShouldPersistTaps (1-line).
    - Date-format drift (DATA-INTEGRITY, not just UX): routine modals YYYY-MM-DD vs MedicationModal vaccine/preventive MM/DD/YYYY (both write vaccine/preventive); pet birthday entered in 3 places in 3 formats; no time-field validation. All *_date cols are Postgres date → parse-failure risk.
    - PR plan (build shared component first, then roll out): PR A pull-to-refresh (useRefresh hook + RefreshableScrollView; wire ~8 server-backed screens: Feed, Vet Record, Today, Routines, Upcoming, Nearby Walks, Notifications, Messages; skip mock-backed Community/Training/Search/Chat). PR B keyboard (migrate the ~12 unprotected modals onto KeyboardSafeFormModal, start MedicationModal; +1-line keyboardShouldPersistTaps FeedingIssueModal; no deps). PR C date/time pickers (add @react-native-community/datetimepicker, DateField/TimeField → canonical YYYY-MM-DD/HH:MM, replace all typed date/time inputs; fixes format drift; riskiest — touches date cols, do last + device test).
    - Order A → B → C. #35 MERGED (PR A branched off main incl. #35).
    - PR A pull-to-refresh: BUILT on branch ticket/pull-to-refresh — shared useRefresh hook (pure testable runRefresh core) + RefreshableScrollView; 6 screens wired (Feed, Vet Record, Today, Routines, Upcoming, Nearby Walks); deferred mock-backed (Notifications/Messages/Community/Training/Search/Chat/Insights/PetProfile). +5 tests, mobile 96 green, no deps. NOTE structural change: health.jsx — Today + Vet Record now own their scrollers (removed nested ScrollView), Track/Insights keep wrapper → on-device must verify all 4 Health tabs render/scroll/switch. MERGED (PR #36); on-device 4-Health-tabs pass still pending.
    - PR B keyboard: BUILT on branch ticket/keyboard-safe-modals (off main incl. #36). 3 modals converged onto KeyboardSafeFormModal (SimpleRoutine, PhotoCheckRoutine, ReminderCreation); 11 got minimal KeyboardAvoidingView+persistTaps (MedicationModal — tabbed bottom-sheet, couldn't converge w/o restructuring 3 save handlers, used fallback rule; GeneralCheck, VetAppointmentDetail, FoodWaterTracker, VomitTracker, WalkActivity, PostWalkFeedback, StartWalk, PhotoCheck, PhotoCheckCapture, VetSummary); FeedingIssueModal +persistTaps; KeyboardSafeFormModal gained onRequestClose (Android back, also affects EditMedicalProfileModal). No field/logic/data changes, no deps, net −177 lines. mobile 96/web 19 green. NO automated coverage for keyboard behavior → on-device IS the verification (worst: MedicationModal vaccine/preventive lower fields+Add btn, GeneralCheck notes footer, WalkActivity, Android-back on EditMedicalProfile). Minor visual: ReminderCreationModal CTA lost its Plus icon. MERGED (PR #37). DEVICE PASS FAILED: minimal KAV fallback doesn't work — bottom-of-screen inputs still covered by keyboard across multiple/most modals (KAV alone doesn't scroll focused input into view in bottom-sheet modals). Follow-up fix BUILT — PR #40 OPEN, CI green (mobile 160 = 152+8, web 19). Root cause confirmed in RN 0.81 source: (1) KAV measures parent-relative but compares to keyboard screen-Y → padding short inside pageSheet modals (7 of 11); (2) KAV never scrolls — focused input ends below the fold; automaticallyAdjustKeyboardInsets unimplemented in Fabric (app is newArchEnabled). Fix = shared KeyboardAwareScrollView.jsx (window-coordinate measure + pad by real overlap + scroll focused input above keyboard; persistTaps default; no new dep). All 11 fallback modals use it; root KAVs kept only for pinned footers (GeneralCheck, Medication, VetAppointmentDetail, PhotoCheckCapture, VetSummary), removed from 6 broken pageSheet trackers; KeyboardSafeFormModal adopted wrapper internally too. #38/#39 untouched. Pending: merge → 14-step device script in PR body (extra attention: MedicationModal focus-switch A→B without dismiss; VetSummary pinned Preview button).
    - PR C (date/time pickers): BUILT — app-wide rule: every date field opens inline native calendar, every time field opens wheel/spinner; display "21 April 2025"-style, canonical YYYY-MM-DD/HH:MM to state/API (legacy MM/DD/YYYY tolerated on read). Shared dateTime utils (pure) + DateField/TimeField; 16 sites replaced (MedicalCareRoutineModal ~10 inputs, MedicationModal vaccine/preventive ×4, Vaccine/PreventiveCare/VetAppointment routine modals, EditMedicalProfile ×3, pet birthday ×3 incl. onboarding, ReminderCreationModal — caught on sweep); prefill ISO datetimes normalized to canonical. Mobile 136 (+40), web 19. PR #38 MERGED. CI lesson (keep): npm 11 locally vs npm 10 in CI — npm 11 re-sync silently pruned optional peer dep yaml@2.9.0 that npm 10 requires AND validated the broken lock as fine; fix = restore entry from main + validate with `npx npm@10 ci --dry-run` before pushing lockfile changes. Judgment calls in PR body: side-by-side date pairs stacked vertically (inline calendar can't fit half-width); iOS TimeField commits opening value when field was empty (spinner has no confirm). MedicationModal epoch conversion now parses local not UTC (off-by-one-day fix). No persisted MM/DD/YYYY found — no data repair needed. Device-pass checklist in PR recap: birthday ×3 (onboarding/profile-edit/AddDogModal), EditMedicalProfile, MedicationModal vaccine+preventive, all 11 routine modals + WalkItem; verify calendar/wheels open, "21 April 2025" display, YYYY-MM-DD/HH:MM in Supabase. Pending: merge → device pass.

  - Reminders modal redesign — iOS-Reminders-style scheduling (NEW design direction, decided w/ Tats Jun 2026). PROGRESS: P1b-1 month-multiple cadences DONE — PR #46 MERGED (baseline now mobile 254 = 237+17). reminderGenerator.js gained MONTH_CADENCE_STEPS + buildMonthCadenceDates (date-anchored Monthly/Every-3/Every-6/Yearly from true start; month-overflow clamps to last day; local-date parse of YYYY-MM-DD; instance-id scheme untouched). All 4 calendar-cadence forward paths + both overdue paths share the anchored date-set → forward & lookback identical. ALSO FIXED reminders-backlog item #1 (monthly/biweekly phase bug) + wellness (preferredDay%28)+1 approximation. Notifications unchanged by design (key off generated nextTriggerAt). Horizon note: quarterly/yearly only materialize within the 14-day generation horizon.
    - P1b-2 ONCE/non-repeating DONE — PR #47 MERGED (baseline 254 → 269). Added ROUTINE_FREQUENCY.ONCE; rides #46 date-set machinery (anchor helper renamed getMonthCadenceAnchor → getScheduleAnchor; new buildCadenceDateSet wrapper: month-multiple → date set, ONCE → one-date set, weekday → null). One-element set → forward emits exactly one future/today instance, overdue exactly one past (clamped), ages out beyond lookback. Medical-care generators not cadence-driven, untouched. 15 new tests.
    - P1b-3 Hourly DONE — PR #48 MERGED (baseline 269 → 281, +12). iOS "Hourly" implemented as user-chosen INTERVAL ("every N hours", presets 2/4/6/8/12), not strict every-hour, to control volume. First INTRA-DAY cadence → instance-id gains a _HHMM time suffix for HOURLY ONLY (non-hourly ids byte-for-byte unchanged → reminder_dismissals keys safe); overdue CAPPED TO TODAY (no backfill flood); siblings independent. Landed on the WELLNESS path only (matched the ONCE precedent) — that scope gap was the trigger for P1b-4 below. UI interval picker deferred to ScheduleBlock.
    - P1b-4 Cadence across ALL paths DONE — PR #49 MERGED (baseline 281 → 361, +80 across 8 new test files; web 19 untouched). Closed the fragmentation: every routine type's generator (forward + overdue) now resolves through the shared cadence layer. HEADLINE: medical-care was NOT cadence-driven (branched on careType, never read item.frequency) → monthly heartworm / monthly flea-tick / yearly vaccine / every-3-6-month / every-8h meds silently collapsed to daily-course or one-shot. Now fully closed (9 commits): (1-2) medical-care date-based + dose-course items → full calendar cadence, back-compat default absent-frequency ⇒ Once/Daily so existing ids stay byte-for-byte (pinned by id-stability assertions); (3) medical-care hourly; (4) photo hourly; (5-6) wellness + photo weekday/weekend/custom; (7-8) feeding + walk recurring cadences (weekly/biweekly/month-multiple/once/hourly forward; their overdue stays transient = PR2 territory); (9) dev-time guard — assertCadenceHonored/CADENCE_SUPPORT throws in __DEV__ if a (routineType, cadence) pair hits a path that can't honor it, so a future UI change can't ship a silent no-fire schedule; genuine N/A pairs (vet-appointment recurring/hourly; feeding/walk overdue) whitelisted + documented ⊘ in apps/REMINDER_CADENCE_SUPPORT_MATRIX.md. Walk generator inverted outer-day-loop → per-walk loops (only way to do per-walk weekly/biweekly + hourly; reminder SET + ids identical, only array order changes, no consumer depends on it). New shared helpers: medicalCareOccurrences (month cadences index BACKWARD so future-anchored nextDue still surfaces overdue), dayPatternActiveDays (now shared by all 5 item-driven paths), hourlyIdSuffix. TZ-robust UTC/UTC+5:30/UTC−8/UTC+14. Generator-only, no migration, no UI. Device sanity (live paths) PASSED: existing medical reminders unchanged + multi-walk order OK. cadence memory file corrected (removed stale "medical-care NOT cadence-driven" claim). REMINDER: these new cadences can't be exercised on-device until ScheduleBlock exposes them — jest is the verification until then.
    - P1 ScheduleBlock UI DONE — PR #50 MERGED (baseline 361 → 405, +44). Two isolated commits: (1) generator enrichment — weekly/biweekly now honor multi-day days[] (fire on every weekday in a non-empty days[]; biweekly "on" weeks anchored on startDate), applied across all 6 day-walk paths (feeding/walk/photo/wellness fwd + wellness/photo overdue); back-compat byte-for-byte (new path gated on non-empty days[]; absent ⇒ locked single-preferredDay path untouched — safe because no stored weekly/biweekly item ever persisted a multi-element days[]); new helpers weeklyMultiDays/startOfWeekMonday/isBiweeklyOnWeek; matrix doc updated; dev-guard unchanged. (2) shared ScheduleBlock.jsx (Date inline-calendar → Time → Frequency FULL list → conditional sub-control → Early reminder) WIRED INTO WellnessCheckRoutineModal ONLY (the "ALL"-cadence, guard-safe reference type; SimpleRoutineModal rejected — its legacy general/weight types aren't in CADENCE_SUPPORT so the guard is blind there). Conditional controls: Weekly/Biweekly + Custom → multi-select DayChips → days[]; Hourly → interval presets → intervalHours; Monthly+/Once → no weekday control (anchored on picked Date's day-of-month via startDate). Emits ONE canonical object = the generator's per-item read shape 1:1; wellness_check_schedule JSONB save/load extended to carry startDate/days/intervalHours/reminderTiming (NO migration). reminderTiming is STORED-ONLY for now (the Early-reminder control is in the UI but only the medical-vaccine path actually fires on it → P2 makes it functional everywhere). CadenceFrequencySelector gained full label set + CADENCE_OPTIONS_FULL (additive). 44 new tests incl. contract round-trip (every cadence fires ≥1 reminder, dev-guard never trips) + ScheduleBlock render pins; TZ-robust. DEVICE PASS (wellness modal: each cadence save→fires, multi-day weekly Wed&Fri, biweekly parity, edit round-trip, back-compat, collapsed-card label, mobile-safe) = STILL PENDING — Tats merged ahead of it; run it and flag anything off.
    - P2 Early-reminder lead-time DONE — PR #51 MERGED (baseline 405 → 420, +15). DESIGN CORRECTION (overrode the original "match vet/medical whole-shift" instruction): early reminder = OS NOTIFICATION lead-time ONLY — the reminder instance NEVER moves (scheduledAt/nextTriggerAt/id stay at event time). WHY: the overdue path lives in the LOCKED generator and wouldn't get the shift, so shifting the forward instance would desync forward vs overdue and break the scheduledDate/dismissal resolution key (the 0a–0d bug class). Keeping the instance fixed dodges all of it + is more iOS-faithful (event stays put in Today, alert is a heads-up). FLOW: reminderGenerator.js untouched; remindersStore.addReminderFromRoutine resolves the lead-time off the source routine (looked up from routinesStore where the routine is in scope) and passes it to scheduleReminderNotification (utils/notifications.js), which schedules the OS alert at nextTriggerAt − leadMs. Helpers: LEAD_TIME_MS (mirrors ScheduleBlock's on_time/5m/15m/30m/1h/1d/1w), resolveLeadTimeMs (0 for absent/on_time/unknown ⇒ unchanged), resolveReminderTiming (dispatched by routine TYPE — wellness live, others return null with documented P3 extension point), past-trigger guard (skips, no crash). EXCLUSIONS: vet_appointment + medical-care vaccine items → resolveReminderTiming null, keep their existing offset, never double-shifted. Also added resolveReminderTiming to 2 existing notification-mocks (snooze + todayOverdueRealShape). Notification-layer only, no migration. DEVICE PASS PENDING (combine with P1's): wellness "15 min before" → push lands early while Today row stays at real event time.
    - P2 FOLLOW-UP — early-reminder edit-reschedule fix DONE — PR #52 MERGED (baseline 420 → 422, +2 tests). DEVICE BUG: setting Early reminder on a routine created earlier did NOT fire early. ROOT CAUSE (not the resolve chain): ordering race in routinesStore — removeFutureRemindersByRoutine is async (mutates state in a set() after an await cancelNotification loop) but updateRoutine + toggleRoutineActive re-enable branch called it WITHOUT await, so the synchronous regenerate loop ran against not-yet-removed state and addReminderFromRoutine's id-dedup early-returned on every still-upcoming instance → scheduleReminderNotification never reached; deferred removal then cancelled the old at-event notification. New routines worked (addRoutine has no preceding removal). FIX (store-only, both paths): await removeFutureRemindersByRoutine + await each addReminderFromRoutine in updateRoutine (417-426) and toggleRoutineActive re-enable (513-521); dedup early-return KEPT (load-bearing for loadRoutines/refetch double-schedule guard — after an awaited removal no duplicate survives). Generator/instances untouched (instance stays pinned to event time). New routinesStore.editReschedule.test.js (2 cases: turn on "15m" → upcoming cancelled+rescheduled w/ "15m"; toggle back → "on_time"); verified both FAIL on reverted un-awaited code (0 scheduler calls = exact device repro). Device pass (early reminder on a pre-existing wellness routine) still owed.
    - Cadence-label fix DONE — PR #53 (baseline 422 → 452, +30 tests). getScheduleSummary in routinesData.js had partial getFreqLabel switches (wellness + photo) with default:return freq → new cadences leaked raw enum ("every_3_months" with underscores). Fix: module-level full-set CADENCE_LABELS map + getCadenceLabel() whose fallback replaces _→space (no raw enum can ever surface, even a future cadence); both switches + the medical-care repeatInterval map folded into it. Pure label/string change, no device aspect. routinesData.scheduleSummary.test.js parametrized over every ROUTINE_FREQUENCY for both card types (asserts human label + no "_"). BRANCH-HYGIENE NOTE: originally pushed onto already-merged #52 branch (stranded, not on main); re-landed via fresh branch ticket/cadence-labels off current main (cherry-pick of a3a14a5) → PR #53. Lesson reinforced: one prompt = one fresh branch off main from the start.
    - Collapsible Frequency DONE — PR #54 (baseline 452 → 457, +5 tests). ScheduleBlock.jsx Frequency section now iOS-Reminders collapsible: tappable header row ("Frequency" + current selection's CADENCE_LABELS label + chevron), starts collapsed, expands the CadenceFrequencySelector, picking an option emits + collapses. Local UI state only (freqExpanded) — emitted schedule object / onChange / generator read-shape unchanged; sub-controls + Early reminder untouched. New testIDs schedule-block-frequency-toggle / -frequency-value. Since ScheduleBlock is the P3 template, the collapse touch-feel/animation wants an on-device eyeball. Fresh branch ticket/schedule-block-collapsible-frequency off current main (correct hygiene). PR #54 MERGED.
    - Early-reminder notification copy DONE — PR #55 MERGED (baseline 457 → 465, +8 tests). DEVICE FINDING (from wellness pass): an early reminder (e.g. "1 day before" a task due tomorrow) fired as a push that read like a do-it-now task — no due-date context. Confirmed the in-app "Next Up" list only spans NEXT_UP_WINDOW_MS (6h) so a 1-day-ahead task never appears in-app; the early PUSH is the only ahead-of-time artifact. Fix (notification layer only, utils/notifications.js): pure buildReminderNotificationContent(reminder,{eventTime,triggerTime,leadMs}) — on-time (leadMs 0/absent) byte-for-byte unchanged (body=reminder.description); early (leadMs>0) title→"<icon> Upcoming: <title>", body appends "Due <formatScheduledTime(eventTime,triggerTime)>" (e.g. "Due Tomorrow 9:00 AM"), relative to the day the alert fires, no dates from instance ids. Instance never moves; no generator/migration. notifications.notificationContent.test.js (8 cases). Fresh branch ticket/early-reminder-notification-copy off main. Device note: eyeball the two-line \n body on iOS/Android lock screen + Today row stays at real event time.
    - Boxed Frequency header DONE — PR #56 MERGED (baseline 465, style-only no new tests). DEVICE FINDING (from wellness pass): the collapsed Frequency header (post-#54) was a bare row, flat beside the boxed Date/Time fields → overlooked. Fix (style-only ScheduleBlock.jsx): boxed the collapsed header to match DateField/TimeField (C.card bg, 1.5px C.peach border, radius 12, padding 12); label/value/chevron + expanded list + testIDs + state machine untouched. Fresh branch ticket/frequency-boxed-header off main. Device note: eyeball box weight/padding reads as a consistent field beside Date/Time.
    - WELLNESS TEMPLATE NOW FEATURE+POLISH COMPLETE (PRs #50/#51/#52/#53/#54/#55/#56 all merged; baseline mobile 465). Only the single end-to-end device pass below gates P3.
    - COMBINED WELLNESS DEVICE PASS (P1+P2 + #52/#53/#54/#55/#56) STILL OWED before P3 — Tats merged #50 + #51 ahead of it. The wellness modal is the TEMPLATE P3 copies ~10×, so a bug here multiplies. Run once: each cadence save→fires; multi-day weekly (Wed&Fri) fires both; biweekly parity; edit round-trip returns selections; back-compat (pre-redesign wellness routine opens fine); collapsed-card label correct for Yearly/Hourly/Once; "15 min before" push arrives early w/ Today row at real time; mobile-safe.
    - P3 ROLLOUT (ScheduleBlock into each modal, one per PR; order: PhotoCheck ✓ (PR #57/#62) → MedicalCare ✓ (DONE, merged: ScheduleBlock for medication+supplement only via hideTime+cadenceOptions[no ONCE]+DoseTimes; vaccine/flea-tick/deworming/heartworm/other left bespoke [due-date, own offset]; resolveReminderTiming MEDICAL_CARE case returns item.reminderTiming for med/supp only; ADDITIVE generator change — medicalCareOccurrences now honors item.days for weekly/biweekly gated on non-empty days[]; mobile baseline 564) → ~~SimpleRoutine~~ SKIP (DEAD/unreachable: SimpleRoutineModal only opens on selectedType GENERAL_CHECK/WEIGHT_CHECK, but creation [RoutineTypeSelector] never offers them and handleEdit remaps those legacy types → WELLNESS_CHECK; nothing sets selectedType to them. Candidate for deletion in a cleanup PR.) → Feeding ← NEXT → Walk → VetAppointment(Routine+Detail) → ReminderCreation). Pattern per modal: swap schedule UI → ScheduleBlock (reuse wellness wiring: scheduleFromItem + {...item,...schedule} merge); load/save carry startDate/days/intervalHours/reminderTiming through the type's JSONB (no migration); add the per-type resolveReminderTiming branch in utils/notifications.js (vet + medical-vaccine stay null — own their offset); keep per-type detail + toggles. Shared ReminderSettingsCard extraction DEFERRED to its own consistency PR (not folded into individual rollouts).
      - PhotoCheck (PR #57): MERGED to main. ScheduleBlock in BOTH same + per-area custom paths (accent #4DB8E8); photoCheckSchedule entries carry startDate/days/intervalHours/reminderTiming (JSONB photo_check_details, no migration); allSame load-comparison extended to new fields (days deep-equal) so per-area diffs reopen in custom mode; pure exported helpers photoScheduleFromEntry/photoScheduleEntry; back-compat defaults ""/[]/4/on_time, empty startDate→null (generator anchors createdAt), ids/dismissal keys untouched. notifications.js resolveReminderTiming PHOTO_CHECK branch → photoCheckSchedule[reminder.photoCheckScheduleIndex]?.reminderTiming ?? null. +20 tests. main baseline now mobile 485, web 19. Pending: combined device pass (photo cadences + still-OWED wellness pass run together: each cadence fires; same-vs-custom mode round-trip; "15m before" early push w/ Today row at real time; back-compat; mobile-safe). DEFERRED quick-win: collapse the Body-area picker (8 options, too long) like ScheduleBlock's collapsible Frequency — fold into next PhotoCheck touch or its own small PR.
      - DEVICE FINDINGS (Tats, Jun 2026), queued AHEAD of remaining P3 modals (Tats prioritized notifications):
        (#2 NOTIFICATIONS — FIXED) PR #58 (ticket/local-notifications-fire): initNotifications() startup perm+Android channel, silent getPermissionsAsync guard, __DEV__ scheduled-count log + past-skip warns, DEV-only 10s test button in R&R→Settings, expo-notifications registered in app.json plugins. mobile 485→491, web 19. THEN device test surfaced the REAL bug: SDK 54 expo-notifications REJECTS a bare Date trigger ("trigger object invalid; needs type or channelId") — my web-search "bare Date is fine" was WRONG for 0.32. Follow-up fix PR #59 (ticket/notification-trigger-type, MERGED): typed trigger { type: SchedulableTriggerInputTypes.DATE, date, channelId:"default" } at BOTH call sites (scheduleReminderNotification + the test button) + notifications.trigger.test.js pins the shape (never bare Date/number). main baseline now mobile 493, web 19. After that, on-device test notification FIRES. Notifications now working in Expo Go. STILL TO CONFIRM ON DEVICE: a REAL routine reminder fires (~2-3 min out test + scheduled-count>0 log + watch past-skip warns) — only the DEV test button is verified so far; if real reminders don't fire, suspect the past-trigger skip (instances generated in the past). (Permission was granted — code got past perm and failed only at scheduling, so the trigger format was the whole blocker.) Earlier ranked causes (lazy per-reminder perm Alert, Expo Go perm under Settings→Expo Go, past-trigger skip, Android channel) addressed by #58 but the trigger type was THE fix. NOTE: own-app-identity + remote push still need a DEV BUILD later.
        (#2b EARLY-REMINDER HEADS-UP CARD — NEXT, decided w/ Tats Jun 2026) Device finding: an early reminder surfaces in Health→Today as a normal Next Up do-it-now card (Complete button, event time, when event ≤6h) with NO early/due context; further-out early reminders don't show at all. Tats wants (BOTH in-app + push): a distinct HEADS-UP card in Today during the early window [earlyTime, eventTime) showing WHAT + "Due Tomorrow 3:00 PM", with ONLY Close + Edit (no Complete/Log). Close = acknowledge, durably hides ONLY the heads-up (heads-up-namespaced reminder_dismissals key e.g. `${instanceKey}::early`), does NOT log/resolve; the REAL instance still surfaces normally at its true event time. Edit = open that routine. Must cover the full early window (not just 6h Next Up). Surface via new pure buildHeadsUpReminders (leadMs=resolveLeadTimeMs∘resolveReminderTiming; earlyTime=eventTime−leadMs) wired through useTodayReminders; new HeadsUpReminderCard; exclude active heads-ups from Due Soon/Next Up (exactly one home); once now>=eventTime resumes normal sectioning. Also verify #55 push copy still reads "Upcoming…Due…". No generator/instance/id/migration changes. PROMPT ISSUED (new CC chat, orientation line, branch ticket/early-reminder-headsup off main AFTER notification PRs merge). Relates to old backlog item: "early reminders surfacing in Today." BUILT on device (heads-up card renders — "appeared once"); see #2b-PHANTOM below for the device bug it surfaced.
        (#2b-PHANTOM-OVERDUE — FIXED, PR #61 OPEN) Device finding while testing the heads-up card (photo Paws, tomorrow evening, "1 day before"): push was perfect, but in-app the item ALSO showed as an OVERDUE card today (should show ONLY as the Upcoming/heads-up Close-Edit card; Overdue only at/after true event time). ROOT CAUSE (protected generator, NOT a heads-up-card bug): Overdue is re-derived from routines by generateOverdueInstances; the two NON-HOURLY overdue paths clamped enumeration start only to routine.createdAt, omitting item/schedule startDate — so a future-dated item (startDate tomorrow) backfilled a phantom pre-startDate occurrence once the clock passed #51/#55 early time. Forward generator + medical-care + ALL hourly overdue paths already clamp to startDate via the shared clampOverdueStart(windowStart,routine,item)=max(windowStart,createdAt,startDate). FIX (two one-line edits, branch ticket/overdue-clamp-startdate off main, own PR — independent of the heads-up UI branch): generateOverduePhotoChecks L2402 → clampOverdueStart(windowStart,routine,schedule); generateOverdueWellnessChecks L2059 → clampOverdueStart(windowStart,routine,item). Confirmed both objects emit `startDate`. clampOverdueStart/hourly/medical/forward/id-scheme untouched (dismissal keys byte-for-byte; no-startDate item falls back to createdAt as before). +6 tests (photo+wellness: future-startDate⇒empty, past-startDate still surfaces, no-startDate⇒pinned ids). mobile 511→517, web 19. commit 20d27a1, PR #61. Generator-only, no migration. DEVICE PASS OWED — run in a build that ALSO has ticket/early-reminder-headsup (merge #61→main first, then rebase heads-up branch): during early window photo/wellness shows ONLY the Upcoming Close/Edit card, NOT Overdue; at/after event time resumes normal sectioning. NOTE: baseline drift — status block last recorded mobile 493 (post-#59) but CC suite is 511→517, so other PRs landed since; reconcile on next status edit.
        (#2b HEADS-UP CARD + 4 FIXES — ALL DONE & MERGED across PR #61 + PR #63, per-fix device-verified Jun 2026) The heads-up card + four follow-on fixes. MERGE SPLIT (branch-hygiene tangle — see MERGE REALITY at the end of this block): PR #61 merged ONLY the base card + Fix 1; Fixes 2/3/4 were stranded on ticket/early-reminder-headsup and landed later via PR #63. The four fixes, in order:
          Fix 1 — overdue startDate clamp (the #2b-PHANTOM above): generateOverduePhotoChecks L2402 + generateOverdueWellnessChecks L2059 now pass schedule/item so overdue enumeration floors at startDate (no phantom pre-start overdue). +6 tests.
          Fix 2 — Close = hide-until-event: useTodayReminders returns earlyDismissedKeys; sectionTodayReminders skips a FUTURE instance whose `${id}::early` is set (excluded from Due Soon AND Next Up), so Closing a heads-up hides it from all Today sections until its true event time; past-due still homes in Overdue (early key partitioned out of real dismissedKeys). +4 tests.
          Fix 3 — forward startDate clamp (twin of Fix 1): new forwardEnumStart(now,startDate)=max(now,startOfLocalDay(startDate)); generatePhotoCheckReminders + generateWellnessCheckReminders non-hourly forward paths gate scheduledTime>=forwardStart so a daily/weekly routine dated tomorrow no longer emits a today (pre-start) occurrence. Hourly paths already clamp (getHourlyAnchor via getScheduleAnchor); ONCE/month-multiple anchor via cadence-date set. +10 tests. (Root of the "today 21:32" premature heads-up: a daily check dated tomorrow leaked a today occurrence whose 1-day heads-up opened yesterday.)
          Fix 4 — per-occurrence early reminders + edit-reset: each series occurrence owns its own `${id}::early` ack (date-stamped ids → Closing one date never affects another — pinned by test). Editing/re-enabling a routine clears its `::early` acks so rescheduled occurrences surface fresh: new web DELETE on /api/health/reminder-dismissals (scoped owner+pet+routine, instance_key LIKE '%::early' only — real skips + history untouched); routinesStore.clearEarlyDismissalsByRoutine awaited in updateRoutine (covers edit AND re-enable, which routes through updateRoutine — single DELETE, no double-fire); RoutinesTab invalidates ['reminder-dismissals',petId] after edit/toggle. Best-effort (failed clear logs, never blocks save). +2 heads-up +5 store +4 web-route tests. Temporary __DEV__ [headsup-debug] block (added to diagnose Fix 4, local commit 3818949) REMOVED in same push (3a6d90e) — final tree clean.
          MERGE REALITY (reconciled Jun 2026 — supersedes any earlier "PR #61 OPEN/carries all" note): PR #61 = base heads-up card + Fix 1 (overdue clamp) — MERGED. PR #63 = Fixes 2/3/4 (Close hide-until-event + forward clamp + edit-reset), the stranded ticket/early-reminder-headsup tail squash-merged — MERGED. PR #62 = #4 body-area collapse — MERGED. PR #64 = #3 routine delete (rebased onto #63; reused main's clearEarlyDismissalsByRoutine(petId,routineId) in routinesStore + the reminder-dismissals DELETE rather than duplicating) — MERGED. main baselines after all four: mobile 551, web 27. BRANCH-HYGIENE LESSON (recorded in memory): ticket/early-reminder-headsup kept accruing commits AFTER PR #60/#61 merged partial snapshots → Fixes 2/3/4 silently stranded, and #3 (built off the incomplete main) rebuilt overlapping pieces (its own clearEarlyDismissalsByRoutine in remindersStore + a dup DELETE handler), reconciled only via a later rebase. RULE reaffirmed: one prompt = one fresh branch off main, MERGE FULLY before the branch grows; verify origin/main actually contains a fix before building on the assumption it does. DEVICE PASS: each fix verified during dev; ONE combined pass on the fully-merged main (heads-up cadences + Close-hide-until-event + edit-reset + routine delete + body-area collapse) [PENDING Tats confirmation]. SECONDARY decisions parked: (a) should Close also cancel the early OS push (currently push still fires; mostly moot since card only appears at earlyTime=push-time); (b) on a daily routine a 1-day lead = perpetual rolling heads-up (literal but noisy — maybe restrict heads-ups to non-daily cadences later); (c) ITEM-level delete persistence (known wellness-item local-only bug) still a follow-up — #64 was ROUTINE-level only.
        (#2-orig NOTIFICATIONS investigation, kept for reference) Run env = Expo Go. CONFIRMED via Expo docs: LOCAL scheduled notifications (what PawPi uses: scheduleReminderNotification in utils/notifications.js → Notifications.scheduleNotificationAsync) DO work in Expo Go on SDK 54 — only REMOTE push was removed — so this is a CODE/permissions bug, not an env wall. Bare Date trigger is fine (auto-coerced to DATE trigger), NOT the cause. Likely causes ranked: (1) permission requested lazily PER-REMINDER inside an Alert (requestNotificationPermissions only called from inside scheduleReminderNotification; the (tabs)/_layout.jsx routine→reminder loop calls it N times → stacked/raced "Enable Reminders" alerts that may never cleanly grant; ungranted ⇒ schedule returns null silently); (2) Expo Go GOTCHA — notifications delivered via the Expo Go app, so iOS permission lives under Settings → Expo Go → Notifications (not "Social Pet"); (3) past-trigger skip drops many instances; (4) no Android channel. NOTE startReminderNotificationSync (reminderNotificationSync.js) only writes IN-APP (bell) notifications, NOT OS ones. FIX PROMPT ISSUED (new CC chat off main after #57): initNotifications() at startup (request perm ONCE + Android setNotificationChannelAsync), make scheduleReminderNotification use a SILENT getPermissionsAsync guard (no per-reminder Alert), __DEV__ log getAllScheduledNotificationsAsync().length + past-skip warns, DEV-only "Send test notification (10s)" button in R&R→Settings, register expo-notifications in app.json plugins (hygiene; only fully applies in a dev build). Branch ticket/local-notifications-fire. NOTE: full own-identity notifications + remote push eventually need a DEV BUILD (Expo Go limits) — flagged for later.
        (#1 early reminder NOT in Health→Today) NOT A BUG — by #55 design the early reminder only moves the OS push, never the instance; event was tomorrow PM w/ "1 day before" so the row correctly sits in R&R Upcoming (future), not Today (today+overdue). Optional PRODUCT change if Tats wants: surface an item in Today once its early-time arrives (deliberate decision, not a fix).
        (#3 delete vs inactive — DONE, PR #64 MERGED) Consistent ROUTINE-level Delete across all types: card-level Delete button (RoutineCard, confirm → "Routine deleted"); soft-delete (deleted_at + is_active=false, GET excludes); deleteRoutine awaits removeFutureRemindersByRoutine + routinesStore.clearEarlyDismissalsByRoutine before refetch (PR #52 ordering), maps deleted_at; isRoutineDeleted guards generateRemindersFromRoutine + generateOverdueInstances + buildOverdueReminders filter; WalkRoutineModal routed through the single store path (killed a double-DELETE→403); past health logs preserved (only routines row touched); pause (is_active) stays distinct from delete. +tests. ITEM-level delete persistence (wellness-item local-only bug) still a FOLLOW-UP.
        (#4 photo Body-area picker too long — DONE, PR #62 MERGED) Collapsed the 8-option Body-area picker into a tappable boxed summary header (collapsed shows "Paws, Ears"/"N selected"/placeholder; multi-select stays OPEN across picks, collapses on 2nd header tap) mirroring ScheduleBlock's boxed Frequency. UI-only, PhotoCheckRoutineModal; emit/save/load untouched; +render test.
    - NEXT — P3: roll ScheduleBlock into each modal + per-type detail fields (P3 ALSO folds in the original modal-consistency goal: standardize all routine modals onto the KeyboardSafeFormModal scaffold, a shared ReminderSettingsCard for the reminder-enabled+time-sensitive toggle pair, and unify CTA colors / section-card styling / spacing — gold standard = SimpleRoutineModal; the 11-modal audit lives in the App-wide UX polish block above), P4 per-type field enhancements (food g/lb; med/supplement dose + titration). TARGET: ONE shared ScheduleBlock (Date inline-calendar → Time → Frequency → Early reminder) across ALL routine modals; per-type detail fields below, enhanced (food amount g/lb; med/supplement dose + dose-changes/titration). DECISIONS: (a) frequency = FULL iOS list incl. Hourly + Once/Never + Every-3/6-Months + Yearly + Custom; (b) Monthly-and-longer anchor on the picked DATE (day-of-month), NOT day-of-week — this resolves the monthly-photo day-picker question; (c) early reminders generalized to ALL routine types via the existing notification layer (reminderTiming → all). FEASIBILITY (verified): notifications already wired (utils/notifications.js, notificationGenerator.js, reminderNotificationSync.js, app/notifications.jsx, expo-notifications in _layout.jsx); reminderTiming lead-time already used by vet + medical. ROUTINE_FREQUENCY already has DAILY/WEEKDAYS/WEEKENDS/WEEKLY/BIWEEKLY/MONTHLY/EVERY_3_MONTHS/EVERY_6_MONTHS/YEARLY/CUSTOM — BUT Every-3/6-Months + Yearly are ENUM-ONLY, NOT generated (generator only handles daily/weekly/biweekly/monthly + weekdays/weekends/custom); HOURLY + Once/non-repeating not defined at all. PHASES: P1 shared ScheduleBlock UI (build on DateField/TimeField from #38); P1b generator support for Hourly/Every-3/6-Months/Yearly + switch Monthly+ to date-anchored + Once/non-repeating (PROTECTED generator path → own commit + tests; branch off main AFTER the Phase-1 cadence branch merges, to avoid generatePhotoCheck*/generateOverduePhotoChecks conflicts); P2 generalize early reminders to all types; P3 roll ScheduleBlock into each modal + keep/enhance per-type detail fields; P4 per-type field enhancements (titration/dose-changes = its own mini-design). ORDER: P1b generator-first (behind tests, their established pattern), then UI.
    - Phase 1 (shared cadence selector — precursor to ScheduleBlock): BUILT on ticket/cadence-frequency-selector (off main @ #43, baseline 226 → 237 w/ +11), NOT YET PUSHED. New CadenceFrequencySelector.jsx + DayChips.jsx adopted in PhotoCheck (both schedule paths, Daily now selectable, per-area recommended hint), Wellness, Simple. KEEPERS regardless of redesign: (i) GENERATOR FIX (commit 06280f5) — DAILY photo did NOT generate daily (both photo paths gated dayOfWeek===preferredDay + advanced +30); fixed to fire every day (mirrors daily wellness rule) — touches protected generator, DEVICE-VERIFY daily photo appears + recurs; (ii) Mon=0 DAY-LABEL BUG — Photo/Simple rendered Sun-first labels against Monday=0 values (tapped chip was a day off from actual fire day); shared DayChips is Mon-first → labels now match stored ints (existing routines will now DISPLAY the corrected day — note in device pass so it doesn't read as a new bug). Monthly-photo day picker now hidden (chips only weekly/biweekly) — left hidden, correct under date-anchored redesign. PR #45 MERGED. Device-pass still PENDING (callouts in PR body): daily-photo recurrence (exercises generator fix 06280f5), Mon=0 label correction (a FIX not a regression — existing weekly routines now DISPLAY the true fire-day), monthly-photo day-picker removal (intentional under date-anchored redesign).

  - Reminders debugging backlog (running list — work after overdue PR1+PR2):
    0. Overdue logging parity: DONE — PR #39 MERGED. On-device 7-step script (in PR body) pending as part of the combined #35/#36/#37/#38/#39 device pass. Root cause: Overdue card called handleComplete with no action; medical_care branch defaulted action="given" and saved silently (medication was the broken type; generic "Log food" button didn't log). Fix: pure routeReminderLog (reminderLogFlow.js) owns per-type decision for ALL completion taps (Overdue/Next Up/countdown cards) — medical opens "How did it go?" ask (given / something off → MedicalCareIssueModal; vaccines: add vet record / completed), wellness→WellnessLogModal, photo→capture, feeding→ask (quick-log payload shared via buildQuickFoodLogPayload). Cancel = no-op by construction. Resolution preserved exactly: givenAt = reminder.scheduledAt (exact-day), wellness values_json.scheduledDate. +16 tests; mobile baseline now 152, web 19.
    0b. Section classification + refresh reclassify: BUILT — PR #41 OPEN, CI green (mobile 181 = 160+21, web 19). Root causes: Due Soon filtered by getReminderStatus (15-min grace, deliberately included OVERDUE) against its own inline new Date(), independent of #35's Overdue derivation — when Overdue dropped a resolved/dismissed instance, overdueIds exclusion lapsed and the stale store copy reappeared in Due Soon; time-sensitive items could show in BOTH Due Soon and Next Up. Refresh reloaded data but addReminderFromRoutine dedupes by id, never removes past instances, no clock advanced. Fix: isPastDue(reminder,now) in reminderResolution.js = THE single boundary (scheduledAt<=now); pure sectionTodayReminders (reminderSections.js) = exactly-one-section invariant; useTodayReminders exposes reactive clock + refreshNow(); handleRefresh calls refreshNow() first. #35/#39 untouched. INTERIM (documented): feeding/walk past-due still shows under Due Soon countdown cards (no Overdue home yet — hiding them would make a missed meal un-loggable); PR2 scope detailed in PR #41 comment: today-only generateOverdueInstances branch for feeding/walk, food/walk-log resolution sources in buildResolutionIndex (food logs lack routine/meal linkage — same gap weight had), midnight age-out. Pending: merge → device script (2-min reminder → Due Soon → tick moves to Overdue → pull-to-refresh shows Overdue → log/Skip clears).
    0c. CRITICAL device finding (after #41): Overdue never renders + past-due items vanish. FORENSIC AUDIT DONE (real Supabase payload → actual pipeline in CEST harness; fixture todayOverdueRealShape.json). #35 residual risk CLEARED — generator emits fine from real shape. ROOT CAUSE: medical resolution over-clears — isInstanceResolved matches routine_id+item_id+LOCAL DAY of given_at, so ANY earlier same-day log (morning "given", even issue_reported) born-resolves every later instance of that item that day; #41 then homes past-due persistent items ONLY in Overdue → in no section at all (#41 unmasked, didn't cause). Wellness path WORKS (June 9 it rendered; 16 dismissals = real usage); photo never shows because NO active photo routine exists + zero photo logs. Secondary: (a) LATENT BUG, backlogged — generator ids embed UTC date of local midnight (one day behind local in UTC+2; DB shows instance_key …-06-01 w/ scheduled_date 06-02); changing id scheme invalidates existing dismissal keys — kept as-is this PR, never derive dates from ids; (b) June 9 phantom-flood dismissal rows = pre-#34 residue, harmless; (c) clamp 5-sec boundary race cosmetic; (d) weight/photo later-clears-earlier heuristic stays (backlog 5). PHASE 2 BUILT — PR #42 OPEN, CI green (mobile 204 = 181+23, web 19). A) per-instance medical resolution: given_at===scheduledAt epoch-compared (+00:00/Z agree); no same-day fallback; UTC-id warning comment at construction site. B) render contract pinned via real-component test HealthToday.overdue.test.jsx (new devDeps @testing-library/react-native + react-test-renderer); header always visible when count>0. C) formatScheduledTime (scheduledTimeFormat.js) on Overdue/Next Up/all 4 Due Soon countdown cards ("8:00 PM"/"Yesterday 8:00 PM"/"Mon 8:00 PM"/"Jun 3, 8:00 PM"). Real-shape fixture + regression test committed (born-resolved bug pinned forever); jest globalSetup pins TZ Europe/Rome. Orphaned med logs 1+2 reported not migrated → today's 17:34 dose WILL appear in Overdue on device (correct; log/skip once). Pending: merge → 7-step device script (incl. repeat-same-day killer test #2; create an active photo routine for step 7). Then PR2 feeding/walk.
    0d. Snoozed section + Today's Progress — INVESTIGATION DONE, GO ISSUED (2 PRs, same CC chat). Findings: snooze = snoozedUntil on store reminder, IN-MEMORY ONLY (restart loses it; pull-to-refresh preserves); sectioning silently drops snoozed (the bug); EXTRA: snoozed persistent items LEAK into Overdue mid-snooze (Overdue built from routines, never sees snoozedUntil — Snoozed must take precedence); vet-appointment Snooze is a silent no-op w/ fake success alert (vet reminders never enter store). "Today's Progress"/Quick Stats = 100% hardcoded strings (HealthToday.jsx:866 — "Fed 2 times" etc., same for every pet). Plan approved: PR1 ticket/snoozed-section — snoozes map keyed by instance id (makes vet snooze real), snooze-wins precedence, Snoozed section between Overdue/Due Soon (scheduled + snoozed-until times, log/skip), dismissedKeys exposed + excluded in sectioning uniformly; PR2 ticket/today-progress (rebases on PR1) — pure buildTodayProgress fed by same instance/resolution/dismissal/snooze/log inputs as sections, categories only when total>0, overdue badge = literal overdue.length, live via reminderNowMs + invalidate incl. food/walk logs; meals/walks done=min(today's logs,total) given no linkage. DECISION: dismissed REMOVED from denominator (Meds 1/1). Snooze DB persistence (reminder_dismissals-style) = named follow-up on backlog. BUILT: PR #43 Snoozed section (mobile 226 = 204+22; snoozes map fixes vet-snooze no-op; snooze outranks ALL sections incl. Overdue; lifecycle pinned) + PR #44 Today's Progress stacked on #43 (mobile 237 = +11; pure buildTodayProgress from same sources; non-obvious fix: store generator only emits FUTURE instances → totals re-derive full day via locked generator pinned to local midnight w/ injectable fromTime; vet via shared ["vet-appointments",petId] cache; overdue badge = passthrough of section list). PR #43 + #44 BOTH MERGED (snoozed + today-progress; Tats merged #44 Jun 2026). main baseline after #44: mobile 237, web 19. Device scripts (in PR bodies) pending as part of the big combined device pass.
    1. DONE (PR #46) — monthly/quarterly/yearly cadence phase-anchored to window start fixed; now anchored to true start date for both forward + overdue. (Biweekly weekly-step still to spot-check, but no longer +30-day phase-anchored.)
    2. Daily medication can spawn many overdue rows within the 30-day lookback — needs a display cap or grouping.
    3. UpcomingTab (Reminders→Upcoming list) not yet rewired to useTodayReminders — still future-only, no overdue shown there. Rewire to the shared hook.
    4. Medical given_at is backdated to the scheduled day for exact-day resolution — refine to store scheduled-day vs actual administration time separately (medical-history accuracy).
    5. Weight/photo resolution uses a date heuristic (one log clears earlier same-type instances in window) — deferred fix: add routine_id + item_index + scheduledDate linkage columns to health_weight_logs / health_photo_checks for exact matching.
    6. Then: More-tab navigation corruption bug (still queued).

  - Then NEXT in testing track: 1c scoping/decision fns (new CC chat, orientation line); then Phase C (ephemeral Postgres round-trip + real authed-route test), Phase D (autonomous fix-until-green). 1c queued behind overdue PR1/PR2 + reminders debugging backlog.

- Feed / Dog Social Profile phase (priority #3) — IN PROGRESS. BASELINES: mobile 589, web 59.
  - Pet-profile stats + daily moments (web): DONE & squash-merged (PR #74). Endpoint already existed (PR #68) — extended /api/pets/[id]/profile rather than duplicating: now accepts pet_id OR handle (numeric segment → pet_id; else resolve handle, leading @ tolerated, handles stored bare; resolved to numeric pet.id BEFORE aggregates so cross-pet isolation is structural) + paginates daily moments (?limit/?offset, clamped [1,60], default 24, mirrors /api/posts). Five real pet-scoped stats confirmed (daily posts, paws, barks, followers, following — NO retired "pet friends" mutual stat). +6 vitest (per-stat source/scope, handle resolution, @-strip, cross-pet isolation, pagination, default window). web 53 → 59. No migration. Header identity fields untouched.
    NOTE for mobile wiring: mobile/src/app/pet-profile.test.jsx already expects real handle/owner/five stats to render → screen may already be partly wired to this contract; mobile prompt likely small (point screen at endpoint + drop mock data). Have CC read that test's expectations first to scope.
  STANDING DECISIONS: follows are one-way (pet_follows, migration 0012; profile shows Followers + Following; private/approval profiles = future); feed scope = followed pets first, then "Suggested" (public, global) so new users never see an empty feed; feed photo tap opens pet PROFILE (not post detail); BeReal daily-lock preserved throughout.
  FUTURE — PRIVATE PROFILES (confirmed wanted by Tats, NOT urgent; defer until after the #2 services push): opt-in private profile so only friends/approved followers see your posts. Needs (a) a pets.visibility column, (b) an APPROVAL-based follow/friend model (today pet_follows is instant + one-way, no approval), (c) UI. NO lock-in from RLS: when built, this feature's ticket updates TWO places — the feed query (see Prompt 4 note: "pets has NO visibility column yet … this query is where it changes") AND the RLS R2b social read policy (posts/pets currently "any authenticated user can read" → change to "public OR viewer is an approved follower/friend"). Both are single-predicate swaps; nothing in current RLS blocks it.
  - Prompt 3 (comments carry pet identity): DONE & MERGED. PR #70 (web) migration 0013 adds post_barks.pet_id (nullable, on delete set null) + idx_post_barks_pet (APPLIED to Supabase & verified); barks GET/POST return pet_id/handle/name/avatar via LEFT JOIN pets (legacy null-pet rows safe); POST requires petId, 400s on missing/non-owned. PR #71 (mobile) useCreateBark sends active pet's petId (no pet → friendly block, no POST); BarkModal + PostDetailModal bark rows use <PetAvatar> neutral fallback + @handle (owner-username fallback for legacy rows); pravatar removed.
  - Prompt 4 (Following + Suggested feed, web): DONE & squash-merged. /api/posts GET now drives Following-first (posts from pets viewerPetId follows via pet_follows.follower_pet_id→followed_pet_id) then Suggested (all pets minus followed + own pet — NOTE: "public" = all pets, since pets has NO visibility column yet; true private/public scoping = future schema ticket, this query is where it changes). Small exported mergeFeed() concats Following ahead of Suggested, de-dupes by post id, slices the page window; each group fetched LIMIT (offset+limit) so pagination stays correct. No viewerPetId → original global feed (preserves no-empty-feed for logged-out/pet-less). Enriched row shape + BeReal POST untouched. +7 vitest (followed-first order, suggested-excludes-followed+own, no-follows-still-non-empty, no-dup-ids, pagination, global path). web 46 → 53. No migration. Resolves the old "global vs friend-scoped" question below.
  - Prompt 4 mobile wiring: DONE & squash-merged (PR #73). useFeedPosts reads active pet via useCurrentPet (usePetProfile), sends viewerPetId query param when a pet is active, omits it when pet-less/loading (→ backend global fallback); viewerPetId added to React Query key so pet-switch refetches + re-scopes; posts returned in endpoint order (no client re-sort). Existing ["posts","feed"]/["posts"] cache mutations are prefix matches → optimistic paw toggles + create-post insertion + BeReal lock untouched; per-post rendering intact. +3 jest. mobile 586 → 589.
  - Pet-profile MOBILE: ALREADY WIRED (no work needed) — verified by reading the repo. pet-profile.jsx → usePetSocialProfile(petId, viewerPetId) → GET /api/pets/[id]/profile (the PR #74 endpoint); renders all 5 real stats + moments grid + optimistic follow/unfollow + empty states, no mock data. Feed tap already navigates router.push("/pet-profile",{petId,...}) (the "photo tap opens profile" decision IS implemented). LATENT from PR #74, non-blocking: (a) moments now default to 24 (was unpaginated) and the screen fetches one page w/ no load-more → a >24-post pet shows only 24 most-recent moments (add infinite scroll later if wanted); (b) handle-based loading now supported server-side but screen always has petId from feed → unused until shareable @handle links exist.
  - So the Dog Social Profile slice is functionally COMPLETE end-to-end (web stats/moments + mobile already consuming). Remaining priority-#3 build item: pet-profile real stats is DONE; next build = decide feed content depth / any divider AFTER device pass.
  - NEXT (build): nothing required for profile.

- Provider / Business phase (NEW — kicked off Jun 2026 w/ Tats) — DESIGN STAGE, own Cowork chat.
  GOAL: a provider/business side that's the go-to for pet businesses; very attractive to join.
  DECISION LOCKED: ONE unified "Provider" account (same access + onboarding for every business
  type), with provider_type driving type-specific modules. Types: VET (flagship — deepest data
  integration), WALKER, DAYCARE/BOARDING, SHOP, GROOMER (trainer/services later). Provider is
  the provider-facing MIRROR of consumer features already built (vet_appointments,
  pet_medical_profiles, vaccination/visit history, vet notes, messaging, reminder engine).
  SHARED across all types: business profile + discovery (in Pet Services/Veterinary sections),
  booking + calendar connect (2-way), payments/deposits (Stripe Connect), client CRM, reviews
  & ratings, chat, analytics dashboard, multi-staff roles, multi-location.
  TYPE-SPECIFIC (examples): Vet = clinical read/write (visit notes, vaccines, Rx, labs,
  treatment plans), telehealth; Walker = GPS walk tracking + walk report back to health logs,
  recurring/pack walks, check-in/out; Daycare/Boarding = check-in/out, capacity, daily report
  cards, vaccine-requirement verification, owner feeding/med instructions; Shop = catalog/
  inventory, Rx products, orders + subscriptions/auto-reorder, loyalty; Groomer = service menu,
  before/after photos to pet profile, coat/skin notes to health logs, recurring cycles.
  CRITICAL ARCH DECISION (settle BEFORE writing provider code): consent / data-sharing grant
  model — owner grants a specific provider SCOPED, REVOCABLE, AUDITED access to a specific pet's
  record for a care relationship. This deliberately crosses the owner→provider boundary, so it
  must not violate the core "no cross-user leak" principle; it's the trust feature.
  "WHY JOIN" HOOKS (the attractiveness): free local demand from existing owners, rich pre-visit
  context, fewer no-shows (deposits + reminders), stickiness (record lives in app), all-in-one,
  reviews flywheel. Demand only works if owner adoption leads.
  MVP LOOP: provider account + discoverable profile → owner books (existing vet_appointments) →
  provider confirms → owner grants scoped record access → provider views shared record + writes
  visit note/vaccination back. Then payments, calendar sync, reviews, telehealth.
  FORKS LOCKED (Jun 2026): (1) Provider = an ENTITY (providers + provider_staff) owned by an
  existing account — NO second login / no separate account, staff are existing users linked via
  provider_staff. (2) Consent = per-(pet↔provider) care_access_grants enforced through ONE
  mandatory assertCareAccess chokepoint + append-only care_access_audit; RLS DEFERRED to a
  pre-launch hardening phase (dedicated non-owner role + SET LOCAL identity + FORCE RLS, proven
  by an as-the-app-role zero-rows test) — explicitly NOT bolted onto the current privileged
  connection. (3) Vet first; booking by EXTENDING vet_appointments (Option 1, single-write, new
  cols named as a forward-compatible subset of a future cross-type provider_bookings). Gap found:
  no vaccination table exists → pet_vaccinations is new.
  CANONICAL SPEC: docs/provider-design.md (each ticket prompt reads it). 8-ticket sequence,
  foundation-first; each = own fresh CC chat + ticket/<name> branch off origin/main; migrations
  hand-applied to Supabase after merge (not auto-applied):
    T1 0014_providers — DONE & APPLIED to Supabase (5 tables verified: providers/
       provider_locations/provider_staff/provider_services/provider_reviews). Schema only.
    T2 0015_care_access — DONE & APPLIED. care_access_grants + care_access_audit +
       assertCareAccess web chokepoint (api/utils/careAccess.js) + 7 vitest (membership/grant/
       scope/expiry/revoke/cross-provider). Helper verified by me: Postgres does all filtering →
       any denial = no row. web 66.
    T3 0016_vaccinations_and_booking — DONE & APPLIED. new pet_vaccinations (soft-delete) +
       vet_appointments extended w/ nullable provider_id/location_id/service_id/staff_user_id/
       booking_status/source (+ added idx_vet_appointments_provider_id on my rec; existing cols +
       reminder engine untouched). booking_status/source are free-text (no CHECK yet — T6 adds it
       once value set locked). Schema only.
    T4 Provider onboarding + profile (web) — DONE, split 4a/4b/4c, all squash-merged, API+vitest
       only (no UI yet, no migration). 4a: requireProviderRole helper (api/utils/providerAuth.js,
       owner|admin default) + POST/GET providers (atomic provider+owner-staff CTE) + PATCH profile
       + POST publish. 4b: locations CRUD (hard delete) + services CRUD (soft delete via active);
       hours_json via sql.json; cross-provider isolation = WHERE id AND provider_id → 404. 4c:
       staff invite (by unique username; role≠owner; removed→re-invite) + accept (invitee-self
       auth, the ONE route not using requireProviderRole) + DELETE soft-remove (owner unremovable)
       + PATCH role (can't set/change owner). web 66 → 147.
       CLEANUP PENDING (own small PR before/around T5): resolveUserId + the small validators are
       duplicated across every provider route file — hoist into a shared api/utils helper.
    T5 Discovery — DONE & squash-merged. Two NEW public published-only routes (distinct from 4a's
       membership-gated GET): GET /api/providers/discover (published only, ?type= filter, public
       fields id/slug/name/provider_type/bio/logo_url, 401 if unauth) + GET /api/providers/public/
       [slug] (one published provider + locations + active services only; draft→404). NO staff/
       owner/pet data; tests assert SQL never touches care_access/provider_staff/owner_user_profile_id.
       No resolveUserId (public read, session-only). Dropped optional city/area (no such column).
       +11 vitest. web 156 → 167. No migration. (Cleanup dedup PR landed before this: web 147→156,
       resolveUserId→api/utils/currentUser.js, validators→providerValidation.js, also folded in
       publish/route.js inline copy.) Reviews surfacing still deferred (later layer).
    T6 Booking — DONE, split 6a/6b, squash-merged. 6a (owner side, + migration 0017 APPLIED:
       CHECK booking_status null|requested|confirmed|declined|cancelled + source null|owner|provider):
       POST /api/providers/[id]/book — pet-owner books a PUBLISHED provider; validates pet ownership
       (403), published provider (404), service/location belong to provider+active (400); inserts
       vet_appointments w/ provider_id/source='owner'/booking_status='requested'/status='scheduled',
       title derived (body→service name→"Appointment with <provider>"), reminder_enabled left at
       default. Owner GET /api/vet-appointments widened additively to surface the booking columns.
       6b (provider side, no migration): GET /api/providers/[id]/bookings inbox (any active staff;
       booking-context joins ONLY — pet name/owner name/service name, NO medical tables, asserted in
       tests; no assertCareAccess) + PATCH /api/providers/[id]/bookings/[appointmentId] actions
       confirm (requested→confirmed, reminders untouched) / decline (→declined + status=cancelled +
       reminder_enabled=false) / cancel / assign (staff_user_id must be active staff). Cross-provider
       isolation WHERE id AND provider_id → 404. REMINDER DECISION LOCKED: reminders fire on
       'requested'; decline/cancel turn reminder_enabled off + status=cancelled. web 167 → 198.
    T8 Clinical read/write — DONE (built, web 198→214, squash-merged). Provider routes gated SOLELY
       by assertCareAccess (no requireProviderRole): GET /api/providers/[id]/pets/[petId]/record
       (medical_read → pet_medical_profiles+vet_notes+pet_vaccinations) + POST .../notes
       (medical_write → vet_notes) + POST .../vaccinations (vaccinations_write → pet_vaccinations w/
       administered_by_provider_id) + owner GET /api/pet-vaccinations?petId. Helper owns audit;
       revoke = instant 403. No migration. vet_name defaults staff full_name/username→provider name.
    T7 Grant flow (trust UI) — DONE (built out-of-order after T8 once the skip was caught; web
       214→241; squash-merged). POST /api/providers/[id]/access-requests (active staff request:
       scope-set validation→400, owner_user_id from pet→404, bookingId vs (provider,pet)→400,
       pending|active dedup→409, inserts requested_by='provider' status='pending') + GET
       /api/care-access/grants (owner view, WHERE owner_user_id=me, provider+pet names, ?petId/
       ?status filters) + PATCH /api/care-access/grants/[grantId] (owner approve pending→active
       +granted_at/optional expiresAt; deny pending→revoked; revoke active→revoked; illegal
       source→409; not-mine→404). NO care_access_audit rows for lifecycle (asserted). Instant
       revoke (assertCareAccess only honors active). No migration.
       NOTE: GET filter uses inline ::int/::text casts in (${f} IS NULL OR col = ${f}) rather than
       branch-per-variant — tests mock sql so the cast isn't exercised against real PG; eyeball the
       ?petId/?status filters in an integration/device pass.

  ★ PROVIDER/VET MVP FOUNDATION COMPLETE (T1–T8 all merged; web baseline 241). End-to-end:
    onboard→discover→book→confirm→request consent→approve→audited revocable clinical read/write.
    NEXT LAYERS (deferred, each its own ticket/chat): (a) vaccination reconciliation — make
    pet_vaccinations the single source of truth + route medical-care "Vaccine" routine completions
    into it (existing-system surgery — its own design pass); (b) provider-facing UI (web dashboard
    or mobile) wiring all these routes; (c) owner-facing UI for discovery/booking/grants in Pet
    Services/Veterinary; (d) payments/Stripe Connect; (e) reviews surfacing; (f) telehealth;
    (g) other provider types (walker/daycare/shop/groomer) on the same spine; (h) RLS hardening
    (pre-launch, before real medical data — see §5: dedicated non-owner role + SET LOCAL + FORCE
    RLS, proven by an as-the-app-role zero-rows test).
    TESTING POSTURE (DECISION, Tats Jun 2026): all provider work so far is web API + vitest only —
    NONE tested on device/live Supabase yet. On-device/live end-to-end verification of the provider
    loop is DEFERRED to the future by choice — keep building layers now; do not gate the next layer
    on a device pass. (Still-owed older device passes — feed/profile/barks, reminders #61–64,
    MedicalCare P3 — also remain deferred.) Revisit before real users / real medical data.
    T4–T8 order LOCKED, detailed prompts written just-in-time after T2/T3 land.

  ── POST-FOUNDATION PROGRESS (Jun 2026, Cowork-driven). NOTE: the letter scheme in this block
     differs from the ★ NEXT LAYERS list above — tracked BY NAME here to avoid confusion.
     • Vaccination reconciliation (the WATCH-ITEM / ★ layer (a)) — DONE & MERGED, PR #87
       (ticket/vaccination-reconciliation). pet_vaccinations is now the SINGLE SOURCE OF TRUTH for
       vaccination history: owner medical-care "Vaccine" completions WRITE THROUGH into
       pet_vaccinations in the SAME request that writes the health_medical_care_logs row — the log is
       untouched (still the reminder-RESOLUTION ledger; reminder engine NOT changed). Idempotent via
       new pet_vaccinations.source_medical_care_log_id (+ unique partial index) + source col;
       provider writes already landed there. vet-record summary vaccines count switched to
       pet_vaccinations. Administered set = status IN ('given','completed') (read from
       reminderLogFlow.js). Count semantics INTENTIONALLY changed (counts events, not distinct routine
       items). Migration 0018_vaccination_reconciliation.sql APPLIED to Supabase by hand Jun 15 2026
       (backfill verified: owner rows present, re-run inserts 0). web 241 → 252.
       FOLLOW-UPS (in PR #87 body, NOT done): mobile HealthVetRecord "Vaccination History" is still
       count+empty-state only → wire it to LIST GET /api/pet-vaccinations; health/timeline still reads
       vaccines from medical-care logs (decide keep-as-event vs switch); expires_on/lot capture in the
       owner routine flow.
     • OWNER-FACING UI (★ layer (c)) — COMPLETE end-to-end (mobile, Expo/Jest; no migrations):
         d1 discovery + booking — DONE & MERGED, PR #88 (ticket/owner-ui-discovery-booking). Replaced
         the mock more/vet.jsx with real GET /api/providers/discover?type=vet → provider profile
         GET /api/providers/public/[slug] → POST /api/providers/[id]/book for the active pet; the
         booking surfaces via the existing ["vet-appointments",petId] / ["vet-appointment-reminders",
         petId] queries (invalidated on success). Reuses shared DateField/TimeField (canonical
         YYYY-MM-DD/HH:MM = what /book expects). New more/provider.jsx + components/Providers/
         BookingFormModal.jsx + hooks/useProviders.js. mock VETS removed (mockData.js kept — adopt/
         shop/etc still use it). mobile 589 → 603 (+14).
         d2 trust UI — DONE & MERGED, PR #89 (ticket/owner-ui-grants). New more/data-access.jsx
         (pet-scoped via useCurrentPet): "Pending requests" Approve/Deny + "Who has access" Revoke,
         GET /api/care-access/grants?petId / PATCH .../[grantId] {action:approve|deny|revoke}. Revoke
         IS the PATCH (there is NO DELETE route). "expired" is DERIVED (status='active' + past
         expires_at) and excluded from the active list. Human-readable scope labels. Wired into the
         HealthVetRecord "Share" button (replaced its "Coming Soon" Alert; Access-Control copy kept).
         hooks/useCareAccessGrants.js. mobile 603 → 620 (+17).
       NET: owner can now discover → book → approve/deny → revoke → who-has-access, end to end
       (mobile, jest-green; on-device pass still DEFERRED by decision).
     • PROVIDER-FACING UI (★ layer (b)) — COMPLETE end-to-end (WEB dashboard; no migrations, all
       frontend except one additive read endpoint in c2c). PLATFORM DECISION (Tats): WEB-primary
       (clearer for clinical history / sales / appointments / chats); mobile provider companion is a
       LATER want. Reality check that lowered the lift: apps/web is NOT greenfield — it's a full
       React Router v7 app with auth (SessionProvider/useAuth), a global fetch override (relative
       /api works), @tanstack/react-query + @tanstack/react-table, Tailwind, Stripe, recharts all
       installed → building (c) = ADDING page.jsx routes under src/app/provider/, not scaffolding.
       Component tests run under the root jsdom vitest.config.ts (no extra config). Sub-tickets:
         c1 foundation + bookings inbox — DONE & MERGED, PR #88-area (branch
            ticket/provider-web-dashboard-bookings; squash). src/app/provider/ shell (auth gate →
            provider context via GET /api/providers [active-staff providers] → 0/1/many switcher,
            persisted zustand selection), nav (only Bookings active, rest stubs), QueryClient
            singleton, lib/colors.js. Bookings inbox = @tanstack/react-table over GET /api/providers/
            [id]/bookings (booking-context only, NO medical tables) + confirm/decline/cancel/assign via
            PATCH …/bookings/[appt]. web 252 → 272 (+20).
         c2a onboarding + profile + publish — DONE & MERGED (branch ticket/provider-web-profile;
            squash, PR #91). useCreateProvider/useProvider/useUpdateProviderProfile/useSetProviderStatus.
            CreateProviderForm replaced c1's "no provider yet" stub (POST /api/providers → draft +
            owner staff). Profile screen edits whitelist {name,provider_type,bio,logo_url,slug} (PATCH,
            409 slug-in-use) + Publish/Unpublish (POST /publish {status}). PUBLISH is what makes a
            provider appear in owner discovery. web 272 → 287 (+15).
         c2b services + locations — DONE & MERGED (branch ticket/provider-web-services-locations;
            squash, PR #92 d2c9cf4). Services CRUD = SOFT delete (active flag, deactivate/reactivate);
            Locations CRUD = HARD delete (row removed, appts unlinked via FK SET NULL). money in cents,
            hours_json jsonb (per-weekday editor), lib/money.js + lib/hours.js. web 287 → 326 (+39).
         c2c staff — DONE & MERGED (branch ticket/provider-web-staff; squash, PR #93 8097c2a). ONE
            additive read endpoint added: GET /api/providers/[id]/staff (LEFT JOIN user_profiles for
            username/full_name/avatar_url; ALL_PROVIDER_ROLES) — existing routes/tests untouched.
            Invite-by-username (admin/staff/vet; owner never invitable; removed→re-invite), role
            change (owner immutable), soft-remove (owner unremovable). Bookings "Assign" upgraded from
            raw id → staff picker by name + assigned-column name map. web 326 → 349 (+23, +1 file).
            DEFERRED→RESOLVED by QW2 (PR #95, see below): invitee ACCEPT/DECLINE UI now shipped.
         c3 clinical — DONE & MERGED (branch ticket/provider-web-clinical; squash, PR #94 a466ff4).
            Frontend-only; pet medical data ONLY through the 4 assertCareAccess-gated routes. 403 is a
            FIRST-CLASS state (usePetRecord disables retry on 403): 403→Request access (POST
            …/access-requests {petId,scopes:[medical_read,medical_write,vaccinations_write],bookingId})
            →pending (owner approves in mobile d2)→granted→view record (pet_medical_profiles + vet_notes
            + pet_vaccinations) + write note (POST …/notes) / vaccination (POST …/vaccinations, lands in
            the owner-visible pet_vaccinations SSOT). Mid-session revoke (403 after load) falls back to
            the request panel. Entry = per-booking "Open record"; Clinical index lists distinct pets
            from bookings (no medical data until the gated record opens). web 349 → 372 (+23, +2 files).
         QW2 staff-accept — DONE & MERGED (branch ticket/provider-web-staff-accept; squash, PR #95
            8ef8457). Closes the c2c gap. ONE additive endpoint GET /api/provider-invites (caller's own
            status='invited' rows, LEFT JOIN providers for name/type/logo+role; self-scoped via WHERE
            user_profile_id = me, NOT requireProviderRole — same reasoning as the accept route; no
            migration). Hooks useMyProviderInvites (["provider-invites"]) + useRespondToInvite (POSTs the
            existing POST …/staff/accept, optional {action:'decline'}; invalidates ["provider-invites"] +
            ["providers"]). New /provider/invites page (ProviderInvites.jsx) — Accept/Decline, gated on
            SESSION ONLY (not the active-provider gate; an invited user has no active provider). Discovery
            pointer added to ProviderShell's no-provider state. web 372 → 391 (+19, +2 files).
       NET: provider/vet MVP is usable END-TO-END in the UI — onboard → publish → (owner) discover →
       book → (provider) confirm → request consent → (owner) approve → audited, revocable clinical
       read/write; invited staff can now discover + accept their invites. CURRENT BASELINES: web 391,
       mobile 620. (Web UI is vitest-green; device pass DEFERRED by decision.)
     • RLS HARDENING (pre-launch, BEFORE real medical data — docs/provider-design.md §5 +
       docs/rls-hardening.md) — IN PROGRESS, a 4-phase arc (dedicated non-owner role + SET LOCAL
       identity + FORCE RLS, proven by as-the-app-role zero-rows tests). NOT a vitest-mock change — it
       needs a real Postgres, so it brought its own harness. TWO-SUITE CANARY now: `npm test` (mocked
       unit) = the PR gate (391); `npm run test:integration` (real embedded-postgres) = the RLS proofs
       (grows separately). Phases:
         R0 real-Postgres integration harness — DONE & MERGED (#97). embedded-postgres (PG18, real
            binary, NO Docker — NOTE prod Supabase is PG15; version gap is benign for schema/RLS but
            watch it), applies all migrations, real `sql`, separate CI job; first tests = owner-scoping
            round-trip + jsonb double-encode catch. (= the long-deferred TESTING_AND_CI_PLAN Phase C.)
         R1 per-request identity, NO enforcement — DONE & MERGED (#98). withRequestContext opens a txn
            + set_config('app.current_user_id', id, true) (txn-local → auto-resets, no cross-request
            leak, proven); exported `sql` is a Proxy delegating to the active request txn (ALS) else the
            global pool (untouched routes byte-identical). Applied to a PILOT only (pets GET/POST/PATCH
            + providers GET/POST). Anti-leak + proxy-fidelity + a throwaway-table FORCE-RLS zero-rows
            capability smoke all green. STILL privileged role, NO real-table policies.
         R2 the actual policies + the pawpi_app non-owner role — IN PROGRESS, SPLIT BY TABLE-GROUP, each
            harness-proven. ⚠️ R2 migrations are HARNESS-ONLY — NOT hand-applied to Supabase. FORCE RLS
            in prod before the R3 cutover would lock out the (still privileged-role) non-identity routes
            = outage. R3 applies them all WITH the role switch. R2a (pawpi_app role + current_app_user_id()
            + SECURITY-DEFINER grant/booking helpers + pets policies: owner OR provider-with-active-grant
            OR provider-with-booking) = DONE (branch ticket/rls-r2a-pets). Migrations 0019 (role +
            current_app_user_id()/app_provider_has_grant/app_provider_has_booking, SECURITY DEFINER +
            pinned search_path) + 0020 (pets ENABLE/FORCE RLS, pets_owner_all + pets_provider_read).
            HARNESS-ONLY (NOT applied to Supabase). Proven as pawpi_app in pets-rls.integration.test.ts
            (integration 15 → 29; unit gate 391 unchanged). R2a KNOWN GAP (public/social pet-profile
            read broader than the 3 predicates) → CLOSED by R2b (below).
         R2b (SOCIAL / public-read group: posts, post_paws, post_barks, pet_follows, pet_friendships)
            = DONE (branch ticket/rls-r2b-social). Migration 0021. The framework: PawPi is social →
            these tables are READ by ANY authenticated user (current_app_user_id() IS NOT NULL) but
            WRITTEN only by the actor (user_id = me). Also CORRECTS the R2a pets read rule: DROP
            pets_provider_read (subsumed) + add pets_authed_read (any authed) → pets read = any authed,
            write = owner only (closes the R2a gap; feed JOIN pets + profile reads survive FORCE RLS).
            pet_follows write = owner-of-follower (EXISTS pets, no SECURITY DEFINER — own pet visible
            via pets_owner_all). pet_friendships = participant-scoped read+write (no write route today;
            safe default). grant/booking helpers UNTOUCHED (they gate the MEDICAL tables in R2c).
            HARNESS-ONLY (NOT applied to Supabase). Proven as pawpi_app in social-rls.integration.test.ts
            + updated pets-rls (integration 29 → 49; unit gate 391 unchanged).
         R2c (OWNER-ONLY PRIVATE group: the 12 health_* logs; pet_allergies/conditions/lab_results/
            surgeries; vet_documents; routines; reminder_dismissals — 19 tables) = DONE (branch
            ticket/rls-r2c-owner-private). Migration 0022. UNIFORM single FOR ALL policy per table
            (USING/WITH CHECK owner_user_id = current_app_user_id()), applied in a DO/FOREACH loop. The
            OPPOSITE of R2b: NO any-authed read, NO provider access on ANY of these tables today. Headline
            proof = PROVIDER-WITH-GRANT EXCLUSION: a provider-staff user WITH an active medical_read grant
            for the pet still reads/writes ZERO rows (the grant/booking helpers gate the R2d medical-record
            tables, NOT these). Future-provider note: care-access scopes health_logs_read/_write are
            reserved for a future provider type; no route grants providers health_* access today, so
            owner-only NOW (that feature's ticket adds the branch). HARNESS-ONLY (NOT applied to Supabase).
            Proven as pawpi_app in owner-private-rls.integration.test.ts incl. a catalog check (every table
            ENABLE+FORCE RLS + owner policy present) (integration 49 → 58; unit gate 391 unchanged).
         R2d (PROVIDER-ACCESSIBLE records: pet_medical_profiles, vet_notes, pet_vaccinations, vet_appointments)
            = DONE (branch ticket/rls-r2d-medical). Migration 0023. The group where provider access is REAL,
            so READ vs WRITE scopes DIFFER → PER-COMMAND policies (owner FOR ALL + narrow provider command
            policies), NOT R2c's single FOR ALL. Mirrors the routes EXACTLY: pet_medical_profiles SELECT owner
            OR grant(medical_read), writes owner only; vet_notes SELECT medical_read + INSERT medical_write,
            UPDATE/DELETE owner only; pet_vaccinations SELECT medical_read + INSERT vaccinations_write (owner
            write-through INSERT preserved), UPDATE/DELETE owner only — all via app_provider_has_grant(pet_id,
            scope). vet_appointments HYBRID = SELECT/UPDATE owner OR active-staff-of-the-row's-provider_id
            (booking inbox/actions, by STAFF MEMBERSHIP not a grant), INSERT/DELETE owner only; NEW SECURITY
            DEFINER helper app_is_active_staff_of(provider_id) (pinned search_path, reused-pattern from 0019;
            DEFINER so R2e's provider_staff RLS won't re-filter/recurse). HARNESS-ONLY (NOT applied to
            Supabase). Proven as pawpi_app in provider-records-rls.integration.test.ts incl. grant lifecycle
            (revoke/expire/inactive-staff → zero), grant-vs-membership distinction, + a catalog check
            (integration 58 → 81; unit gate 391 unchanged).
         R2e (PROVIDER/BUSINESS entity tables: providers, provider_staff, provider_services,
            provider_locations, provider_reviews — 5 tables) = DONE (branch ticket/rls-r2e-provider).
            Migration 0024. Access by provider-STAFF MEMBERSHIP with a PUBLISHED-discovery public-read
            window. Mirrors the routes EXACTLY: providers SELECT published OR owner OR active-staff(id),
            INSERT owner_user_profile_id=me, UPDATE owner|admin (publish/profile), DELETE owner.
            provider_staff SELECT active-staff(provider_id) OR my own row (powers /provider-invites),
            INSERT BOOTSTRAP (the create CTE's owner row, gated by membership-ABSENCE — snapshot-safe,
            since ownership-by-EXISTS can't see the sibling INSERT in the same CTE) OR INVITE (owner|admin
            → admin/staff/vet), UPDATE self-accept OR owner|admin, no hard DELETE. services/locations =
            two-tier (admin FOR ALL + public read of a published provider's active services / all
            locations). reviews = owner(reviewer)-scoped FOR ALL (reviews-surfacing deferred → that
            feature updates the SELECT policy). TWO NEW SECURITY DEFINER helpers: app_is_provider_admin
            (owner|admin gate, mirrors requireProviderRole) + app_provider_has_active_staff (the bootstrap
            absence-gate). RECURSION RE-PROOF: provider_staff is now FORCE-RLS'd, yet the 0019/0023 DEFINER
            helpers reading it still bypass that RLS (DEFINER) — the full R2a–R2d suite staying green is the
            proof, plus explicit helper-under-FORCE assertions. HARNESS-ONLY (NOT applied to Supabase).
            Proven as pawpi_app in provider-business-rls.integration.test.ts incl. the real bootstrap CTE +
            a catalog check (integration 81 → 109; unit gate 391 unchanged).
         R2f (CONSENT LEDGER: care_access_grants, care_access_audit) = DONE (0025, harness-only). grants
            SELECT owner OR active-staff-of-provider (the staff branch is REQUIRED — the access-request
            INSERT…RETURNING * snapshot AND the direct assertCareAccess grant SELECT both need it, NOT
            owner-only as first scoped), INSERT active staff requesting (app_is_active_staff_of + requested_by
            ='provider'; owner never inserts), UPDATE owner-only (approve/deny/revoke; provider cannot),
            DELETE none (status-flipped, never deleted). audit append-only (INSERT staff_user_id=me; no
            SELECT/UPDATE/DELETE → zero for all under FORCE; future audit-review adds the SELECT policy).
            No new helper (reused 0023's app_is_active_staff_of). ⚠️ app_provider_has_grant (DEFINER) READS
            care_access_grants → recursion RE-PROVEN: full R2a–R2e suite green + explicit helper-under-FORCE
            assertion + live revoke→zero cross-check. HARNESS-ONLY (NOT applied to Supabase). Proven in
            care-access-rls.integration.test.ts (integration 109 → 130; unit gate 391 unchanged). ⇒ R2 POLICY
            WORK COMPLETE — every real table FORCE-RLS'd.
         R1-rollout = DONE (#106): withRequestContext on all DB-touching routes (59 total); static
            completeness meta-test guards regressions; 5 sql-free routes intentionally unwrapped.
         R2g (CUTOVER GAP CLOSURE: 0026, harness-only, branch ticket/rls-r2g-gap-closure) = DONE. R3 had
            STARTED (0019–0025 applied to live Supabase); a policy-count check there found 7 tables RLS-
            ENABLED-but-ZERO-POLICY (Supabase's own setup enabled RLS; our migrations never did — so the
            embedded-postgres harness has them OFF and never reproduced it). 0026 closes the gap two ways:
            (1) DISABLE RLS on the 5 auth/identity infra tables (auth_users/auth_accounts/auth_sessions/
            auth_verification_token/user_profiles) — RLS-EXEMPT by necessity, the app reads them BEFORE
            app.current_user_id exists (resolveUserId + Auth.js adapter), so they can't be gated on it;
            (2) ENABLE+FORCE + policies on social_walks (read=any-authed discovery, write=owner) +
            social_walk_join_requests (SELECT own-OR-approved-OR-walk-owner, INSERT requester, UPDATE walk
            owner, DELETE none), mirroring src/app/api/social-walks/** routes. Plus a COMPLETENESS GUARD
            (rls-gap-closure.integration.test.ts) asserting every public base table is ENABLE+FORCE+≥1 policy
            OR in a documented RLS_EXEMPT allowlist — locks the invariant so the gap can't recur. HARNESS-ONLY
            (NOT applied to Supabase). integration 130 → 148; unit gate 394 unchanged.
         R3 CUTOVER (the ONLY step that touches prod): apply ALL R2 migrations to Supabase (0019–0026) +
            re-run the policy-count check (R2g gap → zero) + switch DATABASE_URL to pawpi_app + full
            cross-boundary sweep. RESUMES once 0026 is applied to Supabase.
     ── PRIORITY ORDER (Tats, Jun 2026): (1) FINISH RLS (above, IN PROGRESS) → (2) SERVICES END-TO-END
        + DISCOVERY/NAV/FEED (TOP priority, below) → then the unranked LATER layers → anonymized
        analytics is LOW/future (no real data yet — not a now-problem).
     • ★ PRIORITY #2 (TOP, right after RLS) — ALL PROVIDER TYPES END-TO-END + OWNER-FACING SURFACING:
       (a) BUILD every business type fully on the same provider spine — VET is done end-to-end; build
       WALKER, DAYCARE/BOARDING, SHOP, GROOMER (provider_type drives type-specific modules; reuse
       onboarding/profile/services/locations/staff + discovery/booking/grants; add the type-specific
       bits per docs/provider-design.md "TYPE-SPECIFIC"). (b) OWNER-FACING SURFACING/NAV: today services
       are buried under More → Pet Services (Veterinary REAL post-d1; Adoption + Pet Shop still MOCK
       until their types ship). Promote "Pet Services" to a quick-access section on the main nav/buttons,
       likely move Community into More to make room. (c) FEED: surface businesses/services in the feed
       (own design+build). SEQUENCING: prominent entries should point ONLY at provider types that are
       actually live — build the type, then surface it (no featuring mock sections). This is the big
       push after RLS.
     • LATER (unranked, each its own backend-first effort, none started): payments/Stripe Connect →
       provider Sales screen; messaging → provider+owner Chats; reviews surfacing; telehealth;
       vaccination-reconciliation residue (QW1 #96 did the Vaccination-History LIST; STILL OPEN:
       health/timeline vaccine source decision + expires_on/lot capture in the owner routine flow).
     • LOW / FUTURE (NOT a now-problem — there is NO real data yet) — ANONYMIZED ANALYTICS / PREDICTIONS:
       aggregate data across pets/owners/vets for predictions + enhanced suggestions (owners + vets).
       RLS does NOT block this — it only governs the per-user request path. When we get there, build as
       a SEPARATE path: a distinct read-only analytics role / read-replica / warehouse (NOT the per-user
       pawpi_app path, which would limit to one user) + an ETL that TRULY anonymizes (de-identify/
       aggregate; pseudonymized = IDs kept = still personal/health data legally) + an EXPLICIT opt-in
       consent DISTINCT from care_access_grants + a privacy-policy basis.

  WATCH-ITEM — RESOLVED (PR #87; migration 0018 applied Jun 15 2026; see POST-FOUNDATION PROGRESS
  above): reconcile pet_vaccinations with the EXISTING medical-care
  "Vaccine" care-type logs that were meant to feed Vet Record "Vaccination History" — make
  pet_vaccinations the single source of truth and have medical-care vaccine completions write into
  it, or we end up with two vaccination stores. Optional small follow-up: labeled "Suggested" divider between Following and Suggested groups — NOT possible with current contract (endpoint returns one flat merged posts array, no boundary marker); needs the endpoint to mark where Following ends (per-post group flag or split payload) + mobile render. Decide after device pass whether the blended feed even needs a visible divider.
  - TESTING DEBT: entire Feed/Profile feature incl. barks 3a+3b + Prompt 4 (web ordering + mobile wiring) is jest/vitest-only, UNTESTED on device — queued for ONE device session on stable wifi. Verify: normal bark w/ active pet works, @handle + avatar show, legacy null rows don't crash; feed shows followed-first then suggested; pet switch re-scopes feed; pet-less viewer still gets a non-empty feed; photo tap opens profile.

Deferred (priority #3): pet-profile real stats + daily moments by pet_id/handle. (Feed global-vs-friend-scoped decision RESOLVED — see Prompt 4 above: followed-first + suggested-global.)
Deferred (Ticket 6): Insights on real pet-scoped data; wellness events → Health timeline follow-up lives here.
Deferred (Ticket 8): neutral Dog-icon avatar fallback for missing avatar_url in PostDetailModal bark list; ~13 hardcoded "Phoebe" strings.
QUEUED — Vet Summary real-data rebuild (priority #2 = Vet Record data-driven; its OWN CC chat, scheduled AFTER the reminders redesign): Health → Vet Record → "Create Vet Summary" (VetSummary/VetSummaryModal.jsx) is CURRENTLY 100% FAKE — renders a hardcoded mockSummaryData object (fake main concerns, food/water logs, vomiting events, meds, photo checks, timeline), takes NO petId, fetches nothing; "Download PDF" + "Share with Vet" buttons are dead. Directly violates the No-fake-data rule + priority #2. Rebuild = new aggregation endpoint pulling ALL health data for a chosen date range (food/water logs, poo/pee/vomit, weight, wellness logs, medical-care logs, photo checks by body area, walks/activity, allergies/conditions/current meds, vet notes) scoped by pet_id/owner_user_id + rewire modal to real data + wire PDF/share + keep "user-added questions for vet" + keep the not-a-diagnosis disclaimer. NOTE: existing /api/vet-record/summary/route.js returns only COUNTS for the Vet Record dashboard — it is NOT the summary content; the summary needs its own date-ranged aggregation route.
Phase C check (vet reminders end-to-end): routinesStore.loadRoutines may not map vet_appointment_schedule into the fields the vet generator reads. Confirm in Phase C.
Cleanup: remove/gate the wrongPets debug query in pets/route.js:80-99.

Dev-env note: mobile API base URL is EXPO_PUBLIC_BASE_URL in anything/apps/mobile/.env (NOT EXPO_PUBLIC_API_URL). DHCP LAN IP — update after wifi/IP change (ipconfig getifaddr en0), restart Expo with --clear. EXPO_PUBLIC_BASE_URL/PROXY_BASE_URL/HOST all 192.168.178.183:4000.