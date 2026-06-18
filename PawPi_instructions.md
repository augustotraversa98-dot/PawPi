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

### Snapshot (2026-06-18)

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
- **Wave 7 — IN PROGRESS (autonomous run).** Tickets 2.68–2.75 in `docs/phase2-tickets/` (Wave 7
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
  non-underwriting disclaimer. From the
  un-ticketed post-core list: 2.68 shared Apple-Maps component
  (FIRST), 2.69 provider Sales/payouts/reconciliation UI, 2.70 transport live-GPS, 2.71 Rx fulfillment (new
  `pharmacy` capability), 2.72 insurance in-app binding+payment, 2.73 pet-friendly places (Google Places +
  Apple map), 2.74 events/meetups, 2.75 nutrition plans + food-recall alerts. **Decisions of record (Tats
  2026-06-18):** memorials dropped; widgets/Apple-Watch deferred to a dedicated attended effort (native, not
  CI-verifiable); insurance goes FULL in-app bind+pay (insurer is party-of-record, disclaimers, not
  underwriting); places data = Google Places via a server route; **new cross-cutting rule — Apple Maps
  (`react-native-maps` `PROVIDER_DEFAULT`) in EVERY section that captures/shows a location, via the shared
  2.68 component.**

### Open (non-code) — full checklist in `docs/test-backlog.md`

- **Go-live env keys** (each feature degrades cleanly until its keys are set): Apple + Google OAuth
  (the sign-in buttons stay hidden until set); MercadoPago + Binance (payments); `CRON_SECRET` + an
  external scheduler (subscription auto-charge); the video-vendor keys (telehealth);
  `GOOGLE_PLACES_API_KEY` + `ENRICHMENT_LLM_KEY` (provider enrichment); `PAYMENTS_TOKEN_KEY`.
- **Pre-launch security:** change the placeholder `pawpi_app` DB password.
- **Device/browser test passes:** the accumulated "To test" entries in `docs/test-backlog.md` (provider
  passes deferred by choice; auth, native uploads, and the Wave 5 features still owe a device pass).
- **Minor known cleanup:** gate/remove the `wrongPets` debug query in `pets/route.js`.

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
