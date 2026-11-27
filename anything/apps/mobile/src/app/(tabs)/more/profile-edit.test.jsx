// Dog Profile edit — birthday vs. estimated age (docs/roadmap.md). Ticket:
// birthday and raw age_years/age_months used to be edited as separate,
// unlinked inputs shown together at all times. BirthdayOrAgeField (shared
// with EditMedicalProfileModal.jsx) replaces that with an explicit "I know
// date plus "I don't know the exact date", and the save payload must leave a
// previously-stored estimate untouched when the birthday is known. A save only
// carries an estimate the owner entered or changed.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleSheet } from "react-native";

let mockCurrentPet;
let mockKeyboardVisible = false;
jest.mock("@/hooks/useKeyboardMetrics", () => () => ({
  keyboardVisible: mockKeyboardVisible,
  keyboardOverlap: mockKeyboardVisible ? 336 : 0,
}));

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

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
  it("opens on the estimate when the pet has no birthday yet", () => {
    mockCurrentPet = { id: 1, name: "Rex" };
    const api = renderScreen();
    expect(api.getByTestId("estimated-age-years")).toBeTruthy();
  });

  it("opens on the birth date when the pet already has one", () => {
    mockCurrentPet = { id: 1, name: "Rex", birthday: "2020-01-01" };
    const api = renderScreen();
    expect(api.queryByTestId("estimated-age-years")).toBeNull();
  });

  it("shows the birth date heading only while the date field is there", () => {
    mockCurrentPet = { id: 1, name: "Rex", birthday: "2020-01-01" };
    const api = renderScreen();
    expect(api.getByText("Birth date")).toBeTruthy();
    fireEvent.press(api.getByTestId("birthday-unsure"));
    expect(api.queryByText("Birth date")).toBeNull();
    fireEvent.press(api.getByTestId("birthday-unsure"));
    expect(api.getByText("Birth date")).toBeTruthy();
  });

  it("sends the typed estimate and clears birthday when saving the estimate", async () => {
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
    fireEvent.press(api.getByTestId("birthday-unsure")); // unticks "I don't know"
    fireEvent.press(api.getByText("Save Changes"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = requestBody();
    expect(body).not.toHaveProperty("age_years");
    expect(body).not.toHaveProperty("age_months");
  });
});

describe("Dog Profile edit — a save never restarts an estimate", () => {
  const estimated = {
    id: 1,
    name: "Rex",
    age_years: 3,
    age_months: 0,
    age_estimate_months: 24,
    age_estimated_on: "2025-11-15",
  };

  const save = async (api) => {
    fireEvent.press(api.getByText("Save Changes"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    return requestBody();
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ pet: { id: 1 } }) });
  });

  it("leaves the age out when the estimate was not touched, with the shown age prefilled", async () => {
    mockCurrentPet = estimated;
    const api = renderScreen();
    expect(api.getByTestId("estimated-age-years").props.value).toBe("3");
    expect(api.getByText(/keep counting from the day you save it/)).toBeTruthy();
    const body = await save(api);
    expect(body.birthday).toBeNull();
    expect(body).not.toHaveProperty("age_years");
    expect(body).not.toHaveProperty("age_months");
  });

  it("sends both numbers when one of them changed", async () => {
    mockCurrentPet = estimated;
    const api = renderScreen();
    fireEvent.changeText(api.getByTestId("estimated-age-months"), "6");
    const body = await save(api);
    expect([body.age_years, body.age_months]).toEqual([3, 6]);
  });

  it("sends empty values when the estimate was erased", async () => {
    mockCurrentPet = estimated;
    const api = renderScreen();
    fireEvent.changeText(api.getByTestId("estimated-age-years"), "");
    fireEvent.changeText(api.getByTestId("estimated-age-months"), "");
    const body = await save(api);
    expect([body.age_years, body.age_months]).toEqual([null, null]);
  });

  it("starts the estimate empty when switching from a birth date", async () => {
    mockCurrentPet = { id: 1, name: "Rex", birthday: "2020-01-01", age_years: 6, age_months: 10 };
    const api = renderScreen();
    fireEvent.press(api.getByTestId("birthday-unsure"));
    expect(api.getByTestId("estimated-age-years").props.value).toBe("");
    const body = await save(api);
    expect([body.birthday, body.age_years, body.age_months]).toEqual([null, null, null]);
  });

  it("promises no growth when the server does not keep estimates", () => {
    mockCurrentPet = { id: 1, name: "Rex", age_years: 3, age_months: 0 };
    const api = renderScreen();
    expect(api.queryByText(/keep counting from the day you save it/)).toBeNull();
    expect(api.getByText(/mark it as approximate/)).toBeTruthy();
  });

  it("removes the adoption date", async () => {
    mockCurrentPet = { ...estimated, adoption_date: "2024-05-01" };
    const api = renderScreen();
    fireEvent.press(api.getByTestId("adoption-date-remove"));
    const body = await save(api);
    expect(body.adoption_date).toBeNull();
  });
});

