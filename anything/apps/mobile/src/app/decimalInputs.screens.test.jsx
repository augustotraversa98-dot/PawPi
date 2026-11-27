// The screens where a comma used to change a number: onboarding and Dog Profile stripped it ("12,5" → 125), and the
// whole-number fields of events, training, nutrition and the price-list review cut or dropped the value.
import React from "react";
import { Alert, TextInput } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let mockPet;
const mockCreateEvent = jest.fn();
const mockEnroll = jest.fn();
const mockSavePlan = jest.fn();
jest.mock("react-i18next", () => ({
  useTranslation: () =>
    require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "es").useTranslation(),
  getI18n: () => ({ language: global.__lang || "es" }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
// Pressing a date or time field "picks" a value.
jest.mock("@/components/DateField", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ testID, value, onChange }) => (
      <Text testID={testID} onPress={() => onChange("2030-03-01")}>{value || "empty"}</Text>
    ),
  };
});
jest.mock("@/components/TimeField", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ testID, value, onChange }) => (
      <Text testID={testID} onPress={() => onChange("10:00")}>{value || "empty"}</Text>
    ),
  };
});
jest.mock("@/components/Map/LocationField", () => () => null);
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-picker", () => ({ MediaTypeOptions: { Images: "Images" } }));
jest.mock("@/utils/onboardingGuard", () => ({
  APP_HOME: "/(tabs)",
  useLeaveOnboardingIfHasPets: jest.fn(),
  noteWizardForExistingOwner: jest.fn(),
  accountAlreadyHasPets: () => Promise.resolve(false),
}));
jest.mock("@/utils/auth/useUser", () => ({ __esModule: true, default: () => ({ data: null }) }));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), refetchQueries: jest.fn(), resetQueries: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockPet, isLoading: false }),
}));
jest.mock("@/hooks/useEvents", () => ({
  useCreateEvent: () => ({ mutateAsync: mockCreateEvent, isPending: false }),
}));
jest.mock("@/hooks/useNutrition", () => ({
  useNutritionPlans: () => ({ data: [] }),
  useSaveNutritionPlan: () => ({ mutateAsync: mockSavePlan, isPending: false }),
  useRecallMatches: () => ({ data: [] }),
  useDismissRecall: () => ({ mutate: jest.fn() }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: () => ({
    data: [{ id: 3, name: "Escuela", slug: "escuela" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTrainingPrograms: () => ({ data: [] }),
  useTrainingClasses: () => ({ data: [] }),
  useEnrollTrainingProgram: () => ({ mutateAsync: mockEnroll, isPending: false }),
  useJoinTrainingClass: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/ProviderListControls", () => ({
  __esModule: true,
  default: () => null,
  useProviderListFilter: (list) => ({ query: "", setQuery: jest.fn(), sort: "", setSort: jest.fn(), filtered: list }),
}));

import OnboardingScreen from "./onboarding";
import ProfileEditScreen from "./(tabs)/more/profile-edit";
import EventCreateScreen from "./event-create";
import NutritionScreen from "./nutrition";
import TrainingServiceScreen from "./service/training";
import es from "@/i18n/locales/es.json";
import en from "@/i18n/locales/en.json";
import { durationToMin, hasInvalidDuration } from "@/utils/enrichmentDraft";

const originalFetch = global.fetch;
let alertSpy;
beforeEach(async () => {
  jest.clearAllMocks();
  global.__lang = "es";
  mockPet = { id: 1, name: "Mango" };
  await AsyncStorage.clear();
  mockCreateEvent.mockResolvedValue({});
  mockSavePlan.mockResolvedValue({});
  global.fetch = jest.fn((url, init) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        init?.method === "POST" || init?.method === "PATCH"
          ? { pet: { id: 1, name: "Buddy" } }
          : { available: true },
    }),
  );
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  alertSpy.mockRestore();
});
afterAll(() => {
  delete global.__lang;
});

const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (m, name) => String(vars[name]));
const badWeight = (catalog, max = 160, unit = "kg") => fill(catalog.common.invalidWeight, { max, unit });
const alerted = () => alertSpy.mock.calls.flat().join(" | ");
const sent = (method) =>
  global.fetch.mock.calls.filter(([, init]) => init?.method === method).map(([, init]) => JSON.parse(init.body));
function typeInto(getInput, text) {
  fireEvent.changeText(getInput(), "");
  for (const char of text) {
    const shown = getInput().props.value ?? "";
    fireEvent.changeText(getInput(), `${shown}${char}`);
  }
}

describe("onboarding weight", () => {
  const nextIsDisabled = (screen) =>
    screen.getByTestId("onboarding-next").props.accessibilityState?.disabled;

  async function goToWeightStep() {
    const screen = render(<OnboardingScreen />);
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Buddy");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.changeText(screen.getByTestId("onboarding-handle-input"), "buddy_the_dog");
    await waitFor(() => expect(nextIsDisabled(screen)).toBe(false));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("breed-option-mixed"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("birthday-field"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-gender-female"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    return screen;
  }

  test("12,5 stays 12,5 on screen and the dog is created with 12.5", async () => {
    const screen = await goToWeightStep();
    typeInto(() => screen.getByTestId("onboarding-weight"), "12,5");
    expect(screen.getByTestId("onboarding-weight").props.value).toBe("12,5");
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByText(es.onboarding.skip));
    fireEvent.press(screen.getByText(es.onboarding.skip));
    expect(screen.getByText("12,5 kg")).toBeTruthy();
    fireEvent.press(screen.getByText(fill(es.onboarding.createProfile, { name: "Buddy" })));
    await waitFor(() => expect(sent("POST")).toHaveLength(1));
    expect(sent("POST")[0].weight).toBe(12.5);
  });

  test.each(["1.234", "12.500", "12,", "500"])("%s cannot continue and says why", async (typed) => {
    const screen = await goToWeightStep();
    typeInto(() => screen.getByTestId("onboarding-weight"), typed);
    expect(nextIsDisabled(screen)).toBe(true);
    expect(screen.getByText(badWeight(es))).toBeTruthy();
  });
});

describe("Dog Profile edit weight", () => {
  const weightInput = (screen) =>
    screen.UNSAFE_getAllByType(TextInput).find((i) => i.props.keyboardType === "decimal-pad");
  const save = async (screen, catalog = es) => {
    fireEvent.press(screen.getByText(catalog.profileEdit.saveChanges));
    await act(async () => {});
  };

  test.each([["es", "12,5", es], ["en", "12.5", en]])(
    "a stored 12.50 is shown in %s as %s and saves unchanged",
    async (lang, shown, catalog) => {
      global.__lang = lang;
      mockPet = { id: 1, name: "Mango", weight: "12.50", weight_unit: "kg" };
      const screen = render(<ProfileEditScreen />);
      expect(weightInput(screen).props.value).toBe(shown);
      await save(screen, catalog);
      expect(sent("PATCH")[0].weight).toBe(12.5);
    },
  );

  test("typing 14,2 saves 14.2, not 142", async () => {
    mockPet = { id: 1, name: "Mango", weight: "12.50", weight_unit: "kg" };
    const screen = render(<ProfileEditScreen />);
    typeInto(() => weightInput(screen), "14,2");
    await save(screen);
    expect(sent("PATCH")[0].weight).toBe(14.2);
  });

  test("an implausible weight is refused and nothing is sent", async () => {
    mockPet = { id: 1, name: "Mango", weight: "12.50", weight_unit: "kg" };
    const screen = render(<ProfileEditScreen />);
    typeInto(() => weightInput(screen), "1.250");
    await save(screen);
    expect(sent("PATCH")).toHaveLength(0);
    expect(alerted()).toContain(badWeight(es));
  });

  test("an estimated age of 1,5 is refused, not saved as 15", async () => {
    mockPet = { id: 1, name: "Mango" };
    const screen = render(<ProfileEditScreen />);
    typeInto(() => screen.getByTestId("estimated-age-years"), "1,5");
    await save(screen);
    expect(sent("PATCH")).toHaveLength(0);
    expect(alerted()).toContain(es.common.wholeNumber);
  });
});

describe("whole-number fields", () => {
  test.each(["1,5", "1.000", "diez"])("event capacity %s is refused", async (typed) => {
    const screen = render(<EventCreateScreen />);
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], "Paseo");
    fireEvent.press(screen.getByTestId("event-date"));
    fireEvent.press(screen.getByTestId("event-time"));
    fireEvent.changeText(screen.getByTestId("event-capacity"), typed);
    fireEvent.press(screen.getByTestId("event-submit"));
    await act(async () => {});
    expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(alerted()).toContain(es.common.wholeNumber);
  });

  test.each(["1,5", "1.200"])("nutrition calories %s are refused, not dropped or cut", async (typed) => {
    const screen = render(<NutritionScreen />);
    fireEvent.changeText(screen.getByTestId("nutrition-brand"), "Acme");
    fireEvent.changeText(screen.getByTestId("nutrition-calories"), typed);
    fireEvent.press(screen.getByTestId("nutrition-submit"));
    await act(async () => {});
    expect(mockSavePlan).not.toHaveBeenCalled();
    expect(alerted()).toContain(es.common.wholeNumber);
  });

  test.each(["1,5", "1.000", "0"])("training program sessions %s are refused, not saved as 1", async (typed) => {
    const screen = render(<TrainingServiceScreen />);
    fireEvent.press(screen.getByText(es.training.bookTraining));
    fireEvent.press(screen.getByText(es.training.programLabel));
    fireEvent.changeText(screen.getByDisplayValue("6"), typed);
    fireEvent.press(screen.getByText(es.training.confirmBooking));
    await act(async () => {});
    expect(mockEnroll).not.toHaveBeenCalled();
    expect(alerted()).toContain(es.common.wholeNumberPositive);
  });

  test("an imported service duration with a decimal or in hours is not turned into 1 minute", () => {
    for (const text of ["1,5", "1.5 h", "1h", "2 horas"]) {
      expect(durationToMin(text)).toBeNull();
      expect(hasInvalidDuration({ name: "Baño", duration: text, selected: true })).toBe(true);
    }
    expect(durationToMin("45 min")).toBe(45);
    expect(hasInvalidDuration({ name: "Baño", duration: "45 min", selected: true })).toBe(false);
    expect(hasInvalidDuration({ name: "Baño", duration: "", selected: true })).toBe(false);
    expect(hasInvalidDuration({ name: "Baño", duration: "1,5", selected: false })).toBe(false);
  });
});
