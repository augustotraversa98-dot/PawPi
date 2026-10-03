// Onboarding required-field gating (this ticket): the dog profile fields that the
// "Set up your dog's profile" checklist (utils/gettingStarted.isProfileComplete)
// counts — name, @handle, breed, age, a real gender, weight — are now REQUIRED to
// finish onboarding, aligned so a freshly-onboarded dog completes that item.
//
// Two layers:
//   1. Pure gating helpers (firstIncompleteRequiredStep / computeAgeYears) — the
//      logic behind canGoNext() and the review-step "Create profile" guard.
//   2. The screen itself: Next stays blocked + inline validation copy shows until
//      the step's required field is valid.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { act } from "react-test-renderer";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/DateField", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/utils/auth/useUser", () => ({
  __esModule: true,
  default: () => ({ data: null }),
}));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    refetchQueries: jest.fn(),
    resetQueries: jest.fn(),
  }),
}));

import OnboardingScreen, {
  firstIncompleteRequiredStep,
  computeAgeYears,
} from "./onboarding";

// A blank onboarding form (the screen's initial formData shape).
const blankForm = () => ({
  name: "",
  handle: "",
  breed: "",
  ageYears: "",
  ageMonths: "",
  gender: "",
  weight: "",
  birthday: "",
});

describe("firstIncompleteRequiredStep", () => {
  test("walks the required fields in order and returns the first gap", () => {
    const f = blankForm();
    expect(firstIncompleteRequiredStep(f)).toBe(0); // name

    f.name = "Buddy";
    expect(firstIncompleteRequiredStep(f)).toBe(1); // @handle (empty → invalid)

    f.handle = "buddy_dog"; // valid + not in TAKEN_HANDLES
    expect(firstIncompleteRequiredStep(f)).toBe(2); // breed

    f.breed = "Mixed Breed";
    expect(firstIncompleteRequiredStep(f)).toBe(3); // age

    f.ageYears = "3";
    expect(firstIncompleteRequiredStep(f)).toBe(4); // gender

    f.gender = "female";
    expect(firstIncompleteRequiredStep(f)).toBe(5); // weight

    f.weight = "12";
    expect(firstIncompleteRequiredStep(f)).toBeNull(); // complete
  });

  test('a real @handle is required — a "taken" one does not satisfy it', () => {
    const f = { ...blankForm(), name: "Buddy", handle: "max" }; // max ∈ TAKEN_HANDLES
    expect(firstIncompleteRequiredStep(f)).toBe(1);
  });

  test("age accepts approximate months-only (rescue puppy, no exact birthday)", () => {
    const f = {
      ...blankForm(),
      name: "Rex",
      handle: "rex_rescue",
      breed: "Mixed Breed",
      ageMonths: "6", // months only, no years
    };
    expect(firstIncompleteRequiredStep(f)).toBe(4); // age satisfied → next gap is gender
  });

  test("age also accepts a birthday alone (known birthday, no years/months)", () => {
    const f = {
      ...blankForm(),
      name: "Rex",
      handle: "rex_rescue",
      breed: "Mixed Breed",
      birthday: "2020-01-01",
    };
    expect(firstIncompleteRequiredStep(f)).toBe(4);
  });

  test('gender "unknown" is not a real value — it is rejected', () => {
    const f = {
      ...blankForm(),
      name: "Rex",
      handle: "rex_rescue",
      breed: "Mixed Breed",
      ageYears: "4",
      gender: "unknown",
    };
    expect(firstIncompleteRequiredStep(f)).toBe(4);
  });

  test("a zero / non-numeric weight does not satisfy the weight step", () => {
    const base = {
      ...blankForm(),
      name: "Rex",
      handle: "rex_rescue",
      breed: "Mixed Breed",
      ageYears: "4",
      gender: "male",
    };
    expect(firstIncompleteRequiredStep({ ...base, weight: "0" })).toBe(5);
    expect(firstIncompleteRequiredStep({ ...base, weight: "" })).toBe(5);
    expect(firstIncompleteRequiredStep({ ...base, weight: "10.5" })).toBeNull();
  });
});

describe("computeAgeYears", () => {
  test("explicit years parse through", () => {
    expect(computeAgeYears({ ageYears: "3", ageMonths: "" })).toBe(3);
  });

  test("months-only puppy resolves to 0 (so age_years != null → checklist done)", () => {
    expect(computeAgeYears({ ageYears: "", ageMonths: "6" })).toBe(0);
  });

  test("no years and no months stays null (birthday-only path)", () => {
    expect(computeAgeYears({ ageYears: "", ageMonths: "" })).toBeNull();
  });
});

