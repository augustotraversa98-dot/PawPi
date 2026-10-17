# App-wide consistency audit — 2026-10-17 (code only)

Night run #2, PR E0 (docs-only). Read-only scan of `anything/apps/mobile/src` at `main` = `cf67a027`. **Nothing was changed by this PR.**
The fixes (E1–E5) route screens to the *already-existing* canonical component/token and are limited to LOW-RISK items; anything medium/high risk or needing a design decision is listed as **needs human** and left alone.

Findings were produced by systematic scans (regex/AST scripts + reading); counts that come from regex are approximate and are marked as such in each section. Line numbers are from the commit above and may shift by a few lines as the E-PRs land. The nine areas map to the brief as: (a) text → §1, (b) buttons → §2, (c) popups → §2, (d) calendars/pickers → §3, (e) icons, (f) colours/type/spacing, (g) states, (h) a11y, (i) dead controls → §4.

## 0. Headline numbers

| Area | Headline |
|---|---|
| Text | ~700 hard-coded English strings in 33 groups (≈400 are the training-curriculum data file); **zero** missing `t()` keys; EN/ES key parity exact (3471/3471); duplicate `ownerMenu` namespace shadows 4 keys; ~12 tuteo slips in the voseo ES file; ~70 call sites show raw `e.message`; a production "Debug:" banner in `WalkRoutineModal.jsx` |
| Buttons | shared `Button` used in 3 files (5 usages) vs 861 pressables; ~112 hand-rolled coral primary blocks in ~67 files; 75 pressables <44pt without `hitSlop`; 630/861 lack `accessibilityRole`; 7+ different reds for destructive; no `COLORS.danger` |
| Popups | 321 `Alert.alert` (49 confirms: all have Cancel, 35 destructive, 3 out of order); 77 show raw `error.message`; 79 `<Modal>`s all have `onRequestClose`; ~24 hand-rolled bottom sheets vs the shared `Sheet` (1 user) |
| Pickers/dates | picker layer is sound (only `DateField`/`TimeField` touch the native picker; 25 files use them; no free-text date inputs). Real bugs: UTC-date defaults (tomorrow after 21:00 in Buenos Aires), AM/PM formatters in a 24h ES app, `HH:MM:SS` handling, no past-date guards on future-only forms |
| Colour/type | 1,816 hex literals: 425 exact token matches, 612 `#FFF`, 219 in a second "health palette" in 57 files; Nunito is never loaded (system font); 83 files redeclare a local `const C = {…}` (15 exact copies) |
| States | no shared Empty/Error/Loading component; 22 screens handle loading+empty but not error (a failed query looks like "nothing here") |
| A11y | 149 icon-only buttons without a label (back 49, close 55, delete 14, add 10, other 21); 35/38 `Switch` unlabeled |
| Dead controls | 2 buttons on Health→Insights with no `onPress`, 1 "Add photo (coming soon)" button, 6 user-visible "coming soon" spots, ~24 unreferenced modules (incl. `VetInformation.jsx` with a fake vet, `data/mockData.js`), 180 `console.log` (stripped from release builds by babel config) |

## How the fix PRs use this

| PR | Takes from this audit (LOW-RISK only) |
|---|---|
| **E1** copy/i18n | hard-coded user-visible strings in live code → existing/new EN+ES keys; the "Debug:" banner; duplicate `ownerMenu` shadowing; tuteo slips; raw `e.message` → friendly keys; parity test extended |
| **E2** pickers/dates | UTC-date defaults → local-date helper; `HH:MM:SS` parsing; End-date minimum; hand-rolled AM/PM → shared formatter; past-date guards where the canonical `minimumDate` exists |
| **E3** popups | `ProviderFollowButton` empty Cancel; out-of-order confirms; raw `error.message` in Alerts → friendly text; destructive styling |
| **E4** buttons/icons/tokens | exact-match hex → token only; exact-copy local `C` blocks; destructive red token; **no redesign** |
| **E5** dead controls / a11y / states | missing `accessibilityLabel` on icon-only back/close/delete using existing keys; the 3 no-`onPress` buttons; dead-file deletion only where 0 importers is verified; error state on the worst list screens |

---

## §1. Text

Scope: `anything/apps/mobile/src` (app, components, hooks, utils, data, i18n). Audited 2026-10-17. No repo files edited.
Paths below are relative to `anything/apps/mobile/src/`. `en.json`/`es.json` = `i18n/locales/*.json`.
Tools used: scratchpad scripts `keys.js`, `keys2.js`, `keys4.js` (key-existence checks), `hard.js`, `alerts.js` (hard-coded text scan), `flat.js` (flattened locale TSVs).

Legend. Fix type: **MECH** = low-risk mechanical (route to an existing key, or add EN+ES key and swap literal for `t()`); **HUMAN** = needs a copy/tone/product decision. Risk = risk of the change breaking something (low/med/high). "Live" = reachable in the shipped app; "dead?" = 0 importers found (verify before spending effort).

## 0. Summary

| Sub-category | Findings (groups) | Approx. individual strings | Notes |
|---|---|---|---|
| Hard-coded English bypassing `t()` (JSX, props, Alert, data tables, notification builders) | 33 (T-01..T-33) | ~700 (about 400 of them is the training curriculum in `data/trainingCurriculum.js`) | Biggest area: reminder/routine modals, hooks that `Alert.alert`, reminder/notification generators, `(tabs)/training.jsx` |
| Missing `t()` keys (EN or ES) | 0 literal keys missing | n/a | All 3,400+ literal `t("a.b")` calls (incl. `tc()`/`tr()` wrappers, `_one/_other` plurals) resolve in BOTH locales. EN/ES key parity is exact (3471/3471). Dynamic families spot-checked OK. One real defect: duplicate `ownerMenu` namespace (T-34) and one latent key (T-35) |
| i18n integrity (duplicate namespaces, reliance on `defaultValue`) | 4 (T-34..T-37) | | |
| Raw / technical error text shown to users | 9 (T-38..T-46) | ~70 call sites | `e.message` from hooks that throw English "Failed to ..." / `Upload failed: 500 ...` / `HTTP statusText`; a production "Debug:" banner |
| Terminology | 8 (T-47..T-54) | | Log in vs Sign in; Delete vs Remove; handle vs usuario; dog vs pet; Pet parent vs owner; duplicated "Cancel" |
| Capitalization | 5 (T-55..T-59) | 270+ EN Title Case values; 78 ES / 70 EN ALL-CAPS literals | EN mixes Title Case / sentence case / ALL CAPS; ES is nearly all sentence case |
| Punctuation | 4 (T-60..T-63) | | `...` vs `…`; `e.g.,` vs `e.g.`; `ej.` casing; trailing `!`/emoji |
| Tone / voice (incl. ES voseo slips) | 9 (T-64..T-72) | | Could not vs Couldn't; Please; emoji prefixes; ES tuteo/neutral in a voseo locale |
| **Total finding groups** | **72** | | |

Top 8 to fix first (user-visible, high traffic, MECH): T-01 BookingFormModal, T-02 useStorefrontCart (payments), T-03 hooks Alerts (feed/pet-sharing/lost-found/walks), T-04 WalkRoutineModal debug banner (T-38), T-05 `(tabs)/training.jsx`, T-06 reminder generator/OS notifications, T-07 routine modals, T-09 PhotoCheck modals.

---

## 1. Hard-coded English that bypasses i18n

### High traffic / high impact

**T-01 BookingFormModal - the main booking flow is English-only and injects an English noun into Spanish strings** (HIGH-visibility, MECH+HUMAN, risk med)
- `components/Providers/BookingFormModal.jsx:380` title `Book with ${provider.name}` / `Book ${copy.noun}`; `:382-385` subtitle `For ${pet}` / `Add a pet to book a ${noun}`; `:388` `"Sending…"`; `:389` `Confirm ${copy.noun}`; `:46`, `:54` recurrence labels `"Repeat every 6 weeks"`, `"Repeat weekly (pack walk)"`.
- `:35-62` `CAPABILITY_COPY.noun` = `"appointment"|"grooming"|"walk"|"daycare"|"sitting"|"training"|"service"` is interpolated into ES keys (`booking.pickDateTimeBody`, `depositRequired`, `paymentRequired`, `completePaymentBody`, `paymentFailedBody`, `requestSentBody` - `es.json:1377,1387,1388,1390,1392,1394`) so Spanish users read e.g. "Elegí cuándo querés appointment" / "este appointment" (also breaks gender agreement).
- Canonical: add `booking.title`, `booking.titleNoProvider`, `booking.forPet`, `booking.addPetToBook`, `booking.sending`, `booking.confirm`, `booking.repeat6w`, `booking.repeatWeekly`; make `noun` an i18n key per capability (`booking.noun.vet` ...) with ES nouns carrying their own article (HUMAN: wording per capability).

**T-02 useStorefrontCart - payment alerts in English** (HIGH, MECH, risk low)
- `hooks/useStorefrontCart.js:101-104` `"Complete your payment"` / `"Finish paying in MercadoPago..."`; `:111-114` `"Payment couldn't start"` / `"We couldn't open the payment window, so nothing was charged..."`. `t` is already in scope in this hook (`:19`) and sibling alert at `:117-120` already uses `storefront.checkoutFailedTitle`.
- Canonical: add `storefront.completePaymentTitle/Body`, `storefront.paymentNotStartedTitle/Body` (ES already has analogous `booking.paymentFailedTitle`/`rxf.couldNotPay` = "No se pudo iniciar el pago" to copy tone).

**T-03 Hooks that call `Alert.alert` with English literals** (HIGH, MECH, risk low) - every title is the raw word "Error"
- `hooks/useFeedData.js:121,134-135,236-237,242,269` (Home feed: "Please create your pet profile first.", "Already Posted"/"You've already posted a daily update today!", "Daily video"/"Video posting isn't available for you today", "Could not save: ${error.message}", "Could not delete: ...")
- `hooks/usePetSharing.js:48,50,70,83` ("Invite sent", "They'll get access once they accept.", "Could not invite/respond/revoke.")
- `hooks/useLostFound.js:69,71,92,94,109,111` ("Lost mode on", "Thank you!", "Welcome home! 🐾", ...)
- `hooks/useSocialWalks.js:30,98,102,155,159,188,192` ("Request sent!", "Approved!", "Declined", ...)
- `hooks/useForum.js:63,86`; `hooks/useSelfTraining.js:49`
- Canonical: titles -> `t("common.error")` (exists, `en.json common.error`); retry copy -> `common.couldNotSave` / `common.pleaseTryAgain` / `common.somethingWrong` (exist). New keys needed only for success toasts (invite sent, lost mode on, request sent...). Use `getI18n()` in try/catch inside non-component hooks (do NOT `import i18n from "@/i18n"` in shared util - project gotcha). See T-38 for the `e.message` leakage in the same lines.

**T-04 `app/pet-profile.jsx:187-201` and `app/(tabs)/index.jsx:200-212` - delete-post Alert hard-coded although keys exist** (HIGH, MECH, risk low)
- Literals: `"Delete post?"`, `"This permanently removes the post."` (pet-profile) / `"...You can post a new daily photo afterwards."` (index), `"Cancel"`, `"Delete"`, `"Error"`, `` `Could not delete: ${e.message}` ``.
- Canonical (all exist): `feed.deletePostTitle`, `feed.deletePostBody`, `common.cancel`, `common.delete`, `common.error`, `feed.errorSaveBody`/`common.pleaseTryAgain`. The two screens even use two different body texts for the same action (HUMAN: pick one - recommend the longer one only when it is a daily-photo post).

**T-05 `app/(tabs)/training.jsx` (primary bottom tab "Care") + `data/trainingCurriculum.js`** (HIGH, MECH for chrome / HUMAN for content, risk low/med)
- Chrome strings: `:187` `{done} of {total} sessions done`; `:327` "Want a pro? Hire a trainer"; `:330` "1:1 sessions, group classes, and multi-week programs"; `:346` "Your training journey 🏆"; `:352-353` "{n} of {m} sessions completed across {k} programs"; `:365` "Programs"; `:497` "Step-by-step"; `:562` `"✓ Completed — tap to undo"` / `"Mark as completed"`. Only 4 `t()` calls in the file (`:90,91,268,271`).
- Content: all 701 lines of `data/trainingCurriculum.js` (program/session titles, steps, tips, difficulty "Beginner|Intermediate|Advanced") render verbatim (`training.jsx:140,399,440,482`).
- Canonical: chrome -> new `training.self.*` keys with plurals. Content -> HUMAN decision: translate (keyed by stable `program.key/session.key`, never rename keys) or label as English-only content.

**T-06 Reminder + OS-notification text generators are English-only and persisted/displayed as-is** (HIGH, HUMAN, risk med)
- `utils/reminderGenerator.js:238-239,359-360,502-503,587-588,664-665,730-731,779-780,850-851,897-898,934-935,977-978,1370-1406,2423-2424,2493-2494` (titles/descriptions: "Meal", "General Check", "Check your pet's overall health", "Weight Check", "Log your pet's weight", `${vaccine} Due`, "Time for ...", "Take photo of ...", wellness-check labels/CTAs "Start check"/"Log check"/"Log weight"). Zero `t()` in file. Titles are rendered raw at `components/Health/Reminders/UpcomingTab.jsx:195`, `CountdownCard.jsx:108`, `HeadsUpReminderCard.jsx:60`, `HealthToday.jsx:622` and in Alert bodies (`HealthToday.jsx:238,272,305,312`).
- `utils/notificationGenerator.js:134-135,142-143,150-151,160-161,170-171,188,196-197`; `utils/notifications.js:230` `"${icon} Upcoming: ${title}"` (the only localized-looking push prefix is English); `utils/reminderNotificationSync.js` consumes it. `utils/reminderLogFlow.js:60-90,137` ("Mark completed", "Something was off", "Log as usual", "Added to vet record", notes "Logged as usual" - which is also compared by value at `components/Health/FeedingCountdownCard.jsx:166`).
- `data/remindersData.js:177-418` (seed reminder titles/descriptions "Dinner time", "Dr. Smith at Happy Paws Veterinary" - sample data; verify unused), `:448-449` snooze labels "Tonight"/"Tomorrow", `:455-510` `REMINDER_TYPE_CONFIG.label` ("Preventive Care", "Vet Appointment" ...).
- Canonical: HUMAN - generate with `getI18n().t()` at creation time using the user's locale, or (better) store a type key + params and localize at render. Risk med because titles are stored/compared (`"Logged as usual"` sentinel). Needs design before mechanical work.

**T-07 Routine create/edit modals reached from Reminders > Routines are largely untranslated** (HIGH, MECH, risk low)
All reachable via `components/Health/Reminders/RoutinesTab.jsx:19-27,429-483`. `t()` call counts: Feeding 1, Medication 2, PreventiveCare 1, PhotoCheck 4, Vaccine 3, MedicalCare 6 of 1,273 lines, Wellness 13 of 1,117. Examples (not exhaustive):
- `FeedingRoutineModal.jsx:208-209,327,365,368,406,409,451-456,494,501,522,546-561,611,687,712,734,741,781,809`
- `MedicationRoutineModal.jsx:100,136,186,191,213,218,240-246,290,316,329,343,370,375,417,440,459,501`
- `PreventiveCareRoutineModal.jsx:82,122,125,156,161,183,187-191,236,249,263,267-270,329,352,371,413`
- `VaccineRoutineModal.jsx:79,115,118,149,179,192,206,250,273,292,334`
- `PhotoCheckRoutineModal.jsx:38-80,336-337,348,360,363,389,468,488,509,556,584,608,645,750,780,805`
- `MedicalCareRoutineModal.jsx:252-253,409-410,663,724,776,788,791,815,823,841,854,872,878,883,930,934,938,957,964,986,993,1004,1177`
- `WellnessCheckRoutineModal.jsx:42-62,240-241,285,328-336,445,512,523,562,565,609,619,641,644,736,780,860,894,981,1010,1048,1057,1108`
- `VetAppointmentRoutineModal.jsx:41,116,177,190,459,508-509,528,666,723,792,821,849,889,914-915,949,959,980,1092,1114,1135,1155,1195,1227,1264,1297`
- Shared bits repeated in every modal: "Reminder enabled", "Time-sensitive", "Notes (optional)", "Save Changes", "Create Routine", "Select Days", "Edit"/"Create" prefix, `e.g., ...` placeholders. Existing keys to reuse: `health.reminders.*`, `reminderSettings.*`, `scheduleBlock.*`, `routineCard.*`, `cadenceSelector.*`. Add one shared `routineModal.*` group (EN+ES) and route all eight files to it.
- Note: Medication/Preventive/Vaccine modals are no longer offered by `RoutineTypeSelector` (`components/Health/Reminders/RoutineTypeSelector.jsx:30-37` lists only Feeding/Walk/PhotoCheck/MedicalCare/Wellness/VetAppointment) - they are only reachable when editing legacy routines; lower priority.

**T-08 Reminder UI components with zero i18n** (HIGH, MECH, risk low)
- `components/Health/Reminders/CountdownCard.jsx:130,137,141,232` ("Done", "Mark completed", "Something was off", "Snooze"); `SnoozeModal.jsx:69,117,164` ("Snooze Reminder", "Snooze for:", "Cancel") + `data/remindersData.js SNOOZE_OPTIONS`; `HeadsUpReminderCard.jsx:93,114` ("Close","Edit"); `RoutineTypeSelector.jsx:74,77` ("Create Routine","Choose the type of care routine") + `data/routinesData.js:156-178+ ROUTINE_TYPE_CONFIG` label/description; `WalkCountSelector.jsx:90,113`; `DurationPaceSelector.jsx:58` ("Pace"); `CustomDaysSelector.jsx:5,18` (`["Mon",...]`, "Select Days"); `DayChips.jsx:12` `DAY_CHIP_LABELS` English weekday initials (also used `PhotoCheckRoutineModal.jsx:657`); `SocialWalkToggle.jsx:33,48`; `ReminderSettings.jsx:35,58`; `DeleteConfirmationModal.jsx:21` (`confirmText = "Delete"`; dead? 0 importers); `UpcomingTab.jsx:275,342,392,403`; `RoutinesTab.jsx:271,335,363` ("Loading routines...", "No routines yet", "Create First Routine"); `MedicalCareIssueModal.jsx:98,195`; `HealthToday.jsx:346-347,792` ("Could not save", "Skip").
- Canonical: `common.cancel/close/edit/delete/done/loading` exist; weekday names -> `Intl`/`localeDateTime` helper or existing `cadenceSelector.*` day keys (check `DayChips` ES).

**T-09 Photo Check capture / picker modals** (HIGH, MECH, risk low)
- `components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:44-108` (observation chip arrays "No visible change", "Redness", "Cracked pads" ... used verbatim at `:709-725`), `:111-119` `BODY_AREA_LABELS`, `:140` "Body Area", `:346-347` subtitles, `:393,426,468` paragraphs/CTA "Take Photo", `:841-843` "Uploading..."/"Saving...". Only 11 `t()` calls. Observation labels are also persisted as notes (`:260`), so store a key and localize at display (HUMAN).
- `components/Health/PhotoCheck/PhotoCheckModal.jsx:38-81` (prompts "Any redness, swelling...", labels "Skin / Fur"), `:116,136` raw `alert("Camera permission is required...")`, `:223-225,244,254,333,370,412,448,487,536,562`. 1 `t()` in file.
- `data/photoCheckData.js:49-52,55+` (`"Off","Weekly","Every 2 weeks","Monthly"`, `BODY_AREA_LABELS`), `data/generalCheckData.js:83-127,230-238` (partially localized in `GeneralCheckModal.jsx:66-75` via `tc(areas.*.label)` fallback - that pattern is the right one; reuse).
- Canonical: existing `health.photoCheck.*` and `health.generalCheck.areas.*` keys; `health.photoCheck.cameraPermissionTitle` already exists (`en.json:306,880`) for the raw `alert()`s.

**T-10 `components/Health/WalkActivity/WalkCountdownCard.jsx`** (HIGH, MECH, risk low) `:42` name "Walk"; `:62` `Alert.alert("✅ Walk completed!", `${walk.name} has been logged`)`; `:69-70` "Reminder dismissed"/"Log this walk manually from Health → Track when ready"; `:186,213,236,259` "Add to calendar","Start walk","Log manually","Snooze". Zero `t()`. Existing keys: `calendar.addToCalendar`, `trackers.walk.startWalk`, `trackers.walk.logManuallyDesc`.

**T-11 `utils/calendarIntegration.js` + `utils/healthKitIntegration.js` + `utils/notifications.js` permission/explainer alerts** (HIGH, MECH, risk low)
- `calendarIntegration.js:56-57,209-210,218-220,248-249,258` ("Calendar Access", "Not now", "Allow calendar access", "Permission needed", "Calendar unavailable", "Added to calendar"+" as a repeating event", `Alert.alert("Error", "Could not add walk to calendar. Please try again.")`). Keys already exist in `calendar.*` (`permissionTitle/Body`, `added`, `couldNotAdd`) but are bypassed.
- `healthKitIntegration.js:37-38,46-47,60-61` ("Not Available", "Apple Health Access", "Coming Soon" - this surface is currently hidden by `WALK_TRACKING_INTEGRATIONS_ENABLED=false`, so low urgency).
- `notifications.js:81-96` explainer `Alert.alert("🔔 Enable Reminders", "...", "Maybe later", "Enable reminders")` shown from Getting Started. Equivalent copy already exists: `reminderSettings.enabledTitle/Body`, `reminderSettings.maybeLater`.
- Use `getI18n()` in try/catch (project gotcha).

