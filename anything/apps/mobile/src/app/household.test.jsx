// Render pins for the Household home (E14): lists all dogs with ring/streak; tapping a dog switches the
// persisted active pet; the family streak shows only for 2+ owned dogs and toggling it opts in.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockData;
let mockSetSelectedPetId;
let mockOptIn;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => mockData,
  useFamilyStreakOptIn: () => ({ optIn: mockOptIn, optOut: jest.fn() }),
}));
jest.mock("@/store/selectedPetStore", () => (selector) =>
  selector({ selectedPetId: 1, setSelectedPetId: mockSetSelectedPetId }));

import HouseholdScreen from "./household";

beforeEach(() => {
  mockSetSelectedPetId = jest.fn();
  mockOptIn = jest.fn().mockResolvedValue({});
  mockData = {
    isLoading: false,
    data: {
      owned_count: 2,
      family_streak: { opted_in: false, current: 0 },
      dogs: [
        { id: 1, name: "Rex", avatar_url: "rex.png", is_mine: true, ring_closed: true, streak: { current: 5 } },
        { id: 2, name: "Max", avatar_url: "max.png", is_mine: true, ring_closed: false, streak: { current: 2 } },
      ],
    },
  };
});

test("lists all the household dogs with ring indicators", () => {
  const { getByTestId } = render(<HouseholdScreen />);
  expect(getByTestId("household-dog-1")).toBeTruthy();
  expect(getByTestId("household-dog-2")).toBeTruthy();
  expect(getByTestId("household-ring-1")).toBeTruthy();
});

test("tapping a dog switches the persisted active pet", () => {
  const { getByTestId } = render(<HouseholdScreen />);
  fireEvent.press(getByTestId("household-dog-2"));
  expect(mockSetSelectedPetId).toHaveBeenCalledWith(2);
});

test("the family streak shows for 2+ dogs and opting in calls optIn", () => {
  const { getByTestId } = render(<HouseholdScreen />);
  expect(getByTestId("family-streak")).toBeTruthy();
  fireEvent(getByTestId("family-streak-toggle"), "valueChange", true);
  expect(mockOptIn).toHaveBeenCalled();
});

test("a single-dog account hides the family streak", () => {
  mockData = {
    isLoading: false,
    data: {
      owned_count: 1,
      family_streak: { opted_in: false, current: 0 },
      dogs: [{ id: 1, name: "Rex", is_mine: true, ring_closed: false, streak: { current: 0 } }],
    },
  };
  const { queryByTestId } = render(<HouseholdScreen />);
  expect(queryByTestId("family-streak")).toBeNull();
});
