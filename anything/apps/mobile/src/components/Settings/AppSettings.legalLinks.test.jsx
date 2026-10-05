// Settings → Support: Privacy Policy / Terms of Service / EULA rows. Each opens its hosted page via
// Linking.openURL and is HIDDEN when its URL is not configured (no dead links). The shared harness in
// AppSettings.test.jsx is mirrored here; only the legal constants are made mutable.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
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

const mockLegal = { privacy: "", terms: "", eula: "" };
jest.mock("@/constants/legal", () => ({
  SUPPORT_EMAIL: "support@pawpi.info",
  HELP_CENTER_URL: "",
  get PRIVACY_POLICY_URL() {
    return mockLegal.privacy;
  },
  get TERMS_OF_SERVICE_URL() {
    return mockLegal.terms;
  },
  get EULA_URL() {
    return mockLegal.eula;
  },
}));

import AppSettings from "./AppSettings";

let openURL;
beforeEach(() => {
  mockLegal.privacy = "https://www.pawpi.info/privacy";
  mockLegal.terms = "https://www.pawpi.info/terms";
  mockLegal.eula = "https://www.pawpi.info/eula";
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

it("shows Privacy Policy, Terms of Service and EULA rows that open the hosted pages", () => {
  const { getByText } = render(<AppSettings />);
  fireEvent.press(getByText("Privacy Policy"));
  expect(openURL).toHaveBeenLastCalledWith("https://www.pawpi.info/privacy");
  fireEvent.press(getByText("Terms of Service"));
  expect(openURL).toHaveBeenLastCalledWith("https://www.pawpi.info/terms");
  fireEvent.press(getByText("End User License Agreement (EULA)"));
  expect(openURL).toHaveBeenLastCalledWith("https://www.pawpi.info/eula");
});

it("hides a row whose URL is empty, and keeps the others", () => {
  mockLegal.terms = "";
  mockLegal.eula = "";
  const { queryByText } = render(<AppSettings />);
  expect(queryByText("Privacy Policy")).toBeTruthy();
  expect(queryByText("Terms of Service")).toBeNull();
  expect(queryByText("End User License Agreement (EULA)")).toBeNull();
});

it("renders no legal rows at all when nothing is configured", () => {
  mockLegal.privacy = "";
  mockLegal.terms = "";
  mockLegal.eula = "";
  const { queryByText } = render(<AppSettings />);
  expect(queryByText("Privacy Policy")).toBeNull();
  expect(queryByText("Terms of Service")).toBeNull();
  expect(queryByText("End User License Agreement (EULA)")).toBeNull();
});

it("the same rows appear in business mode (shared Support section)", () => {
  const { queryByText } = render(<AppSettings mode="business" />);
  expect(queryByText("Privacy Policy")).toBeTruthy();
});
