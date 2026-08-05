// Storefront "Leave a review" CTA: shown ONLY when the signed-in owner has a COMPLETED
// booking with THIS provider (from useMyBookings().past). Tapping it opens the shared
// WriteReviewModal with this provider + the pet from that booking. Hidden when there is no
// eligible booking. The data hooks, router, i18n and heavy child components are mocked;
// i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProfile;
let mockBookings;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: "happy-paws" }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/BookingFormModal", () => () => null);
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/components/Providers/StorefrontCatalog", () => () => null);
// Stub the review modal: reflect `visible` + the props it was handed.
jest.mock("@/components/Providers/WriteReviewModal", () => {
  const { View, Text } = require("react-native");
  return ({ visible, providerId, petId }) =>
    visible ? (
      <View testID="write-review-modal">
        <Text testID="review-provider-id">{String(providerId)}</Text>
        <Text testID="review-pet-id">{String(petId)}</Text>
      </View>
    ) : null;
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 99, name: "Active" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => mockBookings,
}));

import ProviderScreen from "./provider";

const PROVIDER = { id: 1, slug: "happy-paws", name: "Happy Paws Clinic", provider_type: "vet" };
const profile = {
  data: { provider: PROVIDER, locations: [], services: [] },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

beforeEach(() => {
  mockProfile = profile;
  mockBookings = { data: { upcoming: [], past: [] } };
});

test("CTA hidden when the owner has no completed booking with this provider", () => {
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-review-cta")).toBeNull();
});

test("CTA hidden when a booking with this provider is NOT completed", () => {
  mockBookings = {
    data: { upcoming: [], past: [{ id: 5, provider_id: 1, pet_id: 3, status: "cancelled" }] },
  };
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-review-cta")).toBeNull();
});

test("CTA hidden when the completed booking is with a DIFFERENT provider", () => {
  mockBookings = {
    data: { upcoming: [], past: [{ id: 5, provider_id: 2, pet_id: 3, status: "completed" }] },
  };
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-review-cta")).toBeNull();
});

test("CTA shown for a completed booking with this provider, and opens the modal with the booking's pet", () => {
  mockBookings = {
    data: {
      upcoming: [],
      past: [{ id: 5, provider_id: 1, pet_id: 3, status: "completed" }],
    },
  };
  const { getByTestId, queryByTestId } = render(<ProviderScreen />);
  const cta = getByTestId("storefront-review-cta");
  expect(cta).toBeTruthy();
  expect(queryByTestId("write-review-modal")).toBeNull(); // closed initially

  fireEvent.press(cta);
  expect(getByTestId("write-review-modal")).toBeTruthy();
  expect(getByTestId("review-provider-id").props.children).toBe("1");
  // Filed under the pet from THAT booking (not necessarily the active pet).
  expect(getByTestId("review-pet-id").props.children).toBe("3");
});

test("matches even when the ids are string vs number (porsager)", () => {
  mockProfile = {
    ...profile,
    data: { ...profile.data, provider: { ...PROVIDER, id: "1" } },
  };
  mockBookings = {
    data: { upcoming: [], past: [{ id: 5, provider_id: 1, pet_id: 3, status: "completed" }] },
  };
  const { getByTestId } = render(<ProviderScreen />);
  expect(getByTestId("storefront-review-cta")).toBeTruthy();
});
