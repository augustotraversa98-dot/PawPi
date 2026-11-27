// Onboarding: the birth date first, an estimated age when it isn't known, and a separate optional adoption date.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
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
// Pressing the field "picks" the date set for it.
const mockPicked = { "birthday-field": "2020-03-01", "adoption-date-field": "2021-05-04" };
jest.mock("@/components/DateField", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ testID, value, onChange, maximumDate }) => (
      <Text
        testID={testID}
        maximumDate={maximumDate}
        onPress={() => onChange(mockPicked[testID])}
      >
        {value || "empty"}
      </Text>
    ),
  };
});
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/utils/onboardingGuard", () => ({
  APP_HOME: "/(tabs)",
  useLeaveOnboardingIfHasPets: jest.fn(),
  noteWizardForExistingOwner: jest.fn(),
  accountAlreadyHasPets: () => Promise.resolve(false),
}));
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

import OnboardingScreen, { ageFieldsForNewPet, normalizeAgeAnswers } from "./onboarding";

const originalFetch = global.fetch;

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn((url, init) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        url === "/api/pets" && init?.method === "POST"
          ? { pet: { id: 1, name: "Buddy" } }
          : { available: true },
    }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

const nextIsDisabled = (screen) =>
  screen.getByTestId("onboarding-next").props.accessibilityState?.disabled;

async function goToAgeStep() {
  const screen = render(<OnboardingScreen />);
  fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
  fireEvent.press(screen.getByTestId("onboarding-next"));
  fireEvent.changeText(screen.getByTestId("onboarding-handle-input"), "buddy_the_dog");
  await waitFor(() => expect(nextIsDisabled(screen)).toBe(false));
  fireEvent.press(screen.getByTestId("onboarding-next"));
  fireEvent.press(screen.getByTestId("breed-option-mixed"));
  fireEvent.press(screen.getByTestId("onboarding-next"));
  expect(screen.getByText("How old is Buddy?")).toBeTruthy();
  return screen;
}

function finishFromGender(screen, { adoption = false } = {}) {
  fireEvent.press(screen.getByTestId("onboarding-gender-female"));
  fireEvent.press(screen.getByTestId("onboarding-next"));
  fireEvent.changeText(screen.getByTestId("onboarding-weight"), "12");
  fireEvent.press(screen.getByTestId("onboarding-next"));
  expect(screen.getByText("When did Buddy join your family?")).toBeTruthy();
  if (adoption) {
    fireEvent.press(screen.getByTestId("adoption-date-field"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
  } else {
    fireEvent.press(screen.getByText("Skip"));
  }
  fireEvent.press(screen.getByText("Skip")); // notes
  expect(screen.getByText("Buddy's profile")).toBeTruthy();
}

async function createdPet(screen) {
  fireEvent.press(screen.getByText("Create Buddy's profile"));
  const posts = () =>
    global.fetch.mock.calls.filter(([url, init]) => url === "/api/pets" && init?.method === "POST");
  await waitFor(() => expect(posts()).toHaveLength(1));
  return JSON.parse(posts()[0][1].body);
}

describe("onboarding age step", () => {
  test("asks for the birth date first, not in the future; the estimate stays hidden", async () => {
    const screen = await goToAgeStep();
    const field = screen.getByTestId("birthday-field");
    expect(field.props.maximumDate.getTime()).toBeLessThanOrEqual(Date.now());
    expect(screen.queryByTestId("estimated-age-years")).toBeNull();
    expect(nextIsDisabled(screen)).toBe(true);
    expect(screen.getByText("Pick a birth date or enter an estimated age to continue")).toBeTruthy();
  });

  test("a birth date is enough; the pet is created with it and no age numbers", async () => {
    const screen = await goToAgeStep();
    fireEvent.press(screen.getByTestId("birthday-field"));
    expect(nextIsDisabled(screen)).toBe(false);
    fireEvent.press(screen.getByTestId("onboarding-next"));
    finishFromGender(screen);
    expect(screen.getByText(/1 March 2020/)).toBeTruthy();
    expect(await createdPet(screen)).toMatchObject({
      birthday: "2020-03-01",
      age_years: null,
      age_months: null,
      adoption_date: null,
    });
  });

  test("without the exact date, an estimate completes the step and is shown as approximate", async () => {
    const screen = await goToAgeStep();
    expect(screen.getByText("Birth date")).toBeTruthy();
    fireEvent.press(screen.getByTestId("birthday-unsure"));
    expect(screen.queryByTestId("birthday-field")).toBeNull();
    // No heading is left over the field that went away.
    expect(screen.queryByText("Birth date")).toBeNull();
    expect(nextIsDisabled(screen)).toBe(true);
    fireEvent.changeText(screen.getByTestId("estimated-age-years"), "2");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    finishFromGender(screen, { adoption: true });
    expect(screen.getByText("~2 years")).toBeTruthy();
    expect(await createdPet(screen)).toMatchObject({
      birthday: null,
      age_years: 2,
      age_months: null,
      adoption_date: "2021-05-04",
    });
  });

  test("switching between the date and the estimate clears the other", async () => {
    const screen = await goToAgeStep();
    fireEvent.press(screen.getByTestId("birthday-field"));
    fireEvent.press(screen.getByTestId("birthday-unsure"));
    expect(nextIsDisabled(screen)).toBe(true); // the date is gone
    fireEvent.changeText(screen.getByTestId("estimated-age-months"), "5");
    fireEvent.press(screen.getByTestId("birthday-unsure"));
    expect(screen.getByTestId("birthday-field").props.children).toBe("empty");
    expect(nextIsDisabled(screen)).toBe(true); // the estimate is gone
  });

  test("an adoption date can be removed again", async () => {
    const screen = await goToAgeStep();
    fireEvent.press(screen.getByTestId("birthday-field"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.changeText(screen.getByTestId("onboarding-weight"), "12");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("adoption-date-field"));
    fireEvent.press(screen.getByTestId("adoption-date-remove"));
    expect(screen.getByTestId("adoption-date-field").props.children).toBe("empty");
  });
});

describe("age answers", () => {
  test("saved progress holding both keeps the birth date", () => {
    expect(normalizeAgeAnswers({ birthday: "2020-01-01", ageYears: "6", ageMonths: "" })).toEqual({
      birthday: "2020-01-01",
      birthdayUnknown: false,
      ageYears: "",
      ageMonths: "",
    });
  });

  test("saved progress holding only an estimate opens on it", () => {
    expect(normalizeAgeAnswers({ birthday: "", ageYears: "", ageMonths: "4" }).birthdayUnknown).toBe(true);
  });

  test("a months-only estimate is sent as zero years", () => {
    expect(ageFieldsForNewPet({ birthday: "", ageYears: "", ageMonths: "6" })).toEqual({
      birthday: null,
      age_years: 0,
      age_months: 6,
    });
  });
});
