// Storefront redesign PR-3b: the Items tab IS the store — an inline browse grid with a quick
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
// "+" add, a screen-level cart bar + checkout, and tap-card → product detail, all backed by the
// shared useStorefrontCart (StorefrontCatalog modal is no longer opened from provider.jsx). The
// products + checkout hooks are mocked; i18n resolves real en.json.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockProfile;
let mockShopProducts;
const mockCheckout = jest.fn();

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
// The checkout sheet's delivery branch uses the map picker; stub it (as the catalog test does).
jest.mock("@/components/Map/LocationField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onChange, value }) => (
    <TouchableOpacity
      testID="mock-location-field"
      onPress={() => onChange({ lat: 1, lng: 2, address: "123 Test St" })}
    >
      <Text>{value?.address || "no-address"}</Text>
    </TouchableOpacity>
  );
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
  useWalkCredits: () => ({ data: { remaining: 0 } }),
  useBuyWalkPackage: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWalkPickupToken: () => ({ data: null, isLoading: false, isError: false, refetch: jest.fn() }),
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => ({ data: { upcoming: [], past: [] } }),
  useShopProducts: () => ({ data: mockShopProducts, isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: mockCheckout, isPending: false }),
  useShopOrders: () => ({ data: [] }),
  useAdoptableBrowse: () => ({ data: { listings: [] } }),
  useApplyForAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAdoptionCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import ProviderScreen from "./provider";

// A pure shop → the Items tab is the default (first) active tab.
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

let alertSpy;
let openSpy;
beforeEach(() => {
  mockProfile = shopProfile();
  mockShopProducts = [
    { id: 5, name: "Kibble", price_cents: 500000, currency: "ARS", stock_qty: 5, image_urls: [] },
    { id: 6, name: "Sold Out", price_cents: 100000, currency: "ARS", stock_qty: 0, image_urls: [] },
  ];
  mockCheckout.mockReset();
  mockCheckout.mockResolvedValue({ checkoutUrl: null });
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue();
});
afterEach(() => {
  alertSpy.mockRestore();
  openSpy.mockRestore();
});

test("the Items tab renders the inline grid with a quick-add on in-stock cards only", () => {
  const { getByTestId, queryByTestId } = render(<ProviderScreen />);
  expect(getByTestId("storefront-product-5")).toBeTruthy();
  expect(getByTestId("storefront-quickadd-5")).toBeTruthy();
  // A sold-out product has no quick-add.
  expect(queryByTestId("storefront-quickadd-6")).toBeNull();
});

test("quick '+' adds to the cart and the cart bar appears", () => {
  const { getByTestId, queryByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-checkout")).toBeNull(); // no cart bar yet
  fireEvent.press(getByTestId("storefront-quickadd-5"));
  expect(getByTestId("storefront-checkout")).toBeTruthy();
  expect(getByTestId("storefront-qty-5")).toBeTruthy(); // qty badge shows
});

test("tapping a card opens the product detail", () => {
  const { getByTestId } = render(<ProviderScreen />);
  fireEvent.press(getByTestId("storefront-product-5"));
  // ProductDetail add-to-cart appears once a product is open.
  expect(getByTestId("storefront-detail-add")).toBeTruthy();
});

test("checkout reaches useShopCheckout with the unchanged pickup payload", async () => {
  const { getByTestId } = render(<ProviderScreen />);
  fireEvent.press(getByTestId("storefront-quickadd-5"));
  fireEvent.press(getByTestId("storefront-checkout")); // open the checkout sheet
  fireEvent.press(getByTestId("storefront-pay")); // default pickup
  await waitFor(() => expect(mockCheckout).toHaveBeenCalledTimes(1));
  const payload = mockCheckout.mock.calls[0][0];
  expect(payload.rail).toBe("mercadopago");
  expect(payload.fulfillment_type).toBe("pickup");
  expect(payload.shipping_address).toBeNull();
  expect(payload.items).toEqual([{ product_id: 5, quantity: 1 }]);
});

test("the pinned bottom action bar (Shop CTA) still renders alongside the cart bar", () => {
  const { getByTestId } = render(<ProviderScreen />);
  fireEvent.press(getByTestId("storefront-quickadd-5"));
  // Cart bar + the untouched bottom action bar coexist.
  expect(getByTestId("storefront-checkout")).toBeTruthy();
  expect(getByTestId("storefront-shop-cta")).toBeTruthy();
});
