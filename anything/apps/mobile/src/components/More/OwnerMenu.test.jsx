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
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({ setAuth: jest.fn() }),
}));
jest.mock("@/components/Pets/PetSwitcher", () => {
  const { Text } = require("react-native");
  return { PetSwitcher: () => <Text>MY_DOGS</Text> };
});

import { OwnerMenu } from "./OwnerMenu";

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
