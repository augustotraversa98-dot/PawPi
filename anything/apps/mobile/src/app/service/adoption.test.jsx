// Ticket 2.30 — adoption deep-link. With { listingId, providerId } params the screen
// opens THAT dog's detail on mount (fetched via the public listings list); no param →
// the hub (no modal); a missing/adopted listing → a graceful "no longer available"
// notice. All data hooks are mocked.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockParams;
let mockListings;
let mockPlaces;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: () => ({ data: mockPlaces, isLoading: false, isError: false, refetch: jest.fn() }),
  useAdoptableListings: () => ({ data: mockListings, isLoading: false }),
  useApplyForAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMyAdoptionApplications: () => ({ data: [] }),
  useAdoptionFavorites: () => ({ data: [] }),
  useToggleAdoptionFavorite: () => ({ mutate: jest.fn() }),
  useAdoptionCheckout: () => ({ mutateAsync: jest.fn() }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
}));

import AdoptionScreen from "./adoption";

const REX = {
  id: 5,
  provider_id: 3,
  name: "Rex",
  breed: "Lab",
  age_years: 2,
  gender: "male",
  adoption_fee_cents: 0,
  photo_urls: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockListings = [REX];
  mockPlaces = []; // no places → browse renders no listings, so "Rex" can only come from the modal
});

test("deep-link param opens that dog's detail modal on mount", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  const { getByText, getAllByText } = render(<AdoptionScreen />);
  await waitFor(() => expect(getByText("Apply to adopt")).toBeTruthy());
  expect(getAllByText("Rex").length).toBeGreaterThan(0);
});

test("no param → the hub, no detail modal", () => {
  mockParams = {};
  const { queryByText } = render(<AdoptionScreen />);
  expect(queryByText("Apply to adopt")).toBeNull();
});

test("a missing/adopted listing shows a graceful notice, no modal", async () => {
  mockParams = { listingId: "99", providerId: "3" }; // not in the list
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { queryByText } = render(<AdoptionScreen />);
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect(queryByText("Apply to adopt")).toBeNull();
});