describe("OnboardingScreen — required-field gating (step 0: name)", () => {
  test("Next is blocked with inline validation until the name is entered", () => {
    const screen = render(<OnboardingScreen />);

    // The name step shows the "what's missing" hint and a disabled Next.
    expect(
      screen.getByText("Add your dog's name to continue"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    // Pressing the disabled Next does not advance past the name step.
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("What's your dog's name?")).toBeTruthy();
  });

  test("entering a name clears the validation and enables Next → advances to the handle step", () => {
    const screen = render(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");

    expect(screen.queryByText("Add your dog's name to continue")).toBeNull();
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId("onboarding-next"));
    // Step 1 (handle) is now on screen.
    expect(screen.getByText("Choose Buddy's pet handle")).toBeTruthy();
  });
});

// BUG 2: the header back arrow was disabled on step 0 (the name step), leaving
// the user no way back to the photo screen. It's now always enabled and returns
// to /onboarding-photo from step 0.
describe("OnboardingScreen — step-0 back arrow returns to the photo screen", () => {
  beforeEach(() => {
    mockRouter.back.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.canGoBack.mockClear().mockReturnValue(true);
  });

  test("the back arrow is enabled on the name step and pops back to the photo screen", () => {
    const screen = render(<OnboardingScreen />);
    // Step 0 (name) is showing.
    expect(screen.getByText("What's your dog's name?")).toBeTruthy();

    const back = screen.getByTestId("onboarding-back");
    expect(back.props.accessibilityState?.disabled).toBeFalsy();

    fireEvent.press(back);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("falls back to an explicit navigation to /onboarding-photo with no history", () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const screen = render(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-back"));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/onboarding-photo");
  });
});

// Ticket: validate pet-handle uniqueness at step 2 (where it's chosen), not only
// at the final review step. A handle can be free in the client's mock
// TAKEN_HANDLES list (checkHandleUniqueness) yet already exist on a real pet, so
// step 2 also debounces a call to GET /api/pets/handle-availability — the same
// uniqueness source POST /api/pets already enforces at creation.
describe("OnboardingScreen — live handle-availability check (step 2)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function goToHandleStep() {
    const screen = render(<OnboardingScreen />);
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    return screen;
  }

  test("Next stays blocked and shows the checking hint while the live check is in flight", async () => {
    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const screen = goToHandleStep();

    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "brandnewhandle",
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toContain(
      "/api/pets/handle-availability?handle=brandnewhandle",
    );
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-handle-checking")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    // Resolve the in-flight request so the test doesn't leak a pending timer/promise.
    resolveFetch({ ok: true, json: async () => ({ available: true }) });
    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );
  });

  test("a handle the backend reports as taken blocks Next with an inline error", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: false }) });
    const screen = goToHandleStep();

    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "reallypopular",
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-handle-error").props.children).toBe(
        "This handle is already taken",
      ),
    );
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    // The disabled Next never advances past the handle step.
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Choose Buddy's pet handle")).toBeTruthy();
  });

  test("a handle the backend confirms as free unlocks Next and advances to the breed step", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    const screen = goToHandleStep();

    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "rex_rescue",
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );

    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("What breed is Buddy?")).toBeTruthy();
  });

  test("editing the handle again after a confirmed check re-locks Next until it's re-checked", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    const screen = goToHandleStep();

    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "rex_rescue",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );

    // A further edit must re-lock Next immediately — the just-confirmed
    // availability was for the OLD text, not this one.
    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "rex_rescue2",
    );
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);
  });

  test("a network error while checking fails OPEN (backstop is the final POST /api/pets check)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const screen = goToHandleStep();

    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "rex_rescue",
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );
  });
});

