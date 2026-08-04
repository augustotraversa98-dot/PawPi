// Render pins for the SLIMMED My Hub screen (two-pane redesign): bookings, orders,
// auto-reorder and pet-friendly places moved to the Services tab's "My Activity" pane, so My
// Hub now keeps only the account-scoped sections:
//   - Who has access (care-access grants → /(tabs)/more/data-access)
//   - Saved dogs     (adoption favorites → /service/adoption)
// This asserts the kept sections render + link, empty states show, only active/non-expired
// grants surface, and the moved sections are GONE. Data hooks, router and chrome are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();

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
  mockGrants = stub([]);
  mockFavorites = stub([]);
});

describe("MyHubScreen (slimmed)", () => {
  it("renders the kept sections' owner-scoped rows", () => {
    mockGrants = stub([
      { id: 3, provider_name: "Dr. Smith", pet_name: "Rex", status: "active", expires_at: null },
    ]);
    mockFavorites = stub([
      { id: 7, listing_name: "Buddy", listing_breed: "Lab", provider_name: "Shelter", listing_status: "available" },
    ]);

    const { getByText } = render(<MyHubScreen />);
    expect(getByText("Who has access")).toBeTruthy();
    expect(getByText("Dr. Smith")).toBeTruthy();
    expect(getByText("Saved dogs")).toBeTruthy();
    expect(getByText("Buddy")).toBeTruthy();
  });

  it("no longer renders the sections moved to the Services tab", () => {
    const { queryByText } = render(<MyHubScreen />);
    expect(queryByText("My bookings")).toBeNull();
    expect(queryByText("My orders")).toBeNull();
    expect(queryByText("Auto-reorder")).toBeNull();
    expect(queryByText("Pet-friendly places")).toBeNull();
  });

  it("links the kept sections into their existing screens", () => {
    fireEvent.press(render(<MyHubScreen />).getByText("Who has access"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/data-access");

    fireEvent.press(render(<MyHubScreen />).getByText("Saved dogs"));
    expect(mockPush).toHaveBeenCalledWith("/service/adoption");
  });

  it("shows empty states with no data (no fake metrics)", () => {
    const { getByText } = render(<MyHubScreen />);
    expect(getByText("No one has access to your pets.")).toBeTruthy();
    expect(getByText("No saved adoption listings.")).toBeTruthy();
  });

  it("surfaces only active, non-expired grants", () => {
    mockGrants = stub([
      { id: 1, provider_name: "Current", pet_name: "Rex", status: "active", expires_at: FUTURE },
      { id: 2, provider_name: "Expired", pet_name: "Rex", status: "active", expires_at: PAST },
      { id: 3, provider_name: "Revoked", pet_name: "Rex", status: "revoked", expires_at: null },
    ]);

    const { getByText, queryByText } = render(<MyHubScreen />);
    expect(getByText("Current")).toBeTruthy();
    expect(queryByText("Expired")).toBeNull();
    expect(queryByText("Revoked")).toBeNull();
  });
});
