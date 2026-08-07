// Place shell (storefront redesign PR-4): the place detail renders Overview + Reviews behind a
// tab bar. Panels are MOUNTED-BUT-HIDDEN (display:none) so every existing testID resolves in a
// single render; the tab bar + the tappable rating summary switch which one is visible.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockParams;
let mockDetail;
let mockReviews;
let mockProfileId;

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
  usePlaceDetail: () => mockDetail,
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
jest.mock("@/components/Places/PlaceReviewModal", () => () => null);

import PlaceScreen from "./place";

const PLACE = { id: "curated-x", name: "Cafe X", category: "cafe", neighborhood: "Palermo", address: "Calle 1", lat: -34.6, lng: -58.4 };
const AGGREGATES = {
  overall_avg: 4.5,
  overall_count: 2,
  welcome: { distribution: { royalty: 1 }, top_level: "royalty" },
  amenities: { count_by_key: { water_bowls: 2 } },
};
const REVIEW = { id: 1, owner_user_id: 7, reviewer_name: "Ana", overall_rating: 5, pet_welcome_level: "royalty", amenities: [], comment: "Great spot", created_at: "2026-01-02T00:00:00Z" };

const display = (el) => el.props.style?.display;

beforeEach(() => {
  mockParams = { id: "curated-x" };
  mockDetail = { data: PLACE, isLoading: false, isError: false };
  mockReviews = { data: { reviews: [REVIEW], aggregates: AGGREGATES } };
  mockProfileId = 999;
});

test("renders both tabs and mounts both panels (Overview active, Reviews hidden)", () => {
  const { getByTestId } = render(<PlaceScreen />);
  expect(getByTestId("place-tab-overview")).toBeTruthy();
  expect(getByTestId("place-tab-reviews")).toBeTruthy();
  expect(display(getByTestId("place-panel-overview"))).toBe("flex");
  expect(display(getByTestId("place-panel-reviews"))).toBe("none");
  // Both panels' content resolves even while hidden (mounted-hidden).
  expect(getByTestId("place-most-owners")).toBeTruthy(); // Overview
  expect(getByTestId("place-review-1")).toBeTruthy(); // Reviews (hidden)
});

test("pressing the Reviews tab switches the visible panel", () => {
  const { getByTestId } = render(<PlaceScreen />);
  fireEvent.press(getByTestId("place-tab-reviews"));
  expect(display(getByTestId("place-panel-reviews"))).toBe("flex");
  expect(display(getByTestId("place-panel-overview"))).toBe("none");
});

test("the header rating summary jumps to the Reviews tab", () => {
  const { getByTestId } = render(<PlaceScreen />);
  expect(display(getByTestId("place-panel-reviews"))).toBe("none");
  fireEvent.press(getByTestId("place-rating-summary"));
  expect(display(getByTestId("place-panel-reviews"))).toBe("flex");
});
