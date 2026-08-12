// The Profile tab's ☰ burger (ticket 2.39 menu, reused by 2.60): opening it must
// surface every former "More" destination + the My Dogs switcher, so nothing
// owner-level is orphaned once the Profile tab becomes the pet social profile.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({ setAuth: jest.fn() }),
}));
jest.mock("@/components/Pets/PetSwitcher", () => {
  const { Text } = require("react-native");
  return { PetSwitcher: () => <Text>MY_DOGS</Text> };
});
// Business item shows only for provider staff — control the providers list per test.
const providersState = { data: [] };
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => providersState,
}));
// Real English catalog so the localized Business item asserts as "Business".
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

import { OwnerMenu } from "./OwnerMenu";

beforeEach(() => {
  mockPush.mockReset();
  providersState.data = [];
});

test("the burger opens a menu with every former More destination + My Dogs", () => {
  const { getByLabelText, getByText, queryByText } = render(<OwnerMenu />);

  // Closed initially.
  expect(queryByText("Community")).toBeNull();

  fireEvent.press(getByLabelText("Open menu"));

  // My Dogs switcher is reachable from here.
  expect(getByText("MY_DOGS")).toBeTruthy();
  // Every former More destination is present.
  [
    "Community",
    "My Hub",
    "Dog Profile",
    "Family & Caregivers",
    "Lost & Found",
    "Memories & Wrapped",
    "Reminders & Routines",
    "Settings",
    "Reset App Data",
  ].forEach((label) => expect(getByText(label)).toBeTruthy());
});

test("a pure pet owner (no providers) sees NO Business entry", () => {
  providersState.data = [];
  const { getByLabelText, queryByText } = render(<OwnerMenu />);
  fireEvent.press(getByLabelText("Open menu"));
  expect(queryByText("Business")).toBeNull();
});

test("an account that is ALSO provider staff gets a Business entry → Business home", () => {
  providersState.data = [{ id: 7, name: "Clinic" }];
  const { getByLabelText, getByText } = render(<OwnerMenu />);
  fireEvent.press(getByLabelText("Open menu"));

  const item = getByText("Business");
  expect(item).toBeTruthy();
  fireEvent.press(item);
  expect(mockPush).toHaveBeenCalledWith("/business");
});
