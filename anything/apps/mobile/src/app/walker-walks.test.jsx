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
let mockWalkRequests;
let mockNearbyRequests;
const mockCheckInAsync = jest.fn();
const mockRedeemAsync = jest.fn();
const mockAcceptAsync = jest.fn();
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
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k, fb) => fb }),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockRequestPerm(...a),
  watchPositionAsync: (...a) => mockWatch(...a),
  getCurrentPositionAsync: jest
    .fn()
    .mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } }),
  Accuracy: { Balanced: 3 },
}));
// Camera scanner (ticket B3) — the PickupScannerModal uses expo-camera; stub it out.
jest.mock("expo-camera", () => {
  const { View } = require("react-native");
  return {
    CameraView: (props) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
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
  useRedeemWalkPickup: () => ({ mutateAsync: mockRedeemAsync, isPending: false }),
  useProviderWalkRequests: () => mockWalkRequests,
  useNearbyWalkRequests: () => mockNearbyRequests,
  useAcceptWalkRequest: () => ({ mutateAsync: mockAcceptAsync, isPending: false }),
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
  mockWalkRequests = { data: [] };
  mockNearbyRequests = { data: [] };
  mockCheckInAsync.mockReset().mockResolvedValue({ session: { id: 1 } });
  mockAcceptAsync.mockReset().mockResolvedValue({ booking_id: 1, thread_id: 1 });
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

test("a pay_with_credit walker booking shows the 'Uses a walk' badge; a Scan button is present", () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = {
    data: [
      { id: 1, capability: "walker", booking_status: "confirmed", pet_name: "Rex", pay_with_credit: true },
      { id: 2, capability: "walker", booking_status: "confirmed", pet_name: "Fido", pay_with_credit: false },
    ],
    refetch: jest.fn(),
  };
  const { getByTestId, queryByTestId } = render(<WalkerWalksScreen />);
  expect(getByTestId("booking-credit-badge-1")).toBeTruthy(); // credit walk
  expect(queryByTestId("booking-credit-badge-2")).toBeNull(); // normal walk
  expect(getByTestId("walker-scan-pickup")).toBeTruthy();
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

test("an incoming request renders and Accept calls the accept mutation (ticket C1)", async () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = { data: [], refetch: jest.fn() };
  mockWalkRequests = {
    data: [{ id: 7, status: "open", pet_name: "Rex", owner_name: "Ana", when_type: "now" }],
  };
  const { getByText, getByTestId } = render(<WalkerWalksScreen />);
  expect(getByText("Incoming requests")).toBeTruthy();
  expect(getByTestId("request-card-7")).toBeTruthy();

  fireEvent.press(getByTestId("accept-request-7"));
  await waitFor(() => expect(mockAcceptAsync).toHaveBeenCalledWith({ requestId: 7 }));
});

test("a nearby broadcast request renders in the 'Nearby now' section with distance (ticket C2)", async () => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockBookings = { data: [], refetch: jest.fn() };
  mockNearbyRequests = {
    data: [
      { id: 9, status: "open", pet_name: "Milo", owner_name: "Leo", when_type: "now", distance_km: 1.2 },
    ],
  };
  const { getByText, getByTestId } = render(<WalkerWalksScreen />);
  expect(getByText("Nearby now")).toBeTruthy();
  expect(getByTestId("nearby-requests")).toBeTruthy();

  fireEvent.press(getByTestId("accept-request-9"));
  await waitFor(() => expect(mockAcceptAsync).toHaveBeenCalledWith({ requestId: 9 }));
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
