// Full past-bookings history (My Activity → Past → "See all"). Lists ALL of useMyBookings().past
// with NO cap, reusing the shared PastBookingRow so each row routes to the booking summary.
// The data hook, router, i18n and chrome are mocked; i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockMyBookings;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockMyBookings,
}));

import PastBookingsScreen from "./past-bookings";

const q = (data, extra = {}) => ({ data, isLoading: false, refetch: jest.fn(), ...extra });

const manyPast = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    provider_name: `Prov ${i}`,
    pet_name: "Mango",
    capability: "vet",
    appointment_date: "2025-01-01",
    provider_slug: `prov-${i}`,
  }));

beforeEach(() => {
  mockPush.mockReset();
  mockMyBookings = q({ upcoming: [], past: [] });
});

test("loading: shows a spinner", () => {
  mockMyBookings = { data: undefined, isLoading: true, refetch: jest.fn() };
  const { getByTestId } = render(<PastBookingsScreen />);
  expect(getByTestId("past-bookings-loading")).toBeTruthy();
});

test("empty state when there are no past bookings", async () => {
  const { getByTestId, getByText } = render(<PastBookingsScreen />);
  await waitFor(() => expect(getByTestId("past-bookings-empty")).toBeTruthy());
  expect(getByText("No past bookings")).toBeTruthy(); // activity.emptyPast
});

test("renders ALL past rows (more than 5, no cap)", async () => {
  mockMyBookings = q({ upcoming: [], past: manyPast(8) });
  const { getByTestId, queryByTestId } = render(<PastBookingsScreen />);
  await waitFor(() => expect(getByTestId("activity-past-100")).toBeTruthy());
  // Every one of the 8 rows renders — nothing is capped at 5.
  for (let i = 0; i < 8; i++) {
    expect(getByTestId(`activity-past-${100 + i}`)).toBeTruthy();
  }
  // The 6th+ rows (which My Activity would have hidden) are present here.
  expect(queryByTestId("activity-past-107")).toBeTruthy();
});

test("each row routes to the booking summary by id", async () => {
  mockMyBookings = q({ upcoming: [], past: manyPast(7) });
  const { getByTestId } = render(<PastBookingsScreen />);
  await waitFor(() => expect(getByTestId("activity-past-106")).toBeTruthy());
  fireEvent.press(getByTestId("activity-past-106"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/booking-summary",
    params: { id: 106 },
  });
});
