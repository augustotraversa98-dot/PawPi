// Transport / pet-taxi screen (ticket 2.52): discovery filtered to the `transport` capability;
// the booking form posts the right body; trips render with status + cancel/message entry points.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockProviders;
let mockTrips;
const mockDiscover = jest.fn(() => ({ data: mockProviders, isLoading: false, isError: false, refetch: jest.fn() }));
const mockBook = jest.fn(() => Promise.resolve({ trip: { id: 1 } }));
const mockCancel = jest.fn();
const mockStartThread = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Map/MapLocationPicker", () => () => null);
jest.mock("@/components/DateField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <TouchableOpacity testID={testID} onPress={() => onChange("2026-08-01")}>
        <Text>date</Text>
      </TouchableOpacity>
    ),
  };
});
jest.mock("@/components/TimeField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <TouchableOpacity testID={testID} onPress={() => onChange("09:00")}>
        <Text>time</Text>
      </TouchableOpacity>
    ),
  };
});
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 5 } }) }));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (...a) => mockDiscover(...a),
  useStartThread: () => ({ mutate: mockStartThread }),
}));
jest.mock("@/hooks/useTransport", () => ({
  useTransportTrips: () => ({ data: mockTrips }),
  useBookTransport: () => ({ mutateAsync: mockBook, isPending: false }),
  useCancelTransport: () => ({ mutate: mockCancel }),
}));

import TransportScreen from "./transport";

beforeEach(() => {
  jest.clearAllMocks();
  mockProviders = [{ id: 100, name: "Pet Taxi Co" }];
  mockTrips = [];
});

test("discovery is filtered to the transport capability", () => {
  render(<TransportScreen />);
  expect(mockDiscover).toHaveBeenCalledWith("transport");
});

test("lists transport providers; empty state when none", () => {
  const { getByText, queryByTestId } = render(<TransportScreen />);
  expect(getByText("Pet Taxi Co")).toBeTruthy();
  expect(queryByTestId("providers-empty")).toBeNull();
});

test("the booking form posts the right body", async () => {
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("provider-100")); // select provider → form appears
  fireEvent.press(getByTestId("trip-date"));
  fireEvent.press(getByTestId("trip-time"));
  fireEvent.changeText(getByTestId("pickup-address"), "Home");
  fireEvent.changeText(getByTestId("dropoff-address"), "Vet clinic");
  fireEvent.press(getByTestId("type-round_trip"));
  fireEvent.press(getByTestId("book-transport"));

  await waitFor(() =>
    expect(mockBook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 100,
        petId: 5,
        pickup_address: "Home",
        dropoff_address: "Vet clinic",
        trip_type: "round_trip",
        scheduled_at: expect.any(String),
      }),
    ),
  );
});

test("renders a trip with its status and a cancel affordance", () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "Pet Taxi Co", pickup_address: "A", dropoff_address: "B", status: "requested" },
  ];
  const { getByText, getByTestId } = render(<TransportScreen />);
  expect(getByText("Requested")).toBeTruthy();
  expect(getByTestId("cancel-7")).toBeTruthy();
  expect(getByTestId("message-7")).toBeTruthy();
});

test("cancelling a trip calls the cancel mutation (confirmed)", () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "X", pickup_address: "A", dropoff_address: "B", status: "confirmed" },
  ];
  jest.spyOn(Alert, "alert").mockImplementation((t, m, buttons) =>
    buttons.find((b) => b.style === "destructive").onPress(),
  );
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("cancel-7"));
  expect(mockCancel).toHaveBeenCalledWith(7);
});

test("message opens a provider chat thread", () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "X", pickup_address: "A", dropoff_address: "B", status: "confirmed" },
  ];
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("message-7"));
  expect(mockStartThread).toHaveBeenCalledWith(
    expect.objectContaining({ providerId: 100 }),
    expect.any(Object),
  );
});
