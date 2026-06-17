// Render pins for the owner's My Hub screen (ticket 2.14):
//   - each section renders its owner-scoped rows (bookings across services, shop orders,
//     auto-reorder subs, who-has-access, saved dogs);
//   - tapping a linkable section navigates INTO the existing per-feature screen (no duplication);
//   - all-empty data shows each section's empty state (no fake metrics);
//   - only ACTIVE subscriptions + active/non-expired grants are surfaced.
// The data hooks, router, and chrome are mocked — this exercises wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();

let mockBookings;
let mockOrders;
let mockSubs;
let mockGrants;
let mockFavorites;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockBookings,
  useShopOrders: () => mockOrders,
  useShopSubscriptions: () => mockSubs,
  useAdoptionFavorites: () => mockFavorites,
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useAllCareAccessGrants: () => mockGrants,
}));

import MyHubScreen from "./hub";

const FUTURE = "2999-01-01";
const PAST = "2000-01-01";

function stub(data) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockPush.mockReset();
  mockBookings = stub({ upcoming: [], past: [] });
  mockOrders = stub([]);
  mockSubs = stub([]);
  mockGrants = stub([]);
  mockFavorites = stub([]);
});

describe("MyHubScreen", () => {
  it("renders owner-scoped rows across the sections", () => {
    mockBookings = stub({
      upcoming: [
        {
          id: 1,
          provider_name: "Vet A",
          pet_name: "Rex",
          service_name: "Checkup",
          appointment_date: "2026-07-01",
          booking_status: "confirmed",
        },
      ],
      past: [],
    });
    mockOrders = stub([
      { id: 5, provider_name: "Shop B", amount_cents: 5000, currency: "ARS", created_at: "2026-06-01", status: "paid" },
    ]);
    mockSubs = stub([
      { id: 9, product_name: "Kibble", plan: "monthly", quantity: 2, status: "active" },
    ]);
    mockGrants = stub([
      { id: 3, provider_name: "Dr. Smith", pet_name: "Rex", status: "active", expires_at: null },
    ]);
    mockFavorites = stub([
      { id: 7, listing_name: "Buddy", listing_breed: "Lab", provider_name: "Shelter", listing_status: "available" },
    ]);

    const { getByText } = render(<MyHubScreen />);

    expect(getByText("My bookings")).toBeTruthy();
    expect(getByText(/Vet A · Rex/)).toBeTruthy();
    expect(getByText(/Shop B/)).toBeTruthy();
    expect(getByText("Kibble")).toBeTruthy();
    expect(getByText("Dr. Smith")).toBeTruthy();
    expect(getByText("Buddy")).toBeTruthy();
  });

  it("links into the existing per-feature screens (no duplication)", () => {
    render(<MyHubScreen />);
    fireEvent.press(render(<MyHubScreen />).getByText("My orders"));
    expect(mockPush).toHaveBeenCalledWith("/service/shop");

    fireEvent.press(render(<MyHubScreen />).getByText("Who has access"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/data-access");

    fireEvent.press(render(<MyHubScreen />).getByText("Saved dogs"));
    expect(mockPush).toHaveBeenCalledWith("/service/adoption");
  });

  it("shows empty states with no data (no fake metrics)", () => {
    const { getByText } = render(<MyHubScreen />);
    expect(getByText("No bookings yet.")).toBeTruthy();
    expect(getByText("No orders yet.")).toBeTruthy();
    expect(getByText("No active auto-reorder plans.")).toBeTruthy();
    expect(getByText("No one has access to your pets.")).toBeTruthy();
    expect(getByText("No saved adoption listings.")).toBeTruthy();
  });

  it("surfaces only ACTIVE subs and active, non-expired grants", () => {
    mockSubs = stub([
      { id: 1, product_name: "Active plan", plan: "monthly", quantity: 1, status: "active" },
      { id: 2, product_name: "Cancelled plan", plan: "monthly", quantity: 1, status: "cancelled" },
    ]);
    mockGrants = stub([
      { id: 1, provider_name: "Current", pet_name: "Rex", status: "active", expires_at: FUTURE },
      { id: 2, provider_name: "Expired", pet_name: "Rex", status: "active", expires_at: PAST },
      { id: 3, provider_name: "Revoked", pet_name: "Rex", status: "revoked", expires_at: null },
    ]);

    const { getByText, queryByText } = render(<MyHubScreen />);
    expect(getByText("Active plan")).toBeTruthy();
    expect(queryByText("Cancelled plan")).toBeNull();
    expect(getByText("Current")).toBeTruthy();
    expect(queryByText("Expired")).toBeNull();
    expect(queryByText("Revoked")).toBeNull();
  });
});
