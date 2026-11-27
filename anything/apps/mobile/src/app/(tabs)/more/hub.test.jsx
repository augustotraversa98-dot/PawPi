// Render pins for the SLIMMED My Hub screen (two-pane redesign): bookings, orders,
// auto-reorder and pet-friendly places moved to the Services tab's "My Activity" pane, so My
// Hub now keeps only the account-scoped sections:
//   - Who has access (the same list Data Access shows → /(tabs)/more/data-access)
//   - Saved dogs     (adoption favorites → /service/adoption)
// This asserts the kept sections render + link, empty states show, the count is the number of
// entries in that list, and the moved sections are GONE. Data hooks, router and chrome are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();

let mockAccess;
let mockFavorites;
let mockFollowed = [];

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
  useFollowedProviders: () => ({ data: mockFollowed, isLoading: false }),
}));
jest.mock("@/hooks/useWhoHasAccess", () => ({ useWhoHasAccess: () => mockAccess }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 1 } }) }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import MyHubScreen from "./hub";

function stub(data) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockPush.mockReset();
  mockAccess = stub({ entries: [], partial: false });
  mockFavorites = stub([]);
  mockFollowed = [];
});

describe("MyHubScreen (slimmed)", () => {
  it("renders the kept sections' owner-scoped rows", () => {
    mockAccess = stub({
      entries: [{ kind: "vet", id: 3, pet_id: 1, provider_name: "Dr. Smith", pet_name: "Rex", expires_at: null }],
      partial: false,
    });
    mockFavorites = stub([
      { id: 7, listing_name: "Buddy", listing_breed: "Lab", provider_name: "Shelter", listing_status: "available" },
    ]);

    const { getByText } = render(<MyHubScreen />);
    expect(getByText("Who has access")).toBeTruthy();
    expect(getByText("Dr. Smith")).toBeTruthy();
    expect(getByText("Saved dogs")).toBeTruthy();
    expect(getByText("Buddy")).toBeTruthy();
  });

  it("names stored business types and listing statuses instead of showing their ids", () => {
    mockFollowed = [{ id: 4, name: "Patitas", provider_type: "walker" }];
    mockFavorites = stub([
      { id: 7, listing_name: "Buddy", listing_breed: "Beagle", provider_name: "Shelter", listing_status: "adopted" },
    ]);

    const { getByText, queryByText } = render(<MyHubScreen />);
    expect(getByText("Walking")).toBeTruthy();
    expect(getByText("Adopted")).toBeTruthy();
    expect(queryByText("walker")).toBeNull();
    expect(queryByText("adopted")).toBeNull();
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

  it("counts every entry of every kind, shows four and says how many more", () => {
    const entry = (over) => ({ pet_id: 1, pet_name: "Rex", expires_at: null, ...over });
    mockAccess = stub({
      entries: [
        entry({ kind: "vet", id: 1, provider_name: "North Clinic" }),
        entry({ kind: "record_link", id: 2 }),
        entry({ kind: "emergency_link", id: 3, pet_id: 2, pet_name: "Luna" }),
        entry({ kind: "family", id: 4, grantee_username: "maria" }),
        entry({ kind: "vet", id: 5, provider_name: "South Clinic", pet_id: 2, pet_name: "Luna" }),
      ],
      partial: false,
    });

    const { getByText, queryByText } = render(<MyHubScreen />);
    expect(getByText("5")).toBeTruthy();
    expect(getByText("North Clinic")).toBeTruthy();
    expect(getByText("Link anyone can open")).toBeTruthy();
    expect(getByText("@maria")).toBeTruthy();
    expect(getByText("Emergency card link")).toBeTruthy();
    // The other dog's entries come after the dog on screen.
    expect(queryByText("South Clinic")).toBeNull();
    expect(getByText("1 more")).toBeTruthy();
  });

  it("while the list cannot be read, shows no count and never says nobody has access", () => {
    mockAccess = { data: undefined, isLoading: false, isError: true, refetch: jest.fn() };

    const { getByText, queryByText } = render(<MyHubScreen />);
    expect(getByText("Couldn't load who has access.")).toBeTruthy();
    expect(queryByText("No one has access to your pets.")).toBeNull();
  });
});
