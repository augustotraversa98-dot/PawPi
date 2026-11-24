# Keyboard convention — how forms with text fields must be built

Why this file exists: "the keyboard hides the text field" was fixed several times (KeyboardAwareScrollView #40,
Quick Check zero-height #436, onboarding KAV #460, pageSheet fixes) and kept coming back, because each fix was
local to one screen. This is the single shared mechanism plus a CI guard so a new screen cannot bypass it.

## The rule (mobile app, `anything/apps/mobile`)

1. **Any form with a text field that has a header and/or a pinned footer (Save / Next / Create) is built on
   `src/components/KeyboardSafeSheet.jsx`.** `variant="sheet"` (tall bottom sheet; add `fit` for short forms) or
   `variant="screen"` (full window). `KeyboardSafeFormModal` is a thin wrapper over it for the plain
   header + scroll + CTA shape.
2. **Forms that scroll with no pinned footer** (the CTA is the last thing inside the scroll) may stay as
   `presentationStyle="pageSheet"` modals, but their scroll content MUST be `KeyboardAwareScrollView`.
3. **Full-screen routes with a pinned composer** (chat, comment bar) use a `KeyboardAvoidingView`
   (`KeyboardAvoidingAnimatedView`) with the correct `keyboardVerticalOffset` for their own header.
4. **Never** hand-roll `Modal transparent > KeyboardAvoidingView > View height/maxHeight:"90%"` again, and never put
   a `<TextInput>` in a plain `ScrollView`/`FlatList`. `src/components/keyboardSafety.guard.test.js` fails CI for both.
5. Do not edit presentation heights by hand. Use `computeSheetHeight` and friends in `src/utils/keyboardLayout.js`.

## Root cause of the Quick Check bug (and why it was app-wide)

The old sheets were `Modal transparent > KeyboardAvoidingView(padding) > View height:"90%"` with a fixed header, an
instruction block, a fixed footer (hint + button) and `paddingBottom: insets.bottom + 20`, around a `flex:1` scroll view.
With the keyboard up (iPhone, ~336pt) this is the arithmetic:

| | before | after |
|---|---|---|
| sheet | 90% of (window - keyboard) = 464pt | all of window - keyboard - status bar = 457pt |
| chrome inside it | 20 top + 36 header + 60 instruction + 32 hint + 68 button + **54 home-indicator padding** = 270pt | 20 + 36 + 68 + 12 = 136pt (instruction + hint hidden, padding 12) |
| **scroll area left** | **~194pt** (iPhone SE size: ~130pt) | **~320pt** (SE size: ~250pt) |

Two more defects compounded it:

* The home-indicator padding (`insets.bottom + 20`) is dead space once the keyboard covers that area.
* `KeyboardAwareScrollView` scrolled the focused input "above the keyboard", but a pinned footer sits BETWEEN the
  scroll view and the keyboard. An input whose bottom edge was above the keyboard but below the scroll view's bottom
  edge (the notes field under the last area) never scrolled, so it stayed hidden under the footer. It now measures
  against the **visible** bottom (`min(scroll view bottom, keyboard top)`).

`pageSheet` is not the cause: a pageSheet is nearly full height; its problem is only that `KeyboardAvoidingView` measures
against the screen, not the sheet (hence KeyboardAwareScrollView). The new shared sheets use a transparent Modal that
covers the whole window, where keyboard coordinates are exact, so the layout is driven by the real keyboard overlap
(`useKeyboardMetrics`: show, hide AND frame changes, e.g. switching EN/ES keyboards) instead of `KeyboardAvoidingView`.

## What `KeyboardSafeSheet` guarantees

* Presentation: transparent full-window Modal, never pageSheet; sheet height is a definite number (no zero-height
  collapse) that grows to fill everything above the keyboard.
* Footer is a sibling OUTSIDE the scroll view, pinned directly above the keyboard; its bottom padding drops to 12pt while
  typing. `header`, `subheader` (hidden while typing) and `footer` slots can also be functions of
  `{ keyboardVisible, keyboardOverlap }`.
* Body is `KeyboardAwareScrollView`: `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"` (iOS), focused
  input scrolled into the visible area. Tapping the dimmed backdrop dismisses the keyboard (it never closes the form).
* `overlay` slot for absolutely-positioned layers (pickers) that must cover the whole form.
* Android: the window resizes (adjustResize), so no extra padding is added there; the chrome still collapses.

## Migrated vs deliberately left

Migrated to `KeyboardSafeSheet` (sheet): Quick Check (both modes), MedicationModal, MedicalCareIssueModal, PlaceReviewModal,
WriteReviewModal, walking request sheet, CaregiverLogWalkModal. (screen): Medication/Preventive/Vaccine/MedicalCare/Feeding/
VetAppointment/WellnessCheck routine modals, FeedingIssueModal, AddDogModal, VetAppointmentDetailModal, ReviewProposalModal,
and `KeyboardSafeFormModal` itself. Left on purpose (listed with reasons in the guard test): BarkModal, ServicesDiscovery,
PhotoCheckCaptureModal (full-screen multi-step flow), search overlay, chat screens, the ~25 pageSheet forms whose CTA is inside
the scroll, and small field components hosted inside an aware parent.

Not changed (needs a device look): pageSheet screens pad their header with `insets.top`; inside a sheet that may double the top gap.
