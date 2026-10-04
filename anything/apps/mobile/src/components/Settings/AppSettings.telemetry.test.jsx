// "Help improve PawPi (anonymous)" switch in the shared settings screen: default ON, explanatory copy under it,
// OFF runs the opt-out flow, ON opts back in. The telemetry control is mocked: the opt-out behaviour itself is
// unit tested in src/telemetry/client.test.js.

import React from "react";
import { Switch } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockReadEnabled = jest.fn();
const mockSetEnabled = jest.fn();
jest.mock("@/telemetry/telemetryControl", () => ({
  readTelemetryEnabled: (...a) => mockReadEnabled(...a),
  setTelemetryEnabled: (...a) => mockSetEnabled(...a),
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

import AppSettings from "./AppSettings";

// The composite <Switch testID="telemetry-toggle"> (other switches on the screen have their own testIDs).
const telemetrySwitch = (utils) =>
  utils.UNSAFE_getAllByType(Switch).find((s) => s.props.testID === "telemetry-toggle");

beforeEach(() => {
  jest.clearAllMocks();
  mockReadEnabled.mockResolvedValue(true);
  mockSetEnabled.mockResolvedValue(undefined);
});

it("shows the telemetry switch ON by default with the explanatory copy", async () => {
  const utils = render(<AppSettings />);
  expect(utils.getByText("Help improve PawPi (anonymous)")).toBeTruthy();
  expect(utils.getByText(/anonymous usage and error data/i)).toBeTruthy();
  expect(telemetrySwitch(utils).props.value).toBe(true);
  await waitFor(() => expect(mockReadEnabled).toHaveBeenCalled());
});

it("reflects a stored opt-out", async () => {
  mockReadEnabled.mockResolvedValue(false);
  const utils = render(<AppSettings />);
  await waitFor(() => expect(telemetrySwitch(utils).props.value).toBe(false));
});

it("turning it OFF runs the opt-out flow; turning it ON opts back in", async () => {
  const { getByTestId } = render(<AppSettings />);
  await waitFor(() => expect(mockReadEnabled).toHaveBeenCalled());

  fireEvent(getByTestId("telemetry-toggle"), "valueChange", false);
  expect(mockSetEnabled).toHaveBeenCalledWith(false);

  fireEvent(getByTestId("telemetry-toggle"), "valueChange", true);
  expect(mockSetEnabled).toHaveBeenLastCalledWith(true);
});

it("the same copy exists in Spanish", () => {
  const en = require("@/i18n/locales/en.json");
  const es = require("@/i18n/locales/es.json");
  expect(es.settings.telemetryTitle).toBe("Ayudar a mejorar PawPi (anónimo)");
  expect(es.settings.telemetryHint.length).toBeGreaterThan(20);
  expect(es.settings.telemetryTitle).not.toBe(en.settings.telemetryTitle);
  expect(es.settings.telemetryHint).not.toBe(en.settings.telemetryHint);
});
