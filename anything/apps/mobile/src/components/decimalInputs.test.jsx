// Decimals are typed with a comma in Argentina. Every health/pet field must read "12,5" as 12.5 (never 125 or 12),
// and a whole-number field must refuse "1,5" with a message instead of saving 1 or 15.
import React, { useState } from "react";
import { Alert, TextInput } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockPet;
const mockLogWalk = jest.fn();
const mockCreatePet = jest.fn();
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () =>
    require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "es").useTranslation(),
  getI18n: () => ({ language: global.__lang || "es" }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  usePetProfile: () => ({ data: [] }),
  useCurrentPet: () => ({ data: mockPet, setCurrentPet: jest.fn() }),
  useCreatePet: () => ({ mutateAsync: mockCreatePet }),
}));
jest.mock("@/hooks/useHealthTracking", () => ({
  useLogWalk: () => ({ mutateAsync: mockLogWalk, isPending: false }),
}));
jest.mock("@/utils/useUpload", () => () => [jest.fn(), { loading: false }]);
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/BreedPicker", () => () => null);
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/KeyboardSafeSheet", () => {
  const { View } = require("react-native");
  return ({ visible, header, footer, children }) =>
    visible ? <View>{header}{children}{footer}</View> : null;
});
jest.mock("@/telemetry/track", () => ({ trackFeature: jest.fn() }));
jest.mock("@/telemetry/useFormTelemetry", () => ({
  useFormTelemetry: () => ({ complete: jest.fn(), error: jest.fn() }),
}));

import { AddDogModal } from "./Pets/AddDogModal";
import CaregiverLogWalkModal from "./Pets/CaregiverLogWalkModal";
import BirthdayOrAgeField from "./Pets/BirthdayOrAgeField";
import WeightModal from "./Health/Weight/WeightModal";
import WalkActivityModal from "./Health/WalkActivity/WalkActivityModal";
import DurationPaceSelector from "./Health/Reminders/DurationPaceSelector";
import EditMedicalProfileModal from "./Health/VetRecord/EditMedicalProfileModal";
import es from "@/i18n/locales/es.json";
import en from "@/i18n/locales/en.json";

const originalFetch = global.fetch;
let alertSpy;
beforeEach(() => {
  jest.clearAllMocks();
  global.__lang = "es";
  mockPet = { id: 1, name: "Mango", weight_unit: "kg" };
  mockCreatePet.mockResolvedValue({ pet: { id: 2 } });
  mockLogWalk.mockResolvedValue({});
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ log: { id: 1 }, logs: [] }) });
  global.alert = jest.fn();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  alertSpy.mockRestore();
});
afterAll(() => {
  delete global.__lang;
});

const withClient = (ui) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

// Types one character at a time, the way a keyboard does: each keystroke appends to what the field SHOWS.
function typeInto(getInput, text) {
  fireEvent.changeText(getInput(), "");
  for (const char of text) {
    const shown = getInput().props.value ?? "";
    fireEvent.changeText(getInput(), `${shown}${char}`);
  }
}
const inputs = (u) => u.UNSAFE_getAllByType(TextInput);
const posted = () => global.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
const alerted = () => [...alertSpy.mock.calls, ...global.alert.mock.calls].flat().join(" | ");
const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (m, name) => String(vars[name]));
const badWeight = (catalog, max = 160, unit = "kg") => fill(catalog.common.invalidWeight, { max, unit });

describe("Add a dog: weight", () => {
  const addDog = async (weight) => {
    const u = render(<AddDogModal visible onClose={jest.fn()} />);
    fireEvent.changeText(inputs(u)[0], "Rex");
    typeInto(() => u.getByPlaceholderText("0"), weight);
    fireEvent.press(u.getByText(es.common.save));
    await act(async () => {});
    return u;
  };

  test.each([["12,5", 12.5], ["12.5", 12.5], ["7", 7]])("%s is saved as %s", async (typed, saved) => {
    await addDog(typed);
    await waitFor(() => expect(mockCreatePet).toHaveBeenCalled());
    expect(mockCreatePet.mock.calls[0][0].weight).toBe(saved);
  });

  test.each(["1.234", "12,555", "12,", "0", "12 kg", "455"])("%s is refused with a message", async (typed) => {
    await addDog(typed);
    expect(mockCreatePet).not.toHaveBeenCalled();
    expect(alerted()).toContain(badWeight(es));
  });
});

describe("Track weight", () => {
  const save = async (weight) => {
    const u = withClient(<WeightModal visible onClose={jest.fn()} />);
    typeInto(() => u.getByPlaceholderText(es.trackers.weight.modal.weightPlaceholder), weight);
    fireEvent.press(u.getByText(es.trackers.weight.modal.saveEntry));
    await act(async () => {});
    return u;
  };

  test("12,5 is saved as 12.5", async () => {
    await save("12,5");
    expect(JSON.parse(posted()[0][1].body).weight).toBe(12.5);
  });

  test.each(["12.500", "abc", "0", "170"])("%s is refused and nothing is sent", async (typed) => {
    await save(typed);
    expect(posted()).toHaveLength(0);
    expect(alerted()).toContain(badWeight(es));
  });

  test("history shows the viewer's decimal separator", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [{ id: 3, weight: "12.50", weight_unit: "kg", logged_at: "2026-01-02T10:00:00Z" }] }),
    });
    const u = withClient(<WeightModal visible onClose={jest.fn()} />);
    fireEvent.press(u.getByText(es.trackers.weight.modal.history));
    await waitFor(() => expect(u.getByText(/12,5/)).toBeTruthy());
  });
});

