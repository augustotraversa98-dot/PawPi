// Storefront header polish (redesign Phase 1, PR-2): the StoreHeader meta row (open-now pill
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
// wired to deriveOpenNow) and the promoted Instagram chip. deriveOpenNow is mocked so the
// open/closed/unknown wiring is deterministic (the util has its own tests). Sticky tab bar is
// covered by provider.tabs.test.jsx; this file re-checks a switch still works.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProfile;
let mockOpenNow;

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
// Deterministic open-now wiring — vary mockOpenNow per test.
jest.mock("@/utils/providerHours", () => ({
  deriveOpenNow: () => mockOpenNow,
}));
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

function profile(providerExtra = {}, { locations = [], services = [] } = {}) {
  return {
    data: {
      provider: {
        id: 1,
        slug: "happy-paws",
        name: "Happy Paws",
        provider_type: "vet",
        ...providerExtra,
      },
      capabilities: ["vet"],
      services,
      products: [],
      posts: [],
      locations,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

const LOC = [{ id: 8, name: "Main", hours_json: { mon: "09:00-17:00" } }];

beforeEach(() => {
  mockOpenNow = null;
});

describe("open-now pill (deriveOpenNow wiring)", () => {
  test("open → pill present with the 'Open now' label", () => {
    mockOpenNow = true;
    mockProfile = profile({}, { locations: LOC });
    const { getByTestId, getByText } = render(<ProviderScreen />);
    expect(getByTestId("storefront-open-now")).toBeTruthy();
    expect(getByText("Open now")).toBeTruthy();
  });

  test("closed → pill present with the 'Closed' label", () => {
    mockOpenNow = false;
    mockProfile = profile({}, { locations: LOC });
    const { getByTestId, getByText } = render(<ProviderScreen />);
    expect(getByTestId("storefront-open-now")).toBeTruthy();
    expect(getByText("Closed")).toBeTruthy();
  });

  test("unknown (null) → no pill", () => {
    mockOpenNow = null;
    mockProfile = profile({}, { locations: LOC });
    const { queryByTestId } = render(<ProviderScreen />);
    expect(queryByTestId("storefront-open-now")).toBeNull();
  });
});

describe("promoted Instagram chip", () => {
  test("present and tappable when instagram_url is set", () => {
    mockProfile = profile({ instagram_url: "https://instagram.com/happypaws" });
    const { getByTestId, getByText } = render(<ProviderScreen />);
    expect(getByTestId("storefront-ig-chip")).toBeTruthy();
    // Handle parsed from the URL.
    expect(getByText("@happypaws")).toBeTruthy();
  });

  test("absent when there is no instagram_url", () => {
    mockProfile = profile({});
    const { queryByTestId } = render(<ProviderScreen />);
    expect(queryByTestId("storefront-ig-chip")).toBeNull();
  });
});

describe("social header identity (ticket 2.93)", () => {
  test("shows the @handle (from slug) and the bio info line", () => {
    mockProfile = profile({ bio: "The friendliest clinic in town" });
    const { getByTestId, getByText, getAllByText } = render(<ProviderScreen />);
    expect(getByTestId("storefront-handle")).toBeTruthy();
    expect(getByText("@happy-paws")).toBeTruthy();
    expect(getByTestId("storefront-bio")).toBeTruthy();
    // The bio shows in the header info line (it also appears in the mounted-but-hidden About
    // panel, so assert on presence, not uniqueness).
    expect(getAllByText("The friendliest clinic in town").length).toBeGreaterThanOrEqual(1);
  });

  test("omits the bio line when there is no bio (no fakes)", () => {
    mockProfile = profile({});
    const { queryByTestId } = render(<ProviderScreen />);
    expect(queryByTestId("storefront-bio")).toBeNull();
    // The @handle still shows (every published provider has a slug).
    expect(queryByTestId("storefront-handle")).toBeTruthy();
  });
});

describe("from-price teaser", () => {
  test("shows the cheapest service price in the header meta row", () => {
    mockProfile = profile(
      {},
      { locations: LOC, services: [{ id: 10, name: "Checkup", price_cents: 3000, image_urls: [] }] },
    );
    const { getAllByText } = render(<ProviderScreen />);
    // "from $30" appears in the header meta row (and the pinned bottom bar too). ARS hides
    // decimals on whole amounts (utils/money).
    expect(getAllByText(/from \$30\b/i).length).toBeGreaterThanOrEqual(1);
  });
});

test("sticky tab bar still switches panels", () => {
  mockProfile = profile(
    {},
    { locations: LOC, services: [{ id: 10, name: "Checkup", price_cents: 3000, image_urls: [] }] },
  );
  const { getByTestId } = render(<ProviderScreen />);
  const display = (el) => el.props.style?.display;
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("none");
  fireEvent.press(getByTestId("storefront-tab-reviews"));
  expect(display(getByTestId("storefront-panel-reviews"))).toBe("flex");
});
