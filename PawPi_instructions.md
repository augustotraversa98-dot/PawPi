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

## Current status

This block is intentionally SHORT. The per-PR status log used to live here and drifted out
of date — so live status now lives in the docs Code keeps current every merge. Read those,
not a hand-maintained log here:

- `docs/roadmap.md` — live build queue + status mirror (Code updates it on every merge).
- `docs/test-backlog.md` — migrations (applied vs pending) + the device-test queue + the
  go-live action list (env keys, pawpi_app password).
- `docs/phase2-tickets/00-README.md` — the ticket archive + build order + shared conventions
  (Waves 1–5).
- `docs/phase2-superapp-master-plan.md` + `docs/provider-design.md` — strategy + provider/RLS spec.
- `ARCHITECTURE.md`, `supabase/SCHEMA_NOTES.md`, `docs/rls-hardening.md` — architecture / schema /
  RLS orientation (Code-maintained).

### Snapshot (2026-07-29) — CURRENT

**The app is feature-complete for v1 and is in the App Store submission phase.** Every build wave and
both cross-cutting phases (UGC moderation, the 2.77 redesign) are merged. What remains is submission
logistics + go-live keys, not feature work.

**Night-run 2026-07-29 (unattended, tickets N1–N10 in `docs/phase2-tickets/`, order/detail in
`docs/night-run-2026-07-29.md`, one-line-per-merge scan in `docs/night-run-log.md`) — COMPLETE.**
N1 (address autofill on the shared map picker), N2 (retired the dead `PATCH /api/pets` repair handler +
`RepairPetsButton.jsx`), N3 (adoption screen restyled to Liquid Glass — the one screen 2.77 left out),
N4 (medical-profile sex/gender selector case-mismatch fix), N5 (payments degrade-clean audit + rewrote
the go-live runbook), N6 (Apple Sign-in's client-secret JWT now generated from key material instead of
a static string that would've silently expired), N7 (support page confirmed live at the github.io URL;
resolved 2026-07-31 by pointing the ASC content pack's Support URL field there directly since
`pawpi.info` itself still has no hosting — see `docs/app-store-readiness.md` FLAGGED #5), N8 (iOS Simulator self-verify pass — caught and fixed a missed merge on N4;
documented honestly that the historical device-test backlog wasn't swept due to Simulator tap-injection
flakiness this session), and N9 (docs hygiene) all merged. **N10 (widget PR #187 rebase) is
deliberately NOT merged** — rebased the ~40-day-stale branch cleanly onto `main` (CI-green, structural
parity confirmed, `expo prebuild` generates both native targets), but left it open per its own explicit
gate: needs Tats' Apple Developer account setup + on-device acceptance pass before merge — see
`docs/native-widgets.md`. One real bug found and flagged (not fixed, out of scope): the Edit Medical
Profile screen's Save button is a pre-existing no-op from the 2.77 restyle (prop-name mismatch) —
spawned as its own follow-up task. See `docs/night-run-log.md` for full per-PR detail.

- **Production is LIVE.** Web/API deployed to **Railway** (`https://pawpi-production.up.railway.app`),
  database on Supabase, and the mobile app points at it.
- **Live DB is at migration `0068` — NOTHING PENDING.** Verified directly against production
  2026-07-28. (Docs elsewhere that still say "0067 PENDING" are stale; 0067 and 0068 are both applied.)
- **Test baselines (2026-07-29, post night-run): mobile jest 1195 · web vitest 1377 · integration 663.**
- **Self-service password reset — ✅ BUILT (2026-07-28).** `/account/forgot-password` is no longer a
  stub. Full flow: request a link → single-use 30-minute token (**migration 0069**, ⏳ the one pending
  migration) → emailed link → a "set a new password" screen → the shared 2.32 strength rule + argon2 →
  the token and the account's other outstanding tokens/DB sessions are burned. Existing login and other
  users' sessions are untouched. Needs from Tats: ~~apply 0069~~ ✅ done, set `EMAIL_API_KEY` (+ `EMAIL_FROM=PawPi <no-reply@pawpi.info>` — the sending domain is **pawpi.info**, `pawpi.app` is NOT ours;
  Resend by default) and `APP_BASE_URL`. Until the email key is set it degrades cleanly but no mail is
  delivered.
