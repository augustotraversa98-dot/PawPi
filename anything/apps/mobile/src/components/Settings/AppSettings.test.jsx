// BX3: the shared, route-agnostic app-settings body. Proves it renders the settings surface
// (delete-account control) and that its header back arrow uses router.back() — so it returns to
// whichever host pushed it (More in the pet app, Profile in business mode).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: jest.fn() }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);

import AppSettings from "./AppSettings";

beforeEach(() => jest.clearAllMocks());

it("renders the settings surface (delete-account control + language options)", () => {
  const { getByTestId } = render(<AppSettings />);
  expect(getByTestId("delete-account")).toBeTruthy();
  expect(getByTestId("lang-en")).toBeTruthy();
});

it("header back arrow returns to the host that pushed it (router.back)", () => {
  const { UNSAFE_getAllByType } = render(<AppSettings />);
  const { TouchableOpacity } = require("react-native");
  // The first TouchableOpacity in the tree is the header back button.
  fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);
  expect(mockBack).toHaveBeenCalledTimes(1);
});
