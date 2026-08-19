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
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
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