**T-12 Whole screens with no i18n** (HIGH, MECH, risk low)
- `app/walk-live.jsx:69,72,86-87,153,195-197,244,246,251,255,269` ("Walk in progress","Walk report","Your walker","Walk not found","Distance","Time","GPS points","Summary","Potty","None recorded","Notes", "This walk was added to your pet's Health timeline."). Linked from Services > My Activity and transport tracking. No `useTranslation` in file.
- `app/provider-messages.jsx:77,101,114-115,205` ("Messages","No conversations yet","Message a vet or service provider...","Photo","No messages yet"); `app/provider-chat.jsx:151,246` ("No messages yet. Say hello.","Type a message…"); `app/chat.jsx:39,156,285` ("Pet parent","Say hello to start the conversation.","Send a message…"). Existing keys: `messages.title`, `messages.empty`, `common.petParent`, `business.messages.noMessages`, `nearbyWalks.sayHello`.
- `app/wrapped.jsx:53,77,82` ("Your Wrapped is growing","Share slide","`${pet}'s Wrapped`") and `utils/memoriesWrapped.js:163,204-218` (slide labels "daily moments captured", "longest posting streak", "furry friends made", "Together since" ...). The file has 1 `i18n.t` call only for milestones.
- `app/(tabs)/more/hub.jsx:173,188,194,209,215` ("My Hub","Who has access","No one has access to your pets.","Saved dogs","No saved adoption listings."). Existing: `ownerMenu.myHub`, `petSharing.whoHasAccess`, `adoption.savedDogs`.
- `app/(tabs)/more/community.jsx:355,358` ("No discussions here yet.", "Be the first to bark!"; `feed.barkModal.beFirst` exists).
- `app/service/provider.jsx:539,552` ("Provider not found","This provider isn't available right now."); `app/service/vet.jsx:79,85,141-147` and `app/service/grooming.jsx:86,92,160-166` ("Find and book a vet/groomer", accessibilityLabel "Messages", "Couldn't load vets/groomers", "Something went wrong. Pull down to try again.", "No vets/groomers available yet", "Check back soon - ...") - the telehealth screen already has the localized equivalents (`telehealth.loadErrorBody`, `telehealth.emptyBody`, `telehealth.messagesA11y`).
- `app/index.jsx:235` "Loading..." (has `useTranslation` in file; use `common.loading`). `app/welcome.jsx:117` "PawPi" is the wordmark - OK.
- `app/+not-found.tsx:124,144-190` Anything-platform template ("Page Not Found","Uh-oh! This screen doesn't exist (yet).","Build it from scratch","Create Screen","MOBILE") - HUMAN: replace with a branded, localized 404 or confirm it is dev-only.

**T-13 `components/Health/VetSummary/VetSummaryDashboard.jsx:57,59,101` and `utils/healthInsights.js:13-17,57,69-70,85-168`** (MED, HUMAN, risk low) - "Vet Summary","Prepare for your vet visit","Create Vet Summary", derived insight titles/bodies ("Weight is trending down", "Repeated vomiting logged"...). `VetSummaryDashboard` is rendered by `HealthVetRecord.jsx`; `VetSummaryModal.jsx` has 25 `t()` calls so the dashboard shell is the odd one out. `utils/vetSummaryText.js:23-67` (exported share text) is English by design? HUMAN: decide whether the vet-facing export stays English.

**T-14 `components/Pets/BirthdayOrAgeField.jsx:95,116` and `utils/petAge.js:30-33`** (MED, MECH, risk low) - "Estimated years","Estimated months"; `formatYearsMonths` returns "1 year, 2 months"/"Under 1 month" shown on profile (`pet-profile.jsx`, `more/profile.jsx`, `HealthVetRecord.jsx`). Use i18next plurals (`petAge.years_one/_other`).

**T-15 `components/Feed/*` share/daily fallbacks** (MED, MECH, risk low) - `ShareableMemoryCard.jsx:15,35`, `ShareableDailyCard.jsx:16,44`, `ShareableStatCard.jsx:20,62`, `MemoryShareButton.jsx:15,47`, `DailyShareButton.jsx:12`: `|| "My pup"`, `label = "Share"`, `` `Meet ${name} 🐾 today's daily on PawPi...` ``, dialog title. `memoriesScreen.myPup` / `common.share` exist. "PawPi" wordmark text is fine (brand: typeset, not translated).
- `components/Feed/PostDetailModal.jsx:314` `"Saving…" : "Save"` (use `common.save`; there is a `feed.saving`-style key to add); `PostCard.jsx:141,145` and `PostDetailModal.jsx:93,95` compare `tag === "Daily moment"` (English sentinel string; `feed.dailyMomentTag` exists) - fragile if localized, HUMAN/MED.
- `components/Feed/AdoptionFeedCard.jsx:18` default `freeLabel = "Free to adopt"`; `DayCard.jsx:30` `DAILY_TAG = "Daily moment"`.

**T-16 Hard-coded English fallbacks for names** (LOW, MECH) - `app/(tabs)/more/profile.jsx:148` "My Dog" (vs "My pup", "your pup", "Your pet", "your pet" across files - see T-52), `app/chat.jsx:39` "Pet parent", `components/Providers/StorefrontPanels/ReviewsPanel.jsx:86` "Pet parent" (`common.petParent` exists), `VetAppointmentRoutineModal.jsx:116,177,190` "Your pet", `utils/healthInsights.js:57,163` "Your pet".

**T-17 Provider storefront panels** (MED, MECH, risk low) - `components/Providers/StorefrontPanels/ServicesPanel.jsx:20`, `LocationsPanel.jsx:14`, `ReviewsPanel.jsx:22,50` ("Services","Locations","Reviews","No reviews yet. After a completed appointment...") while `storefront.tabs.*` keys exist (`constants/storefrontTabs.js:24-30`). `AboutPanel.jsx:61` "Google Maps" is a proper noun (OK).

**T-18 Walk-live map empty states** (MED, MECH) - `components/Health/WalkActivity/WalkerLiveMap.jsx:28,38,54-55` ("Location is off for this walk...", "Waiting for the first GPS points…", marker titles "Start"/"Now"). Used by `app/walker-walks.jsx`. `transport.waiting`-style keys exist; add `walkerWalks.mapOff/mapWaiting`.

**T-19 Shared form shells with English defaults** (MED, MECH, risk low) - `components/KeyboardSafeFormModal.jsx:62` (`ctaLabel = "Save"`), `:109` `accessibilityLabel="Close"`; `components/DateField.jsx:37` `"Select date"`, `components/TimeField.jsx:36` `"Select time"`; `utils/auth/AuthWebView.jsx:70` `title="Authentication"`, `utils/auth/useAuthModal.jsx:68` `"Back"`; `components/ui/PawMark.jsx:9` aria-label "PawPi paw prints" (brand SVG, leave). Defaults are overridden by most callers, but every caller that doesn't override ships English; make defaults `t("common.save")` etc.

**T-20 Medication modal "Error" fallbacks** (LOW, MECH) - `components/Health/Medication/MedicationModal.jsx:312,356,392` `e?.message || "Error"` -> `common.error`/`common.pleaseTryAgain`.

**T-21 `app/service/walking.jsx`, `walker-walks.jsx` etc. rely on `t(key, "English default")`** (LOW, MECH) - e.g. `walking.jsx:98-101,130-135,151-154,174,189,194`, `walker-walks.jsx:166,171,176,215,224,229`, `SettingsTab.jsx:69-132`, `nearby-walks.jsx:119,121,195,381,645`, `BookingFormModal.jsx:342-347`. Keys exist in both locales so ES works, but the inline defaults duplicate copy and drift (`reminderSettings.quietHours` default vs `health.reminders.settings.quietHours`). Remove defaults once keys are confirmed (grep shows ~5 `defaultValue` + many positional-default calls).

### Medium impact

**T-22 Placeholders / hints that are English-only** (MED, MECH) - `components/Health/VetRecord/EditMedicalProfileModal.jsx:554,560,573,581,594,600` ("e.g., Dr. Sarah Johnson", "e.g., Happy Paws Veterinary Clinic", "clinic@example.com", "e.g., Jane Doe", "e.g., PetPlan Premium", "e.g., PP123456789"), `:138-154` validation errors ("Please enter a valid email/weight/date"), `:443` `["Spayed","Neutered","Not spayed/neutered","Unknown"]`; `components/Health/Reminders/MedicalCareRoutineModal.jsx:788,934,1004`, `MedicationRoutineModal.jsx:191,218,375`, `FeedingRoutineModal.jsx:501,741`, `PreventiveCareRoutineModal.jsx:161`, `WellnessCheckRoutineModal.jsx:743`, `VetAppointmentRoutineModal.jsx:528,666`; `app/chat.jsx:285`, `provider-chat.jsx:246`. Note `EditMedicalProfileModal.jsx` has 30 `t()` calls already, so these are leftovers (placeholders `editMedicalProfile.ph*` keys likely exist - check before adding).

**T-23 Status/label lookup tables in English** (MED, MECH, risk low) - `app/rx-fulfillment.jsx:28-36` (`STATUS_LABEL`: "Out for delivery"...), `app/insurance-policy.jsx:26-32` ("Under review","Awaiting payment","Lapsed"), `app/(tabs)/more/data-access.jsx:27-35` (`SCOPE_LABELS` "View medical records", "Add vet notes"...), `components/Health/Reminders/CadenceFrequencySelector.jsx:14-25` (`CADENCE_LABELS`; component localizes via `CADENCE_I18N_KEYS` but `WellnessCheckRoutineModal.jsx:697` and `PhotoCheckRoutineModal.jsx:448` use the English table directly), `data/routinesData.js:69` `CADENCE_LABELS`. Map status -> `t(\`rxf.status.${status}\`)` (same pattern as `business.bookings.status.*`).

**T-24 `app/notifications.jsx:44-50` `FILTER_OPTIONS` = "All","Requests","Bookings",... ** (LOW) - only used as ids; label comes from `filterLabel()` (OK). No change; listed so reviewers do not re-flag.

**T-25 `data/foodWaterData.js:171-183`** ("Breakfast","Lunch","Dinner","7:00 AM (tomorrow)") and `data/mockData.js` (sample vets/pets/products) - verify dead; if live, violates "no mock data" (CLAUDE.md) as well. `mockData.js` has no importers found. MED, HUMAN (delete if dead).

**T-26 `utils/socialWalkNotifications.js:22-126`** (title/message/label English: "Join request","Maybe later","New walk request","Walk request approved!") - 0 importers found outside tests; dead? (LOW).

**T-27 `utils/telehealthJoinGate.js:70-80`** `describeTelehealthJoinWait` returns English sentences ("Your consult starts at ...") - no non-test caller found (dead?). LOW.

**T-28 `components/Health/HealthToday.jsx` / `FeedingCountdownCard.jsx` emoji-prefixed alert titles built as `` `✅ ${t(...)}` `` ** - localized, but see tone T-70.

**T-29 `components/Health/HealthInsights.jsx`** hard-coded sample insights (`:58-265,604-608`) - hidden behind `SHOW_INSIGHTS=false` (`constants/healthSections.js:13`), so ignore until re-enabled; it is also fake data.

**T-30 Dead / unreferenced English UI** (INFO) - 0 importers found: `components/Health/Reminders/ReminderCreationModal.jsx`, `components/Health/GeneralCheck/GeneralCheckDashboard.jsx`, `components/Health/VetRecord/{VetInformation,RecentRecords,VetRecordHeader,QuickActions,PhotoHistorySection,InfoBox}.jsx`, `components/Feed/FeedHeader.jsx`, `components/Health/Reminders/DeleteConfirmationModal.jsx`. Recommend deleting rather than translating (confirm with `git log`).

**T-31 Accessibility labels** (LOW, MECH) - `app/wrapped.jsx:77`, `app/service/grooming.jsx:92`, `app/service/vet.jsx:85` ("Messages"), `components/KeyboardSafeFormModal.jsx:109`, `utils/auth/useAuthModal.jsx:68`.

**T-32 `hooks/useProviderPosts.js:51`** `let message = "Failed to post your moment"` surfaced to users (see T-39).

**T-33 `components/Health/WalkActivity/PostWalkFeedbackModal.jsx:124,153-154`** - default notes saved as English ("Normal walk", "Limping or stiffness observed", "Unusual behavior noted"); stored data, shown later in the timeline in whatever language the user had at log time. HUMAN (store codes, localize on read).

---

## 2. i18n integrity (keys / locale files)

