// Render pins for the walker workspace (ticket 2.7):
//   - no walker provider → the "no workspace" empty state;
//   - a provider with no walker bookings → the "no walks booked" empty state;
//   - walker bookings render a Start card per booking (capability='walker' only — a vet
//     booking on the same inbox is filtered out, no fake data);
//   - the screen reuses StartWalkModal (the existing walk-activity UI); while a walk is active
//     it passes the walker's own live route map as the modal's topContent (ticket 2.102):
//       · permission granted + a GPS point → the real map (MapLocationView) is shown;
//       · permission denied → the graceful "no map" note (the timer still runs).
// All data hooks, router, expo-location, StartWalkModal, and the map are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockProviders;
let mockBookings;
const mockCheckInAsync = jest.fn();
const mockRequestPerm = jest.fn();
const mockWatch = jest.fn();

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
  requestForegroundPermissionsAsync: (...a) => mockRequestPerm(...a),
  watchPositionAsync: (...a) => mockWatch(...a),
  Accuracy: { Balanced: 3 },
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
// StartWalkModal double: render its topContent (the live map) when visible, so the test can
// assert what the active walk passes into the modal.
jest.mock("@/components/Health/WalkActivity/StartWalkModal", () => {
  const { View } = require("react-native");
  return ({ visible, topContent }) =>
    visible ? <View testID="walk-modal">{topContent}</View> : null;
});
// Real map primitive mocked to a Text (same convention as transport-track.test.jsx).
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ polyline }) => (
    <Text testID="map-view">{`p:${polyline?.length || 0}`}</Text>
  );
});
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProviders,
  useProviderBookings: () => mockBookings,
  useCheckInWalk: () => ({ mutateAsync: mockCheckInAsync, isPending: false }),
  useTrackWalk: () => ({ mutate: jest.fn() }),
  useFinishWalk: () => ({ mutateAsync: jest.fn() }),
}));

import WalkerWalksScreen from "./walker-walks";

const walkerBooking = {
  id: 1,
  capability: "walker",
  booking_status: "confirmed",
  pet_name: "Rex",
  owner_name: "Ana",
  appointment_date: "2026-06-20",
};

beforeEach(() => {
  mockProviders = { data: [], isLoading: false };
  mockBookings = { data: [], refetch: jest.fn() };
  mockCheckInAsync.mockReset().mockResolvedValue({ session: { id: 1 } });
  mockRequestPerm.mockReset();
  mockWatch.mockReset();
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

test("starting a walk (permission granted) shows the live route map from real points", async () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = { data: [walkerBooking], refetch: jest.fn() };
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  // watchPositionAsync fires one GPS point, then returns a subscription handle.
  mockWatch.mockImplementation(async (_opts, cb) => {
    cb({ coords: { latitude: 1, longitude: 1 }, timestamp: 1000 });
    return { remove: jest.fn() };
  });

  const { getByText, getByTestId } = render(<WalkerWalksScreen />);
  fireEvent.press(getByText("Start"));

  await waitFor(() => expect(getByTestId("walker-live-map")).toBeTruthy());
  // The recorded point feeds the polyline on the real map.
  expect(getByTestId("map-view").props.children).toBe("p:1");
});

test("starting a walk with location DENIED shows the graceful no-map note (time still tracks)", async () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = { data: [walkerBooking], refetch: jest.fn() };
  mockRequestPerm.mockResolvedValue({ status: "denied" });

  const { getByText, getByTestId, queryByTestId } = render(<WalkerWalksScreen />);
  fireEvent.press(getByText("Start"));

  await waitFor(() => expect(getByTestId("walker-map-denied")).toBeTruthy());
  expect(queryByTestId("walker-live-map")).toBeNull();
  expect(mockWatch).not.toHaveBeenCalled();
});
