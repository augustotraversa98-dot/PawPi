# Onboarding code audit — 2026-09-29

Code-only static audit of the 9-step onboarding wizard, triggered by
`docs/SIMULATOR_QA_2026-09-D.md`'s report of onboarding "freezing solid" at
Step 5 (gender) on three from-scratch simulator runs. No simulator/device was
driven for this audit — static analysis + unit tests only, per the task brief.

Scope: `src/app/onboarding.jsx` (the wizard), `onboarding-photo.jsx`,
`onboarding-photo-preview.jsx`, `components/KeyboardAwareScrollView.jsx`,
`components/BreedPicker.jsx`, `components/DateField.jsx`,
`utils/validateHandle.js`, `utils/canonicalDateTime.js`, and the #573
handle-availability path (mobile call site + `web/.../handle-availability/route.js`).

## Verdict: can the Next gate wedge at the gender step? **No.**

`StepGender`'s `onPress` (`onboarding.jsx:1310-1312`, post-fix; the logic was
unchanged by this PR) writes
`formData.gender` from the *same* two-value list (`GENDER_VALUES` after this
PR; previously two inline string literals) that `canGoNext()`'s gender case
and `firstIncompleteRequiredStep()` check against. The values were already
character-for-character identical (`"female"` / `"male"`) before this PR —
there was no casing/spelling drift to trigger a permanent disable. A new
screen-level test (`onboarding.test.jsx`, "gender step (Step 5 QA concern)
cannot wedge Next") drives the actual rendered cards — tap Female, tap Male,
switch back and forth — and Next unlocks every time.

Nothing else in the render path for that step can hang: `StepGender` has no
effects, no async work, and no state outside `formData.gender`; `Card` and
`PressableScale` are plain `View`/`Pressable` wrappers with no conditional
overlay that could swallow touches once mounted. `PressableScale` is used
identically on the (confirmed-working, per the QA report) breed step.

**Read together with the QA report's own observations** (0% CPU after the
freeze, touch dispatched per `simctl log`, no crash logged, and prior sweeps
completing this same step the day before, plus *other* ordinary taps and
native `Alert` dialogs misbehaving in the same session) — this points at the
Debug+Metro+Simulator harness described in the report's own "Environment
reliability" section, not a code defect in this step. Recommend the report's
own suggested next step: reproduce on a real device or a clean TestFlight
build before treating it as a real user-facing blocker. If it recurs on a
clean build, the reproduction is not in this file — widen the search to the
touch-dispatch/bridge layer (the report's independent "Español opened Delete
account?" observation is the same category of symptom).

## Findings

### Applied in this PR

| # | Sev | File:line | Issue | Fix |
|---|-----|-----------|-------|-----|
| 1 | S1 | `onboarding.jsx` handle-availability effect (~187-236) | The live `/api/pets/handle-availability` check had no timeout. A request that never settles (dropped connection, backgrounded app, captive portal) never runs `.then` or `.catch`, so `handleApiChecking` stays `true` and `handleApiConfirmedFor` never gets set — Next is disabled **forever** on the handle step. This is the one place in the file that matches the task's "async gate that never resolves" wedge class; the gender step (all cases above) does not. | Added an `AbortController` + 8s bounded timeout. A timeout now aborts the stale request, which routes through the existing fail-OPEN `.catch` (same behavior as a network error). Cleanup also aborts the in-flight request on unmount/re-debounce instead of only ignoring its result. New test: "a request that never settles unlocks Next once the bounded timeout trips". |
| 2 | S2 | `onboarding.jsx:51,70,634,1265-1276` (gender) | `canGoNext()`'s gender case, `firstIncompleteRequiredStep()`, and `StepGender`'s option list each independently spelled out `"male"`/`"female"`. Not a live bug (verdict above), but three independent copies of the same two literals is exactly the shape of bug the QA report worried about — a future edit to one list (e.g. adding an "unknown" option, or a typo) would silently reintroduce a real wedge. | Introduced one `GENDER_VALUES` constant; all three sites now derive from it, so the gate and the picker can no longer drift apart by construction. Behavior-identical (same two values, same order). |
| 3 | S2 | `onboarding.jsx` save-progress effect (~150-154 before, now ~156-171) | Fired `AsyncStorage.setItem(JSON.stringify(formData))` on **every keystroke** in every field (name, custom handle, age, weight, notes) once past step 0 — needless disk I/O on the hot path of every text input, and the write's promise was unhandled (a storage failure would be an unhandled rejection). | Debounced the write to 400ms after the last change, and added `.catch` so a storage failure logs instead of rejecting silently. Same net behavior (progress is still saved before the user can navigate away), just not once per character. |
| 4 | S3 | `onboarding-photo.jsx:20-34` | The mount-time permissions check (`getCameraPermissionsAsync` / `getMediaLibraryPermissionsAsync`) ran unguarded. A throw there wouldn't currently strand the user (both `openCamera`/`openGallery` already treat an unset permission as "not granted" and request it on tap), but it's an unhandled-rejection risk this audit was asked to close on every mount/async effect in the flow. | Wrapped in try/catch, logs and degrades to the same fallback path that already exists for a denied/unset permission. No behavior change on the happy path. |

All four are behavior-preserving: same happy-path outcomes, same copy, same
gating rules — only the failure/edge-case handling changed. `npm test` is
green (283 suites / 2174 tests in `mobile`, unchanged elsewhere).

### Proposed (not applied — needs a call)

| # | Sev | File:line | Issue | Why not applied now |
|---|-----|-----------|-------|----------------------|
| 5 | S2 | whole mobile app (no file — architectural) | There is **no error boundary anywhere in the mobile app** (`grep -r componentDidCatch/react-error-boundary` returns nothing). A render-time throw inside any onboarding step (or anywhere else) white-screens the whole app with no recovery UI. The task asked me to "consider an error boundary around the wizard." | This is a new pattern for the codebase, not a one-file fix: it needs a design call (app-wide vs. per-route, what the fallback UI says, whether it should offer "restart" vs. "go back", EN+ES copy, whether it reports to any error-tracking pipeline) that's bigger than "surgical, behavior-preserving." Flagging for a deliberate follow-up rather than bolting on an ad hoc boundary just for this one screen. |
| 6 | S3 | `onboarding-photo.jsx:247,260` and `onboarding-photo-preview.jsx:333,346,366,379` | `disabled={isPickingImage.current}` / `opacity: isPickingImage.current ? 0.5 : 1` read a `useRef` in JSX. Ref mutations don't trigger re-renders, so these never visually update — the buttons never actually appear disabled/dimmed while a picker is open, even though the *functional* double-open guard (the `if (isPickingImage.current) return` at the top of each handler) still works correctly. Cosmetic only; no user-facing wedge. | Fixing the visual feedback means converting `isPickingImage` from a ref to state in two files, which changes render behavior (extra re-renders while a native picker sheet is open) for a purely cosmetic gap nobody has reported. Low value given the audit's actual asks (wedge/stability/perf on the *wizard*); flagging so it's a deliberate skip, not an oversight. |
| 7 | S3 | `onboarding.jsx` weight input (`StepWeight`, `canGoNext` case 5) | `weight.replace(/[^0-9.]/g, "")` allows multiple dots (e.g. `"1.2.3"`); `parseFloat("1.2.3")` silently parses as `1.2`. Never blocks Next (a non-empty, `>0` parse always exists once any digit is typed) and never produces `NaN`/stuck state — purely a "what actually gets saved" data-quality nit, not a gating bug. | Out of scope for "surgical" — fixing input sanitization to reject a second `.` is a UX-visible behavior change to the text field, and the task's rules ask for behavior-preserving fixes only. Flagging in case product wants stricter input filtering later. |

### Explicitly checked, no issue found

- **Age gate** (`computeAgeYears`, `canGoNext` case 3): `ageYears`/`ageMonths`
  are sanitized to digits-only on every keystroke (`text.replace(/[^0-9]/g, "")`),
  so `parseInt` can never produce `NaN` for a non-empty value — no stuck state.
- **Weight gate NaN handling**: `parseFloat(formData.weight) > 0` is
  recomputed fresh on every render from current `formData.weight`; an empty
  or `.`-only value correctly evaluates to `false` (not stuck — the field is
  simply invalid until a valid digit is typed, same as before any digit was
  typed).
  - the case above (finding #7) is the one wrinkle: it under-validates
    rather than over-validates, so it can never cause a wedge, only bad data.
- **Handle-check race** ("does the in-flight check outlive the current
  input?"): the effect's `debouncedHandle` only updates once input has
  settled for 400ms, and `handleApiConfirmedFor` is compared against
  `normalizeHandle(formData.handle)` on every render — an in-flight or stale
  response for an old value can only ever set `handleApiConfirmedFor` to
  *that old value*, which no longer equals the current handle, so it cannot
  incorrectly unlock Next. Confirmed by the existing "editing the handle
  again after a confirmed check re-locks Next" test, still green.
- **`handleComplete` (Create Profile submit)**: already fully wrapped in
  try/catch/finally; every awaited step (upload, `POST /api/pets`, `PATCH
  /api/user-profile`, `POST /api/posts`, `postOnboardingWelcome`) either
  throws into the outer catch (shows an alert, resets `isSubmitting`) or is
  itself already hardened to never throw (`postOnboardingWelcome` returns
  `null` on any failure — see its own doc comment).
- **Mount-time `AsyncStorage`/`JSON.parse` in `onboarding.jsx`**
  (`onboarding_pet_photo`, `onboarding_progress`): already wrapped in
  try/catch, and the parsed value is type-checked (`typeof === "object" &&
  !Array.isArray`) before being spread into `formData`, so a malformed stored
  value can't throw on destructure. This was clearly already hardened in an
  earlier pass — no change needed.
- **`onboarding-photo-preview.jsx`**: every async handler
  (`handleUsePhoto`, `handleRetake`, `handleChooseAnother`) is already fully
  try/catch wrapped with a user-facing alert on failure and `isPickingImage`
  reset in the catch. No gap found.
- **`KeyboardAwareScrollView.jsx`**: every native `measureInWindow` callback
  is already behind a type guard + try/catch (per its own doc comment,
  hardened after an on-device crash). No gap found.
- **Re-render churn (Part 3)**: `renderStep()`'s `switch` mounts exactly one
  step component at a time — sibling steps are unmounted, not hidden, so
  there is no "typing in one field re-renders a sibling step" issue to fix;
  step components are already module-level (not redefined per render).
  `BreedPicker`'s search state (`query`) is local to that component, so
  typing in it does not re-render `OnboardingScreen` — only committing a
  selection does. `filterBreeds()` runs over ~230 breeds per keystroke inside
  `BreedPicker`; at that size this is sub-millisecond and not worth
  memoizing further.

## Tests added (`src/app/onboarding.test.jsx`)

- `OnboardingScreen — gender step (Step 5 QA concern) cannot wedge Next` (4
  tests): Next stays disabled with no selection, tapping Female/Male each
  unlock it with the exact expected copy on the next step, and toggling
  between the two never leaves it stuck.
- `OnboardingScreen — full 9-step walk with valid input never wedges` (1
  test): drives every required step with valid input end-to-end (including
  the gender step) and confirms the review screen (step 9 of 9) is reached —
  the general form of "a valid selection at every required step makes
  canGoNext() true."
- `OnboardingScreen — handle-availability check times out and fails OPEN` (1
  test, fake timers): a `fetch` that never settles on its own still unlocks
  Next once the new bounded timeout trips — proves finding #1's fix.

`npm test` in `anything/apps/mobile`: **283 suites / 2174 tests passing**
(24 in `onboarding.test.jsx`, up from 20; `onboarding.es.test.jsx` unchanged
and green).