**T-34 Duplicate top-level `ownerMenu` namespace in BOTH locale files** (MED, MECH, risk low) - `en.json:2523` and `en.json:3839`; `es.json:2523` and `es.json:3839`. `JSON.parse` / Metro keep only the LAST block, so first-block-only keys (`sectionYourAccount`, `memoriesWrapped`, `remindersRoutines`, `resetAppData`) are silently dropped. No code references them today (checked), but any future use returns the key string. Canonical: merge into one block (keep the second block's keys; delete or fold the four orphan keys). Verified no other duplicate sibling keys exist in either file (all 3471 flatten identically).

**T-35 Parallel duplicate namespaces for the same screen** (LOW, HUMAN) - `health.reminders.settings.*` (`en.json:~1000-1011`) vs top-level `reminderSettings.*` (`en.json:3497-3512`) hold the same strings ("Permission Needed", "Maybe Later", "Quiet Hours", "Configure quiet hours (coming soon)") with diverging ES. `SettingsTab.jsx` uses both. Pick one namespace.

**T-36 Literal `t()` key existence check: PASS** - 0 missing in EN, 0 missing in ES across `t(`, `tr(`, `tc(` wrappers, `_one/_other` plural families and `labelKey`-style string keys. Dynamic families checked present: `business.bookings.status.*`, `business.adoption.status.*`, `community.category.*`, `discover.cap.*`, `placeReviews.welcome.*/amenity.*`, `gettingStarted.items.*`, `onboarding.handleReason.*`, `profileEdit.gender{Male,Female,Unknown}`, `nutrition.form_*`, `notifications.type_*`/`*Fallback`, `bizNotifBell.*`. (ES plural `_many` is never defined for Spanish; i18next falls back to `_other`, fine.)

**T-37 ES values identical to EN** (INFO, no action) - only 13, all intentional (brand/units/placeholders: "Apple Health", "{{count}} min", "🎥 {{count}} video").

---

## 3. Raw / technical error text shown to users

**T-38 Production "Debug:" banner in Walk Routine editor** (HIGH, MECH, risk low) - `components/Health/Reminders/WalkRoutineModal.jsx:370-392` renders `🔧 Debug: {debugStatus}` unconditionally (comment says "Development Only" but there is no `__DEV__` guard). Strings set at `:68,72,94,123,132,149,167,178,183,197,207` include `Delete failed: ${error.message}`, `Saving to database (routine ${id})`, "Error: No routine ID". Fix: wrap in `__DEV__` or delete the banner; surface failures via the existing `walkRoutine.couldNotDelete` alert (`:169,199` already do). **Highest-priority text bug.**

**T-39 Hooks throw English "Failed to ..." and callers show `e.message`** (HIGH, MECH, risk med) - examples: `hooks/useFeedPosts.js:78,139,180,294,318`, `hooks/useHealthTracking.js:38,89,139,194,241,292`, `hooks/useEvents.js:34,56`, `hooks/useCareAccessGrants.js:62,93`, `hooks/useDMs.js:50,75`, `hooks/useProviderPosts.js:51`; surfaced through ~60 sites of the form `Alert.alert(t("..."), e.message || t("common.pleaseTryAgain"))`: `app/walker-walks.jsx:134,199`, `app/service/{transport:102,149; sitting:412; daycare:505; training:442; insurance:77}.jsx`, `app/(tabs)/more/{profile-edit:121,280; data-access:80}.jsx`, `app/{events:100,106; event-create:61; nutrition:79; rx-fulfillment:89,130; insurance-policy:81; sitter-visits:210}.jsx`, `components/Providers/{BookingFormModal:372; WriteReviewModal:58}.jsx`, `components/Health/{VetAppointmentDetailModal:78,108; AddVetNoteModal:57}.jsx`, `components/adoption/AdoptionListingViews.jsx:239,261,282`, `components/moderation/ModerationMenu.jsx:83,109`, `components/Settings/AppSettings.jsx:654`. Server `error.error` strings may be fine if the API localizes, but client-originated ones ("Failed to create post", "No current pet selected") always leak English into ES.
- Canonical: a single `userFacingError(e, t)` helper: show `e.message` only for an allow-listed `ApiError` with a `code`; else `t("common.somethingWrong")`. Interim MECH fix: in the hooks, throw typed errors with `code` and let the screen map code -> key. HUMAN: decide whether server messages are localized server-side.

**T-40 Bare `e?.message` as the Alert body (no fallback)** (MED, MECH) - `app/walker-walks.jsx:176,229`, `app/service/walking.jsx:135,143,194`: if `message` is undefined the alert is title-only; if it is a network error it reads "Network request failed". Add `|| t("common.pleaseTryAgain")` and the helper from T-39.

**T-41 HTTP status / statusText in user-visible errors** (MED, MECH) - `utils/useUpload.js:144,150` (`Upload failed: File too large.`, `` `Upload failed: ${status} ${errorText}` `` - the response BODY is shown), reaching users via `hooks/useFeedData.js:159` -> Alert `Could not save: Upload failed: 500 {...}` (`:242`), and `app/vet-business-access.jsx:293-294`. Also `components/Health/HealthToday.jsx:292,369` (`Save failed: ${res.statusText}`), `components/Health/WellnessCheck/WellnessLogModal.jsx:121` (`Save failed: ${res.status}`), `components/Health/Reminders/WalkRoutineModal.jsx:145`, `utils/routinesQuery.js:15`. Never show status/body; map 413 -> a localized "That file is too large".

**T-42 `components/Health/Reminders/WellnessCheckRoutineModal.jsx:285`** `` setError(`Could not add check item: ${err.message}`) `` rendered inline (English prefix + raw message). Use `wellnessCheck.*` key.

**T-43 `app/onboarding.jsx:588`** uses the browser-style global `alert(error.message || t(...))` (also `components/Health/PhotoCheck/PhotoCheckModal.jsx:116,136`) - raw message in a system alert with no title. Use `Alert.alert(t("common.error"), ...)`.

**T-44 `app/vet-business-access.jsx:299,385` and `app/service/telehealth.jsx:197`** set inline error state to `err?.message` (raw SDK/network text such as "Network request failed" or "JSON Parse error: ...").

**T-45 Inconsistent generic-error copy** (LOW, HUMAN) - "Something went wrong. Please try again." (`common.somethingWrong`), "Something went wrong. Pull down to try again." (`telehealth.loadErrorBody`, `adoption.pullDownRetry`), "Something went wrong. Pull down or tap retry." (`discover.loadErrorBody`, `es.json:1430`), "Pull down to try again." (`shop.pullDownRetry`, `walkHistory.errorBody`). Pick one load-error pattern + one action-error pattern.

**T-46 Error title is the bare word "Error"** (LOW, HUMAN) - 64 EN values contain "Error"; `common.error`="Error", `feed.errorSaveTitle`="Error" (`en.json:2495`), `health.reminders.vetAppt.validationTitle`="Validation Error", `onboarding.photoCameraErrorTitle`="Camera Error", `...photoGalleryErrorTitle`="Gallery Error". Prefer the specific "Couldn't save"/"Couldn't open camera" style already used in 81 other keys.

---

## 4. Terminology variants

**T-47 "Log in" vs "Sign in" (+ "Log out")** (MED, HUMAN, risk low) - `welcome.logIn`="Log in" (`en.json:2716`), `vetBusinessAccess.logIn` (`:3189`), `vetBusinessAccess.gateSubtitle` ("Log in or create an account..."); but `storefront.comments.signInCta/signInPrompt`="Sign in" (`:1593,1609`), `storefront.follow.signInCta`, `claim.signIn`/`claim.signInPrompt`="Sign in to claim..."; and `business.profile.logOutConfirmBody` mixes: "You'll need to sign in again" under a "Log out?" title (`:1907-1909`, `:3853`). ES is consistent ("Iniciar/Cerrar sesión") so only EN drifts. Recommended: "Log in / Log out" everywhere (matches the welcome screen and menu), change the 6 "Sign in" strings and the body copy.

**T-48 Delete vs Remove for the same action** (MED, HUMAN) - comment: `moderation.deleteCommentTitle`="Delete comment?" (`en.json:72`) vs `storefront.comments.deleteConfirmTitle`="Remove comment?" (`:1596`) + `storefront.comments.remove`; documents: `health.vetRecord.deleteDocTitle`="Delete document?" but body `deleteDocBody`="Remove "{{name}}"?"; routines: `routineCard.deleteRoutine`="Delete Routine", `walkRoutine.removeRoutine`="Remove routine", `walkRoutine.deleteRoutine`="Delete routine"; `health.generalCheck.removePhoto`. Rule suggestion: Delete = destroys data (comments, docs, routines, account); Remove = detaches (remove photo, remove from cart, `storefront.removeOne`, remove from saved).

**T-49 Duplicate generic button labels instead of `common.*`** (MED, MECH, risk low) - "Cancel" is defined 11 times (`business.adoption.cancel`, `events.cancel`, `health.medications.cancel`, `health.prescriptions.cancel`, `health.vetAppt.cancel`, `health.vetRecord.addDoc.pickCancel`, `health.vetRecord.cancel`, `storefront.comments.cancel`, `trackers.weight.modal.cancel`, `walkRequests.cancel`, `common.cancel`); "Delete" 5x, "Close" 4x, "Save" 5x, "Done" 3x. Route call sites to `common.*` (MECH) - also fixes the hard-coded `"Cancel"`/`"Delete"` literals in T-04/T-07. ES values are identical per label, so no translation work.

**T-50 "handle" (EN) vs "usuario" (ES) vs "username" (code/`@{{username}}`)** (MED, HUMAN) - EN: `onboarding.handleTitle` "Choose {{name}}'s pet handle" (`en.json:2163`), `onboarding.reviewHandle`/`profileEdit.fieldHandle`="Handle" (`:2208,3453`), `follows/createWalk/petSharing.searchPlaceholder` "@handle", `packStreaks.handlePlaceholder` "friend's @handle"; ES: "usuario" / "@usuario" everywhere (`onboarding.handleTitle`: "Elegí el usuario de {{name}}"). Pick one concept: recommended "username" in EN (matches ES "usuario" and platform convention) or keep "handle" but add ES "nombre de usuario (@)".

**T-51 "dog" vs "pet"** (MED, HUMAN) - EN: "Dog Profile" (`dogProfile.title`, `ownerMenu.dogProfile` `en.json:2530,3848`) vs "Pet profile" (`petProfile.petProfile` `:32`); "My Dogs" (`pets.myDogs` `:2587`), "Saved dogs"/"SAVED DOGS", `ownerMenu.logOutConfirmBody` "your dog's profile" vs `common.petParent`="Pet parent", `settings.madeWith`="dog parents" (`:159`), `search.petParents`="PET PARENTS" (`:1048`), `messagesScreen.petParent`. ES mirrors with "perro"(75) vs "mascota"(88): `ownerMenu.dogProfile`="Perfil del perro" next to `booking.noActivePetTitle`="Sin mascota activa". Product decision: PawPi is dogs-first (CLAUDE.md "dog") but data model/other species use "pet". Recommend: "pet" as the generic noun in system messages, "dog" only in marketing/onboarding.

**T-52 Fallback name for the pet: "your pup" / "My pup" / "My Dog" / "Your pet" / "your pet"** (LOW, HUMAN) - `engageNotif.petFallback`, `weeklyDigest.petFallback`, `lifeStage.petFallback`, `welcomeBack.petFallback`... all "your pup"; `memoriesScreen.myPup`="My pup"; hard-coded `More/profile.jsx:148` "My Dog"; `common.yourPet`="your pet"; `VetAppointmentRoutineModal.jsx:116` "Your pet". Consolidate to one fallback key.

**T-53 "Pet parent" vs "owner" vs "Dueño"** (LOW, HUMAN) - `common.petParent`, `placeReviews.anonReviewer`="Pet parent", `walkPickup.*`/`sitterVisits.*` say "the owner", `petProfile.owner`="Owner", `bizNotif.walkRequestsHint` "pet owner". Recommend: "pet parent" for the user-facing person label, "owner" in provider-side (business) copy only.

**T-54 "friend" / "pack" / "follower" vocabulary** (LOW, HUMAN) - 39 "friend" strings (`notifPrefs.social`="Friends & social", `weeklyDigest.friendsTitle`, `leaderboard.flavor_friends`, `packStreaks.empty`) vs "follower/following" (`follows.*`, 11+5) vs "pack" (24: `welcomeBack.friendsTitle`="WHAT YOUR PACK DID", `packStreaks.*`). The app has a one-way follow model (see `components/Providers/ProviderFollowButton.jsx`), so "friends" is inaccurate in `onboarding.previewPostDailyHint`="Share this moment with friends", `feed.petFriendsMoments`. Pick: "followers" for the graph, "pack" only for the streak feature.

---

## 5. Capitalization

**T-55 EN Title Case vs sentence case in the same UI areas** (MED, HUMAN, risk low) - 271 EN values with 2-5 words are Title Case, e.g. `health.vetRecord.*` ("Add Record", "Emergency Card", "Complete Profile", `en.json:~190-230`), `settings.*` ("Contact Us", "Help Center", "Privacy Policy" `:151-153`), `health.reminders.settings.*` ("Time-Sensitive Alerts", "Default Snooze Duration" `:1000-1011`), `health.todayView.*` ("Due Soon", "Next Up" `:644`), `health.insightsView.*`, `walkRoutine.deleteBtn`="Delete Walk Routine" (`:3423`), `routineCard.deleteRoutine`="Delete Routine", `health.reminders.upcoming.deleteTitle`="Delete Reminder". Sentence case is used by the newer screens: "Delete account", "Delete appointment", "Cancel auto-reorder", "Add care item", "Next due date", `health.trackScreen.*` partly. Recommended canonical: **sentence case** for buttons/labels/headings (matches iOS HIG and the newest keys; ES already is sentence case); keep Title Case only for proper nouns/feature names ("Quick Check", "Photo Check", "Vet Summary"?). HUMAN decision first, then a mechanical pass.

**T-56 Within one file, mixed styles** (MED, MECH after T-55) - e.g. `MedicalCareRoutineModal.jsx:409-410,724-1177` use sentence case ("Add care item", "Next due date", "Reminder timing") but the sibling legacy modals use Title Case ("Meal Name", "Last Given", "Save Changes", "Create Routine", "Select Days", `FeedingRoutineModal.jsx:494,809`, `PreventiveCareRoutineModal.jsx:236,249,263`, `VaccineRoutineModal.jsx:149,179,192`). `ReminderCreationModal.jsx:142-143` "Create Reminder". Fix together with T-07.

**T-57 ALL-CAPS section headers stored as literals (EN 70, ES 78) alongside normal-case headers** (MED, HUMAN) - EN literals: `dogProfile.petInformation`="PET INFORMATION", `settings.walkTrackingSection`="WALK TRACKING", `health.vetSummary.worthDiscussing`="WORTH DISCUSSING WITH YOUR VET", `search.petParents`, `transport.myTrips`="MY TRIPS", `rxf.chooseProvider`="CHOOSE A PHARMACY" (`en.json:1216`), `adoption.savedDogs`, `telehealth.myConsults`, `weeklyDigest.bestMoment`, `feed.suggestedForYou`, `petSharing.whoHasAccess`... vs the same kind of header in normal case (`health.hubTitle`="Health Hub", `forum.composeTitle`). Prefer storing sentence case and applying `textTransform: "uppercase"` in the style so locales/a11y readers aren't forced; ES uppercase literals (`rxf.chooseProvider`="ELIGE UNA FARMACIA", `es.json:1216`) lose accents/voseo risk. MECH per key but touches ~150 keys - batch separately.

**T-58 ES Title Case slips** (LOW, MECH, risk low) - 13 values capitalise Spanish like English: `tabs.storesVets`="Tiendas y Veterinarias", `health.hubTitle`="Centro de Salud", `onboarding.photoOpenSettings`/`reminderSettings.openSettings`="Abrir Ajustes", `ownerMenu.memories`="Recuerdos y Wrapped" (brand OK), `trackers.poo.shapeLabel`="Forma / Consistencia", `trackers.poo.effortLabel`, `editMedicalProfile.fieldGender`="Sexo / Género", `fieldSpayNeuter`="Castrado / Esterilizado", `vetBusinessAccess.instagramPlaceholder`="URL de Instagram". Spanish canonical: sentence case ("Tiendas y veterinarias", "Centro de salud", "Abrir ajustes").

**T-59 Capitalization of the same term across keys** (LOW, MECH) - "Open Settings" (`onboarding.photoOpenSettings`, `reminderSettings.openSettings`) is Title Case while sibling action labels are sentence case; "Mixed Breed" (`onboarding.breedMixed`, `app/(tabs)/more/profile.jsx:42`, `components/BreedPicker.jsx:23` hard-coded constant `MIXED_VALUE = "Mixed Breed"` compared by value - fragile, HUMAN); "Photo Check" vs "Photo check" (`health.trackScreen.photoCheckLabel` vs `health.photoCheck.cameraError` copy "photo check").

---

## 6. Punctuation

**T-60 Ellipsis: `...` vs `…`** (LOW, MECH, risk low) - EN 35 values use three dots, 50 use `…` (ES the same split): three-dot examples `common.additionalNotesPlaceholder` (`en.json:117`), `dogProfile.loading` "Loading profile..." (`:13`), "Saving..." (`:848,2730,2841,2880,3007`), "Uploading..." (`:2901`), `trackers.vomit.uploadingPhoto`, "Saving walk..." (`:3821`), "Say hello..." (`:3493`), 14 `*Placeholder` notes (`:436,530,851,857,892,942,962-972,2543,2549,3689`). `…` examples: `common.loading` "Loading…", `health.vetRecord.loading`, `feed.loadingPosts`. Hard-coded: `components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx:841,843`, `MedicalCareRoutineModal.jsx:1004`, `WalkRoutineModal.jsx:123`, `app/index.jsx:235`, `nearby-walks.jsx:645`. Canonical: `…` (U+2026), dominant in newer code. Same in ES (`es.json` same lines).

**T-61 "e.g.," vs "e.g." and ES "ej." vs "Ej."** (LOW, MECH) - EN 22 values `e.g., X` (`en.json:526-531`) vs 20 `e.g. X` (`:2204,3885`); ES 39 `ej. X` vs 4 `Ej. X` (`es.json:3885`). Canonical (US): `e.g., X` / ES `ej.: X`? Prefer plain `ej. X` lowercase.

**T-62 Trailing period / `!` rules** (LOW, HUMAN) - Titles never end in `.` (0 of 485 title/label keys - good) but 9 titles end in `!` (`booking.requestSentTitle`="Request sent!", `writeReview.postedTitle`="Thanks!", `health.todayView.alertDoneTitle`="Done!", `feed.emptyTitle`="No pet moments yet!", `postComposer.luckyTitle`) while the sibling confirmations are plain ("Invite sent", "Deleted", "Calendar event updated"). 71 long body/hint strings have no terminal punctuation (`health.trackScreen.*Desc`, `health.photoCheck.scheduleSubtitle` `en.json:~660`), while most bodies end with `.`. Rule suggestion: bodies end with `.`; subtitles/descriptions under a heading do not; no `!` except celebratory moments.

**T-63 Confirmation titles inconsistently phrased as questions** (LOW, HUMAN) - "Delete post?", "Delete comment?", "Cancel trip?" vs "Delete Reminder" (`health.reminders.upcoming.deleteTitle`), "Delete Walk Routine" (`walkRoutine.deleteBtn`/button, but the title `walkRoutine.deleteLastTitle` uses "?"), "Remove comment?". Canonical: destructive confirm TITLE = "Verb object?"; BUTTON = "Verb object" (no `?`).

---

## 7. Tone / voice (incl. ES voseo)

**T-64 "Could not" (45) vs "Couldn't" (81)** (MED, MECH, risk low) - same-purpose errors alternate: `common.couldNotSave`="Could not save. Please try again.", `health.feeding.errorBody`, `health.photoCheck.cameraError`, `onboarding.saveProfileError`, `addDog.errorTitle`... vs `storefront.comments.deleteError`="Couldn't remove the comment.", `events.couldNotRsvp`="Couldn't RSVP" (`en.json:1318`), `reminderSettings.testFailed`. Canonical: "Couldn't ..." (majority, friendlier, matches brand tone). One search/replace over `en.json` plus hard-coded fallbacks (`HealthToday.jsx:346`, `calendarIntegration.js:220`). Also `settings.deleteFailed`="Failed to delete account" (the only "Failed to" key) -> "Couldn't delete your account".

**T-65 "Please try again." suffix** (LOW, HUMAN) - appended in 46 keys, omitted in ~37 sibling error keys (`health.vetRecord.deleteDocError`="Could not delete the document."). Pick: always include "Try again in a moment." or never; ES uses "Probá de nuevo" inconsistently too.

**T-66 ES voseo slips (neutral/tuteo forms in an Argentine-voseo locale)** (MED, MECH, risk low; ES-only edits) - `es.json`: 
- `:401` `recordSoonBody` "usa Nota veterinaria... adjunta un Documento" -> "usá ... adjuntá"
- `:1229` `payUnavailableBody` "podrás seguirlo; podrás pagar" -> "vas a poder"
- `:1345` `savedBody` "Puedes actualizarlo" -> "Podés actualizarlo"
- `:1430` `loadErrorBody` "Desliza hacia abajo o toca reintentar" -> "Deslizá ... tocá"
- `:1487` `liveWalkSub` "Sigue el paseo" -> "Seguí el paseo"
- `:1581` `addPetTitle` "Primero agrega una mascota" -> "agregá"
- `:1629` `availableWhenVetStarts` "Podrás unirte" -> "Vas a poder unirte"
- `:1909` `business.profile.logOutConfirmBody` "Tendrás que iniciar sesión" -> "Vas a tener que" (note the owner-menu sibling at `:3853` already says "Vas a tener que")
- `:1932` `alreadyDecidedBody` "desliza para actualizar" -> "deslizá"
- `:1983` `walkSchedule.usesWalk` "Usa un paseo" -> "Usá"
- `:601` `health.careRing.streakRepairCta` "Recupera tu racha" -> "Recuperá"
- `:1216` `rxf.chooseProvider` "ELIGE UNA FARMACIA" -> "ELEGÍ UNA FARMACIA"
- Also "Por favor ingresá" appears once (`trackers.weight.modal.enterWeight`) while the other 30 validation messages omit "Por favor".
Plus word choice drift: "añadir/añade" (`es.json:1352-1358`, calendar.*) vs "agregar" (dominant); "aquí" 8x vs "acá" 23x; "ordenador"-style none found. Canonical: voseo + "agregar" + "acá".

**T-67 Tone of fallbacks/titles: neutral vs playful** (LOW, HUMAN) - playful: "No pet moments yet!", "Be the first to bark!", "Welcome home! 🐾", "Say hello..."; clinical: "Validation Error" (`health.reminders.vetAppt.validationTitle`), "Missing Type"/"Missing Title" (`health.reminders.creation.missingTypeTitle`), "Permission Needed" (x2), "Camera Access Required" (`onboarding.photoCameraDeniedTitle` `en.json:2236`) vs "Camera Permission Required" (`health.photoCheck.cameraPermissionTitle`, `onboarding.previewCameraPermTitle`) - same permission, 3 phrasings (also "Calendar Permission"/"Calendar access" `calendar.permissionTitle`). Recommend one permission pattern: "Allow camera access" / body "PawPi needs ... to ...".

**T-68 Emoji in titles/buttons inconsistent** (LOW, HUMAN) - alert titles built as `` `✅ ${t(...)}` `` (`HealthToday.jsx:218,269,305,312,322`, `FeedingCountdownCard.jsx:68`, `FeedingIssueModal.jsx:86`, `VetAppointmentDetailModal.jsx:67`) and `⏰` (`HealthToday.jsx:433`); `reminderSettings.enabledTitle`="✅ Notifications Enabled" (emoji inside the key); hard-coded `"✅ Walk completed!"`, `"Welcome home! 🐾"`, `"🔔 Enable Reminders"`; most other alerts have none. Also the same `Done!` appears with and without ✅ (`health.todayView.alertDoneTitle` vs `health.reminders.upcoming.doneTitle` `en.json`). Recommend: no emoji prefix in Alert titles (a11y/translation), emoji only in celebratory bodies.

**T-69 Second-person vs imperative on empty states** (LOW, HUMAN) - "Check back soon - X are joining PawPi" (4 variants: `telehealth.emptyBody`, `adoption.noDogsNearBody`, `shop.shopsComingSoon`, `discover.emptyBody` "Trusted pet businesses are joining PawPi. Check back soon."), "No X yet" vs "No X available yet" ("No vets available yet" `vet.jsx:146`, "No groomers available yet" `grooming.jsx:165`). Share one `emptyDirectory` pattern.

**T-70 "Coming soon" user-facing placeholders** (LOW, HUMAN) - `reminderSettings.quietHoursSoon`="Configure quiet hours (coming soon)" (`en.json:1005,3507`), `health.comingSoonBadge`="COMING SOON", `health.recordSoonBody`, `utils/healthKitIntegration.js:60` "Coming Soon". QA bug 12 (see `constants/featureFlags.js`) already established "users never see 'coming soon' controls" - these remain.

**T-71 "Dr."/formal vs informal in placeholders** (LOW, HUMAN) - EditMedicalProfile "e.g., Dr. Sarah Johnson" (US names) while the ES-locale user base is Argentine (`vetBusinessAccess.businessNamePlaceholder`="Veterinaria Patitas Felices" is localized). Localize example values per locale.

**T-72 Brand voice words** (LOW, HUMAN) - "bark"/"paw" are brand verbs (`feed.barkModal.beFirst`, `notifPrefs.socialHint` "Paws, barks and new friends"); ES keeps "bark"/"paw"? (`community`/`feed` in ES use "ladrar/pata"?). Confirm a short glossary (bark, paw, pack, moment, daily, Wrapped, Quick Check) and put it in `docs/` so T-47..T-54 are enforced.

---

## 8. Suggested execution order

1. **Quick MECH wins (single PR, no copy decisions):** T-38 (remove/guard Debug banner), T-02, T-03/T-04 (use existing keys), T-10, T-11, T-12 (reuse existing keys), T-19, T-20, T-34, T-49, T-60, T-66 (ES-only voseo edits).
2. **Add-keys PRs (EN+ES, mechanical):** T-01, T-05 chrome, T-07/T-08/T-09 (routine + photo-check modals, ~400 strings, shared `routineModal.*` group), T-14, T-15, T-17, T-18, T-22, T-23.
3. **Needs-human first:** T-06 (reminder text generation design), T-39 (error-helper policy), T-05 content (curriculum translation), T-47..T-55 (terminology + Title/sentence case policy), T-57.
4. **Cleanup:** delete dead components (T-30, T-25, T-26, T-27), then re-run `localeParity.test.js`.

Verification hints for whoever fixes: `i18n/localeParity.test.js` already guards EN/ES key parity; extend it to (a) fail on duplicate top-level namespaces (T-34), (b) fail on hard-coded `Alert.alert("` literals via a simple regex test (the `alerts.js` scratchpad script is a working prototype).


---

## §2. Buttons & popups

Scope: `anything/apps/mobile/src`. Read-only. Paths below are relative to that `src` dir.
Counts come from scripted scans (regex over `.jsx`, tests excluded). Where a scan is heuristic it says "~". Every `file:line` was taken from tool output.

## 0. Shared building blocks that already exist

| Thing | Where | Notes |
|---|---|---|
| `Button` (primary / secondary / tonal / ghost, sm/md/lg, `loading`, `disabled`, `a11y role+label`) | `components/ui/Button.jsx` | Radius `RADIUS.control`. **No destructive variant. `sm` is about 34pt tall (8+18+8).** |
| `PressableScale` (spring, reduce-motion safe, telemetry `trackId`) | `components/ui/PressableScale.jsx` | Visual wrapper only. No min size, no a11y defaults. |
| `Sheet` / `Grabber` (surface only, wrap in `<Modal>`) | `components/ui/Sheet.jsx` | Used by **1** file (`components/Health/HealthInsights.jsx:28`). |
| `KeyboardSafeFormModal` (header + KeyboardAwareScrollView + fixed CTA) | `components/KeyboardSafeFormModal.jsx` | Used by **4** screens. |
| `KeyboardAwareScrollView` | `components/KeyboardAwareScrollView.jsx` | The documented convention for modal forms. |
| `MATERIALS.overlay` (scrim `rgba(59,36,27,.45)`) | `constants/elevation.js:56` | Used by 2 files. |
| `RADIUS.control` (16) / `RADIUS.chip` / `RADIUS.card` / `RADIUS.sheet` | `constants/spacing.js` | |
| `sonner-native` + `@gorhom/bottom-sheet` | `package.json:25,115` | **Dead weight on native.** `Toaster` is mounted only in `../App.web.tsx:51`. `@gorhom` is never imported. `ActionSheetIOS` is used in 2 files. |

## 1. Summary table

| Metric | Count |
|---|---|
| Pressable-family elements (TouchableOpacity + PressableScale + Pressable) | 861 (497 / 322 / 42) |
| Screens importing shared `Button` | **3 files, 5 `<Button>` usages** (`app/welcome.jsx`, `app/onboarding-photo.jsx`, `components/ErrorBoundary.jsx`) |
| Files with raw `TouchableOpacity` | 124 files (479 usages). 319 of them are in `components/Health/*` |
| Ad-hoc coral-filled "primary button" style blocks (heuristic) | ~112 blocks in 67 files |
| Distinct radii on those blocks | `RADIUS.control` 29, `RADIUS.chip` 16, literal 16 (15), 14 (15), 999 (8), 12 (7), 18 (5), 10 (4), 24 (3), others |
| Pressables with explicit width/height below 44 and no `hitSlop` (inline styles only) | **75** in about 60 files |
| `hitSlop` used at all | 30 uses in 21 files |
| Pressables with no `accessibilityRole` | 630 of 861 |
| Icon-only pressables with no `accessibilityLabel` (~) | ~148 |
| Distinct "delete" icon/text colours | 7 or more (see B-09). There is no `COLORS.danger` token. |
| `Alert.alert` calls | 321 in 92 files |
| ...info/error/success with no buttons | 271 |
| ...confirm dialogs (2+ buttons) | 49 (all have a cancel-style button) |
| ...with `style: "destructive"` | 35. Only 1 delete-like confirm lacks it. |
| ...showing raw `error.message` in the body | **77 call sites in 44 files** |
| ...hard-coded English (no `t()`) | ~44 (mostly `hooks/*` and `utils/*`) |
| ...success confirmations shown as a blocking Alert (should be toasts) | ~42 |
| `<Modal>` instances | 79 real (68 files): 28 `pageSheet`, 51 plain slide/fade |
| `<Modal>` without `onRequestClose` | **0** (the two grep hits are comments in `constants/motion.js:12` and `components/ui/Sheet.jsx:7`) |
| Hand-rolled bottom sheets (`borderTopLeftRadius` 20/24/28 literal) | ~24 vs 1 using `<Sheet>` |
| Raw scrim literals (`rgba(0,0,0,.5/.35/.55/.4/.45)`, `rgba(59,36,27,..)`) | ~30 sites, 9 or more different values, vs 2 using `MATERIALS.overlay` |
| Modal forms with TextInput on KAV + bare `ScrollView` (documented as broken in pageSheet) | 13 files (7 are pageSheet); 3 more have KAV only; 2 have a bare ScrollView with no keyboard handling |

---

## 2. BUTTON findings

### B-01 Shared `Button` is nearly unused (widespread). RISK: med (visual diffs), mechanical per file
- Only 3 files use it (`app/welcome.jsx`, `app/onboarding-photo.jsx:10`, `components/ErrorBoundary.jsx:31`).
- About 112 hand-rolled coral blocks exist in about 67 files. Examples:
  - `components/Health/Reminders/FeedingRoutineModal.jsx:795-805`
  - `components/Health/Reminders/VaccineRoutineModal.jsx:324`
  - `components/Health/Reminders/MedicationRoutineModal.jsx:491`
  - `components/Health/PhotoCheck/PhotoCheckModal.jsx:511`
  - `app/service/sitting.jsx:340,519` (the same block is copied in `daycare.jsx:434,579`, `training.jsx:361,594`, `walking.jsx:524`, `place.jsx:548`)
  - `components/Feed/PostComposerModal.jsx:432`
  - `app/service/transport.jsx:427`
- **Canonical:** `Button` from `@/components/ui`. Fix the gaps first (B-02, B-03, B-08), then migrate screen by screen.
- Needs-human: this is a design decision (primary CTA height 50/52/54 vs today's 44-52 mix). Ship as a series of small PRs, not one sweep.

### B-02 `Button` has no destructive variant (design decision). RISK: low to add, med to roll out
- Destructive actions are hand-styled 7 different ways (B-09).
- **Canonical:** add `variant="destructive"` (tinted fill, or red label) plus a single `COLORS.danger` token. Needs a human to pick the colour. Candidates in use: `#B23A2E` (`components/Settings/AppSettings.jsx:955`), `#C2410C` (`app/emergency-card.jsx:345`), `#E53935`.

### B-03 `Button` `size="sm"` is about 34pt tall. RISK: low
- `components/ui/Button.jsx:21` computes 8 + 18 + 8 = 34pt (below 44pt).
- **Canonical (mechanical):** add `minHeight: 44` to the container style (or default `hitSlop`). `md` (50) and `lg` (54) are fine.

### B-04 "Save Changes / Create Routine" button copy-pasted across 7 Reminders modals, with off-brand colours. RISK: low, mechanical
- Same block (`borderRadius 14, paddingVertical 16, alignItems center`, white 16/700 label) in:
  - `components/Health/Reminders/FeedingRoutineModal.jsx:796`
  - `.../VaccineRoutineModal.jsx:324`
  - `.../PreventiveCareRoutineModal.jsx:403`
  - `.../WellnessCheckRoutineModal.jsx:1000`
  - `.../MedicationRoutineModal.jsx:491`
  - `.../MedicalCareRoutineModal.jsx:1036`
  - `.../MedicalCareIssueModal.jsx:183`
- The fill colour varies: coral, **`#F4A460`** (Wellness and Preventive; 21 uses of `#F4A460` in 8 files, a non-brand hex), and **terracotta** (Medication, MedicalCare, Issue).
- Labels are **hard-coded English** ("Save Changes", "Create Routine", "Save item", "Save issue") at `FeedingRoutineModal.jsx:809`, `WellnessCheckRoutineModal.jsx:1010`, `VaccineRoutineModal.jsx:334`, `MedicationRoutineModal.jsx:501`, `PreventiveCareRoutineModal.jsx:413`, `MedicalCareRoutineModal.jsx:1047`, `MedicalCareIssueModal.jsx:195`. Also `PhotoCheckRoutineModal.jsx:363` (`ctaLabel`). This breaks the CLAUDE.md EN+ES rule.
- **Canonical:** `Button` (coral primary) with `t()` labels. Mechanical, but it is a visible colour change for terracotta and `#F4A460` screens, so confirm with the owner.

### B-05 `KeyboardSafeFormModal` is a 7th primary-button implementation, with an off-brand default colour and no loading state. RISK: low
- `components/KeyboardSafeFormModal.jsx:63` defaults `ctaColor = "#6B8E6F"`, a green not in the brand palette. `components/Health/VetRecord/EditMedicalProfileModal.jsx:481` takes that default.
- `:62` default `ctaLabel = "Save"` and `:104` `accessibilityLabel="Close"` are hard-coded English.
- It has no spinner. It only dims via `ctaDisabled` (`:150-165`).
- **Canonical:** default to coral, render `<Button>` (spinner plus busy), take `t()` strings. Mechanical.

### B-06 Loading and disabled states are inconsistent. 3 variants. RISK: med
- (a) Shared `Button` `loading` (spinner plus `busy`). Used only in the 3 files from B-01.
- (b) `disabled={isPending}` plus opacity 0.6 plus a swapped label ("Booking…"), no spinner. This is the most common variant: `app/service/sitting.jsx:519-533`, `app/service/transport.jsx:362-372`, `app/event-create.jsx:151`, `components/Providers/BookingFormModal.jsx:388-399`.
- (c) **No guard at all.** Press, then the parent mutates async, and the modal either closes or stays enabled. Examples:
  - `components/Feed/PostComposerModal.jsx:432` (fires `onPost` plus `onClose`)
  - `components/Health/PhotoCheck/PhotoCheckModal.jsx:511`
  - `components/Health/Reminders/FeedingRoutineModal.jsx:799`
  - `.../MedicalCareRoutineModal.jsx:1036`
  - `.../MedicalCareIssueModal.jsx:183`
  - `.../VaccineRoutineModal.jsx:324`
  - `app/service/transport.jsx:427` (pay button swaps label via `payingId`, with no `disabled`)
  - `components/Health/Reminders/RoutinesTab.jsx:349,398`
  - `components/Providers/StorefrontPanels/ProductDetail.jsx:181`
- Several are sync hand-offs to a parent that owns the in-flight flag, so the real double-submit risk needs a per-site check. Mark as "verify".
- **Canonical:** `Button` with `loading={isPending}` (it already sets `disabled` and `busy`).

### B-07 Tap targets below 44pt. 75 pressables, no `hitSlop`. RISK: low, mechanical
- Round icon buttons, copy-pasted, repeated:
  - 40x40 service-screen header buttons: `app/service/sitting.jsx:108`, `daycare.jsx:107`, `training.jsx:107`, `walking.jsx:231`, `vet.jsx:83`, `grooming.jsx:90`, `telehealth.jsx:93`, `telehealth-call.jsx:83`
  - 40x40 tracker dashboards: `components/Health/{Weight/WeightDashboard.jsx:115, Vomit/VomitDashboard.jsx:114, Pee/PeeDashboard.jsx:97, Poo/PooDashboard.jsx:92, FoodWater/FoodWaterDashboard.jsx:117, WalkActivity/WalkActivityDashboard.jsx:123, GeneralCheck/GeneralCheckDashboard.jsx:79}`
  - 40x40 elsewhere: `app/chat.jsx:248,295`, `app/provider-chat.jsx:223,262`, `app/events.jsx:164`, `app/onboarding.jsx:877`, `app/business/index.jsx:522`, `components/More/OwnerMenu.jsx:114`
  - 36x36 modal-header close/back buttons: `components/KeyboardSafeFormModal.jsx:106`, `components/Health/Reminders/{FeedingRoutineModal.jsx:264,371, WellnessCheckRoutineModal.jsx:568, VetAppointmentRoutineModal.jsx:462, MedicationRoutineModal.jsx:142, PreventiveCareRoutineModal.jsx:128, VaccineRoutineModal.jsx:121, MedicalCareIssueModal.jsx:104, WalkRoutineModal.jsx:297, UpcomingTab.jsx:225,238}`, `components/Health/HealthVetRecord.jsx:2388,2536,2643,2795`, `components/Health/Vomit/VomitTrackerModal.jsx:918`
  - 32x32 tracker modal close buttons: `components/Health/{Weight/WeightModal.jsx:256,659, Vomit/VomitTrackerModal.jsx:310, Pee/PeeTrackerModal.jsx:233, Poo/PooTrackerModal.jsx:249,879, WellnessCheck/WellnessLogModal.jsx:179, WalkActivity/PostWalkFeedbackModal.jsx:195, WalkActivity/StartWalkModal.jsx:186, WalkActivity/WalkActivityModal.jsx:136, FoodWater/FoodWaterTrackerModal.jsx:202}`, `components/Health/Reminders/SnoozeModal.jsx:72`, `app/nearby-walks.jsx:158,563`, `app/create-walk.jsx:116`
  - 26 to 34: `app/vet-business-access.jsx:737` (26), `components/Health/Reminders/MedicalCareRoutineModal.jsx:571,585` (34), `components/Places/PlaceReviewModal.jsx:117` and `components/Providers/WriteReviewModal.jsx:97` (34)
- **Canonical (mechanical):** add a shared `IconButton` (new, about 20 lines on top of `PressableScale`) that is 44x44, or at minimum add `hitSlop={{top:8,bottom:8,left:8,right:8}}` to each. The `IconButton` is a design-light new component. Adding `hitSlop` is zero visual risk.
- Back arrows are hit-slop-less bare icons in about 121 `ArrowLeft/ChevronLeft` sites under `app/`. Examples: `app/provider-messages.jsx:69-75` (icon only, no padding, no `accessibilityLabel`) and `app/lost-found.jsx:83` (22px icon). Same fix.

### B-08 Radius inconsistency on buttons. RISK: low per file, high churn overall
- Of the coral blocks: `RADIUS.control` 29, `RADIUS.chip` 16, and literals 16/14/12/18/10/24/20/22/8/4. Overall `borderRadius` literals in `src`: 12 (269), 16 (153), 14 (130), 18 (101), 20 (50) vs `RADIUS.control` 172. Examples:
  - 14: `app/walker-walks.jsx:280,495,566`
  - 12: `app/rx-fulfillment.jsx:194`
  - 18: `app/vet-business-access.jsx:208`, `app/weekly-digest.jsx:194`, `app/welcome-back.jsx:126`
  - 24: `app/pet-profile.jsx:314`, `app/index.jsx:191`, `app/notifications.jsx:706`
- **Canonical:** `RADIUS.control` for buttons and `RADIUS.chip` for pills. Most are fixed for free by B-01.
- Needs-human: the Health Reminders family uses 14 on purpose, so decide whether to unify to 16.

### B-09 Destructive actions are not consistently red. No danger token. RISK: low for the token, med for rollout
- Delete controls styled as:
  - coral: `components/Health/Reminders/{RoutineCard.jsx:476, WalkItem.jsx:116,241, WellnessCheckRoutineModal.jsx:712, FeedingRoutineModal.jsx:471, WalkRoutineModal.jsx:446, MedicalCareRoutineModal.jsx:597,1224}`, `components/Feed/PostDetailModal.jsx:169`, `components/Health/VetAppointmentDetailModal.jsx:389`
  - terracotta: `app/pet-sharing.jsx:222`
  - muted brown: `components/Health/HealthVetRecord.jsx:1405,1603`, `app/service/provider-post.jsx:470`
  - `#E57373`: `components/Health/Medication/MedicationModal.jsx:178-182`, `Weight/WeightModal.jsx:670`
  - `#C2410C`: `app/emergency-card.jsx:345`
  - `#B23A2E`: `components/Settings/AppSettings.jsx:955`
  - `#E53935`: 2 uses
- Coral delete is indistinguishable from the primary CTA.
- **Canonical:** one `COLORS.danger` plus `Button variant="destructive"` (see B-02). Needs-human for the colour value.

### B-10 `DeleteConfirmationModal` is a dead duplicate and has a styling bug. RISK: low (delete or fix)
- `components/Health/Reminders/DeleteConfirmationModal.jsx` has **no importers**.
- Confirm button is coral (`:107-120`, primary style, not destructive). "Cancel" is hard-coded English (`:146`). It has `console.log` on press (`:25,33`).
- **Canonical:** delete the file (use `Alert.alert` with `destructive`, as the other 35 do). Mechanical.

### B-11 Accessibility roles and labels missing. RISK: low, mechanical
- 630 of 861 pressables have no `accessibilityRole`. The worst files: `components/Health/HealthVetRecord.jsx` (24), `FoodWater/FoodWaterTrackerModal.jsx` (20), `Poo/PooTrackerModal.jsx` (19), `Pee/PeeTrackerModal.jsx` (18), `Vomit/VomitTrackerModal.jsx` (15), `Reminders/MedicalCareRoutineModal.jsx` (12).
- About 148 icon-only pressables have no `accessibilityLabel`. Examples: `app/provider-messages.jsx:69`, `app/lost-found.jsx:83,272,339`, `app/nutrition.jsx:109,147`, `app/notifications.jsx:622`, `app/emergency-card.jsx:336`, `app/household.jsx:49`, `app/chat.jsx` (3), `components/Health/HealthVetRecord.jsx` (6).
- **Canonical (mechanical):** `PressableScale` could default `accessibilityRole="button"` (one-line change at `components/ui/PressableScale.jsx`). Labels need `t()` strings, so do those per site.

### B-12 `TouchableOpacity` vs `PressableScale` split. RISK: low
- `components/Health/*` holds 319 of the 479 `TouchableOpacity` usages (vs 36 `PressableScale`). `app/*` mostly uses `PressableScale` (202 vs 114).
- `activeOpacity` values scatter (0.7, 0.8, 0.85, 0.88, 0.9, 0.92, 1), so press feel differs.
- **Canonical:** `PressableScale`. Mechanical find-and-replace is safe (it forwards all props), but verify the `activeOpacity` prop is dropped.

### B-13 Hard-coded English on visible buttons (CLAUDE.md EN+ES rule). RISK: low
- "Cancel": `components/Health/Reminders/VetAppointmentRoutineModal.jsx:889`, `SnoozeModal.jsx:164`, `MedicalCareRoutineModal.jsx:1033`, `WellnessCheckRoutineModal.jsx:1108`, `DeleteConfirmationModal.jsx:146`
- "Delete": `VetAppointmentRoutineModal.jsx:1227`
- "Create Routine": `components/Health/Reminders/RoutineTypeSelector.jsx:74`
- "Messages" header: `app/provider-messages.jsx:76-78`
- "Sending…": `components/Providers/BookingFormModal.jsx:388`
- "Saving…" / "Save": `components/Feed/PostDetailModal.jsx:314`
- **Canonical:** `t("common.cancel")` etc. Keys already exist.

### B-14 Other duplicate button implementations seen. RISK: low
- Pill/outline "secondary" buttons are re-implemented inline: `components/Health/Reminders/DeleteConfirmationModal.jsx:130-150`, `components/Health/Reminders/MedicalCareRoutineModal.jsx:1020-1034` (cancel half of a two-button footer).
- Custom "double footer" (Cancel and Save side by side) has no shared component.
- **Canonical:** compose from `Button variant="secondary"` and `variant="primary"`.

---

## 3. POPUP findings

### P-01 Raw `error.message` shown in Alert bodies (widespread). RISK: med (copy and UX), mechanical to wrap
- 77 call sites in 44 files. Typical pattern: `Alert.alert(t("x.errorTitle"), e.message || t("common.pleaseTryAgain"))`, which exposes server or JS strings (often English, unlocalised, sometimes technical).
- Highest counts: `app/walker-walks.jsx:134,176,199,229`, `app/service/provider-post.jsx:157,162,174`, `app/service/walking.jsx:135,143,194`, `components/Health/Medication/MedicationModal.jsx:312,356,392` (also shows `e?.message || "Error"` under the title `tc("required")`, which is the wrong title for an error), `components/Health/Reminders/VetAppointmentRoutineModal.jsx:158,230,265`, `components/adoption/AdoptionListingViews.jsx:239,261,282`, `components/moderation/ModerationMenu.jsx:81,107`.
- Also: `app/rx-fulfillment.jsx:89,130`, `app/nutrition.jsx:79`, `app/insurance-policy.jsx:81`, `app/events.jsx:100,106`, `app/(tabs)/more/profile-edit.jsx:278`, `app/service/{sitting,daycare,training,transport,insurance,booking-summary}.jsx`, `components/Providers/{BookingFormModal.jsx:372, WriteReviewModal.jsx:58}`, `components/Places/PlaceReviewModal.jsx:75`.
- Worst, with English prefix and `${error.message}`: `app/pet-profile.jsx:201`, `hooks/useFeedData.js:242,269`.
- **Canonical:** one helper (e.g. `utils/userFacingError(e, fallback)`) returning the fallback unless the server sent a known localisable `code`. There is no such util today. Needs-human to choose which server messages are safe to show. Many of these (booking and payment errors) arguably need the server text, so do not blanket-strip.

### P-02 Hard-coded English Alert copy in hooks and utils. RISK: low, mechanical
- About 44 calls, none through `t()`. Files and counts:
  - `hooks/useSocialWalks.js` (7: lines 30,98,102,155,159,188,192)
  - `hooks/useLostFound.js` (6: 69,71,92,94,109,111)
  - `utils/calendarIntegration.js` (5: 56,209,218,248,258)
  - `hooks/useFeedData.js` (5: 121,133,235,242,269)
  - `hooks/usePetSharing.js` (4: 48,50,70,83)
  - `utils/healthKitIntegration.js` (3: 37,46,60)
  - `hooks/useForum.js` (63,86), `hooks/useStorefrontCart.js` (101,111), `hooks/useSelfTraining.js:49`, `utils/notifications.js:81`
  - `components/Health/WalkActivity/WalkCountdownCard.jsx:62,68`
  - `components/Health/Reminders/WellnessCheckRoutineModal.jsx:239,327,332`
  - `components/Health/HealthToday.jsx:345`
  - `app/pet-profile.jsx:187-201`, `app/(tabs)/index.jsx:200-206`
- **Canonical:** `getI18n().t(...)` inside a try/catch (per repo memory, never import `@/i18n` in a shared util). Needs ES strings. Mechanical but touches locale files.

### P-03 `ProviderFollowButton` sign-in Alert has an empty Cancel label. RISK: low (user-visible bug)
- `components/Providers/ProviderFollowButton.jsx:26-29`: `{ text: "", style: "cancel" }` renders a blank button. Replace with `t("common.cancel")`. Mechanical.

### P-04 Alert button order (Cancel not first). RISK: low, mechanical
- iOS lays 2-button alerts out with the cancel-style button on the left whatever the array order, but Android shows them in array order. The convention in the other 46 confirm Alerts is Cancel first. The 3 outliers:
  - `components/Providers/ClaimCTA.jsx:50-53`
  - `components/Providers/ProviderFollowButton.jsx:26-29`
  - `components/Health/HealthToday.jsx:238-245` (a multi-option list; the cancel is last, which is correct for 3+ options, so leave it)
- Swap the first two. No logic change.

### P-05 `style: "destructive"` coverage is good. One gap, one possible misuse. RISK: low
- All 49 confirm Alerts have a cancel button. 35 are destructive. All delete, logout, revoke, block, decline and cancel-trip confirms checked are marked destructive (`components/More/OwnerMenu.jsx:66`, `app/business/profile.jsx:81`, `components/Settings/AppSettings.jsx:659-675`, etc.).
- Gap: `utils/calendarIntegration.js:56` (permission prompt, "Not now" button) is not destructive, which is fine. Not a defect.
- Check: `components/onboarding/UseDifferentAccountLink.jsx:25-34` marks "use a different account" as destructive (it wipes the onboarding draft). Plausible; confirm with the owner.

### P-06 Success feedback is a blocking Alert, not a toast. ~42 sites. RISK: med (UX decision)
- Examples: `app/nutrition.jsx:77`, `app/(tabs)/more/profile-edit.jsx:271`, `components/Health/HealthToday.jsx:218,269,305,312,322,342`, `components/Health/Reminders/RoutinesTab.jsx:217,221,247` (the keys are literally named `routines.toast.*` yet render as `Alert.alert`), `components/Providers/WriteReviewModal.jsx:53`, `components/Pets/AddDogModal.jsx:149`, `components/Health/FeedingCountdownCard.jsx:68`, `components/Health/VetAppointmentDetailModal.jsx:67`, `components/Health/WalkActivity/WalkCountdownCard.jsx:62`.
- `sonner-native` is installed but `Toaster` is only mounted on web (`App.web.tsx:51`). Native has no toast host.
- **Canonical:** mount `Toaster` in the native root and use `toast.success()` for non-blocking success. Keep `Alert.alert` for errors that need a decision. Needs-human: it changes UX across about 42 flows, and the emoji "✅" in titles (`HealthToday.jsx`, `FeedingIssueModal.jsx:86`, etc.) should go.

### P-07 Hand-rolled bottom sheets (~24) vs the shared `Sheet`. RISK: med, design decision
- Hand-rolled `borderTopLeftRadius` 20/24/28 literals inside `<Modal transparent animationType="slide">`:
  - `components/Health/Reminders/{SnoozeModal.jsx:45, RoutineTypeSelector.jsx:49, WalkCountSelector.jsx:24, MedicalCareIssueModal.jsx:74, FeedingRoutineModal.jsx:234, MedicalCareRoutineModal.jsx:403}`
  - `components/Health/{HealthTrack.jsx:342, HealthVetRecord.jsx:2365,2513,2618,2770, GeneralCheck/GeneralCheckModal.jsx:419,826, Medication/MedicationModal.jsx:472}`
  - `components/Providers/{WriteReviewModal.jsx:80, StorefrontPanels/StorefrontCheckout.jsx:96}`, `components/Places/PlaceReviewModal.jsx:98`, `components/Pets/CaregiverLogWalkModal.jsx:63`, `components/More/OwnerMenu.jsx:144`, `components/moderation/ModerationMenu.jsx:140`, `components/Feed/ShareCardDeck.jsx:72`
  - `app/business/index.jsx:785`, `app/service/walking.jsx:613`, `app/service/provider.jsx:926`
- Only `components/Health/HealthInsights.jsx:783-795` uses `<Sheet>` with `MATERIALS.overlay`.
- **Canonical:** `Sheet` (surface) wrapped in `Modal`, with `MATERIALS.overlay` as the scrim. `@gorhom/bottom-sheet` is installed but unused; either adopt it deliberately or remove the dependency. Needs-human.

### P-08 Scrim colour inconsistency. RISK: low, mechanical
- ~30 raw scrims, 9 or more values: `rgba(0,0,0,0.5)` 15 uses, `0.35` 6, `0.55` 2, `0.4` 2, `0.45` 1, `0.96` 1, and `rgba(59,36,27, .45/.55/.6)` 5. Only 2 files use `MATERIALS.overlay`.
- Examples: `components/Health/Reminders/SnoozeModal.jsx:38`, `RoutineTypeSelector.jsx:42`, `WalkCountSelector.jsx:17`, `MedicalCareIssueModal.jsx:67`, `components/Health/HealthVetRecord.jsx:2358,2506,2611,2763`, `components/Feed/BarkModal.jsx:110`, `components/More/OwnerMenu.jsx:135`, `components/moderation/ModerationMenu.jsx:133`, `components/Providers/WalkPickupQRModal.jsx:34`, `components/Services/ServicesDiscovery.jsx:1207`, `app/service/provider.jsx:919`, `app/business/index.jsx:129,780`.
- **Canonical:** `MATERIALS.overlay`. A pure token swap. (`rgba(0,0,0,0.96)` in a media viewer is probably intentional.)

### P-09 Bottom-sheet modals with no tap-outside dismiss. RISK: low, verify per site
- Plain `<View>` backdrop (no `Pressable` behind the sheet) in `components/Health/Reminders/SnoozeModal.jsx:35-41`, `RoutineTypeSelector.jsx:39-45`, `WalkCountSelector.jsx`, `components/Health/HealthInsights.jsx:783-795`, `components/moderation/ModerationMenu.jsx:129`, `components/Pets/CaregiverLogWalkModal.jsx:58`, `components/Providers/StorefrontPanels/StorefrontCheckout.jsx:80`, `app/service/provider.jsx:834`.
- All still have `onRequestClose` and an X or Cancel button, so none is undismissable; this is a polish gap. By contrast `components/Pets/PetPickerSheet.jsx`, `components/More/OwnerMenu.jsx` and `components/Providers/WalkPickupQRModal.jsx` do dismiss on backdrop tap.
- **Canonical:** a shared sheet-presenter with a backdrop `Pressable` (see P-07).

### P-10 Modal forms with the wrong keyboard handling. RISK: med, needs device test (cannot be caught by Jest)
- CLAUDE memory notes bare `KeyboardAvoidingView + ScrollView` is broken inside `pageSheet`. Files with a TextInput in a bare `ScrollView` under a `KeyboardAvoidingView`:
  - pageSheet: `components/Health/Weight/WeightModal.jsx:212-218,335`, `Pee/PeeTrackerModal.jsx:202-208,249`, `Poo/PooTrackerModal.jsx:218-224,264`, `WellnessCheck/WellnessLogModal.jsx:145-151,254`, `components/Feed/PostComposerModal.jsx:204-210,344`
  - slide: `components/Feed/BarkModal.jsx:97-98,208`, `components/Health/Reminders/{MedicationRoutineModal.jsx:109, PreventiveCareRoutineModal.jsx:95, MedicalCareRoutineModal.jsx:249,392,655, MedicalCareIssueModal.jsx:59, VaccineRoutineModal.jsx:88}`, `app/service/provider-post.jsx:255-263,590`, `components/Services/ServicesDiscovery.jsx:1197,1236` (TextInput at `:1046` is outside the modal, so likely fine)
  - KAV only (no scroll handling): `app/service/walking.jsx:608`, `components/Pets/CaregiverLogWalkModal.jsx:58`, `components/Providers/WriteReviewModal.jsx:67`
  - Bare `ScrollView`, no keyboard handling at all: `app/nearby-walks.jsx:534,578,642`, `components/adoption/AdoptionListingViews.jsx:287,370`
- The other 28 modal files with TextInput already use `KeyboardAwareScrollView` or `KeyboardSafeFormModal`.
- **Canonical:** `KeyboardAwareScrollView` (or `KeyboardSafeFormModal`). Some of these may be false positives (the TextInput can sit in a different part of the file), so verify on device before changing.

### P-11 `<Modal>` without `onRequestClose`: none. RISK: n/a
- All 79 real `<Modal>` instances pass `onRequestClose`. `components/Health/Reminders/MedicalCareRoutineModal.jsx:655` passes `onCancel` (fine). No modal found without any dismiss UI (X, Cancel or Done) in the file. No action needed. Keep a lint or test guard.

### P-12 Full-screen "modals" instead of sheets. RISK: low, design decision
- 36 `transparent slide` modals whose body is a full-screen cream `View` (e.g. `components/KeyboardSafeFormModal.jsx:70-77` uses `transparent` plus an opaque `flex:1` view; `headerPaddingTop = 60` is a hand-tuned status-bar offset) vs 28 `presentationStyle="pageSheet"` modals (swipe-down dismiss).
- iOS swipe-to-dismiss and the sheet look only apply to the pageSheet ones, so the app mixes two modal idioms.
- **Canonical:** `presentationStyle="pageSheet"` for forms (28 already do). Needs-human.

### P-13 Success and info Alerts embed emoji in titles. RISK: low
- `components/Health/HealthToday.jsx:218,269,305,312,322` (`✅ ${...}`), `FeedingIssueModal.jsx:86`, `FeedingCountdownCard.jsx:68`, `VetAppointmentDetailModal.jsx:67`, `WalkCountdownCard.jsx:62`, `utils/notifications.js:81` ("🔔"), `hooks/useLostFound.js:109` ("🐾"). Inconsistent with the rest of the app's titles. Strip when moving to toasts (P-06).

---

## 4. LOW-RISK mechanical fixes (safe to batch)

1. P-03: empty Cancel label at `components/Providers/ProviderFollowButton.jsx:28` -> `t("common.cancel")`.
2. P-04: swap Cancel to first in `components/Providers/ClaimCTA.jsx:50-53` and `ProviderFollowButton.jsx:26-29`.
3. B-03: `minHeight: 44` on `Button` container (`components/ui/Button.jsx`).
4. B-07: add `hitSlop` to the 75 sub-44 pressables (or the shared `IconButton`).
5. B-11: default `accessibilityRole="button"` in `PressableScale`; add `accessibilityLabel` to icon-only pressables with existing `t()` keys.
6. B-10: delete the unused `components/Health/Reminders/DeleteConfirmationModal.jsx`.
7. B-13 and P-02: replace the hard-coded English strings with `t()`; add EN and ES keys (insert as text, not via a JSON round-trip).
8. P-08: replace raw scrim literals with `MATERIALS.overlay`.
9. B-04 partial: replace `#F4A460` (8 files) and the KeyboardSafeFormModal default `#6B8E6F` (`components/KeyboardSafeFormModal.jsx:63`) with approved brand colours.
10. B-12: `TouchableOpacity` -> `PressableScale` in `components/Health/*` (props forward cleanly; drop `activeOpacity`).

## 5. NEEDS-HUMAN / DESIGN DECISIONS

- B-01/B-02/B-09: add a `destructive` variant and a `COLORS.danger` token, and decide a single primary-CTA height, then migrate ad-hoc primary buttons to `Button`.
- B-04: whether terracotta and `#F4A460` primary buttons in Health Reminders should become coral.
- B-06: a standard in-flight and double-press policy (spinner via `Button loading` everywhere).
- P-01: which server error messages are safe and user-friendly to show, and a shared `userFacingError` helper.
- P-06: adopt a native toast (mount `sonner-native` `Toaster`) for success messages; remove emoji from titles.
- P-07/P-12: pick one sheet idiom (`Sheet` + Modal, `pageSheet`, or `@gorhom/bottom-sheet`) and remove the unused dependency or adopt it.
- P-10: verify the 13 KAV + bare-`ScrollView` modal forms on a real device before refactoring.


---

## §3. Calendars / date & time pickers

Scope: `anything/apps/mobile/src` (read-only). All `file:line` below were read in this pass. Paths are relative to that `src` dir unless noted.

## 0. Headline

The picker layer is in good shape. There is exactly ONE native-picker implementation pair (`components/DateField.jsx`, `components/TimeField.jsx`), and they are the only files importing `@react-native-community/datetimepicker`. 25 files use them. There are NO raw `TextInput` date or time inputs anywhere in `src` (checked placeholders, value bindings, `keyboardType`, and i18n strings). There is ONE custom calendar grid, `components/Providers/BookingSlotPicker.jsx`, backed by `utils/providerSlots.js`. It is a deliberate slots-only picker.

The real problems are:
1. Missing `minimumDate`/`maximumDate` on most pickers. No future-only form blocks past dates, and several past-only fields allow future dates.
2. `toISOString()` / `new Date("YYYY-MM-DD")` UTC-day bugs in about 10 non-generator places.
3. Hand-rolled 12h AM/PM formatters in `data/routinesData.js` (7 sites). These are visible on RoutineCard under es-AR.
4. Device-locale `toLocaleDateString()` with no locale argument in about 12 places.
5. `${date}T${time}:00` string concatenation that breaks on `HH:MM:SS` or ISO-datetime inputs.

Correction to the memory note "formatDisplayTime defaults to DEVICE 12/24h": this is already fixed. `utils/canonicalDateTime.js:172-177` always returns 24h `HH:MM` and ignores the 2nd arg. `uses12HourClock()` (`canonicalDateTime.js:155`) is now dead code. The remaining `formatDisplayTime(x, false)` calls are redundant (D-31).

## 1. Summary table

| Category | Count of sites | Findings | Overall |
|---|---|---|---|
| Native picker usage direct (outside DateField/TimeField) | 0 | none | OK |
| Plain TextInput accepting dates/times | 0 | none | OK |
| Custom calendar grid | 1 (slot picker) | D-23, D-24 | low-med |
| react-native-calendars / @react-native-picker/picker | 0 imports (deps still in package.json) | D-35 | low |
| Missing min/max on DateField | ~25 DateFields | D-16..D-22 | med |
| UTC-day `toISOString().split("T")[0]` / `new Date("YYYY-MM-DD")` bugs | 9 real sites (+ ~35 intentional in reminderGenerator) | D-02..D-10, D-32, D-33 | med-high |
| 12h AM/PM hand-rolled formatters | 7 (routinesData.js) | D-01 | med (visible) |
| Device-locale `toLocaleDateString()` with no arg / `Intl(undefined)` | ~14 | D-24, D-28..D-30 | low |
| Fragile `${date}T${time}:00` concatenation | 6 | D-12..D-15 | med |
| Raw (unformatted) date strings in UI | 3 | D-27 | low |
| Native picker not told app locale / 24h | 2 components | D-25 | med (device-verify) |
| Dead / legacy date helpers | 4 | D-31, D-34, D-05, D-08/09 | low |

Counts: 38 findings (D-01..D-38). Section A has 22 low-risk mechanical routings (D-01..07, 10, 12..16, 19..21, 24, 27, 28, 30, 31, 34). Section B has 16 needs-human items (D-08, 09, 11, 17, 18, 22, 23, 25, 26, 29, 32, 33, 35..38). Section A comes first.

---

# SECTION A: LOW-RISK MECHANICAL ROUTINGS

## D-01. Hand-rolled 12h AM/PM time formatters in `data/routinesData.js`
- Locations: `data/routinesData.js:291-296`, `:321-326`, `:332-336`, `:412-417`, `:500-505`, `:593-598`, `:660-665`. Each has `const ampm = hour >= 12 ? "PM" : "AM"` and `${displayHour}:${minutes} ${ampm}`. The consumer is `components/Health/Reminders/RoutineCard.jsx:51-52` via `getScheduleSummary` and `getNextReminderPreview`, so it shows on the routines list.
- Variant: the user sees "9:00 PM" in an es-AR 24h app. The file already imports `formatDisplayDate` and `formatLocalTime`, so this is a missed conversion.
- Canonical: replace each local `formatTime` / inline block with `formatDisplayTime(time)` from `@/utils/canonicalDateTime`. It is 24h and tolerant of `HH:MM:SS`.
- Risk: low. Tests may assert AM/PM strings in the `routinesData` tests, so update them (grep `AM`/`PM` in `data/*.test.*`).
- Note: the same functions use hardcoded English ("Daily at", "tonight", "this morning", "Inactive"). That is an i18n gap and out of scope here.

## D-02. `app/onboarding.jsx:486` uses the UTC date for the "today" daily-post check
- Code: `const today = new Date().toISOString().split("T")[0];`, compared at `:495` to `p.post_date === today`.
- Variant: from 21:00 in Buenos Aires this is tomorrow's date. The duplicate-daily-post guard misses an existing post, so a duplicate first moment can be created.
- Canonical: `getLocalPostDateString()` from `@/utils/dateUtils`. It is already imported at `app/onboarding.jsx:27` but never used.
- Risk: low.

## D-03. `components/Health/Reminders/MedicationRoutineModal.jsx:44, 60, 73`
- Variant: the default `startDate` is `new Date().toISOString().split("T")[0]` (UTC). After 21:00 BA the default Start Date is tomorrow.
- Canonical: `getLocalPostDateString()` or `toCanonicalDate(new Date())`.
- Risk: low.

## D-04. `components/Health/Reminders/MedicalCareRoutineModal.jsx:98, 149`
- Same defect as D-03, in `defaultItemFor` (`:98`) and when loading a routine without a `startDate` (`:149`).
- Canonical: `toCanonicalDate(new Date())`.
- Risk: low.

## D-05. `components/Health/Reminders/ReminderCreationModal.jsx:55, 82, 129`
- The file is imported nowhere (`grep` finds no import), so it is dead code. It also has the same UTC default date (`:55`, `:129`) and a `new Date(\`${selectedDate}T${selectedTime}\`)` build at `:82`.
- Canonical: delete the file. If it is kept, use `toCanonicalDate(new Date())` and `combineDateAndTime` from `utils/calendarFormat.js:114`.
- Risk: low.

## D-06. `components/Health/VetRecord/EditMedicalProfileModal.jsx:39, 56, 78-80`
- Variant: `new Date(pet.birthday).toISOString().split("T")[0]` for birthday, adoption date and spay/neuter date.
- Analysis: for a date-only or `...T00:00:00.000Z` input this round-trips correctly, because both the parse and the ISO are UTC. It only breaks if the backend ever sends a local-midnight instant. The code is redundant and fragile.
- Canonical: `canonicalizeDateValue(value)` from `@/utils/canonicalDateTime`. It handles date-only, `MM/DD/YYYY` and ISO strings and returns `""` for empty or invalid input.
- Risk: low.

## D-07. `hooks/useTodayReminders.js:96-98`
- Variant: `new Date(Date.now() - 30d).toISOString().slice(0, 10)` is a 30-day lookback bound in UTC.
- Analysis: it is off by at most one day, which is harmless for a lookback window. It is listed for completeness.
- Canonical: `getLocalPostDateString(new Date(Date.now() - 30*864e5))` if you want consistency.
- Risk: low. Optional.

## D-10. `app/service/daycare.jsx:551`: `minimumDate={startDate ? new Date(startDate) : undefined}`
- Variant: `new Date("2026-10-17")` is UTC midnight, which is 2026-10-16 21:00 in BA. The End Date picker's minimum is then the day BEFORE the start date, so an end date one day before start can be chosen.
- Canonical: `minimumDate={parseDateValue(startDate) ?? undefined}` (`parseDateValue` is exported from `@/utils/canonicalDateTime`).
- Risk: low. This is a one-line fix with a clear bug.

## D-12. `hooks/useVetAppointmentReminders.js:33-34`
- Code: `` `${apt.appointment_date}T${apt.appointment_time}:00` `` followed by `new Date(...)`.
- Variant: `appointment_time` from Postgres can be `HH:MM:SS` (`canonicalDateTime.js:99-100` documents this). That makes `T09:30:00:00`, which is an Invalid Date. `appointment_date` can also arrive as an ISO datetime (`parseDateValue` handles that, but this string build does not). The result is NaN trigger times and silently missing vet-appointment reminders.
- Canonical: `combineDateAndTime(apt.appointment_date, apt.appointment_time)` from `@/utils/calendarFormat` (`:114`). It slices the first 10 chars of the date and splits the time.
- Risk: low-med. It changes which reminders appear (previously failing ones start appearing), so check the downstream filter for past triggers.

## D-13. `components/Health/VetAppointmentDetailModal.jsx:136-139`
- Same string build: `new Date(\`${appointment.appointment_date}T${appointment.appointment_time}\`)`.
- Variant: an ISO date or a missing time gives "Invalid Date" in the detail header. The `catch` never fires because `formatLocalDateTime` does not throw on an invalid Date.
- Canonical: `combineDateAndTime(...)`, or `resolveTelehealthAppointmentMoment(...)` from `utils/telehealthJoinGate.js:23`, which parses each half separately.
- Risk: low.

## D-14. `utils/calendarIntegration.js:312-314` and `:362-364`
- Variant: `` `${appointment.appointmentDate}T${appointment.appointmentTime}:00` ``. Callers pass the form's canonical `HH:MM`, so it works today. `:440` and the surface builders already use `combineDateAndTime`.
- Canonical: `combineDateAndTime` for consistency.
- Risk: low.

## D-15. `new Date(\`${date}T${time}:00\`).toISOString()` at `app/event-create.jsx:48`, `app/service/transport.jsx:131`, and the hand-rolled `combineDateTime` at `app/create-walk.jsx:34-41`
- Analysis: these use canonical `DateField`/`TimeField` values, and a date-time string with no offset parses as local, so they are correct today.
- Variant: three different local implementations of one helper.
- Canonical: `combineDateAndTime(date, time).toISOString()` from `utils/calendarFormat.js`.
- Risk: low. Optional.

## D-16. Past dates selectable in future-only create flows
Add `minimumDate={new Date()}` to the `DateField` in each create flow. The precedent is `components/Health/CareRingCard.jsx:220`.
- `app/create-walk.jsx:156` (walk date): past walk date and time allowed.
- `app/event-create.jsx:122` (event date): past event allowed.
- `app/service/transport.jsx:291` (trip date): past trip allowed.
- `app/service/sitting.jsx:486` (sitting date): past booking allowed.
- `app/service/daycare.jsx:544` (start date): past start allowed.
- `components/Providers/BookingFormModal.jsx:596` (free-form daycare/sitter/walker date): past booking allowed.
- `components/Health/Reminders/VetAppointmentRoutineModal.jsx:553`: new appointments only (see D-18 for the edit case).

None of these has any past-date validation in its `submit`. I grepped `src` for isPast/past-date guards and found none in forms. Risk: low for the create-only flows above. Same-day past TIME is not fixed by `minimumDate` (D-17).

## D-19. `components/Health/CareRingCard.jsx:217-226`
- Variant: `minimumDate={new Date()}` lets the user pick today, but `onChange` only accepts `canonical > getLocalPostDateString()` (tomorrow or later). Picking today silently does nothing.
- Canonical: `minimumDate` = tomorrow (`new Date(Date.now() + 864e5)`).
- Risk: low.

## D-20. `components/Health/VetRecord/EditMedicalProfileModal.jsx:311-337` (`FormDateField`) used at `:518` (adoption date) and `:538` (spay/neuter date)
- Variant: `FormDateField` forwards no `minimumDate`/`maximumDate`, so adoption date and spay/neuter date can be in the future. The same adoption field in `profile-edit.jsx:578` and `onboarding.jsx:1483` has `maximumDate={new Date()}`.
- Canonical: add a `maximumDate` prop to `FormDateField` and pass `new Date()` at both call sites.
- Risk: low. Edge: a planned future spay would be blocked, which is acceptable since the field is a past event.

## D-21. "Date given" / "last given" fields allow future dates
Add `maximumDate={new Date()}` to each:
- `components/Health/Reminders/VaccineRoutineModal.jsx:181` (lastGiven)
- `components/Health/Reminders/PreventiveCareRoutineModal.jsx:238` (lastGiven)
- `components/Health/Reminders/MedicalCareRoutineModal.jsx:770` (vaccine lastGiven) and `:817` (preventive lastGiven)
- `components/Health/Medication/MedicationModal.jsx:681` (vaccine `dateGiven`) and `:781` (`prevLastGiven`)

Variant: `AddVetRecordModal`, `AddVetNoteModal` and `AddDocumentModal` already pass `maximumDate={new Date()}`, so this is the same convention applied inconsistently. Risk: low.

## D-24. `components/Providers/BookingSlotPicker.jsx:21-32` uses `Intl.DateTimeFormat(undefined, ...)`
- Variant: weekday header labels and month title use the DEVICE locale, not the app language (a Spanish app on an English phone shows English). `WEEKDAY_LABELS` is also computed once at module load, so it never updates on language change.
- Canonical: `currentDateLocale()` from `@/utils/localeDateTime`. Compute the labels inside the component (`useMemo`).
- Risk: low.
- Not a bug: `utils/providerSlots.js:28` uses `"en-CA"` deliberately, as a machine-readable `YYYY-MM-DD` formatter with `timeZone`.

## D-27. Raw, unformatted dates in UI
- `app/service/daycare.jsx:228-230`: `{stay.start_date}` and `→ {stay.end_date}` render raw (possibly ISO) strings. Use `formatDisplayDate`.
- `components/Health/Reminders/MedicalCareRoutineModal.jsx:614-615`: `Next due ${item.nextDue}` / `Last given ${item.lastGiven}` render raw `YYYY-MM-DD`, and in English only. Use `formatDisplayDate` and add i18n keys.
- Risk: low.

## D-28. `toLocaleDateString()` with no locale (device locale, not app language)
All should become `formatLocalDate(value, ...)` from `@/utils/localeDateTime`:
- `app/notifications.jsx:445`
- `app/messages.jsx:38`
- `app/provider-messages.jsx:36`
- `app/business/messages.jsx:32`
- `utils/relativeTime.js:42`
- `app/emergency-card.jsx:328` (`expires_at`)
- `app/walker-history.jsx:158`
- `app/service/walking.jsx:729`
- `components/Feed/BarkModal.jsx:272`

Variant: a Spanish app on a US-region device shows `10/17/2026`. All inputs are timestamps (`created_at`, `ended_at`, `expires_at`), so there is no date-only UTC issue here. Risk: low. `provider-messages.jsx` and `business/messages.jsx` also hardcode English "now"/"Yesterday" (i18n, out of scope).

## D-30. `components/Health/HealthToday.jsx:528`
- Variant: `new Date().toLocaleDateString(i18n?.language || "en-US", { weekday, month, day })`. For `en` this yields US ordering. It is otherwise fine.
- Canonical: `formatLocalDate(new Date(), { weekday: "long", month: "long", day: "numeric", year: undefined })`.
- Risk: low.

## D-31. Redundant `hour12=false` / dead helper
- `app/notifications.jsx:137`, `components/Health/HealthVetRecord.jsx:954`, `:2206` pass `formatDisplayTime(x, false)`. The 2nd arg is ignored (`canonicalDateTime.js:176`), and the comments there describe a bug that is already fixed. Drop the arg and the stale comments.
- `uses12HourClock()` (`canonicalDateTime.js:155`) is unused and can be deleted (`providerSlots.js:4` mentions it in a comment).
- Risk: low.

## D-34. `utils/dateFormatting.js`: legacy US `MM/DD/YYYY` typed-input helpers
- Dead: `formatDateInput`, `displayToDbDate`, `dbToDisplayDate`, `isValidDate`, `getTodayDisplayDate` (`:9-105`) are imported nowhere. Only `getTodayDbDate` is used, at `hooks/useFetchHealthData.js:3`, and it duplicates `dateUtils.getLocalPostDateString` and `canonicalDateTime.toCanonicalDate`.
- Canonical: switch `useFetchHealthData` to `getLocalPostDateString`, then delete `dateFormatting.js`. This also removes three copies of "local YYYY-MM-DD".
- Risk: low.

---

# SECTION B: NEEDS HUMAN DECISION

## D-08. `data/*Data.js` "today" helpers use the UTC date, and these modules hold seeded sample data
- Locations: `data/vomitData.js:63`, `data/pooData.js:81`, `data/peeData.js:91`, `data/foodWaterData.js:110, 117`, `data/walkActivityData.js:141`. Each does `new Date().toISOString().split("T")[0]` followed by `log.timestamp.startsWith(today)`.
- Variant: UTC "today" matched against UTC-`Z` timestamps. This is consistent internally but not the user's local day, so "today" flips at 21:00 BA. `data/walkActivityData.js:233-234` (`new Date(walk.date) >= now`) and `:371-387` (`formatSocialWalkDate`, hardcoded English "Today"/"Tomorrow", date-only parsed as UTC) also apply.
- These modules ship hardcoded sample logs (`petId: "sample-pet"`, 2026-05-06 timestamps). That conflicts with the "no fake/mock data" rule in CLAUDE.md. `FoodWaterDashboard.jsx:43` and `WalkActivityDashboard.jsx:551` still read them.
- Recommended: needs a product call on whether those dashboards are live. If kept, filter by local day with `toCanonicalDate(new Date(log.timestamp))` (or `wellnessLog.js:114`'s local-day helper). If dead, delete the mock logs.
- Risk: med. It touches dashboards that may be hidden.

## D-09. `data/remindersData.js:171-440` `mockReminders`
- Uses `now.toISOString().split("T")[0]` for `date`. Referenced only from `components/Health/Reminders/README.md`; `grep` finds no runtime import of `mockReminders`.
- Recommended: delete (no-mock-data rule).
- Risk: low, but confirm no test imports it.

## D-11. `app/service/daycare.jsx`: no end-before-start validation
- Variant: `submit` (`:469-472`) only checks both dates exist. `minimumDate` constrains only the picker. If the user picks an end date and then moves the start date later, end < start is submitted.
- Recommended: after D-10, add a `submit` guard (`endDate < startDate` compares canonical strings) or auto-clear `endDate` when start moves past it. Needs a copy decision for the alert text (EN and ES).
- Risk: low-med.

## D-17. Same-day past TIME is selectable in future-only flows
- `TimeField` has no min. Even with `minimumDate` on the date, today at 02:00 can be booked at 14:00. Affects `create-walk.jsx:160`, `event-create.jsx:125`, `service/transport.jsx:295`, `BookingFormModal.jsx:601`.
- Recommended: a combined check on submit using `combineDateAndTime(date, time) < new Date()` with an i18n alert. Needs product decision (grace period, e.g. allow "now").
- Risk: med.

## D-18. `components/Health/Reminders/VetAppointmentRoutineModal.jsx`: date and time
- Variant: edit mode loads `appointment.appointment_date` (`:296`), which may legitimately be past. A blanket `minimumDate` would clamp or hide it. `validateDate` (`:311-316`) is format-only. There is also no check for end-before-start.
- Recommended: `minimumDate` only when creating (`!editingAppointmentId`), and decide whether logging a past visit here is a supported path.
- Risk: med.

## D-22. End date before start date in routines
- `components/Health/Reminders/MedicationRoutineModal.jsx:331` (`endDate`) and `components/Health/Reminders/MedicalCareRoutineModal.jsx:749` (`endDate`) have no `minimumDate={startDate}`. `handleSave` (`MedicationRoutineModal.jsx:78-100`) does not validate.
- Recommended: `minimumDate={parseDateValue(startDate)}` and clear `endDate` if start moves after it. Same pattern as D-10/D-11.
- Risk: low-med. Mechanical once the policy is agreed.

## D-23. `components/Providers/BookingSlotPicker.jsx:76-87` (`goMonth`), `:111-113`, the prev button
- Variant: the previous-month chevron is never disabled, so the user can page to past months. It relies on `/availability` returning future-only slots. If the server returns past days (e.g. earlier today), they are selectable.
- Recommended: disable prev at the current month, and verify server behaviour (`apps/web/.../availability`). Needs a server-side check, so I did not verify it.
- Risk: med.

## D-25. Native picker language and 24h are not controlled
- `components/TimeField.jsx:101-108`: `<DateTimePicker mode="time" display="spinner">` has no `locale` (iOS) or `is24Hour` (Android). The closed field shows 24h `20:00` (`formatDisplayTime`), but the wheel shows AM/PM on US-region devices. The user may see "8:00 PM" in the wheel and "20:00" in the field.
- `components/DateField.jsx:100-110`: no `locale`, so the iOS inline calendar's month and weekday text follows the device language, not the in-app language.
- Recommended: pass `locale={currentDateLocale()}` (`es-AR` or `en-GB`, which forces 24h on iOS) and `is24Hour` on Android. Native-only, so it needs a real-device check. Jest cannot verify it.
- Risk: med (device-only).

## D-26. Four different date display formats
- `formatDisplayDate` (`canonicalDateTime.js:119`): "21 de abril de 2025" / "21 April 2025".
- `data/medicationData.js:39`: always `dd/MM/yyyy`, even in English.
- `formatLocalDate`: "17 oct 2026" (month short) or custom options.
- Raw ISO in a few places (D-27).
- Recommended: product decision on one canonical display; `formatDisplayDate` is the current DateField format.
- Risk: low, but wide blast radius.

## D-29. `utils/scheduledTimeFormat.js:41, 44`
- `toLocaleDateString([], ...)` uses the device locale, and "Yesterday"/"Tomorrow" (`:34-35`) are hardcoded English. The file has tests (`utils/scheduledTimeFormat.test.js`).
- Recommended: `currentDateLocale()` for the locale and i18n keys for the labels. This changes test expectations.
- Risk: med.

## D-32. `utils/reminderGenerator.js`: about 35 `toISOString().split("T")[0]` uses — DO NOT MECHANICALLY ROUTE
- Locations: `:271, :319, :401, :449, :497, :581, :658, :725, :774, :845, :893, :930, :1080, :1146, :1181, :1548, :1574, :1805, :2272, :2326, :2358, :2417, :2487` and others.
- This is intentional. The block at `:191-206` documents that instance ids embed the UTC date of local midnight and double as the durable dismissal key (`reminder_dismissals.instance_key`). It is locked for compatibility with stored rows.
- Recommended: leave as is. Migrating the id scheme is a backlogged data migration. Do not replace it with the shared local-date helper.
- Risk: high if changed.

## D-33. `utils/dateUtils.js:34-41` `normalizePostDate`
- Variant: for any non-10-char string it does `new Date(value)` then local date. A `date` column serialized as `2026-10-17T00:00:00.000Z` becomes 2026-10-16 in Buenos Aires. Used at `hooks/useFeedData.js:67` for `post.post_date`.
- The API does not cast dates to text (e.g. `apps/web/src/app/api/me/bookings/route.js:90`), so the wire format depends on the driver.
- Recommended: verify the real JSON shape of `post_date`. If it can be an ISO datetime, use `canonicalizeDateValue` (leading `YYYY-MM-DD`). For real instants (`created_at`) keep the local conversion.
- Risk: med-high (affects feed grouping and streaks).

## D-35. Unused dependencies
- `package.json:31` `@react-native-picker/picker` and `package.json:94` `react-native-calendars` (github tarball) have zero imports in `src`.
- Recommended: remove after confirming no native config references them. Reduces native build surface.
- Risk: low-med (native dependency change, needs a fresh build).

## D-36. `components/Health/VetRecord/EditMedicalProfileModal.jsx:311`
- `FormDateField` is defined as a component INSIDE the parent component. It remounts on every render, so its internal open state is lost on any parent state change.
- Recommended: hoist it to module scope (together with the min/max prop from D-20).
- Risk: low.

## D-37. Hardcoded English labels beside date and time inputs (EN+ES rule)
- `components/Health/Reminders/VetAppointmentRoutineModal.jsx:~548, ~570` ("Date *", "Time *"), `MedicationRoutineModal.jsx` ("Start Date", "End Date", "Time(s)"), `MedicalCareRoutineModal.jsx` ("Last given date", "Next due date", "End date (optional)", "Date", "Time"). These are not routed through i18n.
- Recommended: add keys to `en.json`/`es.json` (insert as text, not via a Python round-trip). Out of this audit's date scope, but they sit on the picker surfaces.
- Risk: low.

## D-38. Wire-format assumptions on `appointment_date` in business views
- `app/business/bookings.jsx:223-228` and `app/business/index.jsx:347-356` compare `b.appointment_date >= today` and `=== today`. If the API ever returns an ISO datetime, `=== today` fails. `HealthVetRecord.jsx:446, 827` already defend with `.slice(0, 10)`.
- Recommended: normalise with `canonicalizeDateValue(b.appointment_date)` before comparing. Verify the real wire format first (see D-33).
- Risk: low.

---

## Verified OK (no action)
- Only `DateField.jsx` / `TimeField.jsx` import `@react-native-community/datetimepicker`. All 25 consumer files pass and receive canonical `YYYY-MM-DD` / `HH:MM`.
- Birthday pickers already have `maximumDate={new Date()}` (`onboarding.jsx:1462, 1483`, `profile-edit.jsx:578`, `BirthdayOrAgeField.jsx:136`, `AddDogModal.jsx:361`). Future birthdays are blocked as intended.
- `AddVetRecordModal.jsx:213`, `AddVetNoteModal.jsx:103`, `AddDocumentModal.jsx:521` have `maximumDate` today.
- `DateField` onChange uses local `getFullYear/getMonth/getDate`, so no UTC shift (`canonicalDateTime.js:85-90`). `parseDateValue` parses date-only strings as local.
- `providerSlots.js:28` `en-CA` + `timeZone` is intentional machine formatting.
- `feedDelight.js:19`, `VetSummaryDashboard.jsx:18`, `VetSummaryModal.jsx:55` use `Date.UTC` + `toISOString().slice(0,10)` on date-only values, which is exact UTC arithmetic, not a bug.
- `hooks/useFetchHealthData.js:122` and `hooks/useFeedData.js:126` already use the local-day helper.
- No `hardcoded 'en-US'` remains except `components/Health/HealthToday.jsx:528` (fallback only, D-30). `grep -rn "en-US"` found only that one.
- Week start: `buildMonthMatrix` is Monday-first, consistent with `DayChips` (Mon=0).


---

## §4. Icons, colours, states, accessibility, dead controls

Scope: `anything/apps/mobile/src` (507 non-test source files, 271 JSX/TSX). Read-only. Brand source of truth: `pawpi-brand-kit/BRAND-GUIDELINES.md`.
Counts come from grep/AST-ish scripts over non-test source (excludes `__tests__`, `*.test.*`, `__create/`). "Heuristic" is marked where a script, not a read, produced the number. All `file:line` below were seen in tool output.

## 0. Summary table

| Area | Metric | Count |
|---|---|---|
| (e) Icons | Icon libs: lucide-react-native (212 files), @expo/vector-icons (1 file, `app/+not-found.tsx`), SF Symbols for native tab bar (`app/(tabs)/tabsConfig.js`). No FontAwesome in src. | 3 libs |
| (e) Icons | Emoji chars in non-test src (693 incl. 276 in en/es JSON); `🐾` alone 126 (28 in code) | 693 / 102 files |
| (e) Icons | lucide `PawPrint` used as a paw glyph | 72 uses |
| (e) Icons | Icon JSX with hard-coded hex colour vs COLORS/C token | 222 vs 647 |
| (f) Colour | Hex literals in code (excl. colour constant files) | 1,816 (147 distinct) |
|  | ... exact match to a `COLORS` token | 425 in 85 files |
|  | ... `#FFF`/`#FFFFFF` (no white token) | 612 in 166 files |
|  | ... legacy "health palette" near-duplicates (`#FFFBF7 #F5EDE4 #8B7355 #FFE5D9`) | 219 in 57 files |
|  | ... other off-palette (110 distinct) | 483 in 99 files |
|  | ... alpha variants (`#FFB74D30`...) | 46 in 15 files |
| (f) Colour | Files redeclaring a local `const C = {...}` palette | 83 (15 exact copies, 57 legacy, 5 mixed) |
| (f) Type | `fontSize: <number>` literals / files | 1,681 / 177 (TYPE token usages: 924 in 109 files) |
| (f) Type | `fontWeight: "<n>"` literals; `WEIGHT.*` usages | 1,497; 0 |
| (f) Type | `fontFamily` anywhere; Nunito loaded anywhere | 0; no |
| (f) Spacing | padding/margin/gap numeric literals vs `SPACING.*` | 3,390 vs 1,580 |
| (f) Radius | `borderRadius` numeric literals vs `RADIUS/RADII.*` | 938 vs 436 |
| (g) States | Shared Empty/Error/Loading component | none (16 local `EmptyState` copies, 1 local `ErrorState`, 0 Skeleton) |
| (g) States | Screens with loading+empty but no error branch (verified list) | 22 |
| (g) States | Data screens with `data: x = []` and no loading (empty flash) | 10+ |
| (h) A11y | Touchables total / with accessibilityLabel | 866 / 109 |
| (h) A11y | Icon-only touchables with NO label (parser) | 149 (back 49, close 55, delete 14, add 10, other 21) |
| (h) A11y | `<Switch>` without accessibilityLabel | 35 of 38 |
| (i) Dead | Touchables with no onPress at all | 7 (3 live dead controls) |
| (i) Dead | Empty `onPress={() => {}}` | 2 (both intentional) |
| (i) Dead | TODO/FIXME | 7 (all `utils/healthKitIntegration.js`) |
| (i) Dead | Live "coming soon" UI | 6 spots |
| (i) Dead | `console.log` (non-test) | 180 in 26 files (stripped from release by `babel.config.js:13`) |
| (i) Dead | Unreferenced modules (heuristic) | 24, incl. 7 files of VetRecord with fake data |

Findings below: V-01..V-24 (visual, includes icons), S-01..S-08 (states), A-01..A-07 (a11y), X-01..X-09 (dead/placeholder). 48 findings. Pattern findings give counts plus 5 example lines.

---

## 1. Top 10 by user impact

1. V-01 Nunito is never loaded. The whole app renders in the system font; brand kit mandates Nunito everywhere.
2. X-04 Two live dead buttons on Health > Insights ("Prepare report" `HealthInsights.jsx:564`, "Export all" `:744`) have no `onPress`. Also `WeightModal.jsx:512` ("Add photo (coming soon)").
3. V-13 / V-14 / V-15 Share cards and chrome violate brand non-negotiables: lucide `PawPrint` + `#FFF` + wordmark at weight 900 and +0.5 tracking; `🐾` emoji used as UI chrome.
4. S-02 22 list/detail screens silently show an empty state (or "not found") when the query fails.
5. S-04 `HealthVetRecord.jsx` runs 9+ independent `useQuery` calls and shows an error for none of them.
6. A-01..A-04 149 icon-only buttons have no accessibility label (back/close/delete/add). `common.back`, `common.close`, `common.delete` already exist in i18n.
7. V-02 / V-03 Two competing palettes: `constants/healthColors.js` and `walkRoutineColors.js` (card `#FFFBF7`, peach `#FFE5D9`, sand `#F5EDE4`, mutedBrown `#8B7355`) versus `constants/colors.js`. 57 Health/Map files use the legacy values.
8. V-07 No error/danger colour token. 14+ different reds.
9. A-06 35 Switches unlabeled.
10. X-05 Dead code with fake data (`VetInformation.jsx`: "Dr. Sarah Johnson", "123 Main Street, Anytown").

---

## 2. LOW-RISK mechanical fixes (can be applied without a design decision)

| Id | Fix | Scope | Why safe |
|---|---|---|---|
| A-01 | Add `accessibilityLabel={t("common.back")}` to icon-only `ArrowLeft`/`ChevronLeft` touchables | 49 sites, list in A-01 | Key exists (`common.back`), no visual change |
| A-02 | Add `accessibilityLabel={t("common.close")}` to icon-only `X` touchables | 55 sites | Key exists |
| A-04 | Add `accessibilityLabel={t("common.delete")}` to icon-only `Trash2` touchables | 14 sites | Key exists |
| V-05 | Replace quoted hex that is byte-identical to a COLORS token with `COLORS.x` (coral/warmBrown/cream/card/sand/peach/mutedBrown/sage/sageDark/terracotta/apricot) | 425 literals, 85 files | Exact match, zero pixel change |
| V-03a | In the 15 files whose local `const C = {...}` is byte-identical to COLORS values, replace the block with picks from `COLORS` | 15 files (list in V-03) | Exact match |
| X-09 | Delete unreferenced `data/mockData.js`, `VetRecord/{QuickActions,VetInformation,VetRecordHeader,InfoBox,PhotoHistorySection,RecentRecords}.jsx` after confirming no dynamic imports | 7 files | Not imported anywhere (grep) |
| X-06 | Delete `console.log` noise in `app/onboarding.jsx`, `useTodayDailyUpdate.js`, etc. | 180 lines | Already stripped in release; zero runtime effect in prod |
| X-03b | `HealthVetRecord.jsx:2466` `record.comingSoon` branch and `HealthTrack.jsx:168,255` `tracker.comingSoon`: no data sets the flag; remove dead branches | 3 spots | Dead code (verify with grep before) |
| S-09 | Retry buttons `color:"#FFF"` -> `COLORS.cream` | `follows.jsx:252`, `events.jsx:191` | kit: cream on coral |

Everything else below is NEEDS-HUMAN (design/brand decision) unless stated.

---

## 3. Visual findings (colour, type, spacing, icons)

### V-01 Nunito never loaded (HIGH, needs-human)
- Evidence: `grep fontFamily` finds only `components/Providers/ClaimCTA.jsx:257` (`TYPE.body.fontFamily`, which is `undefined`, `constants/typography.js` defines no family). No `useFonts`/`loadAsync`; `app.json:109` lists the `expo-font` plugin with no fonts; no `assets/fonts`; `package.json:22` has only `@expo-google-fonts/dev`.
- Variant: system SF/Roboto everywhere. Kit sec. 5: Nunito ExtraBold 800 headings (-0.02em) and 400/600 body, line-height 1.55.
- Canonical: add `@expo-google-fonts/nunito`, load in root layout, put `fontFamily` into `TYPE.*` (and `WEIGHT` to family map; RN needs distinct family names per weight on Android).
- RISK: med (layout shifts, all Text metrics; font-load gate on splash).

### V-02 Two competing colour palettes (HIGH, needs-human)
- `constants/colors.js:1-14` (kit-conformant: card `#FFFCF8`, peach `#FFD9B3`, sand `#F8EBDD`, mutedBrown `#7A6254`) versus `constants/healthColors.js:1-10` and `constants/walkRoutineColors.js:2-10` (card `#FFFBF7`, peach `#FFE5D9`, sand `#F5EDE4`, mutedBrown `#8B7355`).
- Literal counts: `#FFE5D9` 59, `#8B7355` 58, `#FFFBF7` 55, `#F5EDE4` 55 (219 total, 57 files: Health/Reminders 21, WalkActivity 6, PhotoCheck 4, Map 3, plus `app/nearby-walks.jsx:36-41`, `app/create-walk.jsx:24-29`, VetRecord via `healthColors` import).
- Match quality: `#FFFBF7`->`#FFFCF8` and `#F5EDE4`->`#F8EBDD` are near-exact (ΔRGB <= 3-5). `#FFE5D9`->peach `#FFD9B3` is a visible change (pinker/lighter). `#8B7355`->`#7A6254` is darker (better contrast: mutedBrown on cream ~5:1 vs ~3.9:1).
- Canonical: `COLORS` from `constants/colors.js`; make `healthColors.js`/`walkRoutineColors.js` re-export COLORS then delete.
- RISK: med (Health screens change tone slightly; needs device visual QA).

### V-03 83 files redeclare a local `const C = {...}` (needs-human; part is low-risk)
- 15 exact copies of COLORS (LOW-RISK): `app/weekly-digest.jsx:18`, `app/wrapped.jsx:12`, `app/household.jsx:18`, `app/welcome-back.jsx:17`, `app/memories.jsx:15`, `app/follows.jsx:17`, `app/pet-sharing.jsx:35`, `app/(tabs)/training.jsx:49`, `app/(tabs)/more/reminders.jsx:12`, `components/Settings/AppSettings.jsx:69`, `components/Health/LifeStageCard.jsx:13`, `components/Health/HouseholdLeaderboardCard.jsx:15`, `components/More/OwnerMenu.jsx:13`, `components/Forum/VoteControl.jsx`, `components/Feed/DayCard.jsx`.
- 57 legacy-palette copies: see V-02 (needs-human).
- 5 mixed/other: `app/lost-found.jsx:30` (adds `red:#D7553F`), `components/Health/VetSummary/VetSummaryModal.jsx:32` (`#2E8F62`,`#B8860B`), `components/DateField.jsx:14`, `TimeField.jsx:14`, `KeyboardSafeFormModal.jsx:23` (already token-based).
- Canonical: `import { COLORS } from "@/constants/theme"`.

### V-04 `#FFF` / `#fff` (612 literals, 166 files; needs-human policy then mechanical)
- By property: `color:` 401 (text/icons on coral buttons), `backgroundColor` 21, `fill` 9, `thumbColor` 6 (Switch), `borderColor` 5. 160 icon JSX `color="#FFF"`.
- COLORS has no white. Kit pairing: cream `#FFF7EF` on coral/brown (kit sec. 4). `#FFF` vs `#FFF7EF` is a near-exact match visually.
- Canonical: `COLORS.cream` for text/icons on coral or brown; keep pure white only for `Switch` thumb and over photo scrims (decide, then add `COLORS.white` if kept).
- 5 examples: `app/business-adoption.jsx:222`, `app/onboarding.jsx:765`, `app/events.jsx:164` (`<Plus color="#fff">`), `components/Health/Weight/WeightDashboard.jsx:115`, `components/Settings/AppSettings.jsx:202` (thumbColor).
- RISK: low (subtle tint) once policy decided.

### V-05 Hex literals that are exact COLORS tokens (425 in 85 files; LOW-RISK)
- `#FF6F61` 84, `#3B241B` 75, `#A7BFA3` 67 (sage), `#B75D32` 66 (terracotta), `#FFF7EF` 63, `#7A6254` 22, `#FFD9B3` 17, `#FFFCF8` 16, `#5A8A74` 11 (sageDark), `#F8EBDD` 9, `#FFB37A` 4 (apricot).
- Mostly inside local `C` blocks (V-03); the rest: `app/business-adoption.jsx:51,52,61` (`#B75D32`), `utils/handleNotificationTap.js` (`#A7BFA3`), `utils/calendarIntegration.js`, `data/walkActivityData.js`, `data/vomitData.js`, `components/Health/PhotoCheck/PhotoHistory.jsx`, `app/business-adoption.jsx:62` (`#7A6254`).
- `data/*.js` and `utils/*.js` colour maps import fine from `@/constants/colors`.

### V-06 Health/tracker accent colours outside palette (needs-human)
- `#FFB74D` 68 (29 files), `#64B5F6` 43 (13 files), `#F4A460` 21, `#4DB8E8` 20, `#FF5733` 15, `#9575CD` 8, `#42A5F5` 8, `#81C784` 9, `#4DB6AC` 6, `#E57373` 7, `#FFF4E6`/`#FFE4C4` 14 each; plus 46 alpha-suffixed variants (`#FFB74D30` 10, `#FFB74D20` 9, `#64B5F620` 5, `#FF573320` 3).
- Nearest tokens: `#FFB74D` ~ honey `#FFC857` / apricot `#FFB37A` (not exact); `#F4A460` ~ apricot; others have no equivalent (blues/purples/teal).
- Examples: `components/Health/HealthTrack.jsx:59,73,99` (`#42A5F5`,`#9575CD`,`#64B5F6`), `components/Health/Vomit/VomitTrackerModal.jsx` (14x `#FFB74D`), `components/Health/FoodWater/FoodWaterTrackerModal.jsx` (15x `#64B5F6`), `utils/handleNotificationTap.js:26-56` (category colours), `utils/calendarIntegration.js:40,412` (`#4DB8E8`).
- Kit: "Only approved colours". These are per-category data colours. Canonical suggestion: one `CATEGORY_COLORS` map (derived from palette tints: coral/apricot/honey/sage/sageDark/terracotta + a few muted extras) in `constants/colors.js`, or accept as a documented exception.
- RISK: med (data-viz hues on trackers/charts).

### V-07 Error/danger red has no token (needs-human)
- Distinct reds: `#FF4444` (`app/onboarding.jsx:1092`, `components/HandleAvailabilityHint.jsx:10`), `#E53935` (`app/business/profile.jsx:345,346`, `components/More/OwnerMenu.jsx:293`), `#D7553F` (`app/lost-found.jsx:34`), `#B23A2E` (`app/nutrition.jsx:127,129,148`), `#B23B30` (`app/business-adoption.jsx:55`, `vet-business-access.jsx:670`, `business/bookings.jsx:41`), `#C2410C` (`emergency-card.jsx:173,345`, `transport-track.jsx:269`), `#FF6B6B` (`EditMedicalProfileModal.jsx:290,301,329`), `#FF5733` (V-06), `#D32F2F`/`#B71C1C` (`Reminders/SettingsTab.jsx:229,240`), `#B33A3A` (`service/my-claims.jsx:98`), `#BF360C`,`#E65100`, `#E57373`.
- Canonical: add `COLORS.danger` (+ tint) once; map all of the above. Suggest closest to brand warmth: `#B23A2E`.
- RISK: low-med.

### V-08 Success/positive greens (needs-human)
- `#3FA34D` 19 (7 files: `service/booking-summary.jsx:252,327,346`, `service/daycare.jsx:331`, `service/sitting.jsx:264`, `service/adoption.jsx`, `AdoptionListingViews.jsx`), `#2E7D32` 6 (`(tabs)/training.jsx:64,158,434`), `#1F7A4D` 4 (`business-adoption.jsx:54,60`), `#2FA84F`, `#2E8F62`, `#388E3C`, `#059669`, `#10B981`, `#166534`, `#C8E6C9`/`#E8F5E9` fills.
- Canonical: `COLORS.sageDark` `#5A8A74` (existing) or a new `success` token.

### V-09 Blues/info and generic Material greys (needs-human)
- Blues: `#1976D2`,`#0D47A1` (`(tabs)/more/data-access.jsx:196-205`, `HealthVetRecord.jsx:1791,1795`), `#1565C0`,`#0369A1`,`#0C4A6E`,`#BAE6FD` (`Reminders/SettingsTab.jsx:329,412,419,425`), `#3B5CC4` (`(tabs)/more/community.jsx:31`), `#33587A` (`business-adoption.jsx:53`, `business/bookings.jsx:40`), `#E3F2FD`/`#BBDEFB` 5 each.
- Generic greys in `app/+not-found.tsx` (25 hex: `#666` 7, `#E5E5E5` 5, `#fff` etc.) and `Ionicons color="#666"` at `+not-found.tsx:129`. This screen is the Anything-generated sitemap not-found page; it is visible to users on any unknown route.
- Canonical: mutedBrown/border/sand tokens; replace `+not-found.tsx` with a branded screen (PawMark + cream bg).

### V-10 Black scrims/shadows (needs-human)
- `shadowColor` 72 sites (`ELEVATION` tokens exist in `constants/elevation.js`; unwrapped literals e.g. Vomit/Poo/Pee/FoodWater TrackerModal x3 each). `rgba(0,0,0,0.5)` 15, `0.35` 6, `0.4/0.55` 4. `#000` 10. Kit: "Cards: no shadows"; scrim tint recommended `rgba(59,36,27,a)` (only 4 uses).
- Canonical: `MATERIALS`/`ELEVATION` tokens, warm-brown scrim.

### V-11 Typography scale bypass (counts only)
- `fontSize` literals 1,681 in 177 files: 14 (348), 13 (335), 12 (282), 15 (185), 16 (139), 11 (100), 20 (77), 18 (72), 22 (30), 10 (29), 24 (24), 17 (23). TYPE has 30/24/20/16/15/14/13/12/11. Off-scale: 10, 17, 18, 22, 32, 40, 48.
- `fontWeight` literals 1,497; `WEIGHT.*` is never used. `fontWeight:"900"` 19 uses (Share cards, `wrapped.jsx`, `weekly-digest.jsx`, `ShareCardDeck.jsx:78`); kit max is 800.
- `letterSpacing: 0.5` 25 uses; kit wants -0.02em on headings and wordmark.
- Heaviest files: Health tracker modals (Vomit 47 hex literals, FoodWater 41, GeneralCheck 40, Pee 39, HealthInsights 31).

### V-12 Spacing/radius magic numbers (counts only)
- padding/margin/gap literals 3,390 vs `SPACING.*` 1,580. `borderRadius` literals 938 vs `RADIUS/RADII` 436: `12` 269, `16` 153, `14` 130, `18` 101, `20` 50, `10` 42, `22` 27. Kit sec. 8: use RADIUS.control(16)/card(24)/sheet(28)/chip(999). `14`/`18`/`22`/`10` have no token.
- Example: `app/lost-found.jsx:99` `borderRadius: 20` pills; `app/(tabs)/services.jsx` shows the target style (tokens + GlassSurface).

### V-13 Brand lockup rebuilt by hand on share cards (HIGH, needs-human)
- `components/Feed/ShareableDailyCard.jsx:42-45`, `ShareableStatCard.jsx:61-62`, `ShareableMemoryCard.jsx:34-35`: lucide `<PawPrint fill="#FFF">` plus `<Text fontSize 22 fontWeight "900" letterSpacing 0.5 color "#FFF">PawPi</Text>`.
- Breaks kit rules: no third-party paw icon, wordmark Nunito 800 -0.02em, reversed colour cream `#FFF7EF`, lockup gap 0.35x mark width.
- Canonical: `PawMark` (`components/ui/PawMark.jsx`) in cream + Nunito 800 wordmark. These images leave the app (shared externally), so highest brand exposure.
- RISK: med.

### V-14 lucide `PawPrint` as brand-like glyph (72 uses; needs-human)
- Used for the "pawing" reaction (`PostCard`, `PawablePhoto`, `FeedVideo`, `DayCard`), tab icon (`app/(tabs)/tabsConfig.js:15,37` with SF Symbol `pawprint`), badges (`components/Providers/PetPolicyBadge.jsx:4`), empty states (`app/service/pet-friendly.jsx:6`, `GettingStartedCard.jsx:5`, `CaregiverLogWalkModal.jsx:6`).
- Kit sec. 9: never "any third-party paw icon" in place of the mark. Reaction usage may be intended as a functional icon, not the logo. Decision needed: allow PawPrint only as a reaction/affordance icon, and use `PawMark` wherever the glyph stands for the brand (empty states, share cards, tab for Care).

### V-15 `🐾` emoji as UI chrome (needs-human; mostly low-med risk swap to PawMark)
- Chrome (should be PawMark): `components/More/OwnerMenu.jsx:241` (menu icon), `components/Health/CareRing.jsx:95` (ring centre), `components/Feed/MilestoneEventCard.jsx:45` (avatar fallback) and `:61` (`"🐾 ✓"` button), `components/Feed/ShareableStatCard.jsx:26,29` (hero glyph on share card), `app/weekly-digest.jsx:59` (share-card emoji), `app/(tabs)/more/profile.jsx:181` (title suffix).
- Data-driven icons: `data/routinesData.js:115`, `data/generalCheckData.js:102,108`, `components/Health/Reminders/PhotoCheckRoutineModal.jsx:39`, `components/Providers/BookingFormModal.jsx:49`, `constants/placeReviews.js:12`.
- Decorative in copy (acceptable, kit covers the mark not copy): `forum-thread.jsx:133,199`, `more/community.jsx:124`, notification bodies (`utils/notifications.js:389`), `onboarding.jsx:511`.
- Note `Settings` does render `PawMark` at 24-112 px everywhere else (15 files), never under 24 px: compliant.

### V-16 Emoji as navigation/category icons in chrome (needs-human)
- `components/More/OwnerMenu.jsx:193,215,235,241,247,253,259,265,271` (9 menu items with emoji + coloured tile).
- `components/Health/Reminders/UpcomingTab.jsx:357,358,362,367,369` (group header emoji).
- `app/vet-business-access.jsx:49-57` (9 capability icons), `components/Providers/BookingFormModal.jsx:44-64` (CAPABILITY_COPY icons).
- Data tables: `data/routinesData.js` 19, `generalCheckData.js` 17, `constants/placeReviews.js` 14, `data/remindersData.js` 10, `weightData.js` 9, `medicationData.js` 8, `trainingCurriculum.js` 8, `utils/notifications.js` 12 (push titles, fine).
- Menu/header chrome should be lucide (library already standard, 212 files); category pictograms in data may stay as a deliberate playful style. Decision for design.

### V-17 Text glyphs as icons (low-risk swap, visual QA)
- `components/Settings/AppSettings.jsx:413,427` (`−`/`+` stepper), `:891-913` (`value="→"`, 5 rows), `components/Providers/BookingFormModal.jsx:657,692` (`✓` in checkbox), `components/Feed/MilestoneEventCard.jsx:61`.
- Canonical: lucide `Minus`/`Plus`/`ChevronRight`/`Check`, `strokeWidth` default.

### V-18 Icon size scatter and no token (needs-human)
- `size=` values: 18 (181), 20 (133), 16 (112), 22 (98), 14 (55), 24 (39), 15 (21), 13 (17), 23 (5), 26 (6), 40/32/28 (decor).
- Back arrow: `ArrowLeft` 58 uses (54 at 22px, 2 at 18, 2 at 24) vs `ChevronLeft` 10 (24/22/20). Examples of the variant: `app/chat.jsx:96` (ChevronLeft 24, coral), `app/create-walk.jsx:116` (ArrowLeft 18), `app/nearby-walks.jsx:158` (ArrowLeft 18), `components/Health/PhotoCheck/PhotoCheckModal.jsx:210` (ChevronLeft 24), `app/vet-business-access.jsx:78` (X 24).
- Canonical suggestion: `ICON = {sm:16, md:20, lg:24}`; a shared `BackButton`/`CloseButton` (also fixes A-01/A-02/A-07 centrally).

### V-19 Same-meaning icon variants (low-risk, visual)
- Edit: `Edit` 2, `Edit3` 6, `Pencil` 4. Check: `CheckCircle` 11, `CheckCircle2` 6. Image: `Image` 72, `ImageIcon` 9. Warning: `AlertCircle` 15, `AlertTriangle` 12 (may be semantic).
- Canonical: `Pencil`, `CheckCircle2`, `ImageIcon` (avoids shadowing RN `Image`).

### V-20 Hard-coded icon colours (222 icons)
- `color="#FFF"` 160, `#FFB74D` 15, `#64B5F6` 9, `#3FA34D` 5, `#FF5733` 4, `#fff` 6, `#FF6F61` 2, `#3B241B` 2. Fix with V-04/V-05/V-06 mapping.
- Examples: `components/Health/Weight/WeightDashboard.jsx:115`, `app/emergency-card.jsx:336` (`#C2410C`), `app/nutrition.jsx:147` (`#B23A2E`), `components/Health/Weight/WeightModal.jsx:659` (`#E57373`), `app/chat.jsx:295`.

### V-21 strokeWidth (info)
- Only 11 files override: `2.5` x9, `3` x3 (`components/Health/Reminders/RoutinesTab.jsx:398` `Plus strokeWidth={3}`), others default 2. Acceptable.

### V-22 Third-party brand colours (info, exempt)
- `components/auth/SocialSignInButtons.jsx:106` Google `#4285F4`. Fine.

### V-23 Text-on-colour contrast risk (needs-human)
- `#8B7355` text on `#FFFBF7`/`#F5EDE4` (legacy mutedBrown on legacy card/sand) is lower contrast than kit `#7A6254`; ~55 files. Folded into V-02 fix.

### V-24 Wordmark/lockup elsewhere (info)
- Only the three share cards typeset "PawPi" in code (V-13); welcome/auth use `PawMark`. No Nunito -> wordmark falls back to system font until V-01 lands.

---

## 4. Empty / loading / error states

### S-01 No shared state components (needs-human; mechanical once designed)
- 16 near-identical local `function EmptyState({ title, body })`: `app/walker-walks.jsx:586`, `app/transport-track.jsx:359`, `app/sitter-visits.jsx:307`, `app/walker-history.jsx:226`, `app/walk-live.jsx:321`, `app/service/walking.jsx:751`, `sitting.jsx:615`, `daycare.jsx:641`, `vet.jsx:240`, `grooming.jsx:249`, `training.jsx:655`, `telehealth.jsx:352`, `shop.jsx:447`, `adoption.jsx:650`; plus `app/search.jsx:187` (emoji-based), `app/(tabs)/more/hub.jsx:126` (`Empty`), `HealthVetRecord.jsx:616`.
- One `ErrorState` only: `components/Services/ServicesDiscovery.jsx:1559`. ~17 ad-hoc retry blocks, three i18n keys: `common.retry` (events, follows, community, notifications, pet-profile, ErrorBoundary, PhotoHistory), `business.*.retry` (4 keys), `welcome.tryAgain` (`app/index.jsx:198`).
- No Skeleton anywhere; all loading = `ActivityIndicator` coral (some `C.sage`/`C.red`: `lost-found.jsx:114`, `pet-sharing.jsx:196,230`).
- Canonical: add `components/ui/StateViews` (`EmptyState`, `ErrorState` with `common.retry`/`common.somethingWrong`, `LoadingState`), export via `components/ui/index.js`; migrate screens.

### S-02 Screens with loading + empty but NO error branch (query failure looks like "nothing here"/"not found") (HIGH)
Verified (hook line shows no `isError`; no retry UI):
- `app/service/following.jsx:19` (`useFollowedProviders`), `app/service/my-claims.jsx:19`, `app/service/pet-friendly.jsx:21`
- `app/messages.jsx:99-100` (DM + business threads), `app/provider-messages.jsx:42`, `app/chat.jsx:45`
- `app/search.jsx:41-42` (`SearchResults` only handles `isLoading`)
- `app/memories.jsx:34`, `app/wrapped.jsx:27`, `app/household.jsx:32`, `app/welcome-back.jsx:35`, `app/weekly-digest.jsx:46`
- `app/lost-found.jsx:67-68` (a failed nearby fetch reads as "no lost pets nearby": safety-relevant), `app/emergency-card.jsx:93`
- `app/forum-thread.jsx:38` (error shows `forum.threadNotAvailable` at `:98-105`), `app/nearby-walks.jsx:76-87`, `app/pet-sharing.jsx:73-74`, `app/transport-track.jsx:56`, `app/(tabs)/more/hub.jsx:140-148`, `components/Services/MyActivity.jsx:118` (bookings), `app/walker-history.jsx` is OK (has `isError` `:26,74`).
- Good references to copy: `app/events.jsx:81,176-191`, `app/follows.jsx:46,240-252`, `app/(tabs)/more/community.jsx:54,308-335`, `app/service/telehealth.jsx:46,129`, `app/service/shop.jsx:145`, `app/(tabs)/more/data-access.jsx:71,215`.
- Canonical: `<ErrorState onRetry={refetch}/>` from S-01 using `common.somethingWrong` + `common.retry`. RISK: low per screen.

### S-03 `const { data: x = [] }` with no `isLoading` (empty state flashes while loading, errors invisible) (med)
- `app/nutrition.jsx:38-39` (plans + recalls), `app/insurance-policy.jsx:59`, `app/rx-fulfillment.jsx:57`, `app/service/transport.jsx:75` (trips; providers list is fine), `app/service/telehealth.jsx:51` (consults), `app/service/insurance.jsx:42` (plans), `app/service/places.jsx:35,60` (saved places: shows "no saved places" while loading), `app/service/place.jsx:70`, `components/Health/PackStreaksCard.jsx:21`, `components/Health/HealthToday.jsx:86`.
- Heuristic scan: 130 `const { data } = useX()` call sites ignore `isLoading/isError` entirely; many are fine (derived values), the above are user-visible lists.

### S-04 `HealthVetRecord.jsx` (HIGH, core health surface)
- 9+ independent `useQuery`: `:169` (summary, has loading), `:216,232,246,260,274,288,362,423` (medical profile, allergies, conditions, surgeries, lab results, documents, vet notes, appointments) with data-only destructuring; vaccinations has loading (`:190`). No error/retry for any. A failed section is silently blank (reads as "no allergies recorded", clinically misleading).
- Canonical: per-section `isError` -> inline `ErrorState` (compact) with `refetch`.

### S-05 Provider dashboards (med)
- `app/walker-walks.jsx:44-63` (`useMyProviders` loading handled; bookings/requests/nearby: data-only), `app/sitter-visits.jsx:36-43` (visits/bookings: loading handled for providers only).

### S-06 Cards that return nothing on failure (unverified heuristic, low)
- `components/Health/LeaderboardCard.jsx`, `HouseholdLeaderboardCard.jsx`, `LifeStageCard.jsx`, `PackStreaksCard.jsx`, `CareRingCard.jsx`: heuristic flagged missing loading/error; hiding is acceptable for optional cards. Not verified by reading.

### S-07 Empty-state quality (info)
- Most list screens do have an empty state (service/*, events, follows, notifications, community). Missing empty (heuristic): `components/Pets/PetPickerSheet.jsx`, `components/Health/HealthTrack.jsx`, `components/moderation/ModerationMenu.jsx` (static sheets, probably fine).

### S-08 Loading indicator colour/size inconsistent (low)
- `ActivityIndicator` coral (default), `C.sage` (`pet-sharing.jsx:177,196,230`, `nearby-walks.jsx:270`, `create-walk.jsx:220`), `C.red` (`lost-found.jsx:114`), `#FFF` inside buttons. Pick `COLORS.coral` on cream, `cream` inside coral buttons.

### S-09 Retry button text colour hard-coded (LOW-RISK)
- `app/follows.jsx:252`, `app/events.jsx:191`: `color:"#FFF"` -> `COLORS.cream`.

---

## 5. Accessibility labels

Parser result: 866 Pressable/TouchableOpacity/PressableScale/TouchableWithoutFeedback elements, 109 carry a label; 149 icon-only elements have none. `accessibilityRole` appears 238 times. `hitSlop` only 29 times (back/close icons are 16-22 px with no padding; target < 44 pt).

### A-01 Back buttons unlabeled (49; LOW-RISK; use `t("common.back")`)
5 examples: `app/service/places.jsx:51`, `app/lost-found.jsx:83`, `app/household.jsx:49`, `app/(tabs)/more/hub.jsx:169`, `components/Settings/AppSettings.jsx:800`.
Full list (ArrowLeft/ChevronLeft): provider-messages:69, rx-fulfillment:148, weekly-digest:70, nutrition:109, wrapped:38, insurance-policy:99, welcome-back:46, chat:96, walker-walks:253, memories:48, transport-track:119, nearby-walks:158, sitter-visits:61, walker-history:48, walk-live:59, provider-chat:121, forum-thread:74, pet-sharing:101, event-create:93, events:158, create-walk:116, (tabs)/training:391, more/reminders:90, more/profile:177, more/data-access:124, more/community:162, more/profile-edit:339, service/{provider-post:233, sitting:97, transport:219, walking:216, insurance:97, daycare:96, places:51, provider:511, training:96, vet:68, grooming:75, place:128, following:40, adoption:135, telehealth:82, shop:81}, forum-compose:63, `components/Health/PhotoCheck/PhotoCheckModal.jsx:210`. (`app/+not-found.tsx:128` also.)
Better fix: shared `BackButton` (V-18) with label + `hitSlop`.

### A-02 Close (X) buttons unlabeled (55; LOW-RISK; `t("common.close")`)
5 examples: `app/lost-found.jsx:272`, `app/notifications.jsx:622`, `components/Health/HealthVetRecord.jsx:2388`, `components/Pets/AddDogModal.jsx:182`, `components/Feed/PostComposerModal.jsx:240`.
Others: lost-found:339, messages:171,203, nearby-walks:563, sitter-visits:236, vet-business-access:78, (tabs)/training:474, service/{sitting:438, daycare:531, training:470, adoption:390}, `HealthVetRecord.jsx:2536,2643,2795`, WriteReviewModal:97, FeedingIssueModal:150, VetAppointmentDetailModal:180, all Health tracker modals (Weight:256, GeneralCheck:852, Vomit:310, Wellness:179, Pee:233, VetSummary:106, Poo:249, WalkActivity x3, FoodWater:202, PhotoCheck:227/350), 14 Reminders modals, AdoptionListingViews:311, LocationField:137, PostDetailModal:160, ShareCardDeck:39.

### A-03 Add (Plus) FABs unlabeled (10; needs a new key, e.g. `common.add`; no `common.add` exists)
`app/events.jsx:164`, `app/(tabs)/more/community.jsx:191`, `components/Health/{Weight/WeightDashboard.jsx:115, GeneralCheck/GeneralCheckDashboard.jsx:79, Vomit/VomitDashboard.jsx:114, Pee/PeeDashboard.jsx:97, Poo/PooDashboard.jsx:92, WalkActivity/WalkActivityDashboard.jsx:123, FoodWater/FoodWaterDashboard.jsx:117, Reminders/RoutinesTab.jsx:398}`. Prefer per-context labels (e.g. "Add weight").

### A-04 Delete (Trash2) unlabeled (14; LOW-RISK; `t("common.delete")`)
`app/emergency-card.jsx:336`, `app/pet-sharing.jsx:221`, `app/service/provider-post.jsx:465`, `components/Health/HealthVetRecord.jsx:1400,1598`, `Weight/WeightModal.jsx:659`, `Vomit/VomitTrackerModal.jsx:918`, `Reminders/{WellnessCheckRoutineModal:708, FeedingRoutineModal:467, MedicalCareRoutineModal:585,1213, WalkItem:115,240, UpcomingTab:238}`.

### A-05 Other icon-only controls (21; needs-human label text)
`app/chat.jsx:295` (Send; `common.send` exists) and `:248` (attach), `app/provider-chat.jsx:223,262`, `app/forum-thread.jsx:254`, `app/pet-sharing.jsx:272` (Check/accept), `:279` (X/decline), `app/vet-business-access.jsx:737` (checkbox, also needs `accessibilityRole="checkbox"` + `accessibilityState`), `components/Forum/VoteControl.jsx:34,54` (up/down vote), `app/(tabs)/more/profile.jsx:183` (Edit), `app/(tabs)/more/community.jsx:175` (events), `app/service/provider-post.jsx:532,612`, `components/Feed/DailyShareButton.jsx:101` (Share2; `common.share` exists), `PawablePhoto.jsx:98`, `BusinessPostCard.jsx:121`, `FeedVideo.jsx:97`, `BarkModal.jsx:348`, `Health/Reminders/UpcomingTab.jsx:225` (CheckCircle complete).

### A-06 Switches without label (35 of 38; needs-human text, mechanical)
`app/weekly-digest.jsx:162,170`, `app/household.jsx:72`, `app/emergency-card.jsx:242`, `app/service/{sitting.jsx:561, walking.jsx:678}`, `components/Settings/AppSettings.jsx:335,375,391,517,752` (+196), `components/Health/Reminders/{SettingsTab:190, SocialWalkSettings:289, FeedingRoutineModal:689,714, WellnessCheckRoutineModal:862,896, VetAppointmentRoutineModal:794,823,851, RoutineCard:321, PhotoCheckRoutineModal:558,586,752,782, ReminderSettings:37,60, MedicalCareRoutineModal:1265, MedicationRoutineModal:419,442, PreventiveCareRoutineModal:331,354, SocialWalkToggle:35, VaccineRoutineModal:252,275}`. Use the row's existing title string as the label (already in i18n).

### A-07 Touch-target size and TextInputs (info/med)
- Icon buttons of 15-22 px without `hitSlop` (29 hitSlop uses across the app vs 149 unlabeled icon buttons). Fix inside shared Back/Close components.
- 147 TextInputs; only 2 have neither `accessibilityLabel` nor `placeholder`: `components/Health/WalkActivity/WalkActivityModal.jsx:327,355`. 0 uses of `allowFontScaling={false}` (good: Dynamic Type works).

---

## 6. Dead / placeholder controls

### X-01 Empty `onPress={() => {}}` (2; benign, no action)
- `components/moderation/ModerationMenu.jsx:137` swallows taps inside a sheet (intentional, commented).
- `components/adoption/AdoptionListingViews.jsx:418` `PrimaryButton ... onPress={() => {}} disabled` (status-aware disabled CTA, intentional).
- Also benign no-ops: `app/service/provider.jsx:227` (`onComplete: () => {}`, documented), `utils/auth/useAuth.js:45` (`useEffect(() => {}, [])` leftover).

### X-02 Touchables with no `onPress` (7; 3 are live dead buttons) (HIGH, needs-human)
- `components/Health/HealthInsights.jsx:564` "Prepare report" (`t("health.insightsView.prepareReport")`) and `:744` "Export all" (`exportAll`): both in the live Health > Insights tab (`app/(tabs)/health.jsx:72`). Tap does nothing. Either wire to the existing vet-summary export or remove. Note the repo rule "no no-op buttons" (`profile-edit.jsx:100` comment).
- `components/Health/Weight/WeightModal.jsx:512-534` "Add photo (coming soon)" is a `TouchableOpacity` with no `onPress`.
- Dead-file instances (not reachable): `VetRecord/QuickActions.jsx:15,44`, `RecordCard.jsx:10`, `VetInformation.jsx:68`.

### X-03 "Coming soon" copy visible to users (6 spots)
- `components/Health/GeneralCheck/GeneralCheckModal.jsx:1374` ("Ask AI" locked row, `opacity:.6`, Lock icon; `askAiSoon`).
- `components/Health/PhotoCheck/PhotoHistory.jsx:435` (`compareBody` "Coming soon: compare visible changes...").
- `components/Health/Weight/WeightModal.jsx:534` (`addPhotoSoon`, dead button, X-02).
- `components/Services/ServicesDiscovery.jsx:1354,1367` ("Map coming soon" fallback when maps unavailable).
- `app/service/shop.jsx:185` (empty state "Check back soon -- pet shops are joining").
- `utils/healthKitIntegration.js:61-62` Alert "Coming Soon" (reachable only if `WALK_TRACKING_INTEGRATIONS_ENABLED` in `constants/featureFlags.js:7` is flipped; hard-coded English).
- X-03b (LOW-RISK): dead conditionals `HealthVetRecord.jsx:2466` (`record.comingSoon`), `HealthTrack.jsx:168,255` (`tracker.comingSoon`; no tracker sets it). Unused i18n: `recapStub` (`en.json:2065`), `care_recap` copy `"Coming soon -- monthly care recap"` (`en.json:2093`, used as stub in `utils/shareLinks.js:31,47`).
- Recommendation: gate or remove per the 2026-10-16 QA policy (no coming-soon controls); needs product call.

### X-04 TODO/FIXME/XXX (7, all one file)
- `utils/healthKitIntegration.js:19,30,58,74,96,103,113`. Stubs returning `false`, `Alert` with literal English ("Not Available", "Apple Health Access") at `:41-62`, `console.log` at `:104`. Imported by `WalkTrackingSettings.jsx:11` and `PostWalkFeedbackModal.jsx:20`.

### X-05 Dead code with fake/sample data (LOW-RISK delete after confirming)
- `components/Health/VetRecord/VetInformation.jsx:47,57,66` hard-codes "Dr. Sarah Johnson", "(555) 123-4567", "123 Main Street, Anytown, CA 12345". Never imported. Also unreferenced: `QuickActions.jsx`, `VetRecordHeader.jsx`, `InfoBox.jsx`, `PhotoHistorySection.jsx`, `RecentRecords.jsx` (only `RecordCard` is imported, by the dead `RecentRecords`), `data/vetRecordData.js` (`clinic:"Dr. Sarah Johnson"` `:22`).
- `data/mockData.js` (215 lines: `MOCK_WALK_LOGS:132`, `MOCK_POO_LOGS:165`, `MOCK_FOOD_LOGS:192`) not imported. `data/routinesData.js:994 mockRoutines` and `data/remindersData.js:171 mockReminders` (`petId:"sample-pet"`) are exported but unused (READMEs `store/README.md:304,340`, `components/Health/Reminders/README.md:272` still claim a mock fallback; stale docs). CLAUDE.md says "No fake/mock data".
- Other unreferenced modules (heuristic; verify before deleting): `utils/socialWalkNotifications.js`, `utils/usePreventBack.js`, `utils/useHandleStreamResponse.js`, `components/Health/HealthReminders.jsx`, `Poo/PooDashboard.jsx`, `FoodWater/FoodWaterDashboard.jsx` (note: these have `+` FABs listed in A-03, so those 2 FAB findings are on dead files), `Reminders/DeleteConfirmationModal.jsx`, `Reminders/ReminderCreationModal.jsx`, `hooks/useReminderAutoComplete.js`. Test-only usage: `LifeStageCard.jsx`, `HouseholdLeaderboardCard.jsx`, `hooks/useDayCard.js`.

### X-06 console.log leftovers (180 in 26 files; LOW-RISK, dev-only)
- Release builds strip them (`babel.config.js:9-14`, A-27 comment), so no production leak. Noise and risk if the plugin config changes.
- Top: `app/onboarding.jsx:354-611` (~49, logs form data/pet), `app/(tabs)/more/profile-edit.jsx:128-267`, `hooks/useTodayDailyUpdate.js:21-72`, `hooks/useFeedData.js:111-228`, `utils/useUpload.js:44-140`, `store/routinesStore.js:483-541`, `app/onboarding-photo.jsx`, `app/index.jsx:57-241`, `hooks/useHealthTracking.js` (8).
- 5 examples: `app/(tabs)/more/profile.jsx:185`, `components/Health/Reminders/DeleteConfirmationModal.jsx:25`, `components/Health/Reminders/WalkItem.jsx:67`, `app/(tabs)/_layout.jsx:213`, `utils/registerPushToken.js:74`.

### X-07 Hard-coded English in UI/alerts (spill-over for i18n audit)
- `components/Providers/BookingFormModal.jsx:44-64` ("Repeat every 6 weeks", "Repeat weekly (pack walk)"), `components/Feed/PostDetailModal.jsx:479` ("Add a bark"), `hooks/useLostFound.js:109` (Alert "Welcome home!"), `hooks/useFeedData.js:237`, `utils/memoriesWrapped.js:212` ("furry friends made"), `app/forum-thread.jsx:133,199` ("someone"), `utils/healthKitIntegration.js:41-62`, `components/Feed/DailyShareButton.jsx:12`.

### X-08 `PetPickerSheet` / `ModerationMenu` etc. (no findings)
- Checked; no dead controls beyond those listed.

### X-09 Not-found screen is Anything boilerplate (see V-09)
- `app/+not-found.tsx` ships a sitemap/debug UI (`useSitemap`, 25 hard-coded hex, Ionicons) as the user-visible unknown-route page. Replace with branded fallback. RISK: low-med.

---

## 7. Suggested canonical set (for the fixer)

- Colours: `COLORS` (`constants/colors.js`). Add `danger`, `success` (or use `sageDark`), `white` only if kept. Delete `healthColors.js` / `walkRoutineColors.js` after re-export.
- Type: `TYPE` + new `fontFamily` (Nunito) in `constants/typography.js`; stop literal `fontSize`/`fontWeight`.
- Space/radius: `SPACING`, `RADIUS` (16/24/28/999).
- Icons: lucide only; add `ICON` size tokens (16/20/24); shared `BackButton`/`CloseButton` in `components/ui` carrying `accessibilityLabel` (`common.back`/`common.close`), `hitSlop`, role.
- Brand mark: `PawMark` only (never `PawPrint` lockups, never `🐾` in chrome).
- States: new `components/ui/StateViews` (`EmptyState`, `ErrorState`, `LoadingState`).


---

## 5. Needs human (decisions — nothing here is changed by E1–E5)

- **Real fonts:** Nunito is never loaded; the app renders in the system font while the brand kit specifies Nunito (headings/body). Loading fonts is a native/asset change (`expo-font` + asset bundle) and affects every screen — design + build decision.
- **Shared button system:** only 3 files use `Button`; ~112 hand-rolled primaries. Consolidating needs a design decision about sizes/variants (and `Button size="sm"` is itself ~34pt). E4 only swaps *exact-match* colours.
- **Destructive colour:** no `COLORS.danger` token; 7+ reds in use. E4 introduces ONE token for the already-dominant red and swaps only exact matches; picking the final red is a brand decision.
- **"Second health palette"** (`#FFFBF7`, `#F5EDE4`, `#8B7355`, `#FFE5D9`, 219 uses in 57 files): off-kit but pervasive; replacing changes the look of Health. Needs design sign-off.
- **Toasts vs blocking Alerts:** ~42 success confirmations are blocking Alerts; `sonner-native` has no mounted `Toaster`. Adopting toasts is a UX decision.
- **Unused dependencies** (`@gorhom/bottom-sheet`, `react-native-calendars`, `@react-native-picker/picker`): removing changes the lockfile / native deps — not done.
- **Terminology:** Log in vs Sign in, Delete vs Remove, handle vs usuario, dog vs pet — product-language decision (E1 only fixes clear defects).
- **Title Case vs sentence case in EN (271 values):** style decision.
- **Training curriculum data (≈400 strings) and other large EN-only content tables:** translation work, not a mechanical fix.
- **Future-only pickers:** adding `minimumDate` to every future-only form (walks, events, transport, sitting, daycare, vet appointments, free-form booking) changes validation rules per screen — E2 only does the ones where the rule is unambiguous.
- **Reminder-id date keys (`toISOString().split("T")[0]` ×~35 in `reminderGenerator.js`)** are a locked id/dismissal-key scheme: do not touch (D-32).
