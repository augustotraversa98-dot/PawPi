# UX audit — recurring onboarding-class issues, app-wide (2026-10)

Scope: every mobile screen/modal with a text input (79 files with `TextInput`). Static analysis only
(the simulator can't reliably present the keyboard). Classes: **a** keyboard coverage · **b** oversized
type/loose spacing · **c** content below the fold · **d** unit/locale defaults · **e** list UX.

Status: ✅ fixed in this PR · 🟡 proposed (needs a decision / bigger change) · 📝 noted, low risk.
Paths are relative to `anything/apps/mobile/src/`.

## Headline

* The shared `KeyboardAwareScrollView` (KAS) existed but **~45 input screens didn't use it** — the
  focused field could stay hidden behind the keyboard. Fixed for 16 screens directly and for
  **~35 more by making `RefreshableScrollView` keyboard-aware** (one change).
* **Not in the requested classes, but worse:** the Track dashboards (Weight, Pee, Poo, Vomit, Food&Water,
  Walk) and the Reminders **Upcoming** tab were rendering **raw i18n key strings** in EN *and* ES
  (~126 keys missing; duplicate `trackers` block collapsed in batch 8/15, `health.reminders.upcoming`
  referenced by the wrong path). Fixed + guarded by a new test.
* Weight was hard-coded to **lbs** outside onboarding (incl. Track → Weight, which *stored* lbs for a
  dog onboarded in kg). Now follows the pet's unit / device measurement system (metric default).

## Ranked findings

| # | Screen | Class | Sev | Evidence | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | Track dashboards + WeightModal + Reminders › Upcoming (raw key strings) | i18n (extra) | **Critical** | `trackers.weight.modal.*` etc. absent from `i18n/locales/{en,es}.json`; `Reminders/UpcomingTab.jsx` used `reminders.upcoming.*` but keys live at `health.reminders.upcoming.*` | Restored old `trackers` subtree into both locales (text splice, no round-trip); fixed key path; `i18n/trackerKeys.test.js` guards it | ✅ |
| 2 | Track → Weight (WeightModal) | d | **High** | `Weight/WeightModal.jsx` POSTed `weightUnit: "lbs"` and labelled the field "(lbs)" regardless of the pet's unit | Uses `currentPet.weight_unit \|\| defaultWeightUnit()`; label `trackers.weight.modal.currentWeight` (`{{unit}}`) EN+ES | ✅ |
| 3 | Forum thread — pinned comment composer | a | **High** | `app/forum-thread.jsx` pinned `TextInput` footer, no keyboard handling → keyboard covers the composer | Wrapped scroll + composer in `KeyboardAvoidingAnimatedView` | ✅ |
| 4 | Bottom-sheet modals: Request-a-walk, Caregiver log walk, Services picker | a | **High** | `service/walking.jsx` (RequestWalkModal), `Pets/CaregiverLogWalkModal.jsx`, `Services/ServicesDiscovery.jsx` PickerModal: transparent `flex-end` sheet with inputs, no KAV | Outer container → `KeyboardAvoidingAnimatedView` (transparent modal ⇒ coords valid) | ✅ |
| 5 | Add Dog, Edit Profile, Vet-appointment / Feeding / Wellness routine forms, Feeding-issue | a | **High** | `Pets/AddDogModal.jsx`, `more/profile-edit.jsx`, `Reminders/{VetAppointment,Feeding,WellnessCheck}RoutineModal.jsx`, `Health/FeedingIssueModal.jsx`: `KeyboardAvoidingAnimatedView` + plain `ScrollView` — view shrinks but nothing scrolls the focused field into view; no `keyboardShouldPersistTaps` | `ScrollView` → `KeyboardAwareScrollView` (also adds `keyboardShouldPersistTaps="handled"`) | ✅ |
| 6 | Create walk, Lost & Found (sighting + report), Event create, Forum compose, Nutrition, Emergency card, Pet sharing, Post detail (comment), Vet summary, Claim CTA | a | **Med-High** | plain `ScrollView` + `TextInput`, no KAV/KAS (`create-walk.jsx:136`, `lost-found.jsx:275,342`, `event-create.jsx:101`, `forum-compose.jsx:75`, `nutrition.jsx:117`, `emergency-card.jsx:165`, `pet-sharing.jsx:133`, `Feed/PostDetailModal.jsx:183`, `VetSummary/VetSummaryModal.jsx:129`, `Providers/ClaimCTA.jsx:191`) — several are `pageSheet`, where RN KAV is wrong | `ScrollView` → `KeyboardAwareScrollView` | ✅ |
| 7 | Service insurance, Transport + 33 other pull-to-refresh screens with inputs | a | **Med-High** | `components/RefreshableScrollView.jsx` wrapped bare `ScrollView`; `service/insurance.jsx`, `service/transport.jsx` have 3–4 inputs each | `RefreshableScrollView` now renders `KeyboardAwareScrollView` | ✅ |
| 8 | Weight entry in Add Dog / Edit Profile / Edit Medical Profile / Wellness-check routine | d | Med | `weightUnit: "lbs"` defaults (`AddDogModal.jsx`, `profile-edit.jsx`, `EditMedicalProfileModal.jsx`, `WellnessCheckRoutineModal.jsx`); toggle listed lbs first | New util `utils/weightUnit.js` (`defaultWeightUnit()`; onboarding re-exports it); **new** entries default metric, **existing** records keep their stored unit; kg listed first | ✅ |
| 9 | Tracker dashboards, weight/walk/general-check data, routine "next occurrence", place + storefront reviews | d | Med | `toLocale{Time,Date}String("en-US", {hour12:true})` in `Pee/Poo/Vomit/FoodWater/WalkActivity Dashboard`, `WeightModal`, `WellnessLogModal`, `data/{weight,generalCheck,walkActivity,reminders,routines}Data.js`, `service/place.jsx`, `ReviewsPanel.jsx` — AM/PM + MM/DD for an es-AR product | Routed through `utils/localeDateTime` (`formatLocalTime/Date`: es-AR/en-GB, 24h, dd/MM) | ✅ |
| 10 | Follows (search + list) | a | Low | `app/follows.jsx` `FlatList` under a search input without `keyboardShouldPersistTaps` → first tap on a row only dismisses the keyboard | `keyboardShouldPersistTaps="handled"` | ✅ |
| 11 | Wellness check weight unit tokens | d | Med | `utils/wellnessLog.js:32-33` uses `"lb"` (+ default `"lb"`) while everything else uses `"lbs"`; posts `weightUnit: "lb"` to `/api/health/weight-logs` | Normalise token (`lb`→`lbs`) + metric default; needs a look at how the API/history render `lb` | 🟡 |
| 12 | `formatDisplayTime` device-clock sites | d | Low-Med | Memory: ~15 sites still follow the *device* 12/24h (`app/walker-walks.jsx:487`, `business/bookings.jsx:73`, `business/index.jsx:252,581`, `service/booking-summary.jsx:81`, `service/telehealth.jsx:162`, `Health/VetAppointmentDetailModal.jsx:146`, `TimeField.jsx:42`…) | Pass `hour12=false` (as `HealthVetRecord`/`notifications` already do) — or flip the default; product call | 🟡 |
| 13 | Bottom-sheet forms with fixed-height ScrollViews | a/c | Low | `Places/PlaceReviewModal.jsx:134` plain `ScrollView` inside a KAV bottom sheet (works because sheet lifts, but no scroll-to-field if the form is taller than the visible area) | Swap to KAS | 🟡 (not touched — layout interplay with `flex-end` sheet should be eyeballed on device) |
| 14 | Long routine/medical forms (`Reminders/*RoutineModal`, `AddDogModal`, `profile-edit`) | c | Low | Primary action pinned at bottom of tall scroll (padding `bottom: 100–120`) so the field→CTA path needs scrolling | Candidate for a sticky-footer pattern like onboarding's; **redesign** | 🟡 proposal |
| 15 | Breed list in Add Dog / Profile edit | e | — | `BreedPicker` already has the tidy default + search (shared with onboarding) — no per-screen dump left | none | ✅ (already fine) |
| 16 | Type scale in forms | b | — | No oversized body/title type outside onboarding; only decorative emoji (`fontSize` 28–60) and `StartWalkModal.jsx:228` (56, countdown) | none | 📝 |
| 17 | Remaining `TextInput` screens | a | — | Already using `KeyboardSafeFormModal` / KAS: ReminderCreation, PhotoCheckRoutine, EditMedicalProfile, BookingForm, all VetRecord Add*, trackers (Pee/Poo/Vomit/Walk/FoodWater/Medication/WellnessLog/GeneralCheck), service daycare/sitting/training, chat/provider-chat | none | ✅ |

## Behaviour notes / risk

* The wrapper is what the 2026-06 convention mandates; swaps are mechanical (same props; it also
  defaults `keyboardShouldPersistTaps="handled"`). Where a screen *also* had a root
  `KeyboardAvoidingAnimatedView`, the combination is the documented one (KAV lifts, KAS measures after
  `keyboardDidShow`).
* Simulator can't show the keyboard — **device QA owed** on: Add Dog, Edit Profile, a routine form
  (Feeding), Forum thread comment, Request-a-walk sheet, Caregiver log-walk sheet.
* `defaultWeightUnit()` is metric unless the device measurement system is `us`; existing pets/records
  keep whatever unit they were saved with.
