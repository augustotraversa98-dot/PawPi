// Storefront shell (Services Hub P4a): per-type primary action + capability-aware booking.
jest.mock("@/components/Providers/ProviderFollowButton", () => () => null);
jest.mock("@/components/Providers/ClaimCTA", () => () => null);
jest.mock("@/components/Providers/StorefrontPanels/BusinessStatRow", () => () => null);
//   - a grooming-only provider books as `groomer`, telehealth as `telehealth`, vet as `vet`
//     (NOT the book/route 'vet' default);
//   - a multi-capability provider asks which service, then books under THAT capability;
//   - SHOP type shows the Shop CTA (opens the in-storefront catalog), BOOK type shows Book,
//     a both-capabilities provider shows both + capability chips.
// BookingFormModal + StorefrontCatalog are mocked to capture the props the shell passes.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProfile;
let bookingProps;
let catalogShop;
let mockShopProducts = []; // the inline Items grid's stock-aware products (useShopProducts)

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ slug: "happy-paws" }), // no capability param
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/components/Providers/BookingFormModal", () => (props) => {
  bookingProps = props;
  return null;
});
jest.mock("@/components/Providers/StorefrontCatalog", () => (props) => {
  catalogShop = props.shop;
  return null;
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
jest.mock("@/components/Providers/WriteReviewModal", () => () => null);
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
  useShopCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useShopOrders: () => ({ data: [] }),
  useAdoptableBrowse: () => ({ data: { listings: [] } }),
  useApplyForAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAdoptionCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import ProviderScreen from "./provider";

function profileWith({ capabilities = [], products = [], services = [] }) {
  return {
    data: {
      provider: { id: 1, slug: "happy-paws", name: "Happy Paws", provider_type: "vet" },
      locations: [],
      services,
      products,
      posts: [],
      capabilities,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  bookingProps = undefined;
  catalogShop = "unset";
  mockShopProducts = [];
});

describe("capability-aware booking", () => {
  test("a grooming-only provider books as groomer (not the vet default)", () => {
    mockProfile = profileWith({ capabilities: ["groomer"] });
    const { getByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("storefront-book-cta"));
    expect(bookingProps.capability).toBe("groomer");
  });

  test("a telehealth-only provider books as telehealth", () => {
    mockProfile = profileWith({ capabilities: ["telehealth"] });
    const { getByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("storefront-book-cta"));
    expect(bookingProps.capability).toBe("telehealth");
  });

  test("a vet-only provider books as vet", () => {
    mockProfile = profileWith({ capabilities: ["vet"] });
    const { getByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("storefront-book-cta"));
    expect(bookingProps.capability).toBe("vet");
  });

  test("multiple bookable capabilities → chooser → books under the chosen capability", () => {
    mockProfile = profileWith({ capabilities: ["vet", "groomer"] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    // Before choosing, capability is undefined (no default-to-vet).
    expect(bookingProps.capability).toBeUndefined();
    fireEvent.press(getByTestId("storefront-book-cta"));
    // Chooser appears with both options.
    expect(getByTestId("storefront-cap-choose-vet")).toBeTruthy();
    expect(getByTestId("storefront-cap-choose-groomer")).toBeTruthy();
    fireEvent.press(getByTestId("storefront-cap-choose-groomer"));
    expect(bookingProps.capability).toBe("groomer");
  });
});

describe("tap a service to book (feat/tap-service-to-book)", () => {
  const SERVICE = { id: 9, name: "Checkup", price_cents: 3000, image_urls: [] };

  test("single bookable cap (vet): tapping a service preselects it, resolves vet, no chooser", () => {
    mockProfile = profileWith({ capabilities: ["vet"], services: [SERVICE] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("service-row-9"));
    expect(bookingProps.service).toEqual(SERVICE);
    expect(bookingProps.capability).toBe("vet");
    expect(queryByTestId("storefront-cap-choose-vet")).toBeNull();
  });

  test("vet + telehealth: tapping a service resolves vet (telehealth is a modality), NO chooser", () => {
    mockProfile = profileWith({
      capabilities: ["vet", "telehealth"],
      services: [SERVICE],
    });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("service-row-9"));
    expect(bookingProps.service).toEqual(SERVICE);
    expect(bookingProps.capability).toBe("vet");
    expect(queryByTestId("storefront-cap-choose-vet")).toBeNull();
  });

  test("vet + groomer (unrelated): tapping a service opens booking DIRECTLY with it preselected — never the chooser (ticket 2.93 rev)", () => {
    mockProfile = profileWith({
      capabilities: ["vet", "groomer"],
      services: [SERVICE],
    });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("service-row-9"));
    // The service is preselected and the booking form opens straight away…
    expect(bookingProps.service).toEqual(SERVICE);
    // …with NO per-service capability chooser (the service is already the choice).
    expect(queryByTestId("storefront-cap-choose-vet")).toBeNull();
    expect(queryByTestId("storefront-cap-choose-groomer")).toBeNull();
    // Capability isn't forced when it can't be resolved → the modal derives it from the provider.
    expect(bookingProps.capability).toBeUndefined();
  });

  test("with services, the per-card Book replaces the bottom Book CTA (Message remains)", () => {
    mockProfile = profileWith({ capabilities: ["vet"], services: [SERVICE] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    // Bottom from-price Book CTA is gone; the service card carries its own Book.
    expect(queryByTestId("storefront-book-cta")).toBeNull();
    expect(getByTestId("service-book-9")).toBeTruthy();
    // Message stays.
    expect(getByTestId("storefront-message-cta")).toBeTruthy();
  });

  test("a bookable provider with ZERO services keeps the fallback bottom Book (no preselection)", () => {
    mockProfile = profileWith({ capabilities: ["vet"], services: [] });
    const { getByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("storefront-book-cta"));
    expect(bookingProps.service).toBeNull();
  });
});

describe("per-type primary action", () => {
  test("SHOP-only provider shows the Shop CTA, not Book", () => {
    mockProfile = profileWith({ capabilities: ["shop"] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    expect(getByTestId("storefront-shop-cta")).toBeTruthy();
    expect(queryByTestId("storefront-book-cta")).toBeNull();
  });

  test("BOOK-only provider shows Book, not Shop", () => {
    mockProfile = profileWith({ capabilities: ["vet"] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    expect(getByTestId("storefront-book-cta")).toBeTruthy();
    expect(queryByTestId("storefront-shop-cta")).toBeNull();
  });

  test("a both-capabilities provider shows Book + Shop (offering chips removed from the header, ticket 2.93 rev)", () => {
    mockProfile = profileWith({ capabilities: ["vet", "shop"] });
    const { getByTestId, queryByTestId } = render(<ProviderScreen />);
    expect(getByTestId("storefront-book-cta")).toBeTruthy();
    expect(getByTestId("storefront-shop-cta")).toBeTruthy();
    // The in-profile header no longer renders offering chips (they live on Discover cards).
    expect(queryByTestId("provider-cap-vet")).toBeNull();
    expect(queryByTestId("provider-cap-shop")).toBeNull();
  });

  test("products with no capability still count as a SHOP (Shop CTA present)", () => {
    mockProfile = profileWith({
      capabilities: [],
      products: [{ id: 5, name: "Kibble", price_cents: 5000, image_urls: [] }],
    });
    const { getByTestId } = render(<ProviderScreen />);
    expect(getByTestId("storefront-shop-cta")).toBeTruthy();
  });
});

describe("shop entry selects the Items tab (inline storefront)", () => {
  test("tapping Shop makes the Items tab the active panel", () => {
    // A mixed provider (services + shop) defaults to the Services tab, so pressing Shop is an
    // observable switch to the inline Items store (no modal is opened anymore).
    mockProfile = profileWith({
      capabilities: ["vet", "shop"],
      services: [{ id: 9, name: "Checkup", price_cents: 3000, image_urls: [] }],
      products: [{ id: 5, name: "Kibble", price_cents: 5000, image_urls: [] }],
    });
    mockShopProducts = [
      { id: 5, name: "Kibble", price_cents: 5000, stock_qty: 4, image_urls: [] },
    ];
    const { getByTestId } = render(<ProviderScreen />);
    const display = (el) => el.props.style?.display;
    expect(display(getByTestId("storefront-panel-items"))).toBe("none");
    fireEvent.press(getByTestId("storefront-shop-cta"));
    expect(display(getByTestId("storefront-panel-items"))).toBe("flex");
  });
});
