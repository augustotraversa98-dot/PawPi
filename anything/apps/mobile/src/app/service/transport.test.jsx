// Transport / pet-taxi screen (ticket 2.52): discovery filtered to the `transport` capability;
// the booking form posts the right body; trips render with status + cancel/message entry points.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockProviders;
let mockTrips;
const mockDiscover = jest.fn(() => ({ data: mockProviders, isLoading: false, isError: false, refetch: jest.fn() }));
const mockBook = jest.fn(() => Promise.resolve({ trip: { id: 1 } }));
const mockCheckout = jest.fn(() => Promise.resolve({ checkoutUrl: "https://mp/checkout/xyz" }));
const mockCancel = jest.fn();
const mockStartThread = jest.fn();
const mockSetTripCal = jest.fn();
const mockAddTransportToCalendar = jest.fn();
const mockRemoveSurfaceEvent = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/utils/calendarIntegration", () => ({
  addTransportToCalendar: (...a) => mockAddTransportToCalendar(...a),
  removeSurfaceEventFromCalendar: (...a) => mockRemoveSurfaceEvent(...a),
}));
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
  useBookingCheckout: () => ({ mutateAsync: mockCheckout, isPending: false }),
}));
jest.mock("@/hooks/useTransport", () => ({
  useTransportTrips: () => ({ data: mockTrips }),
  useBookTransport: () => ({ mutateAsync: mockBook, isPending: false }),
  useCancelTransport: () => ({ mutate: mockCancel }),
  useSetTripCalendarEvent: () => ({ mutate: mockSetTripCal }),
}));

import TransportScreen from "./transport";

beforeEach(() => {
  jest.clearAllMocks();
  mockProviders = [{ id: 100, name: "Pet Taxi Co" }];
  mockTrips = [];
  mockAddTransportToCalendar.mockResolvedValue({ success: true, eventId: "evt-1" });
  mockRemoveSurfaceEvent.mockResolvedValue({ success: true });
  mockCheckout.mockResolvedValue({ checkoutUrl: "https://mp/checkout/xyz" });
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
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

test("a confirmed trip with a fare shows Pay; paying starts checkout (fare→cents, source_ref) + opens MercadoPago", async () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "X", pickup_address: "A", dropoff_address: "B", status: "confirmed", fare_amount: 15, paid: false },
  ];
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("pay-7"));
  await waitFor(() => expect(mockCheckout).toHaveBeenCalledTimes(1));
  expect(mockCheckout).toHaveBeenCalledWith({
    provider_id: 100,
    amount_cents: 1500, // fare 15 → 1500 cents
    source_ref: "transport:7",
  });
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenCalledWith("https://mp/checkout/xyz"),
  );
});

test("a paid trip shows Paid and no Pay button", () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "X", pickup_address: "A", dropoff_address: "B", status: "confirmed", fare_amount: 15, paid: true },
  ];
  const { getByTestId, queryByTestId } = render(<TransportScreen />);
  expect(getByTestId("paid-7")).toBeTruthy();
  expect(queryByTestId("pay-7")).toBeNull();
});

test("no Pay button on a requested trip (no fare set yet)", () => {
  mockTrips = [
    { id: 7, provider_id: 100, provider_name: "X", pickup_address: "A", dropoff_address: "B", status: "requested", paid: false },
  ];
  const { queryByTestId } = render(<TransportScreen />);
  expect(queryByTestId("pay-7")).toBeNull();
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

test("add-to-calendar adds the trip and persists the id on the booking (2.80)", async () => {
  mockTrips = [
    {
      id: 7, booking_id: 900, provider_id: 100, provider_name: "Pet Taxi Co",
      pickup_address: "A", dropoff_address: "B", scheduled_at: "2026-08-01T09:00:00Z",
      status: "confirmed",
    },
  ];
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("add-calendar-7"));
  await waitFor(() => expect(mockAddTransportToCalendar).toHaveBeenCalled());
  await waitFor(() =>
    expect(mockSetTripCal).toHaveBeenCalledWith({ bookingId: 900, calendarEventId: "evt-1" }),
  );
});

test("cancelling a trip with a calendar event removes it from the device", async () => {
  mockTrips = [
    {
      id: 7, booking_id: 900, provider_id: 100, provider_name: "X",
      pickup_address: "A", dropoff_address: "B", status: "confirmed",
      calendar_event_id: "evt-1",
    },
  ];
  jest.spyOn(Alert, "alert").mockImplementation((t, m, buttons) =>
    buttons.find((b) => b.style === "destructive").onPress(),
  );
  const { getByTestId } = render(<TransportScreen />);
  fireEvent.press(getByTestId("cancel-7"));
  await waitFor(() => expect(mockRemoveSurfaceEvent).toHaveBeenCalledWith("evt-1"));
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith(7));
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
