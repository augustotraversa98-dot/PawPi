// "Order again" rail (storefront enhancement): above the Items grid, the distinct products this
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
// buyer previously ordered FROM THIS PROVIDER that are still available, each a quick-add card.
// Client-derived from useShopOrders — real data only, hidden when there's no usable history.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProfile;
let mockShopProducts;
let mockOrders;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: "paws-store" }),
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
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
// Shared adoption listing views (ticket 2.97) pull in expo-av + the map view.
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { Video: (props) => <View testID={props.testID} />, ResizeMode: { CONTAIN: "contain" } };
});
jest.mock("@/components/Map/MapLocationView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: (props) => <View testID={props.testID} /> };
});
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => ({ data: { upcoming: [], past: [] } }),
  useShopProducts: () => ({ data: mockShopProducts, isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useShopOrders: () => ({ data: mockOrders }),
  useAdoptableBrowse: () => ({ data: { listings: [] } }),
  useApplyForAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAdoptionCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import ProviderScreen from "./provider";

// A pure shop (provider id 1) → the Items tab is the default active panel.
function shopProfile() {
  return {
    data: {
      provider: { id: 1, slug: "paws-store", name: "Paws Store" },
      capabilities: ["shop"],
      services: [],
      products: [{ id: 5, name: "Kibble" }],
      posts: [],
      locations: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  mockProfile = shopProfile();
  mockShopProducts = [
    { id: 5, name: "Kibble", price_cents: 500000, currency: "ARS", stock_qty: 5, image_urls: [] },
    { id: 6, name: "Leash", price_cents: 120000, currency: "ARS", stock_qty: 3, image_urls: [] },
  ];
  mockOrders = [];
});

test("shows a previously-ordered available product in the rail; quick-add adds to the cart", () => {
  mockOrders = [
    { id: 100, provider_id: 1, created_at: "2026-08-01", items: [{ product_id: 5, name: "Kibble" }] },
  ];
  const { getByTestId, queryByTestId } = render(<ProviderScreen />);
  expect(getByTestId("storefront-orderagain-rail")).toBeTruthy();
  expect(getByTestId("storefront-orderagain-product-5")).toBeTruthy();
  // The rail card's testIDs are namespaced (no collision with the grid's storefront-product-5).
  expect(getByTestId("storefront-product-5")).toBeTruthy();
  // Quick-add from the rail → the cart bar appears.
  expect(queryByTestId("storefront-checkout")).toBeNull();
  fireEvent.press(getByTestId("storefront-orderagain-quickadd-5"));
  expect(getByTestId("storefront-checkout")).toBeTruthy();
});

test("tapping a rail card opens the product detail", () => {
  mockOrders = [
    { id: 100, provider_id: 1, created_at: "2026-08-01", items: [{ product_id: 5 }] },
  ];
  const { getByTestId } = render(<ProviderScreen />);
  fireEvent.press(getByTestId("storefront-orderagain-product-5"));
  expect(getByTestId("storefront-detail-add")).toBeTruthy();
});

test("no rail when the buyer has no order history here", () => {
  mockOrders = [];
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-orderagain-rail")).toBeNull();
});

test("no rail when the previously-ordered product is no longer available", () => {
  // Ordered product 99 isn't in the current catalog → dropped → nothing to show.
  mockOrders = [
    { id: 100, provider_id: 1, created_at: "2026-08-01", items: [{ product_id: 99 }] },
  ];
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-orderagain-rail")).toBeNull();
});

test("orders from a DIFFERENT provider don't populate this provider's rail", () => {
  mockOrders = [
    { id: 100, provider_id: 2, created_at: "2026-08-01", items: [{ product_id: 5 }] },
  ];
  const { queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-orderagain-rail")).toBeNull();
});