describe("Edit medical profile: weight", () => {
  const open = (weight) =>
    withClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: {}, currentWeight: weight ? { weight, weight_unit: "kg" } : null }}
        onClose={jest.fn()}
      />,
    );
  const weightInput = (u) => u.getByPlaceholderText(es.editMedicalProfile.weightPlaceholder);
  const save = async (u) => {
    fireEvent.press(u.getByText(es.editMedicalProfile.saveCta));
    await act(async () => {});
  };

  test("12,5 is sent as the number 12.5", async () => {
    const u = open();
    typeInto(() => weightInput(u), "12,5");
    await save(u);
    expect(JSON.parse(posted()[0][1].body).currentWeight).toBe(12.5);
  });

  test.each([["es", "12,5", es], ["en", "12.5", en]])(
    "a stored 12.50 is prefilled in %s as %s and saves unchanged",
    async (lang, shown, catalog) => {
      global.__lang = lang;
      const u = open("12.50");
      const input = u.getByPlaceholderText(catalog.editMedicalProfile.weightPlaceholder);
      expect(input.props.value).toBe(shown);
      fireEvent.press(u.getByText(catalog.editMedicalProfile.saveCta));
      await act(async () => {});
      expect(JSON.parse(posted()[0][1].body).currentWeight).toBe(12.5);
    },
  );

  test.each(["1.234", "12,5,"])("%s is refused under the field", async (typed) => {
    const u = open();
    typeInto(() => weightInput(u), typed);
    await save(u);
    expect(posted()).toHaveLength(0);
    expect(u.getByText(badWeight(es))).toBeTruthy();
  });
});

describe("Log a walk", () => {
  const open = () => withClient(<WalkActivityModal visible onClose={jest.fn()} initialMode="walkLog" />);
  const duration = (u) => () => inputs(u)[0];
  const distance = (u) => () => inputs(u)[1];
  const save = async (u) => {
    fireEvent.press(u.getAllByText(es.trackers.walk.submit).at(-1));
    await act(async () => {});
  };

  test.each([["2,5", 2.5], ["2.5", 2.5]])("distance typed as %s is saved as %s", async (typed, saved) => {
    jest.useFakeTimers();
    const u = open();
    typeInto(distance(u), typed);
    expect(distance(u)().props.value).toBe(typed);
    await save(u);
    expect(mockLogWalk.mock.calls[0][0].distance).toBe(saved);
    jest.useRealTimers();
  });

  test.each(["1.500", "2,", "abc"])("distance %s is refused", async (typed) => {
    const u = open();
    typeInto(distance(u), typed);
    await save(u);
    expect(mockLogWalk).not.toHaveBeenCalled();
    expect(alerted()).toContain(fill(es.common.invalidDistance, { max: 100 }));
  });

  test("minutes typed as 1,5 are refused, not saved as 1", async () => {
    const u = open();
    typeInto(duration(u), "1,5");
    await save(u);
    expect(mockLogWalk).not.toHaveBeenCalled();
    expect(alerted()).toContain(es.common.invalidMinutes);
  });
});

describe("Caregiver walk log", () => {
  const save = async (minutes) => {
    const u = withClient(<CaregiverLogWalkModal visible petId={5} petName="Rex" onClose={jest.fn()} />);
    fireEvent.changeText(u.getByTestId("caregiver-log-walk-duration"), minutes);
    fireEvent.press(u.getByTestId("caregiver-log-walk-save"));
    await act(async () => {});
  };

  test("1,5 minutes is refused, not saved as 1", async () => {
    await save("1,5");
    expect(posted()).toHaveLength(0);
    expect(alerted()).toContain(es.common.invalidMinutes);
  });

  test("25 is saved", async () => {
    await save("25");
    expect(JSON.parse(posted()[0][1].body).durationMinutes).toBe(25);
  });
});

describe("Walk routine duration", () => {
  function Host({ onValue }) {
    const [value, setValue] = useState(30);
    return (
      <DurationPaceSelector
        durationMinutes={value}
        pace="normal"
        onPaceChange={() => {}}
        onDurationChange={(next) => {
          onValue(next);
          setValue(next);
        }}
      />
    );
  }

  test("1,5 stays on screen with a message and is never turned into 1", () => {
    const seen = jest.fn();
    const u = render(<Host onValue={seen} />);
    fireEvent.changeText(inputs(u)[0], "1,5");
    expect(seen).toHaveBeenLastCalledWith("1,5");
    expect(inputs(u)[0].props.value).toBe("1,5");
    expect(u.getByText(es.common.invalidMinutes)).toBeTruthy();
  });
});

describe("Estimated age", () => {
  function Host({ onValue }) {
    const [years, setYears] = useState("");
    return (
      <BirthdayOrAgeField
        birthdayUnknown
        onToggleUnknown={() => {}}
        birthday=""
        onBirthdayChange={() => {}}
        ageYears={years}
        onAgeYearsChange={(next) => {
          onValue(next);
          setYears(next);
        }}
        ageMonths=""
        onAgeMonthsChange={() => {}}
      />
    );
  }

  test("1,5 years stays as typed with a message, not 15", () => {
    const seen = jest.fn();
    const u = render(<Host onValue={seen} />);
    typeInto(() => u.getByTestId("estimated-age-years"), "1,5");
    expect(u.getByTestId("estimated-age-years").props.value).toBe("1,5");
    expect(u.getByText(es.common.wholeNumber)).toBeTruthy();
  });
});
