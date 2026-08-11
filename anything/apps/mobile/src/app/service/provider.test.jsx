// Ticket 2.23 — service images on the public provider profile. A service that
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
// carries image_urls renders one <Image testID="service-image"> per URL; a service
// with no images renders none (the storefront shows just the text — no fakes).
// The data hook + router + heavy child components are mocked, so this exercises the
// provider screen's service-rendering wiring only.

import React from "react";
import { render } from "@testing-library/react-native";

let mockProfile;
let mockShopProducts = []; // the inline Items grid's stock-aware products (useShopProducts)

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: "happy-paws" }),
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
jest.mock("@/components/Providers/BookingFormModal", () => () => null);
jest.mock("@/components/Providers/WriteReviewModal", () => () => null);
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/components/Providers/StorefrontCatalog", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: null }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => ({ data: { upcoming: [], past: [] } }),
  useShopProducts: () => ({ data: mockShopProducts, isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useShopOrders: () => ({ data: [] }),
}));

import ProviderScreen from "./provider";

const baseProvider = {
  id: 1,
  slug: "happy-paws",
  name: "Happy Paws Clinic",
  provider_type: "vet",
};

beforeEach(() => {
  mockShopProducts = [];
});

test("renders one image per service image_url", () => {
  mockProfile = {
    data: {
      provider: baseProvider,
      locations: [],
      services: [
        {
          id: 10,
          name: "Grooming",
          price_cents: 5000,
          image_urls: ["https://x/a.png", "https://x/b.png"],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };

  const { getByText, getAllByTestId } = render(<ProviderScreen />);
  expect(getByText("Grooming")).toBeTruthy();
  expect(getAllByTestId("service-image")).toHaveLength(2);
});

test("renders no service images when a service has none (placeholder, no fakes)", () => {
  mockProfile = {
    data: {
      provider: baseProvider,
      locations: [],
      services: [{ id: 11, name: "Checkup", price_cents: 3000, image_urls: [] }],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };

  const { getByText, queryAllByTestId } = render(<ProviderScreen />);
  expect(getByText("Checkup")).toBeTruthy();
  expect(queryAllByTestId("service-image")).toHaveLength(0);
});

// Ticket 2.22 + PR-3b — storefront sections (cover, the inline Items grid, posts).
test("renders the storefront cover, inline product grid, and posts when present", () => {
  // The Items tab is present (profile has products) and the inline grid renders the
  // stock-aware useShopProducts rows.
  mockShopProducts = [
    { id: 20, name: "Kibble", price_cents: 5000, stock_qty: 5, image_urls: ["https://x/k.png"] },
    { id: 21, name: "Toy", price_cents: 1500, stock_qty: 5, image_urls: [] },
  ];
  mockProfile = {
    data: {
      provider: { ...baseProvider, cover_image_url: "https://x/cover.png" },
      locations: [],
      services: [],
      products: [
        { id: 20, name: "Kibble", price_cents: 5000, image_urls: ["https://x/k.png"] },
        { id: 21, name: "Toy", price_cents: 1500, image_urls: [] },
      ],
      posts: [
        { id: 30, body: "Open this weekend!", image_urls: ["https://x/p.png"] },
        { id: 31, body: "Thanks all", image_urls: [] },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };

  const { getByText, getAllByTestId, getByTestId } = render(<ProviderScreen />);
  expect(getByTestId("storefront-cover")).toBeTruthy();
  // Inline browse grid (ProductGridCard) replaces the old storefront-item teaser.
  expect(getByTestId("storefront-product-20")).toBeTruthy();
  expect(getByTestId("storefront-product-21")).toBeTruthy();
  expect(getByText("Kibble")).toBeTruthy();
  // Posts render as a moments-style image grid (ticket 2.93): one tappable tile per post. The
  // image post shows its cover; the text-only post shows its body preview.
  expect(getAllByTestId("storefront-post")).toHaveLength(2);
  expect(getByText("Thanks all")).toBeTruthy(); // the no-image post → text tile
});

test("storefront degrades cleanly: no cover/items/posts → those sections are absent", () => {
  mockProfile = {
    data: {
      provider: baseProvider, // no cover_image_url
      locations: [],
      services: [],
      products: [],
      posts: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };

  const { queryByTestId, queryAllByTestId } = render(<ProviderScreen />);
  expect(queryByTestId("storefront-cover")).toBeNull();
  // No products → no Items tab (and no inline grid).
  expect(queryByTestId("storefront-panel-items")).toBeNull();
  expect(queryAllByTestId("storefront-post")).toHaveLength(0);
});
