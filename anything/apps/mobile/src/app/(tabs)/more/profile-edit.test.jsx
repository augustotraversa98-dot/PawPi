// Dog Profile edit — birthday vs. estimated age (docs/roadmap.md). Ticket:
// birthday and raw age_years/age_months used to be edited as separate,
// unlinked inputs shown together at all times. BirthdayOrAgeField (shared
// with EditMedicalProfileModal.jsx) replaces that with an explicit "I know
// the birthday" / "I'm not sure" toggle, and the save payload must leave a
// previously-stored estimate untouched when the birthday is known.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockCurrentPet;

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => require("react").createElement(View, props) };
});
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockCurrentPet, isLoading: false }),
}));

import ProfileEditScreen from "./profile-edit";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <ProfileEditScreen />
    </QueryClientProvider>,
  );
}

function requestBody() {
  return JSON.parse(global.fetch.mock.calls[0][1].body);
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("Dog Profile edit — birthday vs. estimated age", () => {
  it("defaults to 'I'm not sure' when the pet has no birthday yet", () => {
    mockCurrentPet = { id: 1, name: "Rex" };
    const api = renderScreen();
    expect(api.getByTestId("estimated-age-years")).toBeTruthy();
  });

  it("defaults to 'I know the birthday' when the pet already has one", () => {
    mockCurrentPet = { id: 1, name: "Rex", birthday: "2020-01-01" };
    const api = renderScreen();
    expect(api.queryByTestId("estimated-age-years")).toBeNull();
  });

  it("sends the typed estimate and clears birthday when saving in 'I'm not sure' mode", async () => {
    mockCurrentPet = { id: 1, name: "Rex", birthday: "2020-01-01" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pet: { id: 1 } }),
    });

    const api = renderScreen();
    fireEvent.press(api.getByTestId("birthday-unsure"));
    fireEvent.changeText(api.getByTestId("estimated-age-years"), "4");
    fireEvent.changeText(api.getByTestId("estimated-age-months"), "2");
    fireEvent.press(api.getByText("Save Changes"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = requestBody();
    expect(body.birthday).toBeNull();
    expect(body.age_years).toBe(4);
    expect(body.age_months).toBe(2);
  });

  it("omits age_years/age_months from the save payload when the birthday is known (leaves any old estimate in place)", async () => {
    mockCurrentPet = { id: 1, name: "Rex", age_years: 3, age_months: 6 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pet: { id: 1 } }),
    });

    const api = renderScreen();
    fireEvent.press(api.getByTestId("birthday-known"));
    fireEvent.press(api.getByText("Save Changes"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = requestBody();
    expect(body).not.toHaveProperty("age_years");
    expect(body).not.toHaveProperty("age_months");
  });
});
