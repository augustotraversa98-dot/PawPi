// In-app account deletion (ticket 2.78, Apple 5.1.1(v)): Settings shows a "Delete account" control;
// the two-step confirm calls DELETE /api/account, clears local auth, and returns to welcome.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

const mockReplace = jest.fn();
const mockSetAuth = jest.fn();
const mockGetAllKeys = jest.fn();
const mockMultiRemove = jest.fn().mockResolvedValue();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: mockSetAuth }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);
jest.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: (...a) => mockGetAllKeys(...a),
    multiRemove: (...a) => mockMultiRemove(...a),
  },
}));

import SettingsScreen from "./settings";

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  mockMultiRemove.mockResolvedValue();
  mockGetAllKeys.mockResolvedValue([
    "pet_profile",
    "has_completed_onboarding",
    "pawpi:locale",
    "pawpi.notifPrefs.v1",
    "pawpi.telemetry.enabled",
  ]);
});

it("renders a Delete account control", () => {
  const { getByTestId } = render(<SettingsScreen />);
  expect(getByTestId("delete-account")).toBeTruthy();
});

it("two-step confirm deletes the account, clears auth, and returns to welcome", async () => {
  // Auto-confirm each Alert by pressing its destructive button (chains the two confirmations).
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons = []) => {
    const destructive = buttons.find((b) => b.style === "destructive");
    destructive?.onPress?.();
  });

  const { getByTestId } = render(<SettingsScreen />);
  fireEvent.press(getByTestId("delete-account"));

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith("/api/account", { method: "DELETE" }),
  );
  await waitFor(() => expect(mockSetAuth).toHaveBeenCalledWith(null));
  // Account data goes; language, notification prefs and the telemetry opt-out stay.
  expect(mockMultiRemove).toHaveBeenCalledWith(["pet_profile", "has_completed_onboarding"]);
  expect(mockReplace).toHaveBeenCalledWith("/welcome");
});

// Contact info wiring (Guideline 1.2 / App Store Support URL, ticket T6).
it("Contact Us opens the support email (mailto:)", () => {
  jest.spyOn(Linking, "openURL").mockResolvedValue();
  const { getByLabelText } = render(<SettingsScreen />);
  fireEvent.press(getByLabelText("Contact Us"));
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL.mock.calls[0][0]).toMatch(/^mailto:.+@.+/);
});

it("Help Center falls back to the support email when no help URL is set", () => {
  jest.spyOn(Linking, "openURL").mockResolvedValue();
  const { getByLabelText } = render(<SettingsScreen />);
  fireEvent.press(getByLabelText("Help Center"));
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL.mock.calls[0][0]).toMatch(/^mailto:/);
});
