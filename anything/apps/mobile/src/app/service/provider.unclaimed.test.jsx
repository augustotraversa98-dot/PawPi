// A listing nobody has claimed offers no action that sends something to it: no Book (on a service row or in the
// bottom bar), no Message, no Shop. It says why, and keeps the claim call-to-action. A claimed business is unchanged.

import React from "react";
import { render } from "@testing-library/react-native";

let mockProfile;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: "seeded-vet" }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { Video: (props) => <View testID={props.testID} />, ResizeMode: { CONTAIN: "contain" } };
});
jest.mock("@/components/Map/MapLocationView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: (props) => <View testID={props.testID} /> };
});
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/BookingFormModal", () => () => null);
jest.mock("@/components/Providers/WriteReviewModal", () => () => null);
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/components/Providers/StorefrontCatalog", () => () => null);
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/ClaimCTA", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View testID="claim-cta-stub" /> };
});
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: null }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderReviews: () => ({ data: [] }),
  useStartThread: () => ({ mutate: jest.fn(), isPending: false }),
  useMyBookings: () => ({ data: { upcoming: [], past: [] } }),
  useShopProducts: () => ({ data: [], isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useShopOrders: () => ({ data: [] }),
  useAdoptableBrowse: () => ({ data: { listings: [] } }),
  useApplyForAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAdoptionCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWalkCredits: () => ({ data: { remaining: 0 } }),
  useBuyWalkPackage: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWalkPickupToken: () => ({ data: null, isLoading: false, isError: false, refetch: jest.fn() }),
}));

import ProviderScreen from "./provider";

const SERVICE = { id: 10, name: "Consulta", price_cents: null, image_urls: [] };

function profile(claimStatus, { services = [SERVICE], capabilities = ["vet"] } = {}) {
  return {
    data: {
      provider: { id: 8, slug: "seeded-vet", name: "Seeded Vet", provider_type: "vet", claim_status: claimStatus },
      locations: [],
      services,
      capabilities,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

test("an unclaimed listing shows its services with no way to book or message, and says why", () => {
  mockProfile = profile("unclaimed");
  const screen = render(<ProviderScreen />);

  expect(screen.getByText("Consulta")).toBeTruthy();
  expect(screen.queryByTestId("service-book-10")).toBeNull();
  expect(screen.queryByTestId("service-row-10")).toBeNull();
  expect(screen.queryByTestId("storefront-message-cta")).toBeNull();
  expect(screen.getByTestId("provider-unclaimed-notice")).toBeTruthy();
  expect(screen.getByTestId("claim-cta-stub")).toBeTruthy();
});

test("an unclaimed listing with no services has no bottom Book button", () => {
  mockProfile = profile("unclaimed", { services: [] });
  const screen = render(<ProviderScreen />);
  expect(screen.queryByTestId("storefront-book-cta")).toBeNull();
});

test("an unclaimed shop has no Shop button", () => {
  mockProfile = profile("unclaimed", { services: [], capabilities: ["shop"] });
  const screen = render(<ProviderScreen />);
  expect(screen.queryByTestId("storefront-shop-cta")).toBeNull();
});

test.each([["claimed"], [null], [undefined]])(
  "a business with claim_status %s keeps Book and Message",
  (claimStatus) => {
    mockProfile = profile(claimStatus);
    const screen = render(<ProviderScreen />);

    expect(screen.getByTestId("service-book-10")).toBeTruthy();
    expect(screen.getByTestId("storefront-message-cta")).toBeTruthy();
    expect(screen.queryByTestId("provider-unclaimed-notice")).toBeNull();
  },
);
