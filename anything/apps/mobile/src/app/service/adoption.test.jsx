// Ticket 2.30 / 2.56 — adoption deep-link. With { listingId, providerId } params the
// screen opens THAT dog's detail on mount, fetched directly via the PUBLIC single-
// listing GET (2.56). No param → the hub (no modal); a gone/adopted listing (404 →
// null) → a graceful "no longer available" notice. All data hooks are mocked.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockParams;
let mockListings;
let mockPlaces;
let mockSingleListing; // the 2.56 single-listing fetch result (or null for 404)

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
  useAdoptableListing: () => ({
    data: mockSingleListing,
    isLoading: false,
    isFetched: true,
  }),
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
  mockSingleListing = REX; // the direct single-listing fetch resolves the dog
  mockPlaces = []; // no places → browse renders no listings, so "Rex" can only come from the modal
});

test("deep-link param opens that dog's detail modal on mount (direct fetch)", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  const { getByText, getAllByText } = render(<AdoptionScreen />);
  await waitFor(() => expect(getByText("Apply to adopt")).toBeTruthy());
  expect(getAllByText("Rex").length).toBeGreaterThan(0);
});

test("opens a dog that is NOT in the browse list (single fetch resolves it)", async () => {
  // The place's browse list is empty, but the direct 2.56 fetch still resolves it.
  mockListings = [];
  mockParams = { listingId: "5", providerId: "3" };
  const { getByText } = render(<AdoptionScreen />);
  await waitFor(() => expect(getByText("Apply to adopt")).toBeTruthy());
});

test("no param → the hub, no detail modal", () => {
  mockParams = {};
  const { queryByText } = render(<AdoptionScreen />);
  expect(queryByText("Apply to adopt")).toBeNull();
});

test("a gone/adopted listing (404 → null) shows a graceful notice, no modal", async () => {
  mockParams = { listingId: "99", providerId: "3" };
  mockSingleListing = null; // the public GET 404'd
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { queryByText } = render(<AdoptionScreen />);
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect(queryByText("Apply to adopt")).toBeNull();
});
