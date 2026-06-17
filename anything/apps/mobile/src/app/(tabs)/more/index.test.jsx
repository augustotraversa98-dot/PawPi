// The More-landing header must reflect the REACTIVE current pet (ticket 2.34):
// switching/creating a pet updates the name + avatar immediately, with no stale
// AsyncStorage snapshot. The current-pet hook is mocked so we can flip the active
// pet and assert the header re-renders.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockCurrentPet;
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), clear: jest.fn() },
}));
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({ setAuth: jest.fn() }),
}));
jest.mock("@/components/Pets/PetSwitcher", () => ({
  PetSwitcher: () => null,
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockCurrentPet }),
}));

import MoreScreen from "./index";

beforeEach(() => {
  mockPush.mockReset();
  mockCurrentPet = {
    id: 1,
    name: "Rex",
    breed: "Labrador",
    age_years: 2,
    age_months: 3,
    avatar_url: null,
  };
});

test("header shows the active pet's name + breed/age", () => {
  const { getByText } = render(<MoreScreen />);
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("Labrador · 2 yrs 3 mos")).toBeTruthy();
});

test("switching the active pet re-renders the header with the new pet", () => {
  const { getByText, queryByText, rerender } = render(<MoreScreen />);
  expect(getByText("Rex")).toBeTruthy();

  // Simulate a pet switch / new-pet creation: the hook now returns a different pet.
  mockCurrentPet = {
    id: 2,
    name: "Biscuit",
    breed: "Beagle",
    age_years: 0,
    age_months: 5,
    avatar_url: null,
  };
  rerender(<MoreScreen />);

  expect(getByText("Biscuit")).toBeTruthy();
  expect(getByText("Beagle · 5 mos")).toBeTruthy();
  expect(queryByText("Rex")).toBeNull();
});

test("falls back to a friendly default when there is no pet yet", () => {
  mockCurrentPet = null;
  const { getByText } = render(<MoreScreen />);
  expect(getByText("My Dog")).toBeTruthy();
});

test("the burger opens the More menu with every former destination (2.39)", () => {
  const { getByLabelText, getByText } = render(<MoreScreen />);
  fireEvent.press(getByLabelText("Open menu"));
  for (const item of [
    "Community",
    "My Hub",
    "Dog Profile",
    "Reminders & Routines",
    "Settings",
    "Reset App Data",
  ]) {
    expect(getByText(item)).toBeTruthy();
  }
});

test("a menu item closes the sheet and routes to its destination (2.39)", () => {
  const { getByLabelText, getByText } = render(<MoreScreen />);
  fireEvent.press(getByLabelText("Open menu"));
  fireEvent.press(getByText("Settings"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/settings");
});
