// "Let PawPi read my documents" in Settings: OFF until allowed, per signed-in user, revocable, follows a choice made elsewhere, and
// absent from the business settings.

import React from "react";
import { Alert, Linking, Switch } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

let mockUserId = 7;
jest.mock("@/utils/auth/store", () => ({
  useAuthStore: (selector) => selector({ auth: { user: { id: mockUserId } } }),
}));
jest.mock("@/telemetry/telemetryControl", () => ({
  readTelemetryEnabled: () => Promise.resolve(true),
  setTelemetryEnabled: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: jest.fn() }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);
jest.mock("@/utils/businessNotificationPrefs", () => ({
  ...jest.requireActual("@/utils/businessNotificationPrefs"),
  getBusinessNotificationPrefs: () => Promise.resolve({}),
}));
jest.mock("@/constants/legal", () => ({
  ...jest.requireActual("@/constants/legal"),
  PRIVACY_POLICY_URL: "https://www.pawpi.info/privacy",
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import AppSettings from "./AppSettings";
import { aiDocConsentKey, getAiDocConsent, setAiDocConsent } from "@/utils/aiDocConsent";

const findSwitch = (utils) =>
  utils.UNSAFE_queryAllByType(Switch).find((s) => s.props.testID === "ai-docs-toggle");

beforeEach(async () => {
  jest.restoreAllMocks();
  mockUserId = 7;
  await AsyncStorage.clear();
});

it("is OFF when never asked, and the hint names Anthropic", async () => {
  const utils = render(<AppSettings />);
  expect(utils.getByText("Let PawPi read my documents")).toBeTruthy();
  expect(utils.getByText(/sent to Anthropic \(Claude\)/)).toBeTruthy();
  await act(async () => {});
  expect(findSwitch(utils).props.value).toBe(false);
});

it("shows an earlier permission, and turning it OFF revokes it", async () => {
  await setAiDocConsent(7, true);
  const utils = render(<AppSettings />);
  await waitFor(() => expect(findSwitch(utils).props.value).toBe(true));
  fireEvent(utils.getByTestId("ai-docs-toggle"), "valueChange", false);
  await waitFor(async () => expect(await getAiDocConsent(7)).toBe("denied"));
  expect(findSwitch(utils).props.value).toBe(false);
});

it("turning it ON grants it for the signed-in user only", async () => {
  const utils = render(<AppSettings />);
  await act(async () => {});
  fireEvent(utils.getByTestId("ai-docs-toggle"), "valueChange", true);
  await waitFor(async () => expect(await getAiDocConsent(7)).toBe("granted"));
  expect(await getAiDocConsent(8)).toBeNull();
});

it("does not show another user's permission", async () => {
  await setAiDocConsent(8, true);
  const utils = render(<AppSettings />);
  await act(async () => {});
  expect(findSwitch(utils).props.value).toBe(false);
});

it("follows a choice made while the screen is open", async () => {
  const utils = render(<AppSettings />);
  await act(async () => {});
  await act(async () => {
    await setAiDocConsent(7, true);
  });
  expect(findSwitch(utils).props.value).toBe(true);
});

it("goes back and says so when the choice cannot be saved", async () => {
  await AsyncStorage.setItem(aiDocConsentKey(7), "granted");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const utils = render(<AppSettings />);
  await waitFor(() => expect(findSwitch(utils).props.value).toBe(true));
  jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
  fireEvent(utils.getByTestId("ai-docs-toggle"), "valueChange", false);
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(findSwitch(utils).props.value).toBe(true);
});

it("links to the Privacy Policy", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const utils = render(<AppSettings />);
  fireEvent.press(utils.getByTestId("ai-docs-privacy"));
  expect(open).toHaveBeenCalledWith("https://www.pawpi.info/privacy");
  await act(async () => {});
});

it("is not in the business settings", async () => {
  const utils = render(<AppSettings mode="business" />);
  await act(async () => {});
  expect(findSwitch(utils)).toBeUndefined();
});
