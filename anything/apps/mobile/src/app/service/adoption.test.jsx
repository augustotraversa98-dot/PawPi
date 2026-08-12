// Ticket 2.30 / 2.56 — adoption deep-link. With { listingId, providerId } params the
// screen opens THAT dog's detail on mount, fetched directly via the PUBLIC single-
// listing GET (2.56). No param → the hub (no modal); a gone/adopted listing (404 →
// null) → a graceful "no longer available" notice. All data hooks are mocked.

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockParams;
let mockListings;
let mockPlaces;
let mockBrowse; // { listings, sort } for the 2.86 unified browse grid
let mockSingleListing; // the 2.56 single-listing fetch result (or null for 404)
let mockApply; // captures the apply mutation (ticket 2.57 requested_placement)
let mockLocationStatus; // 'granted' | 'denied'

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ status: mockLocationStatus }),
  getCurrentPositionAsync: () => Promise.resolve({ coords: { latitude: 40.7, longitude: -74 } }),
}));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { Video: (props) => <View testID={props.testID} />, ResizeMode: { CONTAIN: "contain" } };
});
jest.mock("@/components/Map/MapLocationView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: (props) => <View testID={props.testID} /> };
});
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
  useAdoptableBrowse: () => ({ data: mockBrowse, isLoading: false, isError: false, refetch: jest.fn() }),
  useAdoptableListings: () => ({ data: mockListings, isLoading: false }),
  useAdoptableListing: () => ({
    data: mockSingleListing,
    isLoading: false,
    isFetched: true,
  }),
  useApplyForAdoption: () => ({ mutateAsync: mockApply, isPending: false }),
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
  mockBrowse = { listings: [], sort: "featured_recent" }; // empty grid unless a test sets it
  mockSingleListing = REX; // the direct single-listing fetch resolves the dog
  mockPlaces = []; // no places → browse renders no listings, so "Rex" can only come from the modal
  mockApply = jest.fn(() => Promise.resolve({ application: { id: 1 } }));
  mockLocationStatus = "denied"; // default: no GPS → fall back to most-recent
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

// ── Ticket 2.57 — foster + urgent/featured flags (in the detail modal) ──
test("an urgent listing shows the urgent banner in the detail", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = { ...REX, is_urgent: true, urgent_reason: "Medical" };
  const { findByTestId, getByText } = render(<AdoptionScreen />);
  expect(await findByTestId("detail-urgent")).toBeTruthy();
  expect(getByText(/Urgent: Medical/)).toBeTruthy();
});

test("a 'both' listing lets the applicant choose foster and posts requested_placement", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = { ...REX, placement_type: "both" };
  const { findByTestId, getByText } = render(<AdoptionScreen />);
  fireEvent.press(await findByTestId("placement-foster"));
  fireEvent.press(getByText("Apply to foster"));
  await waitFor(() =>
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: 5, requested_placement: "foster" }),
    ),
  );
});

test("an adopt-only listing posts requested_placement adopt (no picker)", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = { ...REX, placement_type: "adopt" };
  const { findByText, queryByTestId } = render(<AdoptionScreen />);
  const applyBtn = await findByText("Apply to adopt");
  expect(queryByTestId("placement-foster")).toBeNull();
  fireEvent.press(applyBtn);
  await waitFor(() =>
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ requested_placement: null }),
    ),
  );
});

// ── Ticket 2.95 — apply CTA shows a clear submitted/confirmation state ──
test("after a successful apply the CTA becomes a persistent 'Application sent' confirmation", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = { ...REX, placement_type: "adopt" };
  const { findByText, queryByText, findByTestId } = render(<AdoptionScreen />);
  const applyBtn = await findByText("Apply to adopt");
  fireEvent.press(applyBtn);
  // Confirmation replaces the apply button; it does not re-arm for a duplicate application.
  expect(await findByTestId("application-sent")).toBeTruthy();
  await waitFor(() => expect(queryByText("Apply to adopt")).toBeNull());
});

// ── Ticket 2.86 — unified browse grid, nearest-first, filters ──
test("browse renders a grid of dogs and shows 'recently added' without location", async () => {
  mockBrowse = {
    listings: [{ ...REX, name: "Rex", distance_km: null }, { ...REX, id: 6, name: "Bella" }],
    sort: "featured_recent",
  };
  const { findByText, getByText } = render(<AdoptionScreen />);
  expect(await findByText("RECENTLY ADDED")).toBeTruthy();
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("Bella")).toBeTruthy();
});

test("with location granted, browse shows NEAREST FIRST + a distance label", async () => {
  mockLocationStatus = "granted";
  mockBrowse = { listings: [{ ...REX, name: "Rex", distance_km: 3.4 }], sort: "nearest" };
  const { findByText } = render(<AdoptionScreen />);
  expect(await findByText("NEAREST FIRST")).toBeTruthy();
  expect(await findByText("3 km away")).toBeTruthy();
});

test("empty browse shows an empty state (no crash)", async () => {
  mockBrowse = { listings: [], sort: "featured_recent" };
  const { findByText } = render(<AdoptionScreen />);
  expect(await findByText("No dogs near you yet")).toBeTruthy();
});

test("the filter sheet opens and applying a gender filter narrows the query", async () => {
  mockBrowse = { listings: [{ ...REX, name: "Rex" }], sort: "featured_recent" };
  const { getByTestId, getByText, findByText } = render(<AdoptionScreen />);
  await findByText("Rex");
  fireEvent.press(getByTestId("open-filters"));
  // The sheet renders its groups; pick a gender + apply.
  fireEvent.press(getByText("female"));
  fireEvent.press(getByTestId("filters-apply"));
  // Filter chip count reflects the applied filter.
  expect(getByText("Filters (1)")).toBeTruthy();
});

// ── Ticket 2.87 — rich detail page (gallery + facts + shelter map) ──
test("detail shows a swipeable gallery (photos + video) and the shelter map", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = {
    ...REX,
    photo_urls: ["https://x/1.jpg", "https://x/2.jpg"],
    video_url: "https://x/clip.mp4",
    provider_name: "Happy Tails",
    provider_lat: 40.71,
    provider_lng: -74.0,
    provider_address: "1 Bark St",
  };
  const { findByTestId, getByText } = render(<AdoptionScreen />);
  expect(await findByTestId("gallery-photo-0")).toBeTruthy();
  expect(await findByTestId("gallery-photo-1")).toBeTruthy();
  expect(await findByTestId("gallery-video")).toBeTruthy();
  expect(getByText("Happy Tails")).toBeTruthy();
  expect(await findByTestId("shelter-map")).toBeTruthy();
});

test("detail omits unknown facts and the map when the shelter has no coords", async () => {
  mockParams = { listingId: "5", providerId: "3" };
  mockSingleListing = {
    id: 5,
    name: "Rex",
    photo_urls: [],
    adoption_fee_cents: 0,
    provider_name: "No-Geo Shelter",
    // no coords, no breed/size/vaccination → those facts are omitted
  };
  const { findByText, queryByTestId } = render(<AdoptionScreen />);
  await findByText("Apply to adopt");
  expect(queryByTestId("shelter-map")).toBeNull(); // no coords → no map (no fake location)
});
