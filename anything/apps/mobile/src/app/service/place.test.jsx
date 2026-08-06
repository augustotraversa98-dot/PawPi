// Place DETAIL screen: renders PawPi's own place + two-dimension review aggregates, the review list,
// an empty state, a Rate/Edit CTA that opens PlaceReviewModal, and edit-prefill when the caller has
// already reviewed. Also proves a deep-link render of /service/place?id=<real seeded id>. Data hooks,
// router, i18n, icons and the heavy modal are mocked; i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockParams;
let mockDetail;
let mockReviews;
let mockProfileId;
let lastDetailId;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/usePlaceReviews", () => ({
  usePlaceDetail: (id) => {
    lastDetailId = id;
    return mockDetail;
  },
  usePlaceReviews: () => mockReviews,
}));
jest.mock("@/hooks/useUserProfile", () => ({
  useMyProfileId: () => ({ data: mockProfileId }),
}));
jest.mock("@/hooks/usePlaces", () => ({
  useSavedPlaces: () => ({ data: [] }),
  useSavePlace: () => ({ mutate: jest.fn() }),
  useUnsavePlace: () => ({ mutate: jest.fn() }),
}));
// Stub the modal: reflect `visible` + whether an existing review was handed in (edit vs new).
jest.mock("@/components/Places/PlaceReviewModal", () => {
  const { View, Text } = require("react-native");
  return ({ visible, existing }) =>
    visible ? (
      <View testID="place-review-modal-stub">
        <Text testID="modal-existing">{existing ? "edit" : "new"}</Text>
      </View>
    ) : null;
});

import PlaceScreen from "./place";

const PLACE = {
  id: "curated-x",
  name: "Cafe X",
  category: "cafe",
  neighborhood: "Palermo",
  address: "Calle 1",
  lat: -34.6,
  lng: -58.4,
};

const AGGREGATES = {
  overall_avg: 4.5,
  overall_count: 2,
  welcome: { distribution: { royalty: 1, allowed: 1 }, top_level: "royalty" },
  amenities: { count_by_key: { water_bowls: 2, treats: 1 } },
};

const REVIEW = {
  id: 1,
  owner_user_id: 7,
  reviewer_name: "Ana",
  overall_rating: 5,
  pet_welcome_level: "royalty",
  amenities: ["water_bowls"],
  comment: "Great spot",
  created_at: "2026-01-02T00:00:00Z",
};

beforeEach(() => {
  mockParams = { id: "curated-x" };
  mockDetail = { data: PLACE, isLoading: false, isError: false };
  mockReviews = { data: { reviews: [REVIEW], aggregates: AGGREGATES } };
  mockProfileId = 999; // not the reviewer by default
});

test("renders aggregates: overall, most-owners tier, distribution + amenity tallies", () => {
  const { getByTestId, getByText, getAllByText, queryByTestId } = render(<PlaceScreen />);

  // Name shows in both the header bar and the header card.
  expect(getAllByText("Cafe X").length).toBeGreaterThanOrEqual(1);
  expect(getByTestId("place-most-owners")).toBeTruthy();
  // Dominant tier label resolved from i18n (appears in the most-owners line + distribution).
  expect(getAllByText(/Treated like royalty/).length).toBeGreaterThanOrEqual(1);
  // Distribution + amenity tallies with counts.
  expect(getByTestId("place-welcome-dist-royalty").props.children).toContain(1);
  expect(getByTestId("place-amenity-tally-water_bowls").props.children).toContain(2);
  // Not the empty state.
  expect(queryByTestId("place-reviews-empty")).toBeNull();
});

test("renders the review list", () => {
  const { getByTestId, getByText } = render(<PlaceScreen />);
  expect(getByTestId("place-review-1")).toBeTruthy();
  expect(getByText("Ana")).toBeTruthy();
  expect(getByText("Great spot")).toBeTruthy();
});

test("empty state when there are no reviews", () => {
  mockReviews = {
    data: {
      reviews: [],
      aggregates: {
        overall_avg: null,
        overall_count: 0,
        welcome: { distribution: {}, top_level: null },
        amenities: { count_by_key: {} },
      },
    },
  };
  const { getByTestId, getByText } = render(<PlaceScreen />);
  expect(getByTestId("place-reviews-empty")).toBeTruthy();
  expect(getByText("No pet reviews yet — be the first.")).toBeTruthy();
});

test("CTA opens the review modal (new review by default)", () => {
  const { getByTestId, getByText, queryByTestId } = render(<PlaceScreen />);
  expect(getByText("Rate this place")).toBeTruthy();
  expect(queryByTestId("place-review-modal-stub")).toBeNull();

  fireEvent.press(getByTestId("place-rate-cta"));
  expect(getByTestId("place-review-modal-stub")).toBeTruthy();
  expect(getByTestId("modal-existing").props.children).toBe("new");
});

test("edit-prefill: when the caller already reviewed, CTA says Edit and the modal gets the existing review", () => {
  mockProfileId = 7; // matches REVIEW.owner_user_id
  const { getByTestId, getByText } = render(<PlaceScreen />);

  expect(getByText("Edit your review")).toBeTruthy();
  fireEvent.press(getByTestId("place-rate-cta"));
  expect(getByTestId("modal-existing").props.children).toBe("edit");
});

test("matches my review even when ids are string vs number (porsager)", () => {
  mockProfileId = "7";
  const { getByText } = render(<PlaceScreen />);
  expect(getByText("Edit your review")).toBeTruthy();
});

test("deep-link render of /service/place?id=<real seeded id>", () => {
  const seededId = "curated-oveja-negra-san-isidro";
  mockParams = { id: seededId };
  mockDetail = {
    data: { ...PLACE, id: seededId, name: "Oveja Negra" },
    isLoading: false,
    isError: false,
  };
  const { getAllByText } = render(<PlaceScreen />);
  // The route param flows into the detail fetch key…
  expect(lastDetailId).toBe(seededId);
  // …and the screen renders that place.
  expect(getAllByText("Oveja Negra").length).toBeGreaterThanOrEqual(1);
});

test("not-found state when the place fails to load", () => {
  mockDetail = { data: null, isLoading: false, isError: true };
  const { getByTestId, getByText } = render(<PlaceScreen />);
  expect(getByTestId("place-not-found")).toBeTruthy();
  expect(getByText("Place not found")).toBeTruthy();
});