// Night run #2 PR B — the handle field uses the same availability logic as onboarding.
describe("Dog Profile edit — handle availability", () => {
  it("a taken handle blocks Save and offers free alternatives; picking one re-enables Save", async () => {
    mockCurrentPet = { id: 9, name: "Rex", handle: "rexy" };
    global.fetch = jest.fn((url) => {
      const body = String(url).includes("handle=rexy2")
        ? { available: true }
        : { available: false, alternatives: ["rexy2", "rexy.paws"] };
      return Promise.resolve({ ok: true, json: async () => body });
    });

    const api = renderScreen();
    const input = api.getByPlaceholderText("e.g. buddy_adventures");
    fireEvent.changeText(input, "Taken_One");

    const chip = await api.findByTestId("profile-edit-handle-alt-rexy2", {}, { timeout: 4000 });
    expect(global.fetch.mock.calls[0][0]).toBe(
      "/api/pets/handle-availability?handle=taken_one&pet_id=9",
    );
    expect(api.getByTestId("profile-edit-handle-error")).toBeTruthy();
    // Save is blocked while the handle is taken: pressing it sends nothing but availability checks.
    const before = global.fetch.mock.calls.length;
    fireEvent.press(api.getByText("Save Changes"));
    expect(global.fetch.mock.calls.length).toBe(before);

    fireEvent.press(chip);
    await waitFor(() => expect(api.getByTestId("profile-edit-handle-available")).toBeTruthy(), {
      timeout: 4000,
    });
  });

  it("keeping the pet's own handle needs no request", () => {
    mockCurrentPet = { id: 9, name: "Rex", handle: "rexy" };
    global.fetch = jest.fn();
    renderScreen();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a 409 handle_taken on save shows alternatives instead of a raw error", async () => {
    mockCurrentPet = { id: 9, name: "Rex", handle: "rexy" };
    global.fetch = jest.fn((url, opts) => {
      if (String(url).includes("handle-availability")) {
        return Promise.resolve({ ok: true, json: async () => ({ available: true }) });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ error: "x", code: "handle_taken", alternatives: ["freshone"] }),
      });
    });
    const api = renderScreen();
    fireEvent.changeText(api.getByPlaceholderText("e.g. buddy_adventures"), "newhandle");
    await waitFor(() => expect(api.getByTestId("profile-edit-handle-available")).toBeTruthy(), {
      timeout: 4000,
    });
    fireEvent.press(api.getByText("Save Changes"));
    await api.findByTestId("profile-edit-handle-alt-freshone", {}, { timeout: 4000 });
    const alertSpy = require("react-native").Alert.alert;
    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls[0][1])).toMatch(/just took/i);
  });
});

describe("Dog Profile edit — the Save footer never covers the field being typed", () => {
  const footerStyle = (api) =>
    StyleSheet.flatten(api.getByTestId("profile-edit-footer").props.style);

  afterEach(() => {
    mockKeyboardVisible = false;
  });

  it("floats over the bottom of the screen at rest", () => {
    mockCurrentPet = { id: 1, name: "Rex" };
    expect(footerStyle(renderScreen()).position).toBe("absolute");
  });

  it("takes its own space above the keyboard while typing", () => {
    mockCurrentPet = { id: 1, name: "Rex" };
    mockKeyboardVisible = true;
    const style = footerStyle(renderScreen());
    expect(style.position).toBe("relative");
    expect(style.paddingBottom).toBeLessThanOrEqual(16);
  });
});
