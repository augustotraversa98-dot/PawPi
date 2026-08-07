// Storefront shell (Services Hub P4a): per-type primary action + capability-aware booking.
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

  test("vet + groomer (unrelated): tapping a service shows the chooser, then preselects the service", () => {
    mockProfile = profileWith({
      capabilities: ["vet", "groomer"],
      services: [SERVICE],
    });
    const { getByTestId } = render(<ProviderScreen />);
    fireEvent.press(getByTestId("service-row-9"));
    // The service is already carried through while the chooser is open.
    expect(bookingProps.service).toEqual(SERVICE);
    expect(getByTestId("storefront-cap-choose-vet")).toBeTruthy();
    expect(getByTestId("storefront-cap-choose-groomer")).toBeTruthy();
    fireEvent.press(getByTestId("storefront-cap-choose-groomer"));
    expect(bookingProps.capability).toBe("groomer");
    expect(bookingProps.service).toEqual(SERVICE);
  });

  test("the bottom Book button opens booking with NO preselected service", () => {
    mockProfile = profileWith({ capabilities: ["vet"], services: [SERVICE] });
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

  test("a both-capabilities provider shows Book + Shop and capability chips", () => {
    mockProfile = profileWith({ capabilities: ["vet", "shop"] });
    const { getByTestId } = render(<ProviderScreen />);
    expect(getByTestId("storefront-book-cta")).toBeTruthy();
    expect(getByTestId("storefront-shop-cta")).toBeTruthy();
    expect(getByTestId("provider-cap-vet")).toBeTruthy();
    expect(getByTestId("provider-cap-shop")).toBeTruthy();
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