- **iOS builds and runs.** TestFlight reached **Build 6**; a long native splash-hang arc is fixed
  (#253, #255–#259). A **local iOS Simulator build now works on this Mac**, so mobile UI is
  self-verifiable — no device round-trip needed for visual checks.
- **2.77 Liquid Glass redesign — ✅ COMPLETE** (#202–#209, merged 2026-07-28). One deliberate
  exclusion: `service/adoption.jsx` keeps its old styling (its restyle would have reverted the Wave 9
  adoption browse work).
- **Demo/App-Review account seeded on PRODUCTION:** `augusto+demo@pawpi.info`, hero pet **Mango**. All current
  production data is disposable test data, to be wiped once the app is accepted.

**Blocking submission (all need Tats, none are code):** telehealth video vendor credentials
(`VIDEO_API_KEY`/`SECRET`); `CRON_SECRET` + an external scheduler; **applying migration 0069 + setting
`EMAIL_API_KEY`/`APP_BASE_URL`** so password-reset emails actually go out (the code is built); the
remaining go-live keys; and changing the placeholder `pawpi_app` DB password.

**Pipeline note:** work has been **Claude Code only** for several weeks — Cowork has not been driving.
`docs/roadmap.md` was refreshed the same day and now carries a "CURRENT STATE" block plus the
post-Wave-9 history (video moments, legal/consent, the iOS build arc, the Railway deploy + production
hardening, and the redesign). Read that for detail.

---

### Snapshot (2026-06-18) — historical, superseded by the block above

- **Phase 1 — DONE.** Rebuilt off Anything onto Supabase; **RLS is LIVE** (the app connects as the
  locked-down `pawpi_app` role; every data table is FORCE-RLS'd; identity tables are RLS-exempt).
- **Phase 2 — DONE.** Provider/vet super-app + the full service catalog (vet, grooming, walking,
  daycare, sitting, training, shop, adoption, telehealth), payments scaffold, generalized booking,
  chat, reviews, provider dashboard + owner hub. Migrations **0001–0038** applied to Supabase.
- **Wave 3 / Wave 4 (tickets 2.15–2.31) — DONE & merged.** Migrations **0039–0045** applied + verified.
- **Wave 5 (tickets 2.32–2.50) — DONE & merged.** Migrations **0046–0050** applied + verified. Includes
  the "epic four" (AI health intelligence + the real Vet Summary — the old fake `VetSummaryModal` is
  gone; family/caregiver sharing; lost & found; memories/Wrapped), the community forum, the self-training
  curriculum, walks-with-buddies, unified messaging, Instagram-style nav, password rules, the
  Apple/Google social-login scaffold, and the feed/profile bug fixes.
- **Migrations 0001–0055 are applied + verified on live Supabase (0051–0055 hand-applied + verified all-PASS
  2026-06-18). None pending; the live DB is at 0055.**
- **Wave 6 — ✅ COMPLETE & merged.** Tickets 2.51–2.67 in `docs/phase2-tickets/00-README.md`. Built in two
  parts (⚡ autonomy preamble), all CI-green, squash-merged to `origin/main`.
  - **Part A (mobile UX fix-pack: 2.55, 2.59–2.66) — done, NO migrations** (planning #167; #168–#176):
    removed the demo name "Phoebe" + shared avatar fallback (2.55); load-gated share frame (2.62); app-wide
    tap-to-focus keyboard (2.63); double-tap-Paw (2.64); owner-only caption edit (2.65); real
    Today's-Progress (2.66); floating tab bar (2.59); Profile tab → pet social profile + photo icon (2.60);
    followers/following lists (2.61).
  - **2.67 (device fix) — done, no migration** (#178): hardened the `/follows` nav (the Followers/Following
    +not-found was a stale Metro route tree; code was correct — fixes are robustness: absolute-href + active
    pet fallback in the embedded tab).
  - **Part B (capabilities + loose ends) — done** (#179–#185), migrations **0051–0055** (✅ applied + verified):
    adoption public single-listing GET (2.56, no migration); **emergency medical card** — 2 owner tables +
    3 SECURITY DEFINER public-read fns + two no-login web pages `/p/tag` + `/p/card` + printable QR (2.51,
    **0051**); **transport/pet-taxi** on the spine (2.52, **0052**); **vet Rx** owner-read-only append-only
    (2.53, **0053**); **insurance marketplace** new `insurance` capability (2.54, **0054**); adoption
    foster/urgent flags (2.57, **0055**); feed Suggested divider + docs refresh (2.58, no migration).
  - Final test baselines: **mobile jest 967 · web vitest 977 · integration 516 (55 migrations)**.
  - **Decisions of record:** added `react-native-qrcode-svg` (mobile) for the printable tag QR; 2.53 clinical
    mutations go through DEFINER helpers with NO provider UPDATE policy (Rx history can't be rewritten);
    2.51/2.54 owner routes never attach the Vet Record. Owes a device pass across the new surfaces.
- **Wave 7 — ✅ COMPLETE (autonomous run).** All of 2.68–2.75 built, CI-green, squash-merged (PRs #189–#196).
  Migrations **0056–0062 APPLIED + VERIFIED on Supabase 2026-06-19** (all 30 checks PASS via
  `supabase/verify_0056_0062.sql`; live DB now at **0062**, none pending). **✅ 2.75 nutrition +
  food-recalls MERGED** — migration **0061** `nutrition_plans` (owner-RLS, family follow-up) + `food_recalls`
  (public read, DEFINER `ingest_food_recall`) + `pet_food_recall_matches` (owner-RLS) + `match_food_recall`
  DEFINER (recall→plan match + `food_recall` notify) + notifications CHECK widen; secret-gated idempotent
  ingest (`/api/recalls/ingest`, needs `CRON_SECRET` + external scheduler); mobile Nutrition card +
  dismissible recall alerts (non-diagnostic).
  **✅ 2.78 App Store readiness pass DONE** (PRs #197–#199): iOS permission strings + privacy manifest +
  metadata (name PawPi, bundle id placeholder); removed the `wrongPets` debug query; privacy/terms config
  slot; **in-app account deletion** (migration **0062** `delete_my_account()` DEFINER + `DELETE /api/account`
  + Settings danger-zone, harness-proven, ✅ migration 0062 APPLIED + VERIFIED 2026-06-19); wired two "coming soon" no-ops (weight-log
  delete, profile photo) to real functionality. Sign in with Apple parity + medical disclaimers verified.
  Handoff: **`docs/app-store-readiness.md`** (FIXED / FLAGGED policy items / account-gated submission
  checklist). Code+config is submission-ready; the actual EAS build + App Store Connect upload need the
  Apple Developer account.
  Tickets 2.68–2.75 in `docs/phase2-tickets/` (Wave 7
  section of `00-README.md`); status mirror in `docs/roadmap.md`; planned migrations 0056–0061 pre-flagged in
  `docs/test-backlog.md` ACTION 1. **✅ 2.68 shared Apple-Maps component MERGED** —
  `src/components/Map/{MapLocationPicker,MapLocationView,LocationField}.jsx` (Apple via `PROVIDER_DEFAULT`);
  `WalkMapPicker` is a thin wrapper; transport adopts `MapLocationPicker`; i18n `map.*` EN+ES.
  **✅ 2.69 provider Sales/payouts/reconciliation MERGED** — read-only `GET /api/providers/[id]/sales`
  (active-staff-scoped) surfaces revenue/ledger/payouts/reconciliation from the 2.3 money tables; enabled the
  `Sales` dashboard section (recharts + empty states); **no migration, no money mutated.**
  **✅ 2.70 transport live-GPS MERGED** — migration **0056** `transport_trip_locations` (append-only driver
  pings; assigned-driver-while-en_route INSERT + owner/driver/staff SELECT via two SECURITY DEFINER helpers;
  harness-proven, **PENDING hand-apply**, last applied = 0055); driver ping POST + owner/staff `/track` GET;
  owner live Apple-map screen + driver location sharing (reuses 2.68 `MapLocationView`).
  **✅ 2.71 Rx fulfillment MERGED** — migration **0057** `rx_fulfillment_orders` (owner creates only on an
  owned, active, refillable Rx; pharmacy-staff advance; the `fulfill_rx_order` DEFINER consumes a refill on
  the 2.53 safe path so prescriptions stay append-only; `pharmacy` already in the CHECK since 0040 — no
  widen; harness-proven, **PENDING hand-apply**). Owner request flow (delivery via 2.68 / pickup, pay via
  2.3) + provider dashboard `Rx Fulfillment` queue.
  **✅ 2.72 insurance in-app binding MERGED** — migration **0058** `insurance_policies` (owner applies +
  accepts terms but can't self-issue number/premium or self-activate; insurer issues/advances but can't set
  `active`; `activate_insurance_policy` DEFINER requires an approved 2.3 payment; harness-proven, **PENDING
  hand-apply**). `insurance` already in CHECK (0054). Owner apply/pay/hub + provider `Policies` dashboard;
  non-underwriting disclaimer.
  **✅ 2.73 pet-friendly places MERGED** — migration **0059** `saved_places` (owner-FOR-ALL RLS; no cache
  table — the key-gated Google Places web proxy fetches live and degrades clean to `configured:false`, key
  never shipped to the client; harness-proven, **PENDING hand-apply**). Mobile Places screen (2.68 Apple map
  + list + category filter + Saved favorites + Apple-Maps directions hand-off). Reuses `GOOGLE_PLACES_API_KEY`.
  **✅ 2.74 events/meetups MERGED** — migration **0060** `events` + `event_rsvps` (forum-style published
  public read + host-only writes/soft-delete + own-only RSVP toggle, COUNT-on-read; harness-proven, **PENDING
  hand-apply**). Mobile Events section in Community (2.68 Apple map + RSVP + create via the 2.68 picker).
  From the
  un-ticketed post-core list: 2.68 shared Apple-Maps component
  (FIRST), 2.69 provider Sales/payouts/reconciliation UI, 2.70 transport live-GPS, 2.71 Rx fulfillment (new
  `pharmacy` capability), 2.72 insurance in-app binding+payment, 2.73 pet-friendly places (Google Places +
  Apple map), 2.74 events/meetups, 2.75 nutrition plans + food-recall alerts. **Decisions of record (Tats
  2026-06-18):** memorials dropped; widgets/Apple-Watch deferred to a dedicated attended effort (native, not
  CI-verifiable); insurance goes FULL in-app bind+pay (insurer is party-of-record, disclaimers, not
  underwriting); places data = Google Places via a server route; **new cross-cutting rule — Apple Maps
  (`react-native-maps` `PROVIDER_DEFAULT`) in EVERY section that captures/shows a location, via the shared
  2.68 component.**
- **Wave 8 — ✅ COMPLETE (calendar integration, tickets 2.79–2.80).** Scoped with Tats 2026-06-20: the
  buildable, CI-verifiable half of calendar integration (true two-way EventKit sync stays a later attended
  device pass). Foundation-first (mirrors 2.68). Built unattended per the ⚡ Wave 5 autonomy preamble.
  **✅ 2.79 calendar foundation MERGED** — de-duped `calendarIntegration.js` into one generic layer
  (`getOrCreatePawPiCalendar` + `upsertCalendarEvent` + `deleteCalendarEvent`) + an expo-free, jest-covered
  `calendarFormat` module; the walk/vet wrappers and all call-sites are byte-for-byte unchanged; owner-scoped
  `GET /api/calendar/booking/[id].ics` (RFC 5545). **No migration.**
  **✅ 2.80 calendar everywhere MERGED** — add/update/remove wired into generalized bookings (a
  `BookingFormModal` "Add to phone calendar" toggle, also covers telehealth), transport trips, and RSVP'd
  events; the device event id persists on `vet_appointments.calendar_event_id` (bookings/transport/telehealth,
  existing column) or `event_rsvps.calendar_event_id` (events, new); added `GET /api/calendar/event/[id].ics`;
  calendar is always optional and degrades clean when permission is denied. **Migration 0063**
  (`event_rsvps.calendar_event_id`, one additive column, no RLS change) is harness-proven, **PENDING
  hand-apply** (test-backlog ACTION 1; live DB still at 0062). Final test baselines: **mobile jest 1085 ·
  web vitest 1163 · integration 583.**
- **Wave 9 — ✅ COMPLETE (business magic-onboarding + calendar import + adoption browse, tickets 2.81–2.87).**
  Scoped with Tats 2026-06-20; built unattended per the ⚡ autonomy preamble, all CI-green, squash-merged
  (PRs #217–#223). Goal: fastest-possible business onboarding + a real adoption browse experience.
  - **2.81 business map pin** (#217, no migration) — `provider_locations` already had `lat`/`lng`; mobile
    onboarding `LocationField` + web `LocationMapPicker` (new key `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`,
    degrades to manual lat/lng inputs when unset; mobile uses Apple Maps, no key).
  - **2.82 document enrichment** (#218, no migration) — PDF/XLSX/CSV → proposed services/products catalog,
    confirm-first; `/enrich/document` writes nothing directly; added lazy-loaded `xlsx`. Reuses `ENRICHMENT_LLM_KEY`.
  - **2.83 mobile magic-onboarding wizard** (#220, no migration) — links + pin + doc → "Build my profile" →
    one editable confirm-first review → save via existing owner-identity routes; keyless → fully manual.
  - **2.84 calendar import** (#219, **migration 0064** `provider_calendar_feeds` + `provider_calendar_busy`,
    owner-scoped RLS + 4 DEFINER fns + harness-proven) — paste an iCal/ICS feed URL → read-only busy blocks
    make those slots unbookable; `CRON_SECRET`-guarded `POST /api/providers/calendar/sync` + manual refresh.
    This is the IMPORT half only (device EventKit two-way sync stays the deferred native track).
  - **2.85 adoption media** (#221, no migration) — photo + video upload on listings (reorder/remove, first=cover),
    reusing the existing `photo_urls[]`/`video_url` columns.
  - **2.86 adoption browse** (#222, no migration) — new `GET /api/adoption/listings`; 2-col photo-on-top grid
    (info BELOW the photo), nearest-first by provider location, composable filters, clean fallback when location
    is denied. Integration-proven.
  - **2.87 adoption detail page** (#223, no migration) — swipeable media gallery, facts, compatibility chips,
    story, shelter map (2.68 `MapLocationView`), Apply/Foster CTA via the existing application flow.
  - **Decisions of record:** provider management stayed web-primary (calendar import lives on the web dashboard
    like services/locations/staff; mobile onboarding hands off there). Final test baselines: **mobile jest 1099 ·
    web vitest 1203 · integration 592.**
  - **0063 + 0064 ✅ APPLIED + VERIFIED 2026-06-20 (Tats ran both; 0064 all 12 checks PASS via
    verify_0064.sql; live DB now at 0064 — none pending).** New env key this wave: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

- **Wave 10 — 🌙 night-run in progress (Shop/Store + business-social finish, tickets 2.88–2.92).**
  Continues the 2026-08-10 extranet/storefront work. Built unattended per the ⚡ autonomy preamble
  (`docs/night-run-2026-08-11.md`); CI-green → auto squash-merge; one line per merge in
  `docs/night-run-log.md`. Only 2.92 adds a migration (0083, hand-apply after merge; degrades cleanly).
  - **2.88 provider-post open route fix** (mobile, no migration) — tapping a storefront post opened the
    dead `/service` fallback because the whole post (with signed image URLs full of `?`/`&`/`%`) was shoved
    into a route param, corrupting the deep-link URL. Fixed: navigation now carries only `providerId`+`postId`;
    the rich post is handed off in memory (`utils/providerPostHandoff.js`) so the detail renders instantly and
    guests still read. Regression test guards the route + params. **Merged #339.**
  - **2.89 grouped offering picker** (web, no migration) — the dashboard nav was already capability-driven +
    grouped (#327/#328), but the Business-Profile offering picker (and onboarding form) was a flat 12-chip
    list. Added a shared presentation-only taxonomy (`provider/lib/capabilityGroups.js`) grouping the EXISTING
    keys into Veterinary & Health / Walking & Sitting / Training / Store / Adoption / Other — no key created,
    renamed, or removed (`capabilities.js` untouched). Both pickers now render grouped sections. web vitest
    1764→1770. **Merged #340.**
  - **2.90 Products enable clarity** (web, no migration) — a business without the store enabled saw the API's
    jargon 403 ("Provider does not have the 'shop' capability") on the Products page. Replaced with a friendly
    explainer + one "Enable Products" button that flips the SAME `shop` offering the profile controls
    (`useAddCapability`, reused — no forked write path) and drops straight into add-a-product once on. Renamed
    the header Shop→Products (matches the nav). No user-facing jargon (grep-checked). web vitest 1770→1773.
    **Merged #341.**
  - **2.91 adoption end-to-end fix** (web + API, no migration) — root causes: (a/b/c) the provider editor only
    let a shelter edit MEDIA — there was no way to edit or even see the name/breed/fee/story it wrote; (d) the
    public browse (`/api/adoption/listings`) silently dropped any shelter without a map pin whenever the owner
    shared location (the geo bounding box required coords), so pin-less shelters were invisible. Fixes: the
    per-listing action is now a full **Edit** modal prefilling every field + media, saving via the existing
    `useUpdateAdoptableListing` PATCH (backend already COALESCEd all fields); the browse now **includes
    coordless shelters** (distance unknown → sorted last) while still radius-filtering located ones. Mobile
    browse/detail already rendered real data (unchanged). Integration test proves the pin-less shelter surfaces;
    the PATCH is unchanged (no RLS change). web vitest unchanged (replaced 1 test) · integration +1. **Merged #342.**
  - **2.92 follow a business** (web + mobile, **migration 0083** — pending hand-apply, flagged in test-backlog
    ACTION 1) — pet owners can now FOLLOW a provider (mirrors pet_follows). New `provider_follows` (ENABLE+FORCE
    RLS: any-authed read, own-row write) + API `GET/POST/DELETE /api/providers/[id]/follow` (is-following +
    count) and `GET /api/providers/following` ("businesses I follow"). Mobile: a `ProviderFollowButton`
    (optimistic toggle, guest→sign-in, follower count) on the provider screen + a "Businesses you follow" list
    off the More hub; EN+ES strings. **Degrades cleanly pre-migration** — every follow query catches
    undefined_table (42P01) → not following / 0 followers / empty list, so the provider screen never crashes.
    All routes tested through the REAL router by URL (no static-vs-[param] shadowing on `/providers/following`).
    web vitest 1773→1777 · integration +8 (RLS own-row write, guest denied, degrade path) · mobile jest 1565→1570.
  - **2.93 business Posts → pet-social-profile parity** (web + mobile, **no migration**, attended → PR only, not
    auto-merged) — the business storefront now reads like a pet's social profile. Header gains an **@handle**
    (from the provider slug) + an **info line** (bio); a **stat row** (Posts · Paws · Barks · Followers, no
    "Following") styled exactly like the pet profile; the Posts tab becomes a **moments-style image grid**
    whose tiles open the existing post detail (full-size images + comments — guests read, signed-in owners
    comment). REUSE, not a parallel design: extracted `components/social/SocialStatRow` + `MomentsGrid` and
    adopted them in BOTH the pet profile and the business storefront (pet-profile refactor is behavior-preserving).
    Web: the public profile payload gains `stats { postsCount, pawsCount, barksCount }` — Barks from the 0082
    comments; both edge tables `to_regclass`-guarded so a missing table degrades to 0. Followers is read live
    from the follow endpoint (shared query, so it stays in sync with the Follow button). **Paws stays 0 until
    2.94** lands `provider_post_paws` — the read never 500s. Moderation moved off the (now grid) post cards
    onto the post-detail header (Guideline 1.2 preserved). All new web reads exercised through the REAL router
    by URL (unit + integration). web vitest 1777→1779 · integration +1 (stats on the storefront read, paws
    table absent → 0) · mobile jest 1570→1582.
  - **2.95 adoption visibility + apply** (web + mobile, **no migration**, attended → PR only, not auto-merged) —
    fixes "as a pet owner I see nothing to adopt". Root cause: the owner browse (`GET /api/adoption/listings`)
    HARD-filtered located shelters to a `radius_km` (default 100km) bounding box, so with sparse early data a
    shelter WITH a map pin more than 100km away was dropped entirely (2.91 had rescued only *coordless*
    shelters). Fix: **distance RANKS, it does not exclude** — the box is removed from the default browse and
    gated behind an explicit opt-in `enforce_radius=true` (off by default). Every AVAILABLE dog of every
    PUBLISHED provider is returned, sorted nearest-first when the owner shares location (coordless last),
    featured/recent otherwise — a shelter across the country still appears, just ranked lower. New listings were
    already visible-by-default: the create-listing INSERT relies on `adoptable_listings.status` default
    `'available'` (0038), verified. Mobile: the Apply-to-adopt CTA now flips to a persistent **"Application
    sent"** confirmation (no duplicate re-apply). No RLS change — only an over-eager distance EXCLUSION was
    removed, not who-can-read. Browse read exercised through the REAL router by URL + the adoption-browse
    integration suite (extended to prove a located shelter ~111km out now appears, ranked after nearer ones).
    web vitest unchanged · integration +1 (far-located-still-appears) · mobile jest +1 (apply confirmation).

### Open (non-code) — full checklist in `docs/test-backlog.md`

- **Go-live env keys** (each feature degrades cleanly until its keys are set): Apple + Google OAuth
  (the sign-in buttons stay hidden until set); MercadoPago + Binance (payments); `CRON_SECRET` + an
  external scheduler (subscription auto-charge); the video-vendor keys (telehealth);
  `GOOGLE_PLACES_API_KEY` + `ENRICHMENT_LLM_KEY` (provider enrichment); `PAYMENTS_TOKEN_KEY`;
  `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (web provider-location pin, 2.81); `CRON_SECRET` + scheduler →
  `POST /api/providers/calendar/sync` daily (calendar import, 2.84); **`EMAIL_API_KEY` (+ `EMAIL_FROM` on **pawpi.info**)
  and `APP_BASE_URL`** (password-reset email — without them the flow runs but no link is delivered).
- **Pending migrations: `0069_password_reset_tokens.sql`.** The live DB is at **0068** (0063–0068 all
  applied; verified against production 2026-07-28); 0069 landed after that check and is harness-proven,
  additive, and touches no existing table's RLS. Apply it, then run `supabase/verify_0069.sql`.
- **Pre-launch security:** change the placeholder `pawpi_app` DB password.
- **Still-stub / broken surfaces:** telehealth join fails without the video-vendor keys.
  (~~`/account/forgot-password` is frontend-only~~ — built 2026-07-28; it now needs migration 0069 +
  `EMAIL_API_KEY`/`APP_BASE_URL`, not code.)
- **Device/browser test passes:** the accumulated "To test" entries in `docs/test-backlog.md` (provider
  passes deferred by choice; auth, native uploads, and the Wave 5 features still owe a device pass).
- **Minor known cleanup:** the `wrongPets` debug query was removed in 2.78. The stray
  `supabase/verify_0063.sql` (a Wave-8 artifact) is left untracked — tell Code to commit or delete it.

### How to keep this current

Do NOT re-grow a per-PR log here. Code writes per-merge status into `docs/roadmap.md` +
`docs/test-backlog.md`; Cowork refreshes this Snapshot only at phase/wave boundaries.

## Dev-env notes

Dev-env note: mobile API base URL is EXPO_PUBLIC_BASE_URL in anything/apps/mobile/.env (NOT EXPO_PUBLIC_API_URL). DHCP LAN IP — update after wifi/IP change (ipconfig getifaddr en0), restart Expo with --clear. EXPO_PUBLIC_BASE_URL/PROXY_BASE_URL/HOST all 192.168.178.183:4000.

Dev-env note (web AUTH_URL): AUTH_URL must stay UNSET in anything/apps/web/.env. Auth.js derives its
origin from the request host via trustHost, so login redirects follow whatever host you browse and survive
DHCP changes. A stale/fixed AUTH_URL rewrites every request origin to it → after an IP change the
post-login redirect points at an unreachable host ("site can't be reached" / iOS -1004). scripts/dev-backend.sh
self-heals (comments out any active AUTH_URL line on startup). Do NOT re-add AUTH_URL for local/device dev.

Follow these instructions when working in this project.

## CC prompts — combine CI-green + merge into ONE prompt

When handing Tats a prompt to push a branch / open a PR, ALWAYS combine getting **CI green** AND the **merge** into a single prompt (do not split them into two). Logic: if CI is green it is good to merge; worst case a later enhancement is needed, which is always true anyway. The combined prompt should: push → open PR → wait for CI (retrigger with a minimal real commit if Actions does not schedule) → IF all green, merge with a merge commit (repo convention) + delete the branch + confirm the Railway deploy healthy; IF any job is red, STOP and report the failure (do not merge). Still state new-vs-same CC chat.
