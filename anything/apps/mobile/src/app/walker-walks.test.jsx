// Render pins for the walker workspace (ticket 2.7):
//   - no walker provider → the "no workspace" empty state;
//   - a provider with no walker bookings → the "no walks booked" empty state;
//   - walker bookings render a Start card per booking (capability='walker' only — a vet
//     booking on the same inbox is filtered out, no fake data);
//   - the screen reuses StartWalkModal (the existing walk-activity UI) — mocked here.
// All data hooks, router, expo-location, and the StartWalkModal are mocked.

import React from "react";
import { render } from "@testing-library/react-native";

let mockProviders;
let mockBookings;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Health/WalkActivity/StartWalkModal", () => () => null);
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProviders,
  useProviderBookings: () => mockBookings,
  useCheckInWalk: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useTrackWalk: () => ({ mutate: jest.fn() }),
  useFinishWalk: () => ({ mutateAsync: jest.fn() }),
}));

import WalkerWalksScreen from "./walker-walks";

beforeEach(() => {
  mockProviders = { data: [], isLoading: false };
  mockBookings = { data: [], refetch: jest.fn() };
});

test("no walker provider → no-workspace empty state", () => {
  mockProviders = { data: [], isLoading: false };
  const { getByText } = render(<WalkerWalksScreen />);
  expect(getByText("No walker workspace")).toBeTruthy();
});

test("a provider with no walker bookings → no-walks empty state", () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = { data: [], refetch: jest.fn() };
  const { getByText } = render(<WalkerWalksScreen />);
  expect(getByText("No walks booked")).toBeTruthy();
});

test("renders a Start card per walker booking and filters out non-walker bookings", () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = {
    data: [
      {
        id: 1,
        capability: "walker",
        booking_status: "confirmed",
        pet_name: "Rex",
        owner_name: "Ana",
        appointment_date: "2026-06-20",
      },
      // A vet booking on the same inbox must NOT appear here.
      { id: 2, capability: "vet", booking_status: "confirmed", pet_name: "Milo" },
    ],
    refetch: jest.fn(),
  };
  const { getByText, queryByText } = render(<WalkerWalksScreen />);
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("Start")).toBeTruthy();
  expect(queryByText("Milo")).toBeNull();
});