// Audit 2026-09-29 (docs/ONBOARDING_CODE_AUDIT_2026-09-29.md): QA sweep D reported
// onboarding "freezing" at step 5 (gender) with Next staying disabled after a
// tap. Traced in code: StepGender's onPress writes formData.gender from the
// SAME GENDER_VALUES list canGoNext()/firstIncompleteRequiredStep() check
// against, so a valid tap can never leave the gate disabled. These tests drive
// the real rendered gender step (not just the pure helper) to prove it end to
// end, and that the two-card selection can be changed freely without ever
// getting stuck.
describe("OnboardingScreen — gender step (Step 5 QA concern) cannot wedge Next", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function goToGenderStep() {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    const screen = render(<OnboardingScreen />);
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "buddy_the_dog",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("breed-option-mixed"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.changeText(screen.getByTestId("onboarding-age-years"), "3");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("What's Buddy's gender?")).toBeTruthy();
    return screen;
  }

  test("Next is disabled until a gender card is tapped", async () => {
    const screen = await goToGenderStep();
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);
    expect(screen.getByText("Pick male or female to continue")).toBeTruthy();
  });

  test('tapping "Female" writes the exact value the gate checks for and unlocks Next', async () => {
    const screen = await goToGenderStep();
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("How much does Buddy weigh?")).toBeTruthy();
  });

  test('tapping "Male" writes the exact value the gate checks for and unlocks Next', async () => {
    const screen = await goToGenderStep();
    fireEvent.press(screen.getByTestId("onboarding-gender-male"));
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("How much does Buddy weigh?")).toBeTruthy();
  });

  test("switching the selection back and forth never leaves Next stuck disabled", async () => {
    const screen = await goToGenderStep();
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    fireEvent.press(screen.getByTestId("onboarding-gender-male"));
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
  });
});

// Drives every required step end to end with valid input, proving no step's
// Next gate wedges — the general claim behind the gender-step-specific tests
// above (Part 1 of the audit: "a valid selection at every required step makes
// canGoNext() true").
describe("OnboardingScreen — full 9-step walk with valid input never wedges", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("valid input at every required step reaches the review screen (9 of 9)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
    const screen = render(<OnboardingScreen />);

    // Step 1 of 9: name.
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 2 of 9: @handle.
    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "buddy_the_dog",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 3 of 9: breed.
    fireEvent.press(screen.getByTestId("breed-option-mixed"));
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 4 of 9: age.
    fireEvent.changeText(screen.getByTestId("onboarding-age-years"), "3");
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 5 of 9: gender — the QA-reported freeze point.
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 6 of 9: weight.
    fireEvent.changeText(screen.getByTestId("onboarding-weight"), "12");
    fireEvent.press(screen.getByTestId("onboarding-next"));

    // Step 7 of 9: birthday/gotcha day (optional) — skip.
    expect(screen.getByText("When are Buddy's special days?")).toBeTruthy();
    fireEvent.press(screen.getByText("Skip"));

    // Step 8 of 9: notes (optional) — skip.
    expect(
      screen.getByText("Anything important we should remember about Buddy?"),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Skip"));

    // Step 9 of 9: review — reached with no step ever wedging Next.
    expect(screen.getByText("Buddy's profile")).toBeTruthy();
  });
});

// PART 1 of the audit: the live handle-availability check must never hold the
// gate open indefinitely. Before this fix, a request that never settles (a
// dropped connection, a backgrounded app, a captive portal) left
// handleApiChecking stuck true forever, since neither .then nor .catch would
// ever run — an "async gate that never resolves". The bounded timeout aborts
// the stale request and routes it through the same fail-OPEN path as a
// network error.
describe("OnboardingScreen — handle-availability check times out and fails OPEN", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  function goToHandleStep(screen) {
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
    fireEvent.press(screen.getByTestId("onboarding-next"));
  }

  test("a request that never settles unlocks Next once the bounded timeout trips, instead of wedging forever", async () => {
    jest.useFakeTimers();
    // Never resolves or rejects on its own — only reacts to the AbortController
    // the component's timeout fires, exactly like a hung connection.
    global.fetch = jest.fn(
      (url, opts) =>
        new Promise((_, reject) => {
          opts?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
          );
        }),
    );

    const screen = render(<OnboardingScreen />);
    goToHandleStep(screen);
    fireEvent.changeText(
      screen.getByTestId("onboarding-handle-input"),
      "brandnewhandle",
    );

    // Let the 400ms debounce settle so the request actually fires.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    // Advance past the bounded timeout — this must NOT still be disabled after
    // any finite amount of time, which is the actual "can it wedge?" claim.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(8000);
    });

    expect(
      screen.getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
  });
});

describe("defaultWeightUnit", () => {
  const { defaultWeightUnit } = require("./onboarding");
  const Localization = require("expo-localization");

  test("metric locales default to kg, US to lbs, failure to kg", () => {
    const spy = jest.spyOn(Localization, "getLocales");
    spy.mockReturnValue([{ measurementSystem: "metric" }]);
    expect(defaultWeightUnit()).toBe("kg");
    spy.mockReturnValue([{ measurementSystem: "us" }]);
    expect(defaultWeightUnit()).toBe("lbs");
    spy.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(defaultWeightUnit()).toBe("kg");
    spy.mockRestore();
  });
});
