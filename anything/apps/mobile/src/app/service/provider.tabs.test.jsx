// Storefront shell (redesign Phase 1, PR-1): the provider screen renders section panels
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
// behind a horizontal tab bar. Panels are MOUNTED-BUT-HIDDEN (display:none) so every section
// stays in the tree; the tab bar + the tappable rating summary switch which one is visible.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProfile;

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
jest.mock("@/components/Providers/WriteReviewModal", () => () => null);
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/components/Providers/StorefrontCatalog", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => ({ data: { upcoming: [], past: [] } }),
  useShopProducts: () => ({ data: [], isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useShopOrders: () => ({ data: [] }),
}));

import ProviderScreen from "./provider";

// A bookable vet with services + posts + locations → tabs: services, posts, reviews, locations, about.
function vetProfile() {
  return {
    data: {
      provider: { id: 1, slug: "happy-paws", name: "Happy Paws", provider_type: "vet" },
      capabilities: ["vet"],
      services: [{ id: 10, name: "Checkup", price_cents: 3000, image_urls: [] }],
      products: [],
      posts: [{ id: 30, body: "Hello", image_urls: [], author_user_id: 99, is_own: false }],
      locations: [{ id: 8, name: "Main Clinic", address: "1 St" }],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

const display = (el) => el.props.style?.display;

test("renders a tab per resolved section and mounts every panel (hidden ones included)", () => {
  mockProfile = vetProfile();
  const { getByTestId } = render(<ProviderScreen />);
  // Tab bar pills.
  for (const key of ["services", "posts", "reviews", "locations", "about"]) {
    expect(getByTestId(`storefront-tab-${key}`)).toBeTruthy();
    // Panel is mounted regardless of active state.
    expect(getByTestId(`storefront-panel-${key}`)).toBeTruthy();
  }
});

test("the first tab is visible and the rest are mounted-but-hidden", () => {
  mockProfile = vetProfile();
  const { getByTestId } = render(<ProviderScreen />);
  expect(display(getByTestId("storefront-panel-services"))).toBe("flex");
  expect(display(getByTestId("storefront-panel-posts"))).toBe("none");
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("none");
});

test("pressing a tab switches which panel is visible", () => {
  mockProfile = vetProfile();
  const { getByTestId } = render(<ProviderScreen />);
  fireEvent.press(getByTestId("storefront-tab-reviews"));
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("flex");
  expect(display(getByTestId("storefront-panel-services"))).toBe("none");
});

test("the store header's rating summary jumps to the Reviews tab", () => {
  mockProfile = vetProfile();
  const { getByTestId } = render(<ProviderScreen />);
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("none");
  fireEvent.press(getByTestId("storefront-rating-summary"));
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("flex");
});
