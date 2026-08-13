// Business mode v2 → Bookings tab. Proves:
//   • the agenda lists UPCOMING active reservations (requested/confirmed, date >= today),
//     chronological, hiding declined/cancelled;
//   • a requested booking shows Confirm/Decline; Confirm calls the status update with action
//     'confirm' bound to the active provider; a confirmed booking shows neither button;
//   • empty state when there are no upcoming reservations.
// The provider/bookings hooks are mocked so the test drives the screen logic directly.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

// Active provider (resolved) — the screen reads useActiveProvider.
const mockActive = { activeProvider: { id: 7, name: "City Vets", logo_url: null }, providers: [], isLoading: false };
jest.mock("@/hooks/useActiveProvider", () => ({
  useActiveProvider: () => mockActive,
  __esModule: true,
  default: () => mockActive,
}));

// Bookings read + the action mutation.
const mockBookings = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
const mockActionMutate = jest.fn();
const mockAction = { mutate: mockActionMutate, isPending: false, boundId: null };
jest.mock("@/hooks/useProviders", () => ({
  useProviderBookings: () => mockBookings,
  useBookingAction: (id) => {
    mockAction.boundId = id;
    return mockAction;
  },
}));

// Freeze "today" for the upcoming filter (canonical date compare).
jest.mock("@/utils/canonicalDateTime", () => ({
  toCanonicalDate: () => "2026-08-12",
  formatDisplayDate: (d) => `D:${d}`,
  formatDisplayTime: (tm) => `T:${tm}`,
}));

import BusinessBookings from "./bookings";

beforeEach(() => {
  mockActionMutate.mockReset();
  mockBookings.data = [];
  mockBookings.isError = false;
  mockActive.activeProvider = { id: 7, name: "City Vets", logo_url: null };
});

test("lists upcoming active reservations chronologically, hiding declined/past", () => {
  mockBookings.data = [
    { id: 1, appointment_date: "2026-08-20", appointment_time: "10:00", booking_status: "confirmed", service_name: "Grooming", pet_name: "Rex", owner_name: "Ana" },
    { id: 2, appointment_date: "2026-08-14", appointment_time: "09:00", booking_status: "requested", service_name: "Checkup", pet_name: "Milo", owner_name: "Bob" },
    { id: 3, appointment_date: "2026-08-15", appointment_time: "12:00", booking_status: "declined", service_name: "Old", pet_name: "Zoe", owner_name: "Cid" },
    { id: 4, appointment_date: "2026-08-01", appointment_time: "12:00", booking_status: "confirmed", service_name: "Past", pet_name: "Fido", owner_name: "Dee" },
  ];

  const { getByTestId, queryByTestId, toJSON } = render(<BusinessBookings />);

  expect(getByTestId("business-booking-2")).toBeTruthy(); // requested Aug14
  expect(getByTestId("business-booking-1")).toBeTruthy(); // confirmed Aug20
  expect(queryByTestId("business-booking-3")).toBeNull(); // declined hidden
  expect(queryByTestId("business-booking-4")).toBeNull(); // past (Aug01) hidden

  // Chronological: the earlier Aug14 card is serialized before the Aug20 card.
  const tree = JSON.stringify(toJSON());
  expect(tree.indexOf("business-booking-2")).toBeLessThan(
    tree.indexOf("business-booking-1"),
  );
});

test("Confirm on a requested booking calls the status update with action 'confirm'", () => {
  mockBookings.data = [
    { id: 2, appointment_date: "2026-08-14", appointment_time: "09:00", booking_status: "requested", service_name: "Checkup", pet_name: "Milo", owner_name: "Bob" },
  ];

  const { getByTestId } = render(<BusinessBookings />);
  expect(mockAction.boundId).toBe(7); // action hook bound to the active provider

  fireEvent.press(getByTestId("business-booking-confirm-2"));
  expect(mockActionMutate).toHaveBeenCalledWith(
    { appointmentId: 2, action: "confirm" },
    expect.any(Object),
  );
});

test("a confirmed booking shows no Confirm/Decline buttons", () => {
  mockBookings.data = [
    { id: 1, appointment_date: "2026-08-20", appointment_time: "10:00", booking_status: "confirmed", service_name: "Grooming", pet_name: "Rex", owner_name: "Ana" },
  ];
  const { queryByTestId } = render(<BusinessBookings />);
  expect(queryByTestId("business-booking-confirm-1")).toBeNull();
  expect(queryByTestId("business-booking-decline-1")).toBeNull();
});

test("empty state when there are no upcoming reservations", () => {
  mockBookings.data = [];
  const { getByText } = render(<BusinessBookings />);
  expect(getByText("No upcoming bookings")).toBeTruthy();
});
