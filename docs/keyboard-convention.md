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
6. **Never declare a component inside another component around a text field.** `const Field = () => <TextInput/>`
   inside a screen or modal is a new component type on every render: React remounts it on each keystroke and the
   keyboard closes. Declare it at module scope and pass props (or call a plain `renderField()` function).
   The same applies to components without a text field: see "CI check for components inside components".
7. **A keyboard-aware scroll view inside `presentationStyle="pageSheet"` passes `inPageSheet`**, and runs to the
   bottom of the sheet (pinned footers belong in `KeyboardSafeSheet`).
8. A pinned footer must never float over the form while typing. An absolutely positioned footer switches to
   `position: "relative"` (taking its own space) while `useKeyboardMetrics().keyboardVisible`.
9. Do not swap a screen's branch (spinner, empty state) in a way that unmounts the search field the user is typing in.

All of 1, 2, 6 and 7 are enforced by `keyboardSafety.guard.test.js`.

## CI check for components inside components

`npm run lint:components` (a step of the `mobile (jest)` job) runs Biome with exactly one rule,
`lint/correctness/noNestedComponentDefinitions` (`biome.json`; no formatter, no other rules). It covers every
`.js/.jsx/.ts/.tsx` file of the mobile app, with or without a text field.

* Cases that already existed are listed in `scripts/nested-components-baseline.json` and only warn. The match is per
  file + component name + count, so line shifts do not matter.
* A new case fails. Fix it: move the component outside its parent and pass props, or make it a lowercase function and
  call it (`{renderRow()}`). Do not add it to the baseline.
* After fixing, renaming or moving a listed case, lower or remove its entry; an outdated entry also fails.
* A file Biome reports a syntax error for fails unless it is listed under `unparsed`. That list is empty.

**What the rule does not detect** (checked with Biome 2.6.7): a component wrapped in `useCallback` / `useMemo` or
returned by a factory (`styled(...)`), one chosen by a condition (`x ? () => <A/> : B`), an inline
`ListHeaderComponent={() => ...}`, and anything declared inside a hook, a lowercase-named function or an anonymous
`export default () => ...`. Guard rule 6 still covers the inline-prop and `useCallback` shapes when a text field is
involved.

## What `KeyboardAwareScrollView` guarantees

* While the keyboard is up the focused field is kept above it (and above any pinned footer), with a 16pt margin. It
  re-checks when focus moves to another field, when the content grows (multiline caret), and when the keyboard
  changes height.
* Only the innermost scroll view holding the focused field scrolls; screens behind a modal stay put.
* Taps keep working (`keyboardShouldPersistTaps="handled"`); dragging dismisses the keyboard on iOS.

## The TextInput wrapper (do not break this)

Metro replaces React Native's `TextInput` with `polyfills/native/textinput.native.jsx`. That wrapper **must keep
`TextInput.State`**. Without it `State.currentlyFocusedInput()` was unavailable in the app and no focused field was
ever scrolled into view on iPhone or Android, while jest (which does not apply the alias) stayed green. This is why
earlier keyboard fixes did not hold on device. Pinned by `components/textInputPolyfill.test.js`.

## Page sheets

Inside an iOS `pageSheet` modal, `measureInWindow` reports positions relative to the sheet (measured on an iPhone
16 Pro Max simulator: 62pt off), while the keyboard frame is in screen coordinates. `inPageSheet` adds
`computeSheetOffset(windowHeight, scrollViewBottom)` to every measurement.

## Root cause of the Quick Check bug (history)

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

A pageSheet's problem is coordinates: layout is measured against the sheet, not the screen (see "Page sheets"
above). The new shared sheets use a transparent Modal that
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

Migrated to `KeyboardSafeSheet` (screen, 2026-11-25): Vet Summary.

Migrated to `KeyboardSafeSheet` (sheet): Quick Check (both modes), MedicationModal, MedicalCareIssueModal, PlaceReviewModal,
WriteReviewModal, walking request sheet, CaregiverLogWalkModal. (screen): Medication/Preventive/Vaccine/MedicalCare/Feeding/
VetAppointment/WellnessCheck routine modals, FeedingIssueModal, AddDogModal, VetAppointmentDetailModal, ReviewProposalModal,
and `KeyboardSafeFormModal` itself. Left on purpose (listed with reasons in the guard test): BarkModal, ServicesDiscovery,
PhotoCheckCaptureModal (full-screen multi-step flow), search overlay, chat screens, the ~25 pageSheet forms whose CTA is inside
the scroll, and small field components hosted inside an aware parent.

Not changed (needs a device look): pageSheet screens pad their header with `insets.top`; inside a sheet that may double the top gap.
